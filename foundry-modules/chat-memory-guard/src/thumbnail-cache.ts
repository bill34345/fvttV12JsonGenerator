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
  #failureCount = 0;

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
    const promise = this.#create(key, normalized, maxEdge, quality, this.#generation).finally(() => {
      // Completion belongs to this request, not a newer request for the same key.
      if (this.#inFlight.get(key) === promise) this.#inFlight.delete(key);
    });
    this.#inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.#generation++;
    for (const entry of this.#entries.values()) this.#backend.revoke(entry.url);
    this.#entries.clear();
    this.#failed.clear();
    this.#inFlight.clear();
    this.#failureCount = 0;
  }

  getStats(): ThumbnailStats {
    return {
      entries: this.#entries.size,
      estimatedBytes: Array.from(this.#entries.values()).reduce((sum, entry) => sum + entry.bytes, 0),
      failures: this.#failureCount,
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
      return this.#entries.has(key) ? created.url : undefined;
    } catch (error) {
      if (generation === this.#generation) {
        this.#failed.add(key);
        this.#failureCount++;
        while (this.#failed.size > this.#capacity()) {
          const oldest = this.#failed.values().next().value;
          if (oldest === undefined) break;
          this.#failed.delete(oldest);
        }
        this.#onFailure?.(source, error);
      }
      return undefined;
    }
  }

  #capacity(): number {
    const maximum = this.#maximumEntries();
    return Number.isFinite(maximum) ? Math.max(0, Math.floor(maximum)) : 0;
  }

  #evict(): void {
    const maximum = this.#capacity();
    while (this.#entries.size > maximum) {
      const oldest = Array.from(this.#entries.entries())
        .sort((left, right) => left[1].usedAt - right[1].usedAt)[0];
      if (!oldest) return;
      this.#entries.delete(oldest[0]);
      this.#backend.revoke(oldest[1].url);
    }
  }
}
