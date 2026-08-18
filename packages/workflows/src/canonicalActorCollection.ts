import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
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

export interface CanonicalActorCollectionPromotion {
  /** Whether this run placed the verified staged files into the formal vault. */
  status: 'promoted' | 'not-promoted';
  /** A human-readable explanation when no formal file was written. */
  reason?: string;
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
  promotion: CanonicalActorCollectionPromotion;
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
      promotion: { status: 'not-promoted', reason: 'Dry run: no formal files were written.' },
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
      promotion: { status: 'not-promoted', reason: 'No canonical Actor sources were provided.' },
      failures: [{ index: -1, sourceId: '', error: 'No canonical Actor sources were provided.' }],
    });
  }

  const sourceProblems = validateSources(options.sources);
  const blockedBySourceState = options.sources.some((source) => source.status !== 'ok');
  const blockedByWarning = shouldFailOnWarning && warnings.length > 0;

  if (sourceProblems.length > 0 || blockedBySourceState || blockedByWarning) {
    return buildResult({
      sources: options.sources,
      vaultPath,
      outputDir,
      fvttVersion,
      effectProfile,
      warnings,
      items: buildPreflightItems(options.sources, sourceProblems, shouldFailOnWarning),
      status: sourceProblems.length > 0 ? 'failed' : 'needs_review',
      outputFiles: [],
      promotion: {
        status: 'not-promoted',
        reason: sourceProblems.length > 0
          ? 'A canonical source is incomplete or unsafe, so no formal files were written.'
          : blockedByWarning
            ? 'A source has warnings. Review them before promoting formal files.'
            : 'A canonical source needs review or failed before formal generation.',
      },
      failures: preflightFailures(options.sources, sourceProblems),
    });
  }

  if (options.imageAssets?.mode === 'ssh') {
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
        status: 'skipped',
        warnings: source.warnings,
      })),
      status: 'failed',
      outputFiles: [],
      promotion: {
        status: 'not-promoted',
        reason: 'Remote image publishing cannot be rolled back as one safe Actor promotion.',
      },
      failures: [{
        index: -1,
        sourceId: '',
        error: 'Canonical Actor promotion does not support imageAssets.mode="ssh" because remote writes cannot be staged and rolled back safely.',
      }],
    });
  }

  const temporaryRoot = mkdtempSync(join(tmpdir(), 'fvtt-canonical-actor-'));
  const stagingVaultPath = join(temporaryRoot, 'vault');
  const stagingInputDir = join(stagingVaultPath, 'input');
  const stagingOutputDir = join(stagingVaultPath, 'output');
  const provenanceFileName = canonicalProvenanceFileName(options.sources);

  try {
    const inputPaths = writeStagedSources(stagingInputDir, options.sources);
    const sync = await dependencies.syncWorkflow.sync({
      vaultPath: stagingVaultPath,
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
    writeProvenanceManifest(
      join(stagingOutputDir, provenanceFileName),
      options.sources,
      fvttVersion,
      effectProfile,
    );
    const stagedOutputPaths = collectFiles(stagingOutputDir);
    const items = buildStagedItems(
      options.sources,
      sync,
      syncWarnings,
      stagingOutputDir,
      outputDir,
    );
    const failures = items
      .filter((item) => item.status === 'failed')
      .map((item) => ({ index: item.index, sourceId: item.sourceId, error: item.error ?? 'Formal generation failed.' }));
    const allWarnings = [...warnings, ...syncWarnings];

    if (failures.length > 0) {
      return buildResult({
        sources: options.sources,
        vaultPath,
        outputDir,
        fvttVersion,
        effectProfile,
        warnings: allWarnings,
        items: removeUnpromotedOutputReferences(items),
        status: 'failed',
        outputFiles: [],
        promotion: {
          status: 'not-promoted',
          reason: 'Formal generation failed in the temporary area, so no formal files were written.',
        },
        sync,
        failures,
      });
    }

    if (shouldFailOnWarning && syncWarnings.length > 0) {
      return buildResult({
        sources: options.sources,
        vaultPath,
        outputDir,
        fvttVersion,
        effectProfile,
        warnings: allWarnings,
        items: removeUnpromotedOutputReferences(items),
        status: 'needs_review',
        outputFiles: [],
        promotion: {
          status: 'not-promoted',
          reason: 'Formal generation produced warnings. Review them before promoting formal files.',
        },
        sync,
      });
    }

    const promotionPlan = createPromotionPlan({
      sources: options.sources,
      stagingInputDir,
      stagingOutputDir,
      stagedOutputPaths,
      vaultPath,
    });
    const collisions = findPromotionCollisions(promotionPlan);
    if (collisions.length > 0) {
      return buildResult({
        sources: options.sources,
        vaultPath,
        outputDir,
        fvttVersion,
        effectProfile,
        warnings: allWarnings,
        items: markItemsBlockedByPromotion(items, collisions),
        status: 'failed',
        outputFiles: [],
        promotion: {
          status: 'not-promoted',
          reason: 'A formal target already exists or two staged files would share a target. Nothing was overwritten.',
        },
        sync,
        failures: collisions.map((collision) => ({
          index: collision.sourceIndex ?? -1,
          sourceId: collision.sourceId ?? '',
          error: collision.error,
        })),
      });
    }

    try {
      promoteFiles(promotionPlan);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return buildResult({
        sources: options.sources,
        vaultPath,
        outputDir,
        fvttVersion,
        effectProfile,
        warnings: allWarnings,
        items: removeUnpromotedOutputReferences(items).map((item) => item.status === 'accepted'
          ? { ...item, status: 'failed' as const, error: message }
          : item),
        status: 'failed',
        outputFiles: [],
        promotion: {
          status: 'not-promoted',
          reason: 'Promoting the staged files failed. Newly created formal files were removed.',
        },
        sync,
        failures: [{ index: -1, sourceId: '', error: message }],
      });
    }

    const outputFiles = buildOutputFiles(
      outputDir,
      stagingOutputDir,
      stagedOutputPaths,
      options.sources,
      provenanceFileName,
    );
    return buildResult({
      sources: options.sources,
      vaultPath,
      outputDir,
      fvttVersion,
      effectProfile,
      warnings: allWarnings,
      items,
      status: allWarnings.length > 0 ? 'needs_review' : 'succeeded',
      outputFiles,
      promotion: { status: 'promoted' },
      sync,
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true });
  }
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
  promotion: CanonicalActorCollectionPromotion;
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
    promotion: input.promotion,
    sync: input.sync,
  };
}

interface SourceProblem {
  index: number;
  sourceId: string;
  error: string;
}

interface PromotionPlanFile {
  stagedPath: string;
  targetPath: string;
  relativePath: string;
  kind: 'input' | 'output';
  sourceIndex?: number;
  sourceId?: string;
}

interface PromotionCollision {
  error: string;
  sourceIndex?: number;
  sourceId?: string;
}

function validateSources(sources: CanonicalActorSource[]): SourceProblem[] {
  const problems: SourceProblem[] = [];
  const seenFileNames = new Map<string, number>();

  for (const [index, source] of sources.entries()) {
    const sourceId = source.sourceId?.trim() || `<source-${index + 1}>`;
    if (!source.sourceId?.trim()) {
      problems.push({ index, sourceId, error: 'Canonical source is missing sourceId.' });
    }
    if (!source.sourceUrl?.trim()) {
      problems.push({ index, sourceId, error: 'Canonical source is missing sourceUrl.' });
    }
    if (!isSafeStandardActorFileName(source.fileName)) {
      problems.push({
        index,
        sourceId,
        error: `Canonical source fileName must be a safe relative .md path: ${source.fileName || '<empty>'}`,
      });
    }
    if (!source.markdown?.trimStart().startsWith('---')) {
      problems.push({
        index,
        sourceId,
        error: 'Canonical source markdown must be a standard frontmatter-based Actor input.',
      });
    }
    if (!Array.isArray(source.imageUrls)) {
      problems.push({ index, sourceId, error: 'Canonical source imageUrls must be an array, even when it is empty.' });
    }

    const fileNameKey = normalizePathKey(source.fileName || `<empty-${index}>`);
    const previousIndex = seenFileNames.get(fileNameKey);
    if (previousIndex !== undefined) {
      problems.push({
        index,
        sourceId,
        error: `Canonical source fileName duplicates source ${previousIndex + 1}: ${source.fileName}`,
      });
    } else {
      seenFileNames.set(fileNameKey, index);
    }
  }

  return problems;
}

function buildPreflightItems(
  sources: CanonicalActorSource[],
  problems: SourceProblem[],
  failOnWarning: boolean,
): CanonicalActorCollectionItemResult[] {
  const problemByIndex = new Map<number, SourceProblem>();
  for (const problem of problems) {
    if (!problemByIndex.has(problem.index)) problemByIndex.set(problem.index, problem);
  }

  return sources.map((source, index) => {
    const problem = problemByIndex.get(index);
    if (problem) {
      return {
        index,
        sourceId: source.sourceId,
        source,
        status: 'failed',
        warnings: source.warnings,
        error: problem.error,
      };
    }
    if (source.status === 'failed') {
      return {
        index,
        sourceId: source.sourceId,
        source,
        status: 'failed',
        warnings: source.warnings,
        error: 'Canonical source failed before formal generation.',
      };
    }
    if (source.status === 'skipped') {
      return { index, sourceId: source.sourceId, source, status: 'skipped', warnings: source.warnings };
    }
    if (source.status !== 'ok' || (failOnWarning && source.warnings.length > 0)) {
      return { index, sourceId: source.sourceId, source, status: 'needs_review', warnings: source.warnings };
    }
    return { index, sourceId: source.sourceId, source, status: 'skipped', warnings: source.warnings };
  });
}

function preflightFailures(
  sources: CanonicalActorSource[],
  problems: SourceProblem[],
): Array<{ index: number; sourceId: string; error: string }> {
  const failures = [...problems];
  for (const [index, source] of sources.entries()) {
    if (source.status !== 'failed' || problems.some((problem) => problem.index === index)) continue;
    failures.push({ index, sourceId: source.sourceId, error: 'Canonical source failed before formal generation.' });
  }
  return failures;
}

function writeStagedSources(stagingInputDir: string, sources: CanonicalActorSource[]): string[] {
  mkdirSync(stagingInputDir, { recursive: true });
  return sources.map((source) => {
    const inputPath = safeJoin(stagingInputDir, source.fileName);
    mkdirSync(dirname(inputPath), { recursive: true });
    writeFileSync(inputPath, source.markdown, 'utf-8');
    return inputPath;
  });
}

function canonicalProvenanceFileName(sources: CanonicalActorSource[]): string {
  const stableSourceIdentity = sources.map((source) => ({
    sourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
    fileName: source.fileName,
  }));
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(stableSourceIdentity), 'utf-8')
    .digest('hex')
    .slice(0, 16);
  return `canonical-sources-${fingerprint}.json`;
}

function writeProvenanceManifest(
  provenancePath: string,
  sources: CanonicalActorSource[],
  fvttVersion: FvttTargetVersion,
  effectProfile: EffectProfile,
): void {
  mkdirSync(dirname(provenancePath), { recursive: true });
  writeFileSync(
    provenancePath,
    JSON.stringify(
      {
        kind: 'canonical-actor-source-manifest',
        inputKind: 'standard-actor-markdown',
        outputKind: 'foundry-actor-json',
        generatedAt: new Date().toISOString(),
        fvttVersion,
        effectProfile,
        sources: sources.map((source) => ({
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
}

function buildStagedItems(
  sources: CanonicalActorSource[],
  sync: ObsidianSyncResult,
  syncWarnings: CanonicalActorSourceWarning[],
  stagingOutputDir: string,
  outputDir: string,
): CanonicalActorCollectionItemResult[] {
  return sources.map((source, index) => {
    const failure = findSyncFailure(sync, source.fileName);
    if (failure) {
      return {
        index,
        sourceId: source.sourceId,
        source,
        status: 'failed',
        warnings: source.warnings,
        error: failure.error,
      };
    }

    const outputRelativePath = actorOutputRelativePath(source.fileName);
    const stagedOutputPath = safeJoin(stagingOutputDir, outputRelativePath);
    if (!existsSync(stagedOutputPath)) {
      return {
        index,
        sourceId: source.sourceId,
        source,
        status: 'failed',
        warnings: source.warnings,
        error: 'Formal generation completed without the expected Actor JSON output.',
      };
    }

    const itemWarnings = [...source.warnings, ...syncWarnings];
    return {
      index,
      sourceId: source.sourceId,
      source,
      status: itemWarnings.length > 0 ? 'needs_review' : 'accepted',
      outputFile: outputFileForRelative(
        outputDir,
        outputRelativePath,
        source.metadata?.title ?? source.fileName,
      ),
      warnings: itemWarnings,
    };
  });
}

function removeUnpromotedOutputReferences(
  items: CanonicalActorCollectionItemResult[],
): CanonicalActorCollectionItemResult[] {
  return items.map(({ outputFile: _outputFile, ...item }) => item);
}

function collectFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function createPromotionPlan(input: {
  sources: CanonicalActorSource[];
  stagingInputDir: string;
  stagingOutputDir: string;
  stagedOutputPaths: string[];
  vaultPath: string;
}): PromotionPlanFile[] {
  const inputDir = join(input.vaultPath, 'input');
  const outputDir = join(input.vaultPath, 'output');
  const inputFiles = input.sources.map((source, sourceIndex) => ({
    stagedPath: safeJoin(input.stagingInputDir, source.fileName),
    targetPath: safeJoin(inputDir, source.fileName),
    relativePath: normalizeRelativePath(source.fileName),
    kind: 'input' as const,
    sourceIndex,
    sourceId: source.sourceId,
  }));
  const outputFiles = input.stagedOutputPaths.map((stagedPath) => {
    const relativePath = normalizeRelativePath(relative(input.stagingOutputDir, stagedPath));
    const matchingSourceIndex = input.sources.findIndex(
      (source) => normalizePathKey(actorOutputRelativePath(source.fileName)) === normalizePathKey(relativePath),
    );
    return {
      stagedPath,
      targetPath: safeJoin(outputDir, relativePath),
      relativePath,
      kind: 'output' as const,
      ...(matchingSourceIndex >= 0
        ? { sourceIndex: matchingSourceIndex, sourceId: input.sources[matchingSourceIndex]!.sourceId }
        : {}),
    };
  });
  return [...inputFiles, ...outputFiles];
}

function findPromotionCollisions(plan: PromotionPlanFile[]): PromotionCollision[] {
  const collisions: PromotionCollision[] = [];
  const firstByTarget = new Map<string, PromotionPlanFile>();

  for (const file of plan) {
    const targetKey = normalizePathKey(file.targetPath);
    const previous = firstByTarget.get(targetKey);
    if (previous) {
      collisions.push({
        sourceIndex: previous.sourceIndex,
        sourceId: previous.sourceId,
        error: `Two staged files would use the same formal target: ${file.targetPath}`,
      });
      collisions.push({
        sourceIndex: file.sourceIndex,
        sourceId: file.sourceId,
        error: `Two staged files would use the same formal target: ${file.targetPath}`,
      });
      continue;
    }
    firstByTarget.set(targetKey, file);
    if (existsSync(file.targetPath)) {
      collisions.push({
        sourceIndex: file.sourceIndex,
        sourceId: file.sourceId,
        error: `Formal target already exists and will not be overwritten: ${file.targetPath}`,
      });
    }
  }

  return collisions;
}

function markItemsBlockedByPromotion(
  items: CanonicalActorCollectionItemResult[],
  collisions: PromotionCollision[],
): CanonicalActorCollectionItemResult[] {
  const blockedByIndex = new Map<number, string>();
  for (const collision of collisions) {
    if (collision.sourceIndex !== undefined && !blockedByIndex.has(collision.sourceIndex)) {
      blockedByIndex.set(collision.sourceIndex, collision.error);
    }
  }
  const globalFailure = collisions.some((collision) => collision.sourceIndex === undefined);
  const globalError = collisions.find((collision) => collision.sourceIndex === undefined)?.error;

  return removeUnpromotedOutputReferences(items).map((item) => {
    const error = globalFailure ? globalError : blockedByIndex.get(item.index);
    if (error) return { ...item, status: 'failed', error };
    return item.status === 'failed' ? item : { ...item, status: 'skipped' };
  });
}

function promoteFiles(plan: PromotionPlanFile[]): void {
  const createdFiles: string[] = [];
  try {
    for (const file of plan) {
      mkdirSync(dirname(file.targetPath), { recursive: true });
      copyFileSync(file.stagedPath, file.targetPath, constants.COPYFILE_EXCL);
      createdFiles.push(file.targetPath);
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const targetPath of [...createdFiles].reverse()) {
      try {
        rmSync(targetPath);
      } catch (rollbackError) {
        rollbackErrors.push(`${targetPath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    if (rollbackErrors.length > 0) {
      throw new Error(`Formal promotion failed: ${message}. Cleanup also failed: ${rollbackErrors.join('; ')}`);
    }
    throw new Error(`Formal promotion failed: ${message}. Newly created formal files were removed.`);
  }
}

function buildOutputFiles(
  outputDir: string,
  stagingOutputDir: string,
  stagedOutputPaths: string[],
  sources: CanonicalActorSource[],
  provenanceFileName: string,
): CanonicalActorCollectionOutputFile[] {
  const sourceByOutput = new Map(
    sources.map((source) => [
      normalizePathKey(actorOutputRelativePath(source.fileName)),
      source.metadata?.title ?? source.fileName,
    ]),
  );
  return stagedOutputPaths.map((stagedPath) => {
    const relativePath = normalizeRelativePath(relative(stagingOutputDir, stagedPath));
    const sourceLabel = sourceByOutput.get(normalizePathKey(relativePath));
    const label = relativePath === provenanceFileName
      ? 'Canonical source provenance'
      : sourceLabel ?? `Generated support file: ${relativePath}`;
    return outputFileForRelative(outputDir, relativePath, label);
  });
}

function findSyncFailure(sync: ObsidianSyncResult, fileName: string): { error: string } | undefined {
  return sync.failures.find((failure) => {
    const normalized = failure.input.replace(/\\/g, '/');
    return normalized === fileName || normalized.endsWith(`/${fileName}`);
  });
}

function outputFileForRelative(outputDir: string, relativePath: string, label: string): CanonicalActorCollectionOutputFile {
  return {
    id: relativePath,
    fileName: relativePath,
    path: safeJoin(outputDir, relativePath),
    contentType: relativePath.toLowerCase().endsWith('.json')
      ? 'application/json; charset=utf-8'
      : 'application/octet-stream',
    label,
  };
}

function actorOutputRelativePath(sourceFileName: string): string {
  return normalizeRelativePath(sourceFileName).replace(/\.md$/i, '.json');
}

function isSafeStandardActorFileName(fileName: string): boolean {
  const normalized = normalizeRelativePath(fileName);
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || !normalized.toLowerCase().endsWith('.md')) {
    return false;
  }
  return normalized.split('/').every((segment) =>
    Boolean(segment)
    && segment !== '.'
    && segment !== '..'
    && !/[<>:"|?*\u0000-\u001F]/.test(segment),
  );
}

function safeJoin(root: string, relativePath: string): string {
  const targetPath = resolve(root, relativePath);
  const targetRelative = relative(root, targetPath);
  if (!targetRelative || targetRelative === '..' || targetRelative.startsWith('../') || targetRelative.startsWith('..\\') || isAbsolute(targetRelative)) {
    throw new Error(`Refusing to use a path outside the intended directory: ${relativePath}`);
  }
  return targetPath;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizePathKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}
