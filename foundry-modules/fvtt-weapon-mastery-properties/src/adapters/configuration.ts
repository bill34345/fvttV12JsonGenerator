import {
  parseWeaponConfiguration,
  weaponCriticalBonus,
  type WeaponConfiguration,
} from '@fvtt-json-generator/contracts/weapon-properties';

/**
 * The generator records the native Deadly term on each generated attack
 * Activity.  Runtime configuration may replace or remove that term, but it
 * must never guess which identical term belongs to this module.
 */
export const DEADLY_CONTRIBUTION_PATH = 'flags.fvttJsonGenerator.weaponPropertyContributions.deadly' as const;

export type WeaponConfigurationUpdateBlockReason =
  | 'invalid-item'
  | 'invalid-configuration'
  | 'invalid-activity-id'
  | 'malformed-contribution-container'
  | 'malformed-contribution-marker'
  | 'unsupported-critical-formula'
  | 'missing-owned-bonus'
  | 'ambiguous-owned-bonus';

export interface WeaponConfigurationUpdatePlan {
  status: 'ready' | 'blocked';
  changed: boolean;
  updates: Readonly<Record<string, unknown>>;
  activityIds: readonly string[];
  reason?: WeaponConfigurationUpdateBlockReason;
}

interface OwnedContribution {
  ruleId: string;
  bonus: string;
  [key: string]: unknown;
}

interface ActivityEntry {
  id: string;
  activity: Record<string, any>;
}

const VALID_ACTIVITY_ID = /^[A-Za-z0-9_-]+$/u;
const VALID_DICE_BONUS = /^(?:[1-9]\d*)d(?:4|6|8|10|12)$/u;
const MAX_FORMULA_LENGTH = 400;

/**
 * Build the flattened Foundry update payload for a weapon configuration edit.
 *
 * The returned payload only touches generated attack Activities which carry
 * the generator's Deadly provenance marker.  A caller should apply it with
 * `item.update(plan.updates)` before persisting the module configuration.
 * The helper is deliberately pure and does not mutate the Item or any of its
 * Activities.
 */
export function planWeaponConfigurationUpdate(
  item: unknown,
  nextConfiguration: unknown,
): WeaponConfigurationUpdatePlan {
  if (!isObject(item) || item.type !== 'weapon') return blocked('invalid-item');
  const configuration = parseWeaponConfiguration(nextConfiguration);
  if (!configuration) return blocked('invalid-configuration');

  const entries = activityEntries(item.system?.activities);
  const desiredBonus = configuration.enabled ? weaponCriticalBonus(configuration) : null;
  const updates: Record<string, unknown> = {};
  const activityIds: string[] = [];

  for (const { id, activity } of entries) {
    if (!VALID_ACTIVITY_ID.test(id)) return blocked('invalid-activity-id');

    const markerState = readContributionMarker(activity);
    if (markerState.kind === 'invalid-container') return blocked('malformed-contribution-container');
    if (markerState.kind === 'invalid-marker') return blocked('malformed-contribution-marker');
    if (markerState.kind === 'absent') continue;
    if (activity.type !== 'attack') return blocked('malformed-contribution-marker');

    const marker = markerState.value;
    const current = activity.damage?.critical?.bonus;
    if (typeof current !== 'string' || !current.trim()) return blocked('missing-owned-bonus');
    const terms = splitCriticalFormula(current);
    if (!terms) return blocked('unsupported-critical-formula');
    const matches = terms.reduce<number[]>((found, term, index) => {
      if (term === marker.bonus) found.push(index);
      return found;
    }, []);
    if (matches.length === 0) return blocked('missing-owned-bonus');
    if (matches.length !== 1) return blocked('ambiguous-owned-bonus');

    const prefix = `system.activities.${id}`;
    const nextTerms = [...terms];
    if (desiredBonus) nextTerms[matches[0]!] = desiredBonus;
    else nextTerms.splice(matches[0]!, 1);
    const nextFormula = nextTerms.join(' + ');
    if (nextFormula !== current.trim()) {
      if (nextFormula) updates[`${prefix}.damage.critical.bonus`] = nextFormula;
      else updates[`${prefix}.damage.critical.-=bonus`] = null;
    }

    if (desiredBonus) {
      const nextMarker: OwnedContribution = { ...marker, ruleId: deadlyRuleId(configuration)!, bonus: desiredBonus };
      if (marker.ruleId !== nextMarker.ruleId || marker.bonus !== nextMarker.bonus) {
        updates[`${prefix}.${DEADLY_CONTRIBUTION_PATH}`] = nextMarker;
      }
    } else {
      updates[`${prefix}.flags.fvttJsonGenerator.weaponPropertyContributions.-=deadly`] = null;
    }
    activityIds.push(id);
  }

  return {
    status: 'ready',
    changed: Object.keys(updates).length > 0,
    updates,
    activityIds,
  };
}

function blocked(reason: WeaponConfigurationUpdateBlockReason): WeaponConfigurationUpdatePlan {
  return { status: 'blocked', changed: false, updates: {}, activityIds: [], reason };
}

function deadlyRuleId(configuration: WeaponConfiguration): string | undefined {
  return configuration.rules.find((rule) => rule.kind === 'deadly')?.ruleId;
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isRecord(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function activityEntries(value: unknown): ActivityEntry[] {
  if (Array.isArray(value)) {
    return value.map((activity) => ({
      id: String(activity?.id ?? activity?._id ?? ''),
      activity,
    }));
  }
  if (value && typeof (value as any).entries === 'function') {
    return [...(value as any).entries()].map(([key, activity]: [unknown, any]) => ({
      id: String(activity?.id ?? activity?._id ?? key ?? ''),
      activity,
    }));
  }
  if (value && typeof (value as any).values === 'function') {
    return [...(value as any).values()].map((activity: any) => ({
      id: String(activity?.id ?? activity?._id ?? ''),
      activity,
    }));
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([key, activity]) => ({
      id: String(activity?.id ?? activity?._id ?? key),
      activity: activity as Record<string, any>,
    }));
  }
  return [];
}

type MarkerState =
  | { kind: 'absent' }
  | { kind: 'invalid-container' }
  | { kind: 'invalid-marker' }
  | { kind: 'present'; value: OwnedContribution };

function readContributionMarker(activity: Record<string, any>): MarkerState {
  const generator = activity?.flags?.fvttJsonGenerator;
  if (generator === undefined) return { kind: 'absent' };
  if (!isRecord(generator)) return { kind: 'invalid-container' };
  const contributions = generator.weaponPropertyContributions;
  if (contributions === undefined) return { kind: 'absent' };
  if (!isRecord(contributions)) return { kind: 'invalid-container' };
  if (!Object.prototype.hasOwnProperty.call(contributions, 'deadly')) return { kind: 'absent' };
  const marker = contributions.deadly;
  if (!isRecord(marker)
    || typeof marker.ruleId !== 'string'
    || !marker.ruleId.trim()
    || marker.ruleId.trim() !== marker.ruleId
    || marker.ruleId.length > 120
    || typeof marker.bonus !== 'string'
    || marker.bonus.trim() !== marker.bonus
    || !VALID_DICE_BONUS.test(marker.bonus.trim())) {
    return { kind: 'invalid-marker' };
  }
  return { kind: 'present', value: marker as OwnedContribution };
}

/** Split only top-level additive terms; nested or malformed formulas fail closed. */
function splitCriticalFormula(value: string): string[] | null {
  const formula = value.trim();
  if (!formula || formula.length > MAX_FORMULA_LENGTH || /[\u0000-\u001f;]/u.test(formula)) return null;
  const terms: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < formula.length; index += 1) {
    const character = formula[index];
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth < 0) return null;
    } else if (character === '+' && depth === 0) {
      const term = formula.slice(start, index).trim();
      if (!term) return null;
      terms.push(term);
      start = index + 1;
    }
  }
  if (depth !== 0) return null;
  const finalTerm = formula.slice(start).trim();
  if (!finalTerm) return null;
  terms.push(finalTerm);
  return terms;
}
