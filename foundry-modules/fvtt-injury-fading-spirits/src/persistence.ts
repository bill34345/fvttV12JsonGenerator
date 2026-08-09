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
  await actor.update({ ...extra, [`flags.${MODULE_ID}`]: structuredClone(state) }, {
    [MODULE_ID]: { internal: true, transactionId },
  });
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
