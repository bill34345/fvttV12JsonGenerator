import { describe, expect, test } from "bun:test";

import { applyScenePlan } from "../src/scene-transaction";
import type { ScenePlan } from "../src/scene-plan";

const plan = (): ScenePlan => ({
  Tile: [
    {
      name: "tile",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      alpha: 1,
      texture: { src: "texture.webp", tint: "#ffffff" },
      flags: {
        "fvtt-battlefield-painter": {
          bundleId: "bundle-1",
          configurationId: "fire",
          stageIndex: 0,
          cellKey: "0:0",
          offset: { i: 0, j: 0 },
          role: "terrain-tile",
        },
      },
    },
  ],
  Region: [
    {
      name: "region",
      shapes: [],
      behaviors: [],
      flags: {
        "fvtt-battlefield-painter": {
          bundleId: "bundle-1",
          configurationId: "fire",
          stageIndex: 0,
          role: "movement-region",
        },
      },
    },
  ],
  AmbientLight: [],
  Wall: [],
});

describe("scene transaction", () => {
  test("creates embedded documents in deterministic order", async () => {
    const calls: string[] = [];
    const scene = {
      async createEmbeddedDocuments(type: string) {
        calls.push(`create:${type}`);
        return [{ id: `${type.toLowerCase()}-1` }];
      },
      async deleteEmbeddedDocuments(type: string) {
        calls.push(`delete:${type}`);
        return [];
      },
    };

    await expect(applyScenePlan(scene, plan())).resolves.toEqual({
      Tile: ["tile-1"],
      Region: ["region-1"],
      AmbientLight: [],
      Wall: [],
    });
    expect(calls).toEqual(["create:Tile", "create:Region"]);
  });

  test("rolls back already-created documents in reverse order", async () => {
    const calls: string[] = [];
    const scene = {
      async createEmbeddedDocuments(type: string) {
        calls.push(`create:${type}`);
        if (type === "Region") throw new Error("invalid region source");
        return [{ id: "tile-1" }];
      },
      async deleteEmbeddedDocuments(type: string, ids: string[]) {
        calls.push(`delete:${type}:${ids.join(",")}`);
        return [];
      },
    };

    await expect(applyScenePlan(scene, plan())).rejects.toThrow(
      "Terrain transaction failed while creating Region",
    );
    expect(calls).toEqual([
      "create:Tile",
      "create:Region",
      "delete:Tile:tile-1",
    ]);
  });
});
