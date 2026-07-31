import type { EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type { IconWorkflowOptions } from '@fvtt-json-generator/assets-icons/icon-types';
import {
  ItemsIngestionWorkflow,
  type ItemIngestionResult,
} from '../ingest/items';
import {
  ItemTextWorkflow as PackageItemTextWorkflow,
  type ItemTextWorkflowResult as PackageItemTextWorkflowResult,
} from '@fvtt-json-generator/workflows/item-text';
import { ObsidianSyncWorkflow, type ObsidianSyncResult } from './obsidianSync';

export interface ItemTextWorkflowOptions {
  sourcePath: string;
  vaultPath: string;
  dryRun?: boolean;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  iconOptions?: IconWorkflowOptions;
}

export interface ItemTextWorkflowResult {
  ingestion: ItemIngestionResult;
  sync: ObsidianSyncResult;
  promotedInputPaths: string[];
}

export class ItemTextWorkflow {
  private readonly implementation = new PackageItemTextWorkflow({
    ingestion: new ItemsIngestionWorkflow(),
    syncWorkflow: new ObsidianSyncWorkflow(),
  });

  public async run(
    options: ItemTextWorkflowOptions,
  ): Promise<ItemTextWorkflowResult> {
    return this.implementation.run(options) as Promise<
      PackageItemTextWorkflowResult & ItemTextWorkflowResult
    >;
  }
}
