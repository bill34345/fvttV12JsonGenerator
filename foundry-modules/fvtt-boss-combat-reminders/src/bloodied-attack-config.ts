import { MODULE_ID } from './types.ts';
import type { NativeItem } from './types.ts';

export const BLOODIED_ATTACKS_FLAG = 'bloodiedAttacks';

export interface BloodiedAttackBinding {
  variant?: { id: string; mode: 'replace' | 'choice' };
  rider?: { activityId?: string; effectId?: string };
}

export function attackBinding(item: NativeItem, activityId: string): BloodiedAttackBinding | undefined {
  const bindings = record(item.getFlag(MODULE_ID, BLOODIED_ATTACKS_FLAG));
  if (!bindings || !Object.hasOwn(bindings, activityId)) return;
  const entry = record(bindings[activityId]);
  if (!entry) return;

  const variant = record(entry.variant);
  const rider = record(entry.rider);
  const binding: BloodiedAttackBinding = {};
  if (typeof variant?.id === 'string' && variant.id && variant.id !== activityId
    && (variant.mode === 'replace' || variant.mode === 'choice')) {
    binding.variant = { id: variant.id, mode: variant.mode };
  }
  const extraActivity = typeof rider?.activityId === 'string' && rider.activityId !== activityId ? rider.activityId : '';
  const effect = typeof rider?.effectId === 'string' ? rider.effectId : '';
  if (extraActivity || effect) {
    binding.rider = {
      ...(extraActivity ? { activityId: extraActivity } : {}),
      ...(effect ? { effectId: effect } : {}),
    };
  }
  if (binding.variant || binding.rider) return binding;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
}
