import {
  acceptLocalization, assertReviewedLocalization, localizationHash, validateLocalizationDraft,
  type ReviewedLocalization, type LocalizationRequest, type LocalizationDraft, type EncounterLocalization,
} from '@fvtt-json-generator/contracts/localization';
import { createActorLocalizationRequest, projectReviewedActorLocalization } from '@fvtt-json-generator/generation/reviewed-localization';
import type { ReviewedTranslationServicePort } from '@fvtt-json-generator/generation/ports';
import { prepareForgeEncounter, type PreparedForgeEncounter } from './encounterPreparation';
import { serializeForgeEncounterPackage, type ForgeEncounterPackage } from './encounterPackage';
import { createEncounterTextRequest, localizedEncounterId } from './encounterLocalizationProjection';
export { createEncounterTextRequest } from './encounterLocalizationProjection';
export type { EncounterLocalization } from '@fvtt-json-generator/contracts/localization';
export { LOCALIZATION_TERMS, LOCALIZATION_TERM_NOTES } from '@fvtt-json-generator/contracts/localization';

export interface EncounterLocalizationProgress {
  status: 'translating' | 'needs_review' | 'accepted';
  actorKey?: string;
  request: LocalizationRequest;
  draft?: LocalizationDraft;
  translation?: ReviewedLocalization;
  findings?: string[];
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
    input.onProgress?.(`正在翻译并独立核对：${actor.name}`);
    const source = original.bundle.actors.find(entry => entry.key === actor.key)!.source;
    actors.push({ key: actor.key, translation: await translate(createActorLocalizationRequest(actor.artifact, source), actor.key) });
  }
  const namePreviews = original.actors.map(actor => ({ artifact: projectReviewedActorLocalization(actor.artifact,
    original.bundle.actors.find(entry => entry.key === actor.key)!.source, actors.find(entry => entry.key === actor.key)!.translation).actor }));
  const packageText = await translate(createEncounterTextRequest(original.bundle, namePreviews));
  const localization: EncounterLocalization = { sourcePackageId: original.bundle.id, actors, packageText };
  const bundle = { ...original.bundle, id: localizedEncounterId(original.bundle.id, localization), localization };
  input.onProgress?.('译文已通过独立审核，正在重新生成中文角色并绑定固定控制入口。');
  return prepareForgeEncounter(serializeForgeEncounterPackage(bundle), input.signal);
}
