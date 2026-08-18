export const COMPANION_CONTROL_PROTOCOL_VERSION = 2 as const;
export const COMPANION_CONTROL_PORT = 43173 as const;
export const COMPANION_CONTROL_URL = `http://127.0.0.1:${COMPANION_CONTROL_PORT}` as const;
export const COMPANION_LOCAL_WEB_ORIGIN = 'http://127.0.0.1:5173' as const;
export const COMPANION_DEFAULT_MODEL = 'default' as const;
export const COMPANION_CONTROL_HEADER = 'x-fvtt-companion-protocol' as const;
export const COMPANION_SERVICE_NAME = 'fvtt-ai-companion' as const;

export type LocalCompanionState = 'idle' | 'connecting' | 'verifying' | 'connected' | 'blocked';
export type RemoteApprovalStatus = 'pending' | 'approved' | 'rejected';
/** A popup may report only a completed local decision to the remote page. */
export type LocalCompanionApprovalStatus = Exclude<RemoteApprovalStatus, 'pending'>;

export interface LocalCompanionHealth {
  protocolVersion: typeof COMPANION_CONTROL_PROTOCOL_VERSION;
  service: typeof COMPANION_SERVICE_NAME;
  version: string;
  instanceId: string;
  status: LocalCompanionState;
  diagnostic?: string;
}

/**
 * The pairing token is deliberately body-only. It must never appear in a URL,
 * command line, log line, or browser history entry.
 */
export interface LocalCompanionPairRequest {
  protocolVersion: typeof COMPANION_CONTROL_PROTOCOL_VERSION;
  instanceId: string;
  origin: string;
  pairingId: string;
  pairingToken: string;
  approvalId?: string;
  pairAuthorization?: string;
}

export interface LocalCompanionInstanceRequest {
  protocolVersion: typeof COMPANION_CONTROL_PROTOCOL_VERSION;
  instanceId: string;
  controlCredential: string;
}

export interface LocalCompanionPairResponse {
  accepted: true;
  instanceId: string;
  status: 'connecting';
  /** One-use credential for exactly one local disconnect or shutdown action. */
  controlCredential: string;
}

export interface LocalCompanionActionResponse {
  accepted: true;
  instanceId: string;
  status: LocalCompanionState;
}

/**
 * Sent only from the local confirmation page to the exact HTTPS window that
 * opened it. Pair authorization intentionally never appears in a URL.
 */
export interface LocalCompanionApprovalMessage {
  type: 'fvtt-companion-approval';
  approvalId: string;
  status: LocalCompanionApprovalStatus;
  instanceId?: string;
  /** One-use authorization for the matching pairing, delivered in memory. */
  pairAuthorization?: string;
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
    && isLocalCompanionState(value.status)
    && (value.diagnostic === undefined || typeof value.diagnostic === 'string');
}

export function isLocalCompanionPairResponse(value: unknown): value is LocalCompanionPairResponse {
  if (!isRecord(value)) return false;
  return value.accepted === true
    && typeof value.instanceId === 'string'
    && value.status === 'connecting'
    && isOpaqueCredential(value.controlCredential);
}

export function isLocalCompanionActionResponse(value: unknown): value is LocalCompanionActionResponse {
  if (!isRecord(value)) return false;
  return value.accepted === true
    && typeof value.instanceId === 'string'
    && isLocalCompanionState(value.status);
}

export function isLocalCompanionApprovalMessage(value: unknown): value is LocalCompanionApprovalMessage {
  if (!isRecord(value)) return false;
  if (value.type !== 'fvtt-companion-approval'
    || !isSafeId(value.approvalId, 24)
    || !isLocalCompanionApprovalStatus(value.status)) {
    return false;
  }
  if (value.instanceId !== undefined && !isSafeId(value.instanceId, 24)) return false;
  if (value.status === 'approved') {
    return isSafeId(value.instanceId, 24) && isOpaqueCredential(value.pairAuthorization);
  }
  return value.instanceId === undefined && value.pairAuthorization === undefined;
}

export function isCompanionLocalDevOrigin(origin: string): boolean {
  return origin === COMPANION_LOCAL_WEB_ORIGIN;
}

export function isCompanionRemoteOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.pathname === '/'
      && parsed.search === ''
      && parsed.hash === ''
      && parsed.origin === origin;
  } catch {
    return false;
  }
}

export function isCompanionWebOrigin(origin: string): boolean {
  return isCompanionLocalDevOrigin(origin) || isCompanionRemoteOrigin(origin);
}

export function isLocalCompanionState(value: unknown): value is LocalCompanionState {
  return value === 'idle'
    || value === 'connecting'
    || value === 'verifying'
    || value === 'connected'
    || value === 'blocked';
}

export function isRemoteApprovalStatus(value: unknown): value is RemoteApprovalStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected';
}

export function isLocalCompanionApprovalStatus(value: unknown): value is LocalCompanionApprovalStatus {
  return value === 'approved' || value === 'rejected';
}

export function isSafeId(value: unknown, minimumLength = 24): value is string {
  return typeof value === 'string'
    && value.length >= minimumLength
    && value.length <= 512
    && /^[A-Za-z0-9_-]+$/u.test(value);
}

export function isOpaqueCredential(value: unknown): value is string {
  return isSafeId(value, 32);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
