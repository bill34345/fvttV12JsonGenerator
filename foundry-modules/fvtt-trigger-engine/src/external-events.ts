import { EXTERNAL_EVENT_LEDGER_SCHEMA_VERSION, EXTERNAL_EVENT_LIMITS, EXTERNAL_EVENT_SCHEMA_VERSION, type ExternalEvent, type ExternalEventData } from './types.ts';

export function validateExternalEvent(input: unknown): ExternalEvent {
  if (!isSafePlainRecord(input)) throw new TypeError('External event must be a plain data object.');
  const value = input as Record<string, unknown>;
  const allowedKeys = new Set([
    'schemaVersion', 'namespace', 'eventId', 'type', 'sourceActorUuid',
    'targetActorUuid', 'activityUuid', 'attackId', 'timestamp', 'data',
  ]);
  for (const key of safeOwnKeys(value)) {
    if (typeof key !== 'string' || !allowedKeys.has(key)) throw new TypeError(`External event contains unsupported field: ${String(key)}.`);
  }

  const schemaVersion = ownValue(value, 'schemaVersion');
  if (schemaVersion !== EXTERNAL_EVENT_SCHEMA_VERSION) throw new TypeError('External event schemaVersion must be 1.');
  const namespace = readExternalIdentifier(ownValue(value, 'namespace'), 'namespace', EXTERNAL_EVENT_LIMITS.maxNamespaceOrTypeLength);
  const type = readExternalIdentifier(ownValue(value, 'type'), 'type', EXTERNAL_EVENT_LIMITS.maxNamespaceOrTypeLength);
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(namespace)) throw new TypeError('External event namespace is unsafe.');
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(type)) throw new TypeError('External event type is unsafe.');

  const eventId = readExternalIdentifier(ownValue(value, 'eventId'), 'eventId');
  const sourceActorUuid = readExternalIdentifier(ownValue(value, 'sourceActorUuid'), 'sourceActorUuid');
  const targetActorUuidValue = optionalOwnValue(value, 'targetActorUuid');
  const targetActorUuid = targetActorUuidValue === undefined
    ? undefined
    : readExternalIdentifier(targetActorUuidValue, 'targetActorUuid');
  const activityUuid = readExternalIdentifier(ownValue(value, 'activityUuid'), 'activityUuid');
  const attackId = readExternalIdentifier(ownValue(value, 'attackId'), 'attackId');
  const timestamp = ownValue(value, 'timestamp');
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError('External event timestamp must be a non-negative safe integer.');
  }

  const dataValue = optionalOwnValue(value, 'data');
  const data = dataValue === undefined ? undefined : validateExternalData(dataValue);
  const normalized: ExternalEvent = {
    schemaVersion: EXTERNAL_EVENT_SCHEMA_VERSION,
    namespace,
    eventId,
    type,
    sourceActorUuid,
    ...(targetActorUuid === undefined ? {} : { targetActorUuid }),
    activityUuid,
    attackId,
    timestamp,
    ...(data === undefined ? {} : { data }),
  };
  const serialized = JSON.stringify(normalized);
  if (byteLength(serialized) > EXTERNAL_EVENT_LIMITS.maxEnvelopeBytes) {
    throw new TypeError(`External event exceeds ${EXTERNAL_EVENT_LIMITS.maxEnvelopeBytes} bytes.`);
  }
  return normalized;
}

function validateExternalData(input: unknown): ExternalEventData {
  if (!isSafePlainRecord(input)) throw new TypeError('External event data must be a plain record.');
  const data = input as Record<string, unknown>;
  const keys = safeOwnKeys(data);
  if (keys.some((key) => typeof key !== 'string')) throw new TypeError('External event data keys must be strings.');
  if (keys.length > EXTERNAL_EVENT_LIMITS.maxDataKeys) throw new TypeError(`External event data may contain at most ${EXTERNAL_EVENT_LIMITS.maxDataKeys} fields.`);

  const normalized: ExternalEventData = {};
  for (const key of keys as string[]) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new TypeError(`External event data key is unsafe: ${key}.`);
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u.test(key) || key.length > EXTERNAL_EVENT_LIMITS.maxDataKeyLength) {
      throw new TypeError(`External event data key is unsafe: ${key}.`);
    }
    if (/(?:blind|secret|hidden|raw|roll|dice?|formula)/iu.test(key)) {
      throw new TypeError(`External event data cannot contain raw roll field: ${key}.`);
    }
    const value = ownValue(data, key);
    if (value === null || typeof value === 'boolean') {
      normalized[key] = value;
      continue;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError(`External event data field is not finite: ${key}.`);
      normalized[key] = value;
      continue;
    }
    if (typeof value === 'string') {
      if (value.length > EXTERNAL_EVENT_LIMITS.maxDataStringLength || /[\u0000-\u001f\u007f]/u.test(value)) {
        throw new TypeError(`External event data string is unsafe or oversized: ${key}.`);
      }
      normalized[key] = value;
      continue;
    }
    throw new TypeError(`External event data must contain primitive values: ${key}.`);
  }
  return normalized;
}

function readExternalIdentifier(value: unknown, path: string, maxLength: number = EXTERNAL_EVENT_LIMITS.maxIdentifierLength): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`External event ${path} must be a non-empty bounded string.`);
  }
  if (/[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`External event ${path} contains unsafe control characters.`);
  return value;
}

export function parseExternalEventLedger(raw: unknown): ExternalEvent[] {
  let candidate = raw;
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate) as unknown; }
    catch { return []; }
  }
  if (!isSafePlainRecord(candidate)) return [];
  try {
    if (ownValue(candidate, 'schemaVersion') !== EXTERNAL_EVENT_LEDGER_SCHEMA_VERSION) return [];
    const rawEvents = ownValue(candidate, 'events');
    if (!Array.isArray(rawEvents)) return [];

    const byKey = new Map<string, ExternalEvent>();
    for (const rawEvent of rawEvents) {
      try {
        const event = validateExternalEvent(rawEvent);
        const key = externalEventKey(event);
        byKey.delete(key);
        byKey.set(key, event);
      } catch {
        // World settings are untrusted input; invalid ledger entries are ignored.
      }
    }
    return trimExternalEvents([...byKey.values()]);
  } catch {
    return [];
  }
}

export function serializeExternalEventLedger(events: readonly ExternalEvent[]): string {
  const bounded = trimExternalEvents(events);
  return JSON.stringify({ schemaVersion: EXTERNAL_EVENT_LEDGER_SCHEMA_VERSION, events: bounded });
}

function trimExternalEvents(events: readonly ExternalEvent[]): ExternalEvent[] {
  const bounded = events.slice(-EXTERNAL_EVENT_LIMITS.maxLedgerEntries).map(cloneExternalEvent);
  while (bounded.length > 0 && byteLength(JSON.stringify({ schemaVersion: EXTERNAL_EVENT_LEDGER_SCHEMA_VERSION, events: bounded })) > EXTERNAL_EVENT_LIMITS.maxLedgerBytes) {
    bounded.shift();
  }
  return bounded;
}

export function cloneExternalEvent(event: ExternalEvent): ExternalEvent {
  return JSON.parse(JSON.stringify(event)) as ExternalEvent;
}

export function externalEventKey(event: ExternalEvent): string {
  return `${event.namespace}\u001f${event.eventId}`;
}

/** Choose the next bounded ledger without mutating the runtime's committed state. */
export function planExternalEventPublication(
  events: readonly ExternalEvent[],
  keys: ReadonlySet<string>,
  event: ExternalEvent,
): { status: 'duplicate' } | { status: 'published'; events: ExternalEvent[]; keys: Set<string> } {
  if (keys.has(externalEventKey(event))) return { status: 'duplicate' };
  const nextEvents = trimExternalEvents([...events, event]);
  return { status: 'published', events: nextEvents, keys: new Set(nextEvents.map(externalEventKey)) };
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function safeOwnKeys(value: object): (string | symbol)[] {
  try { return Reflect.ownKeys(value); }
  catch { throw new TypeError('External event contains an unreadable object.'); }
}

function ownValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor)) throw new TypeError(`External event field must be a data property: ${key}.`);
  return descriptor.value;
}

function optionalOwnValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) throw new TypeError(`External event field must be a data property: ${key}.`);
  return descriptor.value;
}

function isSafePlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}
