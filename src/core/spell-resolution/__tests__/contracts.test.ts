import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import {
  RESOLVER_MODULE_ID,
  hashManagedProjection,
  hashManifest,
  validatePortableSpellManifest,
  validatePortableSpellManifestStructure,
  type PortableSpellManifest,
} from '..';

const SOURCE = [
  'Innate Spellcasting (Charisma, save DC 12, +4 to hit).',
  'At will: eldritch blast, mage armor (self only), minor illusion, thaumaturgy.',
  '1/day each: augury, burning hands, conjure animals (giant rats only), faerie fire, invisibility, misty step.',
].join('\n');

const SPELLS = [
  ['eldritch-blast', 'Eldritch Blast'],
  ['mage-armor', 'Mage Armor'],
  ['minor-illusion', 'Minor Illusion'],
  ['thaumaturgy', 'Thaumaturgy'],
  ['augury', 'Augury'],
  ['burning-hands', 'Burning Hands'],
  ['conjure-animals', 'Conjure Animals'],
  ['faerie-fire', 'Faerie Fire'],
  ['invisibility', 'Invisibility'],
  ['misty-step', 'Misty Step'],
] as const;

function evidence(quote: string) {
  const start = SOURCE.indexOf(quote);
  if (start < 0) throw new Error(`Missing test quote: ${quote}`);
  return { start, end: start + quote.length, quote };
}

function buildValidManifest(): PortableSpellManifest {
  const makeRef = (identifier: string, originalName: string, index: number) => ({
    refId: `rat-spell-${index + 1}`,
    identifier,
    originalName,
    englishName: originalName,
    aliases: [],
    expectedLevel: identifier === 'eldritch-blast' ? 0 : undefined,
    expectedSchool: identifier === 'eldritch-blast' ? 'evocation' : undefined,
    method: index < 4 ? 'at-will' as const : 'innate' as const,
    uses: index < 4 ? undefined : { value: 1, recovery: 'day' as const, shared: false },
    ignoresMaterialComponents: true,
    restrictions: identifier === 'mage-armor' ? [{
      kind: 'target' as const,
      value: 'self',
      text: 'self only',
      evidence: [evidence('self only')],
    }] : [],
    evidence: [evidence(originalName.toLowerCase())],
  });

  return {
    schemaVersion: 1,
    manifestId: 'rat-warlock-spells-v1',
    sourceSha256: createHash('sha256').update(SOURCE).digest('hex'),
    rulesPreference: '2024',
    spellcastingGroups: [
      {
        groupId: 'rat-at-will',
        featureItemKey: 'innate-spellcasting',
        ability: 'cha',
        saveDc: 12,
        attackBonus: 4,
        spellRefs: SPELLS.slice(0, 4).map(([identifier, name], index) => makeRef(identifier, name, index)),
      },
      {
        groupId: 'rat-once-daily',
        featureItemKey: 'innate-spellcasting',
        ability: 'cha',
        saveDc: 12,
        attackBonus: 4,
        spellRefs: SPELLS.slice(4).map(([identifier, name], index) => makeRef(identifier, name, index + 4)),
      },
    ],
  };
}

function cloneAsUnknown(value: unknown): any {
  return structuredClone(value);
}

function expectFinding(value: unknown, code: string, path: string, message: string) {
  const result = validatePortableSpellManifest(value, SOURCE);
  expect(result.ok).toBeFalse();
  if (result.ok) throw new Error('Expected validation to fail.');
  const finding = result.findings.find((entry) => entry.code === code && entry.path === path);
  expect(finding).toEqual(expect.objectContaining({
    code,
    path,
    message,
    blocking: true,
    evidence: expect.any(Array),
  }));
  return result.findings;
}

describe('portable spell manifest contract', () => {
  test('exports the stable module id and accepts the source-backed ten-spell Rat manifest without coercion', () => {
    const manifest = buildValidManifest();

    expect(RESOLVER_MODULE_ID).toBe('fvtt-json-generator-spell-resolver');
    expect(validatePortableSpellManifest(manifest, SOURCE)).toEqual({ ok: true, value: manifest });
  });

  test.each([
    ['zero-length', 0, 0, ''],
    ['unsafe-integer', Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1, ''],
  ])('rejects %s evidence at both structural and source-backed boundaries', (_label, start, end, quote) => {
    const manifest = cloneAsUnknown(buildValidManifest());
    manifest.spellcastingGroups[0].spellRefs[0].evidence = [{ start, end, quote }];

    for (const result of [
      validatePortableSpellManifestStructure(manifest),
      validatePortableSpellManifest(manifest, SOURCE),
    ]) {
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected evidence validation to fail.');
      expect(result.findings).toContainEqual(expect.objectContaining({
        code: 'INVALID_EVIDENCE',
        path: '/spellcastingGroups/0/spellRefs/0/evidence/0',
        blocking: true,
      }));
    }
  });

  test.each([
    'Compendium.dnd5e.spells.Item.abcdefghijklmnop',
    'Actor.abcdefghijklmnop',
    'Actor.abcdefghijklmnop.Item.ponmlkjihgfedcba',
    'Item.abcdefghijklmnop',
  ])('rejects target-world identifier text at the exact manifest paths: %s', (targetIdentifier) => {
    const manifest = cloneAsUnknown(buildValidManifest());
    const ref = manifest.spellcastingGroups[0].spellRefs[0];
    ref.originalName = targetIdentifier;
    ref.evidence = [{ start: 0, end: targetIdentifier.length, quote: targetIdentifier }];

    const result = validatePortableSpellManifestStructure(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected target identifier validation to fail.');
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'FORBIDDEN_TARGET_WORLD_IDENTIFIER',
      path: '/spellcastingGroups/0/spellRefs/0/originalName',
      blocking: true,
    }));
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: 'FORBIDDEN_TARGET_WORLD_IDENTIFIER',
      path: '/spellcastingGroups/0/spellRefs/0/evidence/0/quote',
      blocking: true,
    }));
  });

  test('allows ordinary item and compendium prose without UUID syntax', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    const prose = 'An item may appear in a compendium without naming a destination document.';
    const ref = manifest.spellcastingGroups[0].spellRefs[0];
    ref.originalName = prose;
    ref.evidence = [{ start: 0, end: prose.length, quote: prose }];

    expect(validatePortableSpellManifestStructure(manifest).ok).toBe(true);
  });

  test('rejects an unknown schema version rather than coercing it', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    manifest.schemaVersion = '1';

    expectFinding(manifest, 'UNSUPPORTED_SCHEMA_VERSION', '/schemaVersion', '不支持的法术清单 schemaVersion；当前只接受数字 1。');
  });

  test('rejects an identifier that collides with manifestId', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    manifest.spellcastingGroups[0].groupId = manifest.manifestId;

    expectFinding(manifest, 'DUPLICATE_ID', '/spellcastingGroups/0/groupId', '标识 rat-warlock-spells-v1 与 manifestId 重复。');
  });

  test('rejects duplicate groupId values', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    manifest.spellcastingGroups[1].groupId = manifest.spellcastingGroups[0].groupId;

    expectFinding(manifest, 'DUPLICATE_ID', '/spellcastingGroups/1/groupId', '标识 rat-at-will 已在清单中使用。');
  });

  test('rejects duplicate refId values', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    manifest.spellcastingGroups[1].spellRefs[0].refId = manifest.spellcastingGroups[0].spellRefs[0].refId;

    expectFinding(manifest, 'DUPLICATE_ID', '/spellcastingGroups/1/spellRefs/0/refId', '标识 rat-spell-1 已在清单中使用。');
  });

  test('rejects an unsupported ability instead of normalizing it', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    manifest.spellcastingGroups[0].ability = 'CHA';

    expectFinding(manifest, 'INVALID_ABILITY', '/spellcastingGroups/0/ability', '施法关键属性必须是 str、dex、con、int、wis 或 cha。');
  });

  test('rejects an unsupported recovery instead of normalizing it', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    manifest.spellcastingGroups[1].spellRefs[0].uses.recovery = 'dawn';

    expectFinding(manifest, 'INVALID_RECOVERY', '/spellcastingGroups/1/spellRefs/0/uses/recovery', '恢复周期必须是 day、shortRest 或 longRest。');
  });

  test('rejects non-positive or string uses values', () => {
    const zero = cloneAsUnknown(buildValidManifest());
    zero.spellcastingGroups[1].spellRefs[0].uses.value = 0;
    expectFinding(zero, 'INVALID_USES_VALUE', '/spellcastingGroups/1/spellRefs/0/uses/value', '使用次数必须是正整数。');

    const stringValue = cloneAsUnknown(buildValidManifest());
    stringValue.spellcastingGroups[1].spellRefs[0].uses.value = '1';
    expectFinding(stringValue, 'INVALID_USES_VALUE', '/spellcastingGroups/1/spellRefs/0/uses/value', '使用次数必须是正整数。');
  });

  test('rejects contradictory shared-use declarations', () => {
    const singleton = cloneAsUnknown(buildValidManifest());
    singleton.spellcastingGroups[1].spellRefs[0].uses.shared = true;
    expectFinding(singleton, 'INVALID_SHARED_USE', '/spellcastingGroups/1/spellRefs/0/uses/shared', '共享使用次数至少需要同组两个具有相同次数和恢复周期的法术。');

    const conflictingPool = cloneAsUnknown(buildValidManifest());
    conflictingPool.spellcastingGroups[1].spellRefs[0].uses.shared = true;
    conflictingPool.spellcastingGroups[1].spellRefs[1].uses.shared = true;
    conflictingPool.spellcastingGroups[1].spellRefs[1].uses.value = 2;
    expectFinding(conflictingPool, 'INVALID_SHARED_USE', '/spellcastingGroups/1/spellRefs/1/uses/shared', '同组共享使用次数的 value 和 recovery 必须一致。');
  });

  test('rejects missing identifiers and missing spell names', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    const ref = manifest.spellcastingGroups[0].spellRefs[0];
    ref.identifier = '';
    ref.originalName = '';
    ref.englishName = '   ';
    ref.chineseName = '';

    const findings = expectFinding(manifest, 'MISSING_IDENTIFIER', '/spellcastingGroups/0/spellRefs/0/identifier', '法术引用必须提供非空 identifier。');
    expect(findings).toContainEqual(expect.objectContaining({
      code: 'MISSING_SPELL_NAME',
      path: '/spellcastingGroups/0/spellRefs/0/originalName',
      message: '法术引用必须至少提供一个非空名称。',
      blocking: true,
      evidence: expect.any(Array),
    }));
  });

  test('rejects evidence whose quote does not match the exact source range', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    manifest.spellcastingGroups[0].spellRefs[0].evidence[0].quote = 'Eldritch Blast';

    expectFinding(manifest, 'EVIDENCE_MISMATCH', '/spellcastingGroups/0/spellRefs/0/evidence/0', '证据摘录与源文本 UTF-16 范围不完全一致。');
  });

  test('rejects invalid expected spell level and school', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    const ref = manifest.spellcastingGroups[0].spellRefs[0];
    ref.expectedLevel = 10;
    ref.expectedSchool = 'Evocation';

    const findings = expectFinding(manifest, 'INVALID_EXPECTED_LEVEL', '/spellcastingGroups/0/spellRefs/0/expectedLevel', '预期法术环阶必须是 0 到 9 的整数。');
    expect(findings).toContainEqual(expect.objectContaining({
      code: 'INVALID_EXPECTED_SCHOOL',
      path: '/spellcastingGroups/0/spellRefs/0/expectedSchool',
      message: '预期法术学派必须使用受支持的小写标识。',
    }));
  });

  test('rejects duplicate logical spells even when their refId values differ', () => {
    const manifest = cloneAsUnknown(buildValidManifest());
    manifest.spellcastingGroups[1].spellRefs[0].identifier = 'ELDRITCH_BLAST';
    manifest.spellcastingGroups[1].spellRefs[0].originalName = 'Other display name';

    expectFinding(manifest, 'DUPLICATE_LOGICAL_SPELL', '/spellcastingGroups/1/spellRefs/0/identifier', '逻辑法术 eldritch-blast 在清单中重复。');
  });

  test.each([
    ['manifest', '/futureSemantic', (manifest: any) => { manifest.futureSemantic = { mode: 'future' }; }],
    ['group', '/spellcastingGroups/0/futureSemantic', (manifest: any) => { manifest.spellcastingGroups[0].futureSemantic = true; }],
    ['ref', '/spellcastingGroups/0/spellRefs/0/futureSemantic', (manifest: any) => { manifest.spellcastingGroups[0].spellRefs[0].futureSemantic = 1; }],
    ['uses', '/spellcastingGroups/1/spellRefs/0/uses/futureSemantic', (manifest: any) => { manifest.spellcastingGroups[1].spellRefs[0].uses.futureSemantic = 'x'; }],
    ['restriction', '/spellcastingGroups/0/spellRefs/1/restrictions/0/futureSemantic', (manifest: any) => { manifest.spellcastingGroups[0].spellRefs[1].restrictions[0].futureSemantic = false; }],
    ['EvidenceRef', '/spellcastingGroups/0/spellRefs/0/evidence/0/futureSemantic', (manifest: any) => { manifest.spellcastingGroups[0].spellRefs[0].evidence[0].futureSemantic = 'x'; }],
  ])('rejects unknown properties at the %s contract level before hashing', (_level, path, mutate) => {
    const manifest = cloneAsUnknown(buildValidManifest());
    mutate(manifest);

    expectFinding(manifest, 'UNKNOWN_PROPERTY', path, '法术清单不允许未知字段 futureSemantic。');
    expect(() => hashManifest(manifest)).toThrow(`无法哈希包含未知字段的法术清单：${path}。`);
  });

  test.each([NaN, Infinity, -Infinity])('rejects non-finite restriction numeric value %p before canonical hashing', (value) => {
    const manifest = cloneAsUnknown(buildValidManifest());
    manifest.spellcastingGroups[0].spellRefs[1].restrictions[0].value = value;
    const path = '/spellcastingGroups/0/spellRefs/1/restrictions/0/value';

    expectFinding(manifest, 'INVALID_RESTRICTION_VALUE', path, '限制 value 的数字必须是有限值。');
    expect(() => hashManifest(manifest)).toThrow(`无法哈希非有限数字：${path}。`);
  });
});

describe('stable hashes', () => {
  test('hashManifest is independent of object key insertion order and changes for semantic manifest data', () => {
    const manifest = buildValidManifest();
    const reordered = reverseKeyOrder(manifest) as PortableSpellManifest;
    const semanticChange = cloneAsUnknown(manifest);
    semanticChange.spellcastingGroups[0].attackBonus = 5;

    expect(hashManifest(reordered)).toBe(hashManifest(manifest));
    expect(hashManifest(semanticChange)).not.toBe(hashManifest(manifest));
  });

  test('hashManagedProjection ignores only named volatile Foundry state including uses.spent', () => {
    const managed = buildManagedSpell();
    const afterCast = cloneAsUnknown(managed);
    afterCast.system.uses.spent = 1;
    afterCast.sort = 900;
    afterCast.folder = 'Folder.changed';
    afterCast.ownership.default = 3;
    afterCast._stats.modifiedTime = 999;
    afterCast._stats.coreVersion = '14.364';
    afterCast._stats.systemVersion = '5.3.3';
    afterCast.chat = { messageId: 'runtime-message' };

    expect(hashManagedProjection(afterCast)).toBe(hashManagedProjection(managed));
  });

  test('hashManagedProjection ignores foreign flag namespaces and non-provenance dnd5e runtime flags', () => {
    const managed = buildManagedSpell();
    const foreignRuntimeChange = cloneAsUnknown(managed);
    foreignRuntimeChange.flags['foreign-module'] = { cache: 'changed', runtimeCounter: 99 };
    foreignRuntimeChange.flags.dnd5e.runtimeCache = { preparedAt: 999 };

    expect(hashManagedProjection(foreignRuntimeChange)).toBe(hashManagedProjection(managed));
  });

  test('hashManagedProjection keeps resolver ownership and manual-edit fields managed', () => {
    const managed = buildManagedSpell();
    const ownershipChange = cloneAsUnknown(managed);
    ownershipChange.flags[RESOLVER_MODULE_ID].manualEdit = { decision: 'keep' };

    expect(hashManagedProjection(ownershipChange)).not.toBe(hashManagedProjection(managed));
  });

  test.each([
    ['attack', (value: any) => { value.system.activities.cast.spell.challenge.attack = '5'; }],
    ['save', (value: any) => { value.system.activities.cast.spell.challenge.save = '13'; }],
    ['target', (value: any) => { value.system.activities.cast.target.template.type = 'cone'; }],
    ['description', (value: any) => { value.system.description.value = '<p>Edited rules.</p>'; }],
  ])('hashManagedProjection treats %s as resolver-managed content', (_label, mutate) => {
    const managed = buildManagedSpell();
    const edited = cloneAsUnknown(managed);
    mutate(edited);

    expect(hashManagedProjection(edited)).not.toBe(hashManagedProjection(managed));
  });
});

function buildManagedSpell() {
  return {
    _id: 'managed-spell-1',
    name: 'Burning Hands',
    type: 'spell',
    system: {
      description: { value: '<p>Rules text.</p>' },
      uses: { max: '1', spent: 0, recovery: [{ period: 'day', type: 'recoverAll' }] },
      activities: {
        cast: {
          type: 'cast',
          spell: { ability: 'cha', challenge: { override: true, attack: '4', save: '12' } },
          target: { template: { type: 'cube', size: '15' } },
        },
      },
    },
    flags: {
      dnd5e: { cachedFor: 'activity-id', runtimeCache: { preparedAt: 1 } },
      [RESOLVER_MODULE_ID]: { manifestId: 'rat-warlock-spells-v1', groupId: 'rat-once-daily', refId: 'rat-spell-6' },
      'foreign-module': { cache: 'initial', runtimeCounter: 1 },
    },
    sort: 100,
    folder: null,
    ownership: { default: 0 },
    _stats: { compendiumSource: 'Compendium.dnd-players-handbook.spells.Item.id', createdTime: 1, modifiedTime: 1 },
    chat: { messageId: null },
  };
}

function reverseKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeyOrder);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeyOrder(entry)]));
}
