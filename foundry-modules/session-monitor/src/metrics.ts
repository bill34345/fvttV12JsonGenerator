import { BrowserEvidenceRecorder, type BrowserEvidenceScope } from './browser-evidence';
import {
  percentile,
  type BrowserEvidenceWindow,
  type BrowserSample,
  type FrameWindow,
  type LongTaskWindow,
} from './schema';

interface MemoryPerformance extends Performance {
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
}

export interface MetricGlobals {
  document?: Document;
  performance?: MemoryPerformance;
  game?: any;
  canvas?: any;
  foundry?: any;
  ui?: any;
  MidiQOL?: any;
  Sequencer?: any;
}

export class StallWindowAccumulator {
  readonly #globals: Pick<typeof globalThis, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
  #frameId: number | null = null;
  #lastFrame: number | null = null;
  #frameDeltas: number[] = [];
  #longTasks: Array<Pick<PerformanceEntry, 'startTime' | 'duration'>> = [];
  #observer?: PerformanceObserver;
  #longTaskSupported = false;
  #startedAt = 0;
  readonly #evidence = new BrowserEvidenceRecorder();

  constructor(globals: Pick<typeof globalThis, 'requestAnimationFrame' | 'cancelAnimationFrame'> = globalThis) {
    this.#globals = globals;
  }

  start(scope?: BrowserEvidenceScope): void {
    if (this.#frameId !== null) return;
    this.#startedAt = performance.now();
    this.#evidence.start(scope, this.#startedAt);
    const frame = (timestamp: number) => {
      if (this.#lastFrame !== null) {
        const duration = Math.max(0, timestamp - this.#lastFrame);
        this.#frameDeltas.push(duration);
        this.#evidence.frame(this.#lastFrame, duration);
      }
      this.#lastFrame = timestamp;
      this.#frameId = this.#globals.requestAnimationFrame(frame);
    };
    this.#frameId = this.#globals.requestAnimationFrame(frame);
    try {
      if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) return;
      this.#observer = new PerformanceObserver((list) => this.#addLongTasks(list.getEntries()));
      this.#observer.observe({ type: 'longtask' });
      this.#longTaskSupported = true;
    } catch {
      this.#observer = undefined;
    }
  }

  take(): {
    frames: FrameWindow; longTasks: LongTaskWindow; longTaskSupported: boolean;
    browserEvidence?: BrowserEvidenceWindow;
  } {
    this.#addLongTasks(this.#observer?.takeRecords() ?? []);
    const frames = this.#frameDeltas;
    const longTasks = this.#longTasks;
    const longest = longTasks.reduce<(typeof longTasks)[number] | undefined>(
      (best, task) => !best || task.duration > best.duration ? task : best,
      undefined,
    );
    this.#frameDeltas = [];
    this.#longTasks = [];
    return {
      frames: {
        count: frames.length,
        p95Ms: percentile(frames, 0.95),
        p99Ms: percentile(frames, 0.99),
        maxMs: frames.length ? Math.max(...frames) : null,
        over50Ms: frames.filter((value) => value > 50).length,
        over100Ms: frames.filter((value) => value > 100).length,
        over250Ms: frames.filter((value) => value > 250).length,
      },
      longTasks: {
        count: longTasks.length,
        totalMs: longTasks.reduce((sum, task) => sum + task.duration, 0),
        maxMs: longest?.duration ?? 0,
        ...(longest ? { longestStartedAt: new Date(performance.timeOrigin + longest.startTime).toISOString() } : {}),
      },
      longTaskSupported: this.#longTaskSupported,
      browserEvidence: this.#evidence.take(this.#longTaskSupported),
    };
  }

  stop(keepWindow = false): void {
    if (this.#frameId !== null) this.#globals.cancelAnimationFrame(this.#frameId);
    this.#frameId = null;
    this.#lastFrame = null;
    if (keepWindow) {
      this.#addLongTasks(this.#observer?.takeRecords() ?? []);
    } else {
      this.#frameDeltas = [];
      this.#longTasks = [];
      this.#longTaskSupported = false;
    }
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.#evidence.stop(keepWindow);
  }

  #addLongTasks(entries: PerformanceEntry[]): void {
    for (const { startTime, duration } of entries) {
      if (startTime < this.#startedAt) continue;
      this.#longTasks.push({ startTime, duration });
      this.#evidence.longTask(startTime, duration);
    }
  }
}

export function collectBrowserSample(input: {
  globals: MetricGlobals;
  sequence: number;
  startedAt: string;
  expectedAt: number;
  sceneAlias: string | null;
  combatAlias: string | null;
  stalls: ReturnType<StallWindowAccumulator['take']>;
  timestamp?: string;
}): BrowserSample {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const { globals } = input;
  const gaps: string[] = [];
  const memory = globals.performance?.memory;
  if (!memory) gaps.push('performance.memory');
  if (!input.stalls.longTaskSupported) gaps.push('PerformanceObserver.longtask');
  const texture = safeNumber(() => globals.foundry?.canvas?.TextureLoader?.approximateTotalMemoryUsage);
  if (texture === null) gaps.push('TextureLoader.approximateTotalMemoryUsage');
  const midi = readMidi(globals.MidiQOL);
  if (midi.workflows === null) gaps.push('MidiQOL.Workflow.workflows');
  const sequencerEffects = safeNumber(() => globals.Sequencer?.EffectManager?.getEffects?.({})?.length);
  if (sequencerEffects === null) gaps.push('Sequencer.EffectManager.getEffects');

  const now = Date.parse(timestamp);
  return {
    sequence: input.sequence,
    timestamp,
    elapsedMs: Math.max(0, now - Date.parse(input.startedAt)),
    visibility: globals.document?.visibilityState ?? 'unknown',
    canvasReady: globals.canvas?.ready === true,
    sceneAlias: input.sceneAlias,
    combatAlias: input.combatAlias,
    round: finiteOrNull(globals.game?.combat?.round),
    turn: finiteOrNull(globals.game?.combat?.turn),
    heap: {
      usedBytes: finiteOrNull(memory?.usedJSHeapSize),
      totalBytes: finiteOrNull(memory?.totalJSHeapSize),
      limitBytes: finiteOrNull(memory?.jsHeapSizeLimit),
    },
    dom: {
      elements: globals.document?.getElementsByTagName?.('*').length ?? 0,
      chatCards: globals.document?.querySelectorAll?.('.chat-log .message[data-message-id]').length ?? 0,
      chatMessages: finiteOrZero(globals.game?.messages?.size),
      openWindows: readOpenWindows(globals),
    },
    textureApproxBytes: texture,
    midi,
    sequencerEffects,
    timerDriftMs: Math.max(0, Date.now() - input.expectedAt),
    frames: input.stalls.frames,
    longTasks: input.stalls.longTasks,
    ...(input.stalls.browserEvidence ? { browserEvidence: input.stalls.browserEvidence } : {}),
    capabilityGaps: gaps,
  };
}

function readMidi(midiQol: any): BrowserSample['midi'] {
  try {
    const workflows = midiQol?.Workflow?.workflows;
    if (!(workflows instanceof Map)) return { workflows: null, liveWeakRefs: null };
    let live = 0;
    for (const value of workflows.values()) {
      if (typeof WeakRef !== 'undefined' && value instanceof WeakRef) {
        if (value.deref()) live++;
      } else if (value) live++;
    }
    return { workflows: workflows.size, liveWeakRefs: live };
  } catch {
    return { workflows: null, liveWeakRefs: null };
  }
}

function readOpenWindows(globals: MetricGlobals): number {
  const instances = globals.foundry?.applications?.instances;
  if (instances && Number.isFinite(instances.size)) return instances.size;
  return Object.values(globals.ui?.windows ?? {}).filter((window: any) => window?.rendered === true).length;
}

function safeNumber(read: () => unknown): number | null {
  try {
    return finiteOrNull(read());
  } catch {
    return null;
  }
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finiteOrZero(value: unknown): number {
  return finiteOrNull(value) ?? 0;
}
