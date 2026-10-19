import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { OpenAICompatibleMonsterIntakeProvider } from '../packages/intake-ai/src/provider';
import { assembleStagedFeature, assembleStagedMonsterIntake, validateStagedBaseFacts, validateStagedBaseIntake, runStagedMonsterExtraction,
  type StagedBaseFactsResponse, type StagedExtractionMetadata, type StagedExtractionOptions } from '../packages/intake-ai/src/staged-extraction';
import { splitStagedMonsterSource, stagedSourceBiography } from '../packages/intake-ai/src/staged-source';
import { stagedSpellcastingGroups } from '../packages/intake-ai/src/staged-spellcasting';
import { stagedFeatureMechanics } from '../packages/intake-ai/src/staged-feature-mechanics';
import type { MonsterIntakeIR } from '../packages/intake-ai/src/types';
import { validateMonsterIntakeIR } from '../packages/intake-ai/src/validator';
import companyRecorded from './fixtures/forge-company-pdf-recorded-base.json';

describe('independent Chinese riders and Save introductions',()=>{
  for(const [name,extra,rider]of [
    ['灰爪Ash Claw','外加3（1d6）寒冷伤害','如果目标为小型生物，则目标被推离5尺。'],
    ['铜翼Copper Wing','额外加上7（2d6）雷鸣伤害','若目标为中型或更小体型，则目标陷入倒地状态。'],
    ['长尾Long Tail','外加5（1d10）强酸伤害','如果目标为大型或更小体型的生物，则目标被拉入其空间并陷入受擒状态。'],
  ]as const)test('a complete damage sentence precedes a separate non-damage condition: '+name,()=>{
    const text=name+'。近战攻击检定：+5，触及10尺。命中：7（1d8+3）挥砍伤害'+extra+'。'+rider;
    const result=stagedFeatureMechanics(text,name);
    expect(result?.facts.damage).toHaveLength(2);expect(result?.manualRemainder).toContain(rider);
  });
  for(const suffix of ['，如果目标倒地。','。如果目标倒地。','。如果目标为不死生物，则造成上述伤害。','。若目标被束缚，则目标受到额外伤害。'])test('an incomplete or damage-qualified condition is not independent: '+suffix,()=>{
    const result=stagedFeatureMechanics('Claw。近战攻击检定：+5，触及5尺。命中：7（1d8+3）挥砍伤害外加3（1d6）寒冷伤害'+suffix,'Claw');
    expect(result?.facts.damage).toHaveLength(1);
  });
  for(const [name,ability,dc]of [['抛掷Fling','敏捷',25],['拽回Recall','力量',14],['位移Displace','魅力',18]]as const)test('an introductory movement sentence retains a separately usable Save: '+name,()=>{
    const result=stagedFeatureMechanics(name+'。该生物移动一名受其擒抱的目标至30尺内可见的一处地点。'+ability+'豁免检定：DC'+dc+'，目标区域内的每名生物。失败：7（2d6）钝击伤害，且目标倒地。成功：仅半伤。',name);
    expect(result?.facts.activityType).toBe('save');expect(result?.facts.save?.dc).toBe(dc);expect(result?.facts.save?.outcome).toBe('half');
    expect(result?.facts.range).toBeUndefined();expect(result?.facts.aoe).toBeUndefined();expect(result?.manualRemainder).toContain('30尺');
  });
  for(const text of [
    '若目标进入区域，则进行以下检定。敏捷豁免检定：DC15，目标。失败：7（2d6）火焰伤害。成功：仅半伤。',
    '目标可以选择力量或敏捷豁免检定：DC15。失败：7（2d6）火焰伤害。成功：仅半伤。',
    '敏捷豁免检定：DC15。体质豁免检定：DC16。失败：7（2d6）火焰伤害。成功：仅半伤。',
  ])test('conditional, choice and multiple Saves remain unguessed: '+text,()=>{expect(stagedFeatureMechanics('Gate。'+text,'Gate')).toBeUndefined();});
});

describe('new PDF source primary operations',()=>{
  const features=splitStagedMonsterSource({source:companyRecorded.source,sourceSha256:sha256(companyRecorded.source),candidate:{id:'pdf-company',label:'Mezzoloth Company',start:0,end:companyRecorded.source.length,quote:companyRecorded.source}}).features;
  const derive=(part:string)=>{const f=features.find(f=>f.name?.startsWith(part))!;return stagedFeatureMechanics(f.quote,f.name!,'Mezzoloth Company');};
  test('modern attack retains reach zero and base damage while bloodied/grapple riders remain visible',()=>{
    const result=derive('Spindly Shred');
    expect(result?.facts.attack).toEqual({type:'mwak',toHit:10,reach:0});
    expect(result?.facts.damage).toEqual([{formula:'10d8+4',type:'slashing',relationship:'base'}]);
    expect(result?.manualRemainder).toContain('Bloodied');expect(result?.manualRemainder).toContain('escape DC 18');
  });
  test('sphere save retains both damage parts and successful-save non-damage rider',()=>{
    const result=derive('Weaverot Volley');
    expect(result?.facts.save).toMatchObject({ability:'dex',dc:18,outcome:'none'});
    expect(result?.facts.aoe).toEqual({shape:'sphere',radius:15});expect(result?.facts.range).toBe(60);
    expect(result?.facts.damage).toEqual([{formula:'4d6',type:'piercing',relationship:'base'},{formula:'2d10',type:'necrotic',relationship:'additional'}]);
    expect(result?.manualRemainder).toContain('SUCCESS OR FAILURE');expect(result?.manualRemainder).toContain('Level 2 or below');
  });
  test('gas is a self-centered area, and a previous teleport distance never becomes a Save range',()=>{
    const gas=derive('Toxic Emission'),gate=derive('Strike-Gate');
    expect(gas?.facts.aoe).toEqual({shape:'radius',radius:10});expect(gas?.facts.range).toBeUndefined();
    expect(gas?.facts.damage).toEqual([{formula:'4d8',type:'poison',relationship:'base'}]);expect(gas?.facts.save).toMatchObject({ability:'con',dc:17,outcome:'half'});
    expect(gate?.facts.save).toMatchObject({ability:'cha',dc:16});expect(gate?.facts.range).toBeUndefined();expect(gate?.manualRemainder).toContain('teleports with the company');
  });
  test('conditions after a sentence or comma cannot promote additional English damage',()=>{
    for(const delimiter of [', ','. ']){
      const parsed=stagedFeatureMechanics('Frost Claw. Melee Attack Roll: +6, reach 5 ft. Hit: 7 (1d8+3) slashing damage plus 3 (1d6) cold damage'+delimiter+'If the target is prone.','Frost Claw');
      expect(parsed?.facts.damage).toHaveLength(1);expect(parsed?.manualRemainder).toContain('plus 3 (1d6) cold damage');
    }
  });
  test('target-category qualifiers constrain the extra English damage without dropping the ordinary part',()=>{
    for(const operation of ['Melee Attack Roll: +6, reach 5 ft. Hit: 7 (1d8+3) slashing damage','Each creature within 30 feet must make a Constitution Saving Throw: DC 14. Failure: 7 (1d8+3) slashing damage']){
      const result=stagedFeatureMechanics('Frost. '+operation+' plus 3 (1d6) cold damage against undead.','Frost');
      expect(result?.facts.damage).toEqual([{formula:'1d8+3',type:'slashing',relationship:'base'}]);
      expect(result?.manualRemainder).toContain('plus 3 (1d6) cold damage against undead');
    }
    expect(stagedFeatureMechanics('Frost. Each creature within 30 feet must make a Constitution Saving Throw: DC 14. Failure: 3 (1d6) cold damage against undead.','Frost')?.facts.damage).toBeUndefined();
  });
  test('an unfamiliar explicit success result stays manual rather than becoming no damage',()=>{
    const result=stagedFeatureMechanics('Frost. Each creature within 30 feet must make a Constitution Saving Throw: DC 14. Failure: 7 (2d6) cold damage. Success: The creature takes 1 cold damage.','Frost');
    expect(result?.facts.save?.dc).toBe(14);expect(result?.facts.damage).toBeUndefined();expect(result?.manualRemainder).toContain('Success: The creature takes 1 cold damage.');
  });
  test('ally and target areas are never converted to an emanation from this Actor',()=>{
    for(const other of ['an ally','the target','an unknown statue']){
      const text='Cloud. Gas hisses from '+other+', forcing each creature within 10 feet of it to make a Constitution Saving Throw: DC 12. Failure: 3 (1d6) poison damage. Success: Half damage.';
      expect(stagedFeatureMechanics(text,'Cloud','Mezzoloth Company')?.facts.aoe).toBeUndefined();
    }
  });
});

const HEADER = `Sentinel CR 1
A patient stone guardian, exactly eight feet tall.
AC 15
HP 30 (4d8 + 12) Size Medium
Speed 30 ft. Type Construct
STR 14 DEX 10 CON 16 INT 3 WIS 10 CHA 1
`;
const SLAM = 'Slam. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d8 + 2) bludgeoning damage.';
const SOURCE = `${HEADER}Traits\nWatchful. The sentinel cannot be surprised while awake.\nActions\n${SLAM}\nEye Options. Choose one creature within 60 feet, then one of the following effects:\n1. First Ray. The target is pushed 10 feet.\n2. Second Ray. The target cannot speak until its next turn.\n\n## Referenced definitions from the same PDF\nSilent\nA Silent creature cannot speak, including verbal spell components.\n`;
const MARKDOWN = `# Sentinel\n${HEADER}\n### Traits\n\n***Watchful.*** The sentinel cannot be surprised while awake.\n\n### Actions\n\n***Slam.*** Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d8 + 2) bludgeoning damage.\n`;
const YAML = `---
name: Sentinel
size: Medium construct
str: 14
dex: 10
con: 16
int: 3
wis: 10
cha: 1
armor_class: "15"
hit_points: "30 (4d8 + 12)"
speed: "30 ft."
challenge: "1 (200 XP)"
---

***Watchful.*** The sentinel cannot be surprised while awake.

### Actions

***Slam.*** Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d8 + 2) bludgeoning damage.
`;

function request(source = SOURCE) {
  return { source, sourceSha256: sha256(source), candidate: { id: 'sentinel', label: 'Sentinel', start: 0, end: source.length, quote: source } };
}

describe('explicit CHM-style bold headings without a post-title space',()=>{
  test('Chinese title stops retain one complete rule and nested spell/resource clauses',()=>{
    const source=`${HEADER}###### 特质 Traits\n**魔法抗性Magic Resistance。**对抗魔法效应的豁免具有优势。\n###### 动作 Actions\n**多重攻击Multiattack。**发动三次攻击。\n **魂刃Soul Blade。**近战或远程攻击检定：+7，触及10尺或射程90尺。命中：9（1d8+5）挥砍伤害。如果目标降至0生命值，承受以下效应。\n体质豁免：DC16。失败：目标死亡。\n **施法Spellcasting。**使用感知作为施法属性。\n **随意：**易容术Disguise Self\n **每项1/日：**生物定位术Locate Creature\n###### 附赠动作 Bonus Actions\n**迷雾步Mist Walk。**施展一道法术。\n`;
    const plan=splitStagedMonsterSource(request(source));
    expect(plan.features.map(f=>f.name)).toEqual(['魔法抗性Magic Resistance','多重攻击Multiattack','魂刃Soul Blade','施法Spellcasting','迷雾步Mist Walk']);
    expect(plan.features[2]!.quote).toContain('如果目标降至0生命值');expect(plan.features[2]!.quote).toContain('体质豁免：DC16。失败：目标死亡。');
    expect(plan.features[3]!.quote).toContain('每项1/日');expect(plan.features[4]!.section).toBe('bonus');
    expect(plan.units.map(unit=>unit.quote).join('')).toBe(source);
  });
  test('an English stop inside a closed bold label also supplies an explicit boundary',()=>{
    const source=`${HEADER}Actions\n**魂刃Soul Blade.**近战攻击检定：+7。\n**静音Silence.**目标不能说话。\n`;
    expect(splitStagedMonsterSource(request(source)).features.map(f=>f.name)).toEqual(['魂刃Soul Blade','静音Silence']);
  });
  test('unmarked inline Chinese prose is not promoted to a titled mechanic',()=>{
    const source=`${HEADER}Actions\n这只是没有标题的机制说明。紧接着还有规则。\n**魂刃Soul Blade。**近战攻击检定：+7。\n`;
    expect(()=>splitStagedMonsterSource(request(source))).toThrow('UNLABELLED_MECHANICS');
  });
});

describe('Chinese CHM static header facts',()=>{
  test('a comma or sentence-delimited condition cannot make extra Chinese damage unconditional',()=>{
    for(const delimiter of ['，','。']){
      const parsed=stagedFeatureMechanics('**寒刃Cold Blade。**近战攻击检定：+6，触及5尺。命中：7（1d8+3）穿刺伤害，外加3（1d6）寒冷伤害'+delimiter+'若目标倒地。','寒刃Cold Blade');
      expect(parsed?.facts.damage).toHaveLength(1);expect(parsed?.manualRemainder).toContain('外加3（1d6）寒冷伤害');
    }
  });
  test('a shared spell grant before the first at-will grant never disappears',()=>{
    const recorded=JSON.parse(readFileSync(resolve(import.meta.dir,'fixtures/forge-vengeance-chm-recorded-base.json'),'utf8'));
    const source=recorded.source.replace(' **随意：**',' Shared 1/day: Alarm, Blur\n **随意：**');
    const groups=[...stagedSpellcastingGroups(splitStagedMonsterSource(request(source))).values()];
    expect(groups[0]!.usageGroups[0]).toMatchObject({usage:'daily-shared',count:1});
    expect(groups[0]!.usageGroups[0]!.spellRefs.map(ref=>ref.originalName)).toEqual(['Alarm','Blur']);
    expect(groups[0]!.usageGroups[1]!.usage).toBe('at-will');
  });
  test('an unqualified daily grant is exact for one spell but never silently becomes per-spell uses for several',()=>{
    const recorded=JSON.parse(readFileSync(resolve(import.meta.dir,'fixtures/forge-vengeance-chm-recorded-base.json'),'utf8'));
    for(const label of ['1/日','1/day']){
      const source=recorded.source.replace('**1/日：**',`**${label}：**`);
      const groups=[...stagedSpellcastingGroups(splitStagedMonsterSource(request(source))).values()];
      expect(groups).toHaveLength(1);expect(groups[0]).toMatchObject({ability:'int',saveDc:15});
      expect(groups[0]!.usageGroups.map(g=>[g.usage,g.spellRefs.length])).toEqual([['at-will',2],['1/day-each',1]]);
      const shared=source.replace('位面转移Plane Shift\n','位面转移Plane Shift，律令死亡Power Word Kill\n');
      const manual=[...stagedSpellcastingGroups(splitStagedMonsterSource(request(shared))).values()][0]!;
      expect(manual.usageGroups.map(group=>group.usage)).toEqual(['at-will']);
      expect(manual.manualGrants?.[0]?.quote).toContain('位面转移Plane Shift，律令死亡Power Word Kill');
    }
  });
  test('the actual Vengeance response preserves standalone 全部 and telepathy without accepting qualifiers or lost range',()=>{
    const recorded=JSON.parse(readFileSync(resolve(import.meta.dir,'fixtures/forge-vengeance-chm-recorded-base.json'),'utf8'));
    const plan=splitStagedMonsterSource(request(recorded.source));
    const ir=validateStagedBaseFacts(plan,structuredClone(recorded.baseResponse));
    expect(ir.creature.languages).toEqual({values:['all'],custom:'心灵感应120尺'});
    const literal=structuredClone(recorded.baseResponse);literal.creature.languages.values=['全部'];
    expect(validateStagedBaseFacts(plan,literal).creature.languages.values).toEqual(['all']);
    const lostRange=structuredClone(recorded.baseResponse);lostRange.creature.languages.custom='心灵感应';
    expect(()=>validateStagedBaseFacts(plan,lostRange)).toThrow('BASE_STATIC_CONFLICT');
    const qualified=recorded.source.replace('**语言**全部，','**语言**全部已知语言，');
    expect(()=>validateStagedBaseFacts(splitStagedMonsterSource(request(qualified)),structuredClone(recorded.baseResponse))).toThrow('BASE_STATIC_CONFLICT');
  });
  const header=`# 死亡天使 Angel of Death\n中型天族，中立\n**AC**19\t**先攻**+11（21）\n**HP**187（25d8+75）\n**速度**40尺，飞行40尺\n\t\t调整\t豁免\t\t\t\t调整\t豁免\t\t\t\t调整\t豁免\n**力量**\t22\t+6\t+6\t\t**敏捷**\t22\t+6\t+11\t\t**体质**\t17\t+3\t+3\n**智力**\t16\t+3\t+3\t\t**感知**\t20\t+5\t+10\t\t**魅力**\t15\t+2\t+2\n**技能**洞悉+10，察觉+10\n**抗性**钝击，穿刺，挥砍\n**免疫**暗蚀，光耀；力竭\n**感官**真实视觉120尺；被动察觉20\n**语言**所有语言；心灵感应120尺\n**CR**14（XP11500；PB+5）\n`;
  const facts:StagedBaseFactsResponse={schemaVersion:1,uncertainties:[],creature:{
    identity:{name:'死亡天使',englishName:'Angel of Death',size:'medium',creatureType:'celestial',alignment:'neutral'},
    abilities:{str:22,dex:22,con:17,int:16,wis:20,cha:15},
    attributes:{ac:19,hp:{value:187,formula:'25d8+75'},movement:{walk:40,fly:40},initiative:11,cr:14,xp:11500,proficiencyBonus:5},
    saves:{str:6,dex:11,con:3,int:3,wis:10,cha:2},skills:{insight:10,perception:10},
    defenses:{resistances:['bludgeoning','piercing','slashing'],immunities:['necrotic','radiant'],vulnerabilities:[],conditionImmunities:['exhaustion']},
    senses:{truesight:120,passivePerception:20},languages:{values:['all'],custom:'心灵感应120尺'}}};
  // Test-authored source facts, not a real provider response. The complete
  // original CHM page and first real workflow failure are retained separately.
  test('validates Chinese labels and MOD/SAVE cells without changing the source',()=>{
    const source=header+'###### 动作 Actions\n**多重攻击Multiattack。**发动三次攻击。\n';
    const plan=splitStagedMonsterSource(request(source));
    const ir=validateStagedBaseFacts(plan,facts);
    expect(ir.creature.attributes).toMatchObject(facts.creature.attributes);expect(ir.creature.saves).toEqual(facts.creature.saves);
    expect(ir.creature.defenses).toEqual(facts.creature.defenses);expect(ir.creature.languages).toEqual(facts.creature.languages);
    expect(plan.units.map(u=>u.quote).join('')).toBe(source);
  });
  test('a size adjective in the biography cannot become the creature type',()=>{
    const source=header.replace('中型天族，中立','它紧握巨型镰刀，并随身携带小型工具。\n中型天族，中立')+'Actions\nQuiet Watch. It watches.\n';
    const ir=validateStagedBaseFacts(splitStagedMonsterSource(request(source)),facts);
    expect(ir.creature.identity).toMatchObject({size:'medium',creatureType:'celestial'});
  });
});

describe('rest-recovery headings after an unpunctuated PDF paragraph',()=>{
  for(const qualifier of ['Recharges after a Short or Long Rest','Recharge after a Long Rest','Recharges after a Short Rest'])
    test(`preserves a complete new ability with ${qualifier}`,()=>{
      const source=`${HEADER}Actions\nQuiet Pulse. A creature is immune for the next 24 hours\nVeil Echo (${qualifier}). The sentinel creates three duplicates.\nA duplicate disappears when hit.\n${SLAM}\n`;
      const plan=splitStagedMonsterSource(request(source));
      expect(plan.features.map(f=>f.name)).toEqual(['Quiet Pulse',`Veil Echo (${qualifier})`,'Slam']);
      expect(plan.features[0]!.quote).not.toContain('Veil Echo');
      expect(plan.features[1]!.quote).toContain('A duplicate disappears when hit.');
      expect(plan.units.map(unit=>unit.quote).join('')).toBe(source);
    });
  test('does not guess a plain or unknown-qualified ability boundary',()=>{
    for(const label of ['Veil Echo','Veil Echo (While Awake)']){
      const source=`${HEADER}Actions\nQuiet Pulse. A creature is immune for the next 24 hours\n${label}. The sentinel creates three duplicates.\n`;
      expect(()=>splitStagedMonsterSource(request(source))).toThrow('UNKNOWN_ABILITY_BOUNDARY');
    }
  });
  test('an explicit grammatical continuation still belongs to the preceding ability',()=>{
    const source=`${HEADER}Actions\nQuiet Pulse. The sentinel combines its effect with\nVeil Echo (Recharges after a Long Rest). The duplicate moves with it.\n${SLAM}\n`;
    const plan=splitStagedMonsterSource(request(source));
    expect(plan.features.map(f=>f.name)).toEqual(['Quiet Pulse','Slam']);
    expect(plan.features[0]!.quote).toContain('Veil Echo (Recharges after a Long Rest).');
  });
  test('the untouched official Cloaker source preserves all eight full abilities',()=>{
    const fixture=JSON.parse(readFileSync('tests/fixtures/cloaker-srd51-boundary.json','utf8'));
    const plan=splitStagedMonsterSource(request(fixture.source));
    expect(plan.features.map(f=>f.name)).toEqual(['Damage Transfer','False Appearance','Light Sensitivity','Multiattack','Bite','Tail','Moan','Phantasms (Recharges after a Short or Long Rest)']);
    expect(plan.features.at(-1)!.quote).toContain('the duplicate disappears.');
    expect(plan.units.map(unit=>unit.quote).join('')).toBe(fixture.source);
  });
});
function baseIr(source: string): MonsterIntakeIR {
  const evidence = { start: 0, end: source.length, quote: source };
  const paths = ['/creature/identity/name', '/creature/identity/size', '/creature/identity/creatureType',
    '/creature/abilities', '/creature/attributes/ac', '/creature/attributes/hp', '/creature/attributes/movement', '/creature/attributes/cr'];
  if (/200 XP/u.test(source)) paths.push('/creature/attributes/xp');
  return { schemaVersion: 1, source: { sha256: sha256(source), length: source.length }, creature: {
    identity: { name: 'Sentinel', size: 'medium', creatureType: 'construct' },
    abilities: { str: 14, dex: 10, con: 16, int: 3, wis: 10, cha: 1 },
    attributes: { ac: 15, hp: { value: 30, formula: '4d8 + 12' }, movement: { walk: 30 }, cr: 1, ...(/200 XP/u.test(source) ? { xp: 200 } : {}) },
    saves: {}, skills: {}, defenses: { resistances: [], immunities: [], vulnerabilities: [], conditionImmunities: [] },
    senses: {}, languages: { values: [] }, traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [],
  }, claims: paths.map(path => ({ path, valueKind: 'explicit', confidence: 'high', evidence: [{ ...evidence }] })),
  coverage: [{ ...evidence, classification: 'mechanical', claimPaths: paths }], uncertainties: [] };
}
function baseFacts(ir: MonsterIntakeIR): StagedBaseFactsResponse {
  const { identity, abilities, attributes, saves, skills, defenses, senses, languages } = ir.creature;
  return { schemaVersion: 1, creature: structuredClone({ identity, abilities, attributes, saves, skills, defenses, senses, languages }), uncertainties: [] };
}
describe('AI-normalized spellcasting facts retain source ownership',()=>{
  for(const clause of ['施法属性：魅力','施法时使用魅力','以**魅力**作为其施法属性','Charisma is its spellcasting ability','其施法所依赖的属性为魅力']){
    test('the existing staged feature call can supply a correct source-bound profile: '+clause,async()=>{
      const source=`${HEADER}Traits\nSpellcasting. It casts the following spells. ${clause}.\nAt Will: Light\nActions\n${SLAM}\n`;
      const calls:string[]=[];
      const ir=await runStagedMonsterExtraction(request(source),async call=>{
        await call.onAttempt(1);calls.push(call.stage);
        return call.stage==='base'?baseFacts(baseIr(HEADER)):{schemaVersion:1,unitId:call.unitId,mode:'native',facts:{spellcastingAbility:{ability:'cha',quote:clause}}};
      },{baseMode:'facts',featureMode:'auto'});
      expect(ir.creature.spellcasting?.map(group=>group.ability)).toEqual(['cha']);
      expect(ir.creature.spellcasting![0]!.usageGroups[0]!.spellRefs.map(ref=>ref.originalName)).toEqual(['Light']);
      expect(ir.creature.actions[0]!.attack).toMatchObject({toHit:4,reach:5});
      expect(validateMonsterIntakeIR(source,ir).blocking).toEqual([]);
      expect(calls.filter(stage=>stage==='feature').length).toBe(clause==='以**魅力**作为其施法属性'?0:1);
    });
  }
  test.each([
    ['施法属性：智力','cha','施法属性：智力'],
    ['不以魅力作为其施法属性','cha','不以魅力作为其施法属性'],
    ['施法属性：魅力','cha','an invented quote'],
    ['Its spellcasting ability is unrelated to Charisma','cha','Its spellcasting ability is unrelated to Charisma'],
    ['其施法属性与魅力无关','cha','其施法属性与魅力无关'],
    ['其施法属性为魅力，仅在夜晚','cha','其施法属性为魅力'],
    ['Its spellcasting ability is Charisma, only at night','cha','Its spellcasting ability is Charisma'],
  ] as const)('an AI proposal cannot override a wrong or unbound source fact: %s',async(clause,ability,quote)=>{
    const source=`${HEADER}Traits\nSpellcasting. It casts the following spells. ${clause}.\nAt Will: Light\n`;
    await expect(runStagedMonsterExtraction(request(source),async call=>{
      await call.onAttempt(1);
      return call.stage==='base'?baseFacts(baseIr(HEADER)):{schemaVersion:1,unitId:call.unitId,mode:'native',facts:{spellcastingAbility:{ability,quote}}};
    },{baseMode:'facts',featureMode:'auto'})).rejects.toThrow();
  });
  test('source-only mode never starts the new AI profile stage',async()=>{
    const source=`${HEADER}Traits\nSpellcasting. It casts the following spells. 施法属性：魅力.\nAt Will: Light\n`;
    const calls:string[]=[];
    await expect(runStagedMonsterExtraction(request(source),async call=>{
      await call.onAttempt(1);calls.push(call.stage);return baseFacts(baseIr(HEADER));
    },{baseMode:'facts',featureMode:'source'})).rejects.toThrow('UNPROVEN_STAGED_SPELLCASTING_ABILITY');
    expect(calls).toEqual(['base']);
  });
});
function manual(unitId: string, facts: Record<string, unknown> = {}) { return { schemaVersion: 1, unitId, mode: 'manual', facts }; }
function native(unitId: string) { return { schemaVersion: 1, unitId, mode: 'native', facts: {
  activityType: 'attack', attack: { type: 'mwak', toHit: 4, reach: 5 },
  damage: [{ formula: '1d8 + 2', type: 'bludgeoning', relationship: 'base' }],
} }; }

type Captured = { prompt: string; payload: Record<string, any> };
function provider(options: { onRequest?: (request: Captured, index: number) => unknown; onStage?: (value: StagedExtractionMetadata) => void; signal?: AbortSignal;
  evidence?: Array<any>; requests?: Captured[]; staged?: boolean; baseMode?: StagedExtractionOptions['baseMode']; featureMode?: StagedExtractionOptions['featureMode'] } = {}) {
  let index = 0;
  return new OpenAICompatibleMonsterIntakeProvider({ authMode: 'api-key', apiKey: 'fake-private-key', baseUrl: 'https://provider.example/v1', model: 'fake', reviewModel: 'fake',
    timeoutMs: 1_000, repairTimeoutMs: 1_000,
    ...(options.staged === false ? {} : { stagedExtraction: { onStage: options.onStage, signal: options.signal, baseMode: options.baseMode, featureMode: options.featureMode } }),
    responseEvidence: { record: evidence => { options.evidence?.push(evidence); } },
    httpClient: async (_url, init) => {
      const body = JSON.parse(init.body);
      const captured = { prompt: body.messages[0].content, payload: JSON.parse(body.messages[1].content) };
      options.requests?.push(captured);
      const custom = options.onRequest?.(captured, index++);
      const output = custom ?? (captured.payload.unitId ? manual(captured.payload.unitId)
        : options.baseMode === 'facts' ? baseFacts(baseIr(captured.payload.source)) : baseIr(captured.payload.source));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: typeof output === 'string' ? output : JSON.stringify(output) } }] }) };
    } });
}

describe('staged monster source ownership', () => {
  for (const [name, source] of [['PDF text', SOURCE], ['Markdown', MARKDOWN], ['front matter', YAML]] as const) {
    test(`${name}: exact partition, complete ability and explicit text destinations`, () => {
      const plan = splitStagedMonsterSource(request(source));
      expect(plan.units.map(unit => unit.quote).join('')).toBe(source);
      expect(plan.units.every(unit => source.slice(unit.start, unit.end) === unit.quote)).toBeTrue();
      expect(plan.features.map(unit => unit.name)).toContain('Slam');
      const values = plan.features.map(unit => unit.quote.replace(/[*_]/gu,'').replace(/\s+/gu,' ').includes(SLAM)?native(unit.id):manual(unit.id));
      const ir = assembleStagedMonsterIntake(plan, baseIr(plan.base.quote), values);
      expect(ir.creature.traits[0]?.executionMode).toBe('gm-manual');
      expect(ir.creature.actions[0]?.description.replace(/[*_]/gu, '')).toContain(SLAM);
      expect(ir.coverage.map(entry => entry.quote).join('')).toBe(source);
      expect(validateMonsterIntakeIR(source, ir).blocking).toEqual([]);
    });
  }
  test('numbered children remain inside the complete parent, and references/lore/dimensions reach biography', () => {
    const plan = splitStagedMonsterSource(request());
    const parent = plan.features.find(unit => unit.name === 'Eye Options')!;
    expect(parent.quote).toContain('Choose one creature within 60 feet');
    expect(parent.quote).toContain('1. First Ray.');
    expect(parent.quote).toContain('2. Second Ray.');
    expect(plan.features).toHaveLength(3);
    expect(stagedSourceBiography(plan)).toContain('exactly eight feet tall');
    expect(stagedSourceBiography(plan)).toContain('including verbal spell components');
    expect(parent.contextIds?.length).toBeGreaterThan(0);
  });
  test('PDF title-like line continuations never become separate abilities', () => {
    const source = `${HEADER}Traits\nWatchful. The sentinel is alert.\nActions\nMultiattack. It can replace an attack with Steal Passion, or\nErase Deeds.\nSlam. The target is Grappled. A creature\nGrappled (escape DC 14).\nSteal Passion (Concentration). A creature fails by 5 or more and the effect continues\nwithout Concentration.\nThe creature cannot take\nBonus Actions or Reactions.\nThe creature has Disadvantage on a test that uses\nStrength or Charisma.\nA target must make a Saving Throw:\nDC 12.\nBonus Actions\nShred. One target takes damage, or half if wearing\nHeavy Armor.\nDeath Glare. The target drops to 0\nHit Points.\n`;
    const plan = splitStagedMonsterSource(request(source));
    expect(plan.features.map(unit => unit.name)).toEqual(['Watchful', 'Multiattack', 'Slam', 'Steal Passion (Concentration)', 'Shred', 'Death Glare']);
    expect(plan.features[3]!.quote).toContain('Bonus Actions or Reactions.');
    expect(plan.features[4]!.quote).toContain('Heavy Armor.');
  });
  test('a clear plain trait after the static table needs no Traits heading', () => {
    const source = `${HEADER}Magic Resistance. The sentinel has advantage on saving throws against spells.\nActions\n${SLAM}\n`;
    const plan = splitStagedMonsterSource(request(source));
    expect(plan.features.map(unit => [unit.name, unit.section])).toEqual([['Magic Resistance', 'trait'], ['Slam', 'action']]);
    expect(plan.base.quote).toBe(HEADER);
  });
  test('common bold stat labels remain supported and language words are not mistaken for traits', () => {
    const source = SOURCE.replace('AC 15', '**Armor Class** 15').replace('HP 30', '**Hit Points** 30').replace('Speed 30', '**Speed** 30');
    const plan = splitStagedMonsterSource(request(source));
    expect(plan.features.map(unit => unit.name)).toEqual(['Watchful', 'Slam', 'Eye Options']);
    expect(() => validateStagedBaseIntake(plan, baseIr(plan.base.quote))).not.toThrow();
    const language = SOURCE.replace('Traits\n', 'Languages Common.\nTraits\n');
    expect(splitStagedMonsterSource(request(language)).features).toHaveLength(3);
  });
  test('CRLF and candidate offsets remain exact without model position calculations', () => {
    const fragment = MARKDOWN.replace(/\n/gu, '\r\n');
    const source = `before\n${fragment}\nafter`;
    const req = { ...request(source), candidate: { id: 's', label: 'Sentinel', start: 7, end: 7 + fragment.length, quote: fragment } };
    const plan = splitStagedMonsterSource(req);
    const ir = assembleStagedMonsterIntake(plan, baseIr(plan.base.quote), plan.features.map(unit => unit.quote.replace(/[*_]/gu,'').replace(/\s+/gu,' ').includes(SLAM)?native(unit.id):manual(unit.id)));
    expect(ir.source).toEqual({ sha256: sha256(source), length: source.length });
    expect(ir.claims[0]!.evidence[0]!.start).toBe(7);
    expect(ir.coverage.map(entry => entry.quote).join('')).toBe(fragment);
    expect(validateMonsterIntakeIR(source, ir, { coverageRange: { start: req.candidate.start, end: req.candidate.end } }).blocking).toEqual([]);
  });
  for (const [name, source] of [
    ['unknown section', SOURCE.replace('Actions\n', '### Lair Operations\n')],
    ['unlabelled mechanics', SOURCE.replace(SLAM, 'The sentinel makes a weapon attack.')],
    ['second monster', SOURCE + '\nAnother Guard CR 1\nAC 19\nHP 20\n'],
  ] as const) test(`rejects ${name} instead of silently assigning an ability boundary`, () => {
    expect(() => splitStagedMonsterSource(request(source))).toThrow('Staged extraction rejected');
  });
  test('tampered source graph and removed saved ability fail assembly', () => {
    const plan = splitStagedMonsterSource(request());
    expect(() => assembleStagedMonsterIntake(plan, baseIr(plan.base.quote), [manual(plan.features[0]!.id)])).toThrow('FEATURE_INVENTORY');
    plan.units[1]!.quote += 'hidden';
    expect(() => assembleStagedMonsterIntake(plan, baseIr(plan.base.quote), [])).toThrow('SOURCE_PARTITION');
  });
});

describe('staged step verification', () => {
  test('real provider path calls base first, then complete features, retains response sink and safe metadata', async () => {
    const requests: Captured[] = [], stages: StagedExtractionMetadata[] = [], evidence: any[] = [];
    const result = await provider({ requests, evidence, onStage: event => { stages.push(event); } }).extract(request());
    expect(requests).toHaveLength(4);
    expect(requests[0]!.payload.source).toBe(HEADER);
    expect(requests[0]!.prompt).toContain('BASE stage');
    expect(requests.slice(1).map(entry => entry.payload.name)).toEqual(['Watchful', 'Slam', 'Eye Options']);
    expect(requests[3]!.payload.source).toContain('2. Second Ray.');
    expect(requests[3]!.prompt).not.toContain('set start and end to -1');
    expect(result.creature.actions).toHaveLength(2);
    expect(stages.at(-1)).toMatchObject({ stage: 'assembly', status: 'validated', plannedCalls: 4, retryCalls: 0 });
    expect(JSON.stringify(stages)).not.toContain('fake-private-key');
    expect(JSON.stringify(stages)).not.toContain('guardian');
    expect(evidence).toHaveLength(4);
    expect(evidence.every(entry => entry.stage === 'extract' && !entry.truncated)).toBeTrue();
    expect(new Set(evidence.map(entry => entry.requestHash)).size).toBe(4);
  });
  for (const [name, mutate] of [
    ['AC', (ir: MonsterIntakeIR) => { ir.creature.attributes.ac = 16; }],
    ['HP', (ir: MonsterIntakeIR) => { ir.creature.attributes.hp.value = 31; }],
    ['HP dice', (ir: MonsterIntakeIR) => { ir.creature.attributes.hp.formula = '4d8+13'; }],
    ['ability score', (ir: MonsterIntakeIR) => { ir.creature.abilities.str = 15; }],
    ['speed', (ir: MonsterIntakeIR) => { ir.creature.attributes.movement.walk = 40; }],
    ['invented speed', (ir: MonsterIntakeIR) => { ir.creature.attributes.movement.fly = 30; }],
    ['base feature', (ir: MonsterIntakeIR) => { ir.creature.actions.push({ name: 'Wrong', description: 'wrong' }); }],
    ['forbidden metadata', (ir: MonsterIntakeIR) => { (ir.creature as any).legendary = { max: 0 }; }],
  ] as const) test(`base ${name} error makes zero subsequent feature calls`, async () => {
    const requests: Captured[] = [];
    const engine = provider({ requests, onRequest: captured => { const ir = baseIr(captured.payload.source); mutate(ir); return ir; } });
    await expect(engine.extract(request())).rejects.toThrow('Staged extraction rejected');
    expect(requests).toHaveLength(1);
  });
  test('native plain attack is verified; complex or altered native facts are rejected', () => {
    const plan = splitStagedMonsterSource(request());
    const slam = plan.features.find(unit => unit.name === 'Slam')!;
    expect(assembleStagedFeature(plan, slam, native(slam.id))).toMatchObject({ activityType: 'attack', damage: [{ formula: '1d8+2' }] });
    const wrong = native(slam.id); wrong.facts.attack.toHit = 5;
    expect(() => assembleStagedFeature(plan, slam, wrong)).toThrow('FEATURE_FACT_CONFLICT');
    const complex = plan.features.find(unit => unit.name === 'Eye Options')!;
    expect(() => assembleStagedFeature(plan, complex, native(complex.id))).toThrow('UNSUPPORTED_NATIVE_FEATURE');
  });
  test('manual mode refuses proposed native effects, unsupported resources and activation changes', () => {
    const plan = splitStagedMonsterSource(request());
    const slam = plan.features.find(unit => unit.name === 'Slam')!;
    for (const facts of [{ damage: [{ formula: '1d8+2' }] }, { uses: { max: 1, period: 'day' } }, { activationType: 'bonus' }, { legendaryCost: 2 }, { attack: { toHit: 4 } }]) {
      expect(() => assembleStagedFeature(plan, slam, manual(slam.id, facts))).toThrow('Staged extraction rejected');
    }
    const feature = assembleStagedFeature(plan, slam, manual(slam.id));
    expect(feature).toMatchObject({ executionMode: 'gm-manual', activationType: 'action' });
    expect(feature.uses).toBeUndefined(); expect(feature.recharge).toBeUndefined(); expect(feature.damage).toBeUndefined();
  });
  test('source-explicit safe resources are preserved and wrong values never become success', () => {
    const source = SOURCE.replace('Eye Options.', 'Eye Options (Recharge 5-6, Costs 2 Actions).');
    const plan = splitStagedMonsterSource(request(source));
    const unit = plan.features.at(-1)!;
    const feature = assembleStagedFeature(plan, unit, manual(unit.id, { recharge: [5, 6], legendaryCost: 2 }));
    expect(feature.recharge).toEqual([5, 6]); expect(feature.legendaryCost).toBe(2);
    expect(() => assembleStagedFeature(plan, unit, manual(unit.id, { recharge: [4, 6] }))).toThrow('FEATURE_FACT_CONFLICT');
    const dailySource = SOURCE.replace('Eye Options.', 'Eye Options (1/Day, Level 9 Spell, Concentration).');
    const daily = splitStagedMonsterSource(request(dailySource));
    expect(assembleStagedFeature(daily, daily.features.at(-1)!, manual(daily.features.at(-1)!.id)).uses).toEqual({ max: 1, period: 'day' });
  });
  test('a malformed JSON retry is distinct from planned stages and does not duplicate inventory', async () => {
    const requests: Captured[] = [], stages: StagedExtractionMetadata[] = [];
    await provider({ requests, onStage: event => { stages.push(event); }, onRequest: (_request, index) => index === 0 ? '{broken' : undefined }).extract(request());
    expect(requests).toHaveLength(5);
    expect(stages.at(-1)).toMatchObject({ plannedCalls: 4, retryCalls: 1 });
    expect(stages.filter(event => event.callKind === 'retry')).toHaveLength(1);
  });
  test('cancellation after verified base prevents all feature HTTP requests', async () => {
    const controller = new AbortController(); const requests: Captured[] = [];
    await expect(provider({ requests, signal: controller.signal, onStage: event => {
      if (event.stage === 'base' && event.status === 'validated') controller.abort();
    } }).extract(request())).rejects.toThrow('cancelled');
    expect(requests).toHaveLength(1);
  });
  test('pre-cancellation performs no HTTP and legacy default keeps one full-source call', async () => {
    const controller = new AbortController(); controller.abort(); const requests: Captured[] = [];
    await expect(provider({ requests, signal: controller.signal }).extract(request())).rejects.toThrow('cancelled');
    expect(requests).toHaveLength(0);
    const legacyRequests: Captured[] = [];
    const old = provider({ staged: false, requests: legacyRequests, onRequest: () => baseIr(SOURCE) });
    await old.extract(request());
    expect(legacyRequests).toHaveLength(1);
    expect(legacyRequests[0]!.payload.source).toBe(SOURCE);
  });
  test('base source identity cannot be changed by an offline replay', () => {
    const plan = splitStagedMonsterSource(request()); const ir = baseIr(plan.base.quote);
    ir.source.sha256 = sha256(SOURCE);
    expect(() => validateStagedBaseIntake(plan, ir)).toThrow('SOURCE_HASH_MISMATCH');
  });
  test('changing a saved source destination cannot turn omitted mechanics into biography success', () => {
    const plan = splitStagedMonsterSource(request());
    const unit = plan.features.at(-1)!;
    unit.destination = 'biography';
    plan.features = plan.features.filter(feature => feature.destination === 'feature');
    expect(() => assembleStagedMonsterIntake(plan, baseIr(plan.base.quote), plan.features.map(feature => manual(feature.id)))).toThrow('SOURCE_PARTITION');
  });
});

describe('program-owned base evidence and source features', () => {
  test('facts/source makes one actual HTTP call and records deterministic stages separately', async () => {
    const requests: Captured[] = [], stages: StagedExtractionMetadata[] = [], evidence: any[] = [];
    const result = await provider({ baseMode: 'facts', featureMode: 'source', requests, evidence, onStage: event => { stages.push(event); } }).extract(request());
    expect(requests).toHaveLength(1);
    expect(requests[0]!.payload).toEqual({ source: HEADER });
    expect(requests[0]!.prompt).toContain('BASE FACTS stage');
    expect(requests[0]!.prompt).toContain('CREATURE has exactly eight required objects');
    expect(requests[0]!.prompt).not.toContain('Return a complete MonsterIntakeIR');
    expect(requests[0]!.prompt).not.toContain('Use exact unique evidence quotes');
    expect(evidence).toHaveLength(1);
    expect(evidence[0].content).not.toContain('"claims"');
    expect(result.source).toEqual({ sha256: sha256(SOURCE), length: SOURCE.length });
    expect(result.coverage.map(entry => entry.quote).join('')).toBe(SOURCE);
    expect(result.claims.every(claim => claim.evidence.every(ref => SOURCE.slice(ref.start, ref.end) === ref.quote))).toBeTrue();
    expect(validateMonsterIntakeIR(SOURCE, result).blocking).toEqual([]);
    expect(result.creature.actions[0]).toMatchObject({ activityType: 'attack', attack: { type: 'mwak', toHit: 4, reach: 5 } });
    expect(result.creature.actions[1]).toMatchObject({ executionMode: 'gm-manual', activityType: 'utility' });
    const featureStages = stages.filter(event => event.stage === 'feature');
    expect(featureStages).toHaveLength(3);
    expect(featureStages.every(event => event.processor === 'program' && event.status === 'validated'
      && event.plannedCalls === 1 && event.retryCalls === 0 && Boolean(event.inputHash) && Boolean(event.outputHash)
      && !event.attempt && !event.callKind)).toBeTrue();
    expect(stages.filter(event => event.status === 'request')).toHaveLength(1);
    expect(stages.at(-1)).toMatchObject({ stage: 'assembly', processor: 'program', plannedCalls: 1, retryCalls: 0 });
  });
  for (const [name, mutate] of [
    ['AC', (facts: StagedBaseFactsResponse) => { facts.creature.attributes.ac = 16; }],
    ['HP', (facts: StagedBaseFactsResponse) => { facts.creature.attributes.hp.value = 31; }],
    ['ability', (facts: StagedBaseFactsResponse) => { facts.creature.abilities.str = 15; }],
    ['movement', (facts: StagedBaseFactsResponse) => { facts.creature.attributes.movement.fly = 40; }],
    ['defense', (facts: StagedBaseFactsResponse) => { facts.creature.defenses.immunities = ['fire']; }],
    ['identity', (facts: StagedBaseFactsResponse) => { facts.creature.identity.name = 'stone'; }],
    ['invented AC kind', (facts: StagedBaseFactsResponse) => { facts.creature.attributes.acKind = 'natural'; }],
    ['invented AC qualifier', (facts: StagedBaseFactsResponse) => { facts.creature.attributes.acNote = 'with a shield'; }],
  ] as const) test(`facts ${name} error produces no feature processing or further HTTP`, async () => {
    const requests: Captured[] = [], stages: StagedExtractionMetadata[] = [];
    await expect(provider({ baseMode: 'facts', featureMode: 'source', requests, onStage: event => { stages.push(event); }, onRequest: captured => {
      const facts = baseFacts(baseIr(captured.payload.source)); mutate(facts); return facts;
    } }).extract(request())).rejects.toThrow('Staged extraction rejected');
    expect(requests).toHaveLength(1);
    expect(stages.some(event => event.stage === 'feature')).toBeFalse();
    expect(stages.at(-1)).toMatchObject({ stage: 'base', status: 'failed', plannedCalls: 1 });
  });
  test('facts whitelist rejects model-owned evidence, hidden mechanics, missing containers and malformed values', () => {
    const plan = splitStagedMonsterSource(request());
    for (const mutate of [
      (facts: any) => { facts.source = { sha256: sha256(HEADER), length: HEADER.length }; },
      (facts: any) => { facts.claims = [{ evidence: [{ start: 0, end: 4, quote: 'fake' }] }]; },
      (facts: any) => { facts.coverage = []; },
      (facts: any) => { facts.creature.actions = []; },
      (facts: any) => { facts.creature.biography = null; },
      (facts: any) => { facts.creature.senses.special = null; },
      (facts: any) => { facts.creature.attributes.hp.unknown = null; },
      (facts: any) => { delete facts.creature.skills; },
      (facts: any) => { delete facts.creature.defenses.immunities; },
      (facts: any) => { delete facts.creature.abilities.str; },
      (facts: any) => { facts.creature.saves = []; },
      (facts: any) => { facts.creature.skills.arcana = '2'; },
      (facts: any) => { facts.creature.languages.values = 'Common'; },
      (facts: any) => { facts.creature.defenses.immunities = [7]; },
    ]) {
      const facts = baseFacts(baseIr(plan.base.quote)); mutate(facts);
      expect(() => validateStagedBaseFacts(plan, facts)).toThrow('Staged extraction rejected');
    }
    const uncertainty = baseFacts(baseIr(plan.base.quote));
    uncertainty.uncertainties = [{ id: 'unknown-size', code: 'UNKNOWN_SIZE', path: '/creature/identity/size', message: 'Source size is unknown.', blocking: true }];
    expect(() => validateStagedBaseFacts(plan, uncertainty)).toThrow('UNRESOLVED_BASE_FACT');
  });
  test('wrong facts and fake legacy quotes remain rejected even when a whole header is available', () => {
    const plan = splitStagedMonsterSource(request());
    const wrong = baseFacts(baseIr(plan.base.quote)); wrong.creature.abilities.str = 18;
    expect(() => validateStagedBaseFacts(plan, wrong)).toThrow('BASE_NUMBER_CONFLICT');
    const legacy = baseIr(plan.base.quote); legacy.claims[0]!.evidence[0]!.quote = 'fabricated Sentinel header';
    expect(() => validateStagedBaseIntake(plan, legacy)).toThrow('EVIDENCE_MISMATCH');
    for (const duplicate of ['HP 32\n', 'STR 18\n']) {
      const conflicted = splitStagedMonsterSource(request(SOURCE.replace('Traits\n', `${duplicate}Traits\n`)));
      expect(() => validateStagedBaseFacts(conflicted, baseFacts(baseIr(conflicted.base.quote)))).toThrow('CONFLICTING_BASE_NUMBERS');
    }
  });
  for (const [name, duplicate, code] of [
    ['walk speed', 'Speed 60 ft.\n', 'CONFLICTING_BASE_NUMBERS'],
    ['HP formula', 'HP 30 (5d8 + 8)\n', 'CONFLICTING_BASE_FORMULAS'],
    ['size', 'Size Large\n', 'CONFLICTING_STATIC_FACT'],
    ['type', 'Type Undead\n', 'CONFLICTING_STATIC_FACT'],
  ] as const) test(`all explicit ${name} declarations must agree before any features are processed`, async () => {
    const source = SOURCE.replace('Traits\n', `${duplicate}Traits\n`), plan = splitStagedMonsterSource(request(source));
    const facts = baseFacts(baseIr(plan.base.quote));
    expect(() => validateStagedBaseFacts(plan, facts)).toThrow(code);
    const requests: Captured[] = [], stages: StagedExtractionMetadata[] = [];
    await expect(provider({ baseMode: 'facts', featureMode: 'source', requests, onStage: event => { stages.push(event); } }).extract(request(source))).rejects.toThrow(code);
    expect(requests).toHaveLength(1);
    expect(stages.some(event => event.stage === 'feature')).toBeFalse();
  });
  for (const [name, duplicate] of [
    ['walk speed', 'Speed 30 ft.\n'],
    ['HP formula presentation', 'HP 30 (4d8+12)\n'],
    ['size alias', 'Size 中型\n'],
    ['type alias', 'Type 构装生物\n'],
  ] as const) test(`equivalent repeated ${name} remains accepted and source-complete`, async () => {
    const source = SOURCE.replace('Traits\n', `${duplicate}Traits\n`);
    const result = await provider({ baseMode: 'facts', featureMode: 'source' }).extract(request(source));
    expect(result.creature.attributes.movement).toEqual({ walk: 30 });
    expect(result.creature.attributes.hp.formula).toBe('4d8 + 12');
    expect(result.creature.identity).toMatchObject({ size: 'medium', creatureType: 'construct' });
    expect(result.coverage.map(entry => entry.quote).join('')).toBe(source);
    expect(validateMonsterIntakeIR(source, result).blocking).toEqual([]);
  });
  test('same-line and wrapped repeated movement modes compare every value', () => {
    for (const speed of ['Speed 30 ft., walk 60 ft.', 'Speed 30 ft., fly 60 ft., fly 90 ft.', 'Speed 30 ft.\nFly 60 ft.\nFly 90 ft.']) {
      const source = SOURCE.replace('Speed 30 ft.', speed), plan = splitStagedMonsterSource(request(source));
      const facts = baseFacts(baseIr(plan.base.quote));
      if (speed.includes('fly') || speed.includes('Fly')) facts.creature.attributes.movement.fly = 60;
      expect(() => validateStagedBaseFacts(plan, facts)).toThrow('CONFLICTING_BASE_NUMBERS');
    }
    const source = SOURCE.replace('Speed 30 ft.', 'Speed 30 ft., walk 30 ft., fly 60 ft., fly 60 ft.');
    const plan = splitStagedMonsterSource(request(source)), facts = baseFacts(baseIr(plan.base.quote));
    facts.creature.attributes.movement.fly = 60;
    expect(() => validateStagedBaseFacts(plan, facts)).not.toThrow();
  });
  test('dimensions/type lines cannot conflict with explicit Size/Type metadata', () => {
    for (const declaration of ['Large construct\n', 'Medium undead\n']) {
      const source = SOURCE.replace('Traits\n', `${declaration}Traits\n`), plan = splitStagedMonsterSource(request(source));
      expect(() => validateStagedBaseFacts(plan, baseFacts(baseIr(plan.base.quote)))).toThrow('CONFLICTING_STATIC_FACT');
    }
    const source = SOURCE.replace('Type Construct', 'Type Construct (Stone)').replace('Traits\n', 'Type Construct (Iron)\nTraits\n');
    const plan = splitStagedMonsterSource(request(source)), facts = baseFacts(baseIr(plan.base.quote));
    facts.creature.identity.creatureTypeCustom = 'Stone';
    expect(() => validateStagedBaseFacts(plan, facts)).toThrow('CONFLICTING_STATIC_FACT');
  });
  for (const qualifier of ['18 while bloodied', 'while bloodied', 'natural armor; 18 with a shield']) test(`conditional AC (${qualifier}) cannot be hidden by an omitted or present model note`, async () => {
    const source = SOURCE.replace('AC 15', `AC 15 (${qualifier})`), plan = splitStagedMonsterSource(request(source));
    for (const acNote of [undefined, qualifier]) {
      const facts = baseFacts(baseIr(plan.base.quote));
      if (acNote) facts.creature.attributes.acNote = acNote;
      expect(() => validateStagedBaseFacts(plan, facts)).toThrow('UNSUPPORTED_STATIC_FACT');
    }
    const requests: Captured[] = [], stages: StagedExtractionMetadata[] = [];
    await expect(provider({ baseMode: 'facts', featureMode: 'source', requests, onStage: event => { stages.push(event); } }).extract(request(source))).rejects.toThrow('UNSUPPORTED_STATIC_FACT');
    expect(requests).toHaveLength(1);
    expect(stages.some(event => event.stage === 'feature')).toBeFalse();
  });
  test('ordinary natural armor and equipment display notes preserve their source without dynamic AC inference', () => {
    for (const note of ['Natural Armor', 'chain mail, shield']) {
      const source = SOURCE.replace('AC 15', `AC 15 (${note})`), plan = splitStagedMonsterSource(request(source));
      const facts = baseFacts(baseIr(plan.base.quote));
      if (note === 'Natural Armor') facts.creature.attributes.acKind = 'natural';
      expect(() => validateStagedBaseFacts(plan, facts)).not.toThrow();
      facts.creature.attributes.acNote = note;
      expect(validateStagedBaseFacts(plan, facts).creature.attributes.acNote).toBe(note);
    }
  });
  test('known optional nulls mean absence only after whitelist checks and cannot remove source facts', () => {
    const plan = splitStagedMonsterSource(request());
    const facts = baseFacts(baseIr(plan.base.quote)) as any;
    Object.assign(facts.creature.identity, { creatureTypeCustom: null, alignment: null, englishName: null });
    Object.assign(facts.creature.attributes, { acKind: null, acNote: null, initiative: null, xp: null, proficiencyBonus: null });
    facts.creature.languages.custom = null;
    const raw = JSON.stringify(facts), verified = validateStagedBaseFacts(plan, facts);
    expect(JSON.stringify(facts)).toBe(raw);
    expect(verified.creature.identity).toEqual({ name: 'Sentinel', size: 'medium', creatureType: 'construct' });
    facts.creature.attributes.hp.formula = null;
    expect(() => validateStagedBaseFacts(plan, facts)).toThrow('BASE_FORMULA_CONFLICT');
    const typed = splitStagedMonsterSource(request(SOURCE.replace('Type Construct', 'Type Construct (Stone)')));
    facts.creature.attributes.hp.formula = '4d8 + 12';
    expect(() => validateStagedBaseFacts(typed, facts)).toThrow('identity/creatureTypeCustom');
  });
  test('complex source bodies, all numbered children, limits and resources survive without model enum proposals', async () => {
    const rules = [
      'Spelljack (1/Day, Concentration). As a bonus action, choose a creature within 60 feet. It cannot cast spells until the end of its next turn.',
      'Doom Spiral (Recharge 4-6). Each creature must make a DC 14 Wisdom saving throw. On failure it takes 3d8 psychic damage, or half on success. This lasts for 1 minute.',
      'Eye Options (Costs 2 Actions). Choose one creature within 60 feet, then one of the following effects:\n1. First Ray. The target is pushed 10 feet.\n2. Second Ray. The target cannot speak until its next turn.',
    ];
    const source = `${HEADER}Actions\n${rules.join('\n')}\n`;
    const requests: Captured[] = [];
    const result = await provider({ baseMode: 'facts', featureMode: 'source', requests }).extract(request(source));
    expect(requests).toHaveLength(1);
    expect(result.creature.actions).toHaveLength(3);
    result.creature.actions.forEach((feature, index) => {
      expect(feature.description).toBe(rules[index]!);
      expect(feature).toMatchObject({ executionMode: index<2?'native-with-gm':'gm-manual', activityType: index===1?'save':'utility' });
      for (const key of ['attack', 'aoe', 'appliedConditions', 'healing']) expect(Object.hasOwn(feature, key)).toBeFalse();
      if(index!==1)for(const key of ['save','damage'])expect(Object.hasOwn(feature,key)).toBeFalse();
    });
    expect(result.creature.actions[0]).toMatchObject({ activationType: 'bonus', uses: { max: 1, period: 'day' } });
    expect(result.creature.actions[1]!.recharge).toEqual([4, 6]);
    expect(result.creature.actions[1]!.save).toMatchObject({dc:14,ability:'wis',outcome:'half'});
    expect(result.creature.actions[1]!.damage).toEqual([{formula:'3d8',type:'psychic',relationship:'base'}]);
    expect(result.creature.actions[2]!.legendaryCost).toBe(2);
    expect(validateMonsterIntakeIR(source, result).blocking).toEqual([]);
  });
  test('a source-only legacy manual reply keeps context but cannot promote a missing basic attack', async () => {
    const context = 'The sentinel can take 2 legendary actions only while bloodied. It regains them at the start of its turn.';
    const source = `${HEADER}Legendary Actions\n${context}\n${SLAM}\n`;
    const result = await provider({ baseMode: 'facts', featureMode: 'source' }).extract(request(source));
    expect(result.creature.legendaryActions[0]).toMatchObject({ name: 'Slam', executionMode: 'gm-manual', activityType: 'utility', activationType: 'legendary' });
    expect(result.creature.legendaryActions[0]!.attack).toBeUndefined();
    expect(result.creature.legendaryActions[0]!.description).toBe(SLAM);
    expect(result.creature.biography).toContain(context);
    expect(result.coverage.map(entry => entry.quote).join('')).toBe(source);
    expect(validateMonsterIntakeIR(source, result).blocking.map(finding=>finding.code)).toEqual(['SOURCE_BASIC_OPERATION_OMITTED']);
  });
  for (const [name, attack] of [
    ['generic 2024 type', SLAM.replace('Melee Weapon Attack:', 'Melee Attack Roll:')],
    ['conditional rider', SLAM + ' The target is also Grappled until it escapes.'],
    ['extra damage branch', SLAM + ' If the target is Prone, it takes an extra 2d6 fire damage.'],
  ]) test(`source mode retains the primary operation for ${name}`, async () => {
    const source = `${HEADER}Actions\n${attack}\n`;
    const result = await provider({ baseMode: 'facts', featureMode: 'source' }).extract(request(source));
    if(name==='generic 2024 type'){
      expect(result.creature.actions[0]).toMatchObject({ activityType: 'attack',attack:{type:'mwak',toHit:4,reach:5} });
      expect(result.creature.actions[0]!.damage).toEqual([{formula:'1d8+2',type:'bludgeoning',relationship:'base'}]);
    }else{
      expect(result.creature.actions[0]).toMatchObject({executionMode:'native-with-gm',activityType:'attack',attack:{toHit:4}});
      expect(result.creature.actions[0]!.damage).toEqual([{formula:'1d8+2',type:'bludgeoning',relationship:'base'}]);
      expect(result.creature.actions[0]!.manualRemainder).toContain(name==='conditional rider'?'Grappled':'extra 2d6');
    }
    expect(result.creature.actions[0]!.description).toBe(attack!);
  });
  test('lossless language normalization keeps standard enums and literal telepathy, and rejects lost facts', () => {
    const source = SOURCE.replace('Traits\n', 'Languages Deep Speech, Common, Telepathy 120 ft.\nTraits\n');
    const plan = splitStagedMonsterSource(request(source));
    const facts = baseFacts(baseIr(plan.base.quote)); facts.creature.languages.values = ['Deep Speech', 'Common', 'Telepathy 120 ft.'];
    const raw = JSON.stringify(facts); const base = validateStagedBaseFacts(plan, facts);
    expect(base.creature.languages).toEqual({ values: ['deep', 'common'], custom: 'Telepathy 120 ft.' });
    expect(JSON.stringify(facts)).toBe(raw);
    facts.creature.languages.values[2] = 'Telepathy 90 ft.';
    expect(() => validateStagedBaseFacts(plan, facts)).toThrow('BASE_STATIC_CONFLICT');
    facts.creature.languages.values = ['Common', 'Deep Speech'];
    expect(() => validateStagedBaseFacts(plan, facts)).toThrow('BASE_STATIC_CONFLICT');
  });
  test('facts coordinates remain program-owned for a CRLF candidate inside a larger source', async () => {
    const fragment = MARKDOWN.replace(/\n/gu, '\r\n'), source = `before\n${fragment}\nafter`;
    const req = { ...request(source), candidate: { id: 's', label: 'wrong discovery label', start: 7, end: 7 + fragment.length, quote: fragment } };
    const result = await provider({ baseMode: 'facts', featureMode: 'source' }).extract(req);
    expect(result.claims[0]!.evidence[0]!.start).toBe(7);
    expect(result.claims.every(claim => claim.evidence.every(ref => source.slice(ref.start, ref.end) === ref.quote))).toBeTrue();
    expect(validateMonsterIntakeIR(source, result, { coverageRange: req.candidate }).blocking).toEqual([]);
  });
  test('source-only processing works with a legacy base and facts-only still supports model features', async () => {
    const legacy: Captured[] = [], facts: Captured[] = [];
    await provider({ featureMode: 'source', requests: legacy }).extract(request());
    await provider({ baseMode: 'facts', requests: facts }).extract(request());
    expect(legacy).toHaveLength(1); expect(facts).toHaveLength(4);
    expect(facts[1]!.prompt).toContain('FEATURE stage');
  });
  test('facts malformed JSON retry counts only actual attempts, never program features', async () => {
    const requests: Captured[] = [], stages: StagedExtractionMetadata[] = [];
    await provider({ baseMode: 'facts', featureMode: 'source', requests, onStage: event => { stages.push(event); }, onRequest: (_request, index) => index === 0 ? '{broken' : undefined }).extract(request());
    expect(requests).toHaveLength(2);
    expect(stages.at(-1)).toMatchObject({ plannedCalls: 1, retryCalls: 1 });
    expect(stages.filter(event => event.processor === 'program' && event.status === 'request')).toHaveLength(0);
  });
  test('cancellation after a program feature prevents the remaining features and assembly', async () => {
    const controller = new AbortController(), requests: Captured[] = [], stages: StagedExtractionMetadata[] = [];
    await expect(provider({ baseMode: 'facts', featureMode: 'source', signal: controller.signal, requests, onStage: event => {
      stages.push(event); if (event.stage === 'feature' && event.status === 'validated') controller.abort();
    } }).extract(request())).rejects.toThrow('cancelled');
    expect(requests).toHaveLength(1);
    expect(stages.filter(event => event.stage === 'feature' && event.status === 'validated')).toHaveLength(1);
    expect(stages.some(event => event.stage === 'assembly')).toBeFalse();
  });
  // Private observed artifacts are optional outside this worktree. This is an
  // offline projection of actual saved values, never a fabricated facts-model reply.
  for (const sample of [1, 2, 3]) {
    const evidenceRoot = resolve(import.meta.dir, '../.local/forge-staged-manual-20261013');
    const repliesPath = resolve(evidenceRoot, `fresh-v2/new-sample-${sample}/provider-replies.json`);
    const sourcePath = resolve(evidenceRoot, `new-sources/new-sample-${sample}-source.txt`);
    test.skipIf(!existsSync(repliesPath) || !existsSync(sourcePath))(`saved first sample ${sample}: actual base facts replay without model-proposed claims`, () => {
      const source = readFileSync(sourcePath, 'utf8'), repliesBytes = readFileSync(repliesPath, 'utf8');
      const replies = JSON.parse(repliesBytes) as Array<{ content: string }>;
      const raw = JSON.parse(replies[0]!.content) as MonsterIntakeIR;
      const plan = splitStagedMonsterSource(request(source));
      const verified = validateStagedBaseFacts(plan, baseFacts(raw));
      expect(verified.source).toEqual({ sha256: sha256(plan.base.quote), length: plan.base.quote.length });
      expect(verified.claims.every(claim => claim.evidence.every(ref => plan.base.quote.slice(ref.start, ref.end) === ref.quote))).toBeTrue();
      expect(readFileSync(repliesPath, 'utf8')).toBe(repliesBytes);
      const wrong = baseFacts(raw); wrong.creature.attributes.ac += 1;
      expect(() => validateStagedBaseFacts(plan, wrong)).toThrow('BASE_NUMBER_CONFLICT');
    });
  }
});

describe('independent static base facts', () => {
  for(const [headers,values] of [
    ['STR DEX CON INT WIS CHA','14 (+2) 10 (+0) 16 (+3) 3 (-4) 10 (+0) 1 (-5)'],
    ['| STR | DEX | CON | INT | WIS | CHA |\n| --- | --- | --- | --- | --- | --- |','| 14 (+2) | 10 (+0) | 16 (+3) | 3 (−4) | 10 (+0) | 1 (−5) |'],
    ['dex str cha con wis int','10 14 1 16 10 3'],
  ])test(`source-bound horizontal scores retain the exact six header/value pairs: ${headers}`,()=>{
    const source=SOURCE.replace('STR 14 DEX 10 CON 16 INT 3 WIS 10 CHA 1',`${headers}\n${values}`);
    const plan=splitStagedMonsterSource(request(source)),facts=baseFacts(baseIr(plan.base.quote));
    const verified=validateStagedBaseFacts(plan,facts);expect(verified.creature.abilities).toEqual(facts.creature.abilities);
    const wrong=structuredClone(facts);wrong.creature.abilities.str=15;
    expect(()=>validateStagedBaseFacts(plan,wrong)).toThrow('BASE_NUMBER_CONFLICT');
  });
  test('incomplete, conflicting and inconsistent horizontal scores cannot be approved',()=>{
    for(const table of [
      'STR DEX CON INT WIS CHA\n14 10 16 3 10',
      'STR DEX CON INT WIS CHA\n14 (+3) 10 16 3 10 1',
      'STR DEX CON INT WIS CHA\n14 10 16 3 10 1\nSTR 15',
    ]){
      const source=SOURCE.replace('STR 14 DEX 10 CON 16 INT 3 WIS 10 CHA 1',table),plan=splitStagedMonsterSource(request(source));
      expect(()=>validateStagedBaseFacts(plan,baseFacts(baseIr(plan.base.quote)))).toThrow('Staged extraction rejected');
    }
  });
  for(const sign of ['-','−','–'])test(`printed ${sign} signs retain exact MOD/SAVE source and reject a changed total`,()=>{
    const table=`MOD SAVE MOD SAVE MOD SAVE\nStr 14 +2 +4\nDex 10 +0 +0\nCon 16 +3 +5\nInt 3 ${sign}4 ${sign}4\nWis 10 +0 +0\nCha 1 ${sign}5 ${sign}5`;
    const source=SOURCE.replace('STR 14 DEX 10 CON 16 INT 3 WIS 10 CHA 1',table);
    const plan=splitStagedMonsterSource(request(source)),facts=baseFacts(baseIr(plan.base.quote));
    facts.creature.saves={str:4,dex:0,con:5,int:-4,wis:0,cha:-5};
    const result=validateStagedBaseFacts(plan,facts);
    expect(result.creature.saves.int).toBe(-4);expect(result.source.sha256).toBe(sha256(plan.base.quote));
    expect(result.coverage[0]!.quote).toBe(plan.base.quote);
    expect(result.claims.every(claim=>claim.evidence.every(ref=>plan.base.quote.slice(ref.start,ref.end)===ref.quote))).toBe(true);
    facts.creature.saves.int=4;expect(()=>validateStagedBaseFacts(plan,facts)).toThrow('BASE_STATIC_CONFLICT');
  });
  test('en dash negative saving throws and skills use the same bounded signed-number comparison',()=>{
    const source=SOURCE.replace('Traits\n','Saving Throws Int –4, Cha −5\nSkills Arcana –4\nTraits\n');
    const plan=splitStagedMonsterSource(request(source)),facts=baseFacts(baseIr(plan.base.quote));
    facts.creature.saves={int:-4,cha:-5};facts.creature.skills={arcana:-4};
    expect(()=>validateStagedBaseFacts(plan,facts)).not.toThrow();
    facts.creature.skills.arcana=4;expect(()=>validateStagedBaseFacts(plan,facts)).toThrow('BASE_STATIC_CONFLICT');
  });
  test('an unsupported sign in a printed table is still rejected rather than treated as an absent save',()=>{
    const table='MOD SAVE MOD SAVE MOD SAVE\nStr 14 +2 +4\nDex 10 +0 +0\nCon 16 +3 +5\nInt 3 —4 —4\nWis 10 +0 +0\nCha 1 -5 -5';
    const source=SOURCE.replace('STR 14 DEX 10 CON 16 INT 3 WIS 10 CHA 1',table);
    const plan=splitStagedMonsterSource(request(source)),facts=baseFacts(baseIr(plan.base.quote));
    facts.creature.saves={str:4,dex:0,con:5,int:-4,wis:0,cha:-5};
    expect(()=>validateStagedBaseFacts(plan,facts)).toThrow('UNSUPPORTED_STATIC_FACT');
  });
  const staticSource = SOURCE.replace('Traits\n', 'Saving Throws Con +5\nSkills Perception +4, Arcana +2\nResistances Cold\nImmunities Fire; Charmed\nSenses Darkvision 60 ft., Passive Perception 14\nLanguages Common, Telepathy 60 ft.\nTraits\n');
  function valid(source = staticSource) {
    const plan = splitStagedMonsterSource(request(source));
    const ir = baseIr(plan.base.quote);
    ir.creature.saves = { con: 5 }; ir.creature.skills = { perception: 4, arcana: 2 };
    ir.creature.defenses = { resistances: ['cold'], immunities: ['fire'], vulnerabilities: [], conditionImmunities: ['charmed'] };
    ir.creature.senses = { darkvision: 60, passivePerception: 14 };
    ir.creature.languages = { values: ['common'], custom: 'Telepathy 60 ft.' };
    const evidence = { start: 0, end: plan.base.quote.length, quote: plan.base.quote };
    for (const field of ['saves', 'skills', 'defenses', 'senses', 'languages']) {
      const path = `/creature/${field}`;
      ir.claims.push({ path, valueKind: 'explicit', confidence: 'high', evidence: [evidence] });
      ir.coverage[0]!.claimPaths.push(path);
    }
    return { plan, ir };
  }
  test('all listed static facts pass independently of broad claims', () => {
    const { plan, ir } = valid(); expect(() => validateStagedBaseIntake(plan, ir)).not.toThrow();
    expect(() => validateStagedBaseFacts(plan, baseFacts(ir))).not.toThrow();
  });
  test('known absent optional nulls normalize only in a clone and preserve evidence identity', () => {
    const source = SOURCE.replace('30 (4d8 + 12)', '30');
    const plan = splitStagedMonsterSource(request(source)); const ir = baseIr(plan.base.quote) as any;
    Object.assign(ir.creature, { biography: null, legendary: null, spellcasting: null, mythicActions: null });
    Object.assign(ir.creature.identity, { englishName: null, creatureTypeCustom: null, alignment: null });
    Object.assign(ir.creature.attributes, { acKind: null, acNote: null, initiative: null, xp: null, proficiencyBonus: null });
    ir.creature.attributes.hp.formula = null;
    Object.assign(ir.creature.attributes.movement, { fly: null, swim: null, climb: null, burrow: null, hover: null });
    ir.creature.saves = { str: null, dex: null, con: null, int: null, wis: null, cha: null };
    ir.creature.senses = { darkvision: null, blindsight: null, tremorsense: null, truesight: null, passivePerception: null, special: null };
    ir.creature.languages.custom = null;
    const original = JSON.stringify(ir); const result = validateStagedBaseIntake(plan, ir);
    expect(JSON.stringify(ir)).toBe(original);
    expect(result.source).toEqual(ir.source); expect(result.claims).toEqual(ir.claims); expect(result.coverage).toEqual(ir.coverage);
    expect(Object.hasOwn(result.creature.identity, 'creatureTypeCustom')).toBeFalse();
    expect(Object.hasOwn(result.creature.identity, 'alignment')).toBeFalse();
    expect(result.creature.senses).toEqual({}); expect(result.creature.saves).toEqual({});
    expect(result.creature.attributes.movement).toEqual({ walk: 30 });
  });
  test('null cannot erase an optional fact that the source explicitly supplies', () => {
    const { plan, ir } = valid(); (ir.creature.languages as any).custom = null;
    expect(() => validateStagedBaseIntake(plan, ir)).toThrow('BASE_STATIC_CONFLICT');
    const { plan: sensed, ir: sensedIr } = valid(); (sensedIr.creature.senses as any).darkvision = null;
    expect(() => validateStagedBaseIntake(sensed, sensedIr)).toThrow('BASE_STATIC_CONFLICT');
    const typed = splitStagedMonsterSource(request(SOURCE.replace('Type Construct', 'Type Construct (Stone)')));
    const typedIr = baseIr(typed.base.quote); (typedIr.creature.identity as any).creatureTypeCustom = null;
    expect(() => validateStagedBaseIntake(typed, typedIr)).toThrow('identity/creatureTypeCustom');
    const aligned = splitStagedMonsterSource(request(SOURCE.replace('HP 30', 'Medium construct, neutral evil\nHP 30')));
    const alignedIr = baseIr(aligned.base.quote); (alignedIr.creature.identity as any).alignment = null;
    expect(() => validateStagedBaseIntake(aligned, alignedIr)).toThrow('identity/alignment');
    const formula = splitStagedMonsterSource(request()); const formulaIr = baseIr(formula.base.quote);
    (formulaIr.creature.attributes.hp as any).formula = null;
    expect(() => validateStagedBaseIntake(formula, formulaIr)).toThrow('attributes/hp/formula');
  });
  test('wrong non-null types, unknown null fields and required null containers remain errors', () => {
    const plan = splitStagedMonsterSource(request());
    for (const [path, value] of [
      [['identity', 'alignment'], 7], [['identity', 'creatureTypeCustom'], {}], [['identity', 'englishName'], []],
      [['attributes', 'acKind'], ['flat']], [['attributes', 'acNote'], 7], [['attributes', 'hp', 'formula'], 7],
      [['languages', 'custom'], false], [['identity', 'unknownOptional'], null], [['actions'], null],
    ] as Array<[string[], unknown]>) {
      const ir = baseIr(plan.base.quote) as any; let cursor = ir.creature;
      for (const key of path.slice(0, -1)) cursor = cursor[key];
      cursor[path.at(-1)!] = value;
      const original = JSON.stringify(ir);
      expect(() => validateStagedBaseIntake(plan, ir)).toThrow('Staged extraction rejected');
      expect(JSON.stringify(ir)).toBe(original);
    }
  });
  for (const name of ['stone', 'patient', 'Sent', 'guardian']) test(`body word or truncated title ${name} is not a source identity`, async () => {
    const { ir } = valid(); ir.creature.identity.name = name;
    const requests: Captured[] = [];
    const req = request(staticSource); req.candidate.label = name;
    await expect(provider({ requests, onRequest: () => ir }).extract(req)).rejects.toThrow('identity/name');
    expect(requests).toHaveLength(1);
  });
  test('an English alias mentioned only in biography fails the same title binding', () => {
    const { plan, ir } = valid(); ir.creature.identity.englishName = 'patient';
    expect(() => validateStagedBaseIntake(plan, ir)).toThrow('identity/englishName');
  });
  test('case, complete YAML names and explicit bilingual source titles remain supported', () => {
    const { plan, ir } = valid(); ir.creature.identity.name = 'SENTINEL';
    expect(() => validateStagedBaseIntake(plan, ir)).not.toThrow();
    for (const title of ['哨卫Sentinel', '哨卫 (Sentinel)', 'Sentinel (哨卫)']) {
      const source = SOURCE.replace('Sentinel CR 1', `${title} CR 1`);
      const bilingual = splitStagedMonsterSource(request(source)); const base = baseIr(bilingual.base.quote);
      base.creature.identity.name = '哨卫'; base.creature.identity.englishName = 'Sentinel';
      expect(() => validateStagedBaseIntake(bilingual, base)).not.toThrow();
    }
    const source = YAML.replace('name: Sentinel', 'name: "Sentinel Vanguard"');
    const named = splitStagedMonsterSource(request(source)); const base = baseIr(named.base.quote);
    expect(() => validateStagedBaseIntake(named, base)).toThrow('identity/name');
    base.creature.identity.name = 'Sentinel Vanguard';
    expect(() => validateStagedBaseIntake(named, base)).not.toThrow();
  });
  test('an unrelated Markdown page heading cannot rename the explicit stat-block title', () => {
    const source = `# Patient\n${SOURCE}`;
    const plan = splitStagedMonsterSource(request(source)); const ir = baseIr(plan.base.quote);
    ir.creature.identity.name = 'Patient';
    expect(() => validateStagedBaseIntake(plan, ir)).toThrow('identity/name');
  });
  for (const [name, mutate] of [
    ['omitted fire immunity', (ir: MonsterIntakeIR) => { ir.creature.defenses.immunities = []; }],
    ['changed immunity', (ir: MonsterIntakeIR) => { ir.creature.defenses.immunities = ['acid']; }],
    ['omitted resistance', (ir: MonsterIntakeIR) => { ir.creature.defenses.resistances = []; }],
    ['omitted condition immunity', (ir: MonsterIntakeIR) => { ir.creature.defenses.conditionImmunities = []; }],
    ['invented vulnerability', (ir: MonsterIntakeIR) => { ir.creature.defenses.vulnerabilities = ['cold']; }],
    ['omitted darkvision', (ir: MonsterIntakeIR) => { delete ir.creature.senses.darkvision; }],
    ['changed passive perception', (ir: MonsterIntakeIR) => { ir.creature.senses.passivePerception = 15; }],
    ['omitted skill', (ir: MonsterIntakeIR) => { delete ir.creature.skills.arcana; }],
    ['changed skill total', (ir: MonsterIntakeIR) => { ir.creature.skills.perception = 5; }],
    ['omitted language', (ir: MonsterIntakeIR) => { ir.creature.languages.values = []; }],
    ['changed telepathy distance', (ir: MonsterIntakeIR) => { ir.creature.languages.custom = 'Telepathy 90 ft.'; }],
    ['omitted save proficiency', (ir: MonsterIntakeIR) => { ir.creature.saves = {}; }],
    ['wrong size', (ir: MonsterIntakeIR) => { ir.creature.identity.size = 'large'; }],
    ['wrong creature type', (ir: MonsterIntakeIR) => { ir.creature.identity.creatureType = 'undead'; }],
  ] as const) test(`${name} is rejected despite complete source claims`, async () => {
    const { ir, plan } = valid(); mutate(ir);
    expect(() => validateStagedBaseFacts(plan, baseFacts(ir))).toThrow('Staged extraction rejected');
    const requests: Captured[] = [];
    await expect(provider({ requests, onRequest: () => ir }).extract(request(staticSource))).rejects.toThrow('Staged extraction rejected');
    expect(requests).toHaveLength(1);
  });
  test('subtype, alignment, wrapped movement and uncertain boundaries cannot disappear', () => {
    const typedSource = SOURCE.replace('Type Construct', 'Type Construct (Stone)');
    const typed = splitStagedMonsterSource(request(typedSource));
    expect(() => validateStagedBaseIntake(typed, baseIr(typed.base.quote))).toThrow('identity/creatureTypeCustom');
    const alignedSource = SOURCE.replace('HP 30', 'Medium construct, neutral evil\nHP 30');
    const aligned = splitStagedMonsterSource(request(alignedSource));
    expect(() => validateStagedBaseIntake(aligned, baseIr(aligned.base.quote))).toThrow('identity/alignment');
    const movingSource = SOURCE.replace('Speed 30 ft. Type Construct', 'Speed 30 ft.\nFly 60 ft. Type Construct');
    const moving = splitStagedMonsterSource(request(movingSource));
    expect(() => validateStagedBaseIntake(moving, baseIr(moving.base.quote))).toThrow('attributes/movement');
    const unknownBoundary = SOURCE.replace('while awake.', 'while awake');
    expect(() => splitStagedMonsterSource(request(unknownBoundary))).not.toThrow(); // explicit Actions supplies the boundary
    const ambiguous = SOURCE.replace('Actions\n', '').replace('while awake.', 'while awake');
    expect(() => splitStagedMonsterSource(request(ambiguous))).toThrow('UNKNOWN_ABILITY_BOUNDARY');
  });
  test('generic 2024 attack and explicit Spell Attack retain their distinct native categories', () => {
    const source = SOURCE.replace('Melee Weapon Attack:', 'Melee Attack Roll:');
    const plan = splitStagedMonsterSource(request(source));
    const unit = plan.features.find(unit => unit.name === 'Slam')!;
    expect(assembleStagedFeature(plan, unit, native(unit.id)).attack).toMatchObject({type:'mwak',toHit:4});
    expect(assembleStagedFeature(plan, unit, manual(unit.id)).attack).toBeUndefined();
    expect(stagedFeatureMechanics('Ray. Ranged Spell Attack Roll: +5, range 60 ft. Hit: 3 (1d6) fire damage.','Ray')?.facts.attack?.type).toBe('rsak');
  });
  for (const [name, source] of [
    ['unknown skill', staticSource.replace('Skills Perception +4, Arcana +2', 'Skills Forbidden Lore +4')],
    ['unknown sense', staticSource.replace('Senses Darkvision 60 ft., Passive Perception 14', 'Senses Soulsight 60 ft.')],
    ['unsupported size', staticSource.replace('Size Medium', 'Size Immense')],
  ] as const) test(`${name} retains the source and produces an explicit unsupported fact`, () => {
    const { plan, ir } = valid(source);
    expect(plan.base.quote).toContain(source.includes('Immense') ? 'Immense' : source.includes('Forbidden') ? 'Forbidden Lore' : 'Soulsight');
    expect(() => validateStagedBaseIntake(plan, ir)).toThrow('UNSUPPORTED_STATIC_FACT');
  });
});
