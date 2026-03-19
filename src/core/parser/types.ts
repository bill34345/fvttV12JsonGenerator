import type { ParsedNPC } from '../../config/mapping';

export type ParserRoute = 'chinese' | 'english';

export interface ParserStrategy {
  readonly type: ParserRoute;
  parse(content: string): ParsedNPC;
}
