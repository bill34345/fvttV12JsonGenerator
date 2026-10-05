import { DOCUMENT_ORDER, type PlannedDocumentName } from "./constants";
import {
  collectOwnedBundles,
  deleteOwnedBundles,
  terrainDocumentFlag,
  type OwnedDocumentLike,
  type OwnedSceneLike,
} from "./scene-ownership";
import type { SceneMutationLike } from "./scene-transaction";

interface SnapshotDocument extends OwnedDocumentLike {
  toObject?: () => Record<string, unknown>;
  [key: string]: unknown;
}

export interface HistorySceneLike
  extends Omit<OwnedSceneLike, "deleteEmbeddedDocuments">,
    SceneMutationLike {
  tiles?: Iterable<SnapshotDocument>;
  regions?: Iterable<SnapshotDocument>;
  lights?: Iterable<SnapshotDocument>;
  walls?: Iterable<SnapshotDocument>;
}

type SceneSnapshot = Record<PlannedDocumentName, Record<string, unknown>[]>;

interface HistoryEntry {
  label: string;
  before: SceneSnapshot;
  after: SceneSnapshot;
}

const HISTORY_DOCUMENT_ORDER = DOCUMENT_ORDER;

const collectionForDocumentName: Record<
  PlannedDocumentName,
  keyof Pick<HistorySceneLike, "tiles" | "regions" | "lights" | "sounds" | "walls">
> = {
  Tile: "tiles",
  Region: "regions",
  AmbientLight: "lights",
  AmbientSound: "sounds",
  Wall: "walls",
};

const cloneSource = (document: SnapshotDocument): Record<string, unknown> => {
  const source = document.toObject
    ? document.toObject()
    : structuredClone(document);
  delete source._id;
  delete source.id;
  // Core regenerates document metadata during restore; it is not terrain state.
  delete source._stats;
  return source;
};

const capture = (scene: HistorySceneLike): SceneSnapshot => {
  const snapshot = {} as SceneSnapshot;
  for (const documentName of DOCUMENT_ORDER) {
    snapshot[documentName] = [];
  }
  for (const documentName of HISTORY_DOCUMENT_ORDER) {
    const collection = scene[collectionForDocumentName[documentName]] ?? [];
    snapshot[documentName] = [...collection]
      .filter((document) => {
        const flag = terrainDocumentFlag(document);
        return Boolean(flag) && (documentName !== "AmbientSound" || flag?.functionalityVersion === 1);
      })
      .map((document) => cloneSource(document as SnapshotDocument));
  }
  return snapshot;
};

const fingerprint = (snapshot: SceneSnapshot): string => JSON.stringify(snapshot);

const restore = async (
  scene: HistorySceneLike,
  snapshot: SceneSnapshot,
): Promise<void> => {
  const bundleIds = new Set(collectOwnedBundles(scene).keys());
  if (bundleIds.size) {
    await deleteOwnedBundles(scene, bundleIds, {
      documentNames: HISTORY_DOCUMENT_ORDER.filter(name => name !== "AmbientSound"),
    });
  }
  const sounds = [...(scene.sounds ?? [])].filter(document => terrainDocumentFlag(document)?.functionalityVersion === 1)
    .map(document => document.id ?? document._id).filter((id): id is string => typeof id === "string");
  if (sounds.length) await scene.deleteEmbeddedDocuments("AmbientSound", sounds);
  for (const documentName of HISTORY_DOCUMENT_ORDER) {
    const sources = snapshot[documentName];
    if (sources.length) await scene.createEmbeddedDocuments(documentName, sources);
  }
};

const restoreSafely = async (scene: HistorySceneLike, target: SceneSnapshot): Promise<void> => {
  const current = capture(scene);
  try {
    await restore(scene, target);
  } catch (error) {
    try { await restore(scene, current); }
    catch (recoveryError) {
      throw new Error(`Terrain history recovery failed: ${String(recoveryError)}`, { cause: error });
    }
    throw error;
  }
};

export class SceneHistory {
  readonly #scene: HistorySceneLike;
  readonly #limit: number;
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];

  constructor(scene: HistorySceneLike, { limit = 20 }: { limit?: number } = {}) {
    this.#scene = scene;
    this.#limit = limit;
  }

  get state(): { canUndo: boolean; canRedo: boolean } {
    return { canUndo: this.#undo.length > 0, canRedo: this.#redo.length > 0 };
  }

  async execute<T>(label: string, mutation: () => Promise<T>): Promise<T> {
    const before = capture(this.#scene);
    let result: T;
    try { result = await mutation(); }
    catch (error) {
      if (fingerprint(capture(this.#scene)) !== fingerprint(before)) {
        try { await restore(this.#scene, before); }
        catch (recoveryError) {
          throw new Error(`Terrain operation recovery failed: ${String(recoveryError)}`, { cause: error });
        }
      }
      throw error;
    }
    const after = capture(this.#scene);
    if (fingerprint(before) !== fingerprint(after)) {
      this.#undo.push({ label, before, after });
      if (this.#undo.length > this.#limit) this.#undo.shift();
      this.#redo.splice(0);
    }
    return result;
  }

  async undo(): Promise<string | undefined> {
    const entry = this.#undo.at(-1);
    if (!entry) return undefined;
    if (fingerprint(capture(this.#scene)) !== fingerprint(entry.after)) {
      throw new Error("地形在上次操作后已被其他操作修改，已阻止撤销以保护当前场景。");
    }
    await restoreSafely(this.#scene, entry.before);
    entry.before = capture(this.#scene);
    this.#undo.pop();
    this.#redo.push(entry);
    return entry.label;
  }

  async redo(): Promise<string | undefined> {
    const entry = this.#redo.at(-1);
    if (!entry) return undefined;
    if (fingerprint(capture(this.#scene)) !== fingerprint(entry.before)) {
      throw new Error("地形在撤销后已被其他操作修改，已阻止重做以保护当前场景。");
    }
    await restoreSafely(this.#scene, entry.after);
    entry.after = capture(this.#scene);
    this.#redo.pop();
    this.#undo.push(entry);
    return entry.label;
  }
}
