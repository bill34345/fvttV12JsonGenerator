import { TERRAIN_CONFIGURATIONS } from "./catalog";
import { MODULE_ID } from "./constants";
import {
  gridCellAtOffset,
  isSquareGrid,
  type FoundryGridLike,
} from "./grid-adapter";
import type { GridOffset, Point } from "./geometry";
import { terrainDocumentFlag } from "./scene-ownership";

export const FROST_FIELD_VISUAL_EFFECT = "frost-field-v1" as const;

export interface FrostFieldCell {
  key: string;
  center: Point;
  vertices: readonly Point[];
  stageIndex: number;
  offset?: GridOffset;
}

export interface FrostFieldMask {
  pixels: Uint8Array;
  width: number;
  height: number;
  minI: number;
  minJ: number;
  originX: number;
  originY: number;
  gridSize: number;
}

export interface FrostFilmGeometry {
  positions: Float32Array;
  stageStrengths: Float32Array;
  indices: Uint16Array;
  vertexCount: number;
  triangleCount: number;
  meshCount: number;
}

export interface FrostMistGeometry {
  positions: Float32Array;
  uvs: Float32Array;
  variants: Float32Array;
  phaseGroups: Float32Array;
  strengths: Float32Array;
  indices: Uint16Array;
  emitterCount: number;
  vertexCount: number;
  triangleCount: number;
  meshCount: number;
}

export interface FrostFieldGeometry {
  mask: FrostFieldMask;
  film: FrostFilmGeometry;
  mist: FrostMistGeometry;
  cellCount: number;
  stageICells: number;
  stageIICells: number;
  vertexCount: number;
  triangleCount: number;
}

interface CellBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface IndexedCell {
  cell: FrostFieldCell;
  bounds: CellBounds;
  index: GridOffset;
}

const MIST_LATTICE_SPACING = 0.62;
const MIST_LATTICE_JITTER = 0.34;

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

const boundsForCell = (cell: FrostFieldCell): CellBounds => {
  if (cell.vertices.length !== 4) {
    throw new Error(`Frost field cell ${cell.key} is not a square`);
  }
  const xs = cell.vertices.map(({ x }) => x);
  const ys = cell.vertices.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (!(maxX > minX && maxY > minY)) {
    throw new Error(`Frost field cell ${cell.key} has invalid bounds`);
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
        ...withOffsets.map(({ bounds, offset }) =>
          bounds.minX - offset!.j * gridSize),
      ),
      y: Math.min(
        ...withOffsets.map(({ bounds, offset }) =>
          bounds.minY - offset!.i * gridSize),
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

const emptyMask = (gridSize: number): FrostFieldMask => ({
  pixels: new Uint8Array(),
  width: 0,
  height: 0,
  minI: 0,
  minJ: 0,
  originX: 0,
  originY: 0,
  gridSize,
});

const emptyFilm = (): FrostFilmGeometry => ({
  positions: new Float32Array(),
  stageStrengths: new Float32Array(),
  indices: new Uint16Array(),
  vertexCount: 0,
  triangleCount: 0,
  meshCount: 0,
});

const emptyMist = (): FrostMistGeometry => ({
  positions: new Float32Array(),
  uvs: new Float32Array(),
  variants: new Float32Array(),
  phaseGroups: new Float32Array(),
  strengths: new Float32Array(),
  indices: new Uint16Array(),
  emitterCount: 0,
  vertexCount: 0,
  triangleCount: 0,
  meshCount: 0,
});

export const buildFrostFieldGeometry = (
  inputCells: readonly FrostFieldCell[],
  requestedGridSize = 1,
): FrostFieldGeometry => {
  const gridSize = positiveNumber(requestedGridSize, 1);
  if (!inputCells.length) {
    return {
      mask: emptyMask(gridSize),
      film: emptyFilm(),
      mist: emptyMist(),
      cellCount: 0,
      stageICells: 0,
      stageIICells: 0,
      vertexCount: 0,
      triangleCount: 0,
    };
  }

  const prepared = [...inputCells]
    .map((cell) => ({ cell, bounds: boundsForCell(cell), offset: cell.offset }))
    .sort((a, b) => a.cell.key.localeCompare(b.cell.key));
  const origin = inferWorldOrigin(prepared, gridSize);
  const cells: IndexedCell[] = prepared.map(({ cell, bounds, offset }) => ({
    cell,
    bounds,
    index: cellGridIndex({ bounds, offset }, origin, gridSize),
  }));

  const seenKeys = new Set<string>();
  const seenOffsets = new Set<string>();
  for (const { cell, index } of cells) {
    if (seenKeys.has(cell.key)) throw new Error(`Duplicate frost field cell: ${cell.key}`);
    seenKeys.add(cell.key);
    const offsetKey = `${index.i}:${index.j}`;
    if (seenOffsets.has(offsetKey)) {
      throw new Error(`Duplicate frost field offset: ${offsetKey}`);
    }
    seenOffsets.add(offsetKey);
  }

  const minI = Math.min(...cells.map(({ index }) => index.i));
  const maxI = Math.max(...cells.map(({ index }) => index.i));
  const minJ = Math.min(...cells.map(({ index }) => index.j));
  const maxJ = Math.max(...cells.map(({ index }) => index.j));
  const width = maxJ - minJ + 1;
  const height = maxI - minI + 1;
  if (width * height > 4_194_304) {
    throw new Error("Frost field mask exceeds the runtime texture limit");
  }
  const pixels = new Uint8Array(width * height * 4);
  for (const { cell, index } of cells) {
    const pixel = ((index.i - minI) * width + index.j - minJ) * 4;
    pixels[pixel] = 255;
    pixels[pixel + 1] = cell.stageIndex === 1 ? 255 : 140;
    pixels[pixel + 2] = 0;
    pixels[pixel + 3] = 255;
  }
  const mask: FrostFieldMask = {
    pixels,
    width,
    height,
    minI,
    minJ,
    originX: origin.x + minJ * gridSize,
    originY: origin.y + minI * gridSize,
    gridSize,
  };

  const filmPositions: number[] = [];
  const filmStrengths: number[] = [];
  const filmIndices: number[] = [];
  for (const { cell } of cells) {
    const base = filmPositions.length / 2;
    for (const vertex of cell.vertices) filmPositions.push(vertex.x, vertex.y);
    const stageStrength = cell.stageIndex === 1 ? 1 : 0.55;
    filmStrengths.push(stageStrength, stageStrength, stageStrength, stageStrength);
    filmIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  if (filmPositions.length / 2 > 0xffff) {
    throw new Error("Frost film geometry exceeds the Uint16 vertex limit");
  }
  const film: FrostFilmGeometry = {
    positions: new Float32Array(filmPositions),
    stageStrengths: new Float32Array(filmStrengths),
    indices: new Uint16Array(filmIndices),
    vertexCount: filmPositions.length / 2,
    triangleCount: filmIndices.length / 3,
    meshCount: filmPositions.length ? 1 : 0,
  };

  const mistPositions: number[] = [];
  const mistUvs: number[] = [];
  const mistVariants: number[] = [];
  const mistPhases: number[] = [];
  const mistStrengths: number[] = [];
  const mistIndices: number[] = [];
  const stageIICells = cells.filter(({ cell }) => cell.stageIndex === 1);
  const stageIIOffsets = new Set(
    stageIICells.map(({ index }) => `${index.i}:${index.j}`),
  );
  if (stageIICells.length) {
    const spacing = gridSize * MIST_LATTICE_SPACING;
    const minWorldX = Math.min(...stageIICells.map(({ bounds }) => bounds.minX));
    const maxWorldX = Math.max(...stageIICells.map(({ bounds }) => bounds.maxX));
    const minWorldY = Math.min(...stageIICells.map(({ bounds }) => bounds.minY));
    const maxWorldY = Math.max(...stageIICells.map(({ bounds }) => bounds.maxY));
    const minLatticeI = Math.floor(minWorldY / spacing) - 1;
    const maxLatticeI = Math.ceil(maxWorldY / spacing) + 1;
    const minLatticeJ = Math.floor(minWorldX / spacing) - 1;
    const maxLatticeJ = Math.ceil(maxWorldX / spacing) + 1;

    for (let latticeI = minLatticeI; latticeI <= maxLatticeI; latticeI += 1) {
      const stagger = Math.abs(latticeI) % 2 === 1 ? 0.5 : 0;
      for (let latticeJ = minLatticeJ; latticeJ <= maxLatticeJ; latticeJ += 1) {
        const jitterX =
          (hash32(latticeJ, latticeI, 3) - 0.5) * spacing * MIST_LATTICE_JITTER;
        const jitterY =
          (hash32(latticeJ, latticeI, 7) - 0.5) * spacing * MIST_LATTICE_JITTER;
        const anchorX = (latticeJ + stagger) * spacing + jitterX;
        const anchorY = latticeI * spacing + jitterY;
        const anchorI = Math.floor((anchorY - origin.y) / gridSize);
        const anchorJ = Math.floor((anchorX - origin.x) / gridSize);
        if (!stageIIOffsets.has(`${anchorI}:${anchorJ}`)) continue;

        const scaleSeed = hash32(latticeJ, latticeI, 11);
        const rotationSeed = hash32(latticeJ, latticeI, 31);
        const variantSeed = hash32(latticeJ, latticeI, 47);
        const phaseSeed = hash32(latticeJ, latticeI, 71);
        const size = gridSize * (0.92 + scaleSeed * 0.42);
        const half = size / 2;
        const angle = (rotationSeed - 0.5) * 0.8;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const base = mistPositions.length / 2;
        for (const [localX, localY] of [
          [-half, -half],
          [half, -half],
          [half, half],
          [-half, half],
        ] as const) {
          mistPositions.push(
            anchorX + localX * cosine - localY * sine,
            anchorY + localX * sine + localY * cosine,
          );
        }
        mistUvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        const variant = Math.min(3, Math.floor(variantSeed * 4));
        const phase = Math.min(3, Math.floor(phaseSeed * 4));
        const strength = 0.78 + scaleSeed * 0.22;
        mistVariants.push(variant, variant, variant, variant);
        mistPhases.push(phase, phase, phase, phase);
        mistStrengths.push(strength, strength, strength, strength);
        mistIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  if (mistPositions.length / 2 > 0xffff) {
    throw new Error("Frost mist geometry exceeds the Uint16 vertex limit");
  }
  const mist: FrostMistGeometry = {
    positions: new Float32Array(mistPositions),
    uvs: new Float32Array(mistUvs),
    variants: new Float32Array(mistVariants),
    phaseGroups: new Float32Array(mistPhases),
    strengths: new Float32Array(mistStrengths),
    indices: new Uint16Array(mistIndices),
    emitterCount: mistPositions.length / 8,
    vertexCount: mistPositions.length / 2,
    triangleCount: mistIndices.length / 3,
    meshCount: mistPositions.length ? 1 : 0,
  };

  const stageIICellCount = stageIICells.length;
  return {
    mask,
    film,
    mist,
    cellCount: cells.length,
    stageICells: cells.length - stageIICellCount,
    stageIICells: stageIICellCount,
    vertexCount: film.vertexCount + mist.vertexCount,
    triangleCount: film.triangleCount + mist.triangleCount,
  };
};

const MASK_SHADER_FUNCTION = `
vec2 frostMaskAt(vec2 worldPosition) {
  ivec2 cell = ivec2(floor((worldPosition - uMaskOrigin) / uGridSize));
  ivec2 size = ivec2(uMaskSize);
  if (cell.x < 0 || cell.y < 0 || cell.x >= size.x || cell.y >= size.y) {
    return vec2(0.0);
  }
  return texelFetch(uMaskTexture, cell, 0).rg;
}
`;

export const FROST_FILM_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 aVertexPosition;
in float aStageStrength;

uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;

out vec2 vWorldPosition;
out float vStageStrength;

void main() {
  vec3 transformed = translationMatrix * vec3(aVertexPosition, 1.0);
  gl_Position = vec4((projectionMatrix * transformed).xy, 0.0, 1.0);
  vWorldPosition = aVertexPosition;
  vStageStrength = aStageStrength;
}
`;

export const FROST_FILM_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 vWorldPosition;
in float vStageStrength;

uniform sampler2D uMaskTexture;
uniform vec2 uMaskOrigin;
uniform vec2 uMaskSize;
uniform float uGridSize;
uniform float uTime;

out vec4 outColor;

${MASK_SHADER_FUNCTION}

void main() {
  vec2 mask = frostMaskAt(vWorldPosition);
  if (mask.r < 0.5) discard;
  float spatial = sin(vWorldPosition.x / uGridSize * 1.37)
    + cos(vWorldPosition.y / uGridSize * 1.11);
  float shimmer = 0.5 + 0.5 * sin(uTime * 0.62831853 + spatial * 0.72);
  float alpha = (0.010 + shimmer * 0.026) * mix(0.86, 1.0, vStageStrength);
  vec3 color = vec3(0.72, 0.93, 1.0);
  outColor = vec4(color * alpha, alpha);
}
`;

export const FROST_MIST_VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 aVertexPosition;
in vec2 aUv;
in float aVariant;
in float aPhaseGroup;
in float aEmitterStrength;

uniform mat3 translationMatrix;
uniform mat3 projectionMatrix;

out vec2 vWorldPosition;
out vec2 vUv;
out float vVariant;
out float vPhaseGroup;
out float vEmitterStrength;

void main() {
  vec3 transformed = translationMatrix * vec3(aVertexPosition, 1.0);
  gl_Position = vec4((projectionMatrix * transformed).xy, 0.0, 1.0);
  vWorldPosition = aVertexPosition;
  vUv = aUv;
  vVariant = aVariant;
  vPhaseGroup = aPhaseGroup;
  vEmitterStrength = aEmitterStrength;
}
`;

export const FROST_MIST_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 vWorldPosition;
in vec2 vUv;
in float vVariant;
in float vPhaseGroup;
in float vEmitterStrength;

uniform sampler2D uMaskTexture;
uniform sampler2D uMistTexture0;
uniform sampler2D uMistTexture1;
uniform sampler2D uMistTexture2;
uniform sampler2D uMistTexture3;
uniform vec2 uMaskOrigin;
uniform vec2 uMaskSize;
uniform float uGridSize;
uniform float uTime;

out vec4 outColor;

${MASK_SHADER_FUNCTION}

vec2 variantUv(vec2 uv, float variant) {
  float column = mod(variant, 2.0);
  float row = floor(variant / 2.0);
  return (uv + vec2(column, row)) * 0.5;
}

vec4 sampleMist(vec2 uv, float phaseGroup) {
  if (phaseGroup < 0.5) return texture(uMistTexture0, uv);
  if (phaseGroup < 1.5) return texture(uMistTexture1, uv);
  if (phaseGroup < 2.5) return texture(uMistTexture2, uv);
  return texture(uMistTexture3, uv);
}

void main() {
  vec2 mask = frostMaskAt(vWorldPosition);
  if (mask.r < 0.5 || mask.g < 0.8) discard;
  vec4 sampleColor = sampleMist(variantUv(vUv, vVariant), vPhaseGroup);
  // The final Frost asset already carries its approved opacity. Preserve that
  // authored alpha instead of re-amplifying it in the runtime shader.
  float sourceAlpha = clamp(sampleColor.a, 0.0, 1.0);
  float sharedBreath = 0.97 + 0.03 * sin(uTime * 1.57079633);
  float alpha = sourceAlpha * vEmitterStrength * sharedBreath;
  if (alpha < 0.004) discard;
  // Foundry/PIXI uploads transparent video with premultiplied RGB on Chrome.
  // Recover the straight source color before tinting, then premultiply exactly
  // once for the Primary Canvas normal blend. Multiplying the sampled RGB by
  // alpha again makes pale frost mist render as dark smoke.
  vec3 sourceColor = sampleColor.rgb / max(sampleColor.a, 0.001);
  vec3 color = mix(clamp(sourceColor, 0.0, 1.0), vec3(0.78, 0.95, 1.0), 0.22);
  outColor = vec4(color * alpha, alpha);
}
`;

export interface FrostEffectDiagnostics {
  mounted: boolean;
  available: boolean;
  sceneId: string | null;
  frostCells: number;
  stageICells: number;
  stageIICells: number;
  filmMeshCount: number;
  mistMeshCount: number;
  mistEmitters: number;
  vertices: number;
  triangles: number;
  tickerAttached: boolean;
  mediaLoaded: boolean;
  rebuildCount: number;
  lastError: string | null;
}

interface FrostEffectRoot {
  canvas?: any;
  foundry?: any;
  PIXI?: any;
  document?: any;
  console?: Pick<Console, "error">;
}

interface FrostFieldScan {
  cells: FrostFieldCell[];
  gridSize: number;
}

interface FrostMesh {
  mesh: any;
  shader: any;
  geometry: any;
}

interface FrostMaskTexture {
  texture: any;
  data: FrostFieldMask;
}

interface FrostVideoResource {
  video: any;
  texture: any;
  ready: boolean;
  phaseOffset: number;
  playRequested: boolean;
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

const createShaderClasses = (root: FrostEffectRoot): { film: any; mist: any } => {
  const AbstractBaseShader =
    root.foundry?.canvas?.rendering?.shaders?.AbstractBaseShader;
  if (typeof AbstractBaseShader !== "function") {
    throw new Error("Foundry AbstractBaseShader export is unavailable");
  }
  class FrostFilmShader extends AbstractBaseShader {
    static get defaultUniforms(): Record<string, unknown> {
      return {
        uMaskTexture: null,
        uMaskOrigin: [0, 0],
        uMaskSize: [0, 0],
        uGridSize: 1,
        uTime: 0,
      };
    }
    static _createVertexShader(): string {
      return FROST_FILM_VERTEX_SHADER_SOURCE;
    }
    static _createFragmentShader(): string {
      return FROST_FILM_FRAGMENT_SHADER_SOURCE;
    }
  }
  class FrostMistShader extends AbstractBaseShader {
    static get defaultUniforms(): Record<string, unknown> {
      return {
        uMaskTexture: null,
        uMistTexture0: null,
        uMistTexture1: null,
        uMistTexture2: null,
        uMistTexture3: null,
        uMaskOrigin: [0, 0],
        uMaskSize: [0, 0],
        uGridSize: 1,
        uTime: 0,
      };
    }
    static _createVertexShader(): string {
      return FROST_MIST_VERTEX_SHADER_SOURCE;
    }
    static _createFragmentShader(): string {
      return FROST_MIST_FRAGMENT_SHADER_SOURCE;
    }
  }
  return { film: FrostFilmShader, mist: FrostMistShader };
};

const frostMistTexturePath = (): string => {
  const source = TERRAIN_CONFIGURATIONS.frost.stages[1].media.fieldTexture;
  if (!source) throw new Error("Frost mist media path is missing from the terrain catalog");
  return source;
};

export class FrostEffectRenderer {
  readonly #root: FrostEffectRoot;
  #container: any;
  #filmMesh: FrostMesh | undefined;
  #mistMesh: FrostMesh | undefined;
  #maskTexture: FrostMaskTexture | undefined;
  #scene: any;
  #ticker: any;
  #tickerCallback: ((ticker?: any) => void) | undefined;
  #shaderClasses: { film: any; mist: any } | undefined;
  #media: FrostVideoResource[] = [];
  #time = 0;
  #refreshQueued = false;
  #lifecycleGeneration = 0;
  #mounted = false;
  #available = false;
  #tickerAttached = false;
  #frostCells = 0;
  #stageICells = 0;
  #stageIICells = 0;
  #mistEmitters = 0;
  #vertices = 0;
  #triangles = 0;
  #rebuildCount = 0;
  #lastError: string | null = null;
  #reportedError: string | undefined;

  constructor(root: FrostEffectRoot = globalThis as FrostEffectRoot) {
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
    const bufferTextureFactory = this.#root.PIXI?.Texture?.fromBuffer;

    try {
      if (!canvas?.scene || !grid || !primary) {
        throw new Error("Active canvas Scene, grid, or primary group is unavailable");
      }
      if (!isSquareGrid(grid)) {
        throw new Error("Frost field runtime currently requires a Square grid");
      }
      if (typeof containerClass !== "function") {
        throw new Error("Foundry PrimaryCanvasContainer export is unavailable");
      }
      if (typeof geometryClass !== "function" || typeof meshClass !== "function") {
        throw new Error("PIXI Geometry or Mesh export is unavailable");
      }
      if (typeof bufferTextureFactory !== "function") {
        throw new Error("PIXI Texture.fromBuffer is unavailable");
      }
      if (!ticker || typeof ticker.add !== "function" || typeof ticker.remove !== "function") {
        throw new Error("Canvas ticker API is unavailable");
      }

      const container = new containerClass();
      container.name = `${MODULE_ID}-frost-field`;
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
      this.#rebuildNow();

      this.#ticker = ticker;
      this.#tickerCallback = (currentTicker?: any): void => {
        const deltaMS = Number(
          currentTicker?.deltaMS ?? currentTicker?.elapsedMS ?? 1000 / 60,
        );
        if (Number.isFinite(deltaMS)) this.#time += Math.max(0, deltaMS) / 1000;
        if (this.#filmMesh?.shader?.uniforms) {
          this.#filmMesh.shader.uniforms.uTime = this.#time;
        }
        if (this.#mistMesh?.shader?.uniforms) {
          this.#mistMesh.shader.uniforms.uTime = this.#time;
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

  auditFrostEffects(): FrostEffectDiagnostics {
    return {
      mounted: this.#mounted,
      available: this.#available,
      sceneId: objectId(this.#scene) ?? null,
      frostCells: this.#frostCells,
      stageICells: this.#stageICells,
      stageIICells: this.#stageIICells,
      filmMeshCount: this.#filmMesh ? 1 : 0,
      mistMeshCount: this.#mistMesh ? 1 : 0,
      mistEmitters: this.#mistEmitters,
      vertices: this.#vertices,
      triangles: this.#triangles,
      tickerAttached: this.#tickerAttached,
      mediaLoaded:
        this.#media.length === 4 && this.#media.every(({ ready }) => ready),
      rebuildCount: this.#rebuildCount,
      lastError: this.#lastError,
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

  #scan(): FrostFieldScan {
    const canvas = this.#canvas();
    const grid = canvas?.grid as FoundryGridLike | undefined;
    const scene = this.#scene;
    if (!grid || !scene) throw new Error("Frost field canvas state is unavailable");

    const cells: FrostFieldCell[] = [];
    const seen = new Set<string>();
    for (const tile of collectionValues(scene.tiles)) {
      const flag = terrainDocumentFlag(tile);
      if (
        !flag ||
        flag.role !== "terrain-tile" ||
        flag.configurationId !== "frost" ||
        flag.visualEffect !== FROST_FIELD_VISUAL_EFFECT
      ) {
        continue;
      }
      if (!flag.offset || !flag.cellKey) {
        throw new Error("Frost field Tile is missing its persisted cell offset/key");
      }
      if (seen.has(flag.cellKey)) {
        throw new Error(`Duplicate frost field cell: ${flag.cellKey}`);
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
      gridSize: positiveNumber(
        grid.size ?? canvas?.dimensions?.size ?? scene.grid?.size,
        1,
      ),
    };
  }

  #createMaskTexture(data: FrostFieldMask): FrostMaskTexture {
    const PIXI = this.#root.PIXI;
    const texture = PIXI.Texture.fromBuffer(data.pixels, data.width, data.height, {
      scaleMode: PIXI.SCALE_MODES?.NEAREST,
      alphaMode: PIXI.ALPHA_MODES?.NPM,
    });
    if (!texture) throw new Error("Could not create the Frost field mask texture");
    return { texture, data };
  }

  #createMedia(): void {
    if (this.#media.length) return;
    const document = this.#document();
    const textureFactory = this.#root.PIXI?.Texture?.from;
    if (!document || typeof document.createElement !== "function") {
      throw new Error("Browser document API is unavailable for Frost mist media");
    }
    if (typeof textureFactory !== "function") {
      throw new Error("PIXI Texture.from is unavailable for Frost mist media");
    }
    const source = frostMistTexturePath();
    const created: FrostVideoResource[] = [];
    try {
      for (let phaseOffset = 0; phaseOffset < 4; phaseOffset += 1) {
        const video = document.createElement("video");
        if (!video) throw new Error("Could not create Frost mist video element");
        video.muted = true;
        video.loop = true;
        // PIXI 7's VideoResource can recurse between _onPlayStart and
        // _onCanPlay when playback begins before the resource has a valid
        // video size. Let PIXI finish its canplay handler before requesting
        // muted playback ourselves.
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
        const resource: FrostVideoResource = {
          video,
          texture: this.#root.PIXI.Texture.from(video, {
            resourceOptions: { autoPlay: false, updateFPS: 24 },
          }),
          ready: Number(video.readyState) >= 2,
          phaseOffset,
          playRequested: false,
        };
        const generation = this.#lifecycleGeneration;
        resource.onReady = () => {
          if (generation !== this.#lifecycleGeneration || !this.#mounted) return;
          resource.ready = true;
          this.#syncVideoClocks();
          if (Number(video.readyState) < 3 || resource.playRequested) return;
          resource.playRequested = true;
          const playResult = video.play?.();
          if (playResult && typeof playResult.catch === "function") {
            playResult.catch(() => {
              // Keep the muted resource alive for browsers that require a later gesture.
              resource.playRequested = false;
            });
          }
        };
        resource.onError = () => {
          if (generation !== this.#lifecycleGeneration || !this.#mounted) return;
          this.#fail(new Error(`Frost mist video failed to load: ${source}`));
        };
        video.addEventListener?.("loadeddata", resource.onReady);
        video.addEventListener?.("canplay", resource.onReady);
        video.addEventListener?.("error", resource.onError);
        document.body?.appendChild?.(video);
        video.load?.();
        if (Number(video.readyState) >= 3) resource.onReady();
        created.push(resource);
      }
      this.#media = created;
    } catch (error) {
      for (const resource of created) this.#destroyVideoResource(resource);
      throw error;
    }
  }

  #syncVideoClocks(): void {
    for (const { video, phaseOffset } of this.#media) {
      const duration = Number(video.duration);
      if (!(duration > 0) || Number(video.readyState) < 2) continue;
      const target = (this.#time + phaseOffset) % duration;
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
    const data = buildFrostFieldGeometry(scan.cells, scan.gridSize);
    if (data.stageIICells > 0) this.#createMedia();
    else this.#destroyAllMedia();

    let nextMask: FrostMaskTexture | undefined;
    let nextFilm: FrostMesh | undefined;
    let nextMist: FrostMesh | undefined;
    try {
      if (data.cellCount) {
        nextMask = this.#createMaskTexture(data.mask);
        nextFilm = this.#createFilmMesh(data, nextMask);
        if (data.stageIICells) nextMist = this.#createMistMesh(data, nextMask);
        this.#container.addChild(nextFilm.mesh);
        if (nextMist) this.#container.addChild(nextMist.mesh);
        for (const fieldMesh of [nextFilm, nextMist]) {
          if (!fieldMesh) continue;
          fieldMesh.mesh.interactive = false;
          fieldMesh.mesh.interactiveChildren = false;
          fieldMesh.mesh.eventMode = "none";
        }
      }
    } catch (error) {
      if (nextMist) this.#destroyMesh(nextMist);
      if (nextFilm) this.#destroyMesh(nextFilm);
      if (nextMask) this.#destroyMaskTexture(nextMask);
      throw error;
    }

    const previousFilm = this.#filmMesh;
    const previousMist = this.#mistMesh;
    const previousMask = this.#maskTexture;
    this.#filmMesh = nextFilm;
    this.#mistMesh = nextMist;
    this.#maskTexture = nextMask;
    if (previousMist) this.#destroyMesh(previousMist);
    if (previousFilm) this.#destroyMesh(previousFilm);
    if (previousMask) this.#destroyMaskTexture(previousMask);

    this.#frostCells = data.cellCount;
    this.#stageICells = data.stageICells;
    this.#stageIICells = data.stageIICells;
    this.#mistEmitters = data.mist.emitterCount;
    this.#vertices = data.vertexCount;
    this.#triangles = data.triangleCount;
    this.#rebuildCount += 1;
    this.#lastError = null;
    this.#reportedError = undefined;
  }

  #shaderUniforms(mask: FrostMaskTexture): Record<string, unknown> {
    return {
      uMaskTexture: mask.texture,
      uMaskOrigin: [mask.data.originX, mask.data.originY],
      uMaskSize: [mask.data.width, mask.data.height],
      uGridSize: mask.data.gridSize,
      uTime: this.#time,
    };
  }

  #configureMesh(mesh: any, name: string, size: number): void {
    mesh.name = name;
    mesh.start = 0;
    mesh.size = size;
    mesh.interactive = false;
    mesh.eventMode = "none";
    mesh.sortLayer =
      this.#root.foundry?.canvas?.groups?.PrimaryCanvasGroup?.SORT_LAYERS
        ?.TILES ?? 500;
    mesh.sort = 1;
    mesh.elevation = 0;
    mesh.zIndex = 0;
  }

  #createFilmMesh(data: FrostFieldGeometry, mask: FrostMaskTexture): FrostMesh {
    const PIXI = this.#root.PIXI;
    const geometry = new PIXI.Geometry();
    let shader: any;
    try {
      geometry
        .addAttribute("aVertexPosition", data.film.positions, 2)
        .addAttribute("aStageStrength", data.film.stageStrengths, 1)
        .addIndex(data.film.indices);
      this.#shaderClasses ??= createShaderClasses(this.#root);
      shader = this.#shaderClasses.film.create(this.#shaderUniforms(mask));
      const mesh = new PIXI.Mesh(geometry, shader);
      this.#configureMesh(
        mesh,
        `${MODULE_ID}-frost-film-mesh`,
        data.film.indices.length,
      );
      return { mesh, shader, geometry };
    } catch (error) {
      shader?.destroy?.();
      this.#destroyGeometry(geometry);
      throw error;
    }
  }

  #createMistMesh(data: FrostFieldGeometry, mask: FrostMaskTexture): FrostMesh {
    if (this.#media.length !== 4) {
      throw new Error("Frost mist phase media is unavailable");
    }
    const PIXI = this.#root.PIXI;
    const geometry = new PIXI.Geometry();
    let shader: any;
    try {
      geometry
        .addAttribute("aVertexPosition", data.mist.positions, 2)
        .addAttribute("aUv", data.mist.uvs, 2)
        .addAttribute("aVariant", data.mist.variants, 1)
        .addAttribute("aPhaseGroup", data.mist.phaseGroups, 1)
        .addAttribute("aEmitterStrength", data.mist.strengths, 1)
        .addIndex(data.mist.indices);
      this.#shaderClasses ??= createShaderClasses(this.#root);
      shader = this.#shaderClasses.mist.create({
        ...this.#shaderUniforms(mask),
        uMistTexture0: this.#media[0]!.texture,
        uMistTexture1: this.#media[1]!.texture,
        uMistTexture2: this.#media[2]!.texture,
        uMistTexture3: this.#media[3]!.texture,
      });
      const mesh = new PIXI.Mesh(geometry, shader);
      this.#configureMesh(
        mesh,
        `${MODULE_ID}-frost-mist-mesh`,
        data.mist.indices.length,
      );
      return { mesh, shader, geometry };
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

  #destroyMesh(fieldMesh: FrostMesh): void {
    if (fieldMesh.mesh?.parent) fieldMesh.mesh.parent.removeChild(fieldMesh.mesh);
    try {
      fieldMesh.mesh?.destroy?.({ children: true });
    } finally {
      fieldMesh.shader?.destroy?.();
      this.#destroyGeometry(fieldMesh.geometry);
    }
  }

  #destroyMaskTexture(mask: FrostMaskTexture): void {
    mask.texture?.destroy?.(true);
  }

  #destroyVideoResource(resource: FrostVideoResource): void {
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

  #destroyAllMedia(): void {
    for (const resource of this.#media) this.#destroyVideoResource(resource);
    this.#media = [];
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
    if (this.#mistMesh) this.#destroyMesh(this.#mistMesh);
    if (this.#filmMesh) this.#destroyMesh(this.#filmMesh);
    if (this.#maskTexture) this.#destroyMaskTexture(this.#maskTexture);
    this.#mistMesh = undefined;
    this.#filmMesh = undefined;
    this.#maskTexture = undefined;
    if (this.#container?.parent) this.#container.parent.removeChild(this.#container);
    this.#container?.destroy?.({ children: true });
    this.#container = undefined;
    this.#destroyAllMedia();
    this.#scene = undefined;
    this.#mounted = false;
    this.#available = false;
    this.#frostCells = 0;
    this.#stageICells = 0;
    this.#stageIICells = 0;
    this.#mistEmitters = 0;
    this.#vertices = 0;
    this.#triangles = 0;
    this.#rebuildCount = 0;
    this.#time = 0;
    this.#shaderClasses = undefined;
    if (clearDiagnostics) {
      this.#lastError = null;
      this.#reportedError = undefined;
    }
  }

  #fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.#lastError = message;
    if (this.#reportedError !== message) {
      this.#root.console?.error?.(
        `[${MODULE_ID}] Frost field runtime disabled: ${message}`,
      );
      this.#reportedError = message;
    }
    this.#detachTicker();
    if (this.#mistMesh) this.#destroyMesh(this.#mistMesh);
    if (this.#filmMesh) this.#destroyMesh(this.#filmMesh);
    if (this.#maskTexture) this.#destroyMaskTexture(this.#maskTexture);
    this.#mistMesh = undefined;
    this.#filmMesh = undefined;
    this.#maskTexture = undefined;
    if (this.#container?.parent) this.#container.parent.removeChild(this.#container);
    this.#container?.destroy?.({ children: true });
    this.#container = undefined;
    this.#destroyAllMedia();
    this.#scene = undefined;
    this.#mounted = false;
    this.#available = false;
    this.#frostCells = 0;
    this.#stageICells = 0;
    this.#stageIICells = 0;
    this.#mistEmitters = 0;
    this.#vertices = 0;
    this.#triangles = 0;
    this.#shaderClasses = undefined;
  }
}
