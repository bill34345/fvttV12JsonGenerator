import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, existsSync } from 'node:fs';
import {
  cp,
  copyFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { assertInsideLabRoot, type FoundryLabConfig } from './config';
import { runCommand } from './process';

export interface LocalPackageSource {
  id: string;
  expectedVersion: string;
  sourcePath: string;
}

export interface LocalSourceFileEntry {
  relativePath: string;
  size: number;
  sha256: string;
}

export interface LocalSourceAction extends LocalPackageSource {
  destination: string;
  sourceKind: 'directory' | 'archive' | 'unknown';
  status: 'planned' | 'installed' | 'failed' | 'unresolved';
  sourceSha256?: string;
  sourceInventory?: LocalSourceFileEntry[];
  error?: string;
}

export interface LocalSourceReport {
  apply: boolean;
  actions: LocalSourceAction[];
  installed: number;
  unresolved: number;
  failed: number;
  complete: boolean;
}

export interface LocalSourceOptions {
  apply: boolean;
  onProgress?: (message: string) => void;
}

export interface LocalSourceDependencies {
  runCommand: typeof runCommand;
  copyFile: typeof copyFile;
}

interface ArchiveEntry {
  path: string;
  folder: boolean;
  encrypted: boolean;
}

class UnresolvedLocalSourceError extends Error {}

interface PreparedLocalSource {
  source: LocalPackageSource;
  destination: string;
  staging: string;
  extractionRoot: string;
  backup: string;
}

function safePackageId(value: string): string {
  const windowsBasename = value.split('.', 1)[0]?.toUpperCase();
  const reserved = windowsBasename !== undefined
    && /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(windowsBasename);
  if (!value
    || value === '.'
    || value === '..'
    || /[<>:"/\\|?*\u0000-\u001f]/.test(value)
    || /[. ]$/.test(value)
    || reserved) {
    throw new Error(`Package id is not a safe path segment: ${value}`);
  }
  return value;
}

function windowsCollisionKey(value: string): string {
  return resolve(value).replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase();
}

function pathsOverlap(left: string, right: string): boolean {
  const leftKey = windowsCollisionKey(left);
  const rightKey = windowsCollisionKey(right);
  return leftKey === rightKey
    || leftKey.startsWith(`${rightKey}\\`)
    || rightKey.startsWith(`${leftKey}\\`);
}

async function resolveThroughExistingAncestor(target: string): Promise<string> {
  let existingAncestor = resolve(target);
  const missingSegments: string[] = [];
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) return resolve(existingAncestor, ...missingSegments.reverse());
    missingSegments.push(basename(existingAncestor));
    existingAncestor = parent;
  }
  return resolve(await realpath(existingAncestor), ...missingSegments.reverse());
}

async function assertSourceOutsideTransactionPaths(
  config: FoundryLabConfig,
  prepared: PreparedLocalSource,
): Promise<void> {
  const source = await resolveThroughExistingAncestor(prepared.source.sourcePath);
  const protectedPaths = [
    config.labRoot,
    prepared.destination,
    prepared.staging,
    prepared.extractionRoot,
    prepared.backup,
  ];
  for (const protectedPath of protectedPaths) {
    const canonicalProtected = await resolveThroughExistingAncestor(protectedPath);
    if (pathsOverlap(source, canonicalProtected)) {
      throw new Error(
        `Local source overlaps Foundry lab transaction path: ${prepared.source.sourcePath}`,
      );
    }
  }
}

function assertNoCaseInsensitiveCollisions(prepared: PreparedLocalSource[]): void {
  const ids = new Map<string, string>();
  const destinations = new Map<string, string>();
  for (const entry of prepared) {
    const idKey = entry.source.id.toLowerCase();
    const priorId = ids.get(idKey);
    if (priorId !== undefined) {
      throw new Error(`Local source ID case-insensitive collision: ${priorId} / ${entry.source.id}`);
    }
    ids.set(idKey, entry.source.id);

    const destinationKey = windowsCollisionKey(entry.destination);
    const priorDestination = destinations.get(destinationKey);
    if (priorDestination !== undefined) {
      throw new Error(
        `Local source destination collision: ${priorDestination} / ${entry.destination}`,
      );
    }
    destinations.set(destinationKey, entry.destination);
  }
}

export function archivePasswordEnvName(id: string): string {
  return `FOUNDRY_LAB_ARCHIVE_PASSWORD_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

export function validateLocalArchiveEntries(entries: string[]): void {
  for (const raw of entries) {
    const normalized = raw.replaceAll('\\', '/');
    const segments = normalized.split('/').filter((segment) => segment.length > 0);
    if (!normalized
      || normalized.startsWith('/')
      || normalized.startsWith('//')
      || /^[a-zA-Z]:/.test(normalized)
      || normalized.includes(':')
      || segments.includes('..')) {
      throw new Error(`Source archive contains an unsafe archive path: ${raw}`);
    }
  }
}

export function findArchivePackageRoot(entries: string[]): string {
  validateLocalArchiveEntries(entries);
  const candidates = entries
    .map((entry) => entry.replaceAll('\\', '/').replace(/\/$/, ''))
    .filter((entry) => entry === 'module.json' || entry.endsWith('/module.json'));
  if (candidates.length !== 1) {
    throw new Error(`Source archive must contain exactly one candidate module.json, received ${candidates.length}`);
  }
  const candidate = candidates[0]!;
  if (candidate === 'module.json') return '';
  const segments = candidate.split('/');
  if (segments.length !== 2) {
    throw new Error('Source archive module.json must be at root or inside exactly one wrapper directory');
  }
  return segments[0]!;
}

function parse7zListing(stdout: string): ArchiveEntry[] {
  const separator = stdout.indexOf('----------');
  if (separator < 0) throw new Error('7z listing did not contain an entry separator');
  const body = stdout.slice(separator + '----------'.length).trim();
  if (!body) throw new Error('7z listing contains no archive entries');
  return body.split(/\r?\n\s*\r?\n/).map((block, index) => {
    const fields = new Map<string, string>();
    for (const line of block.split(/\r?\n/)) {
      const marker = line.indexOf(' = ');
      if (marker > 0) fields.set(line.slice(0, marker), line.slice(marker + 3));
    }
    const path = fields.get('Path');
    if (!path) throw new Error(`7z listing entry ${index} has no Path`);
    return {
      path,
      folder: fields.get('Folder') === '+',
      encrypted: fields.get('Encrypted') === '+',
    };
  });
}

async function sha256File(path: string): Promise<string> {
  return await new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function directoryInventory(root: string): Promise<LocalSourceFileEntry[]> {
  const result: LocalSourceFileEntry[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Local source contains a symbolic link: ${fullPath}`);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) {
        const info = await stat(fullPath);
        result.push({
          relativePath: relative(root, fullPath).split(sep).join('/'),
          size: info.size,
          sha256: await sha256File(fullPath),
        });
      }
    }
  }
  await walk(root);
  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function locateDirectoryPackageRoot(sourcePath: string): Promise<string> {
  if (existsSync(join(sourcePath, 'module.json'))) return sourcePath;
  const wrappers: string[] = [];
  for (const entry of await readdir(sourcePath, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Local source contains a symbolic link: ${join(sourcePath, entry.name)}`);
    if (entry.isDirectory() && existsSync(join(sourcePath, entry.name, 'module.json'))) {
      wrappers.push(join(sourcePath, entry.name));
    }
  }
  if (wrappers.length !== 1) {
    throw new Error(`Directory source must contain exactly one package root, received ${wrappers.length}`);
  }
  return wrappers[0]!;
}

function parseManifest(text: string, expectedId: string, expectedVersion: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Local source module.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Local source module.json must be an object');
  }
  const manifest = parsed as Record<string, unknown>;
  if (manifest.id !== expectedId || String(manifest.version) !== expectedVersion) {
    throw new Error(
      `Local source identity mismatch: expected ${expectedId}@${expectedVersion}, `
      + `received ${String(manifest.id ?? '<missing>')}@${String(manifest.version ?? '<missing>')}`,
    );
  }
}

function sevenZipExecutable(): string {
  const configured = process.env.FOUNDRY_LAB_7Z;
  if (configured) return configured;
  const programFiles = process.env.ProgramFiles;
  if (programFiles) {
    const candidate = join(programFiles, '7-Zip/7z.exe');
    if (existsSync(candidate)) return candidate;
  }
  return '7z.exe';
}

function passwordArguments(password: string | undefined): string[] {
  return password === undefined ? [] : [`-p${password}`];
}

function safeCommandError(result: { stderr: string; stdout: string }, fallback: string): string {
  return result.stderr.trim() || result.stdout.trim() || fallback;
}

async function inspectArchive(
  source: LocalPackageSource,
  archivePath: string,
  execute: typeof runCommand,
  cwd: string,
): Promise<{ entries: ArchiveEntry[]; root: string; manifestText: string; password?: string }> {
  const passwordName = archivePasswordEnvName(source.id);
  const password = process.env[passwordName];
  const redact = password === undefined ? [] : [password];
  const executable = sevenZipExecutable();
  const list = await execute(
    executable,
    ['l', '-slt', '-scsUTF-8', ...passwordArguments(password), archivePath],
    { cwd, timeoutMs: 30 * 60_000, redact },
  );
  if (list.exitCode !== 0) {
    const message = safeCommandError(list, `7z could not list ${basename(source.sourcePath)}`);
    if (password === undefined && /password|encrypted|wrong password/i.test(message)) {
      throw new UnresolvedLocalSourceError(`Encrypted archive requires runtime environment variable ${passwordName}`);
    }
    throw new Error(message);
  }
  const entries = parse7zListing(list.stdout);
  validateLocalArchiveEntries(entries.map((entry) => entry.path));
  if (entries.some((entry) => entry.encrypted) && password === undefined) {
    throw new UnresolvedLocalSourceError(`Encrypted archive requires runtime environment variable ${passwordName}`);
  }
  const root = findArchivePackageRoot(entries.filter((entry) => !entry.folder).map((entry) => entry.path));
  const manifestPath = root ? `${root}/module.json` : 'module.json';
  const manifest = await execute(
    executable,
    ['e', '-so', '-y', ...passwordArguments(password), archivePath, manifestPath],
    { cwd, timeoutMs: 30 * 60_000, redact },
  );
  if (manifest.exitCode !== 0) {
    const message = safeCommandError(manifest, `7z could not read ${manifestPath}`);
    if (password === undefined && /password|encrypted|wrong password/i.test(message)) {
      throw new UnresolvedLocalSourceError(`Encrypted archive requires runtime environment variable ${passwordName}`);
    }
    throw new Error(message);
  }
  parseManifest(manifest.stdout, source.id, source.expectedVersion);
  return { entries, root, manifestText: manifest.stdout, password };
}

async function createImmutableArchiveSnapshot(
  config: FoundryLabConfig,
  source: LocalPackageSource,
  copy: typeof copyFile,
): Promise<{
  root: string;
  path: string;
  sha256: string;
  labRootExisted: boolean;
  labParentExisted: boolean;
}> {
  const preHash = await sha256File(source.sourcePath);
  const snapshotsRoot = join(config.labRoot, '.local-source-snapshots');
  const root = join(snapshotsRoot, `${source.id}-${randomUUID()}`);
  const path = join(root, 'archive.snapshot.part');
  const labRootExisted = existsSync(config.labRoot);
  const labParentExisted = existsSync(dirname(config.labRoot));
  for (const candidate of [snapshotsRoot, root, path]) assertInsideLabRoot(config, candidate);
  try {
    await mkdir(root, { recursive: true });
    await copy(source.sourcePath, path, constants.COPYFILE_EXCL);
    const [postHash, snapshotHash] = await Promise.all([
      sha256File(source.sourcePath),
      sha256File(path),
    ]);
    if (postHash !== preHash || snapshotHash !== preHash) {
      throw new Error(`Local source archive changed while creating immutable snapshot: ${basename(source.sourcePath)}`);
    }
    return { root, path, sha256: preHash, labRootExisted, labParentExisted };
  } catch (error) {
    await cleanupArchiveSnapshot(config, { root, labRootExisted, labParentExisted });
    throw error;
  }
}

async function cleanupArchiveSnapshot(
  config: FoundryLabConfig,
  snapshot: { root: string; labRootExisted: boolean; labParentExisted: boolean },
): Promise<void> {
  await rm(snapshot.root, { recursive: true, force: true });
  await removeEmptyDirectory(dirname(snapshot.root));
  if (!snapshot.labRootExisted) await removeEmptyDirectory(config.labRoot);
  if (!snapshot.labParentExisted) await removeEmptyDirectory(dirname(config.labRoot));
}

async function removeEmptyDirectory(path: string): Promise<void> {
  try {
    await rmdir(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error;
  }
}

async function assertArchiveSourceHash(sourcePath: string, expected: string, phase: string): Promise<void> {
  if (await sha256File(sourcePath) !== expected) {
    throw new Error(`Local source archive changed ${phase}: ${basename(sourcePath)}`);
  }
}

async function replaceDirectory(config: FoundryLabConfig, staging: string, destination: string): Promise<void> {
  const backup = `${destination}.previous`;
  for (const path of [staging, destination, backup]) assertInsideLabRoot(config, path);
  await mkdir(dirname(destination), { recursive: true });
  if (existsSync(backup) && !existsSync(destination)) await rename(backup, destination);
  if (existsSync(backup)) await rm(backup, { recursive: true, force: true });
  let movedOld = false;
  if (existsSync(destination)) {
    await rename(destination, backup);
    movedOld = true;
  }
  try {
    await rename(staging, destination);
  } catch (error) {
    if (movedOld && !existsSync(destination) && existsSync(backup)) await rename(backup, destination);
    throw error;
  }
  if (existsSync(backup)) await rm(backup, { recursive: true, force: true });
}

function inventoriesEqual(left: LocalSourceFileEntry[], right: LocalSourceFileEntry[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function readLocalSourceMappings(config: FoundryLabConfig): Promise<LocalPackageSource[]> {
  const path = join(config.inventoryRoot, 'local-package-sources.json');
  assertInsideLabRoot(config, path);
  const text = await readFile(path, 'utf8');
  const parsed = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('local-package-sources.json must be an array');
  const ids = new Map<string, string>();
  return parsed.map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`Local source mapping ${index} is not an object`);
    }
    const entry = value as Record<string, unknown>;
    if (Object.keys(entry).some((key) => /password|token|secret/i.test(key))) {
      throw new Error(`Local source mapping ${index} contains a forbidden secret field`);
    }
    const allowed = new Set(['id', 'expectedVersion', 'sourcePath']);
    const unknown = Object.keys(entry).filter((key) => !allowed.has(key));
    if (unknown.length > 0) throw new Error(`Local source mapping ${index} has unknown fields: ${unknown.join(', ')}`);
    if (typeof entry.id !== 'string') throw new Error(`Local source mapping ${index} has invalid id`);
    const id = safePackageId(entry.id);
    const idKey = id.toLowerCase();
    const priorId = ids.get(idKey);
    if (priorId !== undefined) {
      throw new Error(`Local source mapping has case-insensitive ID collision: ${priorId} / ${id}`);
    }
    ids.set(idKey, id);
    if (typeof entry.expectedVersion !== 'string' || !entry.expectedVersion) {
      throw new Error(`Local source mapping ${index} has invalid expectedVersion`);
    }
    if (typeof entry.sourcePath !== 'string' || !isAbsolute(entry.sourcePath)) {
      throw new Error(`Local source mapping ${index} sourcePath must be absolute`);
    }
    return { id, expectedVersion: entry.expectedVersion, sourcePath: resolve(entry.sourcePath) };
  });
}

export async function acquireLocalSources(
  config: FoundryLabConfig,
  sources: LocalPackageSource[],
  options: LocalSourceOptions = { apply: false },
  dependencies: Partial<LocalSourceDependencies> = {},
): Promise<LocalSourceReport> {
  const execute = dependencies.runCommand ?? runCommand;
  const copy = dependencies.copyFile ?? copyFile;
  const actions: LocalSourceAction[] = [];
  let installed = 0;
  let unresolved = 0;
  let failed = 0;

  const preparedSources: PreparedLocalSource[] = sources.map((rawSource) => {
    const source: LocalPackageSource = {
      id: safePackageId(rawSource.id),
      expectedVersion: rawSource.expectedVersion,
      sourcePath: resolve(rawSource.sourcePath),
    };
    const destination = resolve(config.profiles.serverMirror.dataPath, 'Data/modules', source.id);
    const staging = `${destination}.local-source-staging`;
    const extractionRoot = `${staging}.extract`;
    const backup = `${destination}.previous`;
    for (const path of [destination, staging, extractionRoot, backup]) assertInsideLabRoot(config, path);
    return { source, destination, staging, extractionRoot, backup };
  });
  assertNoCaseInsensitiveCollisions(preparedSources);
  for (const prepared of preparedSources) await assertSourceOutsideTransactionPaths(config, prepared);

  for (const prepared of preparedSources) {
    const { source, destination, staging, extractionRoot } = prepared;
    const action: LocalSourceAction = {
      ...source,
      destination,
      sourceKind: 'unknown',
      status: 'planned',
    };
    actions.push(action);
    let snapshot: Awaited<ReturnType<typeof createImmutableArchiveSnapshot>> | null = null;
    try {
      if (!isAbsolute(source.sourcePath)) throw new Error(`Local source path must be absolute: ${source.sourcePath}`);
      const info = await stat(source.sourcePath);
      let packageRoot: string;
      let expectedInventory: LocalSourceFileEntry[] | null = null;
      let archive: Awaited<ReturnType<typeof inspectArchive>> | null = null;
      if (info.isDirectory()) {
        action.sourceKind = 'directory';
        packageRoot = await locateDirectoryPackageRoot(source.sourcePath);
        parseManifest(await readFile(join(packageRoot, 'module.json'), 'utf8'), source.id, source.expectedVersion);
        expectedInventory = await directoryInventory(packageRoot);
        action.sourceInventory = expectedInventory;
      } else if (info.isFile() && ['.zip', '.7z', '.rar'].includes(extname(source.sourcePath).toLowerCase())) {
        action.sourceKind = 'archive';
        snapshot = await createImmutableArchiveSnapshot(config, source, copy);
        action.sourceSha256 = snapshot.sha256;
        archive = await inspectArchive(source, snapshot.path, execute, config.repoRoot);
        await assertArchiveSourceHash(snapshot.path, snapshot.sha256, 'during immutable snapshot inspection');
        await assertArchiveSourceHash(source.sourcePath, snapshot.sha256, 'after immutable snapshot inspection');
        packageRoot = '';
      } else {
        throw new Error(`Unsupported local source type: ${source.sourcePath}`);
      }

      if (!options.apply) continue;
      await rm(staging, { recursive: true, force: true });
      await rm(extractionRoot, { recursive: true, force: true });
      try {
        if (archive !== null) {
          await mkdir(extractionRoot, { recursive: true });
          const password = archive.password;
          const extraction = await execute(
            sevenZipExecutable(),
            ['x', '-y', `-o${extractionRoot}`, ...passwordArguments(password), snapshot!.path],
            {
              cwd: config.repoRoot,
              timeoutMs: 4 * 60 * 60_000,
              redact: password === undefined ? [] : [password],
            },
          );
          if (extraction.exitCode !== 0) {
            throw new Error(safeCommandError(extraction, `7z could not extract ${basename(source.sourcePath)}`));
          }
          await assertArchiveSourceHash(snapshot!.path, snapshot!.sha256, 'inside immutable snapshot');
          await assertArchiveSourceHash(source.sourcePath, snapshot!.sha256, 'after immutable snapshot extraction');
          packageRoot = archive.root ? join(extractionRoot, archive.root) : extractionRoot;
          parseManifest(await readFile(join(packageRoot, 'module.json'), 'utf8'), source.id, source.expectedVersion);
          expectedInventory = await directoryInventory(packageRoot);
          action.sourceInventory = expectedInventory;
        }
        await cp(packageRoot, staging, { recursive: true, force: true, preserveTimestamps: true });
        parseManifest(await readFile(join(staging, 'module.json'), 'utf8'), source.id, source.expectedVersion);
        const stagedInventory = await directoryInventory(staging);
        if (expectedInventory === null || !inventoriesEqual(expectedInventory, stagedInventory)) {
          throw new Error(`Staged local source inventory mismatch for ${source.id}`);
        }
        await replaceDirectory(config, staging, destination);
        parseManifest(await readFile(join(destination, 'module.json'), 'utf8'), source.id, source.expectedVersion);
        action.status = 'installed';
        installed += 1;
        options.onProgress?.(`installed ${source.id}@${source.expectedVersion} from local ${action.sourceKind}`);
      } finally {
        await rm(extractionRoot, { recursive: true, force: true });
      }
    } catch (error) {
      action.status = error instanceof UnresolvedLocalSourceError ? 'unresolved' : 'failed';
      action.error = error instanceof Error ? error.message : String(error);
      if (action.status === 'unresolved') unresolved += 1;
      else failed += 1;
      if (options.apply) await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      options.onProgress?.(`${action.status} ${source.id}@${source.expectedVersion}: ${action.error}`);
    } finally {
      if (snapshot !== null) {
        await cleanupArchiveSnapshot(config, snapshot);
      }
    }
  }

  const report: LocalSourceReport = {
    apply: options.apply,
    actions,
    installed,
    unresolved,
    failed,
    complete: options.apply && failed === 0 && unresolved === 0
      && actions.every((action) => action.status === 'installed'),
  };
  if (options.apply) {
    const reportPath = join(config.inventoryRoot, 'local-source-report.json');
    const partPath = `${reportPath}.part`;
    for (const path of [config.inventoryRoot, reportPath, partPath]) assertInsideLabRoot(config, path);
    await mkdir(config.inventoryRoot, { recursive: true });
    await rm(partPath, { force: true });
    await writeFile(partPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await rename(partPath, reportPath);
  }
  return report;
}
