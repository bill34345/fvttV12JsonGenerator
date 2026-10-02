import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { applyOwnedUpgrades, hashOwnedTree, ownedTreeHash, previewOwnedUpgrades, type OwnedUpgradeSpec } from '../../lab-owned-upgrade.ts';
import { parsePatchArguments, PATCH_PATHS } from '../labCli.ts';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true }); });

async function fixture(): Promise<OwnedUpgradeSpec> {
  const root = await mkdtemp(resolve(tmpdir(), 'fvtt-weapon-patch-'));
  roots.push(root);
  const destination = resolve(root, 'installed');
  const buildRoot = resolve(root, 'built');
  for (const directory of [destination, buildRoot]) {
    for (const name of PATCH_PATHS) {
      const path = resolve(directory, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, name === 'module.json'
        ? JSON.stringify({ id: 'fvtt-weapon-mastery-properties', version: '0.1.0' })
        : `${name}: old`);
    }
  }
  await writeFile(resolve(buildRoot, 'scripts/index.js'), 'scripts/index.js: new');
  return {
    id: 'fvtt-weapon-mastery-properties', destination, buildRoot,
    expectedOldHash: ownedTreeHash(await hashOwnedTree(destination)), expectedPaths: PATCH_PATHS,
    oldVersion: '0.1.0', newVersion: '0.1.0',
  };
}

test('patch CLI requires exactly one complete old hash and only the apply switch', () => {
  const hash = 'a'.repeat(64);
  expect(parsePatchArguments([`--expected-old-hash=${hash}`])).toEqual({ expectedOldHash: hash, apply: false });
  expect(parsePatchArguments([`--expected-old-hash=${hash}`, '--apply'])).toEqual({ expectedOldHash: hash, apply: true });
  for (const args of [[], ['--expected-old-hash', hash], ['--expected-old-hash=abc'], [`--expected-old-hash=${hash}`, `--expected-old-hash=${hash}`], [`--expected-old-hash=${hash}`, '--unknown']]) {
    expect(() => parsePatchArguments(args)).toThrow();
  }
});

test('same-version 0.1.0 preview is read-only and apply checks all eight owned paths', async () => {
  const spec = await fixture();
  expect(PATCH_PATHS).toHaveLength(8);
  const [preview] = await previewOwnedUpgrades([spec]);
  expect(preview?.oldVersion).toBe('0.1.0');
  expect(preview?.newVersion).toBe('0.1.0');
  expect(preview?.changed).toEqual(['scripts/index.js']);
  expect(await readFile(resolve(spec.destination, 'scripts/index.js'), 'utf8')).toBe('scripts/index.js: old');
  const [applied] = await applyOwnedUpgrades([spec], async () => {});
  expect(applied?.apply).toBe(true);
  expect(ownedTreeHash(await hashOwnedTree(spec.destination))).toBe(applied!.newHash);
});

test('same-version patch rejects drift, missing or extra paths, foreign identity, and running guard before writes', async () => {
  const spec = await fixture();
  const script = resolve(spec.destination, 'scripts/index.js');
  await expect(previewOwnedUpgrades([{ ...spec, expectedOldHash: '0'.repeat(64) }])).rejects.toThrow('hash mismatch');
  await expect(applyOwnedUpgrades([spec], async () => { throw new Error('server running'); })).rejects.toThrow('server running');
  expect(await readFile(script, 'utf8')).toBe('scripts/index.js: old');
  await writeFile(resolve(spec.destination, 'extra.txt'), 'extra');
  await expect(previewOwnedUpgrades([spec])).rejects.toThrow('file-name set mismatch');
  await rm(resolve(spec.destination, 'extra.txt'));
  await rm(resolve(spec.buildRoot, 'README.md'));
  await expect(previewOwnedUpgrades([spec])).rejects.toThrow('file-name set mismatch');
  await writeFile(resolve(spec.buildRoot, 'README.md'), 'README.md: old');
  await writeFile(resolve(spec.buildRoot, 'module.json'), JSON.stringify({ id: 'other', version: '0.1.0' }));
  await expect(previewOwnedUpgrades([spec])).rejects.toThrow('identity/version mismatch');
  expect(await readFile(script, 'utf8')).toBe('scripts/index.js: old');
});

test('same-version patch refuses an unchanged candidate', async () => {
  const spec = await fixture();
  await writeFile(resolve(spec.buildRoot, 'scripts/index.js'), 'scripts/index.js: old');
  await expect(previewOwnedUpgrades([spec])).rejects.toThrow('contains no changed files');
});
