import {describe,test,expect} from 'bun:test';
import {generateEncounterFromHumanMarkdown,createEncounterIntakeProviders,assertEncounterSecretsAbsent,explicitCreatureSections,type EncounterAutomationPort} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type {MonsterIntakeAiProvider} from '@fvtt-json-generator/intake-ai/types';
import {RAT_WARLOCK_SOURCE,buildRatWarlockIr} from '../src/core/intake/__tests__/fixtures/rat-warlock';
import {LURKER_SOURCE,buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';

const source=RAT_WARLOCK_SOURCE+LURKER_SOURCE;
function fixture(){
  let automationCalls=0;
  const provider:MonsterIntakeAiProvider={providerName:'offline-fixture',extractionModel:'fixture',reviewModel:'fixture',
    discover:async()=>({schemaVersion:1,candidates:[{id:'first',label:'Rat',start:0,end:RAT_WARLOCK_SOURCE.length,quote:RAT_WARLOCK_SOURCE},
      {id:'second',label:'Lurker',start:RAT_WARLOCK_SOURCE.length,end:source.length,quote:LURKER_SOURCE}]}),
    extract:async r=>r.source===RAT_WARLOCK_SOURCE?buildRatWarlockIr():buildValidLurkerIr(),
    repair:async r=>r.ir,review:async()=>({schemaVersion:1,verdict:'accepted',findings:[]})};
  const automationProvider:EncounterAutomationPort={generate:async()=>{automationCalls++;return {version:1,name:'Fixture control',command:'const primary = await fromUuid(forgeEncounter.actors["actor-1"]); return {showPanel(){}, stop(){}};',notes:'Offline fixture',rules:[],manualSteps:[]};},
    review:async()=>({verdict:'accepted',findings:[]})};
  return {provider,automationProvider,get automationCalls(){return automationCalls;}};
}
describe('human Markdown multi-actor encounter intake',()=>{
  test('ordinary numbered creature headings preserve exact source segments',()=>{
    const raw='# Team\n## 生物一：Caller\nfirst\n## 生物二：Dragon\nsecond';
    const sections=explicitCreatureSections(raw);expect(sections).toHaveLength(2);
    for(const section of sections)expect(raw.slice(section.start,section.end)).toBe(section.quote);
    expect(sections.map(s=>s.label)).toEqual(['Caller','Dragon']);
  });
  test('formal artifacts are reportable while credentials and raw provider fields are rejected',()=>{
    expect(()=>assertEncounterSecretsAbsent(JSON.stringify({response:{result:{artifact:{name:'Source Actor'}}}}),['secret-value'])).not.toThrow();
    for(const text of ['{"apiKey":"x"}','{"rawResponse":{}}','{"baseUrl":"https://host"}','description secret-value']){
      expect(()=>assertEncounterSecretsAbsent(text,['secret-value'])).toThrow();
    }
  });
  test('does not silently take the first entity or call automation on invalid discovery',async()=>{
    const env=fixture();env.provider.discover=async()=>({schemaVersion:1,candidates:[{id:'only',label:'Only',start:0,end:source.length,quote:source}]});
    const result=await generateEncounterFromHumanMarkdown({source,label:'test',...env});
    expect(result.report.status).toBe('needs_review');expect(result.prepared).toBeUndefined();expect(env.automationCalls).toBe(0);
  });
  test('an invalid source-backed Actor prevents automation and package creation',async()=>{
    const env=fixture();env.provider.extract=async()=>({...buildRatWarlockIr(),source:{sha256:'0'.repeat(64),length:1}});
    const result=await generateEncounterFromHumanMarkdown({source,label:'test',...env});
    expect(result.report.status).toBe('needs_review');expect(result.prepared).toBeUndefined();expect(env.automationCalls).toBe(0);
  });
  test('caller cancellation never returns a prepared package',async()=>{
    const env=fixture(),controller=new AbortController();env.provider.discover=async()=>{controller.abort();return {schemaVersion:1,candidates:[]};};
    const result=await generateEncounterFromHumanMarkdown({source,label:'test',...env,signal:controller.signal});
    expect(result.report.status).toBe('failed');expect(result.prepared).toBeUndefined();expect(env.automationCalls).toBe(0);
  });
  test('local bridge is explicit and remote HTTP or embedded credentials are refused before a request',()=>{
    const config={apiKey:'fixture',model:'fixture'};
    expect(()=>createEncounterIntakeProviders({...config,baseUrl:'http://127.0.0.1:8787/v1'})).toThrow('HTTPS');
    expect(()=>createEncounterIntakeProviders({...config,baseUrl:'http://example.test/v1',allowLocalBridge:true})).toThrow('HTTPS');
    expect(()=>createEncounterIntakeProviders({...config,baseUrl:'https://secret@example.test/v1'})).toThrow('凭据');
    expect(()=>createEncounterIntakeProviders({...config,baseUrl:'https://example.test/v1?key=secret'})).toThrow('凭据');
  });
  test('two separately verified Actors form a current reviewed package',async()=>{
    const env=fixture();const result=await generateEncounterFromHumanMarkdown({source,label:'test',...env,onReport:report=>assertEncounterSecretsAbsent(JSON.stringify(report),['secret-value'])});
    if(result.report.status!=='ready_for_gm_review')console.log(result.report.findings);
    expect(result.report.status).toBe('ready_for_gm_review');expect(result.prepared?.actors).toHaveLength(2);
    expect(result.report.actors.map(a=>a.source)).toEqual([RAT_WARLOCK_SOURCE,LURKER_SOURCE]);
    expect(env.automationCalls).toBe(1);
  });
  test('rejected automation review exhausts one repair and never returns an importable result',async()=>{
    const env=fixture();env.automationProvider.review=async()=>({verdict:'needs_review',findings:['Source rule was omitted.']});
    const result=await generateEncounterFromHumanMarkdown({source,label:'test',...env});
    expect(result.report.status).toBe('needs_review');expect(result.prepared).toBeUndefined();expect(env.automationCalls).toBe(2);
  });
  test('prior proposals skip extraction but receive fresh validation and independent review',async()=>{
    const env=fixture();let extracts=0,reviews=0;
    env.provider.extract=async()=>{extracts++;throw new Error('must use proposal');};
    env.provider.review=async()=>{reviews++;throw new Error('Fresh review is unavailable');};
    const result=await generateEncounterFromHumanMarkdown({source,label:'draft',...env,draftParentHash:'a'.repeat(64),
      drafts:[{key:'actor-1',source:RAT_WARLOCK_SOURCE,ir:buildRatWarlockIr()}]});
    expect(extracts).toBe(0);expect(reviews).toBe(1);expect(result.prepared).toBeUndefined();
    expect(result.report.actors[0]?.origin).toBe('prior-proposal');
    expect(result.report.actors[0]?.analysis.calls.extraction).toBe(0);
    expect(result.report.recovery?.mode).toBe('fresh-validation-and-review');
  });
  test('stale draft identity cannot authorize repair, review or generation',async()=>{
    const env=fixture();let calls=0;env.provider.repair=async r=>{calls++;return r.ir;};env.provider.review=async()=>{calls++;return {schemaVersion:1,verdict:'accepted',findings:[]};};
    const ir=buildRatWarlockIr();ir.source.sha256='0'.repeat(64);
    const result=await generateEncounterFromHumanMarkdown({source,label:'draft',...env,draftParentHash:'a'.repeat(64),drafts:[{key:'actor-1',source:RAT_WARLOCK_SOURCE,ir}]});
    expect(result.report.status).toBe('failed');expect(calls).toBe(0);expect(result.prepared).toBeUndefined();
  });
  test('invalid prior quotation stays blocked until provider actually repairs it',async()=>{
    const env=fixture();let repairs=0;const ir=buildRatWarlockIr();ir.claims[0]!.evidence[0]!.quote='invented absent quote';
    env.provider.repair=async r=>{repairs++;return r.ir;};
    const result=await generateEncounterFromHumanMarkdown({source,label:'draft',...env,draftParentHash:'a'.repeat(64),drafts:[{key:'actor-1',source:RAT_WARLOCK_SOURCE,ir}]});
    expect(repairs).toBe(1);expect(result.report.status).toBe('needs_review');expect(result.prepared).toBeUndefined();expect(env.automationCalls).toBe(0);
  });
  test('source review feedback enters actual repair and never skips independent review',async()=>{
    const env=fixture();let repairs=0,reviews=0;
    env.provider.repair=async r=>{repairs++;expect(r.deterministicFindings).toContainEqual(expect.objectContaining({code:'SOURCE_REVIEW_FEEDBACK',blocking:true}));return r.ir;};
    env.provider.review=async()=>{reviews++;throw new Error('Review unavailable');};
    const result=await generateEncounterFromHumanMarkdown({source,label:'feedback',...env,draftParentHash:'a'.repeat(64),drafts:[{key:'actor-1',source:RAT_WARLOCK_SOURCE,ir:buildRatWarlockIr()}],sourceFeedback:[{actorKey:'actor-1',path:'/creature/identity/size',message:'Recheck this source-backed size.'}]});
    expect(repairs).toBe(1);expect(reviews).toBe(1);expect(result.prepared).toBeUndefined();expect(result.report.sourceFeedback).toHaveLength(1);
  });
});
