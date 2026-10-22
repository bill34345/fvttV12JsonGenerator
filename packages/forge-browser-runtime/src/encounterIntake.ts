import { hashSource, hashArtifact, type JsonObject, isUsableActorCandidateArtifact } from '@fvtt-json-generator/forge-gateway-protocol';
import { decodeConfiguredConditionCatalog, type ConfiguredConditionDefinition } from '@fvtt-json-generator/contracts/configured-conditions';
import { normalizeDiscovery, partitionDiscoveryCandidates, singleCreatureSourceCandidate } from '@fvtt-json-generator/intake-ai/discovery';
import { OpenAICompatibleMonsterIntakeProvider, MonsterIntakeProviderError } from '@fvtt-json-generator/intake-ai/provider';
import { createEncounterAutomationProvider, EncounterAutomationSelectionNeedsReviewError } from '@fvtt-json-generator/intake-ai/encounter-automation';
import type { BrowserAiProviderOptions } from './ai';
import { createReviewedTranslationService } from '@fvtt-json-generator/intake-ai/localization';
import { createContinuousIntakeWaitPolicy } from '@fvtt-json-generator/intake-ai/transport';
import { verifyMonsterIntake } from '@fvtt-json-generator/intake-ai/verifier';
import { extractExplicitlyInflictedStatuses } from '@fvtt-json-generator/generation/actor-effects';
import type { ReviewedTranslationServicePort } from '@fvtt-json-generator/generation/ports';
import { draftForgeEncounterLocalization, localizeForgeEncounter,
  reviewForgeEncounterLocalizationDraft, assertForgeEncounterLocalizationDraft,
  type EncounterLocalizationProgress, type ForgeEncounterLocalizationDraft } from './encounterLocalization';
import type { MonsterIntakeAiProvider, DiscoveryCandidate, MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import {
  buildEncounterMacroCommand, renderEncounterActorSource, decodeEncounterAutomation, compileEncounterSelection, encounterStagedConditionRequirements,encounterManualConditionRequirements, manualForcedMovementRequirements,
  type EncounterAutomationIR, type EncounterAutomationRequest, type EncounterAutomationRule, type EncounterCompilerRejection,
} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {
  analyzeBrowserActorSourceWithAi, generateAndReviewBrowserActorIntake, generateBrowserActorIntakeCandidate,
  reviewBrowserActorIntakeCandidate, assertCurrentBrowserActorIntakeCandidate, repairBrowserActorIntake,
  assertBrowserActorIntakeReviewContext,
  analyzeBrowserActorIntakeDraft,
  type BrowserActorIntakeAnalysis, type BrowserActorGenerationResult,
} from './ai';
import { serializeForgeEncounterPackage, type ForgeEncounterPackage } from './encounterPackage';
import { assertPreparedForgeEncounter, prepareForgeEncounter, type PreparedForgeEncounter } from './encounterPreparation';
import { combineEncounterSignals, retryEncounterStage, type EncounterRetryStage, type EncounterStageRetryOptions } from './encounterStageRetry';
export {decodeEncounterRuntimeConfiguration} from '@fvtt-json-generator/intake-ai/encounter-automation';
export {fixedEncounterCommand,readFixedEncounterConfiguration} from '@fvtt-json-generator/intake-ai/encounter-capabilities';

export interface EncounterIntakeActor {
  key:string;start:number;end:number;source:string;
  origin?:'fresh-extraction'|'prior-proposal';
  analysis:BrowserActorIntakeAnalysis;generation?:BrowserActorGenerationResult;
  reusedCandidate?:true;
}
export interface EncounterIntakeMember {
  key:string;label:string;start:number;end:number;
  status:'pending'|'running'|'available'|'failed'|'cancelled';
  findings:string[];
}
export interface EncounterIntakeReport {
  outputLanguage?: 'source' | 'zh-CN';
  localization?: EncounterLocalizationProgress[];
  localizationDraft?: ForgeEncounterLocalizationDraft;
  version:1;source:string;sourceHash:string;model:string;reviewModel:string;
  conditionCatalogHash?:string;
  evidenceMode:'standard'|'exact-quotes-v1';
  requestedOptions?:{protocol:BrowserAiProviderOptions['protocol'];reasoning:BrowserAiProviderOptions['reasoning'];maxAttempts?:1|2;autoCorrect?:boolean};
  discovery?:{mode:'ordinary-headings'|'single-statblock'|'ai-discovery';providerCalls:number};
  generationRoute?:'single-actor-native'|'actors-only'|'encounter-with-controller';
  recovery?:{parentReportHash:string;mode:'fresh-validation-and-review'};
  sourceFeedback?:Array<{actorKey:string;path:string;message:string}>;
  status:'running'|'ready_for_gm_review'|'needs_review'|'failed';
  actors:EncounterIntakeActor[];automation?:EncounterAutomationIR;
  /** Complete discovery roster, including failed and not-yet-processed members. */
  members?:EncounterIntakeMember[];
  automationReview?:{status:'not_requested'|'failed';message?:string}|{verdict:'accepted'|'needs_review';findings:string[]};findings:string[];
  packageHash?:string;
}
export interface EncounterAutomationPort {
  generate(request:EncounterAutomationRequest):Promise<EncounterAutomationIR>;
  review(request:EncounterAutomationRequest & {automation:EncounterAutomationIR;finalSources?:Array<{key:string;source:string;artifact:unknown}>}):Promise<{verdict:'accepted'|'needs_review';findings:string[]}>;
}
export interface EncounterIntakeInput {
  reviewPolicy?:'automatic'|'deferred';
  outputLanguage?: 'source' | 'zh-CN';
  translationService?: ReviewedTranslationServicePort;
  source:string;label:string;provider:MonsterIntakeAiProvider;automationProvider:EncounterAutomationPort;
  conditionCatalog?:ConfiguredConditionDefinition[];
  evidenceMode?:'standard'|'exact-quotes-v1';
  requestedOptions?:EncounterIntakeReport['requestedOptions'];
  drafts?:Array<{key:string;source:string;ir:MonsterIntakeIR}>;
  draftParentHash?:string;
  /** Current-source continuation; complete candidates are identity-checked and reused. */
  previousReport?:EncounterIntakeReport;
  sourceFeedback?:Array<{actorKey:string;path:string;message:string}>;
  signal?:AbortSignal;onProgress?:(message:string)=>void;
  onReport?:(report:EncounterIntakeReport)=>void;
}
export interface EncounterIntakeResult {report:EncounterIntakeReport;prepared?:PreparedForgeEncounter;localizationDraft?:ForgeEncounterLocalizationDraft;
  /** No valid continuation started; callers must retain the prior checkpoint. */
  continuationRejected?:string}

/** An independently downloadable Actor is never represented as a complete encounter package. */
export function encounterActorCandidate(report:EncounterIntakeReport,key:string):{
  key:string;label:string;source:string;finalSource:string;artifact:JsonObject;artifactHash:string;
  strictStatus:'accepted'|'needs_review'|'failed';findings:string[];
}{
  if(report.sourceHash!==hashSource(report.source))throw new TypeError('生物候选的完整来源身份已改变。');
  const matches=report.actors.filter(actor=>actor.key===key);
  if(matches.length!==1)throw new TypeError('未找到唯一的当前生物候选。');
  const actor=matches[0]!,generation=actor.generation;
  if(report.members){
    const members=report.members.filter(member=>member.key===key);
    if(members.length!==1||members[0]!.start!==actor.start||members[0]!.end!==actor.end)
      throw new TypeError('生物候选与完整来源清单不一致。');
  }
  if(actor.source!==report.source.slice(actor.start,actor.end)||!generation||!generation.candidateAvailable
    ||!actor.analysis.ir||JSON.stringify(actor.analysis.ir)!==JSON.stringify(generation.analysis.ir))
    throw new TypeError('生物候选分段或生成身份已改变。');
  const response=assertCurrentBrowserActorIntakeCandidate(encounterActorInput(report,actor),generation);
  if(!isUsableActorCandidateArtifact(response.result.artifact))throw new TypeError('当前生物没有可读取的 Actor 候选。');
  return{key,label:actor.analysis.candidate?.label??key,source:actor.source,finalSource:generation.finalSource!,
    artifact:response.result.artifact,artifactHash:hashArtifact(response.result.artifact),strictStatus:response.result.status,
    findings:generation.findings.map(finding=>`${finding.code}：${finding.message}`)};
}

function encounterActorInput(report:EncounterIntakeReport,actor:EncounterIntakeActor){
  return{source:actor.source,sourceName:actor.analysis.candidate?.label??actor.key,displayName:actor.analysis.candidate?.label??actor.key,
    requestId:`encounter-ai-${report.sourceHash.slice(0,12)}-${actor.key}`,fvttVersion:'14.364',systemVersion:'5.3.3'};
}
function continuationOptions(options:EncounterIntakeReport['requestedOptions']){
  return JSON.stringify({protocol:options?.protocol,reasoning:options?.reasoning,maxAttempts:options?.maxAttempts});
}

/** Encounter reports deliberately include formal artifacts; they never contain provider credentials or raw envelopes. */
export function assertEncounterSecretsAbsent(content:string,forbiddenValues:readonly string[]):void{
  if(/(?:^|\n)\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:/iu.test(content)
    ||/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/iu.test(content)
    ||/"(?:apiKey|authorization|cookie|endpoint|baseUrl|rawResponse|providerResponse|savedApiKeys)"\s*:/iu.test(content)){
    throw new TypeError('战斗包安全检查拒绝了凭据或原始服务响应。');
  }
  for(const value of forbiddenValues){if(value.trim()&&content.includes(value.trim()))throw new TypeError('战斗包包含当前配置的敏感连接信息。');}
}

export function createEncounterIntakeProviders(options:BrowserAiProviderOptions & {allowLocalBridge?:boolean;onCompilationRejected?:(evidence:EncounterCompilerRejection)=>void;responseEvidence?:import('@fvtt-json-generator/intake-ai/provider').ProviderResponseEvidenceSink;
  onExtractionStage?:(metadata:unknown)=>void|Promise<void>},signal?:AbortSignal){
  const waitPolicy=options.waitPolicy??(options.timeoutMs===undefined&&options.repairTimeoutMs===undefined?createContinuousIntakeWaitPolicy():undefined);
  const url=new URL(options.baseUrl);
  const loopback=(host:string)=>['127.0.0.1','localhost','[::1]'].includes(host);
  const localBridge=options.allowLocalBridge===true&&url.protocol==='http:'&&loopback(url.hostname);
  if(url.username||url.password||url.search||url.hash)throw new Error('AI连接地址不能含内嵌凭据、查询或片段。');
  if(url.protocol!=='https:'){
    const location=(globalThis as {location?:{hostname:string}}).location;
    if(url.protocol!=='http:'||!options.allowLocalBridge||!loopback(url.hostname)||(location&&!loopback(location.hostname))){
      throw new Error('普通AI连接必须使用HTTPS；本机桥接只允许本地页面显式使用loopback地址。');
    }
  }
  const transport={protocol:options.protocol??'openai-chat',authScheme:options.authScheme??'bearer',reasoning:options.reasoning,
    structuredOutput:{mode:options.structuredOutput??'json_object'},...(options.protocol==='openai-responses'?{stream:true}:{})};
  const retry=localBridge&&options.waitPolicy?{signal,budgetMs:options.encounterRetryBudgetMs,onRetry:options.onRetry}:undefined;
  const providerTimeoutMs=retry?600000:options.timeoutMs??600000;
  const providerRepairTimeoutMs=retry?600000:options.repairTimeoutMs??600000;
  const createActorProvider=(attemptSignal?:AbortSignal)=>new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:options.apiKey,baseUrl:options.baseUrl,signal:combineEncounterSignals(signal,attemptSignal),maxAttempts:1,
    model:options.model,reviewModel:options.model,timeoutMs:providerTimeoutMs,repairTimeoutMs:providerRepairTimeoutMs,
    reviewFocus:'forge-brief',
    evidenceAnchoring:'exact-quotes',
    stagedExtraction:{baseMode:'facts',featureMode:'whole-v2',maxCorrections:options.autoCorrect===true?1:0,preserveCandidates:true,signal:combineEncounterSignals(signal,attemptSignal),onStage:options.onExtractionStage},
    responseEvidence:options.responseEvidence,
    waitPolicy,onActivity:options.onActivity,
    transport,httpClient:(requestUrl,init)=>fetch(requestUrl,{...init,signal:combineEncounterSignals(signal,attemptSignal,init?.signal)})});
  const baseActorProvider=createActorProvider();
  const createAutomationProvider=(attemptSignal?:AbortSignal)=>createEncounterAutomationProvider({...options,waitPolicy,reviewModel:options.model,reviewFocus:'forge-brief',timeoutMs:providerTimeoutMs},combineEncounterSignals(signal,attemptSignal));
  const baseAutomationProvider=createAutomationProvider();
  const actorProvider=retry?retryingMonsterProvider(baseActorProvider,createActorProvider,retry):baseActorProvider;
  const automationProvider=retry?retryingAutomationProvider(baseAutomationProvider,createAutomationProvider,retry):baseAutomationProvider;
  const translationService = createReviewedTranslationService({ ...options, waitPolicy, reviewModel:options.model, reviewFocus:'forge-brief', protocol: transport.protocol, authScheme: transport.authScheme,
    structuredOutput: transport.structuredOutput, stream: options.protocol === 'openai-responses',
    httpClient: (url, init) => fetch(url, { ...init, signal: combineEncounterSignals(signal, init?.signal) }),
  });
  return {provider:actorProvider,automationProvider,translationService,evidenceMode:'exact-quotes-v1' as const,requestedOptions:{protocol:transport.protocol,reasoning:options.reasoning,autoCorrect:options.autoCorrect===true,...(retry?{maxAttempts:2 as const}:{})}};
}

export function retryingMonsterProvider(
  identity:MonsterIntakeAiProvider,
  createAttempt:(signal:AbortSignal)=>MonsterIntakeAiProvider,
  retry:EncounterStageRetryOptions,
):MonsterIntakeAiProvider{
  const call=<T>(stage:Extract<EncounterRetryStage,'discover'|'extract'|'review'|'repair'>,invoke:(provider:MonsterIntakeAiProvider)=>Promise<T>)=>
    retryEncounterStage(stage,retry,signal=>invoke(createAttempt(signal)));
  const correctionCounts=new WeakMap<Parameters<MonsterIntakeAiProvider['extract']>[0],0|1>();
  return {
    providerName:identity.providerName,extractionModel:identity.extractionModel,reviewModel:identity.reviewModel,
    getExtractionCorrectionCount:request=>correctionCounts.get(request)??0,
    discover:request=>call('discover',provider=>provider.discover(request)),
    extract:request=>call('extract',async provider=>{
      try{return await provider.extract(request);}
      catch(error){
        // Once this creature spent its model correction, a fresh transport
        // attempt must not recreate a provider with a fresh correction budget.
        if(provider.getExtractionCorrectionCount?.(request)===1&&error instanceof MonsterIntakeProviderError&&error.retryable){
          throw new MonsterIntakeProviderError(error.code,error.message,{retryable:false,status:error.status,
            diagnostic:error.diagnostic,transportFailure:error.transportFailure,stagedDiagnostic:error.stagedDiagnostic});
        }
        throw error;
      }finally{correctionCounts.set(request,provider.getExtractionCorrectionCount?.(request)??0);}
    }),
    review:request=>call('review',provider=>provider.review(request)),
    repair:request=>call('repair',provider=>provider.repair(request)),
  };
}

export function retryingAutomationProvider(
  identity:EncounterAutomationPort,
  createAttempt:(signal:AbortSignal)=>EncounterAutomationPort,
  retry:EncounterStageRetryOptions,
):EncounterAutomationPort{
  return {
    generate:request=>retryEncounterStage('automation-generate',retry,signal=>createAttempt(signal).generate(request)),
    review:request=>retryEncounterStage('automation-review',retry,signal=>createAttempt(signal).review(request)),
  };
}

/** All entities pass the existing single-source IR gates before a new package is constructed. */
export async function generateEncounterFromHumanMarkdown(input:EncounterIntakeInput):Promise<EncounterIntakeResult>{
  const {source,provider,automationProvider,signal}=input;
  const deferred=input.reviewPolicy==='deferred';
  let conditionCatalog:ConfiguredConditionDefinition[]=[];
  const report:EncounterIntakeReport={version:1,source,sourceHash:hashSource(source),model:provider.extractionModel,
    reviewModel:provider.reviewModel,evidenceMode:input.evidenceMode??'standard',requestedOptions:input.requestedOptions,status:'running',actors:[],findings:[]};
  let continuationValidated=!input.previousReport;
  const progress=(message:string)=>{signal?.throwIfAborted();input.onProgress?.(message);};
  const publish=()=>input.onReport?.(structuredClone(report));
  const pending=(findings:string[]):EncounterIntakeResult=>{report.status=signal?.aborted?'failed':'needs_review';report.findings=[...new Set([...report.findings,...findings])];
    if(!continuationValidated)return{report,continuationRejected:report.findings.join('\n')};
    publish();return {report};};
  const prepareRetainedActors=async():Promise<PreparedForgeEncounter|undefined>=>{
    if(!report.members?.length||report.members.length!==report.actors.length||report.members.some(member=>member.status!=='available')
      ||report.actors.some(actor=>!actor.generation?.finalSource||!actor.generation.candidateAvailable))return;
    const bundle:ForgeEncounterPackage={schema:'fvtt-json-forge-encounter',version:1,id:`intake-${report.sourceHash.slice(0,20)}`,
      label:input.label,target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:report.actors[0]!.key,
      actors:report.actors.map(actor=>({key:actor.key,label:actor.analysis.candidate!.label,source:actor.generation!.finalSource!,sourceHash:hashSource(actor.generation!.finalSource!)})),macros:[],assets:[]};
    return prepareForgeEncounter(serializeForgeEncounterPackage(bundle),signal);
  };
  const finishDeferred=async(prepared:PreparedForgeEncounter):Promise<EncounterIntakeResult>=>{
    report.automationReview={status:'not_requested'};report.outputLanguage='source';
    report.status='ready_for_gm_review';report.packageHash=prepared.hash;publish();
    if(input.outputLanguage==='zh-CN'){
      try{
        if(!input.translationService)throw new Error('中文生成缺少翻译服务。');
        report.localization=[];
        const localizationDraft=await draftForgeEncounterLocalization({prepared,service:input.translationService,signal,onProgress:progress,
          onReview:entry=>{const index=report.localization!.findIndex(prior=>prior.actorKey===entry.actorKey);
            if(index<0)report.localization!.push(entry);else report.localization![index]=entry;publish();}});
        report.localizationDraft=localizationDraft;publish();return {report,prepared,localizationDraft};
      }catch(error){report.findings.push(`中文草稿未完成：${safeFailure(error)}；原语言包仍可供 GM 核对。`);publish();}
    }
    return {report,prepared};
  };
  try{
    conditionCatalog=decodeConfiguredConditionCatalog(input.conditionCatalog??[]);
    report.conditionCatalogHash=hashSource(JSON.stringify(conditionCatalog));
    if(!source.trim()||source.length>24000)throw new Error('原始战斗资料须为1至24000个字符。');
    if(!input.label.trim()||input.label.length>160)throw new Error('请填写不超过160字符的资料名称。');
    if(input.drafts?.length||input.previousReport){if(!/^[a-f0-9]{64}$/.test(input.draftParentHash??''))throw new Error('缺少草稿来源报告指纹。');report.recovery={parentReportHash:input.draftParentHash!,mode:'fresh-validation-and-review'};}
    const previous=input.previousReport;
    if(previous&&(previous.source!==source||previous.sourceHash!==report.sourceHash
      ||hashSource(JSON.stringify(previous))!==input.draftParentHash||previous.conditionCatalogHash!==report.conditionCatalogHash
      ||previous.model!==provider.extractionModel||previous.reviewModel!==provider.reviewModel
      ||continuationOptions(previous.requestedOptions)!==continuationOptions(input.requestedOptions)))
      throw new TypeError('继续任务的来源、报告、状态目录或模型／生成选项已改变。');
    if(previous)for(const actor of previous.actors)if(actor.generation?.candidateAvailable)encounterActorCandidate(previous,actor.key);
    progress('正在识别资料中的全部生物。');
    const explicit=explicitCreatureSections(source);
    const single=singleCreatureSourceCandidate(source);
    const retainedDiscovery=previous?.members?.map(member=>({id:member.key,label:member.label,start:member.start,end:member.end,quote:source.slice(member.start,member.end)}));
    const local=retainedDiscovery??(explicit.length>=2?explicit:single?[single]:undefined);
    report.discovery={mode:explicit.length>=2?'ordinary-headings':single?'single-statblock':'ai-discovery',providerCalls:local?0:1};
    const discovery=local?{candidates:local}:await provider.discover({source,sourceSha256:report.sourceHash,chunkStart:0,chunkEnd:source.length});
    signal?.throwIfAborted();
    const raw=normalizeDiscovery(source,discovery.candidates);
    if(raw.length<1||raw.length>6)return pending(['战斗包入口需要识别1至6种生物；不会自动选取第一种或忽略其余生物。']);
    const candidates=partitionDiscoveryCandidates(source,raw);
    if(previous?.members&&(previous.members.length!==candidates.length||previous.members.some((member,index)=>
      member.key!==`actor-${index+1}`||member.start!==candidates[index]!.start||member.end!==candidates[index]!.end)))
      throw new TypeError('继续任务的完整生物清单与当前来源不符。');
    report.members=candidates.map((candidate,index)=>({key:`actor-${index+1}`,label:candidate.label,start:candidate.start,end:candidate.end,status:'pending',findings:[]}));
    if(input.drafts&&(input.drafts.length>candidates.length||new Set(input.drafts.map(d=>d.key)).size!==input.drafts.length
      ||input.drafts.some(d=>!candidates.some((_,index)=>d.key===`actor-${index+1}`))))throw new Error('草稿生物清单与当前资料不符。');
    if(input.sourceFeedback?.length){
      if(input.sourceFeedback.length>32||input.sourceFeedback.some(f=>(!input.drafts?.some(d=>d.key===f.actorKey)
        &&!previous?.actors.some(actor=>actor.key===f.actorKey&&actor.analysis.ir))
        ||!/^\/(?:creature|claims|coverage|uncertainties)(?:\/|$)/.test(f.path)||f.path.length>240||!f.message.trim()||f.message.length>2000))throw new Error('来源审阅反馈必须对应当前草稿和明确IR字段。');
      report.sourceFeedback=structuredClone(input.sourceFeedback);
    }
    continuationValidated=true;publish();
    for(const [index,candidate] of candidates.entries()){
      const key=`actor-${index+1}`;
      const member=report.members[index]!;
      const actorSource=source.slice(candidate.start,candidate.end);
      const prior=previous?.actors.find(actor=>actor.key===key);
      const draft=input.drafts?.find(d=>d.key===key);
      if(draft&&draft.source!==actorSource)throw new Error('草稿分段与当前原始资料不一致。');
      if(prior?.generation?.candidateAvailable&&!input.sourceFeedback?.some(feedback=>feedback.actorKey===key)
        &&(!draft||JSON.stringify(draft.ir)===JSON.stringify(prior.analysis.ir))){
        const candidate=encounterActorCandidate(previous!,key);
        if(prior.start!==member.start||prior.end!==member.end||candidate.source!==actorSource)throw new TypeError('保留候选与当前生物分段不一致。');
        const retained=structuredClone(prior);
        if(retained.generation?.gmApproval){retained.generation={...retained.generation,status:'ready_for_gm_review',gmApproval:undefined,response:undefined};}
        report.actors.push({...retained,origin:'prior-proposal',reusedCandidate:true});
        member.status='available';member.findings=candidate.findings;publish();
        progress(`生物${index+1}/${candidates.length}：${member.label} · 已核对并保留现有候选，不重复提取或生成。`);
        continue;
      }
      member.status='running';publish();
      const fixed:MonsterIntakeAiProvider={providerName:provider.providerName,extractionModel:provider.extractionModel,reviewModel:provider.reviewModel,
        getExtractionCorrectionCount:r=>provider.getExtractionCorrectionCount?.(r)??0,
        discover:async()=>({schemaVersion:1,candidates:[{id:key,label:candidate.label,start:0,end:actorSource.length,quote:actorSource}]}),
        extract:r=>provider.extract(r),review:r=>provider.review(r),repair:r=>provider.repair(r)};
      let pendingManualRules: Array<EncounterAutomationRule & {mechanicId:string;capabilityKind:'gm-manual'}>=[];
      const actorInput={source:actorSource,sourceName:candidate.label,displayName:candidate.label,
        requestId:`encounter-ai-${report.sourceHash.slice(0,12)}-${key}`,fvttVersion:'14.364',systemVersion:'5.3.3',
        renderMarkdown:(ir:MonsterIntakeIR)=>renderEncounterActorSource(ir,pendingManualRules,actorSource),
        onStage:(stage:{stage:string;status:string})=>input.onProgress?.(`生物${index+1}/${candidates.length}：${candidate.label} · ${actorStageLabel(stage.stage)} ${actorStageStatus(stage.status)}`)};
      const existingIr=draft?.ir??prior?.analysis.ir;
      let analysis=existingIr?analyzeBrowserActorIntakeDraft(actorInput,existingIr,fixed):await analyzeBrowserActorSourceWithAi(actorInput,fixed,signal);
      const feedback=input.sourceFeedback?.filter(f=>f.actorKey===key).map((f,i)=>({id:`source-feedback-${i+1}`,code:'SOURCE_REVIEW_FEEDBACK',path:f.path,message:f.message,blocking:true,origin:'semantic' as const}))??[];
      if(feedback.length){
        const ir=analysis.ir?structuredClone(analysis.ir):undefined;
        if(ir)ir.uncertainties=[...ir.uncertainties.filter(entry=>!feedback.some(finding=>finding.id===entry.id)),
          ...feedback.map(({origin:_origin,...finding})=>({...finding,evidence:[]}))];
        analysis={...analysis,...(ir?{ir}:{}),status:'needs_review',findings:[...analysis.findings,...feedback],validation:{...analysis.validation!,findings:[...analysis.validation!.findings,...feedback],blocking:[...analysis.validation!.blocking,...feedback]}};
        progress(`生物${index+1}/${candidates.length}：来源审阅反馈已保留为待核对问题；仅明确开启纠错才会请求修改。`);
      }
      analysis.calls.discovery=0; // The actor partition is already known; its local boundary step makes no provider call.
      signal?.throwIfAborted();
      const actor:EncounterIntakeActor={key,start:candidate.start,end:candidate.end,source:actorSource,origin:existingIr?'prior-proposal':'fresh-extraction',analysis};report.actors.push(actor);publish();
      if(input.requestedOptions?.autoCorrect===true&&analysis.status==='needs_review'&&analysis.ir&&analysis.candidate&&analysis.repairCount===0){
        const original=analysis;
        analysis=await repairBrowserActorIntake(actorInput,analysis,fixed,signal);
        if(analysis.status==='failed'&&original.ir)analysis={...original,repairCount:analysis.repairCount,calls:analysis.calls,
          findings:[...original.findings,...analysis.findings],stages:analysis.stages};
        actor.analysis=analysis;publish();
      }
      if(!analysis.ir||!analysis.candidate){
        member.status=signal?.aborted?'cancelled':'failed';member.findings=analysis.findings.map(f=>`${f.code}：${f.message}`);
        return pending(member.findings.map(f=>`${candidate.label}：${f}`));
      }
      pendingManualRules=manualPreparationRules(analysis.ir!,actorSource,key);
      let generation=await (deferred?generateBrowserActorIntakeCandidate:generateAndReviewBrowserActorIntake)(actorInput,analysis,fixed,signal);
      actor.generation=generation;publish();
      if(input.requestedOptions?.autoCorrect===true&&!deferred&&generation.status==='needs_review'&&generation.review?.verdict==='revise'&&analysis.repairCount===0){
        analysis=await repairBrowserActorIntake(actorInput,generation,fixed,signal);actor.analysis=analysis;publish();
        if(analysis.status==='ready_to_generate'){
          pendingManualRules=manualPreparationRules(analysis.ir!,actorSource,key);
          generation=await generateAndReviewBrowserActorIntake(actorInput,analysis,fixed,signal);
        }
      }
      actor.generation=generation;
      if(!generation.candidateResponse||!('result' in generation.candidateResponse)||!generation.candidateResponse.result.artifact){
        member.status=signal?.aborted?'cancelled':'failed';member.findings=generation.findings.map(f=>`${f.code}：${f.message}`);
        return pending(member.findings.map(f=>`${candidate.label}：${f}`).concat([`${candidate.label}尚无可读取的 Actor 候选。`]));
      }
      member.status='available';member.findings=generation.findings.map(f=>`${f.code}：${f.message}`);publish();signal?.throwIfAborted();
      if(!hasManualPreparationEvidence(generation.findings,analysis.ir!,pendingManualRules,actorSource))
        report.findings.push(`${candidate.label} 的手工条件准备仍需 GM 核对，完整来源与候选保留。`);
    }
    const concerns=report.actors.flatMap(actor=>actor.generation!.findings.filter(f=>f.blocking).map(f=>`${actor.analysis.candidate!.label}：${f.code} ${f.message}`));
    if(concerns.length||report.actors.some(actor=>actor.generation?.formalStatus==='failed')){
      report.findings.push(...concerns);report.generationRoute='actors-only';
      report.findings.push('候选含待核对问题；检查结论未提升为通过。完整规则保留，缺少的配套控制由 GM 按原文处理。');
      return await finishDeferred((await prepareRetainedActors())!);
    }
    const native=report.actors.length===1?report.actors[0]:undefined;
    const needsCompanion=(native?.generation?.actorProjection as any)?.items?.some((item:any)=>
      (item.flags?.fvttJsonGenerator?.behaviorMechanics??[]).some((mechanic:any)=>['gm-assisted','external-rule'].includes(mechanic.executionMode)));
    if(deferred&&native&&native.generation?.formalStatus==='accepted'&&native.generation.intakeVerificationStatus==='accepted'
      &&!native.generation.findings.some(f=>f.blocking)&&!needsCompanion
      &&manualPreparationRules(native.analysis.ir!,native.source,native.key).length===0
      &&encounterStagedConditionRequirements(native.analysis.ir!,native.source).length===0){
      const legendary=native.analysis.ir!.creature.legendary;
      const sourceRecovery=legendary?.recovery==='own-turn-start'?compileEncounterSelection({version:2,name:`${native.analysis.ir!.creature.identity.name} resource control`,
        notes:'Source-bound legendary recovery uses the existing controller. Start this control before combat: it suppresses the system turn-end recovery and restores spent uses at this Actor’s own turn start. The lair checkbox retains the source base and +1 maxima. Other complete GM rules remain manual.',
        rules:[],legendaryRecovery:[{actorKey:native.key,max:legendary.max,when:'own-turn-start',quote:legendary.evidence[0]!.quote}],
        manualSteps:['Start the source-bound resource control before combat; other spell exceptions and per-action cooldowns remain GM adjudication.']},
        {source,conditionCatalog,actors:[{key:native.key,ir:native.analysis.ir!,source:native.source,artifact:native.generation.actorProjection}]}):undefined;
      report.generationRoute=sourceRecovery?'encounter-with-controller':'single-actor-native';
      if(sourceRecovery)report.automation=sourceRecovery;
      progress('唯一生物已通过原生生成与来源校验，省略配套控制配置请求；仍需GM确认。');
      const actorSource=sourceRecovery?renderEncounterActorSource(native.analysis.ir!,[],native.source):native.generation.finalSource!;
      const bundle:ForgeEncounterPackage={schema:'fvtt-json-forge-encounter',version:1,id:`intake-${report.sourceHash.slice(0,20)}`,
        label:input.label,target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:native.key,
        actors:[{key:native.key,label:native.analysis.candidate!.label,source:actorSource,sourceHash:hashSource(actorSource)}],macros:sourceRecovery?(()=>{const command=buildEncounterMacroCommand(sourceRecovery);return[{key:'battle-control',name:sourceRecovery.name,command,commandHash:hashSource(command),bindings:{[native.key]:native.key},covers:[],notes:[sourceRecovery.notes,...sourceRecovery.manualSteps,`原始资料SHA-256：${report.sourceHash}`].join('\n')}];})():[],assets:[]};
      return await finishDeferred(await prepareForgeEncounter(serializeForgeEncounterPackage(bundle),signal));
    }
    report.generationRoute='encounter-with-controller';
    const request:EncounterAutomationRequest={source,conditionCatalog,actors:report.actors.map(a=>({key:a.key,ir:a.analysis.ir!,source:a.source,artifact:a.generation!.actorProjection}))};
    progress('角色来源审核已通过，正在提取固定自动化能力与参数；AI不会编写宏代码。');
    let automation=decodeEncounterAutomation(await automationProvider.generate(request),request);signal?.throwIfAborted();
    for(let attempt=0;attempt<2;attempt++){
      report.automation=automation;publish();
      const rules=automation.rules.map((rule,index)=>({...rule,mechanicId:`encounter-rule-${index+1}`,capabilityKind:automation.selection?.rules[index]?.kind}));
      const stagedCovers=report.actors.flatMap(actor=>encounterStagedConditionRequirements(actor.analysis.ir!,actor.source)
        .map(requirement=>({actorKey:actor.key,mechanicId:requirement.mechanicId})));
      const manualCovers=report.actors.flatMap(actor=>encounterManualConditionRequirements(actor.analysis.ir!,rules.filter(rule=>rule.actorKey===actor.key))
        .map(requirement=>({actorKey:actor.key,mechanicId:requirement.mechanicId})));
      for(const actor of report.actors){
        for(const required of manualPreparationRules(actor.analysis.ir!,actor.source,actor.key)){
          if(rules.filter(rule=>rule.actorKey===actor.key&&rule.section===required.section
            &&rule.featureName===required.featureName
            && (manualForcedMovementRequirements(actor.analysis.ir!,actor.source).some(movement=>movement.section===required.section&&movement.featureName===required.featureName)
              ? rule.capabilityKind==='gm-manual' : ['gm-manual','status-lifecycle'].includes(rule.capabilityKind??''))).length!==1){
            return pending([`${actor.key} 的 ${required.section}/${required.featureName} 缺少来源绑定的 GM 手工条件覆盖。`]);
          }
        }
      }
      const command=buildEncounterMacroCommand(automation);
      const bundle:ForgeEncounterPackage={schema:'fvtt-json-forge-encounter',version:1,id:`intake-${report.sourceHash.slice(0,20)}`,
        label:input.label,target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:report.actors[0]!.key,
        actors:report.actors.map(a=>{const rendered=renderEncounterActorSource(a.analysis.ir!,rules.filter(r=>r.actorKey===a.key),a.source);return {key:a.key,label:a.generation!.analysis.candidate!.label,source:rendered,sourceHash:hashSource(rendered)};}),
        macros:[{key:'battle-control',name:automation.name,command,commandHash:hashSource(command),
          bindings:Object.fromEntries(report.actors.map(a=>[a.key,a.key])),covers:[...rules.map(r=>({actorKey:r.actorKey,mechanicId:r.mechanicId})),...stagedCovers,...manualCovers],
          notes:[automation.notes,...automation.manualSteps,`原始资料SHA-256：${report.sourceHash}`].join('\n')}],assets:[]};
      progress('工具已生成固定控制入口，正在核对整包和自动化配置的来源语义。');
      const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(bundle),signal);
      for(const actor of report.actors){
        const pendingRules=manualPreparationRules(actor.analysis.ir!,actor.source,actor.key);
        if(pendingRules.length===0)continue;
        const final=prepared.actors.find(item=>item.key===actor.key);
        const finalSource=bundle.actors.find(item=>item.key===actor.key)?.source;
        if(!final||!finalSource||!hasManualPreparationEvidence(
          verifyMonsterIntake(actor.source,actor.analysis.ir!,finalSource,final.artifact).findings,actor.analysis.ir!,pendingRules,actor.source)){
          return pending([`${actor.key} 的最终 Actor 未证明特殊后果只由 GM 处理。`]);
        }
      }
      if(deferred){
        return await finishDeferred(prepared);
      }
      const review=await automationProvider.review({...request,automation,finalSources:prepared.actors.map(a=>({key:a.key,source:bundle.actors.find(s=>s.key===a.key)!.source,artifact:a.artifact}))});
      signal?.throwIfAborted();report.automationReview=review;publish();
      if(review.verdict==='accepted'&&review.findings.length===0){
        report.outputLanguage=input.outputLanguage??'source';
        let finalPrepared=prepared;
        if(input.outputLanguage==='zh-CN'){
          report.localization=[];
          try {
            if(!input.translationService)throw new Error('中文生成缺少翻译与简要复核服务。');
            finalPrepared=await localizeForgeEncounter({bundle:prepared.bundle,service:input.translationService,signal,onProgress:progress,
              onReview:entry=>{const index=report.localization!.findIndex(prior=>prior.actorKey===entry.actorKey);if(index<0)report.localization!.push(entry);else report.localization![index]=entry;publish();}});
          } catch(error) {
            // The already reviewed source-language package remains available for explicit GM review.
            report.outputLanguage='source';
            report.status='ready_for_gm_review';
            report.packageHash=prepared.hash;
            report.findings=[`中文候选未通过：${safeFailure(error)}；已保留原语言包。`];
            publish();
            return {report,prepared};
          }
        }
        signal?.throwIfAborted();report.status='ready_for_gm_review';report.packageHash=finalPrepared.hash;publish();return {report,prepared:finalPrepared};
      }
      if(attempt===1||input.requestedOptions?.autoCorrect!==true){
        report.status='ready_for_gm_review';report.packageHash=prepared.hash;report.outputLanguage='source';
        report.findings.push(...(review.findings.length?review.findings:['配套自动化未通过模型简要复核。']),
          '保留当前候选和审核问题，由 GM 核对后决定使用。');publish();return{report,prepared};
      }
      progress('自动化审阅发现问题，进行本次唯一一次修正。');
      automation=decodeEncounterAutomation(await automationProvider.generate({...request,prior:automation,findings:review.findings}),request);signal?.throwIfAborted();
    }
    return pending(['没有产生已审核的战斗包。']);
  }catch(error){
    if(!continuationValidated){
      report.status='failed';report.findings=[signal?.aborted?'任务已取消。':safeFailure(error)];
      return{report,continuationRejected:report.findings.join('\n')};
    }
    for(const member of report.members??[])if(member.status==='running'){
      member.status=signal?.aborted?'cancelled':'failed';member.findings.push(signal?.aborted?'任务已取消。':safeFailure(error));
    }
    if(!signal?.aborted){
      try{
        const retained=await prepareRetainedActors();
        if(retained){report.generationRoute='actors-only';report.automation=undefined;report.findings.push(...(error instanceof EncounterAutomationSelectionNeedsReviewError?error.findings:[safeFailure(error)]),
          '后续处理未完成，原生候选与完整来源仍可获取；缺少的控制由 GM 处理。');
          report.status='ready_for_gm_review';report.packageHash=retained.hash;report.outputLanguage='source';publish();return{report,prepared:retained};}
      }catch{/* Keep the original failure if no usable retained package can be prepared. */}
    }
    if(error instanceof EncounterAutomationSelectionNeedsReviewError)return pending(error.findings);
    report.status='failed';report.findings.push(signal?.aborted?'任务已取消，没有创建世界文档。':safeFailure(error));publish();return {report};
  }
}

/** The paid audit button reviews only the currently prepared source-bound candidate. */
export async function reviewForgeEncounterCandidate(input:{
  source:string;report:EncounterIntakeReport;prepared:PreparedForgeEncounter;
  provider:MonsterIntakeAiProvider;automationProvider:EncounterAutomationPort;
  conditionCatalog?:ConfiguredConditionDefinition[];
  translationService?:ReviewedTranslationServicePort;
  signal?:AbortSignal;onReport?:(report:EncounterIntakeReport)=>void;
}):Promise<EncounterIntakeResult>{
  const {source,prepared,provider,automationProvider,signal}=input;
  const conditionCatalog=decodeConfiguredConditionCatalog(input.conditionCatalog??[]);
  assertPreparedForgeEncounter(prepared);
  const actorsOnly=['single-actor-native','actors-only'].includes(input.report.generationRoute??'')
    &&prepared.bundle.macros.length===0&&!input.report.automation;
  if(prepared.bundle.localization||input.report.status!=='ready_for_gm_review'
    ||input.report.source!==source||input.report.sourceHash!==hashSource(source)
    ||input.report.packageHash!==prepared.hash||input.report.actors.length!==prepared.actors.length
    ||input.report.model!==provider.extractionModel||input.report.reviewModel!==provider.reviewModel
    ||input.report.conditionCatalogHash!==hashSource(JSON.stringify(conditionCatalog))
    ||(input.report.members&&(input.report.members.length!==input.report.actors.length||input.report.members.some((member,index)=>
      member.status!=='available'||member.key!==input.report.actors[index]?.key
      ||member.start!==input.report.actors[index]?.start||member.end!==input.report.actors[index]?.end)))
    ||(!actorsOnly&&!input.report.automation))throw new TypeError('战斗包来源、模型或正式候选已变化，不能审核旧候选。');
  const report=structuredClone(input.report);
  const publish=()=>input.onReport?.(structuredClone(report));
  // Check every actor and the final fixed configuration before any paid audit.
  const actorInputs=report.actors.map(actor=>{
    if(actor.source!==source.slice(actor.start,actor.end)||!prepared.bundle.actors.some(entry=>entry.key===actor.key)
      ||!actor.generation||!actor.analysis.ir
      ||JSON.stringify(actor.analysis.ir)!==JSON.stringify(actor.generation.analysis.ir))
      throw new TypeError('战斗包生物分段或生成身份与当前候选不一致。');
    const actorInput=encounterActorInput(report,actor);
    const response=assertBrowserActorIntakeReviewContext(actorInput,actor.generation,provider,true);
    if(!actor.generation.candidateAvailable||!response.result.artifact)
      throw new TypeError(`${actor.key} 的本地来源或正式产物仍有阻断问题。`);
    if(actorsOnly){
      const bound=prepared.bundle.actors.find(entry=>entry.key===actor.key)!,final=prepared.actors.find(entry=>entry.key===actor.key);
      if(bound.source!==actor.generation.finalSource||bound.sourceHash!==actor.generation.finalSourceHash
        ||!final||final.sourceHash!==bound.sourceHash||final.artifactHash!==hashArtifact(response.result.artifact)
        ||hashArtifact(final.artifact)!==final.artifactHash)
        throw new TypeError('无配套宏候选的最终来源或 Actor 产物与当前生成身份不一致。');
    }
    return {actor,actorInput};
  });
  const request:EncounterAutomationRequest={source,conditionCatalog,actors:report.actors.map(actor=>({
    key:actor.key,ir:actor.analysis.ir!,source:actor.source,
    artifact:prepared.actors.find(entry=>entry.key===actor.key)!.artifact,
  }))};
  const automation=actorsOnly?undefined:decodeEncounterAutomation(report.automation,request);
  const rules=automation?.rules.map((rule,index)=>({...rule,mechanicId:`encounter-rule-${index+1}`,
    capabilityKind:automation.selection?.rules[index]?.kind}))??[];
  if(!actorsOnly&&((prepared.bundle.macros.length!==1||prepared.bundle.macros[0]!.command!==buildEncounterMacroCommand(automation!))
    ||report.actors.some(actor=>prepared.bundle.actors.find(entry=>entry.key===actor.key)?.source
      !==renderEncounterActorSource(actor.analysis.ir!,rules.filter(rule=>rule.actorKey===actor.key),actor.source))))
    throw new TypeError('固定控制入口或最终生物来源与待审核配置不一致。');
  if(report.localizationDraft){
    if(!input.translationService)throw new TypeError('中文草稿审核缺少当前模型服务。');
    assertForgeEncounterLocalizationDraft(prepared,report.localizationDraft);
  }
  for(const {actor,actorInput} of actorInputs){
    const current=actor.generation!; // preflight checked every actor before the first paid request
    if(current.modelReviewStatus==='not_requested'||current.modelReviewStatus==='failed'){
      actor.generation=await reviewBrowserActorIntakeCandidate(actorInput,current,provider,signal);
      publish();
      if(actor.generation.modelReviewStatus==='failed'){
        report.findings=[...report.findings,`${actor.key} 模型审核未完成：${actor.generation.modelReviewError??'请求失败。'}`];
        publish();
        return {report,prepared,...(report.localizationDraft?{localizationDraft:report.localizationDraft}:{})};
      }
    }
    if(!actor.generation!.candidateAvailable){
      report.findings=[...report.findings,`${actor.key} 的候选审核未完成，保留原包供 GM 核对。`];
      publish();return {report,prepared};
    }
  }
  if(automation&&(!report.automationReview||'status'in report.automationReview)){
    try{
      const review=await automationProvider.review({...request,automation,finalSources:prepared.actors.map(actor=>({
        key:actor.key,source:prepared.bundle.actors.find(entry=>entry.key===actor.key)!.source,artifact:actor.artifact,
      }))});
      signal?.throwIfAborted();
      report.automationReview=review;
      report.findings=[...report.findings,...review.findings];
      publish();
    }catch(error){
      const message=safeFailure(error);
      report.automationReview={status:'failed',message};
      report.findings=[...report.findings,`模型整包审核未完成：${message}`];
      publish();
      return {report,prepared,...(report.localizationDraft?{localizationDraft:report.localizationDraft}:{})};
    }
  }
  let finalPrepared=prepared;
  if(report.localizationDraft){
    try{
      finalPrepared=await reviewForgeEncounterLocalizationDraft({prepared,draft:report.localizationDraft,
        service:input.translationService!,signal,onReview:entry=>{
          const rows=report.localization??[];const index=rows.findIndex(prior=>prior.actorKey===entry.actorKey);
          if(index<0)rows.push(entry);else rows[index]=entry;
          report.localization=rows;publish();
        }});
      report.outputLanguage='zh-CN';
    }catch(error){
      report.findings=[...report.findings,`中文模型审核未完成：${safeFailure(error)}；原语言包仍可供GM核对。`];
      publish();
      return {report,prepared,localizationDraft:report.localizationDraft};
    }
  }
  report.packageHash=finalPrepared.hash;
  report.status='ready_for_gm_review';
  publish();
  return {report,prepared:finalPrepared,...(report.localizationDraft?{localizationDraft:report.localizationDraft}:{})};
}
/** A pending preparation marker is never approval: the final selection must bind the same carrier as gm-manual. */
function manualPreparationRules(ir:MonsterIntakeIR,source:string,actorKey:string):Array<EncounterAutomationRule & {mechanicId:string;capabilityKind:'gm-manual'}>{
  const sections=[['trait',ir.creature.traits],['action',ir.creature.actions],['bonus',ir.creature.bonusActions],
    ['reaction',ir.creature.reactions],['legendary',ir.creature.legendaryActions]] as const;
  const rules:Array<EncounterAutomationRule & {mechanicId:string;capabilityKind:'gm-manual'}>=[];
  for (const movement of manualForcedMovementRequirements(ir, source)) {
    rules.push({actorKey, section:movement.section, featureName:movement.featureName, quote:movement.quote,
      mechanicId:`encounter-pending-push-${movement.section}-${Number(movement.claimPath.split('/').at(-1))+1}`,
      capabilityKind:'gm-manual',gmSteps:['使用原生豁免判定；推离仅由 GM 手动处理，当前是准备声明。',movement.description]});
  }
  for(const [section,features] of sections)for(const [index,feature] of features.entries()){
    const conditions=feature.appliedConditions??[];
    if(conditions.length===0||conditions.some(condition=>condition.staged))continue;
    const statuses=conditions.flatMap(condition=>condition.statuses??[]);
    // Ask the same generator that will build the Actor whether each literal status has a native projection.
    if(statuses.length===0||statuses.every(status=>extractExplicitlyInflictedStatuses(`The target is ${status}.`).length>0))continue;
    // Mixed native and special conditions need a separate decision; suppressing all embedded effects would lose native behavior.
    if(statuses.some(status=>extractExplicitlyInflictedStatuses(`The target is ${status}.`).length>0))continue;
    const refs=[...(feature.evidence??[]),...ir.claims.filter(claim=>claim.path===`/creature/${section==='bonus'?'bonusActions':section==='legendary'?'legendaryActions':section==='trait'?'traits':section==='action'?'actions':'reactions'}/${index}`)
      .flatMap(claim=>claim.evidence??[])];
    const quote=refs.map(ref=>ref.quote).find(value=>typeof value==='string'&&value.trim()&&source.split(value).length===2);
    if(!quote)throw new TypeError(`Manual condition ${section}/${index+1} has no unique exact source evidence.`);
    rules.push({actorKey,section,featureName:feature.name,quote,mechanicId:`encounter-pending-manual-${section}-${index+1}`,
      capabilityKind:'gm-manual',gmSteps:['GM按完整来源处理特殊状态；当前仅作准备声明。','最终配置必须由来源绑定的gm-manual规则覆盖。']});
  }
  return rules;
}
function hasManualPreparationEvidence(
  findings:readonly {code:string;path:string}[],ir:MonsterIntakeIR,
  rules:readonly (EncounterAutomationRule & {mechanicId:string;capabilityKind:'gm-manual'})[],
  source:string,
):boolean{
  return encounterManualConditionRequirements(ir,rules).every(requirement=>requirement.conditionPaths.every(path=>
    findings.some(finding=>finding.path===path&&finding.code==='ACTOR_CONDITION_REQUIRES_GM')
    &&!findings.some(finding=>finding.path===path&&finding.code==='ACTOR_CONDITION_DRIFT')))
    &&manualForcedMovementRequirements(ir,source).every(requirement=>
      findings.some(finding=>finding.code==='ACTOR_FORCED_MOVEMENT_REQUIRES_GM'
        &&finding.path===requirement.claimPath)
      &&!findings.some(finding=>finding.code==='ACTOR_FORCED_MOVEMENT_UNBOUND'&&finding.path===requirement.claimPath));
}
function safeFailure(error:unknown):string{
  const message=error instanceof Error?error.message:'生成失败';
  return message.replace(/https?:\/\/\S+/gi,'[endpoint]').replace(/Bearer\s+\S+/gi,'[credential]').slice(0,1600);
}
function actorStageLabel(stage:string):string{
  return ({discover:'识别来源',extract:'提取规则',validate:'核对来源',repair:'修正草稿',generate:'正式生成',review:'模型简要复核',finalize:'完成核对'} as Record<string,string>)[stage]??'处理当前阶段';
}
function actorStageStatus(status:string):string{
  return ({running:'进行中',completed:'已完成',failed:'失败',skipped:'已跳过'} as Record<string,string>)[status]??'状态待核对';
}

function isCompanionOnlyStagedGeneration(generation:BrowserActorGenerationResult,allowUnreviewed=false):boolean{
  const blocking=(allowUnreviewed?generation.deterministicFindings??generation.findings:generation.findings).filter(f=>f.blocking);
  return generation.status==='needs_review'
    && generation.formalStatus!=='failed'
    && (allowUnreviewed||generation.review?.verdict==='accepted')
    && Boolean(generation.finalSource)
    && blocking.length>0
    && blocking.every(f=>['ACTOR_STAGED_CONDITION_REQUIRES_COMPANION','ACTOR_CONDITION_REQUIRES_GM','ACTOR_FORCED_MOVEMENT_REQUIRES_GM'].includes(f.code));
}

/** Optional ordinary prose headings, not a required authoring schema or creature-name lookup. */
export function explicitCreatureSections(source:string):DiscoveryCandidate[]{
  const headings=[...source.matchAll(/^#{1,3}[ \t]+(?:生物[一二三四五六七八九十\d]*|Creature[ \t]+\d+)[ \t]*[:：][ \t]*(.+)$/gimu)];
  return headings.map((match,index)=>{const start=match.index!;const end=headings[index+1]?.index??source.length;
    return {id:`creature-${index+1}`,label:match[1]!.trim(),start,end,quote:source.slice(start,end)};});
}
