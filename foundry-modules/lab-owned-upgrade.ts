import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, parse, relative, resolve } from 'node:path';

const execFileAsync = promisify(execFile);
export interface OwnedUpgradeSpec {
  id: string;
  destination: string;
  buildRoot: string;
  expectedOldHash: string;
  expectedPaths: readonly string[];
  expectedNewPaths?: readonly string[];
  oldVersion?: '0.1.0' | '0.1.1' | '0.2.0' | '1.0.1' | '1.1.0';
  newVersion?: '0.1.0' | '0.1.1' | '0.2.0' | '1.0.1' | '1.1.0';
}
export interface TreeEntry { path: string; sha256: string }
export interface UpgradePreview { id: string; destination: string; oldVersion: string; newVersion: string; oldHash: string; newHash: string; changed: string[]; apply: boolean }

const CONDITIONS_PATHS = [
  'CREDITS.md', 'module.json', 'README.md', 'README.zh-CN.md',
  ...['addled', 'bewildered', 'bleeding', 'burning', 'clumsy', 'dazed', 'defenseless', 'distracted', 'enfeebled', 'frozen', 'helpless', 'immobilized', 'jinxed', 'shocked', 'sickened', 'slowed', 'staggered', 'valor', 'weakened'].map((name) => `icons/${name}.svg`),
  'lang/en.json', 'lang/zh-CN.json', 'scripts/index.js', 'styles/custom-conditions.css', 'templates/condition-manager.hbs',
] as const;
const CONDITIONS_020_PATHS = [
  ...CONDITIONS_PATHS,
  'icons/injury/injury-1.svg', 'icons/injury/injury-2.svg', 'icons/injury/injury-3.svg',
] as const;
const TRIGGER_PATHS = [
  'module.json', 'README.md', 'README.zh-CN.md', 'lang/en.json', 'lang/zh-CN.json',
  'scripts/index.js', 'styles/trigger-engine.css', 'templates/trigger-manager.hbs',
] as const;
export function exactOwnedModulePaths(id: 'fvtt-custom-conditions' | 'fvtt-trigger-engine', version: 'legacy' | '0.2.0' = 'legacy'): readonly string[] {
  return id === 'fvtt-custom-conditions' ? version === '0.2.0' ? CONDITIONS_020_PATHS : CONDITIONS_PATHS : TRIGGER_PATHS;
}

export function isServerMirrorCommandLine(commandLine: string): boolean {
  // Match both Windows and POSIX separators, including a quoted final path
  // segment before Foundry has opened its listener.
  return /[\\/]data[\\/]server-mirror(?=$|[\\/"'\s])/i.test(commandLine);
}

export async function assertServerMirrorStopped(): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Server-mirror process guard requires Windows.');
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq 30001 })',
    "if ($listeners.Count -gt 0) { throw 'Port 30001 has a listener' }",
    "$processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -match '^(node|bun|electron|foundry.*)(\\.exe)?$' } | Select-Object Name, CommandLine)",
    'ConvertTo-Json -InputObject $processes -Compress -Depth 3',
  ].join('; ');
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10_000, windowsHide: true });
    const entries: unknown = JSON.parse(stdout.trim());
    if (!Array.isArray(entries)) throw new Error('Unexpected process probe format.');
    if (entries.some((entry) => entry && typeof entry === 'object' && isServerMirrorCommandLine(String((entry as { CommandLine?: unknown }).CommandLine ?? '')))) {
      throw new Error('A server-mirror Foundry process is running.');
    }
  } catch (error) { throw new Error(`Refusing module upgrade while server-mirror state is unverified: ${String(error)}`); }
}

export async function hashOwnedTree(root: string): Promise<TreeEntry[]> {
  await assertPlainDirectory(root);
  const entries: TreeEntry[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error(`Module tree contains a link/junction: ${path}`);
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) entries.push({ path: relative(root, path).replace(/\\/g, '/'), sha256: sha256(await readFile(path)) });
      else throw new Error(`Unsafe module tree entry: ${path}`);
    }
  }
  await visit(root);
  return entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

export function ownedTreeHash(entries: readonly TreeEntry[]): string { return sha256(Buffer.from(JSON.stringify(entries))); }

export async function previewOwnedUpgrades(specs: readonly OwnedUpgradeSpec[]): Promise<UpgradePreview[]> {
  if (specs.length === 0 || new Set(specs.map((spec) => spec.destination.toLowerCase())).size !== specs.length) throw new Error('Upgrade targets must be nonempty and distinct.');
  const previews: UpgradePreview[] = [];
  for (const spec of specs) {
    if (!/^[a-f0-9]{64}$/i.test(spec.expectedOldHash)) throw new Error(`Expected complete old SHA-256 is required for ${spec.id}.`);
    await assertPlainDirectory(spec.destination);
    await assertPlainDirectory(spec.buildRoot);
    const oldEntries = await hashOwnedTree(spec.destination);
    const newEntries = await hashOwnedTree(spec.buildRoot);
    const expectedPaths = [...spec.expectedPaths].sort((a, b) => a.localeCompare(b, 'en'));
    const expectedNewPaths = [...(spec.expectedNewPaths ?? spec.expectedPaths)].sort((a, b) => a.localeCompare(b, 'en'));
    const oldPaths = oldEntries.map((entry) => entry.path);
    const newPaths = newEntries.map((entry) => entry.path);
    if (JSON.stringify(oldPaths) !== JSON.stringify(expectedPaths) || JSON.stringify(newPaths) !== JSON.stringify(expectedNewPaths)) {
      throw new Error(`Exact file-name set mismatch for ${spec.id}: ${spec.destination}`);
    }
    for (const name of newPaths.filter((name) => !oldPaths.includes(name))) {
      if (!isApprovedNewFile(spec, name)) throw new Error(`Unapproved new module file: ${name}`);
    }
    const oldHash = ownedTreeHash(oldEntries);
    if (oldHash.toLowerCase() !== spec.expectedOldHash.toLowerCase()) throw new Error(`Old complete-tree hash mismatch for ${spec.destination}: ${oldHash}`);
    const oldVersion = spec.oldVersion ?? '0.1.0';
    const newVersion = spec.newVersion ?? '0.1.1';
    await assertManifest(spec.destination, spec.id, oldVersion);
    await assertManifest(spec.buildRoot, spec.id, newVersion);
    const previous = new Map(oldEntries.map((entry) => [entry.path, entry.sha256]));
    const changed = newEntries.filter((entry) => previous.get(entry.path) !== entry.sha256).map((entry) => entry.path);
    if (oldVersion === newVersion && changed.length === 0) throw new Error(`Same-version patch contains no changed files: ${spec.destination}`);
    previews.push({ id: spec.id, destination: spec.destination, oldVersion, newVersion, oldHash, newHash: ownedTreeHash(newEntries), changed, apply: false });
  }
  return previews;
}

export async function applyOwnedUpgrades(specs: readonly OwnedUpgradeSpec[], assertStopped: () => Promise<void> = assertServerMirrorStopped): Promise<UpgradePreview[]> {
  const previews = await previewOwnedUpgrades(specs);
  const candidates: Array<Map<string, { sha256: string; oldSha256?: string; bytes: Buffer }>> = [];
  // Validate every target before changing any one of them.
  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index]!;
    const preview = previews[index]!;
    await assertStopped();
    const current = await hashOwnedTree(spec.destination);
    if (ownedTreeHash(current) !== preview.oldHash) throw new Error(`Old tree changed before upgrade: ${spec.destination}`);
    const built = await hashOwnedTree(spec.buildRoot);
    if (ownedTreeHash(built) !== preview.newHash) throw new Error(`Built tree changed before upgrade: ${spec.buildRoot}`);
    const hashes = new Map(built.map((entry) => [entry.path, entry.sha256]));
    const oldHashes = new Map(current.map((entry) => [entry.path, entry.sha256]));
    const files = new Map<string, { sha256: string; oldSha256?: string; bytes: Buffer }>();
    for (const name of preview.changed) {
      await assertPlainFile(resolve(spec.buildRoot, name));
      const bytes = await readFile(resolve(spec.buildRoot, name));
      const expected = hashes.get(name);
      const oldSha256 = oldHashes.get(name);
      if (!expected || sha256(bytes) !== expected) throw new Error(`Built file changed before upgrade: ${resolve(spec.buildRoot, name)}`);
      files.set(name, { sha256: expected, oldSha256, bytes });
    }
    candidates.push(files);
  }
  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index]!;
    const preview = previews[index]!;
    for (const name of preview.changed) {
      const source = resolve(spec.buildRoot, name);
      const target = resolve(spec.destination, name);
      const staged = `${target}.upgrading-${randomUUID()}`;
      try {
        await assertStopped();
        const candidate = candidates[index]?.get(name);
        if (!candidate) throw new Error(`Missing candidate for ${target}`);
        if (candidate.oldSha256) {
          await assertPlainDirectory(dirname(target));
          await assertPlainFile(target);
          if (sha256(await readFile(target)) !== candidate.oldSha256) throw new Error(`Installed file drifted after prevalidation: ${target}`);
        } else {
          if (!isApprovedNewFile(spec, name)) {
            throw new Error(`Unapproved new module file: ${name}`);
          }
          if (spec.id === 'fvtt-custom-conditions') {
            const iconRoot = resolve(spec.destination, 'icons');
            await assertPlainDirectory(iconRoot);
            const newDirectory = resolve(iconRoot, 'injury');
            const directoryState = await lstat(newDirectory).catch((error: any) => {
              if (error?.code === 'ENOENT') return null;
              throw error;
            });
            if (!directoryState) await mkdir(newDirectory);
            await assertPlainDirectory(newDirectory);
          } else await assertPlainDirectory(spec.destination);
          await assertAbsent(target);
        }
        await assertPlainFile(source);
        if (sha256(await readFile(source)) !== candidate.sha256) throw new Error(`Built file drifted after prevalidation: ${source}`);
        await writeFile(staged, candidate.bytes, { flag: 'wx' });
        if (sha256(await readFile(staged)) !== candidate.sha256) throw new Error('Staged file hash mismatch.');
        await assertStopped();
        if (!candidate.oldSha256) await assertAbsent(target);
        await rename(staged, target);
      } catch (error) {
        try { await unlink(staged); } catch (cleanupError: any) { if (cleanupError?.code !== 'ENOENT') throw new Error(`Upgrade stopped at ${target}; staging cleanup failed at ${staged}: ${String(cleanupError)}`, { cause: error }); }
        throw new Error(`Upgrade stopped at ${target}; inspect partial state before retry: ${String(error)}`, { cause: error });
      }
    }
    const actual = await hashOwnedTree(spec.destination);
    if (ownedTreeHash(actual) !== preview.newHash) throw new Error(`Upgrade verification failed at ${spec.destination}; inspect partial state.`);
  }
  return previews.map((preview) => ({ ...preview, apply: true }));
}

async function assertManifest(root: string, id: string, version: string): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(root, 'module.json'), 'utf8')) as Record<string, unknown>;
  if (manifest.id !== id || manifest.version !== version) throw new Error(`Module identity/version mismatch at ${root}; expected ${id}@${version}.`);
}
function isApprovedNewFile(spec: OwnedUpgradeSpec, name: string): boolean {
  return (spec.id === 'fvtt-custom-conditions' && /^icons\/injury\/injury-[123]\.svg$/.test(name))
    || (spec.id === 'fvtt-injury-fading-spirits' && spec.oldVersion === '1.0.1'
      && spec.newVersion === '1.1.0' && name === 'CREDITS.md');
}
async function assertPlainDirectory(path: string): Promise<void> {
  const absolute = resolve(path);
  const volume = parse(absolute).root;
  let current = volume;
  for (const segment of relative(volume, absolute).split(/[\\/]/).filter(Boolean)) {
    current = resolve(current, segment);
    const stats = await lstat(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Unsafe module directory/junction: ${current}`);
  }
}
async function assertPlainFile(path: string): Promise<void> {
  await assertPlainDirectory(dirname(path));
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Unsafe module file/link: ${path}`);
}
async function assertAbsent(path: string): Promise<void> {
  const existing = await lstat(path).catch((error: any) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (existing) throw new Error(`New owned-module target already exists: ${path}`);
}
function sha256(value: Buffer): string { return createHash('sha256').update(value).digest('hex'); }
