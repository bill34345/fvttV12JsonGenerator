import type { EvidenceRef } from '@fvtt-json-generator/contracts';
import { canonicalJsonStringify, hashArtifact, hashSource } from './hash';
import {
  FORGE_ACTOR_CAPABILITY,
  FORGE_ITEM_CAPABILITY,
  FORGE_ITEM_SOURCE_CREATE_CAPABILITY,
  FORGE_SOURCE_CREATE_CAPABILITY,
  assertForgeTargetProfile,
  getForgeDnd5eVersionWarning,
  resolveForgeTarget,
} from './routing';
import {
  isForgeItemSourceId,
  isForgeSourceId,
  isForgeSourceRef,
  readForgeItemSourceId,
  readForgeSourceId,
} from './sourceIdentity';
import {
  projectForgeItemDocumentSummary,
  projectForgeItemVerification,
} from './projection';
import {
  FORGE_ERROR_CODES,
  FORGE_INPUT_ISSUE_TO_ERROR_CODE,
  FORGE_ACTIVITY_TYPES,
  FORGE_EXECUTION_MODES,
  FORGE_EXPRESSION_COVERAGES,
  FORGE_GENERATOR_PROFILES,
  FORGE_MECHANIC_COVERAGE_STATUSES,
  FORGE_MECHANIC_KINDS,
  FORGE_PROTOCOL_VERSION,
  FORGE_SERVICE_ID,
  FORGE_SOURCE_FIELDS,
  type ForgeActorCapability,
  type ForgeActorRequest,
  type ForgeActorResponse,
  type ForgeActorResult,
  type ForgeActorResultBase,
  type ForgeAcceptedVerificationSummary,
  type ForgeCapability,
  type ForgeDecodeIssue,
  type ForgeDecodeResult,
  type ForgeActorVerificationSummary,
  type ForgeActivityDamageSummary,
  type ForgeActivityRangeSummary,
  type ForgeActivitySummary,
  type ForgeDamagePartSummary,
  type ForgeEffectChangeSummary,
  type ForgeEffectSummary,
  type ForgeErrorCode,
  type ForgeGatewayError,
  type ForgeDiagnostic,
  type ForgeGatewayHealth,
  type ForgeGeneratorProfile,
  type ForgeHitPointSummary,
  type ForgeArmorClassSummary,
  type ForgeItemVerificationSummary,
  type ForgeItemDocumentSummary,
  type ForgeItemRequest,
  type ForgeItemResponse,
  type ForgeItemResult,
  type ForgeItemResultBase,
  type ForgeItemSourceCreateRequest,
  type ForgeItemSourceCreateResult,
  type ForgeItemSourceCreateResponse,
  type ForgeItemSourceId,
  type ForgeMechanicCoverageSummary,
  type ForgeResponse,
  type ForgeSensesSummary,
  type ForgeSourceCreateRequest,
  type ForgeSourceCreateResult,
  type ForgeSourceCreateResponse,
  type ForgeVerificationSummary,
  type JsonObject,
  type JsonValue,
  type Sha256,
} from './types';
import {
  isSafeForgeDiagnosticPath,
  isSafeForgeDocumentFieldPath,
  isSafeForgeWireMessage,
} from './wireSafety';

const ACTOR_REQUEST_KEYS = new Set(['protocolVersion', 'capabilityId', 'requestId', 'source', 'foundryRuntime', 'resolvedTarget']);
const SOURCE_CREATE_REQUEST_KEYS = new Set(['protocolVersion', 'capabilityId', 'requestId', 'source']);
const RESPONSE_KEYS = new Set(['protocolVersion', 'requestId', 'result', 'error']);
const HEALTH_KEYS = new Set(['protocolVersion', 'service', 'serviceVersion', 'instanceId', 'deployment', 'status']);
const ERROR_KEYS = new Set(['code', 'message', 'retryable']);
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
const ITEM_RESULT_KEYS = new Set([
  'sourceIdentity',
  'target',
  'diagnostics',
  'verification',
  'itemVerification',
  'itemDocument',
  'status',
  'artifact',
  'artifactHash',
]);
const MAX_INPUT_UTF8_BYTES = Math.min(
  FORGE_ACTOR_CAPABILITY.maxInputUtf8Bytes,
  FORGE_SOURCE_CREATE_CAPABILITY.maxInputUtf8Bytes,
);

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
  if (id === 'item.standard.generate.v1') {
    const record = readRecord(value, '$', new Set(['id', 'systemId', 'generatorProfiles', 'versionRouting', 'maxInputUtf8Bytes', 'maxConcurrentJobs']), issues);
    if (!record) return failure(issues);
    const systemId = readLiteral(record, 'systemId', '$', 'dnd5e', issues);
    const generatorProfiles = readGeneratorProfiles(record.generatorProfiles, '$/generatorProfiles', issues);
    const versionRouting = readVersionRouting(record.versionRouting, '$/versionRouting', issues);
    const maxInputUtf8Bytes = readPositiveInteger(record, 'maxInputUtf8Bytes', '$', issues);
    const maxConcurrentJobs = readPositiveInteger(record, 'maxConcurrentJobs', '$', issues);
    if (generatorProfiles && !sameGeneratorProfiles(generatorProfiles, FORGE_ITEM_CAPABILITY.generatorProfiles)) {
      issue(issues, '$/generatorProfiles', 'CAPABILITY_MISMATCH', 'generatorProfiles must match the Forge Item capability.');
    }
    if (versionRouting && !sameVersionRouting(versionRouting, FORGE_ITEM_CAPABILITY.versionRouting)) {
      issue(issues, '$/versionRouting', 'CAPABILITY_MISMATCH', 'versionRouting must match the Forge FVTT mapping.');
    }
    if (maxInputUtf8Bytes !== undefined && maxInputUtf8Bytes !== FORGE_ITEM_CAPABILITY.maxInputUtf8Bytes) {
      issue(issues, '$/maxInputUtf8Bytes', 'CAPABILITY_MISMATCH', 'maxInputUtf8Bytes must match the Forge Item capability.');
    }
    if (maxConcurrentJobs !== undefined && maxConcurrentJobs !== FORGE_ITEM_CAPABILITY.maxConcurrentJobs) {
      issue(issues, '$/maxConcurrentJobs', 'CAPABILITY_MISMATCH', 'maxConcurrentJobs must match the Forge Item capability.');
    }
    if (issues.length > 0 || !systemId || !generatorProfiles || !versionRouting || !maxInputUtf8Bytes || !maxConcurrentJobs) return failure(issues);
    return success({ id, systemId, generatorProfiles, versionRouting, maxInputUtf8Bytes, maxConcurrentJobs });
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
  if (id === 'source.item.create.v1') {
    const record = readRecord(value, '$', new Set(['id', 'sourceKind', 'maxInputUtf8Bytes', 'maxConcurrentJobs']), issues);
    if (!record) return failure(issues);
    const sourceKind = readLiteral(record, 'sourceKind', '$', 'item', issues);
    const maxInputUtf8Bytes = readPositiveInteger(record, 'maxInputUtf8Bytes', '$', issues);
    const maxConcurrentJobs = readPositiveInteger(record, 'maxConcurrentJobs', '$', issues);
    if (maxInputUtf8Bytes !== undefined && maxInputUtf8Bytes !== FORGE_ITEM_SOURCE_CREATE_CAPABILITY.maxInputUtf8Bytes) {
      issue(issues, '$/maxInputUtf8Bytes', 'CAPABILITY_MISMATCH', 'maxInputUtf8Bytes must match the Forge Item source capability.');
    }
    if (maxConcurrentJobs !== undefined && maxConcurrentJobs !== FORGE_ITEM_SOURCE_CREATE_CAPABILITY.maxConcurrentJobs) {
      issue(issues, '$/maxConcurrentJobs', 'CAPABILITY_MISMATCH', 'maxConcurrentJobs must match the Forge Item source capability.');
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
      const target = resolveForgeTarget(foundryRuntime.fvttVersion);
      if (target.compatibility === 'forward-fallback') {
        warnings.push({
          path: '$/foundryRuntime/fvttVersion',
          code: 'FORGE_FORWARD_FALLBACK',
          message: target.compatibilityMessage ?? 'FVTT runtime is using the v14 generator fallback.',
        });
      }
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

export function decodeForgeItemRequest(value: unknown): ForgeDecodeResult<ForgeItemRequest> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', ACTOR_REQUEST_KEYS, issues);
  if (!record) return failure(issues);
  readProtocolVersion(record, '$', issues);
  readLiteral(record, 'capabilityId', '$', 'item.standard.generate.v1', issues);
  const requestId = readNonEmptyString(record, 'requestId', '$', issues);
  const source = readItemRequestSource(record.source, '$/source', issues);
  const foundryRuntime = readFoundryRuntime(record.foundryRuntime, '$/foundryRuntime', issues);
  const resolvedTarget = readResolvedTarget(record.resolvedTarget, '$/resolvedTarget', issues);

  if (source && source.utf8Sha256 !== hashSource(source.content)) {
    issue(issues, '$/source/utf8Sha256', 'SOURCE_HASH_MISMATCH', 'utf8Sha256 must match the exact final Item source content.');
  }
  if (source) {
    const sourceIdentity = readForgeItemSourceId(source.content);
    if (sourceIdentity.status !== 'valid' || sourceIdentity.sourceId !== source.sourceId) {
      issue(issues, '$/source/sourceId', 'SOURCE_IDENTITY_MISMATCH', 'sourceId must match a valid item:v1 forge-source-id in the final Markdown.');
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
      const target = resolveForgeTarget(foundryRuntime.fvttVersion);
      if (target.compatibility === 'forward-fallback') {
        warnings.push({
          path: '$/foundryRuntime/fvttVersion',
          code: 'FORGE_FORWARD_FALLBACK',
          message: target.compatibilityMessage ?? 'FVTT runtime is using the v14 generator fallback.',
        });
      }
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
    capabilityId: 'item.standard.generate.v1',
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

export function decodeForgeItemSourceCreateRequest(value: unknown): ForgeDecodeResult<ForgeItemSourceCreateRequest> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', SOURCE_CREATE_REQUEST_KEYS, issues);
  if (!record) return failure(issues);
  readProtocolVersion(record, '$', issues);
  readLiteral(record, 'capabilityId', '$', 'source.item.create.v1', issues);
  const requestId = readNonEmptyString(record, 'requestId', '$', issues);
  const source = readSourceCreateSource(record.source, '$/source', issues);
  if (source && source.utf8Sha256 !== hashSource(source.content)) {
    issue(issues, '$/source/utf8Sha256', 'SOURCE_HASH_MISMATCH', 'utf8Sha256 must match the exact request content.');
  }
  if (issues.length > 0 || !requestId || !source) return failure(issues);
  return success({
    protocolVersion: FORGE_PROTOCOL_VERSION,
    capabilityId: 'source.item.create.v1',
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

export function decodeForgeItemSourceCreateResult(value: unknown): ForgeDecodeResult<ForgeItemSourceCreateResult> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', SOURCE_RESULT_KEYS, issues);
  if (!record) return failure(issues);
  const sourceRef = readSourceRef(record, 'sourceRef', '$', issues);
  const sourceId = readItemSourceId(record, 'sourceId', '$', issues);
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
  if (base.verification.status !== status) {
    issue(issues, '$/verification/status', 'STATUS_MISMATCH', 'result.status must equal verification.status.');
  }
  validateResultStatusInvariants(status, base, issues);

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
    return success({
      ...base,
      verification: base.verification as ForgeAcceptedVerificationSummary,
      status,
      artifact,
      artifactHash,
    });
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

export function decodeForgeItemResult(value: unknown): ForgeDecodeResult<ForgeItemResult> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', ITEM_RESULT_KEYS, issues);
  if (!record) return failure(issues);
  const base = readItemResultBase(record, issues);
  const status = readEnum(record, 'status', '$', ['accepted', 'needs_review', 'failed'] as const, issues);
  if (!status || !base) return failure(issues);
  if (base.verification.status !== status) {
    issue(issues, '$/verification/status', 'STATUS_MISMATCH', 'result.status must equal verification.status.');
  }
  validateItemResultStatusInvariants(status, base, issues);

  if (status === 'accepted') {
    const artifact = readJsonObject(record, 'artifact', '$', issues);
    const artifactHash = readHash(record, 'artifactHash', '$', issues);
    if (artifact && artifactHash) {
      try {
        if (hashArtifact(artifact) !== artifactHash) {
          issue(issues, '$/artifactHash', 'ARTIFACT_HASH_MISMATCH', 'artifactHash must match the canonical Item artifact.');
        }
      } catch (error) {
        issue(issues, '$/artifact', 'ARTIFACT_INVALID', error instanceof Error ? error.message : 'Artifact is not hashable.');
      }
    }
    if (issues.length > 0 || !artifact || !artifactHash) return failure(issues);
    return success({
      ...base,
      verification: base.verification as ForgeAcceptedVerificationSummary,
      status,
      artifact,
      artifactHash,
    });
  }

  if (Object.prototype.hasOwnProperty.call(record, 'artifactHash')) {
    issue(issues, '$/artifactHash', 'UNEXPECTED_FIELD', 'Only accepted Item results may include artifactHash.');
  }
  if (status === 'needs_review') {
    const artifact = Object.prototype.hasOwnProperty.call(record, 'artifact')
      ? readJsonObject(record, 'artifact', '$', issues)
      : undefined;
    if (issues.length > 0) return failure(issues);
    return success({ ...base, status, ...(artifact ? { artifact } : {}) });
  }

  if (Object.prototype.hasOwnProperty.call(record, 'artifact')) {
    issue(issues, '$/artifact', 'UNEXPECTED_FIELD', 'Failed Item results must not include artifact.');
  }
  return issues.length > 0 ? failure(issues) : success({ ...base, status });
}

function validateItemResultStatusInvariants(
  status: ForgeItemResult['status'],
  base: ForgeItemResultBase,
  issues: ForgeDecodeIssue[],
): void {
  const hasError = base.diagnostics.some((entry) => entry.severity === 'error');
  const hasWarning = base.diagnostics.some((entry) => entry.severity === 'warning');
  const hasReviewOnlyCoverage = base.verification.mechanicsCoverage.some((entry) => (
    entry.status !== 'projected'
    || entry.outputPaths.length === 0
    || (entry.expressionCoverage !== undefined && entry.expressionCoverage !== 'structured')
    || entry.executionMode === 'gm-assisted'
    || entry.executionMode === 'external-rule'
  ));

  if (status === 'accepted') {
    if (hasError || hasWarning) {
      issue(issues, '$/diagnostics', 'ACCEPTED_WITH_DIAGNOSTICS', 'Accepted Item results must not contain warning or error diagnostics.');
    }
    if (hasReviewOnlyCoverage) {
      issue(issues, '$/verification/mechanicsCoverage', 'ACCEPTED_WITH_REVIEW_COVERAGE', 'Accepted Item results must contain only fully projected mechanics coverage.');
    }
    return;
  }
  if (status === 'needs_review') {
    if (hasError) issue(issues, '$/diagnostics', 'NEEDS_REVIEW_WITH_ERROR', 'Needs-review Item results must not contain error diagnostics.');
    if (!hasWarning) issue(issues, '$/diagnostics', 'NEEDS_REVIEW_WITHOUT_WARNING', 'Needs-review Item results must contain at least one warning diagnostic.');
    return;
  }
  if (!hasError) issue(issues, '$/diagnostics', 'FAILED_WITHOUT_ERROR', 'Failed Item results must contain at least one error diagnostic.');
}

function validateResultStatusInvariants(
  status: ForgeActorResult['status'],
  base: ForgeActorResultBase,
  issues: ForgeDecodeIssue[],
): void {
  const hasError = base.diagnostics.some((entry) => entry.severity === 'error');
  const hasWarning = base.diagnostics.some((entry) => entry.severity === 'warning');
  const hasActorWarnings = base.actorVerification.warnings.length > 0;
  const hasReviewOnlyCoverage = base.verification.mechanicsCoverage.some((entry) => (
    entry.status !== 'projected'
    || entry.outputPaths.length === 0
    || (entry.expressionCoverage !== undefined && entry.expressionCoverage !== 'structured')
    || entry.executionMode === 'gm-assisted'
    || entry.executionMode === 'external-rule'
  ));

  if (status === 'accepted') {
    if (hasError || hasWarning) {
      issue(issues, '$/diagnostics', 'ACCEPTED_WITH_DIAGNOSTICS', 'Accepted results must not contain warning or error diagnostics.');
    }
    if (hasActorWarnings) {
      issue(issues, '$/actorVerification/warnings', 'ACCEPTED_WITH_WARNINGS', 'Accepted results must not contain actor verification warnings.');
    }
    if (hasReviewOnlyCoverage) {
      issue(issues, '$/verification/mechanicsCoverage', 'ACCEPTED_WITH_REVIEW_COVERAGE', 'Accepted results must contain only fully projected mechanics coverage.');
    }
    return;
  }

  if (status === 'needs_review') {
    if (hasError) {
      issue(issues, '$/diagnostics', 'NEEDS_REVIEW_WITH_ERROR', 'Needs-review results must not contain error diagnostics.');
    }
    if (!hasWarning) {
      issue(issues, '$/diagnostics', 'NEEDS_REVIEW_WITHOUT_WARNING', 'Needs-review results must contain at least one warning diagnostic.');
    }
    return;
  }

  if (!hasError) {
    issue(issues, '$/diagnostics', 'FAILED_WITHOUT_ERROR', 'Failed results must contain at least one error diagnostic.');
  }
}

export function decodeForgeError(value: unknown): ForgeDecodeResult<ForgeGatewayError> {
  const issues: ForgeDecodeIssue[] = [];
  const record = readRecord(value, '$', ERROR_KEYS, issues);
  if (!record) return failure(issues);
  const code = readEnum(record, 'code', '$', FORGE_ERROR_CODES, issues);
  const message = readNonEmptyString(record, 'message', '$', issues);
  const retryable = readBoolean(record, 'retryable', '$', issues);
  if (message && !isSafeForgeWireMessage(message)) {
    issue(issues, '$/message', 'UNSAFE_MESSAGE', 'Error messages must not expose internal filesystem paths.');
  }
  if (issues.length > 0 || !code || !message || retryable === undefined) return failure(issues);
  return success({ code, message, retryable });
}

export function decodeForgeActorResponse(value: unknown): ForgeDecodeResult<ForgeActorResponse> {
  return decodeResponse(value, decodeForgeActorResult);
}

export function decodeForgeSourceCreateResponse(value: unknown): ForgeDecodeResult<ForgeSourceCreateResponse> {
  return decodeResponse(value, decodeForgeSourceCreateResult);
}

export function decodeForgeItemResponse(value: unknown): ForgeDecodeResult<ForgeItemResponse> {
  return decodeResponse(value, decodeForgeItemResult);
}

export function decodeForgeItemSourceCreateResponse(value: unknown): ForgeDecodeResult<ForgeItemSourceCreateResponse> {
  return decodeResponse(value, decodeForgeItemSourceCreateResult);
}

/** Map decoder-only input policy issues to the stable Gateway error union. */
export function mapForgeInputIssueToErrorCode(issue: Pick<ForgeDecodeIssue, 'code'>): ForgeErrorCode | undefined {
  switch (issue.code) {
    case 'INPUT_EMPTY':
      return FORGE_INPUT_ISSUE_TO_ERROR_CODE.INPUT_EMPTY;
    case 'INPUT_TOO_LARGE':
      return FORGE_INPUT_ISSUE_TO_ERROR_CODE.INPUT_TOO_LARGE;
    default:
      return undefined;
  }
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
  const content = readForgeSourceContent(record, path, issues);
  const sourceId = readSourceId(record, 'sourceId', path, issues);
  const utf8Sha256 = readHash(record, 'utf8Sha256', path, issues);
  if (!displayName || content === undefined || !sourceId || !utf8Sha256) return undefined;
  return { displayName, content, sourceId, utf8Sha256 };
}

function readItemRequestSource(
  value: unknown,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeItemRequest['source'] | undefined {
  const record = readRecord(value, path, new Set(['displayName', 'content', 'sourceId', 'utf8Sha256']), issues);
  if (!record) return undefined;
  const displayName = readNonEmptyString(record, 'displayName', path, issues);
  const content = readForgeSourceContent(record, path, issues);
  const sourceId = readItemSourceId(record, 'sourceId', path, issues);
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
  const content = readForgeSourceContent(record, path, issues);
  const utf8Sha256 = readHash(record, 'utf8Sha256', path, issues);
  if (!displayName || content === undefined || !utf8Sha256) return undefined;
  return { displayName, content, utf8Sha256 };
}

function readForgeSourceContent(
  record: Record<string, unknown>,
  path: string,
  issues: ForgeDecodeIssue[],
): string | undefined {
  const content = readString(record, 'content', path, issues);
  if (content === undefined) return undefined;
  if (content.trim().length === 0) {
    issue(issues, path + '/content', 'INPUT_EMPTY', 'Source content must not be empty or whitespace-only.');
    return undefined;
  }
  const utf8Bytes = new TextEncoder().encode(content).byteLength;
  if (utf8Bytes > MAX_INPUT_UTF8_BYTES) {
    issue(
      issues,
      path + '/content',
      'INPUT_TOO_LARGE',
      `Source content must be at most ${MAX_INPUT_UTF8_BYTES} UTF-8 bytes.`,
    );
    return undefined;
  }
  return content;
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
): ForgeActorResultBase | undefined {
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
  const verification = readVerificationSummary(record.verification, '$/verification', issues);
  const actorVerification = readActorVerificationSummary(record.actorVerification, '$/actorVerification', issues);

  if (fvttRuntimeVersion && generatorProfile) {
    try {
      assertForgeTargetProfile(fvttRuntimeVersion, generatorProfile);
    } catch (error) {
      issue(issues, '$/target/generatorProfile', 'TARGET_MISMATCH', error instanceof Error ? error.message : 'Result target does not match FVTT runtime.');
    }
  }
  if (issues.length > 0 || !sourceId || !sourceHash || !fvttRuntimeVersion || !generatorProfile || !generatorVersion || !systemId || !systemVersionObserved || !effectProfile || !iconMode || !diagnostics || !verification || !actorVerification) {
    return undefined;
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
  };
}

function readItemResultBase(
  record: Record<string, unknown>,
  issues: ForgeDecodeIssue[],
): ForgeItemResultBase | undefined {
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
  const sourceId = sourceIdentityRecord ? readItemSourceId(sourceIdentityRecord, 'sourceId', '$/sourceIdentity', issues) : undefined;
  const sourceHash = sourceIdentityRecord ? readHash(sourceIdentityRecord, 'sourceHash', '$/sourceIdentity', issues) : undefined;
  const fvttRuntimeVersion = targetRecord ? readNonEmptyString(targetRecord, 'fvttRuntimeVersion', '$/target', issues) : undefined;
  const generatorProfile = targetRecord ? readEnum(targetRecord, 'generatorProfile', '$/target', FORGE_GENERATOR_PROFILES, issues) : undefined;
  const generatorVersion = targetRecord ? readNonEmptyString(targetRecord, 'generatorVersion', '$/target', issues) : undefined;
  const systemId = targetRecord ? readLiteral(targetRecord, 'systemId', '$/target', 'dnd5e', issues) : undefined;
  const systemVersionObserved = targetRecord ? readNonEmptyString(targetRecord, 'systemVersionObserved', '$/target', issues) : undefined;
  const effectProfile = targetRecord ? readLiteral(targetRecord, 'effectProfile', '$/target', 'core', issues) : undefined;
  const iconMode = targetRecord ? readLiteral(targetRecord, 'iconMode', '$/target', 'off', issues) : undefined;
  const diagnostics = readDiagnostics(record.diagnostics, '$/diagnostics', issues);
  const verification = readVerificationSummary(record.verification, '$/verification', issues);
  const itemVerification = readClosedProjection(
    record.itemVerification,
    '$/itemVerification',
    projectForgeItemVerification,
    issues,
  );
  const itemDocument = readClosedProjection(
    record.itemDocument,
    '$/itemDocument',
    projectForgeItemDocumentSummary,
    issues,
  );

  if (fvttRuntimeVersion && generatorProfile) {
    try {
      assertForgeTargetProfile(fvttRuntimeVersion, generatorProfile);
    } catch (error) {
      issue(issues, '$/target/generatorProfile', 'TARGET_MISMATCH', error instanceof Error ? error.message : 'Result target does not match FVTT runtime.');
    }
  }
  if (issues.length > 0 || !sourceId || !sourceHash || !fvttRuntimeVersion || !generatorProfile || !generatorVersion || !systemId || !systemVersionObserved || !effectProfile || !iconMode || !diagnostics || !verification || !itemVerification || !itemDocument) {
    return undefined;
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
    itemVerification,
    itemDocument,
  };
}

function readClosedProjection<T>(
  value: unknown,
  path: string,
  projector: (value: unknown) => T,
  issues: ForgeDecodeIssue[],
): T | undefined {
  try {
    const projected = projector(value);
    if (canonicalJsonStringify(value) !== canonicalJsonStringify(projected)) {
      issue(issues, path, 'UNEXPECTED_FIELD', 'Value contains undeclared or non-canonical wire fields.');
      return undefined;
    }
    return projected;
  } catch (error) {
    issue(issues, path, 'INVALID_PROJECTION', error instanceof Error ? error.message : 'Value is not a valid closed wire projection.');
    return undefined;
  }
}

function readVerificationSummary(
  value: unknown,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeVerificationSummary | undefined {
  const record = readRecord(value, path, new Set(['status', 'mechanicsCoverage']), issues);
  if (!record) return undefined;
  const status = readEnum(record, 'status', path, ['accepted', 'needs_review', 'failed'] as const, issues);
  const mechanicsCoverage = readMechanicsCoverage(record.mechanicsCoverage, path + '/mechanicsCoverage', issues);
  if (!status || !mechanicsCoverage) return undefined;
  return { status, mechanicsCoverage };
}

function readMechanicsCoverage(
  value: unknown,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeMechanicCoverageSummary[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_MECHANICS_COVERAGE', 'mechanicsCoverage must be an array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    const entryPath = path + '/' + index;
    const record = readRecord(entry, entryPath, new Set([
      'mechanicId',
      'kind',
      'sourceField',
      'status',
      'outputPaths',
      'expressionCoverage',
      'executionMode',
    ]), issues);
    if (!record) return [];
    const mechanicId = readNonEmptyString(record, 'mechanicId', entryPath, issues);
    const kind = readEnum(record, 'kind', entryPath, FORGE_MECHANIC_KINDS, issues);
    const sourceField = readEnum(record, 'sourceField', entryPath, FORGE_SOURCE_FIELDS, issues);
    const status = readEnum(record, 'status', entryPath, FORGE_MECHANIC_COVERAGE_STATUSES, issues);
    const outputPaths = readSafeOutputPaths(record.outputPaths, entryPath + '/outputPaths', issues);
    const expressionCoverage = readOptionalEnum(record, 'expressionCoverage', entryPath, FORGE_EXPRESSION_COVERAGES, issues);
    const executionMode = readOptionalEnum(record, 'executionMode', entryPath, FORGE_EXECUTION_MODES, issues);
    if (!mechanicId || !kind || !sourceField || !status || !outputPaths) return [];
    return [{
      mechanicId,
      kind,
      sourceField,
      status,
      outputPaths,
      ...(expressionCoverage ? { expressionCoverage } : {}),
      ...(executionMode ? { executionMode } : {}),
    }];
  });
}

function readSafeOutputPaths(value: unknown, path: string, issues: ForgeDecodeIssue[]): string[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_OUTPUT_PATHS', 'outputPaths must be an array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    if (typeof entry !== 'string' || !isSafeDocumentFieldPath(entry)) {
      issue(issues, path + '/' + index, 'INVALID_OUTPUT_PATH', 'outputPaths must contain safe document field paths.');
      return [];
    }
    return [entry];
  });
}

function isSafeDocumentFieldPath(value: string): boolean {
  return isSafeForgeDocumentFieldPath(value);
}

function readActorVerificationSummary(
  value: unknown,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeActorVerificationSummary | undefined {
  const record = readRecord(value, path, new Set(['actor', 'items', 'warnings']), issues);
  if (!record) return undefined;
  const actor = readActorSummary(record.actor, path + '/actor', issues);
  const items = readItemSummaries(record.items, path + '/items', issues);
  const warnings = readNonEmptyStringArray(record.warnings, path + '/warnings', issues);
  if (!actor || !items || !warnings) return undefined;
  return { actor, items, warnings };
}

function readActorSummary(value: unknown, path: string, issues: ForgeDecodeIssue[]): ForgeActorVerificationSummary['actor'] | undefined {
  const record = readRecord(value, path, new Set(['name', 'type', 'creatureType', 'hp', 'ac', 'cr', 'senses']), issues);
  if (!record) return undefined;
  const name = readNonEmptyString(record, 'name', path, issues);
  const type = readNonEmptyString(record, 'type', path, issues);
  const creatureType = readOptionalString(record, 'creatureType', path, issues);
  const hp = readOptionalHitPointSummary(record, 'hp', path, issues);
  const ac = readOptionalArmorClassSummary(record, 'ac', path, issues);
  const cr = readOptionalNumber(record, 'cr', path, issues);
  const senses = readSensesSummary(record.senses, path + '/senses', issues);
  if (!name || !type || !senses) return undefined;
  return {
    name,
    type,
    ...(creatureType !== undefined ? { creatureType } : {}),
    ...(hp ? { hp } : {}),
    ...(ac ? { ac } : {}),
    ...(cr !== undefined ? { cr } : {}),
    senses,
  };
}

function readOptionalHitPointSummary(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeHitPointSummary | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  const entryPath = path + '/' + key;
  const entry = readRecord(value, entryPath, new Set(['value', 'max', 'temp', 'tempmax', 'formula']), issues);
  if (!entry) return undefined;
  const result: ForgeHitPointSummary = {};
  const valueNumber = readOptionalNumber(entry, 'value', entryPath, issues);
  const max = readOptionalNumber(entry, 'max', entryPath, issues);
  const temp = readOptionalNumberOrNull(entry, 'temp', entryPath, issues);
  const tempmax = readOptionalNumberOrNull(entry, 'tempmax', entryPath, issues);
  const formula = readOptionalString(entry, 'formula', entryPath, issues);
  if (valueNumber !== undefined) result.value = valueNumber;
  if (max !== undefined) result.max = max;
  if (temp !== undefined) result.temp = temp;
  if (tempmax !== undefined) result.tempmax = tempmax;
  if (formula !== undefined) result.formula = formula;
  return result;
}

function readOptionalArmorClassSummary(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeArmorClassSummary | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  const entryPath = path + '/' + key;
  const entry = readRecord(value, entryPath, new Set(['value', 'flat', 'bonus', 'formula', 'calc']), issues);
  if (!entry) return undefined;
  const result: ForgeArmorClassSummary = {};
  const valueNumber = readOptionalNumber(entry, 'value', entryPath, issues);
  const flat = readOptionalNumber(entry, 'flat', entryPath, issues);
  const bonus = readOptionalNumber(entry, 'bonus', entryPath, issues);
  const formula = readOptionalString(entry, 'formula', entryPath, issues);
  const calc = readOptionalString(entry, 'calc', entryPath, issues);
  if (valueNumber !== undefined) result.value = valueNumber;
  if (flat !== undefined) result.flat = flat;
  if (bonus !== undefined) result.bonus = bonus;
  if (formula !== undefined) result.formula = formula;
  if (calc !== undefined) result.calc = calc;
  return result;
}

function readSensesSummary(value: unknown, path: string, issues: ForgeDecodeIssue[]): ForgeSensesSummary | undefined {
  const record = readRecord(value, path, new Set([
    'ranges',
    'darkvision',
    'blindsight',
    'tremorsense',
    'truesight',
    'passive',
    'special',
    'units',
  ]), issues);
  if (!record) return undefined;
  const ranges = readOptionalSenseRanges(record, path, issues);
  const result: ForgeSensesSummary = {};
  const directKeys = ['darkvision', 'blindsight', 'tremorsense', 'truesight', 'passive'] as const;
  for (const key of directKeys) {
    const number = readOptionalNumber(record, key, path, issues);
    if (number !== undefined) result[key] = number;
  }
  const special = readOptionalString(record, 'special', path, issues);
  const units = readOptionalString(record, 'units', path, issues);
  if (ranges) result.ranges = ranges;
  if (special !== undefined) result.special = special;
  if (units !== undefined) result.units = units;
  return result;
}

function readOptionalSenseRanges(
  record: Record<string, unknown>,
  path: string,
  issues: ForgeDecodeIssue[],
): NonNullable<ForgeSensesSummary['ranges']> | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, 'ranges')) return undefined;
  const entryPath = path + '/ranges';
  const entry = readRecord(record.ranges, entryPath, new Set(['darkvision', 'blindsight', 'tremorsense', 'truesight']), issues);
  if (!entry) return undefined;
  const result: NonNullable<ForgeSensesSummary['ranges']> = {};
  for (const key of ['darkvision', 'blindsight', 'tremorsense', 'truesight'] as const) {
    const number = readOptionalNumber(entry, key, entryPath, issues);
    if (number !== undefined) result[key] = number;
  }
  return result;
}

function readItemSummaries(value: unknown, path: string, issues: ForgeDecodeIssue[]): ForgeItemVerificationSummary[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_ITEMS', 'items must be an array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    const entryPath = path + '/' + index;
    const record = readRecord(entry, entryPath, new Set(['name', 'type', 'activation', 'activityTypes', 'activities', 'effects']), issues);
    if (!record) return [];
    const name = readNonEmptyString(record, 'name', entryPath, issues);
    const type = readNonEmptyString(record, 'type', entryPath, issues);
    const activation = readString(record, 'activation', entryPath, issues);
    const activityTypes = readEnumArray(record.activityTypes, entryPath + '/activityTypes', FORGE_ACTIVITY_TYPES, issues);
    const activities = readActivitySummaries(record.activities, entryPath + '/activities', issues);
    const effects = readEffectSummaries(record.effects, entryPath + '/effects', issues);
    if (!name || !type || activation === undefined || !activityTypes || !activities || !effects) return [];
    return [{ name, type, activation, activityTypes, activities, effects }];
  });
}

function readActivitySummaries(value: unknown, path: string, issues: ForgeDecodeIssue[]): ForgeActivitySummary[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_ACTIVITIES', 'activities must be an array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    const entryPath = path + '/' + index;
    const record = readRecord(entry, entryPath, new Set(['type', 'range', 'damage']), issues);
    if (!record) return [];
    const type = readEnum(record, 'type', entryPath, FORGE_ACTIVITY_TYPES, issues);
    const range = readOptionalActivityRange(record, entryPath, issues);
    const damage = readOptionalActivityDamage(record, entryPath, issues);
    if (!type) return [];
    return [{ type, ...(range ? { range } : {}), ...(damage ? { damage } : {}) }];
  });
}

function readOptionalActivityRange(record: Record<string, unknown>, path: string, issues: ForgeDecodeIssue[]): ForgeActivityRangeSummary | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, 'range')) return undefined;
  const entryPath = path + '/range';
  const entry = readRecord(record.range, entryPath, new Set(['override', 'value', 'long', 'reach', 'units', 'special']), issues);
  if (!entry) return undefined;
  const result: ForgeActivityRangeSummary = {};
  const override = readOptionalBoolean(entry, 'override', entryPath, issues);
  const value = readOptionalNumberOrNull(entry, 'value', entryPath, issues);
  const long = readOptionalNumberOrNull(entry, 'long', entryPath, issues);
  const reach = readOptionalNumberOrNull(entry, 'reach', entryPath, issues);
  const units = readOptionalString(entry, 'units', entryPath, issues);
  const special = readOptionalString(entry, 'special', entryPath, issues);
  if (override !== undefined) result.override = override;
  if (value !== undefined) result.value = value;
  if (long !== undefined) result.long = long;
  if (reach !== undefined) result.reach = reach;
  if (units !== undefined) result.units = units;
  if (special !== undefined) result.special = special;
  return result;
}

function readOptionalActivityDamage(record: Record<string, unknown>, path: string, issues: ForgeDecodeIssue[]): ForgeActivityDamageSummary | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, 'damage')) return undefined;
  const entryPath = path + '/damage';
  const entry = readRecord(record.damage, entryPath, new Set(['parts', 'includeBase', 'onSave']), issues);
  if (!entry) return undefined;
  const parts = readDamageParts(entry.parts, entryPath + '/parts', issues);
  const includeBase = readOptionalBoolean(entry, 'includeBase', entryPath, issues);
  const onSave = readOptionalString(entry, 'onSave', entryPath, issues);
  if (!parts) return undefined;
  return { parts, ...(includeBase !== undefined ? { includeBase } : {}), ...(onSave !== undefined ? { onSave } : {}) };
}

function readDamageParts(value: unknown, path: string, issues: ForgeDecodeIssue[]): ForgeDamagePartSummary[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_DAMAGE_PARTS', 'damage.parts must be an array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    const entryPath = path + '/' + index;
    const record = readRecord(entry, entryPath, new Set(['number', 'denomination', 'bonus', 'types', 'custom', 'scaling']), issues);
    if (!record) return [];
    const number = readOptionalNumberOrNull(record, 'number', entryPath, issues);
    const denomination = readOptionalNumberOrNull(record, 'denomination', entryPath, issues);
    const bonus = readOptionalString(record, 'bonus', entryPath, issues);
    const types = readNonEmptyStringArray(record.types, entryPath + '/types', issues, true);
    const custom = readOptionalDamageCustom(record, entryPath, issues);
    const scaling = readOptionalDamageScaling(record, entryPath, issues);
    if (!types) return [];
    return [{
      ...(number !== undefined ? { number } : {}),
      ...(denomination !== undefined ? { denomination } : {}),
      ...(bonus !== undefined ? { bonus } : {}),
      types,
      ...(custom ? { custom } : {}),
      ...(scaling ? { scaling } : {}),
    }];
  });
}

function readOptionalDamageCustom(
  record: Record<string, unknown>,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeDamagePartSummary['custom'] | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, 'custom')) return undefined;
  const entryPath = path + '/custom';
  const entry = readRecord(record.custom, entryPath, new Set(['enabled', 'formula']), issues);
  if (!entry) return undefined;
  const enabled = readBoolean(entry, 'enabled', entryPath, issues);
  const formula = readString(entry, 'formula', entryPath, issues);
  if (enabled === undefined || formula === undefined) return undefined;
  return { enabled, formula };
}

function readOptionalDamageScaling(
  record: Record<string, unknown>,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeDamagePartSummary['scaling'] | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, 'scaling')) return undefined;
  const entryPath = path + '/scaling';
  const entry = readRecord(record.scaling, entryPath, new Set(['mode', 'number', 'formula']), issues);
  if (!entry) return undefined;
  const mode = readString(entry, 'mode', entryPath, issues);
  const number = readOptionalNumberOrNull(entry, 'number', entryPath, issues);
  const formula = readOptionalString(entry, 'formula', entryPath, issues);
  if (mode === undefined) return undefined;
  return { mode, ...(number !== undefined ? { number } : {}), ...(formula !== undefined ? { formula } : {}) };
}

function readEffectSummaries(value: unknown, path: string, issues: ForgeDecodeIssue[]): ForgeEffectSummary[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_EFFECTS', 'effects must be an array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    const entryPath = path + '/' + index;
    const record = readRecord(entry, entryPath, new Set(['name', 'changes', 'sourceDerivedAcEffect', 'sourceText']), issues);
    if (!record) return [];
    const name = readNonEmptyString(record, 'name', entryPath, issues);
    const changes = readEffectChangeSummaries(record.changes, entryPath + '/changes', issues);
    const sourceDerivedAcEffect = readBoolean(record, 'sourceDerivedAcEffect', entryPath, issues);
    const sourceText = readString(record, 'sourceText', entryPath, issues);
    if (!name || !changes || sourceDerivedAcEffect === undefined || sourceText === undefined) return [];
    return [{ name, changes, sourceDerivedAcEffect, sourceText }];
  });
}

function readEffectChangeSummaries(value: unknown, path: string, issues: ForgeDecodeIssue[]): ForgeEffectChangeSummary[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_EFFECT_CHANGES', 'effect changes must be an array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    const entryPath = path + '/' + index;
    const record = readRecord(entry, entryPath, new Set(['key', 'mode', 'value', 'priority']), issues);
    if (!record) return [];
    const key = readNonEmptyString(record, 'key', entryPath, issues);
    const mode = readSummaryScalar(record, 'mode', entryPath, issues);
    const valueText = readString(record, 'value', entryPath, issues);
    const priority = readSummaryScalar(record, 'priority', entryPath, issues);
    if (!key || mode === undefined || valueText === undefined || priority === undefined) return [];
    return [{ key, mode, value: valueText, priority }];
  });
}

function readNonEmptyStringArray(value: unknown, path: string, issues: ForgeDecodeIssue[], allowEmpty = false): string[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_STRING_ARRAY', 'Expected a dense string array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    if (typeof entry !== 'string' || (!allowEmpty && entry.length === 0)) {
      issue(issues, path + '/' + index, 'INVALID_STRING', 'Expected a non-empty string.');
      return [];
    }
    return [entry];
  });
}

function readEnumArray<T extends string>(value: unknown, path: string, values: readonly T[], issues: ForgeDecodeIssue[]): T[] | undefined {
  if (!isDenseArray(value)) {
    issue(issues, path, 'INVALID_ENUM_ARRAY', 'Expected a dense enum array.');
    return undefined;
  }
  return value.flatMap((entry, index) => {
    if (typeof entry !== 'string' || !values.includes(entry as T)) {
      issue(issues, path + '/' + index, 'INVALID_ENUM', 'Expected a supported enum value.');
      return [];
    }
    return [entry as T];
  });
}

function readDiagnostics(value: unknown, path: string, issues: ForgeDecodeIssue[]): ForgeDiagnostic[] | undefined {
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
    const safeDiagnosticPath = diagnosticPath !== undefined && isSafeForgeDiagnosticPath(diagnosticPath)
      ? diagnosticPath
      : undefined;
    if (diagnosticPath !== undefined && safeDiagnosticPath === undefined) {
      issue(issues, entryPath + '/path', 'UNSAFE_DIAGNOSTIC_PATH', 'Diagnostic paths must use a safe logical namespace.');
    }
    if (message && !isSafeForgeWireMessage(message)) {
      issue(issues, entryPath + '/message', 'UNSAFE_DIAGNOSTIC_MESSAGE', 'Diagnostic messages must not expose internal filesystem paths.');
    }
    const evidence = Object.prototype.hasOwnProperty.call(record, 'evidence')
      ? readEvidence(record.evidence, entryPath + '/evidence', issues)
      : undefined;
    if (!code || !severity || !stage || safeDiagnosticPath === undefined || !message || (Object.prototype.hasOwnProperty.call(record, 'evidence') && !evidence)) return [];
    return [{ code, severity, stage, path: safeDiagnosticPath, message, ...(evidence ? { evidence } : {}) }];
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

function readOptionalString(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return readString(record, key, path, issues);
}

function readNonEmptyString(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): string | undefined {
  return readRequired(record, key, path, issues, (value): value is string => typeof value === 'string' && value.length > 0, 'INVALID_STRING', 'Expected a non-empty string.');
}

function readBoolean(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): boolean | undefined {
  return readRequired(record, key, path, issues, (value): value is boolean => typeof value === 'boolean', 'INVALID_BOOLEAN', 'Expected a boolean.');
}

function readOptionalBoolean(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): boolean | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return readBoolean(record, key, path, issues);
}

function readInteger(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): number | undefined {
  return readRequired(record, key, path, issues, (value): value is number => Number.isSafeInteger(value), 'INVALID_INTEGER', 'Expected a safe integer.');
}

function readOptionalNumber(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return readRequired(record, key, path, issues, (value): value is number => typeof value === 'number' && Number.isFinite(value), 'INVALID_NUMBER', 'Expected a finite number.');
}

function readOptionalNumberOrNull(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return readRequired(record, key, path, issues, (value): value is number | null => value === null || (typeof value === 'number' && Number.isFinite(value)), 'INVALID_NUMBER', 'Expected a finite number or null.');
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

function readOptionalEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  values: readonly T[],
  issues: ForgeDecodeIssue[],
): T | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return readEnum(record, key, path, values, issues);
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

function readItemSourceId(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ForgeDecodeIssue[],
): ForgeItemSourceId | undefined {
  return readRequired(record, key, path, issues, isForgeItemSourceId, 'INVALID_SOURCE_ID', 'Expected a canonical Forge Item source ID.');
}

function readSourceRef(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]) {
  return readRequired(record, key, path, issues, isForgeSourceRef, 'INVALID_SOURCE_REF', 'Expected an opaque Forge source reference.');
}

function readSummaryScalar(record: Record<string, unknown>, key: string, path: string, issues: ForgeDecodeIssue[]): string | number | boolean | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    issue(issues, path + '/' + escapePointerSegment(key), 'INVALID_SCALAR', 'Expected a declared scalar value.');
    return undefined;
  }
  const value = record[key];
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
    return value;
  }
  issue(issues, path + '/' + escapePointerSegment(key), 'INVALID_SCALAR', 'Expected a JSON scalar value.');
  return undefined;
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
