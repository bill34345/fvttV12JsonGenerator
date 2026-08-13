import { createHash } from 'node:crypto';
import * as yaml from 'js-yaml';
import type {
  CanonicalSpecies,
  SpeciesAutomation,
  SpeciesFeature,
  SpeciesFeaturePart,
  SpeciesMechanic,
} from '@fvtt-json-generator/models/species';
import { extractFrontmatter } from './itemRouter';
import { detectSpeciesRoute } from './speciesRouter';

const FEATURE_MARKER = /^<!--\s*species-feature:([a-z0-9][a-z0-9-]*)\s*-->\s*$/gmu;
const ALLOWED_AUTOMATION = new Set<SpeciesAutomation>(['native', 'descriptive', 'gm-assisted', 'external-rule']);

export class SpeciesMarkdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpeciesMarkdownError';
  }
}

export function parseSpeciesMarkdown(content: string): CanonicalSpecies {
  if (!detectSpeciesRoute(content)) throw new SpeciesMarkdownError('Species Markdown requires layout: species.');
  const frontmatter = asRecord(yaml.load(extractFrontmatter(content)));
  assertNoArbitraryFoundryFields(frontmatter);
  if (frontmatter['species-schema'] !== 1) throw new SpeciesMarkdownError('species-schema must be 1.');
  const source = asRecord(frontmatter.source);
  const featuresConfig = asArray(frontmatter.features);
  const descriptions = extractFeatureDescriptions(content);
  const features = featuresConfig.map((entry, index) => parseFeature(entry, descriptions, index));
  const featureIds = new Set<string>();
  const partIds = new Set<string>();
  for (const feature of features) {
    if (featureIds.has(feature.id)) throw new SpeciesMarkdownError(`Duplicate feature id: ${feature.id}.`);
    featureIds.add(feature.id);
    for (const part of feature.parts) {
      if (partIds.has(part.id)) throw new SpeciesMarkdownError(`Duplicate feature part id: ${part.id}.`);
      partIds.add(part.id);
    }
  }
  const sourceLength = requiredPositiveInteger(source.length, 'source.length');
  const rawSource = extractRawSource(content, sourceLength);
  const expectedSourceHash = requiredString(source.sha256, 'source.sha256');
  if (sha256(rawSource) !== expectedSourceHash) throw new SpeciesMarkdownError('Raw source SHA-256 does not match source.sha256.');
  const name = requiredString(frontmatter.name, 'name');
  const englishName = requiredString(frontmatter['english-name'], 'english-name');
  const creatureType = asRecord(frontmatter['creature-type']);
  const size = asRecord(frontmatter.size);
  const movement = asRecord(frontmatter.movement);
  const senses = asRecord(frontmatter.senses);
  const options = asArray(size.options).map(String);
  if (options.length !== 1 || !['lg', 'med', 'sm'].includes(options[0]!)) {
    throw new SpeciesMarkdownError('size.options must contain exactly one of lg, med, or sm.');
  }
  const walk = requiredPositiveNumber(movement.walk, 'movement.walk');
  const darkvision = senses.darkvision === undefined ? undefined : requiredNonNegativeNumber(senses.darkvision, 'senses.darkvision');
  return {
    schemaVersion: 1,
    name,
    englishName,
    displayName: requiredString(frontmatter['display-name'], 'display-name'),
    identifier: requiredIdentifier(frontmatter.identifier, 'identifier'),
    rules: requiredString(frontmatter.rules, 'rules') === '2024' ? '2024' : fail('rules must be 2024.'),
    creatureType: {
      value: requiredIdentifier(creatureType.value, 'creature-type.value'),
      subtype: requiredString(creatureType.subtype, 'creature-type.subtype'),
    },
    size: { options: options as ['lg'] | ['med'] | ['sm'], hint: requiredString(size.hint, 'size.hint') },
    movement: { walk },
    senses: { ...(darkvision !== undefined ? { darkvision } : {}) },
    source: {
      kind: requiredString(source.kind, 'source.kind') === 'private-homebrew' ? 'private-homebrew' : fail('source.kind must be private-homebrew.'),
      sha256: expectedSourceHash,
      irRevision: requiredPositiveInteger(source['ir-revision'], 'source.ir-revision'),
    },
    features,
    rawSource,
  };
}

function parseFeature(value: unknown, descriptions: Map<string, string>, index: number): SpeciesFeature {
  const entry = asRecord(value);
  const id = requiredIdentifier(entry.id, `features[${index}].id`);
  const description = descriptions.get(id);
  if (!description) throw new SpeciesMarkdownError(`Missing Markdown section for feature ${id}.`);
  const parts = asArray(entry.parts).map((part, partIndex) => parsePart(part, `${id}.parts[${partIndex}]`));
  if (!parts.length) throw new SpeciesMarkdownError(`Feature ${id} requires at least one part.`);
  return {
    id,
    name: requiredString(entry.name, `${id}.name`),
    ...(entry['english-name'] ? { englishName: requiredString(entry['english-name'], `${id}.english-name`) } : {}),
    description,
    parts,
  };
}

function parsePart(value: unknown, path: string): SpeciesFeaturePart {
  const entry = asRecord(value);
  const automation = requiredString(entry.automation, `${path}.automation`) as SpeciesAutomation;
  if (!ALLOWED_AUTOMATION.has(automation)) throw new SpeciesMarkdownError(`Unsupported automation at ${path}.`);
  return {
    id: requiredIdentifier(entry.id, `${path}.id`),
    level: requiredNonNegativeInteger(entry.level, `${path}.level`),
    automation,
    mechanics: asArray(entry.mechanics).map((mechanic, index) => parseMechanic(mechanic, `${path}.mechanics[${index}]`)),
  };
}

function parseMechanic(value: unknown, path: string): SpeciesMechanic {
  const entry = asRecord(value);
  const kind = requiredString(entry.kind, `${path}.kind`);
  if (kind === 'descriptive-passive') return { kind };
  if (kind === 'gm-assisted' || kind === 'external-rule') {
    const boundaries = asArray(entry.boundaries).map((item, index) => requiredString(item, `${path}.boundaries[${index}]`));
    if (!boundaries.length) throw new SpeciesMarkdownError(`${path} requires explicit boundaries.`);
    return { kind, boundaries };
  }
  if (kind === 'hp-per-level' || kind === 'ac-bonus') {
    const numeric = Number(entry.value);
    if (!Number.isInteger(numeric) || numeric === 0) throw new SpeciesMarkdownError(`${path}.value must be a non-zero integer.`);
    return { kind, value: numeric };
  }
  if (kind === 'limited-utility') {
    const uses = asRecord(entry.uses);
    const activation = requiredString(entry.activation, `${path}.activation`);
    const recovery = requiredString(uses.recovery, `${path}.uses.recovery`);
    if (!['action', 'bonus', 'reaction', 'special'].includes(activation)) throw new SpeciesMarkdownError(`${path}.activation is unsupported.`);
    if (!['lr', 'sr'].includes(recovery)) throw new SpeciesMarkdownError(`${path}.uses.recovery is unsupported.`);
    return {
      kind,
      activation: activation as 'action' | 'bonus' | 'reaction' | 'special',
      uses: { max: requiredPositiveInteger(uses.max, `${path}.uses.max`), recovery: recovery as 'lr' | 'sr' },
      consumption: requiredPositiveInteger(entry.consumption, `${path}.consumption`),
      chatFlavor: requiredString(entry['chat-flavor'], `${path}.chat-flavor`),
    };
  }
  throw new SpeciesMarkdownError(`Unsupported species mechanic ${kind} at ${path}.`);
}

function extractFeatureDescriptions(content: string): Map<string, string> {
  const bodyStart = content.indexOf('\n---', 3);
  const body = bodyStart >= 0 ? content.slice(bodyStart + 4) : content;
  const matches = [...body.matchAll(FEATURE_MARKER)];
  const result = new Map<string, string>();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!;
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.indexOf('<!-- species-raw-source -->', start);
    const section = body.slice(start, end < 0 ? body.length : end).trim();
    const description = section.replace(/^##[^\n]*\n+/u, '').trim();
    result.set(match[1]!, description);
  }
  return result;
}

function extractRawSource(content: string, sourceLength: number): string {
  const marker = '<!-- species-raw-source -->';
  const index = content.indexOf(marker);
  if (index < 0) throw new SpeciesMarkdownError('Species Markdown must preserve the raw source section.');
  const bodyMarker = '<!-- species-raw-source-body -->';
  const bodyMarkerIndex = content.indexOf(bodyMarker, index + marker.length);
  if (bodyMarkerIndex < 0) throw new SpeciesMarkdownError('Species Markdown must identify the exact raw source body.');
  const delimiterStart = bodyMarkerIndex + bodyMarker.length;
  const delimiter = content.slice(delimiterStart, delimiterStart + 2) === '\r\n' ? '\r\n' : content[delimiterStart] === '\n' ? '\n' : '';
  if (!delimiter) throw new SpeciesMarkdownError('Species raw source body must start on the next line.');
  const start = delimiterStart + delimiter.length;
  const rawSource = content.slice(start, start + sourceLength);
  if (rawSource.length !== sourceLength) throw new SpeciesMarkdownError('Species raw source body is shorter than source.length.');
  return rawSource;
}

function assertNoArbitraryFoundryFields(value: unknown, path = 'frontmatter'): void {
  if (Array.isArray(value)) { value.forEach((entry, index) => assertNoArbitraryFoundryFields(entry, `${path}[${index}]`)); return; }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /(?:^|\s)system\.[a-z0-9_.]+/iu.test(value)) throw new SpeciesMarkdownError(`Arbitrary Foundry system path is forbidden at ${path}.`);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (['changes', 'effect-changes', 'system-path', 'active-effect'].includes(key.toLowerCase())) throw new SpeciesMarkdownError(`Arbitrary Active Effect contract is forbidden at ${path}.${key}.`);
    assertNoArbitraryFoundryFields(entry, `${path}.${key}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SpeciesMarkdownError('Expected an object in Species Markdown contract.');
  return value as Record<string, unknown>;
}
function asArray(value: unknown): unknown[] { if (!Array.isArray(value)) throw new SpeciesMarkdownError('Expected an array in Species Markdown contract.'); return value; }
function requiredString(value: unknown, path: string): string { if (typeof value !== 'string' || !value.trim()) throw new SpeciesMarkdownError(`${path} is required.`); return value.trim(); }
function requiredIdentifier(value: unknown, path: string): string { const text = requiredString(value, path); if (!/^[a-z0-9][a-z0-9-]*$/u.test(text)) throw new SpeciesMarkdownError(`${path} must be a stable lowercase identifier.`); return text; }
function requiredPositiveNumber(value: unknown, path: string): number { const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw new SpeciesMarkdownError(`${path} must be positive.`); return n; }
function requiredNonNegativeNumber(value: unknown, path: string): number { const n = Number(value); if (!Number.isFinite(n) || n < 0) throw new SpeciesMarkdownError(`${path} must be non-negative.`); return n; }
function requiredPositiveInteger(value: unknown, path: string): number { const n = requiredPositiveNumber(value, path); if (!Number.isInteger(n)) throw new SpeciesMarkdownError(`${path} must be an integer.`); return n; }
function requiredNonNegativeInteger(value: unknown, path: string): number { const n = requiredNonNegativeNumber(value, path); if (!Number.isInteger(n)) throw new SpeciesMarkdownError(`${path} must be an integer.`); return n; }
function fail(message: string): never { throw new SpeciesMarkdownError(message); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
