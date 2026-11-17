import type { ItemTimedSpeedData } from '@fvtt-json-generator/models/item';
import { createStableDocumentId } from './stableId';

export const TIMED_SPEED_MOVEMENTS = ['walk', 'fly', 'climb', 'burrow', 'swim'] as const;

export function projectTimedSpeed(item: {
  name: string;
  system: Record<string, any>;
  effects?: any[];
  flags?: Record<string, any>;
}, { seconds }: ItemTimedSpeedData): void {
  const idFor = (part: string) => createStableDocumentId({ name: item.name, kind: 'timed-speed', part });
  const activityId = idFor('activity');
  const profileId = idFor('profile');
  const riderId = idFor('speed');
  item.system.uses = { max: String(seconds), spent: 0, recovery: [{ period: 'lr', type: 'recoverAll' }] };
  item.flags ??= {};
  (item.flags.fvttJsonGenerator ??= {}).timedSpeed = { units: 'seconds' };
  item.flags.dnd5e = { ...item.flags.dnd5e, riders: { effect: [riderId] } };
  const name = '速度翻倍 Double Speed';
  (item.effects ??= []).push({
    _id: profileId, name, type: 'enchantment', disabled: true, transfer: false, statuses: [],
    duration: { value: seconds, units: 'seconds', expiry: 'turnStart', expired: false },
    system: { changes: [], magical: true },
  }, {
    _id: riderId, name, type: 'base', disabled: false, transfer: true, statuses: [],
    system: {
      magical: true,
      changes: TIMED_SPEED_MOVEMENTS.map(movement => ({
        key: `system.attributes.movement.speeds.${movement}`, type: 'multiply', value: 2,
      })),
    },
  });
  item.system.activities[activityId] = {
    _id: activityId, name: '启停加速 Toggle Speed', type: 'enchant',
    activation: { type: 'bonus', value: 1, override: false },
    enchant: { self: true },
    range: { units: 'self', override: true },
    target: { affects: { type: 'object', count: '1', choice: false }, override: false, prompt: false },
    restrictions: { allowMagical: true, type: 'equipment', categories: [], properties: [] },
    visibility: { requireMagic: true, requireAttunement: true },
    effects: [{ _id: profileId, level: { min: null, max: null }, riders: { activity: [], effect: [riderId], item: [] } }],
    appliedEffects: [profileId],
    consumption: { targets: [], spellSlot: false, scaling: { allowed: false, max: '' } },
    uses: { max: '', spent: 0, recovery: [] },
  };
  item.system.description.value += '<p>GM 在物品的使用次数中累计填写已用秒数。再次触发时关闭效果。剩余时长不足时按实际剩余时间结束效果，达到总额度时停止使用，完成长休后恢复。</p>';
}
