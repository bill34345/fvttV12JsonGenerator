import type { FvttTargetVersion } from '@fvtt-json-generator/contracts/target';
import { loadV14IconCatalog, loadV14IconOverrides } from './resources';
import { V14IconResolver, createIconReviewReport } from './resolver';
import type {
  IconMode,
  IconReviewEntry,
  IconReviewReport,
  IconWorkflowOptions,
  V14IconCatalog,
} from './types';

export interface IconResolutionSession {
  mode: IconMode;
  resolver?: V14IconResolver;
  entries: IconReviewEntry[];
  report(): IconReviewReport | null;
}

export function parseIconMode(value: unknown): IconMode {
  if (value === undefined || value === null || value === '' || value === 'off') return 'off';
  if (value === 'safe') return 'safe';
  throw new Error(`Unsupported icon mode: ${String(value)}. Use off or safe.`);
}

export function createIconResolutionSession(
  targetVersion: FvttTargetVersion,
  options: IconWorkflowOptions = {},
): IconResolutionSession {
  const mode = parseIconMode(options.mode);
  if (mode === 'off') {
    return { mode, entries: [], report: () => null };
  }
  if (targetVersion !== '14') {
    throw new Error(`Icon mode "safe" supports only --fvtt-version 14, not ${targetVersion}.`);
  }
  const catalog = loadV14IconCatalog(options);
  const overrides = loadV14IconOverrides(options, catalog);
  const entries: IconReviewEntry[] = [];
  const resolver = new V14IconResolver({ catalog, overrides, review: entries });
  return {
    mode,
    resolver,
    entries,
    report: () => createReport(catalog, entries),
  };
}

function createReport(
  catalog: V14IconCatalog,
  entries: IconReviewEntry[],
): IconReviewReport {
  return createIconReviewReport(catalog, entries);
}
