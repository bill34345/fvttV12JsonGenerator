import type { ParsedNPC } from '../../config/mapping';
import { ChineseTemplateParser } from './chinese';
import { EnglishBestiaryParser } from './english';
import type { ParserRoute, ParserStrategy } from './types';

export class ParserFactory {
  private readonly chineseParser = new ChineseTemplateParser();
  private readonly englishParser = new EnglishBestiaryParser();

  public detectRoute(content: string): ParserRoute {
    const frontmatter = this.extractFrontmatter(content);
    const hasCreatureLayout = /^layout\s*:\s*['"]?creature['"]?\s*$/im.test(frontmatter);
    return hasCreatureLayout ? 'english' : 'chinese';
  }

  public createParser(content: string): ParserStrategy {
    return this.detectRoute(content) === 'english' ? this.englishParser : this.chineseParser;
  }

  public parse(content: string): ParsedNPC {
    return this.createParser(content).parse(content);
  }

  private extractFrontmatter(content: string): string {
    const normalized = content.trim();
    const leadingMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
    if (leadingMatch?.[1] !== undefined) {
      return leadingMatch[1];
    }

    const separatorIndex = normalized.indexOf('\n---\n');
    if (separatorIndex !== -1) {
      return normalized.substring(0, separatorIndex);
    }

    return normalized;
  }
}
