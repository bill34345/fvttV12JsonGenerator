import { describe, expect, test } from "bun:test";

import { TERRAIN_CONFIGURATIONS } from "../src/catalog";
import { clusterCells } from "../src/terrain-clusters";
import { normalizeCell } from "../src/geometry";
import { buildScenePlan, type MovementBehaviorFactory } from "../src/scene-plan";

const movementBehavior: MovementBehaviorFactory = (multiplier) => ({
  type: "modifyMovementCost",
  system: { difficulties: { walk: multiplier } },
});

const cell = (i: number, j: number) =>
  normalizeCell({
    key: `${i}:${j}`,
    offset: { i, j },
    center: { x: i * 100 + 50, y: j * 100 + 50 },
    vertices: [
      { x: i * 100, y: j * 100 },
      { x: i * 100 + 100, y: j * 100 },
      { x: i * 100 + 100, y: j * 100 + 100 },
      { x: i * 100, y: j * 100 + 100 },
    ],
  });

describe("P2 media and deterministic clusters", () => {
  test("exposes static and animated media for all stages", () => {
    for (const configuration of Object.values(TERRAIN_CONFIGURATIONS)) {
      for (const stage of configuration.stages) {
        expect(stage.media.staticTexture.endsWith(".webp")).toBe(true);
        expect(stage.media.animatedTexture.endsWith(".webm")).toBe(true);
        expect(stage.media.ambience.src.endsWith(".ogg")).toBe(true);
        expect(stage.media.ambience.volume).toBeGreaterThan(0);
        expect(stage.media.ambience.volume).toBeLessThanOrEqual(1);
      }
    }
  });

  test("P2 scene plans use animation, sound clusters, and clustered fire light", () => {
    const cells = Array.from({ length: 20 }, (_, index) => cell(index, 0));
    const plan = buildScenePlan({
      bundleId: "bundle-p2",
      configurationId: "fire",
      stageIndex: 1,
      cells,
      movementBehavior,
      p2Enabled: true,
    });

    expect(plan.Tile[0]?.texture.src.endsWith(".webm")).toBe(true);
    expect(plan.AmbientSound).toHaveLength(2);
    expect(plan.AmbientLight).toHaveLength(2);
    expect(plan.AmbientSound.every((sound) => sound.walls === true)).toBe(true);
    expect(plan.AmbientSound.every((sound) => sound.easing === true)).toBe(true);
    expect(plan.AmbientSound.every((sound) => sound.repeat === true)).toBe(true);
    expect(plan.AmbientSound.every((sound) => sound.radius >= 2)).toBe(true);
  });

  test("P2 off keeps the P0 static texture and single light with no sounds", () => {
    const plan = buildScenePlan({
      bundleId: "bundle-p0",
      configurationId: "fire",
      stageIndex: 0,
      cells: [cell(0, 0), cell(1, 0)],
      movementBehavior,
      p2Enabled: false,
    });

    expect(plan.Tile[0]?.texture.src.endsWith(".webp")).toBe(true);
    expect(plan.AmbientSound).toHaveLength(0);
    expect(plan.AmbientLight).toHaveLength(1);
  });

  test("clusters are stable regardless of input order and capped at sixteen cells", () => {
    const cells = Array.from({ length: 20 }, (_, index) => cell(index, 0));
    const reversed = [...cells].reverse();
    const first = clusterCells(cells, { maxCells: 16 });
    const second = clusterCells(reversed, { maxCells: 16 });
    expect(first.map((cluster) => cluster.map(({ key }) => key))).toEqual(
      second.map((cluster) => cluster.map(({ key }) => key)),
    );
    expect(first.every((cluster) => cluster.length <= 16)).toBe(true);
    expect(first.map((cluster) => cluster.length)).toEqual([16, 4]);
  });

  test("accepts horizontal and vertical hex adjacency supplied by Foundry", () => {
    const sample = [cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1)];
    const horizontalHex = ({ i, j }: { i: number; j: number }) => {
      const oddRow = Math.abs(j) % 2 === 1;
      return [
        { i: i - 1, j },
        { i: i + 1, j },
        { i: i + (oddRow ? 0 : -1), j: j - 1 },
        { i: i + (oddRow ? 1 : 0), j: j - 1 },
        { i: i + (oddRow ? 0 : -1), j: j + 1 },
        { i: i + (oddRow ? 1 : 0), j: j + 1 },
      ];
    };
    const verticalHex = ({ i, j }: { i: number; j: number }) => {
      const oddColumn = Math.abs(i) % 2 === 1;
      return [
        { i, j: j - 1 },
        { i, j: j + 1 },
        { i: i - 1, j: j + (oddColumn ? 0 : -1) },
        { i: i - 1, j: j + (oddColumn ? 1 : 0) },
        { i: i + 1, j: j + (oddColumn ? 0 : -1) },
        { i: i + 1, j: j + (oddColumn ? 1 : 0) },
      ];
    };

    expect(
      clusterCells(sample, { getAdjacentOffsets: horizontalHex }),
    ).toHaveLength(1);
    expect(clusterCells(sample, { getAdjacentOffsets: verticalHex })).toHaveLength(1);
  });

  test("keeps 25, 100, and 300 connected cells clustered instead of per-cell", () => {
    for (const [width, height] of [[5, 5], [10, 10], [15, 20]]) {
      const cells = Array.from({ length: width * height }, (_, index) =>
        cell(index % width, Math.floor(index / width)),
      );
      const clusters = clusterCells(cells, { maxCells: 16 });
      const plan = buildScenePlan({
        bundleId: `bundle-${cells.length}`,
        configurationId: "fire",
        stageIndex: 1,
        cells,
        movementBehavior,
        p2Enabled: true,
        gridSize: 100,
        gridDistance: 5,
      });

      expect(clusters.reduce((total, cluster) => total + cluster.length, 0)).toBe(
        cells.length,
      );
      expect(clusters.every((cluster) => cluster.length <= 16)).toBe(true);
      expect(clusters.length).toBeLessThan(cells.length);
      expect(plan.AmbientLight).toHaveLength(clusters.length);
      expect(plan.AmbientSound).toHaveLength(clusters.length);
      expect(plan.AmbientSound.every(({ radius }) => radius >= 10 && radius <= 60)).toBe(
        true,
      );
      expect(
        plan.AmbientLight.every(({ config }) => config.bright <= config.dim),
      ).toBe(true);
    }
  });
});
