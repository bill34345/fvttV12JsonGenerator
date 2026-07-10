import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import {
  cp,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assertInsideLabRoot, type FoundryLabConfig } from './config';
import { runCommand } from './process';
import type { ClassifiedPackage } from './types';

export type AcquisitionAction =
  | { kind: 'download'; id: string; expectedVersion: string; url: string; destination: string }
  | { kind: 'authorized-manual-install'; id: string; expectedVersion: string; reason: string }
  | { kind: 'scp-directory'; id: string; expectedVersion: string; remoteFolder: string; destination: string }
  | { kind: 'manual-review'; id: string; expectedVersion: string; reason: string };

export interface AcquisitionReport {
  apply: boolean;
  actions: Array<AcquisitionAction & {
    status: 'planned' | 'installed' | 'unresolved' | 'failed';
    error?: string;
    excludedRuntimeLocks?: string[];
  }>;
  installed: number;
  unresolved: number;
  failed: number;
  complete: boolean;
}

export interface AcquisitionOptions {
  apply: boolean;
  onProgress?: (message: string) => void;
}

interface PackageManifest {
  id?: unknown;
  version?: unknown;
  download?: unknown;
}

interface InstallArchiveArguments {
  url: string;
  archivePath: string;
  stagingRoot: string;
  expectedId: string;
  expectedVersion: string;
  config: FoundryLabConfig;
}

export interface AcquisitionDependencies {
  readDnd5eManifest: () => Promise<PackageManifest>;
  installArchive: (input: InstallArchiveArguments) => Promise<void>;
  copyRemoteDirectory: (
    config: FoundryLabConfig,
    remoteFolder: string,
    stagingRoot: string,
  ) => Promise<{ bytes: number; excludedRuntimeLocks: string[] }>;
  copyPersistentStorage: (
    config: FoundryLabConfig,
    remoteFolder: string,
    destination: string,
  ) => Promise<{ files: number; bytes: number }>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function requireHttpsUrl(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
  return parsed;
}

export async function downloadHttpsArchive(
  initialUrl: string,
  destination: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 5 * 60_000,
): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = requireHttpsUrl(initialUrl, 'Package download URL');
    let response: Response | null = null;
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      response = await fetchImpl(current.href, { redirect: 'manual', signal: controller.signal });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      if (!location) throw new Error(`Package download redirect has no location: ${current.href}`);
      current = requireHttpsUrl(new URL(location, current).href, 'Package download redirect');
      response = null;
    }
    if (response === null) throw new Error('Package download exceeded five redirects');
    if (!response.ok) throw new Error(`Package download failed (${response.status}) for ${current.href}`);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('text/html')) throw new Error(`Package download returned HTML for ${current.href}`);
    if (!response.body) throw new Error(`Package download returned an empty archive for ${current.href}`);

    await rm(destination, { force: true });
    await pipeline(
      Readable.fromWeb(response.body as never),
      createWriteStream(destination, { flags: 'wx' }),
    );
    const size = (await stat(destination)).size;
    if (size === 0) {
      await rm(destination, { force: true });
      throw new Error(`Package download returned an empty archive for ${current.href}`);
    }
    const handle = await open(destination, 'r');
    try {
      const signature = Buffer.alloc(4);
      const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
      if (bytesRead < 2 || signature[0] !== 0x50 || signature[1] !== 0x4b) {
        throw new Error(`Package download is not a ZIP archive for ${current.href}`);
      }
    } catch (error) {
      await rm(destination, { force: true });
      throw error;
    } finally {
      await handle.close();
    }
    return size;
  } catch (error) {
    if (controller.signal.aborted) {
      const downloadedBytes = existsSync(destination) ? (await stat(destination)).size : 0;
      await rm(destination, { force: true }).catch(() => undefined);
      throw new Error(
        `Package download timed out after ${timeoutMs}ms with ${downloadedBytes} bytes for ${initialUrl}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function validateArchiveIdentity(
  expected: { expectedId: string; expectedVersion: string },
  manifest: PackageManifest,
): void {
  if (manifest.id !== expected.expectedId || String(manifest.version) !== expected.expectedVersion) {
    throw new Error(
      `Package identity mismatch: expected ${expected.expectedId}@${expected.expectedVersion}, `
      + `received ${String(manifest.id ?? '<missing>')}@${String(manifest.version ?? '<missing>')}`,
    );
  }
}

function safeSegment(value: string, label: string): string {
  const windowsBasename = value.split('.', 1)[0]?.toUpperCase();
  const reserved = windowsBasename !== undefined
    && /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(windowsBasename);
  if (!value
    || value === '.'
    || value === '..'
    || /[<>:"/\\|?*\u0000-\u001f]/.test(value)
    || /[. ]$/.test(value)
    || reserved) {
    throw new Error(`${label} is not a safe path segment: ${value}`);
  }
  return value;
}

export function buildAcquisitionActions(classified: ClassifiedPackage[]): AcquisitionAction[] {
  return classified.map((entry): AcquisitionAction => {
    const id = safeSegment(entry.active.id, 'Package id');
    const expectedVersion = entry.active.version;
    const destination = `.local/foundry-v14/data/server-mirror/Data/modules/${id}`;
    if (entry.packageClass === 'upstream-exact') {
      const url = entry.disk?.download;
      if (typeof url !== 'string') throw new Error(`Upstream package ${id} has no download URL`);
      requireHttpsUrl(url, `Download URL for ${id}`);
      return { kind: 'download', id, expectedVersion, url, destination };
    }
    if (entry.packageClass === 'account-protected') {
      return {
        kind: 'authorized-manual-install', id, expectedVersion,
        reason: entry.reasons.join('; ') || 'Use the authorized Foundry package interface',
      };
    }
    if (entry.packageClass === 'server-only') {
      const remoteFolder = safeSegment(entry.disk?.folder ?? '', `Remote folder for ${id}`);
      return { kind: 'scp-directory', id, expectedVersion, remoteFolder, destination };
    }
    return {
      kind: 'manual-review', id, expectedVersion,
      reason: entry.reasons.join('; ') || 'Package inventory requires manual review',
    };
  });
}

export interface StorageEntry {
  relativePath: string;
  size: number;
  sha256: string;
}

export function isRuntimeLockPath(relativePath: string): boolean {
  return relativePath.replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() === 'lock';
}

export function verifyTransferredTree(
  remote: StorageEntry[],
  local: StorageEntry[],
): { excludedRuntimeLocks: string[]; files: number; bytes: number } {
  const excludedRuntimeLocks = remote
    .filter((entry) => isRuntimeLockPath(entry.relativePath))
    .map((entry) => entry.relativePath)
    .sort();
  const expected = new Map(
    remote.filter((entry) => !isRuntimeLockPath(entry.relativePath))
      .map((entry) => [entry.relativePath, entry]),
  );
  const actual = new Map(local.map((entry) => [entry.relativePath, entry]));
  for (const [path, entry] of expected) {
    const received = actual.get(path);
    if (!received) throw new Error(`Transferred package is missing ${path}`);
    if (received.size !== entry.size) throw new Error(`Transferred package size mismatch for ${path}`);
    if (received.sha256 !== entry.sha256) throw new Error(`Transferred package SHA-256 mismatch for ${path}`);
  }
  for (const path of actual.keys()) {
    if (isRuntimeLockPath(path)) {
      throw new Error(`Transferred package contains excluded runtime lock ${path}`);
    }
    if (!expected.has(path)) {
      throw new Error(`Transferred package contains unexpected ${path}`);
    }
  }
  return {
    excludedRuntimeLocks,
    files: expected.size,
    bytes: [...expected.values()].reduce((sum, entry) => sum + entry.size, 0),
  };
}

export function hasOnlyRuntimeLockErrors(stderr: string, excludedRuntimeLocks: string[]): boolean {
  const excludedBasenames = new Set(
    excludedRuntimeLocks.map((path) => path.replaceAll('\\', '/').toLowerCase()),
  );
  const lines = stderr.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0 || excludedBasenames.size === 0) return false;
  return lines.every((line) => {
    const normalized = line.replaceAll('\\', '/').toLowerCase();
    return [...excludedBasenames].some((path) => normalized.includes(`/${path}"`));
  });
}

async function sha256(path: string): Promise<string> {
  return await new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function storageInventory(root: string): Promise<StorageEntry[]> {
  const entries: StorageEntry[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Persistent storage contains a symbolic link: ${fullPath}`);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) {
        const info = await stat(fullPath);
        entries.push({
          relativePath: relative(root, fullPath).split(sep).join('/'),
          size: info.size,
          sha256: await sha256(fullPath),
        });
      }
    }
  }
  await walk(root);
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function verifyStorageTrees(source: string, destination: string): Promise<StorageEntry[]> {
  const [expected, actual] = await Promise.all([storageInventory(source), storageInventory(destination)]);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('Persistent storage mismatch by relative path, size, or SHA-256');
  }
  return actual;
}

async function readRemoteTreeInventory(
  config: FoundryLabConfig,
  remoteRoot: string,
): Promise<StorageEntry[]> {
  const identity = resolve(homedir(), '.ssh/id_ed25519');
  const inventoryScript = [
    "$ErrorActionPreference='Stop'",
    '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)',
    `$root=${quotePowerShellLiteral(remoteRoot)}`,
    "if (-not (Test-Path -LiteralPath $root)) { throw ('Remote tree does not exist: ' + $root) }",
    '$files=@(Get-ChildItem -LiteralPath $root -File -Recurse | ForEach-Object {',
    "[pscustomobject]@{relativePath=$_.FullName.Substring($root.Length).TrimStart('\\').Replace('\\','/');size=$_.Length;sha256=$(if ($_.Name -ieq 'LOCK') { '0' * 64 } else { (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant() })}",
    '})',
    '$files | ConvertTo-Json -Compress',
  ].join('; ');
  const encoded = Buffer.from(inventoryScript, 'utf16le').toString('base64');
  const result = await runCommand('ssh', [
    '-i', identity, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
    '-o', 'StrictHostKeyChecking=yes', config.sshTarget,
    'powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded,
  ], { cwd: config.repoRoot, timeoutMs: 4 * 60 * 60_000 });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Remote tree inventory failed for ${remoteRoot}`);
  }
  const parsed = JSON.parse(result.stdout.trim() || '[]') as unknown;
  const values = Array.isArray(parsed) ? parsed : [parsed];
  const entries = values.map((value, index): StorageEntry => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`Remote tree entry ${index} is not an object`);
    }
    const entry = value as Record<string, unknown>;
    if (typeof entry.relativePath !== 'string'
      || entry.relativePath.startsWith('/')
      || entry.relativePath.split('/').includes('..')) {
      throw new Error(`Remote tree entry ${index} has an unsafe relative path`);
    }
    if (typeof entry.size !== 'number' || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      throw new Error(`Remote tree entry ${index} has an invalid size`);
    }
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Remote tree entry ${index} has an invalid SHA-256`);
    }
    return { relativePath: entry.relativePath, size: entry.size, sha256: entry.sha256 };
  });
  const paths = new Set<string>();
  for (const entry of entries) {
    const key = entry.relativePath.toLowerCase();
    if (paths.has(key)) throw new Error(`Remote tree has duplicate path: ${entry.relativePath}`);
    paths.add(key);
  }
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function replaceDirectory(stagingRoot: string, destination: string, config: FoundryLabConfig): Promise<void> {
  const backup = `${destination}.previous`;
  for (const path of [stagingRoot, destination, backup]) assertInsideLabRoot(config, path);
  await mkdir(dirname(destination), { recursive: true });
  if (existsSync(backup) && !existsSync(destination)) await rename(backup, destination);
  if (existsSync(backup)) await rm(backup, { recursive: true, force: true });
  let movedOld = false;
  if (existsSync(destination)) {
    await rename(destination, backup);
    movedOld = true;
  }
  try {
    await rename(stagingRoot, destination);
  } catch (error) {
    if (movedOld && !existsSync(destination) && existsSync(backup)) await rename(backup, destination);
    throw error;
  }
  if (existsSync(backup)) await rm(backup, { recursive: true, force: true });
}

async function findPackageRoot(extractedRoot: string, manifestName: string): Promise<string> {
  const matches: string[] = [];
  async function walk(current: string, depth: number): Promise<void> {
    if (depth > 3) return;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Package archive contains a symbolic link: ${join(current, entry.name)}`);
      const fullPath = join(current, entry.name);
      if (entry.isFile() && entry.name === manifestName) matches.push(dirname(fullPath));
      else if (entry.isDirectory()) await walk(fullPath, depth + 1);
    }
  }
  await walk(extractedRoot, 0);
  if (matches.length !== 1) {
    throw new Error(`Package archive must contain exactly one ${manifestName}, received ${matches.length}`);
  }
  return matches[0]!;
}

export function buildArchiveExtractionCommand(archivePath: string, destination: string): {
  command: string;
  args: string[];
} {
  return { command: 'tar.exe', args: ['-xf', archivePath, '-C', destination] };
}

export function validateArchiveEntries(entries: string[]): void {
  for (const rawEntry of entries) {
    const entry = rawEntry.replaceAll('\\', '/');
    const segments = entry.split('/');
    if (
      entry.length === 0
      || entry.startsWith('/')
      || /^[a-zA-Z]:\//.test(entry)
      || entry.includes('\0')
      || segments.includes('..')
    ) {
      throw new Error(`Package archive contains an unsafe path: ${rawEntry}`);
    }
  }
}

async function expandArchive(config: FoundryLabConfig, archivePath: string, destination: string): Promise<void> {
  assertInsideLabRoot(config, archivePath);
  assertInsideLabRoot(config, destination);
  const listing = await runCommand('tar.exe', ['-tf', archivePath], {
    cwd: config.repoRoot,
    timeoutMs: 10 * 60_000,
  });
  if (listing.exitCode !== 0) {
    throw new Error(listing.stderr.trim() || `Failed to list archive ${archivePath}`);
  }
  const entries = listing.stdout.split(/\r?\n/).filter((entry) => entry.length > 0);
  if (entries.length === 0) throw new Error(`Package archive is empty: ${archivePath}`);
  validateArchiveEntries(entries);
  const extraction = buildArchiveExtractionCommand(archivePath, destination);
  const result = await runCommand(extraction.command, extraction.args, {
    cwd: config.repoRoot,
    timeoutMs: 30 * 60_000,
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Failed to extract ${archivePath}`);
}

async function defaultInstallArchive(input: InstallArchiveArguments): Promise<void> {
  const { config, archivePath, stagingRoot, expectedId, expectedVersion, url } = input;
  const partPath = `${archivePath}.part`;
  const extractionRoot = `${stagingRoot}.extract`;
  for (const path of [archivePath, partPath, stagingRoot, extractionRoot]) assertInsideLabRoot(config, path);
  await mkdir(dirname(archivePath), { recursive: true });
  if (!existsSync(archivePath)) {
    await rm(partPath, { force: true });
    try {
      await downloadHttpsArchive(url, partPath);
      await rename(partPath, archivePath);
    } finally {
      await rm(partPath, { force: true });
    }
  }
  await rm(extractionRoot, { recursive: true, force: true });
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(extractionRoot, { recursive: true });
  try {
    await expandArchive(config, archivePath, extractionRoot);
    const manifestName = expectedId === 'dnd5e' ? 'system.json' : 'module.json';
    const packageRoot = await findPackageRoot(extractionRoot, manifestName);
    const manifest = JSON.parse(await readFile(join(packageRoot, manifestName), 'utf8')) as PackageManifest;
    validateArchiveIdentity({ expectedId, expectedVersion }, manifest);
    await mkdir(stagingRoot, { recursive: true });
    await cp(packageRoot, stagingRoot, { recursive: true, force: true });
  } catch (error) {
    if (existsSync(archivePath)) {
      // An invalid or corrupt cached archive must not poison a later retry.
      await rm(archivePath, { force: true });
    }
    throw error;
  } finally {
    await rm(extractionRoot, { recursive: true, force: true });
  }
}

async function defaultCopyRemoteDirectory(
  config: FoundryLabConfig,
  remoteFolder: string,
  stagingRoot: string,
): Promise<{ bytes: number; excludedRuntimeLocks: string[] }> {
  safeSegment(remoteFolder, 'Remote module folder');
  assertInsideLabRoot(config, stagingRoot);
  await rm(stagingRoot, { recursive: true, force: true });
  const identity = resolve(homedir(), '.ssh/id_ed25519');
  const remoteRoot = `${config.remoteDataPath}/Data/modules/${remoteFolder}`;
  const remoteInventory = await readRemoteTreeInventory(config, remoteRoot);
  const excludedRuntimeLocks = remoteInventory
    .filter((entry) => isRuntimeLockPath(entry.relativePath))
    .map((entry) => entry.relativePath);
  const remotePath = buildScpRemoteSpec(
    config.sshTarget,
    remoteRoot,
  );
  const legacy = excludedRuntimeLocks.length === 0;
  const result = await runCommand(
    'scp',
    buildScpCommandArgs(identity, remotePath, stagingRoot, { legacy }),
    { cwd: config.repoRoot, timeoutMs: 4 * 60 * 60_000 },
  );
  if (result.exitCode !== 0
    && (legacy || !hasOnlyRuntimeLockErrors(result.stderr, excludedRuntimeLocks))) {
    throw new Error(result.stderr.trim() || `SCP failed for ${remoteFolder}`);
  }

  const firstLocalInventory = existsSync(stagingRoot) ? await storageInventory(stagingRoot) : [];
  const firstLocal = new Map(firstLocalInventory.map((entry) => [entry.relativePath, entry]));
  const repair = remoteInventory.filter((entry) => {
    if (isRuntimeLockPath(entry.relativePath)) return false;
    const local = firstLocal.get(entry.relativePath);
    return !local || local.size !== entry.size || local.sha256 !== entry.sha256;
  });
  for (const entry of repair) {
    const destination = resolve(stagingRoot, ...entry.relativePath.split('/'));
    assertInsideLabRoot(config, destination);
    await mkdir(dirname(destination), { recursive: true });
    await rm(destination, { force: true });
    const source = buildScpRemoteSpec(config.sshTarget, `${remoteRoot}/${entry.relativePath}`);
    const repairResult = await runCommand(
      'scp',
      buildScpCommandArgs(identity, source, destination, { legacy: false }),
      { cwd: config.repoRoot, timeoutMs: 4 * 60 * 60_000 },
    );
    if (repairResult.exitCode !== 0) {
      throw new Error(repairResult.stderr.trim() || `SCP repair failed for ${remoteFolder}/${entry.relativePath}`);
    }
  }

  if (existsSync(stagingRoot)) {
    const localWithLocks = await storageInventory(stagingRoot);
    for (const entry of localWithLocks.filter((value) => isRuntimeLockPath(value.relativePath))) {
      const lockPath = resolve(stagingRoot, ...entry.relativePath.split('/'));
      assertInsideLabRoot(config, lockPath);
      await rm(lockPath, { force: true });
    }
  }
  const localInventory = await storageInventory(stagingRoot);
  return verifyTransferredTree(remoteInventory, localInventory);
}

export function buildScpRemoteSpec(sshTarget: string, remotePath: string): string {
  if (/['"\r\n]/.test(sshTarget) || /['"\r\n]/.test(remotePath)) {
    throw new Error('SCP target contains unsupported quoting characters');
  }
  return `${sshTarget}:${remotePath}`;
}

export function buildScpCommandArgs(
  identity: string,
  remoteSpec: string,
  destination: string,
  options: { legacy: boolean } = { legacy: true },
): string[] {
  const args = [
    '-i', identity,
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=10',
    '-o', 'StrictHostKeyChecking=yes',
  ];
  if (options.legacy) args.push('-O');
  args.push('-C');
  args.push('-r', remoteSpec, destination);
  return args;
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function defaultCopyPersistentStorage(
  config: FoundryLabConfig,
  remoteFolder: string,
  destination: string,
): Promise<{ files: number; bytes: number }> {
  safeSegment(remoteFolder, 'Remote module folder');
  assertInsideLabRoot(config, destination);
  const staging = `${destination}.staging`;
  assertInsideLabRoot(config, staging);
  await rm(staging, { recursive: true, force: true });
  const identity = resolve(homedir(), '.ssh/id_ed25519');
  const remoteStorage = `${config.remoteDataPath}/Data/modules/${remoteFolder}/storage`;
  const inventoryScript = [
    "$ErrorActionPreference='Stop'",
    '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)',
    `$root=${quotePowerShellLiteral(remoteStorage)}`,
    "if (-not (Test-Path -LiteralPath $root)) { '[]'; exit 0 }",
    '$files=@(Get-ChildItem -LiteralPath $root -File -Recurse | ForEach-Object {',
    "[pscustomobject]@{relativePath=$_.FullName.Substring($root.Length).TrimStart('\\').Replace('\\','/');size=$_.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()}",
    '})',
    '$files | ConvertTo-Json -Compress',
  ].join('; ');
  const encoded = Buffer.from(inventoryScript, 'utf16le').toString('base64');
  const inventoryResult = await runCommand('ssh', [
    '-i', identity, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
    '-o', 'StrictHostKeyChecking=yes', config.sshTarget,
    'powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded,
  ], { cwd: config.repoRoot, timeoutMs: 30 * 60_000 });
  if (inventoryResult.exitCode !== 0) {
    throw new Error(inventoryResult.stderr.trim() || `Storage inventory failed for ${remoteFolder}`);
  }
  const parsed = JSON.parse(inventoryResult.stdout.trim() || '[]') as StorageEntry | StorageEntry[];
  const expected = (Array.isArray(parsed) ? parsed : [parsed]).sort(
    (left, right) => left.relativePath.localeCompare(right.relativePath),
  );

  await mkdir(dirname(staging), { recursive: true });
  const remotePath = buildScpRemoteSpec(config.sshTarget, remoteStorage);
  const copyResult = await runCommand(
    'scp',
    buildScpCommandArgs(identity, remotePath, staging),
    { cwd: config.repoRoot, timeoutMs: 4 * 60 * 60_000 },
  );
  if (copyResult.exitCode !== 0) throw new Error(copyResult.stderr.trim() || `Storage SCP failed for ${remoteFolder}`);
  const actual = await storageInventory(staging);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    await rm(staging, { recursive: true, force: true });
    throw new Error(`Persistent storage mismatch for ${remoteFolder}`);
  }
  await replaceDirectory(staging, destination, config);
  return { files: actual.length, bytes: actual.reduce((sum, entry) => sum + entry.size, 0) };
}

function requireManifestIdentity(manifest: PackageManifest, expectedId: string, expectedVersion: string): void {
  validateArchiveIdentity({ expectedId, expectedVersion }, manifest);
}

async function readAndValidateInstalledManifest(
  config: FoundryLabConfig,
  destination: string,
  expectedId: string,
  expectedVersion: string,
): Promise<void> {
  assertInsideLabRoot(config, destination);
  const manifestName = expectedId === 'dnd5e' ? 'system.json' : 'module.json';
  const manifestPath = join(destination, manifestName);
  assertInsideLabRoot(config, manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as PackageManifest;
  requireManifestIdentity(manifest, expectedId, expectedVersion);
}

export async function acquirePackages(
  config: FoundryLabConfig,
  classified: ClassifiedPackage[],
  options: AcquisitionOptions = { apply: false },
  dependencyOverrides: Partial<AcquisitionDependencies> = {},
): Promise<AcquisitionReport> {
  const readDnd5eManifest = dependencyOverrides.readDnd5eManifest ?? (async () => {
    const path = resolve(config.repoRoot, 'references/dnd5e-5.3.3/system.json');
    return JSON.parse(await readFile(path, 'utf8')) as PackageManifest;
  });
  const dnd5e = await readDnd5eManifest();
  validateArchiveIdentity(
    { expectedId: 'dnd5e', expectedVersion: config.versions.dnd5e },
    dnd5e,
  );
  if (typeof dnd5e.download !== 'string') throw new Error('Locked dnd5e manifest has no download URL');
  requireHttpsUrl(dnd5e.download, 'Locked dnd5e download URL');

  const moduleActions = buildAcquisitionActions(classified);
  const systemActions: AcquisitionAction[] = [config.profiles.coreTest, config.profiles.serverMirror].map(
    (profile) => ({
      kind: 'download',
      id: 'dnd5e',
      expectedVersion: config.versions.dnd5e,
      url: dnd5e.download as string,
      destination: join(profile.dataPath, 'Data/systems/dnd5e'),
    }),
  );
  const actions: AcquisitionReport['actions'] = [...moduleActions, ...systemActions].map(
    (action) => ({ ...action, status: 'planned' as const }),
  );
  if (!options.apply) {
    return { apply: false, actions, installed: 0, unresolved: 0, failed: 0, complete: false };
  }

  const installArchive = dependencyOverrides.installArchive ?? defaultInstallArchive;
  const copyRemoteDirectory = dependencyOverrides.copyRemoteDirectory ?? defaultCopyRemoteDirectory;
  const copyPersistentStorage = dependencyOverrides.copyPersistentStorage ?? defaultCopyPersistentStorage;
  const byId = new Map(classified.map((entry) => [entry.active.id, entry]));
  let installed = 0;
  let unresolved = 0;
  let failed = 0;
  const reportPath = resolve(config.inventoryRoot, 'acquisition-report.json');
  const reportPart = `${reportPath}.part`;
  for (const path of [config.inventoryRoot, reportPath, reportPart]) assertInsideLabRoot(config, path);
  await mkdir(config.inventoryRoot, { recursive: true });
  const currentReport = (): AcquisitionReport => ({
    apply: true,
    actions,
    installed,
    unresolved,
    failed,
    complete: failed === 0 && unresolved === 0
      && actions.every((action) => action.status === 'installed'),
  });
  const persistReport = async (): Promise<void> => {
    await rm(reportPart, { force: true });
    await writeFile(reportPart, `${JSON.stringify(currentReport(), null, 2)}\n`, 'utf8');
    await rename(reportPart, reportPath);
  };
  await persistReport();
  let serverIndex = 0;
  const serverTotal = moduleActions.filter((action) => action.kind === 'scp-directory').length;

  for (const action of actions) {
    if (action.kind === 'manual-review') {
      action.status = 'unresolved';
      unresolved += 1;
      await persistReport();
      continue;
    }
    const destination = action.kind === 'authorized-manual-install'
      ? resolve(config.profiles.serverMirror.dataPath, 'Data/modules', safeSegment(action.id, 'Package id'))
      : resolve(config.repoRoot, action.destination);
    const stagingRoot = `${destination}.staging`;
    for (const path of [destination, stagingRoot]) assertInsideLabRoot(config, path);
    try {
      let alreadyInstalled = false;
      try {
        await readAndValidateInstalledManifest(config, destination, action.id, action.expectedVersion);
        alreadyInstalled = true;
        options.onProgress?.(`reused verified installation ${action.id}@${action.expectedVersion}`);
      } catch {
        // A missing or mismatched destination is replaced only after staging verifies.
      }
      if (action.kind === 'authorized-manual-install' && !alreadyInstalled) {
        action.status = 'unresolved';
        unresolved += 1;
        await persistReport();
        continue;
      }

      const classifiedEntry = byId.get(action.id);
      const needsPersistentStorage = classifiedEntry?.disk?.persistentStorage === true;
      if (!alreadyInstalled) {
        if (action.kind === 'download') {
          const archivePath = resolve(config.cacheRoot, safeSegment(action.id, 'Package id'), safeSegment(action.expectedVersion, 'Package version'), 'package.zip');
          assertInsideLabRoot(config, archivePath);
          await installArchive({
            url: action.url,
            archivePath,
            stagingRoot,
            expectedId: action.id,
            expectedVersion: action.expectedVersion,
            config,
          });
        } else if (action.kind === 'scp-directory') {
          serverIndex += 1;
          options.onProgress?.(`[${serverIndex}/${serverTotal}] copying server-only package ${action.id}`);
          const transfer = await copyRemoteDirectory(config, action.remoteFolder, stagingRoot);
          action.excludedRuntimeLocks = transfer.excludedRuntimeLocks;
          options.onProgress?.(
            `[${serverIndex}/${serverTotal}] copied ${action.id}: ${transfer.bytes} bytes; `
            + `${transfer.excludedRuntimeLocks.length} runtime LOCK files excluded`,
          );
        } else {
          throw new Error(`Authorized package ${action.id} is not installed at the exact expected version`);
        }
        await readAndValidateInstalledManifest(config, stagingRoot, action.id, action.expectedVersion);
      } else if (needsPersistentStorage) {
        await rm(stagingRoot, { recursive: true, force: true });
        await cp(destination, stagingRoot, {
          recursive: true,
          force: true,
          preserveTimestamps: true,
        });
      }

      if (needsPersistentStorage) {
        const storageDestination = join(stagingRoot, 'storage');
        assertInsideLabRoot(config, storageDestination);
        const storage = await copyPersistentStorage(
          config,
          classifiedEntry.disk.folder,
          storageDestination,
        );
        options.onProgress?.(`verified persistent storage for ${action.id}: ${storage.files} files, ${storage.bytes} bytes`);
      }

      if (!alreadyInstalled || needsPersistentStorage) {
        await readAndValidateInstalledManifest(config, stagingRoot, action.id, action.expectedVersion);
        await replaceDirectory(stagingRoot, destination, config);
      }
      await readAndValidateInstalledManifest(config, destination, action.id, action.expectedVersion);
      action.status = 'installed';
      installed += 1;
      await persistReport();
    } catch (error) {
      action.status = 'failed';
      action.error = error instanceof Error ? error.message : String(error);
      failed += 1;
      await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
      options.onProgress?.(`failed ${action.id}@${action.expectedVersion}: ${action.error}`);
      await persistReport();
    }
  }

  const report = currentReport();
  await persistReport();
  return report;
}

export async function readClassifiedPlan(config: FoundryLabConfig): Promise<ClassifiedPackage[]> {
  const path = resolve(config.inventoryRoot, 'package-plan.json');
  assertInsideLabRoot(config, path);
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('package-plan.json must be an array');
  return parsed as ClassifiedPackage[];
}
