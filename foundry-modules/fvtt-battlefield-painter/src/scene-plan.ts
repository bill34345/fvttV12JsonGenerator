import type { TerrainDocumentFlag } from "./terrain-document";
export type { TerrainDocumentFlag } from "./terrain-document";
import {
  getTerrainConfiguration,
  FIRE_STATIC_PROFILE,
  FROST_STATIC_PROFILE,
  BRAMBLE_STATIC_PROFILE,
  BLOOD_STATIC_PROFILE,
  type TerrainConfigurationId,
} from "./catalog";
import { MODULE_ID, type PlannedDocumentName } from "./constants";
import { terrainColor, supportsTerrainColor, type TerrainColorId } from "./terrain-colors";
import { TERRAIN_AUDIO } from "./terrain-audio";
import {
  boundarySegments,
  boundsForVertices,
  regionShapesForCells,
  type GridCell,
  type GridOffset,
} from "./geometry";
import { clusterCells } from "./terrain-clusters";
import { FIRE_STATIC_VISUAL_EFFECT, fireStaticAppearance } from "./fire-static";
import { BRAMBLE_STATIC_VISUAL_EFFECT, brambleStaticAppearance } from "./bramble-static";

export interface MovementBehaviorSource {
  type: "modifyMovementCost";
  system: Record<string, unknown>;
  name?: string;
  disabled?: boolean;
  flags?: Record<string, unknown>;
}

export type MovementBehaviorFactory = (
  multiplier: number,
  affectedActions?: readonly string[],
) => MovementBehaviorSource;


type ModuleFlags = Record<typeof MODULE_ID, TerrainDocumentFlag>;

export interface TileSource {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  rotation?: number;
  sort?: number;
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

/** Legacy compatibility shape; current scene plans intentionally leave this empty. */
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
  /** Retained for old transaction/ownership compatibility; never populated by new plans. */
  AmbientSound: AmbientSoundSource[];
  Wall: WallSource[];
}

export interface BuildScenePlanInput {
  audioEnabled?: boolean;
  colorId?: TerrainColorId;
  functionalityVersion?: 1;
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
  /** Additional visual-only tile size as a fraction; does not change Region or Wall geometry. */
  visualBleed?: number;
  /** Persisted runtime visual effect. This is intentionally not inferred during bundle rebuilds. */
  visualEffect?: TerrainDocumentFlag["visualEffect"];
  /** Original Tile source to preserve when an older bundle has no visualEffect marker. */
  legacyTexture?: string;
  bloodVariants?: Readonly<Record<string, number>>;
  staticVariants?: Readonly<Record<string, number>>;
  sheetFrame?: TerrainDocumentFlag["sheetFrame"];
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
  visualBleed: requestedVisualBleed,
  visualEffect,
  legacyTexture,
  bloodVariants,
  staticVariants,
  sheetFrame,
  functionalityVersion,
  colorId,
  audioEnabled,
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

  const expectedVisualEffect =
    configurationId === "fire"
      ? "fire-field-v1"
      : configurationId === "frost"
        ? "frost-field-v1"
        : undefined;
  const nativeFire = visualEffect === FIRE_STATIC_VISUAL_EFFECT && configurationId === "fire";
  const nativeFrost = visualEffect === "frost-static-v2" && configurationId === "frost";
  const nativeBrambles = visualEffect === BRAMBLE_STATIC_VISUAL_EFFECT && configurationId === "brambles";
  const nativeAcid = visualEffect === "acid-static-v1" && configurationId === "acid";
  const nativeFlooding = visualEffect === "flooding-static-v1" && configurationId === "flooding";
  const nativeLava = visualEffect === "lava-static-v1" && configurationId === "lava";
  const nativeBlood = visualEffect === "blood-static-v1" && configurationId === "blood";
  const nativeSpiderweb = (visualEffect === "spiderweb-static-v1" || visualEffect === "spiderweb-sheet-v1") && configurationId === "spiderweb";
  const nativeRubble = (visualEffect === "rubble-static-v1" && configurationId === "rubble") || (visualEffect === "wood-static-v1" && configurationId === "wood");
  const catalogSheet = visualEffect === "catalog-sheet-v1" && configuration.placement === "sheet";
  const catalogStatic = visualEffect === "catalog-static-v1" && configuration.placement === "cell";
  if (visualEffect && visualEffect !== expectedVisualEffect && !nativeFire && !nativeFrost && !nativeBrambles && !nativeAcid && !nativeFlooding && !nativeLava && !nativeBlood && !nativeSpiderweb && !nativeRubble && !catalogSheet && !catalogStatic) {
    throw new Error(
      `Visual effect ${visualEffect} is not supported by the ${configurationId} configuration`,
    );
  }

  const bloodVariantFor = (key: string): number => {
    const variant = bloodVariants?.[key] ?? 0;
    if (!Number.isInteger(variant) || variant < 0 || variant >= BLOOD_STATIC_PROFILE.textures[stageIndex]!.length) {
      throw new Error(`Invalid blood variant for cell ${key}: ${variant}`);
    }
    return variant;
  };

  const staticVariantFor = (key: string): number => {
    const variant = staticVariants?.[key] ?? 0;
    if (!Number.isInteger(variant) || variant < 0 || !stage.textureVariants || variant >= stage.textureVariants.length) {
      throw new Error(`Invalid static variant for cell ${key}: ${variant}`);
    }
    return variant;
  };

  const frostField = visualEffect === "frost-field-v1";
  const effectBaseTexture = frostField
    ? stage.media.effectBaseTexture
    : undefined;
  if (frostField && !effectBaseTexture) {
    throw new Error("Frost field base texture is missing from the terrain catalog");
  }

  const gridDistance = positiveMetric(requestedGridDistance, 1);
  const gridSize = positiveMetric(requestedGridSize, inferredGridSize(cells));
  const visualBleed =
    Number.isFinite(requestedVisualBleed) && requestedVisualBleed! > 0
      ? requestedVisualBleed!
      : 0;

  const plan = emptyPlan();
  if (visualEffect === "spiderweb-sheet-v1" || catalogSheet) {
    const bounds = sheetFrame ?? boundsForVertices(cells);
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) {
      throw new Error("Invalid spiderweb sheet frame");
    }
    if (cells.some(cell => cell.vertices.some(point => point.x < bounds.x - 0.01 || point.y < bounds.y - 0.01 ||
      point.x > bounds.x + bounds.width + 0.01 || point.y > bounds.y + bounds.height + 0.01))) {
      throw new Error("Terrain cells extend outside the original sheet frame");
    }
    const variant = staticVariantFor(cells[0]!.key);
    if (cells.some(cell => staticVariantFor(cell.key) !== variant)) throw new Error("A spiderweb sheet requires one variant");
    const frame = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    plan.Tile = [{
      name: `${configuration.label} · ${stage.label}`,
      x: frame.x + frame.width / 2, y: frame.y + frame.height / 2,
      width: frame.width, height: frame.height, alpha: stage.alpha, rotation: 0,
      texture: { src: stage.textureVariants![variant]!, tint: stage.tint },
      flags: makeFlags({ bundleId, configurationId, stageIndex, visualEffect,
        role: "terrain-tile", cellKey: cells[0]!.key, offset: cells[0]!.offset,
        staticVariant: variant, sheetFrame: frame, sheetCells: cells.map(cell => ({ ...cell.offset })) }),
    }];
    if (visualEffect === "spiderweb-sheet-v1") return plan;
  } else {
  plan.Tile = cells.map((cell) => ({
    name: `${configuration.label} · ${stage.label}`,
    x: cell.center.x,
    y: cell.center.y,
    width: cell.width * (nativeFire ? FIRE_STATIC_PROFILE.visualScale : nativeBrambles ? BRAMBLE_STATIC_PROFILE.visualScale : (nativeAcid || nativeFlooding || nativeLava || nativeBlood || nativeSpiderweb || nativeRubble) ? 1.15 : 1 + visualBleed),
    height: cell.height * (nativeFire ? FIRE_STATIC_PROFILE.visualScale : nativeBrambles ? BRAMBLE_STATIC_PROFILE.visualScale : (nativeAcid || nativeFlooding || nativeLava || nativeBlood || nativeSpiderweb || nativeRubble) ? 1.15 : 1 + visualBleed),
    ...(nativeFire ? { rotation: fireStaticAppearance(cell.offset).rotation, sort: cell.offset.i * 65536 + cell.offset.j } : {}),
    ...(nativeBrambles ? { rotation: brambleStaticAppearance(cell.offset, stageIndex).rotation, sort: cell.offset.i * 65536 + cell.offset.j } : {}),
    ...((nativeAcid || nativeFlooding || nativeLava || nativeBlood || nativeSpiderweb || nativeRubble) ? { rotation: ((cell.offset.i + cell.offset.j) % 2 === 0 ? 0 : 180), sort: cell.offset.i * 65536 + cell.offset.j } : {}),
    alpha:
      nativeFire || nativeBrambles ? 1 : visualEffect === "fire-field-v1"
        ? 0
        : frostField
          ? stageIndex === 1
            ? 0.62
            : 0.48
          : stage.alpha,
    texture: {
      src:
        (nativeSpiderweb || nativeRubble || catalogStatic) ? stage.textureVariants![staticVariantFor(cell.key)]!
          : nativeBlood ? BLOOD_STATIC_PROFILE.textures[stageIndex]![bloodVariantFor(cell.key)]!
          : nativeFire ? fireStaticAppearance(cell.offset).texture
          : nativeBrambles ? brambleStaticAppearance(cell.offset, stageIndex).texture : visualEffect === "fire-field-v1"
          ? stage.media.staticTexture
          : frostField
            ? effectBaseTexture!
          : legacyTexture ??
            (p2Enabled ? stage.media.animatedTexture : stage.media.staticTexture),
      tint: nativeFire || nativeBrambles || frostField ? "#ffffff" : stage.tint,
    },
    flags: makeFlags({
      bundleId,
      configurationId,
      stageIndex,
      cellKey: cell.key,
      offset: cell.offset,
      ...(nativeBlood ? { bloodVariant: bloodVariantFor(cell.key) } : {}),
      ...((nativeSpiderweb || nativeRubble || catalogStatic) ? { staticVariant: staticVariantFor(cell.key) } : {}),
      ...(visualEffect ? { visualEffect } : {}),
      role: "terrain-tile",
    }),
  }));
  }

  if (nativeFrost) {
    // Keep all thin-film bases below all frost-grain details, including across strokes.
    const bases: TileSource[] = cells.map(cell => ({
      name: `${configuration.label} · ${stage.label}`,
      x: cell.center.x, y: cell.center.y,
      width: cell.width * FROST_STATIC_PROFILE.visualScale,
      height: cell.height * FROST_STATIC_PROFILE.visualScale,
      alpha: stageIndex === 0 ? FROST_STATIC_PROFILE.thinFilmAlpha : 1,
      rotation: (cell.offset.i + cell.offset.j) % 2 === 0 ? 0 : 180,
      sort: cell.offset.i * 65536 + cell.offset.j,
      texture: { src: FROST_STATIC_PROFILE.iceTexture, tint: "#ffffff" },
      flags: makeFlags({ bundleId, configurationId, stageIndex, visualEffect,
        visualLayer: "base", role: "terrain-tile", cellKey: cell.key, offset: cell.offset }),
    }));
    plan.Tile = stageIndex === 0 ? [...bases, ...bases.map(base => ({
      ...base, name: `${configuration.label} · 霜粒`, alpha: 1,
      sort: base.sort! + 1_000_000_000,
      texture: { src: FROST_STATIC_PROFILE.grainsTexture, tint: "#ffffff" },
      flags: makeFlags({ ...base.flags[MODULE_ID], visualLayer: "detail" }),
    }))] : bases;
  }

  // Pure visual hazards do not install a neutral movement behavior over other terrain.
  plan.Region = configuration.movementMultiplier === 1 || (configurationId === "brambles" && stageIndex === 2) ? [] : [
    {
      name: `${configuration.label} · 移动消耗`,
      shapes: regionShapesForCells(cells),
      behaviors: [movementBehavior(configuration.movementMultiplier, configuration.movementActions ?? ((configurationId === "rubble" || configurationId === "wood") ? ["walk"] : undefined))],
      flags: makeFlags({
        bundleId,
        configurationId,
        stageIndex,
        role: "movement-region",
      }),
    },
  ];

  const clusters = p2Enabled && !catalogSheet
    ? clusterCells(cells, { maxCells: 16, getAdjacentOffsets })
    : [ [...cells] ];

  const enhanced = functionalityVersion === 1 && configurationId !== "wildMagic" && configurationId !== "rift";
  const light = enhanced && configurationId === "acid" ? {
    color: "#b4d94d", dim: stageIndex === 0 ? 4 : 6, bright: 0,
    alpha: stageIndex === 0 ? 0.08 : 0.12, attenuation: 0.65,
    luminosity: 0.1, coloration: 100,
    animation: { type: "pulse", speed: 1, intensity: 1 },
  } : stage.light;
  if (nativeFire) {
    // The approved animation relies on overlapping local sources, not one oversized cluster light.
    plan.AmbientLight = cells.map(cell => ({
      name: `${configuration.label} · 火光`, x: cell.center.x, y: cell.center.y, walls: true,
      config: { ...FIRE_STATIC_PROFILE.light, animation: { ...FIRE_STATIC_PROFILE.light.animation } },
      flags: makeFlags({ bundleId, configurationId, stageIndex, cellKey: cell.key, role: "terrain-light" }),
    }));
  } else if (nativeFrost) {
    plan.AmbientLight = cells.map(cell => ({
      name: `${configuration.label} · ${stage.label}反光`,
      x: cell.center.x, y: cell.center.y, walls: true,
      config: { ...FROST_STATIC_PROFILE.light,
        alpha: FROST_STATIC_PROFILE.lightAlpha[stageIndex]!,
        animation: { ...FROST_STATIC_PROFILE.light.animation } },
      flags: makeFlags({ bundleId, configurationId, stageIndex, cellKey: cell.key, role: "terrain-light" }),
    }));
  } else if (light) {
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

  if (enhanced) {
    // Catalog radii are authored against a five-unit grid; coverage above is already in scene units.
    const scale = gridDistance / 5;
    for (const source of plan.AmbientLight) {
      if (nativeFire || nativeFrost) {
        source.config.dim *= scale;
        source.config.bright *= scale;
      } else {
        const sourceCluster = clusters[plan.AmbientLight.indexOf(source)]!;
        source.config.dim = Math.max(light!.dim * scale,
          clusterCoverageDistance(sourceCluster, gridSize, gridDistance));
        source.config.bright = Math.min(light!.bright * scale, source.config.dim);
      }
    }
  }

  if (stage.createsWalls) {
    plan.Wall = boundarySegments(cells).map((segment) => ({
      c: segment,
      move: 20,
      sight: 0,
      light: 0,
      sound: 0,
      ...stage.wallRestrictions,
      flags: makeFlags({
        bundleId,
        configurationId,
        stageIndex,
        role: "terrain-wall",
      }),
    }));
  }

  if (functionalityVersion === 1) {
    const audio = TERRAIN_AUDIO[configurationId];
    if (audioEnabled && audio) {
      // One source per stroke, independent of cell count; avoids a loud source in every grid cell.
      const bounds = boundsForVertices(cells);
      plan.AmbientSound = [{ name: `${configuration.label} · 环境音`, x: bounds.centerX, y: bounds.centerY,
        path: audio.path, radius: clusterCoverageDistance(cells, gridSize, gridDistance) + gridDistance,
        volume: audio.volume * (configurationId === "acid" && stageIndex === 0 ? 0.65 : 1),
        easing: true, repeat: true, walls: true,
        flags: makeFlags({ bundleId, configurationId, stageIndex, role: "terrain-sound", functionalityVersion: 1, audioEnabled: true }),
      }];
    }
    for (const sources of Object.values(plan)) for (const source of sources) {
      source.flags[MODULE_ID].functionalityVersion = 1;
      if (audio) source.flags[MODULE_ID].audioEnabled = audioEnabled === true;
      if (supportsTerrainColor(configurationId) && terrainColor(colorId).id !== "original") {
        source.flags[MODULE_ID].colorId = terrainColor(colorId).id;
      }
    }
    if (supportsTerrainColor(configurationId) && terrainColor(colorId).id !== "original") {
      for (const source of plan.AmbientLight) {
        source.config.color = terrainColor(colorId).hex;
        if (colorId === "white") source.config.alpha *= 0.65;
      }
    }
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
