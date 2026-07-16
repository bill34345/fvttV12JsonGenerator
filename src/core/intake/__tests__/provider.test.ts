import { describe, expect, test } from 'bun:test';
import { loadMonsterIntakeConfig, MonsterIntakeConfigurationError } from '../config';
import {
  INTAKE_PROMPT_VERSIONS,
  MonsterIntakeProviderError,
  OpenAICompatibleMonsterIntakeProvider,
  parseStrictJson,
  type IntakeProviderAuditEvent,
} from '../provider';
import type { HttpClient, HttpRequest, HttpResponse } from '../../translation/types';

function response(status: number, content: string): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return { choices: [{ message: { content } }] };
    },
  };
}

describe('monster intake configuration', () => {
  test('reads only MONSTER_INTAKE variables and defaults reviewer/timeout', () => {
    const config = loadMonsterIntakeConfig({
      MONSTER_INTAKE_API_KEY: 'intake-key',
      MONSTER_INTAKE_BASE_URL: 'https://example.test/v1/',
      MONSTER_INTAKE_MODEL: 'extractor',
      OPENAI_API_KEY: 'must-not-be-used',
      TRANSLATION_API_KEY: 'must-not-be-used',
    });
    expect(config).toEqual({
      apiKey: 'intake-key',
      baseUrl: 'https://example.test/v1',
      model: 'extractor',
      reviewModel: 'extractor',
      timeoutMs: 60_000,
    });
  });

  test('fails closed when the dedicated configuration is absent', () => {
    expect(() => loadMonsterIntakeConfig({ OPENAI_API_KEY: 'not-authorized' })).toThrow(
      MonsterIntakeConfigurationError,
    );
  });
});

describe('OpenAI-compatible monster intake provider', () => {
  test('uses versioned independent stage prompts and strict JSON mode', async () => {
    const requests: Array<{ url: string; init: HttpRequest }> = [];
    const client: HttpClient = async (url, init) => {
      requests.push({ url, init });
      return response(200, '{"schemaVersion":1,"candidates":[]}');
    };
    const provider = makeProvider(client);
    await provider.discover({ source: 'text', sourceSha256: 'hash', chunkStart: 0, chunkEnd: 4 });
    const body = JSON.parse(requests[0]!.init.body) as Record<string, unknown>;
    expect(requests[0]!.url).toBe('https://example.test/v1/chat/completions');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(JSON.stringify(body)).toContain('untrusted data');
    expect(requests[0]!.init.headers.Authorization).toBe('Bearer secret');
  });

  test('extraction prompt requires numeric CR, leaf claims, and exact full coverage', async () => {
    const requests: Array<{ url: string; init: HttpRequest }> = [];
    const provider = makeProvider(async (url, init) => {
      requests.push({ url, init });
      return response(200, '{"schemaVersion":1,"creature":{},"claims":[],"coverage":[],"uncertainties":[]}');
    });

    await provider.extract({
      source: 'monster',
      sourceSha256: 'hash',
      candidate: { id: 'monster', label: 'Monster', start: 0, end: 7, quote: 'monster' },
    });

    const body = JSON.parse(requests[0]!.init.body) as { messages: Array<{ content: string }> };
    const prompt = body.messages[0]!.content;
    expect(INTAKE_PROMPT_VERSIONS.extract).toBe('monster-intake-extract-v2');
    expect(prompt).toContain('cr must be a JSON number');
    expect(prompt).toContain('Parent object claims do not support child values');
    expect(prompt).toContain('partition the full candidate range');
  });

  test('retries retryable 429 once and audits without secrets', async () => {
    let calls = 0;
    const audit: IntakeProviderAuditEvent[] = [];
    const provider = makeProvider(async () => {
      calls += 1;
      return calls === 1
        ? response(429, '{}')
        : response(200, '{"schemaVersion":1,"candidates":[]}');
    }, audit);
    await provider.discover({ source: 'text', sourceSha256: 'hash', chunkStart: 0, chunkEnd: 4 });
    expect(calls).toBe(2);
    expect(audit.map((event) => event.errorCode)).toEqual(['rate_limited', undefined]);
    expect(JSON.stringify(audit)).not.toContain('secret');
  });

  test('does not retry invalid JSON', async () => {
    let calls = 0;
    const provider = makeProvider(async () => {
      calls += 1;
      return response(200, 'not json');
    });
    await expect(provider.discover({ source: 'x', sourceSha256: 'h', chunkStart: 0, chunkEnd: 1 }))
      .rejects.toMatchObject({ code: 'invalid_response', retryable: false });
    expect(calls).toBe(1);
  });

  test('bounds timeout retries to two attempts', async () => {
    let calls = 0;
    const provider = makeProvider(async (_url, init) => {
      calls += 1;
      await new Promise<void>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
      return response(200, '{}');
    }, [], 5);
    await expect(provider.discover({ source: 'x', sourceSha256: 'h', chunkStart: 0, chunkEnd: 1 }))
      .rejects.toMatchObject({ code: 'timeout', retryable: true });
    expect(calls).toBe(2);
  });
});

describe('strict provider JSON parsing', () => {
  test('allows a removable leading reasoning wrapper and JSON fence', () => {
    expect(parseStrictJson('<think>private</think>```json\n{"schemaVersion":1}\n```'))
      .toEqual({ schemaVersion: 1 });
  });

  test('rejects trailing text and unresolved reasoning', () => {
    expect(() => parseStrictJson('{"a":1} trailing')).toThrow(MonsterIntakeProviderError);
    expect(() => parseStrictJson('{"a":"<think>"}')).toThrow(MonsterIntakeProviderError);
  });
});

function makeProvider(
  httpClient: HttpClient,
  audit: IntakeProviderAuditEvent[] = [],
  timeoutMs = 60_000,
): OpenAICompatibleMonsterIntakeProvider {
  return new OpenAICompatibleMonsterIntakeProvider({
    apiKey: 'secret',
    baseUrl: 'https://example.test/v1',
    model: 'extractor',
    reviewModel: 'reviewer',
    timeoutMs,
    httpClient,
    audit: (event) => audit.push(event),
  });
}
