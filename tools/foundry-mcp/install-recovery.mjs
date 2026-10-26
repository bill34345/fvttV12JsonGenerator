import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_MAIN_SHA256 = '169abb12ddc7793f9c8dbcb7d01484a50f28d79cc82c550384a4ed70cf43d6b0';
// Previous candidate installed and read back in this task; unknown helpers stay protected.
const PREVIOUS_HELPERS = new Set(['c719d502fb45e4ed6f091510c5910a1183c9d4b24d7dd46bea9e83b98c4726e4']);
const IMPORT = "import { installBridgeRecovery } from './codex-recovery.js';\n";
const INSTANCE = 'const foundryMCPBridge = new FoundryMCPBridge();';
const INSTALL = '\ninstallBridgeRecovery(foundryMCPBridge);';
const SOCKET = 'this.socketBridge = new SocketBridge(config);';
const CONFIGURE_SOCKET = '\n            this.configureRecoverySocket?.(this.socketBridge);';
const digest = data => createHash('sha256').update(data).digest('hex');
const assert = (value, message) => { if (!value) throw new Error(message); };
export const recoveryWriteCount = plan => Number(plan.before !== plan.after) + Number(plan.existingHelper !== plan.helper);

export function patchBridgeMain(source) {
  if (source.startsWith(IMPORT) && source.includes(INSTANCE + INSTALL)) {
    assert(source.split(SOCKET + CONFIGURE_SOCKET).length === 2, 'Recovery socket guard is missing or duplicated; inspect before replacement');
    const original = source.slice(IMPORT.length).replace(INSTANCE + INSTALL, INSTANCE).replace(SOCKET + CONFIGURE_SOCKET, SOCKET);
    assert(digest(original) === BASE_MAIN_SHA256, 'Patched Bridge main differs from the verified 0.8.4 baseline');
    return source;
  }
  assert(digest(source) === BASE_MAIN_SHA256, 'Bridge main differs from the verified 0.8.4 baseline; inspect before patching');
  assert(source.split(INSTANCE).length === 2, 'Bridge initializer is not unique');
  assert(source.split(SOCKET).length === 2, 'Bridge socket initializer is not unique');
  return IMPORT + source.replace(INSTANCE, INSTANCE + INSTALL).replace(SOCKET, SOCKET + CONFIGURE_SOCKET);
}

async function ordinary(path, type) {
  const target = resolve(path);
  for (let current = target; ; current = dirname(current)) {
    const stat = await lstat(current);
    assert(!stat.isSymbolicLink(), 'Refusing a linked module path');
    if (current === target && type) assert(type === 'file' ? stat.isFile() : stat.isDirectory(), `Expected an ordinary ${type}`);
    if (dirname(current) === current) break;
  }
}

export async function planRecoveryInstall(labRoot, instance) {
  assert(isAbsolute(labRoot) && resolve(labRoot) !== parse(resolve(labRoot)).root, 'A specific absolute Lab root is required');
  assert(instance === 'mirror' || instance === 'next', 'Only local mirror|next is supported');
  const moduleRoot = join(resolve(labRoot), 'data', instance === 'mirror' ? 'server-mirror' : 'server-next', 'Data', 'modules', 'foundry-mcp-bridge');
  await ordinary(moduleRoot, 'directory');
  const manifestPath = join(moduleRoot, 'module.json');
  const mainPath = join(moduleRoot, 'dist', 'main.js');
  const helperPath = join(moduleRoot, 'dist', 'codex-recovery.js');
  await ordinary(manifestPath, 'file'); await ordinary(mainPath, 'file');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert(manifest.id === 'foundry-mcp-bridge' && manifest.version === '0.8.4', 'Expected installed Bridge 0.8.4');
  const before = await readFile(mainPath, 'utf8');
  const after = patchBridgeMain(before);
  const helper = await readFile(new URL('./bridge-recovery.mjs', import.meta.url), 'utf8');
  let existingHelper = null;
  try { await ordinary(helperPath, 'file'); existingHelper = await readFile(helperPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert(existingHelper === null || existingHelper === helper || PREVIOUS_HELPERS.has(digest(existingHelper)), 'Existing recovery helper differs; inspect before replacement');
  return { instance, moduleRoot, mainPath, helperPath, before, after, helper, existingHelper };
}

export async function installRecovery(plan) {
  await ordinary(plan.mainPath, 'file');
  assert(await readFile(plan.mainPath, 'utf8') === plan.before, 'Bridge changed after planning');
  const writes = [];
  if (plan.existingHelper !== plan.helper) writes.push({ path: plan.helperPath, content: plan.helper });
  if (plan.before !== plan.after) writes.push({ path: plan.mainPath, content: plan.after });
  for (const entry of writes) {
    await ordinary(dirname(entry.path), 'directory');
    if (entry.path === plan.helperPath && plan.existingHelper === null) {
      // A concurrent/unknown helper must never be replaced.
      await writeFile(entry.path, entry.content, { encoding: 'utf8', flag: 'wx' });
      assert(digest(await readFile(entry.path)) === digest(entry.content), 'Installed recovery bytes failed readback');
      continue;
    }
    await ordinary(entry.path, 'file');
    assert(await readFile(entry.path, 'utf8') === (entry.path === plan.mainPath ? plan.before : plan.existingHelper), 'Bridge changed during installation');
    const temporary = `${entry.path}.recovery-${randomUUID()}.tmp`;
    await writeFile(temporary, entry.content, { encoding: 'utf8', flag: 'wx' });
    // Keep a failed task-owned temporary file for inspection; do not force cleanup.
    await rename(temporary, entry.path);
    assert(digest(await readFile(entry.path)) === digest(entry.content), 'Installed recovery bytes failed readback');
  }
  return {
    instance: plan.instance, applied: writes.length > 0, filesWritten: writes.length,
    main: { path: plan.mainPath, beforeSha256: digest(plan.before), afterSha256: digest(plan.after) },
    helper: { path: plan.helperPath, sha256: digest(plan.helper) }, clientReloadRequired: writes.length > 0,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2); let labRoot, instance, apply = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--apply' && !apply) apply = true;
      else if (args[i] === '--lab-root' && !labRoot) labRoot = args[++i];
      else if (args[i] === '--instance' && !instance) instance = args[++i];
      else throw new Error('Use --instance mirror|next --lab-root <absolute> [--apply]');
    }
    const plan = await planRecoveryInstall(labRoot ?? '', instance);
    console.log(JSON.stringify(apply ? await installRecovery(plan) : {
      instance, applied: false, plan: true, mainBeforeSha256: digest(plan.before), mainAfterSha256: digest(plan.after),
      helperSha256: digest(plan.helper), filesToWrite: recoveryWriteCount(plan),
    }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
