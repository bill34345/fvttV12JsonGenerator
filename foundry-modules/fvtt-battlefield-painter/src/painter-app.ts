import { TERRAIN_CONFIGURATIONS, type TerrainConfigurationId } from "./catalog";
import { MODULE_ID } from "./constants";
import type { BrushShape } from "./brush-engine";
import { PainterController, type PainterMode } from "./painter-controller";

export const createPainterApplicationClass = (
  controller: PainterController,
): any => {
  const api = (globalThis as any).foundry?.applications?.api;
  const ApplicationV2 = api?.ApplicationV2;
  const HandlebarsApplicationMixin = api?.HandlebarsApplicationMixin;
  if (!ApplicationV2 || typeof HandlebarsApplicationMixin !== "function") {
    throw new Error(
      "Foundry 14 ApplicationV2 and HandlebarsApplicationMixin are unavailable",
    );
  }

  return class BattlefieldPainterApplication extends HandlebarsApplicationMixin(
    ApplicationV2,
  ) {
    static DEFAULT_OPTIONS = {
      id: "fvtt-battlefield-painter-controls",
      window: {
        title: "Battlefield Painter · 战场地形画笔",
        icon: "fa-solid fa-fire-flame-curved",
        contentClasses: ["battlefield-painter-window"],
      },
      position: { width: 430, height: "auto" },
      actions: {
        selectTerrain: this.selectTerrain,
        selectStage: this.selectStage,
        selectMode: this.selectMode,
        selectBrushShape: this.selectBrushShape,
        setBrushRadius: this.setBrushRadius,
        undo: this.undo,
        redo: this.redo,
        togglePainter: this.togglePainter,
      },
    };

    static PARTS = {
      main: { template: `modules/${MODULE_ID}/templates/painter.hbs` },
    };

    #unsubscribe?: () => void;

    constructor(...args: unknown[]) {
      super(...args);
      this.#unsubscribe = controller.subscribe(() => {
        if (this.rendered) void this.render({ force: true });
      });
    }

    async close(...args: unknown[]) {
      this.#unsubscribe?.();
      this.#unsubscribe = undefined;
      return super.close(...args);
    }

    async _prepareContext() {
      const state = controller.state;
      return {
        state,
        isPaint: state.mode === "paint",
        isErase: state.mode === "erase",
        isAdvance: state.mode === "advance",
        isFree: state.brushShape === "free",
        isLine: state.brushShape === "line",
        isFill: state.brushShape === "fill",
        radii: Array.from({ length: 5 }, (_, value) => ({
          value,
          selected: value === state.brushRadius,
        })),
        terrains: Object.values(TERRAIN_CONFIGURATIONS).map((configuration) => ({
          ...configuration,
          selected: configuration.id === state.configurationId,
          preview: configuration.stages[state.stageIndex]?.texture,
        })),
        stages: TERRAIN_CONFIGURATIONS[state.configurationId].stages.map(
          (stage, index) => ({ ...stage, index, selected: index === state.stageIndex }),
        ),
      };
    }

    static async selectTerrain(this: any, _event: unknown, target: HTMLElement) {
      controller.selectConfiguration(
        target.dataset.terrain as TerrainConfigurationId,
      );
      await this.render({ force: true });
    }

    static async selectStage(this: any, _event: unknown, target: HTMLElement) {
      controller.selectStage(Number(target.dataset.stage));
      await this.render({ force: true });
    }

    static async selectMode(this: any, _event: unknown, target: HTMLElement) {
      controller.selectMode(target.dataset.mode as PainterMode);
      await this.render({ force: true });
    }

    static async selectBrushShape(
      this: any,
      _event: unknown,
      target: HTMLElement,
    ) {
      controller.selectBrushShape(target.dataset.shape as BrushShape);
      await this.render({ force: true });
    }

    static async setBrushRadius(this: any, _event: unknown, target: HTMLElement) {
      controller.setBrushRadius(Number(target.dataset.radius));
      await this.render({ force: true });
    }

    static async undo(this: any) {
      await controller.undo();
      await this.render({ force: true });
    }

    static async redo(this: any) {
      await controller.redo();
      await this.render({ force: true });
    }

    static async togglePainter(this: any) {
      controller.toggle();
      await this.render({ force: true });
    }
  };
};
