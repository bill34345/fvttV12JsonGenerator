import { DOCUMENT_ORDER, MODULE_ID, type PlannedDocumentName } from "./constants";
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
  walls?: Iterable<OwnedDocumentLike>;
  deleteEmbeddedDocuments?: (
    documentName: PlannedDocumentName,
    ids: string[],
  ) => Promise<unknown>;
}

export type OwnedBundleDocuments = Record<
  PlannedDocumentName,
  OwnedDocumentLike[]
>;

export type OwnedBundleIndex = Map<string, OwnedBundleDocuments>;

const collectionForDocumentName: Record<
  PlannedDocumentName,
  keyof Pick<OwnedSceneLike, "tiles" | "regions" | "lights" | "walls">
> = {
  Tile: "tiles",
  Region: "regions",
  AmbientLight: "lights",
  Wall: "walls",
};

const emptyBundle = (): OwnedBundleDocuments => ({
  Tile: [],
  Region: [],
  AmbientLight: [],
  Wall: [],
});

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
    typeof flag.role !== "string"
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
      if (!flag) continue;
      const bundle = bundles.get(flag.bundleId) ?? emptyBundle();
      bundle[documentName].push(document);
      bundles.set(flag.bundleId, bundle);
    }
  }

  return bundles;
};

const idOf = (document: OwnedDocumentLike): string | undefined =>
  document.id ?? document._id ?? undefined;

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
