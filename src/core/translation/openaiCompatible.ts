import {
  type HttpClient,
  type HttpRequest,
  type TranslationContext,
  TranslationProviderError,
  type Translator,
} from './types';

interface OpenAICompatibleTranslatorOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  httpClient?: HttpClient;
}

function defaultHttpClient(url: string, init: HttpRequest) {
  return fetch(url, init as RequestInit);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'))
  );
}

function cleanTranslatedContent(value: string): string {
  let cleaned = value.trim();
  const leadingReasoningBlock = /^<(?:think|analysis|reasoning)\b[^>]*>[\s\S]*?<\/(?:think|analysis|reasoning)>\s*/i;

  while (leadingReasoningBlock.test(cleaned)) {
    cleaned = cleaned.replace(leadingReasoningBlock, '').trim();
  }

  if (!cleaned || /<\/?(?:think|analysis|reasoning)\b/i.test(cleaned)) {
    throw new TranslationProviderError(
      'invalid_response',
      'Translation provider returned reasoning markup without a clean translated value',
    );
  }

  return cleaned;
}

function buildSystemPrompt(context: TranslationContext): string {
  const sourceLanguage = context.sourceLanguage ?? 'en';
  const targetLanguage = context.targetLanguage ?? 'zh-CN';
  const namespace = context.namespace ? `\nDomain: ${context.namespace}` : '';
  const isDocumentMarkdown = context.namespace?.startsWith('document.markdown') ?? false;
  if (!isDocumentMarkdown) {
    return `Translate text from ${sourceLanguage} to ${targetLanguage}. Return only translated text.${namespace}`;
  }

  const protectedTokenCount = context.metadata?.protectedTokenCount;
  const countHint = typeof protectedTokenCount === 'number'
    ? ` The input contains exactly ${protectedTokenCount} protected placeholders.`
    : '';
  const retryHint = context.metadata?.mechanicalRetry === true
    ? ' This is a strict retry after a previous output failed placeholder validation; check the complete placeholder set before returning.'
    : '';
  return `Translate Markdown from ${sourceLanguage} to ${targetLanguage}. Return only the translated Markdown.${namespace}
This is a protected Markdown translation task.${countHint}${retryHint}
Copy every token matching __FVTT_MECHANICAL_<letters>__ exactly as it appears in the input, exactly once, and in the same order.
These are opaque mechanical placeholders, not translatable text. Never translate, rewrite, split, delete, duplicate, or move them.
Preserve Markdown structure and all non-placeholder mechanics. Verify the placeholder set before returning the translation.`;
}

export class OpenAICompatibleTranslator implements Translator {
  private readonly httpClient: HttpClient;
  private readonly timeoutMs: number;

  constructor(private readonly options: OpenAICompatibleTranslatorOptions) {
    this.httpClient = options.httpClient ?? defaultHttpClient;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  public async translate(text: string, context: TranslationContext = {}): Promise<string> {
    if (!this.options.apiKey) {
      throw new TranslationProviderError('configuration', 'Translation API key is missing');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.httpClient(
        `${normalizeBaseUrl(this.options.baseUrl)}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            model: this.options.model,
            temperature: 0,
            messages: [
            {
              role: 'system',
                content: buildSystemPrompt(context),
              },
              {
                role: 'user',
                content: text,
              },
            ],
          }),
          signal: controller.signal,
        },
      );

      if (response.status === 429) {
        throw new TranslationProviderError('rate_limited', 'Translation provider rate limit exceeded', {
          retryable: true,
          status: response.status,
        });
      }

      if (!response.ok) {
        throw new TranslationProviderError('http_error', `Translation provider HTTP ${response.status}`, {
          retryable: response.status >= 500,
          status: response.status,
        });
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };

      const translated = payload.choices?.[0]?.message?.content;
      if (typeof translated !== 'string' || translated.trim().length === 0) {
        throw new TranslationProviderError('invalid_response', 'Translation provider returned empty content');
      }

      return cleanTranslatedContent(translated);
    } catch (error: unknown) {
      if (error instanceof TranslationProviderError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new TranslationProviderError('timeout', 'Translation request timed out', {
          retryable: true,
        });
      }

      throw new TranslationProviderError('network', 'Translation request failed', {
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
