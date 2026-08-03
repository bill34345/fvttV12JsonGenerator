import type {
  DocumentCandidate,
  DocumentLanguage,
  MarkdownTranslationService,
  MarkdownTranslationWorkflowLike,
  MarkdownTranslationWorkflowOptions,
  TranslationWarning,
  TranslatedCandidate,
} from './types';

const PROTECTED_PATTERNS: RegExp[] = [
  /<!--[\s\S]*?-->/g,
  /\b\d+d\d+(?:\s*[+-]\s*\d+)?\b/gi,
  /\bDC\s*\d+\b/gi,
  /\b(?:AC|HP|CR)\s*\d+\b/gi,
  /\b[+-]\d+(?:\s+(?:to hit|attack))?\b/gi,
  /\b\d+(?:\.\d+)?\s*(?:ft|feet|foot|尺|英尺)\b/gi,
  /\b\d+(?:st|nd|rd|th)\b/gi,
  /\b\d+\b/g,
];

export class MarkdownTranslationWorkflow implements MarkdownTranslationWorkflowLike {
  async translateCandidates(
    candidates: DocumentCandidate[],
    selectedIds: string[],
    options: MarkdownTranslationWorkflowOptions = {},
  ): Promise<TranslatedCandidate[]> {
    const selected = new Set(selectedIds);
    const service = options.service ?? null;
    const targetLanguage = options.targetLanguage ?? 'zh-CN';
    const sourceLanguage = options.sourceLanguage ?? 'auto';
    const results: TranslatedCandidate[] = [];

    for (const candidate of candidates) {
      if (!selected.has(candidate.id)) continue;
      if (candidate.status !== 'high') {
        results.push({
          candidateId: candidate.id,
          status: 'needs_review',
          sourceMarkdown: candidate.rawMarkdown,
          translatedMarkdown: candidate.rawMarkdown,
          protectedTokenCount: 0,
          warnings: [{
            candidateId: candidate.id,
            code: 'CANDIDATE_NOT_HIGH_CONFIDENCE',
            message: `候选 ${candidate.label} 不是高置信度候选，已阻止自动翻译。`,
          }],
        });
        continue;
      }

      results.push(await this.translateOne(candidate, service, sourceLanguage, targetLanguage));
    }
    return results;
  }

  private async translateOne(
    candidate: DocumentCandidate,
    service: MarkdownTranslationService | null,
    sourceLanguage: DocumentLanguage,
    targetLanguage: string,
  ): Promise<TranslatedCandidate> {
    const source = candidate.rawMarkdown;
    if (isChineseEnough(source, sourceLanguage)) {
      return {
        candidateId: candidate.id,
        status: 'unchanged',
        sourceMarkdown: source,
        translatedMarkdown: source,
        protectedTokenCount: 0,
        warnings: [],
      };
    }
    if (!service) {
      return {
        candidateId: candidate.id,
        status: 'needs_review',
        sourceMarkdown: source,
        translatedMarkdown: source,
        protectedTokenCount: 0,
        warnings: [{
          candidateId: candidate.id,
          code: 'TRANSLATION_SERVICE_MISSING',
          message: '候选包含英文内容，但没有配置 Markdown 翻译服务；已保留原文且不会生成正式 JSON。',
        }],
      };
    }

    const protectedSource = protectMechanicalContent(source);
    try {
      const baseContext = {
        sourceLanguage: sourceLanguage === 'zh-CN' ? 'zh-CN' : 'en',
        targetLanguage,
        namespace: 'document.markdown',
        metadata: {
          candidateId: candidate.id,
          pageNumber: candidate.pageNumber,
          protectedTokenCount: protectedSource.tokens.length,
        },
      };
      let response = await service.translate(protectedSource.text, baseContext);
      let translatedText = typeof response === 'string' ? response : response.text;
      let warnings = typeof response === 'string' ? [] : (response.warnings ?? []);
      if (!translatedText.trim()) throw new Error('翻译服务返回空内容。');
      const orderedTokens = orderProtectedTokens(protectedSource.text, protectedSource.tokens);
      let tokenValidation = validateProtectedTokens(translatedText, orderedTokens);
      let retryWarning: TranslationWarning | undefined;
      if (!tokenValidation.valid) {
        response = await service.translate(protectedSource.text, {
          ...baseContext,
          metadata: { ...baseContext.metadata, mechanicalRetry: true },
        });
        translatedText = typeof response === 'string' ? response : response.text;
        warnings = typeof response === 'string' ? [] : (response.warnings ?? []);
        tokenValidation = validateProtectedTokens(translatedText, orderedTokens);
        retryWarning = {
          candidateId: candidate.id,
          code: 'PROTECTED_TOKEN_RETRY',
          message: '首次翻译未完整保留机械字段占位符，已使用严格占位符规则重试。',
        };
      }
      if (!tokenValidation.valid) {
        return {
          candidateId: candidate.id,
          status: 'needs_review',
          sourceMarkdown: source,
          translatedMarkdown: source,
          protectedTokenCount: protectedSource.tokens.length,
          warnings: [{
            candidateId: candidate.id,
            code: 'PROTECTED_TOKEN_LOST',
            message: `翻译结果未按原顺序完整保留机械字段占位符（${tokenValidation.reason}），占位符校验失败。`,
          }],
        };
      }
      const restored = restoreMechanicalContent(translatedText, protectedSource.tokens);
      const bilingual = preserveEnglishTitle(source, restored);
      const serviceWarnings = warnings.map((warning) => {
        const value = warning && typeof warning === 'object' ? warning as { code?: unknown; message?: unknown } : {};
        return {
        candidateId: candidate.id,
        code: typeof value.code === 'string' ? value.code : 'TRANSLATION_WARNING',
        message: typeof value.message === 'string' ? value.message : '翻译服务返回警告。',
        };
      });
      const failed = serviceWarnings.length > 0 && restored === source;
      return {
        candidateId: candidate.id,
        status: failed ? 'needs_review' : 'translated',
        sourceMarkdown: source,
        translatedMarkdown: failed ? source : bilingual,
        protectedTokenCount: protectedSource.tokens.length,
        warnings: failed
          ? [...serviceWarnings, {
              candidateId: candidate.id,
              code: 'TRANSLATION_FAILED',
              message: '翻译服务失败，已保留原始 Markdown。',
            }]
          : [...(retryWarning ? [retryWarning] : []), ...serviceWarnings],
      };
    } catch (error) {
      return {
        candidateId: candidate.id,
        status: 'needs_review',
        sourceMarkdown: source,
        translatedMarkdown: source,
        protectedTokenCount: protectedSource.tokens.length,
        warnings: [{
          candidateId: candidate.id,
          code: 'TRANSLATION_FAILED',
          message: `翻译失败：${error instanceof Error ? error.message : String(error)}；已保留原始 Markdown。`,
        }],
      };
    }
  }
}

function validateProtectedTokens(
  text: string,
  tokens: Array<{ placeholder: string; value: string }>,
): { valid: true } | { valid: false; reason: string } {
  const observed = [...text.matchAll(/__FVTT_MECHANICAL_[A-Z]+__/g)].map((match) => match[0]);
  const expected = tokens.map((token) => token.placeholder);
  if (observed.length !== expected.length) {
    return { valid: false, reason: observed.length < expected.length ? '存在缺失占位符' : '存在重复或未知占位符' };
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (observed[index] !== expected[index]) return { valid: false, reason: '占位符顺序被改变' };
  }
  return { valid: true };
}

function orderProtectedTokens(
  protectedText: string,
  tokens: Array<{ placeholder: string; value: string }>,
): Array<{ placeholder: string; value: string }> {
  return [...tokens].sort((left, right) => (
    protectedText.indexOf(left.placeholder) - protectedText.indexOf(right.placeholder)
  ));
}

export function protectMechanicalContent(text: string): { text: string; tokens: Array<{ placeholder: string; value: string }> } {
  const tokens: Array<{ placeholder: string; value: string }> = [];
  // Protect feature labels before the numeric pass. Labels such as
  // "Domain Intrusion (Mythic Trait, 1/Day)" contain numbers that would
  // otherwise be split into separate mechanical placeholders.
  let protectedText = protectEnglishFeatureNames(text, tokens);
  for (const pattern of PROTECTED_PATTERNS) {
    protectedText = protectedText.replace(pattern, (value) => {
      const placeholder = `__FVTT_MECHANICAL_${alphaIndex(tokens.length)}__`;
      tokens.push({ placeholder, value });
      return placeholder;
    });
  }
  return { text: protectedText, tokens };
}

const ENGLISH_FEATURE_SECTIONS = new Set([
  'traits',
  'actions',
  'bonus actions',
  'reactions',
  'legendary actions',
  'mythic actions',
]);

const FEATURE_NAME_WORD = String.raw`(?:[A-Z][A-Za-z0-9'’]*(?:-[A-Za-z0-9'’]+)?|of|the|and|or|in|on|to|from|for|a|an)`;

/**
 * Keep English stat-block feature labels in the translated Markdown.
 *
 * This is intentionally conservative: it only considers the first label on
 * a line inside a known feature section, and every word must look like a
 * title word (or a small connector such as "of"). That prevents ordinary
 * English prose from becoming a protected token while preserving names such
 * as "Eye Rays" and "Dream of Creation".
 */
function protectEnglishFeatureNames(
  text: string,
  tokens: Array<{ placeholder: string; value: string }>,
): string {
  let section = '';
  return text.split(/(\r?\n)/u).map((part) => {
    if (part === '\n' || part === '\r\n') return part;
    const heading = part.trim().replace(/^#{1,6}\s*/u, '').replace(/\s+#*$/u, '').replace(/[.:：。]$/u, '').trim().toLowerCase();
    if (ENGLISH_FEATURE_SECTIONS.has(heading)) {
      section = heading;
      return part;
    }
    if (!section || !part.trim()) return part;

    const labelPattern = new RegExp(
      `^(\\s*(?:\\d+[.)]\\s*)?)((?:${FEATURE_NAME_WORD})(?:\\s+(?:${FEATURE_NAME_WORD})){0,5}(?:\\s*\\([^\\n.]{1,100}\\))?)(?=\\s*[.。:：])`,
      'u',
    );
    const match = part.match(labelPattern);
    if (!match || !match[2]) return part;
    const value = match[2].trim();
    const placeholder = `__FVTT_MECHANICAL_${alphaIndex(tokens.length)}__`;
    tokens.push({ placeholder, value });
    return `${part.slice(0, match.index ?? 0)}${match[1]}${placeholder}${part.slice((match.index ?? 0) + match[0].length)}`;
  }).join('');
}

function alphaIndex(index: number): string {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function restoreMechanicalContent(
  text: string,
  tokens: Array<{ placeholder: string; value: string }>,
): string {
  return tokens.reduce((current, token) => current.split(token.placeholder).join(token.value), text);
}

export function isChineseEnough(text: string, sourceLanguage: DocumentLanguage = 'auto'): boolean {
  if (sourceLanguage === 'zh-CN') return true;
  const chinese = (text.match(/[\u3400-\u9fff]/gu) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return chinese > 30 && chinese >= latin * 1.4;
}

function preserveEnglishTitle(source: string, translated: string): string {
  const sourceMatch = source.match(/^(\s*#\s+)(.+)$/m);
  const translatedMatch = translated.match(/^(\s*#\s+)(.+)$/m);
  if (!sourceMatch || !translatedMatch) return translated;
  const sourceTitle = sourceMatch[2]!.trim();
  const translatedTitle = translatedMatch[2]!.trim();
  if (!sourceTitle || translatedTitle.includes(sourceTitle)) return translated;
  return translated.replace(translatedMatch[0], `${translatedMatch[1]}${sourceTitle} / ${translatedTitle}`);
}
