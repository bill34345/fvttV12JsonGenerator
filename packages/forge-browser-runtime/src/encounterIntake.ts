import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { normalizeDiscovery, partitionDiscoveryCandidates } from '@fvtt-json-generator/intake-ai/discovery';
import { OpenAICompatibleMonsterIntakeProvider } from '@fvtt-json-generator/intake-ai/provider';
import { createEncounterAutomationProvider } from '@fvtt-json-generator/intake-ai/encounter-automation';
import type { BrowserAiProviderOptions } from './ai';
import type { MonsterIntakeAiProvider, DiscoveryCandidate, MonsterIntakeIR } from '@fvtt-json-generator/intake-ai/types';
import {
  buildEncounterMacroCommand, renderEncounterActorSource, decodeEncounterAutomation, encounterStagedConditionRequirements,
  type EncounterAutomationIR, type EncounterAutomationRequest,
} from '@fvtt-json-generator/intake-ai/encounter-automation';
import {
  analyzeBrowserActorSourceWithAi, generateAndReviewBrowserActorIntake, repairBrowserActorIntake,
  analyzeBrowserActorIntakeDraft,
  type BrowserActorIntakeAnalysis, type BrowserActorGenerationResult,
} from './ai';
import { serializeForgeEncounterPackage, type ForgeEncounterPackage } from './encounterPackage';
import { prepareForgeEncounter, type PreparedForgeEncounter } from './encounterPreparation';
import { combineEncounterSignals, retryEncounterStage, type EncounterRetryStage, type EncounterStageRetryOptions } from './encounterStageRetry';
export {decodeEncounterRuntimeConfiguration} from '@fvtt-json-generator/intake-ai/encounter-automation';
export {fixedEncounterCommand,readFixedEncounterConfiguration} from '@fvtt-json-generator/intake-ai/encounter-capabilities';

export interface EncounterIntakeActor {
  key:string;start:number;end:number;source:string;
  origin?:'fresh-extraction'|'prior-proposal';
  analysis:BrowserActorIntakeAnalysis;generation?:BrowserActorGenerationResult;
}
export interface EncounterIntakeReport {
  version:1;source:string;sourceHash:string;model:string;reviewModel:string;
  evidenceMode:'standard'|'exact-quotes-v1';
  requestedOptions?:{protocol:BrowserAiProviderOptions['protocol'];reasoning:BrowserAiProviderOptions['reasoning'];maxAttempts?:1|2};
  discovery?:{mode:'ordinary-headings'|'ai-discovery';providerCalls:number};
  recovery?:{parentReportHash:string;mode:'fresh-validation-and-review'};
  sourceFeedback?:Array<{actorKey:string;path:string;message:string}>;
  status:'running'|'ready_for_gm_review'|'needs_review'|'failed';
  actors:EncounterIntakeActor[];automation?:EncounterAutomationIR;
  automationReview?:{verdict:'accepted'|'needs_review';findings:string[]};findings:string[];
  packageHash?:string;
}
export interface EncounterAutomationPort {
  generate(request:EncounterAutomationRequest):Promise<EncounterAutomationIR>;
  review(request:EncounterAutomationRequest & {automation:EncounterAutomationIR;finalSources?:Array<{key:string;source:string;artifact:unknown}>}):Promise<{verdict:'accepted'|'needs_review';findings:string[]}>;
}
export interface EncounterIntakeInput {
  source:string;label:string;provider:MonsterIntakeAiProvider;automationProvider:EncounterAutomationPort;
  evidenceMode?:'standard'|'exact-quotes-v1';
  requestedOptions?:EncounterIntakeReport['requestedOptions'];
  drafts?:Array<{key:string;source:string;ir:MonsterIntakeIR}>;
  draftParentHash?:string;
  sourceFeedback?:Array<{actorKey:string;path:string;message:string}>;
  signal?:AbortSignal;onProgress?:(message:string)=>void;
  onReport?:(report:EncounterIntakeReport)=>void;
}
export interface EncounterIntakeResult {report:EncounterIntakeReport;prepared?:PreparedForgeEncounter}

/** Encounter reports deliberately include formal artifacts; they never contain provider credentials or raw envelopes. */
export function assertEncounterSecretsAbsent(content:string,forbiddenValues:readonly string[]):void{
  if(/(?:^|\n)\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:/iu.test(content)
    ||/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/iu.test(content)
    ||/"(?:apiKey|authorization|cookie|endpoint|baseUrl|rawResponse|providerResponse|savedApiKeys)"\s*:/iu.test(content)){
    throw new TypeError('战斗包安全检查拒绝了凭据或原始服务响应。');
  }
  for(const value of forbiddenValues){if(value.trim()&&content.includes(value.trim()))throw new TypeError('战斗包包含当前配置的敏感连接信息。');}
}

export function createEncounterIntakeProviders(options:BrowserAiProviderOptions & {allowLocalBridge?:boolean},signal?:AbortSignal){
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
  const createActorProvider=(attemptSignal?:AbortSignal)=>new OpenAICompatibleMonsterIntakeProvider({authMode:'api-key',apiKey:options.apiKey,baseUrl:options.baseUrl,
    model:options.model,reviewModel:options.reviewModel??options.model,timeoutMs:providerTimeoutMs,repairTimeoutMs:providerRepairTimeoutMs,
    evidenceAnchoring:'exact-quotes',
    waitPolicy:options.waitPolicy,onActivity:options.onActivity,
    transport,httpClient:(requestUrl,init)=>fetch(requestUrl,{...init,signal:combineEncounterSignals(signal,attemptSignal,init?.signal)})});
  const baseActorProvider=createActorProvider();
  const createAutomationProvider=(attemptSignal?:AbortSignal)=>createEncounterAutomationProvider({...options,timeoutMs:providerTimeoutMs},combineEncounterSignals(signal,attemptSignal));
  const baseAutomationProvider=createAutomationProvider();
  const actorProvider=retry?retryingMonsterProvider(baseActorProvider,createActorProvider,retry):baseActorProvider;
  const automationProvider=retry?retryingAutomationProvider(baseAutomationProvider,createAutomationProvider,retry):baseAutomationProvider;
  return {provider:actorProvider,automationProvider,evidenceMode:'exact-quotes-v1' as const,requestedOptions:{protocol:transport.protocol,reasoning:options.reasoning,...(retry?{maxAttempts:2 as const}:{})}};
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
  const report:EncounterIntakeReport={version:1,source,sourceHash:hashSource(source),model:provider.extractionModel,
    reviewModel:provider.reviewModel,evidenceMode:input.evidenceMode??'standard',requestedOptions:input.requestedOptions,status:'running',actors:[],findings:[]};
  const progress=(message:string)=>{signal?.throwIfAborted();input.onProgress?.(message);};
  const publish=()=>input.onReport?.(structuredClone(report));
  const pending=(findings:string[]):EncounterIntakeResult=>{report.status='needs_review';report.findings=findings;publish();return {report};};
  try{
    if(!source.trim()||source.length>24000)throw new Error('原始战斗资料须为1至24000个字符。');
    if(!input.label.trim()||input.label.length>160)throw new Error('请填写不超过160字符的资料名称。');
    if(input.drafts?.length){if(!/^[a-f0-9]{64}$/.test(input.draftParentHash??''))throw new Error('缺少草稿来源报告指纹。');report.recovery={parentReportHash:input.draftParentHash!,mode:'fresh-validation-and-review'};}
    progress('正在识别资料中的全部生物。');
    const explicit=explicitCreatureSections(source);
    report.discovery={mode:explicit.length>=2?'ordinary-headings':'ai-discovery',providerCalls:explicit.length>=2?0:1};
    const discovery=explicit.length>=2?{candidates:explicit}:await provider.discover({source,sourceSha256:report.sourceHash,chunkStart:0,chunkEnd:source.length});
    signal?.throwIfAborted();
    const raw=normalizeDiscovery(source,discovery.candidates);
    if(raw.length<2||raw.length>6)return pending(['战斗包入口需要识别2至6种生物；不会自动选取第一种或忽略其余生物。']);
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
      const actorInput={source:actorSource,sourceName:candidate.label,displayName:candidate.label,
        requestId:`encounter-ai-${report.sourceHash.slice(0,12)}-${key}`,fvttVersion:'14.364',systemVersion:'5.3.3',
        renderMarkdown:(ir:MonsterIntakeIR)=>renderEncounterActorSource(ir,[],actorSource),
        onStage:(stage:{stage:string;status:string})=>input.onProgress?.(`生物${index+1}/${candidates.length}：${candidate.label} · ${stage.stage} ${stage.status}`)};
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
      let generation=await generateAndReviewBrowserActorIntake(actorInput,analysis,fixed,signal);
      actor.generation=generation;publish();
      if(generation.status==='needs_review'&&generation.review?.verdict==='revise'&&analysis.repairCount===0){
        analysis=await repairBrowserActorIntake(actorInput,generation,fixed,signal);actor.analysis=analysis;publish();
        if(analysis.status==='ready_to_generate')generation=await generateAndReviewBrowserActorIntake(actorInput,analysis,fixed,signal);
      }
      actor.generation=generation;signal?.throwIfAborted();publish();
      if(generation.status!=='accepted'&&!isCompanionOnlyStagedGeneration(generation))return pending(generation.findings.filter(f=>f.blocking).map(f=>`${candidate.label}：${f.code} ${f.message}`).concat([`${candidate.label}尚未通过正式生成与来源审阅。`]));
    }
    const request:EncounterAutomationRequest={source,actors:report.actors.map(a=>({key:a.key,ir:a.analysis.ir!,source:a.source,artifact:a.generation!.actorProjection}))};
    progress('角色来源审核已通过，正在提取固定自动化能力与参数；AI不会编写宏代码。');
    let automation=decodeEncounterAutomation(await automationProvider.generate(request),request);signal?.throwIfAborted();
    for(let attempt=0;attempt<2;attempt++){
      report.automation=automation;publish();
      const rules=automation.rules.map((rule,index)=>({...rule,mechanicId:`encounter-rule-${index+1}`}));
      const stagedCovers=report.actors.flatMap(actor=>encounterStagedConditionRequirements(actor.analysis.ir!,actor.source)
        .map(requirement=>({actorKey:actor.key,mechanicId:requirement.mechanicId})));
      const command=buildEncounterMacroCommand(automation);
      const bundle:ForgeEncounterPackage={schema:'fvtt-json-forge-encounter',version:1,id:`intake-${report.sourceHash.slice(0,20)}`,
        label:input.label,target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:report.actors[0]!.key,
        actors:report.actors.map(a=>{const rendered=renderEncounterActorSource(a.analysis.ir!,rules.filter(r=>r.actorKey===a.key),a.source);return {key:a.key,label:a.generation!.analysis.candidate!.label,source:rendered,sourceHash:hashSource(rendered)};}),
        macros:[{key:'battle-control',name:automation.name,command,commandHash:hashSource(command),
          bindings:Object.fromEntries(report.actors.map(a=>[a.key,a.key])),covers:[...rules.map(r=>({actorKey:r.actorKey,mechanicId:r.mechanicId})),...stagedCovers],
          notes:[automation.notes,...automation.manualSteps,`原始资料SHA-256：${report.sourceHash}`].join('\n')}],assets:[]};
      progress('工具已生成固定控制入口，正在核对整包和自动化配置的来源语义。');
      const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(bundle),signal);
      const review=await automationProvider.review({...request,automation,finalSources:prepared.actors.map(a=>({key:a.key,source:bundle.actors.find(s=>s.key===a.key)!.source,artifact:a.artifact}))});
      signal?.throwIfAborted();report.automationReview=review;publish();
      if(review.verdict==='accepted'&&review.findings.length===0){report.status='ready_for_gm_review';report.packageHash=prepared.hash;publish();return {report,prepared};}
      if(attempt===1)return pending(review.findings.length?review.findings:['配套自动化未通过独立审核。']);
      progress('自动化审阅发现问题，进行本次唯一一次修正。');
      automation=decodeEncounterAutomation(await automationProvider.generate({...request,prior:automation,findings:review.findings}),request);signal?.throwIfAborted();
    }
    return pending(['没有产生已审核的战斗包。']);
  }catch(error){
    report.status='failed';report.findings=[signal?.aborted?'任务已取消，没有创建世界文档。':safeFailure(error)];publish();return {report};
  }
}
function safeFailure(error:unknown):string{
  const message=error instanceof Error?error.message:'生成失败';
  return message.replace(/https?:\/\/\S+/gi,'[endpoint]').replace(/Bearer\s+\S+/gi,'[credential]').slice(0,1600);
}

function isCompanionOnlyStagedGeneration(generation:BrowserActorGenerationResult):boolean{
  const blocking=generation.findings.filter(f=>f.blocking);
  return generation.status==='needs_review'
    && generation.formalStatus!=='failed'
    && generation.review?.verdict==='accepted'
    && Boolean(generation.finalSource)
    && blocking.length>0
    && blocking.every(f=>f.code==='ACTOR_STAGED_CONDITION_REQUIRES_COMPANION');
}

/** Optional ordinary prose headings, not a required authoring schema or creature-name lookup. */
export function explicitCreatureSections(source:string):DiscoveryCandidate[]{
  const headings=[...source.matchAll(/^#{1,3}[ \t]+(?:生物[一二三四五六七八九十\d]*|Creature[ \t]+\d+)[ \t]*[:：][ \t]*(.+)$/gimu)];
  return headings.map((match,index)=>{const start=match.index!;const end=headings[index+1]?.index??source.length;
    return {id:`creature-${index+1}`,label:match[1]!.trim(),start,end,quote:source.slice(start,end)};});
}
