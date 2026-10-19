import {
  FACT_LOCALIZATION_POLICY, LOCALIZATION_POLICY, acceptLocalization, approveLocalizationByGm, assertReviewedLocalization, localizationHash, validateLocalizationDraft,localizationMeaningFindings,normalizeLocalizationBodyProse,
  type ReviewedLocalization, type LocalizationRequest, type LocalizationDraft, type EncounterLocalization, type LocalizationPolicy,
} from '@fvtt-json-generator/contracts/localization';
import { createActorLocalizationRequest, projectActorLocalizationDraft, projectReviewedActorLocalization } from '@fvtt-json-generator/generation/reviewed-localization';
import type { ReviewedTranslationServicePort } from '@fvtt-json-generator/generation/ports';
import { assertPreparedForgeEncounter, prepareForgeEncounter, type PreparedForgeEncounter } from './encounterPreparation';
import { serializeForgeEncounterPackage, type ForgeEncounterPackage } from './encounterPackage';
import { createEncounterTextRequest, localizedEncounterId, previewEncounterTextRows } from './encounterLocalizationProjection';
export { createEncounterTextRequest } from './encounterLocalizationProjection';
export { actorLocalizationDisplayRows } from '@fvtt-json-generator/generation/reviewed-localization';
import type { RulePresentationPlan } from '@fvtt-json-generator/generation/rule-presentation';
export type { EncounterLocalization } from '@fvtt-json-generator/contracts/localization';
export { LOCALIZATION_TERMS, LOCALIZATION_TERM_NOTES } from '@fvtt-json-generator/contracts/localization';

export interface EncounterLocalizationProgress {
  status: 'translating' | 'draft_ready' | 'needs_review' | 'accepted';
  actorKey?: string;
  request: LocalizationRequest;
  draft?: LocalizationDraft;
  translation?: ReviewedLocalization;
  findings?: string[];
}

export interface ForgeLocalizationDraftPart {
  request: LocalizationRequest;
  draft: LocalizationDraft;
  requestHash: string;
  translationHash: string;
}
export interface ForgeEncounterLocalizationDraft {
  version: 1;
  sourcePackageId: string;
  sourcePackageHash: string;
  actors: Array<{ key: string } & ForgeLocalizationDraftPart>;
  packageText: ForgeLocalizationDraftPart;
}

function draftPolicy(prepared: PreparedForgeEncounter): LocalizationPolicy {
  if (!prepared.bundle.target.foundry.startsWith('14.')) return LOCALIZATION_POLICY;
  if (prepared.actors.some(actor => !actor.rulePresentation)) throw new TypeError('当前 v14 候选缺少重新生成的规则事实；不能退回整段模型翻译。');
  return FACT_LOCALIZATION_POLICY;
}
function sourcePrepared(prepared: PreparedForgeEncounter): void {
  assertPreparedForgeEncounter(prepared);
  if (prepared.bundle.localization) throw new TypeError('中文草稿必须绑定未翻译的当前来源包。');
}
function checkedPart(request: LocalizationRequest, value: ForgeLocalizationDraftPart): LocalizationDraft {
  if (value.requestHash !== localizationHash(request) || localizationHash(value.request) !== value.requestHash)
    throw new TypeError('中文草稿的请求或来源身份已改变。');
  const draft = validateLocalizationDraft(request, value.draft);
  if (value.translationHash !== localizationHash({ requestHash: value.requestHash, texts: draft.texts }))
    throw new TypeError('中文草稿的译文身份已改变。');
  return draft;
}
export function assertForgeEncounterLocalizationDraft(prepared: PreparedForgeEncounter, value: ForgeEncounterLocalizationDraft): void {
  sourcePrepared(prepared);
  if (value.version !== 1 || value.sourcePackageId !== prepared.bundle.id || value.sourcePackageHash !== prepared.hash
    || value.actors.length !== prepared.actors.length) throw new TypeError('中文草稿与当前战斗包不一致。');
  const policy = value.packageText.request.policy;
  const previews = prepared.actors.map(actor => {
    const entry = value.actors.find(part => part.key === actor.key);
    const source = prepared.bundle.actors.find(part => part.key === actor.key)!.source;
    if (!entry || value.actors.filter(part => part.key === actor.key).length !== 1) throw new TypeError('中文草稿角色身份无效。');
    if (entry.request.policy !== policy) throw new TypeError('中文草稿不能混用旧策略与事实策略。');
    const request = createActorLocalizationRequest(actor.artifact, source, policy, actor.rulePresentation);
    const draft = checkedPart(request, entry);
    return { key: actor.key, rulePresentation: actor.rulePresentation,
      artifact: projectActorLocalizationDraft(actor.artifact, source, draft, policy, undefined, actor.rulePresentation).actor };
  });
  checkedPart(createEncounterTextRequest(prepared.bundle, previews, policy), value.packageText);
}

/** Local GM prose correction. Source identity, protected values and title bindings remain unchanged. */
export function reviseForgeEncounterLocalizationBody(input: {
  prepared: PreparedForgeEncounter; draft: ForgeEncounterLocalizationDraft;
  actorKey?: string; textId: string; text: string;
}): ForgeEncounterLocalizationDraft {
  assertForgeEncounterLocalizationDraft(input.prepared, input.draft);
  const next = structuredClone(input.draft);
  const part = input.actorKey === undefined ? next.packageText : next.actors.find(actor => actor.key === input.actorKey);
  const field = part?.request.texts.find(entry => entry.id === input.textId);
  if (!part || !field || field.kind !== 'body') throw new TypeError('只能修正当前来源绑定的正文；标题与角色身份保持不变。');
  part.draft = validateLocalizationDraft(part.request, { texts: part.draft.texts.map(entry =>
    entry.id === input.textId ? { id: entry.id, text: input.text } : entry) });
  part.translationHash = localizationHash({ requestHash: part.requestHash, texts: part.draft.texts });
  assertForgeEncounterLocalizationDraft(input.prepared, next);
  return next;
}

/** Translate current display slots and preserve a source-bound, unapproved preview draft. */
export async function draftForgeEncounterLocalization(input: {
  prepared: PreparedForgeEncounter;
  service: ReviewedTranslationServicePort;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  onReview?: (progress: EncounterLocalizationProgress) => void;
  priorDrafts?: readonly EncounterLocalizationProgress[];
}): Promise<ForgeEncounterLocalizationDraft> {
  const { prepared } = input;
  sourcePrepared(prepared);
  const policy = draftPolicy(prepared);
  const translate = async (request: LocalizationRequest, actorKey?: string): Promise<ForgeLocalizationDraftPart> => {
    input.signal?.throwIfAborted();
    const requestHash = localizationHash(request);
    const prior = [...(input.priorDrafts ?? [])].reverse().find(entry => {
      if (entry?.actorKey !== actorKey || !['draft_ready', 'needs_review', 'translating'].includes(entry.status)) return false;
      try { return localizationHash(entry.request) === requestHash; } catch { return false; }
    });
    const reusable = new Map<string, { id: string; text: string }>();
    const resolvedLocalFindings = new Set<string>();
    let locallyRevised = 0;
    for (const entry of prior?.draft?.texts ?? []) {
      const field = request.texts.find(field => field.id === entry.id);
      if (!field) continue;
      try {
        const fieldRequest = { ...request, texts: [field] };
        // Validate the original before cleanup: source/number/markup failures
        // must never be laundered into a reusable field. Only unapproved,
        // same-request prose is normalized, through the shared display rule.
        const original = validateLocalizationDraft(fieldRequest, { texts: [entry] });
        const text = field.kind === 'body' ? normalizeLocalizationBodyProse(field.source, original.texts[0]!.text) : original.texts[0]!.text;
        const checked = validateLocalizationDraft(fieldRequest, { texts: [{ id: entry.id, text }] });
        if (text !== original.texts[0]!.text) {
          const remaining = new Set(localizationMeaningFindings(fieldRequest, checked));
          for (const finding of localizationMeaningFindings(fieldRequest, original))
            if (!remaining.has(finding)) resolvedLocalFindings.add(finding);
          locallyRevised++;
        }
        reusable.set(entry.id, checked.texts[0]!);
      } catch { /* Only the failing field is sent for translation again. */ }
    }
    // Resolve only the exact local findings disproved by the validated edit.
    // Other semantic/model findings keep their existing targeted retry path.
    const findings = [...(prior?.findings ?? [])].filter(finding => !resolvedLocalFindings.has(finding));
    if (prior?.status === 'needs_review' && findings.length) {
      const rejectedIds = new Set(findings.flatMap(finding => finding.match(/text-[0-9a-f]{24}/gu) ?? []));
      if (rejectedIds.size) for (const id of rejectedIds) reusable.delete(id);
      else reusable.clear();
    }
    if (locallyRevised) input.onProgress?.(`已在本地整理保存稿的${locallyRevised}段显示文本；当前草稿仍须重新核对批准。`);
    const missing = request.texts.filter(field => !reusable.has(field.id));
    const nameGlossary = [...(request.nameGlossary ?? []), ...request.texts.filter(field => field.kind === 'title').flatMap(field => {
      const text = reusable.get(field.id)?.text;
      return text ? [{ english: field.source, chinese: text }] : [];
    })];
    const merge = (fresh: LocalizationDraft): LocalizationDraft => {
      const all = new Map([...reusable.values(), ...fresh.texts].map(entry => [entry.id, entry]));
      return { texts: request.texts.flatMap(field => all.has(field.id) ? [all.get(field.id)!] : []) };
    };
    if (missing.length) input.onReview?.({ status: 'translating', actorKey, request, draft: merge({ texts: [] }), findings });
    const fresh = missing.length ? await input.service.translate({ ...request, texts: missing, nameGlossary }, input.signal,
      partial => input.onReview?.({ status: 'translating', actorKey, request, draft: merge(partial), findings }),
      prior?.draft ? { draft: prior.draft, findings } : undefined) : { texts: [] };
    input.signal?.throwIfAborted();
    if (fresh.texts.length !== missing.length || new Set(fresh.texts.map(entry => entry.id)).size !== missing.length
      || fresh.texts.some(entry => !missing.some(field => field.id === entry.id))) {
      throw new TypeError('翻译返回了额外、缺失或重复的文本身份。');
    }
    let draft = merge(fresh);
    const deterministicFindings = request.texts.flatMap(field => {
      const candidate = draft.texts.find(entry => entry.id === field.id);
      try { validateLocalizationDraft({ ...request, texts: [field] }, { texts: candidate ? [candidate] : [] }); return []; }
      catch (error) { return [`${field.id}：${error instanceof Error ? error.message.slice(0, 400) : '译文确定性校验失败。'}`]; }
    });
    if (deterministicFindings.length) {
      input.onReview?.({ status: 'needs_review', actorKey, request, draft, findings: deterministicFindings });
      throw new TypeError(`译文确定性校验失败：${deterministicFindings[0]}`);
    }
    draft = validateLocalizationDraft(request, draft);
    const meaningFindings=localizationMeaningFindings(request,draft);
    input.onReview?.({ status: meaningFindings.length?'needs_review':'draft_ready', actorKey, request, draft,findings:meaningFindings });
    return { request, draft, requestHash, translationHash: localizationHash({ requestHash, texts: draft.texts }) };
  };
  const actors: ForgeEncounterLocalizationDraft['actors'] = [];
  const previews: Array<{ key: string; artifact: unknown; rulePresentation?: RulePresentationPlan }> = [];
  for (const actor of prepared.actors) {
    input.onProgress?.(`正在翻译中文草稿：${actor.name}`);
    const source = prepared.bundle.actors.find(entry => entry.key === actor.key)!.source;
    const part = await translate(createActorLocalizationRequest(actor.artifact, source, policy, actor.rulePresentation), actor.key);
    actors.push({ key: actor.key, ...part });
    previews.push({ key: actor.key, rulePresentation: actor.rulePresentation,
      artifact: projectActorLocalizationDraft(actor.artifact, source, part.draft, policy, undefined, actor.rulePresentation).actor });
  }
  const packageText = await translate(createEncounterTextRequest(prepared.bundle, previews, policy));
  const result: ForgeEncounterLocalizationDraft = { version: 1, sourcePackageId: prepared.bundle.id,
    sourcePackageHash: prepared.hash, actors, packageText };
  assertForgeEncounterLocalizationDraft(prepared, result);
  const meaningFindings=[...result.actors,result.packageText].flatMap(part=>localizationMeaningFindings(part.request,part.draft));
  input.onProgress?.(meaningFindings.length?'中文草稿已保存；有来源含义或正文残留问题，须按提示修正后才能批准。':'中文草稿已通过结构校验，仍须核对含义后批准；AI 尚未审核。');
  return result;
}

async function prepareApproved(prepared: PreparedForgeEncounter, localization: EncounterLocalization,
  signal?: AbortSignal): Promise<PreparedForgeEncounter> {
  signal?.throwIfAborted();
  const bundle = { ...prepared.bundle, id: localizedEncounterId(prepared.bundle.id, localization), localization };
  return prepareForgeEncounter(serializeForgeEncounterPackage(bundle), signal);
}

/** Called only after an actual GM confirmation event; no Provider is involved. */
export async function approveForgeEncounterLocalization(input: {
  prepared: PreparedForgeEncounter; draft: ForgeEncounterLocalizationDraft; gmId: string; signal?: AbortSignal;
}): Promise<PreparedForgeEncounter> {
  input.signal?.throwIfAborted();
  assertForgeEncounterLocalizationDraft(input.prepared, input.draft);
  const actors = input.draft.actors.map(entry => ({ key: entry.key,
    translation: approveLocalizationByGm(entry.request, entry.draft, input.gmId) }));
  const packageText = approveLocalizationByGm(input.draft.packageText.request, input.draft.packageText.draft, input.gmId);
  return prepareApproved(input.prepared, { sourcePackageId: input.prepared.bundle.id, actors, packageText }, input.signal);
}

/** Paid review examines only the current translated draft; no translate or repair call occurs. */
export async function reviewForgeEncounterLocalizationDraft(input: {
  prepared: PreparedForgeEncounter; draft: ForgeEncounterLocalizationDraft;
  service: ReviewedTranslationServicePort; signal?: AbortSignal;
  onReview?: (progress: EncounterLocalizationProgress) => void;
}): Promise<PreparedForgeEncounter> {
  input.signal?.throwIfAborted();
  assertForgeEncounterLocalizationDraft(input.prepared, input.draft);
  const review = async (part: ForgeLocalizationDraftPart, actorKey?: string) => {
    input.signal?.throwIfAborted();
    const result = await input.service.review(part.request, part.draft, input.signal);
    input.signal?.throwIfAborted();
    checkedPart(part.request, part);
    if (result.verdict !== 'accepted' || result.findings.length) {
      input.onReview?.({ status: 'needs_review', actorKey, request: part.request, draft: part.draft, findings: result.findings });
      throw new TypeError(`中文含义仍需核对：${result.findings.join('；') || '模型未接受当前译文'}`);
    }
    const translation = acceptLocalization(part.request, part.draft, result, input.service.reviewModel);
    input.onReview?.({ status: 'accepted', actorKey, request: part.request, draft: part.draft, translation });
    return translation;
  };
  const actors: EncounterLocalization['actors'] = [];
  for (const entry of input.draft.actors) actors.push({ key: entry.key, translation: await review(entry, entry.key) });
  const packageText = await review(input.draft.packageText);
  assertForgeEncounterLocalizationDraft(input.prepared, input.draft);
  return prepareApproved(input.prepared, { sourcePackageId: input.prepared.bundle.id, actors, packageText }, input.signal);
}

/** Verify saved display progress against the current formally prepared source package.
 * Invalid history remains visible as a generic issue, without exposing an unbound title or field.
 */
export function verifiedEncounterLocalizationProgress(
  bundle:ForgeEncounterPackage,
  actors:readonly {key:string;artifact:unknown;rulePresentation?:RulePresentationPlan}[],
  progress:readonly EncounterLocalizationProgress[],
):EncounterLocalizationProgress[] {
  if(bundle.localization)return [];
  const prepared=new Map(actors.map(actor=>[actor.key,actor]));
  const actorRequests=new Map(bundle.actors.flatMap(actor=>{
    const current=prepared.get(actor.key);
    const matching = progress.filter(entry => entry.actorKey === actor.key);
    const policy = matching.length === 1 ? matching[0]!.request.policy : (current?.rulePresentation ? FACT_LOCALIZATION_POLICY : LOCALIZATION_POLICY);
    try { return current ? [[actor.key, createActorLocalizationRequest(current.artifact, actor.source, policy, current.rulePresentation)] as const] : []; }
    catch { return []; }
  }));
  const previews=new Map<string,unknown>();
  const accepted=new Map<string,ReviewedLocalization>();
  for(const actor of bundle.actors){
    const matches=progress.filter(entry=>entry.actorKey===actor.key);
    if(matches.length!==1)continue;
    const entry=matches[0]!,request=actorRequests.get(actor.key);
    if(!request)continue;
    try{
      if(localizationHash(entry.request)!==localizationHash(request))continue;
      if(entry.status==='accepted'&&entry.translation&&!entry.findings?.length){
        const translation=assertReviewedLocalization(request,entry.translation);
        accepted.set(actor.key,translation);
        previews.set(actor.key,projectReviewedActorLocalization(currentArtifact(actor.key),actor.source,translation,prepared.get(actor.key)?.rulePresentation).actor);
      }else if(['draft_ready','needs_review','translating'].includes(entry.status)&&entry.draft){
        // A complete, structurally valid unapproved draft can bind package
        // fields even while its meaning findings await correction. Retain
        // those findings/status; this projection grants no approval.
        previews.set(actor.key,projectActorLocalizationDraft(currentArtifact(actor.key),actor.source,entry.draft,request.policy,undefined,prepared.get(actor.key)?.rulePresentation).actor);
      }
    }catch{ /* Saved progress is not current approval. */ }
  }
  function currentArtifact(key:string):unknown{return prepared.get(key)!.artifact;}
  let packageRequest:LocalizationRequest|undefined;
  if(previews.size===bundle.actors.length){
    try{
      const actorPolicies = new Set([...actorRequests.values()].map(request => request.policy));
      if (actorPolicies.size !== 1) throw new TypeError('保存进度不能混用本地化策略。');
      packageRequest=createEncounterTextRequest(bundle,bundle.actors.map(actor=>({ key:actor.key,
        artifact:previews.get(actor.key),rulePresentation:prepared.get(actor.key)?.rulePresentation })),[...actorPolicies][0]);
    }catch{ /* Keep package findings without asserting a field owner. */ }
  }
  return progress.map(entry=>{
    const request=entry.actorKey?actorRequests.get(entry.actorKey):packageRequest;
    let requestCurrent=false;
    try{requestCurrent=!!request&&localizationHash(entry.request)===localizationHash(request);}catch{}
    let acceptedCurrent=entry.status==='accepted' && !!entry.actorKey && accepted.has(entry.actorKey);
    if(entry.status==='accepted'&&!entry.actorKey&&packageRequest&&entry.translation&&!entry.findings?.length){
      try{assertReviewedLocalization(packageRequest,entry.translation);acceptedCurrent=true;}catch{}
    }
    if(requestCurrent && (entry.status!=='accepted'||acceptedCurrent))return entry;
    return {...entry,status:'needs_review',translation:undefined,draft:undefined,
      request:{...entry.request,texts:[]},
      findings:[...(entry.findings??[]),'保存的译文或字段身份未通过当前候选核对；需重新预览并复核。']};
  });
}
/** Generate source artifacts, translate/review their display slots, then regenerate through the same workflow. */
export async function localizeForgeEncounter(input: {
  bundle: ForgeEncounterPackage;
  service: ReviewedTranslationServicePort;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  onReview?: (progress: EncounterLocalizationProgress) => void;
  priorReviews?: readonly EncounterLocalizationProgress[];
}): Promise<PreparedForgeEncounter> {
  if (input.bundle.localization) throw new TypeError('本包已有译文；重新翻译须从其保留的原始包开始。');
  const original = await prepareForgeEncounter(serializeForgeEncounterPackage(input.bundle), input.signal);
  const translate = async (request: LocalizationRequest, actorKey?: string) => {
    input.signal?.throwIfAborted();
    const prior = [...(input.priorReviews ?? [])].reverse().find(entry => entry?.actorKey === actorKey
      && entry.request?.sourceHash === request.sourceHash && entry.request?.language === request.language
      && entry.request?.policy === request.policy);
    if (prior?.status === 'accepted' && !prior.findings?.length && prior.translation && prior.translation.requestHash === localizationHash(request)) {
      const translation = assertReviewedLocalization(request, prior.translation);
      input.onReview?.({ status: 'accepted', actorKey, request, translation, draft: { texts: translation.texts } });
      return translation;
    }
    input.onReview?.({ status: 'translating', actorKey, request });
    const reusable = new Map<string, {id:string;text:string}>();
    const findings = [...(prior?.findings ?? [])];
    for (const entry of prior?.draft?.texts ?? []) {
      const field = request.texts.find(field => field.id === entry.id);
      if (!field || !prior?.request.texts.some(old => old.id === field.id && old.source === field.source && old.kind === field.kind)) continue;
      try { validateLocalizationDraft({ ...request, texts: [field] }, { texts: [entry] }); reusable.set(entry.id, entry); }
      catch (error) { findings.push(error instanceof Error ? error.message : '译文检查失败'); }
    }
    const semanticIds = new Set((prior?.findings ?? []).flatMap(finding => finding.match(/text-[0-9a-f]{24}/gu) ?? []));
    if (prior?.status === 'needs_review' && prior.findings?.length) {
      if (semanticIds.size) for (const id of semanticIds) reusable.delete(id);
      else reusable.clear();
    }
    const missing = request.texts.filter(field => !reusable.has(field.id));
    const consistentNames = [...(request.nameGlossary ?? []), ...request.texts.filter(field => field.kind === 'title').flatMap(field => {
      const translation = reusable.get(field.id)?.text;
      return translation ? [{ english: field.source, chinese: translation }] : [];
    })];
    const merge = (fresh: LocalizationDraft): LocalizationDraft => {
      const all = new Map([...reusable.values(), ...fresh.texts].map(entry => [entry.id, entry]));
      return { texts: request.texts.flatMap(field => all.has(field.id) ? [all.get(field.id)!] : []) };
    };
    const fresh = missing.length ? await input.service.translate({ ...request, texts: missing, nameGlossary: consistentNames }, input.signal,
      draft => input.onReview?.({ status: 'translating', actorKey, request, draft: merge(draft), findings }),
      prior?.draft ? { draft: prior.draft, findings } : undefined) : { texts: [] };
    if (fresh.texts.length !== missing.length || new Set(fresh.texts.map(entry => entry.id)).size !== missing.length
      || fresh.texts.some(entry => !missing.some(field => field.id === entry.id))) throw new TypeError('翻译返回了额外、缺失或重复的文本身份。');
    const draft = merge(fresh);
    input.onReview?.({ status: 'translating', actorKey, request, draft, findings });
    const deterministicFindings = request.texts.flatMap(field => {
      const candidate = draft.texts.find(entry => entry.id === field.id);
      try { validateLocalizationDraft({ ...request, texts: [field] }, { texts: candidate ? [candidate] : [] }); return []; }
      catch (error) { return [`${field.id}：${error instanceof Error ? error.message.slice(0, 400) : '译文确定性校验失败。'}`]; }
    });
    if (deterministicFindings.length) {
      input.onReview?.({ status: 'needs_review', actorKey, request, draft, findings: deterministicFindings });
      throw new TypeError(`译文确定性校验失败：${deterministicFindings[0]}`);
    }
    validateLocalizationDraft(request, draft);
    const review = await input.service.review(request, draft, input.signal);
    input.onReview?.({ status: review.verdict === 'accepted' ? 'translating' : 'needs_review', actorKey, request, draft, findings: review.findings });
    const translation = acceptLocalization(request, draft, review, input.service.reviewModel);
    input.onReview?.({ status: 'accepted', actorKey, request, draft, translation });
    return translation;
  };
  const actors: EncounterLocalization['actors'] = [];
  for (const actor of original.actors) {
    input.onProgress?.(`正在翻译并简要复核：${actor.name}`);
    const source = original.bundle.actors.find(entry => entry.key === actor.key)!.source;
    actors.push({ key: actor.key, translation: await translate(createActorLocalizationRequest(actor.artifact, source), actor.key) });
  }
  const namePreviews = original.actors.map(actor => ({ artifact: projectReviewedActorLocalization(actor.artifact,
    original.bundle.actors.find(entry => entry.key === actor.key)!.source, actors.find(entry => entry.key === actor.key)!.translation).actor }));
  const packageText = await translate(createEncounterTextRequest(original.bundle, namePreviews));
  const localization: EncounterLocalization = { sourcePackageId: original.bundle.id, actors, packageText };
  const bundle = { ...original.bundle, id: localizedEncounterId(original.bundle.id, localization), localization };
  input.onProgress?.('译文已通过模型简要复核，正在重新生成中文角色并绑定固定控制入口。');
  return prepareForgeEncounter(serializeForgeEncounterPackage(bundle), input.signal);
}

/** Regenerated, source-bound full package preview. The draft alone cannot supply fixed rules. */
export function encounterPackageLocalizationDisplayRows(prepared: PreparedForgeEncounter, draft: ForgeEncounterLocalizationDraft) {
  assertForgeEncounterLocalizationDraft(prepared, draft);
  const policy = draft.packageText.request.policy;
  const actors = prepared.actors.map(actor => ({ key: actor.key, rulePresentation: actor.rulePresentation,
    artifact: projectActorLocalizationDraft(actor.artifact, prepared.bundle.actors.find(entry => entry.key === actor.key)!.source,
      draft.actors.find(entry => entry.key === actor.key)!.draft, policy, undefined, actor.rulePresentation).actor }));
  return previewEncounterTextRows(prepared.bundle, actors, draft.packageText.draft, policy);
}
