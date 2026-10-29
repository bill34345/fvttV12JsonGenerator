import { describe, expect, test } from 'bun:test';
import {
  CONDITION_DEFINITIONS,
  CUSTOM_CONDITION_IDS,
  buildConditionFlag,
  createConditionInstance,
  isSafeConditionFormula,
  parseConditionInstance,
  projectedConditionStatusId,
} from '@fvtt-json-generator/contracts/conditions';
import { ConditionRuntime, changesFor, registerConditionMappings } from '../src/runtime.ts';

function actor(id = 'target', extra: Record<string, unknown> = {}): any {
  const data: any = { _id: id, uuid: `Actor.${id}`, name: id, documentName: 'Actor', system: { attributes: { hp: { value: 20, max: 20 }, ac: { value: 12 }, movement: { walk: 30 } } }, effects: [], items: [], flags: {}, ...extra };
  return {
    ...data,
    toObject: () => structuredClone(data),
    async createEmbeddedDocuments(_type: string, entries: any[]) { const created = entries.map((entry, index) => ({ ...entry, id: `effect-${data.effects.length + index}`, _id: `effect-${data.effects.length + index}`, parent: this })); data.effects.push(...created); return created; },
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
  test.each([['14.364', '5.3.3'], ['14.368', '5.3.3'], ['14.368', '6.0.5'], ['14.368', '6.0.6']])('applies nineteen-condition instances and native roll config modifiers on %s/%s', async (core, system) => {
    const { runtime, target, handlers } = runtimeFixture(actor(), {
      game: { version: core, system: { id: 'dnd5e', version: system } },
    });
    expect(runtime.definitions().map(definition => definition.id).sort()).toEqual([...CUSTOM_CONDITION_IDS].sort());
    const effect = await runtime.apply(target, 'sickened', {});
    expect(effect.statuses).toEqual([projectedConditionStatusId('sickened')]);
    const conSave = { subject: target, ability: 'con', rolls: [{ parts: ['1d20'], options: {} }], disadvantage: false };
    handlers.get('dnd5e.preRollSavingThrow')(conSave);
    expect(conSave.disadvantage).toBeTrue();
    const conCheck = { subject: target, ability: 'con', rolls: [{ parts: ['1d20'], options: {} }], disadvantage: false };
    handlers.get('dnd5e.preRollAbilityCheck')(conCheck);
    expect(conCheck.disadvantage).toBeFalse();
    await runtime.remove(target, effect.id);
    expect(runtime.list(target)).toEqual([]);
  });

  test.each([['14.364', '6.0.5', 'dnd5e'], ['14.368', '5.3.2', 'dnd5e'],
    ['14.368', '6.0.7', 'dnd5e'], ['14.368', '6.0.5', 'other-system'],
    ['14.364', '5.3.3', 'other-system']])('rejects unreviewed or crossed nineteen-condition runtime %s/%s/%s', async (core, system, id) => {
    const { runtime, target } = runtimeFixture(actor(), { game: { version: core, system: { id, version: system } } });
    expect(runtime.definitions()).toEqual([]);
    await expect(runtime.apply(target, 'dazed', {})).rejects.toThrow();
  });

  test('the reviewed Next pair exposes its native weapon writer while malformed input remains rejected', async () => {
    const { runtime, target } = runtimeFixture(actor(), { game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' } } });
    expect(runtime.definitions()).toHaveLength(19);
    expect(runtime.weaponEffects.isSupported()).toBeTrue();
    expect(runtime.weaponEffects.isNative6Supported()).toBeTrue();
    await expect(runtime.weaponEffects.apply(target, {} as any)).rejects.toThrow();
  });

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

  test('does not create parameterless or malformed Burning instances from HUD manager input', () => {
    expect(() => createConditionInstance('burning', {})).toThrow('formula');
    expect(() => createConditionInstance('burning', { formula: '1d6' })).toThrow('damageType');
    expect(() => createConditionInstance('burning', { formula: '1d6', damageType: ' ' })).toThrow('damageType');
    expect(() => createConditionInstance('burning', { formula: 'game.foo()', damageType: 'fire' })).toThrow('formula');
    expect(createConditionInstance('burning', { formula: '1d6', damageType: 'fire' }).params).toMatchObject({
      formula: '1d6', damageType: 'fire', timing: 'turnEnd', stacking: 'highest',
    });
  });
});

describe('condition runtime', () => {
  test('publishes optional AC5e target advantage as an owned status rule and removes only its own entry', async () => {
    const id = projectedConditionStatusId('defenseless');
    const native = { _id: 'paralyzed', rules: { attack: { opponent: () => 'advantage' } } };
    const table: any = { paralyzed: native };
    const { target, runtime } = runtimeFixture(actor(), {
      ac5e: { statusEffectsTables: table },
      game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' },
        modules: { get: (name: string) => name === 'automated-conditions-5e' ? { active: true, version: '14.603.2' } : undefined } },
    });
    expect(table[id]).toMatchObject({ _id: id });
    const rule = table[id].rules.attack.opponent;
    expect(rule({ opponent: target })).toBe('');
    const effect = await runtime.apply(target, 'defenseless', {});
    expect(rule({ opponent: target })).toBe('advantage');
    effect.disabled = true;
    expect(rule({ opponent: target })).toBe('');
    effect.disabled = false;
    await runtime.remove(target, effect.id);
    expect(rule({ opponent: target })).toBe('');
    target.effects.push({ id: 'bare', statuses: [id], disabled: false, flags: {} });
    expect(rule({ opponent: target })).toBe('');
    runtime.stop();
    expect(table[id]).toBeUndefined();
    expect(table.paralyzed).toBe(native);
  });

  test('Next optional Defenseless entry preserves its configured status name', () => {
    const id = projectedConditionStatusId('defenseless');
    const table: Record<string, any> = {};
    const { runtime } = runtimeFixture(actor(), {
      ac5e: { statusEffectsTables: table },
      CONFIG: { statusEffects: [{ id, name: '自定义无防备' }] },
      game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' },
        modules: { get: (name: string) => name === 'automated-conditions-5e' ? { active: true, version: '14.603.2' } : undefined } },
    });
    expect(table[id]?.name).toBe('自定义无防备');
    runtime.stop();
  });

  test('optional target registry recovers delayed API initialization and preserves a later foreign replacement', async () => {
    const id = projectedConditionStatusId('defenseless');
    const { target, globals, handlers, runtime } = runtimeFixture(actor(), {
      game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' },
        modules: { get: (name: string) => name === 'automated-conditions-5e' ? { active: true, version: '14.603.2' } : undefined } },
    });
    globals.ac5e = { statusEffectsTables: {} };
    handlers.get('ac5e.statusEffectsReady')();
    expect(globals.ac5e.statusEffectsTables[id]?._id).toBe(id);
    await runtime.apply(target, 'frozen', { escapeDC: 10 });
    expect(globals.ac5e.statusEffectsTables[id]?.rules.attack.opponent({ opponent: target })).toBe('advantage');
    const foreign = { _id: id, rules: { attack: { opponent: () => 'other-rule' } } };
    globals.ac5e.statusEffectsTables[id] = foreign;
    runtime.stop();
    expect(globals.ac5e.statusEffectsTables[id]).toBe(foreign);
  });

  test.each(['14.603.1', undefined])('leaves the optional public registry untouched on unverified AC5e %s', (version) => {
    const table = {};
    const { runtime } = runtimeFixture(actor(), {
      ac5e: { statusEffectsTables: table },
      game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' },
        modules: { get: (name: string) => name === 'automated-conditions-5e' ? { active: true, version } : undefined } },
    });
    expect(table).toEqual({}); runtime.stop(); expect(table).toEqual({});
  });

  test('does not replace a pre-existing optional target rule', () => {
    const id = projectedConditionStatusId('defenseless'), foreign = { _id: id, rules: { attack: { opponent: () => 'foreign' } } };
    const table = { [id]: foreign };
    const { runtime } = runtimeFixture(actor(), {
      ac5e: { statusEffectsTables: table },
      game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' },
        modules: { get: (name: string) => name === 'automated-conditions-5e' ? { active: true, version: '14.603.2' } : undefined } },
    });
    expect(table[id]).toBe(foreign); runtime.stop(); expect(table[id]).toBe(foreign);
  });

  test('Mirror AC5e recognizes only active Strength and Dexterity condition attack sources', async () => {
    const strId = projectedConditionStatusId('enfeebled'), dexId = projectedConditionStatusId('clumsy');
    const native = { _id: 'paralyzed', rules: { attack: { opponent: () => 'advantage' } } };
    const table: Record<string, any> = { paralyzed: native };
    const { target, runtime } = runtimeFixture(actor(), {
      ac5e: { statusEffectsTables: table },
      game: { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' },
        i18n: { localize: (key: string) => `本地化 ${key}` },
        modules: { get: (name: string) => name === 'automated-conditions-5e' ? { active: true, version: '14.533.8' } : undefined } },
    });
    expect(table[strId].name).toBe('本地化 FVTTCONDITIONS.Condition.enfeebled.Name');
    expect(table[dexId].name).toBe('本地化 FVTTCONDITIONS.Condition.clumsy.Name');
    expect(table.paralyzed).toBe(native);
    const strength = table[strId].rules.attack.subject, dexterity = table[dexId].rules.attack.subject;
    expect(strength({ subject: target, ability: 'str' })).toBe('');
    const enfeebled = await runtime.apply(target, 'enfeebled', {});
    const clumsy = await runtime.apply(target, 'clumsy', {});
    expect(strength({ subject: target, ability: 'str' })).toBe('disadvantage');
    expect([table.paralyzed.rules.attack.opponent({}), strength({ subject: target, ability: 'str' })]).toEqual(['advantage', 'disadvantage']);
    expect(strength({ subject: target, ability: 'dex' })).toBe('');
    expect(dexterity({ subject: target, ability: 'dex' })).toBe('disadvantage');
    expect(dexterity({ subject: target, ability: 'con' })).toBe('');
    // AC5e receives a source it can compose with a real advantage source;
    // neither condition reports a made-up advantage or a forced final mode.
    expect(strength({ subject: actor('other'), ability: 'str' })).toBe('');
    enfeebled.disabled = true;
    expect(strength({ subject: target, ability: 'str' })).toBe('');
    enfeebled.disabled = false;
    await runtime.remove(target, clumsy.id);
    expect(dexterity({ subject: target, ability: 'dex' })).toBe('');
    runtime.stop();
    expect(table[strId]).toBeUndefined(); expect(table[dexId]).toBeUndefined(); expect(table.paralyzed).toBe(native);
  });

  test('Mirror optional attack sources recover late public table initialization and preserve foreign replacements', () => {
    const strId = projectedConditionStatusId('enfeebled'), dexId = projectedConditionStatusId('clumsy');
    const { globals, handlers, runtime } = runtimeFixture(actor(), {
      game: { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' },
        modules: { get: (name: string) => name === 'automated-conditions-5e' ? { active: true, version: '14.533.8' } : undefined } },
    });
    const table: Record<string, any> = {};
    globals.ac5e = { statusEffectsTables: table };
    handlers.get('ac5e.statusEffectsReady')();
    const first = table[strId];
    handlers.get('ac5e.statusEffectsReady')();
    expect(table[strId]).toBe(first);
    expect(Object.keys(table).sort()).toEqual([strId, dexId].sort());
    const foreign = { _id: strId, rules: { attack: { subject: () => 'foreign' } } };
    table[strId] = foreign;
    runtime.stop();
    expect(table[strId]).toBe(foreign);
    expect(table[dexId]).toBeUndefined();
  });

  test.each([
    ['14.364', '5.3.3', '14.533.8', true], ['14.368', '5.3.3', '14.533.7', true],
    ['14.368', '5.3.3', '14.603.2', true], ['14.368', '5.3.3', '14.533.8', false],
  ] as const)('Mirror attack registry leaves unsupported %s/%s AC5e %s active=%s untouched', (core, system, version, active) => {
    const table = {};
    const { runtime } = runtimeFixture(actor(), {
      ac5e: { statusEffectsTables: table },
      game: { version: core, system: { id: 'dnd5e', version: system },
        modules: { get: (name: string) => name === 'automated-conditions-5e' ? { active, version } : undefined } },
    });
    expect(table).toEqual({}); runtime.stop(); expect(table).toEqual({});
  });

  test.each([
    ['enfeebled', ['str']], ['clumsy', ['dex']], ['addled', ['int', 'wis', 'cha']],
  ] as const)('%s persists native ability attack penalties before attack Hooks build their mode', async (condition, abilities) => {
    const { target, runtime } = runtimeFixture(actor(), {
      game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' } },
    });
    // r37/r38: attack mode is captured/rebuilt from the Actor before a late
    // preRollAttack boolean can reliably survive other configured roll modules.
    const effect = await runtime.apply(target, condition, {});
    const attackChanges = effect.changes.filter((change: any) => change.key.includes('.attack.roll.mode'));
    expect(attackChanges.map((change: any) => change.key).sort()).toEqual(
      abilities.map(ability => `system.abilities.${ability}.attack.roll.mode`).sort(),
    );
    for (const change of attackChanges) expect(change).toMatchObject({ mode: 2, value: '-1' });
    expect(effect.changes.some((change: any) => change.key === 'system.rolls.attack.mode')).toBeFalse();
    await runtime.remove(target, effect.id);
    expect(target.effects).toHaveLength(0);
    runtime.stop();
  });

  test('5.3.3 retains the ability attack Hook without creating unsupported native attack fields', async () => {
    const { target, runtime, handlers } = runtimeFixture(actor(), {
      game: { version: '14.364', system: { id: 'dnd5e', version: '5.3.3' } },
    });
    const effect = await runtime.apply(target, 'enfeebled', {});
    expect(effect.changes.some((change: any) => change.key.includes('.attack.roll.mode'))).toBeFalse();
    const config = { subject: { type: 'attack', actor: target }, ability: 'str', rolls: [{ parts: [] }], disadvantage: false };
    handlers.get('dnd5e.preRollAttack')(config);
    expect(config.disadvantage).toBeTrue();
    runtime.stop();
  });

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
      apiVersion: 1,
      subscribe: () => {
        if (!ready) throw new Error('FVTT Trigger Engine is not ready.');
        subscriptions += 1;
        return () => {};
      },
    };
    const globals: any = {
      game: { modules: { get: () => ({ active: true, api: triggerApi }) } },
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

  test('subscribes only to an active Trigger Engine with the recognized API version', () => {
    const handlers = new Map<string, any>();
    const subscriptions: string[] = [];
    let module: any;
    const globals: any = {
      game: { modules: { get: (id: string) => id === 'fvtt-trigger-engine' ? module : undefined } },
      CONFIG: { statusEffects: [] },
      Hooks: { on: (name: string, handler: any) => { handlers.set(name, handler); return name; }, off() {} },
    };
    const runtime = new ConditionRuntime(globals, () => true);
    const subscribe = () => { subscriptions.push('called'); return () => { subscriptions.push('unsubscribed'); }; };
    for (const candidate of [
      { active: false, api: { apiVersion: 1, subscribe } },
      { active: true, api: { apiVersion: 2, subscribe } },
      { active: true, api: { subscribe } },
      { active: true, api: { apiVersion: 1 } },
    ]) {
      module = candidate;
      if (!runtime.started) runtime.start();
      handlers.get('fvtt-trigger-engine.ready')();
      expect(subscriptions).toEqual([]);
    }
    module = { active: true, api: { apiVersion: 1, subscribe } };
    handlers.get('fvtt-trigger-engine.ready')();
    handlers.get('fvtt-trigger-engine.ready')();
    expect(subscriptions).toEqual(['called']);
    runtime.stop();
    expect(subscriptions).toEqual(['called', 'unsubscribed']);
  });

  test('applies a parameterized bleeding instance and exposes it through the same API used for static states', async () => {
    const gm = { id: 'gm', isGM: true, active: true };
    const target = actor();
    const globals: any = { game: { user: gm, users: { activeGM: gm } }, CONFIG: { statusEffects: [] }, Roll: class {} };
    const runtime = new ConditionRuntime(globals, () => true);
    const effect = await runtime.apply(target, 'bleeding', { formula: '4d4', stacking: 'stack' }, { origin: 'Item.bloodmourne' });
    expect(effect.flags['fvtt-custom-conditions'].condition).toMatchObject({ conditionId: 'bleeding', params: { formula: '4d4', mode: 'hpLoss', timing: 'turnEnd', stacking: 'highest' } });
    expect(effect.statuses).toEqual([projectedConditionStatusId('bleeding')]);
    expect(runtime.list(target)).toHaveLength(1);
    expect(runtime.list(target)[0]?.origin).toBe('Item.bloodmourne');
  });

  test('preserves native and foreign bare statuses while registering all custom statuses as module-owned', () => {
    const foreign = [
      { id: 'bleeding', label: 'Native Bleeding' },
      { id: 'burning', label: 'Native Burning' },
      { id: 'dazed', label: 'Foreign Dazed' },
    ];
    const statuses: any[] = [...foreign];
    const globals = { CONFIG: { statusEffects: statuses } };
    registerConditionMappings(globals);
    registerConditionMappings(globals);
    expect(statuses.slice(0, foreign.length)).toEqual(foreign);
    expect(statuses).toHaveLength(foreign.length + CUSTOM_CONDITION_IDS.length);
    for (const conditionId of CUSTOM_CONDITION_IDS) {
      expect(statuses.filter((status) => status.id === projectedConditionStatusId(conditionId))).toEqual([
        expect.objectContaining({ hud: false, flags: { 'fvtt-custom-conditions': { owned: true } } }),
      ]);
    }
  });

  test('continues to read flagged legacy effects with bare status IDs', () => {
    const instance = createConditionInstance('bleeding', { formula: '1d6' });
    const target = actor('legacy-bleeding', {
      effects: [{ id: 'legacy-effect', statuses: ['bleeding'], flags: buildConditionFlag(instance), disabled: false }],
    });
    const runtime = new ConditionRuntime({ CONFIG: { statusEffects: [] } }, () => true);
    expect(runtime.list(target)).toEqual([
      expect.objectContaining({ id: 'legacy-effect', instance: expect.objectContaining({ conditionId: 'bleeding' }) }),
    ]);
  });

  test('projects compound custom effects without reusing bare status IDs', async () => {
    const target = actor('compound-target');
    const runtime = new ConditionRuntime({
      game: { user: { id: 'gm' }, users: { activeGM: { id: 'gm' } } },
      CONFIG: { statusEffects: [] },
    }, () => true);
    const shocked = await runtime.apply(target, 'shocked', {});
    expect(shocked.statuses).toEqual([
      projectedConditionStatusId('shocked'),
      projectedConditionStatusId('dazed'),
      projectedConditionStatusId('defenseless'),
    ]);
    expect(shocked.flags['fvtt-custom-conditions'].condition.conditionId).toBe('shocked');
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
    expect(effects.noMovement.has(projectedConditionStatusId('immobilized'))).toBeTrue();
    expect(effects.noMovement.has(projectedConditionStatusId('frozen'))).toBeTrue();
    expect(effects.halfMovement.has(projectedConditionStatusId('slowed'))).toBeTrue();
    for (const instance of [immobilized, frozen, slowed]) {
      expect(changesFor(instance).some((change) => String(change.key).startsWith('system.attributes.movement.'))).toBeFalse();
    }
  });

  test.each([['slowed', 15], ['immobilized', 0], ['frozen', 0]] as const)('6.0.5 native movement property parsing recognizes %s', async (conditionId, expectedWalk) => {
    const effects = { noMovement: new Set<string>(), halfMovement: new Set<string>() };
    const { runtime, target, globals } = runtimeFixture(actor(), {
      game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' } },
      CONFIG: { statusEffects: [], DND5E: { conditionEffects: effects } },
    });
    const visibleStatusIds = globals.CONFIG.statusEffects.map((status: any) => status.id);
    const effect = await runtime.apply(target, conditionId, conditionId === 'frozen' ? { escapeDC: 14 } : {});
    const statuses = new Set<string>(effect.statuses);
    // dnd5e 6.0.5 Actor.hasConditionEffect parses each property as status-level.
    // A hyphen inside our public namespace must not become a fake status "fvtt".
    const matches = (properties: Set<string>) => [...properties].some(property => statuses.has(property.split('-')[0]!));
    const walk = matches(effects.noMovement) ? 0 : 30 * (matches(effects.halfMovement) ? 0.5 : 1);
    expect(walk).toBe(expectedWalk);
    expect(statuses.has(projectedConditionStatusId(conditionId))).toBeTrue();
    expect(runtime.definitions()).toHaveLength(19);
    expect(globals.CONFIG.statusEffects.map((status: any) => status.id)).toEqual(visibleStatusIds);
    expect(globals.CONFIG.statusEffects.some((status: any) => status.id.startsWith('fvttcc.'))).toBeFalse();
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

  test('a combat rewind invalidates timed-condition memory after document checkpoints were restored',async()=>{
    const {runtime,target,handlers}=runtimeFixture(actor(),{
      game:{version:'14.368',system:{id:'dnd5e',version:'6.0.6'}},
      Roll:class{total=4;async evaluate(){return this;}},
    });
    await runtime.apply(target,'bleeding',{formula:'4',mode:'hpLoss',timing:'turnEnd'});
    const flags=structuredClone(target.flags);
    const context={event:{type:'combatTurnEnd',documentType:'Actor'},document:target,combatUuid:'Combat.test',key:'Combat.test:end:1:0',round:1,turn:0};
    await runtime.handleTriggerEvent(context);await runtime.handleTriggerEvent(context);expect(target.system.attributes.hp.value).toBe(16);
    target.system.attributes.hp.value=20;for(const key of Object.keys(target.flags))delete target.flags[key];Object.assign(target.flags,flags);
    handlers.get('fvtt-trigger-engine.combatRewound')({combatUuid:'Combat.test',combat:{combatants:[{actor:target}]}});
    await runtime.handleTriggerEvent(context);await runtime.handleTriggerEvent(context);expect(target.system.attributes.hp.value).toBe(16);
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

  test('Dazed permits one chosen category among movement, Action, and Bonus Action on each turn', async () => {
    const target = actor('dazed-three-choices', { isOwner: true });
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(target);
    await runtime.apply(target, 'dazed', {});
    const token = { actor: target };
    const movement = { method: 'dragging', passed: { waypoints: [{ x: 10, y: 10 }] } };
    const action = { actor: target, type: 'utility', activation: { type: 'action' }, item: { type: 'feat' } };
    const bonus = { actor: target, type: 'utility', activation: { type: 'bonus' }, item: { type: 'feat' } };
    const reaction = { actor: target, type: 'utility', activation: { type: 'reaction' }, item: { type: 'feat' } };
    const turn = async (round: number) => {
      globals.game.combat.round = round;
      globals.game.combat.current = { round, turn: 0, combatantId: 'combatant-1' };
      await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round, turn: 0 });
    };

    await turn(1);
    expect(handlers.get('dnd5e.preUseActivity')(bonus, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(bonus, {});
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(target.flags['fvtt-custom-conditions'].turnState.bonusActionUsed).toBeTrue();
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeFalse();
    expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeFalse();
    expect(handlers.get('dnd5e.preUseActivity')(reaction, {})).toBeUndefined();

    await turn(2);
    expect(target.flags['fvtt-custom-conditions'].turnState.bonusActionUsed).toBeFalse();
    expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(action, {});
    expect(handlers.get('dnd5e.preUseActivity')(bonus, {})).toBeFalse();
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeFalse();

    await turn(3);
    handlers.get('moveToken')(token, movement);
    expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeFalse();
    expect(handlers.get('dnd5e.preUseActivity')(bonus, {})).toBeFalse();
    runtime.stop();
  });

  test('reads old persisted turn flags without bonusActionUsed and merges a new bonus use', async () => {
    const target = actor('old-dazed-flags', { isOwner: true, flags: { 'fvtt-custom-conditions': {
      turnState: { combatKey: 'Combat.test:1:0', weaponAttacks: 0, actionUsed: false, movementUsed: false },
    } } });
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(target);
    await runtime.apply(target, 'dazed', {});
    const bonus = { actor: target, type: 'utility', activation: { type: 'bonus' }, item: { type: 'feat' } };
    const action = { actor: target, type: 'utility', activation: { type: 'action' }, item: { type: 'feat' } };
    expect(handlers.get('dnd5e.preUseActivity')(bonus, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(bonus, {});
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(target.flags['fvtt-custom-conditions'].turnState.bonusActionUsed).toBeTrue();
    expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeFalse();
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

  test('Dazed charges Bonus Action attacks only after a non-empty roll on the same turn', async () => {
    const target = actor('dazed-bonus-attack', { isOwner: true });
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(target);
    await runtime.apply(target, 'dazed', {});
    const action = { actor: target, type: 'utility', activation: { type: 'action' }, item: { type: 'feat' } };
    const bonusAttack = { actor: target, type: 'attack', activation: { type: 'bonus' }, item: { type: 'weapon' } };
    const token = { actor: target };
    const movement = { method: 'dragging', passed: { waypoints: [{ x: 10, y: 10 }] } };
    const turn = async (round: number) => {
      globals.game.combat.round = round;
      globals.game.combat.current = { round, turn: 0, combatantId: 'combatant-1' };
      await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round, turn: 0 });
    };
    const configured = (rolls: any[]) => {
      const config = { subject: bonusAttack, rolls: [{ parts: [] }] };
      expect(handlers.get('dnd5e.preRollAttack')(config)).toBeUndefined();
      handlers.get('dnd5e.postAttackRollConfiguration')(rolls, config);
      return rolls;
    };

    await turn(1);
    expect(handlers.get('dnd5e.preUseActivity')(bonusAttack, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(bonusAttack, {});
    const canceled = configured([]);
    handlers.get('dnd5e.rollAttack')(canceled, { subject: bonusAttack });
    expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeUndefined();
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeUndefined();

    const stale = configured([{ total: 13 }]);
    await turn(2);
    handlers.get('dnd5e.rollAttack')(stale, { subject: bonusAttack });
    expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeUndefined();
    const completed = configured([{ total: 15 }]);
    handlers.get('dnd5e.rollAttack')(completed, { subject: bonusAttack });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(target.flags['fvtt-custom-conditions'].turnState.bonusActionUsed).toBeTrue();
    expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeFalse();
    expect(handlers.get('preMoveToken')(token, movement, {})).toBeFalse();
    runtime.stop();
  });

  test('Dazed and Shocked cancel an attack dialog when another turn category finishes first', async () => {
    for (const conditionId of ['dazed', 'shocked'] as const) {
      const target = actor(`dialog-${conditionId}`, { isOwner: true });
      const { globals, handlers, runtime } = runtimeFixture(target);
      globals.game.combat = combatFor(target);
      await runtime.apply(target, conditionId, {});
      const token = { actor: target };
      const movement = { method: 'dragging', passed: { waypoints: [{ x: 20, y: 20 }] } };
      const activity = (type: 'action' | 'bonus', isAttack: boolean) => ({
        actor: target, type: isAttack ? 'attack' : 'utility', activation: { type }, item: { type: 'feat' },
      });
      const startAttackDialog = (attack: any) => {
        expect(handlers.get('dnd5e.preUseActivity')(attack, {})).toBeUndefined();
        handlers.get('dnd5e.postUseActivity')(attack, {});
        const config = { subject: attack, rolls: [{ parts: [] }] };
        expect(handlers.get('dnd5e.preRollAttack')(config)).toBeUndefined();
        return config;
      };
      const finishOtherActivity = (other: any) => {
        expect(handlers.get('dnd5e.preUseActivity')(other, {})).toBeUndefined();
        handlers.get('dnd5e.postUseActivity')(other, {});
      };
      const turn = async (round: number) => {
        globals.game.combat.round = round;
        globals.game.combat.current = { round, turn: 0, combatantId: 'combatant-1' };
        await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round, turn: 0 });
      };
      await turn(1);
      const bonusAttack = activity('bonus', true);
      const pendingBonus = startAttackDialog(bonusAttack);
      finishOtherActivity(activity('action', false));
      expect(handlers.get('dnd5e.postAttackRollConfiguration')([{ total: 15 }], pendingBonus)).toBeFalse();
      expect(target.flags['fvtt-custom-conditions'].turnState.bonusActionUsed).toBeFalse();

      await turn(2);
      const pendingBonusAfterMove = startAttackDialog(bonusAttack);
      handlers.get('moveToken')(token, movement);
      expect(handlers.get('dnd5e.postAttackRollConfiguration')([{ total: 15 }], pendingBonusAfterMove)).toBeFalse();

      await turn(3);
      const actionAttack = activity('action', true);
      const pendingAction = startAttackDialog(actionAttack);
      finishOtherActivity(activity('bonus', false));
      expect(handlers.get('dnd5e.postAttackRollConfiguration')([{ total: 15 }], pendingAction)).toBeFalse();
      expect(target.flags['fvtt-custom-conditions'].turnState.actionUsed).toBeFalse();

      await turn(4);
      const pendingActionAfterMove = startAttackDialog(actionAttack);
      handlers.get('moveToken')(token, movement);
      expect(handlers.get('dnd5e.postAttackRollConfiguration')([{ total: 15 }], pendingActionAfterMove)).toBeFalse();

      await turn(5);
      const pendingCanceled = startAttackDialog(bonusAttack);
      expect(handlers.get('dnd5e.postAttackRollConfiguration')([], pendingCanceled)).toBeUndefined();
      expect(handlers.get('dnd5e.preUseActivity')(activity('action', false), {})).toBeUndefined();

      const pendingAcrossTurn = startAttackDialog(bonusAttack);
      await turn(6);
      expect(handlers.get('dnd5e.postAttackRollConfiguration')([{ total: 15 }], pendingAcrossTurn)).toBeFalse();
      expect(handlers.get('dnd5e.preUseActivity')(activity('action', false), {})).toBeUndefined();
      runtime.stop();
    }
  });

  test('Dazed and Shocked reserve an attack category during asynchronous roll evaluation', async () => {
    for (const conditionId of ['dazed', 'shocked'] as const) {
      const target = actor(`pending-${conditionId}`, { isOwner: true });
      const heldItem = { id: `held-${conditionId}`, type: 'weapon', parent: target, system: { equipped: false } };
      target.items.push(heldItem);
      const { globals, handlers, runtime } = runtimeFixture(target);
      const warnings: string[] = [];
      globals.ui.notifications.warn = (message: string) => { warnings.push(message); };
      globals.game.combat = combatFor(target);
      await runtime.apply(target, conditionId, {});
      const token = { actor: target };
      const movement = { method: 'dragging', passed: { waypoints: [{ x: 30, y: 30 }] } };
      const activity = (type: 'action' | 'bonus') => ({
        actor: target, type: 'attack', activation: { type }, item: { type: 'weapon' },
      });
      const pending = (attack: any) => {
        expect(handlers.get('dnd5e.preUseActivity')(attack, {})).toBeUndefined();
        handlers.get('dnd5e.postUseActivity')(attack, {});
        const config = { subject: attack, rolls: [{ parts: [] }] };
        expect(handlers.get('dnd5e.preRollAttack')(config)).toBeUndefined();
        const rolls = [{ total: 17 }];
        expect(handlers.get('dnd5e.postAttackRollConfiguration')(rolls, config)).toBeUndefined();
        return { attack, config, rolls };
      };
      const turn = async (round: number) => {
        globals.game.combat.round = round;
        globals.game.combat.current = { round, turn: 0, combatantId: 'combatant-1' };
        await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round, turn: 0 });
      };

      await turn(1);
      const bonus = pending(activity('bonus'));
      const action = activity('action');
      expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeFalse();
      expect(warnings.some((message) => message.includes('下回合自动重置'))).toBeTrue();
      const otherActor = actor(`other-${conditionId}`);
      await runtime.apply(otherActor, 'dazed', {});
      expect(handlers.get('dnd5e.preUseActivity')({
        actor: otherActor, type: 'utility', activation: { type: 'action' }, item: { type: 'feat' },
      }, {})).toBeUndefined();
      expect(handlers.get('dnd5e.preRollAttack')({ subject: action, rolls: [{ parts: [] }] })).toBeFalse();
      expect(handlers.get('preMoveToken')(token, movement, {})).toBeFalse();
      expect(target.flags['fvtt-custom-conditions'].turnState.bonusActionUsed).toBeFalse();
      handlers.get('dnd5e.rollAttack')(bonus.rolls, { subject: bonus.attack });
      expect(handlers.get('dnd5e.preUseActivity')(action, {})).toBeFalse();

      await turn(2);
      const actionPending = pending(activity('action'));
      expect(handlers.get('dnd5e.preUseActivity')(activity('bonus'), {})).toBeFalse();
      expect(handlers.get('preMoveToken')(token, movement, {})).toBeFalse();
      if (conditionId === 'shocked') {
        expect(handlers.get('preUpdateItem')(heldItem, { 'system.equipped': true }, {})).toBeFalse();
      }
      const effect = runtime.list(target)[0]!.effect;
      effect.disabled = true;
      expect(handlers.get('dnd5e.preUseActivity')(activity('bonus'), {})).toBeUndefined();
      effect.disabled = false;
      expect(handlers.get('dnd5e.preUseActivity')(activity('bonus'), {})).toBeFalse();
      // An exceptional roll failure has no rollAttack hook. Fail closed for
      // the rest of this turn rather than silently allowing another category.
      expect(handlers.get('dnd5e.preUseActivity')(activity('bonus'), {})).toBeFalse();
      await turn(3);
      expect(handlers.get('dnd5e.preUseActivity')(activity('bonus'), {})).toBeUndefined();
      handlers.get('dnd5e.rollAttack')(actionPending.rolls, { subject: actionPending.attack });
      expect(handlers.get('dnd5e.preUseActivity')(activity('bonus'), {})).toBeUndefined();

      const canceled = { subject: activity('bonus'), rolls: [{ parts: [] }] };
      expect(handlers.get('dnd5e.preRollAttack')(canceled)).toBeUndefined();
      expect(handlers.get('dnd5e.postAttackRollConfiguration')([], canceled)).toBeUndefined();
      expect(handlers.get('dnd5e.preUseActivity')(activity('action'), {})).toBeUndefined();
      pending(activity('bonus'));
      runtime.stop();
      runtime.start();
      expect(handlers.get('dnd5e.preUseActivity')(activity('action'), {})).toBeUndefined();
      runtime.stop();
    }
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

  test('Staggered shares one completed attack across weapon and unarmed classifications', async () => {
    const sequences = [
      ['weapon', 'unarmed'],
      ['unarmed', 'weapon'],
      ['unarmed', 'unarmed'],
    ] as const;
    for (const [firstKind, secondKind] of sequences) {
      const target = actor(`staggered-${firstKind}-${secondKind}`);
      const { globals, handlers, runtime } = runtimeFixture(target);
      globals.game.combat = combatFor(target);
      await runtime.apply(target, 'staggered', {});
      await runtime.handleTriggerEvent({
        event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target,
        combatUuid: 'Combat.test', round: 1, turn: 0,
      });
      const attack = (classification: string) => ({
        actor: target, type: 'attack',
        // A feat can own an unarmed Attack Activity; the item's type alone is not decisive.
        item: { type: classification === 'unarmed' ? 'feat' : 'weapon' },
        attack: { type: { classification } }, activation: { type: 'action' },
      });
      const first = attack(firstKind);
      const second = attack(secondKind);
      expect(handlers.get('dnd5e.preUseActivity')(first, {})).toBeUndefined();
      const firstConfig = { subject: first, rolls: [{ parts: [] }] };
      expect(handlers.get('dnd5e.preRollAttack')(firstConfig)).toBeUndefined();
      handlers.get('dnd5e.rollAttack')([{ total: 14 }], { subject: first });
      expect(handlers.get('dnd5e.preUseActivity')(second, {})).toBeFalse();
      expect(handlers.get('dnd5e.preRollAttack')({ subject: second, rolls: [{ parts: [] }] })).toBeFalse();
      runtime.stop();
    }
  });

  test('Staggered ignores weapon utility and spell-classified weapon attacks', async () => {
    const target = actor('staggered-classification-target');
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(target);
    await runtime.apply(target, 'staggered', {});
    await runtime.handleTriggerEvent({
      event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target,
      combatUuid: 'Combat.test', round: 1, turn: 0,
    });
    const utility = { actor: target, type: 'utility', item: { type: 'weapon' } };
    const spell = { actor: target, type: 'attack', item: { type: 'weapon' }, attack: { type: { classification: 'spell' } } };
    const unarmed = { actor: target, type: 'attack', item: { type: 'feat' }, system: { attack: { type: { classification: 'unarmed' } } } };
    handlers.get('dnd5e.rollAttack')([{ total: 12 }], { subject: utility });
    handlers.get('dnd5e.rollAttack')([{ total: 12 }], { subject: spell });
    expect(handlers.get('dnd5e.preUseActivity')(unarmed, {})).toBeUndefined();
    handlers.get('dnd5e.rollAttack')([{ total: 12 }], { subject: unarmed });
    expect(handlers.get('dnd5e.preUseActivity')(unarmed, {})).toBeFalse();
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

  test('Shocked inherits the three-way choice and blocks an item Action after a Bonus Action', async () => {
    const target = actor('shocked-three-choices', { isOwner: true });
    const weapon = { id: 'weapon', type: 'weapon', parent: target, system: { equipped: false } };
    target.items.push(weapon);
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(target);
    await runtime.apply(target, 'shocked', {});
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: target, combatUuid: 'Combat.test', round: 1, turn: 0 });
    const bonus = { actor: target, type: 'utility', activation: { type: 'bonus' }, item: { type: 'feat' } };
    const reaction = { actor: target, type: 'utility', activation: { type: 'reaction' }, item: { type: 'feat' } };
    expect(handlers.get('dnd5e.preUseActivity')(bonus, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(bonus, {});
    expect(handlers.get('preUpdateItem')(weapon, { 'system.equipped': true }, {})).toBeFalse();
    expect(handlers.get('preCreateItem')({ type: 'weapon', parent: target }, {}, {})).toBeFalse();
    expect(handlers.get('dnd5e.preUseActivity')(reaction, {})).toBeUndefined();
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

  test('Frozen escape refuses a Dazed helper who has chosen Bonus Action', async () => {
    const target = actor('frozen-bonus-target');
    const helper = actor('dazed-bonus-helper', { isOwner: true });
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(helper);
    await runtime.apply(target, 'frozen', { escapeDC: 14 });
    await runtime.apply(helper, 'dazed', {});
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: helper, combatUuid: 'Combat.test', round: 1, turn: 0 });
    const bonus = { actor: helper, type: 'utility', activation: { type: 'bonus' }, item: { type: 'feat' } };
    expect(handlers.get('dnd5e.preUseActivity')(bonus, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(bonus, {});
    let rollCalls = 0;
    helper.rollSkill = async () => { rollCalls += 1; return [{ total: 20 }]; };
    await expect(runtime.escapeFrozen(target, runtime.list(target)[0]!.id, helper)).rejects.toThrow('无法执行 Action');
    expect(rollCalls).toBe(0);
    runtime.stop();
  });

  test('Frozen escape refuses a Dazed helper while an attack is still evaluating', async () => {
    const target = actor('frozen-pending-target');
    const helper = actor('dazed-pending-helper', { isOwner: true });
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.game.combat = combatFor(helper);
    await runtime.apply(target, 'frozen', { escapeDC: 14 });
    await runtime.apply(helper, 'dazed', {});
    await runtime.handleTriggerEvent({ event: { type: 'combatTurnStart', documentType: 'Actor' }, document: helper, combatUuid: 'Combat.test', round: 1, turn: 0 });
    const bonusAttack = { actor: helper, type: 'attack', activation: { type: 'bonus' }, item: { type: 'weapon' } };
    const config = { subject: bonusAttack, rolls: [{ parts: [] }] };
    expect(handlers.get('dnd5e.preUseActivity')(bonusAttack, {})).toBeUndefined();
    handlers.get('dnd5e.postUseActivity')(bonusAttack, {});
    expect(handlers.get('dnd5e.preRollAttack')(config)).toBeUndefined();
    expect(handlers.get('dnd5e.postAttackRollConfiguration')([{ total: 15 }], config)).toBeUndefined();
    let rollCalls = 0;
    helper.rollSkill = async () => { rollCalls += 1; return [{ total: 20 }]; };
    await expect(runtime.escapeFrozen(target, runtime.list(target)[0]!.id, helper)).rejects.toThrow('攻击仍在结算');
    expect(rollCalls).toBe(0);
    runtime.stop();
  });

  test('6.0.5 Helpless critical conversion reads canonical attack type and system target Actor snapshots', async () => {
    const target = actor('next-helpless-target');
    const { globals, handlers, runtime } = runtimeFixture(target, { game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' } } });
    globals.fromUuidSync = (uuid: string) => uuid === target.uuid ? target : undefined;
    await runtime.apply(target, 'helpless', {});
    const die: any = { total: 8, options: {} };
    const hit: any = { total: 15, d20: die, options: {}, isFumble: false, toJSON: () => ({ options: { ...hit.options } }) };
    const message: any = { type: 'attack', system: { targets: [{ actor: target.uuid, token: 'Scene.test.Token.target', ac: 12 }] },
      rolls: [hit], getAssociatedActivity: () => ({ type: 'attack', item: { type: 'weapon' } }),
      updateSource(update: any) { this.savedRolls = update.rolls; } };
    target.system.attributes.ac.value = 99;
    handlers.get('preCreateChatMessage')(message, { type: 'attack', system: message.system });
    expect(hit.options.criticalSuccess).toBe(8);
    expect(message.savedRolls[0].options.criticalSuccess).toBe(8);
    const miss: any = { total: 11, d20: { total: 8, options: {} }, options: {}, isFumble: false, toJSON: () => ({}) };
    message.rolls = [miss];
    handlers.get('preCreateChatMessage')(message, { type: 'attack', system: message.system });
    expect(miss.options.criticalSuccess).toBeUndefined();
  });

  test('6.0.5 canonical non-attack or total-cover snapshots cannot fall back to conflicting legacy attack flags', async () => {
    const target = actor('next-cover-target');
    const { globals, handlers, runtime } = runtimeFixture(target, { game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' } } });
    globals.fromUuidSync = (uuid: string) => uuid === target.uuid ? target : undefined;
    await runtime.apply(target, 'helpless', {});
    const legacy = { dnd5e: { roll: { type: 'attack' }, targets: [{ uuid: target.uuid, ac: 12 }] } };
    for (const type of ['attack', 'save']) {
      const roll: any = { total: 25, d20: { total: 8, options: {} }, options: {}, isFumble: false, toJSON: () => ({}) };
      const message: any = { type, flags: legacy, system: { targets: [{ actor: target.uuid, ac: null }] }, rolls: [roll], updateSource() {} };
      handlers.get('preCreateChatMessage')(message, { type, system: message.system, flags: legacy });
      expect(roll.options.criticalSuccess).toBeUndefined();
    }
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

  test('Frozen treats bludgeoning weapon-classified attacks as critical, including attacks on feat items', async () => {
    const target = actor('frozen-classification-target');
    const { globals, handlers, runtime } = runtimeFixture(target);
    globals.fromUuidSync = (uuid: string) => uuid === target.uuid ? target : undefined;
    await runtime.apply(target, 'frozen', { escapeDC: 14 });
    const flags = { dnd5e: { roll: { type: 'attack' }, targets: [{ uuid: target.uuid, ac: 12 }] } };
    const criticalFor = (classification: string | undefined, itemType: string, damageType = 'bludgeoning') => {
      const roll: any = { total: 15, d20: { total: 8, options: {} }, options: {}, isFumble: false, toJSON: () => ({}) };
      const activity = {
        type: 'attack', item: { type: itemType },
        ...(classification ? { attack: { type: { classification } } } : {}),
        damage: { parts: [{ types: new Set([damageType]) }] },
      };
      const message = { rolls: [roll], getAssociatedActivity: () => activity, updateSource: () => {} };
      handlers.get('preCreateChatMessage')(message, { flags });
      return roll.d20.options.criticalSuccess;
    };
    expect(criticalFor('weapon', 'feat')).toBe(8);
    expect(criticalFor('weapon', 'weapon')).toBe(8);
    expect(criticalFor(undefined, 'weapon')).toBe(8);
    expect(criticalFor('unarmed', 'weapon')).toBeUndefined();
    expect(criticalFor('spell', 'weapon')).toBeUndefined();
    expect(criticalFor('weapon', 'feat', 'slashing')).toBeUndefined();
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
