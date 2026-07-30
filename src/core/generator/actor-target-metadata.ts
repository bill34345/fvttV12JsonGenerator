import { getFoundryTarget, type FvttTargetVersion } from '../foundryTarget';

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
  const normalizeEffects = (effects: unknown): void => {
    if (!Array.isArray(effects)) return;
    for (const effect of effects) {
      applyDocumentStats(effect);
    }
  };

  applyDocumentStats(actor);
  normalizeEffects(actor.effects);

  for (const item of actor.items ?? []) {
    applyDocumentStats(item);
    normalizeEffects(item.effects);

    delete item.system?.activation;
    if (item.system?.uses) {
      item.system.uses = normalizeTargetUses(item.system.uses, fvttVersion);
    }

    for (const activity of Object.values(item.system?.activities ?? {}) as any[]) {
      if (!activity || typeof activity !== 'object') continue;
      if (activity.uses) {
        activity.uses = normalizeTargetUses(activity.uses, fvttVersion);
      }
    }
  }
}
