import { Converter } from 'opencc-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class I18nMapper {
  private reverseMap: Map<string, string> = new Map();
  private converter: (text: string) => string;
  private definitions: Record<string, string> = {};

  constructor() {
    this.converter = Converter({ from: 'hk', to: 'cn' });
    this.loadDefinitions();
  }

  private loadDefinitions() {
    try {
      const path = join(process.cwd(), 'data', 'cn.json');
      if (!existsSync(path)) {
        console.warn(`Warning: cn.json not found at ${path}`);
        return;
      }
      
      const content = readFileSync(path, 'utf-8');
      this.definitions = JSON.parse(content);

      for (const [key, value] of Object.entries(this.definitions)) {
        if (typeof value === 'string') {
          // Normalize the value from cn.json just in case
          const simplified = this.converter(value.trim());
          
          // Map "力量" -> "DND5E.AbilityStr"
          this.reverseMap.set(simplified, key);
          
          // Map "DND5E.AbilityStr" -> "力量" (simplified)
          // Useful for looking up translation from key
          // But here we mainly need reverse mapping
        }
      }
    } catch (error) {
      console.warn('Failed to load cn.json:', error);
    }
  }

  /**
   * Convert input to Simplified Chinese
   */
  public normalize(input: string): string {
    return this.converter(input.trim());
  }

  /**
   * Get the DND5E key for a Chinese string
   * @param input Chinese string (e.g. "力量" or "體質")
   * @returns DND5E Key (e.g. "DND5E.AbilityStr") or undefined
   */
  public getKey(input: string): string | undefined {
    const simplified = this.normalize(input);
    const result = this.reverseMap.get(simplified);
    if (result) return result;

    // Fallback for common damage type synonyms
    const fallbackMap: Record<string, string> = {
      '死灵': 'DND5E.DamageNecrotic',
    };
    return fallbackMap[simplified];
  }

  /**
   * Get the Translation for a DND5E key
   */
  public getTranslation(key: string): string | undefined {
    return this.definitions[key];
  }
}

export const i18n = new I18nMapper();
