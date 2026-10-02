import { describe, expect, test } from 'bun:test';
import { createWeaponMasteryRuntime, WEAPON_QUERY_CANCEL, WEAPON_QUERY_COMMIT, WEAPON_QUERY_PREPARE } from '../src/runtime.ts';
import { weaponConfigurationFlags, type WeaponConfiguration } from '@fvtt-json-generator/contracts/weapon-properties';

type EffectEntry = { id: string; instance: any; disabled?: boolean; name?: string };

function actor(id: string, extra: Record<string, any> = {}): any {
  const data: any = {
    id,
    _id: id,
    uuid: `Actor.${id}`,
    documentName: 'Actor',
    name: id,
    system: { attributes: { prof: 3, hp: { value: 20, max: 20, temp: 0 }, ac: { value: 12 } }, abilities: { str: { mod: 3 } }, traits: { size: 'med', weaponProf: { mastery: { value: new Set(['longsword']) } } } },
    effects: [],
    flags: {},
    ...extra,
  };
  return {
    ...data,
    toObject: () => structuredClone(data),
    getFlag(namespace: string, key: string) { return data.flags?.[namespace]?.[key]; },
    async setFlag(namespace: string, key: string, value: unknown) { data.flags ??= {}; data.flags[namespace] ??= {}; data.flags[namespace][key] = structuredClone(value); return value; },
    async update(update: any) { for (const [key, value] of Object.entries(update)) if (key === 'system.attributes.hp.value') data.system.attributes.hp.value = value; },
    testUserPermission(user: any, level: string) { return level === 'OWNER' && user?.id === 'player'; },
    async applyDamage(damages: any[]) { const amount = damages.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0); data.system.attributes.hp.value -= amount; return amount; },
  };
}

function effect(kind: 'sap' | 'vex', source: string, target: string, id: string): EffectEntry {
  return {
    id,
    instance: {
      schemaVersion: 1,
      instanceId: `${id}-instance`,
      revision: 0,
      effectKind: kind,
      ruleId: `dnd2024.${kind}`,
      stackingGroup: `dnd2024.${kind}`,
      params: {},
      source: { actorUuid: source },
      target: { actorUuid: target },
      enabled: true,
      consumeOn: 'nextCompletedAttack',
      createdAt: Date.now(),
    },
  };
}

function fixture(options: { player?: boolean; wm5e?: boolean } = {}) {
  const gm = { id: 'gm', isGM: true, active: true };
  const player = { id: 'player', isGM: false, active: true };
  const current = options.player ? player : gm;
  const actors = new Map<string, any>();
  const items = new Map<string, any>();
  const activities = new Map<string, any>();
  const messages = new Map<string, any>();
  const weaponEffects = {
    version: 1 as const,
    list: (target: any) => target?.effects ?? [],
    async reserve(target: any, input: any) {
      const entry = target.effects.find((candidate: EffectEntry) => candidate.id === input.effectId);
      if (!entry || entry.instance.reservation) return undefined;
      entry.instance.reservation = { attackId: input.attackId, instanceId: entry.instance.instanceId, revision: 1, state: 'reserved', reservedAt: Date.now(), ...(input.targetActorUuid ? { targetActorUuid: input.targetActorUuid } : {}) };
      return { effectId: entry.id, ...entry.instance.reservation };
    },
    async start(target: any, ticket: any) { const entry = target.effects.find((candidate: EffectEntry) => candidate.id === ticket.effectId); entry.instance.reservation = { ...entry.instance.reservation, ...ticket, state: 'started', revision: ticket.revision + 1 }; return { ...ticket, state: 'started', revision: ticket.revision + 1 }; },
    async commit(target: any, ticket: any) { const index = target.effects.findIndex((candidate: EffectEntry) => candidate.id === ticket.effectId); if (index >= 0) target.effects.splice(index, 1); },
    async cancel(target: any, ticket: any) { const entry = target.effects.find((candidate: EffectEntry) => candidate.id === ticket.effectId); if (entry) entry.instance.reservation = undefined; },
    async apply() { return undefined; },
    async remove() {},
    async setEnabled() {},
  };
  const modules = new Map<string, any>([
    ['fvtt-custom-conditions', { id: 'fvtt-custom-conditions', version: '0.1.1', active: true, api: { weaponEffects } }],
    ['fvtt-trigger-engine', { id: 'fvtt-trigger-engine', version: '0.1.1', active: true, api: { apiVersion: 1, capabilities: { externalEvents: 1 }, subscribeExternal: () => () => {}, publishExternal: async () => ({ status: 'published' }) } }],
  ]);
  if (options.wm5e) modules.set('wm5e', { id: 'wm5e', version: '14.0.0', active: true });
  const hooks = new Map<string, Function[]>();
  const globals: any = {
    game: {
      version: '14.364',
      user: current,
      users: { activeGM: gm },
      system: { id: 'dnd5e', version: '5.3.3' },
      modules: { get: (id: string) => modules.get(id), values: () => modules.values() },
      actors,
      items,
      messages: { get: (id: string) => messages.get(id) },
    },
    CONFIG: { queries: {} },
    Hooks: {
      on(name: string, handler: Function) { const list = hooks.get(name) ?? []; list.push(handler); hooks.set(name, list); return handler; },
      off(name: string, handler: Function) { hooks.set(name, (hooks.get(name) ?? []).filter((candidate) => candidate !== handler)); },
      once(_name: string, _handler: Function) {},
      callAll() {},
    },
    foundry: { utils: {
      randomID: () => 'fixed-id',
      fromUuid: async (uuid: string) => activities.get(uuid) ?? items.get(uuid) ?? actors.get(uuid) ?? messages.get(uuid),
    } },
    ui: { notifications: { warn() {}, error() {}, info() {} } },
  };
  const attacker = actor('attacker');
  const target = actor('target');
  actors.set('attacker', attacker);
  actors.set(attacker.uuid, attacker);
  actors.set('target', target);
  actors.set(target.uuid, target);
  return { globals, gm, player, attacker: actors.get('attacker'), target: actors.get('target'), actors, items, activities, messages, weaponEffects, modules, emit: (name: string, ...args: any[]) => (hooks.get(name) ?? []).map((handler) => handler(...args)) };
}

function weapon(attacker: any, configuration?: WeaponConfiguration): any {
  const item: any = {
    id: 'sword',
    _id: 'sword',
    uuid: 'Actor.attacker.Item.sword',
    documentName: 'Item',
    type: 'weapon',
    actor: attacker,
    isOwner: true,
    system: { type: { baseItem: 'longsword' }, actionType: 'mwak', properties: new Set(['lgt']), range: { reach: 5 }, damage: { parts: [['1d8', 'slashing']], types: new Set(['slashing']) }, activities: new Map() },
    flags: {},
  };
  item.setFlag = async (namespace: string, key: string, value: unknown) => { item.flags[namespace] ??= {}; item.flags[namespace][key] = structuredClone(value); return value; };
  const activity: any = { id: 'activity', _id: 'activity', uuid: `${item.uuid}.Activity.activity`, documentName: 'Activity', item, actor: attacker, type: 'attack', actionType: 'mwak', rollAttack: async () => [] };
  item.system.activities.set(activity.id, activity);
  if (configuration) item.flags = weaponConfigurationFlags(configuration);
  return item;
}

function activityOf(item: any): any { return item.system.activities.get('activity'); }

function registerWeapon(f: ReturnType<typeof fixture>, item: any, activity = activityOf(item)): void {
  f.items.set(item.uuid, item);
  f.activities.set(activity.uuid, activity);
}

const disabledConfig: WeaponConfiguration = { schemaVersion: 1, enabled: false, mastery: 'native', grantMastery: false, rules: [] };

describe('weapon mastery runtime', () => {
  test('reports exact dependencies and detects wm5e conflict', () => {
    const f = fixture({ wm5e: true });
    const runtime = createWeaponMasteryRuntime({ globals: f.globals, strictRuntime: true });
    const report = runtime.dependencies();
    expect(report.ready).toBeFalse();
    expect(report.conflicts).toEqual(['wm5e']);
    expect(report.modules.every((entry) => entry.compatible)).toBeTrue();
  });

  test('configuration is GM-owned and persists the parsed contract', async () => {
    const f = fixture();
    const runtime = createWeaponMasteryRuntime({ globals: f.globals });
    const item = weapon(f.attacker);
    const saved = await runtime.configure(item, disabledConfig);
    expect(saved).toEqual(disabledConfig);
    expect(runtime.configuration(item)).toEqual(disabledConfig);
  });

  test('configuration edits generated Deadly bonus and flag in one Item update', async () => {
    const f = fixture();
    const runtime = createWeaponMasteryRuntime({ globals: f.globals });
    const item = weapon(f.attacker);
    item.system.activities = new Map([['attack1', {
      id: 'attack1', type: 'attack', damage: { critical: { bonus: '2d6 + 1d8' } },
      flags: { fvttJsonGenerator: { weaponPropertyContributions: { deadly: { ruleId: 'homebrew.deadly', bonus: '1d8' } } } },
    }]]);
    const updates: any[] = [];
    item.update = async (payload: any) => { updates.push(payload); return item; };
    item.setFlag = async () => { throw new Error('separate flag update must not occur'); };

    await runtime.configure(item, disabledConfig);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      'system.activities.attack1.damage.critical.bonus': '2d6',
      'system.activities.attack1.flags.fvttJsonGenerator.weaponPropertyContributions.-=deadly': null,
      'flags.fvtt-weapon-mastery-properties.weapon': disabledConfig,
    });
  });

  test('reserves every matching Vex instance and cancellation is idempotent', async () => {
    const f = fixture();
    f.attacker.effects.push(effect('vex', 'Actor.attacker', 'Actor.target', 'vex-1'), effect('vex', 'Actor.attacker', 'Actor.target', 'vex-2'));
    const runtime = createWeaponMasteryRuntime({ globals: f.globals });
    const item = weapon(f.attacker);
    registerWeapon(f, item);
    const prepared = await runtime.prepareUse(activityOf(item), { targetActor: f.target, attackId: 'attack-1' });
    expect(prepared?.reservations).toHaveLength(2);
    expect(f.attacker.effects.every((entry: EffectEntry) => entry.instance.reservation?.attackId === 'attack-1')).toBeTrue();
    expect((await runtime.cancelUse(prepared!)).status).toBe('cancelled');
    expect((await runtime.cancelUse(prepared!)).status).toBe('cancelled');
    expect(f.attacker.effects.every((entry: EffectEntry) => !entry.instance.reservation)).toBeTrue();
  });

  test('does not reserve Vex for a different target identity', async () => {
    const f = fixture();
    const other = actor('other');
    f.attacker.effects.push(effect('vex', 'Actor.attacker', 'Actor.target', 'vex-1'));
    const runtime = createWeaponMasteryRuntime({ globals: f.globals });
    const item = weapon(f.attacker);
    registerWeapon(f, item);
    const prepared = await runtime.prepareUse(activityOf(item), { targetActor: other, attackId: 'attack-other' });
    expect(prepared?.reservations).toHaveLength(0);
    expect(f.attacker.effects[0].instance.reservation).toBeUndefined();
  });

  test('reads Sap from the attacking actor and applies native disadvantage before the roll', async () => {
    const f = fixture();
    f.attacker.effects.push(effect('sap', 'Actor.enemy', 'Actor.attacker', 'sap-1'));
    const runtime = createWeaponMasteryRuntime({ globals: f.globals });
    const item = weapon(f.attacker);
    const activity: any = { id: 'activity', uuid: 'Actor.attacker.Item.sword.Activity.activity', documentName: 'Activity', item, actor: f.attacker, type: 'attack', rollAttack() {} };
    registerWeapon(f, item, activity);
    const prepared = await runtime.prepareUse(activity, { targetActor: f.target, attackId: 'sap-attack' });
    await runtime.startUse(prepared!);
    expect(prepared?.modifiers.disadvantage).toBeTrue();
    const config: any = { subject: activity, __fvttWeaponMasteryUse: prepared!.attackId, rolls: [{ options: {} }] };
    runtime.preRollAttack(config);
    expect(config.disadvantage).toBeTrue();
    expect(config.rolls[0].options.disadvantage).toBeTrue();
  });

  test('normal dnd5e preUseActivity is handed off once and then rolls through the guarded wrapper', async () => {
    const f = fixture();
    const item = weapon(f.attacker);
    const calls = { use: 0, roll: 0 };
    const activity: any = {
      id: 'activity', uuid: 'Actor.attacker.Item.sword.Activity.activity', documentName: 'Activity', type: 'attack', item, actor: f.attacker,
      async use() { calls.use += 1; return { message: { id: 'attack-message' } }; },
      async rollAttack() { calls.roll += 1; return [{ isSuccess: false, total: 1 }]; },
    };
    f.attacker.effects.push(effect('sap', 'Actor.enemy', 'Actor.attacker', 'sap-1'));
    const runtime = createWeaponMasteryRuntime({ globals: f.globals });
    const first = runtime.preUseActivity(activity, {}, {}, {});
    const second = runtime.preUseActivity(activity, {}, {}, {});
    expect(first).toBeFalse();
    expect(second).toBeFalse();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.use).toBe(1);
    expect(calls.roll).toBe(1);
  });

  test('query commit rejects a requester who does not own the source document', async () => {
    const f = fixture();
    f.attacker.effects.push(effect('vex', 'Actor.attacker', 'Actor.target', 'vex-1'));
    const runtime = createWeaponMasteryRuntime({ globals: f.globals });
    runtime.start();
    const item = weapon(f.attacker);
    registerWeapon(f, item);
    const prepared = await runtime.prepareUse(activityOf(item), { targetActor: f.target, attackId: 'attack-auth' });
    const result = await (f.globals.CONFIG.queries[WEAPON_QUERY_COMMIT] as Function)({ prepared, outcome: { messageId: 'untrusted-chat' } }, { user: { id: 'intruder', isGM: false, active: true } });
    expect(result.status).toBe('blocked');
    runtime.stop();
  });

  test('GM query preparation returns a JSON-safe DTO without live document references', async () => {
    const f = fixture();
    f.attacker.effects.push(effect('vex', 'Actor.attacker', 'Actor.target', 'vex-1'));
    const runtime = createWeaponMasteryRuntime({ globals: f.globals });
    runtime.start();
    const item = weapon(f.attacker);
    const activity = activityOf(item);
    registerWeapon(f, item, activity);
    const dto = await (f.globals.CONFIG.queries[WEAPON_QUERY_PREPARE] as Function)({
      itemUuid: item.uuid,
      actorUuid: f.attacker.uuid,
      activityUuid: activity.uuid,
      targetActorUuid: f.target.uuid,
      attackId: 'transport-1',
    }, { user: f.gm });
    expect(dto?.sourceActor).toBeUndefined();
    expect(dto?.resolvedItem).toBeUndefined();
    expect(() => JSON.stringify(dto)).not.toThrow();
    runtime.stop();
  });

  test('commit rejects a message id that is not bound to the prepared attack', async () => {
    const f = fixture();
    const runtime = createWeaponMasteryRuntime({ globals: f.globals });
    const item = weapon(f.attacker);
    registerWeapon(f, item);
    const prepared = await runtime.prepareUse(activityOf(item), { targetActor: f.target, attackId: 'spoof-message' });
    await runtime.startUse(prepared!);
    const result = await runtime.commitUse(prepared!, { messageId: 'unrelated-chat', rolls: [{ isSuccess: false }] });
    expect(result.status).toBe('failed');
    expect(result.reason).toBe('missing-authoritative-outcome');
  });

  test('Fatal changes only the weapon base die and adds one configured die', () => {
    const f = fixture();
    const runtime = createWeaponMasteryRuntime({ globals: f.globals });
    const result = runtime.criticalDamage({
      critical: true,
      weaponBase: { count: 1, faces: 6, bonus: 4, source: 'weapon-base' },
      riders: [{ count: 1, faces: 6, source: 'sneak' }],
      rules: [{ ruleId: 'house.fatal', kind: 'fatal', label: 'Fatal', params: { die: 10 }, stackingGroup: 'house.fatal' }],
    });
    expect(result.weaponBase).toMatchObject({ count: 2, faces: 10, bonus: 4 });
    expect(result.riders[0]).toMatchObject({ count: 2, faces: 6 });
    expect(result.addedDice).toEqual([{ ruleId: 'house.fatal', count: 1, faces: 10 }]);
  });
});
