import {legacyStagedProvider} from './helpers/forge-legacy-provider';
import {describe,test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {auditMonsterIntakeSourceProjection} from '@fvtt-json-generator/intake-ai/verifier';
import {auditMonsterIntakeSource} from '@fvtt-json-generator/intake-ai/validator';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import {draftForgeEncounterLocalization,approveForgeEncounterLocalization} from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import fixture from './fixtures/cloaker-srd51-boundary.json';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';
import legacyAttack from './fixtures/forge-gith-legacy-attack-clauses.json';
import slaughterRecorded from './fixtures/forge-slaughter-first-provider-failure.json';

describe('first actual CHM reply preserves mixed operations through the formal workflow',()=>{
  test('the saved reply keeps recovered basics but its missing Whirlwind basics block promotion',async()=>{
    let calls=0;
    const input=slaughterRecorded.source;
    const provider=legacyStagedProvider({authMode:'api-key',apiKey:'test-only',baseUrl:'https://provider.example/v1',model:'recorded',reviewModel:'recorded',stagedExtraction:{baseMode:'facts',featureMode:'source'},timeoutMs:10000,repairTimeoutMs:10000,
      httpClient:async()=>{calls++;return {ok:true,status:200,json:async()=>({choices:[{message:{content:slaughterRecorded.baseResponse}}]})};}});
    const ir=await provider.extract({source:input,sourceSha256:hashSource(input),candidate:{id:'recorded-first',label:'Recorded CHM source',start:0,end:input.length,quote:input}});
    expect(calls).toBe(1);
    const forbidden=async():Promise<never>=>{throw Error('Saved regression cannot call a real provider');};
    const result=await generateEncounterFromHumanMarkdown({source:input,label:'Saved first failure',reviewPolicy:'deferred',outputLanguage:'source',drafts:[{key:'actor-1',source:input,ir}],draftParentHash:hashSource(JSON.stringify(ir)),
      provider:{providerName:'recorded',extractionModel:'recorded',reviewModel:'recorded',discover:forbidden,extract:forbidden,repair:forbidden,review:forbidden},automationProvider:{generate:forbidden,review:forbidden}});
    expect(result.prepared?.actors).toHaveLength(1);
    expect(result.prepared!.actors[0]!.status).not.toBe('accepted');
    expect(auditMonsterIntakeSource(input,ir).blocking.some(f=>f.code==='SOURCE_BASIC_OPERATION_OMITTED')).toBe(true);
    // Inspect the retained parser/generator behavior without promoting this
    // incomplete historical IR or editing the saved provider reply.
    const markdown=renderMonsterIntakeMarkdown(ir),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(markdown)) as any;
    const attack=actor.items.find((i:any)=>i.name.includes('Engulfing Slam'));
    expect(Object.values(attack.system.activities).some((a:any)=>a.type==='attack')).toBe(true);
    expect(ir.creature.actions.find(f=>f.name.includes('Engulfing Slam'))!.damage?.map(d=>[d.formula,d.type])).toEqual([['2d10+9','slashing'],['2d12','radiant']]);
    for(const effect of attack.effects){expect(effect.flags.fvttJsonGenerator.conditionLifecycle.sourceText).toContain('Engulfing Slam');expect(effect.description).toContain('Engulfing Slam');}expect(attack.system.description.value).toContain('至多3个生物');
    const fling=actor.items.find((i:any)=>i.name==='抛掷Fling');
    const save=Object.values(fling.system.activities).find((a:any)=>a.type==='save') as any;
    expect(save).toBeDefined();expect(save.save).toMatchObject({ability:['dex'],dc:{formula:'25'}});
    expect(save.damage.onSave).toBe('half');expect(save.damage.parts[0]).toMatchObject({number:5,denomination:6});
    expect(fling.system.description.value).toContain('非空中地点');
    expect(fling.system.range?.value).not.toBe(30);
    const refs=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups.flatMap((g:any)=>g.spellRefs);
    expect(refs.map((r:any)=>r.identifier)).toEqual(['disguise-self','control-weather','plane-shift']);
    expect(refs.map((r:any)=>r.uses?.value)).toEqual([undefined,1,1]);
    expect(auditMonsterIntakeSourceProjection(input,ir,markdown,actor).status).toBe('needs_review');
  });
});

// Saved source is the original official SRD acquisition. Base facts below are
// test-authored from that source, not a new model reply or fresh-generation proof.
const source=fixture.source;
const creature={identity:{name:'Cloaker',size:'large',creatureType:'aberration',alignment:'chaotic neutral'},
  abilities:{str:17,dex:15,con:12,int:13,wis:12,cha:14},
  attributes:{ac:14,acKind:'natural',hp:{value:78,formula:'12d10+12'},movement:{walk:10,fly:40},cr:8,xp:3900},
  saves:{},skills:{stealth:5},defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},
  senses:{darkvision:60,passivePerception:11},languages:{values:['deep','undercommon']}};
async function extract(input=source,featureMode:'source'|'auto'='source',requests?:unknown[]){
  const provider=legacyStagedProvider({authMode:'api-key',apiKey:'test-only',baseUrl:'https://provider.example/v1',model:'fake',reviewModel:'fake',
    stagedExtraction:{baseMode:'facts',featureMode},timeoutMs:10000,repairTimeoutMs:10000,
    httpClient:async(_url,init)=>{const payload=JSON.parse(JSON.parse(init.body).messages[1].content);requests?.push(payload);
      return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(payload.unitId?{schemaVersion:1,unitId:payload.unitId,mode:'manual',facts:{}}:{schemaVersion:1,creature,uncertainties:[]})}}]})};}});
  return provider.extract({source:input,sourceSha256:hashSource(input),candidate:{id:'cloaker',label:'Cloaker',start:0,end:input.length,quote:input}});
}
const stop=async():Promise<never>=>{throw Error('Offline regression forbids real providers');};
async function formal(input=source){
  const ir=await extract(input);
  const result=await generateEncounterFromHumanMarkdown({source:input,label:'Saved source regression',reviewPolicy:'deferred',outputLanguage:'source',
    drafts:[{key:'actor-1',source:input,ir}],draftParentHash:hashSource(JSON.stringify(ir)),
    provider:{providerName:'offline',extractionModel:'fake',reviewModel:'fake',discover:stop,extract:stop,repair:stop,review:stop},
    automationProvider:{generate:stop,review:stop}});
  return {ir,result,actor:result.prepared?.actors[0]?.artifact as any};
}
describe('saved Cloaker basic actions survive complete GM rules',()=>{
  const single=(rule:string)=>source.slice(0,source.indexOf('Damage Transfer.'))+'Actions\n'+rule+'\n';
  for(const [index,clause] of legacyAttack.clauses.entries())test('saved legacy Chinese attack reaches real native operations: '+clause.name,async()=>{
    const {ir,result,actor}=await formal(single(clause.source));expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    expect(ir.creature.actions[0]!.attack).toMatchObject({type:'mwak',toHit:8,reach:5});
    expect(ir.creature.actions[0]!.damage?.map(part=>part.formula)).toEqual(index===0?['2d8+4','4d8']:['2d8+4','8d12']);
    expect((Object.values(actor.items[0].system.activities) as any[]).map(activity=>activity.type)).toEqual(index===0?['attack']:['attack','save']);
    if(index===1){expect(ir.creature.actions[0]!.gmTriggeredSave).toMatchObject({ability:'wis',dc:16,failureStatuses:[]});expect(actor.items[0].effects).toEqual([]);expect(actor.items[0].system.description.value).toContain('穿越1轮');}
  });
  test('legacy ranged wording keeps its own bonus, formula and both distances',async()=>{
    const {ir,result,actor}=await formal(single('**冰矢Cold Dart。**远程武器攻击：命中+5，射程60/120尺，单一目标。命中：9（2d6+2）的穿刺伤害。'));
    expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();expect(ir.creature.actions[0]!.attack).toEqual({type:'rwak',toHit:5,range:60,longRange:120});expect(actor.items[0].system.range).toMatchObject({value:60,long:120});
  });
  test('a target-choice legacy save never becomes a single guessed ability',async()=>{
    const {ir,result}=await formal(single('**寒刃Cold Blade。**近战武器攻击：命中+5，触及5尺，单一目标。命中：5（1d6+2）的挥砍伤害。目标进行DC16的智力豁免或感知豁免。失败则目标倒地。'));
    expect(result.prepared?.actors).toHaveLength(1);expect(result.prepared!.actors[0]!.status).not.toBe('accepted');expect(auditMonsterIntakeSource(ir.coverage.map(entry=>entry.quote).join(''),ir).blocking.some(f=>f.code==='SOURCE_BASIC_OPERATION_OMITTED')).toBe(true);expect(ir.creature.actions[0]!.attack?.toHit).toBe(5);expect(ir.creature.actions[0]!.gmTriggeredSave).toBeUndefined();
  });
  for(const [rule,ability,dc,status] of [
    ['Grave Edge. Melee Weapon Attack: +6 to hit, reach 5 ft., one creature. Hit: 7 (1d8+3) slashing damage. A target reduced to 0 Hit Points by this damage must make a Constitution Saving Throw: DC 14. Failure: The target immediately dies. Its soul is bound until the weapon is broken.','con',14,'dead'],
    ['**灰羽Ash Wing。**远程攻击检定：+6，射程60尺。命中：7（1d8+3）穿刺伤害。如果此次伤害使目标生命值降至0，该生物承受以下效应。感知豁免：DC12。失败：目标立即死亡。','wis',12,'dead'],
    ['Bright Touch. Melee Spell Attack: +8 to hit, reach 5 ft., one target. Hit: 3 (1d6) radiant damage. The target must make a DC 15 Charisma saving throw. Failure: The target is blinded.','cha',15,'blinded'],
  ] as const)test('a post-hit Save remains individually invokable with its native failed state: '+ability,async()=>{
    const {ir,result,actor}=await formal(single(rule));expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    expect(ir.creature.actions[0]!.gmTriggeredSave).toMatchObject({ability,dc,failureStatuses:[status]});
    const item=actor.items[0],activities=Object.values(item.system.activities) as any[],save=activities.find(a=>a.type==='save');
    expect(activities.map(a=>a.type).sort()).toEqual(['attack','save']);expect(save.save).toMatchObject({ability:[ability],dc:{formula:String(dc)}});expect(item.effects[0].statuses).toEqual([status]);expect(activities.find(a=>a.type==='attack').effects??[]).toEqual([]);
  });
  test('a zero-HP mention without a Save does not invent death or a Save',async()=>{
    const {result,actor}=await formal(single('Quiet Edge. Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 7 (1d8+3) slashing damage. If the target reaches 0 Hit Points, its appearance changes.'));expect(result.prepared).toBeDefined();expect((Object.values(actor.items[0].system.activities) as any[]).map(a=>a.type)).toEqual(['attack']);expect(actor.items[0].effects).toEqual([]);
  });
  for(const failure of ['The target dies if it has 50 Hit Points or fewer.','The target is stunned until the end of its next turn.','The target is not blinded.','The target is blinded or stunned.'])test('conditional, timed or alternative states remain manual without an indefinite Effect: '+failure,async()=>{
    const {ir,result,actor}=await formal(single('Veiled Touch. Melee Spell Attack: +8 to hit, reach 5 ft., one target. Hit: 3 (1d6) radiant damage. The target must make a DC 15 Charisma saving throw. Failure: '+failure));
    expect(result.prepared).toBeDefined();expect(ir.creature.actions[0]!.gmTriggeredSave!.failureStatuses).toEqual([]);if(failure.includes('not blinded'))expect(actor.items[0].effects).toEqual([]);else{expect(actor.items[0].effects.length).toBeGreaterThan(0);for(const effect of actor.items[0].effects){expect(effect.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(effect.description).toContain(failure);}}expect((Object.values(actor.items[0].system.activities) as any[]).map(a=>a.type).sort()).toEqual(['attack','save']);expect(actor.items[0].system.description.value).toContain(failure);
  });
  for(const [rule,names] of [
    ['**施法Spellcasting。**该生物施展以下一道法术，使用感知作为施法属性（法术豁免DC15）。\n**每项1/日：**死亡法阵Circle of Death，位面转移Plane Shift，律令死亡Power Word Kill',['死亡法阵Circle of Death','位面转移Plane Shift','律令死亡Power Word Kill']],
    ['**Innate Magic.** The creature casts the following spells without material components; its spellcasting ability is Wisdom.\n1/Day Each: Alarm, Blur',['Alarm','Blur']],
    ['**奥术Arcana。**该生物施展以下法术，使用智力作为施法属性。\r\n每项1/日：侦测魔法、飞行术',['侦测魔法','飞行术']],
  ] as const)test('explicit daily-each spell list reaches real Cast contract: '+names[0],async()=>{
    const input=single(rule),{ir,result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest,group=manifest.spellcastingGroups[0];
    expect(group.spellRefs.map((r:any)=>r.originalName)).toEqual([...names]);expect(JSON.stringify(actor.items)).not.toContain('GM施法记录');
    // Static Cast projection uses a test UUID; matching and hydration are a
    // separate runtime gate, never inferred from this fixture.
    for(const ref of group.spellRefs){const {activity}=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'abcdefghijklmnop',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'});expect(activity.type).toBe('cast');expect(activity.uses).toEqual({spent:0,max:'1',recovery:[{period:'day',type:'recoverAll'}]});expect(activity.consumption.targets).toEqual([{type:'activityUses',value:'1'}]);}
    const wrong=structuredClone(ir);wrong.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[0]!.identifier='invented-spell';expect(auditMonsterIntakeSource(input,wrong).blocking.length).toBeGreaterThan(0);
  });
  for (const [label,count] of [['2/Day Each',2],['每项3/日',3],['3次/每日 Each',3]] as const) test('daily spell counts survive source, formal manifest and real Cast projection: '+label,async()=>{
    const input=single('**Innate Magic.** The creature casts the following spells; its spellcasting ability is Wisdom.\n'+label+': Alarm, Blur');
    const {result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest,group=manifest.spellcastingGroups[0];
    expect(group.spellRefs.map((r:any)=>r.uses)).toEqual([0,1].map(()=>({value:count,recovery:'day',shared:false})));
    for(const ref of group.spellRefs){const {activity}=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'abcdefghijklmnop',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'});expect(activity.uses?.max).toBe(String(count));expect(activity.consumption.targets).toEqual([{type:'activityUses',value:'1'}]);}
  });
  for (const label of ['Shared 2/day','共用2/日','2/day (shared)']) test('explicit shared daily spells consume one real feature pool: '+label,async()=>{
    const input=single('**Innate Magic.** The creature casts the following spells; its spellcasting ability is Wisdom.\n'+label+': Alarm, Blur\n1/day: Fly');
    const {result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest,group=manifest.spellcastingGroups[0];
    const feature=actor.items.find((i:any)=>i.flags?.['fvtt-json-generator-spell-resolver']?.groupId===group.groupId);
    expect(feature.system.uses).toMatchObject({spent:0,max:'2',recovery:[{period:'day',type:'recoverAll'}]});
    for(const ref of group.spellRefs){const {activity}=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'abcdefghijklmnop',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'});expect(activity.type).toBe('cast');expect(activity.consumption.targets).toEqual([{type:ref.uses.shared?'itemUses':'activityUses',value:'1'}]);expect(activity.uses?.max).toBe(ref.uses.shared?undefined:'1');}
    const changed=structuredClone(actor);changed.items.find((i:any)=>i.flags?.['fvtt-json-generator-spell-resolver']?.groupId===group.groupId).system.uses.max='3';
    expect(auditMonsterIntakeSourceProjection(input,(await extract(input)),result.prepared!.bundle.actors[0]!.source,changed).status).toBe('needs_review');
  });
  for(const grant of ['1/Day: Blur, Fly','Unknown grant: Blur','1/day: Blur (only if the target is in darkness)'])test('complex or ambiguous spell grants preserve GM rules and supported real spells: '+grant,async()=>{
    const input=single('**Innate Magic.** The creature casts the following spells; its spellcasting ability is Wisdom.\nAt will: Alarm\n'+grant);
    const {ir,result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    expect(actor.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups[0].spellRefs.map((r:any)=>r.originalName)).toEqual(['Alarm']);
    expect((ir.creature.spellcasting![0] as any).manualGrants.map((r:any)=>r.quote).join('\n')).toContain(grant);
    expect(actor.items[0].system.description.value).toContain(grant);expect(actor.items[0].system.description.value).toContain('GM');
  });
  test('a wholly complex spell feature still generates its complete explicit GM item without fake casts',async()=>{
    const input=single('**Innate Magic.** The creature casts the following spells; its spellcasting ability is Wisdom.\n1/Day: Blur, Fly');
    const {result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    expect(actor.flags?.['fvtt-json-generator-spell-resolver']?.spellManifest).toBeUndefined();expect(actor.items[0].system.description.value).toContain('1/Day: Blur, Fly');expect(actor.items[0].system.description.value).toContain('GM');
    expect((Object.values(actor.items[0].system.activities) as any[]).map(a=>a.type)).toEqual(['utility']);
  });
  test('an unproven required casting ability blocks rather than reviving fake spell-use counters',async()=>{
    const input=single('**Innate Magic.** The creature casts the following spells.\n1/Day Each: Alarm, Blur');
    await expect(extract(input)).rejects.toThrow('UNPROVEN_STAGED_SPELLCASTING_ABILITY');
  });
  test('daily counts and sharing cannot be changed independently of source evidence',async()=>{
    const input=single('**Innate Magic.** The creature casts the following spells; its spellcasting ability is Wisdom.\nShared 3/day: Alarm, Blur');
    const original=await extract(input);
    for(const mutate of [(ir:any)=>{ir.creature.spellcasting[0].usageGroups[0].count=2;},(ir:any)=>{ir.creature.spellcasting[0].usageGroups[0].usage='daily-each';}]){
      const changed=structuredClone(original);mutate(changed);expect(auditMonsterIntakeSource(input,changed).blocking.some(f=>f.code==='SPELL_DAILY_GRANT_EVIDENCE_MISMATCH')).toBeTrue();
    }
  });
  test('separate shared pools keep their boundaries instead of silently merging',async()=>{
    const input=single('**Innate Magic.** The creature casts the following spells; its spellcasting ability is Wisdom.\nShared 2/day: Alarm, Blur\nShared 3/day: Fly, Invisibility');
    const {ir,result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    expect(ir.creature.spellcasting).toHaveLength(2);expect(ir.creature.spellcasting!.map(group=>group.usageGroups.length)).toEqual([1,1]);
    const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
    expect(manifest.spellcastingGroups.map((group:any)=>group.spellRefs.length)).toEqual([2,2]);
    expect(actor.items.map((item:any)=>item.system.uses?.max)).toEqual(['2','3']);
    expect(new Set(manifest.spellcastingGroups.map((group:any)=>group.featureItemKey)).size).toBe(2);
    expect(manifest.spellcastingGroups.flatMap((group:any)=>group.spellRefs.map((ref:any)=>ref.originalName))).toEqual(['Alarm','Blur','Fly','Invisibility']);
  });
  for(const [heading,activation] of [['Actions','action'],['Bonus Actions','bonus'],['Reactions','reaction']] as const)test('source spell timing reaches the formal feature marker: '+activation,async()=>{
    const input=source.slice(0,source.indexOf('Damage Transfer.'))+heading+'\nInnate Magic. The creature casts the following spells; its spellcasting ability is Wisdom.\n2/Day Each: Alarm, Blur\n';
    const {result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    expect(actor.items[0].flags.fvttJsonGenerator.spellcastingActivationType).toBe(activation);
  });
  test('legendary casting keeps the complete source and cost2 on each real Cast contract',async()=>{
    const input=source.slice(0,source.indexOf('Damage Transfer.'))+'Legendary Actions\nThe creature can take 3 legendary actions.\nInnate Magic (Costs 2 Actions). The creature casts the following spells; its spellcasting ability is Wisdom.\nAt will: Alarm, Blur\n';
    const {result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest,group=manifest.spellcastingGroups[0];
    expect(group.spellRefs.map((ref:any)=>ref.originalName)).toEqual(['Alarm','Blur']);expect(actor.items[0].system.description.value).toContain('At will: Alarm, Blur');
    expect(actor.items[0].flags.fvttJsonGenerator).toMatchObject({spellcastingActivationType:'legendary',spellcastingActivationCost:2});
    expect((Object.values(actor.items[0].system.activities)[0] as any).activation.type).toBe('');
    for(const ref of group.spellRefs){const {activity}=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'abcdefghijklmnop',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop',activationType:'legendary',activationCost:2});expect(activity.activation).toEqual({type:'legendary',value:2,override:true});expect(activity.consumption.targets).toEqual([]);}
  });
  for(const list of ['0/Day Each: Alarm, Blur','-2/Day Each: Alarm, Blur'])test('invalid daily counts remain blocking rather than become valid native grants: '+list,async()=>{
    await expect(extract(single('**Innate Magic.** The creature casts the following spells; its spellcasting ability is Wisdom.\n'+list))).rejects.toThrow();
  });
  for(const [rule,value,units,allComponents] of [
    ['**Spellcasting.** The creature casts the following spells without any spell components; its spellcasting ability is Wisdom.\nAt will: Disguise Self (lasts 24 hours)','24','hour',true],
    ['**Spellcasting.** The creature casts the following spells without material components; its spellcasting ability is Wisdom.\nAt will: Blur (lasts for 7 minutes)','7','minute',false],
    ['**施法。**该生物施展以下法术，使用智力作为施法属性，无需任何法术成分。\n随意：隐形术（持续2天）','2','day',true],
    ['**施法。**该生物施展以下法术，使用智力作为施法属性，不需要法术成分。\n随意：隐形术（持续2天）','2','day',true],
    ['**Spellcasting.** The creature casts the following spells requiring no spell components; its spellcasting ability is Wisdom.\nAt will: Blur (lasts for 7 minutes)','7','minute',true],
  ] as const)test('source spell variants cross staged extraction, manifest and native Cast: '+value+units,async()=>{
    const {result,actor}=await formal(single(rule));expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest,group=manifest.spellcastingGroups[0],ref=group.spellRefs[0];
    const {activity,literalRestrictions}=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'abcdefghijklmnop',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'});
    expect(activity.duration).toEqual({value,units,concentration:false,override:true});expect(activity.spell.properties).toEqual(allComponents?['vocal','somatic','material']:['material']);expect(literalRestrictions).toEqual([]);
  });
  test('a source single-spell all-component waiver reaches native Cast',async()=>{
    const {result,actor}=await formal(single('**Feather Ward.** The creature casts Feather Fall without any spell components, using Wisdom as its spellcasting ability.'));expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest,group=manifest.spellcastingGroups[0],ref=group.spellRefs[0];expect(buildCastActivitySource({manifestId:manifest.manifestId,featureId:'abcdefghijklmnop',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'}).activity.spell.properties).toEqual(['vocal','somatic','material']);
  });
  for(const clause of ['not without any spell components','without material components unless the target is hidden'])test('a negated or conditional component waiver is preserved without an unrestricted Cast: '+clause,async()=>{
    const {result,actor}=await formal(single('**Spellcasting.** The creature casts the following spells '+clause+'; its spellcasting ability is Wisdom.\nAt will: Blur'));
    expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();expect(actor.flags?.['fvtt-json-generator-spell-resolver']?.spellManifest).toBeUndefined();expect(actor.items[0].system.description.value).toContain(clause);
  });
  test('unsupported source casting qualifier blocks unrestricted Cast creation',async()=>{
    const {result,actor}=await formal(single('**Spellcasting.** The creature casts the following spells; its spellcasting ability is Wisdom.\nAt will: Blur (only if the target is in darkness)'));expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();expect(actor.flags?.['fvtt-json-generator-spell-resolver']?.spellManifest).toBeUndefined();expect(actor.items[0].system.description.value).toContain('only if the target is in darkness');expect((Object.values(actor.items[0].system.activities) as any[]).every(activity=>activity.type!=='cast')).toBeTrue();
  });
  for(const [bonus,formula] of [[6,'2d6+3'],[9,'2d6+4']] as const)test('Chinese hybrid attacks keep two modes and one selected extra damage part: '+bonus,async()=>{
    const input=single(`**魂刃Soul Blade。**近战或远程攻击检定：+${bonus}，触及10尺或射程90尺。命中：10（${formula}）挥砍伤害，外加3（1d6）寒冷或火焰伤害（由使用者选择）。如果目标因此攻击生命值降至0，其承受以下效应。体质豁免：DC16。失败：目标死亡。`);
    const {ir,result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    const f=ir.creature.actions[0]!;expect(f.attack).toEqual({type:'mwak',toHit:bonus,reach:10,range:90});
    expect(f.damage).toEqual([{formula,type:'slashing',relationship:'base'},{formula:'1d6',type:'cold',types:['cold','fire'],relationship:'additional'}]);expect(f.save).toBeUndefined();
    const item=actor.items.find((i:any)=>i.name.includes('Soul Blade'));expect(item.effects.map((e:any)=>e.statuses)).toEqual([['dead']]);expect(item.system.range).toMatchObject({reach:10,value:90,units:'ft'});
    const all=Object.values(item.system.activities) as any[],activities=all.filter(a=>a.type==='attack');expect(all.map(a=>a.type).sort()).toEqual(['attack','attack','save']);
    expect(activities.map(a=>a.attack.type.value).sort()).toEqual(['melee','ranged']);expect(activities.find(a=>a.attack.type.value==='ranged').range).toMatchObject({value:90,units:'ft',override:true});
    for(const activity of activities){expect(activity.damage.parts.filter((p:any)=>p.number===1&&p.denomination===6)).toHaveLength(1);expect(activity.damage.parts.find((p:any)=>p.number===1&&p.denomination===6).types).toEqual(['cold','fire']);}
    expect(item.system.description.value).toContain('生命值降至0');expect(item.system.description.value).toContain('体质豁免：DC16');
    for(const mutate of [
      (i:any)=>{delete i.system.activities[Object.keys(i.system.activities)[1]!];},
      (i:any)=>{(Object.values<any>(i.system.activities).find(a=>a.type==='attack'&&a.attack.type.value==='ranged')!).range.value=10;},
      (i:any)=>{(Object.values<any>(i.system.activities).find(a=>a.type==='attack'&&a.attack.type.value==='ranged')!).damage.parts.find((p:any)=>p.number===1&&p.denomination===6).types=['cold'];},
    ]){const changed=structuredClone(actor);mutate(changed.items.find((i:any)=>i.name.includes('Soul Blade')));expect(auditMonsterIntakeSourceProjection(input,ir,result.prepared!.bundle.actors[0]!.source,changed).status).toBe('needs_review');}
    const wrong=structuredClone(ir);(wrong.creature.actions[0]!.damage![1] as any).types=['cold','radiant'];expect(auditMonsterIntakeSource(input,wrong).blocking.some(f=>f.code==='MIXED_FEATURE_SOURCE_CONFLICT')).toBeTrue();
  });
  test('a qualified Chinese extra damage choice remains GM text rather than unconditional damage',async()=>{
    const {ir,result}=await formal(single('**寒刃Cold Blade。**近战攻击检定：+6，触及5尺。命中：7（1d8+3）穿刺伤害，外加3（1d6）寒冷或火焰伤害（如果目标倒地）。'));
    expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();expect(ir.creature.actions[0]!.damage).toEqual([{formula:'1d8+3',type:'piercing',relationship:'base'}]);expect(ir.creature.actions[0]!.manualRemainder).toContain('如果目标倒地');
  });
  for(const [rule,kind,formula] of [
    ['Stone Blow. Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) bludgeoning damage. The target is Grappled until it escapes.','mwak','2d6+3'],
    ['Ice Shard. Ranged Weapon Attack: +6 to hit, range 30/120 ft., one creature. Hit: 7 (1d8 + 3) piercing damage. If the target is Prone, it takes an extra 2d6 cold damage.','rwak','1d8+3'],
    ['Force Touch. Melee Spell Attack: +8 to hit, reach 5 ft., one object. Hit: 7 (2d6) force damage, plus 3 (1d6) fire damage if the target is Prone.','msak','2d6'],
  ] as const)test('primary action survives its own rider: '+rule.split('.')[0],async()=>{
    const input=single(rule!),{ir,result,actor}=await formal(input);
    expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    const feature=ir.creature.actions[0]!;expect(feature.attack?.type).toBe(kind);
    expect(feature.damage).toEqual([{formula,type:kind==='mwak'?'bludgeoning':kind==='rwak'?'piercing':'force',relationship:'base'}]);
    expect(feature.executionMode).toBe('native-with-gm');
    const item=actor.items.find((x:any)=>x.name.startsWith(feature.name));for(const effect of item.effects){expect(effect.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(effect.flags.fvttJsonGenerator.conditionLifecycle.sourceText).toBe(rule);}
    expect(Object.values(item.system.activities).map((x:any)=>x.type)).toEqual(['attack']);
    const broken=structuredClone(actor);broken.items.find((x:any)=>x.name.startsWith(feature.name)).system.activities={};
    expect(auditMonsterIntakeSourceProjection(input,ir,result.prepared!.bundle.actors[0]!.source,broken).status).toBe('needs_review');
  });
  test('Save damage has source-explicit none/half outcomes instead of unconditional defaults',async()=>{
    for(const success of ['Half damage','No damage']){
      const {ir,result,actor}=await formal(single(`Storm Pulse. Each creature within 30 feet must make a DC 14 Wisdom saving throw. Failure: 9 (2d8) lightning damage. Success: ${success}. The target is pushed if it is smaller.`));
      expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
      expect(ir.creature.actions[0]!.save?.outcome).toBe(success.startsWith('Half')?'half':'none');
      const item=actor.items.find((x:any)=>x.name==='Storm Pulse');expect(item.effects).toEqual([]);
      expect((Object.values(item.system.activities)[0] as any).damage.onSave).toBe(success.startsWith('Half')?'half':'none');
    }
  });
  test('ordinary successful-save wording retains half damage while a qualified success remains manual',async()=>{
    for(const qualifier of ['', ' if the target is prone']){
      const {ir,result,actor}=await formal(single(`Scalding Pulse. Each creature within 15 feet must succeed on a DC 10 Dexterity saving throw or take 4 (1d8) fire damage, or half as much damage on a successful one${qualifier}.`));
      const feature=ir.creature.actions[0]!;
      expect(feature.save?.dc).toBe(10);
      if(qualifier){expect(result.prepared?.actors).toHaveLength(1);expect(result.prepared!.actors[0]!.status).not.toBe('accepted');expect(auditMonsterIntakeSource(ir.coverage.map(entry=>entry.quote).join(''),ir).blocking.some(f=>f.code==='SOURCE_BASIC_OPERATION_OMITTED')).toBe(true);expect(feature.damage).toBeUndefined();expect(feature.manualRemainder).toContain('if the target is prone');}
      else{expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();expect(feature.damage?.[0]?.formula).toBe('1d8');expect((Object.values(actor.items.find((x:any)=>x.name==='Scalding Pulse').system.activities)[0] as any).damage.onSave).toBe('half');}
    }
  });
  test('the ordinary taking damage on a failed save clause is an executable damage branch',async()=>{
    const {ir,result,actor}=await formal(single('Cloud Pulse (Recharge 6). Each creature in the area must succeed on a DC 10 Dexterity saving throw, taking 4 (1d8) fire damage on a failed save, or half as much damage on a successful one.'));
    expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    expect(ir.creature.actions[0]!.damage).toEqual([{formula:'1d8',type:'fire',relationship:'base'}]);
    const item=actor.items.find((x:any)=>x.name.startsWith('Cloud Pulse'));
    expect((Object.values(item.system.activities)[0] as any).damage.onSave).toBe('half');
  });
  for(const size of [15,30,60])test('source-explicit cone geometry survives the Save projection: '+size,async()=>{
    const input=single(`Cone Pulse. The creature exhales a ${size}-foot cone. Each creature in that area must succeed on a DC 10 Dexterity saving throw, taking 4 (1d8) fire damage on a failed save, or half as much damage on a successful one.`);
    const {ir,result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    expect(ir.creature.actions[0]!.aoe).toEqual({shape:'cone',radius:size});
    const activity=Object.values(actor.items.find((x:any)=>x.name==='Cone Pulse').system.activities)[0] as any;
    expect(activity.target.template.type).toBe('cone');expect(Number(activity.target.template.size)).toBe(size);
    const wrong=structuredClone(ir);wrong.creature.actions[0]!.aoe!.radius=size+1;
    expect(auditMonsterIntakeSource(input,wrong).blocking.some(f=>f.code==='MIXED_FEATURE_SOURCE_CONFLICT')).toBeTrue();
  });
  for(const [size,origin] of [[15,'itself'],[30,'you'],[60,'the cloaker']] as const)test('source-centered Save area is a native emanation, not placement range: '+size,async()=>{
    const input=single(`Dread Echo. Each creature within ${size} feet of ${origin} that can hear the sound must succeed on a DC 13 Wisdom saving throw or become frightened until the end of its next turn.`);
    const {ir,result,actor}=await formal(input);expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    expect(ir.creature.actions[0]!.aoe).toEqual({shape:'radius',radius:size});
    expect(ir.creature.actions[0]!.range).toBeUndefined();
    const activity=Object.values(actor.items.find((x:any)=>x.name==='Dread Echo').system.activities)[0] as any;
    expect(activity.target.template.type).toBe('radius');expect(Number(activity.target.template.size)).toBe(size);expect(activity.range.units).toBe('self');
    for(const mutate of [
      (a:any)=>{delete a.target.template.type;},
      (a:any)=>{a.target.template.size=size+5;},
      (a:any)=>{a.range={value:'60',units:'ft',override:false};},
    ]){const changed=structuredClone(actor);mutate(Object.values(changed.items.find((x:any)=>x.name==='Dread Echo').system.activities)[0]);expect(auditMonsterIntakeSourceProjection(input,ir,result.prepared!.bundle.actors[0]!.source,changed).status).toBe('needs_review');}
    const wrong=structuredClone(ir);wrong.creature.actions[0]!.aoe!.radius=size+1;
    expect(auditMonsterIntakeSource(input,wrong).blocking.some(f=>f.code==='MIXED_FEATURE_SOURCE_CONFLICT')).toBeTrue();
  });
  for(const origin of ['a point','the target','an ally','the other creature'])test('a different or unknown area origin is not guessed as self: '+origin,async()=>{
    const {ir,result}=await formal(single(`Dread Echo. Each creature within 30 feet of ${origin} must succeed on a DC 13 Wisdom saving throw or become frightened.`));
    expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();expect(ir.creature.actions[0]!.aoe).toBeUndefined();
    expect(ir.creature.actions[0]!.range).toBeUndefined();
    const wrong=structuredClone(ir);wrong.creature.actions[0]!.range=30;
    expect(auditMonsterIntakeSource(single(`Dread Echo. Each creature within 30 feet of ${origin} must succeed on a DC 13 Wisdom saving throw or become frightened.`),wrong).blocking.some(f=>f.code==='MIXED_FEATURE_SOURCE_CONFLICT')).toBeTrue();
  });
  test('mixed saved IR cannot inject attack damage DC or effects into a resource-only rule',async()=>{
    const ir=await extract();
    for(const mutate of [
      (x:any)=>{x.creature.actions.find((f:any)=>f.name==='Bite').attack.toHit=99;},
      (x:any)=>{x.creature.actions.find((f:any)=>f.name==='Moan').save.dc=99;},
      (x:any)=>{x.creature.actions.find((f:any)=>f.name.startsWith('Phantasms')).damage=[{formula:'9d20',type:'fire',relationship:'base'}];},
      (x:any)=>{x.creature.actions.find((f:any)=>f.name==='Bite').appliedConditions=[{statuses:['blinded']}];},
      (x:any)=>{x.creature.actions.find((f:any)=>f.name==='Bite').recharge=[5,6];},
      (x:any)=>{x.creature.actions.find((f:any)=>f.name==='Bite').legendaryCost=9;},
      (x:any)=>{x.creature.actions.find((f:any)=>f.name==='Bite').activationType='bonus';},
    ]){const changed=structuredClone(ir);mutate(changed);expect(auditMonsterIntakeSource(source,changed).blocking.some(f=>f.code==='MIXED_FEATURE_SOURCE_CONFLICT')).toBeTrue();}
  });
  test('automatic feature mode retains its fast path and asks about complete partial rules in every language',async()=>{
    const requests:unknown[]=[];
    await extract(single('Unfamiliar Echo. It makes an attack using a variable chosen at dawn.'),'auto',requests);
    expect(requests).toHaveLength(2);expect((requests[1] as any).source).toContain('Unfamiliar Echo');
    const known:unknown[]=[];await extract(source,'auto',known);expect(known.length).toBeGreaterThan(1);
    expect(known.slice(1).every((payload:any)=>payload.source&&payload.context&&payload.verifiedFacts)).toBe(true);
    expect(known.filter((p:any)=>p.unitId).some((p:any)=>/^Bite\b/u.test(p.source)&&p.verifiedFacts.attack?.toHit===6)).toBeTrue();
    const simple:unknown[]=[];await extract(single('Spear. Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 7 (1d8+3) piercing damage.'),'auto',simple);expect(simple).toHaveLength(1);
    const chinese:unknown[]=[];await extract(single('**陌生回响。**目标需按黎明所选规则进行一次检定。'),'auto',chinese);expect(chinese).toHaveLength(2);expect((chinese[1] as any).source).toContain('陌生回响');
  });
  test('actual staged source route retains attacks, Save and rest resources',async()=>{
    const ir=await extract();const actions=ir.creature.actions;
    expect(actions.find(x=>x.name==='Bite')?.attack).toEqual({type:'mwak',toHit:6,reach:5});
    expect(actions.find(x=>x.name==='Tail')?.damage).toEqual([{formula:'1d8+3',type:'slashing',relationship:'base'}]);
    expect(actions.find(x=>x.name==='Moan')?.save).toMatchObject({dc:13,ability:'wis'});
    expect(actions.find(x=>x.name==='Moan')?.aoe).toEqual({shape:'radius',radius:60});
    expect(actions.find(x=>x.name.startsWith('Phantasms'))?.uses).toEqual({max:1,period:'shortRest'});
  });
  test('new mixed execution does not silently accept another Foundry target',async()=>{
    const ir=await extract(),parsed=new YamlParser().parse(renderMonsterIntakeMarkdown(ir));
    const actor=new ActorGenerator({fvttVersion:'12',effectProfile:'core',translationService:null}).generate(parsed);
    expect(actor.items).toHaveLength(ir.creature.traits.length+ir.creature.actions.length);
    for(const feature of [...ir.creature.traits,...ir.creature.actions])expect(actor.items.find((item:any)=>item.name===feature.name).system.description.value).toContain(feature.description.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/\r\n|\n/gu,'<br>'));
  });
  test('synthetic Chinese approval preserves the mixed resource and keeps program notes out of authored English',async()=>{
    const {result}=await formal(single('Quiet Mantle (1/Day). The creature cannot speak.'));
    expect(result.prepared).toBeDefined();
    const words:Record<string,string>={'Quiet Mantle':'静默披覆','The creature cannot speak.':'该生物无法说话。','Cloaker':'斗篷怪','Saved source regression':'保存来源回归','1/Day':'1/日',
      'Large aberration':'大型异怪','chaotic neutral':'混乱中立','Armor Class':'护甲等级','natural armor':'天生护甲','Hit Points':'生命值','Speed':'速度','ft.':'尺','fly':'飞行',
      'STR DEX CON INT WIS CHA':'力量 敏捷 体质 智力 感知 魅力','Skills':'技能','Stealth':'隐匿','Senses':'感官','darkvision':'黑暗视觉','passive Perception':'被动察觉','Languages':'语言','Deep Speech':'深潜语','Undercommon':'地底通用语','Challenge':'挑战等级','XP':'经验值','Actions':'动作'};
    const translate=(source:string)=>Object.entries(words).reduce((text,[from,to])=>text.replaceAll(from,to),source);
    const draft=await draftForgeEncounterLocalization({prepared:result.prepared!,service:{model:'synthetic-test-only',reviewModel:'disabled',
      translate:async request=>({texts:request.texts.map(field=>({id:field.id,text:translate(field.source)}))}),review:stop}});
    const approved=await approveForgeEncounterLocalization({prepared:result.prepared!,draft,gmId:'SYNTHETIC-OFFLINE-TEST'});
    const reread=await prepareForgeEncounter(serializeForgeEncounterPackage(approved.bundle));
    const item=(reread.actors[0]!.artifact as any).items[0];
    const [chinese,english]=item.system.description.value.split('<hr><h3>英文原文</h3>');
    expect(chinese).toContain('该生物无法说话。');expect(chinese).toContain('次数消耗与恢复');
    expect(english).toContain('The creature cannot speak.');expect(english).not.toContain('本项已配置');
    expect((Object.values(item.system.activities)[0] as any).consumption.targets[0].type).toBe('itemUses');expect(item.effects).toEqual([]);
  });
  test('formal chain produces usable native operations without attached automatic effects',async()=>{
    const {ir,result,actor}=await formal();
    expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
    for(const [name,type] of [['Bite','attack'],['Tail','attack'],['Moan','save'],['Phantasms','utility']]){
      const item=actor.items.find((x:any)=>x.name.startsWith(name));
      expect(Object.values(item.system.activities).map((x:any)=>x.type)).toContain(type);
      // Its target-next-turn expiry remains GM-assisted; do not replace it
      // with an indefinite frightened Effect.
      for(const effect of item.effects){expect(effect.flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(effect.flags.fvttJsonGenerator.conditionLifecycle.sourceText).toContain(name==='Phantasms'?'Phantasms':name);}
    }
    const item=actor.items.find((x:any)=>x.name.startsWith('Phantasms'));
    expect(item.system.description.value).toContain('本项已配置：次数消耗与恢复');
    expect(item.system.uses).toEqual({spent:0,max:'1',recovery:[{period:'sr',type:'recoverAll'}]});
    expect((Object.values(item.system.activities)[0] as any).consumption.targets).toEqual([{type:'itemUses',target:'',value:'1',scaling:{mode:'',formula:''}}]);
    for(const mutate of [
      (x:any)=>{x.items.find((i:any)=>i.name==='Bite').effects=[{name:'Unbound',changes:[{key:'system.attributes.hp.value',mode:2,value:'-10'}]}];},
      (x:any)=>{const i=x.items.find((i:any)=>i.name.startsWith('Phantasms'));(Object.values(i.system.activities)[0] as any).consumption.targets=[];},
      (x:any)=>{const i=x.items.find((i:any)=>i.name==='Moan');(Object.values(i.system.activities)[0] as any).save.dc.formula='99';},
    ]){const changed=structuredClone(actor);mutate(changed);expect(auditMonsterIntakeSourceProjection(source,ir,result.prepared!.bundle.actors[0]!.source,changed).status).toBe('needs_review');}
  });
});
