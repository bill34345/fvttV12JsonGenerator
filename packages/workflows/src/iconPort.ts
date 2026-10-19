import type { IconMode, V14IconCatalog, V14IconOverrideFile, IconReviewEntry, IconReviewReport } from '@fvtt-json-generator/contracts/icon-review';
export type { IconMode, IconResolutionSource, IconConfidence, V14IconCatalogTarget, V14IconCatalogEntry, V14IconFileEntry, V14IconCatalog, V14IconOverrideSelector, V14IconOverrideEntry, V14IconOverrideFile, IconCandidate, IconResolution, IconReviewEntry, IconReviewReport } from '@fvtt-json-generator/contracts/icon-review';

export interface IconWorkflowOptions {
  mode?: IconMode;
  overridePath?: string;
  catalog?: V14IconCatalog;
  overrides?: V14IconOverrideFile;
}

export interface IconResolutionSessionPort {
  mode: IconMode;
  resolver?: GenerationIconResolver;
  entries: IconReviewEntry[];
  report(): IconReviewReport | null;
}

export interface IconWorkflowPort {
  createResolutionSession(
    targetVersion: FvttTargetVersion,
    options?: IconWorkflowOptions,
  ): IconResolutionSessionPort;
  fingerprint(options?: IconWorkflowOptions): string;
  mergeReviewReports(reports: Array<IconReviewReport | null | undefined>): IconReviewReport | null;
  reviewPathForOutput(outputPath: string): string;
  writeReviewReport(path: string, report: IconReviewReport): void;
}

export function createDisabledIconResolutionSession(
  options: IconWorkflowOptions = {},
): IconResolutionSessionPort {
  const mode = options.mode ?? 'off';
  if (mode !== 'off') {
    throw new Error(`Icon workflow adapter is required for mode "${mode}".`);
  }
  return { mode: 'off', entries: [], report: () => null };
}

export const disabledIconWorkflowPort: Readonly<IconWorkflowPort> = Object.freeze({
  createResolutionSession: (
    _targetVersion: FvttTargetVersion,
    options?: IconWorkflowOptions,
  ) =>
    createDisabledIconResolutionSession(options),
  fingerprint: (options: IconWorkflowOptions = {}) => {
    createDisabledIconResolutionSession(options);
    return 'off';
  },
  mergeReviewReports: (
    reports: Array<IconReviewReport | null | undefined>,
  ) => {
    if (reports.some(Boolean)) {
      throw new Error('Icon workflow adapter is required to merge review reports.');
    }
    return null;
  },
  reviewPathForOutput: () => {
    throw new Error('Icon workflow adapter is required to resolve review output paths.');
  },
  writeReviewReport: () => {
    throw new Error('Icon workflow adapter is required to write review reports.');
  },
});
import type { GenerationIconResolver } from '@fvtt-json-generator/generation/ports';
import type { FvttTargetVersion } from '@fvtt-json-generator/generation/target';
