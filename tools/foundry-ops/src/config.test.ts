import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertInsideLabRoot,
  createLabConfig,
  requireProductionConnection,
} from './config';

describe('Foundry lab configuration', () => {
  it('pins the approved project-local layout and versions', () => {
    const repo = resolve('I:/OpenCode/fvttV12JsonGenerator');
    const config = createLabConfig(repo);

    expect(config.versions).toEqual({ foundry: '14.364', node: '24.17.0', dnd5e: '5.3.3' });
    expect(config.labRoot).toBe(resolve(repo, '.local/foundry-v14'));
    expect(config.profiles.coreTest.port).toBe(30000);
    expect(config.profiles.serverMirror.port).toBe(30001);
    expect(config.profiles.coreTest.host).toBe('127.0.0.1');
    expect(config.sshTarget).toBe('');
    expect(config.remoteDataPath).toBe('');
    expect(config.spellResolver).toEqual({
      moduleId: 'fvtt-json-generator-spell-resolver',
      disposableWorldId: 'fvtt-v14-module-matrix',
    });
  });

  it('loads machine and production values only from explicit external configuration', () => {
    const repo = resolve('I:/OpenCode/fvttV12JsonGenerator');
    const config = createLabConfig(repo, {
      FVTT_OPS_LAB_ROOT: 'J:/fvtt-ops/lab',
      FVTT_OPS_EVIDENCE_ROOT: 'J:/fvtt-ops/evidence',
      FVTT_OPS_BACKUP_ROOT: 'J:/fvtt-ops/backups',
      FVTT_OPS_FOUNDRY_ZIP: 'J:/installers/FoundryVTT-Node-14.364.zip',
      FVTT_OPS_WORLD_ID: 'fixture-world',
      FVTT_OPS_PRODUCTION_SSH_TARGET: 'fixture-production',
      FVTT_OPS_PRODUCTION_DATA_PATH: 'E:/fixture/data',
      FVTT_OPS_PRODUCTION_SSH_IDENTITY: 'J:/keys/fvtt',
    });

    expect(config.labRoot).toBe(resolve('J:/fvtt-ops/lab'));
    expect(config.evidenceRoot).toBe(resolve('J:/fvtt-ops/evidence'));
    expect(config.backupRoot).toBe(resolve('J:/fvtt-ops/backups'));
    expect(config.defaultWorldId).toBe('fixture-world');
    expect(requireProductionConnection(config)).toEqual({
      sshTarget: 'fixture-production',
      sshIdentityPath: resolve('J:/keys/fvtt'),
      remoteDataPath: 'E:/fixture/data',
    });
  });

  it('fails closed when production host or data path is not externally configured', () => {
    expect(() => requireProductionConnection(createLabConfig('I:/OpenCode/fvttV12JsonGenerator', {})))
      .toThrow('FVTT_OPS_PRODUCTION_SSH_TARGET, FVTT_OPS_PRODUCTION_DATA_PATH');
  });

  it('rejects destructive targets outside the ignored lab root', () => {
    const config = createLabConfig('I:/OpenCode/fvttV12JsonGenerator');
    expect(() => assertInsideLabRoot(config, config.labRoot)).not.toThrow();
    expect(() => assertInsideLabRoot(config, 'I:/OpenCode/fvttV12JsonGenerator/src')).toThrow(
      'Target escapes Foundry lab root',
    );
    expect(() => assertInsideLabRoot(config, 'I:/')).toThrow('Target escapes Foundry lab root');
  });

  it('accepts the configured lab root before it exists', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-lab-missing-'));
    try {
      const config = createLabConfig(join(tempRoot, 'repo'));
      expect(() => assertInsideLabRoot(config, config.labRoot)).not.toThrow();
      expect(() => assertInsideLabRoot(config, join(config.labRoot, 'future', 'artifact'))).not.toThrow();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects existing and missing targets routed outside through a junction', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-lab-junction-'));
    const repoRoot = join(tempRoot, 'repo');
    const outsideRoot = join(tempRoot, 'outside');
    const config = createLabConfig(repoRoot);
    const junction = join(config.labRoot, 'escape');

    try {
      await mkdir(join(outsideRoot, 'existing'), { recursive: true });
      await mkdir(config.labRoot, { recursive: true });
      await symlink(outsideRoot, junction, 'junction');

      expect(() => assertInsideLabRoot(config, join(junction, 'existing'))).toThrow(
        'Target escapes Foundry lab root',
      );
      expect(() => assertInsideLabRoot(config, join(junction, 'missing', 'artifact'))).toThrow(
        'Target escapes Foundry lab root',
      );
    } finally {
      try {
        await unlink(junction);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects a dangling junction before its outside target becomes available', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-lab-dangling-junction-'));
    const repoRoot = join(tempRoot, 'repo');
    const outsideRoot = join(tempRoot, 'outside-not-created');
    const config = createLabConfig(repoRoot);
    const junction = join(config.labRoot, 'escape');

    try {
      await mkdir(config.labRoot, { recursive: true });
      await symlink(outsideRoot, junction, 'junction');

      expect(() => assertInsideLabRoot(config, join(junction, 'future', 'artifact'))).toThrow(
        /junction|reparse|symlink|unsafe/i,
      );
    } finally {
      try {
        await unlink(junction);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects targets when the configured lab root is a junction outside the repo', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-lab-root-junction-'));
    const repoRoot = join(tempRoot, 'repo');
    const outsideRoot = join(tempRoot, 'outside');
    const config = createLabConfig(repoRoot);

    try {
      await mkdir(join(outsideRoot, 'existing'), { recursive: true });
      await mkdir(join(repoRoot, '.local'), { recursive: true });
      await symlink(outsideRoot, config.labRoot, 'junction');

      expect(() => assertInsideLabRoot(config, join(config.labRoot, 'existing'))).toThrow(
        'Target escapes Foundry lab root',
      );
      expect(() => assertInsideLabRoot(config, join(config.labRoot, 'missing', 'artifact'))).toThrow(
        'Target escapes Foundry lab root',
      );
    } finally {
      try {
        await unlink(config.labRoot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects targets when the configured lab root redirects elsewhere inside the repo', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'foundry-lab-root-internal-junction-'));
    const repoRoot = join(tempRoot, 'repo');
    const redirectedRoot = join(repoRoot, 'redirected-lab');
    const config = createLabConfig(repoRoot);

    try {
      await mkdir(join(redirectedRoot, 'existing'), { recursive: true });
      await mkdir(join(repoRoot, '.local'), { recursive: true });
      await symlink(redirectedRoot, config.labRoot, 'junction');

      expect(() => assertInsideLabRoot(config, join(config.labRoot, 'existing'))).toThrow(
        'Target escapes Foundry lab root',
      );
      expect(() => assertInsideLabRoot(config, join(config.labRoot, 'missing', 'artifact'))).toThrow(
        'Target escapes Foundry lab root',
      );
    } finally {
      try {
        await unlink(config.labRoot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
