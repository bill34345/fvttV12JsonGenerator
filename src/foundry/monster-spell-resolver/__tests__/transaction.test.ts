import { describe, expect, test } from 'bun:test';
import {
  hashManagedProjection,
  logicalSpellRefKey,
  planSpellHydration,
  RESOLVER_MODULE_ID,
  sha256,
  type PortableSpellManifest,
  type SpellCandidateMetadata,
  type SpellHydrationPlan,
} from '../../../core/spell-resolution';
import { generatedResolverDocumentId } from '../cast-activity';
import { createResolverActorService } from '../hooks';
import {
  executeHydrationTransaction,
  projectCurrentManagedContent,
  HydrationTransactionError,
  type HydrationFailureStage,
} from '../transaction';

// Foundry 14.364 common/abstract/document.mjs 863-905 is the public Actor
// create/update/delete embedded-document contract. dnd5e.mjs 23830-23835 is
// the public feature.deleteActivity(id) boundary; v14 uses _del internally, so
// resolver code must not guess/depend on the deprecated "-=" object-key form.

function manifest(): PortableSpellManifest {
  const refs = [
    { refId: 'light-ref', identifier: 'light', originalName: 'Light', uuid: 'aaaaaaaaaaaaaaaa' },
    { refId: 'darkness-ref', identifier: 'darkness', originalName: 'Darkness', uuid: 'bbbbbbbbbbbbbbbb' },
  ];
  return {
    schemaVersion: 1, manifestId: 'transaction-manifest', sourceSha256: 'c'.repeat(64), rulesPreference: '2024',
    spellcastingGroups: [{
      groupId: 'innate-cha', featureItemKey: 'innate-feature', ability: 'cha', saveDc: 12, attackBonus: 4,
      spellRefs: refs.map((ref, index) => ({
        refId: ref.refId, identifier: ref.identifier, originalName: ref.originalName, englishName: ref.originalName,
        aliases: [], method: index === 0 ? 'at-will' : 'innate',
        ...(index === 0 ? {} : { uses: { value: 1, recovery: 'day' as const, shared: false } }),
        ignoresMaterialComponents: true, restrictions: [], evidence: [{ start: index * 10, end: index * 10 + ref.originalName.length, quote: ref.originalName }],
      })),
    }],
  };
}

function readyPlan(
  actor?: TransactionActor,
  decision?: 'keep' | 'overwrite',
  lightId = 'aaaaaaaaaaaaaaaa',
): SpellHydrationPlan {
  const candidates: SpellCandidateMetadata[] = [
    { id: lightId, uuid: `Compendium.dnd5e.spells24.Item.${lightId}`, packageId: 'dnd5e', packId: 'spells24', name: 'Light', identifier: 'light', rules: '2024' },
    { id: 'bbbbbbbbbbbbbbbb', uuid: 'Compendium.dnd5e.spells24.Item.bbbbbbbbbbbbbbbb', packageId: 'dnd5e', packId: 'spells24', name: 'Darkness', identifier: 'darkness', rules: '2024' },
  ];
  const currentManagedProjection = actor ? projectCurrentManagedContent(actor, manifest().manifestId) : [];
  const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
  const result = planSpellHydration({
    manifest: manifest(), candidates, sourceInventoryHash: (lightId === 'aaaaaaaaaaaaaaaa' ? 'd' : 'e').repeat(64),
    currentManagedProjection: currentManagedProjection.map((entry) => entry.logicalRefKey === lightKey && decision
      ? { ...entry, manualConflict: true }
      : entry),
    manualDecisions: decision ? [{ logicalRefKey: lightKey, decision }] : [],
  });
  if (result.status !== 'ready') throw new Error(`Fixture plan was not ready: ${result.status}`);
  return result.plan;
}

describe('Actor-local atomic hydration transaction', () => {
  test.each([[false], [true]] as const)('commits atomically with native auto-cache=%s, serializes, and use spending is a no-op', async (autoCache) => {
    const actor = new TransactionActor(autoCache);
    const foreignBefore = actor.foreignProjection();
    const plan = readyPlan();
    const [first, second] = await Promise.all([
      executeHydrationTransaction({ actor, manifest: manifest(), plan }),
      executeHydrationTransaction({ actor, manifest: manifest(), plan }),
    ]);

    expect([first.status, second.status].sort()).toEqual(['committed', 'noop']);
    expect(actor.maxConcurrentMutations).toBe(1);
    expect(actor.items.filter((item) => item.type === 'spell')).toHaveLength(2);
    expect(actor.managedActivities()).toHaveLength(2);
    expect(actor.foreignProjection()).toEqual(foreignBefore);
    const resolution = actor.flags[RESOLVER_MODULE_ID].spellResolution;
    expect(resolution).toMatchObject({
      status: 'hydrated', planHash: plan.planHash, manifestHash: plan.manifestHash,
      resolutionConfigHash: plan.resolutionConfigHash,
      report: { selections: plan.selections.map((entry) => expect.objectContaining({
        logicalRefKey: entry.logicalRefKey, selectedUuid: entry.uuid, rules: entry.rules, selectionOrigin: entry.selectionOrigin,
      })) },
    });
    expect(resolution.undoSnapshot).toBeDefined();
    expect(resolution.generatedProjection).toHaveLength(2);
    expect(resolution.generatedProjection.every((entry: any) => entry.activities.length === 1 && entry.cachedSpells.length === 1)).toBe(true);
    expect(resolution.generatedProjection.map((entry: any) => entry.logicalRefKey)).toEqual(
      [...plan.selections.map((entry) => entry.logicalRefKey)].sort(),
    );
    expect(JSON.stringify(resolution.generatedProjection)).not.toMatch(/description\.value|effects|preparedSpellDefault/);
    expect(resolution.generatedProjection[0].cachedSpells[0]).toMatchObject({
      type: 'spell', compendiumSource: expect.stringContaining('Compendium.dnd5e.spells24.Item.'),
      resolver: { managed: true, documentType: 'spell' },
    });
    expect(Array.isArray(resolution.report.literalRestrictions)).toBe(true);

    const daily = actor.managedActivities().find((activity) => activity.uses?.max === '1')!;
    daily.uses.spent = 1;
    const dailyCache = actor.items.find((item) => item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey
      === daily.flags[RESOLVER_MODULE_ID].logicalRefKey && item.type === 'spell')!;
    dailyCache.system.uses.spent = 1;
    const callCount = actor.calls.length;
    const noop = await executeHydrationTransaction({ actor, manifest: manifest(), plan });
    expect(noop.status).toBe('noop');
    expect(actor.calls).toHaveLength(callCount);
    expect(daily.uses.spent).toBe(1);
    expect(dailyCache.system.uses.spent).toBe(1);
    expect(actor.items.filter((item) => item.type === 'spell')).toHaveLength(2);
  });

  test('replaces the single undo snapshot on a second commit without nesting prior history', async () => {
    const actor = new TransactionActor();
    const first = await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    expect(first.status).toBe('committed');

    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    activity.description = { chatFlavor: 'second commit' };
    const second = await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(actor, 'overwrite') });
    expect(second.status).toBe('committed');

    const serializedFlags = JSON.stringify(actor.flags[RESOLVER_MODULE_ID]);
    expect(serializedFlags.match(/\"undoSnapshot\"/g)).toHaveLength(1);
    expect(actor.flags[RESOLVER_MODULE_ID].spellResolution.undoSnapshot.resolverFlags?.spellResolution?.undoSnapshot).toBeUndefined();
  });

  test('restores the exact prior resolver namespace when a second commit fails', async () => {
    const actor = new TransactionActor();
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    activity.description = { chatFlavor: 'preserve on failed re-resolution' };
    const plan = readyPlan(actor, 'overwrite');
    const before = actor.fullProjection();
    const resolverFlagsBefore = structuredClone(actor.flags[RESOLVER_MODULE_ID]);

    await expect(executeHydrationTransaction({
      actor, manifest: manifest(), plan,
      failureInjector(stage) { if (stage === 'after-feature-update') throw new Error('second commit failed'); },
    })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });
    expect(actor.fullProjection()).toEqual(before);
    expect(actor.flags[RESOLVER_MODULE_ID]).toEqual(resolverFlagsBefore);
  });

  test.each([[false], [true]] as const)(
    'overwrites destination UUID A to B by deleting the old cache and leaving one new cache with native auto-cache=%s',
    async (autoCache) => {
      const actor = new TransactionActor(autoCache);
      await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
      const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
      const oldCache = actor.items.find((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
      const destinationB = 'cccccccccccccccc';
      const callStart = actor.calls.length;

      const result = await executeHydrationTransaction({
        actor,
        manifest: manifest(),
        plan: readyPlan(actor, 'overwrite', destinationB),
      });

      expect(result.status).toBe('committed');
      const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
      const caches = actor.items.filter((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey);
      expect(activity.spell.uuid).toBe(`Compendium.dnd5e.spells24.Item.${destinationB}`);
      expect(activity.flags[RESOLVER_MODULE_ID].selectedUuid).toBe(activity.spell.uuid);
      expect(caches).toHaveLength(1);
      expect(caches[0]!._stats.compendiumSource).toBe(activity.spell.uuid);
      expect(caches[0]!.flags[RESOLVER_MODULE_ID].selectedUuid).toBe(activity.spell.uuid);
      expect(actor.items.includes(oldCache)).toBe(false);
      expect(caches[0]).not.toBe(oldCache);
      const reResolveCalls = actor.calls.slice(callStart);
      const createdDestinationB = reResolveCalls.some((call: any) => call[0] === 'createEmbeddedDocuments'
        && call[2].includes(`Compendium.dnd5e.spells24.Item.${destinationB}`));
      if (autoCache) {
        expect(reResolveCalls).toContainEqual(['nativeDeleteCachedSpell', oldCache.id]);
        expect(createdDestinationB).toBe(false);
      } else {
        expect(reResolveCalls).toContainEqual(['deleteEmbeddedDocuments', 'Item', [oldCache.id]]);
        expect(createdDestinationB).toBe(true);
      }
    },
  );

  test.each([[false], [true]] as const)(
    'restores UUID A and its single cache when A to B overwrite fails with native auto-cache=%s',
    async (autoCache) => {
      const actor = new TransactionActor(autoCache);
      await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
      const before = actor.fullProjection();
      const rawItemsBefore = actor.rawItemProjection();
      let injected = false;

      await expect(executeHydrationTransaction({
        actor,
        manifest: manifest(),
        plan: readyPlan(actor, 'overwrite', 'cccccccccccccccc'),
        failureInjector(stage) {
          if (stage !== 'after-partial-cache-creation') return;
          injected = true;
          throw new Error('A to B failed');
        },
      })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });

      expect(injected).toBe(true);
      expect(actor.fullProjection()).toEqual(before);
      expect(actor.rawItemProjection()).toEqual(rawItemsBefore);
      const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
      const caches = actor.items.filter((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey);
      expect(caches).toHaveLength(1);
      expect(caches[0]!._stats.compendiumSource).toBe('Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa');
    },
  );

  test.each(([
    'after-feature-update', 'after-partial-cache-creation', 'during-cleanup',
  ] as HydrationFailureStage[]).flatMap((stage) => [[stage, false], [stage, true]] as const))(
    'compensates the complete Actor after injected failure at %s with native auto-cache=%s', async (stage, autoCache) => {
    const actor = new TransactionActor(autoCache);
    if (stage === 'during-cleanup') actor.installStaleManagedPair();
    const before = actor.fullProjection();
    const rawItemsBefore = actor.rawItemProjection();
    const foreignBefore = actor.foreignProjection();
    await expect(executeHydrationTransaction({
      actor, manifest: manifest(), plan: readyPlan(actor),
      failureInjector: (current) => { if (current === stage) throw new Error(`injected ${stage}`); },
    })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });
    expect(actor.fullProjection()).toEqual(before);
    expect(actor.rawItemProjection()).toEqual(rawItemsBefore);
    expect(actor.foreignProjection()).toEqual(foreignBefore);
  });

  test('reports exact residual differences when rollback cannot fully restore', async () => {
    const actor = new TransactionActor(true);
    actor.installStaleManagedPair();
    let originalFailureSeen = false;
    try {
      await executeHydrationTransaction({
        actor, manifest: manifest(), plan: readyPlan(actor),
        failureInjector(stage) {
          if (stage === 'during-cleanup') {
            originalFailureSeen = true;
            throw new Error('cleanup failed');
          }
          if (stage === 'during-rollback') actor.failSnapshotRecreate = true;
        },
      });
      throw new Error('Expected transaction failure.');
    } catch (error) {
      expect(originalFailureSeen).toBe(true);
      expect(error).toBeInstanceOf(HydrationTransactionError);
      const transactionError = error as HydrationTransactionError;
      expect(transactionError.rollbackSucceeded).toBe(false);
      expect(transactionError.residualDifferences.length).toBeGreaterThan(0);
      expect(transactionError.residualDifferences.every((entry) => entry.path.startsWith('/managed/')
        || entry.path.startsWith('/flags/') || entry.path.startsWith('/items/'))).toBe(true);
      expect(transactionError.message).toContain('cleanup failed');
    }
  });

  test('does not use name matching and leaves foreign items, activities, effects, flags, and feature data deep-equal', async () => {
    const actor = new TransactionActor();
    actor.items.push({
      id: 'ForeignSpell0001', _id: 'ForeignSpell0001', type: 'spell', name: 'Light', parent: actor, actor,
      flags: { foreign: { keep: true } }, effects: [{ _id: 'ForeignEffect001', keep: true }], system: { uses: { spent: 7 } },
    });
    const before = actor.foreignProjection();
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    expect(actor.foreignProjection()).toEqual(before);
  });

  test.each(['keep', 'overwrite'] as const)('executes explicit %s semantics for managed structural drift', async (decision) => {
    const actor = new TransactionActor();
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const priorGenerated = structuredClone(actor.flags[RESOLVER_MODULE_ID].spellResolution.generatedProjection
      .find((entry: any) => entry.logicalRefKey === lightKey));
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const cache = actor.items.find((item) => item.flags?.[RESOLVER_MODULE_ID]?.documentType === 'spell'
      && item.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    activity.spell.challenge.attack = '9';
    activity.description = { chatFlavor: 'manual activity field' };
    cache.system.manualField = { keep: true };
    activity.flags.foreign = { nested: { activity: true } };
    activity.flags.dnd5e = { runtimeOnly: { activity: true } };
    cache.flags.foreign = { nested: { cache: true } };
    cache.flags.dnd5e.runtimeOnly = { cache: true };
    const foreignFlags = {
      activity: structuredClone({ foreign: activity.flags.foreign, dnd5e: activity.flags.dnd5e }),
      cache: structuredClone({ foreign: cache.flags.foreign, runtimeOnly: cache.flags.dnd5e.runtimeOnly }),
    };

    const result = await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(actor, decision) });
    expect(result.status).toBe('committed');
    const keptActivity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const keptCache = actor.items.find((item) => item.flags?.[RESOLVER_MODULE_ID]?.documentType === 'spell'
      && item.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const committedGenerated = actor.flags[RESOLVER_MODULE_ID].spellResolution.generatedProjection
      .find((entry: any) => entry.logicalRefKey === lightKey);
    expect({ foreign: keptActivity.flags.foreign, dnd5e: keptActivity.flags.dnd5e }).toEqual(foreignFlags.activity);
    expect({ foreign: keptCache.flags.foreign, runtimeOnly: keptCache.flags.dnd5e.runtimeOnly }).toEqual(foreignFlags.cache);
    if (decision === 'keep') {
      expect(keptActivity.spell.challenge.attack).toBe('9');
      expect(keptActivity.description).toEqual({ chatFlavor: 'manual activity field' });
      expect(keptCache.system.manualField).toEqual({ keep: true });
      expect(keptActivity.flags[RESOLVER_MODULE_ID].protected).toBe(true);
      expect(keptCache.flags[RESOLVER_MODULE_ID].protected).toBe(true);
      expect(committedGenerated).toEqual(priorGenerated);
      expect(committedGenerated.activities[0].spell.challenge.attack).toBe('4');
    } else {
      expect(keptActivity.spell.challenge.attack).toBe('4');
      expect(keptActivity.description).toBeUndefined();
      expect(keptCache.system.manualField).toBeUndefined();
      expect(keptActivity.flags[RESOLVER_MODULE_ID].protected).toBeUndefined();
      expect(keptCache.flags[RESOLVER_MODULE_ID].protected).toBeUndefined();
      expect(committedGenerated.activities[0].spell.challenge.attack).toBe('4');
    }
  });

  test('Keep without a prior generated baseline leaves Last generated unavailable', async () => {
    const actor = new TransactionActor();
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    delete actor.flags[RESOLVER_MODULE_ID].spellResolution.generatedProjection;
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    activity.spell.challenge.attack = '9';

    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(actor, 'keep') });
    const generated = actor.flags[RESOLVER_MODULE_ID].spellResolution.generatedProjection;
    expect(generated.some((entry: any) => entry.logicalRefKey === lightKey)).toBe(false);
    expect(activity.spell.challenge.attack).toBe('9');
  });

  test('Overwrite after Keep is the only transaction path that clears protection and restores deterministic content', async () => {
    const actor = new TransactionActor();
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    activity.spell.challenge.attack = '9';
    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(actor, 'keep') });
    const keptActivity = actor.managedActivities()
      .find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    expect(keptActivity.flags[RESOLVER_MODULE_ID].protected).toBe(true);
    expect(keptActivity.spell.challenge.attack).toBe('9');

    await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan(actor, 'overwrite') });
    const overwrittenActivity = actor.managedActivities()
      .find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const overwrittenCache = actor.items.find((item) => item.type === 'spell'
      && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
    expect(overwrittenActivity.spell.challenge.attack).toBe('4');
    expect(overwrittenActivity.flags[RESOLVER_MODULE_ID].protected).toBeUndefined();
    expect(overwrittenCache.flags[RESOLVER_MODULE_ID].protected).toBeUndefined();
  });

  test.each([[false], [true]] as const)(
    'Keep restores the exact manual cached Spell after both dnd5e Activity lifecycle writes with native auto-cache=%s',
    async (autoCache) => {
      const actor = new TransactionActor(autoCache);
      await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
      const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
      const cache = actor.items.find((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
      const enchantment = cache.effects.find((effect: any) => effect._id === 'dnd5espellchang')!;
      enchantment.changes = [{ key: 'flags.user.manual', mode: 5, value: 'keep-me', priority: 42 }];
      cache.effects.push({
        _id: 'UserEffect000001', name: 'Manual effect', transfer: false,
        changes: [{ key: 'system.bonuses.mwak.attack', mode: 2, value: '+1', priority: 20 }],
        flags: { foreign: { nested: true } },
      });
      cache.system.manualField = { nested: { keep: true } };
      cache.flags.foreign = { nested: { cache: true } };
      cache.flags.dnd5e.runtimeOnly = { nested: true };
      const before = keptCacheProjection(cache);
      const callStart = actor.calls.length;

      const result = await executeHydrationTransaction({
        actor,
        manifest: manifest(),
        plan: readyPlan(actor, 'keep'),
      });

      expect(result.status).toBe('committed');
      const caches = actor.items.filter((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey);
      expect(caches).toHaveLength(1);
      expect(keptCacheProjection(caches[0])).toEqual(before);
      expect(caches[0]!.flags[RESOLVER_MODULE_ID].protected).toBe(true);
      expect(actor.calls.slice(callStart).filter((call: any) => call[0] === 'nativeRefreshCachedEnchantment'
        && call[1] === cache.id)).toHaveLength(2);
    },
  );

  test.each([[false], [true]] as const)(
    'Keep has restored manual cached Spell content before a later failure and rollback with native auto-cache=%s',
    async (autoCache) => {
      const actor = new TransactionActor(autoCache);
      await executeHydrationTransaction({ actor, manifest: manifest(), plan: readyPlan() });
      const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
      const cache = actor.items.find((item) => item.type === 'spell'
        && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
      cache.effects.find((effect: any) => effect._id === 'dnd5espellchang')!.changes = [
        { key: 'flags.user.rollback', mode: 5, value: 'keep-me', priority: 41 },
      ];
      cache.effects.push({ _id: 'UserEffect000002', name: 'Rollback manual effect', changes: [] });
      cache.system.manualField = { rollback: { keep: true } };
      cache.flags.foreign = { rollback: { keep: true } };
      const keptBefore = keptCacheProjection(cache);
      const fullBefore = actor.fullProjection();
      const rawItemsBefore = actor.rawItemProjection();
      let restoredBeforeFailure = false;

      await expect(executeHydrationTransaction({
        actor,
        manifest: manifest(),
        plan: readyPlan(actor, 'keep'),
        failureInjector(stage) {
          if (stage !== 'after-partial-cache-creation') return;
          const current = actor.items.find((item) => item.type === 'spell'
            && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
          restoredBeforeFailure = JSON.stringify(keptCacheProjection(current)) === JSON.stringify(keptBefore);
          throw new Error('fail after kept cache restoration');
        },
      })).rejects.toMatchObject({ rollbackSucceeded: true, residualDifferences: [] });

      expect(restoredBeforeFailure).toBe(true);
      expect(actor.fullProjection()).toEqual(fullBefore);
      expect(actor.rawItemProjection()).toEqual(rawItemsBefore);
    },
  );

  test('validates complete unique manifest selections before the first Actor write', async () => {
    for (const mutate of [
      (plan: SpellHydrationPlan) => { plan.selections.pop(); },
      (plan: SpellHydrationPlan) => { plan.selections.push(structuredClone(plan.selections[0]!)); },
    ]) {
      const actor = new TransactionActor();
      const plan = structuredClone(readyPlan());
      mutate(plan);
      plan.planHash = sha256(canonicalPlan(plan));
      await expect(executeHydrationTransaction({ actor, manifest: manifest(), plan })).rejects.toThrow(/every manifest ref|duplicate/i);
      expect(actor.calls).toEqual([]);
    }
  });

  test('reports an unowned post-snapshot Item as an exact residual instead of deleting or overlooking it', async () => {
    const actor = new TransactionActor();
    try {
      await executeHydrationTransaction({
        actor, manifest: manifest(), plan: readyPlan(),
        failureInjector(stage) {
          if (stage !== 'after-feature-update') return;
          actor.items.push({
            id: 'UnownedCache0001', _id: 'UnownedCache0001', type: 'spell', parent: actor, actor,
            flags: { dnd5e: { cachedFor: '.hostile' } }, system: {}, effects: [],
          });
          throw new Error('hostile post-snapshot cache');
        },
      });
      throw new Error('Expected residual failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(HydrationTransactionError);
      const transactionError = error as HydrationTransactionError;
      expect(transactionError.rollbackSucceeded).toBe(false);
      expect(transactionError.residualDifferences).toContainEqual(expect.objectContaining({ path: '/items/UnownedCache0001' }));
      expect(actor.items.some((item) => item.id === 'UnownedCache0001')).toBe(true);
    }
  });

  test('service Overwrite rebuilds a wholly deleted persisted pair through the real transaction', async () => {
    const actor = new TransactionActor();
    const candidates: SpellCandidateMetadata[] = [
      {
        id: 'aaaaaaaaaaaaaaaa', uuid: 'Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa',
        packageId: 'dnd5e', packId: 'spells24', name: 'Light', identifier: 'light', rules: '2024',
      },
      {
        id: 'bbbbbbbbbbbbbbbb', uuid: 'Compendium.dnd5e.spells24.Item.bbbbbbbbbbbbbbbb',
        packageId: 'dnd5e', packId: 'spells24', name: 'Darkness', identifier: 'darkness', rules: '2024',
      },
    ];
    const runtime: any = {
      moduleId: RESOLVER_MODULE_ID,
      compatibility: { supported: true, foundry: '14.364', dnd5e: '5.3.3', diagnostics: [] },
      canMutate: true,
      diagnostics: [],
      sourceIndex: {
        candidates,
        sourcePackages: [{ packageId: 'dnd5e', version: '5.3.3' }],
        diagnostics: [],
        candidateMetadataHash: 'b'.repeat(64),
        sourceInventoryHash: 'd'.repeat(64),
      },
    };
    const reviews: any[] = [];
    const notifications: any[] = [];
    const service = createResolverActorService({
      getRuntime: () => runtime,
      getSetting: (key) => key === 'sourcePriority' ? [{ packageId: 'dnd5e', packId: 'spells24' }] : {},
      setSetting: async () => {},
      fetchSelectedDocument: async (uuid) => {
        const candidate = candidates.find((entry) => entry.uuid === uuid)!;
        return {
          documentName: 'Item', type: 'spell', uuid, name: candidate.name,
          system: { identifier: candidate.identifier, source: { rules: candidate.rules } },
        };
      },
      execute: (target, targetManifest, plan) => executeHydrationTransaction({ actor: target, manifest: targetManifest, plan }),
      openReview: async (model) => {
        reviews.push(model);
        const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
        expect(model.spells.find((spell) => spell.logicalRefKey === lightKey)).toMatchObject({
          manualConflict: { keepable: false, explanation: expect.any(String) },
          candidateDecisionRequired: false,
          blocking: true,
        });
        return reviews.length === 1
          ? { action: 'cancel' }
          : { action: 'apply', manualDecisions: [{ logicalRefKey: lightKey, decision: 'overwrite' }], candidateSelections: [] };
      },
      renderTemplate: async (_path, context) => String(context.content ?? ''),
      showDocument: async () => {},
      exportJson: () => {},
      notify: (...args) => notifications.push(args),
    });

    // Pending with no managed documents must remain the ordinary automatic path.
    await service.processActor(actor);
    expect(reviews).toHaveLength(0);
    expect(actor.flags[RESOLVER_MODULE_ID].spellResolution.status).toBe('hydrated');
    runtime.sourceIndex.sourceInventoryHash = actor.flags[RESOLVER_MODULE_ID].spellResolution.report.sourceInventoryHash;
    runtime.sourceIndex.candidateMetadataHash = actor.flags[RESOLVER_MODULE_ID].spellResolution.report.candidateMetadataHash;

    const lightKey = logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref');
    const activity = actor.managedActivities().find((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)!;
    const cache = actor.items.find((item) => item.type === 'spell'
      && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)!;
    const feature = actor.items[0]!;
    await feature.deleteActivity(activity.id);
    await actor.deleteEmbeddedDocuments('Item', [cache.id]);
    const cancelCallCount = actor.calls.length;

    expect(service.status(actor)).toBe('needs_review');
    await service.resolve(actor);
    expect(reviews).toHaveLength(1);
    expect(actor.calls).toHaveLength(cancelCallCount);
    expect(service.status(actor)).toBe('needs_review');

    await service.resolve(actor);
    expect(reviews).toHaveLength(2);
    expect(actor.flags[RESOLVER_MODULE_ID].spellResolution.status).toBe('hydrated');
    expect(service.isAlreadyApplied(actor)).toBe(true);
    expect(actor.managedActivities().filter((entry) => entry.flags[RESOLVER_MODULE_ID].logicalRefKey === lightKey)).toHaveLength(1);
    expect(actor.items.filter((item) => item.type === 'spell'
      && item.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === lightKey)).toHaveLength(1);
    expect(notifications.some(([level]) => level === 'error')).toBe(false);
  });
});

class TransactionActor {
  readonly id = 'ActorTransact001';
  readonly documentName = 'Actor';
  readonly type = 'npc';
  readonly calls: unknown[][] = [];
  flags: Record<string, any> = { [RESOLVER_MODULE_ID]: { spellManifest: manifest(), spellResolution: { status: 'pending', manifestHash: readyPlan().manifestHash } }, foreign: { keep: { nested: true } } };
  items: any[];
  sourcedItems = new Map<string, any[]>();
  maxConcurrentMutations = 0;
  failSnapshotRecreate = false;
  private activeMutations = 0;
  private nativeCacheSequence = 0;

  constructor(private readonly autoCache = false) {
    const feature: any = {
      id: 'FeatureTransact1', _id: 'FeatureTransact1', type: 'feat', parent: this, actor: this, name: 'Same Display Name',
      flags: { [RESOLVER_MODULE_ID]: { featureItemKey: 'innate-feature', groupId: 'innate-cha' }, foreign: { feature: true } },
      system: { identifier: 'innate-feature', activities: new Map(), untouched: { deep: true } },
    };
    feature.system.parent = feature;
    feature.deleteActivity = async (id: string) => {
      this.calls.push(['deleteActivity', id]);
      feature.system.activities.delete(id);
      return feature;
    };
    this.items = [feature, {
      id: 'ForeignItem00001', _id: 'ForeignItem00001', type: 'feat', name: 'Same Display Name', parent: this, actor: this,
      flags: { foreign: { keep: true } }, system: { activities: new Map([['ForeignAct000001', { id: 'ForeignAct000001', type: 'cast', keep: true }]]) },
      effects: [{ _id: 'ForeignEffect001', keep: true }],
    }];
  }

  async updateEmbeddedDocuments(name: string, updates: any[]) {
    await this.withMutation(async () => {
      this.calls.push(['updateEmbeddedDocuments', name, structuredClone(updates)]);
      for (const update of updates) {
        const item = this.items.find((entry) => entry.id === update._id);
        if (!item) throw new Error(`Missing item ${update._id}`);
        const activityEntry = Object.entries(update).find(([key]) => key.startsWith('system.activities.'));
        if (activityEntry) {
          const [path, source] = activityEntry;
          const activityPath = path.slice('system.activities.'.length).split('.');
          const id = activityPath.shift()!;
          if (activityPath.join('.') === `flags.${RESOLVER_MODULE_ID}.generatedContentHash`) {
            item.system.activities.get(id).flags[RESOLVER_MODULE_ID].generatedContentHash = source;
            this.mutateCachedEnchantment(item.system.activities.get(id));
            continue;
          }
          if (activityPath.length) throw new Error(`Unsupported fake Activity update path: ${path}`);
          const previousActivity = item.system.activities.get(id);
          const previousCache = previousActivity
            ? this.items.find((entry) => entry.flags?.dnd5e?.cachedFor === previousActivity.relativeUUID)
            : undefined;
          if (this.autoCache && previousCache && previousActivity.spell.uuid !== (source as any).spell.uuid) {
            this.items = this.items.filter((entry) => entry !== previousCache);
            this.calls.push(['nativeDeleteCachedSpell', previousCache.id]);
            this.refreshSourcedItems();
          }
          const activity = this.preparedActivity(item, source as any);
          item.system.activities.set(id, activity);
          if (this.autoCache && !this.items.some((entry) => entry.flags?.dnd5e?.cachedFor === activity.relativeUUID)) {
            const native = await activity.getCachedSpellData();
            native._id = this.nextNativeCacheId();
            native.system.preparedSpellDefault = 'dnd5e-normalized';
            this.items.push({ ...native, id: native._id, parent: this, actor: this });
            this.refreshSourcedItems();
          }
          this.mutateCachedEnchantment(activity);
        }
        const resolverFlags = update[`flags.${RESOLVER_MODULE_ID}`];
        if (resolverFlags) item.flags[RESOLVER_MODULE_ID] = structuredClone(resolverFlags);
        const preparedHash = update[`flags.${RESOLVER_MODULE_ID}.generatedContentHash`];
        if (preparedHash) item.flags[RESOLVER_MODULE_ID].generatedContentHash = preparedHash;
        const fullItemKeys = Object.keys(update).filter((key) => key !== '_id'
          && !key.startsWith('system.activities.') && !key.startsWith('flags.'));
        if (fullItemKeys.length) {
          for (const [key, value] of Object.entries(update)) {
            if (key === '_id' || key.startsWith('system.activities.') || key.startsWith('flags.')) continue;
            item[key] = structuredClone(value);
          }
          if (Object.prototype.hasOwnProperty.call(update, 'flags')) item.flags = structuredClone(update.flags);
          this.refreshSourcedItems();
        }
      }
    });
    return updates;
  }

  async createEmbeddedDocuments(name: string, sources: any[], operation: any = {}) {
    await this.withMutation(async () => {
      this.calls.push(['createEmbeddedDocuments', name, sources.map((source) => source._stats?.compendiumSource), operation]);
      if (this.failSnapshotRecreate && operation.keepId === true) throw new Error('snapshot recreate failed');
      for (const source of sources) this.items.push({
        ...structuredClone(source),
        id: source._id,
        parent: this,
        actor: this,
        ...(source.type === 'spell' ? {
          system: { ...structuredClone(source.system), preparedSpellDefault: 'dnd5e-normalized' },
        } : {}),
      });
      this.refreshSourcedItems();
    });
    return sources.map((source) => this.items.find((item) => item.id === source._id));
  }

  async deleteEmbeddedDocuments(name: string, ids: string[]) {
    await this.withMutation(async () => {
      this.calls.push(['deleteEmbeddedDocuments', name, [...ids]]);
      this.items = this.items.filter((item) => !ids.includes(item.id));
      this.refreshSourcedItems();
    });
    return [];
  }

  async update(change: Record<string, any>) {
    await this.withMutation(async () => {
      this.calls.push(['update', structuredClone(change)]);
      const resolution = change[`flags.${RESOLVER_MODULE_ID}.spellResolution`];
      if (resolution !== undefined) this.flags[RESOLVER_MODULE_ID].spellResolution = structuredClone(resolution);
      const resolver = change[`flags.${RESOLVER_MODULE_ID}`];
      if (resolver !== undefined) this.flags[RESOLVER_MODULE_ID] = structuredClone(resolver);
    });
    return this;
  }

  managedActivities() {
    return [...this.items[0]!.system.activities.values()].filter((activity: any) => activity.flags?.[RESOLVER_MODULE_ID]?.managed);
  }

  installStaleManagedPair() {
    const feature = this.items[0]!;
    const identity = {
      manifestId: 'transaction-manifest', groupId: 'innate-cha', refId: 'light-ref', featureId: feature.id,
      logicalRefKey: logicalSpellRefKey('transaction-manifest', 'innate-cha', 'light-ref'),
      selectedUuid: 'Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa', activityId: 'StaleActivity001',
    };
    const activity = this.preparedActivity(feature, {
      _id: identity.activityId, type: 'cast', name: 'Stale', spell: { uuid: identity.selectedUuid },
      flags: { [RESOLVER_MODULE_ID]: { managed: true, documentType: 'activity', ...identity } },
      consumption: { spellSlot: false, targets: [] },
    });
    activity.flags[RESOLVER_MODULE_ID].generatedContentHash = hashManagedProjection(activitySource(activity));
    feature.system.activities.set(activity.id, activity);
    const cache = {
      _id: 'StaleCache000001', id: 'StaleCache000001', type: 'spell', parent: this, actor: this,
      system: { preparedSpellDefault: 'dnd5e-normalized' }, effects: [], _stats: { compendiumSource: identity.selectedUuid },
      flags: { dnd5e: { cachedFor: activity.relativeUUID }, [RESOLVER_MODULE_ID]: { managed: true, documentType: 'spell', ...identity } },
    } as any;
    cache.flags[RESOLVER_MODULE_ID].generatedContentHash = hashManagedProjection(activitySource(cache));
    this.items.push(cache);
    this.refreshSourcedItems();
  }

  fullProjection() {
    return structuredClone({
      resolver: this.flags[RESOLVER_MODULE_ID],
      activities: this.managedActivities().map((activity: any) => activitySource(activity)).sort(sortById),
      spells: this.items.filter((item) => item.type === 'spell' && item.flags?.[RESOLVER_MODULE_ID]?.managed).map(activitySource).sort(sortById),
    });
  }

  foreignProjection() {
    return structuredClone({
      actorFlags: this.flags.foreign,
      featureForeign: this.items[0]!.flags.foreign,
      featureUntouched: this.items[0]!.system.untouched,
      foreignItems: this.items.filter((item) => !item.flags?.[RESOLVER_MODULE_ID]?.managed && item.id !== 'FeatureTransact1').map(activitySource),
    });
  }

  rawItemProjection() {
    return this.items.map(activitySource).sort(sortById);
  }

  private preparedActivity(feature: any, source: any) {
    const actor = this;
    const activity: any = {
      ...structuredClone(source),
      activation: source.activation ?? { type: '', value: null, condition: '' },
      id: source._id, parent: feature.system,
      relativeUUID: `.Item.${feature.id}.Activity.${source._id}`,
      async getCachedSpellData() {
        return {
          _id: generatedResolverDocumentId({
            manifestId: source.flags[RESOLVER_MODULE_ID].manifestId,
            groupId: source.flags[RESOLVER_MODULE_ID].groupId,
            refId: source.flags[RESOLVER_MODULE_ID].refId,
            featureId: feature.id,
          }, 'spell'),
          name: source.name, type: 'spell', system: { sourceItem: 'feat:innate-feature', uses: { spent: 0 } },
          effects: [{ _id: 'dnd5espellchang', type: 'enchantment', origin: activity.relativeUUID, changes: [] }],
          flags: { dnd5e: { cachedFor: activity.relativeUUID } }, _stats: { compendiumSource: source.spell.uuid },
        };
      },
    };
    Object.defineProperties(activity, {
      item: { get: () => activity.parent?.parent },
      actor: { get: () => activity.item?.parent ?? null },
    });
    Object.defineProperty(activity, 'cachedSpell', { get: () => actor.items.find((item) => item.flags?.dnd5e?.cachedFor === activity.relativeUUID) });
    return activity;
  }

  private refreshSourcedItems() {
    const map = new Map<string, any[]>();
    for (const item of this.items) {
      const uuid = item._stats?.compendiumSource;
      if (!uuid) continue;
      map.set(uuid, [...(map.get(uuid) ?? []), item]);
    }
    this.sourcedItems = map;
  }

  private mutateCachedEnchantment(activity: any) {
    const cache = this.items.find((item) => item.flags?.dnd5e?.cachedFor === activity.relativeUUID);
    const enchantment = cache?.effects?.find((effect: any) => effect._id === 'dnd5espellchang');
    if (!cache || !enchantment) return;
    enchantment.changes = [];
    this.calls.push(['nativeRefreshCachedEnchantment', cache.id]);
  }

  private nextNativeCacheId() {
    this.nativeCacheSequence += 1;
    return `NativeCache${String(this.nativeCacheSequence).padStart(5, '0')}`;
  }

  private async withMutation(operation: () => void | Promise<void>) {
    this.activeMutations++;
    this.maxConcurrentMutations = Math.max(this.maxConcurrentMutations, this.activeMutations);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      await operation();
    } finally {
      this.activeMutations--;
    }
  }
}

function activitySource(value: any): any {
  const source: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (['parent', 'actor', 'item', 'relativeUUID', 'id'].includes(key) || typeof entry === 'function') continue;
    if (key === 'system' && entry && typeof entry === 'object' && (entry as any).activities instanceof Map) {
      const system = { ...(entry as any) };
      delete system.parent;
      system.activities = Object.fromEntries([...(entry as any).activities.entries()]
        .map(([id, activity]: [string, any]) => [id, activitySource(activity)]));
      source[key] = structuredClone(system);
    } else source[key] = structuredClone(entry);
  }
  return source;
}

function keptCacheProjection(cache: any): any {
  const source = activitySource(cache);
  const resolver = source.flags?.[RESOLVER_MODULE_ID];
  if (resolver) {
    delete resolver.generatedContentHash;
    delete resolver.transactionId;
    delete resolver.protected;
  }
  return source;
}

function sortById(left: any, right: any) { return String(left._id).localeCompare(String(right._id), 'en'); }

function canonicalPlan(plan: SpellHydrationPlan): string {
  const { planHash: _ignored, ...withoutHash } = plan;
  const canonicalize = (value: any): any => Array.isArray(value)
    ? value.map(canonicalize)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
      : value;
  return JSON.stringify(canonicalize(withoutHash));
}

expect(hashManagedProjection({ uses: { spent: 0, max: '1' } }))
  .toBe(hashManagedProjection({ uses: { spent: 1, max: '1' } }));
