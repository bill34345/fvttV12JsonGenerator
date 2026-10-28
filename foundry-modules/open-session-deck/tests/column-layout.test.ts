import { afterEach, describe, expect, test } from 'bun:test';
import { DeckColumnLayout } from '../src/column-layout.ts';

const originalObserver = globalThis.ResizeObserver;
afterEach(() => { globalThis.ResizeObserver = originalObserver; });

function fixture(initialWidth = 2010) {
  let width = initialWidth;
  let capture: number | undefined;
  let disconnected = false;
  let resize: () => void = () => {};
  const events = new Map<string, EventListener>();
  const style = new Map<string, string>();
  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  const columns = {
    getBoundingClientRect: () => ({ left: 100, width }),
    style: { setProperty: (name: string, value: string) => style.set(name, value) },
    classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
  };
  const share = () => Number.parseFloat(style.get('--osd-party-track') ?? '0');
  const handle = {
    getBoundingClientRect: () => ({ left: 100 + (width - 10) * share() / 100, width: 10 }),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    addEventListener: (name: string, listener: EventListener) => events.set(name, listener),
    removeEventListener: (name: string) => events.delete(name),
    setPointerCapture: (id: number) => { capture = id; },
    hasPointerCapture: (id: number) => capture === id,
    releasePointerCapture: () => { capture = undefined; },
    focus: () => {},
  };
  globalThis.ResizeObserver = class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  } as any;
  return {
    root: { querySelector: (selector: string) => selector === '.osd-columns' ? columns : handle } as unknown as HTMLElement,
    fire: (type: string, options: Record<string, unknown> = {}) => events.get(type)?.({
      pointerId: 1, button: 0, isPrimary: true, preventDefault: () => {}, stopPropagation: () => {}, ...options,
    } as unknown as Event),
    dragStart: () => events.get('pointerdown')?.({
      pointerId: 1, button: 0, isPrimary: true, clientX: handle.getBoundingClientRect().left + 5, preventDefault: () => {},
    } as unknown as Event),
    resize: (nextWidth: number) => { width = nextWidth; resize(); },
    share, attributes, classes,
    capture: () => capture,
    disconnected: () => disconnected,
    listeners: () => events.size,
  };
}

describe('Deck column resizing', () => {
  test('drags in surface coordinates, keeps the grab offset and bounds both columns', () => {
    const view = fixture();
    const layout = new DeckColumnLayout();
    layout.bind(view.root);
    view.dragStart();
    view.fire('pointermove', { clientX: 1305, pointerId: 2 });
    expect(view.share()).toBe(55);
    view.fire('pointermove', { clientX: 1305 });
    expect(view.share()).toBe(60);
    view.fire('pointermove', { clientX: 10000 });
    expect(view.share()).toBe(75);
    view.fire('pointermove', { clientX: -10000 });
    expect(view.share()).toBe(25);
    view.fire('pointerup');
    expect(view.capture()).toBeUndefined();
    expect(view.classes.has('osd-resizing')).toBeFalse();
    layout.dispose();
  });

  test('preserves the chosen split on snapshot replacement and disposes the old binding', () => {
    const layout = new DeckColumnLayout();
    const old = fixture();
    layout.bind(old.root);
    old.fire('keydown', { key: 'ArrowRight', shiftKey: true });
    expect(old.share()).toBe(65);
    old.dragStart();
    const next = fixture();
    layout.bind(next.root);
    expect(next.share()).toBe(65);
    expect(old.disconnected()).toBeTrue();
    expect(old.listeners()).toBe(0);
    expect(old.capture()).toBeUndefined();
    layout.dispose();
    expect(next.disconnected()).toBeTrue();
    expect(next.listeners()).toBe(0);
  });

  test('supports keyboard boundaries and reset, re-clamps on window resize, and isolates surfaces', () => {
    const view = fixture();
    const layout = new DeckColumnLayout();
    layout.bind(view.root);
    view.fire('keydown', { key: 'End' });
    expect(view.share()).toBe(75);
    view.resize(1010);
    expect(view.share()).toBe(68);
    expect(view.attributes.get('aria-valuemax')).toBe('68');
    expect(view.attributes.get('aria-valuenow')).toBe('68');
    view.fire('keydown', { key: 'Home' });
    expect(view.share()).toBe(42);
    let stopped = 0;
    view.fire('keydown', { key: 'Enter', stopPropagation: () => { stopped += 1; } });
    expect(view.share()).toBe(55);
    view.fire('keyup', { key: 'Enter', stopPropagation: () => { stopped += 1; } });
    expect(stopped).toBe(2);
    view.fire('keydown', { key: 'ArrowLeft' });
    expect(view.share()).toBe(53);
    view.fire('dblclick');
    expect(view.share()).toBe(55);
    const other = fixture();
    const otherLayout = new DeckColumnLayout();
    otherLayout.bind(other.root);
    view.fire('keydown', { key: 'ArrowRight' });
    expect(other.share()).toBe(55);
    layout.dispose();
    otherLayout.dispose();
  });

  test('ignores non-primary presses and releases capture after cancellation', () => {
    const view = fixture();
    const layout = new DeckColumnLayout();
    layout.bind(view.root);
    view.fire('pointerdown', { button: 2 });
    expect(view.capture()).toBeUndefined();
    view.fire('pointerdown', { isPrimary: false });
    expect(view.capture()).toBeUndefined();
    view.dragStart();
    expect(view.capture()).toBe(1);
    view.fire('pointercancel');
    expect(view.capture()).toBeUndefined();
    expect(view.classes.has('osd-resizing')).toBeFalse();
    layout.dispose();
  });
});
