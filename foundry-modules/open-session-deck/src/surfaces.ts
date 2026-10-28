import { POPOUT_DOCUMENT_PATH, POPOUT_NAME, STYLESHEET_PATH, TEMPLATE_PATH } from './constants.ts';
import { runDeckUiAction } from './ui-errors.ts';

import { DeckColumnLayout } from './column-layout.ts';
import { DeckRosterView } from './roster-view.ts';
import { partySelectionKey } from './operation-selection.ts';
import { DeckListEllipsis } from './list-ellipsis.ts';
import type { DeckActorCard, DeckCommand, DeckSnapshot } from './types.ts';

export interface DeckSurfaceHandlers {
  portraitThumbnail?(source: string): string;
  undo(): Promise<void>;
  execute(command: DeckCommand): Promise<void>;
  executeBatch(commands: readonly DeckCommand[]): Promise<void>;
  openPanel(): Promise<void>;
  openPopout(): Promise<void>;
  openHelp(): Promise<void>;
  closePopout(): Promise<void>;
  setTab(tab: 'party' | 'encounter'): Promise<void>;
  toggleDensity(): Promise<void>;
}

function viewContext(snapshot: DeckSnapshot, isPopout: boolean): Record<string, unknown> {
  const currentCombatant = snapshot.encounter.combatants.find((combatant) => combatant.current);
  return {
    ...snapshot,
    initiativeIcon: snapshot.initiativeIcon ? {
      ...snapshot.initiativeIcon,
      icon: new URL(snapshot.initiativeIcon.icon, document.baseURI).href,
    } : undefined,
    isPopout,
    hasParty: snapshot.party.length > 0,
    hasEncounterCards: snapshot.encounter.combatants.length > 0,
    party: snapshot.party.map((card) => {
      const matches = snapshot.encounter.combatants.filter((combatant) => combatant.uuid === card.uuid);
      const combatant = matches.length === 1 ? matches[0] : undefined;
      return { ...card, inspection: inspectorContext(card), selectionKey: partySelectionKey(card, snapshot), tokenUuid: combatant?.tokenUuid,
        commands: { ...card.commands, locate: combatant?.commands.locate ?? card.commands.locate },
        characterControls: card.type === 'character', exhaustionControls: true, showDeath: Boolean(card.death && card.hp.value === 0) };
    }),
    encounter: { ...snapshot.encounter, combatants: snapshot.encounter.combatants.map((card) => ({ ...card, inspection: inspectorContext(card), exhaustionControls: card.characterControls, showDeath: Boolean(card.death && card.hp.value === 0) })) },
    partyTabActive: snapshot.activeTab === 'party',
    encounterTabActive: snapshot.activeTab === 'encounter',
    compact: snapshot.density === 'compact',
    staleCount: snapshot.stalePinned.length + snapshot.staleHidden.length,
    currentCombatant,
    hasCurrentCombatant: Boolean(currentCombatant),
  };
}

function inspectorContext(card: DeckActorCard): Record<string, unknown> | undefined {
  const inspection = card.inspection;
  if (!inspection) return undefined;
  const resource = (entry: typeof inspection.abilities[number]) => ({ ...entry,
    name: entry.labelKey ? game.i18n.localize(entry.labelKey) : entry.name,
  });
  return { ...inspection,
    passives: Object.fromEntries(Object.entries(inspection.passives).map(([key,value]) => [key,value ?? '—'])),
    abilities: inspection.abilities.map(resource), inventory: inspection.inventory.map(resource),
  };
}

export class PanelSurface {
  updatePortrait(source: string, url: string): void { updatePortraitImages(this.#app?.element, source, url); }
  #app: any;
  #snapshot: DeckSnapshot;
  #busy = new Set<string>();
  #layout = new DeckColumnLayout();
  #roster = new DeckRosterView();
  #ellipsis = new DeckListEllipsis();

  constructor(initial: DeckSnapshot, private readonly handlers: DeckSurfaceHandlers) {
    this.#snapshot = initial;
    this.#roster.update(initial);
    this.#app = this.#createApplication();
  }

  get opened(): boolean { return Boolean(this.#app?.rendered); }

  async open(): Promise<void> { await this.#app.render({ force: true }); }
  async close(): Promise<void> { this.#layout.dispose(); this.#roster.dispose(); this.#ellipsis.dispose(); if (this.opened) await this.#app.close(); }

  render(snapshot: DeckSnapshot): void {
    this.#snapshot = snapshot;
    this.#roster.update(snapshot);
    if (this.opened) void this.#app.render({ force: true }).catch((error: unknown) => {
      ui.notifications?.error?.(`${game.i18n.localize('OSD.Notifications.PanelFailed')}: ${String(error)}`);
    });
  }

  setBusy(targetKey: string, busy: boolean): void {
    if (busy) this.#busy.add(targetKey); else this.#busy.delete(targetKey);
    setBusyWithin(this.#app?.element, targetKey, busy);
    this.#roster.setBusy(this.#busy);
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
        position: { width: Math.min(1360, (globalThis.innerWidth || 1392) - 32), height: Math.min(860, (globalThis.innerHeight || 892) - 32) },
      };

      static PARTS = { main: { template: TEMPLATE_PATH } };

      async _prepareContext(): Promise<Record<string, unknown>> { return viewContext(surface.#snapshot, false); }

      _onRender(context: unknown, options: unknown): void {
        super._onRender(context, options);
        bindDeckRoot(this.element, surface.handlers);
        surface.#layout.bind(this.element);
        surface.#roster.bind(this.element, surface.#snapshot, (commands) => surface.handlers.executeBatch(commands), surface.handlers.portraitThumbnail?.bind(surface.handlers));
        surface.#ellipsis.bind(this.element);
        applyBusyWithin(this.element, surface.#busy);
      }

      async _onClose(options: unknown): Promise<void> {
        surface.#layout.dispose(); surface.#roster.dispose(); surface.#ellipsis.dispose();
        await super._onClose(options);
      }
    })();
  }
}

export class PopoutSurface {
  #ellipsis = new DeckListEllipsis();
  updatePortrait(source: string, url: string): void { updatePortraitImages(this.#root(), source, url); }
  #window: Window | null = null;
  #snapshot: DeckSnapshot;
  #renderGeneration = 0;
  #busy = new Set<string>();
  #layout = new DeckColumnLayout();
  #roster = new DeckRosterView();

  constructor(initial: DeckSnapshot, private readonly handlers: DeckSurfaceHandlers) { this.#snapshot = initial; this.#roster.update(initial); }

  get opened(): boolean { return Boolean(this.#window && !this.#window.closed); }

  async open(): Promise<boolean> {
    if (this.opened) { this.#window!.focus(); return true; }
    const route = (globalThis as any).foundry?.utils?.getRoute?.(POPOUT_DOCUMENT_PATH) ?? POPOUT_DOCUMENT_PATH;
    const url = new URL(route, document.baseURI).href;
    const popup = window.open(url, POPOUT_NAME, 'popup=yes,width=1440,height=1000,resizable=yes,scrollbars=yes');
    if (!popup) return false;
    this.#window = popup;
    try {
      await waitForPopoutDocument(popup, url);
      popup.document.documentElement.lang = String(game.i18n.lang ?? 'en');
      popup.document.documentElement.className = document.documentElement.className;
      popup.document.head.replaceChildren();
      popup.document.title = game.i18n.localize('OSD.Title');
      // Relative Actor images and copied styles still resolve from the GM page, not templates/.
      const base = popup.document.createElement('base');
      base.href = document.baseURI;
      popup.document.head.append(base);
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
      const themeClasses = document.body.className.split(/\s+/).filter((name) => name === 'theme-dark' || name === 'theme-light');
      popup.document.body.className = ['open-session-deck', 'osd-popout-body', ...themeClasses].join(' ');
      popup.document.body.innerHTML = '<main id="open-session-deck-popout" class="osd-popout-root" aria-live="polite"></main>';
      popup.addEventListener('beforeunload', () => {
        if (this.#window === popup) { this.#layout.dispose(); this.#roster.dispose(); this.#ellipsis.dispose(); this.#window = null; }
      }, { once: true });
      await this.#render();
      popup.focus();
      return true;
    } catch (error) {
      this.#layout.dispose(); this.#roster.dispose(); this.#ellipsis.dispose();
      this.#window = null;
      try { popup.close(); } catch { /* same-origin access was lost */ }
      throw error;
    }
  }

  focus(): boolean { if (!this.opened) return false; this.#window!.focus(); return true; }
  async close(): Promise<void> { this.#layout.dispose(); this.#roster.dispose(); this.#ellipsis.dispose(); if (this.opened) this.#window!.close(); this.#window = null; }

  render(snapshot: DeckSnapshot): void {
    this.#snapshot = snapshot;
    this.#roster.update(snapshot);
    if (this.opened) void this.#render().catch((error) => {
      ui.notifications?.error?.(`${game.i18n.localize('OSD.Notifications.PopoutFailed')}: ${String(error)}`);
      runDeckUiAction(() => this.handlers.openPanel());
    });
  }
  setBusy(targetKey: string, busy: boolean): void {
    if (busy) this.#busy.add(targetKey); else this.#busy.delete(targetKey);
    setBusyWithin(this.#root(), targetKey, busy);
    this.#roster.setBusy(this.#busy);
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
    this.#layout.bind(root);
    this.#roster.bind(root, this.#snapshot, (commands) => this.handlers.executeBatch(commands), this.handlers.portraitThumbnail?.bind(this.handlers));
    this.#ellipsis.bind(root);
    applyBusyWithin(root, this.#busy);
  }

  #root(): HTMLElement | null {
    if (!this.opened) return null;
    try { return this.#window!.document.getElementById('open-session-deck-popout'); }
    catch {
      this.#layout.dispose(); this.#roster.dispose(); this.#ellipsis.dispose();
      this.#window = null;
      ui.notifications?.warn?.(game.i18n.localize('OSD.Notifications.PopoutDetached'));
      runDeckUiAction(() => this.handlers.openPanel());
      return null;
    }
  }
}

async function waitForPopoutDocument(popup: Window, url: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!popup.closed && Date.now() < deadline) {
    if (popup.location.href === url && popup.document.readyState === 'complete') return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(game.i18n.localize('OSD.Errors.PopoutDocumentUnavailable'));
}

export function updatePortraitImages(root: HTMLElement | null | undefined, source: string, url: string): void {
  if (!root) return;
  for (const image of root.querySelectorAll<HTMLImageElement>('img[data-osd-portrait-source]')) {
    if (image.dataset.osdPortraitSource && new URL(image.dataset.osdPortraitSource, document.baseURI).href === source) image.src = url;
  }
}

export function bindDeckRoot(root: HTMLElement | null, handlers: DeckSurfaceHandlers): void {
  if (!root) return;
  if (handlers.portraitThumbnail) for (const image of root.querySelectorAll<HTMLImageElement>('img[data-osd-portrait-source]')) {
    if (image.dataset.osdPortraitSource) image.src = handlers.portraitThumbnail(image.dataset.osdPortraitSource);
  }
  syncControls(root);
  if (root.dataset.osdBound === 'true') return;
  root.dataset.osdBound = 'true';
  bindDeckMenus(root);
  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest('button[data-osd-action],button[data-osd-command]') as HTMLButtonElement | null;
    if (!button || button.disabled) return;
    event.preventDefault();
    const action = button.dataset.osdAction;
    if (action === 'open-popout') runDeckUiAction(() => handlers.openPopout());
    else if (action === 'undo') runDeckUiAction(() => handlers.undo());
    else if (action === 'open-panel') runDeckUiAction(() => handlers.openPanel());
    else if (action === 'open-help') runDeckUiAction(() => handlers.openHelp(), 'OSD.Notifications.HelpFailed');
    else if (action === 'close-popout') runDeckUiAction(() => handlers.closePopout());
    else if (action === 'party-tab' || action === 'encounter-tab') runDeckUiAction(() => handlers.setTab(action === 'party-tab' ? 'party' : 'encounter'));
    else if (action === 'toggle-density') runDeckUiAction(() => handlers.toggleDensity());
    else if (action === 'focus-current') root.querySelector<HTMLElement>('[data-current="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else if (action === 'open-layer') openLayer(root, button.dataset.targetLayer);
    else if (action === 'close-layer') closeLayer(root, button.closest<HTMLElement>('[data-osd-layer]'));
    else if (action === 'batch-select-all') setBatchSelection(root, true);
    else if (action === 'batch-clear-all') setBatchSelection(root, false);
    else if (action === 'batch-apply') runDeckUiAction(() => executeBatchAction(root, button, handlers));
    else if (action === 'save-folder') runDeckUiAction(() => savePartyFolder(root, handlers));
    else if (action === 'swap-initiative') runDeckUiAction(() => swapInitiative(root, button, handlers));
    else if (button.dataset.osdCommand) {
      runDeckUiAction(() => handlers.execute(commandFromButton(button)));
    }
  });

  root.addEventListener('change', (event) => {
    const element = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (!element) return;
    if (element.matches('[data-osd-status-choice]')) {
      const preserveKey = element.closest<HTMLDetailsElement>('details[data-osd-preserve-key]')?.dataset.osdPreserveKey;
      const command: DeckCommand = {
        id: 'actor.set-status',
        targetUuid: element.dataset.targetUuid,
        statusId: element.dataset.statusId,
        active: (element as HTMLInputElement).checked,
      };
      runDeckUiAction(() => handlers.execute(command).then(() => reopenDetails(root, preserveKey)));
    } else if (element.matches('[data-osd-direct-command]')) {
      runDeckUiAction(() => handlers.execute(commandFromInput(element)));
    }
  });

  root.addEventListener('keydown', (event) => {
    const input = event.target as HTMLInputElement | null;
    if (event.key === 'Enter' && input?.matches('[data-osd-direct-command]')) {
      event.preventDefault();
      input.blur();
    }
  });
}

function bindDeckMenus(root: HTMLElement): void {
  root.addEventListener('toggle', (event) => {
    const target = event.target as HTMLElement;
    if (target.hasAttribute('popover')) {
      const details = target.closest('details');
      if (details && !target.matches(':popover-open')) details.open = false;
      return;
    }
    if (!target.matches('details.osd-status-picker,details.osd-more-values,details.osd-encounter-tools,details.osd-operation-menu')) return;
    const details = target as HTMLDetailsElement;
    const menu = details.querySelector<HTMLElement>(':scope > div')!;
    if (!details.open) {
      if (menu.matches(':popover-open')) menu.hidePopover();
      return;
    }
    // The browser top layer keeps NPC menus outside the scrolling encounter list's clip.
    menu.setAttribute('popover', 'auto');
    menu.showPopover();
    const anchor = details.querySelector('summary')!.getBoundingClientRect();
    const bounds = menu.getBoundingClientRect();
    const viewport = menu.ownerDocument.defaultView!;
    const left = details.classList.contains('osd-status-picker') ? anchor.left : anchor.right - bounds.width;
    const above = anchor.top - bounds.height - 8;
    const top = above >= 12 ? above : Math.min(anchor.bottom + 8, viewport.innerHeight - bounds.height - 12);
    menu.style.left = `clamp(12px, ${left}px, calc(100vw - ${bounds.width}px - 12px))`;
    menu.style.top = `clamp(12px, ${top}px, calc(100vh - ${bounds.height}px - 12px))`;
  }, true);
}

function commandFromButton(button: HTMLButtonElement): DeckCommand {
  const id = button.dataset.osdCommand as DeckCommand['id'];
  const card = button.closest<HTMLElement>('[data-actor-card]');
  const amountInput = card?.querySelector<HTMLInputElement>('[data-osd-amount]');
  const statusSelect = card?.querySelector<HTMLSelectElement>('[data-osd-status]');
  let value = button.dataset.value === undefined ? undefined : Number(button.dataset.value);
  if (id === 'actor.set-death-save' && button.dataset.field && value !== undefined) {
    const death = button.closest<HTMLElement>('.osd-death');
    const current = Number(button.dataset.field === 'success' ? death?.dataset.osdDeathCurrentSuccess : death?.dataset.osdDeathCurrentFailure);
    if (current >= value) value -= 1;
  }
  return {
    id,
    targetUuid: button.dataset.targetUuid,
    combatUuid: button.dataset.combatUuid,
    tokenUuid: button.dataset.tokenUuid,
    amount: id === 'actor.damage' || id === 'actor.heal' || id === 'actor.temp-hp' ? Number(amountInput?.value) : undefined,
    delta: button.dataset.delta ? Number(button.dataset.delta) : undefined,
    statusId: id === 'actor.toggle-status' ? statusSelect?.value : undefined,
    value,
    active: button.dataset.active === undefined ? undefined : button.dataset.active === 'true',
    field: button.dataset.field as DeckCommand['field'],
    combatantId: button.dataset.combatantId,
    secondCombatantId: button.dataset.secondCombatantId,
  };
}

function commandFromInput(input: HTMLInputElement | HTMLSelectElement): DeckCommand {
  return {
    id: input.dataset.osdDirectCommand as DeckCommand['id'],
    targetUuid: input.dataset.targetUuid,
    combatUuid: input.dataset.combatUuid,
    combatantId: input.dataset.combatantId,
    value: Number(input.value),
  };
}

function openLayer(root: HTMLElement, id?: string): void {
  if (!id) return;
  const layer = root.querySelector<HTMLElement>(`[data-osd-layer="${CSS.escape(id)}"]`);
  if (!layer) return;
  layer.hidden = false;
  const dialog = layer as HTMLDialogElement;
  if (layer.tagName === 'DIALOG' && typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
  layer.querySelector<HTMLElement>('input,select,button')?.focus();
}

function closeLayer(_root: HTMLElement, layer: HTMLElement | null): void {
  if (!layer) return;
  const dialog = layer as HTMLDialogElement;
  if (layer.tagName === 'DIALOG' && typeof dialog.close === 'function' && dialog.open) dialog.close();
  layer.hidden = true;
}

function setBatchSelection(root: HTMLElement, checked: boolean): void {
  for (const input of root.querySelectorAll<HTMLInputElement>('[data-osd-batch-actor]')) input.checked = checked;
}

async function executeBatchAction(root: HTMLElement, button: HTMLButtonElement, handlers: DeckSurfaceHandlers): Promise<void> {
  const actorUuids = [...root.querySelectorAll<HTMLInputElement>('[data-osd-batch-actor]:checked')].map((input) => input.value);
  if (actorUuids.length === 0) return;
  const layer = button.closest<HTMLElement>('[data-osd-layer]');
  const commandId = button.dataset.batchCommand as DeckCommand['id'];
  const valueInput = button.dataset.valueInput ? layer?.querySelector<HTMLInputElement>(`[name="${button.dataset.valueInput}"]`) : null;
  const statusSelect = layer?.querySelector<HTMLSelectElement>('[name="batchStatus"]');
  const commands = actorUuids.map((targetUuid) => ({
    id: commandId,
    targetUuid,
    amount: commandId === 'actor.damage' || commandId === 'actor.heal' ? Number(valueInput?.value) : undefined,
    value: commandId === 'actor.set-temp-hp' || commandId === 'actor.set-max-modifier' ? Number(valueInput?.value) : undefined,
    statusId: commandId === 'actor.set-status' ? statusSelect?.value : undefined,
    active: commandId === 'actor.set-status' ? button.dataset.active === 'true' : undefined,
  } satisfies DeckCommand));
  await handlers.executeBatch(commands);
}

async function savePartyFolder(root: HTMLElement, handlers: DeckSurfaceHandlers): Promise<void> {
  const layer = root.querySelector<HTMLElement>('[data-osd-layer="folder"]');
  const folder = layer?.querySelector<HTMLSelectElement>('[name="partyFolder"]');
  const descendants = layer?.querySelector<HTMLInputElement>('[name="includeDescendants"]');
  await handlers.execute({ id: 'roster.set-folder', folderId: folder?.value ?? '', includeDescendants: descendants?.checked ?? true });
}

async function swapInitiative(root: HTMLElement, button: HTMLButtonElement, handlers: DeckSurfaceHandlers): Promise<void> {
  const layer = button.closest<HTMLElement>('[data-osd-layer]');
  const first = layer?.querySelector<HTMLSelectElement>('[name="swapFirst"]');
  const second = layer?.querySelector<HTMLSelectElement>('[name="swapSecond"]');
  await handlers.execute({
    id: 'combat.swap-initiative',
    combatUuid: button.dataset.combatUuid,
    combatantId: first?.value,
    secondCombatantId: second?.value,
  });
}

function reopenDetails(root: HTMLElement, preserveKey?: string): void {
  if (!preserveKey) return;
  queueMicrotask(() => {
    const details = root.querySelector<HTMLDetailsElement>(`details[data-osd-preserve-key="${CSS.escape(preserveKey)}"]`);
    if (details) details.open = true;
  });
}

function syncControls(root: HTMLElement): void {
  for (const select of root.querySelectorAll<HTMLSelectElement>('select[data-selected]')) {
    if ('value' in select) select.value = select.dataset.selected ?? '';
  }
  for (const death of root.querySelectorAll<HTMLElement>('.osd-death')) {
    if (typeof death.querySelectorAll !== 'function') continue;
    for (const field of ['success', 'failure'] as const) {
      const current = Number(field === 'success' ? death.dataset.osdDeathCurrentSuccess : death.dataset.osdDeathCurrentFailure);
      for (const pip of death.querySelectorAll<HTMLButtonElement>(`.osd-pips-${field} button[data-value]`)) {
        const active = Number(pip.dataset.value) <= current;
        pip.classList.toggle('active', active);
        pip.setAttribute('aria-pressed', String(active));
      }
    }
  }
}

function setBusyWithin(root: HTMLElement | null | undefined, targetKey: string, busy: boolean): void {
  if (!root) return;
  for (const control of root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('[data-busy-key]')) {
    if (targetKey !== '*' && control.dataset.busyKey !== targetKey) continue;
    if (busy) {
      if (control.dataset.osdDisabledBeforeBusy === undefined) control.dataset.osdDisabledBeforeBusy = String(control.disabled);
      control.disabled = true;
    } else {
      control.disabled = control.dataset.osdDisabledBeforeBusy === 'true';
      delete control.dataset.osdDisabledBeforeBusy;
    }
    control.setAttribute('aria-busy', String(busy));
  }
}

function applyBusyWithin(root: HTMLElement | null | undefined, busyKeys: ReadonlySet<string>): void {
  for (const key of busyKeys) setBusyWithin(root, key, true);
}
