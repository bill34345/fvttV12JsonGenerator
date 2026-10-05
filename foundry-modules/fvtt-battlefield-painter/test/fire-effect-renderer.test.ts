import { afterEach, describe, expect, test } from "bun:test";

import {
  buildFireFieldGeometry,
  FIRE_FIELD_FRAGMENT_SHADER_SOURCE,
  FireEffectRenderer,
  fireStageIntensity,
  type FireFieldCell,
} from "../src/fire-effect-renderer";

const previousConst = Object.getOwnPropertyDescriptor(globalThis, "CONST");

afterEach(() => {
  if (previousConst) Object.defineProperty(globalThis, "CONST", previousConst);
  else Reflect.deleteProperty(globalThis, "CONST");
});

const cell = (
  i: number,
  j: number,
  stageIndex = 0,
): FireFieldCell => ({
  key: `${i}:${j}`,
  center: { x: i * 100 + 50, y: j * 100 + 50 },
  vertices: [
    { x: i * 100, y: j * 100 },
    { x: i * 100 + 100, y: j * 100 },
    { x: i * 100 + 100, y: j * 100 + 100 },
    { x: i * 100, y: j * 100 + 100 },
  ],
  stageIndex,
});

describe("fire field geometry", () => {
  test("uses Foundry row i and column j for adjacent persisted cells away from the diagonal", () => {
    // Core 14.368 SquareGrid.getOffset: i=floor(y/size), j=floor(x/size).
    const cells = [5, 6].map((column) => ({
      ...cell(column, 2),
      key: `2:${column}`,
      offset: { i: 2, j: column },
    }));
    const geometry = buildFireFieldGeometry(cells, 100);
    expect(geometry).toMatchObject({cellCount:2,emitterCount:8,meshCount:1});
    const xs = [...geometry.positions].filter((_, index) => index % 2 === 0);
    const ys = [...geometry.positions].filter((_, index) => index % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(500);
    expect(Math.max(...xs)).toBeLessThanOrEqual(700);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(200);
    expect(Math.max(...ys)).toBeLessThanOrEqual(300);
    const inferred = buildFireFieldGeometry(cells.map(({offset,...withoutOffset})=>withoutOffset),100);
    expect(inferred).toMatchObject({cellCount:2,emitterCount:8});
    // Without stored offsets the local origin changes the random seed,
    // while both paths must still keep every vertex in the occupied cells.
    for (let n = 0; n < inferred.positions.length; n += 2) {
      expect(inferred.positions[n]).toBeGreaterThanOrEqual(500);
      expect(inferred.positions[n]).toBeLessThanOrEqual(700);
      expect(inferred.positions[n + 1]).toBeGreaterThanOrEqual(200);
      expect(inferred.positions[n + 1]).toBeLessThanOrEqual(300);
    }
  });
  test("renders every persisted row/column cell away from the origin", () => {
    // Foundry i is row (y), j is column (x), including on padded scenes.
    const cells = Array.from({ length: 9 }, (_, n) => {
      const i = 5 + Math.floor(n / 3), j = 16 + n % 3;
      return { ...cell(j, i), key: `${i}:${j}`, offset: { i, j } };
    });
    const geometry = buildFireFieldGeometry(cells, 100);
    expect(geometry.emitterCount).toBe(36);
    expect(geometry.vertexCount).toBeGreaterThan(144);
    for (let n = 0; n < geometry.positions.length; n += 2) {
      expect(geometry.positions[n]).toBeGreaterThanOrEqual(1600);
      expect(geometry.positions[n]).toBeLessThanOrEqual(1900);
      expect(geometry.positions[n + 1]).toBeGreaterThanOrEqual(500);
      expect(geometry.positions[n + 1]).toBeLessThanOrEqual(800);
    }
  });

  test("uses the planned stage weights", () => {
    expect(fireStageIntensity(0)).toBe(0.55);
    expect(fireStageIntensity(1)).toBe(1);
  });

  test("uses world-anchored Stage I and Stage II emitter densities", () => {
    const geometry = buildFireFieldGeometry([cell(0, 0), cell(1, 0, 1)], 100);

    expect(geometry).toMatchObject({
      cellCount: 2,
      meshCount: 1,
      emitterCount: 12,
      vertexCount: 48,
      triangleCount: 24,
    });
    expect([...new Set(geometry.stageIndices)]).toEqual([0, 1]);
    expect([...new Set(geometry.variants)].every((value) => value >= 0 && value <= 3)).toBe(true);
  });

  test("does not fill an L-shaped bounding-box hole or diagonal-only space", () => {
    const geometry = buildFireFieldGeometry([
      cell(0, 0),
      cell(1, 0),
      cell(0, 1),
      cell(2, 2),
    ], 100);

    expect(geometry.cellCount).toBe(4);
    expect(geometry.emitterCount).toBe(16);
    expect(geometry.vertexCount).toBeGreaterThan(64);
    for (let index = 0; index < geometry.positions.length / 2; index += 1) {
      const x = geometry.positions[index * 2]!;
      const y = geometry.positions[index * 2 + 1]!;
      expect(x < 200 || y < 100 || y >= 200 || x >= 200).toBe(true);
    }
  });

  test("keeps the 15 by 15 pressure sample in one bounded mesh", () => {
    const cells = Array.from({ length: 225 }, (_, index) =>
      cell(index % 15, Math.floor(index / 15), index % 4 === 0 ? 1 : 0),
    );
    const geometry = buildFireFieldGeometry(cells, 100);

    expect(geometry).toMatchObject({
      cellCount: 225,
      meshCount: 1,
      emitterCount: 1128,
    });
    expect(geometry.vertexCount).toBeLessThan(65536);
    expect(geometry.indices.length).toBe(geometry.triangleCount * 3);
  });
});

describe("fire field shader contract", () => {
  test("samples the two shared flipbook videos and black-keys their backing", () => {
    expect(FIRE_FIELD_FRAGMENT_SHADER_SOURCE).toContain("sampler2D");
    expect(FIRE_FIELD_FRAGMENT_SHADER_SOURCE).toContain("uStageITexture");
    expect(FIRE_FIELD_FRAGMENT_SHADER_SOURCE).toContain("uStageIITexture");
    expect(FIRE_FIELD_FRAGMENT_SHADER_SOURCE).toContain("variantUv");
    expect(FIRE_FIELD_FRAGMENT_SHADER_SOURCE).toContain("blackKey");
    expect(FIRE_FIELD_FRAGMENT_SHADER_SOURCE).toContain("uTime");
    expect(FIRE_FIELD_FRAGMENT_SHADER_SOURCE).not.toContain("valueNoise");
    expect(FIRE_FIELD_FRAGMENT_SHADER_SOURCE).not.toContain("fbm");
    expect(FIRE_FIELD_FRAGMENT_SHADER_SOURCE).not.toContain("texture2D");
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
  videoWidth = 768;
  videoHeight = 768;
  loadCount = 0;
  playCount = 0;
  duration = 4;
  currentTime = 0;
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
    if (!callback) return;
    this.#listeners.get(name)?.delete(callback);
  }
  emit(name: string) { for (const callback of this.#listeners.get(name) ?? []) callback(); }
  load() { this.loadCount += 1; }
  play() {
    if (!(this.videoWidth > 0 && this.videoHeight > 0)) throw new Error("play while media dimensions are invalid");
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
  constructor(private mediaReady = true) {}
  createElement(name: string) {
    if (name !== "video") throw new Error(`Unexpected element: ${name}`);
    const video = new FakeVideo();
    if (!this.mediaReady) {video.readyState=1;video.videoWidth=0;video.videoHeight=0;}
    return video;
  }
}

class FakeTexture {
  destroyed = false;
  constructor(public video: FakeVideo) {}
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

const runtimeRoot = (options: { square?: boolean; mediaReady?: boolean } = {}) => {
  const ticker = new FakeTicker();
  const primary = new FakeContainer();
  const scene = { id: "scene-fire", tiles: [] as any[], grid: { size: 100 } };
  const grid = {
    size: 100,
    isSquare: options.square ?? true,
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
  const textureOptions: any[] = [];
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
      Texture: { from: (video: FakeVideo, options: any) => {textureOptions.push(options);return new FakeTexture(video);} },
      Ticker: { shared: ticker },
    },
    document: new FakeDocument(options.mediaReady),
    console: { error: (message: string) => errors.push(message) },
  };
  Object.defineProperty(globalThis, "CONST", {
    configurable: true,
    value: { GRID_TYPES: { SQUARE: 1 } },
  });
  return { root, scene, ticker, primary, errors, textureOptions };
};

const fireTile = (scene: any, cellKey: string, offset: { i: number; j: number }) => ({
  parent: scene,
  flags: {
    "fvtt-battlefield-painter": {
      bundleId: `bundle-${cellKey}`,
      configurationId: "fire",
      stageIndex: 0,
      visualEffect: "fire-field-v1",
      role: "terrain-tile",
      cellKey,
      offset,
    },
  },
});

describe("fire effect lifecycle", () => {
  test("waits for decoded dimensions before playback and ignores duplicate readiness events", () => {
    const runtime=runtimeRoot({mediaReady:false});
    runtime.scene.tiles.push(fireTile(runtime.scene, "0:0", {i:0,j:0}));
    const renderer=new FireEffectRenderer(runtime.root);
    renderer.onCanvasReady();
    expect(renderer.auditEffects().atlasLoaded).toBeFalse();
    for(const video of runtime.root.document.body.children){
      expect(video.playCount).toBe(0);
      video.emit("loadeddata");
      expect(video.playCount).toBe(0);
      video.readyState=3;video.videoWidth=768;
      video.emit("canplay");
      expect(video.playCount).toBe(0);
      video.videoHeight=768;
      video.emit("loadeddata");video.emit("canplay");
      expect(video.playCount).toBe(1);
      expect(video.loadCount).toBe(0);
    }
    expect(renderer.auditEffects().atlasLoaded).toBeTrue();
    renderer.onCanvasTearDown();
  });
  test("keeps Pixi autoplay disabled and starts each ready video without reloading it", () => {
    const runtime = runtimeRoot();
    runtime.scene.tiles.push(fireTile(runtime.scene, "0:0", {i:0,j:0}));
    const renderer = new FireEffectRenderer(runtime.root);
    renderer.onCanvasReady();
    expect(runtime.textureOptions).toEqual([{resourceOptions:{autoPlay:false,updateFPS:24}},{resourceOptions:{autoPlay:false,updateFPS:24}}]);
    for (const video of runtime.root.document.body.children) {
      expect(video.autoplay).toBeFalse();
      expect(video.loadCount).toBe(0);
      expect(video.playCount).toBe(1);
      video.emit("loadeddata");
      video.emit("canplay");
      expect(video.playCount).toBe(1);
    }
    renderer.onCanvasTearDown();
  });
  test("does not load videos for native fire and releases them after the last legacy Tile is erased", async () => {
    const runtime = runtimeRoot();
    const native = fireTile(runtime.scene, "0:0", {i:0,j:0});
    native.flags['fvtt-battlefield-painter'].visualEffect = "fire-static-v2";
    runtime.scene.tiles.push(native);
    const renderer = new FireEffectRenderer(runtime.root);
    renderer.onCanvasReady();
    expect(runtime.root.document.body.children).toHaveLength(0);
    expect(renderer.auditEffects()).toMatchObject({fireCells:0,meshCount:0,atlasLoaded:false});
    const legacy = fireTile(runtime.scene,"0:1",{i:0,j:1});
    runtime.scene.tiles.push(legacy);
    renderer.onTileDocumentEvent(legacy);
    await Promise.resolve();
    expect(runtime.root.document.body.children).toHaveLength(2);
    runtime.scene.tiles.pop();
    renderer.onTileDocumentEvent(legacy);
    await Promise.resolve();
    expect(runtime.root.document.body.children).toHaveLength(0);
    expect(renderer.auditEffects()).toMatchObject({fireCells:0,meshCount:0,atlasLoaded:false});
    renderer.onCanvasTearDown();
  });
  test("uses ticker elapsed time when PIXI supplies its numeric callback argument", () => {
    const runtime = runtimeRoot();
    runtime.scene.tiles.push(fireTile(runtime.scene, "0:0", {i:0,j:0}));
    const renderer = new FireEffectRenderer(runtime.root);
    renderer.onCanvasReady();
    runtime.ticker.deltaMS = 500;
    for (const callback of runtime.ticker.callbacks) (callback as any)(2);
    expect(runtime.root.document.body.children.map(video => video.currentTime)).toEqual([0.5, 0.5]);
    renderer.onCanvasTearDown();
  });

  test("waits for canplay before starting cold videos and ignores readiness after teardown", () => {
    const runtime = runtimeRoot();
    runtime.scene.tiles.push(fireTile(runtime.scene, "0:0", {i:0,j:0}));
    const videos: FakeVideo[] = [];
    runtime.root.document.createElement = () => {
      const video = new FakeVideo();
      video.readyState = 0;
      videos.push(video);
      return video;
    };
    const textureOptions: unknown[] = [];
    runtime.root.PIXI.Texture.from = (video: FakeVideo, options?: unknown) => {
      textureOptions.push(options);
      return new FakeTexture(video);
    };
    const renderer = new FireEffectRenderer(runtime.root);
    renderer.onCanvasReady();
    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video.autoplay).toBe(false);
      expect(video.playCount).toBe(0);
      video.readyState = 2;
      video.emit("loadeddata");
      expect(video.playCount).toBe(0);
      video.readyState = 3;
      video.emit("canplay");
      video.emit("canplay");
      expect(video.playCount).toBe(1);
    }
    expect(textureOptions).toEqual([
      { resourceOptions: { autoPlay: false, updateFPS: 24 } },
      { resourceOptions: { autoPlay: false, updateFPS: 24 } },
    ]);
    renderer.onCanvasTearDown();
    for (const video of videos) {
      video.emit("canplay");
      expect(video.playCount).toBe(1);
    }
  });

  test("mounts one mesh, debounces Tile events, and tears down cleanly", async () => {
    const runtime = runtimeRoot();
    runtime.scene.tiles.push(fireTile(runtime.scene, "0:0", { i: 0, j: 0 }));
    const renderer = new FireEffectRenderer(runtime.root);

    renderer.onCanvasReady();
    expect(renderer.auditEffects()).toMatchObject({
      mounted: true,
      available: true,
      sceneId: "scene-fire",
      fireCells: 1,
      meshCount: 1,
      vertices: 16,
      triangles: 8,
      tickerAttached: true,
      rebuildCount: 1,
      lastError: null,
      renderer: "video-flipbook-fire-field-v1",
      atlasLoaded: true,
      atlasFrames: 96,
      atlasVariants: 4,
      emitters: 4,
    });
    expect(runtime.primary.children[0]).toMatchObject({
      eventMode: "none",
      interactive: false,
      interactiveChildren: false,
    });
    expect((runtime.primary.children[0] as FakeContainer).children[0]).toMatchObject({
      start: 0,
      size: 24,
      eventMode: "none",
      interactive: false,
      interactiveChildren: false,
    });
    const mountedMesh = (runtime.primary.children[0] as FakeContainer)
      .children[0] as FakeMesh;
    expect((mountedMesh.shader.uniforms.uStageITexture as FakeTexture).video.src).toContain(
      "fire-stage-i.webm",
    );
    expect((mountedMesh.shader.uniforms.uStageIITexture as FakeTexture).video.src).toContain(
      "fire-stage-ii.webm",
    );
    expect(runtime.root.document.body.children).toHaveLength(2);

    runtime.scene.tiles.push(fireTile(runtime.scene, "1:0", { i: 1, j: 0 }));
    renderer.onTileDocumentEvent(runtime.scene.tiles[1]);
    renderer.onTileDocumentEvent(runtime.scene.tiles[1]);
    await Promise.resolve();
    expect(renderer.auditEffects()).toMatchObject({
      fireCells: 2,
      meshCount: 1,
      vertices: 48,
      triangles: 24,
      emitters: 8,
      rebuildCount: 2,
    });

    runtime.ticker.tick();
    renderer.onCanvasReady();
    expect(runtime.primary.children).toHaveLength(1);
    expect(runtime.ticker.callbacks).toHaveLength(1);
    expect(runtime.ticker.removeCount).toBe(1);

    runtime.scene.tiles.push(fireTile(runtime.scene, "2:0", { i: 2, j: 0 }));
    renderer.onTileDocumentEvent(runtime.scene.tiles[2]);
    renderer.onCanvasTearDown();
    renderer.onCanvasReady();
    await Promise.resolve();
    expect(renderer.auditEffects()).toMatchObject({
      fireCells: 3,
      meshCount: 1,
      rebuildCount: 1,
    });

    renderer.onCanvasTearDown();
    expect(renderer.auditEffects()).toMatchObject({
      mounted: false,
      available: false,
      sceneId: null,
      fireCells: 0,
      meshCount: 0,
      vertices: 0,
      triangles: 0,
      tickerAttached: false,
      rebuildCount: 0,
      lastError: null,
    });
    expect(runtime.root.document.body.children).toHaveLength(0);
  });

  test("fails closed for non-square grids and missing Foundry exports", () => {
    const nonSquare = runtimeRoot({ square: false });
    const renderer = new FireEffectRenderer(nonSquare.root);
    renderer.onCanvasReady();
    expect(renderer.auditEffects()).toMatchObject({
      mounted: false,
      available: false,
      lastError: expect.stringContaining("Square"),
    });
    expect(nonSquare.primary.children).toHaveLength(0);

    const missing = runtimeRoot();
    delete (missing.root.foundry.canvas.primary as any).PrimaryCanvasContainer;
    const missingRenderer = new FireEffectRenderer(missing.root);
    expect(() => missingRenderer.onCanvasReady()).not.toThrow();
    expect(missingRenderer.auditEffects()).toMatchObject({
      mounted: false,
      available: false,
      lastError: expect.stringContaining("PrimaryCanvasContainer"),
    });
  });
});
