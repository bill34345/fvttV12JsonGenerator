import { load } from 'js-yaml';
import {
  FORGE_SOURCE_ID_FIELD,
  isForgeItemSourceId,
  type ForgeItemSourceId,
} from '@fvtt-json-generator/contracts';
import type { ParsedItem } from '@fvtt-json-generator/models/item';
import { ItemParser } from './itemParser';
import { extractFrontmatter } from './itemRouter';

export interface ParsedForgeItemSource {
  sourceId: ForgeItemSourceId;
  item: ParsedItem;
  stageIndex?: number;
}

/**
 * Forge-only Item parser boundary. It validates source identity and requires
 * a source-provided name before Forge can produce a candidate.
 * Existing CLI/Web callers keep using ItemParser directly.
 */
export function parseForgeItemSource(content: string): ParsedForgeItemSource {
  if (!/^(?:\uFEFF)?---[ \t]*(?:\r\n|\n)/u.test(content)) {
    throw new Error('InvalidField: Forge Item source requires YAML frontmatter');
  }
  const frontmatter = extractFrontmatter(content);

  let parsed: unknown;
  try {
    parsed = load(frontmatter);
  } catch (error) {
    throw new Error('InvalidField: Forge Item source frontmatter must be valid YAML', { cause: error });
  }
  if (!isRecord(parsed) || !Object.prototype.hasOwnProperty.call(parsed, FORGE_SOURCE_ID_FIELD)) {
    throw new Error(`InvalidField: '${FORGE_SOURCE_ID_FIELD}' is required for Forge Item sources`);
  }
  const sourceId = parsed[FORGE_SOURCE_ID_FIELD];
  if (!isForgeItemSourceId(sourceId)) {
    throw new Error(`InvalidField: '${FORGE_SOURCE_ID_FIELD}' must be a canonical item:v1 UUID v4 source ID`);
  }
  const item = new ItemParser().parse(content);
  if (!item.name.trim() || item.name === 'Unknown Item') {
    throw new Error('标准物品资料缺少可识别的名称。原始描述请用「AI 整理」，标准资料请提供 YAML 的「名称」或 name 字段，或使用「## 物品名称」格式。');
  }
  const stage = parsed['forge-item-stage'];
  if (stage !== undefined && (typeof stage !== 'number' || !Number.isInteger(stage) || stage < 1 || stage > (item.stages?.length ?? 0))) {
    throw new Error('标准物品资料的 forge-item-stage 必须指向原文中的一个阶段。');
  }
  return { sourceId, item, ...(typeof stage === 'number' ? { stageIndex: stage - 1 } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
