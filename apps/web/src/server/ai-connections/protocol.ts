export const COMPANION_PROTOCOL_VERSION = 1 as const;

export interface CompanionGateModel {
  model: string;
  reasoningEffort: string;
}

export interface CompanionPairMessage {
  type: 'pair';
  protocolVersion: typeof COMPANION_PROTOCOL_VERSION;
  pairingId: string;
  token: string;
  origin: string;
}

export interface CompanionGateMessage {
  type: 'gate';
  protocolVersion: typeof COMPANION_PROTOCOL_VERSION;
  connectionId: string;
  models: CompanionGateModel[];
}

export interface CompanionGateResultMessage {
  type: 'gate-result';
  protocolVersion: typeof COMPANION_PROTOCOL_VERSION;
  connectionId: string;
  ok: boolean;
  diagnostic?: string;
}

export interface CompanionRequestMessage {
  type: 'request';
  protocolVersion: typeof COMPANION_PROTOCOL_VERSION;
  requestId: string;
  url: '/chat/completions';
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface CompanionResponseMessage {
  type: 'response';
  protocolVersion: typeof COMPANION_PROTOCOL_VERSION;
  requestId: string;
  status: number;
  body: unknown;
}

export type CompanionServerMessage = CompanionGateMessage | CompanionRequestMessage;
export type CompanionClientMessage = CompanionPairMessage | CompanionGateResultMessage | CompanionResponseMessage;

export function decodeCompanionMessage(raw: string | ArrayBuffer | Uint8Array): unknown {
  const text = typeof raw === 'string'
    ? raw
    : raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : new TextDecoder().decode(raw);
  return JSON.parse(text) as unknown;
}

export function isCompanionGateResult(value: unknown): value is CompanionGateResultMessage {
  if (!isRecord(value)) return false;
  return value.type === 'gate-result'
    && value.protocolVersion === COMPANION_PROTOCOL_VERSION
    && typeof value.connectionId === 'string'
    && typeof value.ok === 'boolean'
    && (value.diagnostic === undefined || typeof value.diagnostic === 'string');
}

export function isCompanionPair(value: unknown): value is CompanionPairMessage {
  if (!isRecord(value)) return false;
  return value.type === 'pair'
    && value.protocolVersion === COMPANION_PROTOCOL_VERSION
    && typeof value.pairingId === 'string'
    && /^[A-Za-z0-9_-]{24,512}$/u.test(value.pairingId)
    && typeof value.token === 'string'
    && /^[A-Za-z0-9_-]{32,512}$/u.test(value.token)
    && typeof value.origin === 'string';
}

export function isCompanionResponse(value: unknown): value is CompanionResponseMessage {
  if (!isRecord(value)) return false;
  return value.type === 'response'
    && value.protocolVersion === COMPANION_PROTOCOL_VERSION
    && typeof value.requestId === 'string'
    && typeof value.status === 'number'
    && Object.prototype.hasOwnProperty.call(value, 'body');
}

export function isCompanionGate(value: unknown): value is CompanionGateMessage {
  if (!isRecord(value) || value.type !== 'gate' || value.protocolVersion !== COMPANION_PROTOCOL_VERSION) return false;
  if (typeof value.connectionId !== 'string' || !Array.isArray(value.models) || value.models.length === 0) return false;
  return value.models.every((model) => (
    isRecord(model)
    && typeof model.model === 'string'
    && model.model.length > 0
    && typeof model.reasoningEffort === 'string'
    && model.reasoningEffort.length > 0
  ));
}

export function isCompanionRequest(value: unknown): value is CompanionRequestMessage {
  if (!isRecord(value)) return false;
  return value.type === 'request'
    && value.protocolVersion === COMPANION_PROTOCOL_VERSION
    && typeof value.requestId === 'string'
    && value.url === '/chat/completions'
    && value.method === 'POST'
    && isRecord(value.headers)
    && Object.values(value.headers).every((header) => typeof header === 'string')
    && typeof value.body === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
