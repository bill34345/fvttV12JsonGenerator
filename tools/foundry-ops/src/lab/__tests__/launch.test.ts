import { describe, expect, it } from 'bun:test';
import { join, resolve } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createLabConfig } from '../../config';
import { buildLaunchCommand, buildRuntimeArgs, buildSafeOptions, cleanupStaleOptionsLock, isExpectedFoundryProcess, loopbackPreloadSource, otherProfileId, stopProfile, validateListenerAddresses, validateListenerOwnership, withLaunchReservation } from '../launch';

describe('Foundry profile launcher', () => {
  const config = createLabConfig('I:/OpenCode/fvttV12JsonGenerator');
  it('builds a loopback-only core command', () => {
    expect(buildLaunchCommand(config, 'core-test')).toEqual({ command: resolve(config.nodeRoot, 'node.exe'), args: [resolve(config.appRoot, 'main.js'), '--dataPath', config.profiles.coreTest.dataPath, '--hostname', '127.0.0.1', '--port', '30000', '--noupnp'] });
  });
  it('uses an independent server mirror port and path', () => {
    const command = buildLaunchCommand(config, 'server-mirror');
    expect(command.args).toContain('30001');
    expect(command.args).toContain(config.profiles.serverMirror.dataPath);
  });
  it('adapts the public command shape to Foundry 14.364 equals-style parsing', () => {
    expect(buildRuntimeArgs(buildLaunchCommand(config, 'core-test').args)).toEqual([
      resolve(config.appRoot, 'main.js'), `--dataPath=${config.profiles.coreTest.dataPath}`,
      '--hostname=127.0.0.1', '--port=30000', '--noupnp',
    ]);
  });
  it('rejects wildcard or non-loopback listeners', () => {
    expect(() => validateListenerAddresses(['127.0.0.1', '::1'])).not.toThrow();
    expect(() => validateListenerAddresses(['0.0.0.0'])).toThrow('loopback');
    expect(() => validateListenerAddresses(['192.168.1.2'])).toThrow('loopback');
  });
  it('rejects a loopback listener owned by a different process', () => {
    expect(() => validateListenerOwnership([{ address: '127.0.0.1', pid: 44 }], 55)).toThrow('owned');
    expect(() => validateListenerOwnership([{ address: '127.0.0.1', pid: 55 }], 55)).not.toThrow();
  });
  it('pins persisted Foundry options to loopback and disables UPnP', () => {
    expect(buildSafeOptions({ hostname: null, upnp: true, adminPassword: 'must-not-copy' }, config.profiles.coreTest)).toMatchObject({
      dataPath: config.profiles.coreTest.dataPath, hostname: '127.0.0.1', port: 30000, upnp: false,
      unixSocket: null,
    });
    expect(buildSafeOptions({ adminPassword: 'must-not-copy' }, config.profiles.coreTest)).not.toHaveProperty('adminPassword');
  });
  it('preloads a narrow TCP listen guard that injects loopback for numeric ports', () => {
    expect(loopbackPreloadSource()).toContain("args.splice(1,0,'127.0.0.1')");
    expect(loopbackPreloadSource()).toContain('typeof args[0]');
  });
  it('will only stop the pinned lab Node process running the pinned Foundry app', () => {
    const node = resolve(config.nodeRoot, 'node.exe'), main = resolve(config.appRoot, 'main.js');
    const core = `"${node}" --require hook "${main}" --dataPath=${config.profiles.coreTest.dataPath} --port=30000`;
    const mirror = `"${node}" --require hook "${main}" --dataPath=${config.profiles.serverMirror.dataPath} --port=30001`;
    expect(isExpectedFoundryProcess(config, 'core-test', node, core)).toBe(true);
    expect(isExpectedFoundryProcess(config, 'core-test', node, mirror)).toBe(false);
    expect(isExpectedFoundryProcess(config, 'server-mirror', node, core)).toBe(false);
    expect(isExpectedFoundryProcess(config, 'core-test', node, core.replace('--port=30000', '--port=300000'))).toBe(false);
    expect(isExpectedFoundryProcess(config, 'core-test', 'C:/other/node.exe', core)).toBe(false);
  });
  it('maps each profile to the mutually exclusive peer', () => {
    expect(otherProfileId('core-test')).toBe('server-mirror');
    expect(otherProfileId('server-mirror')).toBe('core-test');
  });
  it('refuses a cross-profile PID file without killing the mirror process', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fvtt-stop-profile-'));
    const isolated = createLabConfig(root); await mkdir(join(isolated.evidenceRoot, 'core-test'), { recursive: true });
    await writeFile(join(isolated.evidenceRoot, 'core-test/server.pid'), '{"foundry":42}');
    const node = resolve(isolated.nodeRoot, 'node.exe'), main = resolve(isolated.appRoot, 'main.js'); let kills = 0;
    const mirror = `"${node}" "${main}" --dataPath=${isolated.profiles.serverMirror.dataPath} --port=30001`;
    try {
      await expect(stopProfile(isolated, 'core-test', { queryProcess: () => ({ executable: node, commandLine: mirror }), kill: () => { kills += 1; } })).rejects.toThrow('not the pinned');
      expect(kills).toBe(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('atomically prevents concurrent cross-profile launch work from both proceeding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fvtt-launch-reservation-'));
    const isolated = createLabConfig(root);
    let entered = 0;
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
    try {
      const first = withLaunchReservation(isolated, 'core-test', async () => {
        entered += 1;
        await firstCanFinish;
        return 'core';
      });
      while (entered === 0) await Bun.sleep(1);
      await expect(withLaunchReservation(isolated, 'server-mirror', async () => {
        entered += 1;
        return 'mirror';
      })).rejects.toThrow('launch reservation');
      expect(entered).toBe(1);
      releaseFirst();
      expect(await first).toBe('core');
    } finally { releaseFirst?.(); await rm(root, { recursive: true, force: true }); }
  });
  it('releases the launch reservation after failure so a retry can proceed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fvtt-launch-reservation-retry-'));
    const isolated = createLabConfig(root);
    try {
      await expect(withLaunchReservation(isolated, 'core-test', async () => { throw new Error('spawn failed'); })).rejects.toThrow('spawn failed');
      expect(await withLaunchReservation(isolated, 'server-mirror', async () => 'retry proceeded')).toBe('retry proceeded');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('recovers a stale reservation only when its recorded owner is dead', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fvtt-launch-reservation-stale-'));
    const isolated = createLabConfig(root);
    const lock = join(isolated.evidenceRoot, '.launch-reservation');
    try {
      await mkdir(lock, { recursive: true });
      await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: 2147483647, profile: 'core-test', token: 'stale' }));
      expect(await withLaunchReservation(isolated, 'server-mirror', async () => 'recovered')).toBe('recovered');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('does not delete a reservation whose recorded owner is still alive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fvtt-launch-reservation-live-'));
    const isolated = createLabConfig(root);
    const lock = join(isolated.evidenceRoot, '.launch-reservation');
    try {
      await mkdir(lock, { recursive: true });
      await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, profile: 'core-test', token: 'live' }));
      await expect(withLaunchReservation(isolated, 'server-mirror', async () => 'unsafe')).rejects.toThrow('launch reservation');
      expect(await Bun.file(join(lock, 'owner.json')).exists()).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('removes only an empty stale Foundry options lock inside the selected profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fvtt-options-lock-'));
    const isolated = createLabConfig(root);
    const lock = join(isolated.profiles.serverMirror.dataPath, 'Config/options.json.lock');
    try {
      await mkdir(lock, { recursive: true });
      expect(await cleanupStaleOptionsLock(isolated, 'server-mirror')).toBe(true);
      expect(await Bun.file(lock).exists()).toBe(false);
      await mkdir(lock, { recursive: true });
      await writeFile(join(lock, 'owner'), 'live');
      await expect(cleanupStaleOptionsLock(isolated, 'server-mirror')).rejects.toThrow('not empty');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
