import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parsePipelineFvttVersion,
  parsePipelineEffectProfile,
  pipelineExitCode,
  runGoddessFantasyPipeline,
  type GoddessFantasyPipelineDependencies,
} from '../goddessFantasyPipeline';

afterEach(() => {
  rmSync('crawl-out', { recursive: true, force: true });
});

describe('GoddessFantasy pipeline', () => {
  test('runs crawl, plaintext conversion, and actor ingest in order', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-pipeline-order-'));
    const outDir = join(root, 'crawl');
    const plaintextOutDir = join(outDir, 'plaintext', 'monsters');
    const vaultPath = join(root, 'vault');
    const calls: string[] = [];
    const deps: GoddessFantasyPipelineDependencies = {
      crawl: async (options) => {
        calls.push(`crawl:${options.crawlMode}`);
        expect(options.force).toBe(false);
        return crawlResult({ outDir, newTopicIds: ['170008'] });
      },
      recordsToPlaintext: (options) => {
        calls.push(`plaintext:${options.recordsPath}`);
        expect(options.force).toBe(true);
        expect(options.outDir).toBe(plaintextOutDir);
        return plaintextResult({
          recordsPath: options.recordsPath,
          outDir: options.outDir!,
          outFile: join(outDir, 'plaintext', 'monsters.md'),
        });
      },
      ingestActors: async (options) => {
        calls.push(`actor:${options.sourcePath}`);
        expect(options.vaultPath).toBe(vaultPath);
        expect(options.effectProfile).toBe('modded-v12');
        expect(options.fvttVersion).toBe('12');
        return actorResult();
      },
    };

    try {
      const result = await runGoddessFantasyPipeline({
        boardUrl: 'https://example.test/board',
        outDir,
        plaintextOutDir,
        vaultPath,
        crawlMode: 'incremental',
        force: false,
        contentType: 'monster',
      }, deps);

      expect(calls.slice(0, 2)).toEqual([
        'crawl:incremental',
        `plaintext:${join(outDir, 'records.json')}`,
      ]);
      expect(calls[2]?.startsWith('actor:')).toBe(true);
      expect(result.stoppedAfter).toBe('complete');
      expect(pipelineExitCode(result)).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('dry-run stops after crawl and does not run downstream stages', async () => {
    const calls: string[] = [];
    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      dryRun: true,
    }, {
      crawl: async () => {
        calls.push('crawl');
        return crawlResult({ dryRun: true, recordsAfter: 23, newTopicIds: ['170013'] });
      },
      recordsToPlaintext: () => {
        calls.push('plaintext');
        throw new Error('should not run');
      },
      ingestActors: async () => {
        calls.push('actor');
        throw new Error('should not run');
      },
    });

    expect(calls).toEqual(['crawl']);
    expect(result.stoppedAfter).toBe('crawl-dry-run');
    expect(pipelineExitCode(result)).toBe(0);
  });

  test('stops before actor generation when plaintext has warnings in strict mode', async () => {
    const calls: string[] = [];
    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      failOnWarning: true,
    }, {
      crawl: async () => {
        calls.push('crawl');
        return crawlResult({});
      },
      recordsToPlaintext: () => {
        calls.push('plaintext');
        return plaintextResult({ warnings: [{ topicId: '1', code: 'needs-review', message: 'review' }] });
      },
      ingestActors: async () => {
        calls.push('actor');
        throw new Error('should not run');
      },
    });

    expect(calls).toEqual(['crawl', 'plaintext']);
    expect(result.stoppedAfter).toBe('plaintext-warning');
    expect(result.warnings).toBe(1);
    expect(pipelineExitCode(result)).toBe(1);
  });

  test('uses a generated ingest collection when warning-tolerant plaintext export omits the aggregate file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gf-pipeline-warning-source-'));
    const outDir = join(root, 'crawl');
    const plaintextOutDir = join(outDir, 'plaintext', 'monsters');
    const aggregatePath = join(outDir, 'plaintext', 'monsters.md');

    try {
      let actorSourcePath = '';
      const result = await runGoddessFantasyPipeline({
        boardUrl: 'https://example.test/board',
        outDir,
        plaintextOutDir,
        failOnWarning: false,
      }, {
        crawl: async () => crawlResult({ outDir }),
        recordsToPlaintext: () => plaintextResult({
          outDir: plaintextOutDir,
          outFile: aggregatePath,
          warnings: [{ topicId: '1', code: 'needs-review', message: 'review' }],
          items: [{
            topicId: '1',
            title: 'Needs Review',
            status: 'needs_review',
            fileName: '1__needs-review.md',
            outputPath: join(plaintextOutDir, '1__needs-review.md'),
            heading: 'Needs Review',
            markdown: '# **Needs Review**\n\nplaceholder\n',
            warnings: [{ topicId: '1', code: 'needs-review', message: 'review' }],
          }],
        }),
        ingestActors: async (options) => {
          actorSourcePath = options.sourcePath;
          expect(existsSync(options.sourcePath)).toBe(true);
          expect(readFileSync(options.sourcePath, 'utf-8')).toContain('# **Needs Review**');
          return actorResult();
        },
      });

      expect(result.stoppedAfter).toBe('complete');
      expect(actorSourcePath.endsWith('monsters.pipeline-ingest.md')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('reports actor image warnings as a pipeline warning failure by default', async () => {
    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
    }, {
      crawl: async () => crawlResult({}),
      recordsToPlaintext: () => plaintextResult({}),
      ingestActors: async () => actorResult({ warnings: [{ stage: 'upload', message: 'upload failed' }] }),
    });

    expect(result.stoppedAfter).toBe('actor-warning');
    expect(result.warnings).toBe(1);
    expect(pipelineExitCode(result)).toBe(1);
  });

  test('does not run token review by default', async () => {
    const calls: string[] = [];
    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      outDir: 'crawl-out',
      vaultPath: 'vault',
    }, {
      crawl: async () => crawlResult({ outDir: 'crawl-out' }),
      recordsToPlaintext: () => plaintextResult({}),
      ingestActors: async () => actorResult(),
      tokenReview: async () => {
        calls.push('token-review');
        return tokenReviewResult();
      },
    });

    expect(calls).toEqual([]);
    expect(result.tokenReview).toBeUndefined();
    expect(result.stoppedAfter).toBe('complete');
  });

  test('runs token review after actor ingest when requested', async () => {
    const calls: string[] = [];
    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      outDir: 'crawl-out',
      vaultPath: 'vault',
      reviewTokens: true,
      tokenReviewOutDir: 'review-out',
    }, {
      crawl: async () => crawlResult({ outDir: 'crawl-out' }),
      recordsToPlaintext: () => plaintextResult({}),
      ingestActors: async () => actorResult(),
      tokenReview: async (options) => {
        calls.push(`token-review:${options.vaultPath}:${options.crawlDir}:${options.outDir}`);
        expect(options.tokenCropsPath).toBeUndefined();
        return tokenReviewResult({ needsReview: 2 });
      },
    });

    expect(calls).toEqual(['token-review:vault:crawl-out:review-out']);
    expect(result.tokenReview?.summary.needsReview).toBe(2);
    expect(result.stoppedAfter).toBe('complete');
    expect(result.warnings).toBe(2);
    expect(pipelineExitCode(result)).toBe(0);
  });

  test('can fail after token review without discarding generated actor output', async () => {
    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      outDir: 'crawl-out',
      vaultPath: 'vault',
      reviewTokens: true,
      failOnTokenReview: true,
    }, {
      crawl: async () => crawlResult({ outDir: 'crawl-out' }),
      recordsToPlaintext: () => plaintextResult({}),
      ingestActors: async () => actorResult(),
      tokenReview: async () => tokenReviewResult({ needsReview: 1, failed: 1 }),
    });

    expect(result.actor).toBeDefined();
    expect(result.tokenReview).toBeDefined();
    expect(result.stoppedAfter).toBe('token-review');
    expect(result.warnings).toBe(1);
    expect(result.failures).toBe(1);
    expect(pipelineExitCode(result)).toBe(1);
  });

  test('accepts Foundry v14 and passes it to actor ingest', async () => {
    const deps: GoddessFantasyPipelineDependencies = {
      crawl: async () => crawlResult({}),
      recordsToPlaintext: () => plaintextResult({}),
      ingestActors: async (options) => {
        expect(options.fvttVersion).toBe('14');
        expect(options.effectProfile).toBe('core');
        return actorResult();
      },
    };

    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      fvttVersion: '14',
    }, deps);

    expect(result.stoppedAfter).toBe('complete');
  });

  test('accepts explicit modded-v14 profile for Foundry v14 actor ingest', async () => {
    const deps: GoddessFantasyPipelineDependencies = {
      crawl: async () => crawlResult({}),
      recordsToPlaintext: () => plaintextResult({}),
      ingestActors: async (options) => {
        expect(options.fvttVersion).toBe('14');
        expect(options.effectProfile).toBe('modded-v14');
        return actorResult({ effectProfile: 'modded-v14' });
      },
    };

    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      fvttVersion: '14',
      effectProfile: 'modded-v14' as any,
    }, deps);

    expect(result.stoppedAfter).toBe('complete');
  });

  test('parses Foundry v14 as a supported pipeline target', () => {
    expect(parsePipelineFvttVersion('14')).toBe('14');
  });

  test('parses modded-v14 as a supported pipeline effect profile', () => {
    expect(parsePipelineEffectProfile('modded-v14')).toBe('modded-v14');
  });
});

function crawlResult(overrides: Partial<any>): any {
  return {
    boardId: '2318',
    outDir: 'crawl-out',
    mode: 'incremental',
    topicsDiscovered: 2,
    topicsMatched: 2,
    topicsCrawled: 1,
    topicsSkipped: 1,
    topicsReused: 1,
    recordsBefore: 1,
    recordsAfter: 2,
    newTopicIds: [],
    failures: 0,
    dryRun: false,
    ...overrides,
  };
}

function plaintextResult(overrides: Partial<any>): any {
  const outDir = overrides.outDir ?? join('crawl-out', 'plaintext', 'monsters');
  return {
    recordsPath: join('crawl-out', 'records.json'),
    outDir,
    outFile: join('crawl-out', 'plaintext', 'monsters.md'),
    legacyCollection: false,
    recordsRead: 2,
    recordsMatched: 2,
    blocksEmitted: 2,
    filesWritten: 2,
    skipped: 0,
    warnings: [],
    failures: [],
    items: [],
    dryRun: false,
    markdown: '# Monsters',
    ...overrides,
  };
}

function actorResult(overrides: Partial<any> = {}): any {
  return {
    sourcePath: join('crawl-out', 'plaintext', 'monsters.md'),
    vaultPath: 'vault',
    effectProfile: 'modded-v12',
    markdown: {
      files: [{ fileName: 'monster.md', sections: {}, rawNotes: [] }],
      emitDir: join('vault', 'middle'),
      dryRun: false,
      usedAi: false,
    },
    sync: {
      outputDir: join('vault', 'output'),
      processed: 1,
      skipped: 0,
      failed: 0,
      backedUp: 0,
      failures: [],
      warnings: [],
      ...overrides,
    },
  };
}

function tokenReviewResult(overrides: Partial<{ ok: number; needsReview: number; failed: number }> = {}): any {
  const summary = {
    total: (overrides.ok ?? 1) + (overrides.needsReview ?? 0) + (overrides.failed ?? 0),
    ok: overrides.ok ?? 1,
    needsReview: overrides.needsReview ?? 0,
    failed: overrides.failed ?? 0,
  };
  return {
    generatedAt: '2026-06-24T00:00:00.000Z',
    items: [],
    summary,
    artifacts: {
      jsonPath: 'review-out/token-review.json',
      markdownPath: 'review-out/token-review.md',
    },
  };
}
