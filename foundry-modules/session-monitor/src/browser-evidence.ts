import type { BrowserEvidenceWindow, BrowserSignal, BrowserSignalKind } from './schema';

const PER_KIND_LIMIT = 12;
const SCRIPT_LIMIT = 4;
const RESOURCE_MIN_MS = 250;
const SLOW_INPUT_MS = 40;
const FRAME_GAP_MS = 50;
const kinds: BrowserSignalKind[] = ['frame-gap', 'long-task', 'long-frame', 'interaction', 'resource'];
const initiators = new Set(['fetch', 'xmlhttprequest', 'img', 'script', 'link', 'css', 'audio', 'video', 'font', 'iframe']);
const inputTypes = new Set(['click', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'wheel', 'touchstart', 'touchend']);

export interface BrowserEvidenceScope {
  origin: string;
  moduleIds: ReadonlySet<string>;
  systemId: string;
}

interface ScriptTiming {
  sourceURL: string;
  duration: number;
  forcedStyleAndLayoutDuration: number;
}

interface LongFrameEntry extends PerformanceEntry {
  blockingDuration: number;
  styleAndLayoutStart: number;
  scripts: readonly ScriptTiming[];
}

export class BrowserEvidenceRecorder {
  #scope?: BrowserEvidenceScope;
  #startedAt = 0;
  #observers: PerformanceObserver[] = [];
  #available: BrowserSignalKind[] = [];
  #records = new Map<BrowserSignalKind, BrowserSignal[]>();
  #omitted: BrowserEvidenceWindow['omitted'] = {};

  start(scope: BrowserEvidenceScope | undefined, startedAt: number): void {
    this.#scope = scope;
    this.#startedAt = startedAt;
    this.#available = ['frame-gap'];
    this.#observe('long-animation-frame', 'long-frame');
    this.#observe('event', 'interaction', SLOW_INPUT_MS);
    this.#observe('resource', 'resource');
  }

  frame(startTime: number, duration: number): void {
    if (duration >= FRAME_GAP_MS) this.#keep({ kind: 'frame-gap', ...timing(startTime, duration) });
  }

  longTask(startTime: number, duration: number): void {
    this.#keep({ kind: 'long-task', ...timing(startTime, duration) });
  }

  take(longTaskSupported: boolean): BrowserEvidenceWindow {
    this.#drain();
    const records = [...this.#records.values()].flat().sort((left, right) => left.startMs - right.startMs);
    const omitted = this.#omitted;
    this.#records.clear();
    this.#omitted = {};
    return {
      records, omitted,
      unavailable: kinds.filter(kind => kind === 'long-task' ? !longTaskSupported : !this.#available.includes(kind)),
    };
  }

  stop(keepWindow: boolean): void {
    if (keepWindow) this.#drain();
    for (const observer of this.#observers) observer.disconnect();
    this.#observers = [];
    if (!keepWindow) {
      this.#records.clear();
      this.#omitted = {};
      this.#available = [];
    }
  }

  #observe(type: string, kind: BrowserSignalKind, durationThreshold?: number): void {
    if (!globalThis.PerformanceObserver?.supportedEntryTypes.includes(type)) return;
    const options: PerformanceObserverInit & { durationThreshold?: number } = { type, durationThreshold };
    try {
      const observer = new PerformanceObserver(list => this.#addEntries(list.getEntries()));
      observer.observe(options);
      this.#observers.push(observer);
      this.#available.push(kind);
    } catch {
      // Report a missing source if this browser rejects the observer.
    }
  }

  #drain(): void {
    for (const observer of this.#observers) this.#addEntries(observer.takeRecords());
  }

  #addEntries(entries: PerformanceEntry[]): void {
    for (const entry of entries) {
      if (entry.startTime < this.#startedAt) continue;
      switch (entry.entryType) {
        case 'long-animation-frame':
          this.#recordFrame(entry as LongFrameEntry);
          break;
        case 'event':
          this.#recordInteraction(entry as PerformanceEventTiming);
          break;
        case 'resource':
          this.#recordResource(entry as PerformanceResourceTiming);
          break;
      }
    }
  }

  #recordFrame(entry: LongFrameEntry): void {
    const scripts = [...(entry.scripts ?? [])]
      .sort((left, right) => right.duration - left.duration)
      .slice(0, SCRIPT_LIMIT)
      .map(script => ({
        owner: resourceOwner(script.sourceURL, this.#scope),
        durationMs: Math.round(script.duration),
        forcedLayoutMs: Math.round(script.forcedStyleAndLayoutDuration),
      }));
    this.#keep({
      kind: 'long-frame', ...timing(entry.startTime, entry.duration),
      blockingMs: Math.round(entry.blockingDuration),
      layoutOffsetMs: entry.styleAndLayoutStart ? Math.round(entry.styleAndLayoutStart - entry.startTime) : undefined,
      scripts,
    });
  }

  #recordInteraction(entry: PerformanceEventTiming): void {
    if (entry.duration < SLOW_INPUT_MS || !inputTypes.has(entry.name)) return;
    this.#keep({
      kind: 'interaction', ...timing(entry.startTime, entry.duration), event: entry.name,
      inputDelayMs: Math.round(entry.processingStart - entry.startTime),
      handlerMs: Math.round(entry.processingEnd - entry.processingStart),
    });
  }

  #recordResource(entry: PerformanceResourceTiming): void {
    const status = entry.responseStatus > 0 ? entry.responseStatus : undefined;
    if (entry.duration < RESOURCE_MIN_MS && (status ?? 0) < 400) return;
    this.#keep({
      kind: 'resource', ...timing(entry.startTime, entry.duration),
      initiator: initiators.has(entry.initiatorType) ? entry.initiatorType : 'other',
      owner: resourceOwner(entry.name, this.#scope), status,
    });
  }

  #keep(signal: BrowserSignal): void {
    const entries = this.#records.get(signal.kind) ?? [];
    if (entries.length < PER_KIND_LIMIT) {
      entries.push(signal);
      this.#records.set(signal.kind, entries);
      return;
    }
    const shortest = entries.reduce((best, item, index) => priority(item) < priority(entries[best]!) ? index : best, 0);
    if (priority(signal) > priority(entries[shortest]!)) entries[shortest] = signal;
    this.#omitted[signal.kind] = (this.#omitted[signal.kind] ?? 0) + 1;
  }
}

function timing(startTime: number, duration: number) {
  return { startMs: Math.round(performance.timeOrigin + startTime), durationMs: Math.round(duration) };
}

function priority(signal: BrowserSignal): number {
  return signal.kind === 'resource' && (signal.status ?? 0) >= 400 ? Infinity : signal.durationMs;
}

function resourceOwner(raw: string, scope?: BrowserEvidenceScope): string | undefined {
  if (!scope?.origin || !raw) return undefined;
  try {
    const url = new URL(raw, scope.origin);
    if (url.origin !== scope.origin) return 'external';
    const [area, id] = url.pathname.split('/').filter(Boolean);
    if (area === 'modules' && id && scope.moduleIds.has(id)) return 'module:' + id;
    if (area === 'systems' && id === scope.systemId) return 'system:' + id;
    if (area === 'scripts' || area === 'client') return 'core';
    return 'same-origin';
  } catch {
    return undefined;
  }
}
