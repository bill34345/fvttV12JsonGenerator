import { TARGETS, stable, projectRepair, sourceTemplate, libraryIdentity, assertFresh, assertUnchanged } from './core.mjs';
import { withInvalidItemHandles, reconcileValidatedItemMarker } from './invalid-update-handles.mjs';

export function createLibraryWorkflow(c, approval) {
  const { game, CONFIG, fromUuid, hash, digest, rawActor, rawItem, reference, target, macro, NAME, BUILD, FLAG } = c;
  const clone = structuredClone;
  let previewFingerprint;
  const ids = collection => Array.from(collection, doc => doc.id).sort();
  const fingerprint = source => digest(libraryIdentity(source));
  const mappings = approval.actors.flatMap(a => a.items.flatMap(i => i.mappings));
  const comparisonException = { itemId: 'Oqs0HDVs0QOmvzb9', effectId: 'SIoBMgJ64YgbJ1eS',
    field: 'system.changes.0._id', reason: 'Absent in stored effect; dnd5e regenerates on hydration; v7 two-session evidence shows this is the only changed leaf' };
  const transientIds = data => data.items.filter(i => i._id === comparisonException.itemId).flatMap(i =>
    (i.effects ?? []).filter(e => e._id === comparisonException.effectId).map(e => ({ itemId: i._id, effectId: e._id, generatedChangeId: e.system?.changes?.[0]?._id })));
  function checkFresh(actualHash, expectedHash, context) {
    try { assertFresh(actualHash, expectedHash); }
    catch (error) { error.context = { ...context, expectedHash, actualHash }; throw error; }
  }
  function scope() {
    target();
    if (approval.batch !== NAME || approval.authorization !== 'USER_APPROVED_SOURCE_LIBRARY_20260929'
        || approval.actors.length !== 4 || mappings.length !== 27
        || new Set(mappings.map(m => m.to)).size !== 27
        || approval.actors.some(a => a.actorId === 'MkOcySfY7k3A1AAl')) throw new Error('应用已锁定：来源库授权范围不符');
  }
  async function protectedRows(baseline) {
    return Promise.all(approval.protected.map(async p => {
      const actualHash = await hash(rawActor(game.actors.get(p.actorId)));
      if (baseline) checkFresh(actualHash, baseline.find(row => row.actorId === p.actorId)?.beforeHash, { kind: 'PROTECTED_ACTOR_CHANGED_DURING_BATCH', actorId: p.actorId });
      return { actorId: p.actorId, beforeHash: actualHash, historicalHash: p.beforeHash, historicalMatch: actualHash === p.beforeHash, status: baseline ? 'UNCHANGED' : 'BASELINE_CAPTURED' };
    }));
  }
  async function prepare() {
    scope();
    const recovery = approval.recovery;
    const prior = recovery ? macro().getFlag('world', FLAG) : null;
    if (recovery) {
      const expectedPhase = recovery.phase ?? 'CREATE_SOURCES';
      if (!prior || prior.batch !== NAME || prior.build !== recovery.build || !prior.halted || prior.phase !== expectedPhase
          || prior.failure?.phase !== expectedPhase || prior.actors?.length !== 4 || prior.sources?.length !== 27
          || prior.actors.some(a => a.status !== (recovery.actorReceiptStatuses?.[a.actorId] ?? 'PENDING'))
          || stable(prior.sources.map(s => s.to).sort()) !== stable(mappings.map(m => m.to).sort())) throw new Error('Reviewed recovery receipt does not match; no retry');
      for (const a of prior.actors) {
        checkFresh(a.beforeHash, recovery.actorBeforeHashes[a.actorId], { kind: 'RECOVERY_RECEIPT_ACTOR_MISMATCH', actorId: a.actorId });
        const acknowledgedHash = recovery.completedActorHashes?.[a.actorId];
        if (acknowledgedHash) checkFresh(a.expectedHash, acknowledgedHash, { kind: 'RECOVERY_EXPECTED_RESULT_MISMATCH', actorId: a.actorId });
        checkFresh(await hash(rawActor(game.actors.get(a.actorId))), acknowledgedHash ?? a.beforeHash,
          { kind: acknowledgedHash ? 'PERSISTED_ACTOR_RESULT_MISMATCH' : 'RECOVERY_ACTOR_ALREADY_CHANGED', actorId: a.actorId });
      }
      for (const s of prior.sources) checkFresh(s.expectedHash, recovery.sources[s.to]?.previousExpectedHash, { kind: 'RECOVERY_RECEIPT_SOURCE_MISMATCH', uuid: s.to });
      await protectedRows(prior.protectedActors);
      if (stable(ids(game.items)) !== stable([...prior.worldItemIds, ...mappings.map(m => m.to.slice(5))].sort())
          || stable(ids(game.folders)) !== stable([...prior.folderIds, approval.folderId].sort())
          || stable(ids(game.actors)) !== stable(prior.actorIds)) throw new Error('Recovery inventory changed');
      const folder = game.folders.get(approval.folderId);
      if (folder?.type !== 'Item' || folder.name !== approval.folderName || folder.flags?.world?.nextItemRepairBatch !== NAME) throw new Error('Recovery folder identity mismatch');
    }
    const protectedActors = await protectedRows();
    if (!recovery && game.folders.has(approval.folderId)) throw new Error('Source folder ID already exists; no recreation');
    const sources = [];
    const actors = [];
    for (const a of approval.actors) {
      const allow = TARGETS.find(t => t.actorId === a.actorId);
      if (!allow || stable(a.items.map(i => i.itemId).sort()) !== stable([...allow.itemIds].sort())) throw new Error('Incomplete Actor batch');
      const actor = game.actors.get(a.actorId);
      const completed = !!recovery?.completedActorHashes?.[a.actorId];
      const before = rawActor(actor);
      // Approval pins target Items and source features. Other Actor data may have
      // legitimately changed since inspection; preserve the fresh preview state.
      const beforeHash = await hash(before);
      const expected = clone(before);
      const updates = [];
      for (const item of a.items) {
        const original = rawItem(actor, item.itemId);
        if (completed) {
          if (!actor.items.has(item.itemId) || actor.items.invalidDocumentIds.has(item.itemId)) throw new Error('Persisted repaired Item is not valid after reload');
        } else {
          checkFresh(await hash(original), item.beforeHash, { kind: 'APPROVED_TARGET_ITEM_CHANGED', actorId: a.actorId, itemId: item.itemId });
          if (!actor.items.invalidDocumentIds.has(item.itemId)) throw new Error('Target is no longer invalid; re-review required');
        }
        for (const m of item.mappings) {
          if (!recovery && game.items.has(m.to.slice(5))) throw new Error('New source ID collision; refused');
          const origin = await reference(m.from);
          checkFresh(await hash(origin), m.referencedHash, { kind: 'APPROVED_SOURCE_FEATURE_CHANGED', uuid: m.from });
          const template = sourceTemplate(origin, m, approval.folderId, NAME, recovery?.creatorUserId ?? game.user?.id);
          const doc = new CONFIG.Item.documentClass(clone(template), { strict: true });
          if (doc.invalid || !doc.validate({ strict: true })) throw new Error(`Invalid source template: ${m.sourceName}`);
          const data = doc.toObject(true);
          if (stable(libraryIdentity(data)) !== stable(libraryIdentity(template))) throw new Error(`Unexpected source normalization: ${m.sourceName}`);
          const expectedHash = await fingerprint(data);
          if (recovery) {
            const existing = await fromUuid(m.to);
            if (!existing || existing.documentName !== 'Item' || existing.isEmbedded) throw new Error('Reviewed source missing');
            checkFresh(expectedHash, recovery.sources[m.to]?.actualHash, { kind: 'RECOVERY_TEMPLATE_MISMATCH', uuid: m.to });
            checkFresh(await fingerprint(existing.toObject(true)), expectedHash, { kind: 'RECOVERY_SOURCE_CHANGED', uuid: m.to });
          }
          sources.push({ mapping: m, data, expectedHash, identifierBefore: origin.system.identifier, identifierAfter: data.system.identifier });
        }
        if (completed) continue;
        const { candidate, changes } = projectRepair(a.actorId, original, item.mappings);
        const validated = new CONFIG.Item.documentClass(clone(candidate), { parent: actor, strict: true });
        if (validated.invalid || !validated.validate({ strict: true })) throw new Error(`Invalid repaired Item: ${item.name}`);
        assertUnchanged(validated.toObject(true), candidate);
        // ServerDocument.updateStats sets these on a system-data update (14.368).
        // Project the expected server metadata; do not submit it as an Item patch.
        candidate._stats ??= {};
        Object.assign(candidate._stats, { coreVersion: '14.368', systemId: 'dnd5e', systemVersion: '6.0.2' });
        expected.items[expected.items.findIndex(i => i._id === candidate._id)] = candidate;
        updates.push(changes);
      }
      expected._stats ??= {};
      expected._stats.coreVersion = '14.368';
      actors.push({ actor, approval: a, completed, before, beforeHash, expected, updates, expectedHash: await hash(expected) });
    }
    return { sources, actors, protectedActors, prior };
  }
  function previewReport(p) {
    return { build: BUILD, mode: 'PREVIEW_NO_WRITES', authorization: approval.authorization,
      comparisonException,
      sourceAction: p.prior ? 'REUSE_27_REVIEWED_EXISTING_SOURCES_NO_CREATION' : 'CREATE_27_SOURCES',
      folder: { id: approval.folderId, name: approval.folderName },
      sourceItems: p.sources.map(s => ({ from: s.mapping.from, to: s.mapping.to, name: s.data.name,
        originalHash: s.mapping.referencedHash, expectedHash: s.expectedHash, identifierBefore: s.identifierBefore,
        identifierAfter: s.identifierAfter, ownership: s.data.ownership, changes: p.prior ? ['No source changes; reuse reviewed complete source including creator GM ownership'] : ['new ID, folder, sort=0, GM-only ownership plus creator owner=3, creation metadata', 'remove Actor grant linkage flags; retain all other flags', 'add explicit origin UUID/hash marker', ...(s.identifierBefore ? [] : ['set valid identifier on NEW source only'])] })),
      protectedActors: p.protectedActors,
      actors: p.actors.map(a => ({ actorId: a.actor.id, beforeHash: a.beforeHash, historicalHash: a.approval.beforeHash,
        action: a.completed ? 'VERIFY_PERSISTED_RESULT_NO_WRITE' : 'UPDATE_REFERENCES',
        historicalMatch: a.beforeHash === a.approval.beforeHash, approvedTargetAndSourceHashesMatch: true,
        expectedHash: a.expectedHash, itemCount: a.before.items.length, changes: a.updates })) };
  }
  async function preview() {
    const report = previewReport(await prepare());
    previewFingerprint = await digest(report);
    return report;
  }
  async function verify() {
    scope();
    const r = macro().getFlag('world', FLAG);
    if (!r || r.build !== BUILD) throw new Error('No matching applied receipt');
    const actors = [];
    for (const a of r.actors) {
      const actor = game.actors.get(a.actorId);
      const actual = rawActor(actor);
      const actualHash = await hash(actual);
      actors.push({ ...a, actualHash, itemCount: actual.items.length,
        transientIdsAfter: transientIds(actual),
        statsAfter: actual._stats, itemStatsAfter: a.itemIds.map(id => ({ id, stats: rawItem(actor, id)._stats })),
        status: actualHash === a.expectedHash && a.itemIds.every(id => actor.items.has(id) && !actor.items.invalidDocumentIds.has(id)) ? 'PASS' : 'FAIL' });
    }
    const sources = [];
    for (const s of r.sources) {
      const doc = await fromUuid(s.to);
      const actualHash = doc ? await fingerprint(doc.toObject(true)) : null;
      sources.push({ ...s, actualHash, status: doc?.documentName === 'Item' && !doc.isEmbedded && actualHash === s.expectedHash ? 'PASS' : 'FAIL' });
    }
    let protectedActors;
    try { protectedActors = await protectedRows(r.protectedActors); } catch (error) { protectedActors = [{ status: 'FAIL', error: String(error.message), context: error.context }]; }
    const inventory = stable(ids(game.items)) === stable([...r.worldItemIds, ...r.sources.map(s => s.to.slice(5))].sort())
      && stable(ids(game.folders)) === stable([...r.folderIds, approval.folderId].sort())
      && stable(ids(game.actors)) === stable(r.actorIds);
    const folder = game.folders.get(approval.folderId);
    const folderValid = folder?.type === 'Item' && folder.name === approval.folderName;
    const pass = !r.halted && r.phase === 'COMPLETE' && inventory && folderValid
      && [...actors, ...sources].every(row => row.status === 'PASS') && protectedActors.every(row => row.status === 'UNCHANGED');
    return { build: BUILD, mode: 'VERIFY', status: pass ? 'PASS' : 'FAIL', halted: r.halted, phase: r.phase, failure: r.failure,
      recoveryFrom: r.recoveryFrom,
      comparisonException,
      inventory: inventory ? 'PASS' : 'FAIL', folder: folderValid ? 'PASS' : 'FAIL', actors, sources, protectedActors };
  }
  async function apply() {
    scope();
    const owned = macro();
    const previous = owned.getFlag('world', FLAG);
    if (previous) {
      if (previous.build === BUILD && previous.phase === 'COMPLETE' && !previous.halted) return verify();
      if (!approval.recovery) throw new Error('Prior write receipt exists; no retry/recreation before review');
    }
    const p = await prepare();
    if (!previewFingerprint || previewFingerprint !== await digest(previewReport(p))) throw new Error('Run fresh read-only preview before Apply');
    const r = { batch: NAME, build: BUILD, phase: p.prior ? 'REUSE_VERIFIED_SOURCES' : 'CREATE_FOLDER', halted: false,
      recoveryFrom: p.prior ? { build: p.prior.build, phase: p.prior.phase, receiptHash: await digest(p.prior), sourceWrites: 0 } : null,
      worldItemIds: p.prior?.worldItemIds ?? ids(game.items), folderIds: p.prior?.folderIds ?? ids(game.folders), actorIds: ids(game.actors),
      protectedActors: p.protectedActors,
      sources: p.sources.map(s => ({ from: s.mapping.from, to: s.mapping.to, name: s.data.name, originalHash: s.mapping.referencedHash, expectedHash: s.expectedHash })),
      actors: p.actors.map(a => ({ actorId: a.actor.id, itemIds: a.approval.items.map(i => i.itemId), beforeHash: a.beforeHash,
        historicalHash: a.approval.beforeHash, historicalMatch: a.beforeHash === a.approval.beforeHash,
        expectedHash: a.expectedHash, itemCount: a.before.items.length, statsBefore: a.before._stats,
        transientIdsBefore: transientIds(a.before),
        originalReceiptBeforeHash: p.prior?.actors.find(row => row.actorId === a.actor.id)?.beforeHash,
        itemStatsBefore: a.approval.items.map(i => ({ id: i.itemId, stats: a.before.items.find(x => x._id === i.itemId)._stats })),
        status: a.completed ? 'PERSISTED_RESULT_VERIFIED_AFTER_RELOAD' : 'PENDING' })) };
    const save = () => owned.setFlag('world', FLAG, clone(r));
    await save();
    try {
      if (!p.prior) {
      await CONFIG.Folder.documentClass.create({ _id: approval.folderId, name: approval.folderName, type: 'Item', sorting: 'a', flags: { world: { nextItemRepairBatch: NAME } } }, { keepId: true });
      const folder = game.folders.get(approval.folderId);
      if (!folder || folder.type !== 'Item' || folder.name !== approval.folderName) throw new Error('Folder creation failed');
      r.phase = 'CREATE_SOURCES'; await save();
      const created = await CONFIG.Item.documentClass.createDocuments(p.sources.map(s => clone(s.data)), { keepId: true, keepEmbeddedIds: true });
      if (created.length !== p.sources.length) throw new Error('Partial source creation; no player write');
      }
      for (const s of p.sources) {
        const doc = await fromUuid(s.mapping.to);
        if (!doc || doc.isEmbedded || doc.documentName !== 'Item') throw new Error('Created source is not resolvable');
        checkFresh(await fingerprint(doc.toObject(true)), s.expectedHash, { kind: 'SOURCE_AFTER_CREATE_OR_REUSE_CHANGED', uuid: s.mapping.to });
      }
      // All new sources must pass before any player mutation.
      for (const a of p.actors) {
        if (a.completed) continue;
        r.phase = `UPDATE_ACTOR:${a.actor.id}`; await save();
        await protectedRows(r.protectedActors);
        checkFresh(await hash(rawActor(a.actor)), a.beforeHash, { kind: 'ACTOR_CHANGED_AFTER_PREVIEW', actorId: a.actor.id });
        for (const item of a.approval.items) for (const m of item.mappings) {
          checkFresh(await hash(await reference(m.from)), m.referencedHash, { kind: 'APPROVED_SOURCE_FEATURE_CHANGED', uuid: m.from });
          const doc = await fromUuid(m.to);
          if (!doc || doc.isEmbedded || doc.documentName !== 'Item') throw new Error('Source disappeared');
          assertFresh(await fingerprint(doc.toObject(true)), p.sources.find(s => s.mapping.to === m.to).expectedHash);
        }
        const changed = await withInvalidItemHandles(a.actor, a.approval.items.map(i => i.itemId), rawActor, rawItem,
          () => a.actor.updateEmbeddedDocuments('Item', a.updates));
        if (changed.length !== a.updates.length) throw new Error('Partial player Item update');
        assertUnchanged(rawActor(a.actor), a.expected);
        const markerChecks = a.approval.items.map(i => reconcileValidatedItemMarker(a.actor, i.itemId,
          a.expected.items.find(doc => doc._id === i.itemId), CONFIG.Item.documentClass));
        assertUnchanged(rawActor(a.actor), a.expected);
        Object.assign(r.actors.find(row => row.actorId === a.actor.id), { status: 'APPLIED_VERIFIED', markerChecks });
        await save();
      }
      await protectedRows(r.protectedActors);
      r.phase = 'COMPLETE'; await save();
      return { ...await verify(), mode: 'APPLIED_NEEDS_RELOGIN_UI' };
    } catch (error) {
      r.halted = true; r.failure = { phase: r.phase, error: String(error.message), context: error.context,
        stack: String(error.stack ?? '').split('\n').slice(0, 10), persistence: 'UNKNOWN_UNTIL_FRESH_RELOAD_IF_UPDATE_WAS_DISPATCHED',
        actualSourceIds: ids(game.items).filter(id => !r.worldItemIds.includes(id)) };
      await save();
      return { ...await verify(), mode: 'FAILED_STOPPED' };
    }
  }
  return { preview, apply, verify };
}
