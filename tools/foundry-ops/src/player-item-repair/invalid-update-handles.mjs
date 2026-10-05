import { assertUnchanged } from './core.mjs';

// Foundry14.368 pre-update uses get({invalid:true}), but its response handler
// uses ordinary get() before dereferencing _source. Retain the same unmodified
// temporary invalid Document in the public collection cache across that call.
// EmbeddedCollection.set/delete with modifySource:false never edit source data.
export async function withInvalidItemHandles(actor, itemIds, rawActor, rawItem, update) {
  const collection = actor.items;
  const before = rawActor(actor);
  const staged = [];
  try {
    for (const id of itemIds) {
      if (collection.has(id)) throw new Error('Expected invalid Item is already cached; re-review');
      if (!collection.invalidDocumentIds.has(id)) throw new Error('Item no longer listed invalid');
      const document = collection.getInvalid(id);
      if (!document || document.id !== id || document.parent !== actor) throw new Error('Invalid Item handle identity mismatch');
      assertUnchanged(document.toObject(true), rawItem(actor, id));
      collection.set(id, document, { modifySource: false });
      staged.push({ id, document });
      assertUnchanged(rawActor(actor), before);
    }
    return await update();
  } finally {
    // Never remove source or conceal an acknowledged valid update. A rejected
    // request may still have persisted server-side: caller must stop and reload.
    for (const { id, document } of staged) {
      if (collection.get(id) === document && document.invalid) collection.delete(id, { modifySource: false });
    }
  }
}

// 14.368 EmbeddedCollection.initialize/_set do not clear a formerly-invalid ID.
// Reconcile that bookkeeping only after normal API acknowledgement, independent
// strict schema validation, and equality with the approved full expected Item.
export function reconcileValidatedItemMarker(actor, itemId, expected, ItemClass) {
  const document = actor.items.get(itemId);
  if (!document || document.id !== itemId || document.parent !== actor) throw new Error('Updated Item missing from collection');
  const checked = new ItemClass(structuredClone(document.toObject(true)), { parent: actor, strict: true });
  if (checked.invalid || !checked.validate({ strict: true })) throw new Error('Updated Item failed independent strict validation');
  assertUnchanged(checked.toObject(true), expected);
  if (!document.validate({ strict: true }) || document.invalid) throw new Error('Updated cached Item is still invalid');
  assertUnchanged(document.toObject(true), expected);
  const staleMarkerCleared = actor.items.invalidDocumentIds.has(itemId);
  if (staleMarkerCleared) actor.items.invalidDocumentIds.delete(itemId);
  return { itemId, strictValidation: 'PASS', expectedContent: 'PASS', staleMarkerCleared, sourceWrites: 0 };
}
