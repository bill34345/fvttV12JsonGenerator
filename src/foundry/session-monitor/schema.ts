import { sha256 } from '../../core/spell-resolution/sha256';

export const MODULE_ID = 'fvtt-session-monitor';
export const SCHEMA_VERSION = 1;
export const SAMPLE_INTERVAL_MS = 10_000;
export const MAX_SESSION_MS = 12 * 60 * 60 * 1_000;
export const MAX_SAMPLES = MAX_SESSION_MS / SAMPLE_INTERVAL_MS;
export const MAX_EVENTS = 10_000;
export const MAX_ERRORS = 1_000;

export type SessionState = 'active' | 'stopped' | 'interrupted';
export type MonitorEventKind =
  | 'session-start' | 'session-stop' | 'session-resume' | 'page-hide'
  | 'visibility' | 'canvas-ready' | 'canvas-teardown' | 'scene'
  | 'combat-create' | 'combat-update' | 'combat-delete' | 'combat-start'
  | 'combat-round' | 'combat-turn' | 'jank-marker' | 'capability-gap'
  | 'companion-connected' | 'companion-lost' | 'limit-reached';

export interface MonitorEnvironment {
  foundryVersion: string;
  systemId: string;
  systemVersion: string;
  moduleConfigSha256: string;
  activeModules: Array<{ id: string; version: string }>;
  browserMajor: string | null;
  platform: string;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
}

export interface FrameWindow {
  count: number;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  over50Ms: number;
  over100Ms: number;
  over250Ms: number;
}

export interface LongTaskWindow {
  count: number;
  totalMs: number;
  maxMs: number;
}

export interface BrowserSample {
  sequence: number;
  timestamp: string;
  elapsedMs: number;
  visibility: DocumentVisibilityState | 'unknown';
  canvasReady: boolean;
  sceneAlias: string | null;
  combatAlias: string | null;
  round: number | null;
  turn: number | null;
  heap: { usedBytes: number | null; totalBytes: number | null; limitBytes: number | null };
  dom: { elements: number; chatCards: number; chatMessages: number; openWindows: number };
  textureApproxBytes: number | null;
  midi: { workflows: number | null; liveWeakRefs: number | null };
  sequencerEffects: number | null;
  timerDriftMs: number;
  frames: FrameWindow;
  longTasks: LongTaskWindow;
  capabilityGaps: string[];
}

export interface MonitorEvent {
  sequence: number;
  timestamp: string;
  elapsedMs: number;
  kind: MonitorEventKind;
  sceneAlias?: string | null;
  combatAlias?: string | null;
  round?: number | null;
  turn?: number | null;
  detail?: string;
}

export interface SanitizedError {
  sequence: number;
  timestamp: string;
  elapsedMs: number;
  source: 'foundry' | 'window-error' | 'unhandled-rejection' | 'midi-qol' | 'cdp-runtime' | 'cdp-log';
  name: string;
  template: string;
  frames: string[];
  packageIds: string[];
  fingerprint: string;
  count: number;
}

export interface SessionMeta {
  id: string;
  worldKey: string;
  state: SessionState;
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
  refreshCount: number;
  sampleSequence: number;
  eventSequence: number;
  errorSequence: number;
  truncated: { samples: boolean; events: boolean; errors: boolean };
  aliases: { scenes: Record<string, string>; combats: Record<string, string> };
  environment: MonitorEnvironment;
}

export interface SessionStatus {
  enabled: boolean;
  state: SessionState | 'idle';
  sessionId: string | null;
  startedAt: string | null;
  elapsedMs: number;
  samples: number;
  companionLastSeenAt: string | null;
  recentMaxFrameGapMs: number | null;
  recentLongTaskMaxMs: number;
}

export interface SessionExport {
  schemaVersion: 1;
  session: Omit<SessionMeta, 'worldKey' | 'aliases'>;
  samples: BrowserSample[];
  events: MonitorEvent[];
  errors: SanitizedError[];
  privacy: {
    sceneAndCombatIdsAliased: true;
    freeTextMarkersDisabled: true;
    rawConsoleArgumentsExcluded: true;
    forbiddenContent: string[];
  };
}

export interface CompanionProcessAggregate {
  type: string;
  processCount: number;
  workingSetBytes: number | null;
  privateBytes: number | null;
  cpuTimeSeconds: number | null;
}

export interface CompanionSample {
  sequence: number;
  timestamp: string;
  sessionId: string;
  browserGeneration: number;
  rendererGeneration: number;
  rendererAttribution: 'dedicated-single-renderer' | 'dedicated-multiple-renderers' | 'unknown';
  heap: { usedBytes: number | null; totalBytes: number | null; embedderBytes: number | null; backingBytes: number | null };
  performance: Record<string, number | null>;
  processes: CompanionProcessAggregate[];
  wasmCommittedRegionCount: number | null;
  gaps: string[];
}

export type CompanionLifecycleKind =
  | 'chrome-launch'
  | 'chrome-exit-detected'
  | 'chrome-relaunch-start'
  | 'chrome-relaunch-complete'
  | 'page-reconnect'
  | 'renderer-generation';

export interface CompanionLifecycleEvent {
  sequence: number;
  timestamp: string;
  kind: CompanionLifecycleKind;
  browserGeneration: number;
  rendererGeneration: number;
  reason?: 'initial' | 'process-exit' | 'cdp-disconnected' | 'renderer-set-changed';
}

export interface CombinedSessionExport extends SessionExport {
  companion: {
    samples: CompanionSample[];
    events: CompanionLifecycleEvent[];
    errors: SanitizedError[];
    coveragePercent: number;
    gaps: string[];
  };
}

const SENSITIVE_ASSIGNMENT = /\b(cookie|password|passwd|authorization|bearer|token|secret|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi;
const URL = /\b(?:https?|wss?):\/\/[^\s)\]}]+/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const DOCUMENT_UUID = /\b(?:Actor|Item|Scene|Token|Combat|ChatMessage|JournalEntry)(?:\.[A-Za-z0-9_-]{8,})+\b/g;
const FOUNDRY_ID = /\b[A-Za-z0-9]{16}\b/g;

export function redactText(value: unknown, sensitiveValues: string[] = [], maximum = 320): string {
  let text = typeof value === 'string' ? value : value instanceof Error ? value.message : String(value ?? '');
  text = text.replace(SENSITIVE_ASSIGNMENT, '$1=<redacted>')
    .replace(URL, '<url>')
    .replace(IPV4, '<ip>')
    .replace(DOCUMENT_UUID, '<document>')
    .replace(FOUNDRY_ID, '<id>');
  for (const sensitive of sensitiveValues.filter((entry) => entry.length >= 3).sort((a, b) => b.length - a.length)) {
    text = text.split(sensitive).join('<redacted>');
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, maximum);
}

export function sanitizeStack(stack: unknown, sensitiveValues: string[] = []): string[] {
  if (typeof stack !== 'string') return [];
  return stack.split(/\r?\n/).slice(1, 9).map((line) => redactText(line, sensitiveValues, 240));
}

export function safeErrorTemplate(error: Error, sensitiveValues: string[] = []): string {
  const redacted = redactText(error.message, sensitiveValues);
  if (/^Cannot read properties of (?:undefined|null) \(reading '<redacted>'\)$/.test(
    redacted.replace(/\(reading '[^']*'\)/, "(reading '<redacted>')"),
  )) {
    return redacted.replace(/\(reading '[^']*'\)/, "(reading '<redacted>')");
  }
  if (/^[^\s]+ is not a function$/.test(redacted)) return '<value> is not a function';
  if (/^[^\s]+ is not defined$/.test(redacted)) return '<value> is not defined';
  return '<message-redacted>';
}

export async function sha256Text(value: string): Promise<string> {
  return sha256(value);
}

export async function createSanitizedError(input: {
  sequence: number; startedAt: string; source: SanitizedError['source']; error: unknown;
  sensitiveValues?: string[]; packageIds?: string[]; timestamp?: string;
}): Promise<SanitizedError> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const error = input.error instanceof Error ? input.error : new Error(redactText(input.error, input.sensitiveValues));
  const name = redactText(error.name || 'Error', input.sensitiveValues, 80) || 'Error';
  const template = safeErrorTemplate(error, input.sensitiveValues);
  const frames = sanitizeStack(error.stack, input.sensitiveValues);
  const packageIds = Array.from(new Set((input.packageIds ?? []).map((id) => redactText(id, [], 80)).filter(Boolean))).sort();
  return {
    sequence: input.sequence,
    timestamp,
    elapsedMs: Math.max(0, Date.parse(timestamp) - Date.parse(input.startedAt)),
    source: input.source,
    name,
    template,
    frames,
    packageIds,
    fingerprint: await sha256Text(JSON.stringify({ source: input.source, name, template, frames, packageIds })),
    count: 1,
  };
}

export function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] ?? null;
}
