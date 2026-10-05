import { describe, expect, test } from "bun:test";
import { AcidMotion, ACID_FRAGMENT, FLOODING_MOTION_PROFILE, LAVA_MOTION_PROFILE } from "../src/acid-motion";

class NativeShader {
  static get defaultUniforms() { return { occlusionTexture: "native", tintAlpha: [1, 1, 1, 1] }; }
  uniforms: any = { ...(this.constructor as typeof NativeShader).defaultUniforms };
  nativePreRender = 0;
  _preRender() { this.nativePreRender++; }
}
const fixture = () => {
  const mesh = { destroyed: false, shader: new NativeShader(), changes: 0,
    setShaderClass(C: any) { this.shader = new C(); this.changes++; } };
  const tile = { mesh, document: { flags: { "fvtt-battlefield-painter": {
    configurationId: "acid", visualEffect: "acid-static-v1", stageIndex: 0,
    bundleId: "a", role: "terrain-tile", offset: { i: 3, j: 5 },
  } } } };
  const root = { foundry: { canvas: { rendering: { shaders: { PrimaryBaseSamplerShader: NativeShader } } } },
    canvas: { tiles: { placeables: [tile] }, app: { ticker: { lastTime: 12500 } } } };
  return { mesh, tile, root, motion: new AcidMotion(root) };
};

describe("acid native material", () => {
  test("preserves native occlusion, source alpha and shared render timing", () => {
    const { mesh, motion } = fixture();
    motion.onCanvasReady();
    mesh.shader._preRender();
    expect(mesh.shader.nativePreRender).toBe(1);
    expect(mesh.shader.uniforms.occlusionTexture).toBe("native");
    expect(mesh.shader.uniforms.acidTime).toBeCloseTo(Math.PI / 2);
    expect(ACID_FRAGMENT).toContain("vec4(color, base.a) * tintAlpha");
    expect(ACID_FRAGMENT).toContain("min(base.a, moved.a)");
    expect(motion.audit()).toMatchObject({ mountedTiles: 1, extraTickers: 0 });
  });
  test("stage updates keep phase stable, repeated refresh is idempotent, teardown restores material", () => {
    const { mesh, tile, motion } = fixture();
    motion.onCanvasReady();
    const phase = mesh.shader.uniforms.acidPhase;
    tile.document.flags["fvtt-battlefield-painter"].stageIndex = 1;
    motion.onTileDrawn(tile);
    expect(mesh.changes).toBe(1);
    expect(mesh.shader.uniforms.acidStrength).toBe(0.014);
    expect(mesh.shader.uniforms.acidPhase).toBe(phase);
    motion.onCanvasTearDown();
    expect(mesh.shader.constructor).toBe(NativeShader);
    expect(motion.audit()).toMatchObject({ mountedTiles: 0 });
  });
  test("destroy, redraw and terrain replacement do not retain old mesh references", () => {
    const { tile, mesh, motion } = fixture();
    motion.onCanvasReady();
    mesh.destroyed = true;
    motion.onTileDestroyed(tile);
    expect(motion.audit()).toMatchObject({ mountedTiles: 0 });
    tile.mesh = { ...mesh, destroyed: false, shader: new NativeShader() };
    motion.onTileDrawn(tile);
    expect(motion.audit()).toMatchObject({ mountedTiles: 1 });
    tile.document.flags["fvtt-battlefield-painter"].configurationId = "frost";
    motion.onTileDrawn(tile);
    expect(tile.mesh.shader.constructor).toBe(NativeShader);
    expect(motion.audit()).toMatchObject({ mountedTiles: 0 });
  });
  test("leaves foreign terrain and third-party materials untouched", () => {
    const { tile, mesh, motion } = fixture();
    class ForeignShader extends NativeShader {}
    mesh.shader = new ForeignShader();
    motion.onTileDrawn(tile);
    expect(mesh.changes).toBe(0);
    expect(mesh.shader.constructor).toBe(ForeignShader);
    expect(motion.audit()).toMatchObject({ mountedTiles: 0 });
  });
});


test("flooding shares lifecycle while preserving the accepted acid clock and strengths", () => {
  const a = fixture(), f = fixture();
  f.tile.document.flags["fvtt-battlefield-painter"].configurationId = "flooding";
  f.tile.document.flags["fvtt-battlefield-painter"].visualEffect = "flooding-static-v1";
  const water = new AcidMotion(f.root, FLOODING_MOTION_PROFILE);
  a.motion.onTileDrawn(f.tile);
  expect(a.motion.audit()).toMatchObject({mountedTiles:0});
  water.onTileDrawn(a.tile);
  expect(water.audit()).toMatchObject({mountedTiles:0});
  a.motion.onCanvasReady();water.onCanvasReady();
  a.mesh.shader._preRender();f.mesh.shader._preRender();
  expect(a.mesh.shader.uniforms.acidStrength).toBe(0.009);
  expect(a.mesh.shader.uniforms.acidTime).toBeCloseTo(Math.PI/2);
  expect(f.mesh.shader.uniforms.acidStrength).toBe(0.006);
  expect(f.mesh.shader.uniforms.acidTime).toBeCloseTo(Math.PI/12);
  expect(water.audit()).toMatchObject({mountedTiles:1,periodSeconds:12});
  f.tile.document.flags["fvtt-battlefield-painter"].stageIndex=1;
  water.onTileDrawn(f.tile);
  expect(f.mesh.shader.uniforms.acidStrength).toBe(0.010);
  water.onCanvasTearDown();
  expect(water.audit()).toMatchObject({mountedTiles:0});
  expect(a.motion.audit()).toMatchObject({mountedTiles:1,periodSeconds:10});
});


test("lava only animates molten stage and releases its material when cooled", () => {
  const f = fixture();
  const flag = f.tile.document.flags["fvtt-battlefield-painter"];
  flag.configurationId = "lava"; flag.visualEffect = "lava-static-v1";
  const lava = new AcidMotion(f.root, LAVA_MOTION_PROFILE);
  lava.onCanvasReady();
  expect(lava.audit()).toMatchObject({ mountedTiles: 0 });
  expect(f.mesh.shader.constructor).toBe(NativeShader);
  flag.stageIndex = 1; lava.onTileDrawn(f.tile);
  expect(lava.audit()).toMatchObject({ mountedTiles: 1, periodSeconds: 16, extraTickers: 0 });
  expect(f.mesh.shader.uniforms.acidStrength).toBe(0.004);
  flag.stageIndex = 0; lava.onTileDrawn(f.tile);
  expect(lava.audit()).toMatchObject({ mountedTiles: 0 });
  expect(f.mesh.shader.constructor).toBe(NativeShader);
});
