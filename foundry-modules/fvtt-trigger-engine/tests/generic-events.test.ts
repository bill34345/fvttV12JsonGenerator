import { afterEach, describe, expect, test } from 'bun:test';
import { isSupportedTriggerRuntime } from '../src/index.ts';
import { createTriggerApi } from '../src/api.ts';
import { TriggerEngineRuntime, type ExternalEventLedgerStorage } from '../src/runtime.ts';
import { MemoryTriggerStorage } from '../src/storage.ts';
import type { ExternalEvent } from '../src/types.ts';

test('Actor event runtime is limited to the exact 5.3.3 and 6.0.5 pairs', () => {
  const globals: any = { game: { version: '14.364', system: { id: 'dnd5e', version: '5.3.3' } } };
  expect(isSupportedTriggerRuntime(globals)).toBeTrue();
  globals.game.version = '14.368'; globals.game.system.version = '6.0.5';
  expect(isSupportedTriggerRuntime(globals)).toBeTrue();
  for (const [core, system] of [['14.368', '6.0.2'], ['14.364', '6.0.5'], ['14.368', '6.0.4']]) {
    globals.game.version = core; globals.game.system.version = system;
    expect(isSupportedTriggerRuntime(globals)).toBeFalse();
  }
});

class MemoryExternalEventLedger implements ExternalEventLedgerStorage {
  #serialized = JSON.stringify({ schemaVersion: 1, events: [] });

  load(): string { return this.#serialized; }

  save(serializedLedger: string): void { this.#serialized = serializedLedger; }

  read(): { schemaVersion: number; events: ExternalEvent[] } {
    return JSON.parse(this.#serialized) as { schemaVersion: number; events: ExternalEvent[] };
  }
}

class SharedWorldSettings {
  value = JSON.stringify({ schemaVersion: 1, events: [] });
  callbacks: Array<(value: unknown) => void> = [];

  createClient() {
    return {
      register: (_namespace: string, _key: string, config: { onChange?: (value: unknown) => void }) => {
        if (config.onChange) this.callbacks.push(config.onChange);
      },
      get: () => this.value,
      set: async (_namespace: string, _key: string, value: string) => {
        this.value = value;
        for (const callback of this.callbacks) callback(value);
        return value;
      },
    };
  }
}

function globalsFor(user: any): any {
  return { game: { user, users: { activeGM: user } } };
}

function event(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  return {
    schemaVersion: 1,
    namespace: 'fvtt-weapon-mastery-properties',
    eventId: 'event-1',
    type: 'attack.prepared',
    sourceActorUuid: 'Actor.source',
    targetActorUuid: 'Actor.target',
    activityUuid: 'Actor.source.Item.weapon.Activity.attack',
    attackId: 'attack-1',
    timestamp: 1_757_000_000_000,
    data: { ruleId: 'dnd2024.slow', selected: true },
    ...overrides,
  };
}

async function flushExternalDelivery(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('public external event bridge', () => {
  const runtimes: TriggerEngineRuntime[] = [];

  afterEach(async () => {
    for (const runtime of runtimes.splice(0)) await runtime.stop();
  });

  test('exposes the versioned capability while preserving the old trigger API', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const runtime = new TriggerEngineRuntime({ globals: globalsFor(gm), storage: new MemoryTriggerStorage() });
    runtimes.push(runtime);
    await runtime.start();
    const api = createTriggerApi(() => runtime, () => runtime.isActiveGM());

    expect(api.apiVersion).toBe(1);
    expect(api.capabilities).toEqual({ externalEvents: 1 });
    expect(api.list()).toEqual([]);
    expect(api.getStore()).toEqual({ schemaVersion: 1, triggers: [] });
    expect(typeof api.subscribe).toBe('function');
    expect(typeof api.subscribeExternal).toBe('function');
    expect(typeof api.publishExternal).toBe('function');
  });

  test('denies external publishing from a non-GM while allowing browser-safe subscriptions', async () => {
    const player = { id: 'player', isGM: false, active: true };
    const runtime = new TriggerEngineRuntime({ globals: globalsFor(player), storage: new MemoryTriggerStorage() });
    runtimes.push(runtime);
    await runtime.start();
    const api = createTriggerApi(() => runtime, () => runtime.isActiveGM());
    const received: ExternalEvent[] = [];
    const unsubscribe = api.subscribeExternal((receivedEvent) => { received.push(receivedEvent); });

    await expect(api.publishExternal(event())).rejects.toThrow(/active GMs/);
    expect(received).toEqual([]);
    unsubscribe();
  });

  test('persists namespace and event ID deduplication across an active-GM handoff', async () => {
    const ledger = new MemoryExternalEventLedger();
    const gmA = { id: 'gm-a', isGM: true, active: true };
    const runtimeA = new TriggerEngineRuntime({ globals: globalsFor(gmA), storage: new MemoryTriggerStorage(), externalEventStorage: ledger });
    runtimes.push(runtimeA);
    await runtimeA.start();
    const apiA = createTriggerApi(() => runtimeA, () => runtimeA.isActiveGM());
    const receivedA: ExternalEvent[] = [];
    apiA.subscribeExternal((receivedEvent) => { receivedA.push(receivedEvent); });

    expect((await apiA.publishExternal(event())).status).toBe('published');
    expect((await apiA.publishExternal(event())).status).toBe('duplicate');
    expect(receivedA).toHaveLength(1);
    expect(ledger.read().events).toHaveLength(1);
    await runtimeA.stop();

    const gmB = { id: 'gm-b', isGM: true, active: true };
    const runtimeB = new TriggerEngineRuntime({ globals: globalsFor(gmB), storage: new MemoryTriggerStorage(), externalEventStorage: ledger });
    runtimes.push(runtimeB);
    await runtimeB.start();
    const apiB = createTriggerApi(() => runtimeB, () => runtimeB.isActiveGM());
    const receivedB: ExternalEvent[] = [];
    apiB.subscribeExternal((receivedEvent) => { receivedB.push(receivedEvent); });

    expect(receivedB).toHaveLength(0);
    expect((await apiB.publishExternal(event())).status).toBe('duplicate');
    expect(receivedB).toHaveLength(0);
  });

  test('persists, delivers, and reloads an envelope with optional fields omitted', async () => {
    const ledger = new MemoryExternalEventLedger();
    const gm = { id: 'gm', isGM: true, active: true };
    const runtime = new TriggerEngineRuntime({ globals: globalsFor(gm), storage: new MemoryTriggerStorage(), externalEventStorage: ledger });
    runtimes.push(runtime);
    await runtime.start();
    const api = createTriggerApi(() => runtime, () => runtime.isActiveGM());
    const received: ExternalEvent[] = [];
    api.subscribeExternal((receivedEvent) => { received.push(receivedEvent); });
    const minimal = event({ targetActorUuid: undefined, data: undefined });
    delete (minimal as any).targetActorUuid;
    delete (minimal as any).data;

    expect((await api.publishExternal(minimal)).status).toBe('published');
    await flushExternalDelivery();
    expect(received).toEqual([minimal]);
    expect(ledger.read().events).toEqual([minimal]);
    await runtime.stop();

    const reloaded = new TriggerEngineRuntime({ globals: globalsFor(gm), storage: new MemoryTriggerStorage(), externalEventStorage: ledger });
    runtimes.push(reloaded);
    await reloaded.start();
    const reloadedApi = createTriggerApi(() => reloaded, () => reloaded.isActiveGM());
    expect((await reloadedApi.publishExternal(minimal)).status).toBe('duplicate');
  });

  test('lets a subscriber await a follow-up publish without deadlocking the first publish', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const runtime = new TriggerEngineRuntime({ globals: globalsFor(gm), storage: new MemoryTriggerStorage() });
    runtimes.push(runtime);
    await runtime.start();
    const api = createTriggerApi(() => runtime, () => runtime.isActiveGM());
    const received: string[] = [];
    let duplicateStatus: string | undefined;
    let resolveFollowup!: () => void;
    const followupDelivered = new Promise<void>((resolve) => { resolveFollowup = resolve; });
    api.subscribeExternal(async (receivedEvent) => {
      received.push(receivedEvent.eventId);
      if (receivedEvent.eventId === 'root-event') {
        duplicateStatus = (await api.publishExternal(event({ eventId: 'root-event', attackId: 'root-attack' }))).status;
        await api.publishExternal(event({ eventId: 'followup-event', attackId: 'followup-attack' }));
      } else if (receivedEvent.eventId === 'followup-event') {
        resolveFollowup();
      }
    });

    await api.publishExternal(event({ eventId: 'root-event', attackId: 'root-attack' }));
    await Promise.race([
      followupDelivered,
      new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('follow-up delivery timed out')), 250)),
    ]);
    expect(duplicateStatus).toBe('duplicate');
    expect(received).toEqual(['root-event', 'followup-event']);
  });

  test('delivers only the sanitized serialized envelope to a second browser runtime', async () => {
    const settings = new SharedWorldSettings();
    const gm = { id: 'gm', isGM: true, active: true };
    const first = new TriggerEngineRuntime({ globals: { game: { user: gm, users: { activeGM: gm }, settings: settings.createClient() } }, storage: new MemoryTriggerStorage() });
    const second = new TriggerEngineRuntime({ globals: { game: { user: { id: 'player', isGM: false, active: true }, users: { activeGM: gm }, settings: settings.createClient() } }, storage: new MemoryTriggerStorage() });
    runtimes.push(first, second);
    await first.start();
    await second.start();
    const firstApi = createTriggerApi(() => first, () => first.isActiveGM());
    const received: ExternalEvent[] = [];
    const secondApi = createTriggerApi(() => second, () => second.isActiveGM());
    secondApi.subscribeExternal((receivedEvent) => { received.push(receivedEvent); });

    await firstApi.publishExternal(event());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(received).toEqual([event()]);
    expect(Object.keys(received[0]!)).toEqual([
      'schemaVersion', 'namespace', 'eventId', 'type', 'sourceActorUuid',
      'targetActorUuid', 'activityUuid', 'attackId', 'timestamp', 'data',
    ]);
  });

  test('rejects unsafe, oversized, and raw blind-roll payloads and bounds the persisted ledger', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const ledger = new MemoryExternalEventLedger();
    const runtime = new TriggerEngineRuntime({ globals: globalsFor(gm), storage: new MemoryTriggerStorage(), externalEventStorage: ledger });
    runtimes.push(runtime);
    await runtime.start();
    const api = createTriggerApi(() => runtime, () => runtime.isActiveGM());

    await expect(api.publishExternal(event({ data: { description: 'x'.repeat(257) } }))).rejects.toThrow(/unsafe or oversized/);
    await expect(api.publishExternal(event({ data: { blindRoll: 17 } }))).rejects.toThrow(/raw roll/);
    const unsafeData = Object.create({ inherited: true }) as any;
    unsafeData.safe = true;
    await expect(api.publishExternal(event({ data: unsafeData }))).rejects.toThrow(/plain record/);
    const tooManyFields = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`field${index}`, true]));
    await expect(api.publishExternal(event({ data: tooManyFields }))).rejects.toThrow(/at most 16/);

    for (let index = 0; index < 70; index += 1) {
      const result = await api.publishExternal(event({ eventId: `event-${index + 2}`, attackId: `attack-${index + 2}` }));
      expect(result.status).toBe('published');
    }
    expect(ledger.read().events.length).toBeLessThanOrEqual(64);
    expect(ledger.read().events.every((entry) => entry.namespace === 'fvtt-weapon-mastery-properties')).toBeTrue();
  });
});
