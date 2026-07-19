import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { cp, link, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLabConfig, type FoundryLabConfig } from '../config';
import {
  SPELL_RESOLVER_MODULE_ID,
  assertExactSpellResolverDestination,
  buildSpellResolverForLab,
  createClassicLevelWorldSettingsStore,
  inspectBuiltSpellResolver,
  installSpellResolver,
  parseSpellResolverCliArgs,
  prepareSpellResolverWorld,
  spellResolverPaths,
  uninstallSpellResolver,
  verifySpellResolverInstall,
  type WorldSettingsStore,
} from '../spellResolver';

describe('Foundry Lab spell resolver lifecycle', () => {
  test('parses only the exact arguments accepted by each spell-resolver action', () => {
    expect(parseSpellResolverCliArgs(['install'])).toEqual({ action: 'install', apply: false });
    expect(parseSpellResolverCliArgs(['install', '--apply'])).toEqual({ action: 'install', apply: true });
    expect(parseSpellResolverCliArgs([
      'prepare-world',
      '--world=fvtt-v14-module-matrix',
      '--apply',
    ])).toEqual({ action: 'prepare-world', apply: true, world: 'fvtt-v14-module-matrix' });

    for (const args of [
      ['build', '--apply'],
      ['verify-install', '--apply'],
      ['install', 'uninstall', '--apply'],
      ['uninstall', '--world=cor-cotn', '--apply'],
      ['install', '--apply', '--apply'],
      ['prepare-world', '--world=fvtt-v14-module-matrix', '--world=cor-cotn'],
      ['prepare-world', '--world=fvtt-v14-module-matrix', '--unexpected'],
    ]) {
      expect(() => parseSpellResolverCliArgs(args)).toThrow(/argument|duplicate|unsupported|world/i);
    }
  });

  test('pins installation to the exact project-local server-mirror module destination', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      expect(paths.destination).toBe(resolve(
        config.repoRoot,
        '.local/foundry-v14/data/server-mirror/Data/modules',
        SPELL_RESOLVER_MODULE_ID,
      ));
      expect(() => assertExactSpellResolverDestination(config, paths.destination)).not.toThrow();
      expect(() => assertExactSpellResolverDestination(config, resolve(config.repoRoot, 'Data/modules', SPELL_RESOLVER_MODULE_ID))).toThrow(/exact|server-mirror/i);
      expect(() => assertExactSpellResolverDestination(config, resolve(config.labRoot, 'data/core-test/Data/modules', SPELL_RESOLVER_MODULE_ID))).toThrow(/exact|server-mirror/i);
      expect(() => assertExactSpellResolverDestination(config, resolve(config.repoRoot, '..', 'production', SPELL_RESOLVER_MODULE_ID))).toThrow(/lab root|exact/i);
    });
  });

  test('rejects a module destination routed outside the lab through a junction', async () => {
    await withFixture(async ({ config, root }) => {
      const modulesRoot = resolve(config.profiles.serverMirror.dataPath, 'Data/modules');
      const outside = resolve(root, 'outside-modules');
      await rm(modulesRoot, { recursive: true, force: true });
      await mkdir(outside, { recursive: true });
      await symlink(outside, modulesRoot, 'junction');

      expect(() => assertExactSpellResolverDestination(config, spellResolverPaths(config).destination)).toThrow(/escapes Foundry lab root/i);
    });
  });

  test('rejects a build routed outside the repository through a parent junction', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      const outside = resolve(root, 'outside-dist');
      await rm(resolve(config.repoRoot, 'dist'), { recursive: true, force: true });
      await mkdir(resolve(outside, SPELL_RESOLVER_MODULE_ID, 'scripts'), { recursive: true });
      await writeModuleManifest(resolve(outside, SPELL_RESOLVER_MODULE_ID));
      await writeFile(resolve(outside, SPELL_RESOLVER_MODULE_ID, 'scripts/index.js'), 'export {}\n');
      await symlink(outside, resolve(config.repoRoot, 'dist'), 'junction');

      await expect(inspectBuiltSpellResolver(config)).rejects.toThrow(/build|repository|junction|exact/i);
      expect(paths.buildDir).toBe(resolve(config.repoRoot, 'dist', SPELL_RESOLVER_MODULE_ID));
    });
  });

  test('real build rejects a parent junction before deleting any outside artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spell-resolver-build-junction-'));
    const repoRoot = resolve(root, 'repo');
    const outsideDist = resolve(root, 'outside-dist');
    const externalMarker = resolve(outsideDist, SPELL_RESOLVER_MODULE_ID, 'keep.txt');
    try {
      await mkdir(resolve(repoRoot), { recursive: true });
      await mkdir(resolve(outsideDist, SPELL_RESOLVER_MODULE_ID), { recursive: true });
      await writeFile(externalMarker, 'must survive');
      await symlink(outsideDist, resolve(repoRoot, 'dist'), 'junction');

      const buildModule = await import('../../buildSpellResolver') as Record<string, unknown>;
      expect(typeof buildModule.buildSpellResolverPackageForRepo).toBe('function');
      await expect((buildModule.buildSpellResolverPackageForRepo as (root: string) => Promise<unknown>)(repoRoot))
        .rejects.toThrow(/junction|reparse|symlink|outside|unsafe/i);
      expect(await readFile(externalMarker, 'utf8')).toBe('must survive');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('lab build rejects the physical path before invoking its builder dependency', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spell-resolver-lab-build-boundary-'));
    const repoRoot = resolve(root, 'repo');
    const outsideDist = resolve(root, 'outside-dist');
    const marker = resolve(outsideDist, SPELL_RESOLVER_MODULE_ID, 'keep.txt');
    const previousCwd = process.cwd();
    try {
      await mkdir(repoRoot, { recursive: true });
      await mkdir(resolve(outsideDist, SPELL_RESOLVER_MODULE_ID), { recursive: true });
      await writeFile(marker, 'keep');
      await symlink(outsideDist, resolve(repoRoot, 'dist'), 'junction');
      const buildModule = await import('../../buildSpellResolver') as Record<string, unknown>;
      expect(typeof buildModule.buildSpellResolverPackageForRepo).toBe('function');
      process.chdir(repoRoot);
      let builderCalls = 0;

      await expect(buildSpellResolverForLab(createLabConfig(repoRoot), {
        buildPackage: async () => {
          builderCalls += 1;
          throw new Error('builder must not be called');
        },
      } as Parameters<typeof buildSpellResolverForLab>[1])).rejects.toThrow(/junction|reparse|symlink|outside|unsafe/i);
      expect(builderCalls).toBe(0);
      expect(await readFile(marker, 'utf8')).toBe('keep');
    } finally {
      process.chdir(previousCwd);
      await rm(root, { recursive: true, force: true });
    }
  });

  test.each([
    ['wrong module ID', async (paths: ReturnType<typeof spellResolverPaths>) => {
      const manifest = JSON.parse(await readFile(join(paths.buildDir, 'module.json'), 'utf8'));
      manifest.id = 'lookalike-resolver';
      await writeFile(join(paths.buildDir, 'module.json'), JSON.stringify(manifest));
    }, /module ID/i],
    ['missing validated browser build', async (paths: ReturnType<typeof spellResolverPaths>) => {
      await rm(join(paths.buildDir, 'scripts/index.js'));
    }, /scripts\/index\.js|build/i],
  ] as const)('rejects install with %s before changing the mirror', async (_label, mutate, pattern) => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await mutate(paths);
      await expect(installSpellResolver(config, { apply: true, now: fixedNow })).rejects.toThrow(pattern);
      expect(await Bun.file(join(paths.destination, 'module.json')).exists()).toBe(false);
    });
  });

  test('backs up an existing exact module before atomic replacement and verifies build/install hashes', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await mkdir(paths.destination, { recursive: true });
      await writeModuleManifest(paths.destination, { version: '0.0.9' });
      await mkdir(join(paths.destination, 'scripts'), { recursive: true });
      await writeFile(join(paths.destination, 'scripts/index.js'), 'export const old = true;\n');
      await writeFile(join(paths.destination, 'old-marker.txt'), 'recover me');

      const installed = await installSpellResolver(config, { apply: true, now: fixedNow });
      expect(installed.changed).toBe(true);
      expect(installed.backupPath).toBeDefined();
      expect(await readFile(join(installed.backupPath!, 'old-marker.txt'), 'utf8')).toBe('recover me');
      expect(await Bun.file(join(paths.destination, 'old-marker.txt')).exists()).toBe(false);

      const verified = await verifySpellResolverInstall(config);
      expect(verified.ok).toBe(true);
      expect(verified.buildHash).toBe(verified.installHash);
      expect(verified.foundryVersion).toBe('14.364');
      expect(verified.dnd5eVersion).toBe('5.3.3');

      const second = await installSpellResolver(config, { apply: true, now: fixedNow });
      expect(second.changed).toBe(false);
      expect(second.backupPath).toBeUndefined();
    });
  });

  test('dry-run rejects a foreign module already occupying the exact destination', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await mkdir(resolve(paths.destination, 'scripts'), { recursive: true });
      await writeModuleManifest(paths.destination, { id: 'foreign-module' });
      await writeFile(resolve(paths.destination, 'scripts/index.js'), 'export {}\n');

      await expect(installSpellResolver(config, { apply: false })).rejects.toThrow(/module ID/i);
      expect(JSON.parse(await readFile(resolve(paths.destination, 'module.json'), 'utf8')).id).toBe('foreign-module');
    });
  });

  test('revalidates a modules junction activated at the mutation boundary', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      const outsideModules = resolve(root, 'outside-modules-not-created');
      let activated = false;

      await expect(installSpellResolver(config, {
        apply: true,
        installSeam: {
          beforeStagingMutation: async () => {
            activated = true;
            await symlink(outsideModules, paths.modulesRoot, 'junction');
            await mkdir(outsideModules, { recursive: true });
          },
        },
      } as Parameters<typeof installSpellResolver>[1])).rejects.toThrow(/junction|reparse|symlink|unsafe|lab root/i);
      expect(activated).toBe(true);
      expect(await Bun.file(resolve(outsideModules, SPELL_RESOLVER_MODULE_ID, 'module.json')).exists()).toBe(false);
    });
  });

  test('restores an existing module and quarantines a replacement when final verification fails', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await mkdir(resolve(paths.destination, 'scripts'), { recursive: true });
      await writeModuleManifest(paths.destination, { version: '0.0.9' });
      await writeFile(resolve(paths.destination, 'scripts/index.js'), 'export const old = true;\n');
      await writeFile(resolve(paths.destination, 'old-marker.txt'), 'restore me');

      await expect(installSpellResolver(config, {
        apply: true,
        now: fixedNow,
        installSeam: {
          verifyReplacement: async () => { throw new Error('injected final verification failure'); },
        },
      })).rejects.toThrow(/final verification failure/i);

      expect(await readFile(resolve(paths.destination, 'old-marker.txt'), 'utf8')).toBe('restore me');
      const quarantine = resolve(
        paths.backupRoot,
        '2026-07-19T12-34-56-000Z-install-failed',
        SPELL_RESOLVER_MODULE_ID,
      );
      expect(await readFile(resolve(quarantine, 'scripts/index.js'), 'utf8')).toContain('ready');
    });
  });

  test('reports recovery required when quarantine succeeds but backup restoration fails', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await mkdir(resolve(paths.destination, 'scripts'), { recursive: true });
      await writeModuleManifest(paths.destination, { version: '0.0.9' });
      await writeFile(resolve(paths.destination, 'scripts/index.js'), 'export const old = true;\n');
      await writeFile(resolve(paths.destination, 'old-marker.txt'), 'manual restore required');
      const backupPath = resolve(
        paths.backupRoot,
        '2026-07-19T12-34-56-000Z-install',
        SPELL_RESOLVER_MODULE_ID,
      );
      const quarantinePath = resolve(
        paths.backupRoot,
        '2026-07-19T12-34-56-000Z-install-failed',
        SPELL_RESOLVER_MODULE_ID,
      );
      let failure: unknown;

      try {
        await installSpellResolver(config, {
          apply: true,
          now: fixedNow,
          installSeam: {
            verifyReplacement: async () => { throw new Error('injected final verification failure'); },
            rename: async (source, destination) => {
              if (source === backupPath && destination === paths.destination) {
                throw new Error('injected backup restore failure');
              }
              await rename(source, destination);
            },
          },
        });
      } catch (error) {
        failure = error;
      }

      expect(await Bun.file(resolve(paths.destination, 'module.json')).exists()).toBe(false);
      expect(await readFile(resolve(backupPath, 'old-marker.txt'), 'utf8')).toBe('manual restore required');
      expect(await Bun.file(resolve(quarantinePath, 'module.json')).exists()).toBe(true);
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as Error).message).toMatch(/recovery required/i);
    });
  });

  test('preserves an injected same-ID different-hash destination and its recoverable backup', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await mkdir(resolve(paths.destination, 'scripts'), { recursive: true });
      await writeModuleManifest(paths.destination, { version: '0.0.9' });
      await writeFile(resolve(paths.destination, 'scripts/index.js'), 'export const old = true;\n');
      await writeFile(resolve(paths.destination, 'old-marker.txt'), 'preserve original backup');
      const backupPath = resolve(
        paths.backupRoot,
        '2026-07-19T12-34-56-000Z-install',
        SPELL_RESOLVER_MODULE_ID,
      );
      const preservedReplacement = `${paths.destination}.validated-replacement`;
      let quarantineAttempted = false;

      let failure: unknown;
      try {
        await installSpellResolver(config, {
          apply: true,
          now: fixedNow,
          installSeam: {
            verifyReplacement: async (destination) => {
              await rename(destination, preservedReplacement);
              await mkdir(resolve(destination, 'scripts'), { recursive: true });
              await writeModuleManifest(destination);
              await writeFile(resolve(destination, 'scripts/index.js'), 'export const injected = true;\n');
              await writeFile(resolve(destination, 'injected-marker.txt'), 'do not move or delete');
              throw new Error('injected final verification failure');
            },
            rename: async (source, destination) => {
              if (source === paths.destination && destination.includes('-install-failed')) {
                quarantineAttempted = true;
                throw new Error('injected quarantine rename failure');
              }
              await rename(source, destination);
            },
          },
        });
      } catch (error) {
        failure = error;
      }

      expect(quarantineAttempted).toBe(false);
      expect(await readFile(resolve(paths.destination, 'injected-marker.txt'), 'utf8')).toBe('do not move or delete');
      expect(await readFile(resolve(backupPath, 'old-marker.txt'), 'utf8')).toBe('preserve original backup');
      expect(await Bun.file(resolve(preservedReplacement, 'module.json')).exists()).toBe(true);
      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as Error).message).toMatch(/recovery required/i);
    });
  });

  test('leaves destination absent after a failed first install and preserves the replacement in quarantine', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await expect(installSpellResolver(config, {
        apply: true,
        now: fixedNow,
        installSeam: {
          verifyReplacement: async () => { throw new Error('injected final verification failure'); },
        },
      })).rejects.toThrow(/final verification failure/i);

      expect(await Bun.file(resolve(paths.destination, 'module.json')).exists()).toBe(false);
      expect(await Bun.file(resolve(
        paths.backupRoot,
        '2026-07-19T12-34-56-000Z-install-failed',
        SPELL_RESOLVER_MODULE_ID,
        'module.json',
      )).exists()).toBe(true);
    });
  });

  test('restores the previous module even when staging cleanup also fails', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await mkdir(resolve(paths.destination, 'scripts'), { recursive: true });
      await writeModuleManifest(paths.destination, { version: '0.0.9' });
      await writeFile(resolve(paths.destination, 'scripts/index.js'), 'export const old = true;\n');
      await writeFile(resolve(paths.destination, 'old-marker.txt'), 'restore despite cleanup');

      await expect(installSpellResolver(config, {
        apply: true,
        now: fixedNow,
        installSeam: {
          rename: async (source, destination) => {
            if (source.endsWith(`.${SPELL_RESOLVER_MODULE_ID}.installing`)) {
              throw new Error('injected replacement rename failure');
            }
            await rename(source, destination);
          },
          cleanupStaging: async () => { throw new Error('injected staging cleanup failure'); },
        },
      })).rejects.toThrow(/replacement rename failure|staging cleanup failure/i);

      expect(await readFile(resolve(paths.destination, 'old-marker.txt'), 'utf8')).toBe('restore despite cleanup');
    });
  });

  test('refuses to restore a foreign directory injected at the recoverable backup path', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await mkdir(resolve(paths.destination, 'scripts'), { recursive: true });
      await writeModuleManifest(paths.destination, { version: '0.0.9' });
      await writeFile(resolve(paths.destination, 'scripts/index.js'), 'export const old = true;\n');
      await writeFile(resolve(paths.destination, 'old-marker.txt'), 'preserve original backup');
      const backupPath = resolve(
        paths.backupRoot,
        '2026-07-19T12-34-56-000Z-install',
        SPELL_RESOLVER_MODULE_ID,
      );
      const preservedBackup = `${backupPath}.preserved`;

      await expect(installSpellResolver(config, {
        apply: true,
        now: fixedNow,
        installSeam: {
          rename: async (source, destination) => {
            if (source === paths.destination) {
              await rename(source, destination);
              await rename(destination, preservedBackup);
              await mkdir(resolve(destination, 'scripts'), { recursive: true });
              await writeModuleManifest(destination, { id: 'foreign-module' });
              await writeFile(resolve(destination, 'scripts/index.js'), 'export const foreign = true;\n');
              return;
            }
            if (source.endsWith(`.${SPELL_RESOLVER_MODULE_ID}.installing`)) {
              throw new Error('injected replacement rename failure');
            }
            await rename(source, destination);
          },
        },
      })).rejects.toThrow(/replacement rename failure|module ID|restore/i);

      expect(await Bun.file(resolve(paths.destination, 'module.json')).exists()).toBe(false);
      expect(await readFile(resolve(preservedBackup, 'old-marker.txt'), 'utf8')).toBe('preserve original backup');
      expect(JSON.parse(await readFile(resolve(backupPath, 'module.json'), 'utf8')).id).toBe('foreign-module');
    });
  });

  test('uninstall revalidates manifest identity and removes only the exact module directory recoverably', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const wrong = JSON.parse(await readFile(join(paths.destination, 'module.json'), 'utf8'));
      wrong.id = 'foreign-module';
      await writeFile(join(paths.destination, 'module.json'), JSON.stringify(wrong));
      await expect(uninstallSpellResolver(config, { apply: true, now: fixedNow })).rejects.toThrow(/module ID/i);
      expect(await Bun.file(join(paths.destination, 'module.json')).exists()).toBe(true);

      await writeModuleManifest(paths.destination);
      await rm(paths.buildDir, { recursive: true, force: true });
      const removed = await uninstallSpellResolver(config, { apply: true, now: fixedNow });
      expect(removed.changed).toBe(true);
      expect(await Bun.file(paths.destination).exists()).toBe(false);
      expect(await Bun.file(join(removed.backupPath!, 'module.json')).exists()).toBe(true);
    });
  });

  test('uninstall revalidates a replaced destination immediately before its recoverable move', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const preserved = `${paths.destination}.preserved`;
      let replaced = false;

      await expect(uninstallSpellResolver(config, {
        apply: true,
        now: fixedNow,
        installSeam: {
          beforeDestinationMutation: async () => {
            replaced = true;
            await rename(paths.destination, preserved);
            await mkdir(resolve(paths.destination, 'scripts'), { recursive: true });
            await writeModuleManifest(paths.destination, { id: 'foreign-module' });
            await writeFile(resolve(paths.destination, 'scripts/index.js'), 'export const foreign = true;\n');
          },
        },
      })).rejects.toThrow(/changed|identity|module ID|foreign/i);
      expect(replaced).toBe(true);
      expect(await Bun.file(resolve(preserved, 'module.json')).exists()).toBe(true);
      expect(JSON.parse(await readFile(resolve(paths.destination, 'module.json'), 'utf8')).id).toBe('foreign-module');
    });
  });

  test('prepares only the approved disposable world, backs up settings first, and preserves unrelated module choices', async () => {
    await withFixture(async ({ config, settingsStore }) => {
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const prepared = await prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: true,
        now: fixedNow,
        settingsStore,
      });
      expect(prepared.changed).toBe(true);
      expect(prepared.backupPath).toBeDefined();
      expect(await readFile(join(prepared.backupPath!, 'settings-marker.txt'), 'utf8')).toBe('before');
      expect(await Bun.file(join(prepared.backupPath!, 'LOCK')).exists()).toBe(false);
      expect(settingsStore.value).toEqual({ dae: true, socketlib: true, [SPELL_RESOLVER_MODULE_ID]: true });
      expect(settingsStore.backupObservedBeforeWrite).toBe(true);

      const repeated = await prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: true,
        now: fixedNow,
        settingsStore,
      });
      expect(repeated.changed).toBe(false);
      expect(repeated.backupPath).toBeUndefined();
    });
  });

  test('refuses world preparation when the installed module no longer matches the validated build', async () => {
    await withFixture(async ({ config, settingsStore }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      await writeFile(join(paths.buildDir, 'scripts/index.js'), 'export const drifted = true;\n');

      await expect(prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: true,
        now: fixedNow,
        settingsStore,
      })).rejects.toThrow(/does not match.*build hash/i);
      expect(settingsStore.value).toEqual({ dae: true, socketlib: true });
      expect(settingsStore.backupObservedBeforeWrite).toBe(false);
    });
  });

  test('dry-run rejects an approved world whose settings database is missing', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      await rm(paths.approvedWorldSettings, { recursive: true, force: true });

      await expect(prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', { apply: false }))
        .rejects.toThrow(/settings|database|missing/i);
      expect(await Bun.file(paths.approvedWorldSettings).exists()).toBe(false);
    });
  });

  test('verify-install rejects Foundry and dnd5e roots routed outside the lab through junctions', async () => {
    await withFixture(async ({ config, root }) => {
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const outsideApp = resolve(root, 'outside-app');
      await mkdir(outsideApp, { recursive: true });
      await writeFile(resolve(outsideApp, 'main.js'), '');
      await writeFile(resolve(outsideApp, 'package.json'), JSON.stringify({ release: { generation: 14, build: 364 } }));
      await rm(config.appRoot, { recursive: true, force: true });
      await symlink(outsideApp, config.appRoot, 'junction');

      await expect(verifySpellResolverInstall(config)).rejects.toThrow(/Foundry|path|junction|lab/i);
    });

    await withFixture(async ({ config, root }) => {
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const systemRoot = resolve(config.profiles.serverMirror.dataPath, 'Data/systems/dnd5e');
      const outsideSystem = resolve(root, 'outside-system');
      await mkdir(outsideSystem, { recursive: true });
      await writeFile(resolve(outsideSystem, 'system.json'), JSON.stringify({ id: 'dnd5e', version: '5.3.3' }));
      await rm(systemRoot, { recursive: true, force: true });
      await symlink(outsideSystem, systemRoot, 'junction');

      await expect(verifySpellResolverInstall(config)).rejects.toThrow(/dnd5e|path|junction|lab/i);
    });

    await withFixture(async ({ config, root }) => {
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const classicLevelRoot = resolve(config.appRoot, 'node_modules/classic-level');
      const outsideClassicLevel = resolve(root, 'outside-classic-level');
      await mkdir(outsideClassicLevel, { recursive: true });
      await writeFile(resolve(outsideClassicLevel, 'index.js'), 'export const ClassicLevel = class {};\n');
      await rm(classicLevelRoot, { recursive: true, force: true });
      await symlink(outsideClassicLevel, classicLevelRoot, 'junction');

      await expect(verifySpellResolverInstall(config)).rejects.toThrow(/classic-level|path|junction|lab/i);
    });
  });

  test('real LevelDB dry-run rejects missing, corrupt, and locked settings without changing original bytes', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const ClassicLevel = await bundledClassicLevel();
      const temporaryRoot = resolve(root, 'preflight-temp');
      await mkdir(temporaryRoot, { recursive: true });
      const settingsStore = createClassicLevelWorldSettingsStore(config, { ClassicLevel, temporaryRoot });

      await rm(paths.approvedWorldSettings, { recursive: true, force: true });
      await expect(prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: false,
        settingsStore,
      })).rejects.toThrow(/settings|database|missing/i);
      expect(await Bun.file(paths.approvedWorldSettings).exists()).toBe(false);

      await mkdir(paths.approvedWorldSettings, { recursive: true });
      await writeFile(resolve(paths.approvedWorldSettings, 'LOCK'), '');
      await writeFile(resolve(paths.approvedWorldSettings, 'CURRENT'), 'MANIFEST-does-not-exist\n');
      const corruptBefore = await hashNonLockTree(paths.approvedWorldSettings);
      await expect(prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: false,
        settingsStore,
      })).rejects.toThrow(/database|level|open|corrupt/i);
      expect(await hashNonLockTree(paths.approvedWorldSettings)).toEqual(corruptBefore);

      await rm(paths.approvedWorldSettings, { recursive: true, force: true });
      const openDatabase = await createRealSettingsDatabase(config, ClassicLevel, { dae: true });
      try {
        const lockedBefore = await hashNonLockTree(paths.approvedWorldSettings);
        await expect(prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
          apply: false,
          settingsStore,
        })).rejects.toThrow(/lock|busy|stopped/i);
        expect(await hashNonLockTree(paths.approvedWorldSettings)).toEqual(lockedBefore);
      } finally {
        await openDatabase.close();
      }
    });
  });

  test('rejects LevelDB file symlinks before a snapshot can read an outside database', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const ClassicLevel = await bundledClassicLevel();
      const outsideSettings = resolve(root, 'outside-world-settings');
      const outsideDatabase = new ClassicLevel(outsideSettings, {
        keyEncoding: 'utf8',
        valueEncoding: 'json',
      });
      await outsideDatabase.open();
      await outsideDatabase.put('setting-id', {
        key: 'core.moduleConfiguration',
        value: JSON.stringify({ 'outside-world-module': true }),
      });
      await outsideDatabase.close();
      const outsideBefore = await hashNonLockTree(outsideSettings);

      await rm(paths.approvedWorldSettings, { recursive: true, force: true });
      await mkdir(paths.approvedWorldSettings, { recursive: true });
      await writeFile(resolve(paths.approvedWorldSettings, 'LOCK'), '');
      for (const entry of await readdir(outsideSettings, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.toLocaleLowerCase('en-US') === 'lock') continue;
        await symlink(
          resolve(outsideSettings, entry.name),
          resolve(paths.approvedWorldSettings, entry.name),
          'file',
        );
      }

      const settingsStore = createClassicLevelWorldSettingsStore(config, { ClassicLevel });
      await expect(prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: false,
        settingsStore,
      })).rejects.toThrow(/symlink|junction|reparse|unsafe/i);
      expect(await hashNonLockTree(outsideSettings)).toEqual(outsideBefore);
    });
  });

  test('rejects multiply-linked LevelDB files before snapshot copy', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const ClassicLevel = await bundledClassicLevel();
      await rm(paths.approvedWorldSettings, { recursive: true, force: true });
      const database = await createRealSettingsDatabase(config, ClassicLevel, { dae: true });
      await database.close();
      await link(
        resolve(paths.approvedWorldSettings, 'CURRENT'),
        resolve(root, 'outside-CURRENT'),
      );

      const settingsStore = createClassicLevelWorldSettingsStore(config, { ClassicLevel });
      await expect(prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: false,
        settingsStore,
      })).rejects.toThrow(/multiply-linked|unsafe/i);
    });
  });

  test('real LevelDB dry-run and no-op apply read a disposable snapshot without changing original bytes', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const ClassicLevel = await bundledClassicLevel();
      await rm(paths.approvedWorldSettings, { recursive: true, force: true });
      const database = await createRealSettingsDatabase(config, ClassicLevel, {
        dae: true,
        [SPELL_RESOLVER_MODULE_ID]: true,
      });
      await database.close();
      const temporaryRoot = resolve(root, 'preflight-temp');
      await mkdir(temporaryRoot, { recursive: true });
      const settingsStore = createClassicLevelWorldSettingsStore(config, { ClassicLevel, temporaryRoot });
      const before = await hashNonLockTree(paths.approvedWorldSettings);

      const dryRun = await prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: false,
        settingsStore,
      });
      expect(dryRun.before).toEqual({ dae: true, [SPELL_RESOLVER_MODULE_ID]: true });
      expect(dryRun.changed).toBe(false);
      expect(dryRun.actions).toEqual(['Resolver is already enabled; no world change is required']);
      expect(await hashNonLockTree(paths.approvedWorldSettings)).toEqual(before);
      expect(await readdir(temporaryRoot)).toEqual([]);

      const noOp = await prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: true,
        now: fixedNow,
        settingsStore,
      });
      expect(noOp.changed).toBe(false);
      expect(noOp.backupPath).toBeUndefined();
      expect(await hashNonLockTree(paths.approvedWorldSettings)).toEqual(before);
      expect(await readdir(temporaryRoot)).toEqual([]);
    });
  });

  test('holds the stopped-world LOCK for the complete protected settings operation', async () => {
    await withFixture(async ({ config }) => {
      const paths = spellResolverPaths(config);
      const ClassicLevel = await bundledClassicLevel();
      await rm(paths.approvedWorldSettings, { recursive: true, force: true });
      const database = await createRealSettingsDatabase(config, ClassicLevel, { dae: true });
      await database.close();
      const before = await hashNonLockTree(paths.approvedWorldSettings);

      const spellResolverModule = await import('../spellResolver') as Record<string, unknown>;
      expect(typeof spellResolverModule.withStoppedWorldSettingsLock).toBe('function');
      const withLock = spellResolverModule.withStoppedWorldSettingsLock as <T>(
        config: FoundryLabConfig,
        settingsPath: string,
        run: () => Promise<T>,
      ) => Promise<T>;
      await withLock(config, paths.approvedWorldSettings, async () => undefined);
      expect(await hashNonLockTree(paths.approvedWorldSettings)).toEqual(before);

      await expect(withLock(config, paths.approvedWorldSettings, async () => {
        const contender = new ClassicLevel(paths.approvedWorldSettings, {
          createIfMissing: false,
          keyEncoding: 'utf8',
          valueEncoding: 'json',
        });
        await expect(contender.open()).rejects.toThrow(/open|lock|busy/i);
      })).rejects.toThrow(/changed during|protected world settings/i);

      expect(await readModulesFromDatabase(paths.approvedWorldSettings, ClassicLevel)).toEqual({ dae: true });
    });
  });

  test('real LevelDB apply creates a recoverable backup first and preserves unrelated modules', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const ClassicLevel = await bundledClassicLevel();
      await rm(paths.approvedWorldSettings, { recursive: true, force: true });
      const database = await createRealSettingsDatabase(config, ClassicLevel, { dae: true, socketlib: false });
      await database.close();
      const settingsStore = createClassicLevelWorldSettingsStore(config, { ClassicLevel });

      const result = await prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: true,
        now: fixedNow,
        settingsStore,
      });
      expect(result.changed).toBe(true);
      expect(result.before).toEqual({ dae: true, socketlib: false });
      expect(result.after).toEqual({ dae: true, socketlib: false, [SPELL_RESOLVER_MODULE_ID]: true });
      expect(result.backupPath).toBeDefined();
      expect(await Bun.file(resolve(result.backupPath!, 'LOCK')).exists()).toBe(false);
      const durableBackupBeforeRead = await hashNonLockTree(result.backupPath!);
      expect(await readModulesFromDatabaseCopy(
        result.backupPath!,
        resolve(root, 'recoverable-backup-verification'),
        ClassicLevel,
      )).toEqual({ dae: true, socketlib: false });
      expect(await hashNonLockTree(result.backupPath!)).toEqual(durableBackupBeforeRead);
      expect(await readModulesFromDatabase(paths.approvedWorldSettings, ClassicLevel)).toEqual({
        dae: true,
        socketlib: false,
        [SPELL_RESOLVER_MODULE_ID]: true,
      });
    });
  });

  test('keeps the durable world backup byte-stable while reading it through a temporary snapshot', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const ClassicLevel = await bundledClassicLevel();
      await rm(paths.approvedWorldSettings, { recursive: true, force: true });
      const database = await createRealSettingsDatabase(config, ClassicLevel, { dae: true, socketlib: false });
      await database.close();
      const expectedBackupTree = await hashNonLockTree(paths.approvedWorldSettings);
      const temporaryRoot = resolve(root, 'durable-backup-read-temp');
      await mkdir(temporaryRoot, { recursive: true });
      const backupPath = resolve(
        config.evidenceRoot,
        'spell-resolver-world-backups',
        '2026-07-19T12-34-56-000Z',
        'settings',
      );
      let treeBeforeOriginalOpen: Record<string, string> | undefined;
      const settingsStore = createClassicLevelWorldSettingsStore(config, {
        ClassicLevel,
        temporaryRoot,
        beforeOriginalOpen: async () => {
          treeBeforeOriginalOpen = await hashNonLockTree(backupPath);
        },
      });

      const result = await prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: true,
        now: fixedNow,
        settingsStore,
      });

      expect(result.backupPath).toBe(backupPath);
      expect(await Bun.file(resolve(backupPath, 'LOCK')).exists()).toBe(false);
      expect(treeBeforeOriginalOpen).toEqual(expectedBackupTree);
      expect(await hashNonLockTree(backupPath)).toEqual(expectedBackupTree);
      expect(await readdir(temporaryRoot)).toEqual([]);

      expect(await readModulesFromDatabaseCopy(
        backupPath,
        resolve(root, 'durable-backup-verification'),
        ClassicLevel,
      )).toEqual({ dae: true, socketlib: false });
      expect(await hashNonLockTree(backupPath)).toEqual(expectedBackupTree);
    });
  });

  test('fails closed on source-tree drift while a locked backup remains logically recoverable', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const ClassicLevel = await bundledClassicLevel();
      await rm(paths.approvedWorldSettings, { recursive: true, force: true });
      const database = await createRealSettingsDatabase(config, ClassicLevel, { dae: true, socketlib: false });
      await database.close();
      const settingsStore = createClassicLevelWorldSettingsStore(config, { ClassicLevel });
      let contenderRejected = false;
      const backupPath = resolve(
        config.evidenceRoot,
        'spell-resolver-world-backups',
        '2026-07-19T12-34-56-000Z',
        'settings',
      );

      await expect(prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: true,
        now: fixedNow,
        settingsStore,
        worldSettingsSeam: {
          beforeBackupCopy: async () => {
            const contender = new ClassicLevel(paths.approvedWorldSettings, {
              createIfMissing: false,
              keyEncoding: 'utf8',
              valueEncoding: 'json',
            });
            await expect(contender.open()).rejects.toThrow(/open|lock|busy/i);
            contenderRejected = true;
          },
        },
      })).rejects.toThrow(/changed during|protected world settings/i);
      expect(contenderRejected).toBe(true);
      const durableBackupBeforeRead = await hashNonLockTree(backupPath);
      expect(await readModulesFromDatabaseCopy(
        backupPath,
        resolve(root, 'drift-backup-verification'),
        ClassicLevel,
      )).toEqual({ dae: true, socketlib: false });
      expect(await hashNonLockTree(backupPath)).toEqual(durableBackupBeforeRead);
      expect(await readModulesFromDatabase(paths.approvedWorldSettings, ClassicLevel)).toEqual({
        dae: true,
        socketlib: false,
      });
    });
  });

  test('revalidates the original settings path after a replacement seam and before opening the writer', async () => {
    await withFixture(async ({ config, root }) => {
      const paths = spellResolverPaths(config);
      await installSpellResolver(config, { apply: true, now: fixedNow });
      const ClassicLevel = await bundledClassicLevel();
      await rm(paths.approvedWorldSettings, { recursive: true, force: true });
      const original = await createRealSettingsDatabase(config, ClassicLevel, { dae: true });
      await original.close();

      const outsideSettings = resolve(root, 'outside-replacement-settings');
      const outside = new ClassicLevel(outsideSettings, { keyEncoding: 'utf8', valueEncoding: 'json' });
      await outside.open();
      await outside.put('setting-id', {
        key: 'core.moduleConfiguration',
        value: JSON.stringify({ 'outside-world-module': true }),
      });
      await outside.close();
      const outsideBefore = await hashNonLockTree(outsideSettings);
      const preservedOriginal = `${paths.approvedWorldSettings}.preserved`;
      let replacementActivated = false;
      const settingsStore = createClassicLevelWorldSettingsStore(config, {
        ClassicLevel,
        beforeOriginalOpen: async () => {
          replacementActivated = true;
          await rename(paths.approvedWorldSettings, preservedOriginal);
          await symlink(outsideSettings, paths.approvedWorldSettings, 'junction');
        },
      } as Parameters<typeof createClassicLevelWorldSettingsStore>[1]);

      await expect(prepareSpellResolverWorld(config, 'fvtt-v14-module-matrix', {
        apply: true,
        now: fixedNow,
        settingsStore,
      })).rejects.toThrow(/junction|reparse|symlink|unsafe|lab root/i);
      expect(replacementActivated).toBe(true);
      expect(await readModulesFromDatabase(preservedOriginal, ClassicLevel)).toEqual({ dae: true });
      expect(await hashNonLockTree(outsideSettings)).toEqual(outsideBefore);
    });
  });

  test.each(['cor-cotn', 'unknown-world', '../fvtt-v14-module-matrix'])(
    'rejects production-like, unknown, or escaping world %s',
    async (world) => {
      await withFixture(async ({ config, settingsStore }) => {
        await installSpellResolver(config, { apply: true, now: fixedNow });
        await expect(prepareSpellResolverWorld(config, world, {
          apply: true,
          now: fixedNow,
          settingsStore,
        })).rejects.toThrow(/disposable|world|exact/i);
      });
    },
  );
});

const fixedNow = () => new Date('2026-07-19T12:34:56.000Z');

async function withFixture(
  run: (fixture: {
    root: string;
    config: FoundryLabConfig;
    settingsStore: FakeWorldSettingsStore;
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'spell-resolver-lab-'));
  const repoRoot = join(root, 'repo');
  const config = createLabConfig(repoRoot);
  const paths = spellResolverPaths(config);
  const worldRoot = resolve(config.profiles.serverMirror.dataPath, 'Data/worlds/fvtt-v14-module-matrix');
  const settingsPath = resolve(worldRoot, 'data/settings');
  const settingsStore = new FakeWorldSettingsStore({ dae: true, socketlib: true });
  try {
    await mkdir(paths.buildDir, { recursive: true });
    await writeModuleManifest(paths.buildDir);
    await mkdir(join(paths.buildDir, 'scripts'), { recursive: true });
    await writeFile(join(paths.buildDir, 'scripts/index.js'), 'export const ready = true;\n');
    await mkdir(config.appRoot, { recursive: true });
    await writeFile(join(config.appRoot, 'main.js'), '');
    await writeFile(join(config.appRoot, 'package.json'), JSON.stringify({ release: { generation: 14, build: 364 } }));
    const classicLevelEntry = resolve(config.appRoot, 'node_modules/classic-level/index.js');
    await mkdir(resolve(classicLevelEntry, '..'), { recursive: true });
    await writeFile(classicLevelEntry, 'export {};\n');
    const systemRoot = resolve(config.profiles.serverMirror.dataPath, 'Data/systems/dnd5e');
    await mkdir(systemRoot, { recursive: true });
    await writeFile(join(systemRoot, 'system.json'), JSON.stringify({ id: 'dnd5e', version: '5.3.3' }));
    await mkdir(settingsPath, { recursive: true });
    await writeFile(join(settingsPath, 'settings-marker.txt'), 'before');
    await writeFile(join(settingsPath, 'LOCK'), '');
    await writeFile(join(worldRoot, 'world.json'), JSON.stringify({
      id: 'fvtt-v14-module-matrix',
      system: 'dnd5e',
      coreVersion: '14.364',
      systemVersion: '5.3.3',
    }));
    await run({ root, config, settingsStore });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeModuleManifest(directory: string, overrides: Record<string, unknown> = {}): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'module.json'), JSON.stringify({
    id: SPELL_RESOLVER_MODULE_ID,
    title: 'Spell Resolver',
    version: '0.1.0',
    compatibility: { minimum: '14.364', verified: '14.364', maximum: '14.364' },
    relationships: {
      systems: [{
        id: 'dnd5e',
        type: 'system',
        compatibility: { minimum: '5.3.3', verified: '5.3.3', maximum: '5.3.3' },
      }],
    },
    esmodules: ['scripts/index.js'],
    ...overrides,
  }));
}

class FakeWorldSettingsStore implements WorldSettingsStore {
  backupObservedBeforeWrite = false;
  constructor(public value: Record<string, boolean>) {}

  async preflight(): Promise<Record<string, boolean>> {
    return structuredClone(this.value);
  }

  async updateFromBackup(
    _settingsPath: string,
    backupPath: string,
    transform: (current: Record<string, boolean>) => Record<string, boolean>,
  ): Promise<{ before: Record<string, boolean>; after: Record<string, boolean>; changed: boolean }> {
    const before = structuredClone(this.value);
    const after = transform(structuredClone(before));
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (!changed) return { before, after, changed: false };
    if (!await Bun.file(resolve(backupPath, 'settings-marker.txt')).exists()) {
      throw new Error('Expected settings backup before fake write.');
    }
    this.backupObservedBeforeWrite = true;
    this.value = structuredClone(after);
    return { before, after, changed: true };
  }
}

type TestClassicLevel = new (path: string, options: Record<string, unknown>) => {
  open(): Promise<void>;
  close(): Promise<void>;
  iterator(): AsyncIterable<[string, unknown]>;
  put(key: string, value: unknown): Promise<void>;
};

async function bundledClassicLevel(): Promise<TestClassicLevel> {
  const path = resolve(process.cwd(), '.local/foundry-v14/app/14.364/node_modules/classic-level/index.js');
  const imported = await import(pathToFileURL(path).href) as { ClassicLevel: TestClassicLevel };
  return imported.ClassicLevel;
}

async function createRealSettingsDatabase(
  config: FoundryLabConfig,
  ClassicLevel: TestClassicLevel,
  modules: Record<string, boolean>,
): Promise<InstanceType<TestClassicLevel>> {
  const path = spellResolverPaths(config).approvedWorldSettings;
  await mkdir(path, { recursive: true });
  const database = new ClassicLevel(path, { keyEncoding: 'utf8', valueEncoding: 'json' });
  await database.open();
  await database.put('setting-id', {
    key: 'core.moduleConfiguration',
    value: JSON.stringify(modules),
    _stats: { modifiedTime: 1 },
  });
  return database;
}

async function readModulesFromDatabase(
  path: string,
  ClassicLevel: TestClassicLevel,
): Promise<Record<string, boolean>> {
  const database = new ClassicLevel(path, {
    createIfMissing: false,
    keyEncoding: 'utf8',
    valueEncoding: 'json',
  });
  await database.open();
  try {
    for await (const [, value] of database.iterator()) {
      const setting = value as Record<string, unknown>;
      if (setting.key === 'core.moduleConfiguration') return JSON.parse(String(setting.value));
    }
    throw new Error('missing core.moduleConfiguration');
  } finally {
    await database.close();
  }
}

async function readModulesFromDatabaseCopy(
  source: string,
  copy: string,
  ClassicLevel: TestClassicLevel,
): Promise<Record<string, boolean>> {
  await cp(source, copy, { recursive: true, force: false, errorOnExist: true });
  try {
    return await readModulesFromDatabase(copy, ClassicLevel);
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
}

async function hashNonLockTree(root: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.toLocaleLowerCase('en-US') === 'lock' || !entry.isFile()) continue;
    const bytes = await readFile(resolve(root, entry.name));
    hashes[entry.name] = createHash('sha256').update(bytes).digest('hex');
  }
  return hashes;
}
