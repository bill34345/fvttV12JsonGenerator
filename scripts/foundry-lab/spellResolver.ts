import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertSpellResolverBuildMutationBoundary,
  buildSpellResolverPackage,
  type SpellResolverBuildResult,
} from '../buildSpellResolver';
import {
  assertExactLabPath,
  assertExactRepoPath,
  assertInsideLabRoot,
  type FoundryLabConfig,
} from './config';

export const SPELL_RESOLVER_MODULE_ID = 'fvtt-json-generator-spell-resolver' as const;
const APPROVED_WORLD_ID = 'fvtt-v14-module-matrix' as const;
const MODULE_VERSION = '0.1.0' as const;

export interface SpellResolverPaths {
  buildDir: string;
  zipPath: string;
  modulesRoot: string;
  destination: string;
  backupRoot: string;
  approvedWorldRoot: string;
  approvedWorldSettings: string;
}

export interface PackageTreeInspection {
  root: string;
  hash: string;
  files: Array<{ path: string; size: number; sha256: string }>;
  manifest: Record<string, unknown>;
}

export interface InstallResult {
  apply: boolean;
  changed: boolean;
  destination: string;
  buildHash?: string;
  installHash?: string;
  backupPath?: string;
  actions?: string[];
}

export interface VerifyInstallResult {
  ok: true;
  destination: string;
  buildHash: string;
  installHash: string;
  foundryVersion: '14.364';
  dnd5eVersion: '5.3.3';
}

export interface PrepareWorldResult {
  apply: boolean;
  changed: boolean;
  worldId: typeof APPROVED_WORLD_ID;
  backupPath?: string;
  before?: Record<string, boolean>;
  after?: Record<string, boolean>;
  actions?: string[];
}

export interface WorldSettingsStore {
  preflight(settingsPath: string): Promise<Record<string, boolean>>;
  updateFromBackup(
    settingsPath: string,
    backupPath: string,
    transform: (current: Record<string, boolean>) => Record<string, boolean>,
  ): Promise<{ before: Record<string, boolean>; after: Record<string, boolean>; changed: boolean }>;
}

export type ClassicLevelConstructor = new (path: string, options: Record<string, unknown>) => {
  open(): Promise<void>;
  close(): Promise<void>;
  iterator(): AsyncIterable<[string, unknown]>;
  put(key: string, value: unknown): Promise<void>;
};

interface ClassicLevelStoreDependencies {
  ClassicLevel?: ClassicLevelConstructor;
  temporaryRoot?: string;
  beforeOriginalOpen?: () => Promise<void>;
}

interface MutationOptions {
  apply: boolean;
  now?: () => Date;
  installSeam?: InstallMutationSeam;
}

interface BuildLabOptions {
  buildPackage?: () => Promise<SpellResolverBuildResult>;
}

interface InstallMutationSeam {
  beforeStagingMutation?: () => Promise<void>;
  beforeDestinationMutation?: () => Promise<void>;
  rename?: (source: string, destination: string) => Promise<void>;
  cleanupStaging?: (path: string) => Promise<void>;
  verifyReplacement?: (destination: string) => Promise<PackageTreeInspection>;
}

interface PrepareOptions extends MutationOptions {
  settingsStore?: WorldSettingsStore;
  worldSettingsSeam?: {
    beforeBackupCopy?: () => Promise<void>;
  };
}

export type SpellResolverCliArgs =
  | { action: 'build' | 'verify-install'; apply: false }
  | { action: 'install' | 'uninstall'; apply: boolean }
  | { action: 'prepare-world'; apply: boolean; world: string };

export function parseSpellResolverCliArgs(args: readonly string[]): SpellResolverCliArgs {
  const [action, ...rest] = args;
  if (!['build', 'install', 'verify-install', 'prepare-world', 'uninstall'].includes(action ?? '')) {
    throw new Error(`Unsupported spell-resolver action: ${action ?? '<missing>'}`);
  }
  const applyCount = rest.filter((argument) => argument === '--apply').length;
  if (applyCount > 1) throw new Error('Duplicate spell-resolver --apply argument.');

  if (action === 'build' || action === 'verify-install') {
    if (rest.length > 0) throw new Error(`Unsupported argument for spell-resolver ${action}: ${rest[0]}`);
    return { action, apply: false };
  }
  if (action === 'install' || action === 'uninstall') {
    if (rest.some((argument) => argument !== '--apply')) {
      throw new Error(`Unsupported argument for spell-resolver ${action}: ${rest.find((argument) => argument !== '--apply')}`);
    }
    return { action, apply: applyCount === 1 };
  }

  const worldArguments = rest.filter((argument) => argument.startsWith('--world='));
  if (worldArguments.length !== 1) {
    throw new Error('spell-resolver prepare-world requires exactly one --world argument.');
  }
  if (rest.some((argument) => argument !== '--apply' && !argument.startsWith('--world='))) {
    throw new Error(`Unsupported argument for spell-resolver prepare-world: ${rest.find((argument) => argument !== '--apply' && !argument.startsWith('--world='))}`);
  }
  const world = worldArguments[0]!.slice('--world='.length);
  if (!world) throw new Error('spell-resolver prepare-world requires a non-empty --world argument.');
  return { action: 'prepare-world', apply: applyCount === 1, world };
}

export function spellResolverPaths(config: FoundryLabConfig): SpellResolverPaths {
  if (config.spellResolver.moduleId !== SPELL_RESOLVER_MODULE_ID
    || config.spellResolver.disposableWorldId !== APPROVED_WORLD_ID) {
    throw new Error('Foundry Lab spell resolver targets do not match the approved module and disposable world.');
  }
  const modulesRoot = resolve(config.profiles.serverMirror.dataPath, 'Data/modules');
  const approvedWorldRoot = resolve(config.profiles.serverMirror.dataPath, 'Data/worlds', APPROVED_WORLD_ID);
  return {
    buildDir: resolve(config.repoRoot, 'dist', SPELL_RESOLVER_MODULE_ID),
    zipPath: resolve(config.repoRoot, 'dist', `${SPELL_RESOLVER_MODULE_ID}.zip`),
    modulesRoot,
    destination: resolve(modulesRoot, SPELL_RESOLVER_MODULE_ID),
    backupRoot: resolve(config.evidenceRoot, 'spell-resolver-backups'),
    approvedWorldRoot,
    approvedWorldSettings: resolve(approvedWorldRoot, 'data/settings'),
  };
}

export function assertExactSpellResolverDestination(config: FoundryLabConfig, target: string): void {
  const expected = spellResolverPaths(config).destination;
  if (resolve(target) !== expected) {
    throw new Error(`Spell resolver destination must be the exact server-mirror module path: ${expected}`);
  }
  assertInsideLabRoot(config, target);
  assertInsideLabRoot(config, dirname(target));
  assertExactLabPath(config, target, [
    'data', 'server-mirror', 'Data', 'modules', SPELL_RESOLVER_MODULE_ID,
  ], 'Spell resolver destination');
}

function assertExactSpellResolverModulesRoot(config: FoundryLabConfig, target: string): void {
  assertExactLabPath(config, target, [
    'data', 'server-mirror', 'Data', 'modules',
  ], 'Spell resolver modules root');
}

function assertExactSpellResolverStaging(config: FoundryLabConfig, target: string): void {
  assertExactLabPath(config, target, [
    'data', 'server-mirror', 'Data', 'modules', `.${SPELL_RESOLVER_MODULE_ID}.installing`,
  ], 'Spell resolver staging directory');
}

export async function buildSpellResolverForLab(
  config: FoundryLabConfig,
  options: BuildLabOptions = {},
): Promise<PackageTreeInspection> {
  if (resolve(config.repoRoot) !== resolve(process.cwd())) {
    throw new Error('Spell resolver build must run from the configured repository root.');
  }
  const paths = spellResolverPaths(config);
  assertExactBuildDirectory(config, paths.buildDir);
  assertExactRepoPath(config, paths.zipPath, ['dist', `${SPELL_RESOLVER_MODULE_ID}.zip`], 'Spell resolver ZIP path');
  const buildBoundary = assertSpellResolverBuildMutationBoundary(config.repoRoot);
  if (buildBoundary.outputDir !== paths.buildDir || buildBoundary.zipPath !== paths.zipPath) {
    throw new Error('Spell resolver builder paths do not match the approved Foundry Lab build paths.');
  }
  await (options.buildPackage ?? buildSpellResolverPackage)();
  return inspectBuiltSpellResolver(config);
}

export async function inspectBuiltSpellResolver(config: FoundryLabConfig): Promise<PackageTreeInspection> {
  const paths = spellResolverPaths(config);
  assertExactBuildDirectory(config, paths.buildDir);
  return inspectPackageTree(paths.buildDir, true);
}

export async function installSpellResolver(config: FoundryLabConfig, options: MutationOptions): Promise<InstallResult> {
  const paths = spellResolverPaths(config);
  assertExactSpellResolverDestination(config, paths.destination);
  const build = await inspectBuiltSpellResolver(config);
  const existing = existsSync(paths.destination)
    ? await inspectPackageTree(paths.destination, false)
    : undefined;
  if (!options.apply) {
    return {
      apply: false,
      changed: false,
      destination: paths.destination,
      buildHash: build.hash,
      actions: ['Validate deterministic build', 'Back up an existing exact module', 'Atomically install into server-mirror'],
    };
  }

  if (existing?.hash === build.hash) {
    return {
      apply: true,
      changed: false,
      destination: paths.destination,
      buildHash: build.hash,
      installHash: existing.hash,
    };
  }

  await options.installSeam?.beforeStagingMutation?.();
  assertExactSpellResolverDestination(config, paths.destination);
  assertExactSpellResolverModulesRoot(config, paths.modulesRoot);
  await mkdir(paths.modulesRoot, { recursive: true });
  assertExactSpellResolverModulesRoot(config, paths.modulesRoot);
  const staging = resolve(paths.modulesRoot, `.${SPELL_RESOLVER_MODULE_ID}.installing`);
  assertExactSpellResolverStaging(config, staging);
  if (existsSync(staging)) throw new Error(`Refusing to overwrite stale spell resolver staging directory: ${staging}`);

  let backupPath: string | undefined;
  let movedExisting = false;
  let replacementInstalled = false;
  const move = options.installSeam?.rename ?? rename;
  const cleanupStaging = options.installSeam?.cleanupStaging
    ?? ((path: string) => rm(path, { recursive: true, force: true }));
  const verifyReplacement = options.installSeam?.verifyReplacement
    ?? ((destination: string) => inspectPackageTree(destination, false));
  try {
    assertExactBuildDirectory(config, paths.buildDir);
    assertExactSpellResolverStaging(config, staging);
    await cp(paths.buildDir, staging, { recursive: true, force: false, errorOnExist: true });
    assertExactSpellResolverStaging(config, staging);
    const staged = await inspectPackageTree(staging, false);
    if (staged.hash !== build.hash) throw new Error('Staged spell resolver hash differs from the validated build.');

    await options.installSeam?.beforeDestinationMutation?.();
    assertExactSpellResolverDestination(config, paths.destination);
    assertExactSpellResolverStaging(config, staging);
    await assertPackageHash(staging, build.hash, 'Staged spell resolver changed before destination mutation');

    if (existing) {
      backupPath = backupPathFor(paths, options.now ?? (() => new Date()), 'install');
      assertInsideLabRoot(config, backupPath);
      await mkdir(dirname(backupPath), { recursive: true });
      assertExactSpellResolverDestination(config, paths.destination);
      assertInsideLabRoot(config, backupPath);
      const currentExisting = await inspectPackageTree(paths.destination, false);
      if (currentExisting.hash !== existing.hash) {
        throw new Error('Existing spell resolver changed after validation; refusing replacement.');
      }
      await assertPackageHash(staging, build.hash, 'Staged spell resolver changed before existing-module backup');
      assertExactSpellResolverDestination(config, paths.destination);
      await move(paths.destination, backupPath);
      movedExisting = true;
    }
    assertExactSpellResolverDestination(config, paths.destination);
    assertExactSpellResolverStaging(config, staging);
    await assertPackageHash(staging, build.hash, 'Staged spell resolver changed before installation');
    assertExactSpellResolverStaging(config, staging);
    await move(staging, paths.destination);
    replacementInstalled = true;

    assertExactSpellResolverDestination(config, paths.destination);
    const installed = await verifyReplacement(paths.destination);
    if (installed.hash !== build.hash) {
      throw new Error('Installed spell resolver hash differs from the validated build after replacement.');
    }
    return {
      apply: true,
      changed: true,
      destination: paths.destination,
      buildHash: build.hash,
      installHash: installed.hash,
      ...(backupPath ? { backupPath } : {}),
    };
  } catch (error) {
    const recoveryErrors: unknown[] = [error];
    let recoveryRequired = false;
    if (replacementInstalled && existsSync(paths.destination)) {
      const quarantinePath = failedReplacementPathFor(paths, options.now ?? (() => new Date()));
      let destinationSafe = true;
      try {
        assertExactSpellResolverDestination(config, paths.destination);
        assertInsideLabRoot(config, quarantinePath);
        await assertPackageHash(
          paths.destination,
          build.hash,
          'Installed spell resolver changed before quarantine; recovery required',
        );
      } catch (pathError) {
        recoveryErrors.push(pathError);
        destinationSafe = false;
        recoveryRequired = true;
      }
      if (destinationSafe) {
        try {
          await mkdir(dirname(quarantinePath), { recursive: true });
          assertExactSpellResolverDestination(config, paths.destination);
          assertInsideLabRoot(config, quarantinePath);
          await assertPackageHash(
            paths.destination,
            build.hash,
            'Installed spell resolver changed before quarantine; recovery required',
          );
          assertExactSpellResolverDestination(config, paths.destination);
          await move(paths.destination, quarantinePath);
        } catch (quarantineError) {
          recoveryErrors.push(quarantineError);
          try {
            assertExactSpellResolverDestination(config, paths.destination);
            await assertPackageHash(
              paths.destination,
              build.hash,
              'Installed spell resolver changed before fallback removal; recovery required',
            );
            assertExactSpellResolverDestination(config, paths.destination);
            await rm(paths.destination, { recursive: true, force: true });
          } catch (removeError) {
            recoveryErrors.push(removeError);
            recoveryRequired = true;
          }
        }
      }
    }
    if (movedExisting && backupPath && existsSync(backupPath)) {
      try {
        if (existsSync(paths.destination)) {
          throw new Error(`Cannot restore spell resolver backup while destination still exists: ${paths.destination}`);
        }
        assertExactSpellResolverDestination(config, paths.destination);
        assertInsideLabRoot(config, backupPath);
        if (!existing) throw new Error('Cannot validate spell resolver backup without the original package identity.');
        const recoverable = await inspectPackageTree(backupPath, false);
        if (recoverable.hash !== existing.hash) {
          throw new Error('Spell resolver backup changed after validation; refusing restore.');
        }
        assertExactSpellResolverDestination(config, paths.destination);
        assertInsideLabRoot(config, backupPath);
        await move(backupPath, paths.destination);
      } catch (restoreError) {
        recoveryErrors.push(restoreError);
        recoveryRequired = true;
      }
    }
    if (existsSync(staging)) {
      try {
        assertExactSpellResolverStaging(config, staging);
        const remainingStaging = await inspectPackageTree(staging, false);
        if (remainingStaging.hash !== build.hash) {
          throw new Error('Spell resolver staging changed after validation; refusing cleanup.');
        }
        assertExactSpellResolverStaging(config, staging);
        await cleanupStaging(staging);
      } catch (cleanupError) {
        recoveryErrors.push(cleanupError);
      }
    }
    throw new AggregateError(
      recoveryErrors,
      recoveryRequired
        ? `Spell resolver install failed; recovery required: ${sanitizeError(error)}`
        : `Spell resolver install failed: ${sanitizeError(error)}`,
    );
  }
}

export async function verifySpellResolverInstall(config: FoundryLabConfig): Promise<VerifyInstallResult> {
  const paths = spellResolverPaths(config);
  assertExactSpellResolverDestination(config, paths.destination);
  assertExactFoundryRuntimePaths(config);
  const [build, installed, foundryPackage, dnd5eManifest] = await Promise.all([
    inspectBuiltSpellResolver(config),
    inspectPackageTree(paths.destination, false),
    readJson(resolve(config.appRoot, 'package.json')),
    readJson(resolve(config.profiles.serverMirror.dataPath, 'Data/systems/dnd5e/system.json')),
  ]);
  if (!existsSync(resolve(config.appRoot, 'main.js'))) throw new Error(`Foundry server entry is missing under ${config.appRoot}.`);
  const release = record(foundryPackage.release);
  if (release.generation !== 14 || release.build !== 364) {
    throw new Error(`Foundry application path is not exact 14.364: ${config.appRoot}`);
  }
  if (dnd5eManifest.id !== 'dnd5e' || dnd5eManifest.version !== config.versions.dnd5e) {
    throw new Error(`server-mirror dnd5e must be exactly ${config.versions.dnd5e}.`);
  }
  if (build.hash !== installed.hash) throw new Error('Installed spell resolver does not match the current validated build hash.');
  return {
    ok: true,
    destination: paths.destination,
    buildHash: build.hash,
    installHash: installed.hash,
    foundryVersion: config.versions.foundry,
    dnd5eVersion: config.versions.dnd5e,
  };
}

export async function uninstallSpellResolver(config: FoundryLabConfig, options: MutationOptions): Promise<InstallResult> {
  const paths = spellResolverPaths(config);
  assertExactSpellResolverDestination(config, paths.destination);
  if (!existsSync(paths.destination)) {
    return { apply: options.apply, changed: false, destination: paths.destination };
  }
  const installed = await inspectPackageTree(paths.destination, false);
  if (!options.apply) {
    return {
      apply: false,
      changed: false,
      destination: paths.destination,
      installHash: installed.hash,
      actions: ['Revalidate exact module identity', 'Move only the exact module directory to a recoverable lab backup'],
    };
  }
  const backupPath = backupPathFor(paths, options.now ?? (() => new Date()), 'uninstall');
  assertInsideLabRoot(config, backupPath);
  await mkdir(dirname(backupPath), { recursive: true });
  await options.installSeam?.beforeDestinationMutation?.();
  assertExactSpellResolverDestination(config, paths.destination);
  assertInsideLabRoot(config, backupPath);
  const currentInstalled = await inspectPackageTree(paths.destination, false);
  if (currentInstalled.hash !== installed.hash) {
    throw new Error('Installed spell resolver changed after validation; refusing uninstall.');
  }
  assertExactSpellResolverDestination(config, paths.destination);
  await rename(paths.destination, backupPath);
  return {
    apply: true,
    changed: true,
    destination: paths.destination,
    installHash: installed.hash,
    backupPath,
  };
}

export async function prepareSpellResolverWorld(
  config: FoundryLabConfig,
  worldId: string,
  options: PrepareOptions,
): Promise<PrepareWorldResult> {
  if (worldId !== APPROVED_WORLD_ID) {
    throw new Error(`Spell resolver preparation is restricted to the exact disposable world ${APPROVED_WORLD_ID}.`);
  }
  const paths = spellResolverPaths(config);
  assertExactLabPath(config, paths.approvedWorldRoot, [
    'data', 'server-mirror', 'Data', 'worlds', APPROVED_WORLD_ID,
  ], 'Disposable world root');
  assertExactLabPath(config, paths.approvedWorldSettings, [
    'data', 'server-mirror', 'Data', 'worlds', APPROVED_WORLD_ID, 'data', 'settings',
  ], 'Disposable world settings');
  const world = await readJson(resolve(paths.approvedWorldRoot, 'world.json'));
  if (world.id !== APPROVED_WORLD_ID
    || world.system !== 'dnd5e'
    || world.coreVersion !== config.versions.foundry
    || world.systemVersion !== config.versions.dnd5e) {
    throw new Error(`Disposable world metadata must be exactly ${APPROVED_WORLD_ID}, Foundry ${config.versions.foundry}, dnd5e ${config.versions.dnd5e}.`);
  }
  await verifySpellResolverInstall(config);
  const store = options.settingsStore ?? createClassicLevelWorldSettingsStore(config);
  const before = await store.preflight(paths.approvedWorldSettings);
  const after = { ...before, [SPELL_RESOLVER_MODULE_ID]: true };
  const needsChange = canonicalJson(before) !== canonicalJson(after);
  if (!options.apply) {
    return {
      apply: false,
      changed: false,
      worldId: APPROVED_WORLD_ID,
      before,
      after,
      actions: needsChange
        ? ['Create a durable backup of the disposable world settings database', `Enable only ${SPELL_RESOLVER_MODULE_ID}`]
        : ['Resolver is already enabled; no world change is required'],
    };
  }
  if (!needsChange) {
    return { apply: true, changed: false, worldId: APPROVED_WORLD_ID, before, after };
  }

  const backupPath = resolve(
    config.evidenceRoot,
    'spell-resolver-world-backups',
    timestamp(options.now ?? (() => new Date())),
    'settings',
  );
  assertInsideLabRoot(config, backupPath);
  await copyWorldSettingsBackup(
    config,
    paths.approvedWorldSettings,
    backupPath,
    options.worldSettingsSeam?.beforeBackupCopy,
  );
  const update = await store.updateFromBackup(
    paths.approvedWorldSettings,
    backupPath,
    (current) => ({ ...current, [SPELL_RESOLVER_MODULE_ID]: true }),
  );
  return {
    apply: true,
    changed: update.changed,
    worldId: APPROVED_WORLD_ID,
    backupPath,
    before: update.before,
    after: update.after,
  };
}

async function copyWorldSettingsBackup(
  config: FoundryLabConfig,
  source: string,
  destination: string,
  beforeCopy?: () => Promise<void>,
): Promise<void> {
  const staging = `${destination}.partial`;
  for (const path of [destination, staging]) assertInsideLabRoot(config, path);
  if (existsSync(destination) || existsSync(staging)) {
    throw new Error(`World settings backup target already exists: ${existsSync(destination) ? destination : staging}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await withStoppedWorldSettingsLock(config, source, async () => {
    try {
      await beforeCopy?.();
      assertInsideLabRoot(config, destination);
      assertInsideLabRoot(config, staging);
      await cp(source, staging, {
        recursive: true,
        force: false,
        errorOnExist: true,
        filter: (path) => basename(path).toLocaleLowerCase('en-US') !== 'lock',
      });
      await assertSafeSettingsTree(staging, 'World settings backup staging');
      assertInsideLabRoot(config, staging);
      await rename(staging, destination);
      assertInsideLabRoot(config, destination);
      await assertSafeSettingsTree(destination, 'World settings backup');
    } catch (error) {
      if (!existsSync(staging)) throw error;
      try {
        assertInsideLabRoot(config, staging);
        await rm(staging, { recursive: true, force: true });
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], `World settings backup failed: ${sanitizeError(error)}`);
      }
      throw error;
    }
  });
}

export function createClassicLevelWorldSettingsStore(
  config: FoundryLabConfig,
  dependencies: ClassicLevelStoreDependencies = {},
): WorldSettingsStore {
  const classicLevelPath = resolve(config.appRoot, 'node_modules/classic-level/index.js');
  const loadClassicLevel = async (): Promise<ClassicLevelConstructor> => {
    assertExactLabPath(config, classicLevelPath, [
      'app', '14.364', 'node_modules', 'classic-level', 'index.js',
    ], 'Foundry classic-level entry');
    if (dependencies.ClassicLevel) return dependencies.ClassicLevel;
    const imported = await import(pathToFileURL(classicLevelPath).href) as { ClassicLevel?: ClassicLevelConstructor };
    if (!imported.ClassicLevel) throw new Error(`Foundry classic-level constructor is unavailable: ${classicLevelPath}`);
    return imported.ClassicLevel;
  };
  return {
    async preflight(settingsPath) {
      const temporaryParent = dependencies.temporaryRoot ?? tmpdir();
      const temporaryDirectory = await mkdtemp(resolve(temporaryParent, 'fvtt-spell-resolver-preflight-'));
      const snapshotPath = resolve(temporaryDirectory, 'settings');
      try {
        await withStoppedWorldSettingsLock(config, settingsPath, async () => {
          await copySettingsTree(settingsPath, snapshotPath);
          await assertSafeSettingsTree(snapshotPath, 'World settings preflight snapshot');
        });
        const ClassicLevel = await loadClassicLevel();
        const snapshot = await readModuleConfigurationSetting(ClassicLevel, snapshotPath);
        return parseModuleConfiguration(snapshot.value.value);
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    },
    async updateFromBackup(settingsPath, backupPath, transform) {
      assertExactWorldSettingsPath(config, settingsPath);
      assertInsideLabRoot(config, backupPath);
      const durableBackupHash = await assertSafeSettingsTree(backupPath, 'World settings backup');
      const ClassicLevel = await loadClassicLevel();
      const temporaryParent = dependencies.temporaryRoot ?? tmpdir();
      const temporaryDirectory = await mkdtemp(resolve(temporaryParent, 'fvtt-spell-resolver-backup-read-'));
      const snapshotPath = resolve(temporaryDirectory, 'settings');
      let backup: { key: string; value: Record<string, unknown> } | undefined;
      const snapshotErrors: unknown[] = [];
      try {
        await copySettingsTree(backupPath, snapshotPath);
        await assertSafeSettingsTree(snapshotPath, 'World settings backup read snapshot');
        assertInsideLabRoot(config, backupPath);
        const afterCopyHash = await assertSafeSettingsTree(backupPath, 'World settings backup');
        if (afterCopyHash !== durableBackupHash) {
          throw new Error('Durable world settings backup changed while creating its read snapshot.');
        }
        backup = await readModuleConfigurationSetting(ClassicLevel, snapshotPath);
      } catch (error) {
        snapshotErrors.push(error);
      }
      try {
        await rm(temporaryDirectory, { recursive: true, force: true });
      } catch (error) {
        snapshotErrors.push(error);
      }
      try {
        assertInsideLabRoot(config, backupPath);
        const afterReadHash = await assertSafeSettingsTree(backupPath, 'World settings backup');
        if (afterReadHash !== durableBackupHash) {
          throw new Error('Durable world settings backup changed during snapshot-only validation.');
        }
      } catch (error) {
        snapshotErrors.push(error);
      }
      if (snapshotErrors.length > 0) {
        throw new AggregateError(snapshotErrors, `Durable world settings backup validation failed: ${sanitizeError(snapshotErrors[0])}`);
      }
      if (!backup) throw new Error('Durable world settings backup snapshot did not produce module configuration data.');
      const before = parseModuleConfiguration(backup.value.value);
      const after = transform(structuredClone(before));
      if (canonicalJson(before) === canonicalJson(after)) return { before, after, changed: false };

      await dependencies.beforeOriginalOpen?.();
      await withStoppedWorldSettingsLock(config, settingsPath, async () => undefined);
      assertExactWorldSettingsPath(config, settingsPath);
      await assertSafeSettingsTree(settingsPath, 'Disposable world settings database');
      const writer = new ClassicLevel(settingsPath, {
        createIfMissing: false,
        keyEncoding: 'utf8',
        valueEncoding: 'json',
      });
      await writer.open();
      try {
        const current = await findSettingByKey(writer.iterator(), 'core.moduleConfiguration');
        if (!current || current.key !== backup.key || canonicalJson(current.value) !== canonicalJson(backup.value)) {
          throw new Error('Disposable world module configuration changed after backup; refusing to overwrite it.');
        }
        const stats = record(current.value._stats);
        await writer.put(current.key, {
          ...current.value,
          value: JSON.stringify(after),
          ...(Object.keys(stats).length > 0 ? { _stats: { ...stats, modifiedTime: Date.now() } } : {}),
        });
      } finally {
        await writer.close();
      }
      return { before, after, changed: true };
    },
  };
}

async function readModuleConfigurationSetting(
  ClassicLevel: ClassicLevelConstructor,
  settingsPath: string,
): Promise<{ key: string; value: Record<string, unknown> }> {
  const database = new ClassicLevel(settingsPath, {
    createIfMissing: false,
    keyEncoding: 'utf8',
    valueEncoding: 'json',
  });
  await database.open();
  try {
    const setting = await findSettingByKey(database.iterator(), 'core.moduleConfiguration');
    if (!setting) throw new Error('Disposable world has no core.moduleConfiguration setting to update safely.');
    return setting;
  } finally {
    await database.close();
  }
}

export async function withStoppedWorldSettingsLock<T>(
  config: FoundryLabConfig,
  settingsPath: string,
  run: () => Promise<T>,
): Promise<T> {
  assertExactWorldSettingsPath(config, settingsPath);
  const stats = await lstat(settingsPath).catch(() => undefined);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Disposable world settings database is missing or unsafe: ${settingsPath}`);
  }
  const lockPath = resolve(settingsPath, 'LOCK');
  const lockStats = await lstat(lockPath).catch(() => undefined);
  if (!lockStats?.isFile() || lockStats.isSymbolicLink()) {
    throw new Error(`Disposable world settings database LOCK is missing or unsafe: ${lockPath}`);
  }
  let handle;
  try {
    handle = await open(lockPath, 'r+');
  } catch (error) {
    throw new Error(`Disposable world settings database is locked; stop the world before continuing: ${sanitizeError(error)}`);
  }
  try {
    const before = await assertSafeSettingsTree(settingsPath, 'Disposable world settings database');
    let result: T | undefined;
    let operationError: unknown;
    try {
      result = await run();
    } catch (error) {
      operationError = error;
    }
    let stabilityError: unknown;
    try {
      const after = await assertSafeSettingsTree(settingsPath, 'Disposable world settings database');
      if (after !== before) {
        stabilityError = new Error('Disposable world settings tree changed during the protected operation.');
      }
    } catch (error) {
      stabilityError = error;
    }
    if (operationError && stabilityError) {
      throw new AggregateError(
        [operationError, stabilityError],
        `Protected world settings operation failed: ${sanitizeError(operationError)}`,
      );
    }
    if (operationError) throw operationError;
    if (stabilityError) throw stabilityError;
    return result as T;
  } finally {
    await handle.close();
  }
}

function assertExactWorldSettingsPath(config: FoundryLabConfig, settingsPath: string): void {
  assertExactLabPath(config, settingsPath, [
    'data', 'server-mirror', 'Data', 'worlds', APPROVED_WORLD_ID, 'data', 'settings',
  ], 'Disposable world settings');
}

async function copySettingsTree(source: string, destination: string): Promise<void> {
  if (existsSync(destination)) throw new Error(`Settings snapshot target already exists: ${destination}`);
  await cp(source, destination, {
    recursive: true,
    force: false,
    errorOnExist: true,
    filter: (path) => basename(path).toLocaleLowerCase('en-US') !== 'lock',
  });
}

async function assertSafeSettingsTree(root: string, label: string): Promise<string> {
  const rootStats = await lstat(root).catch(() => undefined);
  if (!rootStats?.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error(`${label} root is missing or contains a symlink, junction, or reparse point: ${root}`);
  }
  const physicalRoot = await realpath(root);
  const entries: Array<{ path: string; type: 'directory' | 'file'; size?: number; sha256?: string }> = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) {
        throw new Error(`${label} contains a symlink, junction, or reparse point: ${path}`);
      }
      const physicalPath = await realpath(path);
      const rel = relative(physicalRoot, physicalPath);
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error(`${label} entry escapes its physical root: ${path}`);
      }
      const entryPath = relative(root, path).split(sep).join('/');
      if (stats.isDirectory()) {
        entries.push({ path: entryPath, type: 'directory' });
        await visit(path);
      }
      else if (stats.isFile()) {
        if (stats.nlink !== 1) throw new Error(`${label} contains a multiply-linked file: ${path}`);
        const bytes = await readFile(path);
        entries.push({
          path: entryPath,
          type: 'file',
          size: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      } else throw new Error(`${label} contains an unsupported filesystem entry: ${path}`);
    }
  }
  await visit(root);
  entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  return createHash('sha256').update(canonicalJson(entries)).digest('hex');
}

async function findSettingByKey(
  iterator: AsyncIterable<[string, unknown]>,
  settingKey: string,
): Promise<{ key: string; value: Record<string, unknown> } | undefined> {
  let match: { key: string; value: Record<string, unknown> } | undefined;
  for await (const [key, value] of iterator) {
    const candidate = record(value);
    if (candidate.key !== settingKey) continue;
    if (match) throw new Error(`Duplicate ${settingKey} settings.`);
    match = { key, value: candidate };
  }
  return match;
}

async function inspectPackageTree(root: string, requireCurrentBuild: boolean): Promise<PackageTreeInspection> {
  const rootStats = await lstat(root).catch(() => undefined);
  if (!rootStats?.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error(`Spell resolver ${requireCurrentBuild ? 'build' : 'installation'} directory is missing or unsafe: ${root}`);
  }
  const files = await hashTree(root);
  const manifestEntry = files.find((entry) => entry.path === 'module.json');
  const browserEntry = files.find((entry) => entry.path === 'scripts/index.js');
  if (!manifestEntry || !browserEntry) throw new Error('Validated spell resolver build requires module.json and scripts/index.js.');
  const manifest = await readJson(resolve(root, 'module.json'));
  validateModuleManifest(manifest, requireCurrentBuild);
  const hash = createHash('sha256').update(canonicalJson(files)).digest('hex');
  return { root, hash, files, manifest };
}

async function assertPackageHash(root: string, expectedHash: string, message: string): Promise<PackageTreeInspection> {
  const inspected = await inspectPackageTree(root, false);
  if (inspected.hash !== expectedHash) throw new Error(`${message}: ${root}`);
  return inspected;
}

async function hashTree(root: string): Promise<Array<{ path: string; size: number; sha256: string }>> {
  const result: Array<{ path: string; size: number; sha256: string }> = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error(`Spell resolver package may not contain a symlink or junction: ${path}`);
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) {
        const bytes = await readFile(path);
        result.push({
          path: relative(root, path).split(sep).join('/'),
          size: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      } else throw new Error(`Unsupported spell resolver package entry: ${path}`);
    }
  }
  await visit(root);
  return result.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}

function validateModuleManifest(manifest: Record<string, unknown>, requireCurrentVersion: boolean): void {
  if (manifest.id !== SPELL_RESOLVER_MODULE_ID) {
    throw new Error(`Spell resolver module ID must be exactly ${SPELL_RESOLVER_MODULE_ID}.`);
  }
  if (!requireCurrentVersion) return;
  if (manifest.version !== MODULE_VERSION) throw new Error(`Spell resolver module version must be exactly ${MODULE_VERSION}.`);
  const compatibility = record(manifest.compatibility);
  if (compatibility.minimum !== '14.364' || compatibility.verified !== '14.364' || compatibility.maximum !== '14.364') {
    throw new Error('Spell resolver manifest must pin Foundry compatibility to exact 14.364.');
  }
  const systems = Array.isArray(record(manifest.relationships).systems)
    ? record(manifest.relationships).systems as unknown[]
    : [];
  const dnd5e = systems.map(record).find((system) => system.id === 'dnd5e');
  const dnd5eCompatibility = record(dnd5e?.compatibility);
  if (!dnd5e || dnd5eCompatibility.minimum !== '5.3.3'
    || dnd5eCompatibility.verified !== '5.3.3'
    || dnd5eCompatibility.maximum !== '5.3.3') {
    throw new Error('Spell resolver manifest must pin dnd5e compatibility to exact 5.3.3.');
  }
  if (!Array.isArray(manifest.esmodules) || !manifest.esmodules.includes('scripts/index.js')) {
    throw new Error('Spell resolver manifest must load the validated scripts/index.js browser build.');
  }
}

function assertExactBuildDirectory(config: FoundryLabConfig, target: string): void {
  const expected = resolve(config.repoRoot, 'dist', SPELL_RESOLVER_MODULE_ID);
  if (resolve(target) !== expected || !isAbsolute(target) || relative(config.repoRoot, target).startsWith('..')) {
    throw new Error(`Spell resolver build directory must be exact repository dist path: ${expected}`);
  }
  assertExactRepoPath(config, target, ['dist', SPELL_RESOLVER_MODULE_ID], 'Spell resolver build directory');
}

function assertExactFoundryRuntimePaths(config: FoundryLabConfig): void {
  const appSegments = ['app', '14.364'] as const;
  assertExactLabPath(config, config.appRoot, appSegments, 'Foundry application root');
  assertExactLabPath(config, resolve(config.appRoot, 'main.js'), [...appSegments, 'main.js'], 'Foundry server entry');
  assertExactLabPath(config, resolve(config.appRoot, 'package.json'), [...appSegments, 'package.json'], 'Foundry package manifest');
  assertExactLabPath(config, resolve(config.appRoot, 'node_modules/classic-level/index.js'), [
    ...appSegments, 'node_modules', 'classic-level', 'index.js',
  ], 'Foundry classic-level entry');
  const systemSegments = [
    'data', 'server-mirror', 'Data', 'systems', 'dnd5e',
  ] as const;
  const systemRoot = resolve(config.profiles.serverMirror.dataPath, 'Data/systems/dnd5e');
  assertExactLabPath(config, systemRoot, systemSegments, 'server-mirror dnd5e root');
  assertExactLabPath(config, resolve(systemRoot, 'system.json'), [...systemSegments, 'system.json'], 'server-mirror dnd5e manifest');
}

function backupPathFor(paths: SpellResolverPaths, now: () => Date, operation: 'install' | 'uninstall'): string {
  return resolve(paths.backupRoot, `${timestamp(now)}-${operation}`, SPELL_RESOLVER_MODULE_ID);
}

function failedReplacementPathFor(paths: SpellResolverPaths, now: () => Date): string {
  return resolve(paths.backupRoot, `${timestamp(now)}-install-failed`, SPELL_RESOLVER_MODULE_ID);
}

function timestamp(now: () => Date): string {
  return now().toISOString().replace(/[:.]/g, '-');
}

function parseModuleConfiguration(value: unknown): Record<string, boolean> {
  if (typeof value !== 'string') throw new Error('core.moduleConfiguration value must be a JSON string.');
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('core.moduleConfiguration must decode to an object.');
  }
  const configuration: Record<string, boolean> = {};
  for (const [key, active] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof active !== 'boolean') throw new Error(`core.moduleConfiguration.${key} must be boolean.`);
    configuration[key] = active;
  }
  return configuration;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return record(JSON.parse(await readFile(path, 'utf8')) as unknown);
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/[\r\n]+/g, ' ').slice(0, 240) : 'unknown error';
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]));
}
