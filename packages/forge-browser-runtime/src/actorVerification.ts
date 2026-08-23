import { extractSourceDerivedAcEffect } from '@fvtt-json-generator/generation/ac-effect-extraction';

export interface BrowserActorVerificationSummary {
  actor: {
    name: string;
    type: string;
    creatureType?: string;
    hp?: unknown;
    ac?: unknown;
    cr?: unknown;
    senses: Record<string, unknown>;
  };
  items: Array<{
    name: string;
    type: string;
    activation: string;
    activityTypes: string[];
    activities: Array<{ type: string; range?: unknown; damage?: unknown }>;
    effects: Array<{
      name: string;
      changes: Array<{ key: string; mode: unknown; value: string; priority: unknown }>;
      sourceDerivedAcEffect: boolean;
      sourceText: string;
    }>;
  }>;
  warnings: string[];
}

export function buildBrowserActorVerificationSummary(
  source: string,
  actorValue: unknown,
): BrowserActorVerificationSummary {
  const actor = getRecord(actorValue);
  const system = getRecord(actor.system);
  const details = getRecord(system.details);
  const attributes = getRecord(system.attributes);
  const items = Array.isArray(actor.items) ? actor.items.map(summarizeItem) : [];
  const foundryMajor = inferFoundryMajor(actor);
  const warnings: string[] = [];

  for (const item of items) {
    if (!sourceMentionsItem(source, item.name)) {
      warnings.push(`Item name not found in source markdown: ${item.name}`);
    }
    for (const effect of item.effects) {
      if (!effect.sourceDerivedAcEffect) continue;
      const parsed = extractSourceDerivedAcEffect(effect.sourceText);
      if (!parsed) {
        warnings.push(`Invalid source-derived AC effect on ${item.name}: sourceText is not an explicit AC clause.`);
        continue;
      }
      const acChange = effect.changes.find((change) => change.key.startsWith('system.attributes.ac.'));
      const expectedKey = parsed.kind === 'flat'
        ? 'system.attributes.ac.flat'
        : foundryMajor === '14'
          ? 'system.attributes.ac.formula'
          : foundryMajor === '12'
            ? 'system.attributes.ac.bonus'
            : undefined;
      if (expectedKey && acChange?.key !== expectedKey) {
        warnings.push(`Source-derived AC effect on ${item.name} has an unexpected target field.`);
      }
      if (acChange?.value !== String(parsed.value)) {
        warnings.push(`Source-derived AC effect on ${item.name} does not preserve the source value.`);
      }
    }
  }

  if (items.length === 0) warnings.push('Actor has no generated items.');

  const creatureType = getRecord(details.type).value;
  return {
    actor: {
      name: String(actor.name ?? ''),
      type: String(actor.type ?? ''),
      ...(creatureType === undefined ? {} : { creatureType: String(creatureType) }),
      ...(attributes.hp === undefined ? {} : { hp: attributes.hp }),
      ...(attributes.ac === undefined ? {} : { ac: attributes.ac }),
      ...(details.cr === undefined ? {} : { cr: details.cr }),
      senses: getRecord(attributes.senses),
    },
    items,
    warnings,
  };
}

function summarizeItem(value: unknown): BrowserActorVerificationSummary['items'][number] {
  const item = getRecord(value);
  const system = getRecord(item.system);
  const activities = Object.values(getRecord(system.activities)).map((activity) => {
    const record = getRecord(activity);
    return { type: String(record.type ?? ''), range: record.range, damage: record.damage };
  });
  const effects = Array.isArray(item.effects) ? item.effects.map(summarizeEffect) : [];
  return {
    name: String(item.name ?? ''),
    type: String(item.type ?? ''),
    activation: String(getRecord(system.activation).type ?? ''),
    activityTypes: activities.map((activity) => activity.type).filter(Boolean),
    activities,
    effects,
  };
}

function summarizeEffect(value: unknown): BrowserActorVerificationSummary['items'][number]['effects'][number] {
  const effect = getRecord(value);
  const flags = getRecord(getRecord(effect.flags).fvttJsonGenerator);
  return {
    name: String(effect.name ?? ''),
    changes: Array.isArray(effect.changes) ? effect.changes.map(summarizeChange) : [],
    sourceDerivedAcEffect: flags.sourceDerivedAcEffect === true,
    sourceText: String(flags.sourceText ?? ''),
  };
}

function summarizeChange(value: unknown): { key: string; mode: unknown; value: string; priority: unknown } {
  const change = getRecord(value);
  return {
    key: String(change.key ?? ''),
    mode: change.mode,
    value: String(change.value ?? ''),
    priority: change.priority,
  };
}

function inferFoundryMajor(actor: RecordLike): '12' | '14' | undefined {
  const coreVersion = String(getRecord(actor._stats).coreVersion ?? '');
  if (/^14(?:\.|$)/u.test(coreVersion)) return '14';
  if (/^12(?:\.|$)/u.test(coreVersion)) return '12';
  return undefined;
}

function sourceMentionsItem(source: string, itemName: string): boolean {
  const candidates = new Set<string>([itemName]);
  const bilingualMatch = itemName.match(/\(([^)]+)\)/u);
  if (bilingualMatch?.[1]) candidates.add(bilingualMatch[1]);
  const withoutParen = itemName.replace(/\s*\([^)]*\)\s*/gu, '').trim();
  if (withoutParen) candidates.add(withoutParen);
  const normalizedSource = normalizeSearchText(source);
  return [...candidates].some((candidate) => {
    const normalizedCandidate = normalizeSearchText(candidate);
    return normalizedCandidate.length > 0 && normalizedSource.includes(normalizedCandidate);
  });
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, ' ').trim();
}

type RecordLike = Record<string, unknown>;

function getRecord(value: unknown): RecordLike {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordLike : {};
}
