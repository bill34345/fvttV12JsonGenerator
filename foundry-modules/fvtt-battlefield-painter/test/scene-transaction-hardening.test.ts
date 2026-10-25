import { describe, expect, test } from "bun:test";
import { applyScenePlan } from "../src/scene-transaction";
import type { ScenePlan } from "../src/scene-plan";
import type { PlannedDocumentName } from "../src/constants";

const flag = (role: string) => ({
  "fvtt-battlefield-painter": {
    bundleId: "new-bundle", configurationId: "fire", stageIndex: 0, role,
  },
});

const plan = (tileCount = 1): ScenePlan => ({
  Tile: Array.from({ length: tileCount }, (_, index) => ({
    name: `tile-${index}`, x: index * 100, y: 0, width: 100, height: 100, alpha: 1,
    texture: { src: "texture.webp", tint: "#ffffff" },
    flags: flag("terrain-tile") as ScenePlan["Tile"][number]["flags"],
  })),
  Region: [{ name: "region", shapes: [], behaviors: [], flags: flag("movement-region") as ScenePlan["Region"][number]["flags"] }],
  AmbientLight: [], AmbientSound: [], Wall: [],
});

type Doc = { id: string; flags?: Record<string, unknown> };
const makeScene = () => {
  const collections: Record<PlannedDocumentName, Doc[]> = {
    Tile: [], Region: [], AmbientLight: [], AmbientSound: [], Wall: [],
  };
  const calls: string[] = [];
  let nextId = 0;
  const scene = {
    tiles: collections.Tile, regions: collections.Region, lights: collections.AmbientLight,
    sounds: collections.AmbientSound, walls: collections.Wall,
    createOverride: undefined as undefined | ((name: PlannedDocumentName, sources: Array<Record<string, unknown>>) => Doc[] | Promise<Doc[]>),
    deleteOverride: undefined as undefined | ((name: PlannedDocumentName, ids: string[]) => void | Promise<void>),
    persist(name: PlannedDocumentName, sources: Array<Record<string, unknown>>): Doc[] {
      const docs = sources.map((source) => ({ ...structuredClone(source), id: `${name}-${++nextId}` }));
      collections[name].push(...docs);
      return docs;
    },
    async createEmbeddedDocuments(name: PlannedDocumentName, sources: Array<Record<string, unknown>>) {
      calls.push(`create:${name}`);
      return this.createOverride ? this.createOverride(name, sources) : this.persist(name, sources);
    },
    async deleteEmbeddedDocuments(name: PlannedDocumentName, ids: string[]) {
      calls.push(`delete:${name}:${ids.join(",")}`);
      if (this.deleteOverride) return this.deleteOverride(name, ids);
      collections[name].splice(0, collections[name].length, ...collections[name].filter((doc) => !ids.includes(doc.id)));
    },
  };
  return { scene, collections, calls };
};

describe("scene transaction readback and rollback", () => {
  test("does not accept an empty create result for nonempty sources", async () => {
    const { scene } = makeScene();
    scene.createOverride = (name, sources) => name === "Tile" ? [] : scene.persist(name, sources);
    await expect(applyScenePlan(scene, plan())).rejects.toThrow(/Tile.*expected 1.*returned 0/i);
  });

  test("rolls back only a verified partial return and reports the failure", async () => {
    const { scene, collections, calls } = makeScene();
    scene.createOverride = (name, sources) => name === "Tile" ? scene.persist(name, sources.slice(0, 1)) : scene.persist(name, sources);
    await expect(applyScenePlan(scene, plan(2))).rejects.toThrow(/Tile.*expected 2.*returned 1/i);
    expect(collections.Tile).toHaveLength(0);
    expect(calls).toContain("delete:Tile:Tile-1");
  });

  test("never deletes a foreign returned ID or an unreported new document", async () => {
    const { scene, collections, calls } = makeScene();
    collections.Tile.push({ id: "foreign" });
    scene.createOverride = (name, sources) => {
      if (name !== "Tile") return scene.persist(name, sources);
      scene.persist(name, sources);
      return [{ id: "foreign" }];
    };
    await expect(applyScenePlan(scene, plan())).rejects.toThrow(/Tile.*pre-existing.*unverified new Scene IDs.*Tile:Tile-1/i);
    expect(collections.Tile.map((doc) => doc.id)).toEqual(["foreign", "Tile-1"]);
    expect(calls.some((call) => call.startsWith("delete:Tile"))).toBeFalse();
  });

  test("preserves a new document whose persisted bundle or role does not match the plan", async () => {
    const { scene, collections, calls } = makeScene();
    scene.createOverride = (name, sources) => {
      const docs = scene.persist(name, sources);
      if (name === "Tile") (docs[0]!.flags!["fvtt-battlefield-painter"] as { bundleId: string }).bundleId = "foreign-bundle";
      return docs;
    };
    await expect(applyScenePlan(scene, plan())).rejects.toThrow(/mismatched ownership.*unverified new Scene IDs.*Tile:Tile-1/i);
    expect(collections.Tile).toHaveLength(1);
    expect(calls.some((call) => call.startsWith("delete:Tile"))).toBeFalse();
  });

  test("reports a partially unreported creation without deleting the unknown ID", async () => {
    const { scene, collections } = makeScene();
    scene.createOverride = (name, sources) => {
      const docs = scene.persist(name, sources);
      return name === "Tile" ? docs.slice(0, 1) : docs;
    };
    await expect(applyScenePlan(scene, plan(2))).rejects.toThrow(/unverified new Scene IDs.*Tile:Tile-2/i);
    expect(collections.Tile.map((doc) => doc.id)).toEqual(["Tile-2"]);
  });

  test("final readback catches an unreported Tile added by a later Region create", async () => {
    const { scene, collections } = makeScene();
    scene.createOverride = (name, sources) => {
      const docs = scene.persist(name, sources);
      if (name === "Region") scene.persist("Tile", [plan().Tile[0]! as unknown as Record<string, unknown>]);
      return docs;
    };
    await expect(applyScenePlan(scene, plan())).rejects.toThrow(/final readback.*unverified new Scene IDs.*Tile:Tile-3/i);
    expect(collections.Tile.map((doc) => doc.id)).toEqual(["Tile-3"]);
    expect(collections.Region).toHaveLength(0);
  });

  test("final readback catches an unreported document in a planned-empty collection", async () => {
    const { scene, collections } = makeScene();
    scene.createOverride = (name, sources) => {
      const docs = scene.persist(name, sources);
      if (name === "Region") scene.persist("AmbientSound", [{ flags: flag("terrain-sound") }]);
      return docs;
    };
    await expect(applyScenePlan(scene, plan())).rejects.toThrow(/final readback.*unverified new Scene IDs.*AmbientSound:AmbientSound-3/i);
    expect(collections.AmbientSound).toHaveLength(1);
    expect(collections.Tile).toHaveLength(0);
    expect(collections.Region).toHaveLength(0);
  });

  test("rejects duplicate IDs returned for two planned documents", async () => {
    const { scene } = makeScene();
    scene.createOverride = (name, sources) => {
      if (name !== "Tile") return scene.persist(name, sources);
      const [first] = scene.persist(name, sources);
      return [first!, first!];
    };
    await expect(applyScenePlan(scene, plan(2))).rejects.toThrow(/duplicate.*Tile/i);
  });

  test("reports a deletion veto and the exact owned residual", async () => {
    const { scene, collections } = makeScene();
    scene.createOverride = (name, sources) => {
      if (name === "Region") throw new Error("region create failed");
      return scene.persist(name, sources);
    };
    scene.deleteOverride = () => {}; // Core accepted the delete call but left the document.
    await expect(applyScenePlan(scene, plan())).rejects.toThrow(/residual.*Tile:Tile-1/i);
    expect(collections.Tile).toHaveLength(1);
  });

  test("continues safe rollback after one delete throws and reports both failures", async () => {
    const { scene, collections } = makeScene();
    scene.createOverride = (name, sources) => {
      if (name === "Region") throw new Error("region create failed");
      return scene.persist(name, sources);
    };
    scene.deleteOverride = () => { throw new Error("delete denied"); };
    await expect(applyScenePlan(scene, plan())).rejects.toThrow(/rollback failed: Tile: delete denied.*residual created IDs: Tile:Tile-1/i);
    expect(collections.Tile).toHaveLength(1);
  });
});
