import { randomBytes } from 'node:crypto';

import type { AiConnection, AiProviderSettings, ByokConnectionInput, ResolvedAiConnection } from './types';
import { AiConnectionError } from './types';

export interface AiConnectionRegistryOptions {
  now?: () => number;
  idleTtlMs?: number;
  absoluteTtlMs?: number;
}

const DEFAULT_IDLE_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000;

export class AiConnectionRegistry {
  private readonly records = new Map<string, ResolvedAiConnection>();
  private readonly now: () => number;
  private readonly idleTtlMs: number;
  private readonly absoluteTtlMs: number;

  constructor(options: AiConnectionRegistryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.absoluteTtlMs = options.absoluteTtlMs ?? DEFAULT_ABSOLUTE_TTL_MS;
  }

  createSite(sessionId: string, settings: AiProviderSettings): AiConnection {
    return this.add({
      ...settings,
      id: opaqueId(),
      sessionId,
      kind: 'site',
      status: 'ready',
      createdAt: this.now(),
      absoluteExpiresAt: this.now() + this.absoluteTtlMs,
      lastUsedAt: this.now(),
      providerLabel: '站点提供',
    });
  }

  createByok(sessionId: string, input: ByokConnectionInput): AiConnection {
    if (!input.apiKey.trim()) {
      throw new AiConnectionError('AI_CONNECTION_INVALID', 'API Key is required.');
    }
    return this.add({
      id: opaqueId(),
      sessionId,
      kind: 'user-api-key',
      model: input.model,
      reviewModel: input.reviewModel,
      reasoningEffort: input.reasoningEffort,
      status: 'ready',
      createdAt: this.now(),
      absoluteExpiresAt: this.now() + this.absoluteTtlMs,
      lastUsedAt: this.now(),
      providerLabel: new URL(input.baseUrl).hostname,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
    });
  }

  createLocalCodex(
    sessionId: string,
    settings: AiProviderSettings,
    input: { status: 'pairing' | 'ready' | 'blocked'; companionId?: string; diagnostic?: string },
  ): AiConnection {
    const id = opaqueId();
    return this.add({
      ...settings,
      id,
      sessionId,
      kind: 'local-codex',
      status: input.status,
      createdAt: this.now(),
      absoluteExpiresAt: this.now() + this.absoluteTtlMs,
      lastUsedAt: this.now(),
      providerLabel: '本机 Codex',
      companionId: input.companionId ?? id,
      diagnostic: input.diagnostic,
    });
  }

  list(sessionId: string): AiConnection[] {
    this.cleanup();
    return [...this.records.values()]
      .filter((record) => record.sessionId === sessionId)
      .map((record) => this.publicRecord(record));
  }

  get(sessionId: string, id: string): AiConnection {
    return this.publicRecord(this.resolve(sessionId, id, false));
  }

  resolveForProvider(sessionId: string, id: string): ResolvedAiConnection {
    return this.resolve(sessionId, id, true);
  }

  resolveForCompanion(sessionId: string, id: string): ResolvedAiConnection {
    return this.resolve(sessionId, id, false);
  }

  updateStatus(sessionId: string, id: string, status: ResolvedAiConnection['status'], diagnostic?: string): AiConnection {
    const record = this.resolve(sessionId, id, false);
    record.status = status;
    record.diagnostic = diagnostic;
    return this.publicRecord(record);
  }

  delete(sessionId: string, id: string): boolean {
    const record = this.records.get(id);
    if (!record || record.sessionId !== sessionId) return false;
    record.apiKey = undefined;
    return this.records.delete(id);
  }

  deleteSession(sessionId: string): number {
    let removed = 0;
    for (const record of this.records.values()) {
      if (record.sessionId !== sessionId) continue;
      record.apiKey = undefined;
      this.records.delete(record.id);
      removed += 1;
    }
    return removed;
  }

  cleanup(): number {
    let removed = 0;
    for (const record of this.records.values()) {
      if (!this.expired(record)) continue;
      record.apiKey = undefined;
      this.records.delete(record.id);
      removed += 1;
    }
    return removed;
  }

  private add(record: ResolvedAiConnection): AiConnection {
    this.records.set(record.id, record);
    return this.publicRecord(record);
  }

  private resolve(sessionId: string, id: string, requireReady: boolean): ResolvedAiConnection {
    const record = this.records.get(id);
    if (!record || record.sessionId !== sessionId) {
      throw new AiConnectionError('AI_CONNECTION_NOT_FOUND', 'AI connection was not found for this session.');
    }
    if (this.expired(record)) {
      record.apiKey = undefined;
      this.records.delete(id);
      throw new AiConnectionError('AI_CONNECTION_EXPIRED', 'AI connection expired; reconnect before resuming.');
    }
    if (requireReady && record.status !== 'ready') {
      throw new AiConnectionError('AI_CONNECTION_NOT_READY', 'AI connection is not ready.');
    }
    record.lastUsedAt = this.now();
    return record;
  }

  private expired(record: ResolvedAiConnection): boolean {
    const now = this.now();
    return now > record.absoluteExpiresAt || now - record.lastUsedAt > this.idleTtlMs;
  }

  private publicRecord(record: ResolvedAiConnection): AiConnection {
    const idleExpiresAt = record.lastUsedAt + this.idleTtlMs;
    return {
      id: record.id,
      kind: record.kind,
      model: record.model,
      reviewModel: record.reviewModel,
      reasoningEffort: record.reasoningEffort,
      status: record.status,
      expiresAt: new Date(Math.min(idleExpiresAt, record.absoluteExpiresAt)).toISOString(),
      providerLabel: record.providerLabel,
      ...(record.apiKey ? { keyHint: record.apiKey.length > 4 ? `...${record.apiKey.slice(-4)}` : '...[set]' } : {}),
      ...(record.diagnostic ? { diagnostic: record.diagnostic } : {}),
    };
  }
}

function opaqueId(): string {
  return randomBytes(24).toString('base64url');
}
