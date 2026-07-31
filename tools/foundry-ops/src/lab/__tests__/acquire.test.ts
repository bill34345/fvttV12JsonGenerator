import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  acquirePackages,
  buildArchiveExtractionCommand,
  buildAcquisitionActions,
  buildScpRemoteSpec,
  buildScpCommandArgs,
  downloadHttpsArchive,
  validateArchiveIdentity,
  validateArchiveEntries,
  verifyTransferredTree,
  isRuntimeLockPath,
  hasOnlyRuntimeLockErrors,
  verifyStorageTrees,
  copyPersistentStorageFromRemote,
} from '../acquire';
import { createLabConfig as createBaseLabConfig } from '../../config';
import type { ClassifiedPackage, PackageClass } from '../../types';

const REMOTE_TEST_ENV = {
  FVTT_OPS_PRODUCTION_SSH_TARGET: 'test-production',
  FVTT_OPS_PRODUCTION_DATA_PATH: 'E:/test/foundry-data',
  FVTT_OPS_PRODUCTION_SSH_IDENTITY: 'C:/test/id_ed25519',
};
const createLabConfig = (repoRoot?: string) => createBaseLabConfig(repoRoot, REMOTE_TEST_ENV);

const classified = (
  packageClass: PackageClass,
  overrides: Partial<ClassifiedPackage['disk'] & {}> = {},
): ClassifiedPackage => ({
  active: { id: 'sample', title: 'Sample', version: '1.0.0' },
  disk: {
    folder: 'sample', id: 'sample', title: 'Sample', version: '1.0.0', compatibility: {},
    manifest: 'https://example.test/module.json', download: 'https://example.test/sample-1.0.0.zip',
    requires: [], conflicts: [], protected: packageClass === 'account-protected', persistentStorage: false,
    manifestSha256: 'a'.repeat(64), parseError: null,
    ...overrides,
  },
  packageClass,
  reasons: [],
});

describe('acquisition planning', () => {
  it('maps each package class to its safe acquisition action', () => {
    expect(buildAcquisitionActions([classified('upstream-exact')])).toEqual([
      expect.objectContaining({ kind: 'download', id: 'sample', expectedVersion: '1.0.0' }),
    ]);
    expect(buildAcquisitionActions([classified('account-protected')])).toEqual([
      expect.objectContaining({ kind: 'authorized-manual-install', id: 'sample' }),
    ]);
    expect(buildAcquisitionActions([classified('server-only')])).toEqual([
      expect.objectContaining({ kind: 'scp-directory', id: 'sample', remoteFolder: 'sample' }),
    ]);
    expect(buildAcquisitionActions([classified('manual-review')])).toEqual([
      expect.objectContaining({ kind: 'manual-review', id: 'sample' }),
    ]);
  });

  it('rejects Windows-unsafe package path segments', () => {
    for (const id of ['sample:ads', 'sample?', 'sample.', 'sample ', 'CON']) {
      const entry = classified('upstream-exact');
      entry.active.id = id;
      expect(() => buildAcquisitionActions([entry])).toThrow('safe path segment');
    }
  });

  it('rejects archive manifests whose id or version differ', () => {
    expect(() => validateArchiveIdentity(
      { expectedId: 'sample', expectedVersion: '1.0.0' },
      { id: 'sample', version: '2.0.0' },
    )).toThrow('Package identity mismatch');
    expect(() => validateArchiveIdentity(
      { expectedId: 'sample', expectedVersion: '1.0.0' },
      { id: 'lookalike', version: '1.0.0' },
    )).toThrow('Package identity mismatch');
  });

  it('dry-run returns 88 module actions plus two system profile actions without writes', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-acquire-dry-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const packages = Array.from({ length: 88 }, (_, index) => {
      const value = classified(index < 76 ? 'upstream-exact' : 'server-only');
      value.active = { id: `module-${index}`, title: `Module ${index}`, version: '1.0.0' };
      value.disk = { ...value.disk!, id: value.active.id, folder: value.active.id };
      return value;
    });
    try {
      const report = await acquirePackages(config, packages, { apply: false }, {
        readDnd5eManifest: async () => ({
          id: 'dnd5e', version: '5.3.3',
          download: 'https://example.test/dnd5e-5.3.3.zip',
        }),
      });

      expect(report.actions).toHaveLength(90);
      expect(report.actions.every((action) => action.status === 'planned')).toBe(true);
      expect(report.installed).toBe(0);
      expect(report.unresolved).toBe(0);
      expect(report.failed).toBe(0);
      expect(existsSync(config.labRoot)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('archive and install safety', () => {
  it('treats a verified absent remote persistent-storage directory as empty', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-storage-absent-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample/storage');
    const commands: string[] = [];
    try {
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, 'stale.bin'), 'stale');
      const result = await copyPersistentStorageFromRemote(config, 'sample', destination, async (command) => {
        commands.push(command);
        return { exitCode: 0, stdout: '{"exists":false,"files":[]}', stderr: '', commandLine: command };
      });
      expect(result).toEqual({ files: 0, bytes: 0, missingAsEmpty: true });
      expect(commands).toEqual(['ssh']);
      expect(existsSync(destination)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('verifies an existing but empty remote persistent-storage directory as empty', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-storage-empty-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample/storage');
    const commands: string[] = [];
    try {
      const result = await copyPersistentStorageFromRemote(config, 'sample', destination, async (command, _args) => {
        commands.push(command);
        if (command === 'ssh') {
          return { exitCode: 0, stdout: '{"exists":true,"files":[]}', stderr: '', commandLine: command };
        }
        await mkdir(`${destination}.staging`, { recursive: true });
        return { exitCode: 0, stdout: '', stderr: '', commandLine: command };
      });
      expect(result).toEqual({ files: 0, bytes: 0 });
      expect(commands).toEqual(['ssh', 'scp']);
      expect(existsSync(destination)).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('preserves relative paths and verifies hashes for existing remote storage files', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-storage-files-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample/storage');
    const bytes = 'persistent bytes';
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    try {
      const result = await copyPersistentStorageFromRemote(config, 'sample', destination, async (command) => {
        if (command === 'ssh') {
          return { exitCode: 0, stdout: JSON.stringify({ exists: true, files: [{ relativePath: 'nested/data.bin', size: bytes.length, sha256 }] }), stderr: '', commandLine: command };
        }
        await mkdir(join(`${destination}.staging`, 'nested'), { recursive: true });
        await writeFile(join(`${destination}.staging`, 'nested/data.bin'), bytes);
        return { exitCode: 0, stdout: '', stderr: '', commandLine: command };
      });
      expect(result).toEqual({ files: 1, bytes: bytes.length });
      expect(await readFile(join(destination, 'nested/data.bin'), 'utf8')).toBe(bytes);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails closed and preserves old storage when the remote probe errors', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-storage-probe-error-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample/storage');
    try {
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, 'old.bin'), 'old bytes');
      await expect(copyPersistentStorageFromRemote(config, 'sample', destination, async (command) => ({
        exitCode: 1, stdout: '', stderr: 'Access denied', commandLine: command,
      }))).rejects.toThrow('Access denied');
      expect(await readFile(join(destination, 'old.bin'), 'utf8')).toBe('old bytes');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('records verified missing persistent storage as empty in the acquisition report', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-storage-report-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const entry = classified('upstream-exact', { persistentStorage: true });
    try {
      const report = await acquirePackages(config, [entry], { apply: true }, {
        readDnd5eManifest: async () => ({ id: 'dnd5e', version: '5.3.3', download: 'https://example.test/dnd5e.zip' }),
        installArchive: async ({ stagingRoot, expectedId, expectedVersion }) => {
          await mkdir(stagingRoot, { recursive: true });
          await writeFile(join(stagingRoot, expectedId === 'dnd5e' ? 'system.json' : 'module.json'), JSON.stringify({ id: expectedId, version: expectedVersion }));
        },
        copyPersistentStorage: async () => ({ files: 0, bytes: 0, missingAsEmpty: true }),
      });
      expect(report.actions.find((action) => action.id === 'sample')).toEqual(expect.objectContaining({
        status: 'installed',
        persistentStorage: { files: 0, bytes: 0, remoteExists: false, disposition: 'verified-missing-as-empty' },
      }));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('uses a quote-free Windows OpenSSH source and tar.exe ZIP extraction', () => {
    expect(buildScpRemoteSpec(
      'Administrator@49.232.12.153',
      'E:/Bill/fvtt_v13/data/Data/modules/simple-quest',
    )).toBe('Administrator@49.232.12.153:E:/Bill/fvtt_v13/data/Data/modules/simple-quest');
    expect(buildArchiveExtractionCommand('archive.zip', 'staging')).toEqual({
      command: 'tar.exe', args: ['-xf', 'archive.zip', '-C', 'staging'],
    });
    expect(buildScpCommandArgs('identity', 'host:E:/module', 'staging', { legacy: true })).toEqual([
      '-i', 'identity', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
      '-o', 'StrictHostKeyChecking=yes', '-O', '-C', '-r', 'host:E:/module', 'staging',
    ]);
    expect(buildScpCommandArgs('identity', 'host:E:/module', 'staging', { legacy: false })).toEqual([
      '-i', 'identity', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
      '-o', 'StrictHostKeyChecking=yes', '-C', '-r', 'host:E:/module', 'staging',
    ]);
  });

  it('excludes only exact Windows LevelDB LOCK basenames and verifies every other file', () => {
    expect(isRuntimeLockPath('packs/actors/LOCK')).toBe(true);
    expect(isRuntimeLockPath('packs/actors/lock')).toBe(true);
    expect(isRuntimeLockPath('packs/actors/LOCK.old')).toBe(false);
    expect(isRuntimeLockPath('packs/actors/myLOCK')).toBe(false);
    const remote = [
      { relativePath: 'module.json', size: 20, sha256: 'a'.repeat(64) },
      { relativePath: 'packs/actors/LOCK', size: 0, sha256: 'b'.repeat(64) },
    ];
    const local = [{ relativePath: 'module.json', size: 20, sha256: 'a'.repeat(64) }];
    expect(verifyTransferredTree(remote, local)).toEqual({
      excludedRuntimeLocks: ['packs/actors/LOCK'], files: 1, bytes: 20,
    });
    expect(() => verifyTransferredTree(remote, [])).toThrow('missing module.json');
    expect(() => verifyTransferredTree(remote, [
      { relativePath: 'module.json', size: 20, sha256: 'c'.repeat(64) },
    ])).toThrow('SHA-256 mismatch');
    expect(() => verifyTransferredTree(remote, [
      ...local, { relativePath: 'unexpected.txt', size: 1, sha256: 'd'.repeat(64) },
    ])).toThrow('unexpected unexpected.txt');
  });

  it('allows a nonzero modern SCP result only when every error names an excluded LOCK', () => {
    const excluded = ['packs/actors/LOCK', 'packs/items/LOCK'];
    expect(hasOnlyRuntimeLockErrors(
      'scp.exe: remote open "E:/module/packs/actors/LOCK": Failure\n'
      + 'scp.exe: remote open "E:/module/packs/items/LOCK": Failure\n',
      excluded,
    )).toBe(true);
    expect(hasOnlyRuntimeLockErrors(
      'scp.exe: remote open "E:/module/packs/actors/LOCK": Failure\npermission denied elsewhere\n',
      excluded,
    )).toBe(false);
  });

  it('rejects archive entries that can escape staging', () => {
    expect(() => validateArchiveEntries(['module/module.json', 'module/scripts/main.js'])).not.toThrow();
    for (const entry of ['../outside.txt', 'module/../../outside.txt', '/absolute.txt', 'C:/outside.txt']) {
      expect(() => validateArchiveEntries([entry])).toThrow('unsafe path');
    }
  });

  it('rejects HTTP, HTTPS downgrade redirects, HTML, and empty responses', async () => {
    await expect(downloadHttpsArchive(
      'http://example.test/module.zip', 'unused.zip', async () => new Response(),
    )).rejects.toThrow('HTTPS');

    await expect(downloadHttpsArchive(
      'https://example.test/module.zip', 'unused.zip',
      async () => new Response(null, { status: 302, headers: { location: 'http://example.test/file.zip' } }),
    )).rejects.toThrow('HTTPS');

    const htmlFetch = async () => new Response('<html>error</html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    });
    await expect(downloadHttpsArchive(
      'https://example.test/module.zip', 'unused.zip', htmlFetch,
    )).rejects.toThrow('HTML');

    await expect(downloadHttpsArchive(
      'https://example.test/module.zip', 'unused.zip', async () => new Response(new Uint8Array()),
    )).rejects.toThrow('empty');
  });

  it('aborts a package download that exceeds its timeout', async () => {
    const hangingFetch = async (_input: string, init?: RequestInit): Promise<Response> => {
      return await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    };
    await expect(downloadHttpsArchive(
      'https://example.test/module.zip', 'unused.zip', hangingFetch, 20,
    )).rejects.toThrow('timed out after 20ms with 0 bytes');
  });

  it('keeps an existing verified install when a replacement has the wrong identity', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-acquire-atomic-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample');
    try {
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, 'module.json'), '{"id":"sample","version":"0.9.0"}\n');
      const report = await acquirePackages(config, [classified('upstream-exact')], { apply: true }, {
        readDnd5eManifest: async () => ({
          id: 'dnd5e', version: '5.3.3', download: 'https://example.test/dnd5e.zip',
        }),
        installArchive: async ({ stagingRoot }) => {
          await mkdir(stagingRoot, { recursive: true });
          await writeFile(join(stagingRoot, 'module.json'), '{"id":"sample","version":"2.0.0"}\n');
        },
      });

      expect(report.actions.find((action) => action.id === 'sample')?.status).toBe('failed');
      expect(JSON.parse(await readFile(join(destination, 'module.json'), 'utf8')).version).toBe('0.9.0');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps the complete old package tree when persistent storage injection fails', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-acquire-storage-transaction-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample');
    const oldManifest = join(destination, 'module.json');
    const oldMarker = join(destination, 'marker.txt');
    const oldStorage = join(destination, 'storage/data.bin');
    const entry = classified('upstream-exact', { persistentStorage: true });
    try {
      await mkdir(dirname(oldStorage), { recursive: true });
      await writeFile(oldManifest, '{"id":"sample","version":"0.9.0"}\n');
      await writeFile(oldMarker, 'old marker bytes');
      await writeFile(oldStorage, 'old storage bytes');
      const before = await Promise.all([oldManifest, oldMarker, oldStorage].map(async (path) => ({
        path, bytes: await readFile(path), mtimeNs: (await stat(path, { bigint: true })).mtimeNs,
      })));

      const report = await acquirePackages(config, [entry], { apply: true }, {
        readDnd5eManifest: async () => ({
          id: 'dnd5e', version: '5.3.3', download: 'https://example.test/dnd5e.zip',
        }),
        installArchive: async ({ stagingRoot, expectedId, expectedVersion }) => {
          await mkdir(stagingRoot, { recursive: true });
          const name = expectedId === 'dnd5e' ? 'system.json' : 'module.json';
          await writeFile(join(stagingRoot, name), JSON.stringify({ id: expectedId, version: expectedVersion }));
          if (expectedId === 'sample') await writeFile(join(stagingRoot, 'marker.txt'), 'new marker bytes');
        },
        copyPersistentStorage: async (_config, _folder, storageDestination) => {
          await mkdir(storageDestination, { recursive: true });
          await writeFile(join(storageDestination, 'data.bin'), 'partial new storage');
          throw new Error('injected storage failure');
        },
      });

      expect(report.actions.find((action) => action.id === 'sample')?.status).toBe('failed');
      for (const snapshot of before) {
        expect(await readFile(snapshot.path)).toEqual(snapshot.bytes);
        expect((await stat(snapshot.path, { bigint: true })).mtimeNs).toBe(snapshot.mtimeNs);
      }
      expect(await readFile(oldMarker, 'utf8')).toBe('old marker bytes');
      expect(existsSync(`${destination}.staging`)).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps absent protected packages unresolved but accepts an exact authorized install transactionally', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-acquire-protected-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const protectedEntry = classified('account-protected', { persistentStorage: true });
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample');
    let storageCalls = 0;
    const dependencies = {
      readDnd5eManifest: async () => ({
        id: 'dnd5e', version: '5.3.3', download: 'https://example.test/dnd5e.zip',
      }),
      installArchive: async ({ stagingRoot, expectedId, expectedVersion }: {
        stagingRoot: string; expectedId: string; expectedVersion: string;
      }) => {
        await mkdir(stagingRoot, { recursive: true });
        await writeFile(
          join(stagingRoot, expectedId === 'dnd5e' ? 'system.json' : 'module.json'),
          JSON.stringify({ id: expectedId, version: expectedVersion }),
        );
      },
      copyPersistentStorage: async (_config: unknown, _folder: string, storageDestination: string) => {
        storageCalls += 1;
        expect(storageDestination).toContain('sample.staging');
        await mkdir(storageDestination, { recursive: true });
        await writeFile(join(storageDestination, 'authorized.bin'), 'authorized storage');
        return { files: 1, bytes: 18 };
      },
    };
    try {
      const absent = await acquirePackages(config, [protectedEntry], { apply: true }, dependencies);
      expect(absent.actions.find((action) => action.id === 'sample')?.status).toBe('unresolved');
      expect(storageCalls).toBe(0);

      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, 'module.json'), '{"id":"sample","version":"0.9.0"}\n');
      const mismatched = await acquirePackages(config, [protectedEntry], { apply: true }, dependencies);
      expect(mismatched.actions.find((action) => action.id === 'sample')?.status).toBe('unresolved');
      expect(storageCalls).toBe(0);

      await writeFile(join(destination, 'module.json'), '{"id":"sample","version":"1.0.0"}\n');
      await writeFile(join(destination, 'authorized-marker.txt'), 'keep authorized base');
      const installed = await acquirePackages(config, [protectedEntry], { apply: true }, dependencies);

      expect(installed.actions.find((action) => action.id === 'sample')?.status).toBe('installed');
      expect(storageCalls).toBe(1);
      expect(await readFile(join(destination, 'authorized-marker.txt'), 'utf8')).toBe('keep authorized base');
      expect(await readFile(join(destination, 'storage/authorized.bin'), 'utf8')).toBe('authorized storage');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rolls back protected storage failure and never auto-accepts manual-review', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-protected-storage-rollback-'));
    const config = createLabConfig(join(tempRoot, 'repo'));
    const destination = join(config.profiles.serverMirror.dataPath, 'Data/modules/sample');
    const manifest = join(destination, 'module.json');
    const marker = join(destination, 'authorized-marker.txt');
    const storage = join(destination, 'storage/original.bin');
    const protectedEntry = classified('account-protected', { persistentStorage: true });
    try {
      await mkdir(dirname(storage), { recursive: true });
      await writeFile(manifest, '{"id":"sample","version":"1.0.0"}\n');
      await writeFile(marker, 'authorized base bytes');
      await writeFile(storage, 'authorized storage bytes');
      const before = await Promise.all([manifest, marker, storage].map(async (path) => ({
        path, bytes: await readFile(path), mtimeNs: (await stat(path, { bigint: true })).mtimeNs,
      })));
      const dependencies = {
        readDnd5eManifest: async () => ({
          id: 'dnd5e', version: '5.3.3', download: 'https://example.test/dnd5e.zip',
        }),
        installArchive: async ({ stagingRoot, expectedId, expectedVersion }: {
          stagingRoot: string; expectedId: string; expectedVersion: string;
        }) => {
          await mkdir(stagingRoot, { recursive: true });
          await writeFile(
            join(stagingRoot, expectedId === 'dnd5e' ? 'system.json' : 'module.json'),
            JSON.stringify({ id: expectedId, version: expectedVersion }),
          );
        },
        copyPersistentStorage: async (_config: unknown, _folder: string, storageDestination: string) => {
          await mkdir(storageDestination, { recursive: true });
          await writeFile(join(storageDestination, 'partial.bin'), 'partial bytes');
          throw new Error('protected storage failure');
        },
      };

      const failed = await acquirePackages(config, [protectedEntry], { apply: true }, dependencies);
      expect(failed.actions.find((action) => action.id === 'sample')?.status).toBe('failed');
      for (const snapshot of before) {
        expect(await readFile(snapshot.path)).toEqual(snapshot.bytes);
        expect((await stat(snapshot.path, { bigint: true })).mtimeNs).toBe(snapshot.mtimeNs);
      }
      expect(existsSync(join(destination, 'storage/partial.bin'))).toBe(false);

      const manual = classified('manual-review', { persistentStorage: false });
      const held = await acquirePackages(config, [manual], { apply: true }, dependencies);
      expect(held.actions.find((action) => action.id === 'sample')?.status).toBe('unresolved');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('compares persistent storage by relative path, size, and SHA-256', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-storage-'));
    const left = join(tempRoot, 'left');
    const right = join(tempRoot, 'right');
    try {
      await mkdir(join(left, 'nested'), { recursive: true });
      await mkdir(join(right, 'nested'), { recursive: true });
      await writeFile(join(left, 'nested/data.bin'), 'same bytes');
      await writeFile(join(right, 'nested/data.bin'), 'same bytes');
      await expect(verifyStorageTrees(left, right)).resolves.toEqual(
        [expect.objectContaining({ relativePath: 'nested/data.bin', size: 10 })],
      );
      await writeFile(join(right, 'nested/data.bin'), 'same byteZ');
      await expect(verifyStorageTrees(left, right)).rejects.toThrow('storage mismatch');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
