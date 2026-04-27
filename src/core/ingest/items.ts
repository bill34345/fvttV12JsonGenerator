/**
 * Item collection ingestion for splitting multi-stage magic items
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ItemIngestionResult {
  sourcePath: string;
  files: Array<{
    fileName: string;
    content: string;
  }>;
  emitDir: string;
  dryRun: boolean;
}

export class ItemsIngestionWorkflow {
  async ingest(options: {
    sourcePath: string;
    emitDir: string;
    dryRun?: boolean;
  }): Promise<ItemIngestionResult> {
    const { sourcePath, emitDir, dryRun = false } = options;

    const text = readFileSync(sourcePath, 'utf-8');
    const blocks = splitItemCollection(text);
    const files: Array<{ fileName: string; content: string }> = [];

    for (const block of blocks) {
      const typeLine = block.itemType ? `类型: ${block.itemType}\n` : '';
      const rarityLine = block.rarity ? `稀有度: ${block.rarity}\n` : '';
      const attunementLine = block.requireAttunement ? 'require-attunement: true\n' : '';
      const frontmatter = `---
layout: item
名称: ${block.chineseName}
英文名: ${block.englishName}
${typeLine}${rarityLine}${attunementLine}---\n`;
      const slug = slugifyEnglishName(block.englishName || block.chineseName);
      const baseName = sanitizeFileName(block.chineseName);
      const stageSuffix = block.stageName ? ` (${block.stageName})` : '';
      const fileName = `${slug}__${baseName}${stageSuffix}.md`;
      const content = frontmatter + block.rawBlock;

      files.push({ fileName, content });

      if (!dryRun) {
        const outputPath = join(emitDir, fileName);
        const outputDir = dirname(outputPath);

        try {
          mkdirSync(outputDir, { recursive: true });
          writeFileSync(outputPath, content, 'utf-8');
        } catch (err) {
          const e = err as Error;
          e.message = `Failed to write ${outputPath}: ${e.message}`;
          throw e;
        }
      }
    }

    return {
      sourcePath,
      files,
      emitDir,
      dryRun,
    };
  }
}

function slugifyEnglishName(value: string): string {
  return stripPublisherSuffix(value)
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, '').trim();
}

export interface ItemBlock {
  rawBlock: string;
  heading: string;
  chineseName: string;
  englishName: string;
  stageName?: string; // 'Dormant State', 'Awakened State', 'Exalted State'
  itemType?: string; // '奇物', '护甲', '武器', etc.
  rarity?: string; // '传说', '极珍稀', etc.
  requireAttunement?: boolean;
}

const STAGE_PATTERNS = {
  dormant: /^\s*\*\*休眠态（Dormant State）\.\*\*/,
  awakened: /^\s*\*\*觉醒态（Awakened State）\.\*\*/,
  exalted: /^\s*\*\*升华态（Exalted State）\.\*\*/,
} as const;

type StageKey = keyof typeof STAGE_PATTERNS;

const STAGE_ORDER: StageKey[] = ['dormant', 'awakened', 'exalted'];

const STAGE_ENGLISH_NAMES: Record<StageKey, string> = {
  dormant: 'Dormant State',
  awakened: 'Awakened State',
  exalted: 'Exalted State',
};

/**
 * Parse Chinese and English names from a heading like "中文名（English）"
 */
function parseNamesFromHeading(heading: string): { chineseName: string; englishName: string } {
  const match = heading.match(/^(.+?)\s*[（(]([^)]+)[)）]\s*$/);
  if (!match?.[1] || !match[2]) {
    return { chineseName: heading.trim(), englishName: '' };
  }

  return {
    chineseName: match[1].trim(),
    englishName: stripPublisherSuffix(match[2].trim()),
  };
}

function stripPublisherSuffix(value: string): string {
  return value.replace(/\bMCDM\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function parseItalicLine(rawBlock: string): { itemType?: string; rarity?: string; requireAttunement?: boolean } {
  const italicMatch = rawBlock.match(/^\*([^*]+)\*$/m);
  if (!italicMatch?.[1]) {
    return {};
  }

  const content = italicMatch[1];
  const parts = content.split(/[,，]/).map(p => p.trim());

  const typeKeywords = ['武器', '装备', '护甲', '奇物', '消耗品', '工具', '弹药', '容器', '魔杖', '权杖', 'rod', 'wand', 'staff', 'weapon', 'equipment', 'armor', 'consumable', 'tool', 'ammunition', 'container'];
  const rarityKeywords = ['普通', 'common', '稀有', 'uncommon', 'rare', '非常稀有', 'very rare', 'veryrare', '传说', 'legendary', '神器', 'artifact', '极珍稀'];
  const attunementKeywords = ['需同调', 'require-attunement', 'requires attunement', 'attunement required'];

  let itemType: string | undefined;
  let rarity: string | undefined;
  let requireAttunement: boolean | undefined;

  for (const part of parts) {
    const lowerPart = part.toLowerCase();
    if (attunementKeywords.some(kw => lowerPart.includes(kw.toLowerCase()))) {
      requireAttunement = true;
    }
    if (typeKeywords.some(kw => lowerPart.includes(kw.toLowerCase())) && !itemType) {
      itemType = part;
    } else if (!itemType && !rarity) {
      const isRarity = rarityKeywords.some(kw => lowerPart.includes(kw.toLowerCase()));
      if (isRarity) {
        rarity = part;
      }
    } else if (!rarity) {
      const isRarity = rarityKeywords.some(kw => lowerPart.includes(kw.toLowerCase()));
      if (isRarity) {
        rarity = part;
      }
    }
  }

  return { itemType, rarity, ...(requireAttunement ? { requireAttunement } : {}) };
}

/**
 * Detect if a line contains a stage heading
 */
function detectStageHeading(line: string): StageKey | null {
  for (const key of STAGE_ORDER) {
    if (STAGE_PATTERNS[key].test(line)) {
      return key;
    }
  }
  return null;
}

function splitBlockByStages(block: string): Array<{ stageName: string; block: string }> {
  const lines = block.split('\n');
  const result: Array<{ stageName: string; block: string }> = [];

  let currentStage: StageKey | null = null;
  let currentStageLines: string[] = [];
  let pastFirstLine = false;

  for (const line of lines) {
    if (pastFirstLine && /^##\s+/m.test(line)) {
      if (currentStage !== null && currentStageLines.length > 0) {
        result.push({
          stageName: STAGE_ENGLISH_NAMES[currentStage],
          block: currentStageLines.join('\n').trim(),
        });
      }
      break;
    }
    pastFirstLine = true;

    const stageMatch = detectStageHeading(line);
    if (stageMatch) {
      if (currentStage !== null && currentStageLines.length > 0) {
        result.push({
          stageName: STAGE_ENGLISH_NAMES[currentStage],
          block: currentStageLines.join('\n').trim(),
        });
      }
      currentStage = stageMatch;
      currentStageLines = [line];
    } else if (currentStage !== null) {
      currentStageLines.push(line);
    }
  }

  if (currentStage !== null && currentStageLines.length > 0) {
    result.push({
      stageName: STAGE_ENGLISH_NAMES[currentStage],
      block: currentStageLines.join('\n').trim(),
    });
  }

  return result;
}

/**
 * Check if a block contains any stage headings
 */
function hasStages(block: string): boolean {
  const stageIndicator = /\*\*（休眠态|觉醒态|升华态）/;
  return stageIndicator.test(block);
}

export function splitItemCollection(text: string): ItemBlock[] {
  const normalized = text.replace(/\r\n/g, '\n');

  const headingPattern = /^##\s+(.+?)\s*$/gm;
  const matches = [...normalized.matchAll(headingPattern)];

  const blocks: ItemBlock[] = [];

  for (let index = 0; index < matches.length; index++) {
    const current = matches[index];
    const next = matches[index + 1];

    if (!current?.index || !current[1]) {
      if (current?.index !== 0 || !current[1]) continue;
    }

    const start = current.index ?? 0;
    const end = next?.index ?? normalized.length;
    const rawBlock = normalized.slice(start, end).trim();
    const heading = current[1].trim();

    // Skip template section headings
    if (heading.includes('物品模版') || heading.includes('下面是两个示例物品') || heading === '物品名（English Name）') {
      continue;
    }

    const names = parseNamesFromHeading(heading);
    const italicMeta = parseItalicLine(rawBlock);

    if (hasStages(rawBlock)) {
      const stageBlocks = splitBlockByStages(rawBlock);
      for (const { stageName, block } of stageBlocks) {
        blocks.push({
          rawBlock: block,
          heading: names.chineseName,
          chineseName: names.chineseName,
          englishName: names.englishName,
          stageName,
          ...italicMeta,
        });
      }
    } else {
      blocks.push({
        rawBlock,
        heading: names.chineseName,
        chineseName: names.chineseName,
        englishName: names.englishName,
        ...italicMeta,
      });
    }
  }

  return blocks;
}
