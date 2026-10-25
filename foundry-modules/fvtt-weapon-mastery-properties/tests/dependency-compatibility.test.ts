import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { customConditionsApi, inspectDependencies, triggerEngineApi } from '../src/adapters/dependencies.ts';
import { validateManifest } from '../build.ts';

const ccId = 'fvtt-custom-conditions';
const teId = 'fvtt-trigger-engine';

function fixture(ccVersion = '0.2.0', teVersion = '0.2.0') {
  const weaponEffects = {
    version: 1,
    list() {}, apply() {}, remove() {}, setEnabled() {},
    reserve() {}, start() {}, commit() {}, cancel() {},
  };
  const triggerApi = {
    apiVersion: 1,
    capabilities: { externalEvents: 1 },
    subscribeExternal() {}, publishExternal() {},
  };
  const modules = new Map<string, any>([
    [ccId, { id: ccId, version: ccVersion, active: true, api: { weaponEffects } }],
    [teId, { id: teId, version: teVersion, active: true, api: triggerApi }],
  ]);
  const globals = {
    game: {
      version: '14.364',
      system: { id: 'dnd5e', version: '5.3.3' },
      modules,
    },
  };
  return { globals, modules, weaponEffects, triggerApi };
}

describe('WMP dependency compatibility gate', () => {
  test('Next requires a positive native writer capability and the exact optional Midi adapter', () => {
    const { globals, modules, weaponEffects } = fixture();
    globals.game.version = '14.368';
    globals.game.system.version = '6.0.5';
    expect(inspectDependencies(globals).ready).toBeFalse();
    expect(inspectDependencies(globals).modules[0]?.reason).toBe('native6-weapon-writer-unavailable');
    expect(customConditionsApi(globals)).toBeUndefined();
    (weaponEffects as any).capabilities = { native6Effects: 1 };
    expect(inspectDependencies(globals).ready).toBeTrue();
    expect(customConditionsApi(globals)).toBe(weaponEffects);
    globals.game.system.version = '6.0.6';
    expect(inspectDependencies(globals).ready).toBeTrue();
    modules.set('midi-qol', { id: 'midi-qol', active: true, version: '14.6.0-beta.4338eeab.local.10' });
    expect(inspectDependencies(globals).ready).toBeTrue();
    modules.get('midi-qol').version = '14.6.0-beta.4338eeab.local.9';
    expect(inspectDependencies(globals).ready).toBeFalse();
    modules.delete('midi-qol');
    for (const [core, system] of [['14.364', '6.0.5'], ['14.368', '5.3.2'], ['14.364', '6.0.6'], ['14.368', '6.0.7']]) {
      globals.game.version = core!;
      globals.game.system.version = system!;
      expect(inspectDependencies(globals).ready).toBeFalse();
    }
  });

  test('Mirror shares Core14.368 while retaining legacy CC and Midi contracts', () => {
    const { globals, modules } = fixture();
    globals.game.version = '14.368';
    modules.set('midi-qol', { id: 'midi-qol', active: true, version: '14.0.11' });
    const report = inspectDependencies(globals);
    expect(report.ready).toBeTrue();
    expect(report.runtimeCompatible).toBeTrue();
    expect(report.modules.find(module => module.id === ccId)?.compatible).toBeTrue();
    expect(report.modules.find(module => module.id === 'midi-qol')).toBeUndefined();
  });


  test('accepts both exact 0.2.0 modules with version 1 APIs and keeps supported 0.1.x', () => {
    const current = inspectDependencies(fixture().globals);
    expect(current.ready).toBeTrue();
    expect(current.modules.map((module) => module.installedVersion)).toEqual(['0.2.0', '0.2.0']);
    expect(inspectDependencies(fixture('0.1.1', '0.1.7').globals).ready).toBeTrue();
  });

  test('rejects 0.2.1 separately for either dependency', () => {
    for (const [ccVersion, teVersion, rejectedId] of [
      ['0.2.1', '0.2.0', ccId],
      ['0.2.0', '0.2.1', teId],
    ] as const) {
      const report = inspectDependencies(fixture(ccVersion, teVersion).globals);
      expect(report.ready).toBeFalse();
      expect(report.modules.find((module) => module.id === rejectedId)?.reason).toBe('unsupported-module-version');
    }
  });

  test('rejects a missing weapon method, wrong API version, and missing external-event capability', () => {
    const missingWeaponMethod = fixture();
    delete (missingWeaponMethod.weaponEffects as Partial<typeof missingWeaponMethod.weaponEffects>).reserve;
    expect(inspectDependencies(missingWeaponMethod.globals).modules[0]?.reason).toBe('weapon-effects-api-unavailable');

    const wrongTriggerVersion = fixture();
    wrongTriggerVersion.triggerApi.apiVersion = 2;
    expect(inspectDependencies(wrongTriggerVersion.globals).modules[1]?.reason).toBe('external-events-api-unavailable');

    const wrongCapability = fixture();
    wrongCapability.triggerApi.capabilities.externalEvents = 2;
    expect(inspectDependencies(wrongCapability.globals).modules[1]?.reason).toBe('external-events-api-unavailable');

    const missingPublish = fixture();
    delete (missingPublish.triggerApi as Partial<typeof missingPublish.triggerApi>).publishExternal;
    expect(inspectDependencies(missingPublish.globals).modules[1]?.reason).toBe('external-events-api-unavailable');
  });

  test('retained APIs on inactive or unknown-active required modules are unavailable', () => {
    for (const id of [ccId, teId]) for (const active of [false, undefined]) {
      const { globals, modules } = fixture();
      modules.get(id).active = active;
      const report = inspectDependencies(globals);
      expect(report.ready).toBeFalse();
      expect(report.missing).toContain(id);
      expect(report.modules.find((entry) => entry.id === id)?.reason).toBe('module-not-active');
      expect(id === ccId ? customConditionsApi(globals) : triggerEngineApi(globals)).toBeUndefined();
    }
  });

  test('wrong required version or capability cannot leak an active retained API', () => {
    for (const change of [
      (value: ReturnType<typeof fixture>) => { value.modules.get(ccId).version = '0.2.1'; },
      (value: ReturnType<typeof fixture>) => { value.weaponEffects.version = 2; },
      (value: ReturnType<typeof fixture>) => { value.modules.get(teId).version = '0.2.1'; },
      (value: ReturnType<typeof fixture>) => { value.triggerApi.capabilities.externalEvents = 0; },
    ]) {
      const value = fixture(); change(value);
      expect(inspectDependencies(value.globals).ready).toBeFalse();
      if (inspectDependencies(value.globals).modules[0]?.compatible === false) expect(customConditionsApi(value.globals)).toBeUndefined();
      if (inspectDependencies(value.globals).modules[1]?.compatible === false) expect(triggerEngineApi(value.globals)).toBeUndefined();
    }
  });

  test('inactive installed Midi does not block native6; active unreviewed Midi still blocks', () => {
    const { globals, modules, weaponEffects } = fixture();
    globals.game.version = '14.368';
    globals.game.system.version = '6.0.6';
    (weaponEffects as any).capabilities = { native6Effects: 1 };
    modules.set('midi-qol', { id: 'midi-qol', version: '14.0.11', active: false });
    expect(inspectDependencies(globals).ready).toBeTrue();
    expect(inspectDependencies(globals).modules.find((entry) => entry.id === 'midi-qol')).toBeUndefined();
    modules.get('midi-qol').active = true;
    expect(inspectDependencies(globals).ready).toBeFalse();
    expect(inspectDependencies(globals).modules.find((entry) => entry.id === 'midi-qol')?.reason).toBe('unsupported-native6-midi-version');
  });

  test('keeps the exact Foundry and dnd5e runtime gate', () => {
    const { globals } = fixture();
    globals.game.version = '14.368';
    expect(inspectDependencies(globals).ready).toBeTrue();
    globals.game.version = '14.365';
    expect(inspectDependencies(globals).ready).toBeFalse();
    globals.game.version = '14.364';
    globals.game.system.version = '6.0.5';
    expect(inspectDependencies(globals).ready).toBeFalse();
  });
});

test('manifest accepts exact 0.2.0 dependency ceiling and rejects a later ceiling', () => {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dir, '../src/module.json'), 'utf8'));
  expect(() => validateManifest(manifest)).not.toThrow();
  const changed = structuredClone(manifest);
  changed.relationships.requires[0].compatibility.maximum = '0.2.1';
  expect(() => validateManifest(changed)).toThrow('bounded 0.1.1 through 0.2.0');
});
