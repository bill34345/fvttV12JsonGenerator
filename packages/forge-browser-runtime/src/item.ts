import {
  attachForgeItemSourceId,
  decodeForgeItemRequest,
  hashArtifact,
  mapForgeInputIssueToErrorCode,
  projectForgeDiagnostics,
  projectForgeItemDocument,
  projectForgeItemVerification,
  projectForgeVerificationSummary,
  requireForgeAcceptedVerification,
  resolveForgeTarget,
  type ForgeDiagnostic,
  type ForgeErrorCode,
  type ForgeItemDocumentSummary,
  type ForgeItemRequest,
  type ForgeItemResponse,
  type ForgeItemSourceId,
  type ForgeItemVerificationSummary,
  type ForgeVerificationSummary,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import type { GenerationDiagnostic } from '@fvtt-json-generator/generation/types';
import { parseForgeItemSource } from '@fvtt-json-generator/parser/forge-item-source';
import { createDisabledIconResolutionSession } from '@fvtt-json-generator/workflows/icon-port';
import { generateItemArtifacts } from '@fvtt-json-generator/workflows/item-generation';
import { normalizeForgeItemArtifact } from './artifact';
import { buildBrowserItemVerificationSummary } from './itemVerification';

export interface BuildForgeItemRequestOptions {
  content: string;
  displayName: string;
  requestId: string;
  fvttVersion: string;
  systemVersion: string;
  sourceId?: ForgeItemSourceId;
}

export interface ForgeFinalItemSource {
  content: string;
  sourceId: ForgeItemSourceId;
  sourceHash: Sha256;
  changed: boolean;
}

export function prepareForgeFinalItemSource(
  content: string,
  sourceId?: ForgeItemSourceId,
): ForgeFinalItemSource {
  return attachForgeItemSourceId(content, sourceId);
}

export function buildForgeItemRequest(options: BuildForgeItemRequestOptions): ForgeItemRequest {
  if (typeof options.content !== 'string' || options.content.trim().length === 0) {
    throw new TypeError('Item source content must not be empty or whitespace-only.');
  }
  const finalSource = prepareForgeFinalItemSource(options.content, options.sourceId);
  const target = resolveForgeTarget(options.fvttVersion);
  return {
    protocolVersion: 1,
    capabilityId: 'item.standard.generate.v1',
    requestId: requireNonEmpty(options.requestId, 'requestId'),
    source: {
      displayName: requireNonEmpty(options.displayName, 'displayName'),
      content: finalSource.content,
      sourceId: finalSource.sourceId,
      utf8Sha256: finalSource.sourceHash,
    },
    foundryRuntime: {
      fvttVersion: options.fvttVersion,
      systemId: 'dnd5e',
      systemVersion: options.systemVersion,
    },
    resolvedTarget: {
      generatorProfile: target.generatorProfile,
      effectProfile: 'core',
      iconMode: 'off',
    },
  };
}

export async function convertFinalItemSource(request: ForgeItemRequest): Promise<ForgeItemResponse> {
  const decoded = decodeForgeItemRequest(request);
  if (!decoded.ok) return itemErrorResponse(requestIdOf(request), decoded.issues);
  const value = decoded.value;
  const targetVersion = value.resolvedTarget.generatorProfile === 'v14' ? '14' : '12';

  try {
    const parsed = parseForgeItemSource(value.source.content);
    if (parsed.sourceId !== value.source.sourceId) {
      throw new TypeError('Parsed Forge Item source identity does not match the request.');
    }
    const artifacts = await generateItemArtifacts(parsed.item, {
      fvttVersion: targetVersion,
      effectProfile: 'core',
      iconWorkflow: { createResolutionSession: (_targetVersion, options) => createDisabledIconResolutionSession(options) },
      iconOptions: { mode: 'off' },
    });
    if (artifacts.length !== 1) {
      return artifacts.length === 0
        ? failedItemResponse(value, 'Forge Item generation produced no artifact.')
        : multiArtifactReviewResponse(value, artifacts.length);
    }

    const generated = artifacts[0]!;
    const artifact = normalizeForgeItemArtifact(generated.item, targetVersion);
    const formalVerification = verifyGeneratedDocument({
      canonical: generated.canonical,
      output: artifact,
      target: targetVersion,
      effectProfile: 'core',
    });
    const diagnostics = deduplicateDiagnostics([
      ...formalVerification.diagnostics,
      ...generated.diagnostics,
    ]);
    let status = resolveStatus(formalVerification.status, diagnostics);
    ensureStatusDiagnostic(status, diagnostics);
    const itemVerification = projectForgeItemVerification(buildBrowserItemVerificationSummary(artifact));
    const itemDocument = projectForgeItemDocument(artifact);
    let verification = projectForgeVerificationSummary({
      ...formalVerification,
      status,
      diagnostics,
    });
    let acceptedVerification: ReturnType<typeof requireForgeAcceptedVerification> | undefined;
    if (status === 'accepted') {
      try {
        acceptedVerification = requireForgeAcceptedVerification(verification);
      } catch {
        status = 'needs_review';
        diagnostics.push({
          code: 'FORGE_REVIEW_COVERAGE_REQUIRED',
          severity: 'warning',
          stage: 'semantic',
          path: 'item',
          message: 'Generated Item mechanics include a review-only coverage entry.',
        });
        verification = projectForgeVerificationSummary({ ...formalVerification, status, diagnostics });
      }
    }
    const base = makeItemResultBase(
      value,
      formalVerification.target.stats.systemVersion,
      verification,
      itemVerification,
      itemDocument,
      projectForgeDiagnostics(diagnostics),
    );
    if (status === 'accepted') {
      if (!acceptedVerification) throw new TypeError('Accepted Forge Item verification was not proven by the closed projection.');
      return {
        protocolVersion: 1,
        requestId: value.requestId,
        result: {
          ...base,
          status: 'accepted',
          artifact,
          artifactHash: hashArtifact(artifact),
          verification: acceptedVerification,
        },
      };
    }
    if (status === 'needs_review') {
      return {
        protocolVersion: 1,
        requestId: value.requestId,
        result: { ...base, status: 'needs_review', artifact, verification },
      };
    }
    return { protocolVersion: 1, requestId: value.requestId, result: { ...base, status: 'failed', verification } };
  } catch (error) {
    return failedItemResponse(value, safeErrorMessage(error));
  }
}

function multiArtifactReviewResponse(request: ForgeItemRequest, artifactCount: number): ForgeItemResponse {
  const diagnostic: GenerationDiagnostic = {
    code: 'FORGE_ITEM_MULTIPLE_ARTIFACTS_UNSUPPORTED',
    severity: 'warning',
    stage: 'semantic',
    path: 'item',
    message: `Forge Item create-only supports exactly one final artifact; generation produced ${artifactCount}.`,
  };
  const verification: ForgeVerificationSummary = { status: 'needs_review', mechanicsCoverage: [] };
  const base = makeItemResultBase(
    request,
    request.foundryRuntime.systemVersion,
    verification,
    emptyItemVerification(request.source.displayName),
    emptyItemDocument(request.source.displayName),
    projectForgeDiagnostics([diagnostic]),
  );
  return {
    protocolVersion: 1,
    requestId: request.requestId,
    result: { ...base, status: 'needs_review', verification },
  };
}

function failedItemResponse(request: ForgeItemRequest, message: string): ForgeItemResponse {
  const diagnostic: GenerationDiagnostic = {
    code: 'FORGE_WORKFLOW_FAILED',
    severity: 'error',
    stage: 'parse',
    path: 'item',
    message: safeErrorMessage(message),
  };
  const verification: ForgeVerificationSummary = { status: 'failed', mechanicsCoverage: [] };
  const base = makeItemResultBase(
    request,
    request.foundryRuntime.systemVersion,
    verification,
    emptyItemVerification(request.source.displayName),
    emptyItemDocument(request.source.displayName),
    projectForgeDiagnostics([diagnostic]),
  );
  return { protocolVersion: 1, requestId: request.requestId, result: { ...base, status: 'failed', verification } };
}

function makeItemResultBase(
  request: ForgeItemRequest,
  systemVersionObserved: string,
  verification: ForgeVerificationSummary,
  itemVerification: ForgeItemVerificationSummary,
  itemDocument: ForgeItemDocumentSummary,
  diagnostics: ForgeDiagnostic[],
) {
  return {
    sourceIdentity: { sourceId: request.source.sourceId, sourceHash: request.source.utf8Sha256 },
    target: {
      fvttRuntimeVersion: request.foundryRuntime.fvttVersion,
      generatorProfile: request.resolvedTarget.generatorProfile,
      generatorVersion: '0.1.0',
      systemId: 'dnd5e' as const,
      systemVersionObserved,
      effectProfile: 'core' as const,
      iconMode: 'off' as const,
    },
    diagnostics,
    verification,
    itemVerification,
    itemDocument,
  };
}

function emptyItemVerification(name: string): ForgeItemVerificationSummary {
  return { name, type: 'unknown', activation: '', activityTypes: [], activities: [], effects: [] };
}

function emptyItemDocument(name: string): ForgeItemDocumentSummary {
  return {
    name,
    type: 'unknown',
    description: {},
    rarity: null,
    attunement: null,
    armor: {},
    itemType: {},
    properties: [],
    weight: {},
    uses: {},
    activities: [],
    effects: [],
  };
}

function resolveStatus(
  formalStatus: 'accepted' | 'needs_review' | 'failed',
  diagnostics: GenerationDiagnostic[],
): 'accepted' | 'needs_review' | 'failed' {
  if (formalStatus === 'failed' || diagnostics.some((entry) => entry.severity === 'error')) return 'failed';
  if (formalStatus === 'needs_review' || diagnostics.some((entry) => entry.severity === 'warning')) return 'needs_review';
  return 'accepted';
}

function ensureStatusDiagnostic(
  status: 'accepted' | 'needs_review' | 'failed',
  diagnostics: GenerationDiagnostic[],
): void {
  if (status === 'failed' && !diagnostics.some((entry) => entry.severity === 'error')) {
    diagnostics.push({
      code: 'FORGE_VERIFICATION_FAILED',
      severity: 'error',
      stage: 'semantic',
      path: 'item',
      message: 'The formal Item verification failed without an error diagnostic.',
    });
  }
  if (status === 'needs_review' && !diagnostics.some((entry) => entry.severity === 'warning')) {
    diagnostics.push({
      code: 'FORGE_VERIFICATION_REVIEW_REQUIRED',
      severity: 'warning',
      stage: 'semantic',
      path: 'item',
      message: 'The formal Item verification requires review before creation.',
    });
  }
}

function deduplicateDiagnostics(diagnostics: GenerationDiagnostic[]): GenerationDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((entry) => {
    const key = `${entry.code}\u0000${entry.severity}\u0000${entry.stage}\u0000${entry.path}\u0000${entry.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function itemErrorResponse(requestId: string, issues: Array<{ code: string; message: string }>): ForgeItemResponse {
  const first = issues[0] ?? { code: 'INVALID_REQUEST', message: 'Forge Item request was rejected.' };
  return {
    protocolVersion: 1,
    requestId,
    error: {
      code: mapRequestErrorCode(first.code),
      message: safeErrorMessage(first.message),
      retryable: false,
    },
  };
}

function mapRequestErrorCode(code: string): ForgeErrorCode {
  const input = mapForgeInputIssueToErrorCode({ code });
  if (input) return input;
  if (code.includes('SOURCE_ID')) return 'FORGE_SOURCE_ID_INVALID';
  if (code.includes('HASH')) return 'FORGE_SOURCE_HASH_MISMATCH';
  if (code.includes('TARGET') || code.includes('RUNTIME')) return 'FORGE_TARGET_UNSUPPORTED';
  return 'FORGE_WORKFLOW_FAILED';
}

function requestIdOf(request: unknown): string {
  const value = request && typeof request === 'object' ? (request as Record<string, unknown>).requestId : undefined;
  return typeof value === 'string' && value.trim() ? value : 'forge-invalid-item-request';
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must not be empty.`);
  return value;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Za-z]:\\[^\s"']+/gu, '<local path>')
    .replace(/(?:^|\s)\/[^\s"']+/gu, ' <local path>')
    .slice(0, 500);
}
