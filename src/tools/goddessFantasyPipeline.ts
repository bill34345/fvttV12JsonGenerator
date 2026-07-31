import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runRecordsToPlaintext, type RecordsToPlaintextOptions, type RecordsToPlaintextResult } from '@fvtt-json-generator/crawl-goddessfantasy/records-to-plaintext';
import { runGoddessFantasyBoardCrawl } from '@fvtt-json-generator/crawl-goddessfantasy/crawl';
import type { CrawlContentTypeFilter, GoddessFantasyCrawlMode, GoddessFantasyCrawlOptions, GoddessFantasyCrawlResult } from '@fvtt-json-generator/crawl-goddessfantasy/types';
import { buildImageAssetOptionsFromCli } from '../core/assets/imageAssetOptions';
import type { ImageAssetOptions } from '../core/assets/imageAssets';
import { runTokenReview, type TokenReviewOptions, type TokenReviewResult } from '../core/assets/tokenReview';
import type { EffectProfile } from '../core/application/conversion';
import {
  PlainTextActorWorkflow,
  type PlainTextActorWorkflowOptions,
  type PlainTextActorWorkflowResult,
} from '../core/application/workflows';
import { assertEffectProfileForTarget, parseFvttTargetVersion, type FvttTargetVersion } from '@fvtt-json-generator/generation/target';

export interface GoddessFantasyPipelineOptions extends GoddessFantasyCrawlOptions {
  vaultPath?: string;
  plaintextOutDir?: string;
  plaintextForce?: boolean;
  failOnWarning?: boolean;
  effectProfile?: EffectProfile;
  fvttVersion?: FvttTargetVersion;
  imageAssets?: ImageAssetOptions;
  reviewTokens?: boolean;
  failOnTokenReview?: boolean;
  tokenReviewOutDir?: string;
}

export interface GoddessFantasyPipelineResult {
  crawl: GoddessFantasyCrawlResult;
  plaintext?: RecordsToPlaintextResult;
  actor?: PlainTextActorWorkflowResult;
  tokenReview?: TokenReviewResult;
  stoppedAfter: 'crawl-dry-run' | 'crawl-failure' | 'plaintext-failure' | 'plaintext-warning' | 'actor-failure' | 'actor-warning' | 'token-review' | 'complete';
  warnings: number;
  failures: number;
}

export interface GoddessFantasyPipelineDependencies {
  crawl?: (options: GoddessFantasyCrawlOptions) => Promise<GoddessFantasyCrawlResult>;
  recordsToPlaintext?: (options: RecordsToPlaintextOptions) => RecordsToPlaintextResult;
  ingestActors?: (options: PlainTextActorWorkflowOptions) => Promise<PlainTextActorWorkflowResult>;
  tokenReview?: (options: TokenReviewOptions) => Promise<TokenReviewResult>;
}

export async function runGoddessFantasyPipeline(
  options: GoddessFantasyPipelineOptions,
  dependencies: GoddessFantasyPipelineDependencies = {},
): Promise<GoddessFantasyPipelineResult> {
  const crawl = await (dependencies.crawl ?? runGoddessFantasyBoardCrawl)({
    boardUrl: options.boardUrl,
    cookieHeader: options.cookieHeader,
    cookieHeaderFile: options.cookieHeaderFile,
    cookieHeaderEnv: options.cookieHeaderEnv,
    loginUsername: options.loginUsername,
    loginPassword: options.loginPassword,
    loginUsernameEnv: options.loginUsernameEnv,
    loginPasswordEnv: options.loginPasswordEnv,
    saveCookieHeaderFile: options.saveCookieHeaderFile,
    outDir: options.outDir,
    maxBoardPages: options.maxBoardPages,
    maxTopics: options.maxTopics,
    concurrency: options.concurrency,
    requestDelayMs: options.requestDelayMs,
    contentType: options.contentType ?? 'monster',
    crawlMode: options.crawlMode,
    force: options.force,
    dryRun: options.dryRun,
    skipAuthProbe: options.skipAuthProbe,
  });

  if (crawl.dryRun) {
    return { crawl, stoppedAfter: 'crawl-dry-run', warnings: 0, failures: crawl.failures };
  }

  if (crawl.failures > 0) {
    return { crawl, stoppedAfter: 'crawl-failure', warnings: 0, failures: crawl.failures };
  }

  const recordsPath = join(crawl.outDir, 'records.json');
  const plaintext = (dependencies.recordsToPlaintext ?? runRecordsToPlaintext)({
    recordsPath,
    outDir: options.plaintextOutDir,
    contentType: options.contentType ?? 'monster',
    force: options.plaintextForce ?? true,
    failOnWarning: Boolean(options.failOnWarning),
  });

  if (plaintext.failures.length > 0) {
    return {
      crawl,
      plaintext,
      stoppedAfter: 'plaintext-failure',
      warnings: plaintext.warnings.length,
      failures: plaintext.failures.length,
    };
  }

  if ((options.failOnWarning ?? true) && plaintext.warnings.length > 0) {
    return {
      crawl,
      plaintext,
      stoppedAfter: 'plaintext-warning',
      warnings: plaintext.warnings.length,
      failures: 0,
    };
  }

  const actorSourcePath = resolveActorIngestSourcePath(plaintext);
  const actor = await (dependencies.ingestActors ?? ((workflowOptions) => new PlainTextActorWorkflow().ingestActors(workflowOptions)))({
    sourcePath: actorSourcePath,
    vaultPath: options.vaultPath ?? join('obsidian', 'dnd数据转fvttjson'),
    effectProfile: resolvePipelineEffectProfile(options.effectProfile, options.fvttVersion),
    fvttVersion: options.fvttVersion ?? '12',
    imageAssets: options.imageAssets,
  });

  if (actor.sync.failures.length > 0 || actor.sync.failed > 0) {
    return {
      crawl,
      plaintext,
      actor,
      stoppedAfter: 'actor-failure',
      warnings: plaintext.warnings.length + actor.sync.warnings.length,
      failures: actor.sync.failures.length || actor.sync.failed,
    };
  }

  if ((options.failOnWarning ?? true) && actor.sync.warnings.length > 0) {
    return {
      crawl,
      plaintext,
      actor,
      stoppedAfter: 'actor-warning',
      warnings: plaintext.warnings.length + actor.sync.warnings.length,
      failures: 0,
    };
  }

  const tokenReview = options.reviewTokens
    ? await (dependencies.tokenReview ?? runTokenReview)({
      vaultPath: options.vaultPath ?? join('obsidian', 'dnd数据转fvttjson'),
      crawlDir: crawl.outDir,
      tokenCropsPath: defaultTokenCropsPath(crawl.outDir),
      outDir: options.tokenReviewOutDir,
    })
    : undefined;

  if (tokenReview && options.failOnTokenReview && tokenReview.summary.needsReview + tokenReview.summary.failed > 0) {
    return {
      crawl,
      plaintext,
      actor,
      tokenReview,
      stoppedAfter: 'token-review',
      warnings: plaintext.warnings.length + actor.sync.warnings.length + tokenReview.summary.needsReview,
      failures: tokenReview.summary.failed,
    };
  }

  return {
    crawl,
    plaintext,
    actor,
    tokenReview,
    stoppedAfter: 'complete',
    warnings: plaintext.warnings.length + actor.sync.warnings.length + (tokenReview?.summary.needsReview ?? 0),
    failures: 0,
  };
}

export function buildPipelineImageAssetOptions(options: Record<string, unknown>, crawlOutDir: string | undefined): ImageAssetOptions | undefined {
  if (String(options.imageMode ?? 'none') === 'none') {
    return undefined;
  }

  const imageTokenCrops = options.imageTokenCrops ?? defaultTokenCropsPath(crawlOutDir);
  return buildImageAssetOptionsFromCli({
    ...options,
    imageTokenCrops,
  });
}

export function defaultTokenCropsPath(crawlOutDir: string | undefined): string | undefined {
  if (!crawlOutDir) return undefined;
  const candidate = resolve(crawlOutDir, 'plaintext', 'token-crops.json');
  return existsSync(candidate) ? candidate : undefined;
}

export function defaultPlaintextOutDir(crawlOutDir: string): string {
  return join(resolve(crawlOutDir), 'plaintext', 'monsters');
}

export function defaultPlaintextOutFileForOutDir(outDir: string): string {
  return join(dirname(resolve(outDir)), 'monsters.md');
}

export function resolveActorIngestSourcePath(plaintext: RecordsToPlaintextResult): string {
  if (existsSync(plaintext.outFile)) {
    return plaintext.outFile;
  }

  const emittedItemMarkdown = plaintext.items
    .filter((item) => (item.status === 'ok' || item.status === 'needs_review') && item.markdown)
    .map((item) => item.markdown!.trim())
    .filter(Boolean)
    .join('\n\n');
  const emittedMarkdown = emittedItemMarkdown || (plaintext.blocksEmitted > 0 ? plaintext.markdown.trim() : '');

  if (!emittedMarkdown) {
    throw new Error(`No plaintext actor source was written for ingest: ${plaintext.outFile}`);
  }

  const sourcePath = join(dirname(resolve(plaintext.outFile)), 'monsters.pipeline-ingest.md');
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, `${emittedMarkdown}\n`, 'utf-8');
  return sourcePath;
}

export function parsePipelineEffectProfile(value: unknown): EffectProfile {
  const profile = String(value ?? 'modded-v12');
  if (profile !== 'core' && profile !== 'modded-v12' && profile !== 'modded-v14') {
    throw new Error(`Unsupported --effect-profile: ${profile}. Use core, modded-v12, or modded-v14.`);
  }
  return profile;
}

export function parsePipelineFvttVersion(value: unknown): FvttTargetVersion {
  return parseFvttTargetVersion(value ?? '12');
}

export function resolvePipelineEffectProfile(
  value: EffectProfile | undefined,
  fvttVersion: FvttTargetVersion | undefined,
): EffectProfile {
  const profile = value ?? (fvttVersion === '14' ? 'core' : 'modded-v12');
  assertEffectProfileForTarget(fvttVersion ?? '12', profile);
  return profile;
}

export function pipelineExitCode(result: GoddessFantasyPipelineResult): number {
  return result.stoppedAfter === 'complete' || result.stoppedAfter === 'crawl-dry-run' ? 0 : 1;
}

export function pipelineMode(force: unknown, mode: GoddessFantasyCrawlMode): GoddessFantasyCrawlMode {
  return force ? 'full' : mode;
}

export function pipelineContentType(value: CrawlContentTypeFilter | undefined): CrawlContentTypeFilter {
  return value ?? 'monster';
}
