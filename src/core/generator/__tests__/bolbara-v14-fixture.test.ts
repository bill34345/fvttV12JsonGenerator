import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ParserFactory } from '../../parser/router';
import { ActorGenerator } from '../actor';

describe('Bolbara v14 structured fixture', () => {
  it('preserves attack ranges and legendary activation semantics', async () => {
    const source = readFileSync('obsidian/dnd数据转fvttjson/input/bolbara.md', 'utf8');
    const parser = new ParserFactory();
    const parsed = parser.parse(source);
    const actor = await new ActorGenerator({
      translationService: null,
      fvttVersion: '14',
      effectProfile: 'core',
    }).generateForRoute(parsed, 'chinese');

    expect(actor.system.attributes.ac.flat).toBe(15);
    expect(actor.system.attributes.hp.formula).toBe('9d6 + 9');
    expect(actor.system.resources.legact).toEqual({ max: 2, spent: 0 });

    const dagger = actor.items.find((item: any) => item.name === '匕首 (Dagger)');
    const daggerActivity = Object.values(dagger.system.activities)[0] as any;
    expect(daggerActivity.attack.type.value).toBe('mwak');
    expect(daggerActivity.range).toMatchObject({ reach: 5, value: 20, long: 60, units: 'ft' });
    expect(daggerActivity.damage.parts[0]).toMatchObject({ number: 1, denomination: 4, bonus: '2', types: ['piercing'] });

    const blast = actor.items.find((item: any) => item.name === '魔能爆 (Eldritch Blast)');
    const blastActivity = Object.values(blast.system.activities)[0] as any;
    expect(blastActivity.attack.type.value).toBe('rsak');
    expect(blastActivity.range).toMatchObject({ value: 120, long: null, units: 'ft' });
    expect(blastActivity.damage.parts[0]).toMatchObject({ number: 1, denomination: 10, bonus: '2', types: ['force'] });

    const dash = actor.items.find((item: any) => item.name === '无形冲刺 (Incorporeal Dash)');
    const dashActivity = Object.values(dash.system.activities)[0] as any;
    expect(dashActivity.activation).toMatchObject({ type: 'legendary', value: 1 });

    const zone = actor.items.find((item: any) => item.name.startsWith('灾祸之域 (Zone of Calamity'));
    const zoneActivity = Object.values(zone.system.activities)[0] as any;
    expect(zoneActivity.type).toBe('save');
    expect(zoneActivity.activation).toMatchObject({ type: 'legendary', value: 2 });
    expect(zoneActivity.save).toEqual({
      ability: ['wis'],
      dc: { calculation: '', formula: '12' },
    });
    expect(zoneActivity.damage).toEqual({ onSave: 'none', parts: [] });
    expect(zoneActivity.target.template).toMatchObject({ type: 'sphere', size: 15, units: 'ft' });

    for (const spellName of ['charm person', 'hex', 'hold person', 'invisibility']) {
      const spell = actor.items.find((item: any) => item.name === spellName);
      expect(spell.system.uses).toEqual({
        spent: 0,
        max: '1',
        recovery: [{ period: 'day', type: 'recoverAll' }],
      });
    }
    for (const spellName of ['eldritch blast', 'false life', 'mage armor', 'mage hand']) {
      const spell = actor.items.find((item: any) => item.name === spellName);
      expect(spell.system.uses).toBeUndefined();
    }
  });
});
