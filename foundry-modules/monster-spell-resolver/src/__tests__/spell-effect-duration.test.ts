import { expect, test } from 'bun:test';
import { planSpellEffectDuration } from '../spell-effect-duration';

const override = { value: '24', units: 'hour', override: true, concentration: false } as const;
function source() {
  return {
    _stats: { compendiumSource: 'Compendium.dnd-players-handbook.spells.Item.phbsplDisguiseSe' },
    system: { identifier: 'disguise-self', duration: { value: '1', units: 'hour' }, activities: {
      utility: { type: 'utility', effects: [{ _id: 'SrIb7dbaZs5F4zi9' }, { _id: 'ShortEffect00001' }] },
    } },
    effects: [
      { _id: 'SrIb7dbaZs5F4zi9', type: 'base', transfer: false, description: '<p>Complete source rule</p>', duration: { value: 3600, units: 'seconds', expiry: 'turnStart', expired: false }, flags: { dnd5e: {} } },
      { _id: 'ShortEffect00001', type: 'base', transfer: false, duration: { value: 60, units: 'seconds', expiry: 'turnEnd' } },
      { _id: 'OtherEffect00001', type: 'base', transfer: false, duration: { value: 3600, units: 'seconds' } },
      { _id: 'EnchantEffect001', type: 'enchantment', transfer: true, duration: { value: 3600, units: 'seconds' } },
    ],
  };
}

test('source-duration variant changes only a linked base effect matching the original Spell duration', () => {
  const original = source(), cache = structuredClone(original), before = structuredClone(original);
  const planned = planSpellEffectDuration(original, cache, override);
  expect(planned.changedEffectIds).toEqual(['SrIb7dbaZs5F4zi9']);
  const expected = structuredClone(original.effects); expected[0]!.duration.value = 86400;
  expect(planned.effects).toEqual(expected);
  expect(original).toEqual(before); expect(cache).toEqual(before);
  expect(planSpellEffectDuration(original, { ...cache, effects: planned.effects }, override).changedEffectIds).toEqual([]);
});

test.each([
  (data: any) => { data.effects[0].transfer = true; },
  (data: any) => { data.effects[0].type = 'enchantment'; },
  (data: any) => { data.effects[0].duration = { value: null, units: 'seconds' }; },
  (data: any) => { data.effects[0].duration = { value: 600, units: 'rounds' }; },
  (data: any) => { data.system.activities.utility.effects = [{ _id: 'ShortEffect00001' }]; },
  (data: any) => { data.system.duration.value = '@level'; },
])('does not guess independent, untimed, combat, transferred or unlinked effect durations %#', mutate => {
  const original = source(); mutate(original);
  const planned = planSpellEffectDuration(original, original, override);
  expect(planned.changedEffectIds).toEqual([]); expect(planned.effects).toEqual(original.effects);
});

test.each([
  (cache: any) => { cache.effects[0].duration.value = 7200; },
  (cache: any) => { cache.effects[0].duration.expiry = 'turnEnd'; },
  (cache: any) => { cache.effects[0].description = '<p>Changed source rule</p>'; },
  (cache: any) => { cache.effects.shift(); },
  (cache: any) => { cache.effects.push(structuredClone(cache.effects[0])); },
])('rejects changed duration/rules or ambiguous source effect identity %#', mutate => {
  const original = source(), cache = structuredClone(original); mutate(cache);
  expect(() => planSpellEffectDuration(original, cache, override)).toThrow();
});

test('ordinary spells with no source duration override retain every effect field', () => {
  const original = source();
  expect(planSpellEffectDuration(original, original, undefined)).toEqual({ effects: original.effects, changedEffectIds: [], unresolvedEffectIds: [] });
});


test('a linked independent effect with the same duration is retained for GM review', () => {
  const original = source();
  original.system.activities.utility.effects.push({ _id: 'OtherEffect00001' });
  const planned = planSpellEffectDuration(original, original, override);
  expect(planned.changedEffectIds).toEqual(['SrIb7dbaZs5F4zi9']);
  expect(planned.effects.find(effect => effect._id === 'OtherEffect00001').duration.value).toBe(3600);
  expect(planned.unresolvedEffectIds).toEqual(['OtherEffect00001']);
});

test('an unreviewed source with an equal linked timer is not silently promoted to inherited lifetime', () => {
  const original = source(); original._stats.compendiumSource = 'Compendium.custom.spells.Item.Independent00001';
  const planned = planSpellEffectDuration(original, original, override);
  expect(planned.changedEffectIds).toEqual([]); expect(planned.effects).toEqual(original.effects);
  expect(planned.unresolvedEffectIds).toEqual(['SrIb7dbaZs5F4zi9']);
});
