import { afterEach, describe, expect, test } from "bun:test";
import { pathToFileURL } from "node:url";

import { buildModule } from "../scripts/build";
import {
  evaluateRuntimeCompatibility,
  registerBattlefieldPainterRuntime,
} from "../src/runtime-bootstrap";

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

describe("runtime compatibility", () => {
  test("accepts only exact Foundry 14.364 and dnd5e 5.3.3", () => {
    expect(
      evaluateRuntimeCompatibility({ foundry: "14.364", dnd5e: "5.3.3" }),
    ).toEqual({ supported: true, diagnostics: [] });
  });

  test("requires the dnd5e system even when another system has the same version", () => {
    const once = new Map<string, () => void>();
    const on = new Map<string, (...args: any[]) => void>();
    const module: Record<string, unknown> = {};
    const root = {
      Hooks: {
        once: (event: string, callback: () => void) => once.set(event, callback),
        on: (event: string, callback: (...args: any[]) => void) =>
          on.set(event, callback),
      },
      game: {
        version: "14.364",
        system: { id: "pf2e", version: "5.3.3" },
        user: { isGM: true },
        modules: { get: () => module },
      },
    };

    registerBattlefieldPainterRuntime({ root });
    once.get("ready")?.();

    expect(module.api).toMatchObject({
      canMutate: false,
      compatibility: {
        diagnostics: [{ code: "MISSING_RUNTIME_VERSION" }],
      },
    });
  });

  test.each([
    [{ foundry: "14.363", dnd5e: "5.3.3" }, "UNSUPPORTED_FOUNDRY_VERSION"],
    [{ foundry: "14.365", dnd5e: "5.3.3" }, "UNSUPPORTED_FOUNDRY_VERSION"],
    [{ foundry: "14.364", dnd5e: "5.3.2" }, "UNSUPPORTED_DND5E_VERSION"],
    [{ foundry: "14.364", dnd5e: "5.4.0" }, "UNSUPPORTED_DND5E_VERSION"],
    [{ foundry: "", dnd5e: "5.3.3" }, "MISSING_RUNTIME_VERSION"],
  ] as const)("fails closed for runtime %j", (versions, code) => {
    expect(evaluateRuntimeCompatibility(versions)).toMatchObject({
      supported: false,
      diagnostics: [{ code, blocking: true }],
    });
  });
});

describe("Foundry lifecycle bootstrap", () => {
  test("registers lifecycle hooks before game exists and exposes a supported GM API at ready", () => {
    const once = new Map<string, () => void>();
    const on = new Map<string, (...args: any[]) => void>();
    const module: Record<string, unknown> = {};
    const controls = { tiles: { tools: {} as Record<string, any> } };
    const opened: string[] = [];

    const root: Record<string, any> = {
      Hooks: {
        once: (event: string, callback: () => void) => once.set(event, callback),
        on: (event: string, callback: (...args: any[]) => void) =>
          on.set(event, callback),
      },
    };
    registerBattlefieldPainterRuntime({
      root,
      createController: () => ({
        activate: () => opened.push("activate"),
        deactivate: () => opened.push("deactivate"),
        get state() {
          return { active: false };
        },
        auditScene: () => ({ bundles: 0 }),
        developmentPhases: () => ({ p0: true, p1: true }),
        setDevelopmentPhase: () => ({ p0: true, p1: false }),
      }),
      createApplicationClass: () =>
        class FakeApplication {
          render() {
            opened.push("render");
          }
        },
    });

    expect([...once.keys()]).toEqual(["init", "ready"]);
    expect(on.has("canvasTearDown")).toBe(true);

    root.game = {
      version: "14.364",
      system: { id: "dnd5e", version: "5.3.3" },
      user: { isGM: true },
      modules: { get: () => module },
    };
    once.get("init")?.();
    on.get("getSceneControlButtons")?.(controls);
    expect(controls.tiles.tools["fvtt-battlefield-painter"]).toBeDefined();
    once.get("ready")?.();

    const api = module.api as Record<string, any>;
    expect(api.compatibility).toEqual({ supported: true, diagnostics: [] });
    expect(api.canMutate).toBe(true);
    expect(api.developmentPhases()).toEqual({ p0: true, p1: true });
    expect(api.setDevelopmentPhase("p1", false)).toEqual({
      p0: true,
      p1: false,
    });
    controls.tiles.tools["fvtt-battlefield-painter"].onChange();
    expect(opened).toContain("render");
  });

  test("does not expose controls or mutation methods on an unsupported runtime", () => {
    const once = new Map<string, () => void>();
    const on = new Map<string, (...args: any[]) => void>();
    const module: Record<string, unknown> = {};
    const controls = { tiles: { tools: {} as Record<string, any> } };
    const root = {
      Hooks: {
        once: (event: string, callback: () => void) => once.set(event, callback),
        on: (event: string, callback: (...args: any[]) => void) =>
          on.set(event, callback),
      },
      game: {
        version: "14.365",
        system: { id: "dnd5e", version: "5.3.3" },
        user: { isGM: true },
        modules: { get: () => module },
      },
    };

    registerBattlefieldPainterRuntime({ root });
    once.get("init")?.();
    on.get("getSceneControlButtons")?.(controls);
    once.get("ready")?.();

    expect(controls.tiles.tools).toEqual({});
    expect(module.api).toMatchObject({
      canMutate: false,
      compatibility: {
        supported: false,
        diagnostics: [{ code: "UNSUPPORTED_FOUNDRY_VERSION" }],
      },
    });
    expect((module.api as Record<string, unknown>).activate).toBeUndefined();
  });

  test("omits the internal phase setter when release controls are immutable", () => {
    const once = new Map<string, () => void>();
    const module: Record<string, unknown> = {};
    const root = {
      Hooks: {
        once: (event: string, callback: () => void) => once.set(event, callback),
        on: () => undefined,
      },
      game: {
        version: "14.364",
        system: { id: "dnd5e", version: "5.3.3" },
        user: { isGM: true },
        modules: { get: () => module },
      },
    };

    registerBattlefieldPainterRuntime({
      root,
      developmentPhaseControlsMutable: false,
      createController: () => ({
        activate() {},
        deactivate() {},
        state: { active: false },
        auditScene: () => ({ bundles: 0 }),
        developmentPhases: () => ({ p0: true, p1: true }),
        setDevelopmentPhase: () => ({ p0: true, p1: false }),
      }),
    });
    once.get("ready")?.();

    expect((module.api as Record<string, unknown>).developmentPhases).toEqual(
      expect.any(Function),
    );
    expect((module.api as Record<string, unknown>).setDevelopmentPhase).toBeUndefined();
  });

  test("keeps the diagnostic API read-only for a supported non-GM user", () => {
    const once = new Map<string, () => void>();
    const on = new Map<string, (...args: any[]) => void>();
    const module: Record<string, unknown> = {};
    const root = {
      Hooks: {
        once: (event: string, callback: () => void) => once.set(event, callback),
        on: (event: string, callback: (...args: any[]) => void) =>
          on.set(event, callback),
      },
      game: {
        version: "14.364",
        system: { id: "dnd5e", version: "5.3.3" },
        user: { isGM: false },
        modules: { get: () => module },
      },
    };

    registerBattlefieldPainterRuntime({ root });
    once.get("init")?.();
    const controls = { tiles: { tools: {} as Record<string, any> } };
    on.get("getSceneControlButtons")?.(controls);
    once.get("ready")?.();

    expect(controls.tiles.tools).toEqual({});
    expect(module.api).toMatchObject({
      canMutate: false,
      compatibility: { supported: true },
    });
    expect((module.api as Record<string, unknown>).open).toBeUndefined();
  });

  test("loads the built browser bundle in a Foundry-shaped global sandbox", async () => {
    await buildModule();
    class ApplicationV2 {
      rendered = false;
      render() {
        this.rendered = true;
        return this;
      }
      close() {}
    }
    const once = new Map<string, () => void>();
    const on = new Map<string, (...args: any[]) => void>();
    const module: Record<string, unknown> = {};

    installGlobal("Hooks", {
      once: (event: string, callback: () => void) => once.set(event, callback),
      on: (event: string, callback: (...args: any[]) => void) =>
        on.set(event, callback),
    });
    installGlobal("foundry", {
      applications: {
        api: {
          ApplicationV2,
          HandlebarsApplicationMixin: (Base: any) => class extends Base {},
        },
      },
    });
    installGlobal("game", {
      version: "14.364",
      system: { id: "dnd5e", version: "5.3.3" },
      user: { isGM: true },
      modules: { get: () => module },
    });

    const bundle = new URL(
      `../dist/module/scripts/main.js?runtime-smoke=${Date.now()}`,
      import.meta.url,
    );
    await import(pathToFileURL(bundle.pathname).href + bundle.search);

    expect([...once.keys()]).toEqual(["init", "ready"]);
    once.get("init")?.();
    const controls = { tiles: { tools: {} as Record<string, any> } };
    on.get("getSceneControlButtons")?.(controls);
    expect(controls.tiles.tools["fvtt-battlefield-painter"]).toBeDefined();
    once.get("ready")?.();
    expect(module.api).toMatchObject({ canMutate: true });
    expect(() =>
      controls.tiles.tools["fvtt-battlefield-painter"].onChange(),
    ).not.toThrow();
  });

  test("returns false instead of throwing when Foundry Hooks are absent", () => {
    const errors: unknown[][] = [];
    expect(
      registerBattlefieldPainterRuntime({
        root: { console: { error: (...args: unknown[]) => errors.push(args) } },
      }),
    ).toBe(false);
    expect(errors).toHaveLength(1);
  });
});
