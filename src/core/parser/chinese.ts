import type { ParsedNPC } from '../../config/mapping';
import type { ParserStrategy } from './types';
import { YamlParser } from './yaml';

export class ChineseTemplateParser implements ParserStrategy {
  public readonly type = 'chinese' as const;
  private readonly parser = new YamlParser();

  public parse(content: string): ParsedNPC {
    return this.parser.parse(content);
  }
}
