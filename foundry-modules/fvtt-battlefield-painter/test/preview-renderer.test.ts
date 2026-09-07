import { describe, expect, test } from "bun:test";

import { CursorPreviewRenderer } from "../src/preview-renderer";
import type { GridCell } from "../src/geometry";

const cell = (i: number, j: number): GridCell => ({
  key: `${i}:${j}`,
  offset: { i, j },
  center: { x: i * 100 + 50, y: j * 100 + 50 },
  x: i * 100,
  y: j * 100,
  width: 100,
  height: 100,
  vertices: [
    { x: i * 100, y: j * 100 },
    { x: i * 100 + 100, y: j * 100 },
    { x: i * 100 + 100, y: j * 100 + 100 },
    { x: i * 100, y: j * 100 + 100 },
  ],
});

describe("CursorPreviewRenderer", () => {
  test("uses Foundry v14 grid highlights for normalized offsets", () => {
    const calls: Array<unknown> = [];
    const highlights = {
      addHighlightLayer: (name: string) => calls.push(["add", name]),
      clearHighlightLayer: (name: string) => calls.push(["clear", name]),
      highlightPosition: (name: string, position: unknown) =>
        calls.push(["highlight", name, position]),
      destroyHighlightLayer: (name: string) => calls.push(["destroy", name]),
    };
    const preview = new CursorPreviewRenderer({
      gridHighlights: highlights,
      getTopLeftPoint: ({ i, j }) => ({ x: j * 100 + 7, y: i * 80 + 11 }),
      layerName: "test-preview",
    });

    expect(preview.available).toBe(true);
    preview.show([cell(0, 0), cell(2, 3)], "#ff6a2a");
    preview.hide();
    preview.destroy();

    expect(calls).toEqual([
      ["add", "test-preview"],
      ["clear", "test-preview"],
      [
        "highlight",
        "test-preview",
        { x: 7, y: 11, color: "#ff6a2a", border: "#ff6a2a", alpha: 0.22 },
      ],
      [
        "highlight",
        "test-preview",
        { x: 307, y: 171, color: "#ff6a2a", border: "#ff6a2a", alpha: 0.22 },
      ],
      ["clear", "test-preview"],
      ["destroy", "test-preview"],
    ]);
    expect(preview.available).toBe(false);
  });

  test.each([
    ["square", ({ i, j }: { i: number; j: number }) => ({ x: j * 100, y: i * 100 })],
    ["hex-rows", ({ i, j }: { i: number; j: number }) => ({ x: j * 90 + (i % 2) * 45, y: i * 78 })],
    ["hex-columns", ({ i, j }: { i: number; j: number }) => ({ x: j * 78, y: i * 90 + (j % 2) * 45 })],
  ] as const)("delegates %s offset conversion to Foundry", (_grid, getTopLeftPoint) => {
    const positions: unknown[] = [];
    const preview = new CursorPreviewRenderer({
      gridHighlights: {
        addHighlightLayer() {},
        clearHighlightLayer() {},
        highlightPosition: (_name, position) => positions.push(position),
        destroyHighlightLayer() {},
      },
      getTopLeftPoint,
    });

    expect(preview.show([cell(2, 3)], "#fff")).toBe(true);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ color: "#fff", border: "#fff", alpha: 0.22 });
  });

  test("fails closed when the Foundry highlight API is incomplete", () => {
    const preview = new CursorPreviewRenderer({
      gridHighlights: {
        addHighlightLayer: () => undefined,
        clearHighlightLayer: () => undefined,
        highlightPosition: () => undefined,
        destroyHighlightLayer: undefined as never,
      },
      getTopLeftPoint: () => ({ x: 0, y: 0 }),
    });

    expect(preview.available).toBe(false);
    preview.show([cell(0, 0)], "#fff");
  });

  test("fails closed when layer creation throws", () => {
    const preview = new CursorPreviewRenderer({
      gridHighlights: {
        addHighlightLayer: () => {
          throw new Error("grid unavailable");
        },
        clearHighlightLayer: () => undefined,
        highlightPosition: () => undefined,
        destroyHighlightLayer: () => undefined,
      },
      getTopLeftPoint: () => ({ x: 0, y: 0 }),
    });

    expect(preview.available).toBe(false);
  });
});
