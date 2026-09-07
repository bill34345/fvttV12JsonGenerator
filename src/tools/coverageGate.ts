import { readFileSync, statSync } from 'node:fs';
import ts from 'typescript';
import { isAbsolute, join, relative, resolve, win32 } from 'node:path';

export interface CoverageThresholds {
  minimumLines: number;
  minimumFunctions: number;
}

export interface CoverageEvaluationOptions {
  /** Use a precomputed executable-source inventory for isolated callers/tests. */
  productionSourceInventory?: readonly string[];
  /** The CLI enables this so missing critical owner sources fail closed. */
  enforceMissingCriticalSources?: boolean;
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
  productionInventoryFiles: number;
  excludedTestFiles: number;
  excludedNonExecutableSources: number;
  excludedDeclarationSources: number;
  excludedPureReexportSources: number;
  excludedTypeOnlySources: number;
  missingProductionSources: string[];
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

const REPOSITORY_ROOT = resolve(import.meta.dir, '../..');
const PRODUCTION_SOURCE_ROOTS = [
  'src/',
  'packages/',
  'apps/',
  'foundry-modules/',
  'tools/',
  'scripts/',
] as const;
const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/i;
const CRITICAL_SOURCE_PREFIXES = [
  'packages/parser/src/',
  'packages/generation/src/',
  'packages/workflows/src/',
  'apps/web/src/server/',
] as const;
const PRODUCTION_TSCONFIG_PATH = join(REPOSITORY_ROOT, 'tsconfig.production.json');

interface ProductionSourceInventory {
  executableSources: Set<string>;
  excludedNonExecutableSources: number;
  excludedDeclarationSources: number;
  excludedPureReexportSources: number;
  excludedTypeOnlySources: number;
  errors: string[];
}

type NonExecutableSourceKind = 'declaration' | 'pure-reexport' | 'type-only';

export function evaluateProductionCoverage(
  lcov: string,
  thresholds: CoverageThresholds = PRODUCTION_COVERAGE_THRESHOLDS,
  options: CoverageEvaluationOptions = {},
): ProductionCoverageResult {
  const records = parseLcov(lcov);
  const inventory = options.productionSourceInventory
    ? createProductionSourceInventory(options.productionSourceInventory)
    : loadProductionSourceInventory();
  const productionRecordsBySource = new Map<string, LcovRecord>();
  let excludedTestFiles = 0;

  // LCOV only reports modules loaded by the test run. Validate each reported
  // record against the current production tree without inventing zero-valued
  // records for every source file that the run did not load.
  for (const record of records) {
    if (isTestSource(record.source)) {
      excludedTestFiles += 1;
      continue;
    }

    const source = normalizeProductionSource(record.source, inventory.executableSources);
    if (!source || productionRecordsBySource.has(source)) continue;
    productionRecordsBySource.set(source, { ...record, source });
  }

  const productionRecords = [...productionRecordsBySource.values()];
  const missingProductionSources = [...inventory.executableSources]
    .filter((source) => !productionRecordsBySource.has(source))
    .sort();
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

  failures.push(...inventory.errors);
  if (inventory.executableSources.size === 0) {
    failures.push('zero executable production sources in tsconfig.production.json inventory');
  }
  if (productionRecords.length === 0) {
    failures.push('zero production source records in LCOV');
  }
  if (options.enforceMissingCriticalSources) {
    const missingCriticalSources = missingProductionSources.filter((source) =>
      CRITICAL_SOURCE_PREFIXES.some((prefix) => source.startsWith(prefix))
    );
    if (missingCriticalSources.length > 0) {
      failures.push(
        `missing critical production source records in LCOV: ${missingCriticalSources.join(', ')}`,
      );
    }
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
    productionInventoryFiles: inventory.executableSources.size,
    excludedTestFiles,
    excludedNonExecutableSources: inventory.excludedNonExecutableSources,
    excludedDeclarationSources: inventory.excludedDeclarationSources,
    excludedPureReexportSources: inventory.excludedPureReexportSources,
    excludedTypeOnlySources: inventory.excludedTypeOnlySources,
    missingProductionSources,
    ...totals,
    groups,
    failures,
  };
}

export function formatCoverageSummary(result: ProductionCoverageResult): string {
  const lines = [
    `Production files: ${result.productionFiles}`,
    `Production inventory files: ${result.productionInventoryFiles}`,
    `Excluded test source records: ${result.excludedTestFiles}`,
    `Excluded non-executable sources: ${result.excludedNonExecutableSources}`,
    `Excluded type declaration sources: ${result.excludedDeclarationSources}`,
    `Excluded pure re-export sources: ${result.excludedPureReexportSources}`,
    `Excluded type-only sources: ${result.excludedTypeOnlySources}`,
    `Missing production source records: ${result.missingProductionSources.length}`,
    `Production lines: ${result.lines.hit}/${result.lines.found} (${formatPercent(result.lines.ratio)})`,
    `Production functions: ${result.functions.hit}/${result.functions.found} (${formatPercent(result.functions.ratio)})`,
    'Subsystems:',
  ];

  for (const [group, totals] of Object.entries(result.groups)) {
    lines.push(
      `- ${group}: lines ${formatPercent(totals.lines.ratio)}, functions ${formatPercent(totals.functions.ratio)}`,
    );
  }

  if (result.missingProductionSources.length > 0) {
    lines.push('Missing production sources:', ...result.missingProductionSources.map((source) => `- ${source}`));
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
    /(?:^|\/)__tests__(?:\/|$)/.test(normalized) ||
    /(?:^|\/)tests?(?:\/|$)/.test(normalized) ||
    /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function emptyProductionSourceInventory(): ProductionSourceInventory {
  return {
    executableSources: new Set<string>(),
    excludedNonExecutableSources: 0,
    excludedDeclarationSources: 0,
    excludedPureReexportSources: 0,
    excludedTypeOnlySources: 0,
    errors: [],
  };
}

function createProductionSourceInventory(sourceEntries: readonly string[]): ProductionSourceInventory {
  const inventory = emptyProductionSourceInventory();
  const seen = new Set<string>();

  for (const entry of sourceEntries) {
    const source = normalizeRepositorySource(entry);
    if (!source) {
      inventory.errors.push(`invalid production source inventory entry: ${entry}`);
      continue;
    }
    if (seen.has(source)) continue;
    seen.add(source);
    classifyInventorySource(source, inventory);
  }

  return inventory;
}

function loadProductionSourceInventory(): ProductionSourceInventory {
  const inventory = emptyProductionSourceInventory();
  const config = ts.readConfigFile(PRODUCTION_TSCONFIG_PATH, ts.sys.readFile);
  if (config.error) {
    inventory.errors.push(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    return inventory;
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, REPOSITORY_ROOT);
  inventory.errors.push(...parsed.errors.map((error) =>
    ts.flattenDiagnosticMessageText(error.messageText, '\n')));
  const sources = new Set(parsed.fileNames.map(normalizeRepositorySource).filter(
    (source): source is string => source !== undefined,
  ));
  for (const source of [...sources].sort()) classifyInventorySource(source, inventory);
  return inventory;
}

function classifyInventorySource(source: string, inventory: ProductionSourceInventory): void {
  if (source.endsWith('.d.ts')) {
    inventory.excludedNonExecutableSources += 1;
    inventory.excludedDeclarationSources += 1;
    return;
  }

  let content: string;
  try {
    content = readFileSync(resolve(REPOSITORY_ROOT, ...source.split('/')), 'utf-8');
  } catch (error) {
    inventory.errors.push(`unable to read production source ${source}: ${formatError(error)}`);
    return;
  }

  const classification = classifySource(content, source);
  if (classification.executable) {
    inventory.executableSources.add(source);
    return;
  }

  inventory.excludedNonExecutableSources += 1;
  if (classification.kind === 'declaration') inventory.excludedDeclarationSources += 1;
  if (classification.kind === 'pure-reexport') inventory.excludedPureReexportSources += 1;
  if (classification.kind === 'type-only') inventory.excludedTypeOnlySources += 1;
}

function normalizeProductionSource(
  source: string,
  executableSources: ReadonlySet<string>,
): string | undefined {
  const repositoryRelative = normalizeRepositorySource(source);
  if (!repositoryRelative || repositoryRelative.endsWith('.d.ts')) return undefined;
  return executableSources.has(repositoryRelative) ? repositoryRelative : undefined;
}

function normalizeRepositorySource(source: string): string | undefined {
  const repositoryRelative = repositoryRelativePath(source);
  if (!repositoryRelative) return undefined;

  const normalized = process.platform === 'win32' ? repositoryRelative.toLowerCase() : repositoryRelative;
  if (
    !SOURCE_FILE_PATTERN.test(normalized) ||
    isTestSource(normalized) ||
    isTemporarySource(normalized) ||
    !PRODUCTION_SOURCE_ROOTS.some((root) => normalized.startsWith(root))
  ) {
    return undefined;
  }

  const absolutePath = resolve(REPOSITORY_ROOT, ...repositoryRelative.split('/'));
  try {
    return statSync(absolutePath).isFile() ? normalized : undefined;
  } catch {
    return undefined;
  }
}

function classifySource(content: string, fileName: string): { executable: boolean; kind?: NonExecutableSourceKind } {
  const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  let hasValueReexport = false;
  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
      || ts.isEmptyStatement(statement)) continue;
    if (ts.canHaveModifiers(statement)
      && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)) continue;
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
        && clause.namedBindings.elements.length > 0
        && clause.namedBindings.elements.every((element) => element.isTypeOnly)) continue;
      // A value or side-effect import can run initialization code.
      return { executable: true };
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.isTypeOnly && (!statement.exportClause
        || !ts.isNamedExports(statement.exportClause)
        || statement.exportClause.elements.some((element) => !element.isTypeOnly))) hasValueReexport = true;
      continue;
    }
    return { executable: true };
  }
  return { executable: false, kind: hasValueReexport ? 'pure-reexport' : 'type-only' };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function repositoryRelativePath(source: string): string | undefined {
  let cleaned = source.trim();
  if (!cleaned) return undefined;
  if (/^file:\/\//i.test(cleaned)) {
    cleaned = cleaned.replace(/^file:\/\//i, '');
    try {
      cleaned = decodeURIComponent(cleaned);
    } catch {
      return undefined;
    }
  }

  cleaned = cleaned
    .replaceAll('\\', '/')
    .replace(/^\/([A-Za-z]:\/)/, '$1')
    .replace(/^\/\/\?\//, '');

  const repositoryRoot = resolve(REPOSITORY_ROOT);
  const candidate = win32.isAbsolute(cleaned)
    ? win32.resolve(cleaned)
    : isAbsolute(cleaned)
      ? resolve(cleaned)
      : resolve(repositoryRoot, cleaned);
  const relativePath = win32.isAbsolute(cleaned)
    ? win32.relative(win32.resolve(repositoryRoot), candidate)
    : relative(repositoryRoot, candidate);
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '');

  if (
    !normalized ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function isTemporarySource(source: string): boolean {
  return source.split('/').some((segment) => /^(?:\.?temp|\.?tmp)(?:[-_.].*)?$/i.test(segment));
}

function coverageGroup(source: string): string {
  const normalized = source.replaceAll('\\', '/').toLowerCase();
  if (
    normalized.startsWith('scripts/foundry-lab/')
    || normalized.startsWith('tools/foundry-ops/')
    || normalized.startsWith('foundry-modules/')
    || normalized.startsWith('packages/blood-hunter-v14/')
  ) return 'foundry-lab';
  if (
    normalized.startsWith('src/web/')
    || normalized.startsWith('apps/web/')
    || normalized.startsWith('packages/forge-browser-runtime/')
  ) return 'web';
  if (normalized.startsWith('src/tools/') || normalized.startsWith('scripts/')) return 'tools-gates';
  if (
    normalized.startsWith('packages/workflows/')
    || normalized.startsWith('packages/forge-gateway-protocol/')
    || normalized.startsWith('src/core/workflow/')
    || normalized.startsWith('src/core/application/')
    || normalized.startsWith('apps/cli/')
  ) return 'workflow';
  if (
    normalized.startsWith('packages/parser/')
    || normalized.startsWith('packages/ingest-documents/')
    || normalized.startsWith('packages/ingest-plaintext/')
    || normalized.startsWith('src/core/parser/')
    || normalized.startsWith('src/core/ingest/')
    || normalized.startsWith('src/core/crawl/')
    || normalized.startsWith('src/core/intake/')
    || normalized.startsWith('src/core/mapper/')
    || normalized.startsWith('packages/crawl-goddessfantasy/')
    || normalized.startsWith('packages/intake-ai/')
  ) {
    return 'parser-ingest';
  }
  if (
    normalized.startsWith('packages/models/') ||
    normalized.startsWith('packages/generation/') ||
    normalized.startsWith('packages/contracts/') ||
    normalized.startsWith('packages/spell-manifest-contracts/') ||
    normalized.startsWith('src/core/generator/') ||
    normalized.startsWith('src/core/generation/') ||
    normalized.startsWith('src/core/mechanics/') ||
    normalized.startsWith('src/core/contracts/') ||
    normalized.startsWith('src/core/models/') ||
    normalized.startsWith('src/core/spell-resolution/') ||
    normalized.startsWith('src/core/validator/') ||
    normalized === 'src/core/foundrytarget.ts'
  ) {
    return 'generator';
  }
  if (normalized.startsWith('packages/assets-icons/')) return 'tools-gates';
  return 'other';
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

if (import.meta.main) {
  const lcovPath = Bun.argv[2] ?? 'coverage/lcov.info';
  const result = evaluateProductionCoverage(readFileSync(lcovPath, 'utf-8'), PRODUCTION_COVERAGE_THRESHOLDS, {
    enforceMissingCriticalSources: true,
  });
  console.log(formatCoverageSummary(result));
  if (result.failures.length > 0) {
    process.exitCode = 1;
  }
}
