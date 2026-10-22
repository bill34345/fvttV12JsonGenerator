import {test,expect} from 'bun:test';
import yaml from 'js-yaml';
import fixture from './fixtures/forge-2024-pilot-frozen-boundaries.json';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {validateStagedBaseFacts,assembleStagedMonsterIntake} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {stagedSpellcastingGroups} from '../packages/intake-ai/src/staged-spellcasting';
import {decodeCategoryFormV2} from '../packages/intake-ai/src/category-form-v2';
import {adaptCategoryFormV2,completeCategoryFormSpellcasting} from '../packages/intake-ai/src/category-form-v2-adapter';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {validateMonsterIntakeIR} from '@fvtt-json-generator/intake-ai/validator';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {adaptParsedActorToCanonical} from '../packages/generation/src/adapters';
import {verifyGeneratedDocument} from '../packages/generation/src/verification';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';

function chain(id:'P2'|'P3'='P3',mutate?:(f:any)=>void){
 const f=structuredClone(fixture.cases.find(c=>c.id===id)!);mutate?.(f);
 const source=f.source,plan=splitStagedMonsterSource({source,sourceSha256:sha256(source),candidate:{id,label:id,start:0,end:source.length,quote:source}});
 const base=validateStagedBaseFacts(plan,JSON.parse(f.baseReply));
 const form=decodeCategoryFormV2(JSON.parse('correctionWholeReply'in f?f.correctionWholeReply!:f.wholeReply!),plan);
 const ir=completeCategoryFormSpellcasting(plan,assembleStagedMonsterIntake(plan,base,adaptCategoryFormV2(plan,base,form)),form);
 expect(validateMonsterIntakeIR(source,ir).findings.filter(x=>x.blocking)).toEqual([]);
 const markdown=renderMonsterIntakeMarkdown(ir),parsed=new YamlParser().parse(markdown);
 const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null}).generate(parsed) as any;
 expect(verifyGeneratedDocument({canonical:adaptParsedActorToCanonical(parsed),output:actor,target:'14',effectProfile:'core'}).diagnostics.filter(x=>x.severity==='error')).toEqual([]);
 expect(verifyMonsterIntake(source,ir,markdown,actor).findings).toEqual([]);
 return{f,source,plan,base,form,ir,markdown,actor};
}
function nativeReference(actor:any,name='Mind Invasion'){
 const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
 const feature=actor.items.find((i:any)=>i.name.startsWith(name)&&i.flags?.fvttJsonGenerator?.spellcastingActivationType==='legendary');
 expect(feature?.flags?.fvttJsonGenerator?.spellcastingFeatureKey).toBeDefined();
 const group=manifest.spellcastingGroups.find((g:any)=>g.featureItemKey===feature.flags.fvttJsonGenerator.spellcastingFeatureKey);
 expect(group).toBeDefined();
 const ref=group.spellRefs[0];
 const built=buildCastActivitySource({manifestId:manifest.manifestId,featureId:feature._id??'ProofFeature0001',group,ref,selectedUuid:'Compendium.dnd-players-handbook.spells.Item.phbsplMindSpike0',activationType:feature.flags.fvttJsonGenerator.spellcastingActivationType,activationCost:feature.flags.fvttJsonGenerator.spellcastingActivationCost});
 return{manifest,group,feature,ref,built};
}

test('unchanged frozen2024 Mind Invasion becomes one source-proven legendary Cast',()=>{
 const before=JSON.stringify(fixture),{actor,form}=chain();
 expect(form.rows.find(r=>r.编号==='unit-10')!.施法).toBeNull();
 const {group,feature,ref,built}=nativeReference(actor);
 expect(group.ability).toBe('cha');expect(group.saveDc).toBe(17);expect(group.spellRefs).toHaveLength(1);
 expect(ref.method).toBe('at-will');expect(ref.ignoresMaterialComponents).toBe(true);
 expect(feature.system.description.value).toContain('The dragon uses Spellcasting to cast');
 expect(built.activity.activation).toEqual({type:'legendary',value:1,override:true});
 expect(built.activity.spell.level).toBe(3);expect(built.activity.spell.properties).toEqual(['material']);
 expect(built.activity.consumption).toEqual({spellSlot:false,targets:[]});expect(built.activity.uses).toBeUndefined();
 expect(actor.system.resources.legact.max).toBe(3);expect(JSON.stringify(fixture)).toBe(before);
});

function changeForm(f:any,change:(rows:any[])=>void){
 const reply=JSON.parse(f.wholeReply),raw=reply.markdown.replace(/^```yaml\s*/u,'').replace(/```\s*$/u,'');
 const form=yaml.load(raw) as Record<string,any[]>;change(Object.values(form).flat());
 f.wholeReply=JSON.stringify({markdown:'```yaml\n'+yaml.dump(form,{lineWidth:-1})+'```'});
}
test('renamed source parent and a two-use legendary carrier are independently bound',()=>{
 const {actor}=chain('P3',f=>{
  f.source=f.source.replaceAll('Spellcasting','Psionics').replace('Mind Invasion.','Thought Surge (Costs 2 Actions).');
  changeForm(f,rows=>{for(const row of rows){if(row.名称==='Spellcasting')row.名称='Psionics';if(row.特殊规则)row.特殊规则=row.特殊规则.replaceAll('Spellcasting','Psionics');if(row.编号==='unit-10'){row.名称='Thought Surge (Costs 2 Actions)';row.传奇动作消耗=2;}}});
 });
 const {built,ref}=nativeReference(actor,'Thought Surge');
 expect(built.activity.activation).toEqual({type:'legendary',value:2,override:true});
 expect(ref.reuseOf).toBeDefined();expect(built.activity.spell.challenge.save).toBe('17');
});
test('a multiline fourthlevel source reference preserves complete own evidence and level',()=>{
 const {actor,ir}=chain('P3',f=>{
  f.source=f.source.replaceAll('level 3 version','level 4 version').replace(/(Mind Invasion\.[\s\S]*?to\s+cast\s+)Mind Spike/u,'$1Mind\nSpike');
  changeForm(f,rows=>{for(const row of rows){if(row.特殊规则)row.特殊规则=row.特殊规则.replaceAll('3环','4环');if(row.施法)for(const spell of row.施法.法术)if(spell.限制)spell.限制=spell.限制.replaceAll('3环','4环');}});
 });
 const {built}=nativeReference(actor);expect(built.activity.spell.level).toBe(4);
 const ref=ir.creature.spellcasting!.find(g=>g.featureName==='Mind Invasion')!.usageGroups[0]!.spellRefs[0]!;
 expect(ref.evidence[0]!.quote).toBe('Mind\nSpike');
});
test('a supplied explicit casting row must match the same source parent',()=>{
 const fill=(f:any,ability:string)=>changeForm(f,rows=>{rows.find(r=>r.编号==='unit-10').施法={属性:ability,豁免DC:17,命中加值:null,无需材料:true,法术:[{名称:'Mind Spike',次数:null,恢复:'随意',限制:'3环版本'}]};});
 expect(nativeReference(chain('P3',f=>fill(f,'cha')).actor).built.activity.spell.ability).toBe('cha');
 expect(()=>chain('P3',f=>fill(f,'int'))).toThrow('V2_REFERENCED_SPELL_FACT_CONFLICT');
});
for(const wrong of ['missing-rule','wrong-spell-name','invented-damage','wrong-legendary-cost'] as const)test('wrong frozen-form proposal remains blocking: '+wrong,()=>{
 expect(()=>chain('P3',f=>changeForm(f,rows=>{
  const row=rows.find(r=>r.编号==='unit-10');
  if(wrong==='missing-rule')row.特殊规则=null;
  if(wrong==='wrong-spell-name')row.特殊规则=row.特殊规则.replace('Mind Spike','Magic Missile');
  if(wrong==='invented-damage')row.伤害=[{公式:'1d6',伤害类型:'心灵',生效条件:null,倍率:1,成功时倍率:null}];
  if(wrong==='wrong-legendary-cost')row.传奇动作消耗=2;
 }))).toThrow();
});
for(const wrong of ['parent','spell','level'] as const)test('an unresolved or contradictory exact source reference stays blocked: '+wrong,()=>{
 expect(()=>chain('P3',f=>{
  const offset=f.source.indexOf('Mind Invasion.');
  let tail=f.source.slice(offset);
  if(wrong==='parent')tail=tail.replace('uses Spellcasting','uses Unknown Art');
  if(wrong==='spell')tail=tail.replace('Mind Spike','Magic Missile');
  if(wrong==='level')tail=tail.replace('level 3 version','level 4 version');
  f.source=f.source.slice(0,offset)+tail;
 })).toThrow();
});
for(const wrong of ['link','profile','components','level','evidence'] as const)test('source validation independently rejects altered inherited facts: '+wrong,()=>{
 const {source,ir}=chain();const copy=structuredClone(ir),group=copy.creature.spellcasting!.find(g=>g.featureName==='Mind Invasion')!;
 const ref=group.usageGroups[0]!.spellRefs[0]!;
 if(wrong==='link')ref.reuseOf!.refId='unknown-definition';
 if(wrong==='profile')group.ability='int';
 if(wrong==='components')group.componentWaivers=[];
 if(wrong==='level')ref.restrictions[0]!.text='(level 4 version)';
 if(wrong==='evidence')ref.evidence=copy.creature.spellcasting![0]!.usageGroups[0]!.spellRefs[1]!.evidence;
 expect(validateMonsterIntakeIR(source,copy).findings.some(f=>f.blocking&&f.code==='SPELL_REFERENCE_SOURCE_MISMATCH')).toBe(true);
});
test('foreign casting is not projected onto this Actor and unrelated Mage operations remain',()=>{
 const {actor}=chain('P3',f=>{const offset=f.source.indexOf('Mind Invasion.');f.source=f.source.slice(0,offset)+f.source.slice(offset).replace('The dragon uses','An ally uses');});
 expect(actor.items.find((i:any)=>i.name==='Mind Invasion').flags.fvttJsonGenerator.spellcastingFeatureKey).toBeUndefined();
 const mage=chain('P2').actor,groups=mage.flags['fvtt-json-generator-spell-resolver'].spellManifest.spellcastingGroups;
 expect(groups).toHaveLength(3);expect(groups.every((g:any)=>g.spellRefs.every((r:any)=>r.reuseOf===undefined))).toBe(true);
});

test('two same-named source parents cannot silently choose one',()=>{
 const {f}=chain(),source=f.source.replace('1/Day: Geas\n','1/Day: Geas.\n').replace('Legendary Actions','Spellcasting. The dragon casts the following spells using Charisma as the spellcasting ability (spell save DC 17):\nAt Will: Mind Spike (level 3 version)\nLegendary Actions');
 const plan=splitStagedMonsterSource({source,sourceSha256:sha256(source),candidate:{id:'duplicate-parent',label:'duplicate-parent',start:0,end:source.length,quote:source}});
 expect(()=>stagedSpellcastingGroups(plan)).toThrow('UNPROVEN_REFERENCED_SPELL_PARENT');
});
test('a referenced daily pool stays complete GM work instead of creating an unlimited alias',()=>{
 const {actor}=chain('P3',f=>{
  const before=f.source;f.source=f.source.replace('At Will: Detect Magic, Mind Spike (level 3 version)','At Will: Detect Magic\n1/Day Each: Mind Spike (level 3 version)');expect(f.source).not.toBe(before);
  changeForm(f,rows=>{const spell=rows.find(r=>r.编号==='unit-8').施法.法术.find((s:any)=>s.名称==='Mind Spike');spell.次数=1;spell.恢复='每天';});
 });
 const item=actor.items.find((i:any)=>i.name==='Mind Invasion');
 expect(item.flags.fvttJsonGenerator.spellcastingFeatureKey).toBeUndefined();expect(item.system.description.value).toContain('The dragon uses Spellcasting');
});
