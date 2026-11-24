import { MODULE_ID } from './types.ts';
import type { NativeActivity, NativeItem } from './types.ts';
import { bloodiedDescription, isBloodiedKind } from './bloodied-text.ts';

export interface Health { value: number; max: number }
export type TriggerKind = 'zero' | 'death' | 'bloodied' | 'bloodied-turn' | 'bloodied-while';
export interface HealthTrigger { kind: TriggerKind; once?: boolean; atZero?: boolean; split?: boolean; advantage?: boolean }

const death = /^(?:when|on) (?:the (?:creature|monster|npc) dies|it dies|its death|death)[.!。]?$/i;
const zero = /^(?:(?:when|if) )?(?:its |the (?:creature|monster|npc)'s )?(?:hp|hit points) (?:drop(?:s)?|fall(?:s)?|(?:is|are) reduced) to 0(?: hp| hit points)?[.!。]?$/i;
const bloodied = /^(?:when|once) (?:the (?:creature|monster|npc)|it) (first )?becomes bloodied[.!。]?$/i;

export function structuredTrigger(condition: string): HealthTrigger | undefined {
  const value = plain(condition);
  if (death.test(value) || /^(?:该|此)?(?:生物|怪物|它)?死亡时[。！]?$/.test(value)) return { kind: 'death' };
  if (zero.test(value) || /^(?:该|此|它的)?(?:生物|怪物)?生命值(?:降[至到]|降低到)\s*0\s*(?:点)?时[。！]?$/.test(value)) {
    return { kind: 'zero' };
  }
  const match = value.match(bloodied);
  if (match) return match[1] ? { kind: 'bloodied', once: true } : { kind: 'bloodied' };
  if (/^(?:该|此)?(?:生物|怪物|它)?(?:首次)?陷入浴血时[。！]?$/.test(value)) {
    return value.includes('首次') ? { kind: 'bloodied', once: true } : { kind: 'bloodied' };
  }
  if (/^(?:自己)?回合开始时仍(?:然)?浴血$/.test(value)) return { kind: 'bloodied-turn' };
  if (value === '浴血期间') return { kind: 'bloodied-while' };
}

export function suggestedTrigger(body: string): TriggerKind | undefined {
  const text = plain(body);
  if (/\b(?:when|if) damage reduces\b[^.!?]{1,70}\bto 0 (?:hit points|hp)\b|生命值(?:降[至到]|降低到)\s*0\s*(?:点)?时/.test(text)) return 'zero';
  if (/\b(?:when (?:it dies|the [\w -]+ dies)|on (?:its )?death|death (?:burst|throes))\b|(?:死亡|死去)时|死亡爆炸/.test(text)) return 'death';
  if (/\b(?:first )?becomes bloodied\b|陷入浴血(?:时|后)/.test(text)) return 'bloodied';
}

export function manualTrigger(item: NativeItem): HealthTrigger | 'ignore' | undefined {
  const value = item.getFlag(MODULE_ID, 'healthTrigger');
  if (value === 'ignore') return value;
  if (!value || typeof value !== 'object' || !('kind' in value)
    || (value.kind !== 'death' && value.kind !== 'zero' && !isBloodiedKind(value.kind as TriggerKind))) return;
  return value as HealthTrigger;
}

export function itemTrigger(item: NativeItem, activity?: NativeActivity, actorName?: string): HealthTrigger | undefined {
  const manual = manualTrigger(item);
  if (manual === 'ignore') return;
  const explicit = manual ?? structuredTrigger(activity?.activation.condition ?? '') ?? structuredTrigger(item.system.activation?.condition ?? '');
  const body = item.system.description?.value ?? '';
  const description = activity?.activation.condition
    ? body.replace(/\[\[lookup\s+@activation\.condition(?:\s+activity=(\w+))?\s*\]\]/gi,
      (reference, id: string | undefined) => !id || id === activity.id ? activity.activation.condition! : reference)
    : body;
  if (!actorName) return explicit;
  const bloodied = bloodiedDescription(plain(description), plain(actorName));
  if (explicit) {
    return bloodied?.kind === explicit.kind ? { ...bloodied, ...explicit } : explicit;
  }
  return ownDefeatTrigger(description, actorName) ?? bloodied;
}

/** A description match requires the creature's own HP or death, not another creature's. */
export function ownDefeatTrigger(body: string, actorName: string): HealthTrigger | undefined {
  const description = plain(body).replace(/[’‘]/g, "'");
  const lookup = /\[\[lookup\s+@name(?:\s+lowercase)?\s*\]\]/g;
  const text = description.replace(lookup, 'creature');
  const name = plain(actorName);
  const english = name.match(/[a-z][a-z '\-]*[a-z]|[a-z]/g)?.map(part => part.trim()) ?? [];
  const self = ['the creature', 'the monster', 'the npc', ...english.map(part => `the ${part}`)]
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const start = '(?:^|[.!?;]\\s*)';
  if (new RegExp(`${start}(?:if|when|whenever) damage reduces (?:it|${self}) to 0 (?:hit points|hp)\\b`).test(text)
    || new RegExp(`${start}(?:when|if|whenever) (?:its|(?:${self})'s) (?:hit points|hp) (?:drop(?:s)?|fall(?:s)?|(?:is|are) reduced) to 0\\b`).test(text)) {
    return { kind: 'zero' };
  }
  if (new RegExp(`${start}(?:when|upon) (?:it|${self}) dies\\b|${start}(?:${self}) (?:explodes|bursts|erupts) when it dies\\b`).test(text)) {
    return { kind: 'death' };
  }
  const chinese = name.match(/[\u3400-\u9fff]+/g) ?? [];
  const subject = ['它', '该生物', '此生物', '该怪物', ...chinese].join('|');
  const localized = description.replace(lookup, '该生物');
  const sentence = '(?:^|[.。！？；]\\s*)';
  const takesDamage = '(?:因受[^。！？；，,]{0,45}伤害而使其\\s*)?';
  if (new RegExp(`${sentence}(?:(?:当|若|如果)\\s*)?(?:(?:伤害使\\s*)?(?:${subject})(?:的)?\\s*${takesDamage})?生命值(?:降[至到]|降低[至到]|减[至到])\\s*0\\s*(?:点)?(?:时|[，,])`).test(localized)) {
    return { kind: 'zero' };
  }
  if (new RegExp(`${sentence}(?:(?:当|若)\\s*)?(?:(?:${subject})\\s*)?(?:在\\s*)?(?:死亡|死去)时`).test(localized)) {
    return { kind: 'death' };
  }
}

export function hasAutomaticTrigger(item: NativeItem, actorName?: string): boolean {
  return Boolean(itemTrigger(item, undefined, actorName)
    || [...(item.system.activities ?? [])].some(activity => itemTrigger(item, activity, actorName)));
}

function plain(text: string): string {
  return text.replace(/<\/(?:p|li|div|h[1-6])\s*>/gi, '. ').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&rsquo;|&#39;/gi, "'")
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
