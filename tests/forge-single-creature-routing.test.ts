import {describe,test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {hashSource,hashArtifact,type ForgeSourceId} from '@fvtt-json-generator/forge-gateway-protocol';
import {INTAKE_LIMITS,singleCreatureSourceCandidate} from '@fvtt-json-generator/intake-ai/discovery';
import type {MonsterIntakeAiProvider,MonsterIntakeIR} from '@fvtt-json-generator/intake-ai/types';
import {analyzeBrowserActorSourceWithAi,generateBrowserActorIntakeCandidate,type BrowserActorIntakeInput} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {generateEncounterFromHumanMarkdown} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {compileEncounterSelection} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {RAT_WARLOCK_SOURCE,buildRatWarlockIr} from '../src/core/intake/__tests__/fixtures/rat-warlock';
import {LURKER_SOURCE,buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';

function fixture(source=RAT_WARLOCK_SOURCE,ir=buildRatWarlockIr()){
 const calls={discover:0,extract:0,review:0,repair:0},requests:any[]=[];
 const provider:MonsterIntakeAiProvider={providerName:'offline-routing',extractionModel:'fixture',reviewModel:'disabled',
  discover:async()=>{calls.discover++;return{schemaVersion:1,candidates:[{id:'one',label:'Creature',start:0,end:source.length,quote:source}]};},
  extract:async request=>{calls.extract++;requests.push(structuredClone(request));return structuredClone(ir);},
  review:async()=>{calls.review++;throw Error('Unexpected model review');},repair:async()=>{calls.repair++;throw Error('Unexpected model repair');}};
 const input:BrowserActorIntakeInput={source,sourceName:'plain-statblock.txt',requestId:'routing-fixture',fvttVersion:'14.368',systemVersion:'5.3.3',
  sourceId:'actor:v1:00000000-0000-4000-8000-000000000001' as ForgeSourceId};
 return{input,provider,calls,requests};
}

describe('explicit single-creature source routing',()=>{
 test.each([['English',RAT_WARLOCK_SOURCE,buildRatWarlockIr],['Chinese',LURKER_SOURCE,buildValidLurkerIr]] as const)(
  '%s plain source extracts once with complete unchanged evidence and zero discovery',async(_name,source,build)=>{
   expect(singleCreatureSourceCandidate(source)).toBeUndefined();
   const f=fixture(source,build()),before=structuredClone(build());
   const result=await analyzeBrowserActorSourceWithAi({...f.input,sourceScope:'single'},f.provider);
   expect(result.status).toBe('ready_to_generate');expect(result.sourceScope).toBe('single');
   expect(f.calls).toEqual({discover:0,extract:1,review:0,repair:0});expect(result.calls).toEqual({discovery:0,extraction:1,review:0,repair:0});
   expect(result.candidates).toHaveLength(1);expect(result.candidate).toMatchObject({start:0,end:source.length,quote:source});
   expect(f.requests[0]).toEqual({source,sourceSha256:hashSource(source),candidate:result.candidate});
   expect(result.ir?.creature).toEqual(before.creature);expect(result.stages.find(stage=>stage.stage==='discover')?.status).toBe('skipped');
  });
 test.each([undefined,'discover'] as const)('retains historical recognition when scope is %j',async sourceScope=>{
  const f=fixture(),result=await analyzeBrowserActorSourceWithAi({...f.input,sourceScope},f.provider);
  expect(result.status).toBe('ready_to_generate');expect(f.calls.discover).toBe(1);expect(f.calls.extract).toBe(1);
  expect(result.candidate?.quote).toBe(f.input.source);expect(result.calls.discovery).toBe(1);
 });
 test('multi-creature discovery in the compatibility path never silently selects its first member',async()=>{
  const f=fixture();f.provider.discover=async()=>{f.calls.discover++;return{schemaVersion:1,candidates:[
   {id:'a',label:'A',start:0,end:1,quote:f.input.source.slice(0,1)},
   {id:'b',label:'B',start:1,end:f.input.source.length,quote:f.input.source.slice(1)}]};};
  const result=await analyzeBrowserActorSourceWithAi({...f.input,sourceScope:'discover'},f.provider);
  expect(result.errorCode).toBe('multiple_entities');expect(result.candidates).toHaveLength(2);expect(f.calls.extract).toBe(0);
 });
 test.each(['invalid-scope','too-long','cancelled'] as const)('%s rejects locally without any provider method',async scenario=>{
  const f=fixture(),controller=new AbortController();
  const input={...f.input,sourceScope:'single' as const};
  if(scenario==='invalid-scope')input.sourceScope='arbitrary' as any;
  if(scenario==='too-long')input.source='x'.repeat(INTAKE_LIMITS.maxCandidateLength+1);
  if(scenario==='cancelled')controller.abort();
  const result=await analyzeBrowserActorSourceWithAi(input,f.provider,controller.signal);
  expect(result.status).toBe('failed');expect(f.calls).toEqual({discover:0,extract:0,review:0,repair:0});
  if(scenario==='invalid-scope')expect(result.errorCode).toBe('invalid_source');
  if(scenario==='too-long')expect(result.errorCode).toBe('input_too_large');
  if(scenario==='cancelled')expect(result.errorCode).toBe('cancelled');
 });
 test('a failed extraction is preserved and never retried through discovery',async()=>{
  const f=fixture();f.provider.extract=async()=>{f.calls.extract++;throw Error('Fixture extraction failure');};
  const result=await analyzeBrowserActorSourceWithAi({...f.input,sourceScope:'single'},f.provider);
  expect(result.status).toBe('failed');expect(f.calls).toEqual({discover:0,extract:1,review:0,repair:0});
 });
 test('the multi-creature entry identifies once, then extracts both complete members without inner discovery',async()=>{
  const source=RAT_WARLOCK_SOURCE+LURKER_SOURCE,calls={discover:0,extract:0};
  const provider:MonsterIntakeAiProvider={...fixture().provider,
   discover:async()=>{calls.discover++;return{schemaVersion:1,candidates:[
    {id:'rat',label:'Rat',start:0,end:RAT_WARLOCK_SOURCE.length,quote:RAT_WARLOCK_SOURCE},
    {id:'lurker',label:'Lurker',start:RAT_WARLOCK_SOURCE.length,end:source.length,quote:LURKER_SOURCE}]};},
   extract:async request=>{calls.extract++;return request.source===RAT_WARLOCK_SOURCE?buildRatWarlockIr():buildValidLurkerIr();}};
  const automationProvider={generate:async(request:any)=>compileEncounterSelection({version:2,name:'Routing fixture',notes:'',rules:[],legendaryRecovery:[],manualSteps:[]},request),
   review:async()=>({verdict:'accepted' as const,findings:[]})};
  const result=await generateEncounterFromHumanMarkdown({source,label:'Two complete creatures',provider,automationProvider,reviewPolicy:'deferred'});
  expect(calls).toEqual({discover:1,extract:2});expect(result.report.discovery?.providerCalls).toBe(1);
  expect(result.report.members).toHaveLength(2);expect(result.report.actors.map(actor=>actor.source)).toEqual([RAT_WARLOCK_SOURCE,LURKER_SOURCE]);
  expect(result.report.actors.map(actor=>actor.analysis.calls.discovery)).toEqual([0,0]);
  expect(result.report.actors.map(actor=>actor.analysis.sourceScope)).toEqual(['single','single']);
 });
});

const captured=process.env.FORGE_SINGLE_DIRECT_CAPTURE_ROOT;
for(const name of ['mage-en','greater-star-spawn-emissary-zh-v48'])test.skipIf(!captured)(`saved real ${name} retains its complete artifact through direct extraction`,async()=>{
 const source=readFileSync(join(captured!,name,'source.md'),'utf8'),ir:MonsterIntakeIR=JSON.parse(readFileSync(join(captured!,name,'source-ir.json'),'utf8'));
 const direct=fixture(source,ir),legacy=fixture(source,ir);
 const a=await analyzeBrowserActorSourceWithAi({...direct.input,sourceScope:'single'},direct.provider);
 const b=await analyzeBrowserActorSourceWithAi(legacy.input,legacy.provider);
 expect(a.ir).toEqual(b.ir);expect(direct.calls.discover).toBe(0);expect(legacy.calls.discover).toBe(1);
 const first=await generateBrowserActorIntakeCandidate(direct.input,a,direct.provider),second=await generateBrowserActorIntakeCandidate(legacy.input,b,legacy.provider);
 expect(first.candidateAvailable).toBe(true);expect(first.formalStatus).toBe('accepted');
 const artifact=(value:typeof first)=>(value.candidateResponse as any).result.artifact;
 expect(hashArtifact(artifact(first))).toBe(hashArtifact(artifact(second)));expect(first.finalSource).toBe(second.finalSource);
 expect(first.calls).toEqual({discovery:0,extraction:1,review:0,repair:0});
});
