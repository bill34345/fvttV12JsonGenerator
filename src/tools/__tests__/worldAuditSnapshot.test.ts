import { expect, test } from "bun:test";
import { lstat, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
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
