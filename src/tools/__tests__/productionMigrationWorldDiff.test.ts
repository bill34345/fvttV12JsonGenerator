import { describe, expect, test } from "bun:test";
import type { LevelRecord, WorldSnapshot } from "../world-audit/model";
import {
  buildThreeWayWorldDiff,
  recordIdentity,
} from "../production-migration/threeWayWorldDiff";
import { parseProductionMigrationThreeWayAuditArgs } from "../productionMigrationThreeWayAudit";
import { PRODUCTION_MIGRATION_EXECUTION_ID } from "../production-migration/buildCandidateSemantics";

describe("production migration three-way world diff", () => {
  test("merges independent local and production field edits", () => {
    const base = snapshot(record("actors", "A", { _id: "A", name: "Base", ownership: { default: 0 } }));
    const local = snapshot(record("actors", "A", { _id: "A", name: "Local", ownership: { default: 0 } }));
    const production = snapshot(record("actors", "A", {
      _id: "A",
      name: "Base",
      ownership: { default: 0, player: 2 },
    }));

    const result = buildThreeWayWorldDiff(base, local, production);

    expect(result.conflictCount).toBe(0);
    expect(result.decisions[0]).toMatchObject({
      decision: "field-merge",
      selected: "merged",
      mergedValue: {
        _id: "A",
        name: "Local",
        ownership: { default: 0, player: 2 },
      },
    });
  });

  test("parses the bounded three-way audit CLI shape", () => {
    expect(parseProductionMigrationThreeWayAuditArgs([
      "--execution-id", PRODUCTION_MIGRATION_EXECUTION_ID,
      "--base-world", "base",
      "--local-world", "local",
      "--production-world", "production",
      "--app-root", "app",
      "--snapshot-root", "snapshots",
      "--private-output", "private.json",
      "--redacted-output", "redacted.json",
      "--ownership-file", "ownership.json",
    ])).toEqual({
      executionId: PRODUCTION_MIGRATION_EXECUTION_ID,
      baseWorld: "base",
      localWorld: "local",
      productionWorld: "production",
      appRoot: "app",
      snapshotRoot: "snapshots",
      privateOutput: "private.json",
      redactedOutput: "redacted.json",
      ownershipFile: "ownership.json",
    });
    expect(() => parseProductionMigrationThreeWayAuditArgs([
      "--base-world", "base",
    ])).toThrow("Missing required argument");
    expect(() => parseProductionMigrationThreeWayAuditArgs([
      "--unknown", "value",
    ])).toThrow("Unknown argument");
    expect(() => parseProductionMigrationThreeWayAuditArgs([
      "--execution-id", "current",
      "--base-world", "base",
      "--local-world", "local",
      "--production-world", "production",
      "--app-root", "app",
      "--snapshot-root", "snapshots",
      "--private-output", "private.json",
      "--redacted-output", "redacted.json",
    ])).toThrow("frozen migration tool");
  });

  test("blocks a divergent edit to the same unowned field", () => {
    const base = snapshot(record("actors", "A", { _id: "A", name: "Base" }));
    const local = snapshot(record("actors", "A", { _id: "A", name: "Local" }));
    const production = snapshot(record("actors", "A", { _id: "A", name: "Production" }));

    const result = buildThreeWayWorldDiff(base, local, production);

    expect(result.conflictCount).toBe(1);
    expect(result.decisions[0]).toMatchObject({
      decision: "conflict",
      conflicts: [{ path: "/name", base: "Base", local: "Local", production: "Production" }],
    });
  });

  test("allows an explicit local field owner to resolve a divergent edit", () => {
    const baseRecord = record("scenes", "S", { _id: "S", background: { src: "old.webp" } });
    const id = recordIdentity(baseRecord);
    const result = buildThreeWayWorldDiff(
      snapshot(baseRecord),
      snapshot(record("scenes", "S", { _id: "S", background: { src: "optimized.webp" } })),
      snapshot(record("scenes", "S", { _id: "S", background: { src: "production.webp" } })),
      { localOwnedPathPrefixes: new Map([[id, ["/background/src"]]]) },
    );

    expect(result.conflictCount).toBe(0);
    expect(result.decisions[0]?.mergedValue).toEqual({
      _id: "S",
      background: { src: "optimized.webp" },
    });
  });

  test("allows an explicit production field owner to preserve a divergent edit", () => {
    const baseRecord = record("users", "U", { _id: "U", flags: { layout: { top: 100 } } });
    const id = recordIdentity(baseRecord);
    const result = buildThreeWayWorldDiff(
      snapshot(baseRecord),
      snapshot(record("users", "U", { _id: "U", flags: { layout: { top: 200 } } })),
      snapshot(record("users", "U", { _id: "U", flags: { layout: { top: 300 } } })),
      { productionOwnedPathPrefixes: new Map([[id, ["/flags/layout"]]]) },
    );

    expect(result.conflictCount).toBe(0);
    expect(result.decisions[0]?.mergedValue).toEqual({
      _id: "U",
      flags: { layout: { top: 300 } },
    });
  });

  test("uses the local ChatMessage and Combat session state wholesale", () => {
    const base = snapshot(
      record("messages", "M", { _id: "M", content: "base" }),
      record("combats", "C", { _id: "C", round: 1 }),
    );
    const local = snapshot(
      record("messages", "M", { _id: "M", content: "local" }),
      record("combats", "C", { _id: "C", round: 2 }),
    );
    const production = snapshot(
      record("messages", "M", { _id: "M", content: "production" }),
      record("messages", "P", { _id: "P", content: "production-only" }),
      record("combats", "C", { _id: "C", round: 3 }),
    );

    const result = buildThreeWayWorldDiff(base, local, production, {
      localWholeCollections: new Set(["messages", "combats"]),
    });

    expect(result.conflictCount).toBe(0);
    expect(result.decisions.find((decision) => decision.key.endsWith("!M"))).toMatchObject({
      decision: "local-change",
      selected: "local",
    });
    expect(result.decisions.find((decision) => decision.key.endsWith("!P"))).toMatchObject({
      decision: "local-delete",
      selected: "deleted",
    });
  });

  test("removes materialized embedded arrays before comparing their separate records", () => {
    const base = snapshot(
      record("actors", "A", { _id: "A", name: "Actor", items: [{ _id: "I", name: "Old" }] }),
      embeddedRecord("actors", "items", ["A"], "I", { _id: "I", name: "Old" }),
    );
    const local = snapshot(
      record("actors", "A", { _id: "A", name: "Actor", items: [{ _id: "I", name: "Local" }] }),
      embeddedRecord("actors", "items", ["A"], "I", { _id: "I", name: "Local" }),
    );
    const production = snapshot(
      record("actors", "A", { _id: "A", name: "Actor", items: [{ _id: "I", name: "Production" }] }),
      embeddedRecord("actors", "items", ["A"], "I", { _id: "I", name: "Production" }),
    );

    const result = buildThreeWayWorldDiff(base, local, production);

    const parent = result.decisions.find((decision) => decision.key === "!actors!A");
    const child = result.decisions.find((decision) => decision.key === "!actors.items!A.I");
    expect(parent).toMatchObject({ decision: "unchanged", conflicts: [] });
    expect(child).toMatchObject({ decision: "conflict" });
  });

  test("distinguishes explicit local deletion from a production edit", () => {
    const baseRecord = record("actors", "A", { _id: "A", name: "Base" });
    const productionRecord = record("actors", "A", { _id: "A", name: "Production" });
    const unresolved = buildThreeWayWorldDiff(snapshot(baseRecord), snapshot(), snapshot(productionRecord));
    const resolved = buildThreeWayWorldDiff(
      snapshot(baseRecord),
      snapshot(),
      snapshot(productionRecord),
      { localDeletedRecordIds: new Set([recordIdentity(baseRecord)]) },
    );

    expect(unresolved.conflictCount).toBe(1);
    expect(resolved.conflictCount).toBe(0);
    expect(resolved.decisions[0]).toMatchObject({ decision: "local-delete", selected: "deleted" });
  });

  test("supports an explicit final deletion for a divergent derived cache", () => {
    const baseRecord = record("settings", "S", {
      _id: "S",
      key: "resolver.index",
      value: "base",
    });
    const id = recordIdentity(baseRecord);
    const result = buildThreeWayWorldDiff(
      snapshot(baseRecord),
      snapshot(record("settings", "S", {
        _id: "S",
        key: "resolver.index",
        value: "local",
      })),
      snapshot(record("settings", "S", {
        _id: "S",
        key: "resolver.index",
        value: "production",
      })),
      { finalDeletedRecordIds: new Set([id]) },
    );

    expect(result.conflictCount).toBe(0);
    expect(result.decisions[0]).toMatchObject({
      decision: "local-delete",
      selected: "deleted",
    });
  });
});

function snapshot(...records: LevelRecord[]): WorldSnapshot {
  return {
    sourceWorldRoot: "source",
    snapshotWorldRoot: "snapshot",
    sourceTreeHashBefore: "hash",
    sourceTreeHashAfter: "hash",
    sourceTree: [],
    snapshotTree: [],
    collectionBytes: {},
    records,
  };
}

function record(collection: string, id: string, value: Record<string, unknown>): LevelRecord {
  return {
    collection,
    key: `!${collection}!${id}`,
    namespace: collection,
    parentIds: [],
    embeddedPath: [],
    value,
    storageScope: "world",
    storageRelativePath: `data/${collection}`,
  };
}

function embeddedRecord(
  collection: string,
  embedded: string,
  parentIds: string[],
  id: string,
  value: Record<string, unknown>,
): LevelRecord {
  return {
    collection,
    key: `!${collection}.${embedded}!${[...parentIds, id].join(".")}`,
    namespace: `${collection}.${embedded}`,
    parentIds,
    embeddedPath: [embedded],
    value,
    storageScope: "world",
    storageRelativePath: `data/${collection}`,
  };
}
