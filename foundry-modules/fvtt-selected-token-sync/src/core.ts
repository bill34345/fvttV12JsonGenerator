import { INTENT_TTL_MS, type SyncKind } from './constants.ts';

let objectSequence = 0;
let transactionSequence = 0;
const objectKeys = new WeakMap<object, string>();

export interface SyncTarget {
  readonly token: any;
  readonly document: any;
  readonly actor: any | null;
  readonly tokenKey: string;
  readonly actorKey: string | null;
  readonly label: string;
}

export interface BaseIntent {
  readonly transactionId: string;
  readonly kind: SyncKind;
  readonly sourceTokenKey: string;
  readonly sourceActorKey: string | null;
  readonly userId: string;
  readonly targets: readonly SyncTarget[];
  readonly createdAt: number;
}

export interface StatusIntent extends BaseIntent {
  readonly kind: 'status';
  readonly statusId: string;
  readonly active: boolean;
  readonly overlay: boolean;
}

export interface MovementIntent extends BaseIntent {
  readonly kind: 'movement';
  readonly movementAction: string | null;
}

export type PendingIntent = StatusIntent | MovementIntent;

export interface ValidationFailure {
  readonly target: SyncTarget;
  readonly reason: string;
}

export function newTransactionId(): string {
  transactionSequence += 1;
  return `${Date.now().toString(36)}-${transactionSequence.toString(36)}`;
}

export function getTokenDocument(token: any): any {
  return token?.document ?? token;
}

export function getActor(token: any): any | null {
  return token?.actor ?? getTokenDocument(token)?.actor ?? null;
}

export function stableKey(value: any, prefix: string): string {
  if (value === null || value === undefined) return `${prefix}:missing`;
  if (typeof value !== 'object' && typeof value !== 'function') return `${prefix}:${String(value)}`;
  const uuid = typeof value.uuid === 'string' ? value.uuid : undefined;
  if (uuid) return `${prefix}:uuid:${uuid}`;
  const id = typeof value.id === 'string' ? value.id : undefined;
  if (id) return `${prefix}:id:${id}`;
  const existing = objectKeys.get(value);
  if (existing) return existing;
  const key = `${prefix}:object:${++objectSequence}`;
  objectKeys.set(value, key);
  return key;
}

export function tokenKey(token: any): string {
  return stableKey(getTokenDocument(token), 'token');
}

export function actorKey(actor: any): string | null {
  return actor ? stableKey(actor, 'actor') : null;
}

export function collectTargets(controlled: readonly any[], sourceToken: any): SyncTarget[] {
  const result: SyncTarget[] = [];
  const seen = new Set<string>();
  for (const token of [...controlled, sourceToken]) {
    if (!token) continue;
    const document = getTokenDocument(token);
    const key = tokenKey(document);
    if (seen.has(key)) continue;
    seen.add(key);
    const actor = getActor(token);
    result.push({
      token,
      document,
      actor,
      tokenKey: key,
      actorKey: actorKey(actor),
      label: String(token.name ?? document?.name ?? actor?.name ?? key),
    });
  }
  return result;
}

export function dedupeActors(targets: readonly SyncTarget[]): any[] {
  const result: any[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    if (!target.actor || !target.actorKey || seen.has(target.actorKey)) continue;
    seen.add(target.actorKey);
    result.push(target.actor);
  }
  return result;
}

/** Read the native dnd5e condition effect, not the binary Actor.statuses set. */
export function conditionLevel(actor: any, statusId: string, effectId: string | undefined): number {
  const effects = actor?.effects;
  const byId = effectId ? effects?.get?.(effectId) : undefined;
  const candidates = effects?.documentsByType?.condition ?? effects?.contents ?? [...(effects?.values?.() ?? [])];
  const effect = byId ?? candidates.find?.((entry: any) => entry?.system?.type === statusId);
  const level = effect?.system?.level;
  return Number.isInteger(level) && level > 0 ? level : 0;
}

/**
 * Apply one HUD level step to each distinct Actor. Snapshot all levels first,
 * then re-read after each native write: world Actor updates can project into a
 * selected synthetic Actor before its own turn in this transaction.
 */
export function planGradedStatusDelta(
  targets: readonly SyncTarget[], statusId: string, effectId: string | undefined,
  maxLevel: number, delta: 1 | -1,
): { actor: any; desired: number }[] {
  const snapshots = dedupeActors(targets).map((actor) => ({
    actor,
    desired: Math.min(maxLevel, Math.max(0, conditionLevel(actor, statusId, effectId) + delta)),
  }));
  snapshots.sort((a, b) => Number(a.actor?.isToken === true) - Number(b.actor?.isToken === true));
  return snapshots;
}

type GradedStatusWriter = (actor: any, statusId: string, levels: number, previousLevel: number) => Promise<unknown>;

export async function applyGradedStatusDelta(
  targets: readonly SyncTarget[], statusId: string, effectId: string | undefined,
  maxLevel: number, delta: 1 | -1,
  write: GradedStatusWriter = (actor, id, levels) => actor.toggleStatusEffect(id, { levels }),
): Promise<void> {
  for (const { actor, desired } of planGradedStatusDelta(targets, statusId, effectId, maxLevel, delta)) {
    const current = conditionLevel(actor, statusId, effectId);
    const remaining = desired - current;
    if (remaining === 0) continue;
    await write(actor, statusId, remaining, current);
  }
}

export function normalizeMovementAction(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function canUserModify(document: any, user: any, action = 'update'): boolean {
  if (!document) return false;
  if (typeof document.canUserModify !== 'function') return true;
  try {
    return document.canUserModify(user, action) === true;
  } catch {
    return false;
  }
}

export function canSelectMovementAction(
  movementAction: string | null,
  document: any,
  movementActions: Record<string, any> | undefined,
): boolean {
  if (movementAction === null) return true;
  const descriptor = movementActions?.[movementAction];
  if (!descriptor) return false;
  if (typeof descriptor.canSelect === 'function') {
    try {
      return descriptor.canSelect(document) === true;
    } catch {
      return false;
    }
  }
  return descriptor.canSelect !== false;
}

export function validateTargets(
  targets: readonly SyncTarget[],
  kind: SyncKind,
  user: any,
  movementAction: string | null = null,
  movementActions: Record<string, any> | undefined = undefined,
): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  for (const target of targets) {
    if (kind === 'status') {
      if (!target.actor) failures.push({ target, reason: 'missing actor' });
      else if (!canUserModify(target.actor, user)) failures.push({ target, reason: 'actor is not editable' });
      continue;
    }
    if (!canUserModify(target.document, user)) failures.push({ target, reason: 'token is not editable' });
    else if (!canSelectMovementAction(movementAction, target.document, movementActions)) {
      failures.push({ target, reason: `movement action ${movementAction ?? 'default'} is not selectable` });
    }
  }
  return failures;
}

export function statusIdFromEffect(effect: any): string | null {
  const statuses = effect?.statuses;
  if (statuses && typeof statuses.values === 'function') {
    const first = statuses.values().next()?.value;
    if (typeof first === 'string') return first;
  }
  const legacy = effect?.flags?.core?.statusId;
  return typeof legacy === 'string' ? legacy : null;
}

export function createIntentStore(ttlMs = INTENT_TTL_MS, clock = () => Date.now()): IntentStore {
  return new IntentStore(ttlMs, clock);
}

export class IntentStore {
  #intents: PendingIntent[] = [];

  constructor(
    private readonly ttlMs = INTENT_TTL_MS,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  add(intent: PendingIntent): void {
    this.purge();
    this.#intents.push(intent);
  }

  consume(predicate: (intent: PendingIntent) => boolean): PendingIntent | undefined {
    this.purge();
    const index = this.#intents.findIndex(predicate);
    if (index < 0) return undefined;
    return this.#intents.splice(index, 1)[0];
  }

  get size(): number {
    this.purge();
    return this.#intents.length;
  }

  clear(): void {
    this.#intents.length = 0;
  }

  private purge(): void {
    const now = this.clock();
    this.#intents = this.#intents.filter((intent) => now - intent.createdAt <= this.ttlMs);
  }
}
