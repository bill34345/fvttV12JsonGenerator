import { readFileSync } from 'node:fs';

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

  const warnings: string[] = [];
  for (const item of items) {
    if (!sourceMentionsItem(source, item.name)) {
      warnings.push(`Item name not found in source markdown: ${item.name}`);
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

  return {
    name: String(item.name ?? ''),
    type: String(item.type ?? ''),
    activation: String(getRecord(system.activation).type ?? ''),
    activityTypes: activities.map((activity) => activity.type).filter(Boolean),
    activities,
  };
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

if (import.meta.main) {
  const [, , sourcePath, actorPath] = Bun.argv;
  if (!sourcePath || !actorPath) {
    console.error('Usage: bun run src/tools/actorVerification.ts <source.md> <actor.json>');
    process.exit(1);
  }

  const summary = buildActorVerificationSummary({ sourcePath, actorPath });
  console.log(JSON.stringify(summary, null, 2));

  if (summary.warnings.length > 0) {
    process.exitCode = 2;
  }
}
