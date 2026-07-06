import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  pipelineExitCode,
  runGoddessFantasyPipeline,
  type GoddessFantasyPipelineDependencies,
} from '../goddessFantasyPipeline';

describe('GoddessFantasy pipeline', () => {
  test('runs crawl, plaintext conversion, and actor ingest in order', async () => {
    const calls: string[] = [];
    const deps: GoddessFantasyPipelineDependencies = {
      crawl: async (options) => {
        calls.push(`crawl:${options.crawlMode}`);
        expect(options.force).toBe(false);
        return crawlResult({ outDir: 'crawl-out', newTopicIds: ['170008'] });
      },
      recordsToPlaintext: (options) => {
        calls.push(`plaintext:${options.recordsPath}`);
        expect(options.force).toBe(true);
        expect(options.outDir).toBe('crawl-out/plaintext/monsters');
        return plaintextResult({
          recordsPath: options.recordsPath,
          outDir: options.outDir!,
          outFile: join('crawl-out', 'plaintext', 'monsters.md'),
        });
      },
      ingestActors: async (options) => {
        calls.push(`actor:${options.sourcePath}`);
        expect(options.vaultPath).toBe('vault');
        expect(options.effectProfile).toBe('modded-v12');
        expect(options.fvttVersion).toBe('12');
        return actorResult();
      },
    };

    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      outDir: 'crawl-out',
      plaintextOutDir: 'crawl-out/plaintext/monsters',
      vaultPath: 'vault',
      crawlMode: 'incremental',
      force: false,
      contentType: 'monster',
    }, deps);

    expect(calls).toEqual([
      'crawl:incremental',
      `plaintext:${join('crawl-out', 'records.json')}`,
      `actor:${join('crawl-out', 'plaintext', 'monsters.md')}`,
    ]);
    expect(result.stoppedAfter).toBe('complete');
    expect(pipelineExitCode(result)).toBe(0);
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
