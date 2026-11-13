import { describe, expect, test } from 'bun:test';
import { applyMarkedDamage, markedScope, MARKED_MACRO, prepareMarkedActivity, prepareMarkedEffect, registerMarkedAutomation } from '../src/marked-curse.ts';

const ID = 'fvtt-blood-hunter-2024';

function fixture() {
  const caster: any = { uuid: 'Actor.caster', documentName: 'Actor', items: [], getRollData: () => ({ scale: { 'blood-hunter': { hemocraft: '1d8' } } }) };
  const rite = (type: string) => ({ type: 'enchantment', active: true, disabled: false, isAppliedEnchantment: true, flags: { fvttJsonGenerator: { bloodHunterRite: true } }, system: { changes: [{ key: 'system.damage.parts', value: [['@scale.blood-hunter.crimson-rite', type]] }] } });
  caster.items.push({ type: 'weapon', effects: [rite('fire')] });
  const targetActor = { uuid: 'Actor.marked' };
  const targetToken = { uuid: 'Scene.fixture.Token.marked', name: '<Marked>', actor: targetActor };
  const document: any = { uuid: 'Actor.marked.ActiveEffect.mark', parent: targetActor, active: true, disabled: false, duration: { expiry: 'sourceStart' }, flags: { [ID]: { markedScope: 'source-only' } }, getSourceActor: () => caster };
  const workflow: any = { actor: caster, activity: { hasAttack: true }, hitTargets: new Set([{ document: targetToken }]), hitTargetsEC: new Set(), isCritical: false, markedEvidence: undefined };
  const ditem: any = { targetUuid: targetToken.uuid, totalDamage: 12, hpDamage: 0, oldTempHP: 20, damageDetail: [{ value: 7, type: 'slashing' }, { value: 5, type: 'fire', active: { multiplier: 1 } }], calcDamageOptions: { midi: { saved: true, saveMultiplier: 0.5 } } };
  const calls = { rolls: [] as any[], damage: [] as any[], messages: [] as any[], chooser: [] as any[] };
  const traits = new Set<string>();
  const root: any = {
    CONFIG: { DND5E: { damageTypes: { fire: { label: 'Fire' }, cold: { label: 'Cold' }, slashing: { label: 'Slashing' }, radiant: { label: 'Radiant' } } } },
    cat: { utils: {
      rollUtils: { damageRoll: async (formula: string, actor: any, options: any) => { calls.rolls.push({ formula, actor, options }); return { formula: options.isCritical ? '2d8' : '1d8', total: 6, options, toMessage: async (message: any) => calls.messages.push(message) }; } },
      actorUtils: { checkTrait: (_actor: any, trait: string, type: string) => traits.has(`${trait}:${type}`) },
      workflowUtils: { modifyDamageAppliedFlat: (...args: any[]) => calls.damage.push(args), getWorkflowProperty: (wf: any) => wf.markedEvidence, setWorkflowProperty: (wf: any, _key: string, value: any) => { wf.markedEvidence = value; } },
    } },
    MidiQOL: { configSettings: () => ({ damageImmunityMultiplier: 0, damageResistanceMultiplier: 0.5, damageVulnerabilityMultiplier: 2 }) },
    foundry: { utils: { escapeHTML: (text: string) => text.replaceAll('<', '&lt;').replaceAll('>', '&gt;') }, applications: { api: { DialogV2: { wait: async (config: any) => { calls.chooser.push(config); return config.buttons[0]?.callback(); } } } } },
    ChatMessage: { implementation: { getSpeaker: ({ actor }: any) => ({ actor: actor.uuid }) } },
    game: { i18n: { localize: (key: string) => key } },
  };
  const args = { document, workflow, ditem, targetToken };
  return { caster, targetToken, document, workflow, ditem, root, calls, traits, args, rite };
}

function nextDamageEvent(f: ReturnType<typeof fixture>): void {
  f.workflow = { ...f.workflow, markedEvidence: undefined };
  f.ditem = { ...f.ditem };
  f.args = { ...f.args, workflow: f.workflow, ditem: f.ditem };
}

describe('Blood Curse of the Marked damage', () => {
  test('takes the caster die, adds damage to only this target, and repeats on every qualifying hit including temporary HP damage', async () => {
    const f = fixture();
    const firstItem = f.ditem;
    await applyMarkedDamage(f.args, f.root);
    nextDamageEvent(f);
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.rolls).toHaveLength(2);
    expect(f.calls.rolls[0]).toEqual({ formula: '@scale.blood-hunter.hemocraft', actor: f.caster, options: { type: 'fire', isCritical: false, flavor: '印记血咒 Blood Curse of the Marked' } });
    expect(f.calls.damage).toEqual([[firstItem, 6, { type: 'fire', multiplier: 1 }], [f.ditem, 6, { type: 'fire', multiplier: 1 }]]);
    expect(f.workflow.markedEvidence.map((entry: any) => entry.targetUuid)).toEqual([f.targetToken.uuid]);
    expect(f.calls.messages[0]).toMatchObject({ type: 'generic', speaker: { actor: f.caster.uuid }, flavor: '印记血咒 Blood Curse of the Marked — &lt;Marked&gt;；随原行动卡一并应用伤害' });
    expect(f.calls.messages[0].system).toBeUndefined();
    expect(f.calls.messages[0].flags[ID].markedDamage.casterUuid).toBe(f.caster.uuid);
  });

  test('reuses the original die when the original card rebuilds damage for Apply and adds it only once to each damage item', async () => {
    const f = fixture();
    await applyMarkedDamage(f.args, f.root);
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.rolls).toHaveLength(1);
    expect(f.calls.damage).toHaveLength(1);
    const manualDamage = { ...f.ditem };
    await applyMarkedDamage({ ...f.args, ditem: manualDamage }, f.root);
    await applyMarkedDamage({ ...f.args, ditem: manualDamage }, f.root);
    expect(f.calls.rolls).toHaveLength(1);
    expect(f.calls.damage).toHaveLength(2);
    expect(f.calls.damage[1]).toEqual([manualDamage, 6, { type: 'fire', multiplier: 1 }]);
    expect(f.calls.messages).toHaveLength(1);
    expect(f.workflow.markedEvidence).toHaveLength(1);
  });

  test('reuses the player die in a GM workflow restored only from the original card', async () => {
    const f = fixture();
    const flags = new Map<string, unknown>();
    const writes: string[] = [];
    const card = {
      isOwner: true,
      getFlag: (scope: string, key: string) => structuredClone(flags.get(`${scope}.${key}`)),
      setFlag: async (scope: string, key: string, value: unknown) => {
        writes.push(`${scope}.${key}`);
        flags.set(`${scope}.${key}`, structuredClone(value));
      },
    };
    f.workflow.itemCardUuid = 'ChatMessage.attack';
    f.root.fromUuidSync = (uuid: string) => uuid === f.workflow.itemCardUuid ? card : undefined;

    await applyMarkedDamage(f.args, f.root);
    const workflow = { ...f.workflow, markedEvidence: undefined };
    const ditem = { ...f.ditem };
    await applyMarkedDamage({ ...f.args, workflow, ditem }, f.root);

    expect(f.calls.rolls).toHaveLength(1);
    expect(f.calls.messages).toHaveLength(1);
    expect(f.calls.damage[1]).toEqual([ditem, 6, { type: 'fire', multiplier: 1 }]);
    expect(writes).toEqual([`${ID}.markedDamage`]);
    expect(card.getFlag(ID, 'markedDamage')).toEqual([f.calls.messages[0].flags[ID].markedDamage]);
  });

  test('rejects misses, zero damage, absorption, disabled/expired marks, an unmarked target and no active rite', async () => {
    const mutations = [
      (f: ReturnType<typeof fixture>) => f.workflow.hitTargets.clear(),
      (f: ReturnType<typeof fixture>) => { f.ditem.totalDamage = 0; },
      (f: ReturnType<typeof fixture>) => { f.ditem.damageDetail[1].active = { absorption: true }; },
      (f: ReturnType<typeof fixture>) => { f.ditem.damageDetail[1].active = { type: { absorption: true } }; },
      (f: ReturnType<typeof fixture>) => { f.ditem.damageDetail[1].active = { immunity: true }; },
      (f: ReturnType<typeof fixture>) => { f.ditem.damageDetail[1].active = { multiplier: 0 }; },
      (f: ReturnType<typeof fixture>) => { f.document.disabled = true; },
      (f: ReturnType<typeof fixture>) => { f.document.duration.expired = true; },
      (f: ReturnType<typeof fixture>) => { f.document.parent = { uuid: 'Actor.otherTarget' }; },
      (f: ReturnType<typeof fixture>) => { f.caster.items[0].effects[0].disabled = true; },
      (f: ReturnType<typeof fixture>) => { f.caster.items[0].type = 'feat'; },
    ];
    for (const mutate of mutations) {
      const f = fixture(); mutate(f);
      await applyMarkedDamage(f.args, f.root);
      expect(f.calls.rolls).toHaveLength(0);
      expect(f.calls.damage).toHaveLength(0);
    }
  });

  test('normal requires caster damage of an active rite type; amplified permits another actor and another damage type', async () => {
    const f = fixture();
    f.workflow.actor = { uuid: 'Actor.otherAttacker', getRollData: () => ({ scale: { 'blood-hunter': { hemocraft: '1d4' } } }) };
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.rolls).toHaveLength(0);
    f.document.flags[ID].markedScope = 'all-attackers';
    f.workflow.activity = { hasAttack: false };
    f.ditem.damageDetail = [{ type: 'cold', value: 8 }];
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.rolls[0]?.actor).toBe(f.caster);
    expect(f.calls.damage[0]?.[2]).toEqual({ type: 'fire', multiplier: 1 });
    f.document.flags[ID].markedScope = 'source-only'; f.workflow.actor = f.caster;
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.rolls).toHaveLength(1);
  });

  test('honors target elemental traits without applying the original saving throw a second time, and crits only attack damage', async () => {
    const f = fixture();
    f.traits.add('dr:fire'); f.workflow.isCritical = true;
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.rolls[0]?.options.isCritical).toBe(true);
    expect(f.calls.damage[0]?.[2].multiplier).toBe(0.5);
    expect(f.workflow.markedEvidence[0]).toMatchObject({ formula: '2d8', isCritical: true });
    f.traits.clear(); f.traits.add('dv:fire'); f.workflow.activity.hasAttack = false;
    nextDamageEvent(f);
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.rolls[1]?.options.isCritical).toBe(false);
    expect(f.calls.damage[1]?.[2].multiplier).toBe(2);
    f.traits.add('di:fire');
    nextDamageEvent(f);
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.damage[2]?.[2].multiplier).toBe(0);
  });

  test('prefers a unique matching active rite type and asks instead of arbitrarily selecting when multiple types qualify', async () => {
    const f = fixture();
    f.caster.items.push({ type: 'weapon', effects: [f.rite('cold')] });
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.chooser).toHaveLength(0);
    expect(f.calls.damage[0]?.[2].type).toBe('fire');
    f.ditem.damageDetail.push({ type: 'cold', value: 3 });
    nextDamageEvent(f);
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.chooser).toHaveLength(1);
    expect(f.calls.chooser[0].buttons.map((button: any) => button.action)).toEqual(['fire', 'cold']);
    f.root.foundry.applications.api.DialogV2.wait = async () => undefined;
    nextDamageEvent(f);
    await applyMarkedDamage(f.args, f.root);
    expect(f.calls.rolls).toHaveLength(2);
  });
});

describe('Marked source adaptation', () => {
  test('adapts a future applied legacy mark to CAT and sourceStart without changing an Item template', () => {
    const changes = [{ key: 'flags.fvttJsonGenerator.bloodCurseMark', value: 'all-attackers' }];
    const updates: any[] = [];
    const effect: any = { parent: { documentName: 'Actor' }, system: { changes }, flags: { cat: { macros: { roll: [{ source: 'other-module', identifier: 'keep' }] } } }, updateSource: (update: any) => updates.push(update) };
    prepareMarkedEffect(effect);
    expect(markedScope(effect)).toBe('all-attackers');
    expect(updates[0]).toMatchObject({ 'duration.expiry': 'sourceStart', [`flags.${ID}.markedScope`]: 'all-attackers' });
    expect(updates[0]['flags.cat.macros.roll']).toEqual([{ source: 'other-module', identifier: 'keep' }, { source: ID, identifier: MARKED_MACRO, rules: 'all' }]);
    effect.parent.documentName = 'Item'; prepareMarkedEffect(effect);
    expect(updates).toHaveLength(1);
  });

  test('removes only the obsolete manual Marked prompt from the normal usage clone, retaining the amplification HP cost macro', () => {
    const updates: any[] = [];
    const item = { system: { identifier: 'blood-curse-of-the-marked' }, effects: [{ changes: [{ key: 'flags.fvttJsonGenerator.bloodCurseMark', value: 'source-only' }] }], flags: { 'midi-qol': { onUseMacroName: '[postActiveEffects]ActivityMacro-6f6ad7b229d76963,[preDamageApplication]ActivityMacro-462ffe7b3656aed5,[postActiveEffects]CustomMacro' } }, updateSource: (update: any) => updates.push(update) };
    prepareMarkedActivity({ item });
    expect(updates).toEqual([{ 'flags.midi-qol.onUseMacroName': '[preDamageApplication]ActivityMacro-462ffe7b3656aed5,[postActiveEffects]CustomMacro', 'system.activities.6f6ad7b229d76963.macroData.command': '' }]);
    expect(item.flags['midi-qol'].onUseMacroName).toContain('ActivityMacro-6f6ad7b229d76963');
  });

  test('registers the verified target damage pass and checks only this target for old applied effects, avoiding duplicate CAT callbacks', async () => {
    const f = fixture();
    const handlers = new Map<string, Function>();
    const registrations: any[] = [];
    f.root.Hooks = { on: (name: string, fn: Function) => handlers.set(name, fn), once: (name: string, fn: Function) => handlers.set(name, fn) };
    f.root.cat.api = { registerFnMacro: (config: any) => registrations.push(config) };
    registerMarkedAutomation(f.root, (error) => { throw error; });
    handlers.get('catReady')!();
    expect(registrations[0].roll[0].pass).toBe('targetDamageComplete');
    const target: any = { actor: { effects: [f.document] }, document: f.targetToken };
    await handlers.get('midi-qol.preTargetDamageApplication')!(target, { workflow: f.workflow, ditem: f.ditem });
    expect(f.calls.rolls).toHaveLength(1);
    f.document.flags.cat = { macros: { roll: [{ source: ID, identifier: MARKED_MACRO }] } };
    await handlers.get('midi-qol.preTargetDamageApplication')!(target, { workflow: f.workflow, ditem: f.ditem });
    expect(f.calls.rolls).toHaveLength(1);
    expect(handlers.has('ready')).toBe(false);
  });

  test('display-only generic messages do not require a damage target-descriptor namespace', () => {
    const f = fixture();
    const handlers = new Map<string, Function>();
    const registrations: any[] = [];
    const errors: Error[] = [];
    f.root.Hooks = { on: (name: string, fn: Function) => handlers.set(name, fn), once: (name: string, fn: Function) => handlers.set(name, fn) };
    f.root.cat.api = { registerFnMacro: (config: any) => registrations.push(config) };
    registerMarkedAutomation(f.root, (error) => errors.push(error as Error));
    handlers.get('catReady')!();
    expect(registrations).toHaveLength(1);
    expect(handlers.has('midi-qol.preTargetDamageApplication')).toBe(true);
    expect(errors).toHaveLength(0);
  });
});
