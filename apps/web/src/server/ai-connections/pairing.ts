import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { AiProviderSettings } from './types';

export type CodexPairingStatus = 'pending' | 'connected' | 'disconnected' | 'expired' | 'consumed';

export interface CodexPairingPublic {
  id: string;
  origin: string;
  model: string;
  reviewModel: string;
  reasoningEffort: AiProviderSettings['reasoningEffort'];
  status: CodexPairingStatus;
  expiresAt: string;
  connectionId?: string;
}

export interface CodexPairingCreated extends CodexPairingPublic {
  token: string;
}

export interface CodexPairingRecord extends CodexPairingPublic {
  sessionId: string;
  tokenHash: string;
  createdAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class CodexPairingRegistry {
  private readonly records = new Map<string, CodexPairingRecord>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: { now?: () => number; ttlMs?: number } = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  create(sessionId: string, origin: string, settings: AiProviderSettings): CodexPairingCreated {
    this.cleanup();
    const id = randomBytes(18).toString('base64url');
    const token = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const record: CodexPairingRecord = {
      id,
      origin,
      model: settings.model,
      reviewModel: settings.reviewModel,
      reasoningEffort: settings.reasoningEffort,
      status: 'pending',
      expiresAt: new Date(createdAt + this.ttlMs).toISOString(),
      sessionId,
      tokenHash: hashToken(token),
      createdAt,
    };
    this.records.set(id, record);
    return { ...this.publicRecord(record), token };
  }

  get(sessionId: string, id: string): CodexPairingPublic | undefined {
    const record = this.records.get(id);
    if (!record || record.sessionId !== sessionId) return undefined;
    this.expire(record);
    return this.publicRecord(record);
  }

  consume(id: string, token: string, origin: string): CodexPairingRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    this.expire(record);
    if (record.status !== 'pending' || record.origin !== origin || !matchesToken(token, record.tokenHash)) return undefined;
    record.status = 'consumed';
    record.tokenHash = '';
    return record;
  }

  markConnected(id: string, connectionId: string): CodexPairingPublic | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    this.expire(record);
    if (record.status !== 'consumed') return this.publicRecord(record);
    record.status = 'connected';
    record.connectionId = connectionId;
    return this.publicRecord(record);
  }

  markDisconnected(id: string): CodexPairingPublic | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    this.expire(record);
    if (record.status === 'connected' || record.status === 'consumed') record.status = 'disconnected';
    return this.publicRecord(record);
  }

  cleanup(): number {
    let removed = 0;
    for (const [id, record] of this.records) {
      if (!this.expire(record)) continue;
      this.records.delete(id);
      removed += 1;
    }
    return removed;
  }

  private expire(record: CodexPairingRecord): boolean {
    if (record.status === 'expired') return true;
    if (this.now() <= Date.parse(record.expiresAt)) return false;
    record.status = 'expired';
    record.tokenHash = '';
    return true;
  }

  private publicRecord(record: CodexPairingRecord): CodexPairingPublic {
    return {
      id: record.id,
      origin: record.origin,
      model: record.model,
      reviewModel: record.reviewModel,
      reasoningEffort: record.reasoningEffort,
      status: record.status,
      expiresAt: record.expiresAt,
      ...(record.connectionId ? { connectionId: record.connectionId } : {}),
    };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function matchesToken(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const provided = Buffer.from(hashToken(token), 'utf8');
  const expected = Buffer.from(expectedHash, 'utf8');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
