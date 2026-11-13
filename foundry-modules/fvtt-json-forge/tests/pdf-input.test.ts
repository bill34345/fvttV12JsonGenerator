import { afterEach, expect, test } from 'bun:test';
import { createForgePdfInputReceipt, createForgePdfReaderModel, parsePdfPageSelection } from '../src/pdfInput';
import { FORGE_PDF_ENGINE_VERSION, type BrowserPdfReading } from '@fvtt-json-generator/forge-browser-runtime/pdf-types';

const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });

test('PDF page selection uses real document bounds before expanding a range', () => {
  expect(parsePdfPageSelection('', 364)).toBeUndefined();
  expect(parsePdfPageSelection('258,72-73，258', 364)).toEqual([72, 73, 258]);
  expect(() => parsePdfPageSelection('258-365', 364)).toThrow();
  expect(() => parsePdfPageSelection('1-9007199254740992', 364)).toThrow();
  expect(() => parsePdfPageSelection('0', 364)).toThrow();
  expect(() => parsePdfPageSelection('73-72', 364)).toThrow();
});

test('PDF model reuses the configured Forge transport and captures the original reply before reader parsing', async () => {
  const calls: any[] = [], evidence: any[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ model: 'actual-configured-model', choices: [{ finish_reason: 'stop', message: { content: 'not valid reader JSON' } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const model = createForgePdfReaderModel({ baseUrl: 'https://example.test/v1', apiKey: 'test-key', model: 'configured-model',
    protocol: 'openai-chat', structuredOutput: 'json_object', responseEvidence: { record: entry => { evidence.push(entry); } } }, 'a'.repeat(64));
  const result = await model.complete({ instruction: 'Preserve source language.', input: '{"source":"Complete source"}', schema: { type: 'object' } });
  expect(result.content).toBe('not valid reader JSON');
  expect(result.model).toBe('configured-model');
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://example.test/v1/chat/completions');
  expect(calls[0].body.model).toBe('configured-model');
  expect(calls[0].body.messages).toEqual([{ role: 'system', content: 'Preserve source language.\n\nRequired JSON response schema:\n{"type":"object"}' }, { role: 'user', content: '{"source":"Complete source"}' }]);
  expect(evidence).toHaveLength(1);
  expect(evidence[0].content).toBe('not valid reader JSON');
  expect(JSON.stringify(evidence)).not.toContain('test-key');
});

test('a cancelled PDF model request does not send a new request', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw Error('Unexpected request'); }) as unknown as typeof fetch;
  const controller = new AbortController(); controller.abort();
  const model = createForgePdfReaderModel({ baseUrl: 'https://example.test/v1', apiKey: 'test-key', model: 'configured-model' }, 'b'.repeat(64), controller.signal);
  await expect(model.complete({ instruction: 'Read', input: '{}', schema: {} })).rejects.toThrow();
  expect(calls).toBe(0);
});

test('a failed PDF receipt exposes the answer text with the existing credential redaction', () => {
  const content = '{"monsters":[],"apiKey":"known-private-key","authorization":"Bearer accidental-token","endpoint":"https://provider.example"}';
  const reading: BrowserPdfReading = { schemaVersion: 1, status: 'failed', requestedMonster: 'Aboleth', sourcePageNumbers: [],
    source: { schemaVersion: 1, engine: 'pdfjs', engineVersion: FORGE_PDF_ENGINE_VERSION, sourceName: 'source.pdf', sourceSha256: 'c'.repeat(64), pageCount: 1, pages: [] },
    outputs: [], doubts: [], failures: ['Answer structure did not match'], calls: [], responses: [{ pass: 1, content }] };
  const receipt = createForgePdfInputReceipt(reading, ['known-private-key', 'https://provider.example']);
  expect(receipt.responses?.[0]?.content).toContain('"monsters":[]');
  expect(JSON.stringify(receipt)).not.toContain('known-private-key');
  expect(JSON.stringify(receipt)).not.toContain('accidental-token');
  expect(JSON.stringify(receipt)).not.toContain('https://provider.example');
  expect(reading.responses[0]!.content).toBe(content);
});
