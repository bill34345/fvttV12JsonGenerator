import type { EvidenceRef } from '@fvtt-json-generator/contracts/evidence';
import type { CanonicalSpecies } from '@fvtt-json-generator/models/species';

export type SpeciesIntakeStatus = 'accepted' | 'needs_review' | 'failed';

export interface SpeciesDiscoveryCandidate extends EvidenceRef { id: string; label: string }
export interface SpeciesDiscoveryResult { schemaVersion: 1; candidates: SpeciesDiscoveryCandidate[] }

export interface SpeciesIntakeClaim {
  path: string;
  evidence: EvidenceRef[];
  value?: unknown;
}

export interface SpeciesIntakeCoverage extends EvidenceRef {
  classification: 'mechanical' | 'narrative' | 'ignored-with-reason';
  claimPaths: string[];
  reason?: string;
}

export interface SpeciesIntakeUncertainty {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  evidence: EvidenceRef[];
}

export interface SpeciesIntakeIR {
  schemaVersion: 1;
  source: { sha256: string; length: number; originalSha256?: string };
  species: Omit<CanonicalSpecies, 'schemaVersion' | 'rawSource' | 'source'> & {
    source: CanonicalSpecies['source'];
  };
  claims: SpeciesIntakeClaim[];
  coverage: SpeciesIntakeCoverage[];
  uncertainties: SpeciesIntakeUncertainty[];
}

export interface SpeciesIntakeFinding {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  origin: 'schema' | 'evidence' | 'coverage' | 'semantic' | 'provider' | 'ai-review' | 'conflict' | 'projection';
  evidence?: EvidenceRef[];
}

export interface SpeciesReviewRequest {
  source: string;
  candidate: SpeciesDiscoveryCandidate;
  ir: SpeciesIntakeIR;
  markdown: string;
  jsonProjection: unknown;
  deterministicFindings: SpeciesIntakeFinding[];
}
export interface SpeciesAiReviewResult { schemaVersion: 1; verdict: 'accepted' | 'revise' | 'needs_review'; findings: SpeciesIntakeFinding[] }
export interface SpeciesRepairRequest { source: string; candidate: SpeciesDiscoveryCandidate; ir: SpeciesIntakeIR; deterministicFindings: SpeciesIntakeFinding[]; review?: SpeciesAiReviewResult }

export interface SpeciesIntakeAiProvider {
  readonly providerName: string;
  readonly extractionModel: string;
  readonly reviewModel: string;
  discover(request: { source: string; sourceSha256: string }): Promise<SpeciesDiscoveryResult>;
  extract(request: { source: string; sourceSha256: string; candidate: SpeciesDiscoveryCandidate }): Promise<SpeciesIntakeIR>;
  review(request: SpeciesReviewRequest): Promise<SpeciesAiReviewResult>;
  repair(request: SpeciesRepairRequest): Promise<SpeciesIntakeIR>;
}

export interface SpeciesIntakeOptions {
  source: string;
  sourceName: string;
  runRoot?: string;
  vaultPath?: string;
  dryRun?: boolean;
  fvttVersion?: '14';
  effectProfile?: 'core';
  replaceConflicts?: Set<string>;
  resumeContext?: { resumedFromRunId: string; decisionsSha256: string };
}

export interface SpeciesIntakeResultEntry {
  id: string;
  label: string;
  status: SpeciesIntakeStatus;
  bundlePath: string;
  findings: SpeciesIntakeFinding[];
  calls: { discovery: number; extraction: number; review: number; repair: number };
  markdownPath?: string;
  packagePath?: string;
}

export interface SpeciesIntakeRunResult {
  runId: string;
  sourceSha256: string;
  runPath: string;
  status: 'succeeded' | 'needs_review' | 'partial' | 'failed' | 'dry_run';
  species: SpeciesIntakeResultEntry[];
  discoveryCount: number;
  estimatedMaxCalls?: number;
}

export interface SpeciesAcceptedLedgerEntry {
  identifier: string;
  markdownPath: string;
  packagePath: string;
  markdownSha256: string;
  sourceSha256: string;
  irRevision: number;
  logicalHash: string;
  acceptedRunId: string;
  resumedFromRunId?: string;
  decisionsSha256?: string;
}

export interface SpeciesAcceptedLedger { schemaVersion: 1; moduleId: 'fvtt-homebrew-species'; entries: SpeciesAcceptedLedgerEntry[] }
export interface SpeciesIntakeDecisionsFile { runId: string; sourceSha256: string; decisions: Array<{ issueId: string; action: 'replace'; note?: string }> }
