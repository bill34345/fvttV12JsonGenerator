import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import {
  ITEM_ACTIVATION_TYPES, ITEM_DAMAGE_TYPES, ITEM_MOVEMENT_TYPES, ITEM_ROLL_ABILITIES,
  type ItemDiscoveryCandidate, type ItemIntakeAbility, type ItemIntakeDamage, type ItemIntakeFinding, type ItemIntakeIR,
} from './item-types';

type Check = (code: string, path: string, message: string, origin: ItemIntakeFinding['origin'], evidence?: EvidenceRef[]) => void;
type P1Ability = Exclude<ItemIntakeAbility, {
  kind: 'passive-ac' | 'light' | 'spell' | 'container' | 'spell-scroll' | 'spell-storage' | 'timed-speed' | 'summon-creature' | 'enchant-weapon-bonus' | 'enchant-armor-resistance';
}>;

export const ITEM_DAMAGE_LABELS: Record<typeof ITEM_DAMAGE_TYPES[number], RegExp> = {
  acid: /\bacid\b|强酸|強酸/iu, bludgeoning: /\bbludgeoning\b|钝击|鈍擊/iu,
  cold: /\bcold\b|寒冷|冷冻|冷凍/iu, fire: /\bfire\b|火焰/iu, force: /\bforce\b|力场|力場/iu,
  lightning: /\blightning\b|闪电|閃電/iu, necrotic: /\bnecrotic\b|黯蚀|黯蝕|坏死|壞死/iu,
  piercing: /\bpiercing\b|穿刺/iu, poison: /\bpoison\b|毒素|毒伤|毒傷/iu,
  psychic: /\bpsychic\b|心灵|心靈/iu, radiant: /\bradiant\b|光耀/iu,
  slashing: /\bslashing\b|挥砍|揮砍/iu, thunder: /\bthunder\b|雷鸣|雷鳴/iu,
};

const ABILITY_LABELS: Record<typeof ITEM_ROLL_ABILITIES[number], RegExp> = {
  str: /\bstrength\b|力量/iu, dex: /\bdexterity\b|敏捷/iu, con: /\bconstitution\b|体质|體質/iu,
  int: /\bintelligence\b|智力/iu, wis: /\bwisdom\b|感知/iu, cha: /\bcharisma\b|魅力/iu,
};

const MOVEMENT_LABELS: Record<typeof ITEM_MOVEMENT_TYPES[number], RegExp> = {
  walk: /\b(?:walking )?speed\b|(?:步行|行走|移动|移動)速度/iu, fly: /\bfly(?:ing)? speed\b|飞行速度|飛行速度/iu,
  swim: /\bswim(?:ming)? speed\b|游泳速度/iu, climb: /\bclimb(?:ing)? speed\b|攀爬速度/iu,
  burrow: /\bburrow(?:ing)? speed\b|掘穴速度|挖掘速度/iu,
};

const BASE_WEAPON_LABELS: Record<string, RegExp> = {
  longsword: /\blongsword\b|长剑|長劍/iu, spear: /\bspear\b|长矛|長矛/iu,
  dagger: /\bdagger\b|匕首/iu, quarterstaff: /\bquarterstaff\b|长棍|長棍/iu,
};

const ACTIVATIONS: Record<typeof ITEM_ACTIVATION_TYPES[number], RegExp> = {
  action: /\b(?:as an action|as a magic action|attack action|uses? an action|takes? an action)\b|(?:以|用|使用|消耗|花费|执行).{0,7}(?:魔法|攻击|攻擊)?[动動]作/iu,
  bonus: /\bbonus action\b|附赠动作|附贈動作|奖励动作|獎勵動作/iu,
  reaction: /\b(?:as|use|take|using) (?:your |a )?reaction\b|(?:用|以|作为|使用)(?:一[个個次])?反[应應]/iu,
  free: /\b(?:free action|no action required|without (?:using|taking) an action)\b|(?:无需|無需|不需要)[动動]作/iu,
};

const HEAL = /\b(?:heal\w*|regain\w*|restore\w*)\b[^.!?]{0,75}\b(?:hp|hit points)\b|(?:恢复|恢復|回复|回復|治疗|治療|获得|獲得)[^。！？]{0,32}生命值/iu;
const ALL_SAVES = /\b(?:all )?saving throws\b|(?:所有)?豁免(?:检定|檢定)?/iu;
const ARMOR_CLASS = /\barmor class\b|\bac\b|护甲等级|護甲等級/iu;
const RESTRICTED_PASSIVE = /\b(?:not wearing (?:any )?armor|wearing no armor|without (?:wearing )?(?:any )?armor|not (?:wielding|using) a shield|without a shield)\b|(?:未|不|没有|沒有)[^。！？，,]{0,12}(?:穿着|穿著|装备|裝備|持握|持用)[^。！？，,]{0,10}(?:护甲|護甲|盔甲|盾牌)|仅对|僅對|against (?:spells?|traps?|the effects? of)|your next (?:roll|save|saving throw)|持续\s*\d+|持續\s*\d+/iu;
const ROLL_FORMULA = /^(?:[1-9]\d*d[1-9]\d*|\d+)(?:[+-]\d+)?(?:\+@mod)?$/iu;

export function hasItemAcBonus(text: string, value: number): boolean {
  return mechanicBonusIsCited(text, value, ARMOR_CLASS);
}

export function sourcePassiveResistanceEvidence(
  candidate: ItemDiscoveryCandidate, damageType: typeof ITEM_DAMAGE_TYPES[number],
): EvidenceRef | undefined {
  const matches = [...candidate.quote.matchAll(/[^。.!?；;\r\n]+/gu)].filter(match => {
    const clause = match[0].trim().replace(/^[-*•]\s+/u, '');
    return /^(?:you\s+(?:have|gain) resistance to .+ damage|你(?:获得|獲得|具有|拥有|擁有).+伤害(?:的)?抗性|你(?:获得|獲得|具有|拥有|擁有).+傷害(?:的)?抗性)$/iu.test(clause)
      && ITEM_DAMAGE_TYPES.filter(type => ITEM_DAMAGE_LABELS[type].test(clause)).join(',') === damageType
      && !RESTRICTED_PASSIVE.test(clause);
  });
  if (matches.length !== 1) return undefined;
  const match = matches[0]!;
  const start = candidate.start + match.index;
  return { start, end: start + match[0].length, quote: match[0] };
}

function mechanicBonusIsCited(text: string, value: number, statistic: RegExp): boolean {
  return text.split(/[。.!?；;\n]/u).some(clause => {
    const bonus = clause.match(/[+＋\-−－]\s*\d+/gu) ?? [];
    return statistic.test(clause) && bonus.length === 1 && hasSignedValue(bonus[0]!, value);
  });
}

export function validateP1Item(
  source: string,
  item: ItemIntakeIR['item'],
  category: { type: string; subtype?: string } | undefined,
  add: Check,
): void {
  const abilities = Array.isArray(item.abilities) ? item.abilities : [];
  const heals = abilities.filter(ability => ability?.kind === 'heal');
  if (heals.length) {
    if (category?.subtype !== 'potion' || heals.length !== 1 || item.uses || abilities.some(ability =>
      ability && typeof ability === 'object' && ability.kind !== 'heal' && 'consumption' in ability && ability.consumption > 0)) {
      add('INVALID_POTION_LIFECYCLE', '/item/abilities', 'A healing potion needs one per-bottle Heal activity and no shared charge pool.', 'semantic');
    }
  } else if (category?.subtype === 'potion' && HEAL.test(source) && /\bdrink\w*\b|饮用|飲用|喝下/iu.test(source)) {
    add('MISSING_POTION_HEAL', '/item/abilities', 'The potion explicitly restores hit points when drunk. Preserve its healing activity.', 'semantic');
  }

  const passive = abilities.filter(ability => ability && /^(?:passive-)/u.test(ability.kind));
  if (passive.length && source.split(/[。.!?；;\n]/u).some(clause => RESTRICTED_PASSIVE.test(clause)
    && (ARMOR_CLASS.test(clause) || ALL_SAVES.test(clause)
      || /\bresistan\w*\b|抗性|抵抗/iu.test(clause)
      || Object.values(MOVEMENT_LABELS).some(pattern => pattern.test(clause))))) {
    add('CONDITIONAL_PASSIVE_UNSUPPORTED', '/item/abilities', 'A condition beyond ordinary equipment and attunement cannot become an unconditional modifier.', 'semantic');
  }
  if (passive.some(ability => ability.kind === 'passive-ac') &&
    !passive.some(ability => ability.kind === 'passive-save') &&
    source.split(/[。.!?；;\n]/u).some(clause => ARMOR_CLASS.test(clause) && ALL_SAVES.test(clause)
      && /[+＋]\s*\d+|\bbonus\b/iu.test(clause))) {
    add('MISSING_PASSIVE_SAVE', '/item/abilities', 'Preserve the explicitly paired saving throw bonus.', 'semantic');
  }

  for (const [index, ability] of abilities.entries()) {
    if (!ability) continue;
    const path = `/item/abilities/${index}`;
    if (ability.kind === 'weapon-bonus' && !['weapon', 'staff'].includes(category?.type ?? '')) {
      add('WEAPON_BONUS_REQUIRES_WEAPON', path, 'Only a source weapon can receive a native weapon bonus.', 'semantic');
    }
    if ((ability.kind === 'save' || ability.kind === 'utility') && (ability.consumption > 0 ||
      (ability.kind === 'save' && ability.scaleMax !== undefined))) {
      const max = item.uses?.max ?? 0;
      if (ability.consumption > max || (ability.kind === 'save' && (ability.scaleMax ?? 0) > max)) {
        add('ITEM_ACTIVITY_COST_OUTSIDE_POOL', path, 'The native activity cost and scale cap must fit the source Item pool.', 'semantic');
      }
    }
  }
}

export function validateP1Ability(ability: P1Ability, path: string, evidence: EvidenceRef[], add: Check): void {
  const text = evidence.map(entry => entry?.quote ?? '').join('\n').replace(/[*_]/gu, '');
  const fail = (suffix: string, message: string) => add('ITEM_P1_MECHANIC_NOT_EXPLICIT', `${path}/${suffix}`, message, 'semantic', evidence);
  switch (ability.kind) {
    case 'passive-save':
      if (!mechanicBonusIsCited(text, ability.value, ALL_SAVES) || RESTRICTED_PASSIVE.test(text)
        || Object.values(ABILITY_LABELS).some(pattern => pattern.test(text))) {
        fail('value', 'An all-save passive requires an explicit bonus to saving throws, with no additional situational restriction.');
      }
      return;
    case 'passive-resistance':
      if (!ITEM_DAMAGE_TYPES.includes(ability.damageType) || !ITEM_DAMAGE_LABELS[ability.damageType]?.test(text)
        || !/\bresistan\w*\b|抗性|抵抗/iu.test(text) || RESTRICTED_PASSIVE.test(text)) {
        fail('damageType', 'A native passive resistance requires the exact explicit damage type and resistance rule.');
      }
      return;
    case 'passive-movement':
      if (!ITEM_MOVEMENT_TYPES.includes(ability.movement) || !Number.isSafeInteger(ability.value) || ability.value <= 0
        || !MOVEMENT_LABELS[ability.movement]?.test(text) || !distanceIsCited(text, ability.value)
        || !/\b(?:bonus|increases?|adds?)\b|增加|提升|加值|额外|額外/iu.test(text) || RESTRICTED_PASSIVE.test(text)) {
        fail('value', 'A native speed bonus requires an explicit added amount in feet and the corresponding movement mode.');
      }
      return;
    case 'weapon-bonus':
      const attackRolls = /\battack rolls?\b|攻击检定|攻擊檢定|命中检定|命中檢定/iu;
      const damageRolls = /\bdamage rolls?\b|伤害骰|傷害骰|伤害掷骰|傷害擲骰|伤害检定|傷害檢定/iu;
      if (!Number.isSafeInteger(ability.value) || ability.value < 1 || ability.value > 3
        || !BASE_WEAPON_LABELS[ability.baseItem]?.test(text) || !mechanicBonusIsCited(text, ability.value, attackRolls)
        || !mechanicBonusIsCited(text, ability.value, damageRolls)) {
        fail('value', 'A weapon bonus requires a supported base weapon and the same explicit bonus to attack rolls and damage rolls.');
      }
      return;
  }

  const activation = ACTIVATIONS[ability.activation];
  if (!activation?.test(text) || (ability.activation === 'action' && ability.kind !== 'attack'
    && (ACTIVATIONS.bonus.test(text) || ACTIVATIONS.reaction.test(text)))) {
    fail('activation', 'Quote the action, bonus action, or reaction used by this mechanic.');
  }
  if (ability.kind === 'heal') {
    if (!['action', 'bonus'].includes(ability.activation) || !HEAL.test(text) || !formulaIsCited(ability.formula, text, false) || ability.consumption !== 1) {
      fail('formula', 'Healing must use the exact source amount and consume one bottle.');
    }
    const otherCreature = /\b(?:another|other|target) creature\b|另一(?:个|個|名|只)?生物|其他生物|目标生物|目標生物/iu.test(text);
    if (ability.target === 'creature' ? !otherCreature || !distanceIsCited(text, ability.range)
      : ability.target !== 'self' || otherCreature || ability.range !== undefined || !/\byou\b|自己|自身|你/iu.test(text)) {
      fail('target', 'A healing potion must preserve the drinker and the exact range when it can be administered to another creature.');
    }
    return;
  }

  if (ability.kind === 'attack') {
    const melee = /\bmelee\b|近战|近戰|攻击动作|攻擊動作/iu;
    const ranged = /\branged\b|远程|遠程/iu;
    const spell = /\bspell attack\b|法术攻击|法術攻擊/iu;
    if (!['mwak', 'rwak', 'msak', 'rsak'].includes(ability.attackType)
      || !(ability.attackType.startsWith('m') ? melee : ranged).test(text) || spell.test(text) !== ability.attackType.endsWith('sak')) {
      fail('attackType', 'Quote whether the attack is melee or ranged, and whether it is a spell attack.');
    }
    if (ability.toHit === undefined) {
      if (!ability.ability || !ABILITY_LABELS[ability.ability]?.test(text) || !/\bproficien\w*\b|熟练|熟練/iu.test(text)) {
        fail('ability', 'A dynamic attack needs source-backed ability and proficiency facts.');
      }
    } else if (!hasSignedValue(text, ability.toHit) || ability.ability !== undefined) {
      fail('toHit', 'A fixed attack takes the exact source bonus without inventing an ability or proficiency.');
    }
    const range = typeof ability.range === 'string' ? ability.range.match(/\d+/gu) ?? [] : [];
    if (!range.length || range.some(value => !distanceIsCited(text, Number(value)))) fail('range', 'Preserve the exact attack distance.');
    if (!Array.isArray(ability.damage) || ability.damage.length === 0) fail('damage', 'An Attack requires source damage.');
    else validateDamage(ability.damage, text, true, fail);
    validateTarget(ability.target, text, fail);
    return;
  }

  if (!Number.isSafeInteger(ability.consumption) || ability.consumption < 0) fail('consumption', 'An activity cost must be an integer of zero or more.');
  if (ability.consumption > 0 && !/\b(?:charge|uses?\s+once|use.+until)\b|充能|一经使用|一經使用|[一1]次|再次使用/iu.test(text)) {
    fail('consumption', 'Quote the cost or the limit that uses one charge.');
  }
  if (ability.range && (ability.range.units === 'self' ? ability.range.value !== 0
    || !/\bself\b|from you|around you|originat\w* from you|自身|自己|源自你|以你为中心|以你為中心/iu.test(text)
    : ability.range.units !== 'ft' || !distanceIsCited(text, ability.range.value))) {
    fail('range', 'Quote the range or the self origin of this activity.');
  }
  if (ability.duration) {
    const timeUnits = { round: 'rounds?|轮|輪|回合', minute: 'minutes?|分钟|分鐘', hour: 'hours?|小时|小時' };
    const unit = timeUnits[ability.duration.units];
    if (!unit || !Number.isSafeInteger(ability.duration.value) || ability.duration.value <= 0
      || !new RegExp(`(?:^|[^\\d])${ability.duration.value}\\s*(?:${unit})`, 'iu').test(text)
      || ability.duration.concentration !== /\bconcentrat\w*\b|专注|專注/iu.test(text)) {
      fail('duration', 'Preserve the source duration and whether it requires concentration.');
    }
  }
  validateTarget(ability.target, text, fail);
  if (ability.kind === 'save') {
    if (!ITEM_ROLL_ABILITIES.includes(ability.ability) || !ABILITY_LABELS[ability.ability]?.test(text)
      || !Number.isSafeInteger(ability.dc) || ability.dc <= 0
      || !new RegExp(`(?:\\bDC|豁免难度|豁免難度)\\s*(?:为|為|[:：])?\\s*${ability.dc}\\b`, 'iu').test(text)) {
      fail('dc', 'Quote the exact fixed DC and saving ability.');
    }
    const half = /\bhalf (?:as much |the )?damage\b|伤害减半|傷害減半|一半伤害|一半傷害/iu.test(text);
    if (!['none', 'half', 'full'].includes(ability.outcome) || half !== (ability.outcome === 'half')
      || (ability.outcome === 'full' && !/\b(?:full|same) damage\b|全部伤害|全部傷害|相同伤害|相同傷害/iu.test(text))) {
      fail('outcome', 'Preserve the exact damage dealt on a successful save.');
    }
    if (!Array.isArray(ability.damage)) fail('damage', 'Save damage must be an array.');
    else validateDamage(ability.damage, text, false, fail);
    if (ability.scaleMax !== undefined && (!Number.isSafeInteger(ability.scaleMax) || ability.scaleMax <= ability.consumption
      || ability.consumption < 1 || !/\b(?:per|each|every) (?:additional )?charge\b|每消耗[^。]*充能/iu.test(text))) {
      fail('scaleMax', 'Scaling requires a bounded positive cost and explicit damage per charge.');
    }
    return;
  }
  if (ability.activation === 'reaction' && (!ability.trigger?.trim() || !text.includes(ability.trigger.trim().replace(/[*_]/gu, '')))) {
    fail('trigger', 'Preserve the original reaction trigger as a literal source quote.');
  }
  const area = ability.target?.template;
  if (area && (!['radius', 'sphere'].includes(area.type) || area.units !== 'ft' || !distanceIsCited(text, area.size)
    || !/\b(?:radius|emanation|aura|sphere)\b|光环|光環|球体|球體|半径|半徑/iu.test(text))) {
    fail('target/template', 'An area needs the explicit template size and kind stated by the source.');
  }
}

function validateTarget(
  target: { type: 'self' | 'creature'; count: number; special?: string } | undefined,
  text: string,
  fail: (path: string, message: string) => void,
) {
  if (!target) return;
  if (!['self', 'creature'].includes(target.type) || !Number.isSafeInteger(target.count) || target.count !== 1
    || (target.type === 'self' && !/\byou\b|\byourself\b|自己|自身|源自你/iu.test(text))
    || (target.type === 'creature' && !/\b(?:creature|target)\b|生物|目标|目標/iu.test(text))
    || (target.special !== undefined && !text.includes(target.special))) {
    fail('target', 'Keep the one target and any cited restriction from the source.');
  }
}

function validateDamage(damage: ItemIntakeDamage[], text: string, abilityMod: boolean,
  fail: (path: string, message: string) => void,
) {
  for (const [index, part] of damage.entries()) {
    if (!part || !ITEM_DAMAGE_TYPES.includes(part.type) || !ITEM_DAMAGE_LABELS[part.type]?.test(text)
      || !formulaIsCited(part.formula, text, abilityMod)) {
      fail(`damage/${index}`, 'Each damage formula and type must be explicitly quoted.');
    } else if (part.scaling && (!Number.isSafeInteger(part.scaling.number) || part.scaling.number < 1
      || !['whole', 'half'].includes(part.scaling.mode) || !/\b(?:per|each|every) (?:additional )?charge\b|每消耗[^。]*充能/iu.test(text))) {
      fail(`damage/${index}/scaling`, 'Quote the exact damage increase per charge.');
    }
  }
}

function formulaIsCited(formula: unknown, text: string, abilityMod: boolean): boolean {
  if (typeof formula !== 'string') return false;
  const normalized = formula.replace(/\s+/gu, '').toLowerCase();
  if (!ROLL_FORMULA.test(normalized) || (!abilityMod && normalized.endsWith('@mod'))) return false;
  const source = text.replace(/[＋]/gu, '+').replace(/[−－]/gu, '-').replace(/\s+/gu, '').toLowerCase()
    .replace(/(?:your|thewielder(?:'s|’s))?(?:strength|dexterity|constitution|intelligence|wisdom|charisma)modifier|(?:你(?:的)?|持用者的|使用者的)?(?:力量|敏捷|体质|體質|智力|感知|魅力)(?:调整值|調整值|修正值)/gu, '@mod');
  const literal = normalized.replace(/[+*.?^$(){}|[\]\\]/gu, '\\$&');
  return new RegExp(`(?:^|[^\\dd])${literal}(?!\\d|d\\d|[+-]\\d|\\+@mod)`, 'iu').test(source);
}

function hasSignedValue(text: string, value: number): boolean {
  return Number.isSafeInteger(value) && value !== 0 && new RegExp(
    `${value < 0 ? '[-−－]' : '[+＋]'}\\s*${Math.abs(value)}(?!\\d)`, 'u',
  ).test(text);
}

function distanceIsCited(text: string, value: number | undefined): boolean {
  return Number.isSafeInteger(value) && value! > 0 && new RegExp(`(?:^|[^\\d])${value}\\s*(?:feet\\b|foot\\b|ft\\b|英尺|尺)`, 'iu').test(text);
}
