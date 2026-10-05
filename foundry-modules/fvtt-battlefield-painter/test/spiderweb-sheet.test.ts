import { expect, test } from "bun:test";
import { SpiderwebSheet, sheetMaskPolygons } from "../src/spiderweb-sheet";
const M="fvtt-battlefield-painter";
const grid:any={getCenterPoint:({i,j}:any)=>({x:j*100+50,y:i*100+50}),getVertices:({i,j}:any)=>[{x:j*100,y:i*100},{x:j*100+100,y:i*100},{x:j*100+100,y:i*100+100},{x:j*100,y:i*100+100}]};
const flag:any={configurationId:"spiderweb",visualEffect:"spiderweb-sheet-v1",stageIndex:0,bundleId:"sheet",role:"terrain-tile",staticVariant:0,cellKey:"0:0",offset:{i:0,j:0},sheetCells:[{i:0,j:0},{i:0,j:1}],sheetFrame:{x:0,y:0,width:200,height:100}};
test("mask coordinates keep the original image placement after deleting a boundary cell",()=>{
 const before=sheetMaskPolygons(flag,grid);
 expect(before[1]).toEqual([{x:.5,y:0},{x:1,y:0},{x:1,y:1},{x:.5,y:1}]);
 expect(sheetMaskPolygons({...flag,sheetCells:[{i:0,j:1}]},grid)).toEqual([before[1]!]);
});
test("sheet owns one reusable mask and releases it on rebuild, foreign shader replacement and teardown",()=>{
 class Base {static get defaultUniforms(){return {occlusionTexture:"native"};} uniforms:any={...(this.constructor as typeof Base).defaultUniforms};}
 const masks:any[]=[];
 const mesh:any={shader:new Base(),setShaderClass(C:any){this.shader=new C();}};
 const tile:any={mesh,document:{flags:{[M]:structuredClone(flag)}}};
 const root:any={foundry:{canvas:{rendering:{shaders:{PrimaryBaseSamplerShader:Base}}}},canvas:{grid,tiles:{placeables:[tile]}},
 document:{createElement:()=>({getContext:()=>({beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){}})})},
 PIXI:{Texture:{from:()=>{const mask={destroyed:0,destroy(){this.destroyed++;}};masks.push(mask);return mask;}}}};
 const sheet=new SpiderwebSheet(root);sheet.onCanvasReady();sheet.onTileDrawn(tile);
 expect(masks).toHaveLength(1);expect(mesh.shader.uniforms.webMask).toBe(masks[0]);expect(mesh.shader.uniforms.occlusionTexture).toBe("native");
 tile.document.flags[M].sheetCells=[{i:0,j:0}];sheet.onTileDrawn(tile);
 expect(masks[0].destroyed).toBe(1);expect(masks).toHaveLength(2);
 class Foreign extends Base{};mesh.shader=new Foreign();sheet.onTileDrawn(tile);
 expect(masks[1].destroyed).toBe(1);expect(mesh.shader.constructor).toBe(Foreign);expect(sheet.audit()).toMatchObject({mountedTiles:0});
 mesh.shader=new Base();sheet.onTileDrawn(tile);sheet.onCanvasTearDown();sheet.onCanvasTearDown();
 expect(masks[2].destroyed).toBe(1);expect(mesh.shader.constructor).toBe(Base);
 expect(sheet.audit()).toMatchObject({mountedTiles:0,extraTickers:0,diagnostic:null});
 tile.document.flags[M].configurationId="magicCircle";tile.document.flags[M].visualEffect="catalog-sheet-v1";
 sheet.onCanvasReady();expect(sheet.audit()).toMatchObject({mountedTiles:1});
 expect(sheet.audit("spiderweb")).toMatchObject({mountedTiles:0});
 expect(sheet.audit("magicCircle")).toMatchObject({mountedTiles:1});
 tile.document.flags[M].stageIndex=99;sheet.onTileDrawn(tile);
 expect(sheet.audit()).toMatchObject({mountedTiles:0});expect(masks[3].destroyed).toBe(1);
});
