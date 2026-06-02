import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActorGenerator } from '../../src/core/generator/actor';
import type { ParsedNPC } from '../../src/config/mapping';

const generator = new ActorGenerator({ effectProfile: 'modded-v12', fvttVersion: '12' });
const fixtureDir = resolve(process.cwd(), 'tests/fixtures/riders');

function fixture(name: string): string {
  return readFileSync(resolve(fixtureDir, name), 'utf-8').trim();
}

function generateWith(actionLine: string, bucket: 'actions' | 'bonus_actions' | 'reactions' = 'actions') {
  const input: ParsedNPC = {
    name: '通用Rider测试怪',
    type: 'npc',
    abilities: {},
    attributes: {},
    details: {},
    traits: {},
    skills: {},
    saves: [],
    items: [],
    [bucket]: [actionLine],
  };

  return generator.generate(input, { route: 'english' });
}

function firstItem(actor: any): any {
  expect(actor.items).toHaveLength(1);
  return actor.items[0];
}

function activities(item: any): any[] {
  return Object.values(item.system.activities ?? {});
}

function rules(item: any): any {
  return item.flags?.fvttJsonGenerator?.rules ?? {};
}

describe('generic rider extraction acceptance', () => {
  it('extracts on-hit grapple and restrained riders without creature-name matching', () => {
    const item = firstItem(generateWith(fixture('on-hit-status.md')));

    expect(rules(item).onHitRiders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'status',
          statuses: expect.arrayContaining(['grappled', 'restrained']),
          escapeDc: 15,
        }),
      ]),
    );
    expect((item.effects ?? []).flatMap((effect: any) => effect.statuses ?? [])).toEqual(
      expect.arrayContaining(['grappled', 'restrained']),
    );
  });

  it('extracts conditional replacement damage as a separate rider instead of polluting base hit damage', () => {
    const item = firstItem(generateWith(fixture('conditional-damage.md')));
    const attacks = activities(item).filter((activity) => activity.type === 'attack');
    const attack = attacks.find((activity) => !activity.flags?.fvttJsonGenerator?.conditionalDamage);
    const conditionalAttack = attacks.find((activity) => activity.flags?.fvttJsonGenerator?.conditionalDamage);

    expect(attacks).toHaveLength(2);
    expect(attack.damage.parts).toHaveLength(1);
    expect(attack.damage.parts[0]).toEqual(
      expect.objectContaining({ number: 2, denomination: 8, bonus: '4', types: ['bludgeoning'] }),
    );
    expect(conditionalAttack.damage.parts[0]).toEqual(
      expect.objectContaining({ number: 4, denomination: 8, bonus: '4', types: ['bludgeoning'] }),
    );
    expect(rules(item).conditionalDamage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: 'replace',
          formula: '4d8+4',
          damageType: 'bludgeoning',
          targetConditions: expect.arrayContaining(['grappled']),
        }),
      ]),
    );
  });

  it('extracts custom on-hit marks, reaction denial, and specific save penalties', () => {
    const item = firstItem(generateWith(fixture('save-penalty.md')));

    expect(rules(item).onHitRiders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'customEffect',
          label: '尖笑印记',
          cannotReact: true,
          duration: expect.objectContaining({ until: 'targetNextTurnEnd' }),
        }),
      ]),
    );
    expect(rules(item).savePenalties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dice: '1d4',
          against: '尖啸凝视',
        }),
      ]),
    );
  });

  it('extracts temporary overrides that empower another ability', () => {
    const item = firstItem(generateWith(fixture('temporary-override.md')));

    expect(rules(item).temporaryOverrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          triggerDamageTypes: expect.arrayContaining(['piercing', 'slashing']),
          targetAbility: '尖啸凝视',
          saveDc: 19,
          damage: expect.objectContaining({ formula: '5d6', type: 'psychic' }),
          duration: expect.objectContaining({ until: 'selfNextTurnStart' }),
        }),
      ]),
    );
  });

  it('extracts linked attacks from reaction text', () => {
    const item = firstItem(generateWith(fixture('linked-attack-reaction.md'), 'reactions'));

    expect(item.system.activation.type).toBe('reaction');
    expect(rules(item).linkedAttacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attackName: '裂笑刃',
          triggerRange: 10,
        }),
      ]),
    );
  });

  it('extracts summon count, range, duration, and summoned actor name', () => {
    const item = firstItem(generateWith(fixture('summon-metadata.md')));

    expect(item.system.uses).toEqual(expect.objectContaining({ value: 1, max: 1 }));
    expect(rules(item).summons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorName: '灰影',
          countFormula: '1d6',
          range: 60,
          duration: expect.objectContaining({ value: 1, units: 'minute' }),
        }),
      ]),
    );
    const utility = activities(item).find((activity: any) => activity.type === 'utility');
    expect(utility?.flags?.fvttJsonGenerator?.summon).toEqual(
      expect.objectContaining({
        actorName: rules(item).summons[0].actorName,
        countFormula: '1d6',
        range: 60,
      }),
    );
    expect(utility?.roll).toEqual(
      expect.objectContaining({
        name: 'Summon Count',
        formula: '1d6',
        prompt: false,
        visible: false,
      }),
    );
    expect(utility?.rolls).toBeUndefined();
  });

  it('extracts condition-gated status riders', () => {
    const item = firstItem(generateWith(fixture('condition-gated-status.md')));

    expect(rules(item).conditionGatedStatuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statuses: ['prone'],
          targetConditions: expect.arrayContaining(['尖笑印记', 'grappled', '尖啸凝视']),
        }),
      ]),
    );
  });

  it('extracts failed-save and immunity replacement branches', () => {
    const item = firstItem(generateWith(fixture('save-branches.md')));

    expect(rules(item).onFailedSave).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'speedZero' }),
      ]),
    );
    expect(rules(item).immunityReplacements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          immuneTo: 'frightened',
          replacementStatuses: ['dazed'],
        }),
      ]),
    );
  });
});
