import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { ActorGeneratorOptions } from '@fvtt-json-generator/generation/actor';
import type { EffectProfile } from '@fvtt-json-generator/generation/effect-profile';
import { ActorValidator } from '@fvtt-json-generator/generation/validator';
import { ItemParser } from '@fvtt-json-generator/parser/item-parser';
import { detectItemRoute } from '@fvtt-json-generator/parser/item-router';
import { ParserFactory } from '@fvtt-json-generator/parser/router';
import {
  buildActorVerificationSummaryFromValues,
  type ActorVerificationSummary,
} from './actorVerification';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
import type {
  GenerationDiagnostic,
  GenerationVerification,
} from '@fvtt-json-generator/generation/types';
import type {
  ConversionStatus,
  GeneratedArtifactIdentity,
} from '@fvtt-json-generator/contracts/artifacts';
import { getFoundryTarget } from '@fvtt-json-generator/generation/target';
import {
  disabledIconWorkflowPort,
  type IconReviewReport,
  type IconWorkflowOptions,
  type IconWorkflowPort,
} from './iconPort';
import { generateActorArtifact } from './generationPipeline';
import { generateItemArtifacts } from './itemGenerationWorkflow';

export type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
export type { GeneratedDocumentKind } from '@fvtt-json-generator/contracts/artifacts';

export interface ConvertMarkdownContentOptions {
  content: string;
  sourcePath?: string;
  outputPath?: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  translationService?: ActorGeneratorOptions['translationService'];
  iconOptions?: IconWorkflowOptions;
  writeIconReviewReport?: boolean;
  iconWorkflow?: IconWorkflowPort;
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
  iconWorkflow?: IconWorkflowPort;
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
    iconWorkflow: options.iconWorkflow,
  });
}

export async function convertMarkdownContentToJson(
  options: ConvertMarkdownContentOptions,
): Promise<ConversionResult> {
  const fvttVersion = options.fvttVersion ?? '12';
  const effectProfile = options.effectProfile ?? 'core';
  const sourcePath = options.sourcePath ? resolvePath(options.sourcePath) : undefined;
  const iconWorkflow = options.iconWorkflow ?? disabledIconWorkflowPort;

  if (detectItemRoute(options.content)) {
    const parser = new ItemParser();
    const parsed = parser.parse(options.content);
    const artifacts = await generateItemArtifacts(parsed, {
      sourceText: options.content,
      sourcePath,
      fvttVersion,
      effectProfile,
      iconOptions: options.iconOptions,
      iconWorkflow,
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
    const iconReview = iconWorkflow.mergeReviewReports(
      artifacts.map((artifact) => artifact.iconReview),
    );
    const iconReviewPath = status === 'accepted'
      ? writeReviewIfRequested(
          requestedOutputPath,
          iconReview,
          options.writeIconReviewReport,
          iconWorkflow,
        )
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
    iconWorkflow,
  });
  const actor = generated.actor;
  const requestedOutputPath = options.outputPath ? resolvePath(options.outputPath) : undefined;
  const diagnostics: GenerationDiagnostic[] = [...generated.diagnostics];
  let outputPath: string | undefined;
  try { writeJsonIfRequested(requestedOutputPath, actor); outputPath = requestedOutputPath; }
  catch (error) { diagnostics.push(reportFailure('GEN_OUTPUT_WRITE_INCOMPLETE', error)); }
  try {
    diagnostics.push(...new ActorValidator().validate(parsed, actor).map((message, index): GenerationDiagnostic => ({
      code: 'GEN_LEGACY_VALIDATOR_WARNING', severity: 'warning', stage: 'semantic', path: `legacy-validator/${index}`, message,
    })));
  } catch (error) { diagnostics.push(reportFailure('GEN_LEGACY_VALIDATOR_INCOMPLETE', error)); }
  let actorVerification: ActorVerificationSummary | null = null;
  try {
    actorVerification = buildActorVerificationSummaryFromValues({ source: options.content, actor,
      sourcePath: sourcePath ?? '<uploaded-markdown>', actorPath: requestedOutputPath ?? '<generated-preview>' });
    diagnostics.push(...actorVerification.sourceIntegrityErrors.map((message): GenerationDiagnostic => ({
      code: 'GEN_SOURCE_INTEGRITY_MISMATCH', severity: 'error', stage: 'semantic', path: 'source', message,
    })));
  } catch (error) { diagnostics.push(reportFailure('GEN_ACTOR_SUMMARY_INCOMPLETE', error)); }
  let iconReviewPath: string | undefined;
  try { iconReviewPath = writeReviewIfRequested(outputPath, generated.iconReview, options.writeIconReviewReport, iconWorkflow); }
  catch (error) { diagnostics.push(reportFailure('GEN_ICON_REPORT_INCOMPLETE', error)); }
  const status = generated.verification.status === 'failed' || diagnostics.some(diagnostic => diagnostic.severity === 'error')
    ? 'failed' : generated.verification.status === 'needs_review' || diagnostics.length ? 'needs_review' : 'accepted';
  const verification: GenerationVerification = { ...generated.verification, status, diagnostics };
  return {
    kind: 'actor', sourcePath, outputPath, fvttVersion, effectProfile,
    name: String(actor.name ?? ''), itemCount: Array.isArray(actor.items) ? actor.items.length : 0,
    status, diagnostics, warnings: warningMessages(diagnostics), verification, actorVerification, rawJson: actor,
    iconReview: generated.iconReview, ...(iconReviewPath ? { iconReviewPath } : {}),
  };
}

function reportFailure(code: string, error: unknown): GenerationDiagnostic {
  return { code, severity: 'error', stage: 'semantic', path: 'actor',
    message: error instanceof Error ? error.message : String(error) };
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
  iconWorkflow: IconWorkflowPort,
): string | undefined {
  if (!outputPath || !report || enabled === false) return undefined;
  const reportPath = iconWorkflow.reviewPathForOutput(outputPath);
  iconWorkflow.writeReviewReport(reportPath, report);
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
