import {
  assertPathExists as assertLegacyPathExists,
  convertMarkdownContentToJson as convertLegacyMarkdownContentToJson,
  convertMarkdownPathToOutput as convertLegacyMarkdownPathToOutput,
  inferDefaultOutputPath as inferLegacyDefaultOutputPath,
} from '../workflow/singleFileConversion';
import type {
  ConversionResult,
  ConvertMarkdownContentOptions,
  ConvertMarkdownPathOptions,
} from '../workflow/singleFileConversion';

export { DEFAULT_VAULT_PATH } from '../workflow/singleFileConversion';
export type { EffectProfile } from '@fvtt-json-generator/contracts/target';
export type {
  ConversionStatus,
  GeneratedArtifactIdentity,
  GeneratedDocumentKind,
} from '@fvtt-json-generator/contracts/artifacts';
export type {
  DiagnosticSeverity,
  DiagnosticStage,
  GenerationDiagnostic,
} from '@fvtt-json-generator/contracts/diagnostics';
export type {
  ConversionResult,
  ConvertMarkdownContentOptions,
  ConvertMarkdownPathOptions,
  FvttTargetVersion,
} from '../workflow/singleFileConversion';

/**
 * Stable application boundary for single-document conversion.
 *
 * The implementation intentionally delegates to the legacy workflow during
 * the migration. Callers depend on this port so the implementation can move
 * without coupling CLI, Web, Intake, or operator tools to workflow internals.
 */
export interface ConversionApplication {
  convertContent(options: ConvertMarkdownContentOptions): Promise<ConversionResult>;
  convertPath(options: ConvertMarkdownPathOptions): Promise<ConversionResult>;
  inferDefaultOutputPath(sourcePath: string, vaultPath: string): string;
  assertPathExists(path: string): void;
}

export const conversionApplication: Readonly<ConversionApplication> = Object.freeze({
  convertContent: convertLegacyMarkdownContentToJson,
  convertPath: convertLegacyMarkdownPathToOutput,
  inferDefaultOutputPath: inferLegacyDefaultOutputPath,
  assertPathExists: assertLegacyPathExists,
});

export function convertMarkdownContentToJson(
  options: ConvertMarkdownContentOptions,
): Promise<ConversionResult> {
  return conversionApplication.convertContent(options);
}

export function convertMarkdownPathToOutput(
  options: ConvertMarkdownPathOptions,
): Promise<ConversionResult> {
  return conversionApplication.convertPath(options);
}

export function inferDefaultOutputPath(sourcePath: string, vaultPath: string): string {
  return conversionApplication.inferDefaultOutputPath(sourcePath, vaultPath);
}

export function assertPathExists(path: string): void {
  conversionApplication.assertPathExists(path);
}
