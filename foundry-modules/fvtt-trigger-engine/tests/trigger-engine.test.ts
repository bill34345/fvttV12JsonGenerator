import { afterEach, describe, expect, test } from 'bun:test';
import { createTriggerApi } from '../src/api.ts';
import { registerTriggerEngineSettings } from '../src/index.ts';
import { createTriggerManagerApplicationClass } from '../src/manager.ts';
import { evaluateCondition, evaluateConditionGroup, triggerMatchesEvent, watchedPathsMatch } from '../src/evaluator.ts';
import { TriggerEngineRuntime } from '../src/runtime.ts';
import { MemoryTriggerStorage } from '../src/storage.ts';
import { parseTriggerDefinition, parseTriggerStore } from '../src/schema.ts';
import type { ConditionGroup, TriggerDefinition } from '../src/types.ts';

function trigger(id: string, macroUuids: string[] = [id], overrides: Partial<TriggerDefinition> = {}): TriggerDefinition {
  return {
    id,
    name: id,
    enabled: true,
    event: { type: 'documentUpdate', documentType: 'Actor', watchedPaths: ['system.attributes.hp.value'] },
    conditions: null,
    actions: macroUuids.map((macroUuid) => ({ type: 'macro', macroUuid })),
    ...overrides,
  };
}

function actor(initialHp = 10, uuid = 'Actor.test') {
  const data: any = { _id: uuid.split('.').at(-1), name: 'Test Actor', system: { attributes: { hp: { value: initialHp } } } };
  const toObjectCalls: boolean[] = [];
  return {
    uuid,
    id: data._id,
    documentName: 'Actor',
    toObject(deep: boolean) {
      toObjectCalls.push(deep);
      return JSON.parse(JSON.stringify(data));
    },
    set(path: string, value: unknown) {
      const segments = path.split('.');
      let current = data;
      for (const segment of segments.slice(0, -1)) current = current[segment] ??= {};
      current[segments.at(-1)!] = value;
    },
    toObjectCalls,
  };
}

function globalsFor(currentUser: any, actors: any[] = []): any {
  const errors: string[] = [];
  return {
    game: {
      user: currentUser,
      users: { activeGM: currentUser },
      actors,
    },
    ui: { notifications: { error: (message: string) => errors.push(message) } },
    errors,
  };
}

function hpAfter(value: number): ConditionGroup {
  return {
    mode: 'ALL',
    conditions: [{
      left: { type: 'after-path', path: 'system.attributes.hp.value' },
      operator: 'lte',
      right: { type: 'literal', value },
    }],
  };
}

describe('trigger schema and watched path evaluator', () => {
  test('filters malformed triggers before they can enter a store', () => {
    const malformed = trigger('bad', [''], {
      event: { type: 'documentUpdate', documentType: 'Actor', watchedPaths: ['system.hp'] },
    });
    malformed.actions = [{ type: 'macro', macroUuid: '' }];
    const parsed = parseTriggerDefinition(malformed);
    expect(parsed.success).toBeFalse();
    const store = parseTriggerStore({ schemaVersion: 1, triggers: [malformed, trigger('ok')] });
    expect(store.data.triggers.map((entry) => entry.id)).toEqual(['ok']);
    expect(store.issues.length).toBeGreaterThan(0);
  });

  test('matches exact, dotted parent, and nested child updates while ignoring unrelated paths', () => {
    expect(watchedPathsMatch(['system.attributes.hp'], { system: { attributes: { hp: { value: 4 } } } })).toBeTrue();
    expect(watchedPathsMatch(['system.attributes.hp.value'], { system: { attributes: { hp: 4 } } })).toBeTrue();
    expect(watchedPathsMatch(['system.attributes.hp.value'], { 'system.attributes.ac.value': 12 })).toBeFalse();
    expect(watchedPathsMatch(['system.attributes.hp.value'], { 'system.attributes.hp.value': 4 })).toBeTrue();
    expect(watchedPathsMatch(['system.attributes.hp.value'], { system: { attributes: { ac: { value: 12 } } } })).toBeFalse();
    expect(watchedPathsMatch(['system.attributes.hp.value'], { system: { attributes: { hp: { temp: 3 } } } })).toBeFalse();
    // dnd5e 6.0.6 writes this Actor flag when a linked token moves.
    expect(watchedPathsMatch(['system.attributes.hp.value'], { flags: { dnd5e: { lastMovedToken: 'Scene.s.Token.t' } } })).toBeFalse();
    expect(watchedPathsMatch(['system.attributes.hp.value'], { 'flags.dnd5e.lastMovedToken': 'Scene.s.Token.t' })).toBeFalse();
    expect(watchedPathsMatch(['flags.dnd5e.lastMovedToken'], { 'flags.dnd5e.lastMovedToken': 'Scene.s.Token.t' })).toBeTrue();
  });

  test('selects Actor and Combat triggers without mixing watched paths or conditions', () => {
    const hp = trigger('hp', ['macro'], { conditions: hpAfter(5) });
    const turn = trigger('turn', ['macro'], {
      event: { type: 'combatTurnStart', documentType: 'Actor' },
      conditions: hpAfter(5),
    });
    const before = { system: { attributes: { hp: { value: 10 } } } };
    const after = { system: { attributes: { hp: { value: 5 } } } };
    expect(triggerMatchesEvent(hp, { type: 'documentUpdate', documentType: 'Actor' }, before, after, { 'flags.dnd5e.lastMovedToken': 'Token.t' })).toBeFalse();
    expect(triggerMatchesEvent(hp, { type: 'documentUpdate', documentType: 'Actor' }, before, after, { 'system.attributes.hp.value': 5 })).toBeTrue();
    expect(triggerMatchesEvent(turn, { type: 'combatTurnStart', documentType: 'Actor' }, before, after)).toBeTrue();
    expect(triggerMatchesEvent(turn, { type: 'combatTurnEnd', documentType: 'Actor' }, before, after)).toBeFalse();
  });

  test('evaluates ALL/ANY and all comparison operators over before, after, and literal operands', () => {
    const before = { value: 2, text: 'a' };
    const after = { value: 5, text: 'b' };
    expect(evaluateCondition({ left: { type: 'after-path', path: 'value' }, operator: 'eq', right: { type: 'literal', value: 5 } }, before, after)).toBeTrue();
    expect(evaluateCondition({ left: { type: 'before-path', path: 'value' }, operator: 'ne', right: { type: 'after-path', path: 'value' } }, before, after)).toBeTrue();
    expect(evaluateCondition({ left: { type: 'after-path', path: 'value' }, operator: 'gt', right: { type: 'literal', value: 2 } }, before, after)).toBeTrue();
    expect(evaluateCondition({ left: { type: 'after-path', path: 'value' }, operator: 'gte', right: { type: 'literal', value: 5 } }, before, after)).toBeTrue();
    expect(evaluateCondition({ left: { type: 'before-path', path: 'value' }, operator: 'lt', right: { type: 'literal', value: 5 } }, before, after)).toBeTrue();
    expect(evaluateCondition({ left: { type: 'before-path', path: 'value' }, operator: 'lte', right: { type: 'literal', value: 2 } }, before, after)).toBeTrue();
    const all: ConditionGroup = { mode: 'ALL', conditions: [
      { left: { type: 'after-path', path: 'value' }, operator: 'gt', right: { type: 'literal', value: 1 } },
      { left: { type: 'after-path', path: 'text' }, operator: 'eq', right: { type: 'literal', value: 'b' } },
    ] };
    expect(evaluateConditionGroup(all, before, after)).toBeTrue();
    expect(evaluateConditionGroup({ mode: 'ANY', conditions: [
      { left: { type: 'after-path', path: 'value' }, operator: 'lt', right: { type: 'literal', value: 1 } },
      { left: { type: 'after-path', path: 'text' }, operator: 'eq', right: { type: 'literal', value: 'b' } },
    ] }, before, after)).toBeTrue();
    expect(evaluateConditionGroup({ mode: 'ALL', conditions: [{ left: { type: 'before-path', path: 'value' }, operator: 'eq', right: { type: 'literal', value: 1 } }] }, undefined, after)).toBeFalse();
  });
});

describe('Actor documentUpdate runtime', () => {
  const runtimes: TriggerEngineRuntime[] = [];
  afterEach(async () => { for (const runtime of runtimes.splice(0)) await runtime.stop(); });

  test('unsubscribe skips a snapshotted Actor listener that has not started', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor(10);
    const runtime = new TriggerEngineRuntime({ globals: globalsFor(gm, [target]), storage: new MemoryTriggerStorage() });
    runtimes.push(runtime);
    await runtime.start();
    let firstStarted!: () => void;
    let releaseFirst!: () => void;
    const started = new Promise<void>((resolve) => { firstStarted = resolve; });
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const calls: string[] = [];
    runtime.subscribe(async () => { calls.push('first'); firstStarted(); await gate; });
    const unsubscribe = runtime.subscribe(() => { calls.push('removed'); });
    runtime.subscribe(() => { calls.push('third'); });
    target.set('system.attributes.hp.value', 9);
    const delivery = runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 9 });
    await started;
    unsubscribe();
    releaseFirst();
    await delivery;
    expect(calls).toEqual(['first', 'third']);
  });

  test('captures native revision before queued subscriber delivery', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target: any = actor(10);
    target._stats = { modifiedTime: 100 };
    const runtime = new TriggerEngineRuntime({ globals: globalsFor(gm, [target]),
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [] }) });
    runtimes.push(runtime);
    await runtime.start();
    const seen: Array<{ revision: number | undefined; before: number; after: number }> = [];
    runtime.subscribe((context) => { if (context.event.type === 'documentUpdate') seen.push({
      revision: context.capturedModifiedTime,
      before: (context.before as any).system.attributes.hp.value,
      after: (context.after as any).system.attributes.hp.value,
    }); });
    target.set('system.attributes.hp.value', 0);
    const first = runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 0 });
    target._stats.modifiedTime = 101;
    target.set('system.attributes.hp.value', 5);
    const second = runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 5 });
    target._stats.modifiedTime = 102;
    await Promise.all([first, second]);
    expect(seen).toEqual([
      { revision: 100, before: 10, after: 0 },
      { revision: 101, before: 0, after: 5 },
    ]);
  });

  test('captures prepared HP before yielding while retaining nullable source maxima', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target: any = actor(10);
    target.system = { attributes: { hp: { value: 10, max: 20 } } };
    const original = target.toObject.bind(target);
    target.toObject = () => { const source = original(true); source.system.attributes.hp.max = null; return source; };
    const runtime = new TriggerEngineRuntime({ globals: globalsFor(gm, [target]), storage: new MemoryTriggerStorage() });
    runtimes.push(runtime);
    await runtime.start();
    const seen: any[] = [];
    runtime.subscribe((context: any) => { if (context.preparedHp) context.preparedHp.after.max = 999; });
    runtime.subscribe((context: any) => { seen.push({ prepared: context.preparedHp,
      sourceBeforeMax: context.before.system.attributes.hp.max, sourceAfterMax: context.after.system.attributes.hp.max }); });
    target.set('system.attributes.hp.value', 0); target.system.attributes.hp.value = 0;
    const down = runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 0 });
    target.set('system.attributes.hp.value', 5); target.system.attributes.hp = { value: 5, max: 30 };
    const up = runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 5 });
    target.system.attributes.hp = { value: 7, max: 99 };
    await Promise.all([down, up]);
    expect(seen).toEqual([
      { prepared: { before: { value: 10, max: 20 }, after: { value: 0, max: 20 } }, sourceBeforeMax: null, sourceAfterMax: null },
      { prepared: { before: { value: 0, max: 20 }, after: { value: 5, max: 30 } }, sourceBeforeMax: null, sourceAfterMax: null },
    ]);
  });

  test('refreshes prepared maxima after embedded changes without replacing a pending HP before snapshot', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target: any = actor(10);
    target.system = { attributes: { hp: { value: 10, max: 20 } } };
    const original = target.toObject.bind(target);
    target.toObject = () => { const source = original(true); source.system.attributes.hp.max = null; return source; };
    const globals = globalsFor(gm, [target]);
    const handlers = new Map<string, any>();
    globals.Hooks = { on: (name: string, fn: any) => { handlers.set(name, fn); return name; }, off() {} };
    const runtime = new TriggerEngineRuntime({ globals, storage: new MemoryTriggerStorage() });
    runtimes.push(runtime);
    await runtime.start();
    const seen: any[] = [];
    runtime.subscribe((context: any) => { seen.push(context.preparedHp); });
    target.system.attributes.hp.max = 30;
    handlers.get('updateItem')?.({ parent: target });
    target.set('system.attributes.hp.value', 0); target.system.attributes.hp = { value: 0, max: 40 };
    handlers.get('updateItem')?.({ parent: target });
    await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 0 });
    expect(seen).toEqual([{ before: { value: 10, max: 30 }, after: { value: 0, max: 40 } }]);
  });

  test('uses ready shadow snapshots, ignores unrelated and disabled updates, and carries consecutive before/after values', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor(10);
    const globals = globalsFor(gm, [target]);
    const contexts: any[] = [];
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [
        trigger('active', ['m'], { conditions: hpAfter(8) }),
        trigger('disabled', ['d'], { enabled: false }),
      ] }),
      macroResolver: async () => ({ execute: ({ triggerContext }: any) => { contexts.push(triggerContext); } }),
    });
    runtimes.push(runtime);
    await runtime.start();
    target.set('system.attributes.ac.value', 12);
    expect((await runtime.handleDocumentUpdate(target, { system: { attributes: { ac: { value: 12 } } } })).results).toHaveLength(0);
    expect((await runtime.handleDocumentUpdate(target, { 'flags.dnd5e.lastMovedToken': 'Scene.s.Token.t' })).results).toHaveLength(0);
    target.set('system.attributes.hp.value', 6);
    expect((await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 6 })).results.map((entry) => entry.status)).toEqual(['executed']);
    target.set('system.attributes.hp.value', 4);
    expect((await runtime.handleDocumentUpdate(target, { system: { attributes: { hp: { value: 4 } } } })).results.map((entry) => entry.status)).toEqual(['executed']);
    expect(contexts.map((context) => [context.before.system.attributes.hp.value, context.after.system.attributes.hp.value])).toEqual([[10, 6], [6, 4]]);
    expect(target.toObjectCalls.every(Boolean)).toBeTrue();
  });

  test('runs macro actions sequentially with the approved triggerContext shape', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor(10);
    const globals = globalsFor(gm, [target]);
    const calls: string[] = [];
    const contexts: any[] = [];
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('ordered', ['first', 'second'])] }),
      macroResolver: async (uuid) => ({ execute: async ({ triggerContext }: any) => { calls.push(`${uuid}:start`); contexts.push(triggerContext); await Promise.resolve(); calls.push(`${uuid}:end`); } }),
    });
    runtimes.push(runtime);
    await runtime.start();
    target.set('system.attributes.hp.value', 9);
    const report = await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 9 }, { source: 'test' }, 'gm');
    expect(report.results[0]?.status).toBe('executed');
    expect(calls).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    expect(contexts[0]).toMatchObject({
      triggerId: 'ordered', triggerName: 'ordered', event: { type: 'documentUpdate', documentType: 'Actor' },
      document: target, documentUuid: 'Actor.test', changes: { 'system.attributes.hp.value': 9 }, userId: 'gm',
    });
    expect(contexts[0]).toHaveProperty('timestamp');
    expect(contexts[0]).not.toHaveProperty('trigger');
    expect(contexts[0]).not.toHaveProperty('changed');
    expect(contexts[0]).not.toHaveProperty('options');
  });

  test('isolates action failure, logs and notifies GM, then executes later matching triggers', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor();
    const globals = globalsFor(gm, [target]);
    const logged: unknown[] = [];
    const completed: string[] = [];
    const runtime = new TriggerEngineRuntime({
      globals,
      logger: { error: (...args: any[]) => logged.push(args), warn: () => {} },
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('fails', ['bad']), trigger('survives', ['good'])] }),
      macroResolver: async (uuid) => ({ execute: () => { if (uuid === 'bad') throw new Error('boom'); completed.push(uuid); } }),
    });
    runtimes.push(runtime);
    await runtime.start();
    target.set('system.attributes.hp.value', 9);
    const report = await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 9 });
    expect(report.results.map((entry) => entry.status)).toEqual(['failed', 'executed']);
    expect(completed).toEqual(['good']);
    expect(logged.length).toBeGreaterThan(0);
    expect(globals.errors).toEqual(['Trigger "fails" failed: Error: boom']);
  });

  test('suppresses causally recursive updates while refreshing the shadow snapshot', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor(1);
    const globals = globalsFor(gm, [target]);
    let nestedReport: any;
    const contexts: any[] = [];
    let runtime: TriggerEngineRuntime;
    runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('recursive', ['loop'])] }),
      macroResolver: async () => ({ execute: async ({ triggerContext }: any) => {
        contexts.push(triggerContext);
        if (!nestedReport) {
          target.set('system.attributes.hp.value', 2);
          nestedReport = await triggerContext.updateDocument({ 'system.attributes.hp.value': 2 });
        }
      } }),
    });
    (target as any).update = async (changes: any, options: any = {}) => runtime.handleDocumentUpdate(target, changes, options, 'gm');
    runtimes.push(runtime);
    await runtime.start();
    target.set('system.attributes.hp.value', 1);
    const first = await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 1 });
    expect(first.results[0]?.status).toBe('executed');
    expect(nestedReport.results[0]?.status).toBe('skipped');
    target.set('system.attributes.hp.value', 3);
    await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 3 });
    expect(contexts.at(-1)?.before.system.attributes.hp.value).toBe(2);
  });

  test('does not mark an independent same-Actor update while a trigger Macro is waiting', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor(10);
    const globals = globalsFor(gm, [target]);
    const contexts: any[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    let runtime: TriggerEngineRuntime;
    runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('independent', ['macro'])] }),
      macroResolver: async () => ({ execute: async ({ triggerContext }: any) => {
        contexts.push(triggerContext);
        if (contexts.length === 1) {
          markFirstStarted();
          await firstGate;
        }
      } }),
    });
    (target as any).update = async (changes: any, options: any = {}) => {
      if (typeof changes['system.attributes.hp.value'] === 'number') target.set('system.attributes.hp.value', changes['system.attributes.hp.value']);
      return runtime.handleDocumentUpdate(target, changes, options, 'gm');
    };
    runtimes.push(runtime);
    await runtime.start();

    target.set('system.attributes.hp.value', 0);
    const first = runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 0 }, {}, 'player-1');
    await firstStarted;
    const independent = (target as any).update({ 'system.attributes.hp.value': 1 }, {});
    await Promise.resolve();
    expect(contexts).toHaveLength(1);
    releaseFirst();

    expect((await first).results[0]?.status).toBe('executed');
    expect((await independent).results[0]?.status).toBe('executed');
    expect(contexts.map((context) => [context.before.system.attributes.hp.value, context.after.system.attributes.hp.value]))
      .toEqual([[10, 0], [0, 1]]);
  });

  test('preserves causal ancestry so nested Trigger updates cannot loop back into ancestors', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor(10);
    const globals = globalsFor(gm, [target]);
    const calls: string[] = [];
    let nextHp = 1;
    let runtime: TriggerEngineRuntime;
    runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('A', ['A']), trigger('B', ['B'])] }),
      macroResolver: async (uuid) => ({ execute: async ({ triggerContext }: any) => {
        calls.push(uuid);
        nextHp += 1;
        await triggerContext.updateDocument({ 'system.attributes.hp.value': nextHp });
      } }),
    });
    (target as any).update = async (changes: any, options: any = {}) => {
      if (typeof changes['system.attributes.hp.value'] === 'number') target.set('system.attributes.hp.value', changes['system.attributes.hp.value']);
      return runtime.handleDocumentUpdate(target, changes, options, 'gm');
    };
    runtimes.push(runtime);
    await runtime.start();

    target.set('system.attributes.hp.value', 1);
    const report = await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 1 }, {}, 'player');

    expect(report.results.map((entry) => entry.status)).toEqual(['executed', 'executed']);
    expect(calls).toEqual(['A', 'B', 'B', 'A']);
    expect(calls.filter((entry) => entry === 'A')).toHaveLength(2);
    expect(calls.filter((entry) => entry === 'B')).toHaveLength(2);
  });

  test('queues independent updates on the same Actor instead of dropping them as recursion', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor(10);
    const globals = globalsFor(gm, [target]);
    const contexts: any[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('queued', ['macro'])] }),
      macroResolver: async () => ({ execute: async ({ triggerContext }: any) => {
        contexts.push(triggerContext);
        if (contexts.length === 1) {
          markFirstStarted();
          await firstGate;
        }
      } }),
    });
    runtimes.push(runtime);
    await runtime.start();
    target.set('system.attributes.hp.value', 0);
    const down = runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 0 }, {}, 'player-1');
    await firstStarted;
    target.set('system.attributes.hp.value', 1);
    const up = runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 1 }, {}, 'player-2');
    await Promise.resolve();
    expect(contexts).toHaveLength(1);
    releaseFirst();
    expect((await down).results[0]?.status).toBe('executed');
    expect((await up).results[0]?.status).toBe('executed');
    expect(contexts.map((context) => [context.before.system.attributes.hp.value, context.after.system.attributes.hp.value, context.userId]))
      .toEqual([[10, 0, 'player-1'], [0, 1, 'player-2']]);
  });

  test('runs only on the active GM identity', async () => {
    const active = { id: 'active', isGM: true, active: true };
    const other = { id: 'other', isGM: true, active: true };
    const target = actor();
    const globals = globalsFor(other, [target]);
    globals.game.users.activeGM = active;
    let executed = 0;
    const runtime = new TriggerEngineRuntime({
      globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('gm-only', ['macro'])] }),
      macroResolver: async () => ({ execute: () => { executed++; } }),
    });
    runtimes.push(runtime);
    await runtime.start();
    target.set('system.attributes.hp.value', 9);
    expect((await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 9 })).skippedReason).toBe('inactive-gm');
    expect(executed).toBe(0);
    globals.game.user = active;
    target.set('system.attributes.hp.value', 8);
    await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 8 });
    expect(executed).toBe(1);
    globals.game.users.activeGM = undefined;
    target.set('system.attributes.hp.value', 7);
    expect((await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 7 })).skippedReason).toBe('inactive-gm');
    expect(executed).toBe(1);
  });

  test('resolves only executable script Macros through Foundry UUID lookup', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor();
    const globals = globalsFor(gm, [target]);
    let executed = 0;
    globals.foundry = { utils: { fromUuid: async () => ({ documentName: 'Macro', type: 'script', canExecute: true, execute: () => { executed++; } }) } };
    const runtime = new TriggerEngineRuntime({ globals, storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('uuid', ['Macro.real'])] }), logger: { error: () => {}, warn: () => {} } });
    runtimes.push(runtime);
    await runtime.start();
    target.set('system.attributes.hp.value', 9);
    expect((await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 9 })).results[0]?.status).toBe('executed');
    expect(executed).toBe(1);
    globals.foundry.utils.fromUuid = async () => ({ documentName: 'Macro', type: 'chat', canExecute: true, execute: () => {} });
    target.set('system.attributes.hp.value', 8);
    expect((await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 8 })).results[0]?.status).toBe('failed');
  });

  test('stops event subscribers and macros when active GM changes during a subscriber', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor();
    const globals = globalsFor(gm, [target]);
    const calls: string[] = [];
    globals.Hooks = { callAll: () => calls.push('public-hook') };
    const runtime = new TriggerEngineRuntime({ globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('authority')] }),
      macroResolver: async () => ({ execute: () => calls.push('macro') }),
    });
    runtimes.push(runtime);
    await runtime.start();
    runtime.subscribe(async () => {
      calls.push('first');
      await Promise.resolve();
      globals.game.users.activeGM = { id: 'other', isGM: true, active: true };
    });
    runtime.subscribe(() => { calls.push('second'); });
    target.set('system.attributes.hp.value', 9);
    const report = await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 9 });
    expect(calls).toEqual(['first']);
    expect(report.skippedReason).toBe('inactive-gm');
  });

  test('rechecks active GM after asynchronous Macro resolution', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor();
    const globals = globalsFor(gm, [target]);
    let executions = 0;
    const runtime = new TriggerEngineRuntime({ globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('authority')] }),
      logger: { error() {}, warn() {} },
      macroResolver: async () => {
        await Promise.resolve();
        globals.game.users.activeGM = { id: 'other', isGM: true, active: true };
        return { execute: () => { executions++; } };
      },
    });
    runtimes.push(runtime);
    await runtime.start();
    target.set('system.attributes.hp.value', 9);
    const report = await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 9 });
    expect(executions).toBe(0);
    expect(report.results[0]?.status).toBe('failed');
    expect(String(report.results[0]?.error)).toMatch(/active GM/);
  });

  test('revokes the causal update helper and later actions after an in-flight GM handoff', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target: any = actor();
    const globals = globalsFor(gm, [target]);
    let updates = 0;
    let retainedContext: any;
    const calls: string[] = [];
    target.update = async () => { updates++; };
    const runtime = new TriggerEngineRuntime({ globals,
      storage: new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('authority', ['first', 'later'])] }),
      logger: { error() {}, warn() {} },
      macroResolver: async (uuid) => ({ execute: async ({ triggerContext }: any) => {
        calls.push(uuid);
        retainedContext = triggerContext;
        await Promise.resolve();
        globals.game.users.activeGM = { id: 'other', isGM: true, active: true };
      } }),
    });
    runtimes.push(runtime);
    await runtime.start();
    target.set('system.attributes.hp.value', 9);
    await runtime.handleDocumentUpdate(target, { 'system.attributes.hp.value': 9 });
    expect(calls).toEqual(['first']);
    await expect(retainedContext.updateDocument({ 'system.attributes.hp.value': 8 })).rejects.toThrow(/active GM/);
    expect(updates).toBe(0);
  });
});

describe('CRUD, persistence, and manager seams', () => {
  test('persists validated create/update/copy/enable-disable/delete operations through public API', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const storage = new MemoryTriggerStorage();
    const globals = globalsFor(gm);
    const runtime = new TriggerEngineRuntime({ globals, storage });
    await runtime.start();
    const api = createTriggerApi(() => runtime, () => runtime.isActiveGM());
    await api.create(trigger('one'));
    await api.update('one', { name: 'Updated' });
    const copy = await api.copy('one');
    await api.disable(copy.id);
    await api.enable(copy.id);
    await api.delete('one');
    expect(api.list().map((entry) => [entry.id, entry.name, entry.enabled])).toEqual([[copy.id, 'Updated (Copy)', true]]);
    expect(storage.raw().triggers).toEqual(api.list());
    await expect(api.create({ ...trigger('invalid'), event: { ...trigger('invalid').event, type: 'other' as any } })).rejects.toThrow(/Invalid trigger/);
    await runtime.stop();
  });

  test('world-setting broadcasts refresh each client cache before active-GM handoff', async () => {
    const gmA = { id: 'gm-a', isGM: true, active: true };
    const gmB = { id: 'gm-b', isGM: true, active: true };
    const storageA = new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('old')] });
    const storageB = new MemoryTriggerStorage({ schemaVersion: 1, triggers: [trigger('old')] });
    const runtimeA = new TriggerEngineRuntime({ globals: globalsFor(gmA), storage: storageA });
    const runtimeB = new TriggerEngineRuntime({ globals: globalsFor(gmB), storage: storageB });
    await runtimeA.start();
    await runtimeB.start();

    let onChangeA: ((value: unknown) => void) | undefined;
    let onChangeB: ((value: unknown) => void) | undefined;
    registerTriggerEngineSettings({ game: { settings: { register: (_scope: string, _key: string, config: any) => { onChangeA = config.onChange; } } } }, () => runtimeA);
    registerTriggerEngineSettings({ game: { settings: { register: (_scope: string, _key: string, config: any) => { onChangeB = config.onChange; } } } }, () => runtimeB);
    const nextStore = { schemaVersion: 1 as const, triggers: [trigger('new')] };
    onChangeA?.(nextStore);
    onChangeB?.(nextStore);
    expect(runtimeA.listTriggers().map((entry) => entry.id)).toEqual(['new']);
    expect(runtimeB.listTriggers().map((entry) => entry.id)).toEqual(['new']);

    await runtimeA.stop();
    await runtimeB.stop();
  });

  test('exposes GM-only ApplicationV2 manager actions and rejects player API access', () => {
    const gm = { id: 'gm', isGM: true, active: true };
    class ApplicationV2 { async render() {} }
    const globals = globalsFor(gm);
    globals.foundry = { applications: { api: { ApplicationV2 } } };
    const api = createTriggerApi(() => ({
      listTriggers: () => [], triggerStore: () => ({ schemaVersion: 1, triggers: [] }),
      createTrigger: async (value) => value, updateTrigger: async (_id, value) => value as TriggerDefinition,
      copyTrigger: async (id) => trigger(id), setTriggerEnabled: async (id, enabled) => trigger(id, [], { enabled }),
      deleteTrigger: async () => {}, reload: async () => ({ schemaVersion: 1, triggers: [] }),
    }), () => true);
    const Manager = createTriggerManagerApplicationClass(api, globals);
    expect(Manager.DEFAULT_OPTIONS.actions).toHaveProperty('create');
    expect(Manager.DEFAULT_OPTIONS.actions).toHaveProperty('edit');
    expect(Manager.DEFAULT_OPTIONS.actions).toHaveProperty('copy');
    expect(Manager.DEFAULT_OPTIONS.actions).toHaveProperty('toggle');
    expect(Manager.DEFAULT_OPTIONS.actions).toHaveProperty('delete');
    const playerApi = createTriggerApi(() => undefined, () => false);
    expect(() => playerApi.list()).toThrow(/active GMs/);
  });
});
