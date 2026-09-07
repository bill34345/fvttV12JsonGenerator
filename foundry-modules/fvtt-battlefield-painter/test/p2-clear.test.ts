import { describe, expect, test } from "bun:test";

import { collectOwnedBundles, ownedDocumentCounts } from "../src/scene-ownership";
import {
  createClearPreview,
  isClearPreviewCurrent,
} from "../src/scene-clear";

const owned = (
  id: string,
  bundleId = "bundle-1",
  role:
    | "terrain-tile"
    | "movement-region"
    | "terrain-light"
    | "terrain-sound"
    | "terrain-wall" = "terrain-tile",
) => ({
  id,
  flags: {
    "fvtt-battlefield-painter": {
      bundleId,
      configurationId: "fire",
      stageIndex: 0,
      role,
      cellKey: `${id}:0`,
    },
  },
});

describe("P2 clear preview", () => {
  test("counts only module-owned documents, including sounds", () => {
    const scene = {
      tiles: [owned("tile-1")],
      regions: [owned("region-1", "bundle-1", "movement-region")],
      lights: [owned("light-1", "bundle-1", "terrain-light")],
      sounds: [owned("sound-1", "bundle-1", "terrain-sound")],
      walls: [owned("wall-1", "bundle-1", "terrain-wall")],
    };
    expect(ownedDocumentCounts(scene)).toEqual({
      bundles: 1,
      tiles: 1,
      regions: 1,
      lights: 1,
      sounds: 1,
      walls: 1,
      totalDocuments: 5,
    });
    expect(collectOwnedBundles(scene).get("bundle-1")?.AmbientSound).toHaveLength(1);
  });

  test("uses an ID fingerprint and rejects a changed scene", () => {
    const scene = { tiles: [owned("tile-1")] };
    const preview = createClearPreview(scene);
    expect(preview.counts.totalDocuments).toBe(1);
    expect(isClearPreviewCurrent(scene, preview)).toBe(true);
    scene.tiles.push(owned("tile-2"));
    expect(isClearPreviewCurrent(scene, preview)).toBe(false);
  });

  test("empty scenes do not require confirmation", () => {
    const preview = createClearPreview({});
    expect(preview.requiresConfirmation).toBe(false);
    expect(preview.counts.totalDocuments).toBe(0);
  });
});
