import { describe, expect, test } from 'bun:test';
import { ItemParser } from '@fvtt-json-generator/parser/item-parser';
import { convertMarkdownContentToJson } from '@fvtt-json-generator/workflows/single-file-conversion';
import { adaptParsedItemToCanonical } from '@fvtt-json-generator/generation/adapters';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import * as yaml from 'js-yaml';

function itemSource(name: string, type: string, abilities: unknown[], description: string, attunement = false, uses?: unknown) {
  return `---\n${yaml.dump({
    layout: 'item', name, type,
    ...(attunement ? { 'require-attunement': true } : {}),
    'item-mechanics': { schemaVersion: 1, abilities, ...(uses ? { uses } : {}) },
  })}---\n\n${description}`;
}

async function verifyFixture(source: string) {
  const result = await convertMarkdownContentToJson({ content: source, fvttVersion: '14', effectProfile: 'core' });
  expect(result.status, JSON.stringify(result.diagnostics)).toBe('accepted');
  const item = result.rawJson as any;
  const canonical = adaptParsedItemToCanonical(new ItemParser().parse(source));
  const verify = (change: (copy: any) => void) => {
    const output = structuredClone(item);
    change(output);
    return verifyGeneratedDocument({ canonical, output, target: '14', effectProfile: 'core' }).diagnostics.map(({ code }) => code);
  };
  return { item, verify, activities: Object.values(item.system.activities) as any[] };
}

describe('Forge Item P1 native mechanics', () => {
  test('keeps the one-bottle ledger distinct from quantity and projects distinct drink and administer Heal options', async () => {
    const source = itemSource('治疗药水 Potion of Healing', '药水（Potion）', [
      { kind: 'heal', id: 'drink', name: '饮用 Drink', activation: 'bonus', formula: '2d4 + 2', target: 'self', consumption: 1 },
      { kind: 'heal', id: 'administer', name: '喂服 Administer', activation: 'bonus', formula: '2d4+2', target: 'creature', range: 5, consumption: 1 },
    ], '你可以用一个附赠动作饮用这瓶药水，或喂给5尺内的一名生物。饮下后恢复2d4+2生命值。');
    const { item, activities, verify } = await verifyFixture(source);

    expect(item.type).toBe('consumable');
    expect(item.system.type).toEqual({ value: 'potion', subtype: '' });
    expect(item.system.quantity).toBe(1);
    expect(item.system.uses).toEqual({ max: '1', spent: 0, recovery: [], autoDestroy: true });
    for (const [index, expected] of [
      { type: 'self', units: 'self', value: '', prompt: false },
      { type: 'creature', units: 'ft', value: '5', prompt: true },
    ].entries()) {
      const heal = activities[index];
      expect(heal.type).toBe('heal');
      expect(heal.activation).toEqual({ type: 'bonus', value: 1, override: false });
      expect(heal.consumption).toEqual({
        targets: [{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }],
        spellSlot: false, scaling: { allowed: false, max: '' },
      });
      expect(heal.healing).toEqual({
        number: 2, denomination: 4, bonus: '2', types: ['healing'],
        custom: { enabled: false, formula: '' }, scaling: { mode: 'whole', number: 1, formula: '' },
      });
      expect(heal.range).toMatchObject({ units: expected.units, value: expected.value });
      expect(heal.target).toMatchObject({ prompt: expected.prompt, affects: { type: expected.type, count: '1' } });
    }
    expect(verify((output) => { output.system.uses.autoDestroy = false; })).toContain('GEN_ITEM_USES_MISMATCH');
    expect(verify((output) => { (Object.values(output.system.activities)[1] as any).range.value = '15'; }))
      .toContain('GEN_ITEM_HEAL_ACTIVITY_MISMATCH');
    expect(verify((output) => { (Object.values(output.system.activities)[0] as any).healing.bonus = '3'; }))
      .toContain('GEN_ITEM_HEAL_ACTIVITY_MISMATCH');
    expect(() => new ItemParser().parse(source.replace('药水（Potion）', '卷轴（Scroll）'))).toThrow(/requires an explicitly typed Potion/);
  });

  test('projects the transfers used by native equipped and attuned items and rejects transfer and change drift', async () => {
    const cloak = itemSource('防护斗篷 Cloak of Protection', '奇物', [
      { kind: 'passive-ac', id: 'ac', value: 1 }, { kind: 'passive-save', id: 'saves', value: 1 },
    ], '佩戴且同调时，护甲等级和各项豁免检定均获得+1加值。', true);
    const { item, activities, verify } = await verifyFixture(cloak);
    expect(item.system.attunement).toBe('required');
    expect(item.system.attuned).toBeUndefined();
    expect(item.system.equipped).toBe(false);
    expect(activities).toEqual([]);
    expect(item.effects.map(({ transfer, disabled, type, system }: any) =>
      ({ transfer, disabled, type, magical: system.magical, changes: system.changes }))).toEqual([
      { transfer: true, disabled: false, type: 'base', magical: true, changes: [{
        _id: expect.stringMatching(/^[a-zA-Z0-9]{16}$/), key: 'system.attributes.ac.bonus', value: 1,
        type: 'add', phase: 'initial', priority: null,
      }] },
      { transfer: true, disabled: false, type: 'base', magical: true, changes: [{
        _id: expect.stringMatching(/^[a-zA-Z0-9]{16}$/), key: 'system.bonuses.abilities.save', value: 1,
        type: 'add', phase: 'initial', priority: null,
      }] },
    ]);
    expect(verify((output) => { output.effects[1].transfer = false; })).toContain('GEN_ITEM_PASSIVE_EFFECT_MISMATCH');
    expect(verify((output) => { output.system.attunement = ''; })).toContain('GEN_ITEM_PASSIVE_GATING_MISMATCH');

    const boots = itemSource('烈风之靴 Windfire Boots', 'Wondrous Item', [
      { kind: 'passive-resistance', id: 'resistance', damageType: 'fire' },
      { kind: 'passive-movement', id: 'walk', movement: 'walk', value: 10 },
    ], '只要穿着这双靴子，你的步行速度增加10尺，并且获得火焰伤害抗性。');
    const second = await verifyFixture(boots);
    expect(second.activities).toEqual([]);
    expect(second.item.effects.map(({ system }: any) => system.changes[0])).toMatchObject([
      { key: 'system.traits.dr.value', value: 'fire', phase: 'initial', type: 'add' },
      { key: 'system.attributes.movement.walk', value: 10, phase: 'initial', type: 'add' },
    ]);
    expect(second.verify((output) => { output.effects[0].system.changes[0].value = 'cold'; }))
      .toContain('GEN_ITEM_PASSIVE_EFFECT_MISMATCH');
    expect(second.verify((output) => { output.effects[1].system.changes[0].type = 'override'; }))
      .toContain('GEN_ITEM_PASSIVE_EFFECT_MISMATCH');
  });

  test.each([
    { base: 'longsword', category: 'martialM', die: 8, damage: 'slashing', ranges: ['5'] },
    { base: 'spear', category: 'simpleM', die: 6, damage: 'piercing', ranges: ['5', '20'] },
  ])('uses a standard $base and one magical bonus for its ability-based attack and damage', async ({ base, category, die, damage, ranges }) => {
    const source = itemSource(`+1 ${base}`, `Weapon (${base})`, [{ kind: 'weapon-bonus', id: 'magic-plus', baseItem: base, value: 1 }],
      `This ${base} grants a +1 bonus to attack and damage rolls made with it.`);
    const { item, activities, verify } = await verifyFixture(source);
    expect(item.system.type).toEqual({ value: category, baseItem: base });
    expect(item.system.magicalBonus).toBe('1');
    expect(item.system.properties).toContain('mgc');
    expect(item.system.damage.base).toMatchObject({ number: 1, denomination: die, bonus: '', types: [damage] });
    expect(item.effects).toEqual([]);
    expect(activities.map((activity) => activity.range.value)).toEqual([...ranges]);
    for (const attack of activities) {
      expect(attack.attack).toMatchObject({ bonus: '', ability: '', flat: false, type: { classification: 'weapon' } });
      expect(attack.damage).toEqual({ includeBase: true, parts: [] });
      expect(attack.consumption.targets).toEqual([]);
    }
    expect(verify((output) => { output.system.magicalBonus = '2'; })).toContain('GEN_ITEM_WEAPON_BONUS_MISMATCH');
    expect(verify((output) => { (Object.values(output.system.activities)[0] as any).attack.flat = true; }))
      .toContain('GEN_ITEM_ATTACK_ACTIVITY_MISMATCH');
  });

  test('projects the source-backed shield AC bonus once with or without a matching formal effect', async () => {
    const rule = '持握这面盾牌期间，你的护甲等级获得 +2 加值。这是盾牌原本提供的 AC 加值外的额外加值。';
    const ability = { kind: 'passive-ac', id: 'shield-bonus', value: 2 };
    for (const abilities of [[], [ability]]) {
      const source = itemSource('骑士之盾 Shield of the Cavalier', '护甲（盾牌）', abilities, rule, true);
      const { item, verify } = await verifyFixture(source);
      expect(item.system.armor).toMatchObject({ value: 2, magicalBonus: '2' });
      expect(item.effects).toEqual([]);
      expect(verify((output) => { output.system.armor.magicalBonus = '4'; })).toContain('GEN_ITEM_ARMOR_MISMATCH');
    }
    const cloak = itemSource('护身斗篷 Protective Cloak', '奇物', [ability], '穿戴时护甲等级获得 +2 加值。');
    const { item } = await verifyFixture(cloak);
    expect(item.effects[0].system.changes[0]).toMatchObject({ key: 'system.attributes.ac.bonus', value: 2 });
  });

  test('keeps Shield attack, save, and charged ward reaction distinct from manual movement', async () => {
    const describesWard = '生物若尝试离开护盾范围，由 GM 根据原文判断能否移动。';
    const source = itemSource('骑士之盾 Knight Shield', 'Armor (Shield)', [
      { kind: 'attack', id: 'bash', name: '盾击 Bash', attackType: 'mwak', activation: 'action', consumption: 0,
        range: '5 feet', target: { type: 'creature', count: 1 }, damage: [{ formula: '1d4', type: 'bludgeoning' }] },
      { kind: 'save', id: 'shock', name: '震击 Shock', dc: 14, ability: 'dex', activation: 'action', consumption: 1,
        outcome: 'half', range: { value: 15, units: 'ft' }, target: { type: 'creature', count: 1 }, damage: [{ formula: '2d6', type: 'thunder' }] },
      { kind: 'utility', id: 'ward', name: '力场 Ward', trigger: '当一名生物对你发动攻击时', activation: 'reaction', consumption: 1, description: describesWard,
        duration: { value: 1, units: 'minute', concentration: true }, range: { value: '', units: 'self' },
        target: { type: 'creature', count: '', special: '范围内的生物', template: { type: 'radius', size: 10, units: 'ft' } } },
    ], describesWard, true, { max: 2, recovery: [{ period: 'dawn', type: 'recoverAll' }] });
    const { item, activities, verify } = await verifyFixture(source);
    const [attack, save, ward] = activities;
    expect(item.system.type).toEqual({ value: 'shield', baseItem: 'shield' });
    expect(item.system.uses).toEqual({ max: '2', spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] });
    expect(attack.attack).toMatchObject({ flat: false, ability: '', bonus: '' });
    expect(attack.damage).toMatchObject({ includeBase: false, parts: [{ denomination: 4, types: ['bludgeoning'] }] });
    expect(attack.target.affects).toMatchObject({ type: 'creature', count: 1 });
    expect(save).toMatchObject({ type: 'save', save: { ability: ['dex'], dc: { formula: '14' } }, damage: { onSave: 'half' } });
    expect(ward.activation).toEqual({ type: 'reaction', value: 1, condition: '当一名生物对你发动攻击时', override: false });
    expect(ward.consumption.targets).toEqual([{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }]);
    expect(ward.duration).toMatchObject({ value: '1', units: 'minute', concentration: true });
    expect(ward.target).toMatchObject({ template: { type: 'radius', size: '10', units: 'ft' }, affects: { special: '范围内的生物' } });
    expect(ward.description.chatFlavor).toContain(describesWard);
    expect(item.effects).toEqual([]);
    expect(verify((output) => { (Object.values(output.system.activities)[2] as any).target.template.size = '20'; }))
      .toContain('GEN_ITEM_UTILITY_ACTIVITY_MISMATCH');
  });

  test('applies the shield attack’s explicit Strength modifier once without a parent damage part', async () => {
    const rule = '用动作进行近战武器攻击。命中时造成等同于 2d6 + 2 + 你力量调整值的力场伤害。';
    const attack = {
      kind: 'attack', id: 'bash', name: '盾击 Bash', attackType: 'mwak', ability: 'str', activation: 'action',
      consumption: 0, range: '5 feet', target: { type: 'creature', count: 1 },
      damage: [{ formula: '2d6 + 2 + @mod', type: 'force' }],
    };
    const source = itemSource('骑士之盾 Shield of the Cavalier', '护甲（盾牌）', [attack], rule);
    const { activities, verify } = await verifyFixture(source);
    expect(activities[0].attack).toMatchObject({ ability: 'str', bonus: '', flat: false });
    expect(activities[0].damage).toEqual({
      includeBase: false,
      parts: [{
        number: 0, denomination: 0, bonus: '', types: ['force'],
        custom: { enabled: true, formula: '2d6+2+@mod' }, scaling: { mode: 'whole', number: 1, formula: '' },
      }],
    });
    expect(verify((output) => { (Object.values(output.system.activities)[0] as any).attack.ability = 'dex'; }))
      .toContain('GEN_ITEM_ATTACK_ACTIVITY_MISMATCH');
    expect(verify((output) => { (Object.values(output.system.activities)[0] as any).damage.parts[0].custom.formula += '+@mod'; }))
      .toContain('GEN_ITEM_ATTACK_ACTIVITY_MISMATCH');
    const withoutAbility = { ...attack, ability: undefined };
    expect(() => new ItemParser().parse(itemSource('Shield', 'Shield', [withoutAbility], rule))).toThrow(/requires formula and type/);
    const savingThrow = { kind: 'save', id: 'save', dc: 14, ability: 'str', activation: 'action', consumption: 0, damage: attack.damage };
    expect(() => new ItemParser().parse(itemSource('Shield', 'Shield', [savingThrow], rule))).toThrow(/requires formula and type/);
  });

  test('keeps an explicit fixed item attack modifier flat without treating it as a wielder ability bonus', async () => {
    const source = itemSource('远火石 Farflame Stone', 'Wondrous Item', [
      { kind: 'attack', id: 'fire', attackType: 'rsak', toHit: 6, activation: 'action', consumption: 0,
        range: '60 feet', target: { type: 'creature', count: 1 }, damage: [{ formula: '2d6', type: 'fire' }] },
    ], '你可以用一个动作对60尺内的一个生物进行一次远程法术攻击，固定命中加值+6。命中时造成2d6火焰伤害。');
    const { activities } = await verifyFixture(source);
    expect(activities[0].attack).toEqual({ type: { value: 'ranged', classification: 'spell' }, ability: '', bonus: '6', flat: true });
    expect(activities[0].range.value).toBe('60');
    const invalid = source.replace('toHit: 6', 'toHit: 6\n      ability: dex');
    expect(() => new ItemParser().parse(invalid)).toThrow(/fixed modifier/);
  });
});
