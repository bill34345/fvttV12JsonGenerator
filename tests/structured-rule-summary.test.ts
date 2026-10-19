import { describe, expect, test } from 'bun:test';
import type { ActionData, StructuredActionData } from '@fvtt-json-generator/models/action';
import { summarizeStructuredRule } from '@fvtt-json-generator/generation/structured-rule-summary';

describe('structured rule audit uses consumed facts', () => {
  test('the schema sphere is a known area in both consumed action and native template paths', () => {
    const source: ActionData = { name: 'Area', type: 'save', aoe: { template: { type: 'sphere', distance: 15 } } };
    const native: ActionData = { name: 'Area', type: 'save', activity: { target: { template: { type: 'sphere', size: '20', units: 'ft' } } } };
    for (const [action, size] of [[source, 15], [native, 20]] as const) {
      const result = summarizeStructuredRule({ logicalPath: 'area', action });
      expect(result?.zh).toContain(`球形区域，范围${size}尺`);
      expect(result?.uncovered).toEqual([]);
    }
    const unknown = summarizeStructuredRule({ logicalPath: 'unknown', action: { ...source, aoe: { template: { type: 'capsule', distance: 15 } } } });
    expect(unknown?.uncovered).toEqual(['unknown/structured/aoe: capsule/15']);
  });

  test('attack damage relationships and an armour condition stay distinct', () => {
    const action: ActionData = {
      name: 'Any attack', type: 'attack',
      attack: { type: 'mwak', toHit: 7, range: '5', damage: [{ formula: '2d8', type: 'slashing' }] },
      sourceDamageParts: [
        { formula: '2d8', type: 'slashing', relationship: 'base' },
        { formula: '1d4', type: 'fire', relationship: 'additional' },
        { formula: '1d6', type: 'cold', relationship: 'conditional', condition: 'if target is frozen' },
        { formula: '3d6', type: 'acid', relationship: 'replacement', condition: 'instead while submerged' },
      ],
      sourceRuleFacts: [{ kind: 'heavy-armour-half', source: 'complete source rule',
        targetCondition: 'grappled', grappler: 'creature', average: 9, formula: '2d8',
        damageType: 'slashing', armourNegated: false }],
    };
    const sourceAction: StructuredActionData = { name: 'Any attack', type: 'attack',
      activation: { type: 'bonus', condition: 'when the moon is red' },
      target: { count: 1, type: 'creature' },
      embeddedEffects: [{ type: 'grappled', describe: 'until it escapes',
        escapeDc: 15, staged: true, duration: '2 rounds' }],
    };
    const result = summarizeStructuredRule({ logicalPath: 'action/0', action, sourceAction,
      generatedItem: { effects: [{ statuses: ['grappled'] }] } });
    expect(result?.zh).toContain('基础伤害2d8点挥砍');
    expect(result?.zh).toContain('追加伤害1d4点火焰');
    expect(result?.zh).toContain('条件伤害1d6点寒冷，触发或替代条件待GM核对');
    expect(result?.zh).toContain('替代伤害3d6点强酸，触发或替代条件待GM核对');
    expect(result?.zh).toContain('穿着重甲时伤害减半');
    expect(result?.zh).toContain('附赠动作');
    expect(result?.zh).toContain('受擒，逃脱DC 15，按阶段变化，持续2轮');
    expect(result?.zh).not.toContain('if target is frozen');
    expect(result?.uncovered).toContain('action/0/structured/damage/2/condition: if target is frozen');
    expect(result?.executionMode).toBe('gm-assisted');
  });

  test('save, area, combined native damage and finite recharge are preserved', () => {
    const action: ActionData = { name: 'Any burst', type: 'save',
      save: { dc: 15, ability: 'con', outcome: 'half' },
      damage: [{ formula: '5d8', type: 'acid' }, { formula: '5d8', type: 'necrotic' }],
      aoe: { template: { type: '球形', distance: 20 } },
      targetAffected: { count: 'all', type: 'creature' },
      sourceRuleFacts: [{ kind: 'visible-target-save-damage', source: 'complete source rule',
        viewer: 'the creature', withinFeet: 30, dc: 15, ability: 'con', halfOnSuccess: true,
        damages: [{ average: 22, formula: '5d8', damageType: 'acid' },
          { average: 22, formula: '5d8', damageType: 'necrotic' }] }],
    };
    const sourceAction: StructuredActionData = { name: 'Any burst', type: 'save',
      recharge: [5, 6], activation: { type: 'action' },
      uses: { max: 2, period: 'longRest' },
    };
    const result = summarizeStructuredRule({ logicalPath: 'action/1', action, sourceAction });
    expect(result?.zh).toContain('DC 15体质豁免，成功时伤害减半');
    expect(result?.zh).toContain('5d8点强酸');
    expect(result?.zh).toContain('5d8点暗蚀');
    expect(result?.zh).toContain('球形区域，范围20尺');
    expect(result?.zh).toContain('所有生物');
    expect(result?.zh).toContain('施用者能看见且位于30尺内的一名生物');
    expect(result?.zh).toContain('充能5—6');
    expect(result?.zh).toContain('每次长休可使用2次');
    expect(result?.executionMode).toBe('native');
    expect(result?.uncovered).toEqual([]);
  });

  test('forced movement keeps distance formula and save, independently of action name', () => {
    const action: ActionData = { name: 'First title', type: 'save',
      save: { dc: 12, ability: 'str', outcome: 'none' },
      sourceRuleFacts: [{ kind: 'forced-movement', source: 'full source',
        target: 'creature', dc: 12, ability: 'str', distance: 25,
        distanceFormula: '1d10x5', origin: 'the source' }],
    };
    const first = summarizeStructuredRule({ logicalPath: 'action/2', action });
    const renamed = summarizeStructuredRule({ logicalPath: 'action/2', action: { ...action, name: 'Completely changed' } });
    expect(first).toEqual(renamed);
    expect(first?.zh).toContain('DC 12力量豁免');
    expect(first?.zh).toContain('推离25（1d10×5）尺');
    expect(first?.executionMode).toBe('gm-assisted');
  });

  test('nearby contradictory fact is flagged instead of certified in Chinese', () => {
    const action: ActionData = { name: 'Any hit', type: 'attack',
      attack: { type: 'mwak', toHit: 5, range: '5', damage: [{ formula: '2d8', type: 'slashing' }] },
      sourceRuleFacts: [{ kind: 'heavy-armour-half', source: 'conflicting complete source',
        targetCondition: 'grappled', grappler: 'creature', average: 9, formula: '3d8',
        damageType: 'slashing', armourNegated: false }],
    };
    const result = summarizeStructuredRule({ logicalPath: 'action/conflict', action });
    expect(result?.zh).toContain('来源条件伤害与Actor事实待GM核对');
    expect(result?.zh).not.toContain('穿着重甲时伤害减半');
    expect(result?.uncovered.join('\n')).toContain('fact-conflict');
    expect(result?.executionMode).toBe('gm-assisted');
  });

  test('unknown English qualifiers and unregistered statuses stay outside fixed Chinese', () => {
    const action: ActionData = { name: 'Untyped', type: 'save',
      save: { dc: 14, ability: 'con', outcome: 'none', condition: 'unless below water' },
      sourceDamageParts: [{ formula: '2d6', type: 'mystic', relationship: 'conditional', condition: 'on third moon' }],
    };
    const sourceAction: StructuredActionData = { name: 'Untyped', type: 'save',
      activation: { type: 'reaction', condition: 'after a failed strike' },
      embeddedEffects: [{ type: 'alien-state', describe: 'until released', duration: 'until released' }],
    };
    const result = summarizeStructuredRule({ logicalPath: 'action/3', action, sourceAction });
    expect(result?.zh).not.toMatch(/unless below water|on third moon|after a failed strike|alien-state|until released|mystic/u);
    expect(result?.uncovered.join('\n')).toContain('unless below water');
    expect(result?.uncovered.join('\n')).toContain('on third moon');
    expect(result?.uncovered.join('\n')).toContain('alien-state');
    expect(result?.executionMode).toBe('gm-assisted');
  });
});
