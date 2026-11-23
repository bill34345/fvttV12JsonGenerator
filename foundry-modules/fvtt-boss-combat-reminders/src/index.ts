import { useFromCombatant } from './native-use.ts';
import type { NativeSceneCanvas } from './native-use.ts';
import { configureActor } from './setup.ts';
import type { NativeDialog } from './setup.ts';
import { CombatReminders } from './runtime.ts';
import { NS } from './types.ts';
import type { NativeActor, NativeCombat, NativeSaveMessage } from './types.ts';
import { createRemindersWindow } from './window.ts';

declare const Hooks: { on: (hook: string, listener: (...args: any[]) => void) => void; once: (hook: string, listener: () => void) => void };
declare const game: {
  system: { id: string };
  user?: { isGM: boolean; isActiveGM: boolean };
  combats: { active?: NativeCombat };
  messages: { get(id: string): NativeSaveMessage | undefined };
  i18n: { localize(key: string): string; format(key: string, data: object): string };
};
declare const foundry: { applications: { api: { ApplicationV2: Parameters<typeof createRemindersWindow>[0]; DialogV2: NativeDialog } } };
declare const ui: { notifications: { error(message: string): void } };
declare const canvas: NativeSceneCanvas;
declare const ChatMessage: { getSpeaker(options: { scene?: unknown; actor: unknown; token?: unknown }): unknown };

Hooks.once('ready', () => {
  if (game.system.id !== 'dnd5e' || !game.user?.isGM) return;
  const format = (key: string, data?: Record<string, string | number>) =>
    data ? game.i18n.format(`${NS}.${key}`, data) : game.i18n.localize(`${NS}.${key}`);
  const reminders = createRemindersWindow(foundry.applications.api.ApplicationV2, format, message => ui.notifications.error(message));
  const runtime = new CombatReminders({
    isActiveGM: () => Boolean(game.user?.isActiveGM),
    combat: () => game.combats.active,
    message: id => game.messages.get(id),
    useActivity: (combat, combatant, activity, event) =>
      useFromCombatant(combat, combatant, activity, event, canvas, data => ChatMessage.getSpeaker(data)),
    format,
  }, reminders);
  Hooks.on('combatTurnChange', (combat, previous, current) => runtime.turnChanged(combat, previous, current));
  Hooks.on('getHeaderControlsApplicationV2', (sheet, controls) => {
    const actor = sheet.document as NativeActor | undefined;
    if (actor?.documentName !== 'Actor' || !actor.system.isNPC) return;
    controls.push({
      action: 'boss-combat-reminders',
      label: format('Config.Open'),
      icon: 'fa-solid fa-dragon',
      onClick: () => void configureActor(foundry.applications.api.DialogV2, actor, format).catch(console.error),
    });
  });
  runtime.seedHealth();
  Hooks.on('createCombatant', () => runtime.seedHealth());
  Hooks.on('updateActor', (actor, changed, options) => {
    if (changed.system?.attributes?.hp) runtime.healthChanged(actor, options.dnd5e?.hp);
  });
  Hooks.on('createChatMessage', message => runtime.saveCreated(message));
  Hooks.on('dnd5e.postUseActivity', activity => runtime.activityUsed(activity));
  Hooks.on('canvasReady', () => {
    runtime.clear();
    runtime.seedHealth();
  });
  Hooks.on('updateChatMessage', message => runtime.saveChanged(message));
  Hooks.on('deleteCombat', combat => runtime.clear(combat));
  Hooks.on('updateCombat', combat => {
    if (!combat.active || !combat.started) runtime.clear(combat);
  });
});
