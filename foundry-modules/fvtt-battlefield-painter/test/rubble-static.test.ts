import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { normalizeCell } from "../src/geometry";
import { buildScenePlan } from "../src/scene-plan";
import { terrainDocumentFlag } from "../src/scene-ownership";
import { createMovementBehaviorFactory } from "../src/movement";
const M="fvtt-battlefield-painter";
const cells=Array.from({length:9},(_,n)=>{const i=Math.floor(n/3),j=n%3,x=j*100,y=i*100;return normalizeCell({key:`${i}:${j}`,offset:{i,j},center:{x:x+50,y:y+50},vertices:[{x,y},{x:x+100,y},{x:x+100,y:y+100},{x,y:y+100}]});});
const base={bundleId:"rubble",configurationId:"rubble" as const,stageIndex:0,cells,visualEffect:"rubble-static-v1" as const,movementBehavior:(multiplier:number)=>({type:"modifyMovementCost" as const,system:{difficulties:{walk:multiplier}}})};
test("rubble only doubles walking while other terrain retains its existing movement profile",()=>{
 class Model {constructor(readonly source:Record<string,unknown>={}){}validate(){return true;}toObject(){return this.source;}}
 const factory=createMovementBehaviorFactory({RegionBehavior:{dataModels:{modifyMovementCost:Model}},Token:{movement:{actions:{walk:{},fly:{},swim:{},burrow:{},crawl:{deriveTerrainDifficulty:()=>2}}}}});
 expect(buildScenePlan({...base,movementBehavior:factory}).Region[0]!.behaviors[0]!.system).toEqual({difficulties:{walk:2,fly:1,swim:1,burrow:1}});
 expect(factory(2).system).toEqual({difficulties:{walk:2,fly:2,swim:2,burrow:2}});
});
test.each([0,1,2])("rubble variant %s survives erasure while its actual movement area loses the erased cell",variant=>{
 const opts={...base,staticVariants:Object.fromEntries(cells.map(c=>[c.key,variant]))};
 const full=buildScenePlan(opts),ring=buildScenePlan({...opts,cells:cells.filter(c=>c.key!=="1:1").reverse()});
 expect(full.Tile).toHaveLength(9);expect(ring.Tile).toHaveLength(8);
 for(const tile of ring.Tile){expect(tile).toEqual(full.Tile.find(t=>t.flags[M].cellKey===tile.flags[M].cellKey)!);expect(tile.texture.src).toEndWith(`rubble-native-${["a","b","c"][variant]}.png`);expect(terrainDocumentFlag(tile)?.staticVariant).toBe(variant);}
 expect(ring.Region).toHaveLength(1);expect(ring.Region[0]!.shapes).toHaveLength(8);
 expect(ring.Region[0]!.shapes.some(s=>s.points.join(',')==='100,100,200,100,200,200,100,200')).toBe(false);
 expect(ring.Region[0]!.behaviors[0]!.system).toEqual({difficulties:{walk:2}});
 expect([full.AmbientLight,full.Wall,full.AmbientSound]).toEqual([[],[],[]]);
});
test("rubble rejects fake second stage, foreign ownership and malformed variant metadata",()=>{
 expect(()=>buildScenePlan({...base,stageIndex:1})).toThrow("Unknown stage");
 expect(()=>buildScenePlan({...base,staticVariants:{"0:0":3}})).toThrow("Invalid static variant");
 const tile=buildScenePlan(base).Tile[0]!;
 for(const update of [{stageIndex:1},{staticVariant:-1},{staticVariant:3},{staticVariant:.5},{staticVariant:"1"},{bloodVariant:1},{configurationId:"blood"},{role:"terrain-light"},{sheetCells:[{i:0,j:0}]},{visualLayer:"detail"}])expect(terrainDocumentFlag({...tile,flags:{[M]:{...tile.flags[M],...update}}})).toBeUndefined();
});
test("rubble ships three original RGBA assets",async()=>{
 const hashes=["d3feeb9c978bd8269acc1678ecb873b4c529156d3aeb4197a63d0dc9fa817ea8","77fc1b26fb61a7780ab0d8540affe20c51cdf4c9931bcb341b045ed0ecc722be","f2148bb7f9f2d06575f38bb06a200b6ef0efa09a63a254fe4fba1144f016e563"];
 for(const [n,v] of ["a","b","c"].entries()){const bytes=await readFile(resolve(import.meta.dir,`../assets/terrain/rubble-native-${v}.png`));expect(createHash("sha256").update(bytes).digest("hex")).toBe(hashes[n]!);expect(bytes[25]).toBe(6);expect(bytes.readUInt32BE(16)).toBe(1254);}
});
