/** Task-only real Foundry acceptance. Only Provider replies/settings are fixed.
 * Uses the unchanged saved Mage proposal and production Application, formal
 * generation, IndexedDB queue, GM approval, creation and readback services.
 * Invoke through the normal Foundry Macro UI. No live model endpoint exists.
 */
import { createForgeWorkspaceApplicationClass } from '../../foundry-modules/fvtt-json-forge/src/workspaceApplication';
import { DEFAULT_CLIENT_SETTINGS } from '../../foundry-modules/fvtt-json-forge/src/settings';
import { hashSource, hashArtifact } from '@fvtt-json-generator/forge-gateway-protocol';
import { createForgeBatchCollection } from '@fvtt-json-generator/forge-browser-runtime/batch-collection';
import { ManagedForgeBatchQueue } from '@fvtt-json-generator/forge-browser-runtime/batch-queue';
import { IndexedDbForgeBatchQueueStore } from '@fvtt-json-generator/forge-browser-runtime/batch-queue-indexed-db';
import { ManagedForgeSourceLibrary } from '@fvtt-json-generator/forge-browser-runtime/source-library';
import { IndexedDbForgeSourceLibraryStore } from '@fvtt-json-generator/forge-browser-runtime/source-library-indexed-db';
import { decodeForgeIntakeReviewBundleText, serializeForgeIntakeReviewBundleV2 } from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';
import type { MonsterIntakeIR, MonsterIntakeAiProvider } from '@fvtt-json-generator/intake-ai';

const TASK = 'forge-batch-20261023-50b1e3';
const KEY = `fvtt-json-forge.qa.${TASK}`;
const GLOBAL = '__forgeBatchRuntime50b1e3';
export const MACRO_NAME = 'Forge Batch QA 50b1e3';
type Seed = { source: string; sourceHash: string; ir: MonsterIntakeIR };
function target(): any {
  const e = globalThis as any;
  if (location.origin !== 'http://127.0.0.1:30001' || e.game.world.id !== 'cor-cotn'
    || e.game.version !== '14.368' || e.game.system.id !== 'dnd5e' || e.game.system.version !== '5.3.3'
    || !e.game.user?.isGM) throw Error('Wrong exact local QA target.');
  return e;
}
function saved(): any {
  const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  if (!value || value.task !== TASK || value.user !== target().game.user.id) throw Error('Task ownership mismatch.');
  return value;
}
function save(value: any) { localStorage.setItem(KEY, JSON.stringify(value)); }
// Foundry DTOs can contain undefined extension fields. Hash their JSON view,
// just as evidence serialization does; never mutate or rewrite the Document.
function dtoHash(value: any) { return hashArtifact(JSON.parse(JSON.stringify(value))); }
function scope() { const e = target(); return `${e.game.world.id}:${e.game.user.id}:qa:${TASK}`; }
function managers() {
  return { queue: new ManagedForgeBatchQueue(new IndexedDbForgeBatchQueueStore(scope())),
    library: new ManagedForgeSourceLibrary(new IndexedDbForgeSourceLibraryStore(scope())) };
}
function worldIds(): Record<string, string[]> {
  const e = target();
  return Object.fromEntries(['actors', 'items', 'scenes', 'macros', 'journal', 'tables', 'playlists', 'cards', 'folders', 'combats', 'messages']
    .map(key => [key, (e.game[key]?.contents ?? []).filter((d: any) => key !== 'macros' || d.name !== MACRO_NAME).map((d: any) => d.id).sort()]));
}
function worldProtection() {
  const e = target(), guard = e.game.actors.get('mmGuard000000000');
  const tokens = e.game.scenes.contents.flatMap((s: any) => s.tokens.contents.filter((t: any) => t.actorId === guard?.id)
    .map((t: any) => ({ scene: s.id, dto: t.toObject() }))).sort((a: any, b: any) => `${a.scene}:${a.dto._id}`.localeCompare(`${b.scene}:${b.dto._id}`));
  if (guard?.items.size !== 8 || tokens.length !== 24) throw Error('Existing Guard baseline changed; do not use it.');
  return { guardHash: dtoHash(guard.toObject()), guardTokensHash: hashSource(JSON.stringify(tokens)),
    view: { scene: e.canvas.scene?.id, position: e.canvas.scene?._viewPosition, worldTime: e.game.time.worldTime,
      paused: e.game.paused, controlled: e.canvas.tokens.controlled.map((t: any) => t.id).sort(),
      targets: [...e.game.user.targets].map((t: any) => t.id).sort() } };
}
async function stored(databaseName: string, storeName: string, id: string) {
  const names = await indexedDB.databases();
  if (!names.some(d => d.name === databaseName)) return { present: false };
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(databaseName); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    if (!db.objectStoreNames.contains(storeName)) return { present: false };
    return await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly'), r = tx.objectStore(storeName).get(id);
      let value: any; r.onsuccess = () => { value = r.result; };
      tx.oncomplete = () => resolve(value === undefined ? { present: false } : { present: true, hash: hashSource(JSON.stringify(value)) });
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function originalScopes() {
  const e = target(), id = `${e.game.world.id}:${e.game.user.id}`;
  return { queue: await stored('fvtt-json-forge-batch-queue', 'queues', id),
    library: await stored('fvtt-json-forge-source-library', 'libraries', id),
    encounter: await stored('fvtt-json-forge-encounter-recovery', 'checkpoints', id) };
}
async function seed(): Promise<Seed> {
  const r = await fetch('/modules/fvtt-json-forge/scripts/qa-batch-seed-50b1e3.json');
  if (!r.ok) throw Error('Fixed seed unavailable.');
  const s: Seed = await r.json();
  if (hashSource(s.source) !== s.sourceHash || s.ir.source.sha256 !== s.sourceHash || s.ir.source.length !== s.source.length) throw Error('Seed identity mismatch.');
  return s;
}
async function initialize() {
  const e = target();
  if (localStorage.getItem(KEY) !== null) return saved();
  const existing = await stored('fvtt-json-forge-batch-queue', 'queues', scope());
  const existingLibrary = await stored('fvtt-json-forge-source-library', 'libraries', scope());
  if (existing.present || existingLibrary.present) throw Error('Refuse existing QA scope collision.');
  const value = { task: TASK, user: e.game.user.id, baselineIds: worldIds(), protection: worldProtection(),
    originalScopes: await originalScopes(), calls: { discover: 0, extract: 0, review: 0, repair: 0, liveModel: 0 } };
  save(value); return value;
}
export async function prepareCollection() {
  await initialize();
  const s = await seed(), { queue, library } = managers();
  try {
    const collection = createForgeBatchCollection({ label: `${TASK} Mage`, createdAt: '2026-10-22T16:00:00.000Z', entries: [
      { objectKind: 'actor', mode: 'ai-monster', sourceLabel: 'ForgeBatchQA-50b1e3 Mage', rawSource: s.source },
    ] });
    const state = await queue.importCollection(collection);
    if (state.collections.length !== 1 || state.jobs.length !== 1) throw Error('Unexpected QA queue membership.');
    target().ui.notifications.info('Task collection prepared; open workspace and use the normal batch controls.');
  } finally { queue.close(); library.close(); }
}
export async function openWorkspace() {
  const e = target(); await initialize();
  if (e.foundry.applications.instances.has('fvtt-json-forge-workspace-actor')) throw Error('Close the current Actor workspace normally first.');
  const s = await seed();
  const count = (kind: string) => { const value = saved(); value.calls[kind]++; save(value); };
  const provider: MonsterIntakeAiProvider = { providerName: 'fixed-batch-acceptance', extractionModel: 'saved-mage-ir', reviewModel: 'disabled',
    discover: async request => {
      if (request.source !== s.source || request.sourceSha256 !== s.sourceHash) throw Error('Unexpected source.');
      count('discover'); return { schemaVersion: 1, candidates: [{ id: 'saved-mage', label: 'Mage', start: 0, end: s.source.length, quote: s.source }] };
    },
    extract: async request => { if (request.source !== s.source || request.sourceSha256 !== s.sourceHash) throw Error('Unexpected extraction.'); count('extract'); return structuredClone(s.ir); },
    review: async () => { count('review'); throw Error('No model review allowed.'); },
    repair: async () => { count('repair'); throw Error('No model repair allowed.'); },
  };
  const settings = { ...DEFAULT_CLIENT_SETTINGS, providerId: 'custom' as const, endpoint: 'https://frozen.invalid/v1',
    model: 'saved-mage-ir', protocol: 'openai-chat' as const, apiKey: 'fixture-only', autoCorrect: false,
    persistApiKey: false, savedApiKeys: {} };
  const { queue, library } = managers();
  const App = createForgeWorkspaceApplicationClass({ game: e.game, foundry: e.foundry, ui: e.ui, window: e.window,
    hooks: e.Hooks, directoryKind: 'Actor', initialMode: 'ai', intake: { batchQueue: queue, sourceLibrary: library,
      services: { createBrowserAiProvider: () => provider,
        readForgeSessionSettings: () => structuredClone(settings),
        saveForgeSessionSettings: () => { throw Error('QA cannot save connection settings.'); },
        subscribeForgeSessionSettings: () => () => {}, isForgeSessionConnectionReady: () => true },
    } });
  const app = new App(); e[GLOBAL] = { app, scope: scope(), boundary: 'Only frozen Provider/settings injected; real formal generation, queue, IndexedDB, UI, GM approval and create/readback.' };
  await app.render({ force: true });
}
export async function readback() {
  const e = target(), prior = saved(), current = e[GLOBAL], { queue, library } = managers();
  try {
    const state = await queue.load(), libraryState = await library.load();
    const ids = worldIds();
    const delta = Object.fromEntries(Object.keys(ids).map(key => [key, {
      added: ids[key]!.filter(id => !prior.baselineIds[key].includes(id)),
      missing: prior.baselineIds[key].filter((id: string) => !ids[key]!.includes(id)),
    }]));
    const created = state.jobs.flatMap(job => {
      const id = job.applyResult?.uuid?.replace(/^Actor\./u, ''), actor = id && e.game.actors.get(id);
      if (!actor) return [];
      const dto = actor.toObject();
      return [{ id, name: actor.name, dtoHash: dtoHash(dto), forge: dto.flags?.['fvtt-json-forge'],
        stats: { ac: dto.system.attributes.ac, hp: dto.system.attributes.hp, abilities: dto.system.abilities },
        items: dto.items.map((item: any) => ({ id: item._id, name: item.name, type: item.type,
          uses: item.system?.uses, activities: item.system?.activities, flags: item.flags?.['fvtt-json-forge'] })) }];
    });
    const intake = current?.app.intake;
    const result = { task: TASK, at: new Date().toISOString(), scope: scope(), target: { world: e.game.world.id, core: e.game.version,
      system: e.game.system.version, isGM: e.game.user.isGM }, calls: prior.calls, boundary: current?.boundary,
      queue: state, libraryReviews: libraryState.reviews.length, volatileCandidates: intake?.batchResponses?.size ?? 0,
      current: intake ? { status: intake.status, attemptId: intake.attemptId, generationStatus: intake.generation?.status,
        strictStatus: intake.generation?.candidateResponse?.result?.status,
        findings: intake.generation?.findings, imported: intake.importedReview?.bundle?.status } : null,
      created, delta, protection: worldProtection(), originalProtection: prior.protection,
      originalScopes: await originalScopes(), expectedOriginalScopes: prior.originalScopes };
    prior.lastEvidence = { at: result.at, ids: created.map((a: any) => a.id) }; save(prior);
    return result;
  } finally { queue.close(); library.close(); }
}
export async function prepareCommittingHistory() {
  const e = target(), current = e[GLOBAL];
  if (!current?.app) throw Error('Open the workspace first.');
  const { queue, library } = managers();
  try {
    const state = await queue.load(), proof = state.jobs[0]?.latestReview;
    if (proof?.status !== 'reviewed_candidate' || !proof.gmApproval || proof.candidateResponse?.status === 'accepted') throw Error('Adopt the real nonaccepted candidate first.');
    const fixture = { ...proof, status: 'committing_and_reading_back' as const };
    decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(fixture));
    const root = current.app.element.querySelector('[data-forge-pane="intake"]');
    const input = root?.querySelector('[name="reviewBundleFile"]');
    if (!input) throw Error('Normal history upload control unavailable.');
    const transfer = new DataTransfer();
    transfer.items.add(new File([serializeForgeIntakeReviewBundleV2(fixture)], 'qa-committing-review-50b1e3.json', { type: 'application/json' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    e.ui.notifications.info('Valid historical committing fixture selected in the normal upload control. Click 载入审核记录.');
  } finally { queue.close(); library.close(); }
}
async function removeScope(databaseName: string, storeName: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(databaseName); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(scope());
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function cleanup() {
  const e = target(), value = saved();
  if (e.foundry.applications.instances.has('fvtt-json-forge-workspace-actor')) throw Error('Close the workspace before cleanup.');
  const { queue, library } = managers();
  try {
    const state = await queue.load();
    for (const job of state.jobs) {
      const id = job.applyResult?.uuid?.replace(/^Actor\./u, ''); if (!id) continue;
      if (!value.lastEvidence?.ids.includes(id) || value.baselineIds.actors.includes(id)) throw Error('Owned actor final readback missing.');
      const actor = e.game.actors.get(id); if (!actor) continue;
      const identity = actor.flags?.['fvtt-json-forge']?.sourceId;
      if (identity !== job.latestReview?.sourceIdentity?.sourceId) throw Error('Owned Actor identity mismatch; refusing deletion.');
      await actor.delete();
    }
  } finally { queue.close(); library.close(); }
  await removeScope('fvtt-json-forge-batch-queue', 'queues');
  await removeScope('fvtt-json-forge-source-library', 'libraries');
  const result = { task: TASK, idsRestored: JSON.stringify(worldIds()) === JSON.stringify(value.baselineIds),
    protectionRestored: JSON.stringify(worldProtection()) === JSON.stringify(value.protection),
    scopesUntouched: JSON.stringify(await originalScopes()) === JSON.stringify(value.originalScopes), calls: value.calls,
    qaQueue: await stored('fvtt-json-forge-batch-queue', 'queues', scope()),
    qaLibrary: await stored('fvtt-json-forge-source-library', 'libraries', scope()) };
  if (!result.idsRestored || !result.protectionRestored || !result.scopesUntouched) throw Error(`Final restoration mismatch: ${JSON.stringify(result)}`);
  localStorage.removeItem(KEY); delete e[GLOBAL]; await showJson(result, 'Forge Batch QA Cleanup');
}
async function showJson(value: unknown, title = 'Forge Batch QA Evidence') {
  const e = target(), escaped = JSON.stringify(value, null, 2).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
  new e.Dialog({ title, content: `<textarea aria-label="QA JSON" style="width:100%;height:500px">${escaped}</textarea>`,
    buttons: { close: { label: '关闭' } } }, { width: 1000, height: 650 }).render(true);
}
export async function showControl() {
  const e = target(); await initialize();
  new e.Dialog({ title: 'Forge Batch QA Controls 50b1e3', content: '<p>固定Mage回复；仅本任务scope。生成、队列、GM确认、创建和刷新走真实代码，0真实模型调用。</p>',
    buttons: {
      seed: { label: '准备唯一Collection', callback: () => prepareCollection() },
      open: { label: '打开真实工作台', callback: () => openWorkspace() },
      read: { label: '读取验收证据', callback: () => readback().then(value => showJson(value)) },
      history: { label: '准备提交中历史文件', callback: () => prepareCommittingHistory() },
      cleanup: { label: '最终读回后清理任务对象', callback: () => cleanup() },
      close: { label: '关闭' },
    } }, { width: 1000 }).render(true);
}
