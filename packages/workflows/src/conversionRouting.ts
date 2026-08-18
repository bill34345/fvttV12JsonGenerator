import { detectItemRoute, extractFrontmatter } from '@fvtt-json-generator/parser';
import type { CollectionIngestionPort } from './externalPorts';

export type AutomaticConversionRoute =
  | 'single'
  | 'monster-collection'
  | 'item-collection'
  | 'ai-monster-intake'
  | 'ai-item-intake'
  | 'needs-review';

export type AutomaticContentKind = 'actor' | 'item' | 'unknown';
export type AutomaticContentCardinality = 'single' | 'collection' | 'unknown';
export type AutomaticDetectionConfidence = 'high' | 'medium' | 'low';

export interface AutomaticConversionDetection {
  route: AutomaticConversionRoute;
  contentKind: AutomaticContentKind;
  cardinality: AutomaticContentCardinality;
  confidence: AutomaticDetectionConfidence;
  label: string;
  reasons: string[];
  usesAi: boolean;
  itemCount?: number;
}

export interface AutomaticConversionDetectionOptions {
  content: string;
  fileName?: string;
}

export function detectAutomaticConversionRoute(
  options: AutomaticConversionDetectionOptions,
  ingestion: CollectionIngestionPort,
): AutomaticConversionDetection {
  const content = options.content.trim();
  if (!content) return needsReview('没有可识别的文本内容。');

  const frontmatter = extractFrontmatter(content);
  if (detectItemRoute(content)) {
    return detection({
      route: 'single',
      contentKind: 'item',
      cardinality: 'single',
      confidence: 'high',
      label: '标准 Item Markdown',
      reasons: ['检测到 frontmatter 中的 layout: item。'],
    });
  }

  if (/^layout\s*:\s*['"]?creature['"]?\s*$/im.test(frontmatter)) {
    return detection({
      route: 'single',
      contentKind: 'actor',
      cardinality: 'single',
      confidence: 'high',
      label: '标准 Actor Markdown',
      reasons: ['检测到 frontmatter 中的 layout: creature。'],
    });
  }

  const monsterBlocks = ingestion.splitMonsterCollection(content);
  const itemBlocks = ingestion.splitItemCollection(content);
  const itemBlocksWithMetadata = itemBlocks.filter(
    (block) => block.itemType || block.rarity || block.requireAttunement,
  );
  const hasMonsterCollection = monsterBlocks.length > 0;
  const hasItemCollection =
    itemBlocksWithMetadata.length > 0 && itemBlocksWithMetadata.length === itemBlocks.length;

  if (hasMonsterCollection && hasItemCollection) {
    return needsReview('内容同时符合怪物合集与物品合集的结构，不能安全地自动选择。');
  }

  if (hasMonsterCollection) {
    return detection({
      route: 'monster-collection',
      contentKind: 'actor',
      cardinality: 'collection',
      confidence: 'high',
      label: monsterBlocks.length === 1 ? '怪物条目' : '怪物合集',
      reasons: [`检测到 ${monsterBlocks.length} 个带名称边界的怪物条目。`],
      itemCount: monsterBlocks.length,
    });
  }

  if (hasItemCollection) {
    return detection({
      route: 'item-collection',
      contentKind: 'item',
      cardinality: 'collection',
      confidence: 'high',
      label: itemBlocks.length === 1 ? '物品条目' : '物品合集',
      reasons: [`检测到 ${itemBlocks.length} 个带类型或稀有度信息的物品条目。`],
      itemCount: itemBlocks.length,
    });
  }

  const actorSignals = countSignals(content, [
    /\barmor class\b|护甲等级|护甲级别/i,
    /\bhit points\b|生命值|生命點數/i,
    /\bchallenge\b|挑战等级|挑戰等級/i,
    /\b(?:str|dex|con|int|wis|cha)\s*:/i,
    /力量\s*[:：]|敏捷\s*[:：]|体质\s*[:：]|智力\s*[:：]|感知\s*[:：]|魅力\s*[:：]/,
    /^#{1,3}\s*(?:actions?|动作|動作|传奇动作|傳奇動作)\s*$/im,
  ]);
  const itemSignals = countSignals(content, [
    /\brarity\b|稀有度|稀有度等级/i,
    /\battunement\b|需(?:要)?同调|需(?:要)?同調/i,
    /\bcharges?\b|充能|使用次数/i,
    /\b(?:weapon|armor|wondrous item|potion|ring|rod|staff|wand)\b/i,
    /武器|护甲|護甲|奇物|药水|藥水|戒指|法杖|魔杖/,
  ]);

  if (actorSignals >= 2 && actorSignals >= itemSignals + 1) {
    return detection({
      route: 'ai-monster-intake',
      contentKind: 'actor',
      cardinality: 'single',
      confidence: actorSignals >= 4 ? 'high' : 'medium',
      label: '原始怪物资料',
      reasons: [`检测到 ${actorSignals} 组怪物属性信号，但缺少标准项目 frontmatter。`],
      usesAi: true,
    });
  }

  if (itemSignals >= 2 && itemSignals >= actorSignals + 1) {
    return detection({
      route: 'ai-item-intake',
      contentKind: 'item',
      cardinality: 'single',
      confidence: itemSignals >= 4 ? 'high' : 'medium',
      label: '原始物品资料',
      reasons: [`检测到 ${itemSignals} 组物品属性信号，但缺少标准项目 frontmatter。`],
      usesAi: true,
    });
  }

  return needsReview(
    actorSignals === itemSignals && actorSignals > 0
      ? 'Actor 与 Item 信号接近，需要确认内容种类。'
      : '没有足够结构判断这是 Actor、Item 还是合集。',
  );
}

function countSignals(content: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(content) ? 1 : 0), 0);
}

function detection(
  value: Omit<AutomaticConversionDetection, 'usesAi'> & { usesAi?: boolean },
): AutomaticConversionDetection {
  return { ...value, usesAi: value.usesAi ?? false };
}

function needsReview(reason: string): AutomaticConversionDetection {
  return {
    route: 'needs-review',
    contentKind: 'unknown',
    cardinality: 'unknown',
    confidence: 'low',
    label: '需要确认内容种类',
    reasons: [reason],
    usesAi: false,
  };
}
