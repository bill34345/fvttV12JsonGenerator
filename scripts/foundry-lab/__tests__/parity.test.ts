import { describe, expect, it } from 'bun:test';
import { compareModuleParity } from '../parity';

const active = [{ id: 'a', title: 'A', version: '1.0.0' }];

describe('module parity', () => {
  it('separates production-exact parity from explicitly approved effective parity', () => {
    const report = compareModuleParity(active, [{ id: 'a', version: '2.0.0', requires: [] }], {
      acceptedVersionOverrides: [{ id: 'a', productionVersion: '1.0.0', localVersion: '2.0.0', reason: 'approved' }],
      optionalDisabledModules: [],
    });
    expect(report.pass).toBe(false);
    expect(report.versionMismatch).toEqual([{ id: 'a', expected: '1.0.0', actual: '2.0.0' }]);
    expect(report.approvedVersionMismatch).toEqual(report.versionMismatch);
    expect(report.effectivePass).toBe(true);
  });

  it('reports missing, extras, dependency gaps, and unresolved packages', () => {
    const report = compareModuleParity(
      [...active, { id: 'b', title: 'B', version: '1.0.0' }, { id: 'c', title: 'C', version: '1.0.0' }],
      [{ id: 'a', version: '1.0.0', requires: ['dep'] }, { id: 'extra', version: '1', requires: [], unresolvedReason: 'manual' }],
    );
    expect(report.exact).toEqual(['a']);
    expect(report.missing).toEqual(['b', 'c']);
    expect(report.extra).toEqual(['extra']);
    expect(report.missingDependencies).toEqual([{ id: 'a', dependency: 'dep' }]);
    expect(report.unresolved).toEqual([{ id: 'extra', reason: 'manual' }]);
    expect(report.pass).toBe(false);
    expect(report.effectivePass).toBe(false);
  });

  it('does not accept an override unless every identity and version field matches', () => {
    const report = compareModuleParity(active, [{ id: 'a', version: '2.0.0', requires: [] }], {
      acceptedVersionOverrides: [{ id: 'a', productionVersion: 'wrong', localVersion: '2.0.0', reason: 'bad' }],
      optionalDisabledModules: [],
    });
    expect(report.approvedVersionMismatch).toEqual([]);
    expect(report.unapprovedVersionMismatch).toHaveLength(1);
    expect(report.effectivePass).toBe(false);
  });
});
