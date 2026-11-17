import { projectionForRuntime, runtimeIdentityAfterProjection, type NativeDocumentProjection } from './nativeTarget';
import type { ItemSpellBinding } from '@fvtt-json-generator/models/action';
import { ITEM_SPELL_RULES_NOTICE, itemSpellRulesNotice, matchesBoundItemSpell, readPreferredItemSpellBindings, readVerifiedItemSpell } from './itemSpellBindings';
import { buildItemSpellVariant } from './itemSpellVariant';
import {
  attachForgeItemSourceId,
  decodeForgeItemRequest,
  hashArtifact,
  hashSource,
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
  type ForgeItemSpellVariant,
  type ForgeItemSourceId,
  type ForgeItemVerificationSummary,
  type ForgeVerificationSummary,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import type { GenerationDiagnostic } from '@fvtt-json-generator/generation/types';
import { parseForgeItemSource } from '@fvtt-json-generator/parser/forge-item-source';
import { parseItemStages } from '@fvtt-json-generator/parser/item-parser';
import { createBundledIconResolutionSession } from '@fvtt-json-generator/assets-icons/icon-browser';
import { generateItemArtifacts } from '@fvtt-json-generator/workflows/item-generation';
import { normalizeForgeItemArtifact,prepareForgeItemForNativeProjection } from './artifact';
import { buildBrowserItemVerificationSummary } from './itemVerification';

export interface BuildForgeItemRequestOptions {
  content: string;
  displayName: string;
  requestId: string;
  fvttVersion: string;
  systemVersion: string;
  sourceId?: ForgeItemSourceId;
  stageIndex?: number;
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

export function forgeItemStageOptions(source: string): string[] {
  const stages = parseItemStages(source);
  return stages.length > 1 ? stages.map(stage => [stage.name, stage.englishName].filter(Boolean).join(' ')) : [];
}

export function buildForgeItemRequest(options: BuildForgeItemRequestOptions): ForgeItemRequest {
  if (typeof options.content !== 'string' || options.content.trim().length === 0) {
    throw new TypeError('Item source content must not be empty or whitespace-only.');
  }
  const initialSource = prepareForgeFinalItemSource(options.content, options.sourceId);
  const finalSource = options.stageIndex === undefined ? initialSource : selectForgeItemStage(initialSource, options.stageIndex);
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
      iconMode: target.generatorProfile === 'v14' ? 'safe' : 'off',
    },
  };
}

function selectForgeItemStage(source: ForgeFinalItemSource, stageIndex: number): ForgeFinalItemSource {
  const frontmatter = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/mu.exec(source.content);
  if (!frontmatter || !Number.isInteger(stageIndex) || stageIndex < 0) throw new TypeError('物品阶段选择无效。');
  const header = frontmatter[0];
  const family = /^forge-item-family-id: (item:v1:[a-f0-9-]{36})\r?$/mu.exec(header)?.[1] ?? source.sourceId;
  const hash = hashSource(JSON.stringify({ family, stageIndex }));
  const sourceId = `item:v1:${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}` as ForgeItemSourceId;
  const content = header
    .replace(/^forge-item-(?:family-id|stage):[^\r\n]*(?:\r\n|\n)/gmu, '')
    .replace(/^forge-source-id:[^\r\n]*(\r?\n)/mu, (_, eol: string) =>
      `forge-source-id: ${sourceId}${eol}forge-item-family-id: ${family}${eol}forge-item-stage: ${stageIndex + 1}${eol}`)
    + source.content.slice(header.length);
  return { content, sourceId, sourceHash: hashSource(content), changed: content !== source.content };
}

export async function convertFinalItemSource(request: ForgeItemRequest, options: {
  nativeProjection?: NativeDocumentProjection;
  expectedSpellBindings?: readonly ItemSpellBinding[];
  spellVariants?: readonly ForgeItemSpellVariant[];
} = {}): Promise<ForgeItemResponse> {
  const decoded = decodeForgeItemRequest(request);
  if (!decoded.ok) return itemErrorResponse(requestIdOf(request), decoded.issues);
  const value = decoded.value;
  const targetVersion = value.resolvedTarget.generatorProfile === 'v14' ? '14' : '12';

  try {
    const parsed = parseForgeItemSource(value.source.content);
    if (parsed.sourceId !== value.source.sourceId) {
      throw new TypeError('Parsed Forge Item source identity does not match the request.');
    }
    const nativeProjection = projectionForRuntime(value.foundryRuntime.fvttVersion, value.foundryRuntime.systemVersion, options.nativeProjection);
    const spells = parsed.item.structuredActions?.spells ?? [];
    const plannedBindings = new Map<string, ItemSpellBinding>();
    for (const plan of options.spellVariants ?? []) {
      const draft = nativeProjection && await buildItemSpellVariant(nativeProjection, plan);
      if (!draft || hashArtifact({ ...draft.plan }) !== hashArtifact({ ...plan })
        || !spells.some(action => action.itemSpell?.uuid === draft.binding.uuid)) {
        throw new TypeError('用于预览的专用法术资料已变化，请重新分析物品。');
      }
      plannedBindings.set(draft.binding.uuid, draft.binding);
    }
    const preferred = targetVersion === '14' ? await readPreferredItemSpellBindings(spells.flatMap(action =>
      action.spellIdentifier && !action.itemSpell?.uuid ? [action.englishName ?? action.spellName ?? ''] : []), nativeProjection) : [];
    const spellNotices: GenerationDiagnostic[] = [];
    for (const action of spells) {
      const uuid = action.itemSpell?.uuid;
      const matches = (binding: ItemSpellBinding) => matchesBoundItemSpell(binding, action.spellIdentifier ?? '', action.englishName ?? action.spellName ?? '');
      const binding = uuid
        ? targetVersion === '14' ? plannedBindings.get(uuid) ?? await readVerifiedItemSpell(uuid, nativeProjection) : undefined
        : preferred.find(matches);
      if (uuid && (!binding || !matches(binding))) {
        throw new TypeError('无法读回与物品施法配置一致的法术文档。');
      }
      if (!binding) continue;
      const expected = options.expectedSpellBindings?.find(spell => spell.uuid === uuid);
      if (expected && hashSource(JSON.stringify(expected)) !== hashSource(JSON.stringify(binding))) {
        throw new TypeError('用于预览的绑定法术资料已变化，请重新分析物品。');
      }
      (action.itemSpell ??= {}).binding = binding;
      const message = itemSpellRulesNotice(binding);
      if (message) spellNotices.push({
        code: ITEM_SPELL_RULES_NOTICE, severity: 'info', stage: 'semantic', path: 'item', message,
      });
    }
    const artifacts = await generateItemArtifacts(parsed.item, {
      stageIndex: parsed.stageIndex,
      fvttVersion: targetVersion,
      nativeProjection,
      nativeSourceNormalizer:prepareForgeItemForNativeProjection,
      effectProfile: 'core',
      iconWorkflow: { createResolutionSession: createBundledIconResolutionSession },
      iconOptions: { mode: value.resolvedTarget.iconMode },
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
      runtimeTarget: generated.verification.target.stats.systemVersion==='6.0.6' ? generated.verification.target : undefined,
      target: targetVersion,
      effectProfile: 'core',
    });
    const diagnostics = deduplicateDiagnostics([
      ...formalVerification.diagnostics,
      ...generated.diagnostics,
      ...spellNotices,
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
    const runtime = runtimeIdentityAfterProjection(formalVerification.target.stats.systemVersion, value.foundryRuntime, options.nativeProjection);
    const base = { ...makeItemResultBase(
      value,
      runtime.systemVersion,
      verification,
      itemVerification,
      itemDocument,
      projectForgeDiagnostics(diagnostics.map(diagnostic=>diagnostic.code.startsWith('NATIVE_')
        ?{...diagnostic,message:safeErrorMessage(diagnostic.message)}:diagnostic)),
      runtime.fvttVersion,
    ), ...(generated.iconReview ? { iconReview: generated.iconReview } : {}),
      ...(options.spellVariants?.length ? { spellVariants: [...options.spellVariants] } : {}) };
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
    message: `来源有 ${artifactCount} 个装备阶段。请选择要预览和创建的阶段。`,
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
  fvttRuntimeVersion = request.foundryRuntime.fvttVersion,
) {
  return {
    sourceIdentity: { sourceId: request.source.sourceId, sourceHash: request.source.utf8Sha256 },
    target: {
      fvttRuntimeVersion,
      generatorProfile: request.resolvedTarget.generatorProfile,
      generatorVersion: '0.1.0',
      systemId: 'dnd5e' as const,
      systemVersionObserved,
      effectProfile: 'core' as const,
      iconMode: request.resolvedTarget.iconMode,
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
    .replace(/[A-Za-z]:[\\/][^\s"']+/gu, '<local path>')
    .replace(/(?:^|\s)\/[^\s"']+/gu, ' <local path>')
    .replace(/\b(?:actorPath|dnd5eRepo|localCache|sourcePath)\b/gu,'source location')
    .replace(/[\\/]/gu,'／')
    .slice(0, 500);
}
