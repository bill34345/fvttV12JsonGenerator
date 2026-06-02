import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ParserFactory } from '../../src/core/parser/router';
import { ActorGenerator } from '../../src/core/generator/actor';

const inputDir = resolve(process.cwd(), 'obsidian/dnd数据转fvttjson/input');

function inputFile(slug: string): string {
  const fileName = readdirSync(inputDir).find((entry) => entry.includes(slug) && entry.endsWith('.md'));
  if (!fileName) {
    throw new Error(`Missing Obsidian input for ${slug}`);
  }
  return join(inputDir, fileName);
}

async function generateActor(slug: string): Promise<any> {
  const content = readFileSync(inputFile(slug), 'utf-8');
  const parserFactory = new ParserFactory();
  const route = parserFactory.detectRoute(content);
  const parsed = parserFactory.parse(content);
  return new ActorGenerator({
    effectProfile: 'modded-v12',
    fvttVersion: '12',
    translationService: null,
  }).generateForRoute(parsed, route);
}

function findItem(actor: any, englishName: string): any {
  const item = actor.items.find((candidate: any) => String(candidate.name).includes(`(${englishName})`));
  expect(item).toBeDefined();
  if (!item) {
    throw new Error(`Missing item ${englishName}`);
  }
  return item;
}

function rules(item: any): any {
  return item.flags?.fvttJsonGenerator?.rules ?? {};
}

function activities(item: any): any[] {
  return Object.values(item.system?.activities ?? {});
}

describe('Laughing Hand Obsidian acceptance gate', () => {
  it('models Laughing Hand riders from real Obsidian markdown without hand-authored JSON', async () => {
    const actor = await generateActor('the-laughing-hand');

    expect(actor.items.map((item: any) => item.name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('(Mouths in Wounds)'),
        expect.stringContaining('(Horrifying Laughter)'),
        expect.stringContaining('(Bone-Crushing Fist)'),
        expect.stringContaining('(Sword Arm)'),
        expect.stringContaining('(Summon Shadow Hounds)'),
        expect.stringContaining('(Tormenting Approach)'),
        expect.stringContaining('(Unnatural Pursuit)'),
      ]),
    );

    const boneCrushingFist = findItem(actor, 'Bone-Crushing Fist');
    expect(rules(boneCrushingFist).onHitRiders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statuses: expect.arrayContaining(['grappled', 'restrained']),
          escapeDc: 19,
        }),
      ]),
    );
    expect(rules(boneCrushingFist).conditionalDamage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          formula: '4d8+6',
          damageType: 'bludgeoning',
          targetConditions: expect.arrayContaining(['grappled']),
        }),
      ]),
    );
    const boneCrushingFistAttacks = activities(boneCrushingFist).filter((activity: any) => activity.type === 'attack');
    expect(boneCrushingFistAttacks).toHaveLength(2);
    expect(boneCrushingFistAttacks.every((activity: any) => activity.attack?.type?.value === 'mwak')).toBe(true);
    expect(boneCrushingFistAttacks.map((activity: any) => activity.damage?.parts?.[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: 3, denomination: 8, bonus: '6', types: ['bludgeoning'] }),
        expect.objectContaining({ number: 4, denomination: 8, bonus: '6', types: ['bludgeoning'] }),
      ]),
    );

    const swordArm = findItem(actor, 'Sword Arm');
    expect(rules(swordArm).onHitRiders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'customEffect',
          label: '发笑伤口',
          cannotReact: true,
        }),
      ]),
    );
    expect(rules(swordArm).savePenalties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dice: '1d4',
          against: expect.stringContaining('骇人狂笑'),
        }),
      ]),
    );
    const laughingWoundEffect = (swordArm.effects ?? []).find(
      (effect: any) => effect.flags?.fvttJsonGenerator?.rider?.kind === 'customEffect',
    );
    expect(laughingWoundEffect).toBeDefined();
    expect(laughingWoundEffect.img).toBe('icons/svg/blood.svg');
    expect(laughingWoundEffect.statuses ?? []).toEqual([]);
    expect(laughingWoundEffect.flags?.fvttJsonGenerator?.rider).toEqual(
      expect.objectContaining({
        kind: 'customEffect',
        label: rules(swordArm).onHitRiders[0].label,
        cannotReact: true,
      }),
    );
    expect(laughingWoundEffect.flags?.fvttJsonGenerator?.savePenalties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dice: '1d4',
          against: rules(swordArm).savePenalties[0].against,
        }),
      ]),
    );
    const swordArmAttack = activities(swordArm).find((activity: any) => activity.type === 'attack');
    expect(swordArmAttack?.effects).toEqual(expect.arrayContaining([{ _id: laughingWoundEffect._id }]));

    const mouthsInWounds = findItem(actor, 'Mouths in Wounds');
    const horrifyingLaughter = findItem(actor, 'Horrifying Laughter');
    const horrifyingDazed = (horrifyingLaughter.effects ?? []).find((effect: any) =>
      (effect.statuses ?? []).includes('dazed'),
    );
    expect(horrifyingDazed?.img).toBe('icons/svg/daze.svg');

    expect(rules(mouthsInWounds).temporaryOverrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          triggerDamageTypes: expect.arrayContaining(['piercing', 'slashing']),
          targetAbility: '骇人狂笑',
          saveDc: 19,
          damage: expect.objectContaining({ formula: '5d6', type: 'psychic' }),
        }),
      ]),
    );
    expect(activities(mouthsInWounds).filter((activity: any) => activity.type === 'damage')).toHaveLength(0);
    const mouthsInWoundsSave = activities(mouthsInWounds).find((activity: any) => activity.type === 'save');
    expect(mouthsInWoundsSave).toBeDefined();
    expect(mouthsInWoundsSave.save?.dc?.value).toBe(19);
    expect(mouthsInWoundsSave.damage?.parts?.[0]).toEqual(
      expect.objectContaining({ number: 5, denomination: 6, types: ['psychic'] }),
    );
    expect((mouthsInWounds.effects ?? []).flatMap((effect: any) => effect.statuses ?? []).sort()).toEqual([
      'dazed',
      'frightened',
    ]);
    const mouthsDazed = (mouthsInWounds.effects ?? []).find((effect: any) => (effect.statuses ?? []).includes('dazed'));
    expect(mouthsDazed?.img).toBe('icons/svg/daze.svg');
    for (const effect of mouthsInWounds.effects ?? []) {
      expect(mouthsInWoundsSave.effects ?? []).toEqual(expect.arrayContaining([{ _id: effect._id }]));
    }

    const summonShadowHounds = findItem(actor, 'Summon Shadow Hounds');
    expect(rules(summonShadowHounds).summons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorName: '暗影猎犬',
          countFormula: '1d6',
          range: 60,
          duration: expect.objectContaining({ value: 1, units: 'minute' }),
        }),
      ]),
    );

    const summonUtility = activities(summonShadowHounds).find((activity: any) => activity.type === 'utility');
    expect(summonUtility?.flags?.fvttJsonGenerator?.summon).toEqual(
      expect.objectContaining({
        actorName: rules(summonShadowHounds).summons[0].actorName,
        countFormula: '1d6',
        range: 60,
      }),
    );
    expect(summonUtility?.roll).toEqual(
      expect.objectContaining({
        name: 'Summon Count',
        formula: '1d6',
        prompt: false,
        visible: false,
      }),
    );
    expect(summonUtility?.rolls).toBeUndefined();

    expect(rules(findItem(actor, 'Unnatural Pursuit')).linkedAttacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attackName: '剑臂',
          triggerRange: 10,
        }),
      ]),
    );
    expect(rules(findItem(actor, 'Tormenting Approach')).movement).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'move', distance: 'halfSpeed' })]),
    );
  });

  it('models Shadow Hound bite as a condition-gated prone rider, not an unconditional grapple effect', async () => {
    const actor = await generateActor('shadow-hound');
    const bite = findItem(actor, 'Bite');

    expect(rules(bite).conditionGatedStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statuses: ['prone'],
          targetConditions: expect.arrayContaining(['发笑伤口', 'grappled', '骇人狂笑']),
        }),
      ]),
    );
    expect(rules(bite).onHitRiders ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statuses: expect.arrayContaining(['grappled']),
        }),
      ]),
    );
    expect((bite.effects ?? []).flatMap((effect: any) => effect.statuses ?? [])).not.toEqual(
      expect.arrayContaining(['grappled', 'prone']),
    );
    for (const activity of Object.values(bite.system.activities ?? {}) as any[]) {
      expect((activity.effects ?? []).length).toBe(0);
    }
  });
});
