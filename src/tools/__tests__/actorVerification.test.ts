import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildActorVerificationSummary } from '../actorVerification';

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
});
