import { beforeAll, describe, expect, test } from 'bun:test';
import type {BrowserActorGenerationResult} from '@fvtt-json-generator/forge-browser-runtime/ai';
import { MemoryIntakeCandidateStore, captureIntakeCandidate, revalidateIntakeCandidate, INTAKE_CANDIDATE_MAX_AGE_MS,
  INTAKE_CANDIDATE_MAX_BYTES, INTAKE_CANDIDATE_GENERATION_CONTRACTS, type IntakeCandidateRecord, type IntakeCandidateStore } from '../src/intakeCandidateRecovery';
import { LURKER_SOURCE, buildValidLurkerIr } from '../../../src/core/intake/__tests__/fixtures/lurker';
import { JEWEL_OF_THREE_PRAYERS_SOURCE, jewelCandidate, buildJewelOfThreePrayersIr } from '../../../src/core/intake/__tests__/fixtures/jewel-of-three-prayers';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { officialDragonSeeds } from '../../../tests/fixtures/forge-2024-dragon-seeds';
import { buildCastActivitySource } from '../../monster-spell-resolver/src/cast-activity';
import { normalizeSpellIdentity } from '../../../src/core/spell-resolution';
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
  forgeGmTargetHash,
  forgeGmModelFindingsHash,
  serializeForgeIntakeReviewBundle,
} from '@fvtt-json-generator/forge-browser-runtime/intake-review';
import {
  FORGE_INTAKE_REVIEW_BUNDLE_MAX_UTF8_BYTES,
  decodeForgeIntakeReviewBundleText,
  serializeForgeIntakeReviewBundleV2,
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
  batchQueueEntry,
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
import { analyzeBrowserActorIntakeDraft, analyzeBrowserActorSourceWithAi, generateBrowserActorIntakeCandidate, approveBrowserActorIntakeCandidateForGm } from '@fvtt-json-generator/forge-browser-runtime/ai';
import { clearAllForgeSessionApiKeys, markForgeSessionConnectionTested, readForgeSessionSettings, saveForgeSessionSettings } from '../src/settings';

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
  test('actor delivery: plaintext content findings keep the generated Actor downloadable and directly creatable',async()=>{
    const response:any=structuredClone(acceptedActor);delete response.result.artifactHash;
    response.result.status='failed';response.result.verification.status='failed';
    response.result.diagnostics=[{code:'CONTENT_ISSUE',severity:'error',stage:'semantic',path:'actor',message:'A local field needs attention.'}];
    let creates=0;const downloads:string[]=[];
    const x=makeApplication({
      analyzePlaintextActorSource:((source:string)=>({status:'ready_to_generate',rawSourceHash:hashSource(source),
        candidates:[{id:'one',label:'one',start:0,end:source.length,quote:source}],canonicalSource:ACTOR_SOURCE,findings:[]})) as any,
      convertFinalActorSource:(async()=>response) as any,
      createAcceptedForgeActor:(async({response:current}:any)=>{creates++;expect(current).toEqual(response);return actorCreateResult();}) as any,
      downloadReviewBundle:(_name,content)=>{downloads.push(content);},
    });
    try{
      await settleBatch(x.application,x.root);x.root.mode.value='plaintext-actor';x.root.source.value='plaintext source';
      await x.application.runAnalysis(x.root,false);await x.application.generate(x.root);
      expect(x.application.generation.response).toEqual(response);expect(x.root.create.disabled).toBe(false);
      x.root.source.value='edited next source';x.application.invalidateReview(x.root);
      expect(x.root.downloadActor.disabled).toBe(false);x.root.downloadActor.onclick();
      expect(JSON.parse(downloads[0]!)).toEqual(response.result.artifact);
      await x.application.create(x.root);expect(creates,JSON.stringify(x.notifications)).toBe(1);
    }finally{await x.application.close();}
  });
  test('actor delivery: local AI Actor generation uses its saved source and target without a connection provider',async()=>{
    const f=batchCandidateFixture('ai-monster','failed');let factories=0;const inputs:any[]=[];
    const x=makeApplication({...f.services,createBrowserAiProvider:(()=>{factories++;return {};}) as any,
      generateBrowserActorIntakeCandidate:(async(input:any,analysis:any,provider:any)=>{
        inputs.push(structuredClone(input));return f.services.generateBrowserActorIntakeCandidate!(input,analysis,provider);
      }) as any});
    try{
      await settleBatch(x.application,x.root);setAiForm(x.application,x.root,'ai-monster','original source');
      await x.application.runAnalysis(x.root,false);
      x.root.apiKey.value='';x.root.model.value='changed';x.root.source.value='next source';
      x.game.version='unavailable';x.game.system.version='unavailable';x.application.invalidateReview(x.root);
      await x.application.generate(x.root);
      expect(inputs).toHaveLength(1);expect(inputs[0]).toMatchObject({source:'original source',fvttVersion:'14.364',systemVersion:'5.3.3'});
      expect(factories).toBe(1);expect(x.application.generation.candidateAvailable).toBe(true);
      expect(x.root.downloadActor.disabled).toBe(false);
    }finally{await x.application.close();}
  });
  test('actor delivery: reanalysis button failure retains the previous Actor and original source snapshot',async()=>{
    const f=batchCandidateFixture('ai-monster','failed'),downloads:string[]=[];
    const x=makeApplication({...f.services,downloadReviewBundle:(_name,content)=>downloads.push(content)});
    try{
      await settleBatch(x.application,x.root);setAiForm(x.application,x.root,'ai-monster','original completed source');
      await x.application.runAnalysis(x.root,false);await x.application.generate(x.root);
      const before=structuredClone(x.application.generation.candidateResponse),snapshot=structuredClone(x.application.snapshot);
      x.application.editSource(x.root);x.root.source.value='next source';x.root.source.oninput?.();
      x.application.services.analyzeBrowserActorSourceWithAi=async()=>{throw Error('AI request failed');};
      expect(x.root.regenerate.hidden).toBe(false);expect(x.root.regenerate.disabled).toBe(false);
      x.root.regenerate.onclick?.();
      for(let wait=0;wait<50&&x.application.controller;wait++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(x.application.generation.candidateResponse).toEqual(before);expect(x.application.snapshot).toEqual(snapshot);
      expect(x.application.reviewSource).toBe('original completed source');expect(x.root.downloadActor.disabled).toBe(false);
      x.root.downloadActor.onclick?.();expect(JSON.parse(downloads[0]!)).toEqual((before as any).result.artifact);
      expect(x.notifications.errors.some(message=>message.includes('此前候选完整保留'))).toBe(true);
    }finally{await x.application.close();}
  });
  test('actor delivery: reading an existing large Actor does not reuse the new-write storage quota',async()=>{
    const record:any={version:2,savedAt:'2000-01-01T00:00:00.000Z',mode:'ai-monster',
      input:{source:'saved source'},bundle:{status:'ready_for_gm_review'},checksum:'historic',
      candidate:{status:'ready_for_gm_review',analysis:{},findings:[],candidateResponse:structuredClone(acceptedActor)}};
    record.candidate.candidateResponse.result.artifact.system.details.biography={value:'x'.repeat(INTAKE_CANDIDATE_MAX_BYTES+1)};
    const store=new MemoryIntakeCandidateStore({single:record}),loaded=(await store.load()).single!;
    const restored=await revalidateIntakeCandidate(loaded,{fvttVersion:'14.364',systemVersion:'5.3.3'});
    expect((restored.candidate.candidateResponse as any).result.artifact.system.details.biography.value).toHaveLength(INTAKE_CANDIDATE_MAX_BYTES+1);
    expect(record.candidate.gmApproval).toBeUndefined();
  });
  test('actor delivery: old or changed Actor recovery reads the saved artifact without regeneration and leaves the record untouched',async()=>{
    const f=batchCandidateFixture('ai-monster','failed'),store=new MemoryIntakeCandidateStore();
    const x=makeApplication(f.services,undefined,undefined,undefined,undefined,{candidateStore:store});
    try{
      await settleBatch(x.application,x.root);setAiForm(x.application,x.root,'ai-monster','saved source');
      await x.application.runAnalysis(x.root,false);await x.application.generate(x.root);
      const record:any=structuredClone((await store.load()).single!);expect(record).toBeDefined();
      record.savedAt='2000-01-01T00:00:00.000Z';record.generationContract='historic-contract';record.checksum='different';
      const before=JSON.stringify(record),generationCount=f.counts.generations;
      const restored=await revalidateIntakeCandidate(record,{fvttVersion:'14.368',systemVersion:'6.0.0'});
      expect(restored.candidate.candidateResponse).toEqual(record.candidate.candidateResponse);
      expect(restored.candidate.gmApproval).toBeUndefined();expect(restored.bundle.gmApproval).toBeUndefined();
      expect(restored.candidate.findings).toContainEqual(expect.objectContaining({code:'SAVED_CANDIDATE_CHECKSUM_MISMATCH'}));
      expect(f.counts.generations).toBe(generationCount);expect(JSON.stringify(record)).toBe(before);
    }finally{await x.application.close();}
  });

  test('builds directory-specific context and routes workspace shortcuts without changing the mode on rerender', async () => {
    let connectionOpens = 0;
    let structuredOpens = 0;
    const { application, root, notifications } = makeApplication({}, undefined, undefined, undefined, undefined, {
      directoryKind: 'Item',
      initialMode: 'ai-item',
      legacyConnectionFields: false,
      openConnectionSettings: () => { connectionOpens += 1; },
      openStructuredImport: () => { structuredOpens += 1; },
    });
    const context = await (application as any)._prepareContext();
    expect(context).toMatchObject({ directoryTitle: '物品工作台', isActorDirectory: false, isItemDirectory: true, initialMode: 'ai-item' });
    expect(root.mode.value).toBe('ai-item');
    expect(root.previewSection.hidden).toBe(true);
    expect(root.status.textContent).toBe('等待输入资料');
    root.mode.value = 'ai-monster';
    root.mode.onchange?.();
    expect(root.mode.value).toBe('ai-item');
    root.connectionOpen.onclick?.();
    root.structuredOpen.onclick?.();
    expect(connectionOpens).toBe(1);
    expect(structuredOpens).toBe(1);
    expect(notifications.errors).toContain('Item 工作台只支持 AI 物品整理。');
    await application.close();
  });

  test('blocks AI analysis until the shared session connection is tested and exposes the settings shortcut', async () => {
    let analyses = 0;
    let connectionOpens = 0;
    const session = forgeSessionSettingsFixture();
    const { application, root, notifications } = makeApplication({
      analyzeBrowserActorSourceWithAi: (async (input: any) => { analyses += 1; return readyActorAnalysis(input.source); }) as any,
      readForgeSessionSettings: () => session,
      isForgeSessionConnectionReady: () => false,
      subscribeForgeSessionSettings: () => () => undefined,
    }, undefined, undefined, undefined, undefined, {
      directoryKind: 'Actor',
      initialMode: 'ai-monster',
      legacyConnectionFields: false,
      openConnectionSettings: () => { connectionOpens += 1; },
    });
    root.source.value = 'AI source waiting for connection';
    expect(root.analyze.disabled).toBe(true);
    root.connectionOpen.onclick?.();
    await (application as any).analyze(root);
    expect(connectionOpens).toBe(1);
    expect(analyses).toBe(0);
    expect(notifications.errors.at(-1)).toContain('AI 连接尚未测试');
    expect(root.connectionSummary.textContent).toContain('extract');
    await application.close();
  });

  test('keeps mixed batch jobs inside the current directory kind', async () => {
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    await batchQueue.importCollection(createForgeBatchCollection({
      label: 'mixed directory queue', createdAt: '2026-09-15T00:00:00.000Z',
      entries: [
        { objectKind: 'actor', mode: 'ai-monster', sourceLabel: 'Actor source', rawSource: 'actor source' },
        { objectKind: 'item', mode: 'ai-item', sourceLabel: 'Item source', rawSource: 'item source' },
      ],
    }));
    const { application, root } = makeApplication({}, undefined, undefined, undefined, batchQueue, {
      directoryKind: 'Item', initialMode: 'ai-item', legacyConnectionFields: false,
    });
    await (application as any).refreshBatch(root, false);
    const state = await batchQueue.load();
    expect((application as any).batchJobRunnable(state.jobs[0])).toBe(false);
    expect((application as any).batchJobRunnable(state.jobs[1])).toBe(true);
    const actorEntry = batchQueueEntry(state, state.jobs[0]!);
    expect((application as any).loadBatchEntry(root, actorEntry)).toBe(false);
    expect(root.source.value).toBe('');
  });

  test('keeps an accepted review for same-identity session updates, invalidates changed settings, and unsubscribes on close', async () => {
    const session = forgeSessionSettingsFixture();
    let listener!: () => void;
    let unsubscribed = 0;
    let ready = false;
    const { application, root } = makeApplication({}, undefined, undefined, undefined, undefined, {
      directoryKind: 'Actor',
      initialMode: 'ai-monster',
      legacyConnectionFields: false,
      services: {
        readForgeSessionSettings: () => session,
        isForgeSessionConnectionReady: () => ready,
        subscribeForgeSessionSettings: (callback: () => void) => { listener = callback; return () => { unsubscribed += 1; }; },
      },
    });
    root.source.value = 'session source';
    root.displayName.value = 'Session source';
    (application as any).status = 'accepted';
    (application as any).response = acceptedActor;
    ready = true;
    listener();
    expect((application as any).status).toBe('accepted');
    expect((application as any).response).toBe(acceptedActor);
    session.apiKey = '';
    listener();
    expect((application as any).status).toBe('accepted');
    expect((application as any).response).toBe(acceptedActor);
    session.model = 'changed-model';
    listener();
    expect((application as any).status).toBe('needs_review');
    expect((application as any).response).toBeDefined();
    await application.close();
    expect(unsubscribed).toBe(1);
  });

  test('a connection probe notification leaves unsaved legacy connection fields alone', async () => {
    const session = forgeSessionSettingsFixture();
    let listener!: () => void;
    const { application, root } = makeApplication({
      readForgeSessionSettings: () => session,
      subscribeForgeSessionSettings: (callback: () => void) => { listener = callback; return () => undefined; },
    });
    root.model.value = 'unsaved-model-draft';
    listener();
    expect(root.model.value).toBe('unsaved-model-draft');
    await application.close();
  });

  test('an open encounter reads the current shared connection even when the hidden Intake form is stale', async () => {
    const session = forgeSessionSettingsFixture();
    const { application, root } = makeApplication({ readForgeSessionSettings: () => session,
      isForgeSessionConnectionReady: () => true }, undefined, undefined, undefined, undefined, {
      directoryKind: 'Actor', initialMode: 'ai-monster', legacyConnectionFields: false,
    });
    session.model = 'current-extraction-model';
    session.apiKey = 'current-session-key';
    session.protocol = 'openai-responses';
    const options = (application as any).encounterAiProviderOptions(new AbortController());
    expect(options.model).toBe('current-extraction-model');
    expect(options.apiKey).toBe('current-session-key');
    expect(options.protocol).toBe('openai-responses');
    expect(root.apiKey.value).toBe('');
    (root as any).isConnected = false;
    expect(() => (application as any).encounterAiProviderOptions(new AbortController())).toThrow('请重新打开 Forge 工作台');
    await application.close();
  });

  test('an encounter refuses an untested or changed model before creating an AI provider', async () => {
    const session = forgeSessionSettingsFixture();
    let ready = false;
    const { application } = makeApplication({ readForgeSessionSettings: () => session,
      isForgeSessionConnectionReady: () => ready }, undefined, undefined, undefined, undefined, {
      directoryKind: 'Actor', initialMode: 'ai-monster', legacyConnectionFields: false,
    });
    expect(() => (application as any).encounterAiProviderOptions(new AbortController())).toThrow('尚未测试或已失效');
    ready = true;
    expect((application as any).encounterAiProviderOptions(new AbortController()).model).toBe(session.model);
    ready = false;
    session.model = 'changed-model';
    expect(() => (application as any).encounterAiProviderOptions(new AbortController())).toThrow('尚未测试或已失效');
    await application.close();
  });

  test('does not let a late Markdown file read overwrite a newer manual edit or Clear', async () => {
    let resolveFile!: (value: string) => void;
    const firstFile = { name: 'source.md', size: 10, text: () => new Promise<string>(resolve => { resolveFile = resolve; }) } as any;
    const first = makeApplication({}, undefined, undefined, undefined, undefined, { legacyConnectionFields: false, directoryKind: 'Actor' });
    first.root.source.value = 'old accepted source';
    (first.application as any).status = 'accepted';
    (first.application as any).response = acceptedActor;
    (first.application as any).snapshot = currentSnapshot(first.application, first.root);
    first.root.sourceFile.files = [firstFile];
    const reading = (first.application as any).readSourceFile(first.root, first.root.sourceFile);
    await Promise.resolve();
    first.root.source.value = 'manual edit wins';
    first.root.source.oninput?.();
    resolveFile('late file content');
    await reading;
    expect(first.root.source.value).toBe('manual edit wins');

    let resolveClear!: (value: string) => void;
    const secondFile = { name: 'source.txt', size: 10, text: () => new Promise<string>(resolve => { resolveClear = resolve; }) } as any;
    const second = makeApplication({}, undefined, undefined, undefined, undefined, { legacyConnectionFields: false, directoryKind: 'Actor' });
    second.root.source.value = 'source before clear';
    second.root.sourceFile.files = [secondFile];
    const readingClear = (second.application as any).readSourceFile(second.root, second.root.sourceFile);
    await Promise.resolve();
    (second.application as any).clear(second.root);
    resolveClear('must not return after clear');
    await readingClear;
    expect(second.root.source.value).toBe('');
  });

  test('moves through input, review, created, and clear with one primary workspace action per stage', async () => {
    let creates = 0;
    const actor = { name: 'Created creature', sheet: { render: () => undefined } };
    const { application, root, game } = makeApplication({
      analyzePlaintextActorSource: ((source: string) => ({
        status: 'ready_to_generate', rawSourceHash: hashSource(source),
        candidates: [{ id: 'one', label: 'one', start: 0, end: source.length, quote: source }],
        candidate: { id: 'one', label: 'one', start: 0, end: source.length, quote: source },
        canonicalSource: ACTOR_SOURCE, findings: [],
      })) as any,
      createAcceptedForgeActor: (async () => { creates += 1; return { ...actorCreateResult(), actor }; }) as any,
    }, undefined, undefined, undefined, undefined, { initialMode: 'plaintext-actor', directoryKind: 'Actor' });
    (game as any).actors = { contents: [] };
    (game as any).items = { contents: [] };

    expect(root.dataset.currentStep).toBe('input');
    expect(root.workspace.dataset.currentStep).toBe('input');
    expect(root.inputStep.hidden).toBe(false);
    expect(root.reviewStep.hidden).toBe(true);
    expect(root.createdStep.hidden).toBe(true);
    expect(root.advancedWorkspace.hidden).toBe(false);
    expect(root.analyze.hidden).toBe(false);
    expect(root.analyze.dataset.primary).toBe('true');
    expect(primaryWorkspaceActions(root)).toEqual(['analyze']);

    root.source.value = 'one plaintext creature';
    root.displayName.value = 'Plaintext Creature';
    root.source.oninput?.();
    await (application as any).analyze(root);
    expect((application as any).status).toBe('ready_to_generate');
    expect(root.dataset.currentStep).toBe('review');
    expect(root.inputStep.hidden).toBe(true);
    expect(root.reviewStep.hidden).toBe(false);
    expect(root.createdStep.hidden).toBe(true);
    expect(root.generate.hidden).toBe(false);
    expect(root.generate.dataset.primary).toBe('true');
    expect(root.editSource.hidden).toBe(false);
    expect(primaryWorkspaceActions(root)).toEqual(['generate']);

    await (application as any).generate(root);
    expect((application as any).status).toBe('accepted');
    expect((application as any).response).toBeDefined();
    expect(root.create.hidden).toBe(false);
    expect(root.create.disabled).toBe(false);
    expect(root.create.dataset.primary).toBe('true');
    expect(primaryWorkspaceActions(root)).toEqual(['create']);

    await (application as any).create(root);
    expect(creates).toBe(1);
    expect(root.dataset.currentStep).toBe('created');
    expect(root.workspace.dataset.currentStep).toBe('created');
    expect(root.inputStep.hidden).toBe(true);
    expect(root.reviewStep.hidden).toBe(true);
    expect(root.createdStep.hidden).toBe(false);
    expect(root.createdDocument.hidden).toBe(false);
    expect(root.openCreated.hidden).toBe(false);
    expect(root.openCreated.dataset.primary).toBe('true');
    expect(root.advancedWorkspace.hidden).toBe(true);
    expect(primaryWorkspaceActions(root)).toEqual(['openCreated']);

    root.clear.onclick?.();
    expect((application as any).status).toBe('empty');
    expect((application as any).response).toBeUndefined();
    expect(root.source.value).toBe('');
    expect(root.dataset.currentStep).toBe('input');
    expect(root.inputStep.hidden).toBe(false);
    expect(root.reviewStep.hidden).toBe(true);
    expect(root.createdStep.hidden).toBe(true);
    expect(root.createdDocument.hidden).toBe(true);
    expect(root.analyze.hidden).toBe(false);
    expect(root.analyze.dataset.primary).toBe('true');
    expect(primaryWorkspaceActions(root)).toEqual(['analyze']);
    await application.close();
  });

  test('keeps accepted proof while returning to edit, then retains creation while a new analysis is prepared', async () => {
    const analyzedSources: string[] = [];
    let creates = 0;
    const { application, root, notifications } = makeApplication({
      analyzePlaintextActorSource: ((source: string) => {
        analyzedSources.push(source);
        return {
          status: 'ready_to_generate', rawSourceHash: hashSource(source),
          candidates: [{ id: 'one', label: 'one', start: 0, end: source.length, quote: source }],
          candidate: { id: 'one', label: 'one', start: 0, end: source.length, quote: source },
          canonicalSource: ACTOR_SOURCE, findings: [],
        };
      }) as any,
      createAcceptedForgeActor: (async () => { creates += 1; return actorCreateResult(); }) as any,
    }, undefined, undefined, undefined, undefined, { initialMode: 'plaintext-actor', directoryKind: 'Actor' });
    root.source.value = 'original plaintext creature';
    root.displayName.value = 'Original Creature';
    root.source.oninput?.();
    await (application as any).analyze(root);
    await (application as any).generate(root);
    const acceptedResponse = (application as any).response;
    const acceptedSnapshot = (application as any).snapshot;
    expect((application as any).status).toBe('accepted');
    expect(root.create.disabled).toBe(false);

    root.editSource.onclick?.();
    expect((application as any).status).toBe('accepted');
    expect((application as any).response).toBe(acceptedResponse);
    expect((application as any).snapshot).toBe(acceptedSnapshot);
    expect(root.dataset.currentStep).toBe('input');
    expect(root.resumeReview.hidden).toBe(false);
    expect(root.create.hidden).toBe(true);
    expect(primaryWorkspaceActions(root)).toEqual(['resumeReview']);

    root.resumeReview.onclick?.();
    expect(root.dataset.currentStep).toBe('review');
    expect((application as any).response).toBe(acceptedResponse);
    expect(root.create.hidden).toBe(false);
    expect(root.create.disabled).toBe(false);
    expect(primaryWorkspaceActions(root)).toEqual(['create']);

    root.source.value = 'mutated plaintext creature';
    root.source.oninput?.();
    expect((application as any).status).toBe('accepted');
    expect((application as any).response).toBe(acceptedResponse);
    expect((application as any).staleFinding).toEqual(expect.objectContaining({ code: 'STALE_SNAPSHOT', blocking: true }));
    expect(root.dataset.currentStep).toBe('input');
    expect(root.create.hidden).toBe(true);
    expect(root.create.disabled).toBe(false);
    expect(root.regenerate.hidden).toBe(false);
    expect(root.regenerate.dataset.primary).toBe('true');
    expect(primaryWorkspaceActions(root)).toEqual(['regenerate']);
    expect(creates).toBe(0);

    await (application as any).regenerate(root);
    expect(analyzedSources).toEqual(['original plaintext creature', 'mutated plaintext creature']);
    expect((application as any).status).toBe('ready_to_generate');
    expect((application as any).response).toBe(acceptedResponse);
    expect(root.dataset.currentStep).toBe('review');
    expect(root.create.hidden).toBe(false);
    expect(root.create.dataset.primary).toBe('true');
    expect(primaryWorkspaceActions(root)).toEqual(['create']);
    await application.close();
  });

  test('keeps a pending request cancellable in the review stage', async () => {
    const source = 'pending cancellable creature';
    const { application, root } = makeApplication({
      createBrowserAiProvider: (() => ({})) as any,
      analyzeBrowserActorSourceWithAi: (async (_input: any, _provider: any, signal?: AbortSignal) => await new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })) as any,
    }, undefined, undefined, undefined, undefined, { initialMode: 'ai-monster', directoryKind: 'Actor' });
    setAiForm(application, root, 'ai-monster', source);
    const pending = (application as any).analyze(root);
    await Promise.resolve();
    expect(root.dataset.currentStep).toBe('review');
    expect(root.cancel.hidden).toBe(false);
    expect(root.cancel.disabled).toBe(false);
    expect(primaryWorkspaceActions(root)).toEqual([]);
    root.cancel.onclick?.();
    await pending;
    expect((application as any).status).toBe('failed');
    expect(root.cancel.hidden).toBe(true);
    expect(root.diagnosticList.innerHTML).toContain('INTAKE_CANCELLED');
    await application.close();
  });

  test('keeps imported accepted history read-only until an explicit fresh attempt', async () => {
    let providerCalls = 0;
    let actorCreates = 0;
    const { application, root } = makeApplication({
      createBrowserAiProvider: (() => { providerCalls += 1; return {}; }) as any,
      createAcceptedForgeActor: (async () => { actorCreates += 1; return actorCreateResult(); }) as any,
    }, undefined, undefined, undefined, undefined, { initialMode: 'ai-monster', directoryKind: 'Actor' });
    root.source.value = 'live draft must survive import';
    root.reviewBundleFile.files = [reviewBundleFile(acceptedReviewBundleText())];
    await (application as any).importBundle(root);

    expect((application as any).importedReview.bundle.status).toBe('accepted');
    expect(root.dataset.currentStep).toBe('review');
    expect(root.reviewStep.hidden).toBe(false);
    expect(root.inputStep.hidden).toBe(true);
    expect(root.create.hidden).toBe(true);
    expect(root.create.disabled).toBe(true);
    expect(root.startNewAttempt.hidden).toBe(false);
    expect(root.startNewAttempt.disabled).toBe(false);
    expect(primaryWorkspaceActions(root)).toEqual(['startNewAttempt']);
    await (application as any).create(root);
    expect({ providerCalls, actorCreates }).toEqual({ providerCalls: 0, actorCreates: 0 });

    root.startNewAttempt.onclick?.();
    expect((application as any).importedReview).toBeUndefined();
    expect((application as any).status).toBe('empty');
    expect((application as any).recoveredFrom).toEqual(expect.objectContaining({ status: 'accepted' }));
    expect(root.source.value).toBe('Rat source');
    expect(root.displayName.value).toBe('Rat');
    expect(root.mode.value).toBe('ai-monster');
    expect(root.dataset.currentStep).toBe('input');
    expect(root.inputStep.hidden).toBe(false);
    expect(root.reviewStep.hidden).toBe(true);
    expect(root.startNewAttempt.hidden).toBe(true);
    expect(root.analyze.hidden).toBe(false);
    expect(root.create.disabled).toBe(true);
    expect(primaryWorkspaceActions(root)).toEqual(['analyze']);
    await application.close();
  });

  test('keeps the stage renderer selectors aligned with the Forge Intake template', () => {
    const template = readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-intake.hbs', 'utf8');
    for (const selector of [
      'forge-workspace"', 'data-workspace-scroll', 'data-advanced-workspace',
      'data-step="input"', 'data-step="review"', 'data-step="created"',
      'data-step-indicator="input"', 'data-step-indicator="review"', 'data-step-indicator="created"',
      'data-workspace-hint', 'data-created-document',
    ]) expect(template).toContain(selector);
    for (const action of ['analyze', 'edit-source', 'resume-review', 'generate', 'create', 'regenerate', 'open-created', 'clear', 'cancel']) {
      expect(template).toContain(`data-action="${action}"`);
    }
  });

  test('shows the created Document entry and opens its public sheet', async () => {
    let renders = 0;
    const actor = { sheet: { render: () => { renders += 1; } } };
    const { application, root, game } = makeApplication({
      analyzePlaintextActorSource: ((source: string) => ({
        status: 'ready_to_generate', rawSourceHash: hashSource(source), candidates: [{ id: 'one', label: 'one', start: 0, end: source.length, quote: source }],
        candidate: { id: 'one', label: 'one', start: 0, end: source.length, quote: source }, canonicalSource: ACTOR_SOURCE, findings: [],
      })) as any,
      createAcceptedForgeActor: (async () => ({ ...actorCreateResult(), actor })) as any,
    }, undefined, undefined, undefined, undefined, { directoryKind: 'Actor', initialMode: 'plaintext-actor' });
    (game as any).actors = { contents: [{}] };
    (game as any).items = { contents: [{}, {}] };
    root.mode.value = 'plaintext-actor';
    root.source.value = 'one plaintext creature';
    root.displayName.value = 'Plaintext Creature';
    await (application as any).analyze(root);
    await (application as any).generate(root);
    expect(root.humanPreview.innerHTML).toContain('夜魇');
    expect(root.humanPreview.innerHTML).toContain('136 / 136');
    expect(root.humanPreview.innerHTML).toContain('16');
    await (application as any).create(root);
    expect(root.createdDocument.hidden).toBe(false);
    expect(root.createdDocument.innerHTML).toContain('Actor.intake');
    expect(root.createdDocument.innerHTML).toContain('世界中 Actor 1');
    (application as any).openCreatedDocument();
    expect(renders).toBe(1);
  });

  test('a hydrated spell with a literal qualifier remains created and shows the concrete GM note', async () => {
    const actor={flags:{'fvtt-json-generator-spell-resolver':{
      spellManifest:{spellcastingGroups:[{groupId:'aid',spellRefs:[{refId:'bless',englishName:'Bless'}]}]},
      spellResolution:{status:'hydrated',report:{literalRestrictions:[{groupId:'aid',refId:'bless',kind:'casting',text:'using the same spellcasting ability as Spellcasting.'}]}}
    }}};
    const {application,root}=makeApplication({
      analyzePlaintextActorSource: ((source:string)=>({status:'ready_to_generate',rawSourceHash:hashSource(source),candidate:{id:'one',label:'one',start:0,end:source.length,quote:source},canonicalSource:ACTOR_SOURCE,findings:[]})) as any,
      createAcceptedForgeActor:(async()=>({...actorCreateResult(),actor})) as any,
    },undefined,undefined,undefined,undefined,{directoryKind:'Actor',initialMode:'plaintext-actor'});
    root.mode.value='plaintext-actor';root.source.value='one creature';root.displayName.value='Spell qualifier';
    await (application as any).analyze(root);await (application as any).generate(root);await (application as any).create(root);
    expect(root.createdDocument.hidden).toBe(false);
    expect(root.completionIssues.innerHTML).toContain('Bless');
    expect(root.completionIssues.innerHTML).toContain('已按 AI 给出的参数录入施法活动');
    expect(root.completionIssues.innerHTML).toContain('using the same spellcasting ability as Spellcasting.');
    expect(root.completionIssues.innerHTML).not.toContain('原生施法未完成');
  });

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
      generateBrowserItemIntakeCandidate: (async () => ({
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
    expect(root.humanPreview.innerHTML).toContain('骑士之盾');
    expect(root.humanPreview.innerHTML).not.toContain('[object Object]');
    await (application as any).create(root);
    expect(itemCreates).toBe(1);
    expect(actorCreates).toBe(0);
  });

  test('disabled Item review leaves a local candidate available for GM approval and export [review disabled]', async () => {
    const source = 'current AI Item source';
    const analysis = readyItemAnalysis(source);
    const calls = { generate: 0, review: 0, approve: 0, create: 0 };
    const aiFinding = { id: 'ai-warning', code: 'AI_WARNING', path: '/', message: 'AI 建议人工检查', blocking: true, origin: 'ai-review' };
    const { application, root } = makeApplication({
      createBrowserItemAiProvider: (() => ({})) as any,
      analyzeBrowserItemSourceWithAi: (async () => analysis) as any,
      generateBrowserItemIntakeCandidate: (async (input: any) => {
        calls.generate += 1;
        const request = buildForgeItemRequest({ content: ITEM_SOURCE, displayName: input.displayName || input.sourceName,
          requestId: input.requestId, fvttVersion: input.fvttVersion, systemVersion: input.systemVersion });
        const response = await convertFinalItemSource(request);
        if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Item fixture failed.');
        return { status: 'ready_for_gm_review', analysis, rawSourceHash: hashSource(source),
          finalSource: request.source.content, finalSourceHash: request.source.utf8Sha256,
          candidateResponse: response, candidateHash: hashSource(`candidate:${source}`),
          itemProjection: response.result.artifact, formalStatus: 'accepted', modelReviewStatus: 'not_requested',
          deterministicFindings: [], findings: [], stages: [], provider: analysis.provider,
          calls: { ...analysis.calls, review: 0 } };
      }) as any,
      reviewBrowserItemIntakeCandidate: (async (_input: any, current: any) => {
        calls.review += 1;
        return { ...current, modelReviewStatus: 'needs_review',
          review: { schemaVersion: 1, verdict: 'needs_review', findings: [aiFinding] },
          modelReviewFindings: [aiFinding], modelReviewFindingsHash: forgeGmModelFindingsHash([aiFinding]),
          findings: [aiFinding],
          calls: { ...current.calls, review: 1 } };
      }) as any,
      approveBrowserItemIntakeCandidateForGm: ((input: any, current: any, gmId: string) => {
        calls.approve += 1;
        expect(input.source).toBe(source);
        expect(gmId).toBe('test-user');
        const result = current.candidateResponse.result;
        return { ...current, status: 'accepted', response: current.candidateResponse,
          gmApproval: { gmId, sourceHash: hashSource(input.source), finalSourceHash: current.finalSourceHash,
            artifactHash: result.artifactHash, targetHash: forgeGmTargetHash(result.target),
            candidateHash: current.candidateHash, modelReviewStatus: current.modelReviewStatus,
            modelFindingsHash: forgeGmModelFindingsHash(current.modelReviewFindings ?? []) } };
      }) as any,
      createAcceptedForgeItem: (async () => { calls.create += 1; return itemCreateResult(); }) as any,
    });
    setAiForm(application, root, 'ai-item', source);
    await (application as any).analyze(root);
    await (application as any).generate(root);
    expect(calls).toEqual({ generate: 1, review: 0, approve: 0, create: 0 });
    expect((application as any).status).toBe('ready_for_gm_review');
    expect(root.modelReview.hidden).toBe(true);
    expect(root.create.disabled).toBe(false);
    expect(root.humanSummary.textContent).toContain('AI 内容复核已暂时关闭');
    await (application as any).reviewCandidate(root);
    expect(calls).toEqual({ generate: 1, review: 0, approve: 0, create: 0 });
    expect(root.diagnosticList.innerHTML).not.toContain('AI_WARNING');
    expect(root.create.textContent).not.toContain('仍有AI提示');
    expect(root.create.disabled).toBe(false);
    await (application as any).create(root);
    expect(calls).toEqual({ generate: 1, review: 0, approve: 1, create: 1 });
    const bundle = (application as any).buildBundle({ mode: 'ai-item', displayName: root.displayName.value,
      protocol: root.protocol.value, region: root.region.value, reasoning: root.reasoning.value,
      structuredOutput: root.structuredOutput.value, autoCorrect: false });
    const imported = decodeForgeIntakeReviewBundleText(JSON.stringify(bundle));
    expect(imported.bundle.modelReviewStatus).toBe('not_requested');
    expect(imported.bundle.aiReviewFindings??[]).toEqual([]);
    expect(imported.bundle.gmApproval?.modelFindingsHash).toBe(forgeGmModelFindingsHash(imported.bundle.aiReviewFindings));
  });

  test('creates a current Item candidate through GM approval without any model review or connection recheck', async () => {
    const source = 'GM-only Item source';
    const analysis = readyItemAnalysis(source);
    let reviews = 0;
    let approvals = 0;
    let creates = 0;
    const { application, root } = makeApplication({
      createBrowserItemAiProvider: (() => ({})) as any,
      analyzeBrowserItemSourceWithAi: (async () => analysis) as any,
      generateBrowserItemIntakeCandidate: (async () => ({
        status: 'ready_for_gm_review', analysis, rawSourceHash: hashSource(source),
        finalSource: ITEM_SOURCE, finalSourceHash: acceptedItemResult().sourceIdentity.sourceHash,
        candidateResponse: acceptedItem, formalStatus: 'accepted', modelReviewStatus: 'not_requested',
        deterministicFindings: [], findings: [], stages: [], provider: analysis.provider,
        calls: { ...analysis.calls, review: 0 },
      })) as any,
      reviewBrowserItemIntakeCandidate: (async () => { reviews += 1; throw new Error('Unexpected paid review.'); }) as any,
      approveBrowserItemIntakeCandidateForGm: ((_input: any, current: any) => {
        approvals += 1;
        return { ...current, status: 'accepted', response: acceptedItem, gmApproval: { gmId: 'test-user', modelReviewStatus: 'not_requested' } };
      }) as any,
      createAcceptedForgeItem: (async () => { creates += 1; return itemCreateResult(); }) as any,
    });
    setAiForm(application, root, 'ai-item', source);
    await (application as any).analyze(root);
    await (application as any).generate(root);
    root.apiKey.value = '';
    (application as any).connectionProbe = undefined;
    await (application as any).create(root);
    expect({ reviews, approvals, creates }).toEqual({ reviews: 0, approvals: 1, creates: 1 });
  });

  test('shared session key clearing keeps Actor and Item local GM creation while revoking paid review [review disabled]', async () => {
    for (const mode of ['ai-monster', 'ai-item'] as const) {
      saveForgeSessionSettings({ ...forgeSessionSettingsFixture(), apiKey: 'session-key' });
      markForgeSessionConnectionTested();
      const source = `${mode} shared session source`;
      const analysis = mode === 'ai-item' ? readyItemAnalysis(source) : readyActorAnalysis(source);
      let reviews = 0;
      let approvals = 0;
      let creates = 0;
      const candidate = {
        status: 'ready_for_gm_review', analysis, rawSourceHash: hashSource(source),
        finalSource: mode === 'ai-item' ? ITEM_SOURCE : ACTOR_SOURCE,
        finalSourceHash: mode === 'ai-item' ? acceptedItemResult().sourceIdentity.sourceHash : (acceptedActor as any).result.sourceIdentity.sourceHash,
        candidateResponse: mode === 'ai-item' ? acceptedItem : acceptedActor,
        formalStatus: 'accepted', modelReviewStatus: 'not_requested',
        deterministicFindings: [], findings: [], stages: [], provider: analysis.provider,
        calls: { ...analysis.calls, review: 0 },
      };
      const { application, root } = makeApplication({
        createBrowserAiProvider: (() => ({})) as any,
        createBrowserItemAiProvider: (() => ({})) as any,
        analyzeBrowserActorSourceWithAi: (async () => analysis) as any,
        analyzeBrowserItemSourceWithAi: (async () => analysis) as any,
        generateBrowserActorIntakeCandidate: (async () => candidate) as any,
        generateBrowserItemIntakeCandidate: (async () => candidate) as any,
        reviewBrowserActorIntakeCandidate: (async () => { reviews += 1; throw new Error('Controlled review failure after key retest.'); }) as any,
        reviewBrowserItemIntakeCandidate: (async () => { reviews += 1; throw new Error('Controlled review failure after key retest.'); }) as any,
        approveBrowserActorIntakeCandidateForGm: ((_input: any, current: any) => { approvals += 1; return { ...current, status: 'accepted', response: acceptedActor }; }) as any,
        approveBrowserItemIntakeCandidateForGm: ((_input: any, current: any) => { approvals += 1; return { ...current, status: 'accepted', response: acceptedItem }; }) as any,
        createAcceptedForgeActor: (async () => { creates += 1; return actorCreateResult(); }) as any,
        createAcceptedForgeItem: (async () => { creates += 1; return itemCreateResult(); }) as any,
      }, undefined, undefined, undefined, undefined, { directoryKind: mode === 'ai-item' ? 'Item' : 'Actor', initialMode: mode, legacyConnectionFields: false });
      root.source.value = source;
      root.displayName.value = 'Review object';
      await (application as any).analyze(root);
      await (application as any).generate(root);
      expect((application as any).status).toBe('ready_for_gm_review');
      if (mode === 'ai-item') clearAllForgeSessionApiKeys();
      else saveForgeSessionSettings({ apiKey: '', persistApiKey: false });
      expect(readForgeSessionSettings().apiKey).toBe('');
      expect((application as any).status).toBe('ready_for_gm_review');
      expect(root.create.disabled).toBe(false);
      expect(root.modelReview.disabled).toBe(true);
      await (application as any).reviewCandidate(root);expect(reviews).toBe(0);
      saveForgeSessionSettings({ apiKey: 'session-key' });
      markForgeSessionConnectionTested();
      await (application as any).reviewCandidate(root);
      expect(reviews).toBe(0); // A successful connection probe cannot reopen disabled content review.
      await (application as any).create(root);
      expect({ approvals, creates }).toEqual({ approvals: mode==='ai-item'?1:0, creates: 1 });
      await application.close();
    }
  });

  test('shared credential or model changes abort an in-flight Provider result before it can publish', async () => {
    for (const change of ['credential', 'model'] as const) {
      saveForgeSessionSettings({ ...forgeSessionSettingsFixture(), apiKey: 'session-key' });
      markForgeSessionConnectionTested();
      let finish!: (value: any) => void;
      let requestSignal: AbortSignal | undefined;
      const { application, root } = makeApplication({
        createBrowserAiProvider: ((_options: any, signal: AbortSignal) => { requestSignal = signal; return {}; }) as any,
        analyzeBrowserActorSourceWithAi: (async () => await new Promise(resolve => { finish = resolve; })) as any,
      }, undefined, undefined, undefined, undefined, { directoryKind: 'Actor', initialMode: 'ai-monster', legacyConnectionFields: false });
      root.source.value = `${change} pending source`;
      root.displayName.value = 'Pending Actor';
      const pending = (application as any).analyze(root);
      expect(requestSignal?.aborted).toBe(false);
      if (change === 'credential') saveForgeSessionSettings({ apiKey: '' });
      else saveForgeSessionSettings({ model: 'changed-model' });
      expect(requestSignal?.aborted).toBe(true);
      finish(readyActorAnalysis(root.source.value));
      await pending;
      expect((application as any).analysis).toBeUndefined();
      expect((application as any).status).toBe('needs_review');
      expect(root.create.disabled).toBe(true);
      await application.close();
    }
  });

  test('keeps Actor generation and GM confirmation free of implicit model review', async () => {
    const source = 'GM-only Actor source';
    const analysis = readyActorAnalysis(source);
    let reviews = 0;
    let approvals = 0;
    let creates = 0;
    const { application, root } = makeApplication({
      createBrowserAiProvider: (() => ({})) as any,
      analyzeBrowserActorSourceWithAi: (async () => analysis) as any,
      generateBrowserActorIntakeCandidate: (async () => ({
        status: 'ready_for_gm_review', analysis, rawSourceHash: hashSource(source),
        finalSource: ACTOR_SOURCE, finalSourceHash: ('result' in acceptedActor ? acceptedActor.result.sourceIdentity.sourceHash : hashSource(ACTOR_SOURCE)),
        candidateResponse: acceptedActor, formalStatus: 'accepted', modelReviewStatus: 'not_requested',
        deterministicFindings: [], findings: [], stages: [], provider: analysis.provider,
        calls: { ...analysis.calls, review: 0 },
      })) as any,
      reviewBrowserActorIntakeCandidate: (async () => { reviews += 1; throw new Error('Unexpected paid Actor review.'); }) as any,
      approveBrowserActorIntakeCandidateForGm: ((_input: any, current: any) => {
        approvals += 1;
        return { ...current, status: 'accepted', response: acceptedActor, gmApproval: { gmId: 'test-user', modelReviewStatus: 'not_requested' } };
      }) as any,
      createAcceptedForgeActor: (async () => { creates += 1; return actorCreateResult(); }) as any,
    });
    setAiForm(application, root, 'ai-monster', source);
    await (application as any).analyze(root);
    await (application as any).generate(root);
    expect((application as any).status).toBe('ready_for_gm_review');
    expect(reviews).toBe(0);
    await (application as any).create(root);
    expect({ reviews, approvals, creates }).toEqual({ reviews: 0, approvals: 0, creates: 1 });
  });

  test('retains an ordinary Actor semantic failure and creates through the normal Actor action', async () => {
    if (!('result' in acceptedActor) || acceptedActor.result.status !== 'accepted') throw new Error('Actor fixture required.');
    const source='Complete Actor source with a semantic concern';
    const finding={...blocking('SOURCE_REVIEW_REQUIRED'),origin:'semantic' as const,path:'/creature/actions/0'};
    const analysis={...readyActorAnalysis(source),status:'needs_review',findings:[finding],
      validation:{findings:[finding],blocking:[finding],warnings:[]}};
    const {artifactHash:_artifactHash,...base}=structuredClone(acceptedActor.result);
    const response:ForgeActorResponse={protocolVersion:1,requestId:acceptedActor.requestId,result:{...base,status:'failed',
      verification:{...base.verification,status:'failed'},diagnostics:[{code:'SOURCE_REVIEW_REQUIRED',severity:'error',
        stage:'semantic',path:'actor',message:'The complete source rule still needs review.'}]}};
    let reviews=0,repairs=0,approvals=0,strictCreates=0,reviewedCreates=0;
    const downloads:Array<{fileName:string;content:string}>=[];
    const {application,root,notifications}=makeApplication({
      createBrowserAiProvider:(()=>({})) as any,
      analyzeBrowserActorSourceWithAi:(async()=>analysis) as any,
      repairBrowserActorIntake:(async()=>{repairs++;throw new Error('No implicit correction.');}) as any,
      generateBrowserActorIntakeCandidate:(async()=>({status:'ready_for_gm_review',candidateAvailable:true,analysis,
        rawSourceHash:hashSource(source),finalSource:ACTOR_SOURCE,finalSourceHash:base.sourceIdentity.sourceHash,
        candidateResponse:response,formalStatus:'failed',intakeVerificationStatus:'needs_review',modelReviewStatus:'not_requested',
        deterministicFindings:[finding],findings:[finding],stages:[],provider:analysis.provider,calls:analysis.calls})) as any,
      reviewBrowserActorIntakeCandidate:(async()=>{reviews++;throw new Error('No implicit paid review.');}) as any,
      approveBrowserActorIntakeCandidateForGm:((_input:any,current:any,gmId:string)=>{
        approvals++;expect(gmId).toBe('test-user');expect(current.findings).toContainEqual(finding);
        return{...current,response,gmApproval:{gmId,finalSourceHash:base.sourceIdentity.sourceHash,artifactHash:hashArtifact(base.artifact)}};
      }) as any,
      createAcceptedForgeActor:(async({response:current}:any)=>{strictCreates++;expect(current).toBe(response);return actorCreateResult();}) as any,
      createReviewedForgeActorCandidate:(async(input:any)=>{
        reviewedCreates++;expect(input.response).toBe(response);expect(input.rawSourceHash).toBe(hashSource(source));
        expect(input.reviewApproval).toMatchObject({gmId:'test-user',sourceHash:base.sourceIdentity.sourceHash,artifactHash:hashArtifact(base.artifact)});
        expect(input.reviewApproval.findingsHash).toMatch(/^[a-f0-9]{64}$/u);
        expect(input.response.result.status).toBe('failed');expect(input.response.result.diagnostics[0].severity).toBe('error');
        expect(input.response.result.artifact.items).toEqual(base.artifact.items);
        return actorCreateResult();
      }) as any,
      downloadReviewBundle:((fileName:string,content:string)=>downloads.push({fileName,content})) as any,
    });
    const query=root.querySelector.bind(root),download=control('');
    root.querySelector=(selector:string)=>selector==='[data-action="download-actor"]'?download:query(selector);
    (application as any)._onRender({},{});
    setAiForm(application,root,'ai-monster',source);
    await (application as any).analyze(root);
    expect((application as any).status).toBe('needs_review');expect(root.generate.disabled).toBe(false);
    await (application as any).generate(root);
    expect((application as any).status).toBe('ready_for_gm_review');expect(root.create.disabled).toBe(false);
    expect((application as any).generation.formalStatus).toBe('failed');
    expect(JSON.parse(root.json.textContent)).toEqual(base.artifact);
    expect(root.rawSource.textContent).toBe(source);
    expect(root.canonical.textContent).toBe(ACTOR_SOURCE);
    expect(root.diagnostics.hidden).toBe(false);
    expect(root.diagnosticList.innerHTML).toContain('SOURCE_REVIEW_REQUIRED');
    expect(root.humanSummary.textContent).toContain('这些问题不会阻止生成或创建');
    expect(root.humanSummary.textContent).toContain('AI内容复核已暂停');
    expect(root.humanSummary.textContent).not.toContain('本地校验通过');
    expect(download.disabled).toBe(false);download.onclick?.();
    expect(downloads).toHaveLength(1);expect(downloads[0]!.fileName).toMatch(/^forge-actor-.+\.json$/u);
    expect(JSON.parse(downloads[0]!.content)).toEqual(base.artifact);
    expect({repairs,reviews,approvals,strictCreates,reviewedCreates}).toEqual({repairs:0,reviews:0,approvals:0,strictCreates:0,reviewedCreates:0});
    await (application as any).create(root);
    expect({repairs,reviews,approvals,strictCreates,reviewedCreates}).toEqual({repairs:0,reviews:0,approvals:0,strictCreates:1,reviewedCreates:0});
    expect((application as any).generation.formalStatus).toBe('failed');
    expect((application as any).response.result.status).toBe('failed');
    expect(root.completionDiagnostics.hidden).toBe(false);
    expect(root.completionIssues.innerHTML).toContain('SOURCE_REVIEW_REQUIRED');
    expect(notifications.errors).toEqual([]);
    await application.close();
  });

  test('keeps a candidate pending when the final local GM hash check rejects it', async () => {
    const source = 'stale hash Item source';
    const analysis = readyItemAnalysis(source);
    let creates = 0;
    const { application, root, notifications } = makeApplication({
      createBrowserItemAiProvider: (() => ({})) as any,
      analyzeBrowserItemSourceWithAi: (async () => analysis) as any,
      generateBrowserItemIntakeCandidate: (async () => ({
        status: 'ready_for_gm_review', analysis, rawSourceHash: hashSource(source),
        finalSource: ITEM_SOURCE, finalSourceHash: acceptedItemResult().sourceIdentity.sourceHash,
        candidateResponse: acceptedItem, formalStatus: 'accepted', modelReviewStatus: 'not_requested',
        deterministicFindings: [], findings: [], stages: [], provider: analysis.provider,
        calls: { ...analysis.calls, review: 0 },
      })) as any,
      approveBrowserItemIntakeCandidateForGm: (() => { throw new Error('候选哈希已变化'); }) as any,
      createAcceptedForgeItem: (async () => { creates += 1; throw new Error('Rejected candidate reached world creation.'); }) as any,
    });
    setAiForm(application, root, 'ai-item', source);
    await (application as any).analyze(root);
    await (application as any).generate(root);
    await (application as any).create(root);
    expect((application as any).status).toBe('ready_for_gm_review');
    expect(creates).toBe(0);
    expect(notifications.errors.at(-1)).toContain('候选哈希已变化');
  });

  test('never starts generation after GM authority or the exact runtime changes following analysis', async () => {
    for (const drift of ['gm', 'runtime'] as const) {
      let generations = 0;
      const source = `drift-${drift}`;
      const analysis = readyItemAnalysis(source);
      const { application, root, game } = makeApplication({
        createBrowserItemAiProvider: (() => ({})) as any,
        analyzeBrowserItemSourceWithAi: (async () => analysis) as any,
        generateBrowserItemIntakeCandidate: (async () => { generations += 1; throw new Error('Stale authority reached generation.'); }) as any,
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

  test('does not create without an artifact and retains an existing Actor across source edits', async () => {
    let creates = 0;
    const source = 'review-required monster';
    const needs = { ...readyActorAnalysis(source), status: 'needs_review', findings: [blocking('EVIDENCE_DRIFT')] };
    const { application, root } = makeApplication({
      createBrowserAiProvider: (() => ({})) as any,
      analyzeBrowserActorSourceWithAi: (async () => needs) as any,
      createAcceptedForgeActor: (async () => { creates += 1; return actorCreateResult(); }) as any,
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
    expect((application as any).response).toBe(acceptedActor);
    expect(root.diagnosticList.innerHTML).toContain('STALE_SNAPSHOT');
    await (application as any).create(root);
    expect(creates).toBe(1);
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

  test('renders safe response observation and distinct termination causes in its actual report and activity card', () => {
    const {application,root}=makeApplication();
    const activity={phase:'receiving_response',transport:'body_open',providerActivity:'unknown',elapsedMs:300013,
      lastEventAtMs:Date.now(),outputCharactersReceived:0,responseHeadersAtMs:Date.now()-300000,
      firstDataAtMs:Date.now()-5,lastDataAtMs:Date.now(),receivedBytes:12,keepAliveCount:2};
    (application as any).providerActivity=activity;
    (application as any).renderResult(root);
    expect(root.activitySummary.textContent).toContain('已经接通');
    expect(root.activityDetail.textContent).toContain('12 字节');
    expect(root.activityDetail.textContent).toContain('不能证明模型已开始生成');
    expect(JSON.parse(root.metadata.textContent).providerObservation.receivedBytes).toBe(12);
    for(const [failureReason,label] of [['deadline_exceeded','等待上限'],['user_cancelled','主动取消'],
      ['connection_failed','连接失败'],['response_interrupted','回复接收中断'],['provider_incomplete','尚未完成'],['invalid_json','格式无法读取'],
      ['provider_error','错误信息'],['unexpected_response','结构无法识别'],['empty_response','没有答案'],['invalid_encoding','编码无法读取']]){
      (application as any).providerActivity={...activity,phase:'failed',failureReason};
      (application as any).renderResult(root);
      expect(root.activitySummary.textContent).toContain(label);
      expect(JSON.parse(root.metadata.textContent).providerObservation.failureReason).toBe(failureReason);
    }
    for(const [failureEvidenceStatus,label]of [['saved','现场已保存'],['save_failed','现场保存失败'],['not_configured','正文未保存'],['metadata_only','未提供回复正文']]){
      (application as any).providerActivity={...activity,phase:'failed',failureReason:'provider_error',failureEvidenceStatus};
      (application as any).renderResult(root);
      expect(root.activityDetail.textContent).toContain(label);
      expect(JSON.parse(root.metadata.textContent).providerObservation.failureEvidenceStatus).toBe(failureEvidenceStatus);
    }
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

  test('retains formal plaintext warnings with the generated Actor', async () => {
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
    expect((application as any).status).toBe('ready_for_gm_review');
    expect((application as any).response).toBe(warningResponse);
    expect(JSON.stringify((application as any).generation)).not.toContain('artifactHash');
    expect((application as any).generation.findings).toContainEqual(expect.objectContaining({
      code: 'FORMAL_WARNING', blocking: true, origin: 'formal-workflow',
    }));
    expect(root.create.disabled).toBe(false);
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
      generatorProfile: 'v14', effectProfile: 'core', iconMode: 'safe',
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

  test('reads Actor history after a GM-role change without changing the live source', async () => {
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

    expect((application as any).importedReview).toBeDefined();
    expect(root.source.value).toBe('preserve me');
    expect(notifications.errors).toEqual([]);
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

  test('keeps the current user local Actor library and queue readable after authority or runtime changes', async () => {
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

      expect(root.libraryList.innerHTML).toContain('Sensitive library label');
      expect(root.libraryList.innerHTML).not.toContain('metadata 已隐藏');
      expect(root.batchList.innerHTML).toContain('Sensitive batch label');
      expect(root.batchList.innerHTML).not.toContain('metadata 已隐藏');
      expect(root.libraryRefresh.disabled).toBe(false);
      expect(root.sourceLibraryFile.disabled).toBe(false);
      expect(root.batchRefresh.disabled).toBe(false);
      expect(root.batchCollectionFile.disabled).toBe(false);
    }
  });

  test('refreshes the current user local Actor library after a GM-role change', async () => {
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
    expect((application as any).libraryState.sources).toHaveLength(1);
    expect(notifications.errors).toEqual([]);
  });

  test('reads an Actor library file into the local store after a GM-role change', async () => {
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
    expect((await shared.load()).sources).toHaveLength(1);
    expect(notifications.errors).toEqual([]);
  });

  test('actor read access: Item local metadata keeps its original authority gate',async()=>{
    const library=new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
    await library.saveSource({objectKind:'item',mode:'ai-item',sourceLabel:'Item record',rawSource:'Item source'});
    const x=makeApplication({},undefined,library,undefined,undefined,{directoryKind:'Item',initialMode:'ai-item'});
    try{
      await settleLibrary(x.application,x.root);expect(x.root.libraryList.innerHTML).toContain('Item record');
      x.game.user.isGM=false;x.hooks.call('updateUser');
      expect(x.root.libraryList.innerHTML).toContain('metadata 已隐藏');expect(x.root.libraryRefresh.disabled).toBe(true);
    }finally{await x.application.close();}
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

  test('reads an Actor collection into the local queue after a GM-role change', async () => {
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
    expect((await batchQueue.load()).collections).toHaveLength(1);
    expect(notifications.errors).toEqual([]);
  });

  test('keeps current user Actor queue metadata readable during an asynchronous authority change', async () => {
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
    expect((application as any).batchState).toEqual(visible);
    expect(root.batchList.innerHTML).not.toContain('Queue metadata 已隐藏');
    expect(root.batchList.innerHTML).toContain('Visible before drift');
    expect(root.batchRun.disabled).toBe(false);
    expect(notifications.errors).toEqual([]);
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

  test('batch retains a local Item candidate until one GM confirmation approves and creates it without model review', async () => {
    const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    let reviews = 0;
    let approvals = 0;
    let creates = 0;
    const { application, root, notifications } = makeApplication({
      createBrowserItemAiProvider: (() => ({})) as any,
      analyzeBrowserItemSourceWithAi: (async (input: any) => readyItemAnalysis(input.source)) as any,
      generateBrowserItemIntakeCandidate: (async (input: any, analysis: any) => {
        const request = buildForgeItemRequest({ content: ITEM_SOURCE, displayName: input.displayName || input.sourceName,
          requestId: input.requestId, fvttVersion: input.fvttVersion, systemVersion: input.systemVersion });
        const response = await convertFinalItemSource(request);
        if (!('result' in response) || response.result.status !== 'accepted') throw new Error('Item fixture failed.');
        return { status: 'ready_for_gm_review', analysis, rawSourceHash: hashSource(input.source),
          finalSource: request.source.content, finalSourceHash: request.source.utf8Sha256,
          candidateResponse: response, candidateHash: hashSource(`candidate:${input.source}`),
          itemProjection: response.result.artifact, formalStatus: 'accepted', modelReviewStatus: 'not_requested',
          deterministicFindings: [], findings: [], stages: [], provider: analysis.provider,
          calls: { ...analysis.calls, review: 0 } };
      }) as any,
      reviewBrowserItemIntakeCandidate: (async () => { reviews += 1; throw new Error('Unexpected model review.'); }) as any,
      approveBrowserItemIntakeCandidateForGm: ((input: any, current: any, gmId: string) => {
        approvals += 1;
        const result = current.candidateResponse.result;
        return { ...current, status: 'accepted', response: current.candidateResponse,
          gmApproval: { gmId, sourceHash: hashSource(input.source), finalSourceHash: current.finalSourceHash,
            artifactHash: result.artifactHash, targetHash: forgeGmTargetHash(result.target),
            candidateHash: current.candidateHash, modelReviewStatus: 'not_requested', modelFindingsHash: forgeGmModelFindingsHash([]) } };
      }) as any,
      createAcceptedForgeItem: (async ({ response }: any) => {
        creates += 1;
        const sourceId = response.result.sourceIdentity.sourceId;
        return { ...itemCreateResult(), uuid: `Item.${hashArtifact({ sourceId }).slice(0, 16)}` };
      }) as any,
    }, undefined, undefined, async () => true, batchQueue);
    await settleBatch(application, root);
    root.provider.value = 'custom'; root.endpoint.value = 'https://provider.example/v1';
    root.protocol.value = 'openai-chat'; root.authScheme.value = 'bearer'; root.model.value = 'extract';
    root.reviewModel.value = 'review'; root.apiKey.value = 'transient';
    authorizeAiConnection(application, root);
    await batchQueue.importCollection(createForgeBatchCollection({ label: 'GM-only Item batch',
      entries: [{ objectKind: 'item', mode: 'ai-item', sourceLabel: 'Item', rawSource: 'batch Item source' }] }));
    await (application as any).refreshBatch(root, false);
    await (application as any).runBatch(root);
    expect((await batchQueue.load()).jobs[0]?.status).toBe('ready_for_gm_review');
    expect({ reviews, approvals, creates }).toEqual({ reviews: 0, approvals: 0, creates: 0 });
    expect(root.batchApply.disabled).toBe(false);
    await (application as any).applyBatch(root);
    expect({ reviews, approvals, creates }).toEqual({ reviews: 0, approvals: 1, creates: 1 });
    expect((await batchQueue.load()).jobs[0]?.status).toBe('applied');
    expect(notifications.errors).toEqual([]);
  });

  test.each(['needs_review', 'failed'] as const)('batch keeps original CRLF source and adopts an Actor with strict %s without claiming acceptance', async (strictStatus) => {
    const fixture = batchCandidateFixture('ai-monster', strictStatus);
    const queue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const { application, root, notifications } = makeApplication(fixture.services, undefined, undefined, async (dialog) => {
      expect(dialog.content).toContain(`正式检查：${strictStatus}`);
      expect(dialog.content).toContain('SOURCE_REVIEW_REQUIRED');
      expect(dialog.content).toContain('不会标为 accepted');
      return true;
    }, queue);
    await settleBatch(application, root);
    setAiForm(application, root, 'ai-monster', '');
    let displayed='';
    Object.defineProperty(root.source,'value',{get:()=>displayed,set:(value:string)=>{displayed=value.replace(/\r\n?/g,'\n');},configurable:true});
    const originalSource='complete source\r\nneeding GM review\r\n';
    await queue.importCollection(createForgeBatchCollection({ label: 'Reviewed Actor batch', entries: [
      { objectKind: 'actor', mode: 'ai-monster', sourceLabel: 'Actor', rawSource: originalSource },
    ] }));
    await application.refreshBatch(root, false);
    await application.runBatch(root);
    const pending = (await queue.load()).jobs[0]!;
    expect(pending.status).toBe('ready_for_gm_review');
    expect(pending.latestReview?.rawSource).toBe(originalSource);
    expect(pending.latestReview?.candidateResponse?.status).toBe(strictStatus);
    expect(root.batchApply.disabled).toBe(false);
    expect(root.batchRun.disabled).toBe(true);
    expect(fixture.counts.reviewedCreates).toBe(0);
    await application.applyBatch(root);
    const applied = (await queue.load()).jobs[0]!;
    expect(applied.status).toBe('applied');
    expect(applied.applyResult?.readbackWarnings).toEqual(['Spear：远射程生成值 60，Foundry 未保留。']);
    expect(root.batchList.innerHTML).toContain('已创建，录入值需要核对');
    expect(root.batchList.innerHTML).toContain('远射程生成值 60');
    expect(applied.latestReview?.status).toBe('ready_for_gm_review');
    expect(applied.latestReview?.candidateResponse?.status).toBe(strictStatus);
    expect(applied.latestReview?.deterministicFindings.some((finding) => finding.blocking)).toBe(true);
    expect(applied.latestReview?.gmApproval).toBeUndefined();
    expect(fixture.counts).toEqual({ analyses: 1, generations: 1, reviewedCreates: 0, strictCreates: 1 });
    expect(notifications.errors).toEqual([]);
    for (const status of ['reviewed_candidate', 'committing_and_reading_back']) {
      root.reviewBundleFile.files = [reviewBundleFile(JSON.stringify({ ...applied.latestReview, status }))];
      await application.importBundle(root);
      expect(root.humanSummary.textContent).toContain(`历史流程状态：${status}`);
      expect(root.humanSummary.textContent).toContain(`正式检查结论：${strictStatus}`);
      expect(root.humanSummary.textContent).not.toContain('显示 accepted');
      expect(root.create.disabled).toBe(true);
      await application.create(root);
    }
    expect(fixture.counts.strictCreates).toBe(1);
    await application.close();
  });

  test.each(['ai-monster', 'ai-item'] as const)('explicitly prepares a fresh %s candidate after reload without reusing old approval', async (mode) => {
    const fixture = batchCandidateFixture(mode, 'accepted');
    const queue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const first = makeApplication(fixture.services, undefined, undefined, async () => true, queue);
    await settleBatch(first.application, first.root);
    setAiForm(first.application, first.root, mode, '');
    await queue.importCollection(createForgeBatchCollection({ label: 'Pending review reload', entries: [
      { objectKind: mode === 'ai-item' ? 'item' : 'actor', mode, sourceLabel: 'Reload', rawSource: 'pending review source' },
    ] }));
    await first.application.refreshBatch(first.root, false);
    await first.application.runBatch(first.root);
    const before = (await queue.load()).jobs[0]!;
    expect(before.status).toBe('ready_for_gm_review');
    expect(first.root.batchApply.disabled).toBe(false);
    await first.application.close();
    const second = makeApplication(fixture.services, undefined, undefined, async () => true, queue);
    await settleBatch(second.application, second.root);
    expect(fixture.counts.analyses).toBe(1);
    expect(second.root.batchApply.disabled).toBe(true);
    expect(second.root.batchRun.disabled).toBe(false);
    expect(second.root.batchSummary.textContent).toContain('不会自动请求模型');
    await second.application.applyBatch(second.root);
    expect(fixture.counts.strictCreates).toBe(0);
    setAiForm(second.application, second.root, mode, '');
    await second.application.runBatch(second.root);
    const after = (await queue.load()).jobs[0]!;
    expect(after.status).toBe('ready_for_gm_review');
    expect(after.attemptCount).toBe(2);
    expect(after.latestReview?.attemptId).not.toBe(before.latestReview?.attemptId);
    expect(after.latestReview?.gmApproval).toBeUndefined();
    expect(fixture.counts.analyses).toBe(2);
    expect(second.root.batchApply.disabled, JSON.stringify(second.notifications)).toBe(false);
    await second.application.applyBatch(second.root);
    expect((await queue.load()).jobs[0]?.status).toBe('applied');
    expect(fixture.counts.strictCreates).toBe(1);
    expect(second.notifications.errors).toHaveLength(1); // explicit apply of history was rejected
    await second.application.close();
  });

  test.each(['artifact', 'source', 'parsing'] as const)('batch rejects an Actor candidate changed at %s after GM sees the confirmation', async (mutation) => {
    const fixture = batchCandidateFixture('ai-monster', 'failed');
    const queue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    let application: any;
    const current = makeApplication(fixture.services, undefined, undefined, async () => {
      const candidate = [...application.batchResponses.values()][0] as any;
      if (mutation === 'source') candidate.input.source += ' changed';
      if (mutation === 'artifact') candidate.candidate.candidateResponse.result.artifact.name = 'changed';
      if (mutation === 'parsing') candidate.candidate.candidateResponse.result.diagnostics[0].stage = 'parse';
      return true;
    }, queue);
    application = current.application;
    await settleBatch(application, current.root);
    setAiForm(application, current.root, 'ai-monster', '');
    await queue.importCollection(createForgeBatchCollection({ label: 'Changed candidate', entries: [
      { objectKind: 'actor', mode: 'ai-monster', sourceLabel: 'Actor', rawSource: 'unchanged source' },
    ] }));
    await application.refreshBatch(current.root, false);
    await application.runBatch(current.root);
    expect(current.root.batchApply.disabled).toBe(false);
    await application.applyBatch(current.root);
    expect(fixture.counts.reviewedCreates + fixture.counts.strictCreates).toBe(mutation==='artifact'?0:1);
    expect((await queue.load()).jobs[0]?.status).toBe(mutation==='artifact'?'ready_for_gm_review':'applied');
    if(mutation==='artifact')expect(current.notifications.errors.at(-1)).toContain('当前候选与确认清单已不一致');else expect(current.notifications.errors).toEqual([]);
    await application.close();
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
      generateBrowserItemIntakeCandidate: (async (input: any, analysis: any) => {
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
    expect(second.root.batchApply.disabled, JSON.stringify(second.notifications)).toBe(false);
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
      generateBrowserItemIntakeCandidate: (async () => { generations += 1; throw new Error('Revoked GM reached generation.'); }) as any,
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

describe('explicit creature source routing and complete ordinary candidate refresh recovery', () => {
  function fixture(mode: 'ai-monster' | 'ai-item') {
    const counts = { discover: 0, extract: 0, create: 0 };
    const actorScopes: Array<'single'|'discover'|undefined> = [], extractionRequests: any[] = [];
    const source = mode === 'ai-item' ? JEWEL_OF_THREE_PRAYERS_SOURCE : LURKER_SOURCE;
    const provider = { providerName: 'fixed-recovery', extractionModel: 'fixed', reviewModel: 'fixed',
      discover: async () => { counts.discover++; return { schemaVersion: 1, candidates: [mode === 'ai-item' ? jewelCandidate()
        : { id: 'lurker', label: '暗影潜妖', start: 0, end: source.length, quote: source }] }; },
      extract: async (request: unknown) => { counts.extract++; extractionRequests.push(structuredClone(request)); return mode === 'ai-item' ? buildJewelOfThreePrayersIr() : buildValidLurkerIr(); },
      review: async () => { throw Error('Unexpected review'); }, repair: async () => { throw Error('Unexpected repair'); } };
    const create = async ({ response }: any) => { counts.create++; return { ...(mode === 'ai-item' ? itemCreateResult() : actorCreateResult()),
      uuid: `${mode === 'ai-item' ? 'Item' : 'Actor'}.${hashArtifact({ sourceId: response.result.sourceIdentity.sourceId }).slice(0, 16)}` }; };
    return { source, counts, actorScopes, extractionRequests, services: { createBrowserAiProvider: (() => provider) as any, createBrowserItemAiProvider: (() => provider) as any,
      analyzeBrowserActorSourceWithAi: (async (input: any, actualProvider: any, signal?: AbortSignal, attempt?: string) => {
        actorScopes.push(input.sourceScope); return analyzeBrowserActorSourceWithAi(input, actualProvider, signal, attempt);
      }) as any,
      createAcceptedForgeActor: create as any, createReviewedForgeActorCandidate: create as any, createAcceptedForgeItem: create as any } };
  }

  test('empty fields and vulnerability: full native note remains visible in the real Actor review preview',async()=>{
    const f=fixture('ai-monster'),note='Piercing damage from weapons wielded by creatures under the effect of a Bless spell';
    const x=makeApplication({...f.services,analyzeBrowserActorSourceWithAi:(async(input:any,provider:any)=>{
      const ir=buildValidLurkerIr();ir.creature.defenses.vulnerabilities=[];ir.creature.defenses.vulnerabilitiesCustom=note;
      return analyzeBrowserActorIntakeDraft(input,ir,provider);
    }) as any});
    try{
      await settleBatch(x.application,x.root);setAiForm(x.application,x.root,'ai-monster',f.source);
      await x.application.runAnalysis(x.root,false);await x.application.generate(x.root);
      expect(x.application.generation.candidateAvailable).toBe(true);expect(x.root.humanPreview.innerHTML).toContain(note);
      expect(x.root.humanPreview.innerHTML).toContain('伤害易伤备注');expect(x.root.create.disabled).toBe(false);
      expect(f.counts).toEqual({discover:0,extract:0,create:0});
    }finally{await x.application.close();}
  });

  test('export recovery scope: visible generated Actor JSON has exactly the normal download UTF8 bytes',async()=>{
    const downloads:Array<{name:string;content:string}>=[];
    const f=fixture('ai-monster'),x=makeApplication({...f.services,downloadReviewBundle:(name,content)=>downloads.push({name,content})});
    try{
      await settleBatch(x.application,x.root);setAiForm(x.application,x.root,'ai-monster',f.source);
      await x.application.runAnalysis(x.root,false);await x.application.generate(x.root);
      expect(x.application.generation.candidateResponse?.result?.artifact).toBeDefined();
      expect(x.root.reviewStep.hidden).toBe(false);expect(x.root.previewSection.hidden).toBe(false);
      expect(x.root.json.hidden).toBe(false);expect(x.root.json.textContent).not.toBe('');
      expect(x.root.downloadActor.hidden).toBe(false);expect(x.root.downloadActor.disabled).toBe(false);
      x.root.downloadActor.onclick();expect(downloads).toHaveLength(1);
      expect(new TextEncoder().encode(x.root.json.textContent)).toEqual(new TextEncoder().encode(downloads[0]!.content));
      expect(JSON.parse(x.root.json.textContent)).toEqual(x.application.generation.candidateResponse.result.artifact);
      expect(downloads[0]!.name).toMatch(/^forge-actor-.*\.json$/u);
    }finally{await x.application.close();}
  });

  test('export recovery scope: strict DialogV2 receiver preserves cancellation and clears only all current recovery records on confirmation',async()=>{
    const f=fixture('ai-monster'),store=new MemoryIntakeCandidateStore(),decisions=[false,true],prompts:any[]=[];
    const x=makeApplication(f.services,async config=>{prompts.push(config);return decisions.shift();},undefined,
      async function(this:{wait:(config:any)=>Promise<boolean>},config:any){return this.wait(config);},undefined,{candidateStore:store});
    try{
      await settleBatch(x.application,x.root);setAiForm(x.application,x.root,'ai-monster',f.source);
      await x.application.runAnalysis(x.root,false);await x.application.generate(x.root);
      const record=(await store.load()).single!;expect(record).toBeDefined();
      await x.sourceLibrary.saveSource({objectKind:'actor',mode:'plaintext-actor',sourceLabel:'Keep library source',rawSource:ACTOR_SOURCE});
      const queued=await x.batchQueue.importCollection(createForgeBatchCollection({label:'Keep queue',entries:[
        {objectKind:'actor',mode:'plaintext-actor',sourceLabel:'Keep job',rawSource:ACTOR_SOURCE}]}));
      const jobKey=queued.jobs[0]!.id;await store.put(jobKey,record);
      const otherScope=new MemoryIntakeCandidateStore({single:record}),otherBefore=await otherScope.load();
      const actors=[{id:'existing-actor'}],items=[{id:'existing-item'}];
      (x.game as any).actors={contents:actors};(x.game as any).items={contents:items};
      const before={records:await store.load(),library:await x.sourceLibrary.load(),queue:await x.batchQueue.load(),
        source:x.root.source.value,json:x.root.json.textContent,status:x.application.status,
        analysis:structuredClone(x.application.analysis),generation:structuredClone(x.application.generation)};
      expect(Object.keys(before.records).sort()).toEqual([jobKey,'single'].sort());
      for(const confirmed of [false,true]){
        x.root.clearCandidateCache.onclick();
        for(let wait=0;wait<50&&x.application.recoveryBusy;wait++)await new Promise(resolve=>setTimeout(resolve,0));
        expect(x.application.recoveryBusy).toBe(false);expect(prompts).toHaveLength(confirmed?2:1);
        expect(await store.load()).toEqual(confirmed?{}:before.records);
        expect(await otherScope.load()).toEqual(otherBefore);
        expect(await x.sourceLibrary.load()).toEqual(before.library);expect(await x.batchQueue.load()).toEqual(before.queue);
        expect((x.game as any).actors.contents).toEqual(actors);expect((x.game as any).items.contents).toEqual(items);
        expect(x.root.source.value).toBe(before.source);expect(x.root.json.textContent).toBe(before.json);
        expect(x.application.status).toBe(before.status);expect(x.application.analysis).toEqual(before.analysis);
        expect(x.application.generation).toEqual(before.generation);expect(x.root.create.disabled).toBe(false);
        expect(x.root.downloadActor.disabled).toBe(false);expect(x.notifications.errors).toEqual([]);
      }
      expect(prompts[0].content).toContain('当前浏览器');expect(prompts[0].content).toContain('全部单条和批量候选恢复记录');
      expect(x.notifications.infos.at(-1)).toContain('已清除');expect(f.counts.create).toBe(0);
    }finally{await x.application.close();}
  });

  for(const outcome of ['returned failure','thrown failure'])test(`same-attempt Actor candidate remains complete after ${outcome}`,async()=>{
    const f=fixture('ai-monster'),store=new MemoryIntakeCandidateStore();
    const first=makeApplication(f.services,undefined,undefined,undefined,undefined,{candidateStore:store});
    await settleBatch(first.application,first.root);setAiForm(first.application,first.root,'ai-monster',f.source);
    await first.application.runAnalysis(first.root,false);await first.application.generate(first.root);
    const previous=structuredClone(first.application.generation);
    expect(first.application.status).toBe('ready_for_gm_review');
    expect(first.root.generate.hidden).toBe(false);expect(first.root.generate.disabled).toBe(false);
    expect(first.root.generate.textContent).toBe('重新生成');expect(first.root.generate.dataset.primary).toBe('false');
    const generate=first.application.services.generateBrowserActorIntakeCandidate;
    first.application.services.generateBrowserActorIntakeCandidate=async(...args:any[])=>{
      if(outcome==='thrown failure')throw Error('local generation report failed');
      return generate({...args[0],renderMarkdown:()=>{throw Error('local converter failed');}},...args.slice(1));
    };
    first.root.generate.onclick();
    for(let wait=0;wait<50&&first.application.controller;wait++)await new Promise(resolve=>setTimeout(resolve,0));
    expect(first.application.controller).toBeUndefined();
    expect(first.application.status).toBe('ready_for_gm_review');
    expect(first.application.generation.candidateResponse).toEqual(previous.candidateResponse);
    expect(first.application.generation.candidateHash).toBe(previous.candidateHash);
    expect(first.application.generation.analysis.ir).toEqual(previous.analysis.ir);
    expect(first.application.generation.findings).toContainEqual(expect.objectContaining({code:outcome==='thrown failure'?'GENERATION_ATTEMPT_FAILED':'CUSTOM_RENDER_INCOMPLETE'}));
    if(outcome==='thrown failure')expect(first.notifications.errors.some((message:string)=>message.includes('此前候选完整保留'))).toBe(true);
    else expect(first.root.diagnosticList.innerHTML).toContain('CUSTOM_RENDER_INCOMPLETE');
    expect(first.root.create.disabled).toBe(false);
    expect(first.root.downloadActor.disabled).toBe(false);expect(first.root.downloadActor.hidden).toBe(false);
    expect(f.counts).toEqual({discover:0,extract:1,create:0});
    const record=(await store.load()).single!;
    expect(record.candidate.candidateResponse).toEqual(previous.candidateResponse);
    await expect(revalidateIntakeCandidate(record,{fvttVersion:'14.364',systemVersion:'5.3.3'})).resolves.toEqual(record);
    await first.application.close();
  });

  test('same-attempt Actor candidate restored without a key retries locally and retains exact JSON on failure',async()=>{
    const f=fixture('ai-monster'),store=new MemoryIntakeCandidateStore();
    const first=makeApplication(f.services,undefined,undefined,undefined,undefined,{candidateStore:store});
    await settleBatch(first.application,first.root);setAiForm(first.application,first.root,'ai-monster',f.source);
    await first.application.runAnalysis(first.root,false);await first.application.generate(first.root);
    const previous=structuredClone(first.application.generation);await first.application.close();
    let factories=0,network=0;const originalFetch=globalThis.fetch;
    const second=makeApplication({createBrowserAiProvider:(()=>{factories++;throw Error('Local retry constructed a network provider');}) as any,
      generateBrowserActorIntakeCandidate:(async(input:any,analysis:any,provider:any,signal?:AbortSignal)=>{
        expect(provider.providerName).toBe(previous.provider.providerName);
        await expect(provider.extract({})).rejects.toThrow('不得请求模型');
        return generateBrowserActorIntakeCandidate({...input,renderMarkdown:()=>{throw Error('local rendering failed');}},analysis,provider,signal);
      }) as any},undefined,undefined,undefined,undefined,{candidateStore:store});
    globalThis.fetch=(async()=>{network++;throw Error('Unexpected model HTTP');}) as unknown as typeof fetch;
    try{
      second.root.apiKey.value='';
      await settleBatch(second.application,second.root);await second.application.restoreSingleCandidate(second.root);
      expect(second.root.apiKey.value).toBe('');expect(second.application.connectionProbe).toBeUndefined();
      expect(second.application.status).toBe('ready_for_gm_review');expect(second.root.generate.hidden).toBe(false);
      expect(second.root.generate.disabled).toBe(false);expect(second.root.generate.textContent).toBe('重新生成');
      second.root.generate.onclick();for(let wait=0;wait<50&&second.application.controller;wait++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(second.application.status).toBe('ready_for_gm_review');
      expect(second.application.generation.candidateResponse).toEqual(previous.candidateResponse);
      expect(second.application.generation.candidateHash).toBe(previous.candidateHash);
      expect(second.application.generation.findings).toContainEqual(expect.objectContaining({code:'CUSTOM_RENDER_INCOMPLETE'}));
      expect(second.root.create.disabled).toBe(false);expect(second.root.downloadActor.disabled).toBe(false);
      expect((await store.load()).single!.candidate.candidateResponse).toEqual(previous.candidateResponse);
      expect({factories,network}).toEqual({factories:0,network:0});expect(f.counts).toEqual({discover:0,extract:1,create:0});
    }finally{globalThis.fetch=originalFetch;await second.application.close();}
  });

  test('restored Actor is read from its saved artifact without rejecting historical extra fields',async()=>{
    const f=fixture('ai-monster'),store=new MemoryIntakeCandidateStore();
    const first=makeApplication(f.services,undefined,undefined,undefined,undefined,{candidateStore:store});
    await settleBatch(first.application,first.root);setAiForm(first.application,first.root,'ai-monster',f.source);
    await first.application.runAnalysis(first.root,false);await first.application.generate(first.root);
    const original=(await store.load()).single!,record=structuredClone(original),candidate=record.candidate as BrowserActorGenerationResult;
    (candidate.analysis.ir!.creature as any).unexpectedStructure='renderer would ignore this';
    candidate.analysis.validation={findings:[],blocking:[],warnings:[]};
    candidate.candidateHash=hashSource(JSON.stringify({rawSourceHash:candidate.analysis.rawSourceHash,ir:candidate.analysis.ir,
      finalSourceHash:candidate.finalSourceHash,response:candidate.candidateResponse}));
    record.bundle.candidateHash=candidate.candidateHash;
    const {checksum,...body}=record;record.checksum=hashSource(JSON.stringify(body));
    const restored=await revalidateIntakeCandidate(record,{fvttVersion:'14.364',systemVersion:'5.3.3'});
    expect(restored.candidate.candidateResponse).toEqual(original.candidate.candidateResponse);
    expect((restored.candidate as BrowserActorGenerationResult).analysis.ir!.creature).toHaveProperty('unexpectedStructure');
    expect((await store.load()).single).toEqual(original);expect(f.counts).toEqual({discover:0,extract:1,create:0});
    await first.application.close();
  });

  test.each(['ai-monster','ai-item'] as const)('single %s restores exact formal candidate without model calls or old approval', async mode => {
    const f = fixture(mode), store = new MemoryIntakeCandidateStore();
    const first = makeApplication(f.services, undefined, undefined, undefined, undefined, { candidateStore: store });
    await settleBatch(first.application, first.root);
    setAiForm(first.application, first.root, mode, f.source);
    await first.application.runAnalysis(first.root, false); await first.application.generate(first.root);
    const record = (await store.load()).single!;
    expect(record, JSON.stringify(first.notifications)).toBeDefined(); expect(record.candidate.gmApproval).toBeUndefined();
    expect(record.input.sourceScope).toBe(mode === 'ai-monster' ? 'single' : undefined);
    expect((record.candidate.analysis as any).sourceScope).toBe(mode === 'ai-monster' ? 'single' : undefined);
    expect(record.candidate.calls.discovery).toBe(mode === 'ai-monster' ? 0 : 1);
    if (mode === 'ai-monster') {
      expect(f.actorScopes).toEqual(['single']);
      expect(f.extractionRequests[0]).toMatchObject({ source: f.source, sourceSha256: hashSource(f.source),
        candidate: { start: 0, end: f.source.length, quote: f.source } });
      expect(f.counts).toEqual({ discover: 0, extract: 1, create: 0 });
    }
    expect(JSON.stringify(record)).not.toContain('transient'); expect(JSON.stringify(record)).not.toContain('https://provider.example');
    const originalHash = record.candidate.candidateHash;
    await first.application.close();
    const second = makeApplication(f.services, undefined, undefined, undefined, undefined, { candidateStore: store });
    await settleBatch(second.application, second.root);
    await second.application.restoreSingleCandidate(second.root);
    expect(second.application.status, JSON.stringify(second.notifications)).toBe('ready_for_gm_review');
    expect(second.application.generation.candidateHash).toBe(originalHash);
    expect(second.application.generation.gmApproval).toBeUndefined(); expect(second.application.response).toBeUndefined();
    expect(second.application.generation.findings).toEqual(record.candidate.findings);
    expect(second.application.generation.analysis.sourceScope).toBe(mode === 'ai-monster' ? 'single' : undefined);
    expect(f.counts).toEqual({ discover: mode === 'ai-monster' ? 0 : 1, extract: 1, create: 0 });
    expect(second.root.create.disabled).toBe(false);
    await second.application.create(second.root);
    expect(f.counts.create).toBe(1); expect((await store.load()).single).toBeUndefined();
    expect(second.notifications.errors).toEqual([]); await second.application.close();
  });

  test('single source scope preserves full input and a historical no-scope record restores without relabelling calls or network', async () => {
    const f = fixture('ai-monster'), store = new MemoryIntakeCandidateStore();
    const legacyUiInputs: any[] = [];
    const first = makeApplication({ ...f.services,
      analyzeBrowserActorSourceWithAi: (async (input: any, provider: any, signal?: AbortSignal, attempt?: string) => {
        legacyUiInputs.push(input);
        // Model a record made by the previous caller: default discovery really
        // ran, rather than synthesizing its historical call count in the JSON.
        const { sourceScope, ...legacyInput } = input;
        return analyzeBrowserActorSourceWithAi(legacyInput, provider, signal, attempt);
      }) as any,
    }, undefined, undefined, undefined, undefined, { candidateStore: store });
    await settleBatch(first.application, first.root); setAiForm(first.application, first.root, 'ai-monster', f.source);
    await first.application.runAnalysis(first.root, false); await first.application.generate(first.root);
    const historical = (await store.load()).single!;
    expect(historical, JSON.stringify(first.notifications)).toBeDefined();
    expect(legacyUiInputs[0].sourceScope).toBe('single');
    expect(historical.input).not.toHaveProperty('sourceScope');
    expect(historical.candidate.analysis).not.toHaveProperty('sourceScope');
    expect(historical.candidate.calls.discovery).toBe(1);
    expect(f.counts).toEqual({ discover: 1, extract: 1, create: 0 });
    const before = structuredClone(historical);
    await first.application.close();

    const originalFetch = globalThis.fetch; let network = 0, factories = 0;
    const second = makeApplication({
      createBrowserAiProvider: (() => { factories++; throw Error('Local restore must not construct a provider.'); }) as any,
    }, undefined, undefined, undefined, undefined, { candidateStore: store });
    globalThis.fetch = (async () => { network++; throw Error('Local restore must not request the network.'); }) as unknown as typeof fetch;
    try {
      await settleBatch(second.application, second.root); await second.application.restoreSingleCandidate(second.root);
      expect(second.application.status, JSON.stringify(second.notifications)).toBe('ready_for_gm_review');
      expect(second.application.generation.analysis).not.toHaveProperty('sourceScope');
      expect(second.application.generation.calls.discovery).toBe(1);
      expect(second.application.generation.analysis.calls.discovery).toBe(1);
      expect(second.application.generation.candidateHash).toBe(before.candidate.candidateHash);
      expect(second.application.generation.candidateResponse).toEqual(before.candidate.candidateResponse);
      expect({ network, factories }).toEqual({ network: 0, factories: 0 });
      expect((await store.load()).single).toEqual(before); expect(historical).toEqual(before);
      expect(f.counts).toEqual({ discover: 1, extract: 1, create: 0 });
      expect(second.notifications.errors).toEqual([]);
    } finally { globalThis.fetch = originalFetch; await second.application.close(); }
  });

  test('batch source scope keeps discovery when normal Regenerate follows a multiple-creature directory result', async () => {
    const source = LURKER_SOURCE + '\n' + LURKER_SOURCE, counts = { discover: 0, extract: 0 }, scopes: unknown[] = [];
    const provider = { providerName: 'fixed-two-creatures', extractionModel: 'fixed', reviewModel: 'disabled',
      discover: async () => { counts.discover++; return { schemaVersion: 1, candidates: [
        { id: 'first', label: 'First creature', start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE },
        { id: 'second', label: 'Second creature', start: LURKER_SOURCE.length + 1, end: source.length, quote: LURKER_SOURCE },
      ] }; },
      extract: async () => { counts.extract++; throw Error('Directory discovery must not select only the first creature.'); },
      review: async () => { throw Error('No model review.'); }, repair: async () => { throw Error('No model repair.'); },
    };
    const queue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const { application, root, notifications } = makeApplication({
      createBrowserAiProvider: (() => provider) as any,
      analyzeBrowserActorSourceWithAi: (async (input: any, actualProvider: any, signal?: AbortSignal, attempt?: string) => {
        scopes.push(input.sourceScope); return analyzeBrowserActorSourceWithAi(input, actualProvider, signal, attempt);
      }) as any,
    }, undefined, undefined, undefined, queue);
    try {
      await settleBatch(application, root); setAiForm(application, root, 'ai-monster', '');
      await queue.importCollection(createForgeBatchCollection({ label: 'One file, two creatures', entries: [
        { objectKind: 'actor', mode: 'ai-monster', sourceLabel: 'Multi-statblock directory file', rawSource: source },
      ] }));
      await application.refreshBatch(root, false); await application.runBatch(root);
      expect(scopes).toEqual(['discover']); expect(counts).toEqual({ discover: 1, extract: 0 });
      expect((await queue.load()).jobs[0]!.status, JSON.stringify(notifications)).toBe('needs_review');
      expect(application.analysis).toMatchObject({ errorCode: 'multiple_entities', sourceScope: 'discover' });
      const firstAttempt = application.attemptId;
      await application.regenerate(root);
      expect(application.attemptId).not.toBe(firstAttempt);
      expect(scopes).toEqual(['discover', 'discover']); expect(counts).toEqual({ discover: 2, extract: 0 });
      expect(application.analysis).toMatchObject({ errorCode: 'multiple_entities', sourceScope: 'discover' });
      expect(application.analysis.candidates).toHaveLength(2);
    } finally { await application.close(); }
  });

  test('single source scope stays direct when normal Regenerate follows the first extraction failure', async () => {
    const counts = { discover: 0, extract: 0 }, scopes: unknown[] = [];
    const provider = { providerName: 'fixed-first-extraction-failure', extractionModel: 'fixed', reviewModel: 'disabled',
      discover: async () => { counts.discover++; throw Error('Single-source retries must not fall back to discovery.'); },
      extract: async () => { counts.extract++; if (counts.extract === 1) throw Error('Constructed first extraction failure.'); return buildValidLurkerIr(); },
      review: async () => { throw Error('No model review.'); }, repair: async () => { throw Error('No model repair.'); },
    };
    const { application, root, notifications } = makeApplication({
      createBrowserAiProvider: (() => provider) as any,
      analyzeBrowserActorSourceWithAi: (async (input: any, actualProvider: any, signal?: AbortSignal, attempt?: string) => {
        scopes.push(input.sourceScope); return analyzeBrowserActorSourceWithAi(input, actualProvider, signal, attempt);
      }) as any,
    });
    try {
      await settleBatch(application, root); setAiForm(application, root, 'ai-monster', LURKER_SOURCE);
      await application.analyze(root);
      expect(application.status, JSON.stringify(notifications)).toBe('failed');
      expect(application.analysis.sourceScope).toBe('single');
      expect(scopes).toEqual(['single']); expect(counts).toEqual({ discover: 0, extract: 1 });
      const firstAttempt = application.attemptId;
      await application.regenerate(root);
      expect(application.attemptId).not.toBe(firstAttempt);
      expect(application.status, JSON.stringify(notifications)).toBe('ready_to_generate');
      expect(application.analysis.sourceScope).toBe('single');
      expect(application.analysis.candidate).toMatchObject({ start: 0, end: LURKER_SOURCE.length, quote: LURKER_SOURCE });
      expect(scopes).toEqual(['single', 'single']); expect(counts).toEqual({ discover: 0, extract: 2 });
    } finally { await application.close(); }
  });

  test.each(['ai-monster','ai-item'] as const)('batch %s refresh reattaches candidate with the same attempt and fresh GM confirmation', async mode => {
    const f = fixture(mode), store = new MemoryIntakeCandidateStore(), queue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    const first = makeApplication(f.services, undefined, undefined, async () => true, queue, { candidateStore: store });
    await settleBatch(first.application, first.root); setAiForm(first.application, first.root, mode, '');
    await queue.importCollection(createForgeBatchCollection({ label: 'recovery', entries: [{ objectKind: mode === 'ai-item' ? 'item' : 'actor', mode,
      sourceLabel: 'Refresh recovery', rawSource: f.source }] }));
    await first.application.refreshBatch(first.root, false); await first.application.runBatch(first.root);
    const before = (await queue.load()).jobs[0]!;
    const saved = (await store.load())[before.id]!;
    expect(saved, JSON.stringify(first.notifications)).toBeDefined();
    expect(saved.input.sourceScope).toBe(mode === 'ai-monster' ? 'discover' : undefined);
    expect((saved.candidate.analysis as any).sourceScope).toBe(mode === 'ai-monster' ? 'discover' : undefined);
    if (mode === 'ai-monster') expect(f.actorScopes).toEqual(['discover']);
    await first.application.close();
    const second = makeApplication(f.services, undefined, undefined, async () => true, queue, { candidateStore: store });
    await second.application.refreshBatch(second.root, false);
    while (second.application.batchLoading) await new Promise(resolve => setTimeout(resolve, 1));
    const after = (await queue.load()).jobs[0]!;
    expect(after.attemptCount).toBe(1); expect(after.latestReview?.attemptId).toBe(before.latestReview?.attemptId);
    expect(after.latestReview?.gmApproval).toBeUndefined(); expect(second.root.batchApply.disabled, JSON.stringify(second.notifications)).toBe(false);
    expect(second.application.batchResponses.get(before.id).candidate.analysis.sourceScope).toBe(mode === 'ai-monster' ? 'discover' : undefined);
    expect(second.root.batchRun.disabled).toBe(true); expect(f.counts).toEqual({ discover: 1, extract: 1, create: 0 });
    await second.application.applyBatch(second.root);
    expect(f.counts.create).toBe(1); expect((await queue.load()).jobs[0]?.status).toBe('applied');
    expect((await store.load())[before.id]).toBeUndefined(); expect(second.notifications.errors).toEqual([]); await second.application.close();
  });

  test.each(['old-attempt','apply-failed'] as const)('refresh handles %s without inheriting prior GM approval', async scenario => {
    const f = fixture('ai-item'), store = new MemoryIntakeCandidateStore(), queue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
    if (scenario === 'apply-failed') f.services.createAcceptedForgeItem = (async () => { throw Error('Readback failure fixture'); }) as any;
    const first = makeApplication(f.services, undefined, undefined, async () => true, queue, { candidateStore: store });
    await settleBatch(first.application, first.root); setAiForm(first.application, first.root, 'ai-item', '');
    await queue.importCollection(createForgeBatchCollection({ label: 'failed apply recovery', entries: [{ objectKind: 'item', mode: 'ai-item', sourceLabel: 'Item', rawSource: f.source }] }));
    await first.application.refreshBatch(first.root, false); await first.application.runBatch(first.root);
    const job = (await queue.load()).jobs[0]!;
    if (scenario === 'apply-failed') {
      await first.application.applyBatch(first.root);
      expect((await queue.load()).jobs[0]?.status).toBe('apply_failed');
      expect((await queue.load()).jobs[0]?.latestReview?.gmApproval).toBeDefined();
    } else { await queue.startJob(job.id); await queue.interruptJob(job.id); }
    await first.application.close();
    const second = makeApplication(f.services, undefined, undefined, async () => true, queue, { candidateStore: store });
    while (second.application.batchLoading) await new Promise(resolve => setTimeout(resolve, 1));
    const current = (await queue.load()).jobs[0]!;
    if (scenario === 'apply-failed') {
      expect(current.status).toBe('ready_for_gm_review'); expect(current.latestReview?.gmApproval).toBeUndefined();
      expect(second.application.batchResponses.get(job.id).candidate.gmApproval).toBeUndefined(); expect(second.root.batchApply.disabled).toBe(false);
    } else { expect(current.status).toBe('interrupted'); expect(second.application.batchResponses.size).toBe(0); expect(second.root.batchRun.disabled).toBe(false); }
    expect(f.counts).toEqual({ discover: 1, extract: 1, create: 0 }); await second.application.close();
  });

  test('reads Actor records across age, target and report changes without modifying the original', async () => {
    const f = fixture('ai-monster'), store = new MemoryIntakeCandidateStore();
    const first = makeApplication(f.services, undefined, undefined, undefined, undefined, { candidateStore: store });
    await settleBatch(first.application, first.root); setAiForm(first.application, first.root, 'ai-monster', f.source);
    await first.application.runAnalysis(first.root, false); await first.application.generate(first.root);
    const record = (await store.load()).single!, baseline = JSON.stringify(record), target = { fvttVersion: '14.364', systemVersion: '5.3.3' };
    const changedChecksum=await revalidateIntakeCandidate({...record,checksum:'bad'},target);
    expect(changedChecksum.candidate.candidateResponse).toEqual(record.candidate.candidateResponse);
    expect(changedChecksum.candidate.findings).toContainEqual(expect.objectContaining({code:'SAVED_CANDIDATE_CHECKSUM_MISMATCH'}));
    await expect(revalidateIntakeCandidate(record,target,Date.parse(record.savedAt)+INTAKE_CANDIDATE_MAX_AGE_MS+1)).resolves.toEqual(record);
    await expect(revalidateIntakeCandidate(record,{...target,systemVersion:'6.0.0'})).resolves.toEqual(record);
    const changed = structuredClone(record); changed.candidate.deterministicFindings = [...(record.candidate.deterministicFindings ?? []),
      { id: 'changed', code: 'NOT_REPRODUCIBLE_BY_CURRENT_VALIDATOR', path: '/', message: 'Changed local finding', blocking: true, origin: 'semantic' }];
    // Report changes do not require the saved Actor to be regenerated.
    const { checksum, ...body } = changed; changed.checksum = hashSource(JSON.stringify(body));
    await expect(revalidateIntakeCandidate(changed,target)).resolves.toEqual(changed);
    expect(() => captureIntakeCandidate(record.input, record.mode, record.bundle, { ...record.candidate, apiKey: 'must-not-persist' } as any)).toThrow(/凭据/u);
    const approved = { ...record.candidate, gmApproval: { gmId: 'old' } } as any;
    const recaptured = captureIntakeCandidate(record.input, record.mode, record.bundle, approved);
    expect(recaptured.candidate.gmApproval).toBeUndefined(); expect(recaptured.bundle.gmApproval).toBeUndefined();
    expect(JSON.stringify(record)).toBe(baseline); expect(f.counts).toEqual({ discover: 0, extract: 1, create: 0 });
    await first.application.close();
  });
});

describe('other official2024 spellcasting and legendary monsters', () => {
  for (const id of ['green','brass']) test(`${id}: formal source/spell/resource fidelity and full candidate recovery`, async () => {
    const seed = officialDragonSeeds().find(row => row.id === id)!;
    let discovers = 0, extracts = 0;
    const unexpected = async () => { throw Error('No model review/repair allowed.'); };
    const provider = { providerName: 'fixed-official2024-dragons', extractionModel: 'frozen-ir', reviewModel: 'disabled',
      discover: async () => { discovers++; return { schemaVersion: 1, candidates: [{ id, label: seed.name, start: 0, end: seed.source.length, quote: seed.source }] }; },
      extract: async () => { extracts++; return structuredClone(seed.ir); }, review: unexpected, repair: unexpected };
    const store = new MemoryIntakeCandidateStore();
    const first = makeApplication({ createBrowserAiProvider: (() => provider) as any }, undefined, undefined, undefined, undefined, { candidateStore: store });
    await settleBatch(first.application, first.root); setAiForm(first.application, first.root, 'ai-monster', seed.source);
    await first.application.runAnalysis(first.root, false); await first.application.generate(first.root);
    const saved = (await store.load()).single!;
    expect(saved, JSON.stringify(first.notifications)).toBeDefined();
    const originalCalls = { discovers, extracts }; expect(extracts).toBe(1);
    const result = (saved.candidate.candidateResponse as any).result, actor = result.artifact, expected = seed.expected;
    expect(result.status).toBe('accepted'); expect(actor.system.attributes.ac.flat).toBe(expected.ac);
    expect(actor.system.attributes.hp.value).toBe(expected.hp); expect(actor.system.details.cr).toBe(expected.cr);
    expect(actor.system.attributes.hp.formula).toBe(seed.ir.creature.attributes.hp.formula);
    expect(actor.system.resources.legact.max).toBe(3); expect(actor.system.resources.legres.max).toBe(3);
    const manifest = actor.flags['fvtt-json-generator-spell-resolver'].spellManifest;
    const feature = actor.items.find((item: any) => item.name.startsWith(expected.legendary));
    const group = manifest.spellcastingGroups.find((g: any) => g.featureItemKey === feature.flags.fvttJsonGenerator.spellcastingFeatureKey);
    expect(group.ability).toBe(expected.ability); expect(group.saveDc).toBe(expected.dc);
    // The production Resolver treats spacing/case/hyphens as the same exact
    // identity. A real full-IR reply need not reuse the old staged slug style.
    expect(normalizeSpellIdentity(group.spellRefs[0].identifier)).toBe(normalizeSpellIdentity(expected.spell));
    expect(group.spellRefs[0].originalName).toBe(expected.spellName);
    const cast = buildCastActivitySource({ manifestId: manifest.manifestId, featureId: feature._id ?? 'ProofFeature0001', group, ref: group.spellRefs[0],
      selectedUuid: 'Compendium.fixture.spells.Item.DragonSpell00001', activationType: 'legendary', activationCost: 1 }).activity;
    expect(cast.activation).toEqual({ type: 'legendary', value: 1, override: true });
    expect(cast.spell.ability).toBe(expected.ability); expect(cast.spell.challenge.save).toBe(String(expected.dc));
    expect(cast.spell.level).toBe(id === 'green' ? 3 : undefined); // Brass inherits the selected spell's base level.
    expect(cast.consumption).toEqual({ spellSlot: false, targets: [] }); expect(cast.uses).toBeUndefined();
    expect(feature.flags.fvttJsonGenerator.spellcastingActivationType).toBe('legendary');
    expect(feature.flags.fvttJsonGenerator.spellcastingActivationCost).toBe(1);
    expect(actor.flags.fvttJsonGenerator.sourceLegendaryLedger).toBeDefined();
    expect(actor.flags.fvttJsonGenerator.sourceLegendaryLedger.lairMax).toBe(4);
    expect(actor.flags.fvttJsonGenerator.sourceLegendaryLedger.resistanceLairMax).toBe(4);
    const resistance = actor.items.find((item: any) => item.name.startsWith('Legendary Resistance'));
    expect(String(resistance.system.uses?.max ?? '')).toBe('');
    await first.application.close();
    const second = makeApplication({}, undefined, undefined, undefined, undefined, { candidateStore: store });
    await settleBatch(second.application, second.root); await second.application.restoreSingleCandidate(second.root);
    expect(second.application.status, JSON.stringify(second.notifications)).toBe('ready_for_gm_review');
    expect(second.application.generation.candidateHash).toBe(saved.candidate.candidateHash);
    expect(second.application.generation.candidateResponse).toEqual(saved.candidate.candidateResponse);
    expect(second.application.generation.gmApproval).toBeUndefined(); expect({ discovers, extracts }).toEqual(originalCalls);
    const evidence = process.env.FORGE_2024_DRAGON_EVIDENCE;
    if (evidence) {
      const path = `${evidence}/${id}.json`; if (existsSync(path)) throw Error('Refuse overwrite of sample evidence.');
      writeFileSync(path, JSON.stringify({ seed, candidateHash: saved.candidate.candidateHash, response: saved.candidate.candidateResponse,
        findings: saved.candidate.findings, calls: { discovers, extracts, liveModel: 0 }, recovered: true }, null, 2));
    }
    await second.application.close();
  });
});

test('legacy candidate recovery retains saved native capacity without reconstructing it from old IR or calling a model', async () => {
  // Construct a coherent old-format record from a formally generated Actor.
  // Only its intermediate ledger is made legacy; this is a migration control,
  // not evidence that this exact historical draft was saved by a real user.
  const seed = officialDragonSeeds().find(row => row.id === 'green')!;
  let extracts = 0;
  const unexpected = async () => { throw Error('Recovery must not call a model.'); };
  const provider = { providerName: 'fixed-legacy-recovery-control', extractionModel: 'frozen-ir', reviewModel: 'disabled',
    discover: unexpected, extract: async () => { extracts++; return structuredClone(seed.ir); }, review: unexpected, repair: unexpected };
  const store = new MemoryIntakeCandidateStore();
  const first = makeApplication({ createBrowserAiProvider: (() => provider) as any }, undefined, undefined, undefined, undefined, { candidateStore: store });
  try {
    await settleBatch(first.application, first.root); setAiForm(first.application, first.root, 'ai-monster', seed.source);
    await first.application.runAnalysis(first.root, false); await first.application.generate(first.root);
    const current = (await store.load()).single!;
    expect(current, JSON.stringify(first.notifications)).toBeDefined();
    const candidate = structuredClone(current.candidate) as any;
    delete candidate.analysis.ir.creature.legendary.resistanceMax;
    delete candidate.analysis.ir.creature.legendary.resistanceLairMax;
    candidate.analysis.ir.claims = candidate.analysis.ir.claims.filter((claim: any) => !/\/resistance(?:Lair)?Max$/u.test(claim.path));
    for (const coverage of candidate.analysis.ir.coverage) coverage.claimPaths = coverage.claimPaths.filter((path: string) => !/\/resistance(?:Lair)?Max$/u.test(path));
    candidate.candidateHash = hashSource(JSON.stringify({ rawSourceHash: candidate.analysis.rawSourceHash, ir: candidate.analysis.ir,
      finalSourceHash: candidate.finalSourceHash, response: candidate.candidateResponse }));
    const bundle = { ...current.bundle, candidateHash: candidate.candidateHash };
    const legacy:IntakeCandidateRecord = {...structuredClone(current),bundle,candidate};
    legacy.version=1;delete legacy.generationContract;
    const {checksum:_legacyChecksum,...legacyBody}=legacy;legacy.checksum=hashSource(JSON.stringify(legacyBody));
    await store.put('single', legacy);
    const before = JSON.stringify(await store.load()), target = { fvttVersion: '14.364', systemVersion: '5.3.3' };
    expect((await revalidateIntakeCandidate(legacy,target)).candidate.candidateResponse).toEqual(current.candidate.candidateResponse);
    const currentClaim=structuredClone(legacy);currentClaim.version=2;currentClaim.generationContract=INTAKE_CANDIDATE_GENERATION_CONTRACTS['ai-monster'];
    const {checksum:_currentChecksum,...currentBody}=currentClaim;currentClaim.checksum=hashSource(JSON.stringify(currentBody));
    expect((await revalidateIntakeCandidate(currentClaim,target)).candidate.candidateResponse).toEqual(current.candidate.candidateResponse);
    expect((await revalidateIntakeCandidate({...legacy,checksum:'bad'},target)).candidate.candidateResponse).toEqual(current.candidate.candidateResponse);
    expect((await revalidateIntakeCandidate(legacy,{...target,systemVersion:'6.0.0'})).candidate.candidateResponse).toEqual(current.candidate.candidateResponse);
    expect(JSON.stringify(await store.load())).toBe(before);
    expect(extracts).toBe(1);
    await expect(revalidateIntakeCandidate(current, target)).resolves.toEqual(current);
  } finally { await first.application.close(); }
});

describe('reviewed candidate repair and versioned recovery',()=>{
  const reviewFinding={id:'controlled-content-review',code:'CONTROLLED_CONTENT_REVIEW',path:'/creature/attributes/ac',
    message:'Controlled review finding for explicit repair flow.',blocking:true,origin:'ai-review' as const,evidence:[]};
  async function fixture(options:{repair?:(request:any)=>Promise<any>;review?:()=>Promise<any>;
    generate?:(input:any,analysis:any,provider:any,signal?:AbortSignal)=>Promise<any>;store?:IntakeCandidateStore;
    probe?:(input:any)=>Promise<any>}={}){
    const seed=officialDragonSeeds().find(row=>row.id==='brass')!,store=options.store??new MemoryIntakeCandidateStore();
    const counts={extract:0,review:0,repair:0,generate:0,create:0};
    const changed=()=>{const ir=structuredClone(seed.ir);ir.creature.attributes.ac+=1;return ir;};
    const provider={providerName:'controlled-review-repair',extractionModel:'extract',reviewModel:'review',
      discover:async()=>{throw Error('No discovery expected.');},extract:async()=>{counts.extract++;return structuredClone(seed.ir);},
      review:async()=>{counts.review++;return options.review?options.review():{schemaVersion:1,verdict:'needs_review',findings:[reviewFinding]};},
      repair:async(request:any)=>{counts.repair++;return options.repair?options.repair(request):changed();}};
    const probe=options.probe??(async()=>({status:'connected',providerId:'custom',protocol:'openai-chat',model:'extract',models:[],capabilities:{},message:'Controlled connection probe'}));
    const first=makeApplication({createBrowserAiProvider:(()=>provider) as any,
      testForgeProviderConnection:probe as any,
      createAcceptedForgeActor:(async()=>{counts.create++;return actorCreateResult();}) as any,
      generateBrowserActorIntakeCandidate:(async(input:any,analysis:any,actual:any,signal?:AbortSignal)=>{
        counts.generate++;return options.generate&&counts.generate>1?options.generate(input,analysis,actual,signal)
          :generateBrowserActorIntakeCandidate(input,analysis,actual,signal);
      }) as any},undefined,undefined,undefined,undefined,{candidateStore:store});
    await settleBatch(first.application,first.root);setAiForm(first.application,first.root,'ai-monster',seed.source);
    await first.application.analyze(first.root);await first.application.generate(first.root);
    expect(first.application.status,JSON.stringify(first.notifications)).toBe('ready_for_gm_review');
    return{...first,store,counts,provider,changed,probe};
  }
  const target={fvttVersion:'14.364',systemVersion:'5.3.3'};
  const rehash=(record:IntakeCandidateRecord)=>{const{checksum,...body}=record;record.checksum=hashSource(JSON.stringify(body));return record;};

  test('restored candidate and retested replacement key cannot reopen disabled review or review-driven repair [review disabled]',async()=>{
    const f=await fixture();
    try{await f.application.close();
      const restored=makeApplication({createBrowserAiProvider:(()=>f.provider) as any,testForgeProviderConnection:f.probe as any},undefined,undefined,undefined,undefined,{candidateStore:f.store});
      try{
        for(const name of ['provider','endpoint','protocol','authScheme','region','reasoning','structuredOutput','model','reviewModel'] as const)restored.root[name].value=f.root[name].value;
        restored.root.apiKey.value='';await settleBatch(restored.application,restored.root);await restored.application.restoreSingleCandidate(restored.root);
        expect(restored.application.status,JSON.stringify(restored.notifications)).toBe('ready_for_gm_review');
        const hash=restored.application.generation.candidateHash;
        restored.root.apiKey.value='replacement-fixture-key';restored.application.onCredentialChanged(restored.root);
        await restored.application.reviewCandidate(restored.root);expect(f.counts.review).toBe(0);expect(restored.root.modelReview.disabled).toBe(true);
        await restored.application.testConnection(restored.root);
        expect(restored.application.snapshotCurrent(restored.root)).toBe(true);
        expect(restored.application.connectionProbeRevision).toBe(restored.application.connectionCredentialRevision);
        expect(restored.root.modelReview.disabled,JSON.stringify(restored.notifications)).toBe(true);
        await restored.application.reviewCandidate(restored.root);expect(f.counts.review).toBe(0);
        expect(restored.application.generation.candidateHash).toBe(hash);expect(restored.root.repair.disabled).toBe(true);
        await restored.application.repair(restored.root);expect(f.counts.extract).toBe(1);expect(f.counts.repair).toBe(0);
      }finally{await restored.application.close();}
    }finally{await f.application.close();}
  });

  test('a late successful probe for an old key cannot authorize the untested replacement key [review disabled]',async()=>{
    let entered=false,finish!:(value:any)=>void;const f=await fixture({probe:async()=>{entered=true;return new Promise(resolve=>{finish=resolve;});}});
    try{f.root.apiKey.value='first-fixture-key';f.application.onCredentialChanged(f.root);
      const pending=f.application.testConnection(f.root);for(let index=0;index<1000&&!entered;index++)await new Promise(resolve=>setTimeout(resolve,1));expect(entered).toBe(true);
      f.root.apiKey.value='untested-replacement-key';f.application.onCredentialChanged(f.root);
      finish({status:'connected',providerId:'custom',protocol:'openai-chat',model:'extract',models:[],capabilities:{},message:'Old-key probe returned'});await pending;
      expect(f.application.connectionProbeRevision).toBe(-1);expect(f.root.modelReview.disabled).toBe(true);
      await f.application.reviewCandidate(f.root);expect(f.counts.review).toBe(0);expect(f.counts.repair).toBe(0);
    }finally{await f.application.close();}
  });

  test('a stored session receipt cannot authorize a different untested inline key [review disabled]',async()=>{
    const f=await fixture();
    try{f.application.sessionSettingsRaw={...forgeSessionSettingsFixture(),apiKey:f.root.apiKey.value};
      f.application.sessionApi.isForgeSessionConnectionReady=()=>true;
      f.root.apiKey.value='untested-inline-key';f.application.onCredentialChanged(f.root);
      await f.application.reviewCandidate(f.root);expect(f.counts.review).toBe(0);expect(f.root.modelReview.disabled).toBe(true);
    }finally{await f.application.close();}
  });

  test('synthetic historical call counters restore unchanged and allow explicit GM creation without requests [review disabled]',async()=>{
    const f=await fixture();
    try{
      // Synthetic historical metadata control: no review/repair request is made.
      f.application.generation.calls.review=1;f.application.generation.calls.repair=1;f.application.generation.analysis.repairCount=1;
      f.application.analysis.repairCount=1;await f.application.saveCandidate(f.root,'single');
      const record=(await f.store.load()).single!,hash=record.candidate.candidateHash;
      expect(record.candidate.calls.review).toBe(1);expect(record.candidate.modelReviewStatus,JSON.stringify(f.notifications)).toBe('not_requested');
      await f.application.close();let creates=0;
      const restored=makeApplication({createAcceptedForgeActor:(async()=>{creates++;return actorCreateResult();}) as any},undefined,undefined,undefined,undefined,{candidateStore:f.store});
      try{await settleBatch(restored.application,restored.root);await restored.application.restoreSingleCandidate(restored.root);
        expect(restored.application.generation.candidateHash).toBe(hash);expect(restored.application.generation.gmApproval).toBeUndefined();
        await restored.application.create(restored.root);expect(creates,JSON.stringify(restored.notifications)).toBe(1);
        expect(restored.application.generation.gmApproval).toBeUndefined();
        expect(restored.application.generation.calls.review).toBe(1);expect(restored.application.generation.calls.repair).toBe(1);
      }finally{await restored.application.close();}
      expect(f.counts.review).toBe(0);expect(f.counts.repair).toBe(0);
    }finally{await f.application.close();}
  });

  for(const change of ['source','provider','credential','target','gm'] as const)test(`current ${change} is checked before candidate repair`,async()=>{
      const f=await fixture();
      try{await f.application.reviewCandidate(f.root);
        if(change==='source')f.root.source.value+='\nChanged source';
        if(change==='provider')f.provider.extractionModel='changed-model';
        if(change==='credential')f.application.onCredentialChanged(f.root);
        if(change==='target')f.game.system.version='6.0.0';if(change==='gm')f.game.user.isGM=false;
        await f.application.repair(f.root);expect(f.counts.repair,change).toBe(0);
      }finally{await f.application.close();}
  });

  test('v1 reproducible records remain unchanged while new records identify their supported generation contract',async()=>{
    const f=await fixture();
    try{const current=(await f.store.load()).single!;expect(current.version).toBe(2);
      const legacy=structuredClone(current);legacy.version=1;delete legacy.generationContract;rehash(legacy);
      const before=JSON.stringify(legacy);await expect(revalidateIntakeCandidate(legacy,target)).resolves.toEqual(legacy);
      expect(JSON.stringify(legacy)).toBe(before);expect(f.counts).toEqual({extract:1,review:0,repair:0,generate:1,create:0});
      for(const change of ['future-format','future-contract','wrong-mode-contract','unknown-field','spent-budget-reset'] as const){const record:any=structuredClone(current);
        if(change==='future-format')record.version=99;if(change==='future-contract')record.generationContract='monster-ai-owned-projection-v999';
        if(change==='wrong-mode-contract')record.generationContract=INTAKE_CANDIDATE_GENERATION_CONTRACTS['ai-item'];
        if(change==='unknown-field')record.unrecognized=true;if(change==='spent-budget-reset')record.candidate.calls.repair=1;rehash(record);
        if(change==='future-format')await expect(revalidateIntakeCandidate(record,target)).rejects.toThrow();
        else expect((await revalidateIntakeCandidate(record,target)).candidate.candidateResponse).toEqual(current.candidate.candidateResponse);
      }
    }finally{await f.application.close();}
  });

  test('unrelated repair provenance cannot hide the saved Actor or inherit adoption [review disabled]',async()=>{
    const f=await fixture();
    try{const current=structuredClone((await f.store.load()).single!);
      // Synthetic legacy repair reservation; exercise decoder ownership without paid review.
      // fixture() creates an Actor; the saved-record type also permits Items.
      current.repairOrigin={candidate:structuredClone(current.candidate) as NonNullable<IntakeCandidateRecord['repairOrigin']>['candidate'],bundle:structuredClone(current.bundle)};
      current.candidate.analysis.repairCount=1;rehash(current);
      for(const change of ['recursive','foreign-source','foreign-target','foreign-attempt','secret','unknown','unknown-candidate-field','scalar'] as const){const record:any=structuredClone(current);
        if(change==='recursive')record.repairOrigin.candidate.repairOrigin=structuredClone(record.repairOrigin);
        if(change==='foreign-source')record.repairOrigin.bundle.rawSource+='\nChanged';
        if(change==='foreign-target')record.repairOrigin.candidate.candidateResponse.result.target.systemVersionObserved='6.0.0';
        if(change==='foreign-attempt')record.repairOrigin.candidate.analysis.attemptId+='-other';
        if(change==='secret')record.repairOrigin.candidate.apiKey='must-not-save';if(change==='unknown')record.repairOrigin.unrecognized=true;
        if(change==='unknown-candidate-field')record.repairOrigin.candidate.unrecognized=true;if(change==='scalar')record.repairOrigin='';
        rehash(record);const restored=await revalidateIntakeCandidate(record,target);
        expect(restored.candidate.candidateResponse).toEqual(current.candidate.candidateResponse);expect(restored.candidate.gmApproval).toBeUndefined();
      }
      await expect(revalidateIntakeCandidate(current,target)).resolves.toEqual(current);
      expect(f.counts).toEqual({extract:1,review:0,repair:0,generate:1,create:0});
    }finally{await f.application.close();}
  });
});

function makeApplication(
  services: Partial<ForgeIntakeApplicationServices> = {},
  dialogWait?: (config: any) => Promise<unknown>,
  sourceLibrary = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore()),
  dialogConfirm?: (config: any) => Promise<boolean>,
  batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore()),
  applicationOptions: Record<string, unknown> = {},
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
    candidateStore: new MemoryIntakeCandidateStore(),
    ...applicationOptions,
  };
  const Application = createForgeIntakeApplicationClass(environment);
  const application: any = new Application();
  const root = new FakeRoot(applicationOptions.legacyConnectionFields !== false);
  (root as any).isConnected = true;
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

/** Local formal conversion only; every AI stage is fixed and unexpected review/repair fails. */
function batchCandidateFixture(mode: 'ai-monster' | 'ai-item', strictStatus: 'accepted' | 'needs_review' | 'failed') {
  const counts = { analyses: 0, generations: 0, reviewedCreates: 0, strictCreates: 0 };
  const analyze = async (input: any) => {
    counts.analyses += 1;
    const analysis = mode === 'ai-item' ? readyItemAnalysis(input.source) : readyActorAnalysis(input.source);
    if (strictStatus !== 'accepted') {
      const finding = { ...blocking('SOURCE_REVIEW_REQUIRED'), origin: 'semantic', path: '/creature/actions/0' };
      analysis.status = 'needs_review'; analysis.findings = [finding];
      analysis.validation = { findings: [finding], blocking: [finding], warnings: [] };
    }
    return analysis;
  };
  const generate = async (input: any, analysis: any) => {
    counts.generations += 1;
    const request = (mode === 'ai-item' ? buildForgeItemRequest : buildForgeActorRequest)({
      content: mode === 'ai-item' ? ITEM_SOURCE : ACTOR_SOURCE, displayName: input.displayName,
      requestId: input.requestId, fvttVersion: input.fvttVersion, systemVersion: input.systemVersion,
    });
    const response: any = await (mode === 'ai-item' ? convertFinalItemSource : convertFinalActorSource)(request as any);
    if (response.result.status !== 'accepted') throw new Error('Local formal fixture failed.');
    if (strictStatus !== 'accepted') {
      delete response.result.artifactHash;
      response.result.status = strictStatus;
      response.result.verification.status = strictStatus;
      response.result.diagnostics = [{ code: 'SOURCE_REVIEW_REQUIRED', severity: strictStatus === 'failed' ? 'error' : 'warning', stage: 'semantic',
        path: 'actor', message: 'The complete source rule still needs GM review.' }];
    }
    return { status: 'ready_for_gm_review', candidateAvailable: true, analysis, rawSourceHash: hashSource(input.source),
      finalSource: request.source.content, finalSourceHash: request.source.utf8Sha256,
      candidateResponse: response, candidateHash: hashSource(JSON.stringify({ rawSourceHash: analysis.rawSourceHash,
        ir: analysis.ir, finalSourceHash: request.source.utf8Sha256, response })),
      actorProjection: response.result.artifact, itemProjection: response.result.artifact,
      formalStatus: strictStatus, intakeVerificationStatus: strictStatus === 'accepted' ? 'accepted' : 'needs_review',
      modelReviewStatus: 'not_requested', deterministicFindings: analysis.findings, findings: analysis.findings,
      stages: [], provider: analysis.provider, calls: analysis.calls };
  };
  const strictCreate = async ({ response }: any) => {
    counts.strictCreates += 1;
    expect(response.result.status).toBe(mode==='ai-item'?'accepted':strictStatus);
    return { ...(mode === 'ai-item' ? itemCreateResult() : actorCreateResult()),
      uuid: `${mode === 'ai-item' ? 'Item' : 'Actor'}.${hashArtifact({ sourceId: response.result.sourceIdentity.sourceId }).slice(0, 16)}`,
      ...(mode==='ai-monster'&&strictStatus!=='accepted'?{readbackWarnings:['Spear：远射程生成值 60，Foundry 未保留。']}:{}) };
  };
  const unexpected = async () => { throw new Error('Unexpected model review or correction.'); };
  const services: Partial<ForgeIntakeApplicationServices> = {
    createBrowserAiProvider: (() => ({})) as any, createBrowserItemAiProvider: (() => ({})) as any,
    analyzeBrowserActorSourceWithAi: analyze as any, analyzeBrowserItemSourceWithAi: analyze as any,
    generateBrowserActorIntakeCandidate: generate as any, generateBrowserItemIntakeCandidate: generate as any,
    reviewBrowserActorIntakeCandidate: unexpected as any, reviewBrowserItemIntakeCandidate: unexpected as any,
    repairBrowserActorIntake: unexpected as any, repairBrowserItemIntake: unexpected as any,
    approveBrowserItemIntakeCandidateForGm: ((input: any, candidate: any, gmId: string) => ({
      ...candidate, status: 'accepted', response: candidate.candidateResponse,
      gmApproval: { gmId, sourceHash: hashSource(input.source), finalSourceHash: candidate.finalSourceHash,
        artifactHash: hashArtifact(candidate.candidateResponse.result.artifact), candidateHash: candidate.candidateHash,
        targetHash: forgeGmTargetHash(candidate.candidateResponse.result.target), modelReviewStatus: 'not_requested',
        modelFindingsHash: forgeGmModelFindingsHash([]) },
    })) as any,
    createAcceptedForgeActor: strictCreate as any, createAcceptedForgeItem: strictCreate as any,
    createReviewedForgeActorCandidate: (async (input: any) => {
      counts.reviewedCreates += 1;
      expect(input.response.result.status).toBe(strictStatus);
      expect(input.reviewApproval.gmId).toBe('test-user');
      expect(input.reviewApproval.artifactHash).toBe(hashArtifact(input.response.result.artifact));
      expect(input.reviewApproval.findingsHash).toMatch(/^[a-f0-9]{64}$/u);
      return { ...actorCreateResult(), uuid: `Actor.${hashArtifact({ sourceId: input.response.result.sourceIdentity.sourceId }).slice(0, 16)}`,readbackWarnings:['Spear：远射程生成值 60，Foundry 未保留。'] };
    }) as any,
  };
  return { counts, services };
}

function blocking(code: string) { return { id: code, code, path: '/', message: code, blocking: true, origin: 'evidence' }; }
function forgeSessionSettingsFixture(): any {
  return {
    providerId: 'custom', protocol: 'openai-chat', authScheme: 'bearer', region: '', reasoning: 'auto', structuredOutput: 'prompt_fallback',
    useSeparateReviewModel: false, endpoint: 'https://provider.example/v1', model: 'extract', reviewModel: 'review', apiKey: 'session-key', persistApiKey: false, savedApiKeys: {},
  };
}
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
  (application as any).connectionProbeIdentity = JSON.stringify({ providerId: 'custom', endpoint: root.endpoint.value, protocol: root.protocol.value, authScheme: root.authScheme.value, region: root.region.value, model: root.model.value, reviewModel: root.model.value, useSeparateReviewModel: false, reasoning: root.reasoning.value, structuredOutput: root.structuredOutput.value, autoCorrect: false });
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
    fvttVersion: '14.364', systemVersion: '5.3.3', effectProfile: 'core', iconMode: 'safe',
  });
}

function primaryWorkspaceActions(root: FakeRoot): string[] {
  return Object.entries({
    analyze: root.analyze,
    editSource: root.editSource,
    resumeReview: root.resumeReview,
    generate: root.generate,
    create: root.create,
    repair: root.repair,
    regenerate: root.regenerate,
    openCreated: root.openCreated,
    clear: root.clear,
    cancel: root.cancel,
    startNewAttempt: root.startNewAttempt,
  }).filter(([, button]) => !button.hidden && button.dataset.primary === 'true').map(([name]) => name);
}

class FakeRoot {
  completionDiagnostics = control(''); completionIssues = control(''); clearCandidateCache = control('');
  constructor(private readonly includeConnectionFields = true) {}
  dataset: Record<string, string> = {};
  mode = control('plaintext-actor', 'select'); source = control('', 'textarea'); displayName = control('');
  sourceFile = control('', 'file');
  provider = control('openai', 'select'); endpoint = control(''); protocol = control('openai-responses', 'select'); authScheme = control('bearer', 'select'); region = control('', 'select'); reasoning = control('auto', 'select'); structuredOutput = control('json_schema', 'select');
  model = control(''); reviewModel = control(''); apiKey = control('', 'password'); persistApiKey = control('', 'checkbox'); useSeparateReviewModel = control('', 'checkbox'); aiSettings = control('');
  reviewBundleFile = control('', 'file'); import = control(''); startNewAttempt = control('');
  sourceLibrarySearch = control(''); sourceLibraryFile = control('', 'file'); libraryRefresh = control(''); librarySave = control(''); libraryExport = control(''); libraryImport = control('');
  batchCollectionFile = control('', 'file'); batchRefresh = control(''); batchImport = control(''); batchExport = control(''); batchRun = control(''); batchStop = control(''); batchApply = control('');
  analyze = control(''); repair = control(''); generate = control(''); modelReview = control(''); regenerate = control(''); reject = control(''); cancel = control(''); clear = control(''); export = control(''); downloadActor = control(''); create = control(''); clearKey = control(''); clearAllKeys = control(''); toggleKey = control(''); toggleEndpoint = control('');
  editSource = control(''); resumeReview = control(''); openCreated = control('');
  status = control(''); humanSummary = control(''); stages = control(''); diagnostics = control(''); diagnosticList = control(''); previewSection = control(''); activityCard = control(''); candidate = control(''); evidence = control(''); metadata = control(''); canonical = control(''); rawSource = control(''); preview = control(''); json = control('');
  librarySummary = control(''); libraryList = control('');
  batchSummary = control(''); batchList = control('');
  connectionSummary = control(''); connectionStatus = control(''); humanPreview = control(''); createdDocument = control(''); connectionOpen = control(''); structuredOpen = control('');
  workspace = control('', 'section'); inputStep = control('', 'section'); reviewStep = control('', 'section'); createdStep = control('', 'section');
  inputIndicator = control('', 'li'); reviewIndicator = control('', 'li'); createdIndicator = control('', 'li');
  workspaceScroll = control('', 'section'); advancedWorkspace = control('', 'details'); workspaceMore = control('', 'details'); workspaceHint = control('');
  activitySummary = control(''); activityDetail = control('');
  querySelector(selector: string): any {
    const fields = ({
      '[name="mode"]': this.mode, '[name="source"]': this.source, '[name="displayName"]': this.displayName, '[name="provider"]': this.provider, '[name="endpoint"]': this.endpoint,
      '[name="protocol"]': this.protocol, '[name="authScheme"]': this.authScheme, '[name="region"]': this.region, '[name="reasoning"]': this.reasoning, '[name="structuredOutput"]': this.structuredOutput,
      '[name="model"]': this.model, '[name="reviewModel"]': this.reviewModel, '[name="apiKey"]': this.apiKey, '[name="persistApiKey"]': this.persistApiKey, '[name="useSeparateReviewModel"]': this.useSeparateReviewModel,
      '[name="reviewBundleFile"]': this.reviewBundleFile,
      '[name="sourceLibrarySearch"]': this.sourceLibrarySearch, '[name="sourceLibraryFile"]': this.sourceLibraryFile,
      '[name="batchCollectionFile"]': this.batchCollectionFile,
      '[data-ai-settings]': this.aiSettings, '[data-action="analyze"]': this.analyze, '[data-action="repair"]': this.repair, '[data-action="generate"]': this.generate, '[data-action="model-review"]': this.modelReview,
      '[data-action="regenerate"]': this.regenerate, '[data-action="reject"]': this.reject, '[data-action="cancel"]': this.cancel, '[data-action="clear"]': this.clear,
      '[data-action="export"]': this.export, '[data-action="create"]': this.create, '[data-action="clear-key"]': this.clearKey,
      '[data-action="download-actor"]': this.downloadActor, '[data-action="clear-candidate-cache"]': this.clearCandidateCache,
      '[data-action="clear-all-keys"]': this.clearAllKeys,
      '[data-action="toggle-key"]': this.toggleKey, '[data-action="toggle-endpoint"]': this.toggleEndpoint,
      '[data-action="import"]': this.import, '[data-action="start-new-attempt"]': this.startNewAttempt,
      '[data-action="edit-source"]': this.editSource, '[data-action="resume-review"]': this.resumeReview, '[data-action="open-created"]': this.openCreated,
      '[data-action="library-refresh"]': this.libraryRefresh, '[data-action="library-save"]': this.librarySave, '[data-action="library-export"]': this.libraryExport, '[data-action="library-import"]': this.libraryImport,
      '[data-action="batch-refresh"]': this.batchRefresh, '[data-action="batch-import"]': this.batchImport, '[data-action="batch-export"]': this.batchExport, '[data-action="batch-run"]': this.batchRun, '[data-action="batch-stop"]': this.batchStop, '[data-action="batch-apply"]': this.batchApply,
      '[data-status]': this.status, '[data-stages]': this.stages, '[data-diagnostics]': this.diagnostics, '[data-diagnostic-list]': this.diagnosticList,
      '[data-completion-diagnostics]': this.completionDiagnostics, '[data-completion-issues]': this.completionIssues,
      '[data-human-summary]': this.humanSummary, '[data-activity-card]': this.activityCard,
      '[data-activity-summary]': this.activitySummary, '[data-activity-detail]': this.activityDetail,
      '[data-preview-section]': this.previewSection, '[data-candidate]': this.candidate, '[data-evidence]': this.evidence, '[data-metadata]': this.metadata,
      '[data-canonical]': this.canonical, '[data-raw-source]': this.rawSource, '[data-preview]': this.preview, '[data-json]': this.json,
      '.forge-workspace': this.workspace, '[data-step="input"]': this.inputStep, '[data-step="review"]': this.reviewStep, '[data-step="created"]': this.createdStep,
      '[data-step-indicator="input"]': this.inputIndicator, '[data-step-indicator="review"]': this.reviewIndicator, '[data-step-indicator="created"]': this.createdIndicator,
      '[data-workspace-scroll]': this.workspaceScroll, '[data-advanced-workspace]': this.advancedWorkspace, '[data-workspace-more]': this.workspaceMore, '[data-workspace-hint]': this.workspaceHint,
      '[data-library-summary]': this.librarySummary, '[data-library-list]': this.libraryList,
      '[data-batch-summary]': this.batchSummary, '[data-batch-list]': this.batchList,
      '[name="sourceFile"]': this.sourceFile, '[data-connection-summary]': this.connectionSummary, '[data-connection-status]': this.connectionStatus,
      '[data-human-preview]': this.humanPreview, '[data-created-document]': this.createdDocument,
      '[data-action="connection-open"]': this.connectionOpen, '[data-action="structured-open"]': this.structuredOpen,
    } as Record<string, any>);
    if (!this.includeConnectionFields && ['[name="provider"]', '[name="endpoint"]', '[name="protocol"]', '[name="authScheme"]', '[name="region"]', '[name="reasoning"]', '[name="structuredOutput"]', '[name="model"]', '[name="reviewModel"]', '[name="apiKey"]', '[name="persistApiKey"]', '[name="useSeparateReviewModel"]'].includes(selector)) return null;
    return fields[selector] ?? null;
  }
  querySelectorAll(selector: string): any[] {
    if (selector.startsWith('[data-action="')) {
      const element = this.querySelector(selector);
      return element ? [element] : [];
    }
    return [];
  }
}
function control(value: string, type = 'button'): any {
  return {
    value, type, checked: false, files: undefined, disabled: false, hidden: false, textContent: '', innerHTML: '', dataset: {},
    scrollTop: 0, attributes: {}, onclick: undefined, onchange: undefined, oninput: undefined,
    focus: () => undefined,
    setAttribute(name: string, attributeValue: string) { this.attributes[name] = attributeValue; },
    removeAttribute(name: string) { delete this.attributes[name]; },
    querySelector: () => null,
    querySelectorAll: () => [],
    replaceChildren: () => undefined,
  };
}

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
