import { imageAssetProcessorAdapter } from '../assets/adapter';
import { createDefaultItemAiNormalizer } from '../ingest/itemAiNormalizerFactory';
import { iconWorkflowAdapter } from '../icons/adapter';
import {
  ObsidianSyncWorkflow as PackageObsidianSyncWorkflow,
  type ObsidianSyncOptions,
  type ObsidianSyncResult,
  type ObsidianTranslationService,
} from '@fvtt-json-generator/workflows/obsidian-sync';

export type {
  ObsidianSyncOptions,
  ObsidianSyncResult,
  ObsidianTranslationService,
} from '@fvtt-json-generator/workflows/obsidian-sync';

export class ObsidianSyncWorkflow extends PackageObsidianSyncWorkflow {
  constructor(options: {
    translationService?: ObsidianTranslationService | null;
    enableAiNormalize?: boolean;
  } = {}) {
    super({
      ...options,
      itemAiNormalizer: options.enableAiNormalize
        ? createDefaultItemAiNormalizer()
        : null,
      imageAssetProcessor: imageAssetProcessorAdapter,
      iconWorkflow: iconWorkflowAdapter,
    });
  }
}
