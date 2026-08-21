import { describe, expect, test } from 'bun:test';
import { getForgeDnd5eVersionWarning, resolveForgeTarget, type ForgeGeneratorProfile } from '..';

describe('Forge FVTT generator routing', () => {
  test.each([
    ['12.331', 12, 'v12', '12', 'supported'],
    ['13.340', 13, 'v12', '13', 'supported'],
    ['14.364', 14, 'v14', '14', 'supported'],
  ] as const)('routes FVTT %s explicitly', (runtimeVersion, runtimeMajor, generatorProfile, workflowTargetVersion, compatibility) => {
    expect(resolveForgeTarget(runtimeVersion)).toEqual({
      runtimeVersion,
      runtimeMajor,
      generatorProfile,
      workflowTargetVersion,
      compatibility,
      compatibilityMessage: undefined,
    });
  });

  test('routes higher versions to the current highest profile with a warning', () => {
    expect(resolveForgeTarget('15.1.0')).toEqual({
      runtimeVersion: '15.1.0',
      runtimeMajor: 15,
      generatorProfile: 'v14' satisfies ForgeGeneratorProfile,
      workflowTargetVersion: '14',
      compatibility: 'forward-fallback',
      compatibilityMessage: '当前 FVTT 高于已开发版本，使用 v14 generator',
    });
  });

  test.each(['11.999', '', 'not-a-version', 'v14.364', '14..1'])('rejects unsupported runtime version %s', (version) => {
    expect(() => resolveForgeTarget(version)).toThrow();
  });

  test('warns on an observed dnd5e version without changing the generator mapping', () => {
    expect(getForgeDnd5eVersionWarning('13.340', '5.3.3')).toContain('pinned to dnd5e 4.3.9');
    expect(getForgeDnd5eVersionWarning('13.340', '4.3.9')).toBeUndefined();
  });
});
