import { decodeStatusLifecycleParameters, nativeLifecycleStatusLabel, type StatusLifecycleParameters } from '@fvtt-json-generator/contracts/status-lifecycle';

interface StatusLifecycleEnvironment {
  game: any; canvas: any; CONFIG?: any; DialogV2?: any; foundry?: any; MidiQOL?: any;
  Hooks: { on(name: string, callback: (...args: any[]) => unknown): unknown; off(name: string, id: unknown): void };
}

export interface StatusLifecycleRule {
  id: string; kind: 'status-lifecycle'; actorKey: string; itemName: string; parameters: StatusLifecycleParameters;
}
export interface StatusLifecycleEntry { actor: any; status: string; claim: any }
export interface StatusLifecyclePorts {
  assertLive(): void;
  ruleForActivity(activity: any): StatusLifecycleRule | undefined;
  sourceToken(rule: StatusLifecycleRule, activity: any): any;
  entries(): StatusLifecycleEntry[];
  apply(rule: StatusLifecycleRule, source: any, target: any, lifecycle: Record<string, unknown>): Promise<void>;
  update(entry: StatusLifecycleEntry, lifecycle: Record<string, unknown>): Promise<void>;
  remove(entry: StatusLifecycleEntry): Promise<void>;
  enqueue(operation: () => Promise<unknown>): void;
  record(type: string, detail: Record<string, unknown>): void;
  notify(message: string): void;
}

const SCOPE = 'fvtt-json-forge';
const ATTACK_FLAG = 'statusLifecycleAttack';
interface PendingAttack {
  rule: StatusLifecycleRule; activity: any; source: any; target: any; authorId: string; nonce: string; midiWorkflow?: any;
  midiWorkflowId?: string; midiMessageId?: string;
  completion?: { messageId: string; hit: boolean; total: number; formula: string; critical: boolean; fumble: boolean; attackRollCount: number;
    lifecycle?: Record<string, any> };
}
const values = (collection: any): any[] => Array.isArray(collection) ? collection
  : typeof collection?.values === 'function' ? [...collection.values()] : [];
const tokenUuid = (token: any): string | undefined => token?.document?.uuid ?? token?.uuid;
const tokenId = (token: any): string | undefined => token?.document?.id ?? token?.id;
const worldTime = (env: StatusLifecycleEnvironment): number => {
  const time = env.game?.time?.worldTime;
  if (typeof time !== 'number' || !Number.isFinite(time)) throw new Error('世界时间不可用，未处理状态期限。');
  return time;
};
const roundTime = (env: StatusLifecycleEnvironment): number => {
  const seconds = env.CONFIG?.time?.roundTime;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) throw new Error('战斗轮时长不可用，未处理状态期限。');
  return seconds;
};

/** Data-only lifecycle composition. Native attacks are never replaced or rolled a second time. */
export function installStatusLifecycles(env: StatusLifecycleEnvironment, rules: StatusLifecycleRule[], ports: StatusLifecyclePorts): () => void {
  if (!rules.length) return () => {};
  const trigger = env.game.modules?.get?.('fvtt-trigger-engine');
  if (!trigger?.active || trigger.api?.apiVersion !== 1 || typeof trigger.api.subscribe !== 'function') {
    throw new Error('通用状态生命周期需要已启用且兼容的 Trigger Engine。');
  }
  for (const rule of rules) decodeStatusLifecycleParameters(rule.parameters);
  let stopped = false;
  const hooks: Array<[string, unknown]> = [];
  const pending = new Map<string, PendingAttack>();
  const configuredMidiRolls = new WeakMap<object, PendingAttack>();
  const register = (name: string, callback: (...args: any[]) => unknown) => hooks.push([name, env.Hooks.on(name, callback)]);
  let onTurnEnd = (_context: any): void => {};
  const unsubscribe = trigger.api.subscribe((context: any) => onTurnEnd(context));
  const live = () => { if (stopped) throw new Error('通用状态控制器已停止。'); ports.assertLive(); };
  const safely = (operation: () => Promise<unknown>) => ports.enqueue(async () => { live(); await operation(); });
  const currentEntry = (entry: StatusLifecycleEntry) => ports.entries().find(candidate => candidate.actor.uuid === entry.actor.uuid && candidate.claim.groupId === entry.claim.groupId);
  const validEntry = (entry: StatusLifecycleEntry) => {
    const rule = rules.find(candidate => candidate.id === entry.claim.ruleId);
    const state = entry.claim.lifecycle;
    if (!rule || state?.version !== 1 || entry.status !== rule.parameters.status
      || state.ruleSignature !== JSON.stringify(rule.parameters) || entry.claim.targetActorUuid !== entry.actor.uuid
      || typeof state.startedAt !== 'number' || !Number.isFinite(state.startedAt)
      || typeof state.expiresAt !== 'number' || !Number.isFinite(state.expiresAt) || state.expiresAt <= state.startedAt) return undefined;
    return { rule, state };
  };
  const lifecycleExpired = (rule: StatusLifecycleRule, state: Record<string, any>, now = worldTime(env)) => {
      let expired = now >= state.expiresAt;
      if (rule.parameters.duration.unit === 'round') {
        const combat = values(env.game.combats).find(candidate => candidate.uuid === state.combatUuid)
          ?? (env.game.combat?.uuid === state.combatUuid ? env.game.combat : undefined);
        const endRound = state.startRound + rule.parameters.duration.value;
        if (combat && combat.started !== false && Number.isInteger(combat.round) && combat.round > 0 && Number.isInteger(combat.turn)) {
          expired = combat.round > endRound || (combat.round === endRound && combat.turn >= state.startTurn);
        }
      }
      return expired;
  };
  const expire = async () => {
    const now = worldTime(env);
    for (const entry of ports.entries()) {
      const valid = validEntry(entry);
      if (!valid || !lifecycleExpired(valid.rule, valid.state, now)) continue;
      live();
      await ports.remove(entry);
      ports.record('status-lifecycle-expired', { ruleId: valid.rule.id, groupId: entry.claim.groupId });
    }
  };

  const midiCompatible = () => {
    const module = env.game.modules?.get?.('midi-qol');
    return module?.active === true && module.version === '14.0.11' && typeof env.MidiQOL?.Workflow?.getWorkflow === 'function';
  };
  const attackLifecycle = (frame: PendingAttack, messageId: string) => {
    const startedAt = worldTime(env), duration = frame.rule.parameters.duration;
    const seconds = duration.value * (duration.unit === 'minute' ? 60 : roundTime(env));
    const combat = env.game.combat;
    if (duration.unit === 'round' && (!combat?.uuid || !Number.isInteger(combat.round) || combat.round < 1
      || !Number.isInteger(combat.turn) || !values(combat.combatants).some(entry => entry.tokenId === tokenId(frame.target)))) {
      ports.notify('按轮持续的状态需要目标处于已开始的当前战斗，本次请由 GM 处理。'); return;
    }
    return { version: 1, ruleSignature: JSON.stringify(frame.rule.parameters), startedAt, expiresAt: startedAt + seconds,
      messageId, targetTokenUuid: tokenUuid(frame.target), combatUuid: combat?.uuid ?? null,
      startRound: combat?.round ?? null, startTurn: combat?.turn ?? null };
  };
  const finishAttack = (frame: PendingAttack, messageId: string, hit: boolean, transport: 'native' | 'midi-qol', captured?: Record<string, any>) => {
    if (pending.get(frame.nonce) !== frame) return;
    pending.delete(frame.nonce);
    live(); ports.sourceToken(frame.rule, frame.activity);
    ports.record('status-lifecycle-attack', { ruleId: frame.rule.id, messageId, hit, transport, targetTokenUuid: tokenUuid(frame.target) });
    if (!hit) return;
    const lifecycle = captured ?? attackLifecycle(frame, messageId);
    if (!lifecycle) return;
    safely(async () => {
      ports.sourceToken(frame.rule, frame.activity);
      const target = env.canvas?.tokens?.get?.(tokenId(frame.target));
      if (tokenUuid(target) !== tokenUuid(frame.target) || target?.actor?.uuid !== frame.target.actor.uuid) throw new Error('攻击目标已变化，未施加状态。');
      if (lifecycleExpired(frame.rule, lifecycle)) {
        ports.record('status-lifecycle-expired-before-apply', { ruleId: frame.rule.id, messageId }); return;
      }
      await ports.apply(frame.rule, frame.source, target, lifecycle);
    });
  };
  const finishPersistedMidiAttack = (frame: PendingAttack) => {
    const result = frame.completion;
    if (!result || pending.get(frame.nonce) !== frame || !midiCompatible()) return;
    live();
    const message = env.game.messages?.get?.(result.messageId), flags = message?.flags?.['midi-qol'];
    const native = message?.flags?.dnd5e, targets = native?.targets;
    const currentTarget = env.canvas?.tokens?.get?.(tokenId(frame.target));
    const stored = values(message?.rolls).filter(roll => roll?.options?.['midi-qol']?.rollType === 'attack');
    // MIDI can defer its card update. Wait for the exact attack counter and persisted roll, never read its cached clone.
    if (!message || (message.author?.id ?? message.user?.id) !== frame.authorId || frame.authorId !== env.game.user.id
      || message.speaker?.actor !== (frame.source.actor.id ?? frame.source.actor.uuid.split('.').at(-1))
      || message.speaker?.token !== tokenId(frame.source)
      || native?.activity?.uuid !== frame.activity.uuid || native?.item?.uuid !== frame.activity.item.uuid
      || !Array.isArray(targets) || targets.length !== 1 || targets[0].uuid !== frame.target.actor.uuid
      || typeof targets[0].ac !== 'number' || !Number.isFinite(targets[0].ac)
      || tokenUuid(currentTarget) !== tokenUuid(frame.target) || currentTarget?.actor?.uuid !== frame.target.actor.uuid
      || flags?.messageType !== 'attack' || flags.activityUuid !== frame.activity.uuid
      || flags.attackingTokenUuid !== tokenUuid(frame.source) || flags.attackRollCount !== result.attackRollCount
      || flags.attackTotal !== result.total || flags.isHit !== result.hit
      || !Array.isArray(flags.targets) || flags.targets.length !== 1 || flags.targets[0]?.uuid !== tokenUuid(frame.target)
      || !Array.isArray(flags.hitTargetUuids) || flags.hitTargetUuids.length !== Number(result.hit)
      || (result.hit && flags.hitTargetUuids[0] !== tokenUuid(frame.target))
      || stored.length !== 1 || stored[0].total !== result.total || stored[0].formula !== result.formula
      || stored[0].isCritical !== result.critical || stored[0].isFumble !== result.fumble) return;
    finishAttack(frame, message.id, result.hit, 'midi-qol', result.lifecycle);
  };

  register('dnd5e.preRollAttack', (config: any, _dialog: any, message: any) => {
    if (stopped) return;
    const rule = ports.ruleForActivity(config?.subject);
    if (!rule) return;
    try {
      live();
      const source = ports.sourceToken(rule, config.subject);
      const targets = values(env.game.user?.targets);
      if (targets.length !== 1 || !targets[0]?.actor?.uuid || !tokenUuid(targets[0]) || !message?.data) {
        ports.notify('此能力的命中状态需要标记一个明确目标；本次仍正常攻击，特殊状态请由 GM 处理。');
        return;
      }
      const nonce = globalThis.crypto.randomUUID();
      const target = targets[0];
      const midiWorkflow = config.workflow;
      if (midiWorkflow && (!midiCompatible() || env.MidiQOL.Workflow.getWorkflow(midiWorkflow.id) !== midiWorkflow
        || midiWorkflow.activity?.uuid !== config.subject.uuid || typeof midiWorkflow.itemCardId !== 'string'
        || typeof midiWorkflow.id !== 'string')) {
        ports.notify('当前 Midi-QOL 命中流程尚未验证；本次特殊状态请由 GM 核对处理。'); return;
      }
      const frame: PendingAttack = { rule, activity: config.subject, source, target, authorId: env.game.user.id, nonce, midiWorkflow,
        midiWorkflowId: midiWorkflow?.id, midiMessageId: midiWorkflow?.itemCardId };
      pending.set(nonce, frame);
      if (pending.size > 256) pending.delete(pending.keys().next().value!);
      message.data.flags ??= {}; message.data.flags[SCOPE] ??= {};
      message.data.flags[SCOPE][ATTACK_FLAG] = { version: 1, nonce, targetTokenUuid: tokenUuid(target) };
      if (midiWorkflow) ports.record('status-lifecycle-midi-armed', { ruleId: rule.id, workflowId: midiWorkflow.id });
    } catch (error) { ports.notify(error instanceof Error ? error.message : String(error)); }
  });

  register('dnd5e.postAttackRollConfiguration', (rolls: any[], config: any, _dialog: any, message: any) => {
    const marker = message?.data?.flags?.[SCOPE]?.[ATTACK_FLAG], frame = pending.get(marker?.nonce);
    if (stopped || !frame?.midiWorkflow) return;
    if (!Array.isArray(rolls) || rolls.length !== 1 || !rolls[0] || typeof rolls[0] !== 'object'
      || config?.subject?.uuid !== frame.activity.uuid || config.workflow !== frame.midiWorkflow) { pending.delete(frame.nonce); return; }
    configuredMidiRolls.set(rolls[0], frame);
  });

  register('midi-qol.AttackRollComplete', (workflow: any) => {
    if (stopped || !workflow?.attackRoll || typeof workflow.attackRoll !== 'object') return;
    const frame = configuredMidiRolls.get(workflow.attackRoll);
    if (!frame) {
      const replaced = [...pending.values()].find(candidate => candidate.midiWorkflow === workflow);
      if (replaced) { pending.delete(replaced.nonce); ports.notify('本次攻击骰已被其他机制替换，特殊状态请由 GM 核对处理。'); }
      return;
    }
    if (pending.get(frame.nonce) !== frame) return;
    try {
      live();
      const roll = workflow.attackRoll, targets = values(workflow.targets), hits = values(workflow.hitTargets);
      if (!midiCompatible() || workflow !== frame.midiWorkflow || env.MidiQOL.Workflow.getWorkflow(workflow.id) !== workflow
        || workflow.id !== frame.midiWorkflowId || workflow.itemCardId !== frame.midiMessageId
        || workflow.aborted || workflow.activity?.uuid !== frame.activity.uuid || workflow.item?.uuid !== frame.activity.item.uuid
        || workflow.actor?.uuid !== frame.source.actor.uuid || tokenUuid(workflow.token) !== tokenUuid(frame.source)
        || targets.length !== 1 || tokenUuid(targets[0]) !== tokenUuid(frame.target) || targets[0]?.actor?.uuid !== frame.target.actor.uuid
        || hits.length > 1 || (hits.length === 1 && tokenUuid(hits[0]) !== tokenUuid(frame.target))
        || typeof roll.total !== 'number' || !Number.isFinite(roll.total) || typeof roll.formula !== 'string'
        || typeof roll.isCritical !== 'boolean' || typeof roll.isFumble !== 'boolean'
        || workflow.attackTotal !== roll.total || (hits.length === 1 && roll.isFumble)
        || !Number.isSafeInteger(workflow.attackRollCount) || workflow.attackRollCount < 1 || typeof workflow.itemCardId !== 'string') return;
      if (!frame.completion) {
        const lifecycle = hits.length === 1 ? attackLifecycle(frame, workflow.itemCardId) : undefined;
        if (hits.length === 1 && !lifecycle) { pending.delete(frame.nonce); return; }
        frame.completion = { messageId: workflow.itemCardId, hit: hits.length === 1, total: roll.total, formula: roll.formula,
          critical: roll.isCritical, fumble: roll.isFumble, attackRollCount: workflow.attackRollCount, lifecycle };
      }
      finishPersistedMidiAttack(frame);
    } catch (error) { ports.notify(error instanceof Error ? error.message : String(error)); }
  });
  register('updateChatMessage', (message: any) => {
    if (stopped) return;
    for (const frame of pending.values()) if (frame.completion?.messageId === message?.id) {
      try { finishPersistedMidiAttack(frame); } catch (error) { ports.notify(error instanceof Error ? error.message : String(error)); }
    }
  });

  register('dnd5e.postRollAttack', (rolls: any[], config: any) => {
    if (stopped || !Array.isArray(rolls) || rolls.length !== 1) return;
    const roll = rolls[0], message = roll?.parent;
    const marker = message?.flags?.[SCOPE]?.[ATTACK_FLAG];
    const frame = pending.get(marker?.nonce);
    if (!frame) return;
    if (frame.midiWorkflow) return; // MIDI owns the final hit decision, including its separate native-message option.
    try {
      live();
      const activity = config?.subject;
      const flags = message.flags?.dnd5e;
      const author = message.author?.id ?? message.user?.id;
      const targets = flags?.targets;
      const currentTarget = env.canvas?.tokens?.get?.(tokenId(frame.target));
      if (marker.version !== 1 || marker.targetTokenUuid !== tokenUuid(frame.target)
        || env.game.messages?.get?.(message.id) !== message || author !== frame.authorId || author !== env.game.user.id
        || activity?.uuid !== frame.activity?.uuid || activity?.item?.uuid !== frame.activity?.item?.uuid
        || activity?.actor?.uuid !== frame.source.actor.uuid
        || flags?.roll?.type !== 'attack' || flags?.activity?.uuid !== activity.uuid || flags?.item?.uuid !== activity.item.uuid
        || !Array.isArray(targets) || targets.length !== 1 || targets[0].uuid !== frame.target.actor.uuid
        || currentTarget?.actor?.uuid !== frame.target.actor.uuid || tokenUuid(currentTarget) !== tokenUuid(frame.target)
        || typeof targets[0].ac !== 'number' || !Number.isFinite(targets[0].ac)
        || typeof roll.total !== 'number' || !Number.isFinite(roll.total)
        || typeof roll.isCritical !== 'boolean' || typeof roll.isFumble !== 'boolean') {
        ports.notify('本次攻击消息、目标或命中结果不完整，未自动施加状态；请由 GM 核对。');
        return;
      }
      const hit = roll.isCritical || (!roll.isFumble && roll.total >= targets[0].ac);
      finishAttack(frame, message.id, hit, 'native');
    } catch (error) { ports.notify(error instanceof Error ? error.message : String(error)); }
  });

  onTurnEnd = (context: any) => {
    if (stopped) return;
    if (context?.event?.type === 'combatTurnStart') { safely(expire); return; }
    if (context?.event?.type !== 'combatTurnEnd' || typeof context.key !== 'string' || !context.token?.actor?.uuid) return;
    const ended = { key: context.key, tokenUuid: tokenUuid(context.token), actorUuid: context.token.actor.uuid,
      round: context.round, turn: context.turn, combatUuid: context.combatUuid ?? context.combat?.uuid };
    safely(async () => {
      await expire();
      for (const observed of ports.entries()) {
        const valid = validEntry(observed), state = valid?.state;
        if (!valid || state.targetTokenUuid !== ended.tokenUuid || observed.actor.uuid !== ended.actorUuid || state.lastTurnKey === ended.key) continue;
        if (state.combatUuid === ended.combatUuid && (ended.round < state.startRound || (ended.round === state.startRound && ended.turn < state.startTurn))) continue;
        live();
        await ports.update(observed, { ...state, lastTurnKey: ended.key });
        const entry = currentEntry(observed);
        if (!entry) continue;
        const repeat = valid.rule.parameters.repeatSave;
        if (repeat.optional) {
          const Dialog = env.DialogV2 ?? env.foundry?.applications?.api?.DialogV2;
          if (typeof Dialog?.confirm !== 'function') throw new Error('重复豁免确认窗口不可用，状态保持，请由 GM 处理。');
          const label = valid.rule.parameters.definition?.name ?? nativeLifecycleStatusLabel(valid.rule.parameters.status);
          const ability = {str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力'}[repeat.ability];
          const escape = (value: string) => value.replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
          const accepted = await Dialog.confirm({ window: { title: '回合结束 再次豁免' },
            content: `<p>${escape(String(observed.actor.name))}：${escape(valid.rule.itemName)} · ${escape(label)}</p><p>是否进行 DC ${repeat.dc} 的${ability}豁免？成功仅解除这项能力的本次效果。</p>`,
            yes: { label: '进行豁免' }, no: { label: '本回合跳过' }, rejectClose: false });
          live();
          if (accepted !== true) { ports.record('status-lifecycle-save-skipped', { groupId: entry.claim.groupId }); continue; }
        }
        await expire();
        if (!currentEntry(entry)) continue;
        const rolls = await observed.actor.rollSavingThrow({ ability: repeat.ability, target: repeat.dc }, { configure: true }, { rollMode: 'gmroll' });
        live();
        await expire();
        if (!currentEntry(entry)) continue;
        const result = Array.isArray(rolls) && rolls.length === 1 ? rolls[0] : undefined;
        if (typeof result?.total !== 'number' || !Number.isFinite(result.total)) {
          ports.record('status-lifecycle-save-cancelled', { groupId: entry.claim.groupId }); continue;
        }
        const success = result.total >= repeat.dc;
        ports.record('status-lifecycle-repeat-save', { groupId: entry.claim.groupId, ability: repeat.ability, dc: repeat.dc, total: result.total, success });
        if (success) { live(); await ports.remove(entry); }
      }
    });
  };
  register('updateWorldTime', () => { if (!stopped) safely(expire); });
  register('updateCombat', () => { if (!stopped) safely(expire); });
  register('deleteCombat', () => { if (!stopped) safely(expire); });
  safely(expire); // Rehydrated, already-expired claims must not await a new turn.
  return () => { stopped = true; pending.clear(); unsubscribe(); for (const [name, id] of hooks) env.Hooks.off(name, id); };
}
