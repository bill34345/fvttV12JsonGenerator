import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { renderMarkerEvidence } from '../companion/marker-evidence';
import { StallWindowAccumulator } from './metrics';
import { SessionMonitorRuntime } from './runtime';
import { MemorySessionStore, type SessionRecord } from './storage';
import type { SessionMeta } from './schema';

test('connects the native control, own turn update and tracker render using observation time', async () => {
  const dom = new JSDOM('<button data-action="nextTurn">Outside</button><aside id="combat"><button data-action="nextTurn"><span>Private label</span></button></aside>');
  const document = dom.window.document;
  const callbacks = new Map<string, (...args: any[]) => void>();
  const combat = { id: 'private-combat-id', round: 1, turn: 0 };
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const store = new class extends MemorySessionStore {
    override async commitRecord(meta: SessionMeta, record: SessionRecord): Promise<void> {
      if (record.kind === 'event' && record.value.kind === 'combat-control') await gate;
      await super.commitRecord(meta, record);
    }
  }();
  const runtime = new SessionMonitorRuntime({
    document, window: dom.window as unknown as Window, canvas: { scene: { id: 'private-scene-id' } },
    game: { user: { isGM: true, id: 'gm-id' }, world: { id: 'private-world' }, modules: new Map(), combat },
    ui: { combat: { viewed: combat } },
    Hooks: {
      on(name: string, callback: (...args: any[]) => void) { callbacks.set(name, callback); return name; },
      off(name: string) { callbacks.delete(name); },
    },
  }, store, new StallWindowAccumulator({
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  }));
  const fire = (name: string, ...args: unknown[]) => callbacks.get(name)?.(...args);
  try {
    await runtime.startSession();
    document.querySelector('body > button')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const click = new dom.window.MouseEvent('click', { bubbles: true });
    Object.defineProperty(click, 'timeStamp', { value: performance.now() });
    document.querySelector('#combat span')?.dispatchEvent(click);
    const desired = { round: 1, turn: 1 };
    fire('combatTurn', combat, desired);
    combat.turn = 1;
    fire('updateCombat', combat, { turn: 1 }, {}, 'other-user');
    fire('renderCombatTracker', { viewed: combat });
    fire('updateCombat', combat, { unrelated: true }, {}, 'gm-id');
    fire('updateCombat', combat, { turn: 1 }, {}, 'gm-id');
    fire('renderCombatTracker', { viewed: { ...combat, id: 'other-combat' } });
    fire('renderCombatTracker', { viewed: combat });
    fire('renderCombatTracker', { viewed: combat });
    const brokenImage = document.createElement('img');
    brokenImage.src = 'http://example.test/private-resource-name.webp';
    document.body.append(brokenImage);
    brokenImage.dispatchEvent(new dom.window.Event('error'));
    const markerObservedBy = Date.now() + 1;
    const mark = runtime.markJank();
    await Bun.sleep(25);
    release();
    await mark;
    const exported = (await runtime.stopSession({ download: false }))!;
    const phases = exported.events.filter(event => event.combatTiming);
    expect(phases.map(event => event.kind)).toEqual(['combat-control', 'combat-update', 'combat-tracker-render']);
    expect(phases.every(event => event.combatTiming?.clickedAt === phases[0]?.timestamp)).toBeTrue();
    expect(phases[0]!.combatTiming?.control).toBe('next-turn');
    expect(phases[1]!.combatAlias).toBe(phases[0]!.combatAlias);
    const marker = exported.events.find(event => event.kind === 'jank-marker')!;
    expect(Date.parse(marker.timestamp)).toBeLessThanOrEqual(markerObservedBy);
    const report = renderMarkerEvidence(exported, marker).join('\n');
    expect(report).toContain('收到战斗更新');
    expect(report).toContain('战斗列表重绘结束');
    expect(report).not.toContain('下一步');
    expect(report).toContain('resource-error／ResourceLoadError:img');
    expect(Date.parse(exported.errors[0]!.timestamp)).toBeLessThanOrEqual(markerObservedBy);
    expect(report).not.toContain('private-resource-name');
    expect(JSON.stringify(exported)).not.toMatch(/private-(combat|scene|world)|Private label|gm-id|other-user/);
    expect(callbacks.size).toBe(0);
  } finally {
    release();
    await runtime.stopSession({ download: false });
    dom.window.close();
  }
});

test('keeps queued long-task onset when stopping before the next periodic sample', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'PerformanceObserver');
  const pending: Array<{startTime: number; duration: number}> = [];
  class StubObserver {
    static supportedEntryTypes = ['longtask'];
    observe() {}
    takeRecords() { return pending.splice(0); }
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'PerformanceObserver', { configurable: true, value: StubObserver });
  try {
    const stalls = new StallWindowAccumulator({ requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} });
    stalls.start();
    const time = performance.now();
    pending.push({startTime: 0, duration: 600}, {startTime: time + 100, duration: 60}, {startTime: time + 240, duration: 125});
    stalls.stop(true);
    expect(stalls.take()).toMatchObject({
      longTasks: {
        count: 2, totalMs: 185, maxMs: 125,
        longestStartedAt: new Date(performance.timeOrigin + time + 240).toISOString(),
      },
      longTaskSupported: true,
    });
    expect(stalls.take().longTasks.count).toBe(0);
  } finally {
    if (original) Object.defineProperty(globalThis, 'PerformanceObserver', original);
    else Reflect.deleteProperty(globalThis, 'PerformanceObserver');
  }
});
