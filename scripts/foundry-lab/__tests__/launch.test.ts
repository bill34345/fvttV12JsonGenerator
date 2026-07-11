import { describe, expect, it } from 'bun:test';
import { join, resolve } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createLabConfig } from '../config';
import { buildLaunchCommand, buildRuntimeArgs, buildSafeOptions, isExpectedFoundryProcess, loopbackPreloadSource, otherProfileId, stopProfile, validateListenerAddresses, validateListenerOwnership } from '../launch';

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
});
