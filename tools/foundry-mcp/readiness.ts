import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';

export type InstanceId = 'mirror' | 'next';
export type ReadinessStatus = 'ready' | 'foundry_stopped' | 'backend_unavailable' | 'gm_bridge_missing' | 'identity_mismatch' | 'service_conflict' | 'startup_failed' | 'read_failed';
export interface Options { command: 'check' | 'prepare'; instance: InstanceId; labRoot: string; configPath: string; apply: boolean }
export interface Target {
  instance: InstanceId; labRoot: string; origin: string; port: number; worldId: string; systemId: string; systemVersion: string;
  controlPort: number; bridgePort: number; webrtcPort: number; stateDir: string; fingerprint: string;
  nodePath: string; mainPath: string; dataPath: string; coreVersion: string;
}
export interface ProcessRecord { pid: number; executable: string; commandLine: string; createdAt: string }
export interface ServiceSnapshot { listeners: { address: string; pid: number }[]; processes: ProcessRecord[] }
export interface ReadinessResult {
  schemaVersion: 1; checkedAt: string; instance: InstanceId; status: ReadinessStatus; ready: boolean;
  readPath: 'backend-control'; message: string; service?: 'started' | 'reused' | 'planned'; pid?: number;
  browserAction?: { required: true; url: string; instruction: string };
  world?: { id: string; systemId: string; systemVersion: string; foundryVersion: string };
}
export interface Dependencies {
  inspect: (target: Target) => Promise<ServiceSnapshot>;
  query: (target: Target, method: 'ping' | 'call_tool', params?: unknown) => Promise<unknown>;
  start: (target: Target) => Promise<number>;
  waitForService: (target: Target, pid: number) => Promise<void>;
  now: () => string;
}

const assert: (value: unknown, message: string) => asserts value = (value, message) => { if (!value) throw new Error(message); };
const normalized = (value: string) => resolve(value).replaceAll('\\', '/').toLowerCase();
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const fixed = { mirror: { origin: 'http://127.0.0.1:30001', port: 30001, control: 31414, bridge: 31415 }, next: { origin: 'http://localhost:30002', port: 30002, control: 31514, bridge: 31515 } } as const;

/** Existing files and every existing ancestor must be ordinary, non-reparse paths. */
export async function assertOrdinaryPath(path: string, kind?: 'file' | 'directory'): Promise<void> {
  let current = resolve(path);
  while (true) {
    try {
      const stats = await lstat(current);
      assert(!stats.isSymbolicLink(), 'Refusing a linked or reparse path');
      if (current === resolve(path) && kind) assert(kind === 'file' ? stats.isFile() : stats.isDirectory(), `Expected an ordinary ${kind}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || (current === resolve(path) && kind)) throw error;
    }
    const parent = dirname(current); if (parent === current) return; current = parent;
  }
}

export function parseOptions(args: string[]): Options {
  const command = args[0]; assert(command === 'check' || command === 'prepare', 'Use check|prepare --instance mirror|next --lab-root <absolute> --config <absolute> [--apply]');
  const values = new Map<string, string>(); let apply = false;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--apply') { assert(!apply, 'Duplicate --apply'); apply = true; continue; }
    assert(['--instance', '--lab-root', '--config'].includes(arg) && !values.has(arg), 'Unknown or duplicate argument');
    const value = args[++i]; assert(value && !value.startsWith('--'), `Missing value for ${arg}`); values.set(arg, value);
  }
  const instance = values.get('--instance'); assert(instance === 'mirror' || instance === 'next', 'Only local mirror|next instances are supported');
  const labRoot = values.get('--lab-root') ?? ''; const configPath = values.get('--config') ?? '';
  assert(isAbsolute(labRoot) && resolve(labRoot) !== parse(resolve(labRoot)).root, 'A specific absolute Lab root is required');
  assert(isAbsolute(configPath), 'An absolute project MCP configuration path is required');
  return { command, instance, labRoot: resolve(labRoot), configPath: resolve(configPath), apply };
}

/** Match the installed v0.8.4-multi1 fingerprint, including property order and path spelling. */
export function runtimeFingerprint(env: Record<string, string>): string {
  const stateDir = env.MCP_STATE_DIR!;
  const runtime = {
    isolated: true, instanceId: env.MCP_INSTANCE_ID!, controlPort: Number(env.MCP_CONTROL_PORT), foundryPort: Number(env.FOUNDRY_PORT),
    webrtcPort: Number(env.FOUNDRY_WEBRTC_PORT), stateDir: resolve(stateDir), readOnly: env.MCP_READ_ONLY === 'true', disableMapService: env.MCP_DISABLE_MAP_SERVICE === 'true',
    expected: { origin: env.MCP_EXPECTED_ORIGIN!, worldId: env.MCP_EXPECTED_WORLD_ID!, systemId: env.MCP_EXPECTED_SYSTEM_ID!, systemVersion: env.MCP_EXPECTED_SYSTEM_VERSION! },
    lockFile: join(stateDir, 'backend.lock'), wrapperLog: join(stateDir, 'wrapper.log'), backendLog: join(stateDir, 'backend.log'),
  };
  return createHash('sha256').update(JSON.stringify(runtime)).digest('hex');
}

export async function loadTarget(options: Options): Promise<Target> {
  await assertOrdinaryPath(options.configPath, 'file'); await assertOrdinaryPath(options.labRoot, 'directory');
  let config: Record<string, unknown>;
  try { config = object(Bun.TOML.parse((await readFile(options.configPath, 'utf8')).replace(/^\uFEFF/, ''))); }
  catch { throw new Error('Cannot parse the selected MCP configuration; its contents were not logged'); }
  const { env, runtimeEntry } = await loadConfiguredEnvironment(config, options);
  const expected = fixed[options.instance];
  const required = ['MCP_INSTANCE_ID', 'MCP_CONTROL_PORT', 'FOUNDRY_PORT', 'FOUNDRY_WEBRTC_PORT', 'MCP_STATE_DIR', 'MCP_EXPECTED_ORIGIN', 'MCP_EXPECTED_WORLD_ID', 'MCP_EXPECTED_SYSTEM_ID', 'MCP_EXPECTED_SYSTEM_VERSION', 'MCP_READ_ONLY', 'MCP_DISABLE_MAP_SERVICE'];
  for (const key of required) assert(typeof env[key] === 'string' && env[key] !== '' && env[key] === env[key]!.trim(), 'The selected local MCP configuration is incomplete');
  assert(env.MCP_INSTANCE_ID === options.instance && env.MCP_EXPECTED_ORIGIN === expected.origin, 'Unexpected local instance or origin');
  assert(env.MCP_CONTROL_PORT === String(expected.control) && env.FOUNDRY_PORT === String(expected.bridge) && env.FOUNDRY_WEBRTC_PORT === String(expected.bridge + 1), 'Unexpected local MCP ports');
  assert(env.MCP_EXPECTED_WORLD_ID === 'cor-cotn' && env.MCP_EXPECTED_SYSTEM_ID === 'dnd5e', 'Unexpected local world or system');
  assert(options.instance === 'mirror' ? env.MCP_EXPECTED_SYSTEM_VERSION === '5.3.3' : /^6\.\d+\.\d+$/.test(env.MCP_EXPECTED_SYSTEM_VERSION!), 'Unsupported local system version');
  assert(['true', 'false'].includes(env.MCP_READ_ONLY!) && env.MCP_DISABLE_MAP_SERVICE === 'true', 'Unexpected MCP permissions or map service configuration');
  const stateDir = join(options.labRoot, 'tools', 'foundry-mcp', 'instances', options.instance);
  assert(normalized(env.MCP_STATE_DIR!) === normalized(stateDir), 'MCP state directory is outside the selected local instance');
  const nodePath = join(options.labRoot, 'runtime', 'node-v24.17.0-win-x64', 'node.exe');
  const appRoot = join(options.labRoot, 'app', '14.368'); const mainPath = join(appRoot, 'main.js');
  const dataPath = join(options.labRoot, 'data', `server-${options.instance}`);
  for (const file of [nodePath, mainPath, runtimeEntry, join(appRoot, 'package.json'), join(dataPath, 'Data', 'worlds', 'cor-cotn', 'world.json'), join(dataPath, 'Data', 'systems', 'dnd5e', 'system.json')]) await assertOrdinaryPath(file, 'file');
  await assertOrdinaryPath(stateDir);
  const metadata = object(JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'))); const release = object(metadata.release);
  assert(metadata.name === 'foundryvtt' && release.generation === 14 && release.build === 368, 'Installed Foundry metadata does not match 14.368');
  const system = object(JSON.parse(await readFile(join(dataPath, 'Data', 'systems', 'dnd5e', 'system.json'), 'utf8')));
  assert(system.id === 'dnd5e' && system.version === env.MCP_EXPECTED_SYSTEM_VERSION, 'Installed system does not match the selected MCP configuration');
  const world = object(JSON.parse(await readFile(join(dataPath, 'Data', 'worlds', 'cor-cotn', 'world.json'), 'utf8')));
  assert(world.id === 'cor-cotn' && world.system === 'dnd5e', 'Installed world does not match the selected MCP configuration');
  return { instance: options.instance, labRoot: options.labRoot, origin: expected.origin, port: expected.port, worldId: 'cor-cotn', systemId: 'dnd5e', systemVersion: env.MCP_EXPECTED_SYSTEM_VERSION!, controlPort: expected.control, bridgePort: expected.bridge, webrtcPort: expected.bridge + 1, stateDir, fingerprint: runtimeFingerprint(env), nodePath, mainPath, dataPath, coreVersion: '14.368' };
}

async function loadConfiguredEnvironment(config: Record<string, unknown>, options: Options): Promise<{ env: Record<string, string>; runtimeEntry: string }> {
  const servers = object(config.mcp_servers);
  const legacy = object(servers[`foundry-${options.instance}`]);
  const unified = object(servers.foundry);
  const runtimeRoot = join(options.labRoot, 'tools', 'foundry-mcp');
  if (unified.enabled === true) {
    assert(legacy.enabled !== true, 'Both unified and legacy Foundry entries are enabled');
    assert(unified.command === 'node' && Array.isArray(unified.args) && unified.args.length === 1 && typeof unified.args[0] === 'string', 'Unexpected unified MCP runtime entry');
    const runtimeEntry = unified.args[0];
    const pairs = [
      ['on-demand-v1', 'v0.8.4-multi1'],
      ['v0.8.5-on-demand.1', 'v0.8.5-on-demand.1'],
    ];
    const pair = pairs.find(([entryDirectory]) => normalized(runtimeEntry) === normalized(join(runtimeRoot, entryDirectory!, 'unified.bundle.cjs')));
    assert(pair, 'Unexpected unified MCP runtime entry');
    const registryPath = object(unified.env).FOUNDRY_MCP_CONFIG;
    assert(typeof registryPath === 'string' && isAbsolute(registryPath), 'Unified Foundry registry must be an absolute path');
    await assertOrdinaryPath(registryPath, 'file');
    const registry = object(JSON.parse(await readFile(registryPath, 'utf8')));
    assert(registry.version === 1 && Array.isArray(registry.targets), 'Unsupported unified Foundry registry');
    const backendPath = join(runtimeRoot, pair[1]!, 'backend.bundle.cjs');
    assert(typeof registry.backendPath === 'string' && normalized(registry.backendPath) === normalized(backendPath), 'Unexpected unified Foundry backend');
    await assertOrdinaryPath(backendPath, 'file');
    const targets = registry.targets.map(object).filter(target => target.id === options.instance);
    assert(targets.length === 1, 'Selected environment is missing or duplicated in unified Foundry registry');
    return { env: object(targets[0]!.env) as Record<string, string>, runtimeEntry };
  }
  assert(legacy.enabled === true, 'The selected MCP service is explicitly disabled or missing');
  const runtimeEntry = join(runtimeRoot, 'v0.8.4-multi1', 'index.js');
  assert(legacy.command === 'node' && Array.isArray(legacy.args) && legacy.args.length === 1 && typeof legacy.args[0] === 'string' && normalized(legacy.args[0]) === normalized(runtimeEntry), 'Unexpected MCP runtime entry');
  return { env: object(legacy.env) as Record<string, string>, runtimeEntry };
}

const commandTokens = (value: string): string[] => [...value.matchAll(/(?:[^\s"]+|"[^"]*")+/g)].map(match => match[0].replaceAll('"', ''));
export function matchesService(target: Target, record: ProcessRecord): boolean {
  if (!Number.isInteger(record.pid) || record.pid <= 0 || typeof record.executable !== 'string' || typeof record.commandLine !== 'string' || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt)) || normalized(record.executable) !== normalized(target.nodePath)) return false;
  const tokens = commandTokens(record.commandLine);
  const option = (key: string) => tokens.filter(token => token.toLowerCase().startsWith(`--${key.toLowerCase()}=`));
  const data = option('dataPath'), world = option('world'), port = option('port');
  return tokens.some(token => normalized(token) === normalized(target.mainPath))
    && data.length === 1 && normalized(data[0]!.slice(data[0]!.indexOf('=') + 1)) === normalized(target.dataPath)
    && world.length === 1 && world[0] === `--world=${target.worldId}` && port.length === 1 && port[0] === `--port=${target.port}`;
}

export function classifyService(target: Target, snapshot: ServiceSnapshot): 'running' | 'stopped' | 'conflict' {
  const matches = snapshot.processes.filter(record => matchesService(target, record));
  if (!snapshot.listeners.length) return snapshot.processes.length ? 'conflict' : 'stopped';
  if (matches.length !== 1 || snapshot.processes.length !== 1) return 'conflict';
  return snapshot.listeners.every(record => ['127.0.0.1', '::1'].includes(record.address) && record.pid === matches[0]!.pid) ? 'running' : 'conflict';
}

const psLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
export async function inspectService(target: Target): Promise<ServiceSnapshot> {
  assert(process.platform === 'win32', 'Local Foundry preparation is supported on Windows only');
  const script = `$ErrorActionPreference='Stop';$targetData=${psLiteral(target.dataPath)};$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq ${target.port} | ForEach-Object {[pscustomobject]@{address=$_.LocalAddress;pid=$_.OwningProcess}});$ids=@($listeners|ForEach-Object {$_.pid});$processes=@(Get-CimInstance Win32_Process | Where-Object {($_.ProcessId -in $ids) -or ($_.Name -match '^(node|Foundry.*)\\.exe$' -and $_.CommandLine -and $_.CommandLine.Replace('/','\\').IndexOf($targetData,[StringComparison]::OrdinalIgnoreCase) -ge 0)} | ForEach-Object {[pscustomobject]@{pid=$_.ProcessId;executable=$_.ExecutablePath;commandLine=$_.CommandLine;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}});[pscustomobject]@{listeners=$listeners;processes=$processes}|ConvertTo-Json -Depth 4 -Compress`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  assert(result.status === 0 && !result.error, 'Cannot inspect local Foundry listener and process identity');
  return JSON.parse(result.stdout.trim()) as ServiceSnapshot;
}

/** One bounded, loopback-only control request. Business errors remain in the result. */
export function queryBackend(target: Target, method: 'ping' | 'call_tool', params?: unknown): Promise<unknown> {
  return new Promise((done, fail) => {
    let id = randomUUID(); let buffer = ''; let settled = false; let handshake = method === 'call_tool';
    const socket = createConnection({ host: '127.0.0.1', port: target.controlPort });
    const finish = (error?: Error, result?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); socket.destroy(); error ? fail(error) : done(result); };
    const timer = setTimeout(() => finish(new Error('Backend request timed out')), 12_000);
    socket.setEncoding('utf8'); socket.on('error', error => finish(error)); socket.on('close', () => finish(new Error('Backend disconnected before response')));
    socket.on('connect', () => socket.write(`${JSON.stringify({ id, method: handshake ? 'ping' : method })}\n`));
    socket.on('data', chunk => {
      buffer += chunk; if (buffer.length > 2_000_000) { finish(new Error('Backend response exceeded limit')); return; }
      let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1); if (!line.trim()) continue;
        try {
          const response = object(JSON.parse(line)); if (response.id !== id) continue;
          if (response.error) { finish(new Error('Backend returned a protocol error')); continue; }
          if (handshake) {
            const identity = object(response.result);
            if (identity.ok !== true || identity.instanceId !== target.instance || identity.runtimeFingerprint !== target.fingerprint) { finish(new BackendIdentityError()); continue; }
            handshake = false; id = randomUUID();
            socket.write(`${JSON.stringify({ id, method, params })}\n`);
          } else finish(undefined, response.result);
        }
        catch { finish(new Error('Backend returned malformed JSON')); }
      }
    });
  });
}

class BackendIdentityError extends Error { constructor() { super('Backend configuration changed before the world read'); } }

export function classifyWorldResult(target: Target, raw: unknown): Pick<ReadinessResult, 'status' | 'message' | 'world'> {
  const result = object(raw); const content = Array.isArray(result.content) ? result.content : [];
  const texts = content.map(part => object(part)).filter(part => part.type === 'text' && typeof part.text === 'string').map(part => part.text as string);
  if (result.isError === true) {
    const text = texts.join('\n');
    if (/module not connected/i.test(text)) return { status: 'gm_bridge_missing', message: 'Foundry is running, but its GM MCP Bridge is not connected.' };
    if (/mismatch|identity|wrong.*(?:world|system|origin)/i.test(text)) return { status: 'identity_mismatch', message: 'MCP rejected a target identity mismatch.' };
    return { status: 'read_failed', message: 'MCP could not read world data; inspect the selected instance logs.' };
  }
  let world: Record<string, unknown>; try { world = object(JSON.parse(texts[0] ?? '')); } catch { return { status: 'read_failed', message: 'MCP returned no readable world identity.' }; }
  const system = object(world.system); const foundry = object(world.foundry); const mcp = object(world.mcp ?? object(result._meta).mcp); const actual = object(mcp.actual);
  if (mcp.instanceId !== target.instance || actual.origin !== target.origin || actual.worldId !== target.worldId || actual.systemId !== target.systemId || actual.systemVersion !== target.systemVersion
    || world.id !== target.worldId || world.origin !== target.origin || system.id !== target.systemId || system.version !== target.systemVersion || foundry.version !== target.coreVersion) {
    return { status: 'identity_mismatch', message: 'World read did not match the selected local instance, world, core and system.' };
  }
  return { status: 'ready', message: 'The configured backend successfully read the correct local world.', world: { id: target.worldId, systemId: target.systemId, systemVersion: target.systemVersion, foundryVersion: target.coreVersion } };
}

const preloadSource = "const net=require('node:net');const original=net.Server.prototype.listen;net.Server.prototype.listen=function(...args){if(typeof args[0]==='number'&&(args.length===1||typeof args[1]==='function'))args.splice(1,0,'127.0.0.1');return original.apply(this,args)};";

/** Start-Process joins ArgumentList values; supply one correctly quoted Windows command line. */
export function quoteWindowsArgument(value: string): string {
  if (value && !/[\s"]/.test(value)) return value;
  let quoted = '"', slashes = 0;
  for (const character of value) {
    if (character === '\\') { slashes++; continue; }
    quoted += '\\'.repeat(character === '"' ? slashes * 2 + 1 : slashes) + character;
    slashes = 0;
  }
  return quoted + '\\'.repeat(slashes * 2) + '"';
}

export function buildWindowsLaunchScript(target: Target, preload: string, stdoutPath: string, stderrPath: string): string {
  const args = ['--require', preload, target.mainPath, `--dataPath=${target.dataPath}`, '--hostname=127.0.0.1', `--port=${target.port}`, `--world=${target.worldId}`, '--noupnp', '--nobackups', '--noipdiscovery'];
  const commandLine = args.map(quoteWindowsArgument).join(' ');
  return `$ErrorActionPreference='Stop';$started=Start-Process -FilePath ${psLiteral(target.nodePath)} -ArgumentList ${psLiteral(commandLine)} -WorkingDirectory ${psLiteral(dirname(target.mainPath))} -WindowStyle Hidden -PassThru -RedirectStandardOutput ${psLiteral(stdoutPath)} -RedirectStandardError ${psLiteral(stderrPath)};[pscustomobject]@{pid=$started.Id}|ConvertTo-Json -Compress;$started.Dispose()`;
}

export async function startService(target: Target): Promise<number> {
  await assertOrdinaryPath(target.stateDir); await mkdir(target.stateDir, { recursive: true });
  const reservation = join(target.stateDir, '.readiness-launch'); await mkdir(reservation);
  try {
    assert(classifyService(target, await inspectService(target)) === 'stopped', 'Service occupancy changed before launch; no new process started');
    const launchRoot = join(target.stateDir, 'launch'); await assertOrdinaryPath(launchRoot); await mkdir(launchRoot, { recursive: true });
    const preload = join(launchRoot, 'loopback-preload.cjs'); await assertOrdinaryPath(preload);
    try { const existing = await readFile(preload, 'utf8'); assert(existing === preloadSource, 'Existing loopback preload differs; retained'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeFile(preload, preloadSource, { flag: 'wx' }); }
    const stamp = `${Date.now()}-${randomUUID()}`;
    const stdoutPath = join(launchRoot, `${stamp}.stdout.log`), stderrPath = join(launchRoot, `${stamp}.stderr.log`);
    // Reserve task-owned empty files and close their handles before the Windows launcher reopens them.
    await writeFile(stdoutPath, '', { flag: 'wx' }); await writeFile(stderrPath, '', { flag: 'wx' });
    const environment = { ...process.env }; delete environment.NODE_OPTIONS; delete environment.NODE_PATH;
    const launched = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', buildWindowsLaunchScript(target, preload, stdoutPath, stderrPath)], { encoding: 'utf8', windowsHide: true, timeout: 15_000, env: environment });
    assert(launched.status === 0 && !launched.error, 'Windows Foundry launch did not return successfully; diagnostic logs retained');
    let pid: unknown; try { pid = object(JSON.parse(launched.stdout.trim())).pid; } catch { throw new Error('Windows Foundry launch returned no readable PID; diagnostic logs retained'); }
    assert(typeof pid === 'number' && Number.isInteger(pid) && pid > 0, 'Windows Foundry launch returned no valid PID'); return pid;
  } finally { await rmdir(reservation); }
}

export async function waitForService(target: Target, pid: number): Promise<void> {
  // Mirror package preparation took 48s in the real Lab; keep one bounded
  // startup wait without misclassifying that normal initialization as failure.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const state = await inspectService(target); const kind = classifyService(target, state);
    if (kind === 'conflict' && (state.listeners.length > 0 || state.processes.some(record => record.pid !== pid || !matchesService(target, record)))) throw new Error('Unexpected process or listener appeared during startup');
    if (kind === 'running') {
      assert(state.listeners.every(record => record.pid === pid), 'Startup listener is not owned by the launched process');
      const response = await fetch(`${target.origin}/join`, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
      assert(response.status === 200 || response.status === 302, 'Foundry did not serve its normal join page'); return;
    }
    await new Promise(done => setTimeout(done, 750));
  }
  throw new Error('Foundry startup did not become ready; process and logs retained');
}

export async function inspectReadiness(target: Target, options: Pick<Options, 'command' | 'apply'>, overrides: Partial<Dependencies> = {}): Promise<ReadinessResult> {
  const deps: Dependencies = { inspect: inspectService, query: queryBackend, start: startService, waitForService, now: () => new Date().toISOString(), ...overrides };
  const base = { schemaVersion: 1 as const, instance: target.instance, readPath: 'backend-control' as const };
  const result = (status: ReadinessStatus, message: string, extra: Partial<ReadinessResult> = {}): ReadinessResult => ({ ...base, status, ready: status === 'ready', message, ...extra, checkedAt: deps.now() });
  let snapshot = await deps.inspect(target); let kind = classifyService(target, snapshot); let service: ReadinessResult['service'] = 'reused'; let pid = snapshot.listeners[0]?.pid;
  if (kind === 'conflict') return result('service_conflict', 'The selected Foundry port or data directory is occupied by an unverified process.');
  if (kind === 'stopped') {
    if (options.command !== 'prepare' || !options.apply) return result('foundry_stopped', 'The selected Foundry service is stopped. Prepare with --apply to start it.', { ...(options.command === 'prepare' ? { service: 'planned' as const } : {}) });
    // A second independent snapshot narrows a concurrent-start race before spawning.
    snapshot = await deps.inspect(target); kind = classifyService(target, snapshot);
    if (kind === 'conflict') return result('service_conflict', 'Occupancy changed before startup; no service was started.');
    if (kind === 'running') pid = snapshot.listeners[0]?.pid;
    else {
      try { pid = await deps.start(target); service = 'started'; await deps.waitForService(target, pid); }
      catch { return result('startup_failed', 'Foundry startup did not pass identity and HTTP checks; any created process and diagnostic logs were retained.', { service: pid ? 'started' : 'planned', ...(pid ? { pid } : {}) }); }
    }
  }
  let ping: Record<string, unknown>;
  try { ping = object(await deps.query(target, 'ping')); }
  catch { return result('backend_unavailable', 'Foundry is running, but the selected MCP backend is unavailable.', { service, pid }); }
  if (ping.ok !== true || ping.instanceId !== target.instance || ping.runtimeFingerprint !== target.fingerprint) return result('identity_mismatch', 'MCP backend configuration does not match the selected instance.', { service, pid });
  let read: ReturnType<typeof classifyWorldResult>;
  try { read = classifyWorldResult(target, await deps.query(target, 'call_tool', { name: 'get-world-info', args: {} })); }
  catch (error) { read = error instanceof BackendIdentityError ? { status: 'identity_mismatch', message: 'MCP backend configuration changed before the world read.' } : { status: 'read_failed', message: 'The selected MCP backend did not complete the world read.' }; }
  return result(read.status, read.message, { service, pid, ...(read.world ? { world: read.world } : {}), ...(read.status === 'gm_bridge_missing' ? { browserAction: { required: true as const, url: `${target.origin}/game`, instruction: 'Use the official Chrome connector to prepare a task-owned GM page, then repeat this check. Preserve other tasks’ pages.' } } : {}) });
}

export async function recordReadiness(target: Target, result: ReadinessResult): Promise<void> {
  await assertOrdinaryPath(target.stateDir); await mkdir(target.stateDir, { recursive: true });
  const lock = join(target.stateDir, '.readiness-write'); await mkdir(lock); // refuse concurrent writers; never steal a lock
  const current = join(target.stateDir, 'current-readiness.json'); const log = join(target.stateDir, 'readiness.jsonl');
  try {
    await assertOrdinaryPath(current); await assertOrdinaryPath(log);
    let previous: Record<string, unknown> = {};
    try { previous = object(JSON.parse(await readFile(current, 'utf8'))); assert(previous.instance === target.instance, 'Existing readiness record belongs to another instance'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const observedAt = Date.parse(result.checkedAt);
    assert(Number.isFinite(observedAt), 'The readiness observation timestamp is invalid');
    const previousAt = typeof previous.checkedAt === 'string' ? Date.parse(previous.checkedAt) : -Infinity;
    assert(!Object.keys(previous).length || Number.isFinite(previousAt), 'The existing readiness timestamp is invalid');
    const previousSuccessAt = typeof previous.lastSuccessAt === 'string' ? previous.lastSuccessAt : null;
    assert(previousSuccessAt === null || Number.isFinite(Date.parse(previousSuccessAt)), 'The existing successful-read timestamp is invalid');
    const lastSuccessAt = previousSuccessAt && (!result.ready || Date.parse(previousSuccessAt) >= observedAt) ? previousSuccessAt : result.ready ? result.checkedAt : null;
    const olderObservation = previousAt > observedAt;
    const event = olderObservation ? 'older_observation' : result.ready ? (previous.ready === false && previous.lastSuccessAt ? 'recovered' : 'read_succeeded') : previous.ready === true ? 'disconnected' : 'not_ready';
    const summary = { schemaVersion: 1, checkedAt: result.checkedAt, instance: result.instance, status: result.status, ready: result.ready, readPath: result.readPath, lastSuccessAt, ...(result.world ? { world: result.world } : {}) };
    const currentSummary = olderObservation ? {
      schemaVersion: 1, checkedAt: previous.checkedAt, instance: target.instance, status: previous.status, ready: previous.ready,
      readPath: 'backend-control', lastSuccessAt, ...(previous.world ? { world: previous.world } : {}),
    } : summary;
    // Only allowlisted fields are persisted; backend errors and complete world data are excluded.
    await writeFile(log, `${JSON.stringify({ ...summary, event })}\n`, { flag: 'a' });
    const temporary = join(target.stateDir, `.readiness-${randomUUID()}.tmp`); await writeFile(temporary, `${JSON.stringify(currentSummary, null, 2)}\n`, { flag: 'wx' }); await rename(temporary, current);
  } finally { await rmdir(lock); }
}

export async function runReadiness(args: string[]): Promise<ReadinessResult> {
  const options = parseOptions(args); const target = await loadTarget(options);
  const result = await inspectReadiness(target, options);
  if (options.apply) await recordReadiness(target, result);
  return result;
}

if (import.meta.main) {
  try { const result = await runReadiness(Bun.argv.slice(2)); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ready ? 0 : 2; }
  catch (error) { console.error(error instanceof Error ? error.message : 'Foundry MCP readiness failed'); process.exitCode = 1; }
}
