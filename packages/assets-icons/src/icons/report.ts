import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { IconReviewEntry, IconReviewReport } from './types';

export function mergeIconReviewReports(
  reports: Array<IconReviewReport | null | undefined>,
): IconReviewReport | null {
  const present = reports.filter((report): report is IconReviewReport => Boolean(report));
  const first = present[0];
  if (!first) return null;
  for (const report of present.slice(1)) {
    if (
      report.target.foundryVersion !== first.target.foundryVersion
      || report.target.systemVersion !== first.target.systemVersion
    ) {
      throw new Error('Cannot merge icon review reports from different Foundry/dnd5e targets.');
    }
  }
  const entries = present
    .flatMap((report) => report.entries)
    .sort((left, right) =>
      compare(left.actorName ?? '', right.actorName ?? '')
      || compare(left.itemType, right.itemType)
      || compare(left.englishName ?? left.itemName, right.englishName ?? right.itemName),
    );
  return {
    schemaVersion: 1,
    target: first.target,
    mode: 'safe',
    entries,
    summary: summarizeIconReviewEntries(entries),
  };
}

export function summarizeIconReviewEntries(entries: IconReviewEntry[]): IconReviewReport['summary'] {
  return {
    total: entries.length,
    override: entries.filter((entry) => entry.source === 'override').length,
    existing: entries.filter((entry) => entry.source === 'existing').length,
    exact: entries.filter((entry) => entry.source === 'compendium-exact').length,
    semantic: entries.filter((entry) => entry.source === 'semantic').length,
    fallback: entries.filter((entry) => entry.source === 'type-default').length,
  };
}

export function iconReviewPathForOutput(outputPath: string): string {
  return outputPath.toLowerCase().endsWith('.json')
    ? outputPath.replace(/\.json$/iu, '.icon-review.json')
    : join(outputPath, 'icon-review.json');
}

export function writeIconReviewReport(
  reportPath: string,
  report: IconReviewReport,
): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}
