import { describe, expect, test } from 'bun:test';
import { applyNineteenCritical, retainedD20Face, setInjuryStacks, transitionInjury } from '../src/injury.ts';
import { createActorModuleState, createFadingSpiritsState, createInjuryState, parseActorModuleState } from '../src/state.ts';

function hp(injury = createInjuryState(10, 10), oldValue = 10, newValue = 0, id = 'tx', oldMax = 10, newMax = 10) {
  return transitionInjury(injury, createFadingSpiritsState(), { kind: 'hp', transactionId: id, at: 1, oldValue, newValue, oldMax, newMax });
}

describe('injury episode state machine', () => {
  test('opens on positive to zero, sets failures, and adds once on recovery', () => {
    const down = hp();
    expect(down.injury.episode.open).toBe(true);
    expect(down.actions).toContainEqual({ type: 'setDeathFailures', failures: 0 });
    const up = hp(down.injury, 0, 4, 'up');
    expect(up.injury.stacks).toBe(1);
    expect(up.injury.episode.open).toBe(false);
    const duplicateRecovery = hp(up.injury, 0, 5, 'up-again');
    expect(duplicateRecovery.injury.stacks).toBe(1);
  });

  test('stabilization at zero does not add injury', () => {
    const down = hp();
    const stable = hp(down.injury, 0, 0, 'stable');
    expect(stable.injury.stacks).toBe(0);
    expect(stable.injury.episode.open).toBe(true);
  });

  test('suppressed resurrection consumes suppression without adding injury', () => {
    const down = hp();
    down.injury.suppressNextRecovery = { transactionId: 'res', reason: 'resurrection' };
    const up = hp(down.injury, 0, 1, 'res-up');
    expect(up.injury.stacks).toBe(0);
    expect(up.injury.suppressNextRecovery).toBeNull();
  });

  test('actual healing to full clears but lowering max does not', () => {
    const injury = createInjuryState(5, 10); injury.stacks = 2;
    const healed = hp(injury, 5, 10, 'full', 10, 10);
    expect(healed.injury.stacks).toBe(0);
    const second = createInjuryState(10, 10); second.stacks = 2;
    const maxOnly = hp(second, 10, 10, 'max-down', 10, 8);
    expect(maxOnly.injury.stacks).toBe(2);
  });

  test('successful short and long rests clear injury', () => {
    for (const restType of ['short', 'long'] as const) {
      const injury = createInjuryState(3, 10); injury.stacks = 2;
      const result = transitionInjury(injury, createFadingSpiritsState(), { kind: 'rest', transactionId: restType, at: 1, restType });
      expect(result.injury.stacks).toBe(0);
    }
  });

  test('three stacks prompts without writing failures', () => {
    const injury = createInjuryState(5, 10); injury.stacks = 3;
    const down = hp(injury, 5, 0, 'three');
    expect(down.actions).toEqual([{ type: 'promptThreeStackDecision', stacks: 3, episodeId: 'three' }]);
  });

  test('every automatic and manual path is capped at three stacks', () => {
    const injury = createInjuryState(5, 10); injury.stacks = 3;
    const down = hp(injury, 5, 0, 'cap-down');
    const up = hp(down.injury, 0, 4, 'cap-up');
    expect(up.injury.stacks).toBe(3);
    expect(up.actions).not.toContainEqual(expect.objectContaining({ type: 'injuryAdded' }));
    expect(setInjuryStacks(injury, 4).stacks).toBe(3);
    expect(setInjuryStacks(injury, 999).stacks).toBe(3);
  });

  test('legacy persisted stacks above three normalize to three on read', () => {
    const raw = createActorModuleState(5, 10);
    raw.injury.stacks = 4;
    expect(parseActorModuleState(raw, 5, 10).injury.stacks).toBe(3);
  });

  test('duplicate transaction is idempotent', () => {
    const down = hp();
    const replay = hp(down.injury, 10, 0, 'tx');
    expect(replay.duplicate).toBe(true);
    expect(replay.actions).toEqual([]);
  });

  test('recovery without an open episode does not treat import or reload as an injury', () => {
    const imported = createInjuryState(0, 10);
    const result = hp(imported, 0, 1, 'import-recovery');
    expect(result.injury.stacks).toBe(0);
    expect(result.actions).toEqual([]);
  });

  test('existing stacks become exact starting failures and a new death resets the rapid lock', () => {
    const injury = createInjuryState(5, 10); injury.stacks = 2;
    const fading = createFadingSpiritsState(); fading.rapidResurrectionLockedForCurrentDeath = true; fading.resurrectionConsumedForCurrentDeath = true;
    const result = transitionInjury(injury, fading, { kind: 'hp', transactionId: 'new-death', at: 1, oldValue: 5, newValue: 0, oldMax: 10, newMax: 10 });
    expect(result.actions).toContainEqual({ type: 'setDeathFailures', failures: 2 });
    expect(result.fading.rapidResurrectionLockedForCurrentDeath).toBe(false);
    expect(result.fading.resurrectionConsumedForCurrentDeath).toBe(false);
    expect(result.fading.currentDeathEpisodeId).toBe('new-death');
  });
});

describe('death-save retained face', () => {
  test('uses only active retained result', () => {
    const roll = { d20: { results: [{ result: 20, active: false, discarded: true }, { result: 19, active: true }] } };
    expect(retainedD20Face(roll)).toBe(19);
    const details: Record<string, unknown> = { updates: { old: true } };
    expect(applyNineteenCritical(details, 19)).toBe(true);
    expect(details.updates).toEqual({
      'system.attributes.death.success': 0,
      'system.attributes.death.failure': 0,
      'system.attributes.hp.value': 1,
    });
  });

  test('discarded 19 does not count', () => {
    const roll = { dice: [{ faces: 20, results: [{ result: 19, active: false, discarded: true }, { result: 5, active: true }] }] };
    expect(retainedD20Face(roll)).toBe(5);
    expect(applyNineteenCritical({}, 5)).toBe(false);
  });
});
