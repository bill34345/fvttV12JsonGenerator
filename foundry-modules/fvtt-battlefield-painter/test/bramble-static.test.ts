import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeCell } from "../src/geometry";
import { buildScenePlan } from "../src/scene-plan";
import { terrainDocumentFlag } from "../src/scene-ownership";
import { auditNativeBrambles } from "../src/bramble-static";

const id = "fvtt-battlefield-painter";
const cells = Array.from({length:9}, (_, n) => {
  const i = Math.floor(n / 3), j = n % 3, x = j * 70, y = i * 70;
  return normalizeCell({ key: `${i}:${j}`, offset:{i,j}, center:{x:x+35,y:y+35},
    vertices:[{x,y},{x:x+70,y},{x:x+70,y:y+70},{x,y:y+70}] });
});
const plan = (stageIndex: number, selected = cells) => buildScenePlan({
  bundleId:"brambles",configurationId:"brambles",stageIndex,cells:selected,
  visualEffect:"brambles-static-v2",
  movementBehavior: multiplier => ({type:"modifyMovementCost",system:{difficulties:{walk:multiplier}}}),
});

describe("approved native brambles", () => {
  test("packages exactly the two user-approved transparent originals", async () => {
    for (const [name, hash] of [
      ["i", "382d0ba4e4ecd71a5f359c7c2d8f9abcda0cdd1ac84f92da61d37b2de96551d1"],
      ["ii", "144c94d7846101eeb0a5f583497d16781e41071bf1aa0e0589f6c1b14f898578"],
    ] as const) {
      const bytes = await readFile(resolve(import.meta.dir, `../assets/terrain/brambles-native-stage-${name}.png`));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
      expect(bytes.readUInt32BE(16)).toBe(1254);
      expect(bytes.readUInt32BE(20)).toBe(1254);
      expect(bytes[25]).toBe(6);
    }
  });

  test("uses full-color native Tiles with visual-only overlap and stable stage orientation", () => {
    const first=plan(0), second=plan(1);
    expect(first.Tile.map(t=>t.rotation)).toEqual([0,90,180,270,180,90,90,0,270]);
    for (const [index,tile] of second.Tile.entries()) {
      expect(tile).toMatchObject({width:94.5,height:94.5,alpha:1,texture:{tint:"#ffffff"}});
      expect(tile.texture.src).toEndWith("brambles-native-stage-ii.png");
      expect(tile.rotation).toBe(first.Tile[index]!.rotation);
      expect(tile.sort).toBe(first.Tile[index]!.sort);
      expect(tile.flags[id]).toMatchObject({visualEffect:"brambles-static-v2",stageIndex:1});
    }
    expect(first.Region[0]!.shapes).toEqual(second.Region[0]!.shapes);
    expect(first.Region[0]!.behaviors[0]!.system).toEqual({difficulties:{walk:2}});
    expect(first.Wall).toHaveLength(0);
    expect(second.Wall).toHaveLength(12);
    expect(second.Wall.every(w=>w.move===20&&w.sight===0&&w.light===0)).toBe(true);
    expect(first.AmbientLight).toEqual([]);
    expect(second.AmbientLight).toEqual([]);
    expect(first.AmbientSound).toEqual([]);
    expect(second.AmbientSound).toEqual([]);
  });

  test("erasing a center keeps an actual movement/wall hole and all survivors' appearance", () => {
    const first=plan(1), ring=plan(1,cells.filter(c=>c.key!=="1:1").reverse());
    expect(ring.Tile).toHaveLength(8);
    expect(ring.Region[0]!.shapes).toHaveLength(8);
    expect(ring.Wall).toHaveLength(16);
    for (const tile of ring.Tile) {
      const old=first.Tile.find(t=>t.flags[id].cellKey===tile.flags[id].cellKey)!;
      expect(tile).toEqual(old);
    }
  });

  test("does not accept a bramble marker on another terrain or accept a detail layer", () => {
    const tile=plan(0).Tile[0]!;
    for (const update of [{configurationId:"fire"},{configurationId:"frost"},{visualLayer:"detail"}]) {
      expect(terrainDocumentFlag({...tile,flags:{[id]:{...tile.flags[id],...update}}})).toBeUndefined();
    }
    expect(()=>buildScenePlan({bundleId:"bad",configurationId:"frost",stageIndex:0,cells,
      visualEffect:"brambles-static-v2",movementBehavior:()=>({type:"modifyMovementCost",system:{}})})).toThrow("not supported");
  });

  test("reports native and legacy Tiles without consulting a retired client preference", () => {
    const native=plan(0).Tile[0]!;
    const legacy={...native,flags:{[id]:{...native.flags[id],visualEffect:undefined}}};
    const root={game:{settings:{get(){throw new Error("Retired preferences must not be read");}}},
      canvas:{scene:{id:"scene",tiles:[{...native,object:{mesh:{texture:{valid:true}}}},legacy,{flags:{}}]}}};
    expect(auditNativeBrambles(root)).toMatchObject({mode:"native",cells:1,loadedTiles:1,legacyTiles:1,mounted:false,meshCount:0});
  });
});
