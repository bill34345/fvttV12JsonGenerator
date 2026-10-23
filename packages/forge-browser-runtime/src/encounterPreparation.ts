import { hashArtifact,readForgeSourceId,createForgeSourceId, type JsonObject } from '@fvtt-json-generator/forge-gateway-protocol';
import type { IconReviewReport } from '@fvtt-json-generator/contracts/icon-review';
import { buildForgeActorRequest, convertFinalActorSource } from './index';
import { decodeForgeEncounterPackageText, encounterPackageHash, type ForgeEncounterPackage } from './encounterPackage';
import { readEncounterRuleMarker } from '@fvtt-json-generator/contracts/encounter-rules';
import { assertEncounterLocalizationIdentity, localizedEncounterPresentation } from './encounterLocalizationProjection';
import type { ForgeEncounterPackageMacro } from './encounterPackage';
import type { RulePresentationPlan } from '@fvtt-json-generator/generation/rule-presentation';
import { actorRulePresentation } from './actorRulePresentationContext';
import {actorSourceReviews} from './actorSourceReviewContext';

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
  /** Regenerated locally; never decoded from a package or a Forge response field. */
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
  reviewFindings?: readonly string[];
  label: string;
  macros: readonly ForgeEncounterPackageMacro[];
  bundle: Readonly<ForgeEncounterPackage>;
  hash: string;
  actors: readonly PreparedEncounterActor[];
  requirements: readonly EncounterRequirement[];
}
const preparedProofs = new WeakSet<object>();
const ASSISTED_CODES = new Set(['GEN_GM_ASSISTANCE_REQUIRED', 'GEN_EXTERNAL_RULE_REVIEW_REQUIRED', 'GEN_LITERAL_REVIEW_REQUIRED']);

/** Re-run the formal pipeline. A file's historical acceptance never grants create authority. */
export async function prepareForgeEncounter(text: string, signal?: AbortSignal): Promise<PreparedForgeEncounter> {
  const bundle = decodeForgeEncounterPackageText(text);
  assertEncounterLocalizationIdentity(bundle);
  const actors: PreparedEncounterActor[] = [];
  const assetFields = new Set<string>();
  for (const asset of bundle.assets) for (const target of asset.targets) for (const field of target.fields) {
    const key = `${target.actorKey}:${field}`;
    if (assetFields.has(key)) throw new Error(`同一角色图片字段不能绑定两个素材：${key}`);
    assetFields.add(key);
  }
  for (const input of bundle.actors) {
    signal?.throwIfAborted();
    const digest=hashArtifact({packageId:bundle.id,key:input.key,sourceHash:input.sourceHash});
    const stableId=createForgeSourceId(()=>`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`);
    const request = buildForgeActorRequest({ content: input.source, displayName: input.label,
      requestId: `encounter-${bundle.id}-${input.key}`, fvttVersion: bundle.target.foundry, systemVersion: bundle.target.systemVersion,
      ...(readForgeSourceId(input.source).status==='missing'?{sourceId:stableId}:{}) });
    const response = await convertFinalActorSource(request, { captureRulePresentation: true,
      reviewedLocalization: bundle.localization?.actors.find(actor => actor.key === input.key)?.translation });
    signal?.throwIfAborted();
    if (!('result' in response)) throw new Error(`${input.label}：正式生成请求失败。`);
    const result = response.result;
    if (!result.artifact) throw new Error(`${input.label}：尚无可解析的 Actor 候选：${result.diagnostics.map(d => d.message).join('；')}`);
    const reviewFindings=[...new Set([...actorSourceReviews(response),...result.diagnostics.map(d=>`${d.code}：${d.message}`),...result.actorVerification.warnings])];
    const artifact = result.artifact;
    assertEncounterStagedMarkerIntegrity(artifact);
    if(result.verification.mechanicsCoverage.some(m=>m.status==='literal-only'
      &&(!m.kind.startsWith('behavior-')||m.expressionCoverage!=='literal'||!['gm-assisted','external-rule'].includes(m.executionMode??'')))){
      reviewFindings.push('文字保留机制尚未完成自动化核对，请按完整来源由 GM 处理。');
    }
    if (result.actorVerification.warnings.length || result.diagnostics.some(d => d.severity === 'error' || !ASSISTED_CODES.has(d.code))) {
      reviewFindings.push('来源或生成检查仍有疑点；候选保留，检查不视为通过。');
    }
    const mechanics = (result.artifact.items as any[] ?? []).flatMap(item => item.flags?.fvttJsonGenerator?.behaviorMechanics ?? []);
    const required = mechanics.filter(m => ['gm-assisted', 'external-rule'].includes(m.executionMode));
    for (const mechanic of required) {
      const covering = bundle.macros.filter(m => m.covers.some(c => c.actorKey === input.key && c.mechanicId === mechanic.id));
      if (covering.length !== 1) reviewFindings.push(`机制 ${mechanic.id} 没有唯一配套控制，须由 GM 按原文处理。`);
      else if (!Object.values(covering[0]!.bindings).includes(input.key)) throw new Error(`${covering[0]!.name}：未绑定其声明负责的角色 ${input.key}。`);
    }
    for (const macro of bundle.macros) for (const cover of macro.covers.filter(c => c.actorKey === input.key)) {
      if (!required.some(m => m.id === cover.mechanicId)) throw new Error(`${macro.name}：关联了来源中不存在的待处理机制 ${cover.mechanicId}。`);
    }
    if (result.status !== 'accepted' && !reviewFindings.length) reviewFindings.push(`严格检查状态：${result.status}；此产物仅为待核对候选。`);
    actors.push({ key: input.key, name: String(result.artifact.name), artifact: result.artifact,
      artifactHash: hashArtifact(result.artifact), sourceHash: request.source.utf8Sha256, status: result.status,
      ...(result.iconReview ? { iconReview: result.iconReview } : {}),
      ...(actorRulePresentation(response) ? { rulePresentation: actorRulePresentation(response) } : {}),
      reviewFindings,
      requirements: required.map(m => ({actorKey:input.key,actorName:String(artifact.name),mechanicId:m.id,
        name:m.name??m.id,mode:m.executionMode,gmSteps:[...(m.gmSteps??[])],conditions:[...(m.conditions??[])],
        trigger:m.trigger?{event:m.trigger.event,frequency:m.trigger.frequency,condition:m.trigger.condition??''}:null,
        externalRule:m.externalRule?{name:m.externalRule.name,dc:m.externalRule.dc??null,ability:m.externalRule.ability??'',result:m.externalRule.result}:null,
        detailJson:JSON.stringify(m,null,2),
      })) });
  }
  const presentation = localizedEncounterPresentation(bundle, actors);
  const result: PreparedForgeEncounter = freeze({ bundle, hash: encounterPackageHash(bundle), actors, ...presentation,
    requirements: actors.flatMap(a => a.requirements),reviewFindings:actors.flatMap(a=>(a.reviewFindings??[]).map(f=>`${a.name}：${f}`)) });
  preparedProofs.add(result);
  return result;
}

export function assertPreparedForgeEncounter(value: PreparedForgeEncounter): void {
  if (!preparedProofs.has(value) || encounterPackageHash(value.bundle) !== value.hash) throw new Error('战斗包必须在当前页面重新生成并审核。');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function assertEncounterStagedMarkerIntegrity(artifact: JsonObject): void {
  for (const item of Array.isArray((artifact as any).items) ? (artifact as any).items : []) {
    const mechanics = Array.isArray(item?.flags?.fvttJsonGenerator?.behaviorMechanics)
      ? item.flags.fvttJsonGenerator.behaviorMechanics
      : [];
    for (const mechanic of mechanics) {
      if (typeof mechanic?.id !== 'string' || !/^encounter-(staged|manual)-/u.test(mechanic.id)) continue;
      if (!readEncounterRuleMarker(item, mechanic)) {
        throw new Error(`${String(item?.name ?? '未知载体')}：staged/manual 条件机制缺少一致的载体、分区或来源路径绑定。`);
      }
    }
  }
}
