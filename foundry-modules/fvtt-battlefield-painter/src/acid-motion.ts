import { terrainDocumentFlag } from "./scene-ownership";

/** Local UV motion only: the approved source alpha remains the exact silhouette. */
export const ACID_FRAGMENT = `
  uniform float acidTime;
  uniform float acidPhase;
  uniform float acidStrength;
  vec4 _main() {
    vec4 base = texture(sampler, vUvs);
    float t = acidTime + acidPhase;
    vec2 flow = vec2(sin(vUvs.y * 14.0 + t), cos(vUvs.x * 12.0 - t));
    vec2 uv = clamp(vUvs + flow * acidStrength, vec2(0.0), vec2(1.0));
    vec4 moved = texture(sampler, uv);
    float interior = smoothstep(0.65, 0.98, min(base.a, moved.a));
    vec3 color = mix(base.rgb, moved.rgb * base.a / max(moved.a, 0.001), interior * 0.8);
    // A restrained travelling reflection, never an emitted light or a whole-Tile fade.
    color *= 1.0 + 0.025 * sin(vUvs.x * 9.0 + vUvs.y * 11.0 - t * 2.0) * interior;
    return vec4(color, base.a) * tintAlpha;
  }
`;

interface AcidRoot { foundry?: any; canvas?: any; console?: Pick<Console, "error"> }

export interface LiquidMotionProfile {
  configurationId: "acid" | "flooding" | "lava";
  visualEffect: "acid-static-v1" | "flooding-static-v1" | "lava-static-v1";
  periodMs: number;
  strengths: readonly [number, number];
}
export const ACID_MOTION_PROFILE: LiquidMotionProfile = {
  configurationId: "acid", visualEffect: "acid-static-v1", periodMs: 10000, strengths: [0.009, 0.014],
};
export const FLOODING_MOTION_PROFILE: LiquidMotionProfile = {
  configurationId: "flooding", visualEffect: "flooding-static-v1", periodMs: 12000, strengths: [0.006, 0.010],
};

export const LAVA_MOTION_PROFILE: LiquidMotionProfile = {
  configurationId: "lava", visualEffect: "lava-static-v1", periodMs: 16000, strengths: [0, 0.004],
};

/** Uses the native Tile mesh, occlusion/depth shader and render clock; no extra ticker or media. */
export class AcidMotion {
  readonly #root: AcidRoot;
  readonly #profile: LiquidMotionProfile;
  #shaderClass: any;
  readonly #mounted = new Map<any, { mesh: any; originalClass: any }>();
  #diagnostic: string | undefined;

  constructor(root: AcidRoot, profile: LiquidMotionProfile = ACID_MOTION_PROFILE) {
    this.#root = root;
    this.#profile = profile;
  }

  #getShaderClass(): any {
    if (this.#shaderClass) return this.#shaderClass;
    const Base = this.#root.foundry?.canvas?.rendering?.shaders?.PrimaryBaseSamplerShader;
    if (!Base) return undefined;
    const root = this.#root;
    const profile = this.#profile;
    this.#shaderClass = class AcidSamplerShader extends Base {
      // The native occlusion/depth program is retained; this material is not batch-compatible.
      static classPluginName = null;
      static _fragmentShader = ACID_FRAGMENT;
      static get defaultUniforms() {
        return { ...super.defaultUniforms, acidTime: 0, acidPhase: 0, acidStrength: profile.strengths[0] };
      }
      _preRender(mesh: any, renderer: any) {
        super._preRender(mesh, renderer);
        const ms = root.canvas?.app?.ticker?.lastTime ?? 0;
        this.uniforms.acidTime = (ms % profile.periodMs) / profile.periodMs * Math.PI * 2;
      }
    };
    return this.#shaderClass;
  }

  onTileDrawn(tile: any): void {
    const flag = terrainDocumentFlag(tile?.document ?? {});
    const mesh = tile?.mesh;
    if (flag?.configurationId !== this.#profile.configurationId || flag.visualEffect !== this.#profile.visualEffect) {
      this.onTileDestroyed(tile);
      return;
    }
    if (this.#profile.strengths[flag.stageIndex] === 0) {
      this.onTileDestroyed(tile);
      return;
    }
    if (!mesh || mesh.destroyed || typeof mesh.setShaderClass !== "function") return;
    const Shader = this.#getShaderClass();
    const Base = this.#root.foundry?.canvas?.rendering?.shaders?.PrimaryBaseSamplerShader;
    if (!Shader) return;
    const previous = this.#mounted.get(tile);
    if (previous && previous.mesh !== mesh) this.onTileDestroyed(tile);
    // A different module's custom material retains ownership of the mesh.
    if (mesh.shader?.constructor !== Base && mesh.shader?.constructor !== Shader) return;
    try {
      if (mesh.shader.constructor !== Shader) {
        const originalClass = mesh.shader.constructor;
        mesh.setShaderClass(Shader);
        this.#mounted.set(tile, { mesh, originalClass });
      }
      const offset = flag.offset ?? { i: 0, j: 0 };
      mesh.shader.uniforms.acidPhase = ((offset.i * 17 + offset.j * 31) % 101) / 101 * Math.PI * 2;
      mesh.shader.uniforms.acidStrength = this.#profile.strengths[flag.stageIndex]!;
    } catch (error) {
      this.onTileDestroyed(tile);
      this.#diagnostic = error instanceof Error ? error.message : String(error);
      this.#root.console?.error(`[fvtt-battlefield-painter] ${this.#profile.configurationId} material: ${this.#diagnostic}`);
    }
  }

  onTileDestroyed(tile: any): void {
    const entry = this.#mounted.get(tile);
    if (!entry) return;
    this.#mounted.delete(tile);
    if (!entry.mesh.destroyed && entry.mesh.shader?.constructor === this.#shaderClass) {
      entry.mesh.setShaderClass(entry.originalClass);
    }
  }

  onCanvasReady(): void {
    for (const tile of this.#root.canvas?.tiles?.placeables ?? []) this.onTileDrawn(tile);
  }

  onCanvasTearDown(): void {
    for (const tile of this.#mounted.keys()) this.onTileDestroyed(tile);
  }

  audit(): Record<string, unknown> {
    return { material: "native-tile-uv", mountedTiles: this.#mounted.size,
      periodSeconds: this.#profile.periodMs / 1000, extraTickers: 0, diagnostic: this.#diagnostic ?? null };
  }
}
