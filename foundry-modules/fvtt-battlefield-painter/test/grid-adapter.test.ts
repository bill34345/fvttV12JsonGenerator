import { describe, expect, test } from "bun:test";

import { gridCellAtPoint, isSquareGrid } from "../src/grid-adapter";

describe("Foundry grid adapter", () => {
  test("uses Foundry grid offsets, centers, and vertices without assuming squares", () => {
    const calls: string[] = [];
    const grid = {
      getOffset: () => {
        calls.push("offset");
        return { i: 4, j: 7 };
      },
      getCenterPoint: (offset: { i: number; j: number }) => {
        calls.push(`center:${offset.i}:${offset.j}`);
        return { x: 750, y: 450 };
      },
      getVertices: (offset: { i: number; j: number }) => {
        calls.push(`vertices:${offset.i}:${offset.j}`);
        return [
          { x: 700, y: 450 },
          { x: 725, y: 406.699 },
          { x: 775, y: 406.699 },
          { x: 800, y: 450 },
          { x: 775, y: 493.301 },
          { x: 725, y: 493.301 },
        ];
      },
    };

    const cell = gridCellAtPoint(grid, { x: 748, y: 447 });

    expect(cell.key).toBe("4:7");
    expect(cell.vertices).toHaveLength(6);
    expect(calls).toEqual(["offset", "center:4:7", "vertices:4:7"]);
  });

  test("recognizes only the public Foundry square type and fails closed otherwise", () => {
    const previous = (globalThis as any).CONST;
    (globalThis as any).CONST = { GRID_TYPES: { SQUARE: 1 } };
    try {
      expect(isSquareGrid({ type: 1 })).toBe(true);
      expect(isSquareGrid({ type: 2, isSquare: true })).toBe(false);
      expect(isSquareGrid({ type: 0 })).toBe(false);
      expect(isSquareGrid({})).toBe(false);
      delete (globalThis as any).CONST;
      expect(isSquareGrid({ type: 1, isSquare: true })).toBe(false);
    } finally {
      if (previous === undefined) delete (globalThis as any).CONST;
      else (globalThis as any).CONST = previous;
    }
  });
});
