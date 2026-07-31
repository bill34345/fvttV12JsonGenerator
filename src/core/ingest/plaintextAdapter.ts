import {
  PlainTextIngestionWorkflow as PackagePlainTextIngestionWorkflow,
  PromptedIngestNormalizer,
  type PlainTextAiNormalizer,
} from '@fvtt-json-generator/ingest-plaintext/plaintext';
import {
  OpenAICompatibleTranslator,
  createTranslationConfigFromEnv,
} from '../translation';

export {
  normalizeBlock,
  parseCreatureBlock,
  parseYamlNormalizedBlock,
  splitCollection,
} from '@fvtt-json-generator/ingest-plaintext/plaintext';
export type {
  IngestedCreatureFile,
  PlainTextAiNormalizer,
  PlainTextIngestionOptions,
  PlainTextIngestionResult,
} from '@fvtt-json-generator/ingest-plaintext/plaintext';

export interface OpenAICompatibleIngestNormalizerOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

/**
 * Repository adapter that binds the plaintext package prompt protocol to the
 * existing translation client without making the package depend on src/core.
 */
export class OpenAICompatibleIngestNormalizer extends PromptedIngestNormalizer {
  constructor(options: OpenAICompatibleIngestNormalizerOptions) {
    super({
      ...options,
      translationFactory: (clientOptions) => new OpenAICompatibleTranslator(clientOptions),
    });
  }
}

/**
 * Application-facing workflow that preserves the historical environment-based
 * default while the package remains deterministic and adapter-free by default.
 */
export class PlainTextIngestionWorkflow extends PackagePlainTextIngestionWorkflow {
  constructor(options: { aiNormalizer?: PlainTextAiNormalizer | null } = {}) {
    super({
      aiNormalizer: options.aiNormalizer === undefined
        ? createDefaultPlainTextNormalizer()
        : options.aiNormalizer,
    });
  }
}

function createDefaultPlainTextNormalizer(): PlainTextAiNormalizer | undefined {
  const config = createTranslationConfigFromEnv();
  if (!config.apiKey) return undefined;
  return new OpenAICompatibleIngestNormalizer(config);
}
