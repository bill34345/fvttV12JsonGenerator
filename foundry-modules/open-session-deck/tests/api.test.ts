import { describe, expect, test } from 'bun:test';
import { createDeckApi } from '../src/api.ts';
import type { DeckModuleApi } from '../src/types.ts';

function target(calls: string[]): DeckModuleApi {
  return {
    openPanel: async () => { calls.push('openPanel'); },
    openPopout: async () => { calls.push('openPopout'); },
    openHelp: async () => { calls.push('openHelp'); },
    focusPopout: () => { calls.push('focusPopout'); return true; },
    close: async (mode) => { calls.push(`close:${mode}`); },
    refresh: () => { calls.push('refresh'); },
  };
}

describe('public module API', () => {
  test('fails closed for every entrypoint before resolving a controller on a player client', () => {
    let resolutions = 0;
    const api = createDeckApi(() => { resolutions += 1; return target([]); }, () => false);
    for (const invoke of [
      () => api.openPanel(),
      () => api.openPopout(),
      () => api.openHelp(),
      () => api.focusPopout(),
      () => api.close('all'),
      () => api.refresh(),
    ]) expect(invoke).toThrow('GMs only');
    expect(resolutions).toBe(0);
  });

  test('rejects a GM call until ready and delegates all methods once a controller exists', async () => {
    let controller: DeckModuleApi | undefined;
    const calls: string[] = [];
    const api = createDeckApi(() => controller, () => true);
    expect(() => api.openPanel()).toThrow('not ready');

    controller = target(calls);
    await api.openPanel();
    await api.openPopout();
    await api.openHelp();
    expect(api.focusPopout()).toBeTrue();
    await api.close('popout');
    api.refresh();
    expect(calls).toEqual(['openPanel', 'openPopout', 'openHelp', 'focusPopout', 'close:popout', 'refresh']);
  });
});
