import { describe, expect, test } from 'bun:test';
import { MODULE_ID } from '../src/constants.ts';
import { beginRitual, canBeginRitual, rapidResurrectionDc, resurrectionDc, resurrectionTransactionId, resolveAttempt } from '../src/fading.ts';
import { createFadingSpiritsState, type RitualContributor } from '../src/state.ts';
import { __testing as uiTesting } from '../src/ui.ts';

const contributor = (actorUuid: string): RitualContributor => ({ actorUuid, check: 'prc', ability: null, dc: 15, advantageMode: 'normal', requestMessageId: null });

describe('Fading Spirits state machine', () => {
  test('calculates unclamped normal and rapid DCs', () => {
    const state = createFadingSpiritsState(); state.successfulReturns = 2; state.permanentDcPenalty = 1;
    expect(resurrectionDc(state, 3, 0)).toBe(4);
    expect(resurrectionDc(state, 0, 3)).toBe(16);
    expect(rapidResurrectionDc(state)).toBe(13);
  });

  test('normal success increments successful returns once and contains no raw die field', () => {
    let state = beginRitual(createFadingSpiritsState(), { id: 'r1', mode: 'normal', contributors: [contributor('Actor.a')], at: 1, gmId: 'gm' });
    const result = resolveAttempt(state, { id: 'r1', mode: 'normal', at: 2, gmId: 'gm', dc: 7, contributionSuccesses: 1, contributionFailures: 0, dieSucceeded: true, soulWilling: true });
    expect(result.state.successfulReturns).toBe(1);
    expect(result.state.pendingRitual).toBeNull();
    expect(JSON.stringify(result.state)).not.toContain('rawDie');
    const replay = resolveAttempt(result.state, { id: 'r1', mode: 'normal', at: 3, gmId: 'gm', dc: 7, dieSucceeded: true, soulWilling: true });
    expect(replay.duplicate).toBe(true);
    expect(replay.state.successfulReturns).toBe(1);
  });

  test('stable attempt IDs bind actor, death episode, mode, and ordinal', () => {
    const first = resurrectionTransactionId('Actor.hero', 'death-1', 'normal', 1);
    expect(first).toBe('resurrection:Actor.hero:death-1:normal:1');
    expect(resurrectionTransactionId('Actor.hero', 'death-1', 'normal', 1)).toBe(first);
    expect(resurrectionTransactionId('Actor.hero', 'death-2', 'normal', 1)).not.toBe(first);
    expect(resurrectionTransactionId('Actor.hero', 'death-1', 'rapid', 1)).not.toBe(first);
  });

  test('resolution lock document IDs are deterministic valid Foundry IDs', () => {
    const first = uiTesting.resolutionLockDocumentId('Actor.hero', 'resurrection:Actor.hero:death-1:rapid:1');
    expect(first).toBe(uiTesting.resolutionLockDocumentId('Actor.hero', 'resurrection:Actor.hero:death-1:rapid:1'));
    expect(first).toMatch(/^[a-z0-9]{16}$/);
    expect(first).not.toBe(uiTesting.resolutionLockDocumentId('Actor.hero', 'resurrection:Actor.hero:death-2:rapid:1'));
  });

  test('ritual cleanup releases the document lock after resolve clears pending state', async () => {
    const originalGame = (globalThis as any).game;
    const actorUuid = 'Actor.hero';
    const attemptId = 'resurrection:Actor.hero:death-1:normal:1';
    const token = 'ritual-token';
    let deleted = 0;
    const lockMessage = {
      id: uiTesting.resolutionLockDocumentId(actorUuid, attemptId),
      flags: { [MODULE_ID]: { resolutionLock: { actorUuid, attemptId, mode: 'normal', token, startedBy: 'gm' } } },
      delete: async () => { deleted += 1; },
    };
    const actor = { uuid: actorUuid, type: 'character', system: { attributes: { hp: { value: 0, max: 1 } } }, flags: { [MODULE_ID]: undefined } };
    (globalThis as any).game = {
      user: { id: 'gm', isGM: true },
      users: { activeGM: { id: 'gm' } },
      messages: { get: (id: string) => id === lockMessage.id ? lockMessage : null },
    };
    try {
      await uiTesting.releaseRitualResolution(actor, attemptId, token);
      expect(deleted).toBe(1);
    } finally {
      (globalThis as any).game = originalGame;
    }
  });

  test('a successful return is consumed for the current death and rejects a new ID', () => {
    const initial = createFadingSpiritsState();
    initial.currentDeathEpisodeId = 'death-1';
    const pending = beginRitual(initial, { id: 'return-1', mode: 'normal', contributors: [], at: 1, gmId: 'gm' });
    const result = resolveAttempt(pending, { id: 'return-1', mode: 'normal', at: 2, gmId: 'gm', dc: 10, dieSucceeded: true, soulWilling: true });
    expect(result.state.resurrectionConsumedForCurrentDeath).toBe(true);
    expect(canBeginRitual(result.state, 'normal').ok).toBe(false);
    expect(() => resolveAttempt(result.state, { id: 'return-2', mode: 'miracle', at: 3, gmId: 'gm', dc: 0, dieSucceeded: true, soulWilling: true })).toThrow();
  });

  test('persistent resolution lock rejects a different in-flight attempt and clears on resolve', () => {
    const state = createFadingSpiritsState();
    state.resolutionInProgress = { id: 'instant-1', mode: 'rapid', startedAt: 1, startedBy: 'gm', token: 'token-1' };
    expect(() => resolveAttempt(state, { id: 'instant-2', mode: 'miracle', at: 2, gmId: 'gm', dc: 0, dieSucceeded: true, soulWilling: true })).toThrow();
    const resolved = resolveAttempt(state, { id: 'instant-1', mode: 'rapid', at: 2, gmId: 'gm', dc: 10, dieSucceeded: false, soulWilling: true });
    expect(resolved.state.resolutionInProgress).toBeNull();
    expect(resolved.state.permanentDcPenalty).toBe(1);
  });

  test('rapid failure requires a long ritual and blocks a miracle retry', () => {
    const failed = resolveAttempt(createFadingSpiritsState(), { id: 'quick', mode: 'rapid', at: 1, gmId: 'gm', dc: 10, dieSucceeded: false, soulWilling: true });
    expect(() => resolveAttempt(failed.state, { id: 'miracle', mode: 'miracle', at: 2, gmId: 'gm', dc: 0, dieSucceeded: true, soulWilling: true })).toThrow();
    expect(canBeginRitual(failed.state, 'normal').ok).toBe(true);
  });

  test('soul refusal is declined and does not lock', () => {
    const state = beginRitual(createFadingSpiritsState(), { id: 'decline', mode: 'normal', contributors: [], at: 1, gmId: 'gm' });
    const result = resolveAttempt(state, { id: 'decline', mode: 'normal', at: 2, gmId: 'gm', dc: 10, dieSucceeded: true, soulWilling: false });
    expect(result.result).toBe('declined');
    expect(result.state.conventionalResurrectionLocked).toBe(false);
  });

  test('normal failure locks conventional resurrection', () => {
    const state = beginRitual(createFadingSpiritsState(), { id: 'fail', mode: 'normal', contributors: [], at: 1, gmId: 'gm' });
    const result = resolveAttempt(state, { id: 'fail', mode: 'normal', at: 2, gmId: 'gm', dc: 10, dieSucceeded: false, soulWilling: true });
    expect(result.state.conventionalResurrectionLocked).toBe(true);
    expect(canBeginRitual(result.state, 'normal').ok).toBe(false);
  });

  test('rapid failure adds permanent penalty and current-death lock', () => {
    const result = resolveAttempt(createFadingSpiritsState(), { id: 'quick', mode: 'rapid', at: 1, gmId: 'gm', dc: 10, dieSucceeded: false, soulWilling: true });
    expect(result.state.permanentDcPenalty).toBe(1);
    expect(result.state.rapidResurrectionLockedForCurrentDeath).toBe(true);
    expect(() => resolveAttempt(result.state, { id: 'quick2', mode: 'rapid', at: 2, gmId: 'gm', dc: 11, dieSucceeded: true, soulWilling: true })).toThrow();
  });

  test('final chance is consumed when the transaction begins', () => {
    const locked = createFadingSpiritsState(); locked.conventionalResurrectionLocked = true;
    const final = beginRitual(locked, { id: 'final', mode: 'final', contributors: [], at: 1, gmId: 'gm' });
    expect(final.finalChanceUsed).toBe(true);
    expect(() => beginRitual({ ...final, pendingRitual: null }, { id: 'again', mode: 'final', contributors: [], at: 2, gmId: 'gm' })).toThrow();
  });

  test('final success preserves the permanent lock and used marker', () => {
    const locked = createFadingSpiritsState(); locked.conventionalResurrectionLocked = true;
    const pending = beginRitual(locked, { id: 'final-success', mode: 'final', contributors: [], at: 1, gmId: 'gm' });
    const result = resolveAttempt(pending, { id: 'final-success', mode: 'final', at: 2, gmId: 'gm', dc: 10, dieSucceeded: true, soulWilling: true });
    expect(result.returned).toBe(true);
    expect(result.state.conventionalResurrectionLocked).toBe(true);
    expect(result.state.finalChanceUsed).toBe(true);
  });

  test('successful long ritual clears only the current-death rapid lock', () => {
    const initial = createFadingSpiritsState(); initial.rapidResurrectionLockedForCurrentDeath = true; initial.permanentDcPenalty = 1;
    const pending = beginRitual(initial, { id: 'long', mode: 'normal', contributors: [], at: 1, gmId: 'gm' });
    const result = resolveAttempt(pending, { id: 'long', mode: 'normal', at: 2, gmId: 'gm', dc: 11, dieSucceeded: true, soulWilling: true });
    expect(result.state.rapidResurrectionLockedForCurrentDeath).toBe(false);
    expect(result.state.permanentDcPenalty).toBe(1);
  });

  test('miracle succeeds immediately only when not locked', () => {
    const result = resolveAttempt(createFadingSpiritsState(), { id: 'miracle', mode: 'miracle', at: 1, gmId: 'gm', dc: 0, dieSucceeded: true, soulWilling: true });
    expect(result.state.successfulReturns).toBe(1);
    const locked = createFadingSpiritsState(); locked.conventionalResurrectionLocked = true;
    expect(() => resolveAttempt(locked, { id: 'blocked', mode: 'miracle', at: 1, gmId: 'gm', dc: 0, dieSucceeded: true, soulWilling: true })).toThrow();
  });

  test('rejects duplicate contributors and more than three', () => {
    expect(() => beginRitual(createFadingSpiritsState(), { id: 'dup', mode: 'normal', contributors: [contributor('Actor.a'), contributor('Actor.a')], at: 1, gmId: 'gm' })).toThrow();
    expect(() => beginRitual(createFadingSpiritsState(), { id: 'many', mode: 'normal', contributors: ['a', 'b', 'c', 'd'].map((id) => contributor(`Actor.${id}`)), at: 1, gmId: 'gm' })).toThrow();
  });
});
