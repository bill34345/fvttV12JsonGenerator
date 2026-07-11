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
    expect(() => compareModuleParity(active, [{ id: 'a', version: '2.0.0', requires: [] }], {
      acceptedVersionOverrides: [{ id: 'a', productionVersion: 'wrong', localVersion: '2.0.0', reason: 'bad' }],
      optionalDisabledModules: [],
    })).toThrow('Invalid user decisions');
  });
  it('compares stable production and local dependency declarations and fails both gates', () => {
    const report = compareModuleParity(active, [{ id: 'a', version: '1.0.0', requires: ['local-dep'], expectedRequires: ['production-dep'] }, { id: 'local-dep', version: '1', requires: [] }]);
    expect(report.dependencyDeclarationMismatch).toEqual([{ id: 'a', expected: ['production-dep'], actual: ['local-dep'] }]);
    expect(report.pass).toBe(false);
    expect(report.effectivePass).toBe(false);
  });

  it('computes missing dependencies from local declarations and locally available IDs', () => {
    const report = compareModuleParity(active, [{ id: 'a', version: '1.0.0', requires: ['absent'], expectedRequires: ['absent'] }]);
    expect(report.missingDependencies).toEqual([{ id: 'a', dependency: 'absent' }]);
  });

  it('fails closed on duplicate inventories and ambiguous or unknown decisions', () => {
    expect(() => compareModuleParity([...active, ...active], [])).toThrow('Duplicate active module id');
    expect(() => compareModuleParity(active, [{ id: 'a', version: '1', requires: [] }, { id: 'a', version: '1', requires: [] }])).toThrow('Duplicate local module id');
    const bad = { acceptedVersionOverrides: [
      { id: 'unknown', productionVersion: '1', localVersion: '2', reason: 'x' },
      { id: 'unknown', productionVersion: '1', localVersion: '3', reason: 'y' },
    ], optionalDisabledModules: [{ id: 'unknown', reason: 'x' }, { id: 'unknown', reason: 'y' }] };
    expect(() => compareModuleParity(active, [{ id: 'a', version: '1.0.0', requires: [] }], bad)).toThrow('Invalid user decisions');
  });

  it('rejects an override for an exact local version because it cannot approve a mismatch', () => {
    const decisions = { acceptedVersionOverrides: [{ id: 'a', productionVersion: '1.0.0', localVersion: '1.0.0', reason: 'x' }], optionalDisabledModules: [] };
    expect(() => compareModuleParity(active, [{ id: 'a', version: '1.0.0', requires: [] }], decisions)).toThrow('Invalid user decisions');
  });
});
