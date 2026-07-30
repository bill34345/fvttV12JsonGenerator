import type { EffectProfile } from '../generator/effectProfileApplier';
import { getFoundryTarget, type FvttTargetVersion } from '../foundryTarget';
import type {
  CanonicalGenerationDocument,
  CanonicalGenerationMechanic,
  GenerationDiagnostic,
  GenerationVerification,
  MechanicsCoverageEntry,
} from './types';

interface VerifyGeneratedDocumentOptions {
  canonical: CanonicalGenerationDocument;
  output: any;
  target: FvttTargetVersion;
  effectProfile: EffectProfile;
}

export function verifyGeneratedDocument(
  options: VerifyGeneratedDocumentOptions,
): GenerationVerification {
  const diagnostics: GenerationDiagnostic[] = [];
  const documents = options.canonical.kind === 'actor'
    ? (Array.isArray(options.output?.items) ? options.output.items : [])
    : [options.output];

  if (options.canonical.kind === 'item' && options.output?.type !== options.canonical.targetDocumentType) {
    diagnostics.push(error(
      'GEN_ITEM_TYPE_MISMATCH',
      'schema',
      'type',
      `Expected Foundry document type "${options.canonical.targetDocumentType}", received "${String(options.output?.type)}".`,
    ));
  }

  for (const [documentIndex, document] of documents.entries()) {
    verifyIdsAndLinks(document, documentIndex, diagnostics);
    verifyDnd5eDocumentSchema(document, documentIndex, diagnostics);
  }

  if (options.effectProfile === 'core') {
    const leakPaths = findModuleAutomationPaths(options.output);
    for (const path of leakPaths) {
      diagnostics.push(error(
        'GEN_CORE_PROFILE_MODULE_LEAK',
        'semantic',
        path,
        'Core profile output contains MIDI-QOL, DAE, Times Up, or Item Macro automation.',
      ));
    }
  }

  const mechanicsCoverage = options.canonical.mechanics.map((mechanic) =>
    verifyMechanicCoverage(mechanic, documents, diagnostics));

  verifyTargetMetadata(options.output, options.target, diagnostics);

  const hasError = diagnostics.some((entry) => entry.severity === 'error');
  const needsReview = diagnostics.some((entry) => entry.severity === 'warning');
  return {
    status: hasError ? 'failed' : needsReview ? 'needs_review' : 'accepted',
    diagnostics,
    target: getFoundryTarget(options.target),
    mechanicsCoverage,
  };
}

function verifyDnd5eDocumentSchema(
  document: any,
  documentIndex: number,
  diagnostics: GenerationDiagnostic[],
): void {
  if (document?.system?.activation !== undefined) {
    diagnostics.push(error(
      'GEN_LEGACY_ITEM_ACTIVATION_PRESENT',
      'schema',
      `documents/${documentIndex}/system/activation`,
      'Item-level activation is legacy; activation must be owned by Activities.',
    ));
  }
  verifyUses(document?.system?.uses, `documents/${documentIndex}/system/uses`, diagnostics);

  const activities = document?.system?.activities ?? {};
  for (const [key, activity] of Object.entries(activities) as Array<[string, any]>) {
    if (!/^[A-Za-z0-9]{16}$/.test(key) || activity?._id !== key) {
      diagnostics.push(error(
        'GEN_INVALID_ACTIVITY_ID',
        'schema',
        `documents/${documentIndex}/system/activities/${key}`,
        'Activity map keys and _id fields must be identical stable 16-character IDs.',
      ));
    }
    verifyUses(
      activity?.uses,
      `documents/${documentIndex}/system/activities/${key}/uses`,
      diagnostics,
    );
  }
}

function verifyUses(
  uses: any,
  path: string,
  diagnostics: GenerationDiagnostic[],
): void {
  if (uses === undefined || uses === null) return;
  if (
    typeof uses !== 'object'
    || typeof uses.spent !== 'number'
    || (typeof uses.max !== 'string' && typeof uses.max !== 'number')
    || !Array.isArray(uses.recovery)
  ) {
    diagnostics.push(error(
      'GEN_INVALID_USES_SCHEMA',
      'schema',
      path,
      'Uses must use the spent/max/recovery structure.',
    ));
  }
  if ('value' in uses || 'per' in uses) {
    diagnostics.push(error(
      'GEN_LEGACY_USES_PRESENT',
      'schema',
      path,
      'Legacy uses.value/uses.per fields are not supported.',
    ));
  }
}

function verifyIdsAndLinks(
  document: any,
  documentIndex: number,
  diagnostics: GenerationDiagnostic[],
): void {
  const effects = Array.isArray(document?.effects) ? document.effects : [];
  const effectIds = new Set<string>();
  for (const [index, effect] of effects.entries()) {
    const id = String(effect?._id ?? '');
    if (!id) continue;
    if (effectIds.has(id)) {
      diagnostics.push(error(
        'GEN_DUPLICATE_EFFECT_ID',
        'schema',
        `documents/${documentIndex}/effects/${index}/_id`,
        `Duplicate Effect ID "${id}".`,
      ));
    }
    effectIds.add(id);
  }

  const activities = Object.values(document?.system?.activities ?? {}) as any[];
  const activityIds = new Set<string>();
  for (const [index, activity] of activities.entries()) {
    const id = String(activity?._id ?? '');
    if (id && activityIds.has(id)) {
      diagnostics.push(error(
        'GEN_DUPLICATE_ACTIVITY_ID',
        'schema',
        `documents/${documentIndex}/system/activities/${index}/_id`,
        `Duplicate Activity ID "${id}".`,
      ));
    }
    if (id) activityIds.add(id);
    for (const [linkIndex, link] of (activity?.effects ?? []).entries()) {
      const effectId = String(link?._id ?? '');
      if (effectId && !effectIds.has(effectId)) {
        diagnostics.push(error(
          'GEN_DANGLING_EFFECT_REFERENCE',
          'semantic',
          `documents/${documentIndex}/system/activities/${index}/effects/${linkIndex}`,
          `Activity references missing Effect "${effectId}".`,
        ));
      }
    }
  }
}

function verifyMechanicCoverage(
  mechanic: CanonicalGenerationMechanic,
  documents: any[],
  diagnostics: GenerationDiagnostic[],
): MechanicsCoverageEntry {
  if (mechanic.projection !== 'projected') {
    diagnostics.push({
      code: mechanic.projection === 'literal-only'
        ? 'GEN_LITERAL_REVIEW_REQUIRED'
        : 'GEN_UNSUPPORTED_MECHANIC',
      severity: 'warning',
      stage: 'semantic',
      path: mechanic.path,
      message: mechanic.projection === 'literal-only'
        ? 'Mechanic is preserved as literal text and requires human review.'
        : 'Mechanic is explicitly unsupported for this target.',
      evidence: mechanic.evidence,
    });
    return {
      mechanicId: mechanic.id,
      kind: mechanic.kind,
      sourcePath: mechanic.path,
      status: mechanic.projection,
      outputPaths: [],
    };
  }

  const outputPaths: string[] = [];
  for (const [documentIndex, document] of documents.entries()) {
    const allActivities = Object.values(document?.system?.activities ?? {}) as any[];
    const activities = activitiesForMechanic(mechanic, allActivities);
    for (const [activityIndex, activity] of activities.entries()) {
      if (matchesActivity(mechanic.kind, activity)) {
        outputPaths.push(`documents/${documentIndex}/system/activities/${activityIndex}`);
        if (mechanic.kind === 'save') {
          verifySaveOutcome(mechanic, activity, diagnostics);
        }
      }
    }
    if (
      mechanic.kind === 'damage'
      && activities.some((activity) => activity?.damage?.includeBase === true)
      && document?.system?.damage?.base
    ) {
      outputPaths.push(`documents/${documentIndex}/system/damage/base`);
    }
    if (mechanic.kind === 'effect' && (document?.effects?.length ?? 0) > 0) {
      outputPaths.push(`documents/${documentIndex}/effects`);
    }
    if (mechanic.kind === 'uses' && document?.system?.uses) {
      outputPaths.push(`documents/${documentIndex}/system/uses`);
    }
    if (mechanic.kind === 'stage' && document?.flags?.fvttJsonGenerator?.stage) {
      outputPaths.push(`documents/${documentIndex}/flags/fvttJsonGenerator/stage`);
    }
  }

  if (outputPaths.length === 0) {
    diagnostics.push(error(
      'GEN_MECHANIC_NOT_PROJECTED',
      'semantic',
      mechanic.path,
      `Source ${mechanic.kind} mechanic was not projected or explicitly preserved.`,
    ));
    return {
      mechanicId: mechanic.id,
      kind: mechanic.kind,
      sourcePath: mechanic.path,
      status: 'missing',
      outputPaths,
    };
  }

  return {
    mechanicId: mechanic.id,
    kind: mechanic.kind,
    sourcePath: mechanic.path,
    status: 'projected',
    outputPaths,
  };
}

function activitiesForMechanic(mechanic: CanonicalGenerationMechanic, activities: any[]): any[] {
  const sourceCoordinates = mechanic.path.match(/structuredActions\/([^/]+)\/(\d+)/);
  if (!sourceCoordinates?.[1] || sourceCoordinates[2] === undefined) {
    return activities;
  }
  const needle = `structuredActions/${sourceCoordinates[1]}/${sourceCoordinates[2]}/`;
  const scoped = activities.filter((activity) =>
    String(activity?.flags?.fvttJsonGenerator?.sourceLogicalPath ?? '').includes(needle));
  return scoped;
}

function verifySaveOutcome(
  mechanic: CanonicalGenerationMechanic,
  activity: any,
  diagnostics: GenerationDiagnostic[],
): void {
  const value = mechanic.value as { outcome?: string } | undefined;
  const expected = value?.outcome;
  if (!expected || expected === 'literal') return;
  const actual = activity?.damage?.onSave ?? 'none';
  if (actual !== expected) {
    diagnostics.push(error(
      'GEN_SAVE_OUTCOME_MISMATCH',
      'semantic',
      mechanic.path,
      `Expected successful-save outcome "${expected}", received "${String(actual)}".`,
    ));
  }
}

function matchesActivity(kind: CanonicalGenerationMechanic['kind'], activity: any): boolean {
  if (kind === 'attack') return activity?.type === 'attack';
  if (kind === 'save') return activity?.type === 'save';
  if (kind === 'damage') return Array.isArray(activity?.damage?.parts) && activity.damage.parts.length > 0;
  if (kind === 'activation') return Boolean(activity?.activation);
  if (kind === 'range') return Boolean(activity?.range);
  return false;
}

function verifyTargetMetadata(
  output: any,
  target: FvttTargetVersion,
  diagnostics: GenerationDiagnostic[],
): void {
  const expected = getFoundryTarget(target).stats;
  const stats = output?._stats;
  if (stats?.systemVersion && stats.systemVersion !== expected.systemVersion) {
    diagnostics.push(error(
      'GEN_TARGET_SYSTEM_VERSION_MISMATCH',
      'schema',
      '_stats/systemVersion',
      `Expected dnd5e ${expected.systemVersion}, received ${String(stats.systemVersion)}.`,
    ));
  }
}

function findModuleAutomationPaths(value: unknown, path = '$', results: string[] = []): string[] {
  if (!value || typeof value !== 'object') return results;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const next = `${path}/${key}`;
    const normalized = key.toLowerCase().replace(/[\s_-]/g, '');
    if (
      normalized.includes('midiqol')
      || normalized === 'dae'
      || normalized.includes('timesup')
      || normalized.includes('itemmacro')
    ) {
      results.push(next);
    }
    findModuleAutomationPaths(entry, next, results);
  }
  return results;
}

function error(
  code: string,
  stage: GenerationDiagnostic['stage'],
  path: string,
  message: string,
): GenerationDiagnostic {
  return { code, severity: 'error', stage, path, message };
}
