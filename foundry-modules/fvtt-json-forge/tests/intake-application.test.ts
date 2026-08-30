import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  buildForgeActorRequest,
  buildForgeItemRequest,
  convertFinalActorSource,
  convertFinalItemSource,
} from '@fvtt-json-generator/forge-browser-runtime';
import { hashSource, type ForgeActorResponse, type ForgeItemResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import {
  buildForgeIntakeReviewBundle,
  createForgeIntakeSnapshot,
  serializeForgeIntakeReviewBundle,
} from '@fvtt-json-generator/forge-browser-runtime/intake-review';
import {
  FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES,
  decodeForgeIntakeReviewBundleText,
} from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';
import {
  createForgeIntakeApplicationClass,
  type ForgeIntakeApplicationServices,
} from '../src/intakeApplication';
import { claimForgeAiJob, releaseForgeAiJob } from '../src/aiJobGate';

const ACTOR_SOURCE = readFileSync('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md', 'utf8');
const ITEM_SOURCE = readFileSync('obsidian/dnd数据转fvttjson/input/items/骑士之盾.md', 'utf8');
let acceptedActor: ForgeActorResponse;
let acceptedItem: ForgeItemResponse;

beforeAll(async () => {
  acceptedActor = await convertFinalActorSource(buildForgeActorRequest({
    content: ACTOR_SOURCE, displayName: 'Intake Actor', requestId: 'intake-actor-fixture', fvttVersion: '14.364', systemVersion: '5.3.3',
  }));
  acceptedItem = await convertFinalItemSource(buildForgeItemRequest({
    content: ITEM_SOURCE, displayName: 'Intake Item', requestId: 'intake-item-fixture', fvttVersion: '14.364', systemVersion: '5.3.3',
  }));
  if (!('result' in acceptedActor) || acceptedActor.result.status !== 'accepted') throw new Error('Actor fixture is not accepted.');
  if (!('result' in acceptedItem) || acceptedItem.result.status !== 'accepted') throw new Error('Item fixture is not accepted.');
});

describe('Forge Intake Application review workspace', () => {
  test('runs plaintext Analyze then Generate, and routes accepted creation only to the Actor adapter', async () => {
    let actorCreates = 0;
    let itemCreates = 0;
    const { application, root } = makeApplication({
      analyzePlaintextActorSource: ((source: string) => ({
        status: 'ready_to_generate', rawSourceHash: hashSource(source), candidates: [{ id: 'one', label: 'one', start: 0, end: source.length, quote: source }],
        candidate: { id: 'one', label: 'one', start: 0, end: source.length, quote: source }, canonicalSource: ACTOR_SOURCE, findings: [],
      })) as any,
      createAcceptedForgeActor: (async () => { actorCreates += 1; return actorCreateResult(); }) as any,
      createAcceptedForgeItem: (async () => { itemCreates += 1; throw new Error('Plaintext Actor reached Item adapter.'); }) as any,
    });
    root.mode.value = 'plaintext-actor';
    root.source.value = 'one plaintext creature';
    root.displayName.value = 'Plaintext Creature';

    await (application as any).analyze(root);
    expect((application as any).status).toBe('ready_to_generate');
    expect(root.generate.disabled).toBe(false);
    await (application as any).generate(root);
    expect((application as any).status).toBe('accepted');
    expect(root.create.disabled).toBe(false);
    await (application as any).create(root);
    expect(actorCreates).toBe(1);
    expect(itemCreates).toBe(0);
    expect((application as any).status).toBe('accepted');
  });

  test('routes accepted AI Item only to the Item adapter and does not change Actor creation state', async () => {
    let actorCreates = 0;
    let itemCreates = 0;
    const source = 'one AI Item source';
    const analysis = readyItemAnalysis(source);
    const { application, root } = makeApplication({
      createBrowserItemAiProvider: (() => ({})) as any,
      analyzeBrowserItemSourceWithAi: (async () => analysis) as any,
      generateAndReviewBrowserItemIntake: (async () => ({
        status: 'accepted', analysis, rawSourceHash: hashSource(source), finalSource: ITEM_SOURCE,
        finalSourceHash: acceptedItemResult().sourceIdentity.sourceHash, response: acceptedItem,
        itemProjection: acceptedItemResult().artifact, formalStatus: 'accepted',
        review: { schemaVersion: 1, verdict: 'accepted', findings: [] }, findings: [], stages: [],
        provider: analysis.provider, calls: { ...analysis.calls, review: 1 },
      })) as any,
      createAcceptedForgeActor: (async () => { actorCreates += 1; throw new Error('AI Item reached Actor adapter.'); }) as any,
      createAcceptedForgeItem: (async () => { itemCreates += 1; return itemCreateResult(); }) as any,
    });
    setAiForm(application, root, 'ai-item', source);
    await (application as any).analyze(root);
    await (application as any).generate(root);
    expect((application as any).status).toBe('accepted');
    await (application as any).create(root);
    expect(itemCreates).toBe(1);
    expect(actorCreates).toBe(0);
  });

  test('keeps needs_review, failed, rejected, and stale snapshots at zero world writes', async () => {
    let creates = 0;
    const source = 'review-required monster';
    const needs = { ...readyActorAnalysis(source), status: 'needs_review', findings: [blocking('EVIDENCE_DRIFT')] };
    const { application, root } = makeApplication({
      createBrowserAiProvider: (() => ({})) as any,
      analyzeBrowserActorSourceWithAi: (async () => needs) as any,
      createAcceptedForgeActor: (async () => { creates += 1; throw new Error('Blocked state reached Actor adapter.'); }) as any,
    });
    setAiForm(application, root, 'ai-monster', source);
    await (application as any).analyze(root);
    expect((application as any).status).toBe('needs_review');
    expect(root.create.disabled).toBe(true);
    await (application as any).create(root);
    expect(creates).toBe(0);
    (application as any).reject(root);
    expect((application as any).status).toBe('rejected');
    expect((application as any).response).toBeUndefined();

    (application as any).clear(root);
    root.mode.value = 'plaintext-actor';
    root.source.value = 'stale source';
    (application as any).analysis = { status: 'ready_to_generate', candidates: [], findings: [], canonicalSource: ACTOR_SOURCE };
    (application as any).snapshot = currentSnapshot(application, root);
    (application as any).status = 'accepted';
    (application as any).response = acceptedActor;
    (application as any).renderResult(root);
    root.source.value = 'changed source';
    root.source.oninput?.();
    expect((application as any).status).toBe('needs_review');
    expect((application as any).response).toBeUndefined();
    expect(root.diagnosticList.innerHTML).toContain('STALE_SNAPSHOT');
    await (application as any).create(root);
    expect(creates).toBe(0);
  });

  test('shows every ambiguous candidate but never selects or exports the first one', async () => {
    const source = 'candidate one and candidate two';
    const candidates = [
      { id: 'one', label: 'One', start: 0, end: 13, quote: 'candidate one' },
      { id: 'two', label: 'Two', start: 18, end: source.length, quote: 'candidate two' },
    ];
    const downloads: Array<{ fileName: string; content: string }> = [];
    const { application, root } = makeApplication({
      analyzePlaintextActorSource: (() => ({
        status: 'needs_review', rawSourceHash: hashSource(source), candidates,
        findings: [blocking('PLAINTEXT_MULTIPLE_ENTITIES')], errorCode: 'multiple_entities',
      })) as any,
      downloadReviewBundle: ((fileName: string, content: string) => downloads.push({ fileName, content })) as any,
    });
    root.mode.value = 'plaintext-actor';
    root.source.value = source;
    await (application as any).analyze(root);
    expect(root.candidate.textContent).toContain('"id": "one"');
    expect(root.candidate.textContent).toContain('"id": "two"');
    (application as any).exportBundle(root);
    expect(downloads).toHaveLength(1);
    const bundle = JSON.parse(downloads[0]!.content);
    expect(bundle).not.toHaveProperty('candidate');
    expect(bundle.status).toBe('needs_review');
    expect(bundle).not.toHaveProperty('candidateResponse');
  });

  test('records bounded repair/regenerate identity and never permits a second repair in one attempt', async () => {
    const source = 'repairable monster';
    const initial = { ...readyActorAnalysis(source), status: 'needs_review', findings: [blocking('REPAIR_ME')] };
    const repaired = { ...readyActorAnalysis(source), repairCount: 1 as const };
    let repairCalls = 0;
    const { application, root } = makeApplication({
      createBrowserAiProvider: (() => ({})) as any,
      analyzeBrowserActorSourceWithAi: (async () => initial) as any,
      repairBrowserActorIntake: (async () => { repairCalls += 1; return repaired; }) as any,
    });
    setAiForm(application, root, 'ai-monster', source);
    await (application as any).analyze(root);
    const attempt = (application as any).attemptId;
    await (application as any).repair(root);
    expect((application as any).status).toBe('ready_to_generate');
    expect((application as any).attemptId).toBe(attempt);
    expect(repairCalls).toBe(1);
    (application as any).status = 'needs_review';
    (application as any).renderResult(root);
    expect(root.repair.disabled).toBe(true);
    await (application as any).repair(root);
    expect(repairCalls).toBe(1);
    expect((application as any).history).toContainEqual(expect.objectContaining({ action: 'repair', attemptId: attempt }));
    await (application as any).regenerate(root);
    expect((application as any).attemptId).not.toBe(attempt);
    expect((application as any).history).toContainEqual(expect.objectContaining({ action: 'regenerate', attemptId: attempt }));
  });

  test('invalidates an active analysis immediately and prevents an old Promise from backfilling review state', async () => {
    const source = 'stale asynchronous monster';
    let resolveAnalysis!: (value: any) => void;
    const pendingAnalysis = new Promise<any>((resolve) => { resolveAnalysis = resolve; });
    const { application, root } = makeApplication({
      createBrowserAiProvider: (() => ({})) as any,
      analyzeBrowserActorSourceWithAi: (async () => await pendingAnalysis) as any,
    });
    setAiForm(application, root, 'ai-monster', source);
    const pending = (application as any).analyze(root);
    await Promise.resolve();
    root.source.value = `${source} changed`;
    root.source.oninput?.();
    expect((application as any).status).toBe('needs_review');
    expect((application as any).response).toBeUndefined();
    resolveAnalysis(readyActorAnalysis(source));
    await pending;
    expect((application as any).status).toBe('needs_review');
    expect((application as any).analysis).toBeUndefined();
    expect(root.diagnosticList.innerHTML).toContain('STALE_SNAPSHOT');
    expect(root.create.disabled).toBe(true);
  });

  test('cancels an active analysis before submission and leaves an auditable failed state', async () => {
    const source = 'cancelled monster';
    const { application, root } = makeApplication({
      createBrowserAiProvider: (() => ({})) as any,
      analyzeBrowserActorSourceWithAi: (async (_input: any, _provider: any, signal?: AbortSignal) => await new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })) as any,
    });
    setAiForm(application, root, 'ai-monster', source);
    const pending = (application as any).analyze(root);
    await Promise.resolve();
    (application as any).cancel();
    await pending;
    expect((application as any).status).toBe('failed');
    expect((application as any).response).toBeUndefined();
    expect(root.diagnosticList.innerHTML).toContain('INTAKE_CANCELLED');
    expect(root.create.disabled).toBe(true);
  });

  test('defaults a dismissed wait dialog to continue and cancels only after explicit user choice', async () => {
    const dialogs: any[] = [];
    let providerOptions: any;
    const { application, root } = makeApplication({
      createBrowserAiProvider: ((options: any) => { providerOptions = options; return {}; }) as any,
      analyzeBrowserActorSourceWithAi: (async (_input: any, _provider: any, signal?: AbortSignal) => await new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      })) as any,
    }, async (config) => {
      dialogs.push(config);
      return dialogs.length === 1 ? null : 'stop';
    });
    setAiForm(application, root, 'ai-monster', 'slow request');
    const pending = (application as any).analyze(root);
    await Promise.resolve();
    const requestSettled = new AbortController();
    const status = {
      phase: 'awaiting_response_headers', elapsedMs: 720_000, completedCycles: 4, decisionRound: 1,
      responseHeadersReceived: false, lastObservableProgressAtMs: Date.now() - 720_000,
      requestPending: true, browserReportedConnectionError: false, aiActivity: 'unknown',
      requestSettledSignal: requestSettled.signal,
    };

    expect(await providerOptions.waitPolicy.onDecision(status)).toBe('continue');
    expect((application as any).controller.signal.aborted).toBe(false);
    expect(dialogs[0].content).toContain('浏览器无法证明远端模型是否仍在思考');
    expect(dialogs[0].content).toContain('不会重发');
    expect(dialogs[0].buttons.map((button: any) => button.action)).toEqual(['continue', 'stop']);

    expect(await providerOptions.waitPolicy.onDecision({ ...status, completedCycles: 8, decisionRound: 2 })).toBe('stop');
    await pending;
    expect((application as any).status).toBe('failed');
    expect(root.diagnosticList.innerHTML).toContain('INTAKE_CANCELLED');
  });

  test('closes a stale wait dialog when the original request settles while it is open', async () => {
    const requestSettled = new AbortController();
    let closes = 0;
    const { application } = makeApplication({}, async (config) => await new Promise((resolve) => {
      const activeDialog = {
        close: async () => {
          closes += 1;
          resolve(config.close?.({}, activeDialog) ?? null);
        },
      };
      config.render?.({}, activeDialog);
    }));
    const decision = (application as any).promptAiWaitDecision({
      phase: 'reading_response_body', elapsedMs: 720_000, completedCycles: 4, decisionRound: 1,
      responseHeadersReceived: true, httpStatus: 200, lastObservableProgressAtMs: Date.now(),
      requestPending: true, browserReportedConnectionError: false, aiActivity: 'unknown',
      requestSettledSignal: requestSettled.signal,
    });
    requestSettled.abort();
    expect(await decision).toBe('continue');
    expect(closes).toBe(1);
  });

  test('detaches the stale-dialog listener when DialogV2 rejects after render', async () => {
    const requestSettled = new AbortController();
    let closes = 0;
    const { application, notifications } = makeApplication({}, async (config) => {
      config.render?.({}, { close: async () => { closes += 1; } });
      throw new Error('dialog render failure');
    });
    const decision = await (application as any).promptAiWaitDecision({
      phase: 'awaiting_response_headers', elapsedMs: 720_000, completedCycles: 4, decisionRound: 1,
      responseHeadersReceived: false, lastObservableProgressAtMs: Date.now(),
      requestPending: true, browserReportedConnectionError: false, aiActivity: 'unknown',
      requestSettledSignal: requestSettled.signal,
    });
    expect(decision).toBe('continue');
    requestSettled.abort();
    await Promise.resolve();
    expect(closes).toBe(0);
    expect(notifications.errors).toContain('AI 等待确认弹框失败；当前请求不会被系统自动结束，将继续等待。');
  });

  test('shares one module-level AI job slot across independent application owners', () => {
    const actorOwner = {};
    const itemOwner = {};
    try {
      expect(claimForgeAiJob(actorOwner)).toBe(true);
      expect(claimForgeAiJob(actorOwner)).toBe(true);
      expect(claimForgeAiJob(itemOwner)).toBe(false);
    } finally {
      releaseForgeAiJob(actorOwner);
      releaseForgeAiJob(itemOwner);
    }
    expect(claimForgeAiJob(itemOwner)).toBe(true);
    releaseForgeAiJob(itemOwner);
  });

  test('projects formal plaintext warnings to blocking findings and retains no nonaccepted response', async () => {
    const source = 'formal warning plaintext';
    const warningResponse = structuredClone(acceptedActor) as any;
    warningResponse.result.status = 'needs_review';
    warningResponse.result.diagnostics = [{
      code: 'FORMAL_WARNING', severity: 'warning', stage: 'semantic', path: '/actor', message: 'Formal review required.',
    }];
    delete warningResponse.result.artifactHash;
    const { application, root } = makeApplication({
      analyzePlaintextActorSource: ((raw: string) => ({
        status: 'ready_to_generate', rawSourceHash: hashSource(raw), candidates: [{ id: 'one', label: 'one', start: 0, end: raw.length, quote: raw }],
        candidate: { id: 'one', label: 'one', start: 0, end: raw.length, quote: raw }, canonicalSource: ACTOR_SOURCE, findings: [],
      })) as any,
      convertFinalActorSource: (async () => warningResponse) as any,
    });
    root.mode.value = 'plaintext-actor';
    root.source.value = source;
    await (application as any).analyze(root);
    await (application as any).generate(root);
    expect((application as any).status).toBe('needs_review');
    expect((application as any).response).toBeUndefined();
    expect(JSON.stringify((application as any).generation)).not.toContain('artifactHash');
    expect((application as any).generation.findings).toContainEqual(expect.objectContaining({
      code: 'FORMAL_WARNING', blocking: true, origin: 'formal-workflow',
    }));
    expect(root.create.disabled).toBe(true);
  });

  test('exports a stable safe review bundle with exact source and no credentials or endpoint secret', async () => {
    const source = 'bundle source';
    const analysis = { ...readyActorAnalysis(source), provider: {
      ...readyActorAnalysis(source).provider,
      apiKey: 'must-not-export',
      endpoint: 'https://provider.example/v1?secret=query-secret',
      rawResponse: { Authorization: 'Bearer must-not-export' },
    } };
    const downloads: Array<{ fileName: string; content: string }> = [];
    const { application, root } = makeApplication({
      createBrowserAiProvider: (() => ({})) as any,
      analyzeBrowserActorSourceWithAi: (async () => analysis) as any,
      downloadReviewBundle: ((fileName: string, content: string) => downloads.push({ fileName, content })) as any,
    });
    setAiForm(application, root, 'ai-monster', source);
    root.endpoint.value = 'https://provider.example/v1?secret=query-secret';
    root.apiKey.value = 'must-not-export';
    authorizeAiConnection(application, root);
    await (application as any).analyze(root);
    (application as any).exportBundle(root);
    expect(downloads).toHaveLength(1);
    const exported = downloads[0]!.content;
    const bundle = JSON.parse(exported);
    expect(bundle.rawSource).toBe(source);
    expect(bundle.rawSourceHash).toBe(hashSource(source));
    expect(bundle.provider).toMatchObject({ name: 'fake-monster', extractionModel: 'extract', reviewModel: 'review' });
    expect(bundle.target).toMatchObject({
      generatorVersion: '0.1.0', fvttVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3',
      generatorProfile: 'v14', effectProfile: 'core', iconMode: 'off',
    });
    expect(exported).not.toMatch(/must-not-export|query-secret|Authorization|rawResponse|endpoint/iu);
    expect(exported.endsWith('\n')).toBe(true);
    expect(bundle.version).toBe(2);
    expect(decodeForgeIntakeReviewBundleText(exported).bundle.rawSource).toBe(source);
  });

  test('imports historical accepted bundles as read-only records with zero Provider and world side effects', async () => {
    let providerCalls = 0;
    let actorCreates = 0;
    let itemCreates = 0;
    const downloads: Array<{ fileName: string; content: string }> = [];
    const { application, root, notifications } = makeApplication({
      createBrowserAiProvider: (() => { providerCalls += 1; return {}; }) as any,
      createAcceptedForgeActor: (async () => { actorCreates += 1; return actorCreateResult(); }) as any,
      createAcceptedForgeItem: (async () => { itemCreates += 1; return itemCreateResult(); }) as any,
      downloadReviewBundle: ((fileName: string, content: string) => downloads.push({ fileName, content })) as any,
    });
    root.source.value = 'existing live draft';
    root.reviewBundleFile.files = [reviewBundleFile(acceptedReviewBundleText())];

    await (application as any).importBundle(root);

    expect((application as any).importedReview.bundle.status).toBe('accepted');
    expect((application as any).status).toBe('empty');
    expect(root.source.value).toBe('existing live draft');
    expect(root.status.textContent).toContain('只读历史状态：accepted');
    expect(root.humanSummary.textContent).toContain('不能直接 Confirm Create');
    expect(root.rawSource.textContent).toBe('Rat source');
    expect(root.json.textContent).toContain('不包含可提交的完整');
    expect(root.create.disabled).toBe(true);
    await (application as any).create(root);
    expect({ providerCalls, actorCreates, itemCreates }).toEqual({ providerCalls: 0, actorCreates: 0, itemCreates: 0 });
    (application as any).exportBundle(root);
    expect(JSON.parse(downloads[0]!.content).version).toBe(2);
    expect(notifications.infos).toContain('Review bundle 已作为只读历史记录导入；历史状态为 accepted，不能直接创建。');
  });

  test('does not let imported hidden key-clear handlers mutate client settings', async () => {
    const { application, root } = makeApplication();
    (application as any).settings = { ...(application as any).settings, apiKey: 'keep-me', persistApiKey: true, savedApiKeys: { profile: 'keep-me' } };
    root.reviewBundleFile.files = [reviewBundleFile(acceptedReviewBundleText())];
    await (application as any).importBundle(root);
    const before = structuredClone((application as any).settings);

    root.clearKey.onclick?.();
    root.clearAllKeys.onclick?.();

    expect((application as any).settings).toEqual(before);
    expect(root.clearKey.disabled).toBe(true);
    expect(root.clearAllKeys.disabled).toBe(true);
  });

  test('does not let imported hidden connection toggles reveal keys or mutate the preserved live attempt', async () => {
    const { application, root } = makeApplication();
    root.apiKey.value = 'keep-secret';
    root.apiKey.type = 'password';
    root.endpoint.value = 'https://provider.example/v1';
    root.mode.value = 'plaintext-actor';
    root.source.value = 'preserved source';
    root.displayName.value = 'Preserved';
    const snapshot = currentSnapshot(application, root);
    (application as any).status = 'accepted';
    (application as any).response = acceptedActor;
    (application as any).snapshot = snapshot;
    (application as any).analysis = { status: 'ready_to_generate', candidates: [], findings: [], canonicalSource: ACTOR_SOURCE };
    root.reviewBundleFile.files = [reviewBundleFile(acceptedReviewBundleText())];
    await (application as any).importBundle(root);

    root.toggleKey.onclick?.();
    root.toggleEndpoint.onclick?.();

    expect(root.apiKey.type).toBe('password');
    expect(root.endpoint.value).toBe('https://provider.example/v1');
    expect((application as any).status).toBe('accepted');
    expect((application as any).response).toBe(acceptedActor);
    expect((application as any).snapshot).toBe(snapshot);
    expect(root.toggleKey.disabled).toBe(true);
    expect(root.toggleEndpoint.disabled).toBe(true);
  });

  test('sanitizes malicious decoder errors before sending them to Foundry notifications', async () => {
    const malicious = JSON.parse(acceptedReviewBundleText());
    malicious['<img src=x onerror=alert(1)>'] = true;
    const { application, root, notifications } = makeApplication();
    root.reviewBundleFile.files = [reviewBundleFile(JSON.stringify(malicious))];

    await (application as any).importBundle(root);

    expect((application as any).importedReview).toBeUndefined();
    expect(notifications.errors.at(-1)).toMatch(/unknown key/u);
    expect(notifications.errors.at(-1)).not.toContain('<img');
  });

  test('hard-gates hidden live generation and connection actions while an imported record is open', async () => {
    let conversions = 0;
    let connectionTests = 0;
    const { application, root, notifications } = makeApplication({
      convertFinalActorSource: (async () => { conversions += 1; return acceptedActor; }) as any,
      testForgeProviderConnection: (async () => { connectionTests += 1; return { status: 'failed', models: [], message: 'unexpected' }; }) as any,
    });
    root.mode.value = 'plaintext-actor';
    root.source.value = 'live ready source';
    root.displayName.value = 'Live Ready';
    (application as any).analysis = { status: 'ready_to_generate', candidates: [], findings: [], canonicalSource: ACTOR_SOURCE };
    (application as any).snapshot = currentSnapshot(application, root);
    (application as any).reviewSource = root.source.value;
    (application as any).requestId = 'live-ready-request';
    (application as any).attemptId = 'live-ready-attempt';
    (application as any).status = 'ready_to_generate';
    root.reviewBundleFile.files = [reviewBundleFile(acceptedReviewBundleText())];
    await (application as any).importBundle(root);

    await (application as any).generate(root);
    await (application as any).testConnection(root);
    await (application as any).runAnalysis(root, false);
    expect({ conversions, connectionTests }).toEqual({ conversions: 0, connectionTests: 0 });
    expect((application as any).status).toBe('ready_to_generate');
    expect((application as any).response).toBeUndefined();
    expect(root.generate.disabled).toBe(true);
    expect(root.create.disabled).toBe(true);
  });

  test('rejects invalid imports atomically without replacing a live accepted attempt or calling external services', async () => {
    let externalCalls = 0;
    const { application, root, notifications } = makeApplication({
      readReviewBundleFile: (async () => '{"schema":"forge-intake-review-bundle","version":99}') as any,
      createBrowserAiProvider: (() => { externalCalls += 1; return {}; }) as any,
      createAcceptedForgeActor: (async () => { externalCalls += 1; return actorCreateResult(); }) as any,
    });
    root.mode.value = 'plaintext-actor';
    root.source.value = 'live source';
    root.displayName.value = 'Live Actor';
    (application as any).analysis = { status: 'ready_to_generate', candidates: [], findings: [], canonicalSource: ACTOR_SOURCE };
    (application as any).snapshot = currentSnapshot(application, root);
    (application as any).reviewSource = root.source.value;
    (application as any).requestId = 'live-request';
    (application as any).attemptId = 'live-attempt';
    (application as any).status = 'accepted';
    (application as any).response = acceptedActor;
    root.reviewBundleFile.files = [reviewBundleFile('ignored')];
    (application as any).renderResult(root);
    expect(root.create.disabled).toBe(false);

    await (application as any).importBundle(root);

    expect((application as any).importedReview).toBeUndefined();
    expect((application as any).status).toBe('accepted');
    expect((application as any).response).toBe(acceptedActor);
    expect((application as any).requestId).toBe('live-request');
    expect(root.create.disabled).toBe(false);
    expect(externalCalls).toBe(0);
    expect(notifications.errors.at(-1)).toMatch(/version/u);
  });

  test('rejects an oversized File before reading its contents', async () => {
    let textReads = 0;
    const { application, root, notifications } = makeApplication();
    root.reviewBundleFile.files = [{
      size: FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES + 1,
      text: async () => { textReads += 1; return acceptedReviewBundleText(); },
    } as File];

    await (application as any).importBundle(root);

    expect(textReads).toBe(0);
    expect((application as any).importedReview).toBeUndefined();
    expect(notifications.errors.at(-1)).toMatch(/不能超过/u);
  });

  test('creates only a recovery draft, then assigns fresh identities on explicit Analyze and exports lineage', async () => {
    const downloads: Array<{ fileName: string; content: string }> = [];
    let analyses = 0;
    const { application, root, notifications } = makeApplication({
      analyzePlaintextActorSource: ((source: string) => {
        analyses += 1;
        return {
          status: 'ready_to_generate', rawSourceHash: hashSource(source),
          candidates: [{ id: 'rat', label: 'Rat', start: 0, end: 3, quote: 'Rat' }],
          candidate: { id: 'rat', label: 'Rat', start: 0, end: 3, quote: 'Rat' },
          canonicalSource: ACTOR_SOURCE, findings: [],
        };
      }) as any,
      downloadReviewBundle: ((fileName: string, content: string) => downloads.push({ fileName, content })) as any,
    });
    root.reviewBundleFile.files = [reviewBundleFile(plaintextReviewBundleText())];
    await (application as any).importBundle(root);
    expect(notifications.infos).toContain('Review bundle 已作为只读历史记录导入；历史状态为 needs_review，不能直接创建。');
    const oldRequestId = (application as any).importedReview.bundle.requestId;
    const oldAttemptId = (application as any).importedReview.bundle.attemptId;

    (application as any).startNewAttempt(root);
    expect(analyses).toBe(0);
    expect((application as any).importedReview).toBeUndefined();
    expect((application as any).status).toBe('empty');
    expect((application as any).requestId).toBe('');
    expect((application as any).attemptId).toBe('');
    expect((application as any).history).toEqual([]);
    expect(root.source.value).toBe('Rat source');
    expect(root.displayName.value).toBe('Rat');
    expect(root.mode.value).toBe('plaintext-actor');

    await (application as any).analyze(root);
    expect(analyses).toBe(1);
    expect((application as any).requestId).not.toBe(oldRequestId);
    expect((application as any).attemptId).not.toBe(oldAttemptId);
    expect((application as any).status).toBe('ready_to_generate');
    (application as any).exportBundle(root);
    const exported = JSON.parse(downloads[0]!.content);
    expect(exported.version).toBe(2);
    expect(exported.recoveredFrom).toMatchObject({ requestId: oldRequestId, attemptId: oldAttemptId, status: 'needs_review' });
    expect(exported.calls).toEqual({ discovery: 0, extraction: 0, review: 0, repair: 0 });
    expect(exported.repairCount).toBe(0);
    expect(exported.history).toEqual([]);
  });

  test('rechecks GM authority after async file reading and leaves the current workspace untouched', async () => {
    let finishRead!: (value: string) => void;
    const pendingRead = new Promise<string>((resolve) => { finishRead = resolve; });
    const { application, root, game, notifications } = makeApplication({
      readReviewBundleFile: (async () => await pendingRead) as any,
    });
    root.source.value = 'preserve me';
    root.reviewBundleFile.files = [reviewBundleFile('pending')];
    const pending = (application as any).importBundle(root);
    game.user.isGM = false;
    finishRead(acceptedReviewBundleText());
    await pending;

    expect((application as any).importedReview).toBeUndefined();
    expect(root.source.value).toBe('preserve me');
    expect(notifications.errors.at(-1)).toMatch(/GM/u);
  });

  test('shows target-incompatible history but blocks both visible and hidden fresh-attempt actions', async () => {
    const incompatible = JSON.parse(plaintextReviewBundleText());
    incompatible.target.fvttVersion = '14.365';
    const { application, root, notifications } = makeApplication();
    root.source.value = 'live draft';
    root.reviewBundleFile.files = [reviewBundleFile(JSON.stringify(incompatible))];
    await (application as any).importBundle(root);

    expect((application as any).importedReview).toBeDefined();
    expect(root.startNewAttempt.disabled).toBe(true);
    (application as any).startNewAttempt(root);
    expect((application as any).importedReview).toBeDefined();
    expect(root.source.value).toBe('live draft');
    expect(notifications.errors.at(-1)).toMatch(/target.*不兼容/u);
  });

  test('requires an explicit non-empty display name before a recovered draft can analyze', async () => {
    let analyses = 0;
    const bundle = JSON.parse(plaintextReviewBundleText());
    delete bundle.candidate;
    const { application, root, notifications } = makeApplication({
      analyzePlaintextActorSource: ((source: string) => { analyses += 1; return readyActorAnalysis(source); }) as any,
    });
    root.reviewBundleFile.files = [reviewBundleFile(JSON.stringify(bundle))];
    await (application as any).importBundle(root);
    (application as any).startNewAttempt(root);
    expect(root.displayName.value).toBe('');

    await (application as any).analyze(root);
    expect(analyses).toBe(0);
    expect((application as any).requestId).toBe('');
    expect(notifications.errors.at(-1)).toMatch(/显示名称/u);
  });

  test('rechecks GM authority at click time and blocks accepted creation after authority loss', async () => {
    let creates = 0;
    const { application, root, game } = makeApplication({
      createAcceptedForgeActor: (async () => { creates += 1; return actorCreateResult(); }) as any,
    });
    root.mode.value = 'plaintext-actor';
    root.source.value = 'gm source';
    (application as any).analysis = { status: 'ready_to_generate', candidates: [], findings: [], canonicalSource: ACTOR_SOURCE };
    (application as any).snapshot = currentSnapshot(application, root);
    (application as any).reviewSource = root.source.value;
    (application as any).status = 'accepted';
    (application as any).response = acceptedActor;
    game.user.isGM = false;
    (application as any).renderResult(root);
    expect(root.create.disabled).toBe(true);
    await (application as any).create(root);
    expect(creates).toBe(0);
  });
});

function makeApplication(
  services: Partial<ForgeIntakeApplicationServices> = {},
  dialogWait?: (config: any) => Promise<unknown>,
) {
  const notifications = { errors: [] as string[], infos: [] as string[] };
  const game = { version: '14.364', system: { id: 'dnd5e', version: '5.3.3' }, user: { isGM: true } };
  const environment = {
    game,
    foundry: { applications: { api: {
      ApplicationV2: class { async close() {} },
      HandlebarsApplicationMixin: (Base: any) => class extends Base {},
      ...(dialogWait ? { DialogV2: { wait: dialogWait } } : {}),
    } } },
    ui: { notifications: { error: (message: string) => notifications.errors.push(message), info: (message: string) => notifications.infos.push(message) } },
    services,
  };
  const Application = createForgeIntakeApplicationClass(environment);
  const application: any = new Application();
  const root = new FakeRoot();
  application.element = root;
  (globalThis as any).document = { activeElement: null };
  application._onRender({}, {});
  return { application, root, notifications, game };
}

function readyActorAnalysis(source: string): any {
  const candidate = { id: 'monster', label: 'Monster', start: 0, end: source.length, quote: source };
  return {
    status: 'ready_to_generate', attemptId: 'injected', rawSourceHash: hashSource(source), candidates: [candidate], candidate,
    ir: { source: { sha256: hashSource(source), length: source.length }, claims: [], coverage: [], uncertainties: [] },
    validation: { findings: [], blocking: [], warnings: [] }, evidence: { candidate, source: { sha256: hashSource(source), length: source.length }, claims: [], coverage: [], uncertainties: [] },
    findings: [], stages: [], provider: { providerName: 'fake-monster', extractionModel: 'extract', reviewModel: 'review', promptVersions: { discover: 'd', extract: 'e', review: 'v', repair: 'r' } },
    calls: { discovery: 1, extraction: 1, review: 0, repair: 0 }, repairCount: 0,
  };
}

function readyItemAnalysis(source: string): any {
  const candidate = { id: 'item', label: 'Item', start: 0, end: source.length, quote: source };
  return {
    status: 'ready_to_generate', attemptId: 'injected', rawSourceHash: hashSource(source), candidates: [candidate], candidate,
    ir: { schemaVersion: 1, source: { sha256: hashSource(source), length: source.length }, item: { name: 'Item', type: '饰物', abilities: [] }, claims: [], coverage: [], uncertainties: [] },
    validation: { findings: [], blocking: [], warnings: [] }, findings: [], stages: [],
    provider: { providerName: 'fake-item', extractionModel: 'extract', reviewModel: 'review', promptVersions: { discover: 'd', extract: 'e', review: 'v', repair: 'r' } },
    calls: { discovery: 1, extraction: 1, review: 0, repair: 0 }, repairCount: 0,
  };
}

function blocking(code: string) { return { id: code, code, path: '/', message: code, blocking: true, origin: 'evidence' }; }
function acceptedItemResult(): any { if (!('result' in acceptedItem)) throw new Error('Missing Item result.'); return acceptedItem.result; }
function actorCreateResult(): any { return { status: 'created', actor: {}, uuid: 'Actor.intake', sourceId: 'actor:v1:123e4567-e89b-42d3-a456-426614174000', artifactHash: 'a'.repeat(64) }; }
function itemCreateResult(): any { return { status: 'created', item: {}, uuid: 'Item.intake', sourceId: 'item:v1:123e4567-e89b-42d3-a456-426614174000', artifactHash: 'b'.repeat(64) }; }
function setAiForm(application: any, root: FakeRoot, mode: 'ai-monster' | 'ai-item', source: string) {
  root.mode.value = mode;
  root.source.value = source;
  root.displayName.value = 'Review object';
  root.provider.value = 'custom';
  root.endpoint.value = 'https://provider.example/v1';
  root.protocol.value = 'openai-chat';
  root.authScheme.value = 'bearer';
  root.region.value = '';
  root.reasoning.value = 'auto';
  root.structuredOutput.value = 'prompt_fallback';
  root.model.value = 'extract';
  root.reviewModel.value = 'review';
  root.apiKey.value = 'transient';
  authorizeAiConnection(application, root);
}
function authorizeAiConnection(application: any, root: FakeRoot) {
  (application as any).connectionProbe = { status: 'connected', providerId: 'custom', protocol: root.protocol.value, model: root.model.value, models: [], capabilities: {}, message: 'test connection' };
  (application as any).connectionProbeRevision = (application as any).connectionCredentialRevision;
  (application as any).connectionProbeIdentity = JSON.stringify({ providerId: 'custom', endpoint: root.endpoint.value, protocol: root.protocol.value, authScheme: root.authScheme.value, region: root.region.value, model: root.model.value, reviewModel: root.model.value, useSeparateReviewModel: false, reasoning: root.reasoning.value, structuredOutput: root.structuredOutput.value });
}
function currentSnapshot(_application: any, root: FakeRoot): any {
  return createForgeIntakeSnapshot({
    source: root.source.value,
    displayName: root.displayName.value,
    mode: root.mode.value as any,
    objectKind: root.mode.value === 'ai-item' ? 'item' : 'actor',
    endpoint: root.mode.value === 'plaintext-actor' ? '' : root.endpoint.value,
    model: root.mode.value === 'plaintext-actor' ? '' : root.model.value,
    reviewModel: root.mode.value === 'plaintext-actor' ? '' : root.reviewModel.value || root.model.value,
    fvttVersion: '14.364', systemVersion: '5.3.3', effectProfile: 'core', iconMode: 'off',
  });
}

class FakeRoot {
  mode = control('plaintext-actor', 'select'); source = control('', 'textarea'); displayName = control('');
  provider = control('openai', 'select'); endpoint = control(''); protocol = control('openai-responses', 'select'); authScheme = control('bearer', 'select'); region = control('', 'select'); reasoning = control('auto', 'select'); structuredOutput = control('json_schema', 'select');
  model = control(''); reviewModel = control(''); apiKey = control('', 'password'); persistApiKey = control('', 'checkbox'); useSeparateReviewModel = control('', 'checkbox'); aiSettings = control('');
  reviewBundleFile = control('', 'file'); import = control(''); startNewAttempt = control('');
  analyze = control(''); repair = control(''); generate = control(''); regenerate = control(''); reject = control(''); cancel = control(''); clear = control(''); export = control(''); create = control(''); clearKey = control(''); clearAllKeys = control(''); toggleKey = control(''); toggleEndpoint = control('');
  status = control(''); humanSummary = control(''); stages = control(''); diagnostics = control(''); diagnosticList = control(''); previewSection = control(''); activityCard = control(''); candidate = control(''); evidence = control(''); metadata = control(''); canonical = control(''); rawSource = control(''); preview = control(''); json = control('');
  querySelector(selector: string): any {
    return ({
      '[name="mode"]': this.mode, '[name="source"]': this.source, '[name="displayName"]': this.displayName, '[name="provider"]': this.provider, '[name="endpoint"]': this.endpoint,
      '[name="protocol"]': this.protocol, '[name="authScheme"]': this.authScheme, '[name="region"]': this.region, '[name="reasoning"]': this.reasoning, '[name="structuredOutput"]': this.structuredOutput,
      '[name="model"]': this.model, '[name="reviewModel"]': this.reviewModel, '[name="apiKey"]': this.apiKey, '[name="persistApiKey"]': this.persistApiKey, '[name="useSeparateReviewModel"]': this.useSeparateReviewModel,
      '[name="reviewBundleFile"]': this.reviewBundleFile,
      '[data-ai-settings]': this.aiSettings, '[data-action="analyze"]': this.analyze, '[data-action="repair"]': this.repair, '[data-action="generate"]': this.generate,
      '[data-action="regenerate"]': this.regenerate, '[data-action="reject"]': this.reject, '[data-action="cancel"]': this.cancel, '[data-action="clear"]': this.clear,
      '[data-action="export"]': this.export, '[data-action="create"]': this.create, '[data-action="clear-key"]': this.clearKey,
      '[data-action="clear-all-keys"]': this.clearAllKeys,
      '[data-action="toggle-key"]': this.toggleKey, '[data-action="toggle-endpoint"]': this.toggleEndpoint,
      '[data-action="import"]': this.import, '[data-action="start-new-attempt"]': this.startNewAttempt,
      '[data-status]': this.status, '[data-stages]': this.stages, '[data-diagnostics]': this.diagnostics, '[data-diagnostic-list]': this.diagnosticList,
      '[data-human-summary]': this.humanSummary, '[data-activity-card]': this.activityCard,
      '[data-preview-section]': this.previewSection, '[data-candidate]': this.candidate, '[data-evidence]': this.evidence, '[data-metadata]': this.metadata,
      '[data-canonical]': this.canonical, '[data-raw-source]': this.rawSource, '[data-preview]': this.preview, '[data-json]': this.json,
    } as Record<string, any>)[selector] ?? null;
  }
}
function control(value: string, type = 'button'): any { return { value, type, checked: false, files: undefined, disabled: false, hidden: false, textContent: '', innerHTML: '', onclick: undefined, onchange: undefined, oninput: undefined }; }

function reviewBundleFile(content: string): File {
  return { size: new TextEncoder().encode(content).byteLength, text: async () => content } as File;
}

function acceptedReviewBundleText(): string {
  const rawSource = 'Rat source';
  const sourceId = 'actor:v1:123e4567-e89b-42d3-a456-426614174000';
  const canonicalSource = `---\nforge-source-id: ${sourceId}\n---\n${rawSource}`;
  return serializeForgeIntakeReviewBundle(buildForgeIntakeReviewBundle({
    objectKind: 'actor', mode: 'ai-monster', requestId: 'old-request', attemptId: 'old-attempt', status: 'accepted',
    rawSource, rawSourceHash: hashSource(rawSource), candidate: { id: 'rat', label: 'Rat', start: 0, end: 3, quote: 'Rat' },
    reviewVerdict: 'accepted',
    deterministicFindings: [], aiReviewFindings: [], calls: { discovery: 1, extraction: 1, review: 1, repair: 0 }, repairCount: 0,
    canonicalSource, sourceIdentity: { sourceId, finalSourceHash: hashSource(canonicalSource) },
    target: { generatorVersion: '0.1.0', fvttVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3', generatorProfile: 'v14', effectProfile: 'core', iconMode: 'off' },
    candidateResponse: { requestId: 'old-request', status: 'accepted', artifactHash: hashSource('historical-artifact'), verificationStatus: 'accepted', diagnostics: [] },
    history: [],
  }));
}

function plaintextReviewBundleText(): string {
  const rawSource = 'Rat source';
  return serializeForgeIntakeReviewBundle(buildForgeIntakeReviewBundle({
    objectKind: 'actor', mode: 'plaintext-actor', requestId: 'old-plaintext-request', attemptId: 'old-plaintext-attempt', status: 'needs_review',
    rawSource, rawSourceHash: hashSource(rawSource), candidate: { id: 'rat', label: 'Rat', start: 0, end: 3, quote: 'Rat' },
    deterministicFindings: [], aiReviewFindings: [], calls: { discovery: 9, extraction: 9, review: 9, repair: 1 }, repairCount: 1,
    target: { generatorVersion: '0.1.0', fvttVersion: '14.364', systemId: 'dnd5e', systemVersion: '5.3.3', generatorProfile: 'v14', effectProfile: 'core', iconMode: 'off' },
    history: [{ sequence: 1, action: 'repair', attemptId: 'old-plaintext-attempt', resultingStatus: 'needs_review' }],
  }));
}
