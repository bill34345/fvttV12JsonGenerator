import {test,expect} from 'bun:test';
import yaml from 'js-yaml';
import fixture from './fixtures/forge-2024-pilot-frozen-boundaries.json';
import {sha256} from '@fvtt-json-generator/contracts/hash';
import {splitStagedMonsterSource} from '@fvtt-json-generator/intake-ai/staged-source';
import {validateStagedBaseFacts,assembleStagedMonsterIntake} from '@fvtt-json-generator/intake-ai/staged-extraction';
import {decodeCategoryFormV2} from '../packages/intake-ai/src/category-form-v2';
import {adaptCategoryFormV2,completeCategoryFormSpellcasting} from '../packages/intake-ai/src/category-form-v2-adapter';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {validateMonsterIntakeIR,auditMonsterIntakeSource} from '@fvtt-json-generator/intake-ai/validator';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {buildCastActivitySource} from '../foundry-modules/monster-spell-resolver/src/cast-activity';
import {adaptParsedActorToCanonical} from '../packages/generation/src/adapters';
import {verifyGeneratedDocument} from '../packages/generation/src/verification';

export function frozenCastChain(id:'P2'|'P3',mutate?:(f:any)=>void){
  const f=structuredClone(fixture.cases.find(c=>c.id===id)!);mutate?.(f);
  const source=f.source,plan=splitStagedMonsterSource({source,sourceSha256:sha256(source),candidate:{id,label:id,start:0,end:source.length,quote:source}});
  const base=validateStagedBaseFacts(plan,JSON.parse(f.baseReply));
  const reply='correctionWholeReply'in f?f.correctionWholeReply:f.wholeReply;
  const form=decodeCategoryFormV2(JSON.parse(reply!),plan);
  const ir=completeCategoryFormSpellcasting(plan,assembleStagedMonsterIntake(plan,base,adaptCategoryFormV2(plan,base,form)),form);
  expect(validateMonsterIntakeIR(source,ir).findings.filter(f=>f.blocking)).toEqual([]);
  const markdown=renderMonsterIntakeMarkdown(ir);
  const parsed=new YamlParser().parse(markdown),actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null}).generate(parsed) as any;
  const canonical=adaptParsedActorToCanonical(parsed);
  expect(verifyGeneratedDocument({canonical,output:actor,target:'14',effectProfile:'core'}).diagnostics.filter(d=>d.severity==='error')).toEqual([]);
  expect(verifyMonsterIntake(source,ir,markdown,actor).findings).toEqual([]);
  return{source,plan,base,form,ir,markdown,actor,canonical};
}
test('same frozen2024 Mage has separate daily spell ability and one shared reaction pool',()=>{
  const frozen=JSON.stringify(fixture),{actor}=frozenCastChain('P2');
  const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  expect(manifest.spellcastingGroups.find((g:any)=>g.spellRefs.some((r:any)=>r.originalName==='Fireball')).spellRefs).toHaveLength(9);
  for(const [title,names] of [['Misty Step',['Misty Step']],['Protective Magic',['Counterspell','Shield']]] as const){
    const group=manifest.spellcastingGroups.find((g:any)=>g.spellRefs.map((r:any)=>r.originalName).join('|')===names.join('|'));
    expect(group,title).toBeDefined();
    const feature=actor.items.find((i:any)=>i.flags?.fvttJsonGenerator?.spellcastingFeatureKey===group.featureItemKey);
    if(names.length>1)expect(feature.system.uses).toEqual({spent:0,max:'3',recovery:[{period:'day',type:'recoverAll'}]});
    for(const ref of group.spellRefs){
      const built=buildCastActivitySource({manifestId:manifest.manifestId,featureId:feature._id??'ProofFeature0001',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop',activationType:feature.flags.fvttJsonGenerator.spellcastingActivationType,useParentItemPool:feature.flags.fvttJsonGenerator.spellcastingUsesParent});
      if(names.length>1){
        expect(built.activity.consumption).toEqual({spellSlot:false,targets:[{type:'itemUses',value:'1'}]});
        expect(built.activity.uses).toBeUndefined();
      }else{
        expect(built.activity.consumption).toEqual({spellSlot:false,targets:[{type:'activityUses',value:'1'}]});
        expect(built.activity.uses).toEqual({spent:0,max:'3',recovery:[{period:'day',type:'recoverAll'}]});
      }
      expect(feature.system.description.value).toContain(title);
    }
  }
  expect(JSON.stringify(fixture)).toBe(frozen);
});
for(const wrong of ['manifest','quota','reader-consumption','source-link'] as const)test('pending reader requires the complete same-source parent proof: '+wrong,()=>{
  const {actor,canonical}=frozenCastChain('P2'),item=actor.items.find((i:any)=>i.name.startsWith('Protective Magic'));
  if(wrong==='manifest')delete actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  if(wrong==='quota')item.system.uses.max='4';
  if(wrong==='reader-consumption')Object.values<any>(item.system.activities)[0].consumption.targets=[{type:'itemUses',target:'',value:'2'}];
  if(wrong==='source-link')item.flags.fvttJsonGenerator.spellcastingFeatureKey='another-source';
  expect(verifyGeneratedDocument({canonical,output:actor,target:'14',effectProfile:'core'}).diagnostics.some(d=>d.severity==='error'&&d.code==='GEN_MECHANIC_NOT_PROJECTED')).toBe(true);
});
function changeMageForm(f:any,change:(rows:any[])=>void){
  const reply=JSON.parse(f.correctionWholeReply),raw=reply.markdown.replace(/^```yaml\s*/u,'').replace(/```\s*$/u,'');
  const form=yaml.load(raw) as Record<string,any[]>;change(Object.values(form).flat());
  f.correctionWholeReply=JSON.stringify({markdown:'```yaml\n'+yaml.dump(form,{lineWidth:-1})+'```'});
}
test('a second source daily quota retains separate per-Cast uses without hardcoding three',()=>{
  const {actor}=frozenCastChain('P2',f=>{f.source=f.source.replace('Misty Step (3/Day)','Misty Step (2/Day)');changeMageForm(f,rows=>{const row=rows.find(r=>r.编号==='unit-6');row.名称='Misty Step (2/Day)';row.使用次数=2;row.施法.法术[0].次数=2;});});
  const manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  const group=manifest.spellcastingGroups.find((g:any)=>g.spellRefs.some((r:any)=>r.originalName==='Misty Step')),ref=group.spellRefs[0];
  const built=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'ProofFeature0001',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'});
  expect(built.activity.uses!.max).toBe('2');
});
test('a PDF-wrapped daily spell name retains exact multiline source evidence',()=>{
  const {ir}=frozenCastChain('P2',f=>{f.source=f.source.replace('casts Misty Step','casts Misty\nStep');});
  const ref=ir.creature.spellcasting!.find(g=>g.featureName.startsWith('Misty'))!.usageGroups[0]!.spellRefs[0]!;
  expect(ref.originalName).toBe('Misty Step');expect(ref.evidence[0]!.quote).toBe('Misty\nStep');
});
for(const wrong of ['missing-choice','wrong-count','wrong-ability'] as const)test('same source blocks a true filled-form error: '+wrong,()=>{
  expect(()=>frozenCastChain('P2',f=>changeMageForm(f,rows=>{const row=rows.find(r=>r.编号==='unit-8');if(wrong==='missing-choice')row.施法.法术[0].名称='Counterspell';if(wrong==='wrong-count')row.施法.法术[0].次数=4;if(wrong==='wrong-ability')row.施法.属性='wis';}))).toThrow();
});
test('a clipped reaction trigger and a foreign caster remain blocked',()=>{
  const {source,ir}=frozenCastChain('P2'),group=ir.creature.spellcasting!.find(g=>g.featureName.startsWith('Protective'))!;
  group.usageGroups[0]!.spellRefs[0]!.restrictions=[];
  expect(auditMonsterIntakeSource(source,ir).findings.some(f=>f.blocking&&f.code==='SPELL_DAILY_ACTION_EVIDENCE_MISMATCH')).toBe(true);
  expect(()=>frozenCastChain('P2',f=>{f.source=f.source.replace('The mage casts Misty Step','An ally casts Misty Step');})).toThrow();
});
test('same frozen2024 Dragon Geas inherits one minute and keeps the source legendary budget',()=>{
  const {actor}=frozenCastChain('P3'),manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  const group=manifest.spellcastingGroups.find((g:any)=>g.spellRefs.some((r:any)=>r.originalName==='Geas'));
  const ref=group.spellRefs.find((r:any)=>r.originalName==='Geas');
  const built=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'ProofFeature0001',group,ref,selectedUuid:'Compendium.dnd-players-handbook.spells.Item.phbsplGeas000000',activationType:'action'});
  expect(built.activity.activation).toBeUndefined();expect(built.activity.uses?.max).toBe('1');
  expect(group.spellRefs).toHaveLength(3);
  expect(actor.system.resources.legact.max).toBe(3);
});
test('printed spell level and included-AC warning survive as native level and literal note',()=>{
  for(const id of ['P2','P3'] as const){
    const {actor}=frozenCastChain(id),manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
    for(const group of manifest.spellcastingGroups)for(const ref of group.spellRefs){
      const built=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'ProofFeature0001',group,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'});
      if(ref.originalName==='Fireball')expect(built.activity.spell.level).toBe(4);
      if(ref.originalName==='Mind Spike')expect(built.activity.spell.level).toBe(3);
      if(ref.originalName==='Mage Armor'){expect(built.activity.description?.chatFlavor).toContain('included in');expect(built.activity).not.toHaveProperty('effects');}
    }
  }
});

test('contradictory printed levels reject while unknown casting qualifiers remain literal',()=>{
  const {actor}=frozenCastChain('P2'),manifest=actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
  const group=manifest.spellcastingGroups.find((g:any)=>g.spellRefs.some((r:any)=>r.originalName==='Fireball'));
  const original=group.spellRefs.find((r:any)=>r.originalName==='Fireball');
  for(const restrictions of [
    [{kind:'casting',text:'level 4 version',value:3}],
    [{kind:'casting',text:'level 4 version'},{kind:'casting',text:'level 5 version'}],
  ]){
    const ref={...structuredClone(original),restrictions},copy={...structuredClone(group),spellRefs:[ref]};
    expect(()=>buildCastActivitySource({manifestId:manifest.manifestId,featureId:'ProofFeature0001',group:copy,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'})).toThrow();
  }
  const ref={...structuredClone(original),restrictions:[{kind:'casting' as const,text:'only while bloodied'}]},copy={...structuredClone(group),spellRefs:[ref]};
  const built=buildCastActivitySource({manifestId:manifest.manifestId,featureId:'ProofFeature0001',group:copy,ref,selectedUuid:'Compendium.dnd5e.spells24.Item.abcdefghijklmnop'});
  expect(built.activity.description!.chatFlavor).toContain('only while bloodied');
  expect(built.literalRestrictions).toMatchObject([{kind:'casting',text:'only while bloodied',status:'literal-unsupported'}]);
});
