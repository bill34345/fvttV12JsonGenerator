import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  bootstrapReferenceCache,
  formatReferenceCacheStatus,
  verifyReferenceCache,
  type ReferenceManifest,
} from '../referenceCache';
import { resolveReferenceCacheRoot } from '../referencePaths';
import { requireGitText } from '../gitCommand';

const roots: string[] = [];

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('reference cache', () => {
  it('bootstraps an absent target from a real locked source without backup siblings', async () => {
    const { root, target, manifest } = sourceFixture();
    expect(existsSync(target)).toBe(false);
    const result = await bootstrapReferenceCache(manifest, root);
    expect(result.installed).toEqual(['dnd5e-5.3.3']);
    expect(verifyReferenceCache(manifest, root).ok).toBe(true);
    expect(readFileSync(join(target, 'reference.txt'), 'utf8')).toContain('revision one');
    expect(readdirSync(dirname(target))).toEqual(['repo']);
  });

  it('reuses a complete identical checkout read-only even when its source is offline', async () => {
    const { root, source, target, manifest } = sourceFixture();
    await bootstrapReferenceCache(manifest, root);
    const before = statSync(target, { bigint: true });
    const index = join(target, '.git/index');
    const indexBytes = readFileSync(index);
    const indexTime = statSync(index, { bigint: true }).mtimeNs;
    expect(dirname(source)).toBe(root);
    rmSync(source, { recursive: true });
    const reused = await bootstrapReferenceCache(manifest, root);
    expect(reused.installed).toEqual([]);
    expect(statSync(target, { bigint: true }).ino).toBe(before.ino);
    expect(readFileSync(index)).toEqual(indexBytes);
    expect(statSync(index, { bigint: true }).mtimeNs).toBe(indexTime);
    expect(readdirSync(dirname(target))).toEqual(['repo']);
  });

  it('refuses a different available revision without moving or replacing the existing checkout', async () => {
    const { root, source, target, manifest } = sourceFixture();
    await bootstrapReferenceCache(manifest, root);
    const before = readFileSync(join(target, 'reference.txt'));
    const inode = statSync(target, { bigint: true }).ino;
    writeFileSync(join(source, 'reference.txt'), 'revision two\n');
    commitSource(source);
    manifest.components[0]!.revision = requireGitText(['-C', source, 'rev-parse', 'HEAD']).trim();
    await expect(bootstrapReferenceCache(manifest, root)).rejects.toThrow('expected revision');
    expect(readFileSync(join(target, 'reference.txt'))).toEqual(before);
    expect(statSync(target, { bigint: true }).ino).toBe(inode);
    expect(readdirSync(dirname(target))).toEqual(['repo']);
  });

  it.each(['tracked', 'missing', 'untracked', 'ignored'])('refuses %s content changes at the same revision and preserves them', async (change) => {
    const { root, target, manifest } = sourceFixture();
    await bootstrapReferenceCache(manifest, root);
    const file = join(target, change === 'tracked' || change === 'missing' ? 'reference.txt' : `${change}.txt`);
    if (change === 'missing') rmSync(file);
    else writeFileSync(file, `preserve ${change}\n`);
    await expect(bootstrapReferenceCache(manifest, root)).rejects.toThrow('checkout has changed');
    if (change === 'missing') expect(existsSync(file)).toBe(false);
    else expect(readFileSync(file, 'utf8')).toBe(`preserve ${change}\n`);
    expect(readdirSync(dirname(target))).toEqual(['repo']);
  });

  it('refuses a foreign source identity at the same revision', async () => {
    const { root, target, manifest } = sourceFixture();
    await bootstrapReferenceCache(manifest, root);
    const foreign = 'https://example.invalid/foreign-reference.git';
    requireGitText(['-C', target, 'remote', 'set-url', 'origin', foreign]);
    await expect(bootstrapReferenceCache(manifest, root)).rejects.toThrow('origin differs');
    expect(requireGitText(['-C', target, 'remote', 'get-url', 'origin']).trim()).toBe(foreign);
    expect(readdirSync(dirname(target))).toEqual(['repo']);
  });

  it('cleans only its new staging when the initial source cannot be acquired', async () => {
    const root = tempRoot();
    const target = join(root, '.local/references/dnd5e/5.3.3/repo');
    await expect(bootstrapReferenceCache(fixtureManifest('deadbeef'), root)).rejects.toThrow('clone failed');
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(dirname(target))).toEqual([]);
  });

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

function sourceFixture(): { root: string; source: string; target: string; manifest: ReferenceManifest } {
  const root = tempRoot();
  const source = join(root, 'source');
  mkdirSync(source);
  requireGitText(['init', '--quiet', source]);
  writeFileSync(join(source, 'reference.txt'), 'revision one\n');
  writeFileSync(join(source, '.gitignore'), 'ignored.txt\n');
  commitSource(source);
  const manifest = fixtureManifest(requireGitText(['-C', source, 'rev-parse', 'HEAD']).trim());
  manifest.components[0]!.source = source;
  return { root, source, target: join(root, '.local/references/dnd5e/5.3.3/repo'), manifest };
}

function commitSource(source: string): void {
  requireGitText(['-C', source, 'add', '.']);
  requireGitText(['-C', source, '-c', 'user.name=Reference Cache Fixture', '-c', 'user.email=reference@example.invalid', 'commit', '--quiet', '-m', 'reference fixture']);
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
