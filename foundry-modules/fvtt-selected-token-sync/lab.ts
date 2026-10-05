import { lstat, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse, resolve } from 'node:path';
import { assertExactLabPath, assertNoReparsePathComponents, createLabConfig, type FoundryLabConfig } from '../../tools/foundry-ops/src/config.ts';
import { installServerNextOwnedModule, type OwnedModuleInstallResult } from '../../tools/foundry-ops/src/serverNextOwnedModuleInstall.ts';
import { buildModule, MODULE_ID, MODULE_VERSION } from './build.ts';

const APPROVED_LAB = resolve('F:/FoundryLab/foundry-v14');
const REPO_ROOT = resolve(import.meta.dir, '../..');

export function createModuleLabConfig(): FoundryLabConfig {
  return createLabConfig(REPO_ROOT);
}

function modulePaths(config: FoundryLabConfig) {
  return {
    destination: resolve(config.labRoot, 'data/server-next/Data/modules', MODULE_ID),
    buildRoot: resolve(config.repoRoot, 'foundry-modules', MODULE_ID, 'dist/module'),
  };
}

export function assertApprovedLab(config: FoundryLabConfig): void {
  if (resolve(config.labRoot).toLocaleLowerCase('en') !== APPROVED_LAB.toLocaleLowerCase('en')) {
    throw new Error(`Refusing Selected Token Sync installation outside the approved local Lab: ${APPROVED_LAB}`);
  }
}

export async function installLocal(config = createModuleLabConfig(), apply = false): Promise<OwnedModuleInstallResult> {
  assertApprovedLab(config);
  await buildModule();
  return installServerNextOwnedModule({
    repoRoot: config.repoRoot,
    labRoot: config.labRoot,
    moduleId: MODULE_ID,
    version: MODULE_VERSION,
    apply,
  });
}

export async function verifyInstall(config = createModuleLabConfig()): Promise<Record<string, unknown>> {
  assertApprovedLab(config);
  const paths = modulePaths(config);
  assertExactLabPath(config, paths.destination, ['data', 'server-next', 'Data', 'modules', MODULE_ID], 'Selected Token Sync destination');
  assertNoReparsePathComponents(parse(config.labRoot).root, paths.destination, 'Selected Token Sync destination');
  await assertOwned(paths.destination, true);
  const script = resolve(paths.destination, 'scripts/index.js');
  if (!(await lstat(script)).isFile()) throw new Error(`Installed browser entry is missing: ${script}`);
  const expected = await hashTree(paths.buildRoot);
  const installed = await hashTree(paths.destination);
  if (JSON.stringify(expected) !== JSON.stringify(installed)) throw new Error('Installed module bytes differ from the built artifact.');
  return {
    ok: true,
    destination: paths.destination,
    version: MODULE_VERSION,
    hash: treeHash(installed),
    runtimeVerified: false,
  };
}

async function assertOwned(path: string, exactVersion: boolean): Promise<void> {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Unsafe module path: ${path}`);
  const manifest = JSON.parse(await readFile(resolve(path, 'module.json'), 'utf8')) as Record<string, unknown>;
  if (manifest.id !== MODULE_ID || (exactVersion && manifest.version !== MODULE_VERSION)) throw new Error(`Refusing to accept a foreign module at ${path}`);
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
