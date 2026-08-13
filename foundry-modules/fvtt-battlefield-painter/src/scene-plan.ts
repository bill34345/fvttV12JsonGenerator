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
} from "./geometry";

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
  role: "terrain-tile" | "movement-region" | "terrain-light" | "terrain-wall";
  cellKey?: string;
  offset?: { i: number; j: number };
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
  Wall: WallSource[];
}

export interface BuildScenePlanInput {
  bundleId: string;
  configurationId: TerrainConfigurationId;
  stageIndex: number;
  cells: readonly GridCell[];
  movementBehavior: MovementBehaviorFactory;
}

const makeFlags = (
  flag: TerrainDocumentFlag,
): ModuleFlags => ({ [MODULE_ID]: flag });

const emptyPlan = (): ScenePlan => ({
  Tile: [],
  Region: [],
  AmbientLight: [],
  Wall: [],
});

export const buildScenePlan = ({
  bundleId,
  configurationId,
  stageIndex,
  cells,
  movementBehavior,
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

  const plan = emptyPlan();
  plan.Tile = cells.map((cell) => ({
    name: `${configuration.label} · ${stage.label}`,
    x: cell.center.x,
    y: cell.center.y,
    width: cell.width,
    height: cell.height,
    alpha: stage.alpha,
    texture: { src: stage.texture, tint: stage.tint },
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

  if (stage.light) {
    const bounds = boundsForVertices(cells);
    plan.AmbientLight = [
      {
        name: `${configuration.label} · ${stage.label}光源`,
        x: bounds.centerX,
        y: bounds.centerY,
        walls: false,
        config: stage.light,
        flags: makeFlags({
          bundleId,
          configurationId,
          stageIndex,
          role: "terrain-light",
        }),
      },
    ];
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
  ["Wall", plan.Wall as unknown as Array<Record<string, unknown>>],
];
