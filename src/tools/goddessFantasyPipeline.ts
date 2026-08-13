import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  convertRecordsToCanonicalSources,
  type CanonicalSourceConversionResult,
} from '@fvtt-json-generator/crawl-goddessfantasy/canonical-sources';
import {
  runRecordsToPlaintext,
  type RecordsToPlaintextOptions,
  type RecordsToPlaintextResult,
} from '@fvtt-json-generator/crawl-goddessfantasy/records-to-plaintext';
import { runGoddessFantasyBoardCrawl } from '@fvtt-json-generator/crawl-goddessfantasy/crawl';
import type { CrawlContentTypeFilter, GoddessFantasyCrawlMode, GoddessFantasyCrawlOptions, GoddessFantasyCrawlResult } from '@fvtt-json-generator/crawl-goddessfantasy/types';
import { buildImageAssetOptionsFromCli } from '@fvtt-json-generator/assets-icons/image-options';
import type { ImageAssetOptions } from '@fvtt-json-generator/assets-icons/image-assets';
import { runTokenReview, type TokenReviewOptions, type TokenReviewResult } from '@fvtt-json-generator/assets-icons/token-review';
import type { EffectProfile } from '../core/application/conversion';
import {
  convertCanonicalActorCollection,
  type CanonicalActorCollectionResult,
} from '../core/application/workflows';
import { assertEffectProfileForTarget, parseFvttTargetVersion, type FvttTargetVersion } from '@fvtt-json-generator/generation/target';

export interface GoddessFantasyPipelineOptions extends GoddessFantasyCrawlOptions {
  vaultPath?: string;
  plaintextOutDir?: string;
  plaintextForce?: boolean;
  emitPlaintextAudit?: boolean;
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
  canonical?: CanonicalSourceConversionResult;
  actorCollection?: CanonicalActorCollectionResult;
  tokenReview?: TokenReviewResult;
  stoppedAfter: 'crawl-dry-run' | 'crawl-failure' | 'source-failure' | 'source-warning' | 'actor-failure' | 'actor-warning' | 'token-review' | 'complete';
  warnings: number;
  failures: number;
}

export interface GoddessFantasyPipelineDependencies {
  crawl?: (options: GoddessFantasyCrawlOptions) => Promise<GoddessFantasyCrawlResult>;
  recordsToPlaintext?: (options: RecordsToPlaintextOptions) => RecordsToPlaintextResult;
  recordsToCanonical?: (options: { recordsPath: string; contentType?: CrawlContentTypeFilter; site?: string }) => CanonicalSourceConversionResult;
  convertCanonicalActors?: (options: Parameters<typeof convertCanonicalActorCollection>[0]) => Promise<CanonicalActorCollectionResult>;
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
  const canonical = (dependencies.recordsToCanonical ?? ((canonicalOptions) =>
    convertRecordsToCanonicalSources({
      ...canonicalOptions,
      recordsPath: canonicalOptions.recordsPath,
    })))({
      recordsPath,
      contentType: options.contentType ?? 'monster',
    });

  const plaintext = options.emitPlaintextAudit
    ? (dependencies.recordsToPlaintext ?? runRecordsToPlaintext)({
      recordsPath,
      outDir: options.plaintextOutDir,
      contentType: options.contentType ?? 'monster',
      force: options.plaintextForce ?? true,
      failOnWarning: Boolean(options.failOnWarning),
    })
    : undefined;

  if (canonical.failures.length > 0) {
    return {
      crawl,
      plaintext,
      canonical,
      stoppedAfter: 'source-failure',
      warnings: canonical.warnings.length,
      failures: canonical.failures.length,
    };
  }

  if ((options.failOnWarning ?? true) && canonical.warnings.length > 0) {
    return {
      crawl,
      plaintext,
      canonical,
      stoppedAfter: 'source-warning',
      warnings: canonical.warnings.length,
      failures: 0,
    };
  }

  const actorCollection = await (dependencies.convertCanonicalActors ?? convertCanonicalActorCollection)({
    sources: canonical.sources,
    vaultPath: options.vaultPath ?? join('obsidian', 'dnd数据转fvttjson'),
    effectProfile: resolvePipelineEffectProfile(options.effectProfile, options.fvttVersion),
    fvttVersion: options.fvttVersion ?? '14',
    imageAssets: options.imageAssets,
  });

  if (actorCollection.failures.length > 0 || actorCollection.failed > 0) {
    return {
      crawl,
      plaintext,
      canonical,
      actorCollection,
      stoppedAfter: 'actor-failure',
      warnings: canonical.warnings.length + actorCollection.warnings.length,
      failures: actorCollection.failures.length || actorCollection.failed,
    };
  }

  if ((options.failOnWarning ?? true) && actorCollection.warnings.length > 0) {
    return {
      crawl,
      plaintext,
      canonical,
      actorCollection,
      stoppedAfter: 'actor-warning',
      warnings: canonical.warnings.length + actorCollection.warnings.length,
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
      canonical,
      actorCollection,
      tokenReview,
      stoppedAfter: 'token-review',
      warnings: canonical.warnings.length + actorCollection.warnings.length + tokenReview.summary.needsReview,
      failures: tokenReview.summary.failed,
    };
  }

  return {
    crawl,
    plaintext,
    canonical,
    actorCollection,
    tokenReview,
    stoppedAfter: 'complete',
    warnings: canonical.warnings.length + actorCollection.warnings.length + (tokenReview?.summary.needsReview ?? 0),
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

export function parsePipelineEffectProfile(value: unknown): EffectProfile {
  const profile = String(value ?? 'core');
  if (profile !== 'core' && profile !== 'modded-v12' && profile !== 'modded-v14') {
    throw new Error(`Unsupported --effect-profile: ${profile}. Use core, modded-v12, or modded-v14.`);
  }
  return profile;
}

export function parsePipelineFvttVersion(value: unknown): FvttTargetVersion {
  return parseFvttTargetVersion(value ?? '14');
}

export function resolvePipelineEffectProfile(
  value: EffectProfile | undefined,
  fvttVersion: FvttTargetVersion | undefined,
): EffectProfile {
  const target = fvttVersion ?? '14';
  const profile = value ?? (target === '14' ? 'core' : 'modded-v12');
  assertEffectProfileForTarget(target, profile);
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
