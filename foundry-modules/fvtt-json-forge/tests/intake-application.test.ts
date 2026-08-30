import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  buildForgeActorRequest,
  buildForgeItemRequest,
  convertFinalActorSource,
  convertFinalItemSource,
} from '@fvtt-json-generator/forge-browser-runtime';
import { hashArtifact, hashSource, type ForgeActorResponse, type ForgeItemResponse } from '@fvtt-json-generator/forge-gateway-protocol';
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
  ManagedForgeSourceLibrary,
  MemoryForgeSourceLibraryStore,
  serializeForgeSourceLibrary,
  type ForgeSourceLibraryStore,
} from '@fvtt-json-generator/forge-browser-runtime/source-library';
import {
  ManagedForgeBatchQueue,
  MemoryForgeBatchQueueStore,
  type ForgeBatchQueueStore,
} from '@fvtt-json-generator/forge-browser-runtime/batch-queue';
import {
  createForgeBatchCollection,
  serializeForgeBatchCollection,
} from '@fvtt-json-generator/forge-browser-runtime/batch-collection';
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

  test('never starts generation after GM authority or the exact runtime changes following analysis', async () => {
    for (const drift of ['gm', 'runtime'] as const) {
      let generations = 0;
      const source = `drift-${drift}`;
      const analysis = readyItemAnalysis(source);
      const { application, root, game } = makeApplication({
        createBrowserItemAiProvider: (() => ({})) as any,
        analyzeBrowserItemSourceWithAi: (async () => analysis) as any,
        generateAndReviewBrowserItemIntake: (async () => { generations += 1; throw new Error('Stale authority reached generation.'); }) as any,
      });
      setAiForm(application, root, 'ai-item', source);
      await (application as any).analyze(root);
      expect((application as any).status).toBe('ready_to_generate');
      if (drift === 'gm') game.user.isGM = false;
      else game.version = '14.365';
      await (application as any).generate(root);
      expect(generations).toBe(0);
      expect((application as any).status).toBe('ready_to_generate');
    }
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

  test('persists a managed source across application sessions and opens it only as an unanalysed draft', async () => {
    let providerCalls = 0;
    let worldCreates = 0;
    const shared = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const first = makeApplication({
      createBrowserAiProvider: (() => { providerCalls += 1; return {}; }) as any,
      createAcceptedForgeActor: (async () => { worldCreates += 1; return actorCreateResult(); }) as any,
    }, undefined, shared);
    await settleLibrary(first.application, first.root);
    first.root.mode.value = 'plaintext-actor';
    first.root.displayName.value = 'Persistent Rat';
    first.root.source.value = 'Persistent rat source';
    await (first.application as any).saveToLibrary(first.root);
    expect((first.application as any).libraryState.sources).toHaveLength(1);
    await first.application.close();

    const second = makeApplication({}, undefined, shared);
    await settleLibrary(second.application, second.root);
    const id = (second.application as any).libraryState.sources[0].id;
    (second.application as any).openLibrarySource(second.root, id);
    expect(second.root.source.value).toBe('Persistent rat source');
    expect(second.root.displayName.value).toBe('Persistent Rat');
    expect((second.application as any).status).toBe('empty');
    expect((second.application as any).requestId).toBe('');
    expect((second.application as any).analysis).toBeUndefined();
    expect(providerCalls).toBe(0);
    expect(worldCreates).toBe(0);
  });

  test('saves an imported accepted review and reopens it through the E1 read-only gate with zero external side effects', async () => {
    let providerCalls = 0;
    let actorCreates = 0;
    let itemCreates = 0;
    const shared = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const { application, root } = makeApplication({
      createBrowserAiProvider: (() => { providerCalls += 1; return {}; }) as any,
      createAcceptedForgeActor: (async () => { actorCreates += 1; return actorCreateResult(); }) as any,
      createAcceptedForgeItem: (async () => { itemCreates += 1; return itemCreateResult(); }) as any,
    }, undefined, shared);
    await settleLibrary(application, root);
    root.reviewBundleFile.files = [reviewBundleFile(acceptedReviewBundleText())];
    await (application as any).importBundle(root);
    await (application as any).saveToLibrary(root);
    const reviewId = (application as any).libraryState.reviews[0].id;
    (application as any).clear(root);
    expect((application as any).importedReview).toBeUndefined();
    (application as any).openLibraryReview(root, reviewId);
    expect((application as any).importedReview).toBeDefined();
    expect(root.status.textContent).toBe('导入的只读历史状态：accepted');
    expect(root.create.disabled).toBe(true);
    await (application as any).create(root);
    expect(providerCalls).toBe(0);
    expect(actorCreates).toBe(0);
    expect(itemCreates).toBe(0);
  });

  test('exports and strict-imports a portable library without credentials or world effects', async () => {
    const downloads: Array<{ fileName: string; content: string }> = [];
    const firstLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const first = makeApplication({ downloadReviewBundle: ((fileName: string, content: string) => downloads.push({ fileName, content })) as any }, undefined, firstLibrary);
    await settleLibrary(first.application, first.root);
    first.root.mode.value = 'plaintext-actor';
    first.root.displayName.value = '<img src=x onerror=alert(1)>';
    first.root.source.value = 'Portable source';
    first.root.apiKey.value = 'must-not-export';
    await (first.application as any).saveToLibrary(first.root);
    (first.application as any).renderLibrary(first.root);
    expect(first.root.libraryList.innerHTML).not.toContain('<img');
    expect(first.root.libraryList.innerHTML).toContain('&lt;img');
    (first.application as any).exportLibrary(first.root);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.content).not.toContain('must-not-export');
    expect(downloads[0]!.content).not.toMatch(/apiKey|Authorization|rawResponse/iu);

    const second = makeApplication({}, undefined, new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore()));
    await settleLibrary(second.application, second.root);
    second.root.sourceLibraryFile.files = [reviewBundleFile(downloads[0]!.content)];
    await (second.application as any).importLibrary(second.root);
    expect((second.application as any).libraryState.sources).toHaveLength(1);
    expect((second.application as any).libraryState.sources[0].rawSource).toBe('Portable source');
  });

  test('rechecks GM authority for hidden library actions and preserves the stored library after authority loss', async () => {
    const shared = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const { application, root, game, notifications } = makeApplication({}, undefined, shared);
    await settleLibrary(application, root);
    root.mode.value = 'plaintext-actor';
    root.source.value = 'GM-only source';
    game.user.isGM = false;
    await (application as any).saveToLibrary(root);
    expect((await shared.load()).sources).toEqual([]);
    expect(notifications.errors.at(-1)).toMatch(/GM/u);
  });

  test('immediately hides populated library and batch metadata on idle authority or runtime hook changes', async () => {
    for (const drift of ['gm', 'runtime'] as const) {
      const sourceLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
      await sourceLibrary.saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Sensitive library label', rawSource: 'sensitive library source' });
      const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
      await batchQueue.importCollection(createForgeBatchCollection({
        label: 'Sensitive batch label',
        entries: [{ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Sensitive job label', rawSource: 'sensitive batch source' }],
      }));
      const { application, root, game, hooks } = makeApplication({}, undefined, sourceLibrary, undefined, batchQueue);
      await settleLibrary(application, root);
      await settleBatch(application, root);
      (application as any).renderLibrary(root);
      (application as any).renderBatch(root);
      expect(root.libraryList.innerHTML).toContain('Sensitive library label');
      expect(root.batchList.innerHTML).toContain('Sensitive batch label');

      if (drift === 'gm') game.user.isGM = false;
      else game.version = '14.365';
      hooks.call(drift === 'gm' ? 'updateUser' : 'updateSetting');

      expect(root.librarySummary.textContent).toContain('仅对当前精确 runtime 的 GM 可见');
      expect(root.libraryList.innerHTML).toBe('<p>Library metadata 已隐藏。</p>');
      expect(root.batchSummary.textContent).toContain('仅对当前精确 runtime 的 GM 可见');
      expect(root.batchList.innerHTML).toBe('<p>Queue metadata 已隐藏。</p>');
      expect(root.libraryRefresh.disabled).toBe(true);
      expect(root.sourceLibraryFile.disabled).toBe(true);
      expect(root.batchRefresh.disabled).toBe(true);
      expect(root.batchCollectionFile.disabled).toBe(true);
    }
  });

  test('rechecks GM authority after an async library refresh before replacing visible state', async () => {
    const base = new MemoryForgeSourceLibraryStore();
    let armed = false;
    let gameRef: any;
    const store: ForgeSourceLibraryStore = {
      load: async () => {
        const state = await base.load();
        if (armed) gameRef.user.isGM = false;
        return state;
      },
      replace: (expected, next) => base.replace(expected, next),
    };
    const { application, root, game, notifications } = makeApplication({}, undefined, new ManagedForgeSourceLibrary(store));
    gameRef = game;
    await settleLibrary(application, root);
    await managerForTest(base).saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'New state', rawSource: 'new state source' });
    armed = true;
    await (application as any).refreshLibrary(root, true);
    expect((application as any).libraryState.sources).toEqual([]);
    expect(notifications.errors.at(-1)).toMatch(/GM/u);
  });

  test('rechecks GM authority after async library file reading and before import replacement', async () => {
    const incomingStore = new MemoryForgeSourceLibraryStore();
    const incoming = await managerForTest(incomingStore).saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Incoming', rawSource: 'incoming source' });
    const shared = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const { application, root, game, notifications } = makeApplication({}, undefined, shared);
    await settleLibrary(application, root);
    const content = serializeForgeSourceLibrary(incoming);
    root.sourceLibraryFile.files = [{
      size: new TextEncoder().encode(content).byteLength,
      text: async () => { game.user.isGM = false; return content; },
    } as File];
    await (application as any).importLibrary(root);
    expect((await shared.load()).sources).toEqual([]);
    expect(notifications.errors.at(-1)).toMatch(/GM/u);
  });

  test('rechecks GM authority after async delete confirmation and preserves records on authority loss', async () => {
    const shared = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const seeded = await shared.saveSource({ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Keep', rawSource: 'keep source' });
    let gameRef: any;
    const { application, root, game, notifications } = makeApplication({}, undefined, shared, async () => {
      gameRef.user.isGM = false;
      return true;
    });
    gameRef = game;
    await settleLibrary(application, root);
    await (application as any).deleteLibrarySource(root, seeded.sources[0]!.id);
    expect((await shared.load()).sources).toHaveLength(1);
    expect(notifications.errors.at(-1)).toMatch(/GM/u);
  });

  test('requires explicit confirmation, deletes one review without its source, then cascades on source deletion', async () => {
    const shared = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const { application, root } = makeApplication({}, undefined, shared, async () => true);
    await settleLibrary(application, root);
    root.reviewBundleFile.files = [reviewBundleFile(acceptedReviewBundleText())];
    await (application as any).importBundle(root);
    await (application as any).saveToLibrary(root);
    const sourceId = (application as any).libraryState.sources[0].id;
    const reviewId = (application as any).libraryState.reviews[0].id;
    await (application as any).deleteLibraryReview(root, reviewId);
    expect((application as any).libraryState.sources).toHaveLength(1);
    expect((application as any).libraryState.reviews).toEqual([]);
    await (application as any).deleteLibrarySource(root, sourceId);
    expect((application as any).libraryState.sources).toEqual([]);
    expect((await shared.load()).sources).toEqual([]);
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

  test('strict-imports a mixed Collection as pending jobs with zero Provider and world side effects', async () => {
    let providers = 0;
    let creates = 0;
    const { application, root, batchQueue } = makeApplication({
      createBrowserAiProvider: (() => { providers += 1; throw new Error('Collection import called Provider.'); }) as any,
      createBrowserItemAiProvider: (() => { providers += 1; throw new Error('Collection import called Provider.'); }) as any,
      createAcceptedForgeActor: (async () => { creates += 1; throw new Error('Collection import wrote Actor.'); }) as any,
      createAcceptedForgeItem: (async () => { creates += 1; throw new Error('Collection import wrote Item.'); }) as any,
    });
    await settleBatch(application, root);
    const collection = createForgeBatchCollection({
      label: 'Mixed <img src=x onerror=evil()>',
      createdAt: '2026-08-30T12:00:00.000Z',
      entries: [
        { objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Actor <script>evil()</script>', rawSource: ACTOR_SOURCE },
        { objectKind: 'item', mode: 'ai-item', sourceLabel: 'Item', rawSource: ITEM_SOURCE },
      ],
    });
    root.batchCollectionFile.files = [batchJsonFile('mixed.json', serializeForgeBatchCollection(collection))];
    await (application as any).importBatchFile(root);
    const state = await batchQueue.load();
    expect(state.collections).toEqual([collection]);
    expect(state.jobs.map((job) => [job.ordinal, job.status])).toEqual([[0, 'pending'], [1, 'pending']]);
    expect(root.batchList.innerHTML).not.toContain('<img');
    expect(root.batchList.innerHTML).not.toContain('<script>');
    expect(root.batchList.innerHTML).toContain('&lt;img');
    expect(root.batchList.innerHTML).toContain('&lt;script&gt;');
    expect(providers).toBe(0);
    expect(creates).toBe(0);
  });

  test('rechecks GM authority after asynchronous Collection reading and preserves the queue on loss', async () => {
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const { application, root, game, notifications } = makeApplication({}, undefined, undefined, undefined, batchQueue);
    await settleBatch(application, root);
    const collection = createForgeBatchCollection({
      label: 'Authority loss', createdAt: '2026-08-30T12:00:30.000Z',
      entries: [{ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Guarded', rawSource: 'guarded source' }],
    });
    const content = serializeForgeBatchCollection(collection);
    root.batchCollectionFile.files = [{
      name: 'authority-loss.json', size: new TextEncoder().encode(content).byteLength,
      text: async () => { game.user.isGM = false; return content; },
    } as File];
    await (application as any).importBatchFile(root);
    expect((await batchQueue.load()).collections).toEqual([]);
    expect(notifications.errors.at(-1)).toMatch(/GM/u);
  });

  test('does not replace or expose queue metadata when authority is lost during an asynchronous refresh', async () => {
    const base = new MemoryForgeBatchQueueStore();
    const seedManager = new ManagedForgeBatchQueue(base);
    await seedManager.importCollection(createForgeBatchCollection({
      label: 'Visible before drift', createdAt: '2026-08-30T12:00:45.000Z',
      entries: [{ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Visible', rawSource: 'visible source' }],
    }));
    let armed = false;
    let gameRef: any;
    const guardedStore: ForgeBatchQueueStore = {
      load: async () => {
        const state = await base.load();
        if (armed) gameRef.user.isGM = false;
        return state;
      },
      replace: async (expected, next, guard) => await base.replace(expected, next, guard),
      subscribe: (listener) => base.subscribe(listener),
    };
    const batchQueue = new ManagedForgeBatchQueue(guardedStore);
    const { application, root, game, notifications } = makeApplication({}, undefined, undefined, undefined, batchQueue);
    gameRef = game;
    await settleBatch(application, root);
    const visible = (application as any).batchState;
    expect(visible.collections).toHaveLength(1);
    armed = true;
    await (application as any).refreshBatch(root, true);
    expect((application as any).batchState).toBe(visible);
    expect(root.batchList.innerHTML).toContain('Queue metadata 已隐藏');
    expect(root.batchList.innerHTML).not.toContain('Visible before drift');
    expect(root.batchRun.disabled).toBe(true);
    expect(notifications.errors.at(-1)).toMatch(/GM/u);
  });

  test('runs multiple plaintext jobs sequentially, persists each review, and never auto-applies Documents', async () => {
    const analyzed: string[] = [];
    let creates = 0;
    const sourceLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const { application, root } = makeApplication({
      analyzePlaintextActorSource: ((source: string) => {
        analyzed.push(source);
        return {
          status: 'ready_to_generate', rawSourceHash: hashSource(source),
          candidates: [{ id: 'one', label: 'one', start: 0, end: source.length, quote: source }],
          candidate: { id: 'one', label: 'one', start: 0, end: source.length, quote: source },
          canonicalSource: ACTOR_SOURCE, findings: [],
        };
      }) as any,
      createAcceptedForgeActor: (async () => { creates += 1; return actorCreateResult(); }) as any,
    }, undefined, sourceLibrary, undefined, batchQueue);
    await settleBatch(application, root);
    const collection = createForgeBatchCollection({
      label: 'Sequential plaintext',
      createdAt: '2026-08-30T12:01:00.000Z',
      entries: [
        { objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'First', rawSource: 'first independent source' },
        { objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Second', rawSource: 'second independent source' },
      ],
    });
    await batchQueue.importCollection(collection);
    await (application as any).refreshBatch(root, false);
    await (application as any).runBatch(root);
    const state = await batchQueue.load();
    expect(analyzed).toEqual(['first independent source', 'second independent source']);
    expect(state.jobs.map((job) => job.status)).toEqual(['accepted', 'accepted']);
    expect(state.jobs.map((job) => job.attemptCount)).toEqual([1, 1]);
    expect((await sourceLibrary.load()).reviews).toHaveLength(2);
    expect(creates).toBe(0);
  });

  test('excludes a cancelled job until GM explicitly restores it to pending', async () => {
    const analyzed: string[] = [];
    let creates = 0;
    const sourceLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const { application, root } = makeApplication({
      analyzePlaintextActorSource: ((source: string) => {
        analyzed.push(source);
        return {
          status: 'ready_to_generate', rawSourceHash: hashSource(source),
          candidates: [{ id: 'one', label: 'one', start: 0, end: source.length, quote: source }],
          candidate: { id: 'one', label: 'one', start: 0, end: source.length, quote: source },
          canonicalSource: ACTOR_SOURCE, findings: [],
        };
      }) as any,
      createAcceptedForgeActor: (async () => { creates += 1; return actorCreateResult(); }) as any,
    }, undefined, sourceLibrary, undefined, batchQueue);
    await settleBatch(application, root);
    const collection = createForgeBatchCollection({
      label: 'Per-job cancellation', createdAt: '2026-08-30T12:01:10.000Z',
      entries: [
        { objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Cancelled', rawSource: 'cancelled independent source' },
        { objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Runnable', rawSource: 'runnable independent source' },
      ],
    });
    let state = await batchQueue.importCollection(collection);
    await (application as any).refreshBatch(root, false);
    await (application as any).cancelBatchJob(root, state.jobs[0]!.id);
    expect((await batchQueue.load()).jobs.map((job) => job.status)).toEqual(['cancelled', 'pending']);
    expect(root.batchList.innerHTML).toContain('恢复为 pending');

    await (application as any).runBatch(root);
    state = await batchQueue.load();
    expect(state.jobs.map((job) => job.status)).toEqual(['cancelled', 'accepted']);
    expect(state.jobs.map((job) => job.attemptCount)).toEqual([0, 1]);
    expect(analyzed).toEqual(['runnable independent source']);

    (application as any).clear(root);
    await (application as any).requeueBatchJob(root, state.jobs[0]!.id);
    expect((await batchQueue.load()).jobs[0]!.status).toBe('pending');
    await (application as any).runBatch(root);
    state = await batchQueue.load();
    expect(state.jobs.map((job) => job.status)).toEqual(['accepted', 'accepted']);
    expect(state.jobs.map((job) => job.attemptCount)).toEqual([1, 1]);
    expect(analyzed).toEqual(['runnable independent source', 'cancelled independent source']);
    expect((await sourceLibrary.load()).reviews).toHaveLength(2);
    expect(creates).toBe(0);
  });

  test('skips AI jobs without a tested connection and continues later plaintext jobs without Provider or world work', async () => {
    let providers = 0;
    let creates = 0;
    const sourceLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const { application, root, notifications } = makeApplication({
      createBrowserItemAiProvider: (() => { providers += 1; throw new Error('Unconnected AI job reached Provider creation.'); }) as any,
      analyzePlaintextActorSource: ((source: string) => ({
        status: 'ready_to_generate', rawSourceHash: hashSource(source),
        candidates: [{ id: 'one', label: 'one', start: 0, end: source.length, quote: source }],
        candidate: { id: 'one', label: 'one', start: 0, end: source.length, quote: source },
        canonicalSource: ACTOR_SOURCE, findings: [],
      })) as any,
      createAcceptedForgeActor: (async () => { creates += 1; return actorCreateResult(); }) as any,
    }, undefined, sourceLibrary, undefined, batchQueue);
    await settleBatch(application, root);
    await batchQueue.importCollection(createForgeBatchCollection({
      label: 'Connection-aware scheduling', createdAt: '2026-08-30T12:01:15.000Z',
      entries: [
        { objectKind: 'item', mode: 'ai-item', sourceLabel: 'Needs connection', rawSource: 'unconnected AI source' },
        { objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Runs offline', rawSource: 'offline plaintext source' },
      ],
    }));
    await (application as any).refreshBatch(root, false);
    await (application as any).runBatch(root);

    const state = await batchQueue.load();
    expect(state.jobs.map((job) => job.status)).toEqual(['pending', 'accepted']);
    expect(state.jobs.map((job) => job.attemptCount)).toEqual([0, 1]);
    expect((await sourceLibrary.load()).reviews).toHaveLength(1);
    expect(notifications.infos).toContainEqual(expect.stringContaining('本轮跳过该 pending job'));
    expect(providers).toBe(0);
    expect(creates).toBe(0);
  });

  test('routes a mixed accepted batch through the type-specific adapters and reports partial apply failure per job', async () => {
    const adapterCalls: string[] = [];
    const sourceLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const { application, root, notifications } = makeApplication({
      analyzePlaintextActorSource: ((source: string) => ({
        status: 'ready_to_generate', rawSourceHash: hashSource(source),
        candidates: [{ id: 'actor', label: 'actor', start: 0, end: source.length, quote: source }],
        candidate: { id: 'actor', label: 'actor', start: 0, end: source.length, quote: source },
        canonicalSource: ACTOR_SOURCE, findings: [],
      })) as any,
      createBrowserItemAiProvider: (() => ({})) as any,
      analyzeBrowserItemSourceWithAi: (async (input: any) => readyItemAnalysis(input.source)) as any,
      generateAndReviewBrowserItemIntake: (async (input: any, analysis: any) => {
        const request = buildForgeItemRequest({
          content: ITEM_SOURCE, displayName: input.displayName || input.sourceName,
          requestId: input.requestId, fvttVersion: input.fvttVersion, systemVersion: input.systemVersion,
        });
        const response = await convertFinalItemSource(request);
        if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Injected Item fixture is not accepted.');
        return {
          status: 'accepted', analysis, rawSourceHash: hashSource(input.source), finalSource: request.source.content,
          finalSourceHash: request.source.utf8Sha256, response,
          itemProjection: response.result.artifact, formalStatus: 'accepted',
          review: { schemaVersion: 1, verdict: 'accepted', findings: [] }, findings: [], stages: [],
          provider: analysis.provider, calls: { ...analysis.calls, review: 1 },
        };
      }) as any,
      createAcceptedForgeActor: (async ({ response }: any) => {
        adapterCalls.push('actor');
        const sourceId = response.result.sourceIdentity.sourceId;
        return { ...actorCreateResult(), uuid: `Actor.${hashArtifact({ sourceId }).slice(0, 16)}` };
      }) as any,
      createAcceptedForgeItem: (async () => { adapterCalls.push('item'); throw new Error('intentional item apply failure'); }) as any,
    }, undefined, sourceLibrary, async () => true, batchQueue);
    await settleBatch(application, root);
    root.provider.value = 'custom';
    root.endpoint.value = 'https://provider.example/v1';
    root.protocol.value = 'openai-chat';
    root.authScheme.value = 'bearer';
    root.model.value = 'extract';
    root.reviewModel.value = 'review';
    root.apiKey.value = 'transient';
    authorizeAiConnection(application, root);
    const collection = createForgeBatchCollection({
      label: 'Mixed apply', createdAt: '2026-08-30T12:01:30.000Z',
      entries: [
        { objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Actor', rawSource: 'mixed actor source' },
        { objectKind: 'item', mode: 'ai-item', sourceLabel: 'Item', rawSource: 'mixed item source' },
      ],
    });
    await batchQueue.importCollection(collection);
    await (application as any).refreshBatch(root, false);
    await (application as any).runBatch(root);
    expect(notifications.errors).toEqual([]);
    expect((await batchQueue.load()).jobs.map((job) => job.status)).toEqual(['accepted', 'accepted']);
    expect(adapterCalls).toEqual([]);
    await (application as any).applyBatch(root);
    expect(adapterCalls).toEqual(['actor', 'item']);
    const applied = await batchQueue.load();
    expect(applied.jobs.map((job) => job.status)).toEqual(['applied', 'apply_failed']);
    expect(applied.jobs[0]!.applyResult?.objectKind).toBe('actor');
    expect(applied.jobs[1]!.applyResult?.objectKind).toBe('item');
    expect(applied.jobs[1]!.lastError).toContain('intentional item apply failure');

    (application as any).clear(root);
    await (application as any).runBatch(root);
    const recovered = await batchQueue.load();
    expect(recovered.jobs.map((job) => job.status)).toEqual(['applied', 'accepted']);
    expect(recovered.jobs.map((job) => job.attemptCount)).toEqual([1, 2]);
    expect(recovered.jobs[1]!.applyResult).toBeUndefined();
    expect(adapterCalls).toEqual(['actor', 'item']);
  });

  test('requires explicit confirmation and current-session accepted responses before batch apply', async () => {
    let creates = 0;
    const sourceLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const { application, root } = makeApplication({
      analyzePlaintextActorSource: ((source: string) => ({
        status: 'ready_to_generate', rawSourceHash: hashSource(source),
        candidates: [{ id: 'one', label: 'one', start: 0, end: source.length, quote: source }],
        candidate: { id: 'one', label: 'one', start: 0, end: source.length, quote: source },
        canonicalSource: ACTOR_SOURCE, findings: [],
      })) as any,
      createAcceptedForgeActor: (async ({ response }: any) => {
        creates += 1;
        const sourceId = response.result.sourceIdentity.sourceId;
        return { ...actorCreateResult(), uuid: `Actor.${hashArtifact({ sourceId }).slice(0, 16)}` };
      }) as any,
    }, undefined, sourceLibrary, async () => true, batchQueue);
    await settleBatch(application, root);
    const collection = createForgeBatchCollection({
      label: 'Accepted apply', createdAt: '2026-08-30T12:02:00.000Z',
      entries: [{ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Only', rawSource: 'one apply source' }],
    });
    await batchQueue.importCollection(collection);
    await (application as any).refreshBatch(root, false);
    await (application as any).runBatch(root);
    expect((await batchQueue.load()).jobs[0]!.status).toBe('accepted');
    expect(creates).toBe(0);
    await (application as any).applyBatch(root);
    expect(creates).toBe(1);
    expect((await batchQueue.load()).jobs[0]!.status).toBe('applied');
  });

  test('recovers a prior running job as interrupted without replaying Provider or Document work', async () => {
    let effects = 0;
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const collection = createForgeBatchCollection({
      label: 'Interrupted session', createdAt: '2026-08-30T12:03:00.000Z',
      entries: [{ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Interrupted', rawSource: 'interrupted source' }],
    });
    let seeded = await batchQueue.importCollection(collection);
    seeded = await batchQueue.startJob(seeded.jobs[0]!.id);
    expect(seeded.jobs[0]!.status).toBe('running');
    const { application, root } = makeApplication({
      analyzePlaintextActorSource: (() => { effects += 1; throw new Error('Reload replayed analysis.'); }) as any,
      createAcceptedForgeActor: (async () => { effects += 1; throw new Error('Reload wrote Actor.'); }) as any,
    }, undefined, undefined, undefined, batchQueue);
    await settleBatch(application, root);
    const recovered = await batchQueue.load();
    expect(recovered.jobs[0]!.status).toBe('interrupted');
    expect(recovered.jobs[0]!.lastError).toContain('自动重发');
    expect(effects).toBe(0);
  });

  test('requires an explicit accepted-job rerun after reload before batch apply becomes available again', async () => {
    let analyses = 0;
    let creates = 0;
    const sourceLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const services = {
      analyzePlaintextActorSource: ((source: string) => {
        analyses += 1;
        return {
          status: 'ready_to_generate', rawSourceHash: hashSource(source),
          candidates: [{ id: 'one', label: 'one', start: 0, end: source.length, quote: source }],
          candidate: { id: 'one', label: 'one', start: 0, end: source.length, quote: source },
          canonicalSource: ACTOR_SOURCE, findings: [],
        };
      }) as any,
      createAcceptedForgeActor: (async () => { creates += 1; return actorCreateResult(); }) as any,
    };
    const first = makeApplication(services, undefined, sourceLibrary, async () => true, batchQueue);
    await settleBatch(first.application, first.root);
    await batchQueue.importCollection(createForgeBatchCollection({
      label: 'Accepted reload', createdAt: '2026-08-30T12:03:30.000Z',
      entries: [{ objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: 'Reloaded', rawSource: 'accepted reload source' }],
    }));
    await (first.application as any).refreshBatch(first.root, false);
    await (first.application as any).runBatch(first.root);
    expect((await batchQueue.load()).jobs[0]!.status).toBe('accepted');
    expect(first.root.batchApply.disabled).toBe(false);
    await first.application.close();

    const second = makeApplication(services, undefined, sourceLibrary, async () => true, batchQueue);
    await settleBatch(second.application, second.root);
    expect(second.root.batchApply.disabled).toBe(true);
    expect(second.root.batchRun.disabled).toBe(false);
    await (second.application as any).runBatch(second.root);

    const rerun = await batchQueue.load();
    expect(rerun.jobs[0]!.status).toBe('accepted');
    expect(rerun.jobs[0]!.attemptCount).toBe(2);
    expect(second.root.batchApply.disabled).toBe(false);
    expect((await sourceLibrary.load()).reviews).toHaveLength(2);
    expect(analyses).toBe(2);
    expect(creates).toBe(0);
  });

  test('stops the active Provider attempt, leaves later jobs pending, and permits explicit interrupted resume', async () => {
    let analyses = 0;
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const { application, root } = makeApplication({
      createBrowserItemAiProvider: (() => ({})) as any,
      analyzeBrowserItemSourceWithAi: ((_: any, __: any, signal: AbortSignal) => {
        analyses += 1;
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }));
      }) as any,
    }, undefined, undefined, undefined, batchQueue);
    await settleBatch(application, root);
    root.provider.value = 'custom'; root.endpoint.value = 'https://provider.example/v1'; root.protocol.value = 'openai-chat';
    root.authScheme.value = 'bearer'; root.model.value = 'extract'; root.reviewModel.value = 'review'; root.apiKey.value = 'transient';
    authorizeAiConnection(application, root);
    const collection = createForgeBatchCollection({
      label: 'Stop runner', createdAt: '2026-08-30T12:04:00.000Z',
      entries: [
        { objectKind: 'item', mode: 'ai-item', sourceLabel: 'Active', rawSource: 'active provider source' },
        { objectKind: 'item', mode: 'ai-item', sourceLabel: 'Later', rawSource: 'later provider source' },
      ],
    });
    await batchQueue.importCollection(collection);
    await (application as any).refreshBatch(root, false);
    const running = (application as any).runBatch(root);
    for (let index = 0; index < 20 && !(application as any).controller; index += 1) await Promise.resolve();
    expect((application as any).controller).toBeDefined();
    (application as any).stopBatch();
    await running;
    const stopped = await batchQueue.load();
    expect(stopped.jobs.map((job) => job.status)).toEqual(['interrupted', 'pending']);
    expect(stopped.jobs[0]!.attemptCount).toBe(1);
    expect(stopped.jobs[1]!.attemptCount).toBe(0);
    expect(analyses).toBe(1);
    const resumed = await batchQueue.startJob(stopped.jobs[0]!.id);
    expect(resumed.jobs[0]!.status).toBe('running');
    await batchQueue.interruptJob(stopped.jobs[0]!.id);
  });

  test('leaves a batch job recoverably interrupted and makes zero generation calls when analysis revokes GM authority', async () => {
    let generations = 0;
    let gameRef: any;
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const { application, root, game } = makeApplication({
      createBrowserItemAiProvider: (() => ({})) as any,
      analyzeBrowserItemSourceWithAi: (async (input: any) => {
        gameRef.user.isGM = false;
        return readyItemAnalysis(input.source);
      }) as any,
      generateAndReviewBrowserItemIntake: (async () => { generations += 1; throw new Error('Revoked GM reached generation.'); }) as any,
    }, undefined, undefined, undefined, batchQueue);
    gameRef = game;
    await settleBatch(application, root);
    root.provider.value = 'custom'; root.endpoint.value = 'https://provider.example/v1'; root.protocol.value = 'openai-chat';
    root.authScheme.value = 'bearer'; root.model.value = 'extract'; root.reviewModel.value = 'review'; root.apiKey.value = 'transient';
    authorizeAiConnection(application, root);
    const collection = createForgeBatchCollection({
      label: 'Authority drift runner', createdAt: '2026-08-30T12:05:00.000Z',
      entries: [{ objectKind: 'item', mode: 'ai-item', sourceLabel: 'Authority drift', rawSource: 'authority drift source' }],
    });
    await batchQueue.importCollection(collection);
    await (application as any).refreshBatch(root, false);
    await (application as any).runBatch(root);
    expect(generations).toBe(0);
    expect((await batchQueue.load()).jobs[0]!.status).toBe('running');
    game.user.isGM = true;
    const recovered = await batchQueue.recoverInterrupted();
    expect(recovered.jobs[0]!.status).toBe('interrupted');
  });
});

function makeApplication(
  services: Partial<ForgeIntakeApplicationServices> = {},
  dialogWait?: (config: any) => Promise<unknown>,
  sourceLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore()),
  dialogConfirm?: (config: any) => Promise<boolean>,
  batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore()),
) {
  const notifications = { errors: [] as string[], infos: [] as string[] };
  const game = { version: '14.364', system: { id: 'dnd5e', version: '5.3.3' }, world: { id: 'test-world' }, user: { id: 'test-user', isGM: true } };
  const hookCallbacks = new Map<string, Set<() => void>>();
  let nextHookId = 0;
  const hooks = {
    on: (event: string, callback: () => void) => {
      const callbacks = hookCallbacks.get(event) ?? new Set<() => void>();
      callbacks.add(callback);
      hookCallbacks.set(event, callbacks);
      nextHookId += 1;
      return nextHookId;
    },
    off: (event: string, _id: unknown) => { hookCallbacks.delete(event); },
    call: (event: string) => { for (const callback of hookCallbacks.get(event) ?? []) callback(); },
  };
  const environment = {
    game,
    hooks,
    foundry: { applications: { api: {
      ApplicationV2: class { async close() {} },
      HandlebarsApplicationMixin: (Base: any) => class extends Base {},
      ...(dialogWait || dialogConfirm ? { DialogV2: { ...(dialogWait ? { wait: dialogWait } : {}), ...(dialogConfirm ? { confirm: dialogConfirm } : {}) } } : {}),
    } } },
    ui: { notifications: { error: (message: string) => notifications.errors.push(message), info: (message: string) => notifications.infos.push(message) } },
    services,
    sourceLibrary,
    batchQueue,
  };
  const Application = createForgeIntakeApplicationClass(environment);
  const application: any = new Application();
  const root = new FakeRoot();
  application.element = root;
  (globalThis as any).document = { activeElement: null };
  application._onRender({}, {});
  return { application, root, notifications, game, hooks, sourceLibrary, batchQueue };
}

function managerForTest(store: ForgeSourceLibraryStore): ManagedForgeSourceLibrary {
  return new ManagedForgeSourceLibrary(store, () => '2026-08-30T08:30:00.000Z');
}

async function settleLibrary(application: any, root: FakeRoot): Promise<void> {
  for (let index = 0; index < 10 && (application as any).libraryLoading; index += 1) await Promise.resolve();
  if (!(application as any).libraryState) await (application as any).refreshLibrary(root, false);
}

async function settleBatch(application: any, root: FakeRoot): Promise<void> {
  for (let index = 0; index < 10 && (application as any).batchLoading; index += 1) await Promise.resolve();
  if (!(application as any).batchState) await (application as any).refreshBatch(root, false);
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
  sourceLibrarySearch = control(''); sourceLibraryFile = control('', 'file'); libraryRefresh = control(''); librarySave = control(''); libraryExport = control(''); libraryImport = control('');
  batchCollectionFile = control('', 'file'); batchRefresh = control(''); batchImport = control(''); batchExport = control(''); batchRun = control(''); batchStop = control(''); batchApply = control('');
  analyze = control(''); repair = control(''); generate = control(''); regenerate = control(''); reject = control(''); cancel = control(''); clear = control(''); export = control(''); create = control(''); clearKey = control(''); clearAllKeys = control(''); toggleKey = control(''); toggleEndpoint = control('');
  status = control(''); humanSummary = control(''); stages = control(''); diagnostics = control(''); diagnosticList = control(''); previewSection = control(''); activityCard = control(''); candidate = control(''); evidence = control(''); metadata = control(''); canonical = control(''); rawSource = control(''); preview = control(''); json = control('');
  librarySummary = control(''); libraryList = control('');
  batchSummary = control(''); batchList = control('');
  querySelector(selector: string): any {
    return ({
      '[name="mode"]': this.mode, '[name="source"]': this.source, '[name="displayName"]': this.displayName, '[name="provider"]': this.provider, '[name="endpoint"]': this.endpoint,
      '[name="protocol"]': this.protocol, '[name="authScheme"]': this.authScheme, '[name="region"]': this.region, '[name="reasoning"]': this.reasoning, '[name="structuredOutput"]': this.structuredOutput,
      '[name="model"]': this.model, '[name="reviewModel"]': this.reviewModel, '[name="apiKey"]': this.apiKey, '[name="persistApiKey"]': this.persistApiKey, '[name="useSeparateReviewModel"]': this.useSeparateReviewModel,
      '[name="reviewBundleFile"]': this.reviewBundleFile,
      '[name="sourceLibrarySearch"]': this.sourceLibrarySearch, '[name="sourceLibraryFile"]': this.sourceLibraryFile,
      '[name="batchCollectionFile"]': this.batchCollectionFile,
      '[data-ai-settings]': this.aiSettings, '[data-action="analyze"]': this.analyze, '[data-action="repair"]': this.repair, '[data-action="generate"]': this.generate,
      '[data-action="regenerate"]': this.regenerate, '[data-action="reject"]': this.reject, '[data-action="cancel"]': this.cancel, '[data-action="clear"]': this.clear,
      '[data-action="export"]': this.export, '[data-action="create"]': this.create, '[data-action="clear-key"]': this.clearKey,
      '[data-action="clear-all-keys"]': this.clearAllKeys,
      '[data-action="toggle-key"]': this.toggleKey, '[data-action="toggle-endpoint"]': this.toggleEndpoint,
      '[data-action="import"]': this.import, '[data-action="start-new-attempt"]': this.startNewAttempt,
      '[data-action="library-refresh"]': this.libraryRefresh, '[data-action="library-save"]': this.librarySave, '[data-action="library-export"]': this.libraryExport, '[data-action="library-import"]': this.libraryImport,
      '[data-action="batch-refresh"]': this.batchRefresh, '[data-action="batch-import"]': this.batchImport, '[data-action="batch-export"]': this.batchExport, '[data-action="batch-run"]': this.batchRun, '[data-action="batch-stop"]': this.batchStop, '[data-action="batch-apply"]': this.batchApply,
      '[data-status]': this.status, '[data-stages]': this.stages, '[data-diagnostics]': this.diagnostics, '[data-diagnostic-list]': this.diagnosticList,
      '[data-human-summary]': this.humanSummary, '[data-activity-card]': this.activityCard,
      '[data-preview-section]': this.previewSection, '[data-candidate]': this.candidate, '[data-evidence]': this.evidence, '[data-metadata]': this.metadata,
      '[data-canonical]': this.canonical, '[data-raw-source]': this.rawSource, '[data-preview]': this.preview, '[data-json]': this.json,
      '[data-library-summary]': this.librarySummary, '[data-library-list]': this.libraryList,
      '[data-batch-summary]': this.batchSummary, '[data-batch-list]': this.batchList,
    } as Record<string, any>)[selector] ?? null;
  }
}
function control(value: string, type = 'button'): any { return { value, type, checked: false, files: undefined, disabled: false, hidden: false, textContent: '', innerHTML: '', dataset: {}, onclick: undefined, onchange: undefined, oninput: undefined }; }

function reviewBundleFile(content: string): File {
  return { size: new TextEncoder().encode(content).byteLength, text: async () => content } as File;
}

function batchJsonFile(name: string, content: string): File {
  return {
    name,
    size: new TextEncoder().encode(content).byteLength,
    text: async () => content,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  } as File;
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
