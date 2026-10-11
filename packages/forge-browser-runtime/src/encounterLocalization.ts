import {
  acceptLocalization, approveLocalizationByGm, assertReviewedLocalization, localizationHash, validateLocalizationDraft,
  type ReviewedLocalization, type LocalizationRequest, type LocalizationDraft, type EncounterLocalization,
} from '@fvtt-json-generator/contracts/localization';
import { createActorLocalizationRequest, projectActorLocalizationDraft, projectReviewedActorLocalization } from '@fvtt-json-generator/generation/reviewed-localization';
import type { ReviewedTranslationServicePort } from '@fvtt-json-generator/generation/ports';
import { assertPreparedForgeEncounter, prepareForgeEncounter, type PreparedForgeEncounter } from './encounterPreparation';
import { serializeForgeEncounterPackage, type ForgeEncounterPackage } from './encounterPackage';
import { createEncounterTextRequest, localizedEncounterId } from './encounterLocalizationProjection';
export { createEncounterTextRequest } from './encounterLocalizationProjection';
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
  const previews = prepared.actors.map(actor => {
    const entry = value.actors.find(part => part.key === actor.key);
    const source = prepared.bundle.actors.find(part => part.key === actor.key)!.source;
    if (!entry || value.actors.filter(part => part.key === actor.key).length !== 1) throw new TypeError('中文草稿角色身份无效。');
    const request = createActorLocalizationRequest(actor.artifact, source);
    const draft = checkedPart(request, entry);
    return { artifact: projectActorLocalizationDraft(actor.artifact, source, draft).actor };
  });
  checkedPart(createEncounterTextRequest(prepared.bundle, previews), value.packageText);
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
  const translate = async (request: LocalizationRequest, actorKey?: string): Promise<ForgeLocalizationDraftPart> => {
    input.signal?.throwIfAborted();
    const requestHash = localizationHash(request);
    const prior = [...(input.priorDrafts ?? [])].reverse().find(entry => {
      if (entry?.actorKey !== actorKey || !['draft_ready', 'needs_review', 'translating'].includes(entry.status)) return false;
      try { return localizationHash(entry.request) === requestHash; } catch { return false; }
    });
    const reusable = new Map<string, { id: string; text: string }>();
    const findings = [...(prior?.findings ?? [])];
    for (const entry of prior?.draft?.texts ?? []) {
      const field = request.texts.find(field => field.id === entry.id);
      if (!field) continue;
      try {
        const checked = validateLocalizationDraft({ ...request, texts: [field] }, { texts: [entry] });
        reusable.set(entry.id, checked.texts[0]!);
      } catch { /* Only the failing field is sent for translation again. */ }
    }
    if (prior?.status === 'needs_review' && findings.length) {
      const rejectedIds = new Set(findings.flatMap(finding => finding.match(/text-[0-9a-f]{24}/gu) ?? []));
      if (rejectedIds.size) for (const id of rejectedIds) reusable.delete(id);
      else reusable.clear();
    }
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
    input.onReview?.({ status: 'draft_ready', actorKey, request, draft });
    return { request, draft, requestHash, translationHash: localizationHash({ requestHash, texts: draft.texts }) };
  };
  const actors: ForgeEncounterLocalizationDraft['actors'] = [];
  const previews: Array<{ artifact: unknown }> = [];
  for (const actor of prepared.actors) {
    input.onProgress?.(`正在翻译中文草稿：${actor.name}`);
    const source = prepared.bundle.actors.find(entry => entry.key === actor.key)!.source;
    const part = await translate(createActorLocalizationRequest(actor.artifact, source), actor.key);
    actors.push({ key: actor.key, ...part });
    previews.push({ artifact: projectActorLocalizationDraft(actor.artifact, source, part.draft).actor });
  }
  const packageText = await translate(createEncounterTextRequest(prepared.bundle, previews));
  const result: ForgeEncounterLocalizationDraft = { version: 1, sourcePackageId: prepared.bundle.id,
    sourcePackageHash: prepared.hash, actors, packageText };
  assertForgeEncounterLocalizationDraft(prepared, result);
  input.onProgress?.('中文草稿已通过本地校验，等待 GM 核对；AI 尚未审核。');
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
  actors:readonly {key:string;artifact:unknown}[],
  progress:readonly EncounterLocalizationProgress[],
):EncounterLocalizationProgress[] {
  if(bundle.localization)return [];
  const prepared=new Map(actors.map(actor=>[actor.key,actor]));
  const actorRequests=new Map(bundle.actors.flatMap(actor=>{
    const current=prepared.get(actor.key);
    return current?[[actor.key,createActorLocalizationRequest(current.artifact,actor.source)] as const]:[];
  }));
  const previews=new Map<string,unknown>();
  const accepted=new Map<string,ReviewedLocalization>();
  for(const actor of bundle.actors){
    const matches=progress.filter(entry=>entry.actorKey===actor.key);
    if(matches.length!==1)continue;
    const entry=matches[0]!,request=actorRequests.get(actor.key);
    if(!request||entry.findings?.length)continue;
    try{
      if(localizationHash(entry.request)!==localizationHash(request))continue;
      if(entry.status==='accepted'&&entry.translation){
        const translation=assertReviewedLocalization(request,entry.translation);
        accepted.set(actor.key,translation);
        previews.set(actor.key,projectReviewedActorLocalization(currentArtifact(actor.key),actor.source,translation).actor);
      }else if(entry.status==='draft_ready'&&entry.draft){
        previews.set(actor.key,projectActorLocalizationDraft(currentArtifact(actor.key),actor.source,entry.draft).actor);
      }
    }catch{ /* Saved progress is not current approval. */ }
  }
  function currentArtifact(key:string):unknown{return prepared.get(key)!.artifact;}
  let packageRequest:LocalizationRequest|undefined;
  if(previews.size===bundle.actors.length){
    try{
      packageRequest=createEncounterTextRequest(bundle,bundle.actors.map(actor=>({artifact:previews.get(actor.key)})));
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
