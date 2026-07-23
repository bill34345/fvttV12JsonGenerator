# `cor-cotn` World Footprint Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run a reproducible, read-only audit of the project-local `cor-cotn` Foundry world that produces a complete inventory, conservative reference graph, chapter classification, performance baseline, decision-ready Excel workbook, and privacy-safe repository summary.

**Architecture:** A project tool first snapshots the stopped local world while holding every LevelDB `LOCK` file open, proves that the source tree is unchanged, and opens only the copied databases through the exact Foundry 14.364 `classic-level` runtime. Pure analysis modules then classify Foundry keys, documents, folders, references, language, assets, chapters, and cleanup candidates. The CLI writes machine-readable evidence; a separate Artifact Tool builder turns the reviewed evidence into the required workbook; browser/runtime sampling runs against an isolated copy of the world so Foundry cannot write to the audited source.

**Tech Stack:** Bun/TypeScript, Node filesystem and crypto APIs, Foundry 14.364 bundled `classic-level` 3.0.0, Bun tests, `@oai/artifact-tool` 2.8.6+, project-local Foundry 14.364/dnd5e 5.3.3, Codex in-app browser.

**Source specification:** `docs/superpowers/specs/2026-07-24-cor-cotn-world-footprint-audit-design.md`

## Global Constraints

- Audit only `.local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn`.
- Target Foundry VTT `14.364` and dnd5e `5.3.3`.
- Do not access remote ports `8080` or `51020`, and do not make any network request from the audit tool.
- Do not open an original LevelDB with `ClassicLevel`; `classic-level` may create or update runtime files even when used for reading. Open only a verified snapshot.
- Hold every original collection `LOCK` file through the snapshot copy and verify the source tree hash before and after copying.
- Do not delete or modify any Actor, Journal, Scene, Token, Item, Chat Message, Fog record, Compendium, asset, world Setting, or user record.
- Keep detailed names, player data, content, and generated evidence under `.local/foundry-v14/evidence/cor-cotn-world-audit-20260724/`.
- The tracked report at `docs/audits/2026-07-24-cor-cotn-world-footprint-audit.md` contains aggregate counts and redacted examples only.
- Treat name-only and arbitrary-string matches as `possible-script-reference`, never as verified use.
- Emit `no-detected-reference` only after all covered structured, UUID, text, module-setting, Macro, RollTable, Combat, Folder, Scene, User, Item, Adventure, and pack scans have run.
- An asset may be an unreferenced candidate only when it is physically inside the `cor-cotn` world directory outside `data/`; module/system/shared assets may be referenced but are never listed as unreferenced candidates.
- Runtime performance sampling uses a content-identical temporary world copy with a different world ID; it must not start the original `cor-cotn` world.
- Distinguish disk bytes, client initialization, active Canvas/GPU complexity, and long-session risk in every performance conclusion.
- Do not create an Adventure or Compendium and do not apply any cleanup decision.
- Workbook authoring uses only `@oai/artifact-tool` from the Codex workspace dependency runtime.
- Do not stage or commit pre-existing user-owned changes listed by `git status --short`.

---

### Task 1: Safe stopped-world snapshot and Foundry key reader

**Files:**
- Create: `src/tools/world-audit/model.ts`
- Create: `src/tools/world-audit/snapshot.ts`
- Create: `src/tools/__tests__/worldAuditSnapshot.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:

```ts
export interface TreeEntry {
  relativePath: string;
  bytes: number;
  sha256: string;
}

export interface LevelRecord {
  collection: string;
  key: string;
  namespace: string;
  parentIds: string[];
  embeddedPath: string[];
  value: Record<string, unknown>;
}

export interface WorldSnapshot {
  sourceWorldRoot: string;
  snapshotWorldRoot: string;
  sourceTreeHashBefore: string;
  sourceTreeHashAfter: string;
  sourceTree: TreeEntry[];
  snapshotTree: TreeEntry[];
  collectionBytes: Record<string, number>;
  records: LevelRecord[];
}

export interface SnapshotOptions {
  sourceWorldRoot: string;
  snapshotWorldRoot: string;
  classicLevelEntry: string;
  expectedWorldId: "cor-cotn";
  expectedCoreVersion: "14.364";
  expectedSystem: "dnd5e";
}

export function parseFoundryLevelKey(collection: string, key: string): Omit<LevelRecord, "value">;
export async function hashTree(root: string): Promise<{ entries: TreeEntry[]; treeHash: string }>;
export async function createWorldSnapshot(options: SnapshotOptions): Promise<WorldSnapshot>;
```

- `parseFoundryLevelKey("actors", "!actors.items.effects!ACTOR.ITEM.EFFECT")` returns namespace `actors.items.effects`, parent IDs `["ACTOR", "ITEM"]`, and embedded path `["items", "effects"]`.
- `createWorldSnapshot` reads `world.json`, rejects any other world/version/system, rejects symbolic links and reparse points, opens each original `data/<collection>/LOCK` with `r+`, hashes the original, copies it, hashes the original again, closes original handles, then loads only snapshot LevelDB directories.
- Directories whose basenames contain `.backup-` or start with `backup-` are evidence-only backups and are not treated as live collections.
- The production reader dynamically imports exactly the `classic-level/index.js` path supplied by `SnapshotOptions`, uses `{ createIfMissing: false, keyEncoding: "utf8", valueEncoding: "json" }`, and always closes databases in `finally`.

- [ ] **Step 1: Write failing key-classification and snapshot-safety tests**

```ts
import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorldSnapshot, hashTree, parseFoundryLevelKey } from "../world-audit/snapshot";

test("classifies top-level and embedded Foundry LevelDB keys", () => {
  expect(parseFoundryLevelKey("actors", "!actors!A1")).toMatchObject({
    namespace: "actors",
    parentIds: [],
    embeddedPath: [],
  });
  expect(parseFoundryLevelKey("actors", "!actors.items.effects!A1.I1.E1")).toMatchObject({
    namespace: "actors.items.effects",
    parentIds: ["A1", "I1"],
    embeddedPath: ["items", "effects"],
  });
});

test("copies a stopped world without changing source bytes and opens only the copy", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = join(root, "cor-cotn");
  const snapshot = join(root, "snapshot");
  await mkdir(join(source, "data", "actors"), { recursive: true });
  await writeFile(join(source, "world.json"), JSON.stringify({
    id: "cor-cotn",
    coreVersion: "14.364",
    system: "dnd5e",
  }));
  await writeFile(join(source, "data", "actors", "LOCK"), "");
  await writeFile(join(source, "data", "actors", "record.bin"), "unchanged");
  const before = await hashTree(source);

  const opened: string[] = [];
  const result = await createWorldSnapshot({
    sourceWorldRoot: source,
    snapshotWorldRoot: snapshot,
    classicLevelEntry: "fixture",
    expectedWorldId: "cor-cotn",
    expectedCoreVersion: "14.364",
    expectedSystem: "dnd5e",
  }, async (databasePath) => {
    opened.push(databasePath);
    return [{ key: "!actors!A1", value: { _id: "A1", name: "Fixture" } }];
  });

  expect(opened).toEqual([join(snapshot, "data", "actors")]);
  expect(result.sourceTreeHashBefore).toBe(result.sourceTreeHashAfter);
  expect(await hashTree(source)).toEqual(before);
  expect(await readFile(join(source, "data", "actors", "record.bin"), "utf8")).toBe("unchanged");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test src/tools/__tests__/worldAuditSnapshot.test.ts`

Expected: FAIL because `world-audit/snapshot` does not exist.

- [ ] **Step 3: Implement the data contracts, deterministic hashing, stopped-world lock guard, safe copy, key parser, and injected reader seam**

Implementation rules:

```ts
export type SnapshotCollectionReader = (
  databasePath: string,
  classicLevelEntry: string,
) => Promise<Array<{ key: string; value: Record<string, unknown> }>>;

export async function createWorldSnapshot(
  options: SnapshotOptions,
  reader: SnapshotCollectionReader = readClassicLevelSnapshot,
): Promise<WorldSnapshot> {
  // Validate exact world metadata and physical path boundaries.
  // Hold all original LOCK handles before the first hash.
  // Copy the complete world, including world-local assets and packs.
  // Never call reader with a path under sourceWorldRoot.
  // Compare source hashes and fail closed on drift.
}
```

`hashTree` sorts normalized `/` relative paths and hashes the UTF-8 sequence `relativePath\0bytes\0sha256\n`. It includes `LOCK` bytes; because the original database is never opened, a changed `LOCK` is evidence of drift.

- [ ] **Step 4: Run focused tests and both TypeScript checks**

Run:

```powershell
bun test src/tools/__tests__/worldAuditSnapshot.test.ts
bun run typecheck:production
bun run typecheck:all
```

Expected: all commands exit `0`; the focused test proves the source tree remains byte-identical and only snapshot paths are opened.

- [ ] **Step 5: Commit only Task 1 files**

```powershell
git add package.json src/tools/world-audit/model.ts src/tools/world-audit/snapshot.ts src/tools/__tests__/worldAuditSnapshot.test.ts
git commit -m "feat: add read-only Foundry world snapshot reader"
```

---

### Task 2: Inventory, references, cleanup status, and chapter classification

**Files:**
- Create: `src/tools/world-audit/inventory.ts`
- Create: `src/tools/world-audit/references.ts`
- Create: `src/tools/world-audit/classification.ts`
- Create: `src/tools/__tests__/worldAuditAnalysis.test.ts`

**Interfaces:**
- Consumes: `LevelRecord`, `TreeEntry`, and `WorldSnapshot` from Task 1.
- Produces:

```ts
export type ReferenceEvidence =
  | "structured-field"
  | "uuid-link"
  | "explicit-document-id"
  | "possible-script-name"
  | "possible-setting-string";

export interface ReferenceEdge {
  sourceUuid: string;
  targetUuid: string;
  evidence: ReferenceEvidence;
  fieldPath: string;
  verifiedTarget: boolean;
}

export type UsageStatus =
  | "used-structured"
  | "used-uuid"
  | "possible-script-reference"
  | "player-protected"
  | "chapter-shared"
  | "broken-reference-target"
  | "no-detected-reference"
  | "manual-review-required";

export interface ChapterClassification {
  documentUuid: string;
  category:
    | "explicit-chapter"
    | "chapter-shared"
    | "world-common"
    | "player-content"
    | "test-temporary"
    | "unclassified";
  chapterLabels: string[];
  confidence: "high" | "medium" | "low" | "none";
  evidence: Array<{ kind: string; value: string }>;
}

export interface AuditAnalysis {
  overview: Record<string, number | string | boolean>;
  actors: Array<Record<string, unknown>>;
  journals: Array<Record<string, unknown>>;
  journalPages: Array<Record<string, unknown>>;
  scenes: Array<Record<string, unknown>>;
  worldItems: Array<Record<string, unknown>>; // Includes a Document Kind column; Cards are appended here.
  macrosAndTables: Array<Record<string, unknown>>;
  playlistsAndCombats: Array<Record<string, unknown>>;
  chatAndFog: Array<Record<string, unknown>>;
  settingsAndModules: Array<Record<string, unknown>>;
  compendiumsAndAdventures: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  folders: Array<Record<string, unknown>>;
  brokenTokenActorRefs: Array<Record<string, unknown>>;
  references: ReferenceEdge[];
  chapters: ChapterClassification[];
  unresolved: string[];
}

export function analyzeWorld(snapshot: WorldSnapshot): AuditAnalysis;
```

Analysis rules:

- Top-level document counts come from keys whose namespace equals the collection namespace. Embedded counts come both from embedded key namespaces and the parent document arrays; mismatches are recorded in `unresolved`.
- Folder paths are resolved by following `folder` to the root, scoped by Foundry folder `type`. Missing parents, cycles, wrong-type parents, and documents pointing at missing folders are explicit.
- User ownership is reported as role/ownership summaries; password, passwordSalt, and raw authentication fields never enter the output.
- Journal page language labels are exactly `CJK-present`, `mixed`, `Latin-only`, `no-text`, or `other-text`. HTML tags are removed before classification. `CJK-present` and `mixed` are distinguished by whether Latin letters are also present.
- Known structured references include Scene Token `actorId`, User `character`, Scene `journal`/`journalEntryPage`/`playlist`/`playlistSound`, Scene Note document fields, Combat `scene` and combatant Actor/Token fields, RollTable document results, Folder parent/document relations, Item/effect origin UUIDs, and Adventure/pack source identifiers.
- Any valid `@UUID[...]`, `UUID[...]`, or Foundry document UUID is `uuid-link`; arbitrary 16-character IDs in Macro commands, module settings, or unknown flags remain possible references unless the field is in the structured allowlist.
- Exact document-name matches are evaluated only in Macro commands and explicit script/config strings; duplicate names always add `manual-review-required`.
- Actor candidates require zero incoming structured/UUID/explicit-ID edges, no User character binding, no player owner, and completed scans of every covered source. “No Scene token” is a separate boolean and never enough to become a candidate.
- Broken Token/Actor rows remain separate from unused Actor candidates and include token delta structure.
- Chapter confidence is `high` only for an explicit chapter Folder/name, a Scene↔Journal explicit link, or actual Actor use in a classified Scene. Asset/name/text inference is `low`.
- Multiple high-confidence chapter labels produce `chapter-shared`.
- Scene complexity reports counts for tokens, walls, lights, tiles, drawings, regions, templates, sounds, notes, token delta Items/Effects, pixel dimensions, background/foreground/video/audio paths, but labels GPU risk as an estimate.
- Top-level Cards and embedded card faces are counted and referenced; because the design has no separate Cards worksheet, they appear in `World Items` with `Document Kind = Card`.
- World-local asset candidates enumerate files under the copied world outside `data/` and exclude `world.json`, LevelDB files, and audit output. External `modules/`, `systems/`, and shared paths can be referenced but are not unreferenced candidates.
- Pack inventory comes from `world.json` plus physical `packs/` directories; undeclared directories are reported. The `Adventure-BxzlyiYWyXYyz9XI` pack is inspected as a sample, not modified.

- [ ] **Step 1: Write a failing fixture-backed analysis test**

The fixture contains:

```ts
const records = [
  top("folders", "F1", { _id: "F1", name: "Chapter 2", type: "Scene", folder: null }),
  top("scenes", "S1", {
    _id: "S1", name: "Road", folder: "F1",
    tokens: [
      { _id: "T1", actorId: "A1", actorLink: true, delta: {} },
      { _id: "T2", actorId: "MISSING", actorLink: true, delta: { items: [{ _id: "I1" }] } },
    ],
    notes: [], walls: [], lights: [], tiles: [], drawings: [], regions: [], templates: [], sounds: [],
  }),
  top("actors", "A1", { _id: "A1", name: "Used", type: "npc", folder: null, ownership: {}, items: [], effects: [] }),
  top("actors", "A2", { _id: "A2", name: "Journal Used", type: "npc", folder: null, ownership: {}, items: [], effects: [] }),
  top("actors", "A3", { _id: "A3", name: "Candidate", type: "npc", folder: null, ownership: {}, items: [], effects: [] }),
  top("actors", "A4", { _id: "A4", name: "Player", type: "character", folder: null, ownership: { U1: 3 }, items: [], effects: [] }),
  top("users", "U1", { _id: "U1", name: "Redacted in tracked report", character: "A4", role: 1 }),
  top("journal", "J1", {
    _id: "J1", name: "Clue", folder: null,
    pages: [{ _id: "P1", type: "text", text: { content: "<p>@UUID[Actor.A2]{link} English 中文</p>" } }],
  }),
  top("macros", "M1", { _id: "M1", name: "Lookup", command: "game.actors.getName('Candidate')" }),
];
```

Assertions:

```ts
expect(actor("A1").usageStatuses).toContain("used-structured");
expect(actor("A1").chapter).toMatchObject({ category: "explicit-chapter", confidence: "high" });
expect(actor("A2").usageStatuses).toContain("used-uuid");
expect(actor("A3").usageStatuses).toEqual(expect.arrayContaining(["possible-script-reference"]));
expect(actor("A3").usageStatuses).not.toContain("no-detected-reference");
expect(actor("A4").usageStatuses).toContain("player-protected");
expect(analysis.brokenTokenActorRefs).toHaveLength(1);
expect(analysis.journalPages[0]?.language).toBe("mixed");
expect(analysis.unusedActorCandidates).not.toContainEqual(expect.objectContaining({ id: "A3" }));
```

Add close negatives:

- an ordinary biography that contains the word `Candidate` is not a script-name reference;
- a 16-character random string in prose is not a verified document reference;
- an asset path under `modules/` is never an unreferenced candidate;
- an actor appearing in two explicitly classified scenes becomes `chapter-shared`;
- a missing folder and a folder cycle are reported without an infinite loop.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test src/tools/__tests__/worldAuditAnalysis.test.ts`

Expected: FAIL because the analysis modules do not exist.

- [ ] **Step 3: Implement inventory normalization, folder resolution, reference extraction, status assignment, chapter propagation, language labeling, scene complexity, packs, and assets**

Implementation must be deterministic: sort documents by UUID, references by `(sourceUuid,targetUuid,evidence,fieldPath)`, and all status arrays by the declared `UsageStatus` order.

- [ ] **Step 4: Run focused tests and generalization checks**

Run:

```powershell
bun test src/tools/__tests__/worldAuditSnapshot.test.ts src/tools/__tests__/worldAuditAnalysis.test.ts
bun run audit:anti-overfit
bun run typecheck:production
bun run typecheck:all
```

Expected: all pass. Generalization evidence must include the positive `Actor.A2` UUID, the close-negative random string, the unrelated Actor without incoming references, and the multi-chapter Actor.

- [ ] **Step 5: Commit only Task 2 files**

```powershell
git add src/tools/world-audit/inventory.ts src/tools/world-audit/references.ts src/tools/world-audit/classification.ts src/tools/__tests__/worldAuditAnalysis.test.ts
git commit -m "feat: analyze Foundry world references and chapters"
```

---

### Task 3: Audit CLI and machine-readable/local Markdown deliverables

**Files:**
- Create: `src/tools/world-audit/report.ts`
- Create: `src/tools/worldFootprintAudit.ts`
- Create: `src/tools/__tests__/worldFootprintAuditCli.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createWorldSnapshot` and `analyzeWorld`.
- Produces:

```ts
export interface AuditCliOptions {
  worldRoot: string;
  appRoot: string;
  outputDir: string;
  snapshotDir: string;
  baselineFile?: string;
}

export interface AuditManifest {
  generatedAt: string;
  target: { worldId: "cor-cotn"; foundry: "14.364"; dnd5e: "5.3.3" };
  remoteAccessed: false;
  sourceTreeHashBefore: string;
  sourceTreeHashAfter: string;
  files: Record<string, string>;
  validation: {
    collectionKeyCrossChecks: Array<{ name: string; levelKeys: number; topLevel: number; embedded: number; matchesParentArrays: boolean }>;
    duplicateIds: Array<Record<string, unknown>>;
    danglingFolders: number;
    unresolvedReferences: number;
  };
}

export async function runWorldFootprintAudit(options: AuditCliOptions): Promise<AuditManifest>;
```

The CLI accepts only:

```text
bun run src/tools/worldFootprintAudit.ts
  --world-root <path>
  --app-root <path>
  --output-dir <path>
  --snapshot-dir <path>
  [--baseline-file <path>]
```

It rejects unknown arguments and refuses an output or snapshot directory inside the audited source world.

Required output files:

- `inventory.json`
- `references.json`
- `chapter-classification.json`
- `baseline.json` (`status: "pending-runtime-sampling"` until Task 4 supplies a baseline file)
- `unresolved.md`
- `summary.md`
- `workbook-source.json`
- `audit-manifest.json`

`inventory.json` contains all detailed tables except reference edges and chapter rows. `workbook-source.json` contains exactly the 16 workbook sheet datasets in the design order, with a blank `User Decision` column whose allowed values are `Keep`, `Delete`, `Archive`, `Restore Reference`, and `Needs Review`.

- [ ] **Step 1: Write failing CLI/report tests**

Tests use an injected `WorldSnapshot` fixture and temporary output directory. Assert:

```ts
expect(Object.keys(workbookSource.sheets)).toEqual([
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
]);
expect(manifest.remoteAccessed).toBe(false);
expect(manifest.sourceTreeHashBefore).toBe(manifest.sourceTreeHashAfter);
expect(summary).toContain("无 Scene 引用");
expect(summary).toContain("无任何检测到的引用");
expect(summary).toContain("磁盘");
expect(summary).toContain("初始化");
expect(summary).toContain("Canvas/GPU");
expect(summary).toContain("持续运行");
expect(unresolved).toContain("静态扫描不能证明动态名称查找绝对安全");
```

Also assert raw User password fields and raw Journal page bodies never occur in `summary.md` or the tracked-summary projection returned by `report.ts`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test src/tools/__tests__/worldFootprintAuditCli.test.ts`

Expected: FAIL because the CLI/report modules do not exist.

- [ ] **Step 3: Implement deterministic writers and CLI validation**

Use UTF-8 JSON with two-space indentation and trailing newline. `summary.md` must contain:

1. audit scope and exact version;
2. world collection and disk summary;
3. Actor reference/candidate distinctions;
4. broken Token/Actor integrity risks;
5. Journal language/page/module distinctions;
6. chapter confidence distribution;
7. Adventure vs Compendium vs Module trade-offs;
8. performance layers and baseline status;
9. prioritized decisions, without automatic deletion;
10. unresolved/static-analysis limits;
11. mechanical validation table.

- [ ] **Step 4: Run focused tests, full tests, type checks, anti-overfit audit, and repository hygiene**

Run:

```powershell
bun test src/tools/__tests__/worldAuditSnapshot.test.ts src/tools/__tests__/worldAuditAnalysis.test.ts src/tools/__tests__/worldFootprintAuditCli.test.ts
bun test --max-concurrency 4
bun run typecheck:production
bun run typecheck:all
bun run audit:anti-overfit
bun run hygiene:repository
```

Expected: all commands exit `0`; the full suite has zero failures.

- [ ] **Step 5: Commit only Task 3 files**

```powershell
git add package.json src/tools/world-audit/report.ts src/tools/worldFootprintAudit.ts src/tools/__tests__/worldFootprintAuditCli.test.ts
git commit -m "feat: add cor-cotn world audit CLI"
```

---

### Task 4: Execute the real audit and verify evidence semantics

**Files:**
- Create locally: `.local/foundry-v14/evidence/cor-cotn-world-audit-20260724/*`
- Create: `docs/audits/2026-07-24-cor-cotn-world-footprint-audit.md`
- Modify: `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`

**Interfaces:**
- Consumes: Task 3 CLI.
- Produces: the complete local evidence set and privacy-safe tracked summary.

- [ ] **Step 1: Prove the original world is stopped and run the audit against the exact paths**

Confirm no listener is using the project-local Foundry port and no Node command line contains the exact `server-mirror` data path with `cor-cotn`.

Run:

```powershell
bun run src/tools/worldFootprintAudit.ts `
  --world-root ".local/foundry-v14/data/server-mirror/Data/worlds/cor-cotn" `
  --app-root ".local/foundry-v14/app/14.364" `
  --output-dir ".local/foundry-v14/evidence/cor-cotn-world-audit-20260724" `
  --snapshot-dir ".local/foundry-v14/evidence/cor-cotn-world-audit-20260724/snapshot"
```

Expected: exit `0`; source tree hashes are identical; the CLI opens only snapshot databases.

- [ ] **Step 2: Reconcile real key counts and semantic document counts**

Verify at minimum:

- 771 top-level Actors, 6,337 Actor Items, 1,341 Actor Item Effects, and 35 Actor Effects, or explain current drift from the design snapshot;
- 295 Scenes and 2,836 Scene Tokens, or explain drift;
- 415 JournalEntries and 734 JournalEntryPages, or explain drift;
- top-level counts come from top-level LevelDB namespaces while embedded counts reconcile with both embedded keys and parent arrays;
- all 349 no-Scene Actor rows are present, but only the subset with complete no-reference scans appears as candidates;
- all missing Actor IDs and affected Tokens appear in the broken-reference table.

- [ ] **Step 3: Perform source-to-report semantic spot checks**

Read the original snapshot records and compare at least:

- one Scene-referenced NPC;
- one User-bound character;
- one Journal-UUID-referenced Actor;
- one Actor with no Scene reference but another valid reference;
- one true `no-detected-reference` candidate;
- one duplicate-name/manual-review Actor;
- one CJK Journal, one mixed Journal page, one image/no-text page, and one Calendaria page;
- one high-confidence chapter object, one low-confidence inference, and one shared/unclassified object;
- one broken Token/Actor row with delta structure;
- `Adventure-BxzlyiYWyXYyz9XI`;
- one referenced world-local asset, one unreferenced world-local asset candidate, and one external module asset that is not a candidate.

Record object IDs and field paths in ignored evidence, but use redacted labels in the tracked report.

- [ ] **Step 4: Write the tracked privacy-safe summary and ExecPlan checkpoint**

The tracked audit report must use aggregate counts and no player names, passwords, raw Journal text, Macro source, or bulk world content. Add an ExecPlan stopping-point entry that names the branch/commit, commands, mechanical results, semantic sample coverage, remaining baseline/workbook work, and confirms remote instances were not accessed.

- [ ] **Step 5: Commit only the tracked summary and ExecPlan update**

```powershell
git add docs/audits/2026-07-24-cor-cotn-world-footprint-audit.md docs/remediation/2026-07-15-project-hardening/EXECPLAN.md
git commit -m "docs: record cor-cotn footprint audit evidence"
```

---

### Task 5: Build and visually verify the decision workbook

**Files:**
- Create locally: `.local/foundry-v14/evidence/cor-cotn-world-audit-20260724/build-workbook.mjs`
- Create locally: `.local/foundry-v14/evidence/cor-cotn-world-audit-20260724/cor-cotn-world-audit.xlsx`
- Create locally: `.local/foundry-v14/evidence/cor-cotn-world-audit-20260724/previews/*.png`

**Interfaces:**
- Consumes: `workbook-source.json` from Task 4.
- Produces: the exact 16-sheet workbook named by the design.

Workbook rules:

- Use only `@oai/artifact-tool` from the loader-provided Node runtime.
- Create a conversation-local `node_modules` junction to the loader-provided package directory; do not modify that directory.
- The builder is a single `.mjs` file, patched and rerun rather than duplicated.
- Every sheet has a title band, filterable header row, frozen headers, hidden gridlines, bounded widths, wrapped descriptive columns, typed numeric fields, and consistent status colors.
- `Overview` contains formula-backed visible totals that link to the detailed sheets using quoted sheet references.
- Every user-editable decision column has data validation with exactly `Keep`, `Delete`, `Archive`, `Restore Reference`, and `Needs Review`.
- Conditional formatting highlights broken references, player-protected rows, manual-review rows, and no-detected-reference candidates.
- No table or formula includes raw password/authentication fields.

- [ ] **Step 1: Build the workbook from reviewed JSON**

Use `Workbook.create()`, block writes, explicit unique table names, formula-backed Overview cells, list validation on decision columns, and `SpreadsheetFile.exportXlsx`.

- [ ] **Step 2: Inspect values/formulas and scan formula errors**

Run Artifact Tool inspections for:

- `Overview!A1:H40`;
- the header plus first representative row from every sheet;
- `#REF!|#DIV/0!|#VALUE!|#NAME\?|#N/A` across the workbook.

Expected: no formula errors, exact 16 sheet names, totals reconcile with JSON.

- [ ] **Step 3: Render every sheet for a visual pass**

Render the populated range of all 16 sheets. Inspect every preview for clipped headers, unreadable wrapped text, blank/broken tables, misplaced content, and inconsistent decision controls. Patch the same builder and rerun if any severe defect exists.

- [ ] **Step 4: Re-import the final workbook and reconcile**

Re-import `cor-cotn-world-audit.xlsx`, inspect sheet names and key totals, and confirm the decision validation remains present. Record workbook SHA-256 and the JSON aggregate values used for reconciliation in `audit-manifest.json`.

---

### Task 6: Isolated-copy runtime baseline and final acceptance

**Files:**
- Create locally: `.local/foundry-v14/evidence/cor-cotn-world-audit-20260724/baseline.json`
- Modify locally: `.local/foundry-v14/evidence/cor-cotn-world-audit-20260724/summary.md`
- Modify: `docs/audits/2026-07-24-cor-cotn-world-footprint-audit.md`
- Modify: `docs/remediation/2026-07-15-project-hardening/EXECPLAN.md`

**Interfaces:**
- Produces the completed baseline and final mechanical/semantic acceptance record.

- [ ] **Step 1: Create an isolated runtime copy**

Copy the already-verified audit snapshot to a temporary world directory with ID `cor-cotn-audit-baseline`; change only the copied `world.json` ID/title. Hash the original `cor-cotn` source again before startup. Do not point Foundry at the original world.

- [ ] **Step 2: Start project-local Foundry loopback-only**

Use `.local/foundry-v14/app/14.364/main.js`, the project-local server mirror, a non-production loopback port, and `--world=cor-cotn-audit-baseline`. Verify listener, HTTP response, Foundry `14.364`, dnd5e `5.3.3`, and selected temporary world. Do not access remote `8080` or `51020`.

- [ ] **Step 3: Capture the browser/runtime baseline**

Through the Foundry public runtime and in-app browser, record:

- server process start to HTTP ready;
- browser navigation to world ready;
- initialization response count/bytes and largest responses;
- browser tab/process memory and `performance.memory` when available;
- active Scene token/wall/light/tile/texture/animation counts;
- console errors and repeated warnings;
- memory after a fixed idle interval;
- memory after one fixed short operation sequence.

If authenticated entry cannot be completed with the existing local session, record `partial` with the exact blocker. Do not reset credentials or modify users without new explicit authorization.

- [ ] **Step 4: Stop, clean up, restore, and prove non-mutation**

Stop only the temporary local Foundry process, release the port, restore any project-local `options.json` change, and remove/archive only the explicitly named temporary baseline world. Hash the original `cor-cotn` tree again and require equality with the pre-audit hash. Confirm no remote host was contacted.

- [ ] **Step 5: Refresh the CLI report with the completed baseline**

Run the report generation path with `--baseline-file` so `baseline.json`, `summary.md`, workbook Overview, and `audit-manifest.json` agree. Rebuild/reverify the workbook if baseline fields changed.

- [ ] **Step 6: Run final mechanical verification**

Run:

```powershell
bun test src/tools/__tests__/worldAuditSnapshot.test.ts src/tools/__tests__/worldAuditAnalysis.test.ts src/tools/__tests__/worldFootprintAuditCli.test.ts
bun test --max-concurrency 4
bun run typecheck:production
bun run typecheck:all
bun run audit:anti-overfit
bun run hygiene:repository
git diff --check
git status --short
```

Require:

- zero test failures;
- both type checks exit `0`;
- source world tree hash unchanged;
- JSON/Markdown/Excel totals reconciled;
- every candidate has completed scan evidence;
- remote access remains `false`.

- [ ] **Step 7: Perform final semantic acceptance**

Read the final workbook, local `summary.md`, tracked report, and sampled source records. Confirm:

- an Actor row answers who/where/used-by/why-candidate;
- no-Scene and no-detected-reference are visibly distinct;
- Journal language/page/module distinctions are truthful;
- chapter evidence/confidence is visible;
- disk/initialization/Canvas/long-session conclusions are separate;
- no row automatically decides deletion;
- Adventure/Compendium/Module trade-offs are explained;
- incomplete runtime evidence is labeled `partial`, never silently upgraded.

- [ ] **Step 8: Update ExecPlan final checkpoint and commit tracked acceptance changes**

```powershell
git add docs/audits/2026-07-24-cor-cotn-world-footprint-audit.md docs/remediation/2026-07-15-project-hardening/EXECPLAN.md
git commit -m "docs: accept cor-cotn world footprint audit"
```

Record mechanical verification separately from semantic acceptance and list any remaining risk.

---

## Plan Self-Review

- Spec coverage: Tasks 1–6 cover all design sections 1–16, including every required collection, reference category, folder path, chapter classification, pack assessment, performance layer, deliverable, and acceptance gate.
- Safety coverage: original LevelDB is never opened; runtime sampling uses a copied world; remote endpoints are out of scope; detailed evidence remains ignored.
- Placeholder scan: the plan contains no deferred implementation placeholders. A runtime authentication failure has an explicit truthful `partial` result rather than an invented success path.
- Type consistency: Tasks 2–3 consume the exact `WorldSnapshot`, `LevelRecord`, `AuditAnalysis`, and `AuditManifest` interfaces defined in prior tasks.
- Current-data drift: the design counts are checkpoints, not hard-coded test assertions; the real run records and explains any drift.
