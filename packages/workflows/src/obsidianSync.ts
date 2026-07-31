import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import { ItemParser } from '@fvtt-json-generator/parser/item-parser';
import { detectItemRoute } from '@fvtt-json-generator/parser/item-router';
import { ParserFactory } from '@fvtt-json-generator/parser/router';
import type { TranslationContext } from '@fvtt-json-generator/generation/ports';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import {
  type ImageAssetOptions,
  type ImageAssetProcessorPort,
  type ImageAssetWarning,
  type ItemAiNormalizerPort,
} from './externalPorts';
import { generateActorArtifact } from './generationPipeline';
import { generateItemArtifacts } from './itemGenerationWorkflow';
import {
  disabledIconWorkflowPort,
  type IconReviewReport,
  type IconWorkflowOptions,
  type IconWorkflowPort,
} from './iconPort';

export interface ObsidianSyncOptions {
  vaultPath: string;
  clearBackup?: boolean;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  excludeInputPaths?: string[];
  includeInputPaths?: string[];
  forceInputPaths?: string[];
  imageAssets?: ImageAssetOptions;
  iconOptions?: IconWorkflowOptions;
}

export interface ObsidianTranslationService {
  translate(text: string, context?: TranslationContext): Promise<{ text: string } | string>;
}

interface ManifestEntry {
  hash: string;
  output: string;
  outputs?: string[];
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  status: 'success' | 'failed' | 'stale';
  lastSuccessAt?: string;
  lastAttemptAt: string;
  lastError?: string;
}

type Manifest = Record<string, ManifestEntry>;

export interface ObsidianSyncResult {
  inputDir: string;
  examplesDir: string;
  outputDir: string;
  backupDir: string;
  manifestPath: string;
  processed: number;
  skipped: number;
  failed: number;
  backedUp: number;
  createdExample: boolean;
  clearedBackup: boolean;
  failures: Array<{ input: string; error: string }>;
  warnings: ImageAssetWarning[];
  aiNormalizeRequested: boolean;
  aiNormalizeEnabled: boolean;
  actorTranslationEnabled: boolean;
}

export class ObsidianSyncWorkflow {
  private parserFactory = new ParserFactory();
  private itemParser = new ItemParser();
  private itemAiNormalizer: ItemAiNormalizerPort | null = null;

  constructor(
    private readonly options: {
      translationService?: ObsidianTranslationService | null;
      enableAiNormalize?: boolean;
      itemAiNormalizer?: ItemAiNormalizerPort | null;
      imageAssetProcessor?: ImageAssetProcessorPort;
      iconWorkflow?: IconWorkflowPort;
    } = {},
  ) {
    if (options.enableAiNormalize) {
      this.itemAiNormalizer = options.itemAiNormalizer ?? null;
    }
  }

  public async sync(options: ObsidianSyncOptions): Promise<ObsidianSyncResult> {
    const fvttVersion = options.fvttVersion ?? '12';
    const effectProfile = options.effectProfile ?? 'core';
    const iconWorkflow = this.options.iconWorkflow ?? disabledIconWorkflowPort;
    const iconFingerprint = iconWorkflow.fingerprint(options.iconOptions);
    const vaultDir = this.resolvePath(options.vaultPath);
    const inputDir = join(vaultDir, 'input');
    const examplesDir = join(vaultDir, 'examples');
    const outputDir = join(vaultDir, 'output');
    const backupDir = join(vaultDir, 'output_backup');
    const manifestPath = join(vaultDir, '.fvtt-sync-manifest.json');

    this.ensureDir(vaultDir);
    this.ensureDir(inputDir);
    this.ensureDir(examplesDir);
    this.ensureDir(outputDir);
    this.ensureDir(backupDir);

    const result: ObsidianSyncResult = {
      inputDir,
      examplesDir,
      outputDir,
      backupDir,
      manifestPath,
      processed: 0,
      skipped: 0,
      failed: 0,
      backedUp: 0,
      createdExample: false,
      clearedBackup: false,
      failures: [],
      warnings: [],
      aiNormalizeRequested: Boolean(this.options.enableAiNormalize),
      aiNormalizeEnabled: Boolean(this.itemAiNormalizer),
      actorTranslationEnabled: Boolean(this.options.translationService),
    };

    if (options.clearBackup) {
      rmSync(backupDir, { recursive: true, force: true });
      this.ensureDir(backupDir);
      result.clearedBackup = true;
    }

    result.createdExample = this.ensureExampleFile(examplesDir);

    const manifest = this.loadManifest(manifestPath);
    const collectedMarkdownFiles = this.collectMarkdownFiles(inputDir, options.excludeInputPaths ?? []);
    const includedInputs = options.includeInputPaths
      ? new Set(options.includeInputPaths.map((path) => this.normalizeForComparison(this.resolvePath(path))))
      : null;
    const markdownFiles = includedInputs
      ? collectedMarkdownFiles.filter((path) => includedInputs.has(this.normalizeForComparison(path)))
      : collectedMarkdownFiles;
    const forcedInputs = new Set(
      (options.forceInputPaths ?? []).map((path) => this.normalizeForComparison(this.resolvePath(path))),
    );
    const seen = new Set<string>();

    for (const inputPath of markdownFiles) {
      const relInput = this.normalizeRelPath(relative(inputDir, inputPath));
      seen.add(relInput);
      const outputRel = relInput.replace(/\.md$/i, '.json');
      const outputPath = join(outputDir, outputRel);

      try {
        const content = readFileSync(inputPath, 'utf-8');
        if (!this.isProjectMarkdown(content)) {
          delete manifest[relInput];
          result.skipped++;
          continue;
        }
        const hash = this.hashContent(
          `${content}\n#fvttVersion=${fvttVersion}\n#effectProfile=${effectProfile}\n#icon=${iconFingerprint}`,
        );
        const prev = manifest[relInput];
        const forceProcess = forcedInputs.has(this.normalizeForComparison(inputPath));

        const previousOutputsExist = prev?.outputs?.length
          ? prev.outputs.every((path) => existsSync(isAbsolute(path) ? path : resolve(vaultDir, path)))
          : existsSync(outputPath);
        if (!forceProcess && prev?.status === 'success' && prev.hash === hash && previousOutputsExist) {
          result.skipped++;
          continue;
        }

        const isItem = detectItemRoute(content);
        let outputArtifacts: Array<{ path: string; data: unknown }> = [];

        if (isItem) {
          let normalizedBody: string | undefined;
          if (this.itemAiNormalizer) {
            const bodyMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
            const bodyText = bodyMatch?.[1] ?? '';
            normalizedBody = await this.itemAiNormalizer.normalizeItem(bodyText);
          }
          const parsedItem = this.itemParser.parse(content, normalizedBody);
          const artifacts = await generateItemArtifacts(parsedItem, {
            fvttVersion,
            effectProfile,
            iconOptions: options.iconOptions,
            iconWorkflow,
          });
          const rejected = artifacts.find((artifact) => artifact.verification.status !== 'accepted');
          if (rejected) {
            throw new Error(
              `${rejected.verification.status}: ${rejected.diagnostics
                .map((entry) => `[${entry.code}] ${entry.path}: ${entry.message}`)
                .join('; ')}`,
            );
          }
          if (artifacts.length === 1) {
            outputArtifacts = [{ path: outputPath, data: artifacts[0]!.item }];
          } else {
            const stageOutputDir = outputPath.replace(/\.json$/i, '');
            outputArtifacts = artifacts.map((artifact) => ({
              path: join(stageOutputDir, artifact.fileName),
              data: artifact.item,
            }));
          }
          const itemIconReview = iconWorkflow.mergeReviewReports(
            artifacts.map((artifact) => artifact.iconReview),
          );
          if (itemIconReview) {
            outputArtifacts.push({
              path: outputPath.toLowerCase().endsWith('.json')
                ? outputPath.replace(/\.json$/iu, '.icon-review.json')
                : join(outputPath, 'icon-review.json'),
              data: itemIconReview,
            });
          }
        } else {
          const route = this.parserFactory.detectRoute(content);
          const parsed = this.parserFactory.parse(content);
          if (options.imageAssets?.mode === 'ssh') {
            if (!this.options.imageAssetProcessor) {
              throw new Error('Image asset processor adapter is required for ssh mode.');
            }
            const imageResult = await this.options.imageAssetProcessor.process(
              parsed,
              options.imageAssets,
              {
              slug: this.slugFromInput(relInput),
              displayName: parsed.name || relInput,
              localRoot: options.imageAssets.localRoot ?? join(outputDir, 'assets', 'goddessfantasy'),
              },
            );
            result.warnings.push(...imageResult.warnings);
            if (parsed.img) {
              if (imageResult.actorUrl) {
                parsed.img = imageResult.actorUrl;
              } else {
                delete parsed.img;
              }
              if (imageResult.tokenUrl) {
                parsed.tokenImg = imageResult.tokenUrl;
              } else {
                delete parsed.tokenImg;
              }
            }
          }
          const generated = await generateActorArtifact({
            parsed,
            sourceText: content,
            sourcePath: inputPath,
            route,
            fvttVersion,
            effectProfile,
            translationService: this.options.translationService,
            iconOptions: options.iconOptions,
            iconWorkflow,
          });
          if (generated.verification.status !== 'accepted') {
            throw new Error(
              `${generated.verification.status}: ${generated.diagnostics
                .map((entry) => `[${entry.code}] ${entry.path}: ${entry.message}`)
                .join('; ')}`,
            );
          }
          outputArtifacts = [{ path: outputPath, data: generated.actor }];
          if (generated.iconReview) {
            outputArtifacts.push({
              path: outputPath.replace(/\.json$/iu, '.icon-review.json'),
              data: generated.iconReview,
            });
          }
        }

        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        for (const artifact of outputArtifacts) {
          if (existsSync(artifact.path)) {
            this.backupOutputArtifact(artifact.path, outputDir, backupDir, ts);
            result.backedUp++;
          }
          this.ensureDir(dirname(artifact.path));
          writeFileSync(artifact.path, JSON.stringify(artifact.data, null, 2));
        }
        const currentArtifactPaths = new Set(
          outputArtifacts.map((artifact) => this.normalizeForComparison(artifact.path)),
        );
        for (const previousOutput of prev?.outputs ?? []) {
          const previousPath = isAbsolute(previousOutput)
            ? previousOutput
            : resolve(vaultDir, previousOutput);
          if (
            existsSync(previousPath)
            && !currentArtifactPaths.has(this.normalizeForComparison(previousPath))
            && this.isWithinOutput(previousPath, outputDir)
          ) {
            this.backupOutputArtifact(previousPath, outputDir, backupDir, ts);
            result.backedUp++;
          }
        }

        manifest[relInput] = {
          hash,
          output: this.normalizeRelPath(relative(vaultDir, outputArtifacts[0]?.path ?? outputPath)),
          outputs: outputArtifacts.map((artifact) =>
            this.normalizeRelPath(relative(vaultDir, artifact.path))),
          fvttVersion,
          effectProfile,
          status: 'success',
          lastSuccessAt: new Date().toISOString(),
          lastAttemptAt: new Date().toISOString(),
        };
        result.processed++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        manifest[relInput] = {
          hash: '',
          output: this.normalizeRelPath(relative(vaultDir, outputPath)),
          fvttVersion,
          effectProfile,
          status: 'failed',
          lastAttemptAt: new Date().toISOString(),
          lastError: message,
        };
        result.failed++;
        result.failures.push({ input: relInput, error: message });
      }
    }

    if (!includedInputs) {
      for (const [key, entry] of Object.entries(manifest)) {
        if (seen.has(key)) continue;
        const staleOutputs = entry.outputs?.length ? entry.outputs : [entry.output];
        for (const staleOutput of staleOutputs) {
          const staleOutputPath = isAbsolute(staleOutput)
            ? staleOutput
            : resolve(vaultDir, staleOutput);
          if (existsSync(staleOutputPath)) {
            rmSync(staleOutputPath, { force: true });
          }
        }
        manifest[key] = {
          ...entry,
          status: 'stale',
          lastAttemptAt: new Date().toISOString(),
          lastError: 'source markdown removed',
        };
      }
    }

    this.saveManifest(manifestPath, manifest);
    const iconReview = iconWorkflow.mergeReviewReports(
      Object.values(manifest)
        .filter((entry) => entry.status === 'success')
        .flatMap((entry) => entry.outputs ?? [])
        .filter((path) => path.endsWith('.icon-review.json'))
        .map((path) => isAbsolute(path) ? path : resolve(vaultDir, path))
        .filter((path) => existsSync(path))
        .map((path) => JSON.parse(readFileSync(path, 'utf-8')) as IconReviewReport),
    );
    const aggregateIconReviewPath = join(outputDir, 'icon-review.json');
    if (iconReview) {
      iconWorkflow.writeReviewReport(aggregateIconReviewPath, iconReview);
    } else if (existsSync(aggregateIconReviewPath)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      this.backupOutputArtifact(aggregateIconReviewPath, outputDir, backupDir, ts);
      result.backedUp++;
    }
    return result;
  }

  private ensureExampleFile(examplesDir: string): boolean {
    const target = join(examplesDir, 'npc-example.md');
    if (existsSync(target)) return false;

    const source = fileURLToPath(new URL('../../../templates/npc-example.md', import.meta.url));
    if (existsSync(source)) {
      writeFileSync(target, readFileSync(source, 'utf-8'));
    } else {
      writeFileSync(
        target,
        ['---', '名称: 示例NPC', '类型: npc', '---', '# 说明', '请按模板填写字段。', ''].join('\n'),
      );
    }
    return true;
  }

  private loadManifest(manifestPath: string): Manifest {
    if (!existsSync(manifestPath)) return {};

    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as Manifest;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private saveManifest(manifestPath: string, manifest: Manifest): void {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private collectMarkdownFiles(dir: string, excludeInputPaths: string[]): string[] {
    if (!existsSync(dir)) return [];

    const excluded = new Set(
      excludeInputPaths.map((path) => this.normalizeForComparison(this.resolvePath(path))),
    );
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...this.collectMarkdownFiles(full, excludeInputPaths));
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;

      if (statSync(full).size === 0) continue;
      if (excluded.has(this.normalizeForComparison(full))) continue;
      files.push(full);
    }

    return files.sort();
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  private isProjectMarkdown(content: string): boolean {
    return content.trimStart().startsWith('---');
  }

  private ensureDir(path: string): void {
    mkdirSync(path, { recursive: true });
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(process.cwd(), path);
  }

  private normalizeRelPath(path: string): string {
    return path.replace(/\\/g, '/');
  }

  private normalizeForComparison(path: string): string {
    return resolve(path).replace(/\\/g, '/').toLowerCase();
  }

  private isWithinOutput(path: string, outputDir: string): boolean {
    const rel = relative(outputDir, path);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  }

  private backupOutputArtifact(
    artifactPath: string,
    outputDir: string,
    backupDir: string,
    timestamp: string,
  ): void {
    const relArtifact = relative(outputDir, artifactPath);
    if (relArtifact.startsWith('..') || isAbsolute(relArtifact)) {
      throw new Error(`Refusing to back up an artifact outside the output directory: ${artifactPath}`);
    }
    const backupRel = relArtifact.replace(/\.json$/i, `.${timestamp}.json`);
    const backupPath = join(backupDir, backupRel);
    this.ensureDir(dirname(backupPath));
    renameSync(artifactPath, backupPath);
  }

  private slugFromInput(relInput: string): string {
    const stem = relInput.replace(/\.md$/i, '').split(/[\\/]/).pop() ?? 'actor';
    return stem.split('__')[0] || stem;
  }
}
