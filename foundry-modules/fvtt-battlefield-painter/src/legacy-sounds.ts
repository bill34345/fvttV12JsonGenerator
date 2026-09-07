import type { PlannedDocumentName } from "./constants";
import {
  collectOwnedBundles,
  type OwnedDocumentLike,
  type OwnedSceneLike,
} from "./scene-ownership";

export interface LegacySoundPreview {
  readonly soundIds: readonly string[];
  readonly fingerprint: string;
  readonly requiresConfirmation: boolean;
}

const idOf = (document: OwnedDocumentLike): string | undefined =>
  document.id ?? document._id ?? undefined;

export const ownedLegacySoundIds = (scene: OwnedSceneLike): string[] =>
  [...collectOwnedBundles(scene).values()]
    .flatMap((bundle) => bundle.AmbientSound)
    .map(idOf)
    .filter((id): id is string => Boolean(id))
    .sort();

const fingerprintForIds = (ids: readonly string[]): string =>
  JSON.stringify([...ids].sort());

const fingerprintFor = (scene: OwnedSceneLike): string =>
  fingerprintForIds(ownedLegacySoundIds(scene));

export const createLegacySoundPreview = (
  scene: OwnedSceneLike,
): LegacySoundPreview => {
  const soundIds = Object.freeze(ownedLegacySoundIds(scene));
  return Object.freeze({
    soundIds,
    fingerprint: fingerprintForIds(soundIds),
    requiresConfirmation: soundIds.length > 0,
  });
};

export const isLegacySoundPreviewCurrent = (
  scene: OwnedSceneLike,
  preview: LegacySoundPreview,
): boolean => fingerprintFor(scene) === preview.fingerprint;

export const deleteLegacySounds = async (
  scene: OwnedSceneLike,
  preview: LegacySoundPreview,
): Promise<void> => {
  if (!scene.deleteEmbeddedDocuments) {
    throw new Error("The active Scene cannot delete embedded documents");
  }
  if (!isLegacySoundPreviewCurrent(scene, preview)) {
    throw new Error("Legacy sound preview is stale; refresh before deleting");
  }
  const currentSoundIds = ownedLegacySoundIds(scene);
  if (fingerprintForIds(currentSoundIds) !== preview.fingerprint) {
    throw new Error("Legacy sound preview is stale; refresh before deleting");
  }
  if (!currentSoundIds.length) return;
  await scene.deleteEmbeddedDocuments(
    "AmbientSound" as PlannedDocumentName,
    currentSoundIds,
  );
};
