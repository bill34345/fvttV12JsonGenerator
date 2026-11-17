import { afterEach, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { PANEL_POSITION_STORAGE_KEY, SessionMonitorRuntime, panelPositionsOverlap, serializePanelPositionPreference } from './runtime';
import { MemorySessionStore } from './storage';

const closeWindows: Array<() => void> = [];
afterEach(() => { for (const close of closeWindows.splice(0)) close(); });

async function layoutFixture() {
  const dom = new JSDOM('<!doctype html><body><aside id="sidebar"><section id="sidebar-content"><ol id="chat-log"><li class="chat-message"></li></ol><section class="combat-tracker"><li class="combatant"></li></section></section></aside></body>', {
    pretendToBeVisual: true, url: 'http://local-monitor.test',
  });
  closeWindows.push(() => dom.window.close());
  const window = dom.window;
  const frames: FrameRequestCallback[] = [];
  window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  const resizeCallbacks: ResizeObserverCallback[] = [];
  const observed: Element[] = [];
  (window as any).ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe(element: Element) { observed.push(element); }
  };
  Object.defineProperties(window, { innerWidth: { value: 1_280, writable: true }, innerHeight: { value: 720, writable: true } });
  let sidebarLeft = 980;
  let geometryReads = 0;
  window.Element.prototype.getBoundingClientRect = function () {
    geometryReads++;
    const panel = this.id === 'fvtt-session-monitor-panel';
    const left = panel ? Number.parseFloat((this as HTMLElement).style.left) || 12 : sidebarLeft;
    const top = panel ? Number.parseFloat((this as HTMLElement).style.top) || 12 : 0;
    const width = panel ? 288 : 1_280 - sidebarLeft;
    const height = panel ? 132 : 720;
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} };
  };
  window.localStorage.setItem(PANEL_POSITION_STORAGE_KEY, serializePanelPositionPreference({ left: 660, top: 500 }));
  const runtime = new SessionMonitorRuntime({ document: window.document, window: window as unknown as Window,
    game: { user: { isGM: true }, world: { id: 'synthetic-layout' }, modules: new Map() } }, new MemorySessionStore());
  await runtime.initialize();
  geometryReads = 0;
  return { window, frames, observed,
    panel: window.document.getElementById('fvtt-session-monitor-panel')!,
    sidebar: window.document.getElementById('sidebar')!,
    content: window.document.getElementById('sidebar-content')!,
    tracker: window.document.querySelector<HTMLElement>('.combat-tracker')!,
    card: window.document.querySelector<HTMLElement>('.chat-message')!,
    get reads() { return geometryReads; },
    setSidebarLeft(value: number) { sidebarLeft = value; },
    resize() { for (const callback of resizeCallbacks) callback([], {} as ResizeObserver); },
    flushFrame() { for (const callback of frames.splice(0)) callback(16); },
  };
}

test('chat-card and combatant attributes do not schedule or synchronously measure panel layout', async () => {
  const f = await layoutFixture();
  for (let i = 0; i < 6; i++) {
    f.card.classList.toggle('dsn-hidden', i % 2 === 0);
    f.card.style.opacity = String(i / 6);
    f.card.hidden = i % 2 === 0;
    f.tracker.querySelector('li')!.classList.toggle('dsn-initiative-pending', i % 2 === 0);
    await Promise.resolve();
  }
  expect(f.reads).toBe(0);
  expect(f.frames).toHaveLength(0);
});

test('sidebar geometry changes and resize observers coalesce until one animation frame', async () => {
  const f = await layoutFixture();
  expect(f.observed).toEqual([f.sidebar, f.content, f.tracker]);
  f.setSidebarLeft(700);
  f.sidebar.classList.add('collapsed');
  await Promise.resolve();
  f.content.style.width = '580px';
  await Promise.resolve();
  f.tracker.hidden = true;
  await Promise.resolve();
  f.resize();
  f.window.dispatchEvent(new f.window.Event('resize'));
  f.window.dispatchEvent(new f.window.Event('orientationchange'));
  expect(f.reads).toBe(0);
  expect(f.frames).toHaveLength(1);
  f.flushFrame();
  expect(f.reads).toBeGreaterThan(0);
  const position = { left: Number.parseFloat(f.panel.style.left), top: Number.parseFloat(f.panel.style.top) };
  expect(panelPositionsOverlap(position, { width: 288, height: 132 }, { left: 700, top: 0, right: 1_280, bottom: 720 }, 8)).toBeFalse();
  expect(f.frames).toHaveLength(0);
});

test('a later viewport resize schedules a new frame and keeps the panel inside the viewport', async () => {
  const f = await layoutFixture();
  f.window.dispatchEvent(new f.window.Event('resize'));
  f.flushFrame();
  Object.defineProperties(f.window, { innerWidth: { value: 640 }, innerHeight: { value: 400 } });
  f.window.dispatchEvent(new f.window.Event('resize'));
  expect(f.frames).toHaveLength(1);
  f.flushFrame();
  expect(Number.parseFloat(f.panel.style.left)).toBeLessThanOrEqual(640 - 288 - 12);
  expect(Number.parseFloat(f.panel.style.top)).toBeLessThanOrEqual(400 - 132 - 12);
});
