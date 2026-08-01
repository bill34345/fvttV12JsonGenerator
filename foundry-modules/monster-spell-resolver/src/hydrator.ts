import {
  hashManifest,
  RESOLVER_MODULE_ID,
  validatePortableSpellManifestStructure,
  type PortableSpellManifest,
  type SpellHydrationSelection,
} from '../../../src/core/spell-resolution';
import {
  buildCastActivitySource,
  computeManagedSourceHash,
  generatedResolverDocumentId,
  type LiteralRestrictionReport,
  type ResolverManagedIdentity,
} from './cast-activity';
import {
  assertAdoptableNativeCache,
  assertLinkedFeatureOwnership,
  assertResolverDocumentOwnership,
  documentId,
  readCompendiumSource,
  resolverOwnershipFlags,
} from './ownership';
import {
  assertNativeCacheProjectionMatches,
  captureNativeCacheProjection,
  NativeCacheLifecycleCapture,
  nativeEffectChangesEqual,
  resolverDocumentHooks,
  type ResolverDocumentHookBus,
} from './native-cache-lifecycle';

const FOUNDRY_ID = /^[A-Za-z0-9]{16}$/;

export interface NativeCacheJournalEntry {
  id: string;
  identity: ResolverManagedIdentity;
  cachedFor: string;
  selectedUuid: string;
  nativeProjection: Record<string, any>;
  ownershipApplied: boolean;
}

export interface NativeCacheBinding {
  identity: ResolverManagedIdentity;
  cachedFor: string;
  selectedUuid: string;
  nativeProjection: Record<string, any>;
}

export interface HydrationJournal {
  actor: any;
  snapshotItemIds: Set<string>;
  nativeBindings: NativeCacheBinding[];
  nativeCaches: NativeCacheJournalEntry[];
  createdSpellIds: string[];
  touchedActivityIds: string[];
  lifecycleFailures: string[];
}

export interface HydrateManagedSelectionInput {
  actor: any;
  manifest: PortableSpellManifest;
  selection: SpellHydrationSelection;
  transactionId: string;
  journal: HydrationJournal;
  preserveExisting?: boolean;
  afterFeatureUpdate?: (phase: HydrationFeatureUpdatePhase) => void | Promise<void>;
  lifecycleHooks?: ResolverDocumentHookBus;
}

export interface HydrationFeatureUpdatePhase {
  feature: any;
  activity: any;
  cache?: any;
  identity: ResolverManagedIdentity;
}

export interface HydratedSelection {
  feature: any;
  activity: any;
  cache: any;
  identity: ResolverManagedIdentity;
  literalRestrictions: LiteralRestrictionReport[];
}

export function createHydrationJournal(actor: any): HydrationJournal {
  return {
    actor,
    snapshotItemIds: new Set(iterate(actor?.items).map(documentId).filter(Boolean)),
    nativeBindings: [],
    nativeCaches: [],
    createdSpellIds: [],
    touchedActivityIds: [],
    lifecycleFailures: [],
  };
}

export async function hydrateManagedSelection(input: HydrateManagedSelectionInput): Promise<HydratedSelection> {
  if (!input || input.journal?.actor !== input.actor) throw new TypeError('Hydration journal must belong to the current Actor.');
  if (!FOUNDRY_ID.test(input.transactionId)) throw new TypeError('transactionId must be a 16-character alphanumeric ID.');
  const validated = validatePortableSpellManifestStructure(input.manifest);
  if (!validated.ok) throw new TypeError('Hydration requires a structurally valid portable spell manifest.');
  const actorManifest = input.actor?.flags?.[RESOLVER_MODULE_ID]?.spellManifest;
  const actorValidation = validatePortableSpellManifestStructure(actorManifest);
  if (!actorValidation.ok || hashManifest(actorValidation.value) !== hashManifest(validated.value)) {
    throw new TypeError('Actor portable spell manifest does not exactly match the hydration manifest.');
  }

  const group = validated.value.spellcastingGroups.find((entry) => entry.groupId === input.selection.groupId);
  const ref = group?.spellRefs.find((entry) => entry.refId === input.selection.refId);
  if (!group || !ref) throw new TypeError('Hydration selection does not identify a manifest group/ref.');
  const features = iterate(input.actor.items).filter((item) => item?.flags?.[RESOLVER_MODULE_ID]?.featureItemKey === group.featureItemKey
    && item?.flags?.[RESOLVER_MODULE_ID]?.groupId === group.groupId);
  if (features.length !== 1) throw new TypeError('Manifest group must identify exactly one linked generated feature.');
  const feature = features[0]!;

  const built = buildCastActivitySource({
    manifestId: validated.value.manifestId,
    featureId: documentId(feature),
    group,
    ref,
    selectedUuid: input.selection.uuid,
  });
  if (built.identity.logicalRefKey !== input.selection.logicalRefKey) {
    throw new TypeError('Hydration selection logicalRefKey does not match the manifest identity.');
  }
  assertLinkedFeatureOwnership(input.actor, feature, built.identity);
  const existingActivity = getActivity(feature, built.activity._id);
  let existingIdentity: ResolverManagedIdentity | undefined;
  let existingCache: any;
  let keptCacheSnapshot: Record<string, any> | undefined;
  if (existingActivity) {
    existingIdentity = resolverIdentityFromFlags(existingActivity);
    assertResolverDocumentOwnership(input.actor, feature, existingActivity, existingIdentity, 'activity');
    assertSameManagedRef(existingIdentity, built.identity);
    const existingCaches = cachesForActivity(input.actor, existingActivity);
    existingCache = existingCaches[0];
    if (input.preserveExisting && existingCaches.length !== 1) {
      throw new Error('Keep requires exactly one strictly owned cached Spell for the existing Cast Activity.');
    }
    if (existingCaches.length > 1) throw new Error('Existing owned Activity has multiple cached Spells.');
    if (existingCaches[0]) {
      // This check is deliberately before the feature write because dnd5e's
      // onUpdateActivities may mutate the existing cache enchantment.
      assertResolverDocumentOwnership(
        input.actor, feature, existingCaches[0], existingIdentity, 'spell', existingActivity.relativeUUID,
      );
      if (input.preserveExisting) keptCacheSnapshot = documentSource(existingCaches[0]);
    }
  }
  if (input.preserveExisting && !existingActivity) {
    throw new Error('Keep requires an existing strictly owned Cast Activity.');
  }
  if (input.preserveExisting && existingIdentity?.selectedUuid !== built.identity.selectedUuid) {
    throw new Error('Keep cannot change the selected destination UUID; choose Overwrite for re-resolution.');
  }

  const activitySource = input.preserveExisting ? documentSource(existingActivity) : structuredClone(built.activity);
  if (!input.preserveExisting && existingActivity) {
    activitySource.flags = mergeNonResolverFlags(activitySource.flags, documentSource(existingActivity).flags);
  }
  activitySource._id = built.activity._id;
  activitySource.flags = isRecord(activitySource.flags) ? activitySource.flags : {};
  activitySource.flags[RESOLVER_MODULE_ID] = resolverOwnershipFlags(built.identity, 'activity', input.transactionId);
  if (input.preserveExisting) activitySource.flags[RESOLVER_MODULE_ID].protected = true;
  activitySource.flags[RESOLVER_MODULE_ID].transactionId = input.transactionId;
  activitySource.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(activitySource);
  const firstLifecycle = new NativeCacheLifecycleCapture(resolverDocumentHooks(input.lifecycleHooks));
  let preparedFeature: any;
  let activity: any;
  let nativeCacheSource: any;
  try {
    await requireActorApi(input.actor, 'updateEmbeddedDocuments')('Item', [{
      _id: documentId(feature),
      [`system.activities.${activitySource._id}`]: activitySource,
    }]);
    input.journal.touchedActivityIds.push(activitySource._id);
    preparedFeature = findItem(input.actor, documentId(feature));
    if (!preparedFeature) throw new Error('Linked feature disappeared after Activity update.');
    activity = getActivity(preparedFeature, activitySource._id);
    if (!activity || typeof activity.getCachedSpellData !== 'function') {
      throw new Error('Updated feature did not prepare a public dnd5e Cast Activity.');
    }
    assertResolverDocumentOwnership(input.actor, preparedFeature, activity, built.identity, 'activity');
    nativeCacheSource = await activity.getCachedSpellData();
    assertNativeCacheSource(nativeCacheSource, activity, built.identity.selectedUuid);
    journalNativeBinding(input, activity, built.identity, nativeCacheSource);
    await waitForActivityCacheLifecycle(
      input, firstLifecycle, existingActivity, existingCache, activity, nativeCacheSource, built.identity,
    );
  } finally {
    firstLifecycle.dispose();
  }

  // The exact public lifecycle has completed before ownership/adoption begins.

  let phaseCaches = await coalesceTransactionNativeCaches(input, preparedFeature, activity, built.identity);
  let phaseCache = phaseCaches[0];
  if (phaseCache?.flags?.[RESOLVER_MODULE_ID] !== undefined
    && existingIdentity && existingIdentity.selectedUuid !== built.identity.selectedUuid) {
    assertResolverDocumentOwnership(
      input.actor, preparedFeature, phaseCache, existingIdentity, 'spell', activity.relativeUUID,
    );
    await requireActorApi(input.actor, 'deleteEmbeddedDocuments')('Item', [documentId(phaseCache)]);
    phaseCache = undefined;
  }
  if (phaseCache && phaseCache.flags?.[RESOLVER_MODULE_ID] === undefined) {
    journalNativeCache(input, preparedFeature, activity, phaseCache, built.identity);
  }

  // dnd5e 5.3.3 prepares/defaults sparse Activity input. The ownership hash
  // must therefore be finalized from the public prepared document, not from
  // the pre-DataModel source that was sent to Item.update().
  ({ feature: preparedFeature, activity } = await refreshPreparedActivityHash(
    input, preparedFeature, activity, built.identity, nativeCacheSource,
  ));
  phaseCaches = await coalesceTransactionNativeCaches(input, preparedFeature, activity, built.identity);
  phaseCache = phaseCaches[0];
  if (phaseCache && phaseCache.flags?.[RESOLVER_MODULE_ID] === undefined) {
    journalNativeCache(input, preparedFeature, activity, phaseCache, built.identity);
  }

  let adoptedNativeId: string | undefined;
  if (phaseCache && phaseCache.flags?.[RESOLVER_MODULE_ID] === undefined) {
    assertAdoptableNativeCache(input.actor, preparedFeature, activity, phaseCache, built.identity, input.journal.snapshotItemIds);
    assertNativeCacheProjectionMatches(nativeCacheSource, phaseCache);
    const journalEntry = input.journal.nativeCaches.find((entry) => entry.id === documentId(phaseCache))!;
    const ownership = cacheOwnershipSource(phaseCache, built.identity, input.transactionId);
    await requireActorApi(input.actor, 'updateEmbeddedDocuments')('Item', [{
      _id: documentId(phaseCache),
      [`flags.${RESOLVER_MODULE_ID}`]: ownership,
    }]);
    journalEntry.ownershipApplied = true;
    adoptedNativeId = journalEntry.id;
    phaseCache = findItem(input.actor, journalEntry.id);
    if (!phaseCache) throw new Error('Native cache disappeared while applying resolver ownership.');
    assertResolverDocumentOwnership(input.actor, preparedFeature, phaseCache, built.identity, 'spell', activity.relativeUUID);
    await input.afterFeatureUpdate?.({ feature: preparedFeature, activity, cache: phaseCache, identity: built.identity });
  } else {
    await input.afterFeatureUpdate?.({
      feature: preparedFeature,
      activity,
      ...(phaseCache === undefined ? {} : { cache: phaseCache }),
      identity: built.identity,
    });
  }

  const matchingCaches = await coalesceTransactionNativeCaches(input, preparedFeature, activity, built.identity);

  let cache = matchingCaches[0];
  if (cache) {
    const resolverFlags = cache.flags?.[RESOLVER_MODULE_ID];
    if (resolverFlags !== undefined) {
      assertResolverDocumentOwnership(input.actor, preparedFeature, cache, built.identity, 'spell', activity.relativeUUID);
      if (documentId(cache) === adoptedNativeId) {
        // dnd5e created this exact cache during the feature update; it was
        // shape-checked against the getter and only ownership was added.
      } else if (input.preserveExisting) {
        // Defer the cache write until restoreKeptCache. dnd5e may replace the
        // cached Spell while resolving its public getter, so an intermediate
        // update by the old ID is not a stable operation.
      } else {
        const replacementId = documentId(cache);
        assertResolverDocumentOwnership(input.actor, preparedFeature, cache, built.identity, 'spell', activity.relativeUUID);
        await requireActorApi(input.actor, 'deleteEmbeddedDocuments')('Item', [replacementId]);
        const replacement = structuredClone(nativeCacheSource);
        replacement._id = replacementId;
        replacement.flags = mergeNonResolverFlags(replacement.flags, documentSource(cache).flags);
        replacement.flags.dnd5e = isRecord(replacement.flags.dnd5e) ? replacement.flags.dnd5e : {};
        replacement.flags.dnd5e.cachedFor = activity.relativeUUID;
        replacement.flags[RESOLVER_MODULE_ID] = resolverOwnershipFlags(built.identity, 'spell', input.transactionId);
        replacement.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(replacement);
        await requireActorApi(input.actor, 'createEmbeddedDocuments')('Item', [replacement], { keepId: true });
        cache = findItem(input.actor, replacementId);
        if (!cache) throw new Error('Owned cache replacement returned no embedded Spell.');
      }
      assertResolverDocumentOwnership(input.actor, preparedFeature, cache, built.identity, 'spell', activity.relativeUUID);
    } else {
      assertAdoptableNativeCache(
        input.actor, preparedFeature, activity, cache, built.identity, input.journal.snapshotItemIds,
      );
      assertNativeCacheProjectionMatches(nativeCacheSource, cache);
      const entry = input.journal.nativeCaches.find((candidate) => candidate.id === documentId(cache)) ?? {
        id: documentId(cache), identity: structuredClone(built.identity), cachedFor: activity.relativeUUID,
        selectedUuid: built.identity.selectedUuid, nativeProjection: captureNativeCacheProjection(nativeCacheSource), ownershipApplied: false,
      };
      if (!input.journal.nativeCaches.includes(entry)) input.journal.nativeCaches.push(entry);
      const ownership = cacheOwnershipSource(cache, built.identity, input.transactionId);
      await requireActorApi(input.actor, 'updateEmbeddedDocuments')('Item', [{
        _id: documentId(cache),
        [`flags.${RESOLVER_MODULE_ID}`]: ownership,
      }]);
      entry.ownershipApplied = true;
      cache = findItem(input.actor, entry.id);
      if (!cache) throw new Error('Native cache disappeared while applying resolver ownership.');
      assertResolverDocumentOwnership(input.actor, preparedFeature, cache, built.identity, 'spell', activity.relativeUUID);
    }
  } else {
    const spellId = generatedResolverDocumentId(built.identity, 'spell');
    if (findItem(input.actor, spellId)) throw new Error('Stable managed Spell ID collides with an existing Actor Item.');
    const source = structuredClone(nativeCacheSource);
    source._id = spellId;
    source.flags = isRecord(source.flags) ? source.flags : {};
    source.flags[RESOLVER_MODULE_ID] = resolverOwnershipFlags(built.identity, 'spell', input.transactionId);
    source.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(source);
    const created = await requireActorApi(input.actor, 'createEmbeddedDocuments')('Item', [source], { keepId: true });
    input.journal.createdSpellIds.push(spellId);
    cache = findItem(input.actor, spellId) ?? (Array.isArray(created) ? created[0] : undefined);
    if (!cache) throw new Error('Public embedded Spell creation returned no managed cache.');
    assertResolverDocumentOwnership(input.actor, preparedFeature, cache, built.identity, 'spell', activity.relativeUUID);
  }

  if (input.preserveExisting) {
    if (!keptCacheSnapshot) {
      throw new Error('Keep requires exactly one strictly owned cached Spell snapshot.');
    }
    cache = await restoreKeptCache(
      input,
      preparedFeature,
      activity,
      cache,
      built.identity,
      input.transactionId,
      keptCacheSnapshot,
    );
  }

  // A dnd5e Activity lifecycle write can surface an additional native cache
  // after the immediate public call. At this final boundary, retain the exact
  // owned cache and remove only transaction-created, provenance-proven native
  // duplicates before hashing and transaction validation.
  const finalCaches = await coalesceTransactionNativeCaches(input, preparedFeature, activity, built.identity);
  const finalOwned = finalCaches.find((entry) => entry.flags?.[RESOLVER_MODULE_ID]?.managed === true);
  if (finalOwned) cache = finalOwned;
  cache = await refreshPreparedSpellHash(input.actor, preparedFeature, activity, cache, built.identity);

  const result: HydratedSelection = {
    feature: preparedFeature,
    activity,
    cache,
    identity: built.identity,
    literalRestrictions: built.literalRestrictions,
  };
  return result;
}

function resolverIdentityFromFlags(document: any): ResolverManagedIdentity {
  const flags = document?.flags?.[RESOLVER_MODULE_ID];
  if (!isRecord(flags)) throw new Error('Existing managed document lacks resolver identity flags.');
  return {
    manifestId: flags.manifestId,
    groupId: flags.groupId,
    refId: flags.refId,
    featureId: flags.featureId,
    logicalRefKey: flags.logicalRefKey,
    selectedUuid: flags.selectedUuid,
    activityId: flags.activityId,
  };
}

function assertSameManagedRef(previous: ResolverManagedIdentity, next: ResolverManagedIdentity): void {
  for (const key of ['manifestId', 'groupId', 'refId', 'featureId', 'logicalRefKey', 'activityId'] as const) {
    if (previous[key] !== next[key]) {
      throw new Error(`Existing managed Activity identity differs from the requested ref at ${key}.`);
    }
  }
}

function journalNativeCache(
  input: HydrateManagedSelectionInput,
  feature: any,
  activity: any,
  cache: any,
  identity: ResolverManagedIdentity,
): void {
  assertAdoptableNativeCache(input.actor, feature, activity, cache, identity, input.journal.snapshotItemIds);
  if (input.journal.nativeCaches.some((entry) => entry.id === documentId(cache))) return;
  const binding = input.journal.nativeBindings.find((entry) => entry.identity.logicalRefKey === identity.logicalRefKey
    && entry.identity.activityId === identity.activityId);
  if (!binding) throw new Error('Native cache cannot be journaled before its complete public getter projection is bound.');
  assertNativeCacheProjectionMatches(binding.nativeProjection, cache);
  input.journal.nativeCaches.push({
    id: documentId(cache),
    identity: structuredClone(identity),
    cachedFor: activity.relativeUUID,
    selectedUuid: identity.selectedUuid,
    nativeProjection: structuredClone(binding.nativeProjection),
    ownershipApplied: false,
  });
}

function journalNativeBinding(
  input: HydrateManagedSelectionInput,
  activity: any,
  identity: ResolverManagedIdentity,
  nativeSource: any,
): void {
  if (input.journal.nativeBindings.some((entry) => entry.identity.logicalRefKey === identity.logicalRefKey
    && entry.identity.activityId === identity.activityId)) return;
  input.journal.nativeBindings.push({
    identity: structuredClone(identity),
    cachedFor: activity.relativeUUID,
    selectedUuid: identity.selectedUuid,
    nativeProjection: captureNativeCacheProjection(nativeSource),
  });
}

async function coalesceTransactionNativeCaches(
  input: HydrateManagedSelectionInput,
  feature: any,
  activity: any,
  identity: ResolverManagedIdentity,
): Promise<any[]> {
  const caches = cachesForActivity(input.actor, activity);
  if (caches.length <= 1) return caches;
  const owned: any[] = [];
  const native: any[] = [];
  for (const cache of caches) {
    if (cache.flags?.[RESOLVER_MODULE_ID] !== undefined) {
      assertResolverDocumentOwnership(input.actor, feature, cache, identity, 'spell', activity.relativeUUID);
      owned.push(cache);
      continue;
    }
    assertAdoptableNativeCache(
      input.actor, feature, activity, cache, identity, input.journal.snapshotItemIds,
    );
    if (!input.journal.nativeCaches.some((entry) => entry.id === documentId(cache))) {
      journalNativeCache(input, feature, activity, cache, identity);
    }
    native.push(cache);
  }
  if (owned.length > 1) throw new Error('Multiple resolver-owned cached Spells claim the same prepared Activity.');
  const retained = owned[0] ?? [...native].sort((left, right) => documentId(left).localeCompare(documentId(right), 'en'))[0];
  const deleteIds = caches.filter((cache) => cache !== retained).map(documentId);
  if (deleteIds.length) await requireActorApi(input.actor, 'deleteEmbeddedDocuments')('Item', deleteIds);
  const prepared = retained ? findItem(input.actor, documentId(retained)) : undefined;
  if (!prepared) throw new Error('Retained native cache disappeared during exact duplicate cleanup.');
  return [prepared];
}

async function refreshPreparedActivityHash(
  input: HydrateManagedSelectionInput,
  feature: any,
  activity: any,
  identity: ResolverManagedIdentity,
  nativeCacheSource: any,
): Promise<{ feature: any; activity: any }> {
  const actor = input.actor;
  const hash = computeManagedSourceHash(documentSource(activity));
  const beforeCache = cachesForActivity(actor, activity)[0];
  const lifecycle = new NativeCacheLifecycleCapture(resolverDocumentHooks(input.lifecycleHooks));
  try {
    await requireActorApi(actor, 'updateEmbeddedDocuments')('Item', [{
      _id: documentId(feature),
      [`system.activities.${documentId(activity)}.flags.${RESOLVER_MODULE_ID}.generatedContentHash`]: hash,
    }]);
  } catch (error) {
    lifecycle.dispose();
    throw error;
  }
  const preparedFeature = findItem(actor, documentId(feature));
  const preparedActivity = getActivity(preparedFeature, documentId(activity));
  if (!preparedFeature || !preparedActivity) throw new Error('Prepared Activity disappeared while finalizing its content hash.');
  try {
    await waitForActivityCacheLifecycle(
      input, lifecycle, activity, beforeCache, preparedActivity, nativeCacheSource, identity,
    );
  } finally {
    lifecycle.dispose();
  }
  assertResolverDocumentOwnership(actor, preparedFeature, preparedActivity, identity, 'activity');
  assertPreparedHash(preparedActivity, 'Activity');
  return { feature: preparedFeature, activity: preparedActivity };
}

async function refreshPreparedSpellHash(
  actor: any,
  feature: any,
  activity: any,
  cache: any,
  identity: ResolverManagedIdentity,
): Promise<any> {
  const cacheId = documentId(cache);
  const hash = computeManagedSourceHash(documentSource(cache));
  await requireActorApi(actor, 'updateEmbeddedDocuments')('Item', [{
    _id: cacheId,
    [`flags.${RESOLVER_MODULE_ID}.generatedContentHash`]: hash,
  }]);
  const preparedCache = findItem(actor, cacheId);
  if (!preparedCache) throw new Error('Prepared Spell disappeared while finalizing its content hash.');
  assertResolverDocumentOwnership(actor, feature, preparedCache, identity, 'spell', activity.relativeUUID);
  assertPreparedHash(preparedCache, 'Spell');
  return preparedCache;
}

async function restoreKeptCache(
  input: HydrateManagedSelectionInput,
  feature: any,
  activity: any,
  cache: any,
  identity: ResolverManagedIdentity,
  transactionId: string,
  snapshot: Record<string, any>,
): Promise<any> {
  // dnd5e 5.3.3 onUpdateActivities regenerates cached enchantment changes
  // for every Activity-id update. Keep therefore restores the strictly-owned
  // pre-write Spell source only after both the Activity body and prepared-hash
  // writes have completed, through the public Actor embedded-Item API.
  const actor = input.actor;
  const current = await currentKeepCache(input, feature, activity, cache, identity);
  const sourceFor = (cacheId: string) => {
    const source = structuredClone(snapshot);
    source._id = cacheId;
    delete source.id;
    source.flags = isRecord(source.flags) ? source.flags : {};
    source.flags.dnd5e = isRecord(source.flags.dnd5e) ? source.flags.dnd5e : {};
    source.flags.dnd5e.cachedFor = activity.relativeUUID;
    source.flags[RESOLVER_MODULE_ID] = resolverOwnershipFlags(identity, 'spell', transactionId);
    source.flags[RESOLVER_MODULE_ID].protected = true;
    source.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(source);
    return source;
  };
  let cacheId = documentId(current);
  try {
    await requireActorApi(actor, 'updateEmbeddedDocuments')('Item', [sourceFor(cacheId)]);
  } catch (error) {
    // A real dnd5e Cast getter can replace its cache after the getter Promise
    // resolves. Retry exactly once against the freshly proven native/owned
    // cache; never fall back to a name match or an arbitrary Spell.
    const replacement = await currentKeepCache(input, feature, activity, current, identity);
    const replacementId = documentId(replacement);
    if (replacementId === cacheId) throw error;
    cacheId = replacementId;
    await requireActorApi(actor, 'updateEmbeddedDocuments')('Item', [sourceFor(cacheId)]);
  }
  const restored = findItem(actor, cacheId);
  if (!restored) throw new Error('Kept cache disappeared while restoring its manual source.');
  assertResolverDocumentOwnership(actor, feature, restored, identity, 'spell', activity.relativeUUID);
  return restored;
}

async function currentKeepCache(
  input: HydrateManagedSelectionInput,
  feature: any,
  activity: any,
  prior: any,
  identity: ResolverManagedIdentity,
): Promise<any> {
  const caches = await coalesceTransactionNativeCaches(input, feature, activity, identity);
  if (caches.length !== 1) throw new Error('Keep requires exactly one current cached Spell while restoring manual content.');
  const current = caches[0];
  if (current.flags?.[RESOLVER_MODULE_ID] !== undefined) {
    assertResolverDocumentOwnership(input.actor, feature, current, identity, 'spell', activity.relativeUUID);
    return current;
  }
  assertAdoptableNativeCache(
    input.actor, feature, activity, current, identity, input.journal.snapshotItemIds,
  );
  if (!input.journal.nativeCaches.some((entry: NativeCacheJournalEntry) => entry.id === documentId(current))) {
    journalNativeCache(input, feature, activity, current, identity);
  }
  if (documentId(current) === documentId(prior)) {
    throw new Error('Keep cache lost resolver ownership without a dnd5e replacement identity change.');
  }
  return current;
}

function assertPreparedHash(document: any, label: 'Activity' | 'Spell'): void {
  const stored = document.flags?.[RESOLVER_MODULE_ID]?.generatedContentHash;
  if (typeof stored !== 'string' || stored !== computeManagedSourceHash(documentSource(document))) {
    throw new Error(`Prepared ${label} content hash was not finalized from its public document source.`);
  }
}

function cachesForActivity(actor: any, activity: any): any[] {
  return iterate(actor?.items).filter((item) => item?.type === 'spell'
    && item?.flags?.dnd5e?.cachedFor === activity.relativeUUID);
}

function cacheOwnershipSource(cache: any, identity: ResolverManagedIdentity, transactionId: string, protect = false) {
  const ownership = resolverOwnershipFlags(identity, 'spell', transactionId);
  if (protect) ownership.protected = true;
  const source = documentSource(cache);
  source.flags = isRecord(source.flags) ? source.flags : {};
  source.flags[RESOLVER_MODULE_ID] = ownership;
  ownership.generatedContentHash = computeManagedSourceHash(source);
  return ownership;
}

function assertNativeCacheSource(source: any, activity: any, selectedUuid: string): void {
  if (!isRecord(source) || source.type !== 'spell') throw new Error('Prepared Cast Activity returned no native Spell source.');
  if (source.flags?.dnd5e?.cachedFor !== activity.relativeUUID) throw new Error('Native cache source cachedFor does not match the prepared Activity.');
  if (source._stats?.compendiumSource !== selectedUuid) throw new Error('Native cache source lost the selected Compendium UUID.');
  if (typeof source.system?.sourceItem !== 'string' || !source.system.sourceItem) throw new Error('Native cache source lacks dnd5e system.sourceItem provenance.');
  if (!Array.isArray(source.effects)) throw new Error('Native cache source lacks source effects/enchantment data.');
}

async function waitForActivityCacheLifecycle(
  input: HydrateManagedSelectionInput,
  lifecycle: NativeCacheLifecycleCapture,
  beforeActivity: any,
  beforeCache: any,
  activity: any,
  nativeCacheSource: any,
  identity: ResolverManagedIdentity,
): Promise<void> {
  if (!lifecycle.active) return;
  try {
    if (!beforeCache || beforeActivity?.spell?.uuid !== identity.selectedUuid) {
      await lifecycle.waitForCreatedCache({
        actor: input.actor,
        cachedFor: activity.relativeUUID,
        selectedUuid: identity.selectedUuid,
        projection: captureNativeCacheProjection(nativeCacheSource),
      });
      return;
    }
    const expectedEffects = Array.isArray(nativeCacheSource?.effects) ? nativeCacheSource.effects : [];
    const beforeEffects = Array.isArray(documentSource(beforeCache).effects) ? documentSource(beforeCache).effects : [];
    const enchantment = expectedEffects.find((effect: any) => effect?.type === 'enchantment'
      && beforeEffects.some((prior: any) => prior?._id === effect?._id));
    if (enchantment?._id) {
      const currentCache = findItem(input.actor, documentId(beforeCache));
      const currentEffects = Array.isArray(documentSource(currentCache).effects)
        ? documentSource(currentCache).effects
        : [];
      const currentEnchantment = currentEffects.find((effect: any) => effect?._id === enchantment._id);
      // Document.update() is a no-op when dnd5e's computed changes already
      // equal the persisted enchantment. Foundry emits no updateActiveEffect
      // hook in that case, and no delayed semantic mutation remains to await.
      if (currentEnchantment && nativeEffectChangesEqual(currentEnchantment.changes, enchantment.changes)) return;
      const currentUserId = typeof (globalThis as any).game?.user?.id === 'string'
        ? (globalThis as any).game.user.id
        : undefined;
      await lifecycle.waitForUpdatedEffect(
        input.actor,
        documentId(beforeCache),
        enchantment._id,
        enchantment.changes,
        currentUserId,
      );
    }
  } catch (error) {
    input.journal.lifecycleFailures.push(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function documentSource(document: any): Record<string, any> {
  if (document && typeof document.toObject === 'function') return document.toObject();
  if (!isRecord(document)) return {};
  const source: Record<string, any> = {};
  for (const [key, value] of Object.entries(document)) {
    if (['parent', 'actor', 'item', 'id', 'relativeUUID', 'cachedSpell'].includes(key) || typeof value === 'function') continue;
    source[key] = structuredClone(value);
  }
  return source;
}

function mergeNonResolverFlags(nativeFlags: unknown, existingFlags: unknown): Record<string, any> {
  const native = isRecord(nativeFlags) ? structuredClone(nativeFlags) : {};
  const existing = isRecord(existingFlags) ? structuredClone(existingFlags) : {};
  delete existing[RESOLVER_MODULE_ID];
  return deepMerge(native, existing);
}

function deepMerge(base: Record<string, any>, overlay: Record<string, any>): Record<string, any> {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(overlay)) {
    result[key] = isRecord(value) && isRecord(result[key])
      ? deepMerge(result[key], value)
      : structuredClone(value);
  }
  return result;
}

function getActivity(feature: any, id: string): any {
  const activities = feature?.system?.activities;
  if (activities && typeof activities.get === 'function') return activities.get(id);
  return activities?.[id];
}

function findItem(actor: any, id: string): any {
  if (actor?.items && typeof actor.items.get === 'function') return actor.items.get(id);
  return iterate(actor?.items).find((item) => documentId(item) === id);
}

function iterate(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value[Symbol.iterator] === 'function') return [...value];
  return [];
}

function requireActorApi(actor: any, key: 'updateEmbeddedDocuments' | 'createEmbeddedDocuments' | 'deleteEmbeddedDocuments') {
  const api = actor?.[key];
  if (typeof api !== 'function') throw new TypeError(`Actor public ${key} API is unavailable.`);
  return api.bind(actor);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
