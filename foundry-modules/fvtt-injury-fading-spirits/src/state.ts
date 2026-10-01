import { MAX_ATTEMPT_HISTORY, MAX_INJURY_STACKS, MAX_TRANSACTION_IDS, SCHEMA_VERSION } from './constants.ts';

export interface InjuryEpisode {
  id: string | null;
  open: boolean;
  openedAt: number | null;
}

export interface InjuryState {
  stacks: number;
  episode: InjuryEpisode;
  lastObservedHp: number;
  lastObservedMax: number;
  suppressNextRecovery: null | { transactionId: string; reason: string };
  processedTransactionIds: string[];
}

export type ResurrectionMode = 'normal' | 'rapid' | 'miracle' | 'final';
export type ResurrectionResult = 'success' | 'failure' | 'declined' | 'cancelled';

export interface ResurrectionAttemptSummary {
  id: string;
  mode: ResurrectionMode;
  dc: number;
  contributionSuccesses: number;
  contributionFailures: number;
  result: ResurrectionResult;
  at: number;
  gmId: string;
}

export interface RitualContributor {
  actorUuid: string;
  check: string;
  ability: string | null;
  dc: number;
  advantageMode: 'normal' | 'advantage' | 'disadvantage';
  requestMessageId: string | null;
}

export interface PendingRitual {
  id: string;
  mode: 'normal' | 'final';
  contributors: RitualContributor[];
  startedAt: number;
  gmId: string;
  resolutionStartedAt: number | null;
  resolutionStartedBy: string | null;
  resolutionToken: string | null;
}

export interface ResurrectionResolutionLock {
  id: string;
  mode: ResurrectionMode;
  startedAt: number;
  startedBy: string;
  token: string;
}

export interface FadingSpiritsState {
  successfulReturns: number;
  permanentDcPenalty: number;
  conventionalResurrectionLocked: boolean;
  finalChanceUsed: boolean;
  currentDeathEpisodeId: string | null;
  rapidResurrectionLockedForCurrentDeath: boolean;
  resurrectionConsumedForCurrentDeath: boolean;
  resolutionInProgress: ResurrectionResolutionLock | null;
  pendingRitual: PendingRitual | null;
  attemptHistory: ResurrectionAttemptSummary[];
  processedTransactionIds: string[];
}

export interface ActorModuleState {
  schemaVersion: number;
  injury: InjuryState;
  fadingSpirits: FadingSpiritsState;
}

export function createInjuryState(hp = 0, max = 0): InjuryState {
  return {
    stacks: 0,
    episode: { id: null, open: false, openedAt: null },
    lastObservedHp: finiteNonNegative(hp),
    lastObservedMax: finiteNonNegative(max),
    suppressNextRecovery: null,
    processedTransactionIds: [],
  };
}

export function createFadingSpiritsState(): FadingSpiritsState {
  return {
    successfulReturns: 0,
    permanentDcPenalty: 0,
    conventionalResurrectionLocked: false,
    finalChanceUsed: false,
    currentDeathEpisodeId: null,
    rapidResurrectionLockedForCurrentDeath: false,
    resurrectionConsumedForCurrentDeath: false,
    resolutionInProgress: null,
    pendingRitual: null,
    attemptHistory: [],
    processedTransactionIds: [],
  };
}

export function createActorModuleState(hp = 0, max = 0): ActorModuleState {
  return { schemaVersion: SCHEMA_VERSION, injury: createInjuryState(hp, max), fadingSpirits: createFadingSpiritsState() };
}

export function parseActorModuleState(raw: unknown, hp = 0, max = 0): ActorModuleState {
  const record = asRecord(raw);
  const version = record.schemaVersion;
  if (version === undefined) return createActorModuleState(hp, max);
  if (version !== SCHEMA_VERSION) throw new Error(`Unsupported ${String(version)} schema; expected ${SCHEMA_VERSION}.`);
  const injuryRaw = asRecord(record.injury);
  const episodeRaw = asRecord(injuryRaw.episode);
  const fadingRaw = asRecord(record.fadingSpirits);
  const pendingRaw = asRecord(fadingRaw.pendingRitual);
  const injury: InjuryState = {
    stacks: normalizeInjuryStacks(injuryRaw.stacks),
    episode: {
      id: stringOrNull(episodeRaw.id),
      open: episodeRaw.open === true,
      openedAt: numberOrNull(episodeRaw.openedAt),
    },
    lastObservedHp: finiteNonNegative(injuryRaw.lastObservedHp ?? hp),
    lastObservedMax: finiteNonNegative(injuryRaw.lastObservedMax ?? max),
    suppressNextRecovery: parseSuppression(injuryRaw.suppressNextRecovery),
    processedTransactionIds: stringArray(injuryRaw.processedTransactionIds).slice(-MAX_TRANSACTION_IDS),
  };
  const fadingSpirits: FadingSpiritsState = {
    successfulReturns: integerNonNegative(fadingRaw.successfulReturns),
    permanentDcPenalty: integerNonNegative(fadingRaw.permanentDcPenalty),
    conventionalResurrectionLocked: fadingRaw.conventionalResurrectionLocked === true,
    finalChanceUsed: fadingRaw.finalChanceUsed === true,
    currentDeathEpisodeId: stringOrNull(fadingRaw.currentDeathEpisodeId),
    rapidResurrectionLockedForCurrentDeath: fadingRaw.rapidResurrectionLockedForCurrentDeath === true,
    resurrectionConsumedForCurrentDeath: fadingRaw.resurrectionConsumedForCurrentDeath === true,
    resolutionInProgress: parseResolutionLock(fadingRaw.resolutionInProgress),
    pendingRitual: Object.keys(pendingRaw).length ? parsePendingRitual(pendingRaw) : null,
    attemptHistory: parseHistory(fadingRaw.attemptHistory).slice(-MAX_ATTEMPT_HISTORY),
    processedTransactionIds: stringArray(fadingRaw.processedTransactionIds).slice(-MAX_TRANSACTION_IDS),
  };
  return { schemaVersion: SCHEMA_VERSION, injury, fadingSpirits };
}

export function rememberTransaction(ids: readonly string[], id: string, limit = MAX_TRANSACTION_IDS): string[] {
  if (ids.includes(id)) return [...ids];
  return [...ids, id].slice(-limit);
}

export function appendAttempt(history: readonly ResurrectionAttemptSummary[], attempt: ResurrectionAttemptSummary): ResurrectionAttemptSummary[] {
  if (history.some((entry) => entry.id === attempt.id)) return [...history];
  return [...history, attempt].slice(-MAX_ATTEMPT_HISTORY);
}

export function cloneState<T>(value: T): T {
  return structuredClone(value);
}

export function normalizeInjuryStacks(value: unknown): number {
  return Math.min(MAX_INJURY_STACKS, integerNonNegative(value));
}

function parseSuppression(value: unknown): InjuryState['suppressNextRecovery'] {
  const record = asRecord(value);
  return typeof record.transactionId === 'string' && typeof record.reason === 'string'
    ? { transactionId: record.transactionId, reason: record.reason }
    : null;
}

function parsePendingRitual(value: Record<string, unknown>): PendingRitual | null {
  if (typeof value.id !== 'string' || (value.mode !== 'normal' && value.mode !== 'final')) return null;
  const contributors = Array.isArray(value.contributors)
    ? value.contributors.map(parseContributor).filter((entry): entry is RitualContributor => entry !== null).slice(0, 3)
    : [];
  return {
    id: value.id,
    mode: value.mode,
    contributors,
    startedAt: finiteNonNegative(value.startedAt),
    gmId: typeof value.gmId === 'string' ? value.gmId : '',
    resolutionStartedAt: numberOrNull(value.resolutionStartedAt),
    resolutionStartedBy: stringOrNull(value.resolutionStartedBy),
    resolutionToken: stringOrNull(value.resolutionToken),
  };
}

function parseResolutionLock(value: unknown): ResurrectionResolutionLock | null {
  const record = asRecord(value);
  const mode = record.mode;
  if (typeof record.id !== 'string' || typeof record.startedBy !== 'string'
    || !['normal', 'rapid', 'miracle', 'final'].includes(String(mode))) return null;
  return {
    id: record.id,
    mode: mode as ResurrectionMode,
    startedAt: finiteNonNegative(record.startedAt),
    startedBy: record.startedBy,
    token: typeof record.token === 'string' ? record.token : '',
  };
}

function parseContributor(value: unknown): RitualContributor | null {
  const record = asRecord(value);
  if (typeof record.actorUuid !== 'string' || typeof record.check !== 'string') return null;
  const mode = record.advantageMode;
  return {
    actorUuid: record.actorUuid,
    check: record.check,
    ability: stringOrNull(record.ability),
    dc: clampDc(record.dc),
    advantageMode: mode === 'advantage' || mode === 'disadvantage' ? mode : 'normal',
    requestMessageId: stringOrNull(record.requestMessageId),
  };
}

function parseHistory(value: unknown): ResurrectionAttemptSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ResurrectionAttemptSummary[] => {
    const record = asRecord(entry);
    const mode = record.mode;
    const result = record.result;
    if (typeof record.id !== 'string' || !['normal', 'rapid', 'miracle', 'final'].includes(String(mode))
      || !['success', 'failure', 'declined', 'cancelled'].includes(String(result))) return [];
    return [{
      id: record.id,
      mode: mode as ResurrectionMode,
      dc: Number.isFinite(record.dc) ? Number(record.dc) : 0,
      contributionSuccesses: integerNonNegative(record.contributionSuccesses),
      contributionFailures: integerNonNegative(record.contributionFailures),
      result: result as ResurrectionResult,
      at: finiteNonNegative(record.at),
      gmId: typeof record.gmId === 'string' ? record.gmId : '',
    }];
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteNonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function integerNonNegative(value: unknown): number {
  return Math.floor(finiteNonNegative(value));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function clampDc(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(20, Math.max(10, Math.trunc(number))) : 15;
}
