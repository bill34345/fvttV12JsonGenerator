import { assertReviewedLocalization, validateLocalizationDraft, localizationHash, localizationRequest, localizationText, FACT_LOCALIZATION_POLICY, LOCALIZATION_POLICY, LEGACY_LOCALIZATION_POLICY, type LocalizationPolicy, type EncounterLocalization, type LocalizationRequest, type LocalizationDraft } from '@fvtt-json-generator/contracts/localization';
import { formatReviewedTitle, reviewedTitleChinese, type LocalizedItemName, type ActorLocalizationDisplayRow } from '@fvtt-json-generator/generation/reviewed-localization';
import { fixedEncounterCommand, readFixedEncounterConfiguration } from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { serializeForgeEncounterPackage, type ForgeEncounterPackage, type ForgeEncounterPackageMacro } from './encounterPackage';
import { ParserFactory } from '@fvtt-json-generator/parser/router';
import { FACT_NOTES_TEMPLATE_VERSION, encounterFactNoteParts, type EncounterFactActor, type EncounterNotePart } from './encounterFactNotes';

function sourceBundle(bundle: ForgeEncounterPackage): ForgeEncounterPackage {
  const { localization: _localization, ...source } = bundle;
  return { ...source, id: bundle.localization?.sourcePackageId ?? bundle.id };
}
function proseNotes(notes: string): string { return notes.replace(/^原始(?:资料|来源)SHA-256：[^\r\n]*(?:\r?\n|$)/gmu, '').trim(); }
function displayRuleReferences(bundle: ForgeEncounterPackage, macro: ForgeEncounterPackageMacro, projectActorVocabulary=true): string {
  const notes = proseNotes(macro.notes);
  if (!/\brule\s+id\b/iu.test(notes)
    &&(!projectActorVocabulary||!/(?<![\w-])actor-\d+(?![\w-])|\blegendaryRecovery\b/u.test(notes))) return notes;
  const config = readFixedEncounterConfiguration(macro.command);
  if (!config) throw new TypeError('规则引用需要工具编译的固定控制配置。');
  const projected = notes.replace(/\brule\s+id\b\s+([A-Za-z0-9][A-Za-z0-9_-]*)/giu, (_match, id: string) => {
    const rule = config.rules.find(entry => entry.id === id);
    if (!rule) throw new TypeError(`规则引用无法唯一绑定当前来源：${id}`);
    const actor = bundle.actors.find(entry => entry.key === rule.actorKey);
    const sameTitle = config.rules.filter(entry => entry.itemName === rule.itemName);
    const boundActors = sameTitle.map(entry => bundle.actors.find(actor => actor.key === entry.actorKey));
    if (!actor || boundActors.some(entry => !entry)
      || sameTitle.filter(entry => entry.actorKey === rule.actorKey).length !== 1
      || new Set(boundActors.map(entry => entry!.label)).size !== boundActors.length) {
      throw new TypeError(`规则引用无法唯一绑定当前来源：${id}`);
    }
    return `rule “${sameTitle.length > 1 ? `${actor.label}：` : ''}${rule.itemName}”`;
  });
  if (/\brule\s+id\b/iu.test(projected)) throw new TypeError('规则引用缺少有效的当前来源 ID。');
  if(!projectActorVocabulary)return projected;
  return projected.replace(/(?<![\w-])actor-\d+(?![\w-])/gu,id=>{
    const actor=bundle.actors.find(entry=>entry.key===id);
    if(!actor||bundle.actors.filter(entry=>entry.label===actor.label).length!==1)throw new TypeError(`角色引用无法唯一绑定当前来源：${id}`);
    return actor.label;
  }).replace(/\blegendaryRecovery\b/gu,'legendary action recovery');
}
function hasTranslatableText(source: string): boolean {
  return /[A-Za-z]/u.test(source.replace(/\b(?:GM|DC|HP|AC|CR|D20)\b|\d+d\d+/giu, ''));
}
function packageFields(bundle: ForgeEncounterPackage, projectRuleReferences: boolean, projectActorVocabulary=true,
  policy: LocalizationPolicy=LOCALIZATION_POLICY, actors: readonly EncounterFactActor[] = []) {
  return [
    { key: 'label', ...localizationText('title', bundle.label) },
    ...bundle.macros.flatMap(macro => {
      const notes = projectRuleReferences ? displayRuleReferences(bundle, macro, projectActorVocabulary) : proseNotes(macro.notes);
      const bodies = policy === FACT_LOCALIZATION_POLICY
        ? encounterFactNoteParts(notes, actors).flatMap((part, index) => part.fixedZh !== undefined || !part.source.trim() ? []
          : [{ key: `${macro.key}:notes:${index}`, ...localizationText('body', part.source) }])
        : notes ? [{ key: `${macro.key}:notes`, ...localizationText('body', notes) }] : [];
      return [{ key: `${macro.key}:name`, ...localizationText('title', macro.name) }, ...bodies];
    }),
  ].filter(field => hasTranslatableText(field.source));
}
export function createEncounterTextRequest(bundle: ForgeEncounterPackage, actors: readonly EncounterFactActor[] = [], policy: LocalizationPolicy = LOCALIZATION_POLICY): LocalizationRequest {
  const original = sourceBundle(bundle);
  const packageSourceHash = hashSource(serializeForgeEncounterPackage(original));
  if (policy === FACT_LOCALIZATION_POLICY && (actors.length !== original.actors.length
    || original.actors.some(actor => actors.filter(entry => entry.key === actor.key && entry.rulePresentation).length !== 1))) {
    throw new TypeError('包级中文核对缺少当前全部角色的规则事实。');
  }
  const sourceHash = policy === FACT_LOCALIZATION_POLICY ? localizationHash({
    source: packageSourceHash, template: FACT_NOTES_TEMPLATE_VERSION,
    actors: original.actors.map(actor => {
      const plan = actors.find(entry => entry.key === actor.key)!.rulePresentation!;
      return { key: actor.key, facts: plan.factsHash, source: plan.sourceHash, template: plan.templateHash };
    }),
    notes: original.macros.map(macro => ({ key: macro.key,
      parts: encounterFactNoteParts(displayRuleReferences(original, macro), actors) })),
  }) : packageSourceHash;
  const names = actors.flatMap(({ artifact }) => {
    const localized = artifact?.flags?.fvttJsonGenerator?.localization;
    return localized ? [{ english: localized.sourceName, chinese: reviewedTitleChinese(artifact.name, localized.sourceName, localized.policy) },
      ...(localized.itemNames as LocalizedItemName[]).map(item => ({ english: item.source, chinese: reviewedTitleChinese(item.display, item.source, localized.policy) }))] : [];
  });
  const sourceRuleContext = policy === FACT_LOCALIZATION_POLICY
    ? original.actors.flatMap(actor => actors.find(entry => entry.key === actor.key)!.rulePresentation!.blocks.map(block => ({
      actor: actor.key, section: block.path, name: actor.label, description: `${block.source}\n已核实的固定中文：${block.zh}`,
    })))
    : original.actors.flatMap(actor => {
      const parsed = new ParserFactory().parse(actor.source);
      const rules = Object.entries(parsed.structuredActions ?? {}).flatMap(([section, entries]) =>
        (entries ?? []).flatMap(entry => typeof entry.describe === 'string'
          ? [{ actor: actor.key, section, name: entry.name, description: entry.describe }] : []));
      return rules.length ? rules : [{ actor: actor.key, section: 'source', name: actor.label, description: actor.source }];
    });
  const build = (projectRuleReferences: boolean,projectActorVocabulary=true) => {
    const request = localizationRequest(sourceHash,
      [...new Map(packageFields(original, projectRuleReferences,projectActorVocabulary,policy,actors).map(({ key: _key, ...text }) => [text.id, text])).values()], policy);
    if (names.length) request.nameGlossary = [...new Map(names.map(name => [name.english, name])).values()];
    request.sourceRuleContext = sourceRuleContext;
    return request;
  };
  // Legacy approvals retain their original identity; facts approvals have one current template.
  if (bundle.localization && policy !== FACT_LOCALIZATION_POLICY) {
    const previous = build(false);
    if (localizationHash(previous) === bundle.localization.packageText.requestHash) return previous;
    const ruleTitlesOnly=build(true,false);
    if(localizationHash(ruleTitlesOnly)===bundle.localization.packageText.requestHash)return ruleTitlesOnly;
  }
  return build(true);
}
export function localizedEncounterId(id: string, localization: EncounterLocalization): string {
  return `${id.slice(0, 65).replace(/-$/u, '')}-zh-cn-${localizationHash(localization).slice(0, 16)}`;
}
export function assertEncounterLocalizationIdentity(bundle: ForgeEncounterPackage): void {
  const localization = bundle.localization;
  if (!localization) return;
  if (bundle.id !== localizedEncounterId(localization.sourcePackageId, localization)
    || bundle.actors.length !== localization.actors.length || bundle.actors.some(actor => !localization.actors.some(entry => entry.key === actor.key))) {
    throw new TypeError('中文候选身份与语言、角色或审核记录不一致。');
  }
}
export function localizedEncounterPresentation(bundle: ForgeEncounterPackage, actors: readonly (EncounterFactActor & { key: string })[]): { label: string; macros: readonly ForgeEncounterPackageMacro[]; reviewFindings: readonly string[] } {
  if (!bundle.localization) return retainedActorMacroPresentation(bundle, actors);
  assertEncounterLocalizationIdentity(bundle);
  const request = createEncounterTextRequest(bundle, actors, bundle.localization.packageText.policy);
  assertReviewedLocalization(request, bundle.localization.packageText);
  const { translated, translatedNotes } = packageTextProjection(bundle, actors, request, bundle.localization.packageText);
  const nameFor = (actorKey: string, original: string) => {
    const actor = actors.find(entry => entry.key === actorKey);
    const mapping: LocalizedItemName[] = (actor?.artifact as any)?.flags?.fvttJsonGenerator?.localization?.itemNames ?? [];
    const matches = mapping.filter(entry => entry.source === original);
    if (matches.length !== 1) throw new TypeError(`中文控制配置无法唯一绑定能力：${original}`);
    assertFixedMacroBindingLength(matches[0]!.display);
    return matches[0]!.display;
  };
  const reviewFindings: string[] = [];
  const macros = bundle.macros.flatMap(macro => {
    try {
      const config = readFixedEncounterConfiguration(macro.command);
      if (!config) throw new TypeError('中文模式只支持工具编译的固定控制入口，不能改写任意宏。');
      const localized = { ...config, rules: config.rules.map(rule => ({ ...rule,
        itemName: nameFor(rule.actorKey, rule.itemName),
        parameters: rule.kind === 'gm-activity-lock'
          ? { ...rule.parameters, activityItemNames: (rule.parameters.activityItemNames as string[]).map(name => nameFor(rule.actorKey, name)) }
          : rule.parameters,
      })) };
      const command = fixedEncounterCommand(localized);
      return [{ ...macro, name: translated(`${macro.key}:name`, macro.name), notes: translatedNotes(macro), command, commandHash: hashSource(command) }];
    } catch (error) {
      reviewFindings.push(macroProjectionFinding(macro, error));
      return [];
    }
  });
  return { label: translated('label', bundle.label), macros, reviewFindings };
}

function retainedActorMacroPresentation(bundle: ForgeEncounterPackage, actors: readonly (EncounterFactActor & { key: string })[]) {
  const localizedActors = new Map(actors.filter(actor => actor.artifact?.flags?.fvttJsonGenerator?.localization)
    .map(actor => [actor.key, actor.artifact]));
  const reviewFindings: string[] = [];
  if (!localizedActors.size) return { label: bundle.label, macros: bundle.macros, reviewFindings };
  const macros = bundle.macros.flatMap(macro => {
    try {
      const config = readFixedEncounterConfiguration(macro.command);
      if (config) for (const rule of config.rules) {
        const actor = localizedActors.get(rule.actorKey);
        if (!actor) continue;
        const items = Array.isArray(actor.items) ? actor.items : [];
        const names = rule.kind === 'gm-activity-lock' ? [rule.itemName, ...(rule.parameters.activityItemNames as string[])] : [rule.itemName];
        for (const name of names) {
          if (items.filter((item: { name?: unknown }) => item.name === name).length !== 1)
            throw new TypeError(`固定控制配置无法唯一绑定当前 Actor 能力：${name}`);
          assertFixedMacroBindingLength(name);
        }
      }
      return [macro];
    } catch (error) {
      reviewFindings.push(macroProjectionFinding(macro, error));
      return [];
    }
  });
  return { label: bundle.label, macros, reviewFindings };
}

function assertFixedMacroBindingLength(name: string): void {
  // The fixed Foundry runtime accepts 256-character bindings; never truncate identity.
  if (name.length > 256) throw new TypeError('双语能力标题超过固定控制器的256字符上限；请缩短中文译名并重新审核。');
}

function macroProjectionFinding(macro: ForgeEncounterPackageMacro, error: unknown): string {
  return `${macro.name}（${macro.key}）：${error instanceof Error ? error.message : String(error)}；宏未准备，Actor 和原宏记录保留。`;
}

function packageTextProjection(bundle: ForgeEncounterPackage, actors: readonly EncounterFactActor[],
  request: LocalizationRequest, draft: LocalizationDraft) {
  const ids = new Set(request.texts.map(field => field.id));
  const policy = request.policy;
  const matchingFields=(policy === FACT_LOCALIZATION_POLICY ? [packageFields(bundle,true,true,policy,actors)]
    : [packageFields(bundle,false),packageFields(bundle,true,false),packageFields(bundle,true)])
    .find(candidate=>candidate.every(field=>ids.has(field.id)));
  if(!matchingFields)throw new TypeError('中文包级显示字段与原审核身份不一致。');
  const fields = new Map(matchingFields.map(field => [field.key, field]));
  const translations = new Map(draft.texts.map(text => [text.id, text.text]));
  const translated = (key: string, fallback: string) => {
    const field = fields.get(key); if (!field) return fallback;
    const text = translations.get(field.id)!;
    if (field.kind !== 'title') return text;
    const policy = request.policy;
    // v1 package labels used the full source, including existing Chinese prefixes.
    return policy === LEGACY_LOCALIZATION_POLICY ? `${text}（${field.source}）` : formatReviewedTitle(field.source, text, policy);
  };
  const translatedNotes = (macro: ForgeEncounterPackageMacro): string => policy === FACT_LOCALIZATION_POLICY
    ? encounterFactNoteParts(displayRuleReferences(sourceBundle(bundle), macro), actors)
      .map((part, index) => part.fixedZh ?? translated(`${macro.key}:notes:${index}`, part.source)).join('\n')
    : translated(`${macro.key}:notes`, proseNotes(macro.notes));
  return { fields, translated, translatedNotes };
}

/** Complete package prose uses the same local assembler as final readback; no approval is manufactured. */
export function previewEncounterTextRows(bundle: ForgeEncounterPackage, actors: readonly EncounterFactActor[],
  draft: LocalizationDraft, policy: LocalizationPolicy): ActorLocalizationDisplayRow[] {
  const request = createEncounterTextRequest(bundle, actors, policy);
  const checked = validateLocalizationDraft(request, draft);
  const { fields, translated, translatedNotes } = packageTextProjection(bundle, actors, request, checked);
  const texts = new Map(checked.texts.map(entry => [entry.id, entry.text]));
  const titleRow = (key: string, source: string): ActorLocalizationDisplayRow => {
    const field = fields.get(key);
    return { path: key, fullSource: source, assembledZh: translated(key, source), fixedBlocks: [], uncoveredMechanics: [],
      editableSlots: field ? [{ textId: field.id, source: field.source, draft: texts.get(field.id)!, review: 'normal' }] : [] };
  };
  return [titleRow('label', bundle.label), ...bundle.macros.flatMap(macro => {
    const source = proseNotes(macro.notes);
    const parts: EncounterNotePart[] = policy === FACT_LOCALIZATION_POLICY
      ? encounterFactNoteParts(displayRuleReferences(sourceBundle(bundle), macro), actors) : [{ source }];
    const noteRow: ActorLocalizationDisplayRow = { path: `${macro.key}:notes`, fullSource: source,
      assembledZh: translatedNotes(macro), uncoveredMechanics: [],
      fixedBlocks: parts.flatMap((part, index) => part.fixedZh === undefined ? [] : [{ source: part.source, zh: part.fixedZh,
        factRefs: [`package/${macro.key}/notes/${index}`], executionMode: 'gm-assisted' as const }]),
      editableSlots: parts.flatMap((part, index) => {
        const field = fields.get(policy === FACT_LOCALIZATION_POLICY ? `${macro.key}:notes:${index}` : `${macro.key}:notes`);
        return field ? [{ textId: field.id, source: part.source, draft: texts.get(field.id)!, review: 'gm-assisted' as const }] : [];
      }),
    };
    return [titleRow(`${macro.key}:name`, macro.name), ...(source ? [noteRow] : [])];
  })];
}
