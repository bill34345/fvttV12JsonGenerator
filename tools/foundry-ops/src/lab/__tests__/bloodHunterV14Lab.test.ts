import { describe, expect, test } from 'bun:test';

import {
  BLOOD_HUNTER_V14_CORE_DISABLED_MODULE_IDS,
  BLOOD_HUNTER_V14_DND5E_VERSION,
  BLOOD_HUNTER_V14_FOUNDRY_VERSION,
  BLOOD_HUNTER_V14_MATRIX_WORLD_ID,
  BLOOD_HUNTER_V14_MODDED_DISABLED_MODULE_IDS,
  BLOOD_HUNTER_V14_MODULE_ID,
  BLOOD_HUNTER_V14_MODULE_VERSION,
  BLOOD_HUNTER_V14_PACK_DECLARATIONS,
  createBloodHunterE2EManifest,
  inspectBloodHunterV14Lab,
  planBloodHunterV14MatrixWorld,
  verifyBloodHunterActorSnapshot,
  verifyCallumMigrationSnapshots,
  type JsonRecord,
} from '../bloodHunterV14Lab';

function activity(id: string, effectIds: string[] = []): JsonRecord {
  return {
    _id: id,
    type: 'utility',
    name: id,
    effects: effectIds.map((_id) => ({ _id })),
  };
}

function canonicalItem(options: {
  id: string;
  name: string;
  type?: string;
  group: string;
  level?: number;
  subclassShortName?: string;
  sourceKey?: string;
  activities?: JsonRecord[];
  effects?: JsonRecord[];
  sourceIdentityName?: string;
}): JsonRecord {
  const sourceIdentity = {
    source: 'BloodHunter2024',
    group: options.group,
    normalizedName: options.sourceIdentityName ?? options.name,
    ...(options.level === undefined ? {} : { level: options.level }),
    ...(options.subclassShortName ? { subclassShortName: options.subclassShortName } : {}),
    ...(options.group !== 'class' ? { className: '血猎手' } : {}),
  };
  const activities = Object.fromEntries((options.activities ?? []).map((entry) => [entry._id, entry]));
  return {
    _id: options.id,
    name: options.name,
    type: options.type ?? (options.group === 'class' ? 'class' : options.group === 'subclass' ? 'subclass' : 'feat'),
    system: {
      source: { custom: 'BloodHunter2024', rules: '2024' },
      activities,
    },
    effects: options.effects ?? [],
    flags: {
      fvttJsonGenerator: {
        bloodHunter2024: {
          sourceKey: options.sourceKey ?? `${options.group}/${options.id}`,
          sourceIdentity,
          canonicalId: options.id,
          moduleVersion: '1.0.0',
          automation: 'native',
        },
      },
    },
  };
}

function dawnItem(id = 'dawn-canonical', canonical = true): JsonRecord {
  const effects = [
    { _id: 'dawn-effect-1', name: 'Dawn primary effect', type: 'enchantment' },
    { _id: 'dawn-effect-2', name: 'Dawn assisted effect', type: 'base' },
  ];
  const item = canonicalItem({
    id,
    name: '破晓血仪',
    group: 'optionalfeature',
    level: 3,
    sourceKey: 'optionalfeature/rite-of-the-dawn',
    sourceIdentityName: 'rite-of-the-dawn',
    activities: [
      activity('dawn-activity-1', ['dawn-effect-1']),
      activity('dawn-activity-2', ['dawn-effect-2']),
      activity('dawn-activity-3'),
      activity('dawn-activity-4'),
      activity('dawn-activity-5'),
    ],
    effects,
  });
  if (!canonical) {
    const flags = item.flags as JsonRecord;
    flags.fvttJsonGenerator = {};
    item.system = { source: { custom: 'BloodHunter2024' }, activities: {} };
    item.effects = [];
    item.legacyIdentity = {
      source: 'BloodHunter2024',
      className: '血猎手',
      subclassShortName: '弑灵',
      level: 3,
      name: 'Rite of the Dawn',
    };
  }
  return item;
}

function actorSnapshot(options: {
  level: number;
  subclassShortName?: string;
  includeDawn?: boolean;
  extraItems?: JsonRecord[];
}): JsonRecord {
  const subclassShortName = options.subclassShortName ?? '弑灵';
  const classItem = canonicalItem({ id: 'class-blood-hunter', name: '血猎手', group: 'class', sourceKey: 'class/blood-hunter' });
  const subclassItem = canonicalItem({
    id: `subclass-${subclassShortName}`,
    name: `${subclassShortName}结社`,
    group: 'subclass',
    subclassShortName,
    sourceKey: `subclass/${subclassShortName}`,
  });
  const feature = canonicalItem({
    id: 'feature-hemocraft',
    name: '鲜血秘法',
    group: 'classFeature',
    level: 1,
    sourceKey: 'classFeature/hemocraft',
  });
  return {
    _id: 'Actor.callum',
    name: 'Callum',
    system: {
      details: { level: options.level },
      attributes: { hp: { value: 24, max: 24, temp: 0 } },
      uses: { spent: 0, max: 3 },
      advancement: { choice: { _id: 'choice', type: 'ItemChoice', title: 'Blood Curses', value: ['curse-anxious'] } },
    },
    ownership: { default: 3 },
    choices: { bloodCurses: ['curse-anxious'] },
    grants: [
      { name: '鲜血秘法', level: 1 },
      ...(options.includeDawn ? [{ name: '破晓血仪', level: 3 }] : []),
    ],
    items: [
      classItem,
      subclassItem,
      feature,
      ...(options.includeDawn ? [dawnItem()] : []),
      ...(options.extraItems ?? []),
    ],
  };
}

function manifest(): JsonRecord {
  return {
    id: BLOOD_HUNTER_V14_MODULE_ID,
    version: BLOOD_HUNTER_V14_MODULE_VERSION,
    compatibility: {
      minimum: BLOOD_HUNTER_V14_FOUNDRY_VERSION,
      verified: BLOOD_HUNTER_V14_FOUNDRY_VERSION,
      maximum: BLOOD_HUNTER_V14_FOUNDRY_VERSION,
    },
    relationships: {
      systems: [{
        id: 'dnd5e',
        type: 'system',
        compatibility: {
          minimum: BLOOD_HUNTER_V14_DND5E_VERSION,
          verified: BLOOD_HUNTER_V14_DND5E_VERSION,
          maximum: BLOOD_HUNTER_V14_DND5E_VERSION,
        },
      }],
    },
    packs: BLOOD_HUNTER_V14_PACK_DECLARATIONS.map((pack) => ({ ...pack })),
  };
}

function matrixFromPlan(plan: ReturnType<typeof planBloodHunterV14MatrixWorld>): JsonRecord {
  return {
    core: plan.core,
    modded: plan.modded,
  };
}

describe('Blood Hunter v14 Lab inspection and matrix planning', () => {
  test('rejects port 30001 owned by another process without recommending a stop', () => {
    const result = inspectBloodHunterV14Lab({
      port: { port: 30001, listening: true, pid: 48212, owner: 'server-mirror/cor-cotn' },
      worldId: BLOOD_HUNTER_V14_MATRIX_WORLD_ID,
      moduleManifest: manifest(),
      matrix: { core: {}, modded: {} },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.findings.some((finding) => finding.code === 'PORT_OWNER_GATE')).toBe(true);
    expect(result.errors.join('\n')).toContain('do not stop');
    expect(result.errors.join('\n')).toContain('48212');
  });

  test('refuses cor-cotn and produces a plan with no world write', () => {
    const result = planBloodHunterV14MatrixWorld({ worldId: 'cor-cotn' });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.findings[0]?.code).toBe('MATRIX_WORLD_GATE');
    expect(result.errors.join('\n')).toContain('cor-cotn');
    expect(result.writePerformed).toBe(false);
    expect(result.operations).toEqual(['prepare-plan', 'no-world-write']);
  });

  test('pins the manifest and all three pack declarations, rejecting drift', () => {
    const plan = planBloodHunterV14MatrixWorld(BLOOD_HUNTER_V14_MATRIX_WORLD_ID);
    const good = inspectBloodHunterV14Lab({
      port: { port: 30001, listening: true, pid: 48213, owner: 'blood-hunter-v14-lab' },
      worldId: BLOOD_HUNTER_V14_MATRIX_WORLD_ID,
      moduleManifest: manifest(),
      matrix: matrixFromPlan(plan),
    });
    expect(good.ok).toBe(true);
    expect(good.manifest.packs).toEqual(['classes', 'features', 'subclasses']);

    const drifted = manifest();
    drifted.version = '1.0.1';
    const packs = drifted.packs as JsonRecord[];
    packs[0] = { ...packs[0], path: 'packs/renamed-classes' };
    const bad = inspectBloodHunterV14Lab({
      port: { port: 30001, listening: true, pid: 48213, owner: 'blood-hunter-v14-lab' },
      worldId: BLOOD_HUNTER_V14_MATRIX_WORLD_ID,
      moduleManifest: drifted,
      matrix: matrixFromPlan(plan),
    });
    expect(bad.ok).toBe(false);
    expect(bad.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'MANIFEST_VERSION_DRIFT',
      'PACK_DECLARATION_DRIFT',
    ]));
  });

  test('plans exact Core and Modded module sets', () => {
    const result = planBloodHunterV14MatrixWorld(BLOOD_HUNTER_V14_MATRIX_WORLD_ID);

    expect(result.ok).toBe(true);
    expect(result.core.enabledModuleIds).toEqual([BLOOD_HUNTER_V14_MODULE_ID]);
    expect(result.core.disabledModuleIds).toEqual([...BLOOD_HUNTER_V14_CORE_DISABLED_MODULE_IDS]);
    expect(result.core.system).toEqual({ id: 'dnd5e', version: BLOOD_HUNTER_V14_DND5E_VERSION });
    expect(result.modded.enabledModules).toEqual([
      { id: BLOOD_HUNTER_V14_MODULE_ID, version: BLOOD_HUNTER_V14_MODULE_VERSION },
      { id: 'midi-qol', version: '14.0.11' },
      { id: 'dae', version: '14.0.12' },
    ]);
    expect(result.modded.disabledModuleIds).toEqual([...BLOOD_HUNTER_V14_MODDED_DISABLED_MODULE_IDS]);
    expect(result.core.writePerformed).toBe(false);
    expect(result.modded.writePerformed).toBe(false);
  });
});

describe('Blood Hunter Actor snapshot verification', () => {
  test('accepts Ghostslayer level 3 Dawn Rite, cumulative grants, and retained choices', () => {
    const result = verifyBloodHunterActorSnapshot(actorSnapshot({ level: 3, includeDawn: true }), {
      className: '血猎手',
      subclassShortName: '弑灵',
      level: 3,
      levelCheckpoints: [1, 3],
      cumulativeFixedGrants: { 1: 1, 3: 2 },
      requiredChoices: ['curse-anxious'],
    });

    expect(result.ok).toBe(true);
    expect(result.metrics.dawnRite).toEqual({ itemCount: 1, activityCount: 5, effectCount: 2 });
    expect(result.metrics.duplicateCanonicalCount).toBe(0);
    expect(result.metrics.danglingActivityEffectReferences).toBe(0);
  });

  test('rejects Dawn Rite at level 2 and on a different subclass', () => {
    const levelTwo = verifyBloodHunterActorSnapshot(actorSnapshot({ level: 2, includeDawn: true }), {
      subclassShortName: '弑灵',
      level: 2,
    });
    expect(levelTwo.ok).toBe(false);
    expect(levelTwo.findings.some((finding) => finding.code === 'UNEXPECTED_DAWN_RITE')).toBe(true);

    const wrongSubclass = verifyBloodHunterActorSnapshot(actorSnapshot({ level: 3, subclassShortName: '渎魂', includeDawn: true }), {
      subclassShortName: '渎魂',
      level: 3,
    });
    expect(wrongSubclass.ok).toBe(false);
    expect(wrongSubclass.findings.some((finding) => finding.code === 'UNEXPECTED_DAWN_RITE')).toBe(true);
  });

  test('rejects dangling Activity Effect references and duplicate canonical Items', () => {
    const dangling = actorSnapshot({ level: 3, includeDawn: true });
    const danglingDawn = (dangling.items as JsonRecord[]).find((item) => item.name === '破晓血仪')!;
    const danglingActivities = (danglingDawn.system as JsonRecord).activities as JsonRecord;
    danglingActivities['dawn-activity-1'] = {
      ...(danglingActivities['dawn-activity-1'] as JsonRecord),
      effects: [{ _id: 'missing-effect' }],
    };
    const danglingResult = verifyBloodHunterActorSnapshot(dangling, { subclassShortName: '弑灵', level: 3 });
    expect(danglingResult.ok).toBe(false);
    expect(danglingResult.findings.some((finding) => finding.code === 'DANGLING_ACTIVITY_EFFECT_REFERENCE')).toBe(true);

    const duplicate = actorSnapshot({ level: 3, includeDawn: true });
    const originalDawn = (duplicate.items as JsonRecord[]).find((item) => item.name === '破晓血仪')!;
    const duplicateDawn = structuredClone(originalDawn) as JsonRecord;
    duplicateDawn._id = 'dawn-duplicate-item';
    ((duplicateDawn.flags as JsonRecord).fvttJsonGenerator as JsonRecord).bloodHunter2024 = {
      ...(((duplicateDawn.flags as JsonRecord).fvttJsonGenerator as JsonRecord).bloodHunter2024 as JsonRecord),
      canonicalId: 'dawn-canonical',
    };
    (duplicate.items as JsonRecord[]).push(duplicateDawn);
    const duplicateResult = verifyBloodHunterActorSnapshot(duplicate, { subclassShortName: '弑灵', level: 3 });
    expect(duplicateResult.ok).toBe(false);
    expect(duplicateResult.metrics.duplicateCanonicalCount).toBeGreaterThan(0);
    expect(duplicateResult.findings.some((finding) => finding.code === 'DUPLICATE_CANONICAL_ITEM')).toBe(true);
  });

  test('rejects wrong-subclass feature projection', () => {
    const wrongFeature = canonicalItem({
      id: 'wrong-profane-feature',
      name: 'Profane Feature',
      group: 'subclassFeature',
      subclassShortName: '渎魂',
      level: 3,
    });
    const result = verifyBloodHunterActorSnapshot(actorSnapshot({ level: 3, includeDawn: true, extraItems: [wrongFeature] }), {
      subclassShortName: '弑灵',
      level: 3,
    });
    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.code === 'WRONG_SUBCLASS_PRESENT')).toBe(true);
  });
});

describe('Callum migration snapshot verification', () => {
  test('proves preview/copy source immutability and old 0/0 to canonical 5/2', () => {
    const nonBloodHunter = {
      _id: 'non-bh-item',
      name: 'Longsword',
      type: 'weapon',
      system: { uses: { spent: 1, max: 3 } },
      ownership: { default: 3 },
    };
    const original = actorSnapshot({ level: 3, includeDawn: false, extraItems: [dawnItem('old-dawn', false), nonBloodHunter] });
    const preview = structuredClone(original);
    const copySource = structuredClone(original);
    const copied = structuredClone(original) as JsonRecord;
    const copiedItems = copied.items as JsonRecord[];
    copiedItems[copiedItems.findIndex((item) => item._id === 'old-dawn')] = dawnItem();
    const apply = structuredClone(copied);
    const rollback = structuredClone(original);
    const before = structuredClone(original);

    const result = verifyCallumMigrationSnapshots({
      originalActor: original,
      previewActor: preview,
      copySourceActor: copySource,
      copyActor: copied,
      applyActor: apply,
      rollbackActor: rollback,
    });

    expect(result.ok).toBe(true);
    expect(result.metrics.originalPassive).toEqual({ activities: 0, effects: 0 });
    expect(result.metrics.copyCanonicalPassive).toEqual({ activities: 5, effects: 2 });
    expect(result.metrics.previewOriginalUnchanged).toBe(true);
    expect(result.metrics.copySourceUnchanged).toBe(true);
    expect(result.metrics.rollbackRestored).toBe(true);
    expect(original).toEqual(before);
  });

  test('fails when non-Blood-Hunter content is lost in the copy', () => {
    const original = actorSnapshot({ level: 3, includeDawn: false, extraItems: [dawnItem('old-dawn', false), { _id: 'unrelated', name: 'Shield', type: 'equipment' }] });
    const copied = structuredClone(original) as JsonRecord;
    (copied.items as JsonRecord[]).splice((copied.items as JsonRecord[]).findIndex((item) => item._id === 'unrelated'), 1);
    (copied.items as JsonRecord[])[(copied.items as JsonRecord[]).findIndex((item) => item._id === 'old-dawn')] = dawnItem();
    const result = verifyCallumMigrationSnapshots({
      originalActor: original,
      previewActor: structuredClone(original),
      copySourceActor: structuredClone(original),
      copyActor: copied,
    });
    expect(result.ok).toBe(false);
    expect(result.findings.some((finding) => finding.code === 'NON_BLOOD_HUNTER_PROJECTION_CHANGED')).toBe(true);
  });
});

describe('Blood Hunter E2E evidence manifest', () => {
  function completeEvidenceInput(): Parameters<typeof createBloodHunterE2EManifest>[0] {
    const checkpointEvidence = [
      ...['弑灵', '渎魂', '突变', '化狼'].flatMap((subclass) => Array.from({ length: 20 }, (_unused, index) => ({
        subclassShortName: subclass,
        level: index + 1,
        status: 'complete',
        evidenceId: `${subclass}-${index + 1}`,
      }))),
    ];
    return {
      runId: 'bh-v14-run-001',
      actorIds: ['Actor.a', 'Actor.b'],
      tokenIds: ['Token.a', 'Token.b'],
      messageIds: ['Message.a'],
      templateIds: ['MeasuredTemplate.a'],
      ownPids: [48213],
      matrixEvidence: { core: true, modded: true },
      checkpointEvidence,
      activityEvidence: {
        'class-grants': true,
        'blood-curses': true,
        'crimson-rites': true,
        mutagens: true,
        'subclass-features': true,
        'dawn-rite': true,
      },
      counterexampleEvidence: {
        'level-2-no-dawn': true,
        'wrong-subclass-no-dawn': true,
        'dangling-activity-effect': true,
        'duplicate-canonical': true,
        'non-blood-hunter-loss': true,
      },
      uiEvidence: true,
      runtimeEvidence: true,
      migrationEvidence: true,
      exportEvidence: true,
      cleanupEvidence: {
        status: 'complete',
        actorIds: ['Actor.a', 'Actor.b'],
        tokenIds: ['Token.a', 'Token.b'],
        messageIds: ['Message.a'],
        templateIds: ['MeasuredTemplate.a'],
        stopPids: [48213],
      },
    };
  }

  test('does not promote a pack index/API probe to E2E PASS', () => {
    const manifest = createBloodHunterE2EManifest({ packIndexApiProbe: { status: 'pass' } });

    expect(manifest.packIndexApiProbe.status).toBe('Partial');
    expect(manifest.packIndexApiProbe.e2ePassEligible).toBe(false);
    expect(manifest.verdict).not.toBe('E2E PASS');
  });

  test('emits four subclass 1-to-20 checkpoints and passes only with every phase', () => {
    const manifest = createBloodHunterE2EManifest(completeEvidenceInput());

    expect(manifest.verdict).toBe('E2E PASS');
    expect(manifest.e2ePassEligible).toBe(true);
    expect(manifest.checkpoints).toHaveLength(4);
    expect(manifest.checkpoints.every((entry) => Boolean(entry.levels))).toBe(true);
    expect(manifest.checkpoints.map((entry) => entry.levels.length)).toEqual([20, 20, 20, 20]);
    expect(manifest.packIndexApiProbe.status).toBe('Partial');
    expect(manifest.cleanupAllowlist).toEqual({
      actorIds: ['Actor.a', 'Actor.b'],
      tokenIds: ['Token.a', 'Token.b'],
      messageIds: ['Message.a'],
      templateIds: ['MeasuredTemplate.a'],
      stopPids: [48213],
      onlyOwnPid: true,
      broadTargetRejected: true,
    });
  });

  test('rejects a cleanup PID that was not recorded as run-owned', () => {
    const input = completeEvidenceInput();
    input.cleanupEvidence = {
      ...(input.cleanupEvidence as JsonRecord),
      stopPids: [48212],
    };
    const manifest = createBloodHunterE2EManifest(input);

    expect(manifest.verdict).toBe('BLOCKED');
    expect(manifest.e2ePassEligible).toBe(false);
    expect(manifest.findings.some((finding) => finding.code === 'CLEANUP_FOREIGN_PID')).toBe(true);
    expect(manifest.cleanupAllowlist.stopPids).toEqual([]);
    expect(manifest.cleanupAllowlist.onlyOwnPid).toBe(false);
  });

  test('rejects wildcard cleanup targets even when the run has an otherwise valid allowlist', () => {
    const input = completeEvidenceInput();
    input.cleanupEvidence = {
      ...(input.cleanupEvidence as JsonRecord),
      actorIds: ['*'],
    };
    const manifest = createBloodHunterE2EManifest(input);

    expect(manifest.verdict).toBe('BLOCKED');
    expect(manifest.findings.some((finding) => finding.code === 'BROAD_CLEANUP_TARGET')).toBe(true);
    expect(manifest.cleanupAllowlist.broadTargetRejected).toBe(false);
  });
});
