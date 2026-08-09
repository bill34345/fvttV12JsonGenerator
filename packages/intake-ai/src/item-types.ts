import type { EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { IconWorkflowOptions } from '@fvtt-json-generator/workflows/icon-port';

export type ItemIntakeStatus = 'accepted' | 'needs_review' | 'failed';
export type ItemIntakeClaimKind = 'explicit' | 'preserved-literal' | 'user-confirmed';

export interface ItemIntakeClaim {
  path: string;
  valueKind: ItemIntakeClaimKind;
  evidence: EvidenceRef[];
  value?: unknown;
}

export interface ItemIntakeCoverage extends EvidenceRef {
  classification: 'mechanical' | 'narrative' | 'ignored-with-reason';
  claimPaths: string[];
  reason?: string;
}

export interface ItemIntakeUncertainty {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  evidence: EvidenceRef[];
  candidates?: unknown[];
}

export interface ItemIntakeUses {
  max: number;
  recovery: Array<{
    period: 'dawn';
    type: 'recoverAll';
  }>;
}

export interface ItemIntakePassiveAcAbility {
  id: string;
  kind: 'passive-ac';
  value: number;
  evidence: EvidenceRef[];
}

export interface ItemIntakeLightAbility {
  id: string;
  kind: 'light';
  activation: 'action' | 'bonus' | 'reaction' | 'free';
  consumption: 0;
  bright: number;
  /** The outer dim-light edge, not a distance additional to bright light. */
  dim: number;
  extinguish: 'disable-effect';
  evidence: EvidenceRef[];
}

export interface ItemIntakeSpellAbility {
  id: string;
  kind: 'spell';
  activation: 'action' | 'bonus' | 'reaction' | 'free';
  consumption: number;
  spell: {
    identifier: string;
    name: string;
  };
  evidence: EvidenceRef[];
}

export type ItemIntakeAbility =
  | ItemIntakePassiveAcAbility
  | ItemIntakeLightAbility
  | ItemIntakeSpellAbility;

export interface ItemIntakeIR {
  schemaVersion: 1;
  source: { sha256: string; length: number };
  item: {
    name: string;
    englishName?: string;
    type: string;
    rarity?: string;
    attunement?: 'required' | 'optional' | 'none';
    /** Source stage labels are preserved, but Item stages still project through the existing parser. */
    stages?: Array<{ name: string; evidence: EvidenceRef[] }>;
    uses?: ItemIntakeUses;
    abilities: ItemIntakeAbility[];
  };
  claims: ItemIntakeClaim[];
  coverage: ItemIntakeCoverage[];
  uncertainties: ItemIntakeUncertainty[];
}

export interface ItemDiscoveryCandidate extends EvidenceRef {
  id: string;
  label: string;
}

export interface ItemDiscoveryRequest {
  source: string;
  sourceSha256: string;
}

export interface ItemDiscoveryResult {
  schemaVersion: 1;
  candidates: ItemDiscoveryCandidate[];
}

export interface ItemExtractionRequest {
  source: string;
  sourceSha256: string;
  candidate: ItemDiscoveryCandidate;
}

export interface ItemIntakeFinding {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  origin: 'schema' | 'evidence' | 'coverage' | 'semantic' | 'provider' | 'ai-review' | 'conflict';
  evidence?: EvidenceRef[];
  candidates?: unknown[];
}

export interface ItemIntakeValidationResult {
  findings: ItemIntakeFinding[];
  blocking: ItemIntakeFinding[];
  warnings: ItemIntakeFinding[];
}

export interface ItemReviewRequest {
  source: string;
  candidate: ItemDiscoveryCandidate;
  ir: ItemIntakeIR;
  markdown: string;
  itemProjection: unknown;
  deterministicFindings: ItemIntakeFinding[];
}

export interface ItemAiReviewResult {
  schemaVersion: 1;
  verdict: 'accepted' | 'revise' | 'needs_review';
  findings: ItemIntakeFinding[];
}

export interface ItemRepairRequest {
  source: string;
  candidate: ItemDiscoveryCandidate;
  ir: ItemIntakeIR;
  deterministicFindings: ItemIntakeFinding[];
  review?: ItemAiReviewResult;
}

export interface ItemIntakeAiProvider {
  readonly providerName: string;
  readonly extractionModel: string;
  readonly reviewModel: string;
  discover(request: ItemDiscoveryRequest): Promise<ItemDiscoveryResult>;
  extract(request: ItemExtractionRequest): Promise<ItemIntakeIR>;
  review(request: ItemReviewRequest): Promise<ItemAiReviewResult>;
  repair(request: ItemRepairRequest): Promise<ItemIntakeIR>;
}

export interface ItemIntakeOptions {
  source: string;
  sourceName: string;
  runRoot?: string;
  vaultPath?: string;
  dryRun?: boolean;
  fvttVersion?: Extract<FvttTargetVersion, '14'>;
  effectProfile?: Extract<EffectProfile, 'core'>;
  replaceConflicts?: Set<string>;
  iconOptions?: IconWorkflowOptions;
}

export interface ItemIntakeResultEntry {
  id: string;
  label: string;
  status: ItemIntakeStatus;
  bundlePath: string;
  findings: ItemIntakeFinding[];
  calls: { discovery: number; extraction: number; review: number; repair: number };
  markdownPath?: string;
  itemPath?: string;
}

export interface ItemIntakeRunResult {
  runId: string;
  sourceSha256: string;
  runPath: string;
  status: 'succeeded' | 'needs_review' | 'partial' | 'failed' | 'dry_run';
  items: ItemIntakeResultEntry[];
  discoveryCount: number;
  estimatedMaxCalls?: number;
}

export interface ItemIntakeDecisionsFile {
  runId: string;
  sourceSha256: string;
  decisions: Array<{
    issueId: string;
    action: 'set' | 'preserve-literal' | 'exclude' | 'replace';
    value?: unknown;
    note?: string;
  }>;
}
