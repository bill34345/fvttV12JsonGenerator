import { describe, expect, test } from 'bun:test';
import {
  hashSourceInventoryMetadata,
  hashResolutionConfiguration,
  DEFAULT_SPELL_RESOLUTION_CONFIGURATION,
  logicalSpellRefKey,
  resolveSpellRef,
  type PortableSpellRef,
  type SavedSpellMapping,
  type SpellCandidateMetadata,
} from '..';

function ref(overrides: Partial<PortableSpellRef> = {}): PortableSpellRef {
  return {
    refId: 'ref-fireball',
    identifier: 'fireball',
    originalName: '火球术',
    englishName: 'Fireball',
    chineseName: '火球术',
    aliases: ['Fire Ball'],
    expectedLevel: 3,
    expectedSchool: 'evocation',
    method: 'prepared',
    restrictions: [],
    evidence: [{ start: 0, end: 3, quote: '火球术' }],
    ...overrides,
  };
}

function candidate(overrides: Partial<SpellCandidateMetadata> = {}): SpellCandidateMetadata {
  return {
    id: 'fireball-phb',
    uuid: 'Compendium.dnd-players-handbook.spells.Item.fireballphb2024',
    packageId: 'dnd-players-handbook',
    packId: 'spells',
    name: 'Fireball',
    identifier: 'fireball',
    rules: '2024',
    sourceBook: 'PHB',
    level: 3,
    school: 'evo',
    ...overrides,
  };
}

function resolve(candidates: readonly SpellCandidateMetadata[], overrides: Partial<NonNullable<Parameters<typeof resolveSpellRef>[0]>> = {}) {
  return resolveSpellRef({
    manifestId: 'caster-v1',
    groupId: 'prepared-spells',
    ref: ref(),
    candidates,
    sourceInventoryHash: hashSourceInventoryMetadata(candidates),
    ...overrides,
  });
}

describe('deterministic destination spell resolver', () => {
  test('uses an unambiguous tuple encoding for logical ref identity', () => {
    expect(logicalSpellRefKey('a:b', 'c', 'd')).not.toBe(logicalSpellRefKey('a', 'b:c', 'd'));
    expect(logicalSpellRefKey('a', 'b', 'c:d')).not.toBe(logicalSpellRefKey('a', 'b:c', 'd'));
  });
  test('matches exact normalized identifier, English name, and explicit alias without semantic guessing', () => {
    const byIdentifier = resolve([candidate({ name: 'Other Display', identifier: 'ＦＩＲＥ＿ＢＡＬＬ' })], {
      ref: ref({ identifier: 'fire ball', englishName: undefined, aliases: [] }),
    });
    const byName = resolve([candidate({ identifier: 'other-id', name: ' FIRE—BALL ' })]);
    const byAlias = resolve([candidate({ identifier: 'other-id', name: 'fire.ball' })]);

    expect(byIdentifier.status).toBe('resolved');
    expect(byName.status).toBe('resolved');
    expect(byAlias.status).toBe('resolved');
  });

  test('treats originalName and chineseName as display evidence, not automatic keys', () => {
    const result = resolve([
      candidate({ name: '火球术', identifier: 'huo-qiu-shu' }),
    ], { ref: ref({ identifier: 'unknown', englishName: undefined, aliases: [], originalName: '火球术', chineseName: '火球术' }) });

    expect(result.status).toBe('missing');
    expect(result.trace.map((entry) => entry.code)).toContain('NO_EXACT_MATCH');
  });

  test('prefers explicit source book, then PHB, then dnd5e.spells24', () => {
    const phb = candidate();
    const core = candidate({ id: 'core', uuid: 'Compendium.dnd5e.spells24.Item.fireballcore2024', packageId: 'dnd5e', packId: 'spells24' });
    const expansion = candidate({ id: 'hof', uuid: 'Compendium.heroes-of-faerun.spells.Item.fireballhof2024', packageId: 'heroes-of-faerun', packId: 'spells', sourceBook: 'Heroes of Faerun' });

    const hinted = resolve([phb, core, expansion], { ref: ref({ sourceBookHint: 'Heroes of Faerun' }) });
    const defaulted = resolve([core, phb]);
    const coreOnly = resolve([core]);

    expect(hinted.status === 'resolved' && hinted.selected.uuid).toBe(expansion.uuid);
    expect(defaulted.status === 'resolved' && defaulted.selected.uuid).toBe(phb.uuid);
    expect(coreOnly.status === 'resolved' && coreOnly.selected.uuid).toBe(core.uuid);
  });

  test('resolves a unique expansion-only 2024 spell', () => {
    const result = resolve([candidate({ packageId: 'heroes-of-faerun', sourceBook: 'Heroes of Faerun' })]);
    expect(result.status).toBe('resolved');
    expect(result.status === 'resolved' && result.origin).toBe('automatic-2024');
  });

  test('requires review for indistinguishable remaining 2024 sources', () => {
    const a = candidate({ packageId: 'module-a', packId: 'spells', uuid: 'Compendium.module-a.spells.Item.fireballaaaaaaa' });
    const b = candidate({ packageId: 'module-b', packId: 'spells', uuid: 'Compendium.module-b.spells.Item.fireballbbbbbbb' });
    const result = resolve([b, a]);

    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'AMBIGUOUS_EXACT_MATCH')).toBe(true);
    expect(result.candidates?.map((entry) => entry.uuid)).toEqual([a.uuid, b.uuid]);
  });

  test('a contradictory same-key 2024 candidate blocks valid 2024 and 2014 choices', () => {
    const result = resolve([
      candidate(),
      candidate({ uuid: 'Compendium.module.bad.Item.fireballbadlevel', packageId: 'module-bad', level: 4 }),
      candidate({ uuid: 'Compendium.dnd5e.spells.Item.fireball2014xxxx', packageId: 'dnd5e', packId: 'spells', rules: '2014' }),
    ]);

    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'CONTRADICTORY_2024_CANDIDATE')).toBe(true);
    expect(result.trace.map((entry) => entry.code)).not.toContain('SELECT_2014_FALLBACK');
  });

  test('uses a unique 2014 exact match only when no same-key 2024 candidate exists', () => {
    const fallback = candidate({ uuid: 'Compendium.dnd5e.spells.Item.fireball2014xxxx', packageId: 'dnd5e', packId: 'spells', rules: '2014' });
    const result = resolve([fallback]);

    expect(result.status).toBe('resolved');
    expect(result.status === 'resolved' && result.origin).toBe('fallback-2014');
    expect(result.trace.map((entry) => entry.code)).toContain('SELECT_2014_FALLBACK');
  });

  test('missing rules on a same-key candidate requires review', () => {
    const result = resolve([candidate({ rules: undefined })]);
    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'MISSING_RULES_METADATA')).toBe(true);
  });

  test('ignores an unrelated future rules generation but reviews it when it shares the exact logical key', () => {
    const unrelatedFuture = candidate({ name: 'Ice Storm', identifier: 'ice-storm', rules: '2025' as never, level: 4 });
    const valid = resolve([candidate(), unrelatedFuture]);
    const sameKey = resolve([candidate({ rules: '2025' as never })]);
    expect(valid.status).toBe('resolved');
    expect(sameKey.status).toBe('needs_review');
    expect(sameKey.findings.some((finding) => finding.code === 'UNSUPPORTED_RULES_METADATA')).toBe(true);
  });

  test('applies source-book hints consistently to first-time 2014 fallback selection', () => {
    const phb = candidate({ rules: '2014', packageId: 'legacy-phb', sourceBook: 'PHB', uuid: 'Compendium.legacy-phb.spells.Item.fireballlegacyphb' });
    const xge = candidate({ rules: '2014', packageId: 'legacy-xge', sourceBook: 'XGE', uuid: 'Compendium.legacy-xge.spells.Item.fireballlegacyxge' });
    const selected = resolve([xge, phb], { ref: ref({ sourceBookHint: 'PHB' }) });
    const reused = resolve([xge, phb], {
      ref: ref({ sourceBookHint: 'PHB' }),
      savedMapping: {
        logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
        selectedUuid: phb.uuid,
        rules: '2014',
        sourceInventoryHash: hashSourceInventoryMetadata([xge, phb]),
        candidateMetadataHash: hashSourceInventoryMetadata([xge, phb]),
        resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
        selectionOrigin: 'fallback-2014',
      },
    });
    const mismatch = resolve([xge], { ref: ref({ sourceBookHint: 'PHB' }) });
    const missing = resolve([candidate({ rules: '2014', sourceBook: undefined })], { ref: ref({ sourceBookHint: 'PHB' }) });
    expect(selected.status).toBe('resolved');
    expect(selected.status === 'resolved' && selected.selected.uuid).toBe(phb.uuid);
    expect(reused.status).toBe('resolved');
    expect(reused.status === 'resolved' && reused.selected.uuid).toBe(phb.uuid);
    expect(mismatch.status).toBe('needs_review');
    expect(mismatch.findings.some((finding) => finding.code === 'SOURCE_BOOK_HINT_UNSATISFIED')).toBe(true);
    expect(missing.status).toBe('needs_review');
  });

  test('reuses a saved mapping only when UUID, facts, rules, and inventory hash remain valid', () => {
    const selected = candidate({ packageId: 'module-z' });
    const candidates = [selected];
    const mapping: SavedSpellMapping = {
      logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
      selectedUuid: selected.uuid,
      rules: '2024',
      sourceInventoryHash: hashSourceInventoryMetadata(candidates),
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'automatic-2024',
    };
    const result = resolve(candidates, { savedMapping: mapping });

    expect(result.status).toBe('resolved');
    expect(result.status === 'resolved' && result.origin).toBe('automatic-2024');
    expect(result.trace[0]?.code).toBe('REUSE_SAVED_MAPPING');
  });

  test('reuses a saved 2014 fallback only after proving it remains the unique fallback with no 2024 key', () => {
    const selected = candidate({ rules: '2014', packageId: 'dnd5e', packId: 'spells', uuid: 'Compendium.dnd5e.spells.Item.fireball2014xxxx' });
    const candidates = [selected];
    const result = resolve(candidates, { savedMapping: {
      logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
      selectedUuid: selected.uuid,
      rules: '2014',
      sourceInventoryHash: hashSourceInventoryMetadata(candidates),
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'fallback-2014',
    } });
    expect(result.status).toBe('resolved');
    expect(result.status === 'resolved' && result.origin).toBe('fallback-2014');
  });

  test('preserves manual-review provenance when reusing an explicitly reviewed concrete choice', () => {
    const selected = candidate({ packageId: 'module-a', uuid: 'Compendium.module-a.spells.Item.fireballmanualaaa' });
    const other = candidate({ packageId: 'module-b', uuid: 'Compendium.module-b.spells.Item.fireballmanualbbb' });
    const candidates = [selected, other];
    const result = resolve(candidates, { savedMapping: {
      logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
      selectedUuid: selected.uuid,
      rules: '2024',
      sourceInventoryHash: hashSourceInventoryMetadata(candidates),
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'manual-review',
    } });
    expect(result.status).toBe('resolved');
    expect(result.status === 'resolved' && result.origin).toBe('manual-review');
  });

  test('does not allow a manual-review mapping to bypass an available same-key 2024 spell for 2014', () => {
    const legacy = candidate({ rules: '2014', packageId: 'legacy', uuid: 'Compendium.legacy.spells.Item.fireballmanual14x' });
    const modern = candidate();
    const candidates = [legacy, modern];
    const result = resolve(candidates, { savedMapping: {
      logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
      selectedUuid: legacy.uuid,
      rules: '2014',
      sourceInventoryHash: hashSourceInventoryMetadata(candidates),
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'manual-review',
    } });
    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'INVALID_SAVED_MAPPING')).toBe(true);
  });

  test('does not reuse a saved 2014 fallback while any same-key unsupported rules candidate exists', () => {
    const legacy = candidate({ rules: '2014', packageId: 'legacy', uuid: 'Compendium.legacy.spells.Item.fireballlegacy14x' });
    const future = candidate({ rules: '2025' as never, packageId: 'future', uuid: 'Compendium.future.spells.Item.fireballfuture25x' });
    const candidates = [legacy, future];
    const result = resolve(candidates, { savedMapping: {
      logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
      selectedUuid: legacy.uuid,
      rules: '2014',
      sourceInventoryHash: hashSourceInventoryMetadata(candidates),
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'fallback-2014',
    } });
    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'INVALID_SAVED_MAPPING')).toBe(true);
  });

  test.each([
    ['missing UUID', (mapping: SavedSpellMapping) => ({ ...mapping, selectedUuid: 'Compendium.missing.spells.Item.missingxxxxxxxxx' })],
    ['wrong rules', (mapping: SavedSpellMapping) => ({ ...mapping, rules: '2014' as const })],
    ['wrong ref key', (mapping: SavedSpellMapping) => ({ ...mapping, logicalRefKey: 'other:key' })],
  ])('invalidates a saved mapping with %s', (_label, mutate) => {
    const selected = candidate();
    const candidates = [selected];
    const mapping = mutate({
      logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
      selectedUuid: selected.uuid,
      rules: '2024',
      sourceInventoryHash: hashSourceInventoryMetadata(candidates),
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'automatic-2024',
    });
    const result = resolve(candidates, { savedMapping: mapping });

    expect(result.status).not.toBe('resolved');
    expect(result.findings.some((finding) => finding.code === 'INVALID_SAVED_MAPPING')).toBe(true);
  });

  test('returns near-name suggestions for review only and keeps close negatives unresolved', () => {
    const near = candidate({ identifier: 'fire-bolt', name: 'Fire Bolt', level: 0 });
    const suggestion = resolve([near]);
    const unrelated = resolve([candidate({ identifier: 'ice-storm', name: 'Ice Storm', level: 4 })]);

    expect(suggestion.status).toBe('needs_review');
    expect(suggestion.suggestions?.map((entry) => entry.uuid)).toEqual([near.uuid]);
    expect(unrelated.status).toBe('missing');
    expect(unrelated.suggestions).toEqual([]);
  });

  test('reuses an explicitly reviewed approximate suggestion when inventory, constraints, and rules remain valid', () => {
    const near = candidate({ identifier: 'fireballl', name: 'Fireballl' });
    const candidates = [near];
    const first = resolve(candidates);
    expect(first.status).toBe('needs_review');
    expect(first.suggestions?.map((entry) => entry.uuid)).toEqual([near.uuid]);

    const reviewed = resolve(candidates, { savedMapping: {
      logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
      selectedUuid: near.uuid,
      rules: '2024',
      sourceInventoryHash: hashSourceInventoryMetadata(candidates),
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'manual-review',
    } });
    expect(reviewed.status).toBe('resolved');
    expect(reviewed.status === 'resolved' && reviewed.origin).toBe('manual-review');
    expect(reviewed.status === 'resolved' && reviewed.selected.uuid).toBe(near.uuid);
  });

  test.each([
    ['level', { level: 4 }],
    ['school', { school: 'abj' }],
    ['source book', { sourceBook: 'XGE' }],
  ] as const)('rejects reviewed approximate selection with contradictory %s metadata', (_label, contradiction) => {
    const near = candidate({ identifier: 'fireballl', name: 'Fireballl', ...contradiction });
    const candidates = [near];
    const result = resolve(candidates, {
      ref: ref({ sourceBookHint: 'PHB' }),
      savedMapping: {
        logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
        selectedUuid: near.uuid,
        rules: '2024',
        sourceInventoryHash: hashSourceInventoryMetadata(candidates),
        candidateMetadataHash: hashSourceInventoryMetadata(candidates),
        resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
        selectionOrigin: 'manual-review',
      },
    });
    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'INVALID_SAVED_MAPPING')).toBe(true);
  });

  test.each([
    ['exact same-key 2024', [candidate({ rules: '2014', identifier: 'fireballl', name: 'Fireballl', packageId: 'legacy', uuid: 'Compendium.legacy.spells.Item.fireballlegacy14x' }), candidate()]],
    ['approximate 2024', [candidate({ rules: '2014', identifier: 'fireballl', name: 'Fireballl', packageId: 'legacy', uuid: 'Compendium.legacy.spells.Item.fireballlegacy14x' }), candidate({ identifier: 'firebal', name: 'Firebal' })]],
  ] as const)('does not let a reviewed approximate 2014 choice bypass %s', (_label, candidates) => {
    const legacy = candidates[0]!;
    const result = resolve(candidates, { savedMapping: {
      logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
      selectedUuid: legacy.uuid,
      rules: '2014',
      sourceInventoryHash: hashSourceInventoryMetadata(candidates),
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'manual-review',
    } });
    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'INVALID_SAVED_MAPPING')).toBe(true);
  });

  test('requires review for multiple equivalent 2014 exact matches', () => {
    const a = candidate({ rules: '2014', packageId: 'legacy-a', uuid: 'Compendium.legacy-a.spells.Item.fireball2014aaa' });
    const b = candidate({ rules: '2014', packageId: 'legacy-b', uuid: 'Compendium.legacy-b.spells.Item.fireball2014bbb' });
    const result = resolve([a, b]);
    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'AMBIGUOUS_2014_FALLBACK')).toBe(true);
  });

  test('rejects a saved UUID whose candidate contradicts source facts', () => {
    const bad = candidate({ level: 4 });
    const candidates = [bad];
    const result = resolve(candidates, { savedMapping: {
      logicalRefKey: logicalSpellRefKey('caster-v1', 'prepared-spells', 'ref-fireball'),
      selectedUuid: bad.uuid,
      rules: '2024',
      sourceInventoryHash: hashSourceInventoryMetadata(candidates),
      candidateMetadataHash: hashSourceInventoryMetadata(candidates),
      resolutionConfigHash: hashResolutionConfiguration(DEFAULT_SPELL_RESOLUTION_CONFIGURATION),
      selectionOrigin: 'automatic-2024',
    } });
    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'INVALID_SAVED_MAPPING')).toBe(true);
  });

  test.each([
    ['abjuration', 'abj'],
    ['conjuration', 'con'],
    ['divination', 'div'],
    ['enchantment', 'enc'],
    ['evocation', 'evo'],
    ['illusion', 'ill'],
    ['necromancy', 'nec'],
    ['transmutation', 'trs'],
  ] as const)('matches manifest school full name %s to the dnd5e 5.3.3 document code %s', (expectedSchool, school) => {
    // Locked reference: dnd5e 5.3.3 CONFIG.DND5E.spellSchools uses these
    // three-letter object keys and exposes the manifest-facing name as fullKey.
    const result = resolve([candidate({ school })], { ref: ref({ expectedSchool }) });
    expect(result.status).toBe('resolved');
  });

  test('still rejects a different real dnd5e school code and ignores school when the manifest has no expectation', () => {
    const contradictory = resolve([candidate({ school: 'abj' })]);
    const unconstrained = resolve([candidate({ school: 'future-school-code' })], {
      ref: ref({ expectedSchool: undefined }),
    });

    expect(contradictory.status).toBe('needs_review');
    expect(contradictory.findings.some((finding) => finding.code === 'CONTRADICTORY_2024_CANDIDATE')).toBe(true);
    expect(unconstrained.status).toBe('resolved');
  });

  test('requires review when an explicit source hint cannot be checked due to missing book metadata', () => {
    const result = resolve([candidate({ sourceBook: undefined })], { ref: ref({ sourceBookHint: 'PHB' }) });
    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'CONTRADICTORY_2024_CANDIDATE' || finding.code === 'MISSING_SOURCE_BOOK_METADATA')).toBe(true);
  });

  test('supports a second unrelated caster family without creature-specific logic', () => {
    const cure = candidate({ id: 'cure', uuid: 'Compendium.dnd-players-handbook.spells.Item.curewounds2024x', name: 'Cure Wounds', identifier: 'cure-wounds', level: 1, school: 'abj' });
    const result = resolve([cure], { manifestId: 'priest-v1', groupId: 'daily', ref: ref({ refId: 'cure', identifier: 'cure-wounds', originalName: 'Cure Wounds', englishName: 'Cure Wounds', chineseName: undefined, aliases: [], expectedLevel: 1, expectedSchool: 'abjuration' }) });
    expect(result.status).toBe('resolved');
  });

  test('is deterministic under candidate permutation and does not mutate inputs', () => {
    const a = candidate({ packageId: 'module-a', uuid: 'Compendium.module-a.spells.Item.fireballaaaaaaa' });
    const b = candidate({ packageId: 'module-b', uuid: 'Compendium.module-b.spells.Item.fireballbbbbbbb' });
    const candidates = [b, a];
    const original = structuredClone(candidates);

    const first = resolve(candidates);
    const second = resolve([...candidates].reverse());

    expect(first).toEqual(second);
    expect(candidates).toEqual(original);
  });

  test('fails closed on malformed touched metadata without incidental TypeErrors', () => {
    const result = resolve([{ ...candidate(), rules: 2024 as never }, null as never]);
    expect(result.status).toBe('needs_review');
    expect(result.findings.some((finding) => finding.code === 'MALFORMED_CANDIDATE')).toBe(true);
  });

  test('fails closed on a non-object resolver call without incidental TypeErrors', () => {
    expect(() => resolveSpellRef(null as never)).not.toThrow();
    expect(resolveSpellRef(null as never).status).toBe('needs_review');
  });

  test('rejects a missing or non-canonical authoritative inventory hash', () => {
    const candidates = [candidate()];
    for (const sourceInventoryHash of [undefined, 'not-a-sha256', 'A'.repeat(64)]) {
      const result = resolveSpellRef({
        manifestId: 'caster-v1', groupId: 'spells', ref: ref(), candidates,
        sourceInventoryHash,
      } as never);
      expect(result.status).toBe('needs_review');
      expect(result.findings.some((finding) => finding.code === 'MALFORMED_RESOLUTION_INPUT')).toBe(true);
    }
  });

  test('rejects empty public API identity components instead of resolving an empty logical key', () => {
    const candidates = [candidate()];
    for (const [manifestId, groupId] of [['', 'spells'], ['caster-v1', ''], ['   ', 'spells']] as const) {
      const result = resolveSpellRef({ manifestId, groupId, ref: ref(), candidates, sourceInventoryHash: hashSourceInventoryMetadata(candidates) });
      expect(result.status).toBe('needs_review');
      expect(result.findings.some((finding) => finding.code === 'MALFORMED_RESOLUTION_INPUT')).toBe(true);
    }
  });
});
