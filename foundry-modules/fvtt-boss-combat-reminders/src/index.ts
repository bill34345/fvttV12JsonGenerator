import { useFromCombatant } from './native-use.ts';
import type { NativeSceneCanvas } from './native-use.ts';
import { configureActor } from './setup.ts';
import type { NativeDialog } from './setup.ts';
import { DefeatReminders } from './defeat.ts';
import { createDefeatCompatibility } from './compatibility.ts';
import { clearBloodiedFrenzy } from './bloodied-effect.ts';
import { BloodiedAttacks, sanitizeBloodiedAttackUsage } from './bloodied-attacks.ts';
import { reconcileBloodiedMarkers } from './bloodied-status.ts';
import { CombatReminders } from './runtime.ts';
import { MODULE_ID, NS } from './types.ts';
import type { NativeActor, NativeCombat, NativeEffect, NativeSaveMessage } from './types.ts';
import { createRemindersWindow } from './window.ts';

type AutoDefeated = (hp: number | undefined, actor: NativeActor, token: unknown) => Promise<unknown>;
declare const Hooks: {
  on: (hook: string, listener: (...args: any[]) => unknown) => void;
  once: (hook: string, listener: () => void) => void;
};
declare const game: {
  system: { id: string };
  user?: { isGM: boolean; isActiveGM: boolean; targets?: Iterable<{
    document: { uuid: string; name: string; texture?: { src?: string }; actor?: NativeActor };
  }> };
  users: { activeGM?: unknown };
  combats: { active?: NativeCombat };
  modules: { get(id: string): { active: boolean; version: string; api?: object } | undefined };
  MonksCombatDetails?: { AutoDefeated?: AutoDefeated };
  messages: { get(id: string): NativeSaveMessage | undefined };
  settings: { get(scope: 'dnd5e', key: 'bloodied'): string };
  i18n: { localize(key: string): string; format(key: string, data: object): string };
};
declare const CONFIG: {
  specialStatusEffects?: { DEFEATED?: string };
  ActiveEffect?: { documentClass?: { ID?: { BLOODIED?: string } } };
};
declare const foundry: { applications: { api: { ApplicationV2: Parameters<typeof createRemindersWindow>[0]; DialogV2: NativeDialog } } };
declare const ui: { notifications: { error(message: string): void; warn(message: string): void; info(message: string): void } };
declare const canvas: NativeSceneCanvas;
declare const ChatMessage: { getSpeaker(options: { scene?: unknown; actor: unknown; token?: unknown }): unknown };
declare function fromUuidSync(uuid: string): { documentName?: string; actor?: NativeActor } | null;

let reopenPending: (() => void) | undefined;
Hooks.on('getSceneControlButtons', controls => {
  if (game.system.id !== 'dnd5e' || !game.user?.isGM || !controls.tokens?.tools) return;
  const tools = controls.tokens.tools;
  tools[MODULE_ID] = {
    name: MODULE_ID,
    title: `${NS}.Defeat.Reopen`,
    icon: 'fa-solid fa-skull',
    order: Object.keys(tools).length + 1,
    button: true,
    onChange: () => reopenPending?.(),
  };
});

Hooks.once('ready', () => {
  if (game.system.id !== 'dnd5e') return;
  const active = (id: string) => Boolean(game.modules.get(id)?.active);
  const defeatedStatus = () => CONFIG.specialStatusEffects?.DEFEATED ?? 'dead';
  const format = (key: string, data?: Record<string, string | number>) =>
    data ? game.i18n.format(`${NS}.${key}`, data) : game.i18n.localize(`${NS}.${key}`);
  const reminders = createRemindersWindow(foundry.applications.api.ApplicationV2, format, message => ui.notifications.error(message));
  const platform: ConstructorParameters<typeof CombatReminders>[0] = {
    isActiveGM: () => Boolean(game.user?.isActiveGM),
    combat: () => game.combats.active,
    automaticBloodied: () => game.settings.get('dnd5e', 'bloodied') !== 'none',
    message: id => game.messages.get(id),
    notify: message => ui.notifications.info(message),
    useActivity: (combat, combatant, activity, event, options) =>
      useFromCombatant(combat, combatant, activity, event, canvas, data => ChatMessage.getSpeaker(data),
        Boolean(options?.pendingDefeat && active('midi-qol'))),
    format,
  };
  const compatibility = createDefeatCompatibility({ active, pending: actor => Boolean(defeat.pending(actor)) });
  const defeat = new DefeatReminders(platform, reminders, defeatedStatus, async (actor, entries) => {
    compatibility.skipAutomatic(actor);
    await actor.toggleStatusEffect?.(defeatedStatus(), { active: true, overlay: true });
    for (const entry of entries) if (!entry.defeated) await entry.update?.({ defeated: true });
    await compatibility.replayEffects(actor);
  }, item => compatibility.automatic(item));

  // Combat Details has its own preUpdateActor listener, before the HP update reaches the server.
  const monk = game.modules.get('monks-combat-details')?.version === '14.03' && active('monks-combat-details')
    ? game.MonksCombatDetails : undefined;
  const autoDefeated = monk?.AutoDefeated;
  if (monk && autoDefeated) {
    monk.AutoDefeated = async function (hp, actor, token) {
      if (game.users.activeGM && defeat.anticipating(actor, hp)) return;
      return autoDefeated.call(this, hp, actor, token);
    };
  }

  Hooks.on('preUpdateActor', (actor, changed) => {
    if (game.users.activeGM) defeat.prepare(actor, changed);
  });
  Hooks.on('preUpdateCombatant', (entry, changed) => {
    if (changed.defeated === true && entry.actor && defeat.pending(entry.actor)) return false;
  });
  Hooks.on('preCreateActiveEffect', (effect, data, options) => {
    if (defeat.holdStatus(effect, data)) return false;
    compatibility.markStatusCreation(effect, data, options);
  });
  Hooks.on('preUpdateActiveEffect', (effect, data, options) => {
    if ((data.statuses || data.disabled === false) && defeat.holdStatus(effect, data)) return false;
    if (data.disabled === true && compatibility.holdEffectRemoval(effect, options)) return false;
  });
  Hooks.on('preDeleteActiveEffect', (effect, options) => {
    if (compatibility.holdEffectRemoval(effect, options)) return false;
  });
  Hooks.on('updateActor', (actor, changed) => {
    if (!changed.system?.attributes?.hp) return;
    if (game.user?.isActiveGM) {
      void clearBloodiedFrenzy(actor).catch(console.error);
      // dnd5e stops removing its existing marker when automatic marking is disabled.
      const nativeMarker = platform.automaticBloodied?.() === false ? CONFIG.ActiveEffect?.documentClass?.ID?.BLOODIED : undefined;
      void reconcileBloodiedMarkers(actor, nativeMarker).catch(console.error);
    }
    compatibility.protectTarget(actor);
    defeat.observe(actor);
  });
  const protectPendingTargets = () => {
    for (const { actor } of platform.combat()?.combatants ?? []) {
      if (actor && defeat.pending(actor)) compatibility.protectTarget(actor);
    }
  };
  Hooks.on('canvasReady', protectPendingTargets);
  protectPendingTargets();
  Hooks.on('dnd5e.preCreateUsageMessage', sanitizeBloodiedAttackUsage);

  if (!game.user?.isGM) return;
  reopenPending = () => defeat.showPending();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = { reopenPending };

  Hooks.on('preDeleteCombat', combat => defeat.allowEnd(combat, message => ui.notifications.warn(message)));
  Hooks.on('preUpdateCombat', (combat, changes) => {
    if (combat.started && (changes.round === 0 || changes.active === false)) {
      return defeat.allowEnd(combat, message => ui.notifications.warn(message));
    }
  });

  const runtime = new CombatReminders(platform, reminders);
  const attacks = new BloodiedAttacks(format, foundry.applications.api.DialogV2, () =>
    [...(game.user?.targets ?? [])].flatMap(({ document }) => document.actor ? [{
      token: document.uuid, name: document.name, actor: document.actor.uuid, ac: null, img: document.texture?.src,
    }] : []), uuid => {
    const token = fromUuidSync(uuid);
    return token?.documentName === 'Token' ? token.actor : undefined;
  }, () => {
    const combat = game.combats.active;
    if (game.user?.isActiveGM && combat?.started) {
      const { round, turn } = combat.current;
      return `${combat.id}:${round}:${turn}`;
    }
  }, message => ui.notifications.error(message));
  const refreshBloodied = (actor: NativeActor) => {
    attacks.refresh(actor);
    runtime.bloodiedStateChanged(actor);
    if (game.user?.isActiveGM) void clearBloodiedFrenzy(actor).catch(console.error);
  };

  Hooks.on('dnd5e.preUseActivity', (activity, use, dialog, message) => attacks.preUse(activity, use, dialog, message));
  Hooks.on('dnd5e.preRollDamage', (roll, dialog, message) => attacks.preRollDamage(roll, dialog, message));
  Hooks.on('dnd5e.renderChatMessage', (message, html) => attacks.renderMessage(message, html));
  Hooks.on('deleteChatMessage', message => attacks.forgetMessage(message.id));
  Hooks.on('renderApplicationV2', (sheet, html) => {
    if (sheet.document?.documentName === 'Actor') attacks.renderSheet(sheet.document, html);
  });
  Hooks.on('targetToken', user => {
    if (user === game.user) attacks.refresh();
  });
  for (const name of ['createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
    Hooks.on(name, (effect: NativeEffect, changed: { statuses?: unknown }) => {
      const actor = effect.target ?? (effect.parent?.documentName === 'Actor' ? effect.parent as NativeActor : undefined);
      if (actor?.system.isNPC && ([...(effect.statuses ?? [])].includes('bloodied')
        || (name === 'updateActiveEffect' && changed.statuses !== undefined))) {
        queueMicrotask(() => refreshBloodied(actor));
      }
    });
  }
  Hooks.on('combatTurnChange', (combat, previous, current) => {
    runtime.turnChanged(combat, previous, current);
    attacks.refresh();
  });
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
    if (changed.system?.attributes?.hp) {
      runtime.healthChanged(actor, options.dnd5e?.hp);
      attacks.refresh(actor);
    }
  });
  Hooks.on('createChatMessage', message => {
    runtime.saveCreated(message);
    attacks.rememberAttack(message);
    if (message.type === 'attack') queueMicrotask(() => attacks.refresh(message.getAssociatedActor() ?? undefined));
  });
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
  defeat.showPending();
});
