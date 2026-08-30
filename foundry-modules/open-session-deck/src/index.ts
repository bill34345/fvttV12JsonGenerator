import { DeckController, registerSettings } from './controller.ts';
import { createDeckApi } from './api.ts';
import { MODULE_ID, SETTINGS } from './constants.ts';

let controller: DeckController | undefined;

const api = createDeckApi(() => controller, () => Boolean(game.user?.isGM));

Hooks.once('init', () => {
  registerSettings(() => controller?.refresh());
  game.keybindings.register(MODULE_ID, 'toggleDeck', {
    name: 'OSD.Keybindings.Toggle.Name',
    hint: 'OSD.Keybindings.Toggle.Hint',
    editable: [],
    restricted: true,
    onDown: () => { if (!game.user?.isGM || !controller) return false; void controller.openLastMode(); return true; },
    onUp: () => false,
  });
  const module = game.modules?.get?.(MODULE_ID);
  if (module) module.api = api;
});

Hooks.on('getSceneControlButtons', (controls: Record<string, any>) => {
  if (!game.user?.isGM) return;
  const tokenControl = controls.tokens;
  if (!tokenControl) return;
  tokenControl.tools ??= {};
  tokenControl.tools.openSessionDeck = {
    name: 'openSessionDeck',
    title: 'OSD.Controls.Open',
    icon: 'fa-solid fa-table-columns',
    order: Object.keys(tokenControl.tools).length + 1,
    button: true,
    visible: true,
    onChange: () => { if (controller) void controller.openLastMode(); },
  };
});

Hooks.once('ready', () => {
  if (!game.user?.isGM) return;
  controller = new DeckController();
  void controller.start().catch((error) => ui.notifications?.error?.(`${game.i18n.localize('OSD.Notifications.StartFailed')}: ${String(error)}`));
});

export { api };
