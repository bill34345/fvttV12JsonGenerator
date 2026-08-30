import {
  attachForgeSourceId,
  decodeForgeActorRequest,
  hashArtifact,
  hashSource,
  mapForgeInputIssueToErrorCode,
  projectForgeDiagnostics,
  projectForgeVerification,
  requireForgeAcceptedVerification,
  resolveForgeTarget,
  type ForgeActorRequest,
  type ForgeActorResponse,
  type ForgeDiagnostic,
  type ForgeActorVerificationSummary,
  type ForgeErrorCode,
  type ForgeSourceId,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';
import { ActorValidator } from '@fvtt-json-generator/generation/validator';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import type { GenerationDiagnostic } from '@fvtt-json-generator/generation/types';
import { ParserFactory } from '@fvtt-json-generator/parser/router';
import { generateActorArtifact } from '@fvtt-json-generator/workflows/generation-pipeline';
import { createDisabledIconResolutionSession } from '@fvtt-json-generator/workflows/icon-port';
import { buildBrowserActorVerificationSummary } from './actorVerification';
import { LEGACY_BROWSER_SPELLS } from './browser-legacy-spell-data';
import { LOCKED_DND5E_V14_SPELLS } from './browser-v14-spell-data';
import { normalizeForgeActorArtifact } from './artifact';

export {
  buildForgeItemRequest,
  convertFinalItemSource,
  prepareForgeFinalItemSource,
  type BuildForgeItemRequestOptions,
  type ForgeFinalItemSource,
} from './item';
export * from './providerConnections';

export const BROWSER_GENERATOR_VERSION = '0.1.0' as const;
export const BROWSER_MAX_CONCURRENT_ACTOR_JOBS = 1 as const;

const LEGACY_SPELL_REFERENCE_PATTERN = /^(?:Compendium\.dnd5e\.spells\.Item\.)?([0-9a-f]{16})$/u;
const LEGACY_SPELL_BY_UUID = new Map(LEGACY_BROWSER_SPELLS.map((spell) => [spell.uuid, spell]));
const LEGACY_SPELL_MAPPINGS = buildLegacySpellMappings();

export interface BuildForgeActorRequestOptions {
  content: string;
  displayName: string;
  requestId: string;
  fvttVersion: string;
  systemVersion: string;
  sourceId?: ForgeSourceId;
}

export interface ForgeFinalSource {
  content: string;
  sourceId: ForgeSourceId;
  sourceHash: Sha256;
  changed: boolean;
}

export function prepareForgeFinalSource(content: string, sourceId?: ForgeSourceId): ForgeFinalSource {
  return attachForgeSourceId(content, sourceId);
}

export function resolveFoundrySpellUuid(legacyUuid: string): string | undefined {
  return LEGACY_SPELL_MAPPINGS.byLegacyUuid.get(legacyUuid);
}

export function resolveLegacySpellUuid(foundryUuid: string): string | undefined {
  return LEGACY_SPELL_MAPPINGS.byFoundryUuid.get(foundryUuid);
}

export function buildForgeActorRequest(options: BuildForgeActorRequestOptions): ForgeActorRequest {
  if (typeof options.content !== 'string' || options.content.trim().length === 0) {
    throw new TypeError('Source content must not be empty or whitespace-only.');
  }
  const finalSource = prepareForgeFinalSource(options.content, options.sourceId);
  const target = resolveForgeTarget(options.fvttVersion);
  return {
    protocolVersion: 1,
    capabilityId: 'actor.standard.generate.v1',
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

export async function convertFinalActorSource(request: ForgeActorRequest): Promise<ForgeActorResponse> {
  const decoded = decodeForgeActorRequest(request);
  if (!decoded.ok) return errorResponse(requestIdOf(request), decoded.issues);
  const value = decoded.value;
  // The protocol has no v13 generator profile. Forward-compatible v13
  // runtimes intentionally use the v12 workflow target selected by routing.
  const targetVersion = value.resolvedTarget.generatorProfile === 'v14' ? '14' : '12';
  const parserFactory = new ParserFactory();
  const route = parserFactory.detectRoute(value.source.content);

  try {
    const parsed = parserFactory.parse(value.source.content);
    const generated = await generateActorArtifact({
      parsed,
      sourceText: value.source.content,
      route,
      fvttVersion: targetVersion,
      effectProfile: 'core',
      iconWorkflow: { createResolutionSession: (_targetVersion, options) => createDisabledIconResolutionSession(options) },
      iconOptions: { mode: 'off' },
    });
    const artifact = normalizeForgeActorArtifact(generated.actor, targetVersion);
    const formalVerification = verifyGeneratedDocument({
      canonical: generated.canonical,
      output: artifact,
      target: targetVersion,
      effectProfile: 'core',
    });
    const legacyWarnings = new ActorValidator().validate(parsed, artifact);
    const actorVerification = buildBrowserActorVerificationSummary(value.source.content, artifact);
    const diagnostics: GenerationDiagnostic[] = [
      ...formalVerification.diagnostics,
      ...legacyWarnings.map((message, index) => legacyWarning(message, index)),
      ...actorVerification.warnings.map((message, index) => actorWarning(message, index)),
      ...unresolvedLegacySpellWarnings(artifact),
    ];
    const hasErrorDiagnostic = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    const hasWarningDiagnostic = diagnostics.some((diagnostic) => diagnostic.severity === 'warning');
    let status: 'accepted' | 'needs_review' | 'failed' = formalVerification.status === 'failed' || hasErrorDiagnostic
      ? 'failed'
      : formalVerification.status === 'needs_review' || hasWarningDiagnostic ? 'needs_review' : 'accepted';
    if (formalVerification.status === 'failed' && !hasErrorDiagnostic) {
      diagnostics.push({
        code: 'FORGE_VERIFICATION_FAILED',
        severity: 'error',
        stage: 'semantic',
        path: 'actor',
        message: 'The formal Actor verification failed without an error diagnostic.',
      });
    } else if (formalVerification.status === 'needs_review' && !hasWarningDiagnostic && !hasErrorDiagnostic) {
      diagnostics.push({
        code: 'FORGE_VERIFICATION_REVIEW_REQUIRED',
        severity: 'warning',
        stage: 'semantic',
        path: 'actor',
        message: 'The formal Actor verification requires review before creation.',
      });
    }
    const verification = { ...formalVerification, status, diagnostics };
    const projection = projectForgeVerification({ verification, actorVerification });
    let acceptedVerification: ReturnType<typeof requireForgeAcceptedVerification> | undefined;
    if (status === 'accepted') {
      try {
        acceptedVerification = requireForgeAcceptedVerification(projection.verification);
      } catch {
        status = 'needs_review';
        diagnostics.push({
          code: 'FORGE_REVIEW_COVERAGE_REQUIRED',
          severity: 'warning',
          stage: 'semantic',
          path: 'actor',
          message: 'Generated mechanics include a review-only coverage entry.',
        });
      }
    }
    const finalVerification = status === verification.status ? projection.verification : projectForgeVerification({
      verification: { ...verification, status, diagnostics },
      actorVerification,
    }).verification;
    const safeDiagnostics = projectForgeDiagnostics(diagnostics);
    const finalActorVerification = status === verification.status
      ? projection.actorVerification
      : projectForgeVerification({ verification: { ...verification, status, diagnostics }, actorVerification }).actorVerification;
    const base = makeResultBase(value, formalVerification.target.stats.systemVersion, finalVerification, finalActorVerification, safeDiagnostics);
    if (status === 'accepted') {
      if (!acceptedVerification) throw new TypeError('Accepted Forge verification was not proven by the closed projection.');
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
        result: {
          ...base,
          status: 'needs_review',
          artifact,
          verification: finalVerification,
        },
      };
    }
    return { protocolVersion: 1, requestId: value.requestId, result: { ...base, status: 'failed', verification: finalVerification } };
  } catch (error) {
    return failedWorkflowResponse(value, error);
  }
}

function makeResultBase(
  request: ForgeActorRequest,
  systemVersionObserved: string,
  verification: ReturnType<typeof projectForgeVerification>['verification'],
  actorVerification: ForgeActorVerificationSummary,
  diagnostics: ForgeDiagnostic[],
) {
  return {
    sourceIdentity: { sourceId: request.source.sourceId, sourceHash: request.source.utf8Sha256 },
    target: {
      fvttRuntimeVersion: request.foundryRuntime.fvttVersion,
      generatorProfile: request.resolvedTarget.generatorProfile,
      generatorVersion: BROWSER_GENERATOR_VERSION,
      systemId: 'dnd5e' as const,
      systemVersionObserved,
      effectProfile: 'core' as const,
      iconMode: 'off' as const,
    },
    diagnostics,
    verification,
    actorVerification,
  };
}

function failedWorkflowResponse(
  request: ForgeActorRequest,
  error: unknown,
): ForgeActorResponse {
  const diagnostic: GenerationDiagnostic = {
    code: 'FORGE_WORKFLOW_FAILED',
    severity: 'error',
    stage: 'parse',
    path: 'actor',
    message: safeErrorMessage(error),
  };
  const actorVerification = {
    actor: { name: request.source.displayName, type: 'npc', senses: {} },
    items: [],
    warnings: [],
  };
  const verification = { status: 'failed' as const, mechanicsCoverage: [] };
  const projected = projectForgeVerification({ verification, actorVerification });
  const base = makeResultBase(request, request.foundryRuntime.systemVersion, projected.verification, projected.actorVerification, projectForgeDiagnostics([diagnostic]));
  return { protocolVersion: 1, requestId: request.requestId, result: { ...base, status: 'failed' } };
}

function errorResponse(requestId: string, issues: Array<{ code: string; message: string }>): ForgeActorResponse {
  const first = issues[0] ?? { code: 'INVALID_REQUEST', message: 'Forge Actor request was rejected.' };
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
  return typeof value === 'string' && value.trim() ? value : 'forge-invalid-request';
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must not be empty.`);
  return value;
}

function legacyWarning(message: string, index: number): GenerationDiagnostic {
  return { code: 'GEN_LEGACY_VALIDATOR_WARNING', severity: 'warning', stage: 'semantic', path: `legacy-validator/${index}`, message };
}

function actorWarning(message: string, index: number): GenerationDiagnostic {
  return { code: 'FORGE_ACTOR_VERIFICATION_WARNING', severity: 'warning', stage: 'semantic', path: `actor-verification/${index}`, message };
}

function buildLegacySpellMappings(): {
  byLegacyUuid: ReadonlyMap<string, string>;
  byFoundryUuid: ReadonlyMap<string, string>;
} {
  const byLegacyUuid = new Map<string, string>();
  const reverseCandidates = new Map<string, string[]>();
  for (const legacy of LEGACY_BROWSER_SPELLS) {
    const legacyKey = canonicalSpellKey(legacy.name);
    if (!legacyKey) continue;
    const exact = uniqueV14Spells(LOCKED_DND5E_V14_SPELLS.filter((spell) => (
      canonicalSpellKey(spell.name) === legacyKey || canonicalSpellKey(spell.identifier) === legacyKey
    )));
    const candidates = exact.length > 0 ? exact : uniqueV14Spells(LOCKED_DND5E_V14_SPELLS.filter((spell) => (
      canonicalSpellKey(spell.name).startsWith(legacyKey) || canonicalSpellKey(spell.identifier).startsWith(legacyKey)
    )));
    if (candidates.length !== 1) continue;
    const foundryUuid = candidates[0]!.uuid;
    byLegacyUuid.set(legacy.uuid, foundryUuid);
    reverseCandidates.set(foundryUuid, [...(reverseCandidates.get(foundryUuid) ?? []), legacy.uuid]);
  }
  const byFoundryUuid = new Map<string, string>();
  for (const [foundryUuid, legacyUuids] of reverseCandidates) {
    if (legacyUuids.length === 1) byFoundryUuid.set(foundryUuid, legacyUuids[0]!);
  }
  return { byLegacyUuid, byFoundryUuid };
}

function uniqueV14Spells(spells: readonly (typeof LOCKED_DND5E_V14_SPELLS)[number][]) {
  return [...new Map(spells.map((spell) => [spell.uuid, spell])).values()];
}

function canonicalSpellKey(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '');
}

function unresolvedLegacySpellWarnings(actor: unknown): GenerationDiagnostic[] {
  const warnings: GenerationDiagnostic[] = [];
  const items = asRecord(actor).items;
  if (!Array.isArray(items)) return warnings;
  for (const [itemIndex, itemValue] of items.entries()) {
    const activities = asRecord(asRecord(itemValue).system).activities;
    for (const [activityId, activityValue] of Object.entries(asRecord(activities))) {
      const activity = asRecord(activityValue);
      if (activity.type !== 'cast') continue;
      const spellUuid = asRecord(activity.spell).uuid;
      if (typeof spellUuid !== 'string') continue;
      const legacyUuid = spellUuid.match(LEGACY_SPELL_REFERENCE_PATTERN)?.[1];
      const legacy = legacyUuid ? LEGACY_SPELL_BY_UUID.get(legacyUuid) : undefined;
      if (!legacy || resolveFoundrySpellUuid(legacy.uuid)) continue;
      warnings.push({
        code: 'FORGE_LEGACY_SPELL_TARGET_UNRESOLVED',
        severity: 'warning',
        stage: 'semantic',
        path: `actor/items/${itemIndex}/system/activities/${activityId}/spell/uuid`,
        message: `Legacy spell "${legacy.name}" has no unique dnd5e 5.3.3 core Item mapping.`,
      });
    }
  }
  return warnings;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/[A-Za-z]:\\[^\s"']+/gu, '<local path>')
    .replace(/(?:^|\s)\/[^\s"']+/gu, ' <local path>')
    .slice(0, 500);
}
