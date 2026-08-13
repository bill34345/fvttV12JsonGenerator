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
        togglePainter: expect.any(Function),
      },
    });
    expect(PainterApplication.PARTS.main.template).toBe(
      "modules/fvtt-battlefield-painter/templates/painter.hbs",
    );
    expect(context.terrains).toHaveLength(3);
    expect(context.stages).toHaveLength(2);

    await PainterApplication.selectTerrain.call(app, undefined, {
      dataset: { terrain: "frost" },
    });
    await PainterApplication.selectStage.call(app, undefined, {
      dataset: { stage: "1" },
    });
    await PainterApplication.selectMode.call(app, undefined, {
      dataset: { mode: "erase" },
    });
    expect(controller.state).toMatchObject({
      configurationId: "frost",
      stageIndex: 1,
      mode: "erase",
    });
    expect(app.renderCalls).toBe(6);
    await app.close();
  });
});

describe("canvas pointer lifecycle", () => {
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
      grid: {},
      app: { canvas: element },
    });

    const controller = new PainterController();
    controller.activate();

    expect(controller.state).toMatchObject({ active: true });
    expect(element.added).toEqual([
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
    ]);

    controller.deactivate();
    expect(controller.state).toMatchObject({ active: false });
    expect(element.removed).toEqual(element.added);
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

