import { describe, expect, test } from "bun:test";

import { normalizeCell, type GridCell } from "../src/geometry";
import type { FoundryGridLike } from "../src/grid-adapter";
import { buildScenePlan, type MovementBehaviorFactory } from "../src/scene-plan";
import { applyScenePlan } from "../src/scene-transaction";
import { SceneHistory } from "../src/scene-history";
import { TerrainService } from "../src/terrain-service";
import { ADDITIONAL_TERRAINS } from "../src/catalog-additions";

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
  failDeleteType: string | undefined;
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
    if (this.failDeleteType === type) {
      this.failDeleteType = undefined;
      throw new Error(`injected ${type} deletion failure`);
    }
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

let nextTestBundleId = 0;
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
    createBundleId: () => `bundle-${++nextTestBundleId}`,
  });

describe("terrain service", () => {
  test.each([false, true])("new paints always use the approved art paths with P2=%s", async (p2) => {
    for (const configurationId of ["fire", "frost", "brambles"] as const) {
      const scene=new FakeScene(),service=serviceFor(scene,p2);
      await service.paintCells(configurationId,0,cells);
      for (const tile of scene.tiles) {
        expect(tile.flags["fvtt-battlefield-painter"].visualEffect).toBe(`${configurationId}-static-v2`);
        expect(tile.texture.src).toContain(`${configurationId}-native-`);
      }
      if (configurationId==="brambles") {
        const before=scene.tiles.map(t=>({key:t.flags["fvtt-battlefield-painter"].cellKey,rotation:t.rotation,sort:t.sort}));
        await service.advanceCellKeys(new Set(["0:0"]));
        expect(scene.walls).toHaveLength(4);
        for (const tile of scene.tiles) {
          const old=before.find(t=>t.key===tile.flags["fvtt-battlefield-painter"].cellKey)!;
          expect({rotation:tile.rotation,sort:tile.sort}).toEqual({rotation:old.rotation,sort:old.sort});
          expect(tile.texture.src).toEndWith(tile.flags["fvtt-battlefield-painter"].cellKey==="0:0"?"brambles-native-stage-ii.png":"brambles-native-stage-i.png");
        }
        await service.eraseCellKeys(new Set(["0:0"]));
        expect(scene.tiles).toHaveLength(1);
        expect(scene.walls).toHaveLength(0);
      }
    }
  });
  test.each(["create", "delete"])("restores all hit bundles after a %s failure and preserves foreign tiles", async (failure) => {
    const scene = new FakeScene();
    const foreign = { id: "foreign", name: "untouched" };
    scene.tiles.push(foreign);
    const service = serviceFor(scene, true);
    await service.paintCells("fire", 0, [cells[0]!]);
    await service.paintCells("fire", 0, [cells[1]!]);
    if (failure === "create") scene.failCreateType = "Region";
    else scene.failDeleteType = "Region";
    await expect(service.advanceCellKeys(new Set(["0:0", "0:1"]))).rejects.toThrow("injected Region");
    expect(scene.tiles[0]).toBe(foreign);
    const owned = scene.tiles.filter(tile => tile !== foreign);
    expect(owned).toHaveLength(2);
    expect(owned.map(tile => tile.flags['fvtt-battlefield-painter'].stageIndex)).toEqual([0, 0]);
    expect(new Set(owned.map(tile => tile.flags['fvtt-battlefield-painter'].bundleId)).size).toBe(2);
    expect(scene.regions).toHaveLength(2);
    expect(scene.lights).toHaveLength(2);
  });

  test("prevalidates every hit bundle before deleting any documents", async () => {
    const scene = new FakeScene();
    const setup = serviceFor(scene);
    await setup.paintCells("brambles", 0, [cells[0]!]);
    await setup.paintCells("brambles", 0, [cells[1]!]);
    const originalTiles = [...scene.tiles];
    let calls = 0;
    const service = new TerrainService({scene, grid, movementBehavior: multiplier => {
      if (++calls === 4) throw new Error("second replacement validation failure");
      return movementBehavior(multiplier);
    }});
    await expect(service.advanceCellKeys(new Set(["0:0", "0:1"]))).rejects.toThrow("validation failure");
    expect(scene.tiles).toEqual(originalTiles);
    expect(scene.tiles[0]).toBe(originalTiles[0]);
    expect(scene.walls).toHaveLength(0);
  });

  test("paints a bundled fire terrain stroke", async () => {
    const scene = new FakeScene();
    const result = await serviceFor(scene).paintCells("fire", 0, cells);

    expect(result).toEqual({ createdCells: 2, skippedCells: 0 });
    expect(scene.tiles).toHaveLength(2);
    expect(scene.regions).toHaveLength(1);
    expect(scene.lights).toHaveLength(2);
  });

  test("does not report painted cells when Core returns no persisted Tiles", async () => {
    const scene = new FakeScene();
    const create = scene.createEmbeddedDocuments.bind(scene);
    scene.createEmbeddedDocuments = async (type, sources) => type === "Tile" ? [] : create(type, sources);
    await expect(serviceFor(scene).paintCells("fire", 0, [cells[0]!])).rejects.toThrow(/Tile.*expected 1.*returned 0/i);
    expect(scene.tiles).toHaveLength(0);
    expect(scene.regions).toHaveLength(0);
  });

  test("keeps visual bleed out of Region geometry", async () => {
    const scene = new FakeScene();
    await serviceFor(scene, false, 0.08).paintCells("brambles", 0, [cells[0]!]);

    expect(scene.tiles[0]).toMatchObject({
      x: 50,
      y: 50,
      width: 135,
      height: 135,
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

    expect(scene.tiles).toHaveLength(2);
    expect(scene.tiles.every(t => t.flags['fvtt-battlefield-painter'].cellKey === '0:1')).toBe(true);
    expect(scene.lights).toHaveLength(1);
    expect(
      scene.tiles[0]?.flags["fvtt-battlefield-painter"].cellKey,
    ).toBe("0:1");
    expect(scene.regions[0]?.shapes).toHaveLength(1);
  });

  test("advances only selected bramble cells and puts walls around that selection", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene);
    await service.paintCells("brambles", 0, cells);
    const initialTexture = scene.tiles[0]?.texture.src;

    await service.advanceCellKeys(new Set(["0:1"]));

    const stages = Object.fromEntries(scene.tiles.map(tile => {
      const flag = tile.flags["fvtt-battlefield-painter"];
      return [flag.cellKey, flag.stageIndex];
    }));
    expect(stages).toEqual({ "0:0": 0, "0:1": 1 });
    const untouched = scene.tiles.find(tile => tile.flags["fvtt-battlefield-painter"].cellKey === "0:0");
    const advanced = scene.tiles.find(tile => tile.flags["fvtt-battlefield-painter"].cellKey === "0:1");
    expect(untouched?.texture.src).toBe(initialTexture);
    expect(advanced?.texture.src).toEndWith("/brambles-native-stage-ii.png");
    expect(scene.walls).toHaveLength(4);
    expect(scene.walls.every(wall => wall.c[0] >= 100 && wall.c[2] >= 100)).toBe(true);
    expect(scene.regions).toHaveLength(2);
    await service.advanceCellKeys(new Set(["0:1"]));
    expect(scene.tiles.find(tile => tile.flags["fvtt-battlefield-painter"].cellKey === "0:1")!.texture.src).toEndWith("brambles-native-roots.png");
    expect(scene.walls).toHaveLength(0);
    await service.advanceCellKeys(new Set(["0:1"]));
    expect(scene.tiles.every(tile => tile.texture.src === initialTexture)).toBe(true);
    expect(scene.walls).toHaveLength(0);
  });

  test("does not stack terrain over already-owned cells", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene);
    await service.paintCells("frost", 0, [cells[0]!]);

    const result = await service.paintCells("fire", 1, cells);

    expect(result).toEqual({ createdCells: 1, skippedCells: 1 });
    expect(scene.tiles).toHaveLength(3);
  });

  test("rebuilds, advances, and clears P2 terrain without creating sounds", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene, true);

    await service.paintCells("fire", 0, cells);
    expect(scene.sounds).toHaveLength(0);
    expect(scene.tiles[0]?.texture.src.endsWith(".png")).toBe(true);
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect ===
          "fire-static-v2",
      ),
    ).toBe(true);

    await service.advanceCellKeys(new Set(["0:0"]));
    expect(scene.sounds).toHaveLength(0);
    expect(scene.tiles.every((tile) => tile.texture.src.endsWith(".png"))).toBe(
      true,
    );
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect ===
          "fire-static-v2",
      ),
    ).toBe(true);

    await service.eraseCellKeys(new Set(["0:0"]));
    expect(scene.tiles).toHaveLength(1);
    expect(scene.tiles[0]?.flags["fvtt-battlefield-painter"].visualEffect).toBe(
      "fire-static-v2",
    );
    expect(scene.sounds).toHaveLength(0);

    await service.clearAll();
    expect(scene.tiles).toHaveLength(0);
    expect(scene.regions).toHaveLength(0);
    expect(scene.lights).toHaveLength(0);
    expect(scene.sounds).toHaveLength(0);
    expect(scene.walls).toHaveLength(0);
  });

  test("preserves an existing legacy P2 Square Frost film marker", async () => {
    const scene = new FakeScene();
    const service = serviceFor(scene, true);
    await applyScenePlan(scene, buildScenePlan({bundleId:'legacy-frost',configurationId:'frost',stageIndex:0,cells,
      movementBehavior,p2Enabled:true,visualEffect:'frost-field-v1'}));

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
    expect(scene.tiles.find(tile => tile.flags['fvtt-battlefield-painter'].cellKey === '0:0')?.alpha).toBe(0.62);
    expect(scene.tiles.find(tile => tile.flags['fvtt-battlefield-painter'].cellKey === '0:1')?.alpha).toBe(0.48);
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

  test.each(["fire", "frost"] as const)("keeps P2 Hex %s visible through paint, stage change and erase", async (terrain) => {
    const scene = new FakeScene();
    const hexGrid: FoundryGridLike = { ...grid, isSquare: false };
    const service = new TerrainService({
      scene,
      grid: hexGrid,
      movementBehavior,
      p2Enabled: true,
      createBundleId: (() => { let id = 0; return () => `hex-${terrain}-${++id}`; })(),
    });

    await service.paintCells(terrain, 0, cells);
    expect(scene.tiles[0]?.texture.src.endsWith(".png")).toBe(true);
    expect(scene.tiles.every((tile) => tile.alpha > 0)).toBe(true);
    expect(
      scene.tiles[0]?.flags["fvtt-battlefield-painter"].visualEffect,
    ).toBe(terrain === "fire" ? "fire-static-v2" : "frost-static-v2");
    await service.advanceCellKeys(new Set(["0:0"]));
    await service.eraseCellKeys(new Set(["0:1"]));
    expect(scene.tiles).toHaveLength(1);
    expect(scene.tiles[0]?.alpha).toBeGreaterThan(0);
    expect(scene.tiles[0]?.texture.src.endsWith(".png")).toBe(true);
    expect(scene.tiles[0]?.flags["fvtt-battlefield-painter"].visualEffect).toBe(terrain === "fire" ? "fire-static-v2" : "frost-static-v2");
  });

  test("preserves a pre-marker static Tile when a later client has P2 enabled", async () => {
    const scene = new FakeScene();
    await serviceFor(scene, false).paintCells("fire", 0, cells);
    for (const tile of scene.tiles) {
      delete tile.flags["fvtt-battlefield-painter"].visualEffect;
      tile.texture.src = "modules/fvtt-battlefield-painter/assets/terrain/fire.webp";
    }
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
          "fire-static-v2",
      ),
    ).toBe(true);
    expect(scene.tiles.every((tile) => tile.texture.src.endsWith(".png"))).toBe(
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

    expect(scene.tiles).toHaveLength(4);
    expect(
      scene.tiles.every(
        (tile) => tile.flags["fvtt-battlefield-painter"].stageIndex === 0,
      ),
    ).toBe(true);
    expect(
      scene.tiles.every(
        (tile) =>
          tile.flags["fvtt-battlefield-painter"].visualEffect ===
          "frost-static-v2",
      ),
    ).toBe(true);
    expect(
      scene.tiles.every((tile) => tile.texture.src.endsWith(".png")),
    ).toBe(true);
  });

  test("stage changes and erase operate on both native Frost layers as one cell", async () => {
    const scene = new FakeScene(), service=serviceFor(scene,true);
    await service.paintCells('frost',0,cells);
    expect(scene.tiles).toHaveLength(4);
    expect(scene.regions[0]?.shapes).toHaveLength(2);
    await service.advanceCellKeys(new Set(['0:0']));
    expect(scene.tiles).toHaveLength(3);
    expect(scene.tiles.filter(t=>t.flags['fvtt-battlefield-painter'].cellKey==='0:0')).toHaveLength(1);
    expect(scene.lights).toHaveLength(2);
    await service.advanceCellKeys(new Set(['0:0']));
    expect(scene.tiles).toHaveLength(4);
    expect(scene.regions.flatMap(r=>r.shapes)).toHaveLength(2);
    await service.eraseCellKeys(new Set(['0:0']));
    expect(scene.tiles).toHaveLength(2);
    expect(scene.lights).toHaveLength(1);
    expect(new Set(scene.tiles.map(t=>t.flags['fvtt-battlefield-painter'].visualLayer))).toEqual(new Set(['base','detail']));
    await service.clearAll();
    expect([scene.tiles.length,scene.regions.length,scene.lights.length]).toEqual([0,0,0]);
  });

  test.each(['create','delete'])("recovers both Frost layers across strokes after %s failure", async failure => {
    const scene=new FakeScene(), service=serviceFor(scene,true);
    await service.paintCells('frost',0,[cells[0]!]);
    await service.paintCells('frost',0,[cells[1]!]);
    if(failure==='create') scene.failCreateType='Region'; else scene.failDeleteType='Region';
    await expect(service.advanceCellKeys(new Set(['0:0','0:1']))).rejects.toThrow('injected Region');
    expect(scene.tiles).toHaveLength(4);
    expect(scene.tiles.every(t=>t.flags['fvtt-battlefield-painter'].stageIndex===0)).toBe(true);
    expect(scene.regions).toHaveLength(2);
    expect(scene.lights).toHaveLength(2);
    expect(scene.tiles.filter(t=>t.flags['fvtt-battlefield-painter'].visualLayer==='detail')).toHaveLength(2);
  });
});


describe("acid lifecycle", () => {
  test.each([false,true])("keeps two stages and no gameplay documents with P2=%s", async p2 => {
    const scene = new FakeScene(), service = serviceFor(scene,p2);
    await service.paintCells("acid",0,cells);
    expect(scene.tiles).toHaveLength(2);
    const before = structuredClone(scene.tiles[1]!);
    expect(scene.tiles[0]!.flags["fvtt-battlefield-painter"].visualEffect).toBe("acid-static-v1");
    await service.advanceCellKeys(new Set(["0:0"]));
    expect(scene.tiles.find(t=>t.flags["fvtt-battlefield-painter"].cellKey === "0:0")!.texture.src).toEndWith("acid-native-stage-ii.png");
    const untouched = scene.tiles.find(t=>t.flags["fvtt-battlefield-painter"].cellKey === "0:1")!;
    expect(untouched.texture).toEqual(before.texture);
    expect(untouched.rotation).toEqual(before.rotation);
    await service.advanceCellKeys(new Set(["0:0"]));
    expect(scene.tiles.every(t=>t.texture.src.endsWith("acid-native-stage-i.png"))).toBe(true);
    await service.eraseCellKeys(new Set(["0:0"]));
    expect(scene.tiles).toHaveLength(1);
    expect([scene.regions,scene.walls,scene.sounds]).toEqual([[],[],[]]);
    expect(scene.lights).toHaveLength(1);
    const foreign = {id:"foreign",texture:{src:"foreign.png"},flags:{}};
    scene.tiles.push(foreign);
    await service.clearAll();
    expect(scene.tiles).toEqual([foreign]);
  });
  test("recovers acid appearance when a stage replacement fails", async () => {
    const scene = new FakeScene(), service = serviceFor(scene);
    await service.paintCells("acid",0,cells);
    scene.failCreateType="Tile";
    await expect(service.advanceCellKeys(new Set(["0:0"]))).rejects.toThrow("injected");
    expect(scene.tiles).toHaveLength(2);
    expect(scene.tiles.every(t=>t.texture.src.endsWith("acid-native-stage-i.png"))).toBe(true);
    expect(scene.regions).toEqual([]);
  });
});


test.each([false,true])("flooding remains recoverable and visual-only with P2=%s", async p2 => {
  const scene=new FakeScene(),service=serviceFor(scene,p2);
  await service.paintCells("flooding",0,cells);
  expect(scene.tiles).toHaveLength(2);
  expect(scene.tiles.every(t=>t.flags["fvtt-battlefield-painter"].visualEffect==="flooding-static-v1")).toBe(true);
  await service.advanceCellKeys(new Set(["0:0"]));
  expect(scene.tiles.find(t=>t.flags["fvtt-battlefield-painter"].cellKey==="0:0")!.texture.src).toEndWith("flooding-native-stage-ii.png");
  expect(scene.tiles.find(t=>t.flags["fvtt-battlefield-painter"].cellKey==="0:1")!.texture.src).toEndWith("flooding-native-stage-i.png");
  await service.eraseCellKeys(new Set(["0:0"]));
  expect(scene.tiles).toHaveLength(1);
  expect([scene.regions,scene.lights,scene.walls,scene.sounds]).toEqual([[],[],[],[]]);
  await service.clearAll();expect(scene.tiles).toHaveLength(0);
});

test.each([false,true])("lava removes molten light on erase and remains recoverable with P2=%s", async p2 => {
  const scene=new FakeScene(),service=serviceFor(scene,p2);
  await service.paintCells("lava",0,cells);
  expect(scene.tiles).toHaveLength(2);
  expect(scene.tiles.every(t=>t.flags["fvtt-battlefield-painter"].visualEffect==="lava-static-v1")).toBe(true);
  await service.advanceCellKeys(new Set(["0:0"]));
  expect(scene.tiles.find(t=>t.flags["fvtt-battlefield-painter"].cellKey==="0:0")!.texture.src).toEndWith("lava-native-stage-ii.png");
  expect(scene.tiles.find(t=>t.flags["fvtt-battlefield-painter"].cellKey==="0:1")!.texture.src).toEndWith("lava-native-stage-i.png");
  expect(scene.lights).toHaveLength(1);
  await service.eraseCellKeys(new Set(["0:0"]));
  expect(scene.tiles).toHaveLength(1);
  expect([scene.regions,scene.lights,scene.walls,scene.sounds]).toEqual([[],[],[],[]]);
  await service.clearAll();expect(scene.tiles).toHaveLength(0);
});

test.each([false,true])("blood remains recoverable and visual-only with P2=%s", async p2 => {
  const scene=new FakeScene(),service=serviceFor(scene,p2);
  await service.paintCells("blood",0,cells);
  expect(scene.tiles).toHaveLength(2);
  expect(scene.tiles.every(t=>t.flags["fvtt-battlefield-painter"].visualEffect==="blood-static-v1")).toBe(true);
  await service.advanceCellKeys(new Set(["0:0"]));
  expect(scene.tiles.find(t=>t.flags["fvtt-battlefield-painter"].cellKey==="0:0")!.texture.src).toMatch(/blood-native-stage-ii(?:-[bc])?\.png$/);
  expect(scene.tiles.find(t=>t.flags["fvtt-battlefield-painter"].cellKey==="0:1")!.texture.src).toMatch(/blood-native-stage-i(?:-[bc])?\.png$/);
  await service.eraseCellKeys(new Set(["0:0"]));
  expect(scene.tiles).toHaveLength(1);
  expect([scene.regions,scene.lights,scene.walls,scene.sounds]).toEqual([[],[],[],[]]);
  const foreign={id:"foreign-blood",texture:{src:"foreign.png"},flags:{}};
  scene.tiles.push(foreign);
  await service.clearAll();expect(scene.tiles).toEqual([foreign]);
});


describe("blood variant persistence", () => {
  const M = "fvtt-battlefield-painter";
  const appearance = (scene: FakeScene) => scene.tiles.map(t => ({
    key: t.flags[M].cellKey, variant: t.flags[M].bloodVariant, src: t.texture.src, rotation: t.rotation,
  })).sort((a,b) => a.key.localeCompare(b.key));
  test("draws only for new cells and retains choices through history and reloaded service", async () => {
    const scene = new FakeScene(); let draws = 0;
    const service = new TerrainService({scene,grid,movementBehavior,createBundleId:()=>`variant-${++nextTestBundleId}`,
      chooseBloodVariant: () => [1,2][draws++]!});
    const history = new SceneHistory(scene);
    await history.execute("paint",()=>service.paintCells("blood",0,cells));
    const original = appearance(scene);
    expect(original.map(x=>x.variant)).toEqual([1,2]);
    expect(original.map(x=>x.src)).toEqual([
      "modules/fvtt-battlefield-painter/assets/terrain/blood-native-stage-i-b.png",
      "modules/fvtt-battlefield-painter/assets/terrain/blood-native-stage-i-c.png"]);
    await service.paintCells("blood",0,cells);
    expect(draws).toBe(2);
    await history.undo(); expect(scene.tiles).toHaveLength(0);
    await history.redo(); expect(appearance(scene)).toEqual(original);
    const reloaded = new TerrainService({scene,grid,movementBehavior,createBundleId:()=>`variant-${++nextTestBundleId}`,
      chooseBloodVariant:()=>{throw Error("Reconstruction must not reroll");}});
    await history.execute("stage",()=>reloaded.advanceCellKeys(new Set(["0:0"])));
    expect(appearance(scene)[0]).toMatchObject({variant:1,src:"modules/fvtt-battlefield-painter/assets/terrain/blood-native-stage-ii-b.png"});
    expect(appearance(scene)[1]).toEqual(original[1]);
    await history.undo(); expect(appearance(scene)).toEqual(original);
    await history.redo();
    await reloaded.eraseCellKeys(new Set(["0:1"]));
    expect(appearance(scene)).toHaveLength(1);
    expect(appearance(scene)[0]!.variant).toBe(1);
    await reloaded.advanceCellKeys(new Set(["0:0"]));
    expect(appearance(scene)[0]).toEqual(original[0]);
  });
  test("creation failure restores the same pictures without drawing again", async () => {
    const scene = new FakeScene(); let draws=0;
    const service = new TerrainService({scene,grid,movementBehavior,createBundleId:()=>`variant-${++nextTestBundleId}`,chooseBloodVariant:()=>draws++});
    await service.paintCells("blood",1,cells); const original=appearance(scene);
    scene.failCreateType="Tile";
    await expect(service.advanceCellKeys(new Set(["0:0"]))).rejects.toThrow("injected");
    expect(appearance(scene)).toEqual(original); expect(draws).toBe(2);
  });
  test("legacy blood without a variant keeps its original picture", async () => {
    const scene=new FakeScene();const service=serviceFor(scene);
    await applyScenePlan(scene,buildScenePlan({bundleId:"old-blood",configurationId:"blood",stageIndex:0,cells,visualEffect:"blood-static-v1",movementBehavior}));
    for(const t of scene.tiles) delete t.flags[M].bloodVariant;
    await service.eraseCellKeys(new Set(["0:1"]));
    expect(scene.tiles[0]!.texture.src).toEndWith("blood-native-stage-i.png");
    await service.advanceCellKeys(new Set(["0:0"]));
    expect(scene.tiles[0]!.texture.src).toEndWith("blood-native-stage-ii.png");
  });
  test("invalid new choice fails before creating documents", async () => {
    const scene=new FakeScene();const service=new TerrainService({scene,grid,movementBehavior,chooseBloodVariant:()=>3});
    await expect(service.paintCells("blood",0,cells)).rejects.toThrow("Invalid blood variant");
    expect(scene.tiles).toEqual([]);
  });
});


for (const configuration of Object.values(ADDITIONAL_TERRAINS)) {
  test(`${configuration.id} service: partial stage cycling, persistence, erase history and failed replacement`,async()=>{
    const M="fvtt-battlefield-painter",scene=new FakeScene();let draws=0;
    const service=new TerrainService({scene,grid,movementBehavior,chooseStaticVariant:()=>{draws++;return 0;}});
    const history=new SceneHistory(scene);
    const sources=()=>[scene.tiles,scene.regions,scene.lights,scene.walls].map(list=>list.map(({id,...source})=>source).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    const logical=()=>scene.tiles.flatMap(t=>(t.flags[M].sheetCells??[t.flags[M].offset]).map((o:any)=>({key:`${o.i}:${o.j}`,stage:t.flags[M].stageIndex,src:t.texture.src,frame:t.flags[M].sheetFrame}))).sort((a,b)=>a.key.localeCompare(b.key));
    await service.paintCells(configuration.id,0,cells);
    const original=logical(),originalSources=sources(),paintDraws=draws;
    expect(await service.paintCells(configuration.id,0,[cells[1]!])).toEqual({createdCells:0,skippedCells:1});
    for(let step=1;step<=configuration.stages.length;step++) {
      await service.advanceCellKeys(new Set(["0:1"]));
      const state=logical();expect(state[0]!.stage).toBe(0);expect(state[1]!.stage).toBe(step%configuration.stages.length);
      expect(state[1]!.src).toBe(configuration.stages[step%configuration.stages.length]!.texture);
      if(configuration.placement==="sheet") expect(state.map(c=>c.frame)).toEqual(original.map(c=>c.frame));
    }
    expect(draws).toBe(paintDraws);
    const before=sources();scene.failCreateType="Tile";
    // Cycling one cell splits a multi-stage bundle. Its erase is then delete-only;
    // inject creation failure into a stage replacement, which actually creates a Tile.
    const replacement = configuration.stages.length > 1
      ? service.advanceCellKeys(new Set(["0:0"])) : service.eraseCellKeys(new Set(["0:0"]));
    await expect(replacement).rejects.toThrow("injected Tile");expect(sources()).toEqual(before);
    await history.execute("erase",()=>service.eraseCellKeys(new Set(["0:0"])));
    expect(logical()).toHaveLength(1);expect(logical()[0]!.key).toBe("0:1");
    await history.undo();expect(sources()).toEqual(before);
    await history.redo();expect(logical()).toHaveLength(1);
    const reloaded=new TerrainService({scene,grid,movementBehavior,chooseStaticVariant:()=>{throw Error("unexpected reroll");}});
    await reloaded.eraseCellKeys(new Set(["0:1"]));expect(sources()).toEqual([[],[],[],[]]);
    expect(originalSources[0]).toHaveLength(configuration.placement==="sheet"?1:2);
  });
}

test("rubble preserves random cells, movement shapes and foreign objects through failure recovery and history",async()=>{
  const M="fvtt-battlefield-painter",scene=new FakeScene();let draws=0;
  const service=new TerrainService({scene,grid,movementBehavior,chooseStaticVariant:()=>[2,1][draws++]!});
  const history=new SceneHistory(scene);
  await history.execute("rubble",()=>service.paintCells("rubble",0,cells));
  const state=()=>({tiles:scene.tiles.map(t=>({key:t.flags[M].cellKey,variant:t.flags[M].staticVariant,src:t.texture.src})).sort((a,b)=>a.key.localeCompare(b.key)),regions:scene.regions.map(r=>({shapes:r.shapes,behaviors:r.behaviors}))});
  const before=state();expect(before.tiles.map(t=>t.variant)).toEqual([2,1]);
  await service.advanceCellKeys(new Set(["0:0"]));expect(state()).toEqual(before);expect(draws).toBe(2);
  scene.failCreateType="Region";
  await expect(service.eraseCellKeys(new Set(["0:0"]))).rejects.toThrow("injected Region creation failure");
  expect(state()).toEqual(before);expect(draws).toBe(2);
  const reloaded=new TerrainService({scene,grid,movementBehavior,chooseStaticVariant:()=>{throw Error("must not reroll");}});
  await history.execute("erase",()=>reloaded.eraseCellKeys(new Set(["0:0"])));
  expect(state().tiles).toEqual([before.tiles[1]!]);expect(scene.regions[0]!.shapes).toHaveLength(1);
  await history.undo();expect(state()).toEqual(before);
  await history.redo();expect(state().tiles).toEqual([before.tiles[1]!]);
  const foreignTile={id:"foreign",flags:{}},foreignRegion={id:"foreign-region",flags:{}};
  scene.tiles.push(foreignTile);scene.regions.push(foreignRegion);
  await reloaded.clearAll();expect(scene.tiles).toEqual([foreignTile]);expect(scene.regions).toEqual([foreignRegion]);
});

test("wood preserves random cells, movement shapes and foreign objects through failure recovery and history",async()=>{
  const M="fvtt-battlefield-painter",scene=new FakeScene();let draws=0;
  const service=new TerrainService({scene,grid,movementBehavior,chooseStaticVariant:()=>[2,1][draws++]!});
  const history=new SceneHistory(scene);
  await history.execute("wood",()=>service.paintCells("wood",0,cells));
  const state=()=>({tiles:scene.tiles.map(t=>({key:t.flags[M].cellKey,variant:t.flags[M].staticVariant,src:t.texture.src})).sort((a,b)=>a.key.localeCompare(b.key)),regions:scene.regions.map(r=>({shapes:r.shapes,behaviors:r.behaviors}))});
  const before=state();expect(before.tiles.map(t=>t.variant)).toEqual([2,1]);
  await service.advanceCellKeys(new Set(["0:0"]));expect(state()).toEqual(before);expect(draws).toBe(2);
  scene.failCreateType="Region";
  await expect(service.eraseCellKeys(new Set(["0:0"]))).rejects.toThrow("injected Region creation failure");
  expect(state()).toEqual(before);expect(draws).toBe(2);
  const reloaded=new TerrainService({scene,grid,movementBehavior,chooseStaticVariant:()=>{throw Error("must not reroll");}});
  await history.execute("erase",()=>reloaded.eraseCellKeys(new Set(["0:0"])));
  expect(state().tiles).toEqual([before.tiles[1]!]);expect(scene.regions[0]!.shapes).toHaveLength(1);
  await history.undo();expect(state()).toEqual(before);
  await history.redo();expect(state().tiles).toEqual([before.tiles[1]!]);
  const foreignTile={id:"foreign",flags:{}},foreignRegion={id:"foreign-region",flags:{}};
  scene.tiles.push(foreignTile);scene.regions.push(foreignRegion);
  await reloaded.clearAll();expect(scene.tiles).toEqual([foreignTile]);expect(scene.regions).toEqual([foreignRegion]);
});

test("single-stage spiderweb random choices survive no-op advance, history and reconstruction",async()=>{
  const M="fvtt-battlefield-painter",scene=new FakeScene();let draws=0;
  const service=new TerrainService({scene,grid,movementBehavior,chooseStaticVariant:count=>{expect(count).toBe(3);return [1,2][draws++]!;}});
  const history=new SceneHistory(scene);
  await history.execute("web",()=>service.paintCells("spiderweb",0,cells));
  const state=()=>scene.tiles.flatMap(t=>(t.flags[M].sheetCells ?? [t.flags[M].offset]).map((o: any)=>({key:`${o.i}:${o.j}`,variant:t.flags[M].staticVariant,src:t.texture.src}))).sort((a,b)=>a.key.localeCompare(b.key));
  const before=state(),ids=scene.tiles.map(t=>t.id);
  expect(before.map(t=>t.variant)).toEqual([1,1]);
  expect(scene.tiles).toHaveLength(1); const frame=structuredClone(scene.tiles[0]!.flags[M].sheetFrame);
  expect(await service.paintCells("spiderweb",0,cells)).toEqual({createdCells:0,skippedCells:2});
  await service.advanceCellKeys(new Set(["0:0"]));
  expect(scene.tiles.map(t=>t.id)).toEqual(ids);expect(state()).toEqual(before);expect(draws).toBe(1);
  const reloaded=new TerrainService({scene,grid,movementBehavior,chooseStaticVariant:()=>{throw Error("must not reroll");}});
  await history.execute("erase",()=>reloaded.eraseCellKeys(new Set(["0:0"])));
  expect(state()).toEqual([before[1]!]); expect(scene.tiles[0]!.flags[M].sheetFrame).toEqual(frame);
  await history.undo();expect(state()).toEqual(before);
  await history.redo();expect(state()).toEqual([before[1]!]); expect(scene.tiles[0]!.flags[M].sheetFrame).toEqual(frame);
  expect([scene.regions,scene.lights,scene.walls,scene.sounds]).toEqual([[],[],[],[]]);
  const foreign={id:"foreign-web",flags:{}};scene.tiles.push(foreign);
  await reloaded.clearAll();expect(scene.tiles).toEqual([foreign]);
});

test("parity audio and color survive erase, stage, history and a reloaded service", async () => {
  const scene=new FakeScene(), service=serviceFor(scene,true), history=new SceneHistory(scene), M="fvtt-battlefield-painter";
  const foreign={id:"foreign-sound",path:"other.ogg"};scene.sounds.push(foreign);
  await history.execute("paint",()=>service.paintCells("portal",0,cells,"blue",true));
  expect(scene.sounds).toHaveLength(2);
  expect(scene.tiles[0]!.flags[M].colorId).toBe("blue");
  await history.undo(); expect(scene.sounds).toEqual([foreign]);
  await history.redo(); expect(scene.sounds).toHaveLength(2);
  await history.execute("erase",()=>serviceFor(scene,true).eraseCellKeys(new Set(["0:0"])));
  expect(scene.sounds).toHaveLength(2);expect(scene.tiles[0]!.flags[M].colorId).toBe("blue");
  await history.undo();expect(scene.sounds).toHaveLength(2);
  await history.execute("clear",()=>service.clearAll());expect(scene.sounds).toEqual([foreign]);
  await history.undo();expect(scene.sounds).toHaveLength(2);
  await service.clearAll();
  await service.paintCells("acid",0,cells,undefined,true);
  await service.advanceCellKeys(new Set(["0:0"]));
  expect(scene.sounds.filter(s=>s!==foreign)).toHaveLength(2);
  expect(scene.sounds.filter(s=>s!==foreign).every(s=>s.flags[M].audioEnabled)).toBe(true);
});
