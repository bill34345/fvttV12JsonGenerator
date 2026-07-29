export interface CreatedThumbnail {
  url: string;
  bytes: number;
  releaseSource?: () => void;
}

export interface ThumbnailBackend {
  create(source: string, maxEdge: number, quality: number): Promise<CreatedThumbnail>;
  revoke(url: string): void;
}

interface CacheEntry {
  url: string;
  bytes: number;
  usedAt: number;
}

export interface ThumbnailStats {
  entries: number;
  estimatedBytes: number;
  failures: number;
}

function normalizeSource(source: string): string {
  return source.trim().replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
}

export class ThumbnailCache {
  readonly #backend: ThumbnailBackend;
  readonly #maximumEntries: () => number;
  readonly #onFailure?: (source: string, error: unknown) => void;
  readonly #entries = new Map<string, CacheEntry>();
  readonly #inFlight = new Map<string, Promise<string | undefined>>();
  readonly #failed = new Set<string>();
  #clock = 0;
  #generation = 0;

  constructor(
    backend: ThumbnailBackend,
    maximumEntries: () => number,
    onFailure?: (source: string, error: unknown) => void,
  ) {
    this.#backend = backend;
    this.#maximumEntries = maximumEntries;
    this.#onFailure = onFailure;
  }

  get(source: string, maxEdge: number, quality: number): Promise<string | undefined> {
    const normalized = normalizeSource(source);
    const key = `${normalized}|${maxEdge}|${quality}`;
    const cached = this.#entries.get(key);
    if (cached) {
      cached.usedAt = ++this.#clock;
      return Promise.resolve(cached.url);
    }
    if (this.#failed.has(key)) return Promise.resolve(undefined);
    const existing = this.#inFlight.get(key);
    if (existing) return existing;
    const promise = this.#create(key, normalized, maxEdge, quality, this.#generation);
    this.#inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.#generation++;
    for (const entry of this.#entries.values()) this.#backend.revoke(entry.url);
    this.#entries.clear();
    this.#failed.clear();
  }

  getStats(): ThumbnailStats {
    return {
      entries: this.#entries.size,
      estimatedBytes: Array.from(this.#entries.values()).reduce((sum, entry) => sum + entry.bytes, 0),
      failures: this.#failed.size,
    };
  }

  async #create(
    key: string,
    source: string,
    maxEdge: number,
    quality: number,
    generation: number,
  ): Promise<string | undefined> {
    try {
      const created = await this.#backend.create(source, maxEdge, quality);
      created.releaseSource?.();
      if (generation !== this.#generation) {
        this.#backend.revoke(created.url);
        return undefined;
      }
      this.#entries.set(key, { url: created.url, bytes: created.bytes, usedAt: ++this.#clock });
      this.#evict();
      return created.url;
    } catch (error) {
      if (generation === this.#generation) {
        this.#failed.add(key);
        this.#onFailure?.(source, error);
      }
      return undefined;
    } finally {
      this.#inFlight.delete(key);
    }
  }

  #evict(): void {
    const maximum = Math.max(0, Math.floor(this.#maximumEntries()));
    while (this.#entries.size > maximum) {
      const oldest = Array.from(this.#entries.entries())
        .sort((left, right) => left[1].usedAt - right[1].usedAt)[0];
      if (!oldest) return;
      this.#entries.delete(oldest[0]);
      this.#backend.revoke(oldest[1].url);
    }
  }
}
