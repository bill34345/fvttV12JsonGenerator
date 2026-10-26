import {describe,test,expect} from 'bun:test';
import {generateEncounterFromHumanMarkdown,reviewForgeEncounterCandidate,createEncounterIntakeProviders,assertEncounterSecretsAbsent,explicitCreatureSections,type EncounterAutomationPort} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type {MonsterIntakeAiProvider} from '@fvtt-json-generator/intake-ai/types';
import {compileEncounterSelection} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {RAT_WARLOCK_SOURCE,buildRatWarlockIr} from '../src/core/intake/__tests__/fixtures/rat-warlock';
import {LURKER_SOURCE,buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';

const source=RAT_WARLOCK_SOURCE+LURKER_SOURCE;
function fixture(){
  let automationCalls=0, actorReviewCalls=0, automationReviewCalls=0;
  const provider:MonsterIntakeAiProvider={providerName:'offline-fixture',extractionModel:'fixture',reviewModel:'fixture',
    discover:async()=>({schemaVersion:1,candidates:[{id:'first',label:'Rat',start:0,end:RAT_WARLOCK_SOURCE.length,quote:RAT_WARLOCK_SOURCE},
      {id:'second',label:'Lurker',start:RAT_WARLOCK_SOURCE.length,end:source.length,quote:LURKER_SOURCE}]}),
    extract:async r=>r.source===RAT_WARLOCK_SOURCE?buildRatWarlockIr():buildValidLurkerIr(),
    repair:async r=>r.ir,review:async()=>{actorReviewCalls++;return {schemaVersion:1,verdict:'accepted',findings:[]};}};
  const automationProvider:EncounterAutomationPort={generate:async request=>{automationCalls++;return compileEncounterSelection({
    version:2,name:'Fixture control',notes:'Offline closed capability fixture',rules:[],legendaryRecovery:[],manualSteps:[],
  },request);},
    review:async()=>{automationReviewCalls++;return {verdict:'accepted',findings:[]};}};
  return {provider,automationProvider,get automationCalls(){return automationCalls;},get actorReviewCalls(){return actorReviewCalls;},get automationReviewCalls(){return automationReviewCalls;}};
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
  test('two locally verified Actors form a current GM-pending package without review [review disabled]',async()=>{
    const env=fixture();const result=await generateEncounterFromHumanMarkdown({source,label:'test',...env,onReport:report=>assertEncounterSecretsAbsent(JSON.stringify(report),['secret-value'])});
    if(result.report.status!=='ready_for_gm_review')console.log(result.report.findings);
    expect(result.report.status).toBe('ready_for_gm_review');expect(result.prepared?.actors).toHaveLength(2);
    expect(result.report.actors.map(a=>a.source)).toEqual([RAT_WARLOCK_SOURCE,LURKER_SOURCE]);
    expect(env.automationCalls,JSON.stringify(result.report.findings)).toBe(1);
    expect(env.actorReviewCalls).toBe(0);
    expect(env.automationReviewCalls).toBe(0);
    expect(result.report.actors.map(actor=>actor.generation?.calls.review)).toEqual([0,0]);
  });
  test('encounter prepares both Actors and direct audit stays disabled with the package unchanged [review disabled]',async()=>{
    const env=fixture();
    const generated=await generateEncounterFromHumanMarkdown({source,label:'test',...env,reviewPolicy:'deferred'});
    expect(generated.report.status).toBe('ready_for_gm_review');
    expect(generated.prepared?.actors).toHaveLength(2);
    expect(generated.report.automationReview).toEqual({status:'not_requested'});
    expect(generated.report.actors.map(actor=>actor.generation?.modelReviewStatus)).toEqual(['not_requested','not_requested']);
    expect(generated.report.actors.map(actor=>actor.generation?.calls.review)).toEqual([0,0]);
    expect(env.actorReviewCalls).toBe(0);
    expect(env.automationReviewCalls).toBe(0);
    expect(env.automationCalls).toBe(1);
    const before=structuredClone(generated);
    await expect(reviewForgeEncounterCandidate({source,report:generated.report,prepared:generated.prepared!,provider:env.provider,automationProvider:env.automationProvider})).rejects.toThrow('AI 内容复核已暂时关闭');
    expect(generated).toEqual(before);expect(env.actorReviewCalls).toBe(0);expect(env.automationReviewCalls).toBe(0);expect(env.automationCalls).toBe(1);
  });
  test('failed Chinese draft translation retains the locally verified source-language package [review disabled]',async()=>{
    const env=fixture();let translations=0;
    const result=await generateEncounterFromHumanMarkdown({source,label:'translation failure',...env,outputLanguage:'zh-CN',
      translationService:{translate:async()=>{translations++;throw new Error('Translation review unavailable');},review:async()=>({verdict:'accepted',findings:[]})} as any});
    expect(translations).toBe(1);
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.report.outputLanguage).toBe('source');
    expect(result.report.findings.join(' ')).toContain('中文草稿未完成');
    expect(result.prepared?.bundle.localization).toBeUndefined();
    expect(result.prepared?.hash).toBe(result.report.packageHash);
    expect(result.prepared?.actors).toHaveLength(2);
  });
  test('prior proposals skip extraction and retain locally checked candidates without fresh reviews [review disabled]',async()=>{
    const env=fixture();let extracts=0,reviews=0;
    env.provider.extract=async()=>{extracts++;throw new Error('must use proposal');};
    env.provider.review=async()=>{reviews++;throw new Error('Fresh review is unavailable');};
    const result=await generateEncounterFromHumanMarkdown({source,label:'draft',...env,draftParentHash:'a'.repeat(64),
      drafts:[{key:'actor-1',source:RAT_WARLOCK_SOURCE,ir:buildRatWarlockIr()},
        {key:'actor-2',source:LURKER_SOURCE,ir:buildValidLurkerIr()}]});
    expect(extracts).toBe(0);expect(reviews).toBe(0);expect(result.prepared?.actors).toHaveLength(2);
    expect(result.report.status).toBe('ready_for_gm_review');
    expect(result.report.actors.map(actor=>actor.generation?.modelReviewStatus)).toEqual(['not_requested','not_requested']);
    expect(result.report.actors.map(actor=>actor.generation?.calls.repair)).toEqual([0,0]);
    expect(result.report.actors.every(actor=>!actor.generation?.modelReviewError)).toBe(true);
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
  test('an unchanged invalid quotation remains flagged after one explicitly enabled repair while candidates remain available',async()=>{
    const env=fixture();let repairs=0;const ir=buildRatWarlockIr();ir.claims[0]!.evidence[0]!.quote='invented absent quote';
    env.provider.repair=async r=>{repairs++;return r.ir;};
    const result=await generateEncounterFromHumanMarkdown({source,label:'draft',...env,requestedOptions:{protocol:'openai-chat',reasoning:'auto',autoCorrect:true},draftParentHash:'a'.repeat(64),drafts:[{key:'actor-1',source:RAT_WARLOCK_SOURCE,ir}]});
    expect(repairs).toBe(1);expect(result.report.status).toBe('ready_for_gm_review');expect(result.prepared?.actors).toHaveLength(2);expect(env.automationCalls).toBe(0);
    expect(result.report.actors[0]!.analysis.ir!.claims[0]!.evidence[0]!.quote).toBe('invented absent quote');
    expect(result.report.actors[0]!.analysis.findings.some(finding=>finding.blocking)).toBe(true);
    expect(result.report.findings.length).toBeGreaterThan(0);
    const items=result.prepared?.actors[0]?.artifact.items;
    expect(Array.isArray(items)).toBe(true);expect((items as unknown[]).length).toBeGreaterThan(0);
  });
  test('explicit source feedback enters Analysis repair without enabling content review [review disabled]',async()=>{
    const env=fixture();let repairs=0,reviews=0;
    env.provider.repair=async r=>{repairs++;expect(r.deterministicFindings).toContainEqual(expect.objectContaining({code:'SOURCE_REVIEW_FEEDBACK',blocking:true}));return r.ir;};
    env.provider.review=async()=>{reviews++;throw new Error('Review unavailable');};
    const result=await generateEncounterFromHumanMarkdown({source,label:'feedback',...env,requestedOptions:{protocol:'openai-chat',reasoning:'auto',autoCorrect:true},draftParentHash:'a'.repeat(64),drafts:[{key:'actor-1',source:RAT_WARLOCK_SOURCE,ir:buildRatWarlockIr()}],sourceFeedback:[{actorKey:'actor-1',path:'/creature/identity/size',message:'Recheck this source-backed size.'}]});
    expect(repairs).toBe(1);expect(reviews).toBe(0);expect(result.prepared?.actors).toHaveLength(2);expect(result.report.sourceFeedback).toHaveLength(1);
    expect(result.report.sourceFeedback![0]).toMatchObject({actorKey:'actor-1',path:'/creature/identity/size',message:'Recheck this source-backed size.'});
    expect(result.report.actors[0]!.analysis.repairCount).toBe(1);
    expect(result.report.actors[0]!.generation?.modelReviewStatus).toBe('not_requested');
  });
});
