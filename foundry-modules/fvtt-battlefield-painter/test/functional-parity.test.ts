import { expect, test } from "bun:test";
import { buildScenePlan } from "../src/scene-plan";
import { normalizeCell } from "../src/geometry";
import { cellsForRegions } from "../src/region-paint";
import { TERRAIN_AUDIO } from "../src/terrain-audio";
import { TERRAIN_COLORS, supportsTerrainColor } from "../src/terrain-colors";
const id = "fvtt-battlefield-painter";
const cell = normalizeCell({ key: "0:0", offset: {i:0,j:0}, center:{x:50,y:50}, vertices:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}] });
const options = { bundleId:"parity", configurationId:"acid" as const, stageIndex:0, cells:[cell], gridSize:100, gridDistance:5,
  movementBehavior:()=>({type:"modifyMovementCost" as const,system:{}}), functionalityVersion:1 as const };
test("new acid light scales by grid distance without changing legacy acid or adding mechanics",()=>{
  const a = buildScenePlan(options), b = buildScenePlan({...options,gridDistance:10});
  expect(a.AmbientLight).toHaveLength(1);
  expect(b.AmbientLight[0]!.config.dim).toBeCloseTo(a.AmbientLight[0]!.config.dim*2,0);
  expect(a.Region).toEqual([]); expect(a.Wall).toEqual([]);
  expect(buildScenePlan({...options,functionalityVersion:undefined}).AmbientLight).toEqual([]);
  expect(buildScenePlan({...options,stageIndex:1}).AmbientLight[0]!.config.alpha).toBeGreaterThan(a.AmbientLight[0]!.config.alpha);
});
test("palette persists on art and light, with white-light attenuation and excluded effects unchanged",()=>{
  expect(TERRAIN_COLORS).toHaveLength(13);
  const original = buildScenePlan({...options,configurationId:"fire",visualEffect:"fire-static-v2"});
  const blue = buildScenePlan({...options,configurationId:"fire",visualEffect:"fire-static-v2",colorId:"blue"});
  expect(blue.Tile[0]!.flags[id].colorId).toBe("blue");
  expect(blue.Tile[0]!.texture).toEqual(original.Tile[0]!.texture);
  expect(blue.AmbientLight[0]!.config.color).toBe("#689bef");
  const white = buildScenePlan({...options,configurationId:"fire",visualEffect:"fire-static-v2",colorId:"white"});
  expect(white.AmbientLight[0]!.config.alpha).toBeLessThan(original.AmbientLight[0]!.config.alpha);
  for (const configurationId of ["rift","wildMagic"] as const) {
    expect(supportsTerrainColor(configurationId)).toBe(false);
    expect(TERRAIN_AUDIO[configurationId]).toBeUndefined();
    const old=buildScenePlan({...options,configurationId,functionalityVersion:undefined});
    const next=buildScenePlan({...options,configurationId,colorId:"blue",audioEnabled:true});
    expect(next.AmbientLight[0]!.config).toEqual(old.AmbientLight[0]!.config);
    expect(next.AmbientSound).toEqual([]);
  }
});
test("audio is explicit, one source per stroke, and absent in legacy plans",()=>{
  for (const configurationId of Object.keys(TERRAIN_AUDIO) as Array<keyof typeof TERRAIN_AUDIO>) {
    expect(buildScenePlan({...options,configurationId}).AmbientSound).toEqual([]);
    const p=buildScenePlan({...options,configurationId,audioEnabled:true});
    expect(p.AmbientSound).toHaveLength(1);
    expect(p.AmbientSound[0]).toMatchObject({repeat:true,easing:true,walls:true});
    expect(p.Tile[0]!.flags[id].audioEnabled).toBe(true);
  }
});
test("V3 separates Fire/Lava and Holy/Magic Circle while preserving the approved Energy family",()=>{
  expect(TERRAIN_AUDIO.lava!.path).not.toBe(TERRAIN_AUDIO.fire!.path);
  expect(TERRAIN_AUDIO.magicCircle!.path).not.toBe(TERRAIN_AUDIO.holyLight!.path);
  for (const configurationId of ["forceBarrier", "lightningField", "portal"] as const) {
    expect(TERRAIN_AUDIO[configurationId]).toEqual({path:"modules/fvtt-battlefield-painter/assets/audio/energy-loop.ogg",volume:0.1});
  }
  const first=buildScenePlan({...options,audioEnabled:true});
  const second=buildScenePlan({...options,stageIndex:1,audioEnabled:true});
  expect(first.AmbientSound).toHaveLength(1);
  expect(second.AmbientSound).toHaveLength(1);
  expect(first.AmbientSound[0]!.volume).toBeCloseTo(second.AmbientSound[0]!.volume*0.65);
  expect(second.AmbientSound[0]!.volume).toBeGreaterThan(first.AmbientSound[0]!.volume);
});
test("new roots have no movement or wall; old dense and wall indices remain intact",()=>{
  for (const stageIndex of [0,1,2]) {
    const p=buildScenePlan({...options,configurationId:"brambles",stageIndex,visualEffect:"brambles-static-v2"});
    expect(p.Region.length).toBe(stageIndex===2?0:1);
    expect(p.Wall.length).toBe(stageIndex===1?4:0);
    expect(p.Tile[0]!.texture.src).toEndWith(stageIndex===2?"brambles-native-roots.png":stageIndex===0?"brambles-native-stage-i.png":"brambles-native-stage-ii.png");
  }
});
test("region painting deduplicates overlaps, preserves holes and clips to scene",()=>{
  const grid:any={getOffsetRange:()=>[0,0,3,3],getCenterPoint:({i,j}:any)=>({x:j*100+50,y:i*100+50}),getVertices:({i,j}:any)=>[{x:j*100,y:i*100},{x:j*100+100,y:i*100},{x:j*100+100,y:i*100+100},{x:j*100,y:i*100+100}]};
  const region={bounds:{x:0,y:0,width:300,height:300},polygonTree:{testPoint:({x,y}:any)=>!(x===150&&y===150)}};
  const bounds={x:0,y:0,width:300,height:300};
  expect(cellsForRegions(grid,[region,region],bounds)).toHaveLength(8);
  expect(cellsForRegions(grid,[region],{...bounds,width:100})).toHaveLength(3);
  expect(()=>cellsForRegions({...grid,getOffsetRange:()=>[0,0,1000,1000]},[region],bounds)).toThrow("10000");
});
