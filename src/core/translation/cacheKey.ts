import { createHash } from 'node:crypto';
import type { TranslationContext } from './types';

interface CacheKeyInput {
  text: string;
  context: TranslationContext;
  providerName: string;
  model: string;
  baseUrl: string;
}

function sortMetadata(metadata?: TranslationContext['metadata']) {
  if (!metadata) return undefined;

  const entries = Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function buildTranslationCacheKey(input: CacheKeyInput): string {
  const payload = {
    version: 1,
    text: input.text,
    sourceLanguage: input.context.sourceLanguage ?? 'en',
    targetLanguage: input.context.targetLanguage ?? 'zh-CN',
    namespace: input.context.namespace ?? '',
    metadata: sortMetadata(input.context.metadata),
    providerName: input.providerName,
    model: input.model,
    baseUrl: normalizeBaseUrl(input.baseUrl),
  };

  return createHash('sha256').update(JSON.stringify(payload), 'utf-8').digest('hex');
}
