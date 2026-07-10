import { describe, expect, it } from 'bun:test';
import { assertEffectProfileForTarget, getFoundryTarget, parseFvttTargetVersion } from '../foundryTarget';

describe('foundryTarget', () => {
  it('accepts supported Foundry target versions', () => {
    expect(parseFvttTargetVersion('12')).toBe('12');
    expect(parseFvttTargetVersion('13')).toBe('13');
    expect(parseFvttTargetVersion('14')).toBe('14');
  });

  it('describes v14 as dnd5e 5.3.3 with v14 reference paths', () => {
    const target = getFoundryTarget('14');

    expect(target.fvttVersion).toBe('14');
    expect(target.dnd5eVersion).toBe('5.3.3');
    expect(target.stats.systemVersion).toBe('5.3.3');
    expect(target.reference.dnd5eRepo).toContain('references/dnd5e-5.3.3/repo');
    expect(target.effectProfiles).toEqual(['core', 'modded-v14']);
    expect(target.modules).toEqual({
      midiQol: '14.0.9',
      dae: '14.0.12',
      timesUp: null,
      itemMacro: null,
    });
  });

  it('rejects unsupported target versions explicitly', () => {
    expect(() => parseFvttTargetVersion('15')).toThrow('Unsupported Foundry target');
  });

  it('rejects v12 module effect profile for v14', () => {
    expect(() => assertEffectProfileForTarget('14', 'modded-v12')).toThrow('not supported');
    expect(() => assertEffectProfileForTarget('14', 'core')).not.toThrow();
    expect(() => assertEffectProfileForTarget('14', 'modded-v14')).not.toThrow();
  });

  it('rejects v14 module effect profile for v12 and v13', () => {
    expect(() => assertEffectProfileForTarget('12', 'modded-v14')).toThrow('not supported');
    expect(() => assertEffectProfileForTarget('13', 'modded-v14')).toThrow('not supported');
  });
});
