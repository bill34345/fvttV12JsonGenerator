import { cloneState, normalizeInjuryStacks, rememberTransaction, type FadingSpiritsState, type InjuryState } from './state.ts';

export interface HpTransitionEvent {
  kind: 'hp';
  transactionId: string;
  at: number;
  oldValue: number;
  newValue: number;
  oldMax: number;
  newMax: number;
  suppressed?: boolean;
}

export interface RestEvent {
  kind: 'rest';
  transactionId: string;
  at: number;
  restType: 'short' | 'long';
}

export type InjuryEvent = HpTransitionEvent | RestEvent;

export type InjuryAction =
  | { type: 'setDeathFailures'; failures: number }
  | { type: 'promptThreeStackDecision'; stacks: number; episodeId: string }
  | { type: 'injuryAdded'; stacks: number }
  | { type: 'injuryCleared'; reason: 'fullHealing' | 'rest' };

export interface InjuryTransitionResult {
  injury: InjuryState;
  fading: FadingSpiritsState;
  actions: InjuryAction[];
  duplicate: boolean;
}

export function transitionInjury(injuryInput: InjuryState, fadingInput: FadingSpiritsState, event: InjuryEvent): InjuryTransitionResult {
  const injury = cloneState(injuryInput);
  injury.stacks = normalizeInjuryStacks(injury.stacks);
  const fading = cloneState(fadingInput);
  if (injury.processedTransactionIds.includes(event.transactionId)) return { injury, fading, actions: [], duplicate: true };
  injury.processedTransactionIds = rememberTransaction(injury.processedTransactionIds, event.transactionId);
  const actions: InjuryAction[] = [];

  if (event.kind === 'rest') {
    if (injury.stacks > 0) actions.push({ type: 'injuryCleared', reason: 'rest' });
    injury.stacks = 0;
    injury.episode = { id: null, open: false, openedAt: null };
    injury.suppressNextRecovery = null;
    return { injury, fading, actions, duplicate: false };
  }

  const oldHp = Math.max(0, event.oldValue);
  const newHp = Math.max(0, event.newValue);
  const oldMax = Math.max(0, event.oldMax);
  const newMax = Math.max(0, event.newMax);
  const enteredZero = oldHp > 0 && newHp === 0;
  const recoveredFromZero = oldHp === 0 && newHp > 0;

  if (enteredZero) {
    injury.episode = { id: event.transactionId, open: true, openedAt: event.at };
    fading.currentDeathEpisodeId = event.transactionId;
    fading.rapidResurrectionLockedForCurrentDeath = false;
    fading.resurrectionConsumedForCurrentDeath = false;
    fading.resolutionInProgress = null;
    fading.pendingRitual = null;
    if (injury.stacks >= 3) actions.push({ type: 'promptThreeStackDecision', stacks: injury.stacks, episodeId: event.transactionId });
    else actions.push({ type: 'setDeathFailures', failures: injury.stacks });
  }

  if (recoveredFromZero && injury.episode.open) {
    const suppressed = event.suppressed === true || injury.suppressNextRecovery !== null;
    injury.episode = { id: null, open: false, openedAt: null };
    if (suppressed) injury.suppressNextRecovery = null;
    else {
      const nextStacks = normalizeInjuryStacks(injury.stacks + 1);
      if (nextStacks > injury.stacks) actions.push({ type: 'injuryAdded', stacks: nextStacks });
      injury.stacks = nextStacks;
    }
  }

  const actualHealingToFull = newHp > oldHp && newMax > 0 && newHp >= newMax && newMax >= oldMax;
  if (actualHealingToFull) {
    if (injury.stacks > 0) actions.push({ type: 'injuryCleared', reason: 'fullHealing' });
    injury.stacks = 0;
    injury.episode = { id: null, open: false, openedAt: null };
    injury.suppressNextRecovery = null;
  }

  injury.lastObservedHp = newHp;
  injury.lastObservedMax = newMax;
  return { injury, fading, actions, duplicate: false };
}

export function setInjuryStacks(injuryInput: InjuryState, stacks: number): InjuryState {
  const injury = cloneState(injuryInput);
  injury.stacks = normalizeInjuryStacks(stacks);
  return injury;
}

export function retainedD20Face(roll: unknown): number | null {
  const candidate = roll as { d20?: { results?: Array<{ result?: unknown; active?: boolean; discarded?: boolean }> }; dice?: Array<{ faces?: number; results?: Array<{ result?: unknown; active?: boolean; discarded?: boolean }> }> };
  const die = candidate.d20 ?? candidate.dice?.find((entry) => entry.faces === 20);
  const result = die?.results?.find((entry) => entry.active === true && entry.discarded !== true)
    ?? die?.results?.find((entry) => entry.discarded !== true);
  return Number.isFinite(result?.result) ? Number(result!.result) : null;
}

export function applyNineteenCritical(details: Record<string, unknown>, face: number | null): boolean {
  if (face === null || face < 19) return false;
  details.updates = {
    'system.attributes.death.success': 0,
    'system.attributes.death.failure': 0,
    'system.attributes.hp.value': 1,
  };
  details.chatString = 'DND5E.DeathSaveCriticalSuccess';
  return true;
}
