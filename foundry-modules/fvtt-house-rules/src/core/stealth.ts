export interface StealthState {
  enabled: boolean;
  expertise: boolean;
  rogueTotalLevel: number;
  gmFullSpeedOverride: boolean;
  ignoreNextMovement: boolean;
  turnKey?: string;
  movedFeet: number;
}

export function stealthSpeedLimit(baseSpeed: number, state: StealthState, rogueLevel = 7): number {
  if (!Number.isFinite(baseSpeed) || baseSpeed < 0 || state.gmFullSpeedOverride || state.rogueTotalLevel >= rogueLevel) return baseSpeed;
  return state.expertise ? Math.max(0, baseSpeed - 10) : baseSpeed / 2;
}

export function advanceStealthMovement(
  state: StealthState,
  baseSpeed: number,
  movedFeet: number,
  turnKey: string,
  rogueLevel = 7
): { state: StealthState; warning: boolean; limit: number } {
  const next = structuredClone(state);
  if (!next.enabled || !Number.isFinite(movedFeet) || movedFeet < 0) return { state: next, warning: false, limit: stealthSpeedLimit(baseSpeed, next, rogueLevel) };
  if (next.ignoreNextMovement) {
    next.ignoreNextMovement = false;
    return { state: next, warning: false, limit: stealthSpeedLimit(baseSpeed, next, rogueLevel) };
  }
  if (next.turnKey !== turnKey) {
    next.turnKey = turnKey;
    next.movedFeet = 0;
  }
  next.movedFeet += movedFeet;
  const limit = stealthSpeedLimit(baseSpeed, next, rogueLevel);
  return { state: next, warning: next.movedFeet > limit, limit };
}

export function endStealthForDash(state: StealthState): StealthState {
  return { ...structuredClone(state), enabled: false, ignoreNextMovement: false };
}

export function nonCombatStealthSuggestion(baseSpeed: number, state: StealthState, rogueLevel = 7): number {
  return stealthSpeedLimit(baseSpeed, state, rogueLevel);
}
