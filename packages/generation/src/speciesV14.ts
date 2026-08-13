import { createHash } from 'node:crypto';
import type { CanonicalSpecies, SpeciesFeature, SpeciesMechanic } from '@fvtt-json-generator/models/species';
import { parseSpeciesMarkdown } from '@fvtt-json-generator/parser/species-parser';
import { createStableDocumentId } from './stableId';

export const SPECIES_V14_TARGET = Object.freeze({
  foundry: '14.364',
  dnd5e: '5.3.3',
  effectProfile: 'core',
  rules: '2024',
} as const);
export const HOMEBREW_SPECIES_MODULE_ID = 'fvtt-homebrew-species' as const;
export const SPECIES_FALLBACK_ICON = 'icons/svg/mystery-man.svg';
const EFFECT_ALLOWLIST = new Map([
  ['hp-per-level', 'system.attributes.hp.bonuses.level'],
  ['ac-bonus', 'system.attributes.ac.bonus'],
]);

export interface NativeSpeciesPackage {
  schemaVersion: 1;
  moduleId: typeof HOMEBREW_SPECIES_MODULE_ID;
  target: typeof SPECIES_V14_TARGET;
  sourceSha256: string;
  markdownSha256?: string;
  species: Record<string, any>;
  features: Array<Record<string, any>>;
  coverageLedger: Array<{
    featureId: string;
    partId: string;
    level: number;
    automation: string;
    mechanicKinds: string[];
  }>;
  logicalHash: string;
}

export interface SpeciesPackageFinding {
  code: string;
  path: string;
  message: string;
}

export interface SpeciesPackageValidation {
  ok: boolean;
  findings: SpeciesPackageFinding[];
}

export function compileSpeciesMarkdownV14(markdown: string): NativeSpeciesPackage {
  return compileCanonicalSpeciesV14(parseSpeciesMarkdown(markdown), sha256(markdown));
}

export function parseAndCompileSpeciesMarkdownV14(markdown: string): {
  canonical: CanonicalSpecies;
  package: NativeSpeciesPackage;
} {
  const canonical = parseSpeciesMarkdown(markdown);
  return { canonical, package: compileCanonicalSpeciesV14(canonical, sha256(markdown)) };
}

export function compileCanonicalSpeciesV14(species: CanonicalSpecies, markdownSha256?: string): NativeSpeciesPackage {
  const featureItems = species.features.map((feature) => projectFeature(species, feature));
  const raceId = createStableDocumentId(['species', species.identifier, 'race']);
  const grants = new Map<number, Array<{ uuid: string; optional: false }>>();
  for (const feature of species.features) {
    const level = Math.min(...feature.parts.map((part) => part.level));
    const item = featureItems.find((candidate) => candidate.system.identifier === feature.id)!;
    const entries = grants.get(level) ?? [];
    entries.push({ uuid: `Compendium.${HOMEBREW_SPECIES_MODULE_ID}.features.Item.${item._id}`, optional: false });
    grants.set(level, entries);
  }
  const advancement: Record<string, any>[] = [{
    _id: createStableDocumentId(['species', species.identifier, 'advancement', 'size']),
    type: 'Size',
    configuration: { sizes: species.size.options },
    level: 0,
    title: '',
    hint: species.size.hint,
    value: {},
  }];
  for (const [level, items] of [...grants.entries()].sort(([left], [right]) => left - right)) {
    advancement.push({
      _id: createStableDocumentId(['species', species.identifier, 'advancement', 'grant', level]),
      type: 'ItemGrant',
      configuration: { items, optional: false, spell: null },
      value: {},
      level,
      title: `${species.displayName}特性`,
      hint: '',
    });
  }
  const race = {
    name: species.displayName,
    type: 'race',
    _id: raceId,
    img: SPECIES_FALLBACK_ICON,
    system: {
      description: { value: speciesDescription(species), chat: '' },
      source: { custom: 'Private homebrew', rules: '2024', revision: species.source.irRevision, book: '', license: '' },
      advancement,
      movement: { burrow: null, climb: null, fly: null, swim: null, walk: species.movement.walk, units: 'ft', hover: false },
      senses: {
        darkvision: species.senses.darkvision ?? null,
        blindsight: null,
        tremorsense: null,
        truesight: null,
        units: 'ft',
        special: '',
      },
      type: { value: species.creatureType.value, custom: '', subtype: species.creatureType.subtype },
      identifier: species.identifier,
    },
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
  };
  const coverageLedger = species.features.flatMap((feature) => feature.parts.map((part) => ({
    featureId: feature.id,
    partId: part.id,
    level: part.level,
    automation: part.automation,
    mechanicKinds: part.mechanics.map((mechanic) => mechanic.kind),
  })));
  const logical = { schemaVersion: 1 as const, moduleId: HOMEBREW_SPECIES_MODULE_ID, target: SPECIES_V14_TARGET, sourceSha256: species.source.sha256, species: race, features: featureItems, coverageLedger };
  return { ...logical, ...(markdownSha256 ? { markdownSha256 } : {}), logicalHash: sha256(canonicalJson(logical)) };
}

function projectFeature(species: CanonicalSpecies, feature: SpeciesFeature): Record<string, any> {
  const id = createStableDocumentId(['species', species.identifier, 'feature', feature.id]);
  const mechanics = feature.parts.flatMap((part) => part.mechanics);
  const effects = mechanics.flatMap((mechanic, index) => projectEffect(species, feature, mechanic, index));
  const limited = mechanics.find((mechanic): mechanic is Extract<SpeciesMechanic, { kind: 'limited-utility' }> => mechanic.kind === 'limited-utility');
  const activityId = limited ? createStableDocumentId(['species', species.identifier, 'feature', feature.id, 'activity']) : undefined;
  const activities = limited && activityId ? {
    [activityId]: {
      type: 'utility',
      name: feature.name,
      _id: activityId,
      sort: 0,
      activation: { type: limited.activation, value: null, override: false, condition: '' },
      consumption: {
        scaling: { allowed: false },
        spellSlot: false,
        targets: [{ type: 'itemUses', value: String(limited.consumption), target: '', scaling: {} }],
      },
      description: { chatFlavor: limited.chatFlavor },
      duration: { units: 'inst', concentration: false, override: false, value: '' },
      effects: [],
      range: { override: false, units: 'self', special: '' },
      target: { template: { contiguous: false, units: 'ft', type: '' }, affects: { choice: false, count: '', type: 'self', special: '' }, override: false, prompt: false },
      uses: { spent: 0, recovery: [], max: '' },
      roll: { prompt: false, visible: false, name: '', formula: '' },
      img: SPECIES_FALLBACK_ICON,
      appliedEffects: [],
    },
  } : {};
  const level = Math.min(...feature.parts.map((part) => part.level));
  return {
    name: feature.englishName ? `${feature.name}（${feature.englishName}）` : feature.name,
    type: 'feat',
    _id: id,
    img: SPECIES_FALLBACK_ICON,
    system: {
      activities,
      uses: limited ? { spent: 0, recovery: [{ period: limited.uses.recovery, type: 'recoverAll' }], max: String(limited.uses.max) } : { spent: 0, recovery: [], max: '' },
      description: { value: markdownToHtml(feature.description), chat: '' },
      source: { custom: 'Private homebrew', rules: '2024', revision: species.source.irRevision, book: '', license: '' },
      enchant: {},
      type: { value: 'race', subtype: '' },
      prerequisites: { level, repeatable: false },
      properties: [],
      requirements: species.displayName,
      identifier: feature.id,
    },
    effects,
    folder: null,
    flags: { dnd5e: { riders: { activity: [], effect: [] } } },
    sort: 0,
    ownership: { default: 0 },
  };
}

function projectEffect(species: CanonicalSpecies, feature: SpeciesFeature, mechanic: SpeciesMechanic, index: number): Record<string, any>[] {
  const key = EFFECT_ALLOWLIST.get(mechanic.kind);
  if (!key || (mechanic.kind !== 'hp-per-level' && mechanic.kind !== 'ac-bonus')) return [];
  const effectId = createStableDocumentId(['species', species.identifier, 'feature', feature.id, 'effect', index]);
  return [{
    name: feature.name,
    img: SPECIES_FALLBACK_ICON,
    _id: effectId,
    type: 'base',
    system: {},
    changes: [{ key, mode: 2, value: String(mechanic.value), priority: null }],
    disabled: false,
    duration: { startTime: null, seconds: null, combat: null, rounds: null, turns: null, startRound: null, startTurn: null },
    description: '',
    origin: `Compendium.${HOMEBREW_SPECIES_MODULE_ID}.features.Item.${createStableDocumentId(['species', species.identifier, 'feature', feature.id])}`,
    tint: '#ffffff',
    transfer: true,
    statuses: [],
    sort: 0,
    flags: {},
  }];
}

export function validateNativeSpeciesPackage(pkg: NativeSpeciesPackage): SpeciesPackageValidation {
  const findings: SpeciesPackageFinding[] = [];
  const add = (code: string, path: string, message: string) => findings.push({ code, path, message });
  if (pkg.schemaVersion !== 1) add('SCHEMA_VERSION', '/schemaVersion', 'Species package schemaVersion must be 1.');
  if (pkg.moduleId !== HOMEBREW_SPECIES_MODULE_ID) add('MODULE_ID', '/moduleId', 'Unexpected module id.');
  if (pkg.target.foundry !== '14.364' || pkg.target.dnd5e !== '5.3.3' || pkg.target.effectProfile !== 'core' || pkg.target.rules !== '2024') add('TARGET', '/target', 'Species package must target Foundry 14.364 / dnd5e 5.3.3 / core / 2024.');
  const ids = new Set<string>();
  const documents = [pkg.species, ...pkg.features];
  for (const [index, document] of documents.entries()) {
    if (!/^[a-f0-9]{16}$/u.test(String(document?._id ?? ''))) add('ID_FORMAT', `/documents/${index}/_id`, 'Document id must be a stable 16-character hex id.');
    if (ids.has(document._id)) add('DUPLICATE_ID', `/documents/${index}/_id`, 'Duplicate document id.');
    ids.add(document._id);
    const flagScopes = Object.keys(document?.flags ?? {});
    if (flagScopes.some((scope) => scope !== 'dnd5e')) add('CORE_PROFILE_MODULE_LEAKAGE', `/documents/${index}/flags`, 'Core Species packages may only contain dnd5e-owned flags.');
    if (document.img !== SPECIES_FALLBACK_ICON) add('ICON_MODE', `/documents/${index}/img`, 'Species package must keep icon mode off with the Core fallback icon.');
    for (const [effectIndex, effect] of (Array.isArray(document.effects) ? document.effects : []).entries()) {
      if (effect.transfer !== true) add('EFFECT_TRANSFER', `/documents/${index}/effects/${effectIndex}/transfer`, 'Species permanent effects must transfer.');
      for (const [changeIndex, change] of (Array.isArray(effect.changes) ? effect.changes : []).entries()) {
        if (![...EFFECT_ALLOWLIST.values()].includes(change.key)) add('EFFECT_KEY', `/documents/${index}/effects/${effectIndex}/changes/${changeIndex}/key`, `Effect key ${String(change.key)} is not allowlisted.`);
        if (change.mode !== 2) add('EFFECT_MODE', `/documents/${index}/effects/${effectIndex}/changes/${changeIndex}/mode`, 'Species effect changes must use ADD mode 2.');
      }
    }
  }
  if (pkg.species?.type !== 'race' || pkg.species?.system?.source?.rules !== '2024') add('RACE_STRUCTURE', '/species', 'Species document must be a 2024 race Item.');
  const ledgerByFeature = new Map<string, NativeSpeciesPackage['coverageLedger']>();
  const partIds = new Set<string>();
  for (const [index, entry] of (pkg.coverageLedger ?? []).entries()) {
    if (partIds.has(entry.partId)) add('DUPLICATE_PART_ID', `/coverageLedger/${index}/partId`, 'Coverage part ids must be globally unique.');
    partIds.add(entry.partId);
    const values = ledgerByFeature.get(entry.featureId) ?? [];
    values.push(entry); ledgerByFeature.set(entry.featureId, values);
  }
  const featureIds = new Set(pkg.features.map((feature) => feature._id));
  const featureById = new Map(pkg.features.map((feature) => [feature._id, feature]));
  const grantedCounts = new Map<string, number>();
  for (const [index, advancement] of (pkg.species?.system?.advancement ?? []).entries()) {
    if (advancement.type !== 'ItemGrant') continue;
    for (const [itemIndex, item] of (advancement.configuration?.items ?? []).entries()) {
      const match = new RegExp(`^Compendium\\.${HOMEBREW_SPECIES_MODULE_ID}\\.features\\.Item\\.([a-f0-9]{16})$`, 'u').exec(String(item.uuid));
      if (!match || !featureIds.has(match[1]!)) add('DANGLING_GRANT', `/species/system/advancement/${index}/configuration/items/${itemIndex}/uuid`, 'ItemGrant must resolve to this package features pack.');
      else {
        const feature = featureById.get(match[1]!)!;
        grantedCounts.set(match[1]!, (grantedCounts.get(match[1]!) ?? 0) + 1);
        const entries = ledgerByFeature.get(String(feature.system?.identifier)) ?? [];
        const expectedLevel = entries.length ? Math.min(...entries.map((entry) => entry.level)) : -1;
        if (advancement.level !== expectedLevel) add('GRANT_LEVEL', `/species/system/advancement/${index}/level`, `ItemGrant level does not match coverage for ${String(feature.system?.identifier)}.`);
      }
    }
  }
  for (const [index, feature] of pkg.features.entries()) {
    const featurePath = `/features/${index}`;
    const identifier = String(feature.system?.identifier ?? '');
    const coverage = ledgerByFeature.get(identifier) ?? [];
    if (!coverage.length) add('MISSING_FEATURE_COVERAGE', featurePath, `Feature ${identifier || feature._id} has no mechanics coverage.`);
    const kinds = coverage.flatMap((entry) => entry.mechanicKinds);
    const expectedEffectKeys = kinds.flatMap((kind) => EFFECT_ALLOWLIST.has(kind) ? [EFFECT_ALLOWLIST.get(kind)!] : []);
    const actualEffectKeys = (feature.effects ?? []).flatMap((effect: any) => (effect.changes ?? []).map((change: any) => change.key));
    for (const key of actualEffectKeys) if (!expectedEffectKeys.includes(key)) add('UNDECLARED_EFFECT', `${featurePath}/effects`, `Effect ${String(key)} is not declared by the coverage ledger.`);
    if (actualEffectKeys.length !== expectedEffectKeys.length || expectedEffectKeys.some((key) => !actualEffectKeys.includes(key))) add('EFFECT_COVERAGE_MISMATCH', `${featurePath}/effects`, 'Native Effect mechanics and coverage must be bidirectionally complete.');
    const activities = Object.values(feature.system?.activities ?? {}) as any[];
    const limitedCount = kinds.filter((kind) => kind === 'limited-utility').length;
    if (activities.length !== limitedCount) add('ACTIVITY_COVERAGE_MISMATCH', `${featurePath}/system/activities`, 'Limited Utility mechanics and activities must be bidirectionally complete.');
    for (const [activityIndex, activity] of activities.entries()) {
      if (activity.type !== 'utility' || activity.consumption?.spellSlot !== false || !activity.consumption?.targets?.some((target: any) => target.type === 'itemUses' && Number(target.value) >= 1)) add('INVALID_LIMITED_UTILITY', `${featurePath}/system/activities/${activityIndex}`, 'Limited Utility must consume item uses without consuming a spell slot.');
    }
    const grantCount = grantedCounts.get(feature._id) ?? 0;
    if (grantCount !== 1) add(grantCount ? 'DUPLICATE_GRANT' : 'MISSING_GRANT', featurePath, `Feature ${identifier || feature._id} must be granted exactly once.`);
  }
  for (const [featureId] of ledgerByFeature) if (!pkg.features.some((feature) => feature.system?.identifier === featureId)) add('ORPHAN_COVERAGE', '/coverageLedger', `Coverage references missing feature ${featureId}.`);
  const expectedLogical = { schemaVersion: pkg.schemaVersion, moduleId: pkg.moduleId, target: pkg.target, sourceSha256: pkg.sourceSha256, species: pkg.species, features: pkg.features, coverageLedger: pkg.coverageLedger };
  if (pkg.logicalHash !== sha256(canonicalJson(expectedLogical))) add('LOGICAL_HASH', '/logicalHash', 'Species logical hash does not match package content.');
  return { ok: findings.length === 0, findings };
}

function speciesDescription(species: CanonicalSpecies): string {
  const traits = species.features.map((feature) => `<h3>${escapeHtml(feature.name)}</h3>${markdownToHtml(feature.description)}`).join('');
  return `<p><strong>生物类型：</strong>${escapeHtml(species.creatureType.value)}</p><p><strong>体型：</strong>${escapeHtml(species.size.hint)}</p><p><strong>速度：</strong>${species.movement.walk}尺</p>${traits}`;
}
function markdownToHtml(value: string): string {
  return value.split(/\n{2,}/u).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/gu, '<br>')}</p>`).join('');
}
function escapeHtml(value: string): string { return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;'); }
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
