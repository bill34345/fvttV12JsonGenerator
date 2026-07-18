import { describe, expect, test } from 'bun:test';
import { logicalSpellRefKey, RESOLVER_MODULE_ID, type PortableSpellManifest, type SpellHydrationSelection } from '../../../core/spell-resolution';
import { buildCastActivitySource, computeManagedSourceHash, generatedResolverDocumentId } from '../cast-activity';
import { createHydrationJournal, hydrateManagedSelection } from '../hydrator';

// dnd5e.mjs 17937-17940 resolves cachedSpell through actor.sourcedItems and
// cachedFor===relativeUUID. Lines 18004-18026 define the public native cache
// source, including source effects, enchantment, system.sourceItem and
// _stats.compendiumSource. Lines 18532-18555 prove an embedded feature update
// can create that cache before this module resumes.

function oneSpellManifest(): PortableSpellManifest {
  return {
    schemaVersion: 1,
    manifestId: 'hydrator-manifest',
    sourceSha256: 'a'.repeat(64),
    rulesPreference: '2024',
    spellcastingGroups: [{
      groupId: 'innate-cha', featureItemKey: 'innate-feature', ability: 'cha', saveDc: 12, attackBonus: 4,
      spellRefs: [{
        refId: 'light-ref', identifier: 'light', originalName: 'Not a name key', englishName: 'Light', aliases: [],
        method: 'at-will', ignoresMaterialComponents: true, restrictions: [],
        evidence: [{ start: 0, end: 5, quote: 'Light' }],
      }],
    }],
  };
}

function selection(): SpellHydrationSelection {
  return {
    logicalRefKey: logicalSpellRefKey('hydrator-manifest', 'innate-cha', 'light-ref'),
    groupId: 'innate-cha', refId: 'light-ref',
    uuid: 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop', rules: '2024', selectionOrigin: 'automatic-2024',
  };
}

describe('prepared Activity eager cache hydration', () => {
  test.each([false, true])('uses public prepared getter without duplicate caches when native auto-cache=%s', async (autoCache) => {
    const actor = new FakeActor(autoCache);
    const journal = createHydrationJournal(actor);
    let observedPhaseSafe = false;
    const result = await hydrateManagedSelection({
      actor,
      manifest: oneSpellManifest(),
      selection: selection(),
      transactionId: 'Transaction00001',
      journal,
      afterFeatureUpdate: ({ cache }) => {
        observedPhaseSafe = autoCache
          ? cache?.flags?.[RESOLVER_MODULE_ID]?.managed === true
            && journal.nativeCaches.length === 1
            && journal.nativeCaches[0]?.ownershipApplied === true
          : cache === undefined && journal.nativeCaches.length === 0;
      },
    });

    expect(actor.calls[0]).toEqual(['updateEmbeddedDocuments', 'Item']);
    expect(actor.getterCalls).toBe(1);
    expect(actor.items.filter((item: any) => item.type === 'spell')).toHaveLength(1);
    expect(result.cache.flags.dnd5e.cachedFor).toBe(result.activity.relativeUUID);
    expect(result.cache._stats.compendiumSource).toBe(selection().uuid);
    expect(result.cache.system.sourceItem).toBe('feat:innate-feature');
    expect(result.cache.effects.map((effect: any) => effect._id)).toEqual(['SourceEffect0001', 'dnd5espellchang']);
    expect(result.cache.flags.foreign).toEqual({ preserve: { exactly: true } });
    expect(result.cache.flags[RESOLVER_MODULE_ID]).toMatchObject({
      managed: true, documentType: 'spell', manifestId: 'hydrator-manifest', groupId: 'innate-cha', refId: 'light-ref',
    });
    expect(result.activity.flags[RESOLVER_MODULE_ID].generatedContentHash)
      .toBe(computeManagedSourceHash(preparedDocumentSource(result.activity)));
    expect(result.cache.flags[RESOLVER_MODULE_ID].generatedContentHash)
      .toBe(computeManagedSourceHash(preparedDocumentSource(result.cache)));
    expect(result.activity.spell.uuid).toBe(selection().uuid);
    expect(result.cache.id).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(result.cache.id).not.toBe(result.activity.id);
    expect(result.cache.id).toBe(autoCache
      ? 'NativeHydrate001'
      : generatedResolverDocumentId({
        manifestId: 'hydrator-manifest', groupId: 'innate-cha', refId: 'light-ref', featureId: 'FeatureHydrate01',
      }, 'spell'));
    expect(observedPhaseSafe).toBe(true);
    expect(journal.nativeCaches).toHaveLength(autoCache ? 1 : 0);
  });

  test('fails closed instead of adopting a pre-existing unowned matching cache', async () => {
    const actor = new FakeActor(false);
    actor.installPreExistingUnownedCache();
    await expect(hydrateManagedSelection({
      actor,
      manifest: oneSpellManifest(),
      selection: selection(),
      transactionId: 'Transaction00001',
      journal: createHydrationJournal(actor),
    })).rejects.toThrow(/pre-existing|ownership/i);
    expect(actor.calls).toEqual([]);
    expect(actor.items.filter((item: any) => item.type === 'spell')).toHaveLength(1);
  });

  test('allows embedding defaults but rejects a changed source field in a native cache', async () => {
    const actor = new FakeActor(true, true);
    await expect(hydrateManagedSelection({
      actor,
      manifest: oneSpellManifest(),
      selection: selection(),
      transactionId: 'Transaction00001',
      journal: createHydrationJournal(actor),
    })).rejects.toThrow(/projection/i);
  });

  test.each(['missing', 'multiple'] as const)(
    'Keep rejects an invalid current manual structure with %s strictly owned cached Spells before writing',
    async (shape) => {
      const actor = new FakeActor(false);
      await hydrateManagedSelection({
        actor,
        manifest: oneSpellManifest(),
        selection: selection(),
        transactionId: 'Transaction00001',
        journal: createHydrationJournal(actor),
      });
      const cache = actor.items.find((item) => item.type === 'spell')!;
      if (shape === 'missing') {
        actor.items = actor.items.filter((item) => item !== cache);
      } else {
        actor.items.push({
          ...structuredClone(preparedDocumentSource(cache)),
          _id: 'DuplicateCache001', id: 'DuplicateCache001', parent: actor, actor,
        });
      }
      const callCount = actor.calls.length;

      await expect(hydrateManagedSelection({
        actor,
        manifest: oneSpellManifest(),
        selection: selection(),
        transactionId: 'Transaction00002',
        journal: createHydrationJournal(actor),
        preserveExisting: true,
      })).rejects.toThrow(/Keep requires exactly one strictly owned cached Spell/i);
      expect(actor.calls).toHaveLength(callCount);
    },
  );
});

class FakeActor {
  readonly id = 'ActorHydrate0001';
  readonly type = 'npc';
  readonly calls: unknown[][] = [];
  getterCalls = 0;
  flags: Record<string, any>;
  items: any[];
  sourcedItems = new Map<string, any[]>();

  constructor(private readonly autoCache: boolean, private readonly corruptNativeCache = false) {
    const manifest = oneSpellManifest();
    this.flags = { [RESOLVER_MODULE_ID]: { spellManifest: manifest } };
    const feature: any = {
      id: 'FeatureHydrate01', _id: 'FeatureHydrate01', type: 'feat', parent: this, actor: this,
      flags: { [RESOLVER_MODULE_ID]: { featureItemKey: 'innate-feature', groupId: 'innate-cha' } },
      system: { identifier: 'innate-feature', activities: new Map() },
    };
    feature.system.parent = feature;
    this.items = [feature];
  }

  async updateEmbeddedDocuments(name: string, updates: any[]) {
    this.calls.push(['updateEmbeddedDocuments', name]);
    for (const update of updates) {
      const item = this.items.find((entry) => entry.id === update._id)!;
      const activityEntry = Object.entries(update).find(([key]) => key.startsWith('system.activities.'));
      if (!activityEntry) {
        const resolverFlags = update[`flags.${RESOLVER_MODULE_ID}`];
        if (resolverFlags) item.flags[RESOLVER_MODULE_ID] = structuredClone(resolverFlags);
        const preparedHash = update[`flags.${RESOLVER_MODULE_ID}.generatedContentHash`];
        if (preparedHash) item.flags[RESOLVER_MODULE_ID].generatedContentHash = preparedHash;
        continue;
      }
      const [path, source] = activityEntry;
      const activityPath = path.slice('system.activities.'.length).split('.');
      const id = activityPath.shift()!;
      if (activityPath.join('.') === `flags.${RESOLVER_MODULE_ID}.generatedContentHash`) {
        item.system.activities.get(id).flags[RESOLVER_MODULE_ID].generatedContentHash = source;
        continue;
      }
      if (activityPath.length) throw new Error(`Unsupported fake Activity update path: ${path}`);
      const activity = this.preparedActivity(item, source as any);
      item.system.activities.set(id, activity);
      if (this.autoCache && !this.findCache(activity.relativeUUID)) {
        const cache = this.cacheSource(activity, 'NativeHydrate001');
        cache.system.preparedSpellDefault = 'dnd5e-normalized';
        if (this.corruptNativeCache) cache.system.sourceItem = 'feat:wrong-source';
        cache.parent = this;
        cache.actor = this;
        this.items.push(cache);
        this.refreshSourcedItems();
      }
    }
    return updates;
  }

  async createEmbeddedDocuments(name: string, sources: any[]) {
    this.calls.push(['createEmbeddedDocuments', name]);
    const created = sources.map((source) => ({
      ...structuredClone(source),
      id: source._id,
      parent: this,
      actor: this,
      system: { ...structuredClone(source.system), preparedSpellDefault: 'dnd5e-normalized' },
    }));
    this.items.push(...created);
    this.refreshSourcedItems();
    return created;
  }

  installPreExistingUnownedCache() {
    const feature = this.items[0]!;
    const manifest = oneSpellManifest();
    const group = manifest.spellcastingGroups[0]!;
    const source = buildCastActivitySource({
      manifestId: manifest.manifestId, featureId: feature.id, group, ref: group.spellRefs[0]!,
      selectedUuid: selection().uuid,
    }).activity;
    const activity = this.preparedActivity(feature, source);
    feature.system.activities.set(source._id, activity);
    const cache = this.cacheSource(activity, 'OldHydrateCache1');
    cache.system.preparedSpellDefault = 'dnd5e-normalized';
    cache.parent = this;
    cache.actor = this;
    this.items.push(cache);
    this.refreshSourcedItems();
  }

  private preparedActivity(feature: any, source: any) {
    const actor = this;
    const activity: any = {
      ...structuredClone(source),
      activation: source.activation ?? { type: '', value: null, condition: '' },
      description: source.description ?? { chatFlavor: '' },
      id: source._id, parent: feature.system,
      relativeUUID: `.Item.${feature.id}.Activity.${source._id}`,
      async getCachedSpellData() { actor.getterCalls++; return actor.cacheSource(activity, source._id); },
    };
    Object.defineProperties(activity, {
      item: { get: () => activity.parent?.parent },
      actor: { get: () => activity.item?.parent ?? null },
    });
    Object.defineProperty(activity, 'cachedSpell', { get: () => this.findCache(activity.relativeUUID) });
    return activity;
  }

  private cacheSource(activity: any, id: string): any {
    return {
      _id: id, id, name: 'Light', type: 'spell',
      system: { sourceItem: 'feat:innate-feature', properties: ['vocal', 'somatic', 'material'] },
      effects: [
        { _id: 'SourceEffect0001', name: 'Source effect' },
        { _id: 'dnd5espellchang', type: 'enchantment', origin: activity.relativeUUID, changes: [] },
      ],
      flags: { foreign: { preserve: { exactly: true } }, dnd5e: { cachedFor: activity.relativeUUID } },
      _stats: { compendiumSource: activity.spell.uuid },
    };
  }

  private findCache(relativeUUID: string) {
    return this.items.find((item) => item.type === 'spell' && item.flags?.dnd5e?.cachedFor === relativeUUID);
  }

  private refreshSourcedItems() {
    this.sourcedItems = new Map([[selection().uuid, this.items.filter((item) => item._stats?.compendiumSource === selection().uuid)]]);
  }
}

function preparedDocumentSource(document: any): Record<string, any> {
  return Object.fromEntries(Object.entries(document)
    .filter(([key, value]) => !['parent', 'actor', 'item', 'id', 'relativeUUID', 'cachedSpell'].includes(key)
      && typeof value !== 'function')
    .map(([key, value]) => [key, structuredClone(value)]));
}
