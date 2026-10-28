import {expect, test} from 'bun:test';
import {prepareFoundryImportArtifact} from '../src/runtime';
import {applyExhaustionTemplate, conditionEffectGroups} from '../src/manualConditionEffects';

function source() {
  return {name: 'Effect carrier', type: 'npc', items: [{name: 'Printed attack', type: 'feat',
    effects: [
      {_id: 'manual', transfer: false, disabled: false, statuses: ['poisoned', 'paralyzed'], duration: {seconds: 3600},
        flags: {fvttJsonGenerator: {conditionLifecycle: {version: 1, mode: 'gm', sourceText: 'Only after this damage reduces the target to 0 HP.'}}}},
      {_id: 'ordinary', transfer: false, disabled: false, statuses: ['prone']},
    ], system: {activities: {
      roll: {_id: 'roll', type: 'utility', roll: {formula: '1d20+5'}, effects: []},
      damage: {_id: 'damage', type: 'damage', effects: [{_id: 'manual'}], damage: {parts: [{number: 1, denomination: 10, bonus: '3'}, {number: 2, denomination: 8}]}},
      save: {_id: 'save', type: 'save', effects: [{_id: 'ordinary', onSave: false}]},
    }},
  }]};
}

test('manual status import retains real effects/links and stops only their automatic Midi path', () => {
  const original = source(), before = structuredClone(original);
  const imported = prepareFoundryImportArtifact(original as any, {modules: {get: () => ({active: true, version: '14.0.11'})}} as any) as any;
  const item = imported.items[0];
  expect(original).toEqual(before);
  expect(item.effects).toHaveLength(2);
  expect(item.effects[0]).toMatchObject({disabled: false, transfer: false, statuses: ['poisoned', 'paralyzed'], duration: {seconds: 3600}, flags: {dae: {dontApply: true}}});
  expect(item.system.activities.damage).toMatchObject({effectConditionText: 'false', midiProperties: {autoCEEffects: 'none'}, effects: [{_id: 'manual'}]});
  expect(item.system.activities.damage.damage).toEqual(before.items[0]!.system.activities.damage.damage);
  expect(item.system.activities.roll).toEqual(before.items[0]!.system.activities.roll);
  expect(item.system.activities.save).toEqual(before.items[0]!.system.activities.save);
  expect(item.effects[1]).toEqual(before.items[0]!.effects[1]);
});

test('core-only import keeps source status templates unchanged', () => {
  const original = source();
  expect(prepareFoundryImportArtifact(original as any, {modules: {get: () => ({active: false})}} as any)).toEqual(original as any);
});

test('mixed manual and ordinary effects on one Activity retain ordinary automatic settings', () => {
  const original: any = source(), activity = original.items[0].system.activities.damage;
  activity.effects.push({_id: 'ordinary'});
  activity.effectConditionText = '@target.attributes.hp.value > 0';
  activity.midiProperties = {autoCEEffects: 'itempri'};
  const result: any = prepareFoundryImportArtifact(original, {modules: {get: () => ({active: true, version: '14.0.11'})}} as any);
  expect(result.items[0].system.activities.damage).toEqual(activity);
  expect(result.items[0].effects[0].flags.dae.dontApply).toBe(true);
  expect(result.items[0].effects[1]).toEqual(original.items[0].effects[1]);
});

test('manual chat groups use the actual Activity links without duplicating the GM attack roll', () => {
  const raw = source().items[0]!;
  const item = {effects: new Map(raw.effects.map(effect => [effect._id, effect])),
    system: {activities: new Map(Object.entries(raw.system.activities))}};
  expect(conditionEffectGroups(item).map(group => [group.activity._id, group.effects.map(effect => effect._id)])).toEqual([
    ['damage', ['manual']],
  ]);
  expect(conditionEffectGroups(item, item.system.activities.get('damage'))[0]!.effects[0]).toBe(item.effects.get('manual'));
  expect(conditionEffectGroups(item, item.system.activities.get('roll'))).toEqual([]);
  expect(conditionEffectGroups(item, item.system.activities.get('save'))).toEqual([]);
});

test('an ordinary generated failed-save template is available on an unrolled Item card; unrelated effects are untouched', () => {
  const effect = {_id: 'frightened', flags: {fvttJsonGenerator: {conditionLifecycle: {version: 1, mode: 'native'}}}};
  const activity = {_id: 'save', type: 'save', effects: [{_id: effect._id, onSave: false}]};
  const item = {effects: new Map([[effect._id, effect]]), system: {activities: new Map([[activity._id, activity]])}};
  expect(conditionEffectGroups(item)).toEqual([{activity, effects: [effect]}]);
  expect(conditionEffectGroups(item, activity)).toEqual([]);
  delete (effect as any).flags;
  expect(conditionEffectGroups(item)).toEqual([]);
});

test('Exhaustion application increments the official Actor field and respects the native six-level cap', async () => {
  const updates: any[] = [];
  const actor = {isOwner: true, system: {attributes: {exhaustion: 2}}, update: async (patch: any) => {updates.push(patch);}};
  const environment = {game: {user: {isGM: true}}};
  await applyExhaustionTemplate({flags: {fvttJsonGenerator: {conditionLifecycle: {exhaustionLevels: 2}}}}, actor, environment);
  expect(updates).toEqual([{'system.attributes.exhaustion': 4}]);
  actor.system.attributes.exhaustion = 5;
  await applyExhaustionTemplate({flags: {fvttJsonGenerator: {conditionLifecycle: {exhaustionLevels: 2}}}}, actor, environment);
  expect(updates[1]).toEqual({'system.attributes.exhaustion': 6});
});

test('Exhaustion with no printed level asks at application time; cancellation does not change the Actor', async () => {
  let prompts = 0, updates = 0;
  const environment = {game: {user: {isGM: true}}, foundry: {applications: {api: {DialogV2: {prompt: async () => {prompts++; return null;}}}}}};
  const actor = {isOwner: true, system: {attributes: {exhaustion: 2}}, update: async () => {updates++;}};
  await applyExhaustionTemplate({flags: {fvttJsonGenerator: {conditionLifecycle: {mode: 'gm'}}}}, actor, environment);
  expect(prompts).toBe(1); expect(updates).toBe(0);
});
