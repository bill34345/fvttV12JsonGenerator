import { describe, expect, test } from 'bun:test';
import { installBridgeRecovery, RECOVERY_VERSION } from './bridge-recovery.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { patchBridgeMain, recoveryWriteCount } from './install-recovery.mjs';

function fixture() {
  let now = 1_000_000;
  let connected = false;
  let available = false;
  let starts = 0;
  let stops = 0;
  let config = { serverPort: 31515 };
  const settings: Record<string, unknown> = { enabled: true, autoReconnectEnabled: true };
  const data = new Map<string, string>();
  const bridge: any = {
    isInitialized: true, isConnecting: false, heartbeatInterval: null,
    isGMUser: () => true,
    settings: { getSetting: (key: string) => settings[key], getBridgeConfig: () => config },
    socketBridge: { isConnected: () => connected },
    async start() { starts++; if (!available) throw new Error('WebSocket connection failed'); connected = true; this.startHeartbeat(); },
    async stop() { stops++; connected = false; this.stopHeartbeat(); },
    startHeartbeat() { this.heartbeatInterval = 1; },
    stopHeartbeat() { this.heartbeatInterval = null; },
    updateLastActivity() {},
  };
  installBridgeRecovery(bridge, { clock: () => now, storage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }, log: () => {}, worldId: 'fixture' });
  return { bridge, settings, data, setAvailable: (value: boolean) => { available = value; }, setConnected: (value: boolean) => { connected = value; }, advance: (ms: number) => { now += ms; }, configure: (value: any) => { config = value; }, starts: () => starts, stops: () => stops };
}

describe('Bridge recovery in a live GM page', () => {
  test('installation plan counts a helper-only candidate upgrade', () => {
    expect(recoveryWriteCount({ before: 'patched', after: 'patched', existingHelper: 'old', helper: 'new' })).toBe(1);
    expect(recoveryWriteCount({ before: 'patched', after: 'patched', existingHelper: 'new', helper: 'new' })).toBe(0);
  });
  test('initial server absence keeps monitoring; later backend recovers without changing preferences', async () => {
    const f = fixture();
    await expect(f.bridge.start()).rejects.toThrow('WebSocket');
    expect(f.bridge.heartbeatInterval).not.toBeNull();
    expect(f.settings.autoReconnectEnabled).toBe(true);
    f.setAvailable(true); f.advance(60000);
    await f.bridge.performHeartbeat();
    expect(f.bridge.getRecoveryStatus().transportConnected).toBe(true);
    expect(f.bridge.getRecoveryStatus().history.some((row: any) => row.reason === 'recovered')).toBe(true);
    expect(f.bridge.recoveryVersion).toBe(RECOVERY_VERSION);
  });
  test('repeated failure preserves retry preference and monitoring with backoff', async () => {
    const f = fixture();
    await expect(f.bridge.start()).rejects.toThrow();
    for (let i = 0; i < 8; i++) { f.advance(60000); await f.bridge.performHeartbeat(); }
    expect(f.starts()).toBe(9);
    expect(f.settings.autoReconnectEnabled).toBe(true);
    expect(f.bridge.heartbeatInterval).not.toBeNull();
    await f.bridge.performHeartbeat();
    expect(f.starts()).toBe(9);
  });
  test('manual stop and explicit disable suppress automatic recovery', async () => {
    const f = fixture(); f.setAvailable(true);
    await f.bridge.start(); await f.bridge.stop();
    f.advance(60000); await f.bridge.performHeartbeat();
    expect(f.starts()).toBe(1);
    f.settings.enabled = false;
    await f.bridge.start();
    expect(f.starts()).toBe(1);
  });
  test('disabled auto reconnect permits observation but no retry', async () => {
    const f = fixture(); f.settings.autoReconnectEnabled = false;
    await expect(f.bridge.start()).rejects.toThrow();
    f.advance(60000); await f.bridge.performHeartbeat();
    expect(f.starts()).toBe(1);
    expect(f.settings.autoReconnectEnabled).toBe(false);
  });
  test('a transient loss followed by a successful retry is labeled recovered', async () => {
    const f = fixture(); f.setAvailable(true); await f.bridge.start();
    f.setConnected(false); f.bridge.getRecoveryStatus();
    await f.bridge.performHeartbeat();
    expect(f.bridge.getRecoveryStatus().history.at(-1).reason).toBe('recovered');
  });
  test('invalid configuration stops retries until a configuration change', async () => {
    const f = fixture();
    // Replace the captured original start before installation on a second fixture object.
    const g: any = { ...f.bridge, recoveryVersion: null, start: async () => { throw new Error('Invalid configuration: serverPort'); }, stop: async () => {}, heartbeatInterval: null };
    installBridgeRecovery(g, { clock: () => 10, storage: null, log: () => {}, worldId: 'invalid' });
    await expect(g.start()).rejects.toThrow('Invalid configuration');
    expect(g.getRecoveryStatus().blockedReason).toBe('configuration_invalid');
    await g.performHeartbeat();
    expect(g.getRecoveryStatus().failures).toBe(1);
  });
  test('a manual stop wins over a pending start and cleanup leaves it disconnected', async () => {
    const f = fixture(); let resolveStart!: () => void; let connected = false;
    const g: any = { ...f.bridge, recoveryVersion: null, start: () => new Promise<void>(resolve => { resolveStart = () => { connected = true; resolve(); }; }), stop: async function () { connected = false; this.stopHeartbeat(); }, socketBridge: { isConnected: () => connected }, heartbeatInterval: null };
    installBridgeRecovery(g, { storage: null, log: () => {}, worldId: 'pending' });
    const pending = g.start(); await g.stop(); resolveStart(); await pending;
    expect(connected).toBe(false);
    expect(g.heartbeatInterval).toBeNull();
  });
  test('history stays bounded and contains no raw error payloads', async () => {
    const f = fixture(); await expect(f.bridge.start()).rejects.toThrow();
    for (let i = 0; i < 80; i++) { f.advance(60000); await f.bridge.performHeartbeat(); }
    const history = f.bridge.getRecoveryStatus().history;
    expect(history.length).toBeLessThanOrEqual(64);
    expect(history.every((row: any) => Object.keys(row).every(key => ['at', 'event', 'reason', 'attempt'].includes(key)))).toBe(true);
    expect([...f.data.values()].some(value => value.includes('WebSocket'))).toBe(false);
  });
});

// Optional exact installed-code contract; its path is explicit and source-only.
// Network, storage, settings and clocks are fixture-owned.
const upstreamMain = process.env.FVTT_MCP_UPSTREAM_MAIN;
describe.skipIf(!upstreamMain)('exact installed Bridge source contract', () => {
  const originalSource = () => {
    let text = readFileSync(upstreamMain!, 'utf8');
    text = text.replace("import { installBridgeRecovery } from './codex-recovery.js';\n", '').replace('\ninstallBridgeRecovery(foundryMCPBridge);', '').replace('\n            this.configureRecoverySocket?.(this.socketBridge);', '');
    expect(createHash('sha256').update(text).digest('hex')).toBe('169abb12ddc7793f9c8dbcb7d01484a50f28d79cc82c550384a4ed70cf43d6b0');
    return text.slice(text.indexOf('class FoundryMCPBridge'), text.indexOf('// Create global instance')) + '\nFoundryMCPBridge;';
  };
  function actualBridge() {
    const values: any = { enabled: true, autoReconnectEnabled: true, heartbeatInterval: 30, enableNotifications: false };
    class Settings { registerSettings() {} getSetting(key: string) { return values[key]; } async setSetting(key: string, value: any) { values[key] = value; } validateSettings() { return { valid: true }; } getBridgeConfig() { return {}; } updateConnectionStatusDisplay() {} }
    class Socket { async connect() { throw new Error('WebSocket connection failed'); } isConnected() { return false; } disconnect() {} }
    const Bridge = runInNewContext(originalSource(), { MODULE_ID: 'fixture', ModuleSettings: Settings, QueryHandlers: class {}, CampaignHooks: class {}, ComfyUIManager: class {}, SocketBridge: Socket,
      window: { setInterval: () => 1, clearInterval() {} }, console: { log() {}, warn() {}, error() {} }, game: { user: { isGM: true } }, ui: { notifications: {} }, setTimeout: (fn: () => void) => { fn(); }, Date });
    const bridge = new Bridge(); bridge.isInitialized = true;
    return { bridge, values };
  }
  test('reproduces upstream initial-failure monitor loss and persistent retry disable', async () => {
    const { bridge, values } = actualBridge();
    await expect(bridge.start()).rejects.toThrow('WebSocket');
    expect(bridge.heartbeatInterval).toBeNull();
    bridge.lastActivity = new Date(0);
    await bridge.performHeartbeat();
    expect(values.autoReconnectEnabled).toBe(false);
  });
  test('adapter repairs both behaviors on the same verified upstream class', async () => {
    const { bridge, values } = actualBridge();
    installBridgeRecovery(bridge, { clock: () => 1_000_000, storage: null, log: () => {}, worldId: 'upstream-fixture' });
    await expect(bridge.start()).rejects.toThrow('WebSocket');
    expect(bridge.heartbeatInterval).not.toBeNull();
    await bridge.performHeartbeat();
    expect(values.autoReconnectEnabled).toBe(true);
    expect(bridge.heartbeatInterval).not.toBeNull();
  });
  test('installer requires all guards and preserves the exact known baseline', () => {
    let source = readFileSync(upstreamMain!, 'utf8');
    source = source.replace("import { installBridgeRecovery } from './codex-recovery.js';\n", '').replace('\ninstallBridgeRecovery(foundryMCPBridge);', '').replace('\n            this.configureRecoverySocket?.(this.socketBridge);', '');
    const patched = patchBridgeMain(source);
    expect(patchBridgeMain(patched)).toBe(patched);
    expect(() => patchBridgeMain(patched.replace('\n            this.configureRecoverySocket?.(this.socketBridge);', ''))).toThrow('guard');
    expect(() => patchBridgeMain(source + '\n// unknown edit')).toThrow('baseline');
  });

  function transportFixture(autoReconnectEnabled = true) {
    const sockets: any[] = [], timers: any[] = [];
    class WS {
      static OPEN = 1; readyState = 0; onopen: any; onclose: any; onerror: any; onmessage: any;
      listeners = new Map<string, Set<any>>();
      constructor(_url: string) { sockets.push(this); }
      addEventListener(name: string, fn: any) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name)!.add(fn); }
      removeEventListener(name: string, fn: any) { this.listeners.get(name)?.delete(fn); }
      fire(name: string, event: any = {}) { this[`on${name}` as keyof this]?.(event); for (const fn of this.listeners.get(name) ?? []) fn(event); }
      close() { this.readyState = 3; this.fire('close', { wasClean: true }); }
      open() { this.readyState = 1; this.fire('open'); }
      fail() { this.readyState = 3; this.fire('error', new Error('fixture')); }
    }
    const source = readFileSync(join(dirname(upstreamMain!), 'socket-bridge.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export class SocketBridge', 'class SocketBridge');
    const Socket = runInNewContext(source + '\nSocketBridge;', { MODULE_ID: 'fixture', CONNECTION_STATES: { CONNECTED: 'connected', CONNECTING: 'connecting', DISCONNECTED: 'disconnected', RECONNECTING: 'reconnecting' }, WebSocket: WS, window: { location: { protocol: 'http:' } }, console: { log() {} }, setTimeout: (fn: any, delay: number) => { const timer = { fn, delay, active: true }; timers.push(timer); return timer; }, clearTimeout: (timer: any) => { timer.active = false; } });
    const bridge: any = {
      isInitialized: true, isConnecting: false, heartbeatInterval: null, socketBridge: null,
      isGMUser: () => true,
      settings: { getSetting: (key: string) => ({ enabled: true, autoReconnectEnabled }[key]), getBridgeConfig: () => ({ serverHost: 'localhost', serverPort: 31515, namespace: '/', reconnectAttempts: 5, connectionTimeout: 10 }) },
      async start() { this.socketBridge = new Socket(this.settings.getBridgeConfig()); this.configureRecoverySocket?.(this.socketBridge); await this.socketBridge.connect(); this.startHeartbeat(); },
      async stop() { this.stopHeartbeat(); this.socketBridge?.disconnect(); this.socketBridge = null; },
      startHeartbeat() { this.heartbeatInterval = 1; }, stopHeartbeat() { this.heartbeatInterval = null; }, updateLastActivity() {},
    };
    installBridgeRecovery(bridge, { storage: null, log: () => {}, worldId: 'socket-fixture' });
    return { bridge, sockets, timers };
  }
  test('actual SocketBridge does not bypass disabled auto-reconnect', async () => {
    const { bridge, sockets, timers } = transportFixture(false);
    const pending = bridge.start(); sockets[0].fail(); await expect(pending).rejects.toThrow();
    expect(timers.filter(timer => timer.active && timer.delay === 1000)).toHaveLength(0);
    await bridge.performHeartbeat(); expect(sockets).toHaveLength(1);
  });
  test('late errors from a stopped actual SocketBridge cannot create orphan sockets', async () => {
    const { bridge, sockets, timers } = transportFixture();
    const pending = bridge.start(); pending.catch(() => {});
    const oldError = sockets[0].onerror;
    await bridge.stop(); oldError(new Error('late')); await expect(pending).rejects.toThrow('cancelled');
    for (const timer of timers.filter(timer => timer.active && timer.delay === 1000)) timer.fn();
    expect(sockets).toHaveLength(1); expect(bridge.socketBridge).toBeNull();
    expect(sockets[0].onmessage).toBeNull();
  });
  test('actual transport events record an interruption before the heartbeat interval', async () => {
    const { bridge, sockets } = transportFixture();
    const pending = bridge.start(); sockets[0].open(); await pending;
    sockets[0].close();
    const history = bridge.getRecoveryStatus().history;
    expect(history.some((row: any) => row.event === 'connected')).toBe(true);
    expect(history.at(-1).event).toBe('disconnected');
  });
});
