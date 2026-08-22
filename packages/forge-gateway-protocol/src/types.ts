import type {
  ConversionStatus,
  DiagnosticSeverity,
  DiagnosticStage,
  EvidenceRef,
  ForgeSourceId,
  FvttTargetVersion,
} from '@fvtt-json-generator/contracts';

export const FORGE_PROTOCOL_VERSION = 1 as const;
export const FORGE_SERVICE_ID = 'foundry-forge-gateway' as const;

export const FORGE_CAPABILITY_IDS = [
  'actor.standard.generate.v1',
  'source.actor.create.v1',
] as const;
export type ForgeCapabilityId = typeof FORGE_CAPABILITY_IDS[number];

export const FORGE_GENERATOR_PROFILES = ['v12', 'v14'] as const;
export type ForgeGeneratorProfile = typeof FORGE_GENERATOR_PROFILES[number];

export const FORGE_EFFECT_PROFILE = 'core' as const;
export const FORGE_ICON_MODE = 'off' as const;

export type ForgeCompatibility = 'supported' | 'forward-fallback';

export interface ForgeTargetResolution {
  runtimeVersion: string;
  runtimeMajor: number;
  generatorProfile: ForgeGeneratorProfile;
  workflowTargetVersion: FvttTargetVersion;
  compatibility: ForgeCompatibility;
  compatibilityMessage?: string;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type ForgeVerificationStatus = 'accepted' | 'needs_review' | 'failed';

export const FORGE_DIAGNOSTIC_PATHS = [
  'actor',
  'actor.actions',
  'actor.behaviors',
  'actor.items',
  'actor.traits',
  'item',
  'item.mechanics',
  'artifact',
  'artifact.documents',
  'artifact.items',
  'artifact.metadata',
  'legacy-validator',
] as const;
export type ForgeDiagnosticPath = typeof FORGE_DIAGNOSTIC_PATHS[number];

export const FORGE_MECHANIC_KINDS = [
  'activation',
  'attack',
  'damage',
  'save',
  'uses',
  'range',
  'effect',
  'light',
  'spell',
  'stage',
  'resource',
  'resource-consumption',
  'resource-transition',
  'resource-derived',
  'behavior-relation',
  'behavior-lifecycle',
  'behavior-trigger',
  'behavior-stage',
  'behavior-capacity',
  'behavior-choice-pool',
  'behavior-area',
  'behavior-external-rule',
] as const;
export type ForgeMechanicKind = typeof FORGE_MECHANIC_KINDS[number];

export const FORGE_MECHANIC_COVERAGE_STATUSES = [
  'projected',
  'literal-only',
  'unsupported',
  'missing',
  'duplicate',
] as const;
export type ForgeMechanicCoverageStatus = typeof FORGE_MECHANIC_COVERAGE_STATUSES[number];

export const FORGE_EXPRESSION_COVERAGES = ['structured', 'literal', 'missing'] as const;
export type ForgeExpressionCoverage = typeof FORGE_EXPRESSION_COVERAGES[number];

export const FORGE_EXECUTION_MODES = ['automatic', 'core-operable', 'gm-assisted', 'external-rule'] as const;
export type ForgeExecutionMode = typeof FORGE_EXECUTION_MODES[number];

export const FORGE_SOURCE_FIELDS = [
  'actor.name',
  'actor.attributes',
  'actor.traits',
  'actor.actions',
  'actor.items',
  'actor.behaviors',
  'item.activation',
  'item.attack',
  'item.damage',
  'item.save',
  'item.effects',
  'source.other',
] as const;
export type ForgeSourceField = typeof FORGE_SOURCE_FIELDS[number];

export const FORGE_ACTIVITY_TYPES = [
  'attack',
  'check',
  'cast',
  'damage',
  'enchant',
  'forward',
  'heal',
  'move',
  'save',
  'summon',
  'utility',
] as const;
export type ForgeActivityType = typeof FORGE_ACTIVITY_TYPES[number];

export type ForgeSummaryScalar = string | number | boolean | null;

export interface ForgeMechanicCoverageSummary {
  mechanicId: string;
  kind: ForgeMechanicKind;
  sourceField: ForgeSourceField;
  status: ForgeMechanicCoverageStatus;
  outputPaths: string[];
  expressionCoverage?: ForgeExpressionCoverage;
  executionMode?: ForgeExecutionMode;
}

export interface ForgeVerificationSummary {
  status: ForgeVerificationStatus;
  mechanicsCoverage: ForgeMechanicCoverageSummary[];
}

export interface ForgeAcceptedMechanicCoverageSummary extends Omit<
  ForgeMechanicCoverageSummary,
  'status' | 'outputPaths' | 'expressionCoverage' | 'executionMode'
> {
  status: 'projected';
  outputPaths: [string, ...string[]];
  expressionCoverage?: 'structured';
  executionMode?: 'automatic' | 'core-operable';
}

export interface ForgeAcceptedVerificationSummary {
  status: 'accepted';
  mechanicsCoverage: ForgeAcceptedMechanicCoverageSummary[];
}

export interface ForgeHitPointSummary {
  value?: number;
  max?: number;
  temp?: number | null;
  tempmax?: number | null;
  formula?: string;
}

export interface ForgeArmorClassSummary {
  value?: number;
  flat?: number;
  bonus?: number;
  formula?: string;
  calc?: string;
}

export interface ForgeSensesSummary {
  ranges?: {
    darkvision?: number;
    blindsight?: number;
    tremorsense?: number;
    truesight?: number;
  };
  darkvision?: number;
  blindsight?: number;
  tremorsense?: number;
  truesight?: number;
  passive?: number;
  special?: string;
  units?: string;
}

export interface ForgeActivityRangeSummary {
  override?: boolean;
  value?: number | null;
  long?: number | null;
  reach?: number | null;
  units?: string;
  special?: string;
}

export interface ForgeDamagePartSummary {
  number?: number | null;
  denomination?: number | null;
  bonus?: string;
  types: string[];
  custom?: {
    enabled: boolean;
    formula: string;
  };
  scaling?: {
    mode: string;
    number?: number | null;
    formula?: string;
  };
}

export interface ForgeActivityDamageSummary {
  parts: ForgeDamagePartSummary[];
  includeBase?: boolean;
  onSave?: string;
}

export interface ForgeActivitySummary {
  type: ForgeActivityType;
  range?: ForgeActivityRangeSummary;
  damage?: ForgeActivityDamageSummary;
}

export interface ForgeEffectChangeSummary {
  key: string;
  mode: ForgeSummaryScalar;
  value: string;
  priority: ForgeSummaryScalar;
}

export interface ForgeEffectSummary {
  name: string;
  changes: ForgeEffectChangeSummary[];
  sourceDerivedAcEffect: boolean;
  sourceText: string;
}

export interface ForgeItemVerificationSummary {
  name: string;
  type: string;
  activation: string;
  activityTypes: ForgeActivityType[];
  activities: ForgeActivitySummary[];
  effects: ForgeEffectSummary[];
}

export interface ForgeActorVerificationSummary {
  actor: {
    name: string;
    type: string;
    creatureType?: string;
    hp?: ForgeHitPointSummary;
    ac?: ForgeArmorClassSummary;
    cr?: number;
    senses: ForgeSensesSummary;
  };
  items: ForgeItemVerificationSummary[];
  warnings: string[];
}

export type Sha256 = string & { readonly __forgeSha256: unique symbol };
export type ForgeSourceRef = string & { readonly __forgeSourceRef: unique symbol };
export type { ForgeSourceId } from '@fvtt-json-generator/contracts';

export interface ForgeGatewayHealth {
  protocolVersion: typeof FORGE_PROTOCOL_VERSION;
  service: typeof FORGE_SERVICE_ID;
  serviceVersion: string;
  instanceId: string;
  deployment: 'local-companion' | 'remote-gateway';
  status: 'idle' | 'busy' | 'blocked';
}

export interface ForgeActorCapability {
  id: 'actor.standard.generate.v1';
  systemId: 'dnd5e';
  generatorProfiles: readonly ForgeGeneratorProfile[];
  versionRouting: ReadonlyArray<{
    fvttVersion: string;
    generatorProfile: ForgeGeneratorProfile;
  }>;
  maxInputUtf8Bytes: number;
  maxConcurrentJobs: number;
}

export interface ForgeSourceCreateCapability {
  id: 'source.actor.create.v1';
  sourceKind: 'actor';
  maxInputUtf8Bytes: number;
  maxConcurrentJobs: number;
}

export type ForgeCapability = ForgeActorCapability | ForgeSourceCreateCapability;

export interface ForgeActorRequest {
  protocolVersion: typeof FORGE_PROTOCOL_VERSION;
  capabilityId: 'actor.standard.generate.v1';
  requestId: string;
  source: {
    displayName: string;
    content: string;
    sourceId: ForgeSourceId;
    utf8Sha256: Sha256;
  };
  foundryRuntime: {
    fvttVersion: string;
    systemId: 'dnd5e';
    systemVersion: string;
  };
  resolvedTarget: {
    generatorProfile: ForgeGeneratorProfile;
    effectProfile: typeof FORGE_EFFECT_PROFILE;
    iconMode: typeof FORGE_ICON_MODE;
  };
}

export interface ForgeSourceCreateRequest {
  protocolVersion: typeof FORGE_PROTOCOL_VERSION;
  capabilityId: 'source.actor.create.v1';
  requestId: string;
  source: {
    displayName: string;
    content: string;
    utf8Sha256: Sha256;
  };
}

export interface ForgeSourceCreateResult {
  sourceRef: ForgeSourceRef;
  sourceId: ForgeSourceId;
  displayName: string;
  sourceHash: Sha256;
}

export interface ForgeActorResultBase {
  sourceIdentity: {
    sourceId: ForgeSourceId;
    sourceHash: Sha256;
  };
  target: {
    fvttRuntimeVersion: string;
    generatorProfile: ForgeGeneratorProfile;
    generatorVersion: string;
    systemId: 'dnd5e';
    systemVersionObserved: string;
    effectProfile: typeof FORGE_EFFECT_PROFILE;
    iconMode: typeof FORGE_ICON_MODE;
  };
  diagnostics: ForgeDiagnostic[];
  verification: ForgeVerificationSummary;
  actorVerification: ForgeActorVerificationSummary;
}

export type ForgeActorResult =
  | (Omit<ForgeActorResultBase, 'verification'> & {
      status: 'accepted';
      artifact: JsonObject;
      artifactHash: Sha256;
      verification: ForgeAcceptedVerificationSummary;
    })
  | (ForgeActorResultBase & {
      status: 'needs_review';
      artifact?: JsonObject;
    })
  | (ForgeActorResultBase & {
      status: 'failed';
    });

export const FORGE_ERROR_CODES = [
  'FORGE_PROTOCOL_UNSUPPORTED',
  'FORGE_GATEWAY_UNREACHABLE',
  'FORGE_AUTH_REQUIRED',
  'FORGE_AGENT_LOGIN_REQUIRED',
  'FORGE_AGENT_ADAPTER_FAILED',
  'FORGE_PERMISSION_DENIED',
  'FORGE_JOB_BUSY',
  'FORGE_INPUT_EMPTY',
  'FORGE_INPUT_TOO_LARGE',
  'FORGE_SOURCE_ID_INVALID',
  'FORGE_SOURCE_HASH_MISMATCH',
  'FORGE_ROUTE_UNSUPPORTED',
  'FORGE_TARGET_UNSUPPORTED',
  'FORGE_WORKFLOW_FAILED',
  'FORGE_NEEDS_REVIEW',
  'FORGE_ARTIFACT_INVALID',
  'FORGE_SOURCE_IDENTITY_AMBIGUOUS',
  'FORGE_PREVIEW_STALE',
  'FORGE_APPLY_PARTIAL',
  'FORGE_READBACK_MISMATCH',
  'FORGE_CANCELLED',
] as const;
export type ForgeErrorCode = typeof FORGE_ERROR_CODES[number];

export const FORGE_INPUT_ISSUE_TO_ERROR_CODE = Object.freeze({
  INPUT_EMPTY: 'FORGE_INPUT_EMPTY',
  INPUT_TOO_LARGE: 'FORGE_INPUT_TOO_LARGE',
} as const satisfies Record<'INPUT_EMPTY' | 'INPUT_TOO_LARGE', ForgeErrorCode>);

export interface ForgeGatewayError {
  code: ForgeErrorCode;
  message: string;
  retryable: boolean;
}

export type ForgeResponse<T> =
  | {
      protocolVersion: typeof FORGE_PROTOCOL_VERSION;
      requestId: string;
      result: T;
    }
  | {
      protocolVersion: typeof FORGE_PROTOCOL_VERSION;
      requestId: string;
      error: ForgeGatewayError;
    };

export type ForgeActorResponse = ForgeResponse<ForgeActorResult>;
export type ForgeSourceCreateResponse = ForgeResponse<ForgeSourceCreateResult>;

export interface ForgeDecodeIssue {
  path: string;
  code: string;
  message: string;
}

export type ForgeDecodeResult<T> =
  | { ok: true; value: T; warnings?: ForgeDecodeIssue[] }
  | { ok: false; issues: ForgeDecodeIssue[] };

export interface ForgeDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  stage: DiagnosticStage;
  path: ForgeDiagnosticPath;
  message: string;
  evidence?: EvidenceRef[];
}
export type { ConversionStatus, DiagnosticSeverity, DiagnosticStage, EvidenceRef };
