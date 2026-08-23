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
}

/**
 * Forge-only Item parser boundary. It validates the Item-managed source
 * identity before delegating all Item semantics to the established parser.
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
  return { sourceId, item: new ItemParser().parse(content) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
