import { describe, expect, test } from 'bun:test';
import {
  assertNativeCacheProjectionMatches,
  NativeCacheLifecycleCapture,
  nativeEffectChangesLocation,
  normalizeNativeEffectHookChanges,
  readNativeEffectChanges,
} from '../native-cache-lifecycle';

function preparedCache(reference: string): Record<string, any> {
  return {
    name: 'Faerie Fire',
    type: 'spell',
    system: {
      identifier: 'faerie-fire',
      description: { value: `<p>${reference}</p>`, chat: '' },
    },
    effects: [{
      _id: 'Y2i0OvwOixxag0ed',
      name: 'Outlined',
      type: 'base',
      description: `<p>${reference}</p>`,
      system: { changes: [] },
    }],
    flags: { dnd5e: { cachedFor: '.Item.Feature00000001.Activity.Activity0000001' } },
    _stats: {
      compendiumSource: 'Compendium.dnd-players-handbook.spells.Item.phbsplFaerieFire',
    },
  };
}

describe('native cache projection normalization', () => {
  test('accepts Foundry HTML ampersand escaping without ignoring rich-text semantics', () => {
    const expected = preparedCache('&Reference[dimlight]');
    const actual = preparedCache('&amp;Reference[dimlight]');

    expect(() => assertNativeCacheProjectionMatches(expected, actual)).not.toThrow();

    actual.effects[0].description = '<p>different mechanics text</p>';
    expect(() => assertNativeCacheProjectionMatches(expected, actual))
      .toThrow(/public getter projection/i);
  });

  test('ignores rematerialized effect-change row IDs but still checks every change mechanic', () => {
    const expected = preparedCache('same');
    expected.effects[0].system.changes = Array.from({ length: 9 }, (_, index) => ({
      _id: `Expected${String(index).padStart(8, '0')}`,
      key: `system.detail.${index}`, mode: 5, value: String(index), priority: 20,
    }));
    const actual = structuredClone(expected);
    actual.effects[0].system.changes.forEach((change: Record<string, unknown>, index: number) => {
      change._id = `ActualId${String(index).padStart(8, '0')}`;
    });
    expect(() => assertNativeCacheProjectionMatches(expected, actual)).not.toThrow();
    actual.effects[0].system.changes[4].value = 'GM edit';
    expect(() => assertNativeCacheProjectionMatches(expected, actual))
      .toThrow(/public getter projection/i);
  });
});

describe('version-shaped native Cast enchantment changes', () => {
  const changes = [{ key: 'system.method', mode: 5, value: 'spell' }];

  test('reads 5.3.3 top-level and 6.0.2 system changes without treating a missing path as equal', () => {
    const oldEffect = { type: 'enchantment', changes };
    const newEffect = { type: 'enchantment', system: { changes, origin: { activity: 'Actor.a.Item.b.Activity.c' } } };
    expect(nativeEffectChangesLocation(oldEffect)).toBe('changes');
    expect(nativeEffectChangesLocation(newEffect)).toBe('system.changes');
    expect(readNativeEffectChanges(oldEffect, 'changes')).toEqual(changes);
    expect(readNativeEffectChanges(newEffect, 'system.changes')).toEqual(changes);
    expect(readNativeEffectChanges(newEffect, 'changes')).toBeUndefined();
    expect(() => nativeEffectChangesLocation({ type: 'enchantment' })).toThrow(/exactly one supported/i);
    expect(() => nativeEffectChangesLocation({ changes, system: { changes } })).toThrow(/exactly one supported/i);
  });

  test('normalizes nested, dotted and legacy update hook payloads but rejects missing or contradictory changes', () => {
    expect(normalizeNativeEffectHookChanges({ system: { changes } })).toEqual(changes);
    expect(normalizeNativeEffectHookChanges({ 'system.changes': changes })).toEqual(changes);
    // dnd5e 6.0.2 onUpdateActivities still calls update({ changes: ... }).
    expect(normalizeNativeEffectHookChanges({ changes })).toEqual(changes);
    expect(normalizeNativeEffectHookChanges({ system: { changes }, changes })).toEqual(changes);
    expect(normalizeNativeEffectHookChanges({ system: { changes }, changes: [] })).toBeUndefined();
    expect(normalizeNativeEffectHookChanges({ unrelated: [] })).toBeUndefined();
  });

  test('matches native effect hook changes despite rematerialized row IDs, not changed mechanics', () => {
    const expected = [{ _id: 'OldChange0000001', key: 'system.value', mode: 5, value: '1' }];
    const actual = [{ _id: 'NewChange0000001', key: 'system.value', mode: 5, value: '1' }];
    expect(normalizeNativeEffectHookChanges({ 'system.changes': actual, changes: expected })).toEqual(actual);
    expect(readNativeEffectChanges({ system: { changes: actual } }, 'system.changes')).toEqual(actual);
    actual[0]!.value = '2';
    expect(normalizeNativeEffectHookChanges({ 'system.changes': actual, changes: expected })).toBeUndefined();
  });

  test('a matching hook payload cannot complete while the 6.0.2 effect document remains stale', async () => {
    const callbacks = new Map<number, (...args: any[]) => void>();
    let nextId = 0;
    const hooks = {
      on(_name: 'createItem' | 'updateActiveEffect', callback: (...args: any[]) => void) {
        const id = ++nextId;
        callbacks.set(id, callback);
        return id;
      },
      off(_name: 'createItem' | 'updateActiveEffect', id: unknown) { callbacks.delete(id as number); },
    };
    const capture = new NativeCacheLifecycleCapture(hooks);
    const actor = {};
    const cache = { id: 'CacheId000000001', actor };
    const effect = { id: 'EffectId00000001', parent: cache, system: { changes: [] as typeof changes } };
    const emit = (changed: unknown) => {
      for (const callback of callbacks.values()) callback(effect, changed, {}, 'UserId000000001');
    };
    try {
      const stale = capture.waitForUpdatedEffect(actor, cache.id, effect.id, changes, 'system.changes', 'UserId000000001', 25);
      emit({ changes });
      await expect(stale).rejects.toThrow(/Timed out waiting/i);

      effect.system.changes = structuredClone(changes);
      const current = capture.waitForUpdatedEffect(actor, cache.id, effect.id, changes, 'system.changes', 'UserId000000001', 25);
      emit({ 'system.changes': changes });
      await expect(current).resolves.toBe(effect);
    } finally {
      capture.dispose();
    }
  });
});
