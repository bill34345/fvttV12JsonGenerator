import { describe, expect, test } from 'bun:test';
import { applyGradedStatusDelta, collectTargets, conditionLevel } from '../src/core.ts';

const EFFECT_ID = 'dnd5eexhaustion';

function actor(id: string, level: number, isToken = false) {
  const effects = new Map<string, any>();
  if (level > 0) effects.set(EFFECT_ID, { system: { type: 'exhaustion', level } });
  const calls: number[] = [];
  return {
    uuid: id, isToken, effects, calls,
    async toggleStatusEffect(_id: string, options: { levels: number }) {
      calls.push(options.levels);
      const current = conditionLevel(this, 'exhaustion', EFFECT_ID);
      // 6.0.5 ConditionData._applyDelta updates existing effects and deletes at
      // zero. Its Core fallback can create a status when called at zero with -1.
      if (current === 0 && options.levels < 0) throw new Error('negative delta at zero');
      const next = Math.min(6, current + options.levels);
      if (next === 0) effects.delete(EFFECT_ID);
      else effects.set(EFFECT_ID, { system: { type: 'exhaustion', level: next } });
    },
  };
}

function token(id: string, holder: any) {
  return { name: id, document: { uuid: `Scene.test.Token.${id}`, id, actor: holder }, actor: holder };
}

function targets(...actors: any[]) {
  return collectTargets(actors.map((value, index) => token(String(index), value)), null);
}

describe('dnd5e 6.0.5 graded HUD status', () => {
  test('each distinct Actor gains and loses one level without copying the source level', async () => {
    const first = actor('Actor.first', 1);
    const second = actor('Actor.second', 3);
    const third = actor('Actor.third', 0);
    const selected = targets(first, second, third);
    await applyGradedStatusDelta(selected, 'exhaustion', EFFECT_ID, 6, 1);
    expect([first, second, third].map((item) => conditionLevel(item, 'exhaustion', EFFECT_ID))).toEqual([2, 4, 1]);
    await applyGradedStatusDelta(selected, 'exhaustion', EFFECT_ID, 6, -1);
    expect([first, second, third].map((item) => conditionLevel(item, 'exhaustion', EFFECT_ID))).toEqual([1, 3, 0]);
  });

  test('zero decrement and maximum increment are independent no-ops', async () => {
    const zero = actor('Actor.zero', 0);
    const one = actor('Actor.one', 1);
    await applyGradedStatusDelta(targets(zero, one), 'exhaustion', EFFECT_ID, 6, -1);
    expect(zero.calls).toEqual([]);
    expect(one.calls).toEqual([-1]);
    const six = actor('Actor.six', 6);
    await applyGradedStatusDelta(targets(six, zero), 'exhaustion', EFFECT_ID, 6, 1);
    expect(six.calls).toEqual([]);
    expect(conditionLevel(zero, 'exhaustion', EFFECT_ID)).toBe(1);
  });

  test('two linked Tokens write one Actor once while independent synthetic Actors both change', async () => {
    const linked = actor('Actor.linked', 2);
    const syntheticA = actor('Scene.test.Token.a.Actor', 1, true);
    const syntheticB = actor('Scene.test.Token.b.Actor', 4, true);
    const selected = collectTargets([
      token('linked1', linked), token('linked2', linked), token('a', syntheticA), token('b', syntheticB),
    ], null);
    await applyGradedStatusDelta(selected, 'exhaustion', EFFECT_ID, 6, 1);
    expect([linked.calls, syntheticA.calls, syntheticB.calls]).toEqual([[1], [1], [1]]);
    expect([linked, syntheticA, syntheticB].map((item) => conditionLevel(item, 'exhaustion', EFFECT_ID))).toEqual([3, 2, 5]);
  });

  test('world Actor projection into a synthetic Actor is reconciled after the world write', async () => {
    const world = actor('Actor.world', 2);
    const synthetic = actor('Scene.test.Token.synthetic.Actor', 2, true);
    const originalToggle = world.toggleStatusEffect.bind(world);
    world.toggleStatusEffect = async (id, options) => {
      await originalToggle(id, options);
      synthetic.effects.set(EFFECT_ID, { system: { type: 'exhaustion', level: 3 } });
    };
    await applyGradedStatusDelta(targets(synthetic, world), 'exhaustion', EFFECT_ID, 6, 1);
    expect(world.calls).toEqual([1]);
    expect(synthetic.calls).toEqual([]);
    expect(conditionLevel(synthetic, 'exhaustion', EFFECT_ID)).toBe(3);
  });

  test('reads a condition by type when its configured id is unavailable', () => {
    const holder = actor('Actor.fallback', 3);
    expect(conditionLevel(holder, 'exhaustion', undefined)).toBe(3);
    expect(conditionLevel(holder, 'poisoned', undefined)).toBe(0);
  });
});
