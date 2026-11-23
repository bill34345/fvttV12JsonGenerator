import { expect, test } from 'bun:test';
import { CombatReminders } from '../src/runtime.ts';
import type { Combatant, NativeActor, NativeCombat, NativeSaveMessage, ReminderCard } from '../src/types.ts';

test('a failed save opens one GM choice that uses the original native save only once', async () => {
  const shown = new Map<string, ReminderCard>();
  let active = false;
  let uses = 0;
  let settle!: () => void;
  const pending = new Promise<void>(resolve => { settle = resolve; });
  const actor: NativeActor = {
    uuid: 'Actor.boss', name: 'Dragon', items: [], statuses: new Set(),
    getFlag: () => undefined, setFlag: async () => undefined,
    system: {
      isNPC: true,
      async resistSave(message) {
        expect(message).toBe(save);
        await pending;
        uses++;
        message.system.canResist = false;
      },
    },
  };
  const entry: Combatant = { id: 'boss', name: 'Dragon', actor, initiative: 18 };
  const combat: NativeCombat = {
    id: 'combat', active: true, started: true,
    current: { combatantId: entry.id, round: 1, turn: 0 },
    combatants: Object.assign([entry], { get: (id: string) => id === entry.id ? entry : undefined }),
  };
  const save: NativeSaveMessage = {
    id: 'failed-save', type: 'save', system: { canResist: true }, getAssociatedActor: () => actor,
  };
  const competing: NativeSaveMessage = {
    id: 'another-save', type: 'save', system: { canResist: true }, getAssociatedActor: () => actor,
  };
  const service = new CombatReminders(
    { isActiveGM: () => active, combat: () => combat, format: key => key, useActivity: async () => false, message: id => id === save.id ? save : competing },
    { show: card => shown.set(card.id, card), remove: id => { shown.delete(id); }, clear: () => shown.clear() },
  );

  service.saveCreated(save);
  expect(shown.size).toBe(0);
  active = true;
  service.saveCreated(save);
  const action = shown.get('resistance:failed-save')?.groups[0]?.choices[0];
  expect(action).toBeDefined();
  service.saveCreated(competing);
  const second = shown.get('resistance:another-save')?.groups[0]?.choices[0];
  expect(second).toBeDefined();
  const first = action!.run(new Event('click'));
  expect(await second!.run(new Event('click'))).toBe(false);
  settle();
  expect(await first).toBe(true);
  expect(await action!.run(new Event('click'))).toBe(false);
  expect(uses).toBe(1);
});
