import { describe, expect, test } from 'bun:test';
import { DeckStore } from '../src/store.ts';
import type { DeckSnapshot } from '../src/types.ts';

function snapshot(refreshedAt = 0): DeckSnapshot {
  return {
    supported: true,
    world: { id: 'world', title: 'World' },
    system: { id: 'dnd5e', version: '5.3.3' },
    scene: null,
    onlineUsers: 1,
    party: [],
    encounter: {
      active: false, round: 0, turn: -1, displayTurn: 0, combatants: [],
      commands: {
        previousTurn: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
        nextTurn: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
        focusCurrent: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
        swapInitiative: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
        rollNpcInitiative: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
      },
    },
    statusOptions: [],
    partyFolder: { includeDescendants: true, missing: false, options: [] },
    rosterManager: [],
    stalePinned: [],
    staleHidden: [],
    density: 'comfortable',
    activeTab: 'party',
    refreshedAt,
  };
}

describe('DeckStore', () => {
  test('deep-freezes both the initial and rebuilt snapshot graph', async () => {
    const initial = snapshot();
    const store = new DeckStore(initial, () => snapshot(1));
    expect(Object.isFrozen(store.snapshot)).toBeTrue();
    expect(Object.isFrozen(store.snapshot.world)).toBeTrue();
    expect(Object.isFrozen(store.snapshot.encounter)).toBeTrue();
    expect(Object.isFrozen(store.snapshot.encounter.combatants)).toBeTrue();
    expect(() => (store.snapshot.party as unknown[]).push({})).toThrow();

    await store.refreshNow();
    expect(Object.isFrozen(store.snapshot)).toBeTrue();
    expect(Object.isFrozen(store.snapshot.encounter.commands)).toBeTrue();
  });

  test('coalesces same-turn invalidations into one rebuild', async () => {
    let builds = 0;
    const store = new DeckStore(snapshot(), () => snapshot(++builds));
    store.invalidate();
    store.invalidate();
    store.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(builds).toBe(1);
    expect(store.snapshot.refreshedAt).toBe(1);
  });

  test('publishes an error snapshot instead of leaving listeners stuck', async () => {
    const seen: DeckSnapshot[] = [];
    const store = new DeckStore(snapshot(), () => { throw new Error('broken fixture'); });
    store.subscribe((value) => seen.push(value));
    await store.refreshNow();
    expect(store.snapshot.error).toContain('broken fixture');
    expect(seen.length).toBe(2);
  });

  test('refreshNow waits for an in-flight rebuild and the requested follow-up snapshot', async () => {
    let builds = 0;
    let releaseFirst!: () => void;
    const firstBuild = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const store = new DeckStore(snapshot(), async () => {
      builds += 1;
      if (builds === 1) await firstBuild;
      return snapshot(builds);
    });

    store.invalidate();
    await Promise.resolve();
    const refreshed = store.refreshNow();
    let settled = false;
    void refreshed.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBeFalse();

    releaseFirst();
    await refreshed;
    expect(builds).toBe(2);
    expect(store.snapshot.refreshedAt).toBe(2);
  });
});
