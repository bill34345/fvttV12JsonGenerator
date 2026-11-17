import type { UsesData } from './item-uses';
import type { ItemRandomSummonData } from './item-random-summon';
export type { UsesData } from './item-uses';
export { itemRandomSummonAppendixLength, itemRandomSummonRules, readItemRandomSummon, type ItemRandomSummonData } from './item-random-summon';
import type { StructuredActionData, ActionData } from './action';
import type { WeaponConfiguration, WeaponMasteryId } from '@fvtt-json-generator/contracts/weapon-properties';

/**
 * Item type values in dnd5e system
 */
export type ItemType =
  | "weapon"
  | "equipment"
  | "consumable"
  | "loot"
  | "tool"
  | "ammunition"
  | "armor"
  | "rod"
  | "wand"
  | "staff"
  | "container";

/**
 * Rarity values for items
 */
export type ItemRarity = "common" | "uncommon" | "rare" | "veryRare" | "legendary" | "artifact";

/**
 * Attunement requirement types
 */
export type AttunementType = "required" | "optional" | "none";

/**
 * Damage type structure for weapons
 */
export interface DamageData {
  base: {
    number: number;
    denomination: number;
    bonus?: string;
    types: string[];
    custom?: {
      enabled: boolean;
      formula: string;
    };
    scaling?: {
      mode: string;
      number: number | null;
      formula: string;
    };
  };
  versatile?: {
    number: number;
    denomination: number;
    bonus?: string;
    types: string[];
    custom?: {
      enabled: boolean;
      formula: string;
    };
    scaling?: {
      mode: string;
      number: number | null;
      formula: string;
    };
  };
}

/**
 * Range structure for weapons and ranged items
 */
export interface RangeData {
  value: number | null;
  long: number | null;
  units: string;
  reach?: number | null;
}

/**
 * Armor data structure for equipment/armor items
 */
export interface ArmorData {
  value: number | null;
  dex?: number | null;
  magicalBonus?: number | null;
  type?: "light" | "medium" | "heavy" | "shield" | "trinket";
  baseItem?: string;
}

/**
 * Save data for items with save effects (like wands with spell saves)
 */
export interface SaveData {
  ability: string;
  dc: {
    calculation: string;
    formula: string;
  };
}

/**
 * Price structure for items
 */
export interface PriceData {
  value: number;
  denomination: "cp" | "sp" | "gp" | "pp";
}

/**
 * Weight structure for items
 */
export interface WeightData {
  value: number;
  units: "lb" | "kg" | "sn" | "c";
}

/** Explicit container limits may apply concurrently. */
export interface ItemContainerData {
  count?: number;
  weight?: { value: number; units: 'lb' | 'kg' };
  volume?: { value: number; units: 'cubicFoot' | 'liter' };
  itemWeight?: { value: number; units: 'lb' | 'kg' };
  weightlessContents: boolean;
}

export interface ItemSpellScrollData {
  level?: number;
  spell?: { identifier: string; name: string };
}

export const SPELL_STORAGE_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export interface StoredItemSpell {
  spell: { identifier: string; name: string };
  level: number;
  ability: typeof SPELL_STORAGE_ABILITIES[number];
  saveDc: number;
  attackBonus: number;
}

export interface ItemSpellStorageData {
  capacity: 5;
  foundLevels: '1d6-1';
  spells: StoredItemSpell[];
}

export interface ItemTimedSpeedData {
  seconds: number;
}

export interface ItemLastChargeCheck {
  formula: string;
  destroyOn: number;
}

export interface ItemSummonData {
  actorName: string;
  actorUuid: string;
  rangeFeet: number;
  durationHours: number;
  cooldownDays: number;
}

const ACTOR_COMPENDIUM_UUID = /^Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Actor\.[A-Za-z0-9]{16}$/u;

export function readItemSummon(record: Record<string, unknown>): ItemSummonData | undefined {
  const { actorName, actorUuid, rangeFeet, durationHours, cooldownDays } = record;
  const positiveInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  if (typeof actorName !== 'string' || !actorName.trim()
    || typeof actorUuid !== 'string' || !ACTOR_COMPENDIUM_UUID.test(actorUuid)
    || !positiveInteger(rangeFeet) || !positiveInteger(durationHours) || !positiveInteger(cooldownDays)) return undefined;
  return { actorName: actorName.trim(), actorUuid, rangeFeet, durationHours, cooldownDays };
}

export function itemSummonBinding(source: string): { actorName: string; actorUuid: string } | undefined {
  const matches = [...source.matchAll(/@UUID\[(Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Actor\.[A-Za-z0-9]{16})\]\{([^{}\r\n]+)\}/gu)];
  const bindings = new Map(matches.map(match => [match[1]!, match[2]!.trim()]));
  if (bindings.size !== 1 || matches.some(match => !match[2]!.trim() || match[2]!.trim() !== bindings.get(match[1]!))) return undefined;
  const [actorUuid, actorName] = bindings.entries().next().value!;
  return { actorName, actorUuid };
}

export function itemSummonRules(source: string): Pick<ItemSummonData, 'rangeFeet' | 'durationHours' | 'cooldownDays'> | undefined {
  if (!/\bmagic action\b|魔法动作|魔法動作/iu.test(source)
    || !/\bunoccupied\b|is occupied|未占据|未佔據|已被占据|已被佔據/iu.test(source)
    || !/\b(?:reverts?|returns?|becomes?)\b[^.!?\n]{0,90}\bfigurine\b|(?:变回|恢[复復]成)塑像/iu.test(source)) return undefined;
  const range = /\bwithin\s+(\d+)\s*(?:feet|ft)\b|(\d+)\s*尺内/iu.exec(source);
  const duration = /\bup to\s+(\d+)\s*hours?\b|(?:最多|至多|持续|持續)\s*(\d+)\s*(?:个|個)?小时/iu.exec(source);
  const cooldown = /\b(?:until|after)\s+(\d+)\s*days?\b|\b(\d+)\s*days?\s+(?:have passed|must pass)\b|(?:等满|经过|經過|等待)\s*(\d+)\s*天/iu.exec(source);
  if (!range || !duration || !cooldown) return undefined;
  return {
    rangeFeet: Number(range[1] ?? range[2]),
    durationHours: Number(duration[1] ?? duration[2]),
    cooldownDays: Number(cooldown[1] ?? cooldown[2] ?? cooldown[3]),
  };
}

export function readItemTimedSpeed(record: Record<string, unknown>): ItemTimedSpeedData | undefined {
  const seconds = record.seconds;
  return typeof seconds === 'number' && Number.isSafeInteger(seconds) && seconds > 0 ? { seconds } : undefined;
}

export function readItemSpellStorage(record: Record<string, unknown>): ItemSpellStorageData | undefined {
  if (record.capacity !== 5 || record.foundLevels !== '1d6-1' || !Array.isArray(record.spells) || record.spells.length > 5)
    return undefined;
  const spells: StoredItemSpell[] = [];
  for (const entry of record.spells) {
    if (typeof entry !== 'object' || !entry || !entry.spell || typeof entry.spell.identifier !== 'string' || !entry.spell.identifier.trim()
      || typeof entry.spell.name !== 'string' || !entry.spell.name.trim()
      || !Number.isInteger(entry.level) || entry.level < 1 || entry.level > 5
      || !SPELL_STORAGE_ABILITIES.includes(entry.ability) || !Number.isSafeInteger(entry.saveDc) || entry.saveDc < 1
      || !Number.isSafeInteger(entry.attackBonus)) return undefined;
    spells.push({
      spell: { identifier: entry.spell.identifier, name: entry.spell.name }, level: entry.level, ability: entry.ability,
      saveDc: entry.saveDc, attackBonus: entry.attackBonus,
    });
  }
  if (spells.reduce((sum, entry) => sum + entry.level, 0) > record.capacity) return undefined;
  return { capacity: record.capacity, foundLevels: record.foundLevels, spells };
}

export const ENCHANTED_WEAPON_RARITY = { 1: 'uncommon', 2: 'rare', 3: 'veryRare' } as const;
export const ENCHANTMENT_DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
] as const;
type WeaponEnchantmentBonus = keyof typeof ENCHANTED_WEAPON_RARITY;
type ResistanceType = typeof ENCHANTMENT_DAMAGE_TYPES[number];

export type ItemEnchantmentData =
  | { kind: 'enchant-weapon-bonus'; bonuses: WeaponEnchantmentBonus[] }
  | { kind: 'enchant-armor-resistance'; damageTypes: ResistanceType[] };

export function readItemEnchantment(ability: Record<string, unknown>): ItemEnchantmentData | undefined {
  if (ability.kind === 'enchant-weapon-bonus') {
    const bonuses = ability.bonuses;
    if (Array.isArray(bonuses) && bonuses.length > 0 && bonuses.every(bonus => bonus === 1 || bonus === 2 || bonus === 3)
      && new Set(bonuses).size === bonuses.length) return { kind: ability.kind, bonuses };
  } else if (ability.kind === 'enchant-armor-resistance') {
    const damageTypes = ability.damageTypes;
    if (Array.isArray(damageTypes) && damageTypes.length > 0 && damageTypes.every(type => ENCHANTMENT_DAMAGE_TYPES.includes(type))
      && new Set(damageTypes).size === damageTypes.length) return { kind: ability.kind, damageTypes };
  }
  return undefined;
}

/**
 * Activity data embedded in items (spells, attacks, etc.)
 */
export interface ActivityData {
  _id: string;
  type: "attack" | "cast" | "save" | "utility" | string;
  name?: string;
  activation?: {
    type: string;
    value: number | null;
    condition?: string;
    override: boolean;
  };
  consumption?: {
    targets: Array<{
      type: "itemUses" | "charges" | string;
      target: string;
      value: string;
      scaling?: {
        mode: string;
        formula: string;
      };
    }>;
    scaling?: {
      allowed: boolean;
      max: string;
    };
    spellSlot?: boolean;
  };
  duration?: {
    concentration: boolean;
    value: string;
    units: string;
    special?: string;
    override: boolean;
  };
  range?: {
    value: string | null;
    units: string;
    special?: string;
    override: boolean;
  };
  target?: {
    template?: {
      count: string;
      contiguous: boolean;
      type: string;
      size: string;
      width?: string;
      height?: string;
      units: string;
    };
    affects?: {
      count: string;
      type: string;
      choice: boolean;
      special?: string;
    };
    prompt?: boolean;
    override?: boolean;
  };
  attack?: {
    ability: string;
    bonus: string;
    critical?: {
      threshold: number | null;
    };
    flat: boolean;
    type?: {
      value: string;
      classification: string;
    };
  };
  damage?: {
    critical?: {
      bonus: string;
    };
    includeBase: boolean;
    parts: Array<{
      custom?: {
        enabled: boolean;
        formula: string;
      };
      number: number | null;
      denomination: number | null;
      bonus?: string;
      types?: string[];
      scaling?: {
        number: number;
      };
    }>;
  };
  save?: SaveData;
  spell?: {
    uuid: string;
    challenge?: {
      attack: number | null;
      save: number | null;
      override: boolean;
    };
    level: string | null;
    properties?: string[];
  };
  description?: {
    chatFlavor?: string;
  };
  uses?: {
    spent: number;
    recovery: unknown[];
    max: string;
  };
  effects?: unknown[];
  sort?: number;
  img?: string;
  roll?: {
    prompt: boolean;
    visible: boolean;
    name: string;
    formula: string;
  };
  appliedEffects?: unknown[];
}

/**
 * Trait data for items with resistant/immune flags
 */
export interface Trait {
  dr?: string[];  // damage resistance
  dv?: string[];  // damage vulnerability
  di?: string[];  // damage immunity
  ci?: string[]; // condition immunity
  bypasses?: string[];
}

/**
 * Stage data for items that unlock over time (like attunement stages)
 */
export interface ItemStage {
  name: string;
  englishName?: string;
  sourceStart?: number;
  maxUses?: number;
  acBonus?: number;
  description?: string;
  requirements?: string[];
  // Structured actions parsed from bullet points in this stage
  actions?: {
    effects?: ActionData[];
    uses?: ActionData[];
    spells?: ActionData[];
    saves?: ActionData[];
  };
}

/**
 * Parsed item structure - intermediate representation before Foundry VTT JSON generation
 */
export interface ParsedItem {
  name: string;
  englishName?: string;
  type: ItemType;
  // Optional source image path.  Item generation preserves this exact path
  // instead of silently replacing it with the neutral fallback icon.
  img?: string;

  // Physical properties
  quantity?: number;
  weight?: WeightData;
  price?: PriceData;
  rarity?: ItemRarity;

  // Equippable items
  attunement?: AttunementType;
  equipmentSubtype?: 'ring' | 'wand' | 'rod' | 'wondrous';
  consumableSubtype?: 'potion' | 'scroll';
  consumesPotion?: true;
  container?: ItemContainerData;
  spellScroll?: ItemSpellScrollData;
  spellStorage?: ItemSpellStorageData;
  timedSpeed?: ItemTimedSpeedData;
  summon?: ItemSummonData;
  randomSummon?: ItemRandomSummonData;
  lastChargeCheck?: ItemLastChargeCheck;
  enchantment?: ItemEnchantmentData;

  // Item description
  description?: string;
  source?: string;
  /** Source-derived clauses whose mechanics cannot yet be represented unambiguously. */
  unresolvedMechanics?: string[];

  // Weapon-specific
  weaponBonus?: number;
  // Source subtype mapping for standard weapon families (for example spear).
  weapon?: {
    value: string;
    baseItem: string;
    /** Explicit native dnd5e mastery from the source, projected to system.mastery. */
    mastery?: WeaponMasteryId;
  };
  /** Explicit native dnd5e mastery source field, independent of module rule selection. */
  nativeMastery?: WeaponMasteryId;
  /** Explicit weapon mastery/properties configuration from the source. */
  weaponConfiguration?: WeaponConfiguration;
  damage?: DamageData;
  range?: RangeData;
  properties?: string[];

  // Armor-specific
  armor?: ArmorData;

  // Consumable/charged items
  uses?: UsesData;

  // Activities (attacks, spellcasting, etc.)
  activities?: Record<string, ActivityData>;

  // Item stages (for items that evolve or unlock)
  stages?: ItemStage[];
  stagePreamble?: string;

  // Cumulative requirements from all previous stages (for multi-stage items)
  cumulativeRequirements?: string[];

  // Traits (resistances, immunities)
  traits?: Trait;

  // For structured actions like attacks, saves, utilities, casts
  structuredActions?: {
    attacks?: ActionData[];
    saves?: ActionData[];
    utilities?: ActionData[];
    casts?: ActionData[];
    spells?: ActionData[];
    effects?: ActionData[];
    uses?: ActionData[];
  };
}

// Source category tokens used by formal Intake; broader legacy prose parsing remains below.
const FORMAL_ITEM_CATEGORIES: ReadonlyArray<readonly [RegExp, ItemType, string?]> = [
  [/^(?:ring|戒指)$/iu, 'equipment', 'ring'],
  [/^(?:wondrous(?: item)?|奇物)$/iu, 'equipment', 'wondrous'],
  [/^(?:equipment|装备|accessory|饰物|饰品)$/iu, 'equipment'],
  [/^(?:wand|魔杖)$/iu, 'wand', 'wand'],
  [/^(?:rod|魔棒|权杖|權杖)$/iu, 'rod', 'rod'],
  [/^(?:staff|法杖|杖)$/iu, 'staff', 'quarterstaff'],
  [/^(?:shield|盾牌|盾)$/iu, 'armor', 'shield'],
  [/^(?:armor|armour|护甲|甲)$/iu, 'armor'],
  [/^(?:armou?r\s*\(\s*(?:any\s+)?light\s*,\s*medium\s*,?\s*or\s+heavy\s*\)|护甲\s*\(\s*(?:任意)?轻(?:型|甲)?[、,，]\s*中(?:型|甲)?[、,，或]\s*重(?:型|甲)?护甲?\s*\))$/iu, 'armor'],
  [/^(?:weapon|武器|武器攻击)$/iu, 'weapon'],
  [/^(?:weapon\s*\(\s*any simple or martial\s*\)|武器\s*\(\s*(?:任意)?简易(?:或|[、,，])军用(?:武器)?\s*\))$/iu, 'weapon'],
  [/^(?:longsword|长剑|長劍)$/iu, 'weapon', 'longsword'],
  [/^(?:spear|长矛|長矛|矛)$/iu, 'weapon', 'spear'],
  [/^(?:dagger|匕首)$/iu, 'weapon', 'dagger'],
  [/^(?:quarterstaff|长棍|長棍)$/iu, 'weapon', 'quarterstaff'],
  [/^(?:potion|药水|藥水)$/iu, 'consumable', 'potion'],
  [/^(?:scroll|spell scroll|卷轴|卷軸|法术卷轴|法術卷軸)$/iu, 'consumable', 'scroll'],
  [/^(?:consumable|消耗品)$/iu, 'consumable'],
  [/^(?:ammunition|arrow|bolt|弹药|箭|弩箭)$/iu, 'ammunition'],
  [/^(?:tool|工具)$/iu, 'tool'],
  [/^(?:loot|treasure|战利品|宝物)$/iu, 'loot'],
  [/^(?:container|backpack|容器|背包)$/iu, 'container'],
];

export function resolveFormalItemCategory(label: string): { type: ItemType; subtype?: string } | undefined {
  const normalized = label.trim().replace(/[（）]/g, (char) => char === '（' ? '(' : ')');
  const completeCategory = FORMAL_ITEM_CATEGORIES.find(([pattern]) => pattern.test(normalized));
  if (completeCategory) {
    const [, type, subtype] = completeCategory;
    return { type, ...(subtype ? { subtype } : {}) };
  }
  const parts = normalized
    .split(/\s*[()\/]\s*|(?<=[\p{Script=Han}])\s+(?=[a-z])/iu).filter(Boolean);
  const categories = parts.map((part) => FORMAL_ITEM_CATEGORIES.find(([pattern]) => pattern.test(part)));
  const first = categories[0];
  const last = categories.at(-1);
  if (!first || !last || categories.length > 2 || first[1] !== last[1]
    || (first[2] && last[2] && first[2] !== last[2])) return undefined;
  const subtype = first[2] ?? last[2];
  return { type: first[1], ...(subtype ? { subtype } : {}) };
}
