import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foundryPatchRoot } from './foundry-patch-root.mjs';
import { managedInputRoot } from './legacy-next-inputs/library.mjs';

const generatorRoot = fileURLToPath(new URL('../', import.meta.url));

function runPatchCommand(name: string | undefined, args: string[]): number {
  if (!name) throw new Error('Pass a Foundry patch command.');
  const patchRoot = foundryPatchRoot();
  const manifest = resolve(patchRoot, 'package.json');
  if (!existsSync(manifest)) {
    throw new Error(`Foundry patch checkout not found at ${patchRoot}. Set FVTT_PATCH_ROOT to its absolute path.`);
  }
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!Object.hasOwn(pkg.scripts ?? {}, name)) {
    throw new Error(`Foundry patch command "${name}" is missing from ${manifest}.`);
  }
  const env: NodeJS.ProcessEnv = { ...process.env, FVTT_GENERATOR_ROOT: resolve(generatorRoot) };
  const legacyInputRoot = env.FVTT_LEGACY_NEXT_INPUT_ROOT ?? managedInputRoot(generatorRoot);
  const child = spawnSync(process.execPath, ['run', name, ...args], {
    cwd: patchRoot,
    env: { ...env, FVTT_LEGACY_NEXT_INPUT_ROOT: legacyInputRoot },
    stdio: 'inherit',
  });
  if (child.error) throw child.error;
  return child.status ?? 1;
}

if (import.meta.main) {
  try {
    process.exitCode = runPatchCommand(process.argv[2], process.argv.slice(3));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
