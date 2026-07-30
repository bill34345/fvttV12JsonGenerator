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
} from '../../tools/actorVerification';
import type { FvttTargetVersion } from '../foundryTarget';
import type {
  GenerationDiagnostic,
  GenerationVerification,
} from '../generation/types';
import { getFoundryTarget } from '../foundryTarget';
import { generateActorArtifact } from './generationPipeline';
import { generateItemArtifacts } from './itemGenerationWorkflow';

export type { FvttTargetVersion } from '../foundryTarget';
export type GeneratedDocumentKind = 'actor' | 'item';

export interface ConvertMarkdownContentOptions {
  content: string;
  sourcePath?: string;
  outputPath?: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  translationService?: ActorGeneratorOptions['translationService'];
}

export interface ConvertMarkdownPathOptions {
  sourcePath: string;
  outputPath?: string;
  vaultPath?: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  translationService?: ActorGeneratorOptions['translationService'];
}

export interface ConversionResult {
  kind: GeneratedDocumentKind;
  sourcePath?: string;
  outputPath?: string;
  fvttVersion: FvttTargetVersion;
  effectProfile: EffectProfile;
  name: string;
  itemCount: number;
  status: 'accepted' | 'needs_review' | 'failed';
  diagnostics: GenerationDiagnostic[];
  warnings: string[];
  verification: GenerationVerification;
  actorVerification: ActorVerificationSummary | null;
  rawJson: unknown;
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
    const artifacts = await generateItemArtifacts(parsed, { fvttVersion, effectProfile });
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
  if (status === 'accepted') {
    writeJsonIfRequested(requestedOutputPath, actor);
  }
  const actorVerification = buildActorVerificationSummaryFromValues({
    source: options.content,
    actor,
    sourcePath: sourcePath ?? '<uploaded-markdown>',
    actorPath: requestedOutputPath ?? '<generated-preview>',
  });

  return {
    kind: 'actor',
    sourcePath,
    outputPath: status === 'accepted' ? requestedOutputPath : undefined,
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
  };
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
