import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FIRE_STATIC_PROFILE } from "../src/catalog";
import { fireStaticAppearance } from "../src/fire-static";
import { normalizeCell } from "../src/geometry";
import { buildScenePlan } from "../src/scene-plan";
import { terrainDocumentFlag } from "../src/scene-ownership";

const cells = Array.from({length: 9}, (_, n) => {
  const i = 7 + Math.floor(n / 3), j = 3 + n % 3, x = j * 70, y = i * 70;
  return normalizeCell({ key: `${i}:${j}`, offset: {i,j}, center: {x:x+35,y:y+35},
    vertices: [{x,y},{x:x+70,y},{x:x+70,y:y+70},{x,y:y+70}] });
});
const plan = (selected = cells, bundleId = "new", stageIndex = 0, p2Enabled = true) => buildScenePlan({
  bundleId, configurationId: "fire", stageIndex, cells: selected, p2Enabled,
  visualEffect: "fire-static-v2", visualBleed: 0.08, gridSize: 70, gridDistance: 5,
  movementBehavior: multiplier => ({type: "modifyMovementCost", system: {difficulties: {walk: multiplier}}}),
});

describe("approved static fire integration", () => {
  test("ships the three byte-identical approved RGBA assets", async () => {
    const hashes = [
      "7f5e58f2684fbcf5490b4d177cef7438e726ddbb1a156820cf82d90eb01a1abf",
      "89897e02b64044e0b35a6b851e3238da35ae3eb57902af6c6de1a63de9a6b380",
      "8da741570df741984e0f793262f3c4ea1569e9502a97c0635f4df94f6f714cf3",
    ];
    for (const [index, name] of ["a", "b", "c"].entries()) {
      const expectedHash = hashes[index];
      if (!expectedHash) throw new Error(`Missing approved hash for Fire variant ${name}`);
      const bytes = await readFile(resolve(import.meta.dir, `../assets/terrain/fire-native-${name}.png`));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(expectedHash);
      expect(bytes.readUInt32BE(16)).toBe(512);
      expect(bytes.readUInt32BE(20)).toBe(512);
      expect(bytes[25]).toBe(6); // PNG RGBA color type.
    }
  });

  test("matches approved Tile scale and per-cell native light parameters", () => {
    const result = plan();
    expect(result.Tile).toHaveLength(9);
    expect(result.AmbientLight).toHaveLength(9);
    expect(new Set(result.Tile.map(t=>t.texture.src)).size).toBe(3);
    for (const [index, tile] of result.Tile.entries()) {
      expect(tile).toMatchObject({x: cells[index]!.center.x, y: cells[index]!.center.y, width:98,height:98,alpha:1,texture:{tint:"#ffffff"}});
      expect([0,90,180,270]).toContain(tile.rotation!);
      expect(result.AmbientLight[index]).toMatchObject({ x:tile.x,y:tile.y,walls:true,
        config: {color:"#ff5018",alpha:0.25,bright:3,dim:12,attenuation:0.65,luminosity:0.2,coloration:100,
          animation:{type:"torch",speed:10,intensity:8}} });
      expect(terrainDocumentFlag(tile)?.visualEffect).toBe("fire-static-v2");
    }
    expect(result.Wall).toEqual([]);
    expect(result.AmbientSound).toEqual([]);
    expect(result.Region[0]!.behaviors[0]!.system).toEqual({difficulties:{walk:2}});
  });

  test("erase, stage splits and client phase settings do not shuffle surviving artwork", () => {
    const original = plan();
    const remaining = cells.filter(c=>c.key!=="8:4").reverse();
    const rebuilt = plan(remaining, "different-stroke", 1, false);
    for (const tile of rebuilt.Tile) {
      const before = original.Tile.find(t=>t.flags['fvtt-battlefield-painter'].cellKey===tile.flags['fvtt-battlefield-painter'].cellKey)!;
      expect({texture:tile.texture,rotation:tile.rotation,sort:tile.sort}).toEqual({texture:before.texture,rotation:before.rotation,sort:before.sort});
    }
    expect(rebuilt.AmbientLight).toHaveLength(8);
    expect(rebuilt.Region[0]!.shapes).toHaveLength(8);
    expect(rebuilt.Region[0]!.shapes).not.toContainEqual(original.Region[0]!.shapes[4]);
    for (let i=-8;i<=8;i++) for(let j=-8;j<=8;j++) {
      const appearance = fireStaticAppearance({i,j});
      expect(FIRE_STATIC_PROFILE.textures).toContain(appearance.texture);
      expect([0,90,180,270]).toContain(appearance.rotation);
    }
  });

  test("native fire marker cannot claim unrelated terrain ownership", () => {
    const tile = plan().Tile[0]!;
    expect(terrainDocumentFlag({...tile,flags:{'fvtt-battlefield-painter':{...tile.flags['fvtt-battlefield-painter'],configurationId:'frost'}}})).toBeUndefined();
    expect(()=>buildScenePlan({bundleId:'invalid',configurationId:'frost',stageIndex:0,cells,
      visualEffect:'fire-static-v2',movementBehavior:()=>({type:'modifyMovementCost',system:{}})})).toThrow('not supported');
  });
});
