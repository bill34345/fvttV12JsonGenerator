import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { lstat, mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  acquireStoppedWorldLocks,
  createWorldSnapshot,
  hashTree,
  parseFoundryLevelKey,
} from "../world-audit/snapshot";

const classicLevelEntry = resolve(
  ".local/foundry-v14/app/14.364/node_modules/classic-level/index.js",
);

interface TestClassicLevel {
  open(): Promise<void>;
  put(key: string, value: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

interface TestClassicLevelModule {
  ClassicLevel: new (
    location: string,
    options?: { createIfMissing?: boolean; keyEncoding?: "utf8"; valueEncoding?: "json" },
  ) => TestClassicLevel;
}

async function loadClassicLevel(): Promise<TestClassicLevelModule> {
  if (!existsSync(classicLevelEntry)) {
    throw new Error(`Exact project-local classic-level entry is unavailable: ${classicLevelEntry}`);
  }
  return await import(pathToFileURL(classicLevelEntry).href) as TestClassicLevelModule;
}

async function createWorld(root: string, metadata: Record<string, unknown> = {}): Promise<string> {
  const source = join(root, "cor-cotn");
  await mkdir(join(source, "data", "actors"), { recursive: true });
  await writeFile(join(source, "world.json"), JSON.stringify({
    id: "cor-cotn",
    coreVersion: "14.364",
    system: "dnd5e",
    ...metadata,
  }));
  await writeFile(join(source, "data", "actors", "LOCK"), "");
  return source;
}

function snapshotOptions(sourceWorldRoot: string, snapshotWorldRoot: string) {
  return {
    sourceWorldRoot,
    snapshotWorldRoot,
    classicLevelEntry,
    expectedWorldId: "cor-cotn" as const,
    expectedCoreVersion: "14.364" as const,
    expectedSystem: "dnd5e" as const,
  };
}

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

test("rejects Foundry keys whose namespace and identifier depths differ", () => {
  expect(() => parseFoundryLevelKey("actors", "!actors.items!A1")).toThrow("Invalid Foundry LevelDB namespace");
  expect(() => parseFoundryLevelKey("actors", "!actors.items.effects!A1.I1")).toThrow("Invalid Foundry LevelDB namespace");
});

test("hashes tree entries in ordinal path order", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  await writeFile(join(root, "Z.txt"), "Z");
  await writeFile(join(root, "a.txt"), "a");

  expect((await hashTree(root)).entries.map((entry) => entry.relativePath)).toEqual(["Z.txt", "a.txt"]);
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

test("rejects a snapshot destination inside the source before creating it", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = join(root, "cor-cotn");
  await mkdir(join(source, "data", "actors"), { recursive: true });
  await writeFile(join(source, "world.json"), JSON.stringify({
    id: "cor-cotn",
    coreVersion: "14.364",
    system: "dnd5e",
  }));
  await writeFile(join(source, "data", "actors", "LOCK"), "");
  const before = await hashTree(source);

  await expect(createWorldSnapshot({
    sourceWorldRoot: source,
    snapshotWorldRoot: join(source, "evidence", "snapshot"),
    classicLevelEntry: "fixture",
    expectedWorldId: "cor-cotn",
    expectedCoreVersion: "14.364",
    expectedSystem: "dnd5e",
  })).rejects.toThrow("outside the source world");

  expect(await hashTree(source)).toEqual(before);
  await expect(lstat(join(source, "evidence"))).rejects.toMatchObject({ code: "ENOENT" });
});

test("rejects unexpected source metadata before creating a snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = await createWorld(root, { coreVersion: "14.999" });
  const snapshot = join(root, "snapshot");

  await expect(createWorldSnapshot(snapshotOptions(source, snapshot), async () => [])).rejects.toThrow("Unexpected world metadata");
  await expect(lstat(snapshot)).rejects.toMatchObject({ code: "ENOENT" });
});

test("does not delete a pre-existing snapshot destination after rejecting it", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = await createWorld(root);
  const snapshot = join(root, "snapshot");
  await mkdir(snapshot);
  await writeFile(join(snapshot, "keep.txt"), "pre-existing");

  await expect(createWorldSnapshot(snapshotOptions(source, snapshot), async () => [])).rejects.toThrow(
    "Snapshot destination already exists",
  );

  expect(await readFile(join(snapshot, "keep.txt"), "utf8")).toBe("pre-existing");
});

test("fails closed when a live collection has no LOCK file", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = await createWorld(root);
  const snapshot = join(root, "snapshot");
  await lstat(join(source, "data", "actors", "LOCK"));
  await writeFile(join(source, "data", "actors", "LOCK"), "");
  await mkdir(join(source, "data", "items"));

  await expect(createWorldSnapshot(snapshotOptions(source, snapshot), async () => [])).rejects.toMatchObject({ code: "ENOENT" });
  await expect(lstat(snapshot)).rejects.toMatchObject({ code: "ENOENT" });
});

test("does not treat backup collection directories as live databases", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = await createWorld(root);
  const snapshot = join(root, "snapshot");
  await mkdir(join(source, "data", "actors.backup-20260724"));
  await writeFile(join(source, "data", "actors.backup-20260724", "LOCK"), "backup");
  const opened: string[] = [];

  await createWorldSnapshot(snapshotOptions(source, snapshot), async (databasePath) => {
    opened.push(databasePath);
    return [];
  });

  expect(opened).toEqual([join(snapshot, "data", "actors")]);
});

test("removes an incomplete snapshot when source bytes drift after copy", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = await createWorld(root);
  const snapshot = join(root, "snapshot");
  const recordPath = join(source, "data", "actors", "record.bin");
  await writeFile(recordPath, "before");

  await expect(createWorldSnapshot(snapshotOptions(source, snapshot), async () => [], {
    afterCopy: async () => writeFile(recordPath, "after"),
  })).rejects.toThrow("Source world changed");

  await expect(lstat(snapshot)).rejects.toMatchObject({ code: "ENOENT" });
});

test("removes an incomplete snapshot when snapshot verification fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = await createWorld(root);
  const snapshot = join(root, "snapshot");

  await expect(createWorldSnapshot(snapshotOptions(source, snapshot), async () => [], {
    beforeSnapshotHash: async () => writeFile(join(snapshot, "tamper.bin"), "tamper"),
  })).rejects.toThrow("Snapshot bytes do not match");

  await expect(lstat(snapshot)).rejects.toMatchObject({ code: "ENOENT" });
});

test("removes a verified snapshot when a reader fails before return", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = await createWorld(root);
  const snapshot = join(root, "snapshot");

  await expect(createWorldSnapshot(snapshotOptions(source, snapshot), async () => {
    throw new Error("reader failed");
  })).rejects.toThrow("reader failed");

  await expect(lstat(snapshot)).rejects.toMatchObject({ code: "ENOENT" });
});

test("rejects a Windows junction in the source tree", async () => {
  if (process.platform !== "win32") return;
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = join(root, "cor-cotn");
  const target = join(root, "external-actors");
  await mkdir(join(source, "data"), { recursive: true });
  await mkdir(target);
  await writeFile(join(source, "world.json"), JSON.stringify({
    id: "cor-cotn",
    coreVersion: "14.364",
    system: "dnd5e",
  }));
  await writeFile(join(target, "LOCK"), "");
  await symlink(target, join(source, "data", "actors"), "junction");

  await expect(createWorldSnapshot(snapshotOptions(source, join(root, "snapshot")), async () => [])).rejects.toThrow(
    /reparse|physical/i,
  );
});

test("rejects a pre-opened disposable LevelDB before snapshotting", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = await createWorld(root);
  const databasePath = join(source, "data", "actors");
  const { ClassicLevel } = await loadClassicLevel();
  const database = new ClassicLevel(databasePath, { keyEncoding: "utf8", valueEncoding: "json" });
  await database.put("!actors!A1", { _id: "A1" });

  try {
    await expect(createWorldSnapshot(snapshotOptions(source, join(root, "snapshot")), async () => [])).rejects.toThrow(
      /stopped-world lock|LOCK/i,
    );
  } finally {
    await database.close();
  }
});

test("the stopped-world guard blocks a contender ClassicLevel open until released", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = await createWorld(root);
  const databasePath = join(source, "data", "actors");
  const { ClassicLevel } = await loadClassicLevel();
  const seed = new ClassicLevel(databasePath, { keyEncoding: "utf8", valueEncoding: "json" });
  await seed.put("!actors!A1", { _id: "A1" });
  await seed.close();

  const guard = await acquireStoppedWorldLocks([join(databasePath, "LOCK")]);
  try {
    const contender = new ClassicLevel(databasePath, { createIfMissing: false, keyEncoding: "utf8", valueEncoding: "json" });
    await expect(contender.open()).rejects.toThrow("Database failed to open");
  } finally {
    await guard.close();
  }

  const contenderAfterRelease = new ClassicLevel(databasePath, {
    createIfMissing: false,
    keyEncoding: "utf8",
    valueEncoding: "json",
  });
  await contenderAfterRelease.open();
  await contenderAfterRelease.close();
});

test("the default reader closes the snapshot ClassicLevel database before returning", async () => {
  const root = await mkdtemp(join(tmpdir(), "world-audit-"));
  const source = await createWorld(root);
  const databasePath = join(source, "data", "actors");
  const { ClassicLevel } = await loadClassicLevel();
  const seed = new ClassicLevel(databasePath, { keyEncoding: "utf8", valueEncoding: "json" });
  await seed.put("!actors!A1", { _id: "A1", name: "Fixture" });
  await seed.close();
  const snapshot = join(root, "snapshot");

  const result = await createWorldSnapshot(snapshotOptions(source, snapshot));
  expect(result.records).toContainEqual(expect.objectContaining({ key: "!actors!A1" }));

  const contender = new ClassicLevel(join(snapshot, "data", "actors"), {
    createIfMissing: false,
    keyEncoding: "utf8",
    valueEncoding: "json",
  });
  await contender.open();
  await contender.close();
});
