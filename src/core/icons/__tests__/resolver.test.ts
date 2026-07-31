import { describe, expect, test } from 'bun:test';
import { V14IconResolver, createIconReviewReport } from '../resolver';
import type {
  IconReviewEntry,
  V14IconCatalog,
  V14IconOverrideFile,
} from '../types';

const TARGET = {
  foundryVersion: '14.364',
  systemId: 'dnd5e',
  systemVersion: '5.3.3',
} as const;

const PATHS = {
  feature: 'systems/dnd5e/icons/svg/items/feature.svg',
  weapon: 'systems/dnd5e/icons/svg/items/weapon.svg',
  flyby24: 'icons/creatures/abilities/wings-birdlike-blue.webp',
  flyby14: 'icons/creatures/abilities/wings-birdlike-grey.webp',
  fire: 'icons/magic/fire/explosion-fireball-large-orange.webp',
  cold: 'icons/magic/water/orb-ice-opaque.webp',
  custom: 'icons/skills/melee/strike-weapons-orange.webp',
  aura: 'icons/svg/aura.svg',
  eldritchBlast: 'icons/magic/lightning/bolt-strike-sparks-purple.webp',
} as const;

function catalog(): V14IconCatalog {
  return {
    schemaVersion: 1,
    target: TARGET,
    provenance: {
      api: 'CompendiumCollection#getIndex',
      packIndexSha256: 'pack',
      coreFilesSha256: 'core',
      dnd5eFilesSha256: 'system',
      packs: [
        { id: 'dnd5e.monsterfeatures24', count: 2 },
        { id: 'dnd5e.monsterfeatures', count: 1 },
      ],
    },
    typeDefaults: {
      feat: PATHS.feature,
      weapon: PATHS.weapon,
    },
    compendium: [
      {
        id: 'flyby24',
        name: 'Flyby',
        img: PATHS.flyby24,
        type: 'feat',
        identifier: 'flyby',
        rules: '2024',
        pack: 'dnd5e.monsterfeatures24',
        packPriority: 0,
        tokens: ['flyby', 'wings'],
      },
      {
        id: 'fire-burst',
        name: 'Fiery Burst',
        img: PATHS.fire,
        type: 'feat',
        identifier: 'fiery-burst',
        rules: '2024',
        pack: 'dnd5e.monsterfeatures24',
        packPriority: 0,
        tokens: ['burst', 'damage', 'fire'],
      },
      {
        id: 'flyby14',
        name: 'Flyby',
        img: PATHS.flyby14,
        type: 'feat',
        identifier: 'flyby',
        rules: '2014',
        pack: 'dnd5e.monsterfeatures',
        packPriority: 1,
        tokens: ['flyby', 'wings'],
      },
      {
        id: 'cold-burst',
        name: 'Cold Burst',
        img: PATHS.cold,
        type: 'feat',
        identifier: 'cold-burst',
        rules: '2014',
        pack: 'dnd5e.monsterfeatures',
        packPriority: 1,
        tokens: ['burst', 'cold', 'damage'],
      },
      {
        id: 'eldritch-blast',
        name: 'Eldritch Blast',
        img: PATHS.eldritchBlast,
        type: 'spell',
        identifier: 'eldritch-blast',
        rules: '2014',
        pack: 'dnd5e.spells',
        packPriority: 3,
        tokens: ['eldritch', 'blast', 'lightning'],
      },
    ],
    files: Object.values(PATHS).map((path) => ({
      path,
      source: path.startsWith('systems/') ? 'dnd5e' as const : 'core' as const,
      tokens: [],
    })),
  };
}

function overrides(entries: V14IconOverrideFile['entries'] = []): V14IconOverrideFile {
  return { schemaVersion: 1, target: TARGET, entries };
}

function resolveActor(
  items: Array<Record<string, unknown>>,
  overrideEntries: V14IconOverrideFile['entries'] = [],
): { items: Array<Record<string, any>>; review: IconReviewEntry[] } {
  const review: IconReviewEntry[] = [];
  const actor = { name: '夜魇 (Nightgaunt)', items };
  new V14IconResolver({
    catalog: catalog(),
    overrides: overrides(overrideEntries),
    review,
  }).resolveActor(actor);
  return { items: actor.items, review };
}

describe('V14IconResolver', () => {
  test('uses the 2024 same-type exact Compendium match before 2014', () => {
    const result = resolveActor([
      { name: '飞掠 (Flyby)', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: {} } },
    ]);

    expect(result.items[0]?.img).toBe(PATHS.flyby24);
    expect(result.review[0]?.source).toBe('compendium-exact');
    expect(result.review[0]?.alternatives.map((entry) => entry.path)).toEqual([
      PATHS.flyby24,
      PATHS.flyby14,
    ]);
  });

  test('prefers an actor-scoped English override over the Compendium', () => {
    const result = resolveActor(
      [{ name: '飞掠 (Flyby)', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: {} } }],
      [{
        selector: {
          itemType: 'feat',
          englishName: 'Flyby',
          actorEnglishName: 'Nightgaunt',
        },
        img: PATHS.custom,
      }],
    );

    expect(result.items[0]?.img).toBe(PATHS.custom);
    expect(result.review[0]?.source).toBe('override');
    expect(result.review[0]?.overrideKey).toContain('actor-en:nightgaunt');
  });

  test('accepts a unique lexical plus structured semantic match', () => {
    const result = resolveActor([
      {
        name: '火焰爆发 (Fire Burst)',
        type: 'feat',
        img: 'icons/svg/mystery-man.svg',
        system: {
          activities: {
            one: { type: 'damage', damage: { parts: [{ types: ['fire'] }] } },
          },
        },
      },
    ]);

    expect(result.items[0]?.img).toBe(PATHS.fire);
    expect(result.review[0]?.source).toBe('semantic');
    expect(result.review[0]?.confidence).toBe('high');
  });

  test('falls back instead of confusing Transfer Harm with an unrelated candidate', () => {
    const result = resolveActor([
      {
        name: '转移伤害 (Transfer Harm)',
        type: 'feat',
        img: 'icons/svg/mystery-man.svg',
        system: { activities: { one: { type: 'utility' } } },
      },
    ]);

    expect(result.items[0]?.img).toBe(PATHS.feature);
    expect(result.review[0]?.source).toBe('type-default');
  });

  test('bridges an exact spell name only when source structure identifies a spell attack', () => {
    const result = resolveActor([
      {
        name: '魔能爆 (Eldritch Blast)',
        type: 'weapon',
        img: 'icons/svg/sword.svg',
        system: {
          activities: {
            one: { type: 'attack', attack: { type: { value: 'rsak' } } },
          },
        },
      },
      {
        name: '奥术盾牌 (Shield)',
        type: 'weapon',
        img: 'icons/svg/sword.svg',
        system: {
          activities: {
            one: { type: 'attack', attack: { type: { value: 'rwak' } } },
          },
        },
      },
    ]);

    expect(result.items[0]?.img).toBe(PATHS.eldritchBlast);
    expect(result.review[0]?.source).toBe('compendium-exact');
    expect(result.review[0]?.reasons[0]).toContain('spell attack/cast');
    expect(result.items[1]?.img).toBe(PATHS.weapon);
    expect(result.review[1]?.source).toBe('type-default');
  });

  test('preserves an existing semantic core icon and leaves unrelated items deterministic', () => {
    const result = resolveActor([
      { name: '区域光环', type: 'feat', img: PATHS.aura, system: { activities: {} } },
      { name: 'Unknown Strike', type: 'weapon', img: 'icons/svg/sword.svg', system: { activities: {} } },
    ]);

    expect(result.items[0]?.img).toBe(PATHS.aura);
    expect(result.review[0]?.source).toBe('existing');
    expect(result.items[1]?.img).toBe(PATHS.weapon);
    expect(result.review[1]?.source).toBe('type-default');
  });

  test('builds a stable summary without turning fallbacks into generation warnings', () => {
    const result = resolveActor([
      { name: '飞掠 (Flyby)', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: {} } },
      { name: 'Unknown', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: {} } },
    ]);
    const report = createIconReviewReport(catalog(), result.review);

    expect(report.summary).toEqual({
      total: 2,
      override: 0,
      existing: 0,
      exact: 1,
      semantic: 0,
      fallback: 1,
    });
    expect(report.entries.map((entry) => entry.englishName ?? entry.itemName)).toEqual(['Flyby', 'Unknown']);
  });
});
