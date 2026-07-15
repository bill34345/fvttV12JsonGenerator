import type { ParserRoute } from '../parser/types';
import type { TranslationContext } from '../translation';

export interface TranslationServiceLike {
  translate(text: string, context?: TranslationContext): Promise<{ text: string } | string>;
}

export interface ActorLocalizerOptions {
  translationService?: TranslationServiceLike;
  route: ParserRoute;
}

const LOCAL_NAME_TRANSLATIONS: Record<string, string> = {
  'adult red dragon': '成年红龙',
  bite: '啮咬',
  dagger: '匕首',
  claw: '爪击',
  tail: '尾击',
  'tail attack': '尾击',
  multiattack: '多重攻击',
  'frightful presence': '骇人威仪',
  'fire breath': '火焰吐息',
  detect: '侦测',
  'wing attack': '振翅',
  spellcasting: '施法',
};

const LOCAL_DESCRIPTION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Melee or Ranged Weapon Attack/gi, '近战或远程武器攻击'],
  [/Melee Weapon Attack/gi, '近战武器攻击'],
  [/Ranged Weapon Attack/gi, '远程武器攻击'],
  [/Hit:/gi, '命中：'],
  [/to hit/gi, '命中'],
  [/reach/gi, '触及'],
  [/range/gi, '射程'],
  [/one target/gi, '一个目标'],
  [/piercing damage/gi, '穿刺伤害'],
  [/slashing damage/gi, '挥砍伤害'],
  [/bludgeoning damage/gi, '钝击伤害'],
  [/fire damage/gi, '火焰伤害'],
  [/plus/gi, '外加'],
  [/Dexterity saving throw/gi, '敏捷豁免检定'],
  [/Constitution saving throw/gi, '体质豁免检定'],
  [/Wisdom saving throw/gi, '感知豁免检定'],
  [/Charisma saving throw/gi, '魅力豁免检定'],
  [/half as much damage/gi, '伤害减半'],
  [/The dragon makes/gi, '该龙进行'],
  [/Wisdom \(Perception\) check/gi, '感知（察觉）检定'],
];

const SPELLCASTING_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bspellcasting ability\b/gi, '施法属性spellcasting ability'],
  [/\bspell save DC\b/gi, '法术豁免DCspell save DC'],
  [/\bspell attacks?\b/gi, '法术攻击spell attack'],
  [/\bspellcaster\b/gi, '施法者spellcaster'],
  [/^Spellcasting\b/i, '施法Spellcasting'],
  [/\bCantrips\b/gi, '戏法Cantrips'],
  [/\bat will\b/gi, '随意at will'],
  [/\bslots\b/gi, '法术位slots'],
];

export class ActorLocalizer {
  private readonly translationService?: TranslationServiceLike;
  private readonly route: ParserRoute;

  constructor(options: ActorLocalizerOptions) {
    this.translationService = options.translationService;
    this.route = options.route;
  }

  public async localize(actor: any): Promise<any> {
    actor.name = await this.translateBilingualName(actor.name, 'actor.name');
    if (actor.prototypeToken && typeof actor.prototypeToken === 'object') {
      actor.prototypeToken.name = actor.name;
    }

    for (const item of actor.items ?? []) {
      if (!this.isImportedActionItem(item)) {
        continue;
      }

      item.name = await this.translateBilingualName(item.name, 'item.name');

      if (this.isSpellcastingItem(item)) {
        item.system.description.value = await this.localizeSpellcastingDescription(item);
        continue;
      }

      const description = this.extractDescriptionText(item);
      if (!description) {
        continue;
      }

      const translatedDescription = await this.translateText(description, {
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        namespace: 'item.description',
      });
      item.system.description.value = `<p>${translatedDescription}</p>`;
    }

    return actor;
  }

  private async localizeSpellcastingDescription(item: any): Promise<string> {
    const lines = this.extractDescriptionLines(item);
    if (lines.length === 0) {
      return '<p></p>';
    }

    const localizedLines: string[] = [];
    for (const rawLine of lines) {
      let line = rawLine;
      for (const [pattern, replacement] of SPELLCASTING_TERM_REPLACEMENTS) {
        line = line.replace(pattern, replacement);
      }

      const split = line.split(':');
      if (split.length > 1) {
        const head = split[0]?.trim() ?? '';
        const list = split.slice(1).join(':');
        const names = list
          .split(',')
          .map((name) => name.trim().replace(/[.;]$/g, ''))
          .filter(Boolean);

        if (names.length > 0) {
          const localizedNames = await Promise.all(
            names.map((name) => this.translateBilingualName(name, 'item.spellName')),
          );
          localizedLines.push(`${head}: ${localizedNames.join(', ')}`);
          continue;
        }
      }

      localizedLines.push(line);
    }

    return `<p>${localizedLines.join('<br>')}</p>`;
  }

  private async translateBilingualName(value: unknown, namespace: string): Promise<string> {
    const source = typeof value === 'string' ? value.trim() : '';
    if (!source) {
      return '';
    }

    if (!/[A-Za-z]/.test(source) || /[\u4e00-\u9fff]/.test(source)) {
      return source;
    }

    if (!this.translationService) {
      if (namespace === 'item.name' && this.route === 'english') {
        return source;
      }

      const localTranslation = this.translateLocalName(source);
      if (!localTranslation) {
        return source;
      }

      return this.formatBilingualName(source, localTranslation);
    }

    const translated = await this.translateText(source, {
      sourceLanguage: 'en',
      targetLanguage: 'zh-CN',
      namespace,
    });

    return this.formatBilingualName(source, translated);
  }

  private formatBilingualName(source: string, translated: string): string {
    const normalizedSource = source.trim();
    const normalizedTranslated = translated.trim();

    if (!normalizedSource || !normalizedTranslated) {
      return normalizedSource;
    }

    if (normalizedTranslated.toLowerCase() === normalizedSource.toLowerCase()) {
      return normalizedSource;
    }

    if (normalizedTranslated.includes(normalizedSource)) {
      return normalizedTranslated;
    }

    if (!/[\u4e00-\u9fff]/.test(normalizedTranslated)) {
      return normalizedSource;
    }

    return `${normalizedTranslated}${normalizedSource}`;
  }

  private async translateText(text: string, context: TranslationContext): Promise<string> {
    const source = text.trim();
    if (!source) {
      return source;
    }

    if (!this.translationService) {
      return this.translateLocalText(source, context);
    }

    try {
      const result = await this.translationService.translate(source, context);
      if (typeof result === 'string') {
        return result.trim() || source;
      }

      if (result && typeof result.text === 'string') {
        return result.text.trim() || source;
      }
    } catch {
      return source;
    }

    return source;
  }

  private translateLocalName(value: string): string | undefined {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ');

    return LOCAL_NAME_TRANSLATIONS[normalized as keyof typeof LOCAL_NAME_TRANSLATIONS];
  }

  private translateLocalText(source: string, context: TranslationContext): string {
    if (context.namespace !== 'item.description') {
      return source;
    }

    let translated = source;
    for (const [pattern, replacement] of LOCAL_DESCRIPTION_REPLACEMENTS) {
      translated = translated.replace(pattern, replacement);
    }

    return translated;
  }

  private isImportedActionItem(item: any): boolean {
    return item?.system?.source?.custom === 'Imported';
  }

  private isSpellcastingItem(item: any): boolean {
    return item?.system?.type?.subtype === 'spellcasting';
  }

  private extractDescriptionText(item: any): string {
    const raw = item?.system?.description?.value;
    if (typeof raw !== 'string') {
      return '';
    }

    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private extractDescriptionLines(item: any): string[] {
    const raw = item?.system?.description?.value;
    if (typeof raw !== 'string') {
      return [];
    }

    return raw
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
}
