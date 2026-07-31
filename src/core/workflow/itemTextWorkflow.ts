import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type { EffectProfile } from "../generator/effectProfileApplier";
import type { IconWorkflowOptions } from "../icons/types";
import { ItemsIngestionWorkflow, type ItemIngestionResult } from "../ingest/items";
import { ObsidianSyncWorkflow, type ObsidianSyncResult } from "./obsidianSync";

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
  private ingestion = new ItemsIngestionWorkflow();
  private syncWorkflow = new ObsidianSyncWorkflow();

  async run(options: ItemTextWorkflowOptions): Promise<ItemTextWorkflowResult> {
    const middleDir = join(options.vaultPath, "middle", "items");
    const inputDir = join(options.vaultPath, "input", "items");

    const ingestion = await this.ingestion.ingest({
      sourcePath: options.sourcePath,
      emitDir: middleDir,
      dryRun: options.dryRun,
    });

    const promotedInputPaths: string[] = [];

    if (!options.dryRun) {
      mkdirSync(inputDir, { recursive: true });
      for (const file of ingestion.files) {
        const middlePath = join(middleDir, file.fileName);
        const inputPath = join(inputDir, file.fileName);
        copyFileSync(middlePath, inputPath);
        promotedInputPaths.push(inputPath);
      }
    }

    const sync = options.dryRun
      ? {
          inputDir,
          examplesDir: join(options.vaultPath, "examples"),
          outputDir: join(options.vaultPath, "output"),
          backupDir: join(options.vaultPath, "output_backup"),
          manifestPath: join(options.vaultPath, ".fvtt-sync-manifest.json"),
          processed: 0,
          skipped: 0,
          failed: 0,
          backedUp: 0,
          createdExample: false,
          clearedBackup: false,
          failures: [],
          warnings: [],
          aiNormalizeRequested: false,
          aiNormalizeEnabled: false,
          actorTranslationEnabled: false,
        }
      : await this.syncWorkflow.sync({
          vaultPath: options.vaultPath,
          fvttVersion: options.fvttVersion ?? "12",
          effectProfile: options.effectProfile ?? "core",
          iconOptions: options.iconOptions,
          includeInputPaths: promotedInputPaths,
          forceInputPaths: promotedInputPaths,
        });

    return { ingestion, sync, promotedInputPaths };
  }
}
