import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import type { EffectProfile } from '../../../core/generator/effectProfileApplier';
import { ItemsIngestionWorkflow } from '../../../core/ingest/items';
import { PlainTextIngestionWorkflow } from '../../../core/ingest/plaintext';
import { runGoddessFantasyBoardCrawl } from '../../../core/crawl/runGoddessFantasyBoardCrawl';
import { runRecordsToPlaintext } from '../../../core/crawl/convert/recordsToPlaintext';
import { JsonTranslationSyncWorkflow } from '../../../core/workflow/jsonTranslationSync';
import { ObsidianSyncWorkflow } from '../../../core/workflow/obsidianSync';
import { PlainTextActorWorkflow } from '../../../core/workflow/plainTextActor';
import {
  DEFAULT_VAULT_PATH,
  convertMarkdownContentToJson,
  type ConversionResult,
  type FvttTargetVersion,
} from '../../../core/workflow/singleFileConversion';
import type { GoddessFantasyCrawlMode } from '../../../core/crawl/types';
import {
  convertItemCollectionToJson,
  convertMonsterCollectionToJson,
} from '../../../core/workflow/collectionConversion';
import { buildWebImageAssetOptions, imageAssetWarningsForResult } from '../imageAssetPreset';
import { assertWorkspacePath, resolveWorkspacePath } from '../paths';
import { assertEffectProfileForTarget, parseFvttTargetVersion } from '../../../core/foundryTarget';
import { loadMonsterIntakeConfig } from '../../../core/intake/config';
import { OpenAICompatibleMonsterIntakeProvider, type IntakeProviderAuditEvent } from '../../../core/intake/provider';
import { resumeMonsterIntake, runMonsterIntake } from '../../../core/intake/orchestrator';
import type { IntakeDecision, MonsterIntakeAiProvider } from '../../../core/intake/types';
import {
  addJobFile,
  appendJobLog,
  jobDir,
  jobInputDir,
  jobOutputDir,
  setJobProgress,
  updateJob,
  type WebJob,
  type WebJobStatus,
  type WebJobType,
} from './jobStore';

export interface WebJobRequest {
  type: WebJobType;
  fileName?: string;
  content?: string;
  options?: Record<string, unknown>;
}

export interface WebJobRunnerDependencies {
  monsterIntakeProvider?: MonsterIntakeAiProvider;
}

export function startJob(job: WebJob, body: WebJobRequest): void {
  void runJob(job, body);
}

export async function runJob(job: WebJob, body: WebJobRequest, dependencies: WebJobRunnerDependencies = {}): Promise<void> {
  try {
    updateJob(job.id, { status: 'running' });
    appendJobLog(job.id, 'info', `开始任务：${job.type}`);
    setJobProgress(job.id, 0, 1, '初始化');

    switch (job.type) {
      case 'single-convert':
        await runSingleConvert(job, body);
        break;
      case 'monster-collection':
        await runMonsterCollection(job, body);
        break;
      case 'item-collection':
        await runItemCollection(job, body);
        break;
      case 'ingest-plaintext':
        await runPlaintextIngest(job, body);
        break;
      case 'ingest-plaintext-actors':
        await runPlaintextActorIngest(job, body);
        break;
      case 'ingest-items':
        await runItemIngest(job, body);
        break;
      case 'translate-json':
        await runTranslateJson(job, body);
        break;
      case 'vault-sync':
        await runVaultSync(job, body);
        break;
      case 'goddessfantasy-board-crawl':
        await runGoddessFantasyCrawl(job, body);
        break;
      case 'records-to-plaintext':
        await runRecordsToPlaintextJob(job, body);
        break;
      case 'ai-monster-intake':
        await runAiMonsterIntake(job, body, dependencies.monsterIntakeProvider);
        break;
      default:
        throw new Error(`Unsupported job type: ${job.type}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendJobLog(job.id, 'error', message);
    updateJob(job.id, {
      status: 'failed',
      error: {
        code: 'JOB_FAILED',
        message,
      },
    });
  }
}

async function runSingleConvert(job: WebJob, body: WebJobRequest): Promise<void> {
  const content = requireContent(body);
  const fileName = markdownFileName(body.fileName ?? 'uploaded.md');
  const inputPath = writeJobInput(job.id, fileName, content);
  const outputPath = join(jobOutputDir(job.id), fileName.replace(/\.(md|markdown|txt)$/i, '.json'));
  mkdirSync(jobOutputDir(job.id), { recursive: true });
  setJobProgress(job.id, 1, 2, '生成 JSON');

  const fvttVersion = optionFvttVersion(body.options);
  const result = await convertMarkdownContentToJson({
    content,
    sourcePath: inputPath,
    outputPath,
    fvttVersion,
    effectProfile: optionEffectProfile(body.options, fvttVersion),
  });

  const file = addJobFile(job.id, {
    path: outputPath,
    fileName: basename(outputPath),
    contentType: 'application/json; charset=utf-8',
    label: result.name || basename(outputPath),
  });
  finishJob(job.id, 'succeeded', {
    ...summaryForConversion(result),
    downloadUrl: file.downloadUrl,
  }, result.warnings, []);
}

async function runMonsterCollection(job: WebJob, body: WebJobRequest): Promise<void> {
  const content = requireContent(body);
  writeJobInput(job.id, markdownFileName(body.fileName ?? 'monsters.md'), content);
  setJobProgress(job.id, 1, 2, '拆分怪物合集并生成 JSON');

  const fvttVersion = optionFvttVersion(body.options);
  const result = await convertMonsterCollectionToJson({
    content,
    fileName: body.fileName,
    outputDir: jobOutputDir(job.id),
    fvttVersion,
    effectProfile: optionEffectProfile(body.options, fvttVersion),
  });
  for (const file of result.outputFiles) {
    addJobFile(job.id, file);
  }
  finishJob(job.id, result.status, result, result.warnings, result.failures);
}

async function runItemCollection(job: WebJob, body: WebJobRequest): Promise<void> {
  const content = requireContent(body);
  writeJobInput(job.id, markdownFileName(body.fileName ?? 'items.md'), content);
  setJobProgress(job.id, 1, 2, '拆分物品合集并生成 JSON');

  const fvttVersion = optionFvttVersion(body.options);
  const result = await convertItemCollectionToJson({
    content,
    fileName: body.fileName,
    outputDir: jobOutputDir(job.id),
    fvttVersion,
    effectProfile: optionEffectProfile(body.options, fvttVersion),
  });
  for (const file of result.outputFiles) {
    addJobFile(job.id, file);
  }
  finishJob(job.id, result.status, result, result.warnings, result.failures);
}

async function runPlaintextIngest(job: WebJob, body: WebJobRequest): Promise<void> {
  const sourcePath = writeJobInput(job.id, markdownFileName(body.fileName ?? 'plaintext.md'), requireContent(body));
  setJobProgress(job.id, 1, 2, '拆分 plaintext 到项目 Markdown');
  const result = await new PlainTextIngestionWorkflow().ingest({
    sourcePath,
    emitDir: join(jobOutputDir(job.id), 'emit'),
    dryRun: false,
    enableAiNormalize: optionBoolean(body.options, 'enableAiNormalize'),
  });
  if (result.files.length === 0) throw new Error('Legacy plaintext ingestion detected 0 monsters.');
  registerFilesUnder(job.id, jobOutputDir(job.id), ['.md', '.json', '.jsonl']);
  finishJob(job.id, 'succeeded', {
    sourcePath: result.sourcePath,
    emitDir: result.emitDir,
    fileCount: result.files.length,
    usedAi: result.usedAi,
  }, [], []);
}

async function runPlaintextActorIngest(job: WebJob, body: WebJobRequest): Promise<void> {
  const sourcePath = writeJobInput(job.id, markdownFileName(body.fileName ?? 'plaintext.md'), requireContent(body));
  const vaultPath = join(jobDir(job.id), 'vault');
  const imageSetup = imageAssetsForJob(job.id, body.options);
  setJobProgress(job.id, 1, 2, '拆分 plaintext 并同步生成 Actor JSON');
  const fvttVersion = optionFvttVersion(body.options);
  const result = await new PlainTextActorWorkflow().ingestActors({
    sourcePath,
    vaultPath,
    dryRun: false,
    enableAiNormalize: optionBoolean(body.options, 'enableAiNormalize'),
    fvttVersion,
    effectProfile: optionEffectProfile(body.options, fvttVersion),
    imageAssets: imageSetup.imageAssets,
  });
  if (result.markdown.files.length === 0) throw new Error('Legacy plaintext actor ingestion detected 0 monsters.');
  registerFilesUnder(job.id, vaultPath, ['.md', '.json', '.jsonl', '.webp', '.png', '.jpg', '.jpeg']);
  const imageWarnings = [
    ...imageSetup.warnings,
    ...imageAssetWarningsForResult(body.options, result.sync.warnings),
  ];
  finishJob(job.id, result.sync.failed > 0 ? 'partial' : 'succeeded', {
    markdownFiles: result.markdown.files.length,
    processed: result.sync.processed,
    skipped: result.sync.skipped,
    failed: result.sync.failed,
    imageMode: imageSetup.imageAssets?.mode ?? 'none',
    imagePublicBaseUrl: imageSetup.imageAssets?.publicBaseUrl,
    imageWarnings: imageWarnings.length,
  }, imageWarnings, result.sync.failures.map((failure) => ({ file: failure.input, error: failure.error })));
}

async function runItemIngest(job: WebJob, body: WebJobRequest): Promise<void> {
  const sourcePath = writeJobInput(job.id, markdownFileName(body.fileName ?? 'items.md'), requireContent(body));
  setJobProgress(job.id, 1, 2, '拆分物品合集到项目 Markdown');
  const result = await new ItemsIngestionWorkflow().ingest({
    sourcePath,
    emitDir: join(jobOutputDir(job.id), 'items'),
    dryRun: false,
  });
  registerFilesUnder(job.id, jobOutputDir(job.id), ['.md']);
  finishJob(job.id, 'succeeded', {
    fileCount: result.files.length,
    emitDir: result.emitDir,
  }, [], []);
}

async function runTranslateJson(job: WebJob, body: WebJobRequest): Promise<void> {
  if (!hasTranslationConfig()) {
    throw new Error('VPS 未配置 TRANSLATION_API_KEY 或 OPENAI_API_KEY，无法运行翻译任务。');
  }
  const sourcePath = writeJobInput(job.id, jsonFileName(body.fileName ?? 'input.json'), requireContent(body));
  setJobProgress(job.id, 1, 2, '翻译 JSON');
  const result = await new JsonTranslationSyncWorkflow().sync({
    dirPath: jobInputDir(job.id),
  });
  addJobFile(job.id, {
    path: sourcePath,
    fileName: basename(sourcePath),
    contentType: 'application/json; charset=utf-8',
    label: '翻译后的 JSON',
  });
  finishJob(job.id, result.failures.length > 0 ? 'partial' : 'succeeded', result, [], result.failures);
}

async function runVaultSync(job: WebJob, body: WebJobRequest): Promise<void> {
  const vaultPath = optionString(body.options, 'vaultPath') ?? DEFAULT_VAULT_PATH;
  assertWorkspacePath(vaultPath);
  const imageSetup = imageAssetsForJob(job.id, body.options);
  setJobProgress(job.id, 1, 2, '同步 vault input 到 output');
  const fvttVersion = optionFvttVersion(body.options);
  const result = await new ObsidianSyncWorkflow({
    translationService: null,
    enableAiNormalize: optionBoolean(body.options, 'enableAiNormalize'),
  }).sync({
    vaultPath: resolveWorkspacePath(vaultPath),
    clearBackup: optionBoolean(body.options, 'clearBackup'),
    fvttVersion,
    effectProfile: optionEffectProfile(body.options, fvttVersion),
    imageAssets: imageSetup.imageAssets,
  });
  registerFilesUnder(job.id, result.outputDir, ['.json', '.webp', '.png', '.jpg', '.jpeg']);
  const imageWarnings = [
    ...imageSetup.warnings,
    ...imageAssetWarningsForResult(body.options, result.warnings),
  ];
  finishJob(job.id, result.failed > 0 ? 'partial' : 'succeeded', {
    ...result,
    imageMode: imageSetup.imageAssets?.mode ?? 'none',
    imagePublicBaseUrl: imageSetup.imageAssets?.publicBaseUrl,
    imageWarnings: imageWarnings.length,
  }, imageWarnings, result.failures.map((failure) => ({
    file: failure.input,
    error: failure.error,
  })));
}

async function runGoddessFantasyCrawl(job: WebJob, body: WebJobRequest): Promise<void> {
  const boardUrl = optionString(body.options, 'boardUrl');
  if (!boardUrl) throw new Error('boardUrl is required.');
  const crawlMode = optionCrawlMode(body.options);
  const crawlOutDir = Bun.env.FVTT_WEB_CRAWL_OUT_DIR;

  setJobProgress(job.id, 1, 2, crawlMode === 'full' ? '完全重爬 Goddess Fantasy 版块' : '增量爬取 Goddess Fantasy 版块');
  const result = await runGoddessFantasyBoardCrawl({
    boardUrl,
    outDir: crawlOutDir,
    maxBoardPages: optionNumber(body.options, 'maxBoardPages'),
    maxTopics: optionNumber(body.options, 'maxTopics'),
    concurrency: optionNumber(body.options, 'concurrency'),
    requestDelayMs: optionNumber(body.options, 'requestDelayMs'),
    contentType: optionContentType(body.options),
    crawlMode,
    force: crawlMode === 'full',
    dryRun: optionBoolean(body.options, 'dryRun'),
    skipAuthProbe: optionBoolean(body.options, 'skipAuthProbe'),
    cookieHeaderEnv: 'GODDESSFANTASY_COOKIE',
    loginUsernameEnv: 'GODDESSFANTASY_USERNAME',
    loginPasswordEnv: 'GODDESSFANTASY_PASSWORD',
  });
  registerFilesUnder(job.id, result.outDir, ['.json', '.jsonl', '.html', '.md']);
  finishJob(job.id, result.failures > 0 ? 'partial' : 'succeeded', result, [], []);
}

async function runRecordsToPlaintextJob(job: WebJob, body: WebJobRequest): Promise<void> {
  const recordsPath = writeJobInput(job.id, jsonFileName(body.fileName ?? 'records.json'), requireContent(body));
  setJobProgress(job.id, 1, 2, 'records.json 转 plaintext');
  const result = runRecordsToPlaintext({
    recordsPath,
    outDir: join(jobOutputDir(job.id), 'plaintext'),
    contentType: optionContentType(body.options) ?? 'monster',
    site: optionString(body.options, 'site'),
    force: true,
    dryRun: optionBoolean(body.options, 'dryRun'),
  });
  registerFilesUnder(job.id, jobOutputDir(job.id), ['.md', '.json', '.jsonl']);
  finishJob(job.id, result.failures.length > 0 ? 'partial' : 'succeeded', {
    recordsRead: result.recordsRead,
    recordsMatched: result.recordsMatched,
    blocksEmitted: result.blocksEmitted,
    filesWritten: result.filesWritten,
    skipped: result.skipped,
    warnings: result.warnings.length,
    failures: result.failures.length,
  }, result.warnings.map((warning) => warning.message), result.failures);
}

function finishJob(
  id: string,
  status: WebJobStatus,
  summary: object,
  warnings: string[],
  failures: Array<{ index?: number; sourceName?: string; file?: string; error: string }>,
): void {
  setJobProgress(id, 1, 1, status === 'failed' ? '失败' : '完成');
  appendJobLog(id, status === 'failed' ? 'error' : 'success', statusText(status));
  updateJob(id, {
    status,
    warnings,
    failures,
    summary: Object.fromEntries(Object.entries(summary)),
  });
}

async function runAiMonsterIntake(
  job: WebJob,
  body: WebJobRequest,
  injectedProvider?: MonsterIntakeAiProvider,
): Promise<void> {
  const source = requireContent(body);
  const inputPath = writeJobInput(job.id, markdownFileName(body.fileName ?? 'monster-intake.txt'), source);
  setJobProgress(job.id, 1, 4, 'AI 发现与结构化提取');
  const audit: IntakeProviderAuditEvent[] = [];
  const provider = injectedProvider ?? new OpenAICompatibleMonsterIntakeProvider({
    ...loadMonsterIntakeConfig(),
    audit: (event) => audit.push(event),
  });
  const fvttVersion = optionFvttVersion(body.options);
  if (fvttVersion !== '12' && fvttVersion !== '14') {
    throw new Error('AI monster intake only supports Foundry v12 or v14.');
  }
  const result = await runMonsterIntake({
    source,
    sourceName: basename(inputPath),
    runRoot: join(jobDir(job.id), 'intake-runs'),
    vaultPath: join(jobDir(job.id), 'vault'),
    fvttVersion,
    effectProfile: optionEffectProfile(body.options, fvttVersion),
  }, provider);
  writeFileSync(join(result.runPath, 'provider-audit.json'), JSON.stringify(audit, null, 2));
  registerIntakeFiles(job.id, result);
  finishIntakeJob(job.id, result);
}

export async function resumeAiMonsterIntakeJob(
  job: WebJob,
  decisions: IntakeDecision[],
  injectedProvider?: MonsterIntakeAiProvider,
): Promise<void> {
  if (job.type !== 'ai-monster-intake') throw new Error('Only ai-monster-intake jobs can be resumed.');
  const runId = String(job.summary?.runId ?? '');
  const sourceSha256 = String(job.summary?.sourceSha256 ?? '');
  if (!runId || !sourceSha256) throw new Error('AI monster intake job has no resumable bundle.');
  const runPath = join(jobDir(job.id), 'intake-runs', runId);
  const decisionsPath = join(runPath, 'decisions.json');
  writeFileSync(decisionsPath, JSON.stringify({ runId, sourceSha256, decisions }, null, 2));
  updateJob(job.id, { status: 'running', files: [], error: undefined });
  setJobProgress(job.id, 1, 4, '应用人工确认并重新完整验收');
  const audit: IntakeProviderAuditEvent[] = [];
  const provider = injectedProvider ?? new OpenAICompatibleMonsterIntakeProvider({
    ...loadMonsterIntakeConfig(),
    audit: (event) => audit.push(event),
  });
  const result = await resumeMonsterIntake(runPath, decisionsPath, provider, join(jobDir(job.id), 'vault'));
  writeFileSync(join(runPath, 'provider-audit.resume.json'), JSON.stringify(audit, null, 2));
  registerIntakeFiles(job.id, result);
  finishIntakeJob(job.id, result);
}

function finishIntakeJob(id: string, result: Awaited<ReturnType<typeof runMonsterIntake>>): void {
  const status: WebJobStatus = result.status === 'dry_run' ? 'failed' : result.status;
  finishJob(id, status, {
    runId: result.runId,
    sourceSha256: result.sourceSha256,
    discoveryCount: result.discoveryCount,
    creatures: result.creatures.map((creature) => ({
      id: creature.id,
      label: creature.label,
      status: creature.status,
      calls: creature.calls,
      findings: creature.findings,
    })),
  }, result.creatures.flatMap((creature) => creature.findings.filter((finding) => !finding.blocking).map((finding) => finding.message)),
  result.creatures.filter((creature) => creature.status === 'failed').map((creature) => ({
    sourceName: creature.label,
    error: creature.findings.map((finding) => finding.message).join('; '),
  })));
}

function registerIntakeFiles(id: string, result: Awaited<ReturnType<typeof runMonsterIntake>>): void {
  const common = [
    [join(result.runPath, 'source.txt'), 'source.txt', 'text/plain; charset=utf-8', '原始文本'],
    [join(result.runPath, 'discovery.json'), 'discovery.json', 'application/json; charset=utf-8', '怪物边界'],
    [join(result.runPath, 'decisions.template.json'), 'decisions.template.json', 'application/json; charset=utf-8', '确认模板'],
  ] as const;
  for (const [path, fileName, contentType, label] of common) {
    if (existsSync(path)) addJobFile(id, { path, fileName, contentType, label });
  }
  for (const creature of result.creatures) {
    for (const [name, label, contentType] of [
      ['intake-ir.json', `${creature.label} · IR`, 'application/json; charset=utf-8'],
      ['standard.md', `${creature.label} · 候选 Markdown`, 'text/markdown; charset=utf-8'],
      ['deterministic-report.json', `${creature.label} · 确定性报告`, 'application/json; charset=utf-8'],
      ['deterministic-report.md', `${creature.label} · 核对报告`, 'text/markdown; charset=utf-8'],
      ['ai-review.json', `${creature.label} · AI 终审`, 'application/json; charset=utf-8'],
    ] as const) {
      const path = join(creature.bundlePath, name);
      if (existsSync(path)) addJobFile(id, { path, fileName: `${creature.id}-${name}`, contentType, label });
    }
    if (creature.status === 'accepted' && creature.actorPath && creature.markdownPath) {
      addJobFile(id, { path: creature.actorPath, fileName: `${creature.id}-actor.json`, contentType: 'application/json; charset=utf-8', label: `${creature.label} · Actor JSON` });
      addJobFile(id, { path: creature.markdownPath, fileName: `${creature.id}.md`, contentType: 'text/markdown; charset=utf-8', label: `${creature.label} · 标准 Markdown` });
    }
  }
}

function registerFilesUnder(id: string, root: string, allowedExts: string[]): void {
  if (!existsSync(root)) return;
  for (const filePath of collectFiles(root, allowedExts)) {
    addJobFile(id, {
      path: filePath,
      fileName: basename(filePath),
      contentType: contentTypeFor(filePath),
      label: basename(filePath),
    });
  }
}

function imageAssetsForJob(
  jobId: string,
  options: Record<string, unknown> | undefined,
): { imageAssets: ReturnType<typeof buildWebImageAssetOptions>; warnings: string[] } {
  if (options?.imageAssetsEnabled !== true) {
    return { imageAssets: undefined, warnings: [] };
  }

  try {
    const imageAssets = buildWebImageAssetOptions(options);
    appendJobLog(jobId, 'info', `图片资产已启用：${imageAssets?.publicBaseUrl ?? 'none'}`);
    return { imageAssets, warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendJobLog(jobId, 'error', `图片资产配置无效：${message}`);
    return {
      imageAssets: undefined,
      warnings: [`图片资产配置无效：${message}`],
    };
  }
}

function collectFiles(root: string, allowedExts: string[]): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, allowedExts));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!allowedExts.includes(extname(entry.name).toLowerCase())) continue;
    if (statSync(fullPath).size === 0) continue;
    files.push(fullPath);
  }
  return files.sort();
}

function writeJobInput(id: string, fileName: string, content: string): string {
  const inputDir = jobInputDir(id);
  mkdirSync(inputDir, { recursive: true });
  const outputPath = resolve(inputDir, sanitizeFileName(fileName));
  writeFileSync(outputPath, content, 'utf-8');
  return outputPath;
}

function requireContent(body: WebJobRequest): string {
  if (!body.content?.trim()) {
    throw new Error('content is required.');
  }
  return body.content;
}

function optionFvttVersion(options: Record<string, unknown> | undefined): FvttTargetVersion {
  return parseFvttTargetVersion(options?.fvttVersion ?? '12');
}

function optionEffectProfile(
  options: Record<string, unknown> | undefined,
  fvttVersion: FvttTargetVersion = '12',
): EffectProfile {
  const profile = options?.effectProfile === 'modded-v12' || options?.effectProfile === 'modded-v14'
    ? options.effectProfile
    : 'core';
  assertEffectProfileForTarget(fvttVersion, profile);
  return profile;
}

function optionBoolean(options: Record<string, unknown> | undefined, key: string): boolean {
  return options?.[key] === true;
}

function optionNumber(options: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = options?.[key];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function optionString(options: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = options?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionContentType(options: Record<string, unknown> | undefined): 'all' | 'monster' | 'unknown' | undefined {
  const value = options?.contentType;
  if (value === 'all' || value === 'monster' || value === 'unknown') return value;
  return undefined;
}

function optionCrawlMode(options: Record<string, unknown> | undefined): GoddessFantasyCrawlMode {
  const value = options?.crawlMode;
  if (value === undefined) return 'incremental';
  if (value === 'full' || value === 'incremental') return value;
  throw new Error(`Invalid crawlMode: ${String(value)}`);
}

function summaryForConversion(result: ConversionResult): Record<string, unknown> {
  return {
    kind: result.kind,
    name: result.name,
    itemCount: result.itemCount,
    outputPath: result.outputPath,
    fvttVersion: result.fvttVersion,
    effectProfile: result.effectProfile,
    warnings: result.warnings.length,
    verification: result.verification,
    rawJson: result.rawJson,
  };
}

function markdownFileName(value: string): string {
  const clean = sanitizeFileName(value);
  return /\.(md|markdown|txt)$/i.test(clean) ? clean : `${clean}.md`;
}

function jsonFileName(value: string): string {
  const clean = sanitizeFileName(value);
  return clean.toLowerCase().endsWith('.json') ? clean : `${clean}.json`;
}

function sanitizeFileName(value: string): string {
  return basename(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || 'uploaded.md';
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.webp':
      return 'image/webp';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.jsonl':
      return 'application/x-ndjson; charset=utf-8';
    case '.md':
      return 'text/markdown; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function hasTranslationConfig(): boolean {
  return Boolean(Bun.env.TRANSLATION_API_KEY || Bun.env.OPENAI_API_KEY);
}

function statusText(status: WebJobStatus): string {
  if (status === 'succeeded') return '任务完成。';
  if (status === 'partial') return '任务部分完成，请查看失败条目。';
  if (status === 'needs_review') return '任务需要人工确认；Actor JSON 尚未注册为正式下载。';
  if (status === 'failed') return '任务失败。';
  return status;
}
