import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { MODULE_ID, MODULE_VERSION } from './build';
import { verifyHomebrewSpeciesArtifact, verifyInstalledHomebrewSpeciesModule } from './verify';

export interface SpeciesInstallConfig { labRoot: string; distRoot?: string; targetPath?: string }

export function resolveSpeciesInstallTarget(config: SpeciesInstallConfig): { labRoot: string; source: string; target: string; backupRoot: string } {
  const labRoot = resolve(config.labRoot);
  if (!isAbsolute(config.labRoot) || !existsSync(labRoot)) throw new Error('Species install requires an existing absolute local Lab root.');
  const expected = resolve(labRoot, 'data/server-mirror/Data/modules', MODULE_ID);
  const target = resolve(config.targetPath ?? expected);
  if (target !== expected) throw new Error('Species installer refuses production, path escape, and non-canonical module targets.');
  const rel = relative(labRoot, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Species install target escapes the local Lab root.');
  return { labRoot, source: resolve(config.distRoot ?? resolve(import.meta.dir, 'dist'), 'module'), target, backupRoot: resolve(labRoot, 'backups', MODULE_ID) };
}

export async function installHomebrewSpeciesToLab(config: SpeciesInstallConfig, apply = false): Promise<{ target: string; applied: boolean; backupPath?: string }> {
  const paths = resolveSpeciesInstallTarget(config);
  await assertNoLinkedComponents(paths.labRoot, paths.target);
  await verifyHomebrewSpeciesArtifact(resolve(paths.source, '..'));
  const sourceManifest = JSON.parse(await readFile(resolve(paths.source, 'module.json'), 'utf8'));
  if (sourceManifest.id !== MODULE_ID || sourceManifest.version !== MODULE_VERSION) throw new Error('Species build source has the wrong module identity.');
  let backupPath: string | undefined;
  if (existsSync(paths.target)) {
    await assertNoLinkedComponents(paths.labRoot, paths.target);
    const markerPath = resolve(paths.target, 'data/identity-manifest.json');
    if (!existsSync(markerPath)) throw new Error('Refusing to overwrite a foreign same-ID Species module.');
    const marker = JSON.parse(await readFile(markerPath, 'utf8'));
    if (marker.moduleId !== MODULE_ID) throw new Error('Refusing to overwrite a foreign same-ID Species module.');
    if (await containsPackLock(paths.target)) throw new Error('Species module target contains an active Pack LOCK; stop the local Lab before installing.');
  }
  if (!apply) {
    if (!existsSync(paths.target)) throw new Error('Species verify-install requires an installed module target.');
    await verifyInstalledHomebrewSpeciesModule(paths.target);
    return { target: paths.target, applied: false };
  }
  await mkdir(resolve(paths.target, '..'), { recursive: true });
  const staging = `${paths.target}.staging-${process.pid}`; await rm(staging, { recursive: true, force: true }); await cp(paths.source, staging, { recursive: true });
  await verifyInstalledHomebrewSpeciesModule(staging);
  if (existsSync(paths.target)) { await mkdir(paths.backupRoot, { recursive: true }); backupPath = resolve(paths.backupRoot, `${MODULE_VERSION}-${Date.now()}`); await rename(paths.target, backupPath); }
  try {
    await rename(staging, paths.target);
    await verifyInstalledHomebrewSpeciesModule(paths.target);
  } catch (error) {
    if (existsSync(paths.target)) await rename(paths.target, `${paths.target}.failed-${Date.now()}`);
    if (backupPath && existsSync(backupPath) && !existsSync(paths.target)) await rename(backupPath, paths.target);
    throw error;
  }
  return { target: paths.target, applied: true, ...(backupPath ? { backupPath } : {}) };
}

async function assertNoLinkedComponents(root: string, target: string): Promise<void> { let current = resolve(root); const segments = relative(current, target).split(/[\\/]+/u).filter(Boolean); for (const segment of segments) { current = resolve(current, segment); const info = await lstat(current).catch(() => undefined); if (info?.isSymbolicLink()) throw new Error(`Species install path contains a symlink or junction: ${current}`); } }
async function containsPackLock(root: string): Promise<boolean> { const packs = resolve(root, 'packs'); if (!existsSync(packs)) return false; for (const pack of await readdir(packs, { withFileTypes: true })) if (pack.isDirectory() && existsSync(resolve(packs, pack.name, 'LOCK'))) return true; return false; }

if (import.meta.main) {
  const labRoot = process.env.FVTT_OPS_LAB_ROOT?.trim();
  if (!labRoot) { console.error('FVTT_OPS_LAB_ROOT is required.'); process.exitCode = 1; }
  else installHomebrewSpeciesToLab({ labRoot }, process.argv.includes('--apply')).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
