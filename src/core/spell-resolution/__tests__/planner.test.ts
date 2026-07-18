import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  hashSourceInventoryMetadata,
  hashResolutionConfiguration,
  DEFAULT_SPELL_RESOLUTION_CONFIGURATION,
  logicalSpellRefKey,
  planSpellHydration,
  type HydrationPreflight,
  type PortableSpellManifest,
  type SavedSpellMapping,
  type SpellCandidateMetadata,
} from '..';

function requireReady(result: HydrationPreflight): Extract<HydrationPreflight, { status: 'ready' }> {
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(`Expected ready preflight, received ${result.status}`);
  return result;
}

function requireBlocked(result: HydrationPreflight): Exclude<HydrationPreflight, { status: 'ready' }> {
  expect(result.status).not.toBe('ready');
  if (result.status === 'ready') throw new Error('Expected blocked preflight, received ready');
  return result;
}

const SOURCE = 'Fireball and Cure Wounds';

function manifest(): PortableSpellManifest {
  const refs = [
    { refId: 'fireball', identifier: 'fireball', originalName: 'Fireball', englishName: 'Fireball', expectedLevel: 3, expectedSchool: 'evocation' },
    { refId: 'cure-wounds', identifier: 'cure-wounds', originalName: 'Cure Wounds', englishName: 'Cure Wounds', expectedLevel: 1, expectedSchool: 'abjuration' },
  ];
  return {
    schemaVersion: 1,
    manifestId: 'mixed-caster-v1',
    sourceSha256: createHash('sha256').update(SOURCE).digest('hex'),
    rulesPreference: '2024',
    spellcastingGroups: [{
      groupId: 'spells',
      featureItemKey: 'spellcasting',
      spellRefs: refs.map((entry) => ({
        ...entry,
        aliases: [],
        method: 'prepared' as const,
        restrictions: [],
        evidence: [{ start: SOURCE.indexOf(entry.originalName), end: SOURCE.indexOf(entry.originalName) + entry.originalName.length, quote: entry.originalName }],
      })),
    }],
  };
}

function spell(identifier: string, overrides: Partial<SpellCandidateMetadata> = {}): SpellCandidateMetadata {
  const isFireball = identifier === 'fireball';
  return {
    id: identifier,
    uuid: `Compendium.dnd-players-handbook.spells.Item.${identifier.replaceAll('-', '')}2024xxxx`,
    packageId: 'dnd-players-handbook',
    packId: 'spells',
    name: isFireball ? 'Fireball' : 'Cure Wounds',
    identifier,
    rules: '2024',
    sourceBook: 'PHB',
    level: isFireball ? 3 : 1,
    school: isFireball ? 'evocation' : 'abjuration',
    ...overrides,
  };
}

function plan(input: Omit<Parameters<typeof planSpellHydration>[0], 'sourceInventoryHash'> & { sourceInventoryHash?: string }) {
  return planSpellHydration({
    ...input,
    sourceInventoryHash: input.sourceInventoryHash ?? hashSourceInventoryMetadata(input.candidates),
  });
}

describe('all-or-nothing hydration preflight', () => {
  test('returns a stable writable plan only when every ref is resolved', () => {
    const input = { manifest: manifest(), candidates: [spell('fireball'), spell('cure-wounds')] };
    const first = plan(input);
    const second = plan({ ...input, candidates: [...input.candidates].reverse() });

    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    expect(first.status === 'ready' && first.plan.selections).toHaveLength(2);
    expect(requireReady(first).plan.planHash).toBe(requireReady(second).plan.planHash);
    expect(first.report.sourceInventoryHash).toBe(hashSourceInventoryMetadata(input.candidates));
  });

  test('keeps the plan hash identical when the same automatic selections are reused from valid saved mappings', () => {
    const candidates = [spell('fireball'), spell('cure-wounds')];
    const sourceInventoryHash = hashSourceInventoryMetadata(candidates);
    const fresh = plan({ manifest: manifest(), candidates, sourceInventoryHash });
    const savedMappings: SavedSpellMapping[] = candidates.map((selected) => ({
      logicalRefKey: logicalSpellRefKey('mixed-caster-v1', 'spells', selected.identifier!),
      selectedUuid: selected.uuid,
      rules: '2024',
      sourceInventoryHash,
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'automatic-2024',
    }));
    const reused = plan({ manifest: manifest(), candidates, sourceInventoryHash, savedMappings });

    expect(fresh.status).toBe('ready');
    expect(reused.status).toBe('ready');
    expect(requireReady(fresh).plan.planHash).toBe(requireReady(reused).plan.planHash);
  });

  test('withholds the entire plan when one of two refs is missing', () => {
    const result = plan({ manifest: manifest(), candidates: [spell('fireball')] });
    expect(result.status).toBe('needs_review');
    expect('plan' in result).toBe(false);
    expect(result.report.results.map((entry) => entry.status)).toEqual(['resolved', 'missing']);
  });

  test('withholds the plan for ambiguity, contradiction, or malformed input', () => {
    const base = [spell('fireball'), spell('cure-wounds')];
    const cases = [
      [
        spell('fireball', { uuid: 'Compendium.module-a.spells.Item.fireballsourceaaa', packageId: 'module-a' }),
        spell('fireball', { uuid: 'Compendium.module-b.spells.Item.fireballsourcebbb', packageId: 'module-b' }),
        spell('cure-wounds'),
      ],
      [...base, spell('fireball', { uuid: 'Compendium.module-x.spells.Item.fireballlevel4xx', packageId: 'module-x', level: 4 })],
      [...base, null as never],
    ];
    for (const candidates of cases) {
      const result = plan({ manifest: manifest(), candidates });
      expect(result.status).not.toBe('ready');
      expect('plan' in result).toBe(false);
    }
  });

  test('undecided or cancelled manual conflict yields no plan; overwrite and keep are explicit', () => {
    const candidates = [spell('fireball'), spell('cure-wounds')];
    const fireKey = logicalSpellRefKey('mixed-caster-v1', 'spells', 'fireball');
    const currentManagedProjection = [{ logicalRefKey: fireKey, manualConflict: true }];

    for (const decision of [undefined, 'cancel'] as const) {
      const result = plan({
        manifest: manifest(), candidates, currentManagedProjection,
        manualDecisions: decision ? [{ logicalRefKey: fireKey, decision }] : [],
      });
      expect(result.status).toBe('needs_review');
      expect('plan' in result).toBe(false);
    }

    for (const decision of ['overwrite', 'keep'] as const) {
      const result = plan({
        manifest: manifest(), candidates, currentManagedProjection,
        manualDecisions: [{ logicalRefKey: fireKey, decision }],
      });
      expect(result.status).toBe('ready');
      expect(result.status === 'ready' && result.plan.selections.find((entry) => entry.logicalRefKey === fireKey)?.manualDecision).toBe(decision);
    }
  });

  test('changed inventory that changes a saved priority selection is stale and blocks writing', () => {
    const oldCore = spell('fireball', { uuid: 'Compendium.dnd5e.spells24.Item.fireballcore2024', packageId: 'dnd5e', packId: 'spells24' });
    const cure = spell('cure-wounds');
    const oldInventory = [oldCore, cure];
    const saved: SavedSpellMapping = {
      logicalRefKey: logicalSpellRefKey('mixed-caster-v1', 'spells', 'fireball'),
      selectedUuid: oldCore.uuid,
      rules: '2024',
      sourceInventoryHash: hashSourceInventoryMetadata(oldInventory),
      candidateMetadataHash: hashSourceInventoryMetadata(oldInventory),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'automatic-2024',
    };
    const newPhb = spell('fireball');
    const result = plan({ manifest: manifest(), candidates: [...oldInventory, newPhb], savedMappings: [saved] });

    expect(result.status).toBe('needs_review');
    expect('plan' in result).toBe(false);
    expect(requireBlocked(result).findings.some((finding) => finding.code === 'STALE_SAVED_SELECTION')).toBe(true);
    expect(result.report.results.find((entry) => entry.logicalRefKey === saved.logicalRefKey)?.status).toBe('needs_review');
  });

  test('inventory changes leave an unaffected saved selection stable', () => {
    const fire = spell('fireball');
    const oldInventory = [fire, spell('cure-wounds')];
    const saved: SavedSpellMapping = {
      logicalRefKey: logicalSpellRefKey('mixed-caster-v1', 'spells', 'fireball'),
      selectedUuid: fire.uuid,
      rules: '2024',
      sourceInventoryHash: hashSourceInventoryMetadata(oldInventory),
      candidateMetadataHash: hashSourceInventoryMetadata(oldInventory),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'automatic-2024',
    };
    const result = plan({ manifest: manifest(), candidates: [...oldInventory, spell('ice-storm', { name: 'Ice Storm', level: 4, school: 'evocation' })], savedMappings: [saved] });

    expect(result.status).toBe('ready');
    expect(result.status === 'ready' && result.plan.selections.find((entry) => entry.logicalRefKey === saved.logicalRefKey)?.uuid).toBe(fire.uuid);
  });

  test('does not mutate manifest, candidates, mappings, projections, or decisions', () => {
    const input = {
      manifest: manifest(),
      candidates: [spell('fireball'), spell('cure-wounds')],
      savedMappings: [] as SavedSpellMapping[],
      currentManagedProjection: [],
      manualDecisions: [],
    };
    const snapshot = structuredClone(input);
    plan(input);
    expect(input).toEqual(snapshot);
  });

  test('binds normalized managed projection state to the plan hash independent of projection order', () => {
    const candidates = [spell('fireball'), spell('cure-wounds')];
    const firstProjection = [
      { logicalRefKey: logicalSpellRefKey('mixed-caster-v1', 'spells', 'fireball'), managedContentHash: 'fire-v1' },
      { logicalRefKey: logicalSpellRefKey('mixed-caster-v1', 'spells', 'cure-wounds'), managedContentHash: 'cure-v1' },
    ];
    const first = plan({ manifest: manifest(), candidates, currentManagedProjection: firstProjection });
    const reordered = plan({ manifest: manifest(), candidates, currentManagedProjection: [...firstProjection].reverse() });
    const edited = plan({ manifest: manifest(), candidates, currentManagedProjection: [{ ...firstProjection[0]!, managedContentHash: 'fire-edited' }, firstProjection[1]!] });

    expect(first.status).toBe('ready');
    expect(reordered.status).toBe('ready');
    expect(edited.status).toBe('ready');
    expect(requireReady(first).plan.planHash).toBe(requireReady(reordered).plan.planHash);
    expect(requireReady(first).plan.planHash).not.toBe(requireReady(edited).plan.planHash);
  });

  test('includes configuration and manual decisions in the stable plan hash', () => {
    const candidates = [spell('fireball'), spell('cure-wounds')];
    const fireKey = logicalSpellRefKey('mixed-caster-v1', 'spells', 'fireball');
    const projection = [{ logicalRefKey: fireKey, manualConflict: true }];
    const keep = plan({ manifest: manifest(), candidates, currentManagedProjection: projection, manualDecisions: [{ logicalRefKey: fireKey, decision: 'keep' }] });
    const overwrite = plan({ manifest: manifest(), candidates, currentManagedProjection: projection, manualDecisions: [{ logicalRefKey: fireKey, decision: 'overwrite' }] });
    expect(keep.status).toBe('ready');
    expect(overwrite.status).toBe('ready');
    expect(requireReady(keep).plan.planHash).not.toBe(requireReady(overwrite).plan.planHash);
    expect(keep.report.resolutionConfigHash).toBe(hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION));
  });

  test('a source-priority configuration change marks only a changed saved selection stale', () => {
    const phbFire = spell('fireball');
    const moduleFire = spell('fireball', { uuid: 'Compendium.module-z.spells.Item.fireballmodulezzz', packageId: 'module-z' });
    const cure = spell('cure-wounds');
    const inventory = [phbFire, moduleFire, cure];
    const defaultHash = hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION);
    const savedMappings: SavedSpellMapping[] = [phbFire, cure].map((selected) => ({
      logicalRefKey: logicalSpellRefKey('mixed-caster-v1', 'spells', selected.identifier!),
      selectedUuid: selected.uuid,
      rules: '2024',
      sourceInventoryHash: hashSourceInventoryMetadata(inventory),
      candidateMetadataHash: hashSourceInventoryMetadata(inventory),
      resolutionConfigHash: defaultHash,
      selectionOrigin: 'automatic-2024',
    }));
    const changedConfiguration = {
      policyVersion: '2024-first-v1' as const,
      sourcePriority: [{ packageId: 'module-z' }, { packageId: 'dnd-players-handbook' }, { packageId: 'dnd5e', packId: 'spells24' }],
    };
    const result = plan({ manifest: manifest(), candidates: inventory, savedMappings, configuration: changedConfiguration });

    expect(result.status).toBe('needs_review');
    expect('plan' in result).toBe(false);
    const fireResult = result.report.results.find((entry) => entry.refId === 'fireball');
    const cureResult = result.report.results.find((entry) => entry.refId === 'cure-wounds');
    expect(fireResult?.findings.some((finding) => finding.code === 'STALE_SAVED_SELECTION')).toBe(true);
    expect(cureResult?.status).toBe('resolved');
    expect(cureResult?.findings.some((finding) => finding.code === 'STALE_SAVED_SELECTION')).toBe(false);
  });

  test('blocks automatic writing when only the authoritative package-version inventory hash changes', () => {
    const candidates = [spell('fireball'), spell('cure-wounds')];
    const oldInventoryHash = createHash('sha256').update('packages-v1').digest('hex');
    const newInventoryHash = createHash('sha256').update('packages-v2').digest('hex');
    const savedMappings: SavedSpellMapping[] = candidates.map((selected) => ({
      logicalRefKey: logicalSpellRefKey('mixed-caster-v1', 'spells', selected.identifier!),
      selectedUuid: selected.uuid,
      rules: '2024',
      sourceInventoryHash: oldInventoryHash,
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'automatic-2024',
    }));
    const oldPlan = plan({ manifest: manifest(), candidates, sourceInventoryHash: oldInventoryHash });
    const newPlan = plan({ manifest: manifest(), candidates, sourceInventoryHash: newInventoryHash });
    const stale = plan({ manifest: manifest(), candidates, sourceInventoryHash: newInventoryHash, savedMappings });

    expect(oldPlan.status).toBe('ready');
    expect(newPlan.status).toBe('ready');
    expect(requireReady(oldPlan).plan.planHash).not.toBe(requireReady(newPlan).plan.planHash);
    expect(stale.status).toBe('needs_review');
    expect('plan' in stale).toBe(false);
    expect(requireBlocked(stale).findings.some((finding) => finding.code === 'STALE_SOURCE_INVENTORY')).toBe(true);
  });

  test('fails closed on an invalid manifest without incidental TypeErrors', () => {
    const result = plan({ manifest: { schemaVersion: 99 } as never, candidates: [] });
    expect(result.status).toBe('incompatible');
    expect('plan' in result).toBe(false);
  });

  test('rejects a missing or non-canonical authoritative source inventory hash', () => {
    const candidates = [spell('fireball'), spell('cure-wounds')];
    for (const sourceInventoryHash of [undefined, 'not-a-sha256', 'A'.repeat(64)]) {
      const result = planSpellHydration({ manifest: manifest(), candidates, sourceInventoryHash } as never);
      expect(result.status).toBe('incompatible');
      expect(requireBlocked(result).findings.some((finding) => finding.code === 'INVALID_SOURCE_INVENTORY_HASH')).toBe(true);
    }
  });

  test('fails closed on undefined and non-object planner inputs without incidental TypeErrors', () => {
    for (const input of [undefined, null, 'bad']) {
      expect(() => planSpellHydration(input as never)).not.toThrow();
      expect(planSpellHydration(input as never).status).toBe('incompatible');
    }
  });

  test('fails closed on malformed saved mappings, projections, and decisions without throwing', () => {
    const base = { manifest: manifest(), candidates: [spell('fireball'), spell('cure-wounds')] };
    const cases = [
      { ...base, savedMappings: [null] },
      { ...base, currentManagedProjection: [null, { logicalRefKey: 3n }] },
      { ...base, manualDecisions: [null, { logicalRefKey: 'bad', decision: { nested: true } }] },
      { ...base, candidates: [{ ...spell('fireball'), id: 3n }, spell('cure-wounds')] },
      { ...base, savedMappings: { not: 'an array' } },
    ];
    for (const input of cases) {
      expect(() => plan(input as never)).not.toThrow();
      const result = plan(input as never);
      expect(result.status).toBe('needs_review');
      expect('plan' in result).toBe(false);
      expect(requireBlocked(result).findings.some((finding) => finding.code === 'MALFORMED_PREFLIGHT_INPUT' || finding.code === 'MALFORMED_CANDIDATE')).toBe(true);
    }
  });
});
