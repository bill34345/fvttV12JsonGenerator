import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PlainTextActorWorkflow } from '../../src/core/workflow/plainTextActor';

setDefaultTimeout(30000);

const FIXTURE_DIR = resolve(process.cwd(), 'tests/fixtures/plaintext');
const SOURCE_PATH = join(
  FIXTURE_DIR,
  readdirSync(FIXTURE_DIR).find((entry) => entry.endsWith('.md')) ?? 'missing-fixture.md',
);

type GeneratedActor = {
  type: string;
  system: any;
  prototypeToken: any;
  items: Array<{
    name: string;
    type: string;
    flags?: Record<string, any>;
    effects?: Array<{ img?: string; statuses?: string[] }>;
    system: {
      activation?: { type?: string; cost?: number; condition?: string };
      uses?: any;
      activities?: Record<string, any>;
      description?: { value?: string };
      type?: { value?: string; subtype?: string };
      range?: any;
    };
  }>;
};

function getActivities(item: GeneratedActor['items'][number]): any[] {
  return Object.values(item.system.activities ?? {});
}

function findItems(actor: GeneratedActor, englishName: string) {
  return actor.items.filter((candidate) => candidate.name.includes(`(${englishName})`));
}

function findSingleItem(actor: GeneratedActor, englishName: string) {
  const matches = findItems(actor, englishName);
  expect(matches.length).toBeGreaterThan(0);
  if (!matches[0]) {
    throw new Error(`Expected item containing (${englishName})`);
  }
  return matches[0];
}

function findLegendaryItem(actor: GeneratedActor, englishName: string) {
  const item = actor.items.find(
    (candidate) =>
      candidate.name.includes(`(${englishName})`) &&
      candidate.flags?.['tidy5e-sheet']?.section === 'Legendary Actions',
  );
  expect(item).toBeDefined();
  if (!item) {
    throw new Error(`Expected legendary item containing (${englishName})`);
  }
  return item;
}

describe('Alyxian Aboleth acceptance gate', () => {
  let vaultPath = '';
  let actor: GeneratedActor;

  beforeAll(async () => {
    vaultPath = mkdtempSync(join(tmpdir(), 'fvtt-alyxian-acceptance-'));

    const workflow = new PlainTextActorWorkflow();
    const result = await workflow.ingestActors({
      sourcePath: SOURCE_PATH,
      vaultPath,
      dryRun: false,
      effectProfile: 'modded-v12',
      fvttVersion: '12',
    });

    const actorFile = result.markdown.files.find((file) => file.slug === 'alyxian-aboleth');
    expect(actorFile).toBeDefined();
    if (!actorFile) {
      throw new Error('Expected Alyxian Aboleth markdown output');
    }

    actor = JSON.parse(
      readFileSync(join(vaultPath, 'output', actorFile.fileName.replace(/\.md$/i, '.json')), 'utf-8'),
    ) as GeneratedActor;
  });

  afterAll(() => {
    if (vaultPath) {
      rmSync(vaultPath, { recursive: true, force: true });
    }
  });

  it('creates legendary action resources and three legendary action items', () => {
    expect(actor.system.resources.legact).toEqual(
      expect.objectContaining({
        value: 3,
        max: 3,
      }),
    );
    expect(findLegendaryItem(actor, 'Mental Fog')).toBeDefined();
    expect(findLegendaryItem(actor, 'Soulbound Swap')).toBeDefined();
    expect(findLegendaryItem(actor, 'Compel')).toBeDefined();
  });

  it('keeps legendary action costs on generated legendary items', () => {
    const mentalFog = findLegendaryItem(actor, 'Mental Fog');
    expect(mentalFog.system.activation).toEqual(
      expect.objectContaining({
        type: 'legendary',
        cost: 2,
      }),
    );
    const saveActivity = getActivities(mentalFog).find((activity) => activity.type === 'save');
    expect(saveActivity.activation).toEqual(
      expect.objectContaining({
        type: 'legendary',
        value: 2,
      }),
    );
    expect(saveActivity.damage.parts).toHaveLength(1);
    expect(mentalFog.flags?.fvttJsonGenerator?.rules).toEqual(
      expect.objectContaining({
        onFailedSave: expect.arrayContaining([
          expect.objectContaining({ kind: 'savePenalty', dice: '1d6' }),
        ]),
      }),
    );

    const compel = findLegendaryItem(actor, 'Compel');
    expect(compel.system.activation).toEqual(
      expect.objectContaining({
        type: 'legendary',
        cost: 1,
      }),
    );
    const compelActivity = getActivities(compel)[0];
    expect(compelActivity.activation).toEqual(
      expect.objectContaining({
        type: 'legendary',
        value: 1,
      }),
    );
  });

  it('keeps daily-use traits as daily resources', () => {
    const resilience = findSingleItem(actor, 'Mindtaker Resilience');
    expect(resilience.system.uses).toEqual(
      expect.objectContaining({
        value: 3,
        max: 3,
      }),
    );
    expect(Array.isArray(resilience.system.uses?.recovery)).toBe(true);
    expect(resilience.system.uses?.recovery?.[0]).toEqual(
      expect.objectContaining({
        period: 'day',
      }),
    );
    expect(resilience.flags?.fvttJsonGenerator?.rules).toEqual(
      expect.objectContaining({
        allyEscapeSave: expect.objectContaining({
          targetCondition: 'dominated',
          saveAbility: 'wis',
          saveDc: 19,
          advantage: true,
        }),
      }),
    );
  });

  it('keeps vicious mucous as an aura plus repeated-attack save metadata instead of a blank utility stub', () => {
    const mucous = findSingleItem(actor, 'Vicious Mucous');
    expect(mucous.flags?.fvttJsonGenerator?.rules).toEqual(
      expect.objectContaining({
        aura: expect.objectContaining({
          radius: 10,
          units: 'ft',
          terrain: 'difficult',
        }),
        onRepeatedAttack: expect.objectContaining({
          saveAbility: 'str',
          saveDc: 14,
          failure: 'attackFails',
        }),
      }),
    );
  });

  it('keeps dominate range, concentration, and threshold rider separate from the base failed-save effects', () => {
    const dominate = findSingleItem(actor, 'Dominate');
    const saveActivity = getActivities(dominate).find((activity) => activity.type === 'save');

    expect(saveActivity).toBeDefined();
    expect(saveActivity.range).toEqual(
      expect.objectContaining({
        value: 60,
        units: 'ft',
      }),
    );
    expect(dominate.flags?.fvttJsonGenerator?.rules).toEqual(
      expect.objectContaining({
        requiresConcentration: true,
        grantsControlOnFail: true,
        repeatSaveOnDamage: true,
        thresholdEffects: expect.arrayContaining([
          expect.objectContaining({
            maxSaveTotal: 13,
            statuses: ['dazed'],
          }),
        ]),
      }),
    );
    expect((dominate.effects ?? []).flatMap((effect) => effect.statuses ?? [])).toEqual(
      expect.arrayContaining(['charmed']),
    );
    expect((dominate.effects ?? []).flatMap((effect) => effect.statuses ?? [])).not.toContain('dazed');
  });

  it('models enslave as one recharge save with half-damage semantics and target gating metadata', () => {
    const enslave = findSingleItem(actor, 'Enslave');
    const saveActivity = getActivities(enslave).find((activity) => activity.type === 'save');

    expect(saveActivity).toBeDefined();
    expect(saveActivity.damage.parts).toHaveLength(1);
    expect(saveActivity.damage.parts[0]).toEqual(
      expect.objectContaining({
        number: 15,
        denomination: 10,
        types: ['psychic'],
      }),
    );
    expect(saveActivity.uses).toEqual(
      expect.objectContaining({
        recovery: [
          expect.objectContaining({
            period: 'recharge',
            formula: '5',
          }),
        ],
      }),
    );
    expect(enslave.flags?.fvttJsonGenerator?.rules).toEqual(
      expect.objectContaining({
        targetCondition: 'charmed',
        halfDamageOnSave: true,
        onDropToZero: expect.objectContaining({
          healFormula: '15d10',
          maintainWithoutConcentration: true,
        }),
      }),
    );
  });

  it('models tentacle with attack damage in the attack and preserves disease and vulnerability riders as structured rules', () => {
    const tentacle = findSingleItem(actor, 'Tentacle');
    const activities = getActivities(tentacle);
    const attackActivity = activities.find((activity) => activity.type === 'attack');

    expect(attackActivity).toBeDefined();
    expect(attackActivity.damage.parts).toHaveLength(1);
    expect(attackActivity.damage.parts[0]).toEqual(
      expect.objectContaining({
        number: 3,
        denomination: 6,
        bonus: '5',
        types: ['bludgeoning'],
      }),
    );
    expect(tentacle.flags?.fvttJsonGenerator?.rules).toEqual(
      expect.objectContaining({
        onHitRiders: expect.arrayContaining([
          expect.objectContaining({ kind: 'disease', saveAbility: 'con', saveDc: 16 }),
          expect.objectContaining({ kind: 'vulnerability', damageType: 'bludgeoning', maxSaveTotal: 11 }),
        ]),
      }),
    );
  });

  it('does not turn compel target prerequisites into applied charmed effects', () => {
    const compel = findSingleItem(actor, 'Compel');
    expect((compel.effects ?? []).flatMap((effect) => effect.statuses ?? [])).toHaveLength(0);
    const utilityActivity = getActivities(compel).find((activity) => activity.type === 'utility');
    expect(utilityActivity?.effects ?? []).toHaveLength(0);
  });

  it('keeps soulbound swap as a charmed-target teleport swap instead of an empty utility shell', () => {
    const soulbound = findLegendaryItem(actor, 'Soulbound Swap');
    expect(soulbound.flags?.fvttJsonGenerator?.rules).toEqual(
      expect.objectContaining({
        targetCondition: 'charmed',
        onUse: expect.objectContaining({
          kind: 'teleportSwap',
          maxTargets: 1,
        }),
      }),
    );
  });

  it('models tentacle whirlwind as a recharge area save with a push rider', () => {
    const whirlwind = findSingleItem(actor, 'Tentacle Whirlwind');
    const saveActivity = getActivities(whirlwind).find((activity) => activity.type === 'save');

    expect(saveActivity).toBeDefined();
    expect(saveActivity.target).toEqual(
      expect.objectContaining({
        template: expect.objectContaining({
          type: 'sphere',
          size: '15',
          units: 'ft',
        }),
      }),
    );
    expect(saveActivity.uses).toEqual(
      expect.objectContaining({
        recovery: [
          expect.objectContaining({
            period: 'recharge',
            formula: '5',
          }),
        ],
      }),
    );
    expect(whirlwind.flags?.fvttJsonGenerator?.rules).toEqual(
      expect.objectContaining({
        halfDamageOnSave: true,
        onFailedSave: expect.arrayContaining([
          expect.objectContaining({ kind: 'push', distance: 20, units: 'ft' }),
        ]),
      }),
    );
  });
});
