import { Command } from 'commander';
import { runRecordsToPlaintext } from '../core/crawl/convert/recordsToPlaintext';
import { runGoddessFantasyBoardCrawl } from '../core/crawl/runGoddessFantasyBoardCrawl';

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
  .option('--force', 'Re-crawl topics even if raw HTML already exists')
  .option('--dry-run', 'Only enumerate topics; do not crawl topic bodies or write HTML')
  .option('--skip-auth-probe', 'Skip the board auth probe before crawling')
  .action(async (options) => {
    try {
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
        force: Boolean(options.force),
        dryRun: Boolean(options.dryRun),
        skipAuthProbe: Boolean(options.skipAuthProbe),
      });

      console.log(`Crawled board: ${result.boardId}`);
      console.log(`Output dir: ${result.outDir}`);
      console.log(`Discovered topics: ${result.topicsDiscovered}`);
      console.log(`Matched topics: ${result.topicsMatched}`);
      console.log(`Crawled topics: ${result.topicsCrawled}`);
      console.log(`Skipped topics: ${result.topicsSkipped}`);
      console.log(`Failures: ${result.failures}`);
      console.log(`Dry run: ${result.dryRun ? 'yes' : 'no'}`);

      if (result.failures > 0) {
        process.exit(1);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
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
        process.exit(1);
      }

      if (options.failOnWarning && result.warnings.length > 0) {
        process.exit(1);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
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
