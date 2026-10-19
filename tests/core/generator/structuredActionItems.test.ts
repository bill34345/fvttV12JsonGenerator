import { describe, expect, it } from 'bun:test';
import { ActorGenerator } from '../../../src/core/generator/actor';
import type { StructuredActionData } from '../../../src/core/models/action';
import { attachEmbeddedEffects } from '../../../packages/generation/src/actor-item-builder';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { YamlParser } from '../../../packages/parser/src/yaml';
import { adaptParsedActorToCanonical } from '@fvtt-json-generator/generation/adapters';
import { verifyGeneratedDocument } from '@fvtt-json-generator/generation/verification';
import { enforceCoreConditionLifecycles } from '@fvtt-json-generator/generation/actor-effects';

describe('appendStructuredActionItems', () => {
  function createMinimalParsedNPC(structuredActions: any): any {
    return {
      name: 'Test NPC',
      type: 'npc',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      attributes: {
        hp: { value: 10, max: 10 },
        ac: { value: 10, calc: 'flat' as const },
        movement: {},
        init: 0,
        prof: 0,
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

  function getActivities(item: any): any[] {
    return Object.values(item.system?.activities ?? {});
  }

  function rechargeMarkdown(value: string): string {
    return `---
名称: Recharge Fixture
类型: npc
体型: 中型
生物类型: 怪兽
护甲等级: 12
生命值: 30
能力:
  力量: 12
  敏捷: 12
  体质: 12
  智力: 12
  感知: 12
  魅力: 12
挑战等级: 1
动作:
  - 名称: Recharge Breath
    类型: save
    充能: ${value}
    DC: 13
    DC来源: literal
    属性: 体质
    AoE: {形状: cone, 范围: 60}
    伤害:
      - 公式: 2d6
        类型: cold
    描述: 每个生物进行 DC 13 体质豁免。
---
`;
  }

  describe('utility action generation', () => {
    it('does not infer save mitigation, domination escape or attack-hit metadata from unrelated prose', () => {
      const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(createMinimalParsedNPC({特性:[
        {name:'Threshold Ward',type:'utility',describe:'每次受到超过20点伤害时，使本次伤害减半。'},
        {name:'血液支配',type:'save',DC:18,ability:'wis',describe:'目标进行DC18感知豁免；生命值未受损时具有优势。失败时使用反应攻击另一个目标。'},
        {name:'Choice After Hit',type:'save',DC:19,ability:'str',describe:'攻击命中后，可以选择要求目标进行DC19力量豁免。失败时目标倒地（Prone）；成功时无效果。'},
        {name:'Reverse Outcome',type:'utility',describe:'On a successful save, the target takes no damage. On a failed save, it takes half damage.'},
        {name:'反向分支',type:'utility',describe:'目标进行豁免。成功时不受伤害，失败时伤害减半。'},
      ]}));
      expect(actor.items[0].flags?.fvttJsonGenerator?.rules?.halfDamageOnSave).toBeUndefined();
      expect(actor.items[1].flags?.fvttJsonGenerator?.rules?.allyEscapeSave).toBeUndefined();
      expect(actor.items[2].flags?.fvttJsonGenerator?.rules?.onHitRiders).toBeUndefined();
      expect(getActivities(actor.items[2])[0].save.dc.formula).toBe('19');
      expect(actor.items[3].flags?.fvttJsonGenerator?.rules?.halfDamageOnSave).toBeUndefined();
      expect(actor.items[4].flags?.fvttJsonGenerator?.rules?.halfDamageOnSave).toBeUndefined();
    });
    it('generates utility action item from structured data', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '探测心灵感应',
          englishName: 'Probing Telepathy',
          type: 'utility',
          activation: { type: 'special' },
          describe: '若一个生物通过心灵感应与底栖魔鱼交流，且底栖魔鱼能看见该生物，底栖魔鱼即可获知该生物最深层的渴望。',
        },
      ];

      const parsed = createMinimalParsedNPC({
        特性: structuredActions,
      });

      const actor = generator.generate(parsed);
      const items = actor.items;

      expect(items.length).toBeGreaterThan(0);
      const item = items.find((i: any) => i.name.includes('探测心灵感应'));
      expect(item).toBeDefined();
      expect(item.type).toBe('feat');
      const activities = getActivities(item);
      expect(activities.length).toBeGreaterThan(0);
      expect(activities[0]?.type).toBe('utility');
      expect(activities[0]?.activation?.type).toBe('');
      expect(item.system.activation).toBeUndefined();
    });

    it('generates multiple utility actions in the same section', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '特性一',
          englishName: 'Feature One',
          type: 'utility',
          describe: '第一个特性',
        },
        {
          name: '特性二',
          englishName: 'Feature Two',
          type: 'utility',
          describe: '第二个特性',
        },
      ];

      const parsed = createMinimalParsedNPC({
        特性: structuredActions,
      });

      const actor = generator.generate(parsed);
      const items = actor.items;

      expect(items.filter((i: any) => i.name.includes('特性一') || i.name.includes('Feature One'))).toHaveLength(1);
      expect(items.filter((i: any) => i.name.includes('特性二') || i.name.includes('Feature Two'))).toHaveLength(1);
    });
  });

  describe('attack action generation', () => {
    it('keeps a complex timed condition GM-owned while preserving its Save and rest use', () => {
      const describe = 'Each target makes a DC 14 Wisdom saving throw. On a failed save, the target becomes frightened for 1 day. The effect ends if its source dies or is more than 1 mile away. Whenever the target takes damage, it repeats the saving throw, ending the effect on a success.';
      const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(createMinimalParsedNPC({
        附赠动作: [{ name: 'Dread Tether', type: 'save', activation: { type: 'bonus' }, DC: 14, ability: 'wis', describe,
          uses: { max: 1, period: 'shortRest' }, embeddedEffects: [{ type: 'frightened', describe, duration: '1 day' }] }],
      }));
      const item = actor.items.find((entry: any) => entry.name.includes('Dread Tether')), activity = getActivities(item)[0];
      expect(item.effects).toEqual([]); expect(activity.effects ?? []).toEqual([]);
      expect(activity).toMatchObject({ type: 'save', activation: { type: 'bonus' }, save: { dc: { formula: '14' }, ability: ['wis'] } });
      expect(item.system.uses).toMatchObject({ max: '1', recovery: [{ period: 'sr' }] });
      expect(activity.consumption.targets).toContainEqual(expect.objectContaining({ type: 'itemUses', value: '1' }));
      expect(item.system.description.value).toContain('1 mile');
      expect(item.flags.fvttJsonGenerator.conditionLifecycle).toMatchObject({ version: 1, mode: 'gm', sourceText: describe, statuses: ['frightened'] });
      expect(item.system.description.value).toContain('GM');
    });

    it('projects exact simple condition durations including Chinese 日 without changing untimed conditions', () => {
      for (const [duration, native] of [['1日', { seconds: 86400 }], ['1天', { seconds: 86400 }], ['1 day', { seconds: 86400 }], ['1 minute', { seconds: 60 }], ['2轮', { rounds: 2 }], [undefined, {}]] as const) {
        const describe = `The target becomes blinded${duration ? ' for ' + duration : ''}.`;
        const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(createMinimalParsedNPC({ 动作: [{ name: 'Light Veil', type: 'save', DC: 13, ability: 'con', describe, embeddedEffects: [{ type: 'blinded', describe, duration }] }] }));
        const item = actor.items.find((entry: any) => entry.name.includes('Light Veil'));
        expect(item.effects).toHaveLength(1); expect(item.effects[0].duration).toMatchObject(native);
        expect(getActivities(item)[0].effects).toEqual([{ _id: item.effects[0]._id, onSave: false }]);
      }
    });

    it('does not link an unrepresentable explicit condition duration as an indefinite Effect', () => {
      const describe = 'The target becomes stunned until the end of its next turn.';
      const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(createMinimalParsedNPC({ 动作: [{ name: 'Brief Shock', type: 'save', DC: 13, ability: 'con', describe, embeddedEffects: [{ type: 'stunned', describe, duration: 'until the end of its next turn' }] }] }));
      const item = actor.items.find((entry: any) => entry.name.includes('Brief Shock'));
      expect(item.effects).toEqual([]); expect(getActivities(item)[0].effects ?? []).toEqual([]);
    });

    it('keeps unparsed source durations GM-owned even when structured duration is absent', () => {
      for (const describe of ['The target becomes charmed for one minute.', '目标陷入魅惑，持续一日。']) {
        const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(createMinimalParsedNPC({ 动作: [{ name: 'Quiet Influence', type: 'save', DC: 13, ability: 'wis', describe, embeddedEffects: [{ type: 'charmed', describe }] }] }));
        expect(actor.items[0].effects).toEqual([]);
        expect(actor.items[0].flags.fvttJsonGenerator.conditionLifecycle.statuses).toEqual(['charmed']);
      }
    });

    it('retains a supported independent status while a different status lifecycle remains GM-owned', () => {
      for (const describe of ['The target is prone. It is poisoned until the end of its next turn.', '目标陷入倒地。它陷入中毒，直到其下一回合结束。']) {
        const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(createMinimalParsedNPC({ 动作: [{ name: 'Stinging Sweep', type: 'save', DC: 13, ability: 'dex', describe, embeddedEffects: [{ type: 'prone', describe }, { type: 'poisoned', describe }] }] }));
        const item = actor.items[0];
        expect(item.effects.flatMap((effect: any) => effect.statuses)).toEqual(['prone']);
        expect(getActivities(item)[0].effects).toEqual([{ _id: item.effects[0]._id, onSave: false }]);
        expect(item.flags.fvttJsonGenerator.conditionLifecycle.statuses).toEqual(['poisoned']);
      }
    });

    it('binds a shared trailing interval to coordinated states instead of making the first indefinite', () => {
      for (const describe of ['The target becomes blinded and deafened for 1 minute.', '目标陷入目盲和耳聋，持续1分钟。']) {
        const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(createMinimalParsedNPC({ 动作: [{ name: 'Sensory Flash', type: 'save', DC: 13, ability: 'con', describe, embeddedEffects: [{ type: 'blinded', describe }, { type: 'deafened', describe }] }] }));
        expect(actor.items[0].effects).toHaveLength(2);
        expect(actor.items[0].effects.map((effect: any) => effect.duration.seconds)).toEqual([60, 60]);
      }
    });

    it('maps all four ordinary attack kinds to the locked V14 native type while preserving literal rolls', () => {
      for (const kind of ['mwak', 'rwak', 'msak', 'rsak'] as const) {
        const action = { name: 'Literal Strike', type: 'attack', attackType: kind, toHit: 6, range: kind.startsWith('r') ? '60/120 ft.' : 'reach 5 ft.', damage: [{ formula: '2d6+4', type: 'force' }], describe: 'Literal attack.' };
        const item = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(createMinimalParsedNPC({ 动作: [action] })).items[0];
        expect(getActivities(item)[0].attack).toMatchObject({ flat: true, bonus: '6', type: { value: kind.startsWith('r') ? 'ranged' : 'melee', classification: kind.endsWith('sak') ? 'spell' : 'weapon' } });
        expect(getActivities(item)[0].damage.parts[0]).toMatchObject({ number: 2, denomination: 6, bonus: '4', types: ['force'] });
        const legacy = new ActorGenerator({ fvttVersion: '12', effectProfile: 'core' }).generate(createMinimalParsedNPC({ 动作: [action] })).items[0];
        expect(getActivities(legacy)[0].attack.type.value).toBe(kind);
        const mixed = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(createMinimalParsedNPC({ 动作: [{ ...action, executionMode: 'native-with-gm', nativeRuleText: action.describe, manualRemainder: 'Additional consequences remain GM-owned.' }] })).items[0];
        expect(getActivities(mixed)[0].attack.type).toEqual(getActivities(item)[0].attack.type);
      }
    });

    it('checks the complete source-bound GM status without granting missing basic mechanics', () => {
      const describe = 'Melee Weapon Attack: +6 to hit, reach 5 ft. Hit: 2d6+4 force damage, and the target becomes blinded for 1 day. The effect ends if its source dies.';
      const saveSource = 'The target makes a DC 14 Wisdom saving throw. On a failed save, the target becomes frightened for 1 day. The effect ends if its source dies.';
      const parsed = createMinimalParsedNPC({ 动作: [{ name: 'Dimming Strike', type: 'attack', attackType: 'mwak', toHit: 6, range: 'reach 5 ft.', describe, damage: [{ formula: '2d6+4', type: 'force' }], uses: { max: 1, period: 'shortRest' }, embeddedEffects: [{ type: 'blinded', describe, duration: '1 day' }] }, { name: 'Dread Pulse', type: 'save', DC: 14, ability: 'wis', describe: saveSource, embeddedEffects: [{ type: 'frightened', describe: saveSource, duration: '1 day' }] }] });
      const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(parsed);
      const canonical = adaptParsedActorToCanonical(parsed);
      const verify = (output: any) => verifyGeneratedDocument({ canonical, output, target: '14', effectProfile: 'core' });
      expect(verify(actor).diagnostics.filter(entry => entry.severity === 'error')).toEqual([]);
      for (const change of ['attack', 'damage', 'save', 'uses', 'source', 'qualifier', 'mode'] as const) {
        const altered = structuredClone(actor), item = altered.items[0], activities = Object.values(item.system.activities) as any[];
        if (change === 'attack') for (const [key, activity] of Object.entries(item.system.activities) as [string, any][]) { if (activity.type === 'attack') delete item.system.activities[key]; }
        if (change === 'damage') { for (const activity of activities) if (activity.damage) activity.damage.parts = []; if (item.system.damage) item.system.damage.base = {}; }
        if (change === 'save') for (const [key, activity] of Object.entries(altered.items[1].system.activities) as [string, any][]) { if (activity.type === 'save') delete altered.items[1].system.activities[key]; }
        if (change === 'uses') delete item.system.uses;
        if (change === 'source') item.flags.fvttJsonGenerator.conditionLifecycle.sourceText = 'Unrelated rule.';
        if (change === 'qualifier') item.system.description.value = '<p>The target becomes blinded.</p><p>GM</p>';
        if (change === 'mode') activities[0].attack.type.value = 'mwak';
        expect(verify(altered).status).toBe('failed');
      }
    });

    it('preserves the established modded until-damage executor and unrelated non-status Effects', () => {
      const describe = 'On a failed save, the target becomes frightened until it takes damage.';
      const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'modded-v14' }).generate(createMinimalParsedNPC({ 动作: [{ name: 'Dread Mark', type: 'save', DC: 14, ability: 'wis', describe }] }));
      const item = actor.items[0], effect = item.effects.find((entry: any) => entry.statuses?.includes('frightened'));
      expect(effect.flags.dae.specialDuration).toContain('isDamaged');
      expect(getActivities(item)[0].effects).toContainEqual(expect.objectContaining({ _id: effect._id }));
      const other = { items: [{ system: { description: { value: 'The target becomes prone. If the source is bloodied, its AC increases by 2.' }, activities: {} }, effects: [{ _id: 'nativeProne00001', statuses: ['prone'], duration: {} }, { _id: 'armorEffect00001', statuses: [], changes: [{ key: 'system.attributes.ac.bonus', value: '2' }] }] }] };
      const unchanged = structuredClone(other); enforceCoreConditionLifecycles(other);
      expect(other).toEqual(unchanged);
    });

    it('keeps unimplemented escape lifecycles GM-owned without losing the native attack', () => {
      const generator = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' });
      const actionSection = String.fromCodePoint(21160, 20316);
      const parsed = createMinimalParsedNPC({
        [actionSection]: [{
          name: 'Constraining Strike',
          type: 'attack',
          attackType: 'mwak',
          toHit: 5,
          range: 'reach 5 ft.',
          damage: [{ formula: '1d6+3', type: 'bludgeoning' }],
          describe: 'Hit: the target is grappled and restrained until it escapes.',
          embeddedEffects: [
            { type: 'grappled', describe: 'The target is grappled until it escapes.', duration: 'until it escapes' },
            { type: 'restrained', describe: 'The target is restrained until it escapes.', duration: 'until it escapes' },
          ],
        }],
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((entry: any) => entry.name.includes('Constraining Strike'));
      const activities = getActivities(item);
      const effectIds = (item.effects ?? []).map((effect: any) => effect._id);

      expect(item.effects).toEqual([]); expect(effectIds).toEqual([]);
      expect(activities[0].effects ?? []).toEqual([]);
      expect(activities[0].type).toBe('attack'); expect(activities[0].damage.parts).toHaveLength(1);
      expect(item.flags.fvttJsonGenerator.conditionLifecycle.statuses.sort()).toEqual(['grappled', 'restrained']);
    });

    it('does not create an embedded effect from unrelated non-application prose', () => {
      const generator = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' });
      const featureSection = String.fromCodePoint(29305, 24615);
      const parsed = createMinimalParsedNPC({
        [featureSection]: [{
          name: 'Escape Training',
          type: 'utility',
          describe: 'The creature has advantage on checks made to escape the grappled condition.',
        }],
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((entry: any) => entry.name.includes('Escape Training'));

      expect(item.effects ?? []).toEqual([]);
    });

    it('promotes a generic inferred status into the single source-derived embedded effect with its duration and failed-save linkage', () => {
      const generator = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' });
      const parsed = createMinimalParsedNPC({
        动作: [{
          name: 'Source Fear',
          type: 'save',
          DC: 15,
          ability: 'wis',
          describe: 'Each target makes a DC 15 Wisdom saving throw. On a failed save, the target becomes frightened for 1 minute.',
          embeddedEffects: [{
            type: '恐慌（Frightened）',
            describe: 'Source rule: duration is 1 minute.',
            duration: '1 minute',
          }],
        }],
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((entry: any) => entry.name.includes('Source Fear'));
      const activity = getActivities(item)[0];

      expect(item.effects).toHaveLength(1);
      expect(item.effects[0]).toMatchObject({
        statuses: ['frightened'],
        duration: { seconds: 60 },
        flags: { fvttJsonGenerator: { sourceDerivedEmbeddedEffect: true, sourceDuration: '1 minute' } },
      });
      expect(activity.effects).toEqual([{ _id: item.effects[0]._id, onSave: false }]);
    });

    it('keeps independent source-derived effects while suppressing only their generic status duplicates', () => {
      const generator = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' });
      const parsed = createMinimalParsedNPC({
        动作: [{
          name: 'Twin Afflictions',
          type: 'save',
          DC: 14,
          ability: 'con',
          describe: 'On a failed save, the target becomes frightened and dazed for 1 minute.',
          embeddedEffects: [
            { type: 'Frightened Rider', describe: 'On a failed save, the target becomes frightened for 1 minute.', duration: '1 minute' },
            { type: 'Dazed Rider', describe: 'On a failed save, the target becomes dazed for 1 minute.', duration: '1 minute' },
          ],
        }],
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((entry: any) => entry.name.includes('Twin Afflictions'));
      const activity = getActivities(item)[0];

      expect(item.effects).toHaveLength(2);
      expect(item.effects.map((effect: any) => effect.statuses[0]).sort()).toEqual([
        'frightened',
        'fvtt-custom-conditions.dazed',
      ]);
      expect(item.effects.every((effect: any) => effect.flags?.fvttJsonGenerator?.sourceDerivedEmbeddedEffect)).toBeTrue();
      const dazed = item.effects.find((effect: any) => effect.statuses[0] === 'fvtt-custom-conditions.dazed');
      expect(dazed.flags['fvtt-custom-conditions'].condition).toMatchObject({ conditionId: 'dazed', template: true });
      expect(activity.effects).toEqual(item.effects.map((effect: any) => ({ _id: effect._id, onSave: false })));
    });

    it('does not merge two source-authored effects that share one status but have independent duration and description', () => {
      const generator = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' });
      const parsed = createMinimalParsedNPC({
        动作: [{
          name: 'Layered Fear',
          type: 'save',
          DC: 14,
          ability: 'wis',
          describe: 'On a failed save, the target becomes frightened.',
          embeddedEffects: [
            { type: 'frightened', describe: 'First fear lasts 1 minute.', duration: '1 minute' },
            { type: 'frightened', describe: 'Second fear lasts 2 rounds.', duration: '2 rounds' },
          ],
        }],
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((entry: any) => entry.name.includes('Layered Fear'));
      const activity = getActivities(item)[0];

      expect(item.effects).toHaveLength(2);
      expect(item.effects.map((effect: any) => effect._id)).toHaveLength(2);
      expect(item.effects.map((effect: any) => effect.description)).toEqual(['First fear lasts 1 minute.', 'Second fear lasts 2 rounds.']);
      expect(item.effects.map((effect: any) => effect.duration)).toEqual([
        expect.objectContaining({ seconds: 60 }),
        expect.objectContaining({ rounds: 2 }),
      ]);
      expect(activity.effects).toEqual(item.effects.map((effect: any) => ({ _id: effect._id, onSave: false })));
    });

    it('does not consume an ambiguous multi-status generic effect for a single source status', () => {
      const item: any = {
        name: 'Ambiguous Effect Carrier',
        effects: [{ _id: 'generic-both', statuses: ['frightened', 'dazed'], duration: {}, description: 'generic effect', flags: {} }],
        system: { activities: { save: { type: 'save', effects: [{ _id: 'generic-both' }] } } },
      };

      attachEmbeddedEffects(item, [{ type: 'frightened', describe: 'Source fear lasts 1 minute.', duration: '1 minute' }]);

      expect(item.effects).toHaveLength(2);
      expect(item.effects[0]).toMatchObject({ _id: 'generic-both', statuses: ['frightened', 'dazed'], flags: {} });
      expect(item.effects[1]).toMatchObject({
        statuses: ['frightened'], duration: { seconds: 60 },
        flags: { fvttJsonGenerator: { sourceDerivedEmbeddedEffect: true, sourceDuration: '1 minute' } },
      });
      expect(item.system.activities.save.effects).toEqual([
        { _id: 'generic-both' },
        { _id: item.effects[1]._id, onSave: false },
      ]);
    });

    it('uses native ability-based weapon rolls for exact attack and damage modifier matches', () => {
      const generator = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' });
      const structuredActions: StructuredActionData[] = [
        {
          name: '爪击',
          englishName: 'Claw',
          type: 'attack',
          attackType: 'mwak',
          toHit: 6,
          range: '触及5尺',
          damage: [{ formula: '1d8+3', type: 'slashing', types: ['slashing', 'piercing'] }],
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });
      parsed.abilities = { str: 16, dex: 14, con: 16, int: 3, wis: 11, cha: 3 };
      parsed.attributes.prof = 3;

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('爪击'));
      expect(item).toBeDefined();
      expect(item.type).toBe('weapon');
      expect(item.system.damage.base).toEqual(
        expect.objectContaining({
          number: 1,
          denomination: 8,
          bonus: '',
          types: ['slashing', 'piercing'],
        }),
      );

      const attackActivity = getActivities(item).find((a: any) => a.type === 'attack');
      expect(attackActivity.attack).toEqual(
        expect.objectContaining({
          ability: 'str',
          bonus: '',
          flat: false,
        }),
      );
      expect(attackActivity.damage.includeBase).toBe(true);
      expect(attackActivity.damage.parts ?? []).toHaveLength(0);
    });

    it('keeps flat attack and literal damage when no exact ability match exists', () => {
      const generator = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' });
      const structuredActions: StructuredActionData[] = [
        {
          name: '强化爪击',
          englishName: 'Empowered Claw',
          type: 'attack',
          attackType: 'mwak',
          toHit: 8,
          range: '触及5尺',
          damage: [{ formula: '1d8+3', type: 'slashing' }],
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });
      parsed.abilities = { str: 16, dex: 14, con: 16, int: 3, wis: 11, cha: 3 };
      parsed.attributes.prof = 3;

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('强化爪击'));
      expect(item).toBeDefined();
      const attackActivity = getActivities(item).find((a: any) => a.type === 'attack');

      expect(attackActivity.attack).toEqual(
        expect.objectContaining({
          bonus: '8',
          flat: true,
        }),
      );
      expect(attackActivity.damage.parts[0]).toEqual(
        expect.objectContaining({
          number: 1,
          denomination: 8,
          bonus: '3',
          types: ['slashing'],
        }),
      );
    });

    it('generates attack action item without target', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '啮咬',
          englishName: 'Bite',
          type: 'attack',
          attackType: 'mwak',
          toHit: 14,
          range: '触及10尺',
          damage: [{ formula: '2d10+8', type: '穿刺' }],
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('啮咬'));

      expect(item).toBeDefined();
      expect(item.type).toBe('weapon');
      const activities = getActivities(item);
      const attackActivity = activities.find((a: any) => a.type === 'attack');
      expect(attackActivity).toBeDefined();
      expect(attackActivity.activation?.type).toBe('action');
      expect(attackActivity.attack?.type?.value).toBe('mwak');
      expect(item.system.activation).toBeUndefined();
    });

    it('generates ranged attack action', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '远程攻击',
          englishName: 'Ranged Attack',
          type: 'attack',
          attackType: 'rwak',
          toHit: 12,
          range: '120尺',
          damage: [{ formula: '8d6', type: '火焰' }],
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('远程攻击'));

      expect(item).toBeDefined();
      const activities = getActivities(item);
      const attackActivity = activities.find((a: any) => a.type === 'attack');
      expect(attackActivity.attack?.type?.value).toBe('rwak');
    });
  });

  describe('save action generation', () => {
    it('generates save action item without target', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '魔法火焰',
          englishName: 'Magical Fire',
          type: 'save',
          DC: 15,
          ability: 'dex',
          describe: '躲避魔法火焰',
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('魔法火焰'));

      expect(item).toBeDefined();
      const activities = getActivities(item);
      const saveActivity = activities.find((a: any) => a.type === 'save');
      expect(saveActivity).toBeDefined();
      expect(saveActivity.save?.dc?.value).toBe(15);
    });

    it('generates save action with recharge', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '重击',
          englishName: 'Heavy Hit',
          type: 'save',
          DC: 17,
          ability: 'str',
          recharge: [5, 6],
          describe: '强力重击',
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('重击'));

      expect(item).toBeDefined();
      expect(item.system.uses).toEqual({
        spent: 0,
        max: '1',
        recovery: [{ period: 'recharge', type: 'recoverAll', formula: '5' }],
      });
    });

    it('passes explicit DC source ability through to native save calculation', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: 'Radiant Burst',
          type: 'save',
          DC: 15,
          ability: 'dex',
          dcSourceAbility: 'wis',
          dcSourceKind: 'spellcasting',
          describe: 'Spellcasting ability is Wisdom. Each target makes a DC 15 Dexterity saving throw.',
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });
      parsed.abilities = { str: 18, dex: 14, con: 12, int: 12, wis: 18, cha: 10 };
      parsed.attributes.prof = 3;

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('Radiant Burst'));
      expect(item).toBeDefined();
      const saveActivity = getActivities(item).find((a: any) => a.type === 'save');

      expect(saveActivity.save.dc).toEqual(
        expect.objectContaining({
          calculation: 'wis',
          formula: '',
          value: 15,
        }),
      );
    });

    it.each(['5-6', '5–6', '5 至 6'])('parses renderer-compatible recharge range %s while rejecting a near non-range literal', (recharge) => {
      const source = rechargeMarkdown(recharge);
      const actor = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' }).generate(new YamlParser().parse(source));
      const item = actor.items.find((entry: any) => entry.name === 'Recharge Breath');
      expect(item.system.uses).toEqual({
        spent: 0,
        max: '1',
        recovery: [{ period: 'recharge', type: 'recoverAll', formula: '5' }],
      });
      expect(getActivities(item)[0].consumption.targets).toEqual([{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }]);

      const nearMiss = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' })
        .generate(new YamlParser().parse(rechargeMarkdown('5 to 6')));
      expect(nearMiss.items.find((entry: any) => entry.name === 'Recharge Breath').system.uses).toBeUndefined();
    });

    it('projects renderer-style recharge through the public Foundry 14.364 / dnd5e 5.3.3 workflow', async () => {
      const response = await convertFinalActorSource(buildForgeActorRequest({
        content: rechargeMarkdown('5-6'),
        displayName: 'Recharge Fixture',
        requestId: 'recharge-formal-workflow',
        fvttVersion: '14.364',
        systemVersion: '5.3.3',
      }));
      expect('result' in response).toBeTrue();
      if (!('result' in response)) throw new Error('Expected a Forge Actor result.');
      if (!('artifact' in response.result)) throw new Error('Expected a formal Actor artifact.');
      const item = (response.result.artifact!.items as any[]).find((entry) => entry.name === 'Recharge Breath');
      const activity = getActivities(item)[0];
      expect(response.result.artifact!._stats).toMatchObject({ coreVersion: '14.364', systemVersion: '5.3.3' });
      expect(item.system.uses).toEqual({
        spent: 0,
        max: '1',
        recovery: [{ period: 'recharge', type: 'recoverAll', formula: '5' }],
      });
      expect(activity.consumption.targets).toEqual([{ type: 'itemUses', target: '', value: '1', scaling: { mode: '', formula: '' } }]);
      expect(activity.target.template).toMatchObject({type:'cone',size:60,units:'ft'});
    });
    it.each(['9007199254740992-9007199254740993', `${'9'.repeat(400)}-${'9'.repeat(400)}`])('rejects unsafe recharge numbers %s', (recharge) => {
      const actor=new ActorGenerator({fvttVersion:'14',effectProfile:'core'}).generate(new YamlParser().parse(rechargeMarkdown(recharge)));
      expect(actor.items.find((entry:any)=>entry.name==='Recharge Breath').system.uses).toBeUndefined();
    });
  });

  describe('legendary action generation', () => {
    it('generates legendary action items with legendary activation type', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '精神迷雾',
          englishName: 'Mental Fog',
          type: 'save',
          activation: { type: 'legendary', condition: '消耗 2 动作' },
          DC: 17,
          ability: 'int',
          describe: '产生精神迷雾',
        },
        {
          name: '魂缚互换',
          englishName: 'Soulbound Swap',
          type: 'utility',
          activation: { type: 'legendary' },
          describe: '底栖魔鱼和至多一个被其魅惑的生物进行传送，互换位置。',
        },
      ];

      const parsed = createMinimalParsedNPC({
        传奇动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const items = actor.items;

      const mentalFog = items.find((i: any) => i.name.includes('精神迷雾'));
      expect(mentalFog).toBeDefined();
      expect(getActivities(mentalFog)[0]?.activation?.type).toBe('legendary');
      expect(mentalFog.system.activation).toBeUndefined();

      const soulbound = items.find((i: any) => i.name.includes('魂缚互换'));
      expect(soulbound).toBeDefined();
      expect(getActivities(soulbound)[0]?.activation?.type).toBe('legendary');
      expect(soulbound.system.activation).toBeUndefined();
    });
  });

  describe('section mapping', () => {
    it('maps 特性 section to passive activation', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '被动特性',
          englishName: 'Passive Feature',
          type: 'utility',
          describe: '被动能力',
        },
      ];

      const parsed = createMinimalParsedNPC({
        特性: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('被动特性'));

      expect(item).toBeDefined();
      expect(getActivities(item)[0]?.activation?.type).toBe('');
      expect(item.system.activation).toBeUndefined();
    });

    it('projects an exact bonus weapon attack as dynamic @mod damage while keeping a feat item', () => {
      const generator = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' });
      const structuredActions: StructuredActionData[] = [
        {
          name: '尾击',
          englishName: 'Tail',
          type: 'attack',
          attackType: 'mwak',
          toHit: 9,
          range: '触及5尺',
          damage: [
            { formula: '1d10+6', type: '钝击' },
            { formula: '1d6', type: '火焰' },
          ],
        },
      ];

      const parsed = createMinimalParsedNPC({
        附赠动作: structuredActions,
      });
      parsed.abilities = { str: 23, dex: 11, con: 21, int: 1, wis: 10, cha: 5 };
      parsed.attributes.prof = 3;

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('尾击'));

      expect(item).toBeDefined();
      expect(item.type).toBe('feat');
      const attackActivity = getActivities(item).find((activity: any) => activity.type === 'attack');
      expect(attackActivity.activation?.type).toBe('bonus');
      expect(attackActivity.attack).toEqual(expect.objectContaining({
        ability: 'str',
        bonus: '',
        flat: false,
      }));
      expect(attackActivity.damage.includeBase).toBe(false);
      expect(attackActivity.damage.parts).toEqual([
        expect.objectContaining({ number: 1, denomination: 10, bonus: '@mod', types: ['bludgeoning'] }),
        expect.objectContaining({ number: 1, denomination: 6, bonus: '', types: ['fire'] }),
      ]);
      expect(item.system.damage).toBeUndefined();
      expect(item.system.activation).toBeUndefined();
    });

    it('projects an exact reaction ranged weapon attack as dynamic dexterity damage', () => {
      const generator = new ActorGenerator({ fvttVersion: '14', effectProfile: 'core' });
      const structuredActions: StructuredActionData[] = [
        {
          name: '反应射击',
          englishName: 'Reaction Shot',
          type: 'attack',
          attackType: 'rwak',
          toHit: 7,
          range: '射程30尺',
          damage: [{ formula: '1d8+4', type: '穿刺' }],
        },
      ];

      const parsed = createMinimalParsedNPC({
        反应: structuredActions,
      });
      parsed.abilities = { str: 10, dex: 18, con: 10, int: 10, wis: 10, cha: 10 };
      parsed.attributes.prof = 3;

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('反应射击'));

      expect(item).toBeDefined();
      expect(item.type).toBe('feat');
      const attackActivity = getActivities(item).find((activity: any) => activity.type === 'attack');
      expect(attackActivity.activation?.type).toBe('reaction');
      expect(attackActivity.attack).toEqual(expect.objectContaining({
        ability: 'dex',
        bonus: '',
        flat: false,
      }));
      expect(attackActivity.damage.parts[0]).toEqual(
        expect.objectContaining({ number: 1, denomination: 8, bonus: '@mod', types: ['piercing'] }),
      );
      expect(item.system.activation).toBeUndefined();
    });
  });

  describe('perLongRest and concentration', () => {
    it('sets per-long-rest uses on items', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '特殊能力',
          englishName: 'Special Ability',
          type: 'utility',
          activation: { type: 'special', condition: '3次/日' },
          perLongRest: 3,
          describe: '每日三次的能力',
        },
      ];

      const parsed = createMinimalParsedNPC({
        特性: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('特殊能力'));

      expect(item).toBeDefined();
      expect(item.system.uses).toEqual(
        expect.objectContaining({
          spent: 0,
          max: '3',
          recovery: [{ period: 'lr', type: 'recoverAll' }],
        }),
      );
    });

    it('sets concentration flag on items', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '专注法术',
          englishName: 'Concentration Spell',
          type: 'utility',
          concentration: true,
          describe: '需要专注的法术',
        },
      ];

      const parsed = createMinimalParsedNPC({
        动作: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('专注法术'));

      expect(item).toBeDefined();
      expect(item.system.concentration).toBe(true);
    });
  });

  describe('english name preservation', () => {
    it('preserves english name in structured action data', () => {
      const generator = new ActorGenerator();
      const structuredActions: StructuredActionData[] = [
        {
          name: '探测心灵感应',
          englishName: 'Probing Telepathy',
          type: 'utility',
          describe: '描述文字',
        },
      ];

      const parsed = createMinimalParsedNPC({
        特性: structuredActions,
      });

      const actor = generator.generate(parsed);
      const item = actor.items.find((i: any) => i.name.includes('探测心灵感应'));

      expect(item).toBeDefined();
      expect(item.name).toContain('探测心灵感应');
    });
  });
});
