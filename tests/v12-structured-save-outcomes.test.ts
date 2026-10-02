import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { YamlParser } from '@fvtt-json-generator/parser';
import { ActorGenerator } from '@fvtt-json-generator/generation/actor';

const fixture = readFileSync(join(import.meta.dir, 'fixtures/structured-save-outcomes.md'), 'utf8');

describe('source-derived save damage outcomes on every supported target', () => {
  for (const fvttVersion of ['12', '13', '14'] as const) {
    it(`emits native onSave for v${fvttVersion} without adding save semantics to attacks`, () => {
      const parsed = new YamlParser().parse(fixture);
      const actor = new ActorGenerator({ fvttVersion, effectProfile: 'core' }).generate(parsed);
      const expected = [
        ['冰雾', 'half', 2, 6, 'cold'],
        ['Fire Wave', 'half', 3, 8, 'fire'],
        ['压力脉冲', 'full', 1, 10, 'force'],
        ['闪避尖刺', 'none', 2, 4, 'piercing'],
      ] as const;
      for (const [name, onSave, number, denomination, type] of expected) {
        const item = actor.items.find((entry: any) => entry.name === name);
        const activity: any = Object.values(item.system.activities)[0];
        expect(activity.type).toBe('save');
        expect(activity.damage).toEqual({
          onSave,
          parts: [{
            custom: { enabled: false, formula: '' },
            number,
            denomination,
            bonus: '',
            types: [type],
            scaling: { mode: 'whole', number: 1, formula: '' },
          }],
        });
      }
      const noDamage = actor.items.find((entry: any) => entry.name === '无伤害豁免');
      const noDamageActivity: any = Object.values(noDamage.system.activities)[0];
      expect(noDamageActivity.damage).toEqual({ onSave: 'none', parts: [] });
      const claw = actor.items.find((entry: any) => entry.name === '普通爪击');
      const clawActivity: any = Object.values(claw.system.activities)[0];
      expect(clawActivity.type).toBe('attack');
      expect(clawActivity.damage).not.toHaveProperty('onSave');
      expect(clawActivity.save).toBeUndefined();
      expect(clawActivity.range.reach).toBe(5);
      expect(claw.system.damage.base).toMatchObject({ number: 1, denomination: 6, types: ['slashing'] });
    });
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
