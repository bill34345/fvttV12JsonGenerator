import { collectBrowserSample, StallWindowAccumulator, type MetricGlobals } from './metrics';
import {
  createSanitizedError,
  MAX_ERRORS,
  MAX_EVENTS,
  MAX_SAMPLES,
  MAX_SESSION_MS,
  MODULE_ID,
  SAMPLE_INTERVAL_MS,
  sha256Text,
  type MonitorEnvironment,
  type MonitorEvent,
  type MonitorEventKind,
  type SanitizedError,
  type SessionExport,
  type SessionMeta,
  type SessionStatus,
} from './schema';
import { IndexedDbSessionStore, type SessionStore } from './storage';
import { openMonitorHelp } from './help';

export const PANEL_POSITION_STORAGE_KEY = 'fvtt-session-monitor.ui-position.v1';
export const PANEL_POSITION_VERSION = 1;
export const PANEL_EDGE_SNAP_DISTANCE = 24;
export const PANEL_MARGIN = 12;
export const AUTO_COLLAPSE_DELAY_MS = 2_000;
export const TEMPORARY_EXPAND_DELAY_MS = 8_000;
const MAX_PERSISTED_POSITION = 100_000;
const DEFAULT_PANEL_WIDTH = 288;
const DEFAULT_PANEL_HEIGHT = 132;
const DEFAULT_COLLAPSED_PANEL_WIDTH = 224;
const DEFAULT_COLLAPSED_PANEL_HEIGHT = 42;

export interface PanelPosition {
  left: number;
  top: number;
}

export interface PanelViewport {
  width: number;
  height: number;
}

export interface PanelSize {
  width: number;
  height: number;
}

export interface PanelAvoidRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function panelSizeForState(state: 'expanded' | 'collapsed'): PanelSize {
  return state === 'collapsed'
    ? { width: DEFAULT_COLLAPSED_PANEL_WIDTH, height: DEFAULT_COLLAPSED_PANEL_HEIGHT }
    : { width: DEFAULT_PANEL_WIDTH, height: DEFAULT_PANEL_HEIGHT };
}

export function clampPanelPosition(
  position: PanelPosition,
  viewport: PanelViewport,
  size: PanelSize,
  margin = PANEL_MARGIN,
): PanelPosition {
  const maxLeft = Math.max(margin, viewport.width - size.width - margin);
  const maxTop = Math.max(margin, viewport.height - size.height - margin);
  return {
    left: clampFinite(position.left, margin, maxLeft, margin),
    top: clampFinite(position.top, margin, maxTop, margin),
  };
}

export function panelPositionsOverlap(
  position: PanelPosition,
  size: PanelSize,
  rect: PanelAvoidRect,
  gap = 0,
): boolean {
  return position.left < rect.right + gap
    && position.left + size.width > rect.left - gap
    && position.top < rect.bottom + gap
    && position.top + size.height > rect.top - gap;
}

export function avoidPanelPosition(
  preferred: PanelPosition,
  viewport: PanelViewport,
  size: PanelSize,
  avoidRects: PanelAvoidRect[],
  options: { margin?: number; gap?: number } = {},
): PanelPosition {
  const margin = options.margin ?? PANEL_MARGIN;
  const gap = options.gap ?? 8;
  let current = clampPanelPosition(preferred, viewport, size, margin);

  // A sidebar can be a full-height obstruction, so move away from each
  // visible interaction rectangle in turn and then verify all rectangles.
  for (let pass = 0; pass <= avoidRects.length; pass++) {
    const obstruction = avoidRects.find((rect) => panelPositionsOverlap(current, size, rect, gap));
    if (!obstruction) return current;
    const candidates = [
      { left: obstruction.left - size.width - gap, top: current.top },
      { left: obstruction.right + gap, top: current.top },
      { left: current.left, top: obstruction.top - size.height - gap },
      { left: current.left, top: obstruction.bottom + gap },
    ].map((candidate) => clampPanelPosition(candidate, viewport, size, margin));
    const valid = candidates.filter((candidate) => (
      !avoidRects.some((rect) => panelPositionsOverlap(candidate, size, rect, gap))
    ));
    const pool = valid.length ? valid : candidates;
    current = pool.reduce((best, candidate) => (
      distance(candidate, current) < distance(best, current) ? candidate : best
    ));
  }
  return current;
}

export function snapPanelPosition(
  position: PanelPosition,
  viewport: PanelViewport,
  size: PanelSize,
  distance = PANEL_EDGE_SNAP_DISTANCE,
  margin = PANEL_MARGIN,
): PanelPosition {
  const clamped = clampPanelPosition(position, viewport, size, margin);
  const maxLeft = Math.max(margin, viewport.width - size.width - margin);
  const maxTop = Math.max(margin, viewport.height - size.height - margin);
  return {
    left: clamped.left <= margin + distance ? margin : (maxLeft - clamped.left <= distance ? maxLeft : clamped.left),
    top: clamped.top <= margin + distance ? margin : (maxTop - clamped.top <= distance ? maxTop : clamped.top),
  };
}

export function parsePanelPositionPreference(raw: string | null): PanelPosition | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { version?: unknown; left?: unknown; top?: unknown };
    if (value.version !== PANEL_POSITION_VERSION) return null;
    if (!isPersistableCoordinate(value.left) || !isPersistableCoordinate(value.top)) return null;
    return { left: value.left, top: value.top };
  } catch {
    return null;
  }
}

export function serializePanelPositionPreference(position: PanelPosition): string {
  return JSON.stringify({
    version: PANEL_POSITION_VERSION,
    left: clampFinite(position.left, -MAX_PERSISTED_POSITION, MAX_PERSISTED_POSITION, 0),
    top: clampFinite(position.top, -MAX_PERSISTED_POSITION, MAX_PERSISTED_POSITION, 0),
  });
}

function isPersistableCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && Math.abs(value) <= MAX_PERSISTED_POSITION;
}

function clampFinite(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function distance(left: PanelPosition, right: PanelPosition): number {
  return Math.abs(left.left - right.left) + Math.abs(left.top - right.top);
}

export interface SessionMonitorGlobals extends MetricGlobals {
  Hooks?: any;
  window?: Window;
  navigator?: Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
  crypto?: Crypto;
  URL?: typeof URL;
  Blob?: typeof Blob;
}

interface PanelDragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

interface EventContext {
  sceneId: unknown;
  combatId: unknown;
  round: number | null;
  turn: number | null;
}

export interface SessionMonitorApi {
  startSession(): Promise<SessionStatus>;
  markJank(): Promise<void>;
  stopSession(options?: { download?: boolean }): Promise<SessionExport | null>;
  getStatus(): SessionStatus;
  exportSession(sessionId?: string): Promise<SessionExport | null>;
  listSessions(): Promise<Array<Pick<SessionMeta, 'id' | 'state' | 'startedAt' | 'endedAt' | 'sampleSequence'>>>;
  deleteSession(sessionId: string): Promise<void>;
  setCompanionHeartbeat(input: { timestamp?: string; version?: string }): SessionStatus;
}

export class SessionMonitorRuntime {
  readonly #globals: SessionMonitorGlobals;
  readonly #store: SessionStore;
  readonly #stalls: StallWindowAccumulator;
  #meta: SessionMeta | null = null;
  #panel: HTMLElement | null = null;
  #panelPreference: PanelPosition | null = null;
  #drag: PanelDragState | null = null;
  #suppressNextPanelClick = false;
  #autoCollapseTimer: ReturnType<typeof setTimeout> | null = null;
  #temporaryExpandTimer: ReturnType<typeof setTimeout> | null = null;
  #layoutResizeObserver: ResizeObserver | null = null;
  #layoutMutationObserver: MutationObserver | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #nextExpectedAt = 0;
  #samplingPromise: Promise<void> | null = null;
  #startPromise: Promise<SessionStatus> | null = null;
  #stopPromise: Promise<SessionExport | null> | null = null;
  #writeQueue: Promise<void> = Promise.resolve();
  #writeFailure: unknown = null;
  #accepting = false;
  #stopEventWritten = false;
  #limitReached = false;
  #panelError = false;
  #hookIds: Array<[string, unknown]> = [];
  #eventHandlers: Array<[EventTarget, string, EventListener]> = [];
  #seenGaps = new Set<string>();
  #sensitiveValues: string[] = [];
  #companionLastSeenAt: string | null = null;
  #companionVersion: string | null = null;
  #recentMaxFrameGapMs: number | null = null;
  #recentLongTaskMaxMs = 0;

  constructor(
    globals: SessionMonitorGlobals = globalThis as unknown as SessionMonitorGlobals,
    store: SessionStore = new IndexedDbSessionStore(),
    stalls = new StallWindowAccumulator(),
  ) {
    this.#globals = globals;
    this.#store = store;
    this.#stalls = stalls;
  }

  get api(): SessionMonitorApi {
    const api: SessionMonitorApi = {
      startSession: () => this.startSession(),
      markJank: () => this.markJank(),
      stopSession: (options) => this.stopSession(options),
      getStatus: () => this.getStatus(),
      exportSession: (sessionId) => this.exportSession(sessionId),
      listSessions: () => this.listSessions(),
      deleteSession: (sessionId) => this.deleteSession(sessionId),
      setCompanionHeartbeat: (input) => this.setCompanionHeartbeat(input),
    };
    return Object.freeze(api);
  }

  async initialize(): Promise<void> {
    await this.#store.open();
    if (this.#globals.game?.user?.isGM !== true) return;
    this.#sensitiveValues = collectSensitiveValues(this.#globals.game);
    this.#mountPanel();
    const active = await this.#store.findActiveSession(this.#worldKey());
    if (active) {
      this.#requireGm();
      this.#meta = active;
      await this.#reconcileSession(active);
      this.#meta.refreshCount++;
      this.#meta.updatedAt = new Date().toISOString();
      await this.#store.updateSession(this.#meta);
      this.#requireGm();
      if (this.#limitReached || this.#stopEventWritten) {
        await this.stopSession({ download: false });
        this.#renderPanel();
        return;
      }
      this.#accepting = true;
      this.#beginCollection();
      await this.#recordEvent('session-resume', 'refresh');
    }
    this.#renderPanel();
  }

  async startSession(): Promise<SessionStatus> {
    this.#requireGm();
    if (this.#startPromise) return this.#startPromise;
    if (this.#stopPromise) return this.#stopPromise.then(() => this.startSession());
    if (this.#meta?.state === 'active' && this.#accepting) return this.getStatus();
    if (this.#meta?.state === 'active' && this.#limitReached) {
      await this.stopSession({ download: false });
      return this.getStatus();
    }
    if (this.#meta?.state === 'active' && this.#stopEventWritten) {
      throw new Error('Monitoring stop is incomplete; finish stopSession first.');
    }
    const pending = this.#meta?.state === 'active' ? this.#resumeSession() : this.#startSession();
    this.#startPromise = pending;
    void pending.finally(() => { if (this.#startPromise === pending) this.#startPromise = null; }).catch(() => {});
    return pending;
  }

  async #startSession(): Promise<SessionStatus> {
    const now = new Date().toISOString();
    const environment = await this.#environment();
    this.#requireGm();
    const meta: SessionMeta = {
      id: createSessionId(this.#globals.crypto),
      worldKey: this.#worldKey(),
      state: 'active',
      startedAt: now,
      endedAt: null,
      updatedAt: now,
      refreshCount: 0,
      sampleSequence: 0,
      eventSequence: 0,
      errorSequence: 0,
      truncated: { samples: false, events: false, errors: false },
      aliases: { scenes: {}, combats: {} },
      environment,
    };
    await this.#store.createSession(meta);
    if (this.#globals.game?.user?.isGM !== true) {
      await this.#store.deleteSession(meta.id);
      this.#requireGm();
    }
    this.#meta = meta;
    this.#accepting = true;
    this.#stopEventWritten = false;
    this.#limitReached = false;
    this.#writeFailure = null;
    this.#seenGaps.clear();
    this.#beginCollection();
    await this.#recordEvent('session-start');
    await this.#sample();
    this.#renderPanel();
    this.#scheduleAutoCollapse();
    return this.getStatus();
  }

  async #resumeSession(): Promise<SessionStatus> {
    await this.#writeQueue;
    this.#requireGm();
    const stored = await this.#store.getSession(this.#meta!.id);
    if (!stored) throw new Error('Monitoring session is no longer stored.');
    this.#meta = stored;
    if (stored.state !== 'active') return this.getStatus();
    await this.#reconcileSession(stored);
    this.#requireGm();
    this.#writeFailure = null;
    this.#accepting = true;
    this.#beginCollection();
    await this.#recordEvent('session-resume', 'storage-retry');
    this.#panelError = false;
    this.#renderPanel();
    return this.getStatus();
  }

  async #reconcileSession(meta: SessionMeta): Promise<void> {
    const exported = await this.#store.exportSession(meta.id);
    if (!exported) throw new Error('Monitoring session is no longer stored.');
    this.#limitReached = exported.events.some((event) => event.kind === 'limit-reached');
    this.#stopEventWritten = exported.events.some((event) => event.kind === 'session-stop');
    const highest = (rows: Array<{ sequence: number }>) => rows.reduce((value, row) => Math.max(value, row.sequence), 0);
    const sampleSequence = Math.max(meta.sampleSequence, highest(exported.samples));
    const eventSequence = Math.max(meta.eventSequence, highest(exported.events));
    const errorSequence = Math.max(meta.errorSequence, highest(exported.errors));
    if (sampleSequence === meta.sampleSequence && eventSequence === meta.eventSequence && errorSequence === meta.errorSequence) return;
    const repaired = { ...meta, sampleSequence, eventSequence, errorSequence };
    await this.#store.updateSession(repaired);
    Object.assign(meta, repaired);
  }

  async markJank(): Promise<void> {
    this.#requireActive();
    await this.#recordEvent('jank-marker', 'player-reported');
    this.#flashPanel('marker');
  }

  async stopSession(options: { download?: boolean } = {}): Promise<SessionExport | null> {
    this.#requireGm();
    if (this.#stopPromise) return this.#stopPromise;
    const pending = this.#stopSession(options);
    this.#stopPromise = pending;
    void pending.finally(() => { if (this.#stopPromise === pending) this.#stopPromise = null; }).catch(() => {});
    return pending;
  }

  async #stopSession(options: { download?: boolean }): Promise<SessionExport | null> {
    if (this.#startPromise) await this.#startPromise;
    this.#requireGm();
    if (!this.#meta) return null;
    if (this.#meta.state === 'active') {
      this.#accepting = false;
      this.#endCollection();
      this.#clearPanelCollapseTimers();
      await this.#samplingPromise?.catch(() => {});
      await this.#writeQueue;
      if (this.#writeFailure) {
        throw this.#writeFailure;
      }
      this.#requireGm();
      await this.#sample(true);
      if (this.#writeFailure) {
        throw this.#writeFailure;
      }
      this.#requireGm();
      const meta = this.#meta;
      if (!this.#stopEventWritten) {
        await this.#persistEvent(meta, 'session-stop');
        this.#stopEventWritten = true;
      }
      this.#requireGm();
      const endedAt = new Date().toISOString();
      await this.#store.updateSession({ ...meta, state: 'stopped', endedAt, updatedAt: endedAt });
      meta.state = 'stopped';
      meta.endedAt = endedAt;
      meta.updatedAt = endedAt;
      this.#requireGm();
    }
    const exported = await this.#store.exportSession(this.#meta.id);
    this.#requireGm();
    if (exported && options.download !== false) downloadJson(this.#globals, exported);
    this.#panelError = false;
    this.#renderPanel();
    return exported;
  }

  getStatus(): SessionStatus {
    const now = Date.now();
    return {
      enabled: this.#globals.game?.user?.isGM === true,
      state: this.#meta?.state ?? 'idle',
      sessionId: this.#meta?.id ?? null,
      startedAt: this.#meta?.startedAt ?? null,
      elapsedMs: this.#meta ? Math.max(0, now - Date.parse(this.#meta.startedAt)) : 0,
      samples: this.#meta?.sampleSequence ?? 0,
      companionLastSeenAt: this.#companionLastSeenAt,
      recentMaxFrameGapMs: this.#recentMaxFrameGapMs,
      recentLongTaskMaxMs: this.#recentLongTaskMaxMs,
    };
  }

  async exportSession(sessionId = this.#meta?.id): Promise<SessionExport | null> {
    this.#requireGm();
    if (!sessionId) return null;
    const exported = await this.#store.exportSession(sessionId);
    this.#requireGm();
    return exported;
  }

  async listSessions() {
    this.#requireGm();
    const sessions = await this.#store.listSessions();
    this.#requireGm();
    return sessions.map(({ id, state, startedAt, endedAt, sampleSequence }) => ({
      id, state, startedAt, endedAt, sampleSequence,
    }));
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.#requireGm();
    if (this.#meta?.id === sessionId && this.#meta.state === 'active') {
      throw new Error('Cannot delete the active monitoring session.');
    }
    await this.#store.deleteSession(sessionId);
    if (this.#meta?.id === sessionId) this.#meta = null;
    this.#renderPanel();
  }

  setCompanionHeartbeat(input: { timestamp?: string; version?: string }): SessionStatus {
    this.#requireGm();
    const parsed = input.timestamp ? Date.parse(input.timestamp) : Date.now();
    this.#companionLastSeenAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
    this.#companionVersion = typeof input.version === 'string' ? input.version.slice(0, 40) : null;
    this.#renderPanel();
    return this.getStatus();
  }

  #sample(final = false): Promise<void> {
    const meta = this.#meta;
    if (!meta || this.#limitReached || (!final && !this.#acceptCollection()) || meta.state !== 'active' || this.#samplingPromise) return Promise.resolve();
    const pending = this.#queueWrite(async () => {
      if (final && this.#globals.game?.user?.isGM !== true) {
        this.#pauseCollection();
        return false;
      }
      if (!final && !this.#acceptCollection()) return false;
      const durationLimit = Date.now() - Date.parse(meta.startedAt) >= MAX_SESSION_MS;
      const sampleLimit = meta.sampleSequence >= MAX_SAMPLES;
      if (durationLimit || sampleLimit) {
        await this.#persistEvent(meta, 'limit-reached', durationLimit ? 'max-duration' : 'sample-cap', {},
          (draft) => { if (sampleLimit) draft.truncated.samples = true; });
        this.#limitReached = true;
        return true;
      }
      const draft = structuredClone(meta);
      const eventContext = this.#eventContext();
      const sceneAlias = this.#alias(draft, 'scene', this.#globals.canvas?.scene?.id ?? this.#globals.game?.scenes?.current?.id);
      const combatAlias = this.#alias(draft, 'combat', this.#globals.game?.combat?.id);
      const sample = collectBrowserSample({
        globals: this.#globals,
        sequence: draft.sampleSequence + 1,
        startedAt: meta.startedAt,
        expectedAt: this.#nextExpectedAt || Date.now(),
        sceneAlias,
        combatAlias,
        stalls: this.#stalls.take(),
      });
      draft.sampleSequence = sample.sequence;
      draft.updatedAt = sample.timestamp;
      await this.#store.commitRecord(draft, { kind: 'sample', value: sample });
      Object.assign(meta, draft);
      this.#recentMaxFrameGapMs = sample.frames.maxMs;
      this.#recentLongTaskMaxMs = sample.longTasks.maxMs;
      for (const gap of sample.capabilityGaps) {
        if (this.#seenGaps.has(gap)) continue;
        this.#seenGaps.add(gap);
        await this.#persistEvent(meta, 'capability-gap', gap, {}, undefined, eventContext);
      }
      return false;
    }).then((limitReached) => {
      if (limitReached && this.#meta === meta && this.#globals.game?.user?.isGM === true) {
        void this.stopSession({ download: false }).catch(() => {});
      }
    });
    this.#samplingPromise = pending;
    void pending.finally(() => {
      if (this.#samplingPromise === pending) this.#samplingPromise = null;
      this.#renderPanel();
    }).catch(() => {});
    return pending;
  }

  #queueWrite<T>(write: () => Promise<T>): Promise<T> {
    const result = this.#writeQueue.then(() => {
      if (this.#writeFailure) throw this.#writeFailure;
      return write();
    });
    this.#writeQueue = result.then(() => {}, (error) => {
      this.#writeFailure ??= error;
      this.#panelError = true;
      this.#pauseCollection();
    });
    return result;
  }

  #pauseCollection(): void {
    this.#accepting = false;
    this.#endCollection();
    this.#clearPanelCollapseTimers();
    this.#renderPanel();
  }

  #acceptCollection(): boolean {
    if (!this.#accepting) return false;
    if (this.#globals.game?.user?.isGM === true) return true;
    this.#pauseCollection();
    return false;
  }

  #beginCollection(): void {
    this.#endCollection();
    this.#stalls.start();
    this.#registerHooks();
    this.#nextExpectedAt = Date.now() + SAMPLE_INTERVAL_MS;
    this.#timer = setInterval(() => {
      const expected = this.#nextExpectedAt;
      this.#nextExpectedAt += SAMPLE_INTERVAL_MS;
      if (Date.now() - expected > SAMPLE_INTERVAL_MS * 2) this.#nextExpectedAt = Date.now() + SAMPLE_INTERVAL_MS;
      void this.#sample().catch(() => {});
    }, SAMPLE_INTERVAL_MS);
  }

  #endCollection(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    this.#stalls.stop();
    for (const [name, id] of this.#hookIds) this.#globals.Hooks?.off?.(name, id);
    this.#hookIds = [];
    for (const [target, name, handler] of this.#eventHandlers) target.removeEventListener(name, handler);
    this.#eventHandlers = [];
  }

  #registerHooks(): void {
    const hooks = this.#globals.Hooks;
    const on = (name: string, callback: (...args: any[]) => void) => {
      const id = hooks?.on?.(name, callback);
      if (id !== undefined) this.#hookIds.push([name, id]);
    };
    on('canvasReady', () => { this.#observe(this.#recordEvent('canvas-ready')); });
    on('canvasTearDown', () => { this.#observe(this.#recordEvent('canvas-teardown')); });
    on('createCombat', (combat: any) => { this.#observe(this.#recordCombatEvent('combat-create', combat)); });
    on('updateCombat', (combat: any) => { this.#observe(this.#recordCombatEvent('combat-update', combat)); });
    on('deleteCombat', (combat: any) => { this.#observe(this.#recordCombatEvent('combat-delete', combat)); });
    on('combatStart', (combat: any) => { this.#observe(this.#recordCombatEvent('combat-start', combat)); });
    on('combatRound', (combat: any) => { this.#observe(this.#recordCombatEvent('combat-round', combat)); });
    on('combatTurn', (combat: any) => { this.#observe(this.#recordCombatEvent('combat-turn', combat)); });
    on('error', (_location: unknown, error: unknown, data: any) => {
      this.#observe(this.#recordError('foundry', error, packageIdsFrom(data)));
    });
    on('midi-qol.TroubleShooter.recordError', (detail: any) => {
      this.#observe(this.#recordError('midi-qol', detail?.error ?? detail?.message ?? detail, ['midi-qol']));
    });

    const addEvent = (target: EventTarget | undefined, name: string, handler: EventListener) => {
      if (!target) return;
      target.addEventListener(name, handler);
      this.#eventHandlers.push([target, name, handler]);
    };
    addEvent(this.#globals.window, 'error', ((event: ErrorEvent) => {
      this.#observe(this.#recordError('window-error', event.error ?? event.message));
    }) as EventListener);
    addEvent(this.#globals.window, 'unhandledrejection', ((event: PromiseRejectionEvent) => {
      this.#observe(this.#recordError('unhandled-rejection', event.reason));
    }) as EventListener);
    addEvent(this.#globals.document, 'visibilitychange', (() => {
      this.#observe(this.#recordEvent('visibility', this.#globals.document?.visibilityState ?? 'unknown'));
    }) as EventListener);
    addEvent(this.#globals.window, 'pagehide', (() => { this.#observe(this.#recordEvent('page-hide')); }) as EventListener);
  }

  #observe(work: Promise<void>): void { void work.catch(() => {}); }

  async #recordCombatEvent(kind: MonitorEventKind, combat: any): Promise<void> {
    const meta = this.#meta;
    if (!meta || !this.#acceptCollection() || meta.state !== 'active') return;
    const context = this.#eventContext(combat);
    await this.#queueWrite(() => this.#persistEvent(meta, kind, undefined, {}, undefined, context));
  }

  async #recordEvent(
    kind: MonitorEventKind,
    detail?: string,
    overrides: Partial<Pick<MonitorEvent, 'sceneAlias' | 'combatAlias' | 'round' | 'turn'>> = {},
  ): Promise<void> {
    const meta = this.#meta;
    if (!meta || !this.#acceptCollection() || meta.state !== 'active') return;
    const context = this.#eventContext();
    await this.#queueWrite(() => this.#persistEvent(meta, kind, detail, overrides, undefined, context));
  }

  #eventContext(combat = this.#globals.game?.combat): EventContext {
    return {
      sceneId: this.#globals.canvas?.scene?.id,
      combatId: combat?.id,
      round: finiteOrNull(combat?.round),
      turn: finiteOrNull(combat?.turn),
    };
  }

  async #persistEvent(meta: SessionMeta, kind: MonitorEventKind, detail?: string,
    overrides: Partial<Pick<MonitorEvent, 'sceneAlias' | 'combatAlias' | 'round' | 'turn'>> = {},
    mutateDraft?: (draft: SessionMeta) => void, context = this.#eventContext()): Promise<void> {
    const draft = structuredClone(meta);
    mutateDraft?.(draft);
    if (draft.eventSequence >= MAX_EVENTS) {
      draft.truncated.events = true;
      await this.#store.updateSession(draft);
      Object.assign(meta, draft);
      return;
    }
    const timestamp = new Date().toISOString();
    const event: MonitorEvent = {
      sequence: draft.eventSequence + 1,
      timestamp,
      elapsedMs: Math.max(0, Date.parse(timestamp) - Date.parse(draft.startedAt)),
      kind,
      sceneAlias: overrides.sceneAlias ?? this.#alias(draft, 'scene', context.sceneId),
      combatAlias: overrides.combatAlias ?? this.#alias(draft, 'combat', context.combatId),
      round: overrides.round ?? context.round,
      turn: overrides.turn ?? context.turn,
      ...(detail ? { detail: detail.slice(0, 80) } : {}),
    };
    draft.eventSequence = event.sequence;
    draft.updatedAt = timestamp;
    await this.#store.commitRecord(draft, { kind: 'event', value: event });
    Object.assign(meta, draft);
    this.#renderPanel();
  }

  async #recordError(
    source: SanitizedError['source'],
    error: unknown,
    packageIds: string[] = [],
  ): Promise<void> {
    const meta = this.#meta;
    if (!meta || !this.#acceptCollection() || meta.state !== 'active') return;
    await this.#queueWrite(async () => {
      const draft = structuredClone(meta);
      if (draft.errorSequence >= MAX_ERRORS) {
        draft.truncated.errors = true;
        await this.#store.updateSession(draft);
        Object.assign(meta, draft);
        return;
      }
      const sanitized = await createSanitizedError({
        sequence: draft.errorSequence + 1, startedAt: draft.startedAt,
        source, error, sensitiveValues: this.#sensitiveValues, packageIds,
      });
      draft.errorSequence = sanitized.sequence;
      draft.updatedAt = sanitized.timestamp;
      await this.#store.commitRecord(draft, { kind: 'error', value: sanitized });
      Object.assign(meta, draft);
      this.#renderPanel();
    });
  }

  #alias(meta: SessionMeta, kind: 'scene' | 'combat', raw: unknown): string | null {
    if (typeof raw !== 'string' || !raw) return null;
    const collection = kind === 'scene' ? meta.aliases.scenes : meta.aliases.combats;
    if (collection[raw]) return collection[raw]!;
    const prefix = kind === 'scene' ? 'scene' : 'combat';
    collection[raw] = `${prefix}-${Object.keys(collection).length + 1}`;
    return collection[raw]!;
  }

  async #environment(): Promise<MonitorEnvironment> {
    const activeModules = Array.from(this.#globals.game?.modules?.values?.() ?? [])
      .filter((entry: any) => entry?.active === true)
      .map((entry: any) => ({ id: String(entry.id), version: String(entry.version ?? entry.data?.version ?? '') }))
      .sort((left, right) => left.id.localeCompare(right.id, 'en'));
    const userAgent = this.#globals.navigator?.userAgent ?? '';
    return {
      foundryVersion: String(this.#globals.game?.version ?? ''),
      systemId: String(this.#globals.game?.system?.id ?? ''),
      systemVersion: String(this.#globals.game?.system?.version ?? ''),
      moduleConfigSha256: await sha256Text(JSON.stringify(activeModules)),
      activeModules,
      browserMajor: userAgent.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1] ?? null,
      platform: String(this.#globals.navigator?.userAgentData?.platform ?? this.#globals.navigator?.platform ?? 'unknown'),
      hardwareConcurrency: finiteOrNull(this.#globals.navigator?.hardwareConcurrency),
      deviceMemoryGb: finiteOrNull(this.#globals.navigator?.deviceMemory),
    };
  }

  #worldKey(): string {
    return String(this.#globals.game?.world?.id ?? this.#globals.game?.world?.title ?? 'unknown-world');
  }

  #requireGm(): void {
    if (this.#globals.game?.user?.isGM !== true) throw new Error('FVTT Session Monitor is GM-only.');
  }

  #requireActive(): void {
    this.#requireGm();
    if (!this.#meta || this.#meta.state !== 'active' || !this.#accepting) throw new Error('No active monitoring session.');
  }

  #mountPanel(): void {
    if (this.#panel || !this.#globals.document?.body) return;
    const panel = this.#globals.document.createElement('aside');
    panel.id = 'fvtt-session-monitor-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', 'fvtt-session-monitor-title');
    panel.innerHTML = `
      <header class="fsm-header" data-drag-handle tabindex="0"><i class="fa-solid fa-chart-line" aria-hidden="true"></i><span id="fvtt-session-monitor-title" data-role="title"></span>
        <button type="button" data-action="collapse" aria-label="Toggle">−</button></header>
      <div class="fsm-body">
        <div id="fvtt-session-monitor-body" class="fsm-status" aria-live="polite"><span data-role="body-state"></span><span data-role="body-elapsed">00:00:00</span></div>
        <div class="fsm-detail" data-role="detail"></div>
        <div class="fsm-actions">
          <button type="button" data-action="start"></button>
          <button type="button" data-action="mark"></button>
          <button type="button" data-action="stop"></button>
          <button type="button" data-action="help"></button>
        </div>
      </div>`;
    const header = panel.querySelector<HTMLElement>('[data-drag-handle]');
    const toggle = panel.querySelector<HTMLButtonElement>('[data-action="collapse"]');
    if (header && toggle) {
      const capsuleState = this.#globals.document.createElement('span');
      capsuleState.className = 'fsm-capsule-status';
      capsuleState.dataset.role = 'state';
      capsuleState.setAttribute('role', 'status');
      capsuleState.setAttribute('aria-live', 'polite');
      const capsuleElapsed = this.#globals.document.createElement('time');
      capsuleElapsed.className = 'fsm-capsule-elapsed';
      capsuleElapsed.dataset.role = 'elapsed';
      capsuleElapsed.dateTime = 'PT0S';
      capsuleElapsed.textContent = '00:00:00';
      header.insertBefore(capsuleState, toggle);
      header.insertBefore(capsuleElapsed, toggle);
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-controls', 'fvtt-session-monitor-body');
      toggle.setAttribute('aria-label', 'Toggle controls');
    }
    for (const [action, label] of [['start', 'Start monitoring'], ['mark', 'Mark jank now'], ['stop', 'Stop and export monitoring'], ['help', 'Open monitoring help']] as const) {
      panel.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.setAttribute('aria-label', label);
    }
    panel.addEventListener('click', (event) => {
      if (this.#suppressNextPanelClick) {
        this.#suppressNextPanelClick = false;
        return;
      }
      const action = (event.target as HTMLElement)?.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'start') this.#runPanelAction(() => this.startSession());
      if (action === 'mark') this.#runPanelAction(() => this.markJank());
      if (action === 'stop') this.#runPanelAction(() => this.stopSession());
      if (action === 'help') this.#runPanelAction(() => openMonitorHelp(this.#globals));
      if (action === 'collapse') this.#togglePanelExpanded();
      if (!action && panel.classList.contains('collapsed')) this.#expandPanelTemporarily();
    });
    header?.addEventListener('keydown', (event) => {
      if ((event.target as HTMLElement)?.closest('button')) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      this.#togglePanelExpanded();
    });
    header?.addEventListener('pointerdown', (event) => this.#beginPanelDrag(event));
    panel.addEventListener('pointermove', (event) => this.#movePanelDrag(event));
    panel.addEventListener('pointerup', (event) => this.#endPanelDrag(event));
    panel.addEventListener('pointercancel', (event) => this.#endPanelDrag(event));
    this.#globals.document.body.append(panel);
    this.#panel = panel;
    this.#panelPreference = this.#readPanelPreference();
    this.#observePanelLayout();
    this.#layoutPanel();
  }

  #runPanelAction(work: () => Promise<unknown>): void {
    void Promise.resolve().then(work).then(() => {
      if (this.#accepting || this.#meta?.state !== 'active') this.#panelError = false;
      this.#renderPanel();
    }, () => {
      this.#panelError = true;
      this.#renderPanel();
    });
  }

  #togglePanelExpanded(): void {
    if (!this.#panel || this.getStatus().state !== 'active') return;
    if (this.#panel.classList.contains('collapsed')) this.#expandPanelTemporarily();
    else this.#collapsePanel();
    this.#renderPanel();
  }

  #collapsePanel(): void {
    if (!this.#panel) return;
    this.#clearPanelCollapseTimers();
    this.#panel.classList.add('collapsed');
    this.#layoutPanel();
  }

  #expandPanelTemporarily(): void {
    if (!this.#panel || this.getStatus().state !== 'active') return;
    if (this.#temporaryExpandTimer) clearTimeout(this.#temporaryExpandTimer);
    this.#panel.classList.remove('collapsed');
    this.#temporaryExpandTimer = setTimeout(() => {
      this.#temporaryExpandTimer = null;
      if (this.getStatus().state === 'active') this.#collapsePanel();
    }, TEMPORARY_EXPAND_DELAY_MS);
    this.#layoutPanel();
  }

  #scheduleAutoCollapse(): void {
    if (this.#autoCollapseTimer) clearTimeout(this.#autoCollapseTimer);
    this.#autoCollapseTimer = setTimeout(() => {
      this.#autoCollapseTimer = null;
      if (this.getStatus().state === 'active') this.#collapsePanel();
    }, AUTO_COLLAPSE_DELAY_MS);
  }

  #clearPanelCollapseTimers(): void {
    if (this.#autoCollapseTimer) clearTimeout(this.#autoCollapseTimer);
    if (this.#temporaryExpandTimer) clearTimeout(this.#temporaryExpandTimer);
    this.#autoCollapseTimer = null;
    this.#temporaryExpandTimer = null;
  }

  #beginPanelDrag(event: PointerEvent): void {
    if (!this.#panel || event.button !== 0 || (event.target as HTMLElement)?.closest('button')) return;
    const rect = this.#panel.getBoundingClientRect();
    this.#drag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    this.#panel.classList.add('dragging');
    this.#panel.setPointerCapture?.(event.pointerId);
  }

  #movePanelDrag(event: PointerEvent): void {
    if (!this.#panel || !this.#drag || this.#drag.pointerId !== event.pointerId) return;
    const moved = Math.abs(event.clientX - this.#drag.startClientX)
      + Math.abs(event.clientY - this.#drag.startClientY) > 2;
    this.#drag.moved ||= moved;
    const position = this.#positionFromPointer(event.clientX - this.#drag.offsetX, event.clientY - this.#drag.offsetY);
    this.#applyPanelPosition(position, false);
  }

  #endPanelDrag(event: PointerEvent): void {
    if (!this.#panel || !this.#drag || this.#drag.pointerId !== event.pointerId) return;
    const drag = this.#drag;
    this.#drag = null;
    this.#panel.classList.remove('dragging');
    this.#panel.releasePointerCapture?.(event.pointerId);
    if (!drag.moved) return;
    this.#suppressNextPanelClick = true;
    const position = this.#readPanelPosition();
    const viewport = this.#panelViewport();
    const size = this.#panelSize();
    const snapped = snapPanelPosition(position, viewport, size);
    this.#applyPanelPosition(this.#avoidPosition(snapped), true);
  }

  #positionFromPointer(left: number, top: number): PanelPosition {
    return this.#avoidPosition({ left, top });
  }

  #readPanelPreference(): PanelPosition | null {
    try {
      return parsePanelPositionPreference(this.#globals.window?.localStorage?.getItem(PANEL_POSITION_STORAGE_KEY) ?? null);
    } catch {
      return null;
    }
  }

  #persistPanelPosition(position: PanelPosition): void {
    try {
      this.#globals.window?.localStorage?.setItem(
        PANEL_POSITION_STORAGE_KEY,
        serializePanelPositionPreference(position),
      );
    } catch {
      // Private browsing and locked-down Foundry clients may deny localStorage.
    }
  }

  #panelViewport(): PanelViewport {
    const documentElement = this.#globals.document?.documentElement;
    return {
      width: Math.max(1, this.#globals.window?.innerWidth ?? documentElement?.clientWidth ?? 1),
      height: Math.max(1, this.#globals.window?.innerHeight ?? documentElement?.clientHeight ?? 1),
    };
  }

  #panelSize(): PanelSize {
    if (!this.#panel) return { width: DEFAULT_PANEL_WIDTH, height: DEFAULT_PANEL_HEIGHT };
    const rect = this.#panel.getBoundingClientRect?.();
    const fallback = panelSizeForState(this.#panel.classList.contains('collapsed') ? 'collapsed' : 'expanded');
    const measuredWidth = finiteOrNull(rect?.width);
    const measuredHeight = finiteOrNull(rect?.height);
    const width = measuredWidth && measuredWidth > 0 ? measuredWidth
      : (this.#panel.offsetWidth > 0 ? this.#panel.offsetWidth : fallback.width);
    const height = measuredHeight && measuredHeight > 0 ? measuredHeight
      : (this.#panel.offsetHeight > 0 ? this.#panel.offsetHeight : fallback.height);
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  #readPanelPosition(): PanelPosition {
    if (!this.#panel) return { left: PANEL_MARGIN, top: PANEL_MARGIN };
    const left = Number.parseFloat(this.#panel.style.left);
    const top = Number.parseFloat(this.#panel.style.top);
    if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
    const rect = this.#panel.getBoundingClientRect?.();
    return { left: rect?.left ?? PANEL_MARGIN, top: rect?.top ?? PANEL_MARGIN };
  }

  #avoidPosition(position: PanelPosition): PanelPosition {
    return avoidPanelPosition(
      position,
      this.#panelViewport(),
      this.#panelSize(),
      this.#visibleAvoidRects(),
    );
  }

  #applyPanelPosition(position: PanelPosition, persist: boolean): void {
    if (!this.#panel) return;
    const bounded = this.#avoidPosition(position);
    this.#panel.style.left = `${Math.round(bounded.left)}px`;
    this.#panel.style.top = `${Math.round(bounded.top)}px`;
    this.#panel.style.right = 'auto';
    this.#panel.style.bottom = 'auto';
    if (persist) {
      this.#panelPreference = bounded;
      this.#persistPanelPosition(bounded);
    }
  }

  #layoutPanel(): void {
    if (!this.#panel || this.#drag) return;
    const viewport = this.#panelViewport();
    const size = this.#panelSize();
    const current = this.#readPanelPosition();
    const preferred = this.#panelPreference ?? (
      Number.isFinite(Number.parseFloat(this.#panel.style.left))
        ? current
        : { left: viewport.width - size.width - PANEL_MARGIN, top: viewport.height - size.height - PANEL_MARGIN }
    );
    this.#applyPanelPosition(avoidPanelPosition(preferred, viewport, size, this.#visibleAvoidRects()), false);
  }

  #visibleAvoidRects(): PanelAvoidRect[] {
    const document = this.#globals.document;
    if (!document) return [];
    const elements: Element[] = [];
    for (const element of Array.from(document.querySelectorAll?.('#sidebar, #sidebar-content.expanded, .combat-tracker, #combat-tracker') ?? [])) {
      elements.push(element);
    }
    const combatElement = this.#globals.ui?.combat?.element;
    if (combatElement && typeof Element !== 'undefined' && combatElement instanceof Element) elements.push(combatElement);
    const seen = new Set<Element>();
    const rects: PanelAvoidRect[] = [];
    for (const element of elements) {
      if (seen.has(element) || !isVisibleInteractiveElement(element, this.#globals.window)) continue;
      seen.add(element);
      const rect = element.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      rects.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    }
    return rects;
  }

  #observePanelLayout(): void {
    const window = this.#globals.window;
    const document = this.#globals.document;
    const onResize = () => this.#layoutPanel();
    window?.addEventListener('resize', onResize, { passive: true });
    window?.addEventListener('orientationchange', onResize, { passive: true });
    const ResizeObserverCtor = (window as any)?.ResizeObserver ?? (globalThis as any).ResizeObserver;
    if (ResizeObserverCtor) {
      this.#layoutResizeObserver = new ResizeObserverCtor(() => this.#layoutPanel());
      for (const element of Array.from(document?.querySelectorAll?.('#sidebar, #sidebar-content, .combat-tracker, #combat-tracker') ?? [])) {
        this.#layoutResizeObserver?.observe(element);
      }
    }
    const MutationObserverCtor = (window as any)?.MutationObserver ?? (globalThis as any).MutationObserver;
    const sidebar = document?.querySelector?.('#sidebar');
    if (MutationObserverCtor && sidebar) {
      const observer = new MutationObserverCtor(() => this.#layoutPanel()) as MutationObserver;
      observer.observe(sidebar, { attributes: true, subtree: true, attributeFilter: ['class', 'style', 'hidden'] });
      this.#layoutMutationObserver = observer;
    }
  }

  #renderPanel(): void {
    if (!this.#panel) return;
    const status = this.getStatus();
    const active = status.state === 'active' && this.#accepting;
    const canStop = status.state === 'active';
    const companionAge = status.companionLastSeenAt ? Date.now() - Date.parse(status.companionLastSeenAt) : Infinity;
    this.#panel.dataset.state = status.state;
    setText(this.#panel, 'title', localize(this.#globals.game, 'FSM.Title', 'Session Monitor'));
    const stateLabel = localize(this.#globals.game,
      canStop && !active ? 'FSM.State.interrupted' : `FSM.State.${status.state}`,
      canStop && !active ? 'Interrupted' : status.state);
    setText(this.#panel, 'state', stateLabel);
    setText(this.#panel, 'body-state', stateLabel);
    setText(this.#panel, 'elapsed', formatDuration(status.elapsedMs));
    setText(this.#panel, 'body-elapsed', formatDuration(status.elapsedMs));
    this.#panel.querySelector<HTMLElement>('[data-role="elapsed"]')?.setAttribute(
      'datetime',
      `PT${Math.max(0, Math.floor(status.elapsedMs / 1_000))}S`,
    );
    const companion = companionAge <= 25_000
      ? localize(this.#globals.game, 'FSM.Companion.connected', 'Companion connected')
      : localize(this.#globals.game, 'FSM.Companion.missing', 'Companion missing');
    setText(this.#panel, 'detail', this.#panelError
      ? localize(this.#globals.game, 'FSM.Error.operation', 'Operation could not be completed. Retry or reload.')
      : `${companion} · ${status.samples} samples · max gap ${formatMs(status.recentMaxFrameGapMs)}`);
    setButton(this.#panel, 'start', localize(this.#globals.game, 'FSM.Action.start', 'Start'), !active);
    setButton(this.#panel, 'mark', localize(this.#globals.game, 'FSM.Action.mark', 'Jank now'), active);
    setButton(this.#panel, 'stop', localize(this.#globals.game, 'FSM.Action.stop', 'Stop & export'), canStop);
    setButton(this.#panel, 'help', localize(this.#globals.game, 'FSM.Action.help', 'Help'), status.enabled);
    if (!active) this.#panel.classList.remove('collapsed');
    const toggle = this.#panel.querySelector<HTMLButtonElement>('[data-action="collapse"]');
    if (toggle) {
      toggle.disabled = !active;
      toggle.setAttribute('aria-expanded', String(!this.#panel.classList.contains('collapsed')));
      toggle.setAttribute('aria-label', this.#panel.classList.contains('collapsed') ? 'Expand controls' : 'Collapse controls');
      toggle.textContent = this.#panel.classList.contains('collapsed') ? '⌄' : '⌃';
    }
    this.#layoutPanel();
  }

  #flashPanel(kind: string): void {
    if (!this.#panel) return;
    this.#panel.dataset.flash = kind;
    setTimeout(() => {
      if (this.#panel?.dataset.flash === kind) delete this.#panel.dataset.flash;
    }, 800);
  }
}

function collectSensitiveValues(game: any): string[] {
  const values = new Set<string>();
  const collect = (collection: any) => {
    for (const entry of collection?.values?.() ?? []) {
      if (typeof entry?.name === 'string') values.add(entry.name);
      if (typeof entry?.id === 'string') values.add(entry.id);
    }
  };
  collect(game?.users);
  collect(game?.scenes);
  collect(game?.actors);
  collect(game?.items);
  return Array.from(values);
}

function packageIdsFrom(data: any): string[] {
  const values = [
    data?.package?.id,
    data?.packageId,
    ...(Array.isArray(data?.packages) ? data.packages.map((entry: any) => entry?.id ?? entry) : []),
  ];
  return values.filter((value): value is string => typeof value === 'string');
}

function createSessionId(cryptoApi: Crypto | undefined): string {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function localize(game: any, key: string, fallback: string): string {
  const value = game?.i18n?.localize?.(key);
  return typeof value === 'string' && value !== key ? value : fallback;
}

function isVisibleInteractiveElement(element: Element, window: Window | undefined): boolean {
  if ((element as HTMLElement).hidden) return false;
  const style = window?.getComputedStyle?.(element);
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none')) return false;
  const checkVisibility = (element as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility;
  return typeof checkVisibility !== 'function' || checkVisibility.call(element);
}

function setText(panel: HTMLElement, role: string, value: string): void {
  const element = panel.querySelector<HTMLElement>(`[data-role="${role}"]`);
  if (element) element.textContent = value;
}

function setButton(panel: HTMLElement, action: string, label: string, enabled: boolean): void {
  const button = panel.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
  if (!button) return;
  button.textContent = label;
  button.disabled = !enabled;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return [hours, minutes, seconds % 60].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatMs(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(0)} ms`;
}

function downloadJson(globals: SessionMonitorGlobals, exported: SessionExport): void {
  const BlobCtor = globals.Blob ?? Blob;
  const Url = globals.URL ?? URL;
  const blob = new BlobCtor([`${JSON.stringify(exported, null, 2)}\n`], { type: 'application/json' });
  const url = Url.createObjectURL(blob);
  const anchor = globals.document?.createElement('a');
  if (!anchor) return;
  anchor.href = url;
  anchor.download = `fvtt-session-monitor-${exported.session.id}.json`;
  anchor.click();
  setTimeout(() => Url.revokeObjectURL(url), 0);
}

export function attachModuleApi(game: any, runtime: SessionMonitorRuntime): void {
  const module = game?.modules?.get?.(MODULE_ID);
  if (module) module.api = runtime.api;
}
