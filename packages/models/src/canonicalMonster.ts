import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { PortableSpellRef } from '@fvtt-json-generator/spell-manifest-contracts';
import type { ManualSpellUseRecord, GmTriggeredSave, NativeFailureStatus, HealingPart } from './action';
import type { SourceOperation,SourceResourcePool,SourceCandidateReview,SourceCandidateCounter } from './sourceOperationTypes';

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type CreatureSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

export interface CanonicalDamagePart {
  formula: string;
  type: string;
  /** One damage roll with an exclusive source-listed type choice. */
  types?: string[];
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
  candidateReview?: SourceCandidateReview;
  candidateCounters?: SourceCandidateCounter[];
  sourceFeatureId?:string;
  /** Source-backed, independently clickable operations; never automatic triggers. */
  sourceOperations?: SourceOperation[];
  /** Exact shared preambles retained at every GM-operated button. */
  sourceContext?: string[];
  /** Source-complete rule deliberately adjudicated by the GM; never inferred automation. */
  executionMode?: 'gm-manual' | 'native-with-gm';
  /** Program-verified primary operation; the remaining prose is never inferred. */
  nativeRuleText?: string;
  manualRemainder?: string;
  /** Independent source-listed counters only; actual spell resolution stays GM-owned. */
  spellUseRecords?: ManualSpellUseRecord[];
  gmTriggeredSave?: GmTriggeredSave;
  nativeFailureStatuses?: NativeFailureStatus[];
  name: string;
  englishName?: string;
  /** Literal qualifier attached to the source feature label, such as (Concentration) or (1/Day). */
  sourceQualifier?: string;
  description: string;
  /** Exact source span used by Intake evidence and semantic verification. */
  evidence?: EvidenceRef[];
  activityType?: 'attack' | 'save' | 'damage' | 'heal' | 'utility';
  activationType?: 'action' | 'bonus' | 'reaction' | 'legendary' | 'special';
  activationCondition?: string;
  /** Source-explicit placement distance and literal target restriction. */
  range?: number;
  targetSpecial?: string;
  attack?: {
    type: 'mwak' | 'rwak' | 'msak' | 'rsak';
    toHit: number;
    reach?: number;
    range?: number;
    longRange?: number;
  };
  damage?: CanonicalDamagePart[];
  healing?: HealingPart;
  save?: {
    dc: number;
    ability: AbilityKey;
    condition?: string;
    dcSourceKind?: 'spellcasting' | 'literal';
    outcome?: 'none' | 'half' | 'full';
  };
  /** Source-explicit area template. The placement range remains in the literal description unless separately structured. */
  aoe?: {
    shape: 'sphere' | 'radius' | 'cone' | 'line' | 'cube' | 'cylinder' | 'rectangle';
    radius: number;
  };
  appliedConditions?: CanonicalAppliedCondition[];
  recharge?: [number, number];
  uses?: { max: number; period: 'day' | 'longRest' | 'shortRest' | 'dawn' };
  legendaryCost?: number;
}

export type CanonicalSpellRef = Pick<
  PortableSpellRef,
  'refId' | 'identifier' | 'originalName' | 'englishName' | 'chineseName' | 'aliases' | 'restrictions' | 'evidence' | 'reuseOf'
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

interface CanonicalDailySpellUsageGroup {
  usage: 'daily-each' | 'daily-shared';
  /** Source-explicit count. Its grant evidence must entail both count and sharing. */
  count: number;
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
  | CanonicalDailySpellUsageGroup
  | CanonicalPreparedCantripUsageGroup
  | CanonicalPreparedSlotUsageGroup;

export interface CanonicalSpellcastingGroup {
  candidateReview?: SourceCandidateReview;
  candidateCounters?: SourceCandidateCounter[];
  /** Complete source grants requiring GM adjudication; never executable placeholder spells. */
  manualGrants?: EvidenceRef[];
  activationType?: 'action' | 'bonus' | 'reaction' | 'legendary';
  /** Source-owned parent cooldown; Casts spend this Item pool, not a new pool. */
  recharge?: [number, number];
  legendaryCost?: number;
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
  candidateReview?: SourceCandidateReview;
  sourceResourcePools?:SourceResourcePool[];
  identity: {
    name: string;
    englishName?: string;
    size: CreatureSize;
    /** Size of each individual in a source-explicit swarm; independent of the Actor size. */
    swarmSize?: CreatureSize;
    creatureType: string;
    creatureTypeCustom?: string;
    /** Complete source size alternatives, or the label of an explicitly
     * approved largest-native mapping. size remains one current native value. */
    sourceSize?: string;
    alignment?: string;
  };
  abilities: Record<AbilityKey, number>;
  attributes: {
    ac: number;
    acKind?: 'flat' | 'natural' | 'default';
    acNote?: string;
    initiative?: number;
    hp: { value: number; formula?: string };
    movement: Partial<Record<'walk' | 'climb' | 'fly' | 'swim' | 'burrow', number>> & { hover?: boolean };
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
    /** Native lair checkbox adds exactly one; both source choices remain. */
    lairMax?: number;
    recovery?: 'own-turn-start';
    /** Explicit AI-owned native resistance ledger, independent of the title. */
    resistanceMax?: number;
    resistanceLairMax?: number;
    preamble: string;
    evidence: EvidenceRef[];
  };
  spellcasting?: CanonicalSpellcastingGroup[];
  traits: CanonicalFeature[];
  actions: CanonicalFeature[];
  bonusActions: CanonicalFeature[];
  reactions: CanonicalFeature[];
  legendaryActions: CanonicalFeature[];
  /** Foundry has no separate Mythic activation, so generation maps these to legendary activation with a distinct display section. */
  mythicActions?: CanonicalFeature[];
}
