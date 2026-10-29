import assert from 'node:assert/strict';
import type {CanonicalAppliedCondition} from '@fvtt-json-generator/models/canonical-monster';
import {test,expect} from 'bun:test';
import yaml from 'js-yaml';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {verifyMonsterIntake} from '@fvtt-json-generator/intake-ai/verifier';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {YamlParser} from '@fvtt-json-generator/parser/yaml';
import {buildForgeActorRequest,convertFinalActorSource} from '@fvtt-json-generator/forge-browser-runtime';
import type {MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import cases from './fixtures/forge-literal-condition-cases.json';

// Synthetic schema controls, not claims about a published creature or live play.
function fixture(row:{id:string;rule:string;conditions:CanonicalAppliedCondition[];manual:boolean},ending='\n') {
  const description='Melee Weapon Attack Roll: +6, reach 10 ft. Hit: 9 (1d10+4) Slashing damage. '+row.rule;
  const source=['Condition Control','Medium Beast, Unaligned','AC 14; HP 30 (4d8+12); Speed 30 ft.',
    'STR 18 DEX 10 CON 16 INT 10 WIS 10 CHA 10; CR 2','Actions','Strike. '+description,'Watch. It remains alert.'].join(ending);
  const ir:MonsterIntakeIR={schemaVersion:1,source:{sha256:hashSource(source),length:source.length},creature:{
    identity:{name:'Condition Control',size:'medium',creatureType:'beast',alignment:'unaligned'},abilities:{str:18,dex:10,con:16,int:10,wis:10,cha:10},
    attributes:{ac:14,hp:{value:30,formula:'4d8+12'},movement:{walk:30},cr:2},saves:{},skills:{},
    defenses:{resistances:[],immunities:[],vulnerabilities:[],conditionImmunities:[]},senses:{},languages:{values:[]},traits:[],
    actions:[{name:'Strike',description,attack:{type:'mwak',toHit:6,reach:10},damage:[{formula:'1d10+4',type:'slashing',relationship:'base'}],
      appliedConditions:structuredClone(row.conditions)},{name:'Watch',description:'It remains alert.',activityType:'utility'}],
    bonusActions:[],reactions:[],legendaryActions:[]},claims:[],coverage:[],uncertainties:[]};
  return {source,ir};
}
async function generate(data:ReturnType<typeof fixture>) {
  const forbidden=async():Promise<never>=>{throw Error('No network, discovery, repair or AI review is authorized in this control');};
  const provider={providerName:'offline-fixture',extractionModel:'fixed-ir',reviewModel:'disabled',discover:forbidden,extract:async()=>structuredClone(data.ir),review:forbidden,repair:forbidden};
  const input={source:data.source,sourceName:'condition-control.md',requestId:'condition-control',sourceScope:'single' as const,fvttVersion:'14.364',systemVersion:'5.3.3'};
  const analysis=await analyzeBrowserActorSourceWithAi(input,provider);
  const result=await generateBrowserActorIntakeCandidate(input,analysis,provider);
  expect(result.status,JSON.stringify(result.findings)).toBe('ready_for_gm_review');
  expect(result.findings).toEqual([]);
  const response=result.candidateResponse;
  if(!response||!('result'in response)||!response.result.artifact)throw Error('Missing formal artifact');
  return {actor:response.result.artifact as any,markdown:result.finalSource!,ir:analysis.ir!};
}
for(const row of cases)test(row.id+' retains typed conditions through the formal workflow without inventing a native lifecycle',async()=>{
  const data=fixture(row),{actor,markdown,ir}=await generate(data),item=actor.items.find((item:any)=>item.name==='Strike');
  const activity=Object.values<any>(item.system.activities)[0];
  expect(activity.attack).toMatchObject({bonus:'6',flat:true,type:{value:'melee',classification:'weapon'}});
  expect(activity.range.reach).toBe(10);
  expect(activity.damage.parts).toEqual([expect.objectContaining({number:1,denomination:10,bonus:'4',types:['slashing']})]);
  expect(item.system.description.value).toContain(row.rule);
  if(row.manual){
    expect(item.effects).toHaveLength(row.conditions.length);
    expect(activity.effects).toEqual(item.effects.map((effect:any)=>({_id:effect._id})));
    for(const effect of item.effects){expect(effect.disabled).toBe(false);expect(effect.transfer).toBe(false);expect(effect.flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({version:1,mode:'gm',sourceText:ir.creature.actions[0]!.description});expect(effect.description).toContain(row.rule);}
    const ledger=item.flags.fvttJsonGenerator.conditionLifecycle;
    expect(ledger).toMatchObject({version:1,mode:'gm',sourceText:ir.creature.actions[0]!.description});
    expect(ledger.conditions).toEqual(row.conditions.flatMap(({statuses,...metadata})=>statuses.map(status=>({status,...metadata}))));
    expect(item.system.description.value).toContain('GM');
  }else{
    expect(item.flags.fvttJsonGenerator.conditionLifecycle).toBeUndefined();
    expect(item.effects).toHaveLength(1);
    expect(item.effects[0]).toMatchObject({statuses:['poisoned'],duration:{rounds:2}});
    expect(activity.effects).toEqual([{_id:item.effects[0]._id}]);
  }
  expect(verifyMonsterIntake(data.source,ir,markdown,actor).findings).toEqual([]);
});

test('LF/CRLF and explicit condition fields preserve grouped state mechanics; malformed metadata does not cancel the Actor',async()=>{
  for(const row of cases){
    const left=new YamlParser().parse(renderMonsterIntakeMarkdown(fixture(row).ir));
    const right=new YamlParser().parse(renderMonsterIntakeMarkdown(fixture(row,'\r\n').ir).replace(/\n/g,'\r\n'));
    expect(right.structuredActions).toEqual(left.structuredActions);
    expect(left.structuredActions?.动作?.[0]?.embeddedEffects?.map(({type,statuses,condition,escapeDc,duration,staged})=>({type,statuses,condition,escapeDc,duration,staged})))
      .toEqual(row.conditions.map(({statuses,...rest})=>{const type=statuses[0];assert.ok(type);return {type,statuses,condition:undefined,escapeDc:undefined,duration:undefined,staged:undefined,...rest};}));
  }
  const markdown=renderMonsterIntakeMarkdown(fixture(cases[0]!).ir),document=yaml.load(markdown.slice(4,-4)) as any;
  const retainsActor=async(copy:any)=>{
    const before=structuredClone(copy),content='---\n'+yaml.dump(copy)+'---\n';
    const response=await convertFinalActorSource(buildForgeActorRequest({content,displayName:'Condition metadata control',requestId:'condition-metadata-control',fvttVersion:'14.364',systemVersion:'5.3.3'}));
    expect(copy).toEqual(before);
    if(!('result'in response)||!response.result.artifact)throw Error('The existing Actor and its actions must remain available.');
    const item=(response.result.artifact.items as any[]).find(item=>item.name==='Strike'),activity=Object.values<any>(item.system.activities)[0];
    expect(activity.attack).toMatchObject({bonus:'6',flat:true,type:{value:'melee',classification:'weapon'}});
    expect(activity.damage.parts).toEqual([expect.objectContaining({number:1,denomination:10,bonus:'4',types:['slashing']})]);
    expect(item.effects).toHaveLength(1);expect(item.effects[0].statuses).toEqual(['grappled','restrained']);
    expect(item.effects[0].flags.fvttJsonGenerator.conditionLifecycle.mode).toBe('gm');
    expect(item.effects[0].description).toContain(cases[0]!.rule);expect(activity.effects).toEqual([{_id:item.effects[0]._id}]);
    return new YamlParser().parse(content).structuredActions?.动作?.[0]?.embeddedEffects?.[0];
  };
  for(const invalid of [null,{},42]){
    const copy=structuredClone(document);copy.动作[0].内嵌效果[0].条件=invalid;
    expect((await retainsActor(copy))?.condition).toBeUndefined();
    // The supplied object/source retains the unmapped value; no meaning is invented for it.
    expect(copy.动作[0].内嵌效果[0].条件).toEqual(invalid);
  }
  const conflict=structuredClone(document);conflict.动作[0].内嵌效果[0].condition='another condition';
  expect((await retainsActor(conflict))?.condition).toBe(conflict.动作[0].内嵌效果[0].条件);
  expect(conflict.动作[0].内嵌效果[0].condition).toBe('another condition');
});

test('the verifier rejects altered GM parameters and reintroduced automatic effects or dangling links',async()=>{
  const data=fixture(cases[0]!),{actor,markdown,ir}=await generate(data);
  const errors=(mutate:(item:any)=>void)=>{const copy=structuredClone(actor);mutate(copy.items[0]);return verifyMonsterIntake(data.source,ir,markdown,copy).findings.map(f=>f.code);};
  expect(errors(item=>{item.effects[0].flags.fvttJsonGenerator.conditionLifecycle.escapeDc=99;})).toContain('ACTOR_CONDITION_GM_METADATA_DRIFT');
  expect(errors(item=>{item.effects[0].flags.fvttJsonGenerator.conditionLifecycle.condition='permanent';})).toContain('ACTOR_CONDITION_GM_METADATA_DRIFT');
  expect(errors(item=>{delete item.effects[0].flags.fvttJsonGenerator.conditionLifecycle;})).toContain('ACTOR_CONDITION_GM_METADATA_DRIFT');
  expect(errors(item=>{item.effects=[{_id:'bad',statuses:['restrained'],duration:{}}];Object.values<any>(item.system.activities)[0].effects=[{_id:'bad'}];})).toContain('ACTOR_CONDITION_GM_METADATA_DRIFT');
  expect(errors(item=>{Object.values<any>(item.system.activities)[0].effects=[{_id:'orphan'}];})).toContain('ACTOR_CONDITION_LINK_DRIFT');
});

test('a conditional branch of the same status cannot be bypassed by a second native branch and unrelated features remain equal',async()=>{
  const base=fixture(cases[0]!),original=await generate(base),mixed=structuredClone(base);
  mixed.ir.creature.actions[0]!.appliedConditions!.push({statuses:['restrained'],duration:'2 rounds'});
  const actual=await generate(mixed);
  expect(actual.actor.items[0].effects).toHaveLength(2);
  expect(actual.actor.items[0].effects.every((effect:any)=>effect.flags.fvttJsonGenerator.conditionLifecycle.mode==='gm')).toBe(true);
  expect(Object.values<any>(actual.actor.items[0].system.activities)[0].effects).toEqual(actual.actor.items[0].effects.map((effect:any)=>({_id:effect._id})));
  expect(actual.actor.items[0].flags.fvttJsonGenerator.conditionLifecycle.conditions).toHaveLength(3);
  expect(actual.actor.items[1]).toEqual(original.actor.items[1]);
});

for(const nativeFirst of [false,true])test('mixed GM and native states retain native effect ownership, nativeFirst='+nativeFirst,async()=>{
  const conditions=[...cases[0]!.conditions,...cases[4]!.conditions];
  const row={...cases[0]!,rule:cases[0]!.rule+' '+cases[4]!.rule,conditions:nativeFirst?[conditions[1]!,conditions[0]!]:conditions};
  const data=fixture(row),{actor,ir,markdown}=await generate(data),item=actor.items[0],activity=Object.values<any>(item.system.activities)[0];
  expect(item.effects).toHaveLength(2);
  const poison=item.effects.find((effect:any)=>effect.statuses.includes('poisoned')),grapple=item.effects.find((effect:any)=>effect.statuses.includes('grappled'));
  expect(poison).toMatchObject({statuses:['poisoned'],duration:{rounds:2},flags:{fvttJsonGenerator:{conditionLifecycle:{mode:'native'}}}});
  expect(grapple).toMatchObject({statuses:['grappled','restrained'],flags:{fvttJsonGenerator:{conditionLifecycle:{mode:'gm',escapeDc:14}}}});
  expect(activity.effects).toEqual(item.effects.map((effect:any)=>({_id:effect._id})));
  expect(item.flags.fvttJsonGenerator.conditionLifecycle.statuses).toEqual(['grappled','restrained']);
  expect(item.flags.fvttJsonGenerator.conditionLifecycle.conditions).toHaveLength(2);
  const note=item.system.description.value.slice(item.system.description.value.lastIndexOf('<p>'));
  expect(note).toContain('受擒 grappled');expect(note).toContain('束缚 restrained');expect(note).not.toContain('poisoned');
  expect(verifyMonsterIntake(data.source,ir,markdown,actor).findings).toEqual([]);
});
