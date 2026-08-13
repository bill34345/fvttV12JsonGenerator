import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type {
  CanonicalActorSource,
  CanonicalActorSourceWarning,
} from '@fvtt-json-generator/contracts/canonical-actor';
import type { EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import {
  ObsidianSyncWorkflow,
  type ObsidianSyncResult,
} from './obsidianSync';
import type { ImageAssetOptions } from './externalPorts';
import type { IconWorkflowOptions } from './iconPort';

export type CanonicalActorCollectionStatus =
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'needs_review'
  | 'dry_run';

export interface CanonicalActorCollectionOptions {
  sources: CanonicalActorSource[];
  vaultPath: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  imageAssets?: ImageAssetOptions;
  iconOptions?: IconWorkflowOptions;
  dryRun?: boolean;
  failOnWarning?: boolean;
}

export interface CanonicalActorCollectionDependencies {
  syncWorkflow: ObsidianSyncWorkflow;
}

export interface CanonicalActorMarkdownInput {
  sourceId: string;
  sourceUrl?: string;
  fileName: string;
  markdown: string;
  auditMarkdown?: string;
  imageUrls?: string[];
}

export function canonicalSourcesFromMarkdown(
  inputs: CanonicalActorMarkdownInput[],
): CanonicalActorSource[] {
  return inputs.map((input) => ({
    sourceId: input.sourceId,
    sourceUrl: input.sourceUrl ?? input.sourceId,
    fileName: input.fileName,
    markdown: input.markdown,
    ...(input.auditMarkdown ? { auditMarkdown: input.auditMarkdown } : {}),
    imageUrls: input.imageUrls ?? [],
    status: 'ok',
    warnings: [],
  }));
}

export interface CanonicalActorCollectionOutputFile {
  id: string;
  fileName: string;
  path: string;
  contentType: string;
  label: string;
}

export interface CanonicalActorCollectionItemResult {
  index: number;
  sourceId: string;
  source: CanonicalActorSource;
  status: 'accepted' | 'needs_review' | 'failed' | 'skipped' | 'dry_run';
  outputFile?: CanonicalActorCollectionOutputFile;
  warnings: CanonicalActorSourceWarning[];
  error?: string;
}

export interface CanonicalActorCollectionResult {
  kind: 'canonical-actor-collection';
  status: CanonicalActorCollectionStatus;
  vaultPath: string;
  outputDir: string;
  fvttVersion: FvttTargetVersion;
  effectProfile: EffectProfile;
  itemCount: number;
  succeeded: number;
  failed: number;
  warnings: CanonicalActorSourceWarning[];
  failures: Array<{ index: number; sourceId: string; error: string }>;
  items: CanonicalActorCollectionItemResult[];
  outputFiles: CanonicalActorCollectionOutputFile[];
  sync?: ObsidianSyncResult;
}

export async function convertCanonicalActorCollection(
  options: CanonicalActorCollectionOptions,
  dependencies: CanonicalActorCollectionDependencies,
): Promise<CanonicalActorCollectionResult> {
  const fvttVersion = options.fvttVersion ?? '14';
  const effectProfile = options.effectProfile ?? (fvttVersion === '14' ? 'core' : 'modded-v12');
  const vaultPath = resolvePath(options.vaultPath);
  const outputDir = join(vaultPath, 'output');
  const warnings = options.sources.flatMap((source) => source.warnings);
  const blockingSources = options.sources.filter((source) => source.status !== 'ok');
  const shouldFailOnWarning = options.failOnWarning ?? true;

  if (options.dryRun) {
    return buildResult({
      sources: options.sources,
      vaultPath,
      outputDir,
      fvttVersion,
      effectProfile,
      warnings,
      items: options.sources.map((source, index) => ({
        index,
        sourceId: source.sourceId,
        source,
        status: source.status === 'ok' ? 'dry_run' : source.status === 'failed' ? 'failed' : 'needs_review',
        warnings: source.warnings,
        ...(source.status === 'failed' ? { error: 'Canonical source failed before formal generation.' } : {}),
      })),
      status: 'dry_run',
      outputFiles: [],
    });
  }

  if (options.sources.length === 0) {
    return buildResult({
      sources: options.sources,
      vaultPath,
      outputDir,
      fvttVersion,
      effectProfile,
      warnings,
      items: [],
      status: 'failed',
      outputFiles: [],
      failures: [{ index: -1, sourceId: '', error: 'No canonical Actor sources were provided.' }],
    });
  }

  if (shouldFailOnWarning && blockingSources.length > 0) {
    return buildResult({
      sources: options.sources,
      vaultPath,
      outputDir,
      fvttVersion,
      effectProfile,
      warnings,
      items: options.sources.map((source, index) => ({
        index,
        sourceId: source.sourceId,
        source,
        status: source.status === 'ok' ? 'skipped' : source.status === 'failed' ? 'failed' : 'needs_review',
        warnings: source.warnings,
        ...(source.status === 'failed' ? { error: 'Canonical source failed before formal generation.' } : {}),
      })),
      status: 'needs_review',
      outputFiles: [],
      failures: options.sources
        .map((source, index) => source.status === 'failed'
          ? { index, sourceId: source.sourceId, error: 'Canonical source failed before formal generation.' }
          : undefined)
        .filter((failure): failure is { index: number; sourceId: string; error: string } => Boolean(failure)),
    });
  }

  const inputDir = join(vaultPath, 'input');
  mkdirSync(inputDir, { recursive: true });
  const eligibleSources = options.sources.filter((source) => source.status === 'ok');
  const inputPaths = eligibleSources.map((source) => {
    const inputPath = join(inputDir, source.fileName);
    writeFileSync(inputPath, source.markdown, 'utf-8');
    return inputPath;
  });

  const sync = await dependencies.syncWorkflow.sync({
    vaultPath,
    includeInputPaths: inputPaths,
    forceInputPaths: inputPaths,
    fvttVersion,
    effectProfile,
    imageAssets: options.imageAssets,
    iconOptions: options.iconOptions,
  });
  const syncWarnings = sync.warnings.map((warning) => ({
    code: `image-${warning.stage}`,
    message: warning.message,
  }));
  const outputFiles: CanonicalActorCollectionOutputFile[] = [];
  const provenancePath = join(outputDir, 'canonical-sources.json');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    provenancePath,
    JSON.stringify(
      {
        kind: 'canonical-actor-source-manifest',
        generatedAt: new Date().toISOString(),
        fvttVersion,
        effectProfile,
        sources: options.sources.map((source) => ({
          sourceId: source.sourceId,
          sourceUrl: source.sourceUrl,
          fileName: source.fileName,
          imageUrls: source.imageUrls,
          status: source.status,
          warnings: source.warnings,
          metadata: source.metadata,
        })),
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
  outputFiles.push({
    id: 'canonical-sources.json',
    fileName: 'canonical-sources.json',
    path: provenancePath,
    contentType: 'application/json; charset=utf-8',
    label: 'Canonical source manifest',
  });
  const items: CanonicalActorCollectionItemResult[] = options.sources.map((source, index) => {
    if (source.status !== 'ok') {
      return {
        index,
        sourceId: source.sourceId,
        source,
        status: source.status === 'failed' ? 'failed' as const : source.status === 'skipped' ? 'skipped' as const : 'needs_review' as const,
        warnings: source.warnings,
        ...(source.status === 'failed' ? { error: 'Canonical source failed before formal generation.' } : {}),
      };
    }

    const failure = findSyncFailure(sync, source.fileName);
    if (failure) {
      return {
        index,
        sourceId: source.sourceId,
        source,
        status: 'failed' as const,
        warnings: source.warnings,
        error: failure.error,
      };
    }

    const outputFile = outputFileFor(outputDir, source.fileName, source.metadata?.title ?? source.fileName);
    outputFiles.push(outputFile);
    return {
      index,
      sourceId: source.sourceId,
      source,
      status: syncWarnings.length > 0 ? 'needs_review' as const : 'accepted' as const,
      outputFile,
      warnings: syncWarnings.length > 0 ? [...source.warnings, ...syncWarnings] : source.warnings,
    };
  });

  const status: CanonicalActorCollectionStatus = sync.failed > 0
    ? items.some((item) => item.status === 'accepted' || item.status === 'needs_review') ? 'partial' : 'failed'
    : syncWarnings.length > 0
      ? 'needs_review'
      : items.some((item) => item.status === 'accepted') ? 'succeeded' : 'needs_review';

  return buildResult({
    sources: options.sources,
    vaultPath,
    outputDir,
    fvttVersion,
    effectProfile,
    warnings: [...warnings, ...syncWarnings],
    items,
    status,
    outputFiles,
    sync,
    failures: items
      .filter((item) => item.status === 'failed')
      .map((item) => ({ index: item.index, sourceId: item.sourceId, error: item.error ?? 'Formal generation failed.' })),
  });
}

function buildResult(input: {
  sources: CanonicalActorSource[];
  vaultPath: string;
  outputDir: string;
  fvttVersion: FvttTargetVersion;
  effectProfile: EffectProfile;
  warnings: CanonicalActorSourceWarning[];
  items: CanonicalActorCollectionItemResult[];
  status: CanonicalActorCollectionStatus;
  outputFiles: CanonicalActorCollectionOutputFile[];
  failures?: Array<{ index: number; sourceId: string; error: string }>;
  sync?: ObsidianSyncResult;
}): CanonicalActorCollectionResult {
  return {
    kind: 'canonical-actor-collection',
    status: input.status,
    vaultPath: input.vaultPath,
    outputDir: input.outputDir,
    fvttVersion: input.fvttVersion,
    effectProfile: input.effectProfile,
    itemCount: input.sources.length,
    succeeded: input.items.filter((item) => item.status === 'accepted').length,
    failed: input.items.filter((item) => item.status === 'failed').length,
    warnings: input.warnings,
    failures: input.failures ?? [],
    items: input.items,
    outputFiles: input.outputFiles,
    sync: input.sync,
  };
}

function findSyncFailure(sync: ObsidianSyncResult, fileName: string): { error: string } | undefined {
  return sync.failures.find((failure) => {
    const normalized = failure.input.replace(/\\/g, '/');
    return normalized === fileName || normalized.endsWith(`/${fileName}`);
  });
}

function outputFileFor(outputDir: string, sourceFileName: string, label: string): CanonicalActorCollectionOutputFile {
  const fileName = sourceFileName.replace(/\.md$/i, '.json');
  return {
    id: fileName,
    fileName,
    path: join(outputDir, fileName),
    contentType: 'application/json; charset=utf-8',
    label,
  };
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}
