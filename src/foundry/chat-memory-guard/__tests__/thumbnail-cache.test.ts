import { describe, expect, test } from 'bun:test';
import { ThumbnailCache } from '../thumbnail-cache';

describe('session thumbnail cache', () => {
  test('deduplicates concurrent requests and closes source bitmaps', async () => {
    let generated = 0;
    let closed = 0;
    const cache = new ThumbnailCache({
      create: async (source, edge, quality) => {
        generated++;
        return {
          url: `blob:${source}:${edge}:${quality}`,
          bytes: 123,
          releaseSource: () => { closed++; },
        };
      },
      revoke: () => {},
    }, () => 64);
    const [first, second] = await Promise.all([
      cache.get('icons/a.png', 128, 75),
      cache.get('./icons/a.png', 128, 75),
    ]);
    expect(first).toBe(second);
    expect(generated).toBe(1);
    expect(closed).toBe(1);
  });

  test('evicts least recently used entries and revokes every URL on clear', async () => {
    const revoked: string[] = [];
    const cache = new ThumbnailCache({
      create: async (source) => ({ url: `blob:${source}`, bytes: 10 }),
      revoke: (url) => revoked.push(url),
    }, () => 2);
    await cache.get('a.png', 128, 75);
    await cache.get('b.png', 128, 75);
    await cache.get('a.png', 128, 75);
    await cache.get('c.png', 128, 75);
    expect(revoked).toEqual(['blob:b.png']);
    cache.clear();
    expect(revoked.sort()).toEqual(['blob:a.png', 'blob:b.png', 'blob:c.png']);
    expect(cache.getStats()).toEqual({ entries: 0, estimatedBytes: 0, failures: 0 });
  });

  test('records a failed source once without rejecting chat rendering', async () => {
    let attempts = 0;
    const warnings: string[] = [];
    const cache = new ThumbnailCache({
      create: async () => { attempts++; throw new Error('broken'); },
      revoke: () => {},
    }, () => 64, (source) => warnings.push(source));
    expect(await cache.get('broken.png', 128, 75)).toBeUndefined();
    expect(await cache.get('broken.png', 128, 75)).toBeUndefined();
    expect(attempts).toBe(1);
    expect(cache.getStats().failures).toBe(1);
    expect(warnings).toEqual(['broken.png']);
  });

  test('revokes an in-flight thumbnail that completes after session cleanup', async () => {
    let finish!: (value: { url: string; bytes: number }) => void;
    const revoked: string[] = [];
    const cache = new ThumbnailCache({
      create: () => new Promise((resolve) => { finish = resolve; }),
      revoke: (url) => revoked.push(url),
    }, () => 64);
    const pending = cache.get('slow.png', 128, 75);
    cache.clear();
    finish({ url: 'blob:stale', bytes: 20 });
    expect(await pending).toBeUndefined();
    expect(revoked).toEqual(['blob:stale']);
    expect(cache.getStats().entries).toBe(0);
  });
});
