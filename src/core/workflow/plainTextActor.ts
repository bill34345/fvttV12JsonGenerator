import type { ImageAssetOptions } from '../assets/imageAssets';
import {
  PlainTextIngestionWorkflow,
  type PlainTextIngestionResult,
} from '../ingest/plaintextAdapter';
import type { EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type { IconWorkflowOptions } from '../icons/types';
import {
  PlainTextActorWorkflow as PackagePlainTextActorWorkflow,
  type PlainTextActorWorkflowResult as PackagePlainTextActorWorkflowResult,
} from '@fvtt-json-generator/workflows/plain-text-actor';
import { ObsidianSyncWorkflow, type ObsidianSyncResult } from './obsidianSync';

export interface PlainTextActorWorkflowOptions {
  sourcePath: string;
  vaultPath: string;
  dryRun?: boolean;
  enableAiNormalize?: boolean;
  effectProfile?: EffectProfile;
  fvttVersion?: FvttTargetVersion;
  imageAssets?: ImageAssetOptions;
  iconOptions?: IconWorkflowOptions;
}

export interface PlainTextActorWorkflowResult {
  sourcePath: string;
  vaultPath: string;
  effectProfile: EffectProfile;
  markdown: PlainTextIngestionResult;
  sync: ObsidianSyncResult;
}

export class PlainTextActorWorkflow {
  private readonly implementation = new PackagePlainTextActorWorkflow({
    ingestion: new PlainTextIngestionWorkflow(),
    syncWorkflow: new ObsidianSyncWorkflow({ translationService: null }),
  });

  public async ingestActors(
    options: PlainTextActorWorkflowOptions,
  ): Promise<PlainTextActorWorkflowResult> {
    return this.implementation.ingestActors(options) as Promise<
      PackagePlainTextActorWorkflowResult & PlainTextActorWorkflowResult
    >;
  }
}
