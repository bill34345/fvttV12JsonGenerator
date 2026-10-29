import type { DeckActorCard, DeckSnapshot } from './types.ts';

export interface DeckSelectionEntry { readonly key: string; readonly card: DeckActorCard }

export function partySelectionKey(card: DeckActorCard, snapshot: DeckSnapshot): string {
  const matches = snapshot.encounter.combatants.filter((combatant) => combatant.uuid === card.uuid);
  return matches.length === 1 ? `combatant:${matches[0]!.combatantId}` : `actor:${card.uuid}`;
}

export function selectionEntries(snapshot: DeckSnapshot): DeckSelectionEntry[] {
  const entries = new Map<string, DeckActorCard>();
  for (const card of snapshot.party) entries.set(partySelectionKey(card, snapshot), card);
  for (const card of snapshot.encounter.combatants) entries.set(`combatant:${card.combatantId}`, card);
  return [...entries].map(([key, card]) => ({ key, card }));
}

/** Selection belongs to a turn, while HP/status refreshes keep the same targets. */
export class DeckOperationSelection {
  readonly keys = new Set<string>();
  #turn: string | undefined;
  #entries: DeckSelectionEntry[] = [];

  update(snapshot: DeckSnapshot): void {
    const encounter = snapshot.encounter;
    const current = encounter.currentCombatantId ?? encounter.combatants.find((card) => card.current)?.combatantId ?? '';
    const turn = encounter.active ? `${encounter.uuid ?? encounter.id ?? ''}:${encounter.round}:${current}` : '';
    if (this.#turn !== undefined && this.#turn !== turn) this.keys.clear();
    this.#turn = turn;
    this.#entries = selectionEntries(snapshot);
    const available = new Set(this.#entries.map((entry) => entry.key));
    for (const key of this.keys) if (!available.has(key)) this.keys.delete(key);
  }

  get selected(): DeckSelectionEntry[] { return this.#entries.filter((entry) => this.keys.has(entry.key)); }
  toggle(key: string, selected: boolean): void {
    if (!this.#entries.some((entry) => entry.key === key)) return;
    if (selected) this.keys.add(key); else this.keys.delete(key);
  }
  clear(): void { this.keys.clear(); }
}

export function fittingSelectionTags(widths: readonly number[], available: number, gap: number, overflowWidth: number): number {
  if (widths.reduce((total, width) => total + width, 0) + Math.max(0, widths.length - 1) * gap <= available) return widths.length;
  let used = overflowWidth;
  let count = 0;
  for (const width of widths) {
    if (used + gap + width > available) break;
    used += gap + width;
    count += 1;
  }
  return count;
}
