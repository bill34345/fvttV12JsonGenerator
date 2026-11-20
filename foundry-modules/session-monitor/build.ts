import { cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  ...['model', 'view', 'module-manual'].map((source) => ({
    pattern: new RegExp(`^// (?:.*[\\\\/])?packages[\\\\/]suite-handbook[\\\\/]src[\\\\/]${source}[.]ts\\r?$`, 'gm'),
    canonical: `// @fvtt-json-generator/suite-handbook/${source}.ts`,
  })),
  {
    pattern: /^\/\/ (?:.*[\\/])?docs[\\/]manual[.]json\r?$/gm,
    canonical: '// docs/manual.json',
  },
  {
    pattern: /^\/\/ (?:.*[\\/])?packages[\\/]contracts[\\/]src[\\/]hash[.]ts\r?$/gm,
    canonical: '// @fvtt-json-generator/contracts/hash.ts',
  },
  ...['schema', 'metrics', 'storage', 'runtime', 'index', 'help', 'combat-evidence', 'browser-evidence'].map((source) => ({
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
  buildHash?: string;
  installHash?: string;
  previousHash?: string;
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
  assertNoReparsePath(paths.outputRoot, 'Session Monitor build output');
  try {
    await rm(paths.outputRoot, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
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
  await assertOwnedModule(buildDirectory);
  const manifest = JSON.parse(await readFile(resolve(buildDirectory, 'module.json'), 'utf8')) as { version?: string };
  const source = JSON.parse(await readFile(resolve(import.meta.dir, 'src/module.json'), 'utf8')) as { version?: string };
  if (manifest.version !== source.version) throw new Error('Session Monitor installer requires the current native dnd5e 6 release.');
  const buildHash = await packageHash(buildDirectory);
  let existingHash: string | undefined;
  if (await exists(destination)) {
    await assertOwnedModule(destination, true);
    existingHash = await packageHash(destination);
  }
  if (existingHash === buildHash) return { destination, buildHash, installHash: buildHash, previousHash: existingHash };
  const staging = `${destination}.installing`;
  assertNoReparsePath(staging, 'Session Monitor staging');
  if (await exists(staging)) throw new Error(`Refusing to overwrite stale staging directory: ${staging}`);
  await mkdir(dirname(destination), { recursive: true });
  await cp(buildDirectory, staging, { recursive: true, errorOnExist: true, force: false });
  try {
    await assertOwnedModule(staging);
    if (await packageHash(staging) !== buildHash) throw new Error('Staged Session Monitor differs from the validated build.');
    assertNoReparsePath(destination, 'Session Monitor installation destination');
    if (existingHash) {
      if (await packageHash(destination) !== existingHash) throw new Error('Existing Session Monitor changed after validation.');
      await rm(destination, { recursive: true });
    } else if (await exists(destination)) throw new Error('Session Monitor destination appeared after validation.');
    await rename(staging, destination);
    await assertOwnedModule(destination);
    if (await packageHash(destination) !== buildHash) throw new Error('Installed Session Monitor differs from the validated build.');
  } catch (error) {
    throw new Error(`Session Monitor install failed; inspect ${destination} before retrying: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  } finally {
    if (await exists(staging) && await packageHash(staging) === buildHash) await rm(staging, { recursive: true });
  }
  return { destination, buildHash, installHash: buildHash, ...(existingHash ? { previousHash: existingHash } : {}) };
}

async function packageHash(root: string): Promise<string> {
  assertNoReparsePath(root, 'Session Monitor package');
  const files: Array<{ path: string; sha256: string }> = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of (await readdir(directory)).sort()) {
      const path = resolve(directory, entry); const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error(`Unsafe module symlink or junction: ${path}`);
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) files.push({ path: relative(root, path).replace(/\\/g, '/'), sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
      else throw new Error(`Unsafe module entry: ${path}`);
    }
  }
  await visit(root);
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
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
    console.log(JSON.stringify({ buildHash: installed.buildHash, installHash: installed.installHash, previousHash: installed.previousHash }));
  }
}

if (import.meta.main) await main();
