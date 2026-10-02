import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { YamlParser } from '@fvtt-json-generator/parser';
import { ActorGenerator } from '@fvtt-json-generator/generation/actor';

function generate(file: string) {
  const source = readFileSync(join(import.meta.dir, '../obsidian/dnd数据转fvttjson/input', file), 'utf8');
  return new ActorGenerator({ fvttVersion: '12', effectProfile: 'modded-v12' }).generate(new YamlParser().parse(source));
}

describe('Crystalbleed approved source stages', () => {
  it('projects explicit token images without inventing one from portrait-only or empty input', () => {
    const base = readFileSync(join(import.meta.dir, 'fixtures/structured-save-outcomes.md'), 'utf8');
    for (const image of ['icons/svg/sword.svg', 'worlds/test/creature%20token.png', 'tokens/custom.webp']) {
      const source = base.replace('类型: npc', `类型: npc\nimg: portraits/portrait.webp\ntokenImg: "${image}"`);
      const actor = new ActorGenerator({ fvttVersion: '12' }).generate(new YamlParser().parse(source));
      expect(actor.img).toBe('portraits/portrait.webp');
      expect(actor.prototypeToken.texture.src).toBe(image);
    }
    for (const extra of ['', '\ntokenImg: "  "', '\nimg: portraits/portrait.webp']) {
      const actor = new ActorGenerator({ fvttVersion: '12' }).generate(new YamlParser().parse(base.replace('类型: npc', `类型: npc${extra}`)));
      expect(actor.prototypeToken.texture.src).toBe('');
    }
  });
  it('keeps crystal DEX damage separate from conditional CHA corruption and exhaustion', () => {
    const actor = generate('moonstone-salvo-crystal-v12.md');
    const spikes = actor.items.find((i: any) => i.name === '月石戳刺 (Moonstone Spikes)');
    const save: any = Object.values(spikes.system.activities).find((a: any) => a.type === 'save');
    expect(save.save).toEqual({ ability: ['dex'], dc: { calculation: '', formula: '18', value: 18 } });
    expect(save.damage.onSave).toBe('none');
    expect(save.effects ?? []).toEqual([]);
    expect(spikes.effects).toEqual([]);
    const corruption = actor.items.find((i: any) => i.name === '月石腐化 (Moonstone Corruption)');
    const followup: any = Object.values(corruption.system.activities).find((a: any) => a.type === 'save');
    expect(followup.save).toEqual({ ability: ['cha'], dc: { calculation: '', formula: '18', value: 18 } });
    expect(followup.effects ?? []).toEqual([]);
    expect(corruption.effects.flatMap((e: any) => e.statuses)).not.toContain('exhaustion');
    expect(corruption.system.description.value).toContain('若已经受到绯晶腐化，则改为获得 1 级力竭');
  });
  it('uses dazed only for salvo and preserves the new defiance cost rather than AC 15', () => {
    const actor = generate('crystalbleed-drakon-v12-rework.md');
    expect(actor.system.traits.languages.value).toEqual(['common', 'draconic', 'undercommon']);
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
    expect(actor.system.resources.legact).toMatchObject({ value: 4, max: 4 });
  });
});
