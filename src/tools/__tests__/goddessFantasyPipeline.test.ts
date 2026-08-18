import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
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
  test('runs crawl, canonical source conversion, optional audit export, and Actor collection in order', async () => {
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
      recordsToCanonical: (options) => {
        calls.push(`canonical:${options.recordsPath}`);
        return canonicalResult({ recordsPath: options.recordsPath });
      },
      recordsToPlaintext: (options) => {
        calls.push(`audit:${options.recordsPath}`);
        expect(options.force).toBe(true);
        expect(options.outDir).toBe(plaintextOutDir);
        return plaintextResult({
          recordsPath: options.recordsPath,
          outDir: options.outDir!,
          outFile: join(outDir, 'plaintext', 'monsters.md'),
        });
      },
      convertCanonicalActors: async (options) => {
        calls.push(`actor:${options.sources[0]?.sourceId ?? 'none'}`);
        expect(options.vaultPath).toBe(vaultPath);
        expect(options.effectProfile).toBe('core');
        expect(options.fvttVersion).toBe('14');
        return canonicalActorResult();
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
        emitPlaintextAudit: true,
      }, deps);

      expect(calls.slice(0, 3)).toEqual([
        'crawl:incremental',
        `canonical:${join(outDir, 'records.json')}`,
        `audit:${join(outDir, 'records.json')}`,
      ]);
      expect(calls[3]?.startsWith('actor:')).toBe(true);
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
      recordsToCanonical: () => {
        calls.push('canonical');
        throw new Error('should not run');
      },
      convertCanonicalActors: async () => {
        calls.push('actor');
        throw new Error('should not run');
      },
    });

    expect(calls).toEqual(['crawl']);
    expect(result.stoppedAfter).toBe('crawl-dry-run');
    expect(pipelineExitCode(result)).toBe(0);
  });

  test('changing the optional plaintext audit flag does not change canonical Actor inputs or status', async () => {
    const actorInputs: string[][] = [];
    const auditCalls: boolean[] = [];
    const dependencies: GoddessFantasyPipelineDependencies = {
      crawl: async () => crawlResult({}),
      recordsToCanonical: () => canonicalResult(),
      recordsToPlaintext: () => {
        auditCalls.push(true);
        return plaintextResult({});
      },
      convertCanonicalActors: async (options) => {
        actorInputs.push(options.sources.map((source) => source.markdown));
        return canonicalActorResult();
      },
    };

    const withoutAudit = await runGoddessFantasyPipeline({ boardUrl: 'https://example.test/board' }, dependencies);
    const withAudit = await runGoddessFantasyPipeline({ boardUrl: 'https://example.test/board', emitPlaintextAudit: true }, dependencies);

    expect(auditCalls).toHaveLength(1);
    expect(actorInputs[0]).toEqual(actorInputs[1]);
    expect(withoutAudit.actorCollection?.status).toBe(withAudit.actorCollection?.status);
    expect(withoutAudit.stoppedAfter).toBe(withAudit.stoppedAfter);
  });

  test('stops before Actor generation when canonical source conversion has warnings in strict mode', async () => {
    const calls: string[] = [];
    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      failOnWarning: true,
    }, {
      crawl: async () => {
        calls.push('crawl');
        return crawlResult({});
      },
      recordsToCanonical: () => {
        calls.push('canonical');
        return canonicalResult({ warnings: [{ sourceId: 'source-1', code: 'needs-review', message: 'review' }] });
      },
      convertCanonicalActors: async () => {
        calls.push('actor');
        throw new Error('should not run');
      },
    });

    expect(calls).toEqual(['crawl', 'canonical']);
    expect(result.stoppedAfter).toBe('source-warning');
    expect(result.warnings).toBe(1);
    expect(pipelineExitCode(result)).toBe(1);
  });

  test('does not promote warning-bearing canonical sources even in warning-tolerant mode', async () => {
    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      failOnWarning: false,
    }, {
      crawl: async () => crawlResult({}),
      recordsToCanonical: () => canonicalResult({
        sources: [canonicalSource({ status: 'needs_review', warnings: [{ sourceId: 'source-1', code: 'needs-review', message: 'review' }] })],
        warnings: [{ sourceId: 'source-1', code: 'needs-review', message: 'review' }],
      }),
    });

    expect(result.actorCollection?.status).toBe('needs_review');
    expect(result.actorCollection?.succeeded).toBe(0);
    expect(result.stoppedAfter).toBe('complete');
    expect(pipelineExitCode(result)).toBe(0);
  });

  test('reports actor image warnings as a pipeline warning failure by default', async () => {
    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
    }, {
      crawl: async () => crawlResult({}),
      recordsToCanonical: () => canonicalResult({}),
      convertCanonicalActors: async () => canonicalActorResult({ warnings: [{ code: 'image-upload', message: 'upload failed' }] }),
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
      recordsToCanonical: () => canonicalResult({}),
      convertCanonicalActors: async () => canonicalActorResult(),
      tokenReview: async () => {
        calls.push('token-review');
        return tokenReviewResult();
      },
    });

    expect(calls).toEqual([]);
    expect(result.tokenReview).toBeUndefined();
    expect(result.stoppedAfter).toBe('complete');
  });

  test('runs token review after canonical Actor collection when requested', async () => {
    const calls: string[] = [];
    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      outDir: 'crawl-out',
      vaultPath: 'vault',
      reviewTokens: true,
      tokenReviewOutDir: 'review-out',
    }, {
      crawl: async () => crawlResult({ outDir: 'crawl-out' }),
      recordsToCanonical: () => canonicalResult({}),
      convertCanonicalActors: async () => canonicalActorResult(),
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
      recordsToCanonical: () => canonicalResult({}),
      convertCanonicalActors: async () => canonicalActorResult(),
      tokenReview: async () => tokenReviewResult({ needsReview: 1, failed: 1 }),
    });

    expect(result.actorCollection).toBeDefined();
    expect(result.tokenReview).toBeDefined();
    expect(result.stoppedAfter).toBe('token-review');
    expect(result.warnings).toBe(1);
    expect(result.failures).toBe(1);
    expect(pipelineExitCode(result)).toBe(1);
  });

  test('accepts Foundry v14 and passes it to canonical Actor collection', async () => {
    const deps: GoddessFantasyPipelineDependencies = {
      crawl: async () => crawlResult({}),
      recordsToCanonical: () => canonicalResult({}),
      convertCanonicalActors: async (options) => {
        expect(options.fvttVersion).toBe('14');
        expect(options.effectProfile).toBe('core');
        return canonicalActorResult();
      },
    };

    const result = await runGoddessFantasyPipeline({
      boardUrl: 'https://example.test/board',
      fvttVersion: '14',
    }, deps);

    expect(result.stoppedAfter).toBe('complete');
  });

  test('accepts explicit modded-v14 profile for Foundry v14 canonical Actor collection', async () => {
    const deps: GoddessFantasyPipelineDependencies = {
      crawl: async () => crawlResult({}),
      recordsToCanonical: () => canonicalResult({}),
      convertCanonicalActors: async (options) => {
        expect(options.fvttVersion).toBe('14');
        expect(options.effectProfile).toBe('modded-v14');
        return canonicalActorResult({ effectProfile: 'modded-v14' });
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

function canonicalSource(overrides: Partial<any> = {}): any {
  return {
    sourceId: 'source-1',
    sourceUrl: 'https://example.test/source-1',
    fileName: 'source-1.md',
    markdown: [
      '---',
      'layout: creature',
      'type: npc',
      'name: "Source One"',
      'armor_class: "12"',
      'hit_points: "10"',
      '---',
      '',
      '## Actions',
      '',
      '- **Claw**: Hit.',
    ].join('\n'),
    imageUrls: [],
    status: 'ok',
    warnings: [],
    ...overrides,
  };
}

function canonicalResult(overrides: Partial<any> = {}): any {
  const sources = overrides.sources ?? [canonicalSource()];
  return {
    recordsPath: 'crawl-out/records.json',
    recordsRead: sources.length,
    recordsMatched: sources.length,
    blocksEmitted: sources.length,
    skipped: 0,
    sources,
    warnings: [],
    failures: [],
    ...overrides,
  };
}

function canonicalActorResult(overrides: Partial<any> = {}): any {
  const warnings = overrides.warnings ?? [];
  return {
    kind: 'canonical-actor-collection',
    status: warnings.length > 0 ? 'needs_review' : 'succeeded',
    vaultPath: 'vault',
    outputDir: join('vault', 'output'),
    fvttVersion: '14',
    effectProfile: 'core',
    itemCount: 1,
    succeeded: warnings.length > 0 ? 0 : 1,
    failed: 0,
    warnings,
    failures: [],
    items: [],
    outputFiles: [],
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
    ...overrides,
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
