import { TERRAIN_CONFIGURATIONS, type TerrainConfigurationId } from "./catalog";
import type { GridCell } from "./geometry";
import {
  gridCellAtOffset,
  isSquareGrid,
  type FoundryGridLike,
} from "./grid-adapter";
import {
  bundleIdsAtCellKeys,
  collectOwnedBundles,
  deleteOwnedBundles,
  terrainDocumentFlag,
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
}

export interface PaintResult {
  createdCells: number;
  skippedCells: number;
}

interface BundleSnapshot {
  bundleId: string;
  configurationId: TerrainConfigurationId;
  stageIndex: number;
  visualEffect?: TerrainDocumentFlag["visualEffect"];
  legacyTexture?: string;
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

  constructor({
    scene,
    grid,
    movementBehavior,
    p2Enabled = false,
    visualBleed = 0,
    createBundleId = defaultBundleId,
  }: TerrainServiceOptions) {
    this.#scene = scene;
    this.#grid = grid;
    this.#movementBehavior = movementBehavior;
    this.#p2Enabled = p2Enabled;
    this.#visualBleed =
      Number.isFinite(visualBleed) && visualBleed > 0 ? visualBleed : 0;
    this.#createBundleId = createBundleId;
  }

  async paintCells(
    configurationId: TerrainConfigurationId,
    stageIndex: number,
    cells: readonly GridCell[],
  ): Promise<PaintResult> {
    const occupied = new Set(
      [...(this.#scene.tiles ?? [])]
        .map(terrainDocumentFlag)
        .map((flag) => flag?.cellKey)
        .filter((cellKey): cellKey is string => Boolean(cellKey)),
    );
    const available = cells.filter(({ key }) => !occupied.has(key));
    const skippedCells = cells.length - available.length;
    if (!available.length) return { createdCells: 0, skippedCells };

    await applyScenePlan(
      this.#scene,
      this.#buildPlan({
        bundleId: this.#createBundleId(),
        configurationId,
        stageIndex,
        visualEffect:
          this.#p2Enabled && configurationId === "fire"
            ? "fire-field-v1"
            : this.#p2Enabled &&
                configurationId === "frost" &&
                isSquareGrid(this.#grid)
              ? "frost-field-v1"
              : undefined,
        cells: available,
      }),
    );

    return { createdCells: available.length, skippedCells };
  }

  async eraseCellKeys(cellKeys: ReadonlySet<string>): Promise<void> {
    const bundleIds = bundleIdsAtCellKeys(this.#scene, cellKeys);
    const bundles = collectOwnedBundles(this.#scene);

    for (const bundleId of bundleIds) {
      const bundle = bundles.get(bundleId);
      if (!bundle) continue;
      const snapshot = this.#snapshot(bundleId, bundle);
      const remaining = snapshot.cells.filter(({ key }) => !cellKeys.has(key));
      await this.#replaceBundle(snapshot, remaining, snapshot.stageIndex);
    }
  }

  async advanceCellKeys(cellKeys: ReadonlySet<string>): Promise<void> {
    const bundleIds = bundleIdsAtCellKeys(this.#scene, cellKeys);
    const bundles = collectOwnedBundles(this.#scene);

    for (const bundleId of bundleIds) {
      const bundle = bundles.get(bundleId);
      if (!bundle) continue;
      const snapshot = this.#snapshot(bundleId, bundle);
      const stageCount = TERRAIN_CONFIGURATIONS[snapshot.configurationId].stages.length;
      const nextStage = (snapshot.stageIndex + 1) % stageCount;
      await this.#replaceBundle(snapshot, snapshot.cells, nextStage);
    }
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
        Boolean(flag?.offset),
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
      visualEffect: first.visualEffect,
      legacyTexture: first.visualEffect === undefined ? legacyTexture : undefined,
      cells: tileFlags.map((flag) => gridCellAtOffset(this.#grid, flag.offset!)),
    };
  }

  async #replaceBundle(
    original: BundleSnapshot,
    replacementCells: readonly GridCell[],
    replacementStage: number,
  ): Promise<void> {
    await deleteOwnedBundles(this.#scene, new Set([original.bundleId]));
    if (!replacementCells.length) return;

    const replacement: BundleSnapshot = {
      ...original,
      stageIndex: replacementStage,
      cells: [...replacementCells],
    };

    try {
      await applyScenePlan(this.#scene, this.#buildPlan(replacement));
    } catch (error) {
      try {
        await applyScenePlan(this.#scene, this.#buildPlan(original));
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
