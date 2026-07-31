import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { dirname, parse, relative, resolve, sep } from 'node:path';
import { collectArchiveEntries, createStoredZip } from './companion/archive';
import {
  sessionMonitorFoundryPaths,
  type SessionMonitorEnvironment,
} from './foundryPaths';

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
const BROWSER_BUNDLE_SOURCE_LABELS = [
  {
    pattern: /^\/\/ (?:.*[\\/])?packages[\\/]contracts[\\/]src[\\/]hash[.]ts\r?$/gm,
    canonical: '// @fvtt-json-generator/contracts/hash.ts',
  },
  ...['schema', 'metrics', 'storage', 'runtime', 'index'].map((source) => ({
    pattern: new RegExp(`^// (?:.*[\\\\/])?src[\\\\/]${source}[.]ts\\r?$`, 'gm'),
    canonical: `// src/${source}.ts`,
  })),
] as const;

export interface SessionMonitorBuildResult {
  outputDir: string;
  zipPath: string;
  archiveEntries: string[];
}

export interface SessionMonitorInstallResult {
  destination: string;
  backupPath?: string;
}

export function sessionMonitorPaths(packageRoot = import.meta.dir) {
  const root = resolve(packageRoot);
  return {
    sourceRoot: resolve(root, 'src'),
    outputRoot: resolve(root, 'dist'),
    outputDir: resolve(root, 'dist/module'),
    zipPath: resolve(root, 'dist/fvtt-session-monitor.zip'),
  };
}

export function sessionMonitorWorkspaceInstallPaths(
  workspaceRoot: string,
  environment: SessionMonitorEnvironment = {},
) {
  const paths = sessionMonitorFoundryPaths(workspaceRoot, environment);
  return {
    destination: paths.destination,
    backupRoot: resolve(paths.backupRoot, 'fvtt-session-monitor'),
  };
}

export function assertSessionMonitorDestination(
  workspaceRoot: string,
  destination: string,
  environment: SessionMonitorEnvironment = {},
): string {
  const expected = sessionMonitorWorkspaceInstallPaths(workspaceRoot, environment).destination;
  if (resolve(destination) !== expected) {
    throw new Error(`Session Monitor installation destination must be the exact configured Foundry lab path: ${expected}`);
  }
  return expected;
}

export async function buildSessionMonitorPackage(
  packageRoot = import.meta.dir,
): Promise<SessionMonitorBuildResult> {
  const paths = sessionMonitorPaths(packageRoot);
  await rm(paths.outputRoot, { recursive: true, force: true });
  await mkdir(resolve(paths.outputDir, 'scripts'), { recursive: true });

  const build = await Bun.build({
    entrypoints: [resolve(paths.sourceRoot, 'index.ts')],
    root: paths.sourceRoot,
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
  const browserBundlePath = resolve(paths.outputDir, 'scripts/index.js');
  const browserBundle = normalizeBrowserBundleSourceLabels(
    await readFile(browserBundlePath, 'utf8'),
  );
  await writeFile(browserBundlePath, browserBundle, 'utf8');

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

  const entries = await collectArchiveEntries(paths.outputDir);
  await writeFile(paths.zipPath, createStoredZip(entries));
  return {
    outputDir: paths.outputDir,
    zipPath: paths.zipPath,
    archiveEntries: entries.map((entry) => entry.name),
  };
}

export function normalizeBrowserBundleSourceLabels(bundle: string): string {
  let normalized = bundle.replace(/\r\n/g, '\n');
  for (const label of BROWSER_BUNDLE_SOURCE_LABELS) {
    const matches = normalized.match(label.pattern);
    if (matches?.length !== 1) {
      throw new Error(
        `Session Monitor bundle source label drift: expected one ${label.canonical}, got ${matches?.length ?? 0}`,
      );
    }
    normalized = normalized.replace(label.pattern, label.canonical);
  }
  return normalized;
}

export async function installSessionMonitorPackage(
  workspaceRoot: string,
  buildDirectory = sessionMonitorPaths().outputDir,
  environment: SessionMonitorEnvironment = {},
): Promise<SessionMonitorInstallResult> {
  const paths = sessionMonitorWorkspaceInstallPaths(workspaceRoot, environment);
  const destination = assertSessionMonitorDestination(workspaceRoot, paths.destination, environment);
  assertNoReparsePath(destination, 'Session Monitor installation destination');
  assertNoReparsePath(paths.backupRoot, 'Session Monitor backup root');
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

async function main(): Promise<void> {
  const workspaceRootFlag = process.argv.indexOf('--workspace-root');
  const workspaceRoot = workspaceRootFlag >= 0
    ? resolve(process.argv[workspaceRootFlag + 1] ?? '')
    : resolve(import.meta.dir);
  const result = await buildSessionMonitorPackage();
  console.log(`Built ${result.outputDir}`);
  console.log(`Archive ${result.zipPath}`);
  if (process.argv.includes('--install')) {
    const installed = await installSessionMonitorPackage(workspaceRoot, result.outputDir, process.env);
    console.log(`Installed ${installed.destination}`);
    if (installed.backupPath) console.log(`Backup ${installed.backupPath}`);
  }
}

if (import.meta.main) await main();
