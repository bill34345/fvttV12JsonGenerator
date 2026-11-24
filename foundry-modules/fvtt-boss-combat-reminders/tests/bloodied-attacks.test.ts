import { expect, test } from 'bun:test';
import { BloodiedAttacks, sanitizeBloodiedAttackUsage } from '../src/bloodied-attacks.ts';
import type { NativeActivity, NativeActivityMessage, NativeActor, NativeItem } from '../src/types.ts';
import type { NativeDialog } from '../src/setup.ts';

function encounter() {
  const statuses = new Set<string>();
  const actor = {
    uuid: 'Actor.boss', name: '爪兽', statuses, system: { isNPC: true, attributes: { hp: { value: 50, max: 100 } } },
    getFlag: () => undefined,
  } as unknown as NativeActor;
  const used: Array<{ id: string; message?: NativeActivityMessage }> = [];
  const damaged: string[] = [];
  const item: NativeItem = {
    id: 'claw', name: '爪击', system: { description: { value: '<p>爪击造成 2d6+3 挥砍伤害。</p><p>当浴血时：命中时使目标倒地。</p>' } },
    getFlag: () => ({ standard: { variant: { id: 'enhanced', mode: 'replace' }, rider: { effectId: 'prone' } } }),
    unsetFlag: async () => undefined,
    setFlag: async () => undefined,
  };
  const build = (id: string, type: string): NativeActivity => ({
    id, name: id, type, actor, item, canUse: true, activation: { type: 'action' },
    async use(_config, _dialog, message) { used.push({ id, message }); return {}; },
    async rollDamage() { damaged.push(id); return [{}]; },
  });
  const base = build('standard', 'attack');
  const variant = build('enhanced', 'attack');
  const rider = build('secondary', 'damage');
  item.system.activities = [base, variant, rider];
  const logic = new BloodiedAttacks(key => key, {} as NativeDialog, () => [], () => undefined, () => 'fight:1:0', () => {});
  return { statuses, item, base, variant, rider, used, damaged, logic };
}

test('a replacement attack retains the original privacy and selected target descriptors', () => {
  const { statuses, base, logic, used } = encounter();
  statuses.add('bloodied');
  const targets = [{ token: 'Scene.fight.Token.target' }];
  const message = { rollMode: 'gm', data: { speaker: { token: 'source' }, whisper: ['gm'], system: { targets } } };
  expect(logic.preUse(base, {}, { configure: false }, message)).toBe(false);
  expect(used).toEqual([{ id: 'enhanced', message }]);
});

test('a replacement damage roll rechecks the current state in both directions', () => {
  const { damaged, logic, statuses, base, variant } = encounter();
  expect(logic.preRollDamage({ subject: variant }, { configure: false }, { data: {} })).toBe(false);
  expect(damaged).toEqual(['standard']);
  const next = encounter();
  next.statuses.add('bloodied');
  expect(next.logic.preRollDamage({ subject: next.base }, { configure: false }, { data: {} })).toBe(false);
  expect(next.damaged).toEqual(['enhanced']);
  statuses.delete('bloodied');
  expect(logic.preRollDamage({ subject: base }, {}, { data: {} })).toBeUndefined();
});

test('native attack and separate rider usage both redact private text before publication', () => {
  const { base, rider, item } = encounter();
  const text = item.system.description!.value!;
  const attack = { data: { system: { description: text, effects: ['.ActiveEffect.prone', '.ActiveEffect.normal'] } } };
  sanitizeBloodiedAttackUsage(base, attack);
  expect(attack.data.system.description).toContain('2d6+3');
  expect(attack.data.system.description).not.toContain('倒地');
  expect(attack.data.system.effects).toEqual(['.ActiveEffect.normal']);
  const extra = { data: { system: { description: text, effects: ['.ActiveEffect.prone'] } } };
  sanitizeBloodiedAttackUsage(rider, extra);
  expect(extra.data.system.description).not.toContain('倒地');
  expect(extra.data.system.effects).toEqual(['.ActiveEffect.prone']);
});
