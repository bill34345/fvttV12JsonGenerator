import { afterEach, describe, expect, test } from "bun:test";

import {
  buildFrostFieldGeometry,
  FROST_FILM_FRAGMENT_SHADER_SOURCE,
  FROST_MIST_FRAGMENT_SHADER_SOURCE,
  FrostEffectRenderer,
  type FrostFieldCell,
} from "../src/frost-effect-renderer";

const previousConst = Object.getOwnPropertyDescriptor(globalThis, "CONST");

afterEach(() => {
  if (previousConst) Object.defineProperty(globalThis, "CONST", previousConst);
  else Reflect.deleteProperty(globalThis, "CONST");
});

const cell = (i: number, j: number, stageIndex = 0): FrostFieldCell => ({
  key: `${i}:${j}`,
  center: { x: j * 100 + 50, y: i * 100 + 50 },
  vertices: [
    { x: j * 100, y: i * 100 },
    { x: j * 100 + 100, y: i * 100 },
    { x: j * 100 + 100, y: i * 100 + 100 },
    { x: j * 100, y: i * 100 + 100 },
  ],
  stageIndex,
  offset: { i, j },
});

describe("frost field geometry and mask", () => {
  test("builds an exact occupancy/stage mask and Stage II-only mist", () => {
    const geometry = buildFrostFieldGeometry([
      cell(0, 0, 0),
      cell(0, 1, 1),
      cell(1, 0, 1),
    ], 100);

    expect(geometry).toMatchObject({
      cellCount: 3,
      stageICells: 1,
      stageIICells: 2,
    });
    expect(geometry.film).toMatchObject({
      meshCount: 1,
      vertexCount: 12,
      triangleCount: 6,
    });
    expect(geometry.mist.meshCount).toBe(1);
    expect(geometry.mist.emitterCount).toBeGreaterThanOrEqual(4);
    expect(geometry.mist.emitterCount).toBeLessThanOrEqual(6);
    expect(geometry.mist.vertexCount).toBe(geometry.mist.emitterCount * 4);
    expect(geometry.mist.triangleCount).toBe(geometry.mist.emitterCount * 2);
    expect(geometry.vertexCount).toBe(geometry.film.vertexCount + geometry.mist.vertexCount);
    expect(geometry.triangleCount).toBe(
      geometry.film.triangleCount + geometry.mist.triangleCount,
    );
    expect([...new Set(geometry.mist.variants)].every((value) => value >= 0 && value <= 3)).toBe(true);
    expect([...new Set(geometry.mist.phaseGroups)].every((value) => value >= 0 && value <= 3)).toBe(true);
    expect(geometry.mask).toMatchObject({
      width: 2,
      height: 2,
      originX: 0,
      originY: 0,
      gridSize: 100,
    });
    expect([...geometry.mask.pixels]).toEqual([
      255, 140, 0, 255,
      255, 255, 0, 255,
      255, 255, 0, 255,
      0, 0, 0, 0,
    ]);
  });

  test("is deterministic across Tile/bundle draw order and leaves Stage I mist-free", () => {
    const cells = [cell(2, 3, 1), cell(2, 4, 1), cell(3, 3, 0)];
    const first = buildFrostFieldGeometry(cells, 100);
    const second = buildFrostFieldGeometry([...cells].reverse(), 100);
    expect([...second.mist.positions]).toEqual([...first.mist.positions]);
    expect([...second.mist.variants]).toEqual([...first.mist.variants]);
    expect([...second.mist.phaseGroups]).toEqual([...first.mist.phaseGroups]);

    const adjacent = buildFrostFieldGeometry(
      [cell(0, 0, 1), cell(0, 1, 1), cell(0, 2, 1)],
      100,
    );
    const normalizedCenters = Array.from(
      { length: adjacent.mist.emitterCount },
      (_, index) => {
        const position = index * 8;
        const centerX =
          (adjacent.mist.positions[position]! +
            adjacent.mist.positions[position + 4]!) /
          2;
        const centerY =
          (adjacent.mist.positions[position + 1]! +
            adjacent.mist.positions[position + 5]!) /
          2;
        return `${(centerX % 100).toFixed(2)}:${(centerY % 100).toFixed(2)}`;
      },
    );
    expect(new Set(normalizedCenters).size).toBeGreaterThan(3);

    const stageIOnly = buildFrostFieldGeometry([cell(0, 0, 0)], 100);
    expect(stageIOnly.mist).toMatchObject({
      meshCount: 0,
      emitterCount: 0,
      vertexCount: 0,
      triangleCount: 0,
    });
  });

  test("keeps the 15 by 15 Stage II pressure sample within two meshes", () => {
    const cells = Array.from({ length: 225 }, (_, index) =>
      cell(Math.floor(index / 15), index % 15, 1),
    );
    const geometry = buildFrostFieldGeometry(cells, 100);
    expect(geometry).toMatchObject({
      cellCount: 225,
      stageICells: 0,
      stageIICells: 225,
    });
    expect(geometry.film.meshCount + geometry.mist.meshCount).toBe(2);
    expect(geometry.mist.emitterCount).toBeGreaterThanOrEqual(540);
    expect(geometry.mist.emitterCount).toBeLessThanOrEqual(675);
    expect(geometry.vertexCount).toBeLessThanOrEqual(3600);
    expect(geometry.triangleCount).toBeLessThanOrEqual(1800);
  });
});

describe("frost shader contract", () => {
  test("uses exact texel masks, a slow shimmer, and four shared mist phases", () => {
    expect(FROST_FILM_FRAGMENT_SHADER_SOURCE).toContain("texelFetch");
    expect(FROST_FILM_FRAGMENT_SHADER_SOURCE).toContain("uTime * 0.62831853");
    expect(FROST_FILM_FRAGMENT_SHADER_SOURCE).not.toContain("texture2D");
    expect(FROST_MIST_FRAGMENT_SHADER_SOURCE).toContain("texelFetch");
    expect(FROST_MIST_FRAGMENT_SHADER_SOURCE).toContain("mask.g < 0.8");
    expect(FROST_MIST_FRAGMENT_SHADER_SOURCE).toContain("uMistTexture3");
    expect(FROST_MIST_FRAGMENT_SHADER_SOURCE).toContain("variantUv");
    expect(FROST_MIST_FRAGMENT_SHADER_SOURCE).toContain(
      "sampleColor.rgb / max(sampleColor.a, 0.001)",
    );
    expect(FROST_MIST_FRAGMENT_SHADER_SOURCE).toContain(
      "clamp(sampleColor.a, 0.0, 1.0)",
    );
    expect(FROST_MIST_FRAGMENT_SHADER_SOURCE).not.toContain("sampleColor.a * 2.10");
    expect(FROST_MIST_FRAGMENT_SHADER_SOURCE).toContain("color * alpha");
    expect(FROST_MIST_FRAGMENT_SHADER_SOURCE).not.toContain("scroll");
  });
});

class FakeContainer {
  parent: FakeContainer | undefined;
  children: any[] = [];
  destroyed = false;
  eventMode = "auto";
  interactiveChildren = true;
  #interactive = true;
  get interactive() {
    return this.#interactive;
  }
  set interactive(value: boolean) {
    this.#interactive = value;
    if (!value) this.eventMode = "auto";
  }
  addChild(child: any) {
    child.parent = this;
    this.children.push(child);
    child.eventMode = "auto";
    child.interactiveChildren = true;
    return child;
  }
  removeChild(child: any) {
    this.children = this.children.filter((candidate) => candidate !== child);
    if (child.parent === this) child.parent = undefined;
    return child;
  }
  destroy() {
    this.destroyed = true;
    this.children.length = 0;
  }
}

class FakeGeometry {
  attributes: Record<string, unknown> = {};
  indices: unknown;
  disposed = false;
  addAttribute(name: string, data: unknown) {
    this.attributes[name] = data;
    return this;
  }
  addIndex(data: unknown) {
    this.indices = data;
    return this;
  }
  dispose() {
    this.disposed = true;
  }
}

class FakeMesh {
  parent: FakeContainer | undefined;
  destroyed = false;
  start = 0;
  size = 0;
  eventMode = "auto";
  interactiveChildren = true;
  #interactive = true;
  get interactive() {
    return this.#interactive;
  }
  set interactive(value: boolean) {
    this.#interactive = value;
    if (!value) this.eventMode = "auto";
  }
  constructor(
    public geometry: FakeGeometry,
    public shader: { uniforms: Record<string, unknown>; destroy(): void },
  ) {}
  destroy() {
    this.destroyed = true;
  }
}

class FakeVideo {
  src = "";
  muted = false;
  loop = false;
  autoplay = false;
  playsInline = false;
  preload = "";
  crossOrigin = "";
  readyState = 3;
  duration = 4;
  currentTime = 0;
  playCount = 0;
  style: Record<string, string> = {};
  parentNode: FakeBody | undefined;
  #listeners = new Map<string, Set<() => void>>();
  setAttribute() {}
  removeAttribute() {}
  addEventListener(name: string, callback: () => void) {
    const listeners = this.#listeners.get(name) ?? new Set<() => void>();
    listeners.add(callback);
    this.#listeners.set(name, listeners);
  }
  removeEventListener(name: string, callback?: () => void) {
    if (callback) this.#listeners.get(name)?.delete(callback);
  }
  emit(name: string) {
    for (const callback of this.#listeners.get(name) ?? []) callback();
  }
  load() {}
  play() {
    this.playCount += 1;
    return Promise.resolve();
  }
  pause() {}
}

class FakeBody {
  children: FakeVideo[] = [];
  appendChild(video: FakeVideo) {
    this.children.push(video);
    video.parentNode = this;
    return video;
  }
  removeChild(video: FakeVideo) {
    this.children = this.children.filter((candidate) => candidate !== video);
    video.parentNode = undefined;
    return video;
  }
}

class FakeDocument {
  body = new FakeBody();
  createElement(name: string) {
    if (name !== "video") throw new Error(`Unexpected element: ${name}`);
    return new FakeVideo();
  }
}

class FakeTexture {
  destroyed = false;
  constructor(public source: unknown) {}
  destroy() {
    this.destroyed = true;
  }
}

class FakeShaderBase {
  static get defaultUniforms() {
    return {};
  }
  static create(uniforms: Record<string, unknown> = {}) {
    return {
      uniforms: { ...(this as any).defaultUniforms, ...uniforms },
      destroy() {},
    };
  }
}

class FakeTicker {
  callbacks = new Set<(ticker: FakeTicker) => void>();
  addCount = 0;
  removeCount = 0;
  deltaMS = 16.666;
  add(callback: (ticker: FakeTicker) => void) {
    this.callbacks.add(callback);
    this.addCount += 1;
  }
  remove(callback: (ticker: FakeTicker) => void) {
    this.callbacks.delete(callback);
    this.removeCount += 1;
  }
  tick() {
    for (const callback of this.callbacks) callback(this);
  }
}

const runtimeRoot = (options: { square?: boolean; bufferTexture?: boolean } = {}) => {
  const ticker = new FakeTicker();
  const primary = new FakeContainer();
  const scene = { id: "scene-frost", tiles: [] as any[], grid: { size: 100 } };
  const grid = {
    size: 100,
    isSquare: options.square ?? true,
    getOffset: ({ x, y }: { x: number; y: number }) => ({
      i: Math.floor(y / 100),
      j: Math.floor(x / 100),
    }),
    getCenterPoint: ({ i, j }: { i: number; j: number }) => ({
      x: j * 100 + 50,
      y: i * 100 + 50,
    }),
    getVertices: ({ i, j }: { i: number; j: number }) => [
      { x: j * 100, y: i * 100 },
      { x: j * 100 + 100, y: i * 100 },
      { x: j * 100 + 100, y: i * 100 + 100 },
      { x: j * 100, y: i * 100 + 100 },
    ],
  };
  const errors: string[] = [];
  const document = new FakeDocument();
  const textureOptions: unknown[] = [];
  const textureApi: Record<string, unknown> = {
    from: (video: FakeVideo, textureOption: unknown) => {
      textureOptions.push(textureOption);
      return new FakeTexture(video);
    },
  };
  if (options.bufferTexture ?? true) {
    textureApi.fromBuffer = (
      pixels: Uint8Array,
      width: number,
      height: number,
    ) => new FakeTexture({ pixels, width, height });
  }
  const root = {
    canvas: { scene, grid, primary, app: { ticker } },
    foundry: {
      canvas: {
        primary: { PrimaryCanvasContainer: FakeContainer },
        groups: { PrimaryCanvasGroup: { SORT_LAYERS: { TILES: 500 } } },
        rendering: { shaders: { AbstractBaseShader: FakeShaderBase } },
      },
    },
    PIXI: {
      Geometry: FakeGeometry,
      Mesh: FakeMesh,
      Texture: textureApi,
      SCALE_MODES: { NEAREST: 0 },
      ALPHA_MODES: { NPM: 0 },
      Ticker: { shared: ticker },
    },
    document,
    textureOptions,
    console: { error: (message: string) => errors.push(message) },
  };
  Object.defineProperty(globalThis, "CONST", {
    configurable: true,
    value: { GRID_TYPES: { SQUARE: 1 } },
  });
  return { root, scene, ticker, primary, document, textureOptions, errors };
};

const frostTile = (
  scene: any,
  cellKey: string,
  offset: { i: number; j: number },
  stageIndex: number,
) => ({
  parent: scene,
  flags: {
    "fvtt-battlefield-painter": {
      bundleId: `bundle-${cellKey}`,
      configurationId: "frost",
      stageIndex,
      visualEffect: "frost-field-v1",
      role: "terrain-tile",
      cellKey,
      offset,
    },
  },
});

describe("frost effect lifecycle", () => {
  test("keeps Stage I media-free, adds one Stage II mist mesh, and tears down", async () => {
    const runtime = runtimeRoot();
    runtime.scene.tiles.push(frostTile(runtime.scene, "0:0", { i: 0, j: 0 }, 0));
    const renderer = new FrostEffectRenderer(runtime.root);

    renderer.onCanvasReady();
    expect(renderer.auditFrostEffects()).toMatchObject({
      mounted: true,
      available: true,
      sceneId: "scene-frost",
      frostCells: 1,
      stageICells: 1,
      stageIICells: 0,
      filmMeshCount: 1,
      mistMeshCount: 0,
      mistEmitters: 0,
      vertices: 4,
      triangles: 2,
      tickerAttached: true,
      mediaLoaded: false,
      rebuildCount: 1,
      lastError: null,
    });
    expect(runtime.document.body.children).toHaveLength(0);

    runtime.scene.tiles.push(frostTile(runtime.scene, "0:1", { i: 0, j: 1 }, 1));
    renderer.onTileDocumentEvent(runtime.scene.tiles[1]);
    renderer.onTileDocumentEvent(runtime.scene.tiles[1]);
    await Promise.resolve();
    expect(renderer.auditFrostEffects()).toMatchObject({
      frostCells: 2,
      stageICells: 1,
      stageIICells: 1,
      filmMeshCount: 1,
      mistMeshCount: 1,
      mistEmitters: 2,
      vertices: 16,
      triangles: 8,
      mediaLoaded: true,
      rebuildCount: 2,
    });
    expect(runtime.document.body.children).toHaveLength(4);
    expect(runtime.document.body.children.every(({ src }) => src.endsWith("frost-mist-v1.webm"))).toBe(true);
    expect(runtime.document.body.children.every(({ autoplay }) => !autoplay)).toBe(true);
    expect(runtime.document.body.children.every(({ playCount }) => playCount === 1)).toBe(true);
    expect(runtime.textureOptions).toEqual(
      Array.from({ length: 4 }, () => ({
        resourceOptions: { autoPlay: false, updateFPS: 24 },
      })),
    );
    expect((runtime.primary.children[0] as FakeContainer).children).toHaveLength(2);
    expect(runtime.ticker.callbacks).toHaveLength(1);

    const rebuilds = renderer.auditFrostEffects().rebuildCount;
    renderer.onTileDocumentEvent({ parent: { id: "another-scene" } });
    await Promise.resolve();
    expect(renderer.auditFrostEffects().rebuildCount).toBe(rebuilds);

    runtime.scene.tiles[1].flags["fvtt-battlefield-painter"].stageIndex = 0;
    renderer.onTileDocumentEvent(runtime.scene.tiles[1]);
    await Promise.resolve();
    expect(renderer.auditFrostEffects()).toMatchObject({
      stageICells: 2,
      stageIICells: 0,
      filmMeshCount: 1,
      mistMeshCount: 0,
      mistEmitters: 0,
      mediaLoaded: false,
    });
    expect(runtime.document.body.children).toHaveLength(0);

    renderer.onCanvasReady();
    expect(runtime.primary.children).toHaveLength(1);
    expect(runtime.ticker.callbacks).toHaveLength(1);
    expect(runtime.ticker.removeCount).toBe(1);

    renderer.onCanvasTearDown();
    expect(renderer.auditFrostEffects()).toMatchObject({
      mounted: false,
      available: false,
      sceneId: null,
      frostCells: 0,
      filmMeshCount: 0,
      mistMeshCount: 0,
      tickerAttached: false,
      rebuildCount: 0,
      lastError: null,
    });
    expect(runtime.document.body.children).toHaveLength(0);
  });

  test("ignores stale media errors after teardown and fails closed while active", () => {
    const stale = runtimeRoot();
    stale.scene.tiles.push(frostTile(stale.scene, "0:0", { i: 0, j: 0 }, 1));
    const staleRenderer = new FrostEffectRenderer(stale.root);
    staleRenderer.onCanvasReady();
    const staleVideo = stale.document.body.children[0]!;
    staleRenderer.onCanvasTearDown();
    staleVideo.emit("error");
    expect(staleRenderer.auditFrostEffects().lastError).toBeNull();

    const active = runtimeRoot();
    active.scene.tiles.push(frostTile(active.scene, "0:0", { i: 0, j: 0 }, 1));
    const activeRenderer = new FrostEffectRenderer(active.root);
    activeRenderer.onCanvasReady();
    active.document.body.children[0]!.emit("error");
    expect(activeRenderer.auditFrostEffects()).toMatchObject({
      mounted: false,
      available: false,
      lastError: expect.stringContaining("failed to load"),
    });
    expect(active.document.body.children).toHaveLength(0);
  });

  test("fails closed for non-square grids and missing buffer textures", () => {
    const nonSquare = runtimeRoot({ square: false });
    const nonSquareRenderer = new FrostEffectRenderer(nonSquare.root);
    nonSquareRenderer.onCanvasReady();
    expect(nonSquareRenderer.auditFrostEffects()).toMatchObject({
      mounted: false,
      available: false,
      lastError: expect.stringContaining("Square"),
    });

    const missing = runtimeRoot({ bufferTexture: false });
    const missingRenderer = new FrostEffectRenderer(missing.root);
    missingRenderer.onCanvasReady();
    expect(missingRenderer.auditFrostEffects()).toMatchObject({
      mounted: false,
      available: false,
      lastError: expect.stringContaining("fromBuffer"),
    });
  });
});
