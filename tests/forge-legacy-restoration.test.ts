import {legacyStagedProvider} from './helpers/forge-legacy-provider';
import {test,expect} from 'bun:test';
import fixture from './fixtures/forge-angel-chm-recorded-base.json';
import vengeance from './fixtures/forge-vengeance-chm-recorded-base.json';
import company from './fixtures/forge-company-pdf-recorded-base.json';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {auditMonsterIntakeSourceProjection} from '@fvtt-json-generator/intake-ai/verifier';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {ActorGenerator} from '@fvtt-json-generator/generation/actor';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {assertActorSemantics} from '../foundry-modules/fvtt-json-forge/src/runtime';
import {importForgeEncounter} from '../foundry-modules/fvtt-json-forge/src/encounterRuntime';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {createResolverEventCoordinator} from '../foundry-modules/monster-spell-resolver/src/hooks';
import {FORGE_SPELL_IMPORT_PHASE} from '@fvtt-json-generator/contracts/forge-import-lifecycle';
const stop=async():Promise<never>=>{throw Error('Saved-input offline replay forbids real model calls');};
test('new PDF full formal chain keeps attack, both area Saves, conditional daily Save and all GM rules',async()=>{
  let calls=0;
  // This recorded artifact contains the historical BASE reply only. Keep its
  // one-call source replay separate from current auto feature/model behavior.
  const source=company.source,provider=legacyStagedProvider({authMode:'api-key',apiKey:'test-only',baseUrl:'https://offline.invalid/v1',model:'recorded-base-replay',reviewModel:'disabled',timeoutMs:10000,repairTimeoutMs:10000,stagedExtraction:{baseMode:'facts',featureMode:'source'},httpClient:async()=>{calls++;return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(company.recordedBase)}}]})};}});
  const ir=await provider.extract({source,sourceSha256:hashSource(source),candidate:{id:'company',label:'Mezzoloth Company',start:0,end:source.length,quote:source}});
  expect(calls).toBe(1);
  const result=await generateEncounterFromHumanMarkdown({source,label:'New PDF recorded regression',reviewPolicy:'deferred',outputLanguage:'source',drafts:[{key:'actor-1',source,ir}],draftParentHash:hashSource(JSON.stringify(ir)),provider:{providerName:'offline',extractionModel:'recorded',reviewModel:'disabled',discover:stop,extract:stop,repair:stop,review:stop},automationProvider:{generate:stop,review:stop}});
  expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
  const actor=result.prepared!.actors[0]!.artifact as any,items=actor.items;
  const item=(word:string)=>items.find((i:any)=>i.name.includes(word)),activity=(word:string)=>(Object.values(item(word).system.activities) as any[])[0]!;
  expect(actor.system.traits.size).toBe('huge');expect(actor.system.traits.dr.value).toEqual(['fire']);expect(JSON.stringify(items)).toContain('Damage from Attacks');expect(actor.system.details.biography.value).toContain('Swarm of');
  expect(activity('Spindly').type).toBe('attack');expect(activity('Spindly').range).toMatchObject({reach:0,units:'ft',override:false});expect(item('Spindly').system.description.value).toContain('Bloodied');
  expect(activity('Weaverot')).toMatchObject({type:'save',save:{ability:['dex'],dc:{formula:'18'}},damage:{onSave:'none'},range:{value:60},target:{template:{type:'sphere',size:15}}});
  expect(activity('Weaverot').damage.parts).toHaveLength(2);expect(item('Weaverot').system.description.value).toContain('SUCCESS OR FAILURE');
  expect(activity('Toxic')).toMatchObject({type:'save',activation:{type:'bonus'},save:{ability:['con'],dc:{formula:'17'}},damage:{onSave:'half'},target:{template:{type:'radius',size:10}}});
  expect(item('Toxic').system.description.value).toContain('until the end');expect(item('Toxic').effects).toHaveLength(1);expect(item('Toxic').effects[0].flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');expect(item('Toxic').effects[0].flags.fvttJsonGenerator.conditionLifecycle.sourceText).toContain('Toxic Emission');
  expect(activity('Strike-Gate')).toMatchObject({type:'save',activation:{type:'bonus'},save:{ability:['cha'],dc:{formula:'16'}}});expect(item('Strike-Gate').system.uses.max).toBe('1');expect(activity('Strike-Gate').range?.value).not.toBe(120);
  expect(actor.flags?.['fvtt-json-generator-spell-resolver']?.spellManifest).toBeUndefined();
  expect(auditMonsterIntakeSourceProjection(source,ir,result.prepared!.bundle.actors[0]!.source,actor).findings).toEqual([]);
  const empty=structuredClone(actor),effect=empty.items.find((entry:any)=>entry.name.includes('Toxic')).effects[0];
  effect.changes=[];effect.system={...effect.system,changes:[]};
  expect(auditMonsterIntakeSourceProjection(source,ir,result.prepared!.bundle.actors[0]!.source,empty).findings).toEqual([]);
  for(const change of [
    (entry:any)=>{entry.effects[0].changes=[{key:'system.attributes.hp.value',mode:2,value:'-999'}];},
    (entry:any)=>{entry.effects[0].changes=[];entry.effects[0].system={...entry.effects[0].system,changes:[{key:'system.attributes.hp.value',type:'add',phase:'initial',value:'-999'}]};},
    (entry:any)=>{entry.effects[0].flags.fvttJsonGenerator.conditionLifecycle.sourceText='An unrelated ability.';},
    (entry:any)=>{Object.values<any>(entry.system.activities)[0].effects[0]._id='unrelated-effect';},
    (entry:any)=>{Object.values<any>(entry.system.activities)[0].effects[0].onSave=true;},
  ]){
    const changed=structuredClone(actor);change(changed.items.find((entry:any)=>entry.name.includes('Toxic')));
    expect(auditMonsterIntakeSourceProjection(source,ir,result.prepared!.bundle.actors[0]!.source,changed).findings).toContainEqual(expect.objectContaining({code:'ACTOR_MIXED_RESOURCE_DRIFT',path:'/creature/bonusActions/0'}));
  }
  const nativeOnly=structuredClone(empty);delete nativeOnly.items.find((entry:any)=>entry.name.includes('Toxic')).effects[0].changes;
  expect(auditMonsterIntakeSourceProjection(source,ir,result.prepared!.bundle.actors[0]!.source,nativeOnly).findings).toEqual([]);

});
test('a second actual CHM creature retains Ring attack, both Saves, cone/recharge and real single-daily spell grant',async()=>{
  const source=vengeance.source;
  const provider=legacyStagedProvider({authMode:'api-key',apiKey:'test-only',baseUrl:'https://offline.invalid/v1',model:'recorded-base-replay',reviewModel:'disabled',timeoutMs:10000,repairTimeoutMs:10000,stagedExtraction:{baseMode:'facts',featureMode:'source'},httpClient:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(vengeance.baseResponse)}}]})})});
  const ir=await provider.extract({source,sourceSha256:hashSource(source),candidate:{id:'vengeance',label:'Angel of Vengeance',start:0,end:source.length,quote:source}});
  const result=await generateEncounterFromHumanMarkdown({source,label:'Second actual CHM reply replay',reviewPolicy:'deferred',outputLanguage:'source',drafts:[{key:'actor-1',source,ir}],draftParentHash:hashSource(JSON.stringify(ir)),provider:{providerName:'offline',extractionModel:'recorded',reviewModel:'disabled',discover:stop,extract:stop,repair:stop,review:stop},automationProvider:{generate:stop,review:stop}});
  expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();
  const actor=result.prepared!.actors[0]!.artifact as any;
  const activity=(word:string)=>(Object.values(actor.items.find((i:any)=>i.name.includes(word)).system.activities) as any[])[0]!;
  expect(activity('Ring').type).toBe('attack');expect(activity('Ring').damage.includeBase).toBeTrue();
  expect(activity('Ring').damage.parts).toContainEqual(expect.objectContaining({number:2,denomination:8,types:['bludgeoning']}));
  expect(actor.system.abilities.str.value).toBe(20);
  expect(activity('Retribution')).toMatchObject({type:'save',save:{ability:['wis'],dc:{formula:'15'}},damage:{onSave:'half'},target:{template:{type:'cone',size:90}}});
  expect(actor.items.find((i:any)=>i.name.includes('Retribution')).system.uses.recovery).toContainEqual(expect.objectContaining({period:'recharge',formula:'5'}));
  expect(activity('Unblinking')).toMatchObject({type:'save',save:{ability:['cha'],dc:{formula:'15'}},damage:{onSave:'half'}});
  expect(ir.creature.spellcasting).toHaveLength(1);expect(ir.creature.spellcasting![0]).toMatchObject({ability:'int',saveDc:15,activationType:'action'});
  expect(ir.creature.spellcasting![0]!.usageGroups.map(g=>[g.usage,g.spellRefs.length])).toEqual([['at-will',2],['1/day-each',1]]);
  const wrong=structuredClone(ir);wrong.creature.spellcasting![0]!.activationType='bonus';
  expect(auditMonsterIntakeSourceProjection(source,wrong,renderMonsterIntakeMarkdown(wrong),actor).findings.some(f=>f.code==='SPELL_ACTIVATION_SOURCE_MISMATCH')).toBeTrue();
});
async function replay(){
  const source=fixture.source;
  const provider=legacyStagedProvider({authMode:'api-key',apiKey:'test-only',baseUrl:'https://offline.invalid/v1',model:'recorded-base-replay',reviewModel:'disabled',timeoutMs:10000,repairTimeoutMs:10000,stagedExtraction:{baseMode:'facts',featureMode:'source'},httpClient:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify(fixture.baseResponse)}}]})})});
  const ir=await provider.extract({source,sourceSha256:hashSource(source),candidate:{id:'angel',label:'Angel of Death',start:0,end:source.length,quote:source}});
  const result=await generateEncounterFromHumanMarkdown({source,label:'Saved CHM base replay',reviewPolicy:'deferred',outputLanguage:'source',drafts:[{key:'actor-1',source,ir}],draftParentHash:hashSource(JSON.stringify(ir)),provider:{providerName:'offline',extractionModel:'recorded',reviewModel:'disabled',discover:stop,extract:stop,repair:stop,review:stop},automationProvider:{generate:stop,review:stop}});
  expect(result.prepared,JSON.stringify(result.report.findings)).toBeDefined();return{source,ir,result,actor:result.prepared!.actors[0]!.artifact as any};
}
test('actual saved CHM source retains a separate manual CON18 Save and failed-save dead status',async()=>{
  const {source,ir,result,actor}=await replay(),item=actor.items.find((i:any)=>i.name.includes('Soul Scythe'));
  const attacks=(Object.values(item.system.activities) as any[]).filter(a=>a.type==='attack'),saves=(Object.values(item.system.activities) as any[]).filter(a=>a.type==='save');
  expect(attacks).toHaveLength(2);expect(saves).toHaveLength(1);expect(saves[0].save).toMatchObject({ability:['con'],dc:{formula:'18'}});
  expect(saves[0].activation.type).toBe('special');expect(saves[0].activation.condition).toContain('生命值降至0');
  expect(item.effects.map((e:any)=>e.statuses)).toEqual([['dead']]);expect(saves[0].effects.map((e:any)=>e._id)).toEqual([item.effects[0]._id]);
  expect(attacks.every(a=>!a.effects?.length)).toBeTrue();expect(item.system.description.value).toContain('灵魂被困');
  const wrong=structuredClone(actor);delete wrong.items.find((i:any)=>i.name.includes('Soul Scythe')).system.activities[saves[0]._id];
  expect(auditMonsterIntakeSourceProjection(source,ir,result.prepared!.bundle.actors[0]!.source,wrong).status).toBe('needs_review');
});
test('actual staged source creates six real portable spell refs instead of fake Utility use counters',async()=>{
  const {actor}=await replay(),manifest=actor.flags['fvtt-json-generator-spell-resolver']?.spellManifest;
  expect(manifest).toBeDefined();expect(manifest.spellcastingGroups.flatMap((g:any)=>g.spellRefs).map((r:any)=>r.identifier).sort()).toEqual(['circle-of-death','disguise-self','locate-creature','misty-step','plane-shift','power-word-kill']);
  expect(actor.system.attributes.spellcasting).toBe('wis');expect(JSON.stringify(actor.items)).not.toContain('GM施法记录');
});
test('new bilingual Actor name has no generated parentheses',async()=>{const {actor}=await replay();expect(actor.name).toBe('死亡天使 Angel of Death');});
test('actual source survives locked native StringField trimming at import readback',async()=>{
  const {actor}=await replay(),native=structuredClone(actor);
  // Core14.368 StringField defaults trim:true; dnd5e5.3.3 base-activity
  // description.chatFlavor uses this field. Actual import failed on this path.
  for(const item of native.items)for(const activity of Object.values(item.system.activities) as any[])if(typeof activity.description?.chatFlavor==='string')activity.description.chatFlavor=activity.description.chatFlavor.trim();
  expect(()=>assertActorSemantics(actor,native)).not.toThrow();
  const drift=structuredClone(native);const spell=drift.items.find((i:any)=>i.name.includes('Spellcasting'));Object.values(spell.system.activities as Record<string,any>)[0]!.description.chatFlavor+=' changed';expect(()=>assertActorSemantics(actor,drift)).toThrow('description.chatFlavor');
});
function lifecycleWorld(options:{drift?:boolean;failMacro?:boolean;failRelease?:boolean;rejectAfterRelease?:boolean}={}){
  const events:string[]=[],scheduled:Array<()=>void|Promise<void>>=[],resolved:string[]=[];
  const coordinator=createResolverEventCoordinator({authority:()=>({isGM:true,userId:'gm'}),runtimeSupported:()=>true,isActive:()=>false,isAlreadyApplied:()=>false,schedule:fn=>scheduled.push(fn),process:async a=>{resolved.push(a.id);}});
  function collection(kind:string){const docs=new Map<string,any>();return{get:(id:string)=>docs.get(id),get contents(){return [...docs.values()];},documentClass:{async create(data:any){
    if(kind==='Macro'&&options.failMacro)throw Error('Late macro create failure');
    const d:any={id:data._id,uuid:kind+'.'+data._id,documentName:kind,name:data.name,data:structuredClone(data),get flags(){return this.data.flags;},toObject(){return structuredClone(this.data);},async delete(){docs.delete(this.id);},async update(changes:any){
      if(options.failRelease)throw Error('Metadata release failed');expect(Object.keys(changes)).toEqual(['flags.fvtt-json-forge.'+FORGE_SPELL_IMPORT_PHASE]);this.data.flags['fvtt-json-forge'][FORGE_SPELL_IMPORT_PHASE]=changes[Object.keys(changes)[0]!];events.push('release:'+this.data.flags['fvtt-json-forge'][FORGE_SPELL_IMPORT_PHASE]);coordinator.onActorEvent(this,{userId:'gm'});if(options.rejectAfterRelease)throw Error('Client rejected after metadata commit');return this;
    }};
    docs.set(d.id,d);if(kind==='Actor'){
      events.push('create:'+d.flags?.['fvtt-json-forge']?.[FORGE_SPELL_IMPORT_PHASE]);
      expect(coordinator.onActorEvent(d,{userId:'gm'})).toBe('ignored');
      if(options.drift)d.data.system.attributes.movement.walk='999';
      // Exact external StringField behavior observed on this actual source.
      for(const item of d.data.items)for(const a of Object.values(item.system.activities) as any[])if(typeof a.description?.chatFlavor==='string')a.description.chatFlavor=a.description.chatFlavor.trim();
    }return d;
  }}};}
  const game:any={version:'14.368',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},actors:collection('Actor'),macros:collection('Macro')};
  return{game,events,scheduled,resolved,assets:{ensure:async()=>{throw Error('No assets expected');}}};
}
test('actual caster import verifies first and releases Resolver on the persisted metadata update',async()=>{
  const {result}=await replay(),prepared=result.prepared!,before=JSON.stringify(prepared),env=lifecycleWorld();
  const imported=await importForgeEncounter({...env,prepared,reviewed:true});
  expect(imported.documents).toHaveLength(1);expect(env.events).toEqual(['create:pending','release:verified']);expect(env.scheduled).toHaveLength(1);expect(env.resolved).toEqual([]);
  await env.scheduled[0]!();expect(env.resolved).toEqual([imported.documents[0]!.id]);expect(JSON.stringify(prepared)).toBe(before);
});
test('readback drift retains the imported Actor with a concrete warning and Resolver lifecycle',async()=>{
  const {result}=await replay(),env=lifecycleWorld({drift:true});
  const imported=await importForgeEncounter({...env,prepared:result.prepared!,reviewed:true});
  expect(imported.documents).toHaveLength(1);expect(imported.documents[0]!.readbackWarnings?.join(' ')).toContain('movement.walk');
  expect(env.game.actors.contents).toHaveLength(1);expect(env.events).toEqual(['create:pending','release:verified']);expect(env.scheduled).toHaveLength(1);
});
test('late package failure leaves no resolver operation; a release failure retains the committed Actor',async()=>{
  const {result}=await replay(),original=result.prepared!.bundle;
  const command='return forgeEncounter.packageId;';
  const prepared=await prepareForgeEncounter(JSON.stringify({...original,macros:[{key:'late',name:'Late macro',command,commandHash:hashSource(command),bindings:{main:original.actors[0]!.key},covers:[],notes:'Inert lifecycle test.'}]}));
  const failed=lifecycleWorld({failMacro:true}),failedResult=await importForgeEncounter({...failed,prepared,reviewed:true});expect(failedResult.failures.some(f=>f.message.includes('Late macro'))).toBe(true);expect(failed.game.actors.contents).toHaveLength(1);expect(failed.scheduled).toHaveLength(1);
  const committed=lifecycleWorld({failRelease:true}),committedResult=await importForgeEncounter({...committed,prepared:result.prepared!,reviewed:true});expect(committedResult.failures.some(f=>f.message.includes('local phase: pending'))).toBe(true);expect(committed.game.actors.contents).toHaveLength(1);expect(committed.game.actors.contents[0].flags['fvtt-json-forge'][FORGE_SPELL_IMPORT_PHASE]).toBe('pending');expect(committed.scheduled).toEqual([]);
  const ambiguous=lifecycleWorld({rejectAfterRelease:true}),ambiguousResult=await importForgeEncounter({...ambiguous,prepared:result.prepared!,reviewed:true});expect(ambiguousResult.failures.some(f=>f.message.includes('local phase: verified'))).toBe(true);expect(ambiguous.game.actors.contents).toHaveLength(1);expect(ambiguous.scheduled).toHaveLength(1);
});
for(const name of ['构装体 (原型)','构装体 (Prototype)','Iron Crab (Prototype)'])test('authored Actor parentheses remain intact: '+name,()=>{
  const parsed=new YamlParser().parse('名称: '+name+'\n类型: npc\n能力: {力量: 10, 敏捷: 10, 体质: 10, 智力: 10, 感知: 10, 魅力: 10}\n护甲等级: 10\n生命值: 4\n挑战等级: 0\n');
  const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null}).generate(parsed);expect(actor.name).toBe(name);
});
test('canonical authored Item parentheses are never reinterpreted as a legacy alias',async()=>{
  const {ir}=await replay();
  // Isolated presentation mutation, not source acceptance or a final artifact.
  const example=structuredClone(ir);example.creature.actions=[{name:'构装体 (Prototype)',description:'A source-authored prototype.',activityType:'utility'},{name:'Iron Crab (Prototype)',description:'Another source-authored prototype.',activityType:'utility'}];example.creature.spellcasting=[];
  const parsed=new YamlParser().parse(renderMonsterIntakeMarkdown(example));const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core',translationService:null}).generate(parsed);
  expect(actor.items.filter((item:any)=>item.flags?.['tidy5e-sheet']?.section==='动作').map((item:any)=>item.name)).toEqual(['构装体 (Prototype)','Iron Crab (Prototype)']);
});
