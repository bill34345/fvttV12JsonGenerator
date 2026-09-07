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

  test("every configuration has two logical stages and fire maps Style B/A to I/II", () => {
    const expected = {
      fire: "modules/fvtt-battlefield-painter/assets/terrain/fire",
      frost: "modules/fvtt-battlefield-painter/assets/terrain/frost",
      brambles: "modules/fvtt-battlefield-painter/assets/terrain/brambles",
    } as const;

    for (const configuration of Object.values(TERRAIN_CONFIGURATIONS)) {
      expect(configuration.stages).toHaveLength(2);
      expect(configuration.movementMultiplier).toBeGreaterThanOrEqual(1);
      const base = expected[configuration.id];

      for (const stage of configuration.stages) {
        expect(stage.texture).toBe(`${base}.webp`);
        expect(stage.media.staticTexture).toBe(`${base}.webp`);
        expect(stage.media.animatedTexture).toBe(`${base}.webm`);
      }
      if (configuration.id === "fire") {
        expect(configuration.stages[0]?.media.fieldTexture).toBe(
          `${base}-stage-i.webm`,
        );
        expect(configuration.stages[1]?.media.fieldTexture).toBe(
          `${base}-stage-ii.webm`,
        );
      } else if (configuration.id === "frost") {
        expect(configuration.stages[0]?.media.effectBaseTexture).toBe(
          `${base}-film-v1.webp`,
        );
        expect(configuration.stages[0]?.media.fieldTexture).toBeUndefined();
        expect(configuration.stages[1]?.media.effectBaseTexture).toBe(
          `${base}-film-v1.webp`,
        );
        expect(configuration.stages[1]?.media.fieldTexture).toBe(
          `${base}-mist-v1.webm`,
        );
      } else {
        expect(configuration.stages[0]?.media).toEqual(
          configuration.stages[1]?.media,
        );
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
