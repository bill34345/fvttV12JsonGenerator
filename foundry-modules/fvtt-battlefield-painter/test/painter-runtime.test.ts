import { afterEach, describe, expect, test } from "bun:test";

import { createPainterApplicationClass } from "../src/painter-app";
import { PainterController } from "../src/painter-controller";

const previousGlobals = new Map<PropertyKey, PropertyDescriptor | undefined>();

const installGlobal = (key: PropertyKey, value: unknown): void => {
  if (!previousGlobals.has(key)) {
    previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
};

afterEach(() => {
  for (const [key, descriptor] of previousGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  previousGlobals.clear();
});

describe("ApplicationV2 painter", () => {
  test("builds the expected public ApplicationV2 subclass and action context", async () => {
    class ApplicationV2 {
      rendered = true;
      renderCalls = 0;
      async render() {
        this.renderCalls += 1;
        return this;
      }
      async close() {}
    }
    installGlobal("foundry", {
      applications: {
        api: {
          ApplicationV2,
          HandlebarsApplicationMixin: (Base: any) => class extends Base {},
        },
      },
    });

    const controller = new PainterController();
    const PainterApplication = createPainterApplicationClass(controller);
    const app = new PainterApplication();
    const context = await app._prepareContext();

    expect(app).toBeInstanceOf(ApplicationV2);
    expect(PainterApplication.DEFAULT_OPTIONS).toMatchObject({
      id: "fvtt-battlefield-painter-controls",
      window: { title: "Battlefield Painter · 战场地形画笔" },
      actions: {
        selectTerrain: expect.any(Function),
        selectStage: expect.any(Function),
        selectMode: expect.any(Function),
        selectBrushShape: expect.any(Function),
        setBrushRadius: expect.any(Function),
        undo: expect.any(Function),
        redo: expect.any(Function),
        clearLegacySounds: expect.any(Function),
        togglePainter: expect.any(Function),
      },
    });
    expect(PainterApplication.PARTS.main.template).toBe(
      "modules/fvtt-battlefield-painter/templates/painter.hbs",
    );
    expect(context.terrains).toHaveLength(3);
    expect(context.stages).toHaveLength(2);
    expect(new Set(context.stages.map((stage: any) => stage.texture))).toEqual(
      new Set(["modules/fvtt-battlefield-painter/assets/terrain/fire.webp"]),
    );

    await PainterApplication.selectTerrain.call(app, undefined, {
      dataset: { terrain: "frost" },
    });
    await PainterApplication.selectStage.call(app, undefined, {
      dataset: { stage: "1" },
    });
    await PainterApplication.selectMode.call(app, undefined, {
      dataset: { mode: "erase" },
    });
    await PainterApplication.selectBrushShape.call(app, undefined, {
      dataset: { shape: "line" },
    });
    await PainterApplication.setBrushRadius.call(app, undefined, {
      dataset: { radius: "2" },
    });
    expect(controller.state).toMatchObject({
      configurationId: "frost",
      stageIndex: 1,
      mode: "erase",
      brushShape: "line",
      brushRadius: 2,
    });
    expect(app.renderCalls).toBe(10);
    await app.close();
  });

  test("uses a Foundry DialogV2 confirmation for clear and renders after acceptance", async () => {
    let dialogOptions: any;
    class ApplicationV2 {
      renderCalls = 0;
      async render() {
        this.renderCalls += 1;
        return this;
      }
    }
    installGlobal("foundry", {
      applications: {
        api: {
          ApplicationV2,
          HandlebarsApplicationMixin: (Base: any) => class extends Base {},
          DialogV2: {
            wait: async (options: any) => {
              dialogOptions = options;
              return options.buttons[0].callback();
            },
          },
        },
      },
    });

    const clearResults: boolean[] = [];
    const fakeController = {
      subscribe: () => () => {},
      async clearAll(confirm: (preview: any) => Promise<boolean>) {
        clearResults.push(
          await confirm({
            counts: {
              totalDocuments: 18,
              bundles: 3,
              tiles: 9,
              regions: 3,
              lights: 1,
              sounds: 1,
              walls: 1,
            },
          }),
        );
        return true;
      },
    };
    const PainterApplication = createPainterApplicationClass(
      fakeController as any,
    );
    const app = new PainterApplication();

    await PainterApplication.clearScene.call(app);

    expect(dialogOptions.modal).toBe(true);
    expect(dialogOptions.rejectClose).toBe(false);
    expect(typeof dialogOptions.content).toBe("string");
    expect(dialogOptions.content.includes("18")).toBe(true);
    expect(dialogOptions.content.includes("Tiles: 9")).toBe(true);
    expect(dialogOptions.buttons.map(({ action }: any) => action)).toEqual([
      "clear",
      "cancel",
    ]);
    expect(clearResults).toEqual([true]);
    expect(app.renderCalls).toBe(1);
  });

  test("treats DialogV2 cancellation and close as a rejected clear", async () => {
    let dialogOptions: any;
    class ApplicationV2 {
      async render() {}
    }
    installGlobal("foundry", {
      applications: {
        api: {
          ApplicationV2,
          HandlebarsApplicationMixin: (Base: any) => class extends Base {},
          DialogV2: {
            wait: async (options: any) => {
              dialogOptions = options;
              return options.buttons[1].callback();
            },
          },
        },
      },
    });

    const clearResults: boolean[] = [];
    const fakeController = {
      subscribe: () => () => {},
      async clearAll(confirm: (preview: any) => Promise<boolean>) {
        clearResults.push(
          await confirm({
            counts: {
              totalDocuments: 1,
              bundles: 1,
              tiles: 1,
              regions: 0,
              lights: 0,
              sounds: 0,
              walls: 0,
            },
          }),
        );
        return false;
      },
    };
    const PainterApplication = createPainterApplicationClass(
      fakeController as any,
    );
    const app = new PainterApplication();

    await PainterApplication.clearScene.call(app);

    expect(dialogOptions.buttons[1].callback()).toBe(false);
    expect(clearResults).toEqual([false]);
  });

  test("uses DialogV2 confirmation for legacy sound cleanup", async () => {
    let dialogOptions: any;
    class ApplicationV2 {
      renderCalls = 0;
      async render() {
        this.renderCalls += 1;
      }
    }
    installGlobal("foundry", {
      applications: {
        api: {
          ApplicationV2,
          HandlebarsApplicationMixin: (Base: any) => class extends Base {},
          DialogV2: {
            wait: async (options: any) => {
              dialogOptions = options;
              return options.buttons[0].callback();
            },
          },
        },
      },
    });

    let result: boolean | undefined;
    const fakeController = {
      subscribe: () => () => {},
      async clearLegacySounds(confirm: (preview: any) => Promise<boolean>) {
        result = await confirm({
          soundIds: ["sound-owned-1"],
          fingerprint: "sound-owned-1",
          requiresConfirmation: true,
        });
        return result;
      },
    };
    const PainterApplication = createPainterApplicationClass(
      fakeController as any,
    );
    const app = new PainterApplication();

    await PainterApplication.clearLegacySounds.call(app);

    expect(dialogOptions.modal).toBe(true);
    expect(dialogOptions.content).toContain("sound-owned-1");
    expect(dialogOptions.buttons.map(({ action }: any) => action)).toEqual([
      "clearLegacySounds",
      "cancel",
    ]);
    expect(result).toBe(true);
    expect(app.renderCalls).toBe(1);
  });

  test("deactivates canvas input when the ApplicationV2 window closes", async () => {
    class ApplicationV2 {
      async close() {}
    }
    installGlobal("foundry", {
      applications: {
        api: {
          ApplicationV2,
          HandlebarsApplicationMixin: (Base: any) => class extends Base {},
        },
      },
    });

    let deactivateCalls = 0;
    const fakeController = {
      subscribe: () => () => {},
      deactivate: () => {
        deactivateCalls += 1;
      },
    };
    const PainterApplication = createPainterApplicationClass(
      fakeController as any,
    );
    const app = new PainterApplication();

    await app.close();

    expect(deactivateCalls).toBe(1);
  });
});

describe("canvas pointer lifecycle", () => {
  test("records clear in history before deleting module documents", async () => {
    const moduleId = "fvtt-battlefield-painter";
    const collections = {
      Tile: "tiles",
      Region: "regions",
      AmbientLight: "lights",
      AmbientSound: "sounds",
      Wall: "walls",
    } as const;
    const makeDocument = (id: string, role: string): any => {
      const document: any = {
        id,
        flags: {
          [moduleId]: {
            bundleId: "clear-history-bundle",
            configurationId: "fire",
            stageIndex: 0,
            role,
          },
        },
      };
      document.toObject = () => ({
        id: document.id,
        flags: structuredClone(document.flags),
      });
      return document;
    };
    const scene: any = {
      tiles: [makeDocument("tile-1", "terrain-tile")],
      regions: [makeDocument("region-1", "movement-region")],
      lights: [makeDocument("light-1", "terrain-light")],
      sounds: [makeDocument("sound-1", "terrain-sound")],
      walls: [],
      async deleteEmbeddedDocuments(
        documentName: keyof typeof collections,
        ids: string[],
      ) {
        const collection = collections[documentName];
        scene[collection] = scene[collection].filter(
          (document: any) => !ids.includes(document.id),
        );
      },
      async createEmbeddedDocuments(
        documentName: keyof typeof collections,
        sources: Array<Record<string, unknown>>,
      ) {
        const collection = collections[documentName];
        const created = sources.map((source, index) => {
          const document: any = {
            id: `${documentName}-restored-${index}`,
            ...structuredClone(source),
          };
          document.toObject = () => ({
            id: document.id,
            flags: structuredClone(document.flags),
          });
          scene[collection].push(document);
          return document;
        });
        return created;
      },
    };
    installGlobal("CONFIG", {
      RegionBehavior: {
        dataModels: {
          modifyMovementCost: class {},
        },
      },
      Token: { movement: { actions: { walk: {} } } },
    });
    installGlobal("canvas", { scene, grid: {} });

    const controller = new PainterController();
    expect(await controller.clearAll(async () => true)).toBe(true);
    expect(controller.state.canUndo).toBe(true);
    expect(scene.tiles).toHaveLength(0);
    expect(scene.regions).toHaveLength(0);
    expect(scene.lights).toHaveLength(0);
    expect(scene.sounds).toHaveLength(0);

    await controller.undo();
    expect(controller.state.canUndo).toBe(false);
    expect(controller.state.canRedo).toBe(true);
    expect(scene.tiles).toHaveLength(1);
    expect(scene.regions).toHaveLength(1);

    await controller.redo();
    expect(controller.state.canUndo).toBe(true);
    expect(controller.state.canRedo).toBe(false);
    expect(scene.tiles).toHaveLength(0);
    expect(scene.regions).toHaveLength(0);
  });

  test("keeps P1 controls internal and can fall back to P0 behavior", () => {
    const controller = new PainterController();
    controller.selectBrushShape("fill");
    controller.setBrushRadius(3);
    expect(controller.state).toMatchObject({
      p0Enabled: true,
      p1Enabled: true,
      brushShape: "fill",
      brushRadius: 3,
    });

    controller.setDevelopmentPhase("p1", false);
    expect(controller.state).toMatchObject({
      p1Enabled: false,
      brushShape: "free",
      brushRadius: 0,
      canUndo: false,
      canRedo: false,
    });

    controller.setDevelopmentPhase("p2", false);
    controller.setDevelopmentPhase("p0", false);
    expect(controller.state.p0Enabled).toBe(false);
  });

  test("cleans only owned legacy sounds without adding history", async () => {
    const owned = (id: string) => ({
      id,
      flags: {
        "fvtt-battlefield-painter": {
          bundleId: `bundle-${id}`,
          configurationId: "fire",
          stageIndex: 0,
          role: "terrain-sound",
        },
      },
    });
    const foreign = { id: "foreign", flags: { other: {} } };
    const scene: any = {
      sounds: [owned("sound-1"), foreign],
      async deleteEmbeddedDocuments(_name: string, ids: string[]) {
        scene.sounds = scene.sounds.filter(({ id }: any) => !ids.includes(id));
      },
    };
    installGlobal("game", { user: { isGM: true } });
    installGlobal("canvas", { scene });

    const controller = new PainterController();
    expect(await controller.clearLegacySounds(async () => true)).toBe(true);
    expect(scene.sounds.map(({ id }: any) => id)).toEqual(["foreign"]);
    expect(controller.state.canUndo).toBe(false);
  });

  test("keeps a confirmed legacy preview immutable during cleanup", async () => {
    const owned = (id: string) => ({
      id,
      flags: {
        "fvtt-battlefield-painter": {
          bundleId: `bundle-${id}`,
          configurationId: "fire",
          stageIndex: 0,
          role: "terrain-sound",
        },
      },
    });
    const scene: any = {
      sounds: [owned("sound-1"), { id: "foreign", flags: { other: {} } }],
      async deleteEmbeddedDocuments(_name: string, ids: string[]) {
        scene.sounds = scene.sounds.filter(({ id }: any) => !ids.includes(id));
      },
    };
    let mutationRejected = false;
    installGlobal("game", { user: { isGM: true } });
    installGlobal("canvas", { scene });

    const controller = new PainterController();
    expect(
      await controller.clearLegacySounds(async (preview) => {
        try {
          (preview as unknown as { fingerprint: string }).fingerprint = "forged";
        } catch {
          mutationRejected = true;
        }
        return true;
      }),
    ).toBe(true);

    expect(mutationRejected).toBe(true);
    expect(scene.sounds.map(({ id }: any) => id)).toEqual(["foreign"]);
  });

  test("rejects a stale legacy-sound cleanup confirmation", async () => {
    const owned = (id: string) => ({
      id,
      flags: {
        "fvtt-battlefield-painter": {
          bundleId: `bundle-${id}`,
          configurationId: "fire",
          stageIndex: 0,
          role: "terrain-sound",
        },
      },
    });
    const warnings: string[] = [];
    const scene: any = {
      sounds: [owned("sound-1")],
      async deleteEmbeddedDocuments() {
        throw new Error("stale cleanup must not delete");
      },
    };
    installGlobal("game", { user: { isGM: true } });
    installGlobal("canvas", { scene });
    installGlobal("ui", {
      notifications: { warn: (message: string) => warnings.push(message) },
    });

    const controller = new PainterController();
    expect(
      await controller.clearLegacySounds(async () => {
        scene.sounds.push(owned("sound-2"));
        return true;
      }),
    ).toBe(false);
    expect(warnings).toEqual(["旧声音清理确认已过期，请重新预览。"]);
  });

  test("warns a GM once per scene and owned-sound fingerprint", () => {
    const owned = (id: string) => ({
      id,
      flags: {
        "fvtt-battlefield-painter": {
          bundleId: `bundle-${id}`,
          configurationId: "fire",
          stageIndex: 0,
          role: "terrain-sound",
        },
      },
    });
    const foreign = { id: "foreign", flags: { other: {} } };
    const warnings: string[] = [];
    const scene: any = {
      id: "scene-legacy",
      sounds: [owned("sound-1"), foreign],
    };
    installGlobal("game", { user: { isGM: true } });
    installGlobal("canvas", { scene });
    installGlobal("ui", {
      notifications: { warn: (message: string) => warnings.push(message) },
    });

    const controller = new PainterController();
    controller.warnLegacySoundsOnce();
    controller.warnLegacySoundsOnce();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("1 个旧环境音");
    expect(warnings[0]).toContain("OGG");
    expect(warnings[0]).toContain("404");

    scene.sounds.push(owned("sound-2"));
    controller.warnLegacySoundsOnce();
    expect(warnings).toHaveLength(2);

    scene.sounds = [foreign];
    controller.warnLegacySoundsOnce();
    expect(warnings).toHaveLength(2);
    scene.sounds = [owned("sound-3"), foreign];
    controller.warnLegacySoundsOnce();
    expect(warnings).toHaveLength(3);

    installGlobal("canvas", {
      scene: { id: "foreign-only", sounds: [foreign] },
    });
    new PainterController().warnLegacySoundsOnce();
    expect(warnings).toHaveLength(3);

    installGlobal("game", { user: { isGM: false } });
    installGlobal("canvas", { scene });
    new PainterController().warnLegacySoundsOnce();
    expect(warnings).toHaveLength(3);
  });

  test("attaches pointer listeners only while the supported GM activates the painter", () => {
    class FakeCanvasElement {
      readonly added: string[] = [];
      readonly removed: string[] = [];
      addEventListener(type: string) {
        this.added.push(type);
      }
      removeEventListener(type: string) {
        this.removed.push(type);
      }
    }
    installGlobal("HTMLCanvasElement", FakeCanvasElement);
    installGlobal("game", { user: { isGM: true } });
    const element = new FakeCanvasElement();
    installGlobal("canvas", {
      ready: true,
      scene: {},
      interface: {
        grid: {
          addHighlightLayer() {},
          clearHighlightLayer() {},
          highlightPosition() {},
          destroyHighlightLayer() {},
        },
      },
      grid: { getTopLeftPoint: () => ({ x: 0, y: 0 }) },
      app: { canvas: element },
    });

    const controller = new PainterController();
    controller.activate();

    expect(controller.state).toMatchObject({ active: true });
    expect(element.added).toEqual([
      "pointerdown",
      "pointermove",
      "pointerleave",
      "pointerup",
      "pointercancel",
    ]);

    controller.deactivate();
    expect(controller.state).toMatchObject({ active: false });
    expect(element.removed).toEqual(element.added);
  });

  test("binds cursor preview to the active canvas instead of module init time", () => {
    const listeners = new Map<string, (event: any) => void>();
    class FakeCanvasElement {
      addEventListener(type: string, listener: (event: any) => void) {
        listeners.set(type, listener);
      }
      removeEventListener() {}
    }
    const highlightCalls: unknown[] = [];
    installGlobal("HTMLCanvasElement", FakeCanvasElement);
    installGlobal("game", { user: { isGM: true } });
    const element = new FakeCanvasElement();
    installGlobal("canvas", {
      ready: true,
      scene: {},
      interface: {
        grid: {
          addHighlightLayer: (name: string) => highlightCalls.push(["add", name]),
          clearHighlightLayer: (name: string) => highlightCalls.push(["clear", name]),
          highlightPosition: (name: string, position: unknown) =>
            highlightCalls.push(["highlight", name, position]),
          destroyHighlightLayer: (name: string) => highlightCalls.push(["destroy", name]),
        },
      },
      app: { canvas: element },
      canvasCoordinatesFromClient: () => ({ x: 10, y: 10 }),
      grid: {
        getTopLeftPoint: ({ i, j }: { i: number; j: number }) => ({
          x: j * 100,
          y: i * 100,
        }),
        getOffset: () => ({ i: 0, j: 0 }),
        getCenterPoint: () => ({ x: 50, y: 50 }),
        getVertices: () => [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        getAdjacentOffsets: () => [],
        getDirectPath: (offsets: unknown[]) => offsets,
      },
    });

    const controller = new PainterController();
    controller.activate();
    listeners.get("pointermove")?.({ pointerId: 7, clientX: 10, clientY: 10 });

    expect(highlightCalls).toContainEqual([
      "highlight",
      "fvtt-battlefield-painter.cursor-preview",
      { x: 0, y: 0, color: "#ff6a2a", border: "#ff6a2a", alpha: 0.22 },
    ]);
  });

  test("fails closed when an active preview render throws", () => {
    const listeners = new Map<string, (event: any) => void>();
    const added: string[] = [];
    const removed: string[] = [];
    class FakeCanvasElement {
      addEventListener(type: string, listener: (event: any) => void) {
        added.push(type);
        listeners.set(type, listener);
      }
      removeEventListener(type: string) {
        removed.push(type);
      }
    }
    const notifications: string[] = [];
    installGlobal("HTMLCanvasElement", FakeCanvasElement);
    installGlobal("game", { user: { isGM: true } });
    installGlobal("ui", {
      notifications: { error: (message: string) => notifications.push(message) },
    });
    const element = new FakeCanvasElement();
    installGlobal("canvas", {
      ready: true,
      scene: {},
      interface: {
        grid: {
          addHighlightLayer() {},
          clearHighlightLayer() {},
          highlightPosition() {
            throw new Error("highlight failed");
          },
          destroyHighlightLayer() {},
        },
      },
      app: { canvas: element },
      canvasCoordinatesFromClient: () => ({ x: 10, y: 10 }),
      grid: {
        getTopLeftPoint: () => ({ x: 0, y: 0 }),
        getOffset: () => ({ i: 0, j: 0 }),
        getCenterPoint: () => ({ x: 50, y: 50 }),
        getVertices: () => [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        getAdjacentOffsets: () => [],
        getDirectPath: (offsets: unknown[]) => offsets,
      },
    });

    const controller = new PainterController();
    controller.activate();
    const move = listeners.get("pointermove")!;
    move({ pointerId: 7, clientX: 10, clientY: 10 });
    move({ pointerId: 7, clientX: 10, clientY: 10 });

    expect(controller.state.active).toBe(false);
    expect(removed).toEqual(added);
    expect(notifications).toEqual([
      "Battlefield Painter：网格高亮渲染失败，已停用画笔以避免无预览绘制。",
    ]);
  });

  test("keeps P0-only pointer input free of preview highlights", () => {
    const listeners = new Map<string, (event: any) => void>();
    const highlights: string[] = [];
    class FakeCanvasElement {
      addEventListener(type: string, listener: (event: any) => void) {
        listeners.set(type, listener);
      }
      removeEventListener() {}
    }
    installGlobal("HTMLCanvasElement", FakeCanvasElement);
    installGlobal("game", { user: { isGM: true } });
    const element = new FakeCanvasElement();
    installGlobal("canvas", {
      ready: true,
      scene: {},
      interface: {
        grid: {
          addHighlightLayer() {},
          clearHighlightLayer() {},
          highlightPosition() {
            highlights.push("highlight");
          },
          destroyHighlightLayer() {},
        },
      },
      app: { canvas: element },
      canvasCoordinatesFromClient: () => ({ x: 10, y: 10 }),
      grid: {
        getTopLeftPoint: () => ({ x: 0, y: 0 }),
        getOffset: () => ({ i: 0, j: 0 }),
        getCenterPoint: () => ({ x: 50, y: 50 }),
        getVertices: () => [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        getAdjacentOffsets: () => [],
        getDirectPath: (offsets: unknown[]) => offsets,
      },
    });

    const controller = new PainterController();
    controller.setDevelopmentPhase("p1", false);
    controller.activate();
    listeners.get("pointermove")?.({ pointerId: 7, clientX: 10, clientY: 10 });

    expect(controller.state.active).toBe(true);
    expect(highlights).toEqual([]);
  });

  test("fails closed without the Foundry v14 grid highlight boundary", () => {
    const notifications: string[] = [];
    class FakeCanvasElement {
      addEventListener() {
        throw new Error("listeners must not be attached");
      }
      removeEventListener() {}
    }
    installGlobal("HTMLCanvasElement", FakeCanvasElement);
    installGlobal("game", { user: { isGM: true } });
    installGlobal("ui", {
      notifications: { error: (message: string) => notifications.push(message) },
    });
    const element = new FakeCanvasElement();
    installGlobal("canvas", {
      ready: true,
      scene: {},
      grid: { getTopLeftPoint: () => ({ x: 0, y: 0 }) },
      app: { canvas: element },
    });

    const controller = new PainterController();
    controller.activate();

    expect(controller.state.active).toBe(false);
    expect(notifications).toEqual([
      "Battlefield Painter：当前 Foundry 网格高亮接口不可用，已阻止启用画笔。",
    ]);
  });

  test("fails closed for a non-GM without attaching canvas listeners", () => {
    const notifications: string[] = [];
    installGlobal("game", { user: { isGM: false } });
    installGlobal("ui", {
      notifications: { error: (message: string) => notifications.push(message) },
    });
    installGlobal("canvas", { ready: true, scene: {}, grid: {} });

    const controller = new PainterController();
    controller.activate();

    expect(controller.state.active).toBe(false);
    expect(notifications).toEqual(["只有 GM 可以修改战场地形。"]);
  });
});
