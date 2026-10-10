import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import nativeConditions from './fixtures/native-conditions-5.3.3.json';
import { configuredConditionFingerprint, type ConfiguredConditionDefinition } from '@fvtt-json-generator/contracts/configured-conditions';
import {
  ENCOUNTER_AUTOMATION_FLAG_KEY,
  ENCOUNTER_AUTOMATION_FLAG_SCOPE,
  installEncounterAutomation,
  installEncounterDamageBridge,
  installPassiveActivityLockGuard,
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
    if (data._id) this.id = data._id;
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
  async createRiderConditions() {
    const parent = (this as any).parent as Actor;
    for (const status of this.statuses) for (const rider of testStatusEffects[status]?.riders ?? []) {
      if (parent.effects.some(effect => effect.id === testStatusEffects[rider]?._id)) continue;
      const document = await NativeActiveEffect.fromStatusEffect(rider, { parent });
      await NativeActiveEffect.create(document.toObject(), { parent, keepId: true });
    }
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
    const created = new Effect({ ...data, parent });
    parent.effects.push(created);
    // dnd5e 5.3.3 createRiderConditions: canonical-ID deduplication and an
    // independent factory-created rider, never a child removed with this effect.
    await created.createRiderConditions();
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

// Foundry 14.368 common/utils/helpers.mjs expandObject recursively expands
// dot keys even inside a flag value, as in the retained configured.frostbite failure.
function expandFlagValue(value: any): any {
  if (Array.isArray(value)) return value.map(expandFlagValue);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [path, entry] of Object.entries(value)) setPath(result, path, expandFlagValue(entry));
  return result;
}

class Actor {
  get id() { return this.uuid.split('.').at(-1)!; }
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
  async deleteEmbeddedDocuments(kind: string, ids: string[]) { expect(kind).toBe('ActiveEffect'); for (const id of ids) { const index = this.effects.findIndex((effect) => effect.id === id); if (index >= 0) this.effects.splice(index, 1); } }
  async setFlag(scope: string, key: string, value: any) { this.flags[scope] ??= {}; this.flags[scope][key] = expandFlagValue(value); }
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
  testStatusEffects.blinded = { id: 'blinded', _id: 'dnd5eblinded0000', name: 'Blinded', img: 'icons/svg/blind.svg', hud: true };
  testStatusEffects.paralyzed = { id: 'paralyzed', _id: 'dnd5eparalyzed000', name: 'Paralyzed', img: 'icons/svg/paralyze.svg', hud: true };
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
function panelHarness(env: any) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const dialogs: any[] = [];
  env.DialogV2 = class {
    element: HTMLElement;
    ready: Promise<void> = Promise.resolve();
    constructor(readonly data: any) {
      this.element = dom.window.document.createElement('dialog');
      this.element.innerHTML = `<form>${data.content}</form>`;
      dom.window.document.body.appendChild(this.element);
      dialogs.push(this);
    }
    async _onRender() {}
    setPosition() {}
    render() { this.ready = this._onRender(); return this; }
  };
  return { dialogs, document: dom.window.document };
}
async function clickPanel(button: HTMLButtonElement) { button.click(); await new Promise((resolve) => setTimeout(resolve, 0)); }

function eyeFixture() {
  const base = fixture();
  const { dragon, env } = base;
  const add = (name: string, id: string, damage: number) => {
    const activity = saveActivity(15, damage);
    if (damage === 0) activity.damage.parts = [];
    const item = new Item(name, id, activity);
    item.actor = dragon; dragon.items.push(item);
    (activity as any).rollDamage = async () => damage ? [{ total: damage, options: { type: 'cold' } }] : [];
    return item;
  };
  const strobe = add('Strobeflash Gaze', 'strobe-item', 0);
  strobe.system.activities[0].target = { template: { type: 'cone' } };
  const glacial = add('Glacial Ray', 'glacial-item', 9);
  const paroxysm = add('Paroxysm Ray', 'paroxysm-item', 0);
  const rend = add('Crushing Rend', 'rend-item', 36);
  const eyes = new Item('Eyestalks', 'eyes-item', {}); eyes.actor = dragon; dragon.items.push(eyes);
  const cc = {
    definitions: () => ['slowed', 'enfeebled', 'clumsy'].map((id) => ({ id })),
    list: (actor: Actor) => actor.effects,
    apply: async (actor: Actor, id: string) => { const effect = new Effect({ name: id, statuses: [`fvtt-custom-conditions.${id}`] }); actor.effects.push(effect); return effect; },
    remove: async (actor: Actor, id: string) => actor.deleteEmbeddedDocuments('ActiveEffect', [id]),
  };
  env.game.modules = { get: (id: string) => id === 'fvtt-custom-conditions' ? { active: true, api: cc } : undefined };
  installEncounterDamageBridge(env);
  const newConfig: EncounterAutomationConfig = { version: 1, legendaryRecovery: [], rules: [
    { id: 'strobe', kind: 'save-failure-effect', actorKey: 'dragon', itemName: strobe.name, parameters: { effect: 'blinded', expiry: 'next-source-turn-start', minFailureMargin: 1, removeOnDamage: false } },
    { id: 'glacial', kind: 'save-failure-effect', actorKey: 'dragon', itemName: glacial.name, parameters: { effect: 'slowed', expiry: 'next-target-turn-end', minFailureMargin: 1, removeOnDamage: false } },
    { id: 'paroxysm', kind: 'save-failure-effect', actorKey: 'dragon', itemName: paroxysm.name, parameters: { effect: 'paralyzed', expiry: 'next-source-turn-end', minFailureMargin: 1, removeOnDamage: true } },
    { id: 'rend', kind: 'save-failure-effect', actorKey: 'dragon', itemName: rend.name, parameters: { effect: 'str-dex-disadvantage', expiry: 'hp-recovery', minFailureMargin: 5, removeOnDamage: false } },
    { id: 'eyes', kind: 'gm-activity-lock', actorKey: 'dragon', itemName: eyes.name, parameters: { activityItemNames: [glacial.name, paroxysm.name] } },
  ] };
  return { ...base, strobe, glacial, paroxysm, rend, eyes, cc, newConfig };
}

test('different packages retain independent native status claims and serialize concurrent applications', async () => {
  const { env, dragon, crystal, target, tokens, hooks, combat, newConfig } = eyeFixture();
  const other = new Item('Other Gaze', 'other-gaze', saveActivity(15, 0)); other.system.activities[0].damage.parts = []; other.actor = crystal; crystal.items.push(other);
  crystal.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE].encounter = { version: 1, kind: 'Actor', key: 'crystal', packageId: 'other-package', packageHash: 'other-hash' };
  const first = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: { ...newConfig, rules: [newConfig.rules[0]!] } });
  const second = await installEncounterAutomation(env, { packageId: 'other-package', packageHash: 'other-hash', bindings: { crystal: crystal.uuid }, config: { version: 1, legendaryRecovery: [], rules: [
    { id: 'other', kind: 'save-failure-effect', actorKey: 'crystal', itemName: other.name, parameters: { effect: 'blinded', expiry: 'next-source-turn-start', minFailureMargin: 1, removeOnDamage: false } },
  ] } });
  target.saves.push(1, 1);
  await Promise.all([first.executeSaveFailureEffect('strobe', tokens[0], tokens[2]), second.executeSaveFailureEffect('other', tokens[1], tokens[2])]);
  expect(target.effects.filter(effect => effect.statuses.has('blinded'))).toHaveLength(1);
  const states = () => target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].packages;
  expect(states().map((state: any) => state.fixedNativeClaims.blinded.length)).toEqual([1, 1]);
  combat.turn = 1; combat.combatant = combat.combatants[1]; hooks.call('updateCombat', combat); await Promise.all([first.settle(), second.settle()]);
  expect(target.effects.filter(effect => effect.statuses.has('blinded'))).toHaveLength(1);
  target.saves.push(1); await second.executeSaveFailureEffect('other', tokens[1], tokens[2]);
  combat.round = 2; combat.turn = 0; combat.combatant = combat.combatants[0]; hooks.call('updateCombat', combat); await Promise.all([first.settle(), second.settle()]);
  expect(target.effects.filter(effect => effect.statuses.has('blinded'))).toHaveLength(1);
  expect(states().find((state: any) => state.packageId === 'crystal-package').fixedNativeClaims.blinded).toHaveLength(0);
  combat.turn = 1; combat.combatant = combat.combatants[1]; hooks.call('updateCombat', combat); await Promise.all([first.settle(), second.settle()]);
  expect(target.effects.some(effect => effect.statuses.has('blinded'))).toBe(false);
  first.stop(); second.stop();
});

test('generic hit lifecycle applies a canonical state, honors immunity, and clears on a native repeat save', async () => {
  const { env, dragon, target, tokens, hooks } = fixture();
  for (const entry of tokens) (entry.document as any).uuid = `Scene.scene.Token.${entry.id}`;
  const attack: any = { id: 'strike-attack', type: 'attack', attack: {}, actor: dragon };
  const strike = new Item('Veil Strike', 'veil-strike', attack); strike.actor = dragon; (strike as any).uuid = `${dragon.uuid}.Item.${strike.id}`;
  attack.uuid = `${(strike as any).uuid}.Activity.${attack.id}`; dragon.items.push(strike);
  const subscribers: Array<(context: any) => unknown> = [];
  env.game.modules = { get: () => ({ active: true, api: { apiVersion: 1, subscribe: (listener: any) => { subscribers.push(listener); return () => {}; } } }) };
  env.game.time = { worldTime: 0 }; env.CONFIG.time = { roundTime: 6 }; env.game.messages = new Map();
  env.game.user.targets = new Set([tokens[2]]); env.game.actors = [dragon, target]; env.DialogV2 = { confirm: async () => true };
  const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: {
    version: 1, legendaryRecovery: [], rules: [{ id: 'veil', kind: 'status-lifecycle', actorKey: 'dragon', itemName: strike.name,
      parameters: { trigger: 'attack-hit', status: 'blinded', duration: { value: 1, unit: 'minute' }, repeatSave: { ability: 'con', dc: 15, timing: 'target-turn-end', optional: true } } }],
  } });
  const hit = () => {
    const messageConfig: any = { data: { flags: {} } };
    hooks.call('dnd5e.preRollAttack', { subject: attack }, {}, messageConfig);
    const message = { id: globalThis.crypto.randomUUID(), author: env.game.user, flags: { ...messageConfig.data.flags, dnd5e: {
      roll: { type: 'attack' }, activity: { uuid: attack.uuid }, item: { uuid: (strike as any).uuid }, targets: [{ uuid: target.uuid, ac: 15 }],
    } } };
    env.game.messages.set(message.id, message);
    hooks.call('dnd5e.postRollAttack', [{ parent: message, total: 20, isCritical: false, isFumble: false }], { subject: attack });
  };
  target.system.traits = { ci: { value: ['blinded'] } }; hit(); await handle.settle(); expect(target.effects).toHaveLength(0);
  target.system.traits.ci.value = []; hit(); await handle.settle();
  expect(target.effects.filter(effect => effect.statuses.has('blinded'))).toHaveLength(1);
  target.saves.push(15);
  subscribers[0]!({ event: { type: 'combatTurnEnd' }, key: 'target-end-1', token: tokens[2], round: 1, turn: 2 });
  await handle.settle(); expect(target.effects.some(effect => effect.statuses.has('blinded'))).toBe(false);
  expect(handle.history.some(entry => entry.type === 'status-lifecycle-repeat-save')).toBe(true);
  handle.stop();
});

function configuredLifecycleFixture() {
  const state = fixture();
  const { env, dragon, target, tokens, hooks } = state;
  const definition: ConfiguredConditionDefinition = { schemaVersion: 1, id: 'configured.frost-mark', name: '霜印 Frost Mark', description: '移动减速与笨拙', aliases: ['Frost Mark', '霜印'],
    components: [{ kind: 'movement-reduction', feet: 10 }, { kind: 'builtin-condition', conditionId: 'clumsy', params: {} }] };
  let catalog = [definition];
  const instances = new Map<string, any>(), applies: any[] = [], subscribers: Array<(context: any) => unknown> = [];
  const api: any = { version: 1, catalog: () => structuredClone(catalog), list: (actor: any) => [...instances.values()].filter(entry => entry.actor === actor),
    async apply(actor: any, ref: any, options: any) {
      expect(ref).toEqual({ id: definition.id, fingerprint: configuredConditionFingerprint(definition) }); applies.push(structuredClone(options));
      if (instances.has(options.instanceId)) return instances.get(options.instanceId).effect;
      const [effect] = await actor.createEmbeddedDocuments('ActiveEffect', [{ name: definition.name, flags: {
        'fvtt-custom-conditions': { configuredRoot: { schemaVersion: 1, instanceId: options.instanceId, definitionId: definition.id } },
      }, statuses: [] }]);
      effect.parent = actor;
      instances.set(options.instanceId, { actor, id: effect.id, instanceId: options.instanceId, definitionId: ref.id, fingerprint: ref.fingerprint, effect });
      return effect;
    },
    async remove(actor: any, instanceId: string) {
      const entry = instances.get(instanceId); if (!entry || entry.actor !== actor) return;
      await actor.deleteEmbeddedDocuments('ActiveEffect', [entry.id]); instances.delete(instanceId);
    },
  };
  env.game.modules = { get: (id: string) => id === 'fvtt-custom-conditions' ? { active: true, api: { configuredConditions: api } }
    : id === 'fvtt-trigger-engine' ? { active: true, api: { apiVersion: 1, subscribe: (listener: any) => { subscribers.push(listener); return () => {}; } } } : undefined };
  env.game.time = { worldTime: 0 }; env.CONFIG.time = { roundTime: 6 }; env.game.messages = new Map();
  env.game.user.targets = new Set([tokens[2]]); env.game.actors = [dragon, target]; env.DialogV2 = { confirm: async () => true };
  for (const entry of tokens) (entry.document as any).uuid = `Scene.scene.Token.${entry.id}`;
  const attacks = ['First Mark', 'Second Mark'].map((name, index) => {
    const attack: any = { id: `attack-${index}`, type: 'attack', attack: {}, actor: dragon };
    const item = new Item(name, `mark-${index}`, attack); item.actor = dragon;
    (item as any).uuid = `${dragon.uuid}.Item.${item.id}`; attack.uuid = `${(item as any).uuid}.Activity.${attack.id}`; dragon.items.push(item);
    return { attack, item };
  });
  const options = { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: {
    version: 1 as const, legendaryRecovery: [], rules: attacks.map(({ item }, index) => ({ id: `mark-${index}`, kind: 'status-lifecycle' as const, actorKey: 'dragon', itemName: item.name,
      parameters: { trigger: 'attack-hit' as const, status: definition.id, definition, duration: { value: 1, unit: 'minute' as const }, repeatSave: { ability: 'con' as const, dc: 13, timing: 'target-turn-end' as const, optional: true } } })),
  } };
  function hit(index: number, total = 20) {
    const { attack, item } = attacks[index]!;
    const config: any = { data: { flags: {} } }; hooks.call('dnd5e.preRollAttack', { subject: attack }, {}, config);
    const message = { id: globalThis.crypto.randomUUID(), author: env.game.user, flags: { ...config.data.flags, dnd5e: {
      roll: { type: 'attack' }, activity: { uuid: attack.uuid }, item: { uuid: (item as any).uuid }, targets: [{ uuid: target.uuid, ac: 15 }],
    } } }; env.game.messages.set(message.id, message);
    hooks.call('dnd5e.postRollAttack', [{ parent: message, total, isCritical: false, isFumble: false }], { subject: attack });
  }
  return { ...state, definition, options, api, applies, subscribers, hit, changeCatalog: (next: ConfiguredConditionDefinition[]) => { catalog = next; } };
}

test('configured conditions reuse confirmed-hit and save/expiry flow while preserving independent source instances', async () => {
  const { env, target, tokens, definition, options, api, applies, subscribers, hit, hooks } = configuredLifecycleFixture();
  await api.apply(target, { id: definition.id, fingerprint: configuredConditionFingerprint(definition) }, { instanceId: 'user-owned-instance' });
  const handle = await installEncounterAutomation(env, options);
  hit(0, 14); await handle.settle(); expect(api.list(target)).toHaveLength(1);
  hit(0); hit(1); await handle.settle(); expect(api.list(target)).toHaveLength(3);
  const firstIds = api.list(target).map((entry: any) => entry.id);
  hit(0); await handle.settle(); expect(api.list(target).map((entry: any) => entry.id)).toEqual(firstIds);
  expect(applies.at(-1).source).toBe('crystal-package/mark-0');
  target.saves.push(13, 1);
  subscribers[0]!({ event: { type: 'combatTurnEnd' }, key: 'target-end-1', token: tokens[2], round: 1, turn: 2 });
  await handle.settle(); expect(api.list(target)).toHaveLength(2);
  expect(api.list(target).some((entry: any) => entry.instanceId === 'user-owned-instance')).toBe(true);
  env.game.time.worldTime = 60; hooks.call('updateWorldTime', 60); await handle.settle();
  expect(api.list(target).map((entry: any) => entry.instanceId)).toEqual(['user-owned-instance']);
  expect(handle.history.filter(entry => entry.type === 'status-lifecycle-repeat-save')).toHaveLength(2);
  handle.stop();
});

test('missing or changed configured definitions block enablement and new hits without effect writes', async () => {
  const { env, target, definition, options, api, changeCatalog, hit } = configuredLifecycleFixture();
  changeCatalog([]); await expect(installEncounterAutomation(env, options)).rejects.toThrow('定义发生变化');
  expect(api.list(target)).toHaveLength(0);
  changeCatalog([definition]); const handle = await installEncounterAutomation(env, options);
  const changed = structuredClone(definition); changed.components[0] = { kind: 'movement-reduction', feet: 5 }; changeCatalog([changed]);
  hit(0); await handle.settle(); expect(api.list(target)).toHaveLength(0); expect(target.updates).toHaveLength(0);
  handle.stop();
});

test.each(['expanded', 'flat'])('configured %s claim keys survive reload and reach the repeat-save handler', async format => {
  const { env, target, options, api, hit, subscribers, tokens } = configuredLifecycleFixture();
  const first = await installEncounterAutomation(env, options); hit(0); await first.settle();
  const owner = target.flags['fvtt-json-forge'].encounterAutomation;
  expect(owner.fixedNativeClaims.configured['frost-mark']).toHaveLength(1);
  if (format === 'flat') owner.fixedNativeClaims = { 'configured.frost-mark': owner.fixedNativeClaims.configured['frost-mark'] };
  const instanceId = api.list(target)[0].instanceId;
  first.stop();
  const resumed = await installEncounterAutomation(env, options, { resumeExisting: true });
  target.saves.push(13);
  subscribers.at(-1)!({ event: { type: 'combatTurnEnd' }, key: 'expanded-key-after-reload', token: tokens[2], round: 2, turn: 2 });
  await resumed.settle();
  expect(api.list(target)).toEqual([]);
  expect(resumed.history).toContainEqual(expect.objectContaining({ type: 'status-lifecycle-repeat-save', detail: expect.objectContaining({ groupId: instanceId, success: true }) }));
  resumed.stop();
});

test('a saved child effect ID does not prevent manual removal of the actual configured root', async () => {
  const { env, target, options, api, hit, hooks } = configuredLifecycleFixture();
  const handle = await installEncounterAutomation(env, options); hit(0); await handle.settle();
  const root = api.list(target)[0];
  target.flags['fvtt-json-forge'].encounterAutomation.fixedNativeClaims.configured['frost-mark'][0].configuredEffectId = 'old-returned-child-id';
  hooks.call('updateActiveEffect', root.effect, { disabled: true });
  await handle.settle();
  expect(target.flags['fvtt-json-forge'].encounterAutomation.fixedNativeClaims.configured['frost-mark']).toEqual([]);
  handle.stop();
});

test('manually removing a configured instance relinquishes only its Forge claim and never recreates it', async () => {
  const { env, target, options, api, hit, hooks } = configuredLifecycleFixture();
  const handle = await installEncounterAutomation(env, options); hit(0); hit(1); await handle.settle();
  const removed = api.list(target)[0]; await target.deleteEmbeddedDocuments('ActiveEffect', [removed.id]);
  hooks.call('deleteActiveEffect', removed.effect); await handle.settle();
  expect(api.list(target)).toHaveLength(1);
  expect(api.list(target)[0].instanceId).not.toBe(removed.instanceId);
  const owner = (target.flags['fvtt-json-forge'].encounterAutomation.packages ?? [target.flags['fvtt-json-forge'].encounterAutomation])[0];
  expect(owner.fixedNativeClaims.configured['frost-mark']).toHaveLength(1);
  handle.stop();
});

test('catalog edits and deletion block new applications but reload preserves snapshot save and expiry', async () => {
  for (const mode of ['edit', 'delete']) {
    const { env, target, tokens, definition, options, api, changeCatalog, hit, subscribers, hooks } = configuredLifecycleFixture();
    const first = await installEncounterAutomation(env, options); hit(0); await first.settle();
    expect(api.list(target)).toHaveLength(1); first.stop();
    const changed = structuredClone(definition); changed.components[0] = { kind: 'movement-reduction', feet: 5 };
    changeCatalog(mode === 'edit' ? [changed] : []);
    const resumed = await installEncounterAutomation(env, options, { resumeExisting: true });
    hit(1); await resumed.settle(); expect(api.list(target)).toHaveLength(1);
    if (mode === 'edit') {
      target.saves.push(13);
      subscribers.at(-1)!({ event: { type: 'combatTurnEnd' }, key: 'after-edit-end', token: tokens[2], round: 1, turn: 2 });
    } else { env.game.time.worldTime = 60; hooks.call('updateWorldTime', 60); }
    await resumed.settle(); expect(api.list(target)).toHaveLength(0); resumed.stop();
  }
});

test('manual configured disable relinquishes the claim while retaining the disabled instance', async () => {
  const { env, target, options, api, hit, hooks } = configuredLifecycleFixture();
  const handle = await installEncounterAutomation(env, options); hit(0); await handle.settle();
  const entry = api.list(target)[0]; entry.effect.disabled = true;
  hooks.call('updateActiveEffect', entry.effect, { disabled: true }); await handle.settle();
  expect(api.list(target)).toHaveLength(1); expect(entry.effect.disabled).toBe(true);
  const owner = (target.flags['fvtt-json-forge'].encounterAutomation.packages ?? [target.flags['fvtt-json-forge'].encounterAutomation])[0];
  expect(owner.fixedNativeClaims.configured['frost-mark']).toHaveLength(0);
  handle.stop();
});

test('every native condition preserves factory-derived statuses, honors immunity and removes only its own source', async () => {
  for (const [index, condition] of nativeConditions.conditions.entries()) {
    const { env, dragon, target, tokens, hooks } = fixture();
    for (const [i, entry] of nativeConditions.conditions.entries()) testStatusEffects[entry.id] = {
      id: entry.id, _id: `native${String(i).padStart(2, '0')}`.padEnd(16, '0'), name: entry.id,
      img: `systems/dnd5e/icons/svg/statuses/${entry.id}.svg`, statuses: entry.statuses, riders: entry.riders };
    for (const entry of tokens) (entry.document as any).uuid = `Scene.scene.Token.${entry.id}`;
    const attack: any = { id: 'attack', type: 'attack', attack: {}, actor: dragon };
    const item = new Item('Condition Strike', 'condition-strike', attack); item.actor = dragon;
    (item as any).uuid = `${dragon.uuid}.Item.${item.id}`; attack.uuid = `${(item as any).uuid}.Activity.${attack.id}`; dragon.items.push(item);
    const subscribers: Array<(context: any) => unknown> = [];
    env.game.modules = { get: () => ({ active: true, api: { apiVersion: 1, subscribe: (listener: any) => { subscribers.push(listener); return () => {}; } } }) };
    env.game.time = { worldTime: 0 }; env.CONFIG.time = { roundTime: 6 }; env.game.messages = new Map();
    env.game.user.targets = new Set([tokens[2]]); env.game.actors = [dragon, target]; env.DialogV2 = { confirm: async () => true };
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: {
      version: 1, legendaryRecovery: [], rules: [{ id: 'condition', kind: 'status-lifecycle', actorKey: 'dragon', itemName: item.name,
        parameters: { trigger: 'attack-hit', status: condition.id as any, duration: { value: 1, unit: 'minute' },
          repeatSave: { ability: 'con', dc: 15, timing: 'target-turn-end', optional: true } } }],
    } });
    const hit = () => {
      const config: any = { data: { flags: {} } };
      hooks.call('dnd5e.preRollAttack', { subject: attack }, {}, config);
      const message = { id: globalThis.crypto.randomUUID(), author: env.game.user, flags: { ...config.data.flags, dnd5e: {
        roll: { type: 'attack' }, activity: { uuid: attack.uuid }, item: { uuid: (item as any).uuid }, targets: [{ uuid: target.uuid, ac: 15 }],
      } } };
      env.game.messages.set(message.id, message);
      hooks.call('dnd5e.postRollAttack', [{ parent: message, total: 20, isCritical: false, isFumble: false }], { subject: attack });
    };
    target.system.traits = { ci: { value: [condition.id] } }; hit(); await handle.settle(); expect(target.effects).toHaveLength(0);
    target.system.traits.ci.value = [];
    const foreign = new Effect({ _id: testStatusEffects[condition.id]._id, name: 'Foreign condition', statuses: [condition.id] });
    const incidental = new Effect({ ...(condition.id !== 'prone' ? { _id: testStatusEffects.prone._id } : {}), name: 'Separate prone source', statuses: ['prone'] });
    target.effects.push(foreign, incidental);
    const before = [foreign.toObject(), incidental.toObject()];
    hit(); await handle.settle();
    const own = target.effects.filter(effect => effect !== foreign && effect !== incidental);
    expect(own).toHaveLength(1);
    expect([...own[0]!.statuses].sort()).toEqual([condition.id, ...condition.statuses].sort());
    expect(target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims[condition.id]).toHaveLength(1);
    target.saves.push(15);
    subscribers[0]!({ event: { type: 'combatTurnEnd' }, key: `end-${condition.id}`, token: tokens[2], round: 1, turn: 2 });
    await handle.settle();
    expect(target.effects).toEqual([foreign, incidental]);
    expect([foreign.toObject(), incidental.toObject()]).toEqual(before);
    expect(target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims[condition.id]).toEqual([]);
    handle.stop();
  }
});

async function proneRiderFixture(withDae = false, statuses = ['prone', 'unconscious']) {
  const { env, dragon, target, tokens, hooks } = fixture();
  for (const [i, entry] of nativeConditions.conditions.entries()) testStatusEffects[entry.id] = {
    id: entry.id, _id: `native${String(i).padStart(2, '0')}`.padEnd(16, '0'), name: entry.id, statuses: entry.statuses, riders: entry.riders };
  for (const entry of tokens) (entry.document as any).uuid = `Scene.scene.Token.${entry.id}`;
  const attacks = statuses.map(status => {
    const attack: any = { id: `${status}-attack`, type: 'attack', attack: {}, actor: dragon };
    const item = new Item(`${status} strike`, `${status}-strike`, attack); item.actor = dragon;
    (item as any).uuid = `${dragon.uuid}.Item.${item.id}`; attack.uuid = `${(item as any).uuid}.Activity.${attack.id}`;
    dragon.items.push(item); return { status, attack, item };
  });
  const subscribers: Array<(context: any) => unknown> = [];
  const trigger = { active: true, api: { apiVersion: 1, subscribe: (listener: any) => { subscribers.push(listener); return () => {}; } } };
  env.game.modules = new Map([['fvtt-trigger-engine', trigger], ...(withDae ? [['dae', { active: true, version: '14.0.12' }]] : [])] as any);
  env.game.time = { worldTime: 0 }; env.CONFIG.time = { roundTime: 6 }; env.game.messages = new Map();
  env.game.user.targets = new Set([tokens[2]]); env.game.actors = [dragon, target]; env.DialogV2 = { confirm: async () => true };
  const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: {
    version: 1, legendaryRecovery: [], rules: attacks.map(({ status, item }) => ({ id: status, kind: 'status-lifecycle' as const,
      actorKey: 'dragon', itemName: item.name, parameters: { trigger: 'attack-hit' as const, status: status as any,
        duration: { value: 1, unit: 'minute' as const }, repeatSave: { ability: 'con' as const, dc: 15, timing: 'target-turn-end' as const, optional: true } } })),
  } });
  const hit = async (status: string) => {
    const { attack, item } = attacks.find(entry => entry.status === status)!;
    const config: any = { data: { flags: {} } }; hooks.call('dnd5e.preRollAttack', { subject: attack }, {}, config);
    const message = { id: globalThis.crypto.randomUUID(), author: env.game.user, flags: { ...config.data.flags, dnd5e: {
      roll: { type: 'attack' }, activity: { uuid: attack.uuid }, item: { uuid: (item as any).uuid }, targets: [{ uuid: target.uuid, ac: 15 }],
    } } }; env.game.messages.set(message.id, message);
    hooks.call('dnd5e.postRollAttack', [{ parent: message, total: 20, isCritical: false, isFumble: false }], { subject: attack });
    await handle.settle();
  };
  const end = async (key: string) => {
    subscribers[0]!({ event: { type: 'combatTurnEnd' }, key, token: tokens[2], round: 1, turn: 2 }); await handle.settle();
  };
  // Calibrated to installed DAE14.0.12: canonical documents are outputs;
  // only their sub-statuses count as input, and only autoCreated outputs expire.
  const reconcile = async () => {
    const expected = new Set<string>();
    for (const effect of target.effects) {
      if (effect.disabled) continue;
      const canonical = Object.values(testStatusEffects).find((entry: any) => entry._id === effect.id) as any;
      for (const status of effect.statuses) if (status !== canonical?.id) expected.add(status);
    }
    const immunities = new Set<string>(target.system.traits?.ci?.value ?? []);
    for (const immune of immunities) expected.delete(immune);
    for (const status of expected) {
      const configured = testStatusEffects[status];
      if (!configured || target.effects.some(effect => effect.id === configured._id)) continue;
      const document = await NativeActiveEffect.fromStatusEffect(status, { parent: target });
      document.updateSource({ flags: { dae: { autoCreated: true, specialDuration: [] } } });
      await NativeActiveEffect.create(document.toObject(), { parent: target, keepId: true });
    }
    for (const effect of [...target.effects]) {
      const canonical = Object.values(testStatusEffects).find((entry: any) => entry._id === effect.id) as any;
      if (canonical && (effect.flags.dae?.autoCreated || immunities.has(canonical.id)) && !expected.has(canonical.id)) await target.deleteEmbeddedDocuments('ActiveEffect', [effect.id]);
    }
  };
  return { env, target, handle, hit, end, reconcile };
}

test('timed prone cannot suppress or remove the independent unconscious prone rider', async () => {
  const { target, handle, hit, end } = await proneRiderFixture();
  await hit('prone'); await hit('unconscious');
  const rider = target.effects.find(effect => effect.id === testStatusEffects.prone._id);
  expect(rider).toBeTruthy();
  expect(rider!.getFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY)).toBeUndefined();
  expect(target.effects.filter(effect => effect.statuses.has('prone'))).toHaveLength(2);
  target.saves.push(15, 1);
  await end('prone-success');
  expect(target.effects.filter(effect => effect.statuses.has('prone'))).toEqual([rider!]);
  expect(target.effects.some(effect => effect.statuses.has('unconscious'))).toBe(true);
  target.saves.push(15);
  await end('unconscious-success');
  expect(target.effects).toEqual([rider!]); handle.stop();
});

test('DAE prone projection becomes an independent native rider only after unconscious really applies', async () => {
  const f = await proneRiderFixture(true);
  await f.hit('prone'); await f.reconcile();
  const rider = f.target.effects.find(effect => effect.id === testStatusEffects.prone._id)!;
  expect(rider.flags.dae.autoCreated).toBe(true);
  const original = rider.toObject();
  await f.hit('unconscious');
  f.target.saves.push(15, 1); await f.end('prone-cleared'); await f.reconcile();
  expect(f.target.effects.filter(effect => effect.statuses.has('prone'))).toEqual([rider]);
  expect(rider.flags.dae.autoCreated).toBe(false);
  expect({ ...rider.toObject(), flags: original.flags }).toEqual(original);
  f.target.saves.push(15); await f.end('unconscious-cleared'); await f.reconcile();
  expect(f.target.effects).toEqual([rider]); f.handle.stop();
});

test('DAE projection without unconscious still disappears when the timed prone source ends', async () => {
  const f = await proneRiderFixture(true, ['prone']);
  await f.hit('prone'); await f.reconcile();
  expect(f.target.effects).toHaveLength(2);
  f.target.saves.push(15); await f.end('prone-only'); await f.reconcile();
  expect(f.target.effects).toHaveLength(0); f.handle.stop();
});

test('a later unconscious hit recreates an independent rider after the original rider was manually removed', async () => {
  const f = await proneRiderFixture(false, ['unconscious']);
  await f.hit('unconscious');
  const primary = f.target.effects.find(effect => effect.statuses.has('unconscious'))!;
  await f.target.deleteEmbeddedDocuments('ActiveEffect', [testStatusEffects.prone._id]);
  await f.hit('unconscious');
  expect(f.target.effects.find(effect => effect.statuses.has('unconscious'))).toBe(primary);
  expect(f.target.effects.some(effect => effect.id === testStatusEffects.prone._id)).toBe(true);
  f.handle.stop();
});

test('unknown DAE versions or foreign provenance remain untouched and roll back only a newly created primary', async () => {
  for (const mode of ['unknown-version', 'foreign-provenance']) {
    const f = await proneRiderFixture(true);
    await f.hit('prone'); await f.reconcile();
    const rider = f.target.effects.find(effect => effect.id === testStatusEffects.prone._id)!;
    if (mode === 'unknown-version') f.env.game.modules.get('dae').version = '14.0.13';
    else rider.flags.foreign = { source: 'external spell' };
    const original = rider.toObject();
    await f.hit('unconscious');
    expect(rider.toObject()).toEqual(original);
    expect(f.target.effects.some(effect => effect.statuses.has('unconscious'))).toBe(false);
    expect(f.target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims.unconscious).toBeUndefined();
    f.handle.stop();
  }
});

test('prone immunity does not remove unconscious or its source when DAE removes the immune rider', async () => {
  const f = await proneRiderFixture(true, ['unconscious']);
  f.target.system.traits = { ci: { value: new Set(['prone']) } };
  await f.hit('unconscious'); await f.reconcile();
  expect(f.target.effects.some(effect => effect.statuses.has('unconscious'))).toBe(true);
  expect(f.target.effects.some(effect => effect.statuses.has('prone'))).toBe(false);
  expect(f.target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims.unconscious).toHaveLength(1);
  await f.hit('unconscious'); await f.reconcile();
  expect(f.target.effects.some(effect => effect.statuses.has('unconscious'))).toBe(true);
  expect(f.target.effects.some(effect => effect.statuses.has('prone'))).toBe(false);
  expect(f.target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims.unconscious).toHaveLength(1);
  f.handle.stop();
});

test('a source affected by another package still exposes and enforces its latest Activity lock', async () => {
  const { env, dragon, tokens, newConfig, glacial } = eyeFixture();
  dragon.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY] = {
    packageId: 'foreign-package', packageHash: 'foreign-hash', fixedNativeClaims: {},
  };
  panelHarness(env);
  const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
  await handle.setActivityDisabled('eyes', tokens[0], glacial.name, true);
  const playerHooks = new HookBus();
  installPassiveActivityLockGuard({ game: { version: '14.364', system: { id: 'dnd5e', version: '5.3.3' }, user: { isGM: false } }, Hooks: playerHooks } as any);
  const activity = glacial.system.activities[0];
  expect(playerHooks.call('dnd5e.preUseActivity', activity)).toBe(false);
  const panel: any = handle.showPanel(); await panel.ready;
  expect(panel.element.querySelector('[data-lock-state]').textContent).toContain(`${glacial.name}：已禁用`);
  await clickPanel(panel.element.querySelector('[data-lock-toggle]'));
  expect(playerHooks.call('dnd5e.preUseActivity', activity)).toBeUndefined();
  expect(panel.element.querySelector('[data-lock-state]').textContent).not.toContain(`${glacial.name}：已禁用`);
  handle.stop();
});

test('a foreign timed canonical status remains separate from Forge and cannot expire its projection', async () => {
  const { env, dragon, target, tokens, newConfig, hooks } = eyeFixture();
  const foreign = new Effect({ _id: testStatusEffects.blinded._id, name: 'Other spell', statuses: ['blinded'], duration: { value: 1, units: 'rounds', expired: false } });
  (foreign as any).parent = target; target.effects.push(foreign);
  const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
  target.saves.push(1); await handle.executeSaveFailureEffect('strobe', tokens[0], tokens[2]);
  const own = target.effects.find(effect => effect !== foreign && effect.statuses.has('blinded'))!;
  expect(own).toBeTruthy(); expect(own.id).not.toBe(foreign.id); expect((own as any).name).toContain('Forge');
  await foreign.update({ 'duration.expired': true }); hooks.call('updateActiveEffect', foreign, { 'duration.expired': true }); await handle.settle();
  expect(own.disabled).toBe(false); expect(target.effects).toContain(foreign);
  await foreign.update({ disabled: true }); hooks.call('updateActiveEffect', foreign, { disabled: true }); await handle.settle();
  expect(own.disabled).toBe(false); expect(target.effects).toContain(foreign);
  handle.stop();
});

function tenRayFixture() {
  const eye = eyeFixture();
  const rays = [eye.glacial, eye.paroxysm];
  for (let index = 3; index <= 10; index++) {
    const ray = new Item(`Eye Ray ${index}`, `eye-ray-${index}`, saveActivity(16, 0));
    ray.actor = eye.dragon;
    eye.dragon.items.push(ray);
    rays.push(ray);
  }
  (eye.newConfig.rules.find((rule) => rule.id === 'eyes')!.parameters as any).activityItemNames = rays.map((ray) => ray.name);
  return { ...eye, rays };
}

describe('closed save failure and GM activity controls', () => {
  test('one native cone use checks every GM-selected target and consumes once', async () => {
    const { env, dragon, target, corpse, tokens, strobe, hooks, newConfig } = eyeFixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.saves.push(14); corpse.saves.push(15);
    expect(hooks.call('dnd5e.preUseActivity', strobe.system.activities[0], { targets: new Set([tokens[2], tokens[3]]) })).toBe(false);
    await handle.settle();
    expect(strobe.uses).toBe(1);
    expect(target.effects.some((effect) => effect.statuses.has('blinded'))).toBe(true);
    expect(corpse.effects.some((effect) => effect.statuses.has('blinded'))).toBe(false);
  });
  test('native save success stays clean; source start and target end use different next-turn anchors', async () => {
    const { env, dragon, target, tokens, combat, hooks, newConfig, strobe, glacial } = eyeFixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.saves.push(15, 14, 14);
    expect((await handle.executeSaveFailureEffect('strobe', tokens[0], tokens[2]) as any).applied).toBe(false);
    expect(target.effects).toHaveLength(0);
    expect((await handle.executeSaveFailureEffect('strobe', tokens[0], tokens[2]) as any).applied).toBe(true);
    expect(strobe.uses).toBe(2);
    expect(target.effects.some((effect) => effect.statuses.has('blinded'))).toBe(true);
    await handle.executeSaveFailureEffect('glacial', tokens[0], tokens[2]);
    expect(glacial.uses).toBe(1);
    expect(target.damages.at(-1)?.options.multiplier).toBe(1);
    expect(target.effects.some((effect) => effect.statuses.has('fvtt-custom-conditions.slowed'))).toBe(true);
    combat.turn = 2; combat.combatant = combat.combatants[2]; hooks.call('updateCombat', combat); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('blinded'))).toBe(true);
    combat.turn = 3; combat.combatant = combat.combatants[3]; hooks.call('updateCombat', combat); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('fvtt-custom-conditions.slowed'))).toBe(false);
    combat.round = 2; combat.turn = 0; combat.combatant = combat.combatants[0]; hooks.call('updateCombat', combat); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('blinded'))).toBe(false);
  });

  test('paralysis ends on actual temp-HP damage, while Rend needs margin five and actual HP recovery', async () => {
    const { env, dragon, target, tokens, hooks, newConfig } = eyeFixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.saves.push(14, 11, 10);
    await handle.executeSaveFailureEffect('paroxysm', tokens[0], tokens[2]);
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(true);
    target.system.attributes.hp.temp = 5;
    const gain = {}, gainUpdates = { 'system.attributes.hp.value': 50, 'system.attributes.hp.temp': 8 };
    hooks.call('dnd5e.preApplyDamage', target, -5, gainUpdates, gain); target.system.attributes.hp.temp = 8;
    hooks.call('updateActor', target, gainUpdates, {}, 'gm-1'); hooks.call('dnd5e.applyDamage', target, -5, gain); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(true);
    const hit = {}, hitUpdates = { 'system.attributes.hp.value': 50, 'system.attributes.hp.temp': 7 };
    hooks.call('dnd5e.preApplyDamage', target, 1, hitUpdates, hit); target.system.attributes.hp.temp = 7;
    hooks.call('updateActor', target, hitUpdates, {}, 'gm-1'); hooks.call('dnd5e.applyDamage', target, 1, hit); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(false);
    expect((await handle.executeSaveFailureEffect('rend', tokens[0], tokens[2]) as any).applied).toBe(false);
    expect((await handle.executeSaveFailureEffect('rend', tokens[0], tokens[2]) as any).applied).toBe(true);
    expect(target.effects.filter((effect) => effect.statuses.has('fvtt-custom-conditions.enfeebled') || effect.statuses.has('fvtt-custom-conditions.clumsy'))).toHaveLength(2);
    const foreign = new Effect({ statuses: ['fvtt-custom-conditions.clumsy'] }); target.effects.push(foreign);
    const heal = {}, healUpdates = { 'system.attributes.hp.value': 51, 'system.attributes.hp.temp': 7 };
    hooks.call('dnd5e.preApplyDamage', target, -1, healUpdates, heal); target.system.attributes.hp.value += 1;
    hooks.call('updateActor', target, healUpdates, {}, 'gm-1'); hooks.call('dnd5e.applyDamage', target, -1, heal); await handle.settle();
    expect(target.effects).toContain(foreign);
    expect(target.effects.filter((effect) => effect.statuses.has('fvtt-custom-conditions.enfeebled') || effect.statuses.has('fvtt-custom-conditions.clumsy'))).toEqual([foreign]);
  });

  for (const unrelatedFirst of [true, false]) test(`committed damage reaches its owning package with unrelated controller ${unrelatedFirst ? 'first' : 'last'}`, async () => {
    const { env, dragon, target, tokens, hooks, newConfig } = eyeFixture();
    const unrelated = new Actor('dragon', 'Actor.unrelated1', [new Item('Foreign Ray', 'foreign-ray', saveActivity(15, 0))]);
    unrelated.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE].encounter.packageId = 'unrelated-package';
    const resolve = env.fromUuid;
    env.fromUuid = async (uuid: string) => uuid === unrelated.uuid ? unrelated : resolve(uuid);
    const startUnrelated = () => installEncounterAutomation(env, {
      packageId: 'unrelated-package', packageHash: 'package-hash', bindings: { dragon: unrelated.uuid },
      config: { version: 1, legendaryRecovery: [], rules: [{
        id: 'foreign-paroxysm', kind: 'save-failure-effect', actorKey: 'dragon', itemName: 'Foreign Ray',
        parameters: { effect: 'paralyzed', expiry: 'next-source-turn-end', minFailureMargin: 1, removeOnDamage: true },
      }] },
    });
    let foreign;
    if (unrelatedFirst) foreign = await startUnrelated();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    if (!unrelatedFirst) foreign = await startUnrelated();
    const options = {};
    const paralyze = async () => {
      target.saves.push(10);
      await handle.executeSaveFailureEffect('paroxysm', tokens[0], tokens[2]);
      expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(true);
    };
    const damage = async () => {
      const updates = { 'system.attributes.hp.value': target.system.attributes.hp.value - 1, 'system.attributes.hp.temp': 0, 'system.attributes.hp.tempmax': 0 };
      hooks.call('dnd5e.preApplyDamage', target, 1, updates, options);
      await target.update(updates);
      hooks.call('updateActor', target, updates, {}, 'gm-1');
      hooks.call('dnd5e.applyDamage', target, 1, options);
      hooks.call('dnd5e.applyDamage', target, 1, options); // Duplicate delivery must not enqueue twice.
      await Promise.all([handle.settle(), foreign!.settle()]);
    };
    await paralyze();
    await damage();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(false);
    expect(handle.history.filter((entry) => entry.type === 'fixed-effect-removed-by-damage')).toHaveLength(1);
    expect(foreign!.history.some((entry) => entry.type === 'fixed-effect-removed-by-damage')).toBe(false);
    await paralyze();
    hooks.call('dnd5e.applyDamage', target, 1, options); // An old observation cannot remove a new claim.
    await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(true);
    hooks.call('dnd5e.preApplyDamage', target, 1, { 'system.attributes.hp.value': 48, 'system.attributes.hp.temp': 0 }, options);
    hooks.call('dnd5e.applyDamage', target, 1, options); // The reused options do not prove a cancelled write.
    await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(true);
    await damage(); // A fresh committed write may legitimately reuse the same options object.
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(false);
    expect(handle.history.filter((entry) => entry.type === 'fixed-effect-removed-by-damage')).toHaveLength(2);
  });

  test('immunity, missing CC and partial CC failure stop safely without changing foreign effects', async () => {
    const { env, dragon, target, tokens, newConfig, cc, rend, glacial, strobe } = eyeFixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.system.traits = { ci: { value: ['blinded'] } };
    target.saves.push(10);
    expect((await handle.executeSaveFailureEffect('strobe', tokens[0], tokens[2]) as any).applied).toBe(false);
    expect(strobe.uses).toBe(1); expect(target.effects).toHaveLength(0);
    expect(target.saves).toHaveLength(0);
    env.game.modules.get = () => undefined;
    await expect(handle.executeSaveFailureEffect('glacial', tokens[0], tokens[2])).rejects.toThrow('Custom Conditions');
    expect(glacial.uses).toBe(0);
    env.game.modules.get = (id: string) => id === 'fvtt-custom-conditions' ? { active: true, api: cc } : undefined;
    const foreign = new Effect({ statuses: ['fvtt-custom-conditions.enfeebled'] }); target.effects.push(foreign);
    const original = cc.apply; let calls = 0;
    cc.apply = async (...args: any[]) => { if (++calls === 2) throw new Error('second condition failed'); return original(...args as [Actor, string]); };
    target.saves.push(10);
    await expect(handle.executeSaveFailureEffect('rend', tokens[0], tokens[2])).rejects.toThrow('second condition failed');
    expect(rend.uses).toBe(1);
    expect(target.effects).toEqual([foreign]);
  });
  test('Glacial and Rend immunity skips only the condition while native save, damage and use proceed', async () => {
    const { env, dragon, target, tokens, newConfig, glacial, rend } = eyeFixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.system.traits = { ci: { value: ['fvtt-custom-conditions.slowed'] } };
    target.saves.push(10);
    expect((await handle.executeSaveFailureEffect('glacial', tokens[0], tokens[2]) as any).applied).toBe(false);
    expect(glacial.uses).toBe(1); expect(target.damages).toHaveLength(1); expect(target.effects).toHaveLength(0);
    target.system.traits.ci.value = ['fvtt-custom-conditions.clumsy']; target.saves.push(10);
    expect((await handle.executeSaveFailureEffect('rend', tokens[0], tokens[2]) as any).applied).toBe(false);
    expect(rend.uses).toBe(1); expect(target.damages).toHaveLength(2); expect(target.effects).toHaveLength(0);
  });

  test('GM panel disables one bound Activity before use and explicit restore reopens it', async () => {
    const { env, dragon, tokens, hooks, newConfig, glacial, paroxysm } = eyeFixture();
    const { dialogs } = panelHarness(env);
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    const panel: any = handle.showPanel(); await panel.ready;
    expect(dialogs[0].data.buttons.map((button: any) => button.action)).toEqual(['stop', 'close']);
    expect(dialogs[0].data.buttons[1].default).toBe(true);
    const toggle = panel.element.querySelector('[data-lock-toggle]') as HTMLButtonElement;
    expect(toggle.type).toBe('button'); expect(toggle.textContent).toBe('禁用');
    await clickPanel(toggle);
    expect(panel.element.querySelector('[data-lock-state]').textContent).toContain('Glacial Ray：已禁用');
    const usage = { targets: new Set([tokens[2]]) };
    expect(hooks.call('dnd5e.preUseActivity', glacial.system.activities[0], usage)).toBe(false);
    await handle.settle();
    expect(glacial.uses).toBe(0); expect(tokens[2]!.actor.saves).toHaveLength(0); expect(tokens[2]!.actor.effects).toHaveLength(0);
    expect(hooks.call('dnd5e.preUseActivity', paroxysm.system.activities[0], { targets: [] })).toBe(false); // unbound target still safely blocked
    expect(toggle.textContent).toBe('明确恢复'); await clickPanel(toggle);
    expect(toggle.textContent).toBe('禁用');
    tokens[2]!.actor.saves.push(15);
    expect(hooks.call('dnd5e.preUseActivity', glacial.system.activities[0], usage)).toBe(false); // intercepted for fixed native resolution
    await handle.settle();
    expect(glacial.uses).toBe(1);
  });
  test('ten distinct bound rays include the tenth in GM controls and passive zero-use guard', async () => {
    const { env, dragon, target, tokens, rays, newConfig, hooks } = tenRayFixture();
    const { dialogs, document } = panelHarness(env);
    const options = { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig };
    const handle = await installEncounterAutomation(env, options);
    const panel: any = handle.showPanel(); await panel.ready;
    expect(dialogs[0].data.buttons).toHaveLength(2);
    const ability = panel.element.querySelector('[data-lock-ability]') as HTMLSelectElement;
    expect(ability.options).toHaveLength(10);
    ability.value = '9'; ability.dispatchEvent(new document.defaultView!.Event('change', { bubbles: true }));
    const toggle = panel.element.querySelector('[data-lock-toggle]') as HTMLButtonElement;
    expect(panel.element.querySelector('[data-lock-state]').textContent).toContain('Eye Ray 10：可用');
    await clickPanel(toggle);
    const playerHooks = new HookBus();
    installPassiveActivityLockGuard({ game: { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' } }, Hooks: playerHooks } as any);
    expect(playerHooks.call('dnd5e.preUseActivity', rays[9]!.system.activities[0])).toBe(false);
    expect(playerHooks.call('dnd5e.preUseActivity', rays[8]!.system.activities[0])).not.toBe(false);
    expect(hooks.call('dnd5e.preUseActivity', rays[9]!.system.activities[0], { targets: new Set([tokens[2]]) })).toBe(false);
    await handle.settle();
    expect(rays.every((ray) => ray.uses === 0)).toBe(true);
    expect(target.saves).toHaveLength(0); expect(target.effects).toHaveLength(0);
    expect(dragon.system.resources.legact.spent).toBe(0);
    expect(panel.element.querySelector('[data-lock-state]').textContent).toContain('Eye Ray 10：已禁用');
    await clickPanel(toggle);
    expect(playerHooks.call('dnd5e.preUseActivity', rays[9]!.system.activities[0])).not.toBe(false);
    expect(hooks.call('dnd5e.preUseActivity', rays[9]!.system.activities[0], { targets: new Set([tokens[2]]) })).not.toBe(false);
  });
  test('the tenth ray lock stays on one unlinked source across stop and reload', async () => {
    const { env, dragon, tokens, newConfig, rays, hooks } = tenRayFixture();
    const makeSynthetic = (suffix: string) => {
      const items = rays.map((ray) => new Item(ray.name, ray.id, saveActivity(16, 0)));
      const actor = new Actor('dragon', `Scene.scene1.Token.${suffix}.Actor.dragon1`, items);
      (actor as any).baseActor = dragon;
      return { actor, ray: items[9]! };
    };
    const first = makeSynthetic('first'), second = makeSynthetic('second');
    const firstToken = token('first', first.actor, 0, 0), secondToken = token('second', second.actor, 100, 0);
    tokens.splice(0, 1, firstToken, secondToken);
    const options = { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig };
    let handle = await installEncounterAutomation(env, options);
    await handle.setActivityDisabled('eyes', firstToken, 'Eye Ray 10', true);
    expect(first.actor.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].disabledActivities.eyes).toEqual([{ itemId: 'eye-ray-10', activityId: 'activity', itemName: 'Eye Ray 10' }]);
    expect(second.actor.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY]).toBeUndefined();
    handle.stop(); handle = await installEncounterAutomation(env, options);
    expect(hooks.call('dnd5e.preUseActivity', first.ray.system.activities[0], { targets: new Set([tokens[3]]) })).toBe(false);
    expect(hooks.call('dnd5e.preUseActivity', second.ray.system.activities[0], { targets: new Set([tokens[3]]) })).not.toBe(false);
    expect(first.ray.uses).toBe(0); expect(second.ray.uses).toBe(0);
    await handle.setActivityDisabled('eyes', firstToken, 'Eye Ray 10', false);
    expect(hooks.call('dnd5e.preUseActivity', first.ray.system.activities[0], { targets: new Set([tokens[3]]) })).not.toBe(false);
    const duplicate = new Item('Eye Ray 10', 'duplicate-ray', saveActivity(16, 0));
    duplicate.actor = first.actor; first.actor.items.push(duplicate);
    await expect(handle.setActivityDisabled('eyes', firstToken, 'Eye Ray 10', true)).rejects.toThrow('缺失或不唯一');
    expect(hooks.call('dnd5e.preUseActivity', first.ray.system.activities[0], { targets: new Set([tokens[3]]) })).toBe(false);
  });
  test('panel source selector binds the tenth ray to the selected same-name Token only', async () => {
    const { env, dragon, tokens, rays, newConfig } = tenRayFixture();
    const synthetic = (id: string) => {
      const actor = new Actor('dragon', `Scene.scene1.Token.${id}.Actor.dragon1`, rays.map((ray) => new Item(ray.name, ray.id, saveActivity(16, 0))));
      (actor as any).baseActor = dragon;
      const placed = token(id, actor, id === 'first' ? 0 : 100, 0);
      (placed as any).name = 'Eye Tyrant';
      return placed;
    };
    const first = synthetic('first'), second = synthetic('second');
    for (let index = 1; index <= 14; index++) {
      const name = `GM Rule ${index}`;
      for (const actor of [dragon, first.actor, second.actor]) {
        const item = new Item(name, `gm-rule-${index}`, {}); item.actor = actor; actor.items.push(item);
      }
      newConfig.rules.push({ id: `gm-rule-${index}`, kind: 'gm-manual', actorKey: 'dragon', itemName: name, parameters: {} });
    }
    tokens.splice(0, 1, first, second);
    const { document } = panelHarness(env);
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    const panel: any = handle.showPanel(); await panel.ready;
    const source = panel.element.querySelector('[data-source]') as HTMLSelectElement;
    const ability = panel.element.querySelector('[data-lock-ability]') as HTMLSelectElement;
    const toggle = panel.element.querySelector('[data-lock-toggle]') as HTMLButtonElement;
    expect(panel.data.buttons).toHaveLength(2);
    const manualRule = panel.element.querySelector('[data-manual-rule]') as HTMLSelectElement;
    const viewRule = panel.element.querySelector('[data-manual-view]') as HTMLButtonElement;
    expect(manualRule.options).toHaveLength(14);
    expect(manualRule.options[13]!.textContent).toBe('GM Rule 14');
    expect((panel.element.querySelector('details') as HTMLDetailsElement).open).toBe(false);
    expect(source.options).toHaveLength(2);
    expect(source.options[0]!.textContent).toContain('Token first');
    expect(source.options[1]!.textContent).toContain('Token second');
    source.value = '1'; source.dispatchEvent(new document.defaultView!.Event('change', { bubbles: true }));
    const firstOption = ability.options[0];
    ability.focus(); expect(ability.options[0]).toBe(firstOption);
    ability.value = '9'; ability.dispatchEvent(new document.defaultView!.Event('change', { bubbles: true }));
    expect(panel.element.querySelector('[data-source-identity]').textContent).toContain('Token second');
    let firstRuleOpened = 0, secondRuleOpened = 0;
    (first.actor.items.find((item) => item.name === 'GM Rule 14') as any).sheet = { render: async () => { firstRuleOpened++; } };
    (second.actor.items.find((item) => item.name === 'GM Rule 14') as any).sheet = { render: async () => { secondRuleOpened++; } };
    manualRule.value = '13'; manualRule.dispatchEvent(new document.defaultView!.Event('change', { bubbles: true }));
    await clickPanel(viewRule);
    expect(secondRuleOpened).toBe(1); expect(firstRuleOpened).toBe(0);
    await clickPanel(toggle);
    expect(second.actor.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].disabledActivities.eyes).toEqual([{ itemId: 'eye-ray-10', activityId: 'activity', itemName: 'Eye Ray 10' }]);
    expect(first.actor.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY]).toBeUndefined();
    expect(dragon.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY]).toBeUndefined();
    source.value = '0'; source.dispatchEvent(new document.defaultView!.Event('change', { bubbles: true }));
    expect(panel.element.querySelector('[data-lock-state]').textContent).toContain('Eye Ray 10：可用');
    expect(manualRule.options).toHaveLength(14);
    expect(manualRule.selectedOptions[0]!.textContent).toBe('GM Rule 14');
    await clickPanel(viewRule);
    expect(firstRuleOpened).toBe(1); expect(secondRuleOpened).toBe(1);
    source.value = '1'; source.dispatchEvent(new document.defaultView!.Event('change', { bubbles: true }));
    expect(panel.element.querySelector('[data-lock-state]').textContent).toContain('Eye Ray 10：已禁用');
  });
  test('panel keeps selection and focus during a pending lock write, then reports errors inline', async () => {
    const { env, dragon, newConfig } = eyeFixture();
    panelHarness(env);
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    const panel: any = handle.showPanel(); await panel.ready;
    const source = panel.element.querySelector('[data-source]') as HTMLSelectElement;
    const ability = panel.element.querySelector('[data-lock-ability]') as HTMLSelectElement;
    const toggle = panel.element.querySelector('[data-lock-toggle]') as HTMLButtonElement;
    const started = deferred<void>(), release = deferred<void>();
    const original = dragon.setFlag.bind(dragon);
    dragon.setFlag = async (...args: any[]) => { started.resolve(); await release.promise; return original(...args as [string, string, any]); };
    toggle.click(); await started.promise;
    expect(source.disabled).toBe(true); expect(ability.disabled).toBe(true); expect(toggle.disabled).toBe(true);
    expect(panel.element.querySelector('[data-lock-state]').textContent).toContain('正在保存');
    release.resolve(); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(source.value).toBe('0'); expect(ability.value).toBe('0'); expect(toggle.disabled).toBe(false);
    expect(panel.element.ownerDocument.activeElement).toBe(toggle);
    expect(panel.element.querySelector('[data-lock-state]').textContent).toContain('Glacial Ray：已禁用');
    dragon.setFlag = async () => { throw new Error('write rejected'); };
    await clickPanel(toggle);
    expect(panel.element.querySelector('[data-lock-error]').textContent).toContain('write rejected');
    expect(toggle.disabled).toBe(false); expect(source.value).toBe('0');
    expect(panel.element.querySelector('[data-lock-state]').textContent).toContain('Glacial Ray：已禁用');
  });
  test('without a scene Token the panel permits only world-Actor rule viewing; active-GM and missing-Item errors stay inline', async () => {
    const { env, dragon, newConfig } = eyeFixture();
    const manual = new Item('Eye Rays', 'manual-eye-rays', {}); manual.actor = dragon; dragon.items.push(manual);
    let opened = 0;
    (manual as any).sheet = { render: async () => { opened++; } };
    newConfig.rules.push({ id: 'manual-eye-rays', kind: 'gm-manual', actorKey: 'dragon', itemName: manual.name, parameters: {} });
    env.canvas.tokens.placeables = []; env.canvas.tokens.get = () => undefined;
    const { document } = panelHarness(env);
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    const panel: any = handle.showPanel(); await panel.ready;
    const source = panel.element.querySelector('[data-source]') as HTMLSelectElement;
    const toggle = panel.element.querySelector('[data-lock-toggle]') as HTMLButtonElement;
    const view = panel.element.querySelector('[data-manual-view]') as HTMLButtonElement;
    expect(source.disabled).toBe(false); expect(toggle.disabled).toBe(true);
    expect(panel.element.querySelector('[data-source-identity]').textContent).toContain('当前场景无来源 Token');
    expect(panel.element.querySelector('[data-manual-rule]').textContent).toBe('Eye Rays');
    await clickPanel(view); expect(opened).toBe(1);
    env.game.users.activeGM = { id: 'other-gm' };
    view.dispatchEvent(new document.defaultView!.Event('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(panel.element.querySelector('[data-manual-error]').textContent).toContain('当前活动 GM');
    expect(opened).toBe(1);
    env.game.users.activeGM = { id: 'gm-1' };
    dragon.items.splice(dragon.items.indexOf(manual), 1);
    await clickPanel(view);
    expect(panel.element.querySelector('[data-manual-error]').textContent).toContain('缺失或无法打开');
    expect(opened).toBe(1); expect(manual.uses).toBe(0);
  });
  test('manual-only world-Actor sources share one selector and filter rules by actorKey', async () => {
    const { env, dragon, crystal } = fixture();
    env.canvas.tokens.placeables = []; env.canvas.tokens.get = () => undefined;
    let dragonOpened = 0, crystalOpened = 0;
    (dragon.items[0] as any).sheet = { render: async () => { dragonOpened++; } };
    (crystal.items[0] as any).sheet = { render: async () => { crystalOpened++; } };
    const manualConfig: EncounterAutomationConfig = { version: 1, legendaryRecovery: [], rules: [
      { id: 'dragon-guide', kind: 'gm-manual', actorKey: 'dragon', itemName: 'Shard Salvo', parameters: {} },
      { id: 'crystal-guide', kind: 'gm-manual', actorKey: 'crystal', itemName: 'Moonstone Spikes', parameters: {} },
    ] };
    const { document } = panelHarness(env);
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: crystal.uuid }, config: manualConfig });
    const panel: any = handle.showPanel(); await panel.ready;
    const source = panel.element.querySelector('[data-source]') as HTMLSelectElement;
    const manual = panel.element.querySelector('[data-manual-rule]') as HTMLSelectElement;
    const view = panel.element.querySelector('[data-manual-view]') as HTMLButtonElement;
    expect(panel.element.querySelector('[data-lock-section]')).toBeNull();
    expect(source.options).toHaveLength(2);
    expect(manual.options).toHaveLength(1); expect(manual.options[0]!.textContent).toBe('Shard Salvo');
    source.value = '1'; source.dispatchEvent(new document.defaultView!.Event('change', { bubbles: true }));
    expect(panel.element.querySelector('[data-source-identity]').textContent).toContain('crystal');
    expect(manual.options).toHaveLength(1); expect(manual.options[0]!.textContent).toBe('Moonstone Spikes');
    await clickPanel(view); expect(crystalOpened).toBe(1); expect(dragonOpened).toBe(0);
    source.value = '0'; source.dispatchEvent(new document.defaultView!.Event('change', { bubbles: true }));
    expect(manual.options).toHaveLength(1); expect(manual.options[0]!.textContent).toBe('Shard Salvo');
    await clickPanel(view); expect(dragonOpened).toBe(1); expect(crystalOpened).toBe(1);
  });
  test('GM manual rule opens only its unique native Item sheet and never auto-executes', async () => {
    const { env, dragon, target, hooks, newConfig } = eyeFixture();
    const manual = new Item('Eye Rays', 'eye-rays-manual', {});
    manual.actor = dragon; dragon.items.push(manual);
    let opened = 0;
    (manual as any).sheet = { render: async (options: any) => { expect(options).toEqual({ force: true }); opened++; } };
    newConfig.rules.push({ id: 'manual-eye-rays', kind: 'gm-manual', actorKey: 'dragon', itemName: manual.name, parameters: {} });
    const { dialogs } = panelHarness(env);
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    const panel: any = handle.showPanel(); await panel.ready;
    expect(dialogs[0].data.content).toContain('GM 裁定');
    expect(dialogs[0].data.content).toContain('不会自动执行');
    const inspect = panel.element.querySelector('[data-manual-view]') as HTMLButtonElement;
    expect(inspect.type).toBe('button'); await clickPanel(inspect);
    expect(opened).toBe(1);
    expect(hooks.call('dnd5e.preUseActivity', manual.system.activities[0], { targets: [] })).not.toBe(false);
    await handle.settle();
    expect(manual.uses).toBe(0); expect(dragon.updates).toHaveLength(0);
    expect(target.damages).toHaveLength(0); expect(target.effects).toHaveLength(0);
  });
  test('lock list and GM manual rule reject unbound, duplicate, missing, or unauthorized data', async () => {
    const { env, dragon, newConfig, rays } = tenRayFixture();
    const options = { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig };
    const lock = newConfig.rules.find((rule) => rule.id === 'eyes')!;
    const names = rays.map((ray) => ray.name);
    for (const invalid of [[], [names[0], names[0]], Array.from({ length: 21 }, (_, index) => `Distinct Ray ${index + 1}`)]) {
      (lock.parameters as any).activityItemNames = invalid;
      await expect(installEncounterAutomation(env, options)).rejects.toThrow('1 至 20 个不同');
    }
    (lock.parameters as any).activityItemNames = [...names.slice(0, 9), 'Missing Ray'];
    await expect(installEncounterAutomation(env, options)).rejects.toThrow('唯一原生物品');
    (lock.parameters as any).activityItemNames = [names[0]];
    const single = await installEncounterAutomation(env, options); single.stop();
    (lock.parameters as any).activityItemNames = names;
    const manual = new Item('Magic Resistance', 'manual-magic', {});
    manual.actor = dragon; dragon.items.push(manual);
    const rule: any = { id: 'manual', kind: 'gm-manual', actorKey: 'dragon', itemName: manual.name, parameters: {} };
    newConfig.rules.push(rule);
    const handle = await installEncounterAutomation(env, options); handle.stop();
    rule.parameters = { script: 'never' };
    await expect(installEncounterAutomation(env, options)).rejects.toThrow('未授权字段');
    rule.parameters = {};
    const duplicate = new Item(manual.name, 'manual-duplicate', {});
    duplicate.actor = dragon; dragon.items.push(duplicate);
    await expect(installEncounterAutomation(env, options)).rejects.toThrow('唯一原生物品');
  });
  test('two unlinked Tokens keep independent GM locks through controller reload', async () => {
    const { env, dragon, target, tokens, hooks, newConfig } = eyeFixture();
    const makeSynthetic = (suffix: string) => {
      const ray = new Item('Glacial Ray', 'glacial-item', saveActivity(15, 9));
      const other = new Item('Paroxysm Ray', 'paroxysm-item', saveActivity(15, 0));
      const actor = new Actor('dragon', `Scene.scene1.Token.${suffix}.Actor.dragon1`, [ray, other], { value: 20, max: 40 });
      (actor as any).baseActor = dragon;
      (ray.system.activities[0] as any).rollDamage = async () => [{ total: 9, options: { type: 'cold' } }];
      return { actor, ray };
    };
    const first = makeSynthetic('eye1'), second = makeSynthetic('eye2');
    const firstToken = token('eye1', first.actor, 0, 0), secondToken = token('eye2', second.actor, 100, 0);
    tokens.splice(0, 1, firstToken, secondToken);
    const options = { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig };
    let handle = await installEncounterAutomation(env, options);
    await handle.setActivityDisabled('eyes', firstToken, 'Glacial Ray', true);
    expect(first.actor.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].disabledActivities.eyes).toEqual([{ itemId: 'glacial-item', activityId: 'activity', itemName: 'Glacial Ray' }]);
    expect(second.actor.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY]).toBeUndefined();
    handle.stop(); handle = await installEncounterAutomation(env, options);
    target.saves.push(15);
    expect(hooks.call('dnd5e.preUseActivity', first.ray.system.activities[0], { targets: new Set([tokens[3]]) })).toBe(false);
    expect(hooks.call('dnd5e.preUseActivity', second.ray.system.activities[0], { targets: new Set([tokens[3]]) })).toBe(false);
    await handle.settle();
    expect(first.ray.uses).toBe(0); expect(second.ray.uses).toBe(1);
  });
  test('two native status sources retain separate turn anchors and preserve a foreign status', async () => {
    const { env, dragon, target, tokens, hooks, combat, newConfig } = eyeFixture();
    const secondToken = token('second-eye', dragon, 100, 0);
    tokens.push(secondToken);
    combat.combatants.splice(1, 0, { id: 'c-second-eye', tokenId: 'second-eye' });
    combat.turns = combat.combatants;
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.saves.push(14, 14);
    await handle.executeSaveFailureEffect('strobe', tokens[0], tokens[2]);
    await handle.executeSaveFailureEffect('strobe', secondToken, tokens[2]);
    expect(target.effects.filter((effect) => effect.statuses.has('blinded'))).toHaveLength(1);
    expect(target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims.blinded).toHaveLength(2);
    combat.turn = 1; combat.combatant = combat.combatants[1]; hooks.call('updateCombat', combat); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('blinded'))).toBe(true);
    expect(target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims.blinded).toHaveLength(1);
    combat.turn = 3; combat.combatant = combat.combatants[3]; hooks.call('updateCombat', combat); await handle.settle();
    combat.round = 2; combat.turn = 0; combat.combatant = combat.combatants[0]; hooks.call('updateCombat', combat); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('blinded'))).toBe(false);
    const foreign = new Effect({ statuses: ['blinded'] }); (foreign as any).parent = target; target.effects.push(foreign);
    target.saves.push(14);
    await handle.executeSaveFailureEffect('strobe', tokens[0], tokens[2]);
    expect(target.effects).toContain(foreign);
    await target.deleteEmbeddedDocuments('ActiveEffect', [foreign.id]); hooks.call('deleteActiveEffect', foreign); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('blinded'))).toBe(true);
    expect(target.effects).not.toContain(foreign);
  });

  test('queued healing removes only groups present at the healing event', async () => {
    const { env, dragon, target, tokens, hooks, combat, newConfig } = eyeFixture();
    newConfig.legendaryRecovery = [{ actorKey: 'dragon', max: 3, when: 'own-turn-start' }];
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.saves.push(10, 10);
    await handle.executeSaveFailureEffect('rend', tokens[0], tokens[2]);
    combat.turn = 2; combat.combatant = combat.combatants[2]; hooks.call('updateCombat', combat); await handle.settle();
    const started = deferred<void>(), release = deferred<void>();
    dragon.update = async (changes: any) => { started.resolve(); await release.promise; dragon.updates.push(changes); };
    combat.round = 2; combat.turn = 0; combat.combatant = combat.combatants[0]; hooks.call('updateCombat', combat);
    await started.promise;
    target.system.attributes.hp.temp = 0;
    const heal = {}, healUpdates = { 'system.attributes.hp.value': target.system.attributes.hp.value + 1, 'system.attributes.hp.temp': 0 };
    hooks.call('dnd5e.preApplyDamage', target, -1, healUpdates, heal); target.system.attributes.hp.value += 1;
    hooks.call('updateActor', target, healUpdates, {}, 'gm-1'); hooks.call('dnd5e.applyDamage', target, -1, heal);
    await handle.executeSaveFailureEffect('rend', tokens[0], tokens[2]);
    release.resolve(); await handle.settle();
    expect(target.effects.filter((effect) => effect.statuses.has('fvtt-custom-conditions.enfeebled'))).toHaveLength(1);
    expect(target.effects.filter((effect) => effect.statuses.has('fvtt-custom-conditions.clumsy'))).toHaveLength(1);
  });
  test('player-side passive guard blocks an exact disabled Activity before any use', async () => {
    const { env, dragon, tokens, glacial, newConfig } = eyeFixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    await handle.setActivityDisabled('eyes', tokens[0], 'Glacial Ray', true);
    const playerHooks = new HookBus();
    installPassiveActivityLockGuard({ game: { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' } }, Hooks: playerHooks } as any);
    expect(playerHooks.call('dnd5e.preUseActivity', glacial.system.activities[0])).toBe(false);
    expect(glacial.uses).toBe(0);
    await handle.setActivityDisabled('eyes', tokens[0], 'Glacial Ray', false);
    expect(playerHooks.call('dnd5e.preUseActivity', glacial.system.activities[0])).not.toBe(false);
  });
  test('player damage fact is matched to a real Actor update; zero HP damage counts and forged users do not', async () => {
    const { env, dragon, target, tokens, hooks, newConfig } = eyeFixture();
    const player = { id: 'player', isGM: false }, intruder = { id: 'intruder', isGM: false };
    env.game.users.get = (id: string) => ({ player, intruder } as any)[id];
    (target as any).testUserPermission = (user: any) => user === player;
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    const callerHooks = new HookBus();
    installEncounterDamageBridge({ game: { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' }, user: player, users: { activeGM: { id: 'gm-1' } } }, Hooks: callerHooks } as any);
    target.system.attributes.hp.temp = 2;
    target.saves.push(10);
    await handle.executeSaveFailureEffect('paroxysm', tokens[0], tokens[2]);
    const ineffective = {}; callerHooks.call('dnd5e.preApplyDamage', target, 0, {}, ineffective);
    callerHooks.call('dnd5e.applyDamage', target, 0, ineffective);
    callerHooks.call('dnd5e.preApplyDamage', target, 1, {}, {}); // cancelled before post-apply
    expect(target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE].encounterDamageFact).toBeUndefined();
    const options = {};
    const playerUpdates = { 'system.attributes.hp.value': 50, 'system.attributes.hp.temp': 1 };
    callerHooks.call('dnd5e.preApplyDamage', target, 1, playerUpdates, options);
    target.system.attributes.hp.temp = 1;
    callerHooks.call('updateActor', target, playerUpdates, {}, 'player');
    callerHooks.call('dnd5e.applyDamage', target, 1, options);
    await Promise.resolve(); await Promise.resolve();
    const fact = target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE].encounterDamageFact;
    expect(fact?.amount).toBe(1);
    hooks.call('updateActor', target, { system: { attributes: { hp: { temp: 1 } } } }, {}, 'player');
    hooks.call('updateActor', target, { flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { encounterDamageFact: fact } } }, {}, 'player');
    await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(false);
    target.saves.push(10);
    await handle.executeSaveFailureEffect('paroxysm', tokens[0], tokens[2]);
    const repeated = { ...fact, eventId: crypto.randomUUID(), groupIds: target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims.paralyzed.map((claim: any) => claim.groupId) };
    hooks.call('updateActor', target, { flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { encounterDamageFact: repeated } } }, {}, 'intruder');
    await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(true);
    // A post-apply event at zero HP is damage even when HP and temp HP cannot decrease.
    target.system.attributes.hp.value = 0; target.system.attributes.hp.temp = 0; target.system.attributes.hp.tempmax = 0;
    hooks.call('updateActor', target, { 'system.attributes.hp.value': 0, 'system.attributes.hp.temp': 0 }, {}, 'player');
    const zero = {}, zeroUpdates = { 'system.attributes.hp.value': 0, 'system.attributes.hp.temp': 0, 'system.attributes.hp.tempmax': 0 };
    callerHooks.call('dnd5e.preApplyDamage', target, 5, zeroUpdates, zero);
    const stamp = (zeroUpdates as any)[`flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.encounterDamageStamp`];
    expect(stamp).toMatch(/^[a-f0-9-]{36}$/iu);
    (zeroUpdates as any)._id = target.uuid.slice(6); // Core Document.update mutates the original update object.
    await target.setFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, 'encounterDamageStamp', stamp);
    callerHooks.call('updateActor', target, { flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { encounterDamageStamp: stamp } } }, {}, 'player');
    callerHooks.call('dnd5e.applyDamage', target, 5, zero);
    hooks.call('updateActor', target, { flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { encounterDamageStamp: stamp } } }, {}, 'player');
    await Promise.resolve(); await Promise.resolve();
    const zeroFact = target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE].encounterDamageFact;
    hooks.call('updateActor', target, { flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { encounterDamageFact: { eventId: zeroFact.eventId, groupIds: zeroFact.groupIds, beforeHp: 0, afterHp: 0 } } } }, {}, 'player');
    await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(false);
  });
  test('manual removal of an owned native status clears claims without recreating the status', async () => {
    const { env, dragon, target, tokens, hooks, newConfig } = eyeFixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.saves.push(10);
    await handle.executeSaveFailureEffect('strobe', tokens[0], tokens[2]);
    const own = target.effects.find((effect) => effect.statuses.has('blinded'))!;
    (own as any).parent = target;
    await target.deleteEmbeddedDocuments('ActiveEffect', [own.id]); hooks.call('deleteActiveEffect', own); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('blinded'))).toBe(false);
    expect(target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims.blinded).toEqual([]);
  });
  test('Actor HP recovery uses observed document values even when pre/post options differ', async () => {
    const { env, dragon, target, tokens, hooks, newConfig } = eyeFixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.system.attributes.hp.value = 40;
    target.saves.push(10);
    await handle.executeSaveFailureEffect('rend', tokens[0], tokens[2]);
    hooks.call('preUpdateActor', target, { 'system.attributes.hp.value': 41 }, { request: 'before' }, 'player');
    target.system.attributes.hp.temp = 3;
    hooks.call('updateActor', target, { 'system.attributes.hp.temp': 3 }, { request: 'different-after' }, 'player');
    await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('fvtt-custom-conditions.enfeebled'))).toBe(true);
    target.system.attributes.hp.value = 41;
    hooks.call('updateActor', target, { 'system.attributes.hp.value': 41 }, { request: 'third-object' }, 'player');
    await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('fvtt-custom-conditions.enfeebled'))).toBe(false);
  });
  test('a cancelled Actor update cannot clear paralysis even when dnd5e fires post-apply', async () => {
    const { env, dragon, target, tokens, hooks, newConfig } = eyeFixture();
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.system.attributes.hp.value = 10; target.system.attributes.hp.temp = 0;
    target.saves.push(10);
    await handle.executeSaveFailureEffect('paroxysm', tokens[0], tokens[2]);
    const options = {}, updates = { 'system.attributes.hp.value': 5, 'system.attributes.hp.temp': 0, 'system.attributes.hp.tempmax': 0 };
    hooks.call('dnd5e.preApplyDamage', target, 5, updates, options);
    // A different preUpdateActor hook cancelled this write: no updateActor event.
    hooks.call('dnd5e.applyDamage', target, 5, options);
    await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(true);
    const committed = {}; hooks.call('dnd5e.preApplyDamage', target, 5, updates, committed);
    target.system.attributes.hp.value = 5;
    hooks.call('updateActor', target, updates, {}, 'gm-1'); hooks.call('dnd5e.applyDamage', target, 5, committed);
    await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(false);
  });
  test('controller reload seeds existing Rend target HP before its first recovery event', async () => {
    const { env, dragon, target, tokens, hooks, newConfig } = eyeFixture();
    const options = { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig };
    target.system.attributes.hp.value = 40;
    let handle = await installEncounterAutomation(env, options);
    target.saves.push(10); await handle.executeSaveFailureEffect('rend', tokens[0], tokens[2]);
    handle.stop(); handle = await installEncounterAutomation(env, options);
    target.system.attributes.hp.value = 41;
    hooks.call('updateActor', target, { 'system.attributes.hp.value': 41 }, { different: true }, 'gm-1');
    await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('fvtt-custom-conditions.enfeebled'))).toBe(false);
  });
  test('zero-HP post-apply accepts only an unchanged native three-field update', async () => {
    const { env, dragon, target, tokens, hooks, newConfig } = eyeFixture();
    target.system.attributes.hp.value = 0; target.system.attributes.hp.temp = 0; target.system.attributes.hp.tempmax = 0;
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.saves.push(10); await handle.executeSaveFailureEffect('paroxysm', tokens[0], tokens[2]);
    const immune = {}, immuneUpdates = { 'system.attributes.hp.value': 0, 'system.attributes.hp.temp': 0, 'system.attributes.hp.tempmax': 0 };
    hooks.call('dnd5e.preApplyDamage', target, 0, immuneUpdates, immune);
    expect((immuneUpdates as any)[`flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.encounterDamageStamp`]).toBeUndefined();
    const extra = {}, changed = { 'system.attributes.hp.value': 0, 'system.attributes.hp.temp': 0, 'system.attributes.hp.tempmax': 0 } as any;
    hooks.call('dnd5e.preApplyDamage', target, 5, changed, extra); changed['flags.someOtherModule'] = true;
    changed._id = target.id;
    await target.setFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, 'encounterDamageStamp', changed[`flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.encounterDamageStamp`]);
    hooks.call('dnd5e.applyDamage', target, 5, extra); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(true);
    const cancelled = {}, cancelledUpdates = { 'system.attributes.hp.value': 0, 'system.attributes.hp.temp': 0, 'system.attributes.hp.tempmax': 0 };
    hooks.call('dnd5e.preApplyDamage', target, 5, cancelledUpdates, cancelled);
    expect((cancelledUpdates as any)[`flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.encounterDamageStamp`]).toBeTruthy();
    // Core preUpdateActor returned false; its stamp was never committed, but dnd5e still emitted post-apply.
    hooks.call('dnd5e.applyDamage', target, 5, cancelled); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(true);
    const native = {}, exact = { 'system.attributes.hp.value': 0, 'system.attributes.hp.temp': 0, 'system.attributes.hp.tempmax': 0 };
    hooks.call('dnd5e.preApplyDamage', target, 5, exact, native);
    const stamp = (exact as any)[`flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.encounterDamageStamp`];
    (exact as any)._id = target.uuid.slice(6); // Real Core appends this fifth key before post-apply.
    await target.setFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, 'encounterDamageStamp', stamp);
    hooks.call('updateActor', target, { flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { encounterDamageStamp: stamp } } }, {}, 'gm-1');
    hooks.call('dnd5e.applyDamage', target, 5, native); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('paralyzed'))).toBe(false);
    const unowned = {}, unownedUpdates = { 'system.attributes.hp.value': 0, 'system.attributes.hp.temp': 0, 'system.attributes.hp.tempmax': 0 };
    hooks.call('dnd5e.preApplyDamage', target, 5, unownedUpdates, unowned);
    expect((unownedUpdates as any)[`flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.encounterDamageStamp`]).toBeUndefined();
  });
  test('queued foreign-status deletion cannot recreate an expired native status claim', async () => {
    const { env, dragon, target, tokens, hooks, combat, newConfig } = eyeFixture();
    const foreign = new Effect({ statuses: ['blinded'] }); (foreign as any).parent = target; target.effects.push(foreign);
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid }, config: newConfig });
    target.saves.push(10); await handle.executeSaveFailureEffect('strobe', tokens[0], tokens[2]);
    expect(target.effects).toContain(foreign);
    expect(target.effects.filter(effect => effect !== foreign && effect.statuses.has('blinded'))).toHaveLength(1);
    combat.turn = 2; combat.combatant = combat.combatants[2]; hooks.call('updateCombat', combat); await handle.settle();
    const started = deferred<void>(), release = deferred<void>(), original = target.setFlag.bind(target);
    target.setFlag = async (scope: string, key: string, value: any) => {
      if (key === ENCOUNTER_AUTOMATION_FLAG_KEY && value.fixedNativeClaims?.blinded?.length === 0) { started.resolve(); await release.promise; }
      return original(scope, key, value);
    };
    combat.round = 2; combat.turn = 0; combat.combatant = combat.combatants[0]; hooks.call('updateCombat', combat);
    await started.promise;
    await target.deleteEmbeddedDocuments('ActiveEffect', [foreign.id]); hooks.call('deleteActiveEffect', foreign);
    release.resolve(); await handle.settle();
    expect(target.effects).toHaveLength(0);
    expect(target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims.blinded).toEqual([]);
  });
  test('queued manual native removal clears only the claims present when the GM removed it', async () => {
    const { env, dragon, crystal, target, tokens, hooks, combat, newConfig } = eyeFixture();
    newConfig.legendaryRecovery = [{ actorKey: 'crystal', max: 0, when: 'own-turn-start' }];
    const handle = await installEncounterAutomation(env, { packageId: 'crystal-package', packageHash: 'package-hash', bindings: { dragon: dragon.uuid, crystal: crystal.uuid }, config: newConfig });
    target.saves.push(10, 10);
    await handle.executeSaveFailureEffect('strobe', tokens[0], tokens[2]);
    const originalEffect = target.effects.find((effect) => effect.statuses.has('blinded'))!;
    (originalEffect as any).parent = target;
    const started = deferred<void>(), release = deferred<void>();
    crystal.update = async () => { started.resolve(); await release.promise; };
    combat.turn = 1; combat.combatant = combat.combatants[1]; hooks.call('updateCombat', combat);
    await started.promise;
    await target.deleteEmbeddedDocuments('ActiveEffect', [originalEffect.id]); hooks.call('deleteActiveEffect', originalEffect);
    await handle.executeSaveFailureEffect('strobe', tokens[0], tokens[2]);
    release.resolve(); await handle.settle();
    expect(target.effects.some((effect) => effect.statuses.has('blinded'))).toBe(true);
    expect(target.flags[ENCOUNTER_AUTOMATION_FLAG_SCOPE][ENCOUNTER_AUTOMATION_FLAG_KEY].fixedNativeClaims.blinded).toHaveLength(1);
  });
});
