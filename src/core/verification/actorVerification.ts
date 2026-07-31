import { readFileSync } from 'node:fs';
import { extractSourceDerivedAcEffect } from '../mechanics/acEffectExtraction';

interface BuildActorVerificationSummaryOptions {
  sourcePath: string;
  actorPath: string;
}

interface BuildActorVerificationSummaryFromValuesOptions {
  source: string;
  actor: unknown;
  sourcePath?: string;
  actorPath?: string;
}

interface ActivitySummary {
  type: string;
  range?: unknown;
  damage?: unknown;
}

interface ItemSummary {
  name: string;
  type: string;
  activation: string;
  activityTypes: string[];
  activities: ActivitySummary[];
  effects: EffectSummary[];
}

interface EffectSummary {
  name: string;
  changes: EffectChangeSummary[];
  sourceDerivedAcEffect: boolean;
  sourceText: string;
}

interface EffectChangeSummary {
  key: string;
  mode: unknown;
  value: string;
  priority: unknown;
}

export interface ActorVerificationSummary {
  sourcePath: string;
  actorPath: string;
  actor: {
    name: string;
    type: string;
    creatureType?: unknown;
    hp?: unknown;
    ac?: unknown;
    cr?: unknown;
    senses: Record<string, unknown>;
  };
  items: ItemSummary[];
  warnings: string[];
}

type RecordLike = Record<string, unknown>;

export function buildActorVerificationSummary(
  options: BuildActorVerificationSummaryOptions,
): ActorVerificationSummary {
  const source = readFileSync(options.sourcePath, 'utf-8');
  const actor = JSON.parse(readTextFile(options.actorPath)) as RecordLike;
  return buildActorVerificationSummaryFromValues({
    source,
    actor,
    sourcePath: options.sourcePath,
    actorPath: options.actorPath,
  });
}

export function buildActorVerificationSummaryFromValues(
  options: BuildActorVerificationSummaryFromValuesOptions,
): ActorVerificationSummary {
  const source = options.source;
  const actor = getRecord(options.actor);
  const system = getRecord(actor.system);
  const details = getRecord(system.details);
  const attributes = getRecord(system.attributes);
  const items = Array.isArray(actor.items) ? actor.items.map((item) => summarizeItem(item)) : [];
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
        warnings.push(
          `Invalid source-derived AC effect on ${item.name}: sourceText is not an explicit AC clause: ${effect.sourceText}`,
        );
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
        warnings.push(
          `Source-derived AC effect on ${item.name} has key ${acChange?.key ?? '<missing>'}, expected ${expectedKey} for Foundry v${foundryMajor}`,
        );
      }
      if (acChange?.value !== String(parsed.value)) {
        warnings.push(
          `Source-derived AC effect on ${item.name} has value ${acChange?.value ?? '<missing>'}, expected ${parsed.value} from sourceText: ${effect.sourceText}`,
        );
      }
    }
  }

  if (items.length === 0) {
    warnings.push('Actor has no generated items.');
  }

  return {
    sourcePath: options.sourcePath ?? '<inline-source>',
    actorPath: options.actorPath ?? '<inline-actor>',
    actor: {
      name: String(actor.name ?? ''),
      type: String(actor.type ?? ''),
      creatureType: getRecord(details.type).value,
      hp: attributes.hp,
      ac: attributes.ac,
      cr: details.cr,
      senses: getRecord(attributes.senses),
    },
    items,
    warnings,
  };
}

function summarizeItem(value: unknown): ItemSummary {
  const item = getRecord(value);
  const system = getRecord(item.system);
  const activities = Object.values(getRecord(system.activities)).map((activity) => {
    const record = getRecord(activity);
    return {
      type: String(record.type ?? ''),
      range: record.range,
      damage: record.damage,
    };
  });
  const effects = Array.isArray(item.effects)
    ? item.effects.map((value) => summarizeEffect(value))
    : [];

  return {
    name: String(item.name ?? ''),
    type: String(item.type ?? ''),
    activation: String(getRecord(system.activation).type ?? ''),
    activityTypes: activities.map((activity) => activity.type).filter(Boolean),
    activities,
    effects,
  };
}

function summarizeEffect(value: unknown): EffectSummary {
  const effect = getRecord(value);
  const generatorFlags = getRecord(getRecord(effect.flags).fvttJsonGenerator);
  return {
    name: String(effect.name ?? ''),
    changes: Array.isArray(effect.changes) ? effect.changes.map((change) => summarizeEffectChange(change)) : [],
    sourceDerivedAcEffect: generatorFlags.sourceDerivedAcEffect === true,
    sourceText: String(generatorFlags.sourceText ?? ''),
  };
}

function summarizeEffectChange(value: unknown): EffectChangeSummary {
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
  if (/^14(?:\.|$)/.test(coreVersion)) return '14';
  if (/^12(?:\.|$)/.test(coreVersion)) return '12';
  return undefined;
}

function sourceMentionsItem(source: string, itemName: string): boolean {
  const candidates = new Set<string>([itemName]);
  const bilingualMatch = itemName.match(/\(([^)]+)\)/);
  if (bilingualMatch?.[1]) {
    candidates.add(bilingualMatch[1]);
  }

  const withoutParen = itemName.replace(/\s*\([^)]*\)\s*/g, '').trim();
  if (withoutParen) {
    candidates.add(withoutParen);
  }

  const normalizedSource = normalizeSearchText(source);
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeSearchText(candidate);
    if (normalizedCandidate && normalizedSource.includes(normalizedCandidate)) {
      return true;
    }
  }

  return false;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getRecord(value: unknown): RecordLike {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : {};
}

function readTextFile(path: string): string {
  return readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
}

