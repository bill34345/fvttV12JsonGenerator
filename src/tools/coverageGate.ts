import { readFileSync } from 'node:fs';

export interface CoverageThresholds {
  minimumLines: number;
  minimumFunctions: number;
}

interface CoverageMetric {
  hit: number;
  found: number;
  ratio: number;
}

interface CoverageTotals {
  lines: CoverageMetric;
  functions: CoverageMetric;
}

export interface ProductionCoverageResult extends CoverageTotals {
  productionFiles: number;
  excludedTestFiles: number;
  groups: Record<string, CoverageTotals>;
  failures: string[];
}

interface LcovRecord {
  source: string;
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
}

export const PRODUCTION_COVERAGE_THRESHOLDS: CoverageThresholds = {
  minimumLines: 0.84,
  minimumFunctions: 0.85,
};

export function evaluateProductionCoverage(
  lcov: string,
  thresholds: CoverageThresholds = PRODUCTION_COVERAGE_THRESHOLDS,
): ProductionCoverageResult {
  const records = parseLcov(lcov);
  const productionRecords = records.filter((record) => !isTestSource(record.source));
  const excludedTestFiles = records.length - productionRecords.length;
  const totals = summarizeRecords(productionRecords);
  const groupedRecords = new Map<string, LcovRecord[]>();

  for (const record of productionRecords) {
    const group = coverageGroup(record.source);
    const existing = groupedRecords.get(group) ?? [];
    existing.push(record);
    groupedRecords.set(group, existing);
  }

  const groups = Object.fromEntries(
    [...groupedRecords.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([group, groupRecords]) => [group, summarizeRecords(groupRecords)]),
  );
  const failures: string[] = [];

  if (productionRecords.length === 0) {
    failures.push('zero production source records in LCOV');
  }
  if (totals.lines.ratio < thresholds.minimumLines) {
    failures.push(
      `production line coverage ${formatPercent(totals.lines.ratio)} is below ${formatPercent(thresholds.minimumLines)}`,
    );
  }
  if (totals.functions.ratio < thresholds.minimumFunctions) {
    failures.push(
      `production function coverage ${formatPercent(totals.functions.ratio)} is below ${formatPercent(thresholds.minimumFunctions)}`,
    );
  }

  return {
    productionFiles: productionRecords.length,
    excludedTestFiles,
    ...totals,
    groups,
    failures,
  };
}

export function formatCoverageSummary(result: ProductionCoverageResult): string {
  const lines = [
    `Production files: ${result.productionFiles}`,
    `Excluded test source records: ${result.excludedTestFiles}`,
    `Production lines: ${result.lines.hit}/${result.lines.found} (${formatPercent(result.lines.ratio)})`,
    `Production functions: ${result.functions.hit}/${result.functions.found} (${formatPercent(result.functions.ratio)})`,
    'Subsystems:',
  ];

  for (const [group, totals] of Object.entries(result.groups)) {
    lines.push(
      `- ${group}: lines ${formatPercent(totals.lines.ratio)}, functions ${formatPercent(totals.functions.ratio)}`,
    );
  }

  if (result.failures.length > 0) {
    lines.push('Failures:', ...result.failures.map((failure) => `- ${failure}`));
  }

  return lines.join('\n');
}

function parseLcov(lcov: string): LcovRecord[] {
  const records: LcovRecord[] = [];
  let current: Partial<LcovRecord> | undefined;

  const flush = () => {
    if (!current?.source) return;
    records.push({
      source: current.source,
      linesFound: current.linesFound ?? 0,
      linesHit: current.linesHit ?? 0,
      functionsFound: current.functionsFound ?? 0,
      functionsHit: current.functionsHit ?? 0,
    });
    current = undefined;
  };

  for (const line of lcov.split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      flush();
      current = { source: line.slice(3) };
    } else if (line.startsWith('LF:')) {
      if (current) current.linesFound = parseCount(line.slice(3));
    } else if (line.startsWith('LH:')) {
      if (current) current.linesHit = parseCount(line.slice(3));
    } else if (line.startsWith('FNF:')) {
      if (current) current.functionsFound = parseCount(line.slice(4));
    } else if (line.startsWith('FNH:')) {
      if (current) current.functionsHit = parseCount(line.slice(4));
    } else if (line === 'end_of_record') {
      flush();
    }
  }
  flush();
  return records;
}

function summarizeRecords(records: LcovRecord[]): CoverageTotals {
  const totals = records.reduce(
    (summary, record) => ({
      linesFound: summary.linesFound + record.linesFound,
      linesHit: summary.linesHit + record.linesHit,
      functionsFound: summary.functionsFound + record.functionsFound,
      functionsHit: summary.functionsHit + record.functionsHit,
    }),
    { linesFound: 0, linesHit: 0, functionsFound: 0, functionsHit: 0 },
  );

  return {
    lines: metric(totals.linesHit, totals.linesFound),
    functions: metric(totals.functionsHit, totals.functionsFound),
  };
}

function metric(hit: number, found: number): CoverageMetric {
  return { hit, found, ratio: found === 0 ? 0 : hit / found };
}

function parseCount(value: string): number {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function isTestSource(source: string): boolean {
  const normalized = source.replaceAll('\\', '/').toLowerCase();
  return (
    normalized.includes('/__tests__/') ||
    normalized.startsWith('tests/') ||
    normalized.includes('/tests/') ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function coverageGroup(source: string): string {
  const normalized = source.replaceAll('\\', '/').toLowerCase();
  if (normalized.startsWith('scripts/foundry-lab/')) return 'foundry-lab';
  if (normalized.startsWith('src/web/')) return 'web';
  if (normalized.startsWith('src/tools/')) return 'tools-gates';
  if (normalized.startsWith('src/core/workflow/')) return 'workflow';
  if (normalized.startsWith('src/core/parser/') || normalized.startsWith('src/core/ingest/')) {
    return 'parser-ingest';
  }
  if (
    normalized.startsWith('packages/generation/') ||
    normalized.startsWith('src/core/generator/') ||
    normalized.startsWith('src/core/mechanics/') ||
    normalized.startsWith('src/core/models/') ||
    normalized === 'src/core/foundrytarget.ts'
  ) {
    return 'generator';
  }
  return 'other';
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

if (import.meta.main) {
  const lcovPath = Bun.argv[2] ?? 'coverage/lcov.info';
  const result = evaluateProductionCoverage(readFileSync(lcovPath, 'utf-8'));
  console.log(formatCoverageSummary(result));
  if (result.failures.length > 0) {
    process.exitCode = 1;
  }
}
