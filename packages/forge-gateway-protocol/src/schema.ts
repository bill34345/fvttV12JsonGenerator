import type { EvidenceRef, GenerationDiagnostic } from '@fvtt-json-generator/contracts';
import { hashArtifact, hashSource } from './hash';
import {
  FORGE_ACTOR_CAPABILITY,
  FORGE_SOURCE_CREATE_CAPABILITY,
  assertForgeTargetProfile,
  getForgeDnd5eVersionWarning,
  resolveForgeTarget,
} from './routing';
import { isForgeSourceId, isForgeSourceRef, readForgeSourceId } from './sourceIdentity';
import {
  FORGE_ERROR_CODES,
  FORGE_GENERATOR_PROFILES,
  FORGE_PROTOCOL_VERSION,
  FORGE_SERVICE_ID,
  type ForgeActorCapability,
  type ForgeActorRequest,
  type ForgeActorResponse,
  type ForgeActorResult,
  type ForgeCapability,
  type ForgeDecodeIssue,
  type ForgeDecodeResult,
  type ForgeGatewayError,
  type ForgeGatewayHealth,
  type ForgeGeneratorProfile,
  type ForgeResponse,
  type ForgeSourceCreateRequest,
  type ForgeSourceCreateResult,
  type ForgeSourceCreateResponse,
  type JsonObject,
  type JsonValue,
  type Sha256,
} from './types';

const ACTOR_REQUEST_KEYS = new Set(['protocolVersion', 'capabilityId', 'requestId', 'source', 'foundryRuntime', 'resolvedTarget']);
const SOURCE_CREATE_REQUEST_KEYS = new Set(['protocolVersion', 'capabilityId', 'requestId', 'source']);
const RESPONSE_KEYS = new Set(['protocolVersion', 'requestId', 'result', 'error']);
const HEALTH_KEYS = new Set(['protocolVersion', 'service', 'serviceVersion', 'instanceId', 'deployment', 'status']);
const ERROR_KEYS = new Set(['code', 'message', 'retryable', 'details']);
const ACTOR_RESULT_KEYS = new Set([
  'sourceIdentity',
  'target',
  'diagnostics',
  'verification',
  'actorVerification',
  'status',
  'artifact',
  'artifactHash',
]);
const SOURCE_RESULT_KEYS = new Set(['sourceRef', 'sourceId', 'displayName', 'sourceHash']);

export function decodeForgeHealth(value: unknown): ForgeDecodeResult<ForgeGatewayHealth> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', HEALTH_KEYS, issues);
  if (!record) return failure(issues);
  readProtocolVersion(record, '$', issues);
  if (record.service !== FORGE_SERVICE_ID) issue(issues, '$/service', 'INVALID_SERVICE', 'service must be foundry-forge-gateway.');
  const serviceVersion = readNonEmptyString(record, 'serviceVersion', '$', issues);
  const instanceId = readNonEmptyString(record, 'instanceId', '$', issues);
  const deployment = readEnum(record, 'deployment', '$', ['local-companion', 'remote-gateway'] as const, issues);
  const status = readEnum(record, 'status', '$', ['idle', 'busy', 'blocked'] as const, issues);
  if (issues.length > 0 || !serviceVersion || !instanceId || !deployment || !status) return failure(issues);
  return success({
    protocolVersion: FORGE_PROTOCOL_VERSION,
    service: FORGE_SERVICE_ID,
    serviceVersion,
    instanceId,
    deployment,
    status,
  });
}

export function decodeForgeCapability(value: unknown): ForgeDecodeResult<ForgeCapability> {
  const issues: ForgeDecodeIssue[] = [];
  if (!isRecord(value)) {
    issue(issues, '$', 'INVALID_OBJECT', 'Capability must be an object.');
    return failure(issues);
  }
  const id = value.id;
  if (id === 'actor.standard.generate.v1') {
    const record = readRecord(value, '$', new Set(['id', 'systemId', 'generatorProfiles', 'versionRouting', 'maxInputUtf8Bytes', 'maxConcurrentJobs']), issues);
    if (!record) return failure(issues);
    const systemId = readLiteral(record, 'systemId', '$', 'dnd5e', issues);
    const generatorProfiles = readGeneratorProfiles(record.generatorProfiles, '$/generatorProfiles', issues);
    const versionRouting = readVersionRouting(record.versionRouting, '$/versionRouting', issues);
    const maxInputUtf8Bytes = readPositiveInteger(record, 'maxInputUtf8Bytes', '$', issues);
    const maxConcurrentJobs = readPositiveInteger(record, 'maxConcurrentJobs', '$', issues);
    if (generatorProfiles && !sameGeneratorProfiles(generatorProfiles, FORGE_ACTOR_CAPABILITY.generatorProfiles)) {
      issue(issues, '$/generatorProfiles', 'CAPABILITY_MISMATCH', 'generatorProfiles must match the Forge Actor capability.');
    }
    if (versionRouting && !sameVersionRouting(versionRouting, FORGE_ACTOR_CAPABILITY.versionRouting)) {
      issue(issues, '$/versionRouting', 'CAPABILITY_MISMATCH', 'versionRouting must match the Forge FVTT mapping.');
    }
    if (maxInputUtf8Bytes !== undefined && maxInputUtf8Bytes !== FORGE_ACTOR_CAPABILITY.maxInputUtf8Bytes) {
      issue(issues, '$/maxInputUtf8Bytes', 'CAPABILITY_MISMATCH', 'maxInputUtf8Bytes must match the Forge Actor capability.');
    }
    if (maxConcurrentJobs !== undefined && maxConcurrentJobs !== FORGE_ACTOR_CAPABILITY.maxConcurrentJobs) {
      issue(issues, '$/maxConcurrentJobs', 'CAPABILITY_MISMATCH', 'maxConcurrentJobs must match the Forge Actor capability.');
    }
    if (issues.length > 0 || !systemId || !generatorProfiles || !versionRouting || !maxInputUtf8Bytes || !maxConcurrentJobs) return failure(issues);
    return success({ id, systemId, generatorProfiles, versionRouting, maxInputUtf8Bytes, maxConcurrentJobs } satisfies ForgeActorCapability);
  }
  if (id === 'source.actor.create.v1') {
    const record = readRecord(value, '$', new Set(['id', 'sourceKind', 'maxInputUtf8Bytes', 'maxConcurrentJobs']), issues);
    if (!record) return failure(issues);
    const sourceKind = readLiteral(record, 'sourceKind', '$', 'actor', issues);
    const maxInputUtf8Bytes = readPositiveInteger(record, 'maxInputUtf8Bytes', '$', issues);
    const maxConcurrentJobs = readPositiveInteger(record, 'maxConcurrentJobs', '$', issues);
    if (maxInputUtf8Bytes !== undefined && maxInputUtf8Bytes !== FORGE_SOURCE_CREATE_CAPABILITY.maxInputUtf8Bytes) {
      issue(issues, '$/maxInputUtf8Bytes', 'CAPABILITY_MISMATCH', 'maxInputUtf8Bytes must match the Forge source capability.');
    }
    if (maxConcurrentJobs !== undefined && maxConcurrentJobs !== FORGE_SOURCE_CREATE_CAPABILITY.maxConcurrentJobs) {
      issue(issues, '$/maxConcurrentJobs', 'CAPABILITY_MISMATCH', 'maxConcurrentJobs must match the Forge source capability.');
    }
    if (issues.length > 0 || !sourceKind || !maxInputUtf8Bytes || !maxConcurrentJobs) return failure(issues);
    return success({ id, sourceKind, maxInputUtf8Bytes, maxConcurrentJobs });
  }
  issue(issues, '$/id', 'UNKNOWN_CAPABILITY', 'Capability id is not part of the closed Forge capability set.');
  return failure(issues);
}

export function decodeForgeActorRequest(value: unknown): ForgeDecodeResult<ForgeActorRequest> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', ACTOR_REQUEST_KEYS, issues);
  if (!record) return failure(issues);
  readProtocolVersion(record, '$', issues);
  readLiteral(record, 'capabilityId', '$', 'actor.standard.generate.v1', issues);
  const requestId = readNonEmptyString(record, 'requestId', '$', issues);
  const source = readActorRequestSource(record.source, '$/source', issues);
  const foundryRuntime = readFoundryRuntime(record.foundryRuntime, '$/foundryRuntime', issues);
  const resolvedTarget = readResolvedTarget(record.resolvedTarget, '$/resolvedTarget', issues);

  if (source && source.utf8Sha256 !== hashSource(source.content)) {
    issue(issues, '$/source/utf8Sha256', 'SOURCE_HASH_MISMATCH', 'utf8Sha256 must match the exact request content.');
  }
  if (source) {
    const sourceIdentity = readForgeSourceId(source.content);
    if (sourceIdentity.status !== 'valid') {
      issue(issues, '$/source/sourceId', 'SOURCE_IDENTITY_MISMATCH', 'sourceId must match a valid forge-source-id in the final Markdown.');
    } else if (sourceIdentity.sourceId !== source.sourceId) {
      issue(issues, '$/source/sourceId', 'SOURCE_IDENTITY_MISMATCH', 'sourceId must match the forge-source-id in the final Markdown.');
    }
  }
  if (foundryRuntime && resolvedTarget) {
    try {
      assertForgeTargetProfile(foundryRuntime.fvttVersion, resolvedTarget.generatorProfile);
    } catch (error) {
      issue(issues, '$/resolvedTarget/generatorProfile', 'TARGET_MISMATCH', error instanceof Error ? error.message : 'resolvedTarget does not match FVTT runtime.');
    }
  }
  const warnings: ForgeDecodeIssue[] = [];
  if (foundryRuntime) {
    try {
      const message = getForgeDnd5eVersionWarning(foundryRuntime.fvttVersion, foundryRuntime.systemVersion);
      if (message) warnings.push({
        path: '$/foundryRuntime/systemVersion',
        code: 'FORGE_SYSTEM_VERSION_UNVERIFIED',
        message,
      });
    } catch {
      // readFoundryRuntime already reported the invalid runtime as a decode issue.
    }
  }
  if (issues.length > 0 || !requestId || !source || !foundryRuntime || !resolvedTarget) return failure(issues);
  return success({
    protocolVersion: FORGE_PROTOCOL_VERSION,
    capabilityId: 'actor.standard.generate.v1',
    requestId,
    source,
    foundryRuntime,
    resolvedTarget,
  }, warnings);
}

export function decodeForgeSourceCreateRequest(value: unknown): ForgeDecodeResult<ForgeSourceCreateRequest> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', SOURCE_CREATE_REQUEST_KEYS, issues);
  if (!record) return failure(issues);
  readProtocolVersion(record, '$', issues);
  readLiteral(record, 'capabilityId', '$', 'source.actor.create.v1', issues);
  const requestId = readNonEmptyString(record, 'requestId', '$', issues);
  const source = readSourceCreateSource(record.source, '$/source', issues);
  if (source && source.utf8Sha256 !== hashSource(source.content)) {
    issue(issues, '$/source/utf8Sha256', 'SOURCE_HASH_MISMATCH', 'utf8Sha256 must match the exact request content.');
  }
  if (issues.length > 0 || !requestId || !source) return failure(issues);
  return success({
    protocolVersion: FORGE_PROTOCOL_VERSION,
    capabilityId: 'source.actor.create.v1',
    requestId,
    source,
  });
}

export function decodeForgeSourceCreateResult(value: unknown): ForgeDecodeResult<ForgeSourceCreateResult> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', SOURCE_RESULT_KEYS, issues);
  if (!record) return failure(issues);
  const sourceRef = readSourceRef(record, 'sourceRef', '$', issues);
  const sourceId = readSourceId(record, 'sourceId', '$', issues);
  const displayName = readNonEmptyString(record, 'displayName', '$', issues);
  const sourceHash = readHash(record, 'sourceHash', '$', issues);
  if (issues.length > 0 || !sourceRef || !sourceId || !displayName || !sourceHash) return failure(issues);
  return success({ sourceRef, sourceId, displayName, sourceHash });
}

export function decodeForgeActorResult(value: unknown): ForgeDecodeResult<ForgeActorResult> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', ACTOR_RESULT_KEYS, issues);
  if (!record) return failure(issues);
  const base = readActorResultBase(record, issues);
  const status = readEnum(record, 'status', '$', ['accepted', 'needs_review', 'failed'] as const, issues);
  if (!status || !base) return failure(issues);

  if (status === 'accepted') {
    const artifact = readJsonObject(record, 'artifact', '$', issues);
    const artifactHash = readHash(record, 'artifactHash', '$', issues);
    if (artifact && artifactHash) {
      try {
        if (hashArtifact(artifact) !== artifactHash) {
          issue(issues, '$/artifactHash', 'ARTIFACT_HASH_MISMATCH', 'artifactHash must match the canonical artifact.');
        }
      } catch (error) {
        issue(issues, '$/artifact', 'ARTIFACT_INVALID', error instanceof Error ? error.message : 'Artifact is not hashable.');
      }
    }
    if (issues.length > 0 || !artifact || !artifactHash) return failure(issues);
    return success({ ...base, status, artifact, artifactHash });
  }

  if (Object.prototype.hasOwnProperty.call(record, 'artifactHash')) {
    issue(issues, '$/artifactHash', 'UNEXPECTED_FIELD', 'Only accepted results may include artifactHash.');
  }
  if (status === 'needs_review') {
    const artifact = Object.prototype.hasOwnProperty.call(record, 'artifact')
      ? readJsonObject(record, 'artifact', '$', issues)
      : undefined;
    if (issues.length > 0) return failure(issues);
    return success({ ...base, status, ...(artifact ? { artifact } : {}) });
  }

  if (Object.prototype.hasOwnProperty.call(record, 'artifact')) {
    issue(issues, '$/artifact', 'UNEXPECTED_FIELD', 'Failed results must not include artifact.');
  }
  return issues.length > 0 ? failure(issues) : success({ ...base, status });
}

export function decodeForgeError(value: unknown): ForgeDecodeResult<ForgeGatewayError> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', ERROR_KEYS, issues);
  if (!record) return failure(issues);
  const code = readEnum(record, 'code', '$', FORGE_ERROR_CODES, issues);
  const message = readNonEmptyString(record, 'message', '$', issues);
  const retryable = readBoolean(record, 'retryable', '$', issues);
  const details = Object.prototype.hasOwnProperty.call(record, 'details')
    ? readJsonObject(record, 'details', '$', issues)
    : undefined;
  if (issues.length > 0 || !code || !message || retryable === undefined) return failure(issues);
  return success({ code, message, retryable, ...(details ? { details } : {}) });
}

export function decodeForgeActorResponse(value: unknown): ForgeDecodeResult<ForgeActorResponse> {
  return decodeResponse(value, decodeForgeActorResult);
}

export function decodeForgeSourceCreateResponse(value: unknown): ForgeDecodeResult<ForgeSourceCreateResponse> {
  return decodeResponse(value, decodeForgeSourceCreateResult);
}

export function decodeForgeRequest(value: unknown): ForgeDecodeResult<ForgeActorRequest | ForgeSourceCreateRequest> {
  if (!isRecord(value)) return failure([{ path: '$', code: 'INVALID_OBJECT', message: 'Request must be an object.' }]);
  if (value.capabilityId === 'actor.standard.generate.v1') return decodeForgeActorRequest(value);
  if (value.capabilityId === 'source.actor.create.v1') return decodeForgeSourceCreateRequest(value);
  return failure([{ path: '$/capabilityId', code: 'UNKNOWN_CAPABILITY', message: 'Capability id is not part of the closed Forge capability set.' }]);
}

function decodeResponse<T>(
  value: unknown,
  decodeResult: (value: unknown) => ForgeDecodeResult<T>,
): ForgeDecodeResult<ForgeResponse<T>> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', RESPONSE_KEYS, issues);
  if (!record) return failure(issues);
  readProtocolVersion(record, '$', issues);
  const requestId = readNonEmptyString(record, 'requestId', '$', issues);
  const hasResult = Object.prototype.hasOwnProperty.call(record, 'result');
  const hasError = Object.prototype.hasOwnProperty.call(record, 'error');
  if (hasResult === hasError) issue(issues, '$', 'RESPONSE_SHAPE_INVALID', 'Response must contain exactly one of result or error.');
  if (issues.length > 0 || !requestId || hasResult === hasError) return failure(issues);

  if (hasResult) {
    const result = decodeResult(record.result);
    if (!result.ok) return failure(prefixIssues(result.issues, '$/result'));
    return success({ protocolVersion: FORGE_PROTOCOL_VERSION, requestId, result: result.value });
  }
  const error = decodeForgeError(record.error);
  if (!error.ok) return failure(prefixIssues(error.issues, '$/error'));
  return success({ protocolVersion: FORGE_PROTOCOL_VERSION, requestId, error: error.value });
}

function readActorRequestSource(
  value: unknown,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeActorRequest['source'] | undefined {
  const record = readRecord(value, path, new Set(['displayName', 'content', 'sourceId', 'utf8Sha256']), issues);
  if (!record) return undefined;
  const displayName = readNonEmptyString(record, 'displayName', path, issues);
  const content = readString(record, 'content', path, issues);
  const sourceId = readSourceId(record, 'sourceId', path, issues);
  const utf8Sha256 = readHash(record, 'utf8Sha256', path, issues);
  if (!displayName || content === undefined || !sourceId || !utf8Sha256) return undefined;
  return { displayName, content, sourceId, utf8Sha256 };
}

function readSourceCreateSource(
  value: unknown,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeSourceCreateRequest['source'] | undefined {
  const record = readRecord(value, path, new Set(['displayName', 'content', 'utf8Sha256']), issues);
  if (!record) return undefined;
  const displayName = readNonEmptyString(record, 'displayName', path, issues);
  const content = readString(record, 'content', path, issues);
  const utf8Sha256 = readHash(record, 'utf8Sha256', path, issues);
  if (!displayName || content === undefined || !utf8Sha256) return undefined;
  return { displayName, content, utf8Sha256 };
}

function readFoundryRuntime(
  value: unknown,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeActorRequest['foundryRuntime'] | undefined {
  const record = readRecord(value, path, new Set(['fvttVersion', 'systemId', 'systemVersion']), issues);
  if (!record) return undefined;
  const fvttVersion = readNonEmptyString(record, 'fvttVersion', path, issues);
  const systemId = readLiteral(record, 'systemId', path, 'dnd5e', issues);
  const systemVersion = readNonEmptyString(record, 'systemVersion', path, issues);
  if (!fvttVersion || !systemId || !systemVersion) return undefined;
  try {
    resolveForgeTarget(fvttVersion);
  } catch (error) {
    issue(issues, path + '/fvttVersion', 'TARGET_UNSUPPORTED', error instanceof Error ? error.message : 'Unsupported FVTT runtime.');
  }
  return { fvttVersion, systemId, systemVersion };
}

function readResolvedTarget(
  value: unknown,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeActorRequest['resolvedTarget'] | undefined {
  const record = readRecord(value, path, new Set(['generatorProfile', 'effectProfile', 'iconMode']), issues);
  if (!record) return undefined;
  const generatorProfile = readEnum(record, 'generatorProfile', path, FORGE_GENERATOR_PROFILES, issues);
  const effectProfile = readLiteral(record, 'effectProfile', path, 'core', issues);
  const iconMode = readLiteral(record, 'iconMode', path, 'off', issues);
  if (!generatorProfile || !effectProfile || !iconMode) return undefined;
  return { generatorProfile, effectProfile, iconMode };
}

function readActorResultBase(
  record: Record<string, unknown>,
  issues: ForgeDecodeIssue[],
): ForgeActorResult extends infer T ? T extends { status: string } ? Omit<T, 'status' | 'artifact' | 'artifactHash'> : never : never {
  const sourceIdentityRecord = readRecord(record.sourceIdentity, '$/sourceIdentity', new Set(['sourceId', 'sourceHash']), issues);
  const targetRecord = readRecord(record.target, '$/target', new Set([
    'fvttRuntimeVersion',
    'generatorProfile',
    'generatorVersion',
    'systemId',
    'systemVersionObserved',
    'effectProfile',
    'iconMode',
  ]), issues);
  const sourceId = sourceIdentityRecord ? readSourceId(sourceIdentityRecord, 'sourceId', '$/sourceIdentity', issues) : undefined;
  const sourceHash = sourceIdentityRecord ? readHash(sourceIdentityRecord, 'sourceHash', '$/sourceIdentity', issues) : undefined;
  const fvttRuntimeVersion = targetRecord ? readNonEmptyString(targetRecord, 'fvttRuntimeVersion', '$/target', issues) : undefined;
  const generatorProfile = targetRecord ? readEnum(targetRecord, 'generatorProfile', '$/target', FORGE_GENERATOR_PROFILES, issues) : undefined;
  const generatorVersion = targetRecord ? readNonEmptyString(targetRecord, 'generatorVersion', '$/target', issues) : undefined;
  const systemId = targetRecord ? readLiteral(targetRecord, 'systemId', '$/target', 'dnd5e', issues) : undefined;
  const systemVersionObserved = targetRecord ? readNonEmptyString(targetRecord, 'systemVersionObserved', '$/target', issues) : undefined;
  const effectProfile = targetRecord ? readLiteral(targetRecord, 'effectProfile', '$/target', 'core', issues) : undefined;
  const iconMode = targetRecord ? readLiteral(targetRecord, 'iconMode', '$/target', 'off', issues) : undefined;
  const diagnostics = readDiagnostics(record.diagnostics, '$/diagnostics', issues);
  const verification = readJsonObject(record, 'verification', '$', issues);
  const actorVerification = readJsonObject(record, 'actorVerification', '$', issues);

  if (fvttRuntimeVersion && generatorProfile) {
    try {
      assertForgeTargetProfile(fvttRuntimeVersion, generatorProfile);
    } catch (error) {
      issue(issues, '$/target/generatorProfile', 'TARGET_MISMATCH', error instanceof Error ? error.message : 'Result target does not match FVTT runtime.');
    }
  }
  if (issues.length > 0 || !sourceId || !sourceHash || !fvttRuntimeVersion || !generatorProfile || !generatorVersion || !systemId || !systemVersionObserved || !effectProfile || !iconMode || !diagnostics || !verification || !actorVerification) {
    return undefined as never;
  }
  return {
    sourceIdentity: { sourceId, sourceHash },
    target: {
      fvttRuntimeVersion,
      generatorProfile,
      generatorVersion,
      systemId,
      systemVersionObserved,
      effectProfile,
      iconMode,
    },
    diagnostics,
    verification,
    actorVerification,
  } as never;
}

function readDiagnostics(value: unknown, path: string, issues: ForgeDecodeIssue[]): GenerationDiagnostic[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_DIAGNOSTICS', 'diagnostics must be an array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    const entryPath = path + '/' + index;
    const record = readRecord(entry, entryPath, new Set(['code', 'severity', 'stage', 'path', 'message', 'evidence']), issues);
    if (!record) return [];
    const code = readNonEmptyString(record, 'code', entryPath, issues);
    const severity = readEnum(record, 'severity', entryPath, ['error', 'warning', 'info'] as const, issues);
    const stage = readEnum(record, 'stage', entryPath, ['parse', 'ir', 'projection', 'schema', 'semantic'] as const, issues);
    const diagnosticPath = readString(record, 'path', entryPath, issues);
    const message = readNonEmptyString(record, 'message', entryPath, issues);
    const evidence = Object.prototype.hasOwnProperty.call(record, 'evidence')
      ? readEvidence(record.evidence, entryPath + '/evidence', issues)
      : undefined;
    if (!code || !severity || !stage || diagnosticPath === undefined || !message || (Object.prototype.hasOwnProperty.call(record, 'evidence') && !evidence)) return [];
    return [{ code, severity, stage, path: diagnosticPath, message, ...(evidence ? { evidence } : {}) }];
  });
}

function readEvidence(value: unknown, path: string, issues: ForgeDecodeIssue[]): EvidenceRef[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_EVIDENCE', 'evidence must be an array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    const entryPath = path + '/' + index;
    const record = readRecord(entry, entryPath, new Set(['start', 'end', 'quote']), issues);
    if (!record) return [];
    const start = readInteger(record, 'start', entryPath, issues);
    const end = readInteger(record, 'end', entryPath, issues);
    const quote = readString(record, 'quote', entryPath, issues);
    if (start === undefined || end === undefined || start < 0 || end <= start || quote === undefined || quote.length !== end - start) {
      issue(issues, entryPath, 'INVALID_EVIDENCE', 'Evidence must be a valid UTF-16 source span.');
      return [];
    }
    return [{ start, end, quote }];
  });
}

function readVersionRouting(value: unknown, path: string, issues: ForgeDecodeIssue[]): ForgeActorCapability['versionRouting'] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_VERSION_ROUTING', 'versionRouting must be an array.');
    return undefined;
  }
  if (value.length === 0) issue(issues, path, 'INVALID_VERSION_ROUTING', 'versionRouting must not be empty.');
  return value.flatMap((entry, index) => {
    const entryPath = path + '/' + index;
    const record = readRecord(entry, entryPath, new Set(['fvttVersion', 'generatorProfile']), issues);
    if (!record) return [];
    const fvttVersion = readNonEmptyString(record, 'fvttVersion', entryPath, issues);
    const generatorProfile = readEnum(record, 'generatorProfile', entryPath, FORGE_GENERATOR_PROFILES, issues);
    if (!fvttVersion || !generatorProfile) return [];
    return [{ fvttVersion, generatorProfile }];
  });
}

function readGeneratorProfiles(value: unknown, path: string, issues: ForgeDecodeIssue[]): ForgeGeneratorProfile[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_GENERATOR_PROFILES', 'generatorProfiles must be an array.');
    return undefined;
  }
  if (value.length === 0) issue(issues, path, 'INVALID_GENERATOR_PROFILES', 'generatorProfiles must not be empty.');
  return value.flatMap((entry, index) => {
    if (!isForgeGeneratorProfile(entry)) {
      issue(issues, path + '/' + index, 'INVALID_GENERATOR_PROFILE', 'Unknown generator profile.');
      return [];
    }
    return [entry];
  });
}

function readRecord(
  value: unknown,
  path: string,
  allowedKeys: Set<string>,
  issues: ForgeDecodeIssue[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    issue(issues, path, 'INVALID_OBJECT', 'Expected an object.');
    return undefined;
  }
  if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) {
    issue(issues, path, 'NON_JSON_SAFE', 'Objects with symbol keys are not JSON-safe.');
  }
  for (const key of Object.keys(value).sort()) {
    if (!allowedKeys.has(key)) issue(issues, path + '/' + escapePointerSegment(key), 'UNKNOWN_FIELD', 'Unknown field is not accepted.');
  }
  return value;
}

function readProtocolVersion(record: Record<string, unknown>, path: string, issues: ForgeDecodeIssue[]): void {
  if (record.protocolVersion !== FORGE_PROTOCOL_VERSION) {
    issue(issues, path + '/protocolVersion', 'PROTOCOL_UNSUPPORTED', 'Only Forge Protocol v1 is supported.');
  }
}

function readRequired<T>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ForgeDecodeIssue[],
  predicate: (value: unknown) => value is T,
  code: string,
  message: string,
): T | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key) || !predicate(record[key])) {
    issue(issues, path + '/' + escapePointerSegment(key), code, message);
    return undefined;
  }
  return record[key] as T;
}

function readString(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): string | undefined {
  return readRequired(record, key, path, issues, (value): value is string => typeof value === 'string', 'INVALID_STRING', 'Expected a string.');
}

function readNonEmptyString(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): string | undefined {
  return readRequired(record, key, path, issues, (value): value is string => typeof value === 'string' && value.length > 0, 'INVALID_STRING', 'Expected a non-empty string.');
}

function readBoolean(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): boolean | undefined {
  return readRequired(record, key, path, issues, (value): value is boolean => typeof value === 'boolean', 'INVALID_BOOLEAN', 'Expected a boolean.');
}

function readInteger(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): number | undefined {
  return readRequired(record, key, path, issues, (value): value is number => Number.isSafeInteger(value), 'INVALID_INTEGER', 'Expected a safe integer.');
}

function readPositiveInteger(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): number | undefined {
  return readRequired(record, key, path, issues, (value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0, 'INVALID_INTEGER', 'Expected a positive safe integer.');
}

function readEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  values: readonly T[],
  issues: ForgeDecodeIssue[],
): T | undefined {
  return readRequired(record, key, path, issues, (value): value is T => typeof value === 'string' && values.includes(value as T), 'INVALID_ENUM', 'Expected a supported enum value.');
}

function readLiteral<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  value: T,
  issues: ForgeDecodeIssue[],
): T | undefined {
  return readRequired(record, key, path, issues, (actual): actual is T => actual === value, 'INVALID_LITERAL', 'Expected the literal ' + value + '.');
}

function readHash(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): Sha256 | undefined {
  return readRequired(record, key, path, issues, (value): value is Sha256 => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), 'INVALID_HASH', 'Expected a lowercase SHA-256 hash.');
}

function readSourceId(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]) {
  return readRequired(record, key, path, issues, isForgeSourceId, 'INVALID_SOURCE_ID', 'Expected a canonical Forge source ID.');
}

function readSourceRef(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]) {
  return readRequired(record, key, path, issues, isForgeSourceRef, 'INVALID_SOURCE_REF', 'Expected an opaque Forge source reference.');
}

function readJsonObject(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): JsonObject | undefined {
  const value = record[key];
  if (!isJsonObject(value)) {
    issue(issues, path + '/' + escapePointerSegment(key), 'INVALID_JSON_OBJECT', 'Expected a JSON object.');
    return undefined;
  }
  return value;
}

function isForgeGeneratorProfile(value: unknown): value is ForgeGeneratorProfile {
  return typeof value === 'string' && FORGE_GENERATOR_PROFILES.includes(value as ForgeGeneratorProfile);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isJsonValue(value) && typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function isJsonValue(value: unknown, stack = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || value === undefined) return false;
  if (stack.has(value)) return false;
  if (Array.isArray(value)) {
    if (!isDenseArray(value)) return false;
  } else if (!isPlainObject(value) || Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) {
    return false;
  }
  stack.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry, index) => Object.prototype.hasOwnProperty.call(value, index) && isJsonValue(entry, stack))
    : Object.values(value).every((entry) => isJsonValue(entry, stack));
  stack.delete(value);
  return valid;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameGeneratorProfiles(actual: readonly ForgeGeneratorProfile[], expected: readonly ForgeGeneratorProfile[]): boolean {
  return actual.length === expected.length
    && new Set(actual).size === actual.length
    && expected.every((profile) => actual.includes(profile));
}

function sameVersionRouting(
  actual: ForgeActorCapability['versionRouting'],
  expected: ForgeActorCapability['versionRouting'],
): boolean {
  return actual.length === expected.length && expected.every((entry) => actual.some(
    (candidate) => candidate.fvttVersion === entry.fvttVersion && candidate.generatorProfile === entry.generatorProfile,
  ));
}

function issue(issues: ForgeDecodeIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function success<T>(value: T, warnings: ForgeDecodeIssue[] = []): ForgeDecodeResult<T> {
  return warnings.length > 0 ? { ok: true, value, warnings } : { ok: true, value };
}

function failure<T>(issues: ForgeDecodeIssue[]): ForgeDecodeResult<T> {
  return { ok: false, issues };
}

function prefixIssues(issues: ForgeDecodeIssue[], prefix: string): ForgeDecodeIssue[] {
  return issues.map((entry) => ({ ...entry, path: prefix + (entry.path === '$' ? '' : entry.path.slice(1)) }));
}

function escapePointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
