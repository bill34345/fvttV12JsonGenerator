import { ADDITIONAL_TERRAINS } from "../src/catalog-additions";
import { describe, expect, test } from "bun:test";

import { TERRAIN_CONFIGURATIONS } from "../src/catalog";

describe("terrain catalog", () => {
  test("contains the ten approved effects and all remaining 26 configurations", () => {
    expect(Object.keys(TERRAIN_CONFIGURATIONS)).toEqual([
      "fire",
      "frost",
      "brambles",
      "acid",
      "flooding",
      "lava",
      "blood",
      "spiderweb",
      "rubble",
      "wood",
      ...Object.keys(ADDITIONAL_TERRAINS),
    ]);
  });

  test("keeps existing stage counts and permits the single-stage spiderweb", () => {
    const expected = {
      wood: "modules/fvtt-battlefield-painter/assets/terrain/wood",
      rubble: "modules/fvtt-battlefield-painter/assets/terrain/rubble",
      spiderweb: "modules/fvtt-battlefield-painter/assets/terrain/spiderweb",
      blood: "modules/fvtt-battlefield-painter/assets/terrain/blood",
      lava: "modules/fvtt-battlefield-painter/assets/terrain/lava",
      flooding: "modules/fvtt-battlefield-painter/assets/terrain/flooding",
      acid: "modules/fvtt-battlefield-painter/assets/terrain/acid",
      fire: "modules/fvtt-battlefield-painter/assets/terrain/fire",
      frost: "modules/fvtt-battlefield-painter/assets/terrain/frost",
      brambles: "modules/fvtt-battlefield-painter/assets/terrain/brambles",
    } as const;

    for (const configuration of Object.values(TERRAIN_CONFIGURATIONS)) {
      if (configuration.placement) continue;
      expect(configuration.stages).toHaveLength((configuration.id === "spiderweb" || configuration.id === "rubble" || configuration.id === "wood") ? 1 : configuration.id === "brambles" ? 3 : 2);
      expect(configuration.movementMultiplier).toBeGreaterThanOrEqual(1);
      const base = expected[configuration.id as keyof typeof expected];

      for (const [index, stage] of configuration.stages.entries()) {
        const bramble = configuration.id === "brambles";
        const acid = configuration.id === "acid" || configuration.id === "flooding" || configuration.id === "lava" || configuration.id === "blood";
        const still = (configuration.id === "spiderweb" || configuration.id === "rubble" || configuration.id === "wood") ? `${base}-native-a.png` : acid ? `${base}-native-stage-${index === 0 ? "i" : "ii"}.png` : bramble && index === 2 ? "modules/fvtt-battlefield-painter/assets/terrain/brambles-native-roots.png" : bramble ? `${base}-stage-${index === 0 ? "i" : "ii"}.webp` : `${base}.webp`;
        expect(stage.texture).toBe(still);
        expect(stage.media.staticTexture).toBe(still);
        expect(stage.media.animatedTexture).toBe(bramble || acid || (configuration.id === "spiderweb" || configuration.id === "rubble" || configuration.id === "wood") ? still : `${base}.webm`);
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
        expect(configuration.stages[0]?.media).not.toEqual(
          configuration.stages[1]?.media,
        );
      }
    }
  });

  test("fire and mature lava emit catalog light and only mature brambles create walls", () => {
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
