import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as Handlebars from 'handlebars';
import { configuredConditionFingerprint, type ConfiguredConditionDefinition } from '@fvtt-json-generator/contracts/configured-conditions';
import { createConditionsApi } from '../src/api.ts';
import { initializeCustomConditions } from '../src/index.ts';
import { ConditionRuntime } from '../src/runtime.ts';
import { configuredDefinitionFromForm, createConfiguredEditorApplicationClass } from '../src/manager.ts';

function fixture(active = true, systemVersion = '5.3.3') {
  let saved: any[] = [], serial = 0;
  const writes: any[] = [], rolled: string[] = [], damages: any[] = [];
  const globals: any = {
    game: { version: '14.368', system: { id: 'dnd5e', version: systemVersion },
      settings: { get: () => structuredClone(saved), set: async (_module: string, _key: string, value: any[]) => {
        writes.push(structuredClone(value)); saved = structuredClone(value);
      } },
      user: { id: 'gm', isGM: true, active: true }, users: {} },
    Roll: class { total: number; constructor(formula: string) { rolled.push(formula); this.total = formula === '2d6' ? 7 : 3; } async evaluate() { return this; } },
  };
  globals.game.users.activeGM = globals.game.user;
  const actor: any = { id: 'target', uuid: 'Actor.target', documentName: 'Actor', name: 'Target', effects: [],
    flags: {}, system: { attributes: { hp: { value: 20 }, movement: { walk: 30 } } }, items: [],
    async createEmbeddedDocuments(_type: string, data: any[]) {
      const created = data.map(entry => ({ ...structuredClone(entry), id: `effect${++serial}`, parent: actor }));
      actor.effects.push(...created); return created;
    },
    async updateEmbeddedDocuments(type: string, updates: any[]) {
      for (const update of updates) {
        const effect = (type === 'Item' ? actor.items : actor.effects).find((entry: any) => entry.id === update._id);
        if (effect) assign(effect, update);
      }
      return actor.effects;
    },
    async deleteEmbeddedDocuments(_type: string, ids: string[]) {
      actor.effects = actor.effects.filter((entry: any) => !ids.includes(entry.id)); return [];
    },
    async update(update: any) { assign(actor, update); return actor; },
    async applyDamage(parts: any[]) { damages.push(structuredClone(parts)); actor.system.attributes.hp.value -= parts[0].value; },
  };
  const conditions = new ConditionRuntime(globals, () => active);
  const api = createConditionsApi(conditions, () => undefined).configuredConditions;
  return { globals, actor, conditions, api, writes, rolled, damages };
}
function assign(target: any, changes: any) {
  for (const [path, value] of Object.entries(changes)) {
    const parts = path.split('.'); let current = target;
    for (const part of parts.slice(0, -1)) current = current[part] ??= {};
    current[parts.at(-1)!] = structuredClone(value);
  }
}
function frostbite(feet = 10): ConfiguredConditionDefinition {
  return { schemaVersion: 1, id: 'configured.frostbite', name: '霜蚀 Frostbite', description: '速度降低。',
    aliases: ['Frostbite', '霜蚀'], components: [{ kind: 'movement-reduction', feet },
      { kind: 'builtin-condition', conditionId: 'sickened', params: {} }] };
}
function bleed(formula: string): ConfiguredConditionDefinition {
  return { schemaVersion: 1, id: 'configured.deep-wound', name: '深创 Deep Wound', description: '流血。',
    aliases: ['Deep Wound', '深创'], components: [{ kind: 'builtin-condition', conditionId: 'bleeding', params: { formula } }] };
}
function burn(formula: string): ConfiguredConditionDefinition {
  return { schemaVersion: 1, id: 'configured.ember-wound', name: '余烬伤 Ember Wound', description: '灼烧。',
    aliases: ['Ember Wound', '余烬伤'], components: [{ kind: 'builtin-condition', conditionId: 'burning',
      params: { formula, damageType: 'fire' } }] };
}
function native(status: 'blinded' | 'unconscious', movement = false): ConfiguredConditionDefinition {
  return { schemaVersion: 1, id: 'configured.moon-veil', name: '月影 Moon Veil', description: '原生状态。',
    aliases: ['Moon Veil', '月影'], components: [{ kind: 'native-condition', status },
      ...(movement ? [{ kind: 'movement-reduction' as const, feet: 10 }] : [])] };
}
const reference = (definition: ConfiguredConditionDefinition) => ({ id: definition.id, fingerprint: configuredConditionFingerprint(definition) });

describe('configured condition public API', () => {
  test('persists world definitions and reloads them through a new API without changing active snapshots', async () => {
    const { globals, actor, api, writes } = fixture();
    const first = frostbite();
    await api.save(first);
    expect(writes).toHaveLength(1);
    const root = await api.apply(actor, reference(first), { instanceId: 'forge_claim_1', source: 'Item.Claw' });
    expect(api.list(actor)).toMatchObject([{ id: root.id, instanceId: 'forge_claim_1', definitionId: first.id,
      definition: first, componentIds: ['effect2'], disabled: false }]);
    expect(actor.effects).toHaveLength(2);
    expect(root.changes).toContainEqual({ key: 'system.attributes.movement.walk', mode: 2, value: '-10', priority: null });
    expect(actor.effects[1].flags['fvtt-custom-conditions'].condition).toMatchObject({ conditionId: 'sickened', source: 'Item.Claw' });
    const reloaded = createConditionsApi(new ConditionRuntime(globals, () => true), () => undefined).configuredConditions;
    expect(reloaded.catalog()).toEqual([first]);
    expect(await reloaded.apply(actor, reference(first), { instanceId: 'forge_claim_1' })).toBe(root);
    expect(actor.effects).toHaveLength(2);
    await api.save(frostbite(20));
    expect(api.list(actor)[0]?.definition).toEqual(first);
    await expect(api.apply(actor, reference(first), { instanceId: 'new_claim' })).rejects.toThrow('changed');
    expect(actor.effects).toHaveLength(2);
    await api.delete(first.id);
    expect(reloaded.catalog()).toEqual([]);
    expect(await reloaded.apply(actor, reference(first), { instanceId: 'forge_claim_1' })).toBe(root);
    await reloaded.remove(actor, 'forge_claim_1');
    expect(actor.effects).toEqual([]);
  });

  test('enforces catalog permissions, alias collisions, and rejects stale or unsafe input before writes', async () => {
    const { api, writes, actor } = fixture(false);
    await expect(api.save(frostbite())).rejects.toThrow('active GM');
    await expect(api.apply(actor, reference(frostbite()))).rejects.toThrow('active GM');
    expect(writes).toEqual([]);
    const allowed = fixture();
    await expect(allowed.api.save({ ...frostbite(), aliases: ['Blinded', '霜蚀'] })).rejects.toThrow('native or built-in');
    await expect(allowed.api.save({ ...frostbite(), aliases: ['Frostbite', '目盲'] })).rejects.toThrow('native or built-in');
    await expect(allowed.api.save({ ...frostbite(), aliases: ['Frostbite', '病弱'] })).rejects.toThrow('conflicts');
    await expect(allowed.api.save({ ...frostbite(), components: [{ kind: 'movement-reduction', feet: 10, key: 'system.hp' } as any] })).rejects.toThrow();
    expect(allowed.writes).toEqual([]);
    await allowed.api.save(frostbite());
    await expect(allowed.api.apply(allowed.actor, { id: 'configured.frostbite', fingerprint: 'a'.repeat(64) })).rejects.toThrow('changed');
    expect(allowed.actor.effects).toEqual([]);
    allowed.globals.game.settings.get = () => null;
    expect(() => allowed.api.catalog()).toThrow('configured condition array');
  });

  test('converts feet to the reviewed metric dnd5e value and rejects unknown movement units before writes', async () => {
    const metric = fixture();
    metric.actor.system.attributes.movement.units = 'm';
    const definition = frostbite(); await metric.api.save(definition);
    const root = await metric.api.apply(metric.actor, reference(definition), { instanceId: 'metric_claim' });
    expect(root.changes).toContainEqual({ key: 'system.attributes.movement.walk', mode: 2, value: '-3', priority: null });
    const unknown = fixture();
    unknown.actor.system.attributes.movement.units = 'yards';
    await unknown.api.save(definition);
    await expect(unknown.api.apply(unknown.actor, reference(definition), { instanceId: 'unknown_unit' })).rejects.toThrow('未知移动单位');
    expect(unknown.actor.effects).toEqual([]);
  });

  test('disables and removes only one configured source, retaining unrelated effects and other instances', async () => {
    const { actor, api } = fixture();
    const definition = frostbite(); await api.save(definition);
    const foreign = { id: 'foreign', name: 'Other', disabled: false, flags: {}, changes: [] }; actor.effects.push(foreign);
    await api.apply(actor, reference(definition), { instanceId: 'claim_a' });
    await api.apply(actor, reference(definition), { instanceId: 'claim_b' });
    await api.setEnabled(actor, 'claim_a', false);
    expect(api.list(actor).find(item => item.instanceId === 'claim_a')?.disabled).toBe(true);
    expect(actor.effects.filter((effect: any) => effect.disabled)).toHaveLength(2);
    await api.remove(actor, 'claim_a');
    expect(api.list(actor).map(item => item.instanceId)).toEqual(['claim_b']);
    expect(actor.effects).toContain(foreign);
    expect(actor.effects).toHaveLength(3);
    await api.setEnabled(actor, 'claim_b', false);
    await api.setEnabled(actor, 'claim_b', true);
    expect(actor.effects.filter((effect: any) => effect.disabled)).toHaveLength(0);
  });

  test('Actor sheet root toggle propagates both ways, then its delete hook clears owned children', async () => {
    const { actor, globals } = fixture();
    const once = new Map<string, () => void>();
    const on = new Map<string, Array<(...args: any[]) => unknown>>();
    globals.Hooks = { once: (name: string, callback: () => void) => { once.set(name, callback); },
      on: (name: string, callback: (...args: any[]) => unknown) => { on.set(name, [...(on.get(name) ?? []), callback]); } };
    globals.CONFIG = { statusEffects: [] };
    const module: any = {};
    globals.game.modules = { get: (id: string) => id === 'fvtt-custom-conditions' ? module : undefined };
    initializeCustomConditions(globals);
    once.get('init')!();
    const api = module.api.configuredConditions;
    const definition = frostbite(); await api.save(definition);
    const root = await api.apply(actor, reference(definition), { instanceId: 'manual_root_deleted' });
    const child = actor.effects.find((effect: any) => effect.id !== root.id);
    await actor.updateEmbeddedDocuments('ActiveEffect', [{ _id: root.id, disabled: true }]);
    for (const handler of on.get('updateActiveEffect') ?? []) await handler(root, { disabled: true }, {});
    expect(child.disabled).toBe(true);
    expect(child.flags['fvtt-custom-conditions'].condition.enabled).toBe(false);
    await actor.updateEmbeddedDocuments('ActiveEffect', [{ _id: root.id, disabled: false }]);
    for (const handler of on.get('updateActiveEffect') ?? []) await handler(root, { disabled: false }, {});
    expect(child.disabled).toBe(false);
    expect(child.flags['fvtt-custom-conditions'].condition.enabled).toBe(true);
    await actor.deleteEmbeddedDocuments('ActiveEffect', [root.id]);
    expect(actor.effects).toHaveLength(1);
    for (const handler of on.get('deleteActiveEffect') ?? []) await handler(root);
    expect(actor.effects).toEqual([]);
  });

  test('uses the native factory, preserves its rule data, and removes only owned primary effect', async () => {
    const { globals, actor, api } = fixture();
    globals.CONFIG = { statusEffects: [{ id: 'blinded', _id: 'nativeBlind000000', name: 'Blinded' }] };
    globals.foundry = { utils: { getDocumentClass: () => ({
      fromStatusEffect: async (status: string) => {
        let source: any = { name: 'Blinded', statuses: [status], changes: [{ key: 'system.test', mode: 5, value: 'native' }], flags: { core: { native: true } } };
        return { name: 'Blinded', updateSource: (changes: any) => { source = { ...source, ...changes }; }, toObject: () => structuredClone(source) };
      },
    }) } };
    const definition = native('blinded'); await api.save(definition);
    const foreign = { id: 'nativeBlind000000', statuses: ['blinded'], flags: { foreign: true } }; actor.effects.push(foreign);
    await api.apply(actor, reference(definition), { instanceId: 'native_claim' });
    const entry = api.list(actor)[0]!;
    const child = actor.effects.find((effect: any) => effect.id === entry.componentIds[0]);
    expect(child.statuses).toEqual(['blinded']);
    expect(child.changes).toEqual([{ key: 'system.test', mode: 5, value: 'native' }]);
    expect(child.flags.core).toEqual({ native: true });
    expect(child.flags['fvtt-custom-conditions'].configuredComponent).toMatchObject({ instanceId: 'native_claim' });
    await api.setEnabled(actor, 'native_claim', false);
    expect(child.disabled).toBe(true);
    expect(child.flags['fvtt-custom-conditions'].condition).toBeUndefined();
    await api.setEnabled(actor, 'native_claim', true);
    expect(child.disabled).toBe(false);
    expect(child.flags['fvtt-custom-conditions'].condition).toBeUndefined();
    await api.remove(actor, 'native_claim');
    expect(actor.effects).toEqual([foreign]);
  });

  test('skips immune native mechanism with a visible warning and rejects an all-immune condition without writes', async () => {
    const { globals, actor, api } = fixture();
    actor.system.traits = { ci: { value: new Set(['blinded']) } };
    const warnings: string[] = []; globals.ui = { notifications: { warn: (message: string) => warnings.push(message) } };
    const only = native('blinded'); await api.save(only);
    await expect(api.apply(actor, reference(only), { instanceId: 'immune_only' })).rejects.toThrow('免疫');
    expect(actor.effects).toEqual([]);
    const mixed = native('blinded', true); await api.save(mixed);
    await api.apply(actor, reference(mixed), { instanceId: 'immune_mixed' });
    expect(api.list(actor)[0]?.skippedComponents).toEqual(['blinded']);
    expect(api.list(actor)[0]?.componentIds).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(actor.effects).toHaveLength(1);
  });

  test('native Unconscious preserves an independent DAE Prone rider after the configured source ends', async () => {
    const { globals, actor, api } = fixture();
    globals.CONFIG = { statusEffects: {
      unconscious: { id: 'unconscious', _id: 'nativeUnconscious', name: 'Unconscious', riders: ['prone'] },
      prone: { id: 'prone', _id: 'dnd5eprone000000', name: 'Prone' },
    } };
    globals.game.modules = { get: (id: string) => id === 'dae' ? { active: true, version: '14.0.12' } : undefined };
    globals.foundry = { utils: { getDocumentClass: () => ({ fromStatusEffect: async (status: string) => {
      let source: any = { name: 'Unconscious', statuses: [status, 'incapacitated'], flags: {}, changes: [] };
      return { name: 'Unconscious', updateSource: (changes: any) => { source = { ...source, ...changes }; },
        toObject: () => structuredClone(source) };
    } }) } };
    const originalCreate = actor.createEmbeddedDocuments.bind(actor);
    actor.createEmbeddedDocuments = async (type: string, data: any[]) => {
      const created = await originalCreate(type, data);
      const primary = created.find((effect: any) => effect.statuses?.includes('unconscious'));
      if (primary) primary.createRiderConditions = async () => {
        const rider: any = { id: 'dnd5eprone000000', statuses: new Set(['prone']), flags: { dae: { autoCreated: true, specialDuration: [] } },
          origin: null, transfer: false, duration: {}, changes: [], disabled: false };
        rider.toObject = () => ({ statuses: ['prone'], flags: structuredClone(rider.flags), origin: null,
          transfer: false, duration: {}, changes: [] });
        rider.update = async (changes: any) => { assign(rider, changes); };
        actor.effects.push(rider);
      };
      return created.slice().reverse();
    };
    const definition = native('unconscious'); await api.save(definition);
    const root = await api.apply(actor, reference(definition), { instanceId: 'sleep_claim' });
    expect(root.flags['fvtt-custom-conditions'].configuredRoot?.instanceId).toBe('sleep_claim');
    const rider = actor.effects.find((effect: any) => effect.id === 'dnd5eprone000000');
    expect(rider?.flags.dae.autoCreated).toBe(false);
    expect(api.list(actor)[0]?.componentIds).toHaveLength(1);
    await api.remove(actor, 'sleep_claim');
    expect(actor.effects).toEqual([rider]);
  });

  test('failed Unconscious rider validation leaves a Shocked weapon equipped', async () => {
    const { globals, actor, api } = fixture();
    actor.items.push({ id: 'weapon', type: 'weapon', system: { equipped: true } });
    globals.CONFIG = { statusEffects: [
      { id: 'unconscious', _id: 'nativeUnconscious', riders: ['prone'] },
      { id: 'prone', _id: 'dnd5eprone000000' },
    ] };
    globals.game.modules = { get: (id: string) => id === 'dae' ? { active: true, version: '14.0.13' } : undefined };
    globals.foundry = { utils: { getDocumentClass: () => ({ fromStatusEffect: async (status: string) => {
      let source: any = { name: 'Unconscious', statuses: [status, 'incapacitated'], flags: {}, changes: [] };
      return { name: 'Unconscious', updateSource: (changes: any) => { source = { ...source, ...changes }; },
        toObject: () => structuredClone(source) };
    } }) } };
    const originalCreate = actor.createEmbeddedDocuments.bind(actor);
    actor.createEmbeddedDocuments = async (type: string, data: any[]) => {
      const created = await originalCreate(type, data);
      const primary = created.find((effect: any) => effect.statuses?.includes('unconscious'));
      if (primary) primary.createRiderConditions = async () => {
        const rider: any = { id: 'dnd5eprone000000', statuses: new Set(['prone']), flags: { dae: { autoCreated: true, specialDuration: [] } },
          origin: null, transfer: false, duration: {}, changes: [], disabled: false };
        rider.toObject = () => ({ statuses: ['prone'], flags: structuredClone(rider.flags), origin: null,
          transfer: false, duration: {}, changes: [] });
        actor.effects.push(rider);
      };
      return created;
    };
    const definition: ConfiguredConditionDefinition = { ...native('unconscious'), components: [
      { kind: 'builtin-condition', conditionId: 'shocked', params: {} }, { kind: 'native-condition', status: 'unconscious' },
    ] };
    await api.save(definition);
    await expect(api.apply(actor, reference(definition), { instanceId: 'unsafe_rider' })).rejects.toThrow('DAE');
    expect(actor.items[0]?.system.equipped).toBe(true);
    expect(api.list(actor)).toEqual([]);
    expect(actor.effects.map((effect: any) => effect.id)).toEqual(['dnd5eprone000000']);
  });

  test('a partially failed Shocked equipment write restores the equipped item and owned effects', async () => {
    const { actor, api } = fixture();
    actor.items.push({ id: 'weapon', type: 'weapon', system: { equipped: true } });
    const originalUpdate = actor.updateEmbeddedDocuments.bind(actor);
    let firstItemWrite = true;
    actor.updateEmbeddedDocuments = async (type: string, updates: any[]) => {
      if (type === 'Item' && firstItemWrite) {
        firstItemWrite = false;
        await originalUpdate(type, updates);
        throw new Error('partial equipment write');
      }
      return originalUpdate(type, updates);
    };
    const definition: ConfiguredConditionDefinition = { ...native('blinded'), components: [
      { kind: 'builtin-condition', conditionId: 'shocked', params: {} },
    ] };
    await api.save(definition);
    await expect(api.apply(actor, reference(definition), { instanceId: 'shocked_partial' })).rejects.toThrow('partial equipment write');
    expect(firstItemWrite).toBe(false);
    expect(actor.items[0]?.system.equipped).toBe(true);
    expect(actor.effects).toEqual([]);
  });

  test('a healed configured Bleeding removes the whole owned group and leaves unrelated effects', async () => {
    const { actor, api, conditions } = fixture();
    const definition = bleed('1d6'); await api.save(definition);
    await api.apply(actor, reference(definition), { instanceId: 'heal_bleed' });
    const foreign = { id: 'foreign', flags: {}, name: 'Unrelated' }; actor.effects.push(foreign);
    await conditions.handleTriggerEvent({ event: { type: 'documentUpdate', documentType: 'Actor' }, document: actor,
      before: { system: { attributes: { hp: { value: 10 } } } }, after: { system: { attributes: { hp: { value: 11 } } } } });
    expect(api.list(actor)).toEqual([]);
    expect(actor.effects).toEqual([foreign]);
  });

  test('Frozen break threshold removes the configured root and every owned mechanism', async () => {
    const { actor, api, conditions } = fixture();
    const definition = { ...frostbite(), components: [
      { kind: 'movement-reduction' as const, feet: 10 },
      { kind: 'builtin-condition' as const, conditionId: 'frozen' as const, params: { escapeDC: 10, breakDamage: 3 } },
    ] };
    await api.save(definition);
    await api.apply(actor, reference(definition), { instanceId: 'frozen_group' });
    const options = {};
    (conditions as any).captureFrozenDamage(actor, [{ type: 'fire', value: 3 }], options);
    await (conditions as any).handleAppliedDamage(actor, 3, options);
    expect(api.list(actor)).toEqual([]);
    expect(actor.effects).toEqual([]);
  });

  test('configured and legacy Bleeding keep both sources but settle only the strongest; removal reveals the other', async () => {
    const { actor, api, conditions, rolled } = fixture();
    const definition = bleed('2d6'); await api.save(definition);
    const legacy = await conditions.apply(actor, 'bleeding', { formula: '1d6' }, { origin: 'Item.legacy' });
    await api.apply(actor, reference(definition), { instanceId: 'forge_bleed' });
    const event = { event: { type: 'combatTurnEnd', documentType: 'Actor' }, document: actor,
      combatUuid: 'Combat.test', key: 'Combat.test:end:1:0', round: 1, turn: 0 };
    await conditions.handleTriggerEvent(event);
    expect(rolled).toEqual(['2d6']);
    expect(actor.system.attributes.hp.value).toBe(13);
    expect(actor.effects.some((effect: any) => effect.id === legacy.id)).toBe(true);
    expect(api.list(actor)).toHaveLength(1);
    await api.remove(actor, 'forge_bleed');
    await conditions.handleTriggerEvent({ ...event, key: 'Combat.test:end:2:0', round: 2 });
    expect(rolled).toEqual(['2d6', '1d6']);
    expect(actor.system.attributes.hp.value).toBe(10);
  });

  test('configured Burning keeps its source while a stronger legacy Burning settles once', async () => {
    const { actor, api, conditions, rolled, damages } = fixture();
    const definition = burn('1d6'); await api.save(definition);
    await api.apply(actor, reference(definition), { instanceId: 'forge_burn' });
    const legacy = await conditions.apply(actor, 'burning', { formula: '2d6', damageType: 'fire' }, { origin: 'Item.legacy' });
    const event = { event: { type: 'combatTurnEnd', documentType: 'Actor' }, document: actor,
      combatUuid: 'Combat.burn', key: 'Combat.burn:end:1:0', round: 1, turn: 0 };
    await conditions.handleTriggerEvent(event);
    expect(rolled).toEqual(['2d6']);
    expect(damages).toEqual([[{ value: 7, type: 'fire' }]]);
    expect(actor.system.attributes.hp.value).toBe(13);
    expect(actor.effects.some((effect: any) => effect.id === legacy.id)).toBe(true);
    expect(api.list(actor)).toHaveLength(1);
    await api.remove(actor, 'forge_burn');
    expect(actor.effects).toHaveLength(1);
  });

  test('editor exposes all implemented mechanism choices with parameter controls', async () => {
    const { globals, api } = fixture();
    globals.foundry = { applications: { api: { ApplicationV2: class { async render() {} } } } };
    const Editor = createConfiguredEditorApplicationClass({ configuredConditions: api } as any, globals);
    const editor = new Editor();
    editor.draft.components = [{ kind: 'builtin-condition', conditionId: 'frozen', params: {} }];
    const context = await editor._prepareContext();
    expect(context.mechanisms[0].choices).toHaveLength(19);
    expect(context.mechanisms[0].nativeChoices).toHaveLength(14);
    expect(context.mechanisms[0].parameters.map((parameter: any) => parameter.id)).toContain('escapeDC');
    expect(context.mechanisms[0].parameters.find((parameter: any) => parameter.id === 'escapeDC')).toMatchObject({
      isNumber: true, required: true, min: 1, max: 50,
    });
    const html = Handlebars.compile(readFileSync(new URL('../src/templates/configured-editor.hbs', import.meta.url), 'utf8'))(
      context, { helpers: { localize: (key: string) => key } });
    expect(html).toContain('name="component-0-param-escapeDC"');
    expect(html).toContain('name="englishAliases"');
    expect(html).toContain('name="chineseAliases"');
    expect(html).toContain('name="component-0-kind"');
  });

  test('form builder takes ordinary bilingual fields and typed mechanism parameters', () => {
    const definition = configuredDefinitionFromForm({ name: '霜蚀 Frostbite', description: '',
      englishAliases: 'Frostbite', chineseAliases: '霜蚀',
      'component-0-kind': 'movement-reduction', 'component-0-feet': '10',
      'component-1-kind': 'builtin-condition', 'component-1-conditionId': 'jinxed',
      'component-1-param-formula': '1d4' }, 2);
    expect(definition).toMatchObject({ id: 'configured.frostbite', aliases: ['Frostbite', '霜蚀'],
      components: [{ kind: 'movement-reduction', feet: 10 }, { kind: 'builtin-condition', conditionId: 'jinxed', params: { formula: '1d4' } }] });
    const nativeDefinition = configuredDefinitionFromForm({ name: '月影 Moon Veil', description: '',
      englishAliases: 'Moon Veil', chineseAliases: '月影',
      'component-0-kind': 'native-condition', 'component-0-status': 'blinded' }, 1);
    expect(nativeDefinition.components).toEqual([{ kind: 'native-condition', status: 'blinded' }]);
    expect(() => configuredDefinitionFromForm({ name: '霜蚀（Frostbite）', englishAliases: 'Frostbite',
      chineseAliases: '霜蚀', 'component-0-kind': 'movement-reduction', 'component-0-feet': '10' }, 1)).toThrow('不使用括号');
  });
});
