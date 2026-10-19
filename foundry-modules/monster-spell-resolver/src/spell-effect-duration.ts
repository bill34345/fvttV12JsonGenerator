import type { NativeCastActivitySource } from './cast-activity';
import { assertNativeCacheProjectionMatches } from './native-cache-lifecycle';

// Reviewed source semantics: the PHB 2024 Disguise Self appearance effect
// lasts for the Spell's lifetime. A coincidentally equal timer in another
// effect/source is not evidence of inheritance. New bindings need source review.
const REVIEWED_LIFETIME_EFFECTS = [{
  sourceUuid: 'Compendium.dnd-players-handbook.spells.Item.phbsplDisguiseSe',
  identifier: 'disguise-self', effectId: 'SrIb7dbaZs5F4zi9',
}];

/**
 * A Cast duration override changes the Spell/Activity but dnd5e copies source
 * ActiveEffect durations unchanged. Only linked, non-transfer base effects
 * whose elapsed duration exactly equals the source Spell's duration inherit
 * this override. Different/untimed/round-based effects keep their own rules.
 * This plans data for an already strictly owned cache, never a Compendium.
 */
export function planSpellEffectDuration(
  nativeSource: Record<string, any>,
  cacheSource: Record<string, any>,
  override: NativeCastActivitySource['duration'],
): { effects: any[]; changedEffectIds: string[]; unresolvedEffectIds: string[] } {
  const effects: any[] = structuredClone(cacheSource.effects ?? []);
  const changedEffectIds: string[] = [];
  const unresolvedEffectIds: string[] = [];
  if (!override) return { effects, changedEffectIds, unresolvedEffectIds };
  const baseSeconds = spellSeconds(nativeSource.system?.duration);
  const overrideSeconds = spellSeconds(override);
  if (baseSeconds === undefined || overrideSeconds === undefined || baseSeconds === overrideSeconds) {
    return { effects, changedEffectIds, unresolvedEffectIds };
  }
  const activities = Object.values(nativeSource.system?.activities ?? {}) as any[];
  const referenced = new Set(activities.flatMap(activity => (activity.effects ?? []).map((ref: any) => ref._id)));
  for (const original of nativeSource.effects ?? []) {
    if (original.type !== 'base' || original.transfer !== false || !referenced.has(original._id)) continue;
    const duration = original.duration;
    // Core 14 elapsed durations. Other units are not converted using a guessed
    // round length; null durations do not become new indefinite/timed effects.
    if (duration?.units !== 'seconds' || duration?.value !== baseSeconds) continue;
    if (!REVIEWED_LIFETIME_EFFECTS.some(binding => binding.sourceUuid === nativeSource._stats?.compendiumSource
      && binding.identifier === nativeSource.system?.identifier && binding.effectId === original._id)) {
      unresolvedEffectIds.push(original._id);
      continue;
    }
    const matches = effects.filter(effect => effect._id === original._id);
    if (matches.length !== 1) throw Error('Source-linked duration effect must identify exactly one owned cache effect.');
    const actual = matches[0];
    if (actual.duration?.units !== 'seconds' || ![baseSeconds, overrideSeconds].includes(actual.duration?.value)) {
      throw Error('Owned cache effect duration diverged from the source-bound override.');
    }
    const comparable = structuredClone(actual);
    comparable.duration.value = baseSeconds;
    assertNativeCacheProjectionMatches({ effects: [original] }, { effects: [comparable] });
    if (actual.duration.value === overrideSeconds) continue;
    actual.duration.value = overrideSeconds;
    changedEffectIds.push(original._id);
  }
  return { effects, changedEffectIds, unresolvedEffectIds };
}

function spellSeconds(duration: any): number | undefined {
  if (!duration || !/^[0-9]+(?:\.[0-9]+)?$/u.test(String(duration.value))) return;
  const units: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400 };
  const multiplier = units[duration.units];
  const value = Number(duration.value) * (multiplier ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
