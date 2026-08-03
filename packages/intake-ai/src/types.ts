import type { EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import type { IconWorkflowOptions } from '@fvtt-json-generator/workflows/icon-port';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { CanonicalMonster } from '@fvtt-json-generator/models/canonical-monster';

export type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
export type {
  AbilityKey,
  CanonicalAppliedCondition,
  CanonicalDamagePart,
  CanonicalFeature,
  CanonicalMonster,
  CanonicalSpellComponentWaiver,
  CanonicalSpellcastingGroup,
  CanonicalSpellRef,
  CanonicalSpellUsageGroup,
  CreatureSize,
} from '@fvtt-json-generator/models/canonical-monster';

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
export type IntakeSection = 'trait' | 'action' | 'bonus' | 'reaction' | 'legendary' | 'mythic';

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
  iconOptions?: IconWorkflowOptions;
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
