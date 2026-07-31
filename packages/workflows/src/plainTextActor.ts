import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { type EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import { ObsidianSyncWorkflow, type ObsidianSyncResult } from './obsidianSync';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type {
  ImageAssetOptions,
  PlainTextIngestionPort,
  PlainTextIngestionResultPort,
} from './externalPorts';
import type { IconWorkflowOptions } from './iconPort';

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
  markdown: PlainTextIngestionResultPort;
  sync: ObsidianSyncResult;
}

export class PlainTextActorWorkflow {
  constructor(private readonly dependencies: {
    ingestion: PlainTextIngestionPort;
    syncWorkflow: ObsidianSyncWorkflow;
  }) {}

  public async ingestActors(options: PlainTextActorWorkflowOptions): Promise<PlainTextActorWorkflowResult> {
    const sourcePath = this.resolvePath(options.sourcePath);
    const vaultPath = this.resolvePath(options.vaultPath);
    const effectProfile = options.effectProfile ?? 'modded-v12';
    const emitDir = join(vaultPath, 'input');

    const markdown = await this.dependencies.ingestion.ingest({
      sourcePath,
      emitDir,
      dryRun: Boolean(options.dryRun),
      enableAiNormalize: Boolean(options.enableAiNormalize),
    });

    const promotedInputPaths = Boolean(options.dryRun)
      ? []
      : this.promoteMiddleFilesToInput(markdown, emitDir);

    const sync = Boolean(options.dryRun)
      ? this.createDryRunSyncResult(vaultPath)
      : await this.dependencies.syncWorkflow.sync({
          vaultPath,
          fvttVersion: options.fvttVersion ?? '12',
          effectProfile,
          iconOptions: options.iconOptions,
          imageAssets: options.imageAssets,
          excludeInputPaths: this.isSourceInsideEmitDir(sourcePath, emitDir) ? [sourcePath] : [],
          forceInputPaths: promotedInputPaths,
        });

    return {
      sourcePath,
      vaultPath,
      effectProfile,
      markdown,
      sync,
    };
  }

  private createDryRunSyncResult(vaultPath: string): ObsidianSyncResult {
    return {
      inputDir: join(vaultPath, 'input'),
      examplesDir: join(vaultPath, 'examples'),
      outputDir: join(vaultPath, 'output'),
      backupDir: join(vaultPath, 'output_backup'),
      manifestPath: join(vaultPath, '.fvtt-sync-manifest.json'),
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
    };
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(process.cwd(), path);
  }

  private promoteMiddleFilesToInput(
    markdown: PlainTextIngestionResultPort,
    inputDir: string,
  ): string[] {
    const promotedPaths: string[] = [];
    for (const file of markdown.files) {
      const source = join(markdown.emitDir, file.fileName);
      const target = join(inputDir, file.fileName);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      promotedPaths.push(target);
    }
    return promotedPaths;
  }

  private isSourceInsideEmitDir(sourcePath: string, emitDir: string): boolean {
    const normalizedSource = sourcePath.replace(/\\/g, '/').toLowerCase();
    const normalizedEmitDir = emitDir.replace(/\\/g, '/').toLowerCase();
    return normalizedSource.startsWith(`${normalizedEmitDir}/`);
  }
}
