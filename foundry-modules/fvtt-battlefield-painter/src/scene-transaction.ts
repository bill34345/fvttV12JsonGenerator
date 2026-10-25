import { DOCUMENT_ORDER, type PlannedDocumentName } from "./constants";
import { scenePlanEntries, type ScenePlan } from "./scene-plan";
import { terrainDocumentFlag, type OwnedDocumentLike, type OwnedSceneLike } from "./scene-ownership";
import type { TerrainDocumentFlag } from "./terrain-document";

export interface EmbeddedDocumentLike extends OwnedDocumentLike {}

export interface SceneMutationLike extends OwnedSceneLike {
  createEmbeddedDocuments(
    documentName: PlannedDocumentName,
    sources: Array<Record<string, unknown>>,
  ): Promise<EmbeddedDocumentLike[]>;
  deleteEmbeddedDocuments(
    documentName: PlannedDocumentName,
    ids: string[],
  ): Promise<unknown>;
}

export type CreatedDocumentIds = Record<PlannedDocumentName, string[]>;

const emptyCreatedIds = (): CreatedDocumentIds => ({
  Tile: [], Region: [], AmbientLight: [], AmbientSound: [], Wall: [],
});

const collectionName: Record<PlannedDocumentName, keyof Pick<OwnedSceneLike, "tiles" | "regions" | "lights" | "sounds" | "walls">> = {
  Tile: "tiles", Region: "regions", AmbientLight: "lights", AmbientSound: "sounds", Wall: "walls",
};
const expectedRole: Record<PlannedDocumentName, TerrainDocumentFlag["role"]> = {
  Tile: "terrain-tile", Region: "movement-region", AmbientLight: "terrain-light",
  AmbientSound: "terrain-sound", Wall: "terrain-wall",
};

const documentId = (document: EmbeddedDocumentLike): string | undefined => {
  const id = document.id ?? document._id;
  return typeof id === "string" && id.trim() ? id : undefined;
};

const sceneDocuments = (scene: SceneMutationLike, name: PlannedDocumentName): EmbeddedDocumentLike[] => {
  const collection = scene[collectionName[name]];
  if (!collection || typeof collection[Symbol.iterator] !== "function") {
    throw new Error(`Scene ${name} collection is unavailable for transaction readback`);
  }
  return [...collection];
};

const identity = (flag: TerrainDocumentFlag): string => JSON.stringify([
  flag.bundleId, flag.configurationId, flag.stageIndex, flag.role,
  flag.cellKey ?? null, flag.offset ? [flag.offset.i, flag.offset.j] : null,
  flag.visualLayer ?? null,
  flag.sheetCells?.map(({ i, j }) => [i, j]) ?? null,
]);

interface VerifiedDocument { id: string; identity: string }
const formatIds = (ids: Array<[PlannedDocumentName, string]>): string =>
  ids.map(([name, id]) => `${name}:${id}`).join(", ");

export const applyScenePlan = async (
  scene: SceneMutationLike,
  plan: ScenePlan,
): Promise<CreatedDocumentIds> => {
  const created = emptyCreatedIds();
  const verified: Record<PlannedDocumentName, VerifiedDocument[]> = {
    Tile: [], Region: [], AmbientLight: [], AmbientSound: [], Wall: [],
  };
  const baseline = {} as Record<PlannedDocumentName, Set<string>>;
  const expected = {} as Record<PlannedDocumentName, string[]>;
  let currentDocumentName: PlannedDocumentName = "Tile";

  // Missing readback collections and invalid ownership fail before any Scene write.
  for (const [name, sources] of scenePlanEntries(plan)) {
    baseline[name] = new Set(sceneDocuments(scene, name).map(documentId).filter((id): id is string => Boolean(id)));
    expected[name] = sources.map((source) => {
      const flag = terrainDocumentFlag({ flags: source.flags as Record<string, unknown> });
      if (!flag || flag.role !== expectedRole[name]) {
        throw new Error(`Terrain ${name} source has no valid matching ownership flag`);
      }
      return identity(flag);
    });
  }

  try {
    for (const [documentName, sources] of scenePlanEntries(plan)) {
      currentDocumentName = documentName;
      if (!sources.length) continue;
      const documents = await scene.createEmbeddedDocuments(documentName, sources);
      if (!Array.isArray(documents)) throw new Error(`${documentName} create returned no document array`);
      const sceneAfter = sceneDocuments(scene, documentName);
      const remaining = [...expected[documentName]!];
      const returnedIds = new Set<string>();
      for (const returned of documents) {
        const id = returned && documentId(returned);
        if (!id) throw new Error(`${documentName} create returned a document without a usable ID`);
        if (returnedIds.has(id)) throw new Error(`duplicate ${documentName} create ID: ${id}`);
        returnedIds.add(id);
        if (baseline[documentName]!.has(id)) throw new Error(`${documentName} create returned a pre-existing ID: ${id}`);
        const matches = sceneAfter.filter((document) => documentId(document) === id);
        if (matches.length !== 1) throw new Error(`${documentName} readback for ${id} found ${matches.length} documents`);
        const flag = terrainDocumentFlag(matches[0]!);
        const signature = flag?.role === expectedRole[documentName] ? identity(flag) : undefined;
        const index = signature ? remaining.indexOf(signature) : -1;
        if (index < 0) throw new Error(`${documentName} readback for ${id} has mismatched ownership`);
        remaining.splice(index, 1);
        verified[documentName].push({ id, identity: signature! });
        created[documentName].push(id);
      }
      if (documents.length !== sources.length) {
        throw new Error(`${documentName} expected ${sources.length} created documents, returned ${documents.length}`);
      }
      const unreported = sceneAfter.filter((document) => {
        const id = documentId(document);
        return id && !baseline[documentName]!.has(id) && !returnedIds.has(id);
      });
      if (unreported.length) throw new Error(`${documentName} readback found ${unreported.length} unreported new documents`);
    }

    for (const name of DOCUMENT_ORDER) {
      const actual = sceneDocuments(scene, name);
      const allowedIds = new Set([...baseline[name]!, ...verified[name].map(({ id }) => id)]);
      const unreported = actual.filter(document => {
        const id = documentId(document);
        return !id || !allowedIds.has(id);
      });
      if (unreported.length) {
        currentDocumentName = name;
        throw new Error(`${name} final readback found ${unreported.length} unreported new documents`);
      }
      for (const document of verified[name]) {
        const matches = actual.filter(candidate => documentId(candidate) === document.id);
        const flag = matches.length === 1 ? terrainDocumentFlag(matches[0]!) : undefined;
        if (!flag || identity(flag) !== document.identity) {
          currentDocumentName = name;
          throw new Error(`${name} final readback changed for ${document.id}`);
        }
      }
    }
    return created;
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const name of [...DOCUMENT_ORDER].reverse()) {
      let actual: EmbeddedDocumentLike[];
      try { actual = sceneDocuments(scene, name); }
      catch (caught) { rollbackErrors.push(`${name} readback: ${String(caught)}`); continue; }
      const safeIds = verified[name]
        .filter(({ id, identity: signature }) => {
          const matches = actual.filter(document => documentId(document) === id);
          const flag = matches.length === 1 ? terrainDocumentFlag(matches[0]!) : undefined;
          return flag?.role === expectedRole[name] && identity(flag) === signature;
        })
        .map(({ id }) => id);
      if (!safeIds.length) continue;
      try { await scene.deleteEmbeddedDocuments(name, safeIds); }
      catch (caught) { rollbackErrors.push(`${name}: ${caught instanceof Error ? caught.message : String(caught)}`); }
    }

    const residual: Array<[PlannedDocumentName, string]> = [];
    const unverified: Array<[PlannedDocumentName, string]> = [];
    for (const name of DOCUMENT_ORDER) {
      try {
        const known = new Set(verified[name].map(({ id }) => id));
        for (const document of sceneDocuments(scene, name)) {
          const id = documentId(document);
          if (!id || baseline[name]!.has(id)) continue;
          (known.has(id) ? residual : unverified).push([name, id]);
        }
      } catch (caught) { rollbackErrors.push(`${name} final readback: ${String(caught)}`); }
    }
    const reason = error instanceof Error ? error.message : String(error);
    const suffix = [
      rollbackErrors.length ? `rollback failed: ${rollbackErrors.join("; ")}` : "",
      residual.length ? `residual created IDs: ${formatIds(residual)}` : "",
      unverified.length ? `unverified new Scene IDs (preserved): ${formatIds(unverified)}` : "",
    ].filter(Boolean).join("; ");
    throw new Error(
      `Terrain transaction failed while creating ${currentDocumentName}: ${reason}${suffix ? `; ${suffix}` : ""}`,
      { cause: error },
    );
  }
};
