import { describe, expect, test } from 'bun:test';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { createForgeEncounterApplicationClass } from '../src/encounterApplication';
import { configuredConditionsCatalog } from '../src/configuredConditions';
import { decodeEncounterRecovery, serializeEncounterRecovery, IndexedDbEncounterRecoveryStore, EncounterRecoveryConflictError,
  type EncounterRecoverySnapshot, type SourceEncounterRecoverySnapshot } from '../src/encounterRecoveryStore';
import { encounterReviewCards } from '../src/encounterReviewCards';
import { prepareForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { serializeForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { encounterFixture } from '../../../tests/helpers/forge-encounter';
import { localizationText } from '@fvtt-json-generator/contracts/localization';

const source = '## 生物一：Night Claw\nIts attack hits a target.\n## 生物二：守卫\n守卫的攻击命中目标。';
function game() { return { version: '14.368', world: { id: 'world-a' }, system: { id: 'dnd5e', version: '5.3.3' }, user: { id: 'gm-a', isGM: true }, macros: { contents: [] } }; }
function report(): any { return { version: 1, source, sourceHash: hashSource(source), model: 'first', reviewModel: 'first', evidenceMode: 'exact-quotes-v1',
  status: 'needs_review', actors: [{ key: 'actor-1', start: 0, end: source.indexOf('## 生物二'), source: source.slice(0, source.indexOf('## 生物二')), analysis: { ir: { sample: true }, candidate: { label: 'Night Claw' } } }], findings: ['Review unavailable'] }; }
function snapshot(overrides: Partial<SourceEncounterRecoverySnapshot> = {}): SourceEncounterRecoverySnapshot {
  const current = game();
  return { version: 1, source, sourceHash: hashSource(source), label: '夜爪与守卫', outputLanguage: 'zh-CN',
    target: '14.368/dnd5e/5.3.3/core', catalogHash: hashSource(JSON.stringify(configuredConditionsCatalog(current))), report: report(), ...overrides };
}
async function uploadedSnapshot(){
  const prepared=await prepareForgeEncounter(serializeForgeEncounterPackage(encounterFixture()));
  const serialized=serializeForgeEncounterPackage(prepared.bundle);
  return {version:2 as const,kind:'uploaded-package' as const,target:'14.368/dnd5e/5.3.3/core',
    catalogHash:hashSource(JSON.stringify(configuredConditionsCatalog(game()))),package:serialized,
    packageHash:prepared.hash,packageSha256:hashSource(serialized),translationReport:[]};
}
function app(store: { load: () => Promise<EncounterRecoverySnapshot | undefined>; save: (value: EncounterRecoverySnapshot) => Promise<void>; clear?: () => Promise<void> }, generate?: (input: any) => Promise<any>, key: () => string = () => 'secret-fixture-key') {
  let providerCalls = 0, generationCalls = 0, captured: any;
  const sourceControl: any = { value: '' };
  class Base { element: any = { querySelector: (selector: string) => selector === '[name="humanSource"]' ? sourceControl : null, querySelectorAll: () => [] }; render() { return this; } async close() { return this; } }
  const App = createForgeEncounterApplicationClass({ game: game(), foundry: { applications: { api: { ApplicationV2: Base, HandlebarsApplicationMixin: (base: any) => base } } },
    recoveryStore: { ...store, clear: store.clear ?? (async () => undefined) },
    getRecoverySecrets: () => ({ apiKey: key(), baseUrl: 'https://provider.example/v1' }),
    getAiOptions: () => { providerCalls++; return { baseUrl: 'https://provider.example/v1', apiKey: key(), model: 'fixture' }; },
    createEncounterIntakeProviders: () => ({ provider: {}, automationProvider: {} } as any),
    generateEncounterFromHumanMarkdown: async (input: any) => { generationCalls++; captured = input; return generate?.(input) ?? { report: report() }; } });
  return { application: new App() as any, sourceControl, get providerCalls() { return providerCalls; }, get generationCalls() { return generationCalls; }, get captured() { return captured; } };
}

describe('encounter task checkpoint', () => {
  test('source is saved before the first AI request and restored after reopening', async () => {
    let saved: EncounterRecoverySnapshot | undefined;
    const store = { load: async () => saved, save: async (value: EncounterRecoverySnapshot) => { saved = value; }, clear: async () => { saved = undefined; } };
    const first = app(store); await first.application._prepareContext(); first.application._onRender();
    first.sourceControl.value = source; first.sourceControl.oninput();
    await first.application.close();
    expect(saved?.source).toBe(source); expect(first.providerCalls).toBe(0);
    const reopened = app(store); expect((await reopened.application._prepareContext()).humanSource).toBe(source);
    expect(reopened.providerCalls).toBe(0); expect(reopened.generationCalls).toBe(0);
  });
  test('saved source and IR appear after refresh without a provider call or inherited approval', async () => {
    let saved: EncounterRecoverySnapshot | undefined = snapshot();
    const store = { load: async () => saved, save: async (value: EncounterRecoverySnapshot) => { saved = value; } };
    const first = app(store); const context = await first.application._prepareContext();
    expect(first.providerCalls).toBe(0); expect(first.generationCalls).toBe(0);
    expect(context.humanSource).toBe(source); expect(context.chineseSelected).toBe(true);
    expect(context.recoveryAvailable).toBe(true); expect(context.canImport).toBe(false);
    const second = app(store); expect((await second.application._prepareContext()).recoveryDraftCount).toBe(1);
    expect(second.generationCalls).toBe(0);
    await second.application.generateFromHuman(true);
    expect(second.generationCalls).toBe(1);
    expect(second.captured.drafts).toEqual([{ key: 'actor-1', source: report().actors[0].source, ir: { sample: true } }]);
    expect(second.captured.draftParentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.application.reviewed).toBe(false);
  });

  test('saved candidate needs explicit formal re-preview and a new GM confirmation', async () => {
    const bundle = encounterFixture();
    const withSource = { ...bundle, macros: [{ ...bundle.macros[0]!, notes: `原始资料SHA-256：${hashSource(source)}` }] };
    const prepared = await prepareForgeEncounter(JSON.stringify(withSource));
    const data = snapshot({ report: { ...report(), status: 'ready_for_gm_review', packageHash: prepared.hash }, package: JSON.stringify(withSource) });
    const harness = app({ load: async () => data, save: async () => undefined });
    const before = await harness.application._prepareContext();
    expect(before.recoveryPackageAvailable).toBe(true); expect(before.ready).toBe(false);
    expect(before.canImport).toBe(false); expect(harness.providerCalls).toBe(0);
    await harness.application.previewRecovered();
    const after = await harness.application._prepareContext();
    expect(after.ready).toBe(true); expect(after.recoveredReview).toBe(true);
    expect(after.canImport).toBe(false); expect(harness.generationCalls).toBe(0);
  });

  test('changed target, catalog or raw source cannot resume a stored proposal', async () => {
    for (const stale of [snapshot({ target: '14.364/dnd5e/5.3.3/core' }), snapshot({ catalogHash: 'a'.repeat(64) }), snapshot({ sourceHash: 'b'.repeat(64) })]) {
      const harness = app({ load: async () => stale, save: async () => undefined });
      const context = await harness.application._prepareContext();
      expect(context.recoveryAvailable).toBe(false);
      expect(harness.generationCalls).toBe(0);
    }
  });

  test('stored snapshots reject secrets and do not carry an import approval', () => {
    const valid = serializeEncounterRecovery(snapshot());
    expect(decodeEncounterRecovery(valid).report?.sourceHash).toBe(hashSource(source));
    expect(valid).not.toContain('reviewed');
    expect(() => serializeEncounterRecovery(snapshot({ label: '"apiKey":"private"' }))).toThrow('凭据');
    expect(() => decodeEncounterRecovery(valid.replace(hashSource(source), '0'.repeat(64)))).toThrow();
    expect(() => serializeEncounterRecovery(snapshot({ report: { ...report(), actors: [null] } as any }))).toThrow('来源报告');
  });
  test('uploaded package checkpoints reject corruption and restore only after formal preview with no provider',async()=>{
    const valid=await uploadedSnapshot();
    expect(decodeEncounterRecovery(serializeEncounterRecovery(valid))).toEqual(valid);
    expect(()=>serializeEncounterRecovery({...valid,packageSha256:'0'.repeat(64)})).toThrow('上传战斗包');
    expect(()=>serializeEncounterRecovery({...valid,report:report()} as any)).toThrow('上传战斗包');
    expect(()=>serializeEncounterRecovery({...valid,translationReport:[{status:'accepted'}]} as any)).toThrow('上传战斗包');
    const wrongRequest={...valid,translationReport:[{actorKey:'main',status:'draft_ready',request:{sourceHash:'0'.repeat(64)},draft:{texts:[]}}]};
    const harness=app({load:async()=>wrongRequest as any,save:async()=>undefined});
    const before=await harness.application._prepareContext();
    expect(before.recoveryPackageAvailable).toBe(true);expect(before.canImport).toBe(false);
    await harness.application.previewRecovered();
    expect(harness.application.prepared.hash).toBe(valid.packageHash);
    expect(harness.application.translationReport).toEqual([]);
    expect(harness.application.reviewed).toBe(false);
    expect(harness.providerCalls).toBe(0);expect(harness.generationCalls).toBe(0);
  });
  test('uploaded package restore rejects a changed formal hash, target or catalog',async()=>{
    const valid=await uploadedSnapshot();
    for(const stale of [{...valid,packageHash:'0'.repeat(64)},
      {...valid,target:'14.364/dnd5e/5.3.3/core'},
      {...valid,catalogHash:'a'.repeat(64)}]){
      const harness=app({load:async()=>stale,save:async()=>undefined});
      const before=await harness.application._prepareContext();
      if(stale.packageHash!==valid.packageHash){
        expect(before.recoveryPackageAvailable).toBe(true);
        await harness.application.previewRecovered();expect(harness.application.prepared).toBeUndefined();
      }else expect(before.recoveryPackageAvailable).toBe(false);
      expect(harness.providerCalls).toBe(0);expect(harness.generationCalls).toBe(0);
    }
  });
  test('editing source or clearing a recovered upload revokes its package and partial checkpoint',async()=>{
    let saved:EncounterRecoverySnapshot|undefined=await uploadedSnapshot();
    const store={load:async()=>saved,save:async(value:EncounterRecoverySnapshot)=>{saved=value;},clear:async()=>{saved=undefined;}};
    const harness=app(store);await harness.application._prepareContext();await harness.application.previewRecovered();
    harness.application._onRender();harness.sourceControl.value=source;harness.sourceControl.oninput();
    await harness.application.saveRecovery();
    expect(harness.application.prepared).toBeUndefined();expect(harness.application.recoveryPackage).toBeUndefined();
    expect((saved as EncounterRecoverySnapshot|undefined)?.version).toBe(1);expect(saved?.package).toBeUndefined();
    await harness.application.clearCurrentRecovery();expect(saved).toBeUndefined();
    expect(harness.providerCalls).toBe(0);
  });

  test('clearing the source removes the checkpoint and reopening does not revive it', async () => {
    let saved: EncounterRecoverySnapshot | undefined = snapshot(); let clears = 0;
    const store = { load: async () => saved, save: async (value: EncounterRecoverySnapshot) => { saved = value; }, clear: async () => { clears++; saved = undefined; } };
    const first = app(store); await first.application._prepareContext(); first.application._onRender();
    first.sourceControl.value = ''; first.sourceControl.oninput();
    await first.application.close();
    expect(clears).toBe(1); expect(saved).toBeUndefined();
    const reopened = app(store); expect((await reopened.application._prepareContext()).recoveryAvailable).toBe(false);
  });

  test('a rotated connection key is checked along with the old key before every checkpoint write', async () => {
    let saved: EncounterRecoverySnapshot | undefined = snapshot(); let current = 'secret-old';
    const store = { load: async () => saved, save: async (value: EncounterRecoverySnapshot) => { saved = value; } };
    const harness = app(store, undefined, () => current);
    await harness.application._prepareContext();
    await harness.application.generateFromHuman();
    await harness.application.saveRecovery();
    const safe = JSON.stringify(saved);
    current = 'secret-new'; harness.application.humanSource = `${source}\nsecret-new`;
    await harness.application.saveRecovery();
    expect(JSON.stringify(saved)).toBe(safe); expect(harness.application.error).toContain('任务尚未保存');
    harness.application.humanSource = `${source}\nsecret-old`;
    await harness.application.saveRecovery();
    expect(JSON.stringify(saved)).toBe(safe);
  });
});

describe('source-to-rule review cards', () => {
  test('localized GM steps use only the same actor approved texts and label missing mappings', () => {
    const first='The GM removes the effect after one minute.';
    const second='The GM checks any remaining prerequisite.';
    const data:any={actors:[{key:'actor-1',source:`Echo Claw. ${first} ${second}`,analysis:{candidate:{label:'Echo Claw'}}}],
      automation:{selection:{rules:[{actorKey:'actor-1',featureName:'Echo Claw',kind:'gm-manual',quote:first,
        parameters:{},gmSteps:[first,second]}]}}};
    const localized:any={actors:[
      {key:'actor-1',translation:{review:{verdict:'accepted',findings:[]},texts:[{id:localizationText('body',first).id,text:'GM 在一分钟后移除此效应。'}]}},
      {key:'actor-2',translation:{review:{verdict:'accepted',findings:[]},texts:[{id:localizationText('body',second).id,text:'其他角色的错误映射'}]}},
    ]};
    const card=encounterReviewCards(data,localized)[0]!;
    expect(card.source).toBe(first);
    expect(card.gmSteps[0]).toBe('GM 在一分钟后移除此效应。');
    expect(card.gmSteps[1]).toContain('来源语言');
    expect(card.gmSteps[1]).toContain(second);
    expect(card.gmSteps[1]).toContain('完整已译规则');
    expect(card.gmSteps.join(' ')).not.toContain('其他角色的错误映射');
  });
  test('shows bilingual source text, missing proof and GM steps as inert strings', () => {
    const sourceText = 'If Night Claw hits, target is Deafened for one minute. 守卫交给 GM。 <img src=x onerror=alert(1)>';
    const data: any = { actors: [{ key: 'actor-1', source: sourceText, analysis: { candidate: { label: 'Night Claw 夜爪' } } }],
      automation: { selection: { rules: [{ actorKey: 'actor-1', featureName: 'Echo Claw', kind: 'status-lifecycle',
        quote: sourceText, parameters: { status: 'deafened' }, gmSteps: ['其他例外由 GM 裁定'], sourceEvidence: { application: 'If Night Claw hits', duration: 'invented duration' } }] } } };
    const card = encounterReviewCards(data)[0]!;
    expect(card.source).toContain('守卫交给 GM'); expect(card.source).toContain('<img');
    expect(card.evidence).toEqual([{ label: '施加对象与触发', quote: 'If Night Claw hits' }]);
    expect(card.evidenceMissing).toBe(true); expect(card.gmSteps).toEqual(['其他例外由 GM 裁定']);
  });
  test('puts the closed status timing, duration and save in readable text above the JSON', () => {
    const quote = 'When the attack hits, the target is Deafened for one minute. At the end of each of its turns, it can make a DC 10 Wisdom save, ending the effect on success.';
    const data: any = { actors: [{ key: 'actor-1', source: quote, analysis: { candidate: { label: 'Echo Claw' } } }],
      automation: { selection: { rules: [{ actorKey: 'actor-1', featureName: 'Echo Claw', kind: 'status-lifecycle', quote,
        parameters: { trigger: 'attack-hit', status: 'deafened', duration: { value: 1, unit: 'minute' },
          repeatSave: { ability: 'wis', dc: 10, timing: 'target-turn-end', optional: true } }, gmSteps: ['GM 选定目标'] }] } } };
    const card = encounterReviewCards(data)[0]!;
    expect(card.summary).toContain('命中'); expect(card.summary).toContain('1分钟');
    expect(card.summary).toContain('每回合结束'); expect(card.summary).toContain('DC 10');
    expect(card.summary).toContain('成功解除');
  });
});

test('IndexedDB checkpoints reject stale windows and keep a cleared task tombstone', async () => {
  const factory = new CheckpointDbFactory();
  const first = new IndexedDbEncounterRecoveryStore('world-a:gm-a', factory as unknown as IDBFactory);
  const stale = new IndexedDbEncounterRecoveryStore('world-a:gm-a', factory as unknown as IDBFactory);
  const other = new IndexedDbEncounterRecoveryStore('world-b:gm-a', factory as unknown as IDBFactory);
  expect(await first.load()).toBeUndefined(); expect(await stale.load()).toBeUndefined();
  await first.save(snapshot());
  await expect(stale.save(snapshot({ label: 'stale' }))).rejects.toThrow(EncounterRecoveryConflictError);
  await first.clear(); expect(await first.load()).toBeUndefined();
  await expect(stale.save(snapshot())).rejects.toThrow(EncounterRecoveryConflictError);
  expect(await other.load()).toBeUndefined(); await other.save(snapshot());
  expect((await other.load())?.label).toBe('夜爪与守卫');
});

class CheckpointDbFactory {
  values = new Map<IDBValidKey, unknown>();
  hasStore = false;
  open(): IDBOpenDBRequest {
    const request: any = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    queueMicrotask(() => {
      request.result = new CheckpointDb(this);
      if (!this.hasStore) request.onupgradeneeded?.(new Event('upgradeneeded'));
      request.onsuccess?.(new Event('success'));
    });
    return request;
  }
}
class CheckpointDb {
  objectStoreNames = { contains: () => this.owner.hasStore };
  constructor(private owner: CheckpointDbFactory) {}
  createObjectStore(): IDBObjectStore { this.owner.hasStore = true; return {} as IDBObjectStore; }
  transaction(_name: string, mode: IDBTransactionMode): IDBTransaction { return new CheckpointTransaction(this.owner, mode) as unknown as IDBTransaction; }
  close(): void {}
}
class CheckpointTransaction {
  oncomplete: ((event: Event) => void) | null = null;
  onabort: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  error: DOMException | null = null;
  private active = true;
  private pending = 0;
  constructor(private owner: CheckpointDbFactory, private mode: IDBTransactionMode) {}
  objectStore(): IDBObjectStore { return {
    get: (key: IDBValidKey) => this.request(() => this.owner.values.get(key)),
    put: (value: unknown, key: IDBValidKey) => this.request(() => {
      if (this.mode !== 'readwrite') throw new Error('readonly');
      this.owner.values.set(key, value); return key;
    }),
  } as IDBObjectStore; }
  abort(): void { this.active = false; queueMicrotask(() => this.onabort?.(new Event('abort'))); }
  private request<T>(operation: () => T): IDBRequest<T> {
    const request: any = { result: undefined, error: null, onsuccess: null, onerror: null };
    this.pending++;
    queueMicrotask(() => {
      if (!this.active) return;
      try { request.result = operation(); request.onsuccess?.(new Event('success')); }
      catch (error) { this.error = new DOMException(String(error)); this.active = false; this.onerror?.(new Event('error')); }
      finally { this.pending--; this.scheduleCompletion(); }
    });
    return request;
  }
  private scheduleCompletion(): void {
    if (!this.active || this.pending) return;
    setTimeout(() => { if (!this.active || this.pending) return; this.active = false; this.oncomplete?.(new Event('complete')); }, 0);
  }
}
