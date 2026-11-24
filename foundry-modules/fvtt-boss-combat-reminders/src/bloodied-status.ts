import { MODULE_ID } from './types.ts';
import type { HpData, NativeActor, NativeEffect } from './types.ts';

const sourceFlag = 'bloodiedStatusSource';
const thresholdFlag = 'bloodiedThreshold';
const bloodiedIcon = 'systems/dnd5e/icons/svg/statuses/bloodied.svg';

type MarkerSource = 'confirmed' | 'forced';

interface BloodiedEffect extends NativeEffect {
  update?(changes: object): Promise<unknown>;
}

export interface BloodiedActor extends NativeActor {
  system: NativeActor['system'] & { attributes?: { hp?: HpData & { bloodied?: number } } };
  effects?: Iterable<BloodiedEffect>;
  updateBloodied?(options: object): Promise<unknown> | void;
}

export function bloodiedThreshold(actor: BloodiedActor): number {
  return actor.system.attributes?.hp?.bloodied ?? 50;
}

export function bloodiedThresholdOverride(actor: BloodiedActor): number | undefined {
  const value = ownedEffect(actor, 'threshold')?.getFlag?.(MODULE_ID, thresholdFlag);
  return typeof value === 'number' ? value : undefined;
}

export function atBloodiedThreshold(hp: HpData | undefined, threshold: number): boolean {
  const value = hp?.value ?? 0;
  const max = hp?.effectiveMax ?? hp?.max ?? 0;
  // The native system excludes a fully healthy creature even if its threshold is 100%.
  return value > 0 && value < max && value / max * 100 <= threshold;
}

export function crossedBloodiedThreshold(before: HpData | undefined, after: HpData | undefined, threshold: number): boolean {
  return (before?.value ?? 0) > 0 && (before?.effectiveMax ?? before?.max ?? 0) > 0
    && !atBloodiedThreshold(before, threshold) && atBloodiedThreshold(after, threshold);
}

export function isActorBloodied(actor: NativeActor): boolean {
  return (actor.system.attributes?.hp?.value ?? 0) > 0 && actor.statuses.has('bloodied');
}

export function isForcedBloodied(actor: BloodiedActor): boolean {
  const effect = ownedEffect(actor, 'forced');
  return !!effect && effect.active !== false;
}

export async function setBloodiedThreshold(
  actor: BloodiedActor, percentage: number | undefined, label: string,
): Promise<boolean> {
  const existing = ownedEffect(actor, 'threshold');
  if (percentage === undefined) {
    if (!existing || !await removeEffect(actor, existing)) return false;
  } else {
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return false;
    const data = {
      name: label,
      img: bloodiedIcon,
      type: 'base',
      disabled: false,
      transfer: false,
      system: {
        changes: [{ key: 'system.attributes.hp.bloodied', type: 'override', value: percentage }],
      },
      flags: { [MODULE_ID]: { [sourceFlag]: 'threshold', [thresholdFlag]: percentage } },
    };
    if (existing) {
      if (!existing.update) return false;
      await existing.update(data);
    } else {
      const created = await actor.createEmbeddedDocuments?.('ActiveEffect', [data]);
      if (!created?.length) return false;
    }
  }
  await actor.updateBloodied?.({});
  await reconcileBloodiedMarkers(actor);
  return true;
}

export async function markBloodied(actor: BloodiedActor, source: MarkerSource, label: string): Promise<boolean> {
  const hp = actor.system.attributes?.hp;
  if ((hp?.value ?? 0) <= 0) return false;
  if (source === 'confirmed' && (!atBloodiedThreshold(hp, bloodiedThreshold(actor)) || isActorBloodied(actor))) {
    return false;
  }
  const existing = ownedEffect(actor, source);
  if (existing?.active === false && existing.update) {
    await existing.update({ disabled: false });
  } else if (existing) {
    return false;
  } else {
    const created = await actor.createEmbeddedDocuments?.('ActiveEffect', [{
      name: label,
      img: bloodiedIcon,
      type: 'base',
      disabled: false,
      transfer: false,
      statuses: ['bloodied'],
      flags: {
        dnd5e: { isTemporary: true },
        [MODULE_ID]: { [sourceFlag]: source },
      },
    }]);
    if (!created?.length) return false;
  }
  if (source === 'confirmed') await reconcileBloodiedMarkers(actor);
  return true;
}

export async function restoreAutomaticBloodied(actor: BloodiedActor): Promise<boolean> {
  const effect = ownedEffect(actor, 'forced');
  if (!effect) return false;
  await actor.updateBloodied?.({});
  return removeEffect(actor, effect);
}

export async function reconcileBloodiedMarkers(actor: BloodiedActor, nativeMarkerId?: string): Promise<boolean> {
  if (atBloodiedThreshold(actor.system.attributes?.hp, bloodiedThreshold(actor))) return false;
  const ids = [...(actor.effects ?? [])].filter(effect => effect.getFlag?.(MODULE_ID, sourceFlag) === 'confirmed'
    || (nativeMarkerId === effect.id && [...(effect.statuses ?? [])].includes('bloodied'))).map(effect => effect.id);
  return ids.length > 0 && Boolean((await actor.deleteEmbeddedDocuments?.('ActiveEffect', ids))?.length);
}

function ownedEffect(actor: BloodiedActor, source: MarkerSource | 'threshold'): BloodiedEffect | undefined {
  return [...(actor.effects ?? [])].find(effect => effect.getFlag?.(MODULE_ID, sourceFlag) === source);
}

async function removeEffect(actor: BloodiedActor, effect: BloodiedEffect): Promise<boolean> {
  const removed = await actor.deleteEmbeddedDocuments?.('ActiveEffect', [effect.id]);
  return !!removed?.length;
}
