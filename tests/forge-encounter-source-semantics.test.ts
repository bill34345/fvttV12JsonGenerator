import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { YamlParser } from '@fvtt-json-generator/parser';
import { ActorGenerator } from '@fvtt-json-generator/generation/actor';
import { assertEqualStructure } from '../src/core/utils/assertEqualStructure';

function generate(file: string) {
  const source = readFileSync(join(import.meta.dir, '../tools/forge-encounter/examples/crystalbleed', file), 'utf8');
  return new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(new YamlParser().parse(source));
}

describe('Crystalbleed approved source stages', () => {
  it('source audit rejects negative mutations of salvo damage, DC and successful-save outcome', () => {
    const source = readFileSync(join(import.meta.dir, '../tools/forge-encounter/examples/crystalbleed/dragon.md'), 'utf8');
    const parsed = new YamlParser().parse(source);
    const output = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(parsed);
    // Independent source-semantic check: final approved rule is CON18, 2d8 psychic,
    // half damage on success. Do not infer this expectation from generated JSON.
    const audit = (actor: any) => {
      const item = actor.items.find((entry: any) => entry.name === '晶片齐射 (Shard Salvo)');
      const a: any = Object.values(item.system.activities)[0];
      assertEqualStructure({ save: a.save, onSave: a.damage.onSave, parts: a.damage.parts.map((p: any) => ({number:p.number,denomination:p.denomination,types:p.types,bonus:p.bonus})) },
        { save: {ability:['con'],dc:{calculation:'',formula:'18'}},onSave:'half',parts:[{number:2,denomination:8,types:['psychic'],bonus:''}] });
    };
    expect(() => audit(output)).not.toThrow();
    for (const mutate of [
      (a: any) => { a.damage.parts[0].number = 9; },
      (a: any) => { a.save.dc.formula = '99'; },
      (a: any) => { a.damage.onSave = 'none'; },
    ]) {
      const copy = structuredClone(output);
      const salvo = copy.items.find((item: any) => item.name === '晶片齐射 (Shard Salvo)');
      mutate(Object.values(salvo.system.activities)[0]);
      expect(() => audit(copy)).toThrow();
    }
  });
  it('projects explicit token images without inventing one from portrait-only or empty input', () => {
    const base = readFileSync(join(import.meta.dir, 'fixtures/structured-save-outcomes.md'), 'utf8');
    for (const image of ['icons/svg/sword.svg', 'worlds/test/creature%20token.png', 'tokens/custom.webp']) {
      const source = base.replace('类型: npc', `类型: npc\nimg: portraits/portrait.webp\ntokenImg: "${image}"`);
      const actor = new ActorGenerator({ fvttVersion: '14' }).generate(new YamlParser().parse(source));
      expect(actor.img).toBe('portraits/portrait.webp');
      expect(actor.prototypeToken.texture.src).toBe(image);
    }
    for (const extra of ['', '\ntokenImg: "  "', '\nimg: portraits/portrait.webp']) {
      const actor = new ActorGenerator({ fvttVersion: '14' }).generate(new YamlParser().parse(base.replace('类型: npc', `类型: npc${extra}`)));
      expect(actor.prototypeToken.texture.src).toBe('');
    }
  });
  it('keeps crystal DEX damage separate from conditional CHA corruption and exhaustion', () => {
    const actor = generate('crystal.md');
    const spikes = actor.items.find((i: any) => i.name === '月石戳刺 (Moonstone Spikes)');
    const save: any = Object.values(spikes.system.activities).find((a: any) => a.type === 'save');
    expect(save.save).toEqual({ ability: ['dex'], dc: { calculation: '', formula: '18' } });
    expect(save.damage.onSave).toBe('none');
    expect(save.effects ?? []).toEqual([]);
    expect(spikes.effects).toEqual([]);
    const corruption = actor.items.find((i: any) => i.name === '月石腐化 (Moonstone Corruption)');
    const followup: any = Object.values(corruption.system.activities).find((a: any) => a.type === 'save');
    expect(followup.save).toEqual({ ability: ['cha'], dc: { calculation: '', formula: '18' } });
    expect(followup.effects ?? []).toEqual([]);
    expect(corruption.effects.flatMap((e: any) => e.statuses)).not.toContain('exhaustion');
    expect(corruption.system.description.value).toContain('若已经受到绯晶腐化，则改为获得 1 级力竭');
  });
  it('uses dazed only for salvo and preserves the new defiance cost rather than AC 15', () => {
    const actor = generate('dragon.md');
    expect(actor.system.traits.languages.value).toEqual(['common', 'draconic', 'undercommon']);
    expect(actor.system.traits.ci.value).toEqual(['charmed', 'frightened', 'poisoned', 'stunned', 'transformed']);
    const salvo = actor.items.find((i: any) => i.name === '晶片齐射 (Shard Salvo)');
    expect(salvo.effects.flatMap((e: any) => e.statuses)).toEqual(['fvtt-custom-conditions.dazed']);
    const save: any = Object.values(salvo.system.activities)[0];
    expect(save.damage.parts).toHaveLength(1);
    expect(save.damage.parts[0]).toMatchObject({ number: 2, denomination: 8, types: ['psychic'] });
    expect(save.activation).toMatchObject({ type: 'legendary', value: 2 });
    const defiance = actor.items.find((i: any) => i.name === '绯晶拒绝 (Ruidium Defiance)');
    expect(defiance.system.uses).toEqual({ spent: 0, max: '2', recovery: [{ period: 'day', type: 'recoverAll' }] });
    expect(defiance.effects.flatMap((e: any) => e.changes)).toEqual([]);
    expect(defiance.effects[0].description).toContain('下一回合开始');
    expect(actor.system.resources.legact).toMatchObject({ spent: 0, max: 4 });
  });
});


const fixture = readFileSync(join(import.meta.dir, 'fixtures/structured-save-outcomes.md'), 'utf8');
describe('generic structured lifecycle regressions', () => {
  for (const fvttVersion of ['12', '13', '14'] as const) {
    it(`preserves structured recharge, area and effect lifecycle on v${fvttVersion}`, () => {
      const actor = new ActorGenerator({ fvttVersion, effectProfile: 'core' }).generate(new YamlParser().parse(fixture));
      for (const [name, threshold, shape, size, status, duration] of [
        ['冰雾', '5', 'cone', 30, 'frightened', { seconds: 60, rounds: null }],
        ['Fire Wave', '4', 'sphere', 20, 'fvtt-custom-conditions.dazed', { seconds: null, rounds: 2 }],
        ['压力脉冲', '6', 'line', 60, 'fvtt-custom-conditions.dazed', { seconds: null, rounds: 1 }],
      ] as const) {
        const item = actor.items.find((entry: any) => entry.name === name);
        const activity: any = Object.values(item.system.activities)[0];
        expect(item.system.uses).toEqual({ spent: 0, max: '1', recovery: [{ period: 'recharge', type: 'recoverAll', formula: threshold }] });
        expect(activity.consumption.targets).toEqual([{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }]);
        expect(activity.target.template).toMatchObject({ type: shape, size, units: 'ft' });
        expect(activity.range?.value).not.toBe(5);
        const effects = item.effects.filter((effect: any) => effect.statuses.includes(status));
        expect(effects).toHaveLength(1);
        expect(effects[0].duration).toMatchObject(duration);
        expect(effects[0].flags.fvttJsonGenerator.sourceDerivedEmbeddedEffect).toBe(true);
        expect(activity.effects.filter((effect: any) => effect._id === effects[0]._id)).toHaveLength(1);
      }
      const noRecharge = actor.items.find((entry: any) => entry.name === '闪避尖刺');
      expect(noRecharge.system.uses).toBeUndefined();
      expect(noRecharge.effects).toEqual([]);
    });
  }
});
