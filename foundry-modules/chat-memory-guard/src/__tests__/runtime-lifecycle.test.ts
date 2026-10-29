import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { ChatMemoryGuardRuntime } from '../runtime';
import { DEFAULT_SETTINGS } from '../settings';
import type { CreatedThumbnail, ThumbnailBackend } from '../thumbnail-cache';

function fixture(count = 0, thumbnailBackend?: ThumbnailBackend) {
  const dom = new JSDOM(`<section><div class="chat-scroll"><ol class="chat-log">${Array.from({ length: count }, (_, i) =>
    `<li class="message" data-message-id="m${i}"></li>`).join('')}</ol></div></section>`);
  const names = ['HTMLElement', 'MutationObserver', 'addEventListener', 'removeEventListener'] as const;
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const unload = new Set<unknown>();
  Object.assign(globalThis, {
    HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver,
    addEventListener: (name: string, callback: unknown) => { if (name === 'beforeunload') unload.add(callback); },
    removeEventListener: (name: string, callback: unknown) => { if (name === 'beforeunload') unload.delete(callback); },
  });
  const callbacks = new Map<string, Map<number, (...args: any[]) => unknown>>();
  let nextId = 0;
  const hooks = {
    on(name: string, fn: (...args: any[]) => unknown) {
      const id = ++nextId;
      const entries = callbacks.get(name) ?? new Map();
      entries.set(id, fn);
      callbacks.set(name, entries);
      return id;
    },
    off(name: string, id: number) { callbacks.get(name)?.delete(id); },
    async emit(name: string, ...args: any[]) { await Promise.all([...(callbacks.get(name)?.values() ?? [])].map(fn => fn(...args))); },
    count: () => [...callbacks.values()].reduce((sum, entries) => sum + entries.size, 0),
  };
  const worldDefaults = { ...DEFAULT_SETTINGS, retainedMessages: 20 };
  const documentDeletes: string[] = [];
  const messages = new Map(Array.from({ length: count }, (_, i) => [`m${i}`, { id: `m${i}`, delete: () => documentDeletes.push(`m${i}`) }]));
  const chat = {
    rendered: true, isAtBottom: true, element: dom.window.document.querySelector('section')!,
    deleteMessage: async (id: string) => { chat.element.querySelector(`[data-message-id="${id}"]`)?.remove(); },
  };
  const runtime = new ChatMemoryGuardRuntime({
    game: { user: { isGM: true }, settings: { get: (_module: string, key: string) => key === 'worldDefaults' ? worldDefaults : undefined }, messages },
    hooks, ui: { chat }, thumbnailBackend: thumbnailBackend ?? { create: async () => ({ url: 'blob:synthetic', bytes: 1 }), revoke: () => {} },
  });
  return { dom, runtime, chat, hooks, unload, messages, documentDeletes, worldDefaults,
    close() {
      runtime.stop();
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      dom.window.close();
    } };
}

describe('chat runtime lifecycle', () => {
  test('start is idempotent and stop removes only owned Hooks and unload callbacks before restart', async () => {
    const h = fixture();
    let foreign = 0;
    h.hooks.on('renderChatLog', () => { foreign++; });
    try {
      h.runtime.start();
      h.runtime.start();
      expect(h.hooks.count()).toBe(5);
      expect(h.unload.size).toBe(1);
      h.runtime.stop();
      expect(h.hooks.count()).toBe(1);
      expect(h.unload.size).toBe(0);
      await h.hooks.emit('renderChatLog', h.chat);
      expect(foreign).toBe(1);
      expect(h.runtime.getStats().moduleListenerCount).toBe(0);
      h.runtime.start();
      expect(h.hooks.count()).toBe(5);
      expect(h.unload.size).toBe(1);
      h.runtime.stop();
      expect(h.hooks.count()).toBe(1);
    } finally { h.close(); }
  });

  test('a late thumbnail after stop cannot overwrite a card restored by the host', async () => {
    let finish!: (value: CreatedThumbnail) => void;
    const revoked: string[] = [];
    const h = fixture(0, { create: () => new Promise(resolve => { finish = resolve; }), revoke: url => revoked.push(url) });
    const card = h.dom.window.document.createElement('article');
    card.innerHTML = '<div class="message-header"><div class="message-sender"><div class="avatar"><img src="original.png"></div></div></div>';
    try {
      h.runtime.start();
      const applying = h.runtime.processAvatar({ isContentVisible: true, speakerActor: { img: 'synthetic.png' } }, card);
      h.runtime.stop();
      card.querySelector('img')!.setAttribute('src', 'host-restored.png');
      finish({ url: 'blob:late', bytes: 10 });
      await applying;
      expect(card.querySelector('img')!.getAttribute('src')).toBe('host-restored.png');
      expect(revoked).toEqual(['blob:late']);
      expect(h.runtime.getStats().thumbnailCacheEntries).toBe(0);
    } finally { h.close(); }
  });

  test('closing one window during refresh still refreshes the other attached window', async () => {
    const h = fixture(1);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const popoutElement = h.dom.window.document.createElement('section');
    popoutElement.innerHTML = '<div class="chat-scroll"><ol class="chat-log"><li class="message" data-message-id="m0"></li></ol></div>';
    let popoutRefreshes = 0;
    const popout = { rendered: true, isAtBottom: true, element: popoutElement,
      deleteMessage: async () => {}, updateMessage: async () => { popoutRefreshes++; } };
    Object.assign(h.chat, { popout, updateMessage: async () => { started(); await gate; } });
    try {
      h.runtime.start();
      const refresh = h.runtime.refresh();
      await entered;
      h.runtime.detachChat(h.chat);
      release();
      await refresh;
      expect(popoutRefreshes).toBe(1);
      expect(h.runtime.getStats().moduleListenerCount).toBe(1);
      expect(h.documentDeletes).toEqual([]);
    } finally { release(); h.close(); }
  });

  test.each(['detach', 'disable'] as const)('%s during an awaited DOM removal stops the rest of the batch and future retries', async (mode) => {
    const h = fixture(22);
    const deleted: string[] = [];
    const timers: Array<() => void> = [];
    let release!: () => void;
    let firstStarted!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { firstStarted = resolve; });
    const originalSet = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    globalThis.setTimeout = ((callback: () => void) => { timers.push(callback); return timers.length; }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
    h.chat.deleteMessage = async id => {
      deleted.push(id);
      if (deleted.length === 1) { firstStarted(); await gate; }
      h.chat.element.querySelector(`[data-message-id="${id}"]`)?.remove();
    };
    try {
      h.runtime.start();
      await started;
      if (mode === 'detach') h.runtime.detachChat(h.chat);
      else { h.worldDefaults.enabled = false; await h.runtime.refresh(); }
      release();
      await Bun.sleep(0);
      expect(deleted).toHaveLength(1);
      expect(timers).toHaveLength(0);
      expect(h.messages.size).toBe(22);
      expect(h.documentDeletes).toEqual([]);
    } finally {
      release();
      h.close();
      globalThis.setTimeout = originalSet;
      globalThis.clearTimeout = originalClear;
    }
  });

  test('increasing retention during a pending removal cancels the rest of the old settings batch', async () => {
    const h = fixture(22);
    const deleted: string[] = [];
    let release!: () => void;
    let firstStarted!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { firstStarted = resolve; });
    h.chat.deleteMessage = async id => {
      deleted.push(id);
      if (deleted.length === 1) { firstStarted(); await gate; }
      h.chat.element.querySelector(`[data-message-id="${id}"]`)?.remove();
    };
    try {
      h.runtime.start();
      await entered;
      h.worldDefaults.retainedMessages = 22;
      const refresh = h.runtime.refresh();
      release();
      await refresh;
      await Bun.sleep(0);
      expect(deleted).toHaveLength(1);
      expect(h.runtime.getStats().renderedMessages).toBe(21);
      expect(h.messages.size).toBe(22);
      expect(h.documentDeletes).toEqual([]);
    } finally { release(); h.close(); }
  });
});
