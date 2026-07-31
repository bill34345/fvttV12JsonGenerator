import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { dirname, parse, relative, resolve, sep } from 'node:path';

const MODULE_ID = 'chat-memory-guard';
const SOURCE_FILES = [
  'module.json',
  'styles/chat-memory-guard.css',
  'templates/settings.hbs',
  'lang/en.json',
  'lang/zh-CN.json',
] as const;

export interface ChatMemoryGuardBuildResult {
  outputDir: string;
  zipPath: string;
  archiveEntries: string[];
}

export interface ChatMemoryGuardInstallResult {
  destination: string;
  backupPath?: string;
}

export interface ChatMemoryGuardInstallOptions {
  buildDirectory: string;
  destination: string;
  backupRoot: string;
}

export type ChatMemoryGuardEnvironment = Readonly<Record<string, string | undefined>>;

export function chatMemoryGuardPaths(packageRoot = import.meta.dir) {
  const root = resolve(packageRoot);
  return {
    sourceRoot: resolve(root, 'src'),
    outputRoot: resolve(root, 'dist'),
    outputDir: resolve(root, 'dist/module'),
    zipPath: resolve(root, 'dist/chat-memory-guard.zip'),
  };
}

export function chatMemoryGuardWorkspaceInstallPaths(
  workspaceRoot: string,
  environment: ChatMemoryGuardEnvironment = {},
) {
  const root = resolve(workspaceRoot);
  const labRoot = resolve(environment.FVTT_OPS_LAB_ROOT || resolve(root, '.local/foundry-v14'));
  const backupRoot = resolve(environment.FVTT_OPS_BACKUP_ROOT || resolve(labRoot, 'backups'));
  assertSpecificRoot(root, labRoot, 'FVTT_OPS_LAB_ROOT');
  assertSpecificRoot(root, backupRoot, 'FVTT_OPS_BACKUP_ROOT');
  return {
    destination: resolve(labRoot, 'data/server-mirror/Data/modules/chat-memory-guard'),
    backupRoot: resolve(backupRoot, 'chat-memory-guard'),
  };
}

export function assertChatMemoryGuardDestination(
  workspaceRoot: string,
  destination: string,
  environment: ChatMemoryGuardEnvironment = {},
): string {
  const expected = chatMemoryGuardWorkspaceInstallPaths(workspaceRoot, environment).destination;
  if (resolve(destination) !== expected) {
    throw new Error(`Chat Memory Guard installation destination must be the exact configured Foundry lab path: ${expected}`);
  }
  return expected;
}

export async function buildChatMemoryGuardPackage(
  packageRoot = import.meta.dir,
): Promise<ChatMemoryGuardBuildResult> {
  const paths = chatMemoryGuardPaths(packageRoot);
  await rm(paths.outputRoot, { recursive: true, force: true });
  await mkdir(resolve(paths.outputDir, 'scripts'), { recursive: true });

  const build = await Bun.build({
    entrypoints: [resolve(paths.sourceRoot, 'index.ts')],
    outdir: resolve(paths.outputDir, 'scripts'),
    naming: 'index.js',
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: false,
    sourcemap: 'none',
  });
  if (!build.success) {
    throw new Error(`Chat Memory Guard browser build failed:\n${build.logs.map(String).join('\n')}`);
  }

  for (const file of SOURCE_FILES) {
    const target = resolve(paths.outputDir, file);
    await mkdir(dirname(target), { recursive: true });
    await cp(resolve(paths.sourceRoot, file), target);
  }
  await assertOwnedModule(paths.outputDir);

  const files = await collectFiles(paths.outputDir);
  const entries = await Promise.all(files.map(async (path) => ({
    name: relative(paths.outputDir, path).replace(/\\/g, '/'),
    bytes: new Uint8Array(await readFile(path)),
  })));
  const archive = createStoredZip(entries);
  await writeFile(paths.zipPath, archive);
  return { outputDir: paths.outputDir, zipPath: paths.zipPath, archiveEntries: entries.map((entry) => entry.name) };
}

export async function installChatMemoryGuardPackage(
  workspaceRoot: string,
  buildDirectory = chatMemoryGuardPaths().outputDir,
  environment: ChatMemoryGuardEnvironment = {},
): Promise<ChatMemoryGuardInstallResult> {
  const paths = chatMemoryGuardWorkspaceInstallPaths(workspaceRoot, environment);
  const destination = assertChatMemoryGuardDestination(workspaceRoot, paths.destination, environment);
  assertNoReparsePath(destination, 'Chat Memory Guard installation destination');
  assertNoReparsePath(paths.backupRoot, 'Chat Memory Guard backup root');
  return installChatMemoryGuardRelease({
    buildDirectory,
    destination,
    backupRoot: paths.backupRoot,
  });
}

export async function installChatMemoryGuardRelease({
  buildDirectory,
  destination,
  backupRoot,
}: ChatMemoryGuardInstallOptions): Promise<ChatMemoryGuardInstallResult> {
  if (resolve(destination).split(/[\\/]/).at(-1) !== MODULE_ID) {
    throw new Error(`Chat Memory Guard installation destination must end in ${MODULE_ID}.`);
  }
  await assertOwnedModule(buildDirectory);

  let backupPath: string | undefined;
  if (await exists(destination)) {
    await assertOwnedModule(destination, true);
    const manifest = JSON.parse(await readFile(resolve(destination, 'module.json'), 'utf8')) as { version?: string };
    const suffix = String(manifest.version ?? 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
    backupPath = resolve(backupRoot, `${suffix}-${Date.now()}`);
    await mkdir(dirname(backupPath), { recursive: true });
    await rename(destination, backupPath);
  }

  try {
    await mkdir(dirname(destination), { recursive: true });
    await cp(buildDirectory, destination, { recursive: true, errorOnExist: true, force: false });
    await assertOwnedModule(destination);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    if (backupPath) await rename(backupPath, destination);
    throw error;
  }
  return { destination, backupPath };
}

async function assertOwnedModule(directory: string, existing = false): Promise<void> {
  const manifestPath = resolve(directory, 'module.json');
  let manifest: { id?: string };
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    const prefix = existing ? 'Unknown existing same-name module' : 'Invalid build module';
    throw new Error(`${prefix}: no readable module.json at ${manifestPath}`, { cause: error });
  }
  if (manifest.id !== MODULE_ID) {
    const prefix = existing ? 'Refusing to replace foreign or unknown same-name module' : 'Build module ID mismatch';
    throw new Error(`${prefix}: expected ${MODULE_ID}, got ${String(manifest.id)}`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function assertSpecificRoot(repoRoot: string, target: string, variable: string): void {
  const volumeRoot = parse(target).root;
  if (relative(volumeRoot, target) === '' || relative(repoRoot, target) === '') {
    throw new Error(`${variable} must name a specific directory, not a volume or repository root: ${target}`);
  }
}

function assertNoReparsePath(target: string, label: string): void {
  const absolute = resolve(target);
  let current = parse(absolute).root;
  for (const segment of relative(current, absolute).split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(`${label} contains an unsafe symlink, junction, or reparse point: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

export async function collectFiles(directory: string): Promise<string[]> {
  const glob = new Bun.Glob('**/*');
  const files: string[] = [];
  for await (const path of glob.scan({ cwd: directory, onlyFiles: true })) files.push(resolve(directory, path));
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}

interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith('/') || entry.name.includes('..')) {
      throw new Error(`Unsafe ZIP entry: ${entry.name}`);
    }
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x0021, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.bytes.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x0021, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concatenate([...localParts, ...centralParts, end]);
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = createCrcTable();

if (import.meta.main) {
  const workspaceRootFlag = process.argv.indexOf('--workspace-root');
  const workspaceRoot = workspaceRootFlag >= 0
    ? resolve(process.argv[workspaceRootFlag + 1] ?? '')
    : resolve(import.meta.dir, '../..');
  const build = await buildChatMemoryGuardPackage();
  const install = process.argv.includes('--install')
    ? await installChatMemoryGuardPackage(workspaceRoot, build.outputDir, process.env)
    : undefined;
  console.log(JSON.stringify({ build, install }, null, 2));
}
