import type {
  ConversionStatus,
  DiagnosticSeverity,
  DiagnosticStage,
  EvidenceRef,
  FvttTargetVersion,
  GenerationDiagnostic,
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

export type Sha256 = string & { readonly __forgeSha256: unique symbol };
export type ForgeSourceId = string & { readonly __forgeSourceId: unique symbol };
export type ForgeSourceRef = string & { readonly __forgeSourceRef: unique symbol };

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
  diagnostics: GenerationDiagnostic[];
  verification: JsonObject;
  actorVerification: JsonObject;
}

export type ForgeActorResult =
  | (ForgeActorResultBase & {
      status: 'accepted';
      artifact: JsonObject;
      artifactHash: Sha256;
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

export interface ForgeGatewayError {
  code: ForgeErrorCode;
  message: string;
  retryable: boolean;
  details?: JsonObject;
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

export type ForgeDiagnostic = GenerationDiagnostic;
export type { ConversionStatus, DiagnosticSeverity, DiagnosticStage, EvidenceRef };
