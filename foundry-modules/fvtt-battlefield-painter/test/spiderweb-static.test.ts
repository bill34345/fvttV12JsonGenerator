import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { normalizeCell } from "../src/geometry";
import { buildScenePlan } from "../src/scene-plan";
import { terrainDocumentFlag } from "../src/scene-ownership";
const M="fvtt-battlefield-painter";
const cells=Array.from({length:9},(_,n)=>{const i=Math.floor(n/3),j=n%3,x=j*100,y=i*100;return normalizeCell({key:`${i}:${j}`,offset:{i,j},center:{x:x+50,y:y+50},vertices:[{x,y},{x:x+100,y},{x:x+100,y:y+100},{x,y:y+100}]});});
const base={bundleId:"web",configurationId:"spiderweb" as const,stageIndex:0,cells,visualEffect:"spiderweb-static-v1" as const,movementBehavior:()=>{throw Error("web must not add movement rule");}};
test("whole web scales once across nine cells; boundary erase preserves image frame",()=>{
 const full=buildScenePlan({...base,visualEffect:"spiderweb-sheet-v1"});
 expect(full.Tile).toHaveLength(1);const tile=full.Tile[0]!;
 expect([tile.x,tile.y,tile.width,tile.height]).toEqual([150,150,300,300]);
 expect(terrainDocumentFlag(tile)?.sheetCells).toHaveLength(9);
 const remaining=cells.filter(c=>c.offset.j>0 && c.key!=="1:1");
 const cut=buildScenePlan({...base,visualEffect:"spiderweb-sheet-v1",cells:remaining,sheetFrame:tile.flags[M].sheetFrame}).Tile[0]!;
 expect([cut.x,cut.y,cut.width,cut.height,cut.texture]).toEqual([tile.x,tile.y,tile.width,tile.height,tile.texture]);
 expect(cut.flags[M].sheetCells).toHaveLength(5);
 for(const update of [{sheetCells:[]},{sheetCells:[null]},{sheetCells:[{i:0,j:0},{i:0,j:0}]},{sheetFrame:{x:0,y:0,width:0,height:300}},{sheetFrame:undefined},{staticVariant:undefined},{role:"terrain-light"}]) expect(terrainDocumentFlag({...tile,flags:{[M]:{...tile.flags[M],...update}}})).toBeUndefined();
});
test.each([0,1,2])("web variant %s is static, transparent-media based and stable across subset rebuild",variant=>{
 const opts={...base,staticVariants:Object.fromEntries(cells.map(c=>[c.key,variant]))};
 const full=buildScenePlan(opts),ring=buildScenePlan({...opts,cells:cells.filter(c=>c.key!=="1:1").reverse()});
 expect(ring.Tile).toHaveLength(8);
 for(const tile of ring.Tile){expect(tile).toEqual(full.Tile.find(t=>t.flags[M].cellKey===tile.flags[M].cellKey)!);expect(tile.texture.src).toEndWith(`spiderweb-native-${["a","b","c"][variant]}.png`);expect(terrainDocumentFlag(tile)?.staticVariant).toBe(variant);}
 expect([full.Region,full.AmbientLight,full.Wall,full.AmbientSound]).toEqual([[],[],[],[]]);
});
test("web has no fabricated second stage and rejects wrong ownership/variants",()=>{
 expect(()=>buildScenePlan({...base,stageIndex:1})).toThrow("Unknown stage");
 expect(()=>buildScenePlan({...base,staticVariants:{"0:0":3}})).toThrow("Invalid static variant");
 const tile=buildScenePlan(base).Tile[0]!;
 for(const update of [{stageIndex:1},{staticVariant:-1},{staticVariant:3},{staticVariant:0.5},{staticVariant:"1"},{bloodVariant:1},{configurationId:"blood",visualEffect:"blood-static-v1"},{role:"terrain-light"},{visualLayer:"detail"}])expect(terrainDocumentFlag({...tile,flags:{[M]:{...tile.flags[M],...update}}})).toBeUndefined();
});
test("web ships original RGBA assets",async()=>{
 {const bytes=await readFile(resolve(import.meta.dir,"../assets/terrain/spiderweb-native-a.png"));expect(createHash("sha256").update(bytes).digest("hex")).toBe("31272b9e5952a108e9450e2c9f9808f8cda1e9d4189510541a3d4230ad6bc9bf");expect(bytes[25]).toBe(6);expect(bytes.readUInt32BE(16)).toBe(1254);}
 {const bytes=await readFile(resolve(import.meta.dir,"../assets/terrain/spiderweb-native-b.png"));expect(createHash("sha256").update(bytes).digest("hex")).toBe("435b1bf2a8531b2f6b8df5ac39c38d930a0df352edde1d248730244cb1dcaf14");expect(bytes[25]).toBe(6);expect(bytes.readUInt32BE(16)).toBe(1254);}
 {const bytes=await readFile(resolve(import.meta.dir,"../assets/terrain/spiderweb-native-c.png"));expect(createHash("sha256").update(bytes).digest("hex")).toBe("588fb9e83a79ad50a3f68820dde4966ad807de5fe1917902f819173775833f31");expect(bytes[25]).toBe(6);expect(bytes.readUInt32BE(16)).toBe(1254);}
});
