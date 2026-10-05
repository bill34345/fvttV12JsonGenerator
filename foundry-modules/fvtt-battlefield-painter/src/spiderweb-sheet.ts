import { gridCellAtOffset, type FoundryGridLike } from "./grid-adapter";
import { terrainDocumentFlag } from "./scene-ownership";
import type { TerrainDocumentFlag } from "./scene-plan";
import { COLOR_FRAGMENT, terrainColor, supportsTerrainColor } from "./terrain-colors";

export const WEB_SHEET_FRAGMENT = `
  ${COLOR_FRAGMENT}
  uniform sampler2D webMask;
  vec4 _main() {
    return recolorTerrain(texture(sampler, vUvs)) * texture(webMask, vUvs).a * tintAlpha;
  }
`;

/** Unit image coordinates, anchored to the original stroke even after boundary erasure. */
export const sheetMaskPolygons = (flag: TerrainDocumentFlag, grid: FoundryGridLike) => {
  const frame = flag.sheetFrame!;
  return flag.sheetCells!.map(offset => gridCellAtOffset(grid, offset).vertices.map(point => ({
    x: (point.x - frame.x) / frame.width, y: (point.y - frame.y) / frame.height,
  })));
};

interface SheetRoot { foundry?: any; canvas?: any; PIXI?: any; document?: Pick<Document, "createElement">; console?: Pick<Console, "error"> }

/** One native Tile and one static alpha mask per stroke; no repeated source image or ticker. */
export class SpiderwebSheet {
  readonly #root: SheetRoot;
  #shaderClass: any;
  #diagnostic: string | undefined;
  readonly #mounted = new Map<any, { mesh: any; originalClass: any; mask: any; signature: string }>();
  constructor(root: SheetRoot) { this.#root = root; }

  #getShaderClass(): any {
    if (this.#shaderClass) return this.#shaderClass;
    const Base = this.#root.foundry?.canvas?.rendering?.shaders?.PrimaryBaseSamplerShader;
    if (!Base) return undefined;
    this.#shaderClass = class WebSheetSamplerShader extends Base {
      static classPluginName = null;
      static _fragmentShader = WEB_SHEET_FRAGMENT;
      static get defaultUniforms() { return { ...super.defaultUniforms, webMask: null, terrainColor: [1, 1, 1], terrainColorEnabled: 0 }; }
    };
    return this.#shaderClass;
  }

  onTileDrawn(tile: any): void {
    const flag = terrainDocumentFlag(tile?.document ?? {}), mesh = tile?.mesh;
    const coloredFire = flag?.visualEffect === "fire-static-v2" && flag.colorId && flag.colorId !== "original";
    if (flag?.visualEffect !== "spiderweb-sheet-v1" && flag?.visualEffect !== "catalog-sheet-v1" && !coloredFire) { this.onTileDestroyed(tile); return; }
    if (!mesh || mesh.destroyed || typeof mesh.setShaderClass !== "function") return;
    const Shader = this.#getShaderClass(), Base = this.#root.foundry?.canvas?.rendering?.shaders?.PrimaryBaseSamplerShader;
    if (!Shader) return;
    const signature = JSON.stringify([flag.sheetFrame, flag.sheetCells, flag.colorId]);
    const previous = this.#mounted.get(tile);
    if (previous && (previous.mesh !== mesh || previous.signature !== signature || mesh.shader?.constructor !== Shader)) this.onTileDestroyed(tile);
    if (mesh.shader?.constructor !== Base && mesh.shader?.constructor !== Shader) return;
    if (this.#mounted.has(tile)) return;
    let mask: any;
    try {
      const surface = (this.#root.document ?? globalThis.document).createElement("canvas");
      const frame = flag.sheetFrame ?? { width: 1, height: 1 }, scale = Math.min(1, 2048 / Math.max(frame.width, frame.height));
      surface.width = Math.max(1, Math.ceil(frame.width * scale));
      surface.height = Math.max(1, Math.ceil(frame.height * scale));
      const context = surface.getContext("2d");
      if (!context) throw new Error("Cannot create spiderweb alpha mask");
      context.fillStyle = "white";
      context.beginPath();
      for (const polygon of coloredFire ? [[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]] : sheetMaskPolygons(flag, this.#root.canvas.grid)) {
        polygon.forEach((point, index) => context[index ? "lineTo" : "moveTo"](point.x * surface.width, point.y * surface.height));
        context.closePath();
      }
      context.fill();
      mask = this.#root.PIXI.Texture.from(surface);
      const originalClass = mesh.shader.constructor;
      mesh.setShaderClass(Shader);
      this.#mounted.set(tile, { mesh, originalClass, mask, signature });
      mesh.shader.uniforms.webMask = mask;
      const color = terrainColor(flag.colorId);
      mesh.shader.uniforms.terrainColorEnabled = supportsTerrainColor(flag.configurationId) && color.id !== "original" ? 1 : 0;
      mesh.shader.uniforms.terrainColor = [1, 3, 5].map(i => parseInt(color.hex.slice(i, i + 2), 16) / 255);
    } catch (error) {
      if (this.#mounted.has(tile)) this.onTileDestroyed(tile); else mask?.destroy(true);
      this.#diagnostic = error instanceof Error ? error.message : String(error);
      this.#root.console?.error(`[fvtt-battlefield-painter] spiderweb sheet: ${this.#diagnostic}`);
    }
  }

  onTileDestroyed(tile: any): void {
    const entry = this.#mounted.get(tile);
    if (!entry) return;
    this.#mounted.delete(tile);
    if (!entry.mesh.destroyed && entry.mesh.shader?.constructor === this.#shaderClass) entry.mesh.setShaderClass(entry.originalClass);
    entry.mask.destroy(true);
  }
  onCanvasReady(): void { for (const tile of this.#root.canvas?.tiles?.placeables ?? []) this.onTileDrawn(tile); }
  onCanvasTearDown(): void { for (const tile of this.#mounted.keys()) this.onTileDestroyed(tile); }
  audit(configurationId?: string): Record<string, unknown> {
    const mountedTiles = configurationId ? [...this.#mounted.keys()].filter(tile =>
      terrainDocumentFlag(tile.document)?.configurationId === configurationId).length : this.#mounted.size;
    return { material: "native-web-sheet", mountedTiles, extraTickers: 0, diagnostic: this.#diagnostic ?? null };
  }
}
