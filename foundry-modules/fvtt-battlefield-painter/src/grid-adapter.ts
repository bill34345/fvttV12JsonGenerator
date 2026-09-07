import {
  normalizeCell,
  type GridCell,
  type GridOffset,
  type Point,
} from "./geometry";

export type { GridCell, GridOffset, Point } from "./geometry";

export interface FoundryGridLike {
  /** Pixels occupied by one grid square. Foundry exposes this on the live grid. */
  size?: number;
  /** Foundry's public grid type, compared with CONST.GRID_TYPES.SQUARE when available. */
  type?: number;
  /** Foundry v14's public BaseGrid convenience getter. */
  isSquare?: boolean;
  getOffset(point: Point): GridOffset;
  getCenterPoint(offset: GridOffset): Point;
  getVertices(offset: GridOffset): Point[];
  getAdjacentOffsets?(offset: GridOffset): GridOffset[];
}

export const isSquareGrid = (
  grid: Pick<FoundryGridLike, "type" | "isSquare">,
): boolean => {
  const squareType = (globalThis as any).CONST?.GRID_TYPES?.SQUARE;
  if (typeof grid.type === "number") {
    return typeof squareType === "number" && grid.type === squareType;
  }
  return grid.isSquare === true;
};

export const gridCellAtOffset = (
  grid: FoundryGridLike,
  offset: GridOffset,
): GridCell =>
  normalizeCell({
    key: `${offset.i}:${offset.j}`,
    offset,
    center: grid.getCenterPoint(offset),
    vertices: grid.getVertices(offset),
  });

export const gridCellAtPoint = (
  grid: FoundryGridLike,
  point: Point,
): GridCell => gridCellAtOffset(grid, grid.getOffset(point));
