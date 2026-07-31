import { describe, expect, it } from 'bun:test';
import {
  evaluateProductionCoverage,
  formatCoverageSummary,
} from '../coverageGate';

const SAMPLE_LCOV = [
  'TN:',
  'SF:src\\core\\generator\\actor.ts',
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
});
