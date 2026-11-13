import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createDeterministicZip, MODULE_ID, MODULE_VERSION, type SpeciesNextDnd5eRuntimeMaximum } from './build';
import { verifyHomebrewSpeciesArtifact, verifyInstalledHomebrewSpeciesModule } from './verify';
import { SPECIES_V14_TARGET } from '@fvtt-json-generator/generation/species';
import { assertNoHeldLevelDbLocks, assertServerMirrorStopped } from '../lab-owned-upgrade.ts';

export interface SpeciesInstallConfig { labRoot: string; distRoot?: string; targetPath?: string }
export interface SpeciesInstallDependencies { assertStopped?: () => Promise<void> }

export function resolveSpeciesInstallTarget(config: SpeciesInstallConfig): { labRoot: string; source: string; target: string } {
  const labRoot = resolve(config.labRoot);
  if (!isAbsolute(config.labRoot) || !existsSync(labRoot)) throw new Error('Species install requires an existing absolute local Lab root.');
  const expected = resolve(labRoot, 'data/server-mirror/Data/modules', MODULE_ID);
  const target = resolve(config.targetPath ?? expected);
  if (target !== expected) throw new Error('Species installer refuses production, path escape, and non-canonical module targets.');
  const rel = relative(labRoot, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Species install target escapes the local Lab root.');
  return { labRoot, source: resolve(config.distRoot ?? resolve(import.meta.dir, 'dist'), 'module'), target };
}

export async function installHomebrewSpeciesToLab(config: SpeciesInstallConfig, apply = false, dependencies: SpeciesInstallDependencies = {}): Promise<{ target: string; applied: boolean }> {
  const paths = resolveSpeciesInstallTarget(config);
  await assertNoLinkedComponents(paths.labRoot, paths.target);
  const sourceManifest = JSON.parse(await readFile(resolve(paths.source, 'module.json'), 'utf8'));
  if (sourceManifest.id !== MODULE_ID || sourceManifest.version !== MODULE_VERSION) throw new Error('Species build source has the wrong module identity.');
  const sourceIdentity = JSON.parse(await readFile(resolve(paths.source, 'data/identity-manifest.json'), 'utf8'));
  const sourceTarget = sourceIdentity.target;
  if (!(sourceTarget?.foundry === '14.368' && sourceTarget?.dnd5e === '6.0.2')
    && !(sourceTarget?.foundry === SPECIES_V14_TARGET.foundry && sourceTarget?.dnd5e === SPECIES_V14_TARGET.dnd5e)) throw new Error('Species development installer requires an accepted native dnd5e 6 content identity.');
  const dnd5eRuntimeMaximum = sourceManifest.relationships?.systems?.[0]?.compatibility?.maximum as SpeciesNextDnd5eRuntimeMaximum;
  await verifyHomebrewSpeciesArtifact(resolve(paths.source, '..'), dnd5eRuntimeMaximum);
  await assertNative6Lab(paths.labRoot, sourceManifest);
  const assertStopped = dependencies.assertStopped ?? assertServerMirrorStopped;
  await assertStopped();
  const buildHash = await packageHash(paths.source);
  let existingHash: string | undefined;
  if (existsSync(paths.target)) {
    await assertNoLinkedComponents(paths.labRoot, paths.target);
    const markerPath = resolve(paths.target, 'data/identity-manifest.json');
    if (!existsSync(markerPath)) throw new Error('Refusing to overwrite a foreign same-ID Species module.');
    const marker = JSON.parse(await readFile(markerPath, 'utf8'));
    if (marker.moduleId !== MODULE_ID) throw new Error('Refusing to overwrite a foreign same-ID Species module.');
    await assertNoHeldPackLocks(paths.target);
    existingHash = await packageHash(paths.target);
  }
  if (!apply) {
    if (!existsSync(paths.target)) throw new Error('Species verify-install requires an installed module target.');
    await verifyInstalledHomebrewSpeciesModule(paths.target, dnd5eRuntimeMaximum);
    if (existingHash !== buildHash) throw new Error('Installed Species module differs from the verified build.');
    return { target: paths.target, applied: false };
  }
  await mkdir(resolve(paths.target, '..'), { recursive: true });
  if (existingHash === buildHash) return { target: paths.target, applied: true };
  const staging = `${paths.target}.staging-${process.pid}`;
  if (existsSync(staging)) throw new Error(`Refusing to overwrite stale Species staging directory: ${staging}`);
  await cp(paths.source, staging, { recursive: true, force: false, errorOnExist: true });
  try {
    await verifyInstalledHomebrewSpeciesModule(staging, dnd5eRuntimeMaximum);
    if (await packageHash(staging) !== buildHash) throw new Error('Staged Species module differs from the verified build.');
    await assertNoLinkedComponents(paths.labRoot, paths.target);
    await assertStopped();
    if (existingHash) {
      await assertNoHeldPackLocks(paths.target);
      if (await packageHash(paths.target) !== existingHash) throw new Error('Existing Species module changed after validation; refusing replacement.');
      await rm(paths.target, { recursive: true });
    } else if (existsSync(paths.target)) throw new Error('Species module appeared after validation; refusing replacement.');
    await rename(staging, paths.target);
    await verifyInstalledHomebrewSpeciesModule(paths.target, dnd5eRuntimeMaximum);
    if (await packageHash(paths.target) !== buildHash) throw new Error('Installed Species module differs from the verified build.');
  } catch (error) {
    throw new Error(`Species install failed at ${paths.target}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  } finally {
    if (existsSync(staging) && await packageHash(staging) === buildHash) await rm(staging, { recursive: true });
  }
  return { target: paths.target, applied: true };
}

async function packageHash(root: string): Promise<string> { return createHash('sha256').update(await createDeterministicZip(root)).digest('hex'); }

async function assertNative6Lab(labRoot: string, manifest: any): Promise<void> {
  const appPath = resolve(labRoot, 'app/14.370/package.json');
  const systemPath = resolve(labRoot, 'data/server-mirror/Data/systems/dnd5e/system.json');
  await assertNoLinkedComponents(labRoot, appPath);
  await assertNoLinkedComponents(labRoot, systemPath);
  const app = JSON.parse(await readFile(appPath, 'utf8'));
  const system = JSON.parse(await readFile(systemPath, 'utf8'));
  const version = typeof system.version === 'string' ? /^(6)\.(\d+)\.(\d+)(?:\+[-.\w]+)?$/u.exec(system.version) : null;
  const numeric = version ? version.slice(1, 4).map(Number) : [];
  const minimum = String(manifest.relationships.systems[0].compatibility.minimum).split('.').map(Number);
  const maximum = String(manifest.relationships.systems[0].compatibility.maximum).split('.').map(Number);
  const coreMaximum = Number(String(manifest.compatibility.maximum).split('.')[1]);
  if (app.release?.generation !== 14 || app.release?.build !== 370 || coreMaximum < 370 || system.id !== 'dnd5e' || !version || numeric[1]! < minimum[1]! || numeric[1] === minimum[1] && numeric[2]! < minimum[2]! || numeric[1]! > maximum[1]! || numeric[1] === maximum[1] && numeric[2]! > maximum[2]!) {
    throw new Error('Species installer requires Core 14.370 / native dnd5e 6 within the built manifest compatibility range.');
  }
}

async function assertNoLinkedComponents(root: string, target: string): Promise<void> { let current = resolve(root); if ((await lstat(current)).isSymbolicLink()) throw new Error(`Species install path contains a symlink or junction: ${current}`); const segments = relative(current, target).split(/[\\/]+/u).filter(Boolean); for (const segment of segments) { current = resolve(current, segment); const info = await lstat(current).catch(() => undefined); if (info?.isSymbolicLink()) throw new Error(`Species install path contains a symlink or junction: ${current}`); } }
async function assertNoHeldPackLocks(root: string): Promise<void> {
  const packs = resolve(root, 'packs');
  if (!existsSync(packs)) return;
  const paths: string[] = [];
  for (const pack of await readdir(packs, { withFileTypes: true })) if (pack.isDirectory()) {
    const path = resolve(packs, pack.name, 'LOCK');
    const info = await lstat(path).catch((error) => { if (error.code !== 'ENOENT') throw error; return undefined; });
    if (info?.isSymbolicLink()) throw new Error(`Species Pack LOCK is a link: ${path}`);
    if (info?.isFile()) paths.push(path);
  }
  await assertNoHeldLevelDbLocks(paths);
}

if (import.meta.main) {
  const labRoot = process.env.FVTT_OPS_LAB_ROOT?.trim();
  if (!labRoot) { console.error('FVTT_OPS_LAB_ROOT is required.'); process.exitCode = 1; }
  else installHomebrewSpeciesToLab({ labRoot }, process.argv.includes('--apply')).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
