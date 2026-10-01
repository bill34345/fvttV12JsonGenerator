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
export const SPECIES_V14_368_TARGET = Object.freeze({
  foundry: '14.368',
  dnd5e: '6.0.2',
  effectProfile: 'core',
  rules: '2024',
} as const);
export const SPECIES_V12_TARGET = Object.freeze({
  foundry: '12.331',
  dnd5e: '4.3.9',
  effectProfile: 'core',
  rules: '2024',
} as const);
export type SpeciesTargetVersion = '12' | '14' | '14.368';
export type SpeciesTarget = typeof SPECIES_V12_TARGET | typeof SPECIES_V14_TARGET | typeof SPECIES_V14_368_TARGET;
export type SpeciesTargetForVersion<TVersion extends SpeciesTargetVersion> = TVersion extends '12'
  ? typeof SPECIES_V12_TARGET
  : TVersion extends '14.368' ? typeof SPECIES_V14_368_TARGET : typeof SPECIES_V14_TARGET;
export interface SpeciesCompileOptions<TVersion extends SpeciesTargetVersion = SpeciesTargetVersion> { fvttVersion: TVersion }
export const HOMEBREW_SPECIES_MODULE_ID = 'fvtt-homebrew-species' as const;
export const SPECIES_FALLBACK_ICON = 'icons/svg/mystery-man.svg';
const EFFECT_ALLOWLIST = new Map([
  ['hp-per-level', 'system.attributes.hp.bonuses.level'],
  ['ac-bonus', 'system.attributes.ac.bonus'],
]);

export interface NativeSpeciesPackage<TTarget extends SpeciesTarget = SpeciesTarget> {
  schemaVersion: 1;
  moduleId: typeof HOMEBREW_SPECIES_MODULE_ID;
  target: TTarget;
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
export type NativeSpeciesPackageForVersion<TVersion extends SpeciesTargetVersion> = NativeSpeciesPackage<SpeciesTargetForVersion<TVersion>>;
export type NativeSpeciesPackageV12 = NativeSpeciesPackageForVersion<'12'>;
export type NativeSpeciesPackageV14 = NativeSpeciesPackageForVersion<'14'>;
export type NativeSpeciesPackageV14_368 = NativeSpeciesPackageForVersion<'14.368'>;

export interface SpeciesPackageFinding {
  code: string;
  path: string;
  message: string;
}

export interface SpeciesPackageValidation {
  ok: boolean;
  findings: SpeciesPackageFinding[];
}

export function compileSpeciesMarkdownV14(markdown: string): NativeSpeciesPackageV14 {
  return compileSpeciesMarkdown(markdown, { fvttVersion: '14' });
}

export function parseAndCompileSpeciesMarkdownV14(markdown: string): {
  canonical: CanonicalSpecies;
  package: NativeSpeciesPackageV14;
} {
  return parseAndCompileSpeciesMarkdown(markdown, { fvttVersion: '14' });
}

export function compileCanonicalSpeciesV14(species: CanonicalSpecies, markdownSha256?: string): NativeSpeciesPackageV14 {
  return compileCanonicalSpecies(species, { fvttVersion: '14' }, markdownSha256);
}

export function compileSpeciesMarkdown<TVersion extends SpeciesTargetVersion>(markdown: string, options: SpeciesCompileOptions<TVersion>): NativeSpeciesPackageForVersion<TVersion>;
export function compileSpeciesMarkdown(markdown: string, options: SpeciesCompileOptions): NativeSpeciesPackage;
export function compileSpeciesMarkdown(markdown: string, options: SpeciesCompileOptions): NativeSpeciesPackage {
  return compileCanonicalSpecies(parseSpeciesMarkdown(markdown), options, sha256(markdown));
}

export function parseAndCompileSpeciesMarkdown<TVersion extends SpeciesTargetVersion>(markdown: string, options: SpeciesCompileOptions<TVersion>): {
  canonical: CanonicalSpecies;
  package: NativeSpeciesPackageForVersion<TVersion>;
};
export function parseAndCompileSpeciesMarkdown(markdown: string, options: SpeciesCompileOptions): {
  canonical: CanonicalSpecies;
  package: NativeSpeciesPackage;
} {
  const canonical = parseSpeciesMarkdown(markdown);
  return { canonical, package: compileCanonicalSpecies(canonical, options, sha256(markdown)) };
}

export function compileCanonicalSpecies<TVersion extends SpeciesTargetVersion>(species: CanonicalSpecies, options: SpeciesCompileOptions<TVersion>, markdownSha256?: string): NativeSpeciesPackageForVersion<TVersion>;
export function compileCanonicalSpecies(species: CanonicalSpecies, options: SpeciesCompileOptions): NativeSpeciesPackage;
export function compileCanonicalSpecies(
  species: CanonicalSpecies,
  options: SpeciesCompileOptions,
  markdownSha256?: string,
): NativeSpeciesPackage {
  const target = speciesTarget(options.fvttVersion);
  const featureItems = species.features.map((feature) => projectFeature(species, feature, options.fvttVersion));
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
    ...(options.fvttVersion === '14.368' ? { name: '' } : { title: '' }),
    hint: species.size.hint,
    value: options.fvttVersion === '12' ? { size: '' } : {},
  }];
  for (const [level, items] of [...grants.entries()].sort(([left], [right]) => left - right)) {
    advancement.push({
      _id: createStableDocumentId(['species', species.identifier, 'advancement', 'grant', level]),
      type: 'ItemGrant',
      configuration: { items, optional: false, spell: null },
      value: {},
      level,
      ...(options.fvttVersion === '14.368' ? { name: `${species.displayName}特性` } : { title: `${species.displayName}特性` }),
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
      movement: options.fvttVersion === '14.368'
        ? { speeds: { burrow: null, climb: null, fly: null, swim: null, walk: species.movement.walk }, units: 'ft', hover: false }
        : { burrow: null, climb: null, fly: null, swim: null, walk: species.movement.walk, units: 'ft', hover: false },
      senses: options.fvttVersion === '14.368' ? {
        ranges: { darkvision: species.senses.darkvision ?? null, blindsight: null, tremorsense: null, truesight: null },
        units: 'ft', special: '',
      } : {
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
  const logical = { schemaVersion: 1 as const, moduleId: HOMEBREW_SPECIES_MODULE_ID, target, sourceSha256: species.source.sha256, species: race, features: featureItems, coverageLedger };
  return { ...logical, ...(markdownSha256 ? { markdownSha256 } : {}), logicalHash: sha256(canonicalJson(logical)) };
}

function projectFeature(species: CanonicalSpecies, feature: SpeciesFeature, fvttVersion: SpeciesTargetVersion): Record<string, any> {
  const id = createStableDocumentId(['species', species.identifier, 'feature', feature.id]);
  const mechanics = feature.parts.flatMap((part) => part.mechanics);
  const effects = mechanics.flatMap((mechanic, index) => projectEffect(species, feature, mechanic, index, fvttVersion));
  const limited = mechanics.find((mechanic): mechanic is Extract<SpeciesMechanic, { kind: 'limited-utility' }> => mechanic.kind === 'limited-utility');
  const activityId = limited ? createStableDocumentId(['species', species.identifier, 'feature', feature.id, 'activity']) : undefined;
  const activities = limited && activityId ? {
    [activityId]: fvttVersion === '12' ? {
      type: 'utility',
      name: feature.name,
      _id: activityId,
      sort: 0,
      activation: { type: limited.activation, value: null, override: false, condition: '' },
      consumption: {
        targets: [{ type: 'itemUses', target: '', value: String(limited.consumption), scaling: { mode: '', formula: '' } }],
        scaling: { allowed: false, max: '' },
        spellSlot: false,
      },
      description: { chatFlavor: limited.chatFlavor },
      duration: { concentration: false, value: '', units: 'inst', special: '', override: false },
      effects: [],
      range: { value: '', units: 'self', special: '', override: false },
      target: {
        template: { count: '', contiguous: false, type: '', size: '', width: '', height: '', units: 'ft' },
        affects: { count: '', type: 'self', choice: false, special: '' },
        prompt: false,
        override: false,
      },
      roll: { formula: '', name: '', prompt: false, visible: false },
      uses: { spent: 0, recovery: [], max: '' },
      img: SPECIES_FALLBACK_ICON,
    } : {
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
      ...(fvttVersion === '14.368' ? {} : { appliedEffects: [] }),
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
    flags: fvttVersion === '12' ? {} : { dnd5e: { riders: { activity: [], effect: [] } } },
    sort: 0,
    ownership: { default: 0 },
  };
}

function projectEffect(species: CanonicalSpecies, feature: SpeciesFeature, mechanic: SpeciesMechanic, index: number, fvttVersion: SpeciesTargetVersion): Record<string, any>[] {
  const key = EFFECT_ALLOWLIST.get(mechanic.kind);
  if (!key || (mechanic.kind !== 'hp-per-level' && mechanic.kind !== 'ac-bonus')) return [];
  const effectId = createStableDocumentId(['species', species.identifier, 'feature', feature.id, 'effect', index]);
  const dnd6 = fvttVersion === '14.368';
  return [{
    name: feature.name,
    img: SPECIES_FALLBACK_ICON,
    _id: effectId,
    type: 'base',
    ...(dnd6 ? {
      system: {
        changes: [{
          _id: createStableDocumentId(['species', species.identifier, 'feature', feature.id, 'effect', index, 'change']),
          key, type: 'add', value: String(mechanic.value), phase: 'initial', priority: null,
          conditions: '{}', replacement: '',
        }],
        origin: {}, conditions: '{}', magical: false, rider: { statuses: [] },
      },
    } : { system: {}, changes: [{ key, mode: 2, value: String(mechanic.value), priority: null }] }),
    disabled: false,
    ...(dnd6
      ? { start: null, duration: { value: null, units: 'seconds', expiry: null, expired: false } }
      : { duration: { startTime: null, seconds: null, combat: null, rounds: null, turns: null, startRound: null, startTurn: null } }),
    description: '',
    origin: `Compendium.${HOMEBREW_SPECIES_MODULE_ID}.features.Item.${createStableDocumentId(['species', species.identifier, 'feature', feature.id])}`,
    tint: '#ffffff',
    transfer: true,
    statuses: [],
    ...(dnd6 ? { showIcon: 1, folder: null } : {}),
    sort: 0,
    flags: {},
  }];
}

export function validateNativeSpeciesPackage(pkg: NativeSpeciesPackage, expectedVersion?: SpeciesTargetVersion): SpeciesPackageValidation {
  const findings: SpeciesPackageFinding[] = [];
  const add = (code: string, path: string, message: string) => findings.push({ code, path, message });
  if (pkg.schemaVersion !== 1) add('SCHEMA_VERSION', '/schemaVersion', 'Species package schemaVersion must be 1.');
  if (pkg.moduleId !== HOMEBREW_SPECIES_MODULE_ID) add('MODULE_ID', '/moduleId', 'Unexpected module id.');
  const fvttVersion = identifySpeciesTarget(pkg.target);
  if (!fvttVersion || (expectedVersion && fvttVersion !== expectedVersion)) {
    add('TARGET', '/target', expectedVersion
      ? `Species package must target ${speciesTarget(expectedVersion).foundry} / dnd5e ${speciesTarget(expectedVersion).dnd5e}, with core / 2024.`
      : 'Species package must target a supported exact Foundry / dnd5e pair, with core / 2024.');
  }
  const ids = new Set<string>();
  const documents = [pkg.species, ...pkg.features];
  for (const [index, document] of documents.entries()) {
    if (!/^[a-f0-9]{16}$/u.test(String(document?._id ?? ''))) add('ID_FORMAT', `/documents/${index}/_id`, 'Document id must be a stable 16-character hex id.');
    if (ids.has(document._id)) add('DUPLICATE_ID', `/documents/${index}/_id`, 'Duplicate document id.');
    ids.add(document._id);
    const flagScopes = Object.keys(document?.flags ?? {});
    if (flagScopes.some((scope) => scope !== 'dnd5e')) add('CORE_PROFILE_MODULE_LEAKAGE', `/documents/${index}/flags`, 'Core Species packages may only contain dnd5e-owned flags.');
    if (fvttVersion === '12' && flagScopes.length) add('V12_FLAGS', `/documents/${index}/flags`, 'V12 Core Species documents must not carry projected module or V14 rider flags.');
    if (document.img !== SPECIES_FALLBACK_ICON) add('ICON_MODE', `/documents/${index}/img`, 'Species package must keep icon mode off with the Core fallback icon.');
    if (fvttVersion === '12') {
      rejectUnexpectedFields(document, ['name', 'type', '_id', 'img', 'system', 'effects', 'folder', 'sort', 'ownership', 'flags'], `/documents/${index}`, add);
      rejectUnexpectedFields(document.system, document.type === 'race'
        ? ['description', 'source', 'advancement', 'movement', 'senses', 'type', 'identifier']
        : ['activities', 'uses', 'description', 'source', 'enchant', 'type', 'prerequisites', 'properties', 'requirements', 'identifier'], `/documents/${index}/system`, add);
    }
    for (const [effectIndex, effect] of (Array.isArray(document.effects) ? document.effects : []).entries()) {
      if (fvttVersion === '12') {
        rejectUnexpectedFields(effect, ['name', 'img', '_id', 'type', 'system', 'changes', 'disabled', 'duration', 'description', 'origin', 'tint', 'transfer', 'statuses', 'sort', 'flags'], `/documents/${index}/effects/${effectIndex}`, add);
        if (Object.keys(effect.system ?? {}).length || Object.keys(effect.flags ?? {}).length) add('V12_EFFECT_EXTENSION', `/documents/${index}/effects/${effectIndex}`, 'V12 Core Species effects must not carry extension system data or flags.');
      }
      if (effect.transfer !== true) add('EFFECT_TRANSFER', `/documents/${index}/effects/${effectIndex}/transfer`, 'Species permanent effects must transfer.');
      if (fvttVersion === '14.368') {
        const effectPath = `/documents/${index}/effects/${effectIndex}`;
        rejectUnexpectedFields(effect, ['name', 'img', '_id', 'type', 'system', 'disabled', 'start', 'duration', 'description', 'origin', 'tint', 'transfer', 'statuses', 'showIcon', 'folder', 'sort', 'flags'], effectPath, add, 'V14_368');
        rejectUnexpectedFields(effect.system, ['changes', 'conditions', 'magical', 'rider', 'origin'], `${effectPath}/system`, add, 'V14_368');
        if (effect.type !== 'base' || !Array.isArray(effect.system?.changes) || effect.system.changes.length !== 1
          || canonicalJson(effect.system.origin) !== canonicalJson({}) || effect.system.conditions !== '{}' || effect.system.magical !== false
          || canonicalJson(effect.system.rider) !== canonicalJson({ statuses: [] })) {
          add('V14_368_EFFECT_SYSTEM', `${effectPath}/system`, 'dnd5e 6 base effects require one native system change and base system fields.');
        }
        if (effect.start !== null || canonicalJson(effect.duration) !== canonicalJson({ value: null, units: 'seconds', expiry: null, expired: false })
          || effect.showIcon !== 1 || effect.folder !== null) {
          add('V14_368_EFFECT_DOCUMENT', effectPath, 'Foundry 14 effects require native start, duration, icon, and folder fields.');
        }
      }
      const changes = fvttVersion === '14.368' ? effect.system?.changes : effect.changes;
      for (const [changeIndex, change] of (Array.isArray(changes) ? changes : []).entries()) {
        if (![...EFFECT_ALLOWLIST.values()].includes(change.key)) add('EFFECT_KEY', `/documents/${index}/effects/${effectIndex}/changes/${changeIndex}/key`, `Effect key ${String(change.key)} is not allowlisted.`);
        if (fvttVersion === '14.368') {
          rejectUnexpectedFields(change, ['_id', 'key', 'type', 'value', 'phase', 'priority', 'conditions', 'replacement'], `/documents/${index}/effects/${effectIndex}/system/changes/${changeIndex}`, add, 'V14_368');
          if (!/^[a-f0-9]{16}$/u.test(String(change._id ?? '')) || change.type !== 'add' || change.phase !== 'initial'
            || change.priority !== null || change.conditions !== '{}' || change.replacement !== '') {
            add('V14_368_EFFECT_CHANGE', `/documents/${index}/effects/${effectIndex}/system/changes/${changeIndex}`, 'dnd5e 6 Species changes must use stable IDs and native add/initial fields.');
          }
        } else if (change.mode !== 2) add('EFFECT_MODE', `/documents/${index}/effects/${effectIndex}/changes/${changeIndex}/mode`, 'Species effect changes must use ADD mode 2.');
      }
    }
  }
  if (pkg.species?.type !== 'race' || pkg.species?.system?.source?.rules !== '2024') add('RACE_STRUCTURE', '/species', 'Species document must be a 2024 race Item.');
  if (fvttVersion === '14.368') {
    const movement = pkg.species?.system?.movement;
    const senses = pkg.species?.system?.senses;
    if (movement?.speeds?.walk == null || Object.hasOwn(movement ?? {}, 'walk')) add('V14_368_MOVEMENT', '/species/system/movement', 'dnd5e 6 movement must use speeds.walk without a flat walk field.');
    if (!senses?.ranges || Object.hasOwn(senses, 'darkvision')) add('V14_368_SENSES', '/species/system/senses', 'dnd5e 6 senses must use ranges without flat sense fields.');
    for (const [index, advancement] of (pkg.species?.system?.advancement ?? []).entries()) {
      if (!Object.hasOwn(advancement, 'name') || Object.hasOwn(advancement, 'title')) add('V14_368_ADVANCEMENT', `/species/system/advancement/${index}`, 'dnd5e 6 advancements must use name, not title.');
    }
  }
  const sizeAdvancement = (pkg.species?.system?.advancement ?? []).find((entry: any) => entry.type === 'Size');
  if (fvttVersion === '12' && (sizeAdvancement?.level !== 0 || canonicalJson(sizeAdvancement?.value) !== canonicalJson({ size: '' }))) {
    add('V12_SIZE_VALUE', '/species/system/advancement', 'V12 Size advancement must be level 0 with value.size initialized to an empty string.');
  }
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
    if (fvttVersion === '12') {
      if (!['Size', 'ItemGrant'].includes(advancement.type)) add('V12_ADVANCEMENT_TYPE', `/species/system/advancement/${index}/type`, `Unsupported V12 Species advancement ${String(advancement.type)}.`);
      rejectUnexpectedFields(advancement, ['_id', 'type', 'configuration', 'value', 'level', 'title', 'hint'], `/species/system/advancement/${index}`, add);
    }
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
    if (new Set(coverage.map((entry) => entry.level)).size > 1) add('MIXED_FEATURE_GRANT_LEVEL', `${featurePath}/coverage`, 'All parts of one granted Feature must use the same level.');
    const kinds = coverage.flatMap((entry) => entry.mechanicKinds);
    const expectedEffectKeys = kinds.flatMap((kind) => EFFECT_ALLOWLIST.has(kind) ? [EFFECT_ALLOWLIST.get(kind)!] : []);
    const actualEffectKeys = (feature.effects ?? []).flatMap((effect: any) => (fvttVersion === '14.368' ? effect.system?.changes ?? [] : effect.changes ?? []).map((change: any) => change.key));
    for (const key of actualEffectKeys) if (!expectedEffectKeys.includes(key)) add('UNDECLARED_EFFECT', `${featurePath}/effects`, `Effect ${String(key)} is not declared by the coverage ledger.`);
    if (actualEffectKeys.length !== expectedEffectKeys.length || expectedEffectKeys.some((key) => !actualEffectKeys.includes(key))) add('EFFECT_COVERAGE_MISMATCH', `${featurePath}/effects`, 'Native Effect mechanics and coverage must be bidirectionally complete.');
    const activities = Object.values(feature.system?.activities ?? {}) as any[];
    const limitedCount = kinds.filter((kind) => kind === 'limited-utility').length;
    if (activities.length !== limitedCount) add('ACTIVITY_COVERAGE_MISMATCH', `${featurePath}/system/activities`, 'Limited Utility mechanics and activities must be bidirectionally complete.');
    for (const [activityIndex, activity] of activities.entries()) {
      if (activity.type !== 'utility' || activity.consumption?.spellSlot !== false || !activity.consumption?.targets?.some((target: any) => target.type === 'itemUses' && Number(target.value) >= 1)) add('INVALID_LIMITED_UTILITY', `${featurePath}/system/activities/${activityIndex}`, 'Limited Utility must consume item uses without consuming a spell slot.');
      if (activity.target?.affects?.type !== 'self' || activity.target?.template?.type) add('INVALID_UTILITY_TARGET', `${featurePath}/system/activities/${activityIndex}/target`, 'Species Limited Utility must target only the owning character and must not create a template.');
      if (fvttVersion === '14.368' && Object.hasOwn(activity, 'appliedEffects')) add('V14_368_ACTIVITY_FIELD', `${featurePath}/system/activities/${activityIndex}/appliedEffects`, 'dnd5e 6 activities use effects and cannot contain appliedEffects.');
      if (fvttVersion === '12') {
        if (Object.hasOwn(activity, 'appliedEffects')) add('V14_ACTIVITY_FIELD', `${featurePath}/system/activities/${activityIndex}/appliedEffects`, 'V12 activities must use effects and cannot contain appliedEffects.');
        const allowedActivityFields = new Set(['type', 'name', '_id', 'sort', 'activation', 'consumption', 'description', 'duration', 'effects', 'range', 'target', 'uses', 'roll', 'img']);
        for (const field of Object.keys(activity)) if (!allowedActivityFields.has(field)) add('V12_ACTIVITY_FIELD', `${featurePath}/system/activities/${activityIndex}/${field}`, `Unsupported V12 Activity field ${field}.`);
        const requiredActivityFields = [...allowedActivityFields];
        for (const field of requiredActivityFields) if (!Object.hasOwn(activity, field)) add('V12_ACTIVITY_SHAPE', `${featurePath}/system/activities/${activityIndex}/${field}`, `V12 BaseActivity field ${field} is required.`);
        if (!Array.isArray(activity.effects)) add('V12_ACTIVITY_EFFECTS', `${featurePath}/system/activities/${activityIndex}/effects`, 'V12 Activity effects must be an array.');
        validateV12ActivityShape(activity, `${featurePath}/system/activities/${activityIndex}`, add);
      }
    }
    const limitedUses = limitedCount ? feature.system?.uses : null;
    if (limitedUses && (!Number.isInteger(Number(limitedUses.max)) || Number(limitedUses.max) < 1
      || limitedUses.recovery?.length !== 1 || !['lr', 'sr'].includes(limitedUses.recovery[0]?.period)
      || limitedUses.recovery[0]?.type !== 'recoverAll')) {
      add('INVALID_UTILITY_RECOVERY', `${featurePath}/system/uses`, 'Limited Utility item uses require a positive maximum and one lr/sr recoverAll recovery.');
    }
    const grantCount = grantedCounts.get(feature._id) ?? 0;
    if (grantCount !== 1) add(grantCount ? 'DUPLICATE_GRANT' : 'MISSING_GRANT', featurePath, `Feature ${identifier || feature._id} must be granted exactly once.`);
  }
  for (const [featureId] of ledgerByFeature) if (!pkg.features.some((feature) => feature.system?.identifier === featureId)) add('ORPHAN_COVERAGE', '/coverageLedger', `Coverage references missing feature ${featureId}.`);
  const expectedLogical = { schemaVersion: pkg.schemaVersion, moduleId: pkg.moduleId, target: pkg.target, sourceSha256: pkg.sourceSha256, species: pkg.species, features: pkg.features, coverageLedger: pkg.coverageLedger };
  if (pkg.logicalHash !== sha256(canonicalJson(expectedLogical))) add('LOGICAL_HASH', '/logicalHash', 'Species logical hash does not match package content.');
  return { ok: findings.length === 0, findings };
}

function speciesTarget(fvttVersion: SpeciesTargetVersion): SpeciesTarget {
  return fvttVersion === '12' ? SPECIES_V12_TARGET : fvttVersion === '14.368' ? SPECIES_V14_368_TARGET : SPECIES_V14_TARGET;
}

function identifySpeciesTarget(target: SpeciesTarget): SpeciesTargetVersion | null {
  if (target?.foundry === SPECIES_V12_TARGET.foundry && target?.dnd5e === SPECIES_V12_TARGET.dnd5e
    && target?.effectProfile === 'core' && target?.rules === '2024') return '12';
  if (target?.foundry === SPECIES_V14_TARGET.foundry && target?.dnd5e === SPECIES_V14_TARGET.dnd5e
    && target?.effectProfile === 'core' && target?.rules === '2024') return '14';
  if (target?.foundry === SPECIES_V14_368_TARGET.foundry && target?.dnd5e === SPECIES_V14_368_TARGET.dnd5e
    && target?.effectProfile === 'core' && target?.rules === '2024') return '14.368';
  return null;
}

function rejectUnexpectedFields(value: unknown, allowed: string[], path: string, add: (code: string, path: string, message: string) => void, prefix = 'V12'): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { add(`${prefix}_FIELD_SHAPE`, path, `${prefix} projected data must use an object at this path.`); return; }
  const allowlist = new Set(allowed);
  for (const field of Object.keys(value as Record<string, unknown>)) if (!allowlist.has(field)) add(`${prefix}_FIELD`, `${path}/${field}`, `Unsupported ${prefix} field ${field}.`);
}

function validateV12ActivityShape(activity: any, path: string, add: (code: string, path: string, message: string) => void): void {
  const shapes: Array<[unknown, string[], string]> = [
    [activity.activation, ['type', 'value', 'condition', 'override'], 'activation'],
    [activity.consumption, ['targets', 'scaling', 'spellSlot'], 'consumption'],
    [activity.consumption?.scaling, ['allowed', 'max'], 'consumption/scaling'],
    [activity.description, ['chatFlavor'], 'description'],
    [activity.duration, ['concentration', 'value', 'units', 'special', 'override'], 'duration'],
    [activity.range, ['value', 'units', 'special', 'override'], 'range'],
    [activity.target, ['template', 'affects', 'prompt', 'override'], 'target'],
    [activity.target?.template, ['count', 'contiguous', 'type', 'size', 'width', 'height', 'units'], 'target/template'],
    [activity.target?.affects, ['count', 'type', 'choice', 'special'], 'target/affects'],
    [activity.uses, ['spent', 'recovery', 'max'], 'uses'],
    [activity.roll, ['formula', 'name', 'prompt', 'visible'], 'roll'],
  ];
  for (const [value, fields, suffix] of shapes) {
    rejectUnexpectedFields(value, fields, `${path}/${suffix}`, add);
    if (value && typeof value === 'object' && !Array.isArray(value)) for (const field of fields) if (!Object.hasOwn(value, field)) add('V12_ACTIVITY_SHAPE', `${path}/${suffix}/${field}`, `V12 BaseActivity field ${suffix}.${field} is required.`);
  }
  for (const [index, target] of (activity.consumption?.targets ?? []).entries()) {
    rejectUnexpectedFields(target, ['type', 'target', 'value', 'scaling'], `${path}/consumption/targets/${index}`, add);
    rejectUnexpectedFields(target?.scaling, ['mode', 'formula'], `${path}/consumption/targets/${index}/scaling`, add);
  }
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
