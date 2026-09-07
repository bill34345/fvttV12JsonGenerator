import { describe, expect, test } from "bun:test";

import { createMovementBehaviorFactory } from "../src/movement";

describe("modifyMovementCost behavior factory", () => {
  test("derives supported action keys from the live Foundry configuration", () => {
    const constructed: unknown[] = [];
    class MovementCostModel {
      constructor(source: unknown) {
        constructed.push(source);
      }

      validate() {
        return true;
      }

      toObject() {
        return constructed.at(-1) as Record<string, unknown>;
      }
    }

    const factory = createMovementBehaviorFactory({
      RegionBehavior: {
        dataModels: { modifyMovementCost: MovementCostModel },
      },
      Token: {
        movement: {
          actions: {
            walk: {},
            fly: { deriveTerrainDifficulty: () => 1 },
            burrow: {},
          },
        },
      },
    });

    expect(factory(2).system).toEqual({
      difficulties: { walk: 2, burrow: 2 },
    });
  });

  test("fails closed when the core Region behavior is unavailable", () => {
    expect(() =>
      createMovementBehaviorFactory({
        RegionBehavior: { dataModels: {} },
        Token: { movement: { actions: { walk: {} } } },
      }),
    ).toThrow("modifyMovementCost");
  });

  test("fails closed if no configurable movement action exists", () => {
    class MovementCostModel {}

    expect(() =>
      createMovementBehaviorFactory({
        RegionBehavior: {
          dataModels: { modifyMovementCost: MovementCostModel },
        },
        Token: {
          movement: {
            actions: { fly: { deriveTerrainDifficulty: () => 1 } },
          },
        },
      }),
    ).toThrow("movement action");
  });
});
