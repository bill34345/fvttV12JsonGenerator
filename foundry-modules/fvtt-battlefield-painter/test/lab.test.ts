import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { assertEmptyInstallDestination } from "../scripts/lab";

const temporaryRoots: string[] = [];

const temporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), "battlefield-painter-install-"));
  temporaryRoots.push(root);
  return root;
};

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true });
  }
});

describe("no-backup local installation guard", () => {
  test("allows an absent destination", async () => {
    const root = await temporaryRoot();
    await expect(
      assertEmptyInstallDestination(resolve(root, "fvtt-battlefield-painter")),
    ).resolves.toBeUndefined();
  });

  test("refuses an existing module directory without touching it", async () => {
    const root = await temporaryRoot();
    const destination = resolve(root, "fvtt-battlefield-painter");
    const sentinel = resolve(destination, "keep.txt");
    await mkdir(destination);
    await writeFile(sentinel, "do not replace", "utf8");

    await expect(assertEmptyInstallDestination(destination)).rejects.toThrow(
      "destination already exists",
    );
    expect(await readFile(sentinel, "utf8")).toBe("do not replace");
  });

  test("refuses any existing filesystem entry", async () => {
    const root = await temporaryRoot();
    const destination = resolve(root, "fvtt-battlefield-painter");
    await writeFile(destination, "foreign entry", "utf8");

    await expect(assertEmptyInstallDestination(destination)).rejects.toThrow(
      "destination already exists",
    );
  });

  test("contains no backup or replacement path", async () => {
    const source = await readFile(
      resolve(import.meta.dir, "../scripts/lab.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/backupRoot|\.previous|\bbackup\b/i);
  });
});
