import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { ActorGenerator } from '../generator/actor';
import type { EffectProfile } from '../generator/effectProfileApplier';
import { ActorValidator } from '../generator/validator';
import { ItemGenerator } from '../generator/item-generator';
import { ItemParser } from '../parser/item-parser';
import { detectItemRoute } from '../parser/item-router';
import { ParserFactory } from '../parser/router';
import {
  buildActorVerificationSummaryFromValues,
  type ActorVerificationSummary,
} from '../../tools/actorVerification';
import type { FvttTargetVersion } from '../foundryTarget';

export type { FvttTargetVersion } from '../foundryTarget';
export type GeneratedDocumentKind = 'actor' | 'item';

export interface ConvertMarkdownContentOptions {
  content: string;
  sourcePath?: string;
  outputPath?: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  translationService?: ConstructorParameters<typeof ActorGenerator>[0]['translationService'];
}

export interface ConvertMarkdownPathOptions {
  sourcePath: string;
  outputPath?: string;
  vaultPath?: string;
  fvttVersion?: FvttTargetVersion;
  effectProfile?: EffectProfile;
  translationService?: ConstructorParameters<typeof ActorGenerator>[0]['translationService'];
}

export interface ConversionResult {
  kind: GeneratedDocumentKind;
  sourcePath?: string;
  outputPath?: string;
  fvttVersion: FvttTargetVersion;
  effectProfile: EffectProfile;
  name: string;
  itemCount: number;
  warnings: string[];
  verification: ActorVerificationSummary | null;
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
    const item = await new ItemGenerator({ fvttVersion }).generate(parsed);
    const outputPath = options.outputPath ? resolvePath(options.outputPath) : undefined;
    writeJsonIfRequested(outputPath, item);

    return {
      kind: 'item',
      sourcePath,
      outputPath,
      fvttVersion,
      effectProfile,
      name: String(item.name ?? ''),
      itemCount: 0,
      warnings: [],
      verification: null,
      rawJson: item,
    };
  }

  const parserFactory = new ParserFactory();
  const route = parserFactory.detectRoute(options.content);
  const parsed = parserFactory.parse(options.content);
  const actor = await new ActorGenerator({
    fvttVersion,
    effectProfile,
    translationService: options.translationService,
  }).generateForRoute(parsed, route);
  const warnings = new ActorValidator().validate(parsed, actor);
  const outputPath = options.outputPath ? resolvePath(options.outputPath) : undefined;
  writeJsonIfRequested(outputPath, actor);

  return {
    kind: 'actor',
    sourcePath,
    outputPath,
    fvttVersion,
    effectProfile,
    name: String(actor.name ?? ''),
    itemCount: Array.isArray(actor.items) ? actor.items.length : 0,
    warnings,
    verification: buildActorVerificationSummaryFromValues({
      source: options.content,
      actor,
      sourcePath: sourcePath ?? '<uploaded-markdown>',
      actorPath: outputPath ?? '<generated-preview>',
    }),
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

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export function assertPathExists(path: string): void {
  if (!existsSync(resolvePath(path))) {
    throw new Error(`Path does not exist: ${path}`);
  }
}
