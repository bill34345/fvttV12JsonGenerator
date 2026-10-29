import { expect, test } from 'bun:test';
import { IndexedDbSessionStore } from './storage';
import type { MonitorEvent, SessionMeta } from './schema';

test('an aborted IndexedDB record transaction leaves both row and metadata unchanged', async () => {
  const meta: SessionMeta = {
    id: 'synthetic-session', worldKey: 'synthetic-world', state: 'active',
    startedAt: '2026-10-12T00:00:00.000Z', endedAt: null, updatedAt: '2026-10-12T00:00:00.000Z',
    refreshCount: 0, sampleSequence: 0, eventSequence: 0, errorSequence: 0,
    truncated: { samples: false, events: false, errors: false }, aliases: { scenes: {}, combats: {} },
    environment: {
      foundryVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3', moduleConfigSha256: 'synthetic',
      activeModules: [], browserMajor: '140', platform: 'test', hardwareConcurrency: null, deviceMemoryGb: null,
    },
  };
  const event: MonitorEvent = {
    sequence: 1, timestamp: meta.startedAt, elapsedMs: 0, kind: 'jank-marker',
    sceneAlias: null, combatAlias: null, round: null, turn: null,
  };
  const state = { sessions: new Map([[meta.id, structuredClone(meta)]]), events: new Map<string, unknown>() };
  let abortOnMetaPut = true;
  let throwOnMetaPut = false;
  const database = {
    transaction() {
      const staged: Array<() => void> = [];
      let abort = false;
      const transaction = {
        oncomplete: null as null | (() => void), onabort: null as null | (() => void), onerror: null as null | (() => void),
        objectStore(name: string) {
          return {
            add(value: { key: string }) { staged.push(() => state.events.set(value.key, structuredClone(value))); },
            put(value: SessionMeta) {
              if (name === 'sessions' && throwOnMetaPut) throw new Error('synchronous put failed');
              if (name === 'sessions' && abortOnMetaPut) abort = true;
              else staged.push(() => state.sessions.set(value.id, structuredClone(value)));
            },
          };
        },
        abort() { abort = true; },
      };
      queueMicrotask(() => {
        if (abort) transaction.onabort?.();
        else { staged.forEach((apply) => apply()); transaction.oncomplete?.(); }
      });
      return transaction;
    },
  };
  const previous = globalThis.indexedDB;
  (globalThis as any).indexedDB = {
    open() {
      const request = { result: database, onsuccess: null as null | (() => void) };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  try {
    const store = new IndexedDbSessionStore('synthetic-only');
    await store.open();
    const next = { ...meta, eventSequence: 1 };
    await expect(store.commitRecord(next, { kind: 'event', value: event })).rejects.toThrow('aborted');
    expect(state.events.size).toBe(0);
    expect(state.sessions.get(meta.id)?.eventSequence).toBe(0);
    abortOnMetaPut = false;
    throwOnMetaPut = true;
    await expect(store.commitRecord(next, { kind: 'event', value: event })).rejects.toThrow('synchronous put failed');
    expect(state.events.size).toBe(0);
    expect(state.sessions.get(meta.id)?.eventSequence).toBe(0);
    throwOnMetaPut = false;
    await store.commitRecord(next, { kind: 'event', value: event });
    expect(state.events.size).toBe(1);
    expect(state.sessions.get(meta.id)?.eventSequence).toBe(1);
  } finally {
    (globalThis as any).indexedDB = previous;
  }
});
