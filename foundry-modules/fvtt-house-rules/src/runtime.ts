import { DND5E_VERSION, FLAG, FOUNDRY_VERSION, MAX_LEDGER_ENTRIES, MODULE_ID, SETTING } from "./constants";
import { isAuthority, type ActiveUser } from "./core/authority";
import { createAmmoShot, confirmAmmoRecovery, extractAmmoSnapshotFromChatFlags, parseAmmoTier, recordAmmoShot, type AmmoLedger, type AmmoSnapshot } from "./core/ammo";
import { installCriticalMaxDieIntegration, installCriticalMaxModifier } from "./core/critical-die";
import { hpGambleLockId, lowAbilityReminder, resolveHitPointGamble } from "./core/hp-gamble";
import { isTransactionProcessed, recordTransaction, transactionId, type TransactionLedger } from "./core/ledger";
import {
  classifyAttack,
  chooseNaturalOneConsequence,
  naturalOnePool,
  nextWeaponPenalty,
  repairedWeaponPenalty,
  retainedNatural,
  splitConfiguredCriticalFirstDiceTerm,
  transformNaturalTwentyBaseWeaponDamage,
} from "./core/natural-roll";
import type { NaturalOneConsequence } from "./core/natural-roll";
import { buildPotionActivities, potionSnapshot, type HealingDice } from "./core/potion";
import { advanceStealthMovement, endStealthForDash, nonCombatStealthSuggestion, type StealthState } from "./core/stealth";
import { inspectMidiAdapter } from "./midi-adapter";
import { isV1AmmoLedger, isV1TransactionLedger } from "./migrations";
import { setting } from "./settings";

type AnyRecord = Record<string, any>;

interface AmmoPacket {
  type: "ammo-roll" | "ammo-commit";
  eventId: string;
  messageId: string;
  actorUuid: string;
  activityUuid: string;
  ammunitionId: string;
  /** Captured synchronously before dnd5e consumes the item. */
  beforeQuantity?: number;
  snapshot?: AmmoSnapshot;
}

interface PendingAmmo {
  packet: AmmoPacket;
  senderId?: string;
  snapshot: AmmoSnapshot;
  beforeTier: 0 | 1 | 2 | 3;
  expectedQuantity: number;
  destroy: boolean;
  postSeen: boolean;
}

interface NaturalRequest {
  kind: "nat1" | "nat20";
  actorUuid: string;
  activityUuid: string;
  messageId: string;
  attackClass: "melee" | "ranged" | "spell";
  consequence?: NaturalOneConsequence;
  targetActorUuids?: string[];
}

interface QueuedAmmoCommit {
  packet: AmmoPacket;
  senderId?: string;
}

interface NativeAmmoObservation {
  messageId: string;
  actorUuid: string;
  activityUuid: string;
  ammunitionId: string;
  beforeQuantity: number;
  snapshot: AmmoSnapshot;
  destroy: boolean;
}

interface QueuedAmmoStage {
  packet: AmmoPacket;
  senderId?: string;
}

const pendingAmmo = new Map<string, PendingAmmo>();
const pendingAmmoCommits = new Map<string, QueuedAmmoCommit>();
const pendingAmmoStages = new Map<string, QueuedAmmoStage>();
const nativeAmmoObservations = new Map<string, NativeAmmoObservation>();
const localAmmoPackets = new Map<string, AmmoPacket>();
const pendingTokenOrigins = new Map<string, { x: number; y: number }>();
const pendingTransactions = new Set<string>();

function runtime(): AnyRecord {
  return globalThis as unknown as AnyRecord;
}

function game(): AnyRecord | null {
  return runtime().game ?? null;
}

function users(): ActiveUser[] {
  const collection = game()?.users;
  return collection ? Array.from(collection) as ActiveUser[] : [];
}

function currentIsAuthority(): boolean {
  const current = game()?.user?.id as string | undefined;
  return isAuthority(current, users());
}

function lockedRuntime(): boolean {
  const current = game();
  const foundryVersion = current?.version ?? current?.release?.version;
  return foundryVersion === FOUNDRY_VERSION && current?.system?.id === "dnd5e" && current?.system?.version === DND5E_VERSION;
}

function enabled(key: string): boolean {
  return lockedRuntime() && setting<boolean>(key) === true;
}

function notification(key: string, level: "warn" | "error" | "info" = "warn"): void {
  const ui = runtime().ui;
  ui?.notifications?.[level]?.(game()?.i18n?.localize?.(`FVTT_HOUSE_RULES.${key}`) ?? key);
}

function criticalMaxLocalize(key: string, fallback: string): string {
  const value = game()?.i18n?.localize?.(key);
  return typeof value === "string" ? value : fallback;
}

function criticalMaxDependenciesSupported(): boolean {
  return inspectMidiAdapter(game()?.modules).supported;
}

function explicitFlag(document: AnyRecord, key: string): AnyRecord | null {
  const value = document?.getFlag?.(MODULE_ID, key) ?? document?.flags?.[MODULE_ID]?.[key];
  return value && typeof value === "object" ? value : null;
}

function stableDocumentUuid(document: AnyRecord): string | null {
  return typeof document?.uuid === "string" && document.uuid.length > 0 ? document.uuid : null;
}

async function fromUuidSafe(uuid: string): Promise<AnyRecord | null> {
  if (!uuid || typeof runtime().fromUuid !== "function") return null;
  const value = await runtime().fromUuid(uuid);
  return value && typeof value === "object" ? value : null;
}

function isMutableDocument(document: AnyRecord): boolean {
  return Boolean(document && !document.pack && !document.inCompendium && document.isOwner !== false && typeof document.update === "function");
}

function isTrustedSender(senderId: unknown, actor: AnyRecord): boolean {
  if (typeof senderId !== "string") return false;
  const sender = game()?.users?.get?.(senderId);
  if (!sender?.active) return false;
  if (sender.isGM) return true;
  return typeof actor?.testUserPermission === "function" && actor.testUserPermission(sender, "OWNER");
}

function actorLedger(actor: AnyRecord): TransactionLedger | null {
  const value = explicitFlag(actor, FLAG.ledger);
  if (!value) return { schema: 1, processed: {} };
  return isV1TransactionLedger(value) ? value : null;
}

function actorAmmoLedger(actor: AnyRecord): AmmoLedger | null {
  const value = explicitFlag(actor, FLAG.ammoLedger);
  if (!value) return { schema: 1, shots: {} };
  return isV1AmmoLedger(value) ? value : null;
}

async function writeActorLedgers(actor: AnyRecord, ledger: TransactionLedger, ammoLedger: AmmoLedger): Promise<void> {
  // Use setFlag for the complete object. Foundry's dotted update paths split
  // UUID/event keys such as "Actor.<id>.<id>" into nested objects and break
  // transaction lookup on the next client or reconnect.
  if (typeof actor?.setFlag !== "function") return;
  await actor.setFlag(MODULE_ID, FLAG.ledger, structuredClone(ledger));
  await actor.setFlag(MODULE_ID, FLAG.ammoLedger, structuredClone(ammoLedger));
}

function shotKey(packet: AmmoPacket): string | null {
  return transactionId("ammo", packet.actorUuid, packet.ammunitionId, packet.eventId);
}

function queueAmmoCommit(packet: AmmoPacket, senderId?: unknown): void {
  const key = shotKey(packet);
  if (!key || pendingAmmoCommits.size >= 128) return;
  const entry: QueuedAmmoCommit = {
    packet: structuredClone(packet),
    senderId: typeof senderId === "string" ? senderId : undefined,
  };
  pendingAmmoCommits.set(key, entry);
  const timer = runtime().setTimeout;
  if (typeof timer === "function") timer(() => {
    if (pendingAmmoCommits.get(key) === entry) pendingAmmoCommits.delete(key);
  }, 5000);
}

function ammoSnapshot(item: AnyRecord): AmmoSnapshot | null {
  const object = item?.toObject?.();
  if (!object || typeof object.name !== "string" || typeof object.type !== "string" || !object.system || !object.flags) return null;
  return { name: object.name, img: object.img, type: object.type, system: object.system, flags: object.flags };
}

function sameAmmoSnapshotFacts(left: AmmoSnapshot, right: AmmoSnapshot, ignoreQuantity = false): boolean {
  const normalize = (value: AmmoSnapshot): AnyRecord => {
    const clone = structuredClone(value) as AnyRecord;
    if (ignoreQuantity && clone.system && typeof clone.system === "object") delete clone.system.quantity;
    return clone;
  };
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== "object") return value;
    const record = value as AnyRecord;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  };
  return JSON.stringify(canonicalize(normalize(left))) === JSON.stringify(canonicalize(normalize(right)));
}

function queueAmmoStage(packet: AmmoPacket, senderId?: unknown): void {
  const key = shotKey(packet);
  if (!key || pendingAmmoStages.size >= 128 || pendingAmmoStages.has(key)) return;
  const entry: QueuedAmmoStage = {
    packet: structuredClone(packet),
    senderId: typeof senderId === "string" ? senderId : undefined,
  };
  pendingAmmoStages.set(key, entry);
  const timer = runtime().setTimeout;
  if (typeof timer === "function") timer(() => {
    if (pendingAmmoStages.get(key) === entry) pendingAmmoStages.delete(key);
  }, 5000);
}

function captureNativeAmmoMessage(message: AnyRecord): void {
  if (!enabled(SETTING.ammo) || !currentIsAuthority() || typeof message?.id !== "string") return;
  const actor = message.getAssociatedActor?.() ?? message.actor;
  const ammunitionId = message.flags?.["dnd5e"]?.roll?.ammunition;
  if (!actor || typeof ammunitionId !== "string" || message.speaker?.actor !== actor.id) return;
  const actorDocument = actor as AnyRecord;
  const activity = associatedAttackActivity(message, actorDocument);
  const ammo = actorDocument.items?.get?.(ammunitionId);
  const snapshot = ammo ? ammoSnapshot(ammo) : null;
  const beforeQuantity = Number(ammo?.system?.quantity);
  const actorUuid = stableDocumentUuid(actorDocument);
  if (!activity) return;
  const activityUuid = stableDocumentUuid(activity);
  if (!actorUuid || !activityUuid || !snapshot || !Number.isInteger(beforeQuantity) || beforeQuantity < 1) return;
  const observation: NativeAmmoObservation = {
    messageId: message.id,
    actorUuid,
    activityUuid,
    ammunitionId,
    beforeQuantity,
    snapshot: structuredClone(snapshot),
    destroy: (snapshot.system?.uses as AnyRecord | undefined)?.autoDestroy === true && beforeQuantity === 1,
  };
  nativeAmmoObservations.set(message.id, observation);
  const timer = runtime().setTimeout;
  if (typeof timer === "function") timer(() => {
    if (nativeAmmoObservations.get(message.id) === observation) nativeAmmoObservations.delete(message.id);
  }, 10000);
  for (const [key, queued] of Array.from(pendingAmmoStages.entries())) {
    if (queued.packet.messageId !== message.id) continue;
    pendingAmmoStages.delete(key);
    void stageAmmoPacket(queued.packet, queued.senderId);
  }
}

function associatedAttackActivity(message: AnyRecord, actor: AnyRecord, expected?: AnyRecord): AnyRecord | null {
  let associated: AnyRecord | null = null;
  try {
    const value = message?.getAssociatedActivity?.();
    if (value && typeof value === "object") associated = value;
  } catch {
    return null;
  }
  if (!associated || associated.type !== "attack" || associated.actor?.id !== actor?.id) return null;
  if (expected && stableDocumentUuid(associated) !== stableDocumentUuid(expected)) return null;
  const activityFlag = message.flags?.["dnd5e"]?.activity;
  if (!activityFlag || activityFlag.type !== associated.type || activityFlag.id !== associated.id
    || activityFlag.uuid !== stableDocumentUuid(associated)) return null;
  const activityItem = associated.item;
  let associatedItem: AnyRecord | null = activityItem ?? null;
  try {
    const value = message?.getAssociatedItem?.();
    if (value && typeof value === "object") associatedItem = value;
  } catch {
    return null;
  }
  if (!activityItem || !associatedItem || stableDocumentUuid(activityItem) !== stableDocumentUuid(associatedItem)) return null;
  const itemFlag = message.flags?.["dnd5e"]?.item;
  if (!itemFlag || itemFlag.type !== associatedItem.type || itemFlag.id !== associatedItem.id
    || itemFlag.uuid !== stableDocumentUuid(associatedItem)) return null;
  return associated;
}

function isNativeAttackMessage(message: AnyRecord, actor: AnyRecord, eventId?: string, ammunitionId?: string, activity?: AnyRecord): boolean {
  if (!message?.id || message.speaker?.actor !== actor?.id) return false;
  if (message.flags?.["dnd5e"]?.messageType !== "roll" || message.flags?.["dnd5e"]?.roll?.type !== "attack") return false;
  if (!Array.isArray(message.rolls) || message.rolls.length === 0) return false;
  if (typeof ammunitionId === "string" && message.flags?.["dnd5e"]?.roll?.ammunition !== ammunitionId) return false;
  if (!associatedAttackActivity(message, actor, activity)) return false;
  // dnd5e 5.3.3 exposes the ChatMessage parent during the attack hooks, but
  // the Roll id is not retained when the message is rehydrated. The packet
  // uses the native message id as the stable event id in that case.
  return typeof eventId !== "string"
    || eventId === message.id
    || message.rolls.some((roll: AnyRecord) => roll?.id === eventId || roll?._id === eventId);
}

async function stageAmmoPacket(packet: AmmoPacket, senderId?: unknown): Promise<boolean> {
  if (!enabled(SETTING.ammo) || !currentIsAuthority()) return false;
  if (!packet || packet.type !== "ammo-roll" || !packet.eventId || !packet.messageId || !packet.actorUuid || !packet.activityUuid || !packet.ammunitionId) return false;
  const actor = await fromUuidSafe(packet.actorUuid);
  const activity = await fromUuidSafe(packet.activityUuid);
  if (!actor || !activity || activity.actor?.id !== actor.id || !isMutableDocument(actor)) return false;
  const message = game()?.messages?.get?.(packet.messageId);
  if (!isNativeAttackMessage(message, actor, packet.eventId, packet.ammunitionId, activity)) return false;
  if (senderId === undefined ? !currentIsAuthority() : !isTrustedSender(senderId, actor)) return false;
  const native = nativeAmmoObservations.get(packet.messageId);
  if (!native || native.actorUuid !== packet.actorUuid || native.activityUuid !== packet.activityUuid
    || native.ammunitionId !== packet.ammunitionId) {
    queueAmmoStage(packet, senderId);
    return false;
  }
  const ammo = actor.items?.get?.(packet.ammunitionId);
  const capturedQuantity = packet.beforeQuantity;
  const capturedSnapshot = packet.snapshot;
  const hasCapture: boolean = Number.isInteger(capturedQuantity) && (capturedQuantity as number) >= 1 && capturedSnapshot !== undefined;
  if (!hasCapture) return false;
  if (capturedQuantity !== native.beforeQuantity || !sameAmmoSnapshotFacts(capturedSnapshot as AmmoSnapshot, native.snapshot)) return false;
  const currentSnapshot = ammo ? ammoSnapshot(ammo) : null;
  // The active GM observes the native attack ChatMessage before dnd5e applies
  // its ammunition update. Client beforeQuantity/snapshot values are only
  // accepted when they exactly match that GM-side observation.
  let snapshot = currentSnapshot;
  if (ammo) {
    const currentQuantity = Number(ammo.system?.quantity);
    if (currentQuantity !== native.beforeQuantity && currentQuantity !== native.beforeQuantity - 1) return false;
    if (!currentSnapshot || !sameAmmoSnapshotFacts(native.snapshot, currentSnapshot, true)) return false;
  } else {
    if (!native.destroy) return false;
    const deletedSnapshot = extractAmmoSnapshotFromChatFlags(message?.flags);
    if (deletedSnapshot && !sameAmmoSnapshotFacts(native.snapshot, deletedSnapshot)) return false;
    snapshot = native.snapshot;
  }
  if (!snapshot) return false;
  const tag = (snapshot?.flags?.[MODULE_ID] as AnyRecord | undefined)?.[FLAG.ammo];
  const tier = parseAmmoTier(tag?.tier);
  const key = shotKey(packet);
  const beforeQuantity = native.beforeQuantity;
  if (tier === null || !tag?.key || !key || !snapshot || !Number.isInteger(beforeQuantity) || beforeQuantity < 1) return false;
  const prior = pendingAmmo.get(key);
  if (prior) {
    return prior.packet.messageId === packet.messageId && prior.packet.activityUuid === packet.activityUuid
      && prior.packet.ammunitionId === packet.ammunitionId;
  }
  pendingAmmo.set(key, {
    packet: structuredClone(packet),
    senderId: typeof senderId === "string" ? senderId : undefined,
    snapshot: structuredClone(native.snapshot),
    beforeTier: tier,
    expectedQuantity: Math.max(0, native.beforeQuantity - 1),
    destroy: native.destroy,
    postSeen: false,
  });
  const queued = pendingAmmoCommits.get(key);
  if (queued) {
    pendingAmmoCommits.delete(key);
    // Keep the staged transaction open until the out-of-order post hook has
    // finished validation and persistence. This is important in v14: both
    // hooks are async, so returning before this commit settles can leave a
    // live attack consumed but unrecorded after the page has moved on.
    await commitAmmoPacket(queued.packet, queued.senderId);
  }
  return true;
}

async function commitAmmoPacket(packet: AmmoPacket, senderId?: unknown): Promise<boolean> {
  if (!enabled(SETTING.ammo) || !currentIsAuthority()) return false;
  if (!packet || packet.type !== "ammo-commit") return false;
  const key = shotKey(packet);
  const pending = key ? pendingAmmo.get(key) : undefined;
  if (!pending) {
    queueAmmoCommit(packet, senderId);
    return false;
  }
  if (pending.packet.messageId !== packet.messageId) return false;
  if (pending.senderId !== undefined ? pending.senderId !== senderId : senderId !== undefined) return false;
  const actor = await fromUuidSafe(pending.packet.actorUuid);
  const activity = await fromUuidSafe(pending.packet.activityUuid);
  const message = game()?.messages?.get?.(pending.packet.messageId);
  if (!actor || !activity || activity.actor?.id !== actor.id || !isMutableDocument(actor)
    || !isNativeAttackMessage(message, actor, pending.packet.eventId, pending.packet.ammunitionId, activity)) return false;
  pending.postSeen = true;
  if (pending.destroy) {
    if (!actor.items?.get?.(pending.packet.ammunitionId)) await processDeletedAmmoFallback(message);
    return false;
  }
  const ammo = actor.items?.get?.(pending.packet.ammunitionId);
  if (!ammo || Number(ammo.system?.quantity) !== pending.expectedQuantity) return false;
  const currentAmmoLedger = actorAmmoLedger(actor);
  const currentTransactionLedger = actorLedger(actor);
  if (!currentAmmoLedger || !currentTransactionLedger) return false;
  const shot = createAmmoShot(pending.packet.eventId, actor.id, pending.packet.ammunitionId, pending.beforeTier, pending.snapshot, Date.now());
  if (!shot) return false;
  const result = recordAmmoShot(currentAmmoLedger, currentTransactionLedger, shot);
  if (!result.applied) {
    pendingAmmo.delete(key!);
    return false;
  }
  await writeActorLedgers(actor, result.transactionLedger, result.ammoLedger);
  pendingAmmo.delete(key!);
  nativeAmmoObservations.delete(pending.packet.messageId);
  return true;
}

async function processDeletedAmmoFallback(message: AnyRecord): Promise<void> {
  if (!enabled(SETTING.ammo) || !currentIsAuthority()) return;
  const actor = message.getAssociatedActor?.() ?? message.actor;
  if (!actor || !isMutableDocument(actor) || message.speaker?.actor !== actor.id) return;
  const nativeAmmunitionId = message.flags?.["dnd5e"]?.roll?.ammunition;
  const snapshot = extractAmmoSnapshotFromChatFlags(message?.flags);
  const activity = associatedAttackActivity(message, actor);
  const native = nativeAmmoObservations.get(message.id);
  if (!snapshot || typeof nativeAmmunitionId !== "string" || !activity
    || !isNativeAttackMessage(message, actor, undefined, nativeAmmunitionId, activity)
    || !native || native.actorUuid !== stableDocumentUuid(actor)
    || native.activityUuid !== stableDocumentUuid(activity) || native.ammunitionId !== nativeAmmunitionId
    || !native.destroy || !sameAmmoSnapshotFacts(native.snapshot, snapshot)) return;
  const matching = Array.from(pendingAmmo.entries()).filter(([, pending]) => pending.postSeen
    && pending.destroy
    && pending.packet.actorUuid === stableDocumentUuid(actor)
    && pending.packet.messageId === message.id
    && pending.packet.ammunitionId === nativeAmmunitionId
    && pending.packet.activityUuid === stableDocumentUuid(activity)
    && sameAmmoSnapshotFacts(pending.snapshot, snapshot));
  if (matching.length !== 1) return;
  const [key, pending] = matching[0]!;
  const currentAmmoLedger = actorAmmoLedger(actor);
  const currentTransactionLedger = actorLedger(actor);
  if (!currentAmmoLedger || !currentTransactionLedger) return;
  const shot = createAmmoShot(pending.packet.eventId, actor.id, pending.packet.ammunitionId, pending.beforeTier, snapshot, Date.now());
  if (!shot) return;
  const result = recordAmmoShot(currentAmmoLedger, currentTransactionLedger, shot);
  if (result.applied) await writeActorLedgers(actor, result.transactionLedger, result.ammoLedger);
  pendingAmmo.delete(key);
  nativeAmmoObservations.delete(message.id);
}

function createAmmoPacket(rolls: AnyRecord[], data: AnyRecord): AmmoPacket | null {
  const activity = data?.subject;
  const actor = activity?.actor;
  const ammoId = data?.ammoUpdate?.id;
  const messageId = rolls?.[0]?.parent?.id ?? rolls?.[0]?.parent?._id;
  // In the live v14/dnd5e path Roll.id is undefined. ChatMessage.id is
  // available in both pre/post attack hooks and is unique for this attack.
  const eventId = rolls?.[0]?.id ?? rolls?.[0]?._id ?? messageId;
  const actorUuid = stableDocumentUuid(actor);
  const activityUuid = stableDocumentUuid(activity);
  if (typeof ammoId !== "string" || typeof eventId !== "string" || typeof messageId !== "string" || !actorUuid || !activityUuid) return null;
  const ammo = actor?.items?.get?.(ammoId);
  const snapshot = ammo ? ammoSnapshot(ammo) : null;
  const beforeQuantity = Number(ammo?.system?.quantity);
  return {
    type: "ammo-roll",
    eventId,
    messageId,
    actorUuid,
    activityUuid,
    ammunitionId: ammoId,
    ...(snapshot && Number.isInteger(beforeQuantity) && beforeQuantity >= 1
      ? { beforeQuantity, snapshot }
      : {})
  };
}

function d20Terms(roll: AnyRecord): Array<{ faces: number; results: Array<{ result: number; active?: boolean; discarded?: boolean }> }> {
  if (!Array.isArray(roll?.terms)) return [];
  return roll.terms
    .filter((term: AnyRecord) => term?.faces === 20 && Array.isArray(term.results))
    .map((term: AnyRecord) => ({ faces: term.faces, results: term.results.map((result: AnyRecord) => ({
      result: result.result,
      active: result.active,
      discarded: result.discarded
    })) }));
}

function criticalTargetRollIndex(config: AnyRecord, rolls: AnyRecord[]): number | null {
  if (!Array.isArray(config?.rolls) || config.rolls.length !== rolls.length || rolls.length === 0) return null;
  const activity = config.subject;
  if (activity?.type !== "attack") return null;
  const attackClass = classifyAttack(activity.getActionType?.() ?? activity.actionType);
  if (!attackClass) return null;

  // Attack-roll spells use the first declared damage part. Save-only spells do
  // not have an attack action type and therefore never enter this branch.
  if (attackClass === "spell") return 0;

  // Weapon Activities explicitly mark exactly one native base-damage roll.
  // Refuse ambiguous/custom layouts instead of guessing which rider is base.
  if (activity.item?.type !== "weapon") return null;
  const baseIndexes = config.rolls
    .map((roll: AnyRecord, index: number) => roll?.base === true ? index : -1)
    .filter((index: number) => index >= 0);
  return baseIndexes.length === 1 ? baseIndexes[0] ?? null : null;
}

/**
 * Mutates one unevaluated dnd5e DamageRoll after native critical expansion.
 * All critical dice remain real dice; only the first die of the selected base
 * damage roll gains the module's critmaxN modifier so its raw face is still
 * visible to animation while the value counted in the total is the die maximum.
 */
export function applyCriticalConfiguredRolls(
  rolls: AnyRecord[],
  config: AnyRecord,
  message: AnyRecord = {}
): boolean {
  if (!enabled(SETTING.naturalTwenty) || !criticalMaxDependenciesSupported() || !Array.isArray(rolls) || !config?.subject) return false;
  const targetIndex = criticalTargetRollIndex(config, rolls);
  if (targetIndex === null) return false;
  const roll = rolls[targetIndex];
  if (!roll || roll._evaluated === true || roll.isCritical !== true || !Array.isArray(roll.terms)
    || typeof roll.resetFormula !== "function") return false;

  const terms = runtime().foundry?.dice?.terms;
  const DieClass = terms?.Die;
  if (typeof DieClass !== "function") return false;
  if (!installCriticalMaxModifier(DieClass) || !installCriticalMaxDieIntegration(DieClass, criticalMaxLocalize)) return false;
  const firstDieIndex = roll.terms.findIndex((term: AnyRecord) => term instanceof DieClass);
  if (firstDieIndex < 0) return false;
  const original = roll.terms[firstDieIndex];
  if (!original || original._evaluated === true || original.results?.length) return false;
  const split = splitConfiguredCriticalFirstDiceTerm(original);
  if (!split) return false;

  let configured: AnyRecord;
  try {
    // Preserve the native critical DiceTerm and all of its modifiers. The
    // critmax handler will target results[0] after the native roll has been
    // evaluated, so special modifiers such as explode/repeat still inspect
    // each raw result independently instead of being duplicated across a
    // synthetic "first" and "remaining" term.
    configured = new DieClass({
      number: original.number,
      faces: original.faces,
      method: original.method,
      modifiers: [...split.first.modifiers],
      options: { ...(split.first.options ?? {}) }
    });
  } catch {
    return false;
  }

  roll.terms.splice(firstDieIndex, 1, configured);
  try {
    roll.resetFormula();
  } catch {
    roll.terms.splice(firstDieIndex, 1, original);
    try { roll.resetFormula(); } catch { /* The original roll remains authoritative. */ }
    return false;
  }
  message.data ??= {};
  message.data.flags ??= {};
  message.data.flags[MODULE_ID] ??= {};
  message.data.flags[MODULE_ID].criticalFirstDieApplied = true;
  return true;
}

async function postNaturalCard(request: NaturalRequest): Promise<void> {
  if (!currentIsAuthority()) return;
  const id = transactionId(request.kind, request.actorUuid, request.messageId);
  if (id && pendingTransactions.has(id)) return;
  if (id) pendingTransactions.add(id);
  try {
  const actor = await fromUuidSafe(request.actorUuid);
  if (!id || !actor || !isMutableDocument(actor)) return;
  const currentLedger = actorLedger(actor);
  if (!currentLedger) return;
  const recorded = recordTransaction(currentLedger, id, request.kind, Date.now(), MAX_LEDGER_ENTRIES);
  if (!recorded.applied) return;
  if (typeof actor.setFlag !== "function") return;
  await actor.setFlag(MODULE_ID, FLAG.ledger, structuredClone(recorded.ledger));
  const consequence = request.consequence;
  const resultLabel = consequence
    ? game()?.i18n?.localize?.(`FVTT_HOUSE_RULES.Nat1.Result.${consequence}`) ?? consequence
    : "";
  const needsTarget = consequence === "counter" || consequence === "ally";
  const target = needsTarget
    ? `<select data-house-rules-target><option value="">${game()?.i18n?.localize?.("FVTT_HOUSE_RULES.Nat1.Target") ?? "Choose a target"}</option></select>`
    : "";
  const content = request.kind === "nat1"
    ? `<section class="fvtt-house-rules-card" data-house-rules-card="nat1"><h3>${game()?.i18n?.localize?.("FVTT_HOUSE_RULES.Nat1.Title") ?? "Natural 1"}</h3><p>${game()?.i18n?.localize?.("FVTT_HOUSE_RULES.Nat1.Pending") ?? "GM confirmation required; no consequence has been applied."}</p><p><strong>${resultLabel}</strong></p><div class="fvtt-house-rules-actions">${target}<button type="button" data-house-rules-action="${consequence ?? "dismiss"}">${game()?.i18n?.localize?.("FVTT_HOUSE_RULES.Nat1.Confirm") ?? "Preview / Apply"}</button><button type="button" data-house-rules-action="dismiss">${game()?.i18n?.localize?.("FVTT_HOUSE_RULES.Dismiss") ?? "Dismiss"}</button></div></section>`
    : `<section class="fvtt-house-rules-card" data-house-rules-card="nat20"><h3>${game()?.i18n?.localize?.("FVTT_HOUSE_RULES.Nat20.Title") ?? "Natural 20"}</h3><p>${game()?.i18n?.localize?.("FVTT_HOUSE_RULES.Nat20.Pending") ?? "Base-weapon transform is available only through the guarded GM API."}</p></section>`;
  await runtime().ChatMessage?.create?.({
    content,
    whisper: [game()?.user?.id].filter(Boolean),
    flags: { [MODULE_ID]: { [FLAG.naturalRequest]: request } }
  });
  } finally {
    if (id) pendingTransactions.delete(id);
  }
}

async function processAttackChat(message: AnyRecord): Promise<void> {
  if (!currentIsAuthority() || (!enabled(SETTING.naturalOne) && !enabled(SETTING.naturalTwenty))) return;
  if (message?.flags?.dnd5e?.roll?.type !== "attack" || !message?.id) return;
  const activity = message.getAssociatedActivity?.();
  const actor = activity?.actor ?? message.getAssociatedActor?.();
  const actorUuid = stableDocumentUuid(actor);
  const activityUuid = stableDocumentUuid(activity);
  const actionType = activity?.getActionType?.() ?? activity?.actionType;
  const attackClass = classifyAttack(actionType);
  const terms = d20Terms(message.rolls?.[0]);
  if (!actorUuid || !activityUuid || !attackClass || !terms.length) return;
  if (enabled(SETTING.naturalOne) && retainedNatural(terms, 1)) {
    const tableUuid = setting<string>(SETTING.consequenceOtherTable) ?? "";
    const table = tableUuid ? await fromUuidSafe(tableUuid) : null;
    const targets = message.getFlag?.("dnd5e", "targets");
    const targetActorUuids = Array.isArray(targets)
      ? targets.map((target: AnyRecord) => target?.uuid).filter((uuid: unknown): uuid is string => typeof uuid === "string")
      : [];
    const draft: NaturalRequest = { kind: "nat1", actorUuid, activityUuid, messageId: message.id, attackClass, targetActorUuids };
    const pool = naturalOnePool(attackClass, activity?.item?.type, table?.documentName === "RollTable");
    const available: NaturalOneConsequence[] = [];
    for (const candidate of pool) {
      if (candidate === "counter" && !(await counterCandidates(draft)).length) continue;
      if (candidate === "ally" && !(await allyCandidates(draft)).length) continue;
      available.push(candidate);
    }
    const consequence = chooseNaturalOneConsequence(available, Math.random());
    if (consequence) {
      await postNaturalCard({ kind: "nat1", actorUuid, activityUuid, messageId: message.id, attackClass, consequence, targetActorUuids });
    }
  }
  if (enabled(SETTING.naturalTwenty) && retainedNatural(terms, 20)) {
    await postNaturalCard({ kind: "nat20", actorUuid, activityUuid, messageId: message.id, attackClass });
  }
}

async function processStealthDashChat(message: AnyRecord): Promise<void> {
  if (!currentIsAuthority() || !enabled(SETTING.stealth)) return;
  const activity = message?.getAssociatedActivity?.();
  const actor = activity?.actor ?? message?.getAssociatedActor?.();
  if (!actor || !explicitFlag(activity?.item, FLAG.stealth)?.dash) return;
  const state = explicitFlag(actor, FLAG.stealth) as StealthState | null;
  if (state?.enabled) await setStealth(actor, endStealthForDash(state));
}

async function counterCandidates(request: NaturalRequest): Promise<Array<{ uuid: string; label: string }>> {
  const targets = (await Promise.all((request.targetActorUuids ?? []).map((uuid) => fromUuidSafe(uuid)))).filter(Boolean) as AnyRecord[];
  const candidates: Array<{ uuid: string; label: string }> = [];
  for (const actor of targets) {
    for (const item of Array.from(actor?.items ?? []) as AnyRecord[]) {
      for (const activity of Array.from(item?.system?.activities ?? []) as AnyRecord[]) {
        const actionType = activity?.getActionType?.() ?? activity?.actionType;
        const uuid = stableDocumentUuid(activity);
        if (uuid && activity?.type === "attack" && classifyAttack(actionType) === "melee") {
          candidates.push({ uuid, label: `${actor.name ?? "Target"}: ${item.name ?? "Item"} / ${activity.name ?? "Attack"}` });
        }
      }
    }
  }
  return candidates.sort((left, right) => left.label.localeCompare(right.label) || left.uuid.localeCompare(right.uuid));
}

function adjacentTokens(left: AnyRecord, right: AnyRecord): boolean {
  const canvas = runtime().canvas;
  const distance = canvas?.grid?.measurePath?.([left.center, right.center])?.distance;
  const gridDistance = canvas?.scene?.grid?.distance;
  const leftSize = Math.max(left.document?.width ?? 1, left.document?.height ?? 1);
  const rightSize = Math.max(right.document?.width ?? 1, right.document?.height ?? 1);
  return typeof distance === "number" && typeof gridDistance === "number"
    && distance <= gridDistance * ((leftSize + rightSize) / 2) + 0.001;
}

async function allyCandidates(request: NaturalRequest): Promise<Array<{ uuid: string; label: string }>> {
  const actor = await fromUuidSafe(request.actorUuid);
  const sourceTokens = actor?.getActiveTokens?.() ?? [];
  if (!actor || !sourceTokens.length) return [];
  const disposition = sourceTokens[0]?.document?.disposition;
  const candidates = new Map<string, string>();
  for (const token of Array.from(runtime().canvas?.tokens?.placeables ?? []) as AnyRecord[]) {
    const target = token?.actor;
    const uuid = stableDocumentUuid(target);
    if (!uuid || target.id === actor.id || token.document?.disposition !== disposition) continue;
    if (request.attackClass === "melee" && !sourceTokens.some((source: AnyRecord) => adjacentTokens(source, token))) continue;
    candidates.set(uuid, `${target.name ?? token.name ?? "Ally"}`);
  }
  return Array.from(candidates, ([uuid, label]) => ({ uuid, label }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.uuid.localeCompare(right.uuid));
}

function installNaturalCardListeners(): void {
  const hooks = runtime().Hooks;
  hooks?.on?.("dnd5e.renderChatMessage", (message: AnyRecord, html: HTMLElement | { 0?: HTMLElement }) => {
    if (!game()?.user?.isGM) return;
    const request = message?.getFlag?.(MODULE_ID, FLAG.naturalRequest) as NaturalRequest | undefined;
    if (!request || request.kind !== "nat1") return;
    const root = html instanceof HTMLElement ? html : (html as AnyRecord)?.[0] as HTMLElement | undefined;
    const card = root?.querySelector?.("[data-house-rules-card='nat1']") as HTMLElement | null;
    if (!card) return;
    const select = card.querySelector("select[data-house-rules-target]") as HTMLSelectElement | null;
    if (select && select.options.length === 1) void (async () => {
      const candidates = request.consequence === "counter" ? await counterCandidates(request) : await allyCandidates(request);
      for (const candidate of candidates) select.add(new Option(candidate.label, candidate.uuid));
    })();
    for (const button of Array.from(card.querySelectorAll<HTMLButtonElement>("button[data-house-rules-action]"))) {
      button.addEventListener("click", async () => {
        const action = button.dataset.houseRulesAction;
        let choice: AnyRecord = { kind: action };
        if (action !== "dismiss" && action !== request.consequence) return;
        if (action === "weapon") {
          const activity = await fromUuidSafe(request.activityUuid);
          const weaponUuid = stableDocumentUuid(activity?.item);
          if (!weaponUuid) return notification("Nat1.InvalidTarget", "warn");
          choice = { kind: "weapon", weaponUuid };
        }
        if (action === "counter") {
          if (!select?.value) return notification("Nat1.TargetRequired", "warn");
          choice = { kind: "counter", targetActivityUuid: select.value };
        }
        if (action === "ally") {
          if (!select?.value) return notification("Nat1.TargetRequired", "warn");
          choice = { kind: "ally", targetActorUuid: select.value };
        }
        if (!["dismiss", "weapon", "counter", "ally", "self", "other"].includes(action ?? "")) return;
        button.disabled = true;
        const applied = await confirmNaturalOne(request, choice);
        if (!applied) {
          button.disabled = false;
          notification("Nat1.NotApplied", "warn");
        }
      }, { once: false });
    }
  });
}

function appendPenalty(bonus: unknown, penalty: number): string | null {
  const original = typeof bonus === "string" ? bonus.trim() : "";
  if (original.length > 200 || /[<>;]/.test(original)) return null;
  return original ? `${original} - ${penalty}` : `- ${penalty}`;
}

function applyPenaltyToActivities(source: AnyRecord, penalty: number): AnyRecord | null {
  if (!source || typeof source !== "object" || !Number.isInteger(penalty) || penalty < 0) return null;
  const activities = structuredClone(source);
  for (const activity of Object.values(activities) as AnyRecord[]) {
    if (activity?.type !== "attack" || !activity.attack || !activity.damage || !Array.isArray(activity.damage.parts)) return null;
    const attackBonus = appendPenalty(activity.attack.bonus, penalty);
    if (attackBonus === null) return null;
    activity.attack.bonus = attackBonus;
    for (const part of activity.damage.parts) {
      const damageBonus = appendPenalty(part?.bonus, penalty);
      if (damageBonus === null) return null;
      part.bonus = damageBonus;
    }
  }
  return activities;
}

async function setWeaponPenalty(item: AnyRecord, targetPenalty: number): Promise<boolean> {
  if (!currentIsAuthority() || !isMutableDocument(item) || item.type !== "weapon") return false;
  const state = explicitFlag(item, FLAG.weaponPenalty);
  const current = state?.penalty ?? 0;
  const next = targetPenalty;
  if (!Number.isInteger(current) || current < 0 || !Number.isInteger(next) || next < 0) return false;
  const currentActivities = item.toObject?.()?.system?.activities;
  if (!currentActivities || typeof currentActivities !== "object") return false;
  const base = state?.baseActivities ?? currentActivities;
  if (state?.appliedActivities && JSON.stringify(currentActivities) !== JSON.stringify(state.appliedActivities)) return false;
  const applied = next === 0 ? structuredClone(base) : applyPenaltyToActivities(base, next);
  if (!applied) return false;
  await item.update({ "system.activities": applied });
  if (next === 0) await item.unsetFlag(MODULE_ID, FLAG.weaponPenalty);
  else await item.setFlag(MODULE_ID, FLAG.weaponPenalty, { schema: 1, penalty: next, baseActivities: base, appliedActivities: applied });
  return true;
}

export async function configurePotion(item: AnyRecord, mode: "preview" | "apply" | "restore"): Promise<AnyRecord | null> {
  if (!currentIsAuthority() || !enabled(SETTING.potion)) return null;
  const tag = explicitFlag(item, FLAG.potion);
  if (!tag?.healing || item?.type !== "consumable" || item?.pack || item?.inCompendium) return null;
  const activities = buildPotionActivities(tag.dice as HealingDice, {
    quick: game()?.i18n?.localize?.("FVTT_HOUSE_RULES.Potion.Quick") ?? "Quick Drink",
    max: game()?.i18n?.localize?.("FVTT_HOUSE_RULES.Potion.Max") ?? "Careful Drink",
    feed: game()?.i18n?.localize?.("FVTT_HOUSE_RULES.Potion.Feed") ?? "Administer Potion"
  });
  if (!activities) return null;
  if (mode === "preview") return { activities };
  if (!isMutableDocument(item)) return null;
  if (mode === "restore") {
    const snapshot = explicitFlag(item, FLAG.potionSnapshot);
    if (!snapshot || snapshot.schema !== 1) return null;
    await item.update({ "system.activities": structuredClone(snapshot.activities) });
    await item.unsetFlag(MODULE_ID, FLAG.potionSnapshot);
    return { restored: true };
  }
  if (!explicitFlag(item, FLAG.potionSnapshot)) {
    await item.setFlag(MODULE_ID, FLAG.potionSnapshot, potionSnapshot(item.toObject().system.activities));
  }
  await item.update({ "system.activities": activities });
  return { applied: true, activities };
}

export async function gambleHitPoints(actor: AnyRecord, classItem: AnyRecord, level: number): Promise<AnyRecord | null> {
  if (!currentIsAuthority() || !enabled(SETTING.hpGamble) || !isMutableDocument(actor)) return null;
  if (classItem?.type !== "class" || classItem.actor?.id !== actor.id || !Number.isInteger(level)) return null;
  const lockId = hpGambleLockId(actor.id, classItem.id, level);
  if (!lockId || explicitFlag(actor, FLAG.hpGamble)?.[lockId]) return null;
  if (level === 1) return { reason: "level-one" };
  const advancement = classItem.advancement?.byType?.HitPoints?.[0];
  if (!advancement || typeof actor.rollClassHitPoints !== "function" || typeof advancement.apply !== "function") return null;
  const first = await actor.rollClassHitPoints(classItem);
  if (!Number.isInteger(first?.total) || first.total < 1) return null;
  const second = first.total === 1 ? await actor.rollClassHitPoints(classItem) : undefined;
  const plan = resolveHitPointGamble({ actorId: actor.id, classId: classItem.id, level, firstRoll: first.total, reroll: second?.total });
  if (plan.reason !== "accepted" || plan.accepted === null) return null;
  await advancement.apply(level, { [level]: plan.accepted });
  const locks = structuredClone(explicitFlag(actor, FLAG.hpGamble) ?? {});
  locks[lockId] = { schema: 1, accepted: true, rerolled: plan.rerolled, at: Date.now() };
  await actor.setFlag(MODULE_ID, FLAG.hpGamble, locks);
  return { lockId, accepted: plan.accepted, rerolled: plan.rerolled };
}

export async function recoverAmmo(actor: AnyRecord, shotId: string): Promise<boolean> {
  if (!currentIsAuthority() || !enabled(SETTING.ammo) || !isMutableDocument(actor) || !shotId) return false;
  const currentAmmoLedger = actorAmmoLedger(actor);
  const currentTransactionLedger = actorLedger(actor);
  if (!currentAmmoLedger || !currentTransactionLedger) return false;
  const outcome = confirmAmmoRecovery(currentAmmoLedger, shotId);
  const shot = outcome.shot;
  if (!outcome.applied || !shot) return false;
  const recoveryId = transactionId("ammo-recovery", actor.id, shotId);
  if (!recoveryId) return false;
  const ledger = recordTransaction(currentTransactionLedger, recoveryId, "ammo-recovery", Date.now());
  if (!ledger.applied) return false;
  const tag = (shot.snapshot.flags?.[MODULE_ID] as AnyRecord | undefined)?.[FLAG.ammo];
  if (!tag?.key || parseAmmoTier(tag.tier) === null) return false;
  const tier = shot.recoveredTier;
  const matching = (Array.from(actor.items ?? []) as AnyRecord[]).find((item) => {
    const candidate = explicitFlag(item, FLAG.ammo);
    return candidate?.key === tag.key && candidate?.tier === tier && item.type === shot.snapshot.type;
  });
  if (matching) await matching.update({ "system.quantity": (matching.system?.quantity ?? 0) + 1 });
  else {
    const source = structuredClone(shot.snapshot) as AmmoSnapshot;
    source.system.quantity = 1;
    const sourceFlags = source.flags as Record<string, AnyRecord>;
    sourceFlags[MODULE_ID] ??= {};
    sourceFlags[MODULE_ID][FLAG.ammo] = { ...tag, tier };
    await actor.createEmbeddedDocuments?.("Item", [source]);
  }
  await writeActorLedgers(actor, ledger.ledger, outcome.ammoLedger);
  return true;
}

async function applyConsequenceDamage(sourceActivity: AnyRecord, targetActor: AnyRecord, request: NaturalRequest): Promise<boolean> {
  const multiplier = setting<number>(SETTING.consequenceMultiplier);
  if (![0.5, 1].includes(multiplier ?? -1) || typeof sourceActivity?.rollDamage !== "function"
    || typeof targetActor?.applyDamage !== "function") return false;
  const rolls = await sourceActivity.rollDamage(
    { isCritical: false, hookNames: ["houseRulesConsequence"] },
    { configure: false },
    { create: true, data: { flags: { [MODULE_ID]: {
      consequence: true,
      requestMessageId: request.messageId,
      nonActivity: true,
      reactionsSuppressed: true
    } } } }
  );
  if (!Array.isArray(rolls) || !rolls.length) return false;
  const damages = rolls.map((roll: AnyRecord) => ({
    value: Math.max(0, Number(roll?.total) || 0),
    type: roll?.options?.type,
    properties: new Set(roll?.options?.properties ?? [])
  }));
  if (!damages.length || damages.some((damage: AnyRecord) => !damage.type)) return false;
  const result = await targetActor.applyDamage(damages, {
    multiplier,
    originatingMessage: rolls[0]?.parent,
    isDelta: true
  });
  return result !== false;
}

export async function confirmNaturalOne(request: NaturalRequest, choice: AnyRecord): Promise<boolean> {
  if (!currentIsAuthority() || !enabled(SETTING.naturalOne) || request?.kind !== "nat1") return false;
  const actor = await fromUuidSafe(request.actorUuid);
  const activity = await fromUuidSafe(request.activityUuid);
  if (!actor || !activity || activity.actor?.id !== actor.id || !classifyAttack(activity.getActionType?.() ?? activity.actionType)) return false;
  const confirmationId = transactionId("nat1-confirm", request.actorUuid, request.messageId);
  if (confirmationId && pendingTransactions.has(confirmationId)) return false;
  if (confirmationId) pendingTransactions.add(confirmationId);
  try {
  const currentLedger = actorLedger(actor);
  if (!confirmationId || !currentLedger || isTransactionProcessed(currentLedger, confirmationId)) return false;
  if (choice?.kind !== "dismiss" && choice?.kind !== request.consequence) return false;
  let applied = false;
  if (choice?.kind === "dismiss") applied = true;
  if (choice?.kind === "weapon") {
    const item = await fromUuidSafe(choice.weaponUuid);
    if (!item || item.actor?.id !== actor.id || item.type !== "weapon") return false;
    const penalty = nextWeaponPenalty(explicitFlag(item, FLAG.weaponPenalty)?.penalty);
    applied = penalty === null ? false : await setWeaponPenalty(item, penalty);
  }
  else if (choice?.kind === "counter") {
    if (request.attackClass !== "melee") return false;
    const targetActivity = await fromUuidSafe(choice.targetActivityUuid);
    const actionType = targetActivity?.getActionType?.() ?? targetActivity?.actionType;
    const targetActorUuid = stableDocumentUuid(targetActivity?.actor);
    if (!targetActivity || classifyAttack(actionType) !== "melee" || targetActivity.type !== "attack"
      || !targetActorUuid || !request.targetActorUuids?.includes(targetActorUuid)) return false;
    applied = await applyConsequenceDamage(targetActivity, actor, request);
  }
  else if (choice?.kind === "ally") {
    const eligible = await allyCandidates(request);
    if (!eligible.some((candidate) => candidate.uuid === choice.targetActorUuid)) return false;
    const targetActor = await fromUuidSafe(choice.targetActorUuid);
    if (!targetActor) return false;
    applied = await applyConsequenceDamage(activity, targetActor, request);
  }
  else if (choice?.kind === "self") {
    applied = await applyConsequenceDamage(activity, actor, request);
  }
  else if (choice?.kind === "other") {
    const uuid = setting<string>(SETTING.consequenceOtherTable);
    const table = await fromUuidSafe(uuid ?? "");
    if (!table || table.documentName !== "RollTable" || typeof table.draw !== "function") return false;
    await table.draw({ displayChat: true });
    applied = true;
  }
  if (!applied) return false;
  const recorded = recordTransaction(currentLedger, confirmationId, "nat1-confirm", Date.now(), MAX_LEDGER_ENTRIES);
  if (!recorded.applied) return false;
  if (typeof actor.setFlag !== "function") return false;
  await actor.setFlag(MODULE_ID, FLAG.ledger, structuredClone(recorded.ledger));
  return true;
  } finally {
    if (confirmationId) pendingTransactions.delete(confirmationId);
  }
}

export async function repairWeapon(item: AnyRecord, amount = 1): Promise<boolean> {
  if (!currentIsAuthority() || !isMutableDocument(item) || item.type !== "weapon") return false;
  const next = repairedWeaponPenalty(explicitFlag(item, FLAG.weaponPenalty)?.penalty, amount);
  return next === null ? false : setWeaponPenalty(item, next);
}

export function previewNaturalTwenty(item: AnyRecord): string | null {
  if (!enabled(SETTING.naturalTwenty) || item?.type !== "weapon") return null;
  const base = item.system?.damage?.base;
  return transformNaturalTwentyBaseWeaponDamage({
    number: base?.number,
    denomination: base?.denomination,
    bonus: base?.bonus,
    isBaseWeaponDamage: true,
    hasAmbiguousSource: Boolean(base?.custom?.enabled)
  });
}

export async function setStealth(actor: AnyRecord, state: Partial<StealthState>): Promise<StealthState | null> {
  if (!currentIsAuthority() || !enabled(SETTING.stealth) || !isMutableDocument(actor)) return null;
  const prior = explicitFlag(actor, FLAG.stealth) ?? {};
  const next: StealthState = {
    enabled: Boolean(state.enabled ?? prior.enabled),
    expertise: Boolean(state.expertise ?? prior.expertise),
    rogueTotalLevel: Number(state.rogueTotalLevel ?? prior.rogueTotalLevel ?? 0),
    gmFullSpeedOverride: Boolean(state.gmFullSpeedOverride ?? prior.gmFullSpeedOverride),
    ignoreNextMovement: Boolean(state.ignoreNextMovement ?? prior.ignoreNextMovement),
    turnKey: typeof state.turnKey === "string" ? state.turnKey : prior.turnKey,
    movedFeet: Number(state.movedFeet ?? prior.movedFeet ?? 0)
  };
  if (!Number.isFinite(next.rogueTotalLevel) || !Number.isFinite(next.movedFeet) || next.rogueTotalLevel < 0 || next.movedFeet < 0) return null;
  await actor.setFlag(MODULE_ID, FLAG.stealth, next);
  return next;
}

function contextualLowAbility(actor: AnyRecord): void {
  if (!enabled(SETTING.lowAbility)) return;
  const abilities = lowAbilityReminder(actor?.system?.abilities, setting<number>(SETTING.lowAbilityThreshold) ?? 4);
  if (abilities.length) notification("LowAbility", "warn");
}

function activeCombatTurnFor(actor: AnyRecord, token: AnyRecord): string | null {
  const combat = game()?.combat;
  const combatant = combat?.combatant;
  if (!combat?.started || !combatant || combatant.tokenId !== token?.id || combatant.actorId !== actor?.id) return null;
  if (!Number.isInteger(combat.round) || !Number.isInteger(combat.turn)) return null;
  return `${combat.id}:${combat.round}:${combat.turn}`;
}

function movementFeet(from: { x: number; y: number }, token: { x: number; y: number }): number | null {
  const canvas = runtime().canvas;
  const measurePath = canvas?.grid?.measurePath;
  if (typeof measurePath !== "function") return null;
  const measured = measurePath.call(canvas.grid, [{ x: from.x, y: from.y }, { x: token.x, y: token.y }]);
  return typeof measured?.distance === "number" && Number.isFinite(measured.distance) && measured.distance >= 0 ? measured.distance : null;
}

async function processStealthMovement(token: AnyRecord, changes: AnyRecord = {}): Promise<void> {
  if (!currentIsAuthority() || !enabled(SETTING.stealth)) return;
  const actor = token?.actor;
  const origin = pendingTokenOrigins.get(token?.uuid);
  if (!actor || !origin) return;
  pendingTokenOrigins.delete(token.uuid);
  const state = explicitFlag(actor, FLAG.stealth) as StealthState | null;
  const turnKey = activeCombatTurnFor(actor, token);
  // Foundry v14 fires updateToken before the placeable has refreshed its
  // cached x/y. The new coordinates are in the hook's changes payload.
  const destination = {
    x: typeof changes.x === "number" ? changes.x : token.x,
    y: typeof changes.y === "number" ? changes.y : token.y
  };
  const feet = movementFeet(origin, destination);
  const speed = actor.system?.attributes?.movement?.walk;
  if (!state?.enabled || !turnKey || feet === null || typeof speed !== "number") return;
  const result = advanceStealthMovement(state, speed, feet, turnKey, setting<number>(SETTING.stealthRogueLevel) ?? 7);
  await actor.setFlag(MODULE_ID, FLAG.stealth, result.state);
  if (result.warning) notification("Stealth.SpeedWarning", "warn");
}

function installCoreHooks(): void {
  const hooks = runtime().Hooks;
  if (!hooks?.on) return;
  hooks.on("dnd5e.rollAttackV2", (rolls: AnyRecord[], data: AnyRecord) => {
    if (!enabled(SETTING.ammo)) return;
    const packet = createAmmoPacket(rolls, data);
    if (!packet) return;
    localAmmoPackets.set(packet.eventId, packet);
    if (currentIsAuthority()) void stageAmmoPacket(packet);
    else game()?.socket?.emit?.(`module.${MODULE_ID}`, packet);
  });
  hooks.on("dnd5e.postRollAttack", (rolls: AnyRecord[]) => {
    // v14/dnd5e 5.3.3 does not retain Roll.id in the serialized Roll, while
    // the hook still exposes the originating ChatMessage as Roll.parent.
    const eventId = rolls?.[0]?.id
      ?? rolls?.[0]?._id
      ?? rolls?.[0]?.parent?.id
      ?? rolls?.[0]?.parent?._id;
    const packet = typeof eventId === "string" ? localAmmoPackets.get(eventId) : undefined;
    if (!packet) return;
    localAmmoPackets.delete(eventId);
    const commit = { ...packet, type: "ammo-commit" as const };
    if (currentIsAuthority()) void commitAmmoPacket(commit);
    else game()?.socket?.emit?.(`module.${MODULE_ID}`, commit);
  });
  hooks.on("dnd5e.postDamageRollConfiguration", (rolls: AnyRecord[], config: AnyRecord, _dialog: AnyRecord, message: AnyRecord) => {
    applyCriticalConfiguredRolls(rolls, config, message);
  });
  hooks.on("createChatMessage", (message: AnyRecord) => {
    captureNativeAmmoMessage(message);
    void processDeletedAmmoFallback(message);
    void processAttackChat(message);
    void processStealthDashChat(message);
  });
  hooks.on("updateChatMessage", (message: AnyRecord) => void processDeletedAmmoFallback(message));
  hooks.on("controlToken", (token: AnyRecord, controlled: boolean) => {
    if (controlled) contextualLowAbility(token?.actor);
  });
  hooks.on("deleteCombat", (combat: AnyRecord) => {
    // Recovery remains GM-confirmed through the API/cards; deleting combat never restores ammunition itself.
    if (currentIsAuthority() && enabled(SETTING.ammo)) notification("Ammo.RecoveryReady", "info");
  });
  hooks.on("preUpdateToken", (token: AnyRecord, changes: AnyRecord) => {
    if ((typeof changes?.x === "number" || typeof changes?.y === "number") && token?.uuid) {
      pendingTokenOrigins.set(token.uuid, { x: token.x, y: token.y });
    }
  });
  hooks.on("updateToken", (token: AnyRecord, changes: AnyRecord) => void processStealthMovement(token, changes));
}

function installSocket(): void {
  game()?.socket?.on?.(`module.${MODULE_ID}`, (packet: AmmoPacket, senderId: string) => {
    if (typeof senderId !== "string") return;
    if (packet?.type === "ammo-roll") void stageAmmoPacket(packet, senderId);
    else if (packet?.type === "ammo-commit") void commitAmmoPacket(packet, senderId);
  });
}

export function installHouseRulesRuntime(): void {
  if (!lockedRuntime()) {
    notification("UnsupportedRuntime", "error");
    return;
  }
  installSocket();
  const terms = runtime().foundry?.dice?.terms;
  const criticalMaxReady = typeof terms?.Die === "function"
    && installCriticalMaxDieIntegration(terms.Die, criticalMaxLocalize);
  const midi = inspectMidiAdapter(game()?.modules);
  if (!criticalMaxReady) notification("CriticalMax.Unavailable", "error");
  else if (!midi.supported) notification("Midi.Unsupported", "warn");
  else if (midi.enabled) notification("Midi.ExactVersionActive", "info");
  installCoreHooks();
  installNaturalCardListeners();
}

export function installHouseRulesApi(): void {
  const api = {
    runtime: { locked: lockedRuntime, authority: currentIsAuthority },
    setup: {
      features: () => Object.fromEntries([
        SETTING.potion, SETTING.hpGamble, SETTING.lowAbility, SETTING.ammo, SETTING.stealth, SETTING.naturalOne, SETTING.naturalTwenty
      ].map((key) => [key, setting<boolean>(key) === true])),
      setFeature: async (key: string, value: boolean) => {
        const keys = new Set<string>([SETTING.potion, SETTING.hpGamble, SETTING.lowAbility, SETTING.ammo, SETTING.stealth, SETTING.naturalOne, SETTING.naturalTwenty]);
        if (!currentIsAuthority() || !keys.has(key) || typeof value !== "boolean") return false;
        await game()?.settings?.set?.(MODULE_ID, key, value);
        return true;
      }
    },
    potion: { configure: configurePotion },
    hitPoints: { gamble: gambleHitPoints },
    ammo: { recover: recoverAmmo },
    naturalOne: { confirm: confirmNaturalOne, repairWeapon },
    naturalTwenty: { previewBaseWeapon: previewNaturalTwenty },
    stealth: {
      set: setStealth,
      dash: async (actor: AnyRecord) => {
        const state = explicitFlag(actor, FLAG.stealth) as StealthState | null;
        return state ? setStealth(actor, endStealthForDash(state)) : null;
      },
      nonCombatSuggestion: (actor: AnyRecord, speed: number) => {
        const state = explicitFlag(actor, FLAG.stealth) as StealthState | null;
        return state ? nonCombatStealthSuggestion(speed, state, setting<number>(SETTING.stealthRogueLevel) ?? 7) : null;
      },
      previewMove: (state: StealthState, baseSpeed: number, feet: number, turnKey: string) =>
        advanceStealthMovement(state, baseSpeed, feet, turnKey, setting<number>(SETTING.stealthRogueLevel) ?? 7)
    },
    lowAbility: { reminder: (actor: AnyRecord) => lowAbilityReminder(actor?.system?.abilities, setting<number>(SETTING.lowAbilityThreshold) ?? 4) }
  };
  runtime().game.fvttHouseRules = Object.freeze(api);
}

/** Internal fixture hooks; not part of game.fvttHouseRules and never installed as public API. */
export const __testing = Object.freeze({
  stageAmmoPacket,
  commitAmmoPacket,
  processDeletedAmmoFallback,
  pendingAmmoSize: () => pendingAmmo.size,
  reset: () => {
    pendingAmmo.clear();
    pendingAmmoCommits.clear();
    pendingAmmoStages.clear();
    nativeAmmoObservations.clear();
    localAmmoPackets.clear();
  },
  captureNativeAmmoMessage,
});
