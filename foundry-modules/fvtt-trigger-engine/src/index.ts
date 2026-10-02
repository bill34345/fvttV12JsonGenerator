import { createTriggerApi, type TriggerEngineApi } from './api.ts';
import { MODULE_ID, TRIGGER_MANAGER_CONTROL_NAME, TRIGGER_MANAGER_MENU_KEY } from './constants.ts';
import { createTriggerManagerApplicationClass, openTriggerManager } from './manager.ts';
import { TriggerEngineRuntime } from './runtime.ts';
import { FoundryTriggerStorage, TRIGGER_SETTING_KEY } from './storage.ts';
import { DEFAULT_TRIGGER_STORE } from './schema.ts';

let runtime: TriggerEngineRuntime | undefined;
let api: TriggerEngineApi | undefined;

export interface TriggerEngineLifecycle {
  readonly runtime: TriggerEngineRuntime | undefined;
  readonly api: TriggerEngineApi;
}

export function registerTriggerEngineSettings(
  globals: any = globalThis,
  getRuntime: () => TriggerEngineRuntime | undefined = () => runtime,
): void {
  const settings = globals.game?.settings;
  if (typeof settings?.register === 'function') {
    settings.register(MODULE_ID, TRIGGER_SETTING_KEY, {
      name: 'FVTTTRIGGER.Settings.Triggers.Name',
      hint: 'FVTTTRIGGER.Settings.Triggers.Hint',
      scope: 'world',
      config: false,
      type: Object,
      default: DEFAULT_TRIGGER_STORE,
      onChange: (value: unknown) => { getRuntime()?.applySettingValue(value); },
    });
  }
  if (typeof settings?.registerMenu === 'function') {
    try {
      const Application = createTriggerManagerApplicationClass(undefined, globals);
      settings.registerMenu(MODULE_ID, TRIGGER_MANAGER_MENU_KEY, {
        name: 'FVTTTRIGGER.Manager.MenuName',
        label: 'FVTTTRIGGER.Manager.MenuLabel',
        hint: 'FVTTTRIGGER.Manager.MenuHint',
        icon: 'fa-solid fa-bolt',
        type: Application,
        restricted: true,
      });
    } catch (error) {
      // The menu is optional during tests or very early Foundry bootstrap;
      // the ready hook can still expose the CRUD API.
      console.warn(`[${MODULE_ID}] manager menu unavailable during init`, error);
    }
  }
}

export function isActiveGM(globals: any = globalThis): boolean {
  const user = globals.game?.user;
  if (user?.isGM !== true || user.active === false) return false;
  const activeGM = globals.game?.users?.activeGM;
  if (!activeGM) return false;
  return activeGM === user || (activeGM.id !== undefined && user.id !== undefined && activeGM.id === user.id);
}

export function isSupportedTriggerRuntime(globals: any = globalThis): boolean {
  const game = globals.game;
  return game?.system?.id === 'dnd5e' && (
    (game.version === '14.364' && game.system.version === '5.3.3')
    || (game.version === '14.368' && game.system.version === '6.0.5')
  );
}

export function initializeTriggerEngine(globals: any = globalThis): TriggerEngineLifecycle | null {
  const hooks = globals.Hooks;
  if (typeof hooks?.once !== 'function') return null;

  api = createTriggerApi(
    () => runtime,
    () => runtime?.isActiveGM() ?? isActiveGM(globals),
    () => api ? openTriggerManager(api, () => runtime?.isActiveGM() ?? isActiveGM(globals), globals) : undefined,
  );

  hooks.once('init', () => {
    registerTriggerEngineSettings(globals);
    attachModuleApi(globals.game, api);
  });
  if (typeof hooks.on === 'function') {
    hooks.on('getSceneControlButtons', (controls: Record<string, any>) => {
      if (!isActiveGM(globals)) return;
      const tokenControl = controls?.tokens;
      if (!tokenControl) return;
      tokenControl.tools ??= {};
      tokenControl.tools[TRIGGER_MANAGER_CONTROL_NAME] = {
        name: TRIGGER_MANAGER_CONTROL_NAME,
        title: 'FVTTTRIGGER.Manager.MenuLabel',
        icon: 'fa-solid fa-bolt',
        order: Object.keys(tokenControl.tools).length + 1,
        button: true,
        visible: true,
        onChange: () => { void api?.openManager(); },
      };
    });
  }
  hooks.once('ready', async () => {
    if (!isSupportedTriggerRuntime(globals)) {
      if (isActiveGM(globals)) globals.ui?.notifications?.error?.('Trigger Engine supports only Foundry 14.364 / dnd5e 5.3.3 or Foundry 14.368 / dnd5e 6.0.5.');
      return;
    }
    runtime = new TriggerEngineRuntime({ globals, storage: new FoundryTriggerStorage(globals.game) });
    try {
      await runtime.start();
      attachModuleApi(globals.game, api);
      hooks.callAll?.('fvtt-trigger-engine.ready', api);
    } catch (error) {
      console.error(`[${MODULE_ID}] runtime startup failed`, error);
    }
  });
  return { get runtime() { return runtime; }, api };
}

export function attachModuleApi(gameLike: any, moduleApi: TriggerEngineApi | undefined): void {
  const module = gameLike?.modules?.get?.(MODULE_ID);
  if (module && moduleApi) module.api = moduleApi;
}

export { createTriggerApi } from './api.ts';
export { createTriggerManagerApplicationClass, openTriggerManager } from './manager.ts';
export { TriggerEngineRuntime } from './runtime.ts';
export * from './evaluator.ts';
export * from './schema.ts';
export * from './storage.ts';
export * from './types.ts';

if (typeof (globalThis as any).Hooks?.once === 'function') initializeTriggerEngine(globalThis);
