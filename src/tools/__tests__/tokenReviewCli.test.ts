import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

describe('token-review CLI', () => {
  test('token-review --dry-run reports stats without writing artifacts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'token-review-cli-dry-'));
    try {
      const fixture = await writeTokenReviewFixture(root);
      const result = await runCli([
        'token-review',
        '--vault',
        fixture.vault,
        '--crawl-dir',
        fixture.crawlDir,
        '--token-crops',
        fixture.tokenCropsPath,
        '--out-dir',
        fixture.reviewOutDir,
        '--dry-run',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Token review');
      expect(result.stdout).toContain('Total: 2');
      expect(result.stdout).toContain('Needs review:');
      expect(existsSync(join(fixture.reviewOutDir, 'token-review.json'))).toBe(false);
    } finally {
      await removeTempDir(root);
    }
  }, 20_000);

  test('token-review writes artifacts and can fail on needs_review', async () => {
    const root = mkdtempSync(join(tmpdir(), 'token-review-cli-write-'));
    try {
      const fixture = await writeTokenReviewFixture(root);
      const result = await runCli([
        'token-review',
        '--vault',
        fixture.vault,
        '--crawl-dir',
        fixture.crawlDir,
        '--token-crops',
        fixture.tokenCropsPath,
        '--out-dir',
        fixture.reviewOutDir,
        '--fail-on-needs-review',
      ]);

      expect(result.exitCode).toBe(1);
      expect(existsSync(join(fixture.reviewOutDir, 'token-review.json'))).toBe(true);
      expect(existsSync(join(fixture.reviewOutDir, 'token-review.md'))).toBe(true);
      expect(existsSync(join(fixture.reviewOutDir, 'contact-sheet-001.png'))).toBe(true);
      const review = JSON.parse(readFileSync(join(fixture.reviewOutDir, 'token-review.json'), 'utf-8'));
      expect(review.summary.total).toBe(2);
    } finally {
      await removeTempDir(root);
    }
  }, 20_000);
});

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', 'run', 'src/tools/crawlSites.ts', ...args], {
    cwd: resolve(process.cwd()),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function writeTokenReviewFixture(root: string): Promise<{
  vault: string;
  crawlDir: string;
  tokenCropsPath: string;
  reviewOutDir: string;
}> {
  const vault = join(root, 'vault');
  const output = join(vault, 'output');
  const actorsDir = join(output, 'assets', 'goddessfantasy', 'actors');
  const tokensDir = join(output, 'assets', 'goddessfantasy', 'tokens');
  const crawlDir = join(vault, 'crawls', 'goddessfantasy', 'board-2318');
  const plaintextDir = join(crawlDir, 'plaintext');
  const reviewOutDir = join(output, 'assets', 'goddessfantasy', 'token-review');
  mkdirSync(actorsDir, { recursive: true });
  mkdirSync(tokensDir, { recursive: true });
  mkdirSync(plaintextDir, { recursive: true });

  for (const slug of ['shared-one', 'shared-two']) {
    await sharp({
      create: {
        width: 100,
        height: 300,
        channels: 4,
        background: { r: 50, g: 120, b: 180, alpha: 1 },
      },
    }).png().toFile(join(actorsDir, `${slug}__12345678.png`));
    await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 4,
        background: { r: 180, g: 40, b: 40, alpha: 1 },
      },
    }).webp().toFile(join(tokensDir, `${slug}__12345678.webp`));
    writeFileSync(join(output, `${slug}__test.json`), JSON.stringify({
      name: slug,
      img: `http://example.test/imgSource/actors/${slug}__12345678.png`,
      prototypeToken: {
        texture: {
          src: `http://example.test/imgSource/tokens/${slug}__12345678.webp`,
        },
      },
    }), 'utf-8');
  }

  writeFileSync(join(plaintextDir, 'manifest.json'), JSON.stringify({
    items: [
      { topicId: '1', fileName: '1__shared-one.md', chineseName: 'One', englishName: 'Shared One', heading: 'One (Shared One)' },
      { topicId: '1', fileName: '1__shared-two.md', chineseName: 'Two', englishName: 'Shared Two', heading: 'Two (Shared Two)' },
    ],
  }), 'utf-8');
  writeFileSync(join(crawlDir, 'records.json'), JSON.stringify([
    {
      topicId: '1',
      title: 'Shared',
      posts: [
        {
          text: '(http://example.test/shared.png) From left to right: Shared One, Shared Two. Shared One AC 10 HP 10',
        },
      ],
    },
  ]), 'utf-8');
  const tokenCropsPath = join(plaintextDir, 'token-crops.json');
  writeFileSync(tokenCropsPath, JSON.stringify({
    12345678: { left: 0, top: 0, width: 1, height: 1 },
  }), 'utf-8');

  return { vault, crawlDir, tokenCropsPath, reviewOutDir };
}

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
