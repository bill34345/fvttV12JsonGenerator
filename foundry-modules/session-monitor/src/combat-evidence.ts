import type { CombatControl, CombatTiming } from './schema';

const CONTROL_SELECTOR = 'button[data-action]';
const TRACKER_SELECTOR = '#combat, #combat-popout, .combat-tracker';
const ACTION_LIMIT_MS = 15_000;

interface CombatState {
  id: string;
  round: number | null;
  turn: number | null;
}

interface PendingCombatAction {
  combatId: string;
  timing: CombatTiming;
  startMs: number;
  expected?: Pick<CombatState, 'round' | 'turn'>;
  updated?: boolean;
}

export function readCombatControl(target: EventTarget | null): CombatControl | undefined {
  const button = (target as Element | null)?.closest?.(CONTROL_SELECTOR);
  if (!button?.closest(TRACKER_SELECTOR) || button.hasAttribute('disabled')) return undefined;
  switch (button.getAttribute('data-action')) {
    case 'startCombat': return 'start-combat';
    case 'nextTurn': return 'next-turn';
    case 'rollAll':
    case 'rollNPC':
    case 'rollInitiative': return 'roll-initiative';
    default: return undefined;
  }
}

export class CombatEvidence {
  #pending?: PendingCombatAction;

  clear(): void {
    this.#pending = undefined;
  }

  click(control: CombatControl, combat: CombatState, clickedAt: string, startMs: number): CombatTiming {
    const timing = { control, clickedAt, sinceClickMs: 0 };
    this.#pending = control === 'roll-initiative' ? undefined : { combatId: combat.id, timing, startMs };
    return timing;
  }

  expect(control: CombatControl, combat: CombatState, change: Pick<CombatState, 'round' | 'turn'>, nowMs: number): void {
    const pending = this.#match(combat, nowMs);
    if (pending?.timing.control === control && !pending.expected
      && (combat.round !== change.round || combat.turn !== change.turn)) {
      pending.expected = { round: change.round, turn: change.turn };
    }
  }

  update(combat: CombatState, change: object, ownUpdate: boolean, nowMs: number): CombatTiming | undefined {
    const pending = this.#match(combat, nowMs);
    if (!pending?.expected || pending.updated || !ownUpdate || !this.#matchesState(pending, combat)
      || !(Object.hasOwn(change, 'round') || Object.hasOwn(change, 'turn'))) return undefined;
    pending.updated = true;
    return this.#phase(pending, nowMs);
  }

  render(combat: CombatState, nowMs: number): CombatTiming | undefined {
    const pending = this.#match(combat, nowMs);
    if (!pending?.updated || !this.#matchesState(pending, combat)) return undefined;
    this.clear();
    return this.#phase(pending, nowMs);
  }

  #match(combat: CombatState, nowMs: number): PendingCombatAction | undefined {
    const pending = this.#pending;
    if (pending && nowMs - pending.startMs > ACTION_LIMIT_MS) {
      this.clear();
      return undefined;
    }
    return pending?.combatId === combat.id ? pending : undefined;
  }

  #matchesState(pending: PendingCombatAction, combat: CombatState): boolean {
    return pending.expected?.round === combat.round && pending.expected?.turn === combat.turn;
  }

  #phase(pending: PendingCombatAction, nowMs: number): CombatTiming {
    return { ...pending.timing, sinceClickMs: Math.round(nowMs - pending.startMs) };
  }
}
