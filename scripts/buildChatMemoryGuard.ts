import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

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

export function chatMemoryGuardPaths(repoRoot: string) {
  const root = resolve(repoRoot);
  return {
    sourceRoot: resolve(root, 'src/foundry/chat-memory-guard'),
    outputRoot: resolve(root, 'dist/chat-memory-guard'),
    outputDir: resolve(root, 'dist/chat-memory-guard/module'),
    zipPath: resolve(root, 'dist/chat-memory-guard/chat-memory-guard.zip'),
    destination: resolve(root, '.local/foundry-v14/data/server-mirror/Data/modules/chat-memory-guard'),
    backupRoot: resolve(root, '.local/foundry-v14/backups/chat-memory-guard'),
  };
}

export function assertChatMemoryGuardDestination(repoRoot: string, destination: string): string {
  const expected = chatMemoryGuardPaths(repoRoot).destination;
  if (resolve(destination) !== expected) {
    throw new Error(`Chat Memory Guard installation destination must be the exact project-local path: ${expected}`);
  }
  return expected;
}

export async function buildChatMemoryGuardPackage(
  repoRoot = resolve(import.meta.dir, '..'),
): Promise<ChatMemoryGuardBuildResult> {
  const paths = chatMemoryGuardPaths(repoRoot);
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
  repoRoot: string,
  buildDirectory = chatMemoryGuardPaths(repoRoot).outputDir,
): Promise<ChatMemoryGuardInstallResult> {
  const paths = chatMemoryGuardPaths(repoRoot);
  const destination = assertChatMemoryGuardDestination(repoRoot, paths.destination);
  await assertOwnedModule(buildDirectory);

  let backupPath: string | undefined;
  if (await exists(destination)) {
    await assertOwnedModule(destination, true);
    const manifest = JSON.parse(await readFile(resolve(destination, 'module.json'), 'utf8')) as { version?: string };
    const suffix = String(manifest.version ?? 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
    backupPath = resolve(paths.backupRoot, `${suffix}-${Date.now()}`);
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
  const repoRoot = resolve(import.meta.dir, '..');
  const build = await buildChatMemoryGuardPackage(repoRoot);
  const install = process.argv.includes('--install')
    ? await installChatMemoryGuardPackage(repoRoot, build.outputDir)
    : undefined;
  console.log(JSON.stringify({ build, install }, null, 2));
}
