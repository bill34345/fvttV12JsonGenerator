import {
  hashManifest,
  logicalSpellRefKey,
  RESOLVER_MODULE_ID,
  sha256,
  validatePortableSpellManifestStructure,
  type ManagedSpellProjection,
  type PortableSpellManifest,
  type SpellHydrationPlan,
} from '../../core/spell-resolution';
import { computeManagedSourceHash, generatedResolverDocumentId, type LiteralRestrictionReport } from './cast-activity';
import { createHydrationJournal, hydrateManagedSelection, type HydrationJournal } from './hydrator';
import {
  assertAdoptableNativeCache,
  assertLinkedFeatureOwnership,
  assertOrphanedTransactionNativeCache,
  assertResolverDocumentOwnership,
  documentId,
  readCompendiumSource,
  resolverOwnershipFlags,
  type ResolverDocumentIdentity,
} from './ownership';

export type HydrationFailureStage = 'after-feature-update' | 'after-partial-cache-creation' | 'during-cleanup' | 'during-rollback';

export interface ResidualDifference {
  path: string;
  before?: unknown;
  after?: unknown;
}

export class HydrationTransactionError extends Error {
  constructor(
    message: string,
    public readonly rollbackSucceeded: boolean,
    public readonly residualDifferences: ResidualDifference[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'HydrationTransactionError';
  }
}

export interface ExecuteHydrationTransactionInput {
  actor: any;
  manifest: PortableSpellManifest;
  plan: SpellHydrationPlan;
  failureInjector?: (stage: HydrationFailureStage) => void | Promise<void>;
}

export interface HydrationTransactionResult {
  status: 'committed' | 'noop';
  planHash: string;
  transactionId?: string;
  managedProjectionHash: string;
}

export interface ResolverManagedDocumentProjection {
  logicalRefKey: string;
  activities: Array<Record<string, unknown>>;
  cachedSpells: Array<Record<string, unknown>>;
}

interface ManagedSnapshot {
  resolverFlags: unknown;
  itemIds: string[];
  activities: Array<{ featureId: string; source: Record<string, any> }>;
  spells: Array<Record<string, any>>;
}

interface ManagedDocumentSet {
  activities: Array<{ feature: any; activity: any; identity: ResolverDocumentIdentity }>;
  spells: Array<{ spell: any; identity: ResolverDocumentIdentity }>;
}

const actorLocks = new WeakMap<object, Promise<void>>();
let transactionSequence = 0;

export async function executeHydrationTransaction(input: ExecuteHydrationTransactionInput): Promise<HydrationTransactionResult> {
  if (!input?.actor || typeof input.actor !== 'object') throw new TypeError('A current Actor is required.');
  return withActorMutex(input.actor, () => executeLocked(input));
}

async function executeLocked(input: ExecuteHydrationTransactionInput): Promise<HydrationTransactionResult> {
  validateTransactionInput(input);
  const beforeProjection = projectHydrationBindingProjection(input.actor, input.manifest);
  const beforeProjectionHash = hashProjectionList(beforeProjection);
  const resolution = input.actor.flags?.[RESOLVER_MODULE_ID]?.spellResolution;
  if (resolution?.status === 'hydrated' && resolution.planHash === input.plan.planHash) {
    validateHydratedState(input.actor, input.manifest, input.plan);
    if (resolution.managedProjectionHash !== beforeProjectionHash) {
      throw new Error('Same-plan Actor managed projection drifted structurally; refusing a false no-op.');
    }
    return { status: 'noop', planHash: input.plan.planHash, managedProjectionHash: beforeProjectionHash };
  }
  const explicitConflictKeys = input.plan.selections
    .filter((selection) => selection.manualDecision === 'keep' || selection.manualDecision === 'overwrite')
    .map((selection) => selection.logicalRefKey);
  const planBoundProjectionHash = hashProjectionList(
    projectHydrationBindingProjection(input.actor, input.manifest, explicitConflictKeys),
  );
  if (planBoundProjectionHash !== input.plan.currentManagedProjectionHash) {
    throw new Error('Ready plan is stale for the Actor current managed projection.');
  }
  assertPreWriteConflictAuthorization(input.actor, input.manifest, input.plan);

  // Keep the exact pre-transaction namespace out-of-band for compensation.
  // The user-facing undo snapshot deliberately omits the previous undo payload,
  // otherwise every successful re-resolution recursively embeds all history.
  const rollbackResolverFlags = structuredClone(input.actor.flags?.[RESOLVER_MODULE_ID]);
  const snapshot = captureSnapshot(input.actor, input.manifest.manifestId);
  const journal = createHydrationJournal(input.actor);
  const transactionId = nextTransactionId(input.actor, input.plan.planHash);
  const literalRestrictions: LiteralRestrictionReport[] = [];
  try {
    for (let index = 0; index < input.plan.selections.length; index++) {
      const selection = input.plan.selections[index]!;
      const hydrated = await hydrateManagedSelection({
        actor: input.actor,
        manifest: input.manifest,
        selection,
        transactionId,
        journal,
        preserveExisting: selection.manualDecision === 'keep',
        afterFeatureUpdate: async () => input.failureInjector?.('after-feature-update'),
      });
      literalRestrictions.push(...hydrated.literalRestrictions);
      if (index === 0 && input.plan.selections.length > 1) {
        await input.failureInjector?.('after-partial-cache-creation');
      }
    }

    await cleanupStaleManagedContent(input, journal);
    validateHydratedState(input.actor, input.manifest, input.plan);
    const managedProjectionHash = hashProjectionList(projectCurrentManagedContent(input.actor, input.manifest.manifestId));
    const generatedProjection = mergeGeneratedProjectionForCommit(
      projectResolverManagedDocuments(input.actor, input.manifest.manifestId),
      resolution?.generatedProjection,
      input.plan,
    );
    const committedResolution = {
      status: 'hydrated' as const,
      manifestHash: input.plan.manifestHash,
      planHash: input.plan.planHash,
      resolutionConfigHash: input.plan.resolutionConfigHash,
      managedProjectionHash,
      transactionId,
      report: {
        planHash: input.plan.planHash,
        sourceInventoryHash: input.plan.sourceInventoryHash,
        candidateMetadataHash: input.plan.candidateMetadataHash,
        selections: input.plan.selections.map((entry) => ({
          logicalRefKey: entry.logicalRefKey,
          groupId: entry.groupId,
          refId: entry.refId,
          selectedUuid: entry.uuid,
          rules: entry.rules,
          selectionOrigin: entry.selectionOrigin,
          ...(entry.manualDecision === undefined ? {} : { manualDecision: entry.manualDecision }),
          ...(entry.manualDecision === 'keep' ? { protected: true } : {}),
        })),
        literalRestrictions,
      },
      generatedProjection,
      undoSnapshot: snapshot,
    };
    await requireApi(input.actor, 'update')({
      [`flags.${RESOLVER_MODULE_ID}.spellResolution`]: committedResolution,
    });
    return { status: 'committed', planHash: input.plan.planHash, transactionId, managedProjectionHash };
  } catch (cause) {
    const residualDifferences = await rollback(input, snapshot, journal, rollbackResolverFlags);
    const rollbackSucceeded = residualDifferences.length === 0;
    const message = `Spell hydration failed: ${errorMessage(cause)}; rollback ${rollbackSucceeded ? 'restored the managed snapshot' : 'left residual differences'}.`;
    throw new HydrationTransactionError(message, rollbackSucceeded, residualDifferences, { cause });
  }
}

function mergeGeneratedProjectionForCommit(
  current: ResolverManagedDocumentProjection[],
  priorValue: unknown,
  plan: SpellHydrationPlan,
): ResolverManagedDocumentProjection[] {
  const prior = new Map(
    (Array.isArray(priorValue) ? priorValue : [])
      .filter(isStoredGeneratedProjection)
      .map((entry) => [entry.logicalRefKey, entry] as const),
  );
  const keep = new Set(plan.selections
    .filter((selection) => selection.manualDecision === 'keep')
    .map((selection) => selection.logicalRefKey));
  return current.flatMap((entry) => {
    if (!keep.has(entry.logicalRefKey)) return [entry];
    const baseline = prior.get(entry.logicalRefKey);
    return baseline ? [structuredClone(baseline)] : [];
  }).sort((left, right) => left.logicalRefKey.localeCompare(right.logicalRefKey, 'en'));
}

function isStoredGeneratedProjection(value: unknown): value is ResolverManagedDocumentProjection {
  return isRecord(value)
    && typeof value.logicalRefKey === 'string'
    && Array.isArray(value.activities) && value.activities.every(isRecord)
    && Array.isArray(value.cachedSpells) && value.cachedSpells.every(isRecord);
}

function assertPreWriteConflictAuthorization(actor: any, manifest: PortableSpellManifest, plan: SpellHydrationPlan): void {
  const managed = collectManagedDocuments(actor, manifest.manifestId);
  for (const document of [
    ...managed.activities.map((entry) => ({ value: entry.activity, identity: entry.identity })),
    ...managed.spells.map((entry) => ({ value: entry.spell, identity: entry.identity })),
  ]) {
    const stored = document.value.flags?.[RESOLVER_MODULE_ID]?.generatedContentHash;
    const current = computeManagedSourceHash(documentSource(document.value));
    if (stored === current) continue;
    const selection = plan.selections.find((entry) => entry.logicalRefKey === document.identity.logicalRefKey);
    if (selection?.manualDecision !== 'keep' && selection?.manualDecision !== 'overwrite') {
      throw new Error(`Managed structural drift for ${document.identity.logicalRefKey} requires an explicit Keep or Overwrite decision.`);
    }
  }
}

function validateTransactionInput(input: ExecuteHydrationTransactionInput): void {
  const validated = validatePortableSpellManifestStructure(input.manifest);
  if (!validated.ok) throw new TypeError('Transaction manifest is structurally invalid.');
  const actorManifest = input.actor.flags?.[RESOLVER_MODULE_ID]?.spellManifest;
  const actorValidated = validatePortableSpellManifestStructure(actorManifest);
  if (!actorValidated.ok || hashManifest(actorValidated.value) !== hashManifest(validated.value)) {
    throw new TypeError('Actor manifest does not exactly match the transaction manifest.');
  }
  const plan = input.plan;
  if (!isRecord(plan) || plan.manifestId !== validated.value.manifestId || plan.manifestHash !== hashManifest(validated.value)) {
    throw new TypeError('Hydration plan is not bound to the current manifest.');
  }
  const expectedPlanHash = sha256(canonicalStringify(Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'planHash'))));
  if (plan.planHash !== expectedPlanHash) throw new TypeError('Hydration plan hash is malformed or stale.');
  if (!Array.isArray(plan.selections)) throw new TypeError('Hydration plan selections must be an array.');

  const expected = new Map(validated.value.spellcastingGroups.flatMap((group) => group.spellRefs.map((ref) => [
    logicalSpellRefKey(validated.value.manifestId, group.groupId, ref.refId),
    { groupId: group.groupId, refId: ref.refId },
  ] as const)));
  const seen = new Set<string>();
  for (const selection of plan.selections) {
    if (!isRecord(selection) || typeof selection.logicalRefKey !== 'string') throw new TypeError('Hydration selection is malformed.');
    const target = expected.get(selection.logicalRefKey);
    if (!target || target.groupId !== selection.groupId || target.refId !== selection.refId) {
      throw new TypeError('Hydration selection does not match a manifest ref identity.');
    }
    if (seen.has(selection.logicalRefKey)) throw new TypeError('Hydration plan contains duplicate selections.');
    if (typeof selection.uuid !== 'string' || !/^Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Item\.[A-Za-z0-9]{16}$/.test(selection.uuid)) {
      throw new TypeError('Hydration selection must retain a destination Compendium Spell UUID.');
    }
    seen.add(selection.logicalRefKey);
  }
  if (seen.size !== expected.size || [...expected.keys()].some((key) => !seen.has(key))) {
    throw new TypeError('Hydration plan must select every manifest ref exactly once before the first write.');
  }
}

async function cleanupStaleManagedContent(
  input: ExecuteHydrationTransactionInput,
  journal: HydrationJournal,
): Promise<void> {
  const managed = collectManagedDocuments(input.actor, input.manifest.manifestId);
  const desiredActivities = new Set(input.plan.selections.map((selection) => {
    const feature = findFeatureForSelection(input.actor, input.manifest, selection.groupId);
    return `${documentId(feature)}:${generatedResolverDocumentId({
      manifestId: input.manifest.manifestId,
      groupId: selection.groupId,
      refId: selection.refId,
      featureId: documentId(feature),
    }, 'activity')}`;
  }));
  const desiredSpellKeys = new Set(input.plan.selections.map((selection) => selection.logicalRefKey));
  let cleaned = false;

  for (const { spell, identity } of managed.spells) {
    const activityEntry = managed.activities.find((entry) => entry.identity.activityId === identity.activityId
      && entry.identity.logicalRefKey === identity.logicalRefKey);
    const isDesired = desiredSpellKeys.has(identity.logicalRefKey)
      && activityEntry !== undefined
      && desiredActivities.has(`${identity.featureId}:${identity.activityId}`)
      && documentId(spell) === documentId(activityEntry.activity.cachedSpell ?? spell)
      && input.plan.selections.some((selection) => selection.logicalRefKey === identity.logicalRefKey && selection.uuid === identity.selectedUuid);
    if (isDesired) continue;
    if (!activityEntry) throw new Error('Stale managed Spell lacks its strictly owned Activity; refusing cleanup.');
    assertResolverDocumentOwnership(input.actor, activityEntry.feature, activityEntry.activity, identity, 'activity');
    assertResolverDocumentOwnership(input.actor, activityEntry.feature, spell, identity, 'spell', activityEntry.activity.relativeUUID);
    await requireApi(input.actor, 'deleteEmbeddedDocuments')('Item', [documentId(spell)]);
    cleaned = true;
  }

  for (const { feature, activity, identity } of managed.activities) {
    if (desiredActivities.has(`${identity.featureId}:${identity.activityId}`)
      && input.plan.selections.some((selection) => selection.logicalRefKey === identity.logicalRefKey
        && selection.uuid === identity.selectedUuid
        && documentId(activity) === identity.activityId)) continue;
    assertResolverDocumentOwnership(input.actor, feature, activity, identity, 'activity');
    if (typeof feature.deleteActivity !== 'function') throw new Error('Linked feature public deleteActivity(id) API is unavailable.');
    await feature.deleteActivity(documentId(activity));
    cleaned = true;
  }
  if (cleaned) await input.failureInjector?.('during-cleanup');
  void journal;
}

function validateHydratedState(actor: any, manifest: PortableSpellManifest, plan: SpellHydrationPlan): void {
  const managed = collectManagedDocuments(actor, manifest.manifestId);
  if (managed.activities.length !== plan.selections.length || managed.spells.length !== plan.selections.length) {
    throw new Error('Managed Activity/Spell count does not match the complete ready plan.');
  }
  for (const selection of plan.selections) {
    const activities = managed.activities.filter((entry) => entry.identity.logicalRefKey === selection.logicalRefKey);
    const spells = managed.spells.filter((entry) => entry.identity.logicalRefKey === selection.logicalRefKey);
    if (activities.length !== 1 || spells.length !== 1) throw new Error('Each plan ref must own exactly one Activity and one cache.');
    const activityEntry = activities[0]!;
    const spellEntry = spells[0]!;
    if (activityEntry.identity.selectedUuid !== selection.uuid || spellEntry.identity.selectedUuid !== selection.uuid) {
      throw new Error('Managed destination UUID differs from the ready selection.');
    }
    assertResolverDocumentOwnership(actor, activityEntry.feature, activityEntry.activity, activityEntry.identity, 'activity');
    assertResolverDocumentOwnership(actor, activityEntry.feature, spellEntry.spell, spellEntry.identity, 'spell', activityEntry.activity.relativeUUID);
    assertStoredContentHash(activityEntry.activity);
    assertStoredContentHash(spellEntry.spell);
  }
}

function assertStoredContentHash(document: any): void {
  const stored = document.flags?.[RESOLVER_MODULE_ID]?.generatedContentHash;
  if (typeof stored !== 'string' || stored !== computeManagedSourceHash(documentSource(document))) {
    throw new Error('Managed document projection hash does not match current structural content.');
  }
}

function captureSnapshot(actor: any, manifestId: string): ManagedSnapshot {
  const managed = collectManagedDocuments(actor, manifestId);
  return {
    resolverFlags: snapshotResolverFlags(actor.flags?.[RESOLVER_MODULE_ID]),
    itemIds: iterate(actor.items).map(documentId).filter(Boolean).sort((left, right) => left.localeCompare(right, 'en')),
    activities: managed.activities.map(({ feature, activity }) => ({
      featureId: documentId(feature),
      source: documentSource(activity),
    })).sort((left, right) => `${left.featureId}:${left.source._id}`.localeCompare(`${right.featureId}:${right.source._id}`, 'en')),
    spells: managed.spells.map(({ spell }) => documentSource(spell)).sort(sortSources),
  };
}

function snapshotResolverFlags(value: unknown): unknown {
  const flags = structuredClone(value);
  if (!isRecord(flags) || !isRecord(flags.spellResolution)) return flags;
  delete flags.spellResolution.undoSnapshot;
  return flags;
}

async function rollback(
  input: ExecuteHydrationTransactionInput,
  snapshot: ManagedSnapshot,
  journal: HydrationJournal,
  rollbackResolverFlags: unknown,
): Promise<ResidualDifference[]> {
  const rollbackErrors: string[] = [];
  await safeRollback(async () => input.failureInjector?.('during-rollback'), rollbackErrors);
  await settleRollbackNativeCaches(input, journal, rollbackErrors);

  let managed = collectManagedDocuments(input.actor, input.manifest.manifestId);
  for (const { spell, identity } of managed.spells) {
    await safeRollback(async () => {
      const activityEntry = managed.activities.find((entry) => entry.identity.activityId === identity.activityId
        && entry.identity.logicalRefKey === identity.logicalRefKey);
      if (!activityEntry) throw new Error(`Cannot prove Activity ownership for rollback Spell ${documentId(spell)}.`);
      assertResolverDocumentOwnership(input.actor, activityEntry.feature, activityEntry.activity, identity, 'activity');
      assertResolverDocumentOwnership(input.actor, activityEntry.feature, spell, identity, 'spell', activityEntry.activity.relativeUUID);
      await requireApi(input.actor, 'deleteEmbeddedDocuments')('Item', [documentId(spell)]);
    }, rollbackErrors);
  }

  // If dnd5e created a cache but ownership marking failed, the exact journal
  // and native provenance are the only allowed recovery/adoption authority.
  for (const entry of journal.nativeCaches) {
    await safeRollback(async () => {
      const cache = findItem(input.actor, entry.id);
      if (!cache) return;
      const feature = findItem(input.actor, entry.identity.featureId);
      const activity = getActivity(feature, entry.identity.activityId);
      if (!feature || !activity) throw new Error(`Journaled native cache ${entry.id} lost its owned Activity.`);
      if (cache.flags?.[RESOLVER_MODULE_ID] === undefined) {
        assertAdoptableNativeCache(input.actor, feature, activity, cache, entry.identity, journal.snapshotItemIds);
        const ownership = resolverOwnershipFlags(entry.identity, 'spell');
        const source = documentSource(cache);
        source.flags = isRecord(source.flags) ? source.flags : {};
        source.flags[RESOLVER_MODULE_ID] = ownership;
        ownership.generatedContentHash = computeManagedSourceHash(source);
        await requireApi(input.actor, 'updateEmbeddedDocuments')('Item', [{
          _id: entry.id,
          [`flags.${RESOLVER_MODULE_ID}`]: ownership,
        }]);
      }
      const owned = findItem(input.actor, entry.id);
      assertResolverDocumentOwnership(input.actor, feature, owned, entry.identity, 'spell', activity.relativeUUID);
      await requireApi(input.actor, 'deleteEmbeddedDocuments')('Item', [entry.id]);
    }, rollbackErrors);
  }

  managed = collectManagedDocuments(input.actor, input.manifest.manifestId);
  for (const { feature, activity, identity } of managed.activities) {
    await safeRollback(async () => {
      assertResolverDocumentOwnership(input.actor, feature, activity, identity, 'activity');
      if (typeof feature.deleteActivity !== 'function') throw new Error('Rollback requires feature.deleteActivity(id).');
      await feature.deleteActivity(documentId(activity));
    }, rollbackErrors);
  }

  for (const saved of snapshot.activities) {
    await safeRollback(async () => {
      const feature = findItem(input.actor, saved.featureId);
      if (!feature) throw new Error(`Snapshot feature ${saved.featureId} is missing.`);
      const beforeIds = new Set(iterate(input.actor.items).map(documentId));
      await requireApi(input.actor, 'updateEmbeddedDocuments')('Item', [{
        _id: saved.featureId,
        [`system.activities.${saved.source._id}`]: structuredClone(saved.source),
      }]);
      // dnd5e may auto-create a cache during rollback Activity restoration.
      const activity = getActivity(findItem(input.actor, saved.featureId), saved.source._id);
      const identity = readIdentity(saved.source.flags?.[RESOLVER_MODULE_ID]);
      if (!activity || !identity) throw new Error('Restored snapshot Activity lacks resolver identity.');
      const newCaches = iterate(input.actor.items).filter((item) => !beforeIds.has(documentId(item))
        && item?.flags?.dnd5e?.cachedFor === activity.relativeUUID);
      for (const cache of newCaches) {
        assertAdoptableNativeCache(input.actor, feature, activity, cache, identity, beforeIds);
        const ownership = resolverOwnershipFlags(identity, 'spell');
        const source = documentSource(cache);
        source.flags = isRecord(source.flags) ? source.flags : {};
        source.flags[RESOLVER_MODULE_ID] = ownership;
        ownership.generatedContentHash = computeManagedSourceHash(source);
        await requireApi(input.actor, 'updateEmbeddedDocuments')('Item', [{ _id: documentId(cache), [`flags.${RESOLVER_MODULE_ID}`]: ownership }]);
        await requireApi(input.actor, 'deleteEmbeddedDocuments')('Item', [documentId(cache)]);
      }
    }, rollbackErrors);
  }

  await settleOrphanedRollbackNativeCaches(input, journal, rollbackErrors);

  if (snapshot.spells.length) {
    await safeRollback(async () => {
      await requireApi(input.actor, 'createEmbeddedDocuments')('Item', structuredClone(snapshot.spells), { keepId: true });
    }, rollbackErrors);
  }
  await safeRollback(async () => {
    await requireApi(input.actor, 'update')({ [`flags.${RESOLVER_MODULE_ID}`]: structuredClone(rollbackResolverFlags) });
  }, rollbackErrors);

  const after = captureSnapshot(input.actor, input.manifest.manifestId);
  const differences = diffSnapshot(snapshot, after);
  if (rollbackErrors.length) {
    differences.push({ path: '/rollback/errors', after: [...new Set(rollbackErrors)] });
  }
  return differences;
}

async function settleRollbackNativeCaches(
  input: ExecuteHydrationTransactionInput,
  journal: HydrationJournal,
  rollbackErrors: string[],
): Promise<void> {
  if (journal.nativeBindings.length === 0) return;
  const stableWindowMs = 300;
  const deadline = Date.now() + 2_000;
  let signature = '';
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const targets = [...journal.nativeBindings];
    for (const entry of targets) {
      const feature = findItem(input.actor, entry.identity.featureId);
      const activity = getActivity(feature, entry.identity.activityId);
      if (!feature || !activity) continue;
      for (const cache of iterate(input.actor.items)) {
        const id = documentId(cache);
        if (!id || journal.snapshotItemIds.has(id) || cache?.flags?.dnd5e?.cachedFor !== entry.cachedFor
          || readCompendiumSource(cache) !== entry.selectedUuid) continue;
        try {
          if (cache.flags?.[RESOLVER_MODULE_ID] === undefined) {
            assertAdoptableNativeCache(input.actor, feature, activity, cache, entry.identity, journal.snapshotItemIds);
            if (!journal.nativeCaches.some((candidate) => candidate.id === id)) {
              journal.nativeCaches.push({ ...structuredClone(entry), id, ownershipApplied: false });
            }
          } else {
            assertResolverDocumentOwnership(input.actor, feature, cache, entry.identity, 'spell', activity.relativeUUID);
          }
        } catch (error) {
          rollbackErrors.push(errorMessage(error));
        }
      }
    }
    const nextSignature = journal.nativeCaches.map((entry) => entry.id).sort().join('\n');
    if (nextSignature !== signature) {
      signature = nextSignature;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= stableWindowMs) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function settleOrphanedRollbackNativeCaches(
  input: ExecuteHydrationTransactionInput,
  journal: HydrationJournal,
  rollbackErrors: string[],
): Promise<void> {
  if (journal.nativeBindings.length === 0) return;
  const discovered = new Set<string>();
  // dnd5e 5.3.3 does not await Item5e#onUpdateActivities (18532-18555)
  // at the Actor embedded-update boundary. Its compendium-backed cache insert
  // can therefore complete after the Activity has already been compensated.
  const stableWindowMs = 2_000;
  const deadline = Date.now() + 5_000;
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    for (const entry of [...journal.nativeBindings]) {
      const feature = findItem(input.actor, entry.identity.featureId);
      if (!feature) continue;
      for (const cache of iterate(input.actor.items)) {
        const id = documentId(cache);
        if (!id || journal.snapshotItemIds.has(id) || cache?.type !== 'spell'
          || cache?.flags?.dnd5e?.cachedFor !== entry.cachedFor
          || readCompendiumSource(cache) !== entry.selectedUuid) continue;
        try {
          if (cache.flags?.[RESOLVER_MODULE_ID] === undefined) {
            assertOrphanedTransactionNativeCache(
              input.actor, feature, cache, entry.identity, entry.cachedFor, entry.sourceItem, journal.snapshotItemIds,
            );
          } else {
            assertResolverDocumentOwnership(
              input.actor, feature, cache, entry.identity, 'spell', entry.cachedFor,
            );
          }
          await requireApi(input.actor, 'deleteEmbeddedDocuments')('Item', [id]);
          if (!discovered.has(id)) {
            discovered.add(id);
            stableSince = Date.now();
          }
        } catch (error) {
          rollbackErrors.push(errorMessage(error));
        }
      }
    }
    if (Date.now() - stableSince >= stableWindowMs) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export function projectCurrentManagedContent(actor: any, manifestId: string): ManagedSpellProjection[] {
  const managed = collectManagedDocuments(actor, manifestId);
  const keys = new Set([
    ...managed.activities.map((entry) => entry.identity.logicalRefKey),
    ...managed.spells.map((entry) => entry.identity.logicalRefKey),
  ]);
  return [...keys].sort((left, right) => left.localeCompare(right, 'en')).map((logicalRefKey) => ({
    logicalRefKey,
    managedContentHash: sha256(canonicalStringify({
      activities: managed.activities.filter((entry) => entry.identity.logicalRefKey === logicalRefKey)
        .map((entry) => computeManagedSourceHash(documentSource(entry.activity))).sort(),
      spells: managed.spells.filter((entry) => entry.identity.logicalRefKey === logicalRefKey)
        .map((entry) => computeManagedSourceHash(documentSource(entry.spell))).sort(),
    })),
  }));
}

/**
 * The exact Actor projection bound into a hydration plan. Persisted hydrated or
 * stale resolutions retain one projection row for every manifest ref even when
 * a whole managed pair has been deleted. Pending Actors deliberately use only
 * documents that actually exist.
 */
export function projectHydrationBindingProjection(
  actor: any,
  manifest: PortableSpellManifest,
  manualConflictLogicalRefs: Iterable<string> = [],
): ManagedSpellProjection[] {
  const projections = new Map(projectCurrentManagedContent(actor, manifest.manifestId)
    .map((entry) => [entry.logicalRefKey, entry]));
  const resolutionStatus = actor?.flags?.[RESOLVER_MODULE_ID]?.spellResolution?.status;
  if (resolutionStatus === 'hydrated' || resolutionStatus === 'stale') {
    for (const group of manifest.spellcastingGroups) {
      for (const ref of group.spellRefs) {
        const logicalRefKey = logicalSpellRefKey(manifest.manifestId, group.groupId, ref.refId);
        if (!projections.has(logicalRefKey)) projections.set(logicalRefKey, { logicalRefKey });
      }
    }
  }
  const conflicts = new Set(manualConflictLogicalRefs);
  return [...projections.values()]
    .sort((left, right) => left.logicalRefKey.localeCompare(right.logicalRefKey, 'en'))
    .map((entry) => conflicts.has(entry.logicalRefKey) ? { ...entry, manualConflict: true } : entry);
}

/**
 * Stable resolver-owned projection used for human review. Activity mechanics are
 * retained, while cached Spells expose identity/provenance metadata only so a
 * premium compendium body is never duplicated into Actor flags.
 */
export function projectResolverManagedDocuments(actor: any, manifestId: string): ResolverManagedDocumentProjection[] {
  const managed = collectManagedDocuments(actor, manifestId);
  const keys = new Set([
    ...managed.activities.map((entry) => entry.identity.logicalRefKey),
    ...managed.spells.map((entry) => entry.identity.logicalRefKey),
  ]);
  return [...keys].sort((left, right) => left.localeCompare(right, 'en')).map((logicalRefKey) => ({
    logicalRefKey,
    activities: managed.activities.filter((entry) => entry.identity.logicalRefKey === logicalRefKey)
      .map((entry) => projectActivity(entry.feature, documentSource(entry.activity))).sort(sortProjectedDocuments),
    cachedSpells: managed.spells.filter((entry) => entry.identity.logicalRefKey === logicalRefKey)
      .map((entry) => projectCachedSpell(documentSource(entry.spell))).sort(sortProjectedDocuments),
  }));
}

export function projectProposedResolverDocuments(
  logicalRefKey: string,
  featureId: string,
  activitySource: Record<string, any>,
  candidate: { uuid: string; name?: string; identifier?: string; rules?: string; sourceBook?: string; level?: number; school?: string },
): ResolverManagedDocumentProjection {
  const activityId = String(activitySource._id ?? '');
  const resolver = isRecord(activitySource.flags?.[RESOLVER_MODULE_ID]) ? activitySource.flags[RESOLVER_MODULE_ID] : {};
  return {
    logicalRefKey,
    activities: [projectActivity({ id: featureId }, activitySource)],
    cachedSpells: [compactRecord({
      id: generatedResolverDocumentId({
        manifestId: String(resolver.manifestId ?? ''),
        groupId: String(resolver.groupId ?? ''),
        refId: String(resolver.refId ?? ''),
        featureId,
      }, 'spell'),
      type: 'spell',
      name: candidate.name,
      identifier: candidate.identifier,
      rules: candidate.rules,
      sourceBook: candidate.sourceBook,
      level: candidate.level,
      school: candidate.school,
      compendiumSource: candidate.uuid,
      cachedFor: `.Item.${featureId}.Activity.${activityId}`,
      resolver: { ...resolver, documentType: 'spell' },
    })],
  };
}

function projectActivity(feature: any, source: Record<string, any>): Record<string, unknown> {
  const fields = ['type', 'name', 'activation', 'consumption', 'description', 'duration', 'range', 'target', 'uses', 'ability', 'attack', 'save', 'spell'];
  const projected: Record<string, unknown> = { id: source._id, featureId: documentId(feature) };
  for (const field of fields) if (source[field] !== undefined) projected[field] = structuredClone(source[field]);
  if (isRecord(projected.uses)) delete projected.uses.spent;
  if (isRecord(source.flags?.[RESOLVER_MODULE_ID])) {
    const resolver = structuredClone(source.flags[RESOLVER_MODULE_ID]);
    delete resolver.generatedContentHash;
    delete resolver.transactionId;
    projected.resolver = resolver;
  }
  return compactRecord(projected);
}

function projectCachedSpell(source: Record<string, any>): Record<string, unknown> {
  const system = isRecord(source.system) ? source.system : {};
  const sourceMetadata = isRecord(system.source) ? system.source : {};
  const resolver = isRecord(source.flags?.[RESOLVER_MODULE_ID]) ? structuredClone(source.flags[RESOLVER_MODULE_ID]) : undefined;
  if (resolver) delete resolver.generatedContentHash;
  if (resolver) delete resolver.transactionId;
  return compactRecord({
    id: source._id,
    type: source.type,
    name: source.name,
    identifier: system.identifier,
    rules: sourceMetadata.rules,
    sourceBook: sourceMetadata.book,
    level: system.level,
    school: system.school,
    compendiumSource: source._stats?.compendiumSource,
    cachedFor: source.flags?.dnd5e?.cachedFor,
    resolver,
  });
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function sortProjectedDocuments(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return String(left.id ?? '').localeCompare(String(right.id ?? ''), 'en');
}

function hashProjectionList(projection: ManagedSpellProjection[]): string {
  return sha256(canonicalStringify([...projection].sort((left, right) => left.logicalRefKey.localeCompare(right.logicalRefKey, 'en'))));
}

function collectManagedDocuments(actor: any, manifestId: string): ManagedDocumentSet {
  const activities: ManagedDocumentSet['activities'] = [];
  const spells: ManagedDocumentSet['spells'] = [];
  for (const feature of iterate(actor?.items)) {
    for (const activity of iterateActivities(feature)) {
      const identity = readIdentity(activity?.flags?.[RESOLVER_MODULE_ID]);
      if (identity?.manifestId === manifestId && activity.flags[RESOLVER_MODULE_ID].managed === true
        && activity.flags[RESOLVER_MODULE_ID].documentType === 'activity') {
        activities.push({ feature, activity, identity });
      }
    }
  }
  for (const spell of iterate(actor?.items)) {
    const identity = readIdentity(spell?.flags?.[RESOLVER_MODULE_ID]);
    if (identity?.manifestId === manifestId && spell.flags[RESOLVER_MODULE_ID].managed === true
      && spell.flags[RESOLVER_MODULE_ID].documentType === 'spell') spells.push({ spell, identity });
  }
  activities.sort((left, right) => documentId(left.activity).localeCompare(documentId(right.activity), 'en'));
  spells.sort((left, right) => documentId(left.spell).localeCompare(documentId(right.spell), 'en'));
  return { activities, spells };
}

function readIdentity(flags: any): ResolverDocumentIdentity | undefined {
  if (!isRecord(flags)) return undefined;
  const identity = {
    manifestId: flags.manifestId,
    groupId: flags.groupId,
    refId: flags.refId,
    featureId: flags.featureId,
    logicalRefKey: flags.logicalRefKey,
    selectedUuid: flags.selectedUuid,
    activityId: flags.activityId,
  };
  return Object.values(identity).every((value) => typeof value === 'string') ? identity as ResolverDocumentIdentity : undefined;
}

function findFeatureForSelection(actor: any, manifest: PortableSpellManifest, groupId: string): any {
  const group = manifest.spellcastingGroups.find((entry) => entry.groupId === groupId);
  const features = iterate(actor?.items).filter((item) => item?.flags?.[RESOLVER_MODULE_ID]?.groupId === groupId
    && item?.flags?.[RESOLVER_MODULE_ID]?.featureItemKey === group?.featureItemKey);
  if (features.length !== 1) throw new Error('Selection group does not have exactly one linked feature.');
  return features[0];
}

function diffSnapshot(before: ManagedSnapshot, after: ManagedSnapshot): ResidualDifference[] {
  const differences: ResidualDifference[] = [];
  if (canonicalStringify(before.resolverFlags) !== canonicalStringify(after.resolverFlags)) {
    differences.push({ path: `/flags/${RESOLVER_MODULE_ID}`, before: before.resolverFlags, after: after.resolverFlags });
  }
  const beforeIds = new Set(before.itemIds);
  const afterIds = new Set(after.itemIds);
  for (const id of [...new Set([...beforeIds, ...afterIds])].sort()) {
    if (beforeIds.has(id) !== afterIds.has(id)) {
      differences.push({
        path: `/items/${id}`,
        ...(beforeIds.has(id) ? { before: 'present' } : {}),
        ...(afterIds.has(id) ? { after: 'present' } : {}),
      });
    }
  }
  diffSources('activities', before.activities.map((entry) => ({ ...entry.source, __featureId: entry.featureId })), after.activities.map((entry) => ({ ...entry.source, __featureId: entry.featureId })), differences);
  diffSources('spells', before.spells, after.spells, differences);
  return differences;
}

function diffSources(kind: string, before: Record<string, any>[], after: Record<string, any>[], output: ResidualDifference[]): void {
  const beforeById = new Map(before.map((entry) => [String(entry._id), entry]));
  const afterById = new Map(after.map((entry) => [String(entry._id), entry]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  for (const id of [...ids].sort()) {
    const left = beforeById.get(id);
    const right = afterById.get(id);
    if (canonicalStringify(left) !== canonicalStringify(right)) {
      output.push({ path: `/managed/${kind}/${id}`, ...(left === undefined ? {} : { before: left }), ...(right === undefined ? {} : { after: right }) });
    }
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

async function withActorMutex<T>(actor: object, operation: () => Promise<T>): Promise<T> {
  const prior = actorLocks.get(actor) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  actorLocks.set(actor, prior.catch(() => undefined).then(() => gate));
  await prior.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

function nextTransactionId(actor: any, planHash: string): string {
  transactionSequence += 1;
  return sha256(JSON.stringify([documentId(actor), planHash, transactionSequence, Date.now()])).slice(0, 16);
}

async function safeRollback(operation: () => void | Promise<void>, errors: string[]): Promise<void> {
  try { await operation(); } catch (error) { errors.push(errorMessage(error)); }
}

function findItem(actor: any, id: string): any {
  if (actor?.items && typeof actor.items.get === 'function') return actor.items.get(id);
  return iterate(actor?.items).find((item) => documentId(item) === id);
}

function getActivity(feature: any, id: string): any {
  const activities = feature?.system?.activities;
  if (activities && typeof activities.get === 'function') return activities.get(id);
  return activities?.[id];
}

function iterateActivities(feature: any): any[] {
  const activities = feature?.system?.activities;
  if (activities instanceof Map) return [...activities.values()];
  if (activities && typeof activities.values === 'function') return [...activities.values()];
  return isRecord(activities) ? Object.values(activities) : [];
}

function iterate(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value[Symbol.iterator] === 'function') return [...value];
  return [];
}

function requireApi(actor: any, key: 'update' | 'updateEmbeddedDocuments' | 'createEmbeddedDocuments' | 'deleteEmbeddedDocuments') {
  if (typeof actor?.[key] !== 'function') throw new TypeError(`Actor public ${key} API is unavailable.`);
  return actor[key].bind(actor);
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function sortSources(left: Record<string, any>, right: Record<string, any>): number {
  return String(left._id).localeCompare(String(right._id), 'en');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
