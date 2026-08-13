import {
  TERRAIN_CONFIGURATIONS,
  type TerrainConfigurationId,
} from "./catalog";
import { brushCells, type BrushGridLike, type BrushShape } from "./brush-engine";
import {
  DevelopmentPhaseGate,
  type DevelopmentPhase,
  type DevelopmentPhaseSnapshot,
} from "./development-phases";
import type { GridCell } from "./geometry";
import { gridCellAtPoint } from "./grid-adapter";
import { createMovementBehaviorFactory } from "./movement";
import {
  createFoundryCursorPreviewRenderer,
  type CursorPreviewRenderer,
} from "./preview-renderer";
import { collectOwnedBundles } from "./scene-ownership";
import { SceneHistory, type HistorySceneLike } from "./scene-history";
import { TerrainService } from "./terrain-service";

export type PainterMode = "paint" | "erase" | "advance";

export interface PainterState {
  active: boolean;
  configurationId: TerrainConfigurationId;
  stageIndex: number;
  mode: PainterMode;
  brushShape: BrushShape;
  brushRadius: number;
  p0Enabled: boolean;
  p1Enabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  status: string;
}

type StateListener = (state: PainterState) => void;

const getFoundryCanvas = (): any => (globalThis as any).canvas;
const getGame = (): any => (globalThis as any).game;

export class PainterController {
  readonly #phases: DevelopmentPhaseGate;
  readonly #createPreview: () => CursorPreviewRenderer;
  #preview: CursorPreviewRenderer | undefined;
  #state: PainterState = {
    active: false,
    configurationId: "fire",
    stageIndex: 0,
    mode: "paint",
    brushShape: "free",
    brushRadius: 0,
    p0Enabled: true,
    p1Enabled: true,
    canUndo: false,
    canRedo: false,
    status: "选择地形后启用画笔。",
  };
  readonly #listeners = new Set<StateListener>();
  readonly #stroke = new Map<string, GridCell>();
  #pointerId: number | undefined;
  #canvasElement: HTMLCanvasElement | undefined;
  #startCell: GridCell | undefined;
  #history: SceneHistory | undefined;
  #historyScene: HistorySceneLike | undefined;

  constructor({
    phases = new DevelopmentPhaseGate(),
    createPreview = createFoundryCursorPreviewRenderer,
  }: {
    phases?: DevelopmentPhaseGate;
    createPreview?: () => CursorPreviewRenderer;
  } = {}) {
    this.#phases = phases;
    this.#createPreview = createPreview;
    this.#state = {
      ...this.#state,
      p0Enabled: phases.isEnabled("p0"),
      p1Enabled: phases.isEnabled("p1"),
    };
  }

  get state(): Readonly<PainterState> {
    return this.#state;
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  selectConfiguration(configurationId: TerrainConfigurationId): void {
    if (!TERRAIN_CONFIGURATIONS[configurationId]) return;
    this.#update({ configurationId });
  }

  selectStage(stageIndex: number): void {
    if (stageIndex !== 0 && stageIndex !== 1) return;
    this.#update({ stageIndex });
  }

  selectMode(mode: PainterMode): void {
    if (!(["paint", "erase", "advance"] as const).includes(mode)) return;
    this.#update({ mode });
  }

  selectBrushShape(shape: BrushShape): void {
    if (!this.#phases.isEnabled("p1")) return;
    if (!(["free", "line", "fill"] as const).includes(shape)) return;
    this.#update({ brushShape: shape });
  }

  setBrushRadius(radius: number): void {
    if (!this.#phases.isEnabled("p1")) return;
    if (!Number.isInteger(radius) || radius < 0 || radius > 4) return;
    this.#update({ brushRadius: radius });
  }

  developmentPhases(): DevelopmentPhaseSnapshot {
    return this.#phases.snapshot();
  }

  setDevelopmentPhase(
    phase: DevelopmentPhase,
    enabled: boolean,
  ): DevelopmentPhaseSnapshot {
    const phases = this.#phases.set(phase, enabled);
    const p0Enabled = phases.p0;
    const p1Enabled = phases.p1;
    if (!p0Enabled && this.#state.active) this.deactivate();
    if (!p1Enabled) this.#preview?.hide();
    this.#update({
      p0Enabled,
      p1Enabled,
      brushShape: p1Enabled ? this.#state.brushShape : "free",
      brushRadius: p1Enabled ? this.#state.brushRadius : 0,
      canUndo: p1Enabled ? (this.#history?.state.canUndo ?? false) : false,
      canRedo: p1Enabled ? (this.#history?.state.canRedo ?? false) : false,
    });
    return phases;
  }

  activate(): void {
    if (!this.#phases.isEnabled("p0")) {
      this.#update({ status: "P0 内部阶段已停用，画笔不会修改场景。" });
      return;
    }
    const game = getGame();
    const foundryCanvas = getFoundryCanvas();
    if (game?.user?.isGM !== true) {
      this.#notify("error", "只有 GM 可以修改战场地形。");
      return;
    }
    if (!foundryCanvas?.ready || !foundryCanvas.scene || !foundryCanvas.grid) {
      this.#notify("warn", "请先打开并激活一个场景。");
      return;
    }

    const element = foundryCanvas.app?.canvas ?? foundryCanvas.app?.view;
    if (!(element instanceof HTMLCanvasElement)) {
      this.#notify("error", "无法连接 Foundry 画布指针事件。");
      return;
    }

    if (this.#canvasElement !== element) {
      this.deactivate();
      this.#canvasElement = element;
      this.#preview = this.#createPreview();
      element.addEventListener("pointerdown", this.#onPointerDown, true);
      element.addEventListener("pointermove", this.#onPointerMove, true);
      element.addEventListener("pointerleave", this.#onPointerLeave, true);
      element.addEventListener("pointerup", this.#onPointerUp, true);
      element.addEventListener("pointercancel", this.#onPointerCancel, true);
    }
    const history = this.#historyFor(foundryCanvas.scene).state;
    this.#update({
      active: true,
      canUndo: this.#state.p1Enabled && history.canUndo,
      canRedo: this.#state.p1Enabled && history.canRedo,
      status: "画笔已启用：在地图上按住并拖动。",
    });
  }

  deactivate(): void {
    const element = this.#canvasElement;
    if (element) {
      element.removeEventListener("pointerdown", this.#onPointerDown, true);
      element.removeEventListener("pointermove", this.#onPointerMove, true);
      element.removeEventListener("pointerleave", this.#onPointerLeave, true);
      element.removeEventListener("pointerup", this.#onPointerUp, true);
      element.removeEventListener("pointercancel", this.#onPointerCancel, true);
    }
    this.#canvasElement = undefined;
    this.#pointerId = undefined;
    this.#startCell = undefined;
    this.#stroke.clear();
    this.#preview?.destroy();
    this.#preview = undefined;
    this.#update({ active: false, status: "画笔已停用。" });
  }

  toggle(): void {
    if (this.#state.active) this.deactivate();
    else this.activate();
  }

  auditScene(): Record<string, number> {
    const scene = getFoundryCanvas()?.scene;
    if (!scene) return { bundles: 0, tiles: 0, regions: 0, lights: 0, walls: 0 };
    const bundles = collectOwnedBundles(scene);
    return {
      bundles: bundles.size,
      tiles: [...bundles.values()].reduce((sum, bundle) => sum + bundle.Tile.length, 0),
      regions: [...bundles.values()].reduce(
        (sum, bundle) => sum + bundle.Region.length,
        0,
      ),
      lights: [...bundles.values()].reduce(
        (sum, bundle) => sum + bundle.AmbientLight.length,
        0,
      ),
      walls: [...bundles.values()].reduce((sum, bundle) => sum + bundle.Wall.length, 0),
    };
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    if (!this.#state.active || event.button !== 0 || this.#pointerId !== undefined) return;
    this.#pointerId = event.pointerId;
    this.#stroke.clear();
    this.#startCell = undefined;
    this.#consumePointer(event);
    this.#canvasElement?.setPointerCapture?.(event.pointerId);
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    if (!this.#state.active) return;
    if (this.#pointerId === undefined) {
      this.#previewPointer(event);
      return;
    }
    if (event.pointerId === this.#pointerId) this.#consumePointer(event);
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return;
    this.#consumePointer(event);
    this.#canvasElement?.releasePointerCapture?.(event.pointerId);
    this.#pointerId = undefined;
    this.#startCell = undefined;
    void this.#commitStroke();
  };

  readonly #onPointerLeave = (): void => {
    if (this.#pointerId === undefined) this.#preview?.hide();
  };

  readonly #onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return;
    this.#pointerId = undefined;
    this.#startCell = undefined;
    this.#stroke.clear();
    this.#preview?.hide();
  };

  #consumePointer(event: PointerEvent): void {
    const foundryCanvas = getFoundryCanvas();
    const point = foundryCanvas.canvasCoordinatesFromClient({
      x: event.clientX,
      y: event.clientY,
    });
    const cell = gridCellAtPoint(foundryCanvas.grid, point);
    this.#startCell ??= cell;
    const cells = this.#cellsForPointer(foundryCanvas.grid, this.#startCell, cell);
    if (this.#state.brushShape !== "free" && this.#state.p1Enabled) {
      this.#stroke.clear();
    }
    for (const brushCell of cells) this.#stroke.set(brushCell.key, brushCell);
    if (this.#state.p1Enabled) {
      this.#preview?.show([...this.#stroke.values()], this.#terrainAccent());
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  #previewPointer(event: PointerEvent): void {
    if (!this.#state.p1Enabled) return;
    const foundryCanvas = getFoundryCanvas();
    if (!foundryCanvas?.grid || !foundryCanvas.canvasCoordinatesFromClient) return;
    const point = foundryCanvas.canvasCoordinatesFromClient({
      x: event.clientX,
      y: event.clientY,
    });
    const cell = gridCellAtPoint(foundryCanvas.grid, point);
    this.#preview?.show(
      this.#cellsForPointer(foundryCanvas.grid, cell, cell),
      this.#terrainAccent(),
    );
  }

  #cellsForPointer(
    grid: BrushGridLike,
    start: GridCell,
    end: GridCell,
  ): GridCell[] {
    if (!this.#state.p1Enabled) return [end];
    return brushCells(grid, {
      shape: this.#state.brushShape,
      radius: this.#state.brushRadius,
      start: start.offset,
      end: end.offset,
    });
  }

  #terrainAccent(): string {
    return TERRAIN_CONFIGURATIONS[this.#state.configurationId].accent;
  }

  async #commitStroke(): Promise<void> {
    const foundryCanvas = getFoundryCanvas();
    const cells = [...this.#stroke.values()];
    this.#stroke.clear();
    this.#preview?.hide();
    if (!cells.length || !foundryCanvas?.scene || !foundryCanvas?.grid) return;

    this.#update({ status: `正在处理 ${cells.length} 个格位…` });
    try {
      const service = new TerrainService({
        scene: foundryCanvas.scene,
        grid: foundryCanvas.grid,
        movementBehavior: createMovementBehaviorFactory((globalThis as any).CONFIG),
      });
      this.#historyFor(foundryCanvas.scene);

      if (this.#state.mode === "paint") {
        const result = await this.#withHistory("绘制地形", () =>
          service.paintCells(
            this.#state.configurationId,
            this.#state.stageIndex,
            cells,
          ),
        );
        const skipped = result.skippedCells
          ? `；${result.skippedCells} 格已有本模组地形，已跳过`
          : "";
        this.#update({ status: `已绘制 ${result.createdCells} 格${skipped}。` });
      } else if (this.#state.mode === "erase") {
        await this.#withHistory("擦除地形", () =>
          service.eraseCellKeys(new Set(cells.map(({ key }) => key))),
        );
        this.#update({ status: `已擦除命中的地形格位。` });
      } else {
        await this.#withHistory("切换阶段", () =>
          service.advanceCellKeys(new Set(cells.map(({ key }) => key))),
        );
        this.#update({ status: "已切换命中地形的阶段。" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#update({ status: `操作失败：${message}` });
      this.#notify("error", `Battlefield Painter：${message}`);
    }
    this.#syncHistoryState();
  }

  async undo(): Promise<void> {
    if (!this.#state.p1Enabled) return;
    const scene = getFoundryCanvas()?.scene as HistorySceneLike | undefined;
    if (!scene) return;
    try {
      const label = await this.#historyFor(scene).undo();
      this.#syncHistoryState();
      if (label) this.#update({ status: `已撤销：${label}。` });
    } catch (error) {
      this.#reportHistoryError("撤销", error);
    }
  }

  async redo(): Promise<void> {
    if (!this.#state.p1Enabled) return;
    const scene = getFoundryCanvas()?.scene as HistorySceneLike | undefined;
    if (!scene) return;
    try {
      const label = await this.#historyFor(scene).redo();
      this.#syncHistoryState();
      if (label) this.#update({ status: `已重做：${label}。` });
    } catch (error) {
      this.#reportHistoryError("重做", error);
    }
  }

  #historyFor(scene: HistorySceneLike): SceneHistory {
    if (this.#historyScene !== scene || !this.#history) {
      this.#historyScene = scene;
      this.#history = new SceneHistory(scene);
    }
    return this.#history;
  }

  #withHistory<T>(label: string, mutation: () => Promise<T>): Promise<T> {
    if (!this.#state.p1Enabled || !this.#history) return mutation();
    return this.#history.execute(label, mutation);
  }

  #syncHistoryState(): void {
    const state = this.#history?.state ?? { canUndo: false, canRedo: false };
    this.#update({
      canUndo: this.#state.p1Enabled && state.canUndo,
      canRedo: this.#state.p1Enabled && state.canRedo,
    });
  }

  #reportHistoryError(action: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.#update({ status: `${action}失败：${message}` });
    this.#notify("error", `Battlefield Painter：${action}失败：${message}`);
  }

  #update(update: Partial<PainterState>): void {
    this.#state = { ...this.#state, ...update };
    for (const listener of this.#listeners) listener(this.#state);
  }

  #notify(level: "warn" | "error", message: string): void {
    (globalThis as any).ui?.notifications?.[level]?.(message);
  }
}
