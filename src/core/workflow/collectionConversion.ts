import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { EffectProfile } from '../generator/effectProfileApplier';
import type { IconWorkflowOptions } from '../icons/types';
import { mergeIconReviewReports, writeIconReviewReport } from '../icons/report';
import { parseCreatureBlock, splitCollection } from '../ingest/plaintext';
import { splitItemCollection, type ItemBlock } from '../ingest/items';
import {
  convertMarkdownContentToJson,
  type ConversionResult,
  type FvttTargetVersion,
} from './singleFileConversion';

export type CollectionKind = 'monster-collection' | 'item-collection';
export type CollectionStatus = 'succeeded' | 'partial' | 'failed';

export interface CollectionOutputFile {
  id: string;
  fileName: string;
  path: string;
  contentType: string;
  label: string;
}

export interface CollectionItemResult {
  index: number;
  sourceName: string;
  status: 'succeeded' | 'failed';
  result?: ConversionResult;
  outputFile?: CollectionOutputFile;
  error?: string;
  warnings: string[];
}

export interface CollectionConversionResult {
  kind: CollectionKind;
  status: CollectionStatus;
  fvttVersion: FvttTargetVersion;
  effectProfile: EffectProfile;
  itemCount: number;
  succeeded: number;
  failed: number;
  warnings: string[];
  failures: Array<{ index: number; sourceName: string; error: string }>;
  items: CollectionItemResult[];
  outputFiles: CollectionOutputFile[];
}

export interface CollectionConversionOptions {
  content: string;
  fileName?: string;
  outputDir: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  iconOptions?: IconWorkflowOptions;
}

export async function convertMonsterCollectionToJson(
  options: CollectionConversionOptions,
): Promise<CollectionConversionResult> {
  const blocks = splitCollection(options.content);
  if (blocks.length === 0) {
    throw new Error('No monster blocks found. Expected headings like # **名称 (English Name)**.');
  }

  const outputDir = resolve(options.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const items: CollectionItemResult[] = [];

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    const sourceName = block.englishName ? `${block.chineseName} (${block.englishName})` : block.chineseName;
    try {
      const generated = parseCreatureBlock(block.rawBlock);
      const outputFile = outputFileFor(outputDir, generated.fileName.replace(/\.md$/i, '.json'), sourceName);
      const result = await convertMarkdownContentToJson({
        content: generated.markdown,
        sourcePath: join(outputDir, '..', 'input', generated.fileName),
        outputPath: outputFile.path,
        fvttVersion: options.fvttVersion,
        effectProfile: options.effectProfile,
        iconOptions: options.iconOptions,
        writeIconReviewReport: false,
      });
      if (result.status !== 'accepted') {
        items.push({
          index,
          sourceName,
          status: 'failed',
          result,
          error: `${result.status}: ${result.diagnostics.map((entry) => `[${entry.code}] ${entry.message}`).join('; ')}`,
          warnings: result.warnings,
        });
        continue;
      }
      items.push({
        index,
        sourceName,
        status: 'succeeded',
        result,
        outputFile,
        warnings: result.warnings,
      });
    } catch (error) {
      items.push({
        index,
        sourceName,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        warnings: [],
      });
    }
  }

  return summarizeCollection('monster-collection', items, options.fvttVersion ?? '12', options.effectProfile ?? 'core', outputDir);
}

export async function convertItemCollectionToJson(
  options: CollectionConversionOptions,
): Promise<CollectionConversionResult> {
  const blocks = splitItemCollection(options.content);
  if (blocks.length === 0) {
    throw new Error('No item blocks found. Expected headings like ## 物品名（English Name）.');
  }

  const outputDir = resolve(options.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const items: CollectionItemResult[] = [];

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    const sourceName = block.englishName ? `${block.chineseName} (${block.englishName})` : block.chineseName;
    try {
      const markdown = itemBlockToProjectMarkdown(block);
      const outputFile = outputFileFor(outputDir, itemBlockFileName(block).replace(/\.md$/i, '.json'), sourceName);
      const result = await convertMarkdownContentToJson({
        content: markdown,
        sourcePath: join(outputDir, '..', 'input', itemBlockFileName(block)),
        outputPath: outputFile.path,
        fvttVersion: options.fvttVersion,
        effectProfile: options.effectProfile,
        iconOptions: options.iconOptions,
        writeIconReviewReport: false,
      });
      if (result.status !== 'accepted') {
        items.push({
          index,
          sourceName,
          status: 'failed',
          result,
          error: `${result.status}: ${result.diagnostics.map((entry) => `[${entry.code}] ${entry.message}`).join('; ')}`,
          warnings: result.warnings,
        });
        continue;
      }
      items.push({
        index,
        sourceName,
        status: 'succeeded',
        result,
        outputFile,
        warnings: result.warnings,
      });
    } catch (error) {
      items.push({
        index,
        sourceName,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        warnings: [],
      });
    }
  }

  return summarizeCollection('item-collection', items, options.fvttVersion ?? '12', options.effectProfile ?? 'core', outputDir);
}

export function writeTextArtifact(
  outputDir: string,
  fileName: string,
  content: string,
  label = fileName,
  contentType = 'text/markdown; charset=utf-8',
): CollectionOutputFile {
  const outputFile = outputFileFor(outputDir, fileName, label, contentType);
  mkdirSync(dirname(outputFile.path), { recursive: true });
  writeFileSync(outputFile.path, content, 'utf-8');
  return outputFile;
}

function summarizeCollection(
  kind: CollectionKind,
  items: CollectionItemResult[],
  fvttVersion: FvttTargetVersion,
  effectProfile: EffectProfile,
  outputDir: string,
): CollectionConversionResult {
  const succeededItems = items.filter((item) => item.status === 'succeeded');
  const failedItems = items.filter((item) => item.status === 'failed');
  const warnings = items.flatMap((item) => item.warnings);
  const outputFiles = succeededItems.flatMap((item) => item.outputFile ? [item.outputFile] : []);
  const iconReview = mergeIconReviewReports(
    succeededItems.map((item) => item.result?.iconReview),
  );
  if (iconReview) {
    const path = join(outputDir, 'icon-review.json');
    writeIconReviewReport(path, iconReview);
    outputFiles.push({
      id: 'icon-review.json',
      fileName: 'icon-review.json',
      path,
      contentType: 'application/json; charset=utf-8',
      label: 'v14 图标审阅报告',
    });
  }
  return {
    kind,
    status: failedItems.length === 0 ? 'succeeded' : succeededItems.length > 0 ? 'partial' : 'failed',
    fvttVersion,
    effectProfile,
    itemCount: items.length,
    succeeded: succeededItems.length,
    failed: failedItems.length,
    warnings,
    failures: failedItems.map((item) => ({
      index: item.index,
      sourceName: item.sourceName,
      error: item.error ?? 'Unknown error',
    })),
    items,
    outputFiles,
  };
}

function outputFileFor(
  outputDir: string,
  fileName: string,
  label: string,
  contentType = 'application/json; charset=utf-8',
): CollectionOutputFile {
  const safeName = sanitizeFileName(fileName);
  return {
    id: safeName,
    fileName: safeName,
    path: join(outputDir, safeName),
    contentType,
    label,
  };
}

function itemBlockToProjectMarkdown(block: ItemBlock): string {
  const typeLine = block.itemType ? `类型: ${block.itemType}\n` : '';
  const rarityLine = block.rarity ? `稀有度: ${block.rarity}\n` : '';
  const attunementLine = block.requireAttunement ? 'require-attunement: true\n' : '';
  return `---\nlayout: item\n名称: ${block.chineseName}\n英文名: ${block.englishName}\n${typeLine}${rarityLine}${attunementLine}---\n${block.rawBlock}\n`;
}

function itemBlockFileName(block: ItemBlock): string {
  const stageSuffix = block.stageName ? ` (${block.stageName})` : '';
  const slug = slugify(block.englishName || block.chineseName) || 'item';
  return `${slug}__${sanitizeFileName(block.chineseName)}${stageSuffix}.md`;
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function sanitizeFileName(value: string): string {
  const clean = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return clean || 'output.json';
}
