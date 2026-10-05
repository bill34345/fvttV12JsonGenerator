import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeCell } from "../src/geometry";
import { buildScenePlan } from "../src/scene-plan";
import { terrainDocumentFlag, ownedDocumentCounts } from "../src/scene-ownership";

const cells = Array.from({length:9},(_,n)=>{
  const i=6+Math.floor(n/3),j=2+n%3,x=j*70,y=i*70;
  return normalizeCell({key:`${i}:${j}`,offset:{i,j},center:{x:x+35,y:y+35},
    vertices:[{x,y},{x:x+70,y},{x:x+70,y:y+70},{x,y:y+70}]});
});
const plan=(stageIndex:number,selected=cells,bundleId='frost')=>buildScenePlan({
  bundleId,configurationId:'frost',stageIndex,cells:selected,visualEffect:'frost-static-v2',
  movementBehavior: multiplier=>({type:'modifyMovementCost',system:{difficulties:{walk:multiplier}}}),
  gridSize:70,gridDistance:5,
});

describe('approved native Frost',()=>{
  test('preserves the exact approved RGBA grain and ice files',async()=>{
    for(const [name,hash] of [
      ['grains','934802b2de9058db8bf0639f4ba5c58fcfe43c203bd006bea29eb976cc160df5'],
      ['ice','9bf90a0246dca2985b950cddf09d1fb3cde8559b2cef4a3cda879a1e0925f708'],
    ] as const){
      const bytes=await readFile(resolve(import.meta.dir,`../assets/terrain/frost-native-${name}.png`));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
      expect(bytes.readUInt32BE(16)).toBe(1254);
      expect(bytes.readUInt32BE(20)).toBe(1254);
      expect(bytes[25]).toBe(6);
    }
  });

  test('creates thin film below all grains with one movement shape and light per cell',()=>{
    const result=plan(0),bases=result.Tile.filter(t=>t.flags['fvtt-battlefield-painter'].visualLayer==='base'),
      details=result.Tile.filter(t=>t.flags['fvtt-battlefield-painter'].visualLayer==='detail');
    expect(bases).toHaveLength(9);expect(details).toHaveLength(9);
    expect(result.Region[0]!.shapes).toHaveLength(9);
    expect(result.Region[0]!.behaviors[0]!.system).toEqual({difficulties:{walk:2}});
    expect(result.AmbientLight).toHaveLength(9);
    expect(Math.min(...details.map(t=>t.sort!))).toBeGreaterThan(Math.max(...bases.map(t=>t.sort!)));
    for(const [index,base] of bases.entries()){
      const detail=details.find(t=>t.flags['fvtt-battlefield-painter'].cellKey===base.flags['fvtt-battlefield-painter'].cellKey)!;
      expect(base).toMatchObject({x:cells[index]!.center.x,y:cells[index]!.center.y,width:98,height:98,alpha:0.2,texture:{tint:'#ffffff'}});
      expect(base.texture.src).toEndWith('frost-native-ice.png');
      expect(detail).toMatchObject({x:base.x,y:base.y,width:base.width,height:base.height,rotation:base.rotation,alpha:1});
      expect(detail.texture.src).toEndWith('frost-native-grains.png');
      expect([0,180]).toContain(base.rotation!);
    }
    expect(ownedDocumentCounts({tiles:result.Tile,regions:result.Region,lights:result.AmbientLight})).toMatchObject({tiles:18,regions:1,lights:9,totalDocuments:28});
  });

  test('both stages use final speed 3, retaining their approved light amplitudes',()=>{
    for(const stage of [0,1]){
      const result=plan(stage);
      expect(result.Tile).toHaveLength(stage===0?18:9);
      for(const light of result.AmbientLight) expect(light).toMatchObject({walls:true,config:{
        color:'#9bdcff',alpha:stage===0?0.06:0.18,bright:1,dim:8,attenuation:0.65,luminosity:0.1,coloration:100,
        animation:{type:'torch',speed:3,intensity:6},
      }});
      expect(result.AmbientSound).toEqual([]);expect(result.Wall).toEqual([]);
    }
  });

  test('surviving cells retain rotation, layering and sort across split/reordered strokes',()=>{
    const first=plan(0),rebuilt=plan(0,cells.filter(c=>c.key!=='7:3').reverse(),'split');
    for(const t of rebuilt.Tile){const f=t.flags['fvtt-battlefield-painter'];
      const old=first.Tile.find(v=>v.flags['fvtt-battlefield-painter'].cellKey===f.cellKey&&v.flags['fvtt-battlefield-painter'].visualLayer===f.visualLayer)!;
      expect({src:t.texture.src,alpha:t.alpha,rotation:t.rotation,sort:t.sort}).toEqual({src:old.texture.src,alpha:old.alpha,rotation:old.rotation,sort:old.sort});
    }
    expect(rebuilt.Tile).toHaveLength(16);expect(rebuilt.AmbientLight).toHaveLength(8);expect(rebuilt.Region[0]!.shapes).toHaveLength(8);
  });

  test('rejects crossed configurations, unknown layers and stage-II grain ownership',()=>{
    const t=plan(0).Tile[0]!,flag=t.flags['fvtt-battlefield-painter'];
    for(const change of [{configurationId:'fire'},{visualLayer:'invented'},{visualLayer:'detail',stageIndex:1},{visualEffect:'frost-field-v1',visualLayer:'detail'}]){
      expect(terrainDocumentFlag({...t,flags:{'fvtt-battlefield-painter':{...flag,...change}}})).toBeUndefined();
    }
    expect(terrainDocumentFlag(t)).toMatchObject({visualEffect:'frost-static-v2',visualLayer:'base'});
    expect(()=>buildScenePlan({bundleId:'bad',configurationId:'fire',stageIndex:0,cells,
      visualEffect:'frost-static-v2',movementBehavior:()=>({type:'modifyMovementCost',system:{}})})).toThrow('not supported');
  });
});
