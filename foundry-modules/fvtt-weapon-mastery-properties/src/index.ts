import type { WeaponConfiguration } from '@fvtt-json-generator/contracts/weapon-properties';
import '../e2e/fixture-macro.js';
import { createWeaponManagerApplicationClass, openWeaponManager, type WeaponMasteryPropertiesApi } from './manager.ts';
import { installE2EHarness, isHarnessEnabled, openE2EHarness, registerE2EHarnessSetting } from './e2e-harness.ts';
import { MODULE_ID, MODULE_TITLE, MODULE_VERSION } from './constants.ts';
import { WEAPON_BUILD_ID } from './build-identity.ts';
import {
  createWeaponMasteryRuntime,
  WEAPON_RUNTIME_API_VERSION,
  type PreparedWeaponUse,
  type WeaponMasteryRuntimeOptions,
  type WeaponUseRequest,
  type WeaponUseResult,
  type WeaponMasteryRuntime,
} from './runtime.ts';

let runtime: WeaponMasteryRuntime | undefined;
export type WeaponMasteryPropertiesRuntimeApi = WeaponMasteryPropertiesApi & { readonly buildId: string } & Record<string, any>;
let api: WeaponMasteryPropertiesRuntimeApi | undefined;

export interface WeaponMasteryPropertiesLifecycle {
  readonly runtime: WeaponMasteryRuntime | undefined;
  readonly api: WeaponMasteryPropertiesRuntimeApi;
}

export function isActiveGM(globals: any = globalThis): boolean {
  const user = globals?.game?.user;
  const activeGM = globals?.game?.users?.activeGM;
  return user?.isGM === true && user.active !== false && Boolean(activeGM)
    && (activeGM === user || (activeGM.id !== undefined && activeGM.id === user.id));
}

export function createWeaponMasteryPropertiesApi(
  runtimeInstance: WeaponMasteryRuntime,
  globals: any = globalThis,
): WeaponMasteryPropertiesRuntimeApi {
  const facade: WeaponMasteryPropertiesRuntimeApi = {
    version: WEAPON_RUNTIME_API_VERSION,
    moduleVersion: MODULE_VERSION,
    moduleId: MODULE_ID,
    buildId: WEAPON_BUILD_ID,
    runtime: runtimeInstance,
    configuration: (item: any) => runtimeInstance.configuration(item),
    configure: (item: any, configuration: WeaponConfiguration) => runtimeInstance.configure(item, configuration),
    dependencies: () => runtimeInstance.dependencies(),
    effects: (actor: any) => runtimeInstance.effects(actor),
    prepareUse: (subject: any, request?: WeaponUseRequest) => runtimeInstance.prepareUse(subject, request),
    startUse: (prepared: PreparedWeaponUse) => runtimeInstance.startUse(prepared),
    use: (subject: any, request?: WeaponUseRequest, dialog?: any, message?: any) => runtimeInstance.use(subject, request, dialog, message),
    attack: (subject: any, request?: WeaponUseRequest) => runtimeInstance.attack(subject, request),
    commitUse: (prepared: PreparedWeaponUse, outcome?: any) => runtimeInstance.commitUse(prepared, outcome),
    cancelUse: (prepared: PreparedWeaponUse) => runtimeInstance.cancelUse(prepared),
    criticalDamage: (input: any) => runtimeInstance.criticalDamage(input),
    openManager: () => openWeaponManager(facade, globals),
    openE2EHarness: () => openE2EHarness(globals),
  };
  return Object.freeze(facade);
}

export function attachModuleApi(gameLike: any, moduleApi: WeaponMasteryPropertiesApi & Record<string, any> | undefined): void {
  const module = gameLike?.modules?.get?.(MODULE_ID);
  if (module && moduleApi) module.api = moduleApi;
  if (gameLike && moduleApi) gameLike.fvttWeaponMasteryProperties = moduleApi;
}

export function registerWeaponMasterySettings(globals: any = globalThis): void {
  const settings = globals?.game?.settings;
  if (typeof settings?.registerMenu !== 'function') return;
  try {
    const Application = createWeaponManagerApplicationClass(undefined, globals);
    settings.registerMenu(MODULE_ID, 'weaponManager', {
      name: 'FVTTWMP.Manager.Title',
      label: 'FVTTWMP.Manager.Open',
      hint: 'FVTTWMP.Manager.Hint',
      icon: 'fa-solid fa-khanda',
      type: Application,
      restricted: true,
    });
  } catch (error) {
    globals?.console?.warn?.(`[${MODULE_ID}] manager menu unavailable`, error);
  }
}

export function initializeWeaponMasteryProperties(
  globals: any = globalThis,
  options: Omit<WeaponMasteryRuntimeOptions, 'globals' | 'openManager'> = {},
): WeaponMasteryPropertiesLifecycle | null {
  const hooks = globals?.Hooks;
  if (typeof hooks?.once !== 'function') return null;
  const runtimeOptions: WeaponMasteryRuntimeOptions = { ...options, globals };
  hooks.once('init', () => {
    registerWeaponMasterySettings(globals);
    registerE2EHarnessSetting(globals);
    if (api) attachModuleApi(globals.game, api);
  });
  if (typeof hooks?.on === 'function') {
    hooks.on('getSceneControlButtons', (controls: Record<string, any>) => {
      if (!isActiveGM(globals)) return;
      const tokenControl = controls?.tokens;
      if (!tokenControl) return;
      tokenControl.tools ??= {};
      tokenControl.tools.openWeaponMasteryManager = {
        name: 'openWeaponMasteryManager',
        title: 'FVTTWMP.Manager.Open',
        icon: 'fa-solid fa-khanda',
        order: Object.keys(tokenControl.tools).length + 1,
        button: true,
        visible: true,
        onChange: () => { void api?.openManager?.(); },
      };
      if (isHarnessEnabled(globals)) tokenControl.tools.openWeaponMasteryE2EHarness = {
        name: 'openWeaponMasteryE2EHarness',
        title: 'WMP GM E2E harness',
        icon: 'fa-solid fa-flask',
        order: Object.keys(tokenControl.tools).length + 1,
        button: true,
        visible: true,
        onChange: () => { void api?.openE2EHarness?.(); },
      };
    });
  }
  hooks.once('ready', () => {
    runtime = createWeaponMasteryRuntime(runtimeOptions);
    api = createWeaponMasteryPropertiesApi(runtime, globals);
    runtime.start();
    attachModuleApi(globals.game, api);
    if (isHarnessEnabled(globals)) installE2EHarness(globals);
    hooks.callAll?.('fvtt-weapon-mastery-properties.ready', api);
  });
  return {
    get runtime() { return runtime; },
    get api() {
      if (!api) {
        runtime ??= createWeaponMasteryRuntime(runtimeOptions);
        api = createWeaponMasteryPropertiesApi(runtime, globals);
      }
      return api;
    },
  };
}

export { createWeaponMasteryRuntime, WeaponMasteryRuntime } from './runtime.ts';
export * from './runtime.ts';
export * from './core/index.ts';
export * from './constants.ts';
export { WEAPON_BUILD_ID } from './build-identity.ts';

if (typeof (globalThis as any).Hooks?.once === 'function') initializeWeaponMasteryProperties(globalThis);
