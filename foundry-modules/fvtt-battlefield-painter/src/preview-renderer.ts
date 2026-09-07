import type { GridOffset, GridCell } from "./geometry";

interface PointLike {
  x: number;
  y: number;
}

interface GridHighlightPosition extends PointLike {
  color: string;
  border: string;
  alpha: number;
}

interface GridHighlightApiLike {
  addHighlightLayer?: (name: string) => unknown;
  clearHighlightLayer?: (name: string) => unknown;
  highlightPosition?: (name: string, position: GridHighlightPosition) => unknown;
  destroyHighlightLayer?: (name: string) => unknown;
}

export interface CursorPreviewDependencies {
  gridHighlights?: GridHighlightApiLike;
  getTopLeftPoint?: (offset: GridOffset) => PointLike;
  layerName?: string;
}

const DEFAULT_LAYER_NAME = "fvtt-battlefield-painter.cursor-preview";

const isPoint = (value: unknown): value is PointLike => {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<PointLike>;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
};

export class CursorPreviewRenderer {
  readonly #gridHighlights?: GridHighlightApiLike;
  readonly #getTopLeftPoint?: (offset: GridOffset) => PointLike;
  readonly #layerName: string;
  #available: boolean;

  constructor({
    gridHighlights,
    getTopLeftPoint,
    layerName = DEFAULT_LAYER_NAME,
  }: CursorPreviewDependencies = {}) {
    this.#gridHighlights = gridHighlights;
    this.#getTopLeftPoint = getTopLeftPoint;
    this.#layerName = layerName;
    this.#available = Boolean(
      gridHighlights?.addHighlightLayer &&
        gridHighlights.clearHighlightLayer &&
        gridHighlights.highlightPosition &&
        gridHighlights.destroyHighlightLayer &&
        getTopLeftPoint,
    );

    if (this.#available) {
      try {
        this.#gridHighlights!.addHighlightLayer!(this.#layerName);
      } catch {
        this.#available = false;
      }
    }
  }

  get available(): boolean {
    return this.#available;
  }

  show(cells: readonly GridCell[], color: string): boolean {
    if (!this.#available) return false;

    try {
      this.#gridHighlights!.clearHighlightLayer!(this.#layerName);
      for (const cell of cells) {
        const point = this.#getTopLeftPoint!(cell.offset);
        if (!isPoint(point)) throw new Error("Foundry returned an invalid grid point");
        this.#gridHighlights!.highlightPosition!(this.#layerName, {
          x: point.x,
          y: point.y,
          color,
          border: color,
          alpha: 0.22,
        });
      }
      return true;
    } catch {
      this.#available = false;
      return false;
    }
  }

  hide(): void {
    if (!this.#available) return;
    try {
      this.#gridHighlights!.clearHighlightLayer!(this.#layerName);
    } catch {
      this.#available = false;
    }
  }

  destroy(): void {
    if (!this.#gridHighlights) return;
    try {
      this.#gridHighlights.destroyHighlightLayer!(this.#layerName);
    } catch {
      // The canvas may already be tearing down; there is no layer to retain.
    }
    this.#available = false;
  }
}

export const createFoundryCursorPreviewRenderer = (): CursorPreviewRenderer => {
  const runtime = globalThis as typeof globalThis & {
    canvas?: {
      interface?: { grid?: GridHighlightApiLike };
      grid?: { getTopLeftPoint?: (offset: GridOffset) => PointLike };
    };
  };
  const highlights = runtime.canvas?.interface?.grid;
  const getTopLeftPoint = runtime.canvas?.grid?.getTopLeftPoint;
  return new CursorPreviewRenderer({
    gridHighlights: highlights,
    getTopLeftPoint: getTopLeftPoint
      ? (offset) => getTopLeftPoint.call(runtime.canvas?.grid, offset)
      : undefined,
  });
};
