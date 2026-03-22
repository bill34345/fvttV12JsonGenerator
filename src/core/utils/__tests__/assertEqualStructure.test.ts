import { describe, expect, it } from 'bun:test';
import {
  assertEqualStructure,
  prepareStructureForComparison,
} from '../assertEqualStructure';

describe('assertEqualStructure', () => {
  it('ignores configured volatile paths with wildcard support', () => {
    const actual = {
      _stats: {
        createdTime: 1,
        modifiedTime: 2,
      },
      items: [
        { _id: 'item-a', name: 'Bite' },
        { _id: 'item-b', name: 'Claw' },
      ],
    };

    const expected = {
      _stats: {
        createdTime: 99,
        modifiedTime: 100,
      },
      items: [
        { _id: 'different-a', name: 'Bite' },
        { _id: 'different-b', name: 'Claw' },
      ],
    };

    expect(() =>
      assertEqualStructure(actual, expected, {
        ignorePaths: ['_stats.createdTime', '_stats.modifiedTime', 'items[*]._id'],
      }),
    ).not.toThrow();
  });

  it('normalizes actor item order and activity ids before comparison', () => {
    const actual = {
      items: [
        {
          _id: 'item-2',
          name: 'Tail',
          system: {
            activities: {
              dnd5eactivity999: { _id: 'activity-a', type: 'attack' },
            },
          },
        },
        {
          _id: 'item-1',
          name: 'Bite',
        },
      ],
    };

    const expected = {
      items: [
        {
          _id: 'item-1x',
          name: 'Bite',
        },
        {
          _id: 'item-2x',
          name: 'Tail',
          system: {
            activities: {
              dnd5eactivity123: { _id: 'activity-b', type: 'attack' },
            },
          },
        },
      ],
    };

    expect(() =>
      assertEqualStructure(actual, expected, {
        ignorePaths: ['items[*]._id'],
      }),
    ).not.toThrow();
  });

  it('supports shape-only comparison when values differ but schema stays compatible', () => {
    const actual = {
      system: {
        attributes: {
          hp: { value: 256, max: 256, formula: '19d12+133' },
        },
      },
    };

    const expected = {
      system: {
        attributes: {
          hp: { value: 1, max: 1, formula: '' },
        },
      },
    };

    expect(() =>
      assertEqualStructure(actual, expected, {
        mode: 'shape',
      }),
    ).not.toThrow();

    expect(
      prepareStructureForComparison(actual, { mode: 'shape' }),
    ).toEqual({
      system: {
        attributes: {
          hp: { value: 'number', max: 'number', formula: 'string' },
        },
      },
    });
  });

  it('fails when business-relevant fields still differ after sanitization', () => {
    const actual = {
      items: [{ name: 'Bite' }],
    };
    const expected = {
      items: [{ name: 'Claw' }],
    };

    expect(() => assertEqualStructure(actual, expected)).toThrow();
  });
});
