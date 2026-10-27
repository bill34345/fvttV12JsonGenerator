import {describe,test,expect} from 'bun:test';
import {generateEncounterFromHumanMarkdown,reviewForgeEncounterCandidate,createEncounterIntakeProviders,assertEncounterSecretsAbsent,explicitCreatureSections,retryingMonsterProvider,type EncounterAutomationPort} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {draftForgeEncounterLocalization} from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import type {MonsterIntakeAiProvider} from '@fvtt-json-generator/intake-ai/types';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
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
  test('a single returned entity remains available with the complete submitted source',async()=>{
    const env=fixture();env.provider.discover=async()=>({schemaVersion:1,candidates:[{id:'only',label:'Only',start:0,end:source.length,quote:source}]});
    const result=await generateEncounterFromHumanMarkdown({source,label:'test',...env});
    expect(result.prepared?.actors).toHaveLength(1);
    expect(result.report.actors[0]!.source).toBe(source);
    expect(result.report.actors[0]!.analysis.ir).toBeDefined();
  });
  test('AI source-record metadata does not cancel returned Actor content',async()=>{
    const env=fixture();env.provider.extract=async()=>({...buildRatWarlockIr(),source:{sha256:'0'.repeat(64),length:1}});
    const result=await generateEncounterFromHumanMarkdown({source,label:'test',...env});
    expect(result.prepared?.actors).toHaveLength(2);
    expect(result.report.actors.every(actor=>actor.generation?.candidateAvailable)).toBe(true);
    expect(result.prepared?.actors.every(actor=>Array.isArray(actor.artifact.items))).toBe(true);
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
  test('source metadata mismatch preserves both members without repair or review',async()=>{
    const env=fixture();let calls=0;env.provider.repair=async r=>{calls++;return r.ir;};env.provider.review=async()=>{calls++;return {schemaVersion:1,verdict:'accepted',findings:[]};};
    const ir=buildRatWarlockIr();ir.source.sha256='0'.repeat(64);
    const result=await generateEncounterFromHumanMarkdown({source,label:'draft',...env,draftParentHash:'a'.repeat(64),drafts:[{key:'actor-1',source:RAT_WARLOCK_SOURCE,ir}]});
    expect(result.report.status).toBe('ready_for_gm_review');expect(calls).toBe(0);
    expect(result.prepared?.actors.some(actor=>actor.key==='actor-2')).toBe(true);
    expect(result.report.members?.map(member=>member.status)).toEqual(['available','available']);
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
  test('a failed middle extraction preserves earlier and later Actors in a partial downloadable package',async()=>{
    const env=fixture();const third=RAT_WARLOCK_SOURCE;const combined=RAT_WARLOCK_SOURCE+LURKER_SOURCE+third;let extracts=0;
    env.provider.discover=async()=>({schemaVersion:1,candidates:[
      {id:'first',label:'Rat',start:0,end:RAT_WARLOCK_SOURCE.length,quote:RAT_WARLOCK_SOURCE},
      {id:'second',label:'Lurker',start:RAT_WARLOCK_SOURCE.length,end:source.length,quote:LURKER_SOURCE},
      {id:'third',label:'Rat again',start:source.length,end:combined.length,quote:third}]});
    env.provider.extract=async request=>{extracts++;if(extracts===2)throw new Error('fixture transport has no answer');return buildRatWarlockIr();};
    const result=await generateEncounterFromHumanMarkdown({source:combined,label:'partial',...env});
    expect(extracts).toBe(3);expect(result.report.members?.map(member=>member.status)).toEqual(['available','failed','available']);
    expect(result.prepared?.actors.map(actor=>actor.key)).toEqual(['actor-1','actor-3']);
    expect(result.prepared?.bundle.actors.map(actor=>actor.key)).toEqual(['actor-1','actor-3']);
    for(const actor of result.prepared!.actors){
      const generated=result.report.actors.find(member=>member.key===actor.key)!.generation!;
      expect(actor.artifact).toEqual((generated.candidateResponse as any).result.artifact);
      expect(result.prepared!.bundle.actors.find(member=>member.key===actor.key)!.artifact).toEqual(actor.artifact);
    }
    expect(env.automationCalls).toBe(0);
  });

  test('progress and report callback failures retain generated Actors and return the result',async()=>{
    const env=fixture();
    const result=await generateEncounterFromHumanMarkdown({source,label:'report failure',...env,
      onProgress:()=>{throw new Error('display unavailable');},onReport:()=>{throw new Error('report sink unavailable');}});
    expect(result.prepared?.actors).toHaveLength(2);
    expect(result.report.findings.join(' ')).toContain('报告回传未完成');
    expect(result.report.actors.every(actor=>actor.generation?.candidateAvailable)).toBe(true);
  });

  test('JSON report continuation keeps cached rule facts for Chinese drafts without any model request',async()=>{
    const env=fixture();
    const first=await generateEncounterFromHumanMarkdown({source:LURKER_SOURCE,label:'Saved Lurker',...env});
    expect(first.prepared?.actors).toHaveLength(1);
    const saved=JSON.parse(JSON.stringify(first.report));
    expect(saved.actors[0].rulePresentation).toBeDefined();
    let calls=0;const noModel=async()=>{calls++;throw Error('Saved continuation must stay local');};
    const provider={...env.provider,discover:noModel,extract:noModel,repair:noModel,review:noModel};
    const resumed=await generateEncounterFromHumanMarkdown({source:LURKER_SOURCE,label:'Saved Lurker',provider,
      automationProvider:{generate:noModel,review:noModel},previousReport:saved,draftParentHash:hashSource(JSON.stringify(saved))});
    expect(resumed.prepared?.actors).toHaveLength(1);expect(resumed.report.actors[0]!.reusedCandidate).toBe(true);
    expect(resumed.prepared!.actors[0]!.artifact).toEqual(first.prepared!.actors[0]!.artifact);
    expect(resumed.prepared!.actors[0]!.rulePresentation).toBeDefined();
    const draft=await draftForgeEncounterLocalization({prepared:resumed.prepared!,service:{model:'offline-fixture',reviewModel:'disabled',
      translate:async request=>({texts:request.texts.map(field=>({id:field.id,text:field.kind==='title'?'测试标题':'中文说明 '+field.source.replace(/\bgrappled\b/giu,'受擒').replace(/\brestrained\b/giu,'束缚')}))}),
      review:noModel}});
    expect(draft.actors).toHaveLength(1);expect(calls).toBe(0);
  });

  test('one IR and one complete Markdown answer generate and restore both Actors without another extraction',async()=>{
    const env=fixture(),markdown=renderMonsterIntakeMarkdown(buildValidLurkerIr());let answers=0,oldExtracts=0;
    env.provider.extractAnswer=async request=>{answers++;return request.source===RAT_WARLOCK_SOURCE?buildRatWarlockIr():{kind:'source-text',sourceText:markdown};};
    env.provider.extract=async()=>{oldExtracts++;throw Error('The answer path owns this extraction');};
    const first=await generateEncounterFromHumanMarkdown({source,label:'IR and Markdown',...env});
    expect(answers).toBe(2);expect(oldExtracts).toBe(0);expect(env.automationCalls).toBe(0);
    expect(first.prepared?.actors).toHaveLength(2);expect(first.report.members?.map(member=>member.status)).toEqual(['available','available']);
    expect(first.report.actors[0]!.analysis.ir).toBeDefined();
    expect(first.report.actors[1]!.analysis.ir).toBeUndefined();expect(first.report.actors[1]!.analysis.sourceText).toBe(markdown);
    expect(first.report.actors[1]!.analysis.canonicalSource).toBeTruthy();
    expect(first.report.generationRoute).toBe('actors-only');expect(first.report.findings.join(' ')).toContain('配套控制未生成');
    const saved=JSON.parse(JSON.stringify(first.report));let extraCalls=0;
    const noExtra=async()=>{extraCalls++;throw Error('A saved complete answer must stay local');};
    const provider={...env.provider,discover:noExtra,extract:noExtra,extractAnswer:noExtra,repair:noExtra,review:noExtra};
    const resumed=await generateEncounterFromHumanMarkdown({source,label:'Restored IR and Markdown',provider,
      automationProvider:{generate:noExtra,review:noExtra},previousReport:saved,draftParentHash:hashSource(JSON.stringify(saved))});
    expect(extraCalls).toBe(0);expect(resumed.prepared?.actors.map(actor=>actor.artifact)).toEqual(first.prepared!.actors.map(actor=>actor.artifact));
    expect(resumed.report.actors.every(actor=>actor.reusedCandidate)).toBe(true);
    expect(resumed.report.actors[1]!.analysis.sourceText).toBe(markdown);
    delete saved.actors[1].generation;delete saved.actors[1].rulePresentation;saved.members[1].status='pending';
    const interrupted=await generateEncounterFromHumanMarkdown({source,label:'Saved text before local generation',provider,
      automationProvider:{generate:noExtra,review:noExtra},previousReport:saved,draftParentHash:hashSource(JSON.stringify(saved))});
    expect(extraCalls).toBe(0);expect(interrupted.prepared?.actors).toHaveLength(2);
    expect(interrupted.report.actors[1]!.analysis.ir).toBeUndefined();
    expect(interrupted.report.actors[1]!.analysis.sourceText).toBe(markdown);
    expect(interrupted.report.members?.map(member=>member.status)).toEqual(['available','available']);
  });

  test('the existing local bridge wrapper preserves a complete-text answer as one extraction',async()=>{
    const env=fixture(),answer={kind:'source-text' as const,sourceText:renderMonsterIntakeMarkdown(buildValidLurkerIr())};
    let completeAnswers=0,legacyExtracts=0;
    env.provider.extractAnswer=async()=>{completeAnswers++;return answer;};
    env.provider.extract=async()=>{legacyExtracts++;throw Error('Must preserve the complete answer interface');};
    const provider=retryingMonsterProvider(env.provider,()=>env.provider,{budgetMs:100});
    const request={source:LURKER_SOURCE,sourceSha256:hashSource(LURKER_SOURCE),candidate:{id:'lurker',label:'Lurker',start:0,end:LURKER_SOURCE.length,quote:LURKER_SOURCE}};
    expect(await provider.extractAnswer!(request)).toEqual(answer);
    expect(completeAnswers).toBe(1);expect(legacyExtracts).toBe(0);expect(provider.getExtractionCorrectionCount?.(request)).toBe(0);
  });

});
