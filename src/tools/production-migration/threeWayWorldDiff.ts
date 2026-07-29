import type { LevelRecord, WorldSnapshot } from "../world-audit/model";

const MISSING = Symbol("missing");

type Missing = typeof MISSING;
type JsonValue = unknown;

export interface ThreeWayMergePolicy {
  localWholeCollections?: ReadonlySet<string>;
  localDeletedRecordIds?: ReadonlySet<string>;
  finalDeletedRecordIds?: ReadonlySet<string>;
  localOwnedPathPrefixes?: ReadonlyMap<string, readonly string[]>;
  productionOwnedPathPrefixes?: ReadonlyMap<string, readonly string[]>;
}

export type RecordDecision =
  | "unchanged"
  | "local-add"
  | "production-add"
  | "local-delete"
  | "production-delete"
  | "local-change"
  | "production-change"
  | "field-merge"
  | "conflict";

export interface RecordConflict {
  path: string;
  base: JsonValue | "<missing>";
  local: JsonValue | "<missing>";
  production: JsonValue | "<missing>";
}

export interface ThreeWayRecordDecision {
  id: string;
  collection: string;
  key: string;
  decision: RecordDecision;
  selected: "local" | "production" | "merged" | "deleted" | "unresolved";
  mergedValue?: Record<string, unknown>;
  conflicts: RecordConflict[];
}

export interface ThreeWayWorldDiff {
  decisions: ThreeWayRecordDecision[];
  summary: Record<RecordDecision, number>;
  conflictCount: number;
}

interface ComparableRecord {
  id: string;
  collection: string;
  key: string;
  value: Record<string, unknown>;
}

export function buildThreeWayWorldDiff(
  base: WorldSnapshot,
  local: WorldSnapshot,
  production: WorldSnapshot,
  policy: ThreeWayMergePolicy = {},
): ThreeWayWorldDiff {
  const baseRecords = comparableRecords(base);
  const localRecords = comparableRecords(local);
  const productionRecords = comparableRecords(production);
  const ids = [...new Set([
    ...baseRecords.keys(),
    ...localRecords.keys(),
    ...productionRecords.keys(),
  ])].sort(compareOrdinal);

  const decisions = ids.map((id) => decideRecord(
    id,
    baseRecords.get(id),
    localRecords.get(id),
    productionRecords.get(id),
    policy,
  ));
  const summary = emptySummary();
  for (const decision of decisions) summary[decision.decision] += 1;
  return {
    decisions,
    summary,
    conflictCount: decisions.reduce((sum, decision) => sum + decision.conflicts.length, 0),
  };
}

export function recordIdentity(record: Pick<LevelRecord, "key" | "storageScope" | "storageRelativePath">): string {
  return [
    record.storageScope ?? "world",
    record.storageRelativePath ?? "",
    record.key,
  ].join("|");
}

function decideRecord(
  id: string,
  base: ComparableRecord | undefined,
  local: ComparableRecord | undefined,
  production: ComparableRecord | undefined,
  policy: ThreeWayMergePolicy,
): ThreeWayRecordDecision {
  const exemplar = local ?? production ?? base;
  if (!exemplar) throw new Error(`No record data for ${id}`);
  const localWhole = policy.localWholeCollections?.has(exemplar.collection) ?? false;
  const localDelete = policy.localDeletedRecordIds?.has(id) ?? false;
  const finalDelete = policy.finalDeletedRecordIds?.has(id) ?? false;

  if (finalDelete) {
    return result(exemplar, "local-delete", "deleted");
  }

  if (equal(local?.value, production?.value)) {
    if (!local && !production) {
      return result(exemplar, "unchanged", "deleted");
    }
    return result(exemplar, "unchanged", "local", local!.value);
  }
  if (localWhole) {
    return local
      ? result(exemplar, base ? "local-change" : "local-add", "local", local.value)
      : result(exemplar, "local-delete", "deleted");
  }
  if (!base) {
    if (local && !production) return result(exemplar, "local-add", "local", local.value);
    if (!local && production) return result(exemplar, "production-add", "production", production.value);
    return conflictResult(exemplar, "", MISSING, local?.value ?? MISSING, production?.value ?? MISSING);
  }
  if (!local) {
    if (equal(base.value, production?.value) || localDelete) {
      return result(exemplar, "local-delete", "deleted");
    }
    return conflictResult(exemplar, "", base.value, MISSING, production?.value ?? MISSING);
  }
  if (!production) {
    if (equal(base.value, local.value)) return result(exemplar, "production-delete", "deleted");
    return conflictResult(exemplar, "", base.value, local.value, MISSING);
  }
  if (equal(base.value, production.value)) {
    return result(exemplar, "local-change", "local", local.value);
  }
  if (equal(base.value, local.value)) {
    return result(exemplar, "production-change", "production", production.value);
  }

  const merged = structuredClone(base.value);
  const conflicts: RecordConflict[] = [];
  const paths = [...new Set([
    ...leafPaths(base.value),
    ...leafPaths(local.value),
    ...leafPaths(production.value),
  ])].sort(compareOrdinal);
  const ownedPrefixes = policy.localOwnedPathPrefixes?.get(id) ?? [];
  const productionOwnedPrefixes = policy.productionOwnedPathPrefixes?.get(id) ?? [];

  for (const path of paths) {
    const baseValue = valueAt(base.value, path);
    const localValue = valueAt(local.value, path);
    const productionValue = valueAt(production.value, path);
    if (equal(localValue, productionValue)) {
      applyValue(merged, path, localValue);
    } else if (equal(baseValue, productionValue)) {
      applyValue(merged, path, localValue);
    } else if (equal(baseValue, localValue)) {
      applyValue(merged, path, productionValue);
    } else if (ownedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      applyValue(merged, path, localValue);
    } else if (productionOwnedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      applyValue(merged, path, productionValue);
    } else {
      conflicts.push(conflict(path, baseValue, localValue, productionValue));
    }
  }

  if (conflicts.length > 0) {
    return {
      id,
      collection: exemplar.collection,
      key: exemplar.key,
      decision: "conflict",
      selected: "unresolved",
      conflicts,
    };
  }
  return {
    id,
    collection: exemplar.collection,
    key: exemplar.key,
    decision: "field-merge",
    selected: "merged",
    mergedValue: merged,
    conflicts: [],
  };
}

function comparableRecords(snapshot: WorldSnapshot): Map<string, ComparableRecord> {
  const childFields = immediateEmbeddedFields(snapshot.records);
  const records = new Map<string, ComparableRecord>();
  for (const record of snapshot.records) {
    const id = recordIdentity(record);
    if (records.has(id)) throw new Error(`Duplicate record identity in snapshot: ${id}`);
    const value = structuredClone(record.value);
    for (const field of childFields.get(id) ?? []) delete value[field];
    records.set(id, {
      id,
      collection: record.collection,
      key: record.key,
      value,
    });
  }
  return records;
}

function immediateEmbeddedFields(records: LevelRecord[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const child of records) {
    if (child.embeddedPath.length === 0 || child.parentIds.length === 0) continue;
    const parentNamespace = child.namespace.split(".").slice(0, -1).join(".");
    const parentKey = `!${parentNamespace}!${child.parentIds.join(".")}`;
    const parentId = [
      child.storageScope ?? "world",
      child.storageRelativePath ?? "",
      parentKey,
    ].join("|");
    const field = child.embeddedPath.at(-1);
    if (!field) continue;
    const fields = result.get(parentId) ?? new Set<string>();
    fields.add(field);
    result.set(parentId, fields);
  }
  return result;
}

function leafPaths(value: JsonValue, prefix = ""): string[] {
  if (!isPlainObject(value) || Object.keys(value).length === 0) return [prefix];
  return Object.keys(value).flatMap((key) => {
    const escaped = key.replaceAll("~", "~0").replaceAll("/", "~1");
    return leafPaths(value[key], `${prefix}/${escaped}`);
  });
}

function valueAt(root: JsonValue, path: string): JsonValue | Missing {
  if (path === "") return root;
  let current: JsonValue = root;
  for (const segment of parsePath(path)) {
    if (!isPlainObject(current) || !Object.hasOwn(current, segment)) return MISSING;
    current = current[segment];
  }
  return current;
}

function applyValue(root: Record<string, unknown>, path: string, value: JsonValue | Missing): void {
  const segments = parsePath(path);
  if (segments.length === 0) throw new Error("Cannot replace a complete record during field merge");
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!isPlainObject(next)) current[segment] = {};
    current = current[segment] as Record<string, unknown>;
  }
  const leaf = segments.at(-1)!;
  if (value === MISSING) delete current[leaf];
  else current[leaf] = structuredClone(value);
}

function parsePath(path: string): string[] {
  return path.split("/").slice(1).map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function isPlainObject(value: JsonValue): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function equal(left: JsonValue | Missing, right: JsonValue | Missing): boolean {
  if (left === MISSING || right === MISSING) return left === right;
  return stableJson(left) === stableJson(right);
}

function stableJson(value: JsonValue): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareOrdinal(left, right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

function conflictResult(
  exemplar: ComparableRecord,
  path: string,
  base: JsonValue | Missing,
  local: JsonValue | Missing,
  production: JsonValue | Missing,
): ThreeWayRecordDecision {
  return {
    id: exemplar.id,
    collection: exemplar.collection,
    key: exemplar.key,
    decision: "conflict",
    selected: "unresolved",
    conflicts: [conflict(path, base, local, production)],
  };
}

function conflict(
  path: string,
  base: JsonValue | Missing,
  local: JsonValue | Missing,
  production: JsonValue | Missing,
): RecordConflict {
  return {
    path,
    base: displayValue(base),
    local: displayValue(local),
    production: displayValue(production),
  };
}

function displayValue(value: JsonValue | Missing): JsonValue | "<missing>" {
  return value === MISSING ? "<missing>" : value;
}

function result(
  exemplar: ComparableRecord,
  decision: RecordDecision,
  selected: ThreeWayRecordDecision["selected"],
  mergedValue?: Record<string, unknown>,
): ThreeWayRecordDecision {
  return {
    id: exemplar.id,
    collection: exemplar.collection,
    key: exemplar.key,
    decision,
    selected,
    ...(mergedValue ? { mergedValue: structuredClone(mergedValue) } : {}),
    conflicts: [],
  };
}

function emptySummary(): Record<RecordDecision, number> {
  return {
    unchanged: 0,
    "local-add": 0,
    "production-add": 0,
    "local-delete": 0,
    "production-delete": 0,
    "local-change": 0,
    "production-change": 0,
    "field-merge": 0,
    conflict: 0,
  };
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
