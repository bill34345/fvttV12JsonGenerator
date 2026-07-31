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
import { resolveReferenceCacheRoot } from '../referencePaths';

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

  it('resolves the tracked manifest into an independent external cache root', async () => {
    const root = tempRoot();
    const external = join(root, 'external-reference-cache');
    const target = join(external, 'dnd5e', '5.3.3', 'repo');
    await Bun.write(join(target, 'sentinel.txt'), 'keep');
    const result = verifyReferenceCache(fixtureManifest('deadbeef'), join(root, 'repo'), {
      referenceCacheRoot: external,
      runGit: (args) => ({
        ok: true,
        command: `git ${args.join(' ')}`,
        args: [...args],
        status: 0,
        stdout: 'deadbeef\n',
        stderr: '',
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.components[0]?.target).toBe(target);
    expect(await Bun.file(join(target, 'sentinel.txt')).text()).toBe('keep');
  });

  it('keeps an external bootstrap dry-run read-only', async () => {
    const root = tempRoot();
    const external = join(root, 'external-reference-cache');
    const result = await bootstrapReferenceCache(fixtureManifest('deadbeef'), join(root, 'repo'), {
      dryRun: true,
      referenceCacheRoot: external,
    });
    expect(result.planned).toEqual(['dnd5e-5.3.3']);
    expect(existsSync(external)).toBe(false);
  });

  it('keeps the legacy default but refuses an explicit cache inside the repository', () => {
    const root = tempRoot();
    expect(resolveReferenceCacheRoot(root, {})).toBe(join(root, '.local', 'references'));
    expect(() => resolveReferenceCacheRoot(root, {
      FVTT_REFERENCE_CACHE_ROOT: join(root, 'tracked-cache'),
    })).toThrow(/outside the repository/i);
  });

  it('validates manifest targets even during a no-write bootstrap plan', async () => {
    const root = tempRoot();
    const manifest = fixtureManifest('deadbeef');
    manifest.components[0]!.target = '../escape';
    await expect(bootstrapReferenceCache(manifest, root, { dryRun: true })).rejects.toThrow(
      /must stay under|unsafe/i,
    );
    expect(existsSync(join(root, 'escape'))).toBe(false);
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
