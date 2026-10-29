import { expect, test } from 'bun:test';
import { genericConditionsSupported } from '../src/runtime-compatibility';
import { injurySupported } from '../src/injury';
import { initializeCustomConditions } from '../src/index';

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
  expect(genericConditionsSupported(next)).toBeTrue();
  expect(injurySupported({ game: next })).toBeTrue();
  const current = { version: '14.368', system: { id: 'dnd5e', version: '6.0.6' } };
  expect(genericConditionsSupported(current)).toBeTrue();
  expect(injurySupported({ game: current })).toBeTrue();
  expect(genericConditionsSupported({ version: '14.368', system: { id: 'dnd5e', version: '6.0.7' } })).toBeFalse();
  expect(genericConditionsSupported({ version: '14.368', system: { id: 'other-system', version: '5.3.3' } })).toBeFalse();
});

test.each([
  ['14.364', '5.3.3', true, false],
  ['14.368', '5.3.3', true, false],
  ['14.368', '6.0.5', true, true],
  ['14.368', '6.0.6', true, true],
  ['14.364', '6.0.5', false, false],
  ['14.364', '6.0.6', false, false],
  ['14.368', '6.0.7', false, false],
])('init mappings and ready public APIs agree on %s/%s', (core, system, supported, native6) => {
  const once = new Map<string, () => void>();
  const module: any = { id: 'fvtt-custom-conditions', active: true };
  const gm = { id: 'gm', isGM: true, active: true };
  const globals: any = {
    game: { version: core, system: { id: 'dnd5e', version: system },
      user: gm, users: { activeGM: gm }, modules: new Map([[module.id, module]]) },
    CONFIG: { statusEffects: [], DND5E: { conditionEffects: { noMovement: new Set(), halfMovement: new Set() } } },
    Hooks: { once: (name: string, callback: () => void) => once.set(name, callback), on: () => 1, off() {} },
    ui: { notifications: { warn() {}, error() {} } },
  };
  const lifecycle = initializeCustomConditions(globals)!;
  once.get('init')!();
  expect(globals.CONFIG.statusEffects).toHaveLength(supported ? 19 : 0);
  once.get('ready')!();
  expect(module.api.definitions()).toHaveLength(supported ? 19 : 0);
  expect(module.api.weaponEffects.capabilities.native6Effects).toBe(native6 ? 1 : undefined);
  if (supported) {
    const noMovement = globals.CONFIG.DND5E.conditionEffects.noMovement;
    expect(noMovement.has('fvttcc.immobilized')).toBe(native6);
    expect(noMovement.has('fvtt-custom-conditions.immobilized')).toBe(!native6);
  }
  lifecycle.runtime?.stop();
});
