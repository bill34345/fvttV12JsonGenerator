import { DOCUMENT_ORDER, MODULE_ID, type PlannedDocumentName } from "./constants";
import { TERRAIN_CONFIGURATIONS } from "./catalog";
import type { TerrainDocumentFlag } from "./scene-plan";

export interface OwnedDocumentLike {
  id?: string | null;
  _id?: string | null;
  flags?: Record<string, unknown>;
}

export interface OwnedSceneLike {
  tiles?: Iterable<OwnedDocumentLike>;
  regions?: Iterable<OwnedDocumentLike>;
  lights?: Iterable<OwnedDocumentLike>;
  sounds?: Iterable<OwnedDocumentLike>;
  walls?: Iterable<OwnedDocumentLike>;
  deleteEmbeddedDocuments?: (
    documentName: PlannedDocumentName,
    ids: string[],
  ) => Promise<unknown>;
}

export type OwnedBundleDocuments = Record<PlannedDocumentName, OwnedDocumentLike[]>;
export type OwnedBundleIndex = Map<string, OwnedBundleDocuments>;

const collectionForDocumentName: Record<
  PlannedDocumentName,
  keyof Pick<OwnedSceneLike, "tiles" | "regions" | "lights" | "sounds" | "walls">
> = {
  Tile: "tiles",
  Region: "regions",
  AmbientLight: "lights",
  AmbientSound: "sounds",
  Wall: "walls",
};

const roleForDocumentName: Record<
  PlannedDocumentName,
  TerrainDocumentFlag["role"]
> = {
  Tile: "terrain-tile",
  Region: "movement-region",
  AmbientLight: "terrain-light",
  AmbientSound: "terrain-sound",
  Wall: "terrain-wall",
};

const emptyBundle = (): OwnedBundleDocuments => ({
  Tile: [],
  Region: [],
  AmbientLight: [],
  AmbientSound: [],
  Wall: [],
});

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

  return flag as TerrainDocumentFlag;
};

export const collectOwnedBundles = (scene: OwnedSceneLike): OwnedBundleIndex => {
  const bundles: OwnedBundleIndex = new Map();

  for (const documentName of DOCUMENT_ORDER) {
    const collectionName = collectionForDocumentName[documentName];
    const collection = scene[collectionName] ?? [];
    for (const document of collection) {
      const flag = terrainDocumentFlag(document);
      if (!flag || flag.role !== roleForDocumentName[documentName]) continue;
      const bundle = bundles.get(flag.bundleId) ?? emptyBundle();
      bundle[documentName].push(document);
      bundles.set(flag.bundleId, bundle);
    }
  }

  return bundles;
};

const idOf = (document: OwnedDocumentLike): string | undefined =>
  document.id ?? document._id ?? undefined;

export const ownedDocumentCounts = (scene: OwnedSceneLike) => {
  const bundles = collectOwnedBundles(scene);
  const counts = {
    bundles: bundles.size,
    tiles: 0,
    regions: 0,
    lights: 0,
    sounds: 0,
    walls: 0,
    totalDocuments: 0,
  };
  for (const bundle of bundles.values()) {
    counts.tiles += bundle.Tile.length;
    counts.regions += bundle.Region.length;
    counts.lights += bundle.AmbientLight.length;
    counts.sounds += bundle.AmbientSound.length;
    counts.walls += bundle.Wall.length;
  }
  counts.totalDocuments =
    counts.tiles + counts.regions + counts.lights + counts.sounds + counts.walls;
  return counts;
};

export const ownedDocumentIds = (scene: OwnedSceneLike): string[] => {
  const ids: string[] = [];
  for (const bundle of collectOwnedBundles(scene).values()) {
    for (const documentName of DOCUMENT_ORDER) {
      for (const document of bundle[documentName]) {
        const id = idOf(document);
        if (id) ids.push(`${documentName}:${id}`);
      }
    }
  }
  return ids.sort();
};

export const deleteOwnedBundles = async (
  scene: OwnedSceneLike,
  bundleIds: ReadonlySet<string>,
): Promise<void> => {
  if (!scene.deleteEmbeddedDocuments) {
    throw new Error("The active Scene cannot delete embedded documents");
  }

  const bundles = collectOwnedBundles(scene);
  for (const documentName of [...DOCUMENT_ORDER].reverse()) {
    const ids = [...bundleIds]
      .flatMap((bundleId) => bundles.get(bundleId)?.[documentName] ?? [])
      .map(idOf)
      .filter((id): id is string => Boolean(id));
    if (ids.length) await scene.deleteEmbeddedDocuments(documentName, ids);
  }
};

export const bundleIdsAtCellKeys = (
  scene: OwnedSceneLike,
  cellKeys: ReadonlySet<string>,
): Set<string> => {
  const bundleIds = new Set<string>();
  for (const tile of scene.tiles ?? []) {
    const flag = terrainDocumentFlag(tile);
    if (flag?.cellKey && cellKeys.has(flag.cellKey)) {
      bundleIds.add(flag.bundleId);
    }
  }
  return bundleIds;
};
