import { beforeAll, describe, expect, test } from 'bun:test';
import {
  assertLocal3ConstructorShape,
  createWorkflowHarness,
  loadPreparedWorkflowSource,
  mutateConstructorField,
  workflowSourceTestBoundary,
  type PreparedWorkflowSource,
} from './helpers/real-workflow-source';

const ITEM_NAME = 'Conjure Beast';
const ITEM_UUID = 'Item.conjure-beast';
const ITEM_IMAGE = 'icons/svg/summon.svg';
const TEMPLATE_EFFECT_NAME = `${ITEM_NAME} Measured Template`;
const SUMMON_EFFECT_NAME = `Summon: ${ITEM_NAME}`;
const TRANSFORM_EFFECT_NAME = `Transform: ${ITEM_NAME}`;
const WORLD_TIME = 1_700_000_123;
const COMBAT_ROUND = 7;
const COMBAT_TURN = 2;

let prepared: PreparedWorkflowSource;

beforeAll(async () => {
  prepared = await loadPreparedWorkflowSource();
});

function identityI18n(key: string): string {
  if (key === 'midi-qol.MeasuredTemplate') return 'Measured Template';
  if (key === 'DND5E.ActionSumm') return 'Summon';
  if (key === 'DND5E.TRANSFORM.Action.Transform') return 'Transform';
  return key;
}

interface RuntimeOptions {
  sourceText?: string;
  effects?: any[];
  duration?: any;
  summonedCount?: number;
  transformedActorUuids?: string[];
}

function makeRuntime(options: RuntimeOptions = {}) {
  const calls: Array<{ documentName: string; data: any[] }> = [];
  const flagWrites: Array<{ document: string; scope: string; key: string; value: unknown }> = [];
  const durationCalls: Array<{ units: string | undefined; inCombat: boolean }> = [];
  const generatedIds: string[] = [];
  const randomIds = ['a1b2c3d4e5f6g7h8', 'b1b2c3d4e5f6g7h8', 'c1b2c3d4e5f6g7h8'];
  const duration = options.duration ?? {
    units: 'seconds',
    value: 45,
    conversion: { type: 'seconds', seconds: 45 },
  };
  const actor: any = {
    uuid: 'Actor.caster',
    effects: options.effects ?? [],
    async createEmbeddedDocuments(documentName: string, data: any[]) {
      calls.push({ documentName, data: structuredClone(data) });
      return data.map((effect) => ({
        uuid: effect.name === TEMPLATE_EFFECT_NAME
          ? 'ActiveEffect.template-created'
          : effect.name === SUMMON_EFFECT_NAME
            ? 'ActiveEffect.summon-created'
            : 'ActiveEffect.transform-created',
      }));
    },
  };
  const item: any = {
    actor,
    uuid: ITEM_UUID,
    name: ITEM_NAME,
    img: ITEM_IMAGE,
  };
  const summonedCreatures = Array.from({ length: options.summonedCount ?? 0 }, (_, index) => ({
    id: `Token.summoned-${index + 1}`,
    async setFlag(scope: string, key: string, value: unknown) {
      flagWrites.push({ document: `Token.summoned-${index + 1}`, scope, key, value });
    },
  }));
  const templateDocument = {
    uuid: 'MeasuredTemplate.template-1',
    async setFlag(scope: string, key: string, value: unknown) {
      flagWrites.push({ document: 'MeasuredTemplate.template-1', scope, key, value });
    },
  };

  const dependencies = {
    configSettings: {
      autoRemoveInstantaneousTemplate: false,
      autoRemoveTemplate: true,
      autoRemoveSummonedCreature: true,
      autoUndoTransformations: true,
      autoItemEffects: 'off',
    },
    getConcentrationEffect: () => undefined,
    installedModules: { get: (id: string) => id === 'dae' },
    i18n: identityI18n,
    convertDuration: (input: any, inCombat: boolean) => {
      durationCalls.push({ units: input?.units, inCombat });
      return input?.conversion ?? { type: 'none' };
    },
    game: {
      time: { worldTime: WORLD_TIME },
      combat: { round: COMBAT_ROUND, turn: COMBAT_TURN, turns: [] },
    },
    CONFIG: { DND5E: { permanentTimePeriods: {} } },
    getOrCreateTokenForActor: () => ({ id: 'Token.caster' }),
    activityHasAutoPlaceTemplate: () => false,
    activityHasEmanationNoTemplate: () => false,
    activityHasAreaTarget: () => false,
    foundry: { utils: {
      isEmpty: (value: Record<string, unknown>) => Object.keys(value).length === 0,
      randomID: () => {
        const id = randomIds[generatedIds.length];
        if (!id) throw new Error('Unexpected extra ActiveEffect id request.');
        generatedIds.push(id);
        return id;
      },
    } },
  };

  const workflow: any = createWorkflowHarness(options.sourceText ?? prepared.sourceText, dependencies, prepared.typescript);
  Object.assign(workflow, {
    aborted: false,
    workflowName: 'Workflow',
    id: 'workflow-test',
    actor,
    item,
    token: { id: 'Token.caster' },
    activity: {
      duration,
      target: { affects: { type: '' }, template: { count: 1 } },
    },
    targets: new Set(),
    placedTemplateCount: 0,
    needsHitTargetsDisplayed: false,
    summonedCreatures,
    transformedActorUuids: options.transformedActorUuids ?? [],
    transformedActors: [],
    chatCard: undefined,
    async expireTargetEffects() {},
  });

  return { workflow, actor, item, calls, flagWrites, durationCalls, generatedIds, summonedCreatures, templateDocument };
}

function firstCreatedData(runtime: ReturnType<typeof makeRuntime>, name: string): any {
  const call = runtime.calls.find((candidate) => candidate.data[0]?.name === name);
  expect(call?.documentName).toBe('ActiveEffect');
  expect(call?.data).toHaveLength(1);
  return call!.data[0];
}

async function finishRoll(runtime: ReturnType<typeof makeRuntime>): Promise<void> {
  await expect(runtime.workflow.WorkflowState_RollFinished()).resolves.toBe(workflowSourceTestBoundary);
}

async function captureEntryPayload(entry: 'template' | 'summon' | 'transform', sourceText: string): Promise<any> {
  const runtime = makeRuntime({
    sourceText,
    duration: {
      units: 'rounds',
      value: 2,
      conversion: { type: 'turns', rounds: 3 },
    },
    summonedCount: entry === 'summon' ? 2 : 0,
    transformedActorUuids: entry === 'transform' ? ['Actor.transformed-1'] : [],
  });
  if (entry === 'template') {
    await runtime.workflow.setupTemplateCleanup(runtime.templateDocument);
    return firstCreatedData(runtime, TEMPLATE_EFFECT_NAME);
  }
  await finishRoll(runtime);
  return firstCreatedData(runtime, entry === 'summon' ? SUMMON_EFFECT_NAME : TRANSFORM_EFFECT_NAME);
}

describe('real Midi-QOL Workflow source behavior', () => {
  test('pins local.9 source identity and proves other Workflow code matches the locked Git blob', () => {
    expect(prepared.commit).toBe('4338eeab85041cd71b76ede36818e2265cbf06ae');
    expect(prepared.workflowBlob).toBe('1ad0a13ef98bb571be58d48e45e832a0ddb05046');
    expect(prepared.candidateVersion).toBe('14.6.0-beta.4338eeab.local.9');
    expect(prepared.sourceSha256).toBe('5b803b312c52d574a8f4d84dd420b3030eaca78d2ed7ca4fdff9f9fca64b34fc');
  });

  test('executes actual setupTemplateCleanup and captures a local.3 payload with a stubbed fresh id', async () => {
    const runtime = makeRuntime();
    await expect(runtime.workflow.setupTemplateCleanup(runtime.templateDocument)).resolves.toBe(true);

    expect(runtime.calls).toHaveLength(1);
    const effectData = firstCreatedData(runtime, TEMPLATE_EFFECT_NAME);
    assertLocal3ConstructorShape(effectData, 'template');
    expect(effectData).toMatchObject({
      _id: 'a1b2c3d4e5f6g7h8',
      type: 'base',
      system: { changes: [] },
      origin: ITEM_UUID,
      disabled: false,
      img: ITEM_IMAGE,
      name: TEMPLATE_EFFECT_NAME,
      duration: { value: 45, units: 'seconds', expiry: 'updateWorldTime' },
      start: { time: WORLD_TIME },
      flags: { dae: { stackable: 'noneName', expiryMode: 'delete' } },
    });
    expect(runtime.generatedIds).toEqual(['a1b2c3d4e5f6g7h8']);
    expect(Object.keys(effectData.system)).toEqual(['changes']);
    expect(runtime.flagWrites).toEqual([{
      document: 'MeasuredTemplate.template-1',
      scope: 'dnd5e',
      key: 'dependentOn',
      value: 'ActiveEffect.template-created',
    }]);
    expect(runtime.durationCalls).toEqual([{ units: 'seconds', inCombat: false }]);
  });

  test('executes actual RollFinished summon and transform branches with local.3 ids and existing behavior', async () => {
    const runtime = makeRuntime({
      duration: {
        units: 'rounds',
        value: 2,
        conversion: { type: 'turns', rounds: 3 },
      },
      summonedCount: 2,
      transformedActorUuids: ['Actor.transformed-1', 'Actor.transformed-2'],
    });
    await finishRoll(runtime);

    expect(runtime.calls).toHaveLength(2);
    const summonData = firstCreatedData(runtime, SUMMON_EFFECT_NAME);
    const transformData = firstCreatedData(runtime, TRANSFORM_EFFECT_NAME);
    assertLocal3ConstructorShape(summonData, 'summon');
    assertLocal3ConstructorShape(transformData, 'transform');
    expect(summonData).toMatchObject({
      _id: 'a1b2c3d4e5f6g7h8',
      type: 'base',
      system: { changes: [] },
      origin: ITEM_UUID,
      disabled: false,
      img: ITEM_IMAGE,
      name: SUMMON_EFFECT_NAME,
      duration: { value: 3, units: 'rounds' },
      start: { round: COMBAT_ROUND, turn: COMBAT_TURN },
      flags: { dae: { stackable: 'noneName' } },
    });
    expect(transformData).toMatchObject({
      _id: 'b1b2c3d4e5f6g7h8',
      type: 'base',
      system: { changes: [] },
      origin: ITEM_UUID,
      disabled: false,
      img: ITEM_IMAGE,
      name: TRANSFORM_EFFECT_NAME,
      duration: { value: 3, units: 'rounds' },
      start: { round: COMBAT_ROUND, turn: COMBAT_TURN },
      flags: {
        dae: { stackable: 'noneName' },
        'midi-qol': { transformedActorUuids: ['Actor.transformed-1', 'Actor.transformed-2'] },
      },
    });
    expect(runtime.generatedIds).toEqual(['a1b2c3d4e5f6g7h8', 'b1b2c3d4e5f6g7h8']);
    expect(Object.keys(summonData.system)).toEqual(['changes']);
    expect(Object.keys(transformData.system)).toEqual(['changes']);
    expect(runtime.flagWrites).toEqual([
      { document: 'Token.summoned-1', scope: 'dnd5e', key: 'dependentOn', value: 'ActiveEffect.summon-created' },
      { document: 'Token.summoned-2', scope: 'dnd5e', key: 'dependentOn', value: 'ActiveEffect.summon-created' },
    ]);
    expect(runtime.durationCalls).toEqual([
      { units: 'rounds', inCombat: false },
      { units: 'rounds', inCombat: false },
    ]);
  });

  test('reuses existing template cleanup effect without creating another ActiveEffect', async () => {
    const existing = { name: TEMPLATE_EFFECT_NAME, uuid: 'ActiveEffect.template-existing' };
    const runtime = makeRuntime({ effects: [existing] });
    await expect(runtime.workflow.setupTemplateCleanup(runtime.templateDocument)).resolves.toBe(true);

    expect(runtime.calls).toHaveLength(0);
    expect(runtime.flagWrites).toEqual([{
      document: 'MeasuredTemplate.template-1',
      scope: 'dnd5e',
      key: 'dependentOn',
      value: 'ActiveEffect.template-existing',
    }]);
    expect(runtime.durationCalls).toHaveLength(0);
  });

  test('reuses an existing summon effect for every summoned token without creating another ActiveEffect', async () => {
    const existing = { name: SUMMON_EFFECT_NAME, uuid: 'ActiveEffect.summon-existing' };
    const runtime = makeRuntime({
      effects: [existing],
      summonedCount: 2,
      duration: { units: 'rounds', value: 2, conversion: { type: 'turns', rounds: 3 } },
    });
    await finishRoll(runtime);

    expect(runtime.calls).toHaveLength(0);
    expect(runtime.flagWrites).toEqual([
      { document: 'Token.summoned-1', scope: 'dnd5e', key: 'dependentOn', value: 'ActiveEffect.summon-existing' },
      { document: 'Token.summoned-2', scope: 'dnd5e', key: 'dependentOn', value: 'ActiveEffect.summon-existing' },
    ]);
    expect(runtime.durationCalls).toHaveLength(0);
  });

  test('reuses an existing transform effect and merges transformedActorUuids without creating another ActiveEffect', async () => {
    const flagWrites: Array<{ scope: string; key: string; value: unknown }> = [];
    const existing = {
      name: TRANSFORM_EFFECT_NAME,
      uuid: 'ActiveEffect.transform-existing',
      getFlag(scope: string, key: string) {
        expect([scope, key]).toEqual(['midi-qol', 'transformedActorUuids']);
        return ['Actor.transformed-earlier'];
      },
      async setFlag(scope: string, key: string, value: unknown) {
        flagWrites.push({ scope, key, value });
      },
    };
    const runtime = makeRuntime({ effects: [existing], transformedActorUuids: ['Actor.transformed-now'] });
    await finishRoll(runtime);

    expect(runtime.calls).toHaveLength(0);
    expect(flagWrites).toEqual([{
      scope: 'midi-qol',
      key: 'transformedActorUuids',
      value: ['Actor.transformed-earlier', 'Actor.transformed-now'],
    }]);
    expect(runtime.durationCalls).toHaveLength(0);
  });

  for (const entry of ['template', 'summon', 'transform'] as const) {
    for (const field of ['_id', 'type', 'system'] as const) {
      test(`in-memory negative mutation of ${entry} ${field} field is caught by the executed source path`, async () => {
        const mutatedSource = mutateConstructorField(prepared.sourceText, entry, field, prepared.typescript);
        const effectData = await captureEntryPayload(entry, mutatedSource);
        const expectedFailure = field === '_id'
          ? `Workflow ${entry} local.3 constructor must pass a fresh 16-character _id.`
          : field === 'type'
            ? `Workflow ${entry} local.3 constructor must pass the top-level type: "base" field.`
            : `Workflow ${entry} local.3 constructor must pass the changes-only system: { changes: [] } field.`;
        expect(() => assertLocal3ConstructorShape(effectData, entry)).toThrow(expectedFailure);
      });
    }
  }
});
