import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { assertExactLabPath, assertInsideLabRoot, createLabConfig, type FoundryLabConfig } from '../../tools/foundry-ops/src/config.ts';
import { buildModule, MODULE_ID, MODULE_VERSION } from './build.ts';

const APPROVED_LAB = resolve('F:/FoundryLab/foundry-v14');
const REPO_ROOT = resolve(import.meta.dir, '../..');

export function createModuleLabConfig(): FoundryLabConfig {
  return createLabConfig(REPO_ROOT);
}

function modulePaths(config: FoundryLabConfig) {
  return {
    destination: resolve(config.profiles.serverMirror.dataPath, 'Data/modules', MODULE_ID),
    staging: resolve(config.profiles.serverMirror.dataPath, 'Data/modules', `.${MODULE_ID}.installing`),
    backupRoot: resolve(config.backupRoot, MODULE_ID),
    buildRoot: resolve(config.repoRoot, 'foundry-modules', MODULE_ID, 'dist/module'),
  };
}

export function assertApprovedLab(config: FoundryLabConfig): void {
  if (resolve(config.labRoot).toLocaleLowerCase('en') !== APPROVED_LAB.toLocaleLowerCase('en')) {
    throw new Error(`Refusing Injury/Fading Spirits installation outside the approved local Lab: ${APPROVED_LAB}`);
  }
}

export async function installLocal(config = createModuleLabConfig(), apply = false): Promise<Record<string, unknown>> {
  assertApprovedLab(config);
  const paths = modulePaths(config);
  assertExactLabPath(config, paths.destination, ['data', 'server-mirror', 'Data', 'modules', MODULE_ID], 'Injury/Fading Spirits destination');
  assertInsideLabRoot(config, paths.staging);
  assertInsideLabRoot(config, paths.backupRoot);
  await buildModule();
  if (await exists(paths.staging)) throw new Error(`Stale staging directory exists: ${paths.staging}`);
  const preview = { apply, destination: paths.destination, buildRoot: paths.buildRoot, production: false };
  if (!apply) return preview;

  let backup: string | null = null;
  let installedNew = false;
  try {
    await mkdir(resolve(paths.destination, '..'), { recursive: true });
    await mkdir(paths.backupRoot, { recursive: true });
    if (await exists(paths.destination)) {
      await assertOwned(paths.destination, false);
      backup = resolve(paths.backupRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${MODULE_ID}`);
      await rename(paths.destination, backup);
    }
    await cp(paths.buildRoot, paths.staging, { recursive: true, errorOnExist: true, force: false });
    await rename(paths.staging, paths.destination);
    installedNew = true;
    await assertOwned(paths.destination, true);
    const expected = await hashTree(paths.buildRoot);
    const actual = await hashTree(paths.destination);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Installed module bytes differ from the built artifact.');
    return { ...preview, changed: true, backup, hash: treeHash(actual) };
  } catch (error) {
    if (await exists(paths.staging)) await rm(paths.staging, { recursive: true });
    if (installedNew && await exists(paths.destination)) await rm(paths.destination, { recursive: true });
    if (backup && await exists(backup)) await rename(backup, paths.destination);
    throw error;
  }
}

export async function verifyInstall(config = createModuleLabConfig()): Promise<Record<string, unknown>> {
  assertApprovedLab(config);
  const paths = modulePaths(config);
  assertExactLabPath(config, paths.destination, ['data', 'server-mirror', 'Data', 'modules', MODULE_ID], 'Injury/Fading Spirits destination');
  await assertOwned(paths.destination, true);
  const manifest = JSON.parse(await readFile(resolve(paths.destination, 'module.json'), 'utf8')) as Record<string, unknown>;
  const script = resolve(paths.destination, 'scripts/index.js');
  if (!(await lstat(script)).isFile()) throw new Error(`Installed browser entry is missing: ${script}`);
  return { ok: true, destination: paths.destination, version: manifest.version, hash: treeHash(await hashTree(paths.destination)), runtimeVerified: false };
}

async function assertOwned(path: string, exactVersion: boolean): Promise<void> {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Unsafe module path: ${path}`);
  const manifest = JSON.parse(await readFile(resolve(path, 'module.json'), 'utf8')) as Record<string, unknown>;
  if (manifest.id !== MODULE_ID || (exactVersion && manifest.version !== MODULE_VERSION)) throw new Error(`Refusing to replace or accept a foreign module at ${path}`);
}

async function hashTree(root: string): Promise<Array<{ path: string; sha256: string }>> {
  const result: Array<{ path: string; sha256: string }> = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) throw new Error(`Module tree contains a symlink/junction: ${path}`);
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) result.push({ path: path.slice(root.length + 1).replace(/\\/g, '/'), sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
    }
  }
  await visit(root);
  return result;
}

function treeHash(entries: Array<{ path: string; sha256: string }>): string {
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

async function exists(path: string): Promise<boolean> { return Boolean(await lstat(path).catch(() => undefined)); }
