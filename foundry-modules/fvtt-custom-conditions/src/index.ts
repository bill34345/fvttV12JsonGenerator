import { genericConditionsSupported } from './runtime-compatibility.ts';
import { createConditionsApi, type CustomConditionsApi } from './api.ts';
import { CONDITION_MANAGER_CONTROL_NAME, CONDITION_MANAGER_MENU_KEY, MODULE_ID } from './constants.ts';
import { createConditionManagerApplicationClass, openConditionManager } from './manager.ts';
import { ConditionRuntime, registerConditionMappings } from './runtime.ts';

let runtime: ConditionRuntime | undefined;
let api: CustomConditionsApi | undefined;

export function isActiveGM(globals: any = globalThis): boolean {
  const user = globals.game?.user;
  const activeGM = globals.game?.users?.activeGM;
  return user?.isGM === true && user.active !== false && Boolean(activeGM) && (activeGM === user || activeGM?.id === user?.id);
}

export function registerCustomConditionsSettings(globals: any = globalThis): void {
  const settings = globals.game?.settings;
  if (typeof settings?.register === 'function') {
    settings.register(MODULE_ID, 'injuryEnabled', {
      name: 'FVTTCONDITIONS.Injury.Enabled', hint: 'FVTTCONDITIONS.Injury.EnabledHint',
      scope: 'world', config: true, type: Boolean, default: false,
    });
    settings.register(MODULE_ID, 'injuryManageNpcs', {
      name: 'FVTTCONDITIONS.Injury.ManageNpcs', hint: 'FVTTCONDITIONS.Injury.ManageNpcsHint',
      scope: 'world', config: true, type: Boolean, default: false,
    });
    settings.register(MODULE_ID, 'injurySettingsImported', {
      name: 'FVTTCONDITIONS.Injury.Imported', scope: 'world', config: false, type: Boolean, default: false,
    });
  }
  if (typeof settings?.registerMenu !== 'function') return;
  try {
    const Application = createConditionManagerApplicationClass(undefined, globals);
    settings.registerMenu(MODULE_ID, CONDITION_MANAGER_MENU_KEY, {
      name: 'FVTTCONDITIONS.Manager.Title', label: 'FVTTCONDITIONS.Manager.Open',
      hint: 'FVTTCONDITIONS.Manager.Hint', icon: 'fa-solid fa-flask', type: Application, restricted: true,
    });
  } catch (error) { globals.console?.warn?.(`[${MODULE_ID}] manager menu unavailable`, error); }
}

export function initializeCustomConditions(globals: any = globalThis): { readonly runtime: ConditionRuntime | undefined; readonly api: CustomConditionsApi } | null {
  const hooks = globals.Hooks;
  if (typeof hooks?.once !== 'function') return null;
  api = createConditionsApi(
    runtime ?? new ConditionRuntime(globals, () => isActiveGM(globals)),
    (context) => api ? openConditionManager(api, globals, context) : undefined,
  );
  hooks.once('init', () => {
    if (genericConditionsSupported(globals.game)) {
      registerConditionMappings(globals);
    }
    registerCustomConditionsSettings(globals);
    attachModuleApi(globals.game, api);
  });
  if (typeof hooks.on === 'function') {
    hooks.on('getSceneControlButtons', (controls: Record<string, any>) => {
      if (!isActiveGM(globals)) return;
      const tokenControl = controls?.tokens;
      if (!tokenControl) return;
      tokenControl.tools ??= {};
      tokenControl.tools[CONDITION_MANAGER_CONTROL_NAME] = {
        name: CONDITION_MANAGER_CONTROL_NAME, title: 'FVTTCONDITIONS.Manager.Open', icon: 'fa-solid fa-flask',
        order: Object.keys(tokenControl.tools).length + 1, button: true, visible: true,
        onChange: () => { void api?.openManager(); },
      };
    });
  }
  hooks.once('ready', () => {
    runtime = new ConditionRuntime(globals, () => isActiveGM(globals));
    runtime.start();
    api = createConditionsApi(runtime, (context) => api ? openConditionManager(api, globals, context) : undefined);
    attachModuleApi(globals.game, api);
  });
  return { get runtime() { return runtime; }, api };
}

export function attachModuleApi(gameLike: any, moduleApi: CustomConditionsApi | undefined): void {
  const module = gameLike?.modules?.get?.(MODULE_ID);
  if (module && moduleApi) module.api = moduleApi;
}

export { createConditionsApi } from './api.ts';
export { ConditionRuntime } from './runtime.ts';
export { createWeaponEffectsApi } from './api.ts';
export { WeaponEffectRuntime, changesForWeaponEffect } from './weapon-effects.ts';
export * from '@fvtt-json-generator/contracts/conditions';
export * from '@fvtt-json-generator/contracts/weapon-effects';

if (typeof (globalThis as any).Hooks?.once === 'function') initializeCustomConditions(globalThis);
