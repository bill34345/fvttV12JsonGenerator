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
  test("exposes canonical media plus independent Fire and Frost field media", () => {
    const staticTextures = new Set<string>();
    const animatedTextures = new Set<string>();
    const fieldTextures = new Set<string>();
    for (const configuration of Object.values(TERRAIN_CONFIGURATIONS)) {
      if (configuration.placement) continue;
      for (const stage of configuration.stages) {
        expect(/\.(webp|png)$/.test(stage.media.staticTexture)).toBe(true);
        expect(/\.(webm|webp|png)$/.test(stage.media.animatedTexture)).toBe(true);
        staticTextures.add(stage.media.staticTexture);
        animatedTextures.add(stage.media.animatedTexture);
        if (stage.media.fieldTexture) fieldTextures.add(stage.media.fieldTexture);
      }
      if (configuration.id === "brambles") {
        expect(configuration.stages[0]?.media).not.toEqual(
          configuration.stages[1]?.media,
        );
      }
    }
    expect([...staticTextures].sort()).toEqual([
      "modules/fvtt-battlefield-painter/assets/terrain/acid-native-stage-i.png",
      "modules/fvtt-battlefield-painter/assets/terrain/acid-native-stage-ii.png",
      "modules/fvtt-battlefield-painter/assets/terrain/blood-native-stage-i.png",
      "modules/fvtt-battlefield-painter/assets/terrain/blood-native-stage-ii.png",
      "modules/fvtt-battlefield-painter/assets/terrain/brambles-native-roots.png",
      "modules/fvtt-battlefield-painter/assets/terrain/brambles-stage-i.webp",
      "modules/fvtt-battlefield-painter/assets/terrain/brambles-stage-ii.webp",
      "modules/fvtt-battlefield-painter/assets/terrain/fire.webp",
      "modules/fvtt-battlefield-painter/assets/terrain/flooding-native-stage-i.png",
      "modules/fvtt-battlefield-painter/assets/terrain/flooding-native-stage-ii.png",
      "modules/fvtt-battlefield-painter/assets/terrain/frost.webp",
      "modules/fvtt-battlefield-painter/assets/terrain/lava-native-stage-i.png",
      "modules/fvtt-battlefield-painter/assets/terrain/lava-native-stage-ii.png",
      "modules/fvtt-battlefield-painter/assets/terrain/rubble-native-a.png",
      "modules/fvtt-battlefield-painter/assets/terrain/spiderweb-native-a.png",
      "modules/fvtt-battlefield-painter/assets/terrain/wood-native-a.png",
    ]);
    expect([...animatedTextures].sort()).toEqual([
      "modules/fvtt-battlefield-painter/assets/terrain/acid-native-stage-i.png",
      "modules/fvtt-battlefield-painter/assets/terrain/acid-native-stage-ii.png",
      "modules/fvtt-battlefield-painter/assets/terrain/blood-native-stage-i.png",
      "modules/fvtt-battlefield-painter/assets/terrain/blood-native-stage-ii.png",
      "modules/fvtt-battlefield-painter/assets/terrain/brambles-native-roots.png",
      "modules/fvtt-battlefield-painter/assets/terrain/brambles-stage-i.webp",
      "modules/fvtt-battlefield-painter/assets/terrain/brambles-stage-ii.webp",
      "modules/fvtt-battlefield-painter/assets/terrain/fire.webm",
      "modules/fvtt-battlefield-painter/assets/terrain/flooding-native-stage-i.png",
      "modules/fvtt-battlefield-painter/assets/terrain/flooding-native-stage-ii.png",
      "modules/fvtt-battlefield-painter/assets/terrain/frost.webm",
      "modules/fvtt-battlefield-painter/assets/terrain/lava-native-stage-i.png",
      "modules/fvtt-battlefield-painter/assets/terrain/lava-native-stage-ii.png",
      "modules/fvtt-battlefield-painter/assets/terrain/rubble-native-a.png",
      "modules/fvtt-battlefield-painter/assets/terrain/spiderweb-native-a.png",
      "modules/fvtt-battlefield-painter/assets/terrain/wood-native-a.png",
    ]);
    expect([...fieldTextures].sort()).toEqual([
      "modules/fvtt-battlefield-painter/assets/terrain/fire-stage-i.webm",
      "modules/fvtt-battlefield-painter/assets/terrain/fire-stage-ii.webm",
      "modules/fvtt-battlefield-painter/assets/terrain/frost-mist-v1.webm",
    ]);
    expect(TERRAIN_CONFIGURATIONS.fire.stages[0]?.media.fieldTexture).toContain(
      "fire-stage-i.webm",
    );
    expect(TERRAIN_CONFIGURATIONS.fire.stages[1]?.media.fieldTexture).toContain(
      "fire-stage-ii.webm",
    );
    expect(TERRAIN_CONFIGURATIONS.frost.stages[0]?.media.fieldTexture).toBeUndefined();
    expect(TERRAIN_CONFIGURATIONS.frost.stages[1]?.media.fieldTexture).toContain(
      "frost-mist-v1.webm",
    );
  });

  test("P2 fire uses a static base plus an independent field marker", () => {
    const cells = Array.from({ length: 20 }, (_, index) => cell(index, 0));
    const plan = buildScenePlan({
      bundleId: "bundle-p2",
      configurationId: "fire",
      stageIndex: 1,
      cells,
      movementBehavior,
      p2Enabled: true,
      visualEffect: "fire-field-v1",
    });

    expect(plan.Tile[0]?.texture.src.endsWith(".webp")).toBe(true);
    expect(plan.Tile[0]?.alpha).toBe(0);
    expect(plan.Tile.every((tile) => tile.flags["fvtt-battlefield-painter"].visualEffect === "fire-field-v1")).toBe(true);
    expect(plan.AmbientSound).toHaveLength(0);
    expect(plan.AmbientLight).toHaveLength(2);
  });

  test("P0 fire remains static and does not persist the runtime effect marker", () => {
    const plan = buildScenePlan({
      bundleId: "bundle-p0-fire",
      configurationId: "fire",
      stageIndex: 0,
      cells: [cell(0, 0)],
      movementBehavior,
      p2Enabled: false,
    });

    expect(plan.Tile[0]?.texture.src).toBe(
      "modules/fvtt-battlefield-painter/assets/terrain/fire.webp",
    );
    expect(
      plan.Tile[0]?.flags["fvtt-battlefield-painter"].visualEffect,
    ).toBeUndefined();
  });

  test("uses the current marker-free media and preserves an explicit legacy texture", () => {
    for (const configurationId of ["frost", "brambles"] as const) {
      const plan = buildScenePlan({
        bundleId: `bundle-${configurationId}`,
        configurationId,
        stageIndex: 0,
        cells: [cell(0, 0)],
        movementBehavior,
        p2Enabled: true,
      });
      expect(plan.Tile[0]?.texture.src).toBe(
        configurationId === "brambles"
          ? "modules/fvtt-battlefield-painter/assets/terrain/brambles-stage-i.webp"
          : "modules/fvtt-battlefield-painter/assets/terrain/frost.webm",
      );
      expect(plan.Tile[0]?.flags["fvtt-battlefield-painter"].visualEffect).toBeUndefined();
      const legacy = `modules/fvtt-battlefield-painter/assets/terrain/${configurationId}.webm`;
      const restored = buildScenePlan({
        bundleId: `legacy-${configurationId}`, configurationId, stageIndex: 0,
        cells: [cell(0, 0)], movementBehavior, p2Enabled: true, legacyTexture: legacy,
      });
      expect(restored.Tile[0]?.texture.src).toBe(legacy);
    }
  });

  test("keeps every terrain and stage free of new AmbientSound documents", () => {
    for (const configuration of Object.values(TERRAIN_CONFIGURATIONS)) {
      if (configuration.placement) continue;
      for (const [stageIndex] of configuration.stages.entries()) {
        const plan = buildScenePlan({
          bundleId: `${configuration.id}-${stageIndex}`,
          configurationId: configuration.id,
          stageIndex,
          cells: [cell(0, 0)],
          movementBehavior,
          p2Enabled: true,
        });
        expect(plan.AmbientSound).toEqual([]);
      }
    }
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
    const dimensions: Array<[number, number]> = [[5, 5], [10, 10], [15, 20]];
    for (const [width, height] of dimensions) {
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
      expect(plan.AmbientSound).toHaveLength(0);
      expect(
        plan.AmbientLight.every(({ config }) => config.bright <= config.dim),
      ).toBe(true);
    }
  });
});
