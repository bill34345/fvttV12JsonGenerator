import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { TERRAIN_CONFIGURATIONS } from "../src/catalog";

const assetRoot = resolve(import.meta.dir, "../assets/terrain");

describe("original terrain assets", () => {
  test("ships exactly the six WebP files referenced by the P0 catalog", async () => {
    const expected = Object.values(TERRAIN_CONFIGURATIONS)
      .flatMap(({ stages }) => stages.map(({ texture }) => texture.split("/").at(-1)!))
      .sort();
    const actual = (await readdir(assetRoot))
      .filter((name) => name.endsWith(".webp"))
      .sort();

    expect(actual).toEqual(expected);
  });

  test("every asset is a compact WebP with an alpha-capable VP8X header", async () => {
    for (const name of await readdir(assetRoot)) {
      if (!name.endsWith(".webp")) continue;
      const bytes = await readFile(resolve(assetRoot, name));
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(bytes.includes(Buffer.from("ALPH"))).toBe(true);
      expect(bytes.byteLength).toBeLessThan(1_000_000);
    }
  });
});
