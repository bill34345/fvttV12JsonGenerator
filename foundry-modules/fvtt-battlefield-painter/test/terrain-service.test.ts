import { describe, expect, test } from "bun:test";

import { normalizeCell, type GridCell } from "../src/geometry";
import type { FoundryGridLike } from "../src/grid-adapter";
import type { MovementBehaviorFactory } from "../src/scene-plan";
import { TerrainService } from "../src/terrain-service";

const cells: GridCell[] = [
  normalizeCell({
    key: "0:0",
    offset: { i: 0, j: 0 },
    center: { x: 50, y: 50 },
    vertices: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  }),
  normalizeCell({
    key: "0:1",
    offset: { i: 0, j: 1 },
    center: { x: 150, y: 50 },
    vertices: [
      { x: 100, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
    ],
  }),
];

const grid: FoundryGridLike = {
  size: 100,
  isSquare: true,
  getOffset: (point) => ({ i: Math.floor(point.y / 100), j: Math.floor(point.x / 100) }),
  getCenterPoint: ({ i, j }) => ({ x: j * 100 + 50, y: i * 100 + 50 }),
  getVertices: ({ i, j }) => [
    { x: j * 100, y: i * 100 },
    { x: j * 100 + 100, y: i * 100 },
    { x: j * 100 + 100, y: i * 100 + 100 },
    { x: j * 100, y: i * 100 + 100 },
  ],
};

const movementBehavior: MovementBehaviorFactory = (multiplier) => ({
  type: "modifyMovementCost",
  system: { difficulties: { walk: multiplier } },
});

class FakeScene {
  tiles: Array<Record<string, any>> = [];
  regions: Array<Record<string, any>> = [];
  lights: Array<Record<string, any>> = [];
  sounds: Array<Record<string, any>> = [];
  walls: Array<Record<string, any>> = [];
  failCreateType: string | undefined;
  #nextId = 1;

  async createEmbeddedDocuments(type: string, sources: Array<Record<string, unknown>>) {
    if (this.failCreateType === type) {
      this.failCreateType = undefined;
      throw new Error(`injected ${type} creation failure`);
    }
    const collection = this.#collection(type);
    return sources.map((source) => {
      const document = { ...source, id: `${type}-${this.#nextId++}` };
      collection.push(document);
      return document;
    });
  }

  async deleteEmbeddedDocuments(type: string, ids: string[]) {
    const collection = this.#collection(type);
    const remaining = collection.filter(({ id }) => !ids.includes(id));
    collection.splice(0, collection.length, ...remaining);
    return [];
  }

  #collection(type: string): Array<Record<string, any>> {
    if (type === "Tile") return this.tiles;
    if (type === "Region") return this.regions;
    if (type === "AmbientLight") return this.lights;
    if (type === "AmbientSound") return this.sounds;
    return this.walls;
  }
}

const serviceFor = (
  scene: FakeScene,
  p2Enabled = false,
  visualBleed = 0,
) =>
  new TerrainService({
    scene,
    grid,
    movementBehavior,
    p2Enabled,
    visualBleed,
    createBundleId: (() => {
      let id = 0;
      return () => `bundle-${++id}`;
    })(),
  });

describe("terrain service", () => {
  test("paints a bundled fire terrain stroke", async () => {
    const scene = new FakeScene();
    const result = await serviceFor(scene).paintCells("fire", 0, cells);

    expect(result).toEqual({ createdCells: 2, skippedCells: 0 });
    expect(scene.tiles).toHaveLength(2);
    expect(scene.regions).toHaveLength(1);
    expect(scene.lights).toHaveLength(1);
  });

  test("keeps visual bleed out of Region geometry", async () => {
    const scene = new FakeScene();
    await serviceFor(scene, false, 0.08).paintCells("frost", 0, [cells[0]!]);

    expect(scene.tiles[0]).toMatchObject({
      x: 50,
      y: 50,
      width: 108,
      height: 108,
    });
    expect(scene.regions[0]?.shapes).toEqual([
      {
        type: "polygon",
        points: [0, 0, 100, 0, 100, 100, 0, 100],
        hole: false,
      },
    ]);
  });

  test("erases selected cells and rebuilds the remainder of a bundle", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene);
    await service.paintCells("frost", 0, cells);

    await service.eraseCellKeys(new Set(["0:0"]));

    expect(scene.tiles).toHaveLength(1);
    expect(
      scene.tiles[0]?.flags["fvtt-battlefield-painter"].cellKey,
    ).toBe("0:1");
    expect(scene.regions[0]?.shapes).toHaveLength(1);
  });

  test("advances a whole bramble bundle to its wall-forming stage", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene);
    await service.paintCells("brambles", 0, cells);
    const initialTexture = scene.tiles[0]?.texture.src;

    await service.advanceCellKeys(new Set(["0:1"]));

    expect(
      scene.tiles.every(
        (tile) => tile.flags["fvtt-battlefield-painter"].stageIndex === 1,
      ),
    ).toBe(true);
    expect(scene.tiles.every((tile) => tile.texture.src === initialTexture)).toBe(true);
    expect(scene.walls).toHaveLength(6);
  });

  test("does not stack terrain over already-owned cells", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene);
    await service.paintCells("frost", 0, [cells[0]!]);

    const result = await service.paintCells("fire", 1, cells);

    expect(result).toEqual({ createdCells: 1, skippedCells: 1 });
    expect(scene.tiles).toHaveLength(2);
  });

  test("rebuilds, advances, and clears P2 terrain without creating sounds", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene, true);

    await service.paintCells("fire", 0, cells);
    expect(scene.sounds).toHaveLength(0);
    expect(scene.tiles[0]?.texture.src.endsWith(".webp")).toBe(true);
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect ===
          "fire-field-v1",
      ),
    ).toBe(true);

    await service.advanceCellKeys(new Set(["0:0"]));
    expect(scene.sounds).toHaveLength(0);
    expect(scene.tiles.every((tile) => tile.texture.src.endsWith(".webp"))).toBe(
      true,
    );
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect ===
          "fire-field-v1",
      ),
    ).toBe(true);

    await service.eraseCellKeys(new Set(["0:0"]));
    expect(scene.tiles).toHaveLength(1);
    expect(scene.tiles[0]?.flags["fvtt-battlefield-painter"].visualEffect).toBe(
      "fire-field-v1",
    );
    expect(scene.sounds).toHaveLength(0);

    await service.clearAll();
    expect(scene.tiles).toHaveLength(0);
    expect(scene.regions).toHaveLength(0);
    expect(scene.lights).toHaveLength(0);
    expect(scene.sounds).toHaveLength(0);
    expect(scene.walls).toHaveLength(0);
  });

  test("paints and preserves P2 Square Frost with the thin film marker", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene, true);
    await service.paintCells("frost", 0, cells);

    expect(scene.tiles.every((tile) => tile.alpha === 0.48)).toBe(true);
    expect(
      scene.tiles.every((tile) => tile.texture.src.endsWith("frost-film-v1.webp")),
    ).toBe(true);
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect ===
          "frost-field-v1",
      ),
    ).toBe(true);

    await service.advanceCellKeys(new Set(["0:0"]));
    expect(scene.tiles.every((tile) => tile.alpha === 0.62)).toBe(true);
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect ===
          "frost-field-v1",
      ),
    ).toBe(true);

    await service.eraseCellKeys(new Set(["0:0"]));
    expect(scene.tiles).toHaveLength(1);
    expect(scene.tiles[0]?.flags["fvtt-battlefield-painter"].visualEffect).toBe(
      "frost-field-v1",
    );
  });

  test("keeps P2 Hex Frost on the legacy media path without a runtime marker", async () => {
    const scene = new FakeScene();
    const hexGrid: FoundryGridLike = { ...grid, isSquare: false };
    const service = new TerrainService({
      scene,
      grid: hexGrid,
      movementBehavior,
      p2Enabled: true,
      createBundleId: () => "hex-frost",
    });

    await service.paintCells("frost", 0, [cells[0]!]);
    expect(scene.tiles[0]?.texture.src.endsWith("frost.webm")).toBe(true);
    expect(
      scene.tiles[0]?.flags["fvtt-battlefield-painter"].visualEffect,
    ).toBeUndefined();
  });

  test("preserves a pre-marker static Tile when a later client has P2 enabled", async () => {
    const scene = new FakeScene();
    await serviceFor(scene, false).paintCells("fire", 0, cells);
    expect(scene.tiles.every((tile) => tile.texture.src.endsWith("fire.webp"))).toBe(
      true,
    );
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect === undefined,
      ),
    ).toBe(true);

    await serviceFor(scene, true).advanceCellKeys(new Set(["0:0"]));

    expect(scene.tiles.every((tile) => tile.texture.src.endsWith("fire.webp"))).toBe(
      true,
    );
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect === undefined,
      ),
    ).toBe(true);
  });

  test("preserves an old unmarked animated source during rebuild", async () => {
    const scene = new FakeScene();
    await serviceFor(scene, true).paintCells("fire", 0, cells);
    for (const tile of scene.tiles) {
      delete tile.flags["fvtt-battlefield-painter"].visualEffect;
      tile.texture.src = "modules/fvtt-battlefield-painter/assets/terrain/fire.webm";
    }

    await serviceFor(scene, false).advanceCellKeys(new Set(["0:0"]));

    expect(scene.tiles.every((tile) => tile.texture.src.endsWith("fire.webm"))).toBe(
      true,
    );
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect === undefined,
      ),
    ).toBe(true);
  });

  test("restores the original marked fire bundle after a replacement failure", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene, true);
    await service.paintCells("fire", 0, cells);
    scene.failCreateType = "Region";

    await expect(
      service.advanceCellKeys(new Set(["0:0"])),
    ).rejects.toThrow("injected Region creation failure");

    expect(scene.tiles).toHaveLength(2);
    expect(
      scene.tiles.every(
        (tile) => tile.flags["fvtt-battlefield-painter"].stageIndex === 0,
      ),
    ).toBe(true);
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect ===
          "fire-field-v1",
      ),
    ).toBe(true);
    expect(scene.tiles.every((tile) => tile.texture.src.endsWith("fire.webp"))).toBe(
      true,
    );
  });

  test("restores the original marked Frost bundle after a replacement failure", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene, true);
    await service.paintCells("frost", 0, cells);
    scene.failCreateType = "Region";

    await expect(
      service.advanceCellKeys(new Set(["0:0"])),
    ).rejects.toThrow("injected Region creation failure");

    expect(scene.tiles).toHaveLength(2);
    expect(
      scene.tiles.every(
        (tile) => tile.flags["fvtt-battlefield-painter"].stageIndex === 0,
      ),
    ).toBe(true);
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect ===
          "frost-field-v1",
      ),
    ).toBe(true);
    expect(
      scene.tiles.every((tile) => tile.texture.src.endsWith("frost-film-v1.webp")),
    ).toBe(true);
  });
});
