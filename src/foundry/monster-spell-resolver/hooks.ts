import {
  hashManifest,
  hashResolutionConfiguration,
  isSpellResolutionConfiguration,
  planSpellHydration,
  RESOLVER_MODULE_ID,
  sha256,
  validatePortableSpellManifestStructure,
  type HydrationPreflight,
  type ManagedSpellProjection,
  type PortableSpellManifest,
  type SavedSpellMapping,
  type SpellHydrationPlan,
  type SpellManualDecision,
  type SpellResolutionConfiguration,
} from '../../core/spell-resolution';
import { buildCastActivitySource, computeManagedSourceHash } from './cast-activity';
import type { ResolverRuntimeApi } from './foundry-adapter';
import { HydrationTransactionError, executeHydrationTransaction, projectCurrentManagedContent } from './transaction';
import { fetchSelectedSpellDocument } from './source-index';
import { createFoundryAdapter } from './foundry-adapter';
import { assertAdoptableNativeCache, assertResolverDocumentOwnership, documentId } from './ownership';
import {
  openResolverReviewDialog,
  renderResolverReviewHtml,
  type ResolverReviewModel,
  type ResolverReviewOutcome,
} from './review-app';
import { readResolverStatus, resolverStatusLabel } from './status';
import type { ResolverStatus } from './status';

export interface ResolverActorActions {
  status(actor: any): ResolverStatus;
  resolve(actor: any): Promise<void>;
  viewReport(actor: any): Promise<void>;
  viewSources(actor: any): Promise<void>;
  undo(actor: any): Promise<void>;
  exportDiagnostics(actor: any): Promise<void>;
}

export interface ResolverEventCoordinatorOptions {
  authority(): { isGM: boolean; userId?: string };
  runtimeSupported(): boolean;
  isActive(actor: any): boolean;
  isAlreadyApplied(actor: any): boolean;
  schedule(callback: () => void | Promise<void>): void;
  process(actor: any): Promise<void>;
}

export interface ResolverActorEvent {
  userId?: string;
  resolverOwned?: boolean;
}

export type ResolverEventDisposition = 'ignored' | 'scheduled' | 'coalesced';

export interface ResolverEventCoordinator {
  onActorEvent(actor: any, event: ResolverActorEvent): ResolverEventDisposition;
}

export function createResolverEventCoordinator(options: ResolverEventCoordinatorOptions): ResolverEventCoordinator {
  const queued = new Set<object>();
  return {
    onActorEvent(actor, event) {
      const authority = options.authority();
      if (!authority.isGM || !authority.userId || event.userId !== authority.userId || event.resolverOwned) return 'ignored';
      if (!isEligibleActor(actor) || !options.runtimeSupported() || options.isActive(actor) || options.isAlreadyApplied(actor)) {
        return 'ignored';
      }
      if (queued.has(actor)) return 'coalesced';
      queued.add(actor);
      options.schedule(async () => {
        queued.delete(actor);
        if (options.isActive(actor)) return;
        await options.process(actor);
      });
      return 'scheduled';
    },
  };
}

export interface ResolverHookBus {
  on(name: 'createActor' | 'updateActor' | 'getHeaderControlsApplicationV2' | 'getActorContextOptions', callback: (...args: any[]) => unknown): unknown;
}

export interface ResolverHookController {
  onActorEvent(actor: any, event: ResolverActorEvent): ResolverEventDisposition;
  actions: ResolverActorActions;
  isCurrentUserGM(): boolean;
}

export function registerResolverHooks(hooks: ResolverHookBus, controller: ResolverHookController): void {
  hooks.on('createActor', (actor: any, options: any, userId: string) =>
    controller.onActorEvent(actor, { userId, resolverOwned: isResolverOwnedOperation(options) }));
  hooks.on('updateActor', (actor: any, _changed: unknown, options: any, userId: string) =>
    controller.onActorEvent(actor, { userId, resolverOwned: isResolverOwnedOperation(options) }));
  hooks.on('getHeaderControlsApplicationV2', (application: any, controls: any[]) => {
    if (!controller.isCurrentUserGM()) return;
    const actor = application?.document;
    if (!isEligibleActor(actor)) return;
    controls.push(...createActionEntries(controller.actions, () => actor, true));
  });
  hooks.on('getActorContextOptions', (application: any, menuItems: any[]) => {
    if (!controller.isCurrentUserGM()) return;
    menuItems.push(...createActionEntries(controller.actions, (element: any) => {
      const entry = element?.closest?.('[data-entry-id]');
      return application?.collection?.get?.(entry?.dataset?.entryId);
    }, false));
  });
}

function createActionEntries(
  actions: ResolverActorActions,
  resolveActor: (element?: any) => any,
  header: boolean,
): any[] {
  const specs = [
    ['resolve', 'FVTTJSONSPELL.Action.Resolve', 'fa-solid fa-wand-magic-sparkles', actions.resolve],
    ['report', 'FVTTJSONSPELL.Action.ViewReport', 'fa-solid fa-clipboard-list', actions.viewReport],
    ['sources', 'FVTTJSONSPELL.Action.ViewSources', 'fa-solid fa-book', actions.viewSources],
    ['undo', 'FVTTJSONSPELL.Action.Undo', 'fa-solid fa-rotate-left', actions.undo],
    ['diagnostics', 'FVTTJSONSPELL.Action.ExportDiagnostics', 'fa-solid fa-file-export', actions.exportDiagnostics],
  ] as const;
  return specs.map(([action, label, icon, handler]) => ({
    ...(header ? { action: `${RESOLVER_MODULE_ID}.${action}` } : {}),
    label,
    icon,
    ...(header ? { tooltip: resolverStatusLabel(actions.status(resolveActor())) } : {}),
    visible: (element?: any) => isEligibleActor(resolveActor(element)),
    onClick: async (...args: any[]) => {
      const element = header ? undefined : args[1];
      const actor = resolveActor(element);
      if (!isEligibleActor(actor)) return;
      await handler(actor);
    },
  }));
}

function isResolverOwnedOperation(options: unknown): boolean {
  return isRecord(options) && isRecord(options[RESOLVER_MODULE_ID]) && options[RESOLVER_MODULE_ID].owned === true;
}

export function normalizeSavedMappings(value: unknown): SavedSpellMapping[] {
  let entries: unknown[];
  if (value === undefined || value === null) entries = [];
  else if (Array.isArray(value)) entries = [...value];
  else if (isRecord(value)) {
    entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right, 'en')).map(([key, entry]) => {
      if (!isRecord(entry) || entry.logicalRefKey !== key) throw new TypeError('savedMappings object key must equal logicalRefKey.');
      return entry;
    });
  } else throw new TypeError('savedMappings must be an array or logicalRefKey-keyed object.');
  if (!entries.every(isSavedMapping)) throw new TypeError('savedMappings contains a malformed mapping.');
  return entries as SavedSpellMapping[];
}

function isSavedMapping(value: unknown): value is SavedSpellMapping {
  if (!isRecord(value)) return false;
  const keys = ['logicalRefKey', 'selectedUuid', 'rules', 'sourceInventoryHash', 'candidateMetadataHash', 'resolutionConfigHash', 'selectionOrigin'];
  if (Object.keys(value).some((key) => !keys.includes(key))) return false;
  return typeof value.logicalRefKey === 'string'
    && /^Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Item\.[A-Za-z0-9]{16}$/.test(String(value.selectedUuid))
    && (value.rules === '2024' || value.rules === '2014')
    && isHash(value.sourceInventoryHash) && isHash(value.candidateMetadataHash) && isHash(value.resolutionConfigHash)
    && (value.selectionOrigin === 'automatic-2024' || value.selectionOrigin === 'fallback-2014' || value.selectionOrigin === 'manual-review');
}

function isEligibleActor(actor: any): boolean {
  if (actor?.documentName !== 'Actor') return false;
  return validatePortableSpellManifestStructure(actor.flags?.[RESOLVER_MODULE_ID]?.spellManifest).ok;
}

function isHash(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ResolverActorServiceDependencies {
  getRuntime(): ResolverRuntimeApi | undefined;
  getSetting(key: 'sourcePriority' | 'savedMappings'): unknown;
  setSetting(key: 'savedMappings', value: unknown): Promise<void>;
  fetchSelectedDocument(uuid: string): Promise<any>;
  execute(actor: any, manifest: PortableSpellManifest, plan: SpellHydrationPlan): Promise<unknown>;
  openReview(model: ResolverReviewModel): Promise<ResolverReviewOutcome>;
  renderTemplate(templatePath: string, context: Record<string, unknown>): Promise<string>;
  showDocument(title: string, html: string): Promise<void>;
  exportJson(filename: string, value: unknown): void;
  notify(level: 'info' | 'warn' | 'error', message: string): void;
}

export interface ResolveActorOptions {
  explicit?: boolean;
}

export interface ResolverActorService extends ResolverActorActions {
  isActive(actor: any): boolean;
  isAlreadyApplied(actor: any): boolean;
  processActor(actor: any, options?: ResolveActorOptions): Promise<void>;
}

export function createResolverActorService(dependencies: ResolverActorServiceDependencies): ResolverActorService {
  const active = new WeakSet<object>();
  const ephemeral = new WeakMap<object, ResolverStatus>();
  const openedFindingHashes = new WeakMap<object, Set<string>>();
  const reports = new WeakMap<object, HydrationPreflight['report']>();

  const service: ResolverActorService = {
    status(actor) { return readResolverStatus(actor, { active: active.has(actor), ephemeral: ephemeral.get(actor) }); },
    isActive(actor) { return Boolean(actor && typeof actor === 'object' && active.has(actor)); },
    isAlreadyApplied(actor) {
      try {
        const runtime = dependencies.getRuntime();
        const resolution = actor?.flags?.[RESOLVER_MODULE_ID]?.spellResolution;
        const validated = validatePortableSpellManifestStructure(actor?.flags?.[RESOLVER_MODULE_ID]?.spellManifest);
        if (!validated.ok || resolution?.status !== 'hydrated' || typeof resolution.planHash !== 'string'
          || !runtime?.compatibility.supported || !runtime.canMutate || !runtime.sourceIndex) return false;
        if (resolution.manifestHash !== hashManifest(validated.value)) return false;
        const current = createPreflight(actor, validated.value, runtime as ResolverRuntimeApi & {
          sourceIndex: NonNullable<ResolverRuntimeApi['sourceIndex']>;
        }, dependencies);
        if (resolution.report?.sourceInventoryHash !== current.report.sourceInventoryHash
          || resolution.report?.candidateMetadataHash !== current.report.candidateMetadataHash
          || resolution.resolutionConfigHash !== current.report.resolutionConfigHash) return false;
        if (!sameResolvedSelections(current.report.results, resolution.report?.selections)) return false;
        if (!hasStrictHydratedStructure(actor, validated.value, resolution)) return false;
        return true;
      } catch { return false; }
    },
    async resolve(actor) { await service.processActor(actor, { explicit: true }); },
    async processActor(actor, options = {}) {
      if (!actor || typeof actor !== 'object' || active.has(actor)) return;
      const runtime = dependencies.getRuntime();
      if (!runtime?.compatibility.supported || !runtime.canMutate || !runtime.sourceIndex) return;
      const readyRuntime = runtime as ResolverRuntimeApi & { sourceIndex: NonNullable<ResolverRuntimeApi['sourceIndex']> };
      const validation = validatePortableSpellManifestStructure(actor.flags?.[RESOLVER_MODULE_ID]?.spellManifest);
      if (!validation.ok) return;
      active.add(actor);
      ephemeral.set(actor, 'resolving');
      try {
        const initial = createPreflight(actor, validation.value, readyRuntime, dependencies);
        reports.set(actor, initial.report);
        if (initial.status === 'incompatible') {
          ephemeral.set(actor, 'incompatible');
          return;
        }
        if (initial.status === 'needs_review') {
          ephemeral.set(actor, 'needs_review');
          const model = buildResolverReviewModel(actor, validation.value, initial);
          const seen = openedFindingHashes.get(actor) ?? new Set<string>();
          openedFindingHashes.set(actor, seen);
          if (!options.explicit && seen.has(model.findingHash)) return;
          seen.add(model.findingHash);
          const outcome = await dependencies.openReview(model);
          if (outcome.action === 'cancel') return;
          const mappings = mappingsFromCandidateSelections(initial, outcome, readyRuntime, dependencies);
          const replanned = createPreflight(actor, validation.value, readyRuntime, dependencies, outcome.manualDecisions, mappings);
          reports.set(actor, replanned.report);
          if (replanned.status !== 'ready') {
            ephemeral.set(actor, replanned.status === 'incompatible' ? 'incompatible' : 'needs_review');
            return;
          }
          await applyReadyPlan(actor, validation.value, replanned.plan, dependencies, options, mappings);
          ephemeral.delete(actor);
          return;
        }
        await applyReadyPlan(actor, validation.value, initial.plan, dependencies, options);
        ephemeral.delete(actor);
      } catch (error) {
        if (error instanceof MappingStateError && !error.actorMutationAllowed) {
          ephemeral.set(actor, error.recoveryRequired ? 'failed-recovery-required' : 'failed');
          dependencies.notify('error', error.message);
          return;
        }
        if (error instanceof SelectedSpellValidationError) {
          ephemeral.set(actor, 'needs_review');
          dependencies.notify('warn', error.message);
          const validation = validatePortableSpellManifestStructure(actor?.flags?.[RESOLVER_MODULE_ID]?.spellManifest);
          const prior = reports.get(actor);
          if (validation.ok && prior) {
            const finding = {
              code: 'INVALID_SELECTED_SPELL_DOCUMENT',
              path: error.logicalRefKey,
              message: error.message,
              blocking: true,
              evidence: [],
            };
            const reviewPreflight: HydrationPreflight = {
              status: 'needs_review',
              findings: [finding],
              report: { ...prior, findings: [...prior.findings, finding] },
            };
            const model = buildResolverReviewModel(actor, validation.value, reviewPreflight);
            const seen = openedFindingHashes.get(actor) ?? new Set<string>();
            openedFindingHashes.set(actor, seen);
            if (options.explicit || !seen.has(model.findingHash)) {
              seen.add(model.findingHash);
              await dependencies.openReview(model);
            }
          }
          return;
        }
        const recoveryRequired = (error instanceof HydrationTransactionError && !error.rollbackSucceeded)
          || (error instanceof MappingStateError && error.recoveryRequired);
        const status: ResolverStatus = recoveryRequired ? 'failed-recovery-required' : 'failed';
        ephemeral.set(actor, status);
        await writeFailureStatus(actor, status, error);
        dependencies.notify('error', errorMessage(error));
      } finally {
        active.delete(actor);
      }
    },
    async viewReport(actor) {
      let report: unknown;
      const runtime = dependencies.getRuntime();
      const validation = validatePortableSpellManifestStructure(actor?.flags?.[RESOLVER_MODULE_ID]?.spellManifest);
      if (validation.ok && runtime?.compatibility.supported && runtime.sourceIndex) {
        const current = createPreflight(actor, validation.value, runtime as ResolverRuntimeApi & {
          sourceIndex: NonNullable<ResolverRuntimeApi['sourceIndex']>;
        }, dependencies);
        reports.set(actor, current.report);
        const committed = actor?.flags?.[RESOLVER_MODULE_ID]?.spellResolution?.report;
        report = {
          ...(isRecord(committed) ? committed : {}),
          ...current.report,
          ...(Array.isArray(committed?.selections) ? { selections: committed.selections } : {}),
          ...(Array.isArray(committed?.literalRestrictions) ? { literalRestrictions: committed.literalRestrictions } : {}),
        };
      } else {
        report = reports.get(actor) ?? actor?.flags?.[RESOLVER_MODULE_ID]?.spellResolution?.report;
      }
      await dependencies.showDocument('FVTTJSONSPELL.Action.ViewReport', await renderReportDocument(dependencies, report));
    },
    async viewSources(actor) {
      const runtime = dependencies.getRuntime();
      const manifest = actor?.flags?.[RESOLVER_MODULE_ID]?.spellManifest;
      const data = {
        sourcePackages: runtime?.sourceIndex?.sourcePackages ?? [],
        selections: actor?.flags?.[RESOLVER_MODULE_ID]?.spellResolution?.report?.selections ?? [],
        manifestEvidence: isRecord(manifest) && Array.isArray(manifest.spellcastingGroups)
          ? manifest.spellcastingGroups.flatMap((group: any) => Array.isArray(group.spellRefs) ? group.spellRefs.map((ref: any) => ({
            refId: ref.refId, originalName: ref.originalName, evidence: ref.evidence, restrictions: ref.restrictions,
          })) : [])
          : [],
      };
      await dependencies.showDocument('FVTTJSONSPELL.Action.ViewSources', await renderReportDocument(dependencies, data));
    },
    async undo(actor) {
      if (!actor || typeof actor !== 'object' || active.has(actor)) throw new Error('Actor already has an active resolver operation.');
      active.add(actor);
      try {
        await restoreLastHydration(actor);
        ephemeral.delete(actor);
        dependencies.notify('info', 'FVTTJSONSPELL.Notification.UndoComplete');
      } catch (error) {
        const persisted = readResolverStatus(actor);
        const recoveryRequired = persisted === 'failed-recovery-required'
          || (error instanceof UndoTransactionError && error.recoveryRequired);
        ephemeral.set(actor, recoveryRequired ? 'failed-recovery-required' : 'failed');
        dependencies.notify('error', errorMessage(error));
        throw error;
      } finally {
        active.delete(actor);
      }
    },
    async exportDiagnostics(actor) {
      const runtime = dependencies.getRuntime();
      const value = {
        moduleId: RESOLVER_MODULE_ID,
        actorId: documentId(actor),
        status: service.status(actor),
        compatibility: runtime?.compatibility,
        diagnostics: runtime?.diagnostics ?? [],
        sourceInventoryHash: runtime?.sourceIndex?.sourceInventoryHash,
        candidateMetadataHash: runtime?.sourceIndex?.candidateMetadataHash,
        spellResolution: redactReport(actor?.flags?.[RESOLVER_MODULE_ID]?.spellResolution),
      };
      dependencies.exportJson(`spell-resolver-${safeFilename(documentId(actor) || 'actor')}.json`, value);
    },
  };
  return service;
}

function createPreflight(
  actor: any,
  manifest: PortableSpellManifest,
  runtime: ResolverRuntimeApi & { sourceIndex: NonNullable<ResolverRuntimeApi['sourceIndex']> },
  dependencies: ResolverActorServiceDependencies,
  manualDecisions: SpellManualDecision[] = [],
  additionalMappings: SavedSpellMapping[] = [],
): HydrationPreflight {
  const sourcePriority = dependencies.getSetting('sourcePriority');
  if (!Array.isArray(sourcePriority)) {
    return incompatiblePreflight(
      manifest.manifestId,
      runtime.sourceIndex,
      'INVALID_RESOLUTION_CONFIGURATION',
      '/settings/sourcePriority',
      'sourcePriority must be a structured array.',
    );
  }
  const configuration: SpellResolutionConfiguration = {
    policyVersion: '2024-first-v1',
    sourcePriority: structuredClone(sourcePriority),
  };
  let savedMappings: SavedSpellMapping[];
  try { savedMappings = normalizeSavedMappings(dependencies.getSetting('savedMappings')); }
  catch (error) {
    return incompatiblePreflight(
      manifest.manifestId,
      runtime.sourceIndex,
      'INVALID_SAVED_MAPPINGS',
      '/settings/savedMappings',
      errorMessage(error),
    );
  }
  const byKey = new Map(savedMappings.map((entry) => [entry.logicalRefKey, entry]));
  for (const entry of additionalMappings) byKey.set(entry.logicalRefKey, entry);
  return planSpellHydration({
    manifest,
    candidates: runtime.sourceIndex.candidates,
    sourceInventoryHash: runtime.sourceIndex.sourceInventoryHash,
    savedMappings: [...byKey.values()],
    currentManagedProjection: projectManagedContentWithConflicts(actor, manifest.manifestId),
    manualDecisions,
    configuration,
  });
}

function incompatiblePreflight(
  manifestId: string,
  sourceIndex: NonNullable<ResolverRuntimeApi['sourceIndex']>,
  code: string,
  path: string,
  message: string,
): HydrationPreflight {
  const finding = { code, path, message, blocking: true, evidence: [] };
  return {
    status: 'incompatible', findings: [finding], report: {
      manifestId, sourceInventoryHash: sourceIndex.sourceInventoryHash, candidateMetadataHash: sourceIndex.candidateMetadataHash,
      resolutionConfigHash: '', currentManagedProjectionHash: sha256('[]'), manualDecisionsHash: sha256('[]'), results: [], findings: [finding],
    },
  };
}

async function applyReadyPlan(
  actor: any,
  manifest: PortableSpellManifest,
  plan: SpellHydrationPlan,
  dependencies: ResolverActorServiceDependencies,
  options: ResolveActorOptions,
  mappings: SavedSpellMapping[] = [],
): Promise<boolean> {
  const resolution = actor.flags?.[RESOLVER_MODULE_ID]?.spellResolution;
  if (resolution?.status === 'hydrated' && resolution.planHash !== plan.planHash && !options.explicit) {
    await writeStatus(actor, 'stale', { stalePlanHash: plan.planHash });
    return false;
  }
  for (const selection of plan.selections) {
    const document = await dependencies.fetchSelectedDocument(selection.uuid);
    if (!document || document.documentName !== 'Item' || document.type !== 'spell' || document.uuid !== selection.uuid) {
      throw new SelectedSpellValidationError(
        selection.logicalRefKey,
        `Selected destination document is not the exact readable Spell: ${selection.uuid}`,
      );
    }
  }
  if (mappings.length === 0) {
    await dependencies.execute(actor, manifest, plan);
    return true;
  }

  const previousMappings = structuredClone(dependencies.getSetting('savedMappings'));
  const nextMappings = mergeSavedMappings(previousMappings, mappings);
  try {
    await dependencies.setSetting('savedMappings', nextMappings);
  } catch (cause) {
    try {
      await dependencies.setSetting('savedMappings', structuredClone(previousMappings));
    } catch (restoreCause) {
      throw new MappingStateError(
        `Saved mapping persistence failed before hydration and exact restoration also failed: ${errorMessage(cause)}; mapping restore failure: ${errorMessage(restoreCause)}. Manual recovery is required.`,
        true,
        false,
        { cause },
      );
    }
    throw new MappingStateError(`Saved mapping persistence failed before hydration: ${errorMessage(cause)}. No Actor mutation was attempted.`, false, false, { cause });
  }
  try {
    await dependencies.execute(actor, manifest, plan);
  } catch (cause) {
    try {
      await dependencies.setSetting('savedMappings', structuredClone(previousMappings));
    } catch (restoreCause) {
      throw new MappingStateError(
        `Hydration failed and saved mapping restoration failed: ${errorMessage(cause)}; mapping restore failure: ${errorMessage(restoreCause)}. Manual recovery is required.`,
        true,
        true,
        { cause },
      );
    }
    throw cause;
  }
  return true;
}

function mappingsFromCandidateSelections(
  preflight: HydrationPreflight,
  outcome: Extract<ResolverReviewOutcome, { action: 'apply' }>,
  runtime: ResolverRuntimeApi & { sourceIndex: NonNullable<ResolverRuntimeApi['sourceIndex']> },
  dependencies: ResolverActorServiceDependencies,
): SavedSpellMapping[] {
  const sourcePriority = dependencies.getSetting('sourcePriority');
  if (!Array.isArray(sourcePriority)) throw new TypeError('sourcePriority must remain a structured array during review.');
  const configuration: SpellResolutionConfiguration = {
    policyVersion: '2024-first-v1',
    sourcePriority,
  };
  if (!isSpellResolutionConfiguration(configuration)) throw new TypeError('sourcePriority became invalid during review.');
  return outcome.candidateSelections.map((choice) => {
    const result = preflight.report.results.find((entry) => entry.logicalRefKey === choice.logicalRefKey);
    const candidate = result?.candidates?.find((entry) => entry.uuid === choice.selectedUuid)
      ?? result?.suggestions?.find((entry) => entry.uuid === choice.selectedUuid);
    if (!candidate || (candidate.rules !== '2024' && candidate.rules !== '2014')) {
      throw new TypeError(`Review candidate ${choice.selectedUuid} is not an explicit 2024/2014 Spell choice.`);
    }
    return {
      logicalRefKey: choice.logicalRefKey,
      selectedUuid: choice.selectedUuid,
      rules: candidate.rules,
      sourceInventoryHash: preflight.report.sourceInventoryHash,
      candidateMetadataHash: preflight.report.candidateMetadataHash,
      resolutionConfigHash: hashResolutionConfiguration(configuration),
      selectionOrigin: 'manual-review',
    };
  });
}

function mergeSavedMappings(currentValue: unknown, mappings: SavedSpellMapping[]): Record<string, SavedSpellMapping> {
  const current = normalizeSavedMappings(currentValue);
  const byKey = new Map(current.map((entry) => [entry.logicalRefKey, entry]));
  for (const mapping of mappings) byKey.set(mapping.logicalRefKey, mapping);
  return Object.fromEntries([...byKey.entries()].sort(([left], [right]) => left.localeCompare(right, 'en')));
}

class MappingStateError extends Error {
  constructor(
    message: string,
    public readonly recoveryRequired: boolean,
    public readonly actorMutationAllowed: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MappingStateError';
  }
}

function buildResolverReviewModel(actor: any, manifest: PortableSpellManifest, preflight: HydrationPreflight): ResolverReviewModel {
  const projection = new Map(projectManagedContentWithConflicts(actor, manifest.manifestId).map((entry) => [entry.logicalRefKey, entry]));
  const refs = new Map(manifest.spellcastingGroups.flatMap((group) => group.spellRefs.map((ref) => [
    JSON.stringify([manifest.manifestId, group.groupId, ref.refId]), ref,
  ] as const)));
  const spells = preflight.report.results.map((result) => {
    const ref = refs.get(result.logicalRefKey);
    const candidates = result.status === 'resolved' ? [result.selected, ...(result.candidates ?? [])] : (result.candidates ?? result.suggestions);
    const current = projection.get(result.logicalRefKey);
    const keepability = current?.manualConflict ? inspectKeepability(actor, manifest.manifestId, result.logicalRefKey) : undefined;
    const currentDocuments = managedDocuments(actor, manifest.manifestId, result.logicalRefKey).map((entry) => ({
      kind: entry.kind,
      id: documentId(entry.value),
      source: documentSource(entry.value),
    }));
    const group = manifest.spellcastingGroups.find((entry) => entry.spellRefs.some((spellRef) => spellRef.refId === result.refId));
    const feature = group ? iterate(actor.items).find((item) => item?.flags?.[RESOLVER_MODULE_ID]?.groupId === group.groupId
      && item?.flags?.[RESOLVER_MODULE_ID]?.featureItemKey === group.featureItemKey) : undefined;
    const proposed = result.status === 'resolved' && group && ref && feature
      ? {
          activity: buildCastActivitySource({ manifestId: manifest.manifestId, featureId: documentId(feature), group, ref, selectedUuid: result.selected.uuid }).activity,
          cachedSpell: { operation: 'create-or-replace-native-cache', selectedUuid: result.selected.uuid },
        }
      : { activity: { status: 'blocked', reason: result.status }, cachedSpell: { status: 'blocked' } };
    return {
      logicalRefKey: result.logicalRefKey,
      refId: result.refId,
      originalName: ref?.originalName ?? result.refId,
      evidence: ref?.evidence ?? [],
      sourceEvidence: ref?.evidence ?? [],
      candidates: dedupeCandidates(candidates).map((candidate) => ({
        packageId: candidate.packageId, packId: candidate.packId, sourceBook: candidate.sourceBook,
        rules: candidate.rules, level: candidate.level, uuid: candidate.uuid,
      })),
      current: { projection: current ?? null, documents: currentDocuments },
      lastGeneratedProof: {
        contentAvailable: false,
        limitation: 'Task 7 stores a generated-content hash and ownership proof, not a duplicate prior content body.',
        documents: currentDocuments.map((entry) => ({
          kind: entry.kind, id: entry.id,
          generatedContentHash: (entry.source as any)?.flags?.[RESOLVER_MODULE_ID]?.generatedContentHash,
          resolverOwnership: (entry.source as any)?.flags?.[RESOLVER_MODULE_ID],
        })),
      },
      proposed,
      ...(current?.manualConflict ? { manualConflict: keepability } : {}),
      warnings: result.status === 'resolved' && result.origin === 'fallback-2014' ? ['2014 fallback is visible'] : [],
      literalRestrictions: (ref?.restrictions ?? []).map((restriction) => ({ kind: restriction.kind, text: restriction.text })),
      blocking: result.status !== 'resolved' || current?.manualConflict === true
        || preflight.report.findings.some((finding) => finding.blocking && (finding.path === result.logicalRefKey || finding.path.includes(result.refId))),
    };
  });
  const findingHash = sha256(canonicalStringify({ manifestHash: hashManifest(manifest), report: preflight.report }));
  return { manifestId: manifest.manifestId, findingHash, title: 'FVTTJSONSPELL.Review.Title', findings: preflight.report.findings, spells };
}

function projectManagedContentWithConflicts(actor: any, manifestId: string): ManagedSpellProjection[] {
  return projectCurrentManagedContent(actor, manifestId).map((entry) => ({
    ...entry,
    ...(hasManagedDrift(actor, manifestId, entry.logicalRefKey) ? { manualConflict: true } : {}),
  }));
}

function hasManagedDrift(actor: any, manifestId: string, logicalRefKey: string): boolean {
  for (const document of managedDocuments(actor, manifestId, logicalRefKey)) {
    const source = documentSource(document.value);
    const stored = document.value.flags?.[RESOLVER_MODULE_ID]?.generatedContentHash;
    if (typeof stored !== 'string' || stored !== computeManagedSourceHash(source)) return true;
  }
  return false;
}

function inspectKeepability(actor: any, manifestId: string, logicalRefKey: string): { keepable: boolean; explanation?: string } {
  try {
    const docs = managedDocuments(actor, manifestId, logicalRefKey);
    const activity = docs.filter((entry) => entry.kind === 'activity');
    const spell = docs.filter((entry) => entry.kind === 'spell');
    if (activity.length !== 1 || spell.length !== 1) throw new Error('Keep requires exactly one owned Cast Activity and one owned cached Spell.');
    const identity = activity[0]!.value.flags[RESOLVER_MODULE_ID];
    assertResolverDocumentOwnership(actor, activity[0]!.feature, activity[0]!.value, identity, 'activity');
    assertResolverDocumentOwnership(actor, activity[0]!.feature, spell[0]!.value, identity, 'spell', activity[0]!.value.relativeUUID);
    return { keepable: true };
  } catch (error) {
    return { keepable: false, explanation: errorMessage(error) };
  }
}

function hasStrictHydratedStructure(actor: any, manifest: PortableSpellManifest, resolution: any): boolean {
  const expectedKeys = manifest.spellcastingGroups.flatMap((group) => group.spellRefs.map((ref) =>
    JSON.stringify([manifest.manifestId, group.groupId, ref.refId]))).sort();
  const selections = Array.isArray(resolution?.report?.selections) ? resolution.report.selections : [];
  if (selections.length !== expectedKeys.length) return false;
  const selectionByKey = new Map<string, any>();
  for (const selection of selections) {
    if (!isRecord(selection) || typeof selection.logicalRefKey !== 'string' || typeof selection.selectedUuid !== 'string'
      || selectionByKey.has(selection.logicalRefKey)) return false;
    selectionByKey.set(selection.logicalRefKey, selection);
  }
  for (const logicalRefKey of expectedKeys) {
    const selection = selectionByKey.get(logicalRefKey);
    if (!selection) return false;
    const documents = managedDocuments(actor, manifest.manifestId, logicalRefKey);
    if (documents.length !== 2 || documents.some((entry) => entry.value.flags?.[RESOLVER_MODULE_ID]?.selectedUuid !== selection.selectedUuid)) return false;
    const keepability = inspectKeepability(actor, manifest.manifestId, logicalRefKey);
    if (!keepability.keepable || hasManagedDrift(actor, manifest.manifestId, logicalRefKey)) return false;
  }
  return true;
}

function sameResolvedSelections(results: HydrationPreflight['report']['results'], selections: unknown): boolean {
  if (!Array.isArray(selections) || results.length !== selections.length) return false;
  const byKey = new Map<string, any>();
  for (const selection of selections) {
    if (!isRecord(selection) || typeof selection.logicalRefKey !== 'string' || byKey.has(selection.logicalRefKey)) return false;
    byKey.set(selection.logicalRefKey, selection);
  }
  for (const result of results) {
    if (result.status !== 'resolved') return false;
    const committed = byKey.get(result.logicalRefKey);
    if (!committed || committed.selectedUuid !== result.selected.uuid || committed.rules !== result.selected.rules
      || committed.selectionOrigin !== result.origin) return false;
  }
  return true;
}

function managedDocuments(actor: any, manifestId: string, logicalRefKey?: string): Array<{ kind: 'activity' | 'spell'; value: any; feature?: any }> {
  const result: Array<{ kind: 'activity' | 'spell'; value: any; feature?: any }> = [];
  for (const item of iterate(actor?.items)) {
    for (const activity of iterateActivities(item)) {
      const flags = activity?.flags?.[RESOLVER_MODULE_ID];
      if (flags?.managed === true && flags.documentType === 'activity' && flags.manifestId === manifestId
        && (!logicalRefKey || flags.logicalRefKey === logicalRefKey)) result.push({ kind: 'activity', value: activity, feature: item });
    }
    const flags = item?.flags?.[RESOLVER_MODULE_ID];
    if (flags?.managed === true && flags.documentType === 'spell' && flags.manifestId === manifestId
      && (!logicalRefKey || flags.logicalRefKey === logicalRefKey)) result.push({ kind: 'spell', value: item });
  }
  return result;
}

async function writeStatus(actor: any, status: ResolverStatus, details: Record<string, unknown> = {}): Promise<void> {
  if (typeof actor?.update !== 'function') throw new Error('Actor public update API is unavailable.');
  await actor.update({ [`flags.${RESOLVER_MODULE_ID}.spellResolution`]: {
    ...(isRecord(actor.flags?.[RESOLVER_MODULE_ID]?.spellResolution) ? structuredClone(actor.flags[RESOLVER_MODULE_ID].spellResolution) : {}),
    status,
    ...details,
  } }, { [RESOLVER_MODULE_ID]: { owned: true } });
}

async function writeFailureStatus(actor: any, status: ResolverStatus, error: unknown): Promise<void> {
  try {
    await writeStatus(actor, status, {
      error: errorMessage(error),
      ...(error instanceof HydrationTransactionError ? { residualDifferences: error.residualDifferences } : {}),
    });
  } catch { /* keep the in-memory failure state if Actor permissions are gone */ }
}

interface UndoSnapshot {
  resolverFlags: unknown;
  itemIds: string[];
  activities: Array<{ featureId: string; source: Record<string, any> }>;
  spells: Array<Record<string, any>>;
}

export async function restoreLastHydration(actor: any): Promise<void> {
  if (!actor || typeof actor !== 'object') throw new TypeError('Undo requires a current Actor.');
  return withUndoMutex(actor, async () => {
    const validation = validatePortableSpellManifestStructure(actor?.flags?.[RESOLVER_MODULE_ID]?.spellManifest);
    if (!validation.ok) throw new Error('Undo requires a valid current resolver manifest.');
    const snapshot = actor.flags?.[RESOLVER_MODULE_ID]?.spellResolution?.undoSnapshot;
    if (!isUndoSnapshot(snapshot)) throw new Error('No valid last hydration snapshot is available.');
    validateUndoSnapshot(actor, validation.value, snapshot);
    const before = captureUndoSnapshot(actor, validation.value.manifestId, actor.flags?.[RESOLVER_MODULE_ID]);
    try {
      await restoreSnapshot(actor, validation.value.manifestId, snapshot);
    } catch (cause) {
      try {
        await restoreSnapshot(actor, validation.value.manifestId, before);
      } catch (rollbackCause) {
        const error = new UndoTransactionError(
          `Undo failed and compensation failed: ${errorMessage(cause)}; ${errorMessage(rollbackCause)}.`,
          true,
          { cause },
        );
        await writeFailureStatus(actor, 'failed-recovery-required', error);
        throw error;
      }
      const error = new UndoTransactionError(
        `Undo failed, but compensation restored the prior managed state: ${errorMessage(cause)}.`,
        false,
        { cause },
      );
      await writeFailureStatus(actor, 'failed', error);
      throw error;
    }
  });
}

export class UndoTransactionError extends Error {
  constructor(message: string, public readonly recoveryRequired: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UndoTransactionError';
  }
}

const undoLocks = new WeakMap<object, Promise<void>>();

async function withUndoMutex<T>(actor: object, operation: () => Promise<T>): Promise<T> {
  const prior = undoLocks.get(actor) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  undoLocks.set(actor, prior.catch(() => undefined).then(() => gate));
  await prior.catch(() => undefined);
  try { return await operation(); }
  finally { release(); }
}

function captureUndoSnapshot(actor: any, manifestId: string, resolverFlags: unknown): UndoSnapshot {
  const managed = managedDocuments(actor, manifestId);
  return {
    resolverFlags: structuredClone(resolverFlags),
    itemIds: iterate(actor.items).map(documentId).filter(Boolean).sort(),
    activities: managed.filter((entry) => entry.kind === 'activity').map((entry) => ({
      featureId: documentId(entry.feature), source: documentSource(entry.value),
    })),
    spells: managed.filter((entry) => entry.kind === 'spell').map((entry) => documentSource(entry.value)),
  };
}

async function restoreSnapshot(actor: any, manifestId: string, snapshot: UndoSnapshot): Promise<void> {
  const managed = managedDocuments(actor, manifestId);
  const activities = managed.filter((entry) => entry.kind === 'activity');
  for (const spell of managed.filter((entry) => entry.kind === 'spell')) {
    const flags = spell.value.flags[RESOLVER_MODULE_ID];
    const activity = activities.find((entry) => entry.value.flags?.[RESOLVER_MODULE_ID]?.logicalRefKey === flags.logicalRefKey
      && entry.value.flags?.[RESOLVER_MODULE_ID]?.activityId === flags.activityId);
    if (!activity) throw new Error(`Undo cannot prove owned Activity for cached Spell ${documentId(spell.value)}.`);
    assertResolverDocumentOwnership(actor, activity.feature, activity.value, flags, 'activity');
    assertResolverDocumentOwnership(actor, activity.feature, spell.value, flags, 'spell', activity.value.relativeUUID);
    await requireActorApi(actor, 'deleteEmbeddedDocuments')('Item', [documentId(spell.value)]);
  }
  for (const activity of activities) {
    const flags = activity.value.flags[RESOLVER_MODULE_ID];
    assertResolverDocumentOwnership(actor, activity.feature, activity.value, flags, 'activity');
    if (typeof activity.feature?.deleteActivity !== 'function') throw new Error('Undo requires feature.deleteActivity(id).');
    await activity.feature.deleteActivity(documentId(activity.value));
  }
  for (const saved of snapshot.activities) {
    const feature = findItem(actor, saved.featureId);
    if (!feature) throw new Error(`Undo snapshot feature ${saved.featureId} is missing.`);
    const beforeIds = new Set(iterate(actor.items).map(documentId));
    await requireActorApi(actor, 'updateEmbeddedDocuments')('Item', [{
      _id: saved.featureId, [`system.activities.${saved.source._id}`]: structuredClone(saved.source),
    }]);
    const preparedFeature = findItem(actor, saved.featureId);
    const activity = getActivity(preparedFeature, String(saved.source._id));
    const identity = readManagedIdentity(saved.source.flags?.[RESOLVER_MODULE_ID]);
    if (!activity || !identity) throw new Error('Undo restored Activity did not prepare with strict resolver ownership.');
    for (const cache of iterate(actor.items).filter((item) => !beforeIds.has(documentId(item))
      && item?.flags?.dnd5e?.cachedFor === activity.relativeUUID)) {
      assertAdoptableNativeCache(actor, preparedFeature, activity, cache, identity, beforeIds);
      await requireActorApi(actor, 'deleteEmbeddedDocuments')('Item', [documentId(cache)]);
    }
  }
  if (snapshot.spells.length) await requireActorApi(actor, 'createEmbeddedDocuments')('Item', structuredClone(snapshot.spells), { keepId: true });
  await requireActorApi(actor, 'update')({ [`flags.${RESOLVER_MODULE_ID}`]: structuredClone(snapshot.resolverFlags) }, { [RESOLVER_MODULE_ID]: { owned: true } });
  const after = captureUndoSnapshot(actor, manifestId, actor.flags?.[RESOLVER_MODULE_ID]);
  if (!sameManagedSnapshot(after, snapshot)) throw new Error('Undo snapshot restoration left residual differences.');
}

function isUndoSnapshot(value: unknown): value is UndoSnapshot {
  return isRecord(value) && Array.isArray(value.itemIds) && value.itemIds.every((entry) => typeof entry === 'string')
    && Array.isArray(value.activities) && value.activities.every((entry) => isRecord(entry) && typeof entry.featureId === 'string' && isRecord(entry.source))
    && Array.isArray(value.spells) && value.spells.every(isRecord) && 'resolverFlags' in value;
}

function validateUndoSnapshot(actor: any, manifest: PortableSpellManifest, snapshot: UndoSnapshot): void {
  const flags = snapshot.resolverFlags;
  if (!isRecord(flags)) throw new Error('Undo snapshot resolver flags are malformed.');
  const snapshotManifest = validatePortableSpellManifestStructure(flags.spellManifest);
  if (!snapshotManifest.ok || hashManifest(snapshotManifest.value) !== hashManifest(manifest)) {
    throw new Error('Undo snapshot manifest does not match the current Actor manifest.');
  }
  if (flags.spellResolution?.status === 'resolving') throw new Error('Undo snapshot cannot restore transient resolving status.');

  const activities = new Map<string, { featureId: string; source: Record<string, any>; identity: any }>();
  for (const entry of snapshot.activities) {
    const identity = validateSnapshotSource(entry.source, 'activity', manifest.manifestId);
    if (identity.featureId !== entry.featureId || String(entry.source._id) !== identity.activityId) {
      throw new Error('Undo snapshot Activity feature/document identity is inconsistent.');
    }
    const feature = findItem(actor, entry.featureId);
    if (!feature || feature.type !== 'feat' || feature.flags?.[RESOLVER_MODULE_ID]?.groupId !== identity.groupId) {
      throw new Error('Undo snapshot Activity linked feature ownership is unavailable.');
    }
    if (activities.has(identity.logicalRefKey)) throw new Error('Undo snapshot contains duplicate Activities for one logical ref.');
    activities.set(identity.logicalRefKey, { ...entry, identity });
  }
  const spells = new Set<string>();
  for (const source of snapshot.spells) {
    const identity = validateSnapshotSource(source, 'spell', manifest.manifestId);
    if (spells.has(identity.logicalRefKey)) throw new Error('Undo snapshot contains duplicate cached Spells for one logical ref.');
    const activity = activities.get(identity.logicalRefKey);
    if (!activity || canonicalStringify(activity.identity) !== canonicalStringify(identity)) {
      throw new Error('Undo snapshot cached Spell lacks its exact owned Activity pair.');
    }
    const expectedCachedFor = `.Item.${identity.featureId}.Activity.${identity.activityId}`;
    if (source.flags?.dnd5e?.cachedFor !== expectedCachedFor || source._stats?.compendiumSource !== identity.selectedUuid) {
      throw new Error('Undo snapshot cached Spell native provenance is inconsistent.');
    }
    spells.add(identity.logicalRefKey);
  }
  if (activities.size !== spells.size) throw new Error('Undo snapshot managed Activity/cache counts differ.');
  for (const { identity } of activities.values()) {
    const cachedFor = `.Item.${identity.featureId}.Activity.${identity.activityId}`;
    const foreign = iterate(actor.items).find((item) => item?.flags?.dnd5e?.cachedFor === cachedFor
      && item?.flags?.[RESOLVER_MODULE_ID]?.managed !== true);
    if (foreign) throw new Error(`Undo snapshot Activity is already claimed by an unowned or foreign cache: ${documentId(foreign)}.`);
  }
}

function validateSnapshotSource(source: Record<string, any>, type: 'activity' | 'spell', manifestId: string): ReturnType<typeof readManagedIdentity> & object {
  const flags = source.flags?.[RESOLVER_MODULE_ID];
  const identity = readManagedIdentity(flags);
  if (!identity || flags.managed !== true || flags.documentType !== type || identity.manifestId !== manifestId) {
    throw new Error(`Undo snapshot ${type} resolver ownership is malformed.`);
  }
  if (!/^[A-Za-z0-9]{16}$/.test(String(source._id)) || (type === 'activity' && source.type !== 'cast') || (type === 'spell' && source.type !== 'spell')) {
    throw new Error(`Undo snapshot ${type} document shape is invalid.`);
  }
  if (type === 'activity' && source.spell?.uuid !== identity.selectedUuid) throw new Error('Undo snapshot Activity selected UUID differs from ownership.');
  if (flags.generatedContentHash !== computeManagedSourceHash(source)) throw new Error(`Undo snapshot ${type} generated-content hash is invalid.`);
  return identity;
}

function readManagedIdentity(flags: any): any | undefined {
  if (!isRecord(flags)) return undefined;
  const identity = {
    manifestId: flags.manifestId, groupId: flags.groupId, refId: flags.refId, featureId: flags.featureId,
    logicalRefKey: flags.logicalRefKey, selectedUuid: flags.selectedUuid, activityId: flags.activityId,
  };
  if (!Object.values(identity).every((value) => typeof value === 'string' && value.length > 0)) return undefined;
  if (identity.logicalRefKey !== JSON.stringify([identity.manifestId, identity.groupId, identity.refId])) return undefined;
  if (!/^[A-Za-z0-9]{16}$/.test(identity.featureId) || !/^[A-Za-z0-9]{16}$/.test(identity.activityId)) return undefined;
  return identity;
}

function sameManagedSnapshot(actual: UndoSnapshot, expected: UndoSnapshot): boolean {
  const project = (snapshot: UndoSnapshot) => ({
    resolverFlags: snapshot.resolverFlags,
    activities: [...snapshot.activities].sort((left, right) => `${left.featureId}:${left.source._id}`.localeCompare(`${right.featureId}:${right.source._id}`, 'en')),
    spells: [...snapshot.spells].sort((left, right) => String(left._id).localeCompare(String(right._id), 'en')),
  });
  return canonicalStringify(project(actual)) === canonicalStringify(project(expected));
}

function getActivity(feature: any, id: string): any {
  const activities = feature?.system?.activities;
  if (activities && typeof activities.get === 'function') return activities.get(id);
  return activities?.[id];
}

export function createFoundryResolverHookController(): ResolverHookController {
  const adapter = createFoundryAdapter();
  const dependencies: ResolverActorServiceDependencies = {
    getRuntime: () => game?.modules?.get(RESOLVER_MODULE_ID)?.api as ResolverRuntimeApi | undefined,
    getSetting: (key) => game?.settings?.get(RESOLVER_MODULE_ID, key),
    setSetting: async (key, value) => { await game?.settings?.set(RESOLVER_MODULE_ID, key, value); },
    fetchSelectedDocument: (uuid) => fetchSelectedSpellDocument(adapter, uuid),
    execute: (actor, manifest, plan) => executeHydrationTransaction({ actor, manifest, plan }),
    openReview: (model) => openResolverReviewDialog(model),
    renderTemplate: async (templatePath, context) => {
      const renderTemplate = (globalThis as any).foundry?.applications?.handlebars?.renderTemplate;
      if (typeof renderTemplate !== 'function') throw new Error('Foundry 14 handlebars.renderTemplate is unavailable.');
      return renderTemplate(templatePath, context);
    },
    showDocument: async (title, html) => { await openReadOnlyDialog(title, html); },
    exportJson: (filename, value) => (globalThis as any).foundry?.utils?.saveDataToFile?.(JSON.stringify(value, null, 2), 'application/json', filename),
    notify: (level, message) => (globalThis as any).ui?.notifications?.[level]?.(message),
  };
  const service = createResolverActorService(dependencies);
  const coordinator = createResolverEventCoordinator({
    authority: () => ({ isGM: game?.user?.isGM === true, userId: (game?.user as any)?.id }),
    runtimeSupported: () => {
      const runtime = dependencies.getRuntime();
      return runtime?.compatibility.supported === true && runtime.canMutate === true;
    },
    isActive: (actor) => service.isActive(actor),
    isAlreadyApplied: (actor) => service.isAlreadyApplied(actor),
    schedule: (callback) => queueMicrotask(() => { void callback(); }),
    process: (actor) => service.processActor(actor),
  });
  return { onActorEvent: coordinator.onActorEvent, actions: service, isCurrentUserGM: () => game?.user?.isGM === true };
}

async function openReadOnlyDialog(title: string, html: string): Promise<void> {
  const dialog = (globalThis as any).foundry?.applications?.api?.DialogV2;
  if (!dialog?.wait) throw new Error('Foundry 14 DialogV2.wait is unavailable.');
  await dialog.wait({
    window: { title }, position: { width: 760, height: 'auto' }, content: html, rejectClose: false,
    buttons: [{ action: 'close', label: 'FVTTJSONSPELL.Action.Close', type: 'button' }],
  });
}

function renderReportHtml(value: unknown): string {
  return `<pre class="fvtt-json-generator-spell-resolver-scroll fvtt-json-generator-spell-resolver-break">${escapeHtml(JSON.stringify(value ?? {}, null, 2))}</pre>`;
}

async function renderReportDocument(dependencies: ResolverActorServiceDependencies, value: unknown): Promise<string> {
  return dependencies.renderTemplate(
    `modules/${RESOLVER_MODULE_ID}/templates/report.hbs`,
    { content: renderReportHtml(value) },
  );
}

function redactReport(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const clone = structuredClone(value);
  delete clone.undoSnapshot;
  return clone;
}

function dedupeCandidates<T extends { uuid: string }>(values: readonly T[]): T[] {
  return [...new Map(values.map((entry) => [entry.uuid, entry])).values()];
}

function documentSource(document: any): Record<string, any> {
  if (typeof document?.toObject === 'function') return document.toObject();
  const source: Record<string, any> = {};
  if (!isRecord(document)) return source;
  for (const [key, value] of Object.entries(document)) {
    if (['parent', 'actor', 'item', 'id', 'relativeUUID', 'cachedSpell'].includes(key) || typeof value === 'function') continue;
    source[key] = structuredClone(value);
  }
  return source;
}

function iterate(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value[Symbol.iterator] === 'function') return [...value];
  return [];
}

function iterateActivities(feature: any): any[] {
  const activities = feature?.system?.activities;
  if (activities instanceof Map) return [...activities.values()];
  if (activities && typeof activities.values === 'function') return [...activities.values()];
  return isRecord(activities) ? Object.values(activities) : [];
}

function findItem(actor: any, id: string): any {
  if (actor?.items && typeof actor.items.get === 'function') return actor.items.get(id);
  return iterate(actor?.items).find((item) => documentId(item) === id);
}

function requireActorApi(actor: any, key: string): Function {
  if (typeof actor?.[key] !== 'function') throw new Error(`Actor public ${key} API is unavailable.`);
  return actor[key].bind(actor);
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.replace(/[\r\n]+/g, ' ').slice(0, 1000) : String(error);
}

class SelectedSpellValidationError extends Error {
  constructor(public readonly logicalRefKey: string, message: string) { super(message); }
  override name = 'SelectedSpellValidationError';
}

function safeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 80);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
