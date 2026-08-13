import {
  normalizeCell,
  type GridCell,
  type GridOffset,
  type Point,
} from "./geometry";

export type { GridCell, GridOffset, Point } from "./geometry";

export interface FoundryGridLike {
  getOffset(point: Point): GridOffset;
  getCenterPoint(offset: GridOffset): Point;
  getVertices(offset: GridOffset): Point[];
}

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
