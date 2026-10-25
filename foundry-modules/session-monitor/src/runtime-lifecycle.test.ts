import { afterEach, describe, expect, test } from 'bun:test';
import { SessionMonitorRuntime } from './runtime';
import { MemorySessionStore, type SessionRecord } from './storage';
import { MAX_SAMPLES, MAX_SESSION_MS, type SessionMeta } from './schema';
import { StallWindowAccumulator } from './metrics';
import { JSDOM } from 'jsdom';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class ControlledStore extends MemorySessionStore {
  createGate: ReturnType<typeof deferred> | null = null;
  sampleGate: ReturnType<typeof deferred> | null = null;
  eventGate: ReturnType<typeof deferred> | null = null;
  errorGate: ReturnType<typeof deferred> | null = null;
  eventFailure: Error | null = null;
  stopUpdateGate: ReturnType<typeof deferred> | null = null;
  stopUpdateEntered = deferred();
  stopUpdateFailure: Error | null = null;
  createCalls = 0;
  override async createSession(meta: SessionMeta): Promise<void> {
    this.createCalls++;
    if (this.createGate) await this.createGate.promise;
    await super.createSession(meta);
  }
  override async appendSample(sessionId: string, sample: Parameters<MemorySessionStore['appendSample']>[1]): Promise<void> {
    if (this.sampleGate) await this.sampleGate.promise;
    await super.appendSample(sessionId, sample);
  }
  override async appendEvent(sessionId: string, event: Parameters<MemorySessionStore['appendEvent']>[1]): Promise<void> {
    if (event.kind === 'canvas-ready' && this.eventGate) await this.eventGate.promise;
    if (event.kind === 'canvas-ready' && this.eventFailure) {
      const failure = this.eventFailure;
      this.eventFailure = null;
      throw failure;
    }
    await super.appendEvent(sessionId, event);
  }
  override async appendError(sessionId: string, error: Parameters<MemorySessionStore['appendError']>[1]): Promise<void> {
    if (this.errorGate) await this.errorGate.promise;
    await super.appendError(sessionId, error);
  }
  override async updateSession(meta: SessionMeta): Promise<void> {
    if (meta.state === 'stopped') {
      this.stopUpdateEntered.resolve();
      if (this.stopUpdateGate) await this.stopUpdateGate.promise;
      if (this.stopUpdateFailure) {
        const failure = this.stopUpdateFailure;
        this.stopUpdateFailure = null;
        throw failure;
      }
    }
    await super.updateSession(meta);
  }
  override async commitRecord(meta: SessionMeta, record: SessionRecord): Promise<void> {
    if (record.kind === 'sample' && this.sampleGate) await this.sampleGate.promise;
    if (record.kind === 'event' && record.value.kind === 'canvas-ready') {
      if (this.eventGate) await this.eventGate.promise;
      if (this.eventFailure) {
        const failure = this.eventFailure;
        this.eventFailure = null;
        throw failure;
      }
    }
    if (record.kind === 'error' && this.errorGate) await this.errorGate.promise;
    await super.commitRecord(meta, record);
  }
}

class AtomicFailureStore extends MemorySessionStore {
  failNextEventMeta = false;
  failStopMeta = false;
  override async commitRecord(meta: SessionMeta, record: SessionRecord): Promise<void> {
    if (record.kind === 'event' && (this.failNextEventMeta || (this.failStopMeta && record.value.kind === 'session-stop'))) {
      this.failNextEventMeta = false;
      this.failStopMeta = false;
      throw new Error('event metadata failed');
    }
    await super.commitRecord(meta, record);
  }
}

function fixture<T extends MemorySessionStore = ControlledStore>(store = new ControlledStore() as unknown as T) {
  const user = { isGM: true };
  const callbacks = new Map<string, (...args: unknown[]) => void>();
  const hooks = {
    on(name: string, callback: (...args: unknown[]) => void) { callbacks.set(name, callback); return name; },
    off(name: string) { callbacks.delete(name); },
  };
  const runtime = new SessionMonitorRuntime({
    game: { user, world: { id: 'synthetic' }, modules: new Map() }, Hooks: hooks,
  }, store, { start() {}, stop() {}, take() { return {
    frames: { count: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, over50Ms: 0, over100Ms: 0, over250Ms: 0 },
    longTasks: { count: 0, totalMs: 0, maxMs: 0 }, longTaskSupported: true,
  }; } } as StallWindowAccumulator);
  return { runtime, store, user, callbacks };
}

describe('runtime lifecycle with asynchronous storage', () => {
  const cleanup: Array<() => Promise<unknown>> = [];
  afterEach(async () => { for (const stop of cleanup.splice(0)) await stop(); });

  test('concurrent starts create one active session; a failed create leaves no active state', async () => {
    const { runtime, store } = fixture();
    store.createGate = deferred();
    const first = runtime.startSession();
    const second = runtime.startSession();
    await Promise.resolve();
    store.createGate.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(a.sessionId).toBe(b.sessionId);
    expect(store.createCalls).toBe(1);
    expect(store.sessions.size).toBe(1);
    cleanup.push(() => runtime.stopSession({ download: false }));

    const failed = fixture();
    failed.store.createGate = deferred();
    const pending = failed.runtime.startSession();
    await Promise.resolve();
    failed.store.createGate.reject(new Error('create failed'));
    await expect(pending).rejects.toThrow('create failed');
    expect(failed.runtime.getStatus().state).toBe('idle');
  });

  test('stop waits for an accepted sample and prevents later collection', async () => {
    const { runtime, store, callbacks } = fixture();
    await runtime.startSession();
    store.eventGate = deferred();
    store.sampleGate = deferred();
    callbacks.get('canvasReady')?.();
    const stopping = runtime.stopSession({ download: false });
    let completed = false;
    void stopping.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBeFalse();
    await expect(runtime.markJank()).rejects.toThrow('No active monitoring session');
    store.eventGate.resolve();
    await Promise.resolve();
    expect(completed).toBeFalse();
    store.sampleGate.resolve();
    const exported = await stopping;
    expect(exported?.session.state).toBe('stopped');
    expect(exported?.events.some((event) => event.kind === 'canvas-ready')).toBeTrue();
    expect(callbacks.size).toBe(0);
  });

  test('GM role is checked after asynchronous create and for read/write API access', async () => {
    const { runtime, store, user } = fixture();
    store.createGate = deferred();
    const starting = runtime.startSession();
    await Promise.resolve();
    user.isGM = false;
    store.createGate.resolve();
    await expect(starting).rejects.toThrow('GM-only');
    expect(runtime.getStatus().state).toBe('idle');
    await expect(runtime.listSessions()).rejects.toThrow('GM-only');
    await expect(runtime.exportSession()).rejects.toThrow('GM-only');
    await expect(runtime.stopSession({ download: false })).rejects.toThrow('GM-only');
  });

  test('a failed stopped write rejects; retry does not duplicate the saved stop event', async () => {
    const { runtime, store, callbacks } = fixture();
    await runtime.startSession();
    callbacks.get('canvasReady')?.();
    store.stopUpdateFailure = new Error('stopped write failed');
    await expect(runtime.stopSession({ download: false })).rejects.toThrow('stopped write failed');
    expect(runtime.getStatus().state).toBe('active');
    expect(callbacks.size).toBe(0);
    await expect(runtime.startSession()).rejects.toThrow('stop is incomplete');
    const exported = await runtime.stopSession({ download: false });
    expect(exported?.session.state).toBe('stopped');
    expect(exported?.events.filter((event) => event.kind === 'session-stop')).toHaveLength(1);
    expect(exported?.events.filter((event) => event.kind === 'canvas-ready')).toHaveLength(1);
  });

  test('reload finishes a stored stop event after the stopped metadata write failed', async () => {
    const store = new ControlledStore();
    const first = fixture(store);
    await first.runtime.startSession();
    const id = first.runtime.getStatus().sessionId!;
    store.stopUpdateFailure = new Error('stopped write failed');
    await expect(first.runtime.stopSession({ download: false })).rejects.toThrow('stopped write failed');
    const second = fixture(store);
    await second.runtime.initialize();
    const exported = await second.runtime.exportSession(id);
    expect(exported?.session.state).toBe('stopped');
    expect(exported?.events.filter((event) => event.kind === 'session-stop')).toHaveLength(1);
  });

  test('a failed accepted event keeps stop fail-closed across retries', async () => {
    const { runtime, store, callbacks } = fixture();
    await runtime.startSession();
    store.eventFailure = new Error('event write failed');
    callbacks.get('canvasReady')?.();
    await expect(runtime.stopSession({ download: false })).rejects.toThrow('event write failed');
    expect(runtime.getStatus().state).toBe('active');
    await expect(runtime.stopSession({ download: false })).rejects.toThrow('event write failed');
    expect((await store.getSession(runtime.getStatus().sessionId!))?.state).toBe('active');
    expect((await runtime.startSession()).state).toBe('active');
    expect((await runtime.stopSession({ download: false }))?.session.state).toBe('stopped');
  });

  test('a failed queued record prevents later queued records from being saved', async () => {
    const { runtime, store, callbacks } = fixture();
    await runtime.startSession();
    store.eventGate = deferred();
    store.eventFailure = new Error('atomic record failed');
    callbacks.get('canvasReady')?.();
    callbacks.get('canvasReady')?.();
    store.eventGate.resolve();
    await expect(runtime.stopSession({ download: false })).rejects.toThrow('atomic record failed');
    expect((await store.exportSession(runtime.getStatus().sessionId!))?.events.filter((event) => event.kind === 'canvas-ready')).toHaveLength(0);
    expect(callbacks.size).toBe(0);
  });

  test('reload resumes after a failed event metadata write without duplicate sequence', async () => {
    const store = new AtomicFailureStore();
    const first = fixture(store);
    await first.runtime.startSession();
    const id = first.runtime.getStatus().sessionId!;
    store.failNextEventMeta = true;
    await expect(first.runtime.markJank()).rejects.toThrow('event metadata failed');
    const second = fixture(store);
    await second.runtime.initialize();
    const exported = await second.runtime.exportSession(id);
    expect(new Set(exported!.events.map((event) => event.sequence)).size).toBe(exported!.events.length);
    cleanup.push(() => second.runtime.stopSession({ download: false }));
  });

  test('reload reconciles legacy split counters without inventing missing samples', async () => {
    const first = fixture();
    await first.runtime.startSession();
    const id = first.runtime.getStatus().sessionId!;
    const active = (await first.store.getSession(id))!;
    const before = (await first.store.exportSession(id))!;
    await first.runtime.stopSession({ download: false });
    const legacyEvent = { ...before.events.at(-1)!, sequence: active.eventSequence + 1, kind: 'jank-marker' as const };
    first.store.events.set(id, [...before.events, legacyEvent]);
    first.store.samples.set(id, before.samples);
    active.sampleSequence += 2; // A previously reserved sequence has no persisted row.
    await first.store.updateSession(active);

    const second = fixture(first.store);
    await second.runtime.initialize();
    const resumed = (await second.runtime.exportSession(id))!;
    expect(resumed.events.at(-1)?.kind).toBe('session-resume');
    expect(resumed.events.at(-1)?.sequence).toBe(legacyEvent.sequence + 1);
    expect(resumed.session.sampleSequence).toBe(active.sampleSequence);
    expect(resumed.samples).toHaveLength(before.samples.length);
    const stopped = await second.runtime.stopSession({ download: false });
    expect(stopped?.samples.at(-1)?.sequence).toBe(active.sampleSequence + 1);
    expect(stopped?.samples).toHaveLength(before.samples.length + 1);
  });

  test('retry after a failed stop event metadata write saves one stop event', async () => {
    const store = new AtomicFailureStore();
    const { runtime } = fixture(store);
    await runtime.startSession();
    store.failStopMeta = true;
    await expect(runtime.stopSession({ download: false })).rejects.toThrow('event metadata failed');
    const exported = await runtime.stopSession({ download: false });
    expect(exported?.events.filter((event) => event.kind === 'session-stop')).toHaveLength(1);
  });

  test('stop waits for an accepted sanitized error write', async () => {
    const { runtime, store, callbacks } = fixture();
    await runtime.startSession();
    store.errorGate = deferred();
    callbacks.get('error')?.('synthetic', new Error('synthetic error'), {});
    const stopping = runtime.stopSession({ download: false });
    let completed = false;
    void stopping.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBeFalse();
    store.errorGate.resolve();
    const exported = await stopping;
    expect(exported?.errors).toHaveLength(1);
  });

  test('role loss during the final stopped write cannot return an export', async () => {
    const { runtime, store, user } = fixture();
    await runtime.startSession();
    store.stopUpdateGate = deferred();
    const stopping = runtime.stopSession({ download: false });
    await store.stopUpdateEntered.promise;
    user.isGM = false;
    store.stopUpdateGate.resolve();
    await expect(stopping).rejects.toThrow('GM-only');
  });

  test('GM downgrade rejects new hook and timer samples while flushing an earlier accepted event', async () => {
    let tick: (() => void) | undefined;
    const originalInterval = globalThis.setInterval;
    globalThis.setInterval = ((handler: TimerHandler, timeout?: number) => {
      tick = handler as () => void;
      return originalInterval(handler, timeout);
    }) as typeof setInterval;
    const { runtime, store, user, callbacks } = fixture();
    try { await runtime.startSession(); } finally { globalThis.setInterval = originalInterval; }
    const id = runtime.getStatus().sessionId!;
    const before = await store.exportSession(id);
    store.eventGate = deferred();
    callbacks.get('canvasReady')?.();
    user.isGM = false;
    tick?.();
    callbacks.get('canvasReady')?.();
    store.eventGate.resolve();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const after = await store.exportSession(id);
    expect(after?.samples).toHaveLength(before!.samples.length);
    expect(after?.events.filter((event) => event.kind === 'canvas-ready')).toHaveLength(1);
    expect(callbacks.size).toBe(0);
  });

  test('panel reports a fixed safe failure when storage rejects an action', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const store = new ControlledStore();
    store.createGate = deferred();
    const runtime = new SessionMonitorRuntime({
      document: dom.window.document, window: dom.window as unknown as Window,
      game: { user: { isGM: true }, world: { id: 'synthetic' }, modules: new Map() },
    }, store, fakeStalls());
    try {
      await runtime.initialize();
      dom.window.document.querySelector<HTMLButtonElement>('[data-action="start"]')!.click();
      await Promise.resolve();
      store.createGate.reject(new Error('secret-token=private storage failure'));
      for (let i = 0; i < 10; i++) await Bun.sleep(0);
      const detail = dom.window.document.querySelector<HTMLElement>('[data-role="detail"]')!.textContent;
      expect(detail).toBe('Operation could not be completed. Retry or reload.');
      expect(detail).not.toContain('private');
      expect(store.sessions.size).toBe(0);
    } finally { dom.window.close(); }
  });

  test('background write failure shows a safe pause with an available retry control', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    const store = new ControlledStore();
    const runtime = new SessionMonitorRuntime({
      document: dom.window.document, window: dom.window as unknown as Window,
      game: { user: { isGM: true }, world: { id: 'synthetic' }, modules: new Map() },
      Hooks: { on(name: string, callback: (...args: unknown[]) => void) { callbacks.set(name, callback); return name; },
        off(name: string) { callbacks.delete(name); } },
    }, store, fakeStalls());
    try {
      await runtime.initialize();
      await runtime.startSession();
      store.eventFailure = new Error('secret-token=private failure');
      callbacks.get('canvasReady')?.();
      await Bun.sleep(0);
      const doc = dom.window.document;
      expect(doc.querySelector<HTMLButtonElement>('[data-action="start"]')!.disabled).toBeFalse();
      expect(doc.querySelector<HTMLButtonElement>('[data-action="mark"]')!.disabled).toBeTrue();
      expect(doc.querySelector<HTMLButtonElement>('[data-action="stop"]')!.disabled).toBeFalse();
      expect(doc.querySelector<HTMLElement>('[data-role="detail"]')!.textContent).toBe('Operation could not be completed. Retry or reload.');
      expect((await runtime.startSession()).state).toBe('active');
      await runtime.stopSession({ download: false });
    } finally { dom.window.close(); }
  });

  test.each(['sample cap', 'duration cap'])('%s records one limit event and closes without recursive stop', async (limit) => {
    const first = fixture();
    await first.runtime.startSession();
    const id = first.runtime.getStatus().sessionId!;
    const active = (await first.store.getSession(id))!;
    await first.runtime.stopSession({ download: false });
    first.store.events.set(id, (first.store.events.get(id) ?? []).filter((event) => event.kind !== 'session-stop'));
    if (limit === 'sample cap') active.sampleSequence = MAX_SAMPLES;
    else active.startedAt = new Date(Date.now() - MAX_SESSION_MS - 1_000).toISOString();
    await first.store.updateSession(active);

    const second = fixture(first.store);
    let tick: (() => void) | undefined;
    const originalInterval = globalThis.setInterval;
    globalThis.setInterval = ((handler: TimerHandler, timeout?: number) => {
      tick = handler as () => void;
      return originalInterval(handler, timeout);
    }) as typeof setInterval;
    try { await second.runtime.initialize(); } finally { globalThis.setInterval = originalInterval; }
    tick?.();
    for (let i = 0; i < 20 && second.runtime.getStatus().state !== 'stopped'; i++) await Bun.sleep(0);
    expect(second.runtime.getStatus().state).toBe('stopped');
    const exported = await second.runtime.exportSession(id);
    expect(exported?.events.filter((event) => event.kind === 'limit-reached')).toHaveLength(1);
    expect(exported?.events.filter((event) => event.kind === 'session-stop')).toHaveLength(1);
  });

  test('a failed automatic stop at the sample cap is completed on start retry', async () => {
    const store = new AtomicFailureStore();
    const first = fixture(store);
    await first.runtime.startSession();
    const id = first.runtime.getStatus().sessionId!;
    const active = (await store.getSession(id))!;
    const before = (await store.exportSession(id))!;
    await first.runtime.stopSession({ download: false });
    store.events.set(id, before.events);
    store.samples.set(id, before.samples);
    active.sampleSequence = MAX_SAMPLES;
    await store.updateSession(active);

    const second = fixture(store);
    let tick: (() => void) | undefined;
    const originalInterval = globalThis.setInterval;
    globalThis.setInterval = ((handler: TimerHandler, timeout?: number) => {
      tick = handler as () => void;
      return originalInterval(handler, timeout);
    }) as typeof setInterval;
    try { await second.runtime.initialize(); } finally { globalThis.setInterval = originalInterval; }
    store.failStopMeta = true;
    tick?.();
    await Bun.sleep(0);
    expect(second.runtime.getStatus().state).toBe('active');
    expect((await store.exportSession(id))?.events.filter((event) => event.kind === 'limit-reached')).toHaveLength(1);
    expect((await second.runtime.startSession()).state).toBe('stopped');
    const exported = await second.runtime.exportSession(id);
    expect(exported?.events.filter((event) => event.kind === 'limit-reached')).toHaveLength(1);
    expect(exported?.events.filter((event) => event.kind === 'session-stop')).toHaveLength(1);
  });

  test('reload after a failed cap stop closes the same limit event once', async () => {
    const store = new AtomicFailureStore();
    const first = fixture(store);
    await first.runtime.startSession();
    const id = first.runtime.getStatus().sessionId!;
    const active = (await store.getSession(id))!;
    const before = (await store.exportSession(id))!;
    await first.runtime.stopSession({ download: false });
    store.events.set(id, before.events);
    store.samples.set(id, before.samples);
    active.sampleSequence = MAX_SAMPLES;
    await store.updateSession(active);
    const second = fixture(store);
    let tick: (() => void) | undefined;
    const originalInterval = globalThis.setInterval;
    globalThis.setInterval = ((handler: TimerHandler, timeout?: number) => {
      tick = handler as () => void;
      return originalInterval(handler, timeout);
    }) as typeof setInterval;
    try { await second.runtime.initialize(); } finally { globalThis.setInterval = originalInterval; }
    store.failStopMeta = true;
    tick?.();
    await Bun.sleep(0);
    const third = fixture(store);
    await third.runtime.initialize();
    const exported = await third.runtime.exportSession(id);
    expect(exported?.session.state).toBe('stopped');
    expect(exported?.events.filter((event) => event.kind === 'limit-reached')).toHaveLength(1);
    expect(exported?.events.filter((event) => event.kind === 'session-stop')).toHaveLength(1);
  });
});

function fakeStalls(): StallWindowAccumulator {
  return { start() {}, stop() {}, take() { return {
    frames: { count: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, over50Ms: 0, over100Ms: 0, over250Ms: 0 },
    longTasks: { count: 0, totalMs: 0, maxMs: 0 }, longTaskSupported: true,
  }; } } as StallWindowAccumulator;
}
