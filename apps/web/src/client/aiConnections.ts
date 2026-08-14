import type { LocalCompanionHealth } from '../companion/controlProtocol';

export type AiConnectionKind = 'site' | 'user-api-key' | 'local-codex';
export type AiConnectionStatus = 'ready' | 'pairing' | 'offline' | 'blocked' | 'expired';
export type AiReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiConnection {
  id: string;
  kind: AiConnectionKind;
  model: string;
  reviewModel: string;
  reasoningEffort: AiReasoningEffort;
  status: AiConnectionStatus;
  expiresAt: string;
  providerLabel: string;
  keyHint?: string;
  diagnostic?: string;
}

export interface AiConnectionsOverview {
  connections: AiConnection[];
  csrfToken: string;
  siteAvailable: boolean;
  companion: {
    available: boolean;
    platform: 'windows';
    defaultModel: string;
    defaultReasoningEffort: 'xhigh';
    diagnostic?: string;
    artifact: {
      available: boolean;
      fileName: string;
      downloadUrl: string | null;
      sha256: string | null;
    };
    controlUrl: string;
    controlProtocolVersion: 1;
  };
  sessionExpiresAt: string;
}

export interface CodexPairing {
  id: string;
  token?: string;
  origin: string;
  model: string;
  reviewModel: string;
  reasoningEffort: AiReasoningEffort;
  status: 'pending' | 'verifying' | 'connected' | 'blocked' | 'disconnected' | 'expired';
  expiresAt: string;
  connectionId?: string;
  diagnostic?: string;
}

export type { LocalCompanionHealth };

interface ApiSuccess<T> { ok: true; data: T }
interface ApiFailure { ok: false; error: { code: string; message: string } }
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export class AiConnectionsClient {
  private csrfToken: string | undefined;

  async list(): Promise<AiConnectionsOverview> {
    const overview = await this.request<AiConnectionsOverview>('/api/ai-connections');
    this.csrfToken = overview.csrfToken;
    return overview;
  }

  async selectSite(): Promise<AiConnection> {
    return this.stateChanging<AiConnection>('/api/ai-connections/site', {});
  }

  async connectByok(input: {
    apiKey: string;
    baseUrl?: string;
    model: string;
    reviewModel?: string;
    reasoningEffort: AiReasoningEffort;
  }): Promise<AiConnection> {
    return this.stateChanging<AiConnection>('/api/ai-connections/byok', {
      ...input,
      baseUrl: input.baseUrl ?? 'https://api.openai.com/v1',
      reviewModel: input.reviewModel ?? input.model,
    });
  }

  async test(id: string): Promise<{ ok: true; model: string; testedAt: string }> {
    return this.stateChanging(`/api/ai-connections/${encodeURIComponent(id)}/test`, {});
  }

  async disconnect(id: string): Promise<{ disconnected: true }> {
    return this.stateChanging(`/api/ai-connections/${encodeURIComponent(id)}`, {}, 'DELETE');
  }

  async createCodexPairing(input: {
    model?: string;
    reviewModel?: string;
    reasoningEffort?: AiReasoningEffort;
  } = {}): Promise<CodexPairing & { token: string }> {
    return this.stateChanging('/api/ai-connections/codex/pairings', {
      model: input.model,
      reviewModel: input.reviewModel,
      reasoningEffort: input.reasoningEffort ?? 'xhigh',
    });
  }

  async getCodexPairing(id: string): Promise<CodexPairing> {
    return this.request<CodexPairing>(`/api/ai-connections/codex/pairings/${encodeURIComponent(id)}`);
  }

  async cancelCodexPairing(id: string): Promise<{ cancelled: true }> {
    return this.stateChanging(`/api/ai-connections/codex/pairings/${encodeURIComponent(id)}`, {}, 'DELETE');
  }

  async createAiIntakeJob(input: {
    type: 'ai-monster-intake' | 'ai-item-intake';
    aiConnectionId: string;
    fileName: string;
    content: string;
    options?: Record<string, unknown>;
  }): Promise<unknown> {
    return this.stateChanging('/api/jobs', input);
  }

  private async stateChanging<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
    if (!this.csrfToken) await this.list();
    return this.request<T>(path, body, method);
  }

  private async request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const response = await fetch(path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.csrfToken ? { 'x-fvtt-csrf': this.csrfToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json() as ApiResponse<T>;
    if (!payload.ok) throw new Error(`${payload.error.code}: ${payload.error.message}`);
    return payload.data;
  }
}

export const aiConnectionsClient = new AiConnectionsClient();

export async function createAiIntakeJob(input: {
  type: 'ai-monster-intake' | 'ai-item-intake';
  aiConnectionId: string;
  fileName: string;
  content: string;
  options?: Record<string, unknown>;
}): Promise<unknown> {
  return aiConnectionsClient.createAiIntakeJob(input);
}
