import type { ParsedItem } from '../models/item';

/**
 * Strategy interface for parsing item content into ParsedItem structure.
 * Used by the parser system to handle different item types and formats.
 */
export interface ItemParserStrategy {
  readonly type: 'item';
  parse(content: string, normalizedBody?: string): ParsedItem;
  canParse(content: string): boolean;
}
