import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHermeticLabConfig as createLabConfig } from './config';
import { runLocalAssetInventory } from './assetInventory';
import { buildAssetInventoryPolicy, type AssetInventoryPolicy } from './asset-inventory/policy';

describe('Foundry local asset inventory', () => {
  it('defines conservative retention and explicit credential exclusions', () => {
    const config = createLabConfig('I:/OpenCode/fvttV12JsonGenerator');
    const policy = buildAssetInventoryPolicy(config);

    expect(policy.roots.some((root) => root.category === 'app-binaries')).toBe(true);
    expect(policy.roots.some((root) => root.category === 'modules')).toBe(true);
    expect(policy.roots.filter((root) => root.category === 'worlds').every((root) =>
      root.retention === 'critical' && root.rebuildability === 'not-assumed-rebuildable')).toBe(true);
    expect(policy.roots.filter((root) => root.category === 'scratch-cache').every((root) =>
      root.retention === 'review-before-removal')).toBe(true);
    expect(policy.exclusions.some((entry) => entry.displayPath.includes('credentials'))).toBe(true);
    expect(policy.exclusions.some((entry) => entry.displayPath.includes('cookie'))).toBe(true);
    expect(policy.exclusions.some((entry) => entry.displayPath.includes('world-audit-20260724/node_modules'))).toBe(true);
  });

  it('writes separate category manifests and reports exact duplicates without changing source files', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-asset-inventory-'));
    const repoRoot = join(tempRoot, 'repo');
    const config = createLabConfig(repoRoot);
    const modulesRoot = join(config.labRoot, 'fixture-modules');
    const worldsRoot = join(config.labRoot, 'fixture-worlds');
    const archivesRoot = join(config.labRoot, 'fixture-archives');
    const moduleRoot = join(modulesRoot, 'fixture-module');
    const worldRoot = join(worldsRoot, 'fixture-world');
    const duplicate = 'same exact bytes';
    const moduleFile = join(moduleRoot, 'asset.bin');
    const archiveFile = join(archivesRoot, 'asset-copy.bin');

    try {
      await mkdir(moduleRoot, { recursive: true });
      await mkdir(worldRoot, { recursive: true });
      await mkdir(archivesRoot, { recursive: true });
      await writeFile(join(moduleRoot, 'module.json'), JSON.stringify({
        id: 'fixture-module',
        title: 'Fixture Module',
        version: '1.2.3',
        manifest: 'https://user:secret@example.test/module.json?token=fixture#fragment',
        download: 'file:///private/package.zip',
      }));
      await writeFile(join(worldRoot, 'world.json'), JSON.stringify({ id: 'fixture-world', version: '2' }));
      await writeFile(moduleFile, duplicate);
      await writeFile(archiveFile, duplicate);
      await writeFile(join(worldRoot, 'world.db'), 'unique world bytes');

      const outputRoot = join(config.inventoryRoot, 'asset-inventory', 'fixture-run');
      const run = await runLocalAssetInventory(config, {
        generatedAt: '2026-07-31T12:00:00.000Z',
        outputRoot,
        policy: fixturePolicy(config, modulesRoot, worldsRoot, archivesRoot),
      });

      expect(run.result.complete).toBe(true);
      expect(run.result.categories).toHaveLength(8);
      expect(run.result.duplicates.duplicateGroupCount).toBe(1);
      expect(run.result.duplicates.groups[0]).toMatchObject({
        copies: 2,
        bytesPerCopy: Buffer.byteLength(duplicate),
        theoreticalDuplicateBytes: Buffer.byteLength(duplicate),
      });
      const modules = run.result.categories.find((entry) => entry.category === 'modules');
      expect(modules?.roots[0]?.packages[0]).toMatchObject({
        id: 'fixture-module',
        version: '1.2.3',
        manifest: 'https://example.test/module.json',
        download: null,
      });
      expect(await readFile(moduleFile, 'utf8')).toBe(duplicate);
      expect(await readFile(archiveFile, 'utf8')).toBe(duplicate);
      expect(JSON.parse(await readFile(join(outputRoot, 'manifest.modules.json'), 'utf8')).category).toBe('modules');
      expect(await readFile(join(outputRoot, 'summary.md'), 'utf8')).toContain('不是删除建议');
      expect(await readFile(join(outputRoot, 'duplicates.md'), 'utf8')).toContain('fixture-modules/fixture-module/asset.bin');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('skips a junction instead of traversing outside the registered root', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-asset-link-'));
    const repoRoot = join(tempRoot, 'repo');
    const config = createLabConfig(repoRoot);
    const modulesRoot = join(config.labRoot, 'fixture-modules');
    const outsideRoot = join(tempRoot, 'outside');
    try {
      await mkdir(modulesRoot, { recursive: true });
      await mkdir(outsideRoot, { recursive: true });
      await writeFile(join(outsideRoot, 'secret.txt'), 'must not be hashed');
      await symlink(outsideRoot, join(modulesRoot, 'escape'), 'junction');
      const run = await runLocalAssetInventory(config, {
        generatedAt: '2026-07-31T12:01:00.000Z',
        outputRoot: join(config.inventoryRoot, 'asset-inventory', 'link-run'),
        policy: fixturePolicy(config, modulesRoot),
      });

      expect(run.result.complete).toBe(false);
      const modules = run.result.categories.find((entry) => entry.category === 'modules');
      expect(modules?.fileCount).toBe(0);
      expect(modules?.roots[0]?.issues).toEqual([
        expect.objectContaining({ path: 'escape', kind: 'skipped-link' }),
      ]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('refuses to write a report outside configured local roots', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-asset-output-'));
    const repoRoot = join(tempRoot, 'repo');
    const config = createLabConfig(repoRoot);
    try {
      await expect(runLocalAssetInventory(config, {
        outputRoot: join(tempRoot, 'outside-report'),
        policy: fixturePolicy(config, join(config.labRoot, 'missing')),
      })).rejects.toThrow('Target escapes Foundry lab root');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function fixturePolicy(
  config: ReturnType<typeof createLabConfig>,
  modulesRoot: string,
  worldsRoot?: string,
  archivesRoot?: string,
): AssetInventoryPolicy {
  const roots: AssetInventoryPolicy['roots'] = [
    {
      id: 'fixture-modules',
      category: 'modules',
      path: modulesRoot,
      displayPath: '$FIXTURE/modules',
      source: 'test fixture',
      expectedVersion: null,
      rebuildability: 'unknown',
      retention: 'review-before-removal',
      packageManifest: 'module.json',
    },
  ];
  if (worldsRoot) roots.push({
    id: 'fixture-worlds',
    category: 'worlds',
    path: worldsRoot,
    displayPath: '$FIXTURE/worlds',
    source: 'test fixture',
    expectedVersion: null,
    rebuildability: 'not-assumed-rebuildable',
    retention: 'critical',
    packageManifest: 'world.json',
  });
  if (archivesRoot) roots.push({
    id: 'fixture-archives',
    category: 'archives',
    path: archivesRoot,
    displayPath: '$FIXTURE/archives',
    source: 'test fixture',
    expectedVersion: null,
    rebuildability: 'unknown',
    retention: 'preserve',
  });
  return { roots, exclusions: [], defaultOutputParent: resolve(config.inventoryRoot, 'asset-inventory') };
}
