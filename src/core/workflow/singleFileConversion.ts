import { iconWorkflowAdapter } from '@fvtt-json-generator/assets-icons/icon-adapter';
import {
  assertPathExists as assertPackagePathExists,
  convertMarkdownContentToJson as convertPackageMarkdownContentToJson,
  convertMarkdownPathToOutput as convertPackageMarkdownPathToOutput,
  inferDefaultOutputPath as inferPackageDefaultOutputPath,
  type ConversionResult,
  type ConvertMarkdownContentOptions,
  type ConvertMarkdownPathOptions,
} from '@fvtt-json-generator/workflows/single-file-conversion';

export {
  DEFAULT_VAULT_PATH,
  type ConversionResult,
  type ConvertMarkdownContentOptions,
  type ConvertMarkdownPathOptions,
  type FvttTargetVersion,
  type GeneratedDocumentKind,
} from '@fvtt-json-generator/workflows/single-file-conversion';

export function convertMarkdownContentToJson(
  options: ConvertMarkdownContentOptions,
): Promise<ConversionResult> {
  return convertPackageMarkdownContentToJson({
    ...options,
    iconWorkflow: options.iconWorkflow ?? iconWorkflowAdapter,
  });
}

export function convertMarkdownPathToOutput(
  options: ConvertMarkdownPathOptions,
): Promise<ConversionResult> {
  return convertPackageMarkdownPathToOutput({
    ...options,
    iconWorkflow: options.iconWorkflow ?? iconWorkflowAdapter,
  });
}

export function inferDefaultOutputPath(sourcePath: string, vaultPath: string): string {
  return inferPackageDefaultOutputPath(sourcePath, vaultPath);
}

export function assertPathExists(path: string): void {
  assertPackagePathExists(path);
}
