import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { decodeConfiguredConditionCatalog, type ConfiguredConditionDefinition } from '@fvtt-json-generator/contracts/configured-conditions';
import { normalizeDiscovery, partitionDiscoveryCandidates, singleCreatureSourceCandidate } from '@fvtt-json-generator/intake-ai/discovery';
import { OpenAICompatibleMonsterIntakeProvider } from '@fvtt-json-generator/intake-ai/provider';
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
  buildEncounterMacroCommand, renderEncounterActorSource, decodeEncounterAutomation, encounterStagedConditionRequirements,encounterManualConditionRequirements, manualForcedMovementRequirements,
  type EncounterAutomationIR, type EncounterAutomationRequest, type EncounterAutomationRule, type EncounterCompilerRejection,
} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {
  analyzeBrowserActorSourceWithAi, generateAndReviewBrowserActorIntake, generateBrowserActorIntakeCandidate,
  reviewBrowserActorIntakeCandidate, assertCurrentBrowserActorIntakeCandidate, repairBrowserActorIntake,
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
}
export interface EncounterIntakeReport {
  outputLanguage?: 'source' | 'zh-CN';
  localization?: EncounterLocalizationProgress[];
  localizationDraft?: ForgeEncounterLocalizationDraft;
  version:1;source:string;sourceHash:string;model:string;reviewModel:string;
  conditionCatalogHash?:string;
  evidenceMode:'standard'|'exact-quotes-v1';
  requestedOptions?:{protocol:BrowserAiProviderOptions['protocol'];reasoning:BrowserAiProviderOptions['reasoning'];maxAttempts?:1|2};
  discovery?:{mode:'ordinary-headings'|'single-statblock'|'ai-discovery';providerCalls:number};
  generationRoute?:'single-actor-native'|'encounter-with-controller';
  recovery?:{parentReportHash:string;mode:'fresh-validation-and-review'};
  sourceFeedback?:Array<{actorKey:string;path:string;message:string}>;
  status:'running'|'ready_for_gm_review'|'needs_review'|'failed';
  actors:EncounterIntakeActor[];automation?:EncounterAutomationIR;
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
  sourceFeedback?:Array<{actorKey:string;path:string;message:string}>;
  signal?:AbortSignal;onProgress?:(message:string)=>void;
  onReport?:(report:EncounterIntakeReport)=>void;
}
export interface EncounterIntakeResult {report:EncounterIntakeReport;prepared?:PreparedForgeEncounter;localizationDraft?:ForgeEncounterLocalizationDraft}

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
    stagedExtraction:{baseMode:'facts',featureMode:'auto',signal:combineEncounterSignals(signal,attemptSignal),onStage:options.onExtractionStage},
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
  return {provider:actorProvider,automationProvider,translationService,evidenceMode:'exact-quotes-v1' as const,requestedOptions:{protocol:transport.protocol,reasoning:options.reasoning,...(retry?{maxAttempts:2 as const}:{})}};
}

export function retryingMonsterProvider(
  identity:MonsterIntakeAiProvider,
  createAttempt:(signal:AbortSignal)=>MonsterIntakeAiProvider,
  retry:EncounterStageRetryOptions,
):MonsterIntakeAiProvider{
  const call=<T>(stage:Extract<EncounterRetryStage,'discover'|'extract'|'review'|'repair'>,invoke:(provider:MonsterIntakeAiProvider)=>Promise<T>)=>
    retryEncounterStage(stage,retry,signal=>invoke(createAttempt(signal)));
  return {
    providerName:identity.providerName,extractionModel:identity.extractionModel,reviewModel:identity.reviewModel,
    discover:request=>call('discover',provider=>provider.discover(request)),
    extract:request=>call('extract',provider=>provider.extract(request)),
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
  const progress=(message:string)=>{signal?.throwIfAborted();input.onProgress?.(message);};
  const publish=()=>input.onReport?.(structuredClone(report));
  const pending=(findings:string[]):EncounterIntakeResult=>{report.status='needs_review';report.findings=findings;publish();return {report};};
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
      }catch(error){report.findings=[`中文草稿未完成：${safeFailure(error)}；原语言包仍可供 GM 核对。`];publish();}
    }
    return {report,prepared};
  };
  try{
    conditionCatalog=decodeConfiguredConditionCatalog(input.conditionCatalog??[]);
    report.conditionCatalogHash=hashSource(JSON.stringify(conditionCatalog));
    if(!source.trim()||source.length>24000)throw new Error('原始战斗资料须为1至24000个字符。');
    if(!input.label.trim()||input.label.length>160)throw new Error('请填写不超过160字符的资料名称。');
    if(input.drafts?.length){if(!/^[a-f0-9]{64}$/.test(input.draftParentHash??''))throw new Error('缺少草稿来源报告指纹。');report.recovery={parentReportHash:input.draftParentHash!,mode:'fresh-validation-and-review'};}
    progress('正在识别资料中的全部生物。');
    const explicit=explicitCreatureSections(source);
    const single=singleCreatureSourceCandidate(source);
    const local=explicit.length>=2?explicit:single?[single]:undefined;
    report.discovery={mode:explicit.length>=2?'ordinary-headings':single?'single-statblock':'ai-discovery',providerCalls:local?0:1};
    const discovery=local?{candidates:local}:await provider.discover({source,sourceSha256:report.sourceHash,chunkStart:0,chunkEnd:source.length});
    signal?.throwIfAborted();
    const raw=normalizeDiscovery(source,discovery.candidates);
    if(raw.length<1||raw.length>6)return pending(['战斗包入口需要识别1至6种生物；不会自动选取第一种或忽略其余生物。']);
    const candidates=partitionDiscoveryCandidates(source,raw);
    if(input.drafts&&(input.drafts.length>candidates.length||new Set(input.drafts.map(d=>d.key)).size!==input.drafts.length
      ||input.drafts.some(d=>!candidates.some((_,index)=>d.key===`actor-${index+1}`))))throw new Error('草稿生物清单与当前资料不符。');
    if(input.sourceFeedback?.length){
      if(input.sourceFeedback.length>32||input.sourceFeedback.some(f=>!input.drafts?.some(d=>d.key===f.actorKey)
        ||!/^\/(?:creature|claims|coverage|uncertainties)(?:\/|$)/.test(f.path)||f.path.length>240||!f.message.trim()||f.message.length>2000))throw new Error('来源审阅反馈必须对应当前草稿和明确IR字段。');
      report.sourceFeedback=structuredClone(input.sourceFeedback);
    }
    for(const [index,candidate] of candidates.entries()){
      const key=`actor-${index+1}`;
      const actorSource=source.slice(candidate.start,candidate.end);
      const fixed:MonsterIntakeAiProvider={providerName:provider.providerName,extractionModel:provider.extractionModel,reviewModel:provider.reviewModel,
        discover:async()=>({schemaVersion:1,candidates:[{id:key,label:candidate.label,start:0,end:actorSource.length,quote:actorSource}]}),
        extract:r=>provider.extract(r),review:r=>provider.review(r),repair:r=>provider.repair(r)};
      let pendingManualRules: Array<EncounterAutomationRule & {mechanicId:string;capabilityKind:'gm-manual'}>=[];
      const actorInput={source:actorSource,sourceName:candidate.label,displayName:candidate.label,
        requestId:`encounter-ai-${report.sourceHash.slice(0,12)}-${key}`,fvttVersion:'14.364',systemVersion:'5.3.3',
        renderMarkdown:(ir:MonsterIntakeIR)=>renderEncounterActorSource(ir,pendingManualRules,actorSource),
        onStage:(stage:{stage:string;status:string})=>input.onProgress?.(`生物${index+1}/${candidates.length}：${candidate.label} · ${actorStageLabel(stage.stage)} ${actorStageStatus(stage.status)}`)};
      const draft=input.drafts?.find(d=>d.key===key);
      if(draft&&draft.source!==actorSource)throw new Error('草稿分段与当前原始资料不一致。');
      let analysis=draft?analyzeBrowserActorIntakeDraft(actorInput,draft.ir,fixed):await analyzeBrowserActorSourceWithAi(actorInput,fixed,signal);
      const feedback=input.sourceFeedback?.filter(f=>f.actorKey===key).map((f,i)=>({id:`source-feedback-${i+1}`,code:'SOURCE_REVIEW_FEEDBACK',path:f.path,message:f.message,blocking:true,origin:'semantic' as const}))??[];
      if(feedback.length){
        analysis={...analysis,status:'needs_review',findings:[...analysis.findings,...feedback],validation:{...analysis.validation!,findings:[...analysis.validation!.findings,...feedback],blocking:[...analysis.validation!.blocking,...feedback]}};
        progress(`生物${index+1}/${candidates.length}：将来源审阅反馈交给AI修正，之后仍须重新生成和审阅。`);
      }
      analysis.calls.discovery=0; // The actor partition is already known; its local boundary step makes no provider call.
      signal?.throwIfAborted();
      const actor:EncounterIntakeActor={key,start:candidate.start,end:candidate.end,source:actorSource,origin:draft?'prior-proposal':'fresh-extraction',analysis};report.actors.push(actor);publish();
      if(analysis.status==='needs_review'&&analysis.ir&&analysis.candidate){
        analysis=await repairBrowserActorIntake(actorInput,analysis,fixed,signal);
        actor.analysis=analysis;publish();
      }
      if(analysis.status!=='ready_to_generate')return pending(analysis.findings.filter(f=>f.blocking).map(f=>`${candidate.label}：${f.code} ${f.message}`));
      pendingManualRules=manualPreparationRules(analysis.ir!,actorSource,key);
      let generation=await (deferred?generateBrowserActorIntakeCandidate:generateAndReviewBrowserActorIntake)(actorInput,analysis,fixed,signal);
      actor.generation=generation;publish();
      if(!deferred&&generation.status==='needs_review'&&generation.review?.verdict==='revise'&&analysis.repairCount===0){
        analysis=await repairBrowserActorIntake(actorInput,generation,fixed,signal);actor.analysis=analysis;publish();
        if(analysis.status==='ready_to_generate'){
          pendingManualRules=manualPreparationRules(analysis.ir!,actorSource,key);
          generation=await generateAndReviewBrowserActorIntake(actorInput,analysis,fixed,signal);
        }
      }
      actor.generation=generation;signal?.throwIfAborted();publish();
      if(generation.status!==(deferred?'ready_for_gm_review':'accepted')&&!isCompanionOnlyStagedGeneration(generation,deferred))
        return pending(generation.findings.filter(f=>f.blocking).map(f=>`${candidate.label}：${f.code} ${f.message}`).concat([`${candidate.label}尚未通过正式生成与来源校验。`]));
      if(!hasManualPreparationEvidence(generation.findings,analysis.ir!,pendingManualRules,actorSource))
        return pending([`${candidate.label} 的手工条件准备未证明特殊后果只由 GM 处理。`]);
    }
    const native=report.actors.length===1?report.actors[0]:undefined;
    const needsCompanion=(native?.generation?.actorProjection as any)?.items?.some((item:any)=>
      (item.flags?.fvttJsonGenerator?.behaviorMechanics??[]).some((mechanic:any)=>['gm-assisted','external-rule'].includes(mechanic.executionMode)));
    if(deferred&&native&&native.generation?.formalStatus==='accepted'&&native.generation.intakeVerificationStatus==='accepted'
      &&!native.generation.findings.some(f=>f.blocking)&&!needsCompanion
      &&manualPreparationRules(native.analysis.ir!,native.source,native.key).length===0
      &&encounterStagedConditionRequirements(native.analysis.ir!,native.source).length===0){
      report.generationRoute='single-actor-native';
      progress('唯一生物已通过原生生成与来源校验，省略配套控制配置请求；仍需GM确认。');
      const actorSource=renderEncounterActorSource(native.analysis.ir!,[],native.source);
      const bundle:ForgeEncounterPackage={schema:'fvtt-json-forge-encounter',version:1,id:`intake-${report.sourceHash.slice(0,20)}`,
        label:input.label,target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:native.key,
        actors:[{key:native.key,label:native.analysis.candidate!.label,source:actorSource,sourceHash:hashSource(actorSource)}],macros:[],assets:[]};
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
      if(attempt===1)return pending(review.findings.length?review.findings:['配套自动化未通过模型简要复核。']);
      progress('自动化审阅发现问题，进行本次唯一一次修正。');
      automation=decodeEncounterAutomation(await automationProvider.generate({...request,prior:automation,findings:review.findings}),request);signal?.throwIfAborted();
    }
    return pending(['没有产生已审核的战斗包。']);
  }catch(error){
    if(error instanceof EncounterAutomationSelectionNeedsReviewError)return pending(error.findings);
    report.status='failed';report.findings=[signal?.aborted?'任务已取消，没有创建世界文档。':safeFailure(error)];publish();return {report};
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
  const nativeOnly=input.report.generationRoute==='single-actor-native'&&prepared.actors.length===1&&prepared.bundle.macros.length===0;
  if(prepared.bundle.localization||input.report.status!=='ready_for_gm_review'
    ||input.report.source!==source||input.report.sourceHash!==hashSource(source)
    ||input.report.packageHash!==prepared.hash||input.report.actors.length!==prepared.actors.length
    ||input.report.model!==provider.extractionModel||input.report.reviewModel!==provider.reviewModel
    ||input.report.conditionCatalogHash!==hashSource(JSON.stringify(conditionCatalog))
    ||(!nativeOnly&&!input.report.automation)||(nativeOnly&&!!input.report.automation))throw new TypeError('战斗包来源、模型或正式候选已变化，不能审核旧候选。');
  const report=structuredClone(input.report);
  const publish=()=>input.onReport?.(structuredClone(report));
  // Check every actor and the final fixed configuration before any paid audit.
  const actorInputs=report.actors.map(actor=>{
    if(actor.source!==source.slice(actor.start,actor.end)||!prepared.bundle.actors.some(entry=>entry.key===actor.key)
      ||!actor.generation||!actor.analysis.ir
      ||JSON.stringify(actor.analysis.ir)!==JSON.stringify(actor.generation.analysis.ir))
      throw new TypeError('战斗包生物分段或生成身份与当前候选不一致。');
    const actorInput={source:actor.source,sourceName:actor.analysis.candidate?.label??actor.key,
      displayName:actor.analysis.candidate?.label??actor.key,
      requestId:`encounter-ai-${report.sourceHash.slice(0,12)}-${actor.key}`,
      fvttVersion:'14.364',systemVersion:'5.3.3'};
    assertCurrentBrowserActorIntakeCandidate(actorInput,actor.generation);
    if(actor.generation.status!=='ready_for_gm_review'&&!isCompanionOnlyStagedGeneration(actor.generation,true))
      throw new TypeError(`${actor.key} 的本地来源或正式产物仍有阻断问题。`);
    return {actor,actorInput};
  });
  const request:EncounterAutomationRequest={source,conditionCatalog,actors:report.actors.map(actor=>({
    key:actor.key,ir:actor.analysis.ir!,source:actor.source,
    artifact:prepared.actors.find(entry=>entry.key===actor.key)!.artifact,
  }))};
  const automation=nativeOnly?undefined:decodeEncounterAutomation(report.automation,request);
  const rules=automation?.rules.map((rule,index)=>({...rule,mechanicId:`encounter-rule-${index+1}`,
    capabilityKind:automation.selection?.rules[index]?.kind}))??[];
  if((!nativeOnly&&(prepared.bundle.macros.length!==1||prepared.bundle.macros[0]!.command!==buildEncounterMacroCommand(automation!)))
    ||report.actors.some(actor=>prepared.bundle.actors.find(entry=>entry.key===actor.key)?.source
      !==renderEncounterActorSource(actor.analysis.ir!,rules.filter(rule=>rule.actorKey===actor.key),actor.source)))
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
    if(actor.generation!.status!=='ready_for_gm_review'&&!isCompanionOnlyStagedGeneration(actor.generation!,true)){
      report.status='needs_review';report.findings=[...report.findings,`${actor.key} 的本地来源或正式产物仍有阻断问题。`];
      publish();return {report};
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
