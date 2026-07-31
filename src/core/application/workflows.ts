/**
 * Public application use-case surface and composition root.
 *
 * Delivery layers depend on this module. Package workflows receive concrete
 * adapters here; the legacy src/core/workflow paths remain compatibility-only.
 */
import {
  JsonTranslationSyncWorkflow as PackageJsonTranslationSyncWorkflow,
  type WorkflowTranslationService,
} from '@fvtt-json-generator/workflows/json-translation-sync';
import {
  ObsidianSyncWorkflow as PackageObsidianSyncWorkflow,
  type ObsidianTranslationService,
} from '@fvtt-json-generator/workflows/obsidian-sync';
import {
  PlainTextActorWorkflow as PackagePlainTextActorWorkflow,
} from '@fvtt-json-generator/workflows/plain-text-actor';
import {
  ItemTextWorkflow as PackageItemTextWorkflow,
} from '@fvtt-json-generator/workflows/item-text';
import {
  convertItemCollectionToJson as convertPackageItemCollectionToJson,
  convertMonsterCollectionToJson as convertPackageMonsterCollectionToJson,
} from '@fvtt-json-generator/workflows/collection-conversion';
import {
  resumeMonsterIntake as resumePackageMonsterIntake,
  runMonsterIntake as runPackageMonsterIntake,
} from '@fvtt-json-generator/intake-ai/orchestrator';
import type {
  CollectionConversionOptions,
  CollectionConversionResult,
} from '@fvtt-json-generator/workflows/collection-conversion';
import type {
  MonsterIntakeAiProvider,
  MonsterIntakeOptions,
  MonsterIntakeRunResult,
} from '@fvtt-json-generator/intake-ai/types';
import { conversionApplication } from './conversion';
import { imageAssetProcessorAdapter } from '@fvtt-json-generator/assets-icons/image-adapter';
import { collectionIngestionAdapter } from '../ingest/collectionAdapter';
import { createDefaultItemAiNormalizer } from '../ingest/itemAiNormalizerFactory';
import { ItemsIngestionWorkflow } from '../ingest/items';
import { PlainTextIngestionWorkflow } from '../ingest/plaintextAdapter';
import { iconWorkflowAdapter } from '@fvtt-json-generator/assets-icons/icon-adapter';
import { createDefaultWorkflowTranslationService } from '../translation/defaultService';

export type {
  JsonTranslationSyncOptions,
  JsonTranslationSyncResult,
  WorkflowTranslationService,
} from '@fvtt-json-generator/workflows/json-translation-sync';
export type {
  ObsidianSyncOptions,
  ObsidianSyncResult,
  ObsidianTranslationService,
} from '@fvtt-json-generator/workflows/obsidian-sync';
export type {
  PlainTextActorWorkflowOptions,
  PlainTextActorWorkflowResult,
} from '@fvtt-json-generator/workflows/plain-text-actor';
export type {
  ItemTextWorkflowOptions,
  ItemTextWorkflowResult,
} from '@fvtt-json-generator/workflows/item-text';
export type {
  CollectionConversionOptions,
  CollectionConversionResult,
  CollectionItemResult,
  CollectionKind,
  CollectionOutputFile,
  CollectionStatus,
} from '@fvtt-json-generator/workflows/collection-conversion';
export {
  writeTextArtifact,
} from '@fvtt-json-generator/workflows/collection-conversion';

export class JsonTranslationSyncWorkflow extends PackageJsonTranslationSyncWorkflow {
  constructor(options: { translationService?: WorkflowTranslationService | null } = {}) {
    super({
      translationService: options.translationService === undefined
        ? createDefaultWorkflowTranslationService()
        : options.translationService,
    });
  }
}

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

export class PlainTextActorWorkflow extends PackagePlainTextActorWorkflow {
  constructor() {
    super({
      ingestion: new PlainTextIngestionWorkflow(),
      syncWorkflow: new ObsidianSyncWorkflow({ translationService: null }),
    });
  }
}

export class ItemTextWorkflow extends PackageItemTextWorkflow {
  constructor() {
    super({
      ingestion: new ItemsIngestionWorkflow(),
      syncWorkflow: new ObsidianSyncWorkflow(),
    });
  }
}

const collectionDependencies = {
  ingestion: collectionIngestionAdapter,
  iconWorkflow: iconWorkflowAdapter,
};

export function convertMonsterCollectionToJson(
  options: CollectionConversionOptions,
): Promise<CollectionConversionResult> {
  return convertPackageMonsterCollectionToJson(options, collectionDependencies);
}

export function convertItemCollectionToJson(
  options: CollectionConversionOptions,
): Promise<CollectionConversionResult> {
  return convertPackageItemCollectionToJson(options, collectionDependencies);
}

const monsterIntakeDependencies = Object.freeze({
  convertMarkdownContentToJson: conversionApplication.convertContent,
});

export function runMonsterIntake(
  options: MonsterIntakeOptions,
  provider?: MonsterIntakeAiProvider,
): Promise<MonsterIntakeRunResult> {
  return runPackageMonsterIntake(options, provider, monsterIntakeDependencies);
}

export function resumeMonsterIntake(
  runPath: string,
  decisionsPath: string,
  provider: MonsterIntakeAiProvider,
  vaultPath?: string,
): Promise<MonsterIntakeRunResult> {
  return resumePackageMonsterIntake(
    runPath,
    decisionsPath,
    provider,
    vaultPath,
    monsterIntakeDependencies,
  );
}
