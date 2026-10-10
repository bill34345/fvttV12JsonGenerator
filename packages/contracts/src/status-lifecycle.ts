import { decodeConfiguredConditionDefinition, type ConfiguredConditionDefinition } from './configured-conditions';

import { NATIVE_LIFECYCLE_STATUS_DEFINITIONS } from './native-lifecycle-catalog';
export { NATIVE_LIFECYCLE_STATUS_DEFINITIONS } from './native-lifecycle-catalog';

export type NativeLifecycleStatus = keyof typeof NATIVE_LIFECYCLE_STATUS_DEFINITIONS;
export const NATIVE_LIFECYCLE_STATUSES: readonly NativeLifecycleStatus[] = Object.freeze(Object.keys(NATIVE_LIFECYCLE_STATUS_DEFINITIONS) as NativeLifecycleStatus[]);

export function nativeLifecycleStatusLabel(status: string): string {
  return Object.hasOwn(NATIVE_LIFECYCLE_STATUS_DEFINITIONS, status)
    ? NATIVE_LIFECYCLE_STATUS_DEFINITIONS[status as NativeLifecycleStatus].label : status;
}

export interface StatusLifecycleParameters {
  trigger: 'attack-hit';
  status: string;
  definition?: ConfiguredConditionDefinition;
  duration: { value: number; unit: 'minute' | 'round' };
  repeatSave: {
    ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    dc: number;
    timing: 'target-turn-end';
    optional: boolean;
  };
}

function plain(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('Status lifecycle parameters must be plain data.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length
    || Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !keys.includes(key)
      || !descriptors[key]?.enumerable || !('value' in descriptors[key]!))) {
    throw new TypeError('Status lifecycle parameters contain missing or unsupported fields.');
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new TypeError('Status lifecycle number is outside its supported range.');
  }
  return value;
}

export function decodeStatusLifecycleParameters(value: unknown): StatusLifecycleParameters {
  const hasDefinition = !!value && typeof value === 'object' && Object.hasOwn(value, 'definition');
  const data = plain(value, ['trigger', 'status', 'duration', 'repeatSave', ...(hasDefinition ? ['definition'] : [])]);
  const definition = hasDefinition ? decodeConfiguredConditionDefinition(data.definition) : undefined;
  if (data.trigger !== 'attack-hit' || typeof data.status !== 'string'
    || (definition ? data.status !== definition.id : !NATIVE_LIFECYCLE_STATUSES.includes(data.status as NativeLifecycleStatus))) {
    throw new TypeError('Unsupported status lifecycle trigger or native status.');
  }
  const duration = plain(data.duration, ['value', 'unit']);
  if (duration.unit !== 'minute' && duration.unit !== 'round') throw new TypeError('Unsupported status lifecycle duration unit.');
  const repeatSave = plain(data.repeatSave, ['ability', 'dc', 'timing', 'optional']);
  if (!['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(String(repeatSave.ability))
    || repeatSave.timing !== 'target-turn-end' || typeof repeatSave.optional !== 'boolean') {
    throw new TypeError('Unsupported status lifecycle repeat save.');
  }
  return {
    trigger: 'attack-hit',
    status: data.status as StatusLifecycleParameters['status'],
    ...(definition ? { definition } : {}),
    duration: { value: integer(duration.value, duration.unit === 'minute' ? 60 : 100), unit: duration.unit },
    repeatSave: { ability: repeatSave.ability as StatusLifecycleParameters['repeatSave']['ability'],
      dc: integer(repeatSave.dc, 30), timing: 'target-turn-end', optional: repeatSave.optional },
  };
}
