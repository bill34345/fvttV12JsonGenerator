import {describe,test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import Handlebars from 'handlebars';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {analyzeBrowserActorSourceWithAi,analyzeBrowserActorIntakeDraft,generateBrowserActorIntakeCandidate,generateAndReviewBrowserActorIntake,
  reviewBrowserActorIntakeCandidate,approveBrowserActorIntakeCandidateForGm,repairBrowserActorIntake,createBrowserAiProvider} from '@fvtt-json-generator/forge-browser-runtime/ai';
import {analyzeBrowserItemSourceWithAi,generateBrowserItemIntakeCandidate,generateAndReviewBrowserItemIntake,reviewBrowserItemIntakeCandidate,
  approveBrowserItemIntakeCandidateForGm,createBrowserItemAiProvider,repairBrowserItemIntake} from '@fvtt-json-generator/forge-browser-runtime/item-intake';
import {createEncounterIntakeProviders,generateEncounterFromHumanMarkdown,reviewForgeEncounterCandidate,retryingMonsterProvider,retryingAutomationProvider} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {draftForgeEncounterLocalization,approveForgeEncounterLocalization,reviewForgeEncounterLocalizationDraft,localizeForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import {prepareForgeEncounter} from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import {serializeForgeEncounterPackage} from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import {createForgeIntakeApplicationClass} from '../foundry-modules/fvtt-json-forge/src/intakeApplication';
import {createForgeEncounterApplicationClass} from '../foundry-modules/fvtt-json-forge/src/encounterApplication';
import {LURKER_SOURCE,buildValidLurkerIr} from '../src/core/intake/__tests__/fixtures/lurker';
import {JEWEL_OF_THREE_PRAYERS_SOURCE,jewelCandidate,buildJewelOfThreePrayersIr} from '../src/core/intake/__tests__/fixtures/jewel-of-three-prayers';
import brass from './fixtures/forge-2024-brass-dragon-full-ir-v48.json';
import {encounterFixture} from './helpers/forge-encounter';

const DISABLED='AI 内容复核已暂时关闭';
function actorProvider(){
  const calls={extract:0,review:0,repair:0};
  const provider={providerName:'offline',extractionModel:'offline',reviewModel:'offline',
    discover:async()=>({schemaVersion:1 as const,candidates:[{id:'one',label:'Lurker',start:0,end:LURKER_SOURCE.length,quote:LURKER_SOURCE}]}),
    extract:async()=>{calls.extract++;return buildValidLurkerIr();},
    review:async():Promise<never>=>{calls.review++;throw Error('Review must stay disabled');},
    repair:async()=>{calls.repair++;return buildValidLurkerIr();}};
  return{provider,calls};
}
describe('Forge AI content review stays disabled',()=>{
  test('Actor extraction/local generation/GM confirmation work through both generation entries with zero review',async()=>{
    const {provider,calls}=actorProvider(),input={source:LURKER_SOURCE,sourceName:'Lurker',sourceScope:'single' as const,requestId:'review-disabled-actor',fvttVersion:'14.368',systemVersion:'5.3.3'};
    const analysis=await analyzeBrowserActorSourceWithAi(input,provider);expect(calls.extract).toBe(1);
    for(const generate of [generateBrowserActorIntakeCandidate,generateAndReviewBrowserActorIntake]){
      const candidate=await generate(input,analysis,provider);expect(candidate.status).toBe('ready_for_gm_review');
      expect(candidate.modelReviewStatus).toBe('not_requested');expect(candidate.calls.review).toBe(0);expect(candidate.candidateAvailable).toBe(true);
      const before=structuredClone(candidate);await expect(reviewBrowserActorIntakeCandidate(input,candidate,provider)).rejects.toThrow(DISABLED);
      expect(candidate).toEqual(before);expect(approveBrowserActorIntakeCandidateForGm(input,candidate,'gm').status).toBe('accepted');
      const historical={...structuredClone(candidate),modelReviewStatus:'needs_review' as const,calls:{...candidate.calls,review:1},
        review:{schemaVersion:1 as const,verdict:'revise' as const,findings:[{id:'historical',code:'OLD_OPINION',path:'/creature',message:'Historical opinion',blocking:true,origin:'ai-review' as const}]}};
      const saved=structuredClone(historical);
      await expect(reviewBrowserActorIntakeCandidate(input,historical,provider)).rejects.toThrow(DISABLED);
      await expect(repairBrowserActorIntake(input,historical,provider)).rejects.toThrow(DISABLED);
      expect(historical).toEqual(saved);expect(historical.calls.review).toBe(1);expect(historical.calls.repair).toBe(0);
    }expect(calls.review).toBe(0);expect(calls.repair).toBe(0);
  });
  test('structural/AI extraction repair remains a separate explicit operation',async()=>{
    const {provider,calls}=actorProvider(),input={source:LURKER_SOURCE,sourceName:'Lurker',sourceScope:'single' as const,requestId:'review-disabled-structural-repair',fvttVersion:'14.368',systemVersion:'5.3.3'};
    const ir=buildValidLurkerIr();ir.creature.abilities.str='bad' as any;
    const analysis=analyzeBrowserActorIntakeDraft(input,ir,provider);expect(analysis.status).toBe('needs_review');
    const repaired=await repairBrowserActorIntake(input,analysis,provider);expect(repaired.status).toBe('ready_to_generate');
    expect(calls.repair).toBe(1);expect(calls.review).toBe(0);expect(repaired.calls.review).toBe(0);
  });
  test('Item generation keeps strict local checks and GM confirmation without automatic or explicit review',async()=>{
    const source=JEWEL_OF_THREE_PRAYERS_SOURCE,input={source,sourceName:'Jewel',requestId:'review-disabled-item',fvttVersion:'14.368',systemVersion:'5.3.3'};
    let reviews=0,extracts=0,repairs=0;const provider={providerName:'offline',extractionModel:'offline',reviewModel:'offline',
      discover:async()=>({schemaVersion:1 as const,candidates:[jewelCandidate()]}),extract:async()=>{extracts++;return buildJewelOfThreePrayersIr();},
      review:async():Promise<never>=>{reviews++;throw Error('Review must stay disabled');},repair:async(request:any)=>{repairs++;return request.ir;}};
    const analysis=await analyzeBrowserItemSourceWithAi(input,provider);expect(extracts).toBe(1);
    for(const generate of [generateBrowserItemIntakeCandidate,generateAndReviewBrowserItemIntake]){
      const candidate=await generate(input,analysis,provider);expect(candidate.status).toBe('ready_for_gm_review');expect(candidate.modelReviewStatus).toBe('not_requested');expect(candidate.calls.review).toBe(0);
      const saved=structuredClone(candidate);await expect(reviewBrowserItemIntakeCandidate(input,candidate,provider)).rejects.toThrow(DISABLED);expect(candidate).toEqual(saved);
      expect(approveBrowserItemIntakeCandidateForGm(input,candidate,'gm').status).toBe('accepted');
      const historical={...structuredClone(candidate),modelReviewStatus:'needs_review' as const,calls:{...candidate.calls,review:1},
        review:{schemaVersion:1 as const,verdict:'revise' as const,findings:[{id:'old',code:'OLD_OPINION',path:'/item',message:'Historical opinion',blocking:true,origin:'ai-review' as const}]}};
      const old=structuredClone(historical);await expect(repairBrowserItemIntake(input,historical,provider)).rejects.toThrow(DISABLED);expect(historical).toEqual(old);expect(repairs).toBe(0);
      const corrupt=structuredClone(candidate) as any;corrupt.candidateResponse.result.artifact.system.quantity=999;
      expect(()=>approveBrowserItemIntakeCandidateForGm(input,corrupt,'gm')).toThrow();
    }expect(reviews).toBe(0);
  });
  test('every Forge provider factory/retry wrapper rejects direct review before HTTP',async()=>{
    const priorFetch=globalThis.fetch;let http=0,attempts=0;
    globalThis.fetch=Object.assign(async()=>{http++;throw Error('No network');},{preconnect:priorFetch.preconnect});
    try{
      const options={baseUrl:'https://offline.invalid/v1',apiKey:'fixture-only',model:'offline',timeoutMs:1000};
      const encounter=createEncounterIntakeProviders(options);
      const providers=[createBrowserAiProvider(options),createBrowserItemAiProvider(options),createBrowserItemAiProvider({...options,providerId:'openai-compatible'}),encounter.provider,encounter.automationProvider,encounter.translationService];
      const identity=actorProvider().provider,retry={budgetMs:1000};
      providers.push(retryingMonsterProvider(identity,()=>{attempts++;return identity;},retry));
      providers.push(retryingAutomationProvider({generate:async()=>({} as any),review:async()=>({verdict:'accepted',findings:[]})},()=>{attempts++;throw Error('No retry');},retry));
      for(const provider of providers)await expect((provider.review as any)({})).rejects.toThrow(DISABLED);
      expect(http).toBe(0);expect(attempts).toBe(0);
    }finally{globalThis.fetch=priorFetch;}
  });
  test('historical automatic encounter policy cannot trigger Actor/controller review',async()=>{
    let extracts=0,reviews=0,controls=0;
    const provider={providerName:'offline',extractionModel:'offline',reviewModel:'offline',
      discover:async():Promise<never>=>{throw Error('Single source does not need paid discovery');},extract:async()=>{extracts++;return structuredClone(brass.ir) as any;},
      review:async():Promise<never>=>{reviews++;throw Error('No review');},repair:async():Promise<never>=>{throw Error('No repair');}};
    const result=await generateEncounterFromHumanMarkdown({source:brass.source,label:'Brass',provider,reviewPolicy:'automatic',
      automationProvider:{generate:async():Promise<never>=>{controls++;throw Error('Declared ledger uses native fixed control');},review:async():Promise<never>=>{reviews++;throw Error('No controller review');}}});
    expect(result.report.status).toBe('ready_for_gm_review');expect(result.prepared?.actors).toHaveLength(1);expect(extracts).toBe(1);expect(reviews).toBe(0);expect(controls).toBe(0);
    expect((result.prepared!.actors[0]!.artifact as any).system.resources.legres.max).toBe(3);
    const before=structuredClone(result);await expect(reviewForgeEncounterCandidate({source:brass.source,report:result.report,prepared:result.prepared!,provider,
      automationProvider:{generate:async()=>({} as any),review:async():Promise<never>=>{reviews++;throw Error('No review');}}})).rejects.toThrow(DISABLED);
    expect(result).toEqual(before);expect(reviews).toBe(0);
  });
  test('translation draft and explicit GM approval remain available; automatic/explicit AI translation review rejects',async()=>{
    const canonical=['---','名称: 静默守卫','类型: npc','体型: 中型','生物类型: 构装体','护甲等级: 14','生命值: 30','挑战等级: 1','intake-biography-mode: literal-v1',
      '特性:','  - 名称: Quiet Watch','    类型: utility','    执行模式: gm-manual','    描述: 始终保持警觉。','---'].join('\n');
    const bundle={...encounterFixture(),label:'中文测试',actors:[{key:'main',label:'静默守卫',source:canonical,sourceHash:hashSource(canonical)}],macros:[]};
    const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(bundle));let translates=0,reviews=0;
    const service={model:'offline',reviewModel:'offline',translate:async(request:any)=>{translates++;return{texts:request.texts.map((entry:any)=>({id:entry.id,text:entry.source.replaceAll('Natural Armor','天生护甲').replaceAll('Quiet Watch','静默守望')}))};},
      review:async():Promise<never>=>{reviews++;throw Error('No translation review');}};
    const draft=await draftForgeEncounterLocalization({prepared,service});expect(translates).toBeGreaterThan(0);const before=structuredClone(draft);
    await expect(reviewForgeEncounterLocalizationDraft({prepared,draft,service})).rejects.toThrow(DISABLED);
    const translationCount=translates;await expect(localizeForgeEncounter({bundle:prepared.bundle,service})).rejects.toThrow(DISABLED);expect(translates).toBe(translationCount);
    expect(reviews).toBe(0);expect(draft).toEqual(before);
    const approved=await approveForgeEncounterLocalization({prepared,draft,gmId:'gm'});expect(approved.bundle.localization).toBeDefined();expect(reviews).toBe(0);
  });
  test('both actual UI templates and legacy handlers cannot reopen review or destroy a candidate',async()=>{
    for(const [template,action]of [['forge-intake.hbs','model-review'],['forge-encounter.hbs','encounter-review-candidate']]){
      const html=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/'+template,'utf8'))({canReviewCandidate:true});
      expect(html).not.toContain('data-action="'+action+'"');expect(html).not.toContain('额外 API 费用');expect(html).not.toContain('额外API费用');
      expect(html).not.toContain('付费模型审核须另行点击');expect(html).not.toContain('可主动请求AI审核');
    }
    const connection=readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-connection.hbs','utf8');
    expect(connection).toContain(DISABLED);expect(connection).not.toContain('AI审核当前候选');
    let called=0;const infos:string[]=[],game:any={version:'14.368',system:{id:'dnd5e',version:'5.3.3'},world:{id:'review-disabled'},user:{id:'gm',isGM:true}};
    class Base{render(){return this;}async close(){return this;}}
    const foundry:any={applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}};
    const Intake=createForgeIntakeApplicationClass({game,foundry,ui:{notifications:{info:(message:string)=>infos.push(message)}},services:{reviewBrowserActorIntakeCandidate:async()=>{called++;throw Error('No injected review');}}} as any);
    const intake:any=new Intake(),candidate={hash:'retained',calls:{review:1,repair:0},review:{findings:['historical']}};intake.generation=candidate;
    await intake.reviewCandidate({});expect(intake.generation).toBe(candidate);expect(intake.canRepairGeneratedCandidate({})).toBe(false);
    const Encounter=createForgeEncounterApplicationClass({game,foundry,reviewForgeEncounterCandidate:async()=>{called++;throw Error('No injected review');}} as any);
    const encounter:any=new Encounter();encounter.prepared=candidate;await encounter.reviewCurrentCandidate();expect(encounter.prepared).toBe(candidate);expect(encounter.error).toContain(DISABLED);
    expect(infos[0]).toContain(DISABLED);expect(called).toBe(0);
  });
});
