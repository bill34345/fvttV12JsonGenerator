import { describe, expect, test } from "bun:test";

import {
  collectOwnedBundles,
  deleteOwnedBundles,
} from "../src/scene-ownership";

const flag = (
  bundleId: string,
  role: "terrain-tile" | "movement-region" | "terrain-sound",
  cellKey?: string,
) => ({
  bundleId,
  configurationId: "frost" as const,
  stageIndex: 0,
  role,
  ...(cellKey ? { cellKey, offset: { i: 0, j: 0 } } : {}),
});

describe("scene ownership", () => {
  test("indexes only module-owned terrain bundles", () => {
    const scene = {
      tiles: [
        {
          id: "tile-1",
          flags: { "fvtt-battlefield-painter": flag("bundle-1", "terrain-tile", "0:0") },
        },
        { id: "foreign", flags: { anotherModule: { bundleId: "nope" } } },
      ],
      regions: [
        {
          id: "region-1",
          flags: { "fvtt-battlefield-painter": flag("bundle-1", "movement-region") },
        },
      ],
      lights: [
        {
          id: "invalid-role",
          flags: {
            "fvtt-battlefield-painter": {
              ...flag("foreign-bundle", "terrain-tile"),
              role: "not-a-terrain-role",
            },
          },
        },
        {
          id: "wrong-document-role",
          flags: {
            "fvtt-battlefield-painter": flag("foreign-bundle", "terrain-tile"),
          },
        },
      ],
      walls: [],
    };

    const bundles = collectOwnedBundles(scene);
    expect([...bundles.keys()]).toEqual(["bundle-1"]);
    expect(bundles.get("bundle-1")?.Tile.map(({ id }) => id)).toEqual(["tile-1"]);
    expect(bundles.get("bundle-1")?.Region.map(({ id }) => id)).toEqual([
      "region-1",
    ]);
  });

  test("deletes complete bundles in reverse dependency order", async () => {
    const calls: string[] = [];
    const scene = {
      tiles: [
        {
          id: "tile-1",
          flags: { "fvtt-battlefield-painter": flag("bundle-1", "terrain-tile", "0:0") },
        },
      ],
      regions: [
        {
          id: "region-1",
          flags: { "fvtt-battlefield-painter": flag("bundle-1", "movement-region") },
        },
      ],
      sounds: [
        {
          id: "sound-1",
          flags: {
            "fvtt-battlefield-painter": flag("bundle-1", "terrain-sound"),
          },
        },
      ],
      lights: [],
      walls: [],
      async deleteEmbeddedDocuments(type: string, ids: string[]) {
        calls.push(`${type}:${ids.join(",")}`);
        return [];
      },
    };

    await deleteOwnedBundles(scene, new Set(["bundle-1"]));
    expect(calls).toEqual([
      "AmbientSound:sound-1",
      "Region:region-1",
      "Tile:tile-1",
    ]);
  });
});
