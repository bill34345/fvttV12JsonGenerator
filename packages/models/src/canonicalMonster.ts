import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { PortableSpellRef } from '@fvtt-json-generator/spell-manifest-contracts';

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type CreatureSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

export interface CanonicalDamagePart {
  formula: string;
  type: string;
  relationship: 'base' | 'additional' | 'replacement' | 'conditional';
  condition?: string;
}

export interface CanonicalAppliedCondition {
  statuses: string[];
  escapeDc?: number;
  condition?: string;
  duration?: string;
  staged?: boolean;
}

export interface CanonicalFeature {
  name: string;
  englishName?: string;
  description: string;
  activityType?: 'attack' | 'save' | 'damage' | 'utility';
  activationType?: 'action' | 'bonus' | 'reaction' | 'legendary' | 'special';
  activationCondition?: string;
  attack?: {
    type: 'mwak' | 'rwak' | 'msak' | 'rsak';
    toHit: number;
    reach?: number;
    range?: number;
    longRange?: number;
  };
  damage?: CanonicalDamagePart[];
  save?: {
    dc: number;
    ability: AbilityKey;
    condition?: string;
  };
  appliedConditions?: CanonicalAppliedCondition[];
  recharge?: [number, number];
  uses?: { max: number; period: 'day' | 'longRest' | 'shortRest' | 'dawn' };
  legendaryCost?: number;
}

export type CanonicalSpellRef = Pick<
  PortableSpellRef,
  'refId' | 'identifier' | 'originalName' | 'englishName' | 'chineseName' | 'aliases' | 'restrictions' | 'evidence'
>;

export interface CanonicalSpellComponentWaiver {
  component: 'material';
  evidence: EvidenceRef[];
}

interface CanonicalIndependentSpellUsageGroup {
  usage: 'at-will' | '1/day-each';
  evidence: EvidenceRef[];
  spellRefs: CanonicalSpellRef[];
}

interface CanonicalPreparedCantripUsageGroup {
  usage: 'prepared-cantrip';
  evidence: EvidenceRef[];
  spellRefs: CanonicalSpellRef[];
}

interface CanonicalPreparedSlotUsageGroup {
  usage: 'prepared-slots';
  level: number;
  levelEvidence: EvidenceRef[];
  slots: number;
  slotsEvidence: EvidenceRef[];
  evidence: EvidenceRef[];
  spellRefs: CanonicalSpellRef[];
}

export type CanonicalSpellUsageGroup =
  | CanonicalIndependentSpellUsageGroup
  | CanonicalPreparedCantripUsageGroup
  | CanonicalPreparedSlotUsageGroup;

export interface CanonicalSpellcastingGroup {
  groupId: string;
  featureName: string;
  featureEnglishName?: string;
  description: string;
  evidence: EvidenceRef[];
  ability: AbilityKey;
  abilityEvidence: EvidenceRef[];
  casterLevel?: number;
  casterLevelEvidence?: EvidenceRef[];
  saveDc?: number;
  saveDcEvidence?: EvidenceRef[];
  attackBonus?: number;
  attackBonusEvidence?: EvidenceRef[];
  componentWaivers: CanonicalSpellComponentWaiver[];
  usageGroups: CanonicalSpellUsageGroup[];
}

export interface CanonicalMonster {
  identity: {
    name: string;
    englishName?: string;
    size: CreatureSize;
    creatureType: string;
    creatureTypeCustom?: string;
    alignment?: string;
  };
  abilities: Record<AbilityKey, number>;
  attributes: {
    ac: number;
    acKind?: 'flat' | 'natural' | 'default';
    acNote?: string;
    initiative?: number;
    hp: { value: number; formula?: string };
    movement: Partial<Record<'walk' | 'climb' | 'fly' | 'swim' | 'burrow', number>>;
    cr: number;
    xp?: number;
    proficiencyBonus?: number;
  };
  saves: Partial<Record<AbilityKey, number>>;
  skills: Record<string, number>;
  defenses: {
    resistances: string[];
    immunities: string[];
    vulnerabilities: string[];
    conditionImmunities: string[];
  };
  senses: Partial<Record<'darkvision' | 'blindsight' | 'tremorsense' | 'truesight', number>> & {
    passivePerception?: number;
    special?: string;
  };
  languages: { values: string[]; custom?: string };
  biography?: string;
  legendary?: {
    max: number;
    preamble: string;
    evidence: EvidenceRef[];
  };
  spellcasting?: CanonicalSpellcastingGroup[];
  traits: CanonicalFeature[];
  actions: CanonicalFeature[];
  bonusActions: CanonicalFeature[];
  reactions: CanonicalFeature[];
  legendaryActions: CanonicalFeature[];
}
