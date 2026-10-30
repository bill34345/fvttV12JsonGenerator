import { expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { splitStagedMonsterSource, StagedExtractionError } from '../packages/intake-ai/src/staged-source';
import { assembleStagedFeature, assembleStagedMonsterIntake, validateStagedBaseFacts } from '../packages/intake-ai/src/staged-extraction';
import { sourceFeatureBasicOmissions, sourceOperationSelfArea, sourceOperationErrors } from '@fvtt-json-generator/models/source-operations';
import { makeWholeCategoryForm, decodeCategoryFormV2 } from '../packages/intake-ai/src/category-form-v2';
import { adaptCategoryFormV2, completeCategoryFormSpellcasting,inspectCategoryFormV2 } from '../packages/intake-ai/src/category-form-v2-adapter';
import { validateMonsterIntakeIR,auditMonsterIntakeSource } from '../packages/intake-ai/src/validator';
import type { V2Row } from '../packages/intake-ai/src/category-form-v2';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import pilot from './fixtures/forge-2024-pilot-frozen-boundaries.json';
import {stagedSpellcastingGroups} from '../packages/intake-ai/src/staged-spellcasting';

function fixture(body: string, crlf = false) {
  const header = 'Proof Beast\nMedium beast, unaligned\nArmor Class 14\nHit Points 30 (4d8 + 12)\nSpeed 30 ft.\nSTR DEX CON INT WIS CHA\n10 10 16 10 10 10\nChallenge 2\n';
  const source = (header + body + '\n').replace(/\n/gu, crlf ? '\r\n' : '\n');
  const plan = splitStagedMonsterSource({ source, sourceSha256: sha256(source), candidate: { id: 'proof', label: 'Proof Beast', start: 0, end: source.length, quote: source } });
  const base = validateStagedBaseFacts(plan, { schemaVersion: 1, creature: {
    identity: { name: 'Proof Beast', size: 'medium', creatureType: 'beast', alignment: 'unaligned' },
    abilities: { str: 10, dex: 10, con: 16, int: 10, wis: 10, cha: 10 },
    attributes: { ac: 14, hp: { value: 30, formula: '4d8 + 12' }, movement: { walk: 30 }, cr: 2 },
    saves: {}, skills: {}, defenses: { resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [] }, senses: {}, languages: { values: [] },
  }, uncertainties: [] });
  const request = makeWholeCategoryForm(plan);
  const form = yaml.load(String(request.payload.template)) as Record<string, any[]>;
  return { source, plan, base, request, form, reply: () => ({ markdown: yaml.dump(form, { lineWidth: -1 }) }) };
}
const attackFields = { 类型: '近战武器攻击', 命中加值: 4, 触及尺: 5, 射程尺: null, 远射程尺: null, 目标数量: 1, 目标限制: 'one creature' };
const damageFields = { 公式: '1d6+2', 伤害类型: '穿刺', 生效条件: null, 倍率: 1, 成功时倍率: null };
const knife = 'Actions\nNeedle. Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) piercing damage.';
function filledKnife(crlf = false) {
  const data = fixture(knife, crlf);
  Object.assign(data.form.动作![0]!, { 攻击: structuredClone(attackFields), 伤害: [structuredClone(damageFields)] });
  return data;
}
function adapt(data: ReturnType<typeof fixture>) { return adaptCategoryFormV2(data.plan, data.base, decodeCategoryFormV2(data.reply(), data.plan)); }
function expectSourceRejection(plan:ReturnType<typeof splitStagedMonsterSource>,build:()=>unknown[]){
  let values:any[];
  try{values=build();}catch(error){expect(error).toBeInstanceOf(StagedExtractionError);return;}
  const findings=values.flatMap((value,index)=>value.facts?.sourceOperations?sourceOperationErrors(plan.features[index]!.quote,value.facts.sourceOperations,
    (plan.features[index]!.contextIds??[]).map(id=>plan.units.find(unit=>unit.id===id)!.quote)):[]);
  expect(findings).not.toEqual([]);
}
function assemble(data: ReturnType<typeof fixture>) {
  const values = adapt(data);
  const ir = assembleStagedMonsterIntake(data.plan, data.base, values);
  for (const [index, unit] of data.plan.features.entries()) {
    const feature = assembleStagedFeature(data.plan, unit, values[index], 'Proof Beast');
    expect(sourceFeatureBasicOmissions(unit.quote.trim(), feature)).toEqual([]);
  }
  return ir;
}

test('BW request retains every feature, original base, quotes and complete shared context without answers', () => {
  const data = fixture('Traits\nWatchful. The beast remains alert.\nActions\nDash. The beast moves up to its Speed.');
  expect(data.request.payload.baseContext).toBe(data.plan.base.quote);
  expect((data.request.payload.units as any[]).map(unit => unit.quote)).toEqual(data.plan.features.map(unit => unit.quote));
  expect(data.request.payload.units).toEqual(data.request.payload.sourceInventory);
  expect(data.request.prompt).toContain('不要添加逐项原文引文、proof');
  expect(data.request.prompt).toContain('共享资源');
  expect(Object.values(data.form).flat().every(row => row.攻击 === null && row.伤害.length === 0)).toBe(true);
});

test('filled attack enters the actual staged assemblers with exact source proof and target', () => {
  for (const crlf of [false, true]) {
    const data = filledKnife(crlf), before = JSON.stringify(data.plan);
    const ir = assemble(data), feature = ir.creature.actions![0]!;
    expect(feature.sourceOperations?.[0]!.attack).toEqual({ type: 'mwak', toHit: 4, reach: 5 });
    expect(feature.sourceOperations?.[0]!.damage?.[0]).toEqual({ formula: '1d6+2', type: 'piercing', relationship: 'base' });
    expect(feature.sourceOperations?.[0]!.targetSpecial).toBe('one creature');
    expect(feature.description).toBe(data.plan.features[0]!.quote.trim());
    expect(JSON.stringify(data.plan)).toBe(before);
    expect(data.source).toBe(data.plan.source);
  }
});

test('changed to-hit, damage, target count, omitted creature restriction and missing roll fail', () => {
  for (const mutate of [
    (row: any) => { row.攻击.命中加值 = 9; },
    (row: any) => { row.伤害[0].公式 = '9d6'; },
    (row: any) => { row.攻击.目标数量 = 2; },
    (row: any) => { row.攻击.目标限制 = null; },
    (row: any) => { row.伤害 = []; },
    (row: any) => { row.攻击 = null; },
  ]) {
    const data = filledKnife(); mutate(data.form.动作![0]);
    expect(() => assemble(data)).toThrow();
  }
});

test('unclassified Attack retains a neutral contract and cannot be guessed into a weapon attack', () => {
  const data = fixture(knife.replace('Melee Weapon Attack', 'Melee Attack'));
  Object.assign(data.form.动作![0]!, { 攻击: { ...attackFields, 类型: '近战攻击' }, 伤害: [damageFields] });
  expect(assemble(data).creature.actions![0]!.sourceOperations![0]!.attack!.type).toBe('melee');
  data.form.动作![0]!.攻击.类型 = '近战武器攻击';
  expect(() => adapt(data)).toThrow('V2_ATTACK_CLASSIFICATION_CONFLICT');
  data.form.动作![0]!.攻击.类型='近战攻击';
  const op=assemble(data).creature.actions![0]!.sourceOperations![0]!;
  expect(sourceOperationErrors(data.plan.features[0]!.quote.trim(),[{...op,attack:{...op.attack!,type:'mwak'}}])).toContain('0/attack/type-or-bonus');
  expect(sourceOperationErrors(data.plan.features[0]!.quote.trim(),[{...op,aoe:{shape:'sphere',radius:10}}])).toContain('0/attack/neutral-combination');
});

test('source-bound outgoing half retains both branches and rejects wrong actor, factor, direction or missing metadata',()=>{
  const source='Actions\nShred. Melee Attack Roll: +10, reach 0 ft. Hit: 49 (10d8 + 4) slashing damage, or half as much damage if the beast is Bloodied, and the target is Grappled (escape DC 18).';
  const data=fixture(source),row=data.form.动作![0]!;
  Object.assign(row,{攻击:{...attackFields,类型:'近战攻击',命中加值:10,触及尺:0,目标限制:null},伤害:[
    {公式:'10d8+4',伤害类型:'slashing',生效条件:'自身未处于Bloodied时',倍率:1,成功时倍率:null},
    {公式:'10d8+4',伤害类型:'slashing',生效条件:'自身处于Bloodied时',倍率:0.5,成功时倍率:null},
  ]});
  const ir=assemble(data),op=ir.creature.actions![0]!.sourceOperations![0]!;
  expect(op.attack).toEqual({type:'melee',toHit:10,reach:0});expect(op.damage).toEqual([{formula:'10d8+4',type:'slashing',relationship:'base'}]);
  expect(op.damageAdjustment).toMatchObject({multiplier:0.5,actor:'the beast'});
  const original=structuredClone(row);
  for(const mutate of [
    (r:any)=>{r.伤害[1].生效条件='目标处于Bloodied时';},(r:any)=>{r.伤害[1].生效条件='the beast is not Bloodied';},
    (r:any)=>{r.伤害[1].倍率=0.25;},(r:any)=>{r.伤害[1].公式='5d8+2';},(r:any)=>{r.伤害.pop();},
    (r:any)=>{r.特殊规则='其受到的该攻击伤害减半';},(r:any)=>{r.伤害[0].生效条件=null;},
  ]){Object.assign(row,structuredClone(original));mutate(row);expectSourceRejection(data.plan,()=>adapt(data));}
  const removed=structuredClone(op);delete removed.damageAdjustment;
  expect(sourceOperationErrors(data.plan.features[0]!.quote.trim(),[removed])).toContain('0/damage-adjustment/omitted');
  for(const sourceText of [null,{},1]){
    const corrupt={...op,sourceText};expect(()=>sourceOperationErrors(data.plan.features[0]!.quote.trim(),[corrupt])).not.toThrow();
    expect(sourceOperationErrors(data.plan.features[0]!.quote.trim(),[corrupt]).length).toBeGreaterThan(0);
  }
  const other=structuredClone(ir);other.creature.identity.name='Other Sentinel';
  const preserved=new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null}).generate(new YamlParser().parse(renderMonsterIntakeMarkdown(other)));
  expect(preserved.items).toHaveLength(1);expect(auditMonsterIntakeSource(data.source,other).blocking.some(f=>f.path==='/creature/identity/name')).toBe(true);
});

test('conditional damage before a Save remains an independent GM roll, not Save damage', () => {
  const data = fixture('Charge. If the beast moves at least 20 feet straight toward a target and then hits it with a needle attack on the same turn, the target takes an extra 7 (2d6) slashing damage. If the target is a creature, it must succeed on a DC 13 Strength saving throw or be knocked prone.\nActions\n' + knife.slice('Actions\n'.length));
  const charge = data.form.特性![0]!;
  Object.assign(charge, { 豁免: { DC: 13, 属性: ['str'], 成功结果: '不被击倒', 目标限制: '被攻击命中的生物目标' },
    伤害: [{ 公式: '2d6', 伤害类型: '挥砍', 生效条件: '同一回合内直线移动至少20尺并用needle攻击命中目标', 倍率: 1, 成功时倍率: null }],
    距离: [{ 用途: '触发冲锋的直线移动', 尺: 20, 条件: '至少20尺，直线向目标移动' }],
    特殊规则: '同一回合移动20尺并命中时造成额外2d6伤害；若目标是生物，须进行DC 13力量豁免，否则被击倒。' });
  Object.assign(data.form.动作![0]!, { 攻击: attackFields, 伤害: [damageFields] });
  const ir = assemble(data), ops = ir.creature.traits![0]!.sourceOperations!;
  expect(ops.map(op => [op.type, op.relationship])).toEqual([['damage', 'follow-up'], ['save', 'follow-up']]);
  expect(ops[0]!.damage?.[0]!.relationship).toBe('conditional');
  expect(ops[1]!.damage).toBeUndefined();
  expect(ir.creature.traits![0]!.manualRemainder).toContain('at least 20 feet straight');
});

test('scalar ability normalization is narrow, recorded, applies to child operations and does not mutate reply', () => {
  const data = fixture('Actions\nPulse. Each creature must make a DC 12 Wisdom saving throw.');
  const row = data.form.动作![0]!;
  row.豁免 = { DC: 12, 属性: 'wis', 成功结果: '不受影响', 目标限制: '每个生物' };
  row.其他操作 = [{ 名称: 'Later', 条件: 'later', 攻击: null, 豁免: { ...row.豁免, 属性: 'str' }, 范围: null, 伤害: [], 特殊规则: null }];
  const reply = data.reply(), before = JSON.stringify(reply), result = decodeCategoryFormV2(reply, data.plan);
  expect(result.normalizations.map(item => item.kind)).toEqual(['single-save-ability', 'single-save-ability']);
  expect(result.rows[0]!.豁免!.属性).toEqual(['wis']);
  expect(result.rows[0]!.其他操作[0]!.豁免!.属性).toEqual(['str']);
  expect(JSON.stringify(reply)).toBe(before);
  for (const wrong of ['strength', 'dex,wis', '', 12]) {
    row.豁免.属性 = wrong;
    expect(() => decodeCategoryFormV2(data.reply(), data.plan)).toThrow('V2_SAVE');
  }
});

test('strict envelope, duplicate/missing identities, unknown fields and YAML aliases are rejected', () => {
  for (const change of [
    (data: ReturnType<typeof fixture>) => { data.form.动作![0]!.编号 = 'another'; },
    (data: ReturnType<typeof fixture>) => { data.form.动作!.push(data.form.动作![0]!); },
    (data: ReturnType<typeof fixture>) => { data.form.动作 = []; },
    (data: ReturnType<typeof fixture>) => { data.form.动作![0]!.FoundryJSON = {}; },
  ]) {
    const data = filledKnife(); change(data);
    expect(() => decodeCategoryFormV2(data.reply(), data.plan)).toThrow();
  }
  const data = filledKnife();
  expect(() => decodeCategoryFormV2({ ...data.reply(), proof: 'invented' }, data.plan)).toThrow('V2_SHAPE');
  expect(() => decodeCategoryFormV2({ markdown: data.reply().markdown + '\n动作: []' }, data.plan)).toThrow('V2_YAML');
  expect(() => decodeCategoryFormV2({ markdown: '动作: &list [*list]' }, data.plan)).toThrow('V2_ALIAS');
  expect(decodeCategoryFormV2(JSON.stringify(data.reply()), data.plan).rows).toHaveLength(1);
  expect(() => decodeCategoryFormV2('{"markdown":"动作: []","markdown":"动作: []"}', data.plan)).toThrow('V2_JSON');
});

test('save damage, AoE, range and success half survive while incorrect DC/multiplier/target fail', () => {
  const data = fixture('Actions\nPulse. Each creature in a 30-foot cone must make a DC 12 Wisdom saving throw. A creature takes 7 (2d6) psychic damage on a failed save, or half as much damage on a successful one.');
  Object.assign(data.form.动作![0]!, { 豁免: { DC: 12, 属性: ['wis'], 成功结果: '伤害减半', 目标限制: '30尺锥形内每个生物' },
    范围: { 形状: '锥形', 大小尺: 30, 距离尺: null, 中心: null },
    伤害: [{ 公式: '2d6', 伤害类型: '心灵', 生效条件: '豁免失败', 倍率: 1, 成功时倍率: 0.5 }] });
  const ir = assemble(data), op = ir.creature.actions![0]!.sourceOperations![0]!;
  expect(op.save).toEqual({ dc: 12, abilities: ['wis'], choice: 'single', outcome: 'half' });
  expect(op.aoe).toEqual({ shape: 'cone', radius: 30 });
  const original = structuredClone(data.form);
  for (const change of [
    (row: any) => { row.豁免.DC = 18; },
    (row: any) => { row.伤害[0].成功时倍率 = 1; },
    (row: any) => { row.豁免.目标限制 = '一个生物'; },
    (row: any) => { row.范围.大小尺 = 60; },
  ]) {
    Object.assign(data.form, structuredClone(original)); change(data.form.动作![0]); expect(() => assemble(data)).toThrow();
  }
});

test('manual source rules and valid passive counters retain full prose without creating executable rolls', () => {
  const data = fixture('Traits\nSteadfast (3/Day). If the beast fails a saving throw, it can choose to succeed instead.');
  Object.assign(data.form.特性![0]!, { 使用次数: 3, 恢复方式: '每日', 特殊规则: '若豁免失败则可选择成功' });
  const ir = assemble(data), feature = ir.creature.traits![0]!;
  expect(feature.uses).toEqual({ max: 3, period: 'day' });
  expect(feature.description).toContain('If the beast fails a saving throw');
  expect(feature.sourceOperations).toBeUndefined();
  data.form.特性![0]!.使用次数 = 9;
  expect(() => adapt(data)).toThrow('V2_USE_COUNT_CONFLICT');
});

test('dynamic healing and unsupported nonunit multiplier cannot be silently converted', () => {
  const data = filledKnife();
  data.form.动作![0]!.治疗 = [{ 公式: null, 取值依据: '等于实际伤害', 类型: '治疗', 目标: '自身', 生效条件: null }];
  expect(() => adapt(data)).toThrow('V2_HEALING_SOURCE_RELATION_UNSUPPORTED');
  data.form.动作![0]!.治疗 = []; data.form.动作![0]!.伤害[0].倍率 = 0.5;
  expect(() => adapt(data)).toThrow('V2_DAMAGE_MULTIPLIER_UNSUPPORTED');
});

test('compound attack target alternatives retain the full slot and reject a missing alternative', () => {
  const data=fixture(knife.replace('one creature.', 'one willing creature, or a creature that is grappled by the beast, incapacitated, or restrained.'));
  Object.assign(data.form.动作![0]!,{攻击:{...attackFields,目标限制:'一个自愿生物，或被该野兽擒抱、失能或束缚的生物'},伤害:[damageFields]});
  expect(assemble(data).creature.actions![0]!.sourceOperations![0]!.targetSpecial).toBe('one willing creature, or a creature that is grappled by the beast, incapacitated, or restrained');
  data.form.动作![0]!.攻击.目标限制='一个自愿生物，或被该野兽擒抱、失能的生物';
  expect(()=>adapt(data)).toThrow('V2_TARGET_CONFLICT');
  data.form.动作![0]!.攻击.目标限制='一个自愿且被该野兽擒抱、失能、束缚的生物';
  expect(()=>adapt(data)).toThrow('V2_TARGET_CONFLICT');
});

test('forcing each-creature Save accepts half-damage wording and source-proven zero Self placement',()=>{
  const data=fixture('Actions\nCloud. Clouds of stinging gas hiss from the beast, forcing each creature within 10 feet of it to make a DC 12 Wisdom saving throw. A creature takes 7 (2d6) psychic damage on a failed save, or half as much damage on a successful one.');
  Object.assign(data.form.动作![0]!,{豁免:{DC:12,属性:['wis'],成功结果:'半伤害',目标限制:'周围10尺内每个生物'},范围:{形状:'半径',大小尺:10,距离尺:0,中心:'自身'},伤害:[{公式:'2d6',伤害类型:'psychic',生效条件:'failed save',倍率:1,成功时倍率:0.5}]});
  const op=(adapt(data)[0] as any).facts.sourceOperations[0];
  expect(op.save.outcome).toBe('half');expect(op.range).toBeUndefined();expect(op.aoe).toEqual({shape:'radius',radius:10});
  const original=structuredClone(data.form);
  for(const restriction of [null,'一个生物','每个物件']){
    Object.assign(data.form,structuredClone(original));data.form.动作![0]!.豁免.目标限制=restriction;
    expect(()=>adapt(data)).toThrow();
  }
  const remote=fixture('Actions\nCloud. Each creature in a 10-foot radius sphere within 60 feet must make a DC 12 Wisdom saving throw. A creature takes 7 (2d6) psychic damage on a failed save, or half as much damage on a successful one.');
  Object.assign(remote.form.动作![0]!,{...original.动作![0],编号:remote.form.动作![0]!.编号,名称:remote.form.动作![0]!.名称,范围:{形状:'球体',大小尺:10,距离尺:0,中心:null}});
  expect(()=>adapt(remote)).toThrow('V2_SOURCE_BINDING');
  const foreign=fixture(data.source.slice(data.source.indexOf('Actions')).replace('from the beast,','from the beast statue,'));
  Object.assign(foreign.form.动作![0]!,{...structuredClone(original.动作![0]),编号:foreign.form.动作![0]!.编号});
  expect(()=>adapt(foreign)).toThrow('V2_SOURCE_BINDING');
});

test('a Save target introduced by the named owner remains bound to its original clause',()=>{
  const data=fixture('Actions\nCharm. The beast targets one humanoid it can see within 30 feet of it. If the target can see the beast, the target must succeed on a DC 12 Wisdom saving throw or be charmed for 1 minute.');
  Object.assign(data.form.动作![0]!,{豁免:{DC:12,属性:['wis'],成功结果:'不受影响',目标限制:'30尺内其能看见的一个类人生物'},距离:[{用途:'选择目标',尺:30,条件:null}]});
  const op=(adapt(data)[0] as any).facts.sourceOperations[0];
  expect(op.targetSpecial).toBe('one humanoid it can see within 30 feet of it');
  expect(op.proof.target).toContain('The beast targets');expect(op.proof.save).toContain('If the target can see');
  for(const restriction of [null,'一个生物','一个类人生物']){
    data.form.动作![0]!.豁免.目标限制=restriction;expect(()=>adapt(data)).toThrow();
  }
  for(const body of [
    'The beast targets one humanoid it can see within 30 feet of it. A door opens. If the target can see the beast, the target must succeed on a DC 12 Wisdom saving throw or be charmed for 1 minute.',
    'The beast targets one humanoid it can see within 30 feet of it. If the target can see the statue, the target must succeed on a DC 12 Wisdom saving throw or be charmed for 1 minute.',
  ]){
    const other=fixture('Actions\nCharm. '+body);
    Object.assign(other.form.动作![0]!,{豁免:{DC:12,属性:['wis'],成功结果:'不受影响',目标限制:'30尺内其能看见的一个类人生物'},距离:[{用途:'选择目标',尺:30,条件:null}]});
    expectSourceRejection(other.plan,()=>adapt(other));
  }
});

test('a set quantifier in the same operation cannot erase null, one-target or different eligibility',()=>{
  const data=fixture('Actions\nGate. Any creature grappled by the beast must make a DC 12 Wisdom saving throw.');
  const row=data.form.动作![0]!;
  Object.assign(row,{豁免:{DC:12,属性:['wis'],成功结果:'不受影响',目标限制:'被其擒抱的生物'},特殊规则:'任何被其擒抱的生物须进行豁免。'});
  expect((adapt(data)[0] as any).facts.sourceOperations[0].targetSpecial).toBe('Any creature grappled by the beast');
  for(const restriction of [null,'一个被其擒抱的生物','被束缚的生物']){
    row.豁免.目标限制=restriction;expect(()=>adapt(data)).toThrow();
  }
  row.豁免.目标限制='被其擒抱的生物';
  for(const text of ['任何未被擒抱的生物不受影响。被其擒抱的生物须进行豁免。','任何被其擒抱的生物不须进行豁免。','任何被束缚的生物须进行豁免。']){
    row.特殊规则=text;expect(()=>adapt(data)).toThrow('V2_TARGET_CONFLICT');
  }
});

test('batch diagnostics expose another feature omission without accepting a partial IR',()=>{
  const data=fixture(knife.replace('Melee Weapon Attack','Melee Attack')+'\nClaw. Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) piercing damage.');
  Object.assign(data.form.动作![0]!,{攻击:{...attackFields,类型:'近战武器攻击'},伤害:[structuredClone(damageFields)]});
  Object.assign(data.form.动作![1]!,{攻击:{...attackFields,目标限制:null},伤害:[structuredClone(damageFields)]});
  try{adapt(data);throw new Error('must fail');}catch(error){
    expect(error).toMatchObject({code:'V2_ATTACK_CLASSIFICATION_CONFLICT',related:[{code:'V2_TARGET_OMITTED',path:expect.any(String)}]});
  }
});

test('source identity cannot be bypassed by mutating already decoded rows', () => {
  const data = filledKnife(), decoded = decodeCategoryFormV2(data.reply(), data.plan);
  (decoded.rows[0] as V2Row).source = 'not the current source';
  expect(() => adaptCategoryFormV2(data.plan, data.base, decoded)).toThrow('V2_SOURCE_IDENTITY');
});

test('one fixed healing follows the established exact source target and rejects an incorrect amount', () => {
  const data = fixture('Actions\nRestore. You regain 5 Hit Points.');
  data.form.动作![0]!.治疗 = [{ 公式: '5', 取值依据: null, 类型: '治疗', 目标: '自身', 生效条件: null }];
  const ir = assemble(data);
  expect(ir.creature.actions![0]!.healing).toEqual({ formula: '5', type: 'healing', target: { type: 'self', count: 1, special: 'You' } });
  data.form.动作![0]!.治疗[0].公式 = '9';
  expect(() => adapt(data)).toThrow('V2_HEALING_CONFLICT');
});

test('source spell groups are reused and all supplied spells, attributes and daily counts are checked', () => {
  const data = fixture('Traits\nSpellcasting. Its spellcasting ability is Intelligence (spell save DC 14). It can cast the following spells:\nAt will: light, mage hand\n1/day each: shield');
  data.form.特性![0]!.施法 = { 属性: 'int', 豁免DC: 14, 命中加值: null, 无需材料: null,
    法术: [{ 名称: 'light', 次数: null, 恢复: null, 限制: null }, { 名称: 'mage hand', 次数: null, 恢复: null, 限制: null }, { 名称: 'shield', 次数: 1, 恢复: '每天', 限制: null }] };
  const ir = assembleStagedMonsterIntake(data.plan, data.base, adapt(data));
  expect(ir.creature.spellcasting?.[0]?.ability).toBe('int');
  expect(ir.creature.spellcasting?.[0]?.usageGroups.flatMap(group => group.spellRefs.map(spell => spell.originalName))).toEqual(['light', 'mage hand', 'shield']);
  for (const mutate of [
    (spell: any) => { spell.属性 = 'wis'; },
    (spell: any) => { spell.法术[0].名称 = 'fireball'; },
    (spell: any) => { spell.法术[2].次数 = 3; },
  ]) {
    const original = structuredClone(data.form.特性![0]!.施法); mutate(data.form.特性![0]!.施法);
    expect(() => adapt(data)).toThrow(); data.form.特性![0]!.施法 = original;
  }
});

test('legendary shared budget and per-option costs use the complete shared preamble', () => {
  const data = fixture('Legendary Actions\nThe beast can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature\'s turn. The beast regains spent legendary actions at the start of its turn.\nDetect. The beast makes a Wisdom (Perception) check.\nMove (Costs 2 Actions). The beast moves up to its Speed.');
  for (const [index, row] of data.form.传奇动作!.entries()) Object.assign(row, {
    传奇动作消耗: index ? 2 : 1, 特殊规则: index ? '移动至多等于其速度' : '进行一次感知检定',
    共享资源: { 名称: '传奇动作', 上限: 3, 恢复: '在其回合开始时恢复', 限制: '同一时间只能使用一个选项，在另一个生物回合结束时使用' },
  });
  const ir = assembleStagedMonsterIntake(data.plan, data.base, adapt(data));
  expect(ir.creature.legendary?.max).toBe(3);
  expect(ir.creature.legendaryActions?.[1]?.legendaryCost).toBe(2);
  expect((data.request.payload.units as any[]).every(unit => unit.context.some((quote: string) => quote.includes('can take 3 legendary actions')))).toBe(true);
  data.form.传奇动作![0]!.共享资源.上限 = 9;
  expect(() => adapt(data)).toThrow('V2_LEGENDARY_BUDGET_CONFLICT');
});

test('plain failed-save status retains the established exact source-derived Save consumer', () => {
  const data = fixture('Actions\nFear. Each creature must succeed on a DC 12 Wisdom saving throw or be frightened.');
  data.form.动作![0]!.豁免 = { DC: 12, 属性: ['wis'], 成功结果: '不恐惧', 目标限制: '每个生物' };
  const ir = assemble(data);
  expect(ir.creature.actions![0]!.nativeFailureStatuses).toEqual(['frightened']);
});

test('single-face recharge uses the same established source parser and rejects a different face', () => {
  const data = fixture(knife.replace('Needle.', 'Needle (Recharge 6).'));
  Object.assign(data.form.动作![0]!, { 攻击: attackFields, 伤害: [damageFields], 恢复方式: 'Recharge 6' });
  expect(assemble(data).creature.actions![0]!.recharge).toEqual([6, 6]);
  data.form.动作![0]!.恢复方式 = 'Recharge 5';
  expect(() => adapt(data)).toThrow('V2_RECHARGE_CONFLICT');
});

test('prepared spell slots remain one source-owned pool and restricted grant rows retain the existing manual boundary', () => {
  const data = fixture('Traits\nSpellcasting. Its spellcasting ability is Intelligence (spell save DC 14). It casts the following spells:\nCantrips (at will): light\n1st level (4 slots): shield\nAt will: fly (self only)');
  data.form.特性![0]!.施法 = { 属性: 'int', 豁免DC: 14, 命中加值: null, 无需材料: null,
    法术: [{ 名称: 'light', 次数: null, 恢复: null, 限制: null }, { 名称: 'shield', 次数: null, 恢复: null, 限制: null }, { 名称: 'fly', 次数: null, 恢复: null, 限制: '仅限自身' }] };
  const ir = assembleStagedMonsterIntake(data.plan, data.base, adapt(data)), group = ir.creature.spellcasting![0]!;
  expect(group.usageGroups.map(usage => usage.usage)).toEqual(['prepared-cantrip', 'prepared-slots']);
  expect(group.usageGroups[1]).toMatchObject({ usage: 'prepared-slots', level: 1, slots: 4 });
  expect(group.manualGrants?.[0]!.quote).toBe('At will: fly (self only)');
  expect(group.usageGroups.flatMap(usage => usage.spellRefs.map(spell => spell.originalName))).toEqual(['light', 'shield']);
  data.form.特性![0]!.施法.法术[2].限制 = null;
  expect(() => adapt(data)).toThrow('V2_SPELLCASTING_RESTRICTION_CONFLICT');
});

test('source spell-attack bonus is bound before child inheritance and retained by BW completion', () => {
  const data = fixture('Traits\nSpellcasting. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). It can cast the following spells:\nAt will: fire bolt');
  data.form.特性![0]!.施法 = { 属性: 'int', 豁免DC: 14, 命中加值: 6, 无需材料: null, 法术: [{ 名称: 'fire bolt', 次数: null, 恢复: null, 限制: null }] };
  const decoded = decodeCategoryFormV2(data.reply(), data.plan);
  const initial = assembleStagedMonsterIntake(data.plan, data.base, adaptCategoryFormV2(data.plan, data.base, decoded));
  const completed = completeCategoryFormSpellcasting(data.plan, initial, decoded);
  expect(initial.creature.spellcasting![0]!.attackBonus).toBe(6);
  expect(completed.creature.spellcasting![0]!.attackBonus).toBe(6);
  expect(completed.creature.spellcasting![0]!.attackBonusEvidence![0]!.quote).toContain('+6 to hit with spell attacks');
  expect(validateMonsterIntakeIR(data.source, completed).blocking).toEqual([]);
  data.form.特性![0]!.施法.命中加值 = 9;
  expect(() => adapt(data)).toThrow('V2_SPELLCASTING_ATTACK_BONUS_CONFLICT');
});

test('an Actor-centred radius retains native Self proof and never becomes a movable distance', () => {
  const data = fixture('Actions\nWing Pulse. Each creature within 15 feet of the beast must succeed on a DC 12 Dexterity saving throw or take 7 (2d6) bludgeoning damage and be knocked prone.');
  Object.assign(data.form.动作![0]!, { 豁免: { DC: 12, 属性: ['dex'], 成功结果: '不受伤害且不被击倒', 目标限制: 'beast周围15尺内每个生物' },
    范围: { 形状: '半径', 大小尺: 15, 距离尺: null, 中心: 'beast' },
    伤害: [{ 公式: '2d6', 伤害类型: '钝击', 生效条件: '豁免失败', 倍率: 1, 成功时倍率: 0 }] });
  const values = adapt(data) as any[], op = values[0].facts.sourceOperations[0];
  expect(op.aoe).toEqual({ shape: 'radius', radius: 15 });
  expect(op.range).toBeUndefined();
  expect(sourceOperationSelfArea(data.plan.features[0]!.quote, op, 'Proof Beast')).toBe(true);
});

test('ordinary explicitly shared daily resources bind all named members to one source-owned pool', () => {
  const data = fixture('Traits\nAlpha (2/Day). Alpha and Beta share 2 daily uses. The beast remains alert.\nBeta (2/Day). The beast changes its stance.');
  for (const [index, row] of data.form.特性!.entries()) Object.assign(row, { 使用次数: 2, 恢复方式: '每天', 特殊规则: '保持该能力的原文规则',
    共享资源: index ? null : { 名称: 'Alpha and Beta', 上限: 2, 恢复: '每天', 限制: null } });
  const ir = assembleStagedMonsterIntake(data.plan, data.base, adapt(data));
  expect(ir.creature.sourceResourcePools).toHaveLength(1);
  expect(ir.creature.sourceResourcePools![0]).toMatchObject({ max: 2, period: 'day' });
  expect(ir.creature.sourceResourcePools![0]!.members.map(member => member.cost)).toEqual([1, 1]);
  data.form.特性![0]!.共享资源.上限 = 9;
  expect(() => assembleStagedMonsterIntake(data.plan, data.base, adapt(data))).toThrow();
});

test('fixed recovery outside native timing remains exact GM prose without a fabricated Heal activity', () => {
  const data = fixture('Traits\nRecovery. If the beast has 0 hit points, it cannot move. After spending 1 hour in its resting place with 0 hit points, it regains 1 hit point.');
  Object.assign(data.form.特性![0]!, { 治疗: [{ 公式: '1', 取值依据: null, 类型: '治疗', 目标: '自身', 生效条件: '在安息处停留1小时且生命值为0' }],
    特殊规则: '0生命值时无法移动，在安息处停留1小时后恢复1生命值。' });
  const ir = assemble(data), feature = ir.creature.traits![0]!;
  expect(feature.executionMode).toBe('gm-manual');
  expect(feature.healing).toBeUndefined();
  expect(feature.sourceOperations).toBeUndefined();
  expect(feature.description).toBe(data.plan.features[0]!.quote.trim());
  data.form.特性![0]!.治疗[0].公式 = '9';
  expect(() => adapt(data)).toThrow('V2_SOURCE_BINDING');
});

function frozenPilot(id:string){
 const entry=pilot.cases.find(item=>item.id===id)!;
 expect(sha256(entry.source)).toBe(entry.sourceSha256);expect(sha256(entry.baseReply)).toBe(entry.baseReplySha256);
 if(entry.wholeReply)expect(sha256(entry.wholeReply)).toBe(entry.wholeReplySha256);
 const plan=splitStagedMonsterSource({source:entry.source,sourceSha256:entry.sourceSha256,candidate:{id,label:id,start:0,end:entry.source.length,quote:entry.source}});
 const base=validateStagedBaseFacts(plan,JSON.parse(entry.baseReply));
 return{entry,plan,base,decode:(mutate?:(rows:V2Row[])=>void)=>{
  const decoded=decodeCategoryFormV2(JSON.parse(entry.wholeReply!),plan);mutate?.(decoded.rows);return decoded;
 }};
}

test('frozen 2024 Mage accepts Gear boundary and native Common plus full language choice without dropping source',()=>{
 const {entry,base}=frozenPilot('P2');
 expect(base.creature.skills).toEqual({arcana:6,history:6,perception:4});
 expect(base.creature.languages).toEqual({values:['common'],custom:'plus three other languages'});
 for(const label of ['Gear','Equipment','装备','携带物品']){
  const source=entry.source.replace('Gear Wand',label+' Wand');
  const plan=splitStagedMonsterSource({source,sourceSha256:sha256(source),candidate:{id:'mage',label:'Mage',start:0,end:source.length,quote:source}});
  expect(validateStagedBaseFacts(plan,JSON.parse(entry.baseReply)).creature.skills).toEqual(base.creature.skills);
  for(const change of [(raw:any)=>{raw.creature.skills.perception=1},(raw:any)=>{raw.creature.languages.values=[]},(raw:any)=>{raw.creature.languages.custom='plus two other languages'}]){
   const raw=JSON.parse(entry.baseReply);change(raw);expect(()=>validateStagedBaseFacts(plan,raw)).toThrow('BASE_STATIC_CONFLICT');
  }
 }
});

test('unchanged frozen 2024 Dragon assembles complete source and reuses one base3/lair4 ledger',async()=>{
 const {entry,plan,base,decode}=frozenPilot('P3'),decoded=decode();
 const ir=completeCategoryFormSpellcasting(plan,assembleStagedMonsterIntake(plan,base,adaptCategoryFormV2(plan,base,decoded),{sourceProvenSelfArea:true}),decoded);
 const markdown=renderMonsterIntakeMarkdown(ir),parsed=new YamlParser().parse(markdown);
 const actor=await new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(parsed) as any;
 expect(actor.system.resources.legact).toEqual({max:3,spent:0});expect(actor.system.resources.legres).toEqual({max:3,spent:0});
 expect(actor.system.resources.lair).toMatchObject({value:true,inside:false});
 const resistance=actor.items.find((item:any)=>item.name.startsWith('Legendary Resistance'));
 expect(resistance.system.uses?.max??'').not.toBe('3');
 const gas=ir.creature.legendaryActions!.find(item=>item.name==='Noxious Miasma')!;
 expect(gas.sourceOperations![0]).toMatchObject({save:{dc:17,abilities:['con'],outcome:'none'},aoe:{shape:'sphere',radius:20},range:90,damage:[{formula:'2d6',type:'poison'}]});
 expect(gas.description).toContain('target takes a -2 penalty to AC');expect(gas.description).toContain('start of its\nnext turn');
 expect(ir.creature.spellcasting![0]!.ability).toBe('cha');
 expect(ir.creature.spellcasting![0]!.description).toBe(plan.features.find(unit=>unit.name==='Spellcasting')!.quote);
 expect(markdown).toContain('Geas');expect(entry.source).toContain('4/Day in Lair');
});

test('conditional source counts, spell cadences, area recipients and placement remain strict',()=>{
 const {plan,base,decode}=frozenPilot('P3');
 const cases:Array<[string,(rows:V2Row[])=>void]>=[
 ['base count',rows=>{rows.find(r=>r.名称.startsWith('Legendary Resistance'))!.使用次数=4}],
 ['lair count',rows=>{rows.find(r=>r.名称.startsWith('Legendary Resistance'))!.恢复方式='每天（巢穴内每天5次）'}],
 ['recovery',rows=>{rows.find(r=>r.名称.startsWith('Legendary Resistance'))!.恢复方式='短休'}],
 ['at-will changed daily',rows=>{rows.find(r=>r.施法)!.施法!.法术[0]!.恢复='每天'}],
 ['spell level',rows=>{rows.find(r=>r.施法)!.施法!.法术[1]!.限制='2环版本'}],
 ['missing Geas',rows=>{rows.find(r=>r.施法)!.施法!.法术.pop()}],
 ['visible creatures',rows=>{rows.find(r=>r.名称==='Noxious Miasma')!.豁免!.目标限制='该球体范围内龙能看见的每个生物'}],
 ['one creature',rows=>{rows.find(r=>r.名称==='Noxious Miasma')!.豁免!.目标限制='该球体范围内的一个生物'}],
 ['invisible point',rows=>{rows.find(r=>r.名称==='Noxious Miasma')!.范围!.中心='龙看不见的90尺内一点'}],
 ['missing point',rows=>{rows.find(r=>r.名称==='Noxious Miasma')!.范围!.中心=null}],
 ['wrong range',rows=>{rows.find(r=>r.名称==='Noxious Miasma')!.范围!.距离尺=60}],
 ['wrong area',rows=>{rows.find(r=>r.名称==='Noxious Miasma')!.范围!.大小尺=90}],
 ];
 for(const [label,mutate] of cases)expectSourceRejection(plan,()=>adaptCategoryFormV2(plan,base,decode(mutate)));
});

test('wrapped known spell introduction is metadata but unknown introductory restrictions remain manual',()=>{
 const {plan}=frozenPilot('P3'),groups=[...stagedSpellcastingGroups(plan).values()];
 expect(groups[0]!.manualGrants).toBeUndefined();
 expect(groups[0]!.usageGroups.flatMap(g=>g.spellRefs.map(ref=>ref.originalName))).toEqual(['Detect Magic','Mind Spike','Geas']);
 expect(groups[0]!.usageGroups[0]!.spellRefs[1]!.restrictions[0]!.text).toBe('(level 3 version)');
 const source=plan.source.replace('Charisma as the spellcasting ability (spell save DC 17):','Charisma as the spellcasting ability (spell save DC 17). It can only target willing creatures:');
 const changed=splitStagedMonsterSource({source,sourceSha256:sha256(source),candidate:{id:'dragon',label:'Dragon',start:0,end:source.length,quote:source}});
 expect([...stagedSpellcastingGroups(changed).values()][0]!.manualGrants!.some(ref=>ref.quote.includes('only target willing'))).toBe(true);
});

test('visible area placement accepts complete literal recipient and rejects role-swapped center facts',()=>{
 const {plan,base,decode}=frozenPilot('P3');
 const full=decode(rows=>{rows.find(r=>r.名称==='Noxious Miasma')!.豁免!.目标限制='each creature in a 20-foot-radius Sphere centered on a point the dragon can see within 90 feet'});
 expect(()=>adaptCategoryFormV2(plan,base,full)).not.toThrow();
 for(const center of ['龙能看见的20尺内一点','a point the target can see within 90 feet']){
  expect(()=>adaptCategoryFormV2(plan,base,decode(rows=>{rows.find(r=>r.名称==='Noxious Miasma')!.范围!.中心=center}))).toThrow('V2_AREA_CENTER_CONFLICT');
 }
});

test('frozen Mage daily Casts retain whole source and one parent quota, with strict spell identity and cadence',()=>{
 const {entry,plan,base}=frozenPilot('P2'),decode=()=>decodeCategoryFormV2(JSON.parse(entry.continuationWholeReply!),plan);
 expect(sha256(entry.continuationWholeReply!)).toBe(entry.continuationWholeReplySha256!);
 const selected=()=>{const value=decode();return{value,rows:value.rows.filter(row=>row.编号==='unit-6'||row.编号==='unit-8')}};
 const original=selected();
 // Independent inspection does not accept the still incorrect Arcane Burst.
 const inspected=inspectCategoryFormV2(plan,base,original.value);
 expect(inspected.filter(item=>item.error).map(item=>item.error!.code)).toEqual(['V2_ATTACK_MODE_CONFLICT']);
 for(const id of ['unit-6','unit-8']){
  const proposed=inspected.find(item=>item.unitId===id)!.proposal as any;
  expect(proposed.mode).toBe('manual');expect(proposed.facts).toMatchObject({uses:{max:3,period:'day'}});
  const group=stagedSpellcastingGroups(plan).get(id)!;
  expect(group.description).toBe(plan.features.find(unit=>unit.id===id)!.quote);
  expect(group.usageGroups[0]).toMatchObject({usage:id==='unit-6'?'daily-each':'daily-shared',count:3});
  expect(group.usageGroups[0]!.spellRefs.map(ref=>ref.originalName)).toEqual(id==='unit-6'?['Misty Step']:['Counterspell','Shield']);
  if(id==='unit-8')expect(group.usageGroups[0]!.spellRefs.every(ref=>ref.restrictions[0]?.text==='in response to the spell’s trigger')).toBe(true);
 }
 for(const mutate of [(row:V2Row)=>{row.施法!.属性='cha'},(row:V2Row)=>{row.施法!.法术[0]!.名称='Fireball'},
  (row:V2Row)=>{row.施法!.法术[0]!.次数=4},(row:V2Row)=>{row.施法!.法术[0]!.恢复='every 2 days'},
  (row:V2Row)=>{row.恢复方式='每2天'},(row:V2Row)=>{row.施法!.无需材料=true}]){
  const {value,rows}=selected();mutate(rows[0]!);expect(inspectCategoryFormV2(plan,base,value).find(item=>item.unitId==='unit-6')!.error).toBeDefined();
 }
});

test('frozen Mage correction preserves both neutral modes and rejects missing, simultaneous or guessed categories',()=>{
 const {entry,plan,base}=frozenPilot('P2');
 expect(sha256(entry.correctionWholeReply!)).toBe(entry.correctionWholeReplySha256!);
 const decoded=decodeCategoryFormV2(JSON.parse(entry.correctionWholeReply!),plan),values=adaptCategoryFormV2(plan,base,decoded);
 const ir=assembleStagedMonsterIntake(plan,base,values,{sourceProvenSelfArea:true});
 const burst=ir.creature.actions.find(item=>item.name==='Arcane Burst')!,ops=burst.sourceOperations!,source=burst.description;
 expect(ops.map(op=>op.attack)).toEqual([{type:'melee',toHit:6,reach:5},{type:'ranged',toHit:6,range:120}]);
 expect(ops[1]!.relationship).toBe('alternative');expect(sourceOperationErrors(source,ops)).toEqual([]);
 for(const mutate of [(v:any[])=>{v.pop()},(v:any[])=>{v[1].relationship='follow-up'},(v:any[])=>{v[1].attack.type='rwak'},
  (v:any[])=>{v[1].attack.range=5},(v:any[])=>{v[0].attack.range=120},(v:any[])=>{v[1].damage[0].formula='4d8+3'}]){
  const invalid=structuredClone(ops);mutate(invalid);expect(sourceOperationErrors(source,invalid).length).toBeGreaterThan(0);
 }
});
