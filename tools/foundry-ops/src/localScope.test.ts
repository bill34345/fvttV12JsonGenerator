import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createLabConfig } from './config';
import { buildLocalScopePolicy } from './asset-inventory/scopePolicy';
import type { LocalScopePolicy } from './asset-inventory/scopeModel';
import { scanLocalScopeCoverage } from './asset-inventory/scopeScanner';
import { runLocalScopeCoverage } from './localScope';

describe('local scope coverage', () => {
  it('declares the real privacy and unresolved ownership boundaries conservatively', () => {
    const config = createLabConfig('I:/OpenCode/fvttV12JsonGenerator');
    const policy = buildLocalScopePolicy(config);
    const byName = new Map(policy.declarations.map((entry) => [entry.name, entry]));

    expect(byName.get('foundry-v14')).toMatchObject({
      status: 'classified',
      measurement: 'asset-inventory-summary',
      retention: 'critical',
    });
    expect(byName.get('references')).toMatchObject({
      status: 'classified',
      scopeClass: 'reference-cache',
      rebuildability: 'reacquirable',
    });
    expect(byName.get('goddessfantasy.cookie')).toMatchObject({
      status: 'privacy-excluded',
      measurement: 'top-level-metadata',
    });
    expect(byName.get('8080')).toMatchObject({ status: 'pending-review', retention: 'critical' });
    expect(byName.get('map')).toMatchObject({ status: 'pending-review', retention: 'preserve' });
    expect(new Set(policy.declarations.map((entry) => entry.name.toLowerCase())).size)
      .toBe(policy.declarations.length);
  });

  it('covers every declared top-level entry while never traversing a privacy root', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-scope-'));
    const repoRoot = join(tempRoot, 'repo');
    const config = createLabConfig(repoRoot);
    const localRoot = join(repoRoot, '.local');
    const evidenceRoot = join(localRoot, 'evidence');
    const privateRoot = join(localRoot, 'private-profile');
    const pendingRoot = join(localRoot, 'unknown-copy');
    try {
      await mkdir(evidenceRoot, { recursive: true });
      await mkdir(privateRoot, { recursive: true });
      await mkdir(pendingRoot, { recursive: true });
      await writeFile(join(evidenceRoot, 'report.txt'), 'accepted evidence');
      await writeFile(join(privateRoot, 'secret-token.txt'), 'must not appear in report');
      await writeFile(join(pendingRoot, 'world.db'), 'unknown ownership');
      const policy = fixturePolicy(config, [
        declaration('evidence', 'classified', 'recursive-metadata'),
        declaration('private-profile', 'privacy-excluded', 'top-level-metadata'),
        declaration('unknown-copy', 'pending-review', 'recursive-metadata'),
      ]);
      const outputRoot = join(config.inventoryRoot, 'scope-coverage', 'fixture');
      const run = await runLocalScopeCoverage(config, {
        generatedAt: '2026-07-31T16:00:00.000Z',
        outputRoot,
        policy,
      });

      expect(run.result).toMatchObject({
        coverageComplete: true,
        measurementComplete: true,
        classificationComplete: false,
        presentEntryCount: 3,
        classifiedCount: 1,
        privacyExcludedCount: 1,
        pendingReviewCount: 1,
      });
      const privateEntry = run.result.entries.find((entry) => entry.name === 'private-profile');
      expect(privateEntry?.measurementResult).toMatchObject({
        fileCount: null,
        totalBytes: null,
        measurementSource: 'top-level metadata only; privacy boundary applied',
      });
      const report = await readFile(run.written.reportJson, 'utf8');
      expect(report).not.toContain('secret-token.txt');
      expect(report).not.toContain('must not appear in report');
      expect(await readFile(run.written.reportMarkdown, 'utf8')).toContain('待人工判断：1');
      expect(await readFile(run.written.reportMarkdown, 'utf8')).toContain('验收证据');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails scope coverage when a new top-level entry has no declaration', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-scope-unexpected-'));
    const repoRoot = join(tempRoot, 'repo');
    const config = createLabConfig(repoRoot);
    try {
      await mkdir(join(repoRoot, '.local'), { recursive: true });
      await writeFile(join(repoRoot, '.local', 'unregistered.bin'), 'new bytes');
      const result = await scanLocalScopeCoverage(fixturePolicy(config, []), '2026-07-31T16:01:00.000Z');
      expect(result.coverageComplete).toBe(false);
      expect(result.unexpectedEntries).toEqual([{
        name: 'unregistered.bin',
        kind: 'file',
        bytes: 9,
      }]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses only registered lab roots from the accepted asset summary', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-scope-summary-'));
    const repoRoot = join(tempRoot, 'repo');
    const config = createLabConfig(repoRoot);
    const summaryRoot = join(config.inventoryRoot, 'asset-inventory', '2026-07-31T12-00-00-000Z');
    try {
      await mkdir(config.labRoot, { recursive: true });
      await mkdir(summaryRoot, { recursive: true });
      await writeFile(join(summaryRoot, 'summary.json'), JSON.stringify({
        complete: true,
        generatedAt: '2026-07-31T12:00:00.000Z',
        categories: [{
          fileCount: 3,
          totalBytes: 3_000,
          roots: [
            { displayPath: '$FVTT_OPS_LAB_ROOT/data', fileCount: 2, directoryCount: 4, totalBytes: 2_000 },
            { displayPath: '$REPO_ROOT/.local/external.7z', fileCount: 1, directoryCount: 0, totalBytes: 1_000 },
          ],
        }],
      }));
      const result = await scanLocalScopeCoverage(fixturePolicy(config, [{
        ...declaration('foundry-v14', 'classified', 'asset-inventory-summary'),
        scopeClass: 'registered-asset-root',
      }]), '2026-07-31T16:02:00.000Z');

      expect(result.entries[0]?.measurementResult).toMatchObject({
        fileCount: 2,
        directoryCount: 4,
        totalBytes: 2_000,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('does not call recursive metadata complete when a link is skipped', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-scope-link-'));
    const repoRoot = join(tempRoot, 'repo');
    const config = createLabConfig(repoRoot);
    const classifiedRoot = join(repoRoot, '.local', 'classified');
    const outsideRoot = join(tempRoot, 'outside');
    try {
      await mkdir(classifiedRoot, { recursive: true });
      await mkdir(outsideRoot, { recursive: true });
      await writeFile(join(outsideRoot, 'outside.txt'), 'must not be counted');
      await symlink(outsideRoot, join(classifiedRoot, 'linked'), 'junction');
      const result = await scanLocalScopeCoverage(fixturePolicy(config, [
        declaration('classified', 'classified', 'recursive-metadata'),
      ]), '2026-07-31T16:03:00.000Z');

      expect(result.coverageComplete).toBe(true);
      expect(result.measurementComplete).toBe(false);
      expect(result.entries[0]?.measurementResult).toMatchObject({
        fileCount: 0,
        skippedLinkCount: 1,
        issues: [expect.stringContaining('was not traversed')],
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('refuses to write a scope report outside configured local roots', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-scope-output-'));
    const repoRoot = join(tempRoot, 'repo');
    const config = createLabConfig(repoRoot);
    try {
      await mkdir(join(repoRoot, '.local'), { recursive: true });
      await expect(runLocalScopeCoverage(config, {
        outputRoot: join(tempRoot, 'outside'),
        policy: fixturePolicy(config, []),
      })).rejects.toThrow('Target escapes Foundry lab root');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function fixturePolicy(
  config: ReturnType<typeof createLabConfig>,
  declarations: LocalScopePolicy['declarations'],
): LocalScopePolicy {
  return {
    localRoot: resolve(config.repoRoot, '.local'),
    assetInventoryParent: resolve(config.inventoryRoot, 'asset-inventory'),
    defaultOutputParent: resolve(config.inventoryRoot, 'scope-coverage'),
    declarations,
  };
}

function declaration(
  name: string,
  status: LocalScopePolicy['declarations'][number]['status'],
  measurement: LocalScopePolicy['declarations'][number]['measurement'],
): LocalScopePolicy['declarations'][number] {
  return {
    name,
    status,
    scopeClass: status === 'privacy-excluded' ? 'private-session-state' : status === 'pending-review' ? 'pending-owner' : 'acceptance-evidence',
    producer: 'fixture',
    consumers: [],
    sensitivity: 'fixture',
    rebuildability: 'unknown',
    retention: 'preserve',
    measurement,
    evidence: ['fixture'],
    rationale: 'fixture',
  };
}
