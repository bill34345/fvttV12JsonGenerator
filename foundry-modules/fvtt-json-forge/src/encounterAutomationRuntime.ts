import { decodeStatusLifecycleParameters, NATIVE_LIFECYCLE_STATUSES, type StatusLifecycleParameters } from '@fvtt-json-generator/contracts/status-lifecycle';
import { configuredConditionFingerprint } from '@fvtt-json-generator/contracts/configured-conditions';
import { configuredConditionsApi } from './configuredConditions';
import { installStatusLifecycles, type StatusLifecycleRule } from './statusLifecycleRuntime';
import { ensureNativeStatusRiders } from './nativeStatusRiders';

/**
 * Fixed, data-only encounter automation for Foundry 14.364 / dnd5e 5.3.3.
 *
 * This is deliberately not a macro interpreter. The package compiler can
 * select one of the rule kinds below and provide its small parameter object;
 * attack/save statistics, damage and consumption come from the bound Item.
 * Repeated-save parameters are separately bound to the complete source quote.
 */

export const ENCOUNTER_AUTOMATION_FLAG_SCOPE = 'fvtt-json-forge';
export const ENCOUNTER_AUTOMATION_FLAG_KEY = 'encounterAutomation';
const HISTORY_LIMIT = 120;
const TURN_KEY_LIMIT = 480;
const DAMAGE_BRIDGE_TYPE = 'fixed-damage-observed-v1';
const damageBridgeClients = new WeakSet<object>();
const passiveLockClients = new WeakSet<object>();
const committedDamageOptions = new WeakMap<object, { actor: object; amount: number }>();

/** Pure read-only guard registered on every client so a player cannot use a GM-disabled Activity. */
export function installPassiveActivityLockGuard(env: EncounterAutomationEnvironment): void {
  if (!env?.game || passiveLockClients.has(env.game) || !env.Hooks?.on) return;
  if (!['14.364', '14.368'].includes(env.game.version) || env.game.system?.id !== 'dnd5e' || env.game.system?.version !== '5.3.3') return;
  passiveLockClients.add(env.game);
  env.Hooks.on('dnd5e.preUseActivity', (activity: any) => {
    const actor = activity?.item?.actor ?? activity?.actor;
    const identity = actor?.flags?.[ENCOUNTER_AUTOMATION_FLAG_SCOPE]?.encounter;
    const state = automationStates(actor).find(entry => entry.packageId === identity?.packageId && entry.packageHash === identity?.packageHash);
    if (identity?.version !== 1 || identity?.kind !== 'Actor' || state?.packageId !== identity.packageId || state?.packageHash !== identity.packageHash) return;
    const entries = Object.values(state.disabledActivities ?? {}).flat();
    if (entries.some((entry: any) => entry?.itemId === activity.item?.id && entry?.activityId === activity.id)) return false;
  });
}

/** Runs on every client. Post-apply records a bounded Actor document fact for the active GM. */
export function installEncounterDamageBridge(env: EncounterAutomationEnvironment): void {
  if (!env?.game || damageBridgeClients.has(env.game) || !env.Hooks?.on) return;
  if (!['14.364', '14.368'].includes(env.game.version) || env.game.system?.id !== 'dnd5e' || env.game.system?.version !== '5.3.3') return;
  damageBridgeClients.add(env.game);
  type DamageIntent = { actor: any; hp: number; temp: number; tempMax: number; expectedHp: number; expectedTemp: number; expectedTempMax: number; updates: any; committed: boolean; stamp?: string; stampedGroups?: string[] };
  const before = new WeakMap<object, DamageIntent>();
  const pending = new Map<any, Set<DamageIntent>>();
  const writes = new WeakMap<object, Promise<void>>();
  const stampPath = `flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.encounterDamageStamp`;
  const damageGroups = (actor: any): string[] => {
    const groups = new Set<string>();
    for (const owner of automationStates(actor)) for (const claims of Object.values(owner?.fixedNativeClaims ?? {}) as any[]) for (const claim of claims ?? []) if (claim?.removeOnDamage && typeof claim.groupId === 'string') groups.add(claim.groupId);
    for (const effect of collectionValues(actor.effects)) {
      const claim = effect?.flags?.[ENCOUNTER_AUTOMATION_FLAG_SCOPE]?.[ENCOUNTER_AUTOMATION_FLAG_KEY]?.fixedEffect;
      if (claim?.removeOnDamage && typeof claim.groupId === 'string') groups.add(claim.groupId);
    }
    return [...groups];
  };
  env.Hooks.on('dnd5e.preApplyDamage', (actor: any, amount: any, updates: any, options: any) => {
    if (!actor?.uuid || !options || typeof options !== 'object') return;
    committedDamageOptions.delete(options);
    const hp = actor.system?.attributes?.hp;
    const expectedHp = Number(updates?.['system.attributes.hp.value'] ?? updates?.system?.attributes?.hp?.value);
    const expectedTemp = Number(updates?.['system.attributes.hp.temp'] ?? updates?.system?.attributes?.hp?.temp);
    const expectedTempMax = Number(updates?.['system.attributes.hp.tempmax'] ?? updates?.system?.attributes?.hp?.tempmax ?? hp?.tempmax ?? 0);
    if (![hp?.value,hp?.temp ?? 0,hp?.tempmax ?? 0,expectedHp,expectedTemp,expectedTempMax].every((value) => Number.isFinite(Number(value)))) return;
    const intent = { actor, hp: Number(hp.value), temp: Number(hp.temp ?? 0), tempMax: Number(hp.tempmax ?? 0), expectedHp, expectedTemp, expectedTempMax, updates, committed: false };
    const nativeKeys = ['system.attributes.hp.value','system.attributes.hp.temp','system.attributes.hp.tempmax'].sort().join('|');
    if (Number(amount) > 0 && intent.hp === 0 && intent.temp === 0 && expectedHp === 0 && expectedTemp === 0
      && expectedTempMax === intent.tempMax && Object.keys(updates).sort().join('|') === nativeKeys) {
      const groups = damageGroups(actor);
      if (groups.length) {
        const stamp = globalThis.crypto.randomUUID();
        updates[stampPath] = stamp;
        Object.assign(intent, { stamp, stampedGroups: groups });
      }
    }
    before.set(options, intent);
    const entries = pending.get(actor) ?? new Set(); entries.add(intent); pending.set(actor, entries);
  });
  env.Hooks.on('updateActor', (actor: any, changes: any, _options: any, userId: string) => {
    if (userId !== env.game.user?.id) return;
    const touchedHp = changes?.['system.attributes.hp.value'] !== undefined || changes?.['system.attributes.hp.temp'] !== undefined
      || changes?.system?.attributes?.hp?.value !== undefined || changes?.system?.attributes?.hp?.temp !== undefined;
    if (!touchedHp) return;
    for (const intent of pending.get(actor) ?? []) {
      if (Number(actor.system?.attributes?.hp?.value) === intent.expectedHp && Number(actor.system?.attributes?.hp?.temp ?? 0) === intent.expectedTemp) intent.committed = true;
    }
  });
  env.Hooks.on('dnd5e.applyDamage', (actor: any, amount: any, options: any) => {
    if (!options || typeof options !== 'object') return;
    const prior = before.get(options); before.delete(options);
    if (prior) { pending.get(prior.actor)?.delete(prior); if (!pending.get(prior.actor)?.size) pending.delete(prior.actor); }
    const hp = actor?.system?.attributes?.hp;
    const committedStamp = prior?.stamp && (actor?.getFlag?.(ENCOUNTER_AUTOMATION_FLAG_SCOPE, 'encounterDamageStamp')
      ?? actor?.flags?.[ENCOUNTER_AUTOMATION_FLAG_SCOPE]?.encounterDamageStamp) === prior.stamp;
    const noOpAtZero = Number(amount) > 0 && Boolean(committedStamp) && prior?.hp === 0 && prior?.temp === 0 && prior?.tempMax === Number(hp?.tempmax ?? 0)
      && prior?.expectedHp === 0 && prior?.expectedTemp === 0 && prior?.expectedTempMax === prior?.tempMax
      && Number(hp?.value) === 0 && Number(hp?.temp ?? 0) === 0
      && prior.updates && Object.keys(prior.updates).sort().join('|') === [
        'system.attributes.hp.value','system.attributes.hp.temp','system.attributes.hp.tempmax',stampPath,'_id',
      ].sort().join('|')
      && prior.updates._id === actor.id
      && Number(prior.updates['system.attributes.hp.value']) === 0
      && Number(prior.updates['system.attributes.hp.temp']) === 0
      && Number(prior.updates['system.attributes.hp.tempmax']) === prior.tempMax
      && prior.updates[stampPath] === prior.stamp;
    if ((!prior?.committed && !noOpAtZero) || prior?.actor !== actor || !Number.isFinite(Number(amount)) || !Number.isFinite(Number(hp?.value)) || !Number.isFinite(Number(hp?.temp ?? 0))) return;
    if (Number(amount) > 0) {
      const observation = { actor, amount: Number(amount) };
      committedDamageOptions.set(options, observation);
      // Every package receives this synchronous hook dispatch. An unrelated
      // controller must not consume another package's committed observation.
      queueMicrotask(() => {
        if (committedDamageOptions.get(options) === observation) committedDamageOptions.delete(options);
      });
    }
    if (env.game.users?.activeGM?.id === env.game.user?.id || Number(amount) <= 0 || typeof actor?.setFlag !== 'function') return;
    const groups = noOpAtZero ? prior.stampedGroups ?? [] : damageGroups(actor);
    if (!groups.length) return;
    const fact = {
      type: DAMAGE_BRIDGE_TYPE, eventId: noOpAtZero ? prior.stamp! : globalThis.crypto.randomUUID(), actorUuid: actor.uuid,
      amount: Number(amount), beforeHp: prior.hp, beforeTemp: prior.temp, afterHp: Number(hp.value), afterTemp: Number(hp.temp ?? 0),
      beforeTempMax: prior.tempMax, afterTempMax: Number(hp.tempmax ?? 0), noOpAtZero,
      groupIds: groups,
    };
    const priorWrite = writes.get(actor) ?? Promise.resolve();
    const next = priorWrite.catch(() => {}).then(() => actor.setFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, 'encounterDamageFact', fact));
    writes.set(actor, next);
    void next.catch((error: unknown) => env.notify?.('error', `伤害事实未写入：${error instanceof Error ? error.message : String(error)}`));
  });
}

export type SaveSummonParameters = {
  summonedActorKey: string;
  count: 1;
  placement: 'adjacent-target';
  outcome: 'always';
  failedStatus?: 'dazed';
  statusExpiry?: 'next-target-turn-end';
  followupRuleId?: string;
  followupAtHalfHp?: boolean;
};

export type TurnStartAreaParameters = {
  radiusFeet: number;
  excludeSelf: true;
  aliveOnly: true;
  followupRuleId?: string;
};

export type StagedCorruptionParameters = {
  marker: string;
  label: string;
  repeatExhaustion: 1;
};

export type ThresholdWardParameters = {
  threshold: number;
  fullReduction: 'half-floor';
  weakenedReduction: 'proficiency';
  breakRuleId: string;
};

export type WardBreakParameters = {
  wardRuleId: string;
  until: 'own-next-turn-start';
  whenDepleted: 'weakened';
};
export type SaveFailureEffectParameters = {
  effect: 'blinded' | 'slowed' | 'paralyzed' | 'str-dex-disadvantage';
  expiry: 'next-source-turn-start' | 'next-source-turn-end' | 'next-target-turn-end' | 'hp-recovery';
  minFailureMargin: 1 | 5;
  removeOnDamage: boolean;
};
export type GmActivityLockParameters = { activityItemNames: string[] };

export type EncounterAutomationRule =
  | StatusLifecycleRule
  | { id: string; kind: 'save-summon'; actorKey: string; itemName: string; parameters: SaveSummonParameters }
  | { id: string; kind: 'turn-start-area'; actorKey: string; itemName: string; parameters: TurnStartAreaParameters }
  | { id: string; kind: 'staged-corruption'; actorKey: string; itemName: string; parameters: StagedCorruptionParameters }
  | { id: string; kind: 'threshold-ward'; actorKey: string; itemName: string; parameters: ThresholdWardParameters }
  | { id: string; kind: 'ward-break'; actorKey: string; itemName: string; parameters: WardBreakParameters }
  | { id: string; kind: 'save-failure-effect'; actorKey: string; itemName: string; parameters: SaveFailureEffectParameters }
  | { id: string; kind: 'gm-activity-lock'; actorKey: string; itemName: string; parameters: GmActivityLockParameters }
  | { id: string; kind: 'gm-manual'; actorKey: string; itemName: string; parameters: Record<string, never> };

/** Public compiler boundary. Runtime validation narrows `parameters` before any Hook is registered. */
export interface EncounterAutomationConfig {
  version: 1;
  rules: Array<{ id: string; kind: EncounterAutomationRule['kind']; actorKey: string; itemName: string; parameters: unknown }>;
  legendaryRecovery: Array<{ actorKey: string; max: number; when: 'own-turn-start' }>;
}

type ValidatedEncounterAutomationConfig = {
  version: 1;
  rules: EncounterAutomationRule[];
  legendaryRecovery: Array<{ actorKey: string; max: number; when: 'own-turn-start' }>;
};
type ValidatedInstallOptions = Omit<EncounterAutomationInstallOptions, 'config'> & { config: ValidatedEncounterAutomationConfig };

export interface EncounterAutomationInstallOptions {
  packageId: string;
  packageHash: string;
  bindings: Record<string, string>;
  config: EncounterAutomationConfig;
}

/**
 * The runtime only asks for Foundry browser objects. Deliberately keeping this
 * structural makes the production wrapper thin and lets the semantic tests use
 * offline document doubles; it is not an extension or scripting port.
 */
export interface EncounterAutomationEnvironment {
  game: any;
  Hooks: { on(name: string, callback: (...args: any[]) => unknown): unknown; off(name: string, id: unknown): void };
  canvas: any;
  fromUuid(uuid: string): Promise<any>;
  CONFIG?: any;
  DialogV2?: any;
  foundry?: any;
  ui?: any;
  chooseAdjacentPlacement?: (input: {
    source: any; target: any; rule: EncounterAutomationRule; candidates: TokenPosition[];
  }) => Promise<TokenPosition | null>;
  notify?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export interface EncounterAutomationHistoryEntry {
  at: number;
  type: string;
  detail: Record<string, unknown>;
}

export interface EncounterAutomationHandle {
  readonly packageId: string;
  readonly packageHash: string;
  readonly history: readonly EncounterAutomationHistoryEntry[];
  showPanel(): unknown;
  stop(): void;
  settle(): Promise<void>;
  executeSaveSummon(ruleId: string, source: any, target: any): Promise<unknown>;
  executeTurnStartArea(ruleId: string, source: any, combat: any): Promise<unknown>;
  executeStagedCorruption(ruleId: string, target: any): Promise<unknown>;
  executeSaveFailureEffect(ruleId: string, source: any, target: any): Promise<unknown>;
  setActivityDisabled(ruleId: string, source: any, itemName: string, disabled: boolean): Promise<void>;
  getWardState(ruleId: string, actor: any): 'full' | 'weakened' | 'broken';
}

type TokenPosition = { x: number; y: number; w: number; h: number };
type TurnSnapshot = { id: string | null; tokenId: string | null; round: number; turn: number | null };
type WardState = { state: 'full' | 'weakened' | 'broken'; until?: { tokenId: string; round: number } };

const installations = new WeakMap<object, Map<string, { signature: string; handle: EncounterAutomationHandle }>>();
const actorEffectWrites = new WeakMap<object, Promise<unknown>>();
const actorFlagWrites = new WeakMap<object, Promise<unknown>>();
async function serializeActorWrite<T>(queues: WeakMap<object, Promise<unknown>>, actor: object, operation: () => Promise<T>): Promise<T> {
  const prior = queues.get(actor) ?? Promise.resolve();
  const run = prior.catch(() => {}).then(operation);
  const tail = run.then(() => {}, () => {});
  queues.set(actor, tail);
  try { return await run; } finally { if (queues.get(actor) === tail) queues.delete(actor); }
}
function automationStates(document: any): any[] {
  const raw = document?.getFlag?.(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY)
    ?? document?.flags?.[ENCOUNTER_AUTOMATION_FLAG_SCOPE]?.[ENCOUNTER_AUTOMATION_FLAG_KEY];
  if (!raw) return [];
  const states = Array.isArray(raw.packages) ? raw.packages.filter((entry: any) => typeof entry?.packageId === 'string' && typeof entry?.packageHash === 'string') : [];
  if (raw.packageId && raw.packageHash && !states.some((entry: any) => entry.packageId === raw.packageId && entry.packageHash === raw.packageHash)) states.push(raw);
  return states.map((state: any) => state.fixedNativeClaims ? { ...state, fixedNativeClaims: readNativeClaimMap(state.fixedNativeClaims) } : state);
}
/** Foundry expands configured.<slug> flag keys into nested objects during writes. */
function readNativeClaimMap(raw: unknown): Record<string, any[]> {
  if (!plainRecord(raw)) return {};
  const claims: Record<string, any[]> = Object.fromEntries(Object.entries(raw).filter(([, value]) => Array.isArray(value)));
  if (plainRecord(raw.configured)) for (const [slug, value] of Object.entries(raw.configured)) {
    if (/^[a-z][a-z0-9-]{0,63}$/u.test(slug) && Array.isArray(value)) claims[`configured.${slug}`] = value;
  }
  return claims;
}
function moduleOwnsNativeStatus(effect: any, status: string): boolean {
  return automationStates(effect).some(state => state.ownedNativeStatus === status);
}

export async function installEncounterAutomation(
  env: EncounterAutomationEnvironment,
  options: EncounterAutomationInstallOptions,
  recovery: { resumeExisting?: boolean } = {},
): Promise<EncounterAutomationHandle> {
  assertEnvironment(env);
  const normalized = validateInstallOptions(options);
  const signature = stableStringify(normalized);
  const byPackage = installations.get(env.game) ?? new Map();
  installations.set(env.game, byPackage);
  const existing = byPackage.get(`${normalized.packageId}\u0000${normalized.packageHash}`);
  if (existing) {
    if (existing.signature !== signature) throw new Error('同一生物导入文件已启动，但绑定或固定规则已经变化；请先停止旧控制器。');
    return existing.handle;
  }

  const actors = new Map<string, any>();
  for (const [key, uuid] of Object.entries(normalized.bindings)) {
    const actor = await env.fromUuid(uuid);
    assertBoundActor(actor, key, uuid, normalized);
    actors.set(key, actor);
  }
  for (const recovery of normalized.config.legendaryRecovery) {
    const actor=actors.get(recovery.actorKey),nativeMax = numeric(actor?.system?.resources?.legact?.max, `绑定角色 ${recovery.actorKey} 的原生传奇动作上限`);
    const ledger=actor?.flags?.fvttJsonGenerator?.sourceLegendaryLedger;
    if(ledger!==undefined){
      const raw=actor?._source?.system?.resources,lair=actor?.system?.resources?.lair;
      const expected=ledger.max+Number(lair?.value===true&&lair?.inside===true);
      if(ledger.version!==1||ledger.max!==recovery.max||ledger.lairMax!==ledger.max+1||ledger.recovery!=='own-turn-start'
        ||raw?.legact?.max!==ledger.max||raw?.lair?.value!==true||lair?.value!==true||typeof raw?.lair?.inside!=='boolean'||raw.lair.inside!==lair?.inside||nativeMax!==expected)
        throw new Error(`绑定角色 ${recovery.actorKey} 的来源传奇资源与当前巢穴模式不一致。`);
    }else if (nativeMax !== recovery.max) throw new Error(`绑定角色 ${recovery.actorKey} 的原生传奇动作上限与固定配置不一致。`);
  }
  for (const rule of normalized.config.rules) {
    if (rule.kind === 'status-lifecycle') {
      // Existing applied snapshots must still expire/save after a catalog edit.
      // New applications independently recheck the current reviewed definition.
      if (rule.parameters.definition) configuredConditionsApi(env.game, recovery.resumeExisting ? undefined : rule.parameters.definition);
      const module = env.game.modules?.get?.('fvtt-trigger-engine');
      if (!module?.active || module.api?.apiVersion !== 1 || typeof module.api.subscribe !== 'function'
        || (!rule.parameters.definition && !configuredStatusEffect(env.CONFIG?.statusEffects, rule.parameters.status))
        || typeof env.game.time?.worldTime !== 'number' || !Number.isFinite(env.game.time.worldTime)) {
        throw new Error('通用状态生命周期需要兼容的 Trigger Engine、原生状态和世界时间。');
      }
      const actor = actors.get(rule.actorKey);
      const items = collectionValues(actor?.items).filter((item: any) => item?.name === rule.itemName);
      if (items.length !== 1 || collectionValues(items[0].system?.activities).filter((activity: any) => activity?.type === 'attack' || activity?.attack).length !== 1) {
        throw new Error(`通用状态规则 ${rule.id} 需要唯一原生 Attack Activity。`);
      }
    }
    if (rule.kind !== 'save-failure-effect' && rule.kind !== 'gm-activity-lock' && rule.kind !== 'gm-manual') continue;
    const actor = actors.get(rule.actorKey);
    const names = rule.kind === 'gm-activity-lock' ? [rule.itemName, ...rule.parameters.activityItemNames] : [rule.itemName];
    for (const name of names) {
      const items = collectionValues(actor?.items).filter((item: any) => item?.name === name);
      if (items.length !== 1) throw new Error(`固定规则 ${rule.id} 缺少唯一原生物品“${name}”。`);
      if (name !== rule.itemName || rule.kind === 'save-failure-effect') {
        const activities = collectionValues(items[0]?.system?.activities).filter((activity: any) => activity?.save);
        if (activities.length !== 1) throw new Error(`固定规则 ${rule.id} 的“${name}”需要唯一原生 Save Activity。`);
      }
    }
  }

  let stopped = false;
  const stopController = new AbortController();
  let queue = Promise.resolve();
  const hooks: Array<[string, unknown]> = [];
  const history: EncounterAutomationHistoryEntry[] = [];
  const turnSnapshots = new Map<string, TurnSnapshot>();
  const completedTurns = new Set<string>();
  const bypassedUses = new Set<string>();
  const observedHp = new WeakMap<object, { hp: number; temp: number }>();
  const consumedDamageObservations = new WeakSet<object>();
  const damageTransitions = new Map<string, Array<{ beforeHp: number; beforeTemp: number; afterHp: number; afterTemp: number; modifiedTime: number; at: number; groups: string[] }>>();
  const processedDamageFacts = new Set<string>();
  const pendingDamageFacts = new Map<string, { actor: any; fact: any; userId: string; at: number }>();

  const addHistory = (type: string, detail: Record<string, unknown> = {}) => {
    history.push({ at: Date.now(), type, detail });
    if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  };
  const notify = (level: 'info' | 'warn' | 'error', message: string) => {
    env.notify?.(level, message);
    addHistory(`notice:${level}`, { message });
  };
  const enqueue = (operation: () => Promise<unknown>) => {
    queue = queue.then(async () => { if (!stopped && isActiveGm(env)) await operation(); })
      .catch((error) => notify('error', error instanceof Error ? error.message : String(error)));
  };
  const register = (name: string, callback: (...args: any[]) => unknown) => {
    hooks.push([name, env.Hooks.on(name, callback)]);
  };
  const assertLive = () => {
    if (stopped) throw new Error('战斗控制器已停止。');
    assertEnvironment(env);
    if (!isActiveGm(env)) throw new Error('只有当前活动 GM 可以执行战斗自动化。');
  };
  const boundKey = (actor: any): string | undefined => {
    for (const [key, bound] of actors) if (sameActor(actor, bound, normalized.bindings[key]!)) return key;
    return undefined;
  };
  const matchingRule = <K extends EncounterAutomationRule['kind']>(activity: any, kind: K): Extract<EncounterAutomationRule, { kind: K }> | undefined => {
    if (activity?.flags?.fvttJsonGenerator?.behaviorOperation) return undefined;
    if (kind === 'save-summon' && (!activity?.save || !activity?.damage)) return undefined;
    const actorKey = boundKey(activity?.item?.actor ?? activity?.actor);
    if (!actorKey || typeof activity?.item?.name !== 'string') return undefined;
    return normalized.config.rules.find((rule) => rule.kind === kind && rule.actorKey === actorKey && rule.itemName === activity.item.name) as Extract<EncounterAutomationRule, { kind: K }> | undefined;
  };
  const activityKey = (activity: any) => `${boundKey(activity?.item?.actor ?? activity?.actor) ?? 'foreign'}:${activity?.item?.id ?? activity?.item?.name ?? ''}:${activity?.id ?? ''}`;

  const resolveItem = (rule: EncounterAutomationRule, source?: any): any => {
    const actor = source?.actor ?? source ?? actors.get(rule.actorKey);
    if (!sameActor(actor, actors.get(rule.actorKey), normalized.bindings[rule.actorKey]!)) throw new Error(`规则 ${rule.id} 的来源不是绑定角色。`);
    const matches = collectionValues(actor?.items).filter((item: any) => item?.name === rule.itemName);
    if (matches.length !== 1) throw new Error(`绑定角色 ${rule.actorKey} 未包含唯一的原生物品“${rule.itemName}”。`);
    return matches[0];
  };
  const resolveSaveActivity = (rule: EncounterAutomationRule, source?: any): any => {
    const item = resolveItem(rule, source);
    const activities = collectionValues(item?.system?.activities);
    const candidates = activities.filter((activity: any) => activity?.save && (rule.kind === 'save-failure-effect' || activity?.damage));
    if (candidates.length !== 1) throw new Error(`原生物品“${rule.itemName}”必须有且仅有一个含豁免和伤害的活动。`);
    return candidates[0];
  };
  const nativeSave = async (activity: any, target: any): Promise<{ success: boolean; total: number; dc: number }> => {
    const save = activity?.save;
    const ability = firstValue(save?.ability);
    const dc = numeric(save?.dc?.value ?? save?.dc?.formula, `原生物品“${activity?.item?.name ?? ''}”的豁免 DC`);
    if (typeof ability !== 'string' || !ability) throw new Error(`原生物品“${activity?.item?.name ?? ''}”没有唯一的豁免属性。`);
    const results = await target.actor.rollSavingThrow({ ability, target: dc, rolls: [{ options: {} }] }, { configure: false }, { rollMode: 'gmroll' });
    const roll = Array.isArray(results) ? results[0] : results;
    const total = numeric(roll?.total, '原生豁免结果');
    return { success: total >= dc, total, dc };
  };
  const rollDamage = async (activity: any): Promise<any[]> => {
    const parts = collectionValues(activity?.damage?.parts);
    if (parts.length === 0) return [];
    const DamageRoll = env.CONFIG?.Dice?.DamageRoll;
    if (typeof DamageRoll !== 'function') throw new Error('dnd5e 原生 DamageRoll 不可用，未结算伤害。');
    const rollData = activity.item?.actor?.getRollData?.() ?? {};
    const damages: any[] = [];
    for (const part of parts) {
      const formula = part?.formula;
      const types = collectionValues(part?.types);
      if (typeof formula !== 'string' || !formula || types.length !== 1 || typeof types[0] !== 'string') {
        throw new Error(`原生活动“${activity?.item?.name ?? ''}”的伤害部分不是可结算的单一类型。`);
      }
      const roll = await new DamageRoll(formula, rollData, { type: types[0] }).evaluate();
      damages.push({ value: numeric(roll?.total, '原生伤害结果'), type: types[0], properties: new Set() });
    }
    return damages;
  };
  const applySaveDamage = async (activity: any, target: any, save: { success: boolean }) => {
    const damages = await rollDamage(activity);
    assertLive();
    const onSave = activity?.damage?.onSave ?? 'half';
    const multiplier = !save.success ? 1 : onSave === 'half' ? 0.5 : onSave === 'none' ? 0 : onSave === 'full' ? 1 : invalidOnSave(onSave);
    if (damages.length && multiplier !== 0) await target.actor.applyDamage(damages, { multiplier });
    return { damages, multiplier };
  };
  const conditionApi = () => {
    const module = env.game?.modules?.get?.('fvtt-custom-conditions');
    const api = module?.api;
    if (!module?.active || typeof api?.apply !== 'function' || typeof api?.remove !== 'function' || typeof api?.list !== 'function') throw new Error('Custom Conditions 未启用或公开 API 不可用；未使用原生活动。');
    return api;
  };
  const ownedEffect = (effect: any): any => effectState(effect)?.fixedEffect;
  const nativeClaims = (actor: any): Record<string, any[]> => stateFor(actor)?.fixedNativeClaims ?? {};
  const ownedGroups = (actor: any, predicate: (state: any) => boolean): string[] => {
    const states = [...collectionValues(actor?.effects).map(ownedEffect), ...Object.values(nativeClaims(actor)).flat()];
    return [...new Set(states.filter((state: any) => state?.groupId && predicate(state)).map((state: any) => state.groupId))] as string[];
  };
  const seedObservedHp = () => {
    const candidates = [...(env.canvas?.tokens?.placeables ?? []).map((token: any) => token?.actor), ...collectionValues(env.game?.actors)];
    for (const actor of new Set(candidates.filter(Boolean))) {
      if (!ownedGroups(actor, () => true).length) continue;
      const hp = actor.system?.attributes?.hp;
      if (Number.isFinite(Number(hp?.value)) && Number.isFinite(Number(hp?.temp ?? 0))) observedHp.set(actor, { hp: Number(hp.value), temp: Number(hp.temp ?? 0) });
    }
  };
  const ensureNativeStatus = async (actor: any, status: StatusLifecycleParameters['status']): Promise<any> => {
    assertLive();
    // Own an independent, indefinite projection even when a foreign spell already
    // supplies the status; its expiry must not suppress this package's claims.
    const projection = collectionValues(actor.effects).find((entry: any) => moduleOwnsNativeStatus(entry, status));
    if (projection) {
      if (projection.disabled) await projection.update({ disabled: false });
      return undefined;
    }
    const configured = configuredStatusEffect(env.CONFIG?.statusEffects, status);
    if (!configured) throw new Error(`Foundry 缺少原生状态 ${status}。`);
    const canonical = collectionValues(actor.effects).find((entry: any) => entry?.id === configured._id || entry?._id === configured._id);
    const ActiveEffect = nativeActiveEffectClass(env);
    const document = await ActiveEffect.fromStatusEffect(status, { parent: actor });
    assertLive();
    if (!document?.updateSource || !document?.toObject) throw new Error('原生状态工厂不可用。');
    const label = String(document.name ?? configured.name ?? status);
    // dnd5e creates unconscious's independent prone rider only when the canonical
    // prone ID is free. A timed Forge claim must never occupy that rider identity.
    document.updateSource({ ...(canonical || status === 'prone' ? { _id: globalThis.crypto.randomUUID().replaceAll('-', '').slice(0,16) } : {}),
      name: `${label} Forge`, flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { [ENCOUNTER_AUTOMATION_FLAG_KEY]: packageState({ ownedNativeStatus: status }) } } });
    const created = await ActiveEffect.create(document.toObject(), { parent: actor, keepId: true });
    if (!created) throw new Error('原生状态未创建。');
    return created;
  };
  const removeOwnedGroup = async (actor: any, groupId: string) => serializeActorWrite(actorEffectWrites, actor, async () => {
    assertLive();
    const effects = collectionValues(actor?.effects).filter((effect: any) => ownedEffect(effect)?.groupId === groupId);
    const api = effects.some((effect: any) => ownedEffect(effect)?.custom) ? conditionApi() : undefined;
    for (const effect of effects) {
      if (ownedEffect(effect)?.custom) await api.remove(actor, effect.id);
      else await actor.deleteEmbeddedDocuments('ActiveEffect', [effect.id]);
    }
    const claims = nativeClaims(actor);
    for (const [status, entries] of Object.entries(claims)) {
      if (!Array.isArray(entries)) continue;
      if (!claims[status]?.some((claim: any) => claim.groupId === groupId)) continue;
      const configuredClaim = entries.find((claim: any) => claim.groupId === groupId && claim.configuredInstanceId);
      if (configuredClaim) await configuredConditionsApi(env.game).remove(actor, configuredClaim.configuredInstanceId);
      const remaining = claims[status]!.filter((claim: any) => claim.groupId !== groupId);
      await setState(actor, { ...(stateFor(actor) ?? packageState({})), fixedNativeClaims: { ...nativeClaims(actor), [status]: remaining } });
      if (configuredClaim) continue;
      const anyClaims = automationStates(actor).some(state => state.fixedNativeClaims?.[status]?.length);
      if (anyClaims) await ensureNativeStatus(actor, status);
      else {
        const owned = collectionValues(actor.effects).find((effect: any) => moduleOwnsNativeStatus(effect, status));
        if (owned) await actor.deleteEmbeddedDocuments('ActiveEffect', [owned.id]);
      }
    }
  });
  const validateFailureTarget = (rule: Extract<EncounterAutomationRule, { kind: 'save-failure-effect' }>, target: any) => {
    assertSceneToken(target);
    const statuses = rule.parameters.effect === 'str-dex-disadvantage' ? ['fvtt-custom-conditions.enfeebled', 'fvtt-custom-conditions.clumsy']
      : rule.parameters.effect === 'slowed' ? ['fvtt-custom-conditions.slowed'] : [rule.parameters.effect];
    const immunities = collectionValues(target.actor?.system?.traits?.ci?.value);
    const immune = statuses.some((status) => immunities.includes(status) || immunities.includes(status.split('.').at(-1)));
    if (statuses.some((status) => status.startsWith('fvtt-custom-conditions.'))) {
      const api = conditionApi();
      const definitions = api.definitions?.() ?? [];
      if (statuses.some((status) => !collectionValues(definitions).some((definition: any) => definition?.id === status.split('.')[1]))) throw new Error('Custom Conditions 缺少所需条件定义；未使用原生活动。');
    } else if (!configuredStatusEffect(env.CONFIG?.statusEffects, statuses[0]!)) throw new Error('Foundry 缺少所需原生状态；未使用原生活动。');
    return immune;
  };
  const applyFixedEffect = async (rule: Extract<EncounterAutomationRule, { kind: 'save-failure-effect' }>, source: any, target: any, combat: any) => serializeActorWrite(actorEffectWrites, target.actor, async () => {
    assertLive();
    const { effect, expiry, removeOnDamage } = rule.parameters;
    const anchorTokenId = expiry === 'next-target-turn-end' ? target.id : source.id;
    const anchor = expiry === 'hp-recovery' ? undefined : expiry === 'next-source-turn-start'
      ? nextOwnTurnStart(combat, anchorTokenId) : nextTargetTurnEnd(combat, anchorTokenId);
    const event = expiry === 'next-source-turn-start' ? 'start' : 'end';
    const groupId = globalThis.crypto.randomUUID();
    const claim = { ruleId: rule.id, groupId, sourceActorUuid: source.actor.uuid, sourceTokenId: source.id,
      targetActorUuid: target.actor.uuid, targetTokenId: target.id,
      expiry, anchor, event, removeOnDamage, custom: effect === 'slowed' || effect === 'str-dex-disadvantage' };
    const state = packageState({ fixedEffect: claim });
    const created: any[] = [];
    try {
      if (effect === 'blinded' || effect === 'paralyzed') {
        const result = await ensureNativeStatus(target.actor, effect);
        if (result) created.push(result);
        await setState(target.actor, { ...(stateFor(target.actor) ?? packageState({})), fixedNativeClaims: {
          ...nativeClaims(target.actor), [effect]: [...(nativeClaims(target.actor)[effect] ?? []), claim],
        } });
      } else {
        const api = conditionApi();
        const ids = effect === 'slowed' ? ['slowed'] : ['enfeebled', 'clumsy'];
        for (const id of ids) {
          const result = await api.apply(target.actor, id, {}, { stacking: 'stack', origin: `forge:${normalized.packageId}:${normalized.packageHash}:${rule.id}:${groupId}` });
          if (!result?.id) throw new Error(`Custom Conditions 未创建 ${id}。`);
          created.push(result);
          await result.update({ [`flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.${ENCOUNTER_AUTOMATION_FLAG_KEY}`]: state });
        }
      }
      observedHp.set(target.actor, { hp: Number(target.actor.system?.attributes?.hp?.value ?? 0), temp: Number(target.actor.system?.attributes?.hp?.temp ?? 0) });
      addHistory('fixed-effect-applied', { ruleId: rule.id, sourceTokenId: source.id, targetTokenId: target.id, groupId, effect });
      return true;
    } catch (error) {
      for (const entry of created.reverse()) {
        if (effect === 'blinded' || effect === 'paralyzed') await target.actor.deleteEmbeddedDocuments('ActiveEffect', [entry.id]);
        else await conditionApi().remove(target.actor, entry.id);
      }
      if (effect === 'blinded' || effect === 'paralyzed') {
        const claims = nativeClaims(target.actor)[effect] ?? [];
        if (claims.some((entry: any) => entry.groupId === groupId)) await setState(target.actor, { ...(stateFor(target.actor) ?? packageState({})), fixedNativeClaims: { ...nativeClaims(target.actor), [effect]: claims.filter((entry: any) => entry.groupId !== groupId) } });
      }
      throw error;
    }
  });
  const executeSaveFailureEffect = async (ruleId: string, source: any, targetInput: any, interceptedActivity?: any, usageConfig: any = {}) => {
    assertLive();
    const rule = ruleById(normalized.config, ruleId, 'save-failure-effect');
    assertSourceToken(source, rule.actorKey, boundKey);
    const targets = Array.isArray(targetInput) ? targetInput : [targetInput];
    if (!targets.length || targets.length > 20 || new Set(targets.map((target: any) => target?.id)).size !== targets.length) throw new Error('固定失败效果需要 1–20 个不同的目标 Token。');
    const immuneTargets = new Set(targets.filter((target: any) => validateFailureTarget(rule, target)).map((target: any) => target.id));
    const combat = activeCombat(env);
    if (!combat || !sameScene(combat, env.canvas?.scene)) throw new Error('固定失败效果需要当前场景中的战斗。');
    // Validate both turn anchors before native consumption; a missing combatant cannot silently create a permanent effect.
    if (rule.parameters.expiry !== 'hp-recovery') {
      for (const target of targets) {
        const tokenId = rule.parameters.expiry === 'next-target-turn-end' ? target.id : source.id;
        if (rule.parameters.expiry === 'next-source-turn-start') nextOwnTurnStart(combat, tokenId);
        else nextTargetTurnEnd(combat, tokenId);
      }
    }
    const item = resolveItem(rule, source);
    if (interceptedActivity && (!sameActivityItem(interceptedActivity, item) || interceptedActivity.id !== resolveSaveActivity(rule, source).id)) throw new Error('拦截活动与固定规则的原生活动不一致。');
    const activity = resolveSaveActivity(rule, source);
    if (targets.length > 1 && !activity?.target?.template?.type) throw new Error('多个目标只允许使用原生范围 Save Activity。');
    await consumeNativeActivity(activity, usageConfig, bypassedUses, activityKey);
    assertLive();
    const parts = collectionValues(activity?.damage?.parts);
    let damages: any[] = [];
    if (parts.length) {
      if (typeof activity.rollDamage !== 'function') throw new Error('原生 Save Activity 伤害接口不可用。');
      const rolls = await activity.rollDamage({}, { configure: false }, { create: true });
      if (!Array.isArray(rolls) || rolls.length !== parts.length) throw new Error('原生伤害骰未完整返回。');
      damages = rolls.map((roll: any) => ({ value: numeric(roll.total, '原生伤害骰结果'), type: roll?.options?.type, properties: new Set() }));
      if (damages.some((damage: any) => typeof damage.type !== 'string' || !damage.type)) throw new Error('原生伤害骰缺少伤害类型。');
    }
    const results: any[] = [];
    const newGroups: Array<{ actor: any; groupId: string }> = [];
    try { for (const target of targets) {
      const beforeGroups = new Set(ownedGroups(target.actor, () => true));
      const save = await nativeSave(activity, target);
      assertLive();
      const onSave = activity.damage?.onSave ?? 'half';
      const multiplier = !damages.length ? 0 : save.success ? onSave === 'half' ? 0.5 : onSave === 'none' ? 0 : onSave === 'full' ? 1 : invalidOnSave(onSave) : 1;
      if (multiplier) await target.actor.applyDamage(cloneDamages(damages), { multiplier });
      assertLive();
      const margin = save.dc - save.total;
      const applied = !immuneTargets.has(target.id) && margin >= rule.parameters.minFailureMargin ? await applyFixedEffect(rule, source, target, combat) : false;
      for (const groupId of ownedGroups(target.actor, () => true)) if (!beforeGroups.has(groupId)) newGroups.push({ actor: target.actor, groupId });
      results.push({ save, margin, multiplier, applied, targetTokenId: target.id });
      addHistory('save-failure-effect', { ruleId, sourceTokenId: source.id, targetTokenId: target.id, total: save.total, dc: save.dc, margin, multiplier, applied });
    } } catch (error) {
      for (const { actor, groupId } of newGroups.reverse()) await removeOwnedGroup(actor, groupId);
      throw error;
    }
    return results.length === 1 ? results[0] : { targets: results };
  };
  const setActivityDisabled = async (ruleId: string, source: any, itemName: string, disabled: boolean) => {
    assertLive();
    const rule = ruleById(normalized.config, ruleId, 'gm-activity-lock');
    assertSourceToken(source, rule.actorKey, boundKey);
    if (!rule.parameters.activityItemNames.includes(itemName)) throw new Error('GM 控制未绑定此活动。');
    const items = collectionValues(source.actor?.items).filter((entry: any) => entry?.name === itemName);
    const item = items[0];
    const activities = collectionValues(item?.system?.activities).filter((activity: any) => activity?.save);
    if (items.length !== 1 || !item?.id || activities.length !== 1 || !activities[0]?.id) throw new Error('已绑定原生活动缺失或不唯一。');
    const prior = stateFor(source.actor) ?? packageState({});
    const entries = (prior.disabledActivities?.[rule.id] ?? []).filter((entry: any) => entry?.itemId !== item.id || entry?.activityId !== activities[0].id);
    if (disabled) entries.push({ itemId: item.id, activityId: activities[0].id, itemName });
    await setState(source.actor, { ...prior, disabledActivities: { ...(prior.disabledActivities ?? {}), [rule.id]: entries } });
    addHistory(disabled ? 'gm-activity-disabled' : 'gm-activity-restored', { ruleId, sourceTokenId: source.id, itemName });
  };
  const runStagedCorruption = async (rule: Extract<EncounterAutomationRule, { kind: 'staged-corruption' }>, target: any) => {
    assertLive();
    assertSceneToken(target);
    const activity = resolveSaveActivity(rule);
    const save = await nativeSave(activity, target);
    assertLive();
    if (save.success) {
      addHistory('corruption-save', { ruleId: rule.id, targetId: target.id, success: true, total: save.total, dc: save.dc });
      return { save, outcome: 'saved' as const };
    }
    const marker = rule.parameters.marker;
    const existing = collectionValues(target.actor.effects).find((effect: any) => effectState(effect)?.corruption?.marker === marker && !effect.disabled);
    if (existing) {
      const before = numeric(target.actor.system?.attributes?.exhaustion ?? 0, '目标力竭值');
      const after = Math.min(6, before + rule.parameters.repeatExhaustion);
      await target.actor.update({ 'system.attributes.exhaustion': after });
      addHistory('corruption-exhaustion', { ruleId: rule.id, targetId: target.id, before, after });
      return { save, outcome: 'exhaustion' as const, before, after };
    }
    await target.actor.createEmbeddedDocuments('ActiveEffect', [{
      name: rule.parameters.label,
      disabled: false,
      flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { [ENCOUNTER_AUTOMATION_FLAG_KEY]: packageState({ corruption: { marker, label: rule.parameters.label } }) } },
    }]);
    addHistory('corruption-marked', { ruleId: rule.id, targetId: target.id, marker });
    return { save, outcome: 'marked' as const };
  };
  const applyStatus = async (target: any, status: 'dazed', expiry: 'next-target-turn-end' | undefined, combat: any) => {
    const statusEffect = configuredStatusEffect(env.CONFIG?.statusEffects, status);
    if (!statusEffect) throw new Error(`Foundry 未配置状态“${status}”。`);
    const existingEffects = collectionValues(target.actor.effects);
    // Preserve an active effect from another source. It already supplies the
    // requested condition, and this runtime must not rewrite or remove it.
    if (existingEffects.some((effect: any) => !effect.disabled && effectHasStatus(effect, status))) return false;
    const canonical = statusEffect._id
      ? existingEffects.find((effect: any) => effect?.id === statusEffect._id || effect?._id === statusEffect._id)
      : undefined;
    // Foundry v14 uses the configured static _id as the identity of a native
    // status document. Check it before creating so DAE cannot reconcile a
    // random-id package effect into a second canonical document.
    if (canonical) {
      // Core also treats a disabled static-id status document as existing. A
      // disabled document owned by this exact package may be the result of our
      // own expiration, so reuse it and update only its enabled state and
      // package flag. Foreign disabled documents remain protected.
      const state = effectState(canonical);
      if (!canonical.disabled || state?.status?.status !== status) return false;
      let expiration: { tokenId: string; round: number } | undefined;
      if (expiry) expiration = nextTargetTurnEnd(combat, target.id);
      assertLive();
      await canonical.update({
        disabled: false,
        [`flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.${ENCOUNTER_AUTOMATION_FLAG_KEY}`]: {
          ...state,
          packageId: normalized.packageId,
          packageHash: normalized.packageHash,
          status: { ...(state.status ?? {}), status, expiration },
        },
      });
      assertLive();
      return true;
    }
    let expiration: { tokenId: string; round: number } | undefined;
    if (expiry) expiration = nextTargetTurnEnd(combat, target.id);
    const ActiveEffect = nativeActiveEffectClass(env);
    const effect = await ActiveEffect.fromStatusEffect(status, { parent: target.actor });
    assertLive();
    if (!effect || typeof effect.updateSource !== 'function' || typeof effect.toObject !== 'function') {
      throw new Error('Foundry 原生状态效果工厂返回了不可更新的 ActiveEffect。');
    }
    effect.updateSource({
      flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { [ENCOUNTER_AUTOMATION_FLAG_KEY]: packageState({ status: { status, expiration } }) } },
    });
    try {
      const created = await ActiveEffect.create(effect.toObject(), { parent: target.actor, keepId: true });
      return Boolean(created);
    } catch (error) {
      // A concurrent native toggle may win between the identity check and
      // create. Keep the existing document and report that this application
      // did not add another effect rather than falling back to a random ID.
      if (/already exists/i.test(String(error)) && statusEffect._id
        && collectionValues(target.actor.effects).some((existing: any) => existing?.id === statusEffect._id || existing?._id === statusEffect._id)) return false;
      throw error;
    }
  };
  const createSummon = async (rule: Extract<EncounterAutomationRule, { kind: 'save-summon' }>, source: any, target: any, combat: any) => {
    const grid = env.canvas?.grid;
    if (!grid?.size || !env.canvas?.scene || !combat) throw new Error('召唤需要当前场景网格和现有战斗；未虚构无网格或无战斗时的放置/先攻规则。');
    const candidates = adjacentCandidates(source, target, env.canvas).filter((position) => isFreePosition(position, env.canvas.tokens?.placeables ?? [], Number(env.canvas.grid.size)));
    if (candidates.length === 0) throw new Error('目标周围没有合法的相邻网格可供召唤。');
    const position = await chooseAdjacent(env, source, target, rule, candidates, stopController.signal);
    assertLive();
    if (!position) throw new Error('GM 没有选择合法相邻网格；没有创建召唤物。');
    if (!candidates.some((candidate) => samePosition(candidate, position))) throw new Error('GM 选择的位置不是合法相邻网格。');
    const blueprint = actors.get(rule.parameters.summonedActorKey);
    if (!blueprint) throw new Error(`召唤绑定 ${rule.parameters.summonedActorKey} 不存在。`);
    const document = await blueprint.getTokenDocument({
      x: position.x, y: position.y, elevation: target.document?.elevation ?? 0,
      actorLink: false, disposition: source.document?.disposition,
      flags: { [ENCOUNTER_AUTOMATION_FLAG_SCOPE]: { [ENCOUNTER_AUTOMATION_FLAG_KEY]: packageState({ summon: { ruleId: rule.id, sourceTokenId: source.id } }) } },
    });
    assertLive();
    const data = document?.toObject ? document.toObject() : { ...document };
    data.actorLink = false; // unlinked Tokens receive a separate Actor delta and HP pool.
    const created = await env.canvas.scene.createEmbeddedDocuments('Token', [data]);
    assertLive();
    const token = created?.[0];
    if (!token) throw new Error('Foundry 未创建召唤 Token。');
    const combatants = await combat.createEmbeddedDocuments('Combatant', [{ tokenId: token.id, actorId: blueprint.id, sceneId: env.canvas.scene.id }]);
    assertLive();
    const combatant = combatants?.[0];
    if (!combatant) throw new Error('Foundry 未创建召唤物的 Combatant。');
    await combat.rollInitiative([combatant.id], { updateTurn: false, messageOptions: { rollMode: 'gmroll' } });
    addHistory('summon', { ruleId: rule.id, sourceTokenId: source.id, targetTokenId: target.id, tokenId: token.id, combatantId: combatant.id, actorLink: data.actorLink });
    return { token, combatant, position };
  };
  const executeSaveSummon = async (ruleId: string, source: any, target: any, interceptedActivity?: any, usageConfig: any = {}) => {
    assertLive();
    const rule = ruleById(normalized.config, ruleId, 'save-summon');
    assertSourceToken(source, rule.actorKey, boundKey);
    assertSceneToken(target);
    const combat = activeCombat(env);
    // Validate the non-native prerequisites before spending an Item resource.
    if (!combat || !env.canvas?.grid?.size) throw new Error('召唤需要当前场景网格和现有战斗；原生物品未消耗。');
    const item = resolveItem(rule, source);
    if (interceptedActivity && !sameActivityItem(interceptedActivity, item)) throw new Error('拦截的活动不是固定规则绑定的原生物品。');
    // preUseActivity receives dnd5e's disposable item clone. Use it only as
    // an identity check, then invoke the embedded Activity once so native
    // uses, legendary-action consumption, and chat provenance remain native.
    const activity = resolveSaveActivity(rule, source);
    await consumeNativeActivity(activity, usageConfig, bypassedUses, activityKey);
    assertLive();
    const save = await nativeSave(activity, target);
    assertLive();
    const damage = await applySaveDamage(activity, target, save);
    assertLive();
    let statusApplied = false;
    if (!save.success && rule.parameters.failedStatus) {
      statusApplied = await applyStatus(target, rule.parameters.failedStatus, rule.parameters.statusExpiry, combat);
      assertLive();
    }
    let followup: unknown;
    const hp = source.actor?.system?.attributes?.hp;
    if (!save.success && rule.parameters.followupRuleId && (!rule.parameters.followupAtHalfHp || (numeric(hp?.value, '来源 HP') <= numeric(hp?.max, '来源最大 HP') / 2))) {
      followup = await runStagedCorruption(ruleById(normalized.config, rule.parameters.followupRuleId, 'staged-corruption'), target);
      assertLive();
    }
    const summoned = await createSummon(rule, source, target, combat);
    addHistory('save-summon', { ruleId, sourceTokenId: source.id, targetTokenId: target.id, success: save.success, statusApplied, multiplier: damage.multiplier });
    return { save, damage, statusApplied, followup, summoned };
  };
  const executeTurnStartArea = async (ruleId: string, source: any, combat: any) => {
    assertLive();
    const rule = ruleById(normalized.config, ruleId, 'turn-start-area');
    assertSourceToken(source, rule.actorKey, boundKey);
    if (!combat || !isOwnCurrentTurn(combat, source)) throw new Error('范围触发只在该绑定角色自身回合开始时执行。');
    const once = `${combat.id}:${numeric(combat.round, '战斗轮次')}:${combat.combatant?.id ?? source.id}:${rule.id}`;
    if (completedTurns.has(once)) return { skipped: 'already-triggered' };
    completedTurns.add(once);
    if (completedTurns.size > TURN_KEY_LIMIT) completedTurns.delete(completedTurns.values().next().value!);
    if (rule.parameters.aliveOnly && numeric(source.actor?.system?.attributes?.hp?.value ?? 0, '来源 HP') <= 0) return { skipped: 'source-at-zero-hp' };
    const activity = resolveSaveActivity(rule, source);
    // `aliveOnly` is the source crystal's trigger gate. The source wording for
    // this area effect targets every other creature in range, including a
    // 0-HP creature that is down but not dead.
    const candidates = (env.canvas?.tokens?.placeables ?? []).filter((target: any) => target?.id !== source.id && target?.actor
      && distanceFeet(source, target, env.canvas) <= rule.parameters.radiusFeet);
    const damage = await rollDamage(activity);
    assertLive();
    const results: unknown[] = [];
    for (const target of candidates) {
      assertLive();
      const save = await nativeSave(activity, target);
      assertLive();
      const onSave = activity?.damage?.onSave ?? 'half';
      const multiplier = !save.success ? 1 : onSave === 'half' ? 0.5 : onSave === 'none' ? 0 : onSave === 'full' ? 1 : invalidOnSave(onSave);
      if (damage.length && multiplier !== 0) await target.actor.applyDamage(cloneDamages(damage), { multiplier });
      assertLive();
      let followup: unknown;
      if (!save.success && rule.parameters.followupRuleId) followup = await runStagedCorruption(ruleById(normalized.config, rule.parameters.followupRuleId, 'staged-corruption'), target);
      results.push({ targetTokenId: target.id, save, multiplier, followup });
    }
    addHistory('turn-start-area', { ruleId, sourceTokenId: source.id, targets: candidates.map((token: any) => token.id) });
    return { targets: results };
  };
  const wardState = (ruleId: string, actor: any): WardState => {
    const rule = ruleById(normalized.config, ruleId, 'threshold-ward');
    if (!sameActor(actor, actors.get(rule.actorKey), normalized.bindings[rule.actorKey]!)) throw new Error('守护状态查询的角色不是绑定角色。');
    const state = stateFor(actor)?.wards?.[ruleId];
    return state?.state === 'weakened' || state?.state === 'broken' ? state : { state: 'full' };
  };
  const setWardState = async (rule: Extract<EncounterAutomationRule, { kind: 'threshold-ward' }>, actor: any, state: WardState) => {
    const current = stateFor(actor);
    const previous = current?.wards?.[rule.id]?.state ?? 'full';
    const wards = { ...(current?.wards ?? {}), [rule.id]: state };
    await setState(actor, packageState({ ...current, wards }));
    addHistory('ward-state', { ruleId: rule.id, actorId: actor.id, state: state.state });
    if (previous !== state.state) {
      env.ui?.notifications?.info?.(`${actor?.name ?? rule.actorKey}：${rule.itemName}已${wardStateLabel(state.state)}。`);
    }
  };
  const applyWardBreak = async (rule: Extract<EncounterAutomationRule, { kind: 'ward-break' }>, actor: any, sourceToken?: any) => {
    assertLive();
    if (!sameActor(actor, actors.get(rule.actorKey), normalized.bindings[rule.actorKey]!)) throw new Error('守护破裂活动来自未绑定角色。');
    const ward = ruleById(normalized.config, rule.parameters.wardRuleId, 'threshold-ward');
    const token = sourceToken ?? uniqueSceneTokenForUsageActor(env, actor, normalized.bindings[rule.actorKey]!);
    const combat = activeCombat(env);
    if (!token || !combat) throw new Error('守护破裂需要绑定角色位于当前战斗场景；没有伪造持续时间。');
    await setWardState(ward, actor, { state: 'broken', until: nextOwnTurnStart(combat, token.id) });
  };
  const restoreOwnTurnWard = async (actor: any, token: any, round: number) => {
    for (const rule of normalized.config.rules.filter((entry): entry is Extract<EncounterAutomationRule, { kind: 'threshold-ward' }> => entry.kind === 'threshold-ward')) {
      if (!sameActor(actor, actors.get(rule.actorKey), normalized.bindings[rule.actorKey]!)) continue;
      const state = wardState(rule.id, actor);
      if (state.state !== 'broken' || !state.until || state.until.tokenId !== token.id || round < state.until.round) continue;
      const breakRule = normalized.config.rules.find((entry): entry is Extract<EncounterAutomationRule, { kind: 'ward-break' }> => entry.kind === 'ward-break' && entry.id === rule.parameters.breakRuleId);
      if (!breakRule) throw new Error(`守护规则 ${rule.id} 缺少破裂规则。`);
      const item = resolveItem(breakRule, actor);
      const uses = item?.system?.uses;
      const depleted = Number.isFinite(Number(uses?.max)) && Number(uses.max) > 0 && Number(uses?.spent) >= Number(uses.max);
      await setWardState(rule, actor, { state: depleted ? 'weakened' : 'full' });
    }
  };
  const onTurnStart = async (combat: any, snapshot: TurnSnapshot) => {
    assertLive();
    const token = tokenForCombatant(env, combat, snapshot.tokenId);
    if (!token || !token.actor || !sameScene(combat, env.canvas?.scene)) return;
    await restoreOwnTurnWard(token.actor, token, snapshot.round);
    assertLive();
    const key = boundKey(token.actor);
    if (key) {
      for (const recovery of normalized.config.legendaryRecovery.filter((entry) => entry.actorKey === key)) {
        await token.actor.update({ 'system.resources.legact.spent': 0 });
        assertLive();
        addHistory('legendary-recovery', { actorKey: key, tokenId: token.id, max: recovery.max });
      }
    }
    for (const rule of normalized.config.rules.filter((entry): entry is Extract<EncounterAutomationRule, { kind: 'turn-start-area' }> => entry.kind === 'turn-start-area' && entry.actorKey === key)) {
      await executeTurnStartArea(rule.id, token, combat);
    }
  };
  const expireTurnEndStatuses = async (combat: any, prior: TurnSnapshot) => {
    assertLive();
    if (!prior.tokenId || !prior.id || !sameScene(combat, env.canvas?.scene)) return;
    const token = tokenForCombatant(env, combat, prior.tokenId);
    if (!token?.actor) return;
    for (const effect of collectionValues(token.actor.effects)) {
      const expiration = effectState(effect)?.status?.expiration;
      if (!effect.disabled && expiration?.tokenId === prior.tokenId && prior.round >= expiration.round) {
        assertLive();
        await effect.update({ disabled: true });
        assertLive();
        addHistory('status-expired', { tokenId: prior.tokenId, effectId: effect.id });
      }
    }
  };
  const expireFixedEffects = async (snapshot: TurnSnapshot, event: 'start' | 'end') => {
    if (!snapshot.tokenId || snapshot.round < 1) return;
    const seen = new Set<string>();
    for (const token of env.canvas?.tokens?.placeables ?? []) {
      if (!token?.actor) continue;
      const groupIds = ownedGroups(token.actor, (state) => state?.anchor && state.event === event
        && state.anchor.tokenId === snapshot.tokenId && snapshot.round >= state.anchor.round);
      for (const groupId of groupIds) {
        if (seen.has(groupId)) continue;
        seen.add(groupId);
        await removeOwnedGroup(token.actor, groupId);
        addHistory('fixed-effect-expired', { groupId, event, tokenId: snapshot.tokenId });
      }
    }
  };

  const stopStatusLifecycles = installStatusLifecycles(env,
    normalized.config.rules.filter((rule): rule is StatusLifecycleRule => rule.kind === 'status-lifecycle'), {
      assertLive,
      ruleForActivity: activity => matchingRule(activity, 'status-lifecycle'),
      sourceToken: (rule, activity) => {
        const source = uniqueSceneTokenForUsageActor(env, activity?.item?.actor, normalized.bindings[rule.actorKey]!);
        if (!source || !sameActivityItem(activity, resolveItem(rule, source))) throw new Error('命中状态无法定位唯一绑定来源及活动。');
        assertSourceToken(source, rule.actorKey, boundKey);
        return source;
      },
      entries: () => {
        const all = [...collectionValues(env.game.actors), ...(env.canvas?.tokens?.placeables ?? []).map((token: any) => token.actor),
          ...collectionValues(env.game.scenes).flatMap((scene: any) => collectionValues(scene.tokens).map((token: any) => token.actor))];
        const seen = new Set<string>();
        return all.filter((actor: any) => actor?.uuid && !seen.has(actor.uuid) && seen.add(actor.uuid)).flatMap((actor: any) =>
          Object.entries(nativeClaims(actor)).flatMap(([status, claims]) => (Array.isArray(claims) ? claims : []).filter((claim: any) => claim.lifecycle).map((claim: any) => ({ actor, status, claim }))));
      },
      apply: async (rule, source, target, lifecycle) => serializeActorWrite(actorEffectWrites, target.actor, async () => {
        assertLive(); assertSceneToken(target);
        const status = rule.parameters.status;
        if (collectionValues(target.actor?.system?.traits?.ci?.value).includes(status)) {
          addHistory('status-lifecycle-immune', { ruleId: rule.id, targetActorUuid: target.actor.uuid, status }); return;
        }
        const claims = nativeClaims(target.actor)[status] ?? [];
        const prior = claims.filter((claim: any) => claim.lifecycle && claim.ruleId === rule.id
          && claim.sourceActorUuid === source.actor.uuid && claim.sourceTokenId === source.id && claim.targetTokenId === target.id);
        if (prior.length > 1) throw new Error('同一来源有多个状态声明，请 GM 复核。');
        const claim = { ruleId: rule.id, groupId: prior[0]?.groupId ?? globalThis.crypto.randomUUID(),
          sourceActorUuid: source.actor.uuid, sourceTokenId: source.id, targetActorUuid: target.actor.uuid, targetTokenId: target.id, lifecycle,
          ...(rule.parameters.definition ? { configuredInstanceId: prior[0]?.groupId ?? '', configuredEffectId: '' } : {}) };
        if (rule.parameters.definition) {
          const definition = rule.parameters.definition;
          const api = configuredConditionsApi(env.game, definition);
          claim.configuredInstanceId = claim.groupId;
          const existed = api.list(target.actor).some((entry: any) => entry.instanceId === claim.groupId);
          try {
            const effect = await api.apply(target.actor, { id: definition.id, fingerprint: configuredConditionFingerprint(definition) },
              { instanceId: claim.groupId, source: `${normalized.packageId}/${rule.id}`, origin: resolveItem(rule, source).uuid });
            if (!effect?.id) throw new Error('自定义状态未返回已创建的效果身份。');
            claim.configuredEffectId = effect.id;
            assertLive();
            await setState(target.actor, { ...(stateFor(target.actor) ?? packageState({})), fixedNativeClaims: {
              ...nativeClaims(target.actor), [status]: [...(nativeClaims(target.actor)[status] ?? []).filter((entry: any) => entry.groupId !== claim.groupId), claim],
            } });
          } catch (error) {
            if (!existed && isActiveGm(env)) await api.remove(target.actor, claim.groupId);
            throw error;
          }
          addHistory('status-lifecycle-applied', { ruleId: rule.id, groupId: claim.groupId, sourceActorUuid: source.actor.uuid, targetActorUuid: target.actor.uuid, status });
          return;
        }
        const created = await ensureNativeStatus(target.actor, status);
        try {
          assertLive();
          await ensureNativeStatusRiders({ actor: target.actor,
            primary: collectionValues(target.actor.effects).find((effect: any) => moduleOwnsNativeStatus(effect, status)),
            status, configurationFor: id => configuredStatusEffect(env.CONFIG?.statusEffects, id),
            dae: env.game.modules?.get?.('dae'), assertLive, record: addHistory });
          await setState(target.actor, { ...(stateFor(target.actor) ?? packageState({})), fixedNativeClaims: {
            ...nativeClaims(target.actor), [status]: [...(nativeClaims(target.actor)[status] ?? []).filter((entry: any) => entry.groupId !== claim.groupId), claim],
          } });
        } catch (error) {
          if (created && isActiveGm(env)) await target.actor.deleteEmbeddedDocuments('ActiveEffect', [created.id]);
          throw error;
        }
        addHistory('status-lifecycle-applied', { ruleId: rule.id, groupId: claim.groupId, sourceActorUuid: source.actor.uuid, targetActorUuid: target.actor.uuid, status });
      }),
      update: async (entry, lifecycle) => {
        assertLive();
        await setState(entry.actor, { ...(stateFor(entry.actor) ?? packageState({})), fixedNativeClaims: { ...nativeClaims(entry.actor),
          [entry.status]: (nativeClaims(entry.actor)[entry.status] ?? []).map((claim: any) => claim.groupId === entry.claim.groupId ? { ...claim, lifecycle } : claim),
        } });
      },
      remove: async entry => { assertLive(); await removeOwnedGroup(entry.actor, entry.claim.groupId); },
      enqueue, record: addHistory, notify: message => notify('warn', message),
    });

  register('dnd5e.preUseActivity', (activity: any, usageConfig: any, dialogConfig: any, messageConfig: any) => {
    if (stopped) return;
    const actorKey = boundKey(activity?.item?.actor ?? activity?.actor);
    const locks = normalized.config.rules.filter((rule): rule is Extract<EncounterAutomationRule, { kind: 'gm-activity-lock' }> =>
      rule.kind === 'gm-activity-lock' && rule.actorKey === actorKey && rule.parameters.activityItemNames.includes(activity?.item?.name));
    if (locks.length) {
      const source = uniqueSceneTokenForUsageActor(env, activity.item?.actor, normalized.bindings[actorKey!]!);
      if (!source) { notify('error', '固定能力禁用检查无法定位唯一来源 Token；原生活动未使用。'); return false; }
      for (const lock of locks) {
        const items = collectionValues(source.actor?.items).filter((entry: any) => entry?.name === activity.item.name);
        const item = items[0];
        if (items.length !== 1 || collectionValues(item.system?.activities).filter((entry: any) => entry?.save).length !== 1 || !sameActivityItem(activity, item)) {
          notify('error', '能力禁用检查的原生活动身份不匹配；原生活动未使用。'); return false;
        }
        if (stateFor(source.actor)?.disabledActivities?.[lock.id]?.some((entry: any) => entry?.itemId === activity.item.id && entry?.activityId === activity.id)) {
          notify('warn', `GM 已禁用 ${activity.item.name}；原生活动未使用。`); return false;
        }
      }
    }
    const fixed = matchingRule(activity, 'save-failure-effect');
    if (fixed) {
      if (!isActiveGm(env)) { notify('warn', '只有当前活动 GM 可以结算固定失败效果。'); return false; }
      const key = activityKey(activity);
      if (bypassedUses.has(key)) return;
      const source = uniqueSceneTokenForUsageActor(env, activity.item?.actor, normalized.bindings[fixed.actorKey]!);
      const targets = targetsFromUsage(env, usageConfig);
      if (!source || !targets.length || targets.length > 20 || (targets.length > 1 && !activity?.target?.template?.type)) {
        notify('error', '固定失败效果需要唯一来源 Token；范围能力须由 GM 选中范围内全部目标 Token，单体能力只允许一个目标。原生活动未使用。'); return false;
      }
      enqueue(async () => { await executeSaveFailureEffect(fixed.id, source, targets, activity, usageConfig); });
      return false;
    }
    const rule = matchingRule(activity, 'save-summon');
    if (!rule || stopped) return;
    if (!isActiveGm(env)) {
      notify('warn', '只有当前活动 GM 可以结算该固定战斗能力。');
      return false;
    }
    const key = activityKey(activity);
    if (bypassedUses.has(key)) return;
    const source = uniqueSceneTokenForActor(env, activity.item?.actor, normalized.bindings[rule.actorKey]!);
    const targets = targetsFromUsage(env, usageConfig);
    if (!source || targets.length !== 1) {
      notify('error', '固定召唤能力需要场景中的唯一来源 Token 和一个目标 Token；原生活动未消耗。');
      return false;
    }
    enqueue(async () => { await executeSaveSummon(rule.id, source, targets[0], activity, usageConfig); });
    return false;
  });
  register('dnd5e.postUseActivity', (activity: any) => {
    const rule = matchingRule(activity, 'ward-break');
    if (!rule || stopped || !isActiveGm(env)) return;
    // The cloned post-use Activity still identifies the real source Actor. Its
    // unique scene Token may be unlinked, so persist state on that Token Actor
    // rather than overwriting the blueprint Actor's flags or resource view.
    const source = uniqueSceneTokenForUsageActor(env, activity.item?.actor, normalized.bindings[rule.actorKey]!);
    if (!source) {
      notify('error', '守护破裂活动无法定位唯一的来源场景 Token；没有写入状态。');
      return;
    }
    enqueue(async () => { await applyWardBreak(rule, source.actor, source); });
  });
  register('dnd5e.calculateDamage', (actor: any, summary: any) => {
    if (stopped || !isActiveGm(env)) return;
    for (const rule of normalized.config.rules.filter((entry): entry is Extract<EncounterAutomationRule, { kind: 'threshold-ward' }> => entry.kind === 'threshold-ward')) {
      if (!sameActor(actor, actors.get(rule.actorKey), normalized.bindings[rule.actorKey]!)) continue;
      const state = wardState(rule.id, actor).state;
      const result = applyThresholdWardToSummary(
        summary,
        state,
        rule.parameters.threshold,
        proficiency(actor),
        env.CONFIG?.DND5E?.healingTypes,
        rule.id,
      );
      if (result) addHistory('ward-damage', { ruleId: rule.id, actorId: actor.id, state, ...result });
    }
  });
  const queueGroupRemoval = (actor: any, groups: string[], reason: string) => {
    if (!groups.length) return;
    enqueue(async () => {
      for (const groupId of groups) await removeOwnedGroup(actor, groupId);
      addHistory(reason, { actorId: actor.id, groups: groups.length });
    });
  };
  register('dnd5e.applyDamage', (actor: any, amount: number, options: any) => {
    if (stopped || !isActiveGm(env) || !options || typeof options !== 'object') return;
    const observation = committedDamageOptions.get(options);
    if (!observation || observation.actor !== actor || observation.amount !== amount || consumedDamageObservations.has(observation)) return;
    consumedDamageObservations.add(observation);
    // The bridge requires an observed updateActor before trusting this post
    // hook: dnd5e 5.3.3 ignores Actor.update's cancellation return value.
    if (amount > 0) queueGroupRemoval(actor, ownedGroups(actor, (state) => state.removeOnDamage), 'fixed-effect-removed-by-damage');
  });
  register('updateActor', (actor: any, changes: any, _options: any, userId: string) => {
    if (stopped || !isActiveGm(env)) return;
    const hp = actor?.system?.attributes?.hp;
    const afterHp = Number(hp?.value), afterTemp = Number(hp?.temp ?? 0);
    if (!Number.isFinite(afterHp) || !Number.isFinite(afterTemp)) return;
    const prior = observedHp.get(actor);
    observedHp.set(actor, { hp: afterHp, temp: afterTemp });
    const touched = changes?.['system.attributes.hp.value'] !== undefined || changes?.['system.attributes.hp.temp'] !== undefined
      || changes?.system?.attributes?.hp?.value !== undefined || changes?.system?.attributes?.hp?.temp !== undefined;
    if (prior && touched) {
      const transition = { beforeHp: prior.hp, beforeTemp: prior.temp, afterHp, afterTemp,
        modifiedTime: Number(actor?._stats?.modifiedTime ?? 0), at: Date.now(), groups: ownedGroups(actor, (state) => state.removeOnDamage) };
      const entries = damageTransitions.get(actor.uuid) ?? [];
      entries.push(transition); if (entries.length > 24) entries.shift();
      damageTransitions.set(actor.uuid, entries);
      // Actual HP recovery is a document fact; temp HP grants do not qualify.
      if (afterHp > prior.hp) queueGroupRemoval(actor, ownedGroups(actor, (state) => state.expiry === 'hp-recovery'), 'fixed-effect-removed-by-hp-update');
    }
    const changedFact = changes?.[`flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.encounterDamageFact`]
      ?? changes?.flags?.[ENCOUNTER_AUTOMATION_FLAG_SCOPE]?.encounterDamageFact;
    const changedEventId = changedFact?.eventId ?? changes?.[`flags.${ENCOUNTER_AUTOMATION_FLAG_SCOPE}.encounterDamageFact.eventId`];
    if (typeof changedEventId === 'string') {
      const fullFact = actor?.getFlag?.(ENCOUNTER_AUTOMATION_FLAG_SCOPE, 'encounterDamageFact')
        ?? actor?.flags?.[ENCOUNTER_AUTOMATION_FLAG_SCOPE]?.encounterDamageFact;
      if (fullFact?.eventId === changedEventId) acceptDamageFact(actor, fullFact, userId);
    }
    for (const [eventId, pending] of pendingDamageFacts) {
      if (Date.now() - pending.at >= 30_000) { pendingDamageFacts.delete(eventId); continue; }
      if (pending.actor === actor) acceptDamageFact(actor, pending.fact, pending.userId);
    }
  });
  const acceptDamageFact = (actor: any, fact: any, userId: string): void => {
    if (stopped || !isActiveGm(env) || !plainRecord(fact) || fact.type !== DAMAGE_BRIDGE_TYPE
      || Object.keys(fact).sort().join('|') !== ['type','eventId','actorUuid','amount','beforeHp','beforeTemp','afterHp','afterTemp','beforeTempMax','afterTempMax','noOpAtZero','groupIds'].sort().join('|')
      || typeof fact.eventId !== 'string' || !/^[a-f0-9-]{36}$/iu.test(fact.eventId) || processedDamageFacts.has(fact.eventId)
      || fact.actorUuid !== actor?.uuid || typeof userId !== 'string'
      || !Number.isFinite(fact.amount) || fact.amount <= 0
      || ![fact.beforeHp,fact.beforeTemp,fact.afterHp,fact.afterTemp,fact.beforeTempMax,fact.afterTempMax].every((value) => Number.isFinite(value))
      || typeof fact.noOpAtZero !== 'boolean'
      || !Array.isArray(fact.groupIds) || fact.groupIds.length > 80 || fact.groupIds.some((id: any) => typeof id !== 'string' || !/^[a-f0-9-]{36}$/iu.test(id))) return;
    const user = env.game?.users?.get?.(userId);
    if (!user || (!user.isGM && actor.testUserPermission?.(user, 'OWNER') !== true)) return;
    const hp = actor.system?.attributes?.hp;
    const defer = () => {
      pendingDamageFacts.set(fact.eventId, { actor, fact, userId, at: Date.now() });
      if (pendingDamageFacts.size > 80) pendingDamageFacts.delete(pendingDamageFacts.keys().next().value!);
    };
    if (Number(hp?.value) !== fact.afterHp || Number(hp?.temp ?? 0) !== fact.afterTemp || Number(hp?.tempmax ?? 0) !== fact.afterTempMax) { defer(); return; }
    const match = (damageTransitions.get(actor.uuid) ?? []).find((entry) => entry.beforeHp === fact.beforeHp
      && entry.beforeTemp === fact.beforeTemp && entry.afterHp === fact.afterHp && entry.afterTemp === fact.afterTemp && Date.now() - entry.at < 30_000);
    const nativeNoOp = fact.noOpAtZero === true && fact.beforeHp === 0 && fact.afterHp === 0
      && fact.beforeTemp === 0 && fact.afterTemp === 0 && fact.beforeTempMax === fact.afterTempMax
      && (actor?.getFlag?.(ENCOUNTER_AUTOMATION_FLAG_SCOPE, 'encounterDamageStamp')
        ?? actor?.flags?.[ENCOUNTER_AUTOMATION_FLAG_SCOPE]?.encounterDamageStamp) === fact.eventId;
    if (!match && !nativeNoOp) { defer(); return; }
    const allowed = new Set(match?.groups ?? ownedGroups(actor, (state) => state.removeOnDamage));
    const current = new Set(ownedGroups(actor, (state) => state.removeOnDamage));
    const groups = fact.groupIds.filter((id: string) => allowed.has(id) && current.has(id));
    processedDamageFacts.add(fact.eventId); if (processedDamageFacts.size > TURN_KEY_LIMIT) processedDamageFacts.delete(processedDamageFacts.values().next().value!);
    pendingDamageFacts.delete(fact.eventId);
    queueGroupRemoval(actor, groups, 'fixed-effect-removed-by-remote-damage');
  };
  const restoreAfterExternalStatus = (effect: any, disabled = false) => {
    if (stopped || !isActiveGm(env)) return;
    const actor = effect?.parent;
    if (!actor) return;
    for (const [status, claims] of Object.entries(nativeClaims(actor))) {
      if (!Array.isArray(claims)) continue;
      const root = effect.flags?.['fvtt-custom-conditions']?.configuredRoot;
      for (const claim of claims.filter((entry: any) => entry.configuredInstanceId && (entry.configuredEffectId === effect.id
        || (root?.schemaVersion === 1 && root.definitionId === status && root.instanceId === entry.configuredInstanceId)))) {
        enqueue(async () => {
          if (disabled) await setState(actor, { ...(stateFor(actor) ?? packageState({})), fixedNativeClaims: { ...nativeClaims(actor),
            [status]: (nativeClaims(actor)[status] ?? []).filter((entry: any) => entry.groupId !== claim.groupId) } });
          else await removeOwnedGroup(actor, claim.groupId);
          addHistory('configured-status-manually-cleared', { actorId: actor.id, status, groupId: claim.groupId });
        });
      }
    }
    for (const status of NATIVE_LIFECYCLE_STATUSES) {
      if (!effectHasStatus(effect, status) || !nativeClaims(actor)[status]?.length) continue;
      if (moduleOwnsNativeStatus(effect, status)) {
        // A GM removing or disabling this controller's visible native status
        // relinquishes its remaining claims; do not resurrect a manual removal.
        const observedGroups = new Set(nativeClaims(actor)[status]!.map((claim: any) => claim.groupId));
        enqueue(async () => {
          const remaining = (nativeClaims(actor)[status] ?? []).filter((claim: any) => !observedGroups.has(claim.groupId));
          await setState(actor, { ...(stateFor(actor) ?? packageState({})), fixedNativeClaims: { ...nativeClaims(actor), [status]: remaining } });
          addHistory('fixed-native-status-manually-cleared', { actorId: actor.id, status });
        });
      } else enqueue(async () => serializeActorWrite(actorEffectWrites, actor, async () => { if (nativeClaims(actor)[status]?.length) await ensureNativeStatus(actor, status); }));
    }
  };
  register('deleteActiveEffect', restoreAfterExternalStatus);
  register('updateActiveEffect', (effect: any, changes: any) => { if (changes?.disabled === true) restoreAfterExternalStatus(effect, true); });
  register('dnd5e.combatRecovery', (combatant: any, periods: unknown, results: any) => {
    if (stopped || !isActiveGm(env) || !Array.isArray(periods) || !periods.includes('turnEnd')) return;
    const key = boundKey(combatant?.actor);
    if (!key || !normalized.config.legendaryRecovery.some((entry) => entry.actorKey === key)) return;
    if (results?.actor) delete results.actor['system.resources.legact.spent'];
    addHistory('legendary-turn-end-blocked', { actorKey: key, combatantId: combatant?.id });
  });
  register('createCombat', (combat: any) => { turnSnapshots.set(combat.id, turnSnapshot(combat)); });
  register('updateCombat', (combat: any) => {
    if (stopped || !isActiveGm(env)) return;
    const next = turnSnapshot(combat);
    const prior = turnSnapshots.get(combat.id);
    turnSnapshots.set(combat.id, next);
    if (prior?.id === next.id && prior.round === next.round) return;
    enqueue(async () => {
      if (prior) { await expireTurnEndStatuses(combat, prior); await expireFixedEffects(prior, 'end'); }
      if (next.id && next.tokenId && next.round >= 1) { await expireFixedEffects(next, 'start'); await onTurnStart(combat, next); }
    });
  });
  const initialCombat = activeCombat(env);
  if (initialCombat?.id) turnSnapshots.set(initialCombat.id, turnSnapshot(initialCombat));
  seedObservedHp();
  register('canvasReady', seedObservedHp);

  const handle: EncounterAutomationHandle = {
    packageId: normalized.packageId,
    packageHash: normalized.packageHash,
    history,
    showPanel: () => showPanel(env, normalized, actors, history, setActivityDisabled),
    stop: () => {
      if (stopped) return;
      stopped = true;
      stopController.abort();
      stopStatusLifecycles();
      for (const [name, id] of hooks) env.Hooks.off(name, id);
      byPackage.delete(`${normalized.packageId}\u0000${normalized.packageHash}`);
      addHistory('stopped');
    },
    settle: () => queue,
    executeSaveSummon: (ruleId, source, target) => executeSaveSummon(ruleId, source, target),
    executeTurnStartArea: (ruleId, source, combat) => executeTurnStartArea(ruleId, source, combat),
    executeStagedCorruption: (ruleId, target) => runStagedCorruption(ruleById(normalized.config, ruleId, 'staged-corruption'), target),
    executeSaveFailureEffect: (ruleId, source, target) => executeSaveFailureEffect(ruleId, source, target),
    setActivityDisabled,
    getWardState: (ruleId, actor) => wardState(ruleId, actor).state,
  };
  byPackage.set(`${normalized.packageId}\u0000${normalized.packageHash}`, { signature, handle });
  addHistory('started', { packageId: normalized.packageId, packageHash: normalized.packageHash });
  return handle;

  function packageState(value: Record<string, any>): Record<string, any> {
    return { packageId: normalized.packageId, packageHash: normalized.packageHash, ...value };
  }
  function stateFor(document: any): any {
    return automationStates(document).find(state => state.packageId === normalized.packageId && state.packageHash === normalized.packageHash);
  }
  function effectState(effect: any): any { return stateFor(effect); }
  async function setState(document: any, value: Record<string, any>): Promise<void> {
    if (typeof document?.setFlag !== 'function') throw new Error('Foundry 文档 flags 接口不可用。');
    await serializeActorWrite(actorFlagWrites, document, async () => {
      assertLive();
      const raw = document.getFlag?.(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY)
        ?? document.flags?.[ENCOUNTER_AUTOMATION_FLAG_SCOPE]?.[ENCOUNTER_AUTOMATION_FLAG_KEY];
      const states = automationStates(document).filter(state => state.packageId !== normalized.packageId || state.packageHash !== normalized.packageHash);
      if (!states.length) await document.setFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY, value);
      else await document.setFlag(ENCOUNTER_AUTOMATION_FLAG_SCOPE, ENCOUNTER_AUTOMATION_FLAG_KEY, {
        ...raw, packages: [...states.map(({ packages: _packages, ...state }: any) => state), value],
      });
    });
  }
}

function assertEnvironment(env: EncounterAutomationEnvironment): void {
  if (!env?.game?.user?.isGM) throw new Error('战斗自动化只能由 GM 启动。');
  if ((env.game.version !== '14.364' && env.game.version !== '14.368') || env.game.system?.id !== 'dnd5e' || env.game.system?.version !== '5.3.3') {
    throw new Error('固定战斗自动化只支持 Foundry 14.364 / dnd5e 5.3.3。');
  }
  if (!env.Hooks?.on || !env.Hooks?.off || typeof env.fromUuid !== 'function') throw new Error('Foundry Hooks 或 UUID 解析接口不可用。');
}

function isActiveGm(env: EncounterAutomationEnvironment): boolean {
  const active = env.game?.users?.activeGM;
  return !active || active.id === env.game?.user?.id;
}

function assertBoundActor(actor: any, key: string, uuid: string, options: EncounterAutomationInstallOptions): void {
  if (!actor || actor.uuid !== uuid || !/^Actor\.[A-Za-z0-9]+$/u.test(uuid)) throw new Error(`绑定 ${key} 不是有效的 Actor UUID。`);
  const identity = actor.flags?.[ENCOUNTER_AUTOMATION_FLAG_SCOPE]?.encounter;
  if (identity?.version !== 1 || identity?.kind !== 'Actor' || identity?.key !== key || identity?.packageId !== options.packageId || identity?.packageHash !== options.packageHash) {
    throw new Error(`绑定 ${key} 不属于当前生物导入文件，拒绝按名称或近似身份运行。`);
  }
}

function validateInstallOptions(value: EncounterAutomationInstallOptions): ValidatedInstallOptions {
  exactKeys(value, ['packageId', 'packageHash', 'bindings', 'config'], '安装参数');
  text(value.packageId, 'packageId'); text(value.packageHash, 'packageHash');
  if (!plainRecord(value.bindings) || Object.keys(value.bindings).length === 0) throw new TypeError('bindings 必须包含至少一个 actorKey。');
  for (const [key, uuid] of Object.entries(value.bindings)) {
    text(key, 'bindings key');
    if (typeof uuid !== 'string' || !/^Actor\.[A-Za-z0-9]+$/u.test(uuid)) throw new TypeError(`bindings.${key} 必须是 Actor UUID。`);
  }
  const config = value.config;
  exactKeys(config, ['version', 'rules', 'legendaryRecovery'], 'config');
  if (config.version !== 1 || !Array.isArray(config.rules) || !Array.isArray(config.legendaryRecovery)) throw new TypeError('config 必须是版本 1 的固定规则对象。');
  if (config.rules.length > 80 || config.legendaryRecovery.length > 20) throw new TypeError('固定规则数量超过运行时上限。');
  const ids = new Set<string>();
  for (const rule of config.rules) {
    exactKeys(rule, ['id', 'kind', 'actorKey', 'itemName', 'parameters'], 'rule');
    text(rule.id, 'rule.id'); text(rule.actorKey, 'rule.actorKey'); text(rule.itemName, 'rule.itemName');
    if (ids.has(rule.id)) throw new TypeError(`规则 ID ${rule.id} 重复。`); ids.add(rule.id);
    if (!Object.hasOwn(value.bindings, rule.actorKey)) throw new TypeError(`规则 ${rule.id} 引用了未知 actorKey。`);
    validateRule(rule as EncounterAutomationRule, value.bindings);
  }
  const wardActors = new Set<string>();
  const corruptionMarkers = new Set<string>();
  for (const rule of config.rules as EncounterAutomationRule[]) {
    if (rule.kind === 'threshold-ward') {
      if (wardActors.has(rule.actorKey)) throw new TypeError(`绑定角色 ${rule.actorKey} 只能有一个 threshold-ward。`);
      wardActors.add(rule.actorKey);
    }
    if (rule.kind === 'staged-corruption') {
      const key = `${rule.actorKey}\u0000${rule.parameters.marker}`;
      if (corruptionMarkers.has(key)) throw new TypeError(`staged-corruption marker ${rule.parameters.marker} 重复。`);
      corruptionMarkers.add(key);
    }
  }
  for (const recovery of config.legendaryRecovery) {
    exactKeys(recovery, ['actorKey', 'max', 'when'], 'legendaryRecovery');
    if (!Object.hasOwn(value.bindings, recovery.actorKey) || !Number.isInteger(recovery.max) || recovery.max < 0 || recovery.when !== 'own-turn-start') {
      throw new TypeError('legendaryRecovery 不是受支持的固定 own-turn-start 恢复。');
    }
  }
  for (const rule of config.rules) {
    const strictRule = rule as EncounterAutomationRule;
    const params: any = strictRule.parameters;
    if ((strictRule.kind === 'save-summon' || strictRule.kind === 'turn-start-area') && params.followupRuleId && !config.rules.some((candidate) => candidate.id === params.followupRuleId && candidate.kind === 'staged-corruption')) {
      throw new TypeError(`规则 ${rule.id} 引用了不存在的 staged-corruption 规则。`);
    }
    if (strictRule.kind === 'threshold-ward' && !config.rules.some((candidate) => candidate.id === strictRule.parameters.breakRuleId && candidate.kind === 'ward-break' && candidate.actorKey === strictRule.actorKey)) {
      throw new TypeError(`守护规则 ${rule.id} 必须引用同一绑定角色的 ward-break。`);
    }
    if (strictRule.kind === 'ward-break' && !config.rules.some((candidate) => candidate.id === strictRule.parameters.wardRuleId && candidate.kind === 'threshold-ward' && candidate.actorKey === strictRule.actorKey)) {
      throw new TypeError(`ward-break 规则 ${rule.id} 必须引用同一绑定角色的 threshold-ward。`);
    }
  }
  return structuredClone(value) as ValidatedInstallOptions;
}

function validateRule(rule: EncounterAutomationRule, bindings: Record<string, string>): void {
  const p: any = rule.parameters;
  if (!plainRecord(p)) throw new TypeError(`规则 ${rule.id}.parameters 必须是对象。`);
  switch (rule.kind) {
    case 'save-summon':
      exactKeys(p, ['summonedActorKey', 'count', 'placement', 'outcome', 'failedStatus', 'statusExpiry', 'followupRuleId', 'followupAtHalfHp'].filter((key) => Object.hasOwn(p, key)), `规则 ${rule.id}.parameters`);
      if (!Object.hasOwn(bindings, p.summonedActorKey) || p.count !== 1 || p.placement !== 'adjacent-target' || p.outcome !== 'always'
        || (p.failedStatus !== undefined && p.failedStatus !== 'dazed') || (p.statusExpiry !== undefined && p.statusExpiry !== 'next-target-turn-end')
        || (p.followupRuleId !== undefined && typeof p.followupRuleId !== 'string') || (p.followupAtHalfHp !== undefined && typeof p.followupAtHalfHp !== 'boolean')) throw new TypeError(`规则 ${rule.id} 的 save-summon 参数不受支持。`);
      if (p.statusExpiry && !p.failedStatus) throw new TypeError(`规则 ${rule.id} 的状态持续时间没有对应失败状态。`);
      break;
    case 'turn-start-area':
      exactKeys(p, ['radiusFeet', 'excludeSelf', 'aliveOnly', 'followupRuleId'].filter((key) => Object.hasOwn(p, key)), `规则 ${rule.id}.parameters`);
      if (!Number.isFinite(p.radiusFeet) || p.radiusFeet <= 0 || p.excludeSelf !== true || p.aliveOnly !== true || (p.followupRuleId !== undefined && typeof p.followupRuleId !== 'string')) throw new TypeError(`规则 ${rule.id} 的 turn-start-area 参数不受支持。`);
      break;
    case 'staged-corruption':
      exactKeys(p, ['marker', 'label', 'repeatExhaustion'], `规则 ${rule.id}.parameters`);
      if (typeof p.marker !== 'string' || !p.marker || typeof p.label !== 'string' || !p.label || p.repeatExhaustion !== 1) throw new TypeError(`规则 ${rule.id} 的 staged-corruption 参数不受支持。`);
      break;
    case 'threshold-ward':
      exactKeys(p, ['threshold', 'fullReduction', 'weakenedReduction', 'breakRuleId'], `规则 ${rule.id}.parameters`);
      if (!Number.isFinite(p.threshold) || p.threshold < 0 || p.fullReduction !== 'half-floor' || p.weakenedReduction !== 'proficiency' || typeof p.breakRuleId !== 'string') throw new TypeError(`规则 ${rule.id} 的 threshold-ward 参数不受支持。`);
      break;
    case 'ward-break':
      exactKeys(p, ['wardRuleId', 'until', 'whenDepleted'], `规则 ${rule.id}.parameters`);
      if (typeof p.wardRuleId !== 'string' || p.until !== 'own-next-turn-start' || p.whenDepleted !== 'weakened') throw new TypeError(`规则 ${rule.id} 的 ward-break 参数不受支持。`);
      break;
    case 'save-failure-effect':
      exactKeys(p, ['effect', 'expiry', 'minFailureMargin', 'removeOnDamage'], `规则 ${rule.id}.parameters`);
      if (![
        ['blinded', 'next-source-turn-start', 1, false],
        ['slowed', 'next-target-turn-end', 1, false],
        ['paralyzed', 'next-source-turn-end', 1, true],
        ['str-dex-disadvantage', 'hp-recovery', 5, false],
      ].some(([effect, expiry, margin, damage]) => p.effect === effect && p.expiry === expiry && p.minFailureMargin === margin && p.removeOnDamage === damage)) throw new TypeError(`规则 ${rule.id} 的失败效果组合不受支持。`);
      break;
    case 'gm-activity-lock':
      exactKeys(p, ['activityItemNames'], `规则 ${rule.id}.parameters`);
      if (!Array.isArray(p.activityItemNames) || p.activityItemNames.length < 1 || p.activityItemNames.length > 20 || new Set(p.activityItemNames).size !== p.activityItemNames.length) throw new TypeError(`规则 ${rule.id} 必须绑定 1 至 20 个不同的原生活动物品。`);
      p.activityItemNames.forEach((name: unknown) => text(name, 'activityItemName'));
      break;
    case 'gm-manual':
      exactKeys(p, [], `规则 ${rule.id}.parameters`);
      break;
    case 'status-lifecycle':
      decodeStatusLifecycleParameters(p);
      break;
    default: throw new TypeError('规则 kind 不受支持。');
  }
}

function exactKeys(value: unknown, keys: string[], label: string): asserts value is Record<string, any> {
  if (!plainRecord(value)) throw new TypeError(`${label} 必须是普通对象。`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} 包含未授权字段。`);
}
function plainRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function text(value: unknown, label: string): asserts value is string { if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new TypeError(`${label} 必须是非空短文本。`); }
function numeric(value: unknown, label: string): number { const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN; if (!Number.isFinite(number)) throw new Error(`${label} 必须是原生数值。`); return number; }
function stableStringify(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`; if (plainRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function collectionValues(value: any): any[] { if (Array.isArray(value)) return value; if (value?.contents && Array.isArray(value.contents)) return value.contents; if (typeof value?.values === 'function') return Array.from(value.values()); return value && typeof value === 'object' ? Object.values(value) : []; }
function configuredStatusEffect(statusEffects: any, status: string): any | undefined {
  return collectionValues(statusEffects).find((effect: any) => effect?.id === status);
}
function nativeActiveEffectClass(env: EncounterAutomationEnvironment): any {
  const getDocumentClass = env.foundry?.utils?.getDocumentClass;
  const ActiveEffect = typeof getDocumentClass === 'function'
    ? getDocumentClass.call(env.foundry.utils, 'ActiveEffect')
    : env.CONFIG?.ActiveEffect?.documentClass ?? (env as any).ActiveEffect;
  if (typeof ActiveEffect?.fromStatusEffect !== 'function' || typeof ActiveEffect?.create !== 'function') {
    throw new Error('Foundry 原生 ActiveEffect 状态工厂不可用。');
  }
  return ActiveEffect;
}
function effectHasStatus(effect: any, status: string): boolean {
  const statuses = effect?.statuses;
  if (typeof statuses?.has === 'function') return statuses.has(status);
  return Array.isArray(statuses) ? statuses.includes(status) : false;
}
function firstValue(value: any): any { return Array.isArray(value) ? value[0] : typeof value?.first === 'function' ? value.first() : typeof value?.values === 'function' ? value.values().next().value : value; }
function sameActor(candidate: any, bound: any, uuid: string): boolean { return candidate === bound || candidate?.uuid === uuid || candidate?.baseActor?.uuid === uuid || candidate?.token?.baseActor?.uuid === uuid; }
function sameActivityItem(activity: any, item: any): boolean { return activity?.item === item || (activity?.item?.id === item?.id && sameActor(activity?.item?.actor, item?.actor, item?.actor?.uuid ?? '')); }
function assertSceneToken(token: any): void { if (!token?.id || !token?.actor || !token?.document) throw new Error('需要当前场景中的 Token。'); }
function assertSourceToken(token: any, actorKey: string, lookup: (actor: any) => string | undefined): void { assertSceneToken(token); if (lookup(token.actor) !== actorKey) throw new Error('来源 Token 不属于规则绑定角色。'); }
function ruleById<K extends EncounterAutomationRule['kind']>(config: EncounterAutomationConfig, id: string, kind: K): Extract<EncounterAutomationRule, { kind: K }> { const rule = config.rules.find((entry) => entry.id === id && entry.kind === kind); if (!rule) throw new Error(`不存在类型为 ${kind} 的固定规则 ${id}。`); return rule as Extract<EncounterAutomationRule, { kind: K }>; }
function invalidOnSave(value: unknown): never { throw new Error(`原生活动具有不支持的 damage.onSave 值：${String(value)}。`); }
function cloneDamages(damages: any[]): any[] { return damages.map((damage) => ({ ...damage, properties: new Set(damage.properties ?? []) })); }
/**
 * dnd5e has already calculated a DamageSummary before this hook. Its array
 * entries retain every damage/healing/temp/max component while `amount` is the
 * aggregate read by applyDamage. Apply the ward only to non-healing entries,
 * then rebuild that aggregate exactly as dnd5e expects it.
 */
function applyThresholdWardToSummary(
  summary: any,
  state: WardState['state'],
  threshold: number,
  proficiencyBonus: number,
  healingTypes: unknown,
  ruleId: string,
): { total: number; reduced: number; amount: number } | null {
  if (!Array.isArray(summary) || state === 'broken') return null;
  const damages = summary as any[] & { amount: number; temp?: number; tempMax?: number };
  if (damages.some((damage: any) => damage?.active?.[ENCOUNTER_AUTOMATION_FLAG_SCOPE])) return null;
  const configuredHealing = plainRecord(healingTypes) ? healingTypes : { healing: {}, temphp: {}, maximum: {} };
  const relevant = damages.filter((damage: any) => damage && !(damage.type in configuredHealing));
  if (!relevant.length || relevant.some((damage: any) => !Number.isFinite(Number(damage.value)))) return null;
  const total = relevant.reduce((sum: number, damage: any) => sum + Number(damage.value), 0);
  if (total <= threshold) return null;
  const reduced = state === 'full' ? Math.floor(total / 2) : Math.max(0, total - proficiencyBonus);
  if (reduced === total) return null;
  const scale = reduced / total;
  for (const damage of relevant) {
    damage.value *= scale;
    damage.active ??= {};
    damage.active[ENCOUNTER_AUTOMATION_FLAG_SCOPE] = { ruleId };
  }
  // `amount` was calculated before dnd5e.calculateDamage. Preserve the
  // unchanged healing and temporary/max-HP components while substituting only
  // the reduced damage values. This mirrors the locked 5.3.3 runtime helper.
  const tempMax = Number(damages.tempMax ?? 0);
  damages.amount = Math.trunc(damages.reduce((sum: number, damage: any) =>
    sum + (damage.type === 'temphp' || damage.type === 'maximum' ? 0 : Number(damage.value)), 0)
    + Math.min(0, Number.isFinite(tempMax) ? tempMax : 0));
  return { total, reduced, amount: damages.amount };
}
function proficiency(actor: any): number { return Math.max(0, numeric(actor?.system?.attributes?.prof ?? 0, '绑定角色熟练加值')); }
function activeCombat(env: EncounterAutomationEnvironment): any { return env.game?.combat ?? env.game?.combats?.active ?? null; }
function tokenForCombatant(env: EncounterAutomationEnvironment, combat: any, tokenId: string | null): any { if (!tokenId) return null; return env.canvas?.tokens?.get?.(tokenId) ?? (env.canvas?.tokens?.placeables ?? []).find((token: any) => token.id === tokenId) ?? combat?.combatants?.get?.(combat.combatant?.id)?.token; }
function turnSnapshot(combat: any): TurnSnapshot { return { id: combat?.combatant?.id ?? combat?.current?.combatantId ?? null, tokenId: combat?.combatant?.tokenId ?? combat?.combatant?.token?.id ?? null, round: Number(combat?.round ?? combat?.current?.round ?? 0), turn: Number.isInteger(combat?.turn) ? combat.turn : null }; }
function sameScene(combat: any, scene: any): boolean { return !combat?.scene || !scene?.id || combat.scene.id === scene.id || combat.scene === scene; }
function isOwnCurrentTurn(combat: any, source: any): boolean { const current = combat?.combatant; return Boolean(current && (current.tokenId === source.id || current.token?.id === source.id)); }
function targetsFromUsage(env: EncounterAutomationEnvironment, usage: any): any[] { const raw = usage?.targets ?? usage?.targetUuids ?? env.game?.user?.targets; const values = raw instanceof Set ? [...raw] : Array.isArray(raw) ? raw : raw ? collectionValues(raw) : []; return values.map((value) => typeof value === 'string' ? tokenById(env, value) : value?.actor ? value : tokenById(env, value?.id)).filter(Boolean); }
function tokenById(env: EncounterAutomationEnvironment, id: string | undefined): any { return env.canvas?.tokens?.get?.(id) ?? (env.canvas?.tokens?.placeables ?? []).find((token: any) => token.id === id); }
function uniqueSceneTokenForActor(env: EncounterAutomationEnvironment, actor: any, boundUuid: string): any | null { const matches = (env.canvas?.tokens?.placeables ?? []).filter((token: any) => sameActor(token.actor, actor, boundUuid)); return matches.length === 1 ? matches[0] : null; }
/** Resolve a post-use source without collapsing an unlinked token to its blueprint Actor. */
function uniqueSceneTokenForUsageActor(env: EncounterAutomationEnvironment, actor: any, boundUuid: string): any | null {
  const tokens = env.canvas?.tokens?.placeables ?? [];
  const exact = tokens.filter((token: any) => token?.actor === actor || (actor?.uuid && token?.actor?.uuid === actor.uuid));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const bound = tokens.filter((token: any) => sameActor(token.actor, actor, boundUuid));
  return bound.length === 1 ? bound[0] : null;
}
async function consumeNativeActivity(activity: any, usage: any, bypassed: Set<string>, makeKey: (activity: any) => string): Promise<void> { if (typeof activity?.use !== 'function') throw new Error('原生活动 use 接口不可用，未消耗资源。'); const key = makeKey(activity); bypassed.add(key); try { const result = await activity.use({ ...usage, subsequentActions: false }, { configure: false }, { create: true }); if (!result) throw new Error('原生活动被取消，未继续结算。'); } finally { bypassed.delete(key); } }
function center(token: any): { x: number; y: number } { const document = token.document ?? token; return { x: Number(document.x ?? token.x) + Number(token.w ?? document.width ?? 1) * Number(token.scene?.grid?.size ?? token.grid?.size ?? 1) / 2, y: Number(document.y ?? token.y) + Number(token.h ?? document.height ?? 1) * Number(token.scene?.grid?.size ?? token.grid?.size ?? 1) / 2 }; }
function distanceFeet(a: any, b: any, canvas: any): number { const grid = canvas?.grid; if (!grid?.size || !grid?.distance) throw new Error('场景网格距离不可用。'); if (typeof grid.measurePath === 'function') { const result = grid.measurePath([center(a), center(b)]); if (Number.isFinite(result?.distance)) return result.distance; } return Math.hypot(center(a).x - center(b).x, center(a).y - center(b).y) / grid.size * grid.distance; }
function adjacentCandidates(_source: any, target: any, canvas: any): TokenPosition[] { const size = Number(canvas.grid.size); const document = target.document; const width = Number(document.width ?? 1); const height = Number(document.height ?? 1); const cells: TokenPosition[] = []; for (let row = -1; row <= height; row++) for (let col = -1; col <= width; col++) { if (row >= 0 && row < height && col >= 0 && col < width) continue; cells.push({ x: Number(document.x) + col * size, y: Number(document.y) + row * size, w: size, h: size }); } return cells; }
function isFreePosition(position: TokenPosition, tokens: any[], gridSize: number): boolean { return !tokens.some((token) => { const doc = token.document ?? token; const other = { x: Number(doc.x ?? token.x), y: Number(doc.y ?? token.y), w: Number(doc.width ?? 1) * gridSize, h: Number(doc.height ?? 1) * gridSize }; return position.x < other.x + other.w && position.x + position.w > other.x && position.y < other.y + other.h && position.y + position.h > other.y; }); }
function samePosition(a: TokenPosition, b: TokenPosition): boolean { return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h; }
async function chooseAdjacent(env: EncounterAutomationEnvironment, source: any, target: any, rule: EncounterAutomationRule, candidates: TokenPosition[], signal?: AbortSignal): Promise<TokenPosition | null> {
  if (signal?.aborted) return null;
  if (env.chooseAdjacentPlacement) return await abortableSelection(env.chooseAdjacentPlacement({ source, target, rule, candidates }), signal);
  const DialogV2 = env.DialogV2 ?? env.foundry?.applications?.api?.DialogV2;
  if (!DialogV2) throw new Error('GM 相邻格选择界面不可用。');
  return new Promise((resolve) => {
    let done = false;
    let dialog: any;
    let abort: () => void = () => {};
    const finish = (value: TokenPosition | null) => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', abort);
      resolve(value);
    };
    abort = () => { dialog?.close?.(); finish(null); };
    signal?.addEventListener('abort', abort, { once: true });
    const buttons = candidates.map((position, index) => ({ action: `cell-${index}`, label: `相邻格 ${index + 1}`, callback: () => finish(position) }));
    buttons.push({ action: 'cancel', label: '取消', callback: () => finish(null) });
    dialog = new DialogV2({ window: { title: '选择召唤物相邻格' }, content: '<p>请选择一个空的相邻网格；取消不会创建召唤物。</p>', buttons, close: () => finish(null) });
    dialog.render({ force: true });
    if (signal?.aborted) abort();
  });
}
function abortableSelection(selection: Promise<TokenPosition | null>, signal?: AbortSignal): Promise<TokenPosition | null> {
  if (!signal) return selection;
  return new Promise((resolve, reject) => {
    let done = false;
    let abort: () => void = () => {};
    const finish = (value: TokenPosition | null) => { if (!done) { done = true; signal.removeEventListener('abort', abort); resolve(value); } };
    abort = () => finish(null);
    signal.addEventListener('abort', abort, { once: true });
    selection.then(finish, (error) => { if (!done) { done = true; signal.removeEventListener('abort', abort); reject(error); } });
  });
}
function nextTargetTurnEnd(combat: any, tokenId: string): { tokenId: string; round: number } {
  const turns = Array.isArray(combat?.turns) ? combat.turns : collectionValues(combat?.combatants);
  const targetIndex = turns.findIndex((combatant: any) => combatant.tokenId === tokenId || combatant.token?.id === tokenId);
  const currentIndex = Number.isInteger(combat?.turn) ? combat.turn : turns.findIndex((combatant: any) => combatant.id === combat?.combatant?.id);
  if (targetIndex < 0 || currentIndex < 0) throw new Error('状态持续时间需要目标和当前回合都在现有战斗顺序中。');
  return { tokenId, round: numeric(combat?.round, '战斗轮次') + (targetIndex <= currentIndex ? 1 : 0) };
}
/** The next own start is this round only when the source has not acted yet. */
function nextOwnTurnStart(combat: any, tokenId: string): { tokenId: string; round: number } {
  const turns = Array.isArray(combat?.turns) ? combat.turns : collectionValues(combat?.combatants);
  const ownIndex = turns.findIndex((combatant: any) => combatant.tokenId === tokenId || combatant.token?.id === tokenId);
  const currentIndex = Number.isInteger(combat?.turn) ? combat.turn : turns.findIndex((combatant: any) => combatant.id === combat?.combatant?.id);
  if (ownIndex < 0 || currentIndex < 0) throw new Error('守护破裂需要来源和当前回合位于现有战斗顺序中。');
  return { tokenId, round: numeric(combat?.round, '战斗轮次') + (ownIndex > currentIndex ? 0 : 1) };
}
function showPanel(env: EncounterAutomationEnvironment, options: EncounterAutomationInstallOptions, actors: Map<string, any>, history: readonly EncounterAutomationHistoryEntry[], setActivityDisabled: EncounterAutomationHandle['setActivityDisabled']): unknown {
  const details = options.config.rules.map((rule) => `<li>${escapeHtml(panelRuleLabel(rule.kind))}（${escapeHtml(rule.itemName)}）</li>`).join('');
  const wardStates = panelWardStates(env, options);
  const wardContent = wardStates.length ? `<section class="forge-encounter-control-section"><h2>守护状态</h2><ul>${wardStates.map((entry) => `<li>${escapeHtml(entry.name)}：${escapeHtml(wardStateLabel(entry.state))}</li>`).join('')}</ul></section>` : '';
  const locks = options.config.rules.filter((rule): rule is Extract<EncounterAutomationRule, { kind: 'gm-activity-lock' }> => rule.kind === 'gm-activity-lock');
  const manuals = options.config.rules.filter((rule): rule is Extract<EncounterAutomationRule, { kind: 'gm-manual' }> => rule.kind === 'gm-manual');
  type PanelSource = { actorKey: string; token?: any; actor: any; label: string;
    abilities: Array<{ ruleId: string; itemName: string }>;
    manuals: Array<Extract<EncounterAutomationRule, { kind: 'gm-manual' }>> };
  const sources: PanelSource[] = [];
  for (const actorKey of new Set([...locks, ...manuals].map((rule) => rule.actorKey))) {
    const bound = actors.get(actorKey);
    const tokens = (env.canvas?.tokens?.placeables ?? []).filter((token: any) => token?.actor && sameActor(token.actor, bound, options.bindings[actorKey]!));
    const variants = tokens.length ? tokens.map((token: any) => ({ actor: token.actor, token,
      label: `${token.name ?? token.actor.name ?? actorKey} · Token ${token.id}` }))
      : [{ actor: bound, label: `${bound?.name ?? actorKey}（世界 Actor；当前场景无来源 Token）` }];
    for (const variant of variants) sources.push({ actorKey, ...variant,
      abilities: locks.filter((rule) => rule.actorKey === actorKey).flatMap((rule) => rule.parameters.activityItemNames.map((itemName) => ({ ruleId: rule.id, itemName }))),
      manuals: manuals.filter((rule) => rule.actorKey === actorKey) });
  }
  const sourceContent = sources.length ? `<section class="forge-encounter-control-section" data-source-section>
    <label>当前来源<select data-source>${sources.map((source, index) => `<option value="${index}">${escapeHtml(source.label)}</option>`).join('')}</select></label>
    <p class="forge-encounter-control-identity" data-source-identity></p>
  </section>` : '';
  const lockContent = locks.length ? `<section class="forge-encounter-control-section" data-lock-section>
    <h2>能力可用性</h2><p>GM 确认来源条件后选择具体能力；本控制器不判断 Bloodied、重击或随机结果。恢复须由 GM 明确操作。</p>
    <label>能力<select data-lock-ability></select></label>
    <div class="forge-encounter-control-action"><p data-lock-state aria-live="polite"></p><button type="button" data-lock-toggle>禁用</button></div>
    <p class="forge-encounter-control-error" data-lock-error role="alert" hidden></p>
    <details><summary>全部能力与状态</summary><ul data-lock-inventory></ul></details>
    <p class="forge-encounter-control-note">非链接 Token 状态独立；链接 Token 共享世界 Actor 状态。无来源 Token 时不能更改可用性。</p>
  </section>` : '';
  const manualContent = manuals.length ? `<section class="forge-encounter-control-section" data-manual-section><h2>GM 裁定</h2>
    <p>这里只打开原生 Item 规则；不会自动执行、施加状态或扣资源。</p>
    <label>规则<select data-manual-rule></select></label>
    <div class="forge-encounter-control-action"><p data-manual-identity></p><button type="button" data-manual-view>查看规则</button></div>
    <p class="forge-encounter-control-error" data-manual-error role="alert" hidden></p>
  </section>` : '';
  const content = `<div class="forge-encounter-control" data-encounter-panel><p class="forge-encounter-control-intro">固定规则控制器已启用。未列出的能力继续使用原生 dnd5e 活动；来源未写出的裁定由 GM 确认。</p>
    ${sourceContent}${lockContent}${manualContent}${wardContent}
    <details class="forge-encounter-control-section"><summary>已绑定规则（${options.config.rules.length}）</summary><ul>${details}</ul></details>
    <p class="forge-encounter-control-events">事件摘要：已记录 ${history.length} 条有界事件。</p></div>`;
  const DialogV2 = env.DialogV2 ?? env.foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return { content };
  let sourceIndex = 0; let abilityKey = ''; let manualKey = '';
  const liveToken = (token: any, actorKey: string): any => {
    const current = env.canvas?.tokens?.get?.(token?.id);
    if (current !== token || !sameActor(current?.actor, actors.get(actorKey), options.bindings[actorKey]!)) throw new Error('来源 Token 已离开当前场景或绑定身份已变化；请重新打开控制面板。');
    return current;
  };
  const dialog = new class extends DialogV2 {
    constructor(dialogOptions: any) { super(dialogOptions); }
    async _onRender(context: any, renderOptions: any) {
      await super._onRender(context, renderOptions);
      const root = this.element.querySelector('[data-encounter-panel]') as HTMLElement | null;
      if (!root) return;
      const sourceSelect = root.querySelector('[data-source]') as HTMLSelectElement | null;
      const sourceIdentity = root.querySelector('[data-source-identity]') as HTMLElement | null;
      const lockAbility = root.querySelector('[data-lock-ability]') as HTMLSelectElement | null;
      const lockButton = root.querySelector('[data-lock-toggle]') as HTMLButtonElement | null;
      const lockState = root.querySelector('[data-lock-state]') as HTMLElement | null;
      const lockInventory = root.querySelector('[data-lock-inventory]') as HTMLElement | null;
      const lockError = root.querySelector('[data-lock-error]') as HTMLElement | null;
      const manualRule = root.querySelector('[data-manual-rule]') as HTMLSelectElement | null;
      const manualButton = root.querySelector('[data-manual-view]') as HTMLButtonElement | null;
      const manualIdentity = root.querySelector('[data-manual-identity]') as HTMLElement | null;
      const manualError = root.querySelector('[data-manual-error]') as HTMLElement | null;
      let lockPending = false; let manualPending = false;
      const setError = (element: HTMLElement | null, message: string) => { if (element) { element.textContent = message; element.hidden = !message; } };
      const source = () => sources[sourceIndex];
      const ability = () => source()?.abilities.find((entry) => `${entry.ruleId}\u0000${entry.itemName}` === abilityKey);
      const manual = () => source()?.manuals.find((entry) => `${entry.id}\u0000${entry.itemName}` === manualKey);
      const fillAbilities = () => {
        if (!lockAbility) return;
        const choices = source()?.abilities ?? [];
        if (lockAbility.options.length !== choices.length || choices.some((entry, index) => lockAbility.options[index]?.textContent !== entry.itemName)) {
          lockAbility.replaceChildren(...choices.map((entry, index) => {
            const option = root.ownerDocument.createElement('option'); option.value = String(index); option.textContent = entry.itemName; return option;
          }));
        }
        let selectedIndex = choices.findIndex((entry) => `${entry.ruleId}\u0000${entry.itemName}` === abilityKey);
        if (selectedIndex < 0) selectedIndex = choices.findIndex((entry) => entry.itemName === abilityKey.split('\u0000')[1]);
        if (selectedIndex < 0) selectedIndex = 0;
        const selected = choices[selectedIndex];
        abilityKey = selected ? `${selected.ruleId}\u0000${selected.itemName}` : '';
        lockAbility.value = selected ? String(selectedIndex) : '';
      };
      const fillManualRules = () => {
        if (!manualRule) return;
        const choices = source()?.manuals ?? [];
        if (manualRule.options.length !== choices.length || choices.some((entry, index) => manualRule.options[index]?.textContent !== entry.itemName)) {
          manualRule.replaceChildren(...choices.map((entry, index) => {
            const option = root.ownerDocument.createElement('option'); option.value = String(index); option.textContent = entry.itemName; return option;
          }));
        }
        let selectedIndex = choices.findIndex((entry) => `${entry.id}\u0000${entry.itemName}` === manualKey);
        if (selectedIndex < 0) selectedIndex = choices.findIndex((entry) => entry.itemName === manualKey.split('\u0000')[1]);
        if (selectedIndex < 0) selectedIndex = 0;
        const selected = choices[selectedIndex];
        manualKey = selected ? `${selected.id}\u0000${selected.itemName}` : '';
        manualRule.value = selected ? String(selectedIndex) : '';
      };
      const refresh = () => {
        const selected = source();
        if (sourceSelect && sourceIdentity) {
          sourceSelect.value = selected ? String(sourceIndex) : '';
          sourceSelect.disabled = lockPending || manualPending || !sources.length;
          sourceIdentity.textContent = selected?.label ?? '没有已绑定来源。';
        }
        if (lockAbility && lockButton && lockState && lockInventory) {
          fillAbilities();
          const selectedAbility = ability();
          const available = selected?.token && env.canvas?.tokens?.get?.(selected.token.id) === selected.token;
          const disabled = selectedAbility && selected ? panelDisabledActivities(selected.actor, options, selectedAbility.ruleId).includes(selectedAbility.itemName) : false;
          lockState.textContent = lockPending ? '正在保存可用性…' : !selectedAbility ? '此来源没有能力可用性规则' : !available ? '当前来源没有场景 Token；不能更改可用性' : `${selectedAbility.itemName}：${disabled ? '已禁用' : '可用'}`;
          lockButton.textContent = lockPending ? '保存中…' : disabled ? '明确恢复' : '禁用';
          lockAbility.disabled = lockPending || !selected?.abilities.length;
          lockButton.disabled = lockPending || !available || !selectedAbility;
          lockInventory.replaceChildren(...(selected?.abilities ?? []).map((entry) => {
            const li = root.ownerDocument.createElement('li');
            li.textContent = `${entry.itemName}：${selected?.token && panelDisabledActivities(selected.actor, options, entry.ruleId).includes(entry.itemName) ? '已禁用' : '可用'}`;
            return li;
          }));
        }
        if (manualRule && manualButton && manualIdentity) {
          fillManualRules();
          const selectedRule = manual();
          manualIdentity.textContent = selectedRule ? `${selectedRule.itemName}：仅查看原生规则` : '此来源没有 GM 裁定规则';
          manualRule.disabled = manualPending || !selected?.manuals.length;
          manualButton.disabled = manualPending || !selectedRule;
          manualButton.textContent = manualPending ? '打开中…' : '查看规则';
        }
        // Content can change without an Application render. Reuse Core's
        // viewport clamp so a taller floating window keeps its footer visible.
        this.setPosition();
      };
      sourceSelect?.addEventListener('change', () => { sourceIndex = Number(sourceSelect.value); setError(lockError, ''); setError(manualError, ''); refresh(); });
      lockAbility?.addEventListener('change', () => {
        const chosen = source()?.abilities[Number(lockAbility.value)];
        abilityKey = chosen ? `${chosen.ruleId}\u0000${chosen.itemName}` : '';
        setError(lockError, ''); refresh();
      });
      lockButton?.addEventListener('click', async () => {
        const selected = source(); const selectedAbility = ability();
        if (!selected?.token || !selectedAbility || lockPending) return;
        lockPending = true; setError(lockError, ''); refresh();
        try {
          const token = liveToken(selected.token, selected.actorKey);
          const disabled = panelDisabledActivities(token.actor, options, selectedAbility.ruleId).includes(selectedAbility.itemName);
          await setActivityDisabled(selectedAbility.ruleId, token, selectedAbility.itemName, !disabled);
        } catch (error) { setError(lockError, error instanceof Error ? error.message : String(error)); }
        finally { lockPending = false; refresh(); lockButton.focus(); }
      });
      manualRule?.addEventListener('change', () => {
        const chosen = source()?.manuals[Number(manualRule.value)];
        manualKey = chosen ? `${chosen.id}\u0000${chosen.itemName}` : '';
        setError(manualError, ''); refresh();
      });
      manualButton?.addEventListener('click', async () => {
        const selected = source(); const selectedRule = manual();
        if (!selected || !selectedRule || manualPending) return;
        manualPending = true; setError(manualError, ''); refresh();
        try {
          if (!isActiveGm(env)) throw new Error('只有当前活动 GM 可以查看战斗裁定入口。');
          const actor = selected.token ? liveToken(selected.token, selected.actorKey).actor : selected.actor;
          if (!selected.token) assertBoundActor(actor, selected.actorKey, options.bindings[selected.actorKey]!, options);
          const items = collectionValues(actor?.items).filter((item: any) => item?.name === selectedRule.itemName);
          if (items.length !== 1 || typeof items[0]?.sheet?.render !== 'function') throw new Error(`GM 裁定的原生物品“${selectedRule.itemName}”缺失或无法打开。`);
          await items[0].sheet.render({ force: true });
        } catch (error) { setError(manualError, error instanceof Error ? error.message : String(error)); }
        finally { manualPending = false; refresh(); }
      });
      root.addEventListener('focusin', refresh);
      root.addEventListener('toggle', () => this.setPosition(), true);
      refresh();
    }
  }({ classes: ['fvtt-json-forge', 'forge-encounter-control-window'], position: { width: 720 }, window: { title: 'FVTT JSON Forge · 战斗控制', resizable: true }, content, buttons: [
    { action: 'stop', label: '停用自动化', callback: async () => {
      const stop = env.game?.modules?.get?.(ENCOUNTER_AUTOMATION_FLAG_SCOPE)?.api?.stopEncounterAutomation;
      if (typeof stop !== 'function') {
        const message = '模块停用接口不可用；无法持久停用自动化。';
        env.notify?.('error', message);
        throw new Error(message);
      }
      return stop(options.packageId);
    } },
    { action: 'close', label: '关闭', default: true },
  ] });
  return dialog.render({ force: true });
}
function panelRuleLabel(kind: EncounterAutomationRule['kind']): string {
  return ({
    'save-summon': '豁免伤害与召唤',
    'turn-start-area': '自身回合范围效果',
    'staged-corruption': '分阶段腐化',
    'threshold-ward': '伤害阈值守护',
    'ward-break': '守护破裂与恢复',
    'save-failure-effect': '豁免失败状态与期限',
    'status-lifecycle': '命中状态与再次豁免',
    'gm-activity-lock': 'GM 能力可用性控制',
    'gm-manual': 'GM 裁定',
  } as const)[kind];
}
function panelDisabledActivities(actor: any, options: EncounterAutomationInstallOptions, ruleId: string): string[] {
  const state = automationStates(actor).find(entry => entry.packageId === options.packageId && entry.packageHash === options.packageHash);
  return state?.packageId === options.packageId && state?.packageHash === options.packageHash && Array.isArray(state?.disabledActivities?.[ruleId]) ? state.disabledActivities[ruleId].map((entry: any) => entry.itemName) : [];
}
function wardStateLabel(state: WardState['state']): string { return ({ full: '完整', broken: '碎裂', weakened: '削弱' } as const)[state]; }
function panelWardStates(env: EncounterAutomationEnvironment, options: EncounterAutomationInstallOptions): Array<{ name: string; state: WardState['state'] }> {
  const wards = options.config.rules.filter((rule): rule is Extract<EncounterAutomationRule, { kind: 'threshold-ward' }> => rule.kind === 'threshold-ward');
  const states: Array<{ name: string; state: WardState['state'] }> = [];
  for (const rule of wards) {
    const uuid = options.bindings[rule.actorKey];
    const sceneActors = (env.canvas?.tokens?.placeables ?? [])
      .filter((token: any) => token?.actor && (token.actor.uuid === uuid || token.actor.baseActor?.uuid === uuid))
      .map((token: any) => ({ name: token.name ?? token.actor.name ?? rule.actorKey, actor: token.actor }));
    const actors = sceneActors.length ? sceneActors : [{ name: env.game?.actors?.get?.(uuid?.slice(6))?.name ?? rule.actorKey, actor: env.game?.actors?.get?.(uuid?.slice(6)) }];
    for (const entry of actors) states.push({ name: entry.name, state: panelWardState(entry.actor, options, rule.id) });
  }
  return states;
}
function panelWardState(actor: any, options: EncounterAutomationInstallOptions, ruleId: string): WardState['state'] {
  const state = automationStates(actor).find(entry => entry.packageId === options.packageId && entry.packageHash === options.packageHash);
  if (state?.packageId !== options.packageId || state?.packageHash !== options.packageHash) return 'full';
  const value = state?.wards?.[ruleId]?.state;
  return value === 'broken' || value === 'weakened' ? value : 'full';
}
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!)); }
