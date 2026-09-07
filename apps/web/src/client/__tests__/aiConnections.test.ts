import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  AiConnectionsClient,
  type AiConnection,
  type AiConnectionsOverview,
} from '../aiConnections';
import {
  globalsAreRestored,
  installFetch,
  jsonResponse,
  restoreTestGlobals,
} from './browserTestHarness';

beforeEach(() => {
  expect(globalsAreRestored()).toBe(true);
});

afterEach(() => {
  restoreTestGlobals();
});

const OVERVIEW: AiConnectionsOverview = {
  connections: [],
  csrfToken: 'csrf-from-list',
  siteAvailable: true,
  companion: {
    available: false,
    platform: 'windows',
    defaultModel: 'default',
    defaultReasoningEffort: 'xhigh',
    artifact: {
      available: false,
      fileName: 'companion.exe',
      downloadUrl: null,
      sha256: null,
    },
    controlUrl: 'http://127.0.0.1:43173',
    controlProtocolVersion: 2,
  },
  sessionExpiresAt: '2099-01-01T00:00:00.000Z',
};

const CONNECTION: AiConnection = {
  id: 'byok-1',
  kind: 'user-api-key',
  model: 'gpt-test',
  reviewModel: 'gpt-review',
  reasoningEffort: 'high',
  status: 'ready',
  expiresAt: '2099-01-01T00:00:00.000Z',
  providerLabel: 'Test provider',
};

interface FetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

function queueResponses(payloads: unknown[]): FetchCall[] {
  const calls: FetchCall[] = [];
  installFetch(async (input, init) => {
    calls.push({ input, init });
    const payload = payloads.shift();
    if (payload === undefined) throw new Error('unexpected fetch call');
    return jsonResponse(payload);
  });
  return calls;
}

function pathOf(call: FetchCall): string {
  return String(call.input);
}

function callAt(calls: FetchCall[], index: number): FetchCall {
  const call = calls[index];
  if (!call) throw new Error(`missing fetch call ${index}`);
  return call;
}

function bodyOf(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

describe('AiConnectionsClient', () => {
  it('lazily lists for CSRF, sends JSON bodies, and applies pairing defaults', async () => {
    const calls = queueResponses([
      { ok: true, data: OVERVIEW },
      { ok: true, data: CONNECTION },
      { ok: true, data: { ...CONNECTION, id: 'pairing-1', kind: 'local-codex', status: 'pairing' } },
    ]);
    const client = new AiConnectionsClient();

    await client.connectByok({
      apiKey: 'secret-test-key',
      model: 'gpt-test',
      reasoningEffort: 'high',
    });
    await client.createCodexPairing({ model: 'gpt-local', reviewModel: 'gpt-review' });

    expect(pathOf(callAt(calls, 0))).toBe('/api/ai-connections');
    expect(callAt(calls, 0).init).toMatchObject({ method: 'GET', credentials: 'same-origin' });
    expect(callAt(calls, 0).init?.body).toBeUndefined();
    expect(callAt(calls, 0).init?.headers).toEqual({});

    expect(pathOf(callAt(calls, 1))).toBe('/api/ai-connections/byok');
    expect(callAt(calls, 1).init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-fvtt-csrf': 'csrf-from-list',
      },
    });
    expect(bodyOf(callAt(calls, 1))).toEqual({
      apiKey: 'secret-test-key',
      model: 'gpt-test',
      reasoningEffort: 'high',
      baseUrl: 'https://api.openai.com/v1',
      reviewModel: 'gpt-test',
    });

    expect(pathOf(callAt(calls, 2))).toBe('/api/ai-connections/codex/pairings');
    expect(bodyOf(callAt(calls, 2))).toEqual({
      model: 'gpt-local',
      reviewModel: 'gpt-review',
      reasoningEffort: 'xhigh',
    });
  });

  it('encodes connection and pairing IDs in every URL and preserves the CSRF header', async () => {
    const id = 'connection /?#';
    const calls = queueResponses([
      { ok: true, data: OVERVIEW },
      { ok: true, data: { ok: true, model: 'gpt-test', testedAt: '2099-01-01T00:00:00.000Z' } },
      { ok: true, data: { disconnected: true } },
      { ok: true, data: { ...CONNECTION, id } },
    ]);
    const client = new AiConnectionsClient();

    await client.list();
    await client.test(id);
    await client.disconnect(id);
    await client.getCodexPairing(id);

    const encoded = encodeURIComponent(id);
    expect(pathOf(callAt(calls, 1))).toBe(`/api/ai-connections/${encoded}/test`);
    expect(pathOf(callAt(calls, 2))).toBe(`/api/ai-connections/${encoded}`);
    expect(pathOf(callAt(calls, 3))).toBe(`/api/ai-connections/codex/pairings/${encoded}`);
    for (const call of calls.slice(1)) {
      expect(call.init?.headers).toMatchObject({ 'x-fvtt-csrf': 'csrf-from-list' });
    }
    expect(callAt(calls, 2).init?.method).toBe('DELETE');
    expect(callAt(calls, 3).init?.method).toBe('GET');
    expect(callAt(calls, 3).init?.body).toBeUndefined();
  });

  it('surfaces structured API errors with their code and message', async () => {
    const calls = queueResponses([
      {
        ok: false,
        error: { code: 'AI_SESSION_EXPIRED', message: '登录状态已过期。' },
      },
    ]);
    const client = new AiConnectionsClient();

    await expect(client.list()).rejects.toThrow('AI_SESSION_EXPIRED: 登录状态已过期。');
    expect(calls).toHaveLength(1);
  });
});
