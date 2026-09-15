import { describe, expect, it } from 'bun:test';
import { ActorGenerator } from '../../../src/core/generator/actor';

function createParsedActor(actions: any[]): any {
  return {
    name: 'Template Range Fixture',
    type: 'npc',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    attributes: {
      hp: { value: 10, max: 10 },
      ac: { value: 10, calc: 'flat' },
      movement: {},
      init: 0,
      prof: 2,
    },
    details: { cr: 0, xp: { value: 0 }, biography: { value: '' } },
    traits: { dr: {}, di: {}, ci: {}, languages: [], senses: {} },
    items: [],
    structuredActions: { 动作: actions },
  };
}

function getSaveActivity(actor: any, name: string): any {
  const item = actor.items.find((entry: any) => entry.name === name);
  return Object.values(item?.system?.activities ?? {}).find((activity: any) => activity.type === 'save');
}

function generateSave(description: string, aoe?: { shape: string; range: number }, name = 'Template Save'): any {
  return new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(
    createParsedActor([{
      name,
      type: 'save',
      DC: 13,
      ability: 'wis',
      ...(aoe ? { aoe } : {}),
      describe: description,
    }]),
  );
}

describe('source-derived area placement ranges', () => {
  it.each([
    {
      label: 'English point placement',
      description: 'A magical sphere with a 15-foot radius appears at a point within 60 feet.',
      aoe: { shape: 'sphere', range: 15 },
      expected: 60,
    },
    {
      label: 'English location placement',
      description: 'A 10-foot-radius area is created at a location within 30 feet.',
      aoe: { shape: 'sphere', range: 10 },
      expected: 30,
    },
    {
      label: 'Chinese placement',
      description: '一个半径15英尺的魔法球体出现在60尺内。',
      aoe: { shape: 'sphere', range: 15 },
      expected: 60,
    },
    {
      label: 'Chinese location placement',
      description: '一个球体从一个生物可见的60尺内的地点延伸。',
      aoe: { shape: 'sphere', range: 15 },
      expected: 60,
    },
  ])('projects the explicit $label range on the generated save Activity', ({ description, aoe, expected }) => {
    const actor = generateSave(description, aoe);
    const activity = getSaveActivity(actor, 'Template Save');

    expect(activity).toMatchObject({
      type: 'save',
      range: { value: expected, units: 'ft' },
      target: { template: { type: aoe.shape, size: aoe.range, units: 'ft' } },
    });
  });

  it.each([
    {
      label: 'cone length',
      description: 'A 60-foot cone erupts from the creature. Each creature in the cone makes a DC 13 Wisdom saving throw.',
      aoe: { shape: 'cone', range: 60 },
    },
    {
      label: 'generic target distance',
      description: 'Each creature within 60 feet makes a DC 13 Wisdom saving throw.',
      aoe: { shape: 'cone', range: 15 },
    },
    {
      label: 'Chinese creature distance and point damage',
      description: '位于60尺内的生物受到15尺范围效果，并承受点伤害。',
      aoe: { shape: 'sphere', range: 15 },
    },
  ])('does not reinterpret $label as an area placement range', ({ description, aoe }) => {
    const actor = generateSave(description, aoe);
    const activity = getSaveActivity(actor, 'Template Save');

    expect(activity.range).toBeUndefined();
    expect(activity.target.template).toMatchObject({ type: aoe.shape, size: aoe.range });
  });

  it('leaves an unrelated save Activity without a placement range or template', () => {
    const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(
      createParsedActor([
        {
          name: 'Placed Sphere',
          type: 'save',
          DC: 13,
          ability: 'wis',
          aoe: { shape: 'sphere', range: 15 },
          describe: 'A sphere appears at a point within 60 feet.',
        },
        {
          name: 'Unrelated Save',
          type: 'save',
          DC: 11,
          ability: 'con',
          describe: 'The creature makes a Constitution saving throw against the effect.',
        },
      ]),
    );
    const activity = getSaveActivity(actor, 'Unrelated Save');

    expect(activity.range).toBeUndefined();
    expect(activity.target).toBeUndefined();
  });
});
