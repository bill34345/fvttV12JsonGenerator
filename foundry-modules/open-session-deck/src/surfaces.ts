import { POPOUT_NAME, STYLESHEET_PATH, TEMPLATE_PATH } from './constants.ts';
import type { DeckCommand, DeckSnapshot } from './types.ts';

export interface DeckSurfaceHandlers {
  execute(command: DeckCommand): Promise<void>;
  openPanel(): Promise<void>;
  openPopout(): Promise<void>;
  closePopout(): Promise<void>;
  setTab(tab: 'party' | 'encounter'): Promise<void>;
  toggleDensity(): Promise<void>;
}

function viewContext(snapshot: DeckSnapshot, isPopout: boolean): Record<string, unknown> {
  return {
    ...snapshot,
    isPopout,
    hasParty: snapshot.party.length > 0,
    hasEncounterCards: snapshot.encounter.combatants.length > 0,
    partyTabActive: snapshot.activeTab === 'party',
    encounterTabActive: snapshot.activeTab === 'encounter',
    compact: snapshot.density === 'compact',
    staleCount: snapshot.stalePinned.length + snapshot.staleHidden.length,
  };
}

export class PanelSurface {
  #app: any;
  #snapshot: DeckSnapshot;
  #busy = new Set<string>();

  constructor(initial: DeckSnapshot, private readonly handlers: DeckSurfaceHandlers) {
    this.#snapshot = initial;
    this.#app = this.#createApplication();
  }

  get opened(): boolean { return Boolean(this.#app?.rendered); }

  async open(): Promise<void> { await this.#app.render({ force: true }); }
  async close(): Promise<void> { if (this.opened) await this.#app.close(); }

  render(snapshot: DeckSnapshot): void {
    this.#snapshot = snapshot;
    if (this.opened) void this.#app.render({ force: true }).catch((error: unknown) => {
      ui.notifications?.error?.(`${game.i18n.localize('OSD.Notifications.PanelFailed')}: ${String(error)}`);
    });
  }

  setBusy(targetKey: string, busy: boolean): void {
    if (busy) this.#busy.add(targetKey); else this.#busy.delete(targetKey);
    setBusyWithin(this.#app?.element, targetKey, busy);
  }

  #createApplication(): any {
    const foundryGlobal = (globalThis as any).foundry;
    const ApplicationV2 = foundryGlobal?.applications?.api?.ApplicationV2;
    const HandlebarsApplicationMixin = foundryGlobal?.applications?.api?.HandlebarsApplicationMixin;
    if (!ApplicationV2 || typeof HandlebarsApplicationMixin !== 'function') throw new Error('Foundry 14 ApplicationV2 is unavailable.');
    const surface = this;
    return new (class OpenSessionDeckApplication extends HandlebarsApplicationMixin(ApplicationV2) {
      static DEFAULT_OPTIONS = {
        id: 'open-session-deck-panel',
        classes: ['open-session-deck', 'osd-panel-window'],
        window: { title: 'OSD.Title', icon: 'fa-solid fa-table-columns', resizable: true, minimizable: true },
        position: { width: 1100, height: 760 },
      };

      static PARTS = { main: { template: TEMPLATE_PATH } };

      async _prepareContext(): Promise<Record<string, unknown>> { return viewContext(surface.#snapshot, false); }

      _onRender(context: unknown, options: unknown): void {
        super._onRender(context, options);
        bindDeckRoot(this.element, surface.handlers);
        applyBusyWithin(this.element, surface.#busy);
      }
    })();
  }
}

export class PopoutSurface {
  #window: Window | null = null;
  #snapshot: DeckSnapshot;
  #renderGeneration = 0;
  #busy = new Set<string>();

  constructor(initial: DeckSnapshot, private readonly handlers: DeckSurfaceHandlers) { this.#snapshot = initial; }

  get opened(): boolean { return Boolean(this.#window && !this.#window.closed); }

  async open(): Promise<boolean> {
    if (this.opened) { this.#window!.focus(); return true; }
    const popup = window.open('', POPOUT_NAME, 'popup=yes,width=1280,height=800,resizable=yes,scrollbars=yes');
    if (!popup) return false;
    this.#window = popup;
    try {
      popup.document.title = game.i18n.localize('OSD.Title');
      popup.document.documentElement.lang = String(game.i18n.lang ?? 'en');
      popup.document.documentElement.className = document.documentElement.className;
      popup.document.head.replaceChildren();
      const meta = popup.document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width,initial-scale=1';
      popup.document.head.append(meta);
      for (const source of document.head.querySelectorAll('link[rel="stylesheet"], style')) popup.document.head.append(source.cloneNode(true));
      if (![...popup.document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some((link) => link.href.includes(STYLESHEET_PATH))) {
        const stylesheet = popup.document.createElement('link');
        stylesheet.rel = 'stylesheet';
        stylesheet.href = (globalThis as any).foundry?.utils?.getRoute?.(STYLESHEET_PATH) ?? STYLESHEET_PATH;
        popup.document.head.append(stylesheet);
      }
      popup.document.body.className = `${document.body.className} open-session-deck osd-popout-body`;
      popup.document.body.innerHTML = '<main id="open-session-deck-popout" class="osd-popout-root" aria-live="polite"></main>';
      popup.addEventListener('beforeunload', () => { if (this.#window === popup) this.#window = null; }, { once: true });
      await this.#render();
      popup.focus();
      return true;
    } catch (error) {
      this.#window = null;
      try { popup.close(); } catch { /* same-origin access was lost */ }
      throw error;
    }
  }

  focus(): boolean { if (!this.opened) return false; this.#window!.focus(); return true; }
  async close(): Promise<void> { if (this.opened) this.#window!.close(); this.#window = null; }

  render(snapshot: DeckSnapshot): void {
    this.#snapshot = snapshot;
    if (this.opened) void this.#render().catch((error) => {
      ui.notifications?.error?.(`${game.i18n.localize('OSD.Notifications.PopoutFailed')}: ${String(error)}`);
      void this.handlers.openPanel();
    });
  }
  setBusy(targetKey: string, busy: boolean): void {
    if (busy) this.#busy.add(targetKey); else this.#busy.delete(targetKey);
    setBusyWithin(this.#root(), targetKey, busy);
  }

  async #render(): Promise<void> {
    const generation = ++this.#renderGeneration;
    const popup = this.#window;
    const root = this.#root();
    if (!popup || !root) return;
    const renderer = (globalThis as any).foundry?.applications?.handlebars?.renderTemplate;
    if (typeof renderer !== 'function') throw new Error('Foundry Handlebars renderer is unavailable.');
    const html = await renderer(TEMPLATE_PATH, viewContext(this.#snapshot, true));
    if (generation !== this.#renderGeneration || popup.closed || popup !== this.#window) return;
    root.innerHTML = html;
    bindDeckRoot(root, this.handlers);
    applyBusyWithin(root, this.#busy);
  }

  #root(): HTMLElement | null {
    if (!this.opened) return null;
    try { return this.#window!.document.getElementById('open-session-deck-popout'); }
    catch {
      this.#window = null;
      ui.notifications?.warn?.(game.i18n.localize('OSD.Notifications.PopoutDetached'));
      void this.handlers.openPanel();
      return null;
    }
  }
}

export function bindDeckRoot(root: HTMLElement | null, handlers: DeckSurfaceHandlers): void {
  if (!root || root.dataset.osdBound === 'true') return;
  root.dataset.osdBound = 'true';
  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest('button[data-osd-action],button[data-osd-command]') as HTMLButtonElement | null;
    if (!button || button.disabled) return;
    event.preventDefault();
    const action = button.dataset.osdAction;
    if (action === 'open-popout') void handlers.openPopout();
    else if (action === 'open-panel') void handlers.openPanel();
    else if (action === 'close-popout') void handlers.closePopout();
    else if (action === 'party-tab' || action === 'encounter-tab') void handlers.setTab(action === 'party-tab' ? 'party' : 'encounter');
    else if (action === 'toggle-density') void handlers.toggleDensity();
    else if (action === 'focus-current') root.querySelector<HTMLElement>('[data-current="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else if (button.dataset.osdCommand) void handlers.execute(commandFromButton(button));
  });
}

function commandFromButton(button: HTMLButtonElement): DeckCommand {
  const id = button.dataset.osdCommand as DeckCommand['id'];
  const card = button.closest<HTMLElement>('[data-actor-card]');
  const amountInput = card?.querySelector<HTMLInputElement>('[data-osd-amount]');
  const statusSelect = card?.querySelector<HTMLSelectElement>('[data-osd-status]');
  return {
    id,
    targetUuid: button.dataset.targetUuid,
    combatUuid: button.dataset.combatUuid,
    tokenUuid: button.dataset.tokenUuid,
    amount: id === 'actor.damage' || id === 'actor.heal' || id === 'actor.temp-hp' ? Number(amountInput?.value) : undefined,
    delta: button.dataset.delta ? Number(button.dataset.delta) : undefined,
    statusId: id === 'actor.toggle-status' ? statusSelect?.value : undefined,
  };
}

function setBusyWithin(root: HTMLElement | null | undefined, targetKey: string, busy: boolean): void {
  if (!root) return;
  for (const button of root.querySelectorAll<HTMLButtonElement>('button[data-busy-key]')) {
    if (button.dataset.busyKey !== targetKey) continue;
    if (busy) {
      button.dataset.osdDisabledBeforeBusy = String(button.disabled);
      button.disabled = true;
    } else {
      button.disabled = button.dataset.osdDisabledBeforeBusy === 'true';
      delete button.dataset.osdDisabledBeforeBusy;
    }
    button.setAttribute('aria-busy', String(busy));
  }
}

function applyBusyWithin(root: HTMLElement | null | undefined, busyKeys: ReadonlySet<string>): void {
  for (const key of busyKeys) setBusyWithin(root, key, true);
}
