import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { OpenAICompatibleItemIntakeProvider } from '@fvtt-json-generator/intake-ai/item-provider';
import type { IntakeProviderAuditEvent } from '@fvtt-json-generator/intake-ai/provider';
import type { HttpClient } from '../packages/intake-ai/src/http';

const SOURCE = 'A source-backed Item';

function itemProvider(httpClient: HttpClient, audit: IntakeProviderAuditEvent[]) {
  return new OpenAICompatibleItemIntakeProvider({
    authMode: 'api-key', apiKey: 'fixture-key', baseUrl: 'https://provider.example/v1', model: 'fixture-model', reviewModel: 'fixture-model',
    timeoutMs: 5, repairTimeoutMs: 5, httpClient, audit: event => audit.push(event),
  });
}

describe('Item provider configured deadline classification', () => {
  test.each(['headers', 'body'] as const)('reports its own deadline while awaiting %s as timeout without a caller cancellation', async phase => {
    const audit: IntakeProviderAuditEvent[] = [];
    const abortReasons: unknown[] = [];
    let calls = 0;
    const provider = itemProvider(async (_url, init) => {
      calls += 1;
      const signal = init.signal;
      if (!signal) throw new Error('Expected the provider deadline signal.');
      const interrupted = new Promise<never>((_resolve, reject) => {
        const abort = () => {
          abortReasons.push(signal.reason);
          reject(new DOMException('The HTTP operation was aborted.', 'AbortError'));
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
      return phase === 'headers' ? interrupted : { ok: true, status: 200, json: () => interrupted };
    }, audit);

    await expect(provider.discover({ source: SOURCE, sourceSha256: hashSource(SOURCE) }))
      .rejects.toMatchObject({ code: 'timeout', retryable: true });
    expect(calls).toBe(1);
    expect(audit.map(event => event.errorCode)).toEqual(['timeout']);
    expect(abortReasons).toEqual([expect.objectContaining({ name: 'TimeoutError' })]);
  });

  test('retains the successful Item discovery contract before its configured deadline', async () => {
    const audit: IntakeProviderAuditEvent[] = [];
    const provider = itemProvider(async () => ({ ok: true, status: 200, json: async () => ({
      choices: [{ message: { content: JSON.stringify({ schemaVersion: 1, candidates: [] }) } }],
    }) }), audit);
    await expect(provider.discover({ source: SOURCE, sourceSha256: hashSource(SOURCE) }))
      .resolves.toEqual({ schemaVersion: 1, candidates: [] });
    expect(audit.map(event => event.errorCode)).toEqual([undefined]);
  });
});
