import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  FileTranslationCache,
  OpenAICompatibleTranslator,
  TranslationService,
  createTranslationConfigFromEnv,
} from '../translation';
import type { TranslationContext } from '../translation';

interface TranslationServiceLike {
  translate(text: string, context?: TranslationContext): Promise<{ text: string; warnings?: unknown[] } | string>;
}

export interface JsonTranslationSyncOptions {
  dirPath: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface JsonTranslationSyncResult {
  dirPath: string;
  scannedFiles: number;
  changedFiles: number;
  translatedFields: number;
  skippedAlreadyTranslated: number;
  warnings: number;
  failures: Array<{ file: string; error: string }>;
}

interface TranslateStats {
  translatedFields: number;
  skippedAlreadyTranslated: number;
  warnings: number;
}

type TranslationTarget = 'none' | 'bilingualName' | 'text';

const HAN_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const HAN_GLOBAL_RE = /[\u3400-\u9fff\uf900-\ufaff]/g;
const ASCII_RE = /[A-Za-z]/;
const PRESERVE_SEGMENT_RE = /(<[^>]+>|@UUID\[[^\]]+\](?:\{[^}]*\})?|@\w+\[[^\]]+\](?:\{[^}]*\})?|\[\[[^\]]+\]\])/g;

export class JsonTranslationSyncWorkflow {
  private translationService?: TranslationServiceLike;

  constructor(options: { translationService?: TranslationServiceLike | null } = {}) {
    this.translationService =
      options.translationService === undefined
        ? this.createDefaultTranslationService()
        : options.translationService ?? undefined;
  }

  public async sync(options: JsonTranslationSyncOptions): Promise<JsonTranslationSyncResult> {
    const dirPath = this.resolvePath(options.dirPath);
    if (!existsSync(dirPath)) {
      throw new Error(`Translate directory not found: ${dirPath}`);
    }

    if (!this.translationService) {
      throw new Error('TRANSLATION_API_KEY (or OPENAI_API_KEY) is required for --translate-json');
    }

    const files = this.collectJsonFiles(dirPath);
    const result: JsonTranslationSyncResult = {
      dirPath,
      scannedFiles: files.length,
      changedFiles: 0,
      translatedFields: 0,
      skippedAlreadyTranslated: 0,
      warnings: 0,
      failures: [],
    };

    const sourceLanguage = options.sourceLanguage ?? 'en';
    const targetLanguage = options.targetLanguage ?? 'zh-CN';

    for (const filePath of files) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        const stats: TranslateStats = {
          translatedFields: 0,
          skippedAlreadyTranslated: 0,
          warnings: 0,
        };

        const translated = await this.translateNode(parsed, [], stats, {
          sourceLanguage,
          targetLanguage,
        });

        result.translatedFields += stats.translatedFields;
        result.skippedAlreadyTranslated += stats.skippedAlreadyTranslated;
        result.warnings += stats.warnings;

        if (stats.translatedFields > 0) {
          writeFileSync(filePath, JSON.stringify(translated, null, 2));
          result.changedFiles++;
        }
      } catch (error: unknown) {
        result.failures.push({
          file: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  private createDefaultTranslationService(): TranslationService | undefined {
    const config = createTranslationConfigFromEnv();
    if (!config.apiKey) {
      return undefined;
    }

    const translator = new OpenAICompatibleTranslator({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutMs: config.timeoutMs,
    });

    return new TranslationService({
      translator,
      cache: new FileTranslationCache(config.cacheFilePath),
      providerName: 'openai-compatible',
      model: config.model,
      baseUrl: config.baseUrl,
    });
  }

  private async translateNode(
    node: unknown,
    path: string[],
    stats: TranslateStats,
    language: { sourceLanguage: string; targetLanguage: string },
  ): Promise<unknown> {
    if (typeof node === 'string') {
      const target = this.getTranslationTarget(path);
      if (target === 'none') {
        return node;
      }

      const source = node.trim();
      if (!source) {
        return node;
      }

      const hasHan = HAN_RE.test(source);
      const hasAscii = ASCII_RE.test(source);

      if (target === 'bilingualName') {
        if (hasHan && hasAscii) {
          stats.skippedAlreadyTranslated++;
          return node;
        }

        if (!hasHan && !hasAscii) {
          return node;
        }

        const contextNamespace = path.join('.');

        if (hasAscii) {
          const translated = await this.translateString(source, {
            sourceLanguage: language.sourceLanguage,
            targetLanguage: language.targetLanguage,
            namespace: contextNamespace,
          });

          stats.warnings += translated.warnings;
          const next = this.formatBilingualNameFromEnglish(source, translated.text);
          if (!next || next === source) {
            return node;
          }

          stats.translatedFields++;
          return next;
        }

        const translated = await this.translateString(source, {
          sourceLanguage: language.targetLanguage,
          targetLanguage: language.sourceLanguage,
          namespace: contextNamespace,
        });

        stats.warnings += translated.warnings;
        const next = this.formatBilingualNameFromChinese(source, translated.text);
        if (!next || next === source) {
          return node;
        }

        stats.translatedFields++;
        return next;
      }

      if (!hasAscii) {
        return node;
      }

      if (hasHan) {
        stats.skippedAlreadyTranslated++;
        return node;
      }

      const translated = await this.translateString(source, {
        sourceLanguage: language.sourceLanguage,
        targetLanguage: language.targetLanguage,
        namespace: path.join('.'),
      });

      stats.warnings += translated.warnings;
      const next = translated.text.trim();
      if (!next || next === source) {
        return node;
      }

      stats.translatedFields++;
      return next;
    }

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        node[i] = await this.translateNode(node[i], [...path, String(i)], stats, language);
      }
      return node;
    }

    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        obj[key] = await this.translateNode(obj[key], [...path, key], stats, language);
      }
      return obj;
    }

    return node;
  }

  private getTranslationTarget(path: string[]): TranslationTarget {
    const key = path[path.length - 1] ?? '';
    const parent = path[path.length - 2] ?? '';

    if (this.isActorNamePath(path) || this.isItemNamePath(path)) {
      return 'bilingualName';
    }

    if (key === 'value' && parent === 'description') return 'text';
    if (key === 'chat' && parent === 'description') return 'text';
    if (key === 'chatFlavor') return 'text';
    if (key === 'requirements') return 'text';
    if (key === 'useConditionText' || key === 'effectConditionText') return 'text';
    if (key === 'special' && parent === 'affects') return 'text';
    if (key === 'description' && path.includes('effects')) return 'text';

    return 'none';
  }

  private isActorNamePath(path: string[]): boolean {
    return path.length === 1 && path[0] === 'name';
  }

  private isItemNamePath(path: string[]): boolean {
    return path.length === 3 && path[0] === 'items' && /^\d+$/.test(path[1] ?? '') && path[2] === 'name';
  }

  private formatBilingualNameFromEnglish(sourceEnglish: string, translated: string): string {
    const source = sourceEnglish.trim();
    if (!source) {
      return source;
    }

    const chinese = this.extractChineseNameCandidate(translated, source);
    if (!chinese) {
      return source;
    }

    return `${chinese} (${source})`;
  }

  private formatBilingualNameFromChinese(sourceChinese: string, translated: string): string {
    const source = sourceChinese.trim();
    if (!source) {
      return source;
    }

    const english = this.extractEnglishNameCandidate(translated, source);
    if (!english) {
      return source;
    }

    return `${source} (${english})`;
  }

  private extractChineseNameCandidate(translated: string, sourceEnglish: string): string {
    let candidate = translated.trim();
    if (!candidate || !HAN_RE.test(candidate)) {
      return '';
    }

    const source = sourceEnglish.trim();
    if (!source) {
      return candidate;
    }

    const escaped = this.escapeRegExp(source);
    candidate = candidate
      .replace(new RegExp(`\\(\\s*${escaped}\\s*\\)`, 'ig'), '')
      .replace(new RegExp(`（\\s*${escaped}\\s*）`, 'ig'), '')
      .replace(new RegExp(escaped, 'ig'), '')
      .replace(/[\s\-–—:：]+/g, ' ')
      .trim();

    if (!candidate || !HAN_RE.test(candidate)) {
      return '';
    }

    return candidate;
  }

  private extractEnglishNameCandidate(translated: string, sourceChinese: string): string {
    let candidate = translated.trim();
    if (!candidate || !ASCII_RE.test(candidate)) {
      return '';
    }

    const source = sourceChinese.trim();
    if (source) {
      const escapedChinese = this.escapeRegExp(source);
      candidate = candidate
        .replace(new RegExp(`\\(\\s*${escapedChinese}\\s*\\)`, 'ig'), '')
        .replace(new RegExp(`（\\s*${escapedChinese}\\s*）`, 'ig'), '')
        .replace(new RegExp(escapedChinese, 'ig'), '');
    }

    candidate = candidate
      .replace(HAN_GLOBAL_RE, ' ')
      .replace(/[\s\-–—:：]+/g, ' ')
      .trim();

    if (!candidate || !ASCII_RE.test(candidate)) {
      return '';
    }

    return candidate;
  }

  private escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async translateString(
    text: string,
    context: TranslationContext,
  ): Promise<{ text: string; warnings: number }> {
    if (!this.translationService) {
      return { text, warnings: 0 };
    }

    const prepared = this.protectSegments(text);
    const source = prepared.text.trim();
    if (!source) {
      return { text, warnings: 0 };
    }

    try {
      const result = await this.translationService.translate(source, context);
      if (typeof result === 'string') {
        return { text: this.restoreSegments(result.trim(), prepared.segments), warnings: 0 };
      }

      if (!result || typeof result.text !== 'string') {
        return { text, warnings: 0 };
      }

      const warnings = Array.isArray(result.warnings) ? result.warnings.length : 0;
      return {
        text: this.restoreSegments(result.text.trim(), prepared.segments),
        warnings,
      };
    } catch {
      return { text, warnings: 0 };
    }
  }

  private protectSegments(text: string): { text: string; segments: string[] } {
    const segments: string[] = [];
    const replaced = text.replace(PRESERVE_SEGMENT_RE, (segment) => {
      const index = segments.push(segment) - 1;
      return `@@KEEP_${index}@@`;
    });

    return { text: replaced, segments };
  }

  private restoreSegments(text: string, segments: string[]): string {
    if (segments.length === 0) {
      return text;
    }

    return text.replace(/@@KEEP_(\d+)@@/g, (placeholder, rawIndex: string) => {
      const index = Number.parseInt(rawIndex, 10);
      if (Number.isNaN(index)) {
        return placeholder;
      }
      return segments[index] ?? placeholder;
    });
  }

  private collectJsonFiles(dir: string): string[] {
    if (!existsSync(dir)) {
      return [];
    }

    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.collectJsonFiles(fullPath));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!entry.name.toLowerCase().endsWith('.json')) {
        continue;
      }

      if (statSync(fullPath).size === 0) {
        continue;
      }

      files.push(fullPath);
    }

    return files.sort();
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(process.cwd(), path);
  }
}
