import { getFoundryTarget, type FvttTargetVersion } from './target';
import { createStableDocumentId } from './stableId';

export function applyActivityTargetFields(activity: any, fvttVersion: FvttTargetVersion): void {
  if (fvttVersion !== '14' || !activity.range) return;
  const range = activity.range;
  const rangedValue = range.value;
  if (range.reach != null && activity.attack?.type?.value === 'melee') {
    range.value = range.reach;
    range.override = true;
  }
  if (range.long != null) {
    const distance = activity.attack?.type?.value === 'melee' && rangedValue != null ? `${rangedValue}/${range.long}` : String(range.long);
    range.special = [range.special, `远射程 ${distance} ${range.units === 'ft' ? '尺' : range.units}`].filter(Boolean).join('；');
  }
  range.value = range.value == null ? '' : String(range.value);
  delete range.reach;
  delete range.long;
}

export function applyItemActivityTargetFields(item: any, fvttVersion: FvttTargetVersion): void {
  const activities = item.system?.activities ?? {};
  const range = item.system?.range;
  const entries = Object.values<any>(activities);
  if (fvttVersion === '14' && item.type === 'weapon' && range?.reach > 0 && range.value > 0 && range.long > 0
    && !entries.some(activity => activity.type === 'attack' && activity.attack?.type?.value === 'ranged')) {
    const melee = entries.find(activity => activity.type === 'attack' && activity.attack?.type?.value === 'melee'
      && !activity.flags?.fvttJsonGenerator?.sourceOperation);
    if (melee) {
      const ranged = structuredClone(melee);
      ranged._id = createStableDocumentId({ activity: melee._id, mode: 'ranged' });
      ranged.name = '远程 Ranged';
      ranged.attack.type.value = 'ranged';
      ranged.range = { value: String(range.value), units: range.units, override: true, special: `远射程 ${range.long} ${range.units === 'ft' ? '尺' : range.units}` };
      activities[ranged._id] = ranged;
    }
  }
  for (const activity of Object.values(activities)) applyActivityTargetFields(activity, fvttVersion);
}

export function applyEffectTargetFields(effect: any, fvttVersion: FvttTargetVersion, scope: string): void {
  if (fvttVersion !== '14') return;
  effect._id ??= createStableDocumentId({ kind: 'effect', scope });
  effect.type = effect.type === 'enchantment' ? 'enchantment' : 'base';
  effect.system ??= {};
  const modes: Record<number, string> = { 0: 'custom', 1: 'multiply', 2: 'add', 3: 'downgrade', 4: 'upgrade', 5: 'override' };
  effect.system.changes = (effect.system.changes ?? effect.changes ?? []).map((change: any, index: number) => {
    const { mode, ...native } = change;
    return { ...native, _id: change._id ?? createStableDocumentId(`${scope}/changes/${index}`),
      type: change.type ?? modes[mode] ?? 'custom', phase: change.phase ?? 'initial' };
  });
  delete effect.changes;
  const duration = effect.duration ?? {};
  const unit = ['seconds', 'turns', 'rounds'].find(key => typeof duration[key] === 'number');
  const value = Object.hasOwn(duration, 'value') ? duration.value : (unit ? duration[unit] : null);
  effect.duration = { value, units: duration.units ?? unit ?? 'seconds',
    expiry: Object.hasOwn(duration, 'expiry') ? duration.expiry : (typeof value === 'number' ? 'turnStart' : null), expired: duration.expired ?? false };
  if (!Object.hasOwn(effect, 'start')) effect.start = typeof duration.startTime === 'number'
    ? { combat: duration.combat, round: duration.startRound, time: duration.startTime, turn: duration.startTurn }
    : null;
}

export function normalizeTargetUses(
  uses: Record<string, unknown>,
  fvttVersion: FvttTargetVersion,
): Record<string, unknown> {
  const normalized = { ...uses };
  if (normalized.spent === undefined) {
    const max = typeof normalized.max === 'number'
      ? normalized.max
      : Number.parseInt(String(normalized.max ?? ''), 10);
    const remaining = typeof normalized.value === 'number'
      ? normalized.value
      : Number.parseInt(String(normalized.value ?? ''), 10);
    normalized.spent = Number.isFinite(max) && Number.isFinite(remaining)
      ? Math.max(0, max - remaining)
      : 0;
  }
  if (!Array.isArray(normalized.recovery)) {
    normalized.recovery = normalized.per
      ? [{ period: String(normalized.per), type: 'recoverAll' }]
      : [];
  }
  delete normalized.value;
  delete normalized.per;
  if (typeof normalized.max === 'number') {
    normalized.max = String(normalized.max);
  }
  return normalized;
}

export function applyActorTargetMetadata(
  actor: any,
  fvttVersion: FvttTargetVersion,
): void {
  const stats = getFoundryTarget(fvttVersion).stats;
  const applyDocumentStats = (document: any): void => {
    if (!document || typeof document !== 'object') return;
    document._stats = {
      ...(document._stats ?? {}),
      coreVersion: stats.coreVersion,
      systemId: stats.systemId,
      systemVersion: stats.systemVersion,
    };
  };
  const normalizeEffects = (effects: unknown, scope: string): void => {
    if (!Array.isArray(effects)) return;
    for (const [index, effect] of effects.entries()) {
      applyEffectTargetFields(effect, fvttVersion, `${scope}/${effect.name}/${index}`);
      applyDocumentStats(effect);
    }
  };

  applyDocumentStats(actor);
  normalizeEffects(actor.effects, actor.name);

  for (const [index, item] of (actor.items ?? []).entries()) {
    if (fvttVersion === '14') item._id ??= createStableDocumentId({ kind: 'item', actor: actor.name, index, name: item.name, type: item.type });
    applyDocumentStats(item);
    normalizeEffects(item.effects, `${actor.name}/items/${index}/${item.name}`);

    delete item.system?.activation;
    if (fvttVersion === '14' && item.system?.rarity !== undefined) {
      item.system.rarities = item.system.rarity ? [item.system.rarity] : [];
      delete item.system.rarity;
    }
    if (fvttVersion === '14' && item.system?.magicalBonus !== undefined) item.system.magicalBonus = String(item.system.magicalBonus ?? '');
    applyItemActivityTargetFields(item, fvttVersion);
    if (item.system?.uses) {
      item.system.uses = normalizeTargetUses(item.system.uses, fvttVersion);
    }

    for (const activity of Object.values(item.system?.activities ?? {}) as any[]) {
      if (!activity || typeof activity !== 'object') continue;
      applyActivityTargetFields(activity, fvttVersion);
      if (activity.uses) {
        activity.uses = normalizeTargetUses(activity.uses, fvttVersion);
      }
    }
  }
}
