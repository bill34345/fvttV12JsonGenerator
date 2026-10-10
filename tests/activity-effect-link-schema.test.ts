import { describe, expect, test } from 'bun:test';
import yaml from 'js-yaml';
import { buildForgeActorRequest, convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { assertActorSemantics } from '../foundry-modules/fvtt-json-forge/src/runtime';

async function generate(version: '12' | '14') {
  const source = `---\n${yaml.dump({
    名称: 'Effect link schema fixture', 类型: 'npc', 护甲等级: 12, 生命值: 40,
    能力: { 力量: 14, 敏捷: 12, 体质: 10, 智力: 10, 感知: 10, 魅力: 10 },
    感官: { 黑暗视觉: 0, 盲视: 0, 震颤感知: 0, 真视: 0, 被动察觉: 10 },
    动作: [
      { 名称: 'Source Claw', 类型: 'attack', 攻击类型: 'mwak', 命中: 4, 范围: '触及 5 尺', 伤害: [{ 公式: '1d6+2', 类型: 'slashing' }], 描述: 'Hit: the target is Grappled.', 内嵌效果: [{ 类型: 'Grappled', 描述: 'Source grapple.' }] },
      { 名称: 'Source Flash', 类型: 'save', DC: 14, 属性: '体质', 描述: 'On a failed save, the creature is Blinded.', 内嵌效果: [{ 类型: 'Blinded', 描述: 'Source blind.' }] },
      { 名称: 'Source Utility', 类型: 'utility', 描述: 'GM may apply this source marker.', 内嵌效果: [{ 类型: 'Frightened', 描述: 'Source marker.' }] },
    ],
  }, { lineWidth: -1 })}---\n`;
  const response = await convertFinalActorSource(buildForgeActorRequest({ content: source, displayName: 'Effect link schema fixture', requestId: `effect-link-${version}`, fvttVersion: version === '14' ? '14.364' : '12.331', systemVersion: version === '14' ? '5.3.3' : '4.3.9' }));
  expect('result' in response).toBe(true);
  if (!('result' in response) || response.result.status !== 'accepted') throw new Error(`Formal effect link generation failed: ${JSON.stringify(response)}`);
  expect(response.result.status).toBe('accepted');
  return response.result.artifact as Record<string, any>;
}

describe('native activity-specific applied effect schema', () => {
  for (const version of ['12', '14'] as const) test(`keeps Save onSave and omits unsupported Attack/Utility members on v${version}`, async () => {
    const actor = await generate(version);
    for (const [name, type] of [['Source Claw', 'attack'], ['Source Flash', 'save'], ['Source Utility', 'utility']] as const) {
      const item = actor.items.find((entry: any) => entry.name === name);
      const activities = Object.values(item.system.activities) as any[];
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe(type);
      expect(item.effects).toHaveLength(1);
      expect(activities[0].effects).toEqual([{ _id: item.effects[0]._id, ...(type === 'save' ? { onSave: false } : {}) }]);
    }
  });
  test('accepts native field cleaning while still rejecting lost links and changed Save success semantics', async () => {
    const artifact = await generate('14');
    const native = structuredClone(artifact);
    for (const item of native.items) for (const activity of Object.values(item.system.activities) as any[]) {
      if (activity.type !== 'save') activity.effects = activity.effects.map(({ _id }: any) => ({ _id }));
    }
    expect(() => assertActorSemantics(artifact, native)).not.toThrow();
    const save = native.items.find((item: any) => item.name === 'Source Flash');
    (Object.values(save.system.activities)[0] as any).effects[0].onSave = true;
    expect(() => assertActorSemantics(artifact, native)).toThrow('onSave');
    const missingLink = structuredClone(artifact);
    (Object.values(missingLink.items.find((item: any) => item.name === 'Source Claw').system.activities)[0] as any).effects = [];
    expect(() => assertActorSemantics(artifact, missingLink)).toThrow('effects');
  });
});
