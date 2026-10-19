import {
  assertReviewedLocalization, localizationHash, localizationRequest, localizationText, localizationTranslationHash, validateLocalizationDraft,
  LEGACY_LOCALIZATION_POLICY, LOCALIZATION_POLICY, FACT_LOCALIZATION_POLICY,
  type LocalizationPolicy, type LocalizationRequest, type LocalizationText, type ReviewedLocalization, type LocalizationDraft,
} from '@fvtt-json-generator/contracts/localization';
import { NATIVE_LIFECYCLE_STATUS_DEFINITIONS, nativeLifecycleStatusLabel } from '@fvtt-json-generator/contracts/status-lifecycle';
import {
  assertRulePresentationPlan, rulePresentationField,
  type RulePresentationPlan,
} from './rule-presentation';
import { formatLiteralHtml, formatManualRuleHtml, formatMixedRuleHtml } from './actor-text';
import { composeSourceTextPresentation, decodeSourceTextPresentation } from '@fvtt-json-generator/models/source-text-presentation';

type Path = Array<string | number>;
interface Field { path: Path; text: LocalizationText }
const SCOPE = 'fvttJsonGenerator';

function read(root: any, path: Path): any { return path.reduce((value, key) => value?.[key], root); }
function write(root: any, path: Path, value: string): void {
  const parent = read(root, path.slice(0, -1));
  parent[path.at(-1)!] = value;
}
function needsTranslation(source: string): boolean {
  return /[a-z]/i.test(source.replace(/<[^>]*>|&[^;]+;|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]|\d+d\d+|\b(?:GM|DC|HP|AC|CR|D20)\b/giu, ''));
}
function builtinStatusTitle(effect: any, actor: any): string | undefined {
  if (!String(actor._stats?.coreVersion ?? '').startsWith('14.') || effect?.statuses?.length !== 1) return undefined;
  const status = effect.statuses[0];
  if (!Object.hasOwn(NATIVE_LIFECYCLE_STATUS_DEFINITIONS, status)) return undefined;
  const name = String(effect.name ?? '').trim();
  const definition = NATIVE_LIFECYCLE_STATUS_DEFINITIONS[status as keyof typeof NATIVE_LIFECYCLE_STATUS_DEFINITIONS];
  const english = status[0]!.toUpperCase() + status.slice(1);
  const sourceNames: readonly string[] = definition.sourceNames;
  const legacyAliases: Record<string, string[]> = { grappled: ['被擒抱', '擒抱'], restrained: ['受限'] };
  const labels = [...sourceNames, ...(legacyAliases[status] ?? [])];
  if (name.toLowerCase() !== status && !labels.some(label => name === label || name === `${label} ${english}` || name === `${label} (${english})` || name === `${label}（${english}）`)) return undefined;
  return `${nativeLifecycleStatusLabel(status)} ${english}`;
}

/** Schema-derived display allowlist. Evidence, status IDs, paths and numeric mechanics are excluded. */
function actorFields(actor: any, includeUntranslated = false): Field[] {
  const fields: Field[] = [];
  const add = (path: Path, kind: LocalizationText['kind'] = 'body') => {
    const value = read(actor, path);
    if (isBiographyPath(path) && typeof value === 'string') biographyPresentation(actor, value);
    // The full source definition remains in flags/review. Internal marker IDs are not GM prose.
    const display = typeof value === 'string' && kind === 'body'
      ? value.replace(/^条件：encounter-(?:staged|manual)[^\n]*(?:\n|$)/gmu, '') : value;
    if (typeof display === 'string' && display.trim() && (includeUntranslated || needsTranslation(display)))
      fields.push({ path, text: localizationText(kind, display) });
  };
  add(['name'], 'title');
  add(['system', 'details', 'biography', 'value']);
  add(['system', 'details', 'alignment']);
  add(['system', 'details', 'type', 'subtype']);
  add(['system', 'details', 'type', 'custom']);
  add(['system', 'attributes', 'senses', 'special']);
  add(['system', 'traits', 'languages', 'custom']);
  const effects = (values: any[], prefix: Path) => (values ?? []).forEach((effect, index) => {
    if (!builtinStatusTitle(effect, actor)) add([...prefix, index, 'name'], 'title');
    add([...prefix, index, 'description']);
  });
  effects(actor.effects, ['effects']);
  (actor.items ?? []).forEach((item: any, index: number) => {
    const prefix: Path = ['items', index];
    add([...prefix, 'name'], 'title');
    add([...prefix, 'system', 'requirements']);
    for (const field of ['value', 'chat', 'unidentified']) add([...prefix, 'system', 'description', field]);
    for (const key of Object.keys(item.system?.activities ?? {})) {
      const activity = [...prefix, 'system', 'activities', key];
      add([...activity, 'name'], 'title');
      add([...activity, 'description', 'chatFlavor']);
      add([...activity, 'activation', 'condition']);
      add([...activity, 'range', 'special']);
      add([...activity, 'target', 'affects', 'special']);
    }
    effects(item.effects, [...prefix, 'effects']);
    (item.flags?.[SCOPE]?.behaviorMechanics ?? []).forEach((mechanic: any, mi: number) => {
      const base = [...prefix, 'flags', SCOPE, 'behaviorMechanics', mi];
      add([...base, 'name'], 'title');
      (mechanic.gmSteps ?? []).forEach((_step: string, si: number) => add([...base, 'gmSteps', si]));
      add([...base, 'trigger', 'condition']);
      add([...base, 'externalRule', 'name'], 'title');
      add([...base, 'externalRule', 'result']);
      // Encounter marker conditions are program identities. Ordinary literal conditions are prose.
      (mechanic.conditions ?? []).forEach((condition: string, ci: number) => {
        if (!/^encounter-(?:staged|manual)(?::|-)/u.test(condition)) add([...base, 'conditions', ci]);
      });
    });
  });
  return fields;
}
function projectedActorFields(actor: any, policy: LocalizationPolicy, plan?: RulePresentationPlan): Field[] {
  const fields = actorFields(actor, policy === FACT_LOCALIZATION_POLICY);
  if (policy === FACT_LOCALIZATION_POLICY && plan) for (const planned of plan.fields) {
    if (!fields.some(field => JSON.stringify(field.path) === JSON.stringify(planned.path))) {
      fields.push({ path: planned.path, text: localizationText('body', planned.source) });
    }
  }
  return fields;
}

function presentationTexts(actor: any, sourceIdentity: string, policy: LocalizationPolicy, plan?: RulePresentationPlan): LocalizationText[] {
  if (policy === FACT_LOCALIZATION_POLICY) assertRulePresentationPlan(plan, actor, sourceIdentity);
  const texts = actorFields(actor).flatMap(field => {
    const planned = policy === FACT_LOCALIZATION_POLICY ? rulePresentationField(plan!, field.path) : undefined;
    if (!planned) return [field.text];
    return planned.segments.flatMap(segment => segment.kind === 'prose' && needsTranslation(segment.source)
      ? [localizationText('body', segment.source)] : []);
  });
  return [...new Map(texts.map(text => [text.id, text])).values()];
}
export function createActorLocalizationRequest(actor: any, sourceIdentity: string,
  policy: LocalizationPolicy = LOCALIZATION_POLICY, plan?: RulePresentationPlan): LocalizationRequest {
  const texts = presentationTexts(actor, sourceIdentity, policy, plan);
  // Forge attaches a transport UUID before parsing; it is not part of the source's language or rules.
  const source = sourceIdentity.replace(/^forge-source-id:[^\r\n]*(?:\r?\n|$)/gmu, '');
  const sourceHash = policy === FACT_LOCALIZATION_POLICY
    ? localizationHash({ source, target: actor._stats?.systemVersion, core: actor._stats?.coreVersion,
      facts: plan!.factsHash, blocks: plan!.sourceHash, template: plan!.templateHash })
    : localizationHash({ source, target: actor._stats?.systemVersion, core: actor._stats?.coreVersion });
  return localizationRequest(sourceHash, texts, policy);
}
export function reviewedTitleEnglish(source: string, policy: LocalizationPolicy = LOCALIZATION_POLICY): string {
  // Generated GM-operation prefixes are already Chinese. Keep the source English capability after them.
  const existingBilingual = /^[\u3400-\u9fff][\s\S]*?[（(]([A-Za-z][^（）()]*)[)）]$/u.exec(source);
  const spacedBilingual = /^[\u3400-\u9fff][^A-Za-z]*\s+([A-Za-z][\s\S]*)$/u.exec(source);
  const alias = /^(.*?)\s*\(([^()]+)\)$/u.exec(source);
  const letters = (value: string) => value.toLowerCase().replace(/[^a-z]/gu, '');
  const sourceAlias = alias && letters(alias[1]!) === letters(alias[2]!) ? alias[2] : undefined;
  // A spaced English name may itself end with a source qualifier in parentheses.
  // Prefer that whole name in v2; retain v1's extraction for already approved packages.
  return (policy !== LEGACY_LOCALIZATION_POLICY ? spacedBilingual?.[1] : undefined)
    ?? existingBilingual?.[1] ?? sourceAlias ?? source.replace(/^[\u3400-\u9fff\s：:]+/u, '').trim();
}
export function formatReviewedTitle(source: string, translated: string, policy: LocalizationPolicy): string {
  const english = reviewedTitleEnglish(source, policy);
  if (!/[A-Za-z]/u.test(english)) return translated;
  return policy === LEGACY_LOCALIZATION_POLICY ? `${translated}（${english}）` : `${translated} ${english}`;
}
export function reviewedTitleChinese(display: string, source: string, policy: LocalizationPolicy): string {
  const english = reviewedTitleEnglish(source, policy);
  const suffix = policy === LEGACY_LOCALIZATION_POLICY ? `（${english}）` : ` ${english}`;
  return /[A-Za-z]/u.test(english) && display.endsWith(suffix) ? display.slice(0, -suffix.length) : display;
}
export interface LocalizedItemName { index: number; id: string | null; source: string; display: string }
export interface ActorLocalizationResult { actor: any; itemNames: LocalizedItemName[]; request: LocalizationRequest }

/** Only an exact generator-owned manual wrapper may be excluded from the
 * author's source. Never strip Chinese prose, matching phrases or arbitrary
 * HTML: a source author may have written any of them deliberately. */
function isBiographyPath(path: Path): boolean {
  return JSON.stringify(path) === JSON.stringify(['system','details','biography','value']);
}
function biographyPresentation(actor: any, display: string) {
  const value = actor.flags?.[SCOPE]?.biographyPresentation;
  if (value === undefined) return undefined;
  const presentation = decodeSourceTextPresentation(value);
  if (display !== formatLiteralHtml(composeSourceTextPresentation(presentation))) {
    throw new TypeError('Biography source and program annotations do not match the generated display.');
  }
  return presentation;
}
function descriptionSource(actor: any, path: Path, display: string): string {
  if (isBiographyPath(path)) {
    const presentation = biographyPresentation(actor, display);
    return presentation ? formatLiteralHtml(presentation.sourceText) : display;
  }
  if (path[0] !== 'items' || typeof path[1] !== 'number') return display;
  const itemDescription = JSON.stringify(path.slice(2)) === JSON.stringify(['system', 'description', 'value']);
  const activityDescription = path.length === 7 && path[2] === 'system' && path[3] === 'activities'
    && path[5] === 'description' && path[6] === 'chatFlavor';
  if (!itemDescription && !activityDescription) return display;
  const rule = actor.items?.[path[1]]?.flags?.[SCOPE]?.manualRule;
  if(rule?.version===1&&rule.mode==='native-with-gm'&&typeof rule.sourceText==='string'&&display===formatMixedRuleHtml(rule.sourceText,itemDescription,Array.isArray(rule.operations)?rule.operations:[]))return formatLiteralHtml(rule.sourceText);
  if (rule?.version !== 1 || rule.mode !== 'gm-manual' || typeof rule.sourceText !== 'string'
    || display !== formatManualRuleHtml(rule.sourceText, itemDescription)) return display;
  return formatLiteralHtml(rule.sourceText);
}

/** The generator owns the suffix and its line-break tokens. Locate its
 * translated counterpart from that exact structural suffix, never by Chinese
 * words or by deleting a paragraph that merely resembles an annotation. */
function separateBiographyProgramNotes(actor: any, chinese: string, display: string): string {
  const presentation = biographyPresentation(actor, display);
  if (!presentation?.programNotes.length) return chinese;
  const aside = (value: string) => `<aside data-forge-program-notes><h3>程序说明</h3>${value}</aside>`;
  if (!presentation.sourceText) return aside(chinese);
  const suffix = '<br><br>' + formatLiteralHtml(presentation.programNotes.join('\n\n')).slice(3);
  const expectedTags = suffix.match(/<[^>]*>/gu) ?? [];
  const actualTags = [...chinese.matchAll(/<[^>]*>/gu)].slice(-expectedTags.length);
  if (!chinese.startsWith('<p>') || !chinese.endsWith('</p>')
    || actualTags.length !== expectedTags.length
    || actualTags.some((tag, index) => tag[0] !== expectedTags[index])
    || actualTags[0]?.[0] !== '<br>' || actualTags[1]?.[0] !== '<br>'
    || chinese.slice(actualTags[0].index! + 4, actualTags[1].index).trim()) {
    throw new TypeError('Biography program annotations lost their source-bound display boundary.');
  }
  const authored = chinese.slice(0, actualTags[0].index) + '</p>';
  const notes = '<p>' + chinese.slice(actualTags[1].index! + 4);
  return authored + aside(notes);
}

/** Chinese display first; the author's source follows without duplicating
 * generator instructions. The translator never supplies that source. */
function bilingualDescription(actor: any, path: Path, chinese: string, source: string, policy: LocalizationPolicy): string {
  const description = path.includes('description')
    || isBiographyPath(path);
  if (policy !== FACT_LOCALIZATION_POLICY || !description) return chinese;
  const authored = descriptionSource(actor, path, source);
  let display = isBiographyPath(path) ? separateBiographyProgramNotes(actor, chinese, source) : chinese;
  if (authored !== source && path[0] === 'items') {
    // A verified manual wrapper owns the first paragraph. Protected HTML
    // keeps that paragraph bound even when its wording has been translated.
    const end = display.indexOf('</p>');
    if (!display.startsWith('<p>') || end < 0) throw new TypeError('Manual instruction display boundary is missing.');
    display = `<aside data-forge-program-notes>${display.slice(0, end + 4)}</aside>${display.slice(end + 4)}`;
  }
  return needsTranslation(authored) ? `${display}<hr><h3>英文原文</h3>${authored}` : display;
}

/** Apply only freshly enumerated display slots after source generation. No supplied JSON paths are followed. */
export function projectReviewedActorLocalization(actor: any, sourceIdentity: string, input: ReviewedLocalization,
  plan?: RulePresentationPlan): ActorLocalizationResult {
  const request = createActorLocalizationRequest(actor, sourceIdentity, input.policy, plan);
  const reviewed = assertReviewedLocalization(request, input);
  return projectActorLocalizationDraft(actor, sourceIdentity, { texts: reviewed.texts }, reviewed.policy,
    { requestHash: reviewed.requestHash, translationHash: localizationTranslationHash(reviewed) }, plan);
}

/** Validated display preview; no approval is conferred by this projection. */
export function projectActorLocalizationDraft(actor: any, sourceIdentity: string, input: LocalizationDraft,
  policy: LocalizationPolicy = LOCALIZATION_POLICY, binding?: { requestHash: string; translationHash: string },
  plan?: RulePresentationPlan): ActorLocalizationResult {
  const request = createActorLocalizationRequest(actor, sourceIdentity, policy, plan);
  const draft = validateLocalizationDraft(request, input);
  const translated = new Map(draft.texts.map(entry => [entry.id, entry.text]));
  const output = structuredClone(actor);
  const applyBuiltinTitles = (sourceEffects: any[], targetEffects: any[]) => sourceEffects?.forEach((effect, index) => {
    const title = builtinStatusTitle(effect, actor);
    if (title) targetEffects[index].name = title;
  });
  applyBuiltinTitles(actor.effects, output.effects);
  (actor.items ?? []).forEach((item: any, index: number) => applyBuiltinTitles(item.effects, output.items[index].effects));
  for (const field of projectedActorFields(actor, policy, plan)) {
    const planned = policy === FACT_LOCALIZATION_POLICY ? rulePresentationField(plan!, field.path) : undefined;
    if (!planned && !translated.has(field.text.id)) continue;
    const text = planned ? planned.segments.map(segment => {
      if (segment.kind === 'fixed') return segment.zh;
      if (!needsTranslation(segment.source)) return segment.source;
      const value = translated.get(localizationText('body', segment.source).id);
      if (value === undefined) throw new TypeError('已支持规则的剩余文本缺译文。');
      return value;
    }).join('') : translated.get(field.text.id)!;
    write(output, field.path, field.text.kind === 'title' ? formatReviewedTitle(field.text.source,text,policy)
      : bilingualDescription(actor, field.path, text, field.text.source, policy));
  }
  if (output.prototypeToken && typeof output.prototypeToken === 'object') output.prototypeToken.name = output.name;
  const itemNames: LocalizedItemName[] = (actor.items ?? []).map((item: any, index: number) => ({ index, id: item._id ?? null, source: item.name, display: output.items[index].name }));
  if (new Set(itemNames.map(item => item.display)).size !== new Set(itemNames.map(item => item.source)).size) throw new TypeError('翻译导致能力名称发生歧义。');
  const mappedName = (source: string, section?: string) => {
    const matches = itemNames.filter(item => item.source === source && (!section
      || actor.items[item.index]?.flags?.['tidy5e-sheet']?.section === section
      || actor.items[item.index]?.flags?.['tidy5e-sheet']?.actionSection === section
      || (section === '传奇动作' && actor.items[item.index]?.flags?.['tidy5e-sheet']?.section === 'Legendary Actions')));
    if (matches.length !== 1) throw new TypeError(`本地化绑定无法唯一匹配来源能力：${source}`);
    return matches[0]!.display;
  };
  // These are explicit name bindings, not free-form text replacement. All IDs and references stay intact.
  for (const item of output.items ?? []) {
    for (const mechanic of item.flags?.[SCOPE]?.behaviorMechanics ?? []) {
      mechanic.carrier.name = mappedName(mechanic.carrier.name, mechanic.carrier.section);
      for (const ref of mechanic.references ?? []) if (ref.item?.name) ref.item.name = mappedName(ref.item.name, ref.item.section);
    }
  }
  output.flags ??= {};
  output.flags[SCOPE] ??= {};
  output.flags[SCOPE].localization = {
    version: 1, language: 'zh-CN', policy, terminology: request.terminology,
    requestHash: binding?.requestHash ?? localizationHash(request),
    translationHash: binding?.translationHash ?? localizationHash({ requestHash: localizationHash(request), texts: draft.texts }),
    sourceName: actor.name, itemNames,
    ...(policy === FACT_LOCALIZATION_POLICY ? { descriptionLayout: 'zh-first-source-en-v1' } : {}),
  };
  return { actor: output, itemNames, request };
}

export interface ActorLocalizationDisplayRow {
  path: string;
  fullSource: string;
  assembledZh: string;
  fixedBlocks: Array<{ source: string; zh: string; factRefs: string[]; executionMode: 'native' | 'gm-assisted' }>;
  editableSlots: Array<{ textId: string; source: string; draft: string; review: 'normal' | 'gm-assisted' }>;
  uncoveredMechanics: Array<{ summaryZh: string; details: string[]; factRefs: string[] }>;
}
/** Return the same assembled preview that validation and approval project. Fixed blocks have no editable text ID. */
export function actorLocalizationDisplayRows(sourceActor: any, sourceIdentity: string,
  draft: LocalizationDraft, plan: RulePresentationPlan): ActorLocalizationDisplayRow[] {
  const projected = projectActorLocalizationDraft(sourceActor, sourceIdentity, draft, FACT_LOCALIZATION_POLICY, undefined, plan);
  const entries = new Map(draft.texts.map(entry => [entry.id, entry.text]));
  const requested = new Set(projected.request.texts.map(entry => entry.id));
  return projectedActorFields(sourceActor, FACT_LOCALIZATION_POLICY, plan).map(field => {
    const planned = rulePresentationField(plan, field.path);
    const uncoveredMechanics = plan.uncoveredMechanics
      .filter(entry => entry.path === JSON.stringify(field.path))
      .map(entry => ({ summaryZh: entry.summaryZh, details: [...entry.details], factRefs: [...entry.factRefs] }));
    const editableSlots = planned
      ? planned.segments.flatMap(segment => {
        if (segment.kind !== 'prose' || !needsTranslation(segment.source)) return [];
        const textId = localizationText('body', segment.source).id;
        return [{ textId, source: segment.source, draft: entries.get(textId) ?? '', review: segment.review }];
      })
      : requested.has(field.text.id)
        ? [{ textId: field.text.id, source: field.text.source,
          draft: entries.get(field.text.id) ?? '',
          review: uncoveredMechanics.length ? 'gm-assisted' as const : 'normal' as const }]
        : [];
    return {
    path: JSON.stringify(field.path),
    fullSource: descriptionSource(sourceActor, field.path, String(read(sourceActor, field.path) ?? '')),
    assembledZh: String(read(projected.actor, field.path) ?? ''),
    fixedBlocks: (planned?.segments ?? []).filter(segment => segment.kind === 'fixed').map(segment => ({
      source: segment.source, zh: segment.zh, factRefs: [...segment.factRefs], executionMode: segment.executionMode,
    })),
    editableSlots,
    uncoveredMechanics,
  };
  });
}
