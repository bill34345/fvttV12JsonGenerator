export interface FieldDefinition {
  key: string;       // Internal simplified key (e.g., "str", "hp")
  path: string;      // Foundry VTT target path (e.g., "system.abilities.str.value")
  type: "string" | "number" | "object" | "array" | "html";
  required?: boolean;
}

export const FIELD_MAPPING: Record<string, FieldDefinition> = {
  // Basic Info
  "名称": { key: "name", path: "name", type: "string", required: true },
  "类型": { key: "type", path: "type", type: "string", required: true },
  "体型": { key: "size", path: "system.traits.size", type: "string" },
  "生物类型": { key: "creatureType", path: "system.details.type.value", type: "string" },
  "阵营": { key: "alignment", path: "system.details.alignment", type: "string" },

  // Abilities
  "力量": { key: "str", path: "system.abilities.str.value", type: "number" },
  "敏捷": { key: "dex", path: "system.abilities.dex.value", type: "number" },
  "体质": { key: "con", path: "system.abilities.con.value", type: "number" },
  "智力": { key: "int", path: "system.abilities.int.value", type: "number" },
  "感知": { key: "wis", path: "system.abilities.wis.value", type: "number" },
  "魅力": { key: "cha", path: "system.abilities.cha.value", type: "number" },

  // Attributes
  "生命值": { key: "hp", path: "system.attributes.hp.value", type: "object" }, // { value, max, formula }
  "护甲等级": { key: "ac", path: "system.attributes.ac.flat", type: "object" }, // { value, calc: "flat" }
  "速度": { key: "movement", path: "system.attributes.movement", type: "object" }, // { walk, fly, ... }
  "先攻": { key: "init", path: "system.attributes.init.bonus", type: "number" },
  "熟练加值": { key: "prof", path: "system.attributes.prof", type: "number" },

  // Details
  "挑战等级": { key: "cr", path: "system.details.cr", type: "number" },
  "经验值": { key: "xp", path: "system.details.xp.value", type: "number" },
  "传记": { key: "biography", path: "system.details.biography.value", type: "html" },
  "背景": { key: "biography", path: "system.details.biography.value", type: "html" }, // Alias

  // Items / Actions
  "动作": { key: "actions", path: "items", type: "array" },
  "反应": { key: "reactions", path: "items", type: "array" },
  "附赠动作": { key: "bonus_actions", path: "items", type: "array" },
  "传奇动作": { key: "legendary_actions", path: "items", type: "array" },
  "巢穴动作": { key: "lair_actions", path: "items", type: "array" },
  "巢穴效应": { key: "regional_effects", path: "items", type: "array" },
  "施法": { key: "spellcasting", path: "items", type: "object" }, // Complex object

  // Lists / Traits
  "豁免熟练": { key: "saves", path: "system.abilities", type: "array" }, // Special handling in parser
  "技能": { key: "skills", path: "system.skills", type: "object" }, // { "ste": 1, ... }
  "伤害抗性": { key: "dr", path: "system.traits.dr", type: "array" },
  "伤害易伤": { key: "dv", path: "system.traits.dv", type: "array" },
  "伤害免疫": { key: "di", path: "system.traits.di", type: "array" },
  "伤害调整": { key: "dm", path: "system.traits.dm", type: "object" },
  "状态免疫": { key: "ci", path: "system.traits.ci", type: "array" },
  "感官": { key: "senses", path: "system.traits.senses", type: "object" },
  "语言": { key: "languages", path: "system.traits.languages", type: "array" },
};

// Intermediate Parsed Structure
export interface ParsedNPC {
  name: string;
  type: "npc";
  
  abilities: {
    str?: number;
    dex?: number;
    con?: number;
    int?: number;
    wis?: number;
    cha?: number;
  };

  attributes: {
    hp?: { value: number; max: number; formula?: string };
    ac?: { value: number; calc: "flat" | "natural" | "default" };
    movement?: Record<string, number>;
    init?: number;
    prof?: number;
    legact?: { value: number; max: number };
  };

  details: {
    cr?: number;
    xp?: number;
    biography?: string;
    alignment?: string;
    creatureType?: string;
  };

  traits: {
    size?: string;
    dr?: string[];
    dv?: string[];
    di?: string[];
    dm?: any;
    ci?: string[];
    languages?: string[];
    senses?: Record<string, number>;
    bypasses?: string[];
  };

  skills?: Record<string, number>; // key (e.g. 'ste') -> value (1 or 2)
  saves?: string[]; // list of ability keys (e.g. 'str')
  lairInitiative?: number;

  actions?: string[];
  bonus_actions?: any;
  reactions?: any;
  legendary_actions?: any; // complex
  lair_actions?: any;
  regional_effects?: any;
  spellcasting?: any;

  items: any[]; // Placeholders for actions/spells
}

export const COMPENDIUM_PACK = "Compendium.dnd5e.spells.Item";
