import type { ItemRandomSummonData, ItemSummonData } from '@fvtt-json-generator/models/item';
import { createStableDocumentId } from './stableId';

type SummoningItem = { name: string; system: Record<string, any>; flags?: Record<string, any> };
type ActorBinding = { actorName: string; actorUuid: string };
export const RANDOM_SUMMON_EXPIRY = '直到下一个黎明或生命值降至 0';

export function projectItemSummon(item: SummoningItem, data: ItemSummonData): void {
  item.system.uses = { max: '1', spent: 0, recovery: [] };
  const flags = (item.flags ??= {});
  (flags.fvttJsonGenerator ??= {}).summonCooldown = { days: data.cooldownDays };
  const activity = baseSummonActivity(item, 'summon-creature', data.rangeFeet, [data], true);
  item.system.activities[activity._id] = {
    ...activity,
    name: '召唤生物 Summon Creature',
    target: { ...activity.target, affects: { ...activity.target.affects, special: 'unoccupied space' } },
    duration: { value: String(data.durationHours), units: 'hour', concentration: false, override: false },
  };
  item.system.description.value += `<p>GM 在生物变回塑像时开始计时，经过 ${data.cooldownDays} 天才恢复这 1 次使用额度。按原文处理占位、行动顺序和提前变回。</p>`;
}

export function projectItemRandomSummon(item: SummoningItem, data: ItemRandomSummonData): void {
  item.system.uses = { max: String(data.usesPerDawn), spent: 0, recovery: [{ period: 'dawn', type: 'recoverAll' }] };
  const flags = (item.flags ??= {});
  (flags.fvttJsonGenerator ??= {}).randomSummon = { tableUuid: data.tableUuid, formula: data.formula };
  const profiles = data.profiles.map((profile, index) => ({ ...profile, actorName: `${index + 1}. ${profile.actorName}` }));
  const activity = baseSummonActivity(item, 'random-summon', data.rangeFeet, profiles, data.friendly);
  item.system.activities[activity._id] = {
    ...activity,
    name: '取出并投掷 Pull and Throw',
    duration: { units: 'spec', special: RANDOM_SUMMON_EXPIRY, concentration: false, override: false },
  };
  item.system.description.value += '<p>先用上方掷骰表确定结果，再在召唤活动里选对应编号的生物。按原文处理指挥、行动顺序和消失。</p>';
}

function baseSummonActivity(item: SummoningItem, kind: string, rangeFeet: number, profiles: ActorBinding[], matchDisposition: boolean) {
  if (item.system.attunement === 'none') item.system.attunement = '';
  return {
    _id: createStableDocumentId({ name: item.name, kind }), type: 'summon',
    activation: { type: 'action', value: 1, override: false, condition: '魔法动作 Magic Action' },
    consumption: { targets: [{ type: 'itemUses', value: '1', target: '' }], spellSlot: false, scaling: { allowed: false, max: '' } },
    range: { value: String(rangeFeet), units: 'ft', override: false },
    target: { affects: { count: '1', type: 'space', choice: false }, override: false, prompt: true },
    profiles: profiles.map(profile => ({
      _id: createStableDocumentId({ name: item.name, actorUuid: profile.actorUuid }),
      name: profile.actorName, uuid: profile.actorUuid, count: '1', level: { min: null, max: null },
    })),
    summon: { mode: '', prompt: true },
    match: { ability: '', attacks: false, proficiency: false, saves: false, disposition: matchDisposition },
    effects: [],
    uses: { max: '', spent: 0, recovery: [] },
  };
}
