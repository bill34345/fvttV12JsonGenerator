// Visual cues describe what an ability does, never which creature owns it.
// Paths are still checked against the caller's locked catalog by the resolver.
export const CONTENT_VISUAL_PATHS = {
  disguise: 'icons/magic/symbols/mask-metal-silver-white.webp',
  allySynergy: 'icons/skills/social/diplomacy-unity-alliance.webp',
  spellSiphon: 'icons/magic/control/energy-stream-link-blue.webp',
  fear: 'icons/magic/control/fear-fright-mask-orange.webp',
  curse: 'icons/magic/control/voodoo-doll-pain-damage-purple.webp',
  corrosiveLiquid: 'icons/magic/acid/pouring-gas-smoke-liquid.webp',
  waterMovement: 'icons/magic/water/waves-water-blue.webp',
  plantRestraint: 'icons/magic/nature/root-vine-entangled-humanoid.webp',
} as const;

type ContentVisualFamily = keyof typeof CONTENT_VISUAL_PATHS;

export interface ContentVisualMatch {
  family: ContentVisualFamily;
  reason: string;
}

function plainDescription(item: Record<string, any>): string {
  const value = item.system?.description?.value;
  if (typeof value !== 'string') return '';
  return value
    .replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, '')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/giu, '\n')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);|&#(?:39|160);/giu, ' ')
    .normalize('NFKC').toLowerCase().replace(/[’‘]/gu, "'");
}

// Inspect negation around the matched effect, not the whole sentence: an actual
// curse may also say that its victim cannot cast spells in the same sentence.
const NEGATED_MATCH = /\b(?:immune|immunity|resistant|resistance|cannot|can't|never|not)\b|(?:免疫|抵抗|不会|不能|无法|不再|解除|移除)/u;
const NEGATED_PREFIX = /\b(?:not|never|cannot|can't|without|no|removes?|ends?)\s+(?:\w+\s+){0,2}$|\b(?:does not|do not|cannot|can't|never)\b[^.!?,;]{0,80}\b(?:or|and)\s+$|(?:不会|不能|无法|免疫|解除|移除).{0,8}$/u;

function affirmative(part: string, pattern: RegExp): boolean {
  return [...part.matchAll(new RegExp(pattern.source, 'gu'))].some((entry) =>
    !NEGATED_MATCH.test(entry[0])
    && !NEGATED_PREFIX.test(part.slice(Math.max(0, entry.index! - 60), entry.index)));
}

export function matchContentVisualFamily(
  item: Record<string, any>,
  damageTypes: ReadonlySet<string>,
): ContentVisualMatch | undefined {
  const description = plainDescription(item);
  if (!description) return undefined;
  const clauses = description.split(/[.!?;\n。！？；]/u).map((part) => part.trim()).filter(Boolean);
  const has = (pattern: RegExp) => clauses.some((part) => affirmative(part, pattern));
  const together = (...patterns: RegExp[]) => clauses.some((part) => patterns.every((pattern) => affirmative(part, pattern)));
  const match = (family: ContentVisualFamily, reason: string): ContentVisualMatch => ({ family, reason });

  // The visible medium is more informative than arbitrarily selecting the first
  // damage type. Mixed damage without an explicit medium still remains ambiguous.
  if (damageTypes.has('acid') && together(
    /\b(?:liquid|fluid|spray|jet|spit|glob|brine|bile|acid|acidic)\b|(?:液|盐水|胆汁|强酸)/u,
    /\b(?:spray\w*|spits?|splash\w*|surge\w*|spew\w*|pour\w*|jets?|strikes?|hits?)\b|(?:喷|涌|泼|倾倒|击中)/u,
  )) return match('corrosiveLiquid', 'A corrosive liquid/spray in the description, supported by acid damage.');

  if (together(
    /\b(?:vines?|roots?|seaweed|kelp|brambles?|plants?)\b|(?:藤蔓|根须|树根|海藻|水草|荆棘|植物)/u,
    /\b(?:restrain\w*|entangl\w*|envelop\w*|bind\w*|ensnar\w*|grappl\w*)\b|(?:束缚|缠绕|缠住|捆绑|包裹|困住)/u,
  )) return match('plantRestraint', 'Plants physically bind or restrain a creature in the description.');

  if (has(/\b(?:steal\w*|stolen|siphon\w*|drain\w*|borrow\w*|copy|copies)\b[^.!?]{0,80}\b(?:spells?|magic|mana)\b|(?:窃取|偷取|夺取|汲取|抽取|借用|复制).{0,35}(?:法术|魔力)/u)
    || has(/\b(?:using|expending|consuming)\s+(?:another|that|the target|the victim)[^.!?]{0,45}\bspell slots?\b|(?:使用|消耗).{0,15}(?:其他|另一|目标|该生物|受害者).{0,15}法术位/u)) {
    return match('spellSiphon', 'The description borrows or drains another creature\'s spellcasting resource.');
  }

  if (has(/\b(?:targets?|creatures?|enemy|enemies|foes?|victims?|it|they)\s+(?:is|are|becomes?|become|must become)\s+(?:\w+\s+){0,2}(?:frightened|terrified|afraid)\b|\bor\s+(?:be|become)\s+frightened\b|\b(?:frightens?|terrifies?)\s+(?:the|a|each|all|its|an)\b|(?:使|令).{0,18}(?:恐慌|恐惧|害怕)|(?:失败|目标|生物|敌人).{0,12}(?:陷入恐惧|变得害怕|恐慌)/u)) {
    return match('fear', 'The description explicitly inflicts fear; a frightened prerequisite alone does not qualify.');
  }

  if (has(/\b(?:target|creature|victim|it)\s+(?:is|becomes?|remains?)\s+cursed\b|\b(?:curses?|hexes?)\s+(?:the|a|each|its|one)\b|\b(?:places?|lays?|inflicts?)\s+(?:a\s+)?(?:curse|hex)\s+(?:on|upon)\b|(?:使|令).{0,16}(?:受到|受|遭受|陷入)?诅咒|(?:失败|目标|生物).{0,10}(?:受到|受|遭受)诅咒/u)) {
    return match('curse', 'The description applies a curse, rather than referring to an already cursed target.');
  }

  if (together(
    /\b(?:mimic\w*|imitat\w*|disguis\w*|impersonat\w*|assum\w*|chang\w*)\b|(?:模仿|模拟|伪装|假扮|变成|改变)/u,
    /\b(?:voice|appearance|form|likeness|face|identity)\b|(?:声音|声线|外貌|外形|容貌|面容|身份)/u,
  )) return match('disguise', 'The description changes or copies a voice/appearance.');

  if (together(
    /\b(?:moves?|travel\w*|swims?|dives?|submerg\w*)\b[^.!?]{0,80}\b(?:swim speed|underwater|water)\b|\b(?:swims|dives|submerges)\b|\b(?:can|may) swim\b|\bgains? (?:a )?swim speed\b|(?:移动|游动|前进).{0,30}(?:游泳速度|水中|水下)|(?:可以|能够|进行)游泳|(?:获得|拥有|具有).{0,12}游泳速度|(?:潜水|下潜)/u,
    /\b(?:swim|swims|swimming|underwater|water|dives?|submerg\w*)\b|(?:游泳|游动|水中|水下|潜水|下潜)/u,
  )) return match('waterMovement', 'The description explicitly grants or performs swimming/diving movement.');

  if (together(
    /\b(?:ally|allies|allied|companions?)\b|(?:盟友|同伴|伙伴)/u,
    /\b(?:within|nearby|adjacent|near)\b|(?:范围内|附近|相邻|靠近|周围)/u,
    /\b(?:advantage|bonus|bonuses|benefit\w*|empower\w*)\b|(?:优势|加值|增益|提高|增强)/u,
  )) {
    return match('allySynergy', 'Nearby allies grant an explicit cooperative benefit in the description.');
  }
  return undefined;
}
