import { describe, expect, test } from 'bun:test';
import { logicalSpellRefKey, RESOLVER_MODULE_ID } from '../../../core/spell-resolution';
import {
  assertAdoptableNativeCache,
  assertLinkedFeatureOwnership,
  assertResolverDocumentOwnership,
  ResolverOwnershipError,
  type ResolverDocumentIdentity,
} from '../ownership';

// dnd5e 5.3.3 dnd5e.mjs 6202-6205 converts an Item constructor parent to
// item.system. Lines 6301-6316 expose the public item/actor chain through
// activity.item === feature and activity.actor === actor. CastActivity applies
// this PseudoDocument mixin at 16675-16677 and 17901.

function ownedFixture() {
  const actor: any = {
    id: 'Actor00000000001', type: 'npc',
    flags: { [RESOLVER_MODULE_ID]: { spellManifest: { manifestId: 'manifest-a' } } },
  };
  const feature: any = {
    id: 'Feature000000001', type: 'feat', parent: actor, actor,
    flags: { [RESOLVER_MODULE_ID]: { featureItemKey: 'feature-a', groupId: 'group-a' } },
    system: {},
  };
  feature.system.parent = feature;
  const identity: ResolverDocumentIdentity = {
    manifestId: 'manifest-a', groupId: 'group-a', refId: 'ref-a', featureId: feature.id,
      logicalRefKey: logicalSpellRefKey('manifest-a', 'group-a', 'ref-a'),
      selectedUuid: 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop',
    activityId: 'Activity00000001',
  };
  const activity: any = {
    id: identity.activityId, _id: identity.activityId, type: 'cast', parent: feature.system,
    relativeUUID: `.Item.${feature.id}.Activity.${identity.activityId}`,
    spell: { uuid: identity.selectedUuid },
    flags: { [RESOLVER_MODULE_ID]: { managed: true, documentType: 'activity', ...identity } },
  };
  Object.defineProperties(activity, {
    item: { configurable: true, get: () => activity.parent?.parent },
    actor: { configurable: true, get: () => activity.item?.parent ?? null },
  });
  const spell: any = {
    id: 'Spell00000000001', _id: 'Spell00000000001', name: 'Shared Display Name', type: 'spell', parent: actor, actor,
    _stats: { compendiumSource: identity.selectedUuid },
    flags: {
      dnd5e: { cachedFor: activity.relativeUUID },
      [RESOLVER_MODULE_ID]: { managed: true, documentType: 'spell', ...identity },
    },
  };
  return { actor, feature, activity, spell, identity };
}

describe('resolver ownership hard gate', () => {
  test('requires Actor manifest, linked feature, managed flag, ref, type, and current parent together', () => {
    const { actor, feature, activity, spell, identity } = ownedFixture();
    expect(() => assertLinkedFeatureOwnership(actor, feature, identity)).not.toThrow();
    expect(activity.parent).not.toBe(feature);
    expect(activity.parent.parent).toBe(feature);
    expect(activity.item).toBe(feature);
    expect(activity.actor).toBe(actor);
    expect(() => assertResolverDocumentOwnership(actor, feature, activity, identity, 'activity')).not.toThrow();
    expect(() => assertResolverDocumentOwnership(actor, feature, spell, identity, 'spell', activity.relativeUUID)).not.toThrow();

    const mutations: Array<{
      target: 'feature' | 'activity' | 'spell';
      mutate(fresh: ReturnType<typeof ownedFixture>): void;
    }> = [
      { target: 'feature', mutate: (fresh) => { fresh.actor.flags[RESOLVER_MODULE_ID].spellManifest.manifestId = 'foreign'; } },
      { target: 'feature', mutate: (fresh) => { fresh.feature.flags[RESOLVER_MODULE_ID].groupId = 'foreign'; } },
      { target: 'feature', mutate: (fresh) => { fresh.feature.parent = { id: fresh.actor.id }; } },
      { target: 'feature', mutate: (fresh) => { fresh.feature.actor = { id: fresh.actor.id }; } },
      { target: 'activity', mutate: (fresh) => { fresh.activity.flags[RESOLVER_MODULE_ID].managed = false; } },
      { target: 'activity', mutate: (fresh) => { fresh.activity.flags[RESOLVER_MODULE_ID].refId = 'foreign'; } },
      { target: 'activity', mutate: (fresh) => { fresh.activity.flags[RESOLVER_MODULE_ID].documentType = 'spell'; } },
      { target: 'activity', mutate: (fresh) => { fresh.activity.type = 'utility'; } },
      { target: 'activity', mutate: (fresh) => { Object.defineProperty(fresh.activity, 'item', { value: { id: fresh.feature.id } }); } },
      { target: 'activity', mutate: (fresh) => { Object.defineProperty(fresh.activity, 'actor', { value: { id: fresh.actor.id } }); } },
      { target: 'spell', mutate: (fresh) => { fresh.spell.flags[RESOLVER_MODULE_ID].documentType = 'activity'; } },
      { target: 'spell', mutate: (fresh) => { fresh.spell.flags[RESOLVER_MODULE_ID].featureId = 'ForeignFeature01'; } },
      { target: 'spell', mutate: (fresh) => { fresh.spell.flags[RESOLVER_MODULE_ID].groupId = 'foreign'; } },
      { target: 'spell', mutate: (fresh) => { fresh.spell.flags[RESOLVER_MODULE_ID].logicalRefKey = 'foreign'; } },
      { target: 'spell', mutate: (fresh) => { fresh.spell.flags[RESOLVER_MODULE_ID].selectedUuid = 'Compendium.foreign.spells.Item.abcdefghijklmnop'; } },
      { target: 'spell', mutate: (fresh) => { fresh.spell.parent = { id: fresh.actor.id }; } },
      { target: 'spell', mutate: (fresh) => { fresh.spell.actor = { id: fresh.actor.id }; } },
      { target: 'spell', mutate: (fresh) => { fresh.spell.flags.dnd5e.cachedFor = '.wrong'; } },
      { target: 'spell', mutate: (fresh) => { fresh.spell._stats.compendiumSource = 'Compendium.foreign.spells.Item.abcdefghijklmnop'; } },
    ];
    for (const entry of mutations) {
      const fresh = ownedFixture();
      entry.mutate(fresh);
      const check = entry.target === 'feature'
        ? () => assertLinkedFeatureOwnership(fresh.actor, fresh.feature, fresh.identity)
        : entry.target === 'activity'
          ? () => assertResolverDocumentOwnership(fresh.actor, fresh.feature, fresh.activity, fresh.identity, 'activity')
          : () => assertResolverDocumentOwnership(fresh.actor, fresh.feature, fresh.spell, fresh.identity, 'spell', fresh.activity.relativeUUID);
      expect(check).toThrow(ResolverOwnershipError);
    }
  });

  test('never grants ownership from a name match or foreign resolver flags', () => {
    const { actor, feature, spell, identity, activity } = ownedFixture();
    const foreign = structuredClone(spell);
    foreign.parent = actor;
    foreign.actor = actor;
    foreign.name = spell.name;
    foreign.flags = { dnd5e: { cachedFor: activity.relativeUUID }, foreign: { managed: true } };
    expect(() => assertResolverDocumentOwnership(actor, feature, foreign, identity, 'spell', activity.relativeUUID))
      .toThrow(ResolverOwnershipError);
  });

  test('adopts only a cache created after the snapshot with exact native provenance', () => {
    const { actor, feature, identity, activity } = ownedFixture();
    const cache: any = {
      id: 'NativeCache00001', type: 'spell', parent: actor, actor,
      _stats: { compendiumSource: identity.selectedUuid },
      flags: { dnd5e: { cachedFor: activity.relativeUUID } },
    };
    expect(() => assertAdoptableNativeCache(actor, feature, activity, cache, identity, new Set(['OldItem000000001'])))
      .not.toThrow();
    expect(() => assertAdoptableNativeCache(actor, feature, activity, cache, identity, new Set([cache.id])))
      .toThrow(ResolverOwnershipError);
    cache.flags.foreign = { managed: true, nested: { keep: true } };
    const foreignSnapshot = structuredClone(cache.flags.foreign);
    expect(() => assertAdoptableNativeCache(actor, feature, activity, cache, identity, new Set()))
      .not.toThrow();
    expect(cache.flags.foreign).toEqual(foreignSnapshot);
    cache.flags[RESOLVER_MODULE_ID] = { managed: true, manifestId: 'foreign' };
    expect(() => assertAdoptableNativeCache(actor, feature, activity, cache, identity, new Set()))
      .toThrow(ResolverOwnershipError);
  });
});
