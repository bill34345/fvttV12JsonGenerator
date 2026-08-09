import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

import {
  MODULE_ID,
  assertZipMatchesModule,
  buildBloodHunterModule,
  compareModuleStaticFiles,
  inspectModuleTree,
  type BuildResult,
  type ModuleInspection,
} from './build.ts';
import {
  assertExactLabPath,
  assertExactRepoPath,
  assertInsideLabRoot,
  assertInsideRoot,
  assertNoReparsePathComponents,
  createLabConfig,
  type BloodHunterLabConfig,
} from './labConfig.ts';

export type LabCliAction = 'dry-run' | 'build' | 'install' | 'verify-install';

export interface LabCliRequest {
  action: LabCliAction;
  apply: boolean;
  sourcePath?: string;
}

export interface BloodHunterLabPaths {
  buildRoot: string;
  distRoot: string;
  zipPath: string;
  modulesRoot: string;
  destination: string;
  staging: string;
  backupRoot: string;
}

export interface InstallOptions {
  apply: boolean;
  now?: () => Date;
  beforeDestinationMutation?: () => Promise<void> | void;
  afterStaging?: (path: string) => Promise<void> | void;
  rename?: (from: string, to: string) => Promise<void>;
}

export interface InstallResult {
  action: 'dry-run' | 'install';
  apply: boolean;
  changed: boolean;
  destination: string;
  buildHash: string;
  installHash?: string;
  backupPath?: string;
  actions?: string[];
  manifestConsistent?: boolean;
  packConsistent?: boolean;
  staticConsistent?: boolean;
}

interface OwnedDestinationState {
  exists: boolean;
  inspection?: ModuleInspection;
  rawHash?: string;
}

export function parseBloodHunterLabCliArgs(args: readonly string[]): LabCliRequest {
  const [action, ...rest] = args;
  if (action !== 'dry-run' && action !== 'build' && action !== 'install' && action !== 'verify-install') throw new Error('Blood Hunter labCli action must be dry-run, build, install, or verify-install.');
  const applyCount = rest.filter((argument) => argument === '--apply').length;
  if (applyCount > 1) throw new Error('--apply may be supplied at most once.');
  const sourceArguments = rest.filter((argument) => argument.startsWith('--source='));
  if (sourceArguments.length > 1) throw new Error('--source may be supplied at most once.');
  const unsupported = rest.filter((argument) => argument !== '--apply' && !argument.startsWith('--source='));
  if (unsupported.length > 0) throw new Error(`Unsupported Blood Hunter labCli argument: ${unsupported[0]}`);
  if (action === 'build' && sourceArguments.length !== 1) throw new Error('Blood Hunter build requires exactly one --source=<absolute-json> argument.');
  if (action !== 'build' && sourceArguments.length > 0) throw new Error(`--source is only valid for Blood Hunter build, not ${action}.`);
  if (action !== 'install' && applyCount > 0) throw new Error('--apply is only valid for Blood Hunter install.');
  const sourcePath = sourceArguments[0]?.slice('--source='.length);
  if (sourcePath !== undefined && !sourcePath) throw new Error('--source must not be empty.');
  return { action, apply: applyCount === 1, ...(sourcePath ? { sourcePath } : {}) };
}

export function bloodHunterLabPaths(config: BloodHunterLabConfig): BloodHunterLabPaths {
  if (config.moduleId !== MODULE_ID) throw new Error('Configured Blood Hunter module ID is not exact.');
  const distRoot = resolve(config.moduleRoot, 'dist');
  const modulesRoot = resolve(config.profiles.serverMirror.dataPath, 'Data/modules');
  const destination = resolve(modulesRoot, MODULE_ID);
  return {
    buildRoot: resolve(distRoot, 'module'),
    distRoot,
    zipPath: resolve(distRoot, `${MODULE_ID}.zip`),
    modulesRoot,
    destination,
    staging: resolve(modulesRoot, `.${MODULE_ID}.installing`),
    backupRoot: resolve(config.backupRoot, MODULE_ID),
  };
}

function assertConfiguredLab(config: BloodHunterLabConfig): void {
  if (!config.labRootConfigured) throw new Error('Blood Hunter Lab operations require an explicitly configured FVTT_OPS_LAB_ROOT; the repository fallback is never an install target.');
  assertInsideLabRoot(config, config.labRoot, 'FVTT_OPS_LAB_ROOT');
}

function assertBloodHunterBuildPaths(config: BloodHunterLabConfig, paths: BloodHunterLabPaths): void {
  assertExactRepoPath(config, paths.distRoot, ['foundry-modules', MODULE_ID, 'dist'], 'Blood Hunter dist');
  assertExactRepoPath(config, paths.buildRoot, ['foundry-modules', MODULE_ID, 'dist', 'module'], 'Blood Hunter build module');
  assertExactRepoPath(config, paths.zipPath, ['foundry-modules', MODULE_ID, 'dist', `${MODULE_ID}.zip`], 'Blood Hunter ZIP');
}

function assertBloodHunterLabPaths(config: BloodHunterLabConfig, paths: BloodHunterLabPaths): void {
  assertConfiguredLab(config);
  assertExactLabPath(config, paths.modulesRoot, ['data', 'server-mirror', 'Data', 'modules'], 'Blood Hunter Lab modules root');
  assertExactLabPath(config, paths.destination, ['data', 'server-mirror', 'Data', 'modules', MODULE_ID], 'Blood Hunter Lab module destination');
  assertExactLabPath(config, paths.staging, ['data', 'server-mirror', 'Data', 'modules', `.${MODULE_ID}.installing`], 'Blood Hunter Lab module staging');
  assertInsideRoot(config.labRoot, paths.backupRoot, 'Blood Hunter backup root');
}

export async function buildBloodHunterForLab(config: BloodHunterLabConfig, sourcePath: string): Promise<BuildResult> {
  const paths = bloodHunterLabPaths(config);
  assertBloodHunterBuildPaths(config, paths);
  if (!sourcePath) throw new Error('Blood Hunter source path is required.');
  if (!isAbsolute(sourcePath)) throw new Error('Blood Hunter source path must be absolute.');
  return buildBloodHunterModule({ sourcePath, config });
}

export async function dryRunBloodHunterInstall(config: BloodHunterLabConfig): Promise<InstallResult> {
  const paths = bloodHunterLabPaths(config);
  assertBloodHunterBuildPaths(config, paths);
  assertBloodHunterLabPaths(config, paths);
  await assertZipMatchesModule(paths.zipPath, paths.buildRoot);
  const build = await inspectModuleTree(paths.buildRoot, config, true);
  await rejectForeignOrUnsafeDestination(config, paths);
  const existingState = await inspectOwnedDestination(config, paths);
  const existing = existingState.inspection;
  return {
    action: 'dry-run',
    apply: false,
    changed: existing ? !compareModuleLogicalContent(build, existing) : existingState.exists,
    destination: paths.destination,
    buildHash: build.hash,
    ...(existing ? { installHash: existing.hash } : {}),
    manifestConsistent: existing ? compareManifestIdentity(build, existing) : undefined,
    packConsistent: existing ? comparePackDocuments(build, existing) : undefined,
    staticConsistent: existing ? compareModuleStaticFiles(build, existing) : undefined,
    actions: [
      'Validate the exact built module tree and ZIP metadata',
      'Reject foreign same-ID, reparse, path-escape, LOCK, and occupied targets',
      'Back up an owned destination under the configured backup root',
      'Atomically replace only the exact server-mirror module directory if --apply is supplied',
    ],
  };
}

export async function installBloodHunterModule(config: BloodHunterLabConfig, options: InstallOptions): Promise<InstallResult> {
  const paths = bloodHunterLabPaths(config);
  assertBloodHunterBuildPaths(config, paths);
  assertBloodHunterLabPaths(config, paths);
  await assertZipMatchesModule(paths.zipPath, paths.buildRoot);
  const build = await inspectModuleTree(paths.buildRoot, config, true);
  await rejectForeignOrUnsafeDestination(config, paths);
  const existingState = await inspectOwnedDestination(config, paths);
  const existing = existingState.inspection;
  if (!options.apply) {
    return {
      action: 'install',
      apply: false,
      changed: existing ? !compareModuleLogicalContent(build, existing) : existingState.exists,
      destination: paths.destination,
      buildHash: build.hash,
      ...(existing ? { installHash: existing.hash } : {}),
      actions: ['Validate deterministic build', 'Back up only an owned same-ID module', 'Atomically replace exact server-mirror destination'],
    };
  }
  if (existing && compareModuleLogicalContent(build, existing)) return { action: 'install', apply: true, changed: false, destination: paths.destination, buildHash: build.hash, installHash: existing.hash, manifestConsistent: true, packConsistent: true, staticConsistent: true };
  await options.beforeDestinationMutation?.();
  await assertNoLocksOrOccupancy(paths.destination);
  if (await exists(paths.staging)) throw new Error(`Refusing to overwrite stale Blood Hunter staging directory: ${paths.staging}`);
  await mkdir(paths.modulesRoot, { recursive: true });
  assertBloodHunterLabPaths(config, paths);
  const move = options.rename ?? rename;
  let backupPath: string | undefined;
  let movedExisting = false;
  let movedStaging = false;
  try {
    await cp(paths.buildRoot, paths.staging, { recursive: true, force: false, errorOnExist: true });
    await options.afterStaging?.(paths.staging);
    const staged = await inspectModuleTree(paths.staging, config, true);
    if (staged.hash !== build.hash) {
      const buildFiles = new Map(build.files.map((entry) => [entry.path, `${entry.size}:${entry.sha256}`]));
      const stagedFiles = new Map(staged.files.map((entry) => [entry.path, `${entry.size}:${entry.sha256}`]));
      const differences = [...new Set([...buildFiles.keys(), ...stagedFiles.keys()])]
        .filter((path) => buildFiles.get(path) !== stagedFiles.get(path))
        .sort((left, right) => left.localeCompare(right, 'en'));
      throw new Error(`Blood Hunter staged module differs from the validated build: ${differences.join(', ') || 'tree hash only'}.`);
    }
    await assertNoLocksOrOccupancy(paths.destination);
    if (existingState.exists) {
      backupPath = resolve(paths.backupRoot, timestamp(options.now ?? (() => new Date())), 'module');
      assertInsideRoot(config.labRoot, backupPath, 'Blood Hunter backup destination');
      await mkdir(dirname(backupPath), { recursive: true });
      const current = await inspectOwnedDestination(config, paths);
      if (!current.exists || current.rawHash !== existingState.rawHash) throw new Error('Owned Blood Hunter destination changed after preflight; refusing replacement.');
      await move(paths.destination, backupPath);
      movedExisting = true;
    } else if (await exists(paths.destination)) {
      throw new Error('Blood Hunter destination appeared after preflight; refusing replacement.');
    }
    await move(paths.staging, paths.destination);
    movedStaging = true;
    const installed = await inspectModuleTree(paths.destination, config, true);
    if (installed.hash !== build.hash) throw new Error('Installed Blood Hunter module differs from the validated build.');
    return {
      action: 'install',
      apply: true,
      changed: true,
      destination: paths.destination,
      buildHash: build.hash,
      installHash: installed.hash,
      ...(backupPath ? { backupPath } : {}),
      manifestConsistent: compareManifestIdentity(build, installed),
      packConsistent: comparePackDocuments(build, installed),
      staticConsistent: compareModuleStaticFiles(build, installed),
    };
  } catch (error) {
    const recoveryErrors: unknown[] = [error];
    if (movedStaging && await exists(paths.destination)) {
      try {
        await rm(paths.destination, { recursive: true, force: true });
      } catch (cleanupError) { recoveryErrors.push(cleanupError); }
    }
    if (movedExisting && backupPath && await exists(backupPath) && !(await exists(paths.destination))) {
      try {
        await move(backupPath, paths.destination);
      } catch (restoreError) { recoveryErrors.push(restoreError); }
    }
    if (await exists(paths.staging)) {
      try { await rm(paths.staging, { recursive: true, force: true }); } catch (cleanupError) { recoveryErrors.push(cleanupError); }
    }
    throw new AggregateError(recoveryErrors, `Blood Hunter install failed; owned backup restore attempted: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function verifyBloodHunterInstall(config: BloodHunterLabConfig): Promise<InstallResult> {
  const paths = bloodHunterLabPaths(config);
  assertBloodHunterBuildPaths(config, paths);
  assertBloodHunterLabPaths(config, paths);
  await assertZipMatchesModule(paths.zipPath, paths.buildRoot);
  const build = await inspectModuleTree(paths.buildRoot, config, true);
  const installed = await inspectModuleTree(paths.destination, config, true);
  const staticConsistent = compareModuleStaticFiles(build, installed);
  const manifestConsistent = compareManifestIdentity(build, installed);
  const packConsistent = comparePackDocuments(build, installed);
  if (!staticConsistent || !manifestConsistent || !packConsistent) throw new Error('Installed Blood Hunter static files, manifest/identity, or LevelDB Item documents do not match the built module.');
  return { action: 'install', apply: false, changed: false, destination: paths.destination, buildHash: build.hash, installHash: installed.hash, manifestConsistent, packConsistent, staticConsistent };
}

async function rejectForeignOrUnsafeDestination(config: BloodHunterLabConfig, paths: BloodHunterLabPaths): Promise<void> {
  if (!(await exists(paths.destination))) return;
  assertNoReparsePathComponents(parse(config.labRoot).root, paths.destination, 'Blood Hunter Lab destination');
  const markerPath = resolve(paths.destination, 'data/owned-marker.json');
  const markerStats = await lstat(markerPath).catch(() => undefined);
  if (!markerStats?.isFile() || markerStats.isSymbolicLink()) throw new Error(`Foreign same-ID Blood Hunter destination refused: ${paths.destination}`);
  const marker = await readJson(markerPath);
  if (marker.owned !== true || marker.moduleId !== MODULE_ID || marker.version !== '1.0.0') throw new Error(`Foreign same-ID Blood Hunter destination refused: ${paths.destination}`);
  await assertNoLocksOrOccupancy(paths.destination);
}

async function inspectOwnedDestination(config: BloodHunterLabConfig, paths: BloodHunterLabPaths): Promise<OwnedDestinationState> {
  if (!(await exists(paths.destination))) return { exists: false };
  const rawHash = await hashDirectory(paths.destination);
  try {
    return { exists: true, rawHash, inspection: await inspectModuleTree(paths.destination, config, true) };
  } catch {
    // An owned destination may be from the pre-v14 writer (for example, the
    // old root-level !index layout). It is safe to replace only after the
    // ownership, lock, and raw-tree checks above; logical inspection is not
    // required to create the recoverable backup.
    return { exists: true, rawHash };
  }
}

async function hashDirectory(root: string): Promise<string> {
  const hash = createHash('sha256');
  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error(`Blood Hunter destination contains a symlink/reparse point: ${path}`);
      if (stats.isDirectory()) {
        hash.update(`d\0${relativePath}\0`);
        await visit(path, relativePath);
      } else if (stats.isFile()) {
        hash.update(`f\0${relativePath}\0${stats.size}\0`);
        hash.update(await readFile(path));
      } else {
        throw new Error(`Blood Hunter destination contains an unsupported filesystem entry: ${path}`);
      }
    }
  }
  await visit(root, '');
  return hash.digest('hex');
}

function compareManifestIdentity(left: ModuleInspection, right: ModuleInspection): boolean {
  return canonicalJson(left.identity) === canonicalJson(right.identity) && canonicalJson(left.manifest) === canonicalJson(right.manifest);
}

function comparePackDocuments(left: ModuleInspection, right: ModuleInspection): boolean {
  for (const pack of ['classes', 'subclasses', 'features']) {
    if (canonicalJson(left.packs[pack] ?? []) !== canonicalJson(right.packs[pack] ?? [])) return false;
  }
  return true;
}

function compareModuleLogicalContent(left: ModuleInspection, right: ModuleInspection): boolean {
  return compareModuleStaticFiles(left, right) && compareManifestIdentity(left, right) && comparePackDocuments(left, right);
}

async function assertNoLocksOrOccupancy(root: string): Promise<void> {
  if (!(await exists(root))) return;
  const stats = await lstat(root);
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`Blood Hunter target is not a real directory: ${root}`);
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.name.toLocaleUpperCase('en') === 'LOCK') throw new Error(`Blood Hunter target has a LevelDB LOCK and may be occupied: ${path}`);
      const childStats = await lstat(path);
      if (childStats.isSymbolicLink()) throw new Error(`Blood Hunter target contains a symlink/junction/reparse point: ${path}`);
      if (childStats.isDirectory()) await visit(path);
      else if (childStats.isFile()) {
        let handle;
        try { handle = await open(path, 'r+'); } catch (error) { throw new Error(`Blood Hunter target file is locked or not writable: ${path}: ${error instanceof Error ? error.message : String(error)}`); }
        await handle.close();
      }
    }
  }
  await visit(root);
}

function timestamp(now: () => Date): string {
  return now().toISOString().replace(/[:.]/g, '-');
}

async function readJson(path: string): Promise<Record<string, any>> {
  const file = await import('node:fs/promises');
  return JSON.parse(await file.readFile(path, 'utf8')) as Record<string, any>;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

async function exists(path: string): Promise<boolean> {
  return Boolean(await lstat(path).catch(() => undefined));
}
