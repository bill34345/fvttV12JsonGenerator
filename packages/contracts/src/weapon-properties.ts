import { isSafeConditionFormula } from './conditions';

/** Data-only contract shared by formal generation and the browser module. */
export const WEAPON_PROPERTIES_MODULE_ID = 'fvtt-weapon-mastery-properties' as const;
export const WEAPON_CONFIGURATION_FLAG = 'weapon' as const;
export const WEAPON_SCHEMA_VERSION = 1 as const;
export const WEAPON_MASTERY_IDS = ['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex'] as const;
export type WeaponMasteryId = typeof WEAPON_MASTERY_IDS[number];
export type WeaponRuleKind = WeaponMasteryId | 'deadly' | 'fatal' | 'criticalBleeding';
export type WeaponRuleParams = Record<string, string | number | boolean>;

export interface WeaponRuleDefinition {
  ruleId: string;
  kind: WeaponRuleKind;
  label: string;
  params: WeaponRuleParams;
  stackingGroup: string;
}

export interface WeaponConfiguration {
  schemaVersion: 1;
  enabled: boolean;
  /** native resolves the actual selected legal mastery, not just the item's default. */
  mastery: 'native' | string | null;
  /** Explicit GM/source grant for a creature lacking native mastery proficiency. */
  grantMastery: boolean;
  /** Enabled properties and separately identified custom mastery definitions. */
  rules: WeaponRuleDefinition[];
}

const MASTERIES = new Set<string>(WEAPON_MASTERY_IDS);
const KINDS = new Set<string>([...WEAPON_MASTERY_IDS, 'deadly', 'fatal', 'criticalBleeding']);
const DICE = new Set([4, 6, 8, 10, 12]);
const ID = /^[a-z][a-z0-9]*(?:[._-][a-zA-Z0-9]+)*$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

export function isWeaponMasteryId(value: unknown): value is WeaponMasteryId {
  return typeof value === 'string' && MASTERIES.has(value);
}

export function officialMasteryRule(kind: WeaponMasteryId): WeaponRuleDefinition {
  const params: WeaponRuleParams = kind === 'cleave' ? { distance: 5, maxUses: 1 }
    : kind === 'nick' ? { maxUses: 1 }
      : kind === 'push' ? { distance: 10, maxSize: 3 }
        : kind === 'slow' ? { speedReduction: 10 } : {};
  return { ruleId: `dnd2024.${kind}`, kind, label: kind[0]!.toUpperCase() + kind.slice(1), params, stackingGroup: `dnd2024.${kind}` };
}

export function defaultWeaponConfiguration(): WeaponConfiguration {
  return { schemaVersion: 1, enabled: false, mastery: 'native', grantMastery: false, rules: [] };
}

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && ID.test(value)
    && !value.split(/[._-]/).some(part => RESERVED.has(part));
}

/** Reject malformed rules rather than silently turning them into a different mechanic. */
export function parseWeaponRule(value: unknown): WeaponRuleDefinition | null {
  if (!record(value) || !identifier(value.ruleId) || !identifier(value.stackingGroup)
    || typeof value.kind !== 'string' || !KINDS.has(value.kind)
    || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 160 || !record(value.params)) return null;
  const params: WeaponRuleParams = {};
  const allowed = new Set(['distance', 'maxUses', 'maxSize', 'speedReduction', 'dice', 'die', 'formula', 'damageType', 'mode', 'endOnHealing']);
  for (const [key, entry] of Object.entries(value.params)) {
    if (!allowed.has(key) || RESERVED.has(key) || !['string', 'number', 'boolean'].includes(typeof entry)) return null;
    if (typeof entry === 'number' && (!Number.isFinite(entry) || entry < 0 || entry > 1000)) return null;
    if (typeof entry === 'string' && entry.length > 400) return null;
    params[key] = entry as string | number | boolean;
  }
  const numeric = (key: string, min: number, max: number): boolean => params[key] === undefined
    || (Number.isInteger(params[key]) && Number(params[key]) >= min && Number(params[key]) <= max);
  if (!numeric('distance', 0, 120) || !numeric('maxUses', 1, 10) || !numeric('maxSize', 0, 5)
    || !numeric('speedReduction', 0, 120) || !numeric('dice', 1, 20)) return null;
  if (value.kind === 'deadly' || value.kind === 'fatal') {
    if (typeof params.die !== 'number' || !DICE.has(params.die)) return null;
    if (value.kind === 'deadly' && (typeof params.dice !== 'number' || !numeric('dice', 1, 20))) return null;
    if (value.kind === 'fatal' && params.dice !== undefined && params.dice !== 1) return null;
  }
  if (value.kind === 'criticalBleeding') {
    if (typeof params.formula !== 'string' || !isSafeConditionFormula(params.formula)) return null;
    if (!['damage', 'hpLoss'].includes(String(params.mode))) return null;
    if (params.mode === 'damage' && (typeof params.damageType !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(params.damageType))) return null;
    if (params.endOnHealing !== undefined && typeof params.endOnHealing !== 'boolean') return null;
  }
  const result: WeaponRuleDefinition = {
    ruleId: value.ruleId, kind: value.kind as WeaponRuleKind, label: value.label.trim(), params,
    stackingGroup: value.stackingGroup,
  };
  // Official identities are immutable. A changed preset must have a separate ID.
  if (result.ruleId.startsWith('dnd2024.')) {
    if (!isWeaponMasteryId(result.kind)) return null;
    const expected = officialMasteryRule(result.kind);
    if (result.ruleId !== expected.ruleId || result.stackingGroup !== expected.stackingGroup
      || Object.keys(params).length !== Object.keys(expected.params).length
      || Object.entries(expected.params).some(([key, entry]) => params[key] !== entry)) return null;
  }
  return result;
}

export function parseWeaponConfiguration(value: unknown): WeaponConfiguration | null {
  if (!record(value) || value.schemaVersion !== WEAPON_SCHEMA_VERSION || typeof value.enabled !== 'boolean'
    || typeof value.grantMastery !== 'boolean' || !Array.isArray(value.rules) || value.rules.length > 32) return null;
  if (value.mastery !== null && value.mastery !== 'native' && !identifier(value.mastery)) return null;
  const rules: WeaponRuleDefinition[] = [];
  const ids = new Set<string>();
  for (const raw of value.rules) {
    const rule = parseWeaponRule(raw);
    if (!rule || ids.has(rule.ruleId)) return null;
    ids.add(rule.ruleId);
    rules.push(rule);
  }
  // First release deliberately permits only one added property on a weapon.
  if (rules.filter(rule => !isWeaponMasteryId(rule.kind)).length > 1) return null;
  const selected = value.mastery as string | null;
  if (selected !== null && selected !== 'native') {
    const builtin = selected.startsWith('dnd2024.') && isWeaponMasteryId(selected.slice(8));
    if (!builtin && !rules.some(rule => rule.ruleId === selected && isWeaponMasteryId(rule.kind))) return null;
  }
  return { schemaVersion: 1, enabled: value.enabled, mastery: selected, grantMastery: value.grantMastery, rules };
}

export function readWeaponConfiguration(item: any): WeaponConfiguration | null {
  return parseWeaponConfiguration(item?.flags?.[WEAPON_PROPERTIES_MODULE_ID]?.[WEAPON_CONFIGURATION_FLAG]);
}

export function weaponConfigurationFlags(configuration: WeaponConfiguration): Record<string, unknown> {
  const parsed = parseWeaponConfiguration(configuration);
  if (!parsed) throw new Error('Invalid weapon mastery and properties configuration.');
  return { [WEAPON_PROPERTIES_MODULE_ID]: { [WEAPON_CONFIGURATION_FLAG]: parsed } };
}

export function weaponRuleFor(configuration: WeaponConfiguration, ruleId: string): WeaponRuleDefinition | null {
  const configured = configuration.rules.find(rule => rule.ruleId === ruleId);
  if (configured) return configured;
  if (ruleId.startsWith('dnd2024.') && isWeaponMasteryId(ruleId.slice(8))) return officialMasteryRule(ruleId.slice(8) as WeaponMasteryId);
  return null;
}

export function weaponCriticalBonus(configuration: WeaponConfiguration): string | null {
  if (!configuration.enabled) return null;
  const deadly = configuration.rules.find(rule => rule.kind === 'deadly');
  return deadly ? `${deadly.params.dice}d${deadly.params.die}` : null;
}

/** Stable source binding for a literal Activity damage part (no inferred ability modifier). */
export function weaponDamagePartSignature(part: any): string | null {
  if (!part || typeof part !== 'object') return null;
  const types = part.types instanceof Set ? [...part.types] : part.types;
  if (!Array.isArray(types) || types.some(type => typeof type !== 'string')) return null;
  return JSON.stringify({ number: part.number ?? null, denomination: part.denomination ?? null,
    bonus: String(part.bonus ?? '').replace(/\s+/g, ''), types: [...types].sort(),
    custom: { enabled: part.custom?.enabled === true,
      formula: part.custom?.enabled === true ? String(part.custom.formula ?? '').replace(/\s+/g, '') : '' } });
}

/** A stale/edited source binding must never select an unrelated damage rider. */
export function readLiteralWeaponBaseIndex(activity: any): number | null {
  const binding = activity?.flags?.fvttJsonGenerator?.weaponPropertyBase;
  if (activity?.damage?.includeBase !== false || binding?.schemaVersion !== 1
    || !Number.isInteger(binding.partIndex) || binding.partIndex < 0
    || typeof binding.signature !== 'string' || !Array.isArray(activity.damage.parts)) return null;
  const signature = weaponDamagePartSignature(activity.damage.parts[binding.partIndex]);
  return signature !== null && signature === binding.signature ? binding.partIndex : null;
}
