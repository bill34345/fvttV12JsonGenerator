import { expect, test } from 'bun:test';
import { BrowserEvidenceRecorder } from './browser-evidence';

test('records browser signals without raw URLs, input content, or DOM targets', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'PerformanceObserver');
  const entriesByType = new Map<string, unknown[]>();
  class Observer {
    static supportedEntryTypes = ['long-animation-frame', 'event', 'resource'];
    type = '';
    observe(options: { type: string }) { this.type = options.type; }
    disconnect() {}
    takeRecords() { return entriesByType.get(this.type)?.splice(0) ?? []; }
  }
  Object.defineProperty(globalThis, 'PerformanceObserver', { configurable: true, value: Observer });
  const recorder = new BrowserEvidenceRecorder();
  try {
    recorder.start({ origin: 'http://example.test', moduleIds: new Set(['known-mod']), systemId: 'dnd5e' }, 5);
    for (let index = 0; index < 20; index++) recorder.frame(5 + index, 50 + index);
    recorder.longTask(100, 75);
    entriesByType.set('long-animation-frame', [{
      entryType: 'long-animation-frame', startTime: 2, duration: 1000, blockingDuration: 500, styleAndLayoutStart: 900, scripts: [],
    }, {
      entryType: 'long-animation-frame', startTime: 110, duration: 170, blockingDuration: 95, styleAndLayoutStart: 210,
      scripts: [
        { sourceURL: 'http://example.test/modules/known-mod/private-name.js?secret=private-token',
          duration: 80, forcedStyleAndLayoutDuration: 40, invoker: 'private-selector' },
        { sourceURL: 'https://private-host.test/private-path.js', duration: 20, forcedStyleAndLayoutDuration: 0 },
        { sourceURL: 'http://example.test/modules/secret-alias/private-name.js', duration: 7, forcedStyleAndLayoutDuration: 0 },
      ],
    }]);
    entriesByType.set('event', [{
      entryType: 'event', startTime: 120, duration: 88, name: 'click', processingStart: 140, processingEnd: 160,
      target: { textContent: 'private-character-name' },
    }]);
    entriesByType.set('resource', [
      { entryType: 'resource', startTime: 200, duration: 12, responseStatus: 404, initiatorType: 'img',
        name: 'http://example.test/worlds/private-world/private-image.webp' },
      { entryType: 'resource', startTime: 210, duration: 430, initiatorType: 'fetch',
        name: 'http://example.test/systems/dnd5e/private-route?secret=private-token' },
      { entryType: 'resource', startTime: 220, duration: 100, responseStatus: 200, initiatorType: 'fetch',
        name: 'http://example.test/video/private-route' },
    ]);
    recorder.stop(true);
    const captured = recorder.take(true);
    expect(captured.unavailable).toEqual([]);
    expect(captured.omitted['frame-gap']).toBe(8);
    const frames = captured.records.filter(entry => entry.kind === 'frame-gap');
    expect(frames.map(entry => entry.durationMs)).toEqual(Array.from({ length: 12 }, (_, index) => 58 + index));
    expect(captured.records).toContainEqual({
      kind: 'long-task', startMs: Math.round(performance.timeOrigin + 100), durationMs: 75,
    });
    const longFrames = captured.records.filter(entry => entry.kind === 'long-frame');
    expect(longFrames).toHaveLength(1);
    expect(longFrames[0]).toMatchObject({
      blockingMs: 95, layoutOffsetMs: 100, scripts: [
        { owner: 'module:known-mod', durationMs: 80, forcedLayoutMs: 40 },
        { owner: 'external' }, { owner: 'same-origin' },
      ],
    });
    expect(captured.records.find(entry => entry.kind === 'interaction')).toMatchObject({
      event: 'click', inputDelayMs: 20, handlerMs: 20,
    });
    expect(captured.records.filter(entry => entry.kind === 'resource')).toMatchObject([
      { owner: 'same-origin', status: 404, durationMs: 12 },
      { owner: 'system:dnd5e', status: undefined, durationMs: 430 },
    ]);
    expect(JSON.stringify(captured)).not.toMatch(/https?:|private-|secret-alias/);
    expect(recorder.take(false)).toEqual({ records: [], omitted: {}, unavailable: ['long-task'] });
  } finally {
    recorder.stop(false);
    if (previous) Object.defineProperty(globalThis, 'PerformanceObserver', previous);
    else Reflect.deleteProperty(globalThis, 'PerformanceObserver');
  }
});
