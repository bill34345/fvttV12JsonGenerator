import { iconWorkflowAdapter } from '@fvtt-json-generator/assets-icons/icon-adapter';
import {
  expandParsedItemStages,
  generateItemArtifacts as generatePackageItemArtifacts,
  type ItemGenerationArtifact,
  type ItemGenerationWorkflowOptions,
} from '@fvtt-json-generator/workflows/item-generation';
import type { ParsedItem } from '@fvtt-json-generator/models/item';

export {
  expandParsedItemStages,
  type ItemGenerationArtifact,
  type ItemGenerationWorkflowOptions,
} from '@fvtt-json-generator/workflows/item-generation';

export function generateItemArtifacts(
  parsed: ParsedItem,
  options: ItemGenerationWorkflowOptions,
): Promise<ItemGenerationArtifact[]> {
  return generatePackageItemArtifacts(parsed, {
    ...options,
    iconWorkflow: options.iconWorkflow ?? iconWorkflowAdapter,
  });
}
