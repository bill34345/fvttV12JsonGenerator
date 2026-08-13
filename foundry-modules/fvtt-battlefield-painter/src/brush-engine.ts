import { gridCellAtOffset, type FoundryGridLike } from "./grid-adapter";
import type { GridCell, GridOffset } from "./geometry";

export type BrushShape = "free" | "line" | "fill";

export interface BrushGridLike extends FoundryGridLike {
  getAdjacentOffsets(offset: GridOffset): GridOffset[];
  getDirectPath(waypoints: GridOffset[]): GridOffset[];
}

export interface BrushCellsOptions {
  shape: BrushShape;
  radius: number;
  start: GridOffset;
  end: GridOffset;
}

const MAX_BRUSH_RADIUS = 4;
const offsetKey = ({ i, j }: GridOffset): string => `${i}:${j}`;

const uniqueOffsets = (offsets: readonly GridOffset[]): GridOffset[] => {
  const seen = new Set<string>();
  return offsets.filter((offset) => {
    const key = offsetKey(offset);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const assertRadius = (radius: number): void => {
  if (!Number.isInteger(radius) || radius < 0 || radius > MAX_BRUSH_RADIUS) {
    throw new Error(`Brush radius must be an integer from 0 to ${MAX_BRUSH_RADIUS}`);
  }
};

export const expandOffsets = (
  grid: Pick<BrushGridLike, "getAdjacentOffsets">,
  seeds: readonly GridOffset[],
  radius: number,
): GridOffset[] => {
  assertRadius(radius);
  const result = uniqueOffsets(seeds);
  const seen = new Set(result.map(offsetKey));
  let frontier = [...result];

  for (let ring = 0; ring < radius; ring += 1) {
    const next: GridOffset[] = [];
    for (const offset of frontier) {
      for (const adjacent of grid.getAdjacentOffsets(offset)) {
        const key = offsetKey(adjacent);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(adjacent);
        next.push(adjacent);
      }
    }
    frontier = next;
  }

  return result;
};

export const lineOffsets = (
  grid: Pick<BrushGridLike, "getDirectPath">,
  start: GridOffset,
  end: GridOffset,
): GridOffset[] => uniqueOffsets(grid.getDirectPath([start, end]));

export const fillOffsets = (
  start: GridOffset,
  end: GridOffset,
): GridOffset[] => {
  const offsets: GridOffset[] = [];
  for (let i = Math.min(start.i, end.i); i <= Math.max(start.i, end.i); i += 1) {
    for (let j = Math.min(start.j, end.j); j <= Math.max(start.j, end.j); j += 1) {
      offsets.push({ i, j });
    }
  }
  return offsets;
};

export const brushCells = (
  grid: BrushGridLike,
  { shape, radius, start, end }: BrushCellsOptions,
): GridCell[] => {
  const seeds =
    shape === "line"
      ? lineOffsets(grid, start, end)
      : shape === "fill"
        ? fillOffsets(start, end)
        : [end];

  return expandOffsets(grid, seeds, radius).map((offset) =>
    gridCellAtOffset(grid, offset),
  );
};
