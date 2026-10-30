import { describe, expect, test } from 'bun:test';
import { OpenAICompatibleMonsterIntakeProvider } from '../packages/intake-ai/src/provider';
import { validateMonsterIntakeIR } from '../packages/intake-ai/src/validator';

function repairProvider(payload: unknown, requests: Record<string, any>[]) {
  return new OpenAICompatibleMonsterIntakeProvider({
    authMode: 'api-key', apiKey: 'test-key', baseUrl: 'https://provider.example/v1', model: 'test-model', reviewModel: 'test-model',
    timeoutMs: 1_000, repairTimeoutMs: 1_000,
    httpClient: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) };
    },
  });
}

function repairIr(refs: Array<{ quote: string }>) {
  return {
    schemaVersion: 1,
    source: { sha256: 'not-used-by-provider-stage-shape', length: 0 },
    creature: { identity: { name: 'Repair evidence fixture', size: 'medium', creatureType: 'construct' } },
    claims: refs.map((ref, index) => ({
      path: `/creature/traits/${index}`, valueKind: 'explicit', confidence: 'high',
      evidence: [{ start: -1, end: -1, quote: ref.quote }],
    })),
    coverage: [],
    uncertainties: [],
  } as any;
}

function repairRequest(source: string, ir: any, paths: string[]) {
  return {
    stage: 'deterministic-validation' as const,
    source,
    ir,
    deterministicFindings: paths.map((path, index) => ({
      id: `evidence-${index}`, code: 'EVIDENCE_OUT_OF_RANGE', path, message: 'Evidence range is outside the submitted source.',
      blocking: true, origin: 'evidence' as const,
    })),
  };
}

function sentRepairPayload(requests: Record<string, any>[]) {
  return JSON.parse(requests[0]!.messages[1].content);
}

describe('repair source diagnostic candidates', () => {
  test('supplies exact CJK insertion and numeric candidates without changing the input IR or validator result', async () => {
    const cjkSource = '绯晶拒绝的次数耗尽后，守护恢复为削弱形态：超过二十点的伤害只能减少熟练加值，不能减半。';
    const cjkQuote = cjkSource.replace('不能减半', '不能再减半');
    const numericSource = '绯晶腐化能力在月石戳刺命中并满足全部前置条件之后，要求目标进行一次 DC 19 魅力豁免；失败时按来源写明的完整后果处理，不得自行修改数值。';
    const numericQuote = numericSource.replace('DC 19', 'DC 18');
    const source = `${cjkSource}\n${numericSource}`;
    const ir = repairIr([{ quote: cjkQuote }, { quote: numericQuote }]);
    const original = structuredClone(ir);
    const requests: Record<string, any>[] = [];
    const provider = repairProvider(ir, requests);

    await provider.repair(repairRequest(source, ir, ['/claims/0/evidence/0', '/claims/1/evidence/0']));

    const payload = sentRepairPayload(requests);
    expect(payload.diagnosticCandidates).toEqual([
      { findingPath: '/claims/0/evidence/0', source: 'request.source', start: 0, end: cjkSource.length, quote: cjkSource },
      { findingPath: '/claims/1/evidence/0', source: 'request.source', start: cjkSource.length + 1, end: source.length, quote: numericSource },
    ]);
    expect(payload.ir).toEqual(original);
    expect(ir).toEqual(original);
    expect(ir.claims[0].evidence[0]).toMatchObject({ start: -1, end: -1, quote: cjkQuote });
    expect(validateMonsterIntakeIR(source, ir).blocking).toContainEqual(expect.objectContaining({
      code: 'EVIDENCE_OUT_OF_RANGE', path: '/claims/0/evidence/0', blocking: true,
    }));
    expect(requests[0]!.messages[0].content).toContain('Copy an exact verbatim source span');
    expect(requests[0]!.messages[0].content).toContain('Never change the requested schema, call budget');
  });

  test('does not provide a hint when the long prefix appears more than once', async () => {
    const prefix = '这是一段超过三十二个非空字符并且完全相同的来源前缀，用来验证重复前缀不会被猜测定位';
    const source = `${prefix}，第一处不能减半。\n${prefix}，第二处不能减半。`;
    const quote = `${prefix}，第一处不能再减半。`;
    const ir = repairIr([{ quote }]);
    const requests: Record<string, any>[] = [];
    const provider = repairProvider(ir, requests);

    await provider.repair(repairRequest(source, ir, ['/claims/0/evidence/0']));

    expect(sentRepairPayload(requests)).not.toHaveProperty('diagnosticCandidates');
  });
});
