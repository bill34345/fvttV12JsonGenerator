import { describe, expect, test } from 'bun:test';
import { OpenAICompatibleMonsterIntakeProvider } from '../packages/intake-ai/src/provider';
import { validateMonsterIntakeIR } from '../packages/intake-ai/src/validator';
import { LURKER_SOURCE, buildValidLurkerIr } from '../src/core/intake/__tests__/fixtures/lurker';

function unpositionedLurker() {
  const ir = structuredClone(buildValidLurkerIr()) as any;
  visitEvidenceRefs(ir, (ref) => { ref.start = -1; ref.end = -1; });
  return ir;
}

function visitEvidenceRefs(value: unknown, visit: (ref: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => visitEvidenceRefs(entry, visit));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.quote === 'string' && Number.isInteger(record.start) && Number.isInteger(record.end)) visit(record);
  Object.values(record).forEach((entry) => visitEvidenceRefs(entry, visit));
}

function fakeProvider(payloads: unknown[], requests: Array<{ url: string; body: Record<string, any> }>) {
  return new OpenAICompatibleMonsterIntakeProvider({
    authMode: 'api-key', apiKey: 'test-key', baseUrl: 'https://provider.example/v1', model: 'test-model', reviewModel: 'test-model',
    timeoutMs: 1_000, repairTimeoutMs: 1_000, evidenceAnchoring: 'exact-quotes',
    httpClient: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      const payload = payloads.shift();
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) };
    },
  });
}

function extractionRequest() {
  return {
    source: LURKER_SOURCE,
    sourceSha256: buildValidLurkerIr().source.sha256,
    candidate: { id: 'lurker', label: 'Lurker', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE },
  };
}

describe('exact-quote evidence anchoring', () => {
  test('adds the opt-in extract instruction and anchors unique -1 evidence and coverage references before validation', async () => {
    const requests: Array<{ url: string; body: Record<string, any> }> = [];
    const provider = fakeProvider([unpositionedLurker()], requests);

    const result = await provider.extract(extractionRequest());

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe('https://provider.example/v1/chat/completions');
    const prompt = requests[0]!.body.messages[0].content as string;
    expect(prompt).toContain('Prioritize exact-quote evidence anchoring.');
    expect(prompt).toContain('set start and end to -1');
    expect(prompt).toContain('Never emit a coverage quote that is only repeated whitespace.');
    expect(prompt.endsWith('All existing IR fields, evidence, coverage, and semantic requirements remain mandatory.')).toBeTrue();
    const refs: Record<string, unknown>[] = [];
    visitEvidenceRefs(result, (ref) => refs.push(ref));
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every((ref) => Number(ref.start) >= 0 && Number(ref.end) > Number(ref.start))).toBeTrue();
    expect(validateMonsterIntakeIR(LURKER_SOURCE, result).blocking).toEqual([]);
  });

  test('leaves a repeated -1 quote unanchored so the validator rejects it instead of choosing the first occurrence', async () => {
    const duplicate = unpositionedLurker();
    duplicate.claims[0].evidence[0] = { start: -1, end: -1, quote: '\n\n' };
    const provider = fakeProvider([duplicate], []);

    const result = await provider.extract(extractionRequest());

    expect(result.claims[0]!.evidence[0]).toEqual({ start: -1, end: -1, quote: '\n\n' });
    expect(validateMonsterIntakeIR(LURKER_SOURCE, result).blocking).toContainEqual(expect.objectContaining({
      code: 'EVIDENCE_OUT_OF_RANGE', path: '/claims/0/evidence/0', blocking: true,
    }));
  });

  test('preserves an explicit valid range for a repeated quote', async () => {
    const positioned = unpositionedLurker();
    const first = LURKER_SOURCE.indexOf('\n\n');
    const second = LURKER_SOURCE.indexOf('\n\n', first + 1);
    expect(second).toBeGreaterThan(first);
    positioned.claims[0].evidence[0] = { start: second, end: second + 2, quote: '\n\n' };
    const provider = fakeProvider([positioned], []);

    const result = await provider.extract(extractionRequest());

    expect(result.claims[0]!.evidence[0]).toEqual({ start: second, end: second + 2, quote: '\n\n' });
  });

  test('adds the same opt-in instruction to repair without changing review or discovery prompts', async () => {
    const requests: Array<{ url: string; body: Record<string, any> }> = [];
    const ir = unpositionedLurker();
    const provider = fakeProvider([ir], requests);

    await provider.repair({
      stage: 'deterministic-validation', source: LURKER_SOURCE, ir, deterministicFindings: [],
    });

    expect(requests[0]!.body.messages[0].content).toContain('Prioritize exact-quote evidence anchoring.');
  });

  test('keeps the default extract prompt unchanged when exact-quote anchoring is not requested', async () => {
    const requests: Array<{ url: string; body: Record<string, any> }> = [];
    const provider = new OpenAICompatibleMonsterIntakeProvider({
      authMode: 'api-key', apiKey: 'test-key', baseUrl: 'https://provider.example/v1', model: 'test-model', reviewModel: 'test-model',
      timeoutMs: 1_000, repairTimeoutMs: 1_000,
      httpClient: async (url, init) => {
        requests.push({ url, body: JSON.parse(init.body) });
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(buildValidLurkerIr()) } }] }) };
      },
    });

    await provider.extract(extractionRequest());

    expect(requests[0]!.body.messages[0].content).not.toContain('Prioritize exact-quote evidence anchoring.');
  });
});
