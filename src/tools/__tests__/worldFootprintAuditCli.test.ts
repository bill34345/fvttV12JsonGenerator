import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  parseAuditCliArguments,
  runWorldFootprintAudit,
  type AuditCliOptions,
} from "../worldFootprintAudit";
import {
  createAuditValidation,
  createTrackedSummaryProjection,
  validateAuditBaseline,
} from "../world-audit/report";
import { analyzeWorld } from "../world-audit/inventory";
import type { LevelRecord, WorldSnapshot } from "../world-audit/model";

const SHEET_NAMES = [
  "Overview",
  "Actors",
  "Unused Actor Candidates",
  "Broken Token Actor Refs",
  "Journals",
  "Journal Pages",
  "Scenes",
  "World Items",
  "Macros and Tables",
  "Playlists and Combats",
  "Chat and Fog",
  "Settings and Modules",
  "Compendiums and Adventures",
  "Assets",
  "Chapter Classification",
  "User Decisions",
] as const;

const DECISIONS = [
  "Keep",
  "Delete",
  "Archive",
  "Restore Reference",
  "Needs Review",
] as const;

function top(collection: string, id: string, value: Record<string, unknown>): LevelRecord {
  return {
    collection,
    key: `!${collection}!${id}`,
    namespace: collection,
    parentIds: [],
    embeddedPath: [],
    value,
  };
}

function embedded(
  collection: string,
  namespace: string,
  ids: string[],
  value: Record<string, unknown>,
): LevelRecord {
  return {
    collection,
    key: `!${namespace}!${ids.join(".")}`,
    namespace,
    parentIds: ids.slice(0, -1),
    embeddedPath: namespace.split(".").slice(1),
    value,
  };
}

async function createFixtureRoot(): Promise<{
  root: string;
  options: AuditCliOptions;
  snapshot: WorldSnapshot;
}> {
  const root = await mkdtemp(join(tmpdir(), "world-footprint-audit-"));
  const appRoot = join(root, ".local", "foundry-v14", "app", "14.364");
  const dataRoot = join(root, ".local", "foundry-v14", "data", "server-mirror", "Data");
  const worldRoot = join(dataRoot, "worlds", "cor-cotn");
  const systemRoot = join(dataRoot, "systems", "dnd5e");
  const outputDir = join(root, "evidence", "audit");
  const snapshotDir = join(outputDir, "snapshot");
  await mkdir(join(appRoot, "node_modules", "classic-level"), { recursive: true });
  await mkdir(worldRoot, { recursive: true });
  await mkdir(systemRoot, { recursive: true });
  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify({ name: "foundryvtt", version: "14.364.0" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(appRoot, "node_modules", "classic-level", "index.js"), "export {};\n", "utf8");
  await writeFile(
    join(worldRoot, "world.json"),
    `${JSON.stringify({
      id: "cor-cotn",
      coreVersion: "14.364",
      system: "dnd5e",
      systemVersion: "5.3.3",
      packs: [
        {
          name: "Adventure-BxzlyiYWyXYyz9XI",
          label: "Adventure fixture",
          path: "packs/Adventure-BxzlyiYWyXYyz9XI",
          type: "Adventure",
        },
        {
          name: "Item-BBcWyzo1SRcrMaD1",
          label: "Item fixture",
          path: "packs/Item-BBcWyzo1SRcrMaD1",
          type: "Item",
        },
        {
          name: "and",
          label: "Second item fixture",
          path: "packs/and",
          type: "Item",
        },
      ],
    }, null, 2)}\n`,
    "utf8",
  );
  for (const pack of [
    "Adventure-BxzlyiYWyXYyz9XI",
    "Item-BBcWyzo1SRcrMaD1",
    "Item-t3wcdnI1LAfKqPlz",
    "and",
    "mass-edit-presets-main",
  ]) {
    await mkdir(join(worldRoot, "packs", pack), { recursive: true });
  }
  const worldEvidenceTime = new Date("2026-07-24T01:02:03.000Z");
  await utimes(join(worldRoot, "world.json"), worldEvidenceTime, worldEvidenceTime);
  await mkdir(snapshotDir, { recursive: true });
  await writeFile(
    join(snapshotDir, "world.json"),
    await readFile(join(worldRoot, "world.json"), "utf8"),
    "utf8",
  );
  for (const pack of [
    "Adventure-BxzlyiYWyXYyz9XI",
    "Item-BBcWyzo1SRcrMaD1",
    "Item-t3wcdnI1LAfKqPlz",
    "and",
    "mass-edit-presets-main",
  ]) {
    await mkdir(join(snapshotDir, "packs", pack), { recursive: true });
  }
  await utimes(join(snapshotDir, "world.json"), worldEvidenceTime, worldEvidenceTime);
  await writeFile(
    join(systemRoot, "system.json"),
    `${JSON.stringify({ id: "dnd5e", version: "5.3.3" }, null, 2)}\n`,
    "utf8",
  );

  const rawJournalBody = "RAW-JOURNAL-BODY-MUST-NOT-LEAK";
  const rawPassword = "RAW-USER-PASSWORD-MUST-NOT-LEAK";
  const records = [
    top("actors", "A1", {
      _id: "A1",
      name: "Scene-free but journal-linked",
      type: "npc",
      _stats: { modifiedTime: Date.parse("2026-07-23T12:00:00.000Z") },
      ownership: {},
      items: [],
      effects: [],
    }),
    top("actors", "A2", {
      _id: "A2",
      name: "No detected reference",
      type: "npc",
      ownership: {},
      items: [],
      effects: [],
    }),
    top("journal", "J1", {
      _id: "J1",
      name: "Chapter 2 Clue",
      folder: null,
      pages: [{
        _id: "P1",
        name: "Secret page",
        type: "text",
        text: { content: `${rawJournalBody} @UUID[Actor.A1]` },
      }, {
        _id: "P2",
        name: "Calendar page",
        type: "calendaria.calendarnote",
        text: { content: "Calendar body" },
      }, {
        _id: "P3",
        name: "Quest page",
        type: "text",
        flags: { "simple-quest": { state: "private" } },
        text: { content: "Quest body" },
      }, {
        _id: "P4",
        name: "Image page",
        type: "image",
        src: "maps/unused.webp",
      }, {
        _id: "P5",
        name: "Unknown page",
        type: "mystery",
        text: { content: "Unknown body" },
      }],
    }),
    embedded("journal", "journal.pages", ["J1", "P1"], {
      _id: "P1",
      name: "Secret page",
      type: "text",
      text: { content: `${rawJournalBody} @UUID[Actor.A1]` },
    }),
    embedded("journal", "journal.pages", ["J1", "P2"], {
      _id: "P2",
      name: "Calendar page",
      type: "calendaria.calendarnote",
      text: { content: "Calendar body" },
    }),
    embedded("journal", "journal.pages", ["J1", "P3"], {
      _id: "P3",
      name: "Quest page",
      type: "text",
      flags: { "simple-quest": { state: "private" } },
      text: { content: "Quest body" },
    }),
    embedded("journal", "journal.pages", ["J1", "P4"], {
      _id: "P4",
      name: "Image page",
      type: "image",
      src: "maps/unused.webp",
    }),
    embedded("journal", "journal.pages", ["J1", "P5"], {
      _id: "P5",
      name: "Unknown page",
      type: "mystery",
      text: { content: "Unknown body" },
    }),
    top("scenes", "S1", {
      _id: "S1",
      name: "Broken scene",
      folder: null,
      width: 2000,
      height: 1000,
      tokens: [{ _id: "T1", name: "Broken token", actorId: "MISSING", actorLink: true, delta: {} }],
      notes: [],
      walls: [],
      lights: [],
      tiles: [],
      drawings: [],
      regions: [],
      templates: [],
      sounds: [],
    }),
    top("users", "U1", {
      _id: "U1",
      name: "Private player",
      role: 1,
      password: rawPassword,
      passwordHash: `${rawPassword}-hash`,
      auth: { refreshToken: `${rawPassword}-token` },
    }),
    top("settings", "MODULES", {
      _id: "MODULES",
      key: "core.moduleConfiguration",
      value: { example: true },
    }),
  ];
  const snapshot: WorldSnapshot = {
    sourceWorldRoot: resolve(worldRoot),
    snapshotWorldRoot: resolve(snapshotDir),
    sourceTreeHashBefore: "a".repeat(64),
    sourceTreeHashAfter: "a".repeat(64),
    sourceTree: [
      { relativePath: "world.json", bytes: 100, sha256: "1".repeat(64) },
      { relativePath: "data/actors/000001.ldb", bytes: 200, sha256: "2".repeat(64) },
      { relativePath: "maps/unused.webp", bytes: 300, sha256: "3".repeat(64) },
    ],
    snapshotTree: [
      { relativePath: "world.json", bytes: 100, sha256: "1".repeat(64) },
      { relativePath: "data/actors/000001.ldb", bytes: 200, sha256: "2".repeat(64) },
      { relativePath: "maps/unused.webp", bytes: 300, sha256: "3".repeat(64) },
    ],
    collectionBytes: { actors: 200, journal: 150, scenes: 125, users: 75 },
    records,
    openedCollections: [
      {
        scope: "pack",
        relativePath: "packs/Adventure-BxzlyiYWyXYyz9XI",
        recordCount: 0,
        logicalCollections: [],
      },
      {
        scope: "pack",
        relativePath: "packs/Item-BBcWyzo1SRcrMaD1",
        recordCount: 3,
        logicalCollections: ["items"],
      },
    ],
  };
  return {
    root,
    options: { worldRoot, appRoot, outputDir, snapshotDir },
    snapshot,
  };
}

test("writes deterministic privacy-safe Task 3 deliverables with exactly 16 workbook datasets", async () => {
  const fixture = await createFixtureRoot();
  try {
    const manifest = await runWorldFootprintAudit(fixture.options, {
      createSnapshot: async () => fixture.snapshot,
    });
    const output = async (name: string) => readFile(join(fixture.options.outputDir, name), "utf8");
    const workbookText = await output("workbook-source.json");
    const workbookSource = JSON.parse(workbookText) as {
      allowedUserDecisions: string[];
      sheets: Record<string, Array<Record<string, unknown>>>;
    };
    const summary = await output("summary.md");
    const unresolved = await output("unresolved.md");
    const inventoryText = await output("inventory.json");
    const inventory = JSON.parse(inventoryText) as Record<string, unknown>;
    const baseline = JSON.parse(await output("baseline.json")) as {
      status: string;
      target: Record<string, string>;
      sourceTreeHash: string;
      remoteAccessed: boolean;
      performanceLayers: Record<string, unknown>;
      blockers: string[];
    };
    const projection = createTrackedSummaryProjection(fixture.snapshot);

    expect(Object.keys(workbookSource.sheets)).toEqual([...SHEET_NAMES]);
    expect(workbookSource.allowedUserDecisions).toEqual([...DECISIONS]);
    for (const rows of Object.values(workbookSource.sheets)) {
      for (const row of rows) {
        expect(row["User Decision"]).toBe("");
        for (const value of Object.values(row)) {
          if (Array.isArray(value)) {
            expect(value.every((entry) => (
              entry === null || ["string", "number", "boolean"].includes(typeof entry)
            ))).toBe(true);
          } else {
            expect(value === null || typeof value !== "object").toBe(true);
          }
        }
      }
    }
    expect(workbookSource.sheets["Actors"]).toContainEqual(expect.objectContaining({
      id: "A1",
      noSceneToken: true,
      usageStatuses: expect.arrayContaining(["used-uuid"]),
      incomingReferenceCount: 1,
      incomingSourceCount: 1,
      incomingSourceSample: ["JournalEntry.J1.JournalEntryPage.P1"],
      incomingEvidence: ["uuid-link"],
      incomingFieldPathSample: ["text.content"],
      incomingTruncated: false,
      completeReferenceScan: true,
      completeScanEvidence: expect.stringContaining("covered"),
      candidateReason: expect.stringContaining("not a candidate"),
      chapterCategory: "unclassified",
      chapterLabels: [],
      chapterConfidence: "none",
      chapterEvidenceSummary: expect.any(String),
    }));
    expect((workbookSource.sheets["Actors"] ?? []).find((row) => row.id === "A1")).not.toHaveProperty("chapter");
    expect(workbookSource.sheets["Unused Actor Candidates"]).toContainEqual(expect.objectContaining({
      id: "A2",
      referenceEvidence: "no-detected-reference",
      recommendation: "Needs Review",
      risk: expect.stringContaining("static"),
      completeReferenceScan: true,
      candidateReason: expect.stringContaining("candidate"),
    }));
    expect(workbookSource.sheets["Unused Actor Candidates"]).not.toContainEqual(expect.objectContaining({
      id: "A1",
    }));
    expect(manifest.remoteAccessed).toBe(false);
    expect(manifest.generatedAt).toBe("2026-07-24T01:02:03.000Z");
    expect(manifest.generatedAtSemantics).toBe("latest-source-evidence-timestamp");
    expect(manifest.target).toEqual({ worldId: "cor-cotn", foundry: "14.364", dnd5e: "5.3.3" });
    expect(manifest.sourceTreeHashBefore).toBe(manifest.sourceTreeHashAfter);
    expect(Object.keys(manifest.files).sort()).toEqual([
      "baseline.json",
      "chapter-classification.json",
      "inventory.json",
      "references.json",
      "summary.md",
      "unresolved.md",
      "workbook-source.json",
    ]);
    expect(baseline.status).toBe("pending-runtime-sampling");
    expect(baseline.target).toEqual({ worldId: "cor-cotn", foundry: "14.364", dnd5e: "5.3.3" });
    expect(baseline.sourceTreeHash).toBe(fixture.snapshot.sourceTreeHashBefore);
    expect(baseline.remoteAccessed).toBe(false);
    expect(Object.keys(baseline.performanceLayers)).toEqual([
      "disk",
      "initialization",
      "canvasGpu",
      "continuousRuntime",
    ]);
    expect(baseline.blockers.length).toBeGreaterThan(0);
    expect(inventory).not.toHaveProperty("references");
    expect(inventory).not.toHaveProperty("chapters");
    expect(summary).toContain("无 Scene 引用");
    expect(summary).toContain("无任何检测到的引用");
    expect(summary).toContain("磁盘");
    expect(summary).toContain("初始化");
    expect(summary).toContain("Canvas/GPU");
    expect(summary).toContain("持续运行");
    expect(summary).toContain("Adventure");
    expect(summary).toContain("Compendium");
    expect(summary).toContain("Module");
    expect(projection.packaging).toEqual({
      adventureRows: 1,
      compendiumRows: 4,
    });
    expect(summary).toContain("Task 6");
    expect(summary).toContain("不自动删除");
    expect(projection.collections.map((row) => row.name)).toEqual([
      "actors",
      "journal",
      "scenes",
      "settings",
      "users",
    ]);
    expect(projection.collections).toContainEqual(expect.objectContaining({
      name: "actors",
      count: 2,
      levelKeys: 2,
      embedded: 0,
      bytes: 200,
    }));
    expect(projection.collections).toContainEqual(expect.objectContaining({
      name: "journal",
      count: 1,
      levelKeys: 6,
      embedded: 5,
      bytes: 150,
    }));
    expect(projection.collections.map((row) => row.name)).not.toContain("topLevelDocuments");
    expect(projection.collections.map((row) => row.name)).not.toContain("referenceEdges");
    expect(projection.collections.map((row) => row.name)).not.toContain("brokenTokenActorReferences");
    expect((workbookSource.sheets["Overview"] ?? [])
      .filter((row) => row.category === "collection")
      .map((row) => row.collection)).toEqual([
        "actors",
        "journal",
        "scenes",
        "settings",
        "users",
      ]);
    expect(workbookSource.sheets["Broken Token Actor Refs"]).toContainEqual(expect.objectContaining({
      actorId: "MISSING",
      deltaItemCount: 0,
      deltaEffectCount: 0,
      deltaSummary: expect.any(String),
    }));
    expect((workbookSource.sheets["Broken Token Actor Refs"] ?? [])[0]).not.toHaveProperty("deltaStructure");
    expect(workbookSource.sheets["Chapter Classification"]).toContainEqual(expect.objectContaining({
      documentUuid: "Actor.A1",
      chapterCategory: "unclassified",
      chapterLabels: [],
      chapterConfidence: "none",
      chapterEvidenceSummary: expect.any(String),
    }));
    expect((workbookSource.sheets["Chapter Classification"] ?? [])[0]).not.toHaveProperty("evidence");
    expect(workbookSource.sheets["Compendiums and Adventures"]).toContainEqual(expect.objectContaining({
      pack: "Adventure-BxzlyiYWyXYyz9XI",
      type: "Adventure",
      sampleInspected: true,
      sampleRecordCount: 0,
      sampleInspectionStatus: "inspected-empty",
    }));
    expect(projection.journals.moduleOwnerCounts).toEqual([
      { label: "calendaria", count: 1 },
      { label: "core", count: 2 },
      { label: "simple-quest", count: 1 },
      { label: "unspecified", count: 1 },
    ]);
    expect(summary).toContain("calendaria=1");
    expect(summary).toContain("simple-quest=1");
    expect(summary).toContain("core=2");
    expect(summary).toContain("unspecified=1");
    expect(unresolved).toContain("静态扫描不能证明动态名称查找绝对安全");
    expect(inventoryText.endsWith("\n")).toBe(true);
    expect(workbookText.endsWith("\n")).toBe(true);
    for (const [name, expectedHash] of Object.entries(manifest.files)) {
      const actualHash = createHash("sha256").update(await output(name), "utf8").digest("hex");
      expect(actualHash).toBe(expectedHash);
    }

    for (const secret of [
      "RAW-JOURNAL-BODY-MUST-NOT-LEAK",
      "RAW-USER-PASSWORD-MUST-NOT-LEAK",
      "passwordHash",
      "refreshToken",
    ]) {
      expect(summary).not.toContain(secret);
      expect(JSON.stringify(projection)).not.toContain(secret);
    }

    const requiredFiles = [
      "inventory.json",
      "references.json",
      "chapter-classification.json",
      "baseline.json",
      "unresolved.md",
      "summary.md",
      "workbook-source.json",
      "audit-manifest.json",
    ];
    const firstRun = await Promise.all(requiredFiles.map(output));
    await runWorldFootprintAudit(fixture.options, {
      createSnapshot: async () => fixture.snapshot,
    });
    const secondRun = await Promise.all(requiredFiles.map(output));
    expect(secondRun).toEqual(firstRun);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("scopes duplicate embedded IDs by namespace and complete parent chain", () => {
  const repeatedLeafUnderDifferentParents = [
    top("actors", "A1", { _id: "A1", items: ["I1"], effects: [] }),
    top("actors", "A2", { _id: "A2", items: ["I1"], effects: [] }),
    embedded("actors", "actors.items", ["A1", "I1"], { _id: "I1", effects: [] }),
    embedded("actors", "actors.items", ["A2", "I1"], { _id: "I1", effects: [] }),
  ];
  const uniqueSnapshot: WorldSnapshot = {
    sourceWorldRoot: "I:\\fixture\\source",
    snapshotWorldRoot: "I:\\fixture\\snapshot",
    sourceTreeHashBefore: "a".repeat(64),
    sourceTreeHashAfter: "a".repeat(64),
    sourceTree: [],
    snapshotTree: [],
    collectionBytes: { actors: 1 },
    records: repeatedLeafUnderDifferentParents,
  };
  expect(createAuditValidation(uniqueSnapshot, analyzeWorld(uniqueSnapshot)).duplicateIds).toEqual([]);

  const duplicateRecord = embedded(
    "actors",
    "actors.items.effects",
    ["A1", "I1", "E1"],
    { _id: "E1" },
  );
  const duplicateSnapshot = {
    ...uniqueSnapshot,
    records: [...repeatedLeafUnderDifferentParents, duplicateRecord, { ...duplicateRecord }],
  };
  expect(createAuditValidation(duplicateSnapshot, analyzeWorld(duplicateSnapshot)).duplicateIds).toEqual([
    {
      namespace: "actors.items.effects",
      id: "A1.I1.E1",
      count: 2,
    },
  ]);
});

test("keeps opened pack records out of world collection validation", () => {
  const worldActor = top("actors", "A1", { _id: "A1", name: "World actor" });
  const packActor = {
    ...top("actors", "A1", { _id: "A1", name: "Pack actor" }),
    storageScope: "pack" as const,
    storageRelativePath: "packs/chapter-bundle",
  };
  const fixtureSnapshot: WorldSnapshot = {
    sourceWorldRoot: "I:\\fixture\\source",
    snapshotWorldRoot: "I:\\fixture\\snapshot",
    sourceTreeHashBefore: "a".repeat(64),
    sourceTreeHashAfter: "a".repeat(64),
    sourceTree: [],
    snapshotTree: [],
    collectionBytes: { actors: 1 },
    records: [worldActor, packActor],
    openedCollections: [{
      scope: "pack",
      relativePath: "packs/chapter-bundle",
      recordCount: 1,
      logicalCollections: ["actors"],
    }],
  };

  const validation = createAuditValidation(fixtureSnapshot, analyzeWorld(fixtureSnapshot));
  expect(validation.collectionKeyCrossChecks).toEqual([{
    name: "actors",
    levelKeys: 1,
    topLevel: 1,
    embedded: 0,
    matchesParentArrays: true,
  }]);
  expect(validation.duplicateIds).toEqual([]);
});

test("rejects unknown CLI arguments, wrong pinned versions, and destinations inside the source world", async () => {
  expect(() => parseAuditCliArguments([
    "--world-root", "world",
    "--app-root", "app",
    "--output-dir", "out",
    "--snapshot-dir", "snapshot",
    "--remote", "true",
  ])).toThrow(/unknown argument.*--remote/i);
  expect(() => parseAuditCliArguments([
    "--world-root", "world",
    "--app-root", "app",
    "--output-dir", "out",
  ])).toThrow(/--snapshot-dir/);

  const fixture = await createFixtureRoot();
  try {
    const injected = {
      createSnapshot: async () => fixture.snapshot,
    };
    await expect(runWorldFootprintAudit({
      ...fixture.options,
      outputDir: join(fixture.options.worldRoot, "audit-output"),
    }, injected)).rejects.toThrow(/output.*inside.*source world/i);
    await expect(runWorldFootprintAudit({
      ...fixture.options,
      snapshotDir: join(fixture.options.worldRoot, "snapshot"),
    }, injected)).rejects.toThrow(/snapshot.*inside.*source world/i);

    await writeFile(
      join(fixture.options.appRoot, "package.json"),
      `${JSON.stringify({ name: "foundryvtt", version: "14.365.0" }, null, 2)}\n`,
      "utf8",
    );
    await expect(runWorldFootprintAudit(fixture.options, injected)).rejects.toThrow(/Foundry 14\.364/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects output and snapshot destinations that are ancestors of the source world", async () => {
  const fixture = await createFixtureRoot();
  try {
    let createSnapshotCalls = 0;
    const injected = {
      createSnapshot: async () => {
        createSnapshotCalls += 1;
        return fixture.snapshot;
      },
    };
    const sourceParent = dirname(fixture.options.worldRoot);
    const projectLikeAncestor = fixture.root;
    const worldManifestBefore = await readFile(join(fixture.options.worldRoot, "world.json"), "utf8");

    await expect(runWorldFootprintAudit({
      ...fixture.options,
      outputDir: sourceParent,
    }, injected)).rejects.toThrow(/output.*overlap.*source world/i);
    await expect(runWorldFootprintAudit({
      ...fixture.options,
      outputDir: projectLikeAncestor,
    }, injected)).rejects.toThrow(/output.*overlap.*source world/i);
    await expect(runWorldFootprintAudit({
      ...fixture.options,
      snapshotDir: sourceParent,
    }, injected)).rejects.toThrow(/snapshot.*overlap.*source world/i);

    expect(createSnapshotCalls).toBe(0);
    expect(await readFile(join(fixture.options.worldRoot, "world.json"), "utf8")).toBe(worldManifestBefore);
    for (const rejectedOutput of [sourceParent, projectLikeAncestor]) {
      await expect(readFile(join(rejectedOutput, "audit-manifest.json"), "utf8"))
        .rejects.toMatchObject({ code: "ENOENT" });
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects a destination whose junction resolves to a source-world ancestor", async () => {
  if (process.platform !== "win32") return;

  const fixture = await createFixtureRoot();
  try {
    const sourceParent = dirname(fixture.options.worldRoot);
    const junction = join(fixture.root, "physical-source-parent");
    await symlink(sourceParent, junction, "junction");
    let createSnapshotCalls = 0;

    await expect(runWorldFootprintAudit({
      ...fixture.options,
      outputDir: junction,
    }, {
      createSnapshot: async () => {
        createSnapshotCalls += 1;
        return fixture.snapshot;
      },
    })).rejects.toThrow(/output.*overlap.*source world/i);
    expect(createSnapshotCalls).toBe(0);
    await expect(readFile(join(junction, "audit-manifest.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("allows sibling evidence with a snapshot nested under the output directory", async () => {
  const fixture = await createFixtureRoot();
  try {
    const manifest = await runWorldFootprintAudit(fixture.options, {
      createSnapshot: async () => fixture.snapshot,
    });

    expect(manifest.target.worldId).toBe("cor-cotn");
    expect((await stat(join(fixture.options.outputDir, "audit-manifest.json"))).isFile()).toBe(true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("removes a stale manifest before partial promotion and preserves unrelated output files", async () => {
  const fixture = await createFixtureRoot();
  try {
    const runtime = { createSnapshot: async () => fixture.snapshot };
    await runWorldFootprintAudit(fixture.options, runtime);
    const manifestPath = join(fixture.options.outputDir, "audit-manifest.json");
    expect((await stat(manifestPath)).isFile()).toBe(true);
    const foreignPath = join(fixture.options.outputDir, "operator-notes.txt");
    await writeFile(foreignPath, "preserve me\n", "utf8");

    await expect(runWorldFootprintAudit(fixture.options, {
      ...runtime,
      beforePromoteFile: async (_name: string, index: number) => {
        if (index === 1) throw new Error("injected mid-promotion failure");
      },
    })).rejects.toThrow(/injected mid-promotion failure/);

    await expect(readFile(manifestPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(foreignPath, "utf8")).toBe("preserve me\n");
    expect((await readdir(fixture.options.outputDir)).some(
      (name) => name.startsWith(".world-audit-report-staging-"),
    )).toBe(false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("rejects complete baselines made from arbitrary single-value metrics", async () => {
  const fixture = await createFixtureRoot();
  try {
    const baselineFile = join(fixture.root, "pseudo-complete.json");
    await writeFile(baselineFile, `${JSON.stringify({
      status: "complete",
      target: { worldId: "cor-cotn", foundry: "14.364", dnd5e: "5.3.3" },
      sourceTreeHash: fixture.snapshot.sourceTreeHashBefore,
      remoteAccessed: false,
      performanceLayers: {
        disk: { status: "measured", metrics: { sourceTreeBytes: 600 } },
        initialization: { status: "measured", metrics: { readyMs: 1200 } },
        canvasGpu: { status: "measured", metrics: { frameMsP95: 18 } },
        continuousRuntime: { status: "measured", metrics: { heapDeltaBytes: 1024 } },
      },
      blockers: [],
    }, null, 2)}\n`, "utf8");

    await expect(runWorldFootprintAudit({
      ...fixture.options,
      baselineFile,
    }, {
      createSnapshot: async () => fixture.snapshot,
    })).rejects.toThrow(/baseline/i);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("validates pending, partial, and complete baselines against the exact snapshot", async () => {
  const fixture = await createFixtureRoot();
  try {
    const runtime = { createSnapshot: async () => fixture.snapshot };
    const base = {
      target: { worldId: "cor-cotn", foundry: "14.364", dnd5e: "5.3.3" },
      sourceTreeHash: fixture.snapshot.sourceTreeHashBefore,
      remoteAccessed: false,
    };
    const measured = (metrics: Record<string, unknown>) => ({
      status: "measured",
      metrics,
    });
    const blocked = (note: string) => ({ status: "blocked", metrics: {}, note });
    const memory = (browserProcessMemoryBytes: number, performanceMemoryUsedJsHeapBytes: number | null) => ({
      browserProcessMemoryBytes,
      performanceMemoryUsedJsHeapBytes,
    });
    const diskMetrics = {
      sourceTreeBytes: 600,
      snapshotTreeBytes: 600,
      snapshotCopyDurationMs: 42.5,
    };
    const initializationMetrics = {
      serverStartToHttpReadyMs: 900.25,
      browserNavigationToWorldReadyMs: 1200.5,
      requestCount: 42,
      responseBytes: 123_456,
      largestResponseBytes: 32_768,
      browserProcessMemoryBytes: 200_000_000,
      performanceMemoryUsedJsHeapBytes: 75_000_000,
      performanceMemoryTotalJsHeapBytes: 100_000_000,
      performanceMemoryJsHeapSizeLimitBytes: 4_000_000_000,
    };
    const canvasMetrics = {
      activeSceneId: "S1",
      tokenCount: 1,
      wallCount: 0,
      lightCount: 0,
      tileCount: 0,
      textureCandidateCount: 1,
      animationCandidateCount: 0,
      consoleErrorCount: 0,
      consoleWarningCount: 2,
      repeatedWarningCount: 1,
    };
    const continuousMetrics = {
      idleIntervalMs: 60_000,
      idleSamples: [
        { elapsedMs: 0, ...memory(200_000_000, 75_000_000) },
        { elapsedMs: 30_000, ...memory(201_000_000, 75_500_000) },
        { elapsedMs: 60_000, ...memory(202_000_000, 76_000_000) },
      ],
      shortSequenceLabel: "open S1, open Actor A1, return to S1",
      shortSequenceBefore: memory(202_000_000, 76_000_000),
      shortSequenceAfter: memory(204_000_000, 77_500_000),
      shortSequenceDelta: memory(2_000_000, 1_500_000),
    };
    const partial = {
      ...base,
      status: "partial",
      performanceLayers: {
        disk: measured(diskMetrics),
        initialization: measured(initializationMetrics),
        canvasGpu: blocked("Task 4 scene sample pending"),
        continuousRuntime: blocked("Long-session sample pending"),
      },
      blockers: [
        { layer: "canvasGpu", reason: "Task 4 scene sample pending" },
        { layer: "continuousRuntime", reason: "Long-session sample pending" },
      ],
    };
    const complete = {
      ...base,
      status: "complete",
      performanceLayers: {
        disk: measured(diskMetrics),
        initialization: measured(initializationMetrics),
        canvasGpu: measured(canvasMetrics),
        continuousRuntime: measured(continuousMetrics),
      },
      blockers: [],
    };

    const packScene = {
      ...top("scenes", "S1", {
        _id: "S1",
        name: "Pack-only scene must not satisfy world baseline",
        tokens: [{ _id: "PT1" }, { _id: "PT2" }],
        walls: [{}],
        lights: [],
        tiles: [],
      }),
      storageScope: "pack" as const,
      storageRelativePath: "packs/chapter-bundle",
    };
    const packOnlySceneSnapshot: WorldSnapshot = {
      ...fixture.snapshot,
      records: [
        ...fixture.snapshot.records.filter((record) => (
          record.collection !== "scenes" || record.namespace !== "scenes"
        )),
        packScene,
      ],
    };
    expect(() => validateAuditBaseline({
      ...complete,
      performanceLayers: {
        ...complete.performanceLayers,
        canvasGpu: measured({
          ...canvasMetrics,
          tokenCount: 2,
          wallCount: 1,
        }),
      },
    }, packOnlySceneSnapshot)).toThrow(/top-level Scene/i);

    const sameIdPackFirstSnapshot: WorldSnapshot = {
      ...fixture.snapshot,
      records: [packScene, ...fixture.snapshot.records],
    };
    expect(validateAuditBaseline(complete, sameIdPackFirstSnapshot)
      .performanceLayers.canvasGpu).toEqual({ status: "measured", metrics: canvasMetrics });

    for (const [name, baseline] of Object.entries({ partial, complete })) {
      const baselineFile = join(fixture.root, `${name}.json`);
      await writeFile(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
      const outputDir = join(fixture.root, "baseline-output", name);
      await runWorldFootprintAudit({
        ...fixture.options,
        outputDir,
        snapshotDir: join(outputDir, "snapshot"),
        baselineFile,
      }, runtime);
      expect(JSON.parse(await readFile(join(outputDir, "baseline.json"), "utf8")).status).toBe(name);
    }

    const invalidBaselines = [
      { status: "complete" },
      {
        ...complete,
        performanceLayers: {
          disk: measured({ sourceTreeBytes: 600 }),
          initialization: measured({ readyMs: 1200 }),
          canvasGpu: measured({ frameMsP95: 18 }),
          continuousRuntime: measured({ heapDeltaBytes: 1024 }),
        },
      },
      { ...complete, unexpected: "not part of the baseline schema" },
      { ...complete, target: { ...complete.target, extraVersion: "5.3.3" } },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          initialization: {
            ...complete.performanceLayers.initialization,
            samples: [],
          },
        },
      },
      { ...complete, target: { ...complete.target, dnd5e: "5.3.2" } },
      { ...complete, sourceTreeHash: "b".repeat(64) },
      { ...complete, remoteAccessed: true },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          initialization: { status: "measured", metrics: [] },
        },
      },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          disk: measured({ ...diskMetrics, snapshotCopyDurationMs: -1 }),
        },
      },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          disk: measured({ ...diskMetrics, sourceTreeBytes: 599 }),
        },
      },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          disk: measured({ ...diskMetrics, inventedMetric: 1 }),
        },
      },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          initialization: measured({ ...initializationMetrics, requestCount: 1.5 }),
        },
      },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          canvasGpu: measured({ ...canvasMetrics, activeSceneId: "" }),
        },
      },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          canvasGpu: measured({ ...canvasMetrics, activeSceneId: "NOT-A-SCENE" }),
        },
      },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          canvasGpu: measured({ ...canvasMetrics, tokenCount: 2 }),
        },
      },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          continuousRuntime: measured({
            ...continuousMetrics,
            idleSamples: [continuousMetrics.idleSamples[0]],
          }),
        },
      },
      {
        ...complete,
        performanceLayers: {
          ...complete.performanceLayers,
          continuousRuntime: measured({
            ...continuousMetrics,
            shortSequenceDelta: memory(1, 1),
          }),
        },
      },
      {
        ...partial,
        performanceLayers: {
          ...partial.performanceLayers,
          initialization: measured({ readyMs: 1200 }),
        },
      },
      {
        ...partial,
        blockers: [],
      },
      {
        ...partial,
        blockers: [{ layer: "canvasGpu", reason: "Only one incomplete layer is acknowledged" }],
      },
      {
        ...partial,
        blockers: [
          ...partial.blockers,
          { layer: "disk", reason: "Measured layers cannot have blockers" },
        ],
      },
      {
        ...partial,
        status: "pending-runtime-sampling",
      },
    ];
    for (const [index, baseline] of invalidBaselines.entries()) {
      const baselineFile = join(fixture.root, `invalid-${index}.json`);
      await writeFile(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
      await expect(runWorldFootprintAudit({
        ...fixture.options,
        outputDir: join(fixture.root, "invalid-output", String(index)),
        snapshotDir: join(fixture.root, "invalid-output", String(index), "snapshot"),
        baselineFile,
      }, runtime)).rejects.toThrow(/baseline/i);
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
