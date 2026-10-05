import { BLOOD_STATIC_PROFILE, TERRAIN_CONFIGURATIONS, type TerrainConfigurationId } from "./catalog";
import type { GridCell } from "./geometry";
import type { TerrainColorId } from "./terrain-colors";
import {
  gridCellAtOffset,
  type FoundryGridLike,
} from "./grid-adapter";
import {
  bundleIdsAtCellKeys,
  collectOwnedBundles,
  deleteOwnedBundles,
  terrainDocumentFlag,
  terrainCellKeys,
  terrainCellOffsets,
  type OwnedBundleDocuments,
  type OwnedSceneLike,
} from "./scene-ownership";
import {
  buildScenePlan,
  type MovementBehaviorFactory,
  type ScenePlan,
  type TerrainDocumentFlag,
} from "./scene-plan";
import {
  applyScenePlan,
  type SceneMutationLike,
} from "./scene-transaction";

interface SceneGridMetadata {
  size?: number;
  distance?: number;
  data?: { size?: number; distance?: number };
}

type TerrainScene = OwnedSceneLike &
  SceneMutationLike & {
    grid?: SceneGridMetadata;
  };

export interface TerrainServiceOptions {
  scene: TerrainScene;
  grid: FoundryGridLike;
  movementBehavior: MovementBehaviorFactory;
  p2Enabled?: boolean;
  /** Visual-only square tile expansion; callers must leave this at zero for unknown grids. */
  visualBleed?: number;
  createBundleId?: () => string;
  /** Called only for newly painted blood cells, never during reconstruction. */
  chooseBloodVariant?: () => number;
  chooseStaticVariant?: (count: number) => number;
}

export interface PaintResult {
  createdCells: number;
  skippedCells: number;
}

interface BundleSnapshot {
  audioEnabled?: boolean;
  colorId?: TerrainColorId;
  functionalityVersion?: 1;
  bundleId: string;
  configurationId: TerrainConfigurationId;
  stageIndex: number;
  visualEffect?: TerrainDocumentFlag["visualEffect"];
  legacyTexture?: string;
  bloodVariants?: Record<string, number>;
  staticVariants?: Record<string, number>;
  sheetFrame?: TerrainDocumentFlag["sheetFrame"];
  cells: GridCell[];
}

const defaultBundleId = (): string => globalThis.crypto.randomUUID();

export class TerrainService {
  readonly #scene: TerrainScene;
  readonly #grid: FoundryGridLike;
  readonly #movementBehavior: MovementBehaviorFactory;
  readonly #p2Enabled: boolean;
  readonly #visualBleed: number;
  readonly #createBundleId: () => string;
  readonly #chooseBloodVariant: () => number;
  readonly #chooseStaticVariant: (count: number) => number;

  constructor({
    scene,
    grid,
    movementBehavior,
    p2Enabled = false,
    visualBleed = 0,
    createBundleId = defaultBundleId,
    chooseBloodVariant = () => Math.floor(Math.random() * BLOOD_STATIC_PROFILE.textures[0]!.length),
    chooseStaticVariant = (count: number) => Math.floor(Math.random() * count),
  }: TerrainServiceOptions) {
    this.#scene = scene;
    this.#grid = grid;
    this.#movementBehavior = movementBehavior;
    this.#p2Enabled = p2Enabled;
    this.#visualBleed =
      Number.isFinite(visualBleed) && visualBleed > 0 ? visualBleed : 0;
    this.#createBundleId = createBundleId;
    this.#chooseBloodVariant = chooseBloodVariant;
    this.#chooseStaticVariant = chooseStaticVariant;
  }

  async paintCells(
    configurationId: TerrainConfigurationId,
    stageIndex: number,
    cells: readonly GridCell[],
    colorId?: TerrainColorId,
    audioEnabled = false,
  ): Promise<PaintResult> {
    const occupied = new Set(
      [...(this.#scene.tiles ?? [])]
        .map(terrainDocumentFlag)
        .flatMap((flag) => flag ? terrainCellKeys(flag) : []),
    );
    const available = cells.filter(({ key }) => !occupied.has(key));
    const skippedCells = cells.length - available.length;
    if (!available.length) return { createdCells: 0, skippedCells };
    const configuration = TERRAIN_CONFIGURATIONS[configurationId];
    const isSheet = configurationId === "spiderweb" || configuration.placement === "sheet";
    const variantCount = configuration.stages[stageIndex]?.textureVariants?.length ?? 1;
    const webVariant = isSheet ? this.#chooseStaticVariant(variantCount) : undefined;

    await applyScenePlan(
      this.#scene,
      this.#buildPlan({
        bundleId: this.#createBundleId(),
        configurationId,
        stageIndex,
        colorId,
        audioEnabled,
        ...(configurationId !== "wildMagic" && configurationId !== "rift" ? { functionalityVersion: 1 as const } : {}),
        visualEffect:
          configuration.placement ? (configuration.placement === "sheet" ? "catalog-sheet-v1" : "catalog-static-v1") : configurationId === "fire"
            ? "fire-static-v2"
            : configurationId === "frost"
              ? "frost-static-v2"
              : configurationId === "brambles" ? "brambles-static-v2" : configurationId === "acid" ? "acid-static-v1" : configurationId === "flooding" ? "flooding-static-v1" : configurationId === "lava" ? "lava-static-v1" : configurationId === "blood" ? "blood-static-v1" : configurationId === "rubble" ? "rubble-static-v1" : configurationId === "wood" ? "wood-static-v1" : "spiderweb-sheet-v1",
        cells: available,
        ...(isSheet ? { staticVariants: Object.fromEntries(available.map(cell => [cell.key, webVariant!])) } : {}),
        ...((configurationId === "rubble" || configurationId === "wood" || configuration.placement === "cell") ? { staticVariants: Object.fromEntries(available.map(cell => [cell.key, this.#chooseStaticVariant(variantCount)])) } : {}),
        ...(configurationId === "blood" ? { bloodVariants: Object.fromEntries(available.map(cell => [cell.key, this.#chooseBloodVariant()])) } : {}),
      }),
    );

    return { createdCells: available.length, skippedCells };
  }

  async eraseCellKeys(cellKeys: ReadonlySet<string>): Promise<void> {
    const bundleIds = bundleIdsAtCellKeys(this.#scene, cellKeys);
    const bundles = collectOwnedBundles(this.#scene);
    const originals: BundleSnapshot[] = [];
    const replacements: BundleSnapshot[] = [];

    for (const bundleId of bundleIds) {
      const bundle = bundles.get(bundleId);
      if (!bundle) continue;
      const snapshot = this.#snapshot(bundleId, bundle);
      const remaining = snapshot.cells.filter(({ key }) => !cellKeys.has(key));
      originals.push(snapshot);
      if (remaining.length) replacements.push({ ...snapshot, cells: remaining });
    }
    await this.#replaceWithSnapshots(originals, replacements);
  }

  async advanceCellKeys(cellKeys: ReadonlySet<string>): Promise<void> {
    const bundleIds = bundleIdsAtCellKeys(this.#scene, cellKeys);
    const bundles = collectOwnedBundles(this.#scene);
    const originals: BundleSnapshot[] = [];
    const replacements: BundleSnapshot[] = [];
    const reservedIds = new Set(bundles.keys());

    for (const bundleId of bundleIds) {
      const bundle = bundles.get(bundleId);
      if (!bundle) continue;
      const snapshot = this.#snapshot(bundleId, bundle);
      const stageCount = TERRAIN_CONFIGURATIONS[snapshot.configurationId].stages.length;
      if (stageCount < 2) continue;
      const nextStage = (snapshot.stageIndex + 1) % stageCount;
      const selected = snapshot.cells.filter(({ key }) => cellKeys.has(key));
      const remaining = snapshot.cells.filter(({ key }) => !cellKeys.has(key));
      if (!selected.length) continue;
      const selectedId = remaining.length ? this.#createBundleId() : snapshot.bundleId;
      if (remaining.length && reservedIds.has(selectedId)) {
        throw new Error("Stage change generated an existing terrain bundle id");
      }
      reservedIds.add(selectedId);
      originals.push(snapshot);
      replacements.push(
        ...(remaining.length ? [{ ...snapshot, cells: remaining }] : []),
        {
          ...snapshot, bundleId: selectedId, stageIndex: nextStage, cells: selected,
          // Explicit bramble stage changes select the new stage artwork; unchanged
          // cells and erase/recovery still preserve their original source texture.
          legacyTexture: snapshot.configurationId === "brambles" ? undefined : snapshot.legacyTexture,
        },
      );
    }
    await this.#replaceWithSnapshots(originals, replacements);
  }

  async clearAll(): Promise<void> {
    const bundleIds = new Set(collectOwnedBundles(this.#scene).keys());
    await deleteOwnedBundles(this.#scene, bundleIds);
  }

  #buildPlan(snapshot: BundleSnapshot): ScenePlan {
    const sceneGrid = this.#scene.grid;
    return buildScenePlan({
      ...snapshot,
      movementBehavior: this.#movementBehavior,
      p2Enabled: this.#p2Enabled,
      visualBleed: this.#visualBleed,
      visualEffect: snapshot.visualEffect,
      legacyTexture: snapshot.legacyTexture,
      getAdjacentOffsets: this.#grid.getAdjacentOffsets?.bind(this.#grid),
      gridSize:
        this.#grid.size ?? sceneGrid?.size ?? sceneGrid?.data?.size,
      gridDistance: sceneGrid?.distance ?? sceneGrid?.data?.distance,
    });
  }

  #snapshot(bundleId: string, bundle: OwnedBundleDocuments): BundleSnapshot {
    const tileFlags = bundle.Tile.map(terrainDocumentFlag).filter(
      (flag): flag is NonNullable<ReturnType<typeof terrainDocumentFlag>> =>
        Boolean(flag?.offset) && flag?.visualLayer !== "detail",
    );
    const first = tileFlags[0];
    if (!first) throw new Error(`Terrain bundle ${bundleId} has no recoverable tiles`);

    const tileSources = bundle.Tile as Array<{
      texture?: { src?: unknown };
    }>;
    const legacyTexture = tileSources
      .map((tile) => tile.texture?.src)
      .find(
        (src): src is string =>
          typeof src === "string" && src.length > 0,
      );

    return {
      bundleId,
      configurationId: first.configurationId,
      stageIndex: first.stageIndex,
      colorId: first.colorId,
      audioEnabled: first.audioEnabled,
      functionalityVersion: first.functionalityVersion,
      visualEffect: first.visualEffect,
      legacyTexture: first.visualEffect === undefined ? legacyTexture : undefined,
      cells: tileFlags.flatMap(flag => terrainCellOffsets(flag).map(offset => gridCellAtOffset(this.#grid, offset))),
      ...(first.sheetFrame ? { sheetFrame: { ...first.sheetFrame } } : {}),
      ...((first.configurationId === "spiderweb" || first.configurationId === "rubble" || first.configurationId === "wood" || TERRAIN_CONFIGURATIONS[first.configurationId].placement) ? { staticVariants: Object.fromEntries(tileFlags.flatMap(flag => terrainCellOffsets(flag).map(offset => [gridCellAtOffset(this.#grid, offset).key, flag.staticVariant ?? 0]))) } : {}),
      ...(first.configurationId === "blood" ? { bloodVariants: Object.fromEntries(tileFlags.map(flag => [gridCellAtOffset(this.#grid, flag.offset!).key, flag.bloodVariant ?? 0])) } : {}),
    };
  }

  #combinedPlan(snapshots: BundleSnapshot[]): ScenePlan {
    const plans = snapshots.map(snapshot => this.#buildPlan(snapshot));
    return {
      Tile: plans.flatMap(plan => plan.Tile),
      Region: plans.flatMap(plan => plan.Region),
      AmbientLight: plans.flatMap(plan => plan.AmbientLight),
      AmbientSound: plans.flatMap(plan => plan.AmbientSound),
      Wall: plans.flatMap(plan => plan.Wall),
    };
  }

  async #replaceWithSnapshots(originals: BundleSnapshot[], replacements: BundleSnapshot[]): Promise<void> {
    if (!originals.length) return;
    // One submitted brush action is one recovery boundary, even across strokes.
    const originalPlan = this.#combinedPlan(originals);
    const replacementPlan = this.#combinedPlan(replacements);
    const originalIds = new Set(originals.map(snapshot => snapshot.bundleId));
    const affectedIds = new Set([...originalIds, ...replacements.map(snapshot => snapshot.bundleId)]);

    try {
      await deleteOwnedBundles(this.#scene, originalIds);
      await applyScenePlan(this.#scene, replacementPlan);
    } catch (error) {
      try {
        // Remove any survivors of a partial delete/create before recovery.
        await deleteOwnedBundles(this.#scene, affectedIds);
        await applyScenePlan(this.#scene, originalPlan);
      } catch (restoreError) {
        const reason =
          restoreError instanceof Error ? restoreError.message : String(restoreError);
        throw new Error(`Terrain replacement and recovery failed: ${reason}`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}
