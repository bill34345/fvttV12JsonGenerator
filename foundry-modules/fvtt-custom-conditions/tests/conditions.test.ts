import { describe, expect, test } from 'bun:test';
import {
  CONDITION_DEFINITIONS,
  CUSTOM_CONDITION_IDS,
  buildConditionFlag,
  createConditionInstance,
  isSafeConditionFormula,
  parseConditionInstance,
} from '@fvtt-json-generator/contracts/conditions';
import { ConditionRuntime, changesFor, registerConditionMappings } from '../src/runtime.ts';

function actor(id = 'target', extra: Record<string, unknown> = {}): any {
  const data: any = { _id: id, uuid: `Actor.${id}`, name: id, documentName: 'Actor', system: { attributes: { hp: { value: 20, max: 20 }, ac: { value: 12 }, movement: { walk: 30 } } }, effects: [], items: [], flags: {}, ...extra };
  return {
    ...data,
    toObject: () => structuredClone(data),
    async createEmbeddedDocuments(_type: string, entries: any[]) { const created = entries.map((entry, index) => ({ ...entry, id: `effect-${index}`, _id: `effect-${index}`, parent: this })); data.effects.push(...created); return created; },
    async updateEmbeddedDocuments(type: string, updates: any[]) { for (const update of updates) { const document = (type === 'ActiveEffect' ? data.effects : data.items).find((entry: any) => entry.id === update._id); if (document) { for (const [key, value] of Object.entries(update)) { if (key === 'flags.fvtt-custom-conditions.condition') { document.flags ??= {}; document.flags['fvtt-custom-conditions'] ??= {}; document.flags['fvtt-custom-conditions'].condition = value; } else if (key === 'system.equipped') { document.system.equipped = value; } else if (key === 'changes') document.changes = value; else Object.assign(document, { [key]: value }); } } } return type === 'ActiveEffect' ? data.effects : data.items; },
    async deleteEmbeddedDocuments(_type: string, ids: string[]) { for (let index = data.effects.length - 1; index >= 0; index -= 1) if (ids.includes(data.effects[index].id)) data.effects.splice(index, 1); return []; },
    async update(update: any) { for (const [path, value] of Object.entries(update)) { if (path === 'system.attributes.hp.value') data.system.attributes.hp.value = value; else if (path.startsWith('flags.')) { const parts = path.split('.'); const module = parts[1] ?? ''; const key = parts[2] ?? ''; const child = parts[3]; data.flags[module] ??= {}; if (child) data.flags[module][key] ??= {}; if (child) data.flags[module][key][child] = value; else data.flags[module][key] = value; } } },
  };
}

function combatFor(target: any, round = 1, turn = 0): any {
  const combatant = { id: 'combatant-1', actor: target, actorId: target.id };
  return {
    id: 'combat', uuid: 'Combat.test', round, turn,
    current: { round, turn, combatantId: combatant.id },
    combatant, turns: [combatant], combatants: { get: (id: string) => id === combatant.id ? combatant : undefined },
  };
}

function runtimeFixture(target = actor(), extra: Record<string, any> = {}) {
  const handlers = new Map<string, any>();
  const gm: any = { id: 'gm', isGM: true, active: true, targets: new Set<any>() };
  const globals: any = {
    ...extra,
    game: { user: gm, users: { activeGM: gm }, modules: { get: () => undefined }, ...extra.game },
    CONFIG: { statusEffects: [], DND5E: { conditionEffects: { noMovement: new Set(), halfMovement: new Set() } }, ...extra.CONFIG },
    Hooks: { on: (name: string, handler: any) => { handlers.set(name, handler); return name; }, off: () => {} },
    ui: { notifications: { warn: () => {}, error: () => {} } },
  };
  const runtime = new ConditionRuntime(globals, () => true);
  runtime.start();
  return { target, handlers, gm, globals, runtime };
}

describe('custom condition contract', () => {
  test('registers exactly the planned nineteen custom conditions', () => {
    expect(CUSTOM_CONDITION_IDS).toHaveLength(19);
    expect(Object.keys(CONDITION_DEFINITIONS)).toEqual([...CUSTOM_CONDITION_IDS]);
    expect(CONDITION_DEFINITIONS.bleeding.defaultStacking).toBe('highest');
    expect(CONDITION_DEFINITIONS.burning.defaultStacking).toBe('highest');
    expect(CONDITION_DEFINITIONS.bleeding.parameters.map((parameter) => parameter.id)).toContain('stacking');
    expect(CONDITION_DEFINITIONS.frozen.parameters.map((parameter) => parameter.id)).toContain('escapeDC');
    expect(CONDITION_DEFINITIONS.frozen.parameters.map((parameter) => parameter.id)).toContain('breakDamageTaken');
  });

  test('accepts safe formulas and rejects executable text', () => {
    expect(isSafeConditionFormula('4d4 + 1d6')).toBeTrue();
    expect(isSafeConditionFormula('(2d6 + 3) / 2')).toBeTrue();
    expect(isSafeConditionFormula('1d6; game.actor.update({})')).toBeFalse();
  });

  test('normalizes default instance parameters and produces the module flag', () => {
    const instance = createConditionInstance('bleeding', { formula: '2d6', stacking: 'stack' });
    expect(instance.params).toMatchObject({ mode: 'hpLoss', timing: 'turnEnd', stacking: 'highest', endOnHealing: true });
    expect(buildConditionFlag(instance)).toEqual({ 'fvtt-custom-conditions': { condition: instance } });
    expect(parseConditionInstance(instance)).toEqual(instance);
  });
});

describe('condition runtime', () => {
  test('Sickened penalizes only Constitution saves and preserves unrelated roll modes', async () => {
    const { target, runtime, handlers } = runtimeFixture();
    const effect = await runtime.apply(target, 'sickened', {});
    expect(effect.changes).toEqual([
      expect.objectContaining({ key: 'system.abilities.con.save.roll.mode', value: '-1' }),
    ]);
    const run = (hook: string, ability: string, disadvantage = false) => {
      const config = { subject: target, ability, rolls: [{ parts: ['1d20'] }], disadvantage };
      handlers.get(hook)(config);
      return config.disadvantage;
    };
    expect(run('dnd5e.preRollSavingThrow', 'con')).toBeTrue();
    expect(run('dnd5e.preRollAbilityCheck', 'con')).toBeFalse();
    expect(run('dnd5e.preRollSavingThrow', 'dex')).toBeFalse();
    expect(run('dnd5e.preRollAttack', 'con')).toBeFalse();
    expect(run('dnd5e.preRollAbilityCheck', 'con', true)).toBeTrue();
    await runtime.remove(target, effect.id);
    expect(run('dnd5e.preRollSavingThrow', 'con')).toBeFalse();
    runtime.stop();
  });

  test('survives Trigger Engine ready ordering and subscribes when its runtime becomes available', () => {
    const handlers = new Map<string, any>();
    let ready = false;
    let subscriptions = 0;
    const triggerApi = {
      subscribe: () => {
        if (!ready) throw new Error('FVTT Trigger Engine is not ready.');
        subscriptions += 1;
        return () => {};
      },
    };
    const globals: any = {
      game: { modules: { get: () => ({ api: triggerApi }) } },
      CONFIG: { statusEffects: [] },
      Hooks: { on: (name: string, handler: any) => { handlers.set(name, handler); return name; }, off: () => {} },
    };
    const runtime = new ConditionRuntime(globals, () => true);
    expect(() => runtime.start()).not.toThrow();
    expect(handlers.has('dnd5e.preRollAttack')).toBeTrue();
    expect(subscriptions).toBe(0);
    ready = true;
    handlers.get('fvtt-trigger-engine.ready')();
    expect(subscriptions).toBe(1);
    runtime.stop();
  });

  test('applies a parameterized bleeding instance and exposes it through the same API used for static states', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor();
    const globals: any = { game: { user: gm, users: { activeGM: gm } }, CONFIG: { statusEffects: [] }, Roll: class {} };
    const runtime = new ConditionRuntime(globals, () => true);
    const effect = await runtime.apply(target, 'bleeding', { formula: '4d4', stacking: 'stack' }, { origin: 'Item.bloodmourne' });
    expect(effect.flags['fvtt-custom-conditions'].condition).toMatchObject({ conditionId: 'bleeding', params: { formula: '4d4', mode: 'hpLoss', timing: 'turnEnd', stacking: 'highest' } });
    expect(runtime.list(target)).toHaveLength(1);
    expect(runtime.list(target)[0]?.origin).toBe('Item.bloodmourne');
  });

  test('projects roll modes and registers every movement type through native dnd5e conditions', () => {
    const addled = createConditionInstance('addled', {});
    const immobilized = createConditionInstance('immobilized', {});
    const frozen = createConditionInstance('frozen', { escapeDC: 14 });
    const slowed = createConditionInstance('slowed', {});
    const effects = { noMovement: new Set<string>(), halfMovement: new Set<string>() };
    registerConditionMappings({ CONFIG: { statusEffects: [], DND5E: { conditionEffects: effects } } });
    expect(changesFor(addled)).toContainEqual(expect.objectContaining({ key: 'system.abilities.int.check.roll.mode', value: '-1' }));
    expect(effects.noMovement.has('immobilized')).toBeTrue();
    expect(effects.noMovement.has('frozen')).toBeTrue();
    expect(effects.halfMovement.has('slowed')).toBeTrue();
    for (const instance of [immobilized, frozen, slowed]) {
      expect(changesFor(instance).some((change) => String(change.key).startsWith('system.attributes.movement.'))).toBeFalse();
    }
  });

  test('settles bleeding once per generic Combat turn event and persists the checkpoint', async () => {
    const target = actor();
    const globals: any = {
      game: { user: { id: 'gm' }, users: { activeGM: { id: 'gm' } } },
      CONFIG: { statusEffects: [] },
      Roll: class {
        total = 4;
        constructor(public formula: string, public data: unknown) {}
        async evaluate() { return this; }
      },
    };
    const runtime = new ConditionRuntime(globals, () => true);
    await runtime.apply(target, 'bleeding', { formula: '1d6', mode: 'hpLoss', timing: 'turnEnd', stacking: 'stack' });
    const context = { event: { type: 'combatTurnEnd', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', key: 'Combat.test:end:1:0', round: 1, turn: 0 };
    await runtime.handleTriggerEvent(context);
    await runtime.handleTriggerEvent(context);
    expect(target.system.attributes.hp.value).toBe(16);
    expect(Object.keys(target.flags['fvtt-custom-conditions'].turns)).toHaveLength(1);
  });

  test('accumulates final fire and bludgeoning damage and removes Frozen at its threshold', async () => {
    const gm = { id: 'gm', isGM: true, active: true, targets: new Set() };
    const handlers = new Map<string, any>();
    const globals: any = {
      game: { user: gm, users: { activeGM: gm }, modules: { get: () => undefined } },
      CONFIG: { statusEffects: [] },
      Hooks: { on: (name: string, handler: any) => { handlers.set(name, handler); return name; }, off: () => {} },
    };
    const target = actor('frozen-target');
    const runtime = new ConditionRuntime(globals, () => true);
    runtime.start();
    await runtime.apply(target, 'frozen', { escapeDC: 14, breakDamage: 20 });

    const firstOptions = {};
    handlers.get('dnd5e.calculateDamage')(target, [{ type: 'fire', value: 8 }, { type: 'cold', value: 99 }], firstOptions);
    handlers.get('dnd5e.applyDamage')(target, 8, firstOptions);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(runtime.list(target)[0]?.instance.params.breakDamageTaken).toBe(8);

    const secondOptions = {};
    handlers.get('dnd5e.calculateDamage')(target, [{ type: 'bludgeoning', value: 12 }], secondOptions);
    handlers.get('dnd5e.applyDamage')(target, 12, secondOptions);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(runtime.list(target)).toHaveLength(0);
    runtime.stop();
  });

  test('uses shared turn flags for Dazed action-versus-movement and refreshes on the next turn', async () => {
    const target = actor('rules-target', { isOwner: true });
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(target, 1, 0);
    await runtime.apply(target, 'dazed', {});
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round: 1, turn: 0 });

    const token = { actor: target };
    const movement = { method: 'dragging', passed: { waypoints: [{ x: 100, y: 100 }] } };
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeUndefined();
    handlers.get('moveToken')(token, movement);
    expect(handlers.get('dnd5e.preUseActivity')({ actor: target, activation: { type: 'action' }, item: { type: 'feat' } }, {})).toBeFalse();
    expect(handlers.get('dnd5e.preUseActivity')({ actor: target, activation: { type: 'bonus' }, item: { type: 'feat' } }, {})).toBeFalse();

    globals.game.combat.round = 2;
    globals.game.combat.current = { round: 2, turn: 0, combatantId: 'combatant-1' };
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round: 2, turn: 0 });
    const action = { actor: target, activation: { type: 'action' }, item: { type: 'feat' } };
    expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(action, {});
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeFalse();
    runtime.stop();
  });

  test('blocks Immobilized and Frozen voluntary movement outside combat without blocking forced repositioning', async () => {
    for (const condition of ['immobilized', 'frozen'] as const) {
      const { target, globals, handlers, runtime } = runtimeFixture();
      const token = { actor: target };
      const move = (method: string) => ({ method, passed: { waypoints: [{ x: 100, y: 100, elevation: 5 }] } });
      expect(handlers.get('preMoveToken')(token, move('dragging'), {})).toBeUndefined();
      const effect = await runtime.apply(target, condition, condition === 'frozen' ? { escapeDC: 14 } : {});
      for (const method of ['dragging', 'keyboard']) {
        expect(handlers.get('preMoveToken')(token, move(method), {})).toBeFalse();
      }
      expect(handlers.get('preMoveToken')(token, { method: 'dragging', passed: { waypoints: [] } }, {})).toBeUndefined();
      for (const method of ['api', 'config', 'hud', 'undo']) {
        expect(handlers.get('preMoveToken')(token, move(method), {})).toBeUndefined();
      }
      globals.game.user = { id: 'player', isGM: false };
      for (const method of ['hud', 'config']) {
        expect(handlers.get('preMoveToken')(token, move(method), {})).toBeFalse();
      }
      effect.disabled = true;
      expect(handlers.get('preMoveToken')(token, move('dragging'), {})).toBeUndefined();
      effect.disabled = false;
      await runtime.remove(target, effect.id);
      expect(handlers.get('preMoveToken')(token, move('dragging'), {})).toBeUndefined();
      runtime.stop();
    }
  });

  test('does not charge Dazed voluntary movement for API or GM repositioning', async () => {
    const { target, globals, handlers, runtime, gm } = runtimeFixture();
    globals.game.combat = combatFor(target);
    await runtime.apply(target, 'dazed', {});
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round: 1, turn: 0 });
    const token = { actor: target };
    const movement = { method: 'api', passed: { waypoints: [{ x: 100, y: 100 }] } };
    const action = { actor: target, type: 'utility', activation: { type: 'action' }, item: { type: 'feat' } };
    handlers.get('moveToken')(token, movement);
    handlers.get('moveToken')(token, { ...movement, method: 'hud' }, {}, gm);
    expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(action, {});
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeUndefined();
    expect(handlers.get('preMoveToken')(token, { ...movement, method: 'keyboard' }, {})).toBeFalse();
    globals.game.combat.round = 2;
    globals.game.combat.current = { round: 2, turn: 0, combatantId: 'combatant-1' };
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round: 2, turn: 0 });
    // The GM observes another user's HUD move; classify the initiating user,
    // not the GM who receives the hook.
    handlers.get('moveToken')(token, { ...movement, method: 'hud' }, {}, { id: 'player', isGM: false });
    expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeFalse();
    runtime.stop();
  });

  test('charges Dazed Actions only on completed attack rolls and keeps turn changes isolated', async () => {
    const target = actor('dazed-attack-target', { isOwner: true });
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(target, 1, 0);
    await runtime.apply(target, 'dazed', {});
    const token = { actor: target };
    const movement = { method: 'dragging', passed: { waypoints: [{ x: 100, y: 100 }] } };
    const startTurn = async (round: number) => {
      globals.game.combat.round = round;
      globals.game.combat.current = { round, turn: 0, combatantId: 'combatant-1' };
      await runtime.handleTriggerEvent({
        event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target,
        combatUuid: 'Combat.test', round, turn: 0,
      });
    };
    const attack = (id: string, itemType = 'weapon') => ({
      id, actor: target, type: 'attack', item: { type: itemType }, activation: { type: 'action' },
    });
    const attackConfig = (subject: any) => ({ subject, ability: 'str', rolls: [{ parts: [] }] });
    const configureRolls = (config: any, rolls: any[]) => {
      handlers.get('dnd5e.postAttackRollConfiguration')(rolls, config);
      return rolls;
    };

    await startTurn(1);
    const canceledAttack = attack('canceled-attack');
    expect(handlers.get('dnd5e.preUseActivity')(canceledAttack, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(canceledAttack, {});
    const canceledConfig = attackConfig(canceledAttack);
    expect(handlers.get('dnd5e.preRollAttack')(canceledConfig)).toBeUndefined();
    configureRolls(canceledConfig, []);
    // dnd5e 5.3.3 returns null for an empty roll array before emitting rollAttack.
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeUndefined();
    handlers.get('dnd5e.rollAttack')([], { subject: canceledAttack });
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeUndefined();

    const directAttack = attack('direct-weapon-attack');
    const staleConfig = attackConfig(directAttack);
    expect(handlers.get('dnd5e.preRollAttack')(staleConfig)).toBeUndefined();
    const staleRolls = configureRolls(staleConfig, [{ total: 10 }]);
    await startTurn(2);
    handlers.get('dnd5e.rollAttack')(staleRolls, { subject: staleConfig.subject });
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeUndefined();

    const directConfig = attackConfig(directAttack);
    expect(handlers.get('dnd5e.preRollAttack')(directConfig)).toBeUndefined();
    const weaponRolls = configureRolls(directConfig, [{ total: 15 }]);
    handlers.get('dnd5e.rollAttack')(weaponRolls, { subject: directAttack });
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeFalse();

    await startTurn(3);
    const spellAttack = attack('spell-attack', 'spell');
    expect(handlers.get('dnd5e.preUseActivity')(spellAttack, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(spellAttack, {});
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeUndefined();
    const spellConfig = attackConfig(spellAttack);
    expect(handlers.get('dnd5e.preRollAttack')(spellConfig)).toBeUndefined();
    const spellRolls = configureRolls(spellConfig, [{ total: 14 }]);
    handlers.get('dnd5e.rollAttack')(spellRolls, { subject: spellAttack });
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeFalse();

    await startTurn(4);
    const utility = { actor: target, type: 'utility', item: { type: 'weapon' }, activation: { type: 'action' } };
    expect(handlers.get('dnd5e.preUseActivity')(utility, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(utility, {});
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeFalse();

    await startTurn(5);
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeUndefined();
    handlers.get('moveToken')(token, movement);
    const movementFirstAttack = attackConfig(attack('movement-first-attack'));
    expect(handlers.get('dnd5e.preRollAttack')(movementFirstAttack)).toBeFalse();
    runtime.stop();
  });

  test('Bewildered restricts spells only; Distracted blocks Reaction while Shocked allows it', async () => {
    const target = actor('activity-target');
    const { handlers, runtime } = runtimeFixture(target);
    await runtime.apply(target, 'bewildered', {});
    const use = (item: any, activation: string) => handlers.get('dnd5e.preUseActivity')({ actor: target, activation: { type: activation }, item }, {});
    expect(use({ type: 'weapon' }, 'action')).toBeUndefined();
    expect(use({ type: 'feat' }, 'action')).toBeUndefined();
    expect(use({ type: 'spell', system: { level: 0 } }, 'action')).toBeUndefined();
    expect(use({ type: 'spell', system: { level: 1 } }, 'action')).toBeFalse();
    expect(use({ type: 'spell', system: { level: 0 } }, 'bonus')).toBeFalse();
    await runtime.remove(target, runtime.list(target)[0]!.id);
    await runtime.apply(target, 'distracted', {});
    expect(use({ type: 'feat' }, 'reaction')).toBeFalse();
    await runtime.remove(target, runtime.list(target)[0]!.id);
    await runtime.apply(target, 'shocked', {});
    expect(use({ type: 'feat' }, 'reaction')).toBeUndefined();
    runtime.stop();
  });

  test('Staggered counts actual weapon attacks after they roll, not weapon utility activities', async () => {
    const target = actor('staggered-target');
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(target, 1, 0);
    await runtime.apply(target, 'staggered', {});
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round: 1, turn: 0 });
    const utility = { actor: target, type: 'utility', item: { type: 'weapon' }, activation: { type: 'action' } };
    const attack = { actor: target, type: 'attack', item: { type: 'weapon' }, activation: { type: 'action' } };
    expect(handlers.get('dnd5e.preUseActivity')(utility, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(utility, {});
    const spellAttack = { actor: target, type: 'attack', item: { type: 'spell' }, activation: { type: 'action' } };
    expect(handlers.get('dnd5e.preUseActivity')(spellAttack, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(spellAttack, {});
    const spellConfig: any = { subject: spellAttack, rolls: [{ parts: [] }] };
    expect(handlers.get('dnd5e.preRollAttack')(spellConfig)).toBeUndefined();
    const spellRolls = [{ total: 12 }];
    handlers.get('dnd5e.postAttackRollConfiguration')(spellRolls, spellConfig);
    handlers.get('dnd5e.rollAttack')(spellRolls, { subject: spellAttack });
    expect(handlers.get('dnd5e.preUseActivity')(attack, {})).toBeUndefined();
    handlers.get('dnd5e.rollAttack')([{ total: 12 }], { subject: attack });
    expect(handlers.get('dnd5e.preUseActivity')(attack, {})).toBeFalse();
    const config: any = { subject: attack, rolls: [{ parts: [] }] };
    expect(handlers.get('dnd5e.preRollAttack')(config)).toBeFalse();
    globals.game.combat.round = 2;
    globals.game.combat.current = { round: 2, turn: 0, combatantId: 'combatant-1' };
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round: 2, turn: 0 });
    expect(handlers.get('dnd5e.preUseActivity')(attack, {})).toBeUndefined();
    runtime.stop();
  });

  test('Shocked drops held items but keeps worn armor, spends an Action on equip, and leaves Reactions available', async () => {
    const target = actor('shocked-target', { isOwner: true });
    const weapon = { id: 'weapon-one', type: 'weapon', parent: target, system: { equipped: true } };
    const armor = { id: 'armor-one', type: 'equipment', parent: target, system: { equipped: true, type: { value: 'heavy' } } };
    target.items.push(weapon, armor);
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(target, 1, 0);
    await runtime.apply(target, 'shocked', {});
    expect(weapon.system.equipped).toBeFalse();
    expect(armor.system.equipped).toBeTrue();
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round: 1, turn: 0 });
    const reaction = { actor: target, activation: { type: 'reaction' }, item: { type: 'feat' } };
    expect(handlers.get('dnd5e.preUseActivity')(reaction, {})).toBeUndefined();
    const equip = { 'system.equipped': true };
    expect(handlers.get('preUpdateItem')(weapon, equip, {})).toBeUndefined();
    handlers.get('updateItem')(weapon, equip, {}, 'gm');
    expect(handlers.get('preUpdateItem')(weapon, equip, {})).toBeFalse();
    runtime.stop();
  });

  test('persists Frozen damage from typed calculateDamage results and removes at the threshold', async () => {
    const target = actor('frozen-target', { isOwner: true });
    const { handlers, runtime } = runtimeFixture(target);
    await runtime.apply(target, 'frozen', { escapeDC: 14, breakDamage: 30 });

    const firstOptions = {};
    handlers.get('dnd5e.calculateDamage')(target, [{ type: 'fire', value: 8 }, { type: 'cold', value: 99 }], firstOptions);
    handlers.get('dnd5e.applyDamage')(target, 8, firstOptions);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(runtime.list(target)[0]?.instance.params.breakDamageTaken).toBe(8);

    const reusedOptions = {};
    handlers.get('dnd5e.calculateDamage')(target, [{ type: 'fire', value: 5 }], reusedOptions);
    handlers.get('dnd5e.calculateDamage')(target, [{ type: 'cold', value: 50 }], reusedOptions);
    handlers.get('dnd5e.applyDamage')(target, 5, reusedOptions);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(runtime.list(target)[0]?.instance.params.breakDamageTaken).toBe(8);

    const secondOptions = {};
    const calculated: any = [{ type: 'fire', value: 8.9 }];
    calculated.amount = 8;
    handlers.get('dnd5e.calculateDamage')(target, calculated, secondOptions);
    handlers.get('dnd5e.applyDamage')(target, 8, secondOptions);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(runtime.list(target)[0]?.instance.params.breakDamageTaken).toBe(16);

    const thirdOptions = {};
    handlers.get('dnd5e.calculateDamage')(target, [{ type: 'bludgeoning', value: 14 }], thirdOptions);
    handlers.get('dnd5e.applyDamage')(target, 14, thirdOptions);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(runtime.list(target)).toHaveLength(0);
    runtime.stop();
  });

  test('escapeFrozen lets a helper roll Athletics, spends Action after the roll, and removes Frozen only on success', async () => {
    const target = actor('frozen-target');
    const helper = actor('helper', { isOwner: true });
    const { globals, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(helper, 1, 0);
    const helperCombatant = globals.game.combat.combatant;
    helperCombatant.id = 'helper-turn';
    globals.game.combat.current = { round: 1, turn: 0, combatantId: 'helper-turn' };
    globals.game.combat.combatants.get = (id: string) => id === 'helper-turn' ? helperCombatant : undefined;
    globals.game.combat.turns = [helperCombatant];
    await runtime.apply(target, 'frozen', { escapeDC: 14 });
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: helper, combatUuid: 'Combat.test', round: 1, turn: 0 });
    const effectIdValue = runtime.list(target)[0]!.id;
    helper.rollSkill = async (config: any) => { expect(config).toMatchObject({ skill: 'ath', ability: 'str', target: 14 }); return [{ total: 10 }]; };
    const failed = await runtime.escapeFrozen(target, effectIdValue, helper);
    expect(failed).toMatchObject({ attempted: true, success: false, total: 10, dc: 14, conditionRemoved: false });
    expect(runtime.list(target)).toHaveLength(1);
    expect(helper.flags['fvtt-custom-conditions'].turnState.actionUsed).toBeTrue();

    globals.game.combat.round = 2;
    globals.game.combat.current = { round: 2, turn: 0, combatantId: 'helper-turn' };
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: helper, combatUuid: 'Combat.test', round: 2, turn: 0 });
    helper.rollSkill = async () => [{ total: 18 }];
    const succeeded = await runtime.escapeFrozen(target, effectIdValue, helper);
    expect(succeeded).toMatchObject({ attempted: true, success: true, total: 18, dc: 14, conditionRemoved: true });
    expect(runtime.list(target)).toHaveLength(0);
    runtime.stop();
  });

  test('Helpless critical conversion uses the attack message target snapshot and never turns a miss into a hit', async () => {
    const target = actor('helpless-target');
    const currentButUnrelatedTarget = actor('unrelated');
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.fromUuidSync = (uuid: string) => uuid === target.uuid ? target : currentButUnrelatedTarget;
    globals.game.user.targets.add({ actor: currentButUnrelatedTarget });
    await runtime.apply(target, 'helpless', {});
    const activity = { type: 'attack', item: { type: 'weapon' }, damage: { parts: [{ types: new Set(['slashing']) }] } };
    const hitDie: any = { total: 8, options: {} };
    const hit: any = { total: 15, d20: hitDie, options: {}, isFumble: false, toJSON: () => ({ total: hit.total, options: { ...hit.options }, d20: { options: { ...hitDie.options } } }) };
    const message: any = { rolls: [hit], getAssociatedActivity: () => activity, updateSource: (update: any) => { message.savedRolls = update.rolls; } };
    handlers.get('preCreateChatMessage')(message, { flags: { dnd5e: { roll: { type: 'attack' }, targets: [{ uuid: target.uuid, ac: 12 }] } } });
    expect(hit.options.criticalSuccess).toBe(8);
    expect(hitDie.options.criticalSuccess).toBe(8);
    expect(message.savedRolls[0].options.criticalSuccess).toBe(8);

    const missDie: any = { total: 8, options: {} };
    const miss: any = { total: 11, d20: missDie, options: {}, isFumble: false, toJSON: () => ({ hit: false }) };
    message.rolls = [miss];
    handlers.get('preCreateChatMessage')(message, { flags: { dnd5e: { roll: { type: 'attack' }, targets: [{ uuid: target.uuid, ac: 12 }] } } });
    expect(missDie.options.criticalSuccess).toBeUndefined();

    await runtime.remove(target, runtime.list(target)[0]!.id);
    await runtime.apply(target, 'frozen', { escapeDC: 14 });
    const bludgeoning: any = { total: 15, d20: { total: 8, options: {} }, options: {}, isFumble: false, toJSON: () => ({}) };
    message.rolls = [bludgeoning];
    message.getAssociatedActivity = () => ({ type: 'attack', item: { type: 'weapon' }, damage: { parts: [{ types: new Set(['bludgeoning']) }] } });
    handlers.get('preCreateChatMessage')(message, { flags: { dnd5e: { roll: { type: 'attack' }, targets: [{ uuid: target.uuid, ac: 12 }] } } });
    expect(bludgeoning.d20.options.criticalSuccess).toBe(8);
    const slashing: any = { total: 15, d20: { total: 8, options: {} }, options: {}, isFumble: false, toJSON: () => ({}) };
    message.rolls = [slashing];
    message.getAssociatedActivity = () => ({ type: 'attack', item: { type: 'weapon', system: { damage: { base: { types: new Set(['bludgeoning']) } } } }, damage: { parts: [{ types: new Set(['slashing']) }] } });
    handlers.get('preCreateChatMessage')(message, { flags: { dnd5e: { roll: { type: 'attack' }, targets: [{ uuid: target.uuid, ac: 12 }] } } });
    expect(slashing.d20.options.criticalSuccess).toBeUndefined();
    runtime.stop();
  });

  test('Weakened transforms already-configured weapon/spell damage terms but leaves healing untouched', async () => {
    class OperatorTerm { constructor(public data: any) {} get operator() { return this.data.operator; } get flavor() { return ''; } toJSON() { return this.data; } }
    class NumericTerm { constructor(public data: any) {} get flavor() { return this.data.options?.flavor ?? ''; } get number() { return this.data.number; } toJSON() { return this.data; } }
    class ParentheticalTerm { static fromTerms(terms: any[], options: any) { return { kind: 'parenthetical', terms, options, flavor: options?.flavor ?? '' }; } }
    class RollTerm { static fromData(term: any) { return structuredClone(term); } }
    const target = actor('weakened-target');
    const { globals, handlers, runtime } = runtimeFixture(target, {
      foundry: { dice: { terms: { OperatorTerm, NumericTerm, ParentheticalTerm, RollTerm } } },
      CONFIG: { DND5E: { damageTypes: { fire: {}, cold: {} }, healingTypes: { healing: {}, temphp: {} }, conditionEffects: { noMovement: new Set(), halfMovement: new Set() } } },
    });
    await runtime.apply(target, 'weakened', {});
    const activity = { type: 'damage', actor: target, item: { type: 'weapon', actor: target } };
    const roll: any = {
      terms: [{ flavor: 'fire', number: 2, toJSON() { return { flavor: this.flavor, number: this.number }; } }, new OperatorTerm({ operator: '+' }), { flavor: 'cold', number: 4, toJSON() { return { flavor: this.flavor, number: this.number }; } }],
      options: { type: 'fire' }, resetFormula() { this.reset = true; },
    };
    handlers.get('dnd5e.postDamageRollConfiguration')([roll], { subject: activity });
    const groups = roll.terms.filter((term: any) => term?.kind === 'parenthetical');
    expect(groups).toHaveLength(2);
    expect(groups.map((term: any) => term.flavor)).toEqual(['fire', 'cold']);
    expect(roll.terms.at(-1).number).toBe(0.5);
    expect(roll.reset).toBeTrue();

    const healingRoll: any = { terms: [{ flavor: 'healing', number: 12 }], options: { type: 'healing' } };
    handlers.get('dnd5e.postDamageRollConfiguration')([healingRoll], { subject: { type: 'heal', actor: target, item: { type: 'spell', actor: target } } });
    expect(healingRoll.terms).toHaveLength(1);
    const healingTypedRoll: any = { terms: [{ flavor: 'healing', number: 12 }], options: { type: 'healing' } };
    handlers.get('dnd5e.postDamageRollConfiguration')([healingTypedRoll], { subject: { type: 'cast', actor: target, item: { type: 'spell', actor: target } } });
    expect(healingTypedRoll.terms).toHaveLength(1);
    runtime.stop();
  });
});
