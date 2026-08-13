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
  convertCanonicalActorCollection as convertPackageCanonicalActorCollection,
  type CanonicalActorCollectionOptions,
  type CanonicalActorCollectionResult,
} from '@fvtt-json-generator/workflows/canonical-actor-collection';
import {
  detectAutomaticConversionRoute as detectPackageAutomaticConversionRoute,
  type AutomaticConversionDetection,
  type AutomaticConversionDetectionOptions,
} from '@fvtt-json-generator/workflows/conversion-routing';
import {
  resumeMonsterIntake as resumePackageMonsterIntake,
  runMonsterIntake as runPackageMonsterIntake,
} from '@fvtt-json-generator/intake-ai/orchestrator';
import {
  resumeItemIntake as resumePackageItemIntake,
  runItemIntake as runPackageItemIntake,
} from '@fvtt-json-generator/intake-ai/item-orchestrator';
import type {
  CollectionConversionOptions,
  CollectionConversionResult,
} from '@fvtt-json-generator/workflows/collection-conversion';
import type {
  MonsterIntakeAiProvider,
  MonsterIntakeOptions,
  MonsterIntakeRunResult,
} from '@fvtt-json-generator/intake-ai/types';
import type {
  ItemIntakeAiProvider,
  ItemIntakeOptions,
  ItemIntakeRunResult,
} from '@fvtt-json-generator/intake-ai/item-types';
export type {
  CanonicalActorSource,
  CanonicalActorSourceMetadata,
  CanonicalActorSourceStatus,
  CanonicalActorSourceWarning,
} from '@fvtt-json-generator/contracts/canonical-actor';
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
export type {
  CanonicalActorCollectionDependencies,
  CanonicalActorCollectionItemResult,
  CanonicalActorCollectionOptions,
  CanonicalActorCollectionOutputFile,
  CanonicalActorCollectionResult,
  CanonicalActorCollectionStatus,
  CanonicalActorMarkdownInput,
} from '@fvtt-json-generator/workflows/canonical-actor-collection';
export { canonicalSourcesFromMarkdown } from '@fvtt-json-generator/workflows/canonical-actor-collection';
export {
  writeTextArtifact,
} from '@fvtt-json-generator/workflows/collection-conversion';
export type {
  AutomaticContentCardinality,
  AutomaticContentKind,
  AutomaticConversionDetection,
  AutomaticConversionRoute,
  AutomaticDetectionConfidence,
} from '@fvtt-json-generator/workflows/conversion-routing';

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

/** @deprecated Compatibility facade for the pre-canonical plaintext Actor path. */
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

export function detectAutomaticConversionRoute(
  options: AutomaticConversionDetectionOptions,
): AutomaticConversionDetection {
  return detectPackageAutomaticConversionRoute(options, collectionIngestionAdapter);
}

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

export function convertCanonicalActorCollection(
  options: CanonicalActorCollectionOptions,
): Promise<CanonicalActorCollectionResult> {
  return convertPackageCanonicalActorCollection(options, {
    syncWorkflow: new ObsidianSyncWorkflow({ translationService: null }),
  });
}

const monsterIntakeDependencies = Object.freeze({
  convertMarkdownContentToJson: conversionApplication.convertContent,
});
const itemIntakeDependencies = Object.freeze({
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

export function runItemIntake(
  options: ItemIntakeOptions,
  provider?: ItemIntakeAiProvider,
): Promise<ItemIntakeRunResult> {
  return runPackageItemIntake(options, provider, itemIntakeDependencies);
}

export function resumeItemIntake(
  runPath: string,
  decisionsPath: string,
  provider: ItemIntakeAiProvider,
  vaultPath?: string,
): Promise<ItemIntakeRunResult> {
  return resumePackageItemIntake(runPath, decisionsPath, provider, vaultPath, itemIntakeDependencies);
}
