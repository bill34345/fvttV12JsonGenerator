import { describe, expect, test } from 'bun:test';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { assistedEncounterFixture } from '../../../../tests/helpers/forge-encounter';
import { readConditionInstance } from '@fvtt-json-generator/contracts/conditions';
import { createCompanionEffectData, findCompanionEffect, installCrystalbleedRuntime, permittedStatuses } from './battle-control.mjs';

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

function salvoEnvironment() {
  const batch = runtimeEnvironment();
  const { env, dragon, crystal } = batch;
  const target = actorDocument('crystal', '5555555555555555');
  target.name = 'owned salvo target';
  target.system.traits.ci.value = new Set();
  target.system.attributes.hp = { value: 200, max: 200 };
  target.rollSavingThrow = async () => [{ total: -16 }];
  target.applyDamage = async (damages, { multiplier }) => {
    target.system.attributes.hp.value -= damages.reduce((total, damage) => total + damage.value, 0) * multiplier;
  };
  dragon.update = async changes => { dragon.system.resources.legact.spent = changes['system.resources.legact.spent']; };
  dragon.getRollData = () => ({});
  const salvo = dragon.items.find(item => item.name === '晶片齐射 (Shard Salvo)');
  salvo.uuid = `${dragon.uuid}.Item.salvo`;
  salvo.actor = dragon;
  salvo.system.activities = Object.values(salvo.system.activities).map(activity => ({ ...activity, item: salvo }));
  // Foundry's DamageField exposes a computed formula; plain workflow JSON does
  // not. The formal Shard Salvo source is 2d8 psychic damage.
  for (const activity of salvo.system.activities) {
    if (activity.damage) activity.damage.parts = activity.damage.parts.map(part => ({ ...part, formula: '2d8' }));
  }
  salvo.effects = salvo.effects.map(effect => effectDocument({ ...effect.toObject(), statuses: ['dazed'] }));
  const scene = Object.assign(env.canvas.scene, { grid: { type: 1 },
    async createEmbeddedDocuments() { return [{ id: 'summoned', x: 400, y: 0 }]; },
  });
  const token = (actor, id, x) => ({ actor, id, name: actor.name,
    document: { x, y: 200, width: 1, height: 1, elevation: 0, parent: scene, uuid: `Scene.test-scene.Token.${id}` },
  });
  const sourceToken = token(dragon, 'source', 100);
  const targetToken = token(target, 'target', 300);
  env.canvas.tokens.placeables = [sourceToken, targetToken];
  env.canvas.tokens.get = id => env.canvas.tokens.placeables.find(value => value.id === id);
  env.canvas.dimensions = { size: 100, sceneRect: { x: 0, y: 0, width: 1000, height: 1000 } };
  env.canvas.grid = { measurePath: () => ({ distance: 10 }) };
  crystal.getTokenDocument = async data => ({ toObject: () => data });
  const combat = { id: 'owned-combat', scene, active: true, round: 1, turn: 0,
    turns: [{ id: 'source-turn', tokenId: sourceToken.id }, { id: 'target-turn', tokenId: targetToken.id }],
    get combatant() { return this.turns[this.turn]; },
    async createEmbeddedDocuments() { return [{ id: 'summoned-turn', initiative: 17 }]; },
    async rollInitiative() {},
  };
  env.game.combats = [combat];
  env.CONFIG.Canvas = { polygonBackends: { move: { testCollision: () => false }, sight: { testCollision: () => false } } };
  env.CONFIG.statusEffects = [{ id: 'dazed' }, { id: 'fvtt-custom-conditions.dazed' }];
  env.CONFIG.DND5E.abilities = { con: { label: 'Constitution' } };
  env.CONFIG.Dice = { DamageRoll: class {
    async evaluate() { this.total = 12; return this; }
    async toMessage() {}
  } };
  env.ChatMessage.getSpeaker = () => ({});
  env.ChatMessage.getWhisperRecipients = () => [];
  return { ...batch, target, sourceToken, targetToken, combat };
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

  test('projects a flagged dazed template independently even when its imported status is native', () => {
    // cor-cotn r4: Item effect 634026d2d16c240f retained its custom-condition
    // template flag but persisted statuses=[dazed]. Copying that status caused
    // DAE to create dnd5edazed000000 outside the companion expiry boundary.
    const salvo = artifact('dragon').items.find(item => item.name === '晶片齐射 (Shard Salvo)');
    const template = structuredClone(salvo.effects[0]);
    template.statuses = ['dazed'];
    const before = JSON.stringify(template);
    const instance = createCompanionEffectData(template, 'Actor.1111111111111111.Item.salvo', 100);
    expect(instance.statuses).toEqual(['fvtt-custom-conditions.dazed']);
    expect(readConditionInstance(instance)).toMatchObject({ conditionId: 'dazed', enabled: true });
    expect(JSON.stringify(template)).toBe(before);
  });

  test('failed salvo emits only the independent condition and expires it at target turn end', async () => {
    const batch = salvoEnvironment();
    const api = await installCrystalbleedRuntime(batch.env, batch.options);
    const result = await api.salvo(batch.sourceToken, batch.targetToken);
    expect(result.dazedApplied).toBe(true);
    expect(batch.target.system.attributes.hp.value).toBe(188);
    expect(batch.dragon.system.resources.legact.spent).toBe(2);
    expect(batch.target.effects).toHaveLength(1);
    const effect = batch.target.effects[0];
    expect(Array.from(effect.statuses)).toEqual(['fvtt-custom-conditions.dazed']);
    expect(readConditionInstance(effect).template).toBeUndefined();
    expect(effect.flags.world.crystalbleedV14.expiry).toEqual({ phase: 'end', combatId: 'owned-combat', round: 1 });
    batch.combat.turn = 1;
    batch.hooks.get('updateCombat')(batch.combat);
    await api.settle();
    expect(effect.disabled).toBe(false);
    batch.combat.turn = 0;
    batch.combat.round = 2;
    batch.hooks.get('updateCombat')(batch.combat);
    await api.settle();
    expect(effect.disabled).toBe(true);
    api.stop();
  });

  test('honors semantic and projected custom immunity without conflating another module status', () => {
    expect(permittedStatuses(['fvtt-custom-conditions.dazed'], new Set(['dazed']))).toEqual([]);
    expect(permittedStatuses(['fvtt-custom-conditions.dazed'], new Set(['fvtt-custom-conditions.dazed']))).toEqual([]);
    expect(permittedStatuses(['other-module.dazed'], new Set(['dazed']))).toEqual(['other-module.dazed']);
    expect(permittedStatuses(['frightened'], new Set(['frightened']))).toEqual([]);
  });

  test('keeps the named expiry fallback when the independent status is not registered', async () => {
    const batch = salvoEnvironment();
    batch.env.CONFIG.statusEffects = [{ id: 'dazed' }];
    const api = await installCrystalbleedRuntime(batch.env, batch.options);
    expect((await api.salvo(batch.sourceToken, batch.targetToken)).dazedApplied).toBe(true);
    expect(Array.from(batch.target.effects[0].statuses)).toEqual([]);
    expect(batch.target.effects[0].flags.world.crystalbleedV14.expiry.phase).toBe('end');
    api.stop();
  });

  test('does not apply independent dazed to a semantically immune salvo target', async () => {
    const batch = salvoEnvironment();
    batch.target.system.traits.ci.value = new Set(['dazed']);
    const api = await installCrystalbleedRuntime(batch.env, batch.options);
    expect((await api.salvo(batch.sourceToken, batch.targetToken)).dazedApplied).toBe(false);
    expect(batch.target.effects).toHaveLength(0);
    api.stop();
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
