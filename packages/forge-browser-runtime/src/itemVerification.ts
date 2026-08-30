import type { ForgeItemVerificationSummary } from '@fvtt-json-generator/forge-gateway-protocol';

/** Build the workflow-shaped Item summary consumed by the closed wire projector. */
export function buildBrowserItemVerificationSummary(itemValue: unknown): ForgeItemVerificationSummary {
  const item = getRecord(itemValue);
  const system = getRecord(item.system);
  const activities = Object.values(getRecord(system.activities)).map((activityValue) => {
    const activity = getRecord(activityValue);
    return {
      type: String(activity.type ?? ''),
      ...(activity.range === undefined ? {} : { range: summarizeRange(activity.range) }),
      ...(activity.damage === undefined ? {} : { damage: summarizeDamage(activity.damage) }),
    };
  });
  return {
    name: String(item.name ?? ''),
    type: String(item.type ?? ''),
    activation: String(getRecord(system.activation).type ?? ''),
    activityTypes: activities.map((activity) => activity.type).filter(Boolean) as ForgeItemVerificationSummary['activityTypes'],
    activities: activities as ForgeItemVerificationSummary['activities'],
    effects: (Array.isArray(item.effects) ? item.effects : []).map((effectValue) => {
      const effect = getRecord(effectValue);
      const flags = getRecord(getRecord(effect.flags).fvttJsonGenerator);
      const effectChanges = Array.isArray(effect.changes)
        ? effect.changes
        : Array.isArray(getRecord(effect.system).changes) ? getRecord(effect.system).changes as unknown[] : [];
      return {
        name: String(effect.name ?? ''),
        changes: effectChanges.map((changeValue) => {
          const change = getRecord(changeValue);
          return {
            key: String(change.key ?? ''),
            mode: scalar(change.mode ?? change.type),
            value: String(change.value ?? ''),
            priority: scalar(change.priority ?? change.phase),
          };
        }),
        sourceDerivedAcEffect: flags.sourceDerivedAcEffect === true,
        sourceText: String(flags.sourceText ?? ''),
      };
    }),
  };
}

function summarizeRange(value: unknown): NonNullable<ForgeItemVerificationSummary['activities'][number]['range']> {
  const range = getRecord(value);
  const result: NonNullable<ForgeItemVerificationSummary['activities'][number]['range']> = {};
  if (typeof range.override === 'boolean') result.override = range.override;
  for (const key of ['value', 'long', 'reach'] as const) {
    if (range[key] === null || (typeof range[key] === 'number' && Number.isFinite(range[key]))) result[key] = range[key];
  }
  for (const key of ['units', 'special'] as const) {
    if (typeof range[key] === 'string') result[key] = range[key];
  }
  return result;
}

function summarizeDamage(value: unknown): NonNullable<ForgeItemVerificationSummary['activities'][number]['damage']> {
  const damage = getRecord(value);
  const parts = (Array.isArray(damage.parts) ? damage.parts : []).map((partValue) => {
    const part = getRecord(partValue);
    const result: NonNullable<ForgeItemVerificationSummary['activities'][number]['damage']>['parts'][number] = {
      types: Array.isArray(part.types) ? part.types.filter((entry): entry is string => typeof entry === 'string') : [],
    };
    for (const key of ['number', 'denomination'] as const) {
      if (part[key] === null || (typeof part[key] === 'number' && Number.isFinite(part[key]))) result[key] = part[key];
    }
    if (typeof part.bonus === 'string') result.bonus = part.bonus;
    const custom = getRecord(part.custom);
    if (typeof custom.enabled === 'boolean' && typeof custom.formula === 'string') {
      result.custom = { enabled: custom.enabled, formula: custom.formula };
    }
    const scaling = getRecord(part.scaling);
    if (typeof scaling.mode === 'string') {
      result.scaling = {
        mode: scaling.mode,
        ...(scaling.number === null || (typeof scaling.number === 'number' && Number.isFinite(scaling.number)) ? { number: scaling.number } : {}),
        ...(typeof scaling.formula === 'string' ? { formula: scaling.formula } : {}),
      };
    }
    return result;
  });
  return {
    parts,
    ...(typeof damage.includeBase === 'boolean' ? { includeBase: damage.includeBase } : {}),
    ...(typeof damage.onSave === 'string' ? { onSave: damage.onSave } : {}),
  };
}

function scalar(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
