import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertExactLabPath, createLabConfig, type FoundryLabConfig } from '../../tools/foundry-ops/src/config.ts';
import { applyOwnedUpgrades, assertServerMirrorStopped, previewOwnedUpgrades, type OwnedUpgradeSpec } from '../lab-owned-upgrade.ts';
import { buildModule, requireFrozenBuild, MODULE_ID, MODULE_VERSION } from './build.ts';

const APPROVED_LAB = resolve('F:/FoundryLab/foundry-v14');
const REPO_ROOT = resolve(import.meta.dir, '../..');
export const PATCH_PATHS = [
  'module.json', 'README.md', 'README.zh-CN.md',
  'lang/en.json', 'lang/zh-CN.json', 'scripts/index.js',
  'styles/weapon-mastery-properties.css', 'templates/weapon-manager.hbs',
] as const;

function createModuleLabConfig(): FoundryLabConfig { return createLabConfig(REPO_ROOT); }

function modulePaths(config: FoundryLabConfig) {
  return {
    destination: resolve(config.profiles.serverMirror.dataPath, 'Data/modules', MODULE_ID),
    staging: resolve(config.profiles.serverMirror.dataPath, 'Data/modules', `.${MODULE_ID}.installing`),
    buildRoot: resolve(config.repoRoot, 'foundry-modules', MODULE_ID, 'dist/module'),
  };
}

function assertApprovedLab(config: FoundryLabConfig): void {
  if (resolve(config.labRoot).toLocaleLowerCase('en') !== APPROVED_LAB.toLocaleLowerCase('en')) {
    throw new Error(`Refusing ${MODULE_ID} installation outside the approved local Lab: ${APPROVED_LAB}`);
  }
}

function assertExpectedBuildRoot(configured: string, frozen: string): void {
  if (resolve(configured).toLocaleLowerCase('en') !== resolve(frozen).toLocaleLowerCase('en')) {
    throw new Error(`Frozen build root does not match the selected repository: ${configured}`);
  }
}

async function exists(path: string): Promise<boolean> { return Boolean(await lstat(path).catch(() => undefined)); }

async function assertOwned(path: string): Promise<void> {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Unsafe module path: ${path}`);
  const manifest = JSON.parse(await readFile(resolve(path, 'module.json'), 'utf8')) as Record<string, unknown>;
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION) throw new Error(`Refusing to accept a foreign module at ${path}`);
}

export async function installLocal(config = createModuleLabConfig(), apply = false): Promise<Record<string, unknown>> {
  assertApprovedLab(config);
  const paths = modulePaths(config);
  assertExactLabPath(config, paths.destination, ['data', 'server-mirror', 'Data', 'modules', MODULE_ID], 'Weapon Mastery destination');
  assertExactLabPath(config, paths.staging, ['data', 'server-mirror', 'Data', 'modules', `.${MODULE_ID}.installing`], 'Weapon Mastery staging');
  const built = await requireFrozenBuild();
  assertExpectedBuildRoot(paths.buildRoot, built.moduleRoot);
  if (await exists(paths.destination)) throw new Error(`Refusing to overwrite an existing module at ${paths.destination}; no backup or overwrite is permitted.`);
  if (await exists(paths.staging)) throw new Error(`Stale staging directory exists: ${paths.staging}`);
  const preview = { apply, destination: paths.destination, buildRoot: paths.buildRoot, production: false, backup: false };
  if (!apply) return preview;
  try {
    await mkdir(resolve(paths.destination, '..'), { recursive: true });
    await cp(paths.buildRoot, paths.staging, { recursive: true, errorOnExist: true, force: false });
    const expected = await hashTree(paths.buildRoot);
    const actual = await hashTree(paths.staging);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Staged module bytes differ from the built artifact.');
    await rename(paths.staging, paths.destination);
    await assertOwned(paths.destination);
    return { ...preview, changed: true, hash: treeHash(actual) };
  } catch (error) {
    if (await exists(paths.staging)) await rm(paths.staging, { recursive: true });
    throw error;
  }
}

export async function verifyInstall(config = createModuleLabConfig()): Promise<Record<string, unknown>> {
  assertApprovedLab(config);
  const paths = modulePaths(config);
  assertExactLabPath(config, paths.destination, ['data', 'server-mirror', 'Data', 'modules', MODULE_ID], 'Weapon Mastery destination');
  const built = await requireFrozenBuild();
  assertExpectedBuildRoot(paths.buildRoot, built.moduleRoot);
  await assertOwned(paths.destination);
  const script = resolve(paths.destination, 'scripts/index.js');
  if (!(await lstat(script)).isFile()) throw new Error(`Installed browser entry is missing: ${script}`);
  const expected = await hashTree(paths.buildRoot);
  const actual = await hashTree(paths.destination);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Installed module bytes differ from the frozen artifact.');
  return { ok: true, destination: paths.destination, version: MODULE_VERSION,
    buildId: built.identity.buildId, runtimeCodeSha256: built.identity.runtimeCodeSha256,
    distributionTreeSha256: built.identity.distributionTreeSha256,
    hash: treeHash(actual), runtimeVerified: false };
}

export async function patchLocal(expectedOldHash: string, config = createModuleLabConfig(), apply = false): Promise<Record<string, unknown>> {
  assertApprovedLab(config);
  const paths = modulePaths(config);
  assertExactLabPath(config, paths.destination, ['data', 'server-mirror', 'Data', 'modules', MODULE_ID], 'Weapon Mastery patch destination');
  if (!/^[a-f0-9]{64}$/i.test(expectedOldHash)) throw new Error('Patch requires an explicit complete old SHA-256 hash.');
  await assertServerMirrorStopped();
  const built = await requireFrozenBuild();
  assertExpectedBuildRoot(paths.buildRoot, built.moduleRoot);
  const spec: OwnedUpgradeSpec = {
    id: MODULE_ID, destination: paths.destination, buildRoot: paths.buildRoot,
    expectedOldHash, expectedPaths: PATCH_PATHS,
    oldVersion: MODULE_VERSION, newVersion: MODULE_VERSION,
  };
  const [result] = apply ? await applyOwnedUpgrades([spec]) : await previewOwnedUpgrades([spec]);
  return { ...result, production: false, backup: false, runtimeVerified: false };
}

export function parsePatchArguments(args: readonly string[]): { expectedOldHash: string; apply: boolean } {
  const hashes = args.filter((arg) => arg.startsWith('--expected-old-hash='));
  if (hashes.length !== 1 || !/^[a-f0-9]{64}$/i.test(hashes[0]!.slice('--expected-old-hash='.length))) {
    throw new Error('Patch requires exactly one --expected-old-hash=<complete-tree-sha256>.');
  }
  if (args.some((arg) => arg !== '--apply' && arg !== hashes[0])) throw new Error('Unsupported patch option.');
  if (args.filter((arg) => arg === '--apply').length > 1) throw new Error('Duplicate --apply option.');
  return { expectedOldHash: hashes[0]!.slice('--expected-old-hash='.length), apply: args.includes('--apply') };
}

export async function verifyArtifact(): Promise<Record<string, unknown>> {
  const built = await requireFrozenBuild();
  const manifest = JSON.parse(await readFile(resolve(built.moduleRoot, 'module.json'), 'utf8')) as Record<string, unknown>;
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION) throw new Error('Built artifact manifest identity/version mismatch.');
  return { ok: true, moduleRoot: built.moduleRoot, zipPath: built.zipPath, files: built.files,
    buildId: built.identity.buildId, runtimeCodeSha256: built.identity.runtimeCodeSha256,
    distributionFiles: built.identity.files, distributionTreeSha256: built.identity.distributionTreeSha256,
    zipSha256: built.identity.zipSha256, runtimeVerified: false };
}

export async function hashTree(root: string): Promise<Array<{ path: string; sha256: string }>> {
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

if (import.meta.main) {
  const action = process.argv[2] ?? 'verify-artifact';
  if (action === 'install') console.log(JSON.stringify(await installLocal(createModuleLabConfig(), process.argv.includes('--apply')), null, 2));
  else if (action === 'patch') {
    const { expectedOldHash, apply } = parsePatchArguments(process.argv.slice(3));
    console.log(JSON.stringify(await patchLocal(expectedOldHash, createModuleLabConfig(), apply), null, 2));
  }
  else if (action === 'verify-install') console.log(JSON.stringify(await verifyInstall(), null, 2));
  else if (action === 'verify-artifact') console.log(JSON.stringify(await verifyArtifact(), null, 2));
  else if (action === 'build') console.log(JSON.stringify(await buildModule(), null, 2));
  else throw new Error(`Unsupported action: ${action}`);
}
