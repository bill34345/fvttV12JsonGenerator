import { createForgeActorApplicationClass } from './application';
import {
  assertExactRuntime,
  assertGm,
  EXPECTED_FOUNDRY_VERSION,
  EXPECTED_SYSTEM_VERSION,
  MODULE_ID,
} from './runtime';

export function openForgeActor(): unknown {
  const game = (globalThis as any).game;
  assertGm(game);
  assertExactRuntime(game);
  const Application = createForgeActorApplicationClass({
    game,
    ui: (globalThis as any).ui,
    foundry: (globalThis as any).foundry,
  });
  return new Application().render(true);
}

export function initializeForgeModule(globalEnvironment: any = globalThis): void {
  if (!globalEnvironment.Hooks) return;
  let menuRegistered = false;
  let registrationRetryCount = 0;
  const registerForgeMenu = () => {
    if (menuRegistered) return;
    const settings = globalEnvironment.game?.settings;
    if (!settings?.registerMenu) return;
    try {
      const menuType = createForgeActorApplicationClass({
        game: globalEnvironment.game,
        ui: globalEnvironment.ui,
        foundry: globalEnvironment.foundry,
      });
      settings.registerMenu(MODULE_ID, 'forgeActor', {
        name: 'Forge Actor',
        label: 'Forge Actor',
        hint: `GM-only Actor generation for Foundry ${EXPECTED_FOUNDRY_VERSION} / dnd5e ${EXPECTED_SYSTEM_VERSION}.`,
        icon: 'fas fa-hammer',
        type: menuType,
        restricted: true,
      });
      menuRegistered = true;
    } catch (error) {
      globalEnvironment.console?.error?.('FVTT JSON Forge menu was not registered because ApplicationV2 was unavailable.', error);
    }
  };
  const retryMenuRegistration = () => {
    if (menuRegistered || registrationRetryCount >= 20 || typeof globalEnvironment.setTimeout !== 'function') return;
    registrationRetryCount += 1;
    globalEnvironment.setTimeout(() => {
      registerForgeMenu();
      retryMenuRegistration();
    }, 100);
  };
  globalEnvironment.Hooks.once('ready', async () => {
    // Some Foundry boot paths expose ApplicationV2 only after init. Retrying
    // here keeps the GM menu available without weakening the exact runtime
    // check or adding a second entry when init already succeeded.
    registerForgeMenu();
    const game = globalEnvironment.game;
    const module = game?.modules?.get?.(MODULE_ID);
    if (module) module.api = Object.freeze({ openForgeActor });
    if (game?.user?.isGM !== true) return;
    try {
      assertExactRuntime(game);
    } catch (error) {
      globalEnvironment.ui?.notifications?.warn?.(error instanceof Error ? error.message : String(error));
      return;
    }
  });
  globalEnvironment.Hooks.once('init', registerForgeMenu);
  // A late-loaded client module can miss both lifecycle hooks. Register now
  // when Foundry has already exposed its settings and ApplicationV2; the
  // closure keeps this idempotent with the normal init/ready paths.
  registerForgeMenu();
  retryMenuRegistration();
}

initializeForgeModule();
