import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { ChatMemoryGuardRuntime } from '../runtime';

describe('native history loading while chat is hidden', () => {
  test('stopping restores an inherited loader without changing the Core prototype', () => {
    const dom = new JSDOM('<section><div class="chat-scroll"><ol class="chat-log"></ol></div></section>');
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver');
    globalThis.MutationObserver = dom.window.MutationObserver;
    const native = () => Promise.resolve();
    const prototype = { renderBatch: native };
    const chat = Object.assign(Object.create(prototype), { rendered: true, isAtBottom: true,
      element: dom.window.document.querySelector('section'), deleteMessage: async () => {} });
    const runtime = new ChatMemoryGuardRuntime({ game: { settings: { get: () => undefined } },
      hooks: { on: () => 1, off: () => {} }, ui: { chat } });
    try {
      runtime.start();
      expect(Object.hasOwn(chat, 'renderBatch')).toBe(true);
      expect(prototype.renderBatch).toBe(native);
      runtime.stop();
      expect(Object.hasOwn(chat, 'renderBatch')).toBe(false);
      expect(chat.renderBatch).toBe(native);
      expect(prototype.renderBatch).toBe(native);
    } finally {
      runtime.stop();
      if (previous) Object.defineProperty(globalThis, 'MutationObserver', previous);
      else delete (globalThis as any).MutationObserver;
      dom.window.close();
    }
  });

  test('keeps the DOM cap without invoking native pagination at zero height, then delegates visible history', async () => {
    const dom = new JSDOM('<section><div class="chat-scroll"><ol class="chat-log"></ol></div></section>');
    const names = ['HTMLElement', 'MutationObserver'] as const;
    const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    Object.assign(globalThis, { HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver });
    const log = dom.window.document.querySelector('.chat-log')!;
    const scroll = dom.window.document.querySelector('.chat-scroll')!;
    let height = 0;
    Object.defineProperty(scroll, 'clientHeight', { get: () => height });
    const messages = new Map(Array.from({ length: 25 }, (_, i) => [`m${i}`, { id: `m${i}` }]));
    for (const id of messages.keys()) {
      const card = dom.window.document.createElement('li');
      card.className = 'message'; card.dataset.messageId = id; log.append(card);
    }
    const nativeCalls: unknown[][] = [];
    const nativeResult = Promise.resolve('native history');
    const nativeBatch = function(this: unknown, ...args: unknown[]) { nativeCalls.push([this, ...args]); return nativeResult; };
    const chat = { rendered: true, isAtBottom: true, element: dom.window.document.querySelector('section')!,
      renderBatch: nativeBatch,
      async deleteMessage(id: string) {
        log.querySelector(`[data-message-id="${id}"]`)?.remove();
        // Core14.369 invokes history pagination from the deletion callback when scroll geometry is zero.
        if (!height) await chat.renderBatch(100);
      },
    };
    const settings = { enabled: true, retainedMessages: 20, imageMode: 'original' };
    const runtime = new ChatMemoryGuardRuntime({
      game: { settings: { get: (_module: string, key: string) => key === 'worldDefaults' ? settings : undefined },
        user: { isGM: true }, messages }, hooks: { on: () => 1, off: () => {} }, ui: { chat },
    });
    try {
      runtime.start();
      await Bun.sleep(10);
      expect(log.children.length).toBe(20);
      expect(messages.size).toBe(25);
      expect(nativeCalls.length).toBe(0);
      expect(chat.renderBatch(100)).not.toBe(nativeResult);
      height = 400;
      expect(chat.renderBatch(30)).toBe(nativeResult);
      expect(nativeCalls.length).toBe(1);
      expect(nativeCalls[0]![0]).toBe(chat);
      expect(nativeCalls[0]!.slice(1)).toEqual([30]);
      height = 0;
      settings.enabled = false;
      await runtime.refresh();
      expect(chat.renderBatch(40)).toBe(nativeResult);
      expect(nativeCalls.at(-1)![0]).toBe(chat);
      expect(nativeCalls.at(-1)!.slice(1)).toEqual([40]);
      runtime.detachChat(chat);
      expect(chat.renderBatch).toBe(nativeBatch);
    } finally {
      runtime.stop();
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete (globalThis as any)[name];
      }
      dom.window.close();
    }
  });
});
