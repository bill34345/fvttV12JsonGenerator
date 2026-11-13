import { describe, expect, test } from 'bun:test';
import {
  dawnDamageBonus, learnedCurseActivities, previewFeaturePresentation, refreshFeaturePresentation,
  registerBloodHunterAutomation, syncDawnWeapon, useCurseSpecialist,
} from '../src/automation.ts';
import type { LegacyIconIndex } from '../src/legacy-icons.ts';

const ID = 'fvtt-blood-hunter-2024';

function dawnFixture() {
  const effects: any[] = [];
  const actor: any = {
    isOwner: true, effects,
    createEmbeddedDocuments: async (_type: string, data: any[]) => {
      await Promise.resolve();
      effects.push(...data.map((value, index) => ({ ...value, id: `resistance${index}`, update: async (changes: any) => Object.assign(effects.find((effect) => effect.id === `resistance${index}`), changes) })));
    },
    deleteEmbeddedDocuments: async (_type: string, ids: string[]) => { for (let index = effects.length - 1; index >= 0; index--) if (ids.includes(effects[index].id)) effects.splice(index, 1); },
  };
  const weapon: any = { uuid: 'Actor.test.Item.dawn', type: 'weapon', system: { equipped: true }, actor, effects: [{ id: 'enchant', uuid: 'Actor.test.Item.dawn.ActiveEffect.enchant', disabled: false, flags: { [ID]: { rite: 'dawn' }, fvttJsonGenerator: { bloodHunterRite: true } } }] };
  return { actor, weapon, effects };
}

describe('Rite of the Dawn', () => {
  test('links one resistance to the actual weapon; equipment, disabled enchantment and removal follow the weapon', async () => {
    const { weapon, effects } = dawnFixture();
    await Promise.all([syncDawnWeapon(weapon), syncDawnWeapon(weapon)]);
    expect(effects).toHaveLength(1);
    expect(effects[0].system.changes).toContainEqual({ key: 'system.traits.dr.value', mode: 2, value: 'necrotic', priority: 20 });
    expect(effects[0].flags[ID].dawnWeaponUuid).toBe(weapon.uuid);
    expect(effects[0].disabled).toBe(false);
    weapon.system.equipped = false;
    await syncDawnWeapon(weapon);
    expect(effects[0].disabled).toBe(true);
    weapon.system.equipped = true;
    await syncDawnWeapon(weapon);
    expect(effects[0].disabled).toBe(false);
    weapon.effects[0].disabled = true;
    await syncDawnWeapon(weapon);
    expect(effects).toHaveLength(0);
  });

  test('uses CAT public DamageBonus only for hits by this weapon against undead, with crit and current scale', async () => {
    const { weapon, effects } = dawnFixture();
    await syncDawnWeapon(weapon);
    const root: any = { cat: { lib: { DamageBonus: class { options: any; targets: any; constructor(_document: any, options: any) { this.options = options; } } } } };
    const undead = { actor: { system: { details: { type: { value: 'undead' } } } }, document: { uuid: 'Token.undead' } };
    const humanoid = { actor: { system: { details: { type: { value: 'humanoid' } } } }, document: { uuid: 'Token.humanoid' } };
    const workflow: any = { item: weapon, activity: { hasAttack: true, hasDamage: true }, hitTargets: new Set([undead, humanoid]) };
    const bonus = dawnDamageBonus({ document: effects[0], workflow }, root);
    expect(bonus.options).toMatchObject({ formula: '@scale.blood-hunter.hemocraft', type: ['radiant'], optional: false, allowCritical: true });
    expect(bonus.targets).toEqual([undead.document]);
    workflow.hitTargets = new Set([humanoid]);
    expect(dawnDamageBonus({ document: effects[0], workflow }, root)).toBeUndefined();
    workflow.hitTargets = new Set([undead]);
    workflow.item = { ...weapon, uuid: 'Actor.test.Item.sameNameDifferentWeapon' };
    expect(dawnDamageBonus({ document: effects[0], workflow }, root)).toBeUndefined();
    workflow.item = weapon;
    weapon.system.equipped = false;
    expect(dawnDamageBonus({ document: effects[0], workflow }, root)).toBeUndefined();
  });

  test('accepts the existing canonical rite marker and clears it on rest, without a ready Actor scan', async () => {
    const { actor, weapon, effects } = dawnFixture();
    weapon.effects[0].flags = { fvttJsonGenerator: { bloodHunterRite: true, riteName: '破晓血仪' } };
    weapon.deleteEmbeddedDocuments = async () => { weapon.effects = []; };
    const template = { id: 'dawnTemplate', disabled: true, flags: { fvttJsonGenerator: { bloodHunterRite: true, riteName: '破晓血仪' } } };
    const feat = { type: 'feat', effects: [template], deleteEmbeddedDocuments: async () => { throw new Error('A rest must not delete the source enchantment profile.'); } };
    actor.items = [weapon, feat];
    const events = new Map<string, Function>();
    const root: any = { Hooks: { on: (event: string, fn: Function) => events.set(event, fn), once: (event: string, fn: Function) => events.set(event, fn) }, game: { user: { id: 'test' } } };
    registerBloodHunterAutomation(root);
    expect(events.has('ready')).toBe(false);
    await syncDawnWeapon(weapon);
    expect(effects).toHaveLength(1);
    await events.get('dnd5e.restCompleted')!(actor);
    expect(weapon.effects).toHaveLength(0);
    expect(effects).toHaveLength(0);
    expect(feat.effects).toEqual([template]);
  });
});

function curseFixture(action: 'bonus' | 'reaction' = 'bonus') {
  const actor: any = { isOwner: true, items: [], inCombat: true };
  const pool = { id: 'hemocraft', system: { identifier: 'blood-maledict', uses: { max: 4, spent: 0 } } };
  const clones: any[] = [];
  const makeCurse = (id: string, identifier: string) => {
    const item: any = { id, name: identifier, flags: { fvttJsonGenerator: { bloodHunter2024: { canonicalId: identifier } } }, system: { identifier, activities: new Map() }, actor };
    const normal = { id: 'normal', name: '普通', item, activation: { type: action }, target: { affects: { type: 'creature', count: 1 }, template: { type: '' } }, consumption: { targets: [{ type: 'itemUses', target: 'blood-maledict' }] } };
    const amplified = { ...normal, id: 'amplified', name: '增幅 Amplify' };
    item.system.activities = new Map([['normal', normal], ['amplified', amplified]]);
    item.clone = (changes: any) => {
      clones.push(changes);
      const id = Object.keys(changes)[0]!.split('.')[2]!;
      const original = item.system.activities.get(id);
      const child: any = { ...original, actor, activation: Object.values(changes)[0], consumption: { ...original.consumption, targets: original.consumption.targets.map((target: any) => ({ ...target })) } };
      const clone = { actor, system: { ...item.system, activities: new Map([[id, child]]) }, updateSource: (update: any) => { child.consumption.targets = Object.values(update)[0]; } };
      child.item = clone;
      return clone;
    };
    return item;
  };
  const curse = makeCurse('curse', action === 'reaction' ? 'blood-curse-of-the-eyeless' : 'blood-curse-of-binding');
  const otherCurse = makeCurse('otherCurse', action === 'reaction' ? 'blood-curse-of-the-fallen-puppet' : 'blood-curse-of-the-marked');
  actor.items = [pool, curse, otherCurse];
  const specialist: any = { actor, item: { actor, flags: { fvttJsonGenerator: { bloodHunter2024: { sourceIdentity: { normalizedName: 'curse-specialist' } } } } } };
  const selection: any = { action, curses: [{ itemId: 'curse', activityId: 'normal', targetUuids: ['Token.one'] }, { itemId: 'otherCurse', activityId: 'amplified', targetUuids: ['Token.two'] }] };
  return { actor, pool, curse, otherCurse, specialist, selection, clones };
}

describe('Curse Specialist', () => {
  test('resolves a symbolic resource on the usage copy to the actual owned Item, preserving the saved template', () => {
    const { actor, curse } = curseFixture();
    const template = { type: 'itemUses', target: 'blood-maledict', value: '1' };
    const target = { ...template, toObject() { return { ...template }; } };
    const changes: any[] = [];
    const item = { ...curse, updateSource: (update: any) => changes.push(update) };
    const activity: any = { id: 'normal', actor, item, consumption: { targets: [target] } };
    const events = new Map<string, Function>();
    registerBloodHunterAutomation({ Hooks: { on: (event: string, fn: Function) => events.set(event, fn), once: (event: string, fn: Function) => events.set(event, fn) } });
    events.get('dnd5e.preUseActivity')!(activity);
    expect(target.target).toBe('hemocraft');
    expect(changes).toEqual([{ 'system.activities.normal.consumption.targets': [{ type: 'itemUses', target: 'hemocraft', value: '1' }] }]);
    expect(template.target).toBe('blood-maledict');
  });

  test('resolves the Midi usage clone before actual native consumption while retaining valid custom, self and unknown resource targets', () => {
    const { actor, pool, curse } = curseFixture();
    const canonicalId = 'canonicalPool001';
    (pool as any).flags = { fvttJsonGenerator: { bloodHunter2024: { canonicalId } } };
    actor.items.push({ id: 'equipmentUses001', system: { identifier: 'custom-curse-fuel' } });
    const sources = ['blood-maledict', canonicalId, 'equipmentUses001', 'old-custom-fuel', ''].map((target) => ({ type: 'itemUses', target, value: '1' }));
    const targets = sources.map((source) => ({ ...source, toObject: () => ({ ...source }) }));
    const updates: any[] = [];
    const item = { ...curse, updateSource: (update: any) => updates.push(update) };
    const activity = { actor, item, id: 'normal', consumption: { targets } };
    const events = new Map<string, Function>();
    registerBloodHunterAutomation({ Hooks: { on: (event: string, fn: Function) => events.set(event, fn), once: (event: string, fn: Function) => events.set(event, fn) } });
    events.get('midi-qol.preTargeting')!({ activity });
    expect(targets.map((target) => target.target)).toEqual(['hemocraft', 'hemocraft', 'equipmentUses001', 'old-custom-fuel', '']);
    expect(updates[0]['system.activities.normal.consumption.targets'].map((target: any) => target.target)).toEqual(targets.map((target) => target.target));
    expect(sources.map((target) => target.target)).toEqual(['blood-maledict', canonicalId, 'equipmentUses001', 'old-custom-fuel', '']);
  });

  test('exhausted or absent Hemocraft does not preempt each normal usage configuration or force free consumption', async () => {
    for (const missingPool of [false, true]) {
      const { actor, pool, specialist, selection, curse } = curseFixture();
      pool.system.uses.spent = 4;
      if (missingPool) actor.items = actor.items.filter((item: any) => item !== pool);
      const calls: any[] = [];
      const root: any = { fromUuidSync: () => ({ object: {} }), MidiQOL: { isTargetable: () => true, completeActivityUse: async (activity: any, usage: any, dialog: any) => { calls.push({ activity, usage, dialog }); return { aborted: false }; } } };
      expect(await useCurseSpecialist(specialist, selection, root)).toHaveLength(2);
      expect(calls.map((call) => call.dialog)).toEqual([{ configure: true }, { configure: true }]);
      expect(calls.map((call) => call.usage.consume)).toEqual([{ action: true }, { action: false }]);
      expect(calls[0].activity.consumption.targets[0].target).toBe(missingPool ? 'blood-maledict' : pool.id);
      expect(pool.system.uses.spent).toBe(4);
      expect(curse.system.activities.get('normal').consumption.targets[0].target).toBe('blood-maledict');
    }
  });

  test('learned free bonus/reaction Activities remain selectable without a resource pool and special amplification helpers stay excluded', async () => {
    const { actor, pool, curse, otherCurse, specialist, selection } = curseFixture();
    actor.items = actor.items.filter((item: any) => item !== pool);
    for (const item of [curse, otherCurse]) for (const activity of item.system.activities.values()) activity.consumption.targets = [];
    curse.system.activities.set('loss', { id: 'loss', item: curse, activation: { type: 'special' }, consumption: { targets: [] } });
    expect(learnedCurseActivities(actor).map((entry) => entry.activity.id)).toEqual(['normal', 'amplified', 'normal', 'amplified']);
    const calls: any[] = [];
    const root: any = { fromUuidSync: () => ({ object: {} }), MidiQOL: { isTargetable: () => true, completeActivityUse: async (activity: any, usage: any) => { calls.push({ activity, usage }); return { aborted: false }; } } };
    expect(await useCurseSpecialist(specialist, selection, root)).toHaveLength(2);
    expect(calls.map((call) => call.activity.consumption.targets)).toEqual([[], []]);
    expect(calls.map((call) => call.usage.consume)).toEqual([{ action: true }, { action: false }]);
  });

  test('retains an owned custom resource when cloning a selected curse instead of redirecting it to Hemocraft', async () => {
    const { actor, curse, specialist, selection } = curseFixture();
    actor.items.push({ id: 'equipmentUses001', system: { identifier: 'custom-curse-fuel' } });
    curse.system.activities.get('normal').consumption.targets = [{ type: 'itemUses', target: 'equipmentUses001', value: '2' }];
    const calls: any[] = [];
    const root: any = { fromUuidSync: () => ({ object: {} }), MidiQOL: { isTargetable: () => true, completeActivityUse: async (activity: any, usage: any) => { calls.push({ activity, usage }); return { aborted: false }; } } };
    expect(await useCurseSpecialist(specialist, { action: 'bonus', curses: [selection.curses[0]] }, root)).toHaveLength(1);
    expect(calls[0].activity.consumption.targets).toEqual([{ type: 'itemUses', target: 'equipmentUses001', value: '2' }]);
    expect(calls[0].usage.consume).toEqual({ action: true });
  });

  test('uses learned normal and amplified reaction activities sequentially, retains targets/resources, and spends only one reaction', async () => {
    const { actor, pool, specialist, selection, clones } = curseFixture('reaction');
    const calls: any[] = [];
    const root: any = { fromUuidSync: (uuid: string) => ({ object: { uuid } }), MidiQOL: { isTargetable: () => true, hasUsedReaction: () => false, completeActivityUse: async (activity: any, usage: any) => { calls.push({ activity, usage }); pool.system.uses.spent++; return { aborted: false }; } } };
    expect(learnedCurseActivities(actor).map((entry) => entry.activity.id)).toEqual(['normal', 'amplified', 'normal', 'amplified']);
    expect(await useCurseSpecialist(specialist, selection, root)).toHaveLength(2);
    expect(pool.system.uses.spent).toBe(2);
    expect(calls.map((call) => call.activity.activation.type)).toEqual(['reaction', 'special']);
    expect(calls.map((call) => call.usage.consume.action)).toEqual([true, false]);
    expect(calls.map((call) => call.usage.midiOptions.targetUuids)).toEqual([['Token.one'], ['Token.two']]);
    expect(calls[1].usage.midiOptions.proceedChecks).toEqual({ checkReaction: false, checkBonusAction: false });
    expect(calls.map((call) => call.usage.midiOptions.workflowOptions.targetConfirmation)).toEqual(['none', 'none']);
    expect(clones).toHaveLength(2);
  });

  test('rejects unknown curses before casting; normal workflow cancellation stops the sequence', async () => {
    const { specialist, selection } = curseFixture();
    let calls = 0;
    const root: any = { fromUuidSync: () => ({ object: {} }), MidiQOL: { isTargetable: () => true, completeActivityUse: async () => { calls++; return { aborted: true }; } } };
    selection.curses[1].itemId = 'unknown';
    await expect(useCurseSpecialist(specialist, selection, root)).rejects.toThrow('已学会');
    selection.curses[1].itemId = 'otherCurse';
    expect(await useCurseSpecialist(specialist, selection, root)).toHaveLength(0);
    expect(calls).toBe(1);
  });

  test('rejects an unrendered or invalid second target before either curse spends resources', async () => {
    const { pool, specialist, selection } = curseFixture();
    let calls = 0;
    const root: any = { fromUuidSync: (uuid: string) => uuid === 'Token.two' ? {} : { object: {} }, MidiQOL: { isTargetable: () => true, completeActivityUse: async () => { calls++; } } };
    await expect(useCurseSpecialist(specialist, selection, root)).rejects.toThrow('已渲染场景');
    expect(calls).toBe(0);
    expect(pool.system.uses.spent).toBe(0);
    root.fromUuidSync = () => ({ object: {} }); root.MidiQOL.isTargetable = () => false;
    await expect(useCurseSpecialist(specialist, selection, root)).rejects.toThrow('有效目标');
    expect(calls).toBe(0);
  });

  test('requires both individual-creature targets before either workflow starts, while self and area retain their native empty-target path', async () => {
    const { pool, curse, otherCurse, specialist, selection, clones } = curseFixture();
    let calls = 0;
    const root: any = { fromUuidSync: () => ({ object: {} }), MidiQOL: { isTargetable: () => true, completeActivityUse: async () => { calls++; pool.system.uses.spent++; return { aborted: false }; } } };
    for (const targets of [[[], []], [[], ['Token.two']], [['Token.one'], []]]) {
      selection.curses[0].targetUuids = targets[0]; selection.curses[1].targetUuids = targets[1];
      await expect(useCurseSpecialist(specialist, selection, root)).rejects.toThrow('需要选择目标');
      expect(calls).toBe(0);
      expect(pool.system.uses.spent).toBe(0);
      expect(clones).toHaveLength(0);
    }
    curse.system.activities.get('normal').target = { affects: { type: 'self' }, template: { type: '' } };
    otherCurse.system.activities.get('amplified').target = { affects: { type: 'creature', count: 1 }, template: { type: 'circle' } };
    selection.curses[0].targetUuids = []; selection.curses[1].targetUuids = [];
    expect(await useCurseSpecialist(specialist, selection, root)).toHaveLength(2);
    expect(calls).toBe(2);
  });

  test('one curse spends its actual one use and one bonus action; two different curses may share a target', async () => {
    const { pool, specialist, selection } = curseFixture();
    const calls: any[] = [];
    const root: any = { fromUuidSync: () => ({ object: {} }), MidiQOL: { isTargetable: () => true, hasUsedBonusAction: () => false, completeActivityUse: async (activity: any, usage: any) => { calls.push({ activity, usage }); pool.system.uses.spent++; return { aborted: false }; } } };
    const single = { action: 'bonus' as const, curses: [selection.curses[0]] };
    pool.system.uses.spent = 3;
    expect(await useCurseSpecialist(specialist, single, root)).toHaveLength(1);
    expect(pool.system.uses.spent).toBe(4);
    expect(calls[0].activity.activation.type).toBe('bonus');
    expect(calls[0].usage.consume.action).toBe(true);
    pool.system.uses.spent = 0;
    selection.curses[1].targetUuids = ['Token.one'];
    expect(await useCurseSpecialist(specialist, selection, root)).toHaveLength(2);
    expect(calls.slice(1).map((call) => call.usage.midiOptions.targetUuids)).toEqual([['Token.one'], ['Token.one']]);
  });

  test('rejects normal/amplified and duplicate embedded copies of one canonical curse before casting', async () => {
    const { actor, curse, otherCurse, specialist, selection, pool, clones } = curseFixture();
    let calls = 0;
    const root: any = { fromUuidSync: () => ({ object: {} }), MidiQOL: { isTargetable: () => true, completeActivityUse: async () => { calls++; } } };
    selection.curses[1].itemId = curse.id;
    await expect(useCurseSpecialist(specialist, selection, root)).rejects.toThrow('同一个血咒');
    otherCurse.flags = structuredClone(curse.flags);
    selection.curses[1].itemId = otherCurse.id;
    await expect(useCurseSpecialist(specialist, selection, root)).rejects.toThrow('同一个血咒');
    expect(actor.items).toHaveLength(3);
    expect(pool.system.uses.spent).toBe(0);
    expect(calls).toBe(0);
    expect(clones).toHaveLength(0);
  });

  test('rejects zero or over two curses, non-curse and special helper activities and used action before casting', async () => {
    const { actor, curse, specialist, selection } = curseFixture();
    let calls = 0;
    const root: any = { fromUuidSync: () => ({ object: {} }), MidiQOL: { isTargetable: () => true, hasUsedReaction: () => true, completeActivityUse: async () => { calls++; } } };
    for (const curses of [[], [...selection.curses, selection.curses[0]]]) await expect(useCurseSpecialist(specialist, { action: 'bonus', curses }, root)).rejects.toThrow('一至两个');
    curse.system.activities.set('loss', { id: 'loss', item: curse, consumption: { targets: [] } });
    actor.items.push({ id: 'unlearned', system: { identifier: 'other-feature', activities: new Map([['foreign', { id: 'foreign', consumption: { targets: [{ type: 'itemUses', target: 'blood-maledict' }] } }]]) } });
    expect(learnedCurseActivities(actor).map((entry) => entry.activity.id)).not.toContain('loss');
    expect(learnedCurseActivities(actor).map((entry) => entry.activity.id)).not.toContain('foreign');
    await expect(useCurseSpecialist(specialist, { action: 'bonus', curses: [{ ...selection.curses[0], activityId: 'loss' }] }, root)).rejects.toThrow('已学会');
    for (const item of actor.items) for (const activity of item.system.activities?.values?.() ?? []) activity.activation = { type: 'reaction' };
    selection.action = 'reaction';
    await expect(useCurseSpecialist(specialist, selection, root)).rejects.toThrow('反应已使用');
    expect(calls).toBe(0);
  });

  test('second workflow cancellation preserves the first completed use and stops without inventing a refund', async () => {
    const { pool, specialist, selection } = curseFixture();
    let calls = 0;
    const root: any = { fromUuidSync: () => ({ object: {} }), MidiQOL: { isTargetable: () => true, completeActivityUse: async () => { if (++calls === 2) return { aborted: true }; pool.system.uses.spent++; return { aborted: false }; } } };
    expect(await useCurseSpecialist(specialist, selection, root)).toHaveLength(1);
    expect(calls).toBe(2);
    expect(pool.system.uses.spent).toBe(1);
  });
});

test('legacy icon update uses unique source URL/book/rules identity, writes only img, and rejects stale or ambiguous rows', async () => {
  const item: any = { id: 'legacy', type: 'feat', name: '玩家自己的中文名', img: 'icons/old.webp', flags: { 'plutonium-cn': { page: 'classFeature', source: 'BloodHunter2024', hash: encodeURIComponent('鲜血秘法_血猎手_bloodhunter2024_1_bloodhunter2024') }, manual: { keep: true } }, system: { source: { book: 'BH2024', rules: '2024' }, uses: { spent: 2 }, description: { value: '手改' }, activities: { custom: true } } };
  const index: LegacyIconIndex = { schemaVersion: 1, moduleId: ID, version: '1.1.0', sourceSha256: 'source', canonicalLogicalHash: 'logical', entries: [{ page: 'classFeature', urlIdentity: '鲜血秘法_血猎手_bloodhunter2024_1_bloodhunter2024', type: 'feat', sourceLocator: { group: 'classFeature', index: 0 }, sourceName: '鲜血秘法', img: 'icons/new.webp', canonicalId: 'canonical', route: 'canonical-item' }] };
  const updates: any[] = [];
  const actor: any = { items: [item], updateEmbeddedDocuments: async (_type: string, rows: any[]) => { updates.push(rows); for (const row of rows) Object.assign(item, { img: row.img }); } };
  const before = structuredClone(item);
  const preview = previewFeaturePresentation(actor, [], index);
  expect(preview).toHaveLength(1);
  expect(preview[0]!.after).toEqual({ img: 'icons/new.webp' });
  await refreshFeaturePresentation(actor, preview, [], { game: { user: { isGM: true } } }, index);
  expect(updates).toEqual([[{ _id: 'legacy', img: 'icons/new.webp' }]]);
  expect({ ...item, img: before.img }).toEqual(before);
  item.img = before.img;
  const stale = previewFeaturePresentation(actor, [], index);
  item.flags['plutonium-cn'].hash += '_changed';
  await expect(refreshFeaturePresentation(actor, stale, [], { game: { user: { isGM: true } } }, index)).rejects.toThrow('重新预览');
  item.flags = before.flags;
  item.system.source.rules = '2014'; expect(previewFeaturePresentation(actor, [], index)).toEqual([]);
  item.system.source.rules = '2024'; item.flags['plutonium-cn'].source = 'Other'; expect(previewFeaturePresentation(actor, [], index)).toEqual([]);
  item.flags['plutonium-cn'].source = 'BloodHunter2024'; item.flags['plutonium-cn'].page = 'optionalfeatures.html'; expect(previewFeaturePresentation(actor, [], index)).toEqual([]);
  item.flags['plutonium-cn'].page = 'classFeature';
  expect(() => previewFeaturePresentation(actor, [], { ...index, entries: [...index.entries, index.entries[0]!] })).toThrow('不唯一');
  const approved = previewFeaturePresentation(actor, [], index); item.img = 'icons/changed.webp';
  await expect(refreshFeaturePresentation(actor, approved, [], { game: { user: { isGM: true } } }, index)).rejects.toThrow('重新预览');
  expect(updates).toHaveLength(1);
});

test('presentation refresh is explicit and changes only selected names/icons, preserving choices, spent and manual data', async () => {
  const item: any = { id: 'owned', type: 'feat', name: '旧名', img: 'icons/svg/book.svg', flags: { fvttJsonGenerator: { bloodHunter2024: { canonicalId: 'canonical' } } }, system: { uses: { spent: 2 }, custom: 'keep' } };
  const updates: any[] = [];
  const actor: any = { items: [item], updateEmbeddedDocuments: async (type: string, data: any[]) => updates.push({ type, data }) };
  const canonical = [{ _id: 'canonical', type: 'feat', name: '新名 New Name', img: 'icons/new.webp' }];
  const preview = previewFeaturePresentation(actor, canonical);
  expect(updates).toHaveLength(0);
  await refreshFeaturePresentation(actor, preview, canonical, { game: { user: { isGM: true } } });
  expect(updates).toEqual([{ type: 'Item', data: [{ _id: 'owned', name: '新名 New Name', img: 'icons/new.webp' }] }]);
  expect(item.system).toEqual({ uses: { spent: 2 }, custom: 'keep' });
  item.name = 'changed after preview';
  await expect(refreshFeaturePresentation(actor, preview, canonical, { game: { user: { isGM: true } } })).rejects.toThrow('重新预览');
});
