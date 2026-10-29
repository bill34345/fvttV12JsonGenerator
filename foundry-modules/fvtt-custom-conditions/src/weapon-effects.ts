import { genericConditionsSupported, isNative6SystemVersion } from './runtime-compatibility.ts';
import {
  buildWeaponEffectFlag,
  createWeaponEffectInstance,
  parseWeaponEffectInstance,
  readWeaponEffectInstance,
  type WeaponEffectExpiry,
  type WeaponEffectInput,
  type WeaponEffectInstance,
  type WeaponEffectKind,
  type WeaponEffectReservation,
  type WeaponEffectReservationInput,
  type WeaponEffectReservationTicket,
  type WeaponEffectTurnAnchor,
  type SlowWeaponEffectParams,
} from '@fvtt-json-generator/contracts/weapon-effects';
import { MODULE_ID } from './constants.ts';

export interface WeaponEffectEntry {
  id: string;
  name: string;
  origin: string;
  disabled: boolean;
  instance: WeaponEffectInstance;
  effect: any;
}

export interface WeaponEffectTurnContext {
  event?: { type?: string; documentType?: string };
  document?: any;
  combat?: any;
  combatUuid?: string;
  round?: number;
  turn?: number;
}

export interface WeaponEffectRuntimeOptions {
  /** Used by tests and by the parent ConditionRuntime to identify the active GM. */
  isActiveGM?: () => boolean;
}

const ICONS: Readonly<Record<WeaponEffectKind, string>> = {
  sap: 'modules/fvtt-custom-conditions/icons/enfeebled.svg',
  slow: 'modules/fvtt-custom-conditions/icons/slowed.svg',
  vex: 'modules/fvtt-custom-conditions/icons/jinxed.svg',
};

const LABELS: Readonly<Record<WeaponEffectKind, string>> = {
  sap: 'Sap',
  slow: 'Slow',
  vex: 'Vex',
};

/**
 * Persistent, active-GM-owned lifecycle for the three weapon mastery effects.
 * The runtime deliberately does not modify attack rolls itself.  A weapon
 * module can reserve/commit/cancel a ticket around its attack bridge and use
 * list() to apply the effect's rule to that roll.
 */
export class WeaponEffectRuntime {
  readonly globals: any;
  readonly isActiveGM: () => boolean;
  #queues = new Map<string, Promise<unknown>>();
  #knownActors = new Map<string, any>();

  constructor(globals: any = globalThis, isActiveGM: () => boolean = () => isActiveGMFrom(globals), _options?: WeaponEffectRuntimeOptions) {
    this.globals = globals;
    this.isActiveGM = isActiveGM;
  }

  isSupported(): boolean {
    return genericConditionsSupported(this.globals.game);
  }

  isNative6Supported(): boolean {
    return this.globals.game?.version === '14.368' && this.globals.game.system?.id === 'dnd5e'
      && isNative6SystemVersion(this.globals.game.system.version);
  }

  definitions(): Array<{ kind: WeaponEffectKind; label: string }> {
    return (['sap', 'slow', 'vex'] as const).map((kind) => ({ kind, label: LABELS[kind] }));
  }

  async whenIdle(): Promise<void> {
    while (this.#queues.size) await Promise.all([...this.#queues.values()]);
  }

  stop(): void {
    this.#queues.clear();
    this.#knownActors.clear();
  }

  list(actor: any): WeaponEffectEntry[] {
    if (!actor) return [];
    this.#rememberActor(actor);
    return collection(actor.effects).flatMap((effect) => {
      const instance = readWeaponEffectInstance(effect);
      if (!instance) return [];
      return [{
        id: effectId(effect),
        name: String(effect.name ?? LABELS[instance.effectKind]),
        origin: String(effect.origin ?? sourceOrigin(instance) ?? ''),
        disabled: inactive(effect) || instance.enabled === false,
        instance,
        effect,
      }];
    });
  }

  async apply(actor: any, input: WeaponEffectInput): Promise<any> {
    this.requireGM(actor);
    const initial = createWeaponEffectInstance(input);
    validateOwnerRelationship(actor, initial);
    const instance = this.withRuntimeExpiry(actor, initial);
    return this.enqueue(actor, async () => {
      this.requireGM(actor);
      const created = await actor.createEmbeddedDocuments?.('ActiveEffect', [this.effectData(instance, input.name, input.origin, actor)], {
        [MODULE_ID]: { managed: true, weaponEffect: true },
      });
      const effect = created?.[0];
      if (effect) {
        this.#rememberActor(actor);
        if (instance.effectKind === 'slow') await this.recomputeSlowGroup(actor, instance.stackingGroup);
      }
      return effect;
    });
  }

  async remove(actor: any, id: string): Promise<void> {
    this.requireGM(actor);
    await this.enqueue(actor, async () => {
      this.requireGM(actor);
      const entry = this.list(actor).find((candidate) => candidate.id === id);
      if (entry) {
        const stackingGroup = entry.instance.effectKind === 'slow' ? entry.instance.stackingGroup : undefined;
        await actor.deleteEmbeddedDocuments?.('ActiveEffect', [id], { [MODULE_ID]: { managed: true, weaponEffect: true } });
        if (stackingGroup) await this.recomputeSlowGroup(actor, stackingGroup);
      }
    });
  }

  async setEnabled(actor: any, id: string, enabled: boolean): Promise<void> {
    this.requireGM(actor);
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
    await this.enqueue(actor, async () => {
      this.requireGM(actor);
      const entry = this.list(actor).find((candidate) => candidate.id === id);
      if (!entry) throw new Error('Weapon effect 已移除或无效。');
      const instance = parseWeaponEffectInstance({
        ...entry.instance,
        revision: entry.instance.revision + 1,
        enabled,
        ...(enabled ? {} : { reservation: undefined }),
      });
      await this.updateInstance(actor, id, instance, !enabled);
      if (instance.effectKind === 'slow') await this.recomputeSlowGroup(actor, instance.stackingGroup);
    });
  }

  /**
   * Reserve one eligible Sap/Vex before the attack roll.  The actor document
   * is queued and the flag is updated with a monotonically increasing
   * instance revision, making a second concurrent reservation ineligible.
   */
  async reserve(actor: any, input: WeaponEffectReservationInput): Promise<WeaponEffectReservationTicket | undefined> {
    this.requireGM(actor);
    validateAttackId(input.attackId);
    if (input.effectId !== undefined) validateIdentifier(input.effectId, 'effectId');
    if (input.targetActorUuid !== undefined) validateIdentifier(input.targetActorUuid, 'targetActorUuid');
    if (input.targetTokenUuid !== undefined) validateIdentifier(input.targetTokenUuid, 'targetTokenUuid');
    return this.enqueue(actor, async () => {
      this.requireGM(actor);
      if (input.effectId) {
        const existing = this.list(actor).find((entry) => entry.id === input.effectId
          && entry.instance.reservation?.attackId === input.attackId
          && (entry.instance.reservation.targetActorUuid ?? undefined) === (input.targetActorUuid ?? undefined));
        if (existing?.instance.reservation) return this.ticket(existing.id, existing.instance.reservation);
      }
      const entries = this.list(actor).filter((entry) => {
        if (entry.disabled || entry.instance.consumeOn !== 'nextCompletedAttack' || entry.instance.reservation) return false;
        if (input.effectId && entry.id !== input.effectId) return false;
        if (entry.instance.effectKind === 'vex') {
          if (!input.targetActorUuid || entry.instance.target.actorUuid !== input.targetActorUuid) return false;
          if (entry.instance.source.actorUuid !== actorKey(actor)) return false;
        } else if (entry.instance.effectKind === 'sap' && entry.instance.target.actorUuid !== actorKey(actor)) {
          return false;
        }
        return true;
      });
      const entry = entries[0];
      if (!entry) return undefined;
      const nextRevision = entry.instance.revision + 1;
      const reservation: WeaponEffectReservation = {
        attackId: input.attackId,
        instanceId: entry.instance.instanceId,
        revision: nextRevision,
        ...(input.targetActorUuid === undefined ? {} : { targetActorUuid: input.targetActorUuid }),
        ...(input.targetTokenUuid === undefined ? {} : { targetTokenUuid: input.targetTokenUuid }),
        state: input.started ? 'started' : 'reserved',
        reservedAt: Date.now(),
        ...(input.started ? { startedAt: Date.now() } : {}),
      };
      const next = parseWeaponEffectInstance({ ...entry.instance, revision: nextRevision, reservation });
      await this.updateInstance(actor, entry.id, next, entry.disabled);
      return this.ticket(entry.id, reservation);
    });
  }

  /** Mark a reserved ticket started at the point the attack crosses its roll boundary. */
  async start(actor: any, ticket: WeaponEffectReservationTicket): Promise<WeaponEffectReservationTicket> {
    this.requireGM(actor);
    return this.enqueue(actor, async () => {
      this.requireGM(actor);
      const entry = this.requireTicketEntry(actor, ticket);
      const reservation = entry.instance.reservation!;
      if (reservation.state === 'started') return this.ticket(entry.id, reservation);
      const nextRevision = entry.instance.revision + 1;
      const nextReservation: WeaponEffectReservation = {
        ...reservation,
        revision: nextRevision,
        state: 'started',
        startedAt: Date.now(),
      };
      const next = parseWeaponEffectInstance({ ...entry.instance, revision: nextRevision, reservation: nextReservation });
      await this.updateInstance(actor, entry.id, next, entry.disabled);
      const updated = this.ticket(entry.id, nextReservation);
      Object.assign(ticket, updated);
      return updated;
    });
  }

  /** Consume a Sap/Vex reservation only after the attack has completed. */
  async commit(actor: any, ticket: WeaponEffectReservationTicket): Promise<void> {
    this.requireGM(actor);
    await this.enqueue(actor, async () => {
      this.requireGM(actor);
      const entry = this.requireTicketEntry(actor, ticket);
      await actor.deleteEmbeddedDocuments?.('ActiveEffect', [entry.id], { [MODULE_ID]: { managed: true, weaponEffect: true } });
    });
  }

  /**
   * Release a reservation which never crossed the roll boundary.  A started
   * reservation is intentionally retained: after a crash or GM hand-off its
   * outcome is unknown and must not be granted a second use automatically.
   */
  async cancel(actor: any, ticket: WeaponEffectReservationTicket): Promise<void> {
    this.requireGM(actor);
    await this.enqueue(actor, async () => {
      this.requireGM(actor);
      const entry = this.requireTicketEntry(actor, ticket);
      const reservation = entry.instance.reservation!;
      if (reservation.state === 'started') return;
      const nextRevision = entry.instance.revision + 1;
      const next = parseWeaponEffectInstance({ ...entry.instance, revision: nextRevision, reservation: undefined });
      await this.updateInstance(actor, entry.id, next, entry.disabled);
    });
  }

  /** Apply source/target-relative expiry from the existing Trigger Engine turn events. */
  async handleTriggerEvent(context: WeaponEffectTurnContext): Promise<void> {
    if (!this.isSupported() || !this.isActiveGM() || context.event?.documentType !== 'Actor') return;
    if (context.event.type !== 'combatTurnStart' && context.event.type !== 'combatTurnEnd') return;
    const actor = context.document;
    if (!actor || actor.documentName !== 'Actor') return;
    this.#rememberActor(actor);
    this.#rememberWorldActors();
    const phase = context.event.type === 'combatTurnStart' ? 'start' : 'end';
    const current = turnAnchor(context);
    const actors = [...this.#knownActors.values()];
    for (const targetActor of actors) {
      const allEntries = this.list(targetActor);
      const slowGroups = new Set(allEntries
        .filter((entry) => entry.instance.effectKind === 'slow')
        .map((entry) => entry.instance.stackingGroup));
      for (const stackingGroup of slowGroups) {
        await this.enqueue(targetActor, () => this.recomputeSlowGroup(targetActor, stackingGroup));
      }
      const entries = allEntries.filter((entry) => !entry.disabled && entry.instance.expires);
      for (const entry of entries) {
        const expiry = entry.instance.expires!;
        if (expiry.phase !== phase) continue;
        const expectedActor = expiry.reference === 'source' ? entry.instance.source.actorUuid : entry.instance.target.actorUuid;
        if (expectedActor !== actorKey(actor)) continue;
        await this.enqueue(targetActor, async () => {
          const latest = this.list(targetActor).find((candidate) => candidate.id === entry.id);
          if (!latest || latest.disabled || !latest.instance.expires) return;
          const latestExpiry = latest.instance.expires;
          if (latestExpiry.phase !== phase) return;
          if (latestExpiry.reference === 'source' ? latest.instance.source.actorUuid !== actorKey(actor)
            : latest.instance.target.actorUuid !== actorKey(actor)) return;
          if (!latestExpiry.anchor) {
            const anchored = parseWeaponEffectInstance({
              ...latest.instance,
              revision: latest.instance.revision + 1,
              expires: { ...latestExpiry, anchor: current },
            });
            await this.updateInstance(targetActor, latest.id, anchored, latest.disabled);
            return;
          }
          if (turnsElapsed(latestExpiry.anchor, current, context, actorKey(actor)) >= latestExpiry.turns) {
            const stackingGroup = latest.instance.effectKind === 'slow' ? latest.instance.stackingGroup : undefined;
            await targetActor.deleteEmbeddedDocuments?.('ActiveEffect', [latest.id], { [MODULE_ID]: { managed: true, weaponEffect: true } });
            if (stackingGroup) await this.recomputeSlowGroup(targetActor, stackingGroup);
          }
        });
      }
    }
  }

  private withRuntimeExpiry(actor: any, instance: WeaponEffectInstance): WeaponEffectInstance {
    const expiry = instance.expires ?? {
      reference: 'source' as const,
      phase: (instance.effectKind === 'vex' ? 'end' : 'start') as 'start' | 'end',
      turns: 1,
    } satisfies WeaponEffectExpiry;
    if (expiry.anchor) return parseWeaponEffectInstance({ ...instance, expires: expiry });
    const anchor = this.currentTurnAnchor();
    return parseWeaponEffectInstance({ ...instance, expires: { ...expiry, ...(anchor ? { anchor } : {}) } });
  }

  private effectData(instance: WeaponEffectInstance, name?: string, origin?: string, actor?: any): Record<string, unknown> {
    return {
      name: name || LABELS[instance.effectKind],
      type: 'base',
      img: ICONS[instance.effectKind],
      disabled: instance.enabled === false,
      transfer: false,
      showIcon: 2,
      /** No legacy ConditionId is placed in statuses for these effects. */
      statuses: [],
      ...(this.isNative6Supported()
        ? { system: { changes: changesForWeaponEffect(instance, actor, this.globals.game.system.version) } }
        : { changes: changesForWeaponEffect(instance, actor) }),
      origin: origin || sourceOrigin(instance) || null,
      description: descriptionFor(instance),
      flags: buildWeaponEffectFlag(instance),
    };
  }

  private async updateInstance(actor: any, id: string, instance: WeaponEffectInstance, disabled: boolean): Promise<void> {
    const changes = instance.effectKind === 'slow' && !disabled
      ? changesForWeaponEffect(instance, actor, this.isNative6Supported() ? this.globals.game.system.version : undefined)
      : [];
    const update: Record<string, unknown> = {
      _id: id,
      disabled,
      [`flags.${MODULE_ID}.weaponEffect`]: instance,
      [this.isNative6Supported() ? 'system.changes' : 'changes']: changes,
    };
    // Foundry recursively merges object updates. Explicitly remove the
    // optional reservation key when a ticket is cancelled or disabled;
    // omitting it would leave the old reservation in the persisted flag.
    if (!instance.reservation) update[`flags.${MODULE_ID}.weaponEffect.-=reservation`] = null;
    await actor.updateEmbeddedDocuments?.('ActiveEffect', [update], { [MODULE_ID]: { managed: true, weaponEffect: true } });
  }

  private async recomputeSlowGroup(actor: any, stackingGroup: string): Promise<void> {
    const entries = this.list(actor).filter((entry) => entry.instance.effectKind === 'slow'
      && entry.instance.stackingGroup === stackingGroup);
    const active = entries.filter((entry) => !entry.disabled);
    const winner = active.slice().sort((left, right) => slowReduction(right.instance) - slowReduction(left.instance))[0];
    const native6 = this.isNative6Supported();
    const currentChanges = (entry: WeaponEffectEntry) => collection(native6 ? entry.effect?.system?.changes : entry.effect?.changes);
    const updates = entries
      .filter((entry) => !entry.disabled || currentChanges(entry).length > 0)
      .map((entry): Record<string, unknown> | undefined => {
        const changes = winner?.id === entry.id
          ? changesForWeaponEffect(entry.instance, actor, native6 ? this.globals.game.system.version : undefined)
          : [];
        if (sameChanges(currentChanges(entry), changes, native6)) return undefined;
        return { _id: entry.id, [native6 ? 'system.changes' : 'changes']: changes };
      })
      .filter((update): update is Record<string, unknown> => Boolean(update));
    if (updates.length) await actor.updateEmbeddedDocuments?.('ActiveEffect', updates, { [MODULE_ID]: { managed: true, weaponEffect: true } });
  }

  private requireTicketEntry(actor: any, ticket: WeaponEffectReservationTicket): WeaponEffectEntry {
    validateIdentifier(ticket?.effectId, 'ticket.effectId');
    const entry = this.list(actor).find((candidate) => candidate.id === ticket.effectId);
    if (!entry || !entry.instance.reservation) throw new Error('Weapon effect reservation is stale or already consumed.');
    const reservation = entry.instance.reservation;
    if (reservation.instanceId !== ticket.instanceId || reservation.revision !== ticket.revision
      || reservation.attackId !== ticket.attackId) throw new Error('Weapon effect reservation revision conflict.');
    return entry;
  }

  private ticket(effectIdValue: string, reservation: WeaponEffectReservation): WeaponEffectReservationTicket {
    return { effectId: effectIdValue, ...reservation };
  }

  private enqueue<T>(actor: any, operation: () => Promise<T>): Promise<T> {
    const key = actorKey(actor);
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    const tail = run.then(() => undefined, () => undefined);
    this.#queues.set(key, tail);
    void tail.finally(() => { if (this.#queues.get(key) === tail) this.#queues.delete(key); });
    return run;
  }

  private currentTurnAnchor(): WeaponEffectTurnAnchor | undefined {
    const combat = activeCombat(this.globals);
    if (!combat) return undefined;
    const current = combat.current ?? {};
    const round = Number(combat.round ?? current.round);
    const turn = Number(combat.turn ?? current.turn);
    if (!Number.isInteger(round) || !Number.isInteger(turn) || round < 0 || turn < 0) return undefined;
    const combatUuid = String(combat.uuid ?? `Combat.${combat.id ?? 'active'}`);
    return { combatUuid, round, turn };
  }

  #rememberActor(actor: any): void {
    const key = actorKey(actor);
    if (key !== 'Actor.unknown') this.#knownActors.set(key, actor);
  }

  #rememberWorldActors(): void {
    for (const actor of collection(this.globals?.game?.actors)) this.#rememberActor(actor);
    for (const scene of collection(this.globals?.game?.scenes)) {
      for (const token of collection(scene?.tokens)) this.#rememberActor(token?.actor);
    }
  }

  private requireGM(actor: any): void {
    if (!this.isSupported()) {
      throw new Error('Weapon Mastery effects require an exact reviewed Foundry/dnd5e pair: 14.364/5.3.3, 14.368/5.3.3, 14.368/6.0.5 or 14.368/6.0.6.');
    }
    if (!this.isActiveGM()) throw new Error('仅当前 active GM 可以操作武器临时效果。');
    if (!actor || actor.documentName !== 'Actor') throw new Error('请选择一个 Actor。');
  }
}

export function changesForWeaponEffect(
  instance: WeaponEffectInstance,
  actor?: any,
  systemVersion?: string,
): Array<Record<string, unknown>> {
  if (instance.effectKind !== 'slow') return [];
  // Keep the rule as a fixed ADD contribution. dnd5e's native
  // prepareMovement stage clamps after ActiveEffects, then applies exhaustion,
  // half-movement, and encumbrance; deriving from prepared values here would
  // double-count those nonlinear reductions on every reprepare.
  const params = instance.params as SlowWeaponEffectParams;
  const reduction = movementReduction(params.speedReduction, actor);
  const movementTypes = params.movementTypes?.length
    ? params.movementTypes
    : ['walk', 'burrow', 'climb', 'fly', 'swim'];
  return movementTypes.flatMap<Record<string, unknown>>((movement) => {
    if (isNative6SystemVersion(systemVersion)) return [{
      key: 'system.attributes.movement.speeds.' + movement,
      type: 'add',
      value: '-' + reduction,
    }];
    return [{
      key: `system.attributes.movement.${movement}`,
      mode: 2,
      value: `-${reduction}`,
      priority: null,
    }];
  });
}

function descriptionFor(instance: WeaponEffectInstance): string {
  if (instance.effectKind === 'sap') return 'The target has Disadvantage on its next completed attack before the source turn boundary.';
  if (instance.effectKind === 'vex') return 'The source has Advantage on its next completed attack against this target.';
  const params = instance.params as SlowWeaponEffectParams;
  return `The target's movement speeds are reduced by ${params.speedReduction} feet until the source turn boundary.`;
}

function sourceOrigin(instance: WeaponEffectInstance): string | undefined {
  return instance.source.activityUuid ?? instance.source.activityId ?? instance.source.itemUuid ?? instance.source.actorUuid;
}

function turnAnchor(context: WeaponEffectTurnContext): WeaponEffectTurnAnchor {
  const combat = context.combat ?? activeCombat(globalThis);
  const combatUuid = String(context.combatUuid ?? combat?.uuid ?? `Combat.${combat?.id ?? 'active'}`);
  const round = Number(context.round ?? combat?.round ?? combat?.current?.round ?? 0);
  const turn = Number(context.turn ?? combat?.turn ?? combat?.current?.turn ?? 0);
  return {
    combatUuid,
    round: Number.isInteger(round) && round >= 0 ? round : 0,
    turn: Number.isInteger(turn) && turn >= 0 ? turn : 0,
  };
}

function turnsElapsed(anchor: WeaponEffectTurnAnchor, current: WeaponEffectTurnAnchor, context: WeaponEffectTurnContext, referenceActorUuid: string): number {
  if (anchor.combatUuid !== current.combatUuid) return -1;
  const combat = context.combat ?? activeCombat(globalThis);
  const turns = collection(combat?.turns);
  const referenceTurn = turns.findIndex((combatant) => actorKey(combatant?.actor ?? combatant?.document?.actor)
    === referenceActorUuid || String(combatant?.actorUuid ?? '') === referenceActorUuid);
  const currentIndex = current.round * Math.max(1, turns.length) + current.turn;
  const anchorIndex = anchor.round * Math.max(1, turns.length) + anchor.turn;
  if (currentIndex <= anchorIndex) return 0;
  // Count occurrences of this Actor's turn after the captured anchor. If the
  // Actor appears later in the anchor round, that future occurrence belongs to
  // the current round; otherwise the first occurrence is next round.
  const position = referenceTurn >= 0 ? referenceTurn : current.turn;
  const roundDelta = current.round - anchor.round;
  return roundDelta + (position > anchor.turn ? 1 : 0);
}

function movementReduction(feet: number, actor?: any): number {
  const units = String(actor?.system?.attributes?.movement?.units ?? 'ft').toLowerCase();
  // dnd5e 5.3.3 uses the simplified 5ft -> 1.5m conversion (10/3 feet per
  // meter), so a 10ft Slow becomes exactly 3 in a metric Actor.
  const converted = units === 'm' ? feet * 3 / 10 : feet;
  return Math.round(converted * 1000) / 1000;
}

function slowReduction(instance: WeaponEffectInstance): number {
  return Number((instance.params as SlowWeaponEffectParams).speedReduction) || 0;
}

function sameChanges(left: Array<Record<string, unknown>>, right: Array<Record<string, unknown>>, native6 = false): boolean {
  if (left.length !== right.length) return false;
  // Native rows have generated IDs and may be DataModels. Compare their rule
  // fields so a stable Slow group does not rewrite IDs on every source turn.
  if (native6) return left.every((entry: any, index) => {
    const source = entry.toObject?.() ?? entry;
    const desired = right[index];
    return source.key === desired?.key && source.type === desired?.type && source.value === desired?.value;
  });
  return left.every((entry, index) => JSON.stringify(entry) === JSON.stringify(right[index]));
}

function activeCombat(globals: any): any {
  return globals?.game?.combat ?? globals?.game?.combats?.active
    ?? collection(globals?.game?.combats).find((combat) => combat?.active === true);
}

function collection(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value?.values === 'function') return [...value.values()];
  return value?.contents ?? [];
}

function effectId(effect: any): string { return String(effect?.id ?? effect?._id ?? ''); }
function actorKey(actor: any): string { return String(actor?.uuid ?? `Actor.${actor?.id ?? 'unknown'}`); }
function inactive(effect: any): boolean { return effect?.disabled === true || effect?.isSuppressed === true || effect?.active === false; }

function validateAttackId(value: unknown): asserts value is string { validateIdentifier(value, 'attackId'); }

function validateOwnerRelationship(actor: any, instance: WeaponEffectInstance): void {
  const owner = actorKey(actor);
  if ((instance.effectKind === 'sap' || instance.effectKind === 'slow') && instance.target.actorUuid !== owner) {
    throw new Error(`${instance.effectKind} must be stored on its target Actor.`);
  }
  if (instance.effectKind === 'vex' && instance.source.actorUuid !== owner) {
    throw new Error('Vex must be stored on its source Actor.');
  }
}

function validateIdentifier(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\u0000-\u001f\u007f\s]/.test(value)) {
    throw new TypeError(`Invalid ${field}.`);
  }
}

function isActiveGMFrom(globals: any): boolean {
  const user = globals?.game?.user;
  const active = globals?.game?.users?.activeGM;
  return user?.isGM === true && user?.active !== false && Boolean(active) && (active === user || active?.id === user?.id);
}
