export interface ReminderAction {
  id: string;
  name: string;
  image?: string;
  facts?: readonly string[];
  available: boolean;
  cost: number;
}

export interface LegendaryBoss {
  id: string;
  name: string;
  portrait?: string;
  eligible: boolean;
  remaining: number;
  actions: readonly ReminderAction[];
}

export function legendaryReminder(endedId: string, bosses: readonly LegendaryBoss[]) {
  return bosses.flatMap(({ id, name, portrait, eligible, remaining, actions }) => {
    if (id === endedId || !eligible || remaining <= 0) return [];
    const options = actions.filter(action => action.available && action.cost <= remaining);
    return options.length ? [{ id, name, portrait, remaining, actions: options }] : [];
  });
}

export function lairRounds(
  previousRound: number, previousInitiative: number | null,
  currentRound: number, currentInitiative: number | null,
): number[] {
  if (currentInitiative === null || currentRound < 1) return [];
  if (previousRound === currentRound) {
    return previousInitiative !== null && previousInitiative >= 20 && currentInitiative < 20 ? [currentRound] : [];
  }
  if (currentRound !== previousRound + 1) return [];

  const crossed: number[] = [];
  if (previousRound >= 1 && previousInitiative !== null && previousInitiative >= 20) crossed.push(previousRound);
  if (currentInitiative < 20) crossed.push(currentRound);
  return crossed;
}
