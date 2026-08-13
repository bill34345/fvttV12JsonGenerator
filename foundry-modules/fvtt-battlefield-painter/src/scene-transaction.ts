import { DOCUMENT_ORDER, type PlannedDocumentName } from "./constants";
import { scenePlanEntries, type ScenePlan } from "./scene-plan";

export interface EmbeddedDocumentLike {
  id?: string | null;
  _id?: string | null;
}

export interface SceneMutationLike {
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
  Tile: [],
  Region: [],
  AmbientLight: [],
  Wall: [],
});

const documentId = (document: EmbeddedDocumentLike): string => {
  const id = document.id ?? document._id;
  if (!id) throw new Error("Foundry returned an embedded document without an id");
  return id;
};

const rollbackCreated = async (
  scene: SceneMutationLike,
  created: CreatedDocumentIds,
): Promise<void> => {
  for (const documentName of [...DOCUMENT_ORDER].reverse()) {
    const ids = created[documentName];
    if (ids.length) await scene.deleteEmbeddedDocuments(documentName, ids);
  }
};

export const applyScenePlan = async (
  scene: SceneMutationLike,
  plan: ScenePlan,
): Promise<CreatedDocumentIds> => {
  const created = emptyCreatedIds();
  let currentDocumentName: PlannedDocumentName = "Tile";

  try {
    for (const [documentName, sources] of scenePlanEntries(plan)) {
      currentDocumentName = documentName;
      if (!sources.length) continue;
      const documents = await scene.createEmbeddedDocuments(documentName, sources);
      created[documentName] = documents.map(documentId);
    }

    return created;
  } catch (error) {
    let rollbackError: unknown;
    try {
      await rollbackCreated(scene, created);
    } catch (caught) {
      rollbackError = caught;
    }

    const reason = error instanceof Error ? error.message : String(error);
    const suffix = rollbackError
      ? `; rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
      : "";
    throw new Error(
      `Terrain transaction failed while creating ${currentDocumentName}: ${reason}${suffix}`,
      { cause: error },
    );
  }
};
