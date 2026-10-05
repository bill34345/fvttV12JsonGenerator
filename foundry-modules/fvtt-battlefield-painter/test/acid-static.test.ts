import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeCell } from "../src/geometry";
import { buildScenePlan } from "../src/scene-plan";
import { terrainDocumentFlag } from "../src/scene-ownership";

const moduleId = "fvtt-battlefield-painter";
const cells = Array.from({ length: 9 }, (_, n) => {
  const i = Math.floor(n / 3), j = n % 3, x = j * 100, y = i * 100;
  return normalizeCell({ key: `${i}:${j}`, offset: { i, j },
    center: { x: x + 50, y: y + 50 },
    vertices: [{ x, y }, { x: x + 100, y }, { x: x + 100, y: y + 100 }, { x, y: y + 100 }] });
});
const plan = (stageIndex: number, selected = cells) => buildScenePlan({
  bundleId: "acid", configurationId: "acid", stageIndex, cells: selected,
  visualEffect: "acid-static-v1",
  movementBehavior: () => { throw new Error("Visual acid must not install a movement behavior"); },
});

describe("self-reviewed native acid", () => {
  test("ships the selected original RGBA files, excluding the rejected RGB candidate", async () => {
    for (const [stage, hash] of [
      ["i", "9843e2adbfbb305b89d34b9d58fe1ece6303db9825959326675fe8738b46c2dc"],
      ["ii", "ec0ba5f97a18292f71486035102ca8a844c68d37700a1a1550b18d18becfa5f7"],
    ] as const) {
      const bytes = await readFile(resolve(import.meta.dir, `../assets/terrain/acid-native-stage-${stage}.png`));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
      expect(bytes.readUInt32BE(16)).toBe(1254);
      expect(bytes.readUInt32BE(20)).toBe(1254);
      expect(bytes[25]).toBe(6);
    }
  });

  test("preserves surviving cell appearance while leaving a real hole and no gameplay documents", () => {
    const full = plan(1), ring = plan(1, cells.filter(c => c.key !== "1:1").reverse());
    expect(ring.Tile).toHaveLength(8);
    for (const tile of ring.Tile) {
      const original = full.Tile.find(t => t.flags[moduleId].cellKey === tile.flags[moduleId].cellKey);
      expect(original).toBeDefined();
      expect(tile).toEqual(original!);
      expect(tile.alpha).toBe(1);
      expect(tile.width).toBeCloseTo(115);
      expect(tile.texture.tint).toBe("#ffffff");
    }
    for (const stage of [0, 1]) {
      const p = plan(stage);
      expect([p.Region, p.AmbientLight, p.AmbientSound, p.Wall]).toEqual([[], [], [], []]);
    }
  });

  test("rejects acid markers on other terrain and invalid detail layers", () => {
    const tile = plan(0).Tile[0]!;
    expect(terrainDocumentFlag(tile)).toEqual(tile.flags[moduleId]);
    for (const update of [{ configurationId: "fire" }, { configurationId: "frost" },
      { configurationId: "brambles" }, { visualLayer: "detail" }, { stageIndex: 2 }]) {
      expect(terrainDocumentFlag({ ...tile, flags: { [moduleId]: { ...tile.flags[moduleId], ...update } } })).toBeUndefined();
    }
    expect(() => buildScenePlan({ bundleId: "bad", configurationId: "fire", stageIndex: 0, cells,
      visualEffect: "acid-static-v1", movementBehavior: () => ({ type: "modifyMovementCost", system: {} }) })).toThrow("not supported");
  });
});
