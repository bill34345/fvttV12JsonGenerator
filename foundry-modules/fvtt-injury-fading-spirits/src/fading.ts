import { appendAttempt, cloneState, rememberTransaction, type FadingSpiritsState, type PendingRitual, type ResurrectionAttemptSummary, type ResurrectionMode, type ResurrectionResult, type RitualContributor } from './state.ts';

export interface BeginRitualInput {
  id: string;
  mode: 'normal' | 'final';
  contributors: RitualContributor[];
  at: number;
  gmId: string;
}

export interface ResolveAttemptInput {
  id: string;
  mode: ResurrectionMode;
  at: number;
  gmId: string;
  dc: number;
  contributionSuccesses?: number;
  contributionFailures?: number;
  dieSucceeded: boolean;
  soulWilling: boolean;
}

export interface ResolveAttemptResult {
  state: FadingSpiritsState;
  result: ResurrectionResult;
  returned: boolean;
  duplicate: boolean;
}

export function resurrectionTransactionId(actorUuid: string, episodeId: string | null, mode: ResurrectionMode, ordinal: number): string {
  const episode = episodeId ?? 'unbound';
  const attempt = Math.max(1, Math.trunc(ordinal));
  return `resurrection:${actorUuid}:${episode}:${mode}:${attempt}`;
}

export function resurrectionDc(state: FadingSpiritsState, successes: number, failures: number): number {
  return 10 + state.successfulReturns + state.permanentDcPenalty - (3 * Math.max(0, Math.trunc(successes))) + Math.max(0, Math.trunc(failures));
}

export function rapidResurrectionDc(state: FadingSpiritsState): number {
  return 10 + state.successfulReturns + state.permanentDcPenalty;
}

export function canBeginRitual(state: FadingSpiritsState, mode: 'normal' | 'final'): { ok: boolean; reason?: string } {
  if (state.pendingRitual) return { ok: false, reason: 'A ritual is already pending.' };
  if (state.resurrectionConsumedForCurrentDeath) return { ok: false, reason: 'The soul has already returned for the current death episode.' };
  if (state.resolutionInProgress) return { ok: false, reason: 'A resurrection resolution is already in progress.' };
  if (mode === 'normal' && state.conventionalResurrectionLocked) return { ok: false, reason: 'Conventional resurrection is permanently locked.' };
  if (mode === 'final' && !state.conventionalResurrectionLocked) return { ok: false, reason: 'A final ritual requires a prior conventional failure.' };
  if (mode === 'final' && state.finalChanceUsed) return { ok: false, reason: 'The final ritual chance has already been used.' };
  return { ok: true };
}

export function beginRitual(inputState: FadingSpiritsState, input: BeginRitualInput): FadingSpiritsState {
  const state = cloneState(inputState);
  if (state.processedTransactionIds.includes(input.id)) return state;
  const allowed = canBeginRitual(state, input.mode);
  if (!allowed.ok) throw new Error(allowed.reason);
  const contributors = uniqueContributors(input.contributors);
  if (contributors.length > 3) throw new Error('A ritual allows at most three distinct contributors.');
  if (input.mode === 'final') state.finalChanceUsed = true;
  const pending: PendingRitual = {
    id: input.id, mode: input.mode, contributors, startedAt: input.at, gmId: input.gmId,
    resolutionStartedAt: null, resolutionStartedBy: null, resolutionToken: null,
  };
  state.pendingRitual = pending;
  state.processedTransactionIds = rememberTransaction(state.processedTransactionIds, input.id);
  return state;
}

export function resolveAttempt(inputState: FadingSpiritsState, input: ResolveAttemptInput): ResolveAttemptResult {
  const state = cloneState(inputState);
  const resolveId = `${input.id}:resolved`;
  if (state.processedTransactionIds.includes(resolveId)) {
    const previous = state.attemptHistory.find((entry) => entry.id === input.id);
    return { state, result: previous?.result ?? 'cancelled', returned: previous?.result === 'success', duplicate: true };
  }

  if (state.resurrectionConsumedForCurrentDeath) throw new Error('The soul has already returned for the current death episode.');

  if (state.resolutionInProgress
    && (state.resolutionInProgress.id !== input.id || state.resolutionInProgress.mode !== input.mode)) {
    throw new Error('A different resurrection resolution is already in progress.');
  }

  if ((input.mode === 'normal' || input.mode === 'final') && state.pendingRitual?.id !== input.id) {
    throw new Error('The ritual transaction is not the currently pending ritual.');
  }
  if (input.mode === 'rapid' && state.rapidResurrectionLockedForCurrentDeath) {
    throw new Error('Rapid resurrection is locked for the current death episode.');
  }
  if (input.mode === 'miracle' && state.rapidResurrectionLockedForCurrentDeath) {
    throw new Error('This death episode requires a long-casting resurrection ritual.');
  }
  if (input.mode === 'miracle' && state.conventionalResurrectionLocked) {
    throw new Error('A locked soul must use the one final ritual chance.');
  }

  const returned = input.dieSucceeded && input.soulWilling;
  let result: ResurrectionResult;
  if (returned) result = 'success';
  else if (input.dieSucceeded && !input.soulWilling) result = 'declined';
  else result = 'failure';

  if (result === 'success') {
    state.successfulReturns += 1;
    state.rapidResurrectionLockedForCurrentDeath = false;
    state.resurrectionConsumedForCurrentDeath = true;
  } else if (result === 'failure' && input.mode === 'rapid') {
    state.permanentDcPenalty += 1;
    state.rapidResurrectionLockedForCurrentDeath = true;
  } else if (result === 'failure' && (input.mode === 'normal' || input.mode === 'final')) {
    state.conventionalResurrectionLocked = true;
  }
  if (input.mode === 'normal' || input.mode === 'final') state.pendingRitual = null;
  state.resolutionInProgress = null;

  const summary: ResurrectionAttemptSummary = {
    id: input.id,
    mode: input.mode,
    dc: input.dc,
    contributionSuccesses: Math.max(0, Math.trunc(input.contributionSuccesses ?? 0)),
    contributionFailures: Math.max(0, Math.trunc(input.contributionFailures ?? 0)),
    result,
    at: input.at,
    gmId: input.gmId,
  };
  state.attemptHistory = appendAttempt(state.attemptHistory, summary);
  state.processedTransactionIds = rememberTransaction(state.processedTransactionIds, resolveId);
  return { state, result, returned, duplicate: false };
}

export function cancelPendingRitual(inputState: FadingSpiritsState, id: string, at: number, gmId: string): FadingSpiritsState {
  const state = cloneState(inputState);
  if (state.pendingRitual?.id !== id || state.pendingRitual.resolutionStartedBy) return state;
  state.attemptHistory = appendAttempt(state.attemptHistory, {
    id,
    mode: state.pendingRitual.mode,
    dc: 0,
    contributionSuccesses: 0,
    contributionFailures: 0,
    result: 'cancelled',
    at,
    gmId,
  });
  state.pendingRitual = null;
  return state;
}

function uniqueContributors(contributors: RitualContributor[]): RitualContributor[] {
  const seen = new Set<string>();
  const result: RitualContributor[] = [];
  for (const contributor of contributors) {
    if (seen.has(contributor.actorUuid)) throw new Error('Ritual contributors must be distinct actors.');
    seen.add(contributor.actorUuid);
    result.push(cloneState(contributor));
  }
  return result;
}
