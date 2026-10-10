import { assertReviewedLocalization, localizationHash, localizationRequest, localizationText, LOCALIZATION_POLICY, LEGACY_LOCALIZATION_POLICY, type LocalizationPolicy, type EncounterLocalization, type LocalizationRequest } from '@fvtt-json-generator/contracts/localization';
import { formatReviewedTitle, reviewedTitleChinese, type LocalizedItemName } from '@fvtt-json-generator/generation/reviewed-localization';
import { fixedEncounterCommand, readFixedEncounterConfiguration } from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { serializeForgeEncounterPackage, type ForgeEncounterPackage, type ForgeEncounterPackageMacro } from './encounterPackage';
import { ParserFactory } from '@fvtt-json-generator/parser/router';

function sourceBundle(bundle: ForgeEncounterPackage): ForgeEncounterPackage {
  const { localization: _localization, ...source } = bundle;
  return { ...source, id: bundle.localization?.sourcePackageId ?? bundle.id };
}
function proseNotes(notes: string): string { return notes.replace(/^原始(?:资料|来源)SHA-256：[^\r\n]*(?:\r?\n|$)/gmu, '').trim(); }
function packageFields(bundle: ForgeEncounterPackage) {
  return [
    { key: 'label', ...localizationText('title', bundle.label) },
    ...bundle.macros.flatMap(macro => [
      { key: `${macro.key}:name`, ...localizationText('title', macro.name) },
      ...(proseNotes(macro.notes) ? [{ key: `${macro.key}:notes`, ...localizationText('body', proseNotes(macro.notes)) }] : []),
    ]),
  ].filter(field => /[A-Za-z]/u.test(field.source.replace(/\b(?:GM|DC|HP|AC|CR|D20)\b|\d+d\d+/giu, '')));
}
export function createEncounterTextRequest(bundle: ForgeEncounterPackage, actors: readonly { artifact: any }[] = [], policy: LocalizationPolicy = LOCALIZATION_POLICY): LocalizationRequest {
  const original = sourceBundle(bundle);
  const request = localizationRequest(hashSource(serializeForgeEncounterPackage(original)),
    [...new Map(packageFields(original).map(({ key: _key, ...text }) => [text.id, text])).values()], policy);
  const names = actors.flatMap(({ artifact }) => {
    const localized = artifact?.flags?.fvttJsonGenerator?.localization;
    return localized ? [{ english: localized.sourceName, chinese: reviewedTitleChinese(artifact.name, localized.sourceName, localized.policy) },
      ...(localized.itemNames as LocalizedItemName[]).map(item => ({ english: item.source, chinese: reviewedTitleChinese(item.display, item.source, localized.policy) }))] : [];
  });
  if (names.length) request.nameGlossary = [...new Map(names.map(name => [name.english, name])).values()];
  request.sourceRuleContext = original.actors.flatMap(actor => {
    const parsed = new ParserFactory().parse(actor.source);
    const rules = Object.entries(parsed.structuredActions ?? {}).flatMap(([section, entries]) =>
      (entries ?? []).flatMap(entry => typeof entry.describe === 'string'
        ? [{ actor: actor.key, section, name: entry.name, description: entry.describe }] : []));
    return rules.length ? rules : [{ actor: actor.key, section: 'source', name: actor.label, description: actor.source }];
  });
  return request;
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
export function localizedEncounterPresentation(bundle: ForgeEncounterPackage, actors: readonly { key: string; artifact: unknown }[]): { label: string; macros: readonly ForgeEncounterPackageMacro[] } {
  if (!bundle.localization) return { label: bundle.label, macros: bundle.macros };
  assertEncounterLocalizationIdentity(bundle);
  assertReviewedLocalization(createEncounterTextRequest(bundle, actors, bundle.localization.packageText.policy), bundle.localization.packageText);
  const fields = new Map(packageFields(bundle).map(field => [field.key, field]));
  const translations = new Map(bundle.localization.packageText.texts.map(text => [text.id, text.text]));
  const translated = (key: string, fallback: string) => {
    const field = fields.get(key); if (!field) return fallback;
    const text = translations.get(field.id)!;
    if (field.kind !== 'title') return text;
    const policy = bundle.localization!.packageText.policy;
    // v1 package labels used the full source, including existing Chinese prefixes.
    return policy === LEGACY_LOCALIZATION_POLICY ? `${text}（${field.source}）` : formatReviewedTitle(field.source, text, policy);
  };
  const nameFor = (actorKey: string, original: string) => {
    const actor = actors.find(entry => entry.key === actorKey);
    const mapping: LocalizedItemName[] = (actor?.artifact as any)?.flags?.fvttJsonGenerator?.localization?.itemNames ?? [];
    const matches = mapping.filter(entry => entry.source === original);
    if (matches.length !== 1) throw new TypeError(`中文控制配置无法唯一绑定能力：${original}`);
    // The fixed Foundry runtime accepts 256-character bindings; fail before import, never truncate identity.
    if (matches[0]!.display.length > 256) throw new TypeError('双语能力标题超过固定控制器的256字符上限；请缩短中文译名并重新审核。');
    return matches[0]!.display;
  };
  const macros = bundle.macros.map(macro => {
    const config = readFixedEncounterConfiguration(macro.command);
    if (!config) throw new TypeError('中文模式只支持工具编译的固定控制入口，不能改写任意宏。');
    const localized = { ...config, rules: config.rules.map(rule => ({ ...rule,
      itemName: nameFor(rule.actorKey, rule.itemName),
      parameters: rule.kind === 'gm-activity-lock'
        ? { ...rule.parameters, activityItemNames: (rule.parameters.activityItemNames as string[]).map(name => nameFor(rule.actorKey, name)) }
        : rule.parameters,
    })) };
    const command = fixedEncounterCommand(localized);
    return { ...macro, name: translated(`${macro.key}:name`, macro.name), notes: translated(`${macro.key}:notes`, proseNotes(macro.notes)), command, commandHash: hashSource(command) };
  });
  return { label: translated('label', bundle.label), macros };
}
