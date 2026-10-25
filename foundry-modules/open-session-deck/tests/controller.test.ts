import { afterEach, describe, expect, test } from 'bun:test';
import { DeckController } from '../src/controller.ts';

const globalKeys = ['CONFIG', 'Hooks', 'canvas', 'foundry', 'fromUuid', 'game', 'ui', 'window'] as const;
const originalGlobals = new Map(globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

afterEach(() => {
  for (const key of globalKeys) {
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as any)[key];
  }
});

function installControllerGlobals() {
  const hookCallbacks = new Map<string, () => void>();
  const windowCallbacks = new Map<string, () => void>();
  const info: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const settings = new Map<string, unknown>([
    ['pinnedActors', []], ['hiddenActors', []], ['lastOpenMode', 'panel'], ['cardDensity', 'comfortable'], ['activeTab', 'party'],
  ]);
  class ApplicationV2 {
    rendered = false;
    element = { dataset: {}, querySelectorAll: () => [] };
    async render() { this.rendered = true; return this; }
    async close() { this.rendered = false; }
    _onRender() {}
  }
  const gameFixture = {
    version: '14.364',
    system: { id: 'dnd5e', version: '5.3.3' },
    user: { isGM: true },
    world: { id: 'world', title: 'World' },
    users: [], actors: [], combat: null,
    settings: {
      get: (_module: string, key: string) => settings.get(key),
      set: async (_module: string, key: string, value: unknown) => { settings.set(key, value); },
    },
    i18n: { lang: 'en', localize: (key: string) => key },
  };
  Object.assign(globalThis, {
    CONFIG: { statusEffects: [], DND5E: { conditionTypes: { exhaustion: { levels: 6 } } } },
    Hooks: { on: (name: string, callback: () => void) => { hookCallbacks.set(name, callback); } },
    canvas: { scene: { id: 'scene', name: 'Scene' }, dimensions: { size: 100 }, animatePan: async () => {} },
    foundry: { applications: { api: { ApplicationV2, HandlebarsApplicationMixin: (Base: any) => Base } }, utils: {} },
    fromUuid: async () => null,
    game: gameFixture,
    ui: { notifications: { info: (message: string) => info.push(message), error: (message: string) => errors.push(message), warn: (message: string) => warnings.push(message) } },
    window: { addEventListener: (name: string, callback: () => void) => { windowCallbacks.set(name, callback); } },
  });
  return { errors, game: gameFixture, hookCallbacks, info, settings, warnings, windowCallbacks };
}

describe('DeckController behavior', () => {
  test('panel close and reopen do not add invalidation subscriptions', async () => {
    const fixture = installControllerGlobals();
    const controller = new DeckController();
    let builds = 0;
    const originalBuild = controller.adapter.buildSnapshot.bind(controller.adapter);
    controller.adapter.buildSnapshot = () => { builds += 1; return originalBuild(); };
    controller.panel.open = async () => {};
    controller.panel.close = async () => {};
    await controller.start();
    const hookCount = fixture.hookCallbacks.size;
    for (let index = 0; index < 3; index += 1) {
      await controller.openPanel();
      await controller.close('panel');
    }
    expect(fixture.hookCallbacks.size).toBe(hookCount);
    fixture.hookCallbacks.get('updateActor')!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(builds).toBe(2);
  });

  test('help stays outside panel, popout, command, and setting-write paths', async () => {
    const fixture = installControllerGlobals();
    const controller = new DeckController();
    let opens = 0;
    controller.help.open = async () => { opens += 1; };
    controller.panel.open = async () => { throw new Error('panel opened'); };
    controller.popout.open = async () => { throw new Error('popout opened'); };
    controller.adapter.execute = async () => { throw new Error('command executed'); };
    fixture.game.settings.set = async () => { throw new Error('setting written'); };
    await controller.openHelp();
    expect(opens).toBe(1);
    expect(fixture.settings.get('lastOpenMode')).toBe('panel');
    fixture.game.user.isGM = false;
    await expect(controller.openHelp()).rejects.toThrow('GMs only');
    expect(opens).toBe(1);
  });

  test('routes panel and popout lifecycle, remembers successful modes, and falls back after blocked or failed popouts', async () => {
    const fixture = installControllerGlobals();
    const controller = new DeckController();
    const calls: string[] = [];
    controller.panel.open = async () => { calls.push('panel:open'); };
    controller.panel.close = async () => { calls.push('panel:close'); };
    controller.popout.open = async () => { calls.push('popout:open'); return true; };
    controller.popout.focus = () => { calls.push('popout:focus'); return true; };
    controller.popout.close = async () => { calls.push('popout:close'); };

    await controller.openPanel();
    expect(fixture.settings.get('lastOpenMode')).toBe('panel');
    await controller.openPopout();
    expect(fixture.settings.get('lastOpenMode')).toBe('popout');
    expect(controller.focusPopout()).toBeTrue();
    await controller.close('all');
    expect(calls).toEqual(['panel:open', 'popout:open', 'popout:focus', 'panel:close', 'popout:close']);

    controller.popout.open = async () => false;
    await controller.openPopout();
    expect(fixture.warnings).toEqual(['OSD.Notifications.PopupBlocked']);
    expect(fixture.settings.get('lastOpenMode')).toBe('panel');

    controller.popout.open = async () => { throw new Error('popout fixture failed'); };
    await controller.openPopout();
    expect(fixture.errors.at(-1)).toContain('popout fixture failed');
    expect(calls.slice(-2)).toEqual(['panel:open', 'panel:open']);
  });

  test('uses the saved surface mode and persists density and tab choices', async () => {
    const fixture = installControllerGlobals();
    const controller = new DeckController();
    const calls: string[] = [];
    controller.panel.open = async () => { calls.push('panel'); };
    controller.popout.open = async () => { calls.push('popout'); return true; };

    fixture.settings.set('lastOpenMode', 'popout');
    await controller.openLastMode();
    expect(calls).toEqual(['popout']);
    await controller.setTab('encounter');
    await controller.toggleDensity();
    expect(fixture.settings.get('activeTab')).toBe('encounter');
    expect(fixture.settings.get('cardDensity')).toBe('compact');
  });

  test('coalesces hook invalidations, closes both surfaces after GM demotion, and releases the popout on unload', async () => {
    const fixture = installControllerGlobals();
    const controller = new DeckController();
    const originalBuild = controller.adapter.buildSnapshot.bind(controller.adapter);
    let builds = 0;
    controller.adapter.buildSnapshot = () => { builds += 1; return originalBuild(); };
    let panelCloses = 0;
    let popoutCloses = 0;
    controller.panel.close = async () => { panelCloses += 1; };
    controller.popout.close = async () => { popoutCloses += 1; };

    await controller.start();
    expect(builds).toBe(1);
    fixture.hookCallbacks.get('updateActor')!();
    fixture.hookCallbacks.get('updateCombat')!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(builds).toBe(2);

    fixture.windowCallbacks.get('beforeunload')!();
    await Promise.resolve();
    expect(popoutCloses).toBe(1);

    fixture.game.user.isGM = false;
    fixture.hookCallbacks.get('updateActor')!();
    await Promise.resolve();
    expect(panelCloses).toBe(1);
    expect(popoutCloses).toBe(2);
  });

  test('deduplicates concurrent commands, refreshes only after the native write, and clears busy state on success and failure', async () => {
    const fixture = installControllerGlobals();
    const controller = new DeckController();
    const sequence: string[] = [];
    let releases = 0;
    let releaseWrite!: () => void;
    const write = new Promise<void>((resolve) => { releaseWrite = resolve; });
    controller.adapter.execute = async () => {
      releases += 1;
      sequence.push('write:start');
      await write;
      sequence.push('write:end');
      return { messageKey: 'OSD.Notifications.ActorUpdated' };
    };
    controller.store.refreshNow = async () => { sequence.push('refresh'); };
    controller.panel.setBusy = (_key, busy) => { sequence.push(`panel:${busy}`); };
    controller.popout.setBusy = (_key, busy) => { sequence.push(`popout:${busy}`); };

    const command = { id: 'actor.damage' as const, targetUuid: 'Actor.hero', amount: 1 };
    const first = controller.execute(command);
    await Promise.resolve();
    await controller.execute(command);
    expect(releases).toBe(1);
    releaseWrite();
    await first;
    expect(sequence).toEqual(['panel:true', 'popout:true', 'write:start', 'write:end', 'refresh', 'panel:false', 'popout:false']);
    expect(fixture.info).toEqual(['OSD.Notifications.ActorUpdated']);

    controller.adapter.execute = async () => { throw new Error('native write failed'); };
    await controller.execute(command);
    expect(sequence.slice(-3)).toEqual(['refresh', 'panel:false', 'popout:false']);
    expect(fixture.errors[0]).toContain('native write failed');
  });

  test('executes a selected batch sequentially and publishes one refreshed snapshot', async () => {
    installControllerGlobals();
    const controller = new DeckController();
    const sequence: string[] = [];
    controller.adapter.execute = async (command) => {
      sequence.push(`${command.id}:${command.targetUuid}`);
      return { messageKey: 'OSD.Notifications.ActorUpdated' };
    };
    controller.store.refreshNow = async () => { sequence.push('refresh'); };

    await controller.executeBatch([
      { id: 'actor.damage', targetUuid: 'Actor.first', amount: 3 },
      { id: 'actor.damage', targetUuid: 'Actor.second', amount: 3 },
    ]);

    expect(sequence).toEqual(['actor.damage:Actor.first', 'actor.damage:Actor.second', 'refresh']);
  });
});
