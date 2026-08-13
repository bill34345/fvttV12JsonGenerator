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

const collectionForDocumentName: Record<
  PlannedDocumentName,
  keyof Pick<HistorySceneLike, "tiles" | "regions" | "lights" | "walls">
> = {
  Tile: "tiles",
  Region: "regions",
  AmbientLight: "lights",
  Wall: "walls",
};

const cloneSource = (document: SnapshotDocument): Record<string, unknown> => {
  const source = document.toObject
    ? document.toObject()
    : structuredClone(document);
  delete source._id;
  delete source.id;
  return source;
};

const capture = (scene: HistorySceneLike): SceneSnapshot => {
  const snapshot = {} as SceneSnapshot;
  for (const documentName of DOCUMENT_ORDER) {
    const collection = scene[collectionForDocumentName[documentName]] ?? [];
    snapshot[documentName] = [...collection]
      .filter((document) => Boolean(terrainDocumentFlag(document)))
      .map(cloneSource);
  }
  return snapshot;
};

const fingerprint = (snapshot: SceneSnapshot): string => JSON.stringify(snapshot);

const restore = async (
  scene: HistorySceneLike,
  snapshot: SceneSnapshot,
): Promise<void> => {
  const bundleIds = new Set(collectOwnedBundles(scene).keys());
  if (bundleIds.size) await deleteOwnedBundles(scene, bundleIds);
  for (const documentName of DOCUMENT_ORDER) {
    const sources = snapshot[documentName];
    if (sources.length) await scene.createEmbeddedDocuments(documentName, sources);
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
    const result = await mutation();
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
    await restore(this.#scene, entry.before);
    this.#undo.pop();
    this.#redo.push(entry);
    return entry.label;
  }

  async redo(): Promise<string | undefined> {
    const entry = this.#redo.at(-1);
    if (!entry) return undefined;
    await restore(this.#scene, entry.after);
    this.#redo.pop();
    this.#undo.push(entry);
    return entry.label;
  }
}
