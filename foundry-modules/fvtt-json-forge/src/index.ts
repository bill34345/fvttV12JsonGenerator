import { createForgeActorApplicationClass } from './application';
import { createForgeItemApplicationClass } from './itemApplication';
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

export function openForgeItem(): unknown {
  const game = (globalThis as any).game;
  assertGm(game);
  assertExactRuntime(game);
  const Application = createForgeItemApplicationClass({
    game,
    ui: (globalThis as any).ui,
    foundry: (globalThis as any).foundry,
  });
  return new Application().render(true);
}

export function initializeForgeModule(globalEnvironment: any = globalThis): void {
  if (!globalEnvironment.Hooks) return;
  let actorMenuRegistered = false;
  let itemMenuRegistered = false;
  let registrationRetryCount = 0;
  const registerForgeMenus = () => {
    if (actorMenuRegistered && itemMenuRegistered) return;
    const settings = globalEnvironment.game?.settings;
    if (!settings?.registerMenu) return;
    try {
      if (!actorMenuRegistered) {
        const actorMenuType = createForgeActorApplicationClass({
          game: globalEnvironment.game,
          ui: globalEnvironment.ui,
          foundry: globalEnvironment.foundry,
        });
        settings.registerMenu(MODULE_ID, 'forgeActor', {
          name: 'Forge Actor',
          label: 'Forge Actor',
          hint: `GM-only Actor generation for Foundry ${EXPECTED_FOUNDRY_VERSION} / dnd5e ${EXPECTED_SYSTEM_VERSION}.`,
          icon: 'fas fa-hammer',
          type: actorMenuType,
          restricted: true,
        });
        actorMenuRegistered = true;
      }
      if (!itemMenuRegistered) {
        const itemMenuType = createForgeItemApplicationClass({
          game: globalEnvironment.game,
          ui: globalEnvironment.ui,
          foundry: globalEnvironment.foundry,
        });
        settings.registerMenu(MODULE_ID, 'forgeItem', {
          name: 'Forge Item',
          label: 'Forge Item',
          hint: `GM-only bounded world Item creation for Foundry ${EXPECTED_FOUNDRY_VERSION} / dnd5e ${EXPECTED_SYSTEM_VERSION}.`,
          icon: 'fas fa-cube',
          type: itemMenuType,
          restricted: true,
        });
        itemMenuRegistered = true;
      }
    } catch (error) {
      globalEnvironment.console?.error?.('FVTT JSON Forge menus were not fully registered because ApplicationV2 was unavailable.', error);
    }
  };
  const retryMenuRegistration = () => {
    if ((actorMenuRegistered && itemMenuRegistered) || registrationRetryCount >= 20 || typeof globalEnvironment.setTimeout !== 'function') return;
    registrationRetryCount += 1;
    globalEnvironment.setTimeout(() => {
      registerForgeMenus();
      retryMenuRegistration();
    }, 100);
  };
  globalEnvironment.Hooks.once('ready', async () => {
    // Some Foundry boot paths expose ApplicationV2 only after init. Retrying
    // here keeps the GM menu available without weakening the exact runtime
    // check or adding a second entry when init already succeeded.
    registerForgeMenus();
    const game = globalEnvironment.game;
    const module = game?.modules?.get?.(MODULE_ID);
    if (module) module.api = Object.freeze({ openForgeActor, openForgeItem });
    if (game?.user?.isGM !== true) return;
    try {
      assertExactRuntime(game);
    } catch (error) {
      globalEnvironment.ui?.notifications?.warn?.(error instanceof Error ? error.message : String(error));
      return;
    }
  });
  globalEnvironment.Hooks.once('init', registerForgeMenus);
  // A late-loaded client module can miss both lifecycle hooks. Register now
  // when Foundry has already exposed its settings and ApplicationV2; the
  // closure keeps this idempotent with the normal init/ready paths.
  registerForgeMenus();
  retryMenuRegistration();
}

initializeForgeModule();
