import { expect, test } from 'bun:test';
import {
  atBloodiedThreshold, bloodiedThreshold, bloodiedThresholdOverride, crossedBloodiedThreshold,
  isActorBloodied, isForcedBloodied, markBloodied, reconcileBloodiedMarkers, restoreAutomaticBloodied,
  setBloodiedThreshold,
} from '../src/bloodied-status.ts';
import type { BloodiedActor } from '../src/bloodied-status.ts';
import { MODULE_ID } from '../src/types.ts';
import type { NativeEffect } from '../src/types.ts';

interface EffectData {
  disabled?: boolean;
  statuses?: string[];
  flags?: Record<string, Record<string, unknown>>;
}

function setup() {
  const hp = { value: 80, max: 120, effectiveMax: 100, bloodied: 75 };
  const statuses = new Set<string>();
  const effects: NativeEffect[] = [];
  const submissions: object[] = [];
  const removed: string[] = [];
  let syncs = 0;

  const makeEffect = (id: string, initial: EffectData = {}) => {
    let data = initial;
    return {
      id,
      get active() { return !data.disabled; },
      get statuses() { return data.statuses; },
      getFlag: (scope: string, key: string) => data.flags?.[scope]?.[key],
      update: async (changes: object) => { data = { ...data, ...changes }; },
      delete: async () => undefined,
    };
  };
  const actor = {
    name: 'Boss',
    uuid: 'Actor.boss',
    system: { attributes: { hp } },
    items: [],
    statuses,
    effects,
    getFlag: () => undefined,
    setFlag: async () => undefined,
    updateBloodied: () => { syncs++; },
    createEmbeddedDocuments: async (_type, data) => {
      const docs = data.map(source => {
        submissions.push(source);
        return makeEffect(`test-${submissions.length}`, source);
      });
      effects.push(...docs);
      return docs;
    },
    deleteEmbeddedDocuments: async (_type, ids) => {
      removed.push(...ids);
      return ids.flatMap(id => {
        const index = effects.findIndex(effect => effect.id === id);
        return index < 0 ? [] : effects.splice(index, 1);
      });
    },
  } satisfies BloodiedActor;
  return { actor, effects, hp, makeEffect, removed, statuses, submissions, syncs: () => syncs };
}

test('uses the prepared threshold and effective maximum, with a single crossing per eligible episode', () => {
  const { actor, hp, statuses } = setup();
  expect(bloodiedThreshold(actor)).toBe(75);
  const below = { ...hp, value: 75 };
  expect(crossedBloodiedThreshold(hp, below, bloodiedThreshold(actor))).toBe(true);
  expect(crossedBloodiedThreshold(below, { ...below, value: 65 }, 75)).toBe(false);
  expect(crossedBloodiedThreshold(hp, { ...hp, value: 0 }, 75)).toBe(false);
  expect(crossedBloodiedThreshold({ ...hp, value: 0 }, below, 75)).toBe(false);
  expect(atBloodiedThreshold({ ...hp, value: 100 }, 100)).toBe(false);
  expect(isActorBloodied(actor)).toBe(false);
  statuses.add('bloodied');
  expect(isActorBloodied(actor)).toBe(true);
  hp.value = 0;
  expect(isActorBloodied(actor)).toBe(false);
});

test('a custom threshold uses a native override effect and refreshes the native marker', async () => {
  const { actor, effects, makeEffect, removed, submissions, syncs } = setup();
  const native = makeEffect('dnd5ebloodied000');
  effects.push(native);

  expect(await setBloodiedThreshold(actor, 150, 'Threshold')).toBe(false);
  expect(await setBloodiedThreshold(actor, 75, 'Threshold')).toBe(true);
  expect(submissions).toEqual([expect.objectContaining({
    name: 'Threshold',
    system: { changes: [{ key: 'system.attributes.hp.bloodied', type: 'override', value: 75 }] },
  })]);
  expect(bloodiedThresholdOverride(actor)).toBe(75);
  expect(await setBloodiedThreshold(actor, 60, 'Threshold')).toBe(true);
  expect(bloodiedThresholdOverride(actor)).toBe(60);
  expect(submissions).toHaveLength(1);

  expect(await setBloodiedThreshold(actor, undefined, 'Threshold')).toBe(true);
  expect(bloodiedThresholdOverride(actor)).toBeUndefined();
  expect(removed).toEqual(['test-1']);
  expect(effects).toEqual([native]);
  expect(syncs()).toBe(3);
});

test('a confirmed marker clears after healing while forced and native markers keep their own lifetimes', async () => {
  const { actor, effects, hp, makeEffect, removed, statuses, submissions, syncs } = setup();
  expect(await markBloodied(actor, 'confirmed', 'Bloodied')).toBe(false);
  hp.value = 75;
  expect(await markBloodied(actor, 'confirmed', 'Bloodied')).toBe(true);
  expect(await markBloodied(actor, 'confirmed', 'Bloodied')).toBe(false);
  expect(await reconcileBloodiedMarkers(actor)).toBe(false);

  const native = makeEffect('dnd5ebloodied000', { statuses: ['bloodied'] });
  effects.push(native);
  statuses.add('bloodied');
  expect(await markBloodied(actor, 'forced', 'Forced Bloodied')).toBe(true);
  expect(submissions).toEqual(['confirmed', 'forced'].map(source => expect.objectContaining({
    statuses: ['bloodied'],
    flags: expect.objectContaining({ [MODULE_ID]: { bloodiedStatusSource: source } }),
  })));
  hp.value = 76;
  expect(await reconcileBloodiedMarkers(actor)).toBe(true);
  expect(isForcedBloodied(actor)).toBe(true);
  expect(await reconcileBloodiedMarkers(actor, native.id)).toBe(true);
  expect(isForcedBloodied(actor)).toBe(true);
  expect(await restoreAutomaticBloodied(actor)).toBe(true);
  expect(removed).toEqual(['test-1', native.id, 'test-2']);
  expect(effects).toEqual([]);
  expect(syncs()).toBe(1);
});

test('saving a lower threshold immediately retires an expired confirmation marker', async () => {
  const { actor, hp, effects, removed } = setup();
  hp.value = 60;
  expect(await markBloodied(actor, 'confirmed', 'Bloodied')).toBe(true);
  hp.bloodied = 50;
  expect(await setBloodiedThreshold(actor, 50, 'Threshold')).toBe(true);
  expect(removed).toEqual(['test-1']);
  expect(effects.map(effect => effect.id)).toEqual(['test-2']);
});
