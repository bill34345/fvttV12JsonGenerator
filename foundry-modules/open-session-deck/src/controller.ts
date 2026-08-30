import { Dnd5eAdapter, createGlobalRuntime } from './dnd5e-adapter.ts';
import { MODULE_ID, SETTINGS } from './constants.ts';
import { DeckStore } from './store.ts';
import { PanelSurface, PopoutSurface, type DeckSurfaceHandlers } from './surfaces.ts';
import type { DeckCloseMode, DeckCommand, DeckModuleApi, DeckOpenMode, DeckSnapshot, DeckTab } from './types.ts';

const EMPTY_SNAPSHOT: DeckSnapshot = {
  supported: false,
  world: { id: '', title: '' },
  system: { id: '', version: '' },
  scene: null,
  onlineUsers: 0,
  party: [],
  encounter: {
    active: false,
    round: 0,
    turn: -1,
    displayTurn: 0,
    combatants: [],
    commands: {
      previousTurn: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
      nextTurn: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
      focusCurrent: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
    },
  },
  statusOptions: [],
  rosterManager: [],
  stalePinned: [],
  staleHidden: [],
  density: 'comfortable',
  activeTab: 'party',
  refreshedAt: 0,
};

export class DeckController implements DeckModuleApi, DeckSurfaceHandlers {
  readonly adapter = new Dnd5eAdapter(createGlobalRuntime());
  readonly store = new DeckStore(EMPTY_SNAPSHOT, () => this.adapter.buildSnapshot());
  readonly panel = new PanelSurface(EMPTY_SNAPSHOT, this);
  readonly popout = new PopoutSurface(EMPTY_SNAPSHOT, this);
  #busy = new Set<string>();
  #unsubscribe?: () => void;

  async start(): Promise<void> {
    this.assertGm();
    this.#unsubscribe = this.store.subscribe((snapshot) => { this.panel.render(snapshot); this.popout.render(snapshot); });
    this.registerInvalidationHooks();
    window.addEventListener('beforeunload', () => void this.popout.close(), { once: true });
    await this.store.refreshNow();
  }

  async openPanel(): Promise<void> { this.assertGm(); await game.settings.set(MODULE_ID, SETTINGS.lastOpenMode, 'panel'); await this.panel.open(); }

  async openPopout(): Promise<void> {
    this.assertGm();
    let opened = false;
    try {
      opened = await this.popout.open();
    } catch (error) {
      ui.notifications?.error?.(`${game.i18n.localize('OSD.Notifications.PopoutFailed')}: ${String(error)}`);
      await this.openPanel();
      return;
    }
    if (!opened) {
      ui.notifications?.warn?.(game.i18n.localize('OSD.Notifications.PopupBlocked'));
      await this.openPanel();
      return;
    }
    await game.settings.set(MODULE_ID, SETTINGS.lastOpenMode, 'popout');
  }

  async openLastMode(): Promise<void> {
    const mode = game.settings.get(MODULE_ID, SETTINGS.lastOpenMode) as DeckOpenMode;
    if (mode === 'popout') await this.openPopout(); else await this.openPanel();
  }

  focusPopout(): boolean { this.assertGm(); return this.popout.focus(); }

  async close(mode: DeckCloseMode): Promise<void> {
    this.assertGm();
    if (mode === 'panel' || mode === 'all') await this.panel.close();
    if (mode === 'popout' || mode === 'all') await this.popout.close();
  }

  async closePopout(): Promise<void> { await this.close('popout'); }
  refresh(): void { this.assertGm(); this.store.invalidate(); }

  async execute(command: DeckCommand): Promise<void> {
    this.assertGm();
    const busyKey = command.targetUuid ?? command.combatUuid ?? command.tokenUuid ?? command.id;
    if (this.#busy.has(busyKey)) return;
    this.#busy.add(busyKey);
    this.panel.setBusy(busyKey, true);
    this.popout.setBusy(busyKey, true);
    try {
      const result = await this.adapter.execute(command);
      await this.store.refreshNow();
      ui.notifications?.info?.(game.i18n.localize(result.messageKey));
    } catch (error) {
      ui.notifications?.error?.(`${game.i18n.localize('OSD.Notifications.CommandFailed')}: ${String(error)}`);
      await this.store.refreshNow();
    } finally {
      this.#busy.delete(busyKey);
      this.panel.setBusy(busyKey, false);
      this.popout.setBusy(busyKey, false);
    }
  }

  async setTab(tab: DeckTab): Promise<void> { this.assertGm(); await game.settings.set(MODULE_ID, SETTINGS.activeTab, tab); this.store.invalidate(); }

  async toggleDensity(): Promise<void> {
    this.assertGm();
    const current = game.settings.get(MODULE_ID, SETTINGS.cardDensity);
    await game.settings.set(MODULE_ID, SETTINGS.cardDensity, current === 'compact' ? 'comfortable' : 'compact');
    this.store.invalidate();
  }

  private assertGm(): void { if (!game.user?.isGM) throw new Error('Open Session Deck is available to GMs only.'); }

  private registerInvalidationHooks(): void {
    for (const hook of [
      'createActor', 'updateActor', 'deleteActor',
      'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect',
      'createCombat', 'updateCombat', 'deleteCombat',
      'createCombatant', 'updateCombatant', 'deleteCombatant',
      'createToken', 'updateToken', 'deleteToken',
      'updateUser', 'canvasReady', 'canvasTearDown',
    ]) Hooks.on(hook, () => {
      if (!game.user?.isGM) {
        void this.panel.close();
        void this.popout.close();
        return;
      }
      this.store.invalidate();
    });
  }
}

export function registerSettings(onChange: () => void): void {
  game.settings.register(MODULE_ID, SETTINGS.pinnedActors, { scope: 'world', config: false, type: Array, default: [], restricted: true, onChange });
  game.settings.register(MODULE_ID, SETTINGS.hiddenActors, { scope: 'world', config: false, type: Array, default: [], restricted: true, onChange });
  game.settings.register(MODULE_ID, SETTINGS.lastOpenMode, { scope: 'client', config: false, type: String, default: 'panel', choices: { panel: 'OSD.Mode.Panel', popout: 'OSD.Mode.Popout' }, onChange });
  game.settings.register(MODULE_ID, SETTINGS.cardDensity, { scope: 'client', config: false, type: String, default: 'comfortable', choices: { comfortable: 'OSD.Density.Comfortable', compact: 'OSD.Density.Compact' }, onChange });
  game.settings.register(MODULE_ID, SETTINGS.activeTab, { scope: 'client', config: false, type: String, default: 'party', choices: { party: 'OSD.Party.Title', encounter: 'OSD.Encounter.Title' }, onChange });
}
