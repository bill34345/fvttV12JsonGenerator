import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  acquireLocalSources,
  archivePasswordEnvName,
  findArchivePackageRoot,
  readLocalSourceMappings,
  validateLocalArchiveEntries,
  type LocalPackageSource,
} from '../localSources';
import { createLabConfig } from '../config';
import type { CommandResult } from '../types';

const mapping = (sourcePath: string, overrides: Partial<LocalPackageSource> = {}): LocalPackageSource => ({
  id: 'sample',
  expectedVersion: '1.0.0',
  sourcePath,
  ...overrides,
});

const commandResult = (overrides: Partial<CommandResult> = {}): CommandResult => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  commandLine: '7z',
  ...overrides,
});

async function treeSnapshot(root: string): Promise<Array<{
  path: string;
  bytes: string;
  mtimeNs: string;
}>> {
  const rows: Array<{ path: string; bytes: string; mtimeNs: string }> = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const info = await stat(path, { bigint: true });
        rows.push({
          path: path.slice(root.length).replaceAll('\\', '/'),
          bytes: (await readFile(path)).toString('base64'),
          mtimeNs: info.mtimeNs.toString(),
        });
      }
    }
  }
  await walk(root);
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

function archiveListing(entries: Array<{ path: string; folder?: boolean; encrypted?: boolean }>): string {
  return [
    'Path = source.zip',
    'Type = zip',
    '----------',
    ...entries.flatMap((entry) => [
      `Path = ${entry.path}`,
      `Folder = ${entry.folder ? '+' : '-'}`,
      `Encrypted = ${entry.encrypted ? '+' : '-'}`,
      '',
    ]),
  ].join('\n');
}

describe('local source validation', () => {
  it('rejects traversal, absolute, UNC, drive-relative, and ADS archive entries', () => {
    expect(() => validateLocalArchiveEntries(['wrapper/module.json', 'wrapper/scripts/main.js'])).not.toThrow();
    for (const unsafe of [
      '../outside.txt',
      'wrapper/../../outside.txt',
      '/absolute.txt',
      '\\server\\share\\outside.txt',
      'C:/absolute.txt',
      'C:relative.txt',
      'wrapper/file.txt:stream',
    ]) {
      expect(() => validateLocalArchiveEntries([unsafe])).toThrow('unsafe archive path');
    }
  });

  it('accepts only a root manifest or one wrapper root', () => {
    expect(findArchivePackageRoot(['module.json', 'scripts/main.js'])).toBe('');
    expect(findArchivePackageRoot(['wrapper/module.json', 'wrapper/scripts/main.js'])).toBe('wrapper');
    expect(() => findArchivePackageRoot(['one/module.json', 'two/module.json'])).toThrow('exactly one');
    expect(() => findArchivePackageRoot(['deep/wrapper/module.json'])).toThrow('wrapper');
  });

  it('derives a runtime-only password variable without storing a password in mappings', () => {
    expect(archivePasswordEnvName('dnd-ravenloft-horrors-within')).toBe(
      'FOUNDRY_LAB_ARCHIVE_PASSWORD_DND_RAVENLOFT_HORRORS_WITHIN',
    );
  });

  it('rejects secret fields and non-absolute source paths in the ignored mapping', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-mapping-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    try {
      await mkdir(config.inventoryRoot, { recursive: true });
      await writeFile(
        join(config.inventoryRoot, 'local-package-sources.json'),
        JSON.stringify([{ id: 'sample', expectedVersion: '1.0.0', sourcePath: 'relative.zip', password: 'no' }]),
      );
      await expect(readLocalSourceMappings(config)).rejects.toThrow('secret');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('accepts a Windows PowerShell UTF-8 BOM in the ignored mapping', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-mapping-bom-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    try {
      await mkdir(config.inventoryRoot, { recursive: true });
      await writeFile(
        join(config.inventoryRoot, 'local-package-sources.json'),
        `\uFEFF${JSON.stringify([mapping(resolve(tempRoot))])}`,
        'utf8',
      );
      await expect(readLocalSourceMappings(config)).resolves.toHaveLength(1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects case-insensitive mapping IDs and destination collisions before any write', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-collision-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const first = join(tempRoot, 'first');
    const second = join(tempRoot, 'second');
    try {
      await mkdir(config.inventoryRoot, { recursive: true });
      await writeFile(join(config.inventoryRoot, 'local-package-sources.json'), JSON.stringify([
        mapping(resolve(first), { id: 'Sample' }),
        mapping(resolve(second), { id: 'sample' }),
      ]));
      await expect(readLocalSourceMappings(config)).rejects.toThrow('case-insensitive');

      await mkdir(first, { recursive: true });
      await mkdir(second, { recursive: true });
      await writeFile(join(first, 'module.json'), '{"id":"Sample","version":"1.0.0"}\n');
      await writeFile(join(second, 'module.json'), '{"id":"sample","version":"1.0.0"}\n');
      const beforeFirst = await treeSnapshot(first);
      const beforeSecond = await treeSnapshot(second);
      await rm(config.labRoot, { recursive: true, force: true });

      await expect(acquireLocalSources(config, [
        mapping(resolve(first), { id: 'Sample' }),
        mapping(resolve(second), { id: 'sample' }),
      ], { apply: true })).rejects.toThrow('case-insensitive collision');

      expect(existsSync(config.labRoot)).toBe(false);
      expect(await treeSnapshot(first)).toEqual(beforeFirst);
      expect(await treeSnapshot(second)).toEqual(beforeSecond);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('local source acquisition', () => {
  it('rejects a case-variant directory source that contains the lab before mutating either tree', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-overlap-directory-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    try {
      await mkdir(config.repoRoot, { recursive: true });
      await writeFile(join(tempRoot, 'module.json'), '{"id":"sample","version":"1.0.0"}\n');
      await writeFile(join(tempRoot, 'source.bin'), 'source bytes');
      const before = await treeSnapshot(tempRoot);

      await expect(acquireLocalSources(
        config,
        [mapping(resolve(tempRoot).toUpperCase())],
        { apply: true },
      )).rejects.toThrow('overlaps Foundry lab transaction path');

      expect(await treeSnapshot(tempRoot)).toEqual(before);
      expect(existsSync(config.labRoot)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('resolves a junction archive source and rejects its overlap before hashing or running 7z', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-overlap-junction-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const archiveDir = join(config.labRoot, 'user-owned');
    const archive = join(archiveDir, 'source.zip');
    const alias = join(tempRoot, 'lab-alias');
    let commands = 0;
    try {
      await mkdir(archiveDir, { recursive: true });
      await writeFile(archive, 'source archive bytes');
      await symlink(config.labRoot, alias, 'junction');
      const before = await treeSnapshot(config.labRoot);

      await expect(acquireLocalSources(
        config,
        [mapping(join(alias, 'user-owned/source.zip'))],
        { apply: true },
        { runCommand: async () => { commands += 1; return commandResult(); } },
      )).rejects.toThrow('overlaps Foundry lab transaction path');

      expect(commands).toBe(0);
      expect(await treeSnapshot(config.labRoot)).toEqual(before);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('dry-runs an exact directory source without mutating source or lab', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-directory-dry-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const source = join(tempRoot, 'user-source');
    try {
      await mkdir(join(source, 'scripts'), { recursive: true });
      await writeFile(join(source, 'module.json'), '{"id":"sample","version":"1.0.0"}\n');
      await writeFile(join(source, 'scripts/main.js'), 'source bytes');
      const before = (await stat(join(source, 'module.json'), { bigint: true })).mtimeNs;

      const report = await acquireLocalSources(config, [mapping(resolve(source))], { apply: false });

      expect(report.actions).toHaveLength(1);
      expect(report.actions[0]?.status).toBe('planned');
      expect(report.actions[0]?.sourceKind).toBe('directory');
      expect(report.actions[0]?.sourceInventory).toHaveLength(2);
      expect(existsSync(config.labRoot)).toBe(false);
      expect((await stat(join(source, 'module.json'), { bigint: true })).mtimeNs).toBe(before);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('dry-runs an archive through a disposable snapshot without leaving lab paths behind', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-archive-dry-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const archive = join(tempRoot, 'source.zip');
    try {
      await mkdir(config.repoRoot, { recursive: true });
      await writeFile(archive, 'fake archive bytes');
      const before = await treeSnapshot(tempRoot);

      const report = await acquireLocalSources(config, [mapping(resolve(archive))], { apply: false }, {
        runCommand: async (_command, args) => {
          if (args.includes('l')) return commandResult({ stdout: archiveListing([{ path: 'module.json' }]) });
          return commandResult({ stdout: '{"id":"sample","version":"1.0.0"}' });
        },
      });

      expect(report.actions[0]?.status).toBe('planned');
      expect(existsSync(config.labRoot)).toBe(false);
      expect(await treeSnapshot(tempRoot)).toEqual(before);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('installs a wrapper archive only after listing and exact manifest validation', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-archive-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const archive = join(tempRoot, 'source.zip');
    const calls: string[] = [];
    try {
      await writeFile(archive, 'fake archive bytes');
      const report = await acquireLocalSources(config, [mapping(resolve(archive))], { apply: true }, {
        runCommand: async (_command, args) => {
          if (args.includes('l')) {
            calls.push('list');
            return commandResult({ stdout: archiveListing([
              { path: 'wrapper/', folder: true },
              { path: 'wrapper/module.json' },
              { path: 'wrapper/content.txt' },
            ]) });
          }
          if (args.includes('-so')) {
            calls.push('manifest');
            return commandResult({ stdout: '{"id":"sample","version":"1.0.0"}' });
          }
          calls.push('extract');
          const outputArg = args.find((arg) => arg.startsWith('-o'))!;
          const extractionRoot = outputArg.slice(2);
          await mkdir(join(extractionRoot, 'wrapper'), { recursive: true });
          await writeFile(join(extractionRoot, 'wrapper/module.json'), '{"id":"sample","version":"1.0.0"}\n');
          await writeFile(join(extractionRoot, 'wrapper/content.txt'), 'archive content');
          return commandResult();
        },
      });

      const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample');
      expect(calls).toEqual(['list', 'manifest', 'extract']);
      expect(report.actions[0]?.status).toBe('installed');
      expect(await readFile(join(destination, 'content.txt'), 'utf8')).toBe('archive content');
      expect(report.actions[0]?.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails an encrypted archive clearly without a runtime password and never extracts it', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-encrypted-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const archive = join(tempRoot, 'encrypted.rar');
    let extracted = false;
    try {
      await writeFile(archive, 'encrypted archive bytes');
      delete process.env[archivePasswordEnvName('sample')];
      const report = await acquireLocalSources(config, [mapping(resolve(archive))], { apply: true }, {
        runCommand: async (_command, args) => {
          if (args.includes('l')) return commandResult({ stdout: archiveListing([
            { path: 'module.json', encrypted: true },
          ]) });
          extracted = true;
          return commandResult();
        },
      });

      expect(report.actions[0]?.status).toBe('unresolved');
      expect(report.actions[0]?.error).toContain(archivePasswordEnvName('sample'));
      expect(extracted).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects an archive changed during extraction and preserves the old final tree', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-archive-toctou-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const archive = join(tempRoot, 'source.zip');
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample');
    try {
      await writeFile(archive, 'original archive bytes');
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, 'module.json'), '{"id":"sample","version":"0.9.0"}\n');
      await writeFile(join(destination, 'marker.txt'), 'old final marker');

      const report = await acquireLocalSources(config, [mapping(resolve(archive))], { apply: true }, {
        runCommand: async (_command, args) => {
          if (args.includes('l')) return commandResult({ stdout: archiveListing([
            { path: 'module.json' }, { path: 'content.txt' },
          ]) });
          if (args.includes('-so')) {
            return commandResult({ stdout: '{"id":"sample","version":"1.0.0"}' });
          }
          const outputArg = args.find((arg) => arg.startsWith('-o'))!;
          const extractionRoot = outputArg.slice(2);
          await mkdir(extractionRoot, { recursive: true });
          await writeFile(join(extractionRoot, 'module.json'), '{"id":"sample","version":"1.0.0"}\n');
          await writeFile(join(extractionRoot, 'content.txt'), 'new package bytes');
          await writeFile(archive, 'changed archive bytes');
          return commandResult();
        },
      });

      expect(report.actions[0]?.status).toBe('failed');
      expect(report.actions[0]?.error).toContain('changed after immutable snapshot extraction');
      expect(await readFile(join(destination, 'marker.txt'), 'utf8')).toBe('old final marker');
      expect(JSON.parse(await readFile(join(destination, 'module.json'), 'utf8')).version).toBe('0.9.0');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails before 7z when the source changes while copying the immutable snapshot', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-snapshot-copy-race-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const archive = join(tempRoot, 'source.zip');
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample');
    let commands = 0;
    try {
      await writeFile(archive, 'original archive bytes');
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, 'module.json'), '{"id":"sample","version":"0.9.0"}\n');
      await writeFile(join(destination, 'marker.txt'), 'old final marker');
      const beforeFinal = await treeSnapshot(destination);

      const result = await acquireLocalSources(config, [mapping(resolve(archive))], { apply: true }, {
        copyFile: async (source, target, mode) => {
          await copyFile(source, target, mode);
          await writeFile(source, 'changed at copy boundary');
        },
        runCommand: async () => { commands += 1; return commandResult(); },
      });

      expect(result.actions[0]?.status).toBe('failed');
      expect(result.actions[0]?.error).toContain('changed while creating immutable snapshot');
      expect(commands).toBe(0);
      expect(await treeSnapshot(destination)).toEqual(beforeFinal);
      expect((await readdir(config.labRoot)).some((name) => name.includes('snapshot'))).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses only the immutable snapshot for 7z and fails if the original changes at list time', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-snapshot-list-race-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const archive = join(tempRoot, 'source.zip');
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample');
    const archiveArguments: string[] = [];
    let sourceChanged = false;
    try {
      await writeFile(archive, 'original archive bytes');
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, 'module.json'), '{"id":"sample","version":"0.9.0"}\n');
      await writeFile(join(destination, 'marker.txt'), 'old final marker');
      const beforeFinal = await treeSnapshot(destination);

      const result = await acquireLocalSources(config, [mapping(resolve(archive))], { apply: true }, {
        runCommand: async (_command, args) => {
          const archiveArg = args.find((arg) => arg.endsWith('.snapshot.part'));
          if (archiveArg) archiveArguments.push(archiveArg);
          expect(args).not.toContain(resolve(archive));
          if (args.includes('l')) {
            await writeFile(archive, 'changed at list boundary');
            sourceChanged = true;
            return commandResult({ stdout: archiveListing([
              { path: 'module.json' }, { path: 'content.txt' },
            ]) });
          }
          if (args.includes('-so')) return commandResult({ stdout: '{"id":"sample","version":"1.0.0"}' });
          throw new Error('extraction must not run after the original source changes');
        },
      });

      expect(sourceChanged).toBe(true);
      expect(archiveArguments.length).toBeGreaterThanOrEqual(2);
      expect(new Set(archiveArguments).size).toBe(1);
      expect(result.actions[0]?.status).toBe('failed');
      expect(result.actions[0]?.error).toContain('changed after immutable snapshot');
      expect(await treeSnapshot(destination)).toEqual(beforeFinal);
      expect((await readdir(config.labRoot)).some((name) => name.includes('snapshot'))).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('preserves an old install on identity failure and continues to a valid entry', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-local-rollback-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const badSource = join(tempRoot, 'bad-source');
    const goodSource = join(tempRoot, 'good-source');
    const badDestination = join(config.profiles.serverMirror.dataPath, 'Data/modules/bad');
    try {
      await mkdir(badSource, { recursive: true });
      await mkdir(goodSource, { recursive: true });
      await mkdir(join(badDestination, 'storage'), { recursive: true });
      await writeFile(join(badSource, 'module.json'), '{"id":"lookalike","version":"2.0.0"}\n');
      await writeFile(join(goodSource, 'module.json'), '{"id":"good","version":"1.0.0"}\n');
      await writeFile(join(badDestination, 'module.json'), '{"id":"bad","version":"0.9.0"}\n');
      await writeFile(join(badDestination, 'marker.txt'), 'old marker');
      await writeFile(join(badDestination, 'storage/data.bin'), 'old storage');
      const tracked = [
        join(badDestination, 'module.json'),
        join(badDestination, 'marker.txt'),
        join(badDestination, 'storage/data.bin'),
      ];
      const before = await Promise.all(tracked.map(async (path) => ({
        path, bytes: await readFile(path), mtimeNs: (await stat(path, { bigint: true })).mtimeNs,
      })));

      const report = await acquireLocalSources(config, [
        mapping(resolve(badSource), { id: 'bad' }),
        mapping(resolve(goodSource), { id: 'good' }),
      ], { apply: true });

      expect(report.actions.map((entry) => entry.status)).toEqual(['failed', 'installed']);
      for (const snapshot of before) {
        expect(await readFile(snapshot.path)).toEqual(snapshot.bytes);
        expect((await stat(snapshot.path, { bigint: true })).mtimeNs).toBe(snapshot.mtimeNs);
      }
      expect(JSON.parse(await readFile(
        join(config.profiles.serverMirror.dataPath, 'Data/modules/good/module.json'), 'utf8',
      )).id).toBe('good');
      expect(existsSync(`${badDestination}.local-source-staging`)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
