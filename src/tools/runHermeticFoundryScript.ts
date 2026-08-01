import { lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { resolveConfiguredClassicLevelEntry } from '../../tools/foundry-ops/src/config';

const SANDBOX_PREFIX = 'fvtt-ci-sandbox-';
const FOUNDRY_OPS_PREFIX = 'FVTT_OPS_';

export function createHermeticFoundryEnvironment(
  environment: Record<string, string | undefined>,
  sandboxRoot: string,
  classicLevelEntry: string,
): Record<string, string | undefined> {
  const childEnvironment = { ...environment };
  for (const name of Object.keys(childEnvironment)) {
    if (name.toUpperCase().startsWith(FOUNDRY_OPS_PREFIX)) delete childEnvironment[name];
  }
  childEnvironment.FVTT_OPS_CI_SANDBOX_ROOT = sandboxRoot;
  childEnvironment.FVTT_OPS_LAB_ROOT = join(sandboxRoot, 'lab');
  childEnvironment.FVTT_OPS_EVIDENCE_ROOT = join(sandboxRoot, 'evidence');
  childEnvironment.FVTT_OPS_BACKUP_ROOT = join(sandboxRoot, 'backups');
  childEnvironment.FVTT_OPS_FOUNDRY_ZIP = join(sandboxRoot, 'inputs', 'FoundryVTT-Node-14.364.zip');
  childEnvironment.FVTT_OPS_WORLD_ID = 'fvtt-v14-module-matrix';
  childEnvironment.FVTT_OPS_TEST_CLASSIC_LEVEL_ENTRY = classicLevelEntry;
  return childEnvironment;
}

async function assertOwnedSandbox(sandboxRoot: string): Promise<void> {
  const resolved = resolve(sandboxRoot);
  if (dirname(resolved) !== resolve(tmpdir()) || !basename(resolved).startsWith(SANDBOX_PREFIX)) {
    throw new Error(`Refusing a CI sandbox outside the direct Windows temp boundary: ${resolved}`);
  }
  const stats = await lstat(resolved);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Refusing a CI sandbox whose identity changed: ${resolved}`);
  }
}

export async function runHermeticFoundryScript(
  scriptName: string,
  environment: Record<string, string | undefined> = process.env,
): Promise<number> {
  if (!scriptName || !/^[a-z0-9:_-]+$/i.test(scriptName)) {
    throw new Error(`Expected a package script name, received: ${scriptName || '<empty>'}`);
  }
  const classicLevelEntry = resolveConfiguredClassicLevelEntry(process.cwd(), environment);
  const dependencyStats = await lstat(classicLevelEntry);
  if (!dependencyStats.isFile() || dependencyStats.isSymbolicLink()) {
    throw new Error(`Configured classic-level test dependency is not an ordinary file: ${classicLevelEntry}`);
  }

  const sandboxRoot = await mkdtemp(join(tmpdir(), SANDBOX_PREFIX));
  try {
    await assertOwnedSandbox(sandboxRoot);
    const child = Bun.spawn(['bun', 'run', scriptName], {
      cwd: process.cwd(),
      env: createHermeticFoundryEnvironment(environment, sandboxRoot, classicLevelEntry),
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    return await child.exited;
  } finally {
    await assertOwnedSandbox(sandboxRoot);
    await rm(sandboxRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    const exitCode = await runHermeticFoundryScript(Bun.argv[2] || 'ci:verify:steps');
    process.exitCode = exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
