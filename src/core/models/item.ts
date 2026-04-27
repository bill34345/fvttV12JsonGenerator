import type { StructuredActionData, ActionData } from "./action";

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
export type ItemRarity = "common" | "uncommon" | "rare" | "veryrare" | "legendary" | "artifact";

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
  value: number;
}

/**
 * Uses/recovery structure for consumable items with charges
 */
export interface UsesData {
  max: string;
  recovery: Array<{
    period: "dawn" | "day" | "rest" | "hour" | "charges" | string;
    type: "formula" | "formulaic" | string;
    formula?: string;
    amount?: number;
  }>;
  spent: number;
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

  // Physical properties
  quantity?: number;
  weight?: WeightData;
  price?: PriceData;
  rarity?: ItemRarity;

  // Equippable items
  attunement?: AttunementType;

  // Item description
  description?: string;
  source?: string;

  // Weapon-specific
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
    effects?: ActionData[];
    uses?: ActionData[];
  };
}
