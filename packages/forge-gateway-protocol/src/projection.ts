import {
  FORGE_ACTIVITY_TYPES,
  FORGE_EXECUTION_MODES,
  FORGE_EXPRESSION_COVERAGES,
  FORGE_MECHANIC_COVERAGE_STATUSES,
  FORGE_MECHANIC_KINDS,
  FORGE_SOURCE_FIELDS,
  type ForgeActivityDamageSummary,
  type ForgeActivityRangeSummary,
  type ForgeActivitySummary,
  type ForgeAcceptedVerificationSummary,
  type ForgeActorVerificationSummary,
  type ForgeArmorClassSummary,
  type ForgeDamagePartSummary,
  type ForgeEffectChangeSummary,
  type ForgeEffectSummary,
  type ForgeDiagnostic,
  type ForgeHitPointSummary,
  type ForgeItemVerificationSummary,
  type ForgeMechanicCoverageSummary,
  type ForgeSensesSummary,
  type ForgeSourceField,
  type ForgeVerificationSummary,
} from './types';
import {
  isSafeForgeDocumentFieldPath,
  isSafeForgeWireMessage,
  projectForgeDiagnosticPath,
} from './wireSafety';

export interface ForgeVerificationProjectionInput {
  verification: unknown;
  actorVerification: unknown;
}

export interface ForgeVerificationProjection {
  verification: ForgeVerificationSummary;
  actorVerification: ForgeActorVerificationSummary;
}

/**
 * Convert workflow-shaped verification data to the closed Forge wire projection.
 * This function intentionally reads no path-like fields into the returned value.
 */
export function projectForgeVerification(
  input: ForgeVerificationProjectionInput,
): ForgeVerificationProjection {
  return {
    verification: projectVerification(input.verification),
    actorVerification: projectActorVerification(input.actorVerification),
  };
}

/** Convert workflow diagnostics to the closed, path-safe Forge wire shape. */
export function projectForgeDiagnostics(value: unknown): ForgeDiagnostic[] {
  return requireArray(value, 'diagnostics').map((entry, index) => {
    const label = `diagnostics[${index}]`;
    const record = requireRecord(entry, label);
    const internalPath = requireString(record.path, `${label}.path`);
    const path = projectForgeDiagnosticPath(internalPath);
    const message = requireNonEmptyString(record.message, `${label}.message`);
    if (!isSafeForgeWireMessage(message)) {
      throw new TypeError(`${label}.message contains unsafe internal path text.`);
    }
    const result: ForgeDiagnostic = {
      code: requireNonEmptyString(record.code, `${label}.code`),
      severity: requireEnum(record.severity, ['error', 'warning', 'info'] as const, `${label}.severity`),
      stage: requireEnum(record.stage, ['parse', 'ir', 'projection', 'schema', 'semantic'] as const, `${label}.stage`),
      path,
      message,
    };
    if (record.evidence !== undefined) {
      result.evidence = requireArray(record.evidence, `${label}.evidence`).map((evidence, evidenceIndex) => {
        const evidenceLabel = `${label}.evidence[${evidenceIndex}]`;
        const evidenceRecord = requireRecord(evidence, evidenceLabel);
        const start = requireNonNegativeInteger(evidenceRecord.start, `${evidenceLabel}.start`);
        const end = requireNonNegativeInteger(evidenceRecord.end, `${evidenceLabel}.end`);
        const quote = requireString(evidenceRecord.quote, `${evidenceLabel}.quote`);
        if (end <= start || quote.length !== end - start) {
          throw new TypeError(`${evidenceLabel} must be a valid UTF-16 source span.`);
        }
        return { start, end, quote };
      });
    }
    return result;
  });
}

export function requireForgeAcceptedVerification(
  value: ForgeVerificationSummary,
): ForgeAcceptedVerificationSummary {
  if (value.status !== 'accepted' || value.mechanicsCoverage.some((entry) => (
    entry.status !== 'projected'
    || entry.outputPaths.length === 0
    || (entry.expressionCoverage !== undefined && entry.expressionCoverage !== 'structured')
    || entry.executionMode === 'gm-assisted'
    || entry.executionMode === 'external-rule'
  ))) {
    throw new TypeError('Accepted Forge verification must contain only fully projected mechanics.');
  }
  return value as ForgeAcceptedVerificationSummary;
}

export function mapForgeSourceField(sourcePath: string): ForgeSourceField {
  const normalized = sourcePath.replaceAll('\\', '/').toLowerCase();
  if (/(^|[/.:])name([/.:]|$)/u.test(normalized)) return 'actor.name';
  if (/(attributes|ability|hp|ac|armor|hit[-_ ]?points|challenge|cr)([/.:]|$)/u.test(normalized)) return 'actor.attributes';
  if (/(traits?|senses?|languages?|resistances?|immunit|condition)([/.:]|$)/u.test(normalized)) return 'actor.traits';
  if (/(actions?|reactions?|legendary|lair|bonus)([/.:]|$)/u.test(normalized)) return 'actor.actions';
  if (/(items?|features?)([/.:]|$)/u.test(normalized)) return 'actor.items';
  if (/(behavio|resource|lifecycle|trigger|stage|capacity|choice|area)([/.:]|$)/u.test(normalized)) return 'actor.behaviors';
  if (/activation([/.:]|$)/u.test(normalized)) return 'item.activation';
  if (/attack([/.:]|$)/u.test(normalized)) return 'item.attack';
  if (/damage([/.:]|$)/u.test(normalized)) return 'item.damage';
  if (/save([/.:]|$)/u.test(normalized)) return 'item.save';
  if (/(effect|condition)([/.:]|$)/u.test(normalized)) return 'item.effects';
  return 'source.other';
}

function projectVerification(value: unknown): ForgeVerificationSummary {
  const record = requireRecord(value, 'verification');
  return {
    status: requireEnum(record.status, ['accepted', 'needs_review', 'failed'] as const, 'verification.status'),
    mechanicsCoverage: projectMechanics(record.mechanicsCoverage),
  };
}

function projectMechanics(value: unknown): ForgeMechanicCoverageSummary[] {
  return requireArray(value, 'verification.mechanicsCoverage').map((entry, index) => {
    const record = requireRecord(entry, `verification.mechanicsCoverage[${index}]`);
    const result: ForgeMechanicCoverageSummary = {
      mechanicId: requireNonEmptyString(record.mechanicId, `verification.mechanicsCoverage[${index}].mechanicId`),
      kind: requireEnum(record.kind, FORGE_MECHANIC_KINDS, `verification.mechanicsCoverage[${index}].kind`),
      sourceField: mapForgeSourceField(requireString(record.sourcePath, `verification.mechanicsCoverage[${index}].sourcePath`)),
      status: requireEnum(record.status, FORGE_MECHANIC_COVERAGE_STATUSES, `verification.mechanicsCoverage[${index}].status`),
      outputPaths: requireSafeOutputPaths(record.outputPaths, `verification.mechanicsCoverage[${index}].outputPaths`),
    };
    const expressionCoverage = optionalEnum(record.expressionCoverage, FORGE_EXPRESSION_COVERAGES, `verification.mechanicsCoverage[${index}].expressionCoverage`);
    const executionMode = optionalEnum(record.executionMode, FORGE_EXECUTION_MODES, `verification.mechanicsCoverage[${index}].executionMode`);
    if (expressionCoverage !== undefined) result.expressionCoverage = expressionCoverage;
    if (executionMode !== undefined) result.executionMode = executionMode;
    return result;
  });
}

function projectActorVerification(value: unknown): ForgeActorVerificationSummary {
  const record = requireRecord(value, 'actorVerification');
  const actorRecord = requireRecord(record.actor, 'actorVerification.actor');
  const actor: ForgeActorVerificationSummary['actor'] = {
    name: requireNonEmptyString(actorRecord.name, 'actorVerification.actor.name'),
    type: requireNonEmptyString(actorRecord.type, 'actorVerification.actor.type'),
    senses: projectSenses(actorRecord.senses),
  };
  const creatureType = actorRecord.creatureType === undefined
    ? undefined
    : requireString(actorRecord.creatureType, 'actorVerification.actor.creatureType');
  const hp = optionalHitPointSummary(actorRecord.hp, 'actorVerification.actor.hp');
  const ac = optionalArmorClassSummary(actorRecord.ac, 'actorVerification.actor.ac');
  const cr = optionalNumber(actorRecord.cr, 'actorVerification.actor.cr');
  if (creatureType !== undefined) actor.creatureType = creatureType;
  if (hp !== undefined) actor.hp = hp;
  if (ac !== undefined) actor.ac = ac;
  if (cr !== undefined) actor.cr = cr;

  return {
    actor,
    items: requireArray(record.items, 'actorVerification.items').map((entry, index) => projectItem(entry, index)),
    warnings: requireStringArray(record.warnings, 'actorVerification.warnings'),
  };
}

function optionalHitPointSummary(value: unknown, label: string): ForgeHitPointSummary | undefined {
  if (value === undefined) return undefined;
  const record = requireRecord(value, label);
  const result: ForgeHitPointSummary = {};
  if (hasValue(record, 'value')) result.value = requireNumber(record.value, `${label}.value`);
  if (hasValue(record, 'max')) result.max = requireNumber(record.max, `${label}.max`);
  if (hasValue(record, 'temp')) result.temp = requireNumberOrNull(record.temp, `${label}.temp`);
  if (hasValue(record, 'tempmax')) result.tempmax = requireNumberOrNull(record.tempmax, `${label}.tempmax`);
  if (hasValue(record, 'formula')) result.formula = requireString(record.formula, `${label}.formula`);
  return result;
}

function optionalArmorClassSummary(value: unknown, label: string): ForgeArmorClassSummary | undefined {
  if (value === undefined) return undefined;
  const record = requireRecord(value, label);
  const result: ForgeArmorClassSummary = {};
  for (const key of ['value', 'flat', 'bonus'] as const) {
    if (hasValue(record, key)) result[key] = requireNumber(record[key], `${label}.${key}`);
  }
  for (const key of ['formula', 'calc'] as const) {
    if (hasValue(record, key)) result[key] = requireString(record[key], `${label}.${key}`);
  }
  return result;
}

function projectSenses(value: unknown): ForgeSensesSummary {
  const record = requireRecord(value, 'actorVerification.actor.senses');
  const result: ForgeSensesSummary = {};
  if (hasValue(record, 'ranges')) {
    const ranges = requireRecord(record.ranges, 'actorVerification.actor.senses.ranges');
    const rangeResult: NonNullable<ForgeSensesSummary['ranges']> = {};
    for (const key of ['darkvision', 'blindsight', 'tremorsense', 'truesight'] as const) {
      if (hasValue(ranges, key)) rangeResult[key] = requireNumber(ranges[key], `actorVerification.actor.senses.ranges.${key}`);
    }
    result.ranges = rangeResult;
  }
  for (const key of ['darkvision', 'blindsight', 'tremorsense', 'truesight', 'passive'] as const) {
    if (hasValue(record, key)) result[key] = requireNumber(record[key], `actorVerification.actor.senses.${key}`);
  }
  for (const key of ['special', 'units'] as const) {
    if (hasValue(record, key)) result[key] = requireString(record[key], `actorVerification.actor.senses.${key}`);
  }
  return result;
}

function projectItem(value: unknown, index: number): ForgeItemVerificationSummary {
  const label = `actorVerification.items[${index}]`;
  const record = requireRecord(value, label);
  return {
    name: requireNonEmptyString(record.name, `${label}.name`),
    type: requireNonEmptyString(record.type, `${label}.type`),
    activation: requireString(record.activation, `${label}.activation`),
    activityTypes: requireArray(record.activityTypes, `${label}.activityTypes`).map((entry, activityIndex) => requireEnum(entry, FORGE_ACTIVITY_TYPES, `${label}.activityTypes[${activityIndex}]`)),
    activities: requireArray(record.activities, `${label}.activities`).map((entry, activityIndex) => projectActivity(entry, `${label}.activities[${activityIndex}]`)),
    effects: requireArray(record.effects, `${label}.effects`).map((entry, effectIndex) => projectEffect(entry, `${label}.effects[${effectIndex}]`)),
  };
}

function projectActivity(value: unknown, label: string): ForgeActivitySummary {
  const record = requireRecord(value, label);
  const result: ForgeActivitySummary = { type: requireEnum(record.type, FORGE_ACTIVITY_TYPES, `${label}.type`) };
  if (hasValue(record, 'range')) result.range = projectRange(record.range, `${label}.range`);
  if (hasValue(record, 'damage')) result.damage = projectDamage(record.damage, `${label}.damage`);
  return result;
}

function projectRange(value: unknown, label: string): ForgeActivityRangeSummary {
  const record = requireRecord(value, label);
  const result: ForgeActivityRangeSummary = {};
  if (hasValue(record, 'override')) result.override = requireBoolean(record.override, `${label}.override`);
  for (const key of ['value', 'long', 'reach'] as const) {
    if (hasValue(record, key)) result[key] = requireNumberOrNull(record[key], `${label}.${key}`);
  }
  for (const key of ['units', 'special'] as const) {
    if (hasValue(record, key)) result[key] = requireString(record[key], `${label}.${key}`);
  }
  return result;
}

function projectDamage(value: unknown, label: string): ForgeActivityDamageSummary {
  const record = requireRecord(value, label);
  const result: ForgeActivityDamageSummary = {
    parts: requireArray(record.parts, `${label}.parts`).map((entry, index) => projectDamagePart(entry, `${label}.parts[${index}]`)),
  };
  if (hasValue(record, 'includeBase')) result.includeBase = requireBoolean(record.includeBase, `${label}.includeBase`);
  if (hasValue(record, 'onSave')) result.onSave = requireString(record.onSave, `${label}.onSave`);
  return result;
}

function projectDamagePart(value: unknown, label: string): ForgeDamagePartSummary {
  const record = requireRecord(value, label);
  const result: ForgeDamagePartSummary = {
    types: requireStringArray(record.types, `${label}.types`),
  };
  for (const key of ['number', 'denomination'] as const) {
    if (hasValue(record, key)) result[key] = requireNumberOrNull(record[key], `${label}.${key}`);
  }
  if (hasValue(record, 'bonus')) result.bonus = requireString(record.bonus, `${label}.bonus`);
  if (hasValue(record, 'custom')) {
    const custom = requireRecord(record.custom, `${label}.custom`);
    result.custom = {
      enabled: requireBoolean(custom.enabled, `${label}.custom.enabled`),
      formula: requireString(custom.formula, `${label}.custom.formula`),
    };
  }
  if (hasValue(record, 'scaling')) {
    const scaling = requireRecord(record.scaling, `${label}.scaling`);
    result.scaling = {
      mode: requireString(scaling.mode, `${label}.scaling.mode`),
      ...(hasValue(scaling, 'number') ? { number: requireNumberOrNull(scaling.number, `${label}.scaling.number`) } : {}),
      ...(hasValue(scaling, 'formula') ? { formula: requireString(scaling.formula, `${label}.scaling.formula`) } : {}),
    };
  }
  return result;
}

function projectEffect(value: unknown, label: string): ForgeEffectSummary {
  const record = requireRecord(value, label);
  return {
    name: requireNonEmptyString(record.name, `${label}.name`),
    changes: requireArray(record.changes, `${label}.changes`).map((entry, index) => projectEffectChange(entry, `${label}.changes[${index}]`)),
    sourceDerivedAcEffect: requireBoolean(record.sourceDerivedAcEffect, `${label}.sourceDerivedAcEffect`),
    sourceText: requireString(record.sourceText, `${label}.sourceText`),
  };
}

function projectEffectChange(value: unknown, label: string): ForgeEffectChangeSummary {
  const record = requireRecord(value, label);
  return {
    key: requireNonEmptyString(record.key, `${label}.key`),
    mode: projectScalar(record.mode),
    value: requireString(record.value, `${label}.value`),
    priority: projectScalar(record.priority),
  };
}

function projectScalar(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new TypeError('Forge verification projection accepts scalar effect values only.');
}

function requireSafeOutputPaths(value: unknown, label: string): string[] {
  return requireStringArray(value, label).map((entry, index) => {
    if (!isSafeForgeDocumentFieldPath(entry)) {
      throw new TypeError(`${label}[${index}] is not a safe document field path.`);
    }
    return entry;
  });
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function requireStringArray(value: unknown, label: string): string[] {
  return requireArray(value, label).map((entry, index) => requireString(entry, `${label}[${index}]`));
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be a dense array.`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new TypeError(`${label} must be a dense array.`);
    }
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  return value;
}

function requireNonEmptyString(value: unknown, label: string): string {
  const result = requireString(value, label);
  if (result.length === 0) throw new TypeError(`${label} must not be empty.`);
  return result;
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requireNonEmptyString(value, label);
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  return requireNumber(value, label);
}

function requireNumberOrNull(value: unknown, label: string): number | null {
  if (value === null) return null;
  return requireNumber(value, label);
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean.`);
  return value;
}

function requireEnum<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new TypeError(`${label} is not a supported enum value.`);
  return value as T;
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[], label: string): T | undefined {
  if (value === undefined) return undefined;
  return requireEnum(value, values, label);
}

function hasValue(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
