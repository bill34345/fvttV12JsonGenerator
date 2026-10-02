/**
 * Browser-safe evidence helpers for damage that was actually applied by
 * dnd5e.  The runtime collects the observations at the Foundry hook boundary;
 * this file only checks the immutable identities and the HP/temp-HP delta.
 *
 * A claimed damage amount is deliberately absent from DamageProof.  The only
 * amount returned by validateDamageProof is derived from the before/after
 * Actor state that was observed around updateActor.
 */

export const DAMAGE_PROOF_SCHEMA_VERSION = 1 as const;

export const DAMAGE_PROOF_LIMITS = Object.freeze({
  attackId: 256,
  messageId: 256,
  actorUuid: 512,
  requesterId: 256,
  nonce: 128,
  hp: 1_000_000_000,
}) as Readonly<{
  attackId: number;
  messageId: number;
  actorUuid: number;
  requesterId: number;
  nonce: number;
  hp: number;
}>;

export interface DamageHpSnapshot {
  hp: number;
  tempHp: number;
}

/**
 * The proof is intentionally small and closed.  Additional properties are
 * rejected by parseDamageProof so caller supplied metadata cannot quietly
 * become part of the authority decision.
 */
export interface DamageProof {
  schemaVersion: typeof DAMAGE_PROOF_SCHEMA_VERSION;
  attackId: string;
  attackMessageId: string;
  damageMessageId: string;
  /** The source Actor that requested the attack. */
  actorUuid: string;
  /** The Actor whose HP update is being proved. */
  targetActorUuid: string;
  requesterId: string;
  before: DamageHpSnapshot;
  after: DamageHpSnapshot;
  nonce: string;
}

export interface DamageUpdateEvidence {
  /** UUID of the Actor passed to updateActor, or the Actor document itself. */
  actorUuid?: unknown;
  actor?: unknown;
  /** The `changed` argument from updateActor. */
  changed?: unknown;
  changes?: unknown;
  /** The post-update state read from the same Actor document. */
  after?: unknown;
}

/**
 * Message values may be real ChatMessage documents or small plain objects
 * assembled by the runtime.  The optional scalar fields fill in values that
 * the Foundry message schema does not expose uniformly across dnd5e versions.
 */
export interface DamageMessageLinkEvidence {
  attackMessage?: unknown;
  damageMessage?: unknown;
  usageMessage?: unknown;
  actorUuid?: unknown;
  attackId?: unknown;
  requesterId?: unknown;
  targetActorUuid?: unknown;
  originatingAttackMessageId?: unknown;
  /** Exact Midi 14.0.11 card identities; supplied only by the runtime. */
  midiSameCard?: {
    version: unknown;
    activityUuid: unknown;
    itemUuid: unknown;
    targetTokenUuid: unknown;
    linkedAttackCount?: unknown;
  };
}

export interface DamageProofEvidence {
  updateActor: DamageUpdateEvidence;
  messages: DamageMessageLinkEvidence;
}

export type DamageProofFailureReason =
  | 'invalid-proof-schema'
  | 'invalid-proof-identifier'
  | 'invalid-proof-state'
  | 'state-increased'
  | 'non-positive-actual-damage'
  | 'missing-update-evidence'
  | 'invalid-update-actor'
  | 'update-actor-target-mismatch'
  | 'missing-updated-state'
  | 'updated-state-mismatch'
  | 'missing-hp-update'
  | 'invalid-hp-update'
  | 'hp-update-mismatch'
  | 'missing-attack-message'
  | 'missing-damage-message'
  | 'ambiguous-message-identity'
  | 'attack-message-mismatch'
  | 'damage-message-mismatch'
  | 'missing-attack-link'
  | 'attack-link-mismatch'
  | 'missing-damage-link'
  | 'damage-link-mismatch'
  | 'missing-message-target'
  | 'ambiguous-message-target'
  | 'message-target-mismatch'
  | 'missing-message-requester'
  | 'message-requester-mismatch';

export interface DamageProofFailure {
  ok: false;
  reason: DamageProofFailureReason;
}

export interface DamageProofSuccess {
  ok: true;
  proof: DamageProof;
  actualDamage: number;
  hpDamage: number;
  tempHpDamage: number;
}

export type DamageProofValidation = DamageProofFailure | DamageProofSuccess;

interface ParseSuccess {
  ok: true;
  value: DamageProof;
}

type ParseResult = ParseSuccess | DamageProofFailure;

interface CandidateResult {
  present: boolean;
  value?: string;
  ambiguous: boolean;
}

interface NumberCandidateResult {
  present: boolean;
  value?: number;
  ambiguous: boolean;
  invalid: boolean;
}

interface SnapshotResult {
  present: boolean;
  value?: DamageHpSnapshot;
  invalid: boolean;
  ambiguous: boolean;
}

interface ChangedHpResult {
  present: boolean;
  hp?: number;
  tempHp?: number;
  hpPresent: boolean;
  tempHpPresent: boolean;
  invalid: boolean;
  ambiguous: boolean;
}

const OWN_KEYS = new Set([
  'schemaVersion',
  'attackId',
  'attackMessageId',
  'damageMessageId',
  'actorUuid',
  'targetActorUuid',
  'requesterId',
  'before',
  'after',
  'nonce',
]);

const SNAPSHOT_KEYS = new Set(['hp', 'tempHp']);

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** dnd5e 5.3.3 emits type=usage; migrated cards may retain its legacy flag. */
export function isUsageMessage(value: unknown): boolean {
  const message = record(value);
  const marker = record(record(message?.flags)?.dnd5e)?.messageType;
  if (message?.type === 'usage') return marker === undefined || marker === 'usage';
  return marker === 'usage';
}

function has(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function boundedNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > DAMAGE_PROOF_LIMITS.hp) return undefined;
  return value;
}

function equalNumber(left: number | undefined, right: number | undefined): boolean {
  return left !== undefined && right !== undefined && Object.is(left, right);
}

function uniqueStrings(values: readonly unknown[], maxLength: number): CandidateResult {
  const normalized: string[] = [];
  let present = false;
  for (const candidate of values) {
    if (candidate === undefined || candidate === null) continue;
    present = true;
    const value = boundedString(candidate, maxLength);
    if (!value) return { present: true, ambiguous: true };
    if (!normalized.includes(value)) normalized.push(value);
  }
  return {
    present,
    value: normalized.length === 1 ? normalized[0] : undefined,
    ambiguous: normalized.length > 1,
  };
}

function combineStringCandidates(
  direct: readonly unknown[],
  discovered: readonly CandidateResult[],
  maxLength: number,
): CandidateResult {
  const combined = uniqueStrings(direct, maxLength);
  let present = combined.present;
  const values: unknown[] = [];
  if (combined.value !== undefined) values.push(combined.value);
  for (const candidate of discovered) {
    present ||= candidate.present;
    if (candidate.ambiguous) return { present: true, ambiguous: true };
    if (candidate.value !== undefined) values.push(candidate.value);
  }
  const result = uniqueStrings(values, maxLength);
  return {
    present,
    value: result.value,
    ambiguous: combined.ambiguous || result.ambiguous,
  };
}

function uniqueNumbers(values: readonly unknown[]): NumberCandidateResult {
  const normalized: number[] = [];
  let present = false;
  for (const candidate of values) {
    if (candidate === undefined || candidate === null) continue;
    present = true;
    const value = boundedNumber(candidate);
    if (value === undefined) return { present: true, ambiguous: true, invalid: true };
    if (!normalized.some((entry) => Object.is(entry, value))) normalized.push(value);
  }
  return {
    present,
    value: normalized.length === 1 ? normalized[0] : undefined,
    ambiguous: normalized.length > 1,
    invalid: false,
  };
}

function snapshotFromObject(value: unknown, allowNested: boolean): SnapshotResult {
  const source = record(value);
  if (!source) return { present: false, invalid: true, ambiguous: false };

  const hpValues: unknown[] = [];
  const tempValues: unknown[] = [];
  if (has(source, 'hp')) hpValues.push(source.hp);
  if (has(source, 'tempHp')) tempValues.push(source.tempHp);

  if (allowNested) {
    const nestedSystem = record(source.system);
    const nestedAttributes = record(nestedSystem?.attributes);
    const nested = record(nestedAttributes?.hp);
    if (nested) {
      if (has(nested, 'value')) hpValues.push(nested.value);
      if (has(nested, 'temp')) tempValues.push(nested.temp);
    }
    const attributes = record(source.attributes);
    const attributeHp = record(attributes?.hp);
    if (attributeHp) {
      if (has(attributeHp, 'value')) hpValues.push(attributeHp.value);
      if (has(attributeHp, 'temp')) tempValues.push(attributeHp.temp);
    }
  }

  const hp = uniqueNumbers(hpValues);
  const tempHp = uniqueNumbers(tempValues);
  if (!hp.present && !tempHp.present) return { present: false, invalid: false, ambiguous: false };
  if (!hp.present || !tempHp.present) return { present: true, invalid: true, ambiguous: false };
  if (hp.invalid || tempHp.invalid) return { present: true, invalid: true, ambiguous: false };
  if (hp.ambiguous || tempHp.ambiguous) return { present: true, invalid: false, ambiguous: true };
  return {
    present: true,
    value: { hp: hp.value!, tempHp: tempHp.value! },
    invalid: false,
    ambiguous: false,
  };
}

function snapshotsEqual(left: DamageHpSnapshot, right: DamageHpSnapshot): boolean {
  return Object.is(left.hp, right.hp) && Object.is(left.tempHp, right.tempHp);
}

function parseSnapshot(value: unknown): DamageHpSnapshot | undefined {
  const source = record(value);
  if (!source || Object.keys(source).some((key) => !SNAPSHOT_KEYS.has(key))) return undefined;
  const hp = boundedNumber(source.hp);
  const tempHp = boundedNumber(source.tempHp);
  if (hp === undefined || tempHp === undefined) return undefined;
  return { hp, tempHp };
}

function actualDamage(proof: DamageProof):
  | { ok: true; actualDamage: number; hpDamage: number; tempHpDamage: number }
  | DamageProofFailure {
  if (proof.after.hp > proof.before.hp || proof.after.tempHp > proof.before.tempHp) {
    return { ok: false, reason: 'state-increased' };
  }
  const hpDamage = proof.before.hp - proof.after.hp;
  const tempHpDamage = proof.before.tempHp - proof.after.tempHp;
  const total = hpDamage + tempHpDamage;
  if (!Number.isFinite(total) || total <= 0) return { ok: false, reason: 'non-positive-actual-damage' };
  return { ok: true, actualDamage: total, hpDamage, tempHpDamage };
}

/** Parse the closed proof schema without trusting extra caller fields. */
export function parseDamageProof(input: unknown, allowMidiSameCard = false): ParseResult {
  const source = record(input);
  if (!source || Object.keys(source).some((key) => !OWN_KEYS.has(key))) {
    return { ok: false, reason: 'invalid-proof-schema' };
  }
  if (source.schemaVersion !== DAMAGE_PROOF_SCHEMA_VERSION) {
    return { ok: false, reason: 'invalid-proof-schema' };
  }
  const attackId = boundedString(source.attackId, DAMAGE_PROOF_LIMITS.attackId);
  const attackMessageId = boundedString(source.attackMessageId, DAMAGE_PROOF_LIMITS.messageId);
  const damageMessageId = boundedString(source.damageMessageId, DAMAGE_PROOF_LIMITS.messageId);
  const actorUuid = boundedString(source.actorUuid, DAMAGE_PROOF_LIMITS.actorUuid);
  const targetActorUuid = boundedString(source.targetActorUuid, DAMAGE_PROOF_LIMITS.actorUuid);
  const requesterId = boundedString(source.requesterId, DAMAGE_PROOF_LIMITS.requesterId);
  const nonce = boundedString(source.nonce, DAMAGE_PROOF_LIMITS.nonce);
  const before = parseSnapshot(source.before);
  const after = parseSnapshot(source.after);
  if (!attackId || !attackMessageId || !damageMessageId || !actorUuid || !targetActorUuid || !requesterId || !nonce) {
    return { ok: false, reason: 'invalid-proof-identifier' };
  }
  if ((!allowMidiSameCard && attackMessageId === damageMessageId) || !before || !after) {
    return { ok: false, reason: 'invalid-proof-state' };
  }
  return {
    ok: true,
    value: {
      schemaVersion: DAMAGE_PROOF_SCHEMA_VERSION,
      attackId,
      attackMessageId,
      damageMessageId,
      actorUuid,
      targetActorUuid,
      requesterId,
      before,
      after,
      nonce,
    },
  };
}

/** Recover omitted fields from the post-update flag, never from an unrelated proof.
 * Foundry diffs nested HP snapshots as well as top-level identity fields.
 * This only reconstructs the payload; validateDamageProof still checks the actual
 * HP update, message linkage, requester, and target before settlement.
 */
export function recoverDamageProofUpdate(update: unknown, stored: unknown): DamageProof | undefined {
  const complete = parseDamageProof(update, true);
  if (complete.ok) return complete.value;
  const delta = record(update);
  const persisted = parseDamageProof(stored, true);
  if (!delta || !persisted.ok || delta.attackId !== persisted.value.attackId
    || delta.nonce !== persisted.value.nonce) return undefined;
  const current = persisted.value;
  for (const [key, value] of Object.entries(delta)) {
    if (!OWN_KEYS.has(key)) return undefined;
    if (key === 'before' || key === 'after') {
      const snapshot = record(value);
      if (!snapshot || Object.entries(snapshot).some(([field, observed]) =>
        !SNAPSHOT_KEYS.has(field) || !Object.is(current[key][field as keyof DamageHpSnapshot], observed))) {
        return undefined;
      }
    } else if (!Object.is(current[key as keyof DamageProof], value)) return undefined;
  }
  return current;
}

/** Build a proof and require a positive, monotonic HP/temp-HP delta. */
export function createDamageProof(input: unknown, allowMidiSameCard = false): DamageProofValidation {
  const parsed = parseDamageProof(input, allowMidiSameCard);
  if (!parsed.ok) return parsed;
  const damage = actualDamage(parsed.value);
  if (!damage.ok) return damage;
  return { ...damage, proof: parsed.value };
}

function fieldValue(source: Record<string, unknown>, path: readonly string[]): NumberCandidateResult {
  let current: unknown = source;
  for (const part of path) {
    const object = record(current);
    if (!object || !has(object, part)) return { present: false, ambiguous: false, invalid: false };
    current = object[part];
  }
  return uniqueNumbers([current]);
}

function changedHpState(input: unknown): ChangedHpResult {
  const source = record(input);
  if (!source) return { present: false, hpPresent: false, tempHpPresent: false, invalid: true, ambiguous: false };
  const hpValues: unknown[] = [];
  const tempValues: unknown[] = [];
  let present = false;
  let invalidPath = false;
  let ambiguousPath = false;

  const addPath = (path: readonly string[], target: unknown[]): void => {
    const result = fieldValue(source, path);
    if (result.present) {
      present = true;
      invalidPath ||= result.invalid;
      ambiguousPath ||= result.ambiguous;
      if (result.value !== undefined) target.push(result.value);
    }
  };
  addPath(['system.attributes.hp.value'], hpValues);
  addPath(['system.attributes.hp.temp'], tempValues);
  addPath(['attributes.hp.value'], hpValues);
  addPath(['attributes.hp.temp'], tempValues);
  addPath(['hp', 'value'], hpValues);
  addPath(['hp', 'temp'], tempValues);
  if (has(source, 'hp')) {
    present = true;
    const hp = source.hp;
    if (record(hp)) {
      if (has(hp as Record<string, unknown>, 'value')) hpValues.push((hp as Record<string, unknown>).value);
      if (has(hp as Record<string, unknown>, 'temp')) tempValues.push((hp as Record<string, unknown>).temp);
      if (has(hp as Record<string, unknown>, 'hp')) hpValues.push((hp as Record<string, unknown>).hp);
      if (has(hp as Record<string, unknown>, 'tempHp')) tempValues.push((hp as Record<string, unknown>).tempHp);
    } else hpValues.push(hp);
  }
  if (has(source, 'tempHp')) {
    present = true;
    tempValues.push(source.tempHp);
  }

  const nestedSystem = record(source.system);
  const nestedAttributes = record(nestedSystem?.attributes);
  const nestedHp = record(nestedAttributes?.hp);
  if (nestedHp) {
    present = true;
    if (has(nestedHp, 'value')) hpValues.push(nestedHp.value);
    if (has(nestedHp, 'temp')) tempValues.push(nestedHp.temp);
  }
  const hp = uniqueNumbers(hpValues);
  const tempHp = uniqueNumbers(tempValues);
  return {
    present,
    hp: hp.value,
    tempHp: tempHp.value,
    hpPresent: hp.present,
    tempHpPresent: tempHp.present,
    invalid: invalidPath || hp.invalid || tempHp.invalid,
    ambiguous: ambiguousPath || hp.ambiguous || tempHp.ambiguous,
  };
}

function messageRecord(value: unknown): Record<string, unknown> | undefined {
  const source = record(value);
  if (!source) return undefined;
  const data = record(source.data);
  if (!data) return source;
  return { ...data, ...source };
}

/** Midi 14.0.11 can leave a completed one-target workflow card at item type 0.
 * This branch is deliberately limited to the observed single attack/damage
 * roll and the card's own calculated target HP record. */
export function midiItemCardDamageMatches(
  value: unknown,
  target?: { actorUuid: string; tokenUuid: string; before?: DamageHpSnapshot; after?: DamageHpSnapshot },
): boolean {
  const message = messageRecord(value);
  const flags = record(message?.flags);
  const midi = record(flags?.['midi-qol']);
  if (midi?.type !== 0 || typeof midi.sourceActorUuid !== 'string'
    || !Array.isArray(midi.hitTargetUuids) || midi.hitTargetUuids.length !== 1
    || !Array.isArray(midi.damageList) || midi.damageList.length !== 1
    || !Array.isArray(midi.damageRolls) || midi.damageRolls.length !== 1
    || !Array.isArray(message?.rolls) || message.rolls.length !== 2) return false;
  const entry = record(midi.damageList[0]);
  const calculation = record(record(entry?.calcDamageOptions)?.midi);
  const attack = record(message.rolls[0]);
  const damage = record(message.rolls[1]);
  const midiAttack = record(midi.attackRoll);
  const midiDamage = record(midi.damageRolls[0]);
  const attackOptions = record(attack?.options);
  const damageOptions = record(damage?.options);
  const midiAttackOptions = record(midiAttack?.options);
  const midiDamageOptions = record(midiDamage?.options);
  const oldHP = boundedNumber(entry?.oldHP);
  const oldTempHP = boundedNumber(entry?.oldTempHP);
  const newHP = boundedNumber(entry?.newHP);
  const newTempHP = boundedNumber(entry?.newTempHP);
  if (!entry || !calculation || oldHP === undefined || oldTempHP === undefined
    || newHP === undefined || newTempHP === undefined
    || newHP > oldHP || newTempHP > oldTempHP || oldHP + oldTempHP <= newHP + newTempHP
    || entry.hpDamage !== oldHP - newHP || entry.tempDamage !== oldTempHP - newTempHP
    || entry.isHit !== true || entry.wasHit !== true
    || entry.targetUuid !== midi.hitTargetUuids[0]
    || calculation.applyDamage !== true || calculation.isHit !== true
    || calculation.sourceActorUuid !== midi.sourceActorUuid
    || calculation.targetUuid !== entry.targetUuid
    || record(attackOptions?.['midi-qol'])?.rollType !== 'attack'
    || record(midiAttackOptions?.['midi-qol'])?.rollType !== 'attack'
    || damageOptions?.rollType !== 'damage' || midiDamageOptions?.rollType !== 'damage'
    || damageOptions?.type !== midiDamageOptions?.type
    || !Number.isFinite(attack?.total) || attack?.total !== midiAttack?.total
    || typeof attackOptions?.__fvttWeaponMasteryUse !== 'string'
    || attackOptions.__fvttWeaponMasteryUse !== midiAttackOptions?.__fvttWeaponMasteryUse
    || !Number.isFinite(damage?.total) || Number(damage?.total) <= 0
    || damage?.total !== midiDamage?.total
    || damage?.formula !== midiDamage?.formula) return false;
  if (target && (entry.actorUuid !== target.actorUuid || entry.targetUuid !== target.tokenUuid
    || (target.before && (oldHP !== target.before.hp || oldTempHP !== target.before.tempHp))
    || (target.after && (newHP !== target.after.hp || newTempHP !== target.after.tempHp)))) return false;
  return true;
}

function normalizedMessageId(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/^ChatMessage\./u, '');
}

function messageId(value: unknown): CandidateResult {
  const source = messageRecord(value);
  if (!source) return { present: false, ambiguous: false };
  return uniqueStrings([source.id, source._id, normalizedMessageId(source.uuid)], DAMAGE_PROOF_LIMITS.messageId);
}

function messageRefId(value: unknown): CandidateResult {
  if (typeof value === 'string') {
    return uniqueStrings([normalizedMessageId(value)], DAMAGE_PROOF_LIMITS.messageId);
  }
  const source = record(value);
  if (!source) return { present: false, ambiguous: false };
  return uniqueStrings([source.id, source._id, normalizedMessageId(source.uuid)], DAMAGE_PROOF_LIMITS.messageId);
}

function messageFlags(value: Record<string, unknown>): Record<string, unknown>[] {
  const flags = record(value.flags);
  if (!flags) return [];
  return [flags, ...Object.values(flags).map(record).filter((entry): entry is Record<string, unknown> => Boolean(entry))];
}

function messageAttackId(value: unknown): CandidateResult {
  const source = messageRecord(value);
  if (!source) return { present: false, ambiguous: false };
  const candidates: unknown[] = [source.attackId];
  for (const flags of messageFlags(source)) candidates.push(flags.attackId);
  return uniqueStrings(candidates, DAMAGE_PROOF_LIMITS.attackId);
}

function messageActor(value: unknown): CandidateResult {
  const source = messageRecord(value);
  if (!source) return { present: false, ambiguous: false };
  const actor = record(source.actor);
  const candidates: unknown[] = [source.actorUuid, actor?.uuid];
  for (const flags of messageFlags(source)) {
    const flagActor = record(flags.actor);
    candidates.push(flags.actorUuid, flagActor?.uuid);
  }
  return uniqueStrings(candidates, DAMAGE_PROOF_LIMITS.actorUuid);
}

function requesterFromValue(value: unknown): unknown {
  const source = record(value);
  return source?.id ?? value;
}

function messageRequester(value: unknown): CandidateResult {
  const source = messageRecord(value);
  if (!source) return { present: false, ambiguous: false };
  const candidates: unknown[] = [
    requesterFromValue(source.author),
    requesterFromValue(source.user),
    source.userId,
  ];
  for (const flags of messageFlags(source)) candidates.push(flags.requesterId);
  return uniqueStrings(candidates, DAMAGE_PROOF_LIMITS.requesterId);
}

function targetFromValue(value: unknown): unknown {
  const source = record(value);
  if (!source) return value;
  const actor = record(source.actor);
  const target = record(source.target);
  const targetActor = record(target?.actor);
  return source.actorUuid ?? source.targetActorUuid ?? source.uuid ?? actor?.uuid ?? target?.actorUuid ?? targetActor?.uuid;
}

function messageTargets(value: unknown): CandidateResult {
  const source = messageRecord(value);
  if (!source) return { present: false, ambiguous: false };
  const target = record(source.target);
  const targetActor = record(target?.actor);
  const candidates: unknown[] = [source.targetActorUuid, source.targetUuid, target?.actorUuid, targetActor?.uuid];
  const targetCollections = [source.targets, source.target, ...messageFlags(source).flatMap((flags) => [flags.targetActorUuid, flags.targetUuid, flags.target, flags.targets])];
  for (const collection of targetCollections) {
    if (collection === undefined || collection === null) continue;
    if (Array.isArray(collection)) candidates.push(...collection.map(targetFromValue));
    else if (collection instanceof Set) candidates.push(...[...collection].map(targetFromValue));
    else if (collection instanceof Map) candidates.push(...[...collection.values()].map(targetFromValue));
    else {
      const object = record(collection);
      if (object && (object.actorUuid || object.targetActorUuid || object.actor || object.target || object.uuid)) {
        candidates.push(targetFromValue(object));
      } else if (object) {
        candidates.push(...Object.values(object).map(targetFromValue));
      } else candidates.push(targetFromValue(collection));
    }
  }
  return uniqueStrings(candidates, DAMAGE_PROOF_LIMITS.actorUuid);
}

function messageOrigin(value: unknown): CandidateResult {
  const source = messageRecord(value);
  if (!source) return { present: false, ambiguous: false };
  const candidates: unknown[] = [source.originatingMessageId, source.originatingMessage];
  for (const flags of messageFlags(source)) {
    candidates.push(flags.originatingMessageId, flags.originatingMessage);
  }
  const values = candidates.map((candidate) => {
    const result = messageRefId(candidate);
    return result.value;
  });
  return uniqueStrings(values, DAMAGE_PROOF_LIMITS.messageId);
}

function actorUuidFromUpdate(update: DamageUpdateEvidence): CandidateResult {
  const actor = record(update.actor);
  return uniqueStrings([update.actorUuid, actor?.uuid], DAMAGE_PROOF_LIMITS.actorUuid);
}

function afterSnapshotFromUpdate(update: DamageUpdateEvidence): SnapshotResult {
  const direct = snapshotFromObject(update.after, true);
  const actor = snapshotFromObject(update.actor, true);
  if (direct.present && actor.present) {
    if (direct.invalid || actor.invalid) return { present: true, invalid: true, ambiguous: false };
    if (direct.ambiguous || actor.ambiguous) return { present: true, invalid: false, ambiguous: true };
    if (!snapshotsEqual(direct.value!, actor.value!)) return { present: true, invalid: false, ambiguous: true };
    return direct;
  }
  return direct.present ? direct : actor;
}

function validateUpdate(proof: DamageProof, update: DamageUpdateEvidence): DamageProofFailure | undefined {
  if (!update || typeof update !== 'object') return { ok: false, reason: 'missing-update-evidence' };
  const actor = actorUuidFromUpdate(update);
  if (!actor.present || actor.ambiguous || !actor.value) return { ok: false, reason: 'invalid-update-actor' };
  if (actor.value !== proof.targetActorUuid) return { ok: false, reason: 'update-actor-target-mismatch' };
  const after = afterSnapshotFromUpdate(update);
  if (!after.present) return { ok: false, reason: 'missing-updated-state' };
  if (after.invalid || after.ambiguous || !after.value) return { ok: false, reason: 'updated-state-mismatch' };
  if (!snapshotsEqual(after.value, proof.after)) return { ok: false, reason: 'updated-state-mismatch' };
  const changed = changedHpState(update.changed ?? update.changes);
  if (!changed.present || (!changed.hpPresent && !changed.tempHpPresent)) return { ok: false, reason: 'missing-hp-update' };
  if (changed.invalid || changed.ambiguous) return { ok: false, reason: 'invalid-hp-update' };
  if (changed.hpPresent && !equalNumber(changed.hp, proof.after.hp)) return { ok: false, reason: 'hp-update-mismatch' };
  if (changed.tempHpPresent && !equalNumber(changed.tempHp, proof.after.tempHp)) return { ok: false, reason: 'hp-update-mismatch' };
  return undefined;
}

function validateMessages(proof: DamageProof, links: DamageMessageLinkEvidence): DamageProofFailure | undefined {
  if (!links || typeof links !== 'object') return { ok: false, reason: 'missing-attack-message' };
  const attack = messageRecord(links.attackMessage);
  const damage = messageRecord(links.damageMessage);
  if (!attack) return { ok: false, reason: 'missing-attack-message' };
  if (!damage) return { ok: false, reason: 'missing-damage-message' };
  const attackIdentity = messageId(attack);
  const damageIdentity = messageId(damage);
  if (attackIdentity.ambiguous || damageIdentity.ambiguous) return { ok: false, reason: 'ambiguous-message-identity' };
  if (!attackIdentity.value || attackIdentity.value !== proof.attackMessageId) return { ok: false, reason: 'attack-message-mismatch' };
  if (!damageIdentity.value || damageIdentity.value !== proof.damageMessageId) return { ok: false, reason: 'damage-message-mismatch' };
  if (links.midiSameCard) {
    const midi = links.midiSameCard;
    const flags = record(damage.flags);
    const dnd = record(flags?.dnd5e);
    const midiFlags = record(flags?.['midi-qol']);
    const activity = record(dnd?.activity);
    const item = record(dnd?.item);
    const attackFlags = record(attack.flags);
    const attackDnd = record(attackFlags?.dnd5e);
    const attackActivity = record(attackDnd?.activity);
    const attackItem = record(attackDnd?.item);
    const wmp = record(attackFlags?.['fvtt-weapon-mastery-properties']);
    const cardWmp = record(flags?.['fvtt-weapon-mastery-properties']);
    const rolls = damage.rolls;
    const hitTargets = midiFlags?.hitTargetUuids;
    const rollTypes = Array.isArray(rolls) ? rolls.map(roll => record(record(record(roll)?.options)?.['midi-qol'])?.rollType) : [];
    const supportedDamage = midiFlags?.type === 4
      ? rollTypes.filter(type => type === 'attack').length === 1
        && rollTypes.some(type => type === 'defaultDamage' || type === 'otherDamage' || type === 'bonusDamage')
      : midiFlags?.type === 0 && typeof midi?.targetTokenUuid === 'string'
        && midiItemCardDamageMatches(damage, { actorUuid: proof.targetActorUuid,
          tokenUuid: midi.targetTokenUuid, before: proof.before, after: proof.after });
    if (midi?.version !== '14.0.11' || !supportedDamage
      || !midi.activityUuid || activity?.uuid !== midi.activityUuid
      || !midi.itemUuid || item?.uuid !== midi.itemUuid
      || !midi.targetTokenUuid || !Array.isArray(hitTargets)
      || hitTargets.length !== 1 || hitTargets[0] !== midi.targetTokenUuid
      || midiFlags?.sourceActorUuid !== proof.actorUuid
      || wmp?.attackId !== proof.attackId
      || (cardWmp?.attackId !== undefined && cardWmp.attackId !== proof.attackId)
      || attackActivity?.uuid !== midi.activityUuid || attackItem?.uuid !== midi.itemUuid
      ) {
      return { ok: false, reason: 'damage-link-mismatch' };
    }
    if (attackIdentity.value !== damageIdentity.value) {
      const attackTargets = messageTargets(attack);
      if (wmp?.midiCardId !== damageIdentity.value || midi.linkedAttackCount !== 1
        || attackDnd?.roll === undefined || record(attackDnd.roll)?.type !== 'attack'
        || attackTargets.ambiguous || attackTargets.value !== proof.targetActorUuid) {
        return { ok: false, reason: 'damage-link-mismatch' };
      }
    }
    const source = messageActor(attack);
    const requester = messageRequester(attack);
    const cardRequester = messageRequester(damage);
    if (source.ambiguous || (source.present && source.value !== proof.actorUuid)
      || requester.ambiguous || requester.value !== proof.requesterId
      || cardRequester.ambiguous || cardRequester.value !== proof.requesterId
      || links.attackId !== proof.attackId || links.actorUuid !== proof.actorUuid
      || links.requesterId !== proof.requesterId || links.targetActorUuid !== proof.targetActorUuid) {
      return { ok: false, reason: 'attack-link-mismatch' };
    }
    return undefined;
  }
  if (attackIdentity.value === damageIdentity.value) return { ok: false, reason: 'ambiguous-message-identity' };

  const attackId = combineStringCandidates(
    [links.attackId],
    [messageAttackId(attack)],
    DAMAGE_PROOF_LIMITS.attackId,
  );
  if (!attackId.present) return { ok: false, reason: 'missing-attack-link' };
  if (attackId.ambiguous || attackId.value !== proof.attackId) return { ok: false, reason: 'attack-link-mismatch' };

  const sourceActor = combineStringCandidates(
    [links.actorUuid],
    [messageActor(attack)],
    DAMAGE_PROOF_LIMITS.actorUuid,
  );
  if (!sourceActor.present) return { ok: false, reason: 'missing-attack-link' };
  if (sourceActor.ambiguous || sourceActor.value !== proof.actorUuid) return { ok: false, reason: 'attack-link-mismatch' };

  const damageOrigin = messageOrigin(damage);
  if (damageOrigin.ambiguous) return { ok: false, reason: 'damage-link-mismatch' };
  if (damageOrigin.present && damageOrigin.value !== proof.attackMessageId) {
    const usage = messageRecord(links.usageMessage);
    const usageId = messageId(usage);
    const attackOrigin = messageOrigin(attack);
    const usageRule = messageAttackId(usage);
    const usageRequester = messageRequester(usage);
    const attackFlags = record(record(attack.flags)?.dnd5e);
    const usageFlags = record(record(usage?.flags)?.dnd5e);
    const attackActivity = record(attackFlags?.activity);
    const attackItem = record(attackFlags?.item);
    const usageActivity = record(usageFlags?.activity);
    const usageItem = record(usageFlags?.item);
    if (!usage || usageId.ambiguous || usageId.value !== damageOrigin.value
      || attackOrigin.ambiguous || attackOrigin.value !== usageId.value
      || usageRule.ambiguous || usageRule.value !== proof.attackId
      || usageRequester.ambiguous || usageRequester.value !== proof.requesterId
      || !isUsageMessage(usage)
      || typeof attackActivity?.uuid !== 'string' || usageActivity?.uuid !== attackActivity.uuid
      || typeof attackItem?.uuid !== 'string' || usageItem?.uuid !== attackItem.uuid) return { ok: false, reason: 'damage-link-mismatch' };
  } else {
    const originId = damageOrigin.present ? damageOrigin
      : combineStringCandidates([links.originatingAttackMessageId], [], DAMAGE_PROOF_LIMITS.messageId);
    if (!originId.present) return { ok: false, reason: 'missing-damage-link' };
    if (originId.ambiguous || originId.value !== proof.attackMessageId) return { ok: false, reason: 'damage-link-mismatch' };
  }

  const attackTarget = messageTargets(attack);
  const damageTarget = messageTargets(damage);
  if (links.targetActorUuid === undefined || links.targetActorUuid === null) {
    if (!attackTarget.present || !damageTarget.present) return { ok: false, reason: 'missing-message-target' };
    if (attackTarget.ambiguous || damageTarget.ambiguous) return { ok: false, reason: 'ambiguous-message-target' };
    if (attackTarget.value !== damageTarget.value || attackTarget.value !== proof.targetActorUuid) {
      return { ok: false, reason: 'message-target-mismatch' };
    }
  } else {
    const target = combineStringCandidates(
      [links.targetActorUuid],
      [attackTarget, damageTarget],
      DAMAGE_PROOF_LIMITS.actorUuid,
    );
    if (!target.present) return { ok: false, reason: 'missing-message-target' };
    if (target.ambiguous || target.value !== proof.targetActorUuid) return { ok: false, reason: 'message-target-mismatch' };
  }

  const requester = combineStringCandidates(
    [links.requesterId],
    [messageRequester(attack)],
    DAMAGE_PROOF_LIMITS.requesterId,
  );
  if (!requester.present) return { ok: false, reason: 'missing-message-requester' };
  if (requester.ambiguous || requester.value !== proof.requesterId) return { ok: false, reason: 'message-requester-mismatch' };
  return undefined;
}

/**
 * Validate the complete preApplyDamage/updateActor proof.  The returned
 * damage is derived only after all identities, message links, and changed
 * Actor fields have passed.
 */
export function validateDamageProof(proofInput: unknown, evidence: DamageProofEvidence): DamageProofValidation {
  const parsed = parseDamageProof(proofInput, Boolean(evidence?.messages?.midiSameCard));
  if (!parsed.ok) return parsed;
  const damage = actualDamage(parsed.value);
  if (!damage.ok) return damage;
  const updateFailure = validateUpdate(parsed.value, evidence?.updateActor);
  if (updateFailure) return updateFailure;
  const messageFailure = validateMessages(parsed.value, evidence?.messages);
  if (messageFailure) return messageFailure;
  return { ...damage, proof: parsed.value };
}
