import { projectNativeDocument, type NativeDocumentProjection } from '@fvtt-json-generator/workflows/native-projection';
import { hashArtifact,readForgeSourceId,createForgeSourceId, type JsonObject } from '@fvtt-json-generator/forge-gateway-protocol';
import type { IconReviewReport } from '@fvtt-json-generator/contracts/icon-review';
import { buildForgeActorRequest, convertFinalActorSource } from './index';
import { decodeForgeEncounterPackageText, serializeForgeEncounterPackage, encounterPackageHash, encounterPackageFindings, type ForgeEncounterPackage } from './encounterPackage';
import { readEncounterRuleMarker } from '@fvtt-json-generator/contracts/encounter-rules';
import { localizedEncounterPresentation } from './encounterLocalizationProjection';
import type { ForgeEncounterPackageMacro } from './encounterPackage';
import {restoreRulePresentationPlan,rebindRulePresentationAfterProjection,type RulePresentationPlan} from '@fvtt-json-generator/generation/rule-presentation';
import {projectReviewedActorLocalization} from '@fvtt-json-generator/generation/reviewed-localization';
import {normalizeForgeActorArtifact,prepareForgeActorForNativeProjection} from './artifact';
import { actorRulePresentation } from './actorRulePresentationContext';
import {actorSourceReviews} from './actorSourceReviewContext';
import { FORGE_NATIVE_606_TARGET, isNativeForgeRuntimeTargetSupported } from './nativeTarget';

export interface PreparedEncounterActor {
  key: string;
  name: string;
  artifact: JsonObject;
  artifactHash: string;
  sourceHash: string;
  status: 'accepted' | 'needs_review' | 'failed';
  reviewFindings?: readonly string[];
  requirements: EncounterRequirement[];
  iconReview?: IconReviewReport;
  /** Source-bound display facts; restoring these never regenerates Actor mechanics. */
  rulePresentation?: RulePresentationPlan;
}
export interface EncounterRequirement {
  actorKey:string;actorName:string;mechanicId:string;name:string;mode:string;
  gmSteps:string[];conditions:string[];
  trigger:{event:string;frequency:string;condition:string}|null;
  externalRule:{name:string;dc:number|null;ability:string;result:string}|null;
  detailJson:string;
}
export interface PreparedForgeEncounter {
  /** The source bundle remains immutable provenance; this binds the actual receiver. */
  runtimeTarget?: ForgeEncounterPackage['target'];
  reviewFindings?: readonly string[];
  label: string;
  macros: readonly ForgeEncounterPackageMacro[];
  bundle: Readonly<ForgeEncounterPackage>;
  hash: string;
  actors: readonly PreparedEncounterActor[];
  requirements: readonly EncounterRequirement[];
}
const preparedProofs = new WeakSet<object>();
const nativePorts = new WeakMap<object, NativeDocumentProjection>();
const ASSISTED_CODES = new Set(['GEN_GM_ASSISTANCE_REQUIRED', 'GEN_EXTERNAL_RULE_REVIEW_REQUIRED', 'GEN_LITERAL_REVIEW_REQUIRED']);

/** Native saved Actors are reused; older artifacts remain available while source conversion is attempted. */
export async function prepareForgeEncounter(text: string, signal?: AbortSignal, options: { nativeProjection?: NativeDocumentProjection } = {}): Promise<PreparedForgeEncounter> {
  const bundle = decodeForgeEncounterPackageText(text);
  const nativeProjection = options.nativeProjection;
  const projectionTarget:ForgeEncounterPackage['target'] = {
    foundry:FORGE_NATIVE_606_TARGET.stats.coreVersion, system:'dnd5e',
    systemVersion:FORGE_NATIVE_606_TARGET.dnd5eVersion, effectProfile:'core',
  };
  const runtimeTarget:ForgeEncounterPackage['target']|undefined = nativeProjection?.runtime
    ? { foundry:nativeProjection.runtime.coreVersion, system:nativeProjection.runtime.systemId,
      systemVersion:nativeProjection.runtime.systemVersion, effectProfile:'core' } : projectionTarget;
  const findings:string[]=[...encounterPackageFindings(bundle)];
  const actors: PreparedEncounterActor[] = [];
  for (const input of bundle.actors) {
    signal?.throwIfAborted();
    let retainedArtifact=input.artifact;
    try {
      let artifact=input.artifact;
      let status: PreparedEncounterActor['status'] = 'needs_review';
      let sourceHash = input.sourceHash;
      let iconReview: IconReviewReport | undefined;
      let rulePresentation:RulePresentationPlan|undefined;
      const reviewFindings:string[]=[...(input.reviewFindings??[])];
      if(artifact&&input.artifactHash&&input.artifactHash!==hashArtifact(artifact))reviewFindings.push('保存的 Actor 指纹与内容不同；Actor 已保留，请核对。');
      if (artifact && !isNativeArtifact(artifact)) {
        const retiredSource=bundle.target.systemVersion==='5.3.3'||(artifact._stats as Record<string,unknown>|undefined)?.systemVersion==='5.3.3';
        if (retiredSource && input.source.trim()) {
          artifact=undefined;
          reviewFindings.push('旧版 Actor 已保留；本次采用现有来源经正式 workflow 重新生成 Core 14／dnd5e 6 产物。');
        } else reviewFindings.push('保存的 Actor 仅供查看和下载；缺少可采用的 Core 14／dnd5e 6 目标证明，须先核对来源并转换才能采用。');
      }
      if(artifact&&input.rulePresentation){
        try{rulePresentation=restoreRulePresentationPlan(input.rulePresentation,artifact,input.source,(actor:unknown)=>normalizeForgeActorArtifact(actor,'14'));}
        catch(error){reviewFindings.push(`本地化规则事实未恢复：${error instanceof Error?error.message:String(error)}；Actor 保留。`);}
      }
      let nativeAttempted=false;
      if (!artifact) {
        const digest = hashArtifact({packageId:bundle.id,key:input.key,sourceHash:input.sourceHash});
        const stableId = createForgeSourceId(()=>`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`);
        const generationTarget=projectionTarget;
        nativeAttempted=Boolean(nativeProjection&&generationTarget.systemVersion==='6.0.6');
        const request = buildForgeActorRequest({content:input.source,displayName:input.label,
          requestId:`encounter-${bundle.id}-${input.key}`,fvttVersion:generationTarget.foundry,systemVersion:generationTarget.systemVersion,
          ...(readForgeSourceId(input.source).status==='missing'?{sourceId:stableId}:{})});
        const response = await convertFinalActorSource(request,{captureRulePresentation:true,nativeProjection:nativeAttempted?nativeProjection:undefined});
        signal?.throwIfAborted();
        if (!('result' in response) || !response.result.artifact) {
          throw new Error('本地转换未返回 Actor；保存的旧产物仍可查看和下载');
        }
        const result = response.result;
        artifact=result.artifact;retainedArtifact=artifact;
        sourceHash = request.source.utf8Sha256;
        status = result.status;
        iconReview = result.iconReview;
        rulePresentation = actorRulePresentation(response);
        reviewFindings.push(...actorSourceReviews(response),...result.diagnostics.map(d=>`${d.code}：${d.message}`),...result.actorVerification.warnings);
        if(result.verification.mechanicsCoverage.some(m=>m.status==='literal-only'
          &&(!m.kind.startsWith('behavior-')||m.expressionCoverage!=='literal'||!['gm-assisted','external-rule'].includes(m.executionMode??''))))
          reviewFindings.push('文字保留机制尚未完成自动化核对，请按完整来源由 GM 处理。');
        if(result.actorVerification.warnings.length||result.diagnostics.some(d=>d.severity==='error'||!ASSISTED_CODES.has(d.code)))
          reviewFindings.push('来源或生成检查仍有疑点；Actor 已保留。');
      }
      const translation=bundle.localization?.actors.find(actor=>actor.key===input.key)?.translation;
      let localized=false,localizationError:unknown;
      if(artifact&&translation)try{artifact=projectReviewedActorLocalization(artifact,input.source,translation,rulePresentation).actor;retainedArtifact=artifact;localized=true;}
      catch(error){localizationError=error;}
      if (artifact && isNativeArtifact(artifact) && nativeProjection && !nativeAttempted) {
        status='needs_review';
        const beforeProjection=artifact;
        artifact = normalizeForgeActorArtifact(await projectNativeDocument(nativeProjection,'Actor',prepareForgeActorForNativeProjection(artifact)),'14');
        retainedArtifact = artifact;
        if(rulePresentation&&!localized)try{rulePresentation=rebindRulePresentationAfterProjection(rulePresentation,beforeProjection,artifact,input.source);}
        catch(error){rulePresentation=undefined;reviewFindings.push(`原生投影后的规则展示未恢复：${error instanceof Error?error.message:String(error)}；Actor保留。`);}
      }
      if(artifact&&translation&&!localized&&nativeProjection)try{artifact=projectReviewedActorLocalization(artifact,input.source,translation,rulePresentation).actor;retainedArtifact=artifact;localized=true;}
      catch(error){localizationError=error;}
      if(localizationError&&!localized)reviewFindings.push(`中文显示未应用：${localizationError instanceof Error?localizationError.message:String(localizationError)}；现有 Actor 保留。`);
      const retained=artifact!;
      reviewFindings.push(...encounterStagedMarkerFindings(retained));
      const mechanics = (Array.isArray(retained.items)?retained.items:[]).flatMap((item:any)=>item.flags?.fvttJsonGenerator?.behaviorMechanics??[]);
      const required = mechanics.filter((m:any)=>['gm-assisted','external-rule'].includes(m.executionMode));
      for(const mechanic of required){
        const covering = bundle.macros.filter(m=>m.covers.some(c=>c.actorKey===input.key&&c.mechanicId===mechanic.id));
        if(covering.length!==1)reviewFindings.push(`机制 ${mechanic.id} 没有唯一配套控制，须由 GM 按原文处理。`);
        else if(!Object.values(covering[0]!.bindings).includes(input.key))reviewFindings.push(`${covering[0]!.name} 未绑定其声明负责的角色 ${input.key}；角色保留。`);
      }
      actors.push({key:input.key,name:String(retained.name??input.label),artifact:retained,artifactHash:hashArtifact(retained),sourceHash,status,
        ...(iconReview?{iconReview}:{}),...(rulePresentation?{rulePresentation}:{}),reviewFindings:[...new Set(reviewFindings)],
        requirements:required.map((m:any)=>({actorKey:input.key,actorName:String(retained.name??input.label),mechanicId:m.id,
          name:m.name??m.id,mode:m.executionMode,gmSteps:[...(m.gmSteps??[])],conditions:[...(m.conditions??[])],
          trigger:m.trigger?{event:m.trigger.event,frequency:m.trigger.frequency,condition:m.trigger.condition??''}:null,
          externalRule:m.externalRule?{name:m.externalRule.name,dc:m.externalRule.dc??null,ability:m.externalRule.ability??'',result:m.externalRule.result}:null,
          detailJson:JSON.stringify(m,null,2)}))});
    } catch(error) {
      signal?.throwIfAborted();
      const finding=`${input.label}：${error instanceof Error?error.message:String(error)}；已生成角色保留。`;
      findings.push(finding);
      if(retainedArtifact)actors.push({key:input.key,name:String(retainedArtifact.name??input.label),artifact:retainedArtifact,
        artifactHash:hashArtifact(retainedArtifact),sourceHash:input.sourceHash,status:'needs_review',reviewFindings:[finding],requirements:[]});
    }
  }
  const available = new Set(actors.filter(actor=>isNativeArtifact(actor.artifact)).map(actor=>actor.key));
  const macros = bundle.macros.filter(macro=>{
    const missing = Object.values(macro.bindings).filter(key=>!available.has(key));
    const invalid = macro.covers.filter(cover=>!actors.find(actor=>actor.key===cover.actorKey)?.requirements.some(required=>required.mechanicId===cover.mechanicId));
    if(!missing.length&&!invalid.length)return true;
    findings.push(`${macro.name}：配套角色或机制未就绪；宏未准备，Actor 保留。`);
    return false;
  });
  let presentation:{label:string;macros:readonly ForgeEncounterPackageMacro[]} = {label:bundle.label,macros};
  try {
    const {reviewFindings:localizationFindings,...localized} = localizedEncounterPresentation(bundle,actors);
    findings.push(...localizationFindings);
    presentation = {...localized,macros:localized.macros.filter(macro=>macros.some(ready=>ready.key===macro.key))};
  } catch(error) {
    presentation={label:bundle.label,macros:[]};
    findings.push(`包级中文展示未完成：${error instanceof Error?error.message:String(error)}；已生成 Actor 保留，配套宏未准备，原宏记录保留。`);
  }
  const hash=encounterPackageHash(bundle);
  const result:PreparedForgeEncounter = freeze({bundle,hash,actors,...presentation,...(runtimeTarget?{runtimeTarget}:{}),
    requirements:actors.flatMap(actor=>actor.requirements),reviewFindings:[...findings,...actors.flatMap(actor=>(actor.reviewFindings??[]).map(f=>`${actor.name}：${f}`))]});
  preparedProofs.add(result);
  if(nativeProjection)nativePorts.set(result,nativeProjection);
  return result;
}

export function assertPreparedForgeEncounter(value: PreparedForgeEncounter): void {
  if (!preparedProofs.has(value) || encounterPackageHash(value.bundle) !== value.hash) throw new Error('生物导入文件必须在当前页面重新生成并审核。');
}

export function reprepareForgeEncounter(prepared:PreparedForgeEncounter,bundle:ForgeEncounterPackage,signal?:AbortSignal):Promise<PreparedForgeEncounter>{
  assertPreparedForgeEncounter(prepared);
  return prepareForgeEncounter(serializeForgeEncounterPackage(bundle),signal,{nativeProjection:nativePorts.get(prepared)});
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function isNativeArtifact(artifact:JsonObject):boolean {
  const stats=artifact._stats as Record<string,unknown>|undefined;
  return isNativeForgeRuntimeTargetSupported(stats?.coreVersion,stats?.systemVersion);
}

function encounterStagedMarkerFindings(artifact: JsonObject): string[] {
  const findings:string[]=[];
  for (const item of Array.isArray((artifact as any).items) ? (artifact as any).items : []) {
    const mechanics = Array.isArray(item?.flags?.fvttJsonGenerator?.behaviorMechanics)
      ? item.flags.fvttJsonGenerator.behaviorMechanics
      : [];
    for (const mechanic of mechanics) {
      if (typeof mechanic?.id !== 'string' || !/^encounter-(staged|manual)-/u.test(mechanic.id)) continue;
      if (!readEncounterRuleMarker(item, mechanic)) {
        findings.push(`${String(item?.name ?? '未知载体')}：staged/manual 条件机制缺少一致的载体、分区或来源路径绑定；基本操作保留。`);
      }
    }
  }
  return findings;
}
