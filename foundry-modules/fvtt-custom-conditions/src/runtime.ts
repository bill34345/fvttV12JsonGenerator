import { genericConditionsSupported, isNative6SystemVersion } from './runtime-compatibility.ts';
import {
  CONDITION_DEFINITIONS,
  buildConditionFlag,
  compareConditionFormulaStrength,
  createConditionInstance,
  getConditionDefinition,
  parseConditionInstance,
  projectedConditionStatusId,
  readConditionInstance,
  type ConditionId,
  type ConditionInstance,
  type ConditionParams,
  type ConditionStacking,
} from '@fvtt-json-generator/contracts/conditions';
import { conditionFlagPath, MODULE_ID, TRIGGER_ENGINE_MODULE_ID } from './constants.ts';
import { WeaponEffectRuntime } from './weapon-effects.ts';
import { InjuryRuntime, injurySupported } from './injury.ts';
import { markConditionStatusOwned, registerConditionActionInterceptor, registerConditionHudHook } from './hud.ts';
import {
  conditionIconPath,
  conditionNameOverride,
  displayConditionDescription,
  displayConditionName,
  localizedConditionDefinition,
  localizedConditionStatusLabel,
} from './localization.ts';

export interface ConditionEntry {
  id: string;
  name: string;
  description: string;
  origin: string;
  disabled: boolean;
  instance: ConditionInstance;
  effect: any;
}

interface TurnState {
  combatKey: string;
  // Persisted field name retained for existing turns; counts weapon and unarmed attacks.
  weaponAttacks: number;
  actionUsed: boolean;
  bonusActionUsed: boolean;
  movementUsed: boolean;
}

interface PendingAttackChoice {
  combatKey: string;
  category: 'action' | 'bonus';
}

export interface ConditionApplyOptions {
  name?: string;
  origin?: string;
  source?: string;
  stacking?: ConditionStacking;
}

export interface TriggerEventContextLike {
  event?: { type?: string; documentType?: string };
  document?: any;
  documentUuid?: string;
  changes?: unknown;
  before?: unknown;
  after?: unknown;
  userId?: string;
  timestamp?: number;
  capturedModifiedTime?: number;
  preparedHp?: { before: { value: number; max: number }; after: { value: number; max: number } };
  combat?: any;
  combatUuid?: string;
  combatant?: any;
  token?: any;
  round?: number;
  turn?: number;
  key?: string;
  phase?: 'start' | 'end';
}

function genericSupported(globals: any): boolean {
  return genericConditionsSupported(globals.game);
}

export class ConditionRuntime {
  readonly globals: any;
  readonly isActiveGM: () => boolean;
  readonly weaponEffects: WeaponEffectRuntime;
  readonly injury: InjuryRuntime;
  #queues = new Map<string, Promise<unknown>>();
  #processed = new Set<string>();
  #unsubscribe: (() => void) | undefined;
  #triggerReadyHook: unknown;
  #rollHooks: Array<[string, unknown]> = [];
  #turnStates = new Map<string, TurnState>();
  #pendingAttackChoices = new Map<string, PendingAttackChoice>();
  #pendingAttackTurnKeys = new WeakMap<object, string | undefined>();
  #configuredAttackTurnKeys = new WeakMap<object, string | undefined>();
  #pendingEscapeActors = new Set<string>();
  #pendingFrozenDamage = new WeakMap<object, Map<string, number>>();
  #targetStatusEntries: Array<{ table: Record<string, any>; id: string; entry: any }> = [];
  #started = false;

  constructor(globals: any = globalThis, isActiveGM: () => boolean = () => isActiveGMFrom(globals)) {
    this.globals = globals;
    this.isActiveGM = isActiveGM;
    this.weaponEffects = new WeaponEffectRuntime(globals, isActiveGM);
    this.injury = new InjuryRuntime(globals, isActiveGM);
    this.#triggerReadyHook = undefined;
  }

  get started(): boolean { return this.#started; }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    if (this.globals.game?.version !== undefined && !genericSupported(this.globals)
      && !injurySupported(this.globals)) return;
    this.injury.start();
    if (!genericSupported(this.globals)) {
      const hooks = this.globals.Hooks;
      if (typeof hooks?.on === 'function') this.#triggerReadyHook = hooks.on('fvtt-trigger-engine.ready', () => this.connectTriggerEngine());
      this.connectTriggerEngine();
      return;
    }
    registerConditionMappings(this.globals);
    this.ensureOptionalTargetStatusRule();
    const hooks = this.globals.Hooks;
    if (typeof hooks?.on === 'function') {
      this.#triggerReadyHook = hooks.on('fvtt-trigger-engine.ready', () => this.connectTriggerEngine());
      this.#rollHooks.push(['tokenActionHudCorePreRender', registerConditionHudHook(this.globals)]);
      this.#rollHooks.push(['ac5e.statusEffectsReady', hooks.on('ac5e.statusEffectsReady', () => this.ensureOptionalTargetStatusRule())]);
      this.#rollHooks.push(['dnd5e.preRollAttack', hooks.on('dnd5e.preRollAttack', (config: any) => this.applyRollModifiers(config, 'attack'))]);
      this.#rollHooks.push(['dnd5e.preRollSavingThrow', hooks.on('dnd5e.preRollSavingThrow', (config: any) => this.applyRollModifiers(config, 'save'))]);
      this.#rollHooks.push(['dnd5e.preRollAbilityCheck', hooks.on('dnd5e.preRollAbilityCheck', (config: any) => this.applyRollModifiers(config, 'check'))]);
      this.#rollHooks.push(['dnd5e.postDamageRollConfiguration', hooks.on('dnd5e.postDamageRollConfiguration', (rolls: any[], config: any) => this.applyDamageModifiers(rolls, config))]);
      this.#rollHooks.push(['dnd5e.preUseActivity', hooks.on('dnd5e.preUseActivity', (activity: any, usage: any) => this.preUseActivity(activity, usage))]);
      this.#rollHooks.push(['dnd5e.postUseActivity', hooks.on('dnd5e.postUseActivity', (activity: any, usage: any) => this.postUseActivity(activity, usage))]);
      this.#rollHooks.push(['dnd5e.postAttackRollConfiguration', hooks.on('dnd5e.postAttackRollConfiguration', (rolls: any[], config: any) => this.captureAttackTurn(rolls, config))]);
      this.#rollHooks.push(['dnd5e.rollAttack', hooks.on('dnd5e.rollAttack', (rolls: any[], config: any) => this.trackAttackRoll(rolls, config))]);
      this.#rollHooks.push(['dnd5e.calculateDamage', hooks.on('dnd5e.calculateDamage', (actor: any, damages: any[], options: any) => this.captureFrozenDamage(actor, damages, options))]);
      this.#rollHooks.push(['dnd5e.applyDamage', hooks.on('dnd5e.applyDamage', (actor: any, amount: number, options: any) => {
        void this.handleAppliedDamage(actor, amount, options).catch((error) => this.report(error));
      })]);
      this.#rollHooks.push(['preMoveToken', hooks.on('preMoveToken', (token: any, move: any, options: any) => this.preMoveToken(token, move, options))]);
      this.#rollHooks.push(['moveToken', hooks.on('moveToken', (token: any, movement: any, _operation: any, user: any) => this.postMoveToken(token, movement, user))]);
      this.#rollHooks.push(['preUpdateItem', hooks.on('preUpdateItem', (item: any, changed: any, options: any) => this.preUpdateItem(item, changed, options))]);
      this.#rollHooks.push(['preCreateItem', hooks.on('preCreateItem', (item: any, _data: any, options: any) => this.preCreateItem(item, options))]);
      this.#rollHooks.push(['createItem', hooks.on('createItem', (item: any, _options: any, userId: string) => this.postCreateItem(item, userId))]);
      this.#rollHooks.push(['updateItem', hooks.on('updateItem', (item: any, changed: any, options: any, userId: string) => this.postUpdateItem(item, changed, options, userId))]);
      this.#rollHooks.push(['preCreateChatMessage', hooks.on('preCreateChatMessage', (message: any, data: any) => this.prepareHelplessCriticalMessage(message, data))]);
      this.#rollHooks.push(['updateActor', hooks.on('updateActor', (actor: any, changed: any) => this.syncSharedTurnState(actor, changed))]);
      this.#rollHooks.push(['fvtt-trigger-engine.combatRewound', hooks.on('fvtt-trigger-engine.combatRewound', ({ combatUuid, combat }: any) => {
        for (const key of this.#processed) if (key.startsWith(`${combatUuid}:`)) this.#processed.delete(key);
        for (const combatant of collection(combat.combatants)) {
          const actor = combatant.actor;
          if (!actor) continue;
          const key = actorKey(actor), state = readActorTurnState(actor);
          this.#turnStates.delete(key); this.#pendingAttackChoices.delete(key);
          if (state) this.#turnStates.set(key, state);
        }
      })]);
    }
    // The Trigger Engine's ready listener is asynchronous. Custom Conditions
    // may reach Foundry's ready hook first, so bind our retry listener and all
    // dnd5e hooks before attempting the initial subscription.
    this.connectTriggerEngine();
    void this.normalizeLegacyMovementChanges().catch((error) => this.report(error));
  }

  async whenIdle(): Promise<void> {
    if (!this.isActiveGM()) throw new Error('Only the active GM can await condition processing.');
    while (true) {
      await Promise.all([...this.#queues.values(), ...this.injury.queues.values(), this.weaponEffects.whenIdle()]);
      if (!this.#queues.size && !this.injury.queues.size) return;
    }
  }

  stop(): void {
    for (const { table, id, entry } of this.#targetStatusEntries) {
      if (table[id] === entry) delete table[id];
    }
    this.#targetStatusEntries = [];
    this.injury.stop();
    this.weaponEffects.stop?.();
    if (this.#unsubscribe) this.#unsubscribe();
    this.#unsubscribe = undefined;
    for (const [name, id] of this.#rollHooks) this.globals.Hooks?.off?.(name, id);
    this.#rollHooks = [];
    if (this.#triggerReadyHook !== undefined) this.globals.Hooks?.off?.('fvtt-trigger-engine.ready', this.#triggerReadyHook);
    this.#triggerReadyHook = undefined;
    this.#queues.clear();
    this.#processed.clear();
    this.#turnStates.clear();
    this.#pendingAttackChoices.clear();
    this.#pendingAttackTurnKeys = new WeakMap<object, string | undefined>();
    this.#configuredAttackTurnKeys = new WeakMap<object, string | undefined>();
    this.#pendingEscapeActors.clear();
    this.#pendingFrozenDamage = new WeakMap<object, Map<string, number>>();
    this.#started = false;
  }

  definitions() { return !genericSupported(this.globals) ? []
    : Object.values(CONDITION_DEFINITIONS).map((definition) => localizedConditionDefinition(definition, this.globals)); }

  list(actor: any): ConditionEntry[] {
    if (!genericSupported(this.globals)) return [];
    return collection(actor?.effects).flatMap((effect) => {
      const instance = readConditionInstance(effect);
      if (!instance || instance.template === true) return [];
      return [{
        id: effectId(effect),
        name: displayConditionName(effect, instance, this.globals),
        description: displayConditionDescription(effect, instance, this.globals),
        origin: String(effect.origin ?? instance.origin ?? ''),
        disabled: inactive(effect) || instance.enabled === false,
        instance,
        effect,
      }];
    });
  }

  async apply(actor: any, conditionId: ConditionId, params: ConditionParams, options: ConditionApplyOptions = {}): Promise<any> {
    this.requireGM(actor);
    this.ensureOptionalTargetStatusRule();
    const definition = getConditionDefinition(conditionId);
    if (!definition) throw new Error(`Unknown custom condition: ${conditionId}`);
    const instance = createConditionInstance(conditionId, params, {
      source: options.source,
      origin: options.origin,
    });
    const stacking = readStacking(instance, options.stacking ?? definition.defaultStacking);
    return this.enqueue(actor, async () => {
      this.requireGM(actor);
      if (conditionId === 'bleeding' || conditionId === 'burning') {
        return this.applyHighestCondition(actor, instance, options.name);
      }
      const origin = options.origin ?? '';
      const existing = this.list(actor).filter((entry) => entry.instance.conditionId === conditionId
        && entry.origin === origin && !entry.disabled && !entry.effect?.flags?.[MODULE_ID]?.configuredComponent);
      if (existing.length && stacking === 'unspecified') {
        throw new Error('该来源没有说明重复施加规则，请在 Condition 面板中选择叠加、替换或忽略。');
      }
      if (existing.length && stacking === 'ignore') return existing[0]!.effect;
      const createdInstance = { ...instance, origin: origin || undefined };
      const created = await actor.createEmbeddedDocuments?.('ActiveEffect', [this.effectData(createdInstance, options.name)], {
        [MODULE_ID]: { managed: true },
      });
      if (created?.length && stacking === 'replace' && existing.length) {
        await actor.deleteEmbeddedDocuments?.('ActiveEffect', existing.map((entry) => entry.id));
      }
      if (created?.length && conditionId === 'shocked') await unequipActorItems(actor);
      return created?.[0];
    });
  }

  private async applyHighestCondition(actor: any, incoming: ConditionInstance, name?: string, preferredId?: string): Promise<any> {
    const all = this.list(actor).filter((entry) => entry.instance.conditionId === incoming.conditionId
      && !entry.effect?.flags?.[MODULE_ID]?.configuredComponent);
    const preferred = all.find((entry) => entry.id === preferredId);
    const active = all.filter((entry) => !entry.disabled && entry.id !== preferredId);

    const formula = String(incoming.params.formula ?? '');
    let winner: ConditionEntry | undefined;
    let shouldUpdate = false;
    if (active.length) {
      winner = active[0]!;
      for (const candidate of active.slice(1)) {
        const comparison = compareConditionFormulaStrength(
          String(candidate.instance.params.formula ?? ''),
          String(winner.instance.params.formula ?? ''),
        );
        if (comparison === undefined) {
          throw new Error(`现有 ${incoming.conditionId} 状态的骰式无法比较。请在状态面板中先整理为可比较的骰式；当前状态已保留。`);
        }
        if (comparison > 0) winner = candidate;
      }
    }

    let targetId: string | undefined;
    if (winner) {
      const comparison = compareConditionFormulaStrength(formula, String(winner.instance.params.formula ?? ''));
      if (comparison === undefined) {
        throw new Error(`新 ${incoming.conditionId} 状态的骰式无法与当前效果比较。请改用可比较的骰式；当前状态已保留。`);
      }
      shouldUpdate = comparison > 0;
      targetId = comparison > 0 ? (preferred?.id ?? winner.id) : winner.id;
    } else if (preferred) {
      targetId = preferred.id;
      shouldUpdate = true;
    }

    if (!targetId) {
      const created = await actor.createEmbeddedDocuments?.('ActiveEffect', [this.effectData(incoming, name)], {
        [MODULE_ID]: { managed: true },
      });
      if (!created?.length) return undefined;
      if (all.length) await actor.deleteEmbeddedDocuments?.('ActiveEffect', all.map((entry) => entry.id));
      return created[0];
    }

    if (shouldUpdate) {
      const target = all.find((entry) => entry.id === targetId);
      const replacement = this.effectData(
        incoming,
        name ?? conditionNameOverride(target?.effect ?? winner?.effect, incoming.conditionId, this.globals),
      );
      replacement.disabled = incoming.enabled === false;
      await actor.updateEmbeddedDocuments?.('ActiveEffect', [{ _id: targetId, ...replacement }]);
    }
    const result = this.list(actor).find((entry) => entry.id === targetId)?.effect
      ?? all.find((entry) => entry.id === targetId)?.effect;
    const remove = all.filter((entry) => entry.id !== targetId).map((entry) => entry.id);
    if (remove.length) await actor.deleteEmbeddedDocuments?.('ActiveEffect', remove);
    return result;
  }

  async update(actor: any, id: string, conditionId: ConditionId, params: ConditionParams): Promise<void> {
    this.requireGM(actor);
    const current = this.list(actor).find((entry) => entry.id === id);
    if (!current) throw new Error('Condition 已移除或无效。');
    if (current.effect?.flags?.[MODULE_ID]?.configuredComponent) throw new Error('请通过组合状态管理器操作此来源。');
    const next = createConditionInstance(conditionId, params, {
      instanceId: current.instance.instanceId,
      enabled: !current.disabled,
      origin: current.origin || undefined,
      source: current.instance.source,
      createdAt: current.instance.createdAt,
    });
    await this.enqueue(actor, async () => {
      this.requireGM(actor);
      if ((conditionId === 'bleeding' || conditionId === 'burning') && current.instance.conditionId === conditionId) {
        if (current.disabled) {
          const replacement = this.effectData(next, conditionNameOverride(current.effect, conditionId, this.globals));
          replacement.disabled = true;
          await actor.updateEmbeddedDocuments?.('ActiveEffect', [{
            _id: id,
            ...replacement,
          }]);
        } else await this.applyHighestCondition(actor, next, conditionNameOverride(current.effect, conditionId, this.globals), id);
        return;
      }
      if ((conditionId === 'bleeding' || conditionId === 'burning') && !current.disabled) {
        await this.applyHighestCondition(actor, next, conditionNameOverride(current.effect, conditionId, this.globals));
        await actor.deleteEmbeddedDocuments?.('ActiveEffect', [id]);
        return;
      }
      await actor.updateEmbeddedDocuments?.('ActiveEffect', [{
        _id: id,
        ...this.effectData(next, conditionNameOverride(current.effect, current.instance.conditionId, this.globals)),
      }]);
    });
  }

  async remove(actor: any, id: string): Promise<void> {
    this.requireGM(actor);
    await this.enqueue(actor, async () => {
      this.requireGM(actor);
      const entry = this.list(actor).find((candidate) => candidate.id === id);
      if (entry) await actor.deleteEmbeddedDocuments?.('ActiveEffect', configuredRemovalIds(actor, entry));
    });
  }

  async setEnabled(actor: any, id: string, enabled: boolean): Promise<void> {
    this.requireGM(actor);
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean');
    const entry = this.list(actor).find((candidate) => candidate.id === id);
    if (!entry) throw new Error('Condition 已移除或无效。');
    if (entry.effect?.flags?.[MODULE_ID]?.configuredComponent) throw new Error('请通过组合状态管理器操作此来源。');
    await this.enqueue(actor, async () => {
      if (enabled && (entry.instance.conditionId === 'bleeding' || entry.instance.conditionId === 'burning')) {
        const instance = createConditionInstance(entry.instance.conditionId, entry.instance.params, {
          instanceId: entry.instance.instanceId,
          enabled: true,
          origin: entry.instance.origin,
          source: entry.instance.source,
          createdAt: entry.instance.createdAt,
        });
        await this.applyHighestCondition(actor, instance, conditionNameOverride(entry.effect, entry.instance.conditionId, this.globals), entry.id);
        return;
      }
      await actor.updateEmbeddedDocuments?.('ActiveEffect', [{
        _id: id,
        disabled: !enabled,
        [`flags.${MODULE_ID}.condition.enabled`]: enabled,
      }]);
    });
  }

  async applyFromItem(item: any, actors: any[], effectIdValue?: string, overrides: ConditionParams = {}): Promise<void> {
    const templates = collection(item?.effects).filter((effect) => {
      const instance = readConditionInstance(effect);
      return instance?.template === true && (!effectIdValue || effectId(effect) === effectIdValue);
    });
    if (templates.length !== 1) throw new Error('请选择一个带自定义 Condition 模板的物品效果。');
    const template = templates[0]!;
    const source = readConditionInstance(template)!;
    const params = { ...source.params, ...overrides };
    const unique = new Map(actors.map((actor) => [actorKey(actor), actor]));
    if (!unique.size) throw new Error('请选择 Condition 目标。');
    for (const actor of unique.values()) {
      await this.apply(actor, source.conditionId, params, {
        name: String(template.name ?? item?.name ?? source.conditionId),
        origin: String(template.uuid ?? `${item?.uuid}.ActiveEffect.${effectId(template)}`),
        source: String(item?.uuid ?? ''),
      });
    }
  }

  async escapeFrozen(actor: any, effectIdValue: string, rollerActor: any = actor): Promise<{
    attempted: boolean; success: boolean; total?: number; dc: number; conditionRemoved: boolean;
  }> {
    this.requireGM(actor);
    if (!rollerActor || rollerActor.documentName !== 'Actor') throw new Error('请选择进行 Athletics 检定的 Actor。');
    const entry = this.list(actor).find((candidate) => candidate.id === effectIdValue
      && candidate.instance.conditionId === 'frozen' && !candidate.disabled);
    if (!entry) throw new Error('Frozen 状态已移除、停用或无效。');
    const dc = Number(entry.instance.params.escapeDC);
    if (!Number.isFinite(dc)) throw new Error('Frozen 状态缺少有效的逃脱 DC。');
    const state = this.currentTurnState(rollerActor);
    const pendingChoice = this.currentPendingAttackChoice(rollerActor);
    const rollerEntries = this.list(rollerActor).filter((candidate) => !candidate.disabled);
    if (state?.actionUsed || ((state?.movementUsed || state?.bonusActionUsed || pendingChoice)
      && hasCondition(rollerEntries, 'dazed'))) {
      throw new Error(pendingChoice
        ? '该 Actor 本回合已无法执行 Action：攻击仍在结算；若掷骰异常失败，下回合自动重置。'
        : '该 Actor 本回合已无法执行 Action。');
    }
    const currentCombat = activeCombat(this.globals);
    if (combatHasActiveTurn(currentCombat) && !state) throw new Error('战斗中只能由当前回合的 Actor 尝试逃脱。');
    const pendingKey = actorKey(rollerActor);
    if (this.#pendingEscapeActors.has(pendingKey)) throw new Error('该逃脱检定正在进行，请等待结果。');
    if (typeof rollerActor.rollSkill !== 'function') throw new Error('dnd5e Actor.rollSkill 不可用。');
    this.#pendingEscapeActors.add(pendingKey);
    try {
      const rolls = await rollerActor.rollSkill({ skill: 'ath', ability: 'str', target: dc });
      const roll = collection(rolls)[0];
      if (!roll) return { attempted: false, success: false, dc, conditionRemoved: false };
      const afterRollState = this.currentTurnState(rollerActor);
      const afterPendingChoice = this.currentPendingAttackChoice(rollerActor);
      const afterCombat = activeCombat(this.globals);
      const nowDazed = hasCondition(this.list(rollerActor).filter((candidate) => !candidate.disabled), 'dazed');
      if ((state && (afterRollState?.combatKey !== state.combatKey || afterRollState.actionUsed
        || ((afterRollState.movementUsed || afterRollState.bonusActionUsed || afterPendingChoice) && nowDazed)))
        || (!state && combatHasActiveTurn(afterCombat))) {
        throw new Error('检定完成时回合状态已变化，Frozen 未解除；请 GM 核对检定结果。');
      }
      if (state) await this.markActionUsed(rollerActor);
      const total = Number(roll.total);
      const success = Number.isFinite(total) && total >= dc;
      const stillSameEffect = this.list(actor).some((candidate) => candidate.id === effectIdValue
        && candidate.instance.instanceId === entry.instance.instanceId
        && Number(candidate.instance.params.escapeDC) === dc && !candidate.disabled);
      if (success && stillSameEffect) await this.remove(actor, effectIdValue);
      return { attempted: true, success, total, dc, conditionRemoved: success && stillSameEffect };
    } finally {
      this.#pendingEscapeActors.delete(pendingKey);
    }
  }

  async handleTriggerEvent(context: TriggerEventContextLike): Promise<void> {
    if (!this.isActiveGM() || context.event?.documentType !== 'Actor') return;
    const actor = context.document;
    if (!actor || actor.documentName !== 'Actor') return;
    try { await this.injury.handleEvent(context); }
    catch (error) { this.report(error); }
    if (!genericSupported(this.globals)) return;
    await this.weaponEffects.handleTriggerEvent(context);
    if (context.event.type === 'documentUpdate') {
      await this.handleHealing(actor, context);
      return;
    }
    if (context.event.type !== 'combatTurnStart' && context.event.type !== 'combatTurnEnd') return;
    const turnStateKey = actorKey(actor);
    this.#pendingAttackChoices.delete(turnStateKey);
    const combatKey = `${context.combatUuid ?? context.combat?.uuid ?? 'combat'}:${context.round ?? 0}:${context.turn ?? 0}`;
    if (context.event.type === 'combatTurnStart') {
      await this.persistTurnState(actor, { combatKey, weaponAttacks: 0, actionUsed: false, bonusActionUsed: false, movementUsed: false }, combatKey);
    } else {
      await this.clearTurnState(actor, combatKey);
    }
    const blockedHighest = new Set<ConditionId>();
    for (const conditionId of ['bleeding', 'burning'] as const) {
      try { await this.normalizeHighestExisting(actor, conditionId); }
      catch (error) { blockedHighest.add(conditionId); this.report(error); }
    }
    const entries = this.list(actor).filter((entry) => !entry.disabled && !blockedHighest.has(entry.instance.conditionId))
      .filter((entry) => !['bleeding', 'burning'].includes(entry.instance.conditionId)
        || this.highestEntryId(actor, entry.instance.conditionId as 'bleeding' | 'burning') === entry.id);
    const timed = entries.filter((entry) => {
      const timing = entry.instance.params.timing;
      return (context.event?.type === 'combatTurnStart' && timing === 'turnStart')
        || (context.event?.type === 'combatTurnEnd' && timing === 'turnEnd');
    });
    for (const entry of timed) await this.enqueue(actor, () => this.settleTimedCondition(actor, entry, context));
  }

  private async settleTimedCondition(actor: any, entry: ConditionEntry, context: TriggerEventContextLike): Promise<void> {
    const combatKey = `${context.combatUuid ?? context.combat?.uuid ?? 'combat'}:${context.key ?? context.round ?? 0}:${entry.instance.instanceId}`;
    if (this.#processed.has(combatKey) || readCheckpoint(actor, combatKey)) return;
    this.#processed.add(combatKey);
    await writeCheckpoint(actor, combatKey, 'pending');
    try {
      const formula = entry.instance.params.formula;
      if (typeof formula !== 'string') throw new Error(`Condition ${entry.instance.conditionId} lacks a formula.`);
      const roll = await evaluateFormula(this.globals, formula, actor);
      if (entry.instance.conditionId === 'bleeding') {
        if (entry.instance.params.mode === 'hpLoss') await loseHitPoints(actor, roll);
        else await applyDamage(actor, roll, String(entry.instance.params.damageType ?? ''));
      } else if (entry.instance.conditionId === 'burning') {
        await applyDamage(actor, roll, String(entry.instance.params.damageType ?? ''));
      }
      await postRollMessage(this.globals, actor, entry, roll, context);
      await writeCheckpoint(actor, combatKey, 'complete');
    } catch (error) {
      await writeCheckpoint(actor, combatKey, 'failed');
      this.report(error);
    }
  }

  private async handleHealing(actor: any, context: TriggerEventContextLike): Promise<void> {
    const before = readHP(context.before);
    const after = readHP(context.after);
    if (before === undefined || after === undefined || after <= before) return;
    const matching = this.list(actor).filter((entry) => entry.instance.params.endOnHealing === true);
    const groupIds = new Set(matching.map((entry) => entry.effect?.flags?.[MODULE_ID]?.configuredComponent?.instanceId)
      .filter((id): id is string => typeof id === 'string'));
    const ids = collection(actor?.effects).filter((effect) => groupIds.has(effect?.flags?.[MODULE_ID]?.configuredRoot?.instanceId)
      || groupIds.has(effect?.flags?.[MODULE_ID]?.configuredComponent?.instanceId)).map(effectId);
    ids.push(...matching.filter((entry) => !entry.effect?.flags?.[MODULE_ID]?.configuredComponent).map((entry) => entry.id));
    if (ids.length) await actor.deleteEmbeddedDocuments?.('ActiveEffect', ids);
  }

  private connectTriggerEngine(): void {
    if (this.#unsubscribe) return;
    const module = this.globals.game?.modules?.get?.(TRIGGER_ENGINE_MODULE_ID);
    const api = module?.api;
    if (module?.active !== true || api?.apiVersion !== 1 || typeof api.subscribe !== 'function') return;
    try {
      this.#unsubscribe = api.subscribe((context: TriggerEventContextLike) => this.handleTriggerEvent(context));
    } catch (error) {
      // The Trigger Engine exposes its API during init, then finishes its
      // runtime asynchronously on ready. Its module-owned ready event retries
      // this subscription once the controller is actually available.
      if (String(error).includes('FVTT Trigger Engine is not ready')) return;
      throw error;
    }
  }

  private effectData(instance: ConditionInstance, name?: string): Record<string, unknown> {
    const definition = getConditionDefinition(instance.conditionId)!;
    const localized = localizedConditionDefinition(definition, this.globals);
    return {
      name: name || localized.label,
      type: 'base',
      img: conditionIconPath(instance.conditionId),
      disabled: instance.enabled === false,
      transfer: false,
      showIcon: 2,
      statuses: [
        projectedConditionStatusId(instance.conditionId),
        ...(definition.composite ?? []).map((conditionId) => projectedConditionStatusId(conditionId)),
        ...nativeMovementPropertyStatuses(instance.conditionId, definition.composite, this.globals.game?.system?.version),
      ],
      changes: changesFor(instance, this.globals.game?.system?.version),
      origin: instance.origin || null,
      description: typeof instance.params.endCondition === 'string' && instance.params.endCondition
        ? instance.params.endCondition
        : localized.description,
      flags: buildConditionFlag(instance),
    };
  }

  /** Build an owned component from the same fixed rules used by ordinary conditions. */
  configuredComponentData(conditionId: ConditionId, params: ConditionParams, instanceId: string, name: string, origin?: string, source?: string): Record<string, unknown> {
    const instance = createConditionInstance(conditionId, params, { instanceId, origin, source });
    return this.effectData(instance, name);
  }

  async configuredComponentsCreated(actor: any, components: readonly ConditionId[]): Promise<void> {
    if (!components.includes('shocked')) return;
    const equipped = collection(actor?.items).filter((item) => item?.system?.equipped === true && isHeldItem(item));
    try { await unequipActorItems(actor); }
    catch (error) {
      const ids = new Set(equipped.map((item) => item.id ?? item._id));
      const restore = collection(actor?.items).filter((item) => ids.has(item.id ?? item._id) && item?.system?.equipped === false)
        .map((item) => ({ _id: item.id ?? item._id, 'system.equipped': true }));
      if (restore.length) {
        try { await actor.updateEmbeddedDocuments?.('Item', restore, { [MODULE_ID]: { internal: true } }); }
        catch (restoreError) { throw new AggregateError([error, restoreError], 'Shocked 装备写入失败，自动恢复也失败；请 GM 核对装备状态。'); }
      }
      throw error;
    }
  }

  private ensureOptionalTargetStatusRule(): void {
    // Both reviewed AC5e builds expose a mutable public status table. Its mode
    // builder ignores unknown statuses, so a bare preRollAttack boolean cannot
    // compose with AC5e's own advantage sources in the 5.3.3 fast-forward path.
    const game = this.globals.game;
    const optional = game?.modules?.get?.('automated-conditions-5e');
    const next = game?.version === '14.368' && isNative6SystemVersion(game?.system?.version) && optional?.version === '14.603.2';
    const mirror = game?.version === '14.368' && game?.system?.version === '5.3.3' && optional?.version === '14.533.8';
    if ((!next && !mirror) || optional?.active !== true) return;
    const table = this.globals.ac5e?.statusEffectsTables;
    if (!table || typeof table !== 'object' || Array.isArray(table)
      || !Object.isExtensible(table)) return;
    const register = (conditionId: ConditionId, rules: Record<string, unknown>, name?: string) => {
      const id = projectedConditionStatusId(conditionId);
      if (Object.hasOwn(table, id)) return;
      const entry = { _id: id, name: name ?? localizedConditionDefinition(CONDITION_DEFINITIONS[conditionId], this.globals).label, rules };
      table[id] = entry;
      this.#targetStatusEntries.push({ table, id, entry });
    };
    if (mirror) {
      for (const [conditionId, ability] of [['enfeebled', 'str'], ['clumsy', 'dex']] as const) {
        register(conditionId, { attack: { subject: (context: any) => {
          if (!this.#started || context?.ability !== ability) return '';
          const entries = this.list(context?.subject).filter((condition) => !condition.disabled);
          return hasCondition(entries, conditionId) ? 'disadvantage' : '';
        } } });
      }
    }
    if (next) register('defenseless', { attack: { opponent: (context: any) => {
      if (!this.#started) return '';
      const entries = this.list(context?.opponent).filter((condition) => !condition.disabled);
      return hasCondition(entries, 'defenseless') || hasCondition(entries, 'frozen') || hasCondition(entries, 'shocked')
        ? 'advantage' : '';
    } } }, this.globals.CONFIG?.statusEffects?.find?.((status: any) => status.id === projectedConditionStatusId('defenseless'))?.name ?? 'Defenseless');
  }

  private requireGM(actor: any): void {
    if (!genericSupported(this.globals)) throw new Error('Custom Conditions are unsupported on this exact Core/dnd5e runtime.');
    if (!this.isActiveGM()) throw new Error('仅当前 active GM 可以操作自定义 Condition。');
    if (!actor || actor.documentName !== 'Actor') throw new Error('请选择一个 Actor。');
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

  private currentTurnState(actor: any): TurnState | undefined {
    const combatKey = currentCombatTurnKey(this.globals, actor);
    if (!combatKey) return undefined;
    const key = actorKey(actor);
    const local = this.#turnStates.get(key);
    const persisted = readActorTurnState(actor);
    const state = local?.combatKey === combatKey && persisted?.combatKey === combatKey
      ? mergeTurnState(local, persisted)
      : local?.combatKey === combatKey ? local
        : persisted?.combatKey === combatKey ? persisted : undefined;
    if (!state || state.combatKey !== combatKey) return undefined;
    this.#turnStates.set(key, state);
    return state;
  }

  private currentPendingAttackChoice(actor: any): PendingAttackChoice | undefined {
    const key = actorKey(actor);
    const pending = this.#pendingAttackChoices.get(key);
    if (!pending) return undefined;
    if (this.currentTurnState(actor)?.combatKey === pending.combatKey) return pending;
    this.#pendingAttackChoices.delete(key);
    return undefined;
  }

  private syncSharedTurnState(actor: any, changed: any): void {
    if (!actor || !turnStateWasUpdated(changed)) return;
    const key = actorKey(actor);
    const incoming = readActorTurnState(actor);
    if (!incoming) {
      const local = this.#turnStates.get(key);
      if (!local || !localTurnKeyIsCurrent(this.globals, actor, local.combatKey)) this.#turnStates.delete(key);
      return;
    }
    const local = this.#turnStates.get(key);
    const state = local?.combatKey === incoming.combatKey ? mergeTurnState(local, incoming) : incoming;
    this.#turnStates.set(key, state);
    if ((state.actionUsed !== incoming.actionUsed || state.bonusActionUsed !== incoming.bonusActionUsed || state.movementUsed !== incoming.movementUsed
      || state.weaponAttacks !== incoming.weaponAttacks) && (this.isActiveGM() || actor.isOwner === true)) {
      void this.persistTurnState(actor, state, state.combatKey).catch((error) => this.report(error));
    }
  }

  private replaceLocalTurnState(actor: any, state: TurnState, persist: boolean): void {
    this.#turnStates.set(actorKey(actor), state);
    if (persist) void this.persistTurnState(actor, state, state.combatKey).catch((error) => this.report(error));
  }

  private async persistTurnState(actor: any, state: TurnState | null, expectedCombatKey: string): Promise<void> {
    const key = actorKey(actor);
    if (state) this.#turnStates.set(key, state);
    else if (this.#turnStates.get(key)?.combatKey === expectedCombatKey) this.#turnStates.delete(key);
    if (!this.isActiveGM() && actor?.isOwner !== true) return;
    await this.enqueue(actor, async () => {
      if (state) {
        const latest = this.#turnStates.get(key);
        if (!latest || latest.combatKey !== expectedCombatKey) return;
        await actor.update?.({ [`flags.${MODULE_ID}.turnState`]: latest }, { [MODULE_ID]: { internal: true } });
        return;
      }
      if (this.#turnStates.has(key)) return;
      if (readActorTurnState(actor)?.combatKey !== expectedCombatKey) return;
      await actor.update?.({ [`flags.${MODULE_ID}.turnState`]: null }, { [MODULE_ID]: { internal: true } });
    });
  }

  private clearTurnState(actor: any, combatKey: string): Promise<void> {
    return this.persistTurnState(actor, null, combatKey);
  }

  private markActionUsed(actor: any): Promise<void> {
    const state = this.currentTurnState(actor);
    if (!state || state.actionUsed) return Promise.resolve();
    const next = { ...state, actionUsed: true };
    this.#turnStates.set(actorKey(actor), next);
    return this.persistTurnState(actor, next, next.combatKey);
  }

  private markBonusActionUsed(actor: any): Promise<void> {
    const state = this.currentTurnState(actor);
    if (!state || state.bonusActionUsed) return Promise.resolve();
    const next = { ...state, bonusActionUsed: true };
    this.#turnStates.set(actorKey(actor), next);
    return this.persistTurnState(actor, next, next.combatKey);
  }

  private async normalizeLegacyMovementChanges(): Promise<void> {
    const actors = new Map<string, any>();
    for (const actor of collection(this.globals.game?.actors)) if (actor) actors.set(actorKey(actor), actor);
    for (const scene of collection(this.globals.game?.scenes)) {
      for (const token of collection(scene?.tokens)) {
        const actor = token?.actor;
        if (actor) actors.set(actorKey(actor), actor);
      }
    }
    for (const actor of actors.values()) {
      if (!this.isActiveGM() && actor?.isOwner !== true) continue;
      const updates = this.list(actor)
        .filter((entry) => ['immobilized', 'frozen', 'slowed'].includes(entry.instance.conditionId))
        .filter((entry) => collection(entry.effect?.changes).some((change) => change?.key === 'system.attributes.movement.walk'))
        .map((entry) => ({
          _id: entry.id,
          changes: collection(entry.effect?.changes).filter((change) => change?.key !== 'system.attributes.movement.walk'),
        }));
      if (updates.length) await actor.updateEmbeddedDocuments?.('ActiveEffect', updates, { [MODULE_ID]: { internal: true } });
    }
  }

  private async normalizeHighestExisting(actor: any, conditionId: 'bleeding' | 'burning'): Promise<ConditionEntry | undefined> {
    const all = this.list(actor).filter((entry) => entry.instance.conditionId === conditionId);
    const active = all.filter((entry) => !entry.disabled);
    if (!active.length) return undefined;
    let winner = active[0]!;
    for (const candidate of active.slice(1)) {
      const comparison = compareConditionFormulaStrength(
        String(candidate.instance.params.formula ?? ''), String(winner.instance.params.formula ?? ''),
      );
      if (comparison === undefined) throw new Error(`Actor ${actor.name ?? actorKey(actor)} has multiple ${conditionId} effects whose formulas cannot be compared; no effect was deleted.`);
      if (comparison > 0) winner = candidate;
    }
    const hasConfiguredSource = all.some((entry) => entry.effect?.flags?.[MODULE_ID]?.configuredComponent);
    const duplicates = hasConfiguredSource ? [] : all.filter((entry) => entry.id !== winner.id).map((entry) => entry.id);
    if (duplicates.length) await actor.deleteEmbeddedDocuments?.('ActiveEffect', duplicates);
    return this.list(actor).find((entry) => entry.id === winner.id);
  }

  private highestEntryId(actor: any, conditionId: 'bleeding' | 'burning'): string | undefined {
    const entries = this.list(actor).filter((entry) => !entry.disabled && entry.instance.conditionId === conditionId);
    let winner = entries[0];
    for (const entry of entries.slice(1)) {
      const comparison = compareConditionFormulaStrength(String(entry.instance.params.formula ?? ''), String(winner?.instance.params.formula ?? ''));
      if (comparison === undefined) return undefined;
      if (comparison > 0) winner = entry;
    }
    return winner?.id;
  }

  private applyRollModifiers(config: any, kind: 'attack' | 'save' | 'check'): boolean | void {
    if (kind === 'attack') this.ensureOptionalTargetStatusRule();
    const actor = config?.subject?.actor ?? config?.subject;
    if (!actor || actor.documentName !== 'Actor') return;
    const entries = this.list(actor).filter((entry) => !entry.disabled);
    const rolls = Array.isArray(config.rolls) ? config.rolls : [];
    const roll = rolls[0];
    if (!roll) return;
    const subject = config?.subject;
    if (kind === 'attack' && isAttackActivity(subject)
      && config && (typeof config === 'object' || typeof config === 'function')) {
      // Capture the turn before dnd5e opens the roll dialog so a result from a
      // dialog left open across turn changes cannot spend the next turn's Action.
      // The config object is unique per roll, even when the same Activity opens
      // more than one dialog.
      this.#pendingAttackTurnKeys.set(config, this.currentTurnState(actor)?.combatKey);
    }
    const activation = String(subject?.activation?.type ?? subject?.system?.activation?.type ?? '');
    const turnState = kind === 'attack' ? this.currentTurnState(actor) : undefined;
    const pendingChoice = kind === 'attack' ? this.currentPendingAttackChoice(actor) : undefined;
    if (kind === 'attack' && hasCondition(entries, 'dazed') && pendingChoice
      && activation !== pendingChoice.category && ['action', 'bonus'].includes(activation)) {
      return this.warnAndBlock(pendingAttackChoiceMessage(entries));
    }
    if (kind === 'attack' && hasCondition(entries, 'dazed') && turnState
      && ((activation === 'action' && (turnState.movementUsed || turnState.bonusActionUsed))
        || (activation === 'bonus' && (turnState.movementUsed || turnState.actionUsed)))) {
      return this.warnAndBlock(`${dazedRuleLabel(entries)}：本回合已选择移动、Action 或 Bonus Action 中的另一项。`);
    }
    if (kind === 'attack' && isWeaponOrUnarmedAttackActivity(config?.subject)
      && hasCondition(entries, 'staggered') && (turnState?.weaponAttacks ?? 0) >= 1) {
      return this.warnAndBlock('Staggered：本回合最多进行一次武器或徒手攻击。');
    }
    const ability = String(config.ability ?? config.subject?.ability ?? '');
    const jinx = entries.find((entry) => entry.instance.conditionId === 'jinxed');
    const valor = entries.find((entry) => entry.instance.conditionId === 'valor');
    roll.parts ??= [];
    if (jinx && (kind === 'attack' || kind === 'save')) addRollPart(roll, `-(${String(jinx.instance.params.formula)})`);
    if (valor && (kind === 'attack' || kind === 'save')) addRollPart(roll, `+(${String(valor.instance.params.formula)})`);
    if ((kind === 'save' || kind === 'check') && ability === 'str' && entries.some((entry) => entry.instance.conditionId === 'enfeebled')) config.disadvantage = true;
    if ((kind === 'save' || kind === 'check') && ability === 'dex' && entries.some((entry) => entry.instance.conditionId === 'clumsy')) config.disadvantage = true;
    if (kind === 'save' && ability === 'con' && entries.some((entry) => entry.instance.conditionId === 'sickened')) config.disadvantage = true;
    if ((kind === 'save' || kind === 'check') && ['int', 'wis', 'cha'].includes(ability)
      && entries.some((entry) => entry.instance.conditionId === 'addled')) config.disadvantage = true;
    if (kind === 'attack' && ['str', 'dex'].includes(ability)
      && entries.some((entry) => (ability === 'str' && entry.instance.conditionId === 'enfeebled')
        || (ability === 'dex' && entry.instance.conditionId === 'clumsy'))) config.disadvantage = true;
    if (kind === 'attack' && ['int', 'wis', 'cha'].includes(ability)
      && entries.some((entry) => entry.instance.conditionId === 'addled')) config.disadvantage = true;
    if (kind === 'attack' && targetIsDefenseless(this.globals, config)) config.advantage = true;
  }

  private applyDamageModifiers(rolls: any[], config: any): void {
    const activity = config?.subject;
    const actor = activity?.actor ?? activity?.item?.actor;
    const item = activity?.item;
    if (!actor || !item || !['weapon', 'spell'].includes(String(item.type))
      || String(activity?.type ?? activity?.system?.type ?? '') === 'heal') return;
    if (!this.list(actor).some((entry) => !entry.disabled && entry.instance.conditionId === 'weakened')) return;
    const terms = this.globals.foundry?.dice?.terms;
    const OperatorTerm = terms?.OperatorTerm;
    const NumericTerm = terms?.NumericTerm;
    const ParentheticalTerm = terms?.ParentheticalTerm;
    const RollTerm = terms?.RollTerm;
    if (!OperatorTerm || !NumericTerm || !ParentheticalTerm || !RollTerm) {
      this.report(new Error('dnd5e DamageRoll terms are unavailable; Weakened damage was not transformed.'));
      return;
    }
    for (const roll of Array.isArray(rolls) ? rolls : []) {
      const original = Array.isArray(roll?.terms) ? roll.terms : [];
      const types = [roll?.options?.type, ...collection(roll?.options?.types)].filter(Boolean).map(String);
      if (!original.length || roll.options?.[`${MODULE_ID}.weakenedApplied`]
        || types.some((type) => type in (this.globals.CONFIG?.DND5E?.healingTypes ?? {}))) continue;
      const transformed: any[] = [];
      let chunk: any[] = [];
      const wrap = () => {
        if (!chunk.length) return;
        const flavor = chunk.map((term) => String(term?.flavor ?? '').toLowerCase())
          .find((value) => value in (this.globals.CONFIG?.DND5E?.damageTypes ?? {}));
        const cloned = chunk.map((term) => RollTerm.fromData(term.toJSON()));
        transformed.push(ParentheticalTerm.fromTerms(cloned, { flavor }));
        transformed.push(new OperatorTerm({ operator: '*' }), new NumericTerm({ number: 0.5 }));
        chunk = [];
      };
      for (const term of original) {
        if (term instanceof OperatorTerm && (term.operator === '+' || term.operator === '-')) {
          wrap();
          transformed.push(term);
        } else {
          chunk.push(term);
        }
      }
      wrap();
      if (transformed.length) {
        roll.terms = transformed;
        roll.resetFormula?.();
        roll.options ??= {};
        roll.options[`${MODULE_ID}.weakenedApplied`] = true;
      }
    }
  }

  private preUseActivity(activity: any, _usage: any): boolean | void {
    const actor = activity?.actor ?? activity?.item?.actor;
    if (!actor || actor.documentName !== 'Actor') return;
    const entries = this.list(actor).filter((entry) => !entry.disabled);
    const activation = String(activity?.activation?.type ?? activity?.system?.activation?.type ?? '');
    const item = activity?.item;
    if (hasCondition(entries, 'bewildered') && item?.type === 'spell') {
      const isCantripAction = item?.type === 'spell'
        && Number(item?.system?.level ?? item?.system?.level?.value ?? -1) === 0
        && activation === 'action';
      if (!isCantripAction) return this.warnAndBlock('Bewildered：只能施放施法时间为 1 Action 的 cantrip。');
    }
    const state = this.currentTurnState(actor);
    const pendingChoice = this.currentPendingAttackChoice(actor);
    if (hasCondition(entries, 'dazed') && pendingChoice
      && activation !== pendingChoice.category && ['action', 'bonus'].includes(activation)) {
      return this.warnAndBlock(pendingAttackChoiceMessage(entries));
    }
    if (hasCondition(entries, 'dazed') && state
      && ((activation === 'bonus' && (state.movementUsed || state.actionUsed))
        || (activation === 'action' && (state.movementUsed || state.bonusActionUsed)))) {
      return this.warnAndBlock(`${dazedRuleLabel(entries)}：本回合已选择移动、Action 或 Bonus Action 中的另一项。`);
    }
    if (hasCondition(entries, 'distracted') && activation === 'reaction') return this.warnAndBlock('Distracted：不能执行 Reaction。');
    if (hasCondition(entries, 'staggered') && isWeaponOrUnarmedAttackActivity(activity)
      && (state?.weaponAttacks ?? 0) >= 1) return this.warnAndBlock('Staggered：本回合最多进行一次武器或徒手攻击。');
  }

  private preMoveToken(token: any, movement: any, _options: any): boolean | void {
    const actor = token?.actor;
    if (!actor) return;
    if (!isVoluntaryMovement(movement, this.globals.game?.user)) return;
    if (!movement?.passed?.waypoints?.length) return;
    const entries = this.list(actor).filter((entry) => !entry.disabled);
    if (hasCondition(entries, 'immobilized')) {
      return this.warnAndBlock('Immobilized / Frozen：速度为 0，不能自主移动。');
    }
    if (!hasCondition(entries, 'dazed')) return;
    const state = this.currentTurnState(actor);
    if (!state) return;
    if (this.currentPendingAttackChoice(actor)) return this.warnAndBlock(pendingAttackChoiceMessage(entries));
    if (state.actionUsed || state.bonusActionUsed) {
      return this.warnAndBlock(`${dazedRuleLabel(entries)}：本回合已执行或正在结算 Action 或 Bonus Action，不能再移动。`);
    }
  }

  private postMoveToken(token: any, movement: any, user?: any): void {
    const actor = token?.actor;
    if (!actor || !movement?.passed?.waypoints?.length) return;
    if (!isVoluntaryMovement(movement, user ?? this.globals.game?.user)) return;
    const state = this.currentTurnState(actor);
    if (!state || state.movementUsed) return;
    this.replaceLocalTurnState(actor, { ...state, movementUsed: true }, this.isActiveGM());
  }

  private postUseActivity(activity: any, usage: any): void {
    const actor = activity?.actor ?? activity?.item?.actor;
    if (!actor || actor.documentName !== 'Actor') return;
    const activation = String(activity?.activation?.type ?? activity?.system?.activation?.type ?? '');
    // dnd5e 5.3.3 and reviewed 6.0.x fire postUseActivity before an Attack Activity's
    // roll dialog. Defer either activity category until the non-empty rollAttack hook.
    if (!isAttackActivity(activity)) {
      if (activation === 'action') void this.markActionUsed(actor).catch((error) => this.report(error));
      if (activation === 'bonus') void this.markBonusActionUsed(actor).catch((error) => this.report(error));
    }
    void usage;
  }

  private captureAttackTurn(rolls: any[], config: any): boolean | void {
    if (!Array.isArray(rolls) || !config || (typeof config !== 'object' && typeof config !== 'function')
      || !this.#pendingAttackTurnKeys.has(config)) return;
    const combatKey = this.#pendingAttackTurnKeys.get(config);
    this.#pendingAttackTurnKeys.delete(config);
    // dnd5e 5.3.3 and reviewed 6.0.x call this cancellable hook after the attack dialog but
    // before evaluating the roll. Another choice can finish while it is open.
    const activity = config.subject;
    const actor = activity?.actor ?? activity?.item?.actor;
    if (rolls.length && actor?.documentName === 'Actor') {
      const entries = this.list(actor).filter((entry) => !entry.disabled);
      if (hasCondition(entries, 'dazed')) {
        const state = this.currentTurnState(actor);
        if (combatKey !== state?.combatKey) {
          return this.warnAndBlock(`${dazedRuleLabel(entries)}：攻击准备期间回合已变化，请重新发起攻击。`);
        }
        const activation = String(activity?.activation?.type ?? activity?.system?.activation?.type ?? '');
        const pendingChoice = this.currentPendingAttackChoice(actor);
        if (pendingChoice && activation !== pendingChoice.category && ['action', 'bonus'].includes(activation)) {
          return this.warnAndBlock(pendingAttackChoiceMessage(entries));
        }
        if (state && ((activation === 'action' && (state.movementUsed || state.bonusActionUsed))
          || (activation === 'bonus' && (state.movementUsed || state.actionUsed)))) {
          return this.warnAndBlock(`${dazedRuleLabel(entries)}：本回合已选择移动、Action 或 Bonus Action 中的另一项。`);
        }
        if (state && (activation === 'action' || activation === 'bonus')) {
          // The roll still awaits evaluation and post-processing. A failed roll
          // has no reliable cleanup hook, so retain this choice until turn reset.
          this.#pendingAttackChoices.set(actorKey(actor), { combatKey: state.combatKey, category: activation });
        }
      }
    }
    this.#configuredAttackTurnKeys.set(rolls, combatKey);
  }

  private trackAttackRoll(rolls: any[], config: any): void {
    const activity = config?.subject;
    const actor = activity?.actor ?? activity?.item?.actor;
    if (!actor || actor.documentName !== 'Actor' || !isAttackActivity(activity)
      || !Array.isArray(rolls) || !rolls.length) return;

    const hasCapturedTurn = this.#configuredAttackTurnKeys.has(rolls);
    const capturedTurnKey = hasCapturedTurn ? this.#configuredAttackTurnKeys.get(rolls) : undefined;
    if (hasCapturedTurn) this.#configuredAttackTurnKeys.delete(rolls);
    const state = this.currentTurnState(actor);
    if (!state || (hasCapturedTurn && capturedTurnKey !== state.combatKey)) return;
    const nextState = {
      ...state,
      actionUsed: String(activity?.activation?.type ?? activity?.system?.activation?.type ?? '') === 'action'
        || state.actionUsed,
      bonusActionUsed: String(activity?.activation?.type ?? activity?.system?.activation?.type ?? '') === 'bonus'
        || state.bonusActionUsed,
      weaponAttacks: state.weaponAttacks + (isWeaponOrUnarmedAttackActivity(activity) ? 1 : 0),
    };
    this.replaceLocalTurnState(actor, nextState, true);
    const pendingChoice = this.currentPendingAttackChoice(actor);
    if (pendingChoice && pendingChoice.category === String(activity?.activation?.type ?? activity?.system?.activation?.type ?? '')) {
      this.#pendingAttackChoices.delete(actorKey(actor));
    }
  }

  private preUpdateItem(item: any, changed: any, options: any): boolean | void {
    if (options?.[MODULE_ID]?.internal === true) return;
    const equipped = changed?.system?.equipped ?? changed?.['system.equipped'];
    if (equipped === undefined || !isEquipableItem(item)) return;
    return this.checkShockedItemAction(item?.actor ?? item?.parent);
  }

  private preCreateItem(item: any, options: any): boolean | void {
    if (options?.[MODULE_ID]?.internal === true) return;
    if (!isPickupItem(item)) return;
    return this.checkShockedItemAction(item?.actor ?? item?.parent);
  }

  private checkShockedItemAction(actor: any): boolean | void {
    if (!actor || !hasCondition(this.list(actor).filter((entry) => !entry.disabled), 'shocked')) return;
    const state = this.currentTurnState(actor);
    if (!state) return;
    if (this.currentPendingAttackChoice(actor)) {
      return this.warnAndBlock('Shocked：攻击掷骰仍在结算；若掷骰异常失败，本回合保持限制，下回合自动重置。');
    }
    if (state.actionUsed || (state.movementUsed || state.bonusActionUsed)
      && hasCondition(this.list(actor).filter((entry) => !entry.disabled), 'dazed')) {
      return this.warnAndBlock('Shocked：拿取、拔出或收起物品需要 1 Action，但本回合已无法执行 Action。');
    }
  }

  private postUpdateItem(item: any, changed: any, options: any, userId: string): void {
    if (options?.[MODULE_ID]?.internal === true || userId !== this.globals.game?.user?.id) return;
    const equipped = changed?.system?.equipped ?? changed?.['system.equipped'];
    const actor = item?.actor ?? item?.parent;
    if (equipped === undefined || !actor || !isEquipableItem(item)) return;
    if (hasCondition(this.list(actor).filter((entry) => !entry.disabled), 'shocked')) {
      void this.markActionUsed(actor).catch((error) => this.report(error));
    }
  }

  private postCreateItem(item: any, userId: string): void {
    const actor = item?.actor ?? item?.parent;
    if (userId !== this.globals.game?.user?.id || !actor || !isPickupItem(item)) return;
    if (hasCondition(this.list(actor).filter((entry) => !entry.disabled), 'shocked')) {
      void this.markActionUsed(actor).catch((error) => this.report(error));
    }
  }

  private prepareHelplessCriticalMessage(message: any, data: any): void {
    const flags = data?.flags?.dnd5e ?? message?.flags?.dnd5e;
    const canonical = isNative6SystemVersion(this.globals.game?.system?.version);
    const type = canonical ? (data?.type ?? message?.type) : flags?.roll?.type;
    if (type !== 'attack') return;
    const descriptors = canonical ? (data?.system?.targets ?? message?.system?.targets) : flags?.targets;
    const targets = Array.isArray(descriptors) ? descriptors : [];
    const targetUuid = canonical ? targets[0]?.actor : targets[0]?.uuid;
    if (targets.length !== 1 || typeof targetUuid !== 'string' || !targetUuid) return;
    const resolve = this.globals.foundry?.utils?.fromUuidSync ?? this.globals.fromUuidSync;
    const target = resolve?.(targetUuid);
    const targetActor = target?.actor ?? target?.document?.actor ?? target;
    if (!targetActor) return;
    const entries = this.list(targetActor).filter((entry) => !entry.disabled);
    const activity = message?.getAssociatedActivity?.();
    const qualifies = hasCondition(entries, 'helpless')
      || (entries.some((entry) => entry.instance.conditionId === 'frozen') && isBludgeoningWeapon(activity));
    if (!qualifies) return;
    if (targets[0].ac === null) return;
    const armorClass = typeof targets[0].ac === 'number' ? targets[0].ac : Number(targetActor?.system?.attributes?.ac?.value);
    if (!Number.isFinite(armorClass)) return;
    const rolls = collection(message?.rolls);
    for (const roll of rolls) {
      const total = Number(roll?.total);
      const d20 = roll?.d20 ?? roll?.terms?.find?.((term: any) => term?.faces === 20);
      if (!Number.isFinite(total) || total < armorClass || roll?.isFumble || !d20) continue;
      d20.options ??= {};
      const natural = Number(d20.total ?? total);
      if (natural > 1) {
        d20.options.criticalSuccess = natural;
        if (roll.options) roll.options.criticalSuccess = natural;
      }
    }
    if (rolls.length) message.updateSource?.({ rolls: rolls.map((roll: any) => roll.toJSON?.() ?? roll) });
  }

  private captureFrozenDamage(actor: any, damages: any[], options: any): void {
    if (!actor || !options || typeof options !== 'object') return;
    const key = actorKey(actor);
    const pending = this.#pendingFrozenDamage.get(options) ?? new Map<string, number>();
    pending.delete(key);
    if (!this.list(actor).some((entry) => !entry.disabled && entry.instance.conditionId === 'frozen')) {
      this.#pendingFrozenDamage.set(options, pending);
      return;
    }
    const typedTotal = (Array.isArray(damages) ? damages : [])
      .filter((damage) => damage?.type === 'fire' || damage?.type === 'bludgeoning')
      .reduce((sum, damage) => sum + Math.max(0, Number(damage?.value) || 0), 0);
    const appliedTotal = Number((damages as any)?.amount ?? typedTotal);
    const total = Math.min(Math.floor(typedTotal), Math.max(0, Math.trunc(appliedTotal)));
    if (total > 0) pending.set(key, total);
    this.#pendingFrozenDamage.set(options, pending);
  }

  private async handleAppliedDamage(actor: any, amount: number, options: any): Promise<void> {
    if ((!this.isActiveGM() && actor?.isOwner !== true) || !actor || !options || typeof options !== 'object' || amount <= 0) return;
    const pending = this.#pendingFrozenDamage.get(options);
    const gained = pending?.get(actorKey(actor)) ?? 0;
    pending?.delete(actorKey(actor));
    if (gained <= 0) return;
    await this.enqueue(actor, async () => {
      const entries = this.list(actor).filter((entry) => !entry.disabled && entry.instance.conditionId === 'frozen');
      const removals: string[] = [];
      const updates: any[] = [];
      for (const entry of entries) {
        const threshold = Number(entry.instance.params.breakDamage ?? 20);
        const accumulated = Number(entry.instance.params.breakDamageTaken ?? 0) + gained;
        if (accumulated >= threshold) removals.push(...configuredRemovalIds(actor, entry));
        else {
          const next = createConditionInstance('frozen', { ...entry.instance.params, breakDamageTaken: accumulated }, {
            instanceId: entry.instance.instanceId,
            enabled: true,
            origin: entry.instance.origin,
            source: entry.instance.source,
            createdAt: entry.instance.createdAt,
          });
          updates.push({ _id: entry.id, [`flags.${MODULE_ID}.condition`]: next });
        }
      }
      if (updates.length) await actor.updateEmbeddedDocuments?.('ActiveEffect', updates);
      if (removals.length) await actor.deleteEmbeddedDocuments?.('ActiveEffect', [...new Set(removals)]);
    });
  }

  private warnAndBlock(message: string): false {
    this.globals.ui?.notifications?.warn?.(message);
    return false;
  }

  private report(error: unknown): void {
    this.globals.console?.error?.(`[${MODULE_ID}]`, error);
    this.globals.ui?.notifications?.error?.(`Condition 自动结算需要 GM 检查：${String(error)}`);
  }
}

function configuredRemovalIds(actor: any, entry: ConditionEntry): string[] {
  const owner = entry.effect?.flags?.[MODULE_ID]?.configuredComponent;
  if (!owner || typeof owner.instanceId !== 'string') return [entry.id];
  return collection(actor?.effects).filter((effect) => {
    const root = effect?.flags?.[MODULE_ID]?.configuredRoot;
    const child = effect?.flags?.[MODULE_ID]?.configuredComponent;
    const candidate = root ?? child;
    return candidate?.instanceId === owner.instanceId && candidate?.definitionId === owner.definitionId
      && candidate?.fingerprint === owner.fingerprint;
  }).map(effectId);
}

export function changesFor(instance: ConditionInstance, systemVersion?: string): Array<Record<string, unknown>> {
  const changes: Array<Record<string, unknown>> = [];
  const disadvantage = (ability: string, type: 'check' | 'save' | 'attack') => {
    changes.push({ key: `system.abilities.${ability}.${type}.roll.mode`, mode: 2, value: '-1', priority: null });
  };
  if (instance.conditionId === 'addled') for (const ability of ['int', 'wis', 'cha']) { disadvantage(ability, 'check'); disadvantage(ability, 'save'); }
  if (instance.conditionId === 'clumsy') { disadvantage('dex', 'check'); disadvantage('dex', 'save'); }
  if (instance.conditionId === 'enfeebled') { disadvantage('str', 'check'); disadvantage('str', 'save'); }
  // Reviewed 6.0.x builds native AttackActivity roll modes from these Actor fields before
  // preRollAttack. Persist the ability-specific source so later roll modules
  // can combine it with legitimate advantage, rather than relying on a late
  // boolean alone. 5.3.3 has no ability.attack.roll schema; keep its Hook path.
  if (isNative6SystemVersion(systemVersion)) {
    if (instance.conditionId === 'addled') for (const ability of ['int', 'wis', 'cha']) disadvantage(ability, 'attack');
    if (instance.conditionId === 'clumsy') disadvantage('dex', 'attack');
    if (instance.conditionId === 'enfeebled') disadvantage('str', 'attack');
  }
  if (instance.conditionId === 'sickened') disadvantage('con', 'save');
  return changes;
}

function nativeMovementPropertyStatusId(conditionId: ConditionId): string | undefined {
  return ['immobilized', 'frozen', 'slowed'].includes(conditionId) ? `fvttcc.${conditionId}` : undefined;
}

function nativeMovementPropertyStatuses(conditionId: ConditionId, composite: readonly ConditionId[] | undefined, systemVersion: string | undefined): string[] {
  if (!isNative6SystemVersion(systemVersion)) return [];
  // Reviewed 6.0.x parses condition properties as status-level by splitting on "-".
  // Keep the public status IDs intact; these unregistered internal aliases are
  // collected from ActiveEffect.statuses and do not create extra HUD entries.
  return [conditionId, ...(composite ?? [])].flatMap((id) => {
    const status = nativeMovementPropertyStatusId(id);
    return status ? [status] : [];
  });
}

function registerStatusEffects(globals: any): void {
  const statuses = globals.CONFIG?.statusEffects;
  if (Array.isArray(statuses)) {
    for (const definition of Object.values(CONDITION_DEFINITIONS)) {
      const statusId = projectedConditionStatusId(definition.id);
      const existing = statuses.find((entry: any) => entry?.id === statusId);
      if (existing) {
        // A status with the same ID may belong to dnd5e or another module. Only
        // refresh entries that this module registered itself.
        if (existing.flags?.[MODULE_ID]?.owned !== true) continue;
        const localized = localizedConditionDefinition(definition, globals);
        const label = localizedConditionStatusLabel(definition.id, globals);
        Object.assign(existing, {
          label,
          name: label,
          description: localized.description,
          tooltip: localized.description,
          img: conditionIconPath(definition.id),
          // The native toggle cannot create our module flag or collect
          // parameters; TAH supplies the module-owned action instead.
          hud: false,
        });
        markConditionStatusOwned(definition.id);
        continue;
      }
      const localized = localizedConditionDefinition(definition, globals);
      const label = localizedConditionStatusLabel(definition.id, globals);
      statuses.push({
        id: statusId,
        label,
        name: label,
        description: localized.description,
        tooltip: localized.description,
        img: conditionIconPath(definition.id),
        hud: false,
        flags: { [MODULE_ID]: { owned: true } },
      });
      markConditionStatusOwned(definition.id);
    }
  }
  const effects = globals.CONFIG?.DND5E?.conditionEffects;
  if (isNative6SystemVersion(globals.game?.system?.version)) {
    effects?.noMovement?.add?.(nativeMovementPropertyStatusId('immobilized'));
    effects?.noMovement?.add?.(nativeMovementPropertyStatusId('frozen'));
    effects?.halfMovement?.add?.(nativeMovementPropertyStatusId('slowed'));
  } else {
    effects?.noMovement?.add?.('immobilized');
    effects?.noMovement?.add?.('frozen');
    effects?.halfMovement?.add?.('slowed');
    effects?.noMovement?.add?.(projectedConditionStatusId('immobilized'));
    effects?.noMovement?.add?.(projectedConditionStatusId('frozen'));
    effects?.halfMovement?.add?.(projectedConditionStatusId('slowed'));
  }
}

export function registerConditionMappings(globals: any = globalThis): void {
  registerStatusEffects(globals);
  registerConditionActionInterceptor(globals);
}

function readStacking(instance: ConditionInstance, fallback: ConditionStacking): ConditionStacking {
  const value = instance.params.stacking;
  return value === 'highest' || value === 'stack' || value === 'replace' || value === 'ignore' || value === 'unspecified' ? value : fallback;
}

async function evaluateFormula(globals: any, formula: string, actor: any): Promise<number> {
  const RollClass = globals.Roll;
  if (typeof RollClass !== 'function') throw new Error('Foundry Roll 不可用。');
  if (typeof RollClass.validate === 'function' && !RollClass.validate(formula)) throw new Error(`无效骰式：${formula}`);
  const roll = new RollClass(formula, actor?.getRollData?.() ?? {});
  await roll.evaluate?.({ async: true });
  const total = Number(roll.total);
  if (!Number.isFinite(total) || total < 0) throw new Error(`骰式结果无效：${total}`);
  return Math.floor(total);
}

async function loseHitPoints(actor: any, value: number): Promise<void> {
  const hp = readHP(actor);
  if (hp === undefined) throw new Error('目标没有有效生命值。');
  await actor.update?.({ 'system.attributes.hp.value': Math.max(0, hp - value) }, { [MODULE_ID]: { internal: true } });
}

async function applyDamage(actor: any, value: number, damageType: string): Promise<void> {
  if (typeof actor.applyDamage !== 'function') throw new Error('dnd5e Actor.applyDamage 不可用。');
  await actor.applyDamage([{ value, ...(damageType ? { type: damageType } : {}) }], { ignore: false });
}

async function postRollMessage(globals: any, actor: any, entry: ConditionEntry, value: number, context: TriggerEventContextLike): Promise<void> {
  const RollClass = globals.Roll;
  if (!RollClass || !globals.ChatMessage) return;
  const formula = String(entry.instance.params.formula ?? '');
  await globals.ChatMessage.create?.({ content: `${actor.name ?? ''} · ${entry.instance.conditionId} (${formula}) = ${value}`, speaker: { actor: actor.id, token: context.token?.id } });
}

function addRollPart(roll: any, part: string): void {
  if (!Array.isArray(roll.parts)) roll.parts = [];
  if (!roll.parts.includes(part)) roll.parts.push(part);
}

function targetIsDefenseless(globals: any, config: any): boolean {
  const candidates = [config?.target, ...(globals.game?.user?.targets ? collection(globals.game.user.targets) : [])];
  return candidates.some((target: any) => {
    const actor = target?.actor ?? target?.document?.actor ?? target;
    const entries: ConditionEntry[] = actor ? collection(actor.effects).flatMap((effect) => {
      const instance = readConditionInstance(effect);
      if (!instance || instance.template || instance.enabled === false || inactive(effect)) return [];
      return [{
        id: effectId(effect),
        name: displayConditionName(effect, instance, globals),
        description: displayConditionDescription(effect, instance, globals),
        origin: String(effect.origin ?? instance.origin ?? ''),
        disabled: false,
        instance,
        effect,
      }];
    }) : [];
    return actor && (hasCondition(entries, 'defenseless') || hasCondition(entries, 'frozen') || hasCondition(entries, 'shocked'));
  });
}

function isWeaponOrUnarmedAttackActivity(activity: any): boolean {
  if (!isAttackActivity(activity)) return false;
  // dnd5e 5.3.3 represents Unarmed Strike as a weapon Item with an
  // attack.type.classification of "unarmed". Other items can also carry an
  // unarmed Attack Activity, so the activity classification takes precedence.
  const classification = attackClassification(activity);
  if (classification) return classification === 'weapon' || classification === 'unarmed';
  const item = activity?.item ?? activity;
  return item?.type === 'weapon';
}

function attackClassification(activity: any): string {
  return String(activity?.attack?.type?.classification
    || activity?.system?.attack?.type?.classification
    || activity?.item?.system?.attackClassification || '');
}

function isAttackActivity(activity: any): boolean {
  return String(activity?.type ?? activity?.system?.type ?? '') === 'attack';
}

function isBludgeoningWeapon(activity: any): boolean {
  const item = activity?.item ?? activity;
  if (!isAttackActivity(activity)) return false;
  const classification = attackClassification(activity);
  if (classification ? classification !== 'weapon' : item?.type !== 'weapon') return false;
  const preparedParts = activity?.damage?.parts ?? activity?.system?.damage?.parts;
  if (preparedParts !== undefined) return collection(preparedParts).some((part) => {
    const types = part?.types ?? part?.damageTypes ?? [];
    return typeof types?.has === 'function' ? types.has('bludgeoning')
      : Array.isArray(types) && types.includes('bludgeoning');
  });
  const types = item?.system?.damage?.base?.types ?? item?.system?.damage?.types ?? [];
  return typeof types?.has === 'function' ? types.has('bludgeoning')
    : Array.isArray(types) && types.includes('bludgeoning');
}

function dazedRuleLabel(entries: ConditionEntry[]): string {
  return hasCondition(entries, 'shocked') ? 'Shocked' : 'Dazed';
}

function pendingAttackChoiceMessage(entries: ConditionEntry[]): string {
  return `${dazedRuleLabel(entries)}：攻击掷骰仍在结算，不能选择其他行动；若掷骰异常失败，本回合保持限制，下回合自动重置。`;
}

function isVoluntaryMovement(movement: any, user: any): boolean {
  // Foundry 14 supplies the initiating method on both movement hooks. API,
  // undo and GM coordinate edits may represent forced movement or adjudication.
  return movement?.method === 'dragging' || movement?.method === 'keyboard'
    || (user?.isGM === false && (movement?.method === 'hud' || movement?.method === 'config'));
}

function hasCondition(entries: ConditionEntry[], conditionId: ConditionId): boolean {
  return entries.some((entry) => {
    const definition = getConditionDefinition(entry.instance.conditionId);
    return entry.instance.conditionId === conditionId || Boolean(definition?.composite?.includes(conditionId));
  });
}

async function unequipActorItems(actor: any): Promise<void> {
  const updates = collection(actor?.items)
    .filter((item) => item?.system?.equipped === true && isHeldItem(item))
    .map((item) => ({ _id: item.id ?? item._id, 'system.equipped': false }));
  if (updates.length) await actor.updateEmbeddedDocuments?.('Item', updates, { [MODULE_ID]: { internal: true } });
}

function isEquipableItem(item: any): boolean {
  return isHeldItem(item);
}

function isHeldItem(item: any): boolean {
  if (item?.type === 'weapon') return true;
  if (item?.type !== 'equipment') return false;
  const subtype = String(item?.system?.type?.value ?? '');
  if (['shield', 'rod', 'wand'].includes(subtype)) return true;
  const properties = item?.system?.properties;
  return typeof properties?.has === 'function' && properties.has('focus');
}

function isPickupItem(item: any): boolean {
  return ['weapon', 'equipment', 'tool', 'consumable', 'loot', 'container'].includes(String(item?.type ?? ''));
}

function currentCombatTurnKey(globals: any, actor: any): string | undefined {
  const game = globals?.game;
  const combat = activeCombat(globals);
  if (!combat) return undefined;
  const current = combat.current ?? {};
  const round = Number(combat.round ?? current.round);
  const turn = Number(combat.turn ?? current.turn);
  if (!Number.isInteger(round) || !Number.isInteger(turn) || turn < 0) return undefined;
  const combatantId = current.combatantId ?? combat.turns?.[turn]?.id;
  const combatant = combat.combatant ?? combat.combatants?.get?.(combatantId)
    ?? collection(combat.combatants).find((candidate) => candidate.id === combatantId);
  const currentActor = combatant?.actor ?? game?.actors?.get?.(combatant?.actorId);
  if (!currentActor || actorKey(currentActor) !== actorKey(actor)) return undefined;
  return `${String(combat.uuid ?? `Combat.${combat.id ?? 'active'}`)}:${round}:${turn}`;
}

function activeCombat(globals: any): any {
  const game = globals?.game;
  return game?.combat ?? game?.combats?.active
    ?? collection(game?.combats).find((combat) => combat?.active === true);
}

function combatHasActiveTurn(combat: any): boolean {
  if (!combat) return false;
  const current = combat.current ?? {};
  const round = Number(combat.round ?? current.round);
  const turn = Number(combat.turn ?? current.turn);
  return round > 0 && Number.isInteger(turn) && turn >= 0
    && Boolean(combat.combatant ?? current.combatantId ?? combat.turns?.[turn]);
}

function localTurnKeyIsCurrent(globals: any, actor: any, key: string): boolean {
  return currentCombatTurnKey(globals, actor) === key;
}

function readActorTurnState(actor: any): TurnState | undefined {
  const value = actor?.flags?.[MODULE_ID]?.turnState;
  if (!value || typeof value.combatKey !== 'string'
    || !Number.isFinite(Number(value.weaponAttacks))
    || typeof value.actionUsed !== 'boolean' || typeof value.movementUsed !== 'boolean') return undefined;
  return {
    combatKey: value.combatKey,
    weaponAttacks: Math.max(0, Math.floor(Number(value.weaponAttacks))),
    actionUsed: value.actionUsed,
    bonusActionUsed: value.bonusActionUsed === true,
    movementUsed: value.movementUsed,
  };
}

function mergeTurnState(left: TurnState, right: TurnState): TurnState {
  return {
    combatKey: left.combatKey,
    weaponAttacks: Math.max(left.weaponAttacks, right.weaponAttacks),
    actionUsed: left.actionUsed || right.actionUsed,
    bonusActionUsed: left.bonusActionUsed || right.bonusActionUsed,
    movementUsed: left.movementUsed || right.movementUsed,
  };
}

function turnStateWasUpdated(changed: any): boolean {
  return changed?.flags?.[MODULE_ID]?.turnState !== undefined
    || changed?.[`flags.${MODULE_ID}.turnState`] !== undefined
    || changed?.[`flags.${MODULE_ID}.-=turnState`] !== undefined;
}

function readCheckpoint(actor: any, key: string): string | undefined {
  return actor?.flags?.[MODULE_ID]?.turns?.[safeKey(key)];
}

async function writeCheckpoint(actor: any, key: string, value: string): Promise<void> {
  await actor.update?.({ [conditionFlagPath(safeKey(key))]: value }, { [MODULE_ID]: { internal: true } });
}

function safeKey(value: string): string { return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 160); }
function collection(value: any): any[] { if (Array.isArray(value)) return value; if (typeof value?.values === 'function') return [...value.values()]; return value?.contents ?? []; }
function effectId(effect: any): string { return String(effect?.id ?? effect?._id ?? ''); }
function actorKey(actor: any): string { return String(actor?.uuid ?? `Actor.${actor?.id ?? 'unknown'}`); }
function inactive(effect: any): boolean { return effect?.disabled === true || effect?.isSuppressed === true || effect?.active === false; }
function readHP(value: any): number | undefined {
  const hp = value?.system?.attributes?.hp?.value ?? value?.attributes?.hp?.value ?? value?.hp?.value;
  return typeof hp === 'number' && Number.isFinite(hp) ? hp : undefined;
}
function isActiveGMFrom(globals: any): boolean {
  const user = globals?.game?.user;
  const active = globals?.game?.users?.activeGM;
  return user?.isGM === true && user?.active !== false && Boolean(active) && (active === user || active?.id === user?.id);
}
