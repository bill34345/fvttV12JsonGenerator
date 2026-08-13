import { MODULE_ID } from "./constants";
import { createPainterApplicationClass } from "./painter-app";
import { PainterController } from "./painter-controller";
import { addPainterSceneControl } from "./scene-controls";

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
}

interface FoundryHooksLike {
  once(event: string, callback: () => void): unknown;
  on(event: string, callback: (...args: any[]) => void): unknown;
}

interface RuntimeRoot {
  Hooks?: FoundryHooksLike;
  game?: any;
  console?: Pick<Console, "error">;
}

export interface RegisterRuntimeOptions {
  root?: RuntimeRoot;
  createController?: () => RuntimeController;
  createApplicationClass?: (controller: RuntimeController) => new () => {
    render(options?: Record<string, unknown>): unknown;
  };
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
  const diagnostics: CompatibilityDiagnostic[] = [];
  if (!foundry || !dnd5e) {
    diagnostics.push({
      code: "MISSING_RUNTIME_VERSION",
      blocking: true,
      message: "Foundry or dnd5e runtime version is unavailable",
    });
  } else {
    if (foundry !== "14.364") {
      diagnostics.push({
        code: "UNSUPPORTED_FOUNDRY_VERSION",
        blocking: true,
        message: `Battlefield Painter alpha requires Foundry 14.364; received ${foundry}`,
      });
    }
    if (dnd5e !== "5.3.3") {
      diagnostics.push({
        code: "UNSUPPORTED_DND5E_VERSION",
        blocking: true,
        message: `Battlefield Painter alpha requires dnd5e 5.3.3; received ${dnd5e}`,
      });
    }
  }

  return diagnostics.length
    ? { supported: false, diagnostics }
    : { supported: true, diagnostics: [] };
};

export const registerBattlefieldPainterRuntime = ({
  root = globalThis as RuntimeRoot,
  createController = () => new PainterController(),
  createApplicationClass = (controller) =>
    createPainterApplicationClass(controller as PainterController),
}: RegisterRuntimeOptions = {}): boolean => {
  const hooks = root.Hooks;
  if (!hooks?.once || !hooks?.on) {
    root.console?.error?.(
      `[${MODULE_ID}] Foundry Hooks API is unavailable; runtime was not registered`,
    );
    return false;
  }

  const controller = createController();
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
    };
    module.api = diagnosticApi.canMutate
      ? {
          ...diagnosticApi,
          open: openPainter,
          activate: () => controller.activate(),
          deactivate: () => controller.deactivate(),
        }
      : diagnosticApi;
  });

  hooks.on("canvasTearDown", () => controller.deactivate());
  return true;
};

