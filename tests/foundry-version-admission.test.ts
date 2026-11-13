import { describe, expect, test } from 'bun:test';
import { isVersionAtLeast, isVersionInMajor } from '@fvtt-json-generator/contracts/version-admission';

describe('Foundry module version admission', () => {
  test('Core and system admit later releases in the supported major', () => {
    for (const version of ['14.368', '14.369', '14.370', '14.999']) expect(isVersionInMajor(version, '14.368')).toBeTrue();
    for (const version of ['6.0.6', '6.0.7', '6.1.0', '6.99.0']) expect(isVersionInMajor(version, '6.0.6')).toBeTrue();
    for (const version of ['14.367', '13.999', '15.0']) expect(isVersionInMajor(version, '14.368')).toBeFalse();
    for (const version of ['5.3.3', '6.0.5', '7.0.0']) expect(isVersionInMajor(version, '6.0.6')).toBeFalse();
  });

  test('third-party dependencies have a minimum rather than a release whitelist or major cap', () => {
    for (const version of ['14.6.4', '14.6.5+local.1', '14.7.0', '15.0.0']) expect(isVersionAtLeast(version, '14.6.4')).toBeTrue();
    expect(isVersionAtLeast('14.6.3', '14.6.4')).toBeFalse();
    expect(isVersionAtLeast('14.6.4-beta.1', '14.6.4')).toBeFalse();
    expect(isVersionAtLeast('14.6.7+local.1', '14.6.7')).toBeTrue();
    expect(isVersionAtLeast('1.13.5.1', '1.13.5.0')).toBeTrue();
    expect(isVersionAtLeast('1.13.5.0', '1.13.5.1')).toBeFalse();
  });

  test('unknown or malformed installed versions are not treated as a supported minimum', () => {
    for (const version of [undefined, null, 14.369, '', 'unknown', '6.0.6garbage']) {
      expect(isVersionAtLeast(version, '6.0.6')).toBeFalse();
      expect(isVersionInMajor(version, '6.0.6')).toBeFalse();
    }
  });

  test('observed receiver targets can carry build metadata without breaking forward compatibility', () => {
    expect(isVersionAtLeast('14.370', '14.369+local.1')).toBeTrue();
    expect(isVersionAtLeast('6.1.0+local.2', '6.0.6+local.1')).toBeTrue();
    expect(isVersionAtLeast('6.0.6', '6.0.6+local.1')).toBeTrue();
    expect(isVersionAtLeast('6.0.6', '6.1.0+local.1')).toBeFalse();
    expect(isVersionInMajor('14.370+local.1', '14.368+local.2')).toBeTrue();
    expect(isVersionAtLeast('6.1.0-beta.10', '6.1.0-beta.2')).toBeTrue();
    expect(isVersionAtLeast('6.1.0-beta.2', '6.1.0')).toBeFalse();
  });
});
