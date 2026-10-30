import { describe, expect, test } from 'bun:test';
import { StructuredActionParser } from '@fvtt-json-generator/parser/structured-action';
import { ActorGenerator } from '@fvtt-json-generator/generation/actor';
import type { StructuredActionData } from '@fvtt-json-generator/models/action';

const parser = new StructuredActionParser();
const prose = '正文写DC99魅力豁免、99d6火焰伤害、持续至下一回合结束和Reaction。程序不据此更改AI的显式字段。';
const boundary = { 执行模式: 'native-with-gm', nativeRuleText: 'AI选择的原生操作。', manualRemainder: '其余由GM裁定。', 描述: prose };
function parse(record: Record<string, unknown>): StructuredActionData {
  return parser.parseStructuredSection([record], '动作')[0]!;
}
function generate(action: StructuredActionData): any {
  return new ActorGenerator({ fvttVersion: '14', effectProfile: 'core', translationService: null }).generate({
    name: 'Explicit IR Fixture', type: 'npc', abilities: { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 },
    attributes: { hp: { value: 100, max: 100 }, ac: { value: 18, calc: 'flat' }, movement: {}, init: 5, prof: 5 },
    details: { cr: 10, xp: 5900, biography: '' }, traits: { dr: [], di: [], ci: [], languages: [], senses: {} },
    items: [], biographyMode: 'literal', structuredActions: { 动作: [action] },
  } as any);
}
const activities = (item: any): any[] => Object.values(item.system.activities);
const nativeSave = () => ({ 名称: '显式豁免', 类型: 'save', ...boundary, DC: 17, 属性: 'wis', nativeFailureStatuses: ['prone'], saveOutcome: 'half', 伤害: [{ 公式: '3d6+2', 类型: 'cold' }] });
const gmSave = () => ({ 名称: '显式攻击', 类型: 'attack', ...boundary, 攻击类型: 'mwak', 命中: 19, 范围: '触及10尺', 伤害: [{ 公式: '2d8+4', 类型: 'bludgeoning' }],
  gmTriggeredSave: { dc: 17, ability: 'int', trigger: '由GM选择这个事件时', sourceText: 'AI保留的中文豁免限定', failureStatuses: ['stunned'] } });
const spellRecords = () => ({ 名称: '手动法术次数', 类型: 'utility', ...boundary, spellUseRecords: [{ name: '侦测思想', max: 3, period: 'day' }, { name: '暗示术', max: 2, period: 'day' }] });

describe('native-with-gm preserves explicit IR instead of rebuilding from prose', () => {
  test('native save retains the supplied DC, ability, damage result and status', () => {
    const record = nativeSave(), before = structuredClone(record), action = parse(record), actor = generate(action), item = actor.items[0];
    expect(record).toEqual(before); expect(action.nativeFailureStatuses).toEqual(['prone']);
    expect(activities(item)).toHaveLength(1);
    expect(activities(item)[0]).toMatchObject({ type: 'save', save: { ability: ['wis'], dc: { formula: '17' } }, damage: { onSave: 'half' } });
    expect(item.effects.map((effect: any) => effect.statuses)).toEqual([['prone']]);
    expect(activities(item)[0].effects).toEqual([{ _id: item.effects[0]._id, onSave: false }]);
    expect(item.system.description.value).toContain('DC99');
  });

  test('GM save uses explicit Chinese fields and does not create a second primary save', () => {
    const record = gmSave(), action = parse(record), before = structuredClone(action), actor = generate(action), item = actor.items[0], all = activities(item);
    expect(action).toEqual(before); expect(record.gmTriggeredSave as unknown).toEqual(action.gmTriggeredSave);
    expect(all.map(activity => activity.type)).toEqual(['attack', 'save']);
    expect(all[0].attack.bonus).toBe('19');
    expect(all[1]).toMatchObject({ save: { ability: ['int'], dc: { formula: '17' } }, activation: { type: 'special', condition: record.gmTriggeredSave.trigger }, consumption: { targets: [] } });
    expect(item.effects.map((effect: any) => effect.statuses)).toEqual([['stunned','incapacitated']]);
    expect(all[0].effects ?? []).toEqual([]); expect(all[1].effects).toHaveLength(1);
  });

  test('manual spell counters preserve names, counts and per-activity consumption', () => {
    const record = spellRecords(), before = structuredClone(record), action = parse(record), actor = generate(action), item = actor.items[0];
    expect(record).toEqual(before); expect(action.spellUseRecords as unknown).toEqual(record.spellUseRecords);
    const all = activities(item); expect(all).toHaveLength(2);
    expect(all.map(activity => activity.uses)).toEqual([
      { spent: 0, max: '3', recovery: [{ period: 'day', type: 'recoverAll' }] },
      { spent: 0, max: '2', recovery: [{ period: 'day', type: 'recoverAll' }] },
    ]);
    expect(all[0].name).toContain('侦测思想'); expect(all[1].name).toContain('暗示术');
    expect(all.every(activity => activity.consumption.targets[0].type === 'activityUses')).toBe(true);
    expect(item.system.uses).toBeUndefined(); expect(item.effects).toEqual([]);
  });

  const invalid: Array<[string, () => any]> = [
    ['invalid status enum', () => ({ ...nativeSave(), nativeFailureStatuses: ['script'] })],
    ['duplicate status', () => ({ ...nativeSave(), nativeFailureStatuses: ['prone', 'prone'] })],
    ['nonfinite primary status DC', () => ({ ...nativeSave(), DC: Infinity })],
    ['bad primary status ability', () => ({ ...nativeSave(), 属性: 'luck' })],
    ['status on attack', () => ({ ...gmSave(), nativeFailureStatuses: ['prone'] })],
    ['bad GM ability', () => ({ ...gmSave(), gmTriggeredSave: { ...gmSave().gmTriggeredSave, ability: 'luck' } })],
    ['nonfinite GM DC', () => ({ ...gmSave(), gmTriggeredSave: { ...gmSave().gmTriggeredSave, dc: NaN } })],
    ['unknown GM field', () => ({ ...gmSave(), gmTriggeredSave: { ...gmSave().gmTriggeredSave, script: 'run' } })],
    ['GM and primary save', () => ({ ...gmSave(), DC: 17, 属性: 'int' })],
    ['fractional counter', () => ({ ...spellRecords(), spellUseRecords: [{ name: '法术', max: 1.5, period: 'day' }] })],
    ['unknown counter field', () => ({ ...spellRecords(), spellUseRecords: [{ name: '法术', max: 1, period: 'day', path: 'system.hp' }] })],
    ['counter and item uses', () => ({ ...spellRecords(), 使用次数: { max: 2, period: 'day' } })],
  ];
  for (const [label, build] of invalid) test('retains the Actor and other mechanics for '+label, () => {
    const record=build(),before=structuredClone(record),action=parse(record),actor=generate(action);expect(record).toEqual(before);expect(actor.items).toHaveLength(1);expect(actor.items[0].system.description.value).toContain('DC99');
    if(record.伤害?.length)expect(activities(actor.items[0]).some(activity=>activity.damage?.parts?.length)).toBe(true);
  });

  test('external structured fields are projected locally before reaching the typed generator', () => {
    const records=[{...gmSave(),gmTriggeredSave:{...gmSave().gmTriggeredSave,ability:'luck'}},{...spellRecords(),spellUseRecords:[{name:'Unmapped count',max:Infinity,period:'day'}]},{...nativeSave(),nativeFailureStatuses:['unknown']},{...nativeSave(),执行模式:undefined}];
    for(const record of records){const actor=generate(parse(record));expect(actor.items).toHaveLength(1);expect(actor.items[0].system.description.value).toContain('DC99');}
  });
});

describe('literal flat features retain fields and keep prose out of legacy inference', () => {
  test('keeps explicit save fields, effects, resource and targets while restoring prose only for display', () => {
    const record = {
      名称: '显式能力 [99/Day]', literalName: true, literalMechanics: true, 类型: 'save', 描述: prose,
      DC: 17, 属性: 'wis', dcSourceKind: 'literal', saveOutcome: 'half', 激活: 'bonus',
      使用次数: { max: 3, period: 'day' }, 范围: '60尺', 目标: { 数量: 2, 类型: 'creature', 特殊: 'AI指定目标' },
      伤害: [{ 公式: '3d6+2', 类型: 'cold', 关系: 'base' }],
      内嵌效果: [{ 类型: 'prone', 描述: prose }], 失败效果: [{ 描述: '另一句99d6火焰伤害，程序不能从中新增操作。' }],
    };
    const action = parse(record), before = structuredClone(action), actor = generate(action), item = actor.items[0], all = activities(item);
    expect(action.sourceRuleFacts).toEqual([]); expect(action).toEqual(before);
    expect(item.name).toBe(record.名称); expect(item.system.uses).toMatchObject({ max: '3', recovery: [{ period: 'day', type: 'recoverAll' }] });
    expect(all).toHaveLength(1); expect(all[0]).toMatchObject({ type: 'save', save: { ability: ['wis'], dc: { formula: '17' } }, damage: { onSave: 'half' }, activation: { type: 'bonus' } });
    expect(all[0].damage.parts).toHaveLength(1); expect(all[0].target.affects).toMatchObject({ count: 2, type: 'creature', special: 'AI指定目标' });
    expect(item.effects.map((effect: any) => effect.statuses)).toEqual([['prone']]); expect(item.effects[0].description).toContain(prose);
    expect(item.flags.fvttJsonGenerator.conditionLifecycle).toBeUndefined();
    expect(item.system.description.value).toContain('99d6'); expect(all[0].description.chatFlavor).toContain('99d6');
    expect(item.flags.fvttJsonGenerator.literalMechanics.description).toBe(prose);
  });

  test('keeps recharge and explicit damage without inventing effects from the full rule', () => {
    const action = parse({ 名称: '显式爆发', literalMechanics: true, 类型: 'damage', 描述: '命中后目标中毒，99d6火焰伤害。', 充能: '5-6', 伤害: [{ 公式: '2d8', 类型: 'cold' }] });
    const item = generate(action).items[0];
    expect(item.effects).toEqual([]); expect(activities(item)).toHaveLength(1);
    expect(item.system.uses).toEqual({ spent: 0, max: '1', recovery: [{ period: 'recharge', type: 'recoverAll', formula: '5' }] });
    expect(activities(item)[0].consumption.targets).toMatchObject([{ type: 'itemUses', value: '1' }]);
  });

  test('conditional and replacement damage remain separate explicit GM rolls without spending the primary resource', () => {
    const action = parse({ 名称: '条件攻击', literalMechanics: true, 类型: 'attack', 描述: prose, 攻击类型: 'mwak', 命中: 19, 范围: '触及10尺',
      使用次数: { max: 3, period: 'day' }, 伤害: [
        { 公式: '2d8+4', 类型: 'cold', 关系: 'base' },
        { 公式: '3d6', 类型: 'fire', 关系: 'conditional', 条件: '目标在AI选择的条件下' },
        { 公式: '4d8', 类型: 'force', 关系: 'replacement', 条件: 'AI选择替代' },
      ] });
    const item = generate(action).items[0], all = activities(item);
    expect(all.map(activity => activity.type)).toEqual(['attack', 'damage', 'damage']);
    expect(all[0].damage.parts).toHaveLength(1); expect(all[0].consumption.targets).toHaveLength(1);
    expect(all.slice(1).every(activity => activity.consumption.targets.length === 0 && activity.effects.length === 0)).toBe(true);
    expect(all.slice(1).map(activity => activity.activation.condition)).toEqual(['目标在AI选择的条件下', 'AI选择替代']);
    expect(all.slice(1).map(activity => activity.flags.fvttJsonGenerator.literalDamage.part)).toEqual(action.sourceDamageParts!.slice(1));
    expect(item.flags.fvttJsonGenerator.literalMechanics.sourceDamageParts).toEqual(action.sourceDamageParts);
  });

  test('a conditional-only damage feature keeps its timing carrier and actual Damage button', () => {
    const action = parse({ 名称: '条件灵光', literalMechanics: true, 类型: 'damage', 描述: prose,
      伤害: [{ 公式: '3d8', 类型: 'fire', 关系: 'conditional', 条件: '回合开始时' }] });
    const item = generate(action).items[0];
    expect(activities(item).map(activity=>activity.type)).toEqual(['utility','damage']);
    expect(activities(item)[0].damage).toBeUndefined();
    expect(activities(item)[1]).toMatchObject({activation:{type:'special',condition:'回合开始时'},damage:{parts:[{number:3,denomination:8,types:['fire']}]}});
    expect(activities(item)[1].consumption.targets).toEqual([]);
  });

  test('retains a linked spell rule-reader identity and the complete visible rule', () => {
    const action = parse({ 名称: '施法', literalMechanics: true, 类型: 'utility', 描述: prose, spellcastingFeatureKey: 'test-spells', 激活: 'action' });
    // The direct generator requires a manifest for links, so inspect the parser
    // here; the existing frozen-chain test verifies the full linked manifest.
    expect(action.spellcastingFeatureKey).toBe('test-spells'); expect(action.describe).toBe(prose); expect(action.sourceRuleFacts).toEqual([]);
  });

  test('an optional marker cannot reject a real ability or change ordinary unmarked input', () => {
    expect(generate(parse({ 名称: '错误标记', literalMechanics: false, 类型: 'utility', 描述: '文字' })).items[0].system.description.value).toContain('文字');
    const ordinary = parse({ 名称: '普通能力', 类型: 'attack', 攻击类型: 'mwak', 命中: 5, 伤害: [{ 公式: '1d6+2', 类型: 'cold' }], 描述: '' });
    const first = generate(ordinary), second = generate(structuredClone(ordinary));
    const { _stats: firstStats, ...firstData } = first, { _stats: secondStats, ...secondData } = second;
    expect(firstData).toEqual(secondData);
    expect(first.items[0].flags.fvttJsonGenerator.literalMechanics).toBeUndefined();
  });
});
