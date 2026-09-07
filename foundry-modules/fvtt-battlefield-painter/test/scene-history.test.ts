import { describe, expect, test } from "bun:test";

import { SceneHistory, type HistorySceneLike } from "../src/scene-history";

class FakeScene implements HistorySceneLike {
  tiles: Record<string, unknown>[] = [];
  regions: Record<string, unknown>[] = [];
  lights: Record<string, unknown>[] = [];
  sounds: Record<string, unknown>[] = [];
  walls: Record<string, unknown>[] = [];
  #nextId = 1;

  async createEmbeddedDocuments(name: string, data: Record<string, unknown>[]) {
    const collection = this.#collection(name);
    for (const source of data) {
      collection.push({ ...structuredClone(source), _id: `doc-${this.#nextId++}` });
    }
    return data;
  }

  async deleteEmbeddedDocuments(name: string, ids: string[]) {
    const collection = this.#collection(name);
    const survivors = collection.filter((doc) => !ids.includes(String(doc._id)));
    collection.splice(0, collection.length, ...survivors);
    return ids;
  }

  #collection(name: string) {
    if (name === "Tile") return this.tiles;
    if (name === "Region") return this.regions;
    if (name === "AmbientLight") return this.lights;
    if (name === "AmbientSound") return this.sounds;
    if (name === "Wall") return this.walls;
    throw new Error(`Unknown collection ${name}`);
  }
}

function ownedTile(
  cellKey: string,
  visualEffect?: "fire-field-v1" | "frost-field-v1",
) {
  return {
    texture: { src: `modules/fvtt-battlefield-painter/${cellKey}.webp` },
    flags: {
      "fvtt-battlefield-painter": {
        bundleId: `bundle-${cellKey}`,
        cellKey,
        configurationId:
          visualEffect === "frost-field-v1" ? "frost" : "fire",
        stageIndex: 0,
        ...(visualEffect ? { visualEffect } : {}),
        role: "terrain-tile",
      },
    },
  };
}

function ownedSound() {
  return {
    path: "modules/fvtt-battlefield-painter/assets/audio/fire.ogg",
    flags: {
      "fvtt-battlefield-painter": {
        bundleId: "bundle-sound",
        configurationId: "fire",
        stageIndex: 0,
        role: "terrain-sound",
      },
    },
  };
}

describe("SceneHistory", () => {
  test("undoes and redoes only module-owned scene documents", async () => {
    const scene = new FakeScene();
    scene.tiles.push({ _id: "foreign", name: "Keep me" });
    const history = new SceneHistory(scene);

    await history.execute("paint", async () => {
      await scene.createEmbeddedDocuments("Tile", [ownedTile("0:0")]);
    });
    expect(history.state).toEqual({ canUndo: true, canRedo: false });
    expect(scene.tiles).toHaveLength(2);

    await history.undo();
    expect(scene.tiles).toEqual([{ _id: "foreign", name: "Keep me" }]);
    expect(history.state).toEqual({ canUndo: false, canRedo: true });

    await history.redo();
    expect(scene.tiles).toHaveLength(2);
    expect(scene.tiles[0]).toEqual({ _id: "foreign", name: "Keep me" });
    expect(history.state).toEqual({ canUndo: true, canRedo: false });
  });

  test("does not record no-op mutations", async () => {
    const history = new SceneHistory(new FakeScene());
    await history.execute("nothing", async () => undefined);
    expect(history.state).toEqual({ canUndo: false, canRedo: false });
  });

  test("clears redo after a new mutation", async () => {
    const scene = new FakeScene();
    const history = new SceneHistory(scene);
    await history.execute("first", async () => {
      await scene.createEmbeddedDocuments("Tile", [ownedTile("0:0")]);
    });
    await history.undo();
    await history.execute("second", async () => {
      await scene.createEmbeddedDocuments("Tile", [ownedTile("1:1")]);
    });
    expect(history.state).toEqual({ canUndo: true, canRedo: false });
  });

  test("preserves the fire effect marker through undo and redo", async () => {
    const scene = new FakeScene();
    const history = new SceneHistory(scene);

    await history.execute("fire", async () => {
      await scene.createEmbeddedDocuments("Tile", [
        ownedTile("0:0", "fire-field-v1"),
      ]);
    });
    await history.undo();
    await history.redo();

    const flags = scene.tiles[0]?.flags as
      | Record<string, Record<string, unknown>>
      | undefined;
    expect(flags?.["fvtt-battlefield-painter"]).toMatchObject({
      visualEffect: "fire-field-v1",
    });
  });

  test("preserves the Frost effect marker through undo and redo", async () => {
    const scene = new FakeScene();
    const history = new SceneHistory(scene);

    await history.execute("frost", async () => {
      await scene.createEmbeddedDocuments("Tile", [
        ownedTile("0:0", "frost-field-v1"),
      ]);
    });
    await history.undo();
    await history.redo();

    const flags = scene.tiles[0]?.flags as
      | Record<string, Record<string, unknown>>
      | undefined;
    expect(flags?.["fvtt-battlefield-painter"]).toMatchObject({
      configurationId: "frost",
      visualEffect: "frost-field-v1",
    });
  });

  test("preserves legacy AmbientSound documents outside undo and redo history", async () => {
    const scene = new FakeScene();
    scene.sounds.push({ _id: "legacy-sound", ...ownedSound() });
    const history = new SceneHistory(scene);
    await history.execute("tile", async () => {
      await scene.createEmbeddedDocuments("Tile", [ownedTile("0:0")]);
    });
    expect(scene.sounds).toHaveLength(1);
    await history.undo();
    // The legacy sound must not be deleted by history restoration.
    expect(scene.sounds).toHaveLength(1);
    await history.redo();
    expect(scene.sounds).toHaveLength(1);
  });
});
