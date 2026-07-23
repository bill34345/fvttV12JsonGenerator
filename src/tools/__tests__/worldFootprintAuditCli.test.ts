import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  parseAuditCliArguments,
  runWorldFootprintAudit,
  type AuditCliOptions,
} from "../worldFootprintAudit";
import { createTrackedSummaryProjection } from "../world-audit/report";
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
    }, null, 2)}\n`,
    "utf8",
  );
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
      }],
    }),
    embedded("journal", "journal.pages", ["J1", "P1"], {
      _id: "P1",
      name: "Secret page",
      type: "text",
      text: { content: `${rawJournalBody} @UUID[Actor.A1]` },
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
    const generatedAt = "2026-07-24T00:00:00.000Z";
    const manifest = await runWorldFootprintAudit(fixture.options, {
      createSnapshot: async () => fixture.snapshot,
      generatedAt: () => generatedAt,
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
    const baseline = JSON.parse(await output("baseline.json")) as { status: string };
    const projection = createTrackedSummaryProjection(fixture.snapshot);

    expect(Object.keys(workbookSource.sheets)).toEqual([...SHEET_NAMES]);
    expect(workbookSource.allowedUserDecisions).toEqual([...DECISIONS]);
    for (const rows of Object.values(workbookSource.sheets)) {
      for (const row of rows) expect(row["User Decision"]).toBe("");
    }
    expect(workbookSource.sheets["Actors"]).toContainEqual(expect.objectContaining({
      id: "A1",
      noSceneToken: true,
      usageStatuses: expect.arrayContaining(["used-uuid"]),
    }));
    expect(workbookSource.sheets["Unused Actor Candidates"]).toContainEqual(expect.objectContaining({
      id: "A2",
      referenceEvidence: "no-detected-reference",
      recommendation: "Needs Review",
      risk: expect.stringContaining("static"),
    }));
    expect(workbookSource.sheets["Unused Actor Candidates"]).not.toContainEqual(expect.objectContaining({
      id: "A1",
    }));
    expect(manifest.remoteAccessed).toBe(false);
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
    expect(summary).toContain("不自动删除");
    expect(unresolved).toContain("静态扫描不能证明动态名称查找绝对安全");
    expect(inventoryText.endsWith("\n")).toBe(true);
    expect(workbookText.endsWith("\n")).toBe(true);

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
      generatedAt: () => generatedAt,
    });
    const secondRun = await Promise.all(requiredFiles.map(output));
    expect(secondRun).toEqual(firstRun);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
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
      generatedAt: () => "2026-07-24T00:00:00.000Z",
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
