import type { DeckActorCard, DeckActorCommands, DeckCommand, DeckCommandId, DeckSnapshot } from './types.ts';

export type DeckOperationId = Extract<DeckCommandId, `actor.${string}`>
  | 'combat.set-initiative' | 'combat.roll-initiative' | 'combat.toggle-visibility' | 'combat.toggle-defeated'
  | 'token.locate';

export type DeckOperationPayload = Pick<DeckCommand, 'amount' | 'value' | 'delta' | 'statusId' | 'active' | 'field'>;

export interface DeckOperationPlan {
  readonly commands: DeckCommand[];
  readonly eligibleCount: number;
}

/** Actor writes deduplicate shared documents; encounter writes retain each selected combatant. */
export function buildOperationPlan(
  snapshot: DeckSnapshot,
  selectedCards: readonly DeckActorCard[],
  operation: DeckOperationId,
  payload: DeckOperationPayload = {},
): DeckOperationPlan {
  const commands: DeckCommand[] = [];
  if (!snapshot.supported) return { commands, eligibleCount: 0 };
  const seen = new Set<string>();
  for (const selected of selectedCards) {
    const card = currentCard(snapshot, selected, operation.startsWith('combat.'));
    if (!card || !eligible(card, operation, payload)) continue;
    const key = operation.startsWith('combat.') ? card.combatantId! : operation === 'token.locate' ? card.tokenUuid! : card.uuid;
    if (seen.has(key)) continue;
    seen.add(key);
    commands.push({ id: operation, targetUuid: card.uuid, ...payload,
      ...(operation.startsWith('combat.') ? { combatUuid: snapshot.encounter.uuid, combatantId: card.combatantId } : {}),
      ...(operation === 'token.locate' ? { tokenUuid: card.tokenUuid } : {}),
    });
  }
  // Unlinked Tokens may inherit a base Actor field until their first write.
  // Apply their changes before the same batch changes that shared base.
  if ((operation.startsWith('actor.') && operation !== 'actor.open-sheet') || operation === 'combat.toggle-defeated') {
    commands.sort((first, second) => Number(second.targetUuid!.includes('.Token.')) - Number(first.targetUuid!.includes('.Token.')));
  }
  return { commands, eligibleCount: commands.length };
}

function currentCard(snapshot: DeckSnapshot, selected: DeckActorCard, encounterOperation: boolean): DeckActorCard | undefined {
  if (selected.combatantId) {
    return snapshot.encounter.combatants.find((card) => card.combatantId === selected.combatantId && card.uuid === selected.uuid);
  }
  const partyCard = snapshot.party.find((card) => card.uuid === selected.uuid);
  if (!partyCard || !encounterOperation) return partyCard;
  const matches = snapshot.encounter.combatants.filter((card) => card.uuid === selected.uuid);
  return matches.length === 1 ? matches[0] : undefined;
}

function eligible(card: DeckActorCard, operation: DeckOperationId, payload: DeckOperationPayload): boolean {
  if (operation === 'actor.toggle-inspiration' && card.type !== 'character') return false;
  if (operation === 'actor.set-death-save' && (card.type !== 'character' || !card.death)) return false;
  if (operation.startsWith('combat.') && !card.combatantId) return false;
  if (operation === 'token.locate' && !card.tokenUuid) return false;
  if ((operation === 'actor.set-status' || operation === 'actor.toggle-status') && payload.statusId
    && !card.statusChoices.some((choice) => choice.id === payload.statusId)) return false;
  const key: keyof DeckActorCommands = operation === 'actor.adjust-exhaustion'
    ? payload.delta === -1 ? 'exhaustionDown' : 'exhaustionUp'
    : AVAILABILITY[operation];
  return card.commands[key].enabled;
}

const AVAILABILITY: Record<Exclude<DeckOperationId, 'actor.adjust-exhaustion'>, keyof DeckActorCommands> = {
  'actor.damage': 'damage', 'actor.heal': 'heal', 'actor.temp-hp': 'tempHp',
  'actor.toggle-inspiration': 'toggleInspiration', 'actor.toggle-status': 'toggleStatus',
  'actor.set-hp': 'setHp', 'actor.set-temp-hp': 'setTempHp', 'actor.set-max-modifier': 'setMaxModifier',
  'actor.set-ac-modifier': 'setAcModifier', 'actor.set-status': 'toggleStatus',
  'actor.toggle-concentration': 'toggleConcentration', 'actor.set-death-save': 'setDeathSave',
  'actor.open-sheet': 'openSheet', 'combat.set-initiative': 'setInitiative',
  'combat.roll-initiative': 'rollInitiative', 'combat.toggle-visibility': 'toggleVisibility',
  'combat.toggle-defeated': 'toggleDefeated', 'token.locate': 'locate',
};
