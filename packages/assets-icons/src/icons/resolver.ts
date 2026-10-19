import { overrideSelectorKey } from './selectors';
import { CONTENT_VISUAL_PATHS, matchContentVisualFamily } from './contentVisuals';
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

// These are visual forms, not rules. Every path is checked against the locked catalog
// before it can replace an Item image.
const VISUAL_FAMILY_PATHS = {
  ...CONTENT_VISUAL_PATHS,
  claw: 'icons/creatures/claws/claw-curved-jagged-gray.webp',
  bite: 'icons/creatures/abilities/fangs-teeth-bite.webp',
  tail: 'icons/creatures/abilities/tail-swipe-green.webp',
  breath: 'icons/creatures/abilities/dragon-breath-purple.webp',
  fireBreath: 'icons/creatures/abilities/dragon-fire-breath-orange.webp',
  coldBreath: 'icons/creatures/abilities/dragon-ice-breath-blue.webp',
  fireProjectile: 'icons/magic/fire/projectile-fireball-orange.webp',
  coldProjectile: 'icons/magic/water/projectile-ice-orb-white.webp',
  physicalProjectile: 'icons/skills/ranged/arrow-barbed-flying-gray.webp',
  healing: 'icons/magic/life/heart-hand-gold-green.webp',
  fireDamage: 'icons/magic/fire/orb-vortex.webp',
  coldDamage: 'icons/magic/water/orb-ice-glow.webp',
  lightningDamage: 'icons/magic/lightning/bolt-blue.webp',
  acidDamage: 'icons/magic/acid/projectile-faceted-glob.webp',
  poisonDamage: 'icons/magic/death/skull-poison-green.webp',
  psychicDamage: 'icons/commodities/biological/organ-brain-pink-purple.webp',
  radiantDamage: 'icons/magic/light/explosion-star-glow-yellow.webp',
  necroticDamage: 'icons/magic/death/hand-withered-gray.webp',
  thunderDamage: 'icons/magic/sonic/explosion-shock-sound-wave.webp',
  forceDamage: 'systems/dnd5e/icons/svg/damage/force.svg',
} as const;

type VisualFamily = keyof typeof VISUAL_FAMILY_PATHS;

const DAMAGE_VISUAL_FAMILIES: Partial<Record<string, VisualFamily>> = {
  fire: 'fireDamage',
  cold: 'coldDamage',
  lightning: 'lightningDamage',
  acid: 'acidDamage',
  poison: 'poisonDamage',
  psychic: 'psychicDamage',
  radiant: 'radiantDamage',
  necrotic: 'necroticDamage',
  thunder: 'thunderDamage',
  force: 'forceDamage',
};

interface VisualFamilyMatch {
  family: VisualFamily;
  reason: string;
}

export interface V14IconResolverOptions {
  catalog: V14IconCatalog;
  overrides: V14IconOverrideFile;
  review: IconReviewEntry[];
  /** Internal Forge session choice; the CLI/Web safe resolver remains conservative. */
  fuzzyContent?: boolean;
}

const FUNCTIONAL_CATEGORY_PATHS = {
  attack: 'icons/skills/melee/strike-weapons-orange.webp',
  defense: 'icons/magic/defensive/armor-shield-barrier-steel.webp',
  movement: 'icons/magic/movement/portal-vortex-orange.webp',
  darkness: 'icons/magic/light/orb-shadow-blue.webp',
  perception: 'icons/magic/perception/eye-ringed-glow-angry-large-teal.webp',
  flight: 'icons/creatures/abilities/wings-birdlike-blue.webp',
  magic: 'icons/magic/symbols/runes-star-blue.webp',
  passive: 'icons/magic/symbols/cog-glowing-green.webp',
} as const;

type FunctionalCategory = keyof typeof FUNCTIONAL_CATEGORY_PATHS;

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
      item: this.options.fuzzyContent ? sourceSemanticItem(item) : item,
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
    this.resolveActivities(item, context, names.displayName, itemType, resolution);
  }

  private resolveActivities(
    item: Record<string, any>,
    context: ItemContext,
    itemName: string,
    itemType: string,
    itemResolution: IconResolution,
  ): void {
    const activities = item.system?.activities;
    if (!activities || typeof activities !== 'object' || Array.isArray(activities)) return;
    const entries = Object.entries(activities);
    for (const [activityId, activity] of entries) {
      if (!activity || typeof activity !== 'object' || Array.isArray(activity)) continue;
      const activityData = activity as Record<string, any>;
      const previousPath = typeof activityData.img === 'string' ? activityData.img : '';
      const activityName = typeof activityData.name === 'string' ? activityData.name.trim() : '';
      const names = splitDisplayName(activityName);
      const candidate = this.resolve({
        actorName: context.actorName,
        itemName: names.displayName,
        englishName: names.englishName,
        itemType,
        previousPath,
        activityContext: true,
        item: {
          type: itemType,
          ...(entries.length === 1 && manualSourceDescription(item) ? {flags: item.flags} : {}),
          system: {
            activities: { [activityId]: activityData },
            range: item.system?.range,
            ...(activityData.damage?.includeBase === true ? { damage: itemBaseDamage(item.system?.damage) } : {}),
            ...(this.options.fuzzyContent ? { description: {
              value: (entries.length === 1 ? manualSourceDescription(item) : undefined)
                ?? activityData.description?.value
                ?? activityData.description?.chatFlavor
                ?? (entries.length === 1 ? item.system?.description?.value : undefined),
            } } : {}),
          },
        },
      });
      const resolution = candidate.source === 'type-default'
        || (this.options.fuzzyContent && candidate.reasons[0]?.startsWith('functional-category: passive')
          && !parentIconUsesBaseDamage(itemResolution, activityData))
        || (this.options.fuzzyContent && !activityName && !activityData.damage?.parts?.length
          && candidate.reasons[0]?.startsWith('functional-category: attack')
          && itemResolution.reasons[0]?.startsWith('visual-family:')
          && !parentIconUsesBaseDamage(itemResolution, activityData))
        ? inheritItemIcon(item.img, itemResolution)
        : candidate;
      activityData.img = resolution.selectedPath;
      this.options.review.push({
        ...(context.actorName ? { actorName: context.actorName } : {}),
        itemName: `${itemName} / ${names.displayName || 'Activity'} [${activityId}]`,
        itemType,
        previousPath,
        selectedPath: resolution.selectedPath,
        source: resolution.source,
        confidence: resolution.confidence,
        reasons: [`Activity ${activityId}.`, ...resolution.reasons],
        alternatives: resolution.alternatives,
        ...(resolution.overrideKey ? { overrideKey: resolution.overrideKey } : {}),
      });
    }
  }

  private resolve(input: {
    actorName?: string;
    itemName: string;
    englishName?: string;
    itemType: string;
    previousPath: string;
    activityContext?: boolean;
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

    const genericPaths = new Set(Object.values(this.options.catalog.typeDefaults));
    if (!(this.options.fuzzyContent && manualSourceDescription(input.item)) && !PLACEHOLDER_PATHS.has(input.previousPath)
      && !(this.options.fuzzyContent && genericPaths.has(input.previousPath))
      && this.filePaths.has(input.previousPath)) {
      return {
        selectedPath: input.previousPath,
        source: 'existing',
        confidence: 'exact',
        reasons: ['Preserved existing non-placeholder core/dnd5e artwork.'],
        alternatives: [],
      };
    }

    const visualFamily = matchVisualFamily(input);
    if (this.options.fuzzyContent) {
      if (visualFamily && visualFamily !== 'ambiguous') {
        const visual = this.resolveVisualFamily(visualFamily);
        if (!visual) throw new Error(`Icon visual-family asset unavailable in verified catalog: ${visualFamily.family}`);
        return visual;
      }
      const exact = visualFamily === 'ambiguous' ? undefined : this.findExactCompendium(input);
      if (exact && this.filePaths.has(exact.img) && !genericPaths.has(exact.img)) {
        return { selectedPath: exact.img, source: 'compendium-exact', confidence: 'exact', reasons: exact.reasons, alternatives: exact.alternatives };
      }
      const category = functionalCategory(input);
      const candidates = visualFamily === 'ambiguous' ? [] : this.rankSemanticCandidates(input);
      const best = candidates.find((entry) => entry.reasons.some((reason) => reason.startsWith('lexical:'))
        && !genericPaths.has(entry.path));
      // Concrete mechanics and effect themes take precedence over a weak name overlap.
      if (category.category !== 'passive' || !best) return this.resolveCategory(category, candidates);
      return {
        selectedPath: best.path,
        source: 'semantic',
        confidence: 'fallback',
        reasons: [`Nearest catalog name: ${best.name}.`, ...best.reasons],
        alternatives: candidates.slice(0, 3),
      };
    }
    // The locked Compendium's singular Claw is a blood slash, while its Claws
    // entry depicts an actual claw. Preserve the explicit visual request here.
    if (visualFamily && visualFamily !== 'ambiguous' && ['claw', 'healing'].includes(visualFamily.family)) {
      const resolution = this.resolveVisualFamily(visualFamily);
      if (resolution) return resolution;
    }

    const exact = visualFamily === 'ambiguous' ? undefined : this.findExactCompendium(input);
    if (exact) {
      return {
        selectedPath: exact.img,
        source: 'compendium-exact',
        confidence: 'exact',
        reasons: exact.reasons,
        alternatives: exact.alternatives,
      };
    }


    if (visualFamily && visualFamily !== 'ambiguous') {
      const resolution = this.resolveVisualFamily(visualFamily);
      if (resolution) return resolution;
    }

    const semanticCandidates = visualFamily === 'ambiguous' ? [] : this.rankSemanticCandidates(input);
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

  private resolveVisualFamily(match: VisualFamilyMatch): IconResolution | undefined {
    const path = VISUAL_FAMILY_PATHS[match.family];
    if (!this.filePaths.has(path)) return undefined;
    return {
      selectedPath: path,
      source: 'semantic',
      confidence: 'high',
      reasons: [`visual-family: ${match.family}; ${match.reason}`],
      alternatives: [],
    };
  }

  private resolveCategory(match: { category: FunctionalCategory; reason: string }, alternatives: IconCandidate[]): IconResolution {
    const path = FUNCTIONAL_CATEGORY_PATHS[match.category];
    if (!this.filePaths.has(path)) throw new Error(`Icon functional-category asset unavailable in verified catalog: ${match.category}`);
    return {
      selectedPath: path,
      source: 'semantic',
      confidence: 'fallback',
      reasons: [`functional-category: ${match.category}; ${match.reason}`],
      alternatives: alternatives.slice(0, 3),
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
      .filter((entry) => entry.type === input.itemType && this.filePaths.has(entry.img))
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

function inheritItemIcon(path: string, parent: IconResolution): IconResolution {
  return {
    selectedPath: path,
    source: parent.source,
    confidence: 'fallback',
    reasons: [`No distinct activity artwork was established; inherited the Item ${parent.source} icon.`],
    alternatives: [],
    ...(parent.overrideKey ? { overrideKey: parent.overrideKey } : {}),
  };
}

function parentIconUsesBaseDamage(parent: IconResolution, activity: Record<string, any>): boolean {
  return activity.damage?.includeBase !== true
    && /^visual-family: (?:fire|cold|lightning|acid|poison|psychic|radiant|necrotic|thunder|force)Damage\b/u.test(parent.reasons[0] ?? '');
}

/** Generated GM instructions describe the handling boundary, not the ability.
 * Use the retained source rule for fuzzy visual selection without changing the
 * Item, Activity, rule marker or any mechanics. Conservative CLI/Web is unchanged. */
function manualSourceDescription(item: Record<string, any>): string | undefined {
  const marker = item.flags?.fvttJsonGenerator?.manualRule;
  return marker?.mode === 'gm-manual' && typeof marker.sourceText === 'string' && marker.sourceText.trim()
    ? marker.sourceText : undefined;
}
function sourceSemanticItem(item: Record<string, any>): Record<string, any> {
  const description = manualSourceDescription(item);
  return description === undefined ? item : { ...item, system: { ...item.system, description: { ...item.system?.description, value: description } } };
}

function functionalCategory(input: {
  itemName: string;
  englishName?: string;
  itemType: string;
  item: Record<string, any>;
}): { category: FunctionalCategory; reason: string } {
  const description = input.item.system?.description?.value;
  const body = typeof description === 'string'
    ? description.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, '').replace(/<[^>]*>/gu, ' ').replace(/[’‘]/gu,"'")
    : '';
  const text = `${input.itemName} ${input.englishName ?? ''} ${body}`.normalize('NFKC').toLowerCase();
  const activities = Object.values(input.item.system?.activities ?? {}) as Array<Record<string, any>>;
  const matched = (pattern: RegExp) => pattern.test(text);
  const name = `${input.itemName} ${input.englishName ?? ''}`.normalize('NFKC').toLowerCase();
  if (/\b(?:resistan\w*|immun\w*|defen\w*|protect\w*|shield\w*|ward\w*|armor\w*)\b|(?:抗性|免疫|防御|防护|护盾|护身|护甲)/u.test(name)
    || matched(/\b(?:has|gains?|grants?|provides?)\b[^.!?]{0,60}\b(?:resistan\w*|immun\w*|protection|advantage on saving throws?)\b|(?:获得|具有|提供).{0,30}(?:抗性|免疫|豁免.{0,8}优势)/u)) {
    return { category: 'defense', reason: 'Defensive effect in name or description.' };
  }
  if (matched(/\b(?:perce\w*|sens\w*|sight|vision|detect\w*|aware\w*|observ\w*|eyes?|smell\w*|hear\w*|scent)\b|(?:感知|察觉|侦测|探测|视觉|视力|盲视|眼|嗅觉|听觉|闻到)/u)) {
    return { category: 'perception', reason: 'Perception or sensing in name or description.' };
  }
  if (matched(/\b(?:creates?|conjures?|spreads?|emits?|fills?)\b[^.!?]{0,80}\b(?:magical )?darkness\b|(?:创造|生成|释放|散布).{0,30}(?:黑暗|暗影)/u)) {
    return { category: 'darkness', reason: 'The effect creates magical darkness.' };
  }
  const affirmative = `${name} ${body.replace(/[^.!?。！？]*?(?:\b(?:cannot|can't|does not|do not|never|not)\b|不能|无法|不会)[^.!?。！？]*(?:[.!?。！？]|$)/giu,' ')}`.normalize('NFKC').toLowerCase();
  if (/\b(?:flight|flyer|fly|flying)\b|(?:飞行|飞翔)/u.test(affirmative)) {
    return { category: 'flight', reason: 'Flight in the source name or affirmative description.' };
  }
  if (/\b(?:teleport\w*|mov\w*|speed|swim\w*|dash|travel\w*|step|leap|jump)\b|(?:传送|移动|速度|游泳|跳跃|跃迁)/u.test(affirmative)) {
    return { category: 'movement', reason: 'Movement in name or description.' };
  }
  if (matched(/\b(?:spell\w*|cast\w*|magic\w*|arcane|darkness|shadow\w*|enchant\w*)\b|(?:法术|施法|魔法|奥术|黑暗|暗影|阴影)/u)
    || activities.some((activity) => activity?.type === 'cast')) {
    return { category: 'magic', reason: 'Magic effect in name, description or activity.' };
  }
  if (activities.some((activity) => ['attack', 'damage', 'save'].includes(activity?.type))
    || matched(/\b(?:attack\w*|strike\w*|slash\w*|shred\w*|hit|wound\w*|multiattack)\b|(?:攻击|打击|劈砍|撕碎|伤害|多重攻击)/u)) {
    return { category: 'attack', reason: 'Attack or damage activity or text.' };
  }
  return { category: 'passive', reason: 'Trait has no more specific visual cue.' };
}

function matchVisualFamily(input: {
  itemName: string;
  englishName?: string;
  itemType: string;
  activityContext?: boolean;
  item: Record<string, any>;
}): VisualFamilyMatch | 'ambiguous' | undefined {
  if (!input.activityContext && !['feat', 'weapon', 'spell'].includes(input.itemType)) return undefined;
  const english = normalizeName(input.englishName ?? input.itemName);
  const chinese = input.itemName;
  const anatomy: VisualFamily | undefined = (
    /^(?:[a-z]+ ){0,2}(?:claw|claws|talon|talons|taloned paws)(?: (?:attack|strike|slash|swipe))?$/u.test(english)
    || /^(?:[\p{Script=Han}]{0,6})(?:爪击|利爪|爪刃)$/u.test(chinese)
  ) ? 'claw' : (
    /^(?:[a-z]+ ){0,2}(?:bite|fangs?)(?: attack)?$/u.test(english)
    || /^(?:[\p{Script=Han}]{0,6})(?:啃咬|撕咬|咬击|噬咬)$/u.test(chinese)
  ) ? 'bite' : (
    /^(?:[a-z]+ ){0,2}tail(?: (?:attack|strike|sweep|swipe|slam|shove))?$/u.test(english)
    || /^(?:[\p{Script=Han}]{0,6})(?:尾击|尾扫|尾巴横扫)$/u.test(chinese)
  ) ? 'tail' : undefined;
  if (anatomy) return { family: anatomy, reason: 'Explicit anatomical attack form in the Item name.' };

  const structured = structuredSignals(input.item);
  const allDamageTypes = [...structured].filter((signal) => DAMAGE_TAGS.has(signal));
  const damageTypes = allDamageTypes.filter((signal) => DAMAGE_VISUAL_FAMILIES[signal]);
  const conflictingDamage = allDamageTypes.length > 1;
  const fire = /\b(?:fire|flame|flaming|fiery|blaze|fireball)\b/u.test(english)
    || /(?:火球|火焰|烈焰|炎弹)/u.test(chinese);
  const cold = /\b(?:cold|ice|icy|frost|frozen)\b/u.test(english)
    || /(?:冰|寒|霜)/u.test(chinese);
  const breath = /^(?:[a-z]+ ){0,2}breath(?: (?:weapon|attack))?$/u.test(english)
    || /(?:吐息|喷吐)$/u.test(chinese);
  if (breath) {
    if (conflictingDamage) return 'ambiguous';
    const family = damageTypes[0] === 'fire' ? 'fireBreath'
      : damageTypes[0] === 'cold' ? 'coldBreath'
        : 'breath';
    return { family, reason: 'Explicit breath form and a verified single damage type, when present.' };
  }

  const defensiveName = /\b(?:resistance|immunity|ward|shield|protection|aura)\b/u.test(english)
    || /(?:抗性|免疫|护盾|防护|灵光)/u.test(chinese);
  const contentFamily = matchContentVisualFamily(input.item, structured);
  if (contentFamily) return contentFamily;
  if (defensiveName) return undefined;
  const namedProjectile = /\b(?:fireball|ball|bolt|orb|projectile|missile|shot|ray|blast)\b/u.test(english)
    || /(?:火球|冰球|飞弹|投射|射线|冰箭|炎弹|冰弹)/u.test(chinese);
  const activities = Object.values(input.item.system?.activities ?? {}) as Array<Record<string, any>>;
  const rangedAttack = activities.some((activity) =>
    ['rsak', 'rwak', 'ranged'].includes(activity?.attack?.type?.value)
    || Number(activity?.range?.value) > 0,
  ) || input.item.system?.attackType === 'ranged'
    || Number(input.item.system?.range?.value) > 0;
  if (rangedAttack && allDamageTypes.some((type) => ['bludgeoning', 'piercing', 'slashing'].includes(type))
    && !(namedProjectile && (fire || cold))) {
    return { family: 'physicalProjectile', reason: 'Ranged physical attack form, including mixed damage.' };
  }
  if (namedProjectile && (fire || cold) && (rangedAttack || structured.has('fire') || structured.has('cold'))) {
    if (conflictingDamage) return 'ambiguous';
    if (fire && cold) return 'ambiguous';
    if (fire && structured.has('cold') && !structured.has('fire')) return 'ambiguous';
    if (cold && structured.has('fire') && !structured.has('cold')) return 'ambiguous';
    return {
      family: fire ? 'fireProjectile' : 'coldProjectile',
      reason: 'Named elemental projectile with attack or damage structure.',
    };
  }

  const healingName = /\b(?:heal|healing|cure|mend|restorative)\b/u.test(english)
    || /(?:治疗|治愈|疗愈|恢复生命)/u.test(chinese);
  if ((healingName || input.activityContext) && activities.some((activity) => activity?.type === 'heal')) {
    return { family: 'healing', reason: 'Named healing effect with a heal activity.' };
  }

  if (conflictingDamage) return 'ambiguous';
  const damageType = damageTypes[0];
  const damagingActivity = activities.some((activity) =>
    ['attack', 'damage', 'save'].includes(activity?.type)
    || (activity?.attack && typeof activity.attack === 'object')
    || (activity?.save && typeof activity.save === 'object'),
  );
  if (
    damageType
    && damagingActivity
    && !activities.some((activity) => activity?.type === 'heal')
  ) {
    return {
      family: DAMAGE_VISUAL_FAMILIES[damageType]!,
      reason: `Single ${damageType} damage type in a structured attack, damage or save activity.`,
    };
  }
  return undefined;
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
  collectDamageSignals(itemBaseDamage(item.system?.damage), signals);
  if (item.type === 'weapon') {
    signals.add('weapon');
    const range = item.system?.range;
    if (Number(range?.reach) > 0) signals.add('melee');
    if (Number(range?.value) > 0) signals.add('ranged');
  }
  return signals;
}

function itemBaseDamage(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const damage = value as Record<string, unknown>;
  if ('base' in damage) return damage.base;
  // dnd5e 5.3.3 migrates the first legacy part into damage.base.
  if (Array.isArray(damage.parts)) return damage.parts[0];
  return value;
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
    // New generator names join bilingual aliases with spaces. Retain legacy
    // parenthesized lookup for old cards, and only split a Han/Latin boundary.
    const spaced = /^(.*\p{Script=Han})\s+([A-Za-z][A-Za-z0-9 '’&:\-]*)$/u.exec(trimmed);
    return spaced ? { displayName: spaced[1]!.trim(), englishName: spaced[2]!.trim() } : { displayName: trimmed };
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
