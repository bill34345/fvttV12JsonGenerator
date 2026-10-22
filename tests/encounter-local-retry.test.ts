import { describe, expect, test } from 'bun:test';
import { MonsterIntakeProviderError } from '@fvtt-json-generator/intake-ai/provider';
import { retryEncounterStage } from '../packages/forge-browser-runtime/src/encounterStageRetry';
import { createEncounterIntakeProviders, retryingAutomationProvider, retryingMonsterProvider } from '../packages/forge-browser-runtime/src/encounterIntake';
import type { MonsterIntakeAiProvider } from '@fvtt-json-generator/intake-ai/types';

const retryableNetwork = () => new MonsterIntakeProviderError('network', 'safe network failure', { retryable: true });

describe('local Encounter bridge stage retry', () => {
  test('retries one retryable stream-stage failure with a fresh combined signal and returns only the second complete result', async () => {
    const signals: AbortSignal[] = [];
    const retries: unknown[] = [];
    let calls = 0;
    const result = await retryEncounterStage('extract', { budgetMs: 100, onRetry: (entry) => retries.push(entry) }, async (signal) => {
      signals.push(signal);
      calls += 1;
      if (calls === 1) throw retryableNetwork();
      return { complete: true };
    });
    expect(result).toEqual({ complete: true });
    expect(calls).toBe(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[0]!.aborted).toBe(true);
    expect(retries).toEqual([{ stage: 'extract', attempt: 2, code: 'network' }]);

    let httpCalls = 0;
    await expect(retryEncounterStage('discover', { budgetMs: 100 }, async () => {
      httpCalls += 1;
      if (httpCalls === 1) throw new MonsterIntakeProviderError('http_error', 'gateway', { retryable: true, status: 503 });
      return 'complete';
    })).resolves.toBe('complete');
    expect(httpCalls).toBe(2);

    let invalidCalls = 0;
    await expect(retryEncounterStage('repair', { budgetMs: 100 }, async () => {
      invalidCalls += 1;
      if (invalidCalls === 1) throw new MonsterIntakeProviderError('invalid_response', 'truncated stream', { retryable: true });
      return 'complete';
    })).resolves.toBe('complete');
    expect(invalidCalls).toBe(2);
  });

  test('stops after exactly two retryable failures and leaves normal single-attempt callers unchanged', async () => {
    let retryCalls = 0;
    await expect(retryEncounterStage('review', { budgetMs: 100 }, async () => {
      retryCalls += 1;
      throw retryableNetwork();
    })).rejects.toMatchObject({ code: 'network', retryable: true });
    expect(retryCalls).toBe(2);

    let ordinaryCalls = 0;
    await expect(retryEncounterStage('review', { budgetMs: 100, maxAttempts: 1 }, async () => {
      ordinaryCalls += 1;
      throw retryableNetwork();
    })).rejects.toMatchObject({ code: 'network' });
    expect(ordinaryCalls).toBe(1);
  });

  test('does not retry cancellation, deadline, nonretryable, rate, configuration, 4xx or schema-integrity errors', async () => {
    const failures = [
      new MonsterIntakeProviderError('timeout', 'timeout', { retryable: true }),
      new MonsterIntakeProviderError('rate_limited', 'rate', { retryable: true }),
      new MonsterIntakeProviderError('configuration', 'configuration', { retryable: true }),
      new MonsterIntakeProviderError('http_error', 'client', { retryable: true, status: 429 }),
      new MonsterIntakeProviderError('network', 'nonretryable', { retryable: false }),
      new TypeError('strict response schema rejected'),
    ];
    for (const error of failures) {
      let calls = 0;
      await expect(retryEncounterStage('repair', { budgetMs: 100 }, async () => {
        calls += 1;
        throw error;
      })).rejects.toBe(error);
      expect(calls).toBe(1);
    }

    const controller = new AbortController();
    let cancelledCalls = 0;
    await expect(retryEncounterStage('automation-review', { signal: controller.signal, budgetMs: 100 }, async () => {
      cancelledCalls += 1;
      controller.abort();
      throw retryableNetwork();
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelledCalls).toBe(1);
  });

  test('enforces one total deadline, clears the attempt signal and does not redo an earlier accepted stage', async () => {
    let reviewCalls = 0;
    await expect(retryEncounterStage('review', { budgetMs: 100 }, async () => {
      reviewCalls += 1;
      return 'accepted';
    })).resolves.toBe('accepted');

    let extractCalls = 0;
    let retrySignals = 0;
    await expect(retryEncounterStage('extract', { budgetMs: 10, onRetry: () => { retrySignals += 1; } }, (signal) => new Promise<never>((_resolve, reject) => {
      extractCalls += 1;
      signal.addEventListener('abort', () => reject(retryableNetwork()), { once: true });
    }))).rejects.toMatchObject({ code: 'timeout', retryable: false });
    expect(reviewCalls).toBe(1);
    expect(extractCalls).toBe(1);
    expect(retrySignals).toBe(0);
  });

  test('ends parent abort and deadline races even when the provider Promise ignores its signal, and consumes late settlement', async () => {
    const controller = new AbortController();
    let abortCalls = 0;
    const aborted = retryEncounterStage('extract', { signal: controller.signal, budgetMs: 100 }, async () => {
      abortCalls += 1;
      return await new Promise<never>(() => undefined);
    });
    await Promise.resolve();
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(abortCalls).toBe(1);

    let lateResolve!: (value: string) => void;
    let lateCalls = 0;
    let retries = 0;
    const lateSuccess = retryEncounterStage('extract', { budgetMs: 10, onRetry: () => { retries += 1; } }, async () => {
      lateCalls += 1;
      return await new Promise<string>((resolve) => { lateResolve = resolve; });
    });
    await expect(lateSuccess).rejects.toMatchObject({ code: 'timeout' });
    lateResolve('late success');
    await Promise.resolve();
    let lateReject!: (reason: unknown) => void;
    const lateFailure = retryEncounterStage('extract', { budgetMs: 10, onRetry: () => { retries += 1; } }, async () => {
      lateCalls += 1;
      return await new Promise<string>((_resolve, reject) => { lateReject = reject; });
    });
    await expect(lateFailure).rejects.toMatchObject({ code: 'timeout' });
    lateReject(retryableNetwork());
    await Promise.resolve();
    expect(lateCalls).toBe(2);
    expect(retries).toBe(0);
  });

  test('retries only the failed later Actor stage and does not replay an accepted earlier review', async () => {
    let reviewCalls = 0;
    let extractCalls = 0;
    const attemptSignals: AbortSignal[] = [];
    const factory = (signal: AbortSignal): MonsterIntakeAiProvider => {
      attemptSignals.push(signal);
      return {
        providerName: 'local-fixture', extractionModel: 'fixture', reviewModel: 'fixture',
        discover: async () => ({ schemaVersion: 1, candidates: [] }),
        extract: async () => {
          extractCalls += 1;
          if (extractCalls === 1) throw retryableNetwork();
          return { repaired: true } as any;
        },
        review: async () => { reviewCalls += 1; return { schemaVersion: 1, verdict: 'accepted', findings: [] }; },
        repair: async () => ({ repaired: true } as any),
      };
    };
    const identity = factory(new AbortController().signal);
    const provider = retryingMonsterProvider(identity, factory, { budgetMs: 100 });
    await provider.review({} as any);
    await provider.extract({} as any);
    expect(reviewCalls).toBe(1);
    expect(extractCalls).toBe(2);
    expect(attemptSignals.length).toBe(4);
    expect(attemptSignals[1]).not.toBe(attemptSignals[2]);
  });

  test('enables two attempts only for an explicit loopback bridge with a wait policy', () => {
    const ordinary = createEncounterIntakeProviders({ apiKey: 'fixture', baseUrl: 'https://provider.example/v1', model: 'fixture' });
    expect(ordinary.requestedOptions.maxAttempts).toBeUndefined();
    const local = createEncounterIntakeProviders({
      apiKey: 'fixture', baseUrl: 'http://127.0.0.1:8787/v1', model: 'fixture', allowLocalBridge: true,
      waitPolicy: { cycleMs: 1, cyclesBeforeDecision: 1, onDecision: async () => 'stop' },
    });
    expect(local.requestedOptions.maxAttempts).toBe(2);
    expect(() => createEncounterIntakeProviders({
      apiKey: 'fixture', baseUrl: 'http://127.0.0.1:8787/v1', model: 'fixture', allowLocalBridge: true, timeoutMs: 1800000, repairTimeoutMs: 1800000,
      waitPolicy: { cycleMs: 1, cyclesBeforeDecision: 1, onDecision: async () => 'stop' },
    })).not.toThrow();
    expect(() => createEncounterIntakeProviders({
      apiKey: 'fixture', baseUrl: 'http://127.0.0.1:8787/v1', model: 'fixture', allowLocalBridge: true, timeoutMs: 1800000,
    })).toThrow('timeoutMs');
    expect(() => createEncounterIntakeProviders({
      apiKey:'fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture',timeoutMs:1800000,
      waitPolicy:{cycleMs:1,cyclesBeforeDecision:1,onDecision:async()=>'stop'},
    })).toThrow('timeoutMs');
  });

  test('rejects retry budgets outside the shared 30 minute safe-integer range', async () => {
    await expect(retryEncounterStage('discover', { budgetMs: 1800001 }, async () => 'never')).rejects.toThrow('1800000');
    await expect(retryEncounterStage('discover', { budgetMs: Number.NaN }, async () => 'never')).rejects.toThrow('safe integer');
  });

  test('applies the same bounded retry to automation generation without retrying its review', async () => {
    let generateCalls = 0;
    let reviewCalls = 0;
    const factory = () => ({
      generate: async () => {
        generateCalls += 1;
        if (generateCalls === 1) throw retryableNetwork();
        return { version: 1, name: 'fixture', command: 'return { showPanel() {} };', notes: '', rules: [], manualSteps: [] } as any;
      },
      review: async () => { reviewCalls += 1; return { verdict: 'accepted' as const, findings: [] }; },
    });
    const provider = retryingAutomationProvider(factory(), () => factory(), { budgetMs: 100 });
    await provider.generate({} as any);
    await provider.review({} as any);
    expect(generateCalls).toBe(2);
    expect(reviewCalls).toBe(1);
  });
});


test('a transport failure after the one model correction cannot recreate its budget in a fresh provider',async()=>{
  let attempts=0;
  const factory=():MonsterIntakeAiProvider=>({providerName:'fixture',extractionModel:'fixture',reviewModel:'fixture',
    getExtractionCorrectionCount:()=>1,discover:async()=>({schemaVersion:1,candidates:[]}),
    extract:async()=>{attempts++;throw retryableNetwork();},review:async()=>({schemaVersion:1,verdict:'accepted',findings:[]}),repair:async()=>({} as any)});
  const provider=retryingMonsterProvider(factory(),factory,{budgetMs:100});
  const request={} as any;
  await expect(provider.extract(request)).rejects.toMatchObject({code:'network',retryable:false});
  expect(attempts).toBe(1);expect(provider.getExtractionCorrectionCount?.(request)).toBe(1);
  expect(provider.getExtractionCorrectionCount?.({} as any)).toBe(0);
});
