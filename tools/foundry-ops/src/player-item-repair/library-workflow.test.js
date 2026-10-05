import { test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { APPROVAL } from './approval.mjs';
import { canonical, stable, sourceTemplate, projectRepair, libraryIdentity } from './core.mjs';
import { createLibraryWorkflow } from './library-workflow.mjs';

const digest = async value => createHash('sha256').update(stable(value)).digest('hex');
const hash = value => digest(canonical(value));
class Collection extends Map { [Symbol.iterator]() { return this.values(); } }
async function fixture(options = {}) {
  const approval = structuredClone(APPROVAL);
  delete approval.recovery;
  const game = { actors: new Collection(), items: new Collection(), folders: new Collection() };
  const writes = { source: 0, folder: 0, player: 0 };
  const rawActor = actor => structuredClone(actor.data);
  const rawItem = (actor, id) => rawActor(actor).items.find(i => i._id === id);
  const reference = async uuid => { const [, a, , i] = uuid.split('.'); const source = rawItem(game.actors.get(a), i); if (!source) throw new Error('Missing source'); return source; };
  for (const a of approval.actors) {
    const data = { _id: a.actorId, items: [], system: { hp: 17 }, ownership: { default: 0 }, _stats: { modifiedTime: 1 } };
    const invalidDocumentIds = new Set(a.items.map(i => i.itemId)), cached = new Map();
    const actor = { id: a.actorId, data, items: { invalidDocumentIds,
      has: id => cached.has(id) || (!invalidDocumentIds.has(id) && data.items.some(i => i._id === id)),
      get: id => cached.get(id),
      getInvalid: id => ({ id, parent: actor, invalid: true, validate() { return !this.invalid; }, toObject: () => structuredClone(data.items.find(i => i._id === id)) }),
      set: (id, doc, opts) => { if (!opts || opts.modifySource !== false) throw new Error('Unexpected direct source mutation'); cached.set(id, doc); },
      delete: (id, opts) => { if (!opts || opts.modifySource !== false) throw new Error('Unexpected source deletion'); cached.delete(id); } },
      updateEmbeddedDocuments: async (kind, updates) => {
        writes.player++;
        for (const u of updates) {
          const item = data.items.find(i => i._id === u._id);
          for (const [key, value] of Object.entries(u)) if (key !== '_id') {
            const parts = key.split('.'); let object = item;
            for (const k of parts.slice(0, -1)) object = object[k];
            object[parts.at(-1)] = structuredClone(value);
          }
          // Match real14.368: an acknowledged update leaves the historical Set entry.
          if (cached.get(u._id)) cached.get(u._id).invalid = false;
          Object.assign(item._stats, { coreVersion: '14.368', systemId: 'dnd5e', systemVersion: '6.0.2' });
        }
        data._stats.modifiedTime = 2;
        data._stats.coreVersion = '14.368';
        if (options.playerHookChange) data.system.hp--;
        return updates;
      } };
    game.actors.set(actor.id, actor);
    for (const i of a.items) {
      const item = { _id: i.itemId, type: 'class', name: 'Synthetic parent', system: { advancement: {} }, _stats: { modifiedTime: 1 } };
      for (const m of i.mappings) {
        const source = { _id: m.from.split('.').at(-1), name: m.sourceName, type: 'feat', system: { identifier: '', uses: { spent: 2, max: '3' }, activities: { act: { _id: 'act', activation: { type: 'action' } } } }, effects: [{ _id: 'retained-effect', changes: [{ key: 'synthetic', value: '1' }] }], flags: { dnd5e: { advancementOrigin: 'old-parent.grant', sourceId: 'old-owned-item', keep: true }, importer: { hash: 'preserve' } } };
        data.items.push(source); m.referencedHash = await hash(source);
        item.system.advancement[m.advancementId] ??= { type: 'ItemGrant', level: 2, configuration: { items: [] }, value: { added: { retained: 'origin' } } };
        item.system.advancement[m.advancementId].configuration.items[m.index] = { uuid: m.from, optional: false };
      }
      data.items.push(item); i.beforeHash = await hash(item);
    }
    a.beforeHash = await hash(data);
  }
  for (const row of approval.protected) {
    const data = { _id: row.actorId, items: [], system: { hp: 9 } };
    row.beforeHash = await hash(data);
    game.actors.set(row.actorId, { id: row.actorId, data });
  }
  class Item {
    constructor(data) { this.data = structuredClone(data); this.id = data._id; this.documentName = 'Item'; this.isEmbedded = false; }
    validate() { return true; }
    toObject() { return structuredClone(this.data); }
    static async createDocuments(rows) {
      const limit = options.partialSources ? 3 : rows.length;
      const results = [];
      for (const row of rows.slice(0, limit)) {
        const doc = new Item(row); doc.data._stats = { createdTime: 5, modifiedTime: 5 };
        if (options.autoCreatorOwnership) doc.data.ownership.FccwB5HfAhy1F49a = 3;
        if (options.sourceHookChange) doc.data.system.uses.spent++;
        game.items.set(doc.id, doc); writes.source++; results.push(doc);
      }
      return results;
    }
  }
  const CONFIG = { Item: { documentClass: Item }, Folder: { documentClass: { create: async data => { writes.folder++; game.folders.set(data._id, { ...data, id: data._id }); } } } };
  let receipt;
  const macro = () => ({ getFlag: () => structuredClone(receipt), setFlag: async (_, key, value) => {
    receipt = structuredClone(value);
    if (options.editBeforePlayer && value.phase.startsWith('UPDATE_ACTOR:')) game.actors.get(approval.actors[0].actorId).data.system.hp = 22;
  } });
  const context = { game, CONFIG, fromUuid: async uuid => game.items.get(uuid.slice(5)), hash, digest, rawActor, rawItem, reference, target: () => {}, macro, NAME: approval.batch, BUILD: 'synthetic-approved-build', FLAG: 'receipt' };
  return { workflow: createLibraryWorkflow(context, approval), context, approval, game, writes, getReceipt: () => receipt };
}

test('template preserves mechanical content and input; detaches only grant linkage and sets new-source metadata', () => {
  const m = APPROVAL.actors[0].items[0].mappings[0];
  const source = { _id: m.from.split('.').at(-1), type: 'feat', system: { identifier: '', uses: { spent: 2 } }, effects: [{ _id: 'keep' }], flags: { dnd5e: { advancementOrigin: 'parent.grant', keep: 7 }, importer: { hash: 'x' } } };
  const before = structuredClone(source);
  const template = sourceTemplate(source, m, APPROVAL.folderId, APPROVAL.batch);
  expect(source).toEqual(before);
  expect(template.system.uses).toEqual(before.system.uses);
  expect(template.effects).toEqual(before.effects);
  expect(template.flags.dnd5e).toEqual({ keep: 7 });
  expect(template.flags.importer).toEqual(before.flags.importer);
  expect(template.system.identifier).toBe(`legacy-grant-${m.to.slice(5)}`);
  expect(() => sourceTemplate(source, { ...m, authorization: '' }, APPROVAL.folderId, APPROVAL.batch)).toThrow('Unapproved');
});
test('new-source proof cannot be used without approval or for another Actor', () => {
  const m = APPROVAL.actors[0].items[0].mappings[0];
  const source = { _id: APPROVAL.actors[0].items[0].itemId, system: {} };
  expect(() => projectRepair(APPROVAL.actors[0].actorId, source, [{ ...m, authorization: '' }])).toThrow('Missing reviewed');
  expect(() => projectRepair(APPROVAL.actors[0].actorId, source, [{ ...m, from: 'Actor.someoneElse.Item.source' }])).toThrow('Missing reviewed');
});
test('no preview means no writes, even in an approved build', async () => {
  const f = await fixture();
  await expect(f.workflow.apply()).rejects.toThrow('preview');
  expect(f.writes).toEqual({ source: 0, folder: 0, player: 0 });
});
test('full batch preserves players, supports reload verification and cannot duplicate sources on repeat', async () => {
  const f = await fixture();
  const preview = await f.workflow.preview();
  expect(preview.sourceItems).toHaveLength(27);
  expect(f.writes.player).toBe(0);
  const result = await f.workflow.apply();
  expect(result.status).toBe('PASS');
  expect(result.actors.flatMap(a => a.itemIds)).toHaveLength(6);
  expect(f.writes).toEqual({ source: 27, folder: 1, player: 4 });
  const reloaded = createLibraryWorkflow(f.context, f.approval);
  expect((await reloaded.verify()).status).toBe('PASS');
  expect((await reloaded.apply()).status).toBe('PASS');
  expect(f.writes).toEqual({ source: 27, folder: 1, player: 4 });
  f.game.items.get(f.approval.actors[0].items[0].mappings[0].to.slice(5)).data.system.uses.spent++;
  expect((await reloaded.verify()).status).toBe('FAIL');
});
test('partial source creation and unexpected source Hook changes halt before any player mutation', async () => {
  for (const options of [{ partialSources: true }, { sourceHookChange: true }]) {
    const f = await fixture(options); await f.workflow.preview();
    expect((await f.workflow.apply()).mode).toBe('FAILED_STOPPED');
    expect(f.writes.player).toBe(0);
    await expect(f.workflow.apply()).rejects.toThrow('no retry');
    expect(f.getReceipt().halted).toBe(true);
  }
});
test('unexpected player Hook changes halt the remaining Actors with actual failure recorded', async () => {
  const f = await fixture({ playerHookChange: true }); await f.workflow.preview();
  const result = await f.workflow.apply();
  expect(result.status).toBe('FAIL'); expect(f.writes.player).toBe(1);
  expect(result.failure.error).toBe('Unexpected source change');
});
test('concurrent player edits between preview and actor write are never overwritten', async () => {
  const f = await fixture({ editBeforePlayer: true }); await f.workflow.preview();
  expect((await f.workflow.apply()).mode).toBe('FAILED_STOPPED');
  expect(f.writes.player).toBe(0);
  expect(f.game.actors.get(f.approval.actors[0].actorId).data.system.hp).toBe(22);
});
test('missing feature, stale approval, or source ID collision fail before writes', async () => {
  for (const kind of ['missing', 'stale', 'collision']) {
    const f = await fixture();
    const a = f.approval.actors[0], m = a.items[0].mappings[0];
    if (kind === 'missing') f.game.actors.get(a.actorId).data.items.shift();
    if (kind === 'stale') a.items[0].mappings[0].referencedHash = '0'.repeat(64);
    if (kind === 'collision') f.game.items.set(m.to.slice(5), { id: m.to.slice(5) });
    await expect(f.workflow.preview()).rejects.toThrow();
    expect(f.writes).toEqual({ source: 0, folder: 0, player: 0 });
  }
});

test('unrelated changes before preview are preserved while original target and source approvals remain pinned', async () => {
  const f = await fixture();
  const actor = f.game.actors.get(f.approval.actors[0].actorId);
  actor.data.system.hp = 12;
  actor.data.ownership.extraPlayer = 3;
  const protectedActor = f.game.actors.get(f.approval.protected[0].actorId);
  protectedActor.data.system.hp = 8;
  const preview = await f.workflow.preview();
  expect(preview.actors[0].historicalMatch).toBe(false);
  expect(preview.actors[0].approvedTargetAndSourceHashesMatch).toBe(true);
  expect(preview.protectedActors[0].historicalMatch).toBe(false);
  expect((await f.workflow.apply()).status).toBe('PASS');
  expect(actor.data.system.hp).toBe(12);
  expect(actor.data.ownership.extraPlayer).toBe(3);
  expect(protectedActor.data.system.hp).toBe(8);
});
test('target/source drift reports exact IDs and hashes and never silently refreshes approval', async () => {
  for (const kind of ['target', 'source']) {
    const f = await fixture();
    const a = f.approval.actors[0], m = a.items[0].mappings[0];
    const id = kind === 'target' ? a.items[0].itemId : m.from.split('.').at(-1);
    f.game.actors.get(a.actorId).data.items.find(i => i._id === id).name = 'Changed after approval';
    try { await f.workflow.preview(); throw new Error('should fail'); }
    catch (error) {
      expect(error.context.kind).toBe(kind === 'target' ? 'APPROVED_TARGET_ITEM_CHANGED' : 'APPROVED_SOURCE_FEATURE_CHANGED');
      expect(error.context.actualHash).not.toBe(error.context.expectedHash);
      if (kind === 'target') expect(error.context.itemId).toBe(id);
      else expect(error.context.uuid).toBe(m.from);
    }
    expect(f.writes).toEqual({ source: 0, folder: 0, player: 0 });
  }
});
test('Actor or protected-Actor change after preview invalidates that preview without writes', async () => {
  for (const actorId of [APPROVAL.actors[0].actorId, APPROVAL.protected[0].actorId]) {
    const f = await fixture(); await f.workflow.preview();
    f.game.actors.get(actorId).data.system.hp--;
    await expect(f.workflow.apply()).rejects.toThrow('fresh read-only preview');
    expect(f.writes).toEqual({ source: 0, folder: 0, player: 0 });
  }
});

async function reviewedRecovery() {
  const f = await fixture({ autoCreatorOwnership: true });
  await f.workflow.preview();
  expect((await f.workflow.apply()).phase).toBe('CREATE_SOURCES');
  expect(f.writes.player).toBe(0);
  const prior = f.getReceipt();
  f.approval.recovery = { build: prior.build, creatorUserId: 'FccwB5HfAhy1F49a',
    actorBeforeHashes: Object.fromEntries(prior.actors.map(a => [a.actorId, a.beforeHash])),
    sources: Object.fromEntries(await Promise.all(prior.sources.map(async s => [s.to, { previousExpectedHash: s.expectedHash,
      actualHash: await digest(libraryIdentity(f.game.items.get(s.to.slice(5)).toObject())) }])) ) };
  f.context.BUILD = 'synthetic-reviewed-recovery';
  f.workflow = createLibraryWorkflow(f.context, f.approval);
  return f;
}
test('reviewed creator-ownership recovery reuses all 27 sources, repairs players, and never creates duplicates', async () => {
  const f = await reviewedRecovery();
  expect((await f.workflow.preview()).sourceAction).toBe('REUSE_27_REVIEWED_EXISTING_SOURCES_NO_CREATION');
  const result = await f.workflow.apply();
  expect(result.status).toBe('PASS');
  expect(result.recoveryFrom.sourceWrites).toBe(0);
  expect(f.writes).toEqual({ folder: 1, source: 27, player: 4 });
  expect((await f.workflow.apply()).status).toBe('PASS');
  expect(f.writes).toEqual({ folder: 1, source: 27, player: 4 });
});
test('recovery refuses a changed source, player, missing source, or mismatched receipt before any further write', async () => {
  for (const kind of ['source', 'player', 'missing', 'receipt']) {
    const f = await reviewedRecovery();
    const actorId = f.approval.actors[0].actorId, id = f.approval.actors[0].items[0].mappings[0].to.slice(5);
    if (kind === 'source') f.game.items.get(id).data.system.uses.spent++;
    if (kind === 'player') f.game.actors.get(actorId).data.system.hp--;
    if (kind === 'missing') f.game.items.delete(id);
    if (kind === 'receipt') f.getReceipt().phase = 'UPDATE_ACTOR:unknown';
    await expect(f.workflow.preview()).rejects.toThrow();
    expect(f.writes).toEqual({ folder: 1, source: 27, player: 0 });
  }
});
test('persisted first Actor after a response failure is validated and never written twice', async () => {
  const f = await reviewedRecovery();
  const preview = await f.workflow.preview();
  const first = preview.actors[0], prior = f.getReceipt();
  await f.game.actors.get(first.actorId).updateEmbeddedDocuments('Item', first.changes);
  for (const update of first.changes) f.game.actors.get(first.actorId).items.invalidDocumentIds.delete(update._id); // fresh-login reconstruction
  prior.phase = `UPDATE_ACTOR:${first.actorId}`;
  prior.failure.phase = prior.phase;
  f.approval.recovery.phase = prior.phase;
  f.approval.recovery.completedActorHashes = { [first.actorId]: prior.actors[0].expectedHash };
  f.context.BUILD = 'synthetic-after-response-error';
  f.workflow = createLibraryWorkflow(f.context, f.approval);
  const resumed = await f.workflow.preview();
  expect(resumed.actors[0].action).toBe('VERIFY_PERSISTED_RESULT_NO_WRITE');
  expect(resumed.actors[0].changes).toEqual([]);
  expect((await f.workflow.apply()).status).toBe('PASS');
  expect(f.writes).toEqual({ folder: 1, source: 27, player: 4 });
});
