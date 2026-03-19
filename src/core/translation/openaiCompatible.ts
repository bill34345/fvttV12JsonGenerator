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
      const sourceLanguage = context.sourceLanguage ?? 'en';
      const targetLanguage = context.targetLanguage ?? 'zh-CN';
      const namespace = context.namespace ? `\nDomain: ${context.namespace}` : '';

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
                content: `Translate text from ${sourceLanguage} to ${targetLanguage}. Return only translated text.${namespace}`,
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

      return translated.trim();
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
