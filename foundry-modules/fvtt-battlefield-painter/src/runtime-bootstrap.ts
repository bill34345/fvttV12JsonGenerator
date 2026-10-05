import { MODULE_ID } from "./constants";
import {
  DEVELOPMENT_PHASE_CONTROLS_MUTABLE,
  type DevelopmentPhase,
  type DevelopmentPhaseSnapshot,
} from "./development-phases";
import { createPainterApplicationClass } from "./painter-app";
import { PainterController } from "./painter-controller";
import { addPainterSceneControl } from "./scene-controls";
import {
  FireEffectRenderer,
  type FireEffectDiagnostics,
} from "./fire-effect-renderer";
import {
  FrostEffectRenderer,
  type FrostEffectDiagnostics,
} from "./frost-effect-renderer";
import { auditNativeBrambles } from "./bramble-static";
import { SpiderwebSheet } from "./spiderweb-sheet";
import { AcidMotion, FLOODING_MOTION_PROFILE, LAVA_MOTION_PROFILE } from "./acid-motion";

export type CompatibilityDiagnosticCode =
  | "MISSING_RUNTIME_VERSION"
  | "UNSUPPORTED_FOUNDRY_VERSION"
  | "UNSUPPORTED_DND5E_VERSION";

export interface CompatibilityDiagnostic {
  code: CompatibilityDiagnosticCode;
  blocking: true;
  message: string;
}

export type RuntimeCompatibility =
  | { supported: true; diagnostics: [] }
  | { supported: false; diagnostics: CompatibilityDiagnostic[] };

export interface RuntimeVersions {
  foundry: string;
  dnd5e: string;
}

interface RuntimeController {
  activate(): void;
  deactivate(): void;
  readonly state: unknown;
  auditScene(): Record<string, number>;
  developmentPhases(): DevelopmentPhaseSnapshot;
  setDevelopmentPhase(
    phase: DevelopmentPhase,
    enabled: boolean,
  ): DevelopmentPhaseSnapshot;
  warnLegacySoundsOnce?(): void;
  paintSelectedRegions?(): Promise<void>;
}

interface FireEffectRuntime {
  onCanvasReady(): void;
  onCanvasTearDown(): void;
  onTileDocumentEvent(document: unknown): void;
  auditEffects(): FireEffectDiagnostics;
}

interface FrostEffectRuntime {
  onCanvasReady(): void;
  onCanvasTearDown(): void;
  onTileDocumentEvent(document: unknown): void;
  auditFrostEffects(): FrostEffectDiagnostics;
}

interface FoundryHooksLike {
  once(event: string, callback: () => void): unknown;
  on(event: string, callback: (...args: any[]) => void): unknown;
}

interface RuntimeRoot {
  Hooks?: FoundryHooksLike;
  game?: any;
  canvas?: any;
  foundry?: any;
  PIXI?: any;
  console?: Pick<Console, "error">;
}

export interface RegisterRuntimeOptions {
  root?: RuntimeRoot;
  developmentPhaseControlsMutable?: boolean;
  createController?: () => RuntimeController;
  createApplicationClass?: (controller: RuntimeController) => new () => {
    render(options?: Record<string, unknown>): unknown;
  };
  createFireEffectRenderer?: (root: RuntimeRoot) => FireEffectRuntime;
  createFrostEffectRenderer?: (root: RuntimeRoot) => FrostEffectRuntime;
}

const runtimeVersions = (root: RuntimeRoot): RuntimeVersions => ({
  foundry: String(root.game?.version ?? ""),
  dnd5e:
    root.game?.system?.id === "dnd5e"
      ? String(root.game?.system?.version ?? "")
      : "",
});

export const evaluateRuntimeCompatibility = ({
  foundry,
  dnd5e,
}: RuntimeVersions): RuntimeCompatibility => {
  const supportedPairs = [
    { foundry: "14.364", dnd5e: "5.3.3" },
    { foundry: "14.368", dnd5e: "5.3.3" },
    { foundry: "14.368", dnd5e: "6.0.2" },
    { foundry: "14.368", dnd5e: "6.0.5" },
  ] as const;
  const diagnostics: CompatibilityDiagnostic[] = [];
  if (!foundry || !dnd5e) {
    diagnostics.push({
      code: "MISSING_RUNTIME_VERSION",
      blocking: true,
      message: "Foundry or dnd5e runtime version is unavailable",
    });
  } else {
    const foundryPairs = supportedPairs.filter((pair) => pair.foundry === foundry);
    if (foundryPairs.length === 0) {
      diagnostics.push({
        code: "UNSUPPORTED_FOUNDRY_VERSION",
        blocking: true,
        message: `Battlefield Painter alpha requires Foundry 14.364 or 14.368; received ${foundry}`,
      });
    } else if (!foundryPairs.some((pair) => pair.dnd5e === dnd5e)) {
      diagnostics.push({
        code: "UNSUPPORTED_DND5E_VERSION",
        blocking: true,
        message: `Battlefield Painter alpha requires Foundry 14.364/dnd5e 5.3.3 or Foundry 14.368/dnd5e 5.3.3, 6.0.2 or 6.0.5; received ${foundry}/dnd5e ${dnd5e}`,
      });
    }
  }

  return diagnostics.length
    ? { supported: false, diagnostics }
    : { supported: true, diagnostics: [] };
};

export const registerBattlefieldPainterRuntime = ({
  root = globalThis as RuntimeRoot,
  developmentPhaseControlsMutable = DEVELOPMENT_PHASE_CONTROLS_MUTABLE,
  createController = () => new PainterController(),
  createApplicationClass = (controller) =>
    createPainterApplicationClass(controller as PainterController),
  createFireEffectRenderer = (runtimeRoot) =>
    new FireEffectRenderer(runtimeRoot),
  createFrostEffectRenderer = (runtimeRoot) =>
    new FrostEffectRenderer(runtimeRoot),
}: RegisterRuntimeOptions = {}): boolean => {
  const hooks = root.Hooks;
  if (!hooks?.once || !hooks?.on) {
    root.console?.error?.(
      `[${MODULE_ID}] Foundry Hooks API is unavailable; runtime was not registered`,
    );
    return false;
  }

  const controller = createController();
  const fireEffects = createFireEffectRenderer(root);
  const frostEffects = createFrostEffectRenderer(root);
  const acidMotion = new AcidMotion(root);
  const spiderwebSheet = new SpiderwebSheet(root);
  const floodingMotion = new AcidMotion(root, FLOODING_MOTION_PROFILE);
  const lavaMotion = new AcidMotion(root, LAVA_MOTION_PROFILE);
  let painterApplication:
    | { render(options?: Record<string, unknown>): unknown }
    | undefined;
  let compatibility: RuntimeCompatibility = {
    supported: false,
    diagnostics: [
      {
        code: "MISSING_RUNTIME_VERSION",
        blocking: true,
        message: "Runtime compatibility has not been evaluated",
      },
    ],
  };

  const refreshCompatibility = (): RuntimeCompatibility => {
    compatibility = evaluateRuntimeCompatibility(runtimeVersions(root));
    return compatibility;
  };

  const openPainter = (): void => {
    if (!refreshCompatibility().supported) return;
    painterApplication ??= new (createApplicationClass(controller))();
    painterApplication.render({ force: true });
  };

  hooks.once("init", () => {
    refreshCompatibility();
    root.game?.keybindings?.register(MODULE_ID, "paintRegions", {
      name: "在选中区域铺设地形", hint: "使用画笔当前地形、阶段与颜色，按格心落在区域内的位置铺设。",
      restricted: true, editable: [{ key: "KeyP", modifiers: ["SHIFT"] }],
      onDown: () => { if (!refreshCompatibility().supported) return false; void controller.paintSelectedRegions?.(); return true; },
    });
    hooks.on("getSceneControlButtons", (controls: unknown) => {
      const supported = refreshCompatibility().supported;
      addPainterSceneControl(
        controls as Parameters<typeof addPainterSceneControl>[0],
        supported && root.game?.user?.isGM === true,
        openPainter,
      );
    });
  });

  hooks.once("ready", () => {
    const evaluated = refreshCompatibility();
    const module = root.game?.modules?.get?.(MODULE_ID);
    if (!module) return;

    const diagnosticApi = {
      compatibility: evaluated,
      canMutate: evaluated.supported && root.game?.user?.isGM === true,
      getState: () => ({ ...(controller.state as Record<string, unknown>) }),
      auditScene: () => controller.auditScene(),
      auditEffects: () => fireEffects.auditEffects(),
      auditFrostEffects: () => frostEffects.auditFrostEffects(),
      auditBrambleEffects: () => auditNativeBrambles(root),
      auditAcidMotion: () => acidMotion.audit(),
      auditSpiderwebSheet: () => spiderwebSheet.audit("spiderweb"),
      auditTerrainSheets: () => spiderwebSheet.audit(),
      auditFloodingMotion: () => floodingMotion.audit(),
      auditLavaMotion: () => lavaMotion.audit(),
      developmentPhases: () => controller.developmentPhases(),
    };
    module.api = diagnosticApi.canMutate
      ? {
          ...diagnosticApi,
          open: openPainter,
          activate: () => controller.activate(),
          deactivate: () => controller.deactivate(),
          ...(developmentPhaseControlsMutable
            ? {
                setDevelopmentPhase: (
                  phase: DevelopmentPhase,
                  enabled: boolean,
                ) => controller.setDevelopmentPhase(phase, enabled),
              }
            : {}),
        }
      : diagnosticApi;
  });

  hooks.on("canvasTearDown", () => {
    controller.deactivate();
    fireEffects.onCanvasTearDown();
    frostEffects.onCanvasTearDown();
    acidMotion.onCanvasTearDown();
    spiderwebSheet.onCanvasTearDown();
    floodingMotion.onCanvasTearDown();
    lavaMotion.onCanvasTearDown();
  });
  hooks.on("canvasReady", () => {
    const evaluated = refreshCompatibility();
    if (evaluated.supported) {
      fireEffects.onCanvasReady();
      frostEffects.onCanvasReady();
      acidMotion.onCanvasReady();
      spiderwebSheet.onCanvasReady();
      floodingMotion.onCanvasReady();
      lavaMotion.onCanvasReady();
      controller.warnLegacySoundsOnce?.();
    } else {
      fireEffects.onCanvasTearDown();
      frostEffects.onCanvasTearDown();
      acidMotion.onCanvasTearDown();
      spiderwebSheet.onCanvasTearDown();
      floodingMotion.onCanvasTearDown();
      lavaMotion.onCanvasTearDown();
    }
  });
  const onTileDocumentEvent = (document: unknown): void => {
    fireEffects.onTileDocumentEvent(document);
    frostEffects.onTileDocumentEvent(document);
  };
  hooks.on("createTile", onTileDocumentEvent);
  hooks.on("updateTile", onTileDocumentEvent);
  hooks.on("deleteTile", onTileDocumentEvent);
  const onTileDrawn = (tile: unknown): void => {
    if (refreshCompatibility().supported) {
      acidMotion.onTileDrawn(tile);
      spiderwebSheet.onTileDrawn(tile);
      floodingMotion.onTileDrawn(tile);
      lavaMotion.onTileDrawn(tile);
    }
  };
  hooks.on("drawTile", onTileDrawn);
  hooks.on("refreshTile", onTileDrawn);
  hooks.on("destroyTile", (tile: unknown) => {
    acidMotion.onTileDestroyed(tile);
    spiderwebSheet.onTileDestroyed(tile);
    floodingMotion.onTileDestroyed(tile);
    lavaMotion.onTileDestroyed(tile);
  });
  return true;
};
