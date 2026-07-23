import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeWorld } from "../world-audit/inventory";
import type { LevelRecord, TreeEntry, WorldSnapshot } from "../world-audit/model";

function top(
  collection: string,
  id: string,
  value: Record<string, unknown>,
): LevelRecord {
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

function tree(relativePath: string): TreeEntry {
  return { relativePath, bytes: 1, sha256: relativePath.padEnd(64, "0").slice(0, 64) };
}

function snapshot(
  records: LevelRecord[],
  snapshotTree: TreeEntry[] = [],
  snapshotWorldRoot = "I:\\fixture\\snapshot",
): WorldSnapshot {
  return {
    sourceWorldRoot: "I:\\fixture\\source",
    snapshotWorldRoot,
    sourceTreeHashBefore: "before",
    sourceTreeHashAfter: "before",
    sourceTree: snapshotTree,
    snapshotTree,
    collectionBytes: {},
    records,
  };
}

function rowById(rows: Array<Record<string, unknown>>, id: string): Record<string, unknown> {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`Missing analysis row ${id}`);
  return row;
}

test("classifies reference evidence, Actor cleanup status, chapters, language, and broken Tokens", () => {
  const records = [
    top("folders", "F1", { _id: "F1", name: "Chapter 2", type: "Scene", folder: null }),
    top("folders", "F2", { _id: "F2", name: "Chapter 3", type: "Scene", folder: null }),
    top("scenes", "S1", {
      _id: "S1",
      name: "Road",
      folder: "F1",
      width: 3000,
      height: 2000,
      background: { src: "maps/road.webp" },
      foreground: null,
      tokens: [
        { _id: "T1", actorId: "A1", actorLink: true, delta: {} },
        {
          _id: "T2",
          actorId: "MISSING",
          actorLink: true,
          delta: { items: [{ _id: "I1" }], effects: [{ _id: "E1" }] },
        },
      ],
      notes: [],
      walls: [{}],
      lights: [{}],
      tiles: [],
      drawings: [],
      regions: [],
      templates: [],
      sounds: [],
    }),
    top("scenes", "S2", {
      _id: "S2",
      name: "Cavern",
      folder: "F1",
      tokens: [{ _id: "T3", actorId: "A6", actorLink: true, delta: {} }],
      notes: [],
      walls: [],
      lights: [],
      tiles: [],
      drawings: [],
      regions: [],
      templates: [],
      sounds: [],
    }),
    top("scenes", "S3", {
      _id: "S3",
      name: "Shrine",
      folder: "F2",
      tokens: [{ _id: "T4", actorId: "A6", actorLink: true, delta: {} }],
      notes: [],
      walls: [],
      lights: [],
      tiles: [],
      drawings: [],
      regions: [],
      templates: [],
      sounds: [],
    }),
    top("actors", "A1", {
      _id: "A1",
      name: "Used",
      type: "npc",
      folder: null,
      ownership: {},
      items: [],
      effects: [],
    }),
    top("actors", "A2", {
      _id: "A2",
      name: "Journal Used",
      type: "npc",
      folder: null,
      ownership: {},
      items: [],
      effects: [],
    }),
    top("actors", "A3", {
      _id: "A3",
      name: "Candidate",
      type: "npc",
      folder: null,
      ownership: {},
      items: [],
      effects: [],
      system: { details: { biography: { value: "Candidate appears in ordinary biography prose." } } },
    }),
    top("actors", "A4", {
      _id: "A4",
      name: "Player",
      type: "character",
      folder: null,
      ownership: { U1: 3 },
      items: [],
      effects: [],
    }),
    top("actors", "A5", {
      _id: "A5",
      name: "Unrelated",
      type: "npc",
      folder: null,
      ownership: {},
      items: [],
      effects: [],
      system: { details: { biography: { value: "abcdefghijklmnop is just prose." } } },
    }),
    top("actors", "A6", {
      _id: "A6",
      name: "Shared Creature",
      type: "npc",
      folder: null,
      ownership: {},
      items: [],
      effects: [],
    }),
    top("actors", "A7", {
      _id: "A7",
      name: "Default Player Owned",
      type: "character",
      folder: null,
      ownership: { default: 3 },
      items: [],
      effects: [],
    }),
    top("users", "U1", {
      _id: "U1",
      name: "Redacted in tracked report",
      character: "A4",
      role: 1,
      password: "must-not-leak.webp @UUID[Actor.A2]",
      passwordSalt: "must-not-leak-either",
    }),
    top("journal", "J1", {
      _id: "J1",
      name: "Clue",
      folder: null,
      pages: [
        {
          _id: "P1",
          type: "text",
          text: { content: "<p>@UUID[Actor.A2]{link} English 中文</p>" },
        },
      ],
    }),
    top("macros", "M1", {
      _id: "M1",
      name: "Lookup",
      command: "game.actors.getName('Candidate')",
    }),
  ];

  const analysis = analyzeWorld(snapshot(records, [
    tree("world.json"),
    tree("maps/road.webp"),
    tree("maps/unused.webp"),
    tree("modules/example/maps/external.webp"),
  ]));
  const actor = (id: string) => rowById(analysis.actors, id);

  expect(actor("A1").usageStatuses).toContain("used-structured");
  expect(actor("A1").chapter).toMatchObject({ category: "explicit-chapter", confidence: "high" });
  expect(actor("A2").usageStatuses).toContain("used-uuid");
  expect(actor("A2").noSceneToken).toBe(true);
  expect(actor("A3").usageStatuses).toEqual(expect.arrayContaining(["possible-script-reference"]));
  expect(actor("A3").usageStatuses).not.toContain("no-detected-reference");
  expect(actor("A4").usageStatuses).toContain("player-protected");
  expect(actor("A7").usageStatuses).toContain("player-protected");
  expect(actor("A5").usageStatuses).toContain("no-detected-reference");
  expect(actor("A6").usageStatuses).toContain("chapter-shared");
  expect(actor("A6").chapter).toMatchObject({
    category: "chapter-shared",
    chapterLabels: ["Chapter 2", "Chapter 3"],
    confidence: "high",
  });
  expect(analysis.brokenTokenActorRefs).toEqual([
    expect.objectContaining({
      actorId: "MISSING",
      tokenId: "T2",
      deltaItemCount: 1,
      deltaEffectCount: 1,
    }),
  ]);
  expect(analysis.journalPages[0]?.language).toBe("mixed");
  expect(analysis.unusedActorCandidates).not.toContainEqual(expect.objectContaining({ id: "A3" }));
  expect(analysis.unusedActorCandidates).toContainEqual(expect.objectContaining({ id: "A5" }));
  expect(analysis.references).toContainEqual(expect.objectContaining({
    sourceUuid: "JournalEntry.J1.JournalEntryPage.P1",
    targetUuid: "Actor.A2",
    evidence: "uuid-link",
    verifiedTarget: true,
  }));
  expect(analysis.references).not.toContainEqual(expect.objectContaining({
    targetUuid: expect.stringContaining("abcdefghijklmnop"),
    verifiedTarget: true,
  }));
  expect(analysis.references).not.toContainEqual(expect.objectContaining({
    sourceUuid: "User.U1",
    fieldPath: expect.stringMatching(/password|authentication/i),
  }));
  expect(analysis.scenes).toContainEqual(expect.objectContaining({
    id: "S1",
    tokenCount: 2,
    wallCount: 1,
    lightCount: 1,
    tokenDeltaItemCount: 1,
    tokenDeltaEffectCount: 1,
    pixelWidth: 3000,
    pixelHeight: 2000,
    gpuRisk: expect.stringContaining("estimate"),
  }));
  expect(analysis.assets).toContainEqual(expect.objectContaining({
    path: "maps/unused.webp",
    unreferencedCandidate: true,
  }));
  expect(analysis.assets).not.toContainEqual(expect.objectContaining({
    path: "modules/example/maps/external.webp",
    unreferencedCandidate: true,
  }));
  expect(JSON.stringify(analysis)).not.toContain("must-not-leak");
});

test("limits exact name matching to scripts and marks duplicate names for manual review", () => {
  const records = [
    top("actors", "A1", { _id: "A1", name: "Duplicate", ownership: {}, items: [], effects: [] }),
    top("actors", "A2", { _id: "A2", name: "Duplicate", ownership: {}, items: [], effects: [] }),
    top("actors", "A3", {
      _id: "A3",
      name: "Candidate",
      ownership: {},
      items: [],
      effects: [],
      system: { biography: { value: "Duplicate Candidate" } },
    }),
    top("macros", "M1", { _id: "M1", name: "Lookup", command: "find('Duplicate')" }),
  ];

  const analysis = analyzeWorld(snapshot(records));

  for (const id of ["A1", "A2"]) {
    expect(rowById(analysis.actors, id).usageStatuses).toEqual(expect.arrayContaining([
      "possible-script-reference",
      "manual-review-required",
    ]));
  }
  expect(rowById(analysis.actors, "A3").usageStatuses).toContain("no-detected-reference");
});

test("reports folder missing parents, wrong types, cycles, and missing document folders", () => {
  const records = [
    top("folders", "ROOT", { _id: "ROOT", name: "Chapter 1", type: "Actor", folder: null }),
    top("folders", "MISSING_PARENT", {
      _id: "MISSING_PARENT",
      name: "Orphans",
      type: "Actor",
      folder: "NOPE",
    }),
    top("folders", "C1", { _id: "C1", name: "Cycle 1", type: "Actor", folder: "C2" }),
    top("folders", "C2", { _id: "C2", name: "Cycle 2", type: "Actor", folder: "C1" }),
    top("folders", "WRONG", { _id: "WRONG", name: "Wrong", type: "Scene", folder: "ROOT" }),
    top("actors", "A1", {
      _id: "A1",
      name: "Foldered",
      folder: "ROOT",
      ownership: {},
      items: [],
      effects: [],
    }),
    top("actors", "A2", {
      _id: "A2",
      name: "Missing Folder",
      folder: "NOT_A_FOLDER",
      ownership: {},
      items: [],
      effects: [],
    }),
  ];

  const analysis = analyzeWorld(snapshot(records));

  expect(rowById(analysis.actors, "A1").folderPath).toBe("Chapter 1");
  expect(analysis.unresolved).toEqual(expect.arrayContaining([
    expect.stringMatching(/missing parent.*NOPE/i),
    expect.stringMatching(/cycle/i),
    expect.stringMatching(/wrong-type parent/i),
    expect.stringMatching(/document.*A2.*missing folder/i),
  ]));
});

test("counts top-level and embedded records independently and keeps Cards in World Items", () => {
  const records = [
    top("actors", "A1", {
      _id: "A1",
      name: "Embedded Mismatch",
      folder: null,
      ownership: {},
      items: [{ _id: "I1", name: "Parent Item", effects: [] }],
      effects: [],
    }),
    embedded("actors", "actors.items", ["A1", "I1"], {
      _id: "I1",
      name: "Stored Item",
      effects: [],
    }),
    embedded("actors", "actors.items", ["A1", "I2"], {
      _id: "I2",
      name: "Extra Stored Item",
      effects: [],
    }),
    top("cards", "C1", {
      _id: "C1",
      name: "Deck",
      folder: null,
      cards: [{ _id: "CARD1", name: "One", faces: [{ _id: "FACE1", name: "Front" }] }],
    }),
  ];

  const analysis = analyzeWorld(snapshot(records));

  expect(analysis.overview.actors).toBe(1);
  expect(analysis.overview.cards).toBe(1);
  expect(analysis.overview["actors.items.parentArray"]).toBe(1);
  expect(analysis.overview["actors.items.embeddedKeys"]).toBe(2);
  expect(analysis.unresolved).toContainEqual(expect.stringMatching(/actors\.items.*mismatch/i));
  expect(analysis.worldItems).toContainEqual(expect.objectContaining({
    id: "C1",
    "Document Kind": "Card",
    embeddedCardCount: 1,
    embeddedFaceCount: 1,
  }));
});

test("labels journal text after stripping HTML", () => {
  const records = [
    top("journal", "J1", {
      _id: "J1",
      name: "Languages",
      pages: [
        { _id: "P1", type: "text", text: { content: "<p>中文</p>" } },
        { _id: "P2", type: "text", text: { content: "<strong>English</strong>" } },
        { _id: "P3", type: "text", text: { content: "<p>&nbsp;</p>" } },
        { _id: "P4", type: "text", text: { content: "<p>123 !!!</p>" } },
      ],
    }),
  ];

  const analysis = analyzeWorld(snapshot(records));

  expect(analysis.journalPages.map((row) => row.language)).toEqual([
    "CJK-present",
    "Latin-only",
    "no-text",
    "other-text",
  ]);
});

test("recognizes Compendium sources, generic Scene Note fields, origins, and Card faces as structured evidence", () => {
  const records = [
    top("actors", "A1", {
      _id: "A1",
      name: "Noted Actor",
      folder: null,
      ownership: {},
      items: [],
      effects: [],
    }),
    top("scenes", "S1", {
      _id: "S1",
      name: "Notes",
      folder: null,
      tokens: [],
      notes: [{ _id: "N1", documentName: "Actor", documentId: "A1" }],
      walls: [],
      lights: [],
      tiles: [],
      drawings: [],
      regions: [],
      templates: [],
      sounds: [],
    }),
    top("items", "I1", {
      _id: "I1",
      name: "Origin Item",
      folder: null,
      effects: [{ _id: "E1", origin: "Actor.A1" }],
    }),
    top("adventures", "ADV1", {
      _id: "ADV1",
      name: "Imported",
      _stats: { compendiumSource: "Compendium.cotn.world-audit.Adventure.SOURCE1" },
    }),
    top("cards", "C1", {
      _id: "C1",
      name: "Deck",
      cards: [{ _id: "CARD1", name: "One", faces: [{ _id: "FACE1", name: "Front" }] }],
    }),
  ];

  const analysis = analyzeWorld(snapshot(records));

  expect(analysis.references).toContainEqual(expect.objectContaining({
    sourceUuid: "Scene.S1",
    targetUuid: "Actor.A1",
    evidence: "structured-field",
    fieldPath: "notes[0].documentId",
    verifiedTarget: true,
  }));
  expect(analysis.references).toContainEqual(expect.objectContaining({
    sourceUuid: "Adventure.ADV1",
    targetUuid: "Compendium.cotn.world-audit.Adventure.SOURCE1",
    evidence: "explicit-document-id",
  }));
  expect(analysis.references).toContainEqual(expect.objectContaining({
    sourceUuid: "Item.I1.ActiveEffect.E1",
    targetUuid: "Actor.A1",
    evidence: "structured-field",
    fieldPath: "origin",
  }));
  expect(analysis.references).not.toContainEqual(expect.objectContaining({
    sourceUuid: "Item.I1.ActiveEffect.E1",
    targetUuid: "Actor.A1",
    evidence: "uuid-link",
    fieldPath: "origin",
  }));
  expect(analysis.references).toContainEqual(expect.objectContaining({
    sourceUuid: "Cards.C1.Card.CARD1",
    targetUuid: "Cards.C1.Card.CARD1.CardFace.FACE1",
    evidence: "structured-field",
  }));
});

test("reports declared and physical packs and keeps Adventure sample read-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-analysis-"));
  await mkdir(join(root, "packs", "declared-pack"), { recursive: true });
  await mkdir(join(root, "packs", "undeclared-pack"), { recursive: true });
  await mkdir(join(root, "packs", "Adventure-BxzlyiYWyXYyz9XI"), { recursive: true });
  await writeFile(join(root, "world.json"), JSON.stringify({
    packs: [{ name: "declared-pack", label: "Declared", path: "packs/declared-pack", type: "Item" }],
  }));

  const analysis = analyzeWorld(snapshot(
    [top("adventures", "BxzlyiYWyXYyz9XI", { _id: "BxzlyiYWyXYyz9XI", name: "Sample" })],
    [
      tree("world.json"),
      tree("packs/declared-pack/000001.ldb"),
      tree("packs/undeclared-pack/000001.ldb"),
      tree("packs/Adventure-BxzlyiYWyXYyz9XI/000001.ldb"),
    ],
    root,
  ));

  expect(analysis.compendiumsAndAdventures).toContainEqual(expect.objectContaining({
    pack: "declared-pack",
    declared: true,
    physical: true,
  }));
  expect(analysis.compendiumsAndAdventures).toContainEqual(expect.objectContaining({
    pack: "undeclared-pack",
    declared: false,
    physical: true,
  }));
  expect(analysis.compendiumsAndAdventures).toContainEqual(expect.objectContaining({
    pack: "Adventure-BxzlyiYWyXYyz9XI",
    sampleInspected: true,
    modified: false,
  }));
  expect(analysis.unresolved).toContainEqual(expect.stringMatching(/undeclared pack directory.*undeclared-pack/i));
});
