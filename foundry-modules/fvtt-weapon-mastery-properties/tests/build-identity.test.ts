import { expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertMatchingSourceIdentity, computeBuildId, requireFrozenBuild, type BuildIdentity } from '../build.ts';
import { verifyArtifact } from '../labCli.ts';

const moduleRoot = resolve(import.meta.dir, '..');

function explicitBuild(): void {
  // Bun.build cannot bundle this workspace module inside the bun:test process.
  const result = Bun.spawnSync({ cmd: [process.execPath, 'run', resolve(moduleRoot, 'build.ts')], cwd: moduleRoot,
    stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
}

async function changedArtifactTemporarily(path: string, replacement: Uint8Array | string, check: () => Promise<void>): Promise<void> {
  const original = await readFile(path);
  try {
    await writeFile(path, replacement);
    await check();
  } finally { await writeFile(path, original); }
}

function changedInput(identity: BuildIdentity, path: string): BuildIdentity {
  const sourceFiles = identity.sourceFiles.map((entry) => entry.path === path ? { ...entry, sha256: '0'.repeat(64) } : entry);
  expect(sourceFiles).not.toEqual(identity.sourceFiles);
  return { ...identity, sourceFiles, buildId: computeBuildId(sourceFiles, identity.toolchain) };
}

test('explicit build freezes source identity, runtime code, distribution tree and ZIP', async () => {
  explicitBuild();
  const built = await requireFrozenBuild();
  const identityFile = resolve(moduleRoot, 'dist/build-identity.json');
  const identityBytes = await readFile(identityFile);
  const zipBytes = await readFile(built.zipPath);
  const verified = await verifyArtifact();
  expect(verified.buildId).toBe(built.identity.buildId);
  expect(verified.runtimeCodeSha256).toBe(built.identity.runtimeCodeSha256);
  expect(verified.distributionTreeSha256).toBe(built.identity.distributionTreeSha256);
  expect(verified.zipSha256).toBe(built.identity.zipSha256);
  expect(await readFile(identityFile)).toEqual(identityBytes);
  expect(await readFile(built.zipPath)).toEqual(zipBytes);
  expect(JSON.stringify(built.identity)).not.toContain(moduleRoot.replace(/\\/g, '/'));
  expect(await readFile(resolve(built.moduleRoot, 'scripts/index.js'), 'utf8')).toContain(built.identity.buildId);
  const browserModule = await import(resolve(built.moduleRoot, 'scripts/index.js'));
  expect(browserModule.createWeaponMasteryPropertiesApi({} as any).buildId).toBe(built.identity.buildId);

  for (const path of [
    'foundry-modules/fvtt-weapon-mastery-properties/src/build-identity.ts',
    'foundry-modules/fvtt-weapon-mastery-properties/e2e/fixture-macro.js',
    'foundry-modules/fvtt-weapon-mastery-properties/e2e/evidence.ts',
    'foundry-modules/fvtt-weapon-mastery-properties/e2e/receipt-evidence.ts',
    'packages/contracts/src/weapon-effects.ts',
    'foundry-modules/fvtt-weapon-mastery-properties/tsconfig.json',
    'packages/contracts/tsconfig.json',
    'tsconfig.json', 'bunfig.toml',
  ]) {
    expect(() => assertMatchingSourceIdentity(built.identity, changedInput(built.identity, path))).toThrow('stale');
  }
  await changedArtifactTemporarily(resolve(built.moduleRoot, 'scripts/index.js'), 'altered bundle', async () => {
    await expect(requireFrozenBuild()).rejects.toThrow('file hashes differ');
  });
  await changedArtifactTemporarily(built.zipPath, 'altered zip', async () => {
    await expect(requireFrozenBuild()).rejects.toThrow('ZIP hash differs');
  });
  await changedArtifactTemporarily(identityFile, '{}', async () => {
    await expect(verifyArtifact()).rejects.toThrow('Frozen build identity is invalid');
  });
  expect((await requireFrozenBuild()).identity.buildId).toBe(built.identity.buildId);
// This test starts a separate compiler process and verifies complete artifacts;
// allow bounded Windows process startup beyond the 5s unit-test default.
}, 15_000);
