import { expect, test } from 'bun:test';
import { createTriggerApi } from '../src/api.ts';
import { createTriggerManagerApplicationClass } from '../src/manager.ts';
import { TriggerEngineRuntime } from '../src/runtime.ts';
import { FoundryTriggerStorage, type TriggerStorage } from '../src/storage.ts';
import type { TriggerDefinition, TriggerStore } from '../src/types.ts';

function trigger(id: string): TriggerDefinition {
  return {
    id, name: id, enabled: true,
    event: { type: 'documentUpdate', documentType: 'Actor', watchedPaths: ['system.attributes.hp.value'] },
    conditions: null,
    actions: [{ type: 'macro', macroUuid: 'Macro.test' }],
  };
}

function world(rawValue: unknown) {
  let raw = structuredClone(rawValue);
  let sets = 0;
  const gm = { id: 'gm', isGM: true, active: true };
  const game: any = {
    user: gm, users: { activeGM: gm },
    settings: {
      get: (_module: string, key: string) => key === 'triggers' ? structuredClone(raw) : undefined,
      set: async (_module: string, key: string, value: unknown) => {
        if (key !== 'triggers') return;
        sets += 1;
        raw = structuredClone(value);
      },
    },
  };
  return { game, gm, raw: () => raw, sets: () => sets };
}

test('future schema, invalid entries and unknown stored fields remain readable but cannot be overwritten', async () => {
  for (const original of [
    { schemaVersion: 2, triggers: [trigger('old')] },
    { schemaVersion: 1, triggers: [trigger('good'), { id: 'bad' }] },
    { schemaVersion: 1, triggers: [{ ...trigger('good'), futureRule: { enabled: true } }] },
    { schemaVersion: 1, triggers: [{ ...trigger('good'), event: { ...trigger('good').event, futurePath: 'system.hp' } }] },
    { schemaVersion: 1, triggers: [{ ...trigger('good'), actions: [{ type: 'macro', macroUuid: 'Macro.test', futureAction: true }] }] },
    { schemaVersion: 1, triggers: [trigger('good')], futureRoot: true },
  ]) {
    const current = world(original);
    const storage = new FoundryTriggerStorage(current.game);
    const warnings: string[] = [];
    const runtime = new TriggerEngineRuntime({ globals: {
      game: current.game, ui: { notifications: { warn: (message: string) => warnings.push(message) } },
    }, storage });
    await runtime.start();
    expect(runtime.invalidIssues.length).toBeGreaterThan(0);
    expect(warnings).toHaveLength(1);
    const api = createTriggerApi(() => runtime, () => runtime.isActiveGM());
    await expect(api.create(trigger('new'))).rejects.toThrow(/existing|unsupported|invalid/i);
    expect(warnings).toHaveLength(1);
    expect(current.sets()).toBe(0);
    expect(current.raw()).toEqual(original);
    if (original.schemaVersion === 1) expect(api.list().map((item) => item.id)).toContain('good');
    await runtime.stop();
  }
});

test('JSON keys inside a valid literal are data, not unknown schema fields', async () => {
  const existing = trigger('literal');
  existing.conditions = {
    mode: 'ALL', conditions: [{
      left: { type: 'literal', value: { futureRule: { nested: true } } },
      operator: 'eq',
      right: { type: 'literal', value: { futureRule: { nested: true } } },
    }],
  };
  const current = world({ schemaVersion: 1, triggers: [existing] });
  const runtime = new TriggerEngineRuntime({ globals: { game: current.game }, storage: new FoundryTriggerStorage(current.game) });
  await runtime.start();
  const api = createTriggerApi(() => runtime, () => runtime.isActiveGM());
  await api.create(trigger('new'));
  expect(current.sets()).toBe(1);
  expect((current.raw() as TriggerStore).triggers.map((item) => item.id)).toEqual(['literal', 'new']);
  await runtime.stop();
});

test('legacy operand aliases remain readable, while conflicting aliases cannot be overwritten', async () => {
  const base = trigger('legacy');
  const left = { type: 'after-path', path: 'system.attributes.hp.value' };
  const right = { type: 'literal', value: 0 };
  const legacy: any = {
    ...base,
    conditions: { mode: 'ALL', conditions: [{ operands: [left, right], op: 'eq' }] },
  };
  const valid = world({ schemaVersion: 1, triggers: [legacy] });
  const runtime = new TriggerEngineRuntime({ globals: { game: valid.game }, storage: new FoundryTriggerStorage(valid.game) });
  await runtime.start();
  expect(runtime.listTriggers()[0]?.conditions?.conditions[0]?.operator).toBe('eq');
  await runtime.createTrigger(trigger('new'));
  expect(valid.sets()).toBe(1);
  await runtime.stop();

  const conflict: any = structuredClone(legacy);
  conflict.conditions.conditions[0].operator = 'ne';
  const unsafe = world({ schemaVersion: 1, triggers: [conflict] });
  const protectedRuntime = new TriggerEngineRuntime({ globals: { game: unsafe.game }, storage: new FoundryTriggerStorage(unsafe.game) });
  await protectedRuntime.start();
  expect(protectedRuntime.listTriggers()).toHaveLength(1);
  await expect(protectedRuntime.createTrigger(trigger('new'))).rejects.toThrow(/unsupported or invalid/);
  expect(unsafe.sets()).toBe(0);
  expect(unsafe.raw()).toEqual({ schemaVersion: 1, triggers: [conflict] });
  await protectedRuntime.stop();
});

test('equivalent canonical and legacy operands ignore object key order, including nested literal data', async () => {
  for (const [canonicalValue, aliasValue] of [
    [0, 0],
    [{ first: 1, nested: { a: true, b: ['x', 'y'] } }, { nested: { b: ['x', 'y'], a: true }, first: 1 }],
  ] as const) {
    const left = { type: 'after-path', path: 'system.attributes.hp.value' };
    const right = { type: 'literal', value: canonicalValue };
    const source: any = trigger('legacy-both');
    source.conditions = { mode: 'ALL', conditions: [{
      left, right, operator: 'eq',
      operands: [
        { path: 'system.attributes.hp.value', type: 'after-path' },
        { value: aliasValue, type: 'literal' },
      ],
      op: 'eq',
    }] };
    const current = world({ schemaVersion: 1, triggers: [source] });
    const runtime = new TriggerEngineRuntime({ globals: { game: current.game }, storage: new FoundryTriggerStorage(current.game) });
    await runtime.start();
    expect(runtime.invalidIssues).toEqual([]);
    await runtime.createTrigger(trigger('new'));
    expect(current.sets()).toBe(1);
    expect((current.raw() as TriggerStore).triggers.map((item) => item.id)).toEqual(['legacy-both', 'new']);
    await runtime.stop();
  }
});

test('legacy operands with reordered array values are a real conflict and preserve the original', async () => {
  const source: any = trigger('array-conflict');
  source.conditions = { mode: 'ALL', conditions: [{
    left: { type: 'after-path', path: 'system.attributes.hp.value' },
    right: { type: 'literal', value: [1, 2] },
    operator: 'eq',
    operands: [
      { type: 'after-path', path: 'system.attributes.hp.value' },
      { type: 'literal', value: [2, 1] },
    ],
  }] };
  const original = { schemaVersion: 1, triggers: [source] };
  const current = world(original);
  const runtime = new TriggerEngineRuntime({ globals: { game: current.game }, storage: new FoundryTriggerStorage(current.game) });
  await runtime.start();
  await expect(runtime.createTrigger(trigger('new'))).rejects.toThrow(/unsupported or invalid/);
  expect(current.sets()).toBe(0);
  expect(current.raw()).toEqual(original);
  await runtime.stop();
});

test('same-client concurrent creates serialize and build from the committed store', async () => {
  let stored: TriggerStore = { schemaVersion: 1, triggers: [] };
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let writes = 0;
  const storage: TriggerStorage = {
    load: () => structuredClone(stored),
    save: async (next) => {
      writes += 1;
      if (writes === 1) await firstGate;
      stored = structuredClone(next);
    },
  };
  const current = world(stored);
  const runtime = new TriggerEngineRuntime({ globals: { game: current.game }, storage });
  await runtime.start();
  const first = runtime.createTrigger(trigger('first'));
  const second = runtime.createTrigger(trigger('second'));
  releaseFirst();
  await Promise.all([first, second]);
  expect(stored.triggers.map((item) => item.id)).toEqual(['first', 'second']);
  expect(runtime.listTriggers().map((item) => item.id)).toEqual(['first', 'second']);
  await runtime.stop();
});

test('failed mutation releases its queue, and a waiting mutation rechecks active GM', async () => {
  let stored: TriggerStore = { schemaVersion: 1, triggers: [] };
  let fail = true;
  let writes = 0;
  const storage: TriggerStorage = {
    load: () => structuredClone(stored),
    save: async (next) => {
      writes += 1;
      if (fail) { fail = false; throw new Error('settings failure'); }
      stored = structuredClone(next);
    },
  };
  const current = world(stored);
  const runtime = new TriggerEngineRuntime({ globals: { game: current.game }, storage });
  await runtime.start();
  await expect(runtime.createTrigger(trigger('first'))).rejects.toThrow('settings failure');
  expect(runtime.listTriggers()).toEqual([]);
  await runtime.createTrigger(trigger('second'));
  expect(stored.triggers.map((item) => item.id)).toEqual(['second']);
  expect(writes).toBe(2);

  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const firstSaveEntered = new Promise<void>((resolve) => { entered = resolve; });
  storage.save = async (next) => { entered(); await gate; stored = structuredClone(next); };
  const underway = runtime.createTrigger(trigger('third'));
  await firstSaveEntered;
  const waiting = runtime.createTrigger(trigger('fourth'));
  current.gm.active = false;
  release();
  await underway;
  await expect(waiting).rejects.toThrow(/active GMs/);
  expect(stored.triggers.map((item) => item.id)).toEqual(['second', 'third']);
  expect(stored.triggers.some((item) => item.id === 'fourth')).toBeFalse();
  await runtime.stop();
});

test('manager save and row-action failures notify without discarding editor input', async () => {
  const errors: string[] = [];
  class ApplicationV2 { async render() {} }
  const globals: any = {
    foundry: { applications: { api: { ApplicationV2 } } },
    ui: { notifications: { error: (message: string) => errors.push(message) } },
  };
  const api: any = {
    list: () => [trigger('old')],
    create: async () => { throw new Error('protected world setting'); },
    update: async () => { throw new Error('protected world setting'); },
    copy: async () => { throw new Error('copy blocked'); },
    setEnabled: async () => { throw new Error('toggle blocked'); },
    delete: async () => { throw new Error('delete blocked'); },
  };
  const Manager = createTriggerManagerApplicationClass(api, globals);
  const manager = new Manager();
  const edited = JSON.stringify(trigger('new'), null, 2);
  await Manager.onSubmit.call(manager, null, null, { object: { definition: edited } });
  expect(manager.editorJson).toBe(edited);
  for (const action of ['copy', 'toggle', 'delete']) {
    await Manager.DEFAULT_OPTIONS.actions[action].call(manager, null, { dataset: { triggerId: 'old' } });
  }
  expect(errors).toHaveLength(4);
  expect(manager.editorJson).toBe(edited);
});
