import { describe, expect, test } from 'bun:test';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { assistedEncounterFixture } from '../../../../tests/helpers/forge-encounter';
import { readConditionInstance } from '@fvtt-json-generator/contracts/conditions';
import { createCompanionEffectData, findCompanionEffect, installCrystalbleedRuntime } from './battle-control.mjs';

const prepared = await prepareForgeEncounter(JSON.stringify(assistedEncounterFixture()));
const artifact = key => prepared.actors.find(actor => actor.key === key).artifact;

function effectDocument(data) {
  const source = structuredClone(data);
  return { ...source, statuses: new Set(source.statuses ?? []),
    toObject: () => structuredClone(source),
    async update(changes) { Object.assign(source, changes); Object.assign(this, changes); },
  };
}

function actorDocument(key, id) {
  const source = structuredClone(artifact(key));
  const actor = { ...source, id, uuid: `Actor.${id}`, effects: [],
    async createEmbeddedDocuments(kind, data) {
      expect(kind).toBe('ActiveEffect');
      const effects = data.map(effectDocument);
      this.effects.push(...effects);
      return effects;
    },
  };
  actor.system.traits.ci.value = new Set(actor.system.traits.ci.value);
  actor.items = source.items.map(item => ({ ...item, parent: actor, effects: item.effects.map(effectDocument) }));
  return actor;
}

function runtimeEnvironment() {
  const dragon = actorDocument('dragon', '1111111111111111');
  const crystal = actorDocument('crystal', '2222222222222222');
  // Same source markers as the imported creatures, so marker or name matching
  // alone would wrongly capture these existing documents.
  const oldDragon = actorDocument('dragon', '3333333333333333');
  const oldCrystal = actorDocument('crystal', '4444444444444444');
  const hooks = new Map();
  const env = {
    game: { user: { isGM: true }, version: '14.364', system: { id: 'dnd5e', version: '5.3.3' },
      time: { worldTime: 100 }, actors: [dragon, crystal, oldDragon, oldCrystal] },
    canvas: { ready: true, scene: { id: 'test-scene' }, tokens: { placeables: [] } },
    Hooks: { on(name, callback) { hooks.set(name, callback); return name; }, off(name) { hooks.delete(name); } },
    ui: { notifications: { info() {}, warn() {}, error() {} } },
    ChatMessage: { create() {} }, Combat: class {}, DialogV2: class {},
    CONFIG: { statusEffects: [], DND5E: { healingTypes: { healing: {}, temphp: {}, maximum: {} } } },
  };
  return { env, dragon, crystal, oldDragon, oldCrystal, hooks,
    options: { actors: { dragon: dragon.uuid, crystal: crystal.uuid }, showPanel: false } };
}

describe('reviewed Crystalbleed companion and current generated artifacts', () => {
  test('finds the generated custom dazed effect without accepting a different condition', () => {
    const salvo = artifact('dragon').items.find(item => item.name === '晶片齐射 (Shard Salvo)');
    expect(salvo.effects[0].statuses).toEqual(['fvtt-custom-conditions.dazed']);
    expect(findCompanionEffect(salvo, 'dazed')).toBe(salvo.effects[0]);
    expect(findCompanionEffect(salvo, 'stunned')).toBeUndefined();
    expect(findCompanionEffect({ effects: [{ statuses: ['other-module.dazed'] }] }, 'dazed')).toBeUndefined();
  });

  test('preserves native, legacy dazed and source behavior-state effect lookup', () => {
    for (const [key, effect] of [
      ['frightened', { statuses: ['frightened'] }],
      ['dazed', { statuses: new Set(['dazed']) }],
      ['ward-visible', { flags: { fvttJsonGenerator: { behaviorState: { stateId: 'ward-visible' } } } }],
    ]) expect(findCompanionEffect({ effects: { contents: [effect] } }, key)).toBe(effect);
  });

  test('materializes the generated dazed template as a fresh enabled condition and preserves its source', () => {
    const salvo = artifact('dragon').items.find(item => item.name === '晶片齐射 (Shard Salvo)');
    const template = findCompanionEffect(salvo, 'dazed');
    const before = JSON.stringify(template);
    const first = createCompanionEffectData(template, 'Actor.1111111111111111.Item.salvo', 100);
    const second = createCompanionEffectData(template, 'Actor.1111111111111111.Item.salvo', 100);
    const instance = readConditionInstance(first);
    expect(instance).toMatchObject({ conditionId: 'dazed', enabled: true, source: 'Actor.1111111111111111.Item.salvo', createdAt: 100 });
    expect(instance.template).toBeUndefined();
    expect(instance.instanceId).not.toBe('template-dazed');
    expect(readConditionInstance(second).instanceId).not.toBe(instance.instanceId);
    expect(first.statuses).toEqual(['fvtt-custom-conditions.dazed']);
    expect(first._id).toBeUndefined();
    expect(JSON.stringify(template)).toBe(before);
    const refresh = createCompanionEffectData(template, 'Actor.1111111111111111.Item.salvo', 101, first);
    expect(readConditionInstance(refresh).instanceId).toBe(instance.instanceId);
    expect(readConditionInstance(refresh).createdAt).toBe(101);
  });

  test('starts and applies ward hooks only to bound IDs even when old actors have the same name and markers', async () => {
    const batch = runtimeEnvironment();
    const oldBefore = JSON.stringify([batch.oldDragon, batch.oldCrystal], (key, value) => key === 'parent' ? undefined : value);
    const api = await installCrystalbleedRuntime(batch.env, batch.options);
    expect(api.isDragon(batch.dragon)).toBe(true);
    expect(api.isCrystal(batch.crystal)).toBe(true);
    expect(api.isDragon(batch.oldDragon)).toBe(false);
    expect(api.isCrystal(batch.oldCrystal)).toBe(false);
    expect(batch.dragon.effects).toHaveLength(1);
    for (const actor of [batch.dragon, batch.oldDragon]) {
      const summary = Object.assign([{ type: 'piercing', value: 40 }], { amount: 40, tempMax: 0 });
      batch.hooks.get('dnd5e.calculateDamage')(actor, summary);
      expect(summary.amount).toBe(actor === batch.dragon ? 20 : 40);
    }
    const move = batch.hooks.get('preUpdateToken');
    expect(move({ actor: batch.crystal, x: 0 }, { x: 100 })).toBe(false);
    expect(move({ actor: batch.oldCrystal, x: 0 }, { x: 100 })).toBeUndefined();
    expect(JSON.stringify([batch.oldDragon, batch.oldCrystal], (key, value) => key === 'parent' ? undefined : value)).toBe(oldBefore);
    api.stop();
    expect(batch.hooks.size).toBe(0);
    expect(batch.env.game.crystalbleedV14).toBeUndefined();
  });

  test('requires explicit bindings before installing hooks or changing any actor', async () => {
    const batch = runtimeEnvironment();
    await expect(installCrystalbleedRuntime(batch.env, { showPanel: false })).rejects.toThrow('缺少角色绑定');
    expect(batch.hooks.size).toBe(0);
    expect(batch.env.game.actors.every(actor => actor.effects.length === 0)).toBe(true);
  });
});
