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
  bundleId: "blood", configurationId: "blood", stageIndex, cells: selected,
  visualEffect: "blood-static-v1",
  movementBehavior: () => { throw new Error("Visual blood must not install a movement behavior"); },
});

describe("self-reviewed native blood", () => {
  test("ships the selected original RGBA files, with genuine RGBA headers", async () => {
    for (const [stage, hash] of [
      ["i", "56354ddb99f2e08ec334462d108e4685d9da315aaa67fdbf408e6bd1ba715304"],
      ["ii", "46d903d4199e8156c44729ec15cfcdec9e96c13eeb6b9e4c04036a58fc068bb6"],
    ] as const) {
      const bytes = await readFile(resolve(import.meta.dir, `../assets/terrain/blood-native-stage-${stage}.png`));
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

  test("rejects blood markers on other terrain and invalid detail layers", () => {
    const tile = plan(0).Tile[0]!;
    expect(terrainDocumentFlag(tile)).toEqual(tile.flags[moduleId]);
    for (const update of [{ configurationId: "fire" }, { configurationId: "frost" },
      { configurationId: "brambles" }, { configurationId: "acid" }, { configurationId: "flooding" }, { configurationId: "lava" }, { visualLayer: "detail" }, { stageIndex: 2 }]) {
      expect(terrainDocumentFlag({ ...tile, flags: { [moduleId]: { ...tile.flags[moduleId], ...update } } })).toBeUndefined();
    }
    expect(() => buildScenePlan({ bundleId: "bad", configurationId: "fire", stageIndex: 0, cells,
      visualEffect: "blood-static-v1", movementBehavior: () => ({ type: "modifyMovementCost", system: {} }) })).toThrow("not supported");
  });
});


test.each([0,1,2])("variant %s maps both stages and survives subset reordering", variant => {
  const opts={bundleId:"v",configurationId:"blood" as const,stageIndex:0,cells,visualEffect:"blood-static-v1" as const,
    bloodVariants:Object.fromEntries(cells.map(c=>[c.key,variant])),movementBehavior:()=>{throw Error("no region");}};
  const full=buildScenePlan(opts),subset=buildScenePlan({...opts,cells:cells.slice(1).reverse()});
  for(const tile of subset.Tile) expect(tile).toEqual(full.Tile.find(t=>t.flags[moduleId].cellKey===tile.flags[moduleId].cellKey)!);
  for(const stageIndex of [0,1]) {
    const tile=buildScenePlan({...opts,stageIndex}).Tile[0]!;
    const suffix=["","-b","-c"][variant];
    expect(tile.texture.src).toEndWith(`blood-native-stage-${stageIndex===0?"i":"ii"}${suffix}.png`);
    expect(terrainDocumentFlag(tile)?.bloodVariant).toBe(variant);
  }
});

test("rejects invalid and foreign blood variant markers",()=>{
  const tile=plan(0).Tile[0]!;
  for(const update of [{bloodVariant:-1},{bloodVariant:3},{bloodVariant:0.5},{bloodVariant:"1"},
    {bloodVariant:1,configurationId:"acid",visualEffect:"acid-static-v1"}, {bloodVariant:1,role:"terrain-light"}]) {
    expect(terrainDocumentFlag({...tile,flags:{[moduleId]:{...tile.flags[moduleId],...update}}})).toBeUndefined();
  }
});
