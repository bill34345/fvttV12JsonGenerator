import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bootstrapReferenceCache,
  formatReferenceCacheStatus,
  verifyReferenceCache,
  type ReferenceManifest,
} from '../referenceCache';

const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('reference cache', () => {
  it('keeps bootstrap dry-run read-only', async () => {
    const root = tempRoot();
    const manifest = fixtureManifest('deadbeef');

    const result = await bootstrapReferenceCache(manifest, root, { dryRun: true });

    expect(result.planned).toEqual(['dnd5e-5.3.3']);
    expect(existsSync(join(root, '.local'))).toBe(false);
  });

  it('reports missing and revision-mismatched caches without changing them', () => {
    const root = tempRoot();
    const manifest = fixtureManifest('deadbeef');

    expect(verifyReferenceCache(manifest, root).components).toEqual([
      expect.objectContaining({ id: 'dnd5e-5.3.3', status: 'missing' }),
    ]);
  });

  it('distinguishes an unreadable Git checkout from a revision mismatch', async () => {
    const root = tempRoot();
    const target = join(root, '.local', 'references', 'dnd5e', '5.3.3', 'repo');
    await Bun.write(join(target, 'sentinel.txt'), 'keep');
    const manifest = fixtureManifest('deadbeef');

    const result = verifyReferenceCache(manifest, root, {
      runGit: () => ({
        ok: false,
        command: `git -C ${target} rev-parse HEAD`,
        args: ['-C', target, 'rev-parse', 'HEAD'],
        status: 128,
        stdout: '',
        stderr: `fatal: detected dubious ownership in repository at '${target}'`,
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.components).toEqual([
      expect.objectContaining({
        id: 'dnd5e-5.3.3',
        status: 'git-error',
        expectedRevision: 'deadbeef',
        gitError: expect.objectContaining({
          status: 128,
          stderr: expect.stringContaining('dubious ownership'),
        }),
      }),
    ]);
    expect(result.components[0]?.actualRevision).toBeUndefined();
    expect(formatReferenceCacheStatus(result.components[0]!)).toContain('dubious ownership');
  });

  it('reports a readable checkout with the wrong revision as mismatch', async () => {
    const root = tempRoot();
    const target = join(root, '.local', 'references', 'dnd5e', '5.3.3', 'repo');
    await Bun.write(join(target, 'sentinel.txt'), 'keep');
    const manifest = fixtureManifest('deadbeef');

    const result = verifyReferenceCache(manifest, root, {
      runGit: () => ({
        ok: true,
        command: `git -C ${target} rev-parse HEAD`,
        args: ['-C', target, 'rev-parse', 'HEAD'],
        status: 0,
        stdout: 'cafebabe\n',
        stderr: '',
      }),
    });

    expect(result.components).toEqual([
      expect.objectContaining({
        status: 'mismatch',
        expectedRevision: 'deadbeef',
        actualRevision: 'cafebabe',
      }),
    ]);
  });

  it('leaves an existing cache untouched when acquisition fails', async () => {
    const root = tempRoot();
    const target = join(root, '.local', 'references', 'dnd5e', '5.3.3', 'repo');
    await Bun.write(join(target, 'sentinel.txt'), 'keep');
    const manifest = fixtureManifest('deadbeef');

    await expect(bootstrapReferenceCache(manifest, root)).rejects.toThrow('Reference acquisition failed');
    expect(await Bun.file(join(target, 'sentinel.txt')).text()).toBe('keep');
  });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'reference-cache-'));
  roots.push(root);
  return root;
}

function fixtureManifest(revision: string): ReferenceManifest {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-11',
    components: [{
      id: 'dnd5e-5.3.3',
      kind: 'git',
      source: 'Z:/definitely-missing/reference.git',
      revision,
      target: '.local/references/dnd5e/5.3.3/repo',
      license: 'MIT',
    }],
  };
}
