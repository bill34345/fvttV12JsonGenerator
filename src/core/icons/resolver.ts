import { overrideSelectorKey } from './resources';
import type {
  IconCandidate,
  IconResolution,
  IconReviewEntry,
  IconReviewReport,
  V14IconCatalog,
  V14IconCatalogEntry,
  V14IconOverrideEntry,
  V14IconOverrideFile,
} from './types';

const PLACEHOLDER_PATHS = new Set([
  '',
  'icons/svg/mystery-man.svg',
  'icons/svg/sword.svg',
  'icons/svg/item-bag.svg',
]);

const PACK_PRIORITY = new Map([
  ['dnd5e.monsterfeatures24', 0],
  ['dnd5e.monsterfeatures', 1],
  ['dnd5e.items', 2],
  ['dnd5e.spells', 3],
]);

const DAMAGE_TAGS = new Set([
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
]);

const CHINESE_ALIASES: Record<string, string[]> = {
  飞行: ['fly', 'flying', 'wings'],
  飞掠: ['flyby', 'wings'],
  多重攻击: ['multiattack', 'multiple', 'strike', 'weapons'],
  触须: ['tentacle', 'tentacles'],
  匕首: ['dagger'],
  魔法: ['magic', 'spell'],
  火焰: ['fire', 'flame'],
  闪电: ['lightning', 'electric'],
  雷鸣: ['thunder', 'sonic'],
  心灵: ['psychic', 'mind'],
  毒: ['poison', 'venom'],
  冰: ['cold', 'ice', 'frost'],
  光耀: ['radiant', 'light'],
  黯蚀: ['necrotic', 'death'],
};

export interface V14IconResolverOptions {
  catalog: V14IconCatalog;
  overrides: V14IconOverrideFile;
  review: IconReviewEntry[];
}

interface ItemContext {
  actorName?: string;
}

export class V14IconResolver {
  private readonly filePaths: Set<string>;

  public constructor(private readonly options: V14IconResolverOptions) {
    this.filePaths = new Set(options.catalog.files.map((entry) => entry.path));
  }

  public resolveActor(actor: Record<string, any>): void {
    if (!Array.isArray(actor.items)) return;
    for (const item of actor.items) {
      this.resolveItem(item, { actorName: typeof actor.name === 'string' ? actor.name : undefined });
    }
  }

  public resolveStandaloneItem(item: Record<string, any>): void {
    this.resolveItem(item, {});
  }

  private resolveItem(item: Record<string, any>, context: ItemContext): void {
    if (!item || typeof item !== 'object') return;
    const itemName = typeof item.name === 'string' ? item.name.trim() : '';
    const itemType = typeof item.type === 'string' ? item.type.trim() : '';
    if (!itemName || !itemType) return;
    const previousPath = typeof item.img === 'string' ? item.img : '';
    const names = splitDisplayName(itemName);
    const resolution = this.resolve({
      actorName: context.actorName,
      itemName: names.displayName,
      englishName: names.englishName,
      itemType,
      previousPath,
      item,
    });
    item.img = resolution.selectedPath;
    this.options.review.push({
      ...(context.actorName ? { actorName: context.actorName } : {}),
      itemName: names.displayName,
      ...(names.englishName ? { englishName: names.englishName } : {}),
      itemType,
      previousPath,
      selectedPath: resolution.selectedPath,
      source: resolution.source,
      confidence: resolution.confidence,
      reasons: resolution.reasons,
      alternatives: resolution.alternatives,
      ...(resolution.overrideKey ? { overrideKey: resolution.overrideKey } : {}),
    });
  }

  private resolve(input: {
    actorName?: string;
    itemName: string;
    englishName?: string;
    itemType: string;
    previousPath: string;
    item: Record<string, any>;
  }): IconResolution {
    const override = this.findOverride(input);
    if (override) {
      return {
        selectedPath: override.entry.img,
        source: 'override',
        confidence: 'exact',
        reasons: [`Matched ${override.scope} override selector.`],
        alternatives: [],
        overrideKey: overrideSelectorKey(override.entry.selector),
      };
    }

    if (!PLACEHOLDER_PATHS.has(input.previousPath) && this.filePaths.has(input.previousPath)) {
      return {
        selectedPath: input.previousPath,
        source: 'existing',
        confidence: 'exact',
        reasons: ['Preserved existing non-placeholder core/dnd5e artwork.'],
        alternatives: [],
      };
    }

    const exact = this.findExactCompendium(input);
    if (exact) {
      return {
        selectedPath: exact.img,
        source: 'compendium-exact',
        confidence: 'exact',
        reasons: exact.reasons,
        alternatives: exact.alternatives,
      };
    }

    const semanticCandidates = this.rankSemanticCandidates(input);
    const best = semanticCandidates[0];
    const second = semanticCandidates[1];
    if (
      best
      && best.score >= 70
      && best.score - (second?.score ?? 0) >= 15
      && best.reasons.some((reason) => reason.startsWith('lexical:'))
      && best.reasons.some((reason) => reason.startsWith('structured:'))
    ) {
      return {
        selectedPath: best.path,
        source: 'semantic',
        confidence: 'high',
        reasons: best.reasons,
        alternatives: semanticCandidates.slice(0, 3),
      };
    }

    const fallback = this.options.catalog.typeDefaults[input.itemType]
      ?? this.options.catalog.typeDefaults.feat
      ?? 'systems/dnd5e/icons/svg/items/feature.svg';
    return {
      selectedPath: fallback,
      source: 'type-default',
      confidence: 'fallback',
      reasons: best
        ? [`Top candidate did not meet safe threshold/margin (${best.score}/${best.score - (second?.score ?? 0)}).`]
        : ['No same-type semantic candidate was available.'],
      alternatives: semanticCandidates.slice(0, 3),
    };
  }

  private findOverride(input: {
    actorName?: string;
    itemName: string;
    englishName?: string;
    itemType: string;
  }): { entry: V14IconOverrideEntry; scope: 'actor-scoped' | 'global' } | undefined {
    const actorNames = splitDisplayName(input.actorName ?? '');
    const matches = this.options.overrides.entries
      .map((entry) => {
        const selector = entry.selector;
        if (selector.itemType !== input.itemType) return undefined;
        const itemMatches = selector.englishName
          ? normalizeName(selector.englishName) === normalizeName(input.englishName ?? '')
          : normalizeName(selector.name ?? '') === normalizeName(input.itemName);
        if (!itemMatches) return undefined;
        const actorScoped = Boolean(selector.actorEnglishName || selector.actorName);
        const actorMatches = selector.actorEnglishName
          ? normalizeName(selector.actorEnglishName) === normalizeName(actorNames.englishName ?? '')
          : selector.actorName
            ? normalizeName(selector.actorName) === normalizeName(actorNames.displayName)
            : true;
        if (!actorMatches) return undefined;
        const specificity =
          (actorScoped ? 100 : 0)
          + (selector.englishName ? 10 : 0)
          + (selector.actorEnglishName ? 1 : 0);
        return { entry, scope: actorScoped ? 'actor-scoped' as const : 'global' as const, specificity };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((left, right) => right.specificity - left.specificity);
    return matches[0];
  }

  private findExactCompendium(input: {
    itemName: string;
    englishName?: string;
    itemType: string;
    item: Record<string, any>;
  }): { img: string; reasons: string[]; alternatives: IconCandidate[] } | undefined {
    const names = new Set(
      [input.englishName, input.itemName]
        .filter((value): value is string => Boolean(value))
        .map(normalizeName),
    );
    const identifiers = new Set([...names].map(slugify));
    const sameTypeMatches = this.options.catalog.compendium
      .filter((entry) => entry.type === input.itemType)
      .filter((entry) => names.has(normalizeName(entry.name)) || (entry.identifier && identifiers.has(slugify(entry.identifier))))
      .sort(compareCatalogEntries);
    const spellBridge = sameTypeMatches.length === 0 && isSpellLikeItem(input.item)
      ? this.options.catalog.compendium
          .filter((entry) => entry.type === 'spell')
          .filter((entry) =>
            names.has(normalizeName(entry.name))
            || (entry.identifier && identifiers.has(slugify(entry.identifier))))
          .sort(compareCatalogEntries)
      : [];
    const matches = sameTypeMatches.length > 0 ? sameTypeMatches : spellBridge;
    const selected = matches[0];
    if (!selected) return undefined;
    return {
      img: selected.img,
      reasons: [
        selected.type === input.itemType
          ? `Exact same-type Compendium match: ${selected.pack}#${selected.id}.`
          : `Exact spell Compendium match for a source-structured spell attack/cast: ${selected.pack}#${selected.id}.`,
        selected.rules ? `Rules priority: ${selected.rules}.` : 'Stable pack priority applied.',
      ],
      alternatives: matches.slice(0, 3).map((entry) => ({
        path: entry.img,
        name: entry.name,
        source: entry.pack,
        score: 100,
        reasons: ['exact same-type name or identifier'],
      })),
    };
  }

  private rankSemanticCandidates(input: {
    itemName: string;
    englishName?: string;
    itemType: string;
    item: Record<string, any>;
  }): IconCandidate[] {
    const lexical = lexicalSignals(input.itemName, input.englishName);
    const structured = structuredSignals(input.item);
    return this.options.catalog.compendium
      .filter((entry) => entry.type === input.itemType)
      .map((entry) => scoreCandidate(entry, lexical, structured))
      .filter((entry) => entry.score > 20)
      .sort((left, right) =>
        right.score - left.score
        || compareText(left.source, right.source)
        || compareText(left.name, right.name)
        || compareText(left.path, right.path),
      );
  }
}

function isSpellLikeItem(item: Record<string, any>): boolean {
  if (item.type === 'spell') return true;
  const activities = item.system?.activities;
  if (!activities || typeof activities !== 'object') return false;
  return Object.values(activities).some((activity: any) => {
    if (activity?.type === 'cast') return true;
    const attackType = activity?.attack?.type?.value;
    return attackType === 'msak' || attackType === 'rsak';
  });
}

export function createIconReviewReport(
  catalog: V14IconCatalog,
  entries: IconReviewEntry[],
): IconReviewReport {
  const sorted = [...entries].sort((left, right) =>
    compareText(left.actorName ?? '', right.actorName ?? '')
    || compareText(left.itemType, right.itemType)
    || compareText(left.englishName ?? left.itemName, right.englishName ?? right.itemName),
  );
  return {
    schemaVersion: 1,
    target: catalog.target,
    mode: 'safe',
    entries: sorted,
    summary: {
      total: sorted.length,
      override: sorted.filter((entry) => entry.source === 'override').length,
      existing: sorted.filter((entry) => entry.source === 'existing').length,
      exact: sorted.filter((entry) => entry.source === 'compendium-exact').length,
      semantic: sorted.filter((entry) => entry.source === 'semantic').length,
      fallback: sorted.filter((entry) => entry.source === 'type-default').length,
    },
  };
}

function compareCatalogEntries(left: V14IconCatalogEntry, right: V14IconCatalogEntry): number {
  return (PACK_PRIORITY.get(left.pack) ?? left.packPriority)
    - (PACK_PRIORITY.get(right.pack) ?? right.packPriority)
    || compareText(left.name, right.name)
    || compareText(left.id, right.id);
}

function scoreCandidate(
  entry: V14IconCatalogEntry,
  lexical: Set<string>,
  structured: Set<string>,
): IconCandidate {
  const candidateTokens = new Set(entry.tokens);
  const overlap = [...lexical].filter((token) => candidateTokens.has(token));
  const union = new Set([...lexical, ...candidateTokens]);
  const jaccard = union.size ? overlap.length / union.size : 0;
  const reasons: string[] = [];
  let score = 20;
  if (overlap.length) {
    const lexicalScore = overlap.length === lexical.size
      ? 40
      : Math.round(jaccard * 35);
    score += lexicalScore;
    reasons.push(`lexical: ${overlap.join(', ')} (+${lexicalScore})`);
  }
  const structuredOverlap = [...structured].filter((token) => candidateTokens.has(token));
  if (structuredOverlap.length) {
    const structuredScore = Math.min(25, structuredOverlap.length * 10);
    score += structuredScore;
    reasons.push(`structured: ${structuredOverlap.join(', ')} (+${structuredScore})`);
  }
  return {
    path: entry.img,
    name: entry.name,
    source: entry.pack,
    score,
    reasons,
  };
}

function lexicalSignals(itemName: string, englishName?: string): Set<string> {
  const raw = englishName || itemName;
  const signals = new Set(tokenize(raw));
  if (!englishName) {
    for (const [chinese, aliases] of Object.entries(CHINESE_ALIASES)) {
      if (itemName.includes(chinese)) aliases.forEach((alias) => signals.add(alias));
    }
  }
  return signals;
}

function structuredSignals(item: Record<string, any>): Set<string> {
  const signals = new Set<string>();
  const activities = item.system?.activities;
  if (activities && typeof activities === 'object') {
    for (const activity of Object.values(activities) as Array<Record<string, any>>) {
      const type = typeof activity?.type === 'string' ? activity.type.toLowerCase() : '';
      if (type) signals.add(type);
      collectDamageSignals(activity?.damage, signals);
      const saveAbility = activity?.save?.ability;
      if (typeof saveAbility === 'string' && saveAbility) signals.add('save');
    }
  }
  collectDamageSignals(item.system?.damage, signals);
  if (item.type === 'weapon') {
    signals.add('weapon');
    const range = item.system?.range;
    if (Number(range?.reach) > 0) signals.add('melee');
    if (Number(range?.value) > 0) signals.add('ranged');
  }
  return signals;
}

function collectDamageSignals(value: unknown, signals: Set<string>): void {
  const queue: unknown[] = [value];
  while (queue.length) {
    const current = queue.pop();
    if (Array.isArray(current)) {
      queue.push(...current);
    } else if (current && typeof current === 'object') {
      queue.push(...Object.values(current as Record<string, unknown>));
    } else if (typeof current === 'string') {
      for (const token of tokenize(current)) {
        if (DAMAGE_TAGS.has(token)) signals.add(token);
      }
    }
  }
}

export function splitDisplayName(value: string): { displayName: string; englishName?: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)\s*[（(]([^()（）]+)[）)]\s*$/u);
  if (!match?.[1] || !match[2] || !/[A-Za-z]/u.test(match[2])) {
    return { displayName: trimmed };
  }
  return { displayName: match[1].trim(), englishName: match[2].trim() };
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function tokenize(value: string): string[] {
  return normalizeName(value)
    .split(' ')
    .filter((token) => token.length > 1);
}

function slugify(value: string): string {
  return normalizeName(value).replace(/\s+/gu, '-');
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}
