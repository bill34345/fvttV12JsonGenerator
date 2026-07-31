import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { ActorGeneratorOptions } from '../generator/actor';
import type { EffectProfile } from '../generator/effectProfileApplier';
import { ActorValidator } from '../generator/validator';
import { ItemParser } from '../parser/item-parser';
import { detectItemRoute } from '../parser/item-router';
import { ParserFactory } from '../parser/router';
import {
  buildActorVerificationSummaryFromValues,
  type ActorVerificationSummary,
} from '../verification/actorVerification';
import type { FvttTargetVersion } from '../foundryTarget';
import type {
  GenerationDiagnostic,
  GenerationVerification,
} from '../generation/types';
import type {
  ConversionStatus,
  GeneratedArtifactIdentity,
} from '../contracts/artifacts';
import { getFoundryTarget } from '../foundryTarget';
import { generateActorArtifact } from './generationPipeline';
import { generateItemArtifacts } from './itemGenerationWorkflow';
import type { IconReviewReport, IconWorkflowOptions } from '../icons/types';
import {
  iconReviewPathForOutput,
  mergeIconReviewReports,
  writeIconReviewReport,
} from '../icons/report';

export type { FvttTargetVersion } from '../foundryTarget';
export type { GeneratedDocumentKind } from '../contracts/artifacts';

export interface ConvertMarkdownContentOptions {
  content: string;
  sourcePath?: string;
  outputPath?: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  translationService?: ActorGeneratorOptions['translationService'];
  iconOptions?: IconWorkflowOptions;
  writeIconReviewReport?: boolean;
}

export interface ConvertMarkdownPathOptions {
  sourcePath: string;
  outputPath?: string;
  vaultPath?: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  translationService?: ActorGeneratorOptions['translationService'];
  iconOptions?: IconWorkflowOptions;
  writeIconReviewReport?: boolean;
}

export interface ConversionResult extends GeneratedArtifactIdentity {
  fvttVersion: FvttTargetVersion;
  effectProfile: EffectProfile;
  status: ConversionStatus;
  diagnostics: GenerationDiagnostic[];
  warnings: string[];
  verification: GenerationVerification;
  actorVerification: ActorVerificationSummary | null;
  rawJson: unknown;
  iconReview?: IconReviewReport | null;
  iconReviewPath?: string;
}

export const DEFAULT_VAULT_PATH = 'obsidian/dnd数据转fvttjson';

export async function convertMarkdownPathToOutput(
  options: ConvertMarkdownPathOptions,
): Promise<ConversionResult> {
  const sourcePath = resolvePath(options.sourcePath);
  const content = readFileSync(sourcePath, 'utf-8');
  const outputPath = resolvePath(
    options.outputPath ?? inferDefaultOutputPath(sourcePath, options.vaultPath ?? DEFAULT_VAULT_PATH),
  );

  return convertMarkdownContentToJson({
    content,
    sourcePath,
    outputPath,
    fvttVersion: options.fvttVersion,
    effectProfile: options.effectProfile,
    translationService: options.translationService,
    iconOptions: options.iconOptions,
    writeIconReviewReport: options.writeIconReviewReport,
  });
}

export async function convertMarkdownContentToJson(
  options: ConvertMarkdownContentOptions,
): Promise<ConversionResult> {
  const fvttVersion = options.fvttVersion ?? '12';
  const effectProfile = options.effectProfile ?? 'core';
  const sourcePath = options.sourcePath ? resolvePath(options.sourcePath) : undefined;

  if (detectItemRoute(options.content)) {
    const parser = new ItemParser();
    const parsed = parser.parse(options.content);
    const artifacts = await generateItemArtifacts(parsed, {
      fvttVersion,
      effectProfile,
      iconOptions: options.iconOptions,
    });
    const status = combineStatuses(artifacts.map((artifact) => artifact.verification.status));
    const diagnostics = artifacts.flatMap((artifact) => artifact.diagnostics);
    const verification: GenerationVerification = {
      status,
      diagnostics,
      target: getFoundryTarget(fvttVersion),
      mechanicsCoverage: artifacts.flatMap((artifact) => artifact.verification.mechanicsCoverage),
    };
    const requestedOutputPath = options.outputPath ? resolvePath(options.outputPath) : undefined;
    if (status === 'accepted') {
      writeItemArtifactsIfRequested(requestedOutputPath, artifacts);
    }
    const iconReview = mergeIconReviewReports(artifacts.map((artifact) => artifact.iconReview));
    const iconReviewPath = status === 'accepted'
      ? writeReviewIfRequested(requestedOutputPath, iconReview, options.writeIconReviewReport)
      : undefined;
    const rawJson = artifacts.length === 1 ? artifacts[0]!.item : artifacts.map((artifact) => artifact.item);

    return {
      kind: 'item',
      sourcePath,
      outputPath: status === 'accepted' ? requestedOutputPath : undefined,
      fvttVersion,
      effectProfile,
      name: String(artifacts[0]?.item.name ?? parsed.name),
      itemCount: 0,
      status,
      diagnostics,
      warnings: warningMessages(diagnostics),
      verification,
      actorVerification: null,
      rawJson,
      iconReview,
      ...(iconReviewPath ? { iconReviewPath } : {}),
    };
  }

  const parserFactory = new ParserFactory();
  const route = parserFactory.detectRoute(options.content);
  const parsed = parserFactory.parse(options.content);
  const generated = await generateActorArtifact({
    parsed,
    sourceText: options.content,
    sourcePath,
    route,
    fvttVersion,
    effectProfile,
    translationService: options.translationService,
    iconOptions: options.iconOptions,
  });
  const actor = generated.actor;
  const legacyWarnings = new ActorValidator().validate(parsed, actor);
  const legacyDiagnostics: GenerationDiagnostic[] = legacyWarnings.map((message, index) => ({
    code: 'GEN_LEGACY_VALIDATOR_WARNING',
    severity: 'warning',
    stage: 'semantic',
    path: `legacy-validator/${index}`,
    message,
  }));
  const diagnostics = [...generated.diagnostics, ...legacyDiagnostics];
  const status = generated.verification.status === 'failed'
    ? 'failed'
    : legacyDiagnostics.length > 0 || generated.verification.status === 'needs_review'
      ? 'needs_review'
      : 'accepted';
  const verification: GenerationVerification = {
    ...generated.verification,
    status,
    diagnostics,
  };
  const requestedOutputPath = options.outputPath ? resolvePath(options.outputPath) : undefined;
  const reviewableBehaviorOutput = status === 'needs_review'
    && isIntentionalBehaviorReviewOnly(diagnostics);
  if (status === 'accepted' || reviewableBehaviorOutput) {
    writeJsonIfRequested(requestedOutputPath, actor);
  }
  const iconReviewPath = status === 'accepted' || reviewableBehaviorOutput
    ? writeReviewIfRequested(requestedOutputPath, generated.iconReview, options.writeIconReviewReport)
    : undefined;
  const actorVerification = buildActorVerificationSummaryFromValues({
    source: options.content,
    actor,
    sourcePath: sourcePath ?? '<uploaded-markdown>',
    actorPath: requestedOutputPath ?? '<generated-preview>',
  });

  return {
    kind: 'actor',
    sourcePath,
    outputPath: status === 'accepted' || reviewableBehaviorOutput ? requestedOutputPath : undefined,
    fvttVersion,
    effectProfile,
    name: String(actor.name ?? ''),
    itemCount: Array.isArray(actor.items) ? actor.items.length : 0,
    status,
    diagnostics,
    warnings: warningMessages(diagnostics),
    verification,
    actorVerification,
    rawJson: actor,
    iconReview: generated.iconReview,
    ...(iconReviewPath ? { iconReviewPath } : {}),
  };
}

function isIntentionalBehaviorReviewOnly(diagnostics: GenerationDiagnostic[]): boolean {
  const reviewCodes = new Set([
    'GEN_GM_ASSISTANCE_REQUIRED',
    'GEN_EXTERNAL_RULE_REVIEW_REQUIRED',
  ]);
  return diagnostics.length > 0
    && diagnostics.every((diagnostic) =>
      diagnostic.severity === 'warning' && reviewCodes.has(diagnostic.code));
}

export function inferDefaultOutputPath(sourcePath: string, vaultPath: string): string {
  const resolvedSource = resolvePath(sourcePath);
  const resolvedVault = resolvePath(vaultPath);
  const inputDir = join(resolvedVault, 'input');
  const outputDir = join(resolvedVault, 'output');
  const relFromInput = relative(inputDir, resolvedSource);

  if (!relFromInput.startsWith('..') && !isAbsolute(relFromInput)) {
    return join(outputDir, relFromInput.replace(/\.md$/i, '.json'));
  }

  return join(resolvePath('temp/web/path-output'), basename(resolvedSource).replace(/\.md$/i, '.json'));
}

function writeJsonIfRequested(outputPath: string | undefined, value: unknown): void {
  if (!outputPath) return;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(value, null, 2));
}

function writeItemArtifactsIfRequested(
  outputPath: string | undefined,
  artifacts: Awaited<ReturnType<typeof generateItemArtifacts>>,
): void {
  if (!outputPath) return;
  if (artifacts.length === 1) {
    writeJsonIfRequested(outputPath, artifacts[0]!.item);
    return;
  }
  mkdirSync(outputPath, { recursive: true });
  for (const artifact of artifacts) {
    writeJsonIfRequested(join(outputPath, artifact.fileName), artifact.item);
  }
}

function writeReviewIfRequested(
  outputPath: string | undefined,
  report: IconReviewReport | null,
  enabled: boolean | undefined,
): string | undefined {
  if (!outputPath || !report || enabled === false) return undefined;
  const reportPath = iconReviewPathForOutput(outputPath);
  writeIconReviewReport(reportPath, report);
  return reportPath;
}

function combineStatuses(
  statuses: Array<GenerationVerification['status']>,
): GenerationVerification['status'] {
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('needs_review')) return 'needs_review';
  return 'accepted';
}

function warningMessages(diagnostics: GenerationDiagnostic[]): string[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === 'warning')
    .map((diagnostic) => `[${diagnostic.code}] ${diagnostic.path}: ${diagnostic.message}`);
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export function assertPathExists(path: string): void {
  if (!existsSync(resolvePath(path))) {
    throw new Error(`Path does not exist: ${path}`);
  }
}
