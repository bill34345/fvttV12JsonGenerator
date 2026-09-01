import { afterEach, describe, expect, test } from 'bun:test';
import { MODULE_ID } from '../src/constants.ts';
import { friendlyInitiativeIsRevealed, isFriendlyActor, registerTrackerPrivacyHooks } from '../src/tracker-privacy.ts';

const originalGame = Object.getOwnPropertyDescriptor(globalThis, 'game');
const originalHooks = Object.getOwnPropertyDescriptor(globalThis, 'Hooks');

afterEach(() => {
  if (originalGame) Object.defineProperty(globalThis, 'game', originalGame);
  else delete (globalThis as any).game;
  if (originalHooks) Object.defineProperty(globalThis, 'Hooks', originalHooks);
  else delete (globalThis as any).Hooks;
});

function installGame(options: { includeDescendants?: boolean } = {}) {
  const party = { id: 'party', name: 'Party', type: 'Actor' };
  const child = { id: 'child', name: 'Guests', type: 'Actor', folder: party };
  const player = { id: 'player', isGM: false, character: null };
  Object.assign(globalThis, {
    game: {
      combat: null,
      folders: [party, child],
      settings: {
        get: (_module: string, key: string) => key === 'partyFolderId' ? party.id : options.includeDescendants !== false,
      },
      users: [player],
      user: { isGM: true },
    },
  });
  return { child, party, player };
}

describe('official Combat Tracker privacy', () => {
  test('reveals first-round friendlies only through the current turn, then handles later joins', () => {
    expect(friendlyInitiativeIsRevealed({ round: 1, joinedRound: 1, hasActed: false, actedThisRound: false })).toBeFalse();
    expect(friendlyInitiativeIsRevealed({ round: 1, joinedRound: 1, hasActed: false, actedThisRound: true })).toBeTrue();
    expect(friendlyInitiativeIsRevealed({ round: 2, joinedRound: 1, hasActed: false, actedThisRound: false })).toBeTrue();
    expect(friendlyInitiativeIsRevealed({ round: 2, joinedRound: 2, hasActed: false, actedThisRound: false })).toBeFalse();
    expect(friendlyInitiativeIsRevealed({ round: 2, joinedRound: 2, hasActed: true, actedThisRound: false })).toBeTrue();
  });

  test('treats party-folder members and non-GM OWNER actors as friendly', () => {
    const fixture = installGame();
    const direct = { uuid: 'Actor.direct', folder: fixture.party, ownership: {} };
    const nested = { uuid: 'Actor.nested', folder: fixture.child, ownership: {} };
    const owned = { uuid: 'Actor.owned', folder: null, ownership: { player: 3 } };
    const hostile = { uuid: 'Actor.hostile', folder: null, ownership: {} };

    expect(isFriendlyActor(direct)).toBeTrue();
    expect(isFriendlyActor(nested)).toBeTrue();
    expect(isFriendlyActor(owned)).toBeTrue();
    expect(isFriendlyActor(hostile)).toBeFalse();

    installGame({ includeDescendants: false });
    expect(isFriendlyActor(nested)).toBeFalse();
  });

  test('defaults new hostile combatants to hidden and records their joined round', () => {
    installGame();
    const callbacks = new Map<string, (...args: any[]) => void>();
    (globalThis as any).Hooks = { on: (name: string, callback: (...args: any[]) => void) => callbacks.set(name, callback) };
    registerTrackerPrivacyHooks();

    const sourceUpdates: Record<string, unknown>[] = [];
    callbacks.get('preCreateCombatant')?.({
      actor: { uuid: 'Actor.hostile-character', type: 'character', ownership: {}, folder: null },
      parent: { round: 3 },
      updateSource: (update: Record<string, unknown>) => sourceUpdates.push(update),
    }, {});

    expect(sourceUpdates).toEqual([{ [`flags.${MODULE_ID}.joinedRound`]: 3, hidden: true }]);
  });

  test('keeps new party combatants visible', () => {
    const fixture = installGame();
    const callbacks = new Map<string, (...args: any[]) => void>();
    (globalThis as any).Hooks = { on: (name: string, callback: (...args: any[]) => void) => callbacks.set(name, callback) };
    registerTrackerPrivacyHooks();

    const sourceUpdates: Record<string, unknown>[] = [];
    callbacks.get('preCreateCombatant')?.({
      actor: { uuid: 'Actor.party-npc', type: 'npc', ownership: {}, folder: fixture.party },
      parent: { round: 1 },
      updateSource: (update: Record<string, unknown>) => sourceUpdates.push(update),
    }, {});

    expect(sourceUpdates).toEqual([{ [`flags.${MODULE_ID}.joinedRound`]: 1 }]);
  });

  test('does not re-hide an NPC explicitly marked as revealed', () => {
    installGame();
    const callbacks = new Map<string, (...args: any[]) => void>();
    (globalThis as any).Hooks = { on: (name: string, callback: (...args: any[]) => void) => callbacks.set(name, callback) };
    registerTrackerPrivacyHooks();

    const sourceUpdates: Record<string, unknown>[] = [];
    callbacks.get('preCreateCombatant')?.({
      actor: { uuid: 'Actor.hostile', type: 'npc', ownership: {}, folder: null },
      parent: { round: 1 },
      updateSource: (update: Record<string, unknown>) => sourceUpdates.push(update),
    }, { flags: { [MODULE_ID]: { revealed: true } } });

    expect(sourceUpdates).toEqual([{ [`flags.${MODULE_ID}.joinedRound`]: 1 }]);
  });
});
