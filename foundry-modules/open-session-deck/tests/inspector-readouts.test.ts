import { describe, expect, test } from 'bun:test';
import { projectInspectorReadouts } from '../src/inspector-readouts.ts';

const uses = (value: number, max: number) => ({ value, max, spent: max - value, recovery: [] });
const item = (id: string, name: string, type: string, system: any = {}) => ({ id, name, type, system });

describe('inspector readouts', () => {
  test('uses prepared passive bonuses and keeps unavailable values unknown', () => {
    const actor = { system: { skills: { prc: { passive: 19, mod: 2 }, ins: { passive: 14 }, inv: { mod: 3 } } } };
    const result = projectInspectorReadouts(actor);
    expect(result.passives).toEqual({ perception: 19, insight: 14, investigation: null });
    expect(result.slots).toEqual([]);expect(result.abilities).toEqual([]);expect(result.inventory).toEqual([]);
    expect(projectInspectorReadouts({ system: {} }).passives.perception).toBeNull();
  });

  test('keeps ordinary slots and pact magic separate, including depleted owned levels', () => {
    const result = projectInspectorReadouts({ system: { spells: {
      spell1: { value: 2, max: 4 }, spell2: { value: 0, max: 2 }, spell3: { value: 0, max: 0 },
      spell4: { value: 1 }, pact: { value: 1, max: 2, level: 3 },
    } } });
    expect(result.slots).toEqual([
      { key: 'spell1', level: 1, pact: false, value: 2, max: 4, depleted: false },
      { key: 'spell2', level: 2, pact: false, value: 0, max: 2, depleted: true },
      { key: 'pact', level: 3, pact: true, value: 1, max: 2, depleted: false },
    ]);
  });

  test('does not turn missing prepared data or a raw formula into a zero resource', () => {
    const result = projectInspectorReadouts({ system: { spells: { spell1: { max: 4 }, pact: { value: 1, max: 2 } } }, items: [
      item('formula', '未准备公式', 'feat', { uses: { max: '@prof', spent: 0 } }),
      item('raw', '原始次数', 'feat', { uses: { max: 3, spent: 1 } }),
      item('unlimited', '普通动作', 'feat', { uses: { max: 0, value: 0 } }),
    ] });
    expect(result.slots).toEqual([]);expect(result.abilities).toEqual([]);
  });

  test('shows a shared item pool once for multiple activities and keeps independent activity uses', () => {
    const pool = item('ki', '气点', 'feat', { uses: uses(3, 5) });
    const flurry = item('flurry', '疾风连击', 'feat', { activities: {
      one: { id: 'one', name: '攻击', uses: uses(0, 0), consumption: { targets: [{ type: 'itemUses', target: 'ki' }] } },
      two: { id: 'two', name: '另一攻击', uses: uses(0, 0), consumption: { targets: [{ type: 'itemUses', target: 'ki' }] } },
    } });
    const mixed = item('mixed', '混合能力', 'feat', { uses: uses(1, 2), activities: new Map([
      ['fallback', { id: 'fallback', name: '共享', uses: uses(0, 0), consumption: { targets: [{ type: 'itemUses', target: '' }] } }],
      ['own', { id: 'own', name: '独立', uses: uses(0, 1), consumption: { targets: [{ type: 'activityUses' }] } }],
    ]) });
    const result = projectInspectorReadouts({ system: {}, items: new Map([['ki', pool], ['flurry', flurry], ['mixed', mixed]]) });
    expect(result.abilities.map((entry) => entry.key)).toEqual(['item:ki', 'item:mixed', 'activity:mixed:own']);
    expect(result.abilities[0]?.uses).toEqual({ value: 3, max: 5, depleted: false });
    expect(result.abilities[2]?.uses?.depleted).toBeTrue();
    expect(result.abilities[2]?.name).toBe('混合能力 · 独立');
  });

  test('keeps named actor resources and NPC legendary pools once, without absent zero rows', () => {
    const result = projectInspectorReadouts({ system: { resources: {
      primary: { label: '术法点', value: 0, max: 4 }, secondary: { value: 1, max: 2 },
      tertiary: { value: 0, max: 0 }, legact: { value: 2, max: 3 }, legres: { value: 0, max: 3 },
      lair: { value: true },
    } }, items: [item('legendary', '传奇动作', 'feat', { activities: [
      { id: 'attack', uses: uses(0, 0), consumption: { targets: [{ type: 'attribute', target: 'resources.legact.value' }] } },
    ] })] });
    expect(result.abilities.map((entry) => entry.key)).toEqual(['actor:primary', 'actor:secondary', 'actor:legact', 'actor:legres']);
    expect(result.abilities[0]).toMatchObject({ name: '术法点', uses: { value: 0, max: 4, depleted: true } });
    expect(result.abilities[1]?.labelKey).toBe('DND5E.ResourceSecondary');
    expect(result.abilities[2]?.labelKey).toBe('DND5E.LegendaryAction.LabelPl');
    expect(result.abilities[3]?.labelKey).toBe('DND5E.LegendaryResistance.LabelPl');
  });

  test('keeps equipment charges and physical quantity separate and includes depleted ammo', () => {
    const result = projectInspectorReadouts({ system: {}, items: [
      item('wand', '闪电魔杖', 'equipment', { quantity: 2, uses: uses(3, 7) }),
      item('potions', '治疗药水', 'consumable', { quantity: 5, uses: uses(1, 1), type: { value: 'potion' } }),
      item('arrows', '箭', 'consumable', { quantity: 0, type: { value: 'ammo', subtype: 'arrow' } }),
      item('blade', '长剑', 'weapon', { quantity: 1, uses: uses(0, 0) }),
      item('rope', '绳索', 'loot', { quantity: 1 }),
    ] });
    expect(result.inventory.map((entry) => entry.key)).toEqual(['item:wand', 'item:potions', 'item:arrows']);
    expect(result.inventory[0]).toMatchObject({ quantity: { value: 2, depleted: false }, uses: { value: 3, max: 7 } });
    expect(result.inventory[1]).toMatchObject({ quantity: { value: 5 }, uses: { value: 1, max: 1 } });
    expect(result.inventory[2]).toMatchObject({ quantity: { value: 0, depleted: true } });
    expect(result.inventory[2]?.uses).toBeUndefined();
  });

  test('shows innate spell and NPC recharge uses, while ordinary spell-slot consumers have no extra pool', () => {
    const result = projectInspectorReadouts({ system: {}, items: [
      item('spell', '巫术箭', 'spell', { uses: uses(0, 0), activities: [
        { id: 'cast', uses: uses(0, 0), consumption: { spellSlot: true, targets: [] } },
      ] }),
      item('innate', '天生施法', 'spell', { uses: uses(0, 3) }),
      item('breath', '龙息', 'feat', { uses: { ...uses(0, 1), recovery: [{ period: 'recharge', formula: '5' }] } }),
    ] });
    expect(result.abilities.map((entry) => entry.key)).toEqual(['item:innate', 'item:breath']);
    expect(result.abilities[0]?.uses?.depleted).toBeTrue();expect(result.abilities[1]?.recharge).toBe(5);
  });

  test('does not repeat a native cached spell copy of an activity-owned resource', () => {
    const owner = item('magic', '每日魔法', 'feat', { activities: [
      { id: 'cast', uuid: 'Actor.hero.Item.magic.Activity.cast', name: '施法', uses: uses(1, 3) },
    ] });
    const copy = { ...item('cached', '缓存法术', 'spell', { uses: uses(1, 3) }),
      flags: { dnd5e: { cachedFor: '.Item.magic.Activity.cast' } } };
    const standalone = { ...item('standalone', '独立法术', 'spell', { uses: uses(2, 2) }),
      flags: { dnd5e: { cachedFor: '.Item.absent.Activity.missing' } } };
    const result = projectInspectorReadouts({ system: {}, items: [owner, copy, standalone] });
    expect(result.abilities.map((entry) => entry.key)).toEqual(['activity:magic:cast', 'item:standalone']);
  });
});
