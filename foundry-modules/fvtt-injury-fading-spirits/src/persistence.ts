import { MODULE_ID, SCHEMA_VERSION } from './constants.ts';
import { createActorModuleState, parseActorModuleState, type ActorModuleState } from './state.ts';

export function isActiveGmWriter(): boolean {
  return Boolean(game.user?.isGM && game.users?.activeGM?.id === game.user.id);
}

export function activeGmId(): string | null {
  return typeof game.users?.activeGM?.id === 'string' ? game.users.activeGM.id : null;
}

export function actorHp(actor: any): { value: number; max: number } {
  return {
    value: nonNegative(actor?.system?.attributes?.hp?.value),
    max: nonNegative(actor?.system?.attributes?.hp?.max),
  };
}

export function readActorState(actor: any): ActorModuleState {
  const hp = actorHp(actor);
  return parseActorModuleState(actor?.flags?.[MODULE_ID], hp.value, hp.max);
}

export async function writeActorState(actor: any, state: ActorModuleState, transactionId: string, extra: Record<string, unknown> = {}): Promise<void> {
  if (!isActiveGmWriter()) throw new Error('Only the active GM may write Injury/Fading Spirits state.');
  if (!actor?.uuid || typeof actor.update !== 'function') throw new Error('A valid Actor is required.');
  if (state.schemaVersion !== SCHEMA_VERSION) throw new Error('Refusing to write an unknown schema version.');
  assertExistingHistoryCanRoundTrip(actor);
  // Resurrection owns only its subtree. Preserve the historical injury bytes
  // and any unknown legacy fields for a later, separately reviewed migration.
  await actor.update({ ...extra,
    [`flags.${MODULE_ID}.schemaVersion`]: SCHEMA_VERSION,
    [`flags.${MODULE_ID}.fadingSpirits`]: structuredClone(state.fadingSpirits),
  }, {
    [MODULE_ID]: { internal: true, transactionId },
  });
}

function assertExistingHistoryCanRoundTrip(actor: any): void {
  const moduleRaw = actor?.flags?.[MODULE_ID];
  if (moduleRaw == null) return;
  if (typeof moduleRaw !== 'object' || Array.isArray(moduleRaw)) {
    throw new Error('Refusing to overwrite an unrecognized current Injury/Fading Spirits Actor flag.');
  }
  if (moduleRaw.schemaVersion !== undefined && moduleRaw.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Refusing to overwrite an unsupported current Injury/Fading Spirits schema version.');
  }
  const raw = moduleRaw.fadingSpirits;
  if (raw == null) return;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Refusing to overwrite an unrecognized current fadingSpirits value.');
  }
  const parsed = readActorState(actor).fadingSpirits;
  // Foundry recursively merges object siblings but replaces arrays. These
  // existing values must survive the read/normalize/write path unchanged.
  for (const key of ['attemptHistory', 'processedTransactionIds', 'pendingRitual', 'resolutionInProgress'] as const) {
    if (raw[key] !== undefined && !retainsExistingData(raw[key], parsed[key])) {
      throw new Error(`Refusing to rewrite unrecognized existing ${key}; review the original Actor flag before writing.`);
    }
  }
}

function retainsExistingData(left: unknown, right: unknown, depth = 0): boolean {
  if (Object.is(left, right)) return true;
  if (depth > 64 || !left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((entry, index) => retainsExistingData(entry, right[index], depth + 1));
  }
  const leftRecord = left as Record<string, unknown>, rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  // The parser may add known defaults, but every pre-existing key and value
  // must remain intact. In arrays the length and entry order stay exact.
  return keys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key)
    && retainsExistingData(leftRecord[key], rightRecord[key], depth + 1));
}

export async function ensureActorState(actor: any): Promise<ActorModuleState> {
  const hp = actorHp(actor);
  const raw = actor?.flags?.[MODULE_ID];
  if (raw?.schemaVersion !== undefined) return readActorState(actor);
  const state = createActorModuleState(hp.value, hp.max);
  await writeActorState(actor, state, `initialize:${actor.uuid}`);
  return state;
}

export function isManagedActor(actor: any): boolean {
  if (!actor || actor.pack) return false;
  if (actor.type === 'character') return true;
  return actor.type === 'npc' && game.settings.get(MODULE_ID, 'manageNpcs') === true;
}

function nonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
