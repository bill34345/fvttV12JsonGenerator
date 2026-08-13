import { describe, expect, test } from "bun:test";

import { CursorPreviewRenderer } from "../src/preview-renderer";
import type { GridCell } from "../src/grid-adapter";

const cell: GridCell = {
  key: "0:0",
  offset: { i: 0, j: 0 },
  center: { x: 50, y: 50 },
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
};

describe("CursorPreviewRenderer", () => {
  test("draws normalized cell polygons and disposes its graphics", () => {
    const calls: Array<unknown> = [];
    const graphics = {
      clear: () => calls.push("clear"),
      poly: (points: number[]) => {
        calls.push(points);
        return graphics;
      },
      fill: (style: unknown) => {
        calls.push(style);
        return graphics;
      },
      stroke: (style: unknown) => {
        calls.push(style);
        return graphics;
      },
      destroy: () => calls.push("destroy"),
    };
    const children: unknown[] = [];
    const container = {
      addChild: (child: unknown) => children.push(child),
      removeChild: (child: unknown) => children.splice(children.indexOf(child), 1),
    };
    const preview = new CursorPreviewRenderer({
      createGraphics: () => graphics,
      container,
    });

    preview.show([cell], "#ff6a2a");
    expect(preview.available).toBe(true);
    expect(children).toEqual([graphics]);
    expect(calls).toContainEqual([0, 0, 100, 0, 100, 100, 0, 100]);
    expect(calls).toContainEqual({ color: "#ff6a2a", alpha: 0.22 });

    preview.hide();
    preview.destroy();
    expect(children).toEqual([]);
    expect(calls).toContain("destroy");
  });

  test("fails closed when the graphics API is incomplete", () => {
    const preview = new CursorPreviewRenderer({
      createGraphics: () => ({ clear() {} }),
      container: { addChild() {}, removeChild() {} },
    });

    expect(() => preview.show([cell], "#fff")).not.toThrow();
    expect(preview.available).toBe(false);
  });
});
