import { expect, test } from 'bun:test';
import { adaptCastigationItem, bindCastigationEffect, hasCastigationTemplate, prepareCastigationEffect, registerCastigationAutomation, retaliateCastigation, unbindCastigationEffect } from '../src/castigation.ts';

const mod = 'fvtt-blood-hunter-2024';

function fixture() {
  const messages: any[] = [], applications: any[] = [];
  const scene = { id: 'scene' };
  const caster: any = { uuid: 'Actor.caster', name: 'PC (3)', system: { abilities: { int: { mod: 2 } }, attributes: { hp: { value: 54, temp: 0 } } }, effects: [], flags: {}, getFlag: (_m: string, key: string) => caster.flags[key], setFlag: async (_m: string, key: string, value: any) => { caster.flags[key] = value; }, unsetFlag: async (_m: string, key: string) => { delete caster.flags[key]; } };
  const attacker: any = { uuid: 'Actor.branded', name: 'Branded', system: { attributes: { hp: { value: 100, temp: 0 } } } };
  const ally: any = { uuid: 'Actor.ally', name: 'Ally' };
  const token = (id: string, actor: any) => { const document: any = { id, uuid: `Scene.scene.Token.${id}`, actor, parent: scene }; document.object = { document, actor }; actor.getActiveTokens = () => [document]; return document; };
  const casterToken = token('caster', caster), attackerToken = token('branded', attacker), allyToken = token('ally', ally);
  const brand: any = { uuid: 'Actor.branded.ActiveEffect.brand', parent: attacker, active: true, duration: {}, flags: { [mod]: { castigationBrand: true, brandCasterUuid: caster.uuid, brandCasterTokenUuid: casterToken.uuid } }, updateSource: (data: any) => { brand.prepared = data; } };
  attacker.effects = [brand];
  const documents = new Map([caster, attacker, casterToken, attackerToken, allyToken, brand].map(doc => [doc.uuid, doc]));
  const origin: any = { uuid: 'ChatMessage.attack', speaker: { scene: 'scene', token: 'branded' }, getAssociatedActivity: () => ({ actor: attacker }), getFlag: () => undefined };
  const root: any = {
    canvas: { scene }, game: { user: { id: 'gm' } }, fromUuidSync: (uuid: string) => documents.get(uuid),
    cat: { utils: { tokenUtils: { getDistance: () => 10, canSee: () => true }, rollUtils: { damageRoll: async (formula: string, actor: any, options: any) => ({ formula, total: Number(formula), options, toMessage: async (data: any) => { messages.push(data); } }) } } },
    MidiQOL: { applyTokenDamage: async (...args: any[]) => { applications.push(args); attacker.system.attributes.hp.value -= args[1]; return ['ChatMessage.application']; } },
    ChatMessage: { implementation: { getSpeaker: ({ actor }: any) => ({ actor: actor.uuid }) } }, foundry: { utils: { escapeHTML: (value: string) => value } },
  };
  return { caster, attacker, ally, brand, casterToken, attackerToken, allyToken, origin, root, documents, messages, applications, options: { origin, midi: { targetUuid: allyToken.uuid } } };
}

test('actual damage to the caster retaliates once with Intelligence, even without sight or proximity; every later damage application can trigger again', async () => {
  const f = fixture();
  f.root.cat.utils.tokenUtils.canSee = () => false;
  f.root.cat.utils.tokenUtils.getDistance = () => 100;
  await retaliateCastigation(f.caster, 7, f.options, f.root);
  expect(f.applications).toHaveLength(1);
  expect(f.applications[0][0]).toEqual([{ damage: 2, type: 'psychic' }]);
  expect(f.applications[0][3]).toBeNull();
  expect(f.applications[0][5]).toEqual({ forceApply: true, updateOptions: { awaitDamageApplication: true } });
  expect(f.messages[0].flags[mod].castigationRetaliation).toMatchObject({ amount: 2, casterUuid: f.caster.uuid, victimUuid: f.caster.uuid, hpBefore: { value: 100, temp: 0 }, hpAfter: { value: 98, temp: 0 } });
  await retaliateCastigation(f.caster, 4, f.options, f.root);
  expect(f.attacker.system.attributes.hp.value).toBe(96);
});

test('a visible creature at ten feet qualifies; out of range, blocked sight, negative distance and another scene do not', async () => {
  const f = fixture();
  await retaliateCastigation(f.ally, 5, f.options, f.root);
  expect(f.messages).toHaveLength(1);
  for (const distance of [10.01, -1]) {
    f.root.cat.utils.tokenUtils.getDistance = () => distance;
    await retaliateCastigation(f.ally, 5, f.options, f.root);
  }
  f.root.cat.utils.tokenUtils.getDistance = () => 5;
  f.root.cat.utils.tokenUtils.canSee = () => false;
  await retaliateCastigation(f.ally, 5, f.options, f.root);
  f.root.cat.utils.tokenUtils.canSee = () => true;
  f.allyToken.parent = { id: 'other-scene' };
  await retaliateCastigation(f.ally, 5, f.options, f.root);
  expect(f.messages).toHaveLength(1);
});

test('zero damage, healing, anonymous HP changes and the caster attacking the branded creature do not retaliate', async () => {
  const f = fixture();
  for (const amount of [0, -5]) await retaliateCastigation(f.caster, amount, f.options, f.root);
  await retaliateCastigation(f.caster, 5, {}, f.root);
  f.origin.getAssociatedActivity = () => ({ actor: f.caster });
  await retaliateCastigation(f.attacker, 5, f.options, f.root);
  expect(f.messages).toHaveLength(0);
});

test('minimum one psychic damage, with no critical multiplier; disabled and expired brands do not trigger', async () => {
  const f = fixture();
  f.caster.system.abilities.int.mod = -2;
  await retaliateCastigation(f.caster, 1, f.options, f.root);
  expect(f.messages[0].flags[mod].castigationRetaliation.amount).toBe(1);
  f.brand.disabled = true;
  await retaliateCastigation(f.caster, 5, f.options, f.root);
  f.brand.disabled = false;
  f.brand.duration.expired = true;
  await retaliateCastigation(f.caster, 5, f.options, f.root);
  expect(f.applications).toHaveLength(1);
});

test('Midi original-card UUID can identify the source when the optional originatingMessage object was not attached', async () => {
  const f = fixture();
  f.documents.set(f.origin.uuid, f.origin);
  await retaliateCastigation(f.caster, 5, { midi: { itemCardUuid: f.origin.uuid, targetUuid: f.casterToken.uuid } }, f.root);
  expect(f.messages[0].flags[mod].castigationRetaliation.originUuid).toBe(f.origin.uuid);
});

test('native damage post-application is the only registered retaliation event; preview and attack hooks are not used', () => {
  const f = fixture(), hooks = new Map<string, Function[]>();
  f.root.Hooks = { on: (name: string, fn: Function) => hooks.set(name, [...hooks.get(name) ?? [], fn]), once: (name: string, fn: Function) => hooks.set(name, [...hooks.get(name) ?? [], fn]) };
  registerCastigationAutomation(f.root, error => { throw error; });
  hooks.get('catReady')![0]!();
  expect(hooks.has('dnd5e.applyDamage')).toBe(true);
  expect(hooks.has('midi-qol.preTargetDamageApplication')).toBe(false);
  expect(hooks.has('midi-qol.AttackRollComplete')).toBe(false);
});

test('new brand replaces only the same caster previous effect and deleting a stale effect cannot clear a newer link', async () => {
  const f = fixture();
  let deleted = false;
  const old: any = { uuid: 'Actor.old.ActiveEffect.old', flags: { [mod]: { brandCasterUuid: f.caster.uuid } }, delete: async () => { deleted = true; } };
  f.documents.set(old.uuid, old);
  f.caster.flags.castigationTarget = { effectUuid: old.uuid };
  f.brand.parent.documentName = 'Actor';
  prepareCastigationEffect(f.brand, f.root);
  expect(f.brand.prepared[`flags.${mod}.brandCasterTokenUuid`]).toBe(f.casterToken.uuid);
  await bindCastigationEffect(f.brand, f.root);
  expect(deleted).toBe(true);
  expect(f.caster.flags.castigationTarget.effectUuid).toBe(f.brand.uuid);
  await unbindCastigationEffect({ ...f.brand, uuid: old.uuid }, f.root);
  expect(f.caster.flags.castigationTarget.effectUuid).toBe(f.brand.uuid);
  await unbindCastigationEffect(f.brand, f.root);
  expect(f.caster.flags.castigationTarget).toBeUndefined();
});

test('selected old Item gets only its native template, activity reference and guidance; resources and other effects are preserved', async () => {
  const f = fixture(), id = 'activity';
  const template = { id: 'brandTemplate', flags: { [mod]: { castigationBrand: true } }, toObject: () => ({ _id: 'brandTemplate', flags: { [mod]: { castigationBrand: true } } }) };
  const sourceActivity = { id, effects: [{ _id: 'brandTemplate' }], activation: { condition: 'rite damage' }, description: { chatFlavor: 'brand guidance' } };
  f.root.fromUuid = async () => ({ effects: [template], system: { activities: new Map([[id, sourceActivity]]) } });
  let patch: any;
  const item: any = { effects: [{ id: 'custom', toObject: () => ({ _id: 'custom', changes: ['keep'] }) }], system: { uses: { spent: 1, max: '2' }, activities: new Map([[id, { id, effects: [] }]]) }, update: async (value: any) => { patch = value; } };
  expect(hasCastigationTemplate(item)).toBe(false);
  await adaptCastigationItem(item, f.root);
  expect(item.system.uses).toEqual({ spent: 1, max: '2' });
  expect(patch.effects).toEqual([{ _id: 'custom', changes: ['keep'] }, template.toObject()]);
  expect(patch[`system.activities.${id}.effects`]).toEqual([{ _id: 'brandTemplate' }]);
  expect(Object.keys(patch)).not.toContain('system.uses');
});
