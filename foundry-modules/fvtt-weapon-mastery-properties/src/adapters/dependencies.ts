import { DND5E_VERSION, FOUNDRY_VERSION, NEXT_DND5E_VERSION, NEXT_FOUNDRY_VERSION, MODULE_ID } from '../constants.ts';
import { collection, moduleRecord } from './foundry.ts';
import { NEXT_MIDI_VERSION } from './dnd5e-message.ts';

export const CUSTOM_CONDITIONS_MODULE_ID = 'fvtt-custom-conditions' as const;
export const TRIGGER_ENGINE_MODULE_ID = 'fvtt-trigger-engine' as const;
export const WM5E_MODULE_ID = 'wm5e' as const;
export const CUSTOM_CONDITIONS_API_VERSION = 1 as const;
export const TRIGGER_ENGINE_API_VERSION = 1 as const;

export interface DependencyStatus {
  id: string;
  requiredVersion: string;
  installedVersion?: string;
  apiVersion?: number;
  available: boolean;
  compatible: boolean;
  reason?: string;
}

export interface DependencyReport {
  ready: boolean;
  foundryVersion?: string;
  dnd5eVersion?: string;
  runtimeCompatible: boolean;
  missing: string[];
  incompatible: string[];
  conflicts: string[];
  modules: readonly DependencyStatus[];
}

function exactOrUnknown(actual: unknown, expected: string): { compatible: boolean; value?: string } {
  if (actual === undefined || actual === null || actual === '') return { compatible: false };
  const value = String(actual);
  return { compatible: value === expected, value };
}

function moduleVersion(module: any): string | undefined {
  return typeof module?.version === 'string' ? module.version : undefined;
}

function supportedDependencyVersion(version: string | undefined): boolean {
  return version !== undefined && (/^0\.1\.[1-9][0-9]*$/.test(version) || version === '0.2.0');
}

function conditionsStatus(globals: any, native6: boolean): DependencyStatus {
  const module = moduleRecord(globals, CUSTOM_CONDITIONS_MODULE_ID);
  const api = module?.api;
  const version = moduleVersion(module);
  const versionMatch = supportedDependencyVersion(version);
  const apiMatch = api?.weaponEffects?.version === CUSTOM_CONDITIONS_API_VERSION
    && ['list', 'apply', 'remove', 'setEnabled', 'reserve', 'start', 'commit', 'cancel']
      .every((key) => typeof api.weaponEffects[key] === 'function');
  const writerMatch = !native6 || api?.weaponEffects?.capabilities?.native6Effects === 1;
  return {
    id: CUSTOM_CONDITIONS_MODULE_ID,
    requiredVersion: '0.1.1',
    ...(version === undefined ? {} : { installedVersion: version }),
    ...(api?.weaponEffects?.version === undefined ? {} : { apiVersion: api.weaponEffects.version }),
    available: Boolean(module && api),
    compatible: Boolean(module && versionMatch && apiMatch && writerMatch),
    ...(!module ? { reason: 'module-not-active' } : !versionMatch ? { reason: 'unsupported-module-version' } : !apiMatch ? { reason: 'weapon-effects-api-unavailable' } : !writerMatch ? { reason: 'native6-weapon-writer-unavailable' } : {}),
  };
}

function triggerStatus(globals: any): DependencyStatus {
  const module = moduleRecord(globals, TRIGGER_ENGINE_MODULE_ID);
  const api = module?.api;
  const version = moduleVersion(module);
  const versionMatch = supportedDependencyVersion(version);
  const apiMatch = api?.apiVersion === TRIGGER_ENGINE_API_VERSION
    && api?.capabilities?.externalEvents === 1
    && typeof api?.subscribeExternal === 'function'
    && typeof api?.publishExternal === 'function';
  return {
    id: TRIGGER_ENGINE_MODULE_ID,
    requiredVersion: '0.1.1',
    ...(version === undefined ? {} : { installedVersion: version }),
    ...(api?.apiVersion === undefined ? {} : { apiVersion: api.apiVersion }),
    available: Boolean(module && api),
    compatible: Boolean(module && versionMatch && apiMatch),
    ...(!module ? { reason: 'module-not-active' } : !versionMatch ? { reason: 'unsupported-module-version' } : !apiMatch ? { reason: 'external-events-api-unavailable' } : {}),
  };
}

function conflictModules(globals: any): string[] {
  return collection(globals?.game?.modules)
    .filter((module) => module?.active !== false && (module?.id === WM5E_MODULE_ID || module?.name === WM5E_MODULE_ID))
    .map((module) => String(module?.id ?? module?.name));
}

export function inspectDependencies(globals: any = globalThis): DependencyReport {
  const foundryValue = globals?.game?.version ?? globals?.game?.release?.version ?? globals?.game?.foundry?.version;
  const systemVersion = globals?.game?.system?.version ?? globals?.game?.system?.data?.version;
  // Mirror and Next share the same Core. Only the exact Next system pair
  // requires native6 CC effects and the native6 Midi adapter.
  const native6 = foundryValue === NEXT_FOUNDRY_VERSION && systemVersion === NEXT_DND5E_VERSION;
  const foundry = exactOrUnknown(foundryValue, FOUNDRY_VERSION);
  foundry.compatible = foundry.value === FOUNDRY_VERSION || foundry.value === NEXT_FOUNDRY_VERSION;
  const expectedSystem = native6 ? NEXT_DND5E_VERSION : DND5E_VERSION;
  const dnd5e = exactOrUnknown(systemVersion, expectedSystem);
  const systemId = globals?.game?.system?.id;
  const runtimeCompatible = foundry.compatible && dnd5e.compatible && systemId === 'dnd5e';
  const modules = [conditionsStatus(globals, native6), triggerStatus(globals)];
  const midi = moduleRecord(globals, 'midi-qol');
  if (native6 && midi) modules.push({
    id: 'midi-qol', requiredVersion: NEXT_MIDI_VERSION, installedVersion: midi.version,
    available: true, compatible: midi.version === NEXT_MIDI_VERSION,
    ...(midi.version === NEXT_MIDI_VERSION ? {} : { reason: 'unsupported-native6-midi-version' }),
  });
  const missing = modules.filter((entry) => !entry.available).map((entry) => entry.id);
  const incompatible = modules.filter((entry) => entry.available && !entry.compatible).map((entry) => entry.id);
  const conflicts = conflictModules(globals);
  const runtimeProblems = [
    ...(foundry.compatible ? [] : [`Foundry ${foundry.value ?? 'unknown'} (requires ${FOUNDRY_VERSION} or 14.368)`]),
    ...(dnd5e.compatible ? [] : [`dnd5e ${dnd5e.value ?? 'unknown'} (requires ${expectedSystem} on this Core)`]),
    ...(systemId === 'dnd5e' ? [] : [`system ${systemId ?? 'unknown'} (requires dnd5e)`]),
  ];
  return {
    ready: runtimeCompatible && missing.length === 0 && incompatible.length === 0 && conflicts.length === 0,
    ...(foundry.value === undefined ? {} : { foundryVersion: foundry.value }),
    ...(dnd5e.value === undefined ? {} : { dnd5eVersion: dnd5e.value }),
    runtimeCompatible,
    missing,
    incompatible: [...incompatible, ...runtimeProblems],
    conflicts,
    modules,
  };
}

export function customConditionsApi(globals: any): any | undefined {
  return moduleRecord(globals, CUSTOM_CONDITIONS_MODULE_ID)?.api?.weaponEffects;
}

export function triggerEngineApi(globals: any): any | undefined {
  return moduleRecord(globals, TRIGGER_ENGINE_MODULE_ID)?.api;
}

export function isWeaponMasteryModule(module: any): boolean {
  return module?.id === MODULE_ID || module?.name === MODULE_ID;
}
