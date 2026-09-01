import { afterEach, describe, expect, test } from 'bun:test';
import { bindDeckRoot, PanelSurface, PopoutSurface, type DeckSurfaceHandlers } from '../src/surfaces.ts';
import type { DeckSnapshot } from '../src/types.ts';

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
    execute: async () => {}, executeBatch: async () => {}, openPanel: async () => { onOpenPanel(); }, openPopout: async () => {}, closePopout: async () => {},
    setTab: async () => {}, toggleDensity: async () => {},
  };
}

function installWindowFixture(blocked = false) {
  const root: any = { dataset: {}, innerHTML: '', addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null };
  const head: any = { replaceChildren: () => {}, append: () => {}, querySelectorAll: () => [] };
  const popupDocument: any = {
    title: '', documentElement: { lang: '', className: '' }, head,
    body: { className: '', innerHTML: '' },
    createElement: () => ({}), querySelectorAll: () => [], getElementById: () => root,
  };
  let opens = 0;
  let focuses = 0;
  const popup: any = {
    closed: false, document: popupDocument,
    focus: () => { focuses += 1; }, close: () => { popup.closed = true; }, addEventListener: () => {},
  };
  Object.assign(globalThis, {
    document: { documentElement: { className: 'theme-dark' }, body: { className: 'foundry-body' }, head },
    window: { open: () => { opens += 1; return blocked ? null : popup; } },
    game: { i18n: { lang: 'en', localize: (key: string) => key } },
    ui: { notifications: { warn: () => {}, error: () => {} } },
    foundry: { applications: { handlebars: { renderTemplate: async (_path: string, context: any) => String(context.refreshedAt) } }, utils: { getRoute: (path: string) => path } },
  });
  return { popup, root, opens: () => opens, focuses: () => focuses };
}

function installPanelFixture() {
  const errors: string[] = [];
  let renderError: Error | undefined;
  let buttons: any[] = [];
  const element = { dataset: {}, addEventListener: () => {}, querySelectorAll: () => buttons };
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
  test('opens a dialog and confirms commands in the popout document realm', async () => {
    let click: ((event: any) => void) | undefined;
    let shown = 0;
    let executions = 0;
    let allow = false;
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
      ownerDocument: { defaultView: { confirm: () => allow } },
      closest: (selector: string) => selector.startsWith('button') ? commandButton : null,
    };
    click?.({ target: commandButton, preventDefault: () => {} });
    await Promise.resolve();
    expect(executions).toBe(0);
    allow = true;
    click?.({ target: commandButton, preventDefault: () => {} });
    await Promise.resolve();
    expect(executions).toBe(1);
  });

  test('reuses and focuses the fixed named blank window while rendering shared snapshots', async () => {
    const fixture = installWindowFixture();
    const surface = new PopoutSurface(snapshot(1), handlers());
    expect(await surface.open()).toBeTrue();
    expect(fixture.root.innerHTML).toBe('1');
    surface.render(snapshot(2));
    await Promise.resolve();
    expect(fixture.root.innerHTML).toBe('2');
    expect(await surface.open()).toBeTrue();
    expect(fixture.opens()).toBe(1);
    expect(fixture.focuses()).toBe(2);
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
