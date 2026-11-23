import { expect, test } from 'bun:test';
import { useFromCombatant } from '../src/native-use.ts';
import type { NativeSceneCanvas } from '../src/native-use.ts';
import type { Combatant, NativeActivity, NativeCombat } from '../src/types.ts';

test('native activity receives the chosen linked Token, then restores the GM selection', async () => {
  const controls: { controlled: NonNullable<NativeSceneCanvas['tokens']>['controlled'] } = { controlled: [] };
  const token = (id: string) => ({
    id,
    control({ releaseOthers = true } = {}) {
      if (releaseOthers) controls.controlled.length = 0;
      controls.controlled.push(this);
      return true;
    },
    release() {
      controls.controlled = controls.controlled.filter(entry => entry.id !== id);
      return true;
    },
  });
  const first = token('first');
  const chosen = token('chosen');
  first.control();
  const canvas = { tokens: { get controlled() { return controls.controlled; }, get: (id: string) => id === chosen.id ? chosen : first } };
  const entry: Combatant = { id: 'second-copy', initiative: 20, name: 'Dragon', actor: null, token: { id: chosen.id } };
  const encounter: NativeCombat = {
    id: 'test', active: true, started: true, current: { combatantId: entry.id, round: 1, turn: 0 },
    combatants: Object.assign([entry], { get: (id: string) => id === entry.id ? entry : undefined }),
  };
  const activity: NativeActivity = {
    id: 'lair', name: 'Falling rock', canUse: true, activation: { type: 'lair' },
    getUsageToken: () => controls.controlled[0],
    async use(_config, _dialog, message) {
      expect(controls.controlled.map(token => token.id)).toEqual(['chosen']);
      expect(message?.data.speaker).toEqual({ token: { id: 'chosen' }, actor: null, scene: undefined });
      return { consumed: true };
    },
  };

  expect(await useFromCombatant(encounter, entry, activity, new Event('click'), canvas, data => data)).toBe(true);
  expect(controls.controlled.map(token => token.id)).toEqual(['first']);
});
