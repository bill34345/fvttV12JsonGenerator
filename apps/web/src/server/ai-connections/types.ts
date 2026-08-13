import type { MonsterIntakeReasoningEffort } from '../../../../../packages/intake-ai/src/config';

export type AiConnectionKind = 'site' | 'user-api-key' | 'local-codex';
export type AiConnectionStatus = 'ready' | 'pairing' | 'offline' | 'blocked' | 'expired';

export interface AiConnection {
  id: string;
  kind: AiConnectionKind;
  model: string;
  reviewModel: string;
  reasoningEffort: MonsterIntakeReasoningEffort;
  status: AiConnectionStatus;
  expiresAt: string;
  providerLabel: string;
  keyHint?: string;
  diagnostic?: string;
}

export interface AiProviderSettings {
  model: string;
  reviewModel: string;
  reasoningEffort: MonsterIntakeReasoningEffort;
}

export interface ByokConnectionInput extends AiProviderSettings {
  apiKey: string;
  baseUrl: string;
}

export interface ResolvedAiConnection extends AiProviderSettings {
  id: string;
  sessionId: string;
  kind: AiConnectionKind;
  status: AiConnectionStatus;
  createdAt: number;
  absoluteExpiresAt: number;
  lastUsedAt: number;
  apiKey?: string;
  baseUrl?: string;
  providerLabel: string;
  diagnostic?: string;
  companionId?: string;
}

export class AiConnectionError extends Error {
  constructor(
    readonly code: 'AI_CONNECTION_NOT_FOUND' | 'AI_CONNECTION_EXPIRED' | 'AI_CONNECTION_NOT_READY' | 'AI_CONNECTION_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'AiConnectionError';
  }
}
