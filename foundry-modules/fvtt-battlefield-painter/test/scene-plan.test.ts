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

  test("adds a light for fire but no walls", () => {
    const plan = buildScenePlan({
      bundleId: "bundle-2",
      configurationId: "fire",
      stageIndex: 1,
      cells: [cell],
      movementBehavior,
    });

    expect(plan.AmbientLight).toHaveLength(1);
    expect(plan.Wall).toHaveLength(0);
    expect(plan.AmbientLight[0]?.config.animation.type).toBe("torch");
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
