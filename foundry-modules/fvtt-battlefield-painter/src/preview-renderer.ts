import type { GridCell } from "./geometry";

interface GraphicsLike {
  clear?: () => unknown;
  poly?: (points: number[]) => GraphicsLike;
  fill?: (style: Record<string, unknown>) => GraphicsLike;
  stroke?: (style: Record<string, unknown>) => GraphicsLike;
  destroy?: () => unknown;
}

interface GraphicsContainerLike {
  addChild(child: GraphicsLike): unknown;
  removeChild(child: GraphicsLike): unknown;
}

export interface CursorPreviewDependencies {
  createGraphics?: () => GraphicsLike;
  container?: GraphicsContainerLike;
}

export class CursorPreviewRenderer {
  readonly #createGraphics?: () => GraphicsLike;
  readonly #container?: GraphicsContainerLike;
  #graphics?: GraphicsLike;
  #attached = false;
  #available: boolean;

  constructor({ createGraphics, container }: CursorPreviewDependencies = {}) {
    this.#createGraphics = createGraphics;
    this.#container = container;
    this.#available = Boolean(createGraphics && container);
  }

  get available(): boolean {
    return this.#available;
  }

  show(cells: readonly GridCell[], color: string): void {
    if (!this.#available) return;
    const graphics = this.#graphics ?? this.#createGraphics?.();
    if (
      !graphics?.clear ||
      !graphics.poly ||
      !graphics.fill ||
      !graphics.stroke ||
      !this.#container
    ) {
      this.#available = false;
      return;
    }

    this.#graphics = graphics;
    if (!this.#attached) {
      this.#container.addChild(graphics);
      this.#attached = true;
    }
    graphics.clear();
    for (const cell of cells) {
      graphics.poly(cell.vertices.flatMap(({ x, y }) => [x, y]));
      graphics.fill({ color, alpha: 0.22 });
      graphics.stroke({ color, alpha: 0.9, width: 2 });
    }
  }

  hide(): void {
    this.#graphics?.clear?.();
  }

  destroy(): void {
    if (this.#graphics && this.#attached) this.#container?.removeChild(this.#graphics);
    this.#graphics?.destroy?.();
    this.#graphics = undefined;
    this.#attached = false;
  }
}

export const createFoundryCursorPreviewRenderer = (): CursorPreviewRenderer => {
  const runtime = globalThis as typeof globalThis & {
    PIXI?: { Graphics?: new () => GraphicsLike };
    canvas?: { interface?: GraphicsContainerLike };
  };
  const Graphics = runtime.PIXI?.Graphics;
  return new CursorPreviewRenderer({
    createGraphics: Graphics ? () => new Graphics() : undefined,
    container: runtime.canvas?.interface,
  });
};
