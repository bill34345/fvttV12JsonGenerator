import { TERRAIN_CONFIGURATIONS } from "./catalog";
import { MODULE_ID } from "./constants";
import {
  gridCellAtOffset,
  isSquareGrid,
  type FoundryGridLike,
} from "./grid-adapter";
import type { GridOffset, Point } from "./geometry";
import { terrainDocumentFlag } from "./scene-ownership";

export const FIRE_FIELD_VISUAL_EFFECT = "fire-field-v1" as const;

export interface FireFieldCell {
  key: string;
  center: Point;
  vertices: readonly Point[];
  stageIndex: number;
  /** Persisted offset used only to anchor the global world lattice. */
  offset?: GridOffset;
}

export interface FireFieldGeometry {
  /** World-space quad positions. */
  positions: Float32Array;
  /** UVs inside one quadrant of the 2x2 video variant sheet. */
  uvs: Float32Array;
  /** Deterministic 0..3 variant index, repeated for each quad vertex. */
  variants: Float32Array;
  /** 0 for Stage I / Style B, 1 for Stage II / Style A. */
  stageIndices: Float32Array;
  /** Per-emitter deterministic opacity/scale variation. */
  strengths: Float32Array;
  indices: Uint16Array;
  cellCount: number;
  emitterCount: number;
  vertexCount: number;
  triangleCount: number;
  meshCount: number;
}

export const fireStageIntensity = (stageIndex: number): number =>
  stageIndex === 1 ? 1 : 0.55;

/**
 * Eight fixed world-grid anchors are available in a Stage II square. Stage I
 * uses the four corner anchors; Stage II adds the four cross anchors. The
 * anchors are derived from world coordinates, never from Tile, bundle, or
 * document ids, so separate drawing operations share one stable visual space.
 */
const BASE_EMITTER_OFFSETS = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
] as const;

const DENSE_EMITTER_OFFSETS = [
  [0.5, 0.25],
  [0.5, 0.75],
  [0.25, 0.5],
  [0.75, 0.5],
] as const;

const roundCoordinate = (value: number): number =>
  Math.round(value * 1000) / 1000;

const positiveNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;

const hash32 = (x: number, y: number, layer: number): number => {
  let value = Math.imul(x | 0, 0x45d9f3b);
  value = Math.imul(value ^ Math.imul(y | 0, 0x119de1f3), 0x45d9f3b);
  value = Math.imul(value ^ Math.imul(layer | 0, 0x27d4eb2d), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
};

interface CellBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boundsForCell = (cell: FireFieldCell): CellBounds => {
  if (cell.vertices.length !== 4) {
    throw new Error(`Fire field cell ${cell.key} is not a square`);
  }
  const xs = cell.vertices.map(({ x }) => x);
  const ys = cell.vertices.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (!(maxX > minX && maxY > minY)) {
    throw new Error(`Fire field cell ${cell.key} has invalid bounds`);
  }
  return { minX, minY, maxX, maxY };
};

const inferWorldOrigin = (
  cells: readonly { bounds: CellBounds; offset?: GridOffset }[],
  gridSize: number,
): Point => {
  const withOffsets = cells.filter(({ offset }) => offset);
  if (withOffsets.length) {
    return {
      x: Math.min(
        ...withOffsets.map(({ bounds, offset }) => bounds.minX - offset!.j * gridSize),
      ),
      y: Math.min(
        ...withOffsets.map(({ bounds, offset }) => bounds.minY - offset!.i * gridSize),
      ),
    };
  }
  return {
    x:
      Math.floor(Math.min(...cells.map(({ bounds }) => bounds.minX)) / gridSize) *
      gridSize,
    y:
      Math.floor(Math.min(...cells.map(({ bounds }) => bounds.minY)) / gridSize) *
      gridSize,
  };
};

const cellGridIndex = (
  cell: { bounds: CellBounds; offset?: GridOffset },
  origin: Point,
  gridSize: number,
): GridOffset =>
  cell.offset ?? {
    i: Math.floor((cell.bounds.minY - origin.y) / gridSize),
    j: Math.floor((cell.bounds.minX - origin.x) / gridSize),
  };

const pushQuad = (
  positions: number[],
  uvs: number[],
  variants: number[],
  stageIndices: number[],
  strengths: number[],
  indices: number[],
  anchor: Point,
  bounds: CellBounds,
  gridSize: number,
  variant: number,
  stageIndex: number,
  strength: number,
): boolean => {
  // The quad is deliberately larger than one flame lobe. Clipping it to the
  // owning square prevents an L-shaped hole from being filled by neighbors,
  // while occupied adjacent squares still meet without a geometric gap.
  const halfSize = gridSize * (0.43 + strength * 0.05);
  const rawMinX = anchor.x - halfSize;
  const rawMaxX = anchor.x + halfSize;
  const rawMinY = anchor.y - halfSize;
  const rawMaxY = anchor.y + halfSize;
  const minX = Math.max(bounds.minX, rawMinX);
  const maxX = Math.min(bounds.maxX, rawMaxX);
  const minY = Math.max(bounds.minY, rawMinY);
  const maxY = Math.min(bounds.maxY, rawMaxY);
  if (maxX - minX < 0.5 || maxY - minY < 0.5) return false;

  const width = rawMaxX - rawMinX;
  const height = rawMaxY - rawMinY;
  const u0 = (minX - rawMinX) / width;
  const u1 = (maxX - rawMinX) / width;
  const v0 = (minY - rawMinY) / height;
  const v1 = (maxY - rawMinY) / height;
  const base = positions.length / 2;
  positions.push(
    minX,
    minY,
    maxX,
    minY,
    maxX,
    maxY,
    minX,
    maxY,
  );
  uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
  variants.push(variant, variant, variant, variant);
  stageIndices.push(stageIndex, stageIndex, stageIndex, stageIndex);
  strengths.push(strength, strength, strength, strength);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return true;
};

/**
 * Build one mesh of world-anchored flipbook emitters. There is no texture
 * coordinate reset per Tile: every emitter samples one shared Stage I or Stage
 * II video and gets its variant from its world anchor.
 */
export const buildFireFieldGeometry = (
  inputCells: readonly FireFieldCell[],
  requestedGridSize = 1,
): FireFieldGeometry => {
  const gridSize = positiveNumber(requestedGridSize, 1);
  const cells = [...inputCells]
    .map((cell) => ({ cell, bounds: boundsForCell(cell), offset: cell.offset }))
    .sort((a, b) => a.cell.key.localeCompare(b.cell.key));
  if (!cells.length) {
    return {
      positions: new Float32Array(),
      uvs: new Float32Array(),
      variants: new Float32Array(),
      stageIndices: new Float32Array(),
      strengths: new Float32Array(),
      indices: new Uint16Array(),
      cellCount: 0,
      emitterCount: 0,
      vertexCount: 0,
      triangleCount: 0,
      meshCount: 0,
    };
  }

  const origin = inferWorldOrigin(cells, gridSize);
  const positions: number[] = [];
  const uvs: number[] = [];
  const variants: number[] = [];
  const stageIndices: number[] = [];
  const strengths: number[] = [];
  const indices: number[] = [];
  const emitted = new Set<string>();

  for (const { cell, bounds, offset } of cells) {
    const index = cellGridIndex({ bounds, offset }, origin, gridSize);
    const offsets =
      cell.stageIndex === 1
        ? [...BASE_EMITTER_OFFSETS, ...DENSE_EMITTER_OFFSETS]
        : BASE_EMITTER_OFFSETS;
    for (let layer = 0; layer < offsets.length; layer += 1) {
      const [offsetX, offsetY] = offsets[layer]!;
      const anchor = {
        x: origin.x + (index.j + offsetX) * gridSize,
        y: origin.y + (index.i + offsetY) * gridSize,
      };
      const epsilon = gridSize * 0.0001;
      if (
        anchor.x < bounds.minX + epsilon ||
        anchor.x > bounds.maxX - epsilon ||
        anchor.y < bounds.minY + epsilon ||
        anchor.y > bounds.maxY - epsilon
      ) {
        continue;
      }
      const latticeX = Math.round((anchor.x - origin.x) / (gridSize * 0.25));
      const latticeY = Math.round((anchor.y - origin.y) / (gridSize * 0.25));
      const key = `${roundCoordinate(anchor.x)},${roundCoordinate(anchor.y)}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      const seed = hash32(latticeX, latticeY, layer + cell.stageIndex * 17);
      const strength = 0.82 + seed * 0.18;
      const variant = Math.min(3, Math.floor(seed * 4));
      pushQuad(
        positions,
        uvs,
        variants,
        stageIndices,
        strengths,
        indices,
        anchor,
        bounds,
        gridSize,
        variant,
        cell.stageIndex,
        strength,
      );
    }
  }

  if (positions.length / 2 > 0xffff) {
    throw new Error("Fire field geometry exceeds the Uint16 vertex limit");
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    variants: new Float32Array(variants),
    stageIndices: new Float32Array(stageIndices),
    strengths: new Float32Array(strengths),
    indices: new Uint16Array(indices),
    cellCount: cells.length,
    emitterCount: positions.length / 8,
    vertexCount: positions.length / 2,
    triangleCount: indices.length / 3,
    meshCount: positions.length ? 1 : 0,
  };
};

export const FIRE_FIELD_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 aVertexPosition;
in vec2 aUv;
in float aVariant;
in float aStageIndex;
in float aEmitterStrength;

uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;

out vec2 vUv;
out float vVariant;
out float vStageIndex;
out float vEmitterStrength;

void main() {
  vec3 transformed = translationMatrix * vec3(aVertexPosition, 1.0);
  gl_Position = vec4((projectionMatrix * transformed).xy, 0.0, 1.0);
  vUv = aUv;
  vVariant = aVariant;
  vStageIndex = aStageIndex;
  vEmitterStrength = aEmitterStrength;
}
`;

export const FIRE_FIELD_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 vUv;
in float vVariant;
in float vStageIndex;
in float vEmitterStrength;

uniform sampler2D uStageITexture;
uniform sampler2D uStageIITexture;
uniform float uTime;

out vec4 outColor;

vec2 variantUv(vec2 uv, float variant) {
  float column = mod(variant, 2.0);
  float row = floor(variant / 2.0);
  return (uv + vec2(column, row)) * 0.5;
}

void main() {
  vec2 sheetUv = variantUv(vUv, vVariant);
  vec4 sampleColor = vStageIndex < 0.5
    ? texture(uStageITexture, sheetUv)
    : texture(uStageIITexture, sheetUv);

  // The samples are black-keyed flipbook videos. Preserve their dark red
  // edge, but make the black backing transparent. A future real-alpha encode
  // is also respected because source alpha further constrains the key.
  float brightness = max(max(sampleColor.r, sampleColor.g), sampleColor.b);
  float blackKey = smoothstep(0.012, 0.105, brightness);
  float sourceAlpha = min(sampleColor.a, blackKey);
  float stageAlpha = vStageIndex < 0.5 ? 0.9 : 1.0;
  float sharedFlicker = 0.97 + 0.03 * sin(uTime * 6.2831853);
  float alpha = blackKey * sourceAlpha * vEmitterStrength * stageAlpha;
  alpha *= sharedFlicker;
  if (alpha < 0.008) discard;

  vec3 color = min(sampleColor.rgb * 1.12, vec3(1.0));
  outColor = vec4(color * alpha, alpha);
}
`;

export interface FireEffectDiagnostics {
  mounted: boolean;
  available: boolean;
  sceneId: string | null;
  fireCells: number;
  meshCount: number;
  vertices: number;
  triangles: number;
  tickerAttached: boolean;
  rebuildCount: number;
  lastError: string | null;
  renderer?: "video-flipbook-fire-field-v1";
  atlasLoaded?: boolean;
  atlasFrames?: number;
  atlasVariants?: number;
  emitters?: number;
  maskWidth?: number;
  maskHeight?: number;
}

interface FireEffectRoot {
  canvas?: any;
  foundry?: any;
  PIXI?: any;
  document?: any;
  console?: Pick<Console, "error">;
}

interface FireFieldMesh {
  mesh: any;
  shader: any;
  geometry: any;
  data: FireFieldGeometry;
}

interface FireFieldScan {
  cells: FireFieldCell[];
  gridSize: number;
}

interface FireVideoResource {
  video: any;
  texture: any;
  ready: boolean;
  playRequested?: boolean;
  onReady?: () => void;
  onError?: () => void;
}

const objectId = (value: any): string | undefined =>
  typeof value?.id === "string"
    ? value.id
    : typeof value?._id === "string"
      ? value._id
      : undefined;

const collectionValues = (collection: any): any[] => {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  try {
    return [...collection];
  } catch {
    return [];
  }
};

const positiveGridSize = (value: unknown): number => positiveNumber(value, 1);

const createFireShaderClass = (root: FireEffectRoot): any => {
  const AbstractBaseShader =
    root.foundry?.canvas?.rendering?.shaders?.AbstractBaseShader;
  if (typeof AbstractBaseShader !== "function") {
    throw new Error("Foundry AbstractBaseShader export is unavailable");
  }

  return class FireFieldShader extends AbstractBaseShader {
    static get defaultUniforms(): Record<string, unknown> {
      return {
        uStageITexture: null,
        uStageIITexture: null,
        uTime: 0,
      };
    }

    static _createVertexShader(): string {
      return FIRE_FIELD_VERTEX_SHADER_SOURCE;
    }

    static _createFragmentShader(): string {
      return FIRE_FIELD_FRAGMENT_SHADER_SOURCE;
    }
  };
};

const fieldTexturePaths = (): [string, string] => {
  const stages = TERRAIN_CONFIGURATIONS.fire.stages;
  const stageI = stages[0].media.fieldTexture;
  const stageII = stages[1].media.fieldTexture;
  if (!stageI || !stageII) {
    throw new Error("Fire field media paths are missing from the terrain catalog");
  }
  return [stageI, stageII];
};

export class FireEffectRenderer {
  readonly #root: FireEffectRoot;
  #container: any;
  #mesh: FireFieldMesh | undefined;
  #scene: any;
  #ticker: any;
  #tickerCallback: ((ticker?: any) => void) | undefined;
  #shaderClass: any;
  #media: FireVideoResource[] = [];
  #time = 0;
  #refreshQueued = false;
  #lifecycleGeneration = 0;
  #mounted = false;
  #available = false;
  #tickerAttached = false;
  #fireCells = 0;
  #emitters = 0;
  #vertices = 0;
  #triangles = 0;
  #rebuildCount = 0;
  #lastError: string | null = null;
  #reportedError: string | undefined;

  constructor(root: FireEffectRoot = globalThis as FireEffectRoot) {
    this.#root = root;
  }

  onCanvasReady(): void {
    this.#teardownCanvas({ clearDiagnostics: true });

    const canvas = this.#root.canvas;
    const grid = canvas?.grid as FoundryGridLike | undefined;
    const primary = canvas?.primary;
    const containerClass =
      this.#root.foundry?.canvas?.primary?.PrimaryCanvasContainer;
    const ticker = canvas?.app?.ticker ?? this.#root.PIXI?.Ticker?.shared;
    const geometryClass = this.#root.PIXI?.Geometry;
    const meshClass = this.#root.PIXI?.Mesh;

    try {
      if (!canvas?.scene || !grid || !primary) {
        throw new Error("Active canvas Scene, grid, or primary group is unavailable");
      }
      if (!isSquareGrid(grid)) {
        throw new Error("Fire field runtime currently requires a Square grid");
      }
      if (typeof containerClass !== "function") {
        throw new Error("Foundry PrimaryCanvasContainer export is unavailable");
      }
      if (
        typeof geometryClass !== "function" ||
        typeof meshClass !== "function"
      ) {
        throw new Error("PIXI Geometry or Mesh export is unavailable");
      }
      if (!ticker || typeof ticker.add !== "function" || typeof ticker.remove !== "function") {
        throw new Error("Canvas ticker API is unavailable");
      }

      const container = new containerClass();
      container.name = `${MODULE_ID}-fire-field`;
      container.interactive = false;
      container.interactiveChildren = false;
      container.eventMode = "none";
      container.elevation = 0;
      container.sortLayer =
        this.#root.foundry?.canvas?.groups?.PrimaryCanvasGroup?.SORT_LAYERS
          ?.TILES ?? 500;
      container.sort = 1;
      container.zIndex = 0;
      primary.addChild(container);
      container.interactive = false;
      container.interactiveChildren = false;
      container.eventMode = "none";

      this.#container = container;
      this.#scene = canvas.scene;
      this.#mounted = true;
      this.#available = true;
      this.#createMedia();
      this.#rebuildNow();

      this.#ticker = ticker;
      this.#tickerCallback = (currentTicker?: any): void => {
        const deltaMS = Number(
          currentTicker?.deltaMS ?? currentTicker?.elapsedMS ?? 1000 / 60,
        );
        if (Number.isFinite(deltaMS)) this.#time += Math.max(0, deltaMS) / 1000;
        if (this.#mesh?.shader?.uniforms) {
          this.#mesh.shader.uniforms.uTime = this.#time;
        }
        this.#syncVideoClocks();
      };
      ticker.add(this.#tickerCallback);
      this.#tickerAttached = true;
    } catch (error) {
      this.#fail(error);
    }
  }

  onCanvasTearDown(): void {
    this.#teardownCanvas({ clearDiagnostics: true });
  }

  onTileDocumentEvent(document: any): void {
    if (!this.#mounted || !this.#available || !this.#isActiveDocument(document)) {
      return;
    }
    this.#queueRebuild();
  }

  auditEffects(): FireEffectDiagnostics {
    const meshCount = Array.isArray(this.#container?.children)
      ? this.#container.children.length
      : 0;
    return {
      mounted: this.#mounted,
      available: this.#available,
      sceneId: objectId(this.#scene) ?? null,
      fireCells: this.#fireCells,
      meshCount,
      vertices: this.#vertices,
      triangles: this.#triangles,
      tickerAttached: this.#tickerAttached,
      rebuildCount: this.#rebuildCount,
      lastError: this.#lastError,
      renderer: "video-flipbook-fire-field-v1",
      atlasLoaded: this.#media.length === 2 && this.#media.every(({ ready }) => ready),
      atlasFrames: 96,
      atlasVariants: 4,
      emitters: this.#emitters,
      maskWidth: 0,
      maskHeight: 0,
    };
  }

  #document(): any {
    return this.#root.document ?? (globalThis as any).document;
  }

  #canvas(): any {
    return this.#root.canvas;
  }

  #isActiveDocument(document: any): boolean {
    const scene = this.#scene;
    const canvasScene = this.#canvas()?.scene;
    if (!scene || canvasScene !== scene) return false;
    const parent = document?.parent;
    if (!parent) return true;
    const parentId = objectId(parent);
    const sceneId = objectId(scene);
    return !parentId || !sceneId || parentId === sceneId;
  }

  #queueRebuild(): void {
    if (this.#refreshQueued) return;
    this.#refreshQueued = true;
    const generation = this.#lifecycleGeneration;
    queueMicrotask(() => {
      this.#refreshQueued = false;
      if (generation !== this.#lifecycleGeneration) return;
      if (!this.#mounted || !this.#available) return;
      try {
        this.#rebuildNow();
      } catch (error) {
        this.#fail(error);
      }
    });
  }

  #scan(): FireFieldScan {
    const canvas = this.#canvas();
    const grid = canvas?.grid as FoundryGridLike | undefined;
    const scene = this.#scene;
    if (!grid || !scene) throw new Error("Fire field canvas state is unavailable");

    const cells: FireFieldCell[] = [];
    const seen = new Set<string>();
    for (const tile of collectionValues(scene.tiles)) {
      const flag = terrainDocumentFlag(tile);
      if (
        !flag ||
        flag.role !== "terrain-tile" ||
        flag.configurationId !== "fire" ||
        flag.visualEffect !== FIRE_FIELD_VISUAL_EFFECT
      ) {
        continue;
      }
      if (!flag.offset || !flag.cellKey) {
        throw new Error("Fire field Tile is missing its persisted cell offset/key");
      }
      if (seen.has(flag.cellKey)) {
        throw new Error(`Duplicate fire field cell: ${flag.cellKey}`);
      }
      seen.add(flag.cellKey);
      const cell = gridCellAtOffset(grid, flag.offset);
      cells.push({
        key: flag.cellKey,
        center: cell.center,
        vertices: cell.vertices,
        stageIndex: flag.stageIndex,
        offset: flag.offset,
      });
    }

    return {
      cells,
      gridSize: positiveGridSize(
        grid.size ?? canvas?.dimensions?.size ?? scene.grid?.size,
      ),
    };
  }

  #createMedia(): void {
    if (this.#media.length) return;
    const document = this.#document();
    const textureFactory = this.#root.PIXI?.Texture?.from;
    if (!document || typeof document.createElement !== "function") {
      throw new Error("Browser document API is unavailable for fire field media");
    }
    if (typeof textureFactory !== "function") {
      throw new Error("PIXI Texture.from is unavailable for fire field media");
    }

    const created: FireVideoResource[] = [];
    try {
      for (const source of fieldTexturePaths()) {
        const video = document.createElement("video");
        if (!video) throw new Error("Could not create fire field video element");
        video.muted = true;
        video.loop = true;
        // Pixi owns loading; playback starts only after decoded dimensions exist.
        video.autoplay = false;
        video.playsInline = true;
        video.preload = "auto";
        video.crossOrigin = "anonymous";
        video.setAttribute?.("muted", "");
        video.setAttribute?.("playsinline", "");
        video.setAttribute?.("aria-hidden", "true");
        if (video.style) {
          video.style.position = "fixed";
          video.style.left = "-10000px";
          video.style.top = "-10000px";
          video.style.width = "1px";
          video.style.height = "1px";
          video.style.opacity = "0";
          video.style.pointerEvents = "none";
        }
        video.src = source;
        const resource: FireVideoResource = {
          video,
          texture: this.#root.PIXI.Texture.from(video, { resourceOptions: { autoPlay: false } }),
          ready: false,
        };
        const generation = this.#lifecycleGeneration;
        resource.onReady = () => {
          if (generation !== this.#lifecycleGeneration || !this.#mounted) return;
          if (Number(video.readyState) < 2 || !(video.videoWidth > 0 && video.videoHeight > 0)) return;
          // A play event on a zero-sized Pixi VideoResource recursively enters
          // _onCanPlay/_onPlayStart in Pixi 7.4.3. Update before requesting play.
          resource.texture.baseTexture?.resource?.update?.();
          resource.ready = true;
          if (!resource.playRequested) {
            resource.playRequested = true;
            const playResult = video.play?.();
            if (playResult && typeof playResult.catch === "function") {
              playResult.catch(() => {
                // Keep the muted resource available for a later user gesture.
              });
            }
          }
        };
        resource.onError = () => {
          if (generation !== this.#lifecycleGeneration || !this.#mounted) return;
          this.#fail(new Error(`Fire field video failed to load: ${source}`));
        };
        video.addEventListener?.("loadeddata", resource.onReady);
        video.addEventListener?.("canplay", resource.onReady);
        video.addEventListener?.("error", resource.onError);
        document.body?.appendChild?.(video);
        resource.onReady();
        created.push(resource);
      }
      this.#media = created;
    } catch (error) {
      for (const resource of created) this.#destroyVideoResource(resource);
      throw error;
    }
  }

  #syncVideoClocks(): void {
    for (const { video } of this.#media) {
      const duration = Number(video.duration);
      if (!(duration > 0) || Number(video.readyState) < 2) continue;
      const target = this.#time % duration;
      const current = Number(video.currentTime);
      if (!Number.isFinite(current) || Math.abs(current - target) > 0.18) {
        try {
          video.currentTime = target;
        } catch {
          // A browser may reject a seek while a new resource is loading.
        }
      }
    }
  }

  #rebuildNow(): void {
    const scan = this.#scan();
    const previous = this.#mesh;
    let next: FireFieldMesh | undefined;

    try {
      next = scan.cells.length ? this.#createMesh(scan) : undefined;
      if (next) {
        this.#container.addChild(next.mesh);
        next.mesh.interactive = false;
        next.mesh.interactiveChildren = false;
        next.mesh.eventMode = "none";
      }
      if (previous && previous.mesh?.parent === this.#container) {
        this.#container.removeChild(previous.mesh);
      }
    } catch (error) {
      if (next) this.#destroyMesh(next);
      throw error;
    }
    if (previous) this.#destroyMesh(previous);

    this.#mesh = next;
    this.#fireCells = scan.cells.length;
    this.#emitters = next?.data.emitterCount ?? 0;
    this.#vertices = next?.data.vertexCount ?? 0;
    this.#triangles = next?.data.triangleCount ?? 0;
    this.#rebuildCount += 1;
    this.#lastError = null;
    this.#reportedError = undefined;
  }

  #createMesh(scan: FireFieldScan): FireFieldMesh {
    const PIXI = this.#root.PIXI;
    const data = buildFireFieldGeometry(scan.cells, scan.gridSize);
    const geometry = new PIXI.Geometry();
    let shader: any;
    try {
      geometry
        .addAttribute("aVertexPosition", data.positions, 2)
        .addAttribute("aUv", data.uvs, 2)
        .addAttribute("aVariant", data.variants, 1)
        .addAttribute("aStageIndex", data.stageIndices, 1)
        .addAttribute("aEmitterStrength", data.strengths, 1)
        .addIndex(data.indices);
      this.#shaderClass ??= createFireShaderClass(this.#root);
      shader = this.#shaderClass.create({
        uStageITexture: this.#media[0]?.texture,
        uStageIITexture: this.#media[1]?.texture,
        uTime: this.#time,
      });
      const mesh = new PIXI.Mesh(geometry, shader);
      mesh.name = `${MODULE_ID}-fire-field-mesh`;
      mesh.start = 0;
      mesh.size = data.indices.length;
      mesh.interactive = false;
      mesh.eventMode = "none";
      mesh.sortLayer =
        this.#root.foundry?.canvas?.groups?.PrimaryCanvasGroup?.SORT_LAYERS
          ?.TILES ?? 500;
      mesh.sort = 1;
      mesh.elevation = 0;
      mesh.zIndex = 0;
      return { mesh, shader, geometry, data };
    } catch (error) {
      shader?.destroy?.();
      this.#destroyGeometry(geometry);
      throw error;
    }
  }

  #destroyGeometry(geometry: any): void {
    if (typeof geometry?.destroy === "function") geometry.destroy();
    else geometry?.dispose?.();
  }

  #destroyMesh(fieldMesh: FireFieldMesh): void {
    if (fieldMesh.mesh?.parent) fieldMesh.mesh.parent.removeChild(fieldMesh.mesh);
    try {
      fieldMesh.mesh?.destroy?.({ children: true });
    } finally {
      fieldMesh.shader?.destroy?.();
      this.#destroyGeometry(fieldMesh.geometry);
    }
  }

  #destroyVideoResource(resource: FireVideoResource): void {
    const { video, texture } = resource;
    video.removeEventListener?.("loadeddata", resource.onReady);
    video.removeEventListener?.("canplay", resource.onReady);
    video.removeEventListener?.("error", resource.onError);
    video.pause?.();
    video.removeAttribute?.("src");
    video.load?.();
    if (video.parentNode) video.parentNode.removeChild(video);
    texture?.destroy?.(true);
  }

  #detachTicker(): void {
    if (this.#tickerAttached && this.#ticker && this.#tickerCallback) {
      this.#ticker.remove(this.#tickerCallback);
    }
    this.#tickerAttached = false;
    this.#ticker = undefined;
    this.#tickerCallback = undefined;
  }

  #teardownCanvas({ clearDiagnostics }: { clearDiagnostics: boolean }): void {
    this.#lifecycleGeneration += 1;
    this.#refreshQueued = false;
    this.#detachTicker();
    if (this.#mesh) this.#destroyMesh(this.#mesh);
    this.#mesh = undefined;
    if (this.#container?.parent) this.#container.parent.removeChild(this.#container);
    this.#container?.destroy?.({ children: true });
    this.#container = undefined;
    for (const resource of this.#media) this.#destroyVideoResource(resource);
    this.#media = [];
    this.#scene = undefined;
    this.#mounted = false;
    this.#available = false;
    this.#fireCells = 0;
    this.#emitters = 0;
    this.#vertices = 0;
    this.#triangles = 0;
    this.#rebuildCount = 0;
    this.#time = 0;
    this.#shaderClass = undefined;
    if (clearDiagnostics) {
      this.#lastError = null;
      this.#reportedError = undefined;
    }
  }

  #fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.#lastError = message;
    if (this.#reportedError !== message) {
      this.#root.console?.error?.(`[${MODULE_ID}] Fire field runtime disabled: ${message}`);
      this.#reportedError = message;
    }
    this.#detachTicker();
    if (this.#mesh) this.#destroyMesh(this.#mesh);
    this.#mesh = undefined;
    if (this.#container?.parent) this.#container.parent.removeChild(this.#container);
    this.#container?.destroy?.({ children: true });
    this.#container = undefined;
    for (const resource of this.#media) this.#destroyVideoResource(resource);
    this.#media = [];
    this.#mounted = false;
    this.#available = false;
    this.#fireCells = 0;
    this.#emitters = 0;
    this.#vertices = 0;
    this.#triangles = 0;
    this.#scene = undefined;
    this.#shaderClass = undefined;
  }
}
