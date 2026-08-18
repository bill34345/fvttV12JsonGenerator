import type { HttpClient, HttpRequest, HttpResponse } from '@fvtt-json-generator/intake-ai/http';

import {
  COMPANION_PROTOCOL_VERSION,
  decodeCompanionMessage,
  isCompanionGateResult,
  isCompanionResponse,
  type CompanionGateModel,
  type CompanionGateResultMessage,
  type CompanionRequestMessage,
} from './protocol';

export interface CompanionSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface PendingRequest {
  resolve: (response: HttpResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface CompanionHubOptions {
  requestTimeoutMs?: number;
  now?: () => number;
}

/**
 * The server never receives an OAuth token. It sends only an OpenAI-compatible
 * request envelope to the paired desktop process, which owns the Codex CLI.
 */
export class CompanionHub {
  private readonly sockets = new Map<string, CompanionSocket>();
  private readonly awaitingGate = new Set<string>();
  private readonly gated = new Set<string>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly requestTimeoutMs: number;
  private readonly now: () => number;
  private sequence = 0;

  constructor(options: CompanionHubOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 310_000;
    this.now = options.now ?? Date.now;
  }

  open(connectionId: string, socket: CompanionSocket, models: CompanionGateModel[]): void {
    this.gated.delete(connectionId);
    this.awaitingGate.add(connectionId);
    this.sockets.set(connectionId, socket);
    socket.send(JSON.stringify({
      type: 'gate',
      protocolVersion: COMPANION_PROTOCOL_VERSION,
      connectionId,
      models,
    }));
  }

  close(connectionId: string): void {
    this.sockets.delete(connectionId);
    this.awaitingGate.delete(connectionId);
    this.gated.delete(connectionId);
    const prefix = `${connectionId}:`;
    for (const [key, pending] of this.pending) {
      if (!key.startsWith(prefix)) continue;
      clearTimeout(pending.timer);
      pending.reject(new Error('Companion disconnected.'));
      this.pending.delete(key);
    }
  }

  isOnline(connectionId: string): boolean {
    return this.sockets.has(connectionId);
  }

  message(connectionId: string, raw: string | ArrayBuffer | Uint8Array): CompanionGateResultMessage | undefined {
    const text = typeof raw === 'string'
      ? raw
      : raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : new TextDecoder().decode(raw);
    let value: unknown;
    try {
      value = decodeCompanionMessage(text);
    } catch {
      this.sockets.get(connectionId)?.close(1003, 'Invalid JSON message.');
      return undefined;
    }
    if (isCompanionGateResult(value)) {
      if (value.connectionId !== connectionId) {
        this.sockets.get(connectionId)?.close(1008, 'Companion connection mismatch.');
        return undefined;
      }
      if (!this.awaitingGate.has(connectionId) || this.gated.has(connectionId)) {
        this.sockets.get(connectionId)?.close(1008, 'Companion gate was already completed.');
        return undefined;
      }
      this.awaitingGate.delete(connectionId);
      if (value.ok) this.gated.add(connectionId);
      return value;
    }
    if (!isCompanionResponse(value)) {
      this.sockets.get(connectionId)?.close(1003, 'Unknown Companion protocol message.');
      return undefined;
    }
    if (!this.gated.has(connectionId)) {
      this.sockets.get(connectionId)?.close(1008, 'Companion security gate has not completed.');
      return undefined;
    }
    const pendingKey = `${connectionId}:${value.requestId}`;
    const pending = this.pending.get(pendingKey);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(pendingKey);
    pending.resolve({
      ok: value.status >= 200 && value.status < 300,
      status: value.status,
      json: async () => value.body,
    });
    return undefined;
  }

  request(connectionId: string): HttpClient {
    return async (_url: string, init: HttpRequest) => {
      const socket = this.sockets.get(connectionId);
      if (!socket) throw new Error('Companion is offline.');
      if (!this.gated.has(connectionId)) throw new Error('Companion security gate has not completed.');
      const requestId = `${this.sequence++}-${Math.random().toString(36).slice(2)}`;
      const message: CompanionRequestMessage = {
        type: 'request',
        protocolVersion: COMPANION_PROTOCOL_VERSION,
        requestId,
        url: '/chat/completions',
        method: init.method,
        headers: {
          'content-type': init.headers['Content-Type'] ?? init.headers['content-type'] ?? 'application/json',
        },
        body: init.body,
      };
      const pendingKey = `${connectionId}:${requestId}`;
      const response = await new Promise<HttpResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(pendingKey);
          reject(new Error('Companion request timed out.'));
        }, this.requestTimeoutMs);
        this.pending.set(pendingKey, { resolve, reject, timer });
        try {
          socket.send(JSON.stringify(message));
        } catch (error) {
          clearTimeout(timer);
          this.pending.delete(pendingKey);
          reject(error instanceof Error ? error : new Error('Companion request failed.'));
        }
        init.signal?.addEventListener('abort', () => {
          const active = this.pending.get(pendingKey);
          if (!active) return;
          clearTimeout(active.timer);
          this.pending.delete(pendingKey);
          active.reject(new Error('Companion request aborted.'));
        }, { once: true });
      });
      return response;
    };
  }

  abort(connectionId: string): void {
    this.sockets.get(connectionId)?.close(1000, 'Companion connection revoked.');
    this.close(connectionId);
  }
}
