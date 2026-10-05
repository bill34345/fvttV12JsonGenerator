import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { applyOwnedUpgrades, exactOwnedModulePaths, hashOwnedTree, ownedTreeHash, previewOwnedUpgrades, type OwnedUpgradeSpec } from './lab-owned-upgrade.ts';

const roots: string[] = [];
afterAll(async () => {
  for (const root of roots) {
    const absolute = resolve(root);
    if (!absolute.startsWith(resolve(tmpdir()) + '\\') && !absolute.startsWith(resolve(tmpdir()) + '/')) {
      throw new Error(`Unsafe test cleanup target: ${absolute}`);
    }
    await rm(absolute, { recursive: true });
  }
});

async function tree(root: string, names: readonly string[], version: string): Promise<void> {
  for (const name of names) {
    const path = join(root, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, name === 'module.json'
      ? JSON.stringify({ id: 'fvtt-custom-conditions', version })
      : `${version}:${name}`);
  }
}

test('0.2.0 candidate validates exact legacy/new file sets and creates only three owned Injury icons', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fvtt-owned-upgrade-'));
  roots.push(root);
  const destination = join(root, 'installed');
  const buildRoot = join(root, 'candidate');
  const oldPaths = exactOwnedModulePaths('fvtt-custom-conditions');
  const newPaths = exactOwnedModulePaths('fvtt-custom-conditions', '0.2.0');
  expect(newPaths.length - oldPaths.length).toBe(3);
  expect(newPaths.filter((path) => !oldPaths.includes(path))).toEqual([
    'icons/injury/injury-1.svg', 'icons/injury/injury-2.svg', 'icons/injury/injury-3.svg',
  ]);
  await tree(destination, oldPaths, '0.1.1');
  await tree(buildRoot, newPaths, '0.2.0');
  const spec: OwnedUpgradeSpec = { id: 'fvtt-custom-conditions', destination, buildRoot,
    expectedOldHash: ownedTreeHash(await hashOwnedTree(destination)), expectedPaths: oldPaths,
    expectedNewPaths: newPaths, oldVersion: '0.1.1', newVersion: '0.2.0' };
  const preview = await previewOwnedUpgrades([spec]);
  expect(preview[0]).toMatchObject({ oldVersion: '0.1.1', newVersion: '0.2.0', apply: false });
  expect(preview[0]!.changed).toContain('icons/injury/injury-1.svg');
  await applyOwnedUpgrades([spec], async () => {});
  expect(ownedTreeHash(await hashOwnedTree(destination))).toBe(ownedTreeHash(await hashOwnedTree(buildRoot)));
  expect(await readFile(join(destination, 'icons/injury/injury-3.svg'), 'utf8')).toBe('0.2.0:icons/injury/injury-3.svg');
});

test('candidate rejects a missing new icon before any installed file changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fvtt-owned-upgrade-'));
  roots.push(root);
  const destination = join(root, 'installed');
  const buildRoot = join(root, 'candidate');
  const oldPaths = exactOwnedModulePaths('fvtt-custom-conditions');
  const newPaths = exactOwnedModulePaths('fvtt-custom-conditions', '0.2.0');
  await tree(destination, oldPaths, '0.1.1');
  await tree(buildRoot, newPaths.filter((path) => path !== 'icons/injury/injury-2.svg'), '0.2.0');
  const oldHash = ownedTreeHash(await hashOwnedTree(destination));
  await expect(previewOwnedUpgrades([{ id: 'fvtt-custom-conditions', destination, buildRoot,
    expectedOldHash: oldHash, expectedPaths: oldPaths, expectedNewPaths: newPaths,
    oldVersion: '0.1.1', newVersion: '0.2.0' }])).rejects.toThrow('Exact file-name set mismatch');
  expect(ownedTreeHash(await hashOwnedTree(destination))).toBe(oldHash);
});

test('same-version 0.2.0 patch rejects identical bytes and changes only the declared current tree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fvtt-owned-ui-patch-'));
  roots.push(root);
  const destination = join(root, 'installed');
  const buildRoot = join(root, 'candidate');
  const names = exactOwnedModulePaths('fvtt-custom-conditions', '0.2.0');
  await tree(destination, names, '0.2.0');
  await tree(buildRoot, names, '0.2.0');
  const spec: OwnedUpgradeSpec = { id: 'fvtt-custom-conditions', destination, buildRoot,
    expectedOldHash: ownedTreeHash(await hashOwnedTree(destination)), expectedPaths: names,
    expectedNewPaths: names, oldVersion: '0.2.0', newVersion: '0.2.0' };
  await expect(previewOwnedUpgrades([spec])).rejects.toThrow('Same-version patch contains no changed files');
  await writeFile(join(buildRoot, 'scripts/index.js'), 'manager-summary-ui-patch');
  const previews = await previewOwnedUpgrades([spec]);
  expect(previews[0]!.changed).toEqual(['scripts/index.js']);
  await applyOwnedUpgrades([spec], async () => {});
  expect(ownedTreeHash(await hashOwnedTree(destination))).toBe(ownedTreeHash(await hashOwnedTree(buildRoot)));
});

test('IFS 1.0.1 to 1.1.0 keeps exact tree and stopped-service gates without backups', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fvtt-ifs-owned-upgrade-'));
  roots.push(root);
  const destination = join(root, 'installed');
  const buildRoot = join(root, 'candidate');
  const names = ['module.json', 'scripts/index.js'] as const;
  const newNames = [...names, 'CREDITS.md'];
  for (const [directory, version] of [[destination, '1.0.1'], [buildRoot, '1.1.0']] as const) {
    await tree(directory, version === '1.1.0' ? newNames : names, version);
    await writeFile(join(directory, 'module.json'), JSON.stringify({ id: 'fvtt-injury-fading-spirits', version }));
  }
  const oldHash = ownedTreeHash(await hashOwnedTree(destination));
  const spec: OwnedUpgradeSpec = { id: 'fvtt-injury-fading-spirits', destination, buildRoot,
    expectedOldHash: oldHash, expectedPaths: names, expectedNewPaths: newNames, oldVersion: '1.0.1', newVersion: '1.1.0' };
  expect((await previewOwnedUpgrades([spec]))[0]).toMatchObject({ oldVersion: '1.0.1', newVersion: '1.1.0', apply: false });
  await expect(applyOwnedUpgrades([spec], async () => { throw new Error('Fixture service is running'); }))
    .rejects.toThrow('Fixture service is running');
  expect(ownedTreeHash(await hashOwnedTree(destination))).toBe(oldHash);
  await writeFile(join(buildRoot, 'OTHER.md'), 'not an approved addition');
  await expect(applyOwnedUpgrades([{ ...spec, expectedNewPaths: [...newNames, 'OTHER.md'] }], async () => {}))
    .rejects.toThrow('Unapproved new module file');
  expect(ownedTreeHash(await hashOwnedTree(destination))).toBe(oldHash);
  await rm(join(buildRoot, 'OTHER.md'));
  await expect(previewOwnedUpgrades([{ ...spec, expectedOldHash: '0'.repeat(64) }])).rejects.toThrow('Old complete-tree hash mismatch');
  await applyOwnedUpgrades([spec], async () => {});
  expect(ownedTreeHash(await hashOwnedTree(destination))).toBe(ownedTreeHash(await hashOwnedTree(buildRoot)));
  expect(await readdir(root)).toEqual(['candidate', 'installed']);
  expect(await readdir(destination)).toEqual(['CREDITS.md', 'module.json', 'scripts']);
  expect(await readFile(join(destination, 'CREDITS.md'), 'utf8')).toBe('1.1.0:CREDITS.md');
});
