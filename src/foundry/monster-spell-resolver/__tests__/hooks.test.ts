import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { hashManifest, logicalSpellRefKey, RESOLVER_MODULE_ID } from '../../../core/spell-resolution';
import { buildSpellResolverPackage } from '../../../../scripts/buildSpellResolver';
import {
  createResolverActorService,
  buildResolverReviewModel,
  createAuthorityGuardedActions,
  createResolverEventCoordinator,
  normalizeSavedMappings,
  registerResolverHooks,
  restoreLastHydration,
  selectResolverAuthority,
  type ResolverActorActions,
} from '../hooks';
import { RESOLVER_STATUS_VALUES, readResolverStatus } from '../status';
import { computeManagedSourceHash } from '../cast-activity';
import { createResolverReviewSession } from '../review-app';

const validManifest = {
  schemaVersion: 1 as const,
  manifestId: 'manifest-hooks',
  sourceSha256: 'a'.repeat(64),
  rulesPreference: '2024' as const,
  spellcastingGroups: [{
    groupId: 'innate', featureItemKey: 'spellcasting', spellRefs: [{
      refId: 'mage-armor', identifier: 'mage-armor', originalName: 'Mage Armor', aliases: [], method: 'at-will' as const,
      restrictions: [], evidence: [{ start: 0, end: 10, quote: 'Mage Armor' }],
    }],
  }],
};

function actor(id = 'actor-1') {
  return {
    id,
    documentName: 'Actor',
    flags: { [RESOLVER_MODULE_ID]: { spellManifest: structuredClone(validManifest), spellResolution: { status: 'pending' } } },
  };
}

describe('spell resolver status and safe event coordination', () => {
  test('exposes only the eight approved status values and derives transient resolving without writing', () => {
    expect(RESOLVER_STATUS_VALUES).toEqual([
      'pending', 'resolving', 'needs_review', 'hydrated', 'stale', 'incompatible', 'failed', 'failed-recovery-required',
    ]);
    const target = actor();
    expect(readResolverStatus(target)).toBe('pending');
    expect(readResolverStatus(target, { active: true })).toBe('resolving');
    expect(target.flags[RESOLVER_MODULE_ID].spellResolution.status).toBe('pending');
  });

  test('immediately ignores non-GM, wrong initiating client, unflagged, unsupported, active, and applied Actors', () => {
    const scheduled: Array<() => void> = [];
    const processed: unknown[] = [];
    const state = { isGM: true, userId: 'gm-1', supported: true, active: false, applied: false };
    const coordinator = createResolverEventCoordinator({
      authority: () => ({ isGM: state.isGM, userId: state.userId }),
      runtimeSupported: () => state.supported,
      isActive: () => state.active,
      isAlreadyApplied: () => state.applied,
      schedule: (callback) => scheduled.push(callback),
      process: async (target) => { processed.push(target); },
    });

    state.isGM = false;
    expect(coordinator.onActorEvent(actor(), { userId: 'gm-1' })).toBe('ignored');
    state.isGM = true;
    expect(coordinator.onActorEvent(actor(), { userId: 'other-gm', resolverOwned: true })).toBe('ignored');
    expect(coordinator.onActorEvent({ id: 'plain', documentName: 'Actor', flags: {} }, { userId: 'gm-1' })).toBe('ignored');
    state.supported = false;
    expect(coordinator.onActorEvent(actor(), { userId: 'gm-1' })).toBe('ignored');
    state.supported = true; state.active = true;
    expect(coordinator.onActorEvent(actor(), { userId: 'gm-1' })).toBe('ignored');
    state.active = false; state.applied = true;
    expect(coordinator.onActorEvent(actor(), { userId: 'gm-1' })).toBe('ignored');
    expect(scheduled).toHaveLength(0);
    expect(processed).toHaveLength(0);
  });

  test('coalesces create/update bursts per Actor and resolver-owned writes never recurse', async () => {
    const scheduled: Array<() => void> = [];
    const processed: string[] = [];
    let active = false;
    const coordinator = createResolverEventCoordinator({
      authority: () => ({ isGM: true, userId: 'gm' }), runtimeSupported: () => true,
      isActive: () => active, isAlreadyApplied: () => false,
      schedule: (callback) => scheduled.push(callback),
      process: async (target) => {
        active = true;
        processed.push(target.id);
        expect(coordinator.onActorEvent(target, { userId: 'gm', resolverOwned: true })).toBe('ignored');
        active = false;
      },
    });
    const target = actor();
    expect(coordinator.onActorEvent(target, { userId: 'gm' })).toBe('scheduled');
    expect(coordinator.onActorEvent(target, { userId: 'gm' })).toBe('coalesced');
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    expect(processed).toEqual(['actor-1']);
  });

  test('normalizes the Object-backed savedMappings setting and fails closed on malformed entries', () => {
    const mapping = {
      logicalRefKey: 'manifest-hooks/innate/mage-armor', selectedUuid: 'Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa',
      rules: '2024' as const, sourceInventoryHash: 'b'.repeat(64), candidateMetadataHash: 'c'.repeat(64),
      resolutionConfigHash: 'd'.repeat(64), selectionOrigin: 'manual-review' as const,
    };
    expect(normalizeSavedMappings({})).toEqual([]);
    expect(normalizeSavedMappings({ [mapping.logicalRefKey]: mapping })).toEqual([mapping]);
    expect(() => normalizeSavedMappings({ wrong: mapping })).toThrow(/savedMappings/i);
    expect(() => normalizeSavedMappings({ [mapping.logicalRefKey]: { ...mapping, selectedUuid: 'bad' } })).toThrow(/savedMappings/i);
  });
});

describe('Actor-level resolve pipeline', () => {
  function serviceFixture(overrides: Record<string, any> = {}) {
    const target = actor() as any;
    target.items = [];
    target.updateCalls = [];
    target.update = async (changes: Record<string, any>) => {
      target.updateCalls.push(structuredClone(changes));
      const resolution = changes[`flags.${RESOLVER_MODULE_ID}.spellResolution`];
      if (resolution) target.flags[RESOLVER_MODULE_ID].spellResolution = structuredClone(resolution);
    };
    const candidate = {
      id: 'abcdefghijklmnop', uuid: 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop', packageId: 'dnd5e', packId: 'spells24',
      name: 'Mage Armor', identifier: 'mage-armor', rules: '2024', sourceBook: 'PHB', level: 1, school: 'abj',
    };
    const calls = { execute: [] as any[], fetch: [] as string[], review: 0, saved: [] as any[], notifications: [] as any[], templates: [] as any[] };
    const settings: Record<string, any> = { sourcePriority: [{ packageId: 'dnd5e', packId: 'spells24' }], savedMappings: {} };
    const dependencies: any = {
      getRuntime: () => ({
        moduleId: RESOLVER_MODULE_ID, compatibility: { supported: true, foundry: '14.364', dnd5e: '5.3.3', diagnostics: [] },
        canMutate: true, diagnostics: [], sourceIndex: {
          candidates: [candidate], sourcePackages: [{ packageId: 'dnd5e', version: '5.3.3' }], diagnostics: [],
          candidateMetadataHash: 'b'.repeat(64), sourceInventoryHash: 'c'.repeat(64),
        },
      }),
      getSetting: (key: string) => settings[key],
      setSetting: async (key: string, value: unknown) => { settings[key] = value; calls.saved.push(value); },
      fetchSelectedDocument: async (uuid: string) => {
        calls.fetch.push(uuid);
        return {
          documentName: 'Item', type: 'spell', uuid, name: 'Mage Armor',
          system: { identifier: 'mage-armor', source: { rules: '2024', book: 'PHB' }, level: 1, school: 'abj' },
        };
      },
      execute: async (...args: any[]) => { calls.execute.push(args); },
      openReview: async () => { calls.review++; return { action: 'cancel' }; },
      renderTemplate: async (templatePath: string, context: any) => {
        calls.templates.push([templatePath, structuredClone(context)]);
        return `<template-shell>${context.content}</template-shell>`;
      },
      showDocument: async () => {}, exportJson: () => {},
      notify: (...args: any[]) => calls.notifications.push(args),
      ...overrides,
    };
    return { target, calls, settings, dependencies, service: createResolverActorService(dependencies) };
  }

  async function installHydratedPair(fixture: ReturnType<typeof serviceFixture>, protect = false) {
    await fixture.service.processActor(fixture.target, { explicit: true });
    const plan = fixture.calls.execute[0]![2];
    const selection = plan.selections[0];
    const target = fixture.target;
    target.id = 'ACTOR00000000001';
    target.type = 'npc';
    const feature: any = {
      id: 'FEAT000000000001', _id: 'FEAT000000000001', type: 'feat', parent: target, actor: target,
      flags: { [RESOLVER_MODULE_ID]: { groupId: 'innate', featureItemKey: 'spellcasting' } },
      system: { activities: new Map() },
    };
    const identity = {
      manifestId: validManifest.manifestId, groupId: 'innate', refId: 'mage-armor', featureId: feature.id,
      logicalRefKey: selection.logicalRefKey, selectedUuid: selection.uuid, activityId: 'ACTV000000000001',
      ...(protect ? { protected: true } : {}),
    };
    const relativeUUID = `Actor.${target.id}.Item.${feature.id}.Activity.${identity.activityId}`;
    const activity: any = {
      id: identity.activityId, _id: identity.activityId, type: 'cast', actor: target, item: feature, relativeUUID,
      spell: { uuid: selection.uuid }, flags: { [RESOLVER_MODULE_ID]: { managed: true, documentType: 'activity', ...identity } },
      toObject() { return { _id: this.id, type: this.type, spell: structuredClone(this.spell), flags: structuredClone(this.flags) }; },
    };
    activity.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(activity.toObject());
    const spell: any = {
      id: 'SPEL000000000001', _id: 'SPEL000000000001', type: 'spell', parent: target, actor: target,
      flags: { dnd5e: { cachedFor: relativeUUID }, [RESOLVER_MODULE_ID]: { managed: true, documentType: 'spell', ...identity } },
      _stats: { compendiumSource: selection.uuid },
      toObject() { return { _id: this.id, type: this.type, flags: structuredClone(this.flags), _stats: structuredClone(this._stats) }; },
    };
    spell.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(spell.toObject());
    feature.system.activities.set(activity.id, activity);
    target.items = [feature, spell];
    target.flags[RESOLVER_MODULE_ID].spellResolution = {
      status: 'hydrated', planHash: plan.planHash, manifestHash: hashManifest(validManifest),
      resolutionConfigHash: plan.resolutionConfigHash,
      report: {
        sourceInventoryHash: plan.sourceInventoryHash, candidateMetadataHash: plan.candidateMetadataHash,
        selections: [{
          logicalRefKey: selection.logicalRefKey, selectedUuid: selection.uuid, rules: selection.rules,
          selectionOrigin: selection.selectionOrigin,
          ...(protect ? { manualDecision: 'keep', protected: true } : {}),
        }],
      },
    };
    const runtime = fixture.dependencies.getRuntime();
    runtime.sourceIndex.sourceInventoryHash = plan.sourceInventoryHash;
    runtime.sourceIndex.candidateMetadataHash = plan.candidateMetadataHash;
    fixture.dependencies.getRuntime = () => runtime;
    fixture.calls.execute.length = 0;
    fixture.calls.review = 0;
    target.updateCalls.length = 0;
    return { target, feature, activity, spell, logicalRefKey: selection.logicalRefKey };
  }

  test('pending Actor validates every selected full Spell before one transaction and never persists resolving', async () => {
    const { target, calls, service } = serviceFixture();
    expect(service.status(target)).toBe('pending');
    expect(service.isAlreadyApplied(target)).toBe(false);
    await service.processActor(target);
    expect(calls.fetch).toEqual(['Compendium.dnd5e.spells24.Item.abcdefghijklmnop']);
    expect(calls.execute).toHaveLength(1);
    expect(target.updateCalls).toEqual([]);
    expect(target.flags[RESOLVER_MODULE_ID].spellResolution.status).toBe('pending');
    expect(calls.review).toBe(0);
    expect(calls.notifications).toContainEqual(['info', 'FVTTJSONSPELL.Notification.HydrationComplete (1)']);
  });

  test.each([
    ['deleted pair', ({ target, feature }: any) => { feature.system.activities.clear(); target.items = [feature]; }],
    ['missing Activity half', ({ feature }: any) => { feature.system.activities.clear(); }],
    ['missing cached Spell half', ({ target, spell }: any) => { target.items = target.items.filter((item: any) => item !== spell); }],
    ['duplicate cached Spell', ({ target, spell }: any) => {
      const duplicate = {
        ...spell, id: 'SPEL000000000002', _id: 'SPEL000000000002',
        flags: structuredClone(spell.flags), _stats: structuredClone(spell._stats),
        toObject() { return { _id: this.id, type: this.type, flags: structuredClone(this.flags), _stats: structuredClone(this._stats) }; },
      } as any;
      duplicate.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(duplicate.toObject());
      target.items.push(duplicate);
    }],
    ['duplicate Cast Activity', ({ feature, activity }: any) => {
      const duplicate = {
        ...activity, id: 'ACTV000000000002', _id: 'ACTV000000000002', flags: structuredClone(activity.flags),
        toObject() { return { _id: this.id, type: this.type, spell: structuredClone(this.spell), flags: structuredClone(this.flags) }; },
      } as any;
      duplicate.flags[RESOLVER_MODULE_ID].activityId = duplicate.id;
      duplicate.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(duplicate.toObject());
      feature.system.activities.set(duplicate.id, duplicate);
    }],
    ['mis-parented Activity', ({ activity }: any) => { activity.item = { id: 'FOREIGNFEATURE001' }; }],
    ['invalid ownership identity', ({ spell }: any) => {
      spell.flags[RESOLVER_MODULE_ID].featureId = 'OTHERFEATURE0001';
      spell.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(spell.toObject());
    }],
    ['stale resolution with deleted pair', ({ target, feature }: any) => {
      target.flags[RESOLVER_MODULE_ID].spellResolution.status = 'stale';
      feature.system.activities.clear();
      target.items = [feature];
    }],
  ] as const)('persisted %s becomes one blocking manual review and is never silently rebuilt', async (_label, mutate) => {
    let reviewModel: any;
    const fixture = serviceFixture();
    fixture.dependencies.openReview = async (model: any) => {
      reviewModel = model;
      fixture.calls.review++;
      return { action: 'cancel' };
    };
    const state = await installHydratedPair(fixture);
    expect(fixture.service.isAlreadyApplied(fixture.target)).toBe(true);
    mutate(state);

    expect(fixture.service.isAlreadyApplied(fixture.target)).toBe(false);
    expect(fixture.service.status(fixture.target)).toBe('needs_review');
    await fixture.service.processActor(fixture.target);
    expect(fixture.calls.review).toBe(1);
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.service.status(fixture.target)).toBe('needs_review');
    expect(fixture.target.updateCalls).toEqual([]);
    expect(reviewModel.spells[0]).toMatchObject({
      logicalRefKey: state.logicalRefKey,
      manualConflict: { keepable: false, explanation: expect.any(String) },
      candidateDecisionRequired: false,
      blocking: true,
    });
    const session = createResolverReviewSession(reviewModel);
    expect(() => session.decideManual(state.logicalRefKey, 'keep')).toThrow(/cannot be kept/i);
    session.decideManual(state.logicalRefKey, 'overwrite');
    expect(session.canApply()).toBe(true);

    await fixture.service.processActor(fixture.target);
    expect(fixture.calls.review).toBe(1);
    expect(fixture.calls.execute).toHaveLength(0);
  });

  test('eligible Actor reports incompatible on an unsupported runtime without writing', () => {
    const fixture = serviceFixture({ getRuntime: () => ({ compatibility: { supported: false }, canMutate: false, diagnostics: [] }) });
    expect(fixture.service.status(fixture.target)).toBe('incompatible');
    expect(fixture.target.updateCalls).toEqual([]);
  });

  test.each(['sourceInventoryHash', 'candidateMetadataHash'] as const)(
    'derives stale immediately when current %s changes without an Actor event',
    async (changedHash) => {
      const fixture = serviceFixture();
      await installHydratedPair(fixture);
      const runtime = fixture.dependencies.getRuntime();
      expect(fixture.service.status(fixture.target)).toBe('hydrated');
      runtime.sourceIndex[changedHash] = 'd'.repeat(64);
      fixture.dependencies.getRuntime = () => runtime;
      expect(fixture.service.status(fixture.target)).toBe('stale');
      expect(fixture.target.updateCalls).toEqual([]);
    },
  );

  test('source-index blockers derive actionable status and explicit resolve remains read-only', async () => {
    const fixture = serviceFixture({
      getRuntime: () => ({
        compatibility: { supported: true }, canMutate: false,
        diagnostics: [{ code: 'SOURCE_INDEX_FAILED', message: 'Index unavailable', blocking: true }],
        sourceIndex: undefined,
      }),
    });
    expect(fixture.service.status(fixture.target)).toBe('needs_review');
    fixture.target.flags[RESOLVER_MODULE_ID].spellResolution.status = 'hydrated';
    expect(fixture.service.status(fixture.target)).toBe('stale');
    fixture.target.flags[RESOLVER_MODULE_ID].spellResolution.status = 'failed-recovery-required';
    expect(fixture.service.status(fixture.target)).toBe('failed-recovery-required');
    fixture.target.flags[RESOLVER_MODULE_ID].spellResolution.status = 'pending';

    const before = structuredClone(fixture.target.flags);
    await fixture.service.resolve(fixture.target);
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.target.updateCalls).toEqual([]);
    expect(fixture.target.flags).toEqual(before);
    expect(fixture.calls.notifications).toContainEqual([
      'warn', 'FVTTJSONSPELL.Notification.SourceIndexBlocked',
    ]);
  });

  test('flagged invalid manifest stays diagnosable but can never hydrate', async () => {
    let reportHtml = '';
    let exported: any;
    const fixture = serviceFixture({
      showDocument: async (_title: string, html: string) => { reportHtml = html; },
      exportJson: (_filename: string, value: unknown) => { exported = value; },
    });
    fixture.target.flags[RESOLVER_MODULE_ID].spellManifest = {
      ...structuredClone(validManifest), schemaVersion: 99,
    };
    expect(fixture.service.status(fixture.target)).toBe('incompatible');

    const before = structuredClone(fixture.target.flags);
    await fixture.service.resolve(fixture.target);
    await fixture.service.viewReport(fixture.target);
    await fixture.service.exportDiagnostics(fixture.target);
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.target.updateCalls).toEqual([]);
    expect(fixture.target.flags).toEqual(before);
    expect(fixture.calls.notifications).toContainEqual([
      'warn', 'FVTTJSONSPELL.Notification.InvalidManifest',
    ]);
    expect(reportHtml).toContain('incompatible');
    expect(reportHtml).toContain('UNSUPPORTED_SCHEMA_VERSION');
    expect(exported).toMatchObject({
      status: 'incompatible',
      manifestValidation: { ok: false },
    });
    expect(exported.manifestValidation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNSUPPORTED_SCHEMA_VERSION' }),
    ]));
  });

  test('diagnostic export redacts premium residual bodies while retaining recovery provenance', async () => {
    let exported: any;
    const fixture = serviceFixture({ exportJson: (_filename: string, value: unknown) => { exported = value; } });
    const sentinel = 'PREMIUM-DESCRIPTION-MUST-NOT-LEAVE-THE-WORLD';
    fixture.target.flags[RESOLVER_MODULE_ID].spellResolution = {
      status: 'failed-recovery-required',
      undoSnapshot: { premium: sentinel },
      residualDifferences: [{
        path: '/managed/spells/SPEL000000000001/system/description/value',
        before: {
          _id: 'SPEL000000000001', type: 'spell', system: { description: { value: sentinel } },
          _stats: { compendiumSource: 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop' },
          flags: { [RESOLVER_MODULE_ID]: { managed: true, documentType: 'spell', selectedUuid: 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop' } },
        },
        after: sentinel,
      }],
    };
    await fixture.service.exportDiagnostics(fixture.target);
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain('undoSnapshot');
    expect(exported.spellResolution.residualDifferences[0]).toMatchObject({
      path: '/managed/spells/SPEL000000000001/system/description/value',
      before: { contentHash: expect.any(String), metadata: expect.objectContaining({
        '/_id': 'SPEL000000000001',
        '/_stats/compendiumSource': 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop',
      }) },
      after: { contentHash: expect.any(String) },
    });
  });

  test('a Task 7 commit is the only Actor write; Task 8 never patches resolution metadata afterward', async () => {
    const fixture = serviceFixture();
    fixture.dependencies.execute = async (target: any, _manifest: unknown, plan: any) => {
      fixture.calls.execute.push([target, _manifest, plan]);
      await target.update({ [`flags.${RESOLVER_MODULE_ID}.spellResolution`]: {
        status: 'hydrated', manifestHash: hashManifest(validManifest), planHash: plan.planHash,
        report: {
          sourceInventoryHash: plan.sourceInventoryHash,
          candidateMetadataHash: plan.candidateMetadataHash,
          selections: plan.selections.map((entry: any) => ({ logicalRefKey: entry.logicalRefKey, selectedUuid: entry.uuid })),
        },
      } });
    };
    const service = createResolverActorService(fixture.dependencies);
    await service.processActor(fixture.target);
    expect(fixture.calls.execute).toHaveLength(1);
    expect(fixture.target.updateCalls).toHaveLength(1);
    expect(fixture.target.flags[RESOLVER_MODULE_ID].spellResolution.resolutionConfigHash).toBeUndefined();
  });

  test('affected source-priority change stays read-only on an unrelated Actor event; explicit Resolve may apply', async () => {
    const fixture = serviceFixture();
    const runtime = fixture.dependencies.getRuntime();
    const alternate = {
      ...runtime.sourceIndex.candidates[0],
      id: 'qrstuvwxyzabcdef', uuid: 'Compendium.other.spells24.Item.qrstuvwxyzabcdef', packageId: 'other',
    };
    runtime.sourceIndex.candidates.push(alternate);
    fixture.dependencies.getRuntime = () => runtime;
    const hydrated = await installHydratedPair(fixture);
    const service = fixture.service;
    expect(fixture.target.flags[RESOLVER_MODULE_ID].spellResolution.report.selections[0].selectedUuid).toContain('dnd5e.spells24');
    expect(service.isAlreadyApplied(hydrated.target)).toBe(true);

    fixture.settings.sourcePriority = [{ packageId: 'unrelated' }, { packageId: 'dnd5e', packId: 'spells24' }, { packageId: 'other', packId: 'spells24' }];
    await service.processActor(fixture.target);
    expect(fixture.calls.execute).toHaveLength(0);
    expect(service.status(fixture.target)).toBe('hydrated');

    fixture.settings.sourcePriority = [{ packageId: 'other', packId: 'spells24' }, { packageId: 'dnd5e', packId: 'spells24' }];
    await service.processActor(fixture.target);
    expect(fixture.calls.execute).toHaveLength(0);
    expect(service.status(fixture.target)).toBe('stale');
    expect(fixture.target.updateCalls).toEqual([]);

    await service.processActor(fixture.target, { explicit: true });
    expect(fixture.calls.execute).toHaveLength(1);
    expect(fixture.calls.execute[0][2].selections[0].uuid).toBe(alternate.uuid);
  });

  test('protected Keep stays hydrated and quiet on ordinary events but explicit Resolve requires review again', async () => {
    const fixture = serviceFixture();
    await fixture.service.processActor(fixture.target, { explicit: true });
    const plan = fixture.calls.execute[0]![2];
    const runtime = fixture.dependencies.getRuntime();
    runtime.sourceIndex.candidateMetadataHash = plan.candidateMetadataHash;
    fixture.dependencies.getRuntime = () => runtime;
    const logicalRefKey = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
    const selectedUuid = plan.selections[0].uuid;
    fixture.target.id = 'ACTORPROTECTED01';
    fixture.target.type = 'npc';
    const feature: any = {
      id: 'FEAT0PROTECTED01', type: 'feat', parent: fixture.target, actor: fixture.target,
      flags: { [RESOLVER_MODULE_ID]: { groupId: 'innate', featureItemKey: 'spellcasting' } },
      system: { activities: new Map() },
    };
    const identity = {
      manifestId: validManifest.manifestId, groupId: 'innate', refId: 'mage-armor', featureId: feature.id,
      logicalRefKey, selectedUuid, activityId: 'ACTV0PROTECTED01', protected: true,
    };
    const relativeUUID = `Actor.${fixture.target.id}.Item.${feature.id}.Activity.${identity.activityId}`;
    const activity: any = {
      id: identity.activityId, _id: identity.activityId, type: 'cast', actor: fixture.target, item: feature, relativeUUID,
      spell: { uuid: selectedUuid }, flags: { [RESOLVER_MODULE_ID]: { managed: true, documentType: 'activity', ...identity } },
      toObject() { return { _id: this.id, type: this.type, spell: structuredClone(this.spell), flags: structuredClone(this.flags) }; },
    };
    activity.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(activity.toObject());
    const spell: any = {
      id: 'SPEL0PROTECTED01', _id: 'SPEL0PROTECTED01', type: 'spell', parent: fixture.target, actor: fixture.target,
      flags: { dnd5e: { cachedFor: relativeUUID }, [RESOLVER_MODULE_ID]: { managed: true, documentType: 'spell', ...identity } },
      _stats: { compendiumSource: selectedUuid },
      toObject() { return { _id: this.id, type: this.type, flags: structuredClone(this.flags), _stats: structuredClone(this._stats) }; },
    };
    spell.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(spell.toObject());
    feature.system.activities.set(activity.id, activity);
    fixture.target.items = [feature, spell];
    fixture.target.flags[RESOLVER_MODULE_ID].spellResolution = {
      status: 'hydrated', planHash: plan.planHash, manifestHash: hashManifest(validManifest),
      resolutionConfigHash: plan.resolutionConfigHash,
      report: {
        sourceInventoryHash: plan.sourceInventoryHash, candidateMetadataHash: plan.candidateMetadataHash,
        selections: plan.selections.map((entry: any) => ({
          logicalRefKey: entry.logicalRefKey, selectedUuid: entry.uuid, rules: entry.rules,
          selectionOrigin: entry.selectionOrigin, manualDecision: 'keep', protected: true,
        })),
      },
    };
    fixture.calls.execute.length = 0;
    const before = structuredClone(fixture.target.flags);

    expect(fixture.service.status(fixture.target)).toBe('hydrated');
    await fixture.service.processActor(fixture.target);
    expect(fixture.calls.review).toBe(0);
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.target.updateCalls).toEqual([]);

    let reviewModel: any;
    fixture.dependencies.openReview = async (model: any) => { reviewModel = model; fixture.calls.review++; return { action: 'cancel' }; };
    await fixture.service.resolve(fixture.target);
    expect(fixture.calls.review).toBe(1);
    expect(reviewModel.spells[0].manualConflict).toMatchObject({ keepable: true });
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.target.flags).toEqual(before);
    expect(fixture.target.updateCalls).toEqual([]);
  });

  test('Cancel and repeated identical finding hash open once and mutate no Actor state', async () => {
    const fixture = serviceFixture();
    const runtime = fixture.dependencies.getRuntime();
    runtime.sourceIndex.candidates = [];
    fixture.dependencies.getRuntime = () => runtime;
    const service = createResolverActorService(fixture.dependencies);
    const before = structuredClone(fixture.target.flags);
    await service.processActor(fixture.target);
    await service.processActor(fixture.target);
    expect(fixture.calls.review).toBe(1);
    expect(fixture.target.flags).toEqual(before);
    expect(fixture.target.updateCalls).toEqual([]);
  });

  test('invalid fetched selection becomes read-only needs_review and never starts or writes a transaction', async () => {
    let reviewModel: any;
    const { target, calls, dependencies } = serviceFixture({
      fetchSelectedDocument: async () => ({ documentName: 'Item', type: 'feat' }),
      openReview: async (model: any) => { reviewModel = model; calls.review++; return { action: 'cancel' }; },
    });
    const service = createResolverActorService(dependencies);
    const before = structuredClone(target.flags);
    await service.processActor(target);
    expect(service.status(target)).toBe('needs_review');
    expect(calls.execute).toHaveLength(0);
    expect(calls.review).toBe(1);
    expect(target.flags).toEqual(before);
    expect(target.updateCalls).toEqual([]);
    expect(reviewModel.spells[0]).toMatchObject({
      candidateDecisionRequired: false,
      candidates: [],
      warnings: ['FVTTJSONSPELL.Review.RebuildIndex'],
      blocking: true,
    });
  });

  test('GM can promote an indexed approximate suggestion through manual review to a ready transaction', async () => {
    const fixture = serviceFixture();
    const runtime = fixture.dependencies.getRuntime();
    const near = {
      ...runtime.sourceIndex.candidates[0], identifier: 'mage-armour', name: 'Mage Armour',
    };
    runtime.sourceIndex.candidates = [near];
    fixture.dependencies.getRuntime = () => runtime;
    fixture.dependencies.fetchSelectedDocument = async (uuid: string) => ({
      documentName: 'Item', type: 'spell', uuid, name: near.name,
      system: { identifier: near.identifier, source: { rules: near.rules, book: near.sourceBook }, level: near.level, school: near.school },
    });
    const logicalRefKey = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
    fixture.dependencies.openReview = async () => {
      fixture.calls.review++;
      return { action: 'apply', manualDecisions: [], candidateSelections: [{ logicalRefKey, selectedUuid: near.uuid }] };
    };
    const service = createResolverActorService(fixture.dependencies);

    await service.processActor(fixture.target, { explicit: true });
    expect(fixture.calls.review).toBe(1);
    expect(fixture.calls.execute).toHaveLength(1);
    expect(fixture.calls.execute[0]![2].selections[0]).toMatchObject({
      uuid: near.uuid, selectionOrigin: 'manual-review', rules: '2024',
    });
    expect(fixture.settings.savedMappings[logicalRefKey]).toMatchObject({
      selectedUuid: near.uuid, selectionOrigin: 'manual-review',
    });
  });

  test('reviewed approximate selection still fails closed when the fetched full Spell differs from indexed metadata', async () => {
    const fixture = serviceFixture();
    const runtime = fixture.dependencies.getRuntime();
    const near = {
      ...runtime.sourceIndex.candidates[0], identifier: 'mage-armour', name: 'Mage Armour',
    };
    runtime.sourceIndex.candidates = [near];
    fixture.dependencies.getRuntime = () => runtime;
    fixture.dependencies.fetchSelectedDocument = async (uuid: string) => ({
      documentName: 'Item', type: 'spell', uuid, name: 'Tampered Premium Name',
      system: { identifier: near.identifier, source: { rules: near.rules, book: near.sourceBook }, level: near.level, school: near.school },
    });
    const logicalRefKey = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
    fixture.dependencies.openReview = async () => {
      fixture.calls.review++;
      return { action: 'apply', manualDecisions: [], candidateSelections: [{ logicalRefKey, selectedUuid: near.uuid }] };
    };

    await createResolverActorService(fixture.dependencies).processActor(fixture.target, { explicit: true });
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.target.updateCalls).toEqual([]);
    expect(fixture.calls.notifications.flat().join(' ')).toContain('name changed after indexing');
  });

  test('same-UUID full Spell metadata drift is needs_review before any transaction', async () => {
    const fixture = serviceFixture({
      fetchSelectedDocument: async (uuid: string) => ({
        documentName: 'Item', type: 'spell', uuid, name: 'Fireball',
        system: { identifier: 'fireball', source: { rules: '2014', book: 'PHB 2014' }, level: 3, school: 'evo' },
      }),
    });
    const before = structuredClone(fixture.target.flags);
    const service = createResolverActorService(fixture.dependencies);
    await service.processActor(fixture.target);
    expect(service.status(fixture.target)).toBe('needs_review');
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.target.updateCalls).toEqual([]);
    expect(fixture.target.flags).toEqual(before);
  });

  test.each([
    ['name', (document: any) => { document.name = 'Shield'; }],
    ['identifier', (document: any) => { document.system.identifier = 'shield'; }],
    ['rules', (document: any) => { document.system.source.rules = '2014'; }],
    ['source book', (document: any) => { document.system.source.book = 'XGE'; }],
    ['level', (document: any) => { document.system.level = 2; }],
    ['school', (document: any) => { document.system.school = 'evo'; }],
  ] as const)('rejects same-UUID full Spell %s drift against indexed facts', async (_label, mutate) => {
    const fixture = serviceFixture({
      fetchSelectedDocument: async (uuid: string) => {
        const document = {
          documentName: 'Item', type: 'spell', uuid, name: 'Mage Armor',
          system: { identifier: 'mage-armor', source: { rules: '2024', book: 'PHB' }, level: 1, school: 'abj' },
        };
        mutate(document);
        return document;
      },
    });
    const service = createResolverActorService(fixture.dependencies);
    await service.processActor(fixture.target);
    expect(service.status(fixture.target)).toBe('needs_review');
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.target.updateCalls).toEqual([]);
  });

  test('validates fetched Spell facts against raw source data when dnd5e prepared data derives a source book', async () => {
    const fixture = serviceFixture();
    const runtime = fixture.dependencies.getRuntime();
    delete runtime.sourceIndex.candidates[0].sourceBook;
    fixture.dependencies.getRuntime = () => runtime;
    fixture.dependencies.fetchSelectedDocument = async (uuid: string) => ({
      documentName: 'Item', type: 'spell', uuid, name: 'Mage Armor',
      system: {
        identifier: 'mage-armor', source: { rules: '2024', book: 'SRD 5.2' }, level: 1, school: 'abj',
      },
      toObject: () => ({
        name: 'Mage Armor', type: 'spell',
        system: {
          identifier: 'mage-armor', source: { rules: '2024', book: '' }, level: 1, school: 'abj',
        },
      }),
    });

    await createResolverActorService(fixture.dependencies).processActor(fixture.target);

    expect(fixture.calls.execute).toHaveLength(1);
    expect(fixture.calls.review).toBe(0);
    expect(fixture.calls.notifications.flat().join(' ')).not.toContain('changed after indexing');
  });

  test('requires exact selected document UUID and fails closed on malformed sourcePriority', async () => {
    const missingUuid = serviceFixture({ fetchSelectedDocument: async () => ({ documentName: 'Item', type: 'spell' }) });
    const service = createResolverActorService(missingUuid.dependencies);
    await service.processActor(missingUuid.target);
    expect(service.status(missingUuid.target)).toBe('needs_review');
    expect(missingUuid.calls.execute).toHaveLength(0);
    expect(missingUuid.target.updateCalls).toEqual([]);

    const malformed = serviceFixture();
    malformed.settings.sourcePriority = { packageId: 'dnd5e' };
    await malformed.service.processActor(malformed.target);
    expect(malformed.service.status(malformed.target)).toBe('incompatible');
    expect(malformed.calls.execute).toHaveLength(0);
    expect(malformed.target.updateCalls).toEqual([]);
  });

  test('already-applied requires exact current config and one strict Activity/cache pair per stored selection', async () => {
    const fixture = serviceFixture();
    const target = fixture.target;
    target.id = 'ACTOR00000000001';
    target.type = 'npc';
    const logicalRefKey = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
    const selectedUuid = 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop';
    const identity = {
      manifestId: validManifest.manifestId, groupId: 'innate', refId: 'mage-armor', featureId: 'FEAT000000000001',
      logicalRefKey, selectedUuid, activityId: 'ACTV000000000001',
    };
    const feature: any = {
      id: identity.featureId, type: 'feat', parent: target, actor: target,
      flags: { [RESOLVER_MODULE_ID]: { groupId: 'innate', featureItemKey: 'spellcasting' } },
      system: { activities: new Map() },
    };
    const relativeUUID = `Actor.${target.id}.Item.${feature.id}.Activity.${identity.activityId}`;
    const activity: any = {
      id: identity.activityId, _id: identity.activityId, type: 'cast', actor: target, item: feature, relativeUUID,
      spell: { uuid: selectedUuid }, flags: { [RESOLVER_MODULE_ID]: { managed: true, documentType: 'activity', ...identity } },
      toObject() { return { _id: this.id, type: this.type, spell: { uuid: selectedUuid }, flags: structuredClone(this.flags) }; },
    };
    activity.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(activity.toObject());
    const spell: any = {
      id: 'SPEL000000000001', _id: 'SPEL000000000001', type: 'spell', parent: target, actor: target,
      flags: { dnd5e: { cachedFor: relativeUUID }, [RESOLVER_MODULE_ID]: { managed: true, documentType: 'spell', ...identity } },
      _stats: { compendiumSource: selectedUuid },
      toObject() { return { _id: this.id, type: this.type, flags: structuredClone(this.flags), _stats: structuredClone(this._stats) }; },
    };
    spell.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(spell.toObject());
    target.items = [feature];
    const alternate = {
      id: 'qrstuvwxyzabcdef', uuid: 'Compendium.other.spells24.Item.qrstuvwxyzabcdef', packageId: 'other', packId: 'spells24',
      name: 'Mage Armor', identifier: 'mage-armor', rules: '2024', sourceBook: 'PHB', level: 1, school: 'abj',
    };
    const runtime = fixture.dependencies.getRuntime();
    runtime.sourceIndex.candidates.push(alternate);
    fixture.dependencies.getRuntime = () => runtime;
    await fixture.service.processActor(target, { explicit: true });
    const plan = fixture.calls.execute[0]![2];
    feature.system.activities.set(activity.id, activity);
    target.items = [feature, spell];
    target.flags[RESOLVER_MODULE_ID].spellResolution = {
      status: 'hydrated', planHash: plan.planHash, manifestHash: hashManifest(validManifest), resolutionConfigHash: plan.resolutionConfigHash,
      report: { sourceInventoryHash: plan.sourceInventoryHash, candidateMetadataHash: plan.candidateMetadataHash,
        selections: [{ logicalRefKey, selectedUuid, rules: '2024', selectionOrigin: 'automatic-2024' }] },
      undoSnapshot: {
        resolverFlags: { spellManifest: structuredClone(validManifest), spellResolution: { status: 'pending' } },
        itemIds: [feature.id], activities: [], spells: [],
      },
    };
    expect(fixture.service.isAlreadyApplied(target)).toBe(true);
    fixture.settings.sourcePriority = [{ packageId: 'unrelated' }, { packageId: 'dnd5e', packId: 'spells24' }];
    expect(fixture.service.isAlreadyApplied(target)).toBe(true);
    fixture.settings.sourcePriority = [{ packageId: 'dnd5e', packId: 'spells24' }];
    fixture.settings.savedMappings = { [logicalRefKey]: {
      logicalRefKey, selectedUuid: alternate.uuid, rules: '2024', sourceInventoryHash: plan.sourceInventoryHash,
      candidateMetadataHash: plan.candidateMetadataHash, resolutionConfigHash: plan.resolutionConfigHash, selectionOrigin: 'manual-review',
    } };
    expect(fixture.service.isAlreadyApplied(target)).toBe(false);
    fixture.settings.savedMappings = {};
    fixture.settings.sourcePriority = [{ packageId: 'other' }, { packageId: 'dnd5e', packId: 'spells24' }];
    expect(fixture.service.isAlreadyApplied(target)).toBe(false);
    fixture.settings.sourcePriority = [{ packageId: 'dnd5e', packId: 'spells24' }];
    target.items = [feature];
    expect(fixture.service.isAlreadyApplied(target)).toBe(false);
  });

  test('persists a manual candidate mapping before hydration and makes zero Actor writes when persistence fails', async () => {
    const fixture = serviceFixture();
    const second = {
      id: 'qrstuvwxyzabcdef', uuid: 'Compendium.dnd5e.spells24.Item.qrstuvwxyzabcdef', packageId: 'dnd5e', packId: 'spells24',
      name: 'Mage Armor', identifier: 'mage-armor', rules: '2024', sourceBook: 'PHB', level: 1, school: 'abj',
    };
    const runtime = fixture.dependencies.getRuntime();
    runtime.sourceIndex.candidates.push(second);
    fixture.dependencies.getRuntime = () => runtime;
    const logicalRefKey = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
    fixture.dependencies.openReview = async () => ({
      action: 'apply', manualDecisions: [],
      candidateSelections: [{ logicalRefKey, selectedUuid: second.uuid }],
    });
    let settingCalls = 0;
    fixture.dependencies.setSetting = async (_key: string, value: unknown) => {
      settingCalls++;
      if (settingCalls === 1) throw new Error('injected setting write failure');
      fixture.settings.savedMappings = structuredClone(value);
    };
    const beforeFlags = structuredClone(fixture.target.flags);
    const service = createResolverActorService(fixture.dependencies);
    await service.processActor(fixture.target);
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.target.updateCalls).toEqual([]);
    expect(fixture.target.flags).toEqual(beforeFlags);
    expect(fixture.settings.savedMappings).toEqual({});
    expect(fixture.calls.notifications.flat().join(' ')).toContain('injected setting write failure');
  });

  test('restores the exact previous savedMappings when hydration fails after mapping persistence', async () => {
    const fixture = serviceFixture();
    const second = {
      id: 'qrstuvwxyzabcdef', uuid: 'Compendium.dnd5e.spells24.Item.qrstuvwxyzabcdef', packageId: 'dnd5e', packId: 'spells24',
      name: 'Mage Armor', identifier: 'mage-armor', rules: '2024', sourceBook: 'PHB', level: 1, school: 'abj',
    };
    const runtime = fixture.dependencies.getRuntime();
    runtime.sourceIndex.candidates.push(second);
    fixture.dependencies.getRuntime = () => runtime;
    const logicalRefKey = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
    fixture.dependencies.openReview = async () => ({
      action: 'apply', manualDecisions: [],
      candidateSelections: [{ logicalRefKey, selectedUuid: second.uuid }],
    });
    const previous = structuredClone(fixture.settings.savedMappings);
    fixture.dependencies.execute = async (...args: any[]) => {
      fixture.calls.execute.push(args);
      expect(fixture.settings.savedMappings[logicalRefKey].selectedUuid).toBe(second.uuid);
      throw new Error('injected hydration failure');
    };
    const service = createResolverActorService(fixture.dependencies);
    await service.processActor(fixture.target);
    expect(fixture.calls.execute).toHaveLength(1);
    expect(fixture.calls.saved).toHaveLength(2);
    expect(fixture.calls.saved[1]).toEqual(previous);
    expect(fixture.settings.savedMappings).toEqual(previous);
    expect(service.status(fixture.target)).toBe('failed');
  });

  test('a mapping write plus restoration failure still makes zero Actor writes and requires manual recovery', async () => {
    const fixture = serviceFixture();
    const second = {
      id: 'qrstuvwxyzabcdef', uuid: 'Compendium.dnd5e.spells24.Item.qrstuvwxyzabcdef', packageId: 'dnd5e', packId: 'spells24',
      name: 'Mage Armor', identifier: 'mage-armor', rules: '2024', sourceBook: 'PHB', level: 1, school: 'abj',
    };
    const runtime = fixture.dependencies.getRuntime();
    runtime.sourceIndex.candidates.push(second);
    fixture.dependencies.getRuntime = () => runtime;
    const logicalRefKey = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
    fixture.dependencies.openReview = async () => ({
      action: 'apply', manualDecisions: [], candidateSelections: [{ logicalRefKey, selectedUuid: second.uuid }],
    });
    fixture.dependencies.setSetting = async () => { throw new Error('setting service unavailable'); };
    const before = structuredClone(fixture.target.flags);
    const service = createResolverActorService(fixture.dependencies);
    await service.processActor(fixture.target);
    expect(service.status(fixture.target)).toBe('failed-recovery-required');
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.target.updateCalls).toEqual([]);
    expect(fixture.target.flags).toEqual(before);
    expect(fixture.calls.notifications.flat().join(' ')).toMatch(/manual recovery|required/i);
  });

  test('surfaces failed savedMappings compensation as recovery-required', async () => {
    const fixture = serviceFixture();
    const second = {
      id: 'qrstuvwxyzabcdef', uuid: 'Compendium.dnd5e.spells24.Item.qrstuvwxyzabcdef', packageId: 'dnd5e', packId: 'spells24',
      name: 'Mage Armor', identifier: 'mage-armor', rules: '2024', sourceBook: 'PHB', level: 1, school: 'abj',
    };
    const runtime = fixture.dependencies.getRuntime();
    runtime.sourceIndex.candidates.push(second);
    fixture.dependencies.getRuntime = () => runtime;
    const logicalRefKey = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
    fixture.dependencies.openReview = async () => ({
      action: 'apply', manualDecisions: [], candidateSelections: [{ logicalRefKey, selectedUuid: second.uuid }],
    });
    let settingCalls = 0;
    fixture.dependencies.setSetting = async (key: string, value: unknown) => {
      settingCalls++;
      if (settingCalls === 2) throw new Error('injected mapping restore failure');
      fixture.settings[key] = structuredClone(value);
      fixture.calls.saved.push(value);
    };
    fixture.dependencies.execute = async (...args: any[]) => {
      fixture.calls.execute.push(args);
      throw new Error('injected hydration failure');
    };
    const service = createResolverActorService(fixture.dependencies);
    await service.processActor(fixture.target);
    expect(service.status(fixture.target)).toBe('failed-recovery-required');
    expect(fixture.calls.notifications.flat().join(' ')).toMatch(/restore failure|recovery/i);
  });

  test('View Report recomputes fallback evidence after service reload without mutating the Actor', async () => {
    let reportHtml = '';
    const fixture = serviceFixture({ showDocument: async (_title: string, html: string) => { reportHtml = html; } });
    const runtime = fixture.dependencies.getRuntime();
    runtime.sourceIndex.candidates = [{
      id: 'fallbackspellxxx', uuid: 'Compendium.dnd5e.spells.Item.fallbackspellxxx', packageId: 'dnd5e', packId: 'spells',
      name: 'Mage Armor', identifier: 'mage-armor', rules: '2014', sourceBook: 'PHB 2014', level: 1,
    }];
    fixture.dependencies.getRuntime = () => runtime;
    const reloadedService = createResolverActorService(fixture.dependencies);
    await reloadedService.viewReport(fixture.target);
    expect(reportHtml).toContain('fallback-2014');
    expect(reportHtml).toContain('Compendium.dnd5e.spells.Item.fallbackspellxxx');
    expect(reportHtml).toContain('PHB 2014');
    expect(fixture.calls.templates[0]![0]).toBe('modules/fvtt-json-generator-spell-resolver/templates/report.hbs');
    expect(reportHtml).toContain('<template-shell>');
    expect(fixture.calls.execute).toHaveLength(0);
    expect(fixture.calls.fetch).toHaveLength(0);
    expect(fixture.target.updateCalls).toEqual([]);
  });

  test('serializes two-Actor mapping decisions so failed compensation cannot erase the later success', async () => {
    const first = serviceFixture();
    const second = serviceFixture();
    const alternate = {
      id: 'qrstuvwxyzabcdef', uuid: 'Compendium.dnd5e.spells24.Item.qrstuvwxyzabcdef', packageId: 'dnd5e', packId: 'spells24',
      name: 'Mage Armor', identifier: 'mage-armor', rules: '2024', sourceBook: 'PHB', level: 1, school: 'abj',
    };
    const runtime = first.dependencies.getRuntime();
    runtime.sourceIndex.candidates.push(alternate);
    const shared: Record<string, any> = { sourcePriority: first.settings.sourcePriority, savedMappings: {} };
    let releaseFirst!: () => void;
    let firstEntered!: () => void;
    const entered = new Promise<void>((resolve) => { firstEntered = resolve; });
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const key = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
    for (const [fixture, selectedUuid] of [[first, runtime.sourceIndex.candidates[0].uuid], [second, alternate.uuid]] as const) {
      fixture.dependencies.getRuntime = () => runtime;
      fixture.dependencies.getSetting = (setting: string) => shared[setting];
      fixture.dependencies.setSetting = async (setting: string, value: unknown) => { shared[setting] = structuredClone(value); };
      fixture.dependencies.openReview = async () => ({
        action: 'apply', manualDecisions: [], candidateSelections: [{ logicalRefKey: key, selectedUuid }],
      });
    }
    first.dependencies.execute = async (...args: any[]) => { first.calls.execute.push(args); firstEntered(); await gate; throw new Error('first failed'); };
    second.dependencies.execute = async (...args: any[]) => { second.calls.execute.push(args); };
    const firstRun = createResolverActorService(first.dependencies).processActor(first.target);
    await entered;
    const secondRun = createResolverActorService(second.dependencies).processActor(second.target);
    await Promise.resolve();
    expect(second.calls.execute).toHaveLength(0);
    releaseFirst();
    await Promise.all([firstRun, secondRun]);
    expect(second.calls.execute).toHaveLength(1);
    expect(shared.savedMappings[key].selectedUuid).toBe(alternate.uuid);
  });

  test('review and View Sources expose manifest evidence plus actual current/proposed structure, not hashes alone', async () => {
    let reviewModel: any;
    let sourcesHtml = '';
    const fixture = serviceFixture({
      openReview: async (model: any) => { reviewModel = model; return { action: 'cancel' }; },
      showDocument: async (_title: string, html: string) => { sourcesHtml = html; },
    });
    const logicalRefKey = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
    const selectedUuid = 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop';
    const feature: any = {
      id: 'FEAT000000000001', _id: 'FEAT000000000001', type: 'feat',
      flags: { [RESOLVER_MODULE_ID]: { groupId: 'innate', featureItemKey: 'spellcasting' } },
      system: { activities: new Map() },
    };
    const activitySource = {
      _id: 'ACTV000000000001', type: 'cast', spell: { uuid: selectedUuid }, system: { target: { value: 99 } },
      flags: { [RESOLVER_MODULE_ID]: {
        managed: true, documentType: 'activity', manifestId: validManifest.manifestId, groupId: 'innate', refId: 'mage-armor',
        featureId: feature.id, logicalRefKey, selectedUuid, activityId: 'ACTV000000000001', generatedContentHash: '0'.repeat(64),
      } },
    };
    feature.system.activities.set('ACTV000000000001', {
      ...structuredClone(activitySource), id: 'ACTV000000000001', actor: fixture.target, item: feature,
      relativeUUID: `.Item.${feature.id}.Activity.ACTV000000000001`, spell: { uuid: selectedUuid },
      toObject: () => structuredClone(activitySource),
    });
    feature.parent = fixture.target;
    feature.actor = fixture.target;
    fixture.target.id = 'ACTOR00000000001';
    fixture.target.type = 'npc';
    fixture.target.items = [feature];
    fixture.target.flags[RESOLVER_MODULE_ID].spellResolution.generatedProjection = [{
      logicalRefKey, activities: [{ id: 'ACTV000000000001', spell: { uuid: 'Compendium.old.spells.Item.aaaaaaaaaaaaaaaa' } }], cachedSpells: [],
    }];
    const runtime = fixture.dependencies.getRuntime();
    runtime.sourceIndex.diagnostics = [{
      code: 'PACK_INDEX_FAILED', pack: 'broken.spells', path: '/index', message: 'permission denied', blocking: true,
    }];
    runtime.diagnostics = runtime.sourceIndex.diagnostics;
    fixture.dependencies.getRuntime = () => runtime;
    const service = createResolverActorService(fixture.dependencies);
    await service.processActor(fixture.target);
    expect(reviewModel.spells[0].sourceEvidence).toEqual([{ start: 0, end: 10, quote: 'Mage Armor' }]);
    expect(reviewModel.spells[0].current.generatedProjection.activities[0]).toMatchObject({
      id: 'ACTV000000000001', type: 'cast', spell: { uuid: selectedUuid },
    });
    expect(reviewModel.spells[0].proposed.activities[0]).toMatchObject({ type: 'cast', spell: { uuid: selectedUuid } });
    expect(reviewModel.spells[0].proposed.cachedSpells[0]).toMatchObject({ compendiumSource: selectedUuid, type: 'spell' });
    expect(reviewModel.spells[0].lastGeneratedProof.activities[0].spell.uuid).toContain('Compendium.old');
    expect(JSON.stringify(reviewModel.spells[0])).not.toContain('hash only');
    await service.viewSources(fixture.target);
    expect(sourcesHtml).toContain('Mage Armor');
    expect(sourcesHtml).toContain('quote');
    expect(sourcesHtml).toContain('PACK_INDEX_FAILED');
    expect(sourcesHtml).toContain('broken.spells');
    expect(sourcesHtml).toContain('/index');
    expect(sourcesHtml).toContain('permission denied');
  });

  test('View Sources shows the current rebuild failure instead of stale retained-index diagnostics', async () => {
    let sourcesHtml = '';
    const fixture = serviceFixture({
      showDocument: async (_title: string, html: string) => { sourcesHtml = html; },
    });
    const runtime = fixture.dependencies.getRuntime();
    runtime.canMutate = false;
    runtime.diagnostics = [{ code: 'SOURCE_INDEX_FAILED', message: 'current rebuild list failed' }];
    runtime.sourceIndex.diagnostics = [{
      code: 'PACK_INDEX_FAILED', pack: 'old.spells', path: '/old', message: 'stale old failure', blocking: true,
    }];
    fixture.dependencies.getRuntime = () => runtime;

    await createResolverActorService(fixture.dependencies).viewSources(fixture.target);
    expect(sourcesHtml).toContain('SOURCE_INDEX_FAILED');
    expect(sourcesHtml).toContain('current rebuild list failed');
    expect(sourcesHtml).not.toContain('stale old failure');
  });

  test('duplicate refId values in different groups bind each proposed Activity to its exact logical feature', async () => {
    const fixture = serviceFixture();
    const manifest = structuredClone(validManifest) as any;
    manifest.spellcastingGroups = [
      { ...structuredClone(validManifest.spellcastingGroups[0]), groupId: 'group-a', featureItemKey: 'feature-a' },
      { ...structuredClone(validManifest.spellcastingGroups[0]), groupId: 'group-b', featureItemKey: 'feature-b' },
    ];
    fixture.target.flags[RESOLVER_MODULE_ID].spellManifest = manifest;
    fixture.target.items = [
      { id: 'FEATUREGROUP0001', flags: { [RESOLVER_MODULE_ID]: { groupId: 'group-a', featureItemKey: 'feature-a' } }, system: { activities: new Map() } },
      { id: 'FEATUREGROUP0002', flags: { [RESOLVER_MODULE_ID]: { groupId: 'group-b', featureItemKey: 'feature-b' } }, system: { activities: new Map() } },
    ];
    const selected = fixture.dependencies.getRuntime().sourceIndex.candidates[0];
    const results = ['group-a', 'group-b'].map((groupId) => ({
      status: 'resolved', refId: 'mage-armor', logicalRefKey: logicalSpellRefKey(manifest.manifestId, groupId, 'mage-armor'),
      selected, candidates: [], origin: 'automatic-2024', trace: [],
    }));
    const reviewModel = buildResolverReviewModel(fixture.target, manifest, {
      status: 'needs_review', findings: [], report: {
        manifestId: manifest.manifestId, sourceInventoryHash: 'c'.repeat(64), candidateMetadataHash: 'b'.repeat(64),
        resolutionConfigHash: 'd'.repeat(64), currentManagedProjectionHash: 'e'.repeat(64), manualDecisionsHash: 'f'.repeat(64),
        results, findings: [],
      },
    } as any);

    expect(reviewModel.spells.map((spell: any) => [spell.logicalRefKey, spell.proposed.activities[0].featureId])).toEqual([
      [logicalSpellRefKey(manifest.manifestId, 'group-a', 'mage-armor'), 'FEATUREGROUP0001'],
      [logicalSpellRefKey(manifest.manifestId, 'group-b', 'mage-armor'), 'FEATUREGROUP0002'],
    ]);
  });
});

describe('public Foundry hook and GM control registration', () => {
  test('selects one deterministic active GM authority on every client', () => {
    const users = [
      { id: 'gm-z', isGM: true, active: true },
      { id: 'gm-a', isGM: true, active: true },
      { id: 'gm-0', isGM: true, active: false },
      { id: 'player', isGM: false, active: true },
    ];
    expect(selectResolverAuthority(users, users[1])).toEqual({ isGM: true, userId: 'gm-a' });
    expect(selectResolverAuthority(users, users[0])).toEqual({ isGM: false, userId: 'gm-z' });
    expect(selectResolverAuthority(users, users[2])).toEqual({ isGM: false, userId: 'gm-0' });
  });

  test('non-authoritative GM hooks, controls, and explicit actions are all read-only', async () => {
    const calls: string[] = [];
    const raw: ResolverActorActions = {
      status: () => 'pending', resolve: async () => { calls.push('resolve'); }, viewReport: async () => { calls.push('report'); },
      viewSources: async () => { calls.push('sources'); }, undo: async () => { calls.push('undo'); }, exportDiagnostics: async () => { calls.push('diagnostics'); },
    };
    const guarded = createAuthorityGuardedActions(raw, () => false);
    const target = actor();
    await guarded.resolve(target); await guarded.viewReport(target); await guarded.viewSources(target); await guarded.undo(target); await guarded.exportDiagnostics(target);
    expect(calls).toEqual([]);

    const scheduled: unknown[] = [];
    const coordinator = createResolverEventCoordinator({
      authority: () => ({ isGM: false, userId: 'gm-z' }), runtimeSupported: () => true, isActive: () => false,
      isAlreadyApplied: () => false, schedule: (callback) => scheduled.push(callback), process: async () => {},
    });
    expect(coordinator.onActorEvent(target, { userId: 'gm-a' })).toBe('ignored');
    expect(scheduled).toEqual([]);
  });
  test('registers only the four approved public hooks and wires every Actor action', async () => {
    const callbacks = new Map<string, Function>();
    const calls: string[] = [];
    const actions: ResolverActorActions = {
      status: (target: any) => target?.flags?.[RESOLVER_MODULE_ID]?.spellResolution?.status ?? 'pending',
      resolve: async () => { calls.push('resolve'); },
      viewReport: async () => { calls.push('report'); },
      viewSources: async () => { calls.push('sources'); },
      undo: async () => { calls.push('undo'); },
      exportDiagnostics: async () => { calls.push('diagnostics'); },
    };
    registerResolverHooks({ on: (name: string, callback: Function) => { callbacks.set(name, callback); } } as any, {
      onActorEvent: () => 'ignored', actions, isCurrentUserGM: () => true,
    });
    expect([...callbacks.keys()]).toEqual([
      'createActor', 'updateActor', 'getHeaderControlsApplicationV2', 'getActorContextOptions',
    ]);

    const target = actor();
    const controls: any[] = [];
    callbacks.get('getHeaderControlsApplicationV2')!({ document: target }, controls);
    expect(controls.map((entry) => entry.action)).toEqual([
      'fvtt-json-generator-spell-resolver.status',
      'fvtt-json-generator-spell-resolver.resolve',
      'fvtt-json-generator-spell-resolver.report',
      'fvtt-json-generator-spell-resolver.sources',
      'fvtt-json-generator-spell-resolver.undo',
      'fvtt-json-generator-spell-resolver.diagnostics',
    ]);
    for (const control of controls) await control.onClick();

    const menu: any[] = [];
    const application = { collection: { get: (id: string) => id === target.id ? target : undefined } };
    callbacks.get('getActorContextOptions')!(application, menu);
    expect(menu).toHaveLength(5);
    const element = { closest: () => ({ dataset: { entryId: target.id } }) };
    for (const entry of menu) await entry.onClick({}, element);
    expect(calls).toEqual(['report', 'resolve', 'report', 'sources', 'undo', 'diagnostics', 'resolve', 'report', 'sources', 'undo', 'diagnostics']);

    const fallback = actor('actor-fallback') as any;
    fallback.flags[RESOLVER_MODULE_ID].spellResolution.report = { selections: [{ selectionOrigin: 'fallback-2014' }] };
    const fallbackControls: any[] = [];
    callbacks.get('getHeaderControlsApplicationV2')!({ document: fallback }, fallbackControls);
    expect(fallbackControls.slice(0, 2).map((entry) => [entry.action, entry.label])).toEqual([
      ['fvtt-json-generator-spell-resolver.status', 'FVTTJSONSPELL.Status.pending'],
      ['fvtt-json-generator-spell-resolver.fallback-2014', 'FVTTJSONSPELL.Status.Fallback2014'],
    ]);
    fallback.flags[RESOLVER_MODULE_ID].spellResolution.status = 'hydrated';
    const hydratedControls: any[] = [];
    callbacks.get('getHeaderControlsApplicationV2')!({ document: fallback }, hydratedControls);
    expect(hydratedControls[0].icon).toContain('fvtt-json-generator-spell-resolver-status-icon--hydrated');

    const invalid = actor('actor-invalid') as any;
    invalid.flags[RESOLVER_MODULE_ID].spellManifest = { ...structuredClone(validManifest), schemaVersion: 99 };
    const invalidControls: any[] = [];
    callbacks.get('getHeaderControlsApplicationV2')!({ document: invalid }, invalidControls);
    expect(invalidControls.map((entry) => [entry.action, entry.visible()])).toEqual([
      ['fvtt-json-generator-spell-resolver.status', true],
      ['fvtt-json-generator-spell-resolver.resolve', true],
      ['fvtt-json-generator-spell-resolver.report', true],
      ['fvtt-json-generator-spell-resolver.sources', true],
      ['fvtt-json-generator-spell-resolver.undo', false],
      ['fvtt-json-generator-spell-resolver.diagnostics', true],
    ]);

    const nonActorControls: any[] = [];
    callbacks.get('getHeaderControlsApplicationV2')!({ document: { documentName: 'Item' } }, nonActorControls);
    expect(nonActorControls).toEqual([]);
  });

  test('hides every control from non-GMs and never exposes a world resolve action', () => {
    const callbacks = new Map<string, Function>();
    registerResolverHooks({ on: (name: string, callback: Function) => callbacks.set(name, callback) } as any, {
      onActorEvent: () => 'ignored',
      actions: {} as ResolverActorActions,
      isCurrentUserGM: () => false,
    });
    const controls: any[] = [];
    const menu: any[] = [];
    callbacks.get('getHeaderControlsApplicationV2')!({ document: actor() }, controls);
    callbacks.get('getActorContextOptions')!({}, menu);
    expect(controls).toEqual([]);
    expect(menu).toEqual([]);
    expect(JSON.stringify([...callbacks.keys()])).not.toMatch(/world/i);
  });

  test('bundles browser-safe public-hook code without patches or custom Activity registration', async () => {
    const built = await buildSpellResolverPackage();
    const bundle = await readFile(resolve(built.outputDir, 'scripts/index.js'), 'utf8');
    expect(bundle).not.toMatch(/\.prototype\s*=|\.prototype\.[A-Za-z_$][\w$]*\s*=|CONFIG\.DND5E\.activityTypes|registerActivity|world[- ]wide|require\s*\(|node:/i);
    expect(bundle).toContain('getHeaderControlsApplicationV2');
    expect(bundle).toContain('getActorContextOptions');
  });
});

describe('Undo Last Hydration transaction boundary', () => {
  test('GM Undo prevalidation failure is visible, mutates no managed document, and releases the active lock', async () => {
    const fixture = createUndoActor();
    delete fixture.actor.flags[RESOLVER_MODULE_ID].spellResolution.undoSnapshot.activities[0].source.flags[RESOLVER_MODULE_ID].logicalRefKey;
    const notifications: any[] = [];
    const service = createResolverActorService(undoServiceDependencies(notifications));
    const beforeMutations = fixture.mutations.count;
    await expect(service.undo(fixture.actor)).rejects.toThrow(/snapshot|ownership|logical/i);
    expect(fixture.mutations.count).toBe(beforeMutations);
    expect(service.status(fixture.actor)).toBe('failed');
    expect(notifications).toContainEqual(expect.arrayContaining(['error']));
    expect(notifications.flat().join(' ')).toMatch(/snapshot|ownership|logical/i);
    expect(service.isActive(fixture.actor)).toBe(false);

    fixture.actor.flags[RESOLVER_MODULE_ID].spellResolution.status = 'failed-recovery-required';
    await expect(service.undo(fixture.actor)).rejects.toThrow(/snapshot|ownership|logical/i);
    expect(service.status(fixture.actor)).toBe('failed-recovery-required');
  });

  test('removes native auto-cache duplicates, restores prior status instead of resolving, and preserves later unrelated Items', async () => {
    const fixture = createUndoActor();
    await restoreLastHydration(fixture.actor);
    expect(fixture.actor.flags[RESOLVER_MODULE_ID].spellResolution.status).toBe('hydrated');
    expect(fixture.actor.flags[RESOLVER_MODULE_ID].spellResolution.planHash).toBe('plan-a');
    expect(fixture.actor.items.some((item: any) => item.id === fixture.unrelatedId)).toBe(true);
    const managedSpells = fixture.actor.items.filter((item: any) => item.flags?.[RESOLVER_MODULE_ID]?.documentType === 'spell');
    expect(managedSpells).toHaveLength(1);
    expect(managedSpells[0]._stats.compendiumSource).toContain('aaaaaaaaaaaaaaaa');
    expect(fixture.actor.items.some((item: any) => item.id.startsWith('AUTO'))).toBe(false);
  });

  test('validates every snapshot source before the first write', async () => {
    const fixture = createUndoActor();
    delete fixture.actor.flags[RESOLVER_MODULE_ID].spellResolution.undoSnapshot.activities[0].source.flags[RESOLVER_MODULE_ID].logicalRefKey;
    const before = fixture.mutations.count;
    await expect(restoreLastHydration(fixture.actor)).rejects.toThrow(/snapshot|ownership|logical/i);
    expect(fixture.mutations.count).toBe(before);
  });

  test('rejects an empty snapshot that falsely claims a previously hydrated selection', async () => {
    const fixture = createUndoActor();
    const snapshot = fixture.actor.flags[RESOLVER_MODULE_ID].spellResolution.undoSnapshot;
    snapshot.activities = [];
    snapshot.spells = [];
    const before = fixture.mutations.count;
    await expect(restoreLastHydration(fixture.actor)).rejects.toThrow(/empty|selection|pending|snapshot/i);
    expect(fixture.mutations.count).toBe(before);
  });

  test('fails before writing when a foreign cache already claims the snapshot Activity', async () => {
    const fixture = createUndoActor();
    fixture.actor.items.push({
      id: 'FORN000000000001', _id: 'FORN000000000001', type: 'spell', parent: fixture.actor, actor: fixture.actor,
      flags: { dnd5e: { cachedFor: '.Item.FEAT000000000001.Activity.ACTV000000000001' }, foreign: { keep: true } },
      _stats: { compendiumSource: 'Compendium.dnd5e.spells24.Item.aaaaaaaaaaaaaaaa' },
    });
    const before = fixture.mutations.count;
    await expect(restoreLastHydration(fixture.actor)).rejects.toThrow(/foreign|unowned|cache/i);
    expect(fixture.mutations.count).toBe(before);
  });

  test('serializes concurrent Undo and a compensated failure records failed without partial A/B mixing', async () => {
    const concurrent = createUndoActor();
    const originalUpdateEmbedded = concurrent.actor.updateEmbeddedDocuments;
    let inside = 0;
    let maxInside = 0;
    concurrent.actor.updateEmbeddedDocuments = async (...args: any[]) => {
      inside++;
      maxInside = Math.max(maxInside, inside);
      await Promise.resolve();
      try { return await originalUpdateEmbedded(...args); }
      finally { inside--; }
    };
    const results = await Promise.allSettled([restoreLastHydration(concurrent.actor), restoreLastHydration(concurrent.actor)]);
    expect(results.map((entry) => entry.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(maxInside).toBe(1);

    const compensated = createUndoActor();
    const originalCreate = compensated.actor.createEmbeddedDocuments;
    let failOnce = true;
    compensated.actor.createEmbeddedDocuments = async (...args: any[]) => {
      if (failOnce) { failOnce = false; throw new Error('injected Undo create failure'); }
      return originalCreate(...args);
    };
    await expect(restoreLastHydration(compensated.actor)).rejects.toThrow(/injected Undo/);
    expect(compensated.actor.flags[RESOLVER_MODULE_ID].spellResolution.status).toBe('failed');
    const managed = compensated.actor.items.filter((item: any) => item.flags?.[RESOLVER_MODULE_ID]?.documentType === 'spell');
    expect(managed).toHaveLength(1);
    expect(managed[0]._stats.compendiumSource).toContain('bbbbbbbbbbbbbbbb');
  });

  test('GM Undo preserves failed-recovery-required when both restore and compensation fail', async () => {
    const fixture = createUndoActor();
    fixture.actor.createEmbeddedDocuments = async () => { throw new Error('injected persistent Undo create failure'); };
    const notifications: any[] = [];
    const service = createResolverActorService(undoServiceDependencies(notifications));
    let undoError: any;
    try { await service.undo(fixture.actor); } catch (error) { undoError = error; }
    expect({ isArray: Array.isArray(undoError.residualDifferences), type: typeof undoError.residualDifferences })
      .toEqual({ isArray: true, type: 'object' });
    expect(undoError.residualDifferences.length).toBeGreaterThan(0);
    expect(undoError.residualDifferences.some((entry: any) => /^\/managed\/(activities|spells)\/.+/.test(entry.path))).toBe(true);
    expect(undoError).toMatchObject({ recoveryRequired: true });
    expect(fixture.actor.flags[RESOLVER_MODULE_ID].spellResolution.status).toBe('failed-recovery-required');
    expect(fixture.actor.flags[RESOLVER_MODULE_ID].spellResolution.residualDifferences).toEqual(undoError.residualDifferences);
    expect(service.status(fixture.actor)).toBe('failed-recovery-required');
    expect(notifications.flat().join(' ')).toMatch(/persistent Undo|recovery|compensation/i);
    expect(service.isActive(fixture.actor)).toBe(false);
  });

  test('Resolve and Undo share the same active Actor boundary', async () => {
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fixture = (() => {
      const target = actor() as any;
      target.items = [];
      const candidate = {
        id: 'abcdefghijklmnop', uuid: 'Compendium.dnd5e.spells24.Item.abcdefghijklmnop', packageId: 'dnd5e', packId: 'spells24',
        name: 'Mage Armor', identifier: 'mage-armor', rules: '2024', level: 1,
      };
      const deps: any = {
        getRuntime: () => ({ compatibility: { supported: true }, canMutate: true, diagnostics: [], sourceIndex: {
          candidates: [candidate], sourcePackages: [], diagnostics: [], candidateMetadataHash: 'b'.repeat(64), sourceInventoryHash: 'c'.repeat(64),
        } }),
        getSetting: (key: string) => key === 'sourcePriority' ? [{ packageId: 'dnd5e', packId: 'spells24' }] : {},
        setSetting: async () => {}, fetchSelectedDocument: async (uuid: string) => ({
          documentName: 'Item', type: 'spell', uuid, name: 'Mage Armor',
          system: { identifier: 'mage-armor', source: { rules: '2024', book: undefined }, level: 1 },
        }),
        execute: async () => { entered(); await gate; }, openReview: async () => ({ action: 'cancel' }),
        renderTemplate: async (_path: string, context: any) => context.content,
        showDocument: async () => {}, exportJson: () => {}, notify: () => {},
      };
      return { target, service: createResolverActorService(deps) };
    })();
    const resolving = fixture.service.processActor(fixture.target);
    await enteredPromise;
    await expect(fixture.service.undo(fixture.target)).rejects.toThrow(/active resolver/i);
    release();
    await resolving;
  });
});

function undoServiceDependencies(notifications: any[]): any {
  return {
    getRuntime: () => undefined,
    getSetting: () => ({}),
    setSetting: async () => {},
    fetchSelectedDocument: async () => undefined,
    execute: async () => {},
    openReview: async () => ({ action: 'cancel' }),
    renderTemplate: async (_path: string, context: any) => context.content,
    showDocument: async () => {},
    exportJson: () => {},
    notify: (...args: any[]) => notifications.push(args),
  };
}

function createUndoActor() {
  const actor: any = {
    id: 'ACTOR00000000001', type: 'npc', documentName: 'Actor', items: [],
    flags: { [RESOLVER_MODULE_ID]: { spellManifest: structuredClone(validManifest) } },
  };
  const mutations = { count: 0 };
  const featureId = 'FEAT000000000001';
  const activityId = 'ACTV000000000001';
  const spellId = 'SPEL000000000001';
  const unrelatedId = 'UNRL000000000001';
  const logicalRefKey = logicalSpellRefKey(validManifest.manifestId, 'innate', 'mage-armor');
  const feature: any = {
    id: featureId, _id: featureId, type: 'feat', parent: actor, actor,
    flags: { [RESOLVER_MODULE_ID]: { groupId: 'innate', featureItemKey: 'spellcasting' } },
    system: { activities: new Map() },
    async deleteActivity(id: string) { mutations.count++; this.system.activities.delete(id); },
  };
  const relativeUUID = `.Item.${featureId}.Activity.${activityId}`;
  const selected = (letter: string) => `Compendium.dnd5e.spells24.Item.${letter.repeat(16)}`;
  const identity = (letter: string) => ({
    manifestId: validManifest.manifestId, groupId: 'innate', refId: 'mage-armor', featureId,
    logicalRefKey, selectedUuid: selected(letter), activityId,
  });
  const activitySource = (letter: string) => {
    const source: any = { _id: activityId, type: 'cast', spell: { uuid: selected(letter) }, flags: {
      [RESOLVER_MODULE_ID]: { managed: true, documentType: 'activity', ...identity(letter) },
    } };
    source.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(source);
    return source;
  };
  const spellSource = (letter: string) => {
    const source: any = { _id: spellId, type: 'spell', flags: {
      dnd5e: { cachedFor: relativeUUID }, [RESOLVER_MODULE_ID]: { managed: true, documentType: 'spell', ...identity(letter) },
    }, _stats: { compendiumSource: selected(letter) } };
    source.flags[RESOLVER_MODULE_ID].generatedContentHash = computeManagedSourceHash(source);
    return source;
  };
  const prepareActivity = (source: any) => ({
    ...structuredClone(source), id: source._id, actor, item: feature, relativeUUID, spell: { uuid: source.spell.uuid },
    toObject() { return { _id: this._id, type: this.type, spell: structuredClone(this.spell), flags: structuredClone(this.flags) }; },
  });
  const prepareSpell = (source: any) => ({
    ...structuredClone(source), id: source._id, parent: actor, actor,
    toObject() { return { _id: this._id, type: this.type, flags: structuredClone(this.flags), _stats: structuredClone(this._stats) }; },
  });
  feature.system.activities.set(activityId, prepareActivity(activitySource('b')));
  actor.items.push(feature, prepareSpell(spellSource('b')), { id: unrelatedId, _id: unrelatedId, type: 'loot', parent: actor, actor, flags: { foreign: { keep: true } } });
  const undoSnapshot = {
    resolverFlags: {
      spellManifest: structuredClone(validManifest),
      spellResolution: { status: 'hydrated', planHash: 'plan-a', manifestHash: hashManifest(validManifest), report: { selections: [{ logicalRefKey, selectedUuid: selected('a') }] } },
    },
    itemIds: [featureId, spellId],
    activities: [{ featureId, source: activitySource('a') }],
    spells: [spellSource('a')],
  };
  actor.flags[RESOLVER_MODULE_ID].spellResolution = {
    status: 'hydrated', planHash: 'plan-b', manifestHash: hashManifest(validManifest), undoSnapshot,
    report: { selections: [{ logicalRefKey, selectedUuid: selected('b') }] },
  };
  actor.deleteEmbeddedDocuments = async (_type: string, ids: string[]) => {
    mutations.count++;
    actor.items = actor.items.filter((item: any) => !ids.includes(item.id));
  };
  actor.updateEmbeddedDocuments = async (_type: string, changes: any[]) => {
    mutations.count++;
    for (const change of changes) {
      const key = Object.keys(change).find((entry) => entry.startsWith('system.activities.'))!;
      const source = change[key];
      const activity = prepareActivity(source);
      feature.system.activities.set(activity.id, activity);
      const autoId = `AUTO${String(mutations.count).padStart(12, '0')}`;
      actor.items.push(prepareSpell({
        _id: autoId, type: 'spell', flags: { dnd5e: { cachedFor: relativeUUID } }, _stats: { compendiumSource: source.spell.uuid },
      }));
    }
  };
  actor.createEmbeddedDocuments = async (_type: string, sources: any[]) => {
    mutations.count++;
    actor.items.push(...sources.map(prepareSpell));
  };
  actor.update = async (changes: Record<string, any>) => {
    mutations.count++;
    const flags = changes[`flags.${RESOLVER_MODULE_ID}`];
    if (flags) actor.flags[RESOLVER_MODULE_ID] = structuredClone(flags);
    const resolution = changes[`flags.${RESOLVER_MODULE_ID}.spellResolution`];
    if (resolution) actor.flags[RESOLVER_MODULE_ID].spellResolution = structuredClone(resolution);
  };
  return { actor, mutations, unrelatedId };
}
