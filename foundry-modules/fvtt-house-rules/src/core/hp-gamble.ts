export interface HitPointGambleInput {
  actorId: string;
  classId: string;
  level: number;
  firstRoll: number;
  reroll?: number;
}

export interface HitPointGambleResult {
  lockId: string;
  accepted: number | null;
  rerolled: boolean;
  reason: "level-one" | "accepted" | "invalid";
}

export function hpGambleLockId(actorId: string, classId: string, level: number): string | null {
  if (!actorId || !classId || !Number.isInteger(level) || level < 1) return null;
  return `hp:${actorId}:${classId}:${level}`;
}

/** First level is untouched; a first 1 gets exactly one reroll and its second result is final. */
export function resolveHitPointGamble(input: HitPointGambleInput): HitPointGambleResult {
  const lockId = hpGambleLockId(input.actorId, input.classId, input.level);
  if (!lockId || !Number.isInteger(input.firstRoll) || input.firstRoll < 1) {
    return { lockId: lockId ?? "", accepted: null, rerolled: false, reason: "invalid" };
  }
  if (input.level === 1) return { lockId, accepted: null, rerolled: false, reason: "level-one" };
  if (input.firstRoll !== 1) return { lockId, accepted: input.firstRoll, rerolled: false, reason: "accepted" };
  const reroll = input.reroll;
  if (typeof reroll !== "number" || !Number.isInteger(reroll) || reroll < 1) {
    return { lockId, accepted: null, rerolled: true, reason: "invalid" };
  }
  return { lockId, accepted: reroll, rerolled: true, reason: "accepted" };
}

export function lowAbilityReminder(abilities: Record<string, { value?: number | null }> | undefined, threshold = 4): string[] {
  if (!abilities || !Number.isInteger(threshold) || threshold < 0) return [];
  return Object.entries(abilities)
    .filter(([, ability]) => typeof ability.value === "number" && ability.value <= threshold)
    .map(([id]) => id)
    .sort();
}
