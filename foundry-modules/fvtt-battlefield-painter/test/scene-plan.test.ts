import { describe, expect, test } from "bun:test";

import { normalizeCell } from "../src/geometry";
import {
  buildScenePlan,
  type MovementBehaviorFactory,
} from "../src/scene-plan";

const movementBehavior: MovementBehaviorFactory = (multiplier) => ({
  type: "modifyMovementCost",
  system: { difficulties: { walk: multiplier } },
});

const cell = normalizeCell({
  key: "0:0",
  offset: { i: 0, j: 0 },
  center: { x: 50, y: 50 },
  vertices: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
});

describe("scene plan", () => {
  test("creates reversible, flagged Tiles and a movement Region", () => {
    const plan = buildScenePlan({
      bundleId: "bundle-1",
      configurationId: "frost",
      stageIndex: 0,
      cells: [cell],
      movementBehavior,
    });

    expect(plan.Tile).toHaveLength(1);
    expect(plan.Region).toHaveLength(1);
    expect(plan.Tile[0]?.flags["fvtt-battlefield-painter"]).toEqual({
      bundleId: "bundle-1",
      configurationId: "frost",
      stageIndex: 0,
      cellKey: "0:0",
      offset: { i: 0, j: 0 },
      role: "terrain-tile",
    });
    expect(plan.Tile[0]).toMatchObject({
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    });
    expect(plan.Region[0]?.behaviors[0]?.type).toBe("modifyMovementCost");
  });

  test("expands only visual Tile geometry when square bleed is requested", () => {
    const plan = buildScenePlan({
      bundleId: "bundle-bleed",
      configurationId: "frost",
      stageIndex: 0,
      cells: [cell],
      movementBehavior,
      visualBleed: 0.08,
    });

    expect(plan.Tile[0]).toMatchObject({
      x: 50,
      y: 50,
      width: 108,
      height: 108,
    });
    expect(plan.Region[0]?.shapes).toEqual([
      {
        type: "polygon",
        points: [0, 0, 100, 0, 100, 100, 0, 100],
        hole: false,
      },
    ]);
  });

  test("adds a light for fire but no walls", () => {
    const plan = buildScenePlan({
      bundleId: "bundle-2",
      configurationId: "fire",
      stageIndex: 1,
      cells: [cell],
      movementBehavior,
    });

    expect(plan.AmbientLight).toHaveLength(1);
    expect(plan.AmbientSound).toHaveLength(0);
    expect(plan.Wall).toHaveLength(0);
    expect(plan.AmbientLight[0]?.config.animation.type).toBe("torch");
  });

  test("keeps the fire field marker on Tiles only", () => {
    const plan = buildScenePlan({
      bundleId: "bundle-fire-field",
      configurationId: "fire",
      stageIndex: 1,
      cells: [cell],
      movementBehavior,
      p2Enabled: true,
      visualEffect: "fire-field-v1",
    });

    expect(plan.Tile[0]?.texture.src.endsWith("fire.webp")).toBe(true);
    expect(plan.Tile[0]?.flags["fvtt-battlefield-painter"].visualEffect).toBe(
      "fire-field-v1",
    );
    expect(plan.Region[0]?.flags["fvtt-battlefield-painter"].visualEffect).toBe(
      undefined,
    );
    expect(
      plan.AmbientLight[0]?.flags["fvtt-battlefield-painter"].visualEffect,
    ).toBeUndefined();
  });

  test("uses the thin ice film and marker for P2 Frost without requesting frost.webm", () => {
    const stageI = buildScenePlan({
      bundleId: "bundle-frost-field-i",
      configurationId: "frost",
      stageIndex: 0,
      cells: [cell],
      movementBehavior,
      p2Enabled: true,
      visualEffect: "frost-field-v1",
    });
    const stageII = buildScenePlan({
      bundleId: "bundle-frost-field-ii",
      configurationId: "frost",
      stageIndex: 1,
      cells: [cell],
      movementBehavior,
      p2Enabled: true,
      visualEffect: "frost-field-v1",
    });

    expect(stageI.Tile[0]).toMatchObject({
      alpha: 0.48,
      texture: { tint: "#ffffff" },
    });
    expect(stageII.Tile[0]).toMatchObject({
      alpha: 0.62,
      texture: { tint: "#ffffff" },
    });
    for (const plan of [stageI, stageII]) {
      expect(plan.Tile[0]?.texture.src.endsWith("frost-film-v1.webp")).toBe(true);
      expect(plan.Tile[0]?.texture.src.endsWith("frost.webm")).toBe(false);
      expect(plan.Tile[0]?.flags["fvtt-battlefield-painter"].visualEffect).toBe(
        "frost-field-v1",
      );
      expect(plan.Region[0]?.flags["fvtt-battlefield-painter"].visualEffect).toBeUndefined();
    }
  });

  test("rejects crossed Fire and Frost visual markers", () => {
    expect(() =>
      buildScenePlan({
        bundleId: "crossed-fire",
        configurationId: "fire",
        stageIndex: 0,
        cells: [cell],
        movementBehavior,
        visualEffect: "frost-field-v1",
      }),
    ).toThrow("not supported");
    expect(() =>
      buildScenePlan({
        bundleId: "crossed-frost",
        configurationId: "frost",
        stageIndex: 0,
        cells: [cell],
        movementBehavior,
        visualEffect: "fire-field-v1",
      }),
    ).toThrow("not supported");
  });

  test("adds only exterior wall segments for mature brambles", () => {
    const plan = buildScenePlan({
      bundleId: "bundle-3",
      configurationId: "brambles",
      stageIndex: 1,
      cells: [cell],
      movementBehavior,
    });

    expect(plan.Wall).toHaveLength(4);
    expect(plan.Wall.map(({ c }) => c)).toEqual([
      [0, 0, 100, 0],
      [100, 0, 100, 100],
      [100, 100, 0, 100],
      [0, 100, 0, 0],
    ]);
    expect(plan.Wall.every((wall) => wall.flags["fvtt-battlefield-painter"])).toBe(
      true,
    );
  });

  test("rejects duplicate cells before scene mutation", () => {
    expect(() =>
      buildScenePlan({
        bundleId: "bundle-4",
        configurationId: "fire",
        stageIndex: 0,
        cells: [cell, cell],
        movementBehavior,
      }),
    ).toThrow("Duplicate terrain cell: 0:0");
  });
});
