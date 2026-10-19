import type { FvttTargetVersion } from '@fvtt-json-generator/contracts/target';
import { createDisabledIconResolutionSession, type IconResolutionSessionPort, type IconWorkflowOptions } from '@fvtt-json-generator/workflows/icon-port';
import catalogData from '../../../../references/foundry-v14-icons/catalog.json';
import overrideData from '../../../../config/icon-overrides.v14.json';
import { createIconReviewReport, V14IconResolver } from './resolver';
import type { IconReviewEntry, V14IconCatalog, V14IconOverrideFile } from './types';

// Static build inputs: no filesystem, HTTP, Compendium loading or AI calls at runtime.
// Provenance remains the captured 14.364 / dnd5e 5.3.3 catalog, including on the
// separately supported 14.368 Mirror patch. Do not relabel it as a new capture.
const catalog = catalogData as V14IconCatalog;
const overrides = overrideData as V14IconOverrideFile;

export function createBundledIconResolutionSession(
  targetVersion: FvttTargetVersion,
  options: IconWorkflowOptions = {},
): IconResolutionSessionPort {
  if ((options.mode ?? 'off') === 'off') return createDisabledIconResolutionSession(options);
  if (options.mode !== 'safe' || targetVersion !== '14') {
    throw new Error('Bundled safe icons support only the v14 generation target.');
  }
  if (options.catalog || options.overrides || options.overridePath) {
    throw new Error('Browser icons use only the bundled verified catalog and overrides.');
  }
  const entries: IconReviewEntry[] = [];
  return {
    mode: 'safe',
    resolver: new V14IconResolver({ catalog, overrides, review: entries, fuzzyContent: true }),
    entries,
    report: () => createIconReviewReport(catalog, entries),
  };
}
