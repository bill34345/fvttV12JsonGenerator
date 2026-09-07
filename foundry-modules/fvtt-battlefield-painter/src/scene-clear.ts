import {
  ownedDocumentCounts,
  ownedDocumentIds,
  type OwnedSceneLike,
} from "./scene-ownership";

export interface ClearPreview {
  counts: ReturnType<typeof ownedDocumentCounts>;
  fingerprint: string;
  requiresConfirmation: boolean;
}

const fingerprintFor = (scene: OwnedSceneLike): string =>
  ownedDocumentIds(scene).join("|");

export const createClearPreview = (scene: OwnedSceneLike): ClearPreview => {
  const counts = ownedDocumentCounts(scene);
  return {
    counts,
    fingerprint: fingerprintFor(scene),
    requiresConfirmation: counts.totalDocuments > 0,
  };
};

export const isClearPreviewCurrent = (
  scene: OwnedSceneLike,
  preview: ClearPreview,
): boolean => fingerprintFor(scene) === preview.fingerprint;
