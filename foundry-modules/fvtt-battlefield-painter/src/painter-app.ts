import { TERRAIN_CONFIGURATIONS, FIRE_STATIC_PROFILE, FROST_STATIC_PROFILE, BRAMBLE_STATIC_PROFILE, type TerrainConfigurationId } from "./catalog";
import { MODULE_ID } from "./constants";
import type { BrushShape } from "./brush-engine";
import { PainterController, type PainterMode } from "./painter-controller";
import type { ClearPreview } from "./scene-clear";
import type { LegacySoundPreview } from "./legacy-sounds";
import { TERRAIN_COLORS, supportsTerrainColor } from "./terrain-colors";
import { TERRAIN_AUDIO } from "./terrain-audio";

const confirmClearScene = async (preview: ClearPreview): Promise<boolean> => {
  const dialog = (globalThis as any).foundry?.applications?.api?.DialogV2;
  if (!dialog || typeof dialog.wait !== "function") return false;

  const counts = preview.counts;
  const result = await dialog.wait({
    window: { title: "Battlefield Painter · 清理本场景地形" },
    modal: true,
    rejectClose: false,
    content: [
      `<p>清理当前场景中的 ${counts.totalDocuments} 个 Battlefield Painter 文档？</p>`,
      `<p>Bundles: ${counts.bundles}; Tiles: ${counts.tiles}; Regions: ${counts.regions}; Lights: ${counts.lights}; Sounds: ${counts.sounds}; Walls: ${counts.walls}.</p>`,
    ].join(""),
    buttons: [
      { action: "clear", label: "清除", callback: () => true },
      { action: "cancel", label: "取消", callback: () => false },
    ],
  });
  return result === true;
};

const confirmLegacySounds = async (
  preview: LegacySoundPreview,
): Promise<boolean> => {
  const dialog = (globalThis as any).foundry?.applications?.api?.DialogV2;
  if (!dialog || typeof dialog.wait !== "function") return false;

  const result = await dialog.wait({
    window: { title: "Battlefield Painter · 清理旧环境音" },
    modal: true,
    rejectClose: false,
    content: [
      `<p>当前场景发现 ${preview.soundIds.length} 个旧 Battlefield Painter AmbientSound。</p>`,
      `<p>仅删除这些 ID：${preview.soundIds.join(", ")}。</p>`,
      `<p>该操作不可撤销，外部模块声音不会被删除。</p>`,
    ].join(""),
    buttons: [
      { action: "clearLegacySounds", label: "删除旧声音", callback: () => true },
      { action: "cancel", label: "取消", callback: () => false },
    ],
  });
  return result === true;
};

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
        selectColor: this.selectColor,
        paintRegions: this.paintRegions,
        toggleAudio: this.toggleAudio,
        selectMode: this.selectMode,
        selectBrushShape: this.selectBrushShape,
        setBrushRadius: this.setBrushRadius,
        undo: this.undo,
        redo: this.redo,
        clearScene: this.clearScene,
        clearLegacySounds: this.clearLegacySounds,
        togglePainter: this.togglePainter,
      },
    };

    static PARTS = {
      main: { template: `modules/${MODULE_ID}/templates/painter.hbs` },
    };

    #unsubscribe?: () => void;
    #restoreAfterStroke: number | undefined;
    #configuring = false;

    constructor(...args: unknown[]) {
      super(...args);
      this.#ensureSubscribed();
    }

    #ensureSubscribed(): void {
      this.#unsubscribe ??= controller.subscribe(() => {
        if (this.#configuring) return;
        if (this.#restoreAfterStroke !== undefined && (!controller.state.active || controller.state.completedStrokes > this.#restoreAfterStroke)) {
          this.#restoreAfterStroke = undefined;
          void (async () => { await this.maximize(); if (this.rendered) await this.render({ force: true }); })();
          return;
        }
        // Rendering during minimize resets core's minimization state mid-transition.
        if (this.#restoreAfterStroke !== undefined) return;
        if (this.rendered) void this.render({ force: true });
      });
    }

    async close(...args: unknown[]) {
      this.#restoreAfterStroke = undefined;
      controller.deactivate();
      this.#unsubscribe?.();
      this.#unsubscribe = undefined;
      return super.close(...args);
    }

    async _prepareContext() {
      // The runtime reuses this Application instance after the window closes.
      this.#ensureSubscribed();
      const state = controller.state;
      const legacySoundCount =
        (controller as any).legacySoundPreview?.()?.soundIds?.length ?? 0;
      return {
        state,
        hasAudio: Boolean(TERRAIN_AUDIO[state.configurationId]),
        colors: supportsTerrainColor(state.configurationId) ? TERRAIN_COLORS.map(color => ({ ...color, selected: color.id === state.colorId })) : [],
        legacySoundCount,
        isPaint: state.mode === "paint",
        isErase: state.mode === "erase",
        isAdvance: state.mode === "advance",
        canAdvance: TERRAIN_CONFIGURATIONS[state.configurationId].stages.length > 1,
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
          preview: configuration.id === "fire" ? FIRE_STATIC_PROFILE.textures[0]
            : configuration.id === "frost" ? (state.stageIndex === 0 ? FROST_STATIC_PROFILE.grainsTexture : FROST_STATIC_PROFILE.iceTexture)
            : configuration.id === "brambles" ? BRAMBLE_STATIC_PROFILE.textures[Math.min(state.stageIndex, BRAMBLE_STATIC_PROFILE.textures.length - 1)]
            : configuration.stages[Math.min(state.stageIndex, configuration.stages.length - 1)]!.texture,
        })),
        stages: TERRAIN_CONFIGURATIONS[state.configurationId].stages.map(
          (stage, index) => ({ ...stage, index, selected: index === state.stageIndex,
            caption: TERRAIN_CONFIGURATIONS[state.configurationId].stages.length === 1 ? "单阶段" : `阶段 ${["I", "II", "III", "IV"][index] ?? index + 1}` }),
        ).sort((a, b) => state.configurationId === "brambles" ? [2, 0, 1].indexOf(a.index) - [2, 0, 1].indexOf(b.index) : a.index - b.index)
          .map((stage, order) => ({ ...stage, caption: TERRAIN_CONFIGURATIONS[state.configurationId].stages.length === 1 ? "单阶段" : `阶段 ${["I", "II", "III", "IV"][order]}` })),
      };
    }

    static async selectTerrain(this: BattlefieldPainterApplication, event: any, target: HTMLElement) {
      this.#configuring = true;
      try {
        controller.selectConfiguration(target.dataset.terrain as TerrainConfigurationId);
        if (event?.shiftKey) { controller.selectMode("paint"); controller.activate(); }
        await this.render({ force: true });
      } finally { this.#configuring = false; }
      if (event?.shiftKey) {
        if (controller.state.active) {
          this.#restoreAfterStroke = controller.state.completedStrokes;
          await this.minimize();
        }
      }
    }

    static async selectColor(this: any, _event: unknown, target: HTMLElement) {
      controller.selectColor(target.dataset.color ?? "original");
      await this.render({ force: true });
    }

    static async paintRegions(this: any) { await controller.paintSelectedRegions(); }
    static async toggleAudio(this: any) { controller.toggleAudio(); }

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

    static async clearScene(this: any) {
      await controller.clearAll(confirmClearScene);
      await this.render({ force: true });
    }

    static async clearLegacySounds(this: any) {
      if (typeof (controller as any).clearLegacySounds === "function") {
        await (controller as any).clearLegacySounds(confirmLegacySounds);
      }
      await this.render({ force: true });
    }

    static async togglePainter(this: any) {
      controller.toggle();
      await this.render({ force: true });
    }
  };
};
