import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { collectFiles, createStoredZip } from './buildChatMemoryGuard';

const MODULE_ID = 'fvtt-session-monitor';
const SOURCE_FILES = [
  'module.json',
  'styles/session-monitor.css',
  'lang/en.json',
  'lang/zh-CN.json',
] as const;
const V1_1_1_DEPLOYED_TERMINAL_NEWLINES = new Map<string, number>([
  ['styles/session-monitor.css', 2],
  ['lang/en.json', 2],
]);

export interface SessionMonitorBuildResult {
  outputDir: string;
  zipPath: string;
  archiveEntries: string[];
}

export interface SessionMonitorInstallResult {
  destination: string;
  backupPath?: string;
}

export function sessionMonitorPaths(repoRoot: string) {
  const root = resolve(repoRoot);
  return {
    sourceRoot: resolve(root, 'src/foundry/session-monitor'),
    outputRoot: resolve(root, 'dist/fvtt-session-monitor'),
    outputDir: resolve(root, 'dist/fvtt-session-monitor/module'),
    zipPath: resolve(root, 'dist/fvtt-session-monitor/fvtt-session-monitor.zip'),
    destination: resolve(root, '.local/foundry-v14/data/server-mirror/Data/modules/fvtt-session-monitor'),
    backupRoot: resolve(root, '.local/foundry-v14/backups/fvtt-session-monitor'),
  };
}

export function assertSessionMonitorDestination(repoRoot: string, destination: string): string {
  const expected = sessionMonitorPaths(repoRoot).destination;
  if (resolve(destination) !== expected) {
    throw new Error(`Session Monitor installation destination must be the exact project-local path: ${expected}`);
  }
  return expected;
}

export async function buildSessionMonitorPackage(
  repoRoot = resolve(import.meta.dir, '..'),
): Promise<SessionMonitorBuildResult> {
  const paths = sessionMonitorPaths(repoRoot);
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
    throw new Error(`Session Monitor browser build failed:\n${build.logs.map(String).join('\n')}`);
  }

  for (const file of SOURCE_FILES) {
    const target = resolve(paths.outputDir, file);
    await mkdir(dirname(target), { recursive: true });
    const terminalNewlines = V1_1_1_DEPLOYED_TERMINAL_NEWLINES.get(file) ?? 1;
    const normalized = (await readFile(resolve(paths.sourceRoot, file), 'utf8'))
      .replace(/\r\n/g, '\n')
      .replace(/\n*$/, '\n'.repeat(terminalNewlines));
    await writeFile(target, normalized, 'utf8');
  }
  await assertOwnedModule(paths.outputDir);

  const files = await collectFiles(paths.outputDir);
  const entries = await Promise.all(files.map(async (path) => ({
    name: relative(paths.outputDir, path).replace(/\\/g, '/'),
    bytes: new Uint8Array(await readFile(path)),
  })));
  await writeFile(paths.zipPath, createStoredZip(entries));
  return {
    outputDir: paths.outputDir,
    zipPath: paths.zipPath,
    archiveEntries: entries.map((entry) => entry.name),
  };
}

export async function installSessionMonitorPackage(
  repoRoot: string,
  buildDirectory = sessionMonitorPaths(repoRoot).outputDir,
): Promise<SessionMonitorInstallResult> {
  const paths = sessionMonitorPaths(repoRoot);
  const destination = assertSessionMonitorDestination(repoRoot, paths.destination);
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

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, '..');
  const result = await buildSessionMonitorPackage(repoRoot);
  console.log(`Built ${result.outputDir}`);
  console.log(`Archive ${result.zipPath}`);
  if (process.argv.includes('--install')) {
    const installed = await installSessionMonitorPackage(repoRoot, result.outputDir);
    console.log(`Installed ${installed.destination}`);
    if (installed.backupPath) console.log(`Backup ${installed.backupPath}`);
  }
}

if (import.meta.main) await main();
