import {
  FileTranslationCache,
  OpenAICompatibleTranslator,
  TranslationService,
  createTranslationConfigFromEnv,
} from './index';
import type { WorkflowTranslationService } from '@fvtt-json-generator/workflows/json-translation-sync';

export function createDefaultWorkflowTranslationService():
  | WorkflowTranslationService
  | undefined {
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
