import {
  assertPathExists as assertPackagePathExists,
  convertMarkdownContentToJson as convertPackageMarkdownContentToJson,
  convertMarkdownPathToOutput as convertPackageMarkdownPathToOutput,
  inferDefaultOutputPath as inferPackageDefaultOutputPath,
} from '@fvtt-json-generator/workflows/single-file-conversion';
import type {
  ConversionResult,
  ConvertMarkdownContentOptions,
  ConvertMarkdownPathOptions,
} from '@fvtt-json-generator/workflows/single-file-conversion';
import { iconWorkflowAdapter } from '@fvtt-json-generator/assets-icons/icon-adapter';

export { DEFAULT_VAULT_PATH } from '@fvtt-json-generator/workflows/single-file-conversion';
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
} from '@fvtt-json-generator/workflows/single-file-conversion';

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
  convertContent: (options: ConvertMarkdownContentOptions) => convertPackageMarkdownContentToJson({
    ...options,
    iconWorkflow: options.iconWorkflow ?? iconWorkflowAdapter,
  }),
  convertPath: (options: ConvertMarkdownPathOptions) => convertPackageMarkdownPathToOutput({
    ...options,
    iconWorkflow: options.iconWorkflow ?? iconWorkflowAdapter,
  }),
  inferDefaultOutputPath: inferPackageDefaultOutputPath,
  assertPathExists: assertPackagePathExists,
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
