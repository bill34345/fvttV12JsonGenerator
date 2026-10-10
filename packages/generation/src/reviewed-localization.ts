import {
  assertReviewedLocalization, localizationHash, localizationRequest, localizationText,
  LEGACY_LOCALIZATION_POLICY, LOCALIZATION_POLICY,
  type LocalizationPolicy, type LocalizationRequest, type LocalizationText, type ReviewedLocalization,
} from '@fvtt-json-generator/contracts/localization';

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

/** Schema-derived display allowlist. Evidence, status IDs, paths and numeric mechanics are excluded. */
function actorFields(actor: any): Field[] {
  const fields: Field[] = [];
  const add = (path: Path, kind: LocalizationText['kind'] = 'body') => {
    const value = read(actor, path);
    // The full source definition remains in flags/review. Internal marker IDs are not GM prose.
    const display = typeof value === 'string' && kind === 'body'
      ? value.replace(/^条件：encounter-(?:staged|manual)[^\n]*(?:\n|$)/gmu, '') : value;
    if (typeof display === 'string' && display.trim() && needsTranslation(display)) fields.push({ path, text: localizationText(kind, display) });
  };
  add(['name'], 'title');
  add(['system', 'details', 'biography', 'value']);
  add(['system', 'details', 'alignment']);
  add(['system', 'details', 'type', 'subtype']);
  add(['system', 'details', 'type', 'custom']);
  add(['system', 'attributes', 'senses', 'special']);
  add(['system', 'traits', 'languages', 'custom']);
  const effects = (values: any[], prefix: Path) => (values ?? []).forEach((_effect, index) => {
    add([...prefix, index, 'name'], 'title'); add([...prefix, index, 'description']);
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

export function createActorLocalizationRequest(actor: any, sourceIdentity: string, policy: LocalizationPolicy = LOCALIZATION_POLICY): LocalizationRequest {
  const texts = [...new Map(actorFields(actor).map(field => [field.text.id, field.text])).values()];
  // Forge attaches a transport UUID before parsing; it is not part of the source's language or rules.
  const source = sourceIdentity.replace(/^forge-source-id:[^\r\n]*(?:\r?\n|$)/gmu, '');
  return localizationRequest(localizationHash({ source, target: actor._stats?.systemVersion, core: actor._stats?.coreVersion }), texts, policy);
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
  return (policy === LOCALIZATION_POLICY ? spacedBilingual?.[1] : undefined)
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

/** Apply only freshly enumerated display slots after source generation. No supplied JSON paths are followed. */
export function projectReviewedActorLocalization(actor: any, sourceIdentity: string, input: ReviewedLocalization): ActorLocalizationResult {
  const request = createActorLocalizationRequest(actor, sourceIdentity, input.policy);
  const reviewed = assertReviewedLocalization(request, input);
  const translated = new Map(reviewed.texts.map(entry => [entry.id, entry.text]));
  const output = structuredClone(actor);
  for (const field of actorFields(actor)) {
    const text = translated.get(field.text.id)!;
    write(output, field.path, field.text.kind === 'title' ? formatReviewedTitle(field.text.source,text,reviewed.policy) : text);
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
    version: 1, language: reviewed.language, policy: reviewed.policy, terminology: reviewed.terminology,
    requestHash: reviewed.requestHash, translationHash: reviewed.review.translationHash,
    sourceName: actor.name, itemNames,
  };
  return { actor: output, itemNames, request };
}
