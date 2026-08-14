export const COMPANION_CONTROL_PROTOCOL_VERSION = 1 as const;
export const COMPANION_CONTROL_PORT = 43173 as const;
export const COMPANION_CONTROL_URL = `http://127.0.0.1:${COMPANION_CONTROL_PORT}` as const;
export const COMPANION_WEB_ORIGIN = 'http://127.0.0.1:5173' as const;
export const COMPANION_CONTROL_HEADER = 'x-fvtt-companion-protocol' as const;
export const COMPANION_SERVICE_NAME = 'fvtt-ai-companion' as const;

export type LocalCompanionState = 'idle' | 'connecting' | 'verifying' | 'connected' | 'blocked';

export interface LocalCompanionHealth {
  protocolVersion: typeof COMPANION_CONTROL_PROTOCOL_VERSION;
  service: typeof COMPANION_SERVICE_NAME;
  version: string;
  instanceId: string;
  status: LocalCompanionState;
  diagnostic?: string;
}

export interface LocalCompanionPairRequest {
  protocolVersion: typeof COMPANION_CONTROL_PROTOCOL_VERSION;
  instanceId: string;
  origin: typeof COMPANION_WEB_ORIGIN;
  pairingId: string;
  pairingToken: string;
}

export interface LocalCompanionInstanceRequest {
  protocolVersion: typeof COMPANION_CONTROL_PROTOCOL_VERSION;
  instanceId: string;
}

export interface LocalCompanionPairResponse {
  accepted: true;
  instanceId: string;
  status: 'connecting';
}

export interface LocalCompanionActionResponse {
  accepted: true;
  instanceId: string;
  status: LocalCompanionState;
}

export interface LocalCompanionErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export function isLocalCompanionHealth(value: unknown): value is LocalCompanionHealth {
  if (!isRecord(value)) return false;
  return value.protocolVersion === COMPANION_CONTROL_PROTOCOL_VERSION
    && value.service === COMPANION_SERVICE_NAME
    && typeof value.version === 'string'
    && typeof value.instanceId === 'string'
    && value.instanceId.length > 0
    && (value.status === 'idle'
      || value.status === 'connecting'
      || value.status === 'verifying'
      || value.status === 'connected'
      || value.status === 'blocked')
    && (value.diagnostic === undefined || typeof value.diagnostic === 'string');
}

export function isLocalCompanionPairResponse(value: unknown): value is LocalCompanionPairResponse {
  if (!isRecord(value)) return false;
  return value.accepted === true
    && typeof value.instanceId === 'string'
    && value.status === 'connecting';
}

export function isLocalCompanionActionResponse(value: unknown): value is LocalCompanionActionResponse {
  if (!isRecord(value)) return false;
  return value.accepted === true
    && typeof value.instanceId === 'string'
    && (value.status === 'idle'
      || value.status === 'connecting'
      || value.status === 'verifying'
      || value.status === 'connected'
      || value.status === 'blocked');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
