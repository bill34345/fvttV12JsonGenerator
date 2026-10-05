import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, rename } from 'node:fs/promises';
import { isAbsolute, join, parse, relative, resolve } from 'node:path';
import { assertExactLabPath, assertExactRepoPath, assertNoReparsePathComponents, createLabConfig } from './config';

const OWNED_MODULES = {
  'fvtt-trigger-engine': { owner: 'fvtt-trigger-engine', manifest: 'src/module.json', build: 'dist/module' },
  'fvtt-custom-conditions': { owner: 'fvtt-custom-conditions', manifest: 'src/module.json', build: 'dist/module' },
  'fvtt-weapon-mastery-properties': { owner: 'fvtt-weapon-mastery-properties', manifest: 'src/module.json', build: 'dist/module' },
  'fvtt-injury-fading-spirits': { owner: 'fvtt-injury-fading-spirits', manifest: 'src/module.json', build: 'dist/module' },
  'fvtt-battlefield-painter': { owner: 'fvtt-battlefield-painter', manifest: 'module.json', build: 'dist/module' },
  'fvtt-session-monitor': { owner: 'session-monitor', manifest: 'src/module.json', build: 'dist/module' },
  'fvtt-house-rules': { owner: 'fvtt-house-rules', manifest: 'src/module.json', build: 'dist' },
  'open-session-deck': { owner: 'open-session-deck', manifest: 'src/module.json', build: 'dist/module' },
  'fvtt-json-generator-spell-resolver': { owner: 'monster-spell-resolver', manifest: 'src/module.json', build: 'dist/module' },
  'fvtt-selected-token-sync': { owner: 'fvtt-selected-token-sync', manifest: 'src/module.json', build: 'dist/module' },
} as const;
const SERVER_NEXT_LAB_ROOT = resolve('F:/FoundryLab/foundry-v14');

export interface OwnedModuleInstallOptions {
  repoRoot: string;
  labRoot: string;
  moduleId: string;
  version: string;
  apply?: boolean;
}

export interface OwnedModuleInstallResult {
  status: 'dry-run' | 'installed';
  moduleId: string;
  version: string;
  source: string;
  destination: string;
  fileCount: number;
  inventorySha256: string;
  manifestSha256: string;
}

type FileDigest = { path: string; sha256: string };

async function mustBeDirectory(path: string, label: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${label} must be a plain directory: ${path}`);
}

async function mustBeAbsent(path: string, label: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} already exists; replacement is forbidden: ${path}`);
}

async function inspectTree(root: string): Promise<FileDigest[]> {
  await mustBeDirectory(root, 'Built module');
  const files: FileDigest[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) throw new Error(`Module tree contains a symlink or junction: ${path}`);
      if (stat.isDirectory()) await visit(path);
      else if (stat.isFile()) {
        const sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
        files.push({ path: relative(root, path).replaceAll('\\', '/'), sha256 });
      } else throw new Error(`Module tree contains an unsupported entry: ${path}`);
    }
  }
  await visit(root);
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return files;
}

function inventoryHash(files: readonly FileDigest[]): string {
  return createHash('sha256').update(files.map((file) => `${file.path}\0${file.sha256}\n`).join('')).digest('hex');
}

function assertSameFiles(expected: readonly FileDigest[], actual: readonly FileDigest[], label: string): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`${label} differs from the inspected build tree`);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function readManifest(bytes: Buffer, label: string): Record<string, unknown> {
  let manifest: unknown;
  try { manifest = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`${label} is not valid JSON`); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error(`${label} is not a manifest object`);
  const record = manifest as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.version !== 'string') {
    throw new Error(`${label} has no string id/version`);
  }
  return record;
}

function resourcePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') ||
      value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe ${label} path in module manifest: ${String(value)}`);
  }
  return value;
}

async function assertDeclaredResources(manifest: Record<string, unknown>, root: string, files: readonly FileDigest[]): Promise<void> {
  const present = new Set(files.map((file) => file.path));
  function entries(key: string): unknown[] {
    const value = manifest[key];
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`Module manifest ${key} must be an array`);
    return value;
  }
  function requireFile(path: unknown, label: string): void {
    const safe = resourcePath(path, label);
    if (!present.has(safe)) throw new Error(`Module manifest ${label} is missing from build: ${safe}`);
  }
  for (const value of entries('esmodules')) requireFile(value, 'esmodules');
  for (const value of entries('scripts')) requireFile(value, 'scripts');
  for (const value of entries('styles')) {
    const path = typeof value === 'string' ? value : (value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).src : undefined);
    requireFile(path, 'styles');
  }
  for (const value of entries('languages')) {
    const path = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).path : undefined;
    requireFile(path, 'languages');
  }
  for (const value of entries('packs')) {
    const path = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).path : undefined;
    const safe = resourcePath(path, 'packs');
    if (present.has(safe)) continue;
    const directory = resolve(root, ...safe.split('/'));
    const stat = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') throw new Error(`Module manifest packs is missing from build: ${safe}`);
      throw error;
    });
    if (stat.isSymbolicLink() || !stat.isDirectory() || !files.some((file) => file.path.startsWith(`${safe}/`))) {
      throw new Error(`Module manifest packs is not a populated build directory: ${safe}`);
    }
  }
}

export async function installServerNextOwnedModule(options: OwnedModuleInstallOptions): Promise<OwnedModuleInstallResult> {
  const owned = Object.hasOwn(OWNED_MODULES, options.moduleId)
    ? OWNED_MODULES[options.moduleId as keyof typeof OWNED_MODULES]
    : undefined;
  if (!owned) throw new Error(`Module is not in the approved repository-owned list: ${options.moduleId}`);
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(options.version)) {
    throw new Error(`A concrete module --version is required: ${options.version}`);
  }
  if (!isAbsolute(options.repoRoot) || !isAbsolute(options.labRoot)) {
    throw new Error('Repository and Lab roots must be absolute paths');
  }
  const config = createLabConfig(options.repoRoot, { FVTT_OPS_LAB_ROOT: options.labRoot });
  const sourceSegments = ['foundry-modules', owned.owner, ...owned.build.split('/')];
  const source = resolve(config.repoRoot, ...sourceSegments);
  assertExactRepoPath(config, source, sourceSegments, 'Owned module build');
  assertNoReparsePathComponents(parse(config.repoRoot).root, source, 'Owned module build');
  const sourceManifest = resolve(config.repoRoot, 'foundry-modules', owned.owner, owned.manifest);
  assertNoReparsePathComponents(config.repoRoot, sourceManifest, 'Owned module source manifest');
  const files = await inspectTree(source);
  const builtManifest = readManifest(await readFile(join(source, 'module.json')), 'Built module manifest');
  const repositoryManifest = readManifest(await readFile(sourceManifest), 'Repository module manifest');
  if (builtManifest.id !== options.moduleId || repositoryManifest.id !== options.moduleId ||
      builtManifest.version !== options.version || repositoryManifest.version !== options.version) {
    throw new Error(`Module id/version differs from the approved source or requested version: ${options.moduleId}@${options.version}`);
  }
  if (canonicalJson(builtManifest) !== canonicalJson(repositoryManifest)) {
    throw new Error('Built module manifest differs from the current repository source manifest');
  }
  await assertDeclaredResources(builtManifest, source, files);
  const manifest = files.find((file) => file.path === 'module.json');
  if (!manifest) throw new Error('Built module has no module.json');

  const modulesRoot = resolve(config.labRoot, 'data', 'server-next', 'Data', 'modules');
  const destination = resolve(modulesRoot, options.moduleId);
  assertExactLabPath(config, destination, ['data', 'server-next', 'Data', 'modules', options.moduleId], 'ServerNext module destination');
  assertNoReparsePathComponents(parse(config.labRoot).root, destination, 'ServerNext module destination');
  await mustBeDirectory(modulesRoot, 'ServerNext modules root');
  await mustBeAbsent(destination, 'ServerNext module destination');
  const summary: OwnedModuleInstallResult = {
    status: options.apply ? 'installed' : 'dry-run',
    moduleId: options.moduleId,
    version: options.version,
    source,
    destination,
    fileCount: files.length,
    inventorySha256: inventoryHash(files),
    manifestSha256: manifest.sha256,
  };
  if (!options.apply) return summary;

  // This visible, same-volume directory is outside Foundry's Data/modules scan.
  // It holds only new build bytes, is not an old-package backup, and remains on failure.
  const stagingRoot = resolve(config.labRoot, 'evidence', 'server-next-module-install-staging');
  const staging = resolve(stagingRoot, `installing-${options.moduleId}-${randomUUID()}`);
  assertExactLabPath(config, stagingRoot, ['evidence', 'server-next-module-install-staging'], 'ServerNext install staging root');
  assertNoReparsePathComponents(parse(config.labRoot).root, staging, 'ServerNext install staging');
  if (parse(staging).root.toLocaleLowerCase() !== parse(destination).root.toLocaleLowerCase()) {
    throw new Error('ServerNext install staging and destination must be on the same volume');
  }
  await mkdir(stagingRoot, { recursive: true });
  assertNoReparsePathComponents(parse(config.labRoot).root, staging, 'ServerNext install staging');
  if ((await lstat(stagingRoot)).dev !== (await lstat(modulesRoot)).dev) {
    throw new Error('ServerNext install staging and destination are on different filesystem devices');
  }
  await mustBeAbsent(staging, 'Install staging');
  await mkdir(staging);
  try {
    for (const file of files) {
      const relativeParts = file.path.split('/');
      const target = resolve(staging, ...relativeParts);
      await mkdir(resolve(target, '..'), { recursive: true });
      const origin = resolve(source, ...relativeParts);
      const stat = await lstat(origin);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Build tree changed during copy: ${origin}`);
      await copyFile(origin, target, constants.COPYFILE_EXCL);
    }
    assertSameFiles(files, await inspectTree(staging), 'Staged module');
    assertNoReparsePathComponents(parse(config.labRoot).root, destination, 'ServerNext module destination');
    await mustBeAbsent(destination, 'ServerNext module destination');
    await rename(staging, destination);
    assertSameFiles(files, await inspectTree(destination), 'Installed module');
    return summary;
  } catch (error) {
    throw new Error(`ServerNext install failed; inspect owned staging if present: ${staging}. ${String(error)}`);
  }
}

export async function runServerNextOwnedModuleInstallCli(
  args: string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
  repoRoot = process.cwd(),
): Promise<OwnedModuleInstallResult> {
  const allowed = new Set(['--module-id', '--version']);
  const values = new Map<string, string>();
  let apply = false;
  for (const arg of args) {
    if (arg === '--apply') { if (apply) throw new Error('Duplicate --apply'); apply = true; continue; }
    const separator = arg.indexOf('=');
    const key = separator >= 0 ? arg.slice(0, separator) : arg;
    if (!allowed.has(key) || separator < 0 || values.has(key) || !arg.slice(separator + 1)) {
      throw new Error(`Unsupported or repeated install option: ${arg}`);
    }
    values.set(key, arg.slice(separator + 1));
  }
  const labRoot = environment.FVTT_OPS_LAB_ROOT;
  if (!labRoot) throw new Error('FVTT_OPS_LAB_ROOT must explicitly identify the local Lab root');
  if (resolve(labRoot).toLocaleLowerCase() !== SERVER_NEXT_LAB_ROOT.toLocaleLowerCase()) {
    throw new Error(`ServerNext installer requires the exact local Lab root: ${SERVER_NEXT_LAB_ROOT}`);
  }
  return installServerNextOwnedModule({
    repoRoot,
    labRoot,
    moduleId: values.get('--module-id') ?? '',
    version: values.get('--version') ?? '',
    apply,
  });
}

if (import.meta.main) console.log(JSON.stringify(await runServerNextOwnedModuleInstallCli(process.argv.slice(2)), null, 2));
