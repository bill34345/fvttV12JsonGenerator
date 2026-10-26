import { hashSource, type Sha256 } from '@fvtt-json-generator/forge-gateway-protocol';

export const FORGE_INTAKE_REVIEW_BUNDLE_SCHEMA = 'forge-intake-review-bundle' as const;
export const FORGE_INTAKE_REVIEW_BUNDLE_VERSION = 1 as const;

export type ForgeIntakeObjectKind = 'actor' | 'item';
export type ForgeIntakeMode = 'plaintext-actor' | 'ai-monster' | 'ai-item';
export type ForgeIntakeReviewStatus =
  | 'empty'
  | 'analyzing'
  | 'ready_to_generate'
  | 'generating_and_reviewing'
  | 'ready_for_gm_review'
  | 'reviewed_candidate'
  | 'repairing'
  | 'regenerating'
  | 'accepted'
  | 'needs_review'
  | 'failed'
  | 'rejected'
  | 'committing_and_reading_back';

export type ForgeIntakeReviewEvent =
  | 'analyze'
  | 'analysis_ready'
  | 'analysis_needs_review'
  | 'analysis_failed'
  | 'generate'
  | 'generation_accepted'
  | 'generation_ready_for_gm_review'
  | 'generation_needs_review'
  | 'generation_failed'
  | 'gm_approve'
  | 'gm_approve_candidate'
  | 'commit_candidate_finished'
  | 'repair'
  | 'repair_ready'
  | 'repair_needs_review'
  | 'repair_failed'
  | 'repair_candidate_ready'
  | 'repair_candidate_kept'
  | 'regenerate'
  | 'regeneration_started'
  | 'reject'
  | 'commit'
  | 'commit_finished'
  | 'clear';

const REVIEW_TRANSITIONS: Readonly<Record<ForgeIntakeReviewStatus, Partial<Record<ForgeIntakeReviewEvent, ForgeIntakeReviewStatus>>>> = {
  empty: { analyze: 'analyzing', clear: 'empty' },
  analyzing: {
    analysis_ready: 'ready_to_generate',
    analysis_needs_review: 'needs_review',
    analysis_failed: 'failed',
    clear: 'empty',
  },
  ready_to_generate: { generate: 'generating_and_reviewing', clear: 'empty' },
  generating_and_reviewing: {
    generation_accepted: 'accepted',
    generation_ready_for_gm_review: 'ready_for_gm_review',
    generation_needs_review: 'needs_review',
    generation_failed: 'failed',
    clear: 'empty',
  },
  ready_for_gm_review: { generate:'generating_and_reviewing',gm_approve: 'accepted',gm_approve_candidate:'reviewed_candidate', repair:'repairing', regenerate: 'regenerating', reject: 'rejected', clear: 'empty' },
  reviewed_candidate:{commit:'committing_and_reading_back',clear:'empty'},
  repairing: {
    repair_ready: 'ready_to_generate',
    repair_needs_review: 'needs_review',
    repair_failed: 'failed',
    repair_candidate_ready: 'ready_for_gm_review',
    repair_candidate_kept: 'ready_for_gm_review',
    clear: 'empty',
  },
  regenerating: { regeneration_started: 'analyzing', clear: 'empty' },
  accepted: { commit: 'committing_and_reading_back', clear: 'empty' },
  needs_review: { generate: 'generating_and_reviewing', repair: 'repairing', regenerate: 'regenerating', reject: 'rejected', clear: 'empty' },
  failed: { regenerate: 'regenerating', reject: 'rejected', clear: 'empty' },
  rejected: { regenerate: 'regenerating', clear: 'empty' },
  committing_and_reading_back: { commit_finished: 'accepted',commit_candidate_finished:'reviewed_candidate' },
};

export function transitionForgeIntakeReviewStatus(
  current: ForgeIntakeReviewStatus,
  event: ForgeIntakeReviewEvent,
): ForgeIntakeReviewStatus {
  const next = REVIEW_TRANSITIONS[current]?.[event];
  if (!next) throw new Error(`Invalid Forge Intake review transition: ${current} -> ${event}`);
  return next;
}

export interface ForgeIntakeSnapshotInput {
  source: string;
  displayName: string;
  mode: ForgeIntakeMode;
  objectKind: ForgeIntakeObjectKind;
  endpoint: string;
  model: string;
  reviewModel: string;
  fvttVersion: string;
  systemVersion: string;
  effectProfile: string;
  iconMode: string;
  providerId?: string;
  protocol?: string;
  region?: string;
  reasoning?: string;
  structuredOutput?: string;
}

export interface ForgeIntakeSnapshot {
  snapshotId: Sha256;
  rawSourceHash: Sha256;
  endpointIdentity: Sha256;
  displayName: string;
  mode: ForgeIntakeMode;
  objectKind: ForgeIntakeObjectKind;
  model: string;
  reviewModel: string;
  providerId: string;
  protocol: string;
  region: string;
  reasoning: string;
  structuredOutput: string;
  target: {
    fvttVersion: string;
    systemVersion: string;
    effectProfile: string;
    iconMode: string;
  };
}

export function createForgeIntakeSnapshot(input: ForgeIntakeSnapshotInput): ForgeIntakeSnapshot {
  const rawSourceHash = hashSource(input.source);
  const endpointIdentity = hashSource(normalizeEndpointIdentitySource(input.endpoint));
  const semanticProjection = {
    rawSourceHash,
    displayName: input.displayName,
    mode: input.mode,
    objectKind: input.objectKind,
    endpointIdentity,
    model: input.model,
    reviewModel: input.reviewModel,
    providerId: input.providerId ?? '',
    protocol: input.protocol ?? '',
    region: input.region ?? '',
    reasoning: input.reasoning ?? 'auto',
    structuredOutput: input.structuredOutput ?? 'prompt_fallback',
    target: {
      fvttVersion: input.fvttVersion,
      systemVersion: input.systemVersion,
      effectProfile: input.effectProfile,
      iconMode: input.iconMode,
    },
  };
  return { snapshotId: hashSource(stableStringify(semanticProjection)), ...semanticProjection };
}

export function sameForgeIntakeSnapshot(left: ForgeIntakeSnapshot, right: ForgeIntakeSnapshot): boolean {
  return left.snapshotId === right.snapshotId;
}

export interface ForgeIntakeEvidenceRefProjection {
  start: number;
  end: number;
  quote: string;
}

export interface ForgeIntakeCandidateProjection extends ForgeIntakeEvidenceRefProjection {
  id: string;
  label: string;
}

export interface ForgeIntakeFindingProjection {
  id: string;
  code: string;
  path: string;
  message: string;
  blocking: boolean;
  origin: string;
  evidence: ForgeIntakeEvidenceRefProjection[];
}

type ForgeGmModelFinding = Omit<ForgeIntakeFindingProjection, 'evidence'> & {
  evidence?: ForgeIntakeEvidenceRefProjection[];
};

/** Same field set for formal responses and portable review-bundle target metadata. */
export function forgeGmTargetHash(target:
  | NonNullable<ForgeIntakeReviewBundleInput['target']>
  | { generatorVersion:string; fvttRuntimeVersion:string; systemId:string; systemVersionObserved:string;
      generatorProfile:string; effectProfile:string; iconMode:string }): Sha256 {
  const fvttVersion = 'fvttVersion' in target ? target.fvttVersion : target.fvttRuntimeVersion;
  const systemVersion = 'systemVersion' in target ? target.systemVersion : target.systemVersionObserved;
  return hashSource(stableStringify({ generatorVersion:target.generatorVersion, fvttVersion,
    systemId:target.systemId, systemVersion, generatorProfile:target.generatorProfile,
    effectProfile:target.effectProfile, iconMode:target.iconMode }));
}

/** Hash exactly the safe finding projection that the portable bundle will serialize. */
export function forgeGmModelFindingsHash(findings: readonly ForgeGmModelFinding[]): Sha256 {
  return hashSource(stableStringify(findings.map(projectFinding)));
}

export interface ForgeIntakeEvidenceProjection {
  source?: { sha256: string; length: number };
  claims: Array<{
    path: string;
    valueKind: string;
    confidence?: string;
    value?: SafeJsonValue;
    evidence: ForgeIntakeEvidenceRefProjection[];
  }>;
  coverage: Array<ForgeIntakeEvidenceRefProjection & {
    classification: string;
    claimPaths: string[];
    reason?: string;
  }>;
  uncertainties: Array<{
    id: string;
    code: string;
    path: string;
    message: string;
    blocking: boolean;
    evidence: ForgeIntakeEvidenceRefProjection[];
  }>;
}

export type ForgeModelReviewStatus = 'not_requested' | 'accepted' | 'needs_review' | 'failed';
export interface ForgeIntakeGmApproval {
  gmId: string;
  sourceHash: Sha256;
  finalSourceHash: Sha256;
  artifactHash: Sha256;
  targetHash: Sha256;
  candidateHash: Sha256;
  modelReviewStatus: ForgeModelReviewStatus;
  modelFindingsHash: Sha256;
}

export interface ForgeIntakeReviewBundleInput {
  objectKind: ForgeIntakeObjectKind;
  mode: ForgeIntakeMode;
  requestId: string;
  attemptId: string;
  status: ForgeIntakeReviewStatus;
  rawSource: string;
  rawSourceHash: Sha256;
  candidate?: ForgeIntakeCandidateProjection;
  evidence?: ForgeIntakeEvidenceProjection;
  deterministicFindings?: ForgeIntakeFindingProjection[];
  aiReviewFindings?: ForgeIntakeFindingProjection[];
  reviewVerdict?: 'accepted' | 'revise' | 'needs_review';
  modelReviewStatus?: ForgeModelReviewStatus;
  candidateHash?: Sha256;
  gmApproval?: ForgeIntakeGmApproval;
  provider?: {
    name: string;
    extractionModel: string;
    reviewModel: string;
    protocol?: string;
    region?: string;
    reasoning?: string;
    structuredOutput?: string;
    promptVersions: Partial<Record<'discover' | 'extract' | 'review' | 'repair', string>>;
  };
  calls?: { discovery: number; extraction: number; review: number; repair: number };
  repairCount?: number;
  canonicalSource?: string;
  sourceIdentity?: { sourceId: string; finalSourceHash: Sha256 };
  target?: {
    generatorVersion: string;
    fvttVersion: string;
    systemId: string;
    systemVersion: string;
    generatorProfile: string;
    effectProfile: string;
    iconMode: string;
  };
  candidateResponse?: {
    requestId: string;
    status: 'accepted' | 'needs_review' | 'failed';
    artifactHash?: Sha256;
    verificationStatus: 'accepted' | 'needs_review' | 'failed';
    diagnostics: Array<{ severity: string; code: string; message: string }>;
    semanticSummary?: SafeJsonValue;
  };
  history?: Array<{
    sequence: number;
    action: 'reject' | 'repair' | 'regenerate';
    attemptId: string;
    resultingStatus: ForgeIntakeReviewStatus;
  }>;
}

export interface ForgeIntakeReviewBundleV1 {
  schema: typeof FORGE_INTAKE_REVIEW_BUNDLE_SCHEMA;
  version: typeof FORGE_INTAKE_REVIEW_BUNDLE_VERSION;
  objectKind: ForgeIntakeObjectKind;
  mode: ForgeIntakeMode;
  requestId: string;
  attemptId: string;
  status: ForgeIntakeReviewStatus;
  rawSource: string;
  rawSourceHash: Sha256;
  candidate?: ForgeIntakeCandidateProjection;
  evidence?: ForgeIntakeEvidenceProjection;
  deterministicFindings: ForgeIntakeFindingProjection[];
  aiReviewFindings: ForgeIntakeFindingProjection[];
  reviewVerdict?: 'accepted' | 'revise' | 'needs_review';
  provider?: ForgeIntakeReviewBundleInput['provider'];
  calls: { discovery: number; extraction: number; review: number; repair: number };
  repairCount: number;
  canonicalSource?: string;
  sourceIdentity?: ForgeIntakeReviewBundleInput['sourceIdentity'];
  target?: ForgeIntakeReviewBundleInput['target'];
  candidateResponse?: ForgeIntakeReviewBundleInput['candidateResponse'];
  history: NonNullable<ForgeIntakeReviewBundleInput['history']>;
}

export function buildForgeIntakeReviewBundle(input: ForgeIntakeReviewBundleInput): ForgeIntakeReviewBundleV1 {
  assertBundleIdentity(input);
  return structuredClone({
    schema: FORGE_INTAKE_REVIEW_BUNDLE_SCHEMA,
    version: FORGE_INTAKE_REVIEW_BUNDLE_VERSION,
    objectKind: input.objectKind,
    mode: input.mode,
    requestId: input.requestId,
    attemptId: input.attemptId,
    status: input.status,
    rawSource: input.rawSource,
    rawSourceHash: input.rawSourceHash,
    ...(input.candidate ? { candidate: projectCandidate(input.candidate) } : {}),
    ...(input.evidence ? { evidence: projectEvidence(input.evidence) } : {}),
    deterministicFindings: (input.deterministicFindings ?? []).map(projectFinding),
    aiReviewFindings: (input.aiReviewFindings ?? []).map(projectFinding),
    ...(input.reviewVerdict ? { reviewVerdict: input.reviewVerdict } : {}),
    ...(input.provider ? { provider: projectProvider(input.provider) } : {}),
    calls: projectCalls(input.calls),
    repairCount: nonNegativeInteger(input.repairCount ?? 0, 'repairCount'),
    ...(input.canonicalSource !== undefined ? { canonicalSource: input.canonicalSource } : {}),
    ...(input.sourceIdentity ? { sourceIdentity: { ...input.sourceIdentity } } : {}),
    ...(input.target ? { target: { ...input.target } } : {}),
    ...(input.candidateResponse ? { candidateResponse: projectCandidateResponse(input.candidateResponse) } : {}),
    history: (input.history ?? []).map((entry) => ({
      sequence: nonNegativeInteger(entry.sequence, 'history.sequence'),
      action: entry.action,
      attemptId: entry.attemptId,
      resultingStatus: entry.resultingStatus,
    })),
  });
}

export function serializeForgeIntakeReviewBundle(bundle: ForgeIntakeReviewBundleV1): string {
  return `${stableStringify(bundle, 2)}\n`;
}

type SafeJsonPrimitive = string | number | boolean | null;
export type SafeJsonValue = SafeJsonPrimitive | SafeJsonValue[] | { [key: string]: SafeJsonValue };

function assertBundleIdentity(input: ForgeIntakeReviewBundleInput): void {
  if (!input.requestId.trim()) throw new Error('Forge Intake review bundle requestId must not be empty.');
  if (!input.attemptId.trim()) throw new Error('Forge Intake review bundle attemptId must not be empty.');
  if (hashSource(input.rawSource) !== input.rawSourceHash) throw new Error('Forge Intake review bundle raw source hash does not match.');
  if ((input.objectKind === 'actor') !== (input.mode !== 'ai-item')) {
    throw new Error('Forge Intake review bundle object kind does not match its mode.');
  }
  if (input.sourceIdentity && !input.canonicalSource) {
    throw new Error('Forge Intake review bundle source identity requires canonical source.');
  }
  if (input.sourceIdentity && hashSource(input.canonicalSource!) !== input.sourceIdentity.finalSourceHash) {
    throw new Error('Forge Intake review bundle final source hash does not match.');
  }
  assertCandidateResponseConsistency(input);
}

function assertCandidateResponseConsistency(input: ForgeIntakeReviewBundleInput): void {
  const reviewed=input.status==='reviewed_candidate'||input.status==='committing_and_reading_back'&&!!input.gmApproval&&input.candidateResponse?.status!=='accepted';
  const acceptedTopLevel = input.status === 'accepted' || input.status === 'committing_and_reading_back'&&!reviewed;
  const awaitingGm = input.status === 'ready_for_gm_review';
  const response = input.candidateResponse;
  if (!acceptedTopLevel && !awaitingGm && !reviewed && response) {
    throw new Error('Forge Intake candidate response is forbidden unless the top-level review status is GM-ready or accepted.');
  }
  if (acceptedTopLevel && !response) {
    throw new Error('Forge Intake accepted review status requires one accepted candidate response.');
  }
  if (awaitingGm && (!response || !input.candidateHash || input.gmApproval)) {
    throw new Error('Forge Intake GM-ready candidate needs a bound formal response without prior GM approval.');
  }
  if (!response) return;
  if(reviewed&&(!input.gmApproval||input.objectKind!=='actor'||!input.candidateHash||!response.artifactHash))throw new Error('Reviewed Actor candidate requires its current GM decision and artifact identity.');
  if (response.requestId !== input.requestId) {
    throw new Error('Forge Intake candidate response requestId does not match the review bundle.');
  }
  if ((acceptedTopLevel||input.objectKind==='item')&&(response.status !== 'accepted' || response.verificationStatus !== 'accepted' || !response.artifactHash)) {
    throw new Error('Forge Intake accepted review status requires accepted response, verification, and artifactHash.');
  }
}

function projectCandidate(value: ForgeIntakeCandidateProjection): ForgeIntakeCandidateProjection {
  return { id: value.id, label: value.label, ...projectEvidenceRef(value) };
}

function projectFinding(value: ForgeGmModelFinding): ForgeIntakeFindingProjection {
  return {
    id: value.id,
    code: value.code,
    path: value.path,
    message: value.message,
    blocking: value.blocking,
    origin: value.origin,
    evidence: (value.evidence ?? []).map(projectEvidenceRef),
  };
}

function projectEvidence(value: ForgeIntakeEvidenceProjection): ForgeIntakeEvidenceProjection {
  return {
    ...(value.source ? { source: { sha256: value.source.sha256, length: value.source.length } } : {}),
    claims: (value.claims ?? []).map((claim) => ({
      path: claim.path,
      valueKind: claim.valueKind,
      ...(claim.confidence ? { confidence: claim.confidence } : {}),
      ...(claim.value !== undefined ? { value: cloneSafeJson(claim.value) } : {}),
      evidence: (claim.evidence ?? []).map(projectEvidenceRef),
    })),
    coverage: (value.coverage ?? []).map((entry) => ({
      ...projectEvidenceRef(entry),
      classification: entry.classification,
      claimPaths: [...(entry.claimPaths ?? [])],
      ...(entry.reason ? { reason: entry.reason } : {}),
    })),
    uncertainties: (value.uncertainties ?? []).map((entry) => ({
      id: entry.id,
      code: entry.code,
      path: entry.path,
      message: entry.message,
      blocking: entry.blocking,
      evidence: (entry.evidence ?? []).map(projectEvidenceRef),
    })),
  };
}

function projectEvidenceRef(value: ForgeIntakeEvidenceRefProjection): ForgeIntakeEvidenceRefProjection {
  const start = nonNegativeInteger(value.start, 'evidence.start');
  const end = nonNegativeInteger(value.end, 'evidence.end');
  if (end < start) throw new Error('Forge Intake evidence range end must not precede start.');
  return { start, end, quote: value.quote };
}

function projectProvider(value: NonNullable<ForgeIntakeReviewBundleInput['provider']>) {
  return {
    name: value.name,
    extractionModel: value.extractionModel,
    reviewModel: value.reviewModel,
    ...(value.protocol ? { protocol: value.protocol } : {}),
    ...(value.region ? { region: value.region } : {}),
    ...(value.reasoning ? { reasoning: value.reasoning } : {}),
    ...(value.structuredOutput ? { structuredOutput: value.structuredOutput } : {}),
    promptVersions: {
      ...(value.promptVersions.discover ? { discover: value.promptVersions.discover } : {}),
      ...(value.promptVersions.extract ? { extract: value.promptVersions.extract } : {}),
      ...(value.promptVersions.review ? { review: value.promptVersions.review } : {}),
      ...(value.promptVersions.repair ? { repair: value.promptVersions.repair } : {}),
    },
  };
}

function projectCalls(value: ForgeIntakeReviewBundleInput['calls']) {
  return {
    discovery: nonNegativeInteger(value?.discovery ?? 0, 'calls.discovery'),
    extraction: nonNegativeInteger(value?.extraction ?? 0, 'calls.extraction'),
    review: nonNegativeInteger(value?.review ?? 0, 'calls.review'),
    repair: nonNegativeInteger(value?.repair ?? 0, 'calls.repair'),
  };
}

function projectCandidateResponse(value: NonNullable<ForgeIntakeReviewBundleInput['candidateResponse']>) {
  // A hash identifies the retained candidate; it does not certify acceptance.
  return {
    requestId: value.requestId,
    status: value.status,
    ...(value.artifactHash ? { artifactHash: value.artifactHash } : {}),
    verificationStatus: value.verificationStatus,
    diagnostics: value.diagnostics.map((entry) => ({
      severity: entry.severity,
      code: entry.code,
      message: entry.message,
    })),
    ...(value.semanticSummary !== undefined ? { semanticSummary: cloneSafeJson(value.semanticSummary) } : {}),
  };
}

function cloneSafeJson(value: SafeJsonValue): SafeJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Forge Intake safe JSON numbers must be finite.');
    return value;
  }
  if (Array.isArray(value)) return value.map(cloneSafeJson);
  const output: Record<string, SafeJsonValue> = {};
  for (const key of Object.keys(value).sort()) output[key] = cloneSafeJson(value[key]!);
  return output;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Forge Intake ${label} must be a non-negative integer.`);
  return value;
}

function normalizeEndpointIdentitySource(endpoint: string): string {
  if (!endpoint.trim()) return '';
  const url = new URL(endpoint);
  if (url.username || url.password) throw new Error('Forge Intake endpoint identity cannot include URL credentials.');
  url.hash = '';
  return url.toString().replace(/\/$/u, '');
}

function stableStringify(value: unknown, space?: number): string {
  return JSON.stringify(sortJson(value), null, space);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    output[key] = sortJson((value as Record<string, unknown>)[key]);
  }
  return output;
}
