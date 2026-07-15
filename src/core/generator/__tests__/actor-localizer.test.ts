import { describe, expect, it } from 'bun:test';
import { assertEqualStructure } from '../../utils/assertEqualStructure';
import { ActorLocalizer, type TranslationServiceLike } from '../actor-localizer';

function createActor() {
  return {
    name: 'Adult Red Dragon',
    prototypeToken: { name: 'Adult Red Dragon' },
    items: [
      {
        name: 'Bite',
        system: {
          source: { custom: 'Imported' },
          type: { subtype: '' },
          description: { value: '<p>Melee Weapon Attack: +10 to hit. Hit: 1d10 piercing damage.</p>' },
        },
      },
      {
        name: 'Reference Item',
        system: {
          source: { custom: 'Compendium' },
          type: { subtype: '' },
          description: { value: '<p>Must stay untouched.</p>' },
        },
      },
    ],
  };
}

describe('ActorLocalizer', () => {
  it('preserves the existing offline fallback boundary for English Actors', async () => {
    const actor = await new ActorLocalizer({ route: 'english' }).localize(createActor());

    assertEqualStructure(
      {
        actorName: actor.name,
        tokenName: actor.prototypeToken.name,
        importedName: actor.items[0].name,
        referenceName: actor.items[1].name,
        referenceDescription: actor.items[1].system.description.value,
      },
      {
        actorName: '成年红龙Adult Red Dragon',
        tokenName: '成年红龙Adult Red Dragon',
        importedName: 'Bite',
        referenceName: 'Reference Item',
        referenceDescription: '<p>Must stay untouched.</p>',
      },
    );
    expect(actor.items[0].system.description.value).toContain('近战武器攻击');
    expect(actor.items[0].system.description.value).toContain('穿刺伤害');
  });

  it('uses the injected service with the existing namespace contract', async () => {
    const namespaces: string[] = [];
    const service: TranslationServiceLike = {
      async translate(text, context) {
        namespaces.push(context?.namespace ?? '');
        if (context?.namespace === 'actor.name') return { text: '成年红龙' };
        if (context?.namespace === 'item.name') return { text: '啮咬' };
        if (context?.namespace === 'item.description') return { text: '攻击描述' };
        return { text };
      },
    };

    const actor = await new ActorLocalizer({ route: 'english', translationService: service }).localize(createActor());

    expect(actor.name).toBe('成年红龙Adult Red Dragon');
    expect(actor.prototypeToken.name).toBe(actor.name);
    expect(actor.items[0].name).toBe('啮咬Bite');
    expect(actor.items[0].system.description.value).toBe('<p>攻击描述</p>');
    expect(namespaces).toEqual(['actor.name', 'item.name', 'item.description']);
  });

  it('keeps source text when the injected provider fails', async () => {
    const service: TranslationServiceLike = {
      async translate() {
        throw new Error('provider unavailable');
      },
    };

    const actor = await new ActorLocalizer({ route: 'english', translationService: service }).localize(createActor());

    expect(actor.name).toBe('Adult Red Dragon');
    expect(actor.items[0].name).toBe('Bite');
    expect(actor.items[0].system.description.value).toBe(
      '<p>Melee Weapon Attack: +10 to hit. Hit: 1d10 piercing damage.</p>',
    );
  });
});
