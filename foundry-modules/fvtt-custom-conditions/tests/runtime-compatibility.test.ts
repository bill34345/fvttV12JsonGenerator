import { expect, test } from 'bun:test';
import { genericConditionsSupported } from '../src/runtime-compatibility';
import { injurySupported } from '../src/injury';

test('Mirror generic and injury gates admit the reviewed Core patch with pinned 5.3.3', () => {
  for (const version of ['14.364', '14.368']) {
    const game = { version, system: { id: 'dnd5e', version: '5.3.3' } };
    expect(genericConditionsSupported(game)).toBeTrue();
    expect(injurySupported({ game })).toBeTrue();
  }
  for (const [version, systemVersion] of [['14.365', '5.3.3'], ['14.367', '5.3.3'], ['14.369', '5.3.3'], ['14.368', '5.3.2'], ['14.368', '6.0.2']]) {
    const game = { version, system: { id: 'dnd5e', version: systemVersion } };
    expect(genericConditionsSupported(game)).toBeFalse();
    expect(injurySupported({ game })).toBeFalse();
  }
  const next = { version: '14.368', system: { id: 'dnd5e', version: '6.0.5' } };
  expect(genericConditionsSupported(next)).toBeFalse();
  expect(injurySupported({ game: next })).toBeTrue();
  expect(genericConditionsSupported({ version: '14.368', system: { id: 'other-system', version: '5.3.3' } })).toBeFalse();
});
