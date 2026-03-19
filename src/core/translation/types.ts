export interface TranslationContext {
  sourceLanguage?: string;
  targetLanguage?: string;
  namespace?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface Translator {
  translate(text: string, context?: TranslationContext): Promise<string>;
}

export interface TranslationCache {
  get(key: string): string | undefined;
  set(key: string, translated: string): void;
}

export interface TranslationWarning {
  code: 'timeout' | 'rate_limited' | 'http_error' | 'invalid_response' | 'network' | 'configuration' | 'unknown';
  message: string;
  retryable: boolean;
  provider: string;
  model: string;
}

export interface TranslationResult {
  text: string;
  sourceText: string;
  cached: boolean;
  warnings: TranslationWarning[];
}

export interface TranslationLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface HttpRequest {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type HttpClient = (url: string, init: HttpRequest) => Promise<HttpResponse>;

export type TranslationProviderErrorCode =
  | 'timeout'
  | 'rate_limited'
  | 'http_error'
  | 'invalid_response'
  | 'network'
  | 'configuration';

export class TranslationProviderError extends Error {
  public readonly code: TranslationProviderErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;

  constructor(
    code: TranslationProviderErrorCode,
    message: string,
    options?: { retryable?: boolean; status?: number },
  ) {
    super(message);
    this.name = 'TranslationProviderError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.status = options?.status;
  }
}
