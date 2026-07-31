import { createTranslationConfigFromEnv } from '../translation/config';
import { ItemAiNormalizer } from './item-ai-normalizer';
import type { ItemAiNormalizerPort } from '@fvtt-json-generator/workflows/external-ports';

export function createDefaultItemAiNormalizer(): ItemAiNormalizerPort | null {
  const config = createTranslationConfigFromEnv();
  if (!config.apiKey) {
    return null;
  }
  return new ItemAiNormalizer({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
  });
}
