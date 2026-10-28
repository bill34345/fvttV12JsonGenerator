import type { WeaponConfiguration, WeaponMasteryId } from '@fvtt-json-generator/contracts/weapon-properties';
import type { SourceOperation,NativeFailureStatus } from './sourceOperationTypes';
export type {NativeFailureStatus} from './sourceOperationTypes';

/** A counter for a source-listed, GM-resolved spell; never a Cast Activity. */
export interface ManualSpellUseRecord { name: string; max: number; period: 'day' }

/** A separate native Save invoked by the GM after the explicit source trigger. */
export interface GmTriggeredSave {
  dc: number;
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  trigger: string;
  sourceText: string;
  failureStatuses: NativeFailureStatus[];
}

/** Source-derived action intermediate representation shared by parsing and generation. */
export interface Damage {
  formula: string;
  type: string;
  types?: string[];
  /** V14-native dice scaling, such as 2d8 per additional charge. */
  scaling?: {
    mode: 'whole' | 'half' | string;
    number: number;
    formula?: string;
  };
}

export interface HealingPart {
  formula: string;
  type: 'healing' | 'temphp';
  /** Explicit recipient; source qualifications stay literal and GM-reviewed. */
  target?: { type:'self'|'creature'|'any'; count?:number; special?:string };
}

export type SaveOutcome = 'none' | 'half' | 'full' | 'literal';

export interface ActionData {
  name: string;
  logicalPath?: string;
  englishName?: string;
  type: "attack" | "save" | "damage" | "heal" | "utility" | "effect" | "use" | "spell";
  desc?: string;

  /** Explicit source configuration for a weapon action; never inferred from its label. */
  weaponConfiguration?: WeaponConfiguration;
  /** Native dnd5e mastery written by the source and projected to system.mastery. */
  nativeMastery?: WeaponMasteryId;

  attack?: {
    type: "mwak" | "rwak" | "msak" | "rsak";
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
    outcome?: SaveOutcome;
    onSave?: string;
    onFail?: string;
    /** Literal source qualifier for when the save applies. */
    condition?: string;
  };

  healing?: HealingPart;

  recharge?: {
    value: number;
    charged: boolean;
  };

  target?: {
    value: number;
    type: string;
    units: string;
  };

  /**
   * Source-explicit individual targets. This is separate from `target`,
   * which is the legacy area/template target shape consumed by the Activity
   * generator.
   */
  targetAffected?: ActionTarget;

  damage?: Damage[];
  sourceDamageParts?: SourceDamagePart[];
  sourceRuleFacts?: SourceRuleFact[];

  activity?: {
    targetSpecial?: string;
    duration?: {
      value: string;
      units: 'round' | 'minute' | 'hour' | 'day' | string;
      concentration: boolean;
    };
    range?: {
      value: string | number;
      units: 'ft' | string;
    };
    target?: {
      template: {
        type: 'radius' | string;
        size: string;
        units: 'ft' | string;
      };
      affects?: {
        count: number | string;
        type: 'creature' | 'object' | string;
        special?: string;
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
  /** Stable dnd5e spell identifier supplied by the Item mechanics contract. */
  spellIdentifier?: string;
  usesPerDay?: number;

  /**
   * A source-explicit token-light operation.  This is intentionally separate
   * from generic utility text: the generator must create a non-transfer Item
   * effect and the Activity must apply that exact effect without consuming the
   * Item's uses.
   */
  light?: {
    bright: number;
    /** Outer edge of dim light, not "additional dim distance". */
    dim: number;
    activation: 'action' | 'bonus' | 'reaction' | 'free';
    consumption: number;
    extinguish?: 'disable-effect';
  };

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
    consumptionScaling?: {
      allowed: boolean;
      max: string;
    };
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
export type ActivityType = 'attack' | 'save' | 'damage' | 'heal' | 'utility';
  export type AoeShape = '球形' | '半径' | '锥形' | '线形' | '立方体' | '圆柱形' | '矩形';
export type TriggerType = '命中后' | '失败' | '成功' | '低值' | '降至0' | '濒血' | 'special';
export type SaveAbility = '力量' | '敏捷' | '体质' | '智力' | '感知' | '魅力' | 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface DamagePart {
  formula: string;
  type: string;
  types?: string[];
}

/** Preserve source relationships when a branch cannot become native damage. */
export interface SourceDamagePart extends DamagePart {
  relationship: 'base' | 'additional' | 'conditional' | 'replacement';
  condition?: string;
}

/** Complete supported source clauses, parsed before Actor and Chinese projection. */
export type SourceRuleFact =
  | { kind: 'attack-damage'; source: string; attackType: 'mwak' | 'rwak';
      toHit: number; distance: string; target: string; average: number; formula: string; damageType: string }
  | { kind: 'save-damage'; source: string; targetScope: { kind: 'target' } | { kind: 'area' }
      | { kind: 'within'; feet: number }; dc: number; ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
      average: number; formula: string; damageType: string; halfOnSuccess: boolean }
  | { kind: 'save-status'; source: string; requiredTargetStatus: string; withinFeet: number;
      dc: number; ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'; appliedStatus: string;
      duration: 'target-next-turn-end'; failureMarginDropToZero?: number }
  | { kind: 'save-damage-status'; source: string; withinFeet: number;
      dc: number; ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
      average: number; formula: string; damageType: string; appliedStatus: string;
      duration: 'target-next-turn-end'; halfOnSuccess: true }
  | { kind: 'visible-target-save-damage'; source: string; viewer: string; withinFeet: number;
      dc: number; ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
      damages: Array<{ average: number; formula: string; damageType: string }>;
      halfOnSuccess: true }
  | { kind: 'heavy-armour-half'; source: string; targetCondition: 'grappled' | 'restrained'; grappler: string;
      average: number; formula: string; damageType: string; armourNegated: boolean }
  | { kind: 'food-retention'; source: string; food: 'solid'; requiredLiquid: 'sea-water'; outcome: 'retain-not-vomit' }
  | { kind: 'target-choice-save'; source: string;
      targetScope: { kind: 'area'; feet: number; areaSource: string }
        | { kind: 'within'; feet: number; mustSeeSource: boolean };
      choices: ['int', 'wis'];
      dc: number; failedStatus: string; duration: { value: number; unit: 'minute' | 'round' | 'hour' };
      repeatAt: 'start' | 'end' }
  | { kind: 'forced-movement'; source: string; target: 'creature' | 'target'; dc: number;
      ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'; distance: number;
      distanceFormula?: string; origin: string };

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
  healing?: HealingPart;
  embeddedEffects?: EmbeddedEffect[];
  describe?: string;
}

export interface EmbeddedEffect {
  type: string;
  statuses?:string[];
  exhaustionLevels?:number;
  describe: string;
  /** Explicit applicability/ending rule; retained for GM handling, never parsed from prose. */
  condition?: string;
  duration?: string;
  damageType?: string;
  damageFormula?: string;
  escapeDc?: number;
  staged?: boolean;
}

export interface SpecialEffect {
  trigger: '降至0' | '濒血' | string;
  describe: string;
}

export interface StructuredActionData {
  /** Program-owned canonical conversion boundary: never infer mechanics from prose. */
  literalMechanics?: true;
  candidateReview?: import('./sourceOperationTypes').SourceCandidateReview;
  candidateCounters?: import('./sourceOperationTypes').SourceCandidateCounter[];
  sourceFeatureId?:string;
  sourceOperations?: SourceOperation[];
  sourceContext?: string[];
  /** Explicit source workflow boundary. Prose must not generate executable mechanics. */
  executionMode?: 'gm-manual' | 'native-with-gm';
  nativeRuleText?: string;
  spellUseRecords?: ManualSpellUseRecord[];
  gmTriggeredSave?: GmTriggeredSave;
  nativeFailureStatuses?: NativeFailureStatus[];
  manualRemainder?: string;
  saveOutcome?: 'none' | 'half' | 'full';
  targetSpecial?: string;
  name: string;
  englishName?: string;
  /** Stable source-derived bridge to a portable spell manifest feature. */
  spellcastingFeatureKey?: string;
  type: ActivityType;
  activation?: {
    type: ActivityActivationType;
    cost?: number;
    condition?: string;
    explicit?: boolean;
  };
  attackType?: 'mwak' | 'rwak' | 'msak' | 'rsak';
  toHit?: number;
  range?: string;
  damage?: DamagePart[];
  sourceDamageParts?: SourceDamagePart[];
  sourceRuleFacts?: SourceRuleFact[];
  healing?: HealingPart;
  DC?: number;
  ability?: SaveAbility;
  saveCondition?: string;
  dcSourceAbility?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  dcSourceKind?: 'ability' | 'spellcasting' | 'literal';
  aoe?: AoeTemplate;
  target?: ActionTarget;
  recharge?: [number, number];
  perLongRest?: number;
  /** Explicit source resource period, kept separate from legacy long-rest metadata. */
  uses?: { max:number; period:'day'|'longRest'|'shortRest'|'dawn' };
  legendaryCost?: number;
  concentration?: boolean;
  describe?: string;
  /** Explicit source configuration for a weapon action; never inferred from its label. */
  weaponConfiguration?: WeaponConfiguration;
  /** Native dnd5e mastery written by the source and projected to system.mastery. */
  nativeMastery?: WeaponMasteryId;
  failEffects?: SaveEffect[];
  successEffects?: SaveEffect[];
  lowValueThreshold?: number;
  lowValueEffects?: SaveEffect[];
  specialEffects?: SpecialEffect[];
  subActions?: SubAction[];
  embeddedEffects?: EmbeddedEffect[];

  // Nested attack structure compatible with ActivityGenerator
  attack?: {
    type: "mwak" | "rwak" | "msak" | "rsak";
    toHit: number;
    range: string;
    reach?: string;
    damage: Damage[];
    versatile?: {
      formula: string;
    };
  };
}
