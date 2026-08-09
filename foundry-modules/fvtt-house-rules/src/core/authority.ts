/** Minimal user shape so pure authority selection remains testable outside Foundry. */
export interface ActiveUser {
  id: string;
  active: boolean;
  isGM: boolean;
}

/**
 * Foundry's "activeGM" is not used here: a sorted GM id is deterministic across
 * clients and survives reconnect order changes.
 */
export function selectAuthority(users: Iterable<ActiveUser>): ActiveUser | null {
  return Array.from(users)
    .filter((user) => user.active && user.isGM)
    .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

export function isAuthority(currentUserId: string | undefined, users: Iterable<ActiveUser>): boolean {
  return selectAuthority(users)?.id === currentUserId;
}
