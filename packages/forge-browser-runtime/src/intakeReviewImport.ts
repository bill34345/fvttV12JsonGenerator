import {
  hashSource,
  isForgeItemSourceId,
  isForgeSourceId,
  readForgeItemSourceId,
  readForgeSourceId,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  FORGE_INTAKE_REVIEW_BUNDLE_SCHEMA,
  FORGE_INTAKE_REVIEW_BUNDLE_VERSION,
  buildForgeIntakeReviewBundle,
  serializeForgeIntakeReviewBundle,
  type ForgeIntakeCandidateProjection,
  type ForgeIntakeEvidenceProjection,
  type ForgeIntakeEvidenceRefProjection,
  type ForgeIntakeFindingProjection,
  type ForgeIntakeMode,
  type ForgeIntakeObjectKind,
  type ForgeIntakeReviewBundleInput,
  type ForgeIntakeReviewBundleV1,
  type ForgeIntakeReviewStatus,
  type SafeJsonValue,
} from './intakeReview';

export const FORGE_INTAKE_REVIEW_BUNDLE_VERSION_V2 = 2 as const;
export const FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES = 4 * 1024 * 1024;
export const FORGE_INTAKE_REVIEW_RAW_SOURCE_MAX_UTF8_BYTES = 200_000;

const MAX_DEPTH = 20;
const MAX_TOTAL_NODES = 50_000;
const MAX_ARRAY_LENGTH = 4_096;
const MAX_FINDINGS = 512;
const MAX_EVIDENCE_REFS = 512;
const MAX_CLAIMS = 2_048;
const MAX_COVERAGE = 4_096;
const MAX_UNCERTAINTIES = 512;
const MAX_HISTORY = 1_024;
const MAX_DIAGNOSTICS = 512;
const MAX_CLAIM_PATHS = 512;
const MAX_TEXT_LENGTH = 200_000;
const MAX_LABEL_LENGTH = 500;
const MAX_ID_LENGTH = 256;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const OBJECT_KINDS = ['actor', 'item'] as const;
const MODES = ['plaintext-actor', 'ai-monster', 'ai-item'] as const;
const STATUSES = [
  'empty',
  'analyzing',
  'ready_to_generate',
  'generating_and_reviewing',
  'repairing',
  'regenerating',
  'accepted',
  'needs_review',
  'failed',
  'rejected',
  'committing_and_reading_back',
] as const;
const REVIEW_VERDICTS = ['accepted', 'revise', 'needs_review'] as const;
const RESPONSE_STATUSES = ['accepted', 'needs_review', 'failed'] as const;
const HISTORY_ACTIONS = ['reject', 'repair', 'regenerate'] as const;

export interface ForgeIntakeReviewRecoveryLineage {
  schema: typeof FORGE_INTAKE_REVIEW_BUNDLE_SCHEMA;
  version: 1 | typeof FORGE_INTAKE_REVIEW_BUNDLE_VERSION_V2;
  bundleHash: Sha256;
  requestId: string;
  attemptId: string;
  status: ForgeIntakeReviewStatus;
  rawSourceHash: Sha256;
}

export interface ForgeIntakeReviewBundleV2 extends Omit<ForgeIntakeReviewBundleV1, 'version'> {
  version: typeof FORGE_INTAKE_REVIEW_BUNDLE_VERSION_V2;
  sourceLabel?: string;
  recoveredFrom?: ForgeIntakeReviewRecoveryLineage;
}

export type ForgeIntakeReviewBundle = ForgeIntakeReviewBundleV1 | ForgeIntakeReviewBundleV2;

export interface ImportedForgeIntakeReviewRecord {
  readonly normalizedBundleHash: Sha256;
  readonly originalSchema: typeof FORGE_INTAKE_REVIEW_BUNDLE_SCHEMA;
  readonly originalVersion: 1 | typeof FORGE_INTAKE_REVIEW_BUNDLE_VERSION_V2;
  readonly bundle: Readonly<ForgeIntakeReviewBundleV2>;
}

export function buildForgeIntakeReviewBundleV2(
  input: ForgeIntakeReviewBundleInput,
  metadata: { sourceLabel?: string; recoveredFrom?: ForgeIntakeReviewRecoveryLineage } = {},
): ForgeIntakeReviewBundleV2 {
  const v1 = buildForgeIntakeReviewBundle(input);
  assertAcceptedImportConsistency(input);
  const sourceLabel = metadata.sourceLabel === undefined
    ? undefined
    : requireString(metadata.sourceLabel, 'sourceLabel', MAX_LABEL_LENGTH, true);
  const recoveredFrom = metadata.recoveredFrom === undefined
    ? undefined
    : decodeRecoveryLineage(metadata.recoveredFrom, 'recoveredFrom');
  return structuredClone({
    ...v1,
    version: FORGE_INTAKE_REVIEW_BUNDLE_VERSION_V2,
    ...(sourceLabel !== undefined ? { sourceLabel } : {}),
    ...(recoveredFrom !== undefined ? { recoveredFrom } : {}),
  });
}

export function serializeForgeIntakeReviewBundleV2(bundle: ForgeIntakeReviewBundleV2): string {
  return `${stableStringify(bundle, 2)}\n`;
}

export function decodeForgeIntakeReviewBundleText(text: string): ImportedForgeIntakeReviewRecord {
  if (typeof text !== 'string') throw new TypeError('Forge Intake review bundle file must be text.');
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES) {
    throw new TypeError(`Forge Intake review bundle file must be at most ${FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES} UTF-8 bytes.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError('Forge Intake review bundle is not valid JSON.');
  }
  scanUntrustedJson(parsed);
  const root = requireRecord(parsed, '$');
  const schema = requireString(root.schema, '$.schema', 64);
  if (schema !== FORGE_INTAKE_REVIEW_BUNDLE_SCHEMA) throw new TypeError('Unsupported Forge Intake review bundle schema.');
  if (root.version !== FORGE_INTAKE_REVIEW_BUNDLE_VERSION && root.version !== FORGE_INTAKE_REVIEW_BUNDLE_VERSION_V2) {
    throw new TypeError('Unsupported Forge Intake review bundle version.');
  }
  const originalVersion = root.version;
  const decoded = decodeBundle(root, originalVersion);
  const normalized = originalVersion === 1
    ? serializeForgeIntakeReviewBundle(decoded as ForgeIntakeReviewBundleV1)
    : serializeForgeIntakeReviewBundleV2(decoded as ForgeIntakeReviewBundleV2);
  const normalizedBundleHash = hashSource(normalized);
  const migrated = originalVersion === 1
    ? { ...(decoded as ForgeIntakeReviewBundleV1), version: FORGE_INTAKE_REVIEW_BUNDLE_VERSION_V2 }
    : decoded as ForgeIntakeReviewBundleV2;
  return deepFreeze({
    normalizedBundleHash,
    originalSchema: FORGE_INTAKE_REVIEW_BUNDLE_SCHEMA,
    originalVersion,
    bundle: structuredClone(migrated),
  });
}

export function createForgeIntakeRecoveryLineage(
  imported: ImportedForgeIntakeReviewRecord,
): ForgeIntakeReviewRecoveryLineage {
  return deepFreeze({
    schema: imported.originalSchema,
    version: imported.originalVersion,
    bundleHash: imported.normalizedBundleHash,
    requestId: imported.bundle.requestId,
    attemptId: imported.bundle.attemptId,
    status: imported.bundle.status,
    rawSourceHash: imported.bundle.rawSourceHash,
  });
}

function decodeBundle(root: Record<string, unknown>, version: 1 | 2): ForgeIntakeReviewBundle {
  assertExactKeys(root, [
    'schema', 'version', 'objectKind', 'mode', 'requestId', 'attemptId', 'status', 'rawSource', 'rawSourceHash',
    'candidate', 'evidence', 'deterministicFindings', 'aiReviewFindings', 'reviewVerdict', 'provider', 'calls',
    'repairCount', 'canonicalSource', 'sourceIdentity', 'target', 'candidateResponse', 'history',
    ...(version === 2 ? ['sourceLabel', 'recoveredFrom'] : []),
  ], '$');
  const objectKind = requireEnum(root.objectKind, OBJECT_KINDS, '$.objectKind');
  const mode = requireEnum(root.mode, MODES, '$.mode');
  const rawSource = requireString(root.rawSource, '$.rawSource', MAX_TEXT_LENGTH);
  assertUtf8Limit(rawSource, FORGE_INTAKE_REVIEW_RAW_SOURCE_MAX_UTF8_BYTES, '$.rawSource');
  const input: ForgeIntakeReviewBundleInput = {
    objectKind,
    mode,
    requestId: requireString(root.requestId, '$.requestId', MAX_ID_LENGTH, true),
    attemptId: requireString(root.attemptId, '$.attemptId', MAX_ID_LENGTH, true),
    status: requireEnum(root.status, STATUSES, '$.status'),
    rawSource,
    rawSourceHash: requireSha256(root.rawSourceHash, '$.rawSourceHash'),
    deterministicFindings: decodeArray(root.deterministicFindings, '$.deterministicFindings', MAX_FINDINGS, decodeFinding, rawSource),
    aiReviewFindings: decodeArray(root.aiReviewFindings, '$.aiReviewFindings', MAX_FINDINGS, decodeFinding, rawSource),
    calls: decodeCalls(root.calls, '$.calls'),
    repairCount: requireNonNegativeInteger(root.repairCount, '$.repairCount'),
    history: decodeHistory(root.history, '$.history'),
  };
  if (root.candidate !== undefined) input.candidate = decodeCandidate(root.candidate, '$.candidate', rawSource);
  if (root.evidence !== undefined) input.evidence = decodeEvidence(root.evidence, '$.evidence', rawSource);
  if (root.reviewVerdict !== undefined) input.reviewVerdict = requireEnum(root.reviewVerdict, REVIEW_VERDICTS, '$.reviewVerdict');
  if (root.provider !== undefined) input.provider = decodeProvider(root.provider, '$.provider');
  if (root.canonicalSource !== undefined) input.canonicalSource = requireString(root.canonicalSource, '$.canonicalSource', MAX_TEXT_LENGTH);
  if (root.sourceIdentity !== undefined) input.sourceIdentity = decodeSourceIdentity(root.sourceIdentity, '$.sourceIdentity', objectKind);
  if (root.target !== undefined) input.target = decodeTarget(root.target, '$.target');
  if (root.candidateResponse !== undefined) input.candidateResponse = decodeCandidateResponse(root.candidateResponse, '$.candidateResponse');
  const v1 = buildForgeIntakeReviewBundle(input);
  assertAcceptedImportConsistency(input);
  if (input.evidence?.source) {
    if (input.evidence.source.sha256 !== input.rawSourceHash || input.evidence.source.length !== rawSource.length) {
      throw new TypeError('Forge Intake evidence source identity does not match rawSource.');
    }
  }
  if (input.sourceIdentity && input.canonicalSource) {
    const sourceIdValid = objectKind === 'actor'
      ? isForgeSourceId(input.sourceIdentity.sourceId)
      : isForgeItemSourceId(input.sourceIdentity.sourceId);
    if (!sourceIdValid) throw new TypeError('Forge Intake source identity is not valid for its object kind.');
    const embeddedIdentity = objectKind === 'actor'
      ? readForgeSourceId(input.canonicalSource)
      : readForgeItemSourceId(input.canonicalSource);
    if (embeddedIdentity.status !== 'valid' || embeddedIdentity.sourceId !== input.sourceIdentity.sourceId) {
      throw new TypeError('Forge Intake source identity does not match canonicalSource.');
    }
  }
  if (version === 1) return v1;
  return {
    ...v1,
    version: FORGE_INTAKE_REVIEW_BUNDLE_VERSION_V2,
    ...(root.sourceLabel !== undefined
      ? { sourceLabel: requireString(root.sourceLabel, '$.sourceLabel', MAX_LABEL_LENGTH, true) }
      : {}),
    ...(root.recoveredFrom !== undefined
      ? { recoveredFrom: decodeRecoveryLineage(root.recoveredFrom, '$.recoveredFrom') }
      : {}),
  };
}

function decodeCandidate(value: unknown, path: string, source: string): ForgeIntakeCandidateProjection {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['id', 'label', 'start', 'end', 'quote'], path);
  return {
    id: requireString(record.id, `${path}.id`, MAX_ID_LENGTH, true),
    label: requireString(record.label, `${path}.label`, MAX_LABEL_LENGTH, true),
    ...decodeEvidenceRefFields(record, path, source),
  };
}

function decodeFinding(value: unknown, path: string, source: string): ForgeIntakeFindingProjection {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['id', 'code', 'path', 'message', 'blocking', 'origin', 'evidence'], path);
  return {
    id: requireString(record.id, `${path}.id`, MAX_ID_LENGTH, true),
    code: requireString(record.code, `${path}.code`, MAX_ID_LENGTH, true),
    path: requireString(record.path, `${path}.path`, 2_000),
    message: requireString(record.message, `${path}.message`, 10_000),
    blocking: requireBoolean(record.blocking, `${path}.blocking`),
    origin: requireString(record.origin, `${path}.origin`, MAX_ID_LENGTH, true),
    evidence: decodeArray(record.evidence, `${path}.evidence`, MAX_EVIDENCE_REFS, decodeEvidenceRef, source),
  };
}

function decodeEvidence(value: unknown, path: string, rawSource: string): ForgeIntakeEvidenceProjection {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['source', 'claims', 'coverage', 'uncertainties'], path);
  const source = record.source === undefined ? undefined : decodeEvidenceSource(record.source, `${path}.source`);
  return {
    ...(source ? { source } : {}),
    claims: decodeArray(record.claims, `${path}.claims`, MAX_CLAIMS, decodeClaim, rawSource),
    coverage: decodeArray(record.coverage, `${path}.coverage`, MAX_COVERAGE, decodeCoverage, rawSource),
    uncertainties: decodeArray(record.uncertainties, `${path}.uncertainties`, MAX_UNCERTAINTIES, decodeUncertainty, rawSource),
  };
}

function decodeEvidenceSource(value: unknown, path: string): { sha256: string; length: number } {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['sha256', 'length'], path);
  return { sha256: requireSha256(record.sha256, `${path}.sha256`), length: requireNonNegativeInteger(record.length, `${path}.length`) };
}

function decodeClaim(value: unknown, path: string, source: string): ForgeIntakeEvidenceProjection['claims'][number] {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['path', 'valueKind', 'confidence', 'value', 'evidence'], path);
  return {
    path: requireString(record.path, `${path}.path`, 2_000),
    valueKind: requireString(record.valueKind, `${path}.valueKind`, MAX_ID_LENGTH, true),
    ...(record.confidence !== undefined ? { confidence: requireString(record.confidence, `${path}.confidence`, MAX_ID_LENGTH, true) } : {}),
    ...(record.value !== undefined ? { value: decodeSafeJson(record.value, `${path}.value`) } : {}),
    evidence: decodeArray(record.evidence, `${path}.evidence`, MAX_EVIDENCE_REFS, decodeEvidenceRef, source),
  };
}

function decodeCoverage(value: unknown, path: string, source: string): ForgeIntakeEvidenceProjection['coverage'][number] {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['start', 'end', 'quote', 'classification', 'claimPaths', 'reason'], path);
  return {
    ...decodeEvidenceRefFields(record, path, source),
    classification: requireString(record.classification, `${path}.classification`, MAX_ID_LENGTH, true),
    claimPaths: decodeArray(record.claimPaths, `${path}.claimPaths`, MAX_CLAIM_PATHS, (entry, entryPath) => requireString(entry, entryPath, 2_000)),
    ...(record.reason !== undefined ? { reason: requireString(record.reason, `${path}.reason`, 10_000) } : {}),
  };
}

function decodeUncertainty(value: unknown, path: string, source: string): ForgeIntakeEvidenceProjection['uncertainties'][number] {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['id', 'code', 'path', 'message', 'blocking', 'evidence'], path);
  return {
    id: requireString(record.id, `${path}.id`, MAX_ID_LENGTH, true),
    code: requireString(record.code, `${path}.code`, MAX_ID_LENGTH, true),
    path: requireString(record.path, `${path}.path`, 2_000),
    message: requireString(record.message, `${path}.message`, 10_000),
    blocking: requireBoolean(record.blocking, `${path}.blocking`),
    evidence: decodeArray(record.evidence, `${path}.evidence`, MAX_EVIDENCE_REFS, decodeEvidenceRef, source),
  };
}

function decodeEvidenceRef(value: unknown, path: string, source: string): ForgeIntakeEvidenceRefProjection {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['start', 'end', 'quote'], path);
  return decodeEvidenceRefFields(record, path, source);
}

function decodeEvidenceRefFields(record: Record<string, unknown>, path: string, source: string): ForgeIntakeEvidenceRefProjection {
  const start = requireNonNegativeInteger(record.start, `${path}.start`);
  const end = requireNonNegativeInteger(record.end, `${path}.end`);
  const quote = requireString(record.quote, `${path}.quote`, MAX_TEXT_LENGTH);
  if (end < start || end > source.length) throw new TypeError(`${path} range is outside rawSource.`);
  if (source.slice(start, end) !== quote) throw new TypeError(`${path} quote does not match rawSource.`);
  return { start, end, quote };
}

function decodeProvider(value: unknown, path: string): NonNullable<ForgeIntakeReviewBundleInput['provider']> {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['name', 'extractionModel', 'reviewModel', 'protocol', 'region', 'reasoning', 'structuredOutput', 'promptVersions'], path);
  const prompts = requireRecord(record.promptVersions, `${path}.promptVersions`);
  assertExactKeys(prompts, ['discover', 'extract', 'review', 'repair'], `${path}.promptVersions`);
  return {
    name: requireString(record.name, `${path}.name`, MAX_LABEL_LENGTH, true),
    extractionModel: requireString(record.extractionModel, `${path}.extractionModel`, MAX_LABEL_LENGTH, true),
    reviewModel: requireString(record.reviewModel, `${path}.reviewModel`, MAX_LABEL_LENGTH, true),
    ...(record.protocol !== undefined ? { protocol: requireString(record.protocol, `${path}.protocol`, MAX_LABEL_LENGTH, true) } : {}),
    ...(record.region !== undefined ? { region: requireString(record.region, `${path}.region`, MAX_LABEL_LENGTH, true) } : {}),
    ...(record.reasoning !== undefined ? { reasoning: requireString(record.reasoning, `${path}.reasoning`, MAX_LABEL_LENGTH, true) } : {}),
    ...(record.structuredOutput !== undefined ? { structuredOutput: requireString(record.structuredOutput, `${path}.structuredOutput`, MAX_LABEL_LENGTH, true) } : {}),
    promptVersions: Object.fromEntries(Object.entries(prompts).map(([key, entry]) => [key, requireString(entry, `${path}.promptVersions.${key}`, MAX_LABEL_LENGTH, true)])),
  };
}

function decodeCalls(value: unknown, path: string): NonNullable<ForgeIntakeReviewBundleInput['calls']> {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['discovery', 'extraction', 'review', 'repair'], path);
  return {
    discovery: requireNonNegativeInteger(record.discovery, `${path}.discovery`),
    extraction: requireNonNegativeInteger(record.extraction, `${path}.extraction`),
    review: requireNonNegativeInteger(record.review, `${path}.review`),
    repair: requireNonNegativeInteger(record.repair, `${path}.repair`),
  };
}

function decodeSourceIdentity(value: unknown, path: string, objectKind: ForgeIntakeObjectKind): NonNullable<ForgeIntakeReviewBundleInput['sourceIdentity']> {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['sourceId', 'finalSourceHash'], path);
  const sourceId = requireString(record.sourceId, `${path}.sourceId`, MAX_ID_LENGTH, true);
  const valid = objectKind === 'actor' ? isForgeSourceId(sourceId) : isForgeItemSourceId(sourceId);
  if (!valid) throw new TypeError(`${path}.sourceId is not valid for ${objectKind}.`);
  return { sourceId, finalSourceHash: requireSha256(record.finalSourceHash, `${path}.finalSourceHash`) };
}

function decodeTarget(value: unknown, path: string): NonNullable<ForgeIntakeReviewBundleInput['target']> {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['generatorVersion', 'fvttVersion', 'systemId', 'systemVersion', 'generatorProfile', 'effectProfile', 'iconMode'], path);
  const target = {
    generatorVersion: requireString(record.generatorVersion, `${path}.generatorVersion`, MAX_LABEL_LENGTH, true),
    fvttVersion: requireString(record.fvttVersion, `${path}.fvttVersion`, MAX_LABEL_LENGTH, true),
    systemId: requireString(record.systemId, `${path}.systemId`, MAX_LABEL_LENGTH, true),
    systemVersion: requireString(record.systemVersion, `${path}.systemVersion`, MAX_LABEL_LENGTH, true),
    generatorProfile: requireString(record.generatorProfile, `${path}.generatorProfile`, MAX_LABEL_LENGTH, true),
    effectProfile: requireString(record.effectProfile, `${path}.effectProfile`, MAX_LABEL_LENGTH, true),
    iconMode: requireString(record.iconMode, `${path}.iconMode`, MAX_LABEL_LENGTH, true),
  };
  if (target.systemId !== 'dnd5e' || !['v12', 'v14'].includes(target.generatorProfile)
    || target.effectProfile !== 'core' || target.iconMode !== 'off') {
    throw new TypeError('Forge Intake review bundle target is outside the supported safe target boundary.');
  }
  return target;
}

function decodeCandidateResponse(value: unknown, path: string): NonNullable<ForgeIntakeReviewBundleInput['candidateResponse']> {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['requestId', 'status', 'artifactHash', 'verificationStatus', 'diagnostics', 'semanticSummary'], path);
  return {
    requestId: requireString(record.requestId, `${path}.requestId`, MAX_ID_LENGTH, true),
    status: requireEnum(record.status, RESPONSE_STATUSES, `${path}.status`),
    ...(record.artifactHash !== undefined ? { artifactHash: requireSha256(record.artifactHash, `${path}.artifactHash`) } : {}),
    verificationStatus: requireEnum(record.verificationStatus, RESPONSE_STATUSES, `${path}.verificationStatus`),
    diagnostics: decodeArray(record.diagnostics, `${path}.diagnostics`, MAX_DIAGNOSTICS, decodeDiagnostic),
    ...(record.semanticSummary !== undefined ? { semanticSummary: decodeSafeJson(record.semanticSummary, `${path}.semanticSummary`) } : {}),
  };
}

function decodeDiagnostic(value: unknown, path: string): { severity: string; code: string; message: string } {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['severity', 'code', 'message'], path);
  return {
    severity: requireEnum(record.severity, ['info', 'warning', 'error'] as const, `${path}.severity`),
    code: requireString(record.code, `${path}.code`, MAX_ID_LENGTH, true),
    message: requireString(record.message, `${path}.message`, 10_000),
  };
}

function decodeHistory(value: unknown, path: string): NonNullable<ForgeIntakeReviewBundleInput['history']> {
  const entries = decodeArray(value, path, MAX_HISTORY, (entry, entryPath) => {
    const record = requireRecord(entry, entryPath);
    assertExactKeys(record, ['sequence', 'action', 'attemptId', 'resultingStatus'], entryPath);
    return {
      sequence: requireNonNegativeInteger(record.sequence, `${entryPath}.sequence`),
      action: requireEnum(record.action, HISTORY_ACTIONS, `${entryPath}.action`),
      attemptId: requireString(record.attemptId, `${entryPath}.attemptId`, MAX_ID_LENGTH, true),
      resultingStatus: requireEnum(record.resultingStatus, STATUSES, `${entryPath}.resultingStatus`),
    };
  });
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index]!.sequence <= entries[index - 1]!.sequence) {
      throw new TypeError('Forge Intake review bundle history sequence must be strictly increasing.');
    }
  }
  return entries;
}

function decodeRecoveryLineage(value: unknown, path: string): ForgeIntakeReviewRecoveryLineage {
  const record = requireRecord(value, path);
  assertExactKeys(record, ['schema', 'version', 'bundleHash', 'requestId', 'attemptId', 'status', 'rawSourceHash'], path);
  if (record.schema !== FORGE_INTAKE_REVIEW_BUNDLE_SCHEMA) throw new TypeError(`${path}.schema is unsupported.`);
  if (record.version !== 1 && record.version !== 2) throw new TypeError(`${path}.version is unsupported.`);
  return {
    schema: FORGE_INTAKE_REVIEW_BUNDLE_SCHEMA,
    version: record.version,
    bundleHash: requireSha256(record.bundleHash, `${path}.bundleHash`),
    requestId: requireString(record.requestId, `${path}.requestId`, MAX_ID_LENGTH, true),
    attemptId: requireString(record.attemptId, `${path}.attemptId`, MAX_ID_LENGTH, true),
    status: requireEnum(record.status, STATUSES, `${path}.status`),
    rawSourceHash: requireSha256(record.rawSourceHash, `${path}.rawSourceHash`),
  };
}

function assertAcceptedImportConsistency(input: ForgeIntakeReviewBundleInput): void {
  const accepted = input.status === 'accepted' || input.status === 'committing_and_reading_back';
  if (!accepted) return;
  if (!input.canonicalSource || !input.sourceIdentity || !input.target) {
    throw new TypeError('Forge Intake accepted history requires canonical source identity and target metadata.');
  }
  if (input.mode !== 'plaintext-actor' && input.reviewVerdict !== 'accepted') {
    throw new TypeError('Forge Intake accepted AI history requires an accepted review verdict.');
  }
  if ([...(input.deterministicFindings ?? []), ...(input.aiReviewFindings ?? [])].some((finding) => finding.blocking)) {
    throw new TypeError('Forge Intake accepted history must not contain a blocking finding.');
  }
  if (input.evidence?.uncertainties.some((uncertainty) => uncertainty.blocking)) {
    throw new TypeError('Forge Intake accepted history must not contain a blocking evidence uncertainty.');
  }
  if (input.candidateResponse?.diagnostics.some((diagnostic) => diagnostic.severity === 'warning' || diagnostic.severity === 'error')) {
    throw new TypeError('Forge Intake accepted history must not contain warning or error diagnostics.');
  }
}

function decodeSafeJson(value: unknown, path: string, depth = 0): SafeJsonValue {
  if (depth > MAX_DEPTH) throw new TypeError(`${path} exceeds the safe JSON depth limit.`);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return requireString(value, path, MAX_TEXT_LENGTH);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must be finite.`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) throw new TypeError(`${path} exceeds the array limit.`);
    return value.map((entry, index) => decodeSafeJson(entry, `${path}[${index}]`, depth + 1));
  }
  const record = requireRecord(value, path);
  const output: Record<string, SafeJsonValue> = {};
  for (const key of Object.keys(record).sort()) {
    if (DANGEROUS_KEYS.has(key)) throw new TypeError(`${path} contains a forbidden prototype key.`);
    output[key] = decodeSafeJson(record[key], `${path}.[property]`, depth + 1);
  }
  return output;
}

function scanUntrustedJson(root: unknown): void {
  let nodes = 0;
  const visit = (value: unknown, depth: number, path: string): void => {
    nodes += 1;
    if (nodes > MAX_TOTAL_NODES) throw new TypeError('Forge Intake review bundle exceeds the total value limit.');
    if (depth > MAX_DEPTH) throw new TypeError('Forge Intake review bundle exceeds the nesting depth limit.');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`${path} must be finite.`);
    if (typeof value === 'string' && value.length > MAX_TEXT_LENGTH) throw new TypeError(`${path} exceeds the string length limit.`);
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH) throw new TypeError(`${path} exceeds the array length limit.`);
      value.forEach((entry, index) => visit(entry, depth + 1, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (DANGEROUS_KEYS.has(key)) throw new TypeError(`${path} contains a forbidden prototype key.`);
        visit(entry, depth + 1, `${path}.[property]`);
      }
    }
  };
  visit(root, 0, '$');
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must be a plain object.`);
  return value as Record<string, unknown>;
}

function assertExactKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) throw new TypeError(`${path} contains an unknown key.`);
  }
  for (const key of ['schema', 'version']) {
    if (path === '$' && !Object.hasOwn(record, key)) throw new TypeError(`${path}.${key} is required.`);
  }
}

function requireString(value: unknown, path: string, maxLength: number, nonEmpty = false): string {
  if (typeof value !== 'string') throw new TypeError(`${path} must be a string.`);
  if (value.length > maxLength) throw new TypeError(`${path} exceeds the string length limit.`);
  if (nonEmpty && value.trim().length === 0) throw new TypeError(`${path} must not be empty.`);
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${path} must be a boolean.`);
  return value;
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`${path} must be a non-negative safe integer.`);
  return value as number;
}

function requireSha256(value: unknown, path: string): Sha256 {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new TypeError(`${path} must be a lowercase SHA-256 digest.`);
  return value as Sha256;
}

function requireEnum<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new TypeError(`${path} has an unsupported value.`);
  return value as T[number];
}

function decodeArray<T, A extends readonly unknown[]>(
  value: unknown,
  path: string,
  maximum: number,
  decode: (entry: unknown, path: string, ...args: A) => T,
  ...args: A
): T[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
  if (value.length > maximum) throw new TypeError(`${path} exceeds the array length limit.`);
  return value.map((entry, index) => decode(entry, `${path}[${index}]`, ...args));
}

function assertUtf8Limit(value: string, maximum: number, path: string): void {
  if (new TextEncoder().encode(value).byteLength > maximum) throw new TypeError(`${path} exceeds the UTF-8 byte limit.`);
}

function stableStringify(value: unknown, space?: number): string {
  return JSON.stringify(sortJson(value), null, space);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) output[key] = sortJson((value as Record<string, unknown>)[key]);
  return output;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
