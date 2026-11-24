import { MODULE_ID } from './types.ts';
import type { NativeActor, NativeEffect, NativeItem } from './types.ts';
import { isActorBloodied } from './bloodied-status.ts';

const effectFlag = 'bloodiedFrenzy';
const advantageRule = 'dnd5e.advantage';
const rollModes = {
  attack: 'system.rolls.attack.mode',
  save: 'system.rolls.ability.save.mode',
};

export function frenzyAlreadyApplied(actor: NativeActor, item: NativeItem): boolean {
  if ([...(actor.effects ?? [])].some(effect => effect.getFlag?.(MODULE_ID, effectFlag) === item.id)) return true;
  const uuids = [item.uuid, ...[...(item.system.activities ?? [])].map(activity => activity.uuid)];
  return [...(actor.appliedEffects ?? [])].some(effect => hasNativeAdvantage(effect)
    && (effect.parent === item || uuids.some(uuid => uuid && (effect.origin === uuid || effect.matchesOrigin?.(uuid)))));
}

export async function applyBloodiedFrenzy(actor: NativeActor, item: NativeItem): Promise<boolean> {
  if (!isActorBloodied(actor) || frenzyAlreadyApplied(actor, item) || !actor.createEmbeddedDocuments) return false;
  const result = await actor.createEmbeddedDocuments('ActiveEffect', [{
    name: item.name,
    img: item.img,
    origin: item.uuid,
    type: 'base',
    transfer: false,
    disabled: false,
    flags: { [MODULE_ID]: { [effectFlag]: item.id } },
    system: { changes: Object.keys(rollModes).map(key => ({ key, type: advantageRule, value: '1' })) },
  }]);
  if (!result.length) return false;
  // A heal may have finished while the effect was being created.
  await clearBloodiedFrenzy(actor);
  return true;
}

export async function clearBloodiedFrenzy(actor: NativeActor): Promise<void> {
  if (isActorBloodied(actor)) return;
  const ids = [...(actor.effects ?? [])].filter(effect => effect.getFlag?.(MODULE_ID, effectFlag)).map(effect => effect.id);
  if (ids.length) await actor.deleteEmbeddedDocuments?.('ActiveEffect', ids);
}

function hasNativeAdvantage(effect: NativeEffect): boolean {
  const changes = [...(effect.system?.changes ?? [])];
  return effect.active !== false && Object.entries(rollModes).every(([roll, mode]) =>
    changes.some(change => Number(change.value) > 0 && (
      (change.type === advantageRule && (change.key === roll || change.key === 'd20'))
      || (change.type === 'add' && change.key === mode)
    )));
}
