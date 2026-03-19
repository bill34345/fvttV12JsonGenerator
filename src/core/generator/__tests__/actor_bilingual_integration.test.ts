import { describe, expect, it } from 'bun:test';
import type { ParsedNPC } from '../../../config/mapping';
import { ActorGenerator } from '../actor';

type TranslationServiceLike = {
  translate(text: string, context?: { namespace?: string }): Promise<{ text: string }>;
};

function createEnglishParsed(): ParsedNPC {
  return {
    name: 'Adult Red Dragon',
    type: 'npc',
    abilities: {},
    attributes: {},
    details: {},
    traits: {},
    skills: {},
    saves: [],
    items: [],
    actions: [
      'Bite. Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage.',
    ],
  };
}

describe('ActorGenerator english bilingual integration', () => {
  it('formats actor and action names as bilingual when translation exists', async () => {
    const translationService: TranslationServiceLike = {
      async translate(text, context) {
        if (context?.namespace === 'actor.name' && text === 'Adult Red Dragon') {
          return { text: '成年红龙' };
        }
        if (context?.namespace === 'item.name' && text === 'Bite') {
          return { text: '啮咬' };
        }
        if (context?.namespace === 'item.description') {
          return { text: '这是一次翻译后的动作描述。' };
        }
        return { text };
      },
    };

    const generator = new ActorGenerator({ translationService });
    const actor = await generator.generateForRoute(createEnglishParsed(), 'english');

    expect(actor.name).toBe('成年红龙Adult Red Dragon');
    expect(actor.items[0].name).toBe('啮咬Bite');
    expect(actor.items[0].system.description.value).toBe('<p>这是一次翻译后的动作描述。</p>');
  });

  it('falls back to source english description when translation fails', async () => {
    const translationService: TranslationServiceLike = {
      async translate(text, context) {
        if (context?.namespace === 'item.description') {
          throw new Error('provider failed');
        }

        if (context?.namespace === 'actor.name') {
          return { text: '成年红龙' };
        }

        if (context?.namespace === 'item.name') {
          return { text: '啮咬' };
        }

        return { text };
      },
    };

    const generator = new ActorGenerator({ translationService });
    const actor = await generator.generateForRoute(createEnglishParsed(), 'english');

    expect(actor.items[0].system.description.value).toContain('Melee Weapon Attack: +14 to hit');
  });

  it('keeps chinese route behavior unchanged', async () => {
    let callCount = 0;
    const translationService: TranslationServiceLike = {
      async translate(text) {
        callCount += 1;
        return { text: `翻译-${text}` };
      },
    };

    const input: ParsedNPC = {
      name: '成年红龙',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: ['啮咬 [近战武器攻击]: +14命中, 触及10尺, 2d10+8穿刺'],
    };

    const generator = new ActorGenerator({ translationService });
    const actor = await generator.generateForRoute(input, 'chinese');

    expect(callCount).toBe(0);
    expect(actor.name).toBe('成年红龙');
    expect(actor.items[0].name).toBe('啮咬');
    expect(actor.img).toBe('');
    expect(actor.prototypeToken.texture.src).toBe('');
    expect(actor.prototypeToken.width).toBe(1);
    expect(actor.prototypeToken.height).toBe(1);
    expect(actor.prototypeToken.texture.scaleX).toBe(1);
    expect(actor.prototypeToken.texture.scaleY).toBe(1);
  });

  it('uses local glossary fallback when no translation service is configured', async () => {
    const generator = new ActorGenerator({ translationService: null });
    const actor = await generator.generateForRoute(createEnglishParsed(), 'english');

    expect(actor.name).toBe('成年红龙Adult Red Dragon');
    expect(actor.prototypeToken.name).toBe('成年红龙Adult Red Dragon');
    expect(actor.items[0].name).toBe('啮咬Bite');
    expect(actor.items[0].system.description.value).toContain('近战武器攻击');
    expect(actor.items[0].system.description.value).toContain('穿刺伤害');
  });

  it('clears golden-master-only defaults for english route when source does not provide them', async () => {
    const generator = new ActorGenerator({ translationService: null });
    const actor = await generator.generateForRoute(createEnglishParsed(), 'english');

    expect(actor.system.resources.legact.value).toBe(0);
    expect(actor.system.resources.legres.value).toBe(0);
    expect(actor.system.resources.lair.value).toBe(false);
    expect(actor.system.traits.di.value).toEqual([]);
    expect(actor.system.traits.dr.value).toEqual([]);
    expect(actor.system.traits.dv.value).toEqual([]);
    expect(actor.system.traits.dm.amount).toEqual({});
    expect(actor.img).toBe('');
    expect(actor.prototypeToken.texture.src).toBe('');
    expect(actor.prototypeToken.width).toBe(1);
    expect(actor.prototypeToken.height).toBe(1);
    expect(actor.prototypeToken.texture.scaleX).toBe(1);
    expect(actor.prototypeToken.texture.scaleY).toBe(1);
  });

  it('keeps bonus actions and reactions as distinct activation types', async () => {
    const generator = new ActorGenerator({ translationService: null });
    const input: ParsedNPC = {
      name: 'Skirmisher',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: ['Scimitar. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.'],
      bonus_actions: ['Dash. The skirmisher moves up to its speed.'],
      reactions: ['Parry. The skirmisher adds 2 to its AC against one melee attack.'],
    };

    const actor = await generator.generateForRoute(input, 'english');
    const actionItem = actor.items.find((item: any) => item.name.includes('Scimitar'));
    const bonusItem = actor.items.find((item: any) => item.name.includes('Dash'));
    const reactionItem = actor.items.find((item: any) => item.name.includes('Parry'));

    expect(actionItem.system.activation.type).toBe('action');
    expect(bonusItem.system.activation.type).toBe('bonus');
    expect(reactionItem.system.activation.type).toBe('reaction');
  });

  it('keeps english spellcasting as description feat instead of spell items', async () => {
    const generator = new ActorGenerator({ translationService: null });
    const input: ParsedNPC = {
      name: 'Pinna',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      spellcasting: [
        'Spellcasting. Pinna is a 3rd-level spellcaster.',
        'Cantrips (at will): minor illusion, mage hand',
      ],
    };

    const actor = await generator.generateForRoute(input, 'english');
    const spellItems = actor.items.filter((item: any) => item.type === 'spell');
    const spellcastingFeat = actor.items.find((item: any) => item.system?.type?.subtype === 'spellcasting');

    expect(spellItems).toHaveLength(0);
    expect(spellcastingFeat).toBeDefined();
    expect(spellcastingFeat.name).toBe('施法Spellcasting');
    expect(spellcastingFeat.system.description.value).toContain('戏法Cantrips');
    expect(spellcastingFeat.system.description.value).toContain('minor illusion');
  });

  it('writes activity-level activation fields for fvtt v13 output', async () => {
    const generator = new ActorGenerator({ translationService: null, fvttVersion: '13' });
    const input: ParsedNPC = {
      name: 'Skirmisher',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {},
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: ['Slash. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage.'],
      bonus_actions: ['Dash. The skirmisher moves up to its speed.'],
      reactions: ['Parry. The skirmisher adds 2 to its AC against one melee attack.'],
    };

    const actor = await generator.generateForRoute(input, 'english');
    const slash = actor.items.find((item: any) => item.name.includes('Slash'));
    const dash = actor.items.find((item: any) => item.name.includes('Dash'));
    const parry = actor.items.find((item: any) => item.name.includes('Parry'));

    const slashActivity = Object.values(slash.system.activities)[0] as any;
    const dashActivity = Object.values(dash.system.activities)[0] as any;
    const parryActivity = Object.values(parry.system.activities)[0] as any;

    expect(slashActivity.activation.type).toBe('action');
    expect(dashActivity.activation.type).toBe('bonus');
    expect(parryActivity.activation.type).toBe('reaction');
  });

  it('keeps v12 output without activity-level activation fields', async () => {
    const generator = new ActorGenerator({ translationService: null, fvttVersion: '12' });
    const actor = await generator.generateForRoute(createEnglishParsed(), 'english');
    const firstActivity = Object.values(actor.items[0].system.activities)[0] as any;

    expect(firstActivity.activation).toBeUndefined();
  });

  it('infers bonus/reaction activation from trait text outside action sections', async () => {
    const generator = new ActorGenerator({ translationService: null });
    const input: ParsedNPC = {
      name: 'Bonebreaker Dorokor',
      type: 'npc',
      abilities: {},
      attributes: {},
      details: {
        biography:
          '***Aggressive.*** As a bonus action, the orc can move up to its speed toward a hostile creature it can see.\n\n***Wielder of Wound.*** Bonebreaker Dorokor wields the magical greataxe Wound.',
      },
      traits: {},
      skills: {},
      saves: [],
      items: [],
      actions: ['Charge. Allies can move up to their speed as a reaction.'],
    };

    const actor = await generator.generateForRoute(input, 'english');
    const aggressive = actor.items.find((item: any) => item.name.includes('Aggressive'));
    const wielder = actor.items.find((item: any) => item.name.includes('Wielder of Wound'));
    const charge = actor.items.find((item: any) => item.name.includes('Charge'));

    expect(aggressive).toBeDefined();
    expect(aggressive.system.activation.type).toBe('bonus');
    expect(wielder).toBeDefined();
    expect(wielder.system.activation.type).toBe('');
    expect(charge).toBeDefined();
    expect(charge.system.activation.type).toBe('reaction');
    expect(actor.system.details.biography.value).toBe('');
  });
});
