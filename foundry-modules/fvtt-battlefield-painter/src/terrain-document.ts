import { MODULE_ID } from "./constants";
import { BLOOD_STATIC_PROFILE, TERRAIN_CONFIGURATIONS } from "./catalog";
import type { TerrainConfigurationId } from "./catalog-types";
import type { GridOffset } from "./geometry";
import type { TerrainColorId } from "./terrain-colors";

export interface TerrainDocumentFlag {
  audioEnabled?: boolean;
  colorId?: TerrainColorId;
  /** Opt-in for newly painted functionality; absent markers retain legacy behavior. */
  functionalityVersion?: 1;
  bundleId: string;
  configurationId: TerrainConfigurationId;
  stageIndex: number;
  visualEffect?: "fire-field-v1" | "frost-field-v1" | "fire-static-v2" | "frost-static-v2" | "brambles-static-v2" | "acid-static-v1" | "flooding-static-v1" | "lava-static-v1" | "blood-static-v1" | "spiderweb-static-v1" | "spiderweb-sheet-v1" | "rubble-static-v1" | "wood-static-v1" | "catalog-static-v1" | "catalog-sheet-v1";
  /** A detail Tile belongs to its base cell and never creates another movement polygon. */
  visualLayer?: "base" | "detail";
  /** Chosen once at paint time; absent legacy values use original variant 0. */
  bloodVariant?: number;
  staticVariant?: number;
  sheetCells?: GridOffset[];
  /** Original image bounds: erasing cells must never reframe the surviving image. */
  sheetFrame?: { x: number; y: number; width: number; height: number };
  role:
    | "terrain-tile"
    | "movement-region"
    | "terrain-light"
    | "terrain-sound"
    | "terrain-wall";
  cellKey?: string;
  offset?: GridOffset;
}

export interface OwnedDocumentLike {
  id?: string | null;
  _id?: string | null;
  flags?: Record<string, unknown>;
}

const TERRAIN_ROLES = new Set<TerrainDocumentFlag["role"]>([
  "terrain-tile",
  "movement-region",
  "terrain-light",
  "terrain-sound",
  "terrain-wall",
]);

export const terrainDocumentFlag = (
  document: OwnedDocumentLike,
): TerrainDocumentFlag | undefined => {
  const candidate = document.flags?.[MODULE_ID];
  if (!candidate || typeof candidate !== "object") return undefined;

  const flag = candidate as Partial<TerrainDocumentFlag>;
  if (
    typeof flag.bundleId !== "string" ||
    typeof flag.configurationId !== "string" ||
    typeof flag.stageIndex !== "number" ||
    !TERRAIN_ROLES.has(flag.role as TerrainDocumentFlag["role"])
  ) {
    return undefined;
  }

  const configuration = Object.prototype.hasOwnProperty.call(
    TERRAIN_CONFIGURATIONS,
    flag.configurationId,
  )
    ? TERRAIN_CONFIGURATIONS[
        flag.configurationId as keyof typeof TERRAIN_CONFIGURATIONS
      ]
    : undefined;
  if (
    !configuration ||
    !Number.isInteger(flag.stageIndex) ||
    flag.stageIndex < 0 ||
    flag.stageIndex >= configuration.stages.length
  ) {
    return undefined;
  }

  if (
    flag.visualEffect !== undefined &&
    flag.visualEffect !== "fire-field-v1" &&
    flag.visualEffect !== "fire-static-v2" &&
    flag.visualEffect !== "frost-static-v2" &&
    flag.visualEffect !== "brambles-static-v2" &&
    flag.visualEffect !== "acid-static-v1" &&
    flag.visualEffect !== "spiderweb-static-v1" &&
    flag.visualEffect !== "spiderweb-sheet-v1" &&
    flag.visualEffect !== "rubble-static-v1" &&
    flag.visualEffect !== "wood-static-v1" &&
    flag.visualEffect !== "catalog-static-v1" &&
    flag.visualEffect !== "catalog-sheet-v1" &&
    flag.visualEffect !== "blood-static-v1" &&
    flag.visualEffect !== "lava-static-v1" &&
    flag.visualEffect !== "flooding-static-v1" &&
    flag.visualEffect !== "frost-field-v1"
  ) {
    return undefined;
  }
  if (
    ((flag.visualEffect === "fire-field-v1" || flag.visualEffect === "fire-static-v2") && flag.configurationId !== "fire") ||
    ((flag.visualEffect === "frost-field-v1" || flag.visualEffect === "frost-static-v2") && flag.configurationId !== "frost") ||
    (flag.visualEffect === "brambles-static-v2" && flag.configurationId !== "brambles") ||
    (flag.visualEffect === "acid-static-v1" && flag.configurationId !== "acid") ||
    (flag.visualEffect === "flooding-static-v1" && flag.configurationId !== "flooding") ||
    (flag.visualEffect === "lava-static-v1" && flag.configurationId !== "lava") ||
    (flag.visualEffect === "blood-static-v1" && flag.configurationId !== "blood") ||
    (flag.visualEffect === "rubble-static-v1" && flag.configurationId !== "rubble") ||
    (flag.visualEffect === "wood-static-v1" && flag.configurationId !== "wood") ||
    (flag.visualEffect === "catalog-static-v1" && configuration.placement !== "cell") ||
    (flag.visualEffect === "catalog-sheet-v1" && configuration.placement !== "sheet") ||
    ((flag.visualEffect === "spiderweb-static-v1" || flag.visualEffect === "spiderweb-sheet-v1") && flag.configurationId !== "spiderweb")
  ) {
    return undefined;
  }

  if (flag.bloodVariant !== undefined && (
    flag.configurationId !== "blood" || flag.visualEffect !== "blood-static-v1" || flag.role !== "terrain-tile" ||
    !Number.isInteger(flag.bloodVariant) || flag.bloodVariant < 0 ||
    flag.bloodVariant >= BLOOD_STATIC_PROFILE.textures[flag.stageIndex]!.length
  )) return undefined;

  if (flag.staticVariant !== undefined && (
    !((flag.configurationId === "spiderweb" && (flag.visualEffect === "spiderweb-static-v1" || flag.visualEffect === "spiderweb-sheet-v1")) || (flag.configurationId === "rubble" && flag.visualEffect === "rubble-static-v1") || (flag.configurationId === "wood" && flag.visualEffect === "wood-static-v1") || (flag.visualEffect === "catalog-static-v1" && configuration.placement === "cell") || (flag.visualEffect === "catalog-sheet-v1" && configuration.placement === "sheet")) || flag.role !== "terrain-tile" ||
    !Number.isInteger(flag.staticVariant) || flag.staticVariant < 0 ||
    flag.staticVariant >= (configuration.stages[flag.stageIndex]?.textureVariants?.length ?? 0)
  )) return undefined;

  if (flag.visualEffect === "spiderweb-sheet-v1" || flag.visualEffect === "catalog-sheet-v1") {
    const frame = flag.sheetFrame, cells = flag.sheetCells;
    if (flag.role !== "terrain-tile" || flag.staticVariant === undefined || !frame ||
      ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) || frame.width <= 0 || frame.height <= 0 ||
      !Array.isArray(cells) || !cells.length || cells.some(cell => !cell || !Number.isInteger(cell.i) || !Number.isInteger(cell.j)) ||
      new Set(cells.map(cell => `${cell.i}:${cell.j}`)).size !== cells.length ||
      flag.cellKey !== `${cells[0]!.i}:${cells[0]!.j}` || flag.offset?.i !== cells[0]!.i || flag.offset?.j !== cells[0]!.j) return undefined;
  } else if (flag.sheetCells !== undefined || flag.sheetFrame !== undefined) return undefined;

  if (flag.visualLayer !== undefined && (
    flag.visualEffect !== "frost-static-v2" || flag.role !== "terrain-tile" ||
    (flag.visualLayer !== "base" && flag.visualLayer !== "detail") ||
    (flag.visualLayer === "detail" && flag.stageIndex !== 0)
  )) return undefined;

  return flag as TerrainDocumentFlag;
};
