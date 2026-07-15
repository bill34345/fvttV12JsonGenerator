import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildActorVerificationSummary,
  buildActorVerificationSummaryFromValues,
} from '../actorVerification';

describe('actorVerification', () => {
  it('summarizes actor facts and flags items not found in the source markdown', () => {
    const root = mkdtempSync(join(tmpdir(), 'actor-verification-'));

    try {
      const sourcePath = join(root, 'source.md');
      const actorPath = join(root, 'actor.json');

      writeFileSync(
        sourcePath,
        [
          '---',
          'name: Slithering Bloodfin',
          '---',
          '# Slithering Bloodfin',
          'HP 143',
          'AC 16',
          '## Actions',
          'Bite. Melee Weapon Attack.',
          'Tail Crash. Heavy Hit.',
          '',
        ].join('\n'),
      );

      writeFileSync(
        actorPath,
        JSON.stringify(
          {
            name: 'Slithering Bloodfin',
            type: 'npc',
            system: {
              details: {
                cr: 9,
                type: { value: 'aberration' },
              },
              attributes: {
                hp: { value: 143, max: 143 },
                ac: { flat: 16, calc: 'natural' },
                senses: { blindsight: 100 },
              },
            },
            items: [
              {
                name: 'Bite',
                type: 'weapon',
                system: {
                  activation: { type: 'action' },
                  activities: {
                    a1: {
                      type: 'attack',
                      range: { reach: 5, units: 'ft' },
                      damage: { parts: [{ number: 2, denomination: 8, bonus: '5', types: ['piercing'] }] },
                    },
                  },
                },
              },
              {
                name: 'Missing Power',
                type: 'feat',
                system: {
                  activation: { type: 'reaction' },
                  activities: {},
                },
              },
            ],
          },
          null,
          2,
        ),
      );

      const summary = buildActorVerificationSummary({ sourcePath, actorPath });

      expect(summary.actor.name).toBe('Slithering Bloodfin');
      expect(summary.actor.hp).toEqual({ value: 143, max: 143 });
      expect(summary.actor.ac).toEqual({ flat: 16, calc: 'natural' });
      expect(summary.actor.cr).toBe(9);
      expect(summary.actor.senses.blindsight).toBe(100);
      expect(summary.items).toHaveLength(2);
      expect(summary.items[0]).toEqual(
        expect.objectContaining({
          name: 'Bite',
          activation: 'action',
          activityTypes: ['attack'],
        }),
      );
      expect(summary.warnings).toEqual([
        'Item name not found in source markdown: Missing Power',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts actor JSON files that start with a UTF-8 BOM', () => {
    const root = mkdtempSync(join(tmpdir(), 'actor-verification-bom-'));

    try {
      const sourcePath = join(root, 'source.md');
      const actorPath = join(root, 'actor.json');

      writeFileSync(sourcePath, '# Test Actor\nBite.\n');
      writeFileSync(
        actorPath,
        `\uFEFF${JSON.stringify({
          name: 'Test Actor',
          type: 'npc',
          system: {
            attributes: { senses: {} },
            details: {},
          },
          items: [{ name: 'Bite', type: 'weapon', system: { activities: {} } }],
        })}`,
      );

      const summary = buildActorVerificationSummary({ sourcePath, actorPath });

      expect(summary.actor.name).toBe('Test Actor');
      expect(summary.warnings).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('warns when a source-derived AC effect came from Attack text instead of an explicit AC clause', () => {
    const summary = buildActorVerificationSummaryFromValues({
      source: [
        '# Bleeding Guardian',
        'Bleeding Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target.',
      ].join('\n'),
      actor: {
        name: 'Bleeding Guardian',
        type: 'npc',
        system: {
          attributes: { senses: {} },
          details: {},
        },
        items: [
          {
            name: 'Bleeding Bite',
            type: 'weapon',
            system: { activities: {} },
            effects: [
              {
                name: 'Bleeding Bite',
                changes: [
                  {
                    key: 'system.attributes.ac.formula',
                    mode: 2,
                    value: '4',
                    priority: null,
                  },
                ],
                flags: {
                  fvttJsonGenerator: {
                    sourceDerivedAcEffect: true,
                    sourceText: 'ack: +4',
                  },
                },
              },
            ],
          },
        ],
      },
    });

    expect(summary.warnings).toContain(
      'Invalid source-derived AC effect on Bleeding Bite: sourceText is not an explicit AC clause: ack: +4',
    );
  });

  it('warns when a source-derived AC effect value disagrees with the explicit source clause', () => {
    const summary = buildActorVerificationSummaryFromValues({
      source: '# AC Guardian\nGuarded Step. The creature gains +2 AC until its next turn.',
      actor: buildActorWithAcEffect({
        coreVersion: '14.361',
        key: 'system.attributes.ac.formula',
        value: '4',
      }),
    });

    expect(summary.warnings).toContain(
      'Source-derived AC effect on Guarded Step has value 4, expected 2 from sourceText: +2 AC',
    );
  });

  it('warns when a source-derived AC effect uses a target-incompatible change key', () => {
    const summary = buildActorVerificationSummaryFromValues({
      source: '# AC Guardian\nGuarded Step. The creature gains +2 AC until its next turn.',
      actor: buildActorWithAcEffect({
        coreVersion: '14.361',
        key: 'system.attributes.ac.bonus',
        value: '2',
      }),
    });

    expect(summary.items[0]?.effects[0]).toEqual(
      expect.objectContaining({
        sourceDerivedAcEffect: true,
        sourceText: '+2 AC',
      }),
    );
    expect(summary.warnings).toContain(
      'Source-derived AC effect on Guarded Step has key system.attributes.ac.bonus, expected system.attributes.ac.formula for Foundry v14',
    );
  });

  it.each([
    ['12.331', 'system.attributes.ac.bonus'],
    ['14.361', 'system.attributes.ac.formula'],
  ])('accepts a matching source-derived bonus AC effect for Foundry %s', (coreVersion, key) => {
    const summary = buildActorVerificationSummaryFromValues({
      source: '# AC Guardian\nGuarded Step. The creature gains +2 AC until its next turn.',
      actor: buildActorWithAcEffect({ coreVersion, key, value: '2' }),
    });

    expect(summary.warnings).toEqual([]);
  });
});

function buildActorWithAcEffect(options: {
  coreVersion: string;
  key: string;
  value: string;
}): Record<string, unknown> {
  return {
    name: 'AC Guardian',
    type: 'npc',
    _stats: { coreVersion: options.coreVersion },
    system: {
      attributes: { senses: {} },
      details: {},
    },
    items: [
      {
        name: 'Guarded Step',
        type: 'feat',
        system: { activities: {} },
        effects: [
          {
            name: 'Guarded Step',
            changes: [
              {
                key: options.key,
                mode: 2,
                value: options.value,
                priority: null,
              },
            ],
            flags: {
              fvttJsonGenerator: {
                sourceDerivedAcEffect: true,
                sourceText: '+2 AC',
              },
            },
          },
        ],
      },
    ],
  };
}
