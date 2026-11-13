import { isVersionInMajor } from '@fvtt-json-generator/contracts/version-admission';

/** Preserve native independent riders when DAE has already projected the same static condition. */
export async function ensureNativeStatusRiders(options: {
  actor: any; primary: any; status: string; configurationFor(id: string): any; dae: any;
  modifyBatch(entries: any[]): Promise<unknown>;
  assertLive(): void; record(type: string, detail: Record<string, unknown>): void;
}): Promise<void> {
  const { actor, primary, status, configurationFor, dae, assertLive, record } = options;
  const configuredRiders: string[] = configurationFor(status)?.riders ?? [];
  if (!configuredRiders.length) return;
  assertLive();
  if (!primary || primary.disabled || primary.active === false || primary.isSuppressed
    || typeof primary.system?.collectRiders !== 'function') throw new Error('原生主状态或独立后果接口不可用，请GM核对。');
  const immunities = actor.system?.traits?.ci?.value;
  const riders = configuredRiders.filter(rider => {
    const immune = typeof immunities?.has === 'function' ? immunities.has(rider) : Array.isArray(immunities) && immunities.includes(rider);
    if (immune) record('status-lifecycle-rider-immune', { status, rider, actorUuid: actor.uuid });
    return !immune;
  });
  if (!riders.length) return;
  const batch = await primary.system.collectRiders();
  if (batch.length) await options.modifyBatch(batch);
  assertLive();
  const effects = () => Array.isArray(actor.effects) ? actor.effects : actor.effects?.contents ?? [];
  for (const rider of riders) {
    const configured = configurationFor(rider);
    const canonical = effects().find((effect: any) => effect.id === configured?._id);
    if (!canonical || canonical.disabled || canonical.active === false || canonical.isSuppressed) {
      throw new Error(`原生独立后果 ${rider} 未就绪，请GM核对。`);
    }
    if (canonical.flags?.dae?.autoCreated !== true) continue;
    const source = canonical.toObject();
    const flags = source.flags ?? {}, daeFlags = flags.dae ?? {};
    const hasDuration = ['value', 'seconds', 'rounds', 'turns'].some(key => Number(source.duration?.[key] ?? 0) > 0)
      || !!source.duration?.expiry || canonical.isTemporary === true;
    const pureProjection = [...canonical.statuses].length === 1 && canonical.statuses.has(rider)
      && !source.origin && !Object.values(source.system?.origin??{}).some(Boolean) && source.transfer !== true && !hasDuration
      && !(source.system?.changes?.length || source.changes?.length)
      && Object.keys(flags).every(key => key === 'dae')
      && Object.keys(daeFlags).every(key => key === 'autoCreated' || key === 'specialDuration')
      && (!daeFlags.specialDuration || (Array.isArray(daeFlags.specialDuration) && daeFlags.specialDuration.length === 0));
    if (!dae?.active || !isVersionInMajor(dae.version, '14.6.5') || !pureProjection) {
      throw new Error('独立状态后果与未知版本或外部来源的DAE效果重叠，请GM核对；未接管该效果。');
    }
    // Keep the native ID, all rule/source data and normal sheet removal. Only
    // remove DAE's transient-output designation now that a real native rider exists.
    assertLive();
    await canonical.update({ 'flags.dae.autoCreated': false });
    assertLive();
    const fresh = effects().find((effect: any) => effect.id === canonical.id);
    if (!fresh || fresh.flags?.dae?.autoCreated !== false) throw new Error('独立状态后果读回不一致，请GM核对。');
    record('status-lifecycle-independent-rider', { status, rider, effectId: canonical.id, adapter: 'dae-14.6.5', daeVersion: dae.version });
  }
}
