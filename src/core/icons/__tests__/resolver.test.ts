import { describe, expect, test } from 'bun:test';
import { V14IconResolver, createIconReviewReport } from '../resolver';
import { loadV14IconCatalog } from '../resources';
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
    expect(result.review[1]?.source).toBe('compendium-exact');
    expect(result.review[1]?.reasons[1]).toContain('inherited the Item');
    expect(result.review[2]?.source).toBe('type-default');
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

describe('catalog-backed visual families', () => {
  const lockedCatalog = loadV14IconCatalog();
  const lockedFiles = new Set(lockedCatalog.files.map((file) => file.path));

  function resolve(items: Array<Record<string, any>>, entries: V14IconOverrideFile['entries'] = []) {
    const review: IconReviewEntry[] = [];
    const actor = { name: 'Example Creature', items: structuredClone(items) };
    new V14IconResolver({ catalog: lockedCatalog, overrides: overrides(entries), review }).resolveActor(actor);
    return { actor, review };
  }

  function withoutImages(item: Record<string, any>): Record<string, any> {
    const copy = structuredClone(item);
    delete copy.img;
    for (const activity of Object.values(copy.system?.activities ?? {}) as Array<Record<string, any>>) {
      delete activity.img;
    }
    return copy;
  }

  test('shows a claw rather than the Compendium blood slash for Chinese, English and bilingual claw actions', () => {
    const items = [
      { name: '爪击', type: 'weapon', img: 'icons/svg/sword.svg', system: { activities: { a: { type: 'attack', attack: { type: { value: 'mwak' } } } } } },
      { name: 'Claw', type: 'weapon', img: 'icons/svg/sword.svg', system: { activities: { a: { type: 'attack' } } } },
      { name: '霜寒爪击 (Frost Claw)', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'damage', damage: { parts: [{ types: ['cold'] }] } } } } },
    ];
    const { actor, review } = resolve(items);
    const itemReview = review.filter((entry) => !entry.itemName.includes(' / '));
    for (let index = 0; index < items.length; index += 1) {
      expect(actor.items[index]?.img).toBe('icons/creatures/claws/claw-curved-jagged-gray.webp');
      expect(lockedFiles.has(actor.items[index]?.img)).toBe(true);
      expect(itemReview[index]?.source).toBe('semantic');
      expect(withoutImages(actor.items[index]!)).toEqual(withoutImages(items[index]!));
    }
  });

  test('uses distinct catalog artwork for bites, tail strikes, ranged fireballs, cold projectiles and healing', () => {
    const items = [
      { name: '啃咬', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'attack' } } } },
      { name: 'Tail Sweep', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'attack' } } } },
      { name: '火球术', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'attack', attack: { type: { value: 'rsak' } }, damage: { parts: [{ types: ['fire'] }] } } } } },
      { name: '冰冻射线 (Ice Ray)', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'attack', attack: { type: { value: 'rsak' } }, damage: { parts: [{ types: ['cold'] }] } } } } },
      { name: '治疗之触 (Healing Touch)', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'heal', healing: { number: 2 } } } } },
    ];
    const expected = [
      'icons/creatures/abilities/fangs-teeth-bite.webp',
      'icons/creatures/abilities/tail-swipe-green.webp',
      'icons/magic/fire/projectile-fireball-orange.webp',
      'icons/magic/water/projectile-ice-orb-white.webp',
      'icons/magic/life/heart-hand-gold-green.webp',
    ];
    const { actor, review } = resolve(items);
    const itemReview = review.filter((entry) => !entry.itemName.includes(' / '));
    expect(actor.items.map((item) => item.img)).toEqual(expected);
    for (let index = 0; index < items.length; index += 1) {
      expect(lockedFiles.has(actor.items[index]?.img)).toBe(true);
      expect(itemReview[index]?.source).toBe('semantic');
      expect(withoutImages(actor.items[index]!)).toEqual(withoutImages(items[index]!));
    }
  });

  test('respects exact overrides and artwork, while ambiguous or passive names use the type default', () => {
    const existing = 'icons/svg/aura.svg';
    const items = [
      { name: 'Claw', type: 'feat', img: existing, system: { activities: {} } },
      { name: 'Fire Resistance', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: {} } },
      { name: 'Fire Ice Bolt', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'attack', attack: { type: { value: 'rsak' } }, damage: { parts: [{ types: ['fire', 'cold'] }] } } } } },
      { name: '爪击', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'attack' } } } },
    ];
    const { actor, review } = resolve(items, [{ selector: { itemType: 'feat', name: '爪击' }, img: 'icons/svg/aura.svg' }]);
    expect(actor.items.map((item) => item.img)).toEqual([
      existing,
      lockedCatalog.typeDefaults.feat,
      lockedCatalog.typeDefaults.feat,
      existing,
    ]);
    expect(review.filter((entry) => !entry.itemName.includes(' / ')).map((entry) => entry.source))
      .toEqual(['existing', 'type-default', 'type-default', 'override']);
    expect(actor.items.map(withoutImages)).toEqual(items.map(withoutImages));
  });

  test('chooses separate images for named activities within one Item and preserves its mechanics', () => {
    const item = {
      name: 'Threefold Action', type: 'feat', img: 'icons/svg/mystery-man.svg',
      system: {
        activation: { type: 'legendary', cost: 2 },
        activities: {
          claw: { _id: 'claw', name: '爪击 (Claw)', type: 'attack', attack: { type: { value: 'mwak' } } },
          fire: { _id: 'fire', name: '火焰投射 (Flame Projectile)', type: 'attack', attack: { type: { value: 'rsak' } }, damage: { parts: [{ types: ['fire'] }] } },
          heal: { _id: 'heal', name: '治疗之触 (Healing Touch)', type: 'heal', healing: { number: 2 } },
        },
      },
    };
    const { actor, review } = resolve([item]);
    const activities = actor.items[0]?.system.activities;
    expect(activities.claw.img).toBe('icons/creatures/claws/claw-curved-jagged-gray.webp');
    expect(activities.fire.img).toBe('icons/magic/fire/projectile-fireball-orange.webp');
    expect(activities.heal.img).toBe('icons/magic/life/heart-hand-gold-green.webp');
    expect(lockedFiles.has(actor.items[0]?.img)).toBe(true);
    expect(Object.values(activities).every((activity: any) => lockedFiles.has(activity.img))).toBe(true);
    expect(withoutImages(actor.items[0]!)).toEqual(withoutImages(item));
    expect(review).toHaveLength(4);
    expect(review[0]?.itemName).toBe('Threefold Action');
    expect(review.slice(1).map((entry) => entry.itemName)).toEqual([
      'Threefold Action / 爪击 [claw]',
      'Threefold Action / 火焰投射 [fire]',
      'Threefold Action / 治疗之触 [heal]',
    ]);
  });

  test('preserves a catalog-backed activity image and inherits the Item icon for an unnamed activity', () => {
    const items = [
      { name: 'Uncharted Action', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { one: { type: 'utility', img: 'icons/svg/aura.svg' } } } },
      { name: 'Claw', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { one: { type: 'utility' }, two: { type: 'utility' } } } },
      { name: 'No Activities', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: {} } },
      { name: 'Uncharted Action', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { one: { type: 'utility' } } } },
    ];
    const { actor, review } = resolve(items);
    expect(actor.items[0]?.system.activities.one.img).toBe('icons/svg/aura.svg');
    expect(actor.items[1]?.system.activities.one.img).toBe(actor.items[1]?.img);
    expect(actor.items[1]?.system.activities.two.img).toBe(actor.items[1]?.img);
    expect(review.filter((entry) => entry.itemName.startsWith('No Activities'))).toHaveLength(1);
    expect(actor.items[3]?.system.activities.one.img).toBe(actor.items[3]?.img);
    expect(actor.items.map(withoutImages)).toEqual(items.map(withoutImages));
  });

  test('shows the element of a breath attack while keeping an untyped breath neutral', () => {
    const items = [
      { name: '炽焰吐息 (Blazing Breath)', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'save', damage: { parts: [{ types: ['fire'] }] } } } } },
      { name: '极寒吐息 (Frozen Breath)', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'save', damage: { parts: [{ types: ['cold'] }] } } } } },
      { name: 'Mystery Breath', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'utility' } } } },
    ];
    const { actor } = resolve(items);
    expect(actor.items.map((item) => item.img)).toEqual([
      'icons/creatures/abilities/dragon-fire-breath-orange.webp',
      'icons/creatures/abilities/dragon-ice-breath-blue.webp',
      'icons/creatures/abilities/dragon-breath-purple.webp',
    ]);
    expect(actor.items.map(withoutImages)).toEqual(items.map(withoutImages));
  });

  test('uses single structured damage type for unnamed elemental effects and declines mixed or defensive cases', () => {
    const items = [
      { name: 'Ruinous Pulse', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'save', damage: { parts: [{ types: ['fire'] }] } } } } },
      { name: '剧烈脉冲', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'damage', damage: { parts: [{ types: ['lightning'] }] } } } } },
      { name: 'Storm Pulse', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'attack', damage: { parts: [{ types: ['thunder'] }] } } } } },
      { name: 'Ruinous Pulse', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'save', damage: { parts: [{ types: ['fire', 'cold'] }] } } } } },
      { name: 'Fire Resistance', type: 'feat', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'utility', damage: { parts: [{ types: ['fire'] }] } } } } },
    ];
    const { actor, review } = resolve(items);
    expect(actor.items.map((item) => item.img)).toEqual([
      'icons/magic/fire/orb-vortex.webp',
      'icons/magic/lightning/bolt-blue.webp',
      'icons/magic/sonic/explosion-shock-sound-wave.webp',
      lockedCatalog.typeDefaults.feat,
      lockedCatalog.typeDefaults.feat,
    ]);
    for (const item of actor.items) expect(lockedFiles.has(item.img)).toBe(true);
    expect(review.filter((entry) => !entry.itemName.includes(' / ')).map((entry) => entry.source))
      .toEqual(['semantic', 'semantic', 'semantic', 'type-default', 'type-default']);
    expect(actor.items.map(withoutImages)).toEqual(items.map(withoutImages));
  });

  test('keeps every generic damage family on a verified catalog file', () => {
    const damageIcons = [
      ['fire', 'icons/magic/fire/orb-vortex.webp'],
      ['cold', 'icons/magic/water/orb-ice-glow.webp'],
      ['lightning', 'icons/magic/lightning/bolt-blue.webp'],
      ['acid', 'icons/magic/acid/projectile-faceted-glob.webp'],
      ['poison', 'icons/magic/death/skull-poison-green.webp'],
      ['psychic', 'icons/commodities/biological/organ-brain-pink-purple.webp'],
      ['radiant', 'icons/magic/light/explosion-star-glow-yellow.webp'],
      ['necrotic', 'icons/magic/death/hand-withered-gray.webp'],
      ['thunder', 'icons/magic/sonic/explosion-shock-sound-wave.webp'],
      ['force', 'systems/dnd5e/icons/svg/damage/force.svg'],
    ] as const;
    const items = damageIcons.map(([damageType], index) => ({
      name: `Uncharted Resonance ${index}`,
      type: 'feat',
      img: 'icons/svg/mystery-man.svg',
      system: { activities: { a: { type: 'damage', damage: { parts: [{ types: [damageType] }] } } } },
    }));
    const { actor } = resolve(items);
    expect(actor.items.map((item) => item.img)).toEqual(damageIcons.map(([, path]) => path));
    expect(damageIcons.every(([, path]) => lockedFiles.has(path))).toBe(true);
    expect(actor.items.map(withoutImages)).toEqual(items.map(withoutImages));
  });

  test('gives equipment and consumable activities their own icons without changing the parent Item type', () => {
    const items = [
      {
        name: 'Guardian Aegis', type: 'equipment', img: 'icons/svg/item-bag.svg',
        system: { activities: {
          bash: { name: 'Forceful Bash', type: 'attack', damage: { parts: [{ types: ['force'] }] } },
          flame: { type: 'damage', damage: { parts: [{ types: ['fire'] }] } },
          quiet: { type: 'utility' },
        } },
      },
      {
        name: 'Quicksilver Vial', type: 'consumable', img: 'icons/svg/item-bag.svg',
        system: { activities: {
          acid: { type: 'save', damage: { parts: [{ types: ['acid'] }] } },
          restore: { type: 'heal', healing: { number: 1 } },
          chill: { name: '寒雾', type: 'damage', damage: { parts: [{ types: ['cold'] }] } },
        } },
      },
    ];
    const { actor, review } = resolve(items);
    const shield = actor.items[0]!;
    const vial = actor.items[1]!;
    expect(shield.type).toBe('equipment');
    expect(vial.type).toBe('consumable');
    expect(shield.system.activities.bash.img).toBe('systems/dnd5e/icons/svg/damage/force.svg');
    expect(shield.system.activities.flame.img).toBe('icons/magic/fire/orb-vortex.webp');
    expect(shield.system.activities.quiet.img).toBe(shield.img);
    expect(vial.system.activities.acid.img).toBe('icons/magic/acid/projectile-faceted-glob.webp');
    expect(vial.system.activities.restore.img).toBe('icons/magic/life/heart-hand-gold-green.webp');
    expect(vial.system.activities.chill.img).toBe('icons/magic/water/orb-ice-glow.webp');
    expect(review.filter((entry) => entry.itemName.includes(' / '))).toHaveLength(6);
    expect(actor.items.map(withoutImages)).toEqual(items.map(withoutImages));
  });

  test('does not use an exact Fireball name when structured damage contradicts it', () => {
    const items = [
      { name: 'Fireball', type: 'spell', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'attack', damage: { parts: [{ types: ['cold'] }] } } } } },
      { name: 'Fireball', type: 'spell', img: 'icons/svg/mystery-man.svg', system: { activities: { a: { type: 'attack', damage: { parts: [{ types: ['fire', 'cold'] }] } } } } },
    ];
    const { actor, review } = resolve(items);
    expect(actor.items.map((item) => item.img)).toEqual([
      lockedCatalog.typeDefaults.spell,
      lockedCatalog.typeDefaults.spell,
    ]);
    expect(review.filter((entry) => !entry.itemName.includes(' / ')).map((entry) => entry.source))
      .toEqual(['type-default', 'type-default']);
    expect(actor.items.map(withoutImages)).toEqual(items.map(withoutImages));
  });
});

describe('description content icons', () => {
  const lockedCatalog = loadV14IconCatalog();
  const files = new Set(lockedCatalog.files.map((file) => file.path));
  const paths = {
    disguise: 'icons/magic/symbols/mask-metal-silver-white.webp',
    synergy: 'icons/skills/social/diplomacy-unity-alliance.webp',
    siphon: 'icons/magic/control/energy-stream-link-blue.webp',
    fear: 'icons/magic/control/fear-fright-mask-orange.webp',
    curse: 'icons/magic/control/voodoo-doll-pain-damage-purple.webp',
    liquid: 'icons/magic/acid/pouring-gas-smoke-liquid.webp',
    swim: 'icons/magic/water/waves-water-blue.webp',
    plants: 'icons/magic/nature/root-vine-entangled-humanoid.webp',
  } as const;

  function resolve(description: string, damage: string[] = [], existing = 'icons/svg/mystery-man.svg') {
    const item = { name: 'Unrelated Name', type: 'feat', img: existing,
      system: { description: { value: description }, activities: {
        a: { type: damage.length ? 'save' : 'utility', damage: { parts: [{ types: damage }] } },
      } } };
    const before = structuredClone(item);
    const review: IconReviewEntry[] = [];
    new V14IconResolver({ catalog: lockedCatalog, overrides: overrides(), review }).resolveStandaloneItem(item);
    const imageFree = (value: unknown): unknown => Array.isArray(value) ? value.map(imageFree)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
          .filter(([key]) => key !== 'img').map(([key, child]) => [key, imageFree(child)])) : value;
    expect(imageFree(item)).toEqual(imageFree(before));
    expect(files.has(item.img)).toBe(true);
    return { item, review: review[0]! };
  }

  // Names and owner are deliberately unrelated; these are not creature overrides.
  const cases: Array<[string, string, string, string[]?]> = [
    ['disguise EN', 'It perfectly mimics the voice and appearance of any humanoid.', paths.disguise],
    ['disguise ZH', '它可以假扮其他生物，改变自己的容貌和声音。', paths.disguise],
    ['synergy EN', 'While two allies are nearby, its attack rolls have advantage.', paths.synergy],
    ['synergy ZH', '附近有盟友时，它的攻击检定获得优势。', paths.synergy],
    ['siphon EN', 'The creature siphons magic from a hostile wizard.', paths.siphon],
    ['siphon resource', "It casts a known spell using that creature's spell slots.", paths.siphon],
    ['siphon ZH', '它借用目标所知的法术，消耗该生物的法术位。', paths.siphon],
    ['fear EN', '<p>On failure, the target becomes <strong>frightened</strong> for 1 minute (Save Ends).</p>', paths.fear],
    ['fear alternative', 'Each enemy must succeed on a save or become frightened.', paths.fear],
    ['fear ZH', '失败：该生物恐慌1分钟，在回合结束时再次豁免，成功则结束恐慌。', paths.fear],
    ['fear with restriction', 'The target is frightened and cannot move.', paths.fear],
    ['curse EN', 'On a failure, the creature is cursed.', paths.curse],
    ['curse alternative', 'It places a hex upon the victim.', paths.curse],
    ['curse ZH', '失败时目标受到诅咒。', paths.curse],
    ['curse with restriction', '目标受到诅咒，不能施放法术。', paths.curse],
    ['liquid EN', '<p>A stinging brine surges over the target.</p><p>Failure: Acid and Necrotic damage.</p>', paths.liquid, ['acid', 'necrotic']],
    ['liquid ZH', '它喷出腐蚀性液体，击中目标。', paths.liquid, ['acid', 'fire']],
    ['swim EN', 'The creature moves up to half its Swim Speed, then attempts to Hide.', paths.swim],
    ['swim alternative', 'It submerges beneath the surface and swims away.', paths.swim],
    ['swim ZH', '它移动至多其游泳速度的一半，随后可以尝试躲藏。', paths.swim],
    ['plant EN', 'Roots grow around a target and restrain it.', paths.plants],
    ['plant ZH', '藤蔓缠住一个目标，使它被束缚。', paths.plants],
  ];
  test.each(cases.map(([label, description, expected, damage = []]) => [label, description, expected, damage] as const))('matches %s from body content without a feature name', (_label, description, expected, damage) => {
    const { item, review } = resolve(description, damage);
    expect(item.img).toBe(expected);
    expect(review.source).toBe('semantic');
    expect(review.reasons[0]).toContain('description');
  });

  test.each([
    'The creature is immune to being frightened and cannot be cursed.',
    'It removes a curse from the target and does not frighten anyone.',
    'One frightened creature must make a saving throw.',
    'A creature cursed by it can be chosen as the target.',
    'It is immune to fear. A frightened target is eligible.',
    '目标免疫恐慌和诅咒。',
    '失败时目标不会恐慌。',
    'No creature becomes frightened.',
    'It does not imitate a voice or change its appearance.',
    'Roots grow around the creature but do not restrain it.',
    '一个已经恐慌的生物必须进行豁免。',
    '受其诅咒的生物可以被选为目标。',
    '它移除目标身上的诅咒。',
    'It uses its own spell slots to cast a spell.',
    'The target\'s swim speed is reduced to zero.',
    '目标的游泳速度降低10尺。',
    '<!-- The target is cursed. --><script>The target is frightened.</script>Unexplained power.',
  ])('does not confuse prerequisites, defenses or unrelated text: %s', (description) => {
    expect(resolve(description).item.img).toBe(lockedCatalog.typeDefaults.feat!);
  });

  test('preserves explicit artwork and keeps mixed damage without a clear visual form ambiguous', () => {
    expect(resolve('The target is frightened.', [], 'icons/svg/aura.svg').item.img).toBe('icons/svg/aura.svg');
    expect(resolve('An unexplained pulse harms the target.', ['acid', 'necrotic']).item.img)
      .toBe(lockedCatalog.typeDefaults.feat!);
    expect(resolve('A liquid surges over the target.', ['fire', 'cold']).item.img)
      .toBe(lockedCatalog.typeDefaults.feat!);
  });
});
