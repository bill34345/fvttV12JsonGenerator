import type { DeckSnapshot } from './types.ts';

export type SnapshotBuilder = () => Promise<DeckSnapshot> | DeckSnapshot;
export type DeckStoreListener = (snapshot: DeckSnapshot) => void;

export class DeckStore {
  #snapshot: DeckSnapshot;
  #listeners = new Set<DeckStoreListener>();
  #scheduled = false;
  #invalidated = false;
  #rebuildPromise?: Promise<void>;

  constructor(initial: DeckSnapshot, private readonly builder: SnapshotBuilder) {
    this.#snapshot = deepFreeze(initial);
  }

  get snapshot(): DeckSnapshot { return this.#snapshot; }

  subscribe(listener: DeckStoreListener): () => void {
    this.#listeners.add(listener);
    listener(this.#snapshot);
    return () => this.#listeners.delete(listener);
  }

  invalidate(): void {
    this.#invalidated = true;
    if (this.#scheduled || this.#rebuildPromise) return;
    this.#scheduled = true;
    queueMicrotask(() => void this.#ensureRebuild());
  }

  async refreshNow(): Promise<void> {
    this.#invalidated = true;
    await this.#ensureRebuild();
  }

  setSnapshot(snapshot: DeckSnapshot): void {
    this.#snapshot = deepFreeze(snapshot);
    for (const listener of this.#listeners) listener(this.#snapshot);
  }

  #ensureRebuild(): Promise<void> {
    if (this.#rebuildPromise) return this.#rebuildPromise;
    this.#scheduled = false;
    this.#rebuildPromise = this.#rebuild().finally(() => { this.#rebuildPromise = undefined; });
    return this.#rebuildPromise;
  }

  async #rebuild(): Promise<void> {
    do {
      this.#invalidated = false;
      try {
        this.setSnapshot(await this.builder());
      } catch (error) {
        this.setSnapshot({ ...this.#snapshot, error: String(error), refreshedAt: Date.now() });
      }
    } while (this.#invalidated);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}
