import { describe, expect, test } from "bun:test";

import {
  boundarySegments,
  boundsForVertices,
  normalizeCell,
  regionShapesForCells,
  type GridCell,
} from "../src/geometry";

const square = (
  key: string,
  left: number,
  top: number,
  size = 100,
): GridCell =>
  normalizeCell({
    key,
    offset: { i: top / size, j: left / size },
    center: { x: left + size / 2, y: top + size / 2 },
    vertices: [
      { x: left, y: top },
      { x: left + size, y: top },
      { x: left + size, y: top + size },
      { x: left, y: top + size },
    ],
  });

describe("grid geometry", () => {
  test("normalizes cell bounds independently of square or hex vertex count", () => {
    const hex = normalizeCell({
      key: "2:3",
      offset: { i: 2, j: 3 },
      center: { x: 150, y: 100 },
      vertices: [
        { x: 100, y: 100 },
        { x: 125, y: 56.699 },
        { x: 175, y: 56.699 },
        { x: 200, y: 100 },
        { x: 175, y: 143.301 },
        { x: 125, y: 143.301 },
      ],
    });

    expect(hex.width).toBe(100);
    expect(hex.height).toBeCloseTo(86.602, 3);
    expect(hex.vertices).toHaveLength(6);
  });

  test("emits Foundry polygon Region shapes from the original grid vertices", () => {
    expect(regionShapesForCells([square("0:0", 0, 0)])).toEqual([
      {
        type: "polygon",
        points: [0, 0, 100, 0, 100, 100, 0, 100],
        hole: false,
      },
    ]);
  });

  test("removes shared edges when constructing bramble boundary walls", () => {
    const segments = boundarySegments([
      square("0:0", 0, 0),
      square("0:1", 100, 0),
    ]);

    expect(segments).toHaveLength(6);
    expect(segments).not.toContainEqual([100, 0, 100, 100]);
  });

  test("computes a bounding rectangle over multiple cells", () => {
    expect(
      boundsForVertices([
        square("0:0", 0, 0),
        square("1:1", 100, 100),
      ]),
    ).toEqual({ x: 0, y: 0, width: 200, height: 200, centerX: 100, centerY: 100 });
  });
});
