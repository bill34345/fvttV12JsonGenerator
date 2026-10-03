import { test, expect } from 'bun:test';
import { withInvalidItemHandles, reconcileValidatedItemMarker } from './invalid-update-handles.mjs';

function setup() {
  const source = { items: [{ _id: 'target', type: 'class', system: { grant: 'invalid-reference' } }] };
  const cache = new Map(), invalidDocumentIds = new Set(['target']);
  const actor = { items: { invalidDocumentIds, has: id => cache.has(id), get: id => cache.get(id),
    getInvalid: id => ({ id, parent: actor, invalid: true, _source: structuredClone(source.items[0]), toObject() { return structuredClone(this._source); } }),
    set(id, doc, options) { expect(options.modifySource).toBe(false); cache.set(id, doc); },
    delete(id, options) { expect(options.modifySource).toBe(false); cache.delete(id); } } };
  return { source, actor, cache, rawActor: () => structuredClone(source), rawItem: () => structuredClone(source.items[0]) };
}
test('temporary invalid handle fixes the response lookup while original source and normal update callbacks are preserved', async () => {
  const f = setup(); const initial = structuredClone(f.source); const events = [];
  await withInvalidItemHandles(f.actor, ['target'], f.rawActor, f.rawItem, async () => {
    expect(f.source).toEqual(initial);
    const pre = f.actor.items.get('target');
    expect(pre._source.system.grant).toBe('invalid-reference'); events.push('normal-preUpdate');
    const response = { system: { grant: 'Item.repaired' } };
    const doc = f.actor.items.get('target');
    expect(doc).toBe(pre); doc._source.system.grant = response.system.grant; doc.invalid = false;
    f.source.items[0] = structuredClone(doc._source); events.push('normal-updateHook');
  });
  expect(events).toEqual(['normal-preUpdate', 'normal-updateHook']);
  expect(f.source.items[0].system.grant).toBe('Item.repaired');
  expect(f.cache.has('target')).toBe(true);
});
test('rejection removes only the temporary cache handle and never deletes or restores source data', async () => {
  const f = setup();
  await expect(withInvalidItemHandles(f.actor, ['target'], f.rawActor, f.rawItem, async () => {
    f.source.items[0].system.grant = 'server-acknowledged-but-client-failed';
    throw new Error('response failed');
  })).rejects.toThrow('response failed');
  expect(f.cache.has('target')).toBe(false);
  expect(f.source.items).toHaveLength(1);
  expect(f.source.items[0].system.grant).toBe('server-acknowledged-but-client-failed');
});
test('wrong temporary parent and changed handle data fail before dispatch', async () => {
  const f = setup(); let dispatched = false;
  f.actor.items.getInvalid = () => ({ id: 'target', parent: {}, toObject: f.rawItem });
  await expect(withInvalidItemHandles(f.actor, ['target'], f.rawActor, f.rawItem, async () => { dispatched = true; })).rejects.toThrow('identity');
  expect(dispatched).toBe(false); expect(f.cache.size).toBe(0);
});
test('only an acknowledged strictly-valid exact expected Item can leave the stale invalid-ID set', () => {
  const f = setup();
  const doc = f.actor.items.getInvalid('target');
  doc.invalid = false; doc.validate = () => true; f.cache.set('target', doc);
  class Item { constructor(data) { this.data = data; } validate() { return true; } toObject() { return this.data; } }
  const expected = structuredClone(doc._source);
  expect(reconcileValidatedItemMarker(f.actor, 'target', expected, Item).staleMarkerCleared).toBe(true);
  expect(f.actor.items.invalidDocumentIds.has('target')).toBe(false);
  f.actor.items.invalidDocumentIds.add('target');
  doc._source.system.grant = 'unexpected';
  expect(() => reconcileValidatedItemMarker(f.actor, 'target', expected, Item)).toThrow('Unexpected');
  expect(f.actor.items.invalidDocumentIds.has('target')).toBe(true);
  doc._source = structuredClone(expected); doc.invalid = true;
  expect(() => reconcileValidatedItemMarker(f.actor, 'target', expected, Item)).toThrow('still invalid');
  expect(f.actor.items.invalidDocumentIds.has('target')).toBe(true);
});
