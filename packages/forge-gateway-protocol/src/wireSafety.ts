import {
  FORGE_DIAGNOSTIC_PATHS,
  type ForgeDiagnosticPath,
} from './types';

const DOCUMENT_INDEX = '(?:0|[1-9]\\d*)';
const ACTIVITY_KEY = '(?:0|[1-9]\\d*|[A-Za-z0-9]{16})';
const OUTPUT_PATH_PATTERNS = [
  new RegExp(`^documents/${DOCUMENT_INDEX}/system/(?:uses|damage/base)$`, 'u'),
  new RegExp(`^documents/${DOCUMENT_INDEX}/system/activities/${ACTIVITY_KEY}(?:/consumption/targets|/flags/fvttJsonGenerator/(?:resourceConsumption|resourceTransition))?$`, 'u'),
  new RegExp(`^documents/${DOCUMENT_INDEX}/effects(?:/${DOCUMENT_INDEX}(?:/flags/fvttJsonGenerator/resourceTier)?)?$`, 'u'),
  new RegExp(`^documents/${DOCUMENT_INDEX}/flags/fvttJsonGenerator/(?:stage|resource|behaviorMechanics/${DOCUMENT_INDEX})$`, 'u'),
];
const WINDOWS_ABSOLUTE_PATH = /(?:^|[\s"'(])[A-Za-z]:[\\/]/u;
const UNC_OR_FILE_URL = /(?:\\\\|file:\/\/)/iu;
const UNIX_ABSOLUTE_PATH = /(?:^|[\s"'(])\/(?!\s)/u;
const REPOSITORY_RELATIVE_PATH = /(?:^|[\s"'(])(?:\.{1,2}\/|(?:apps|cache|docs|node_modules|obsidian|packages|private|repo|src|tests)\/)[^\s"')]+/iu;
const INTERNAL_PATH_FIELD = /\b(?:actorPath|dnd5eRepo|localCache|sourcePath)\b/u;

export function isSafeForgeDocumentFieldPath(value: string): boolean {
  return OUTPUT_PATH_PATTERNS.some((pattern) => pattern.test(value));
}

export function isSafeForgeDiagnosticPath(value: string): value is ForgeDiagnosticPath {
  return FORGE_DIAGNOSTIC_PATHS.includes(value as ForgeDiagnosticPath);
}

export function projectForgeDiagnosticPath(value: string): ForgeDiagnosticPath {
  if (isSafeForgeDiagnosticPath(value)) return value;
  const normalized = value.replaceAll('\\', '/');
  if (normalized === 'legacy-validator' || normalized.startsWith('legacy-validator/')) return 'legacy-validator';
  if (normalized === 'type' || normalized === '$' || normalized.startsWith('$/')) return 'artifact';
  if (normalized === '_stats' || normalized.startsWith('_stats/')) return 'artifact.metadata';
  if (normalized === 'documents' || normalized.startsWith('documents/')) return 'artifact.documents';
  if (normalized === 'items' || normalized.startsWith('items/')) return 'artifact.items';
  if (normalized === 'item' || normalized.startsWith('item/')) return normalized.includes('/mechanic') ? 'item.mechanics' : 'item';
  if (normalized === 'actor' || normalized.startsWith('actor/')) {
    if (/^actor\/(?:structuredActions|actions)(?:\/|$)/u.test(normalized)) return 'actor.actions';
    if (/^actor\/(?:behaviorSemantics|behaviors|hitDiceOutcome)(?:\/|$)/u.test(normalized)) return 'actor.behaviors';
    if (/^actor\/(?:items|features)(?:\/|$)/u.test(normalized)) return 'actor.items';
    if (/^actor\/traits(?:\/|$)/u.test(normalized)) return 'actor.traits';
    return 'actor';
  }
  throw new TypeError('Diagnostic path is outside the closed Forge logical namespaces.');
}

export function isSafeForgeWireMessage(value: string): boolean {
  return value.length > 0
    && value.length <= 4_000
    && !value.includes('\\')
    && !value.includes('/')
    && !WINDOWS_ABSOLUTE_PATH.test(value)
    && !UNC_OR_FILE_URL.test(value)
    && !UNIX_ABSOLUTE_PATH.test(value)
    && !REPOSITORY_RELATIVE_PATH.test(value)
    && !INTERNAL_PATH_FIELD.test(value);
}
