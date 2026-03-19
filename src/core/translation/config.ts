import { join } from 'node:path';

export interface TranslationConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  cacheFilePath: string;
  timeoutMs: number;
}

function parseTimeout(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function createTranslationConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): TranslationConfig {
  return {
    apiKey: env.TRANSLATION_API_KEY ?? env.OPENAI_API_KEY ?? '',
    baseUrl: env.TRANSLATION_BASE_URL ?? env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: env.TRANSLATION_MODEL ?? env.OPENAI_MODEL ?? 'gpt-4o-mini',
    cacheFilePath: env.TRANSLATION_CACHE_FILE ?? join(cwd, '.cache', 'translation-cache.json'),
    timeoutMs: parseTimeout(env.TRANSLATION_TIMEOUT_MS, 15000),
  };
}
