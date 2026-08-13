import { afterEach, describe, expect, test } from 'bun:test';
import { collectBrowserSample, StallWindowAccumulator } from './metrics';
import {
  createSanitizedError,
  redactText,
  sha256Text,
  type BrowserSample,
  type MonitorEnvironment,
  type SessionMeta,
} from './schema';
import { SessionMonitorRuntime } from './runtime';
import {
  AUTO_COLLAPSE_DELAY_MS,
  PANEL_EDGE_SNAP_DISTANCE,
  PANEL_POSITION_STORAGE_KEY,
  avoidPanelPosition,
  clampPanelPosition,
  panelPositionsOverlap,
  panelSizeForState,
  parsePanelPositionPreference,
  serializePanelPositionPreference,
  snapPanelPosition,
} from './runtime';
import { registerMarkJankKeybinding } from './index';
import { MemorySessionStore } from './storage';

const environment: MonitorEnvironment = {
  foundryVersion: '14.364',
  systemId: 'dnd5e',
  systemVersion: '5.3.3',
  moduleConfigSha256: 'hash',
  activeModules: [],
  browserMajor: '140',
  platform: 'Windows',
  hardwareConcurrency: 16,
  deviceMemoryGb: 32,
};

function meta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  const startedAt = '2026-07-29T10:00:00.000Z';
  return {
    id: 'session-one',
    worldKey: 'private-world-id',
    state: 'active',
    startedAt,
    endedAt: null,
    updatedAt: startedAt,
    refreshCount: 0,
    sampleSequence: 0,
    eventSequence: 0,
    errorSequence: 0,
    truncated: { samples: false, events: false, errors: false },
    aliases: {
      scenes: { 'secret-scene-id': 'scene-1' },
      combats: { 'secret-combat-id': 'combat-1' },
    },
    environment,
    ...overrides,
  };
}

function sample(): BrowserSample {
  return {
    sequence: 1,
    timestamp: '2026-07-29T10:00:10.000Z',
    elapsedMs: 10_000,
    visibility: 'visible',
    canvasReady: true,
    sceneAlias: 'scene-1',
    combatAlias: 'combat-1',
    round: 2,
    turn: 1,
    heap: { usedBytes: 10, totalBytes: 20, limitBytes: 30 },
    dom: { elements: 100, chatCards: 4, chatMessages: 10, openWindows: 1 },
    textureApproxBytes: 40,
    midi: { workflows: 2, liveWeakRefs: 1 },
    sequencerEffects: 3,
    timerDriftMs: 0,
    frames: { count: 4, p95Ms: 17, p99Ms: 17, maxMs: 18, over50Ms: 0, over100Ms: 0, over250Ms: 0 },
    longTasks: { count: 0, totalMs: 0, maxMs: 0 },
    capabilityGaps: [],
  };
}

describe('privacy and storage', () => {
  test('hashes deterministically without requiring a secure-context Web Crypto API', async () => {
    expect(await sha256Text('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await sha256Text('跑团')).toBe(await sha256Text('跑团'));
  });

  test('redacts credentials, addresses, document identities, and planted values', () => {
    const value = redactText(
      'token=abc https://secret.example 192.168.1.8 Actor.ABCDEFGHIJKLMNOP PlayerSecret',
      ['PlayerSecret'],
    );
    expect(value).not.toContain('abc');
    expect(value).not.toContain('secret.example');
    expect(value).not.toContain('192.168.1.8');
    expect(value).not.toContain('ABCDEFGHIJKLMNOP');
    expect(value).not.toContain('PlayerSecret');
  });

  test('does not persist arbitrary error message content', async () => {
    const planted = [
      'Secret Actor Name',
      'player typed this sentence',
      'cookie=session-secret',
      'https://private.example/game',
      '10.0.0.8',
    ];
    const error = new Error(planted.join(' | '));
    error.stack = `Error: ${error.message}\n    at moduleFunction (modules/example/main.js:12:3)`;
    const sanitized = await createSanitizedError({
      sequence: 1,
      startedAt: '2026-07-29T10:00:00.000Z',
      source: 'foundry',
      error,
      sensitiveValues: ['Secret Actor Name'],
      timestamp: '2026-07-29T10:00:01.000Z',
    });
    const serialized = JSON.stringify(sanitized);
    for (const secret of planted) expect(serialized).not.toContain(secret);
    expect(sanitized.template).toBe('<message-redacted>');
    expect(sanitized.frames).toEqual(['at moduleFunction (modules/example/main.js:12:3)']);
  });

  test('exports aliases but never internal world keys or raw identity maps', async () => {
    const store = new MemorySessionStore();
    await store.open();
    await store.createSession(meta());
    await store.appendSample('session-one', sample());
    const exported = await store.exportSession('session-one');
    expect(exported?.samples[0]?.sceneAlias).toBe('scene-1');
    expect(JSON.stringify(exported)).not.toContain('private-world-id');
    expect(JSON.stringify(exported)).not.toContain('secret-scene-id');
    expect(JSON.stringify(exported)).not.toContain('secret-combat-id');
  });
});

describe('browser metrics', () => {
  test('collects available metrics and declares missing adapters', () => {
    const collected = collectBrowserSample({
      globals: {
        document: {
          visibilityState: 'visible',
          getElementsByTagName: () => ({ length: 123 }),
          querySelectorAll: () => ({ length: 7 }),
        } as unknown as Document,
        performance: {
          memory: { usedJSHeapSize: 1, totalJSHeapSize: 2, jsHeapSizeLimit: 3 },
        } as any,
        canvas: { ready: true },
        game: { messages: { size: 9 }, combat: { round: 2, turn: 3 } },
        foundry: { applications: { instances: { size: 4 } } },
      },
      sequence: 1,
      startedAt: '2026-07-29T10:00:00.000Z',
      expectedAt: Date.now(),
      sceneAlias: 'scene-1',
      combatAlias: 'combat-1',
      stalls: {
        frames: { count: 1, p95Ms: 16, p99Ms: 16, maxMs: 16, over50Ms: 0, over100Ms: 0, over250Ms: 0 },
        longTasks: { count: 0, totalMs: 0, maxMs: 0 },
        longTaskSupported: false,
      },
      timestamp: '2026-07-29T10:00:10.000Z',
    });
    expect(collected.heap.usedBytes).toBe(1);
    expect(collected.dom).toEqual({ elements: 123, chatCards: 7, chatMessages: 9, openWindows: 4 });
    expect(collected.capabilityGaps).toContain('PerformanceObserver.longtask');
    expect(collected.capabilityGaps).toContain('MidiQOL.Workflow.workflows');
    expect(collected.capabilityGaps).toContain('Sequencer.EffectManager.getEffects');
  });

  test('summarizes frame gaps without retaining individual frames', () => {
    let callback: FrameRequestCallback | undefined;
    const stalls = new StallWindowAccumulator({
      requestAnimationFrame: (next) => {
        callback = next;
        return 1;
      },
      cancelAnimationFrame: () => {},
    });
    stalls.start();
    callback?.(0);
    callback?.(16);
    callback?.(82);
    callback?.(202);
    const first = stalls.take();
    expect(first.frames.count).toBe(3);
    expect(first.frames.maxMs).toBe(120);
    expect(first.frames.over50Ms).toBe(2);
    expect(stalls.take().frames.count).toBe(0);
    stalls.stop();
  });
});

describe('compact GM panel layout', () => {
  test('uses a materially smaller collapsed capsule and keeps the auto-collapse window bounded', () => {
    const expanded = panelSizeForState('expanded');
    const collapsed = panelSizeForState('collapsed');
    expect(collapsed.width).toBeLessThan(expanded.width);
    expect(collapsed.height).toBeLessThan(expanded.height);
    expect(AUTO_COLLAPSE_DELAY_MS).toBeGreaterThanOrEqual(1_500);
    expect(AUTO_COLLAPSE_DELAY_MS).toBeLessThanOrEqual(3_000);
  });

  test('clamps and edge-snaps dragged positions while avoiding the visible right sidebar', () => {
    const viewport = { width: 1_280, height: 720 };
    const size = panelSizeForState('expanded');
    const sidebar = { left: 980, top: 0, right: 1_280, bottom: 720 };
    const clamped = clampPanelPosition({ left: -50, top: 999 }, viewport, size);
    expect(clamped).toEqual({ left: 12, top: 576 });
    const avoided = avoidPanelPosition({ left: 1_000, top: 500 }, viewport, size, [sidebar]);
    expect(panelPositionsOverlap(avoided, size, sidebar, 8)).toBeFalse();
    const snapped = snapPanelPosition({ left: 20, top: 680 }, viewport, size, PANEL_EDGE_SNAP_DISTANCE);
    expect(snapped.left).toBe(12);
    expect(snapped.top).toBe(576);
  });

  test('persists only bounded browser-local coordinates and rejects invalid preferences', () => {
    const position = { left: 240, top: 320 };
    const raw = serializePanelPositionPreference(position);
    expect(parsePanelPositionPreference(raw)).toEqual(position);
    expect(parsePanelPositionPreference('{"version":1,"left":1e9,"top":2}')).toBeNull();
    expect(parsePanelPositionPreference('{"version":2,"left":1,"top":2}')).toBeNull();
    expect(PANEL_POSITION_STORAGE_KEY).toContain('fvtt-session-monitor');
  });

  test('registers an unbound GM-only mark keybinding that ignores idle and non-GM sessions', async () => {
    let config: any;
    let marked = 0;
    registerMarkJankKeybinding({
      game: { keybindings: { register: (_module: string, _action: string, value: any) => { config = value; } } },
    }, () => ({
      getStatus: () => ({ enabled: true, state: 'active' } as any),
      markJank: async () => { marked++; },
    }));
    expect(config.editable).toEqual([]);
    expect(config.uneditable).toEqual([]);
    expect(config.restricted).toBeTrue();
    expect(config.onDown()).toBeTrue();
    await Promise.resolve();
    expect(marked).toBe(1);
    expect(registerMarkJankKeybinding).toBeDefined();
    expect((() => {
      let localConfig: any;
      registerMarkJankKeybinding({ game: { keybindings: { register: (_m: string, _a: string, value: any) => { localConfig = value; } } } }, () => ({
        getStatus: () => ({ enabled: false, state: 'active' } as any),
        markJank: async () => {},
      }));
      return localConfig.onDown();
    })()).toBeFalse();
  });
});

describe('runtime lifecycle', () => {
  const runtimes: SessionMonitorRuntime[] = [];
  afterEach(async () => {
    for (const runtime of runtimes.splice(0)) await runtime.stopSession({ download: false });
  });

  test('keeps non-GM clients disabled', async () => {
    const runtime = new SessionMonitorRuntime(
      { game: { user: { isGM: false } } },
      new MemorySessionStore(),
      fakeStalls(),
    );
    runtimes.push(runtime);
    await runtime.initialize();
    expect(runtime.getStatus().enabled).toBeFalse();
    await expect(runtime.startSession()).rejects.toThrow('GM-only');
  });

  test('records a GM start, sample, marker, and stop without gameplay writes', async () => {
    const store = new MemorySessionStore();
    const hooks = fakeHooks();
    const runtime = new SessionMonitorRuntime(
      {
        game: {
          user: { isGM: true },
          world: { id: 'world-private' },
          version: '14.364',
          system: { id: 'dnd5e', version: '5.3.3' },
          modules: new Map(),
          messages: { size: 1 },
          combat: null,
        },
        canvas: { ready: true, scene: { id: 'scene-private' } },
        Hooks: hooks,
        navigator: { userAgent: 'Chrome/140', platform: 'Win32' } as Navigator,
        performance: {
          memory: { usedJSHeapSize: 10, totalJSHeapSize: 20, jsHeapSizeLimit: 30 },
        } as any,
      },
      store,
      fakeStalls(),
    );
    runtimes.push(runtime);
    await runtime.initialize();
    const started = await runtime.startSession();
    expect(started.state).toBe('active');
    await runtime.markJank();
    const exported = await runtime.stopSession({ download: false });
    expect(exported?.session.state).toBe('stopped');
    expect(exported?.samples.length).toBeGreaterThanOrEqual(2);
    expect(exported?.events.map((event) => event.kind)).toEqual([
      'session-start',
      'capability-gap',
      'capability-gap',
      'capability-gap',
      'jank-marker',
      'session-stop',
    ]);
    expect(JSON.stringify(exported)).not.toContain('world-private');
    expect(JSON.stringify(exported)).not.toContain('scene-private');
    expect(hooks.registered.size).toBe(0);
  });
});

function fakeStalls(): StallWindowAccumulator {
  return {
    start() {},
    stop() {},
    take() {
      return {
        frames: { count: 1, p95Ms: 16, p99Ms: 16, maxMs: 16, over50Ms: 0, over100Ms: 0, over250Ms: 0 },
        longTasks: { count: 0, totalMs: 0, maxMs: 0 },
        longTaskSupported: true,
      };
    },
  } as StallWindowAccumulator;
}

function fakeHooks() {
  let sequence = 0;
  const registered = new Map<number, string>();
  return {
    registered,
    on(name: string) {
      const id = ++sequence;
      registered.set(id, name);
      return id;
    },
    off(_name: string, id: number) {
      registered.delete(id);
    },
  };
}
