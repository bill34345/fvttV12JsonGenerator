// Foundry Ops owns this offline candidate test suite.
import { describe, expect, test } from "bun:test";
import {
  CHAPTER_PACK_NAME,
  EXCLUDED_TEST_PACK_NAME,
  FINAL_MODULE_STATE_OVERRIDES,
  PRODUCTION_MIGRATION_EXECUTION_ID,
  mergeCompendiumConfiguration,
  mergeModuleConfiguration,
  mergeSceneStorageRecord,
  mergeWorldMetadata,
  parseSettingValue,
  withSettingValue,
} from "../production-migration/buildCandidateSemantics";
import {
  isApprovedCandidateOnlyDeletion,
  parseProductionMigrationBuildCandidateArgs,
} from "../productionMigrationBuildCandidate";

describe("production migration final candidate semantics", () => {
  test("preserves production module inventory and applies only approved final states", () => {
    const production = {
      "filepicker-plus": false,
      "czepeku-29-depths-of-the-festerwood": true,
      "5e-dlc-monster": true,
      "chat-memory-guard": false,
    };
    const merged = mergeModuleConfiguration(production);

    expect(merged["filepicker-plus"]).toBe(false);
    expect(merged["czepeku-29-depths-of-the-festerwood"]).toBe(true);
    for (const [moduleId, state] of Object.entries(FINAL_MODULE_STATE_OVERRIDES)) {
      expect(merged[moduleId]).toBe(state);
    }
  });

  test("keeps production compendium layout while excluding DLC and test packs", () => {
    const merged = mergeCompendiumConfiguration(
      {
        "production.pack": { folder: "prod" },
        "5e-dlc-monster.aibolun": { locked: true },
        [`world.${EXCLUDED_TEST_PACK_NAME}`]: { folder: "test" },
      },
      {
        [`world.${CHAPTER_PACK_NAME}`]: { folder: "chapter" },
      },
    );

    expect(merged).toEqual({
      "production.pack": { folder: "prod" },
      [`world.${CHAPTER_PACK_NAME}`]: { folder: "chapter" },
    });
  });

  test("uses production scene state while retaining only MIO paths", () => {
    const localParent = {
      _id: "S",
      active: true,
      tokens: [{ _id: "local-test-token" }],
      levels: [{ _id: "L", background: { src: "optimized.__mio_v1_map.webp" }, elevation: 1 }],
      tiles: [{ _id: "T", texture: { src: "optimized.__mio_v1_tile.webp" }, x: 900 }],
      _stats: { modifiedTime: 20 },
    };
    const productionParent = {
      _id: "S",
      active: false,
      tokens: [{ _id: "production-token" }],
      levels: [{ _id: "L", background: { src: "original.webp" }, elevation: 2 }],
      tiles: [{ _id: "T", texture: { src: "original-tile.webp" }, x: 10 }],
      _stats: { modifiedTime: 10 },
    };

    expect(mergeSceneStorageRecord("!scenes!S", localParent, productionParent)).toEqual({
      _id: "S",
      active: false,
      tokens: [{ _id: "production-token" }],
      levels: [{ _id: "L", background: { src: "optimized.__mio_v1_map.webp" }, elevation: 2 }],
      tiles: [{ _id: "T", texture: { src: "optimized.__mio_v1_tile.webp" }, x: 10 }],
      _stats: { modifiedTime: 10 },
    });
    expect(mergeSceneStorageRecord(
      "!scenes.levels!S.L",
      { _id: "L", background: { src: "optimized.webp" }, elevation: 1 },
      { _id: "L", background: { src: "original.webp" }, elevation: 2 },
    )).toEqual({
      _id: "L",
      background: { src: "optimized.webp" },
      elevation: 2,
    });
    expect(mergeSceneStorageRecord(
      "!scenes.tokens!S.T",
      { _id: "T", x: 900 },
      { _id: "T", x: 10 },
    )).toEqual({ _id: "T", x: 10 });
  });

  test("retains the adjudicated local landing-page modified time only", () => {
    const merged = mergeSceneStorageRecord(
      "!scenes!EBJYd289N5uyTmlC",
      { _id: "EBJYd289N5uyTmlC", active: true, _stats: { modifiedTime: 20, coreVersion: "local" } },
      { _id: "EBJYd289N5uyTmlC", active: false, _stats: { modifiedTime: 10, coreVersion: "production" } },
    );
    expect(merged).toEqual({
      _id: "EBJYd289N5uyTmlC",
      active: false,
      _stats: { modifiedTime: 20, coreVersion: "production" },
    });
  });

  test("uses local optimized metadata, production playtime, production packs, and chapter archive", () => {
    const base = {
      id: "cor-cotn",
      coreVersion: "14.364",
      system: "dnd5e",
      systemVersion: "5.3.3",
    };
    const merged = mergeWorldMetadata(
      {
        ...base,
        title: "Local optimized",
        lastPlayed: "local",
        playtime: 10,
        packs: [
          { name: "production-pack", path: "local-copy" },
          { name: EXCLUDED_TEST_PACK_NAME, path: "packs/test" },
          { name: CHAPTER_PACK_NAME, path: "packs/chapter" },
        ],
      },
      {
        ...base,
        title: "Production",
        lastPlayed: "production",
        playtime: 20,
        packs: [{ name: "production-pack", path: "production-copy" }],
      },
    );
    expect(merged.title).toBe("Local optimized");
    expect(merged.lastPlayed).toBe("production");
    expect(merged.playtime).toBe(20);
    expect(merged.packs).toEqual([
      { name: "production-pack", path: "production-copy" },
      { name: CHAPTER_PACK_NAME, path: "packs/chapter" },
    ]);
  });

  test("round-trips Foundry JSON-encoded setting values", () => {
    const record = { _id: "S", key: "example.setting", value: "{\"old\":true}" };
    expect(parseSettingValue(record, "example.setting")).toEqual({ old: true });
    expect(withSettingValue(record, "example.setting", { next: false })).toEqual({
      _id: "S",
      key: "example.setting",
      value: "{\"next\":false}",
    });
  });

  test("parses the bounded final-candidate CLI shape", () => {
    const args = [
      "--execution-id", PRODUCTION_MIGRATION_EXECUTION_ID,
      "--local-world", "local",
      "--production-world", "production",
      "--audit-file", "audit.json",
      "--app-root", "app",
      "--output-world", "output",
      "--private-report", "private.json",
      "--redacted-report", "redacted.json",
    ];
    expect(parseProductionMigrationBuildCandidateArgs(args)).toEqual({
      executionId: PRODUCTION_MIGRATION_EXECUTION_ID,
      localWorld: "local",
      productionWorld: "production",
      auditFile: "audit.json",
      appRoot: "app",
      outputWorld: "output",
      privateReport: "private.json",
      redactedReport: "redacted.json",
    });
    expect(() => parseProductionMigrationBuildCandidateArgs(args.slice(0, -2))).toThrow(
      "Missing required argument",
    );
    expect(() => parseProductionMigrationBuildCandidateArgs([
      ...args.slice(0, 1),
      "current",
      ...args.slice(2),
    ])).toThrow("frozen migration tool");
  });

  test("deletes only adjudicated candidate-only test records or production deletions", () => {
    expect(isApprovedCandidateOnlyDeletion("actors", "local-add")).toBe(true);
    expect(isApprovedCandidateOnlyDeletion("scenes", "local-add")).toBe(true);
    expect(isApprovedCandidateOnlyDeletion("scenes", "production-delete")).toBe(true);
    expect(isApprovedCandidateOnlyDeletion("folders", "local-add")).toBe(false);
    expect(isApprovedCandidateOnlyDeletion("journal", "local-add")).toBe(false);
    expect(isApprovedCandidateOnlyDeletion("scenes", "local-change")).toBe(false);
    expect(isApprovedCandidateOnlyDeletion("settings", "production-delete")).toBe(false);
  });
});
