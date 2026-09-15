import { describe, expect, test } from 'bun:test';
import {
  ENCOUNTER_AUTOMATION_FLAG_KEY,
  ENCOUNTER_AUTOMATION_FLAG_SCOPE,
  installEncounterAutomation,
  type EncounterAutomationConfig,
} from '../src/encounterAutomationRuntime';

class HookBus {
  private next = 0;
  private readonly entries = new Map<string, Map<number, (...args: any[]) => unknown>>();
  on(name: string, callback: (...args: any[]) => unknown) { const id = ++this.next; const list = this.entries.get(name) ?? new Map(); list.set(id, callback); this.entries.set(name, list); return id; }
  off(name: string, id: number) { this.entries.get(name)?.delete(id); }
  call(name: string, ...args: any[]) { let result: unknown; for (const callback of this.entries.get(name)?.values() ?? []) { const value = callback(...args); if (value === false) result = false; } return result; }
  count(name: string) { return this.entries.get(name)?.size ?? 0; }
}

class Effect {
  id = `effect-${++effectNumber}`;
  disabled = false;
  statuses = new Set<string>();
  flags: Record<string, any> = {};
  constructor(data: any) {
    const configuredId = data?._id ?? data?.id;
    if (configuredId) this.id = configuredId;
    Object.assign(this, data);
    if (configuredId) this.id = configuredId;
    this.statuses = new Set(data.statuses ?? []);
  }
  getFlag(scope: string, key: string) { return this.flags[scope]?.[key]; }
  async update(data: any) {
    for (const [key, value] of Object.entries(data)) {
      if (key.includes('.')) setPath(this, key, structuredClone(value));
      else if (key === 'flags') this.flags = mergeObjects(this.flags, value as Record<string, any>);
      else Object.assign(this, { [key]: value });
    }
  }
  updateSource(data: any) {
    if (data.flags) this.flags = mergeObjects(this.flags, data.flags);
    Object.assign(this, { ...data, flags: this.flags });
  }
  toObject() {
    return {
      _id: this.id,
      name: (this as any).name,
      img: (this as any).img,
      statuses: [...this.statuses],
      disabled: this.disabled,
      flags: structuredClone(this.flags),
    };
  }
}
let effectNumber = 0;
let testStatusEffects: Record<string, any> = {};

/** Small v14 ActiveEffect double: factory data keeps the configured static _id. */
class NativeActiveEffect {
  static factoryGate?: { onStart: () => void; released: Promise<void> };
  static async fromStatusEffect(statusId: string, options: any = {}) {
    const gate = this.factoryGate;
    if (gate) {
      this.factoryGate = undefined;
      gate.onStart();
      await gate.released;
    }
    const status = testStatusEffects[statusId];
    if (!status) throw new Error(`Invalid status ID "${statusId}" provided to ActiveEffect#fromStatusEffect`);
    const { id, hud: _hud, ...effectData } = structuredClone(status);
    return new Effect({ ...effectData, _id: status._id, statuses: [id, ...(effectData.statuses ?? [])], parent: options.parent });
  }
  static async create(data: any, options: any) {
    expect(options.keepId).toBe(true);
    const parent = options.parent as Actor;
    if (parent.effects.some((effect) => effect.id === data._id)) throw new Error(`ActiveEffect ${data._id} already exists`);
    const created = new Effect(data);
    parent.effects.push(created);
    return created;
  }
}

function mergeObjects(base: Record<string, any>, extra: Record<string, any>): Record<string, any> {
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(extra)) {
    merged[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeObjects(merged[key] ?? {}, value as Record<string, any>)
      : structuredClone(value);
  }
  return merged;
}

class Actor {
  readonly flags: Record<string, any>;
  readonly items: Item[];
  readonly effects: Effect[] = [];
  updates: any[] = [];
  damages: any[] = [];
  saves: number[] = [];
  system: any;
  constructor(readonly key: string, readonly uuid: string, items: Item[], hp = { value: 40, max: 40 }) {
    this.items = items; for (const item of items) item.actor = this;
    (this as any).name = key;
    this.flags = { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { encounter: { version: 1, kind: 'Actor', key, packageId: 'crystal-package', packageHash: 'package-hash' } } };
    (this as any).system = { attributes: { hp, prof: 4, exhaustion: 0 }, resources: { legact: { spent: 0, max: key === 'dragon' ? 3 : 0 } } };
  }
  getRollData() { return {}; }
  async rollSavingThrow() { return [{ total: this.saves.shift() ?? 1 }]; }
  async applyDamage(damages: any[], options: any) { this.damages.push({ damages: structuredClone(damages.map((damage) => ({ ...damage, properties: [] }))), options }); }
  async update(data: any) { this.updates.push(data); for (const [key, value] of Object.entries(data)) setPath(this, key, value); }
  async createEmbeddedDocuments(kind: string, values: any[]) { expect(kind).toBe('ActiveEffect'); const created = values.map((value) => new Effect(value)); this.effects.push(...created); return created; }
  async setFlag(scope: string, key: string, value: any) { this.flags[scope] ??= {}; this.flags[scope][key] = structuredClone(value); }
  async getTokenDocument(data: any) { return { toObject: () => ({ actorId: this.uuid.slice(6), actorLink: true, ...data }) }; }
}
class Item {
  actor!: Actor;
  id: string;
  system: any;
  uses = 0;
  constructor(readonly name: string, id: string, activity: any, uses?: { spent: number; max: number }) { this.id = id; this.system = { activities: [activity], uses }; activity.id ??= 'activity'; activity.item = this; activity.use = async () => { this.uses++; if (uses) uses.spent++; return { message: { id: `use-${this.uses}` } }; }; }
}
function saveActivity(dc = 15, damage = 12) { return { save: { ability: ['con'], dc: { value: dc } }, damage: { parts: [{ formula: String(damage), types: ['piercing'] }], onSave: 'half' } }; }
function config(): EncounterAutomationConfig { return { version: 1, rules: [
  { id: 'salvo', kind: 'save-summon', actorKey: 'dragon', itemName: 'Shard Salvo', parameters: { summonedActorKey: 'crystal', count: 1, placement: 'adjacent-target', outcome: 'always', failedStatus: 'dazed', statusExpiry: 'next-target-turn-end', followupRuleId: 'corruption', followupAtHalfHp: true } },
  { id: 'pulse', kind: 'turn-start-area', actorKey: 'crystal', itemName: 'Moonstone Spikes', parameters: { radiusFeet: 10, excludeSelf: true, aliveOnly: true, followupRuleId: 'corruption' } },
  { id: 'corruption', kind: 'staged-corruption', actorKey: 'crystal', itemName: 'Moonstone Corruption', parameters: { marker: 'moonstone-corruption', label: 'Moonstone Corruption', repeatExhaustion: 1 } },
  { id: 'ward', kind: 'threshold-ward', actorKey: 'dragon', itemName: 'Eclipse Ward', parameters: { threshold: 20, fullReduction: 'half-floor', weakenedReduction: 'proficiency', breakRuleId: 'defiance' } },
  { id: 'defiance', kind: 'ward-break', actorKey: 'dragon', itemName: 'Ruidium Defiance', parameters: { wardRuleId: 'ward', until: 'own-next-turn-start', whenDepleted: 'weakened' } },
], legendaryRecovery: [{ actorKey: 'dragon', max: 3, when: 'own-turn-start' }] }; }

function fixture() {
  const hooks = new HookBus();
  const dragon = new Actor('dragon', 'Actor.dragon1', [new Item('Shard Salvo', 'salvo-item', saveActivity()), new Item('Eclipse Ward', 'ward-item', saveActivity()), new Item('Ruidium Defiance', 'defiance-item', saveActivity(10, 0), { spent: 0, max: 1 })], { value: 20, max: 40 });
  const crystal = new Actor('crystal', 'Actor.crystal1', [new Item('Moonstone Spikes', 'pulse-item', saveActivity()), new Item('Moonstone Corruption', 'corruption-item', saveActivity(14, 0))], { value: 12, max: 12 });
  const target = new Actor('target', 'Actor.target1', [], { value: 50, max: 50 });
  const corpse = new Actor('corpse', 'Actor.corpse1', [], { value: 0, max: 50 });
  const tokens = [token('dragon-token', dragon, 0, 0), token('crystal-token', crystal, 300, 0), token('target-token', target, 400, 0), token('corpse-token', corpse, 500, 0)];
  const combatants: any[] = [
    { id: 'c-dragon', tokenId: 'dragon-token' }, { id: 'c-crystal', tokenId: 'crystal-token' }, { id: 'c-target', tokenId: 'target-token' }, { id: 'c-corpse', tokenId: 'corpse-token' },
  ];
  const combat: any = { id: 'combat-1', round: 1, turn: 0, scene: { id: 'scene-1' }, combatant: combatants[0], combatants, turns: combatants,
    created: [] as any[], async createEmbeddedDocuments(kind: string, values: any[]) { expect(kind).toBe('Combatant'); const entries = values.map((value, index) => ({ id: `summon-combatant-${index + 1}`, ...value })); this.created.push(...entries); return entries; },
    initiatives: [] as any[], async rollInitiative(ids: string[], options: any) { this.initiatives.push({ ids, options }); },
  };
  const scene: any = { id: 'scene-1', created: [] as any[], async createEmbeddedDocuments(kind: string, values: any[]) {
    expect(kind).toBe('Token'); const entries = values.map((value, index) => ({ id: `summon-${index + 1}`, ...value })); this.created.push(...entries); return entries;
  } };
  const notifications: string[] = [];
  testStatusEffects = { dazed: { id: 'dazed', _id: 'dnd5edazed000000', name: 'Dazed', img: 'icons/svg/daze.svg', hud: true } };
  const env: any = { game: { version: '14.364', system: { id: 'dnd5e', version: '5.3.3' }, user: { id: 'gm-1', isGM: true }, users: { activeGM: { id: 'gm-1' } }, combat }, Hooks: hooks, canvas: { scene, grid: { size: 100, distance: 5 }, tokens: { placeables: tokens, get: (id: string) => tokens.find((entry) => entry.id === id) } }, CONFIG: { Dice: { DamageRoll: class { total: number; constructor(formula: string) { this.total = Number(formula); } async evaluate() { return this; } } }, DND5E: { healingTypes: { healing: {}, temphp: {}, maximum: {} } }, statusEffects: testStatusEffects }, foundry: { utils: { getDocumentClass: (name: string) => { expect(name).toBe('ActiveEffect'); return NativeActiveEffect; } } }, ui: { notifications: { info: (message: string) => notifications.push(message) } }, fromUuid: async (uuid: string) => ({ [dragon.uuid]: dragon, [crystal.uuid]: crystal } as any)[uuid], chooseAdjacentPlacement: async ({ candidates }: any) => candidates[0] };
  return { env, hooks, dragon, crystal, target, corpse, tokens, combat, scene, notifications };
}
function token(id: string, actor: Actor, x: number, y: number) { return { id, actor, document: { id, x, y, width: 1, height: 1, elevation: 0, disposition: -1 } }; }
function setPath(target: any, path: string, value: unknown) { const keys = path.split('.'); let node = target; for (const key of keys.slice(0, -1)) node = node[key] ??= {}; node[keys.at(-1)!] = value; }
async function reconcileDaeStatuses(actor: Actor) {
  const status = testStatusEffects.dazed;
  if (actor.effects.some((effect) => effect.id === status._id)) return;
  if (!actor.effects.some((effect) => !effect.disabled && effect.statuses.has('dazed'))) return;
  const effect = await NativeActiveEffect.fromStatusEffect('dazed', { parent: actor });
  effect.updateSource({ flags: { dae: { autoCreated: true } } });
  await NativeActiveEffect.create(effect.toObject(), { parent: actor, keepId: true });
}

describe('fixed encounter automation runtime', () => {
  test('requires the exact runtime, GM, package-owned Actor UUIDs, and does not duplicate a start', async () => {
    const { env, hooks } = fixture();
    const options = { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: 'Actor.dragon1', crystal: 'Actor.crystal1' }, config: config() };
    const first = await installEncounterAutomation(env, options);
    const duplicate = await installEncounterAutomation(env, options);
    expect(duplicate).toBe(first); expect(hooks.count('updateCombat')).toBe(1);
    await expect(installEncounterAutomation({ ...env, game: { ...env.game, version: '14.365' } }, options)).rejects.toThrow('14.364');
    const other = fixture();
    await expect(installEncounterAutomation(other.env, { ...options, bindings: { ...options.bindings, dragon: 'Actor.notpackage' } })).rejects.toThrow('绑定 dragon');
    first.stop(); expect(hooks.count('updateCombat')).toBe(0);
  });

  test('save-summon consumes the native Item once, resolves success or failure, gives an independent HP token, and never pulses immediately', async () => {
    const { env, dragon, target, tokens, scene, combat, crystal, hooks } = fixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: crystal.uuid }, config: config() });
    target.saves.push(18); // success still summons
    const success: any = await handle.executeSaveSummon('salvo', tokens[0], tokens[2]);
    expect(success.save.success).toBe(true); expect(dragon.items[0]!.uses).toBe(1); expect(target.damages[0]!.options.multiplier).toBe(0.5);
    expect(scene.created[0]!.actorLink).toBe(false);
    expect(combat.initiatives[0]!.options.updateTurn).toBe(false); expect(hooks.count('updateCombat')).toBe(1);
    expect(crystal.items[0]!.uses).toBe(0); // no immediate pulse
    target.saves.push(2, 2); // failed salvo, then failed corruption
    const failed: any = await handle.executeSaveSummon('salvo', tokens[0], tokens[2]);
    expect(failed.save.success).toBe(false); expect(dragon.items[0]!.uses).toBe(2); expect(target.effects.some((effect) => effect.statuses.has('dazed'))).toBe(true);
    expect(target.effects.find((effect) => effect.statuses.has('dazed'))?.id).toBe('dnd5edazed000000');
    expect(target.effects.filter((effect) => effect.getFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY)?.corruption).length).toBe(1);
    combat.combatant = combat.combatants[0]; combat.turn = 0; hooks.call('createCombat', combat);
    combat.combatant = combat.combatants[2]; combat.turn = 2; hooks.call('updateCombat', combat); await handle.settle();
    combat.combatant = combat.combatants[3]; combat.turn = 3; hooks.call('updateCombat', combat); await handle.settle();
    expect(target.effects.find((effect) => effect.statuses.has('dazed'))?.disabled).toBe(true);
  });

  test('creates one canonical native status and remains single after repeated failure and DAE reconciliation', async () => {
    const { env, dragon, target, tokens } = fixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: 'Actor.crystal1' }, config: config() });
    target.saves.push(1, 18, 1, 18);
    const first: any = await handle.executeSaveSummon('salvo', tokens[0], tokens[2]);
    expect(first.statusApplied).toBe(true);
    await reconcileDaeStatuses(target);
    const second: any = await handle.executeSaveSummon('salvo', tokens[0], tokens[2]);
    expect(second.statusApplied).toBe(false);
    await reconcileDaeStatuses(target);
    const statuses = target.effects.filter((effect) => effect.statuses.has('dazed'));
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.id).toBe('dnd5edazed000000');
    expect((statuses[0] as any).img).toBe('icons/svg/daze.svg');
    expect(statuses[0]!.getFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY)?.status.expiration).toEqual({ tokenId: 'target-token', round: 1 });
    expect((statuses[0] as any).flags.dae).toBeUndefined();
  });

  test('preserves an active foreign status and a disabled canonical status without creating or overwriting either', async () => {
    const activeFixture = fixture();
    const foreign = new Effect({ name: 'External Dazed', statuses: ['dazed'], flags: { external: { source: 'other-module' } } });
    activeFixture.target.effects.push(foreign);
    const activeHandle = await installEncounterAutomation(activeFixture.env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: activeFixture.dragon.uuid, crystal: activeFixture.crystal.uuid }, config: config() });
    activeFixture.target.saves.push(1, 18);
    const activeResult: any = await activeHandle.executeSaveSummon('salvo', activeFixture.tokens[0], activeFixture.tokens[2]);
    expect(activeResult.statusApplied).toBe(false);
    expect(activeFixture.target.effects).toContain(foreign);
    expect(activeFixture.target.effects.filter((effect) => effect.id === 'dnd5edazed000000')).toHaveLength(0);
    expect(foreign.getFlag('external', 'source')).toBe('other-module');

    const disabledFixture = fixture();
    const disabled = new Effect({ _id: 'dnd5edazed000000', name: 'Dazed', img: 'icons/svg/daze.svg', statuses: ['dazed'], disabled: true, flags: { external: { source: 'manual' } } });
    disabledFixture.target.effects.push(disabled);
    const disabledHandle = await installEncounterAutomation(disabledFixture.env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: disabledFixture.dragon.uuid, crystal: disabledFixture.crystal.uuid }, config: config() });
    disabledFixture.target.saves.push(1, 18);
    const disabledResult: any = await disabledHandle.executeSaveSummon('salvo', disabledFixture.tokens[0], disabledFixture.tokens[2]);
    expect(disabledResult.statusApplied).toBe(false);
    expect(disabledFixture.target.effects.filter((effect) => effect.id === 'dnd5edazed000000')).toHaveLength(1);
    expect(disabled.disabled).toBe(true);
    expect(disabled.getFlag('external', 'source')).toBe('manual');
    expect(disabled.getFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY)).toBeUndefined();
  });

  test('re-enables this package canonical status after expiry and assigns a fresh expiration', async () => {
    const { env, dragon, target, tokens, combat, hooks } = fixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: 'Actor.crystal1' }, config: config() });
    target.saves.push(1, 18);
    const first: any = await handle.executeSaveSummon('salvo', tokens[0], tokens[2]);
    const status = target.effects.find((effect) => effect.id === 'dnd5edazed000000')!;
    expect(first.statusApplied).toBe(true);
    expect(status.disabled).toBe(false);
    expect(status.getFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY)?.status.expiration).toEqual({ tokenId: 'target-token', round: 1 });

    combat.combatant = combat.combatants[0]; combat.turn = 0; hooks.call('createCombat', combat);
    combat.combatant = combat.combatants[2]; combat.turn = 2; hooks.call('updateCombat', combat);
    combat.combatant = combat.combatants[3]; combat.turn = 3; hooks.call('updateCombat', combat); await handle.settle();
    expect(status.disabled).toBe(true);

    target.saves.push(1, 18);
    const second: any = await handle.executeSaveSummon('salvo', tokens[0], tokens[2]);
    expect(second.statusApplied).toBe(true);
    expect(status.disabled).toBe(false);
    expect(status.getFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY)?.status.expiration).toEqual({ tokenId: 'target-token', round: 2 });
    expect(target.effects.filter((effect) => effect.id === 'dnd5edazed000000')).toHaveLength(1);
  });

  test('stopping while the native status factory is pending prevents the effect write', async () => {
    const { env, dragon, target, tokens } = fixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: 'Actor.crystal1' }, config: config() });
    const factoryStarted = deferred<void>(); const releaseFactory = deferred<void>();
    NativeActiveEffect.factoryGate = { onStart: () => factoryStarted.resolve(undefined), released: releaseFactory.promise };
    target.saves.push(1, 18);
    const pending = handle.executeSaveSummon('salvo', tokens[0], tokens[2]);
    await factoryStarted.promise;
    handle.stop(); releaseFactory.resolve(undefined);
    await expect(pending).rejects.toThrow('已停止');
    expect(target.effects).toHaveLength(0);
  });

  test('turn-start area runs only for its own token once per turn, includes a 0 HP target, and stops when its source is at 0 HP', async () => {
    const { env, crystal, target, corpse, tokens, combat } = fixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: 'Actor.dragon1', crystal: crystal.uuid }, config: config() });
    target.saves.push(18); corpse.saves.push(18); // both in-range creatures save; no corruption
    combat.combatant = combat.combatants[1]; combat.turn = 1;
    await handle.executeTurnStartArea('pulse', tokens[1], combat);
    expect(target.damages).toHaveLength(1); expect(corpse.damages).toHaveLength(1); expect(target.effects).toHaveLength(0); expect(corpse.effects).toHaveLength(0);
    combat.round = 2;
    target.saves.push(1, 1); corpse.saves.push(18); // pulse fail and corruption fail on a later turn
    await handle.executeTurnStartArea('pulse', tokens[1], combat);
    expect(target.effects).toHaveLength(1);
    await expect(handle.executeTurnStartArea('pulse', tokens[1], combat)).resolves.toEqual({ skipped: 'already-triggered' });
    combat.combatant = combat.combatants[0]; combat.turn = 0;
    await expect(handle.executeTurnStartArea('pulse', tokens[1]!, combat)).rejects.toThrow('自身回合');
    crystal.system.attributes.hp.value = 0; combat.round = 3; combat.combatant = combat.combatants[1]; combat.turn = 1;
    await expect(handle.executeTurnStartArea('pulse', tokens[1], combat)).resolves.toEqual({ skipped: 'source-at-zero-hp' });
    expect(corpse.damages).toHaveLength(2);
  });

  test('staged corruption uses mutually exclusive marker then exhaustion branches', async () => {
    const { env, crystal, target, tokens } = fixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: 'Actor.dragon1', crystal: crystal.uuid }, config: config() });
    target.saves.push(1, 1);
    const first: any = await handle.executeStagedCorruption('corruption', tokens[2]);
    const second: any = await handle.executeStagedCorruption('corruption', tokens[2]);
    expect(first.outcome).toBe('marked'); expect(second.outcome).toBe('exhaustion'); expect(target.effects).toHaveLength(1); expect(target.system.attributes.exhaustion).toBe(1);
  });

  test('preUseActivity cancels the disposable activity and consumes only the matching embedded native activity', async () => {
    const { env, dragon, crystal, target, tokens, hooks } = fixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: crystal.uuid }, config: config() });
    target.saves.push(18);
    const result = hooks.call('dnd5e.preUseActivity', dragon.items[0]!.system.activities[0], { targets: [tokens[2]] }, {}, {});
    expect(result).toBe(false); await handle.settle();
    expect(dragon.items[0]!.uses).toBe(1);
    const behaviorOperation = { ...dragon.items[0]!.system.activities[0], flags: { fvttJsonGenerator: { behaviorOperation: true } } };
    const utility = { item: dragon.items[0], id: 'gm-utility', flags: {} };
    expect(hooks.call('dnd5e.preUseActivity', behaviorOperation, { targets: [tokens[2]] }, {}, {})).toBeUndefined();
    expect(hooks.call('dnd5e.preUseActivity', utility, { targets: [tokens[2]] }, {}, {})).toBeUndefined();
    await handle.settle(); expect(dragon.items[0]!.uses).toBe(1);
  });

  test('stop during a native save or a pending placement prevents later damage, Token, Combatant, and initiative writes', async () => {
    const saveFixture = fixture();
    const saveHandle = await installEncounterAutomation(saveFixture.env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: saveFixture.dragon.uuid, crystal: saveFixture.crystal.uuid }, config: config() });
    const saveStarted = deferred<void>(); const saveResult = deferred<any>();
    saveFixture.target.rollSavingThrow = async () => { saveStarted.resolve(); return saveResult.promise; };
    const savePending = saveHandle.executeSaveSummon('salvo', saveFixture.tokens[0], saveFixture.tokens[2]);
    await saveStarted.promise; saveHandle.stop(); saveResult.resolve([{ total: 18 }]);
    await expect(savePending).rejects.toThrow('已停止');
    expect(saveFixture.target.damages).toHaveLength(0); expect(saveFixture.scene.created).toHaveLength(0); expect(saveFixture.combat.created).toHaveLength(0); expect(saveFixture.combat.initiatives).toHaveLength(0);

    const placementFixture = fixture();
    const placementHandle = await installEncounterAutomation(placementFixture.env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: placementFixture.dragon.uuid, crystal: placementFixture.crystal.uuid }, config: config() });
    const placementStarted = deferred<void>(); const placement = deferred<any>();
    placementFixture.env.chooseAdjacentPlacement = async ({ candidates }: any) => { placementStarted.resolve(); return placement.promise.then(() => candidates[0]); };
    placementFixture.target.saves.push(18);
    const placementPending = placementHandle.executeSaveSummon('salvo', placementFixture.tokens[0], placementFixture.tokens[2]);
    await placementStarted.promise; placementHandle.stop(); placement.resolve(undefined);
    await expect(placementPending).rejects.toThrow('已停止');
    expect(placementFixture.scene.created).toHaveLength(0); expect(placementFixture.combat.created).toHaveLength(0); expect(placementFixture.combat.initiatives).toHaveLength(0);
  });

  test('next-target-turn-end uses sorted combat.turns rather than combatant creation order', async () => {
    const later = fixture();
    const laterHandle = await installEncounterAutomation(later.env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: later.dragon.uuid, crystal: later.crystal.uuid }, config: config() });
    later.combat.round = 4; later.combat.turns = [later.combat.combatants[0], later.combat.combatants[2], later.combat.combatants[1], later.combat.combatants[3]];
    later.combat.combatant = later.combat.turns[0]; later.combat.turn = 0; later.target.saves.push(1, 1);
    await laterHandle.executeSaveSummon('salvo', later.tokens[0], later.tokens[2]);
    expect(statusExpiry(later.target).round).toBe(4);

    const passed = fixture();
    const passedHandle = await installEncounterAutomation(passed.env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: passed.dragon.uuid, crystal: passed.crystal.uuid }, config: config() });
    passed.combat.round = 4; passed.combat.turns = [passed.combat.combatants[2], passed.combat.combatants[0], passed.combat.combatants[1], passed.combat.combatants[3]];
    passed.combat.combatant = passed.combat.turns[1]; passed.combat.turn = 1; passed.target.saves.push(1, 1);
    await passedHandle.executeSaveSummon('salvo', passed.tokens[0], passed.tokens[2]);
    expect(statusExpiry(passed.target).round).toBe(5);
  });

  test('ward evaluates real DamageSummary arrays: it excludes healing from the threshold, preserves temp/max HP, weakens after native break depletion, and is inert while broken', async () => {
    const { env, dragon, crystal, tokens, hooks, combat, notifications } = fixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: crystal.uuid }, config: config() });
    const twenty: any = damageSummary([{ type: 'fire', value: 20, active: {} }], { amount: 20 }); hooks.call('dnd5e.calculateDamage', dragon, twenty); expect(twenty.amount).toBe(20); expect(twenty[0].value).toBe(20);
    const twentyOne: any = damageSummary([{ type: 'fire', value: 21, active: {} }], { amount: 21 }); hooks.call('dnd5e.calculateDamage', dragon, twentyOne); expect(twentyOne.amount).toBe(10); expect(twentyOne[0].value).toBe(10);
    const mixed: any = damageSummary([
      { type: 'fire', value: 13, active: {} }, { type: 'cold', value: 12, active: {} }, { type: 'healing', value: -20, active: {} },
      { type: 'temphp', value: 7, active: {} }, { type: 'maximum', value: -3, active: {} },
    ], { amount: 2, temp: 7, tempMax: -3 });
    hooks.call('dnd5e.calculateDamage', dragon, mixed);
    expect(mixed[0].value).toBe(13 * 12 / 25); expect(mixed[1].value).toBe(12 * 12 / 25); expect(mixed[2].value).toBe(-20);
    expect(mixed[3].value).toBe(7); expect(mixed[4].value).toBe(-3); expect(mixed.temp).toBe(7); expect(mixed.tempMax).toBe(-3); expect(mixed.amount).toBe(-11);
    expect(mixed[0].active[ENCOUNTER_AUTOMATION_FLAG_SCOPE].ruleId).toBe('ward'); expect(mixed[2].active[ENCOUNTER_AUTOMATION_FLAG_SCOPE]).toBeUndefined();
    dragon.items[2]!.system.uses.spent = 1; hooks.call('dnd5e.postUseActivity', dragon.items[2]!.system.activities[0]); await handle.settle(); expect(handle.getWardState('ward', dragon)).toBe('broken'); expect(notifications.at(-1)).toContain('dragon：Eclipse Ward已碎裂');
    const broken: any = damageSummary([{ type: 'fire', value: 25, active: {} }, { type: 'healing', value: -30, active: {} }], { amount: -5 }); hooks.call('dnd5e.calculateDamage', dragon, broken); expect(broken.amount).toBe(-5); expect(broken[0].value).toBe(25);
    combat.round = 2; combat.turn = 0; combat.combatant = combat.combatants[0]; hooks.call('createCombat', combat); combat.combatant = combat.combatants[1]; combat.turn = 1; hooks.call('updateCombat', combat); await handle.settle();
    combat.combatant = combat.combatants[0]; combat.turn = 0; hooks.call('updateCombat', combat); await handle.settle();
    expect(handle.getWardState('ward', dragon)).toBe('weakened'); expect(notifications.at(-1)).toContain('dragon：Eclipse Ward已削弱'); const weak: any = damageSummary([{ type: 'fire', value: 13, active: {} }, { type: 'cold', value: 12, active: {} }], { amount: 25 }); hooks.call('dnd5e.calculateDamage', dragon, weak); expect(weak.amount).toBe(21); expect(weak[0].value).toBe(13 * 21 / 25); expect(weak[1].value).toBe(12 * 21 / 25);
  });

  test('ward-break writes an unlinked source Token Actor and restores it from that Token Actor native uses only', async () => {
    const { env, dragon, crystal, tokens, hooks, combat } = fixture();
    const synthetic = new Actor('dragon', 'Scene.scene-1.Token.unlinked-dragon.Actor.dragon1', [
      new Item('Shard Salvo', 'synthetic-salvo-item', saveActivity()), new Item('Eclipse Ward', 'synthetic-ward-item', saveActivity()),
      new Item('Ruidium Defiance', 'synthetic-defiance-item', saveActivity(10, 0), { spent: 2, max: 2 }),
    ], { value: 20, max: 40 });
    (synthetic as any).baseActor = dragon;
    const syntheticToken = token('unlinked-dragon-token', synthetic, 900, 0);
    tokens.push(syntheticToken);
    const syntheticCombatant = { id: 'c-unlinked-dragon', tokenId: syntheticToken.id };
    combat.combatants.push(syntheticCombatant);
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: crystal.uuid }, config: config() });
    hooks.call('dnd5e.postUseActivity', synthetic.items[2]!.system.activities[0]); await handle.settle();
    expect(handle.getWardState('ward', synthetic)).toBe('broken');
    expect(dragon.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY]).toBeUndefined();
    expect(dragon.items[2]!.system.uses.spent).toBe(0);
    combat.round = 2; combat.turn = 0; combat.combatant = combat.combatants[0]; hooks.call('createCombat', combat);
    combat.turn = combat.combatants.length - 1; combat.combatant = syntheticCombatant; hooks.call('updateCombat', combat); await handle.settle();
    expect(handle.getWardState('ward', synthetic)).toBe('weakened');
    expect(dragon.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY]).toBeUndefined();
    expect(dragon.items[2]!.system.uses.spent).toBe(0);
  });

  test('ward-break expires at the actual next own turn: this round before the source, next round after or during its turn', async () => {
    const before = fixture();
    const beforeHandle = await installEncounterAutomation(before.env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: before.dragon.uuid, crystal: before.crystal.uuid }, config: config() });
    const enemy = before.combat.combatants[2]!;
    before.combat.turns = [enemy, before.combat.combatants[0], before.combat.combatants[1], before.combat.combatants[3]];
    before.combat.combatant = enemy; before.combat.turn = 0; before.combat.round = 4;
    before.hooks.call('dnd5e.postUseActivity', before.dragon.items[2]!.system.activities[0]); await beforeHandle.settle();
    expect(wardUntil(before.dragon).round).toBe(4); expect(wardUntil(before.dragon).tokenId).toBe('dragon-token');
    before.hooks.call('createCombat', before.combat); before.combat.combatant = before.combat.turns[1]; before.combat.turn = 1; before.hooks.call('updateCombat', before.combat); await beforeHandle.settle();
    expect(beforeHandle.getWardState('ward', before.dragon)).toBe('full');

    const after = fixture();
    const afterHandle = await installEncounterAutomation(after.env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: after.dragon.uuid, crystal: after.crystal.uuid }, config: config() });
    after.combat.turns = [after.combat.combatants[0], after.combat.combatants[2], after.combat.combatants[1], after.combat.combatants[3]];
    after.combat.combatant = after.combat.turns[1]; after.combat.turn = 1; after.combat.round = 4;
    after.hooks.call('dnd5e.postUseActivity', after.dragon.items[2]!.system.activities[0]); await afterHandle.settle();
    expect(wardUntil(after.dragon).round).toBe(5);

    const own = fixture();
    const ownHandle = await installEncounterAutomation(own.env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: own.dragon.uuid, crystal: own.crystal.uuid }, config: config() });
    own.combat.turns = [own.combat.combatants[0], own.combat.combatants[2], own.combat.combatants[1], own.combat.combatants[3]];
    own.combat.combatant = own.combat.turns[0]; own.combat.turn = 0; own.combat.round = 4;
    own.hooks.call('dnd5e.postUseActivity', own.dragon.items[2]!.system.activities[0]); await ownHandle.settle();
    expect(wardUntil(own.dragon).round).toBe(5);
  });

  test('panel lists user-facing ability names and its stop button delegates to the module persistent-stop API', async () => {
    const { env, dragon, crystal } = fixture();
    let dialogOptions: any; let stoppedPackage: string | undefined;
    env.foundry = { applications: { api: { DialogV2: class { constructor(options: any) { dialogOptions = options; } render() { return this; } } } } };
    env.game.modules = new Map([[ENCOUNTER_AUTOMATION_FLAG_SCOPE, { api: { async stopEncounterAutomation(packageId: string) { stoppedPackage = packageId; } } }]]);
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: crystal.uuid }, config: config() });
    handle.showPanel();
    expect(dialogOptions.content).toContain('豁免伤害与召唤'); expect(dialogOptions.content).not.toContain('<li>salvo：'); expect(dialogOptions.content).toContain('守护状态'); expect(dialogOptions.content).toContain('dragon：完整');
    await dialogOptions.buttons.find((button: any) => button.action === 'stop').callback();
    expect(stoppedPackage).toBe('crystal-package');
  });

  test('stop during a pending expired-effect update prevents the next effect and own-turn ward restoration writes', async () => {
    const { env, dragon, crystal, target, hooks, combat } = fixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: crystal.uuid }, config: config() });
    const expires = { tokenId: 'target-token', round: 1 };
    const first = new Effect({ flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { [ENCOUNTER_AUTOMATION_FLAG_KEY]: { packageId: 'crystal-package', packageHash: 'package-hash', status: { expiration: expires } } } } });
    const second = new Effect({ flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { [ENCOUNTER_AUTOMATION_FLAG_KEY]: { packageId: 'crystal-package', packageHash: 'package-hash', status: { expiration: expires } } } } });
    target.effects.push(first, second);
    const updateStarted = deferred<void>(); const releaseUpdate = deferred<void>(); let secondUpdates = 0;
    first.update = async (data: any) => { updateStarted.resolve(); await releaseUpdate.promise; Object.assign(first, data); };
    second.update = async (data: any) => { secondUpdates++; Object.assign(second, data); };
    await dragon.setFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY, {
      packageId: 'crystal-package', packageHash: 'package-hash', wards: { ward: { state: 'broken', until: { tokenId: 'dragon-token', round: 1 } } },
    });
    combat.combatant = combat.combatants[2]; combat.turn = 2; hooks.call('createCombat', combat);
    combat.combatant = combat.combatants[0]; combat.turn = 0; hooks.call('updateCombat', combat);
    await updateStarted.promise; handle.stop(); releaseUpdate.resolve(); await handle.settle();
    expect(first.disabled).toBe(true); expect(second.disabled).toBe(false); expect(secondUpdates).toBe(0);
    expect(wardUntil(dragon)).toEqual({ tokenId: 'dragon-token', round: 1 });
  });

  test('legendary recovery blocks only the bound actor turn-end reset and restores that actor at its own start', async () => {
    const { env, dragon, crystal, hooks, combat } = fixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: crystal.uuid }, config: config() });
    const dragonResult: any = { actor: { 'system.resources.legact.spent': 0 } }; const foreignResult: any = { actor: { 'system.resources.legact.spent': 0 } };
    hooks.call('dnd5e.combatRecovery', { id: 'c-dragon', actor: dragon }, ['turnEnd'], dragonResult); hooks.call('dnd5e.combatRecovery', { id: 'foreign', actor: new Actor('foreign', 'Actor.foreign', []) }, ['turnEnd'], foreignResult);
    expect(dragonResult.actor).toEqual({}); expect(foreignResult.actor['system.resources.legact.spent']).toBe(0);
    combat.round = 1; combat.turn = 1; combat.combatant = combat.combatants[1]; hooks.call('createCombat', combat); combat.turn = 0; combat.combatant = combat.combatants[0]; hooks.call('updateCombat', combat); await handle.settle();
    expect(dragon.updates.some((update) => update['system.resources.legact.spent'] === 0)).toBe(true);
  });
});

function damageSummary(entries: any[], aggregate: { amount: number; temp?: number; tempMax?: number }) {
  return Object.assign(entries, { amount: aggregate.amount, temp: aggregate.temp ?? 0, tempMax: aggregate.tempMax ?? 0 });
}
function wardUntil(actor: Actor) { return actor.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].wards.ward.until; }
function statusExpiry(actor: Actor) { return actor.effects.find((effect) => effect.statuses.has('dazed'))!.getFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY).status.expiration; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
