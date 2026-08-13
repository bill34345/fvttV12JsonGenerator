import { describe, expect, test } from "bun:test";

import {
  brushCells,
  expandOffsets,
  fillOffsets,
  lineOffsets,
  type BrushGridLike,
} from "../src/brush-engine";

const squareGrid: BrushGridLike = {
  getAdjacentOffsets({ i, j }) {
    return [
      { i: i - 1, j },
      { i: i + 1, j },
      { i, j: j - 1 },
      { i, j: j + 1 },
    ];
  },
  getDirectPath([{ i: i0, j: j0 }, { i: i1, j: j1 }]) {
    const steps = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0));
    return Array.from({ length: steps + 1 }, (_, index) => ({
      i: Math.round(i0 + ((i1 - i0) * index) / steps),
      j: Math.round(j0 + ((j1 - j0) * index) / steps),
    }));
  },
  getCenterPoint({ i, j }) {
    return { x: j * 100 + 50, y: i * 100 + 50 };
  },
  getOffset(point) {
    return { i: Math.floor(point.y / 100), j: Math.floor(point.x / 100) };
  },
  getVertices({ i, j }) {
    const x = j * 100;
    const y = i * 100;
    return [
      { x, y },
      { x: x + 100, y },
      { x: x + 100, y: y + 100 },
      { x, y: y + 100 },
    ];
  },
};

describe("brush geometry", () => {
  test("expands a seed by Foundry adjacency rings", () => {
    expect(expandOffsets(squareGrid, [{ i: 2, j: 3 }], 1)).toEqual([
      { i: 2, j: 3 },
      { i: 1, j: 3 },
      { i: 3, j: 3 },
      { i: 2, j: 2 },
      { i: 2, j: 4 },
    ]);
  });

  test("delegates line rasterization to the Foundry grid", () => {
    expect(lineOffsets(squareGrid, { i: 0, j: 0 }, { i: 2, j: 4 })).toEqual([
      { i: 0, j: 0 },
      { i: 1, j: 1 },
      { i: 1, j: 2 },
      { i: 2, j: 3 },
      { i: 2, j: 4 },
    ]);
  });

  test("fills the inclusive offset rectangle", () => {
    expect(fillOffsets({ i: 1, j: 2 }, { i: 2, j: 4 })).toEqual([
      { i: 1, j: 2 },
      { i: 1, j: 3 },
      { i: 1, j: 4 },
      { i: 2, j: 2 },
      { i: 2, j: 3 },
      { i: 2, j: 4 },
    ]);
  });

  test("deduplicates radius-expanded line cells", () => {
    const cells = brushCells(squareGrid, {
      shape: "line",
      radius: 1,
      start: { i: 0, j: 0 },
      end: { i: 0, j: 3 },
    });

    const keys = new Set(cells.map((cell) => cell.key));
    expect(keys.size).toBe(cells.length);
    expect(keys.has("1:1")).toBe(true);
    expect(keys.has("0:3")).toBe(true);
  });

  test("rejects unsafe brush radii", () => {
    expect(() => expandOffsets(squareGrid, [{ i: 0, j: 0 }], 5)).toThrow(
      "Brush radius",
    );
  });
});
