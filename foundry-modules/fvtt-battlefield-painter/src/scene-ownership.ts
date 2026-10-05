import { DOCUMENT_ORDER, MODULE_ID, type PlannedDocumentName } from "./constants";
import { terrainDocumentFlag, type TerrainDocumentFlag, type OwnedDocumentLike } from "./terrain-document";
export { terrainDocumentFlag } from "./terrain-document";
export type { OwnedDocumentLike } from "./terrain-document";


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
  {
    documentNames = DOCUMENT_ORDER,
  }: { documentNames?: readonly PlannedDocumentName[] } = {},
): Promise<void> => {
  if (!scene.deleteEmbeddedDocuments) {
    throw new Error("The active Scene cannot delete embedded documents");
  }

  const bundles = collectOwnedBundles(scene);
  for (const documentName of [...documentNames].reverse()) {
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
    if (flag && terrainCellKeys(flag).some(key => cellKeys.has(key))) {
      bundleIds.add(flag.bundleId);
    }
  }
  return bundleIds;
};

export const terrainCellOffsets = (flag: TerrainDocumentFlag) =>
  flag.sheetCells ?? (flag.offset ? [flag.offset] : []);

export const terrainCellKeys = (flag: TerrainDocumentFlag) =>
  flag.sheetCells ? flag.sheetCells.map(({ i, j }) => `${i}:${j}`) : flag.cellKey ? [flag.cellKey] : [];
