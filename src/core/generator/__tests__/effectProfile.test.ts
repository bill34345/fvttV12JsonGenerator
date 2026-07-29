import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActorGenerator } from '../actor';
import { generateEnhancedConditionEffects } from '../actor-effects';
import { EffectProfileApplier } from '../effectProfileApplier';
import { prepareStructureForComparison } from '../../utils/assertEqualStructure';

interface MutableTestEffect {
  name: string;
  system?: { changes: Array<Record<string, unknown>> };
  flags?: Record<string, unknown>;
}

interface MutableTestActor {
  items: Array<{
    name: string;
    system: { description: { value: string } };
    effects: MutableTestEffect[];
  }>;
}
import { ParserFactory } from '../../parser/router';
import { splitCollection, parseCreatureBlock } from '../../ingest/plaintext';
import type { FvttTargetVersion } from '../../foundryTarget';

const SOURCE_PATH = resolve(
  process.cwd(),
  'tests/fixtures/plaintext/月蚀矿腐化生物数据.md',
);
const DAE_FIXTURE_PATH = resolve(
  process.cwd(),
  'obsidian/dnd数据转fvttjson/input/dae-until-damaged-warden.md',
);

function loadActor(effectProfile: 'core' | 'modded-v12' | 'modded-v14', fvttVersion: FvttTargetVersion = '12') {
  const text = readFileSync(SOURCE_PATH, 'utf-8');
  const target = splitCollection(text).find((block) => block.englishName === 'Slithering Bloodfin');
  if (!target) {
    throw new Error('Expected Slithering Bloodfin block');
  }

  const generated = parseCreatureBlock(target.rawBlock);
  const parserFactory = new ParserFactory();
  const route = parserFactory.detectRoute(generated.markdown);
  const parsed = parserFactory.parse(generated.markdown);

  return new ActorGenerator({
    fvttVersion,
    translationService: null,
    effectProfile,
  } as any).generateForRoute(parsed, route);
}

function loadDaeFixture(effectProfile: 'core' | 'modded-v14') {
  const markdown = readFileSync(DAE_FIXTURE_PATH, 'utf-8');
  const parserFactory = new ParserFactory();
  const route = parserFactory.detectRoute(markdown);
  const parsed = parserFactory.parse(markdown);
  return new ActorGenerator({
    fvttVersion: '14',
    translationService: null,
    effectProfile,
  } as any).generateForRoute(parsed, route);
}

describe('ActorGenerator effect profiles', () => {
  it('core omits midi-qol over-time automation for bleed and does not create swallow placeholder effects', async () => {
    const actor = await loadActor('core');
    const swallow = actor.items.find((item: any) => item.name.includes('吞咽'));
    expect(swallow).toBeDefined();
    expect(
      actor.items.some((item: any) =>
        (item.effects ?? []).some((effect: any) => Boolean(effect?.flags?.['midi-qol.OverTime'])),
      ),
    ).toBe(false);
    expect((swallow.effects ?? []).some((effect: any) => /Swallowed|吞咽中/i.test(String(effect?.name ?? '')))).toBe(false);
  });

  it('modded-v12 does not create unconditional swallow or bleed placeholder effects', async () => {
    const actor = await loadActor('modded-v12');
    const swallow = actor.items.find((item: any) => item.name.includes('吞咽'));
    expect(swallow).toBeDefined();
    expect(
      actor.items.some((item: any) =>
        (item.effects ?? []).some((effect: any) => Boolean(effect?.flags?.['midi-qol.OverTime'])),
      ),
    ).toBe(false);
    expect((swallow.effects ?? []).some((effect: any) => /Swallowed|吞咽中/i.test(String(effect?.name ?? '')))).toBe(false);
  });

  it('modded-v12 preserves Heavy Hit and Dazed as structured hints instead of resolving branches', async () => {
    const actor = await loadActor('modded-v12');
    const hintedItem = actor.items.find(
      (item: any) =>
        item.flags?.fvttJsonGenerator?.effectHints?.heavyHit &&
        item.flags?.fvttJsonGenerator?.effectHints?.dazed,
    );
    expect(hintedItem).toBeDefined();
    expect(hintedItem.effects ?? []).toHaveLength(0);
    for (const activity of Object.values(hintedItem.system.activities ?? {}) as any[]) {
      expect(activity.effects ?? []).toHaveLength(0);
    }
  });

  it('creates over-time automation only when bleeding damage formula and type are explicit', () => {
    const implicit = generateEnhancedConditionEffects('目标开始流血 (Bleeding) `1d6`。', {}, 'Bleeding Bite');
    const explicit = generateEnhancedConditionEffects(
      '目标开始流血 (Bleeding) `1d6` piercing damage。',
      {},
      'Bleeding Bite',
    );

    expect(implicit[0]?.flags?.['midi-qol.OverTime']).toBeUndefined();
    expect(explicit[0]?.flags?.['midi-qol.OverTime']).toBe(
      'turn=start,damageRoll=1d6,damageType=piercing,label=流血 (Bleeding)',
    );
  });

  it('creates condition effects only from explicit target-application clauses', () => {
    const positives = [
      {
        text: 'Hit: the target is grappled and restrained until it escapes.',
        statuses: ['grappled', 'restrained'],
      },
      {
        text: 'Each creature must succeed on a DC 15 Wisdom saving throw or become frightened.',
        statuses: ['frightened'],
      },
      {
        text: '目标必须成功通过豁免，否则陷入中毒状态。',
        statuses: ['poisoned'],
      },
      {
        text: '豁免失败：受到 10（3d6）点毒素伤害，并陷入中毒 (Poisoned) 状态。',
        statuses: ['poisoned'],
      },
      {
        text: '豁免失败：目标被魔法魅惑 (Charmed) 并受施法者控制。',
        statuses: ['charmed'],
      },
      {
        text: '命中：目标被擒抱 (Grappled)，并同时陷入受限 (Restrained) 状态。',
        statuses: ['grappled', 'restrained'],
      },
      {
        text: '若目标免疫恐慌状态，改为受到伤害，且陷入眩晕 (Dazed)。',
        statuses: ['dazed'],
      },
    ];

    for (const testCase of positives) {
      const effects = generateEnhancedConditionEffects(testCase.text, {}, 'Condition Fixture');
      expect(effects.flatMap((effect: any) => effect.statuses ?? []).sort()).toEqual(testCase.statuses.sort());
    }

    const negatives = [
      'The orc reverts to its true form if it falls unconscious.',
      'The creature has advantage on saving throws against being frightened.',
      'Melee Weapon Attack: +5 to hit, one grappled creature.',
      'If the target is already poisoned, it takes extra damage.',
    ];

    for (const text of negatives) {
      expect(generateEnhancedConditionEffects(text, {}, 'Condition Fixture')).toEqual([]);
    }
  });

  it.each([
    [
      'Chinese repeated save',
      '体质豁免：DC11。首次失败：目标陷入束缚状态。再次失败：目标陷入石化状态替代其束缚状态。',
    ],
    [
      'English ordinal failures',
      'On the first failed save, the target is restrained. On the second failed save, it becomes petrified instead of restrained.',
    ],
    [
      'English fails again',
      'On a failed save, the creature becomes restrained. If it fails this save again, it becomes petrified, replacing restrained.',
    ],
  ] as const)('does not link staged save outcomes as simultaneous immediate effects: %s', (
    _label,
    text,
  ) => {
    expect(generateEnhancedConditionEffects(text, {}, 'Staged Save Fixture')).toEqual([]);
  });

  it('continues to link unconditional immediate multiple statuses', () => {
    const effects = generateEnhancedConditionEffects(
      'Hit: the target is grappled and restrained until it escapes.',
      {},
      'Immediate Status Control',
    );

    expect(effects.flatMap((effect: any) => effect.statuses ?? []).sort()).toEqual([
      'grappled',
      'restrained',
    ]);
  });

  it.each([
    [
      'English same clause',
      'On a failed save, the target becomes frightened until it takes damage.',
      'frightened',
    ],
    [
      '中文同句',
      '豁免失败：目标陷入中毒状态，直到它受到伤害为止。',
      'poisoned',
    ],
    [
      'English following sentence',
      'Hit: the target is stunned. This condition lasts until the target takes damage.',
      'stunned',
    ],
  ] as const)('preserves the source duration hint when an inflicted condition lasts until damage: %s', (
    _label,
    text,
    expectedStatus,
  ) => {
    const effects = generateEnhancedConditionEffects(text, {}, 'Until Damaged Fixture');
    const effect = effects.find((candidate: any) => candidate.statuses?.includes(expectedStatus));

    expect(effect).toBeDefined();
    expect(effect?.flags?.fvttJsonGenerator?.sourceDuration).toBe('untilDamaged');
  });

  it('marks the linked activity duration as special so dnd5e does not immediately suppress an until-damaged effect', () => {
    const activities = {
      dreadBrand: {
        duration: { units: 'inst', concentration: false, override: false },
        effects: [],
      },
    };

    generateEnhancedConditionEffects(
      'Hit: the target becomes frightened until it takes damage.',
      activities,
      'Dread Brand',
    );

    expect(activities.dreadBrand.duration).toEqual({
      units: 'spec',
      concentration: false,
      override: false,
    });
  });

  it('keeps an instantaneous activity unchanged when damage prose is not an effect duration', () => {
    const activities = {
      venomStrike: {
        duration: { units: 'inst', concentration: false, override: false },
        effects: [],
      },
    };

    generateEnhancedConditionEffects(
      'Hit: the target becomes poisoned. If the target takes damage from this attack, it also loses its reaction.',
      activities,
      'Venom Strike',
    );

    expect(activities.venomStrike.duration.units).toBe('inst');
  });

  it('does not infer an until-damaged duration from neighboring damage prose', () => {
    const effects = generateEnhancedConditionEffects(
      'Hit: the target becomes poisoned. If the target takes damage from this attack, it also loses its reaction.',
      {},
      'Until Damaged Negative',
    );

    expect(effects[0]?.statuses).toContain('poisoned');
    expect(effects[0]?.flags?.fvttJsonGenerator?.sourceDuration).toBeUndefined();
  });

  it('binds an until-damaged clause only to the status it actually modifies', () => {
    const effects = generateEnhancedConditionEffects(
      'Hit: the target becomes frightened until it takes damage and is poisoned for 1 minute.',
      {},
      'Until Damaged Mixed Durations',
    );
    const frightened = effects.find((effect: any) => effect.statuses?.includes('frightened'));
    const poisoned = effects.find((effect: any) => effect.statuses?.includes('poisoned'));

    expect(frightened?.flags?.fvttJsonGenerator?.sourceDuration).toBe('untilDamaged');
    expect(poisoned).toBeDefined();
    expect(poisoned?.flags?.fvttJsonGenerator?.sourceDuration).toBeUndefined();
  });

  it('maps only the neutral until-damaged hint to DAE 14.0.12 and strips DAE flags from core', () => {
    const hintedEffect: MutableTestEffect = {
      name: 'Frightened',
      flags: {
        fvttJsonGenerator: { sourceDuration: 'untilDamaged' },
      },
    };
    const unrelatedEffect: MutableTestEffect = {
      name: 'Unrelated prone',
      flags: {
        fvttJsonGenerator: { sourceClause: 'explicit-target-condition' },
      },
    };
    const staleCoreDaeEffect: MutableTestEffect = {
      name: 'Stale DAE flag',
      flags: {
        fvttJsonGenerator: { sourceClause: 'explicit-target-condition' },
        dae: { specialDuration: ['isDamaged'] },
      },
    };
    const coreActor: MutableTestActor = { items: [{
      name: 'Core source duration',
      system: { description: { value: 'explicit source duration' } },
      effects: [structuredClone(hintedEffect), structuredClone(unrelatedEffect), structuredClone(staleCoreDaeEffect)],
    }] };
    const moddedV14Actor: MutableTestActor = { items: [{
      name: 'Modded source duration',
      system: { description: { value: 'explicit source duration' } },
      effects: [structuredClone(hintedEffect), structuredClone(unrelatedEffect)],
    }] };

    const applier = new EffectProfileApplier();
    applier.apply(coreActor, 'core');
    applier.apply(moddedV14Actor, 'modded-v14');

    expect(coreActor.items[0]?.effects[0]?.flags).toEqual({
      fvttJsonGenerator: { sourceDuration: 'untilDamaged' },
    });
    expect(coreActor.items[0]?.effects[1]?.flags).toEqual({
      fvttJsonGenerator: { sourceClause: 'explicit-target-condition' },
    });
    expect(coreActor.items[0]?.effects[2]?.flags).toEqual({
      fvttJsonGenerator: { sourceClause: 'explicit-target-condition' },
    });
    expect(moddedV14Actor.items[0]?.effects[0]?.flags).toEqual({
      fvttJsonGenerator: { sourceDuration: 'untilDamaged' },
      dae: { specialDuration: ['isDamaged'] },
    });
    expect(moddedV14Actor.items[0]?.effects[1]?.flags).toEqual({
      fvttJsonGenerator: { sourceClause: 'explicit-target-condition' },
    });
  });

  it('keeps the real DAE fixture source-equivalent while adding exactly one modded-v14 duration', async () => {
    const coreActor = await loadDaeFixture('core');
    const moddedActor = await loadDaeFixture('modded-v14');
    const coreBrand = coreActor.items.find((item: any) => item.name === 'Dread Brand');
    const moddedBrand = moddedActor.items.find((item: any) => item.name === 'Dread Brand');
    const coreFist = coreActor.items.find((item: any) => item.name === 'Stone Fist');
    const moddedFist = moddedActor.items.find((item: any) => item.name === 'Stone Fist');
    const coreEffect = coreBrand?.effects?.find((effect: any) => effect.statuses?.includes('frightened'));
    const moddedEffect = moddedBrand?.effects?.find((effect: any) => effect.statuses?.includes('frightened'));
    const coreBrandActivity = Object.values(coreBrand?.system.activities ?? {})[0] as any;
    const moddedBrandActivity = Object.values(moddedBrand?.system.activities ?? {})[0] as any;
    const coreFistActivity = Object.values(coreFist?.system.activities ?? {})[0] as any;
    const moddedFistActivity = Object.values(moddedFist?.system.activities ?? {})[0] as any;

    expect(coreActor.name).toBe('Damage-Bound Warden');
    expect(moddedActor.name).toBe(coreActor.name);
    expect(moddedActor.items.map((item: any) => item.name)).toEqual(coreActor.items.map((item: any) => item.name));
    expect(coreEffect?.flags).toEqual({
      fvttJsonGenerator: { sourceDuration: 'untilDamaged' },
    });
    expect(moddedEffect?.flags).toEqual({
      fvttJsonGenerator: { sourceDuration: 'untilDamaged' },
      dae: { specialDuration: ['isDamaged'] },
    });
    expect(coreBrandActivity?.duration?.units).toBe('spec');
    expect(moddedBrandActivity?.duration?.units).toBe('spec');
    expect(coreFistActivity?.duration).toBeUndefined();
    expect(moddedFistActivity?.duration).toBeUndefined();
    expect(coreFist?.effects ?? []).toEqual([]);
    expect(moddedFist?.effects ?? []).toEqual([]);
    expect(moddedActor.items.flatMap((item: any) => item.effects ?? [])
      .filter((effect: any) => effect.flags?.dae?.specialDuration)).toHaveLength(1);
    const comparisonOptions = {
      ignorePaths: [
        'items.*.effects.*._id',
        'items.*.effects.*.flags.dae',
        'items.*.system.activities.*.effects.*._id',
      ],
    };
    expect(prepareStructureForComparison(moddedActor, comparisonOptions)).toEqual(
      prepareStructureForComparison(coreActor, comparisonOptions),
    );
  });

  it('modded-v14 converts source-derived midi-qol OverTime to the ActiveEffect change read by MIDI 14.0.11 while core strips it', () => {
    const effect: MutableTestEffect = {
      name: '流血 (Bleeding)',
      flags: {
        'midi-qol.OverTime': 'turn=start,damageRoll=1d6,damageType=piercing,label=流血 (Bleeding)',
      },
    };
    const coreActor: MutableTestActor = { items: [{ name: 'Bleeding Bite', system: { description: { value: 'explicit bleeding' } }, effects: [structuredClone(effect)] }] };
    const moddedV14Actor: MutableTestActor = { items: [{ name: 'Bleeding Bite', system: { description: { value: 'explicit bleeding' } }, effects: [structuredClone(effect)] }] };

    const applier = new EffectProfileApplier();
    applier.apply(coreActor, 'core');
    applier.apply(moddedV14Actor, 'modded-v14');

    expect(coreActor.items[0]?.effects[0]?.flags).toBeUndefined();
    expect(coreActor.items[0]?.effects[0]?.system?.changes ?? []).toEqual([]);
    expect(moddedV14Actor.items[0]?.effects[0]?.flags).toBeUndefined();
    expect(moddedV14Actor.items[0]?.effects[0]?.system?.changes).toEqual([{
      key: 'flags.midi-qol.OverTime',
      mode: 5,
      value: 'turn=start,damageRoll=1d6,damageType=piercing,label=流血 (Bleeding)',
      priority: 20,
    }]);
  });

  it('modded-v14 preserves complete source-derived OverTime values without converting neighboring flags', () => {
    const actor: MutableTestActor = { items: [{
      name: 'Generic repeated damage',
      system: { description: { value: 'explicit repeated damage' } },
      effects: [{
        name: 'Repeated damage',
        system: { changes: [] },
        flags: {
          'midi-qol.OverTime': 'turn=start,damageRoll=2d4,damageType=acid,label=Acid Burn,saveDC=15,saveAbility=dex,saveRemove=True',
          'midi-qol': { unrelated: true },
        },
      }, {
        name: 'Fire repeat',
        system: { changes: [{ key: 'system.attributes.ac.flat', mode: 2, value: '1', priority: 20 }] },
        flags: {
          'midi-qol.OverTime': 'turn=end,damageRoll=1d10,damageType=fire,label=Burning',
        },
      }],
    }] };

    new EffectProfileApplier().apply(actor, 'modded-v14');

    expect(actor.items[0]?.effects[0]?.system?.changes).toEqual([{
      key: 'flags.midi-qol.OverTime',
      mode: 5,
      value: 'turn=start,damageRoll=2d4,damageType=acid,label=Acid Burn,saveDC=15,saveAbility=dex,saveRemove=True',
      priority: 20,
    }]);
    expect(actor.items[0]?.effects[0]?.flags).toEqual({ 'midi-qol': { unrelated: true } });
    expect(actor.items[0]?.effects[1]?.system?.changes).toEqual([
      { key: 'system.attributes.ac.flat', mode: 2, value: '1', priority: 20 },
      {
        key: 'flags.midi-qol.OverTime',
        mode: 5,
        value: 'turn=end,damageRoll=1d10,damageType=fire,label=Burning',
        priority: 20,
      },
    ]);
  });
});
