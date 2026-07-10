import { Command } from 'commander';
import { runRecordsToPlaintext } from '../core/crawl/convert/recordsToPlaintext';
import { runGoddessFantasyBoardCrawl } from '../core/crawl/runGoddessFantasyBoardCrawl';
import type { GoddessFantasyCrawlMode } from '../core/crawl/types';
import { runTokenReview } from '../core/assets/tokenReview';
import {
  buildPipelineImageAssetOptions,
  defaultPlaintextOutDir,
  parsePipelineEffectProfile,
  parsePipelineFvttVersion,
  pipelineExitCode,
  pipelineMode,
  runGoddessFantasyPipeline,
} from './goddessFantasyPipeline';

const program = new Command();

program
  .name('crawl-sites')
  .description('Batch crawl source sites into raw project crawl artifacts')
  .version('1.0.0');

program
  .command('goddessfantasy-board')
  .description('Crawl a Goddess Fantasy SMF board into JSONL plus raw print-page HTML')
  .requiredOption('--board-url <url>', 'SMF board URL')
  .option('--cookie-header <value>', 'Cookie header value')
  .option('--cookie-header-file <path>', 'File containing the Cookie header')
  .option('--cookie-header-env <name>', 'Environment variable containing the Cookie header', 'GODDESSFANTASY_COOKIE')
  .option('--login-username <value>', 'GoddessFantasy username for HTTP login')
  .option('--login-password <value>', 'GoddessFantasy password for HTTP login')
  .option('--login-username-env <name>', 'Environment variable containing the login username', 'GODDESSFANTASY_USERNAME')
  .option('--login-password-env <name>', 'Environment variable containing the login password', 'GODDESSFANTASY_PASSWORD')
  .option('--save-cookie-header-file <path>', 'Write the login-produced Cookie header to this file')
  .option('--out-dir <path>', 'Output directory')
  .option('--max-board-pages <n>', 'Maximum board pages to scan', parsePositiveInt, 20)
  .option('--max-topics <n>', 'Maximum topics to crawl', parsePositiveInt)
  .option('--concurrency <n>', 'Maximum concurrent requests', parsePositiveInt, 2)
  .option('--request-delay-ms <n>', 'Delay between same-domain requests in milliseconds', parseNonNegativeInt, 800)
  .option('--content-type <type>', 'Filter topics by classified content type: all, monster, unknown', parseContentType, 'all')
  .option('--mode <mode>', 'Crawl mode: incremental or full', parseCrawlMode, 'incremental')
  .option('--force', 'Legacy alias for --mode full')
  .option('--dry-run', 'Only enumerate topics; do not crawl topic bodies or write HTML')
  .option('--skip-auth-probe', 'Skip the board auth probe before crawling')
  .action(async (options) => {
    try {
      const crawlMode: GoddessFantasyCrawlMode = options.force ? 'full' : options.mode;
      const result = await runGoddessFantasyBoardCrawl({
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
        contentType: options.contentType,
        crawlMode,
        force: crawlMode === 'full',
        dryRun: Boolean(options.dryRun),
        skipAuthProbe: Boolean(options.skipAuthProbe),
      });

      console.log(`Crawled board: ${result.boardId}`);
      console.log(`Mode: ${result.mode}`);
      console.log(`Output dir: ${result.outDir}`);
      console.log(`Discovered topics: ${result.topicsDiscovered}`);
      console.log(`Matched topics: ${result.topicsMatched}`);
      console.log(`Crawled topics: ${result.topicsCrawled}`);
      console.log(`Skipped topics: ${result.topicsSkipped}`);
      console.log(`Reused topics: ${result.topicsReused}`);
      console.log(`Records before: ${result.recordsBefore}`);
      console.log(`Records after: ${result.recordsAfter}`);
      console.log(`New topic IDs: ${result.newTopicIds.join(', ') || 'none'}`);
      console.log(`Failures: ${result.failures}`);
      console.log(`Dry run: ${result.dryRun ? 'yes' : 'no'}`);

      if (result.failures > 0) {
        exitAfterFlush(1);
        return;
      }
      exitAfterFlush(0);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      exitAfterFlush(1);
    }
  });

program
  .command('records-to-plaintext')
  .description('Convert crawl records.json into a plaintext statblock collection')
  .requiredOption('--records <path>', 'Path to crawl records.json')
  .option('--out-dir <path>', 'Output directory for per-monster plaintext files')
  .option('--out-file <path>', 'Legacy output plaintext collection file')
  .option('--content-type <type>', 'Filter records by classified content type: all, monster, unknown', parseContentType, 'monster')
  .option('--site <site>', 'Site renderer to use; defaults to record.site')
  .option('--force', 'Overwrite the output file if it already exists')
  .option('--dry-run', 'Print conversion statistics without writing files')
  .option('--fail-on-warning', 'Exit non-zero if conversion emits any warning')
  .action((options) => {
    try {
      const result = runRecordsToPlaintext({
        recordsPath: options.records,
        outDir: options.outDir,
        outFile: options.outFile,
        contentType: options.contentType,
        site: options.site,
        force: Boolean(options.force),
        dryRun: Boolean(options.dryRun),
        failOnWarning: Boolean(options.failOnWarning),
      });

      console.log(`Records read: ${result.recordsRead}`);
      console.log(`Records matched: ${result.recordsMatched}`);
      console.log(`Blocks emitted: ${result.blocksEmitted}`);
      console.log(`Files written: ${result.filesWritten}`);
      console.log(`Skipped: ${result.skipped}`);
      console.log(`OK: ${result.items.filter((item) => item.status === 'ok').length}`);
      console.log(`Needs review: ${result.items.filter((item) => item.status === 'needs_review').length}`);
      console.log(`Failed: ${result.items.filter((item) => item.status === 'failed').length}`);
      console.log(`Warnings: ${result.warnings.length}`);
      console.log(`Failures: ${result.failures.length}`);
      console.log(`Output dir: ${result.outDir}`);
      if (options.outFile) console.log(`Output file: ${result.outFile}`);
      console.log(`Dry run: ${result.dryRun ? 'yes' : 'no'}`);

      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          console.error(`Warning: topic ${warning.topicId} ${warning.code} - ${warning.message}`);
        }
      }

      if (result.failures.length > 0) {
        for (const failure of result.failures) {
          console.error(`Failed: topic ${failure.topicId ?? 'unknown'} ${failure.title ?? ''} -> ${failure.error}`);
        }
        exitAfterFlush(1);
        return;
      }

      if (options.failOnWarning && result.warnings.length > 0) {
        exitAfterFlush(1);
        return;
      }
      exitAfterFlush(0);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      exitAfterFlush(1);
    }
  });

program
  .command('goddessfantasy-pipeline')
  .description('Run Goddess Fantasy crawl, records-to-plaintext, actor JSON generation, and optional image upload')
  .option('--board-url <url>', 'SMF board URL', 'https://www.goddessfantasy.net/bbs/index.php?board=2318.0')
  .option('--cookie-header <value>', 'Cookie header value')
  .option('--cookie-header-file <path>', 'File containing the Cookie header')
  .option('--cookie-header-env <name>', 'Environment variable containing the Cookie header', 'GODDESSFANTASY_COOKIE')
  .option('--login-username <value>', 'GoddessFantasy username for HTTP login')
  .option('--login-password <value>', 'GoddessFantasy password for HTTP login')
  .option('--login-username-env <name>', 'Environment variable containing the login username', 'GODDESSFANTASY_USERNAME')
  .option('--login-password-env <name>', 'Environment variable containing the login password', 'GODDESSFANTASY_PASSWORD')
  .option('--save-cookie-header-file <path>', 'Write the login-produced Cookie header to this file')
  .option('--out-dir <path>', 'Crawl output directory', 'obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-2318')
  .option('--vault <path>', 'Obsidian vault path', 'obsidian/dnd数据转fvttjson')
  .option('--plaintext-out-dir <path>', 'Output directory for per-monster plaintext files')
  .option('--max-board-pages <n>', 'Maximum board pages to scan', parsePositiveInt, 20)
  .option('--max-topics <n>', 'Maximum topics to crawl', parsePositiveInt)
  .option('--concurrency <n>', 'Maximum concurrent requests', parsePositiveInt, 2)
  .option('--request-delay-ms <n>', 'Delay between same-domain requests in milliseconds', parseNonNegativeInt, 800)
  .option('--content-type <type>', 'Filter topics by classified content type: all, monster, unknown', parseContentType, 'monster')
  .option('--mode <mode>', 'Crawl mode: incremental or full', parseCrawlMode, 'incremental')
  .option('--force', 'Legacy alias for --mode full')
  .option('--dry-run', 'Only scan the board and report crawl reuse/new-topic stats; downstream steps are skipped')
  .option('--skip-auth-probe', 'Skip the board auth probe before crawling')
  .option('--no-plaintext-force', 'Do not overwrite plaintext outputs')
  .option('--allow-warnings', 'Continue/exit successfully even when plaintext or image warnings are emitted')
  .option('--effect-profile <profile>', 'Effect automation profile: core, modded-v12, or modded-v14', 'modded-v12')
  .option('--fvtt-version <version>', 'Target Foundry major version (12, 13, or 14)', '12')
  .option('--image-mode <mode>', 'Image asset workflow mode: none or ssh', 'none')
  .option('--image-ssh-target <target>', 'SSH target for image uploads')
  .option('--image-remote-root <path>', 'Remote image root directory for SSH uploads')
  .option('--image-public-base-url <url>', 'Public base URL for uploaded images')
  .option('--image-allow-http', 'Allow http:// image public URLs')
  .option('--image-actor-dir <dir>', 'Actor image subdirectory', 'actors')
  .option('--image-token-dir <dir>', 'Token image subdirectory', 'tokens')
  .option('--image-token-frame <path>', 'Transparent PNG token frame path')
  .option('--image-token-size <size>', 'Token output size in pixels', '1024')
  .option('--image-token-format <format>', 'Token output format', 'webp')
  .option('--image-token-crops <path>', 'JSON map of source-url hash to normalized token crop rectangles')
  .option('--review-tokens', 'Run token review after actor/image generation')
  .option('--fail-on-token-review', 'Exit non-zero if token review reports needs_review or failed items')
  .option('--token-review-out-dir <path>', 'Output directory for token review artifacts')
  .action(async (options) => {
    try {
      const crawlMode = pipelineMode(options.force, options.mode);
      const plaintextOutDir = options.plaintextOutDir ?? defaultPlaintextOutDir(options.outDir);
      const imageAssets = buildPipelineImageAssetOptions(options, options.outDir);
      const fvttVersion = parsePipelineFvttVersion(options.fvttVersion);
      const defaultedEffectProfile = !process.argv.includes('--effect-profile') && fvttVersion === '14'
        ? 'core'
        : options.effectProfile;
      const result = await runGoddessFantasyPipeline({
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
        contentType: options.contentType,
        crawlMode,
        force: crawlMode === 'full',
        dryRun: Boolean(options.dryRun),
        skipAuthProbe: Boolean(options.skipAuthProbe),
        vaultPath: options.vault,
        plaintextOutDir,
        plaintextForce: options.plaintextForce,
        failOnWarning: !options.allowWarnings,
        effectProfile: parsePipelineEffectProfile(defaultedEffectProfile),
        fvttVersion,
        imageAssets,
        reviewTokens: Boolean(options.reviewTokens),
        failOnTokenReview: Boolean(options.failOnTokenReview),
        tokenReviewOutDir: options.tokenReviewOutDir,
      });

      console.log(`Pipeline: GoddessFantasy board ${result.crawl.boardId}`);
      console.log(`Stopped after: ${result.stoppedAfter}`);
      console.log(`Mode: ${result.crawl.mode}`);
      console.log(`Output dir: ${result.crawl.outDir}`);
      console.log(`Discovered topics: ${result.crawl.topicsDiscovered}`);
      console.log(`Matched topics: ${result.crawl.topicsMatched}`);
      console.log(`Crawled topics: ${result.crawl.topicsCrawled}`);
      console.log(`Reused topics: ${result.crawl.topicsReused}`);
      console.log(`Records before: ${result.crawl.recordsBefore}`);
      console.log(`Records after: ${result.crawl.recordsAfter}`);
      console.log(`New topic IDs: ${result.crawl.newTopicIds.join(', ') || 'none'}`);
      console.log(`Crawl failures: ${result.crawl.failures}`);
      console.log(`Dry run: ${result.crawl.dryRun ? 'yes' : 'no'}`);

      if (result.plaintext) {
        console.log(`Plaintext records read: ${result.plaintext.recordsRead}`);
        console.log(`Plaintext blocks emitted: ${result.plaintext.blocksEmitted}`);
        console.log(`Plaintext files written: ${result.plaintext.filesWritten}`);
        console.log(`Plaintext warnings: ${result.plaintext.warnings.length}`);
        console.log(`Plaintext failures: ${result.plaintext.failures.length}`);
        console.log(`Plaintext collection: ${result.plaintext.outFile}`);
      }

      if (result.actor) {
        console.log(`Detected creatures: ${result.actor.markdown.files.length}`);
        console.log(`Markdown dir: ${result.actor.markdown.emitDir}`);
        console.log(`JSON dir: ${result.actor.sync.outputDir}`);
        console.log(`Image mode: ${imageAssets?.mode ?? 'none'}`);
        console.log(`Processed: ${result.actor.sync.processed}`);
        console.log(`Skipped: ${result.actor.sync.skipped}`);
        console.log(`Failed: ${result.actor.sync.failed}`);
        console.log(`Warnings: ${result.actor.sync.warnings.length}`);
      }

      if (result.tokenReview) {
        console.log(`Token review total: ${result.tokenReview.summary.total}`);
        console.log(`Token review OK: ${result.tokenReview.summary.ok}`);
        console.log(`Token review needs review: ${result.tokenReview.summary.needsReview}`);
        console.log(`Token review failed: ${result.tokenReview.summary.failed}`);
        if (result.tokenReview.artifacts) {
          console.log(`Token review JSON: ${result.tokenReview.artifacts.jsonPath}`);
          console.log(`Token review Markdown: ${result.tokenReview.artifacts.markdownPath}`);
          if (result.tokenReview.artifacts.contactSheetPath) console.log(`Token review contact sheet: ${result.tokenReview.artifacts.contactSheetPath}`);
          if (result.tokenReview.artifacts.needsReviewSheetPath) console.log(`Token review needs-review sheet: ${result.tokenReview.artifacts.needsReviewSheetPath}`);
        }
      } else if (imageAssets?.mode) {
        console.log('Token review: run `crawl-sites token-review` to inspect generated token art.');
      }

      console.log(`Pipeline warnings: ${result.warnings}`);
      console.log(`Pipeline failures: ${result.failures}`);

      const code = pipelineExitCode(result);
      if (code !== 0) {
        exitAfterFlush(code);
        return;
      }
      exitAfterFlush(0);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      exitAfterFlush(1);
    }
  });

program
  .command('token-review')
  .description('Review generated token artwork and write token-review artifacts')
  .option('--vault <path>', 'Obsidian vault path', 'obsidian/dnd数据转fvttjson')
  .option('--crawl-dir <path>', 'Crawl output directory', 'obsidian/dnd数据转fvttjson/crawls/goddessfantasy/board-2318')
  .option('--token-crops <path>', 'Path to token-crops.json')
  .option('--confirmation <path>', 'Path to token-review-confirmed.json')
  .option('--out-dir <path>', 'Output directory for token review artifacts')
  .option('--dry-run', 'Print token review statistics without writing artifacts')
  .option('--fail-on-needs-review', 'Exit non-zero if token review reports needs_review or failed items')
  .action(async (options) => {
    try {
      const result = await runTokenReview({
        vaultPath: options.vault,
        crawlDir: options.crawlDir,
        tokenCropsPath: options.tokenCrops,
        confirmationPath: options.confirmation,
        outDir: options.outDir,
        dryRun: Boolean(options.dryRun),
      });

      console.log('Token review');
      console.log(`Total: ${result.summary.total}`);
      console.log(`OK: ${result.summary.ok}`);
      console.log(`Needs review: ${result.summary.needsReview}`);
      console.log(`Failed: ${result.summary.failed}`);
      console.log(`Dry run: ${result.artifacts ? 'no' : 'yes'}`);
      if (result.artifacts) {
        console.log(`Artifacts: ${result.artifacts.jsonPath}`);
        console.log(`Markdown: ${result.artifacts.markdownPath}`);
        if (result.artifacts.contactSheetPath) console.log(`Contact sheet: ${result.artifacts.contactSheetPath}`);
        if (result.artifacts.needsReviewSheetPath) console.log(`Needs-review sheet: ${result.artifacts.needsReviewSheetPath}`);
      }

      if (options.failOnNeedsReview && result.summary.needsReview + result.summary.failed > 0) {
        exitAfterFlush(1);
        return;
      }
      exitAfterFlush(0);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      exitAfterFlush(1);
    }
  });

program.parse();

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }
  return parsed;
}

function parseNonNegativeInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, got: ${value}`);
  }
  return parsed;
}

function parseContentType(value: string): 'all' | 'monster' | 'unknown' {
  if (value === 'all' || value === 'monster' || value === 'unknown') return value;
  throw new Error(`Expected one of all, monster, unknown; got: ${value}`);
}

function parseCrawlMode(value: string): GoddessFantasyCrawlMode {
  if (value === 'full' || value === 'incremental') return value;
  throw new Error(`Expected one of full, incremental; got: ${value}`);
}

function exitAfterFlush(code: number): void {
  process.exitCode = code;
  setImmediate(() => process.exit(code));
}
