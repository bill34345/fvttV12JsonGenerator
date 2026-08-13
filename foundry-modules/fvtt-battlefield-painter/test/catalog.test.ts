import { describe, expect, test } from "bun:test";

import { TERRAIN_CONFIGURATIONS } from "../src/catalog";

describe("terrain catalog", () => {
  test("contains only the three authorized P0 configurations", () => {
    expect(Object.keys(TERRAIN_CONFIGURATIONS)).toEqual([
      "fire",
      "frost",
      "brambles",
    ]);
  });

  test("every configuration has two stages and module-local original art", () => {
    for (const configuration of Object.values(TERRAIN_CONFIGURATIONS)) {
      expect(configuration.stages).toHaveLength(2);
      expect(configuration.movementMultiplier).toBeGreaterThanOrEqual(1);

      for (const stage of configuration.stages) {
        expect(stage.texture).toStartWith(
          "modules/fvtt-battlefield-painter/assets/terrain/",
        );
        expect(stage.texture).toEndWith(".webp");
      }
    }
  });

  test("only fire emits light and only mature brambles create walls", () => {
    expect(TERRAIN_CONFIGURATIONS.fire.stages.every((stage) => stage.light)).toBe(
      true,
    );
    expect(TERRAIN_CONFIGURATIONS.frost.stages.every((stage) => !stage.light)).toBe(
      true,
    );
    expect(TERRAIN_CONFIGURATIONS.brambles.stages[0]?.createsWalls).toBe(false);
    expect(TERRAIN_CONFIGURATIONS.brambles.stages[1]?.createsWalls).toBe(true);
  });
});
