import { afterEach, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { DeckListEllipsis } from '../src/list-ellipsis.ts';

const oldResize = globalThis.ResizeObserver, oldStyle = globalThis.getComputedStyle;
afterEach(() => { globalThis.ResizeObserver = oldResize;globalThis.getComputedStyle = oldStyle; });

describe('single-line list ellipsis', () => {
  test('keeps complete name/status tooltips, omits whole content and restores it after resize or rebind', () => {
    const document = new JSDOM(`<main><strong data-osd-ellipsis data-osd-name="超长名字ABCDEFGHI" title="超长名字ABCDEFGHI"><span class="osd-ellipsis-content">超长名字ABCDEFGHI</span><span class="osd-ellipsis-marker" hidden>……</span></strong><div data-osd-ellipsis title="目盲、耳聋、恐慌、受擒"><span class="osd-ellipsis-content" style="display:flex;gap:5px"><span>目盲</span><span>耳聋</span><span>恐慌</span><span>受擒</span></span><span class="osd-ellipsis-marker" hidden>……</span></div></main>`).window.document;
    globalThis.getComputedStyle = document.defaultView!.getComputedStyle.bind(document.defaultView);
    let resize!: () => void, disconnected = 0, width = 80;
    Object.defineProperty(document.defaultView, 'ResizeObserver', { value: class { constructor(callback: () => void) { resize = callback; }observe() {}disconnect() { disconnected++; } } });
    globalThis.ResizeObserver = class { constructor() { throw Error('Used the background parent observer'); } } as unknown as typeof ResizeObserver;
    const root = document.querySelector('main')!, name = root.querySelector('strong')!, status = root.querySelector('div[data-osd-ellipsis]')!;
    for (const element of [name, status]) Object.defineProperty(element, 'clientWidth', { get: () => width });
    for (const marker of root.querySelectorAll('.osd-ellipsis-marker')) marker.getBoundingClientRect = () => ({ width: 20 } as DOMRect);
    const content = status.querySelector('.osd-ellipsis-content')!;
    Object.defineProperty(content, 'scrollWidth', { get: () => 175 });
    for (const child of content.children) child.getBoundingClientRect = () => ({ width: 40 } as DOMRect);
    const view = new DeckListEllipsis((text) => [...text].length * 10);view.bind(root);
    expect(name.querySelector('.osd-ellipsis-content')!.textContent).toBe('超长名字AB');
    expect(name.querySelector<HTMLElement>('.osd-ellipsis-marker')!.hidden).toBeFalse();
    expect([...content.children].map(x => (x as HTMLElement).hidden)).toEqual([false, true, true, true]);
    expect(status.getAttribute('title')).toBe('目盲、耳聋、恐慌、受擒');
    expect(name.title).toBe('超长名字ABCDEFGHI');
    width = 200;resize();
    expect(name.querySelector('.osd-ellipsis-content')!.textContent).toBe('超长名字ABCDEFGHI');
    expect([...content.children].every(x => !(x as HTMLElement).hidden)).toBeTrue();
    expect(status.querySelector<HTMLElement>('.osd-ellipsis-marker')!.hidden).toBeTrue();
    width = 80;resize();view.bind(root);width = 200;resize();
    expect(name.querySelector('.osd-ellipsis-content')!.textContent).toBe('超长名字ABCDEFGHI');
    view.dispose();width = 20;resize();
    expect(name.querySelector('.osd-ellipsis-content')!.textContent).toBe('超长名字ABCDEFGHI');
    expect(disconnected).toBe(2);
  });
});
