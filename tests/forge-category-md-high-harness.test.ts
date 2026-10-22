import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { estimatedCost, safeReply, MeasuredHttp, type RequestContext } from './diagnostics/forge-category-md-real-ab-high';

const body = JSON.stringify({ model: 'deepseek-flash', reasoning_effort: 'high', temperature: 0, response_format: { type: 'json_object' }, messages: [] });
const context: RequestContext = { case: 'fixture', arm: 'A', unit: 'unit-1', unitIds: ['unit-1'], promptVersion: 'fixture-v1' };
const fakeFetch = (fn: () => Promise<Response>): typeof fetch => Object.assign(fn, { preconnect: fetch.preconnect });

test('token estimate uses actual cache split; missing usage stays unknown', () => {
  expect(estimatedCost({ prompt_tokens: 10000, completion_tokens: 2000, prompt_cache_hit_tokens: 1000, prompt_cache_miss_tokens: 9000 }, '2026-10-19T14:00:00Z').usd).toBeCloseTo(.002553, 10);
  expect(estimatedCost(null, '2026-10-19T14:00:00Z').status).toBe('UNKNOWN');
  expect(estimatedCost({ prompt_tokens: 100, completion_tokens: 10 }, '2026-10-19T14:00:00Z').status).toBe('ESTIMATED_RANGE');
});

test('safe persisted response omits reasoning prose and credential text but retains usage counts', () => {
  const result = safeReply({ choices: [{ message: { reasoning_content: 'private internal text', content: 'business answer fixture-secret' } }], usage: { completion_tokens_details: { reasoning_tokens: 7 } } }, 'fixture-secret');
  expect(JSON.stringify(result)).not.toContain('private internal text'); expect(JSON.stringify(result)).not.toContain('fixture-secret');
  expect(JSON.stringify(result)).toContain('business answer'); expect(JSON.stringify(result)).toContain('reasoning_tokens');
});

test('first failed HTTP is saved once; repeated identity and budget cannot spend another call', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'forge-ab-first-http-')); let calls = 0;
  const recorder = new MeasuredHttp(folder, 'fixture-secret', 1, fakeFetch(async () => { calls++; throw Error('fixture network failure'); }));
  await expect(recorder.send('https://offline.invalid', { method: 'POST', body, headers: { Authorization: 'Bearer fixture-secret' } }, context)).rejects.toThrow('fixture network failure');
  await expect(recorder.send('https://offline.invalid', { method: 'POST', body, headers: {} }, context)).rejects.toThrow();
  expect(calls).toBe(1); expect(recorder.records).toHaveLength(1);
  expect(JSON.parse(readFileSync(join(folder, 'requests/001/audit.json'), 'utf8')).status).toBe('FAILED');
  expect(readFileSync(join(folder, 'requests/001/request-body.json'), 'utf8')).not.toContain('Authorization');
});

test('actual provider usage and complete business reply are frozen before downstream parsing', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'forge-ab-first-reply-'));
  const recorder = new MeasuredHttp(folder, 'fixture-secret', 2, fakeFetch(async () => new Response(JSON.stringify({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: '{"wrong":"first malformed domain reply"}', reasoning_content: 'omit me' } }], usage: { prompt_tokens: 10, completion_tokens: 5, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 10 } }), { status: 200 })));
  const response = await recorder.send('https://offline.invalid', { method: 'POST', body, headers: {} }, context);
  expect(response.ok).toBe(true);
  const actual = JSON.parse(readFileSync(join(folder, 'requests/001/request-body.json'), 'utf8'));
  expect(actual.reasoning_effort).toBe('high'); expect(actual.thinking).toEqual({ type: 'enabled' }); expect(recorder.records[0].usage.completion_tokens).toBe(5);
  expect(readFileSync(join(folder, 'requests/001/reply.txt'), 'utf8')).toContain('first malformed domain reply');
  expect(readFileSync(join(folder, 'requests/001/response-envelope.json'), 'utf8')).not.toContain('omit me');
  await expect(recorder.send('https://offline.invalid', { method: 'POST', body, headers: {} }, context)).rejects.toThrow('REPEATED_REQUEST_FORBIDDEN');
});

for (const arm of ['A', 'B'] as const) test(`actual outbound ${arm} body explicitly enables thinking/high`, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'forge-ab-high-wire-')); let wire: any;
  const fetcher: typeof fetch = Object.assign(async (_url: unknown, init?: RequestInit) => {
    wire = JSON.parse(String(init!.body));
    return new Response(JSON.stringify({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }), { status: 200 });
  }, { preconnect: fetch.preconnect });
  const recorder = new MeasuredHttp(folder, 'fixture-secret', 1, fetcher);
  await recorder.send('https://offline.invalid', { method: 'POST', body, headers: {} }, { ...context, arm });
  expect(wire.thinking).toEqual({ type: 'enabled' }); expect(wire.reasoning_effort).toBe('high');
  expect(JSON.parse(readFileSync(join(folder, 'requests/001/request-body.json'), 'utf8'))).toEqual(wire);
});
