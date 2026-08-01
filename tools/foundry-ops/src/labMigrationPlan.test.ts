import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AssetInventorySummary } from './asset-inventory/migrationPlanModel';
import { createHermeticLabConfig as createLabConfig } from './config';
import { runLabMigrationPlan } from './labMigrationPlan';

describe('Foundry lab migration planning', () => {
  it('writes a target-required plan without copying or creating a target', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-migration-plan-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const summaryPath = join(config.inventoryRoot, 'asset-inventory', 'accepted', 'summary.json');
    try {
      await mkdir(resolve(summaryPath, '..'), { recursive: true });
      await writeFile(summaryPath, JSON.stringify(fixtureSummary()));
      const run = await runLabMigrationPlan(config, {
        generatedAt: '2026-07-31T15:00:00.000Z',
        inventorySummaryPath: summaryPath,
      });

      expect(run.plan.status).toBe('target-required');
      expect(run.plan.planOnly).toBe(true);
      expect(run.plan.copyAuthorized).toBe(false);
      expect(run.plan.deletionAuthorized).toBe(false);
      expect(run.plan.source).toMatchObject({ fileCount: 7, totalBytes: 700, rootCount: 4 });
      expect(run.plan.batches.map((batch) => batch.id)).toEqual([
        'recovery-critical',
        'retained-evidence',
        'runtime',
        'rebuildable-last',
      ]);
      expect(await readFile(run.written.markdown, 'utf8')).toContain('不是迁移执行器');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('accepts a missing external target as plan-ready but does not create it', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-migration-target-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const summaryPath = join(config.inventoryRoot, 'asset-inventory', 'accepted', 'summary.json');
    const target = join(tempRoot, 'external-disk', 'fvtt-lab');
    try {
      await mkdir(resolve(summaryPath, '..'), { recursive: true });
      await writeFile(summaryPath, JSON.stringify(fixtureSummary()));
      const run = await runLabMigrationPlan(config, {
        generatedAt: '2026-07-31T15:01:00.000Z',
        inventorySummaryPath: summaryPath,
        targetLabRoot: target,
      });

      expect(run.plan.status).toBe('ready-for-copy-authorization');
      expect(run.plan.target).toEqual({ labRoot: resolve(target), state: 'missing' });
      expect(existsSync(target)).toBe(false);
      expect(run.plan.batches[0]?.roots[0]?.destination).toStartWith('$TARGET_FVTT_OPS_LAB_ROOT/');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('blocks overlapping and non-empty targets from copy readiness', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-migration-block-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const summaryPath = join(config.inventoryRoot, 'asset-inventory', 'accepted', 'summary.json');
    const target = join(tempRoot, 'existing-target');
    try {
      await mkdir(resolve(summaryPath, '..'), { recursive: true });
      await writeFile(summaryPath, JSON.stringify(fixtureSummary()));
      await mkdir(target, { recursive: true });
      await writeFile(join(target, 'unrelated.txt'), 'keep');
      const run = await runLabMigrationPlan(config, {
        generatedAt: '2026-07-31T15:02:00.000Z',
        inventorySummaryPath: summaryPath,
        targetLabRoot: target,
      });
      expect(run.plan.status).toBe('target-not-empty');
      expect(await readFile(join(target, 'unrelated.txt'), 'utf8')).toBe('keep');
      await expect(runLabMigrationPlan(config, {
        generatedAt: '2026-07-31T15:03:00.000Z',
        inventorySummaryPath: summaryPath,
        targetLabRoot: join(config.repoRoot, 'inside-repo'),
      })).rejects.toThrow(/outside the repository/i);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function fixtureSummary(): AssetInventorySummary {
  const roots: AssetInventorySummary['categories'][number]['roots'] = [
    fixtureRoot('world', 'worlds', '$FVTT_OPS_LAB_ROOT/data/server-mirror/Data/worlds', 1, 100, 'critical', 'not-assumed-rebuildable'),
    fixtureRoot('backup', 'backups', '$FVTT_OPS_LAB_ROOT/backups', 2, 200, 'critical', 'not-assumed-rebuildable'),
    fixtureRoot('runtime', 'app-binaries', '$FVTT_OPS_LAB_ROOT/app', 4, 400, 'review-before-removal', 'reacquirable'),
    fixtureRoot('external-archive', 'archives', '$REPO_ROOT/.local/cor-cotn.7z', 1, 999, 'critical', 'not-assumed-rebuildable'),
    fixtureRoot('missing-scratch', 'scratch-cache', '$FVTT_OPS_LAB_ROOT/scratch', 0, 0, 'review-before-removal', 'workflow-rebuildable'),
  ];
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-31T14:00:00.000Z',
    complete: true,
    categories: [
      { category: 'worlds', fileCount: 1, totalBytes: 100, roots: [roots[0]!] },
      { category: 'backups', fileCount: 2, totalBytes: 200, roots: [roots[1]!] },
      { category: 'app-binaries', fileCount: 4, totalBytes: 400, roots: [roots[2]!] },
      { category: 'archives', fileCount: 1, totalBytes: 999, roots: [roots[3]!] },
      { category: 'scratch-cache', fileCount: 0, totalBytes: 0, roots: [roots[4]!] },
    ],
  };
}

function fixtureRoot(
  id: string,
  category: AssetInventorySummary['categories'][number]['category'],
  displayPath: string,
  fileCount: number,
  totalBytes: number,
  retention: AssetInventorySummary['categories'][number]['roots'][number]['retention'],
  rebuildability: AssetInventorySummary['categories'][number]['roots'][number]['rebuildability'],
): AssetInventorySummary['categories'][number]['roots'][number] {
  return {
    id,
    category,
    displayPath,
    source: 'fixture',
    expectedVersion: null,
    rebuildability,
    retention,
    exists: fileCount > 0,
    fileCount,
    directoryCount: fileCount,
    totalBytes,
    rootSha256: id.padEnd(64, '0').slice(0, 64),
    issueCount: 0,
    packageCount: 0,
  };
}
