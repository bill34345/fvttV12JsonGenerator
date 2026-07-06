import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { writeTokenReviewContactSheet } from '../tokenReviewContactSheet';
import type { TokenReviewItem } from '../tokenReview';

describe('writeTokenReviewContactSheet', () => {
  it('writes a readable PNG contact sheet', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'token-review-sheet-'));
    const tokenPath = join(dir, 'token.webp');
    const outPath = join(dir, 'sheet.png');

    try {
      await sharp({
        create: {
          width: 64,
          height: 64,
          channels: 4,
          background: { r: 180, g: 20, b: 20, alpha: 1 },
        },
      }).webp().toFile(tokenPath);

      await writeTokenReviewContactSheet({
        items: [item(tokenPath)],
        outPath,
        title: 'Token Review',
      });

      const metadata = await sharp(outPath).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
    } finally {
      await removeTempDir(dir);
    }
  });
});

async function removeTempDir(path: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error: any) {
      if (error?.code !== 'EBUSY') throw error;
      if (attempt === 4) return;
      await Bun.sleep(250);
    }
  }
}

function item(localTokenPath: string): TokenReviewItem {
  return {
    slug: 'test-token',
    displayName: 'Test Token',
    actorJsonPath: 'actor.json',
    tokenUrl: 'http://example.test/token.webp',
    localTokenPath,
    cropStatus: 'missing',
    visualHints: {
      positionHints: [],
      appearanceHints: [],
      captionHints: [],
      weakHints: [],
    },
    reasons: ['unconfirmed-token'],
    status: 'needs_review',
  };
}
