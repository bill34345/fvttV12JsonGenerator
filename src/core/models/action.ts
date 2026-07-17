export interface Damage {
  formula: string;
  type: string;
  types?: string[];
}

export interface ActionData {
  name: string;
  englishName?: string;
  type: "attack" | "save" | "utility" | "effect" | "use" | "spell";
  desc?: string; 
  
  attack?: {
    type: "mwak" | "rwak";
    ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    toHit: number;
    range: string;
    reach?: string;
    damage: Damage[];
    versatile?: {
      formula: string;
    };
  };

  save?: {
    dc: number;
    ability: string;
    dcSourceAbility?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    dcSourceKind?: 'ability' | 'spellcasting' | 'literal';
    onSave?: string;
    onFail?: string;
  };

  recharge?: {
    value: number;
    charged: boolean;
  };
  
  target?: {
    value: number;
    type: string;
    units: string;
  };

  damage?: Damage[];

  activity?: {
    duration?: {
      value: string;
      units: 'round' | 'minute' | 'hour' | 'day' | string;
      concentration: boolean;
    };
    range?: {
      value: string;
      units: 'ft' | string;
    };
    target?: {
      template: {
        type: 'radius' | string;
        size: string;
        units: 'ft' | string;
      };
    };
  };

  aoe?: {
    type?: string;
    template?: {
      type: string;
      distance: number;
    };
  };

  // Cast activity fields (for spellcasting items like wands, staffs, rods)
  spellName?: string;
  usesPerDay?: number;

  // Effect activity fields (for passive abilities like AC bonus, water breathing)
  passiveEffect?: {
    type: 'acBonus' | 'speed' | 'senses' | 'ability' | 'other';
    value?: string | number;
    description?: string;
  };

  // Use activity fields (for charge-consuming abilities without DC)
  useAction?: {
    consumption: number;
    activation: 'action' | 'bonus' | 'reaction' | 'free';
    description?: string;
    limitedUses?: {
      spent: number;
      max: string;
      recovery: Array<{
        period: string;
        type: string;
        formula?: string;
      }>;
    };
  };
}

export type ActivityActivationType = 'action' | 'bonus' | 'reaction' | 'legendary' | 'special';
export type ActivityType = 'attack' | 'save' | 'damage' | 'utility';
export type AoeShape = '球形' | '锥形' | '线形' | '立方体' | '圆柱形' | '矩形';
export type TriggerType = '命中后' | '失败' | '成功' | '低值' | '降至0' | '濒血' | 'special';
export type SaveAbility = '力量' | '敏捷' | '体质' | '智力' | '感知' | '魅力' | 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface DamagePart {
  formula: string;
  type: string;
  types?: string[];
}

export interface AoeTemplate {
  shape: AoeShape;
  range: number;
  width?: number;
  height?: number;
}

export interface ActionTarget {
  count: number | 'all' | string;
  type: 'creature' | 'object';
  special?: string;
}

export interface SaveEffect {
  formula?: string;
  type?: string;
  state?: string;
  describe?: string;
}

export interface SubAction {
  name: string;
  type: ActivityType;
  trigger: TriggerType;
  threshold?: number;
  DC?: number;
  ability?: SaveAbility;
  dcSourceAbility?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  dcSourceKind?: 'ability' | 'spellcasting' | 'literal';
  aoe?: AoeTemplate;
  target?: ActionTarget;
  damage?: DamagePart[];
  embeddedEffects?: EmbeddedEffect[];
  describe?: string;
}

export interface EmbeddedEffect {
  type: string;
  describe: string;
  duration?: string;
  damageType?: string;
  damageFormula?: string;
}

export interface SpecialEffect {
  trigger: '降至0' | '濒血' | string;
  describe: string;
}

export interface StructuredActionData {
  name: string;
  englishName?: string;
  type: ActivityType;
  activation?: {
    type: ActivityActivationType;
    condition?: string;
    explicit?: boolean;
  };
  attackType?: 'mwak' | 'rwak' | 'msak' | 'rsak';
  toHit?: number;
  range?: string;
  damage?: DamagePart[];
  DC?: number;
  ability?: SaveAbility;
  dcSourceAbility?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  dcSourceKind?: 'ability' | 'spellcasting' | 'literal';
  aoe?: AoeTemplate;
  target?: ActionTarget;
  recharge?: [number, number];
  perLongRest?: number;
  concentration?: boolean;
  describe?: string;
  failEffects?: SaveEffect[];
  successEffects?: SaveEffect[];
  lowValueThreshold?: number;
  lowValueEffects?: SaveEffect[];
  specialEffects?: SpecialEffect[];
  subActions?: SubAction[];
  embeddedEffects?: EmbeddedEffect[];

  // Nested attack structure compatible with ActivityGenerator
  attack?: {
    type: "mwak" | "rwak";
    toHit: number;
    range: string;
    reach?: string;
    damage: Damage[];
    versatile?: {
      formula: string;
    };
  };
}
