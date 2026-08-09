import { cp, lstat, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createLabConfig, assertExactLabPath, assertInsideLabRoot, type FoundryLabConfig } from '../../tools/foundry-ops/src/config';
import { buildModule } from './build';

export const MODULE_ID = 'fvtt-babele-rolltable-embed-translation' as const;
export const MODULE_VERSION = '0.1.0' as const;

function paths(config: FoundryLabConfig) {
  const destination = resolve(config.profiles.serverMirror.dataPath, 'Data/modules', MODULE_ID);
  return {
    destination,
    staging: resolve(config.profiles.serverMirror.dataPath, 'Data/modules', `.${MODULE_ID}.installing`),
    backupRoot: resolve(config.backupRoot, MODULE_ID),
    buildRoot: resolve(config.repoRoot, 'foundry-modules', MODULE_ID, 'dist/module'),
  };
}

function assertDestination(config: FoundryLabConfig, path: string): void {
  assertExactLabPath(config, path, ['data', 'server-mirror', 'Data', 'modules', MODULE_ID], 'RollTable embed module destination');
}

async function exists(path: string): Promise<boolean> {
  return Boolean(await lstat(path).catch(() => undefined));
}

async function assertOwned(path: string): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(path, 'module.json'), 'utf8')) as { id?: string };
  if (manifest.id !== MODULE_ID) throw new Error(`Refusing to replace a foreign module at ${path}.`);
}

export async function installLocal(config = createLabConfig(), apply = false): Promise<Record<string, unknown>> {
  const target = paths(config);
  assertDestination(config, target.destination);
  assertInsideLabRoot(config, target.staging);
  assertInsideLabRoot(config, target.backupRoot);
  if (!(await exists(target.buildRoot))) await buildModule();
  if (await exists(target.staging)) throw new Error(`Refusing to overwrite stale staging directory: ${target.staging}`);

  const result: Record<string, unknown> = {
    apply,
    destination: target.destination,
    buildRoot: target.buildRoot,
    actions: ['Validate built module', 'Back up an owned existing module', 'Atomically install into server-mirror'],
  };
  if (!apply) return result;

  let backupPath: string | undefined;
  let movedExisting = false;
  try {
    await mkdir(resolve(target.destination, '..'), { recursive: true });
    await mkdir(target.backupRoot, { recursive: true });
    if (await exists(target.destination)) {
      await assertOwned(target.destination);
      const suffix = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = resolve(target.backupRoot, `${suffix}-${basename(target.destination)}`);
      await rename(target.destination, backupPath);
      movedExisting = true;
    }
    await cp(target.buildRoot, target.staging, { recursive: true, errorOnExist: true, force: false });
    await rename(target.staging, target.destination);
    await assertOwned(target.destination);
  } catch (error) {
    if (await exists(target.staging)) await rm(target.staging, { recursive: true, force: true });
    if (await exists(target.destination)) await rm(target.destination, { recursive: true, force: true });
    if (movedExisting && backupPath && await exists(backupPath)) await rename(backupPath, target.destination);
    throw error;
  }
  return { ...result, changed: true, backupPath };
}

export async function verifyInstall(config = createLabConfig()): Promise<Record<string, unknown>> {
  const target = paths(config);
  assertDestination(config, target.destination);
  const manifest = JSON.parse(await readFile(resolve(target.destination, 'module.json'), 'utf8')) as Record<string, unknown>;
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION) throw new Error('Installed module manifest identity/version mismatch.');
  const scriptPath = resolve(target.destination, 'scripts/index.js');
  const scriptStats = await lstat(scriptPath);
  if (!scriptStats.isFile()) throw new Error(`Installed browser script is not a file: ${scriptPath}`);
  return { ok: true, destination: target.destination, version: manifest.version, scriptPath };
}

if (import.meta.main) {
  const action = process.argv[2] ?? 'verify-install';
  if (action === 'install') console.log(JSON.stringify(await installLocal(createLabConfig(), process.argv.includes('--apply')), null, 2));
  else if (action === 'verify-install') console.log(JSON.stringify(await verifyInstall(), null, 2));
  else throw new Error(`Unsupported action: ${action}`);
}
