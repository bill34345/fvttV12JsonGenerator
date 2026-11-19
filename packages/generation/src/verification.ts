import { itemCastScalingMax, nativeItemPassiveChange } from './activity';
import type { ActionData } from '@fvtt-json-generator/models/action';
import type { ParsedSpell } from '@fvtt-json-generator/models/spell';
import { generateSpellDocument } from './spell';
import { ENCHANTED_WEAPON_RARITY, type ItemEnchantmentData, type ItemSpellStorageData, type ParsedItem } from '@fvtt-json-generator/models/item';
import type { EffectProfile } from './effectProfileApplier';
import { DND5E_V14_SYSTEM_VERSION } from '@fvtt-json-generator/contracts/target';
import { isVersionInMajor } from '@fvtt-json-generator/contracts/version-admission';
import { resolveLockedDnd5eV14Spell, resolveLockedDnd5eV14SpellByName } from './v14SpellCatalog';
import { resolveStandardSpellScroll } from './item-spell-scroll';
import { enchantmentTargets } from './item-enchantment';
import { resolveStoredItemSpells } from './item-spell-storage';
import { TIMED_SPEED_MOVEMENTS } from './item-timed-speed';
import { RANDOM_SUMMON_EXPIRY } from './item-summon';
import { getFoundryTarget, type FvttTargetVersion, type FoundryTarget } from './target';
import { isFoundryHtmlDescription } from './item-description';
import { sourceConditionLifecycle, extractExplicitlyInflictedStatuses, simpleConditionDuration, officialCondition,inferredAppliedConditions,operationConditionSource,officialConditionStatuses } from './actor-effects';
import { readConditionInstance } from '@fvtt-json-generator/contracts/conditions';
import {RESOLVER_MODULE_ID,validateActorSpellManifestStructure,hashManifest} from '@fvtt-json-generator/spell-manifest-contracts';
import {hasSourceCandidateFindings} from '@fvtt-json-generator/models/source-operations';
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
  runtimeTarget?: FoundryTarget;
}

export function verifyGeneratedDocument(
  options: VerifyGeneratedDocumentOptions,
): GenerationVerification {
  const diagnostics: GenerationDiagnostic[] = [];
  const runtimeTarget = options.runtimeTarget;
  if (runtimeTarget && (options.target !== '14' || runtimeTarget.fvttVersion !== '14'
    || !isVersionInMajor(runtimeTarget.stats.coreVersion, '14.369') || runtimeTarget.stats.systemId !== 'dnd5e'
    || runtimeTarget.stats.systemVersion !== DND5E_V14_SYSTEM_VERSION || runtimeTarget.dnd5eVersion !== DND5E_V14_SYSTEM_VERSION))
    throw new Error('Unsupported verifier runtime target.');
  if(options.canonical.kind==='actor'&&(hasSourceCandidateFindings(options.canonical.candidateReview)||hasSourceCandidateFindings(options.output?.flags?.fvttJsonGenerator?.candidateReview))){
    diagnostics.push({code:'GEN_SOURCE_CANDIDATE_REVIEW_REQUIRED',severity:'warning',stage:'semantic',path:'actor/candidateReview',
      message:'The complete Actor retains unresolved source findings for user review; candidate delivery does not accept those findings.'});
  }
  if(options.canonical.kind==='actor'){
    const parsed=options.canonical.compatibilitySource;
    for(const [section,actions]of Object.entries(parsed.structuredActions??{}))for(const [index,action]of(actions??[]).entries()){
      if(hasSourceCandidateFindings(action.candidateReview))diagnostics.push({code:'GEN_SOURCE_CANDIDATE_REVIEW_REQUIRED',severity:'warning',stage:'semantic',
        path:`actor/structuredActions/${section}/${index}`,message:'This action has unresolved source findings; see the Forge review panel.'});
    }
  }
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
    for (const pending of document?.flags?.fvttJsonGenerator?.pendingSpells ?? []) diagnostics.push({
      code: 'GEN_V14_SPELLCAST_PENDING', severity: 'warning', stage: 'semantic', path: `items/${documentIndex}/spellcasting`,
      message: `${pending.name}: ${pending.reason}`,
    });
    const candidate=document?.flags?.fvttJsonGenerator?.candidateReview;
    if(hasSourceCandidateFindings(candidate))diagnostics.push({code:'GEN_SOURCE_CANDIDATE_REVIEW_REQUIRED',severity:'warning',stage:'semantic',
      path:`items/${documentIndex}/candidateReview`,message:'This source and model proposal is available for GM review; its retained semantic findings have not been accepted.'});
    verifyIdsAndLinks(document, documentIndex, diagnostics);
    // schema-derived: dnd5e 6.0.6 UsesField leaves its FormulaField max optional.
    verifyDnd5eDocumentSchema(document, documentIndex, diagnostics, options.target, options.target === '14');
    if (options.target === '14' && options.canonical.kind === 'item') {
      const { equipmentSubtype, consumableSubtype, armor, type, weapon, attunement, structuredActions } = options.canonical.compatibilitySource;
      if (structuredActions?.effects?.some((action) => action.passiveEffect && nativeItemPassiveChange(action.passiveEffect))
        && (document?.system?.equipped !== false || (attunement && document?.system?.attunement !== attunement))) {
        diagnostics.push(error('GEN_ITEM_PASSIVE_GATING_MISMATCH', 'semantic', `documents/${documentIndex}/system`,
          'Passive Item Effects require the native equipped and source attunement state.'));
      }
      const expectedSubtype = equipmentSubtype ?? consumableSubtype ?? armor?.type
        ?? (type === 'staff' && !weapon ? 'simpleM' : undefined);
      const expectedBase = armor?.baseItem ?? (type === 'staff' ? weapon?.baseItem ?? 'quarterstaff' : undefined);
      if ((expectedSubtype && document.system?.type?.value !== expectedSubtype)
        || (expectedBase && document.system?.type?.baseItem !== expectedBase)) {
        diagnostics.push(error('GEN_ITEM_SUBTYPE_MISMATCH', 'semantic', `documents/${documentIndex}/system/type`,
          `Source Item subtype "${expectedSubtype ?? expectedBase}" was not preserved.`));
      }
    }
  }
  if (options.canonical.kind === 'actor') {
    if (options.target === '14') verifyDnd6ActorSchema(options.output, diagnostics);
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

  // The ledger-only linkage belongs to V14; older targets retain their
  // original manual trait and have no such projected mechanic to verify.
  const mechanicsCoverage = options.canonical.mechanics.filter(mechanic=>options.target==='14'
    ||!(mechanic.kind==='uses'&&(mechanic.value as {nativeResistanceLedgerOnly?:boolean})?.nativeResistanceLedgerOnly)).map((mechanic) =>
    verifyMechanicCoverage(mechanic, documents, diagnostics, options.target, options.effectProfile,options.canonical.kind==='actor'?options.output:undefined));

  verifyTargetMetadata(options.output, options.target, diagnostics, runtimeTarget);

  const hasError = diagnostics.some((entry) => entry.severity === 'error');
  const needsReview = diagnostics.some((entry) => entry.severity === 'warning');
  return {
    status: hasError ? 'failed' : needsReview ? 'needs_review' : 'accepted',
    diagnostics,
    target: runtimeTarget ?? getFoundryTarget(options.target),
    mechanicsCoverage,
  };
}

export function verifyGeneratedSpell(spell: ParsedSpell, output: any, { saved = false } = {}): GenerationVerification {
  const diagnostics: GenerationDiagnostic[] = [];
  verifyIdsAndLinks(output, 0, diagnostics);
  verifyDnd5eDocumentSchema(output, 0, diagnostics, '14', true);
  // The receiving world stamps its own runtime version on saved Documents.
  const { _stats, ...spellFields } = generateSpellDocument(spell);
  compareSpellFields(saved ? spellFields : { ...spellFields, _stats }, output, 'spell', diagnostics);

  if (Object.keys(output?.system?.activities ?? {}).length !== 1) diagnostics.push(error(
    'GEN_SPELL_ACTIVITY_COUNT', 'schema', 'system/activities', '需要保留唯一的来源施法活动。',
  ));
  for (const path of findModuleAutomationPaths(output)) diagnostics.push(error(
    'GEN_CORE_PROFILE_MODULE_LEAK', 'semantic', path, '法术包含 Core 以外的模块自动化。',
  ));
  if (spell.gm) diagnostics.push({
    code: 'GEN_SPELL_GM_REVIEW', severity: 'warning', stage: 'semantic', path: 'spell/gm', message: spell.gm,
  });
  return {
    status: diagnostics.some(entry => entry.severity === 'error') ? 'failed' : spell.gm ? 'needs_review' : 'accepted',
    diagnostics,
    target: getFoundryTarget('14'),
    mechanicsCoverage: [],
  };
}

function compareSpellFields(expected: unknown, actual: any, path: string, diagnostics: GenerationDiagnostic[]): void {
  if (Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length) {
    if (/\/(?:properties|types|ability)$/u.test(path) && expected.every(entry => actual.includes(entry))) return;
    expected.forEach((entry, index) => compareSpellFields(entry, actual[index], path + '/' + index, diagnostics));
    return;
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && actual && typeof actual === 'object') {
    for (const [key, value] of Object.entries(expected)) compareSpellFields(value, actual[key], path + '/' + key, diagnostics);
    return;
  }
  if (expected !== actual) diagnostics.push(error(
    'GEN_SPELL_FIELD_MISMATCH', 'semantic', path, '法术输出与来源投影不一致。',
  ));
}

function verifyDnd6ActorSchema(actor: any, diagnostics: GenerationDiagnostic[]): void {
  const attributes = actor?.system?.attributes ?? {};
  const legacy: Array<[string, boolean]> = [
    ['system/attributes/ac', ['calc', 'formula'].some(key => Object.hasOwn(attributes.ac ?? {}, key))],
    ['system/attributes/movement', ['walk', 'fly', 'swim', 'climb', 'burrow'].some(key => Object.hasOwn(attributes.movement ?? {}, key))],
    ['system/attributes/init/bonus', Object.hasOwn(attributes.init ?? {}, 'bonus')],
    ['system/details/spellLevel', Object.hasOwn(actor?.system?.details ?? {}, 'spellLevel')],
  ];
  for (const key of Object.keys(actor?.system?.bonuses ?? {})) {
    if (key !== 'spell') legacy.push([`system/bonuses/${key}`, true]);
  }
  for (const key of Object.keys(actor?.system?.bonuses?.spell ?? {})) {
    if (key !== 'dc') legacy.push([`system/bonuses/spell/${key}`, true]);
  }
  for (const [key, ability] of Object.entries<any>(actor?.system?.abilities ?? {})) {
    legacy.push([`system/abilities/${key}/bonuses`, Object.hasOwn(ability, 'bonuses')]);
  }
  for (const [key, skill] of Object.entries<any>(actor?.system?.skills ?? {})) {
    legacy.push([`system/skills/${key}/bonuses/check`, Object.hasOwn(skill.bonuses ?? {}, 'check')]);
  }
  for (const [path, present] of legacy) if (present) diagnostics.push(error(
    'GEN_DND6_LEGACY_ACTOR_FIELD', 'schema', path, `The v14 target requires native dnd5e 6 Actor fields; legacy field ${path.replaceAll('/', '.')}.`,
  ));
}

function verifyDnd5eDocumentSchema(
  document: any,
  documentIndex: number,
  diagnostics: GenerationDiagnostic[],
  target: FvttTargetVersion,
  allowOmittedUsesMax: boolean,
): void {
  if (document?.type !== 'spell' && document?.system?.activation !== undefined) {
    diagnostics.push(error(
      'GEN_LEGACY_ITEM_ACTIVATION_PRESENT',
      'schema',
      `documents/${documentIndex}/system/activation`,
      'Item-level activation is legacy; activation must be owned by Activities.',
    ));
  }
  verifyUses(document?.system?.uses, `documents/${documentIndex}/system/uses`, diagnostics, allowOmittedUsesMax);

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
      allowOmittedUsesMax,
    );
  }
}

function verifyUses(
  uses: any,
  path: string,
  diagnostics: GenerationDiagnostic[],
  allowOmittedMax: boolean,
): void {
  if (uses === undefined || uses === null) return;
  if (
    typeof uses !== 'object'
    || typeof uses.spent !== 'number'
    || (typeof uses.max !== 'string' && typeof uses.max !== 'number'
      && !(allowOmittedMax && !Object.hasOwn(uses, 'max')))
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
  const stages=conditionStagePlans(document),coveredStages=new Set<ConditionStagePlan>();
  for (const [index, activity] of activities.entries()) {
    if(activity?.flags?.fvttJsonGenerator?.sourceConditionStage!==undefined){
      const stage=validConditionStage(activity,document,stages);
      if(stage&&!coveredStages.has(stage))coveredStages.add(stage);
      else diagnostics.push(error('GEN_CONDITION_STAGE_INVALID','semantic',`documents/${documentIndex}/system/activities/${index}`,'A condition stage must retain its own source-qualified GM template and have no rolls, automatic effects or resource consumption.'));
    }
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
  if(stages.some(stage=>!coveredStages.has(stage)))diagnostics.push(error('GEN_CONDITION_STAGE_INVALID','semantic',`documents/${documentIndex}/system/activities`,'A source-qualified condition stage or its complete template is missing.'));
}

function verifyMechanicCoverage(
  mechanic: CanonicalGenerationMechanic,
  documents: any[],
  diagnostics: GenerationDiagnostic[],
  target: FvttTargetVersion,
  effectProfile: EffectProfile,
  actor?:any,
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
    const scopedActivities = activitiesForMechanic(mechanic, allActivities);
    const activities = mechanic.kind==='effect'?scopedActivities:scopedActivities.filter(activity=>!validConditionStage(activity,document));
    const structuredUses = mechanic.kind === 'uses' ? readStructuredUses(mechanic.value) : undefined;
    if (mechanic.kind === 'uses' && mechanic.path.startsWith('actor/') && structuredUses) {
      const uses = document?.system?.uses;
      const primary = activities[0];
      const costs = primary?.consumption?.targets ?? [];
      const expectedPeriod = mapStructuredUsesPeriod(structuredUses.period);
      const value=mechanic.value as {executionMode?:string;sourceText?:string;spellcastingFeatureKey?:string;actorResource?:string};
      if(target==='14'&&value.actorResource==='legres'){
        const resource=actor?.system?.resources?.legres;
        if(structuredUses.period==='day'&&resource?.max===structuredUses.max&&resource.spent===0&&!Object.hasOwn(resource,'value')
          &&document?.system?.identifier==='legendary-resistance'&&uses?.max===''&&uses.spent===0&&uses.recovery?.length===0
          &&activities.length===1&&primary?.type==='utility'&&!primary.damage&&!primary.attack&&!primary.save
          &&!(document.effects??[]).length&&!(primary.effects??[]).length
          &&primary.consumption?.spellSlot===false&&costs.length===1&&costs[0]?.type==='attribute'
          &&costs[0]?.target==='resources.legres.value'&&String(costs[0]?.value)==='1'){
          outputPaths.push('actor/system/resources/legres',`documents/${documentIndex}/system/activities/0/consumption/targets`);
        }
        continue;
      }
      const marker=document?.flags?.fvttJsonGenerator?.manualRule;
      const manual=value.executionMode==='gm-manual'&&marker?.version===1&&marker.mode==='gm-manual'
        &&typeof marker.logicalPath==='string'&&marker.logicalPath.startsWith(mechanic.path.replace(/^actor\//u,'').replace(/\/uses$/u,'/'))
        &&marker.sourceText===value.sourceText&&activities.length===1&&primary?.type==='utility'
        &&!primary.damage&&!primary.attack&&!primary.save
        &&(primary.effects??[]).every((link:any)=>(document.effects??[]).some((effect:any)=>effect._id===link._id&&effect.flags?.fvttJsonGenerator?.conditionLifecycle?.mode==='gm'))
        &&(document.effects??[]).every((effect:any)=>effect.flags?.fvttJsonGenerator?.conditionLifecycle?.mode==='gm')&&costs.length===0;
      if (String(uses?.max) === String(structuredUses.max)
        && uses?.recovery?.length === 1
        && uses.recovery[0]?.period === expectedPeriod
        && uses.recovery[0]?.type === 'recoverAll'
        && (manual || pendingSpellParentUses(actor,document,value.spellcastingFeatureKey,structuredUses)
        || primary?.consumption?.spellSlot === false
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
      if(!activities.length)continue;
      const value=mechanic.value as {type?:string;statuses?:string[];duration?:string;sourceText?:string;condition?:string;escapeDc?:number;staged?:boolean;exhaustionLevels?:number}|undefined;
      const statuses=value?.statuses??(value?.type?extractExplicitlyInflictedStatuses(`The target is ${value.type}.`,true):[]),effects=document?.effects??[];
      if(target==='14'&&statuses.length&&statuses.every(officialCondition)){
        const displayed=String(document?.system?.description?.value??'').replace(/<[^>]*>/gu,' ').replace(/&quot;/gu,'"').replace(/&#39;/gu,"'").replace(/&lt;/gu,'<').replace(/&gt;/gu,'>').replace(/&amp;/gu,'&').replace(/\s+/gu,'');
        let valid=!value?.sourceText||displayed.includes(value.sourceText.replace(/\s+/gu,''));
        for(const status of statuses){
          const matching=effects.filter((effect:any)=>effect.statuses?.includes(status)&&['condition','duration','escapeDc','staged',...(status==='exhaustion'?['exhaustionLevels']:[])].every(key=>(value as any)?.[key]===undefined||effect.flags?.fvttJsonGenerator?.conditionLifecycle?.[key]===(value as any)[key])),expected=simpleConditionDuration(value?.duration)??sourceConditionLifecycle(value?.sourceText??'',status,value?.duration).duration;
          const manual=!!value?.condition||value?.escapeDc!==undefined||value?.staged===true||status==='exhaustion'||sourceConditionLifecycle(value?.sourceText??'',status,value?.duration).mode==='gm';
          if(!matching.length)valid=false;
          for(const effect of matching){
            const lifecycle=effect.flags?.fvttJsonGenerator?.conditionLifecycle;
            const links=activities.flatMap(activity=>(activity.effects??[]).filter((link:any)=>link._id===effect._id).map((link:any)=>({activity,link})));
            if(lifecycle?.version!==1||effect.transfer!==false||effect.disabled===true||!links.length||links.some(({activity,link})=>activity.flags?.fvttJsonGenerator?.sourceOperation?.role==='attack-roll'&&!gmHitRollTemplateValid(activity,effect,allActivities)||(activity.type==='save'?link.onSave!==false:link.onSave!==undefined)))valid=false;
            if(value?.sourceText&&lifecycle?.sourceText!==value.sourceText)valid=false;
            if(manual&&lifecycle?.mode!=='gm'||value?.condition&&!String(effect.description).includes(value.condition)||value?.escapeDc!==undefined&&lifecycle?.escapeDc!==value.escapeDc||value?.staged===true&&lifecycle?.staged!==true||status==='exhaustion'&&value?.exhaustionLevels!==undefined&&lifecycle?.exhaustionLevels!==value.exhaustionLevels)valid=false;
            if(expected&&(target==='14'
              ? effect.duration?.value!==(expected.seconds??expected.rounds)||effect.duration?.units!==(expected.seconds!==undefined?'seconds':'rounds')
              : effect.duration?.seconds!==(expected.seconds??null)||effect.duration?.rounds!==(expected.rounds??null)))diagnostics.push(error('GEN_CONDITION_DURATION_INVALID','semantic',mechanic.path,'The optional template must preserve its explicit numeric duration.'));
          }
        }
        if(valid)outputPaths.push(`documents/${documentIndex}/effects`);
        else diagnostics.push(error('GEN_CONDITION_LIFECYCLE_INVALID','semantic',mechanic.path,'Official states require available templates, exact qualifiers and links to their own hit or failed-save activity.'));
      }else if(effects.length)outputPaths.push(`documents/${documentIndex}/effects`);
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
  if (mechanic.kind === 'item-last-charge-check') {
    const expected = mechanic.value as NonNullable<ParsedItem['lastChargeCheck']>;
    const actual = document?.flags?.fvttJsonGenerator?.lastChargeCheck;
    const system = document?.system;
    if (actual?.formula === expected.formula && actual?.destroyOn === expected.destroyOn
      && Number(system?.uses?.max) > 0 && !system?.uses?.autoDestroy
      && system?.description?.value?.includes(`[[/r ${expected.formula}]]`)) {
      return ['documents/0/flags/fvttJsonGenerator/lastChargeCheck', 'documents/0/system/description/value', 'documents/0/system/uses'];
    }
    diagnostics.push(error('GEN_ITEM_LAST_CHARGE_CHECK_MISMATCH', 'semantic', mechanic.path,
      'The final-charge rule requires its source die and destruction result, a clickable roll, and no unconditional destruction.'));
    return [];
  }
  if (mechanic.kind === 'item-random-summon') {
    const summon = mechanic.value as NonNullable<ParsedItem['randomSummon']>;
    const system = document?.system;
    const entries = Object.entries<any>(system?.activities ?? {});
    const [id, activity] = entries[0] ?? [];
    const flags = document?.flags?.fvttJsonGenerator?.randomSummon;
    const consume = activity?.consumption;
    const recovery = system?.uses?.recovery;
    if (target === '14' && entries.length === 1 && activity?.type === 'summon'
      && activity.profiles?.length === summon.profiles.length && summon.profiles.every((profile, index) => {
        const actual = activity.profiles[index];
        return actual?.uuid === profile.actorUuid && actual.name === `${index + 1}. ${profile.actorName}` && String(actual.count) === '1';
      })
      && activity.summon?.mode === '' && activity.summon?.prompt === true && activity.match?.disposition === summon.friendly
      && activity.activation?.type === 'action' && activity.activation?.value === 1 && activity.activation?.condition === '魔法动作 Magic Action'
      && String(activity.range?.value) === String(summon.rangeFeet) && activity.range?.units === 'ft'
      && activity.target?.affects?.type === 'space' && activity.target?.affects?.count === '1'
      && activity.duration?.units === 'spec' && activity.duration?.special === RANDOM_SUMMON_EXPIRY && activity.duration?.concentration === false
      && consume?.spellSlot === false && consume.scaling?.allowed === false && consume.targets?.length === 1
      && consume.targets[0].type === 'itemUses' && String(consume.targets[0].value) === '1'
      && String(system.uses?.max) === String(summon.usesPerDawn) && system.uses?.spent === 0 && !system.uses?.autoDestroy
      && recovery?.length === 1 && recovery[0].period === 'dawn' && recovery[0].type === 'recoverAll'
      && flags?.tableUuid === summon.tableUuid && flags?.formula === summon.formula
      && system.description?.value?.replace(/[ \t]+rollable\]/giu, ' rollable]').includes(`@Embed[${summon.tableUuid} rollable]`)) {
      return [`documents/0/system/activities/${id}`, 'documents/0/system/uses', 'documents/0/flags/fvttJsonGenerator/randomSummon', 'documents/0/system/description/value'];
    }
    diagnostics.push(error('GEN_ITEM_RANDOM_SUMMON_MISMATCH', 'semantic', mechanic.path,
      'Table-based Summon must preserve each numbered Actor link, the rollable table, range, expiry and dawn recovery.'));
    return [];
  }
  if (mechanic.kind === 'item-summon') {
    const summon = mechanic.value as NonNullable<ParsedItem['summon']>;
    const system = document?.system;
    const entries = Object.entries<any>(system?.activities ?? {});
    const [id, activity] = entries[0] ?? [];
    const profile = activity?.profiles?.[0];
    const consume = activity?.consumption;
    if (target === '14' && entries.length === 1 && activity?.type === 'summon'
      && activity.profiles?.length === 1 && profile?.uuid === summon.actorUuid && profile.name === summon.actorName && String(profile.count) === '1'
      && activity.summon?.mode === '' && activity.summon?.prompt === true
      && activity.activation?.type === 'action' && activity.activation?.value === 1 && activity.activation.condition === '魔法动作 Magic Action'
      && String(activity.range?.value) === String(summon.rangeFeet) && activity.range?.units === 'ft'
      && activity.target?.affects?.type === 'space' && activity.target.affects.special === 'unoccupied space'
      && String(activity.duration?.value) === String(summon.durationHours) && activity.duration?.units === 'hour' && activity.duration.concentration === false
      && consume?.spellSlot === false && consume.targets?.length === 1 && consume.targets[0].type === 'itemUses' && String(consume.targets[0].value) === '1'
      && String(system.uses?.max) === '1' && system.uses.spent === 0 && system.uses.recovery?.length === 0
      && document.flags?.fvttJsonGenerator?.summonCooldown?.days === summon.cooldownDays) {
      return [`documents/0/system/activities/${id}`, 'documents/0/system/uses', 'documents/0/flags/fvttJsonGenerator/summonCooldown'];
    }
    diagnostics.push(error('GEN_ITEM_SUMMON_MISMATCH', 'semantic', mechanic.path,
      'Summon must retain the exact fixed Actor, placement, duration and single use with reversion-based cooldown.'));
    return [];
  }
  if (mechanic.kind === 'item-timed-speed') {
    const seconds = (mechanic.value as { seconds: number }).seconds;
    const activityId = target === '14' ? verifiedTimedSpeedActivity(document, seconds) : undefined;
    if (activityId) return ['documents/0/system/uses', `documents/0/system/activities/${activityId}`,
      'documents/0/effects', 'documents/0/flags/dnd5e/riders/effect', 'documents/0/flags/fvttJsonGenerator/timedSpeed'];
    diagnostics.push(error('GEN_ITEM_TIMED_SPEED_MISMATCH', 'semantic', mechanic.path,
      'Timed speed requires a bonus-action self toggle, linked speed effect, separate cumulative seconds and long-rest recovery.'));
    return [];
  }
  if (mechanic.kind === 'item-spell-storage') {
    const storage = mechanic.value as ItemSpellStorageData;
    const entries = target === '14' ? verifyStoredItemSpells(document, storage) : undefined;
    if (entries) return [
      'documents/0/flags/fvttJsonGenerator/spellStorage',
      ...entries.map(id => `documents/0/system/activities/${id}`),
    ];
    diagnostics.push(error('GEN_ITEM_SPELL_STORAGE_MISMATCH', 'semantic', mechanic.path,
      'Spell storage must preserve the five-level capacity, source inventory, original caster statistics and separate single uses.'));
    return [];
  }
  if (mechanic.kind === 'item-enchantment') {
    const expected = mechanic.value as ItemEnchantmentData;
    const result = target === '14' ? verifyItemEnchantment(document, expected) : { issue: 'Native Enchant requires V14.' };
    if ('activityId' in result) return [
      `documents/0/system/activities/${result.activityId}`, 'documents/0/effects',
      ...(expected.kind === 'enchant-armor-resistance' ? ['documents/0/flags/dnd5e/riders/effect'] : []),
    ];
    diagnostics.push(error('GEN_ITEM_ENCHANTMENT_MISMATCH', 'semantic', mechanic.path, result.issue));
    return [];
  }
  if (mechanic.kind === 'item-spell-scroll') {
    const expected = resolveStandardSpellScroll(mechanic.value as NonNullable<ParsedItem['spellScroll']>);
    const system = document?.system;
    const levels = document?.flags?.dnd5e?.spellLevel;
    const entries = Object.entries<any>(system?.activities ?? {});
    const [id, activity] = entries[0] ?? [];
    const targets = activity?.consumption?.targets ?? [];
    const uses = system?.uses;
    const validCast = expected.spell ? entries.length === 1 && activity?.type === 'cast'
      && activity.spell?.uuid === expected.spell.uuid && activity.spell.level === expected.level
      && activity.spell.challenge?.override === true && String(activity.spell.challenge.attack) === String(expected.attack)
      && String(activity.spell.challenge.save) === String(expected.dc)
      && ['vocal', 'somatic', 'material'].every(property => activity.spell.properties?.includes(property))
      && activity.activation?.override === false && activity.consumption?.spellSlot === false
      && activity.consumption?.scaling?.allowed !== true && targets.length === 1
      && targets[0].type === 'itemUses' && String(targets[0].value) === '1'
      : entries.length === 0;
    if (target === '14' && document?.type === 'consumable' && system?.type?.value === 'scroll'
      && system.properties?.includes('mgc') && !system.attunement && uses?.autoDestroy === true
      && String(uses.max) === '1' && uses.spent === 0 && uses.recovery?.length === 0 && validCast
      && levels?.base === expected.level && levels.value === expected.level) {
      return ['documents/0/system/uses', 'documents/0/flags/dnd5e/spellLevel', ...(id ? [`documents/0/system/activities/${id}`] : [])];
    }
    diagnostics.push(error('GEN_ITEM_SPELL_SCROLL_MISMATCH', 'semantic', mechanic.path,
      'A standard scroll must keep its level, bound spell, fixed challenge and one-use lifecycle.'));
    return [];
  }
  if (mechanic.kind === 'item-container') {
    const expected = mechanic.value as NonNullable<ParsedItem['container']>;
    const system = document?.system;
    const sameMeasure = (left: unknown, right: NonNullable<ParsedItem['container']>['weight'] | NonNullable<ParsedItem['container']>['volume']) => {
      const field = left as { value?: unknown; units?: unknown } | undefined;
      return right ? field?.value === right.value && field.units === right.units : field?.value == null;
    };
    if (target === '14' && document?.type === 'container' && system?.capacity
      && (system.capacity.count ?? null) === (expected.count ?? null)
      && sameMeasure(system.capacity.weight, expected.weight)
      && sameMeasure(system.capacity.volume, expected.volume)
      && (!expected.itemWeight || sameMeasure(system.weight, expected.itemWeight))
      && Boolean(system.properties?.includes('weightlessContents')) === expected.weightlessContents
      && !Object.keys(system.activities ?? {}).length && !system.uses?.max) {
      return ['documents/0/system/capacity', 'documents/0/system/properties', ...(expected.itemWeight ? ['documents/0/system/weight'] : [])];
    }
    diagnostics.push(error('GEN_ITEM_CONTAINER_MISMATCH', 'semantic', mechanic.path,
      'Container limits, own weight, and weightless contents must match the source.'));
    return [];
  }
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
  if (mechanic.kind === 'item-weapon-bonus') {
    const expected = mechanic.value as {
      bonus: number;
      weapon: NonNullable<ParsedItem['weapon']>;
      damage: NonNullable<ParsedItem['damage']>;
      properties: string[];
    };
    const system = document?.system;
    const valid = document?.type === 'weapon' && system?.type?.value === expected.weapon.value
      && system.type.baseItem === expected.weapon.baseItem && system.magicalBonus === String(expected.bonus)
      && system.properties?.includes('mgc') && expected.properties.every((property) => system.properties?.includes(property))
      && ['base', 'versatile'].every((key) => {
        const source = key === 'base' ? expected.damage.base : expected.damage.versatile;
        const actual = system.damage?.[key];
        return source === undefined ? !actual?.number
          : actual?.number === source.number && Number(actual?.denomination) === Number(source.denomination)
            && String(actual.bonus ?? '') === String(source.bonus ?? '')
            && JSON.stringify(actual.types) === JSON.stringify(source.types)
            && !actual?.custom?.enabled;
      });
    if (valid) return ['documents/0/system/magicalBonus', 'documents/0/system/type', 'documents/0/system/damage'];
    diagnostics.push(error('GEN_ITEM_WEAPON_BONUS_MISMATCH', 'semantic', mechanic.path,
      'The standard weapon identity, native base damage, and magical bonus must be preserved.'));
    return [];
  }
  if (mechanic.kind === 'armor') {
    const expected = mechanic.value as { value: number; dex?: number | null; magicalBonus?: number | null; type?: string; baseItem?: string };
    const actual = document?.system?.armor;
    if (!actual || actual.value !== expected.value
      || (actual.dex ?? null) !== (expected.dex ?? null)
      || (document?._stats?.systemVersion === '6.0.6'
        ? String(actual.magicalBonus ?? '') !== String(expected.magicalBonus ?? '')
        : (actual.magicalBonus ?? null) !== (expected.magicalBonus ?? null))
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
    const expected = mechanic.value as { max?: string | number; spent?: number; recovery?: any[]; autoDestroy?: true };
    const actual = document?.system?.uses;
    if (!actual) return [];
    if (
      String(actual.max) !== String(expected.max)
      || actual.spent !== expected.spent
      || Boolean(actual.autoDestroy) !== Boolean(expected.autoDestroy)
      || JSON.stringify(actual.recovery ?? []) !== JSON.stringify(expected.recovery ?? [])
    ) {
      diagnostics.push(error(
        'GEN_ITEM_USES_MISMATCH',
        'semantic',
        mechanic.path,
        'Item uses max, spent, recovery, or single-copy consumption differs from the source.',
      ));
    }
    return ['documents/0/system/uses'];
  }

  if (mechanic.kind === 'effect') {
    const expected = (mechanic.value as ActionData).passiveEffect;
    if (!expected) return undefined;
    const change = nativeItemPassiveChange(expected);
    if (!change || (target !== '14' && expected.type !== 'acBonus')) return undefined;
    const effectIndex = (document?.effects ?? []).findIndex((effect: any) =>
      effect?.transfer === true && effect.disabled === false
      && (target === '14' ? effect.type === 'base'
        && effect.changes === undefined
        && effect.system?.magical === true
        && effect.duration?.value === null
        && effect.system.changes?.some((entry: any) =>
          entry.key === change.key && entry.type === change.type && entry.phase === change.phase
          && String(entry.value) === String(change.value))
        : effect.type === 'passive' && effect.changes?.some((entry: any) =>
          entry.key === change.key && entry.mode === 2 && Number(entry.value) === Number(change.value))));
    if (effectIndex < 0) {
      diagnostics.push(error(
        expected.type === 'acBonus' ? 'GEN_ITEM_AC_EFFECT_MISMATCH' : 'GEN_ITEM_PASSIVE_EFFECT_MISMATCH',
        'semantic', mechanic.path,
        `Expected an enabled, permanent, transferred Effect adding "${change.value}" to ${change.key}.`,
      ));
      return [];
    }
    return [`documents/0/effects/${effectIndex}`];
  }

  if (target === '14' && mechanic.kind === 'item-action') {
    const expected = mechanic.value as ActionData;
    const healing = expected.healing;
    for (const [activityId, activity] of scopedEntries) {
      if (!expected.useAction || !matchesItemActionCost(expected.useAction, activity)
        || !matchesItemActivityMetadata(expected.activity, activity)) continue;
      if (healing) {
        const part = activity?.healing;
        const dice = /d/u.test(healing.formula);
        const formulaMatches = dice ? part?.custom?.enabled === false && matchesExpectedDamagePart(healing, part)
          : part?.custom?.enabled === true && String(part?.custom?.formula) === healing.formula
            && JSON.stringify(part?.types) === '["healing"]';
        const self = healing.target?.type === 'self';
        if (activity?.type !== 'heal' || !formulaMatches || activity.target?.affects?.type !== healing.target?.type
          || String(activity.target?.affects?.count) !== '1' || activity.target?.prompt !== !self
          || activity.range?.units !== (self ? 'self' : 'ft')) continue;
      } else if (activity?.type !== 'utility' || (activity.effects?.length ?? 0) > 0) continue;
      return [`documents/0/system/activities/${activityId}`];
    }
    diagnostics.push(error(healing ? 'GEN_ITEM_HEAL_ACTIVITY_MISMATCH' : 'GEN_ITEM_UTILITY_ACTIVITY_MISMATCH',
      'semantic', mechanic.path, 'Activity must preserve the source action, exact cost, healing or trigger, and its target metadata.'));
    return [];
  }

  if (target === '14' && mechanic.kind === 'attack') {
    const expected = mechanic.value as NonNullable<ActionData['attack']> & Pick<ActionData, 'useAction' | 'activity'>;
    if (!expected.useAction) return undefined;
    for (const [activityId, activity] of scopedEntries) {
      const attack = activity?.attack;
      const ranged = expected.type.startsWith('r');
      const useAttackModifier = expected.ability !== undefined && expected.includeBase === false && expected.toHit === undefined;
      const [range] = expected.range.match(/\d+/g) ?? [];
      const long = expected.range.match(/\d+\s*\/\s*(\d+)/u)?.[1];
      if (activity?.type === 'attack' && matchesItemActionCost(expected.useAction, activity)
        && matchesItemActivityMetadata(expected.activity, activity)
        && attack?.type?.value === (ranged ? 'ranged' : 'melee')
        && attack?.type?.classification === (expected.type.endsWith('sak') ? 'spell' : 'weapon')
        && attack?.ability === (expected.ability ?? '')
        && Boolean(attack?.flat) === (expected.toHit !== undefined)
        && attack?.bonus === String(expected.toHit ?? '')
        && activity.range?.units === 'ft' && String(activity.range?.value) === range
        && (!long || String(activity.range?.special ?? '').includes(long))
        && activity.damage?.includeBase === expected.includeBase
        && activity.damage?.parts?.length === expected.damage.length
        && expected.damage.every((part, index) => matchesExpectedDamagePart(part, activity.damage.parts[index], useAttackModifier))) {
        return [`documents/0/system/activities/${activityId}`];
      }
    }
    diagnostics.push(error('GEN_ITEM_ATTACK_ACTIVITY_MISMATCH', 'semantic', mechanic.path,
      'Attack must preserve the original roll mode, cost, range, targets, and exact damage without duplicate base damage.'));
    return [];
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
    const expected = mechanic.value as NonNullable<ActionData['itemSpell']> & {
      identifier?: string; name?: string; consumption?: number; activation?: string;
    };
    const hasFormalIdentifier = typeof expected.identifier === 'string' && expected.identifier.trim().length > 0;
    // Legacy targets retain cast/utility compatibility; V14 always proves a
    // unique 2024 spell reference, including strict Markdown without an identifier.
    if (!hasFormalIdentifier && target !== '14') {
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
    const resolved = expected.binding ?? (expected.identifier
      ? resolveLockedDnd5eV14Spell(String(expected.identifier), String(expected.name ?? ''))
      : resolveLockedDnd5eV14SpellByName(String(expected.name ?? '')));
    if (!resolved || (expected.uuid && expected.binding?.uuid !== expected.uuid)) {
      diagnostics.push(error(
        'GEN_ITEM_SPELL_UNRESOLVED',
        'semantic',
        mechanic.path,
        `No unique locked dnd5e V14 spell UUID exists for "${String(expected.identifier ?? expected.name ?? '')}".`,
      ));
      return [];
    }
    const resourceType = expected.activityUses ? 'activityUses' : 'itemUses';
    for (const [activityId, activity] of scopedEntries) {
      const targets = activity?.consumption?.targets ?? [];
      const [cost] = targets;
      const scaling = expected.maxCharges !== undefined;
      const expectedMax = scaling ? itemCastScalingMax(resourceType, expected.maxCharges!, expected.consumption ?? 1) : '';
      const uses = expected.activityUses ? activity?.uses : document?.system?.uses;
      const consumptionMatches = (expected.consumption ?? 0) > 0
        ? targets.length === 1 && cost?.type === resourceType && cost?.target === ''
          && String(cost?.value) === String(expected.consumption)
          && cost?.scaling?.mode === (scaling ? 'amount' : '') && (cost?.scaling?.formula ?? '') === ''
          && ((!hasFormalIdentifier && !expected.activityUses && !uses?.max)
            || Number(uses?.max) >= (expected.maxCharges ?? expected.consumption!))
        : targets.length === 0;
      const usesMatch = expected.activityUses
        ? String(activity?.uses?.max) === String(expected.activityUses.max)
          && activity?.uses?.spent === expected.activityUses.spent
          && sameUsesRecovery(activity?.uses?.recovery, expected.activityUses.recovery)
        : !activity?.uses?.max;
      const challenge = activity?.spell?.challenge;
      const dcMatches = expected.saveDc === undefined
        ? challenge?.override !== true
        : challenge?.override === true && String(challenge?.save) === String(expected.saveDc) && !challenge?.attack;
      if (
        activity?.type === 'cast'
        && activity?.spell?.uuid === resolved.uuid
        && activity.spell.level === (expected.level ?? resolved.level)
        && activity?.activation?.type === expected.activation
        && (!hasFormalIdentifier || activity?.activation?.value === 1)
        && Boolean(activity?.activation?.override) === (expected.activationOverride === true)
        && activity?.consumption?.spellSlot === false
        && activity?.consumption?.scaling?.allowed === scaling
        && activity?.consumption?.scaling?.max === expectedMax
        && consumptionMatches && usesMatch && dcMatches
      ) {
        return [`documents/0/system/activities/${activityId}`];
      }
    }
    diagnostics.push(error(
      'GEN_ITEM_SPELL_ACTIVITY_MISMATCH',
      'semantic',
      mechanic.path,
      'Cast must preserve the locked spell, level, fixed DC, activation, exact source pool and cost, and scaling cap without using spell slots.',
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
      if (targets.some((target: any) => target?.type === (expected.resource ?? 'itemUses') && String(target?.value) === String(expected.consumption))) {
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

function matchesItemActionCost(expected: NonNullable<ActionData['useAction']>, activity: any): boolean {
  const action = activity?.activation;
  const consumption = activity?.consumption;
  const targets = consumption?.targets ?? [];
  const [target] = targets;
  return action?.type === expected.activation && action.value === (expected.activation === 'free' ? 0 : 1)
    && (action.condition ?? '') === (expected.condition ?? '') && action.override === false
    && consumption?.spellSlot === false && consumption.scaling?.allowed === false
    && targets.length === (expected.consumption > 0 ? 1 : 0)
    && (expected.consumption === 0 || (target?.type === 'itemUses' && target.target === ''
      && target.value === String(expected.consumption) && !target.scaling?.mode && !target.scaling?.formula));
}

function verifiedTimedSpeedActivity(document: any, seconds: number): string | undefined {
  const system = document?.system;
  const entries = Object.entries<any>(system?.activities ?? {});
  const [id, activity] = entries[0] ?? [];
  const uses = system?.uses;
  if (document?.type !== 'equipment' || system?.type?.value !== 'wondrous' || system.attunement !== 'required'
    || system.equipped !== false || !system.properties?.includes('mgc')
    || document.flags?.fvttJsonGenerator?.timedSpeed?.units !== 'seconds'
    || String(uses?.max) !== String(seconds) || uses.spent !== 0 || uses.autoDestroy
    || uses.recovery?.length !== 1 || uses.recovery[0].period !== 'lr' || uses.recovery[0].type !== 'recoverAll'
    || !id || entries.length !== 1 || activity.type !== 'enchant' || activity.enchant?.self !== true
    || activity.activation?.type !== 'bonus' || activity.activation.value !== 1 || activity.uses?.max
    || activity.range?.units !== 'self' || activity.range.override !== true
    || activity.target?.affects?.type !== 'object' || activity.target.affects.count !== '1'
    || activity.target.prompt !== false || activity.consumption?.scaling?.allowed !== false
    || activity.visibility?.requireAttunement !== true || activity.visibility.requireMagic !== true
    || activity.consumption?.targets?.length !== 0 || activity.consumption.spellSlot !== false
    || activity.effects?.length !== 1 || document.effects?.length !== 2) return undefined;
  const [link] = activity.effects;
  const riderIds = document.flags?.dnd5e?.riders?.effect;
  if (riderIds?.length !== 1 || link.riders?.effect?.length !== 1 || link.riders.effect[0] !== riderIds[0]
    || link.riders?.activity?.length !== 0 || link.riders?.item?.length !== 0) return undefined;
  const profile = document.effects.find((effect: any) => effect._id === link._id);
  const rider = document.effects.find((effect: any) => effect._id === riderIds[0]);
  if (profile?.type !== 'enchantment' || profile.disabled !== true || profile.transfer !== false
    || profile.duration?.value !== seconds || profile.duration.units !== 'seconds' || profile.duration.expiry !== 'turnStart'
    || profile.system?.changes?.length !== 0 || rider?.type !== 'base' || rider.transfer !== true
    || rider.disabled !== false || rider.system?.magical !== true) return undefined;
  const changes = rider.system.changes;
  if (changes?.length !== TIMED_SPEED_MOVEMENTS.length || !TIMED_SPEED_MOVEMENTS.every(movement =>
    changes.some((change: any) => change.key === `system.attributes.movement.speeds.${movement}`
      && change.type === 'multiply' && String(change.value) === '2' && change.phase === 'initial'))) return undefined;
  return id;
}

function verifyStoredItemSpells(document: any, storage: ItemSpellStorageData): string[] | undefined {
  const stored = resolveStoredItemSpells(storage);
  const system = document?.system;
  const metadata = document?.flags?.fvttJsonGenerator?.spellStorage;
  if (document?.type !== 'equipment' || system?.type?.value !== 'ring' || system.attunement !== 'required'
    || system.equipped !== false || system.rarities?.length !== 1 || system.rarities[0] !== 'rare'
    || !system.properties?.includes('mgc') || system.uses?.max || system.uses?.autoDestroy
    || metadata?.capacity !== storage.capacity || metadata.foundLevels !== storage.foundLevels) return undefined;
  const activities = Object.entries<any>(system.activities ?? {});
  if (activities.length !== stored.length) return undefined;
  for (const entry of stored) {
    const index = activities.findIndex(([, activity]) => {
      const targets = activity.consumption?.targets;
      const { spell, activation, uses } = activity;
      return activity.type === 'cast' && spell?.uuid === entry.spell.uuid && spell.level === entry.level && spell.ability === entry.ability
        && spell.challenge?.override === true && String(spell.challenge.attack) === String(entry.attackBonus)
        && String(spell.challenge.save) === String(entry.saveDc)
        && ['vocal', 'somatic', 'material'].every(property => spell.properties?.includes(property))
        && activation?.override === false && String(uses?.max) === '1' && uses.spent === 0 && uses.recovery?.length === 0 && !uses.autoDestroy
        && activity.consumption?.spellSlot === false && activity.consumption?.scaling?.allowed === false
        && targets?.length === 1 && targets[0].type === 'activityUses' && !targets[0].target && String(targets[0].value) === '1';
    });
    if (index < 0) return undefined;
    activities.splice(index, 1);
  }
  return Object.keys(system.activities ?? {});
}

function verifyItemEnchantment(document: any, expected: ItemEnchantmentData): { activityId: string } | { issue: string } {
  const system = document?.system;
  const entries = Object.entries<any>(system?.activities ?? {});
  const [id, activity] = entries[0] ?? [];
  const effects: any[] = Array.isArray(document?.effects) ? document.effects : [];
  const target = enchantmentTargets(expected);
  const categories = activity?.restrictions?.categories;
  if (!id || entries.length !== 1 || activity.type !== 'enchant' || document.type !== target.type)
    return { issue: 'An enchantment template requires one native Enchant activity on the source item category.' };
  if (activity.restrictions?.type !== target.type || activity.restrictions.allowMagical !== false
    || !Array.isArray(categories) || categories.length !== target.categories.length
    || !target.categories.every(category => categories.includes(category)) || activity.restrictions.properties?.length !== 0)
    return { issue: 'Enchant restrictions must match the eligible nonmagical base item categories.' };
  if (activity.enchant?.self !== false || activity.activation?.type !== ''
    || activity.duration?.units !== 'inst' || activity.duration.concentration !== false
    || activity.consumption?.spellSlot !== false || activity.consumption.targets?.length !== 0
    || activity.consumption.scaling?.allowed !== false || activity.uses?.max || system.uses?.max)
    return { issue: 'Enchant must target a base item, with no activation cost, ongoing duration, item use, or spell slot.' };
  if (system.type?.baseItem !== '' || system.type?.value !== '' || system.equipped !== false || !system.properties?.includes('mgc'))
    return { issue: 'Enchant must start as a magical template without a preset base item or equipped state.' };

  const weapon = expected.kind === 'enchant-weapon-bonus';
  const options = weapon ? expected.bonuses : expected.damageTypes;
  const profiles: any[] = Array.isArray(activity.effects) ? activity.effects : [];
  const riderIds: string[] = document.flags?.dnd5e?.riders?.effect ?? [];
  if (!Array.isArray(riderIds) || riderIds.length !== (weapon ? 0 : options.length)
    || profiles.length !== options.length || effects.length !== options.length * (weapon ? 1 : 2)
    || new Set(profiles.map(profile => profile._id)).size !== options.length
    || new Set(riderIds).size !== riderIds.length)
    return { issue: 'Enchant profile counts and the linked effects and riders must match the source options.' };
  if (weapon ? system.attunement !== '' || system.rarities?.length !== 0 || Boolean(system.magicalBonus)
    : system.attunement !== 'required' || system.rarities?.length !== 1 || system.rarities[0] !== 'rare')
    return { issue: 'Enchant template rarity, attunement, and initial weapon bonus must match the source.' };

  const hasChange = (effect: any, key: string, type: string, value: string) =>
    effect.system?.changes?.some((change: any) => change.key === key && change.type === type
      && (typeof change.value === 'string' || typeof change.value === 'number') && String(change.value) === value
      && change.phase === 'initial');
  for (const [index, option] of options.entries()) {
    const profile = profiles[index];
    const linked = effects.find(effect => effect._id === profile._id);
    if (linked?.type !== 'enchantment' || linked.disabled !== true || linked.transfer !== false
      || linked.system?.magical !== true || linked.duration?.value != null || linked.system?.changes?.length !== 4
      || !hasChange(linked, 'system.properties', 'add', 'mgc')
      || profile.level?.min !== null || profile.level?.max !== null
      || profile.riders?.activity?.length !== 0 || profile.riders?.item?.length !== 0)
      return { issue: `Enchant option ${index + 1} must reference its inactive native effect and contain no extra activity or item riders.` };
    if (weapon) {
      if (profile.riders.effect?.length !== 0 || !hasChange(linked, 'name', 'override', `{} +${option}`)
        || !hasChange(linked, 'system.magicalBonus', 'upgrade', String(option))
        || !hasChange(linked, 'system.rarities', 'override', ENCHANTED_WEAPON_RARITY[option as keyof typeof ENCHANTED_WEAPON_RARITY]))
        return { issue: `Weapon Enchant option +${option} must set its exact native magical bonus and matching rarity.` };
    } else {
      const rider = effects.find(effect => effect._id === riderIds[index]);
      if (profile.riders.effect?.length !== 1 || profile.riders.effect[0] !== riderIds[index]
        || rider?.type !== 'base' || rider.disabled !== false || rider.transfer !== true
        || rider.system?.magical !== true || rider.duration?.value != null || rider.system?.changes?.length !== 1
        || !hasChange(rider, 'system.traits.dr.value', 'add', String(option))
        || !hasChange(linked, 'name', 'override', `{} · ${linked.name}`)
        || !hasChange(linked, 'system.rarities', 'override', 'rare') || !hasChange(linked, 'system.attunement', 'override', 'required'))
        return { issue: `Armor Enchant option ${option} must grant its own resistance rider and require attunement.` };
    }
  }
  return { activityId: id };
}

function matchesItemActivityMetadata(expected: ActionData['activity'], activity: any): boolean {
  if (expected?.range && (String(activity?.range?.value) !== String(expected.range.value)
    || activity.range.units !== expected.range.units)) return false;
  if (expected?.duration && (String(activity?.duration?.value) !== expected.duration.value
    || activity.duration.units !== expected.duration.units
    || activity.duration.concentration !== expected.duration.concentration)) return false;
  const target = expected?.target;
  if (!target) return true;
  const actual = activity?.target;
  return actual?.template?.type === target.template.type
    && String(actual.template.size) === target.template.size
    && actual.template.units === target.template.units
    && (!target.affects || (actual.affects?.type === target.affects.type
      && String(actual.affects.count) === String(target.affects.count)
      && (actual.affects.special ?? '') === (target.affects.special ?? '')));
}

function sameUsesRecovery(actual: unknown, expected: Array<{ period: string; type: string; formula?: string }>): boolean {
  return Array.isArray(actual) && actual.length === expected.length && expected.every((entry, index) =>
    actual[index]?.period === entry.period && actual[index]?.type === entry.type
    && (actual[index]?.formula ?? '') === (entry.formula ?? ''));
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

function gmHitRollTemplateValid(activity:any,effect:any,activities:any[]):boolean{
  const marker=activity.flags?.fvttJsonGenerator?.sourceOperation,flags=effect.flags?.fvttJsonGenerator,life=flags?.conditionLifecycle;
  return marker?.role==='attack-roll'&&typeof marker.id==='string'&&flags?.sourceOperationId===marker.id&&life?.version===1&&life.mode==='gm'
    &&String(effect.description).includes('已命中')&&(effect.statuses??[]).every(officialCondition)
    &&!activities.some(entry=>entry.flags?.fvttJsonGenerator?.sourceOperation?.id===marker.id&&entry.flags?.fvttJsonGenerator?.sourceOperation?.role==='damage');
}

interface ConditionStagePlan {sourceStage:string;statuses:string[];owner?:string;key:string;}

function conditionStagePlans(document:any):ConditionStagePlan[]{
  const rule=document.flags?.fvttJsonGenerator?.manualRule,source=rule?.sourceText??document.flags?.fvttJsonGenerator?.literalMechanics?.description??'';
  const operations=Array.isArray(rule?.sourceOperations)?rule.sourceOperations:[];
  const planned:ConditionStagePlan[]=[];
  const collect=(scope:string,owner?:string)=>{
    for(const condition of inferredAppliedConditions(scope))if(condition.sourceStage)planned.push({sourceStage:condition.sourceStage,statuses:officialConditionStatuses(condition.statuses),owner,key:condition.statuses.join('-')});
  };
  if(operations.length){for(const op of operations)if(!op.appliedConditions)collect(operationConditionSource(source,op,operations),op.id);}
  else collect(source);
  return planned;
}

function validConditionStage(activity:any,document:any,planned=conditionStagePlans(document)):ConditionStagePlan|undefined{
  const marker=activity.flags?.fvttJsonGenerator?.sourceConditionStage;
  if(marker?.version!==1||typeof marker.source!=='string'||!marker.source.trim()||activity.type!=='utility'||activity.activation?.type!=='special'
    ||!String(activity.flags?.fvttJsonGenerator?.sourceLogicalPath??'').includes('/condition-stage/')||activity.flags?.fvttJsonGenerator?.sourceOperation
    ||conditionStageHasMechanics(activity)||activity.consumption?.spellSlot!==false||activity.consumption?.scaling?.allowed!==false
    ||!Array.isArray(activity.consumption?.targets)||activity.consumption.targets.length)return undefined;
  const compact=(value:string)=>value.replace(/\s+/gu,'');
  if(!Array.isArray(activity.effects)||!activity.effects.length||new Set(activity.effects.map((link:any)=>link._id)).size!==activity.effects.length)return undefined;
  const effects=activity.effects.map((link:any)=>(document.effects??[]).find((effect:any)=>effect._id===link._id));
  const signature=(statuses:string[])=>JSON.stringify([...new Set(statuses)].sort());
  const expected=planned.find(condition=>compact(condition.sourceStage)===compact(marker.source)&&condition.owner===marker.sourceOperationId
    &&String(activity.flags.fvttJsonGenerator.sourceLogicalPath).endsWith('/condition-stage/'+condition.key)
    &&signature(effects.flatMap((effect:any)=>effect?.statuses??[]))===signature(condition.statuses));
  if(!expected)return undefined;
  const valid=activity.effects.every((link:any)=>link.onSave===undefined)&&effects.every((effect:any)=>{
    const flags=effect?.flags?.fvttJsonGenerator,life=flags?.conditionLifecycle;
    return effect&&effect.transfer===false&&effect.disabled!==true&&flags?.sourceOperationId===expected.owner&&life?.version===1&&life.mode==='gm'&&life.staged===true
      &&compact(String(life.sourceText??''))===compact(marker.source)&&compact(String(effect.description??'')).includes(compact(marker.source));
  });
  return valid?expected:undefined;
}

function conditionStageHasMechanics(activity:any):boolean{
  const nonempty=(value:any):boolean=>Array.isArray(value)?value.some(nonempty):value&&typeof value==='object'?Object.values(value).some(nonempty):value!==undefined&&value!==null&&value!==''&&value!==false&&value!==0;
  const uses=activity.uses??{};
  return ['attack','save','damage','healing'].some(key=>nonempty(activity[key]))||String(activity.roll?.formula??'').trim()!==''
    ||String(uses.max??'').trim()!==''&&String(uses.max)!=='0'||Number(uses.spent??0)!==0||Array.isArray(uses.recovery)&&uses.recovery.length>0;
}

type StructuredUsesPeriod = 'day' | 'longRest' | 'shortRest' | 'dawn';

interface StructuredUsesValue {
  max: number;
  period: StructuredUsesPeriod;
}

/** Pending is a portable source contract, not runtime hydration. A rule reader
 * must remain inert; only the matched resolver-owned Cast spends this pool. */
function pendingSpellParentUses(actor:any,item:any,key:string|undefined,uses:StructuredUsesValue):boolean{
  if(!key||!['day','longRest','shortRest'].includes(uses.period)||item?.flags?.fvttJsonGenerator?.spellcastingFeatureKey!==key)return false;
  const owner=actor?.flags?.[RESOLVER_MODULE_ID],checked=validateActorSpellManifestStructure(owner?.spellManifest);
  if(!checked.ok||owner?.spellResolution?.status!=='pending'||owner.spellResolution.manifestHash!==hashManifest(checked.value))return false;
  const groups=checked.value.spellcastingGroups.filter(g=>g.featureItemKey===key);
  if(groups.length!==1)return false;
  const group=groups[0]!,link=item.flags?.[RESOLVER_MODULE_ID];
  if(link?.featureItemKey!==key||link?.groupId!==group.groupId||!group.spellRefs.length)return false;
  if(group.spellRefs.some(ref=>ref.method!=='innate'||ref.uses?.value!==uses.max||ref.uses.recovery!==uses.period))return false;
  if(group.spellRefs.length===1?item.flags.fvttJsonGenerator.spellcastingUsesParent!==true||group.spellRefs[0]!.uses!.shared:group.spellRefs.some(ref=>ref.uses?.shared!==true))return false;
  const activities=Object.values(item.system?.activities??{}) as any[],reader=activities[0];
  return activities.length===1&&reader.type==='utility'&&reader.activation?.type===''&&reader.consumption?.spellSlot===false
    &&reader.consumption.targets?.length===0&&!reader.damage&&!reader.attack&&!reader.save&&!reader.effects?.length&&!item.effects?.length;
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
}, actual: any, allowAttackModifier = false): boolean {
  const formula = String(expected.formula).replace(/\s+/g, '');
  const hasAttackModifier = allowAttackModifier && formula.endsWith('+@mod');
  const diceFormula = hasAttackModifier ? formula.slice(0, -5) : formula;
  const match = diceFormula.match(/^(\d+)d(\d+)(?:([+-]\d+))?$/i);
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
    : !hasAttackModifier && Number(actual?.number) === Number(match[1])
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
  runtimeTarget?: FoundryTarget,
): void {
  const expected = (runtimeTarget ?? getFoundryTarget(target)).stats;
  const stats = output?._stats;
  if (stats || runtimeTarget) {
    for (const key of ['coreVersion', 'systemId'] as const) if (stats?.[key] !== expected[key])
      diagnostics.push(error('GEN_TARGET_METADATA_MISMATCH','schema',`_stats/${key}`,
        `Expected ${expected[key]}, received ${String(stats?.[key])}.`));
  }
  if ((runtimeTarget || stats?.systemVersion) && stats?.systemVersion !== expected.systemVersion) {
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
