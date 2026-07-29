import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { EffectProfile } from '../core/generator/effectProfileApplier';
import { convertMarkdownPathToOutput } from '../core/workflow/singleFileConversion';
import { buildActorVerificationSummary, type ActorVerificationSummary } from './actorVerification';
import { runGoddessFantasyPipeline } from './goddessFantasyPipeline';

export interface V14AcceptanceSample {
  id: string;
  label: string;
  category: string;
  sourcePath: string;
}

export interface V14SchemaCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface V14AcceptanceSampleResult {
  id: string;
  label: string;
  category: string;
  sourcePath: string;
  outputPath: string;
  kind: string;
  name: string;
  itemCount: number;
  validatorWarnings: string[];
  verificationWarnings: string[];
  schemaChecks: V14SchemaCheck[];
  actorSummary: ActorVerificationSummary | null;
  error?: string;
}

export interface V14AcceptanceSuiteResult {
  generatedAt: string;
  outDir: string;
  reportPath: string;
  effectProfile: EffectProfile;
  samples: V14AcceptanceSampleResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export interface V14AcceptanceSuiteOptions {
  samples?: V14AcceptanceSample[];
  outDir?: string;
  reportPath?: string;
  includeCrawlFixture?: boolean;
  effectProfile?: EffectProfile;
}

const DEFAULT_OUT_DIR = join('obsidian', 'dnd数据转fvttjson', 'output', 'v14-acceptance');
const DEFAULT_REPORT_PATH = join('docs', 'acceptance', 'v14-core-batch-verification.md');

export const DEFAULT_V14_ACCEPTANCE_SAMPLES: V14AcceptanceSample[] = [
  {
    id: 'slithering-bloodfin',
    label: 'Slithering Bloodfin',
    category: 'complex actions and effects',
    sourcePath: join('obsidian', 'dnd数据转fvttjson', 'input', 'slithering-bloodfin.md'),
  },
  {
    id: 'chuul-nullifier',
    label: 'Chuul Nullifier',
    category: 'save activity and conditions',
    sourcePath: join('obsidian', 'dnd数据转fvttjson', 'input', 'chuul-nullifier.md'),
  },
  {
    id: 'bonebreaker-dorokor',
    label: 'Bonebreaker Dorokor',
    category: 'multiattack, recharge, and reactions',
    sourcePath: join('obsidian', 'dnd数据转fvttjson', 'input', 'bonebreaker-dorokor.md'),
  },
  {
    id: 'white-tusk-shaman',
    label: 'White Tusk Shaman',
    category: 'english route and innate utility text',
    sourcePath: join('obsidian', 'dnd数据转fvttjson', 'input', 'white-tusk-shaman.md'),
  },
  {
    id: 'v14-modded-bleeding-guardian',
    label: 'Bleeding Guardian',
    category: 'explicit bleeding overtime module fixture',
    sourcePath: join('obsidian', 'dnd数据转fvttjson', 'input', 'v14-modded-bleeding-guardian.md'),
  },
];

export async function runV14AcceptanceSuite(
  options: V14AcceptanceSuiteOptions = {},
): Promise<V14AcceptanceSuiteResult> {
  const outDir = resolvePath(options.outDir ?? DEFAULT_OUT_DIR);
  const reportPath = resolvePath(options.reportPath ?? DEFAULT_REPORT_PATH);
  const effectProfile = options.effectProfile ?? 'core';
  mkdirSync(outDir, { recursive: true });

  const samples = options.samples ?? DEFAULT_V14_ACCEPTANCE_SAMPLES;
  const results: V14AcceptanceSampleResult[] = [];
  for (const sample of samples) {
    results.push(await runMarkdownSample(sample, outDir, effectProfile));
  }

  if (options.includeCrawlFixture ?? true) {
    results.push(await runGoddessFantasyFixtureSample(outDir, effectProfile));
  }

  const result = summarizeSuite({
    generatedAt: new Date().toISOString(),
    outDir,
    reportPath,
    effectProfile,
    samples: results,
  });

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, buildV14AcceptanceReport(result), 'utf-8');
  return result;
}

export function buildV14AcceptanceReport(result: V14AcceptanceSuiteResult): string {
  const title = result.effectProfile === 'core'
    ? 'Foundry v14 Core Batch Verification'
    : 'Foundry v14 Modded Profile Batch Verification';
  const lines: string[] = [
    `# ${title}`,
    '',
    `Generated at: ${result.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Output dir: \`${normalizePathForMarkdown(result.outDir)}\``,
    `- Effect profile: \`${result.effectProfile}\``,
    `- Samples: ${result.summary.total}`,
    `- Passed schema checks: ${result.summary.passed}`,
    `- Failed samples: ${result.summary.failed}`,
    `- Verification warnings: ${result.summary.warnings}`,
    '- Foundry runtime import: outside this offline batch report; see `docs/acceptance/v14-live-runtime-smoke-test.md` for current live-runtime evidence.',
    '',
    '## Module Compatibility',
    '',
    result.effectProfile === 'modded-v14'
      ? '- MIDI-QOL `14.0.11` and DAE `14.0.12` are the locked v14 module references for generated automation.'
      : '- Module automation is not emitted for the `core` profile.',
    '- Times Up: not used for v14; v14 duration handling is core/DAE-based.',
    '- Item Macro: not required for v14 acceptance; no v14-verified dependency is assumed.',
    '',
    '## Mechanical Checks',
    '',
    '| Sample | Category | Output | Schema | Verification warnings |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const sample of result.samples) {
    const schema = sample.error
      ? `failed: ${escapeTable(sample.error)}`
      : `${sample.schemaChecks.filter((check) => check.ok).length}/${sample.schemaChecks.length}`;
    const warnings = sample.verificationWarnings.length === 0
      ? '0'
      : sample.verificationWarnings.length.toString();
    lines.push(
      `| ${escapeTable(sample.label)} | ${escapeTable(sample.category)} | \`${escapeTable(relativePath(sample.outputPath))}\` | ${schema} | ${warnings} |`,
    );
  }

  lines.push('', '## Sample Details', '');

  for (const sample of result.samples) {
    lines.push(`### ${sample.label}`, '');
    lines.push(`- Source: \`${relativePath(sample.sourcePath)}\``);
    lines.push(`- Output: \`${relativePath(sample.outputPath)}\``);
    lines.push(`- Actor/item name: ${sample.name || 'not generated'}`);
    lines.push(`- Item count: ${sample.itemCount}`);

    if (sample.actorSummary) {
      lines.push(`- HP: \`${JSON.stringify(sample.actorSummary.actor.hp)}\``);
      lines.push(`- AC: \`${JSON.stringify(sample.actorSummary.actor.ac)}\``);
      lines.push(`- CR: \`${JSON.stringify(sample.actorSummary.actor.cr)}\``);
      lines.push(`- Senses: \`${JSON.stringify(sample.actorSummary.actor.senses)}\``);
      lines.push(`- Items reviewed: ${sample.actorSummary.items.map((item) => item.name).join(', ') || 'none'}`);
    }

    if (sample.validatorWarnings.length > 0) {
      lines.push(`- Validator warnings: ${sample.validatorWarnings.map((warning) => `\`${warning}\``).join('; ')}`);
    }

    if (sample.verificationWarnings.length > 0) {
      lines.push(`- Actor verification warnings: ${sample.verificationWarnings.map((warning) => `\`${warning}\``).join('; ')}`);
    }

    lines.push('', '| v14 schema spot check | Result | Detail |');
    lines.push('| --- | --- | --- |');
    for (const check of sample.schemaChecks) {
      lines.push(`| ${escapeTable(check.name)} | ${check.ok ? 'pass' : 'fail'} | ${escapeTable(check.detail)} |`);
    }
    lines.push('');
  }

  lines.push(
    '## Semantic Acceptance Notes',
    '',
    '- This is an offline generation report; it does not embed or supersede live Foundry runtime evidence.',
    '- Source-to-output semantic review uses generated JSON summaries and `actorVerification`; any warning is documented above instead of hidden.',
    '- Current import, interaction, re-export, and compatibility results are maintained in `docs/acceptance/v14-live-runtime-smoke-test.md`.',
    '',
  );

  return `${lines.join('\n').trim()}\n`;
}

async function runMarkdownSample(
  sample: V14AcceptanceSample,
  outDir: string,
  effectProfile: EffectProfile,
): Promise<V14AcceptanceSampleResult> {
  const sourcePath = resolvePath(sample.sourcePath);
  const outputPath = join(outDir, `${sample.id}.v14.json`);
  try {
    const conversion = await convertMarkdownPathToOutput({
      sourcePath,
      outputPath,
      fvttVersion: '14',
      effectProfile,
      translationService: null,
    });
    const actorSummary = conversion.kind === 'actor'
      ? buildActorVerificationSummary({ sourcePath, actorPath: outputPath })
      : null;
    return {
      id: sample.id,
      label: sample.label,
      category: sample.category,
      sourcePath,
      outputPath,
      kind: conversion.kind,
      name: conversion.name,
      itemCount: conversion.itemCount,
      validatorWarnings: conversion.warnings,
      verificationWarnings: actorSummary?.warnings ?? [],
      schemaChecks: runV14SchemaChecks(conversion.rawJson),
      actorSummary,
    };
  } catch (error) {
    return failedSample(sample, sourcePath, outputPath, error);
  }
}

async function runGoddessFantasyFixtureSample(outDir: string, effectProfile: EffectProfile): Promise<V14AcceptanceSampleResult> {
  const root = mkdtempSync(join(tmpdir(), 'fvtt-v14-acceptance-gf-'));
  const crawlDir = join(root, 'crawl');
  const vaultPath = join(root, 'vault');
  const sourcePath = join(outDir, 'goddessfantasy-yithian.md');
  const outputPath = join(outDir, 'goddessfantasy-yithian.v14.json');
  const printHtml = readFileSync(
    resolvePath(join('src', 'core', 'crawl', '__tests__', 'fixtures', 'goddessfantasy-topic-print-statblock.html')),
    'utf-8',
  );
  const marker = '\u3010\u602a\u7269\u3011';
  const requestedPrintPages: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.search.includes('action=printpage')) {
        requestedPrintPages.push(url.search);
        return new Response(printHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response(
        [
          '<!doctype html><html><body><div id="messageindex">',
          '<div class="windowbg"><div class="message_index_title"><span>',
          `<a href="${url.origin}/bbs/index.php?topic=169745.0">${marker}Yithian</a>`,
          '</span></div></div></div></body></html>',
        ].join(''),
        { headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    },
  });

  try {
    const result = await runGoddessFantasyPipeline({
      boardUrl: `http://127.0.0.1:${server.port}/bbs/index.php?board=2318.0`,
      cookieHeader: 'PHPSESSID=test',
      outDir: crawlDir,
      vaultPath,
      maxBoardPages: 1,
      maxTopics: 1,
      concurrency: 1,
      requestDelayMs: 0,
      contentType: 'monster',
      crawlMode: 'full',
      force: true,
      skipAuthProbe: true,
      plaintextForce: true,
      failOnWarning: false,
      fvttVersion: '14',
      effectProfile,
    });

    const generatedJson = findSingleFile(result.actor?.sync.outputDir, '.json');
    const generatedSource = findSingleFile(result.actor?.markdown.emitDir, '.md');
    if (!generatedJson || !generatedSource) {
      throw new Error(`GoddessFantasy fixture did not generate expected actor artifacts; stoppedAfter=${result.stoppedAfter}`);
    }
    copyFileSync(generatedSource, sourcePath);
    copyFileSync(generatedJson, outputPath);

    const actor = JSON.parse(readFileSync(outputPath, 'utf-8')) as Record<string, unknown>;
    const actorSummary = buildActorVerificationSummary({ sourcePath, actorPath: outputPath });
    return {
      id: 'goddessfantasy-yithian',
      label: 'GoddessFantasy Yithian Fixture',
      category: `crawler fixture chain; print pages requested=${requestedPrintPages.length}`,
      sourcePath,
      outputPath,
      kind: 'actor',
      name: String(actor.name ?? ''),
      itemCount: Array.isArray(actor.items) ? actor.items.length : 0,
      validatorWarnings: result.actor?.sync.warnings.map((warning) => warning.message) ?? [],
      verificationWarnings: actorSummary.warnings,
      schemaChecks: runV14SchemaChecks(actor),
      actorSummary,
    };
  } catch (error) {
    return failedSample({
      id: 'goddessfantasy-yithian',
      label: 'GoddessFantasy Yithian Fixture',
      category: 'crawler fixture chain',
      sourcePath,
    }, sourcePath, outputPath, error);
  } finally {
    server.stop(true);
    rmSync(root, { recursive: true, force: true });
  }
}

export function runV14SchemaChecks(document: unknown): V14SchemaCheck[] {
  const actor = getRecord(document);
  const stats = getRecord(actor._stats);
  const system = getRecord(actor.system);
  const attributes = getRecord(system.attributes);
  const senses = getRecord(attributes.senses);
  const items = Array.isArray(actor.items) ? actor.items.map(getRecord) : [];
  const activities = items.flatMap((item) => Object.values(getRecord(getRecord(item.system).activities)).map(getRecord));
  const effects = [
    ...(Array.isArray(actor.effects) ? actor.effects.map(getRecord) : []),
    ...items.flatMap((item) => Array.isArray(item.effects) ? item.effects.map(getRecord) : []),
  ];

  return [
    check('actor core version', stats.coreVersion === '14.361', String(stats.coreVersion ?? 'missing')),
    check('actor system version', stats.systemVersion === '5.3.3', String(stats.systemVersion ?? 'missing')),
    check('actor system id', stats.systemId === 'dnd5e', String(stats.systemId ?? 'missing')),
    check(
      'v14 senses ranges',
      Boolean(senses.ranges && typeof senses.ranges === 'object' && !Array.isArray(senses.ranges)),
      JSON.stringify(senses),
    ),
    check(
      'no item-level legacy activation',
      !items.some((item) => Object.prototype.hasOwnProperty.call(getRecord(item.system), 'activation')),
      `${items.length} embedded items checked`,
    ),
    check(
      'embedded item target stats',
      items.every((item) => {
        const itemStats = getRecord(item._stats);
        return itemStats.coreVersion === '14.361' && itemStats.systemVersion === '5.3.3';
      }),
      `${items.length} embedded items checked`,
    ),
    check(
      'save activities omit legacy dc.value',
      activities.every((activity) => {
        if (activity.type !== 'save') return true;
        return !Object.prototype.hasOwnProperty.call(getRecord(getRecord(activity.save).dc), 'value');
      }),
      `${activities.filter((activity) => activity.type === 'save').length} save activities checked`,
    ),
    check(
      'effects target stats',
      effects.every((effect) => {
        const effectStats = getRecord(effect._stats);
        return effectStats.coreVersion === '14.361' && effectStats.systemVersion === '5.3.3';
      }),
      `${effects.length} effects checked`,
    ),
  ];
}

function summarizeSuite(
  input: Omit<V14AcceptanceSuiteResult, 'summary'>,
): V14AcceptanceSuiteResult {
  const failed = input.samples.filter((sample) => sample.error || sample.schemaChecks.some((check) => !check.ok)).length;
  return {
    ...input,
    summary: {
      total: input.samples.length,
      passed: input.samples.length - failed,
      failed,
      warnings: input.samples.reduce((total, sample) => total + sample.verificationWarnings.length, 0),
    },
  };
}

function failedSample(
  sample: V14AcceptanceSample,
  sourcePath: string,
  outputPath: string,
  error: unknown,
): V14AcceptanceSampleResult {
  return {
    id: sample.id,
    label: sample.label,
    category: sample.category,
    sourcePath,
    outputPath,
    kind: 'actor',
    name: '',
    itemCount: 0,
    validatorWarnings: [],
    verificationWarnings: [],
    schemaChecks: [],
    actorSummary: null,
    error: error instanceof Error ? error.message : String(error),
  };
}

function check(name: string, ok: boolean, detail: string): V14SchemaCheck {
  return { name, ok, detail };
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function findSingleFile(dirPath: string | undefined, extension: string): string | undefined {
  if (!dirPath || !existsSync(dirPath)) return undefined;
  const files = readdirSync(dirPath)
    .filter((fileName) => fileName.endsWith(extension))
    .map((fileName) => join(dirPath, fileName));
  return files[0];
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function relativePath(path: string): string {
  return normalizePathForMarkdown(relative(process.cwd(), path));
}

function normalizePathForMarkdown(path: string): string {
  return path.replace(/\\/g, '/');
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function parseCliArgs(argv: string[]): V14AcceptanceSuiteOptions {
  const options: V14AcceptanceSuiteOptions = {};
  const samples: V14AcceptanceSample[] = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--out-dir') {
      options.outDir = requireValue(argv, ++index, arg);
    } else if (arg === '--report') {
      options.reportPath = requireValue(argv, ++index, arg);
    } else if (arg === '--no-crawl-fixture') {
      options.includeCrawlFixture = false;
    } else if (arg === '--effect-profile') {
      options.effectProfile = parseEffectProfileArg(requireValue(argv, ++index, arg));
    } else if (arg === '--sample') {
      const sourcePath = requireValue(argv, ++index, arg);
      const id = basename(sourcePath).replace(/\.md$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '');
      samples.push({
        id: id || `sample-${samples.length + 1}`,
        label: basename(sourcePath, '.md'),
        category: 'custom sample',
        sourcePath,
      });
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (samples.length > 0) {
    options.samples = samples;
  }
  return options;
}

function parseEffectProfileArg(value: string): EffectProfile {
  if (value === 'core' || value === 'modded-v14') {
    return value;
  }
  throw new Error(`Unsupported --effect-profile for v14 acceptance: ${value}. Use core or modded-v14.`);
}

function requireValue(argv: string[], index: number, name: string): string {
  const value = argv[index];
  if (!value) throw new Error(`Missing value for ${name}`);
  return value;
}

function printHelp(): void {
  console.log([
    'Usage: bun run src/tools/v14AcceptanceSuite.ts [options]',
    '',
    'Options:',
    '  --out-dir <path>       Directory for generated v14 JSON artifacts',
    '  --report <path>        Markdown report path',
    '  --effect-profile <p>   v14 effect profile: core or modded-v14',
    '  --sample <path>        Custom markdown sample; repeatable',
    '  --no-crawl-fixture     Skip local GoddessFantasy fixture pipeline sample',
    '  -h, --help             Show help',
  ].join('\n'));
}

if (import.meta.main) {
  try {
    const result = await runV14AcceptanceSuite(parseCliArgs(Bun.argv.slice(2)));
    console.log(`v14 acceptance samples: ${result.summary.total}`);
    console.log(`passed: ${result.summary.passed}`);
    console.log(`failed: ${result.summary.failed}`);
    console.log(`verification warnings: ${result.summary.warnings}`);
    console.log(`report: ${result.reportPath}`);
    if (result.summary.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
