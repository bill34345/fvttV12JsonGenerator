import type { ParsedNPC } from './mapping';

export type ParserRoute = 'chinese' | 'english';

export interface ParserStrategy {
  readonly type: ParserRoute;
  parse(content: string): ParsedNPC;
}
