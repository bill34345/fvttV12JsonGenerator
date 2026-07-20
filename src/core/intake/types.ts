import type { EffectProfile } from '../generator/effectProfileApplier';
import type { FvttTargetVersion } from '../foundryTarget';
import type { PortableSpellRef } from '../spell-resolution/types';

export type MonsterIntakeStatus = 'accepted' | 'needs_review' | 'failed';

export interface PortableSpellResolutionStatus {
  required: boolean;
  status: 'not-required' | 'pending' | 'hydrated' | 'needs_review' | 'failed';
  manifestId?: string;
  spellCount: number;
  reportPath?: string;
}
export type ClaimKind = 'explicit' | 'derived' | 'preserved-literal' | 'user-confirmed';
export type IntakeConfidence = 'high' | 'medium' | 'low';
export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type CreatureSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
export type IntakeSection = 'trait' | 'action' | 'bonus' | 'reaction' | 'legendary';

export interface EvidenceRef {
  start: number;
  end: number;
  quote: string;
}

export interface IntakeClaim {
  path: string;
  valueKind: ClaimKind;
  evidence: EvidenceRef[];
  confidence: IntakeConfidence;
  value?: unknown;
  decisionId?: string;
}

export interface SourceCoverageEntry extends EvidenceRef {
  classification: 'mechanical' | 'narrative' | 'ignored-with-reason';
  claimPaths: string[];
  reason?: string;
}

export interface IntakeUncertainty {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  evidence: EvidenceRef[];
  candidates?: unknown[];
}

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

export interface MonsterIntakeIR {
  schemaVersion: 1;
  source: { sha256: string; length: number };
  creature: CanonicalMonster;
  claims: IntakeClaim[];
  coverage: SourceCoverageEntry[];
  uncertainties: IntakeUncertainty[];
}

export interface DiscoveryCandidate extends EvidenceRef {
  id: string;
  label: string;
}

export interface DiscoveryRequest {
  source: string;
  sourceSha256: string;
  chunkStart: number;
  chunkEnd: number;
}

export interface DiscoveryResult {
  schemaVersion: 1;
  candidates: DiscoveryCandidate[];
}

export interface ExtractionRequest {
  source: string;
  sourceSha256: string;
  candidate: DiscoveryCandidate;
}

export interface IntakeFinding {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  evidence?: EvidenceRef[];
  candidates?: unknown[];
  origin: 'schema' | 'evidence' | 'coverage' | 'semantic' | 'ai-review' | 'conflict' | 'provider';
}

export interface IntakeValidationResult {
  findings: IntakeFinding[];
  blocking: IntakeFinding[];
  warnings: IntakeFinding[];
}

export interface ReviewRequest {
  source: string;
  ir: MonsterIntakeIR;
  markdown: string;
  actorProjection: unknown;
  deterministicFindings: IntakeFinding[];
}

export interface AiReviewResult {
  schemaVersion: 1;
  verdict: 'accepted' | 'revise' | 'needs_review';
  findings: IntakeFinding[];
}

export type RepairRequest =
  | {
      stage: 'deterministic-validation';
      source: string;
      ir: MonsterIntakeIR;
      deterministicFindings: IntakeFinding[];
    }
  | {
      stage: 'semantic-review';
      source: string;
      ir: MonsterIntakeIR;
      markdown: string;
      actorProjection: unknown;
      deterministicFindings: IntakeFinding[];
      review: AiReviewResult;
    };

export interface MonsterIntakeAiProvider {
  readonly providerName: string;
  readonly extractionModel: string;
  readonly reviewModel: string;
  discover(request: DiscoveryRequest): Promise<DiscoveryResult>;
  extract(request: ExtractionRequest): Promise<MonsterIntakeIR>;
  review(request: ReviewRequest): Promise<AiReviewResult>;
  repair(request: RepairRequest): Promise<MonsterIntakeIR>;
}

export interface MonsterIntakeOptions {
  source: string;
  sourceName: string;
  runRoot?: string;
  vaultPath?: string;
  dryRun?: boolean;
  fvttVersion?: Extract<FvttTargetVersion, '12' | '14'>;
  effectProfile?: EffectProfile;
  replaceConflicts?: Set<string>;
}

export interface MonsterIntakeCreatureResult {
  id: string;
  label: string;
  status: MonsterIntakeStatus;
  bundlePath: string;
  findings: IntakeFinding[];
  calls: { extraction: number; review: number; repair: number };
  spellResolution: PortableSpellResolutionStatus;
  markdownPath?: string;
  actorPath?: string;
}

export interface MonsterIntakeRunResult {
  runId: string;
  sourceSha256: string;
  runPath: string;
  status: 'succeeded' | 'needs_review' | 'partial' | 'failed' | 'dry_run';
  creatures: MonsterIntakeCreatureResult[];
  discoveryCount: number;
  estimatedMaxCalls?: number;
}

export type DecisionAction = 'select' | 'set' | 'preserve-literal' | 'exclude';

export interface IntakeDecision {
  issueId: string;
  action: DecisionAction;
  value?: unknown;
  note?: string;
}

export interface IntakeDecisionsFile {
  runId: string;
  sourceSha256: string;
  decisions: IntakeDecision[];
}
