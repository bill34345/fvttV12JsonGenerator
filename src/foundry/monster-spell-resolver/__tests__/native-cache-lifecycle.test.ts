import { describe, expect, test } from 'bun:test';
import { assertNativeCacheProjectionMatches } from '../native-cache-lifecycle';

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
});
