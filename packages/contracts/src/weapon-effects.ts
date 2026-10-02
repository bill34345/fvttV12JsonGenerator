/**
 * Browser safe contracts for the transient weapon mastery effects owned by
 * fvtt-custom-conditions.  These records deliberately live beside, rather
 * than inside, the fixed custom ConditionId contract.  A weapon effect can
 * therefore carry source/target relationships and an attack reservation
 * without changing the meaning of the nineteen existing conditions.
 */

export const WEAPON_EFFECT_SCHEMA_VERSION = 1 as const;
export const WEAPON_EFFECT_FLAG = 'weaponEffect' as const;
export const WEAPON_EFFECT_NAMESPACE = 'fvtt-custom-conditions' as const;

export const WEAPON_EFFECT_KINDS = ['sap', 'slow', 'vex'] as const;
export type WeaponEffectKind = (typeof WEAPON_EFFECT_KINDS)[number];

export type WeaponEffectRuleId =
  | 'dnd2024.sap'
  | 'dnd2024.slow'
  | 'dnd2024.vex'
  | (string & {});

export type WeaponEffectPhase = 'start' | 'end';
export type WeaponEffectTurnReference = 'source' | 'target';

export interface WeaponEffectSource {
  actorUuid: string;
  itemUuid?: string;
  activityUuid?: string;
  /** A stable Activity identifier is useful when a document UUID is not available. */
  activityId?: string;
}

export interface WeaponEffectTarget {
  actorUuid: string;
  tokenUuid?: string;
}

export interface WeaponEffectTurnAnchor {
  combatUuid: string;
  round: number;
  turn: number;
}

export interface WeaponEffectExpiry {
  /** Which Actor's turn establishes the expiry boundary. */
  reference: WeaponEffectTurnReference;
  phase: WeaponEffectPhase;
  /** Number of matching reference turns after the anchor. */
  turns: number;
  /** Filled by the runtime when the effect is applied if a Combat is active. */
  anchor?: WeaponEffectTurnAnchor;
}

export interface SapWeaponEffectParams {
  readonly kind?: 'sap';
}

export interface SlowWeaponEffectParams {
  /** Feet removed from each movement mode which has a positive speed. */
  speedReduction: number;
  /** Optional explicit movement modes; an omitted list means all modes. */
  movementTypes?: readonly string[];
}

export interface VexWeaponEffectParams {
  readonly kind?: 'vex';
}

export type WeaponEffectParams =
  | SapWeaponEffectParams
  | SlowWeaponEffectParams
  | VexWeaponEffectParams;

export type WeaponEffectConsumption = 'nextCompletedAttack';

export type WeaponEffectReservationState = 'reserved' | 'started';

/**
 * A single reservation is persisted with the effect.  The instanceId and
 * revision pair makes a stale ticket unable to consume a replacement effect.
 */
export interface WeaponEffectReservation {
  attackId: string;
  instanceId: string;
  revision: number;
  targetActorUuid?: string;
  targetTokenUuid?: string;
  state: WeaponEffectReservationState;
  reservedAt: number;
  startedAt?: number;
}

export interface WeaponEffectInstance {
  schemaVersion: typeof WEAPON_EFFECT_SCHEMA_VERSION;
  instanceId: string;
  revision: number;
  effectKind: WeaponEffectKind;
  ruleId: string;
  stackingGroup: string;
  params: WeaponEffectParams;
  source: WeaponEffectSource;
  target: WeaponEffectTarget;
  enabled: boolean;
  /** Sap and Vex default to this consumption mode; Slow is persistent. */
  consumeOn?: WeaponEffectConsumption;
  expires?: WeaponEffectExpiry;
  reservation?: WeaponEffectReservation;
  createdAt: number;
}

export interface WeaponEffectInput {
  effectKind?: WeaponEffectKind;
  /** `kind` is accepted as a convenience for callers which use the weapon rule contract. */
  kind?: WeaponEffectKind;
  ruleId?: WeaponEffectRuleId;
  stackingGroup?: string;
  params?: Partial<WeaponEffectParams>;
  source: WeaponEffectSource;
  target: WeaponEffectTarget;
  enabled?: boolean;
  consumeOn?: WeaponEffectConsumption;
  expires?: WeaponEffectExpiry;
  name?: string;
  origin?: string;
}

export interface WeaponEffectReservationInput {
  attackId: string;
  targetActorUuid?: string;
  targetTokenUuid?: string;
  /** Mark the reservation as started when a caller has crossed its roll boundary. */
  started?: boolean;
  /** Restrict selection to one known effect when several effects are eligible. */
  effectId?: string;
}

export interface WeaponEffectReservationTicket extends WeaponEffectReservation {
  effectId: string;
}

const RULES: Readonly<Record<WeaponEffectKind, { ruleId: string; stackingGroup: string }>> = {
  sap: { ruleId: 'dnd2024.sap', stackingGroup: 'dnd2024.sap' },
  slow: { ruleId: 'dnd2024.slow', stackingGroup: 'dnd2024.slow' },
  vex: { ruleId: 'dnd2024.vex', stackingGroup: 'dnd2024.vex' },
};

const IDENTIFIER = /^[^\u0000-\u001f\u007f\s]{1,240}$/;
const GROUP_IDENTIFIER = /^[a-zA-Z][a-zA-Z0-9._:-]{0,119}$/;

export function isWeaponEffectKind(value: unknown): value is WeaponEffectKind {
  return typeof value === 'string' && (WEAPON_EFFECT_KINDS as readonly string[]).includes(value);
}

export function defaultWeaponEffectRule(kind: WeaponEffectKind): { ruleId: string; stackingGroup: string } {
  return RULES[kind];
}

export function defaultWeaponEffectParams(kind: WeaponEffectKind): WeaponEffectParams {
  return kind === 'slow' ? { speedReduction: 10 } : {};
}

export function buildWeaponEffectFlag(instance: WeaponEffectInstance): Record<string, unknown> {
  return { [WEAPON_EFFECT_NAMESPACE]: { [WEAPON_EFFECT_FLAG]: parseWeaponEffectInstance(instance) } };
}

export function readWeaponEffectInstance(document: any): WeaponEffectInstance | undefined {
  const value = document?.flags?.[WEAPON_EFFECT_NAMESPACE]?.[WEAPON_EFFECT_FLAG];
  if (value === undefined) return undefined;
  try { return parseWeaponEffectInstance(value); } catch { return undefined; }
}

export function createWeaponEffectInstance(
  input: WeaponEffectInput,
  options: Partial<Pick<WeaponEffectInstance, 'instanceId' | 'revision' | 'createdAt'>> = {},
): WeaponEffectInstance {
  if (input.effectKind !== undefined && input.kind !== undefined && input.effectKind !== input.kind) {
    throw new TypeError('Weapon effect kind aliases disagree.');
  }
  const effectKind = input.effectKind ?? input.kind;
  if (!isWeaponEffectKind(effectKind)) throw new TypeError('Unknown weapon effect kind.');
  const defaults = defaultWeaponEffectRule(effectKind);
  const params = { ...defaultWeaponEffectParams(effectKind), ...(input.params ?? {}) } as WeaponEffectParams;
  return parseWeaponEffectInstance({
    schemaVersion: WEAPON_EFFECT_SCHEMA_VERSION,
    instanceId: options.instanceId ?? randomInstanceId(),
    revision: options.revision ?? 0,
    effectKind,
    ruleId: input.ruleId ?? defaults.ruleId,
    stackingGroup: input.stackingGroup ?? defaults.stackingGroup,
    params,
    source: input.source,
    target: input.target,
    enabled: input.enabled ?? true,
    ...(input.consumeOn === undefined
      ? (effectKind === 'sap' || effectKind === 'vex' ? { consumeOn: 'nextCompletedAttack' } : {})
      : { consumeOn: input.consumeOn }),
    ...(input.expires ? { expires: input.expires } : {}),
    createdAt: options.createdAt ?? Date.now(),
  });
}

export function parseWeaponEffectInstance(value: unknown): WeaponEffectInstance {
  if (!record(value)) throw new TypeError('Weapon effect instance must be an object.');
  if (value.schemaVersion !== WEAPON_EFFECT_SCHEMA_VERSION) throw new TypeError('Unsupported weapon effect schemaVersion.');
  const instanceId = requiredIdentifier(value.instanceId, 'instanceId');
  const revision = finiteInteger(value.revision, 'revision', 0, Number.MAX_SAFE_INTEGER);
  if (!isWeaponEffectKind(value.effectKind)) throw new TypeError('Unknown weapon effect kind.');
  const effectKind = value.effectKind;
  const ruleId = requiredIdentifier(value.ruleId, 'ruleId');
  const stackingGroup = requiredString(value.stackingGroup, 'stackingGroup');
  if (!GROUP_IDENTIFIER.test(stackingGroup)) throw new TypeError('Invalid weapon effect stackingGroup.');
  const official = RULES[effectKind];
  if (ruleId.startsWith('dnd2024.')
    && (ruleId !== official.ruleId || stackingGroup !== official.stackingGroup)) {
    throw new TypeError('Official weapon effect rule identity is immutable.');
  }
  const source = parseSource(value.source);
  const target = parseTarget(value.target);
  if (!record(value.params)) throw new TypeError('Weapon effect params must be an object.');
  const params = parseParams(effectKind, value.params);
  if (typeof value.enabled !== 'boolean') throw new TypeError('Weapon effect enabled must be a boolean.');
  const consumeOn = value.consumeOn === undefined ? undefined : value.consumeOn;
  if (consumeOn !== undefined && consumeOn !== 'nextCompletedAttack') throw new TypeError('Unsupported weapon effect consumption.');
  if ((effectKind === 'sap' || effectKind === 'vex') && consumeOn !== 'nextCompletedAttack') {
    throw new TypeError(`${effectKind} must consume on the next completed attack.`);
  }
  if (effectKind === 'slow' && consumeOn !== undefined) throw new TypeError('Slow cannot consume on an attack.');
  const expires = value.expires === undefined ? undefined : parseExpiry(value.expires);
  const reservation = value.reservation === undefined ? undefined : parseReservation(value.reservation, instanceId);
  if (reservation && reservation.revision !== revision) throw new TypeError('Weapon effect reservation revision does not match instance revision.');
  const createdAt = finiteNumber(value.createdAt, 'createdAt');
  return {
    schemaVersion: WEAPON_EFFECT_SCHEMA_VERSION,
    instanceId,
    revision,
    effectKind,
    ruleId,
    stackingGroup,
    params,
    source,
    target,
    enabled: value.enabled,
    ...(consumeOn === undefined ? {} : { consumeOn }),
    ...(expires === undefined ? {} : { expires }),
    ...(reservation === undefined ? {} : { reservation }),
    createdAt,
  };
}

function parseParams(kind: WeaponEffectKind, value: Record<string, unknown>): WeaponEffectParams {
  const keys = Object.keys(value);
  if (kind !== 'slow' && keys.some((key) => key !== 'kind')) throw new TypeError(`Unknown ${kind} weapon effect parameter.`);
  if (kind === 'slow') {
    const speedReduction = value.speedReduction;
    if (!Number.isInteger(speedReduction) || Number(speedReduction) < 1 || Number(speedReduction) > 120) {
      throw new TypeError('Slow speedReduction must be an integer from 1 to 120.');
    }
    const movementTypes = value.movementTypes;
    if (movementTypes !== undefined && (!Array.isArray(movementTypes)
      || movementTypes.length > 12 || movementTypes.some((entry) => typeof entry !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(entry)))) {
      throw new TypeError('Slow movementTypes must be a list of movement identifiers.');
    }
    return { speedReduction: Number(speedReduction), ...(movementTypes === undefined ? {} : { movementTypes: [...movementTypes] }) };
  }
  if (value.kind !== undefined && value.kind !== kind) throw new TypeError(`Invalid ${kind} weapon effect params.`);
  return value.kind === undefined ? {} : { kind };
}

function parseSource(value: unknown): WeaponEffectSource {
  if (!record(value)) throw new TypeError('Weapon effect source must be an object.');
  const actorUuid = requiredIdentifier(value.actorUuid, 'source.actorUuid');
  const itemUuid = optionalIdentifier(value.itemUuid, 'source.itemUuid');
  const activityUuid = optionalIdentifier(value.activityUuid, 'source.activityUuid');
  const activityId = optionalIdentifier(value.activityId, 'source.activityId');
  return {
    actorUuid,
    ...(itemUuid === undefined ? {} : { itemUuid }),
    ...(activityUuid === undefined ? {} : { activityUuid }),
    ...(activityId === undefined ? {} : { activityId }),
  };
}

function parseTarget(value: unknown): WeaponEffectTarget {
  if (!record(value)) throw new TypeError('Weapon effect target must be an object.');
  const actorUuid = requiredIdentifier(value.actorUuid, 'target.actorUuid');
  const tokenUuid = optionalIdentifier(value.tokenUuid, 'target.tokenUuid');
  return { actorUuid, ...(tokenUuid === undefined ? {} : { tokenUuid }) };
}

function parseExpiry(value: unknown): WeaponEffectExpiry {
  if (!record(value) || (value.reference !== 'source' && value.reference !== 'target')
    || (value.phase !== 'start' && value.phase !== 'end')) throw new TypeError('Invalid weapon effect expiry.');
  const turns = finiteInteger(value.turns, 'expires.turns', 1, 1000);
  const anchor = value.anchor === undefined ? undefined : parseAnchor(value.anchor);
  return { reference: value.reference, phase: value.phase, turns, ...(anchor ? { anchor } : {}) };
}

function parseAnchor(value: unknown): WeaponEffectTurnAnchor {
  if (!record(value)) throw new TypeError('Invalid weapon effect turn anchor.');
  return {
    combatUuid: requiredIdentifier(value.combatUuid, 'expires.anchor.combatUuid'),
    round: finiteInteger(value.round, 'expires.anchor.round', 0, Number.MAX_SAFE_INTEGER),
    turn: finiteInteger(value.turn, 'expires.anchor.turn', 0, Number.MAX_SAFE_INTEGER),
  };
}

function parseReservation(value: unknown, instanceId: string): WeaponEffectReservation {
  if (!record(value)) throw new TypeError('Invalid weapon effect reservation.');
  const reservationInstanceId = requiredIdentifier(value.instanceId, 'reservation.instanceId');
  if (reservationInstanceId !== instanceId) throw new TypeError('Reservation instanceId does not match effect instanceId.');
  const state = value.state;
  if (state !== 'reserved' && state !== 'started') throw new TypeError('Invalid weapon effect reservation state.');
  const revision = finiteInteger(value.revision, 'reservation.revision', 0, Number.MAX_SAFE_INTEGER);
  const reservedAt = finiteNumber(value.reservedAt, 'reservation.reservedAt');
  const targetActorUuid = optionalIdentifier(value.targetActorUuid, 'reservation.targetActorUuid');
  const targetTokenUuid = optionalIdentifier(value.targetTokenUuid, 'reservation.targetTokenUuid');
  const startedAt = value.startedAt === undefined ? undefined : finiteNumber(value.startedAt, 'reservation.startedAt');
  return {
    attackId: requiredIdentifier(value.attackId, 'reservation.attackId'),
    instanceId: reservationInstanceId,
    revision,
    ...(targetActorUuid === undefined ? {} : { targetActorUuid }),
    ...(targetTokenUuid === undefined ? {} : { targetTokenUuid }),
    state,
    reservedAt,
    ...(startedAt === undefined ? {} : { startedAt }),
  };
}

function record(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`Invalid weapon effect ${field}.`);
  return value;
}

function requiredIdentifier(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (!IDENTIFIER.test(result)) throw new TypeError(`Invalid weapon effect ${field}.`);
  return result;
}

function optionalIdentifier(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredIdentifier(value, field);
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`Invalid weapon effect ${field}.`);
  return value;
}

function finiteInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  const result = finiteNumber(value, field);
  if (!Number.isInteger(result) || result < minimum || result > maximum) throw new TypeError(`Invalid weapon effect ${field}.`);
  return result;
}

function randomInstanceId(): string {
  const randomUUID = (globalThis as any).crypto?.randomUUID;
  if (typeof randomUUID === 'function') return String(randomUUID.call((globalThis as any).crypto));
  return `weapon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
