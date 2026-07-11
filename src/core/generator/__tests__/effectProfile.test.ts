import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActorGenerator } from '../actor';
import { generateEnhancedConditionEffects } from '../actor-effects';
import { EffectProfileApplier } from '../effectProfileApplier';
import { ParserFactory } from '../../parser/router';
import { splitCollection, parseCreatureBlock } from '../../ingest/plaintext';
import type { FvttTargetVersion } from '../../foundryTarget';

const SOURCE_PATH = resolve(
  process.cwd(),
  'tests/fixtures/plaintext/月蚀矿腐化生物数据.md',
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

  it('modded-v14 converts source-derived midi-qol OverTime to the ActiveEffect change read by MIDI 14.0.9 while core strips it', () => {
    const effect = {
      name: '流血 (Bleeding)',
      flags: {
        'midi-qol.OverTime': 'turn=start,damageRoll=1d6,damageType=piercing,label=流血 (Bleeding)',
      },
    };
    const coreActor = { items: [{ name: 'Bleeding Bite', system: { description: { value: 'explicit bleeding' } }, effects: [structuredClone(effect)] }] };
    const moddedV14Actor = { items: [{ name: 'Bleeding Bite', system: { description: { value: 'explicit bleeding' } }, effects: [structuredClone(effect)] }] };

    const applier = new EffectProfileApplier();
    applier.apply(coreActor, 'core');
    applier.apply(moddedV14Actor, 'modded-v14');

    expect(coreActor.items[0].effects[0].flags).toBeUndefined();
    expect(coreActor.items[0].effects[0].system?.changes ?? []).toEqual([]);
    expect(moddedV14Actor.items[0].effects[0].flags).toBeUndefined();
    expect(moddedV14Actor.items[0].effects[0].system.changes).toEqual([{
      key: 'flags.midi-qol.OverTime',
      mode: 5,
      value: 'turn=start,damageRoll=1d6,damageType=piercing,label=流血 (Bleeding)',
      priority: 20,
    }]);
  });

  it('modded-v14 preserves complete source-derived OverTime values without converting neighboring flags', () => {
    const actor = { items: [{
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

    expect(actor.items[0].effects[0].system.changes).toEqual([{
      key: 'flags.midi-qol.OverTime',
      mode: 5,
      value: 'turn=start,damageRoll=2d4,damageType=acid,label=Acid Burn,saveDC=15,saveAbility=dex,saveRemove=True',
      priority: 20,
    }]);
    expect(actor.items[0].effects[0].flags).toEqual({ 'midi-qol': { unrelated: true } });
    expect(actor.items[0].effects[1].system.changes).toEqual([
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
