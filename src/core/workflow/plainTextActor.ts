import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { PlainTextIngestionWorkflow, type PlainTextIngestionResult } from '../ingest/plaintext';
import { type EffectProfile } from '../generator/effectProfileApplier';
import { ObsidianSyncWorkflow, type ObsidianSyncResult } from './obsidianSync';

export interface PlainTextActorWorkflowOptions {
  sourcePath: string;
  vaultPath: string;
  dryRun?: boolean;
  enableAiNormalize?: boolean;
  effectProfile?: EffectProfile;
  fvttVersion?: '12' | '13';
}

export interface PlainTextActorWorkflowResult {
  sourcePath: string;
  vaultPath: string;
  effectProfile: EffectProfile;
  markdown: PlainTextIngestionResult;
  sync: ObsidianSyncResult;
}

export class PlainTextActorWorkflow {
  public async ingestActors(options: PlainTextActorWorkflowOptions): Promise<PlainTextActorWorkflowResult> {
    const sourcePath = this.resolvePath(options.sourcePath);
    const vaultPath = this.resolvePath(options.vaultPath);
    const effectProfile = options.effectProfile ?? 'modded-v12';
    const emitDir = join(vaultPath, 'input');

    const markdown = await new PlainTextIngestionWorkflow().ingest({
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
      : await new ObsidianSyncWorkflow({ translationService: null }).sync({
          vaultPath,
          fvttVersion: options.fvttVersion ?? '12',
          effectProfile,
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
    };
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(process.cwd(), path);
  }

  private promoteMiddleFilesToInput(markdown: PlainTextIngestionResult, inputDir: string): string[] {
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
