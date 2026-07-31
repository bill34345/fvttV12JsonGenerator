import {
  convertItemCollectionToJson as convertPackageItemCollectionToJson,
  convertMonsterCollectionToJson as convertPackageMonsterCollectionToJson,
} from '@fvtt-json-generator/workflows/collection-conversion';
import type {
  CollectionConversionOptions,
  CollectionConversionResult,
} from '@fvtt-json-generator/workflows/collection-conversion';
import { collectionIngestionAdapter } from '../ingest/collectionAdapter';
import { iconWorkflowAdapter } from '../icons/adapter';

export {
  writeTextArtifact,
} from '@fvtt-json-generator/workflows/collection-conversion';
export type {
  CollectionConversionDependencies,
  CollectionConversionOptions,
  CollectionConversionResult,
  CollectionItemResult,
  CollectionKind,
  CollectionOutputFile,
  CollectionStatus,
} from '@fvtt-json-generator/workflows/collection-conversion';

const dependencies = {
  ingestion: collectionIngestionAdapter,
  iconWorkflow: iconWorkflowAdapter,
};

export function convertMonsterCollectionToJson(
  options: CollectionConversionOptions,
): Promise<CollectionConversionResult> {
  return convertPackageMonsterCollectionToJson(options, dependencies);
}

export function convertItemCollectionToJson(
  options: CollectionConversionOptions,
): Promise<CollectionConversionResult> {
  return convertPackageItemCollectionToJson(options, dependencies);
}
