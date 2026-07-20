import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ParserFactory } from '../../parser/router';
import { ActorGenerator } from '../actor';

describe('Bolbara v14 structured fixture', () => {
  it('preserves source mechanics while remaining a portable pending caster', async () => {
    const source = readFileSync('obsidian/dnd数据转fvttjson/input/bol-bara.md', 'utf8');
    const parser = new ParserFactory();
    const parsed = parser.parse(source);
    const actor = await new ActorGenerator({
      translationService: null,
      fvttVersion: '14',
      effectProfile: 'core',
    }).generateForRoute(parsed, 'chinese');

    expect(actor.system.attributes.ac.flat).toBe(13);
    expect(actor.system.attributes.hp.formula).toBe('9d6 + 9');
    expect(actor.system.attributes.init.bonus).toBe('');
    expect(actor.system.details.type).toMatchObject({ value: 'humanoid', custom: '地精类' });
    expect(actor.system.resources.legact).toEqual({ max: 2, spent: 0 });

    const dagger = actor.items.find((item: any) => item.name.includes('Dagger'));
    const daggerActivity = Object.values(dagger.system.activities)[0] as any;
    expect(daggerActivity.attack).toMatchObject({ bonus: '4', flat: true, type: { value: 'mwak' } });
    expect(daggerActivity.range).toMatchObject({ reach: 5, value: 20, long: 60, units: 'ft' });
    expect(daggerActivity.damage.parts[0]).toMatchObject({ number: 1, denomination: 4, bonus: '2', types: ['piercing'] });

    const blast = actor.items.find((item: any) => item.name.includes('Eldritch Blast'));
    const blastActivity = Object.values(blast.system.activities)[0] as any;
    expect(blastActivity.attack).toMatchObject({ bonus: '4', flat: true, type: { value: 'rsak' } });
    expect(blastActivity.range).toMatchObject({ value: 120, long: null, units: 'ft' });
    expect(blastActivity.damage.parts[0]).toMatchObject({ number: 1, denomination: 10, bonus: '2', types: ['force'] });

    const dash = actor.items.find((item: any) => item.name.includes('Incorporeal Dash'));
    const dashActivity = Object.values(dash.system.activities)[0] as any;
    expect(dashActivity.activation).toMatchObject({ type: 'legendary', value: 1 });

    const zone = actor.items.find((item: any) => item.name.includes('Zone of Calamity'));
    const zoneActivity = Object.values(zone.system.activities)[0] as any;
    expect(zoneActivity.type).toBe('utility');
    expect(zoneActivity.activation).toMatchObject({ type: 'legendary', value: 2 });
    expect(zoneActivity.save).toBeUndefined();
    expect(zone.system.description.value).toContain('DC 12');

    const resolver = actor.flags['fvtt-json-generator-spell-resolver'];
    expect(resolver.spellResolution.status).toBe('pending');
    expect(resolver.spellManifest.spellcastingGroups[0].spellRefs).toHaveLength(8);
    expect(actor.items.filter((item: any) => item.type === 'spell')).toEqual([]);
    expect(actor.items.flatMap((item: any) => Object.values(item.system.activities ?? {})).some((activity: any) => activity.type === 'cast')).toBe(false);
  });
});
