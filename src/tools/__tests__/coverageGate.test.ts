import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import {
  evaluateProductionCoverage,
  formatCoverageSummary,
} from '../coverageGate';

const SAMPLE_LCOV = [
  'TN:',
  'SF:packages\\generation\\src\\actor.ts',
  'FNF:10',
  'FNH:9',
  'LF:100',
  'LH:90',
  'end_of_record',
  'TN:',
  'SF:src\\core\\generator\\__tests__\\actor.test.ts',
  'FNF:20',
  'FNH:20',
  'LF:200',
  'LH:200',
  'end_of_record',
  'TN:',
  'SF:apps\\web\\src\\server\\api.ts',
  'FNF:10',
  'FNH:8',
  'LF:100',
  'LH:85',
  'end_of_record',
].join('\n');

describe('production coverage gate', () => {
  it('excludes test implementation records and reports production totals by subsystem', () => {
    const result = evaluateProductionCoverage(SAMPLE_LCOV, {
      minimumLines: 0.85,
      minimumFunctions: 0.85,
    });

    expect(result.productionFiles).toBe(2);
    expect(result.excludedTestFiles).toBe(1);
    expect(result.lines).toEqual({ hit: 175, found: 200, ratio: 0.875 });
    expect(result.functions).toEqual({ hit: 17, found: 20, ratio: 0.85 });
    expect(result.groups.generator?.lines.ratio).toBe(0.9);
    expect(result.groups.web?.lines.ratio).toBe(0.85);
    expect(result.failures).toEqual([]);
  });

  it('fails closed for missing production records and thresholds below baseline', () => {
    const low = evaluateProductionCoverage(SAMPLE_LCOV, {
      minimumLines: 0.9,
      minimumFunctions: 0.9,
    });
    const empty = evaluateProductionCoverage('TN:\nSF:tests\\only.test.ts\nLF:1\nLH:1\nFNF:1\nFNH:1\nend_of_record', {
      minimumLines: 0,
      minimumFunctions: 0,
    });

    expect(low.failures).toEqual([
      'production line coverage 87.50% is below 90.00%',
      'production function coverage 85.00% is below 90.00%',
    ]);
    expect(empty.failures).toContain('zero production source records in LCOV');
    expect(formatCoverageSummary(low)).toContain('Production files: 2');
  });

  it('normalizes Windows absolute paths, excludes temp bundles, and deduplicates sources', () => {
    const repositoryRoot = resolve(import.meta.dir, '../../..').replaceAll('/', '\\');
    const lcov = [
  `SF:${repositoryRoot}\\packages\\generation\\src\\actor.ts`,
      'FNF:5',
      'FNH:4',
      'LF:10',
      'LH:8',
      'end_of_record',
      'SF:packages\\generation\\src\\actor.ts',
      'FNF:5',
      'FNH:4',
      'LF:10',
      'LH:8',
      'end_of_record',
      'SF:packages\\parser\\src\\itemParser.ts',
      'FNF:4',
      'FNH:2',
      'LF:10',
      'LH:7',
      'end_of_record',
      'SF:packages\\models\\src\\item.ts',
      'FNF:4',
      'FNH:3',
      'LF:10',
      'LH:9',
      'end_of_record',
      'SF:C:\\Users\\tester\\AppData\\Local\\Temp\\bun\\coverage-bundle.ts',
      'FNF:100',
      'FNH:100',
      'LF:10000',
      'LH:10000',
      'end_of_record',
    ].join('\n');

    const result = evaluateProductionCoverage(lcov, {
      minimumLines: 0,
      minimumFunctions: 0,
    });

    expect(result.productionFiles).toBe(2);
    expect(result.lines).toEqual({ hit: 15, found: 20, ratio: 0.75 });
    expect(result.functions).toEqual({ hit: 6, found: 9, ratio: 6 / 9 });
    expect(result.groups['parser-ingest']?.lines.ratio).toBe(0.7);
    expect(result.groups.generator?.lines.ratio).toBe(0.8);
    expect(result.excludedTypeOnlySources).toBeGreaterThan(0);
    expect(result.failures).toEqual([]);
  });

  it('rejects an inventory made only from outside or nonexistent sources', () => {
    const result = evaluateProductionCoverage([
      'SF:C:\\Users\\tester\\AppData\\Local\\Temp\\bun\\coverage-bundle.ts',
      'FNF:10',
      'FNH:10',
      'LF:10',
      'LH:10',
      'end_of_record',
      'SF:src\\core\\generator\\missing-from-repository.ts',
      'FNF:10',
      'FNH:10',
      'LF:10',
      'LH:10',
      'end_of_record',
    ].join('\n'), {
      minimumLines: 0,
      minimumFunctions: 0,
    }, {
      productionSourceInventory: [
        'C:\\Users\\tester\\AppData\\Local\\Temp\\bun\\coverage-bundle.ts',
        'src\\core\\generator\\missing-from-repository.ts',
      ],
    });

    expect(result.productionFiles).toBe(0);
    expect(result.productionInventoryFiles).toBe(0);
    expect(result.failures).toContain(
      'invalid production source inventory entry: C:\\Users\\tester\\AppData\\Local\\Temp\\bun\\coverage-bundle.ts',
    );
    expect(result.failures).toContain(
      'invalid production source inventory entry: src\\core\\generator\\missing-from-repository.ts',
    );
    expect(result.failures).toContain('zero executable production sources in tsconfig.production.json inventory');
    expect(result.failures).toContain('zero production source records in LCOV');
  });

  it('reports declaration and pure re-export exclusions separately', () => {
    const result = evaluateProductionCoverage('', {
      minimumLines: 0,
      minimumFunctions: 0,
    }, {
      productionSourceInventory: [
        'packages/parser/src/opencc-js.d.ts',
        'packages/parser/src/index.ts',
        'packages/parser/src/itemParser.ts',
      ],
    });

    expect(result.productionInventoryFiles).toBe(1);
    expect(result.excludedNonExecutableSources).toBe(2);
    expect(result.excludedDeclarationSources).toBe(1);
    expect(result.excludedPureReexportSources).toBe(1);
    expect(result.missingProductionSources).toEqual([process.platform === 'win32' ? 'packages/parser/src/itemparser.ts' : 'packages/parser/src/itemParser.ts']);
    expect(formatCoverageSummary(result)).toContain('Excluded type declaration sources: 1');
    expect(formatCoverageSummary(result)).toContain('Excluded pure re-export sources: 1');
  });

  it('fails when an executable critical owner source has no LCOV record', () => {
    const result = evaluateProductionCoverage([
      'SF:packages\\parser\\src\\itemParser.ts',
      'FNF:4',
      'FNH:4',
      'LF:10',
      'LH:10',
      'end_of_record',
    ].join('\n'), {
      minimumLines: 0,
      minimumFunctions: 0,
    }, {
      productionSourceInventory: [
        'packages/parser/src/itemParser.ts',
        'packages/generation/src/actor.ts',
        'packages/workflows/src/generationPipeline.ts',
        'apps/web/src/server/api.ts',
      ],
      enforceMissingCriticalSources: true,
    });

    expect(result.productionFiles).toBe(1);
    expect(result.missingProductionSources).toEqual([
      'apps/web/src/server/api.ts',
      'packages/generation/src/actor.ts',
      process.platform === 'win32' ? 'packages/workflows/src/generationpipeline.ts' : 'packages/workflows/src/generationPipeline.ts',
    ]);
    expect(result.failures).toContain(
      `missing critical production source records in LCOV: ${result.missingProductionSources.join(', ')}`,
    );
  });
});
