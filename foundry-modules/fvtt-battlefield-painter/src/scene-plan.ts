import {
  getTerrainConfiguration,
  type TerrainConfigurationId,
} from "./catalog";
import { MODULE_ID, type PlannedDocumentName } from "./constants";
import {
  boundarySegments,
  boundsForVertices,
  regionShapesForCells,
  type GridCell,
  type GridOffset,
} from "./geometry";
import { clusterCells } from "./terrain-clusters";

export interface MovementBehaviorSource {
  type: "modifyMovementCost";
  system: Record<string, unknown>;
  name?: string;
  disabled?: boolean;
  flags?: Record<string, unknown>;
}

export type MovementBehaviorFactory = (
  multiplier: number,
) => MovementBehaviorSource;

export interface TerrainDocumentFlag {
  bundleId: string;
  configurationId: TerrainConfigurationId;
  stageIndex: number;
  role:
    | "terrain-tile"
    | "movement-region"
    | "terrain-light"
    | "terrain-sound"
    | "terrain-wall";
  cellKey?: string;
  offset?: GridOffset;
}

type ModuleFlags = Record<typeof MODULE_ID, TerrainDocumentFlag>;

export interface TileSource {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  texture: { src: string; tint: string };
  flags: ModuleFlags;
}

export interface RegionSource {
  name: string;
  shapes: ReturnType<typeof regionShapesForCells>;
  behaviors: MovementBehaviorSource[];
  flags: ModuleFlags;
}

export interface AmbientLightSource {
  name: string;
  x: number;
  y: number;
  walls: boolean;
  config: {
    dim: number;
    bright: number;
    color: string;
    alpha: number;
    animation: { type: string; speed: number; intensity: number };
  };
  flags: ModuleFlags;
}

export interface AmbientSoundSource {
  name: string;
  x: number;
  y: number;
  path: string;
  radius: number;
  volume: number;
  easing: boolean;
  repeat: boolean;
  walls: boolean;
  flags: ModuleFlags;
}

export interface WallSource {
  c: [number, number, number, number];
  move: number;
  sight: number;
  light: number;
  sound: number;
  flags: ModuleFlags;
}

export interface ScenePlan {
  Tile: TileSource[];
  Region: RegionSource[];
  AmbientLight: AmbientLightSource[];
  AmbientSound: AmbientSoundSource[];
  Wall: WallSource[];
}

export interface BuildScenePlanInput {
  bundleId: string;
  configurationId: TerrainConfigurationId;
  stageIndex: number;
  cells: readonly GridCell[];
  movementBehavior: MovementBehaviorFactory;
  p2Enabled?: boolean;
  getAdjacentOffsets?: (offset: GridOffset) => readonly GridOffset[];
  /** Scene distance represented by one grid square; defaults to one for geometry tests. */
  gridDistance?: number;
  /** Pixel size of one grid square; inferred from the cells when omitted. */
  gridSize?: number;
}

const makeFlags = (flag: TerrainDocumentFlag): ModuleFlags => ({
  [MODULE_ID]: flag,
});

const emptyPlan = (): ScenePlan => ({
  Tile: [],
  Region: [],
  AmbientLight: [],
  AmbientSound: [],
  Wall: [],
});

const positiveMetric = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) && value! > 0 ? value! : fallback;

const inferredGridSize = (cells: readonly GridCell[]): number =>
  Math.max(
    1,
    Math.min(...cells.map(({ width, height }) => Math.max(width, height))),
  );

const clusterCoverageDistance = (
  cells: readonly GridCell[],
  gridSize: number,
  gridDistance: number,
): number => {
  const bounds = boundsForVertices(cells);
  const halfDiagonalInSceneDistance =
    (Math.hypot(bounds.width, bounds.height) / 2 / gridSize) * gridDistance;
  return Math.ceil(halfDiagonalInSceneDistance) + gridDistance;
};

const soundRadius = (
  cells: readonly GridCell[],
  gridSize: number,
  gridDistance: number,
): number => {
  const coverageDistance = clusterCoverageDistance(
    cells,
    gridSize,
    gridDistance,
  );
  const gridRadius = Math.min(
    12,
    Math.max(2, Math.ceil(coverageDistance / gridDistance)),
  );
  return gridRadius * gridDistance;
};

export const buildScenePlan = ({
  bundleId,
  configurationId,
  stageIndex,
  cells,
  movementBehavior,
  p2Enabled = false,
  getAdjacentOffsets,
  gridDistance: requestedGridDistance,
  gridSize: requestedGridSize,
}: BuildScenePlanInput): ScenePlan => {
  if (!cells.length) throw new Error("Cannot build terrain without cells");

  const seen = new Set<string>();
  for (const cell of cells) {
    if (seen.has(cell.key)) throw new Error(`Duplicate terrain cell: ${cell.key}`);
    seen.add(cell.key);
  }

  const configuration = getTerrainConfiguration(configurationId);
  const stage = configuration.stages[stageIndex];
  if (!stage) {
    throw new Error(
      `Unknown stage ${stageIndex} for terrain configuration ${configurationId}`,
    );
  }

  const gridDistance = positiveMetric(requestedGridDistance, 1);
  const gridSize = positiveMetric(requestedGridSize, inferredGridSize(cells));

  const plan = emptyPlan();
  plan.Tile = cells.map((cell) => ({
    name: `${configuration.label} · ${stage.label}`,
    x: cell.center.x,
    y: cell.center.y,
    width: cell.width,
    height: cell.height,
    alpha: stage.alpha,
    texture: {
      src: p2Enabled ? stage.media.animatedTexture : stage.media.staticTexture,
      tint: stage.tint,
    },
    flags: makeFlags({
      bundleId,
      configurationId,
      stageIndex,
      cellKey: cell.key,
      offset: cell.offset,
      role: "terrain-tile",
    }),
  }));

  plan.Region = [
    {
      name: `${configuration.label} · 移动消耗`,
      shapes: regionShapesForCells(cells),
      behaviors: [movementBehavior(configuration.movementMultiplier)],
      flags: makeFlags({
        bundleId,
        configurationId,
        stageIndex,
        role: "movement-region",
      }),
    },
  ];

  const clusters = p2Enabled
    ? clusterCells(cells, { maxCells: 16, getAdjacentOffsets })
    : [ [...cells] ];

  const light = stage.light;
  if (light) {
    plan.AmbientLight = clusters.map((cluster, index) => {
      const dim = Math.max(
        light.dim,
        clusterCoverageDistance(cluster, gridSize, gridDistance),
      );
      const bounds = boundsForVertices(cluster);
      return {
        name: `${configuration.label} · ${stage.label}光源${
          p2Enabled ? index + 1 : ""
        }`,
        x: bounds.centerX,
        y: bounds.centerY,
        walls: false,
        config: {
          ...light,
          dim: p2Enabled ? dim : light.dim,
          bright: Math.min(light.bright, p2Enabled ? dim : light.dim),
        },
        flags: makeFlags({
          bundleId,
          configurationId,
          stageIndex,
          role: "terrain-light",
        }),
      };
    });
  }

  if (p2Enabled) {
    plan.AmbientSound = clusters.map((cluster, index) => {
      const bounds = boundsForVertices(cluster);
      return {
        name: `${configuration.label} · ${stage.label}环境音${index + 1}`,
        x: bounds.centerX,
        y: bounds.centerY,
        path: stage.media.ambience.src,
        radius: soundRadius(cluster, gridSize, gridDistance),
        volume: stage.media.ambience.volume,
        easing: true,
        repeat: true,
        walls: true,
        flags: makeFlags({
          bundleId,
          configurationId,
          stageIndex,
          role: "terrain-sound",
        }),
      };
    });
  }

  if (stage.createsWalls) {
    plan.Wall = boundarySegments(cells).map((segment) => ({
      c: segment,
      move: 20,
      sight: 0,
      light: 0,
      sound: 0,
      flags: makeFlags({
        bundleId,
        configurationId,
        stageIndex,
        role: "terrain-wall",
      }),
    }));
  }

  return plan;
};

export const scenePlanEntries = (
  plan: ScenePlan,
): Array<[PlannedDocumentName, Array<Record<string, unknown>>]> => [
  ["Tile", plan.Tile as unknown as Array<Record<string, unknown>>],
  ["Region", plan.Region as unknown as Array<Record<string, unknown>>],
  [
    "AmbientLight",
    plan.AmbientLight as unknown as Array<Record<string, unknown>>,
  ],
  [
    "AmbientSound",
    plan.AmbientSound as unknown as Array<Record<string, unknown>>,
  ],
  ["Wall", plan.Wall as unknown as Array<Record<string, unknown>>],
];
