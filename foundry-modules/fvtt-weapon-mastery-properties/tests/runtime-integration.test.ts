import { describe, expect, test } from 'bun:test';
import {
  createWeaponMasteryRuntime,
  WEAPON_QUERY_COMMIT,
} from '../src/runtime.ts';
import {
  officialMasteryRule,
  weaponConfigurationFlags,
  type WeaponConfiguration,
} from '@fvtt-json-generator/contracts/weapon-properties';

type AnyRecord = Record<string, any>;
type HookHandler = (...args: any[]) => any;
type EffectEntry = { id: string; instance: AnyRecord; disabled?: boolean; name?: string };

const MODULE_ID = 'fvtt-weapon-mastery-properties';
const PRIVATE_USE_KEY = '__fvttWeaponMasteryUse';

function wire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function disabledConfiguration(): WeaponConfiguration {
  return { schemaVersion: 1, enabled: false, mastery: 'native', grantMastery: false, rules: [] };
}

function masteryConfiguration(kind: 'graze' | 'nick' | 'sap' | 'slow' | 'vex' | 'cleave'): WeaponConfiguration {
  return {
    schemaVersion: 1,
    enabled: true,
    mastery: 'native',
    grantMastery: false,
    rules: [officialMasteryRule(kind)],
  };
}

function makeActor(
  id: string,
  ownerId = 'player',
  baseItems: string[] = ['longsword'],
): any {
  const actor: AnyRecord = {
    id,
    _id: id,
    uuid: `Actor.${id}`,
    documentName: 'Actor',
    name: id,
    system: {
      attributes: {
        prof: 3,
        hp: { value: 20, max: 20, temp: 0 },
        ac: { value: 12 },
        movement: { units: 'ft', walk: 30 },
      },
      abilities: { str: { mod: 3 } },
      traits: {
        size: 'med',
        // Locked dnd5e 5.3.3 stores native mastery qualifications under
        // weaponProf.mastery.value as a Set keyed by Item.system.type.baseItem.
        weaponProf: { mastery: { value: new Set(baseItems) } },
      },
    },
    effects: [] as EffectEntry[],
    items: new Map<string, any>(),
    flags: {},
    damageCalls: [] as AnyRecord[],
    setFlag: async (namespace: string, key: string, value: unknown) => {
      actor.flags[namespace] ??= {};
      actor.flags[namespace][key] = structuredClone(value);
      return value;
    },
    getFlag: (namespace: string, key: string) => actor.flags?.[namespace]?.[key],
    testUserPermission: (user: any, level: string) => level === 'OWNER' && user?.id === ownerId,
    toObject: () => structuredClone({
      id: actor.id,
      _id: actor._id,
      uuid: actor.uuid,
      documentName: actor.documentName,
      name: actor.name,
      system: actor.system,
      effects: actor.effects,
      items: [...actor.items.values()],
      flags: actor.flags,
    }),
    async update(update: AnyRecord) {
      if (update['system.attributes.hp.value'] !== undefined) {
        actor.system.attributes.hp.value = update['system.attributes.hp.value'];
      }
      if (update['system.attributes.hp.temp'] !== undefined) {
        actor.system.attributes.hp.temp = update['system.attributes.hp.temp'];
      }
    },
    async applyDamage(damages: any[], options: AnyRecord = {}) {
      const amount = damages.reduce((sum, entry) => sum + Number(entry?.value ?? 0), 0);
      actor.damageCalls.push({
        damages: wire(damages),
        options: { ...options, originatingMessage: options.originatingMessage?.id ?? options.originatingMessage?._id },
      });
      actor.system.attributes.hp.value -= amount;
      return amount;
    },
    async updateEmbeddedDocuments(_type: string, updates: AnyRecord[]) {
      for (const update of updates) {
        const entry = actor.effects.find((candidate: EffectEntry) => candidate.id === update._id);
        if (!entry) continue;
        if (update.disabled !== undefined) entry.disabled = update.disabled;
        const next = update[`flags.fvtt-custom-conditions.weaponEffect`];
        if (next) entry.instance = structuredClone(next);
        if (update['flags.fvtt-custom-conditions.weaponEffect.-=reservation'] !== undefined) {
          delete entry.instance.reservation;
        }
      }
      return actor.effects;
    },
    async deleteEmbeddedDocuments(_type: string, ids: string[]) {
      actor.effects = actor.effects.filter((entry: EffectEntry) => !ids.includes(entry.id));
      return ids;
    },
  };
  return actor;
}

function makeEffect(
  effectKind: 'sap' | 'vex',
  sourceActorUuid: string,
  targetActorUuid: string,
  id: string,
): EffectEntry {
  return {
    id,
    name: effectKind,
    instance: {
      schemaVersion: 1,
      instanceId: `${id}-instance`,
      revision: 0,
      effectKind,
      ruleId: `dnd2024.${effectKind}`,
      stackingGroup: `dnd2024.${effectKind}`,
      params: {},
      source: { actorUuid: sourceActorUuid },
      target: { actorUuid: targetActorUuid },
      enabled: true,
      consumeOn: 'nextCompletedAttack',
      createdAt: 1,
    },
  };
}

function createWeaponEffectApi(world: WorldFixture): AnyRecord {
  let nextEffect = 0;
  const events: string[] = [];
  const api: AnyRecord = {
    version: 1,
    events,
    list: (actor: any) => actor?.effects ?? [],
    async reserve(actor: any, input: AnyRecord) {
      const entry = actor.effects.find((candidate: EffectEntry) => {
        const instance = candidate.instance;
        return candidate.id === input.effectId
          && candidate.disabled !== true
          && instance?.enabled !== false
          && instance?.reservation === undefined;
      });
      if (!entry) return undefined;
      const reservation = {
        attackId: input.attackId,
        instanceId: entry.instance.instanceId,
        revision: entry.instance.revision + 1,
        state: 'reserved',
        reservedAt: 1,
        ...(input.targetActorUuid ? { targetActorUuid: input.targetActorUuid } : {}),
        ...(input.targetTokenUuid ? { targetTokenUuid: input.targetTokenUuid } : {}),
      };
      entry.instance = { ...entry.instance, revision: reservation.revision, reservation };
      events.push(`reserve:${entry.id}`);
      return { effectId: entry.id, ...reservation };
    },
    async start(actor: any, ticket: AnyRecord) {
      const entry = actor.effects.find((candidate: EffectEntry) => candidate.id === ticket.effectId);
      if (!entry) throw new Error('reservation missing');
      const reservation = { ...entry.instance.reservation, ...ticket, state: 'started', revision: ticket.revision + 1, startedAt: 1 };
      entry.instance = { ...entry.instance, revision: reservation.revision, reservation };
      Object.assign(ticket, reservation);
      events.push(`start:${entry.id}`);
      return { effectId: entry.id, ...reservation };
    },
    async commit(actor: any, ticket: AnyRecord) {
      const entry = actor.effects.find((candidate: EffectEntry) => candidate.id === ticket.effectId);
      if (!entry) throw new Error('stale reservation');
      events.push(`commit:${entry.id}`);
      actor.effects = actor.effects.filter((candidate: EffectEntry) => candidate.id !== entry.id);
    },
    async cancel(actor: any, ticket: AnyRecord) {
      const entry = actor.effects.find((candidate: EffectEntry) => candidate.id === ticket.effectId);
      if (!entry) throw new Error('stale reservation');
      if (entry.instance.reservation?.state === 'started') return;
      delete entry.instance.reservation;
      events.push(`cancel:${entry.id}`);
    },
    async apply(actor: any, input: AnyRecord) {
      const id = `effect-${++nextEffect}`;
      const instance = {
        schemaVersion: 1,
        instanceId: `${id}-instance`,
        revision: 0,
        effectKind: input.effectKind,
        ruleId: input.ruleId,
        stackingGroup: input.stackingGroup,
        params: input.params ?? {},
        source: input.source,
        target: input.target,
        enabled: true,
        consumeOn: ['sap', 'vex'].includes(input.effectKind) ? 'nextCompletedAttack' : undefined,
        createdAt: 1,
        ...(input.expires ? { expires: input.expires } : {}),
      };
      const effect = { id, name: input.effectKind, instance };
      actor.effects.push(effect);
      events.push(`apply:${id}`);
      return effect;
    },
    async remove() {},
    async setEnabled() {},
  };
  world.effectApis.push(api);
  return api;
}

function makeHooks(): AnyRecord {
  const handlers = new Map<string, HookHandler[]>();
  return {
    on(name: string, handler: HookHandler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
      return handler;
    },
    off(name: string, handler: HookHandler) {
      handlers.set(name, (handlers.get(name) ?? []).filter((entry) => entry !== handler));
    },
    async dispatch(name: string, ...args: any[]) {
      let result: any;
      for (const handler of [...(handlers.get(name) ?? [])]) {
        const value = await handler(...args);
        if (value !== undefined) result = value;
        if (value === false) return false;
      }
      return result;
    },
    async call(name: string, ...args: any[]) { return this.dispatch(name, ...args); },
    async callAll(name: string, ...args: any[]) { return this.dispatch(name, ...args); },
    count(name: string) { return (handlers.get(name) ?? []).length; },
  };
}

interface WorldFixture {
  globals: any;
  user: any;
  gm: any;
  player: any;
  actors: Map<string, any>;
  items: Map<string, any>;
  activities: Map<string, any>;
  tokens: Map<string, any>;
  messages: Map<string, any>;
  effectApis: AnyRecord[];
  notifications: AnyRecord[];
}

function createWorld(options: { user?: 'gm' | 'player'; actors?: Map<string, any> } = {}): WorldFixture {
  const gm = { id: 'gm', isGM: true, active: true, targets: new Set<any>() };
  const player = { id: 'player', isGM: false, active: true, targets: new Set<any>() };
  const user = options.user === 'player' ? player : gm;
  const actors = options.actors ?? new Map<string, any>();
  const items = new Map<string, any>();
  const activities = new Map<string, any>();
  const tokens = new Map<string, any>();
  const messages = new Map<string, any>();
  const hooks = makeHooks();
  const effectApis: AnyRecord[] = [];
  const notifications: AnyRecord[] = [];
  const modules = new Map<string, any>();
  const globals: any = {
    game: {
      version: '14.364',
      user,
      users: { activeGM: gm },
      system: { id: 'dnd5e', version: '5.3.3' },
      modules: { get: (id: string) => modules.get(id), values: () => modules.values() },
      actors,
      items,
      messages: { get: (id: string) => messages.get(id), values: () => [...new Set(messages.values())].values() },
      targets: new Set<any>(),
      combat: { id: 'combat', uuid: 'Combat.combat', active: true, round: 1, turn: 0, current: { round: 1, turn: 0 } },
    },
    CONFIG: { queries: {} },
    Hooks: hooks,
    foundry: {
      utils: {
        randomID: () => 'fixed-id',
        fromUuid: async (uuid: string) => activities.get(uuid) ?? items.get(uuid) ?? actors.get(uuid) ?? tokens.get(uuid) ?? messages.get(uuid),
      },
    },
    ui: { notifications: {
      warn: (message: string) => notifications.push({ type: 'warn', message }),
      error: (message: string) => notifications.push({ type: 'error', message }),
      info: (message: string) => notifications.push({ type: 'info', message }),
    } },
  };
  const effectApi = createWeaponEffectApi({ globals, user, gm, player, actors, items, activities, tokens, messages, effectApis, notifications } as WorldFixture);
  modules.set('fvtt-custom-conditions', { id: 'fvtt-custom-conditions', version: '0.1.1', active: true, api: { weaponEffects: effectApi } });
  modules.set('fvtt-trigger-engine', { id: 'fvtt-trigger-engine', version: '0.1.1', active: true, api: { apiVersion: 1, capabilities: { externalEvents: 1 }, subscribeExternal: () => () => {}, publishExternal: async () => ({ status: 'published' }) } });
  return { globals, user, gm, player, actors, items, activities, tokens, messages, effectApis, notifications };
}

function registerActor(world: WorldFixture, actor: any): void {
  world.actors.set(actor.uuid, actor);
  world.actors.set(actor.id, actor);
}

function registerItem(world: WorldFixture, item: any): void {
  world.items.set(item.uuid, item);
  world.items.set(item.id, item);
  registerActor(world, item.actor);
}

function registerActivity(world: WorldFixture, activity: any): void {
  world.activities.set(activity.uuid, activity);
  world.activities.set(activity.id, activity);
  registerItem(world, activity.item);
}

function makeToken(world: WorldFixture, actor: any, id = `${actor.id}-token`): any {
  const token = {
    id,
    _id: id,
    uuid: `Scene.scene.Token.${id}`,
    documentName: 'Token',
    actor,
    document: undefined as any,
    center: { x: 0, y: 0 },
  } as AnyRecord;
  token.document = token;
  world.tokens.set(token.uuid, token);
  world.tokens.set(token.id, token);
  return token;
}

function makeMessage(
  world: WorldFixture,
  id: string,
  actorUuid: string,
  activityUuid: string,
  itemUuid: string,
  roll: AnyRecord = { total: 15, isSuccess: true },
  attackId = id,
  authorId = world.user.id,
): any {
  const actorId = actorUuid.split('.').at(-1) ?? actorUuid;
  const message = {
    id,
    _id: id,
    uuid: `ChatMessage.${id}`,
    documentName: 'ChatMessage',
    flags: {
      dnd5e: {
        actorUuid,
        activityUuid,
        itemUuid,
        actor: { uuid: actorUuid },
        activity: { uuid: activityUuid },
        item: { uuid: itemUuid },
        roll: { type: 'attack' },
        originatingActivity: activityUuid,
      },
      [MODULE_ID]: { attackId },
    },
    speaker: { actor: actorId, token: `Token.${actorId}`, alias: actorId },
    author: authorId,
    user: authorId,
    timestamp: Date.now(),
    rolls: [] as any[],
  };
  const actualRoll = { type: 'attack', ...roll, parent: message };
  message.rolls.push(actualRoll);
  world.messages.set(id, message);
  world.messages.set(message.uuid, message);
  return message;
}

function makeItem(
  world: WorldFixture,
  actor: any,
  id: string,
  configuration: WeaponConfiguration,
  options: { type?: string; baseItem?: string; mastery?: string; light?: boolean; uses?: number } = {},
): any {
  const item: AnyRecord = {
    id,
    _id: id,
    uuid: `Actor.${actor.id}.Item.${id}`,
    documentName: 'Item',
    type: options.type ?? 'weapon',
    actor,
    isOwner: true,
    system: {
      type: { baseItem: options.baseItem ?? 'longsword' },
      actionType: 'mwak',
      properties: new Set(options.light ? ['lgt'] : []),
      range: { reach: 5, units: 'ft' },
      damage: { parts: [['1d8', 'slashing']], types: new Set(['slashing']) },
      uses: { value: options.uses ?? 0, max: options.uses ?? 0 },
      mastery: options.mastery,
      activities: new Map<string, any>(),
    },
    flags: weaponConfigurationFlags(configuration),
    testUserPermission: (user: any, level: string) => level === 'OWNER' && user?.id === 'player',
    setFlag: async (namespace: string, key: string, value: unknown) => {
      item.flags[namespace] ??= {};
      item.flags[namespace][key] = structuredClone(value);
      return value;
    },
    getFlag: (namespace: string, key: string) => item.flags?.[namespace]?.[key],
  };
  actor.items.set(item.id, item);
  registerItem(world, item);
  return item;
}

function makeActivity(
  world: WorldFixture,
  item: any,
  id: string,
  options: { mastery?: string; roll?: AnyRecord; messageId?: string } = {},
): any {
  const activity: AnyRecord = {
    id,
    _id: id,
    uuid: `${item.uuid}.Activity.${id}`,
    documentName: 'Activity',
    type: 'attack',
    actionType: 'mwak',
    activation: { type: 'action' },
    actor: item.actor,
    item,
    ability: 'str',
    abilityMod: 3,
    mastery: options.mastery ?? item.system.mastery,
    damage: { parts: [['1d8', 'slashing']], types: new Set(['slashing']) },
    calls: { use: 0, rollAttack: 0 },
    lastUsage: undefined,
    lastAttackId: undefined,
    use: async (usage: AnyRecord = {}, _dialog: AnyRecord = {}, _message: AnyRecord = {}) => {
      activity.calls.use += 1;
      activity.lastUsage = wire(usage);
      if (typeof usage[PRIVATE_USE_KEY] === 'string') activity.lastAttackId = usage[PRIVATE_USE_KEY];
      const allowed = await world.globals.Hooks.call('dnd5e.preUseActivity', activity, usage);
      if (allowed === false) return undefined;
      if (usage.subsequentActions !== false) throw new Error('fixture requires subsequentActions:false');
      if (item.system.uses.value > 0) item.system.uses.value -= 1;
      const messageId = String(usage[PRIVATE_USE_KEY] ? (options.messageId ?? `${id}-message`) : (options.messageId ?? `${id}-message`));
      // dnd5e returns the ChatMessage identity from Activity.use, while the
      // authoritative roll/message document is created after the wrapper has
      // crossed startUse.  Keep this placeholder out of game.messages until
      // rollAttack creates the real document below.
      const message = world.messages.get(messageId) ?? {
        id: messageId,
        _id: messageId,
        uuid: `ChatMessage.${messageId}`,
        documentName: 'ChatMessage',
        flags: { [MODULE_ID]: { attackId: String(usage[PRIVATE_USE_KEY] ?? messageId) } },
        rolls: [],
      };
      const result = { message };
      await world.globals.Hooks.callAll('dnd5e.postUseActivity', activity, usage, result);
      return result;
    },
    rollAttack: async (usage: AnyRecord = {}, dialog: AnyRecord = {}, optionsArg: AnyRecord = {}) => {
      activity.calls.rollAttack += 1;
      if (typeof usage[PRIVATE_USE_KEY] === 'string') activity.lastAttackId = usage[PRIVATE_USE_KEY];
      const messageId = optionsArg?.data?.flags?.dnd5e?.originatingMessage ?? options.messageId ?? `${id}-message`;
      const config: AnyRecord = { ...usage, subject: activity, rolls: usage.rolls ?? [{ options: {} }] };
      if (typeof activity.lastAttackId === 'string') config[PRIVATE_USE_KEY] = activity.lastAttackId;
      // dnd5e 5.3.3 BasicRoll.buildConfigure dispatches hooks BEFORE opening
      // the dialog. Reversing this order hid incompatible dialog defaults.
      const allowed = await world.globals.Hooks.call('dnd5e.preRollAttack', config, dialog, optionsArg);
      if (allowed === false) return [];
      let configuredRolls: any[] | undefined;
      if (typeof dialog?.applicationClass?.configure === 'function') {
        configuredRolls = await dialog.applicationClass.configure(config, dialog, optionsArg);
        if (!configuredRolls?.length) return [];
      }
      const message = world.messages.get(messageId)
        ?? makeMessage(world, messageId, item.actor.uuid, activity.uuid, item.uuid, options.roll ?? { total: 10, isSuccess: false }, String(config[PRIVATE_USE_KEY] ?? messageId));
      const template = options.roll ?? configuredRolls?.[0] ?? { total: 10, isSuccess: false };
      const roll = { ...template, parent: message, options: { ...(template.options ?? {}), advantage: config.advantage, disadvantage: config.disadvantage } };
      message.rolls = [roll];
      await world.globals.Hooks.callAll('dnd5e.rollAttackV2', [roll], { subject: activity });
      await world.globals.Hooks.callAll('dnd5e.postRollAttack', [roll], { subject: activity });
      return [roll];
    },
  };
  item.system.activities.set(activity.id, activity);
  registerActivity(world, activity);
  return activity;
}

function putMessage(
  world: WorldFixture,
  activity: any,
  id: string,
  context: { actorUuid?: string; activityUuid?: string; itemUuid?: string; total?: number; isSuccess?: boolean; attackId?: string; authorId?: string } = {},
): any {
  return makeMessage(
    world,
    id,
    context.actorUuid ?? activity.actor.uuid,
    context.activityUuid ?? activity.uuid,
    context.itemUuid ?? activity.item.uuid,
    { total: context.total ?? 15, isSuccess: context.isSuccess ?? true },
    context.attackId ?? id,
    context.authorId,
  );
}

async function linkRollMessage(world: WorldFixture, activity: any, messageId: string): Promise<void> {
  const message = world.messages.get(messageId);
  if (!message) throw new Error(`missing message ${messageId}`);
  await world.globals.Hooks.callAll('createChatMessage', message);
  // rollAttackV2 is the authoritative native observation boundary.  It binds
  // the started ledger to the created ChatMessage without also auto-committing
  // a miss through postRollAttack before the explicit commit under test.
  await world.globals.Hooks.callAll('dnd5e.rollAttackV2', message.rolls, { subject: activity });
  await settleAsync();
}

async function applyAuthoritativeDamage(world: WorldFixture, target: any, messageId: string, amount: number): Promise<void> {
  const message = world.messages.get(messageId);
  if (!message) throw new Error(`missing message ${messageId}`);
  // Foundry applies HP first and then emits applyDamage with the originating
  // ChatMessage.  The runtime must accept Vex only from this source-matched
  // hook; a claimed numeric damage field is insufficient evidence.
  target.system.attributes.hp.value -= amount;
  await world.globals.Hooks.callAll('dnd5e.applyDamage', target, amount, { originatingMessage: message });
  await settleAsync();
}

async function settleAsync(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await settleAsync();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function commitDirect(
  runtime: ReturnType<typeof createWeaponMasteryRuntime>,
  activity: any,
  target: any,
  attackId: string,
  world: WorldFixture,
): Promise<any> {
  const messageId = `${attackId}-message`;
  const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId, messageId });
  if (!prepared) throw new Error(`failed to prepare ${attackId}`);
  await runtime.startUse(prepared);
  putMessage(world, activity, messageId, { attackId });
  await linkRollMessage(world, activity, messageId);
  return runtime.commitUse(prepared, { messageId });
}

function installQueryTransport(
  playerWorld: WorldFixture,
  gmWorld: WorldFixture,
): { calls: AnyRecord[] } {
  const calls: AnyRecord[] = [];
  playerWorld.gm.query = async (name: string, payload: any) => {
    const sent = wire(payload);
    const context = { user: playerWorld.player };
    calls.push({ name, payload: sent, context });
    const handler = gmWorld.globals.CONFIG.queries[name] as ((data: any, context: AnyRecord) => Promise<any>);
    if (typeof handler !== 'function') throw new Error(`missing query handler ${name}`);
    return wire(await handler(wire(sent), context));
  };
  playerWorld.globals.game.users.activeGM = playerWorld.gm;
  return { calls };
}

describe('weapon mastery runtime integration', () => {
  test('inactive CC or invalid TE retained APIs cannot subscribe, reserve, publish, or begin an attack', async () => {
    for (const defect of ['cc-inactive', 'cc-active-unknown', 'te-inactive', 'te-active-unknown', 'te-version', 'te-capability']) {
      const world = createWorld();
      const cc = world.globals.game.modules.get('fvtt-custom-conditions');
      const te = world.globals.game.modules.get('fvtt-trigger-engine');
      let subscriptions = 0;
      let publishes = 0;
      te.api.subscribeExternal = () => { subscriptions++; return () => {}; };
      te.api.publishExternal = async () => { publishes++; return { status: 'published' }; };
      if (defect === 'cc-inactive') cc.active = false;
      if (defect === 'cc-active-unknown') delete cc.active;
      if (defect === 'te-inactive') te.active = false;
      if (defect === 'te-active-unknown') delete te.active;
      if (defect === 'te-version') te.version = '0.2.1';
      if (defect === 'te-capability') te.api.capabilities.externalEvents = 0;
      const attacker = makeActor(`gate-${defect}-attacker`);
      const target = makeActor(`gate-${defect}-target`);
      attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, `gate-${defect}-vex`));
      const item = makeItem(world, attacker, `gate-${defect}-item`, masteryConfiguration('vex'));
      const activity = makeActivity(world, item, `gate-${defect}-activity`);
      const runtime = createWeaponMasteryRuntime({ globals: world.globals });
      runtime.start();
      expect(subscriptions).toBe(0);
      expect(runtime.dependencies().ready).toBeFalse();
      await expect(runtime.prepareUse(activity, { targetActor: target, attackId: `gate-${defect}` })).rejects.toThrow('dependencies');
      expect(cc.api.weaponEffects.events).toEqual([]);
      expect(attacker.getFlag(MODULE_ID, 'ledger')).toBeUndefined();
      expect(activity.calls.use).toBe(0);
      expect(activity.calls.rollAttack).toBe(0);
      expect(publishes).toBe(0);
      runtime.stop();
    }
  });

  test('dependency loss after preparation prevents reservation start and another ledger/publication write', async () => {
    for (const lost of ['cc-active', 'te-capability']) {
      const world = createWorld();
      const cc = world.globals.game.modules.get('fvtt-custom-conditions');
      const te = world.globals.game.modules.get('fvtt-trigger-engine');
      let publishes = 0;
      te.api.publishExternal = async () => { publishes++; return { status: 'published' }; };
      const attacker = makeActor(`lost-${lost}-attacker`);
      const target = makeActor(`lost-${lost}-target`);
      attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, `lost-${lost}-vex`));
      const item = makeItem(world, attacker, `lost-${lost}-item`, masteryConfiguration('vex'));
      const activity = makeActivity(world, item, `lost-${lost}-activity`);
      const runtime = createWeaponMasteryRuntime({ globals: world.globals });
      runtime.start();
      const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: `lost-${lost}` });
      expect(prepared?.reservations).toHaveLength(1);
      const ledgerBefore = structuredClone(attacker.getFlag(MODULE_ID, 'ledger'));
      const eventsBefore = [...cc.api.weaponEffects.events];
      const publishesBefore = publishes;
      if (lost === 'cc-active') cc.active = false;
      else te.api.capabilities.externalEvents = 0;
      await expect(runtime.startUse(prepared!)).rejects.toThrow('dependencies');
      expect(attacker.getFlag(MODULE_ID, 'ledger')).toEqual(ledgerBefore);
      expect(cc.api.weaponEffects.events).toEqual(eventsBefore);
      expect(publishes).toBe(publishesBefore);
      expect(activity.calls.use).toBe(0);
      runtime.stop();
    }
  });

  test('CC, TE, or active GM lost during Actor resolution cannot use a retained CC start API', async () => {
    for (const lost of ['cc', 'te', 'gm']) {
      const world = createWorld();
      const cc = world.globals.game.modules.get('fvtt-custom-conditions');
      const te = world.globals.game.modules.get('fvtt-trigger-engine');
      let publishes = 0;
      te.api.publishExternal = async () => { publishes++; return { status: 'published' }; };
      const attacker = makeActor(`resolve-${lost}-attacker`);
      const target = makeActor(`resolve-${lost}-target`);
      attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, `resolve-${lost}-vex`));
      const item = makeItem(world, attacker, `resolve-${lost}-item`, masteryConfiguration('vex'));
      const activity = makeActivity(world, item, `resolve-${lost}-activity`);
      const runtime = createWeaponMasteryRuntime({ globals: world.globals });
      runtime.start();
      const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: `resolve-${lost}` });
      expect(prepared?.reservations).toHaveLength(1);
      const priorLedger = structuredClone(attacker.getFlag(MODULE_ID, 'ledger'));
      const priorEvents = [...cc.api.weaponEffects.events];
      const priorPublishes = publishes;
      let writes = 0;
      const setFlag = attacker.setFlag;
      attacker.setFlag = async (...args: any[]) => { writes++; return setFlag(...args); };
      const fromUuid = world.globals.foundry.utils.fromUuid;
      let release!: () => void, entered!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const waiting = new Promise<void>(resolve => { entered = resolve; });
      let held = false;
      world.globals.foundry.utils.fromUuid = async (uuid: string) => {
        if (uuid === attacker.uuid && !held) { held = true; entered(); await gate; }
        return fromUuid(uuid);
      };
      const starting = runtime.startUse(prepared!);
      await waiting;
      if (lost === 'cc') cc.active = false;
      if (lost === 'te') te.api.capabilities.externalEvents = 0;
      if (lost === 'gm') world.globals.game.users.activeGM = undefined;
      release();
      await expect(starting).rejects.toThrow();
      expect(cc.api.weaponEffects.events).toEqual(priorEvents);
      expect(attacker.getFlag(MODULE_ID, 'ledger')).toEqual(priorLedger);
      expect(writes).toBe(0);
      expect(publishes).toBe(priorPublishes);
      cc.active = true;
      te.api.capabilities.externalEvents = 1;
      world.globals.game.users.activeGM = world.gm;
      expect((await runtime.cancelUse(prepared!)).status).toBe('cancelled');
      expect(attacker.effects[0].instance.reservation).toBeUndefined();
      runtime.stop();
    }
  });

  test('a second reservation failure retains the already-started first effect for reconciliation', async () => {
    const world = createWorld();
    const cc = world.globals.game.modules.get('fvtt-custom-conditions');
    const attacker = makeActor('partial-start-attacker');
    const target = makeActor('partial-start-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'partial-first'));
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'partial-second'));
    const item = makeItem(world, attacker, 'partial-start-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'partial-start-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'partial-start' });
    expect(prepared?.reservations).toHaveLength(2);
    const fromUuid = world.globals.foundry.utils.fromUuid;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    let actorResolutions = 0;
    world.globals.foundry.utils.fromUuid = async (uuid: string) => {
      if (uuid === attacker.uuid && ++actorResolutions === 2) { entered(); await gate; }
      return fromUuid(uuid);
    };
    const starting = runtime.startUse(prepared!);
    await waiting;
    cc.active = false;
    release();
    await expect(starting).rejects.toThrow();
    expect(cc.api.weaponEffects.events.filter((entry: string) => entry.startsWith('start:'))).toEqual(['start:partial-first']);
    cc.active = true;
    const cancelled = await runtime.cancelUse(prepared!);
    expect(cancelled.status).toBe('pending');
    expect(cancelled.reason).toBe('started-attack-requires-gm-reconciliation');
    const claim = attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === prepared!.attackId);
    expect(claim?.step).toBe('started');
    expect(claim?.steps.started).not.toBe('started');
    await expect(runtime.startUse(prepared!)).rejects.toThrow('reconciliation');
    runtime.stop();
    const recovered = createWeaponMasteryRuntime({ globals: world.globals });
    recovered.start();
    const reference = { attackId: prepared!.attackId, sourceActorUuid: attacker.uuid } as any;
    await expect(recovered.startUse(reference)).rejects.toThrow('reconciliation');
    putMessage(world, activity, 'partial-start-linked-message', { attackId: prepared!.attackId });
    await linkRollMessage(world, activity, 'partial-start-linked-message');
    const priorEvents = [...cc.api.weaponEffects.events];
    const committed = await recovered.commitUse(reference, { messageId: 'partial-start-linked-message' });
    expect(committed.status).toBe('pending');
    expect(committed.reason).toBe('started-attack-requires-gm-reconciliation');
    expect(cc.api.weaponEffects.events).toEqual(priorEvents);
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === prepared!.attackId)?.step).toBe('started');
    expect(cc.api.weaponEffects.events.filter((entry: string) => entry.startsWith('start:'))).toEqual(['start:partial-first']);
    recovered.stop();
  });

  test('failed first started-claim write cannot produce a false idempotent start', async () => {
    const world = createWorld();
    const attacker = makeActor('start-claim-fail-attacker');
    const target = makeActor('start-claim-fail-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'start-claim-fail-vex'));
    const item = makeItem(world, attacker, 'start-claim-fail-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'start-claim-fail-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'start-claim-fail' });
    const setFlag = attacker.setFlag;
    attacker.setFlag = async () => { throw new Error('started claim write failed'); };
    await expect(runtime.startUse(prepared!)).rejects.toThrow('started claim write failed');
    await expect(runtime.startUse(prepared!)).rejects.toThrow('reconciliation');
    expect(world.effectApis[0]?.events.filter((event: string) => event.startsWith('start:'))).toEqual([]);
    expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === prepared!.attackId)?.step).toBe('prepared');
    attacker.setFlag = setFlag;
    runtime.stop();
  });

  test('failed final started confirmation is not an idempotent success after reload', async () => {
    const world = createWorld();
    const attacker = makeActor('start-confirm-fail-attacker');
    const target = makeActor('start-confirm-fail-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'start-confirm-fail-vex'));
    const item = makeItem(world, attacker, 'start-confirm-fail-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'start-confirm-fail-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'start-confirm-fail' });
    const setFlag = attacker.setFlag;
    let writes = 0;
    attacker.setFlag = async (...args: any[]) => {
      if (++writes === 3) throw new Error('started confirmation write failed');
      return setFlag(...args);
    };
    await expect(runtime.startUse(prepared!)).rejects.toThrow('started confirmation write failed');
    const claim = attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === prepared!.attackId);
    expect(claim?.step).toBe('started');
    expect(claim?.steps.started).not.toBe('started');
    expect(claim?.reservations[0]?.ticket.state).toBe('started');
    await expect(runtime.startUse(prepared!)).rejects.toThrow('reconciliation');
    runtime.stop();
    const recovered = createWeaponMasteryRuntime({ globals: world.globals });
    recovered.start();
    await expect(recovered.startUse({ attackId: prepared!.attackId, sourceActorUuid: attacker.uuid } as any)).rejects.toThrow('reconciliation');
    expect(world.effectApis[0]?.events.filter((event: string) => event.startsWith('start:'))).toEqual(['start:start-confirm-fail-vex']);
    recovered.stop();
  });

  test('confirmed started attack remains idempotent on repeat start', async () => {
    const world = createWorld();
    const attacker = makeActor('confirmed-start-attacker');
    const target = makeActor('confirmed-start-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'confirmed-start-vex'));
    const item = makeItem(world, attacker, 'confirmed-start-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'confirmed-start-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'confirmed-start' });
    await runtime.startUse(prepared!);
    const calls = world.effectApis[0]?.events.filter((event: string) => event.startsWith('start:'));
    expect(calls).toEqual(['start:confirmed-start-vex']);
    expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === prepared!.attackId)?.steps.started).toBe('started');
    expect((await runtime.startUse(prepared!)).attackId).toBe(prepared!.attackId);
    expect(world.effectApis[0]?.events.filter((event: string) => event.startsWith('start:'))).toEqual(calls);
    runtime.stop();
    const recovered = createWeaponMasteryRuntime({ globals: world.globals });
    recovered.start();
    expect((await recovered.startUse({ attackId: prepared!.attackId, sourceActorUuid: attacker.uuid } as any)).attackId).toBe(prepared!.attackId);
    expect(world.effectApis[0]?.events.filter((event: string) => event.startsWith('start:'))).toEqual(calls);
    recovered.stop();
  });

  test('GM loss during the last CC start cannot confirm an unpersisted completed start', async () => {
    const world = createWorld();
    const cc = world.globals.game.modules.get('fvtt-custom-conditions');
    const attacker = makeActor('last-start-gm-loss-attacker');
    const target = makeActor('last-start-gm-loss-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'last-start-gm-loss-vex'));
    const item = makeItem(world, attacker, 'last-start-gm-loss-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'last-start-gm-loss-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'last-start-gm-loss' });
    const start = cc.api.weaponEffects.start;
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    cc.api.weaponEffects.start = async (...args: any[]) => { entered(); await gate; return start(...args); };
    const starting = runtime.startUse(prepared!);
    await waiting;
    const claim = attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === prepared!.attackId);
    expect(claim?.step).toBe('started');
    expect(claim?.steps.started).not.toBe('started');
    world.globals.game.users.activeGM = undefined;
    release();
    await expect(starting).rejects.toThrow('Active GM');
    expect(attacker.effects[0].instance.reservation?.state).toBe('started');
    expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === prepared!.attackId)?.steps.started).not.toBe('started');
    world.globals.game.users.activeGM = world.gm;
    await expect(runtime.startUse(prepared!)).rejects.toThrow('reconciliation');
    runtime.stop();
    const recovered = createWeaponMasteryRuntime({ globals: world.globals });
    recovered.start();
    await expect(recovered.startUse({ attackId: prepared!.attackId, sourceActorUuid: attacker.uuid } as any)).rejects.toThrow('reconciliation');
    recovered.stop();
  });

  test('GM loss during returned CC reserve cannot turn an incomplete claim into prepared', async () => {
    const world = createWorld();
    const cc = world.globals.game.modules.get('fvtt-custom-conditions');
    const attacker = makeActor('last-reserve-gm-loss-attacker');
    const target = makeActor('last-reserve-gm-loss-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'last-reserve-gm-loss-vex'));
    const item = makeItem(world, attacker, 'last-reserve-gm-loss-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'last-reserve-gm-loss-activity');
    const events: AnyRecord[] = [];
    world.globals.game.modules.get('fvtt-trigger-engine').api.publishExternal = async (event: AnyRecord) => { events.push(event); };
    const reserve = cc.api.weaponEffects.reserve;
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    cc.api.weaponEffects.reserve = async (...args: any[]) => { entered(); await gate; return reserve(...args); };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const preparing = runtime.prepareUse(activity, { targetActor: target, attackId: 'last-reserve-gm-loss' });
    await waiting;
    expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === 'last-reserve-gm-loss')?.steps.prepared).toBeUndefined();
    world.globals.game.users.activeGM = undefined;
    release();
    await expect(preparing).rejects.toThrow('Active GM');
    expect(events).toEqual([]);
    expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === 'last-reserve-gm-loss')?.steps.prepared).toBeUndefined();
    world.globals.game.users.activeGM = world.gm;
    expect((await runtime.cancelUse({ attackId: 'last-reserve-gm-loss', sourceActorUuid: attacker.uuid } as any)).status).toBe('pending');
    await expect(runtime.prepareUse(activity, { targetActor: target, attackId: 'last-reserve-gm-loss' })).rejects.toThrow('already been used');
    runtime.stop();
  });

  test('GM loss during CC cancel cannot falsely confirm a terminal cancellation', async () => {
    const world = createWorld();
    const cc = world.globals.game.modules.get('fvtt-custom-conditions');
    const attacker = makeActor('last-cancel-gm-loss-attacker');
    const target = makeActor('last-cancel-gm-loss-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'last-cancel-gm-loss-vex'));
    const item = makeItem(world, attacker, 'last-cancel-gm-loss-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'last-cancel-gm-loss-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'last-cancel-gm-loss' });
    const cancel = cc.api.weaponEffects.cancel;
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    cc.api.weaponEffects.cancel = async (...args: any[]) => { entered(); await gate; return cancel(...args); };
    const cancelling = runtime.cancelUse(prepared!);
    await waiting;
    world.globals.game.users.activeGM = undefined;
    release();
    await expect(cancelling).rejects.toThrow('Active GM');
    expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === prepared!.attackId)?.step).toBe('prepared');
    world.globals.game.users.activeGM = world.gm;
    expect((await runtime.cancelUse(prepared!)).status).toBe('cancelled');
    runtime.stop();
  });

  test('zero-reservation start still confirms one durable completed marker', async () => {
    const world = createWorld();
    const attacker = makeActor('zero-reservation-attacker');
    const target = makeActor('zero-reservation-target');
    const item = makeItem(world, attacker, 'zero-reservation-item', disabledConfiguration());
    const activity = makeActivity(world, item, 'zero-reservation-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'zero-reservation' });
    expect(prepared?.reservations).toEqual([]);
    await runtime.startUse(prepared!);
    const entry = attacker.getFlag(MODULE_ID, 'ledger')?.find((ledger: any) => ledger.attackId === prepared!.attackId);
    expect(entry).toMatchObject({ step: 'started', steps: { prepared: 'prepared', started: 'started' }, reservations: [] });
    expect((await runtime.startUse(prepared!)).attackId).toBe(prepared!.attackId);
    expect(world.effectApis[0]?.events).toEqual([]);
    runtime.stop();
  });

  test('failed terminal ledger write cannot become a cached committed result', async () => {
    const world = createWorld();
    const attacker = makeActor('terminal-write-attacker');
    const target = makeActor('terminal-write-target');
    const item = makeItem(world, attacker, 'terminal-write-item', disabledConfiguration());
    const activity = makeActivity(world, item, 'terminal-write-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'terminal-write' });
    await runtime.startUse(prepared!);
    putMessage(world, activity, 'terminal-write-message', { attackId: prepared!.attackId });
    await linkRollMessage(world, activity, 'terminal-write-message');
    const setFlag = attacker.setFlag;
    attacker.setFlag = async (namespace: string, key: string, value: any) => {
      if (value.some((entry: any) => entry.attackId === prepared!.attackId && entry.step === 'committed')) {
        throw new Error('terminal ledger write failed');
      }
      return setFlag(namespace, key, value);
    };
    await expect(runtime.commitUse(prepared!, { messageId: 'terminal-write-message' })).rejects.toThrow('terminal ledger write failed');
    expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === prepared!.attackId)?.step).not.toBe('committed');
    expect((await runtime.commitUse(prepared!, { messageId: 'terminal-write-message' })).status).not.toBe('committed');
    runtime.stop();
  });

  test('CC loss during cancellation Actor resolution cannot invoke the retained cancel API', async () => {
    const world = createWorld();
    const cc = world.globals.game.modules.get('fvtt-custom-conditions');
    const attacker = makeActor('cancel-gate-attacker');
    const target = makeActor('cancel-gate-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'cancel-gate-vex'));
    const item = makeItem(world, attacker, 'cancel-gate-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'cancel-gate-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'cancel-gate' });
    expect(prepared?.reservations).toHaveLength(1);
    const ledgerBefore = structuredClone(attacker.getFlag(MODULE_ID, 'ledger'));
    const eventsBefore = [...cc.api.weaponEffects.events];
    const fromUuid = world.globals.foundry.utils.fromUuid;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    let held = false;
    world.globals.foundry.utils.fromUuid = async (uuid: string) => {
      if (uuid === attacker.uuid && !held) { held = true; entered(); await gate; }
      return fromUuid(uuid);
    };
    const cancelling = runtime.cancelUse(prepared!);
    await waiting;
    cc.active = false;
    release();
    await expect(cancelling).rejects.toThrow('dependencies');
    expect(cc.api.weaponEffects.events).toEqual(eventsBefore);
    expect(attacker.getFlag(MODULE_ID, 'ledger')).toEqual(ledgerBefore);
    cc.active = true;
    expect((await runtime.cancelUse(prepared!)).status).toBe('cancelled');
    runtime.stop();
  });

  test('a failed initial ledger claim makes no CC reservation or prepared event', async () => {
    const world = createWorld();
    const attacker = makeActor('claim-fail-attacker');
    const target = makeActor('claim-fail-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'claim-fail-vex'));
    const item = makeItem(world, attacker, 'claim-fail-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'claim-fail-activity');
    let publishes = 0;
    world.globals.game.modules.get('fvtt-trigger-engine').api.publishExternal = async () => { publishes++; };
    attacker.setFlag = async () => { throw new Error('initial claim write failed'); };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    await expect(runtime.prepareUse(activity, { targetActor: target, attackId: 'claim-fail' })).rejects.toThrow('initial claim write failed');
    expect(world.effectApis[0]?.events ?? []).toEqual([]);
    expect(attacker.getFlag(MODULE_ID, 'ledger')).toBeUndefined();
    expect(publishes).toBe(0);
    await expect(runtime.prepareUse(activity, { targetActor: target, attackId: 'claim-fail' })).rejects.toThrow('already been used');
    runtime.stop();
  });

  test('first durable ticket survives later dependency loss without a false prepared event or clean cancel', async () => {
    const world = createWorld();
    const cc = world.globals.game.modules.get('fvtt-custom-conditions');
    const attacker = makeActor('orphan-attacker');
    const target = makeActor('orphan-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'orphan-first'));
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'orphan-second'));
    const item = makeItem(world, attacker, 'orphan-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'orphan-activity');
    let publishes = 0, writes = 0;
    world.globals.game.modules.get('fvtt-trigger-engine').api.publishExternal = async () => { publishes++; };
    const setFlag = attacker.setFlag;
    attacker.setFlag = async (...args: any[]) => {
      const result = await setFlag(...args);
      if (++writes === 2) cc.active = false; // initial claim, then first returned ticket
      return result;
    };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    await expect(runtime.prepareUse(activity, { targetActor: target, attackId: 'orphan-attack' })).rejects.toThrow('dependencies');
    const ledger = attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === 'orphan-attack');
    expect(ledger?.step).toBe('prepared');
    expect(ledger?.steps.prepared).not.toBe('prepared');
    expect(ledger?.reservations).toHaveLength(1);
    expect(ledger?.reservations[0].ticket.effectId).toBe('orphan-first');
    expect(cc.api.weaponEffects.events.filter((event: string) => event.startsWith('reserve:'))).toEqual(['reserve:orphan-first']);
    expect(publishes).toBe(0);
    cc.active = true;
    expect((await runtime.cancelUse({ attackId: 'orphan-attack', sourceActorUuid: attacker.uuid } as any)).status).toBe('pending');
    await expect(runtime.startUse({ attackId: 'orphan-attack', sourceActorUuid: attacker.uuid } as any)).rejects.toThrow('preparation');
    await expect(runtime.prepareUse(activity, { targetActor: target, attackId: 'orphan-attack' })).rejects.toThrow('already been used');
    runtime.stop();
  });

  test('final preparation persistence failure retains the exact earlier ticket without publishing prepared', async () => {
    const world = createWorld();
    const attacker = makeActor('final-write-attacker');
    const target = makeActor('final-write-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'final-write-vex'));
    const item = makeItem(world, attacker, 'final-write-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'final-write-activity');
    const events: AnyRecord[] = [];
    world.globals.game.modules.get('fvtt-trigger-engine').api.publishExternal = async (event: AnyRecord) => { events.push(event); };
    let writes = 0;
    const setFlag = attacker.setFlag;
    attacker.setFlag = async (...args: any[]) => {
      if (++writes === 3) throw new Error('final preparation write failed');
      return setFlag(...args);
    };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    await expect(runtime.prepareUse(activity, { targetActor: target, attackId: 'final-write' })).rejects.toThrow('final preparation write failed');
    const ledger = attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === 'final-write');
    expect(writes).toBe(3);
    expect(ledger?.steps.prepared).not.toBe('prepared');
    expect(ledger?.reservations[0].ticket).toMatchObject({ effectId: 'final-write-vex', attackId: 'final-write', state: 'reserved' });
    expect(events).toEqual([]);
    runtime.stop();
    const recovered = createWeaponMasteryRuntime({ globals: world.globals });
    recovered.start();
    const reference = { attackId: 'final-write', sourceActorUuid: attacker.uuid } as any;
    expect((await recovered.cancelUse(reference)).status).toBe('pending');
    await expect(recovered.startUse(reference)).rejects.toThrow('preparation');
    await expect(recovered.prepareUse(activity, { targetActor: target, attackId: 'final-write' })).rejects.toThrow('already been used');
    recovered.stop();
  });

  test('an in-flight unknown CC reserve leaves a discoverable incomplete claim after client recovery', async () => {
    const world = createWorld();
    const cc = world.globals.game.modules.get('fvtt-custom-conditions');
    const attacker = makeActor('unknown-reserve-attacker');
    const target = makeActor('unknown-reserve-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'unknown-reserve-vex'));
    const item = makeItem(world, attacker, 'unknown-reserve-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'unknown-reserve-activity');
    const published: AnyRecord[] = [];
    world.globals.game.modules.get('fvtt-trigger-engine').api.publishExternal = async (event: AnyRecord) => { published.push(event); };
    const reserve = cc.api.weaponEffects.reserve;
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    cc.api.weaponEffects.reserve = async (...args: any[]) => { entered(); await gate; return reserve(...args); };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const preparing = runtime.prepareUse(activity, { targetActor: target, attackId: 'unknown-reserve' });
    await waiting;
    expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === 'unknown-reserve')).toMatchObject({
      step: 'prepared', reservations: [], steps: {},
    });
    expect(published).toEqual([]);
    cc.active = false;
    release();
    await expect(preparing).rejects.toThrow('dependencies');
    expect(attacker.effects[0].instance.reservation).toMatchObject({ attackId: 'unknown-reserve', state: 'reserved' });
    expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === 'unknown-reserve')?.steps.prepared).toBeUndefined();
    runtime.stop();
    cc.active = true;
    const recovered = createWeaponMasteryRuntime({ globals: world.globals });
    recovered.start();
    const reference = { attackId: 'unknown-reserve', sourceActorUuid: attacker.uuid } as any;
    expect((await recovered.cancelUse(reference)).status).toBe('pending');
    await expect(recovered.startUse(reference)).rejects.toThrow('preparation');
    await expect(recovered.prepareUse(activity, { targetActor: target, attackId: 'unknown-reserve' })).rejects.toThrow('already been used');
    expect(published).toEqual([]);
    recovered.stop();
  });

  test('complete preparation emits exactly one prepared event with final reservation count', async () => {
    const world = createWorld();
    const attacker = makeActor('complete-prep-attacker');
    const target = makeActor('complete-prep-target');
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'complete-first'));
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'complete-second'));
    const item = makeItem(world, attacker, 'complete-prep-item', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'complete-prep-activity');
    const published: AnyRecord[] = [];
    world.globals.game.modules.get('fvtt-trigger-engine').api.publishExternal = async (event: AnyRecord) => { published.push(event); };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'complete-prep' });
    expect(prepared?.reservations).toHaveLength(2);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ eventId: 'complete-prep:prepared', data: { reservationCount: 2 } });
    expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === 'complete-prep')?.steps.prepared).toBe('prepared');
    expect((await runtime.cancelUse(prepared!)).status).toBe('cancelled');
    runtime.stop();
  });

  for (const version of [
    { core: '14.364', system: '5.3.3', midi: '14.0.11' },
    { core: '14.368', system: '5.3.3', midi: '14.0.11' },
    { core: '14.368', system: '6.0.5', midi: '14.6.0-beta.4338eeab.local.10' },
    { core: '14.368', system: '6.0.6', midi: '14.6.0-beta.4338eeab.local.10' },
  ]) test('public Midi use owns one attack and one prepared nonce through cleanup on ' + version.core + '/' + version.system, async () => {
    const world = createWorld();
    world.globals.game.version = version.core;
    world.globals.game.system.version = version.system;
    const originalGet = world.globals.game.modules.get.bind(world.globals.game.modules);
    if (version.system.startsWith('6.')) originalGet('fvtt-custom-conditions').api.weaponEffects.capabilities = { native6Effects: 1 };
    world.globals.game.modules.get = (id: string) => id === 'midi-qol'
      ? { active: true, version: version.midi } : originalGet(id);
    const attacker = makeActor('public-midi-attacker');
    const target = makeActor('public-midi-target');
    registerActor(world, attacker);
    registerActor(world, target);
    const token = makeToken(world, target);
    attacker.effects.push(makeEffect('sap', 'Actor.enemy', attacker.uuid, 'public-midi-sap'));
    const item = makeItem(world, attacker, 'public-midi-weapon', disabledConfiguration());
    const activity = makeActivity(world, item, 'public-midi-activity', { messageId: 'public-midi-native-attack' });
    let confirmations = 0;
    world.globals.game.dnd5e = { dice: { D20Roll: { DefaultConfigurationDialog: {
      async configure() {
        confirmations++;
        return [{ total: 15, isSuccess: true, options: { attackMode: 'oneHanded' } }];
      },
    } } } };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const baseUse = activity.use;
    let workflow: AnyRecord | undefined;
    let suppliedTargets: Set<any> | undefined;
    activity.use = async (usage: AnyRecord, dialog: AnyRecord, message: AnyRecord) => {
      suppliedTargets = usage.midiOptions?.targetsToUse;
      const result = await baseUse(usage, dialog, message);
      workflow = {
        id: 'public-midi-workflow', activity, chatCard: result.message, sequenceId: usage.sequenceId,
        attackRollCount: 0, targets: new Set(usage.midiOptions?.targetsToUse ?? [token]),
        options: {}, workflowOptions: { ...usage.midiOptions?.workflowOptions },
      };
      await world.globals.Hooks.call('midi-qol.preAttackRoll', workflow);
      const native = makeMessage(world, 'public-midi-native-attack', attacker.uuid, activity.uuid, item.uuid,
        { total: 15, isSuccess: true }, workflow[PRIVATE_USE_KEY]);
      if (version.system.startsWith('6.')) {
        native.type = 'attack';
        native.system = {
          activity: { uuid: activity.uuid }, item: { uuid: item.uuid },
          origin: result.message.id, targets: [{ actor: target.uuid, token: token.uuid }],
        };
      }
      const rolls = await activity.rollAttack({ [PRIVATE_USE_KEY]: workflow[PRIVATE_USE_KEY] }, {}, {});
      workflow.attackRoll = rolls[0];
      await world.globals.Hooks.callAll('midi-qol.AttackRollComplete', workflow);
      await world.globals.Hooks.callAll('midi-qol.RollComplete', workflow);
      await world.globals.Hooks.callAll('midi-qol.postCleanup.' + activity.uuid, workflow);
      return result;
    };
    try {
      const result = await runtime.use(activity, {
        attackId: 'public-midi-single', targetActor: target, targetToken: token,
      }, { configure: false }, { create: true });
      expect(result?.reason).not.toBe('Attack selection is no longer editable.');
      expect(result?.status).not.toBe('failed');
      expect(result?.status).not.toBe('blocked');
      expect(activity.calls.use).toBe(1);
      expect(activity.calls.rollAttack).toBe(1);
      expect(confirmations).toBe(1);
      expect(workflow?.[PRIVATE_USE_KEY]).toBe('public-midi-single');
      expect(suppliedTargets instanceof Set).toBeTrue();
      expect([...suppliedTargets!]).toEqual([token]);
      expect(workflow?.sequenceId).toBe('public-midi-single');
      expect(attacker.getFlag(MODULE_ID, 'ledger')).toHaveLength(1);
      expect(attacker.effects).toHaveLength(0);
    } finally { runtime.stop(); }
  });

  test('public Midi use cancels a pre-attack abort without consuming Sap or opening a native fallback', async () => {
    const world = createWorld();
    const originalGet = world.globals.game.modules.get.bind(world.globals.game.modules);
    world.globals.game.modules.get = (id: string) => id === 'midi-qol'
      ? { active: true, version: '14.0.11' } : originalGet(id);
    const attacker = makeActor('public-midi-abort-attacker');
    const target = makeActor('public-midi-abort-target');
    registerActor(world, attacker);
    registerActor(world, target);
    attacker.effects.push(makeEffect('sap', 'Actor.enemy', attacker.uuid, 'public-midi-abort-sap'));
    const item = makeItem(world, attacker, 'public-midi-abort-weapon', disabledConfiguration());
    const activity = makeActivity(world, item, 'public-midi-abort-activity');
    const baseUse = activity.use;
    activity.use = async (usage: AnyRecord, dialog: AnyRecord, message: AnyRecord) => {
      const result = await baseUse(usage, dialog, message);
      await world.globals.Hooks.callAll('midi-qol.preAbort.' + activity.uuid, {
        sequenceId: usage.sequenceId, activity, aborted: false,
        workflowOptions: usage.midiOptions.workflowOptions,
      });
      return result;
    };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    try {
      const result = await runtime.use(activity, {
        attackId: 'public-midi-abort', targetActor: target, targetToken: makeToken(world, target),
      });
      expect(result?.status).toBe('cancelled');
      expect(activity.calls.rollAttack).toBe(0);
      expect(attacker.effects).toHaveLength(1);
      expect(attacker.effects[0].instance.reservation).toBeUndefined();
      expect(attacker.getFlag(MODULE_ID, 'ledger')).toMatchObject([{ attackId: 'public-midi-abort', step: 'cancelled' }]);
    } finally { runtime.stop(); }
  });

  test('native6 separate attack/damage messages settle only the linked real HP update', async () => {
    const world = createWorld();
    world.globals.game.version = '14.368';
    world.globals.game.system.version = '6.0.5';
    const originalGet = world.globals.game.modules.get;
    originalGet('fvtt-custom-conditions').version = '0.2.0';
    originalGet('fvtt-custom-conditions').api.weaponEffects.capabilities = { native6Effects: 1 };
    originalGet('fvtt-trigger-engine').version = '0.2.0';
    world.globals.fromUuidSync = (uuid: string) => world.tokens.get(uuid);
    const attacker = makeActor('next-attacker', 'player', ['longsword']);
    const target = makeActor('next-target');
    registerActor(world, attacker);
    registerActor(world, target);
    const token = makeToken(world, target);
    const item = makeItem(world, attacker, 'next-weapon', masteryConfiguration('slow'), { mastery: 'slow' });
    const activity = makeActivity(world, item, 'next-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const attackId = 'next-same-card', cardId = 'next-card';
    const prepared = await runtime.prepareUse(activity, { targetActor: target, targetToken: token, attackId, messageId: cardId });
    expect(prepared).toBeDefined();
    await runtime.startUse(prepared!);
    const card = putMessage(world, activity, cardId, { attackId, total: 18, isSuccess: true });
    delete card.flags.dnd5e;
    card.type = 'attack';
    card.system = { activity: { uuid: activity.uuid }, item: { uuid: item.uuid },
      targets: [{ actor: target.uuid, token: token.uuid }], origin: null };
    await linkRollMessage(world, activity, cardId);
    expect((await runtime.commitUse(prepared!, { messageId: cardId })).status).toBe('pending');
    const damage: any = { id: 'next-damage-message', type: 'damage', system: { ...card.system, origin: cardId },
      flags: { [MODULE_ID]: { attackId } }, author: 'gm', user: 'gm', timestamp: Date.now(), rolls: [{ total: 5 }] };
    world.messages.set(damage.id, damage);
    await world.globals.Hooks.callAll('createChatMessage', damage);
    const changed: AnyRecord = { 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 0 };
    await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, changed, { originatingMessage: damage });
    expect(changed['flags.' + MODULE_ID + '.damageProof']).toMatchObject({ attackId, attackMessageId: cardId, damageMessageId: damage.id });
    target.system.attributes.hp.value = 15;
    await world.globals.Hooks.callAll('updateActor', target, changed, {}, 'gm');
    await waitFor(() => attacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.attackId === attackId && entry.step === 'committed') === true, 'native6 Slow commit');
    expect(target.effects).toHaveLength(1);
    expect(target.effects[0].instance.effectKind).toBe('slow');
    await world.globals.Hooks.callAll('updateActor', target, changed, {}, 'gm');
    await settleAsync();
    expect(target.effects).toHaveLength(1);
    runtime.stop();
  });


  test('native6 local10 type4 settles Slow from canonical message identity and actual HP update once', async () => {
    const world = createWorld();
    world.globals.game.version = '14.368';
    world.globals.game.system.version = '6.0.5';
    const originalGet = world.globals.game.modules.get;
    originalGet('fvtt-custom-conditions').version = '0.2.0';
    originalGet('fvtt-custom-conditions').api.weaponEffects.capabilities = { native6Effects: 1 };
    originalGet('fvtt-trigger-engine').version = '0.2.0';
    world.globals.game.modules.get = (id: string) => id === 'midi-qol'
      ? { id, active: true, version: '14.6.0-beta.4338eeab.local.10' } : originalGet(id);
    world.globals.fromUuidSync = (uuid: string) => world.tokens.get(uuid);
    const attacker = makeActor('next-attacker', 'player', ['longsword']);
    const target = makeActor('next-target');
    registerActor(world, attacker);
    registerActor(world, target);
    const token = makeToken(world, target);
    const item = makeItem(world, attacker, 'next-weapon', masteryConfiguration('slow'), { mastery: 'slow' });
    const activity = makeActivity(world, item, 'next-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const attackId = 'next-same-card', cardId = 'next-card';
    const prepared = await runtime.prepareUse(activity, { targetActor: target, targetToken: token, attackId, messageId: cardId });
    expect(prepared).toBeDefined();
    await runtime.startUse(prepared!);
    const card = putMessage(world, activity, cardId, { attackId, total: 18, isSuccess: true });
    delete card.flags.dnd5e;
    card.type = 'usage';
    card.system = { activity: { uuid: activity.uuid }, item: { uuid: item.uuid },
      targets: [{ actor: target.uuid, token: token.uuid }], origin: null };
    card.flags['midi-qol'] = { type: 3, sourceActorUuid: attacker.uuid, hitTargetUuids: [token.uuid] };
    card.rolls[0].options = { 'midi-qol': { rollType: 'attack' } };
    await linkRollMessage(world, activity, cardId);
    expect((await runtime.commitUse(prepared!, { messageId: cardId })).status).toBe('pending');
    card.flags['midi-qol'].type = 4;
    card.rolls.push({ total: 5, options: { 'midi-qol': { rollType: 'defaultDamage' } }, parent: card });
    const changed: AnyRecord = { 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 0 };
    await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, changed, { originatingMessage: card });
    expect(changed['flags.' + MODULE_ID + '.damageProof']).toMatchObject({ attackId, attackMessageId: cardId, damageMessageId: cardId });
    target.system.attributes.hp.value = 15;
    await world.globals.Hooks.callAll('updateActor', target, changed, {}, 'gm');
    await waitFor(() => attacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.attackId === attackId && entry.step === 'committed') === true, 'native6 Slow commit');
    expect(target.effects).toHaveLength(1);
    expect(target.effects[0].instance.effectKind).toBe('slow');
    await world.globals.Hooks.callAll('updateActor', target, changed, {}, 'gm');
    await settleAsync();
    expect(target.effects).toHaveLength(1);
    runtime.stop();
  });


  test('native mastery uses the locked nested Set and one Activity.use consumes one native resource', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const item = makeItem(world, attacker, 'graze-sword', masteryConfiguration('graze'), {
      baseItem: 'longsword',
      mastery: 'graze',
      uses: 1,
    });
    const activity = makeActivity(world, item, 'graze-activity', {
      mastery: 'graze',
      messageId: 'native-graze-message',
      roll: { total: 5, isSuccess: false },
    });
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    expect(world.globals.Hooks.count('dnd5e.preUseActivity')).toBe(1);
    expect(world.globals.Hooks.count('dnd5e.preRollAttack')).toBe(1);

    const result = await runtime.use(activity, {
      targetActor: target,
      attackId: 'native-graze-attack',
      selectedMasteryRuleId: 'graze',
    });
    await waitFor(() => world.globals.game.actors.get('attacker')?.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.attackId === 'native-graze-attack' && entry.step === 'committed') === true, 'native graze commit');

    expect(result?.status).toBe('committed');
    expect(activity.calls.use).toBe(1);
    expect(activity.calls.rollAttack).toBe(1);
    expect(activity.lastUsage).toMatchObject({ subsequentActions: false });
    expect(item.system.uses.value).toBe(0);
    expect(target.damageCalls).toHaveLength(1);
    expect(target.damageCalls[0].damages[0]).toMatchObject({ value: 3, type: 'slashing' });
    runtime.stop();
  });

  test('normal preUseActivity captures game.user.targets and repeated first/second hooks hand off one guarded attack', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const token = makeToken(world, target);
    world.globals.game.user.targets.add(token);
    const item = makeItem(world, attacker, 'normal-preuse-sword', masteryConfiguration('nick'), {
      baseItem: 'longsword',
      mastery: 'nick',
      light: true,
    });
    const activity = makeActivity(world, item, 'normal-preuse-activity', {
      mastery: 'nick',
      roll: { total: 5, isSuccess: false },
    });
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const first = await world.globals.Hooks.call('dnd5e.preUseActivity', activity, {}, {}, {});
    const second = await world.globals.Hooks.call('dnd5e.preUseActivity', activity, {}, {}, {});
    expect(first).toBeFalse();
    expect(second).toBeFalse();
    await waitFor(() => activity.calls.use === 1 && activity.calls.rollAttack === 1, 'normal preUse handoff');
    await waitFor(() => attacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.activityUuid === activity.uuid), 'normal preUse target ledger');

    const entry = attacker.getFlag(MODULE_ID, 'ledger').find((candidate: any) => candidate.activityUuid === activity.uuid);
    expect(activity.calls.use).toBe(1);
    expect(activity.calls.rollAttack).toBe(1);
    expect(entry).toMatchObject({ targetActorUuid: target.uuid, targetTokenUuid: token.uuid });
    expect(activity.lastUsage[PRIVATE_USE_KEY]).toBeString();
    expect(activity.lastUsage.subsequentActions).toBeFalse();
    runtime.stop();
  });

  test('native attack dialog blocks a duplicate chat roll without cancelling its original reservation', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker');
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    attacker.effects.push(makeEffect('sap', 'Actor.enemy', attacker.uuid, 'original-sap'));
    const item = makeItem(world, attacker, 'single-native-sword', disabledConfiguration());
    const activity = makeActivity(world, item, 'single-native-activity');
    let completeDialog: ((rolls: any[]) => void) | undefined;
    let opened = 0;
    world.globals.game.dnd5e = {
      applications: { dice: { AttackRollConfigurationDialog: { configure() {
        opened += 1;
        return new Promise<any[]>(resolve => { completeDialog = resolve; });
      } } } },
      dice: { D20Roll: { DefaultConfigurationDialog: { configure() {
        throw new Error('Generic D20 dialog loses native attack-mode controls.');
      } } } },
    };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const pending = runtime.attack(activity, { targetActor: target, attackId: 'original-native-attack' });
    await waitFor(() => opened === 1, 'native attack dialog');
    const reserved = structuredClone(attacker.effects[0].instance.reservation);
    const duplicate: AnyRecord = { subject: activity, rolls: [{ options: {} }] };
    expect(runtime.preRollAttack(duplicate, {}, {})).toBeFalse();
    expect(duplicate[PRIVATE_USE_KEY]).toBeUndefined();
    expect(attacker.effects[0].instance.reservation).toEqual(reserved);
    expect(runtime.preRollAttack({ subject: activity, [PRIVATE_USE_KEY]: 'original-native-attack', rolls: [] }, {}, {})).toBeTrue();
    completeDialog!([]);
    expect((await pending)?.status).toBe('cancelled');
    expect(opened).toBe(1);
    expect(attacker.effects).toHaveLength(1);
    expect(attacker.effects[0].instance.reservation).toBeUndefined();
    runtime.stop();
  });

  test.each([
    { effect: 'vex', disadvantage: false, expectedButton: 'advantage' },
    { effect: 'vex', disadvantage: true, expectedButton: 'normal' },
    { effect: 'sap', disadvantage: false, expectedButton: 'disadvantage' },
  ])('native $effect enters earlier roll hooks before their dialog mode is captured ($expectedButton)', async ({ effect, disadvantage, expectedButton }) => {
    const world = createWorld();
    const attacker = makeActor('attacker');
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    attacker.effects.push(makeEffect(effect, effect === 'vex' ? attacker.uuid : 'Actor.enemy', effect === 'vex' ? target.uuid : attacker.uuid, 'incoming-effect'));
    const item = makeItem(world, attacker, 'incoming-sword', disabledConfiguration());
    const activity = makeActivity(world, item, 'incoming-activity');
    const order: string[] = [];
    // A listener registered before WMP, like AC5e's incoming-mode capture.
    world.globals.Hooks.on('dnd5e.preRollAttack', (config: AnyRecord, dialog: AnyRecord) => {
      order.push('capture');
      dialog.options = { defaultButton: config.advantage && !config.disadvantage ? 'advantage'
        : config.disadvantage && !config.advantage ? 'disadvantage' : 'normal' };
    });
    world.globals.game.dnd5e = { applications: { dice: { AttackRollConfigurationDialog: { configure(_config: AnyRecord, dialog: AnyRecord) {
      order.push('dialog');
      expect(dialog.options.defaultButton).toBe(expectedButton);
      return [];
    } } } } };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const result = await runtime.attack(activity, { targetActor: target, usage: { disadvantage } });
    expect(result?.status).toBe('cancelled');
    expect(order).toEqual(['capture', 'dialog']);
    expect(attacker.effects).toHaveLength(1);
    expect(attacker.effects[0].instance.reservation).toBeUndefined();
    runtime.stop();
  });

  test('native dialog CANCEL retains Sap and releases its preflight reservation', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker');
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    attacker.effects.push(makeEffect('sap', 'Actor.enemy', attacker.uuid, 'dialog-sap'));
    const item = makeItem(world, attacker, 'dialog-sword', disabledConfiguration());
    const activity = makeActivity(world, item, 'dialog-cancel-activity');
    world.globals.game.dnd5e = { dice: { D20Roll: { DefaultConfigurationDialog: { async configure() { return []; } } } } };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const result = await runtime.attack(activity, {
      targetActor: target,
      attackId: 'dialog-cancel-sap',
      rollDialog: {},
    });

    expect(result?.status).toBe('cancelled');
    expect(activity.calls.rollAttack).toBe(1);
    expect(attacker.effects).toHaveLength(1);
    expect(attacker.effects[0].instance.reservation).toBeUndefined();
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === 'dialog-cancel-sap')).toMatchObject({ step: 'cancelled' });
    runtime.stop();
  });

  test('Midi reserves before its dialog but starts only after confirmation, and cancel releases Sap', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker');
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    attacker.effects.push(makeEffect('sap', 'Actor.enemy', attacker.uuid, 'midi-dialog-sap'));
    const item = makeItem(world, attacker, 'midi-dialog-sword', disabledConfiguration());
    const activity = makeActivity(world, item, 'midi-dialog-activity');
    const modules = world.globals.game.modules;
    const originalGet = modules.get.bind(modules);
    modules.get = (id: string) => id === 'midi-qol' ? { active: true, version: '14.0.11' } : originalGet(id);
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const abortedStates: string[] = [];
    const workflow: AnyRecord = {
      id: 'midi-dialog-workflow', activity, targets: new Set([makeToken(world, target)]), attackRollCount: 0,
      options: {}, workflowOptions: { fastForwardAttack: true }, WorkflowState_Abort: 'abort',
      async performState(state: string) { abortedStates.push(state); },
    };

    expect(await world.globals.Hooks.call('midi-qol.preAttackRoll', workflow)).not.toBeFalse();
    expect(attacker.effects[0].instance.reservation?.state).toBe('reserved');
    const config: AnyRecord = { subject: activity, rolls: [{ options: {} }] };
    const dialog: AnyRecord = { configure: false, applicationClass: { async configure() { return []; } } };
    expect(await world.globals.Hooks.call('dnd5e.preRollAttack', config, dialog, {})).not.toBeFalse();
    expect(dialog.configure).toBeTrue();
    expect(attacker.effects[0].instance.reservation?.state).toBe('reserved');
    expect(await dialog.applicationClass.configure({ activity })).toEqual([]);
    expect(attacker.effects[0].instance.reservation).toBeUndefined();
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === workflow[PRIVATE_USE_KEY])).toMatchObject({ step: 'cancelled' });
    expect(workflow.aborted).toBeTrue();
    expect(abortedStates).toEqual(['abort']);
    runtime.stop();
  });

  test('a Midi attack without a live prepared state cannot start a second native roll', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker');
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'midi-unprepared-effect'));
    const item = makeItem(world, attacker, 'midi-unprepared-vex', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'midi-unprepared-activity');
    const modules = world.globals.game.modules;
    const originalGet = modules.get.bind(modules);
    modules.get = (id: string) => id === 'midi-qol' ? { active: true, version: '14.0.11' } : originalGet(id);
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const config: AnyRecord = { subject: activity, rolls: [{ options: {} }] };
    expect(await world.globals.Hooks.call('dnd5e.preRollAttack', config, {}, {})).toBeFalse();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(activity.calls.rollAttack).toBe(0);
    expect(attacker.getFlag(MODULE_ID, 'ledger') ?? []).toHaveLength(0);
    expect(attacker.effects[0].instance.reservation).toBeUndefined();
    runtime.stop();
  });

  test('GM can cancel a persisted unstarted Vex reservation after runtime reload', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker');
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'reloaded-vex'));
    const item = makeItem(world, attacker, 'reloaded-vex-weapon', masteryConfiguration('vex'));
    const activity = makeActivity(world, item, 'reloaded-vex-activity');
    const firstRuntime = createWeaponMasteryRuntime({ globals: world.globals });
    firstRuntime.start();
    const prepared = await firstRuntime.prepareUse(activity, { targetActor: target, attackId: 'reloaded-vex-attack' });
    expect(prepared?.reservations).toHaveLength(1);
    expect(attacker.effects[0].instance.reservation?.state).toBe('reserved');
    firstRuntime.stop();

    const recoveredRuntime = createWeaponMasteryRuntime({ globals: world.globals });
    recoveredRuntime.start();
    const result = await recoveredRuntime.cancelUse({ attackId: prepared!.attackId, sourceActorUuid: attacker.uuid } as any);
    expect(result.status).toBe('cancelled');
    expect(activity.calls.rollAttack).toBe(0);
    expect(attacker.effects[0].instance.reservation).toBeUndefined();
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === prepared!.attackId)).toMatchObject({ step: 'cancelled' });
    recoveredRuntime.stop();
  });

  test('dialog mastery and offhand selection finalize before the existing Nick attack starts', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    attacker.system.traits.weaponProf.mastery.bonus = new Set(['nick']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const primaryItem = makeItem(world, attacker, 'dialog-primary', disabledConfiguration(), { light: true });
    const primaryActivity = makeActivity(world, primaryItem, 'dialog-primary-activity', { roll: { total: 15, isSuccess: true } });
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    expect((await commitDirect(runtime, primaryActivity, target, 'dialog-primary-attack', world)).status).toBe('committed');

    const nickItem = makeItem(world, attacker, 'dialog-nick', masteryConfiguration('nick'), { light: true });
    const offhandActivity = makeActivity(world, nickItem, 'dialog-nick-offhand', { roll: { total: 15, isSuccess: true } });
    world.globals.game.dnd5e = {
      dice: {
        D20Roll: {
          DefaultConfigurationDialog: {
            async configure() {
              return [{ total: 15, isSuccess: true, options: { mastery: 'nick', attackMode: 'offhand' } }];
            },
          },
        },
      },
    };

    const result = await runtime.attack(offhandActivity, {
      targetActor: target,
      attackId: 'dialog-nick-offhand-attack',
      attackMode: 'offhand',
      rollDialog: {},
    });
    const ledger = attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === 'dialog-nick-offhand-attack');

    expect(result?.status).toBe('committed');
    expect(offhandActivity.calls.rollAttack).toBe(1);
    expect(ledger).toMatchObject({ selectedMasteryRuleId: 'nick', attackMode: 'offhand', lightExtraAttack: true, step: 'committed' });
    expect(ledger.usedRuleIds).toContain('dnd2024.nick');
    runtime.stop();
  });

  test('Midi fast-forward intent still finalizes the actual offhand Nick selection before starting', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const firstItem = makeItem(world, attacker, 'midi-first-light', disabledConfiguration(), { light: true });
    const firstActivity = makeActivity(world, firstItem, 'midi-first-activity');
    const nickItem = makeItem(world, attacker, 'midi-nick-light', masteryConfiguration('nick'), { light: true, mastery: 'nick' });
    const nickActivity = makeActivity(world, nickItem, 'midi-nick-activity');
    const modules = world.globals.game.modules;
    const originalGet = modules.get.bind(modules);
    modules.get = (id: string) => id === 'midi-qol' ? { active: true, version: '14.0.11' } : originalGet(id);
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    expect((await commitDirect(runtime, firstActivity, target, 'midi-first-attack', world)).status).toBe('committed');

    const workflow: AnyRecord = {
      id: 'midi-nick-workflow', activity: nickActivity, attackRollCount: 0,
      targets: new Set([makeToken(world, target)]), options: {}, workflowOptions: { fastForwardAttack: true },
    };
    expect(await world.globals.Hooks.call('midi-qol.preAttackRoll', workflow)).not.toBeFalse();
    const config: AnyRecord = { subject: nickActivity, rolls: [{ options: {} }] };
    const dialog: AnyRecord = {
      configure: false,
      applicationClass: { async configure() { return [{ options: { mastery: 'nick', attackMode: 'offhand' } }]; } },
    };
    expect(await world.globals.Hooks.call('dnd5e.preRollAttack', config, dialog, {})).not.toBeFalse();
    expect(dialog.configure).toBeTrue();
    const rolls = await dialog.applicationClass.configure({ activity: nickActivity });
    expect(await world.globals.Hooks.call('dnd5e.postAttackRollConfiguration', rolls, config)).not.toBeFalse();
    const childId = workflow[PRIVATE_USE_KEY];
    const ledger = attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === childId);
    expect(ledger).toMatchObject({ attackMode: 'offhand', lightExtraAttack: true, step: 'started' });
    putMessage(world, nickActivity, 'midi-nick-message', { attackId: childId });
    await linkRollMessage(world, nickActivity, 'midi-nick-message');
    expect((await runtime.commitUse({ attackId: childId, sourceActorUuid: attacker.uuid } as any, { messageId: 'midi-nick-message' })).status).toBe('committed');
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === childId).usedRuleIds).toContain('dnd2024.nick');
    runtime.stop();
  });

  test('Sap on afflicted B is reserved for B to C and never for incoming A to B', async () => {
    const world = createWorld();
    const a = makeActor('a');
    const b = makeActor('b');
    const c = makeActor('c');
    for (const actor of [a, b, c]) registerActor(world, actor);
    b.effects.push(makeEffect('sap', a.uuid, b.uuid, 'sap-on-b'));
    const aItem = makeItem(world, a, 'a-sword', disabledConfiguration());
    const bItem = makeItem(world, b, 'b-sword', disabledConfiguration());
    const aActivity = makeActivity(world, aItem, 'a-attack');
    const bActivity = makeActivity(world, bItem, 'b-attack');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const incoming = await runtime.prepareUse(aActivity, { targetActor: b, attackId: 'a-to-b' });
    expect(incoming?.reservations).toHaveLength(0);
    expect(b.effects[0].instance.reservation).toBeUndefined();

    const outgoing = await runtime.prepareUse(bActivity, { targetActor: c, attackId: 'b-to-c' });
    expect(outgoing?.reservations).toHaveLength(1);
    expect(outgoing?.reservations[0]).toMatchObject({ kind: 'sap', targetActorUuid: b.uuid });
    expect(outgoing?.modifiers).toMatchObject({ advantage: false, disadvantage: true });
    const nativeConfig: AnyRecord = { subject: bActivity, [PRIVATE_USE_KEY]: outgoing!.attackId, rolls: [{ options: {} }] };
    await world.globals.Hooks.call('dnd5e.preRollAttack', nativeConfig);
    expect(nativeConfig.disadvantage).toBeTrue();
    await runtime.cancelUse(outgoing!);
    expect(b.effects[0].instance.reservation).toBeUndefined();
    runtime.stop();
  });

  test('serialized USER_QUERY preserves reserved Vex advantage for native and Midi after GM preparation', async () => {
    const gmWorld = createWorld();
    const playerWorld = createWorld({ user: 'player' });
    const gmAttacker = makeActor('attacker');
    const gmTarget = makeActor('target');
    const playerAttacker = makeActor('attacker');
    const playerTarget = makeActor('target');
    gmWorld.actors.clear();
    playerWorld.actors.clear();
    for (const actor of [gmAttacker, gmTarget]) registerActor(gmWorld, actor);
    for (const actor of [playerAttacker, playerTarget]) registerActor(playerWorld, actor);
    gmAttacker.effects.push(makeEffect('vex', gmAttacker.uuid, gmTarget.uuid, 'transport-vex'));
    playerAttacker.effects.push(makeEffect('vex', playerAttacker.uuid, playerTarget.uuid, 'transport-vex'));
    const gmItem = makeItem(gmWorld, gmAttacker, 'transport-sword', disabledConfiguration(), { mastery: 'vex' });
    const playerItem = makeItem(playerWorld, playerAttacker, 'transport-sword', disabledConfiguration(), { mastery: 'vex' });
    const gmActivity = makeActivity(gmWorld, gmItem, 'transport-activity', { mastery: 'vex', messageId: 'transport-message' });
    const playerActivity = makeActivity(playerWorld, playerItem, 'transport-activity', { mastery: 'vex', messageId: 'transport-message' });
    const gmRuntime = createWeaponMasteryRuntime({ globals: gmWorld.globals });
    const playerRuntime = createWeaponMasteryRuntime({ globals: playerWorld.globals });
    const transport = installQueryTransport(playerWorld, gmWorld);
    gmRuntime.start();
    playerRuntime.start();

    const prepared = await playerRuntime.prepareUse(playerActivity, { targetActor: playerTarget, attackId: 'transport-vex-attack', messageId: 'transport-message' });
    expect(prepared?.modifiers.advantage).toBeTrue();
    expect(transport.calls[0]?.name).toContain('.prepareUse');
    expect(transport.calls[0]?.payload).toMatchObject({ itemUuid: playerItem.uuid, actorUuid: playerAttacker.uuid, targetActorUuid: playerTarget.uuid });
    expect(transport.calls[0]?.payload.item).toBeUndefined();
    expect(transport.calls[0]?.payload.actor).toBeUndefined();
    expect(transport.calls[0]?.context.user).toBe(playerWorld.player);
    expect(gmAttacker.effects[0].instance.reservation).toMatchObject({ attackId: 'transport-vex-attack', state: 'reserved' });

    await playerRuntime.startUse(prepared!);
    const nativeConfig: AnyRecord = { subject: playerActivity, [PRIVATE_USE_KEY]: prepared!.attackId, rolls: [{ options: {} }] };
    await playerWorld.globals.Hooks.call('dnd5e.preRollAttack', nativeConfig);
    expect(nativeConfig.advantage).toBeTrue();
    expect(nativeConfig.rolls[0].options.advantage).toBeTrue();

    const workflow: AnyRecord = {
      activity: playerActivity,
      options: { [PRIVATE_USE_KEY]: prepared!.attackId },
      attackRollModifierTracker: { advantage: new Set<string>(), disadvantage: new Set<string>() },
    };
    const midiAllowed = await playerWorld.globals.Hooks.call('midi-qol.preAttackRoll', workflow);
    expect(midiAllowed).not.toBeFalse();
    await playerWorld.globals.Hooks.callAll('midi-qol.preAttackRollConfig', workflow);
    expect(workflow.attackRollModifierTracker.advantage.has('Weapon mastery effect')).toBeTrue();

    putMessage(gmWorld, gmActivity, 'transport-message', { total: 15, isSuccess: true, attackId: prepared!.attackId, authorId: playerWorld.player.id });
    await linkRollMessage(gmWorld, gmActivity, 'transport-message');
    const [firstCommit, secondCommit] = await Promise.all([
      playerRuntime.commitUse(prepared!, { messageId: 'transport-message' }),
      playerRuntime.commitUse(prepared!, { messageId: 'transport-message' }),
    ]);
    expect(firstCommit.status).toBe('committed');
    expect(secondCommit.status).toBe('committed');
    expect(gmAttacker.effects.find((entry: EffectEntry) => entry.id === 'transport-vex')).toBeUndefined();
    expect(transport.calls.filter((entry) => entry.name === WEAPON_QUERY_COMMIT)).toHaveLength(2);
    expect(transport.calls.every((entry) => entry.context.user === playerWorld.player)).toBeTrue();
    gmRuntime.stop();
    playerRuntime.stop();
  });

  test('commit rejects claimed hit and critical outcomes without a started linked ChatMessage or with wrong actor/activity context', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker');
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const item = makeItem(world, attacker, 'validation-sword', disabledConfiguration());
    const activity = makeActivity(world, item, 'validation-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const notStarted = await runtime.prepareUse(activity, { targetActor: target, attackId: 'not-started', messageId: 'missing-chat' });
    const noStartResult = await runtime.commitUse(notStarted!, { messageId: 'missing-chat', outcome: 'hit', critical: true });
    expect(noStartResult.status).toBe('failed');
    expect(noStartResult.reason).toBe('attack-not-started');

    const missingMessage = await runtime.prepareUse(activity, { targetActor: target, attackId: 'started-no-message', messageId: 'missing-chat-2' });
    await runtime.startUse(missingMessage!);
    const missingResult = await runtime.commitUse(missingMessage!, { messageId: 'missing-chat-2', outcome: 'hit', critical: true });
    expect(missingResult.status).toBe('failed');
    expect(missingResult.reason).toBe('missing-authoritative-outcome');

    const wrongActor = await runtime.prepareUse(activity, { targetActor: target, attackId: 'wrong-actor-message', messageId: 'wrong-actor-message' });
    await runtime.startUse(wrongActor!);
    putMessage(world, activity, 'wrong-actor-message', { actorUuid: 'Actor.other', attackId: wrongActor!.attackId });
    const wrongActorResult = await runtime.commitUse(wrongActor!, { messageId: 'wrong-actor-message', outcome: 'hit', critical: true });
    expect(wrongActorResult.status).toBe('failed');

    const wrongActivity = await runtime.prepareUse(activity, { targetActor: target, attackId: 'wrong-activity-message', messageId: 'wrong-activity-message' });
    await runtime.startUse(wrongActivity!);
    putMessage(world, activity, 'wrong-activity-message', { activityUuid: 'Actor.attacker.Item.other.Activity.other', attackId: wrongActivity!.attackId });
    const wrongActivityResult = await runtime.commitUse(wrongActivity!, { messageId: 'wrong-activity-message', outcome: 'hit', critical: true });
    expect(wrongActivityResult.status).toBe('failed');

    const wrongSpeaker = await runtime.prepareUse(activity, { targetActor: target, attackId: 'wrong-speaker-message' });
    await runtime.startUse(wrongSpeaker!);
    const forgedSpeaker = putMessage(world, activity, 'wrong-speaker-message', { attackId: wrongSpeaker!.attackId });
    forgedSpeaker.speaker = { actor: 'other' };
    expect((await runtime.commitUse(wrongSpeaker!, { messageId: 'wrong-speaker-message' })).reason).toBe('missing-authoritative-outcome');

    const missingSpeaker = await runtime.prepareUse(activity, { targetActor: target, attackId: 'missing-speaker-message' });
    await runtime.startUse(missingSpeaker!);
    const noSpeaker = putMessage(world, activity, 'missing-speaker-message', { attackId: missingSpeaker!.attackId });
    delete (noSpeaker as AnyRecord).speaker;
    expect((await runtime.commitUse(missingSpeaker!, { messageId: 'missing-speaker-message' })).reason).toBe('missing-authoritative-outcome');
    runtime.stop();
  });

  test('reused attack IDs and simultaneous commits cannot double Graze damage', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const item = makeItem(world, attacker, 'idempotent-sword', masteryConfiguration('graze'), { baseItem: 'longsword', mastery: 'graze' });
    const activity = makeActivity(world, item, 'idempotent-activity', { mastery: 'graze' });
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const messageId = 'idempotent-message';
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'reused-graze', messageId });
    await runtime.startUse(prepared!);
    putMessage(world, activity, messageId, { total: 5, isSuccess: false, attackId: 'reused-graze' });
    await linkRollMessage(world, activity, messageId);
    const [first, second] = await Promise.all([
      runtime.commitUse(prepared!, { messageId, outcome: 'miss' }),
      runtime.commitUse(prepared!, { messageId, outcome: 'miss' }),
    ]);
    await expect(runtime.prepareUse(activity, { targetActor: target, attackId: 'reused-graze', messageId: 'different-message' }))
      .rejects.toThrow(/already been used/i);

    expect(first.status).toBe('committed');
    expect(second.status).toBe('committed');
    expect(target.damageCalls).toHaveLength(1);
    expect(target.damageCalls[0].damages[0]).toMatchObject({ value: 3, type: 'slashing' });
    expect(attacker.getFlag(MODULE_ID, 'ledger').filter((entry: any) => entry.attackId === 'reused-graze')).toHaveLength(1);
    runtime.stop();
  });

  test('simultaneous Vex commits consume the old instance before applying exactly one new instance', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    attacker.effects.push(makeEffect('vex', attacker.uuid, target.uuid, 'old-vex'));
    const item = makeItem(world, attacker, 'vex-sword', masteryConfiguration('vex'), { baseItem: 'longsword', mastery: 'vex' });
    const activity = makeActivity(world, item, 'vex-activity', { mastery: 'vex' });
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const messageId = 'vex-reapply-message';
    const prepared = await runtime.prepareUse(activity, {
      targetActor: target,
      attackId: 'vex-reapply',
      messageId,
      damageDealt: 5,
    });
    expect(prepared?.reservations).toHaveLength(1);
    await runtime.startUse(prepared!);
    putMessage(world, activity, messageId, { total: 15, isSuccess: true, attackId: 'vex-reapply' });
    await linkRollMessage(world, activity, messageId);
    await applyAuthoritativeDamage(world, target, messageId, 5);
    // The authoritative target HP readback supplies the actual damage amount
    // used by Vex eligibility; the runtime must not trust a claimed number.
    target.system.attributes.hp.value = 15;
    const [first, second] = await Promise.all([
      runtime.commitUse(prepared!, { messageId, outcome: 'hit' }),
      runtime.commitUse(prepared!, { messageId, outcome: 'hit' }),
    ]);
    const apiEvents = world.effectApis.flatMap((api) => api.events);
    const oldCommitIndex = apiEvents.indexOf('commit:old-vex');
    const newApplyIndex = apiEvents.findIndex((event) => event.startsWith('apply:'));

    expect(first.status).toBe('committed');
    expect(second.status).toBe('committed');
    expect(oldCommitIndex).toBeGreaterThanOrEqual(0);
    expect(newApplyIndex).toBeGreaterThan(oldCommitIndex);
    expect(apiEvents.filter((event) => event === 'commit:old-vex')).toHaveLength(1);
    expect(apiEvents.filter((event) => event.startsWith('apply:'))).toHaveLength(1);
    expect(attacker.effects).toHaveLength(1);
    expect(attacker.effects[0].instance).toMatchObject({ effectKind: 'vex', source: { actorUuid: attacker.uuid }, target: { actorUuid: target.uuid } });
    runtime.stop();
  });

  test('per-rule turn quotas ignore unrelated spell and weapon attack ledger entries', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const spellItem = makeItem(world, attacker, 'spell', disabledConfiguration(), { type: 'spell' });
    const unrelatedWeapon = makeItem(world, attacker, 'unrelated-weapon', disabledConfiguration(), { type: 'weapon' });
    const primaryLightItem = makeItem(world, attacker, 'primary-light', disabledConfiguration(), { type: 'weapon', baseItem: 'longsword', light: true });
    const nickItem = makeItem(world, attacker, 'nick-sword', masteryConfiguration('nick'), {
      baseItem: 'longsword',
      mastery: 'nick',
      light: true,
    });
    const alternateItem = makeItem(world, attacker, 'alternate-light', disabledConfiguration(), { light: true });
    const spellActivity = makeActivity(world, spellItem, 'spell-activity');
    const unrelatedActivity = makeActivity(world, unrelatedWeapon, 'unrelated-activity');
    const primaryLightActivity = makeActivity(world, primaryLightItem, 'primary-light-activity', { roll: { total: 15, isSuccess: true } });
    // The existing offhand Activity is the extra Light attack that Nick is
    // allowed to convert into the Attack action.  The runtime must consume
    // this call; it must not manufacture a third roll from alternateActivity.
    const offhandActivity = makeActivity(world, nickItem, 'nick-offhand-activity', { mastery: 'nick', roll: { total: 15, isSuccess: true } });
    const alternateActivity = makeActivity(world, alternateItem, 'alternate-activity', { roll: { total: 15, isSuccess: true } });
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const spellCommit = await commitDirect(runtime, spellActivity, target, 'unrelated-spell', world);
    const attackCommit = await commitDirect(runtime, unrelatedActivity, target, 'unrelated-attack', world);
    const primaryCommit = await commitDirect(runtime, primaryLightActivity, target, 'related-primary-light', world);
    expect(spellCommit.status).toBe('committed');
    expect(attackCommit.status).toBe('committed');
    expect(primaryCommit.status).toBe('committed');

    offhandActivity.lastAttackId = 'nick-after-unrelated';
    const committed = await runtime.attack(offhandActivity, {
      targetActor: target,
      attackId: 'nick-after-unrelated',
      action: 'attack',
      attackMode: 'offhand',
      lightExtraAttack: true,
      outcome: 'hit',
      damageDealt: 5,
    });

    expect(committed).toBeDefined();
    const committedResult = committed!;
    expect(committedResult.status).toBe('committed');
    const nickLedger = attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === 'nick-after-unrelated');
    expect(nickLedger).toMatchObject({ lightExtraAttack: true, attackMode: 'offhand', step: 'committed' });
    expect(nickLedger.usedRuleIds).toContain('dnd2024.nick');
    expect(nickLedger.steps['dnd2024.nick']).toBe('settled');
    expect(offhandActivity.calls.rollAttack).toBe(1);
    expect(alternateActivity.calls.rollAttack).toBe(0);
    runtime.stop();
  });

  test('unearned mastery does not prevent an ordinary attack or an independent Deadly property', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', []);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const item = makeItem(world, attacker, 'unearned-sword', {
      schemaVersion: 1, enabled: true, mastery: 'native', grantMastery: false,
      rules: [{ ruleId: 'homebrew.deadly', kind: 'deadly', label: 'Deadly', params: { dice: 1, die: 8 }, stackingGroup: 'homebrew.deadly' }],
    }, { mastery: 'sap' });
    const activity = makeActivity(world, item, 'unearned-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId: 'unearned-ordinary' });
    expect(prepared?.nativeMasteryUnlocked).toBeFalse();
    await runtime.startUse(prepared!);
    putMessage(world, activity, 'unearned-message', { attackId: 'unearned-ordinary' });
    await linkRollMessage(world, activity, 'unearned-message');
    const result = await runtime.commitUse(prepared!, { messageId: 'unearned-message' });
    expect(result.status).toBe('committed');
    expect(result.settlements).toHaveLength(0);
    runtime.stop();
  });

  test('a copied Sap preset keeps its own rule identity and uses the native kind for qualification', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const copied = { ...officialMasteryRule('sap'), ruleId: 'homebrew.sap.stunning', stackingGroup: 'homebrew.sap.stunning' };
    const item = makeItem(world, attacker, 'copied-sap', {
      schemaVersion: 1, enabled: true, mastery: copied.ruleId, grantMastery: false, rules: [copied],
    }, { mastery: 'sap' });
    const activity = makeActivity(world, item, 'copied-sap-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const result = await commitDirect(runtime, activity, target, 'copied-sap-attack', world);
    expect(result.status).toBe('committed');
    expect(target.effects).toHaveLength(1);
    expect(target.effects[0].instance).toMatchObject({ effectKind: 'sap', ruleId: copied.ruleId, stackingGroup: copied.stackingGroup });
    runtime.stop();
  });

  test('a missing Custom Conditions effect leaves Sap failed for GM reconciliation', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const item = makeItem(world, attacker, 'sap-sword', masteryConfiguration('sap'), { mastery: 'sap' });
    const activity = makeActivity(world, item, 'sap-activity');
    world.effectApis[0]!.apply = async () => undefined;
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const result = await commitDirect(runtime, activity, target, 'missing-sap-effect', world);
    expect(result.status).toBe('failed');
    expect(result.reason).toContain('not confirmed active');
    expect(result.settlements).toHaveLength(0);
    expect(target.effects).toHaveLength(0);
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === 'missing-sap-effect'))
      .toMatchObject({ step: 'failed', steps: { 'dnd2024.sap': 'failed' } });
    runtime.stop();
  });

  test('an unrelated returned effect cannot settle Sap', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const item = makeItem(world, attacker, 'sap-sword', masteryConfiguration('sap'), { mastery: 'sap' });
    const activity = makeActivity(world, item, 'sap-activity');
    const api = world.effectApis[0]!;
    const originalApply = api.apply;
    api.apply = async (actor: any, input: AnyRecord) => {
      const effect = await originalApply(actor, input);
      effect.instance.ruleId = 'unrelated.rule';
      return effect;
    };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const result = await commitDirect(runtime, activity, target, 'wrong-sap-effect', world);
    expect(result.status).toBe('failed');
    expect(result.settlements).toHaveLength(0);
    expect(target.effects[0].instance.ruleId).toBe('unrelated.rule');
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === 'wrong-sap-effect'))
      .toMatchObject({ step: 'failed', steps: { 'dnd2024.sap': 'failed' } });
    runtime.stop();
  });

  test('Slow confirms the created effect and preserves its reduction and owner', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const item = makeItem(world, attacker, 'slow-sword', masteryConfiguration('slow'), { mastery: 'slow' });
    const activity = makeActivity(world, item, 'slow-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const attackId = 'slow-confirmed-effect';
    const messageId = `${attackId}-message`;
    const prepared = await runtime.prepareUse(activity, { targetActor: target, attackId, messageId });
    await runtime.startUse(prepared!);
    putMessage(world, activity, messageId, { attackId });
    await linkRollMessage(world, activity, messageId);
    const first = await runtime.commitUse(prepared!, { messageId });
    expect(first.status).toBe('pending');
    await applyAuthoritativeDamage(world, target, messageId, 5);
    const result = await runtime.commitUse(prepared!, { messageId });
    expect(result.status).toBe('committed');
    await waitFor(() => attacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.attackId === attackId
      && entry.steps?.['dnd2024.slow'] === 'settled') === true, 'Slow settlement');
    expect(target.effects).toHaveLength(1);
    expect(target.effects[0].instance).toMatchObject({
      effectKind: 'slow', ruleId: 'dnd2024.slow', stackingGroup: 'dnd2024.slow', enabled: true,
      params: { speedReduction: 10 }, source: { actorUuid: attacker.uuid }, target: { actorUuid: target.uuid },
    });
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === attackId))
      .toMatchObject({ steps: { 'dnd2024.slow': 'settled' } });
    runtime.stop();
  });

  test('native fumble and critical override AC when isSuccess is absent', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const item = makeItem(world, attacker, 'edge-sword', masteryConfiguration('graze'), { mastery: 'graze' });
    const activity = makeActivity(world, item, 'edge-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const fumble = await runtime.prepareUse(activity, { targetActor: target, attackId: 'fumble' });
    await runtime.startUse(fumble!);
    const fumbleMessage = putMessage(world, activity, 'fumble-message', { total: 25, attackId: 'fumble' });
    delete fumbleMessage.rolls[0].isSuccess;
    fumbleMessage.rolls[0].isFumble = true;
    await linkRollMessage(world, activity, 'fumble-message');
    expect((await runtime.commitUse(fumble!, { messageId: 'fumble-message' })).outcome).toBe('miss');
    expect(target.damageCalls).toHaveLength(1);

    target.system.attributes.ac.value = 30;
    const critical = await runtime.prepareUse(activity, { targetActor: target, attackId: 'critical' });
    await runtime.startUse(critical!);
    const criticalMessage = putMessage(world, activity, 'critical-message', { total: 5, attackId: 'critical' });
    delete criticalMessage.rolls[0].isSuccess;
    criticalMessage.rolls[0].isCritical = true;
    await linkRollMessage(world, activity, 'critical-message');
    expect((await runtime.commitUse(critical!, { messageId: 'critical-message' })).outcome).toBe('hit');
    expect(target.damageCalls).toHaveLength(1);
    runtime.stop();
  });

  test('normal first Light weapon is recorded when a different weapon provides Nick', async () => {
    const world = createWorld();
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const target = makeActor('target');
    registerActor(world, attacker);
    registerActor(world, target);
    const token = makeToken(world, target);
    world.user.targets.add(token);
    const primaryItem = makeItem(world, attacker, 'plain-light', disabledConfiguration(), { light: true });
    const primaryActivity = makeActivity(world, primaryItem, 'plain-light-activity', { roll: { total: 15, isSuccess: true } });
    const nickItem = makeItem(world, attacker, 'enabled-nick', masteryConfiguration('nick'), { light: true, mastery: 'nick' });
    const nickActivity = makeActivity(world, nickItem, 'enabled-nick-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    expect(runtime.preUseActivity(primaryActivity, {}, {}, {})).toBeFalse();
    await waitFor(() => attacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.itemUuid === primaryItem.uuid && entry.step === 'committed'), 'plain Light entry');
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.itemUuid === primaryItem.uuid)).toMatchObject({ lightAttack: true });

    const ordinaryOffhand = makeItem(world, attacker, 'ordinary-offhand', disabledConfiguration(), { light: true });
    const ordinaryActivity = makeActivity(world, ordinaryOffhand, 'ordinary-offhand-activity');
    const ordinary = await runtime.prepareUse(ordinaryActivity, { targetActor: target, attackMode: 'offhand', attackId: 'ordinary-light-extra' });
    expect(ordinary?.lightExtraAttack).toBeTrue();
    await runtime.startUse(ordinary!);
    putMessage(world, ordinaryActivity, 'ordinary-extra-message', { attackId: ordinary!.attackId });
    await linkRollMessage(world, ordinaryActivity, 'ordinary-extra-message');
    expect((await runtime.commitUse(ordinary!, { messageId: 'ordinary-extra-message' })).status).toBe('committed');

    const nick = await runtime.prepareUse(nickActivity, { targetActor: target, attackMode: 'offhand', attackId: 'nick-after-light-extra' });
    expect(nick?.lightExtraAttack).toBeFalse();
    await runtime.cancelUse(nick!);
    runtime.stop();
  });

  test.each([
    ['14.364', '5.3.3', false],
    ['14.368', '6.0.5', false],
    ['14.368', '6.0.6', false],
    ['14.364', '5.3.3', true],
    ['14.368', '6.0.5', true],
    ['14.368', '6.0.6', true],
  ])('Cleave binds secondary attack and damage while preserving the primary selection on %s/%s (post-hook commits first: %s)', async (core, system, commitBeforeReturn) => {
    const world = createWorld();
    world.globals.game.version = core;
    world.globals.game.system.version = system;
    const native6 = system === '6.0.5' || system === '6.0.6';
    if (native6) world.globals.game.modules.get('fvtt-custom-conditions').api.weaponEffects.capabilities = { native6Effects: 1 };
    const attacker = makeActor('attacker', 'player', ['longsword']);
    const primary = makeActor('primary');
    const secondary = makeActor('secondary');
    for (const actor of [attacker, primary, secondary]) registerActor(world, actor);
    const sourceToken = makeToken(world, attacker);
    const primaryToken = makeToken(world, primary);
    const secondaryToken = makeToken(world, secondary);
    world.user.targets.add(primaryToken);
    Object.assign(sourceToken, { x: 0, y: 0 });
    Object.assign(primaryToken, { x: 100, y: 0 });
    Object.assign(secondaryToken, { x: 100, y: 100 });
    world.globals.canvas = {
      dimensions: { size: 100 },
      grid: { measurePath: ([from, to]: any[]) => ({ distance: Math.hypot(from.x - to.x, from.y - to.y) / 20 }) },
      tokens: { placeables: [sourceToken, primaryToken, secondaryToken] },
    };
    world.globals.foundry.applications = { api: { DialogV2: { wait: async () => secondaryToken } } };
    const item = makeItem(world, attacker, 'cleave-weapon', masteryConfiguration('cleave'), { mastery: 'cleave' });
    item.system.range.reach = 10;
    const activity = makeActivity(world, item, 'cleave-activity');
    activity.token = sourceToken;
    const descriptors = (target: any, token: any) => [{ actor: target.uuid, token: token.uuid, ac: target.system.attributes.ac.value, name: target.name, img: target.img }];
    const canonicalAttack = (message: any, targets: any[]) => {
      message.type = 'attack';
      message.system = { activity: { uuid: activity.uuid }, item: { uuid: item.uuid }, targets };
      delete message.flags.dnd5e;
      return message;
    };
    activity.rollAttack = async (usage: AnyRecord = {}, _dialog: AnyRecord = {}, messageOptions: AnyRecord = {}) => {
      activity.calls.rollAttack += 1;
      const childId = String(usage[PRIVATE_USE_KEY]);
      const message = makeMessage(world, 'cleave-child-message', attacker.uuid, activity.uuid, item.uuid, { total: 17, isSuccess: true }, childId);
      if (native6) {
        // 6.0.5 defaults to current user targets, then merges caller message.data.
        canonicalAttack(message, messageOptions.data?.system?.targets ?? descriptors(primary, primaryToken));
        expect(message.system.targets).toEqual(descriptors(secondary, secondaryToken));
      } else message.flags.dnd5e.targets = messageOptions.data?.flags?.dnd5e?.targets;
      await world.globals.Hooks.callAll('createChatMessage', message);
      await world.globals.Hooks.callAll('dnd5e.rollAttackV2', message.rolls, { subject: activity });
      if (commitBeforeReturn) {
        // The real native post hook can persist the child hit before rollAttack
        // returns. The wrapper's second commit must retain that outcome without
        // replaying the settlement or silently skipping the child damage.
        await world.globals.Hooks.callAll('dnd5e.postRollAttack', message.rolls, { subject: activity });
        await waitFor(() => attacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) =>
          entry.attackId === childId && entry.step === 'committed'), 'native child post-hook commit');
      }
      return message.rolls;
    };
    activity.rollDamage = async (config: AnyRecord, _dialog: AnyRecord, messageOptions: AnyRecord) => {
      const rollConfig: AnyRecord = {
        ...config, subject: activity,
        rolls: [{ base: true, data: { mod: 3 }, parts: ['1d8', '@mod'], options: { type: 'slashing' } }],
      };
      expect(await world.globals.Hooks.call('dnd5e.preRollDamage', rollConfig)).not.toBeFalse();
      const damageMessage = native6
        ? { id: 'cleave-child-damage-message', type: 'damage', system: {
          ...messageOptions.data?.system,
          targets: messageOptions.data?.system?.targets ?? descriptors(primary, primaryToken),
        } }
        : { id: 'cleave-child-damage-message', flags: { dnd5e: { originatingMessage: 'cleave-child-message' } } };
      if (native6) {
        expect(damageMessage.system?.targets).toEqual(descriptors(secondary, secondaryToken));
        expect(damageMessage.system?.origin).toBe('cleave-child-message');
      }
      const roll = { total: 4 + rollConfig.rolls[0].data.mod, data: { ...rollConfig.rolls[0].data }, options: { type: 'slashing' }, parent: damageMessage };
      expect(await world.globals.Hooks.call('dnd5e.postDamageRollConfiguration', [roll], rollConfig, {})).not.toBeFalse();
      return [roll];
    };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const prepared = await runtime.prepareUse(activity, { targetActor: primary, targetToken: primaryToken, attackId: 'cleave-parent' });
    await runtime.startUse(prepared!);
    const parentMessage = putMessage(world, activity, 'cleave-parent-message', { attackId: prepared!.attackId });
    if (native6) canonicalAttack(parentMessage, descriptors(primary, primaryToken));
    await linkRollMessage(world, activity, 'cleave-parent-message');
    const result = await runtime.commitUse(prepared!, { messageId: 'cleave-parent-message' });

    expect(result.status).toBe('committed');
    expect(activity.calls.rollAttack).toBe(1);
    expect(secondary.damageCalls).toHaveLength(1);
    expect(secondary.damageCalls[0].damages).toEqual([{ value: 4, type: 'slashing' }]);
    const ledger = attacker.getFlag(MODULE_ID, 'ledger');
    const child = ledger.find((entry: any) => entry.parentAttackId === 'cleave-parent');
    expect(child).toMatchObject({ attackId: `cleave-parent:cleave:${secondary.uuid}`, targetActorUuid: secondary.uuid, step: 'committed' });
    expect(ledger.find((entry: any) => entry.attackId === 'cleave-parent').usedRuleIds).toContain('dnd2024.cleave');
    expect([...world.user.targets]).toEqual([primaryToken]);
    expect(ledger.filter((entry: any) => entry.parentAttackId)).toHaveLength(1);

    world.globals.game.combat.turn = 1;
    world.globals.game.combat.current.turn = 1;
    world.globals.game.dnd5e = { dice: { D20Roll: { DefaultConfigurationDialog: { async configure() { return []; } } } } };
    activity.rollAttack = async (_usage: AnyRecord, dialog: AnyRecord) => dialog.applicationClass.configure({ activity });
    const cancelledParent = await runtime.prepareUse(activity, { targetActor: primary, targetToken: primaryToken, attackId: 'cleave-cancel-parent' });
    await runtime.startUse(cancelledParent!);
    const cancelledParentMessage = putMessage(world, activity, 'cleave-cancel-parent-message', { attackId: cancelledParent!.attackId });
    if (native6) canonicalAttack(cancelledParentMessage, descriptors(primary, primaryToken));
    await linkRollMessage(world, activity, 'cleave-cancel-parent-message');
    const cancelled = await runtime.commitUse(cancelledParent!, { messageId: 'cleave-cancel-parent-message' });
    expect(cancelled.status).toBe('committed');
    const cancelledLedger = attacker.getFlag(MODULE_ID, 'ledger');
    expect(cancelledLedger.find((entry: any) => entry.attackId === 'cleave-cancel-parent').usedRuleIds).toEqual([]);
    expect(cancelledLedger.find((entry: any) => entry.parentAttackId === 'cleave-cancel-parent')).toMatchObject({ step: 'cancelled' });
    expect(secondary.damageCalls).toHaveLength(1);
    runtime.stop();
  });

  test('Midi Cleave keeps an unrolled child pending until its own abort instead of cancelling on wrapper timeout', async () => {
    const world = createWorld();
    const attacker = makeActor('cleave-wait-source');
    const primary = makeActor('cleave-wait-primary');
    const secondary = makeActor('cleave-wait-secondary');
    for (const actor of [attacker, primary, secondary]) registerActor(world, actor);
    const sourceToken = makeToken(world, attacker);
    const primaryToken = makeToken(world, primary);
    const secondaryToken = makeToken(world, secondary);
    Object.assign(sourceToken, { x: 0, y: 0 });
    Object.assign(primaryToken, { x: 100, y: 0 });
    Object.assign(secondaryToken, { x: 100, y: 100 });
    world.globals.canvas = { dimensions: { size: 100 },
      grid: { measurePath: ([a, b]: any[]) => ({ distance: Math.hypot(a.x - b.x, a.y - b.y) / 20 }) },
      tokens: { controlled: [sourceToken], placeables: [sourceToken, primaryToken, secondaryToken] } };
    world.globals.foundry.applications = { api: { DialogV2: { wait: async () => secondaryToken } } };
    let wrapperCalls = 0;
    world.globals.game.modules.get = ((previous: any) => (id: string) => id === 'midi-qol'
      ? { active: true, api: { completeActivityUse: async () => { wrapperCalls++; return undefined; } } }
      : previous(id))(world.globals.game.modules.get);
    const item = makeItem(world, attacker, 'cleave-wait-weapon', masteryConfiguration('cleave'), { mastery: 'cleave' });
    item.system.range.reach = 10;
    const activity = makeActivity(world, item, 'cleave-wait-activity');
    activity.token = sourceToken;
    let childUsage: any;
    activity.use = async (usage: any) => { childUsage = usage; return { message: { id: 'child-card' } }; };
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: primary, targetToken: primaryToken, attackId: 'cleave-wait-parent' });
    await runtime.startUse(prepared!);
    putMessage(world, activity, 'cleave-wait-hit', { attackId: prepared!.attackId });
    await linkRollMessage(world, activity, 'cleave-wait-hit');
    let terminal = false;
    const settlement = runtime.commitUse(prepared!, { messageId: 'cleave-wait-hit' }).then(result => { terminal = true; return result; });
    await waitFor(() => Boolean(childUsage) || terminal, 'child Activity startup');
    expect(wrapperCalls).toBe(0);
    expect(childUsage).toBeDefined();
    expect(terminal).toBeFalse();
    const childId = `cleave-wait-parent:cleave:${secondary.uuid}`;
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === childId).step).toBe('prepared');
    await world.globals.Hooks.callAll(`midi-qol.postCleanup.${activity.uuid}`, { sequenceId: 'unrelated' });
    expect(terminal).toBeFalse();
    await world.globals.Hooks.callAll(`midi-qol.preAbort.${activity.uuid}`, { sequenceId: childUsage.sequenceId, aborted: true });
    expect((await settlement).status).toBe('committed');
    const ledger = attacker.getFlag(MODULE_ID, 'ledger');
    expect(ledger.find((entry: any) => entry.attackId === childId).step).toBe('cancelled');
    expect(ledger.find((entry: any) => entry.attackId === prepared!.attackId).usedRuleIds).toEqual([]);
    expect(world.globals.Hooks.count(`midi-qol.preAbort.${activity.uuid}`)).toBe(0);
    runtime.stop();
  });

  test('player-applied damage is settled by a source-linked Actor update observed on GM', async () => {
    const gmWorld = createWorld();
    const playerWorld = createWorld({ user: 'player' });
    const gmAttacker = makeActor('attacker', 'player', ['longsword']);
    const gmTarget = makeActor('target', 'player');
    const playerAttacker = makeActor('attacker', 'player', ['longsword']);
    const playerTarget = makeActor('target', 'player');
    for (const actor of [gmAttacker, gmTarget]) registerActor(gmWorld, actor);
    for (const actor of [playerAttacker, playerTarget]) registerActor(playerWorld, actor);
    gmWorld.globals.game.users.get = (id: string) => id === 'player' ? gmWorld.player : gmWorld.gm;
    const gmItem = makeItem(gmWorld, gmAttacker, 'proof-sword', masteryConfiguration('vex'), { mastery: 'vex' });
    const playerItem = makeItem(playerWorld, playerAttacker, 'proof-sword', masteryConfiguration('vex'), { mastery: 'vex' });
    const gmActivity = makeActivity(gmWorld, gmItem, 'proof-activity');
    const playerActivity = makeActivity(playerWorld, playerItem, 'proof-activity');
    const gmRuntime = createWeaponMasteryRuntime({ globals: gmWorld.globals });
    const playerRuntime = createWeaponMasteryRuntime({ globals: playerWorld.globals });
    installQueryTransport(playerWorld, gmWorld);
    gmRuntime.start();
    playerRuntime.start();

    const prepared = await playerRuntime.prepareUse(playerActivity, { targetActor: playerTarget, attackId: 'player-proof-attack' });
    await playerRuntime.startUse(prepared!);
    for (const [world, activity] of [[gmWorld, gmActivity], [playerWorld, playerActivity]] as const) {
      makeMessage(world, 'player-proof-attack-message', activity.actor.uuid, activity.uuid, activity.item.uuid,
        { total: 17, isSuccess: true }, prepared!.attackId, 'player');
      await linkRollMessage(world, activity, 'player-proof-attack-message');
    }
    expect((await playerRuntime.commitUse(prepared!, { messageId: 'player-proof-attack-message' })).status).toBe('pending');

    const gmDamage = makeMessage(gmWorld, 'player-proof-damage-message', gmAttacker.uuid, gmActivity.uuid, gmItem.uuid,
      { total: 5 }, 'unrelated-message-flag', 'player');
    const playerDamage = makeMessage(playerWorld, 'player-proof-damage-message', playerAttacker.uuid, playerActivity.uuid, playerItem.uuid,
      { total: 5 }, 'unrelated-message-flag', 'player');
    gmDamage.flags.dnd5e.roll.type = 'damage';
    playerDamage.flags.dnd5e.roll.type = 'damage';
    const changed: AnyRecord = { 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 0 };
    await playerWorld.globals.Hooks.call('dnd5e.preApplyDamage', playerTarget, 5, changed, { originatingMessage: playerDamage });
    expect(changed[`flags.${MODULE_ID}.damageProof`]).toMatchObject({ attackId: prepared!.attackId, targetActorUuid: gmTarget.uuid });
    gmTarget.system.attributes.hp.value = 15;
    await gmWorld.globals.Hooks.callAll('updateActor', gmTarget, changed, {}, 'player');
    await waitFor(() => gmAttacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.attackId === prepared!.attackId && entry.step === 'committed') === true, 'GM proof commit');
    expect(gmAttacker.effects).toHaveLength(1);
    expect(gmAttacker.effects[0].instance).toMatchObject({ effectKind: 'vex', target: { actorUuid: gmTarget.uuid } });
    gmRuntime.stop();
    playerRuntime.stop();
  });

  test.each(['native-type', 'legacy-flag'])('a different target owner links a unique %s usage card without local prepare state', async (representation) => {
    const gmWorld = createWorld();
    const attackerWorld = createWorld({ user: 'player' });
    const targetWorld = createWorld({ user: 'player' });
    targetWorld.user.id = 'target-owner';
    const targetOwner = { id: 'target-owner', isGM: false, active: true };
    gmWorld.globals.game.users.get = (id: string) => id === 'target-owner' ? targetOwner : id === 'player' ? gmWorld.player : gmWorld.gm;
    const gmAttacker = makeActor('attacker', 'player', ['longsword']);
    const gmTarget = makeActor('target', 'target-owner');
    const playerAttacker = makeActor('attacker', 'player', ['longsword']);
    const playerTarget = makeActor('target', 'target-owner');
    const ownerTarget = makeActor('target', 'target-owner');
    for (const actor of [gmAttacker, gmTarget]) registerActor(gmWorld, actor);
    for (const actor of [playerAttacker, playerTarget]) registerActor(attackerWorld, actor);
    registerActor(targetWorld, ownerTarget);
    const gmItem = makeItem(gmWorld, gmAttacker, 'three-client-sword', masteryConfiguration('vex'), { mastery: 'vex' });
    const playerItem = makeItem(attackerWorld, playerAttacker, 'three-client-sword', masteryConfiguration('vex'), { mastery: 'vex' });
    const gmActivity = makeActivity(gmWorld, gmItem, 'three-client-activity');
    const playerActivity = makeActivity(attackerWorld, playerItem, 'three-client-activity');
    const gmRuntime = createWeaponMasteryRuntime({ globals: gmWorld.globals });
    const attackerRuntime = createWeaponMasteryRuntime({ globals: attackerWorld.globals });
    const ownerRuntime = createWeaponMasteryRuntime({ globals: targetWorld.globals });
    installQueryTransport(attackerWorld, gmWorld);
    gmRuntime.start();
    attackerRuntime.start();
    ownerRuntime.start();

    const prepared = await attackerRuntime.prepareUse(playerActivity, { targetActor: playerTarget, attackId: 'three-client-attack' });
    await attackerRuntime.startUse(prepared!);
    const gmUsage = makeMessage(gmWorld, 'three-client-usage-message', gmAttacker.uuid, gmActivity.uuid, gmItem.uuid,
      { total: 0 }, prepared!.attackId, 'player');
    const ownerUsage = makeMessage(targetWorld, 'three-client-usage-message', gmAttacker.uuid, gmActivity.uuid, gmItem.uuid,
      { total: 0 }, prepared!.attackId, 'player');
    for (const message of [gmUsage, ownerUsage]) {
      if (representation === 'native-type') message.type = 'usage';
      else message.flags.dnd5e.messageType = 'usage';
    }
    const gmAttack = makeMessage(gmWorld, 'three-client-attack-message', gmAttacker.uuid, gmActivity.uuid, gmItem.uuid,
      { total: 17, isSuccess: true }, prepared!.attackId, 'player');
    const ownerAttack = makeMessage(targetWorld, 'three-client-attack-message', gmAttacker.uuid, gmActivity.uuid, gmItem.uuid,
      { total: 17, isSuccess: true }, prepared!.attackId, 'player');
    for (const message of [gmAttack, ownerAttack]) {
      message.flags.dnd5e.targets = [{ uuid: gmTarget.uuid, ac: 12 }];
      message.flags.dnd5e.originatingMessage = gmUsage.id;
    }
    await linkRollMessage(gmWorld, gmActivity, 'three-client-attack-message');
    expect((await attackerRuntime.commitUse(prepared!, { messageId: gmAttack.id })).status).toBe('pending');

    const gmDamage = makeMessage(gmWorld, 'three-client-damage-message', gmAttacker.uuid, gmActivity.uuid, gmItem.uuid,
      { total: 5 }, 'unrelated-damage-id', 'player');
    const ownerDamage = makeMessage(targetWorld, 'three-client-damage-message', gmAttacker.uuid, gmActivity.uuid, gmItem.uuid,
      { total: 5 }, 'unrelated-damage-id', 'player');
    gmDamage.flags.dnd5e.roll.type = 'damage';
    ownerDamage.flags.dnd5e.roll.type = 'damage';
    gmDamage.flags.dnd5e.originatingMessage = gmUsage.id;
    ownerDamage.flags.dnd5e.originatingMessage = ownerUsage.id;
    targetWorld.globals.game.messages.values = () => [...new Set(targetWorld.messages.values())].values();
    const changed: AnyRecord = { 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 0 };
    await targetWorld.globals.Hooks.call('dnd5e.preApplyDamage', ownerTarget, 5, changed, { originatingMessage: ownerDamage });
    expect(changed[`flags.${MODULE_ID}.damageProof`]).toMatchObject({ attackId: prepared!.attackId, requesterId: 'player' });
    gmTarget.system.attributes.hp.value = 15;
    await gmWorld.globals.Hooks.callAll('updateActor', gmTarget, changed, {}, 'target-owner');
    await waitFor(() => gmAttacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.attackId === prepared!.attackId && entry.step === 'committed') === true, 'three client proof');
    expect(gmAttacker.effects).toHaveLength(1);
    gmRuntime.stop();
    attackerRuntime.stop();
    ownerRuntime.stop();
  });

  test.each(['vex', 'slow'] as const)('Midi 14.0.11 same-card %s settles once from the actual Actor update', async kind => {
    const world = createWorld();
    const originalGet = world.globals.game.modules.get;
    world.globals.game.modules.get = (id: string) => id === 'midi-qol'
      ? { active: true, version: '14.0.11' } : originalGet(id);
    world.globals.fromUuidSync = (uuid: string) => world.tokens.get(uuid);
    const attacker = makeActor(`midi-${kind}-attacker`, 'player', ['longsword']);
    const target = makeActor(`midi-${kind}-target`);
    registerActor(world, attacker);
    registerActor(world, target);
    const token = makeToken(world, target);
    const item = makeItem(world, attacker, `midi-${kind}-weapon`, masteryConfiguration(kind), { mastery: kind });
    const activity = makeActivity(world, item, `midi-${kind}-activity`);
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const attackId = `midi-${kind}-attack`;
    const cardId = `midi-${kind}-card`;
    const prepared = await runtime.prepareUse(activity, { targetActor: target, targetToken: token, attackId, messageId: cardId });
    await runtime.startUse(prepared!);
    const card = putMessage(world, activity, cardId, { attackId, total: 18, isSuccess: true });
    await linkRollMessage(world, activity, cardId);
    expect((await runtime.commitUse(prepared!, { messageId: cardId })).status).toBe('pending');
    card.flags['midi-qol'] = { type: 4, sourceActorUuid: attacker.uuid, hitTargetUuids: [token.uuid] };
    card.rolls[0].options = { 'midi-qol': { rollType: 'attack' } };
    card.rolls.push({ total: 5, options: { 'midi-qol': { rollType: 'defaultDamage' } }, parent: card });
    const changed: AnyRecord = { 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 0 };
    await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, changed, { origin: card });
    expect(changed[`flags.${MODULE_ID}.damageProof`]).toMatchObject({ attackId, attackMessageId: cardId, damageMessageId: cardId });
    target.system.attributes.hp.value = 15;
    await world.globals.Hooks.callAll('updateActor', target, changed, {}, 'gm');
    await waitFor(() => attacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.attackId === attackId && entry.step === 'committed') === true, `${kind} Midi proof commit`);
    const effectOwner = kind === 'vex' ? attacker : target;
    expect(effectOwner.effects).toHaveLength(1);
    expect(effectOwner.effects[0].instance.effectKind).toBe(kind);
    await world.globals.Hooks.callAll('updateActor', target, changed, {}, 'gm');
    await settleAsync();
    expect(effectOwner.effects).toHaveLength(1);
    runtime.stop();
  });

  test('Midi Vex consumes the first effect and creates a distinct one after the next damaging hit', async () => {
    const world = createWorld();
    const originalGet = world.globals.game.modules.get;
    world.globals.game.modules.get = (id: string) => id === 'midi-qol'
      ? { active: true, version: '14.0.11' } : originalGet(id);
    world.globals.fromUuidSync = (uuid: string) => world.tokens.get(uuid);
    const attacker = makeActor('vex-chain-attacker', 'player', ['longsword']);
    const target = makeActor('vex-chain-target');
    registerActor(world, attacker);
    registerActor(world, target);
    const token = makeToken(world, target);
    const item = makeItem(world, attacker, 'vex-chain-weapon', masteryConfiguration('vex'), { mastery: 'vex' });
    const activity = makeActivity(world, item, 'vex-chain-activity');
    let runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();

    const hit = async (attackId: string, cardId: string, hpAfter: number, expectedAdvantage: boolean,
      damageAmount = 5, critical = false) => {
      const prepared = await runtime.prepareUse(activity, { targetActor: target, targetToken: token, attackId });
      expect(prepared?.modifiers.advantage).toBe(expectedAdvantage);
      await runtime.startUse(prepared!);
      const card = makeMessage(world, cardId, attacker.uuid, activity.uuid, item.uuid,
        { total: 0 }, 'usage-only');
      delete card.flags[MODULE_ID];
      const native = makeMessage(world, `${cardId}-native`, attacker.uuid, activity.uuid, item.uuid,
        { total: critical ? 25 : 18, isSuccess: true, isCritical: critical }, attackId);
      native.flags[MODULE_ID].midiCardId = card.id;
      native.flags.dnd5e.targets = [{ uuid: target.uuid }];
      await linkRollMessage(world, activity, native.id);
      expect((await runtime.commitUse(prepared!, { messageId: native.id })).status).toBe('pending');
      if (attackId === 'vex-chain-second') {
        runtime.stop();
        const resolve = world.globals.foundry.utils.fromUuid;
        world.globals.foundry.utils.fromUuid = async (uuid: string) =>
          uuid.includes('.Activity.') ? undefined : resolve(uuid);
        runtime = createWeaponMasteryRuntime({ globals: world.globals });
        runtime.start();
      }
      const attackRoll = { total: critical ? 25 : 18, formula: expectedAdvantage ? '2d20adv + 3' : '1d20 + 3', options: {
        [PRIVATE_USE_KEY]: attackId, 'midi-qol': { rollType: 'attack' } } };
      const damageRoll = { total: damageAmount, formula: critical ? '2d6 + 3' : '1d6 + 2', options: { rollType: 'damage' } };
      const damageEntry = { actorUuid: target.uuid, targetUuid: token.uuid, isHit: true, wasHit: true,
        oldHP: hpAfter + damageAmount, newHP: hpAfter, oldTempHP: 0, newTempHP: 0, hpDamage: damageAmount, tempDamage: 0,
        calcDamageOptions: { midi: { applyDamage: true, isHit: true, sourceActorUuid: attacker.uuid, targetUuid: token.uuid } } };
      card.flags['midi-qol'] = { type: 0, sourceActorUuid: attacker.uuid, hitTargetUuids: [token.uuid],
        attackRoll, damageRolls: [damageRoll], damageList: [damageEntry] };
      card.rolls = [{ ...attackRoll, parent: card }, { ...damageRoll, parent: card }];
      const changed: AnyRecord = { 'system.attributes.hp.value': hpAfter, 'system.attributes.hp.temp': 0 };
      await world.globals.Hooks.call('dnd5e.preApplyDamage', target, damageAmount, changed, { origin: card });
      expect(changed[`flags.${MODULE_ID}.damageProof`]).toMatchObject({ attackId, attackMessageId: native.id, damageMessageId: card.id });
      if (attackId === 'vex-chain-second') {
        // Foundry 14.364 diffObject recursively omits unchanged fields, including
        // tempHp inside before/after, not just the top-level source UUID.
        target.flags[MODULE_ID] ??= {};
        target.flags[MODULE_ID].damageProof = structuredClone(changed[`flags.${MODULE_ID}.damageProof`]);
        delete changed[`flags.${MODULE_ID}.damageProof`].actorUuid;
        delete changed[`flags.${MODULE_ID}.damageProof`].before.tempHp;
        delete changed[`flags.${MODULE_ID}.damageProof`].after.tempHp;
      }
      target.system.attributes.hp.value = hpAfter;
      if (attackId === 'vex-chain-second') {
        const mismatched = structuredClone(changed);
        mismatched[`flags.${MODULE_ID}.damageProof`].nonce = 'different-nonce';
        await world.globals.Hooks.callAll('updateActor', target, mismatched, {}, 'gm');
        await settleAsync();
        expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === attackId)?.step).toBe('attack');
        const wrongHp = structuredClone(changed);
        wrongHp[`flags.${MODULE_ID}.damageProof`].before.hp += 1;
        await world.globals.Hooks.callAll('updateActor', target, wrongHp, {}, 'gm');
        await settleAsync();
        expect(attacker.getFlag(MODULE_ID, 'ledger')?.find((entry: any) => entry.attackId === attackId)?.step).toBe('attack');
      }
      await world.globals.Hooks.callAll('updateActor', target, changed, {}, 'gm');
      await waitFor(() => attacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.attackId === attackId && entry.step === 'committed') === true, `${attackId} proof commit`);
    };

    await hit('vex-chain-first', 'vex-chain-card-1', 15, false);
    expect(attacker.effects).toHaveLength(1);
    const firstEffectId = attacker.effects[0].id;
    await hit('vex-chain-second', 'vex-chain-card-2', 5, true, 10, true);
    expect(attacker.effects).toHaveLength(1);
    expect(attacker.effects[0].id).not.toBe(firstEffectId);
    expect(attacker.effects[0].instance.effectKind).toBe('vex');
    runtime.stop();
  });

  test('Midi card without exact origin, target, source, or damage roll cannot stamp an HP update', async () => {
    const world = createWorld();
    const originalGet = world.globals.game.modules.get;
    world.globals.game.modules.get = (id: string) => id === 'midi-qol'
      ? { active: true, version: '14.0.11' } : originalGet(id);
    world.globals.fromUuidSync = (uuid: string) => world.tokens.get(uuid);
    const attacker = makeActor('midi-negative-attacker');
    const target = makeActor('midi-negative-target');
    registerActor(world, attacker);
    registerActor(world, target);
    const token = makeToken(world, target);
    const item = makeItem(world, attacker, 'midi-negative-weapon', masteryConfiguration('vex'), { mastery: 'vex' });
    const activity = makeActivity(world, item, 'midi-negative-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, targetToken: token, attackId: 'midi-negative' });
    await runtime.startUse(prepared!);
    const card = putMessage(world, activity, 'midi-negative-card', { attackId: prepared!.attackId });
    await linkRollMessage(world, activity, card.id);
    expect((await runtime.commitUse(prepared!, { messageId: card.id })).status).toBe('pending');
    card.flags['midi-qol'] = { type: 4, sourceActorUuid: attacker.uuid, hitTargetUuids: [token.uuid] };
    card.rolls[0].options = { 'midi-qol': { rollType: 'attack' } };
    const changed = () => ({ 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 0 } as AnyRecord);
    const noDamageRoll = changed();
    await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, noDamageRoll, { origin: card });
    expect(noDamageRoll[`flags.${MODULE_ID}.damageProof`]).toBeUndefined();
    card.rolls.push({ total: 5, options: { 'midi-qol': { rollType: 'defaultDamage' } } });
    for (const [key, value] of [['sourceActorUuid', 'Actor.other'], ['hitTargetUuids', ['Scene.scene.Token.other', token.uuid]]] as const) {
      const original = card.flags['midi-qol'][key];
      card.flags['midi-qol'][key] = value;
      const invalid = changed();
      await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, invalid, { origin: card });
      expect(invalid[`flags.${MODULE_ID}.damageProof`]).toBeUndefined();
      card.flags['midi-qol'][key] = original;
    }
    const noOrigin = changed();
    await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, noOrigin, {});
    expect(noOrigin[`flags.${MODULE_ID}.damageProof`]).toBeUndefined();
    target.system.attributes.hp.value = 15;
    await world.globals.Hooks.callAll('updateActor', target, changed(), {}, 'gm');
    await settleAsync();
    expect(attacker.effects).toHaveLength(0);
    expect(attacker.getFlag(MODULE_ID, 'ledger').find((entry: any) => entry.attackId === 'midi-negative').step).toBe('attack');
    runtime.stop();
  });

  test('GM opt-in damage diagnostics retain only bounded rejected hook fields', async () => {
    const world = createWorld();
    const actor = makeActor('diagnostic-target');
    const debugEntries: any[] = [];
    world.globals.console = { debug: (_message: string, entry: any) => debugEntries.push(entry) };
    world.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ = true;
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    for (let index = 0; index < 21; index += 1) {
      await world.globals.Hooks.call('dnd5e.preApplyDamage', actor, -9,
        { 'system.attributes.hp.value': 11 }, { midi: { sourceActorUuid: 'Actor.source', targetUuid: 'Scene.scene.Token.target' }, secret: 'never-log' });
    }
    const log = world.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__;
    expect(log).toHaveLength(20);
    expect(debugEntries).toHaveLength(21);
    expect(log[0]).toMatchObject({ reason: 'pre-apply-guard', amount: -9, targetActorUuid: actor.uuid,
      midiSourceActorUuid: 'Actor.source', midiTargetUuid: 'Scene.scene.Token.target', beforeHp: 20, afterHp: 11 });
    expect(JSON.stringify(log)).not.toContain('never-log');
    runtime.stop();

    const playerWorld = createWorld({ user: 'player' });
    playerWorld.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ = true;
    const playerRuntime = createWeaponMasteryRuntime({ globals: playerWorld.globals });
    playerRuntime.start();
    await playerWorld.globals.Hooks.call('dnd5e.preApplyDamage', actor, -9, {}, {});
    expect(playerWorld.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__).toBeUndefined();
    playerRuntime.stop();
  });

  test('Midi type-0 item card with a linked native attack settles Slow from the exact applied HP record', async () => {
    const world = createWorld();
    const originalGet = world.globals.game.modules.get;
    world.globals.game.modules.get = (id: string) => id === 'midi-qol'
      ? { active: true, version: '14.0.11' } : originalGet(id);
    world.globals.fromUuidSync = (uuid: string) => world.tokens.get(uuid);
    const attacker = makeActor('midi-item-attacker', 'player', ['longsword']);
    const target = makeActor('midi-item-target');
    registerActor(world, attacker);
    registerActor(world, target);
    const token = makeToken(world, target);
    const item = makeItem(world, attacker, 'midi-item-weapon', masteryConfiguration('slow'), { mastery: 'slow' });
    const activity = makeActivity(world, item, 'midi-item-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const attackId = 'midi-item-attack';
    const card = makeMessage(world, 'midi-item-card', attacker.uuid, activity.uuid, item.uuid,
      { total: 18, isSuccess: true }, 'usage-only');
    delete card.flags[MODULE_ID];
    const prepared = await runtime.prepareUse(activity, { targetActor: target, targetToken: token, attackId });
    await runtime.startUse(prepared!);
    const native = makeMessage(world, 'midi-item-native-attack', attacker.uuid, activity.uuid, item.uuid,
      { total: 18, isSuccess: true }, attackId);
    native.flags[MODULE_ID].midiCardId = card.id;
    native.flags.dnd5e.targets = [{ uuid: target.uuid }];
    await linkRollMessage(world, activity, native.id);
    expect((await runtime.commitUse(prepared!, { messageId: native.id })).status).toBe('pending');
    const attackRoll = { total: 18, formula: '2d20adv + 3', options: {
      [PRIVATE_USE_KEY]: attackId, 'midi-qol': { rollType: 'attack' } } };
    const damageRoll = { total: 5, formula: '1d6 + 2', options: { rollType: 'damage', type: 'lightning' } };
    const damageEntry = { actorUuid: target.uuid, targetUuid: token.uuid, isHit: true, wasHit: true,
      oldHP: 20, newHP: 15, oldTempHP: 0, newTempHP: 0, hpDamage: 5, tempDamage: 0,
      calcDamageOptions: { midi: { applyDamage: true, isHit: true, sourceActorUuid: attacker.uuid, targetUuid: token.uuid } } };
    card.flags['midi-qol'] = { type: 0, sourceActorUuid: attacker.uuid, hitTargetUuids: [token.uuid],
      attackRoll: { ...attackRoll, formula: '1d20adv + 3' }, damageRolls: [damageRoll], damageList: [damageEntry] };
    card.rolls = [{ ...attackRoll, parent: card }, { ...damageRoll, parent: card }];
    const changed = () => ({ 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 0 } as AnyRecord);
    for (const midi of [
      { ...card.flags['midi-qol'], hitTargetUuids: [token.uuid, 'Scene.other.Token.other'] },
      { ...card.flags['midi-qol'], sourceActorUuid: 'Actor.other' },
      { ...card.flags['midi-qol'], damageList: [{ ...damageEntry, oldHP: 19 }] },
    ]) {
      const original = card.flags['midi-qol'];
      card.flags['midi-qol'] = midi;
      const rejected = changed();
      await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, rejected, { origin: card });
      expect(rejected[`flags.${MODULE_ID}.damageProof`]).toBeUndefined();
      card.flags['midi-qol'] = original;
    }
    const applied = changed();
    await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, applied, { origin: card });
    expect(applied[`flags.${MODULE_ID}.damageProof`]).toMatchObject({ attackId, attackMessageId: native.id,
      damageMessageId: card.id, before: { hp: 20, tempHp: 0 }, after: { hp: 15, tempHp: 0 } });
    target.system.attributes.hp.value = 15;
    world.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS__ = true;
    native.flags[MODULE_ID].midiCardId = 'wrong-card';
    await world.globals.Hooks.callAll('updateActor', target, applied, {}, 'gm');
    await waitFor(() => world.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__?.some((entry: any) =>
      entry.reason === 'proof-damage-message-gate') === true, 'linked Midi rejection reason');
    expect(target.effects).toHaveLength(0);
    native.flags[MODULE_ID].midiCardId = card.id;
    await world.globals.Hooks.callAll('updateActor', target, applied, {}, 'gm');
    await waitFor(() => attacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.attackId === attackId && entry.step === 'committed') === true,
      'type-0 Midi Slow proof commit');
    expect(world.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__).toContainEqual(expect.objectContaining({
      reason: 'proof-validated', attackId,
    }));
    expect(world.globals.__FVTT_WMP_DAMAGE_DIAGNOSTICS_LOG__).toContainEqual(expect.objectContaining({
      reason: 'proof-commit-committed', attackId,
    }));
    expect(target.effects).toHaveLength(1);
    expect(target.effects[0].instance.effectKind).toBe('slow');
    const replay = { 'system.attributes.hp.value': 10 } as AnyRecord;
    await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, replay, { origin: card });
    expect(replay[`flags.${MODULE_ID}.damageProof`]).toBeUndefined();
    runtime.stop();
  });

  test('Midi usage card links to a separate native attack message through the recorded card ID', async () => {
    const world = createWorld();
    const originalGet = world.globals.game.modules.get;
    world.globals.game.modules.get = (id: string) => id === 'midi-qol'
      ? { active: true, version: '14.0.11' } : originalGet(id);
    world.globals.fromUuidSync = (uuid: string) => world.tokens.get(uuid);
    const attacker = makeActor('midi-linked-attacker');
    const target = makeActor('midi-linked-target');
    registerActor(world, attacker);
    registerActor(world, target);
    const token = makeToken(world, target);
    const item = makeItem(world, attacker, 'midi-linked-sword', masteryConfiguration('vex'), { mastery: 'vex' });
    const activity = makeActivity(world, item, 'midi-linked-activity');
    const runtime = createWeaponMasteryRuntime({ globals: world.globals });
    runtime.start();
    const prepared = await runtime.prepareUse(activity, { targetActor: target, targetToken: token, attackId: 'midi-linked-attack' });
    await runtime.startUse(prepared!);
    const card = makeMessage(world, 'midi-linked-card', attacker.uuid, activity.uuid, item.uuid, { total: 0 }, 'usage-only');
    card.flags.dnd5e.messageType = 'usage';
    delete card.flags[MODULE_ID];
    await world.globals.Hooks.call('midi-qol.preAttackRoll', {
      activity, chatCard: card, workflowOptions: { __fvttWeaponMasteryUse: prepared!.attackId },
    });
    const messageConfig: AnyRecord = { data: {} };
    await world.globals.Hooks.call('dnd5e.preRollAttack', { subject: activity, rolls: [] }, {}, messageConfig);
    expect(messageConfig.data.flags[MODULE_ID]).toMatchObject({ attackId: prepared!.attackId, midiCardId: card.id });
    const attack = makeMessage(world, 'midi-linked-native-attack', attacker.uuid, activity.uuid, item.uuid,
      { total: 18, isSuccess: true }, prepared!.attackId);
    attack.flags[MODULE_ID] = messageConfig.data.flags[MODULE_ID];
    attack.flags.dnd5e.targets = [{ actorUuid: target.uuid }];
    await linkRollMessage(world, activity, attack.id);
    expect((await runtime.commitUse(prepared!, { messageId: attack.id })).status).toBe('pending');
    card.flags['midi-qol'] = { type: 4, sourceActorUuid: attacker.uuid, hitTargetUuids: [token.uuid] };
    card.rolls = [
      { total: 18, options: { 'midi-qol': { rollType: 'attack' } } },
      { total: 5, options: { 'midi-qol': { rollType: 'defaultDamage' } } },
    ];
    const duplicate = makeMessage(world, 'midi-linked-duplicate', attacker.uuid, activity.uuid, item.uuid,
      { total: 18, isSuccess: true }, 'other-attack');
    duplicate.flags[MODULE_ID].midiCardId = card.id;
    const ambiguous: AnyRecord = { 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 0 };
    await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, ambiguous, { origin: card });
    expect(ambiguous[`flags.${MODULE_ID}.damageProof`]).toBeUndefined();
    world.messages.delete(duplicate.id);
    world.messages.delete(duplicate.uuid);
    const changed: AnyRecord = { 'system.attributes.hp.value': 15, 'system.attributes.hp.temp': 0 };
    await world.globals.Hooks.call('dnd5e.preApplyDamage', target, 5, changed, { origin: card });
    expect(changed[`flags.${MODULE_ID}.damageProof`]).toMatchObject({
      attackId: prepared!.attackId, attackMessageId: attack.id, damageMessageId: card.id,
    });
    target.system.attributes.hp.value = 15;
    await world.globals.Hooks.callAll('updateActor', target, changed, {}, 'gm');
    await waitFor(() => attacker.getFlag(MODULE_ID, 'ledger')?.some((entry: any) => entry.attackId === prepared!.attackId && entry.step === 'committed') === true, 'linked Midi proof commit');
    expect(attacker.effects).toHaveLength(1);
    runtime.stop();
  });
});
