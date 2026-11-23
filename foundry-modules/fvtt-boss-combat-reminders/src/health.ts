import { MODULE_ID } from './types.ts';
import type { NativeActivity, NativeItem } from './types.ts';

export interface Health { value: number; max: number }
export interface HealthMoment { zero: boolean; enteredBloodied: boolean }
export type TriggerKind = 'death' | 'bloodied';
export interface HealthTrigger { kind: TriggerKind; once?: boolean; atZero?: boolean }

const death = /^(?:when|on) (?:the (?:creature|monster|npc) dies|it dies|its death|death)[.!。]?$/i;
const bloodied = /^(?:when|once) (?:the (?:creature|monster|npc)|it) (first )?becomes bloodied[.!。]?$/i;

export function healthMoment(before: Health, after: Health): HealthMoment | null {
  if (after.value >= before.value) return null;
  const zero = before.value > 0 && after.value === 0;
  const enteredBloodied = before.max > 0 && after.max > 0
    && before.value > before.max / 2 && after.value <= after.max / 2;
  return zero || enteredBloodied ? { zero, enteredBloodied } : null;
}

export function matchesMoment(trigger: HealthTrigger, moment: HealthMoment): boolean {
  if (trigger.kind === 'death') return moment.zero;
  return moment.enteredBloodied && (!moment.zero || trigger.atZero === true);
}

export function structuredTrigger(condition: string): HealthTrigger | undefined {
  const value = plain(condition);
  if (death.test(value) || /^(?:该|此)?(?:生物|怪物|它)?死亡时[。！]?$/.test(value)) return { kind: 'death' };
  const match = value.match(bloodied);
  if (match) return match[1] ? { kind: 'bloodied', once: true } : { kind: 'bloodied' };
  if (/^(?:该|此)?(?:生物|怪物|它)?(?:首次)?陷入浴血时[。！]?$/.test(value)) {
    return value.includes('首次') ? { kind: 'bloodied', once: true } : { kind: 'bloodied' };
  }
}

export function suggestedTrigger(body: string): TriggerKind | undefined {
  const text = plain(body);
  if (/\b(?:when (?:it dies|the [\w -]+ dies)|on (?:its )?death|death (?:burst|throes))\b|(?:死亡|死去)时|死亡爆炸/.test(text)) return 'death';
  if (/\b(?:first )?becomes bloodied\b|陷入浴血(?:时|后)/.test(text)) return 'bloodied';
}

export function manualTrigger(item: NativeItem): HealthTrigger | 'ignore' | undefined {
  const value = item.getFlag(MODULE_ID, 'healthTrigger');
  if (value === 'ignore') return value;
  if (!value || typeof value !== 'object' || !('kind' in value)
    || (value.kind !== 'death' && value.kind !== 'bloodied')) return;
  return value as HealthTrigger;
}

export function itemTrigger(item: NativeItem, activity?: NativeActivity): HealthTrigger | undefined {
  const manual = manualTrigger(item);
  if (manual === 'ignore') return;
  if (manual) return manual;
  return structuredTrigger(activity?.activation.condition ?? '')
    ?? structuredTrigger(item.system.activation?.condition ?? '');
}

export function hasAutomaticTrigger(item: NativeItem): boolean {
  return Boolean(itemTrigger(item) || [...(item.system.activities ?? [])].some(activity => itemTrigger(item, activity)));
}

function plain(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replaceAll('&nbsp;', ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
