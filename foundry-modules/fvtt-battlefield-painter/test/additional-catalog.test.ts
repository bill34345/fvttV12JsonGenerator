import { expect, test } from "bun:test";
import { ADDITIONAL_TERRAINS, ADDITIONAL_ASSET_FILES } from "../src/catalog-additions";
import { normalizeCell } from "../src/geometry";
import { buildScenePlan } from "../src/scene-plan";
import { terrainDocumentFlag, bundleIdsAtCellKeys } from "../src/scene-ownership";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const M = "fvtt-battlefield-painter";
const cells = Array.from({length:9},(_,n)=>{const i=Math.floor(n/3),j=n%3,x=j*100,y=i*100;return normalizeCell({key:`${i}:${j}`,offset:{i,j},center:{x:x+50,y:y+50},vertices:[{x,y},{x:x+100,y},{x:x+100,y:y+100},{x,y:y+100}]});});
const movementBehavior = (multiplier:number, affected?:readonly string[]) => ({type:"modifyMovementCost" as const,system:{difficulties:{walk:multiplier,fly:affected ? 1 : multiplier}}});

test("remaining catalog has exact identities, observed stage counts and original reusable rune stages",()=>{
 expect(Object.keys(ADDITIONAL_TERRAINS)).toHaveLength(32);
 expect(ADDITIONAL_ASSET_FILES).toHaveLength(38);
 const counts={grease:2,hole:2,magicPlatform:2,mold:3,rift:3,runes:4};
 for(const config of Object.values(ADDITIONAL_TERRAINS)) expect(config.stages).toHaveLength(counts[config.id as keyof typeof counts]??1);
 expect(ADDITIONAL_TERRAINS.runes.stages.map(s=>s.texture)).toEqual([1,2,3,4].map(n=>ADDITIONAL_TERRAINS[`rune${n}` as "rune1"].stages[0].texture));
});

for (const configuration of Object.values(ADDITIONAL_TERRAINS)) {
 test(`${configuration.id}: every stage has owned documents, fixed image frame and correct rules`,()=>{
  for(const [stageIndex,stage] of configuration.stages.entries()) {
   const visualEffect = configuration.placement === "sheet" ? "catalog-sheet-v1" as const : "catalog-static-v1" as const;
   const opts={bundleId:"fixture",configurationId:configuration.id,stageIndex,cells,visualEffect,movementBehavior};
   const full=buildScenePlan(opts), first=full.Tile[0]!;
   expect(full.Tile).toHaveLength(configuration.placement === "sheet" ? 1 : 9);
   for(const tile of full.Tile) {expect(terrainDocumentFlag(tile)).toBeDefined();expect(tile.texture.src).toBe(stage.texture);}
   expect([...bundleIdsAtCellKeys({tiles:full.Tile},new Set(["2:2"]))]).toEqual(["fixture"]);
   const remaining=cells.filter(c=>c.key!=="1:1"&&c.offset.j!==0);
   const cut=buildScenePlan({...opts,cells:remaining,sheetFrame:first.flags[M].sheetFrame});
   if(configuration.placement === "sheet") {
    expect([cut.Tile[0]!.x,cut.Tile[0]!.y,cut.Tile[0]!.width,cut.Tile[0]!.height]).toEqual([150,150,300,300]);
    expect(cut.Tile[0]!.flags[M].sheetCells).toHaveLength(5);
    expect(()=>buildScenePlan({...opts,sheetFrame:{x:0,y:0,width:100,height:100}})).toThrow("outside");
   } else for(const tile of cut.Tile) expect(tile).toEqual(full.Tile.find(t=>t.flags[M].cellKey===tile.flags[M].cellKey)!);
   expect(full.Region).toHaveLength(configuration.movementMultiplier===1?0:1);
   if(full.Region.length){expect(cut.Region[0]!.shapes).toHaveLength(5);expect(full.Region[0]!.behaviors[0]!.system).toEqual({difficulties:{walk:2,fly:1}});}
   expect(full.AmbientLight.length>0).toBe(Boolean(stage.light));
   expect(full.Wall.length>0).toBe(Boolean(stage.createsWalls));
   if(full.Wall.length) for(const wall of full.Wall){expect(wall.move).toBe(20);expect(wall.sight).toBe(configuration.id==="pillar"?20:0);}
   expect(full.AmbientSound).toEqual([]);
   expect(()=>buildScenePlan({...opts,stageIndex:configuration.stages.length})).toThrow("Unknown stage");
   for(const bad of [{configurationId:"blood"},{staticVariant:9},{sheetCells:[]},{stageIndex:99}]) {
    if(bad.sheetCells && configuration.placement!=="sheet") continue;
    expect(terrainDocumentFlag({...first,flags:{[M]:{...first.flags[M],...bad}}})).toBeUndefined();
   }
  }
 });
}

test("all additional assets are RGBA PNG files",async()=>{
 for(const file of ADDITIONAL_ASSET_FILES){const bytes=await readFile(resolve(import.meta.dir,"../assets/terrain",file));expect(bytes.subarray(1,4).toString()).toBe("PNG");expect(bytes[25]).toBe(6);expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(512);}
});

test("six Ruidium artworks are individually selectable whole-sheet decorations without gameplay effects",()=>{
 const ids=["ruidiumVeinsSweep","ruidiumVeinsFan","ruidiumCrystalCrescent","ruidiumCrystalCross","ruidiumClusterThree","ruidiumClusterFive"] as const;
 const textures=new Set<string>();
 for(const id of ids){
  const config=ADDITIONAL_TERRAINS[id];
  expect(config.placement).toBe("sheet");expect(config.movementMultiplier).toBe(1);expect(config.stages).toHaveLength(1);
  const stage=config.stages[0];textures.add(stage.texture);expect(stage.textureVariants).toEqual([stage.texture]);
  const plan=buildScenePlan({bundleId:id,configurationId:id,stageIndex:0,cells,visualEffect:"catalog-sheet-v1",movementBehavior});
  expect(plan.Tile).toHaveLength(1);expect(plan.Region).toEqual([]);expect(plan.Wall).toEqual([]);expect(plan.AmbientLight).toEqual([]);expect(plan.AmbientSound).toEqual([]);
 }
 expect(textures.size).toBe(6);
});
