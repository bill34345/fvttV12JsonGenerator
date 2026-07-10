import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
} from '../acquire';
import { createLabConfig } from '../config';
import type { ClassifiedPackage, PackageClass } from '../types';

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
