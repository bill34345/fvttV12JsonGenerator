import { beforeAll, expect, test } from 'bun:test';
import {
  loadPreparedWorkflowSource, mutateActivityGetterToLockedUpstream, mutateItemGetterToLockedUpstream,
  type PreparedWorkflowSource,
} from './helpers/real-workflow-source';
import { createRestoredWorkflowScenario } from './helpers/restored-workflow-item';

let prepared: PreparedWorkflowSource;
beforeAll(async () => { prepared = await loadPreparedWorkflowSource(); });

// Document boundary shims only. The tested Workflow accessors and native dnd5e
// association/snapshot methods are extracted from the hash-verified real source.
async function fixture(options: { version?: string; scaling?: number; legacy?: boolean; snapshot?: boolean;
  missing?: boolean; sourceText?: string; boundScaling?: number; saveToChatCard?: boolean } = {}) {
  const scaleCalls: Array<{ kind: string; input: number; amount: number }> = [];
  const flagCalls: string[] = [];
  const actor = { uuid: 'Actor.caster', getFlag: () => ({ items: ['actor-macro'] }) };
  const activityId = 'mainActivity0001';
  class ItemShim {
    data: any; parent: any; actor: any; id: string; uuid: string; scaling: number; system: any;
    constructor(data: any = {}, config: any = {}) {
      this.data = data; this.parent = this.actor = config.parent ?? actor;
      this.id = data._id ?? 'item'; this.uuid = `${this.actor.uuid}.Item.${this.id}`;
      this.scaling = data.scaling ?? 0;
      this.system = { activities: new Map() };
      this.system.activities.set(activityId, { id: activityId, uuid: `${this.uuid}.Activity.${activityId}`, item: this, actor: this.actor });
    }
    scaledClone(amount = 0) {
      scaleCalls.push({ kind: 'native', input: this.scaling, amount });
      return new ItemShim({ ...this.data, scaling: this.scaling + (amount ?? 0) }, { parent: this.actor });
    }
    clone(updates: any) {
      const amount = updates.flags.dnd5e.scaling;
      scaleCalls.push({ kind: 'legacy', input: this.scaling, amount });
      return new ItemShim({ ...this.data, scaling: this.scaling + amount }, { parent: this.actor });
    }
    getFlag(scope: string, key: string) {
      flagCalls.push(`${scope}.${key}`);
      return { items: ['item-macro'] };
    }
  }
  const item = new ItemShim();
  const activity = item.system.activities.get(activityId);
  const docs = new Map<string, any>();
  if (!options.snapshot && !options.missing) { docs.set(item.uuid, item); docs.set(activity.uuid, activity); }
  const boundItem = options.boundScaling === undefined ? undefined : new ItemShim({ scaling: options.boundScaling });
  const run = await createRestoredWorkflowScenario({ version: options.version ?? '6.0.2',
    activity: boundItem?.system.activities.get(activityId), sourceText: options.sourceText,
    saveToChatCard: options.saveToChatCard, itemByUuid: docs, actorByUuid: new Map([['caster', actor]]), itemImplementation: ItemShim,
  }, prepared);
  const flags = options.legacy ? { dnd5e: { item: { uuid: item.uuid, id: item.id }, activity: { uuid: activity.uuid, id: activityId }, scaling: options.scaling ?? 0 } } : {};
  const system = options.legacy ? {} : {
    item: { uuid: item.uuid, id: item.id }, activity: { uuid: activity.uuid, id: activityId }, scaling: options.scaling ?? 0,
    ...(options.snapshot ? { deltas: { deleted: [{ _id: item.id, name: 'Retained item snapshot' }] } } : {}),
  };
  const card = run.createNativeChatMessage({ system, flags, speaker: { actor: 'caster' } });
  run.workflow.chatCard = card;
  return { ...run, item, activity, actor, card, boundItem, scaleCalls, flagCalls };
}

test('restored dnd5e 6 system-only card resolves Item and executes actual OnUse macro access', async () => {
  const f = await fixture();
  expect(f.card.getFlag('dnd5e', 'item')).toBeUndefined();
  expect(f.workflow.item).toBe(f.item);
  expect(f.workflow.onUseMacros.items).toEqual(['item-macro', 'actor-macro']);
  expect(f.flagCalls).toEqual(['midi-qol.onUseMacroParts']);
  expect(f.errors).toEqual([]); expect(f.diagnostics).toEqual([]);
});

test('already-bound scaled action Item wins over a differently-scaled card association', async () => {
  const f = await fixture({ scaling: 3, boundScaling: 7 });
  expect(f.workflow.item).toBe(f.boundItem);
  expect(f.workflow.item.scaling).toBe(7);
  expect(f.uuidLookups).toEqual([]);
  expect(f.workflow.onUseMacros.items).toEqual(['item-macro', 'actor-macro']);
  expect(f.scaleCalls).toEqual([]);
});

for (const first of ['activity', 'actor', 'item'] as const) {
  test(`real accessors preserve system.scaling for ${first}-first restoration without applying it twice`, async () => {
    const f = await fixture({ scaling: 3 });
    void f.workflow[first];
    expect(f.workflow.item.scaling).toBe(3);
    expect(f.workflow.activity.item.scaling).toBe(3);
    expect(f.workflow.actor).toBe(f.actor);
    expect(f.workflow.onUseMacros.items).toEqual(['item-macro', 'actor-macro']);
    // Native helpers may each clone the original document; that is not cumulative
    // scaling. No legacy clone may run, nor may a native clone start from +3.
    expect(f.scaleCalls.length).toBeGreaterThan(0);
    expect(f.scaleCalls.every(call => call.kind === 'native' && call.input === 0 && call.amount === 3)).toBe(true);
    expect(f.item.scaling).toBe(0);
    expect(f.errors).toEqual([]);
  });
}

test('real native association restores a deleted/synthetic Item snapshot and its actor', async () => {
  const f = await fixture({ snapshot: true, scaling: 2 });
  expect(f.workflow.item.uuid).toBe(f.item.uuid);
  expect(f.workflow.item.data.name).toBe('Retained item snapshot');
  expect(f.workflow.item.scaling).toBe(2);
  expect(f.workflow.activity.item.scaling).toBe(2);
  expect(f.workflow.actor).toBe(f.actor);
  expect(f.workflow.onUseMacros.items).toEqual(['item-macro', 'actor-macro']);
  expect(f.errors).toEqual([]);
});

test('6.x legacy card and absent native method retain the original UUID fallback', async () => {
  const native = await fixture({ legacy: true });
  expect(native.workflow.item).toBe(native.item);
  expect(native.errors).toEqual([]);
  const fallback = await fixture({ legacy: true });
  fallback.card.getAssociatedItem = undefined;
  expect(fallback.workflow.item).toBe(fallback.item);
  expect(fallback.errors).toEqual([]);
});

test('5.x keeps its legacy item lookup and legacy activity scaling, without new native scaled calls', async () => {
  const f = await fixture({ version: '5.3.3', legacy: true, scaling: 2, boundScaling: 9 });
  f.card.getAssociatedItem = () => { throw new Error('5.x must not use the new native item branch'); };
  expect(f.workflow.item).toBe(f.item); // Original 5.x lookup, not bound Item.
  const activity = await fixture({ version: '5.3.3', legacy: true, scaling: 2 });
  expect(activity.workflow.activity.item.scaling).toBe(2);
  expect(activity.scaleCalls).toEqual([{ kind: 'legacy', input: 0, amount: 2 }]);
  expect(activity.workflow.item).toBe(activity.item);
});

test('cached Item remains authoritative and SaveToChatCard=false does not add a restore path', async () => {
  const f = await fixture();
  f.workflow.cacheItem(f.item);
  f.card.getAssociatedItem = () => { throw new Error('Cached item should not be resolved again'); };
  expect(f.workflow.item).toBe(f.item);
  const disabled = await fixture({ saveToChatCard: false });
  expect(disabled.workflow.item).toBeUndefined();
  expect(disabled.uuidLookups).toEqual([]);
});

test('genuinely missing Item retains the original diagnostic rather than fabricating a document', async () => {
  const f = await fixture({ missing: true });
  expect(f.workflow.item).toBeUndefined();
  expect(f.errors).toHaveLength(1);
  expect(f.errors[0]).toContain('Could not find item');
  expect(f.diagnostics).toHaveLength(1);
});

test('reverting only the item getter reproduces the real null/undefined.getFlag failure', async () => {
  const old = mutateItemGetterToLockedUpstream(prepared.sourceText, prepared.typescript);
  const f = await fixture({ sourceText: old });
  expect(() => f.workflow.onUseMacros).toThrow('getFlag');
  expect(f.errors[0]).toContain('itemUuid undefined');
});

test('reverting only activity restoration exposes local.4 access-order loss of system.scaling', async () => {
  const old = mutateActivityGetterToLockedUpstream(prepared.sourceText, prepared.typescript);
  const f = await fixture({ sourceText: old, scaling: 3 });
  void f.workflow.actor;
  expect(f.workflow.item.scaling).toBe(0);
  expect(f.workflow.activity.item.scaling).toBe(0);
  expect(f.scaleCalls).toEqual([]);
});
