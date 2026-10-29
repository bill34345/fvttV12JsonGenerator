import { afterEach, describe, expect, test } from 'bun:test';
import { bindDeckRoot, updatePortraitImages, PanelSurface, PopoutSurface, type DeckSurfaceHandlers } from '../src/surfaces.ts';
import { POPOUT_DOCUMENT_PATH, POPOUT_NAME } from '../src/constants.ts';
import type { DeckSnapshot } from '../src/types.ts';
import { JSDOM } from 'jsdom';

const originalGlobals = {
  CSS: globalThis.CSS,
  document: globalThis.document,
  foundry: (globalThis as any).foundry,
  game: (globalThis as any).game,
  ui: (globalThis as any).ui,
  window: globalThis.window,
};

afterEach(() => {
  Object.assign(globalThis, originalGlobals);
});

function snapshot(refreshedAt = 0): DeckSnapshot {
  return {
    supported: true,
    coreVersion: '14.368',
    world: { id: 'world', title: 'World' },
    system: { id: 'dnd5e', version: '5.3.3' },
    scene: null,
    onlineUsers: 1,
    party: [],
    encounter: {
      active: false, round: 0, turn: -1, displayTurn: 0, combatants: [],
      commands: {
        previousTurn: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
        nextTurn: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
        focusCurrent: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
        swapInitiative: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
        rollNpcInitiative: { enabled: false, tooltipKey: 'OSD.Errors.NoActiveCombat' },
      },
    },
    statusOptions: [],
    partyFolder: { includeDescendants: true, missing: false, options: [] },
    rosterManager: [],
    stalePinned: [],
    staleHidden: [],
    density: 'comfortable',
    activeTab: 'party',
    refreshedAt,
  };
}

function handlers(onOpenPanel: () => void = () => {}): DeckSurfaceHandlers {
  return {
    undo: async () => {}, execute: async () => {}, executeBatch: async () => {}, openPanel: async () => { onOpenPanel(); }, openPopout: async () => {}, openHelp: async () => {}, closePopout: async () => {},
    setTab: async () => {}, toggleDensity: async () => {},
  };
}

function installWindowFixture(blocked = false) {
  const root: any = { dataset: {}, innerHTML: '', addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null };
  const elements: any[] = [];
  const head: any = { replaceChildren: () => { elements.length = 0; }, append: (element: any) => { elements.push(element); }, querySelectorAll: () => [] };
  const popupDocument: any = {
    title: '', readyState: 'complete', documentElement: { lang: '', className: '' }, head,
    body: { className: '', innerHTML: '' },
    createElement: (tag: string) => ({ tagName: tag.toUpperCase() }), querySelectorAll: () => [], getElementById: () => root,
  };
  let opens = 0;
  let focuses = 0;
  const popup: any = {
    closed: false, document: popupDocument, location: { href: 'about:blank' },
    focus: () => { focuses += 1; }, close: () => { popup.closed = true; }, addEventListener: () => {},
  };
  Object.assign(globalThis, {
    document: { baseURI: 'http://foundry.test/game', documentElement: { className: 'theme-dark' }, body: { className: 'foundry-body' }, head },
    window: { open: (url: string, name: string) => { opens += 1; popup.location.href = url; popup.name = name; return blocked ? null : popup; } },
    game: { i18n: { lang: 'en', localize: (key: string) => key } },
    ui: { notifications: { warn: () => {}, error: () => {} } },
    foundry: { applications: { handlebars: { renderTemplate: async (_path: string, context: any) => String(context.refreshedAt) } }, utils: { getRoute: (path: string) => path } },
  });
  return { popup, root, elements, opens: () => opens, focuses: () => focuses };
}

function installPanelFixture() {
  const errors: string[] = [];
  let renderError: Error | undefined;
  let buttons: any[] = [];
  const element = { dataset: {}, addEventListener: () => {}, querySelectorAll: (selector: string) => selector === '[data-osd-ellipsis]' ? [] : buttons, querySelector: () => null };
  class ApplicationV2 {
    rendered = true;
    element = element;
    async render() {
      if (renderError) throw renderError;
      (this as any)._onRender({}, {});
      return this;
    }
    async close() { this.rendered = false; }
    _onRender() {}
  }
  Object.assign(globalThis, {
    game: { i18n: { localize: (key: string) => key } },
    ui: { notifications: { error: (message: string) => errors.push(message) } },
    foundry: { applications: { api: { ApplicationV2, HandlebarsApplicationMixin: (Base: any) => Base } } },
  });
  return {
    errors,
    failNextRender: (error: Error) => { renderError = error; },
    replaceButtons: (...next: any[]) => { buttons = next; },
  };
}

describe('PanelSurface', () => {
  test('late thumbnails replace only images, preserving open dialogs, typed values and focus', () => {
    const dom = new JSDOM('<main><img data-osd-portrait-source="/portrait.png" src="/placeholder.svg"><dialog open><input value="1"></dialog></main>', { url: 'http://foundry.test/game' });
    const document = dom.window.document, root = document.querySelector('main')!, input = root.querySelector('input')!, dialog = root.querySelector('dialog')!;
    Object.assign(globalThis, { document });
    input.value = '27';input.focus();
    updatePortraitImages(root, 'http://foundry.test/portrait.png', 'blob:small-portrait');
    expect(root.querySelector('img')!.src).toBe('blob:small-portrait');
    expect(root.querySelector('input')).toBe(input);
    expect(input.value).toBe('27');expect(document.activeElement).toBe(input);
    expect(root.querySelector('dialog')).toBe(dialog);expect(dialog.open).toBeTrue();
  });

  test('reports an asynchronous refresh failure instead of leaking an unhandled rejection', async () => {
    const fixture = installPanelFixture();
    const surface = new PanelSurface(snapshot(1), handlers());
    fixture.failNextRender(new Error('panel fixture failed'));
    surface.render(snapshot(2));
    await Promise.resolve();
    await Promise.resolve();
    expect(fixture.errors).toHaveLength(1);
    expect(fixture.errors[0]).toContain('OSD.Notifications.PanelFailed');
    expect(fixture.errors[0]).toContain('panel fixture failed');
  });

  test('reapplies and later releases a busy lock after ApplicationV2 replaces the rendered controls', async () => {
    const fixture = installPanelFixture();
    const surface = new PanelSurface(snapshot(1), handlers());
    const firstButton: any = { dataset: { busyKey: 'Actor.hero' }, disabled: false, setAttribute: () => {} };
    fixture.replaceButtons(firstButton);
    surface.setBusy('Actor.hero', true);
    expect(firstButton.disabled).toBeTrue();

    const replacementButton: any = { dataset: { busyKey: 'Actor.hero' }, disabled: false, setAttribute: () => {} };
    fixture.replaceButtons(replacementButton);
    surface.render(snapshot(2));
    await Promise.resolve();
    expect(replacementButton.disabled).toBeTrue();
    surface.setBusy('Actor.hero', false);
    expect(replacementButton.disabled).toBeFalse();
  });
});

describe('PopoutSurface', () => {
  test('resolves the native initiative icon against the GM page before rendering the HTTP popout', async () => {
    installWindowFixture();
    const contexts: any[] = [];
    (globalThis as any).foundry.applications.handlebars.renderTemplate = async (_path: string, context: any) => { contexts.push(context); return ''; };
    const value = { ...snapshot(), initiativeIcon: { icon: '../icons/svg/d20.svg', hover: '../icons/svg/d20-highlight.svg' } };
    await new PopoutSurface(value, handlers()).open();
    expect(contexts[0].initiativeIcon.icon).toBe('http://foundry.test/icons/svg/d20.svg');
    expect(value.initiativeIcon.icon).toBe('../icons/svg/d20.svg');
  });

  test('opens NPC menus in the browser top layer and synchronizes native dismissal without duplicate handlers', async () => {
    const dom = new JSDOM('<main><details class="osd-more-values"><summary>More values</summary><div class="osd-values-popover">AC 19</div></details></main>');
    const root = dom.window.document.querySelector('main')!;
    const details = root.querySelector('details')!;
    const summary = root.querySelector('summary')!;
    const menu = root.querySelector('div')!;
    let visible = false;
    let opens = 0;
    const matches = menu.matches.bind(menu);
    menu.matches = (selector) => selector === ':popover-open' ? visible : matches(selector);
    menu.showPopover = () => { visible = true; opens += 1; };
    menu.hidePopover = () => { visible = false; };
    menu.getBoundingClientRect = () => ({ width: 350, height: 270 } as DOMRect);
    summary.getBoundingClientRect = () => ({ top: 30, bottom: 62, left: 800, right: 900 } as DOMRect);
    bindDeckRoot(root, handlers());
    bindDeckRoot(root, handlers());
    summary.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(menu.getAttribute('popover')).toBe('auto');
    expect(visible).toBeTrue();
    expect(opens).toBe(1);
    expect(menu.style.left).toContain('clamp(');
    expect(menu.style.top).toContain('clamp(');
    visible = false;
    menu.dispatchEvent(new dom.window.Event('toggle'));
    expect(details.open).toBeFalse();
    dom.window.close();
  });

  test('reports rejected toolbar and auxiliary actions without duplicating listeners after rebinding', async () => {
    const errors: string[] = [];
    const listeners: Array<(event: any) => void> = [];
    const root: any = {
      dataset: {},
      addEventListener: (name: string, callback: (event: any) => void) => { if (name === 'click') listeners.push(callback); },
      querySelectorAll: (selector: string) => selector === '[data-osd-batch-actor]:checked' ? [{ value: 'Actor.hero' }] : [],
    };
    const surfaceHandlers = handlers();
    for (const key of ['openPanel', 'openPopout', 'closePopout', 'setTab', 'toggleDensity', 'executeBatch'] as const) {
      (surfaceHandlers as any)[key] = async () => { throw new Error(key); };
    }
    Object.assign(globalThis, {
      game: { i18n: { localize: (key: string) => key } },
      ui: { notifications: { error: (message: string) => errors.push(message) } },
    });
    bindDeckRoot(root, surfaceHandlers);
    bindDeckRoot(root, surfaceHandlers);
    expect(listeners).toHaveLength(1);
    for (const action of ['open-panel', 'open-popout', 'close-popout', 'party-tab', 'toggle-density', 'batch-apply']) {
      const layer = { querySelector: () => null };
      const button: any = {
        disabled: false, dataset: { osdAction: action, batchCommand: 'actor.damage' },
        closest: (selector: string) => selector.startsWith('button') ? button : selector.includes('data-osd-layer') ? layer : null,
      };
      listeners[0]!({ target: button, preventDefault: () => {} });
      await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).toEqual([
      'OSD.Notifications.ActionFailed: Error: openPanel',
      'OSD.Notifications.ActionFailed: Error: openPopout',
      'OSD.Notifications.ActionFailed: Error: closePopout',
      'OSD.Notifications.ActionFailed: Error: setTab',
      'OSD.Notifications.ActionFailed: Error: toggleDensity',
      'OSD.Notifications.ActionFailed: Error: executeBatch',
    ]);
  });

  test('shared toolbar routes help without any Deck command or panel transition', async () => {
    let click: ((event: any) => void) | undefined;
    const calls: string[] = [];
    const root: any = { dataset: {}, addEventListener: (name: string, callback: (event: any) => void) => { if (name === 'click') click = callback; }, querySelectorAll: () => [] };
    const surfaceHandlers = handlers(() => calls.push('panel'));
    surfaceHandlers.openHelp = async () => { calls.push('help'); };
    surfaceHandlers.execute = async () => { calls.push('command'); };
    surfaceHandlers.openPopout = async () => { calls.push('popout'); };
    bindDeckRoot(root, surfaceHandlers);
    const button: any = { disabled: false, dataset: { osdAction: 'open-help' }, closest: () => button };
    click?.({ target: button, preventDefault: () => {} });
    await Promise.resolve();
    expect(calls).toEqual(['help']);
  });

  test('opens normal operation dialogs but executes commands without a browser confirmation', async () => {
    let click: ((event: any) => void) | undefined;
    let shown = 0;
    let executions = 0;
    let nativeConfirmCalls = 0;
    const layer: any = {
      hidden: true,
      open: false,
      tagName: 'DIALOG',
      showModal: () => { shown += 1; layer.open = true; },
      querySelector: () => ({ focus: () => {} }),
    };
    const root: any = {
      dataset: {},
      addEventListener: (name: string, callback: (event: any) => void) => { if (name === 'click') click = callback; },
      querySelectorAll: () => [],
      querySelector: (selector: string) => selector.includes('data-osd-layer') ? layer : null,
    };
    const surfaceHandlers = handlers();
    surfaceHandlers.execute = async () => { executions += 1; };
    Object.assign(globalThis, { CSS: { escape: (value: string) => value } });
    bindDeckRoot(root, surfaceHandlers);

    const openButton: any = {
      disabled: false,
      dataset: { osdAction: 'open-layer', targetLayer: 'batch' },
      closest: () => openButton,
    };
    click?.({ target: openButton, preventDefault: () => {} });
    expect(shown).toBe(1);
    expect(layer.hidden).toBeFalse();

    const commandButton: any = {
      disabled: false,
      dataset: { osdCommand: 'combat.next-turn', combatUuid: 'Combat.one', confirm: 'Confirm' },
      ownerDocument: { defaultView: { confirm: () => { nativeConfirmCalls += 1; return false; } } },
      closest: (selector: string) => selector.startsWith('button') ? commandButton : null,
    };
    click?.({ target: commandButton, preventDefault: () => {} });
    await Promise.resolve();
    expect(executions).toBe(1);
    expect(nativeConfirmCalls).toBe(0);
  });

  test('reuses and focuses the fixed named HTTP shell while rendering shared snapshots', async () => {
    const fixture = installWindowFixture();
    document.body.className = 'vtt game theme-dark mld-paused change-chat';
    const surface = new PopoutSurface(snapshot(1), handlers());
    expect(await surface.open()).toBeTrue();
    expect(fixture.popup.location.href).toBe(`http://foundry.test/${POPOUT_DOCUMENT_PATH}`);
    expect(fixture.popup.name).toBe(POPOUT_NAME);
    expect(fixture.elements.find((element) => element.tagName === 'BASE')?.href).toBe(document.baseURI);
    expect(fixture.popup.document.body.className).toBe('open-session-deck osd-popout-body theme-dark');
    expect(fixture.root.innerHTML).toBe('1');
    surface.render(snapshot(2));
    await Promise.resolve();
    expect(fixture.root.innerHTML).toBe('2');
    expect(await surface.open()).toBeTrue();
    expect(fixture.opens()).toBe(1);
    expect(fixture.focuses()).toBe(2);
  });

  test('waits for the shell document before replacing its head and rendering', async () => {
    const fixture = installWindowFixture();
    fixture.popup.document.readyState = 'loading';
    const surface = new PopoutSurface(snapshot(1), handlers());
    const opening = surface.open();
    expect(fixture.popup.document.body.innerHTML).toBe('');
    expect(fixture.root.innerHTML).toBe('');
    expect(fixture.elements).toHaveLength(0);
    fixture.popup.document.readyState = 'complete';
    expect(await opening).toBeTrue();
    expect(fixture.root.innerHTML).toBe('1');
  });

  test('resolves the shell and relative resources under a Foundry route prefix', async () => {
    const fixture = installWindowFixture();
    (document as any).baseURI = 'http://foundry.test/vtt/game';
    (globalThis as any).foundry.utils.getRoute = (path: string) => `/vtt/${path}`;
    const surface = new PopoutSurface(snapshot(), handlers());
    expect(await surface.open()).toBeTrue();
    expect(fixture.popup.location.href).toBe(`http://foundry.test/vtt/${POPOUT_DOCUMENT_PATH}`);
    expect(fixture.elements.find((element) => element.tagName === 'BASE')?.href).toBe('http://foundry.test/vtt/game');
    expect(fixture.elements.find((element) => element.tagName === 'LINK')?.href).toBe('/vtt/modules/open-session-deck/styles/open-session-deck.css');
  });

  test('releases a popout that closes before its document loads', async () => {
    const fixture = installWindowFixture();
    fixture.popup.document.readyState = 'loading';
    const surface = new PopoutSurface(snapshot(), handlers());
    const opening = surface.open();
    fixture.popup.close();
    await expect(opening).rejects.toThrow('OSD.Errors.PopoutDocumentUnavailable');
    expect(surface.opened).toBeFalse();
    expect(fixture.root.innerHTML).toBe('');
  });

  test('reports a blocked popup without creating a second client surface', async () => {
    const fixture = installWindowFixture(true);
    const surface = new PopoutSurface(snapshot(), handlers());
    expect(await surface.open()).toBeFalse();
    expect(fixture.opens()).toBe(1);
    expect(surface.opened).toBeFalse();
  });

  test('falls back to the panel when a previously opened popout loses same-origin access', async () => {
    const fixture = installWindowFixture();
    let panelOpens = 0;
    const surface = new PopoutSurface(snapshot(), handlers(() => { panelOpens += 1; }));
    expect(await surface.open()).toBeTrue();
    fixture.popup.document.getElementById = () => { throw new Error('detached'); };
    surface.render(snapshot(2));
    await Promise.resolve();
    expect(surface.opened).toBeFalse();
    expect(panelOpens).toBe(1);
  });
});
