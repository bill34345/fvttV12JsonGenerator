import type { EffectProfile } from './effectProfileApplier';
import { resolveLockedDnd5eV14Spell } from './v14SpellCatalog';
import { getFoundryTarget, type FvttTargetVersion } from './target';
import { isFoundryHtmlDescription } from './item-description';
import { sourceConditionLifecycle, extractExplicitlyInflictedStatuses } from './actor-effects';
import { readConditionInstance } from '@fvtt-json-generator/contracts/conditions';
import {
  WEAPON_PROPERTIES_MODULE_ID,
  parseWeaponConfiguration,
  readWeaponConfiguration,
  weaponCriticalBonus,
  readLiteralWeaponBaseIndex,
  type WeaponConfiguration,
} from '@fvtt-json-generator/contracts/weapon-properties';
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

  if (options.canonical.kind === 'item' && options.target === '14') {
    const description = options.output?.system?.description?.value;
    if (typeof description === 'string' && description.trim() && !isFoundryHtmlDescription(description)) {
      diagnostics.push(error(
        'GEN_V14_ITEM_DESCRIPTION_NOT_HTML',
        'semantic',
        'system/description/value',
        'Foundry V14 Item descriptions must be projected as HTML rather than raw Markdown.',
      ));
    }
  }

  for (const [documentIndex, document] of documents.entries()) {
    verifyIdsAndLinks(document, documentIndex, diagnostics);
    verifyDnd5eDocumentSchema(document, documentIndex, diagnostics, options.target);
  }
  if (options.canonical.kind === 'actor') {
    verifyActorResourceLinks(options.output, diagnostics);
    verifyActorBehaviorLinks(options.output, diagnostics);
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
    verifyMechanicCoverage(mechanic, documents, diagnostics, options.target, options.effectProfile));

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
  target: FvttTargetVersion,
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
    if (target === '14' && activity?.type === 'attack' && (!['melee', 'ranged'].includes(activity.attack?.type?.value) || !['weapon', 'spell'].includes(activity.attack?.type?.classification))) {
      diagnostics.push(error('GEN_V14_ATTACK_TYPE_INVALID', 'semantic', `documents/${documentIndex}/system/activities/${key}/attack/type`, 'V14 Attack requires native melee/ranged and weapon/spell, not a legacy actionType enum.'));
    }
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
  const maximum = Number(uses.max);
  if (
    typeof uses.spent === 'number'
    && Number.isFinite(maximum)
    && (uses.spent < 0 || uses.spent > maximum)
  ) {
    diagnostics.push(error(
      'GEN_USES_OUT_OF_BOUNDS',
      'semantic',
      path,
      `Uses spent must remain within 0..${maximum}.`,
    ));
  }
}

function verifyActorResourceLinks(actor: any, diagnostics: GenerationDiagnostic[]): void {
  const items = Array.isArray(actor?.items) ? actor.items : [];
  const itemIds = new Set<string>();
  for (const [index, item] of items.entries()) {
    const id = String(item?._id ?? '');
    if (id) {
      if (!/^[A-Za-z0-9]{16}$/.test(id)) {
        diagnostics.push(error(
          'GEN_INVALID_ITEM_ID',
          'schema',
          `items/${index}/_id`,
          'Resource-linked Item IDs must be stable 16-character IDs.',
        ));
      }
      if (itemIds.has(id)) {
        diagnostics.push(error(
          'GEN_DUPLICATE_ITEM_ID',
          'schema',
          `items/${index}/_id`,
          `Duplicate Actor Item ID "${id}".`,
        ));
      }
      itemIds.add(id);
    }
  }

  for (const [itemIndex, item] of items.entries()) {
    const hasResourceRole = Boolean(
      item?.flags?.fvttJsonGenerator?.resource
      || Object.values(item?.system?.activities ?? {}).some((activity: any) =>
        activity?.flags?.fvttJsonGenerator?.resourceConsumption
        || activity?.flags?.fvttJsonGenerator?.resourceTransition),
    );
    if (hasResourceRole && !item?._id) {
      diagnostics.push(error(
        'GEN_RESOURCE_ITEM_ID_MISSING',
        'schema',
        `items/${itemIndex}/_id`,
        'Every resource carrier or consumer must have a stable Item ID.',
      ));
    }
    for (const [activityId, activity] of Object.entries(item?.system?.activities ?? {}) as Array<[string, any]>) {
      for (const [targetIndex, target] of (activity?.consumption?.targets ?? []).entries()) {
        if (target?.type !== 'itemUses' || !target?.target) continue;
        if (!itemIds.has(String(target.target))) {
          diagnostics.push(error(
            'GEN_DANGLING_ITEM_USES_REFERENCE',
            'semantic',
            `items/${itemIndex}/system/activities/${activityId}/consumption/targets/${targetIndex}`,
            `Activity references missing embedded Item "${String(target.target)}".`,
          ));
        }
      }
    }
  }
}

function verifyActorBehaviorLinks(actor: any, diagnostics: GenerationDiagnostic[]): void {
  const items = Array.isArray(actor?.items) ? actor.items : [];
  const itemIds = new Set(items.map((item: any) => String(item?._id ?? '')).filter(Boolean));
  const mechanicIds = new Set<string>();
  for (const [itemIndex, item] of items.entries()) {
    for (const [mechanicIndex, mechanic] of (item?.flags?.fvttJsonGenerator?.behaviorMechanics ?? []).entries()) {
      const path = `items/${itemIndex}/flags/fvttJsonGenerator/behaviorMechanics/${mechanicIndex}`;
      const id = String(mechanic?.id ?? '');
      if (!id) {
        diagnostics.push(error('GEN_BEHAVIOR_ID_MISSING', 'schema', `${path}/id`, 'Behavior mechanic ID is required.'));
      } else if (mechanicIds.has(id)) {
        diagnostics.push(error(
          'GEN_DUPLICATE_BEHAVIOR_ID',
          'semantic',
          `${path}/id`,
          `Duplicate projected behavior mechanic "${id}".`,
        ));
      } else {
        mechanicIds.add(id);
      }
      for (const [referenceIndex, reference] of (mechanic?.references ?? []).entries()) {
        if (!itemIds.has(String(reference?.itemId ?? ''))) {
          diagnostics.push(error(
            'GEN_DANGLING_BEHAVIOR_ITEM_REFERENCE',
            'semantic',
            `${path}/references/${referenceIndex}/itemId`,
            `Behavior mechanic references missing embedded Item "${String(reference?.itemId ?? '')}".`,
          ));
        }
      }
      if (
        (mechanic?.executionMode === 'gm-assisted' || mechanic?.executionMode === 'external-rule')
        && (!Array.isArray(mechanic?.gmSteps) || mechanic.gmSteps.length === 0)
      ) {
        diagnostics.push(error(
          'GEN_BEHAVIOR_GM_STEPS_MISSING',
          'semantic',
          `${path}/gmSteps`,
          `${String(mechanic.executionMode)} behavior must include explicit GM steps.`,
        ));
      }
      if (mechanic?.executionMode === 'external-rule' && !mechanic?.externalRule) {
        diagnostics.push(error(
          'GEN_BEHAVIOR_EXTERNAL_RULE_MISSING',
          'semantic',
          `${path}/externalRule`,
          'external-rule behavior must preserve its external rule reference.',
        ));
      }
    }
    for (const [activityId, activity] of Object.entries(item?.system?.activities ?? {}) as Array<[string, any]>) {
      const operation = activity?.flags?.fvttJsonGenerator?.behaviorOperation;
      if (operation && !mechanicIds.has(String(operation.mechanicId ?? ''))) {
        diagnostics.push(error(
          'GEN_DANGLING_BEHAVIOR_OPERATION',
          'semantic',
          `items/${itemIndex}/system/activities/${activityId}/flags/fvttJsonGenerator/behaviorOperation`,
          `Behavior operation references missing mechanic "${String(operation.mechanicId ?? '')}".`,
        ));
      }
    }
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
  target: FvttTargetVersion,
  effectProfile: EffectProfile,
): MechanicsCoverageEntry {
  const behavior = mechanic.kind.startsWith('behavior-')
    ? mechanic.value as {
        id?: string;
        coverage?: MechanicsCoverageEntry['expressionCoverage'];
        executionMode?: MechanicsCoverageEntry['executionMode'];
      } | undefined
    : undefined;
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
      ...(behavior ? {
        expressionCoverage: behavior.coverage,
        executionMode: behavior.executionMode,
      } : {}),
    };
  }

  if (mechanic.kind === 'weapon-properties' && mechanic.path.startsWith('actor/')) {
    const outputPaths = verifyActorWeaponMechanic(mechanic, documents, diagnostics, effectProfile, target);
    if (outputPaths.length === 0) {
      diagnostics.push(error(
        'GEN_MECHANIC_NOT_PROJECTED',
        'semantic',
        mechanic.path,
        'Source weapon-properties mechanic was not projected to an embedded Actor weapon Item.',
      ));
      return {
        mechanicId: mechanic.id,
        kind: mechanic.kind,
        sourcePath: mechanic.path,
        status: 'missing',
        outputPaths: [],
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

  const itemSpecificPaths = documents.length === 1 && mechanic.path.startsWith('item/')
    ? verifyItemSpecificMechanic(mechanic, documents[0], diagnostics, target, effectProfile)
    : undefined;
  if (itemSpecificPaths !== undefined) {
    if (itemSpecificPaths.length === 0) {
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
        outputPaths: [],
      };
    }
    return {
      mechanicId: mechanic.id,
      kind: mechanic.kind,
      sourcePath: mechanic.path,
      status: 'projected',
      outputPaths: itemSpecificPaths,
    };
  }

  const outputPaths: string[] = [];
  for (const [documentIndex, document] of documents.entries()) {
    const allActivities = Object.values(document?.system?.activities ?? {}) as any[];
    const activities = activitiesForMechanic(mechanic, allActivities);
    const structuredUses = mechanic.kind === 'uses' ? readStructuredUses(mechanic.value) : undefined;
    if (mechanic.kind === 'uses' && mechanic.path.startsWith('actor/') && structuredUses) {
      const uses = document?.system?.uses;
      const primary = activities[0];
      const costs = primary?.consumption?.targets ?? [];
      const expectedPeriod = mapStructuredUsesPeriod(structuredUses.period);
      const value=mechanic.value as {executionMode?:string;sourceText?:string};
      const marker=document?.flags?.fvttJsonGenerator?.manualRule;
      const manual=value.executionMode==='gm-manual'&&marker?.version===1&&marker.mode==='gm-manual'
        &&typeof marker.logicalPath==='string'&&marker.logicalPath.startsWith(mechanic.path.replace(/^actor\//u,'').replace(/\/uses$/u,'/'))
        &&marker.sourceText===value.sourceText&&activities.length===1&&primary?.type==='utility'
        &&!primary.damage&&!primary.attack&&!primary.save&&!(primary.effects?.length)&&!(document.effects?.length)&&costs.length===0;
      if (String(uses?.max) === String(structuredUses.max)
        && uses?.recovery?.length === 1
        && uses.recovery[0]?.period === expectedPeriod
        && uses.recovery[0]?.type === 'recoverAll'
        && (manual || primary?.consumption?.spellSlot === false
        && costs.length === 1 && costs[0]?.type === 'itemUses' && costs[0]?.target === '' && String(costs[0]?.value) === '1')) {
        outputPaths.push(`documents/${documentIndex}/system/uses`);
      }
      continue;
    }
    if (mechanic.kind === 'uses' && typeof mechanic.value === 'number' && mechanic.path.startsWith('actor/')) {
      const uses = document?.system?.uses;
      const primary = activities[0];
      const costs = primary?.consumption?.targets ?? [];
      if (String(uses?.max) === String(mechanic.value)
        && uses?.recovery?.some((entry: any) => entry.period === 'lr' && entry.type === 'recoverAll')
        && primary?.consumption?.spellSlot === false
        && costs.length === 1 && costs[0]?.type === 'itemUses' && costs[0]?.target === '' && String(costs[0]?.value) === '1') {
        outputPaths.push(`documents/${documentIndex}/system/uses`);
      }
      continue;
    }
    for (const [activityIndex, activity] of activities.entries()) {
      if (matchesActivity(mechanic.kind, activity)) {
        outputPaths.push(`documents/${documentIndex}/system/activities/${activityIndex}`);
        if (target === '14' && mechanic.kind === 'attack') {
          verifyV14DynamicWeaponDamage(mechanic, activity, document, diagnostics);
          const expectedType = (mechanic.value as { type?: string })?.type;
          if (expectedType && /^(?:mwak|rwak|msak|rsak)$/u.test(expectedType)
            && (activities.filter(entry => entry.type === 'attack').length === 1 && activity.attack?.type?.value !== (expectedType.startsWith('r') ? 'ranged' : 'melee')
              || activity.attack?.type?.classification !== (expectedType.endsWith('sak') ? 'spell' : 'weapon'))) {
            diagnostics.push(error('GEN_V14_ATTACK_TYPE_MISMATCH', 'semantic', mechanic.path, 'Native Attack mode/classification differs from its source attack type.'));
          }
        }
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
    if (mechanic.kind === 'effect') {
      const value = mechanic.value as { type?: string; duration?: string; sourceText?: string } | undefined;
      const statuses = value?.type ? extractExplicitlyInflictedStatuses(`The target is ${value.type}.`) : [];
      const source = value?.sourceText;
      const applies = target === '14' && effectProfile === 'core' && statuses.length > 0 && typeof source === 'string' && activities.length > 0;
      const marker = document?.flags?.fvttJsonGenerator?.conditionLifecycle;
      const effects = document?.effects ?? [];
      const lifecycle = statuses.map(status => sourceConditionLifecycle(source ?? '', status, value?.duration));
      if (applies && lifecycle.some(entry => entry.mode === 'gm') && !effects.some((effect: any) => statuses.includes(readConditionInstance(effect)?.conditionId ?? ''))) {
        const retained = marker?.version === 1 && marker.mode === 'gm'
          && String(marker.sourceText).replace(/\s/gu, '') === source.replace(/\s/gu, '')
          && statuses.every(status => marker.statuses?.includes(status))
          && !effects.some((effect: any) => effect.statuses?.some((status: string) => statuses.includes(status)))
          && String(document.system?.description?.value).includes('GM')
          && String(document.system?.description?.value).replace(/<[^>]*>/gu, '').replace(/\s/gu, '').includes(source.replace(/\s/gu, ''));
        if (retained) outputPaths.push(`documents/${documentIndex}/system/activities/${allActivities.indexOf(activities[0])}`);
        else diagnostics.push(error('GEN_CONDITION_LIFECYCLE_INVALID', 'semantic', mechanic.path, 'Source lifecycle requires the complete GM-only rule with no executable status Effect.'));
      } else if ((document?.effects?.length ?? 0) > 0) {
        if (applies) for (const [index, status] of statuses.entries()) {
          const expected = lifecycle[index]?.duration;
          if (expected && effects.some((effect: any) => effect.statuses?.includes(status) && (effect.duration?.seconds !== (expected.seconds ?? null) || effect.duration?.rounds !== (expected.rounds ?? null) || effect.duration?.turns != null))) {
            diagnostics.push(error('GEN_CONDITION_DURATION_INVALID', 'semantic', mechanic.path, 'Native status duration differs from its complete source interval.'));
          }
        }
        outputPaths.push(`documents/${documentIndex}/effects`);
      }
    }
    if (mechanic.kind === 'uses' && document?.system?.uses) {
      outputPaths.push(`documents/${documentIndex}/system/uses`);
    }
    if (mechanic.kind === 'stage' && document?.flags?.fvttJsonGenerator?.stage) {
      outputPaths.push(`documents/${documentIndex}/flags/fvttJsonGenerator/stage`);
    }
    const mechanicId = (mechanic.value as { id?: string } | undefined)?.id;
    if (
      mechanic.kind === 'resource'
      && mechanicId
      && document?.flags?.fvttJsonGenerator?.resource?.id === mechanicId
    ) {
      outputPaths.push(`documents/${documentIndex}/flags/fvttJsonGenerator/resource`);
    }
    if (mechanic.kind === 'resource-consumption' && mechanicId) {
      for (const [activityIndex, activity] of allActivities.entries()) {
        if (activity?.flags?.fvttJsonGenerator?.resourceConsumption?.id === mechanicId) {
          outputPaths.push(`documents/${documentIndex}/system/activities/${activityIndex}/flags/fvttJsonGenerator/resourceConsumption`);
        }
      }
    }
    if (mechanic.kind === 'resource-transition' && mechanicId) {
      for (const [activityIndex, activity] of allActivities.entries()) {
        if (activity?.flags?.fvttJsonGenerator?.resourceTransition?.id === mechanicId) {
          outputPaths.push(`documents/${documentIndex}/system/activities/${activityIndex}/flags/fvttJsonGenerator/resourceTransition`);
        }
      }
    }
    if (mechanic.kind === 'resource-derived' && mechanicId) {
      for (const [effectIndex, effect] of (document?.effects ?? []).entries()) {
        if (effect?.flags?.fvttJsonGenerator?.resourceTier?.id === mechanicId) {
          outputPaths.push(`documents/${documentIndex}/effects/${effectIndex}/flags/fvttJsonGenerator/resourceTier`);
        }
      }
    }
    if (mechanic.kind.startsWith('behavior-') && mechanicId) {
      for (const [behaviorIndex, projected] of (document?.flags?.fvttJsonGenerator?.behaviorMechanics ?? []).entries()) {
        if (projected?.id === mechanicId) {
          outputPaths.push(`documents/${documentIndex}/flags/fvttJsonGenerator/behaviorMechanics/${behaviorIndex}`);
        }
      }
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
      ...(behavior ? {
        expressionCoverage: behavior.coverage,
        executionMode: behavior.executionMode,
      } : {}),
    };
  }

  if (behavior?.executionMode === 'gm-assisted' || behavior?.executionMode === 'external-rule') {
    diagnostics.push({
      code: behavior.executionMode === 'external-rule'
        ? 'GEN_EXTERNAL_RULE_REVIEW_REQUIRED'
        : 'GEN_GM_ASSISTANCE_REQUIRED',
      severity: 'warning',
      stage: 'semantic',
      path: mechanic.path,
      message: behavior.executionMode === 'external-rule'
        ? 'Mechanic preserves an external rule reference and requires external resolution.'
        : 'Mechanic is structured and operable through explicit GM-assisted steps, not automatic.',
      evidence: mechanic.evidence,
    });
  }

  return {
    mechanicId: mechanic.id,
    kind: mechanic.kind,
    sourcePath: mechanic.path,
    status: 'projected',
    outputPaths,
    ...(behavior ? {
      expressionCoverage: behavior.coverage,
      executionMode: behavior.executionMode,
    } : {}),
  };
}

/**
 * Item mechanics that are easy to make structurally plausible but wrong at
 * runtime get value-level checks here.  These checks deliberately inspect the
 * V14 native active-effect layout instead of accepting any Activity/Effect.
 */
function verifyItemSpecificMechanic(
  mechanic: CanonicalGenerationMechanic,
  document: any,
  diagnostics: GenerationDiagnostic[],
  target: FvttTargetVersion,
  effectProfile: EffectProfile,
): string[] | undefined {
  if (mechanic.kind === 'weapon-properties') {
    return verifyWeaponPropertiesDocument(
      mechanic,
      document,
      diagnostics,
      effectProfile,
      target,
      'documents/0',
    );
  }
  if (mechanic.kind === 'armor') {
    const expected = mechanic.value as { value: number; dex?: number | null; magicalBonus?: number | null; type?: string; baseItem?: string };
    const actual = document?.system?.armor;
    if (!actual || actual.value !== expected.value
      || (actual.dex ?? null) !== (expected.dex ?? null)
      || (actual.magicalBonus ?? null) !== (expected.magicalBonus ?? null)
      || document?.system?.type?.value !== (expected.type ?? 'trinket')
      || document?.system?.type?.baseItem !== (expected.baseItem ?? '')) {
      diagnostics.push(error('GEN_ITEM_ARMOR_MISMATCH', 'semantic', mechanic.path,
        'Armor value, magical bonus or armor identity differs from the source contract.'));
    }
    return ['documents/0/system/armor', 'documents/0/system/type'];
  }
  const activities = Object.entries(document?.system?.activities ?? {}) as Array<[string, any]>;
  const scopedActivities = activitiesForMechanic(mechanic, activities.map(([, activity]) => activity));
  const scopedEntries = scopedActivities.length === activities.length
    ? activities
    : activities.filter(([, activity]) => scopedActivities.includes(activity));

  if (mechanic.kind === 'uses' && mechanic.path === 'item/uses') {
    const expected = mechanic.value as { max?: string | number; spent?: number; recovery?: any[] };
    const actual = document?.system?.uses;
    if (!actual) return [];
    if (
      String(actual.max) !== String(expected.max)
      || actual.spent !== expected.spent
      || JSON.stringify(actual.recovery ?? []) !== JSON.stringify(expected.recovery ?? [])
    ) {
      diagnostics.push(error(
        'GEN_ITEM_USES_MISMATCH',
        'semantic',
        mechanic.path,
        'Item uses max, spent, or recovery does not match the source mechanics contract.',
      ));
    }
    return ['documents/0/system/uses'];
  }

  if (mechanic.kind === 'effect') {
    const expected = mechanic.value as { passiveEffect?: { type?: string; value?: unknown } };
    if (expected.passiveEffect?.type !== 'acBonus') return undefined;
    // `system.changes` is the V14 native Effect shape.  Existing strict Item
    // Markdown still supports V12, whose effect contract is verified by the
    // generic projection check below.
    if (target !== '14') return undefined;
    const expectedValue = Number(expected.passiveEffect.value);
    const effectIndex = (document?.effects ?? []).findIndex((effect: any) =>
      effect?.transfer === true
      && effect?.type === 'base'
      && effect?.changes === undefined
      && Array.isArray(effect?.system?.changes)
      && effect.system.changes.some((change: any) =>
        change?.key === 'system.attributes.ac.bonus'
        && change?.type === 'add'
        && change?.phase === 'initial'
        && Number(change?.value) === expectedValue));
    if (effectIndex < 0) {
      diagnostics.push(error(
        'GEN_ITEM_AC_EFFECT_MISMATCH',
        'semantic',
        mechanic.path,
        `Expected a transfer V14 Active Effect adding ${expectedValue} to system.attributes.ac.bonus.`,
      ));
      return [];
    }
    return [`documents/0/effects/${effectIndex}`];
  }

  if (mechanic.kind === 'light') {
    if (target !== '14') return undefined;
    const expected = mechanic.value as { bright: number; dim: number; activation: string; consumption: number };
    for (const [activityId, activity] of scopedEntries) {
      if (
        activity?.type !== 'utility'
        || activity?.activation?.type !== expected.activation
        || (activity?.consumption?.targets ?? []).length !== 0
      ) continue;
      const referencedEffectId = activity?.effects?.[0]?._id;
      const effectIndex = (document?.effects ?? []).findIndex((effect: any) => effect?._id === referencedEffectId);
      const effect = effectIndex >= 0 ? document.effects[effectIndex] : undefined;
      const changes = effect?.system?.changes;
      const hasBright = Array.isArray(changes) && changes.some((change: any) =>
        change?.key === 'token.light.bright' && change?.type === 'override'
        && change?.phase === 'initial' && Number(change?.value) === expected.bright);
      const hasDim = Array.isArray(changes) && changes.some((change: any) =>
        change?.key === 'token.light.dim' && change?.type === 'override'
        && change?.phase === 'initial' && Number(change?.value) === expected.dim);
      if (effect?.transfer !== false || effect?.changes !== undefined || !hasBright || !hasDim) {
        diagnostics.push(error(
          'GEN_ITEM_LIGHT_EFFECT_MISMATCH',
          'semantic',
          mechanic.path,
          'Light Activity must reference a non-transfer V14 Effect with exact bright/dim Override changes.',
        ));
      }
      return [
        `documents/0/system/activities/${activityId}`,
        `documents/0/effects/${effectIndex}`,
      ];
    }
    diagnostics.push(error(
      'GEN_ITEM_LIGHT_ACTIVITY_MISMATCH',
      'semantic',
      mechanic.path,
      'Light must be an action Utility Activity with zero Item-use consumption.',
    ));
    return [];
  }

  if (mechanic.kind === 'save') {
    const expected = mechanic.value as {
      dc?: number;
      ability?: string;
      outcome?: string;
      damage?: Array<{
        formula: string;
        type: string;
        types?: string[];
        scaling?: { mode: string; number: number; formula?: string };
      }>;
      useAction?: {
        consumption?: number;
        activation?: string;
        consumptionScaling?: { allowed: boolean; max: string };
      };
      activity?: {
        range?: { value: string; units: string };
        duration?: { value: string; units: string; concentration: boolean };
        target?: { affects?: { count: number | string; type: string; special?: string } };
      };
    };
    // Keep the legacy structured-save compatibility path on the generic
    // verifier.  The value-level Item contract below is for the formal
    // item-mechanics save action, which carries an explicit useAction block.
    // Otherwise a planted onSave drift would be reported only as a generic
    // Item mismatch, bypassing the existing GEN_SAVE_OUTCOME_MISMATCH gate.
    if (expected.useAction === undefined && expected.activity === undefined) {
      return undefined;
    }
    for (const [activityId, activity] of scopedEntries) {
      if (activity?.type !== 'save') continue;
      const expectedUse = expected.useAction;
      const expectedScaling = expectedUse?.consumptionScaling ?? { allowed: false, max: '' };
      const expectedConsumption = expectedUse?.consumption ?? 0;
      const actualTarget = (activity?.consumption?.targets ?? []).find((entry: any) => entry?.type === 'itemUses');
      const consumptionMatches = expectedUse === undefined
        || (
          activity?.activation?.type === expectedUse.activation
          && (expectedConsumption > 0
            ? String(actualTarget?.value ?? '') === String(expectedConsumption)
              && (activity?.consumption?.targets ?? []).length === 1
              && actualTarget?.target === ''
            : (activity?.consumption?.targets ?? []).length === 0)
          && (expectedConsumption > 0 ? actualTarget?.scaling?.mode === (expectedScaling.allowed ? 'amount' : '') : true)
          && Boolean(activity?.consumption?.spellSlot) === false
          && Boolean(activity?.consumption?.scaling?.allowed) === expectedScaling.allowed
          && String(activity?.consumption?.scaling?.max ?? '') === String(expectedScaling.max ?? '')
        );
      const actualDc = activity?.save?.dc?.value ?? activity?.save?.dc?.formula;
      const saveMatches = (expected.dc === undefined || Number(actualDc) === expected.dc)
        && (expected.ability === undefined || JSON.stringify(activity?.save?.ability ?? []) === JSON.stringify([expected.ability]))
        && (expected.outcome === undefined || expected.outcome === 'literal' || activity?.damage?.onSave === expected.outcome);
      const damageMatches = (activity?.damage?.parts ?? []).length === (expected.damage ?? []).length
        && (expected.damage ?? []).every((damage, index) =>
        matchesExpectedDamagePart(damage, activity?.damage?.parts?.[index]));
      const rangeMatches = expected.activity?.range === undefined
        || (
          String(activity?.range?.value ?? '') === String(expected.activity.range.value)
          && activity?.range?.units === expected.activity.range.units
        );
      const durationMatches = expected.activity?.duration === undefined
        || (
          String(activity?.duration?.value ?? '') === String(expected.activity.duration.value)
          && activity?.duration?.units === expected.activity.duration.units
          && Boolean(activity?.duration?.concentration) === expected.activity.duration.concentration
        );
      const targetMatches = expected.activity?.target?.affects === undefined
        || (
          String(activity?.target?.affects?.count ?? '') === String(expected.activity.target.affects.count)
          && activity?.target?.affects?.type === expected.activity.target.affects.type
          && (expected.activity.target.affects.special === undefined
            || activity?.target?.affects?.special === expected.activity.target.affects.special)
        );

      if (saveMatches && damageMatches && consumptionMatches && rangeMatches && durationMatches && targetMatches) {
        return [`documents/0/system/activities/${activityId}`];
      }
    }
    diagnostics.push(error(
      'GEN_ITEM_SAVE_ACTIVITY_MISMATCH',
      'semantic',
      mechanic.path,
      'Save Activity must preserve the source DC, save ability, damage/scaling, activation, Item-use cost, range, duration, and target metadata.',
    ));
    return [];
  }

  if (mechanic.kind === 'spell') {
    const expected = mechanic.value as { identifier?: string; name?: string; consumption?: number; activation?: string };
    const hasFormalIdentifier = typeof expected.identifier === 'string' && expected.identifier.trim().length > 0;
    // Only AI Item Intake gives the canonical identifier that activates the
    // V14 fail-closed UUID contract.  Old strict Markdown has no such proof
    // and therefore keeps its pre-existing cast/utility compatibility path.
    if (!hasFormalIdentifier) {
      for (const [activityId, activity] of scopedEntries) {
        const targetUse = (activity?.consumption?.targets ?? []).find((entry: any) => entry?.type === 'itemUses');
        if (
          (activity?.type === 'cast' || activity?.type === 'utility')
          && activity?.activation?.type === expected.activation
          && String(targetUse?.value) === String(expected.consumption)
        ) {
          return [`documents/0/system/activities/${activityId}`];
        }
      }
      diagnostics.push(error(
        'GEN_ITEM_LEGACY_SPELL_ACTIVITY_MISMATCH',
        'semantic',
        mechanic.path,
        'Legacy Item spell text did not project to a compatible cast or utility Activity with the stated Item-use consumption.',
      ));
      return [];
    }
    if (target !== '14') return undefined;
    const resolved = resolveLockedDnd5eV14Spell(
      String(expected.identifier ?? ''),
      String(expected.name ?? ''),
    );
    if (!resolved) {
      diagnostics.push(error(
        'GEN_ITEM_SPELL_UNRESOLVED',
        'semantic',
        mechanic.path,
        `No unique locked dnd5e V14 spell UUID exists for "${String(expected.identifier ?? expected.name ?? '')}".`,
      ));
      return [];
    }
    const expectedUuid = resolved.uuid;
    for (const [activityId, activity] of scopedEntries) {
      const target = (activity?.consumption?.targets ?? []).find((entry: any) => entry?.type === 'itemUses');
      const consumptionMatches = Number(expected.consumption) > 0
        ? String(target?.value) === String(expected.consumption)
        : (activity?.consumption?.targets ?? []).length === 0;
      if (
        activity?.type === 'cast'
        && activity?.spell?.uuid === expectedUuid
        && activity?.activation?.type === expected.activation
        && activity?.consumption?.spellSlot === false
        && consumptionMatches
      ) {
        return [`documents/0/system/activities/${activityId}`];
      }
    }
    diagnostics.push(error(
      'GEN_ITEM_SPELL_ACTIVITY_MISMATCH',
      'semantic',
      mechanic.path,
      'Spell Activity must be cast, use the locked UUID, consume the required Item uses, and not consume spell slots.',
    ));
    return [];
  }

  if (mechanic.kind === 'resource-consumption') {
    const expected = mechanic.value as { consumption?: number; resource?: string };
    for (const [activityId, activity] of scopedEntries) {
      const targets = activity?.consumption?.targets ?? [];
      if (expected.consumption === 0 && targets.length === 0) {
        return [`documents/0/system/activities/${activityId}/consumption/targets`];
      }
      if (targets.some((target: any) => target?.type === 'itemUses' && String(target?.value) === String(expected.consumption))) {
        return [`documents/0/system/activities/${activityId}/consumption/targets`];
      }
    }
    diagnostics.push(error(
      'GEN_ITEM_RESOURCE_CONSUMPTION_MISMATCH',
      'semantic',
      mechanic.path,
      'Activity Item-use consumption does not match the source mechanics contract.',
    ));
    return [];
  }

  return undefined;
}

interface WeaponMechanicValue {
  configuration?: WeaponConfiguration;
  nativeMastery?: string;
  criticalBaseline?: string;
  criticalBaselinesByActivityId?: Record<string, string>;
}

function verifyActorWeaponMechanic(
  mechanic: CanonicalGenerationMechanic,
  documents: any[],
  diagnostics: GenerationDiagnostic[],
  effectProfile: EffectProfile,
  target: FvttTargetVersion,
): string[] {
  const expected = mechanic.value as WeaponMechanicValue | undefined;
  const sourcePrefix = actorWeaponSourcePrefix(mechanic.path);
  const candidates = documents
    .map((item: any, index: number) => ({ item, index }))
    .filter((candidate: { item: any; index: number }) => {
      const sourcePath = candidate.item?.flags?.fvttJsonGenerator?.weaponPropertiesSource?.logicalPath;
      if (typeof sourcePath !== 'string' || !sourcePrefix) return false;
      return sourcePath === sourcePrefix || sourcePath.startsWith(`${sourcePrefix}/`);
    });
  const outputPaths: string[] = [];
  for (const { item, index } of candidates) {
    outputPaths.push(...verifyWeaponPropertiesDocument(
      mechanic,
      item,
      diagnostics,
      effectProfile,
      target,
      `documents/${index}`,
    ));
  }
  return outputPaths;
}

function actorWeaponSourcePrefix(path: string): string | undefined {
  const match = path.match(/^actor\/(structuredActions\/[^/]+\/\d+)\/weapon-properties$/u);
  return match?.[1];
}

function verifyWeaponPropertiesDocument(
  mechanic: CanonicalGenerationMechanic,
  document: any,
  diagnostics: GenerationDiagnostic[],
  effectProfile: EffectProfile,
  target: FvttTargetVersion,
  pathPrefix: string,
): string[] {
  const expected = mechanic.value as WeaponMechanicValue | undefined;
  const expectedConfiguration = expected?.configuration;
  const outputPaths: string[] = [];

  if (document?.type !== 'weapon') {
    diagnostics.push(error(
      'GEN_WEAPON_ITEM_TYPE_MISMATCH',
      'semantic',
      `${pathPrefix}/type`,
      'Weapon mastery/properties configuration must be projected onto a Foundry weapon Item.',
    ));
  }

  if (expected?.nativeMastery && document?.system?.mastery !== expected.nativeMastery) {
    diagnostics.push(error(
      'GEN_WEAPON_NATIVE_MASTERY_MISMATCH',
      'semantic',
      `${pathPrefix}/system/mastery`,
      `Expected source native mastery "${expected.nativeMastery}", received "${String(document?.system?.mastery ?? '')}".`,
    ));
  } else if (expected?.nativeMastery) {
    outputPaths.push(`${pathPrefix}/system/mastery`);
  }

  if (!expectedConfiguration) return outputPaths;
  const parsedExpected = parseWeaponConfiguration(expectedConfiguration);
  if (!parsedExpected) {
    diagnostics.push(error(
      'GEN_WEAPON_CONFIGURATION_INVALID',
      'schema',
      mechanic.path,
      'Canonical weapon configuration is invalid and cannot be projected.',
    ));
    return outputPaths;
  }

  const projectedConfiguration = effectProfile === 'modded-v14'
    ? readWeaponConfiguration(document)
    : parseWeaponConfiguration(document?.flags?.fvttJsonGenerator?.weaponProperties);
  if (!projectedConfiguration) {
    diagnostics.push(error(
      'GEN_WEAPON_CONFIGURATION_MISSING',
      'semantic',
      `${pathPrefix}/flags`,
      effectProfile === 'modded-v14'
        ? `Expected ${WEAPON_PROPERTIES_MODULE_ID}.weapon configuration.`
        : 'Expected source weapon configuration under flags.fvttJsonGenerator.weaponProperties.',
    ));
  } else if (!sameWeaponConfiguration(projectedConfiguration, parsedExpected)) {
    diagnostics.push(error(
      'GEN_WEAPON_CONFIGURATION_MISMATCH',
      'semantic',
      `${pathPrefix}/flags`,
      'Projected weapon configuration differs from the validated source configuration.',
    ));
  } else {
    const flagPath = effectProfile === 'modded-v14'
      ? `${pathPrefix}/flags/${WEAPON_PROPERTIES_MODULE_ID}/weapon`
      : `${pathPrefix}/flags/fvttJsonGenerator/weaponProperties`;
    outputPaths.push(flagPath);
  }

  if (!parsedExpected.enabled) return outputPaths;
  if (target === '14') {
    for (const [activityId, activity] of Object.entries(document?.system?.activities ?? {}) as Array<[string, any]>) {
      if (activity?.type !== 'attack') continue;
      const literalIndex = readLiteralWeaponBaseIndex(activity);
      const nativeBase = activity.damage?.includeBase === true && activity.attack?.flat !== true
        && document.system?.damage?.base;
      if (literalIndex === null && !nativeBase) {
        diagnostics.push(error('GEN_WEAPON_BASE_DAMAGE_UNBOUND', 'semantic',
          `${pathPrefix}/system/activities/${activityId}/damage`,
          'Configured weapons need one native base or a matching literal source-part binding; do not duplicate Item base damage.'));
      }
    }
  }
  const criticalBonus = weaponCriticalBonus(parsedExpected);
  if (criticalBonus) {
    const attacks = Object.entries(document?.system?.activities ?? {}) as Array<[string, any]>;
    const weaponAttacks = attacks.filter(([, activity]) => activity?.type === 'attack');
    if (weaponAttacks.length === 0) {
      diagnostics.push(error(
        'GEN_WEAPON_ACTIVITY_MISSING',
        'semantic',
        `${pathPrefix}/system/activities`,
        'Deadly requires at least one weapon Attack Activity to own its critical bonus.',
      ));
    } else {
      for (const [activityId, activity] of weaponAttacks) {
        const actual = String(activity?.damage?.critical?.bonus ?? '');
        const contribution = activity?.flags?.fvttJsonGenerator?.weaponPropertyContributions?.deadly;
        const baselines = expected?.criticalBaselinesByActivityId;
        const sourceActivityMatches = !baselines || Object.prototype.hasOwnProperty.call(baselines, activityId);
        const baseline = baselines?.[activityId] ?? expected?.criticalBaseline ?? '';
        const expectedTerms = [...diceTerms(baseline), criticalBonus];
        const actualTerms = diceTerms(actual);
        const provenanceMatches = contribution?.ruleId === parsedExpected.rules.find((rule) => rule.kind === 'deadly')?.ruleId
          && contribution?.bonus === criticalBonus;
        if (!sourceActivityMatches || !provenanceMatches || !sameDiceTerms(actualTerms, expectedTerms)) {
          diagnostics.push(error(
            'GEN_WEAPON_CRITICAL_BONUS_MISMATCH',
            'semantic',
            `${pathPrefix}/system/activities/${activityId}/damage/critical/bonus`,
            `Expected source critical bonus plus exactly one owned ${criticalBonus} contribution.`,
          ));
        } else {
          outputPaths.push(`${pathPrefix}/system/activities/${activityId}/damage/critical/bonus`);
        }
      }
    }
  }

  if (effectProfile === 'core') {
    for (const rule of parsedExpected.rules) {
      if (rule.kind !== 'fatal' && rule.kind !== 'criticalBleeding') continue;
      diagnostics.push({
        code: 'GEN_WEAPON_RULE_REVIEW_REQUIRED',
        severity: 'warning',
        stage: 'semantic',
        path: mechanic.path,
        message: `${rule.label} requires ${WEAPON_PROPERTIES_MODULE_ID}; core output preserves its semantics for GM review.`,
        evidence: mechanic.evidence,
      });
    }
  }

  return outputPaths;
}

function sameWeaponConfiguration(left: WeaponConfiguration, right: WeaponConfiguration): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diceTerms(formula: string): string[] {
  return formula
    .split(/\s*\+\s*/u)
    .map((term) => term.trim())
    .filter(Boolean);
}

function sameDiceTerms(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  const counts = (terms: string[]) => terms.reduce<Record<string, number>>((result, term) => {
    result[term] = (result[term] ?? 0) + 1;
    return result;
  }, {});
  const stable = (value: Record<string, number>) => Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
  return JSON.stringify(stable(counts(actual))) === JSON.stringify(stable(counts(expected)));
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

type StructuredUsesPeriod = 'day' | 'longRest' | 'shortRest' | 'dawn';

interface StructuredUsesValue {
  max: number;
  period: StructuredUsesPeriod;
}

function readStructuredUses(value: unknown): StructuredUsesValue | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (!Number.isSafeInteger(record.max) || typeof record.period !== 'string') return undefined;
  if (!['day', 'longRest', 'shortRest', 'dawn'].includes(record.period)) return undefined;
  return { max: record.max as number, period: record.period as StructuredUsesPeriod };
}

function mapStructuredUsesPeriod(period: StructuredUsesPeriod): string {
  return {
    day: 'day',
    longRest: 'lr',
    shortRest: 'sr',
    dawn: 'dawn',
  }[period];
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

function verifyV14DynamicWeaponDamage(
  mechanic: CanonicalGenerationMechanic,
  activity: any,
  document: any,
  diagnostics: GenerationDiagnostic[],
): void {
  if (activity?.attack?.type?.classification !== 'weapon' || activity.attack.flat !== false) {
    return;
  }

  const hasDynamicDamage = document?.type === 'weapon'
    ? Boolean(document?.system?.damage?.base)
    : isDynamicDamagePart(activity?.damage?.parts?.[0]);
  if (hasDynamicDamage) return;

  diagnostics.push(error(
    'GEN_V14_DYNAMIC_WEAPON_DAMAGE_MISSING',
    'semantic',
    `${mechanic.path}/damage`,
    'A non-flat V14 weapon attack must project its ability-based damage through a weapon base or @mod damage part.',
  ));
}

function isDynamicDamagePart(part: any): boolean {
  if (part?.bonus === '@mod') return true;
  return part?.custom?.enabled === true && /(^|[^\w])@mod([^\w]|$)/u.test(String(part.custom.formula ?? ''));
}

function matchesExpectedDamagePart(expected: {
  formula: string;
  type: string;
  types?: string[];
  scaling?: { mode: string; number: number; formula?: string };
}, actual: any): boolean {
  const formula = String(expected.formula).replace(/\s+/g, '');
  const match = formula.match(/^(\d+)d(\d+)(?:([+-]\d+))?$/i);
  if (!match) return false;
  const expectedTypes = (expected.types?.length ? expected.types : [expected.type])
    .map((type) => normalizeVerificationDamageType(type));
  const actualTypes = Array.isArray(actual?.types) ? actual.types : [];
  const typeMatches = new Set(actualTypes).size === new Set(expectedTypes).size
    && expectedTypes.every((type) => actualTypes.includes(type));
  const scalingMatches = expected.scaling === undefined
    || (
      actual?.scaling?.mode === expected.scaling.mode
      && Number(actual?.scaling?.number) === expected.scaling.number
      && (expected.scaling.formula === undefined || String(actual?.scaling?.formula ?? '') === expected.scaling.formula)
    );
  const formulaMatches = actual?.custom?.enabled === true
    ? String(actual.custom.formula ?? '').replace(/\s+/g, '') === formula
    : Number(actual?.number) === Number(match[1])
      && Number(actual?.denomination) === Number(match[2])
      && String(actual?.bonus ?? '') === String(match[3] ?? '').replace(/^\+/, '');
  return formulaMatches && typeMatches && scalingMatches;
}

function normalizeVerificationDamageType(type: string): string {
  const normalized = type.trim().toLowerCase();
  const map: Record<string, string> = {
    光耀: 'radiant',
    radiant: 'radiant',
    火焰: 'fire',
    fire: 'fire',
    寒冷: 'cold',
    cold: 'cold',
    闪电: 'lightning',
    lightning: 'lightning',
    力场: 'force',
    force: 'force',
    暗蚀: 'necrotic',
    necrotic: 'necrotic',
  };
  return map[normalized] ?? normalized;
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
