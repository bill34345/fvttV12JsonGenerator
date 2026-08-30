import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { normalizeItemIntakeIR } from '@fvtt-json-generator/intake-ai/item-core';
import {
  resolveLockedDnd5eV14Spell,
  resolveLockedDnd5eV14SpellActivation,
} from '@fvtt-json-generator/generation/v14-spell-catalog';
import type {
  ItemAiReviewResult,
  ItemIntakeAiProvider,
  ItemIntakeIR,
} from '@fvtt-json-generator/intake-ai/item-types';
import {
  analyzeBrowserItemSourceWithAi,
  createBrowserItemAiProvider,
  generateAndReviewBrowserItemIntake,
  repairBrowserItemIntake,
  type BrowserItemIntakeAnalysis,
  type BrowserItemIntakeInput,
} from '@fvtt-json-generator/forge-browser-runtime/item-intake';
import {
  OpenAICompatibleItemIntakeProvider,
  responseFormatForStage,
} from '@fvtt-json-generator/intake-ai/item-provider';
import {
  buildJewelOfThreePrayersIr,
  jewelCandidate,
  JEWEL_OF_THREE_PRAYERS_SOURCE,
} from '../src/core/intake/__tests__/fixtures/jewel-of-three-prayers';

const MULTI_STAGE_JEWEL = readFileSync(resolve('obsidian/dnd数据转fvttjson/input/items/三祷之坠.md'), 'utf8');

describe('Forge browser AI Item Intake review stages', () => {
  test('includes the complete evidence and coverage contract in json_object extract and repair prompts', async () => {
    const originalFetch = globalThis.fetch;
    const prompts: string[] = [];
    try {
      globalThis.fetch = ((_request: RequestInfo | URL, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body));
        prompts.push(String(requestBody.messages[0].content));
        const content = prompts.length === 1
          ? buildJewelOfThreePrayersIr()
          : buildJewelOfThreePrayersIr();
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
        } as Response);
      }) as unknown as typeof fetch;
      const provider = new OpenAICompatibleItemIntakeProvider({
        authMode: 'api-key',
        apiKey: 'test-only-key',
        baseUrl: 'https://provider.example',
        model: 'test-model',
        reviewModel: 'test-model',
        responseFormat: 'json_object',
        timeoutMs: 1_000,
        repairTimeoutMs: 1_000,
      });
      const candidate = jewelCandidate();
      const ir = buildJewelOfThreePrayersIr();
      await provider.extract({ source: JEWEL_OF_THREE_PRAYERS_SOURCE, sourceSha256: ir.source.sha256, candidate });
      await provider.repair({ source: JEWEL_OF_THREE_PRAYERS_SOURCE, candidate, ir, deterministicFindings: [] });

      expect(prompts).toHaveLength(2);
      for (const prompt of prompts) {
        expect(prompt).toContain('{"start":0,"end":1,"quote":"exact source slice"}');
        expect(prompt).toContain('Every coverage entry MUST be flat, never nested under range');
        expect(prompt).toContain('partition the complete request.candidate range without gaps or overlaps');
        expect(prompt).toContain('Do not create a blocking uncertainty for faithfully preserved narrative description');
        expect(prompt).toContain('uses is null or exactly {"max":3,"recovery":[{"period":"dawn","type":"recoverAll"}]}');
        expect(prompt).toContain('abilities is always an array, never an object or keyed map');
        expect(prompt).toContain('Do not add uuid or any other keys');
        expect(prompt).toContain('Required mechanical claim paths use stable ability ids, not array indexes');
      }
      expect(prompts[0]).toContain('Invisibility from the locked dnd5e 5.3.3 catalog has activation "action"');
      expect(prompts[1]).toContain('Return a complete corrected ItemIntakeIR schemaVersion 1, not a patch');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('uses DeepSeek-compatible JSON object output without weakening local schema validation', async () => {
    expect(responseFormatForStage('discover')).toMatchObject({ type: 'json_schema' });
    expect(responseFormatForStage('discover', 'json_object')).toEqual({ type: 'json_object' });

    const originalFetch = globalThis.fetch;
    let requestBody: any;
    try {
      globalThis.fetch = ((_request: RequestInfo | URL, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => new Promise((resolveBody, rejectBody) => {
            const complete = setTimeout(() => resolveBody({
              choices: [{ message: { content: JSON.stringify({ schemaVersion: 1, candidates: [] }) } }],
            }), 40);
            const abortBody = () => {
              clearTimeout(complete);
              rejectBody(new DOMException('The response body was aborted.', 'AbortError'));
            };
            if (init?.signal?.aborted) abortBody();
            else init?.signal?.addEventListener('abort', abortBody, { once: true });
          }),
        } as Response);
      }) as unknown as typeof fetch;

      const provider = createBrowserItemAiProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        timeoutMs: 5,
      });
      await expect(provider.discover({ source: 'test item', sourceSha256: hashSource('test item') }))
        .rejects.toMatchObject({ code: 'timeout' });
      expect(requestBody.response_format).toEqual({ type: 'json_object' });
      expect(JSON.stringify(requestBody)).not.toContain('secret-key');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('rejects string-only review findings instead of leaking undefined UI fields', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({
            schemaVersion: 1,
            verdict: 'revise',
            findings: ['AC path is wrong'],
          }) } }],
        }),
      } as Response)) as unknown as typeof fetch;
      const provider = new OpenAICompatibleItemIntakeProvider({
        authMode: 'api-key',
        apiKey: 'test-only-key',
        baseUrl: 'https://provider.example',
        model: 'test-model',
        reviewModel: 'test-model',
        responseFormat: 'json_object',
        timeoutMs: 1_000,
        repairTimeoutMs: 1_000,
      });

      await expect(provider.review({
        source: JEWEL_OF_THREE_PRAYERS_SOURCE,
        candidate: jewelCandidate(),
        ir: buildJewelOfThreePrayersIr(),
        markdown: 'fixture markdown',
        itemProjection: {},
        deterministicFindings: [],
      })).rejects.toMatchObject({ code: 'invalid_response' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('cancels a DeepSeek response body without retrying or exposing the credential', async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    let calls = 0;
    let bodyAborted = false;
    try {
      globalThis.fetch = ((_request: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => new Promise((_resolve, reject) => {
            const rejectAborted = () => {
              bodyAborted = true;
              reject(new DOMException('The response body was aborted.', 'AbortError'));
            };
            if (init?.signal?.aborted) rejectAborted();
            else init?.signal?.addEventListener('abort', rejectAborted, { once: true });
          }),
        } as Response);
      }) as unknown as typeof fetch;

      const input = itemInput('item-body-cancel');
      const pending = analyzeBrowserItemSourceWithAi(input, createBrowserItemAiProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
      }, controller.signal), controller.signal);
      await Promise.resolve();
      await Promise.resolve();
      controller.abort();
      const result = await pending;
      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('cancelled');
      expect(calls).toBe(1);
      expect(bodyAborted).toBe(true);
      expect(JSON.stringify(result)).not.toContain('secret-key');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('cancels a DeepSeek request before response headers without retrying', async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    let calls = 0;
    try {
      globalThis.fetch = ((_request: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        });
      }) as unknown as typeof fetch;
      const pending = analyzeBrowserItemSourceWithAi(itemInput('item-header-cancel'), createBrowserItemAiProvider({
        apiKey: 'secret-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash',
      }, controller.signal), controller.signal);
      await Promise.resolve();
      controller.abort();
      const result = await pending;
      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('cancelled');
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('keeps an interactive Item request open past the legacy stage timeout without reposting', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    let decisions = 0;
    let resolveBody!: (value: unknown) => void;
    try {
      globalThis.fetch = (() => {
        calls += 1;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => new Promise((resolve) => { resolveBody = resolve; }),
        } as Response);
      }) as unknown as typeof fetch;
      const provider = createBrowserItemAiProvider({
        apiKey: 'secret-key',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        timeoutMs: 1,
        waitPolicy: {
          cycleMs: 2,
          cyclesBeforeDecision: 4,
          onDecision: async () => {
            decisions += 1;
            resolveBody({ choices: [{ message: { content: JSON.stringify({ schemaVersion: 1, candidates: [] }) } }] });
            return 'continue';
          },
        },
      });
      await expect(provider.discover({ source: 'test item', sourceSha256: hashSource('test item') }))
        .resolves.toMatchObject({ schemaVersion: 1, candidates: [] });
      expect(calls).toBe(1);
      expect(decisions).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('never automatically retries a completed failed POST in interactive Item mode', async () => {
    const originalFetch = globalThis.fetch;
    try {
      const cases: Array<() => Promise<Response>> = [
        async () => { throw new TypeError('network failed'); },
        async () => ({ ok: false, status: 500, json: async () => ({}) } as Response),
        async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'not-json' } }] }) } as Response),
      ];
      for (const response of cases) {
        let calls = 0;
        globalThis.fetch = (() => { calls += 1; return response(); }) as unknown as typeof fetch;
        const provider = createBrowserItemAiProvider({
          apiKey: 'secret-key', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash',
          waitPolicy: { cycleMs: 2, cyclesBeforeDecision: 4, onDecision: async () => 'continue' },
        });
        await expect(provider.discover({ source: 'test item', sourceSha256: hashSource('test item') })).rejects.toBeDefined();
        expect(calls).toBe(1);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('pauses after one evidence-first Jewel analysis with provider and prompt identity', async () => {
    const input = itemInput('item-analysis');
    const analysis = await analyzeBrowserItemSourceWithAi(input, jewelProvider(), undefined, 'item-attempt-3');
    expect(analysis.status).toBe('ready_to_generate');
    expect(analysis.attemptId).toBe('item-attempt-3');
    expect(analysis.calls).toEqual({ discovery: 1, extraction: 1, review: 0, repair: 0 });
    expect(analysis.candidate).toEqual(jewelCandidate());
    expect(analysis.provider).toMatchObject({
      providerName: 'fake-item-provider',
      extractionModel: 'fake-item-extract',
      reviewModel: 'fake-item-review',
      promptVersions: {
        discover: expect.stringContaining('item-intake-discover'),
        extract: expect.stringContaining('item-intake-extract'),
        review: expect.stringContaining('item-intake-review'),
        repair: expect.stringContaining('item-intake-repair'),
      },
    });
    expect(analysis).not.toHaveProperty('response');
    expect(JSON.stringify(analysis)).not.toMatch(/artifactHash|authorization|api-key/iu);
    if (!analysis.candidate || !analysis.ir) throw new Error('Expected one normalized Item candidate.');
    expect(analysis.ir).toEqual(normalizeItemIntakeIR(
      input.source,
      analysis.candidate,
      buildJewelOfThreePrayersIr(),
      { resolveSpell: resolveLockedDnd5eV14Spell, resolveActivation: resolveLockedDnd5eV14SpellActivation },
    ));
  });

  test('accepts the single Dormant Jewel through the formal Item runtime with exact lifecycle mechanics', async () => {
    const input = itemInput('item-accepted');
    const analysis = await analyzeBrowserItemSourceWithAi(input, jewelProvider());
    const result = await generateAndReviewBrowserItemIntake(input, analysis, jewelProvider());
    expect(result.status).toBe('accepted');
    expect(result.finalSourceHash).toBe(hashSource(result.finalSource!));
    expect(result.response && 'result' in result.response ? result.response.result.status : 'failed').toBe('accepted');
    if (!result.response || !('result' in result.response) || result.response.result.status !== 'accepted') throw new Error('Expected an accepted Item response.');
    const item = result.response.result.artifact as any;
    const ac = item.effects.find((effect: any) => effect.transfer === true);
    expect(ac?.system?.changes).toEqual([{
      key: 'system.attributes.ac.bonus', type: 'add', value: 1, phase: 'initial', priority: null,
    }]);
    expect(item.system.uses).toMatchObject({ max: '3', recovery: [{ period: 'dawn', type: 'recoverAll' }] });
    const activities = Object.values(item.system.activities) as any[];
    expect(activities).toContainEqual(expect.objectContaining({
      type: 'cast',
      consumption: expect.objectContaining({
        spellSlot: false,
        targets: expect.arrayContaining([expect.objectContaining({ type: 'itemUses', value: '1' })]),
      }),
    }));
    const light = activities.find((entry) => entry.type === 'utility' && entry.activation?.type === 'action');
    expect(light?.consumption).toMatchObject({ spellSlot: false, targets: [] });
    const changes = (item.effects as any[]).flatMap((effect) => effect.system?.changes ?? []);
    expect(changes).toContainEqual(expect.objectContaining({ key: 'token.light.bright', value: 15 }));
    expect(changes).toContainEqual(expect.objectContaining({ key: 'token.light.dim', value: 30 }));
  });

  test('keeps revise non-creatable and allows only one repair before accepted regenerate', async () => {
    let reviewCalls = 0;
    const provider = jewelProvider({
      review: async (): Promise<ItemAiReviewResult> => {
        reviewCalls += 1;
        return reviewCalls === 1
          ? {
              schemaVersion: 1,
              verdict: 'revise',
              findings: [{
                id: 'item-revise', code: 'ITEM_REVISE', path: '/item', message: 'Repair once.',
                blocking: true, origin: 'ai-review',
              }],
            }
          : { schemaVersion: 1, verdict: 'accepted', findings: [] };
      },
    });
    const input = itemInput('item-regenerate');
    const analysis = await analyzeBrowserItemSourceWithAi(input, provider, undefined, 'stable-item-attempt');
    const first = await generateAndReviewBrowserItemIntake(input, analysis, provider);
    expect(first.status).toBe('needs_review');
    expect(first.response).toBeUndefined();
    expect(JSON.stringify(first)).not.toContain('artifactHash');
    const repaired = await repairBrowserItemIntake(input, first, provider);
    expect(repaired.status).toBe('ready_to_generate');
    expect(repaired.repairCount).toBe(1);
    expect(repaired.attemptId).toBe('stable-item-attempt');
    const exhausted = await repairBrowserItemIntake(input, repaired, provider);
    expect(exhausted.status).toBe('needs_review');
    expect(exhausted.findings).toContainEqual(expect.objectContaining({ code: 'REPAIR_BUDGET_EXHAUSTED' }));
    expect(exhausted.calls.repair).toBe(1);
    const accepted = await generateAndReviewBrowserItemIntake(input, repaired, provider);
    expect(accepted.status).toBe('accepted');
    expect(accepted.calls).toEqual({ discovery: 1, extraction: 1, repair: 1, review: 2 });
  });

  test('blocks multiple candidates, multiple stages, and unresolved spells without a response or artifact hash', async () => {
    const multipleProvider = jewelProvider({
      discover: async () => ({
        schemaVersion: 1,
        candidates: [jewelCandidate(), { ...jewelCandidate(), id: 'duplicate-item', label: 'duplicate' }],
      }),
    });
    const multiple = await analyzeBrowserItemSourceWithAi(itemInput('item-multiple'), multipleProvider);
    expect(multiple.status).toBe('needs_review');
    expect(multiple.errorCode).toBe('multiple_entities');
    expect(JSON.stringify(multiple)).not.toContain('artifactHash');

    const omittedStageIr = multiStageJewelIr();
    omittedStageIr.item.stages = [];
    let omittedStageExtractions = 0;
    const multiStageProvider = jewelProvider({
      discover: async () => ({ schemaVersion: 1, candidates: [multiStageCandidate()] }),
      extract: async () => {
        omittedStageExtractions += 1;
        return omittedStageIr;
      },
    });
    const multiStage = await analyzeBrowserItemSourceWithAi(multiStageInput(), multiStageProvider);
    expect(multiStage.status).toBe('needs_review');
    expect(multiStage.errorCode).toBe('multi_stage');
    expect(multiStage.findings).toContainEqual(expect.objectContaining({ code: 'MULTI_STAGE_ITEM_UNSUPPORTED' }));
    expect(omittedStageExtractions).toBe(0);

    const singleStageAnalysis = await analyzeBrowserItemSourceWithAi(itemInput('legacy-analysis'), jewelProvider());
    const legacyCandidate = multiStageCandidate();
    const legacyAnalysis = {
      ...structuredClone(singleStageAnalysis),
      status: 'needs_review',
      rawSourceHash: hashSource(MULTI_STAGE_JEWEL),
      candidates: [legacyCandidate],
      candidate: legacyCandidate,
      ir: omittedStageIr,
      findings: [],
    } as BrowserItemIntakeAnalysis;
    let repairCalls = 0;
    const deletionRepair = await repairBrowserItemIntake(multiStageInput(), legacyAnalysis, jewelProvider({
      repair: async () => {
        repairCalls += 1;
        return omittedStageIr;
      },
    }));
    expect(deletionRepair.status).toBe('needs_review');
    expect(deletionRepair.findings).toContainEqual(expect.objectContaining({ code: 'MULTI_STAGE_ITEM_UNSUPPORTED' }));
    expect(repairCalls).toBe(0);

    const forgedReady = { ...structuredClone(legacyAnalysis), status: 'ready_to_generate', findings: [] } as BrowserItemIntakeAnalysis;
    const forgedGeneration = await generateAndReviewBrowserItemIntake(multiStageInput(), forgedReady, jewelProvider());
    expect(forgedGeneration.status).toBe('needs_review');
    expect(forgedGeneration.response).toBeUndefined();
    expect(JSON.stringify(forgedGeneration)).not.toContain('artifactHash');

    const unresolved = buildJewelOfThreePrayersIr();
    const spell = unresolved.item.abilities.find((entry) => entry.kind === 'spell');
    if (!spell || spell.kind !== 'spell') throw new Error('Jewel fixture lacks its spell ability.');
    spell.spell = { identifier: 'unknown-spell', name: 'Unknown Spell' };
    const unresolvedAnalysis = await analyzeBrowserItemSourceWithAi(itemInput('item-unresolved'), jewelProvider({ extract: async () => unresolved }));
    expect(unresolvedAnalysis.status).toBe('needs_review');
    expect(unresolvedAnalysis.findings).toContainEqual(expect.objectContaining({ code: 'UNRESOLVED_SPELL' }));

    const weakEvidence = buildJewelOfThreePrayersIr();
    weakEvidence.source.sha256 = '0'.repeat(64);
    const weakEvidenceAnalysis = await analyzeBrowserItemSourceWithAi(itemInput('item-weak-evidence'), jewelProvider({ extract: async () => weakEvidence }));
    expect(weakEvidenceAnalysis.status).toBe('needs_review');
    expect(weakEvidenceAnalysis.findings).toContainEqual(expect.objectContaining({ code: 'SOURCE_HASH_MISMATCH' }));
    expect(JSON.stringify([multiStage, deletionRepair, forgedGeneration, unresolvedAnalysis, weakEvidenceAnalysis])).not.toContain('artifactHash');
  });

  test('keeps Item browser core free of Node imports', () => {
    for (const path of [
      'packages/intake-ai/src/item-core.ts',
      'packages/intake-ai/src/item-validator-core.ts',
      'packages/forge-browser-runtime/src/itemIntake.ts',
    ]) {
      expect(readFileSync(resolve(path), 'utf8')).not.toMatch(/from\s+['"]node:/u);
    }
  });

  test('does not expose an unknown provider raw error, endpoint, or credential in review state', async () => {
    const provider = jewelProvider({
      discover: async () => { throw new Error('Bearer secret-key failed at https://provider.example/v1?secret=query'); },
    });
    const result = await analyzeBrowserItemSourceWithAi(itemInput('item-provider-secret'), provider);
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('provider_failure');
    expect(result.stages.at(-1)?.message).toBe('AI Item Intake failed before an accepted result.');
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'ANALYSIS_PROVIDER_FAILURE', blocking: true,
    }));
    expect(JSON.stringify(result)).not.toMatch(/secret-key|provider\.example|secret=query|Bearer/iu);
  });

  test.each([
    {
      label: 'missing light evidence',
      mutate(ir: ItemIntakeIR) {
        const ability = ir.item.abilities.find((entry) => entry.kind === 'light');
        if (!ability) throw new Error('Jewel fixture lacks its light ability.');
        delete (ability as any).evidence;
      },
      expectedCode: 'MISSING_ABILITY_EVIDENCE',
    },
    {
      label: 'missing nested spell reference',
      mutate(ir: ItemIntakeIR) {
        const ability = ir.item.abilities.find((entry) => entry.kind === 'spell');
        if (!ability) throw new Error('Jewel fixture lacks its spell ability.');
        delete (ability as any).spell;
      },
      expectedCode: 'INVALID_SPELL_REFERENCE',
    },
  ])('routes malformed provider ability through deterministic validation: $label', async ({ mutate, expectedCode }) => {
    const malformed = buildJewelOfThreePrayersIr();
    mutate(malformed);

    const result = await analyzeBrowserItemSourceWithAi(
      itemInput(`item-malformed-${expectedCode}`),
      jewelProvider({ extract: async () => malformed }),
    );

    expect(result.status).toBe('needs_review');
    expect(result.errorCode).not.toBe('provider_failure');
    expect(result.stages).toContainEqual(expect.objectContaining({ stage: 'validate', status: 'failed' }));
    expect(result.findings).toContainEqual(expect.objectContaining({ code: expectedCode, blocking: true }));
    expect(result).not.toHaveProperty('response');
    expect(JSON.stringify(result)).not.toContain('artifactHash');
  });
});

function itemInput(requestId: string): BrowserItemIntakeInput {
  return {
    source: JEWEL_OF_THREE_PRAYERS_SOURCE,
    sourceName: 'jewel-dormant.raw.txt',
    displayName: '三祷之坠（休眠态）',
    requestId,
    fvttVersion: '14.364',
    systemVersion: '5.3.3',
  };
}

function jewelProvider(overrides: Partial<ItemIntakeAiProvider> = {}): ItemIntakeAiProvider {
  const provider: ItemIntakeAiProvider = {
    providerName: 'fake-item-provider',
    extractionModel: 'fake-item-extract',
    reviewModel: 'fake-item-review',
    discover: async () => ({ schemaVersion: 1, candidates: [jewelCandidate()] }),
    extract: async () => buildJewelOfThreePrayersIr(),
    repair: async () => buildJewelOfThreePrayersIr(),
    review: async () => ({ schemaVersion: 1, verdict: 'accepted', findings: [] }),
  };
  return { ...provider, ...overrides };
}

function multiStageCandidate() {
  return { id: 'jewel-all-stages', label: '三祷之坠', start: 0, end: MULTI_STAGE_JEWEL.length, quote: MULTI_STAGE_JEWEL };
}

function multiStageInput(): BrowserItemIntakeInput {
  return {
    source: MULTI_STAGE_JEWEL,
    sourceName: 'jewel-all-stages.md',
    requestId: 'item-multi-stage',
    fvttVersion: '14.364',
    systemVersion: '5.3.3',
  };
}

function multiStageJewelIr(): ItemIntakeIR {
  const ir = buildJewelOfThreePrayersIr();
  ir.source = { sha256: hashSource(MULTI_STAGE_JEWEL), length: MULTI_STAGE_JEWEL.length };
  ir.item.stages = [
    { name: 'Dormant', evidence: [] },
    { name: 'Awakened', evidence: [] },
    { name: 'Exalted', evidence: [] },
  ];
  return ir;
}
