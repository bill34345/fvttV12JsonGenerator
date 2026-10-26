import {describe,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import Handlebars from 'handlebars';
import {JSDOM} from 'jsdom';
import {hashSource,type JsonObject} from '@fvtt-json-generator/forge-gateway-protocol';
import {generateEncounterFromHumanMarkdown,reviewForgeEncounterCandidate,encounterActorCandidate,
  type EncounterIntakeReport,type EncounterAutomationPort} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type {MonsterIntakeAiProvider} from '@fvtt-json-generator/intake-ai/types';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {RAT_WARLOCK_SOURCE,buildRatWarlockIr} from '../src/core/intake/__tests__/fixtures/rat-warlock';
import {LURKER_SOURCE,buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';
import {createForgeEncounterApplicationClass} from '../foundry-modules/fvtt-json-forge/src/encounterApplication';
import {decodeEncounterRecovery,serializeEncounterRecovery,type EncounterRecoverySnapshot} from '../foundry-modules/fvtt-json-forge/src/encounterRecoveryStore';

const combined=RAT_WARLOCK_SOURCE+LURKER_SOURCE;
const template=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-encounter.hbs','utf8'));
function fixture(options:{single?:boolean;failSecond?:boolean;uncertainty?:boolean;invalidSecondIr?:boolean;third?:boolean}={}){
  const source=options.single?LURKER_SOURCE:combined+(options.third?LURKER_SOURCE:'');
  const calls={discover:0,extract:[] as string[],review:0,repair:0,automation:0};
  const provider:MonsterIntakeAiProvider={providerName:'offline-fixture',extractionModel:'fixture',reviewModel:'fixture',
    discover:async()=>{calls.discover++;return{schemaVersion:1,candidates:options.single
      ?[{id:'single',label:'Lurker',start:0,end:source.length,quote:source}]
      :[{id:'first',label:'Rat',start:0,end:RAT_WARLOCK_SOURCE.length,quote:RAT_WARLOCK_SOURCE},
        {id:'second',label:'Lurker',start:RAT_WARLOCK_SOURCE.length,end:combined.length,quote:LURKER_SOURCE},
        ...(options.third?[{id:'third',label:'Other Lurker',start:combined.length,end:source.length,quote:LURKER_SOURCE}]:[])]};},
    extract:async request=>{
      calls.extract.push(request.source);
      if(options.failSecond&&request.source===LURKER_SOURCE)throw new Error('Frozen reply is unreadable');
      const ir=request.source===RAT_WARLOCK_SOURCE?buildRatWarlockIr():buildValidLurkerIr();
      if(options.uncertainty)ir.uncertainties.push({id:'retained-probe',code:'PROBE_REVIEW',path:'/creature/attributes/hp',
        message:'Retained source concern',blocking:true,evidence:[]});
      if(options.invalidSecondIr&&request.source===LURKER_SOURCE)ir.creature.legendary=[] as any;
      return ir;
    },
    repair:async()=>{calls.repair++;throw new Error('Default correction must stay off');},
    review:async()=>{calls.review++;return{schemaVersion:1,verdict:'accepted',findings:[]};}};
  const automationProvider:EncounterAutomationPort={generate:async()=>{calls.automation++;throw new Error('No controller is available');},
    review:async()=>{throw new Error('Actors-only candidates do not request an automation audit');}};
  return{source,provider,automationProvider,calls,options};
}
const generate=(env:ReturnType<typeof fixture>,extra:Partial<Parameters<typeof generateEncounterFromHumanMarkdown>[0]>={})=>
  generateEncounterFromHumanMarkdown({source:env.source,label:'Offline partial candidate proof',provider:env.provider,
    automationProvider:env.automationProvider,reviewPolicy:'deferred',...extra});
function responseArtifact(report:EncounterIntakeReport,key='actor-1'):JsonObject{
  const response=report.actors.find(actor=>actor.key===key)?.generation?.candidateResponse;
  if(!response||!('result'in response)||!response.result.artifact)throw new Error('Expected retained formal candidate');
  return response.result.artifact;
}

describe('independent Actor candidates in incomplete encounters',()=>{
  test('keeps the first complete Actor accessible with the failed and untouched members explicitly listed',async()=>{
    const env=fixture({failSecond:true,third:true}),result=await generate(env);
    expect(result.prepared).toBeUndefined();expect(result.report.status).toBe('needs_review');
    expect(result.report.members?.map(member=>[member.key,member.status])).toEqual([
      ['actor-1','available'],['actor-2','failed'],['actor-3','pending']]);
    expect(result.report.members?.[1]?.findings.join(' ')).toContain('ANALYSIS_');
    const candidate=encounterActorCandidate(result.report,'actor-1');
    expect(candidate.artifact).toEqual(responseArtifact(result.report));expect(candidate.artifact.items).toHaveLength(4);
    expect(candidate.source).toBe(RAT_WARLOCK_SOURCE);expect(candidate.finalSource).toContain('forge-source-id:');
    expect(()=>encounterActorCandidate(result.report,'actor-2')).toThrow();
    expect(env.calls.extract).toEqual([RAT_WARLOCK_SOURCE,LURKER_SOURCE]);expect(env.calls.repair).toBe(0);
    expect(env.calls.review).toBe(0);expect(env.calls.automation).toBe(0);expect(result.report.packageHash).toBeUndefined();
  });

  test('resumes incomplete members without repeating discovery, extraction or generation of the completed Actor',async()=>{
    const env=fixture({failSecond:true}),first=await generate(env),before=structuredClone(first.report.actors[0]!.generation);
    env.options.failSecond=false;const progress:string[]=[];
    const resumed=await generate(env,{previousReport:first.report,draftParentHash:hashSource(JSON.stringify(first.report)),onProgress:text=>progress.push(text)});
    expect(env.calls.discover).toBe(1);expect(env.calls.extract).toEqual([RAT_WARLOCK_SOURCE,LURKER_SOURCE,LURKER_SOURCE]);
    expect(resumed.report.actors[0]!.reusedCandidate).toBe(true);
    expect(resumed.report.actors[0]!.generation).toEqual(before);
    expect(progress.filter(text=>text.startsWith('生物1/')&&text.includes('正式生成'))).toEqual([]);
    expect(resumed.report.members?.map(member=>member.status)).toEqual(['available','available']);
    expect(resumed.prepared?.actors).toHaveLength(2);expect(resumed.report.status).toBe('ready_for_gm_review');
    expect(env.calls.repair).toBe(0);expect(env.calls.review).toBe(0);
  });

  test('reuses an existing incomplete IR locally without repurchasing extraction or claiming it passed',async()=>{
    const env=fixture({invalidSecondIr:true}),first=await generate(env);
    expect(first.report.actors[1]!.analysis.ir).toBeDefined();expect(first.report.members?.[1]?.status).toBe('failed');
    const resumed=await generate(env,{previousReport:first.report,draftParentHash:hashSource(JSON.stringify(first.report))});
    expect(env.calls.extract).toHaveLength(2);expect(resumed.prepared).toBeUndefined();
    expect(resumed.report.members?.map(member=>member.status)).toEqual(['available','failed']);
    expect(encounterActorCandidate(resumed.report,'actor-1').artifact).toEqual(responseArtifact(first.report));
    expect(resumed.report.actors[1]!.generation?.findings.some(finding=>finding.blocking)).toBe(true);
  });

  test('cancellation preserves already completed Actor output and marks the interrupted member without a partial package',async()=>{
    const env=fixture(),controller=new AbortController(),extract=env.provider.extract;
    env.provider.extract=async request=>{if(request.source===LURKER_SOURCE)controller.abort();return extract(request);};
    const result=await generate(env,{signal:controller.signal});
    expect(result.report.status).toBe('failed');expect(result.prepared).toBeUndefined();
    expect(result.report.members?.map(member=>member.status)).toEqual(['available','cancelled']);
    expect(encounterActorCandidate(result.report,'actor-1').artifact.items).toHaveLength(4);
    expect(env.calls.repair).toBe(0);expect(env.calls.automation).toBe(0);
  });

  test('rejects changed candidate, source, report identity or generation settings before continuing',async()=>{
    const env=fixture({failSecond:true}),first=await generate(env),extracts=env.calls.extract.length;
    for(const change of ['candidate','source','report-hash','settings'] as const){
      const previous=structuredClone(first.report);
      let publications=0;
      if(change==='candidate')previous.actors[0]!.generation!.candidateHash='0'.repeat(64) as any;
      if(change==='source')previous.actors[0]!.source+='changed';
      const result=await generate(env,{previousReport:previous,
        onReport:()=>{publications++;},
        draftParentHash:change==='report-hash'?'0'.repeat(64):hashSource(JSON.stringify(previous)),
        ...(change==='settings'?{requestedOptions:{protocol:'openai-chat',reasoning:'high',autoCorrect:false}}:{})});
      expect(result.prepared).toBeUndefined();expect(result.report.status).toBe('failed');
      expect(result.continuationRejected).toBeTruthy();expect(publications).toBe(0);
    }
    expect(env.calls.extract).toHaveLength(extracts);expect(env.calls.repair).toBe(0);
  });

  test('allows opting into correction on continuation while keeping the first Actor on its original zero-correction result',async()=>{
    const env=fixture({invalidSecondIr:true}),requestedOptions={protocol:'openai-chat' as const,reasoning:'auto' as const,autoCorrect:false};
    const first=await generate(env,{requestedOptions}),parentReportHash=hashSource(JSON.stringify(first.report));
    const original=structuredClone(first.report.actors[0]!.generation);
    env.provider.repair=async request=>{env.calls.repair++;expect(request.ir.source.sha256).toBe(hashSource(LURKER_SOURCE));return buildValidLurkerIr();};
    const resumed=await generate(env,{previousReport:first.report,draftParentHash:parentReportHash,requestedOptions:{...requestedOptions,autoCorrect:true}});
    expect(env.calls.extract).toHaveLength(2);expect(env.calls.repair).toBe(1);expect(env.calls.review).toBe(0);
    expect(resumed.report.recovery?.parentReportHash).toBe(parentReportHash);
    expect(resumed.report.requestedOptions?.autoCorrect).toBe(true);expect(resumed.report.actors[0]!.reusedCandidate).toBe(true);
    expect(resumed.report.actors[0]!.generation).toEqual(original);expect(resumed.report.actors[0]!.analysis.repairCount).toBe(0);
    expect(resumed.report.actors[1]!.analysis.repairCount).toBe(1);expect(resumed.prepared?.actors).toHaveLength(2);
  });

  test('source feedback invalidates only its owning Actor and remains visible without automatic correction',async()=>{
    const env=fixture(),first=await generate(env),original=structuredClone(first.report.actors[0]!.generation);
    const resumed=await generate(env,{previousReport:first.report,draftParentHash:hashSource(JSON.stringify(first.report)),
      sourceFeedback:[{actorKey:'actor-2',path:'/creature/identity/size',message:'Review this exact source size.'}]});
    expect(env.calls.extract).toHaveLength(2);expect(env.calls.repair).toBe(0);expect(env.calls.review).toBe(0);
    expect(resumed.report.actors[0]!.reusedCandidate).toBe(true);expect(resumed.report.actors[0]!.generation).toEqual(original);
    expect(resumed.report.actors[1]!.reusedCandidate).toBeUndefined();
    expect(resumed.report.actors[1]!.generation?.findings).toContainEqual(expect.objectContaining({code:'SOURCE_REVIEW_FEEDBACK',blocking:true,message:'Review this exact source size.'}));
    expect(resumed.report.members?.[1]?.findings.join(' ')).toContain('SOURCE_REVIEW_FEEDBACK');
    expect(resumed.report.sourceFeedback).toHaveLength(1);expect(resumed.prepared?.actors).toHaveLength(2);
  });
});

describe('explicit audit of actors-only candidates',()=>{
  test.each([true,false])('disabled review keeps bound single=%s candidates and their strict concerns without regeneration [review disabled]',async single=>{
    const env=fixture({single,uncertainty:true}),result=await generate(env),extractions=env.calls.extract.length;
    expect(result.prepared?.bundle.macros).toEqual([]);expect(result.report.generationRoute).toBe('actors-only');
    const before=structuredClone(result);
    await expect(reviewForgeEncounterCandidate({source:env.source,report:result.report,prepared:result.prepared!,provider:env.provider,automationProvider:env.automationProvider})).rejects.toThrow('AI 内容复核已暂时关闭');
    expect(result).toEqual(before);expect(env.calls.review).toBe(0);expect(env.calls.extract).toHaveLength(extractions);expect(env.calls.repair).toBe(0);expect(env.calls.automation).toBe(0);
    expect(result.prepared?.actors.every(actor=>actor.status!=='accepted')).toBe(true);
  });

  test('rejects source/candidate/roster/model tampering before the first extra audit request [review disabled]',async()=>{
    const env=fixture({uncertainty:true}),result=await generate(env);
    for(const change of ['source','range','final-source','candidate-hash','member','missing-actor','model','catalog','second-provider','second-review-state','second-gm-approval'] as const){
      const report=structuredClone(result.report);
      if(change==='source')report.actors[0]!.source+='changed';
      if(change==='range')report.actors[0]!.end--;
      if(change==='final-source')report.actors[0]!.generation!.finalSource+='changed';
      if(change==='candidate-hash')report.actors[0]!.generation!.candidateHash='0'.repeat(64) as any;
      if(change==='member')report.members!.pop();
      if(change==='missing-actor')report.actors.pop();
      if(change==='model')report.model='another-model';
      if(change==='catalog')report.conditionCatalogHash='0'.repeat(64);
      if(change==='second-provider')report.actors[1]!.generation!.provider.extractionModel='changed-child-model';
      if(change==='second-review-state')report.actors[1]!.generation!.modelReviewStatus='unknown' as any;
      if(change==='second-gm-approval')report.actors[1]!.generation!.gmApproval={gmId:'already-adopted'} as any;
      await expect(reviewForgeEncounterCandidate({source:env.source,report,prepared:result.prepared!,provider:env.provider,automationProvider:env.automationProvider})).rejects.toThrow();
    }
    expect(env.calls.review).toBe(0);expect(env.calls.extract).toHaveLength(2);
    const changedBundle=structuredClone(result.prepared!.bundle) as any;
    changedBundle.actors[0].source+='\n';changedBundle.actors[0].sourceHash=hashSource(changedBundle.actors[0].source);
    const changedPrepared=await prepareForgeEncounter(serializeForgeEncounterPackage(changedBundle));
    const reboundReport={...structuredClone(result.report),packageHash:changedPrepared.hash};
    await expect(reviewForgeEncounterCandidate({source:env.source,report:reboundReport,prepared:changedPrepared,provider:env.provider,automationProvider:env.automationProvider})).rejects.toThrow('AI 内容复核已暂时关闭');
    expect(env.calls.review).toBe(0);
  });
});

describe('partial candidates through the normal encounter UI and recovery',()=>{
  test('a rejected continuation preserves the prior visible candidate and exact saved checkpoint without new requests',async()=>{
    const env=fixture({failSecond:true});let stored:EncounterRecoverySnapshot|undefined,saves=0,currentProvider=env.provider;
    const store={load:async()=>stored,save:async(value:EncounterRecoverySnapshot)=>{saves++;stored=decodeEncounterRecovery(serializeEncounterRecovery(value));},clear:async()=>{stored=undefined;}};
    const create=()=>{
      class Base{element:any={querySelector:()=>null,querySelectorAll:()=>[]};render(){return this;}async close(){return this;}}
      const game:any={version:'14.368',world:{id:'rejection-world'},system:{id:'dnd5e',version:'5.3.3'},user:{id:'offline-gm',isGM:true},macros:{contents:[]}};
      const App=createForgeEncounterApplicationClass({game,foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}},
        recoveryStore:store,getRecoverySecrets:()=>({apiKey:'',baseUrl:''}),getAiOptions:()=>({apiKey:'offline-key',baseUrl:'https://offline.example',model:currentProvider.extractionModel}),
        createEncounterIntakeProviders:()=>({provider:currentProvider,automationProvider:env.automationProvider} as any)});
      return new App() as any;
    };
    const initial=create();initial.humanSource=env.source;initial.humanLabel='Retain previous candidate';await initial.generateFromHuman();await initial.close();
    const saved=serializeEncounterRecovery(stored!),beforeSaves=saves,priorReport=JSON.stringify((stored as any).report);
    const app=create();expect((await app._prepareContext()).partialCandidates).toBe(true);
    currentProvider={...env.provider,extractionModel:'different-model'};
    await app.generateFromHuman(true);
    const context=await app._prepareContext();expect(context.partialCandidates).toBe(true);expect(context.actorDeliveries.filter((entry:any)=>entry.available)).toHaveLength(1);
    expect(app.error).toContain('模型');expect(app.status).toContain('原候选和保存记录已保留');
    expect(JSON.stringify(app.aiReport)).toBe(priorReport);expect(serializeEncounterRecovery(stored!)).toBe(saved);
    expect(saves).toBe(beforeSaves);expect(env.calls.extract).toHaveLength(2);expect(env.calls.review).toBe(0);expect(app.generationReviewBinding).toBeUndefined();
    await app.close();expect(serializeEncounterRecovery(stored!)).toBe(saved);
  });

  test('shows and downloads the whole available Actor, survives reload, resumes only missing work and revokes on source edit',async()=>{
    const env=fixture({failSecond:true});let stored:EncounterRecoverySnapshot|undefined;
    const store={load:async()=>stored,save:async(value:EncounterRecoverySnapshot)=>{stored=decodeEncounterRecovery(serializeEncounterRecovery(value));},clear:async()=>{stored=undefined;}};
    const appFactory=()=>{
      class Base{element:any={querySelector:()=>null,querySelectorAll:()=>[]};render(){return this;}async close(){return this;}}
      const game:any={version:'14.368',world:{id:'offline-world'},system:{id:'dnd5e',version:'5.3.3'},user:{id:'offline-gm',isGM:true},macros:{contents:[]}};
      const App=createForgeEncounterApplicationClass({game,foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}},
        recoveryStore:store,getRecoverySecrets:()=>({apiKey:'',baseUrl:''}),getAiOptions:()=>({apiKey:'offline-key',baseUrl:'https://offline.example',model:'fixture'}),
        createEncounterIntakeProviders:()=>({provider:env.provider,automationProvider:env.automationProvider} as any)});
      return new App() as any;
    };
    const mount=async(app:any)=>{const context=await app._prepareContext(),dom=new JSDOM(template(context));app.element=dom.window.document.querySelector('.forge-encounter-panel');app._onRender();return{context,dom};};
    const app=appFactory();app.humanSource=env.source;app.humanLabel='Partial UI fixture';await app.generateFromHuman();
    const {context,dom}=await mount(app);
    expect(context.partialCandidates).toBe(true);expect(context.hasPackage).toBe(false);expect(context.canImport).toBe(false);
    expect([...dom.window.document.querySelectorAll('[data-actor-delivery]')].map(node=>node.textContent)).toEqual([
      expect.stringContaining('候选可获取'),expect.stringContaining('未生成候选')]);
    expect(dom.window.document.querySelectorAll('[data-actor-candidate-download]')).toHaveLength(1);
    (app.element.querySelector('[data-actor-candidate-view]') as HTMLButtonElement).click();
    expect(JSON.parse(app.textView.text)).toEqual(responseArtifact(app.aiReport));expect(app.textView.kind).toBe('actor');
    const originalDocument=globalThis.document,createUrl=URL.createObjectURL,revokeUrl=URL.revokeObjectURL;
    const downloaded:Blob[]=[];let clicks=0;
    try{
      (globalThis as any).document=dom.window.document;
      URL.createObjectURL=(blob:Blob)=>{downloaded.push(blob);return 'blob:offline-candidate';};URL.revokeObjectURL=()=>{};
      dom.window.HTMLAnchorElement.prototype.click=()=>{clicks++;};
      (app.element.querySelector('[data-actor-candidate-download]') as HTMLButtonElement).click();
      expect(clicks).toBe(1);expect(downloaded).toHaveLength(1);expect(JSON.parse(await downloaded[0]!.text())).toEqual(responseArtifact(app.aiReport));
    }finally{(globalThis as any).document=originalDocument;URL.createObjectURL=createUrl;URL.revokeObjectURL=revokeUrl;}
    const originalCandidateHash=app.aiReport.actors[0].generation.candidateHash;await app.close();
    expect(stored?.version).toBe(1);expect((stored as any).report.members.map((member:any)=>member.status)).toEqual(['available','failed']);
    const restored=appFactory(),reload=await mount(restored);
    expect(reload.context.partialCandidates).toBe(true);expect(env.calls.extract).toHaveLength(2);
    env.options.failSecond=false;await restored.generateFromHuman(true);
    expect(env.calls.extract).toHaveLength(3);expect(restored.aiReport.actors[0].reusedCandidate).toBe(true);
    expect(restored.aiReport.actors[0].generation.candidateHash).toBe(originalCandidateHash);
    const complete=await mount(restored);expect(complete.context.hasPackage).toBe(true);
    const oldDownload=restored.element.querySelector('[data-actor-candidate-download]') as HTMLButtonElement;
    const sourceControl=restored.element.querySelector('[name="humanSource"]') as HTMLTextAreaElement;
    sourceControl.value+='changed';sourceControl.dispatchEvent(new complete.dom.window.Event('input'));
    expect(restored.aiReport).toBeUndefined();expect(restored.prepared).toBeUndefined();
    expect((await restored._prepareContext()).actorDeliveries).toEqual([]);
    oldDownload.click();expect(restored.error).toContain('来源已改变');
    await restored.close();
  });
});
