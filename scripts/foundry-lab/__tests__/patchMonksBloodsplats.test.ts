import { describe, expect, test } from "bun:test";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  patchMonksBloodsplatsFile,
  patchMonksBloodsplatsSource,
} from "../patchMonksBloodsplats";

const vulnerableSource = `
    static async getBloodImage(token, animate) {
        const tex = PIXI.Assets.cache.has(filename) ? foundry.canvas.getTexture(filename) : await foundry.canvas.loadTexture(filename);
        if (!tex)
            return;

        let s = new PIXI.Sprite(tex);

        let colour = blood.color || list.color || MonksBloodsplats.blood_types.default.color || '#ff0000';
        let size = blood.size || list.size || setting("bloodsplat-size") || 1;
        s.width = Math.abs(token.w) * size;
        s.height = (Math.abs(token.h) * size);
        s.x = token.x + (Math.abs(token.w) / 2);
        s.y = token.y + (Math.abs(token.h) / 2);
    }
`;

describe("patchMonksBloodsplatsSource", () => {
  test("guards the token after async texture loading before reading PIXI position", () => {
    const result = patchMonksBloodsplatsSource(vulnerableSource);

    expect(result.changed).toBe(true);
    expect(result.source).toContain("token.document?.parent?.id !== canvas.scene?.id");
    expect(result.source).toContain("token.document?.object !== token");
    expect(result.source).toContain("!token.transform");
    expect(result.source.indexOf("!token.transform")).toBeLessThan(
      result.source.indexOf("s.x = token.x"),
    );
  });

  test("is idempotent", () => {
    const once = patchMonksBloodsplatsSource(vulnerableSource);
    const twice = patchMonksBloodsplatsSource(once.source);

    expect(twice.changed).toBe(false);
    expect(twice.source).toBe(once.source);
  });

  test("rejects an unexpected upstream source shape", () => {
    expect(() => patchMonksBloodsplatsSource("export class MonksBloodsplats {}"))
      .toThrow("Monk's Bloodsplats 14.01 vulnerable source block was not found");
  });

  test("patches a module file and preserves an adjacent backup", async () => {
    const root = await mkdtemp(join(tmpdir(), "monks-bloodsplats-patch-"));
    const moduleFile = join(root, "monks-bloodsplats.js");
    try {
      await writeFile(moduleFile, vulnerableSource, "utf8");

      const result = await patchMonksBloodsplatsFile(moduleFile);

      expect(result.changed).toBe(true);
      expect(await readFile(`${moduleFile}.upstream-14.01.bak`, "utf8"))
        .toBe(vulnerableSource);
      expect(await readFile(moduleFile, "utf8"))
        .toContain("token.document?.object !== token");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
