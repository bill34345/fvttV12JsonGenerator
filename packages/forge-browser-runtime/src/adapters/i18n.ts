/// <reference path="../../../../packages/parser/src/opencc-js.d.ts" />

import { Converter } from 'opencc-js';
import definitions from '../../../../data/cn.json';

export class I18nMapper {
  private readonly reverseMap = new Map<string, string>();
  private readonly converter: (text: string) => string;
  private readonly definitions: Record<string, string>;

  public constructor() {
    this.converter = Converter({ from: 'hk', to: 'cn' });
    this.definitions = definitions as unknown as Record<string, string>;
    for (const [key, value] of Object.entries(this.definitions)) {
      if (typeof value === 'string') this.reverseMap.set(this.converter(value.trim()), key);
    }
  }

  public normalize(input: string): string {
    return this.converter(input.trim());
  }

  public getKey(input: string): string | undefined {
    const result = this.reverseMap.get(this.normalize(input));
    if (result) return result;
    return { '死灵': 'DND5E.DamageNecrotic' }[this.normalize(input)];
  }

  public getTranslation(key: string): string | undefined {
    return this.definitions[key];
  }
}

export const i18n = new I18nMapper();
