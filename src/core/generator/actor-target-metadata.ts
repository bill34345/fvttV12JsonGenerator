import { getFoundryTarget, type FvttTargetVersion } from '../foundryTarget';

export function normalizeTargetUses(
  uses: Record<string, unknown>,
  fvttVersion: FvttTargetVersion,
): Record<string, unknown> {
  if (fvttVersion !== '14') return uses;
  const normalized = { ...uses };
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

    if (fvttVersion === '14') {
      delete item.system?.activation;
      if (item.system?.uses) {
        item.system.uses = normalizeTargetUses(item.system.uses, fvttVersion);
      }
    }

    for (const activity of Object.values(item.system?.activities ?? {}) as any[]) {
      if (!activity || typeof activity !== 'object') continue;
      if (activity.uses) {
        activity.uses = normalizeTargetUses(activity.uses, fvttVersion);
      }
    }
  }
}
