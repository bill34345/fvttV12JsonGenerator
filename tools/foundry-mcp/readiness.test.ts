import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { buildWindowsLaunchScript, classifyService, classifyWorldResult, inspectReadiness, loadTarget, parseOptions, quoteWindowsArgument, recordReadiness, runtimeFingerprint } from './readiness';
import type { Dependencies, ProcessRecord, ReadinessResult, ServiceSnapshot, Target } from './readiness';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) { if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('mcp-readiness-test-')) throw new Error('Unsafe test cleanup'); await rm(root, { recursive: true, force: true }); } });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mcp-readiness-test-')); roots.push(root);
  const lab = join(root, 'lab'); const config = join(root, '.codex', 'config.toml');
  const stateDir = join(lab, 'tools', 'foundry-mcp', 'instances', 'next');
  const env = { MCP_INSTANCE_ID: 'next', MCP_CONTROL_PORT: '31514', FOUNDRY_PORT: '31515', FOUNDRY_WEBRTC_PORT: '31516', MCP_STATE_DIR: stateDir, MCP_EXPECTED_ORIGIN: 'http://localhost:30002', MCP_EXPECTED_WORLD_ID: 'cor-cotn', MCP_EXPECTED_SYSTEM_ID: 'dnd5e', MCP_EXPECTED_SYSTEM_VERSION: '6.0.6', MCP_READ_ONLY: 'false', MCP_DISABLE_MAP_SERVICE: 'true' };
  const entry = join(lab, 'tools', 'foundry-mcp', 'v0.8.4-multi1', 'index.js');
  const files: Record<string, string> = {
    [join(lab, 'runtime', 'node-v24.17.0-win-x64', 'node.exe')]: '', [entry]: '',
    [join(lab, 'app', '14.368', 'main.js')]: '', [join(lab, 'app', '14.368', 'package.json')]: JSON.stringify({ name: 'foundryvtt', release: { generation: 14, build: 368 } }),
    [join(lab, 'data', 'server-next', 'Data', 'systems', 'dnd5e', 'system.json')]: JSON.stringify({ id: 'dnd5e', version: '6.0.6' }),
    [join(lab, 'data', 'server-next', 'Data', 'worlds', 'cor-cotn', 'world.json')]: JSON.stringify({ id: 'cor-cotn', system: 'dnd5e' }),
  };
  for (const [path, value] of Object.entries(files)) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, value); }
  await mkdir(dirname(config), { recursive: true });
  const saveConfig = async (overrides: Record<string, string> = {}, enabled = true) => writeFile(config, `[mcp_servers.foundry-next]\nenabled = ${enabled}\ncommand = "node"\nargs = [${JSON.stringify(entry)}]\nenv = { ${Object.entries({ ...env, ...overrides }).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join(', ')} }\n`);
  await saveConfig();
  const options = { command: 'check' as const, instance: 'next' as const, labRoot: lab, configPath: config, apply: false };
  const target = await loadTarget(options);
  return { root, lab, config, options, env, saveConfig, target };
}
function processFor(target: Target, overrides: Partial<ProcessRecord> = {}): ProcessRecord {
  return { pid: 1234, executable: target.nodePath, commandLine: `"${target.nodePath}" "${target.mainPath}" --dataPath="${target.dataPath}" --port=${target.port} --world=${target.worldId}`, createdAt: '2026-10-26T00:00:00.000Z', ...overrides };
}
function running(target: Target): ServiceSnapshot { return { listeners: [{ address: '127.0.0.1', pid: 1234 }], processes: [processFor(target)] }; }
function worldResult(target: Target, patch: Record<string, unknown> = {}) {
  const world = { id: target.worldId, origin: target.origin, system: { id: target.systemId, version: target.systemVersion }, foundry: { version: '14.368' }, mcp: { instanceId: target.instance, actual: { origin: target.origin, worldId: target.worldId, systemId: target.systemId, systemVersion: target.systemVersion } }, ...patch };
  return { content: [{ type: 'text', text: JSON.stringify(world) }] };
}
function dependencies(target: Target, overrides: Partial<Dependencies> = {}): Partial<Dependencies> {
  return { inspect: async () => running(target), query: async (_t, method) => method === 'ping' ? { ok: true, instanceId: target.instance, runtimeFingerprint: target.fingerprint } : worldResult(target), start: async () => { throw new Error('Unexpected actual startup'); }, waitForService: async () => {}, now: () => '2026-10-26T01:00:00.000Z', ...overrides };
}

test('CLI requires one explicit local instance and rejects unknown flags before any effects', () => {
  expect(() => parseOptions(['prepare', '--instance', 'production-readonly', '--lab-root', resolve(tmpdir()), '--config', resolve('fixture.toml')])).toThrow('Only local');
  expect(() => parseOptions(['check', '--instance', 'next', '--restart'])).toThrow('Unknown');
  expect(() => parseOptions(['check', '--instance', 'next', '--lab-root', '.', '--config', resolve('fixture.toml')])).toThrow('absolute');
});

test('config and installed metadata agree before any listener or backend request', async () => {
  const f = await fixture(); expect(f.target.fingerprint).toBe(runtimeFingerprint(f.env));
  await f.saveConfig({}, false); await expect(loadTarget(f.options)).rejects.toThrow('disabled');
  await f.saveConfig({ MCP_EXPECTED_ORIGIN: 'https://example.invalid' }); await expect(loadTarget(f.options)).rejects.toThrow('origin');
  await f.saveConfig({ MCP_STATE_DIR: join(f.root, 'wrong-state') }); await expect(loadTarget(f.options)).rejects.toThrow('outside');
  await f.saveConfig({ MCP_EXPECTED_SYSTEM_VERSION: '6.0.7' }); await expect(loadTarget(f.options)).rejects.toThrow('Installed system');
});

test('linked configuration ancestor is refused', async () => {
  const f = await fixture(); const alias = join(f.root, 'linked-config');
  await symlink(dirname(f.config), alias, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(loadTarget({ ...f.options, configPath: join(alias, 'config.toml') })).rejects.toThrow('linked');
});

test('unified registry preserves the selected environment and rejects dual enablement', async () => {
  const f = await fixture();
  const runtimeRoot = join(f.lab, 'tools', 'foundry-mcp');
  const entry = join(runtimeRoot, 'on-demand-v1', 'unified.bundle.cjs');
  const backendPath = join(runtimeRoot, 'v0.8.4-multi1', 'backend.bundle.cjs');
  const registryPath = join(runtimeRoot, 'on-demand-v1', 'targets.json');
  await mkdir(dirname(entry), { recursive: true }); await writeFile(entry, ''); await writeFile(backendPath, '');
  await writeFile(registryPath, JSON.stringify({ version: 1, backendPath, targets: [{ id: 'next', env: f.env }] }));
  const section = `[mcp_servers.foundry]\nenabled = true\ncommand = "node"\nargs = [${JSON.stringify(entry)}]\nenv = { FOUNDRY_MCP_CONFIG = ${JSON.stringify(registryPath)} }\n`;
  await f.saveConfig({}, false); await writeFile(f.config, (await readFile(f.config, 'utf8')) + section);
  expect(await loadTarget(f.options)).toEqual(f.target);
  await f.saveConfig(); await writeFile(f.config, (await readFile(f.config, 'utf8')) + section);
  await expect(loadTarget(f.options)).rejects.toThrow('Both unified and legacy');
});

test('unified registry cannot substitute a missing target or an unrelated backend', async () => {
  const f = await fixture(); const runtimeRoot = join(f.lab, 'tools', 'foundry-mcp');
  const entry = join(runtimeRoot, 'on-demand-v1', 'unified.bundle.cjs');
  const backendPath = join(runtimeRoot, 'v0.8.4-multi1', 'backend.bundle.cjs');
  const registryPath = join(dirname(entry), 'targets.json');
  await mkdir(dirname(entry), { recursive: true }); await writeFile(entry, ''); await writeFile(backendPath, '');
  await writeFile(f.config, `[mcp_servers.foundry]\nenabled = true\ncommand = "node"\nargs = [${JSON.stringify(entry)}]\nenv = { FOUNDRY_MCP_CONFIG = ${JSON.stringify(registryPath)} }\n`);
  await writeFile(registryPath, JSON.stringify({ version: 1, backendPath, targets: [] }));
  await expect(loadTarget(f.options)).rejects.toThrow('missing or duplicated');
  await writeFile(registryPath, JSON.stringify({ version: 1, backendPath: join(f.root, 'other.cjs'), targets: [{ id: 'next', env: f.env }] }));
  await expect(loadTarget(f.options)).rejects.toThrow('Unexpected unified Foundry backend');
});

test('v0.8.5 candidate accepts its matching runtime pair and rejects an old backend path', async () => {
  const f = await fixture(); const runtimeRoot = join(f.lab, 'tools', 'foundry-mcp');
  const directory = join(runtimeRoot, 'v0.8.5-on-demand.1');
  const entry = join(directory, 'unified.bundle.cjs'), backendPath = join(directory, 'backend.bundle.cjs');
  const registryPath = join(directory, 'targets.json');
  await mkdir(directory, { recursive: true }); await writeFile(entry, ''); await writeFile(backendPath, '');
  await writeFile(f.config, `[mcp_servers.foundry]\nenabled = true\ncommand = "node"\nargs = [${JSON.stringify(entry)}]\nenv = { FOUNDRY_MCP_CONFIG = ${JSON.stringify(registryPath)} }\n`);
  const registry = { version: 1, backendPath, targets: [{ id: 'next', env: f.env }] };
  await writeFile(registryPath, JSON.stringify(registry));
  expect(await loadTarget(f.options)).toEqual(f.target);
  await writeFile(registryPath, JSON.stringify({ ...registry, backendPath: join(runtimeRoot, 'v0.8.4-multi1', 'backend.bundle.cjs') }));
  await expect(loadTarget(f.options)).rejects.toThrow('Unexpected unified Foundry backend');
});

test('service reuse requires exact executable, target arguments, creation time and loopback owner', async () => {
  const { target } = await fixture(); expect(classifyService(target, running(target))).toBe('running');
  const variants: ServiceSnapshot[] = [
    { listeners: [{ address: '0.0.0.0', pid: 1234 }], processes: [processFor(target)] },
    { listeners: [{ address: '127.0.0.1', pid: 9876 }], processes: [processFor(target)] },
    { listeners: [{ address: '127.0.0.1', pid: 1234 }], processes: [processFor(target, { executable: join(target.labRoot, 'unknown.exe') })] },
    { listeners: [], processes: [processFor(target)] },
    { listeners: [{ address: '127.0.0.1', pid: 1234 }], processes: [processFor(target, { createdAt: '' })] },
  ];
  for (const variant of variants) expect(classifyService(target, variant)).toBe('conflict');
});

test('Windows arguments preserve spaces, embedded quotes, empty values and trailing backslashes', () => {
  expect(quoteWindowsArgument('plain')).toBe('plain');
  expect(quoteWindowsArgument('')).toBe('""');
  expect(quoteWindowsArgument('C:\\Lab folder\\')).toBe('"C:\\Lab folder\\\\"');
  expect(quoteWindowsArgument('a"b')).toBe('"a\\"b"');
});

test('Windows launcher uses hidden Start-Process and one quoted argument line with independent logs', async () => {
  const { target } = await fixture();
  const spaced = { ...target, nodePath: String.raw`D:\Lab O'Brien\node.exe`, mainPath: String.raw`D:\Lab O'Brien\app\main.js`, dataPath: String.raw`D:\Lab O'Brien\data\server-next` };
  const preload = String.raw`D:\Lab O'Brien\launch\loopback-preload.cjs`, stdout = String.raw`D:\Lab O'Brien\launch\run.stdout.log`, stderr = String.raw`D:\Lab O'Brien\launch\run.stderr.log`;
  const script = buildWindowsLaunchScript(spaced, preload, stdout, stderr);
  expect(script).toContain("Start-Process -FilePath 'D:\\Lab O''Brien\\node.exe'");
  expect(script).toContain(`-ArgumentList '--require "D:\\Lab O''Brien\\launch\\loopback-preload.cjs" "D:\\Lab O''Brien\\app\\main.js" "--dataPath=D:\\Lab O''Brien\\data\\server-next"`);
  expect(script).toContain('-WindowStyle Hidden -PassThru'); expect(script).not.toMatch(/-Wait(?:\s|$)/);
  expect(script).toContain("-RedirectStandardOutput 'D:\\Lab O''Brien\\launch\\run.stdout.log'");
  expect(script).toContain("-RedirectStandardError 'D:\\Lab O''Brien\\launch\\run.stderr.log'");
  expect(script).toContain('--nobackups --noipdiscovery'); expect(script).not.toContain('@(');
});

test('an MCP result containing isError is never ready despite a successful protocol response', async () => {
  const { target } = await fixture();
  expect(classifyWorldResult(target, { isError: true, content: [{ type: 'text', text: 'Error: [next] Foundry VTT module not connected.' }] }).status).toBe('gm_bridge_missing');
  expect(classifyWorldResult(target, { isError: true, content: [{ type: 'text', text: 'Error: target identity mismatch' }] }).status).toBe('identity_mismatch');
  expect(classifyWorldResult(target, { content: [{ type: 'text', text: 'not JSON' }] }).status).toBe('read_failed');
});

test('successful world data still must match origin, instance, core and system', async () => {
  const { target } = await fixture(); expect(classifyWorldResult(target, worldResult(target)).status).toBe('ready');
  for (const patch of [{ origin: 'http://127.0.0.1:30001' }, { foundry: { version: '14.364' } }, { system: { id: 'dnd5e', version: '5.3.3' } }, { mcp: { instanceId: 'mirror', actual: {} } }]) expect(classifyWorldResult(target, worldResult(target, patch)).status).toBe('identity_mismatch');
});

test('stopped or conflicting service returns before querying backend or starting without apply', async () => {
  const { target } = await fixture(); let starts = 0, queries = 0;
  const deps = dependencies(target, { inspect: async () => ({ listeners: [], processes: [] }), start: async () => { starts++; return 1234; }, query: async () => { queries++; return {}; } });
  expect((await inspectReadiness(target, { command: 'prepare', apply: false }, deps)).status).toBe('foundry_stopped');
  expect(starts).toBe(0); expect(queries).toBe(0);
  expect((await inspectReadiness(target, { command: 'prepare', apply: true }, { ...deps, inspect: async () => ({ listeners: [], processes: [processFor(target)] }) })).status).toBe('service_conflict');
  expect(starts).toBe(0); expect(queries).toBe(0);
});

test('prepare reuses a live service and performs an actual world read', async () => {
  const { target } = await fixture(); const calls: string[] = [];
  const result = await inspectReadiness(target, { command: 'prepare', apply: true }, dependencies(target, { query: async (_t, method, params) => { calls.push(method); if (method === 'ping') return { ok: true, instanceId: target.instance, runtimeFingerprint: target.fingerprint }; expect(params).toEqual({ name: 'get-world-info', args: {} }); return worldResult(target); } }));
  expect(result.ready).toBe(true); expect(result.service).toBe('reused'); expect(calls).toEqual(['ping', 'call_tool']);
});

test('observation time is captured after the world read completes', async () => {
  const { target } = await fixture(); let time = '2026-10-26T01:00:00.000Z'; let clockCalls = 0;
  const result = await inspectReadiness(target, { command: 'check', apply: false }, dependencies(target, {
    inspect: async () => { time = '2026-10-26T01:00:10.000Z'; return running(target); },
    query: async (_t, method) => {
      time = method === 'ping' ? '2026-10-26T01:00:20.000Z' : '2026-10-26T01:00:45.000Z';
      return method === 'ping' ? { ok: true, instanceId: target.instance, runtimeFingerprint: target.fingerprint } : worldResult(target);
    },
    now: () => { clockCalls++; return time; },
  }));
  expect(result.checkedAt).toBe('2026-10-26T01:00:45.000Z'); expect(clockCalls).toBe(1);
});

test('mismatched backend fingerprint never receives a world query', async () => {
  const { target } = await fixture(); const methods: string[] = [];
  const result = await inspectReadiness(target, { command: 'check', apply: false }, dependencies(target, { query: async (_t, method) => { methods.push(method); return { ok: true, instanceId: target.instance, runtimeFingerprint: 'wrong' }; } }));
  expect(result.status).toBe('identity_mismatch'); expect(methods).toEqual(['ping']);
});

test('missing Bridge gives an explicit browser action without pretending a GM page exists', async () => {
  const { target } = await fixture();
  const result = await inspectReadiness(target, { command: 'check', apply: false }, dependencies(target, { query: async (_t, method) => method === 'ping' ? { ok: true, instanceId: target.instance, runtimeFingerprint: target.fingerprint } : { isError: true, content: [{ type: 'text', text: 'Foundry VTT module not connected' }] } }));
  expect(result.status).toBe('gm_bridge_missing'); expect(result.ready).toBe(false); expect(result.browserAction?.url).toBe('http://localhost:30002/game');
});

test('prepare starts only after two stopped snapshots and retains a startup failure', async () => {
  const { target } = await fixture(); let starts = 0, inspections = 0;
  const result = await inspectReadiness(target, { command: 'prepare', apply: true }, dependencies(target, { inspect: async () => { inspections++; return { listeners: [], processes: [] }; }, start: async () => { starts++; return 4321; }, waitForService: async () => { throw new Error('timeout'); } }));
  expect(inspections).toBe(2); expect(starts).toBe(1); expect(result.status).toBe('startup_failed'); expect(result.pid).toBe(4321);
});

test('a newly occupied target before spawn is refused without starting anything', async () => {
  const { target } = await fixture(); let n = 0, starts = 0;
  const result = await inspectReadiness(target, { command: 'prepare', apply: true }, dependencies(target, { inspect: async () => ++n === 1 ? { listeners: [], processes: [] } : { listeners: [{ address: '127.0.0.1', pid: 999 }], processes: [] }, start: async () => { starts++; return 1; } }));
  expect(result.status).toBe('service_conflict'); expect(starts).toBe(0);
});

test('audit preserves last successful read across failure and records recovery without raw error data', async () => {
  const { target } = await fixture();
  const success = await inspectReadiness(target, { command: 'check', apply: false }, dependencies(target));
  await recordReadiness(target, success);
  const failure: ReadinessResult = { ...success, checkedAt: '2026-10-26T01:01:00.000Z', ready: false, status: 'gm_bridge_missing', message: 'sensitive raw error must not be persisted', world: undefined };
  await recordReadiness(target, failure);
  let current = JSON.parse(await readFile(join(target.stateDir, 'current-readiness.json'), 'utf8'));
  expect(current.lastSuccessAt).toBe(success.checkedAt); expect(current.ready).toBe(false);
  await recordReadiness(target, { ...success, checkedAt: '2026-10-26T01:02:00.000Z' });
  current = JSON.parse(await readFile(join(target.stateDir, 'current-readiness.json'), 'utf8'));
  expect(current.lastSuccessAt).toBe('2026-10-26T01:02:00.000Z');
  const log = await readFile(join(target.stateDir, 'readiness.jsonl'), 'utf8');
  expect(log).not.toContain('sensitive'); expect(log.split('\n').filter(Boolean).map(line => JSON.parse(line).event)).toEqual(['read_succeeded', 'disconnected', 'recovered']);
});

test('out-of-order audit writes preserve the newest state and maximum successful-read time', async () => {
  const { target } = await fixture();
  const success = await inspectReadiness(target, { command: 'check', apply: false }, dependencies(target));
  const at = (minute: number) => `2026-10-26T01:${String(minute).padStart(2, '0')}:00.000Z`;
  const failure = (minute: number): ReadinessResult => ({ ...success, checkedAt: at(minute), ready: false, status: 'gm_bridge_missing', world: undefined });
  await recordReadiness(target, success);
  await recordReadiness(target, failure(3));
  await recordReadiness(target, { ...success, checkedAt: at(2) }); // earlier success arrived after newer failure
  let current = JSON.parse(await readFile(join(target.stateDir, 'current-readiness.json'), 'utf8'));
  expect(current.checkedAt).toBe(at(3)); expect(current.status).toBe('gm_bridge_missing'); expect(current.ready).toBe(false); expect(current.lastSuccessAt).toBe(at(2));
  await recordReadiness(target, failure(1));
  current = JSON.parse(await readFile(join(target.stateDir, 'current-readiness.json'), 'utf8'));
  expect(current.checkedAt).toBe(at(3)); expect(current.lastSuccessAt).toBe(at(2));
  await recordReadiness(target, { ...success, checkedAt: at(4) });
  await recordReadiness(target, { ...success, checkedAt: at(1) }); // old success cannot regress either timestamp
  current = JSON.parse(await readFile(join(target.stateDir, 'current-readiness.json'), 'utf8'));
  expect(current.checkedAt).toBe(at(4)); expect(current.ready).toBe(true); expect(current.lastSuccessAt).toBe(at(4));
  const events = (await readFile(join(target.stateDir, 'readiness.jsonl'), 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line).event);
  expect(events).toEqual(['read_succeeded', 'disconnected', 'older_observation', 'older_observation', 'recovered', 'older_observation']);
});
