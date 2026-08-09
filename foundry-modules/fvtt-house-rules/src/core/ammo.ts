import { ledgerStorageKey, recordTransaction, transactionId, type TransactionLedger } from "./ledger";

export type AmmoTier = 0 | 1 | 2 | 3;

export interface AmmoTag {
  tier: AmmoTier;
}

export interface AmmoSnapshot {
  name: string;
  img?: string;
  type: string;
  system: Record<string, unknown>;
  flags: Record<string, unknown>;
}

export interface FiredAmmo {
  id: string;
  transactionId: string;
  ammoItemId: string;
  beforeTier: AmmoTier;
  recoveredTier: AmmoTier;
  snapshot: AmmoSnapshot;
  recovered: boolean;
  createdAt: number;
}

export interface AmmoLedger {
  schema: 1;
  shots: Record<string, FiredAmmo>;
}

export function emptyAmmoLedger(): AmmoLedger {
  return { schema: 1, shots: {} };
}

export function parseAmmoTier(value: unknown): AmmoTier | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3 ? value as AmmoTier : null;
}

export function recoveredTier(tier: AmmoTier): AmmoTier {
  return Math.max(0, tier - 1) as AmmoTier;
}

export function createAmmoShot(
  eventId: string,
  actorId: string,
  ammoItemId: string,
  beforeTier: AmmoTier,
  snapshot: AmmoSnapshot,
  createdAt: number
): FiredAmmo | null {
  const id = transactionId("ammo", actorId, ammoItemId, eventId);
  if (!id || !snapshot.name || !snapshot.type) return null;
  return {
    id,
    transactionId: id,
    ammoItemId,
    beforeTier,
    recoveredTier: recoveredTier(beforeTier),
    snapshot: structuredClone(snapshot),
    recovered: false,
    createdAt
  };
}

export function recordAmmoShot(
  prior: AmmoLedger | undefined,
  ledger: TransactionLedger | undefined,
  shot: FiredAmmo
): { applied: boolean; ammoLedger: AmmoLedger; transactionLedger: TransactionLedger } {
  const transaction = recordTransaction(ledger, shot.transactionId, "ammo-fired", shot.createdAt);
  const ammoLedger = prior ? structuredClone(prior) : emptyAmmoLedger();
  const storageKey = ledgerStorageKey(shot.id);
  if (!transaction.applied || ammoLedger.shots[storageKey] || ammoLedger.shots[shot.id]) return { applied: false, ammoLedger, transactionLedger: transaction.ledger };
  ammoLedger.shots[storageKey] = structuredClone(shot);
  return { applied: true, ammoLedger, transactionLedger: transaction.ledger };
}

export function confirmAmmoRecovery(prior: AmmoLedger | undefined, shotId: string): { applied: boolean; ammoLedger: AmmoLedger; shot: FiredAmmo | null } {
  const ammoLedger = prior ? structuredClone(prior) : emptyAmmoLedger();
  const shot = ammoLedger.shots[ledgerStorageKey(shotId)] ?? ammoLedger.shots[shotId];
  if (!shot || shot.recovered) return { applied: false, ammoLedger, shot: shot ?? null };
  shot.recovered = true;
  return { applied: true, ammoLedger, shot: structuredClone(shot) };
}

/** Exact dnd5e 5.3.3 deletion fallback: flags.dnd5e.roll.ammunitionData. */
export function extractAmmoSnapshotFromChatFlags(flags: unknown): AmmoSnapshot | null {
  const candidate = (flags as { dnd5e?: { roll?: { ammunitionData?: unknown } } } | undefined)?.dnd5e?.roll?.ammunitionData;
  if (!candidate || typeof candidate !== "object") return null;
  const data = candidate as Partial<AmmoSnapshot>;
  if (typeof data.name !== "string" || typeof data.type !== "string" || !data.system || !data.flags) return null;
  return {
    name: data.name,
    img: typeof data.img === "string" ? data.img : undefined,
    type: data.type,
    system: structuredClone(data.system),
    flags: structuredClone(data.flags)
  };
}
