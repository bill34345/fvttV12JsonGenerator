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

function ownedTile(cellKey: string) {
  return {
    texture: { src: `modules/fvtt-battlefield-painter/${cellKey}.webp` },
    flags: {
      "fvtt-battlefield-painter": {
        bundleId: `bundle-${cellKey}`,
        cellKey,
        configurationId: "fire",
        stageIndex: 0,
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

  test("snapshots AmbientSound documents with the rest of a bundle", async () => {
    const scene = new FakeScene();
    const history = new SceneHistory(scene);
    await history.execute("sound", async () => {
      await scene.createEmbeddedDocuments("AmbientSound", [ownedSound()]);
    });
    expect(scene.sounds).toHaveLength(1);
    await history.undo();
    expect(scene.sounds).toHaveLength(0);
    await history.redo();
    expect(scene.sounds).toHaveLength(1);
  });
});
