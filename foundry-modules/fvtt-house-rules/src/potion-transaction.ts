import { FLAG, MODULE_ID } from "./constants";
import { potionSnapshot, type PotionActivities } from "./core/potion";

type AnyRecord = Record<string, any>;

interface PotionPort {
  canWrite: () => boolean;
  snapshot: () => AnyRecord | null;
  equals: ((left: unknown, right: unknown) => boolean) | undefined;
  replacement: { create?: (value: unknown) => unknown } | undefined;
  normalizeActivities?: (activities: PotionActivities) => AnyRecord | null;
}

function persistedActivities(value: unknown): AnyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    // Item.toObject() may retain undefined schema fields; module flags persist as JSON and omit them.
    const persisted = JSON.parse(JSON.stringify(value));
    return persisted && typeof persisted === "object" && !Array.isArray(persisted) ? persisted : null;
  } catch {
    return null;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameJson(value, right[index]));
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => Object.hasOwn(right, key) && sameJson((left as AnyRecord)[key], (right as AnyRecord)[key]));
}

function matchesPlannedActivities(original: AnyRecord, applied: AnyRecord, planned: AnyRecord): boolean {
  const generatedKeys = Object.keys(applied).filter(key => !Object.hasOwn(original, key));
  const plannedValues = Object.values(planned);
  if (generatedKeys.length !== plannedValues.length
    || Object.keys(applied).length !== Object.keys(original).length + plannedValues.length) return false;
  if (Object.keys(original).some(key => !Object.hasOwn(applied, key) || !sameJson(applied[key], original[key]))) return false;

  const remaining = new Set(generatedKeys);
  for (const expected of plannedValues) {
    const key = [...remaining].find(candidate => applied[candidate]?._id === expected._id);
    if (!key) return false;
    const actual = structuredClone(applied[key]);
    // dnd5e can materialize an undefined healing.scaling.formula; JSON flags omit it.
    if (expected.healing?.scaling === undefined && actual.healing?.scaling
      && !Object.keys(actual.healing.scaling).length) delete actual.healing.scaling;
    if (!sameJson(actual, expected)) return false;
    remaining.delete(key);
  }
  return remaining.size === 0;
}

const transactions = new Map<string | object, Promise<void>>();

interface PendingRestoreCleanup {
  uuid: string | null;
  snapshot: AnyRecord;
  original: AnyRecord;
}

const pendingRestoreCleanup = new WeakMap<object, PendingRestoreCleanup>();

function itemIdentity(item: AnyRecord): string | object | null {
  const identity = typeof item?.uuid === "string" && item.uuid ? item.uuid : item;
  return identity && (typeof identity === "object" || typeof identity === "string") ? identity : null;
}

/** Serializes module writes for one Item; the world flag remains the recovery source. */
export async function transactPotion(
  item: AnyRecord,
  mode: "apply" | "restore",
  planActivities: () => PotionActivities | null,
  port: PotionPort
): Promise<AnyRecord | null> {
  const identity = itemIdentity(item);
  if (!identity) return null;
  const previous = transactions.get(identity);
  let release!: () => void;
  const completed = new Promise<void>(resolve => { release = resolve; });
  transactions.set(identity, completed);
  if (previous) await previous;
  try {
    if (!port.canWrite()) return null;
    const activities = planActivities();
    if (!activities) return null;
    return await (mode === "restore" ? restorePotion(item, port) : applyPotion(item, activities, port));
  } finally {
    if (transactions.get(identity) === completed) transactions.delete(identity);
    release();
  }
}

async function restorePotion(item: AnyRecord, port: PotionPort): Promise<AnyRecord | null> {
  const snapshot = port.snapshot();
  if (!snapshot || snapshot.schema !== 2) {
    pendingRestoreCleanup.delete(item);
    return null;
  }
  const original = persistedActivities(snapshot.activities);
  const applied = persistedActivities(snapshot.appliedActivities);
  const current = persistedActivities(item.toObject?.()?.system?.activities);
  const { equals, replacement } = port;
  if (!original || !applied || !current
    || typeof replacement?.create !== "function" || typeof equals !== "function") return null;
  const pending = pendingRestoreCleanup.get(item);
  if (pending) {
    if (pending.uuid !== (typeof item.uuid === "string" ? item.uuid : null)
      || !sameJson(snapshot, pending.snapshot)
      || !sameJson(original, pending.original) || !sameJson(current, pending.original)) {
      pendingRestoreCleanup.delete(item);
      return null;
    }
    return finishRestoreCleanup(item, original, port);
  }
  // A generated activity may have been edited after apply, even if its module flag remains.
  if (!equals(current, applied)) return null;
  const updated = await item.update({ "system.activities": replacement.create(structuredClone(original)) });
  if (!updated || !sameJson(persistedActivities(item.toObject?.()?.system?.activities), original)) return null;
  pendingRestoreCleanup.set(item, {
    uuid: typeof item.uuid === "string" ? item.uuid : null,
    snapshot: structuredClone(snapshot), original: structuredClone(original)
  });
  if (!port.canWrite()) return null;
  return finishRestoreCleanup(item, original, port);
}

async function finishRestoreCleanup(
  item: AnyRecord, original: AnyRecord, port: PotionPort
): Promise<AnyRecord | null> {
  if (!port.canWrite() || !sameJson(persistedActivities(item.toObject?.()?.system?.activities), original)) return null;
  await item.unsetFlag(MODULE_ID, FLAG.potionSnapshot);
  if (!port.canWrite() || port.snapshot()
    || !sameJson(persistedActivities(item.toObject?.()?.system?.activities), original)) return null;
  pendingRestoreCleanup.delete(item);
  return { restored: true };
}

async function applyPotion(item: AnyRecord, activities: PotionActivities, port: PotionPort): Promise<AnyRecord | null> {
  if (port.snapshot()) return null;
  const source = item.toObject?.()?.system?.activities;
  const original = persistedActivities(source);
  if (!original || Object.keys(activities).some(key => Object.hasOwn(source, key))) return null;
  // The native registered model adds defaults (including optional-module
  // fields). Derive the complete expected source before the first write.
  const expected = persistedActivities(port.normalizeActivities?.(activities));
  if (!expected || Object.keys(expected).length !== Object.keys(activities).length) return null;
  // A schema 1 snapshot remains available if the update fails, but is not safe to restore automatically.
  await item.setFlag(MODULE_ID, FLAG.potionSnapshot, potionSnapshot(original));
  const pending = port.snapshot();
  const { equals } = port;
  if (!port.canWrite() || pending?.schema !== 1 || typeof equals !== "function"
    || !equals(pending.activities, original)
    || !equals(persistedActivities(item.toObject?.()?.system?.activities), original)) return null;
  const updated = await item.update({ "system.activities": activities });
  const applied = persistedActivities(item.toObject?.()?.system?.activities);
  if (!updated || !port.canWrite() || !applied
    || !matchesPlannedActivities(original, applied, expected)) return null;
  await item.setFlag(MODULE_ID, FLAG.potionSnapshot, {
    schema: 2, activities: structuredClone(original), appliedActivities: structuredClone(applied)
  });
  const saved = port.snapshot();
  if (saved?.schema !== 2 || !port.canWrite()
    || !equals(persistedActivities(saved.activities), original)
    || !equals(persistedActivities(saved.appliedActivities), applied)
    || !equals(persistedActivities(item.toObject?.()?.system?.activities), applied)) return null;
  return { applied: true, activities };
}
