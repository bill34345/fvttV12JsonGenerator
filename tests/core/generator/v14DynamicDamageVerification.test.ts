import { describe, expect, it } from 'bun:test';
import { adaptParsedActorToCanonical } from '@fvtt-json-generator/generation/adapters';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import { ActorGenerator } from '../../../src/core/generator/actor';

function createParsedNPC(structuredActions: Record<string, unknown>, abilities: Record<string, number>, prof: number): any {
  return {
    name: 'Dynamic Damage Test NPC',
    type: 'npc',
    abilities,
    attributes: {
      hp: { value: 10, max: 10 },
      ac: { value: 10, calc: 'flat' },
      movement: {},
      init: 0,
      prof,
    },
    details: { cr: 0, xp: { value: 0 }, biography: { value: '' } },
    traits: {
      dr: { value: [] },
      di: { value: [] },
      ci: { value: [] },
      languages: [],
      senses: {},
    },
    items: [],
    structuredActions,
  };
}

function firstAttack(actor: any, name: string): any {
  const item = actor.items.find((entry: any) => entry.name.includes(name));
  return Object.values(item?.system?.activities ?? {}).find((activity: any) => activity.type === 'attack');
}

describe('V14 dynamic weapon damage verification', () => {
  it('accepts native @mod damage for an exact bonus weapon attack', () => {
    const parsed = createParsedNPC({
      附赠动作: [{
        name: '尾击',
        englishName: 'Tail',
        type: 'attack',
        attackType: 'mwak',
        toHit: 9,
        range: '触及5尺',
        damage: [{ formula: '1d10+6', type: '钝击' }],
      }],
    }, { str: 23, dex: 11, con: 21, int: 1, wis: 10, cha: 5 }, 3);

    const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(parsed);
    const verification = verifyGeneratedDocument({
      canonical: adaptParsedActorToCanonical(parsed),
      output: actor,
      target: '14',
      effectProfile: 'core',
    });

    expect(verification.status).toBe('accepted');
    expect(firstAttack(actor, '尾击')?.damage.parts[0]?.bonus).toBe('@mod');
  });

  it('rejects a non-flat V14 weapon attack whose damage lost its dynamic projection', () => {
    const parsed = createParsedNPC({
      附赠动作: [{
        name: '尾击',
        englishName: 'Tail',
        type: 'attack',
        attackType: 'mwak',
        toHit: 9,
        range: '触及5尺',
        damage: [{ formula: '1d10+6', type: '钝击' }],
      }],
    }, { str: 23, dex: 11, con: 21, int: 1, wis: 10, cha: 5 }, 3);

    const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(parsed);
    const attack = firstAttack(actor, '尾击');
    attack.damage.parts = [];

    const verification = verifyGeneratedDocument({
      canonical: adaptParsedActorToCanonical(parsed),
      output: actor,
      target: '14',
      effectProfile: 'core',
    });

    expect(verification.status).toBe('failed');
    expect(verification.diagnostics.map((entry) => entry.code)).toContain('GEN_V14_DYNAMIC_WEAPON_DAMAGE_MISSING');
  });
});
