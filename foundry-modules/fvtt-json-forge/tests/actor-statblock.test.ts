import { describe, expect, test } from 'bun:test';
import {
  buildForgeActorRequest,
  convertFinalActorSource,
} from '@fvtt-json-generator/forge-browser-runtime';
import { renderActorStatblock, renderBlueprintDraftStatblock } from '../src/actorStatblock';
import { createBlueprintComponent, createEmptyBlueprintDraft } from '../src/creatureBlueprintEditor';

const BASIC_ACTOR_SOURCE = `---
名称: 试验兽 (Test Beast)
类型: npc
体型: 中型
生物类型: 野兽
能力:
  力量: 16
  敏捷: 12
  体质: 14
  智力: 6
  感知: 12
  魅力: 8
护甲等级: 14
生命值: 22 (4d8+4)
速度: 步行 30 尺
挑战等级: 1
---

### 动作

- **撕咬 (Bite)**：近战攻击检定：+5，触及 5 尺。命中：7 (1d8+3) 穿刺伤害。
- **凝视 (Gaze)**：感知豁免检定：DC 12，射程 30 尺。失败：目标陷入恐慌状态。
`;

describe('Forge Actor statblock renderer', () => {
  test('renders the actual generated native artifact with stats, attack, save, and base damage', async () => {
    const artifact = await generateBasicActor();
    const html = renderActorStatblock(artifact);

    expect(html).toContain('class="forge-statblock"');
    expect(html).toContain('试验兽 (Test Beast)'); // Authored title, not an appended alias.
    expect(html).toContain('中型 · beast');
    expect(html).toContain('HP 生命值</dt><dd>22（4d8+4）');
    expect(html).toContain('AC 护甲等级');
    expect(html).toContain('Initiative 先攻</dt><dd>未知（未提供）');
    expect(html).toContain('CR 挑战等级');
    expect(html).toContain('1（XP 200；PB +2）');
    expect(html).toContain('步行 30 ft');
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
      expect(html).toContain(ability);
    }

    expect(html).toContain('class="forge-statblock-ability-grid"');
    expect((html.match(/class="forge-statblock-ability"/gu) ?? []).length).toBe(6);
    expect(html).toContain('<span>Save</span><strong>未知（未提供）');
    expect(html).not.toContain('<span>Save</span><strong>+3');
    expect(html).toContain('data-section="actions"');
    expect(html).toContain('Melee Attack Roll 近战攻击检定');
    expect(html).not.toContain('(mwak)');
    expect(html).toContain('最终命中：未知（由 Foundry 运行时计算');
    expect(html).toContain('Saving Throw 豁免');
    expect(html).toContain('DC 计算配置');
    expect(html).toContain('最终 DC：未知（由 Foundry 运行时计算');
    expect(html).toContain('基础伤害规则：包含基础伤害');
    expect(html).toContain('1d8 piercing');
    expect(html).toContain('总伤害未计算');
    expect(html).toContain('效果提示：此项目包含 1 个 Active Effect');
    const items=(artifact as Record<string,any>).items;
    const attack=items.flatMap((item:any)=>Object.values<any>(item.system.activities)).find((activity:any)=>activity.type==='attack');
    const save=items.flatMap((item:any)=>Object.values<any>(item.system.activities)).find((activity:any)=>activity.type==='save');
    expect(attack.attack).toMatchObject({type:{value:'melee'},ability:'str',flat:false});
    expect(save.save).toMatchObject({ability:['wis'],dc:{calculation:'con'}});
    expect(html).toContain('近战攻击检定：+5');expect(html).toContain('DC 12');
  });

  test('labels v14 melee, ranged and explicit spell classifications without deriving runtime totals',async()=>{
    const artifact=await generateBasicActor() as Record<string,any>;
    const activity=artifact.items.flatMap((item:any)=>Object.values<any>(item.system.activities)).find((entry:any)=>entry.type==='attack');
    for(const[value,classification,label]of[
      ['melee','weapon','Melee Attack Roll 近战攻击检定'],
      ['ranged','weapon','Ranged Attack Roll 远程攻击检定'],
      ['melee','spell','Melee Spell Attack Roll 近战法术攻击检定'],
      ['ranged','spell','Ranged Spell Attack Roll 远程法术攻击检定'],
    ]){
      activity.attack.type={value,classification};const before=structuredClone(artifact),html=renderActorStatblock(artifact);
      expect(html).toContain(label!);expect(html).toContain('最终命中：未知（由 Foundry 运行时计算');
      expect(html).toContain('最终 DC：未知（由 Foundry 运行时计算');expect(artifact).toEqual(before);
    }
  });

  test('orders 2024 sections by activation and only shows explicitly provided totals', async () => {
    const artifact = await generateBasicActor();
    const actor = artifact as Record<string, any>;
    actor.system.abilities.str.save = { value: 5 };
    actor.system.attributes.init.total = 4;
    actor.system.attributes.init.score = 14;
    actor.system.details.alignment = 'Neutral';
    actor.items.push(...[
      ['Always On', 'passive'], ['Swift Step', 'bonus'], ['Parry', 'reaction'], ['Wing Beat', 'legendary'],
    ].map(([name, activation]) => ({ name, type: 'feat', system: { activities: { test: { type: 'utility', activation: { type: activation } } } } })));
    const html = renderActorStatblock(actor);

    expect(html).toContain('中型 · beast · Neutral');
    expect(html).toContain('Initiative 先攻</dt><dd>+4 (14)');
    expect(html).toContain('<span>Save</span><strong>+5');
    expect(html).toContain('<span>Save</span><strong>未知（未提供）');
    const order = ['data-section="traits"', 'data-section="actions"', 'data-section="bonus"', 'data-section="reactions"', 'data-section="legendary"'];
    expect(order.every((section) => html.includes(section))).toBe(true);
    expect(order.map((section) => html.indexOf(section))).toEqual([...order.map((section) => html.indexOf(section))].sort((a, b) => a - b));
  });

  test('renders a provisional draft from entered fields without invented save, initiative, XP, or PB', () => {
    const draft = createEmptyBlueprintDraft();
    draft.name = '草稿兽';
    draft.abilities.str = '16';
    draft.armorClass = '15';
    draft.hitPoints = '24';
    draft.challengeRating = '2';
    const attack = createBlueprintComponent('attack');
    attack.name = '爪击';
    attack.attackBonus = '+5';
    attack.damageFormula = '1d8+3';
    draft.components.push(attack);
    const html = renderBlueprintDraftStatblock(draft);

    expect(html).toContain('forge-statblock--draft');
    expect(html).toContain('尚未生成或验证 Actor');
    expect(html).toContain('<span>Mod</span><strong>+3');
    expect(html).toContain('<span>Save</span><strong>未知（未提供）');
    expect(html).toContain('Initiative 先攻</dt><dd>未知（未提供）');
    expect(html).toContain('输入命中加值 +5');
    expect(html).not.toContain('XP 200');
    expect(html).not.toContain('PB +2');
    expect(html).not.toContain('最终命中：+5');
  });

  test('keeps hostile draft fields inert and never treats partial initiative as a total', () => {
    const draft = createEmptyBlueprintDraft();
    draft.name = '<img src=x onerror=alert(1)> Guard';
    draft.type = '<script>alert(2)</script> beast';
    const attack = createBlueprintComponent('attack');
    attack.name = '<svg onload=alert(3)> Slash';
    attack.damageFormula = '1d6 <img src=x>';
    draft.components.push(attack);
    const draftHtml = renderBlueprintDraftStatblock(draft);
    expect(draftHtml).not.toMatch(/<\s*(?:script|img|svg)\b/iu);
    expect(draftHtml).toContain('Guard');
    expect(draftHtml).toContain('Slash');

    const actorHtml = renderActorStatblock({ system: { attributes: { init: { mod: 3, bonus: 2 } } } });
    expect(actorHtml).toContain('Initiative 先攻</dt><dd>未知（未提供）');
  });

  test('does not guess either legal CR 0 XP value', () => {
    const html = renderActorStatblock({ system: { details: { cr: 0, xp: { value: 0 } } } });
    expect(html).toContain('CR 挑战等级</dt><dd>0（PB +2）');
    expect(html).not.toContain('XP 0');
    expect(html).not.toContain('XP 10');
  });

  test('does not mistake a skill ability modifier for the complete skill bonus', () => {
    const rawHtml = renderActorStatblock({ system: { skills: { prc: { mod: 3, value: 1 } } } });
    expect(rawHtml).not.toContain('Skills 技能');
    expect(rawHtml).not.toContain('PRC +3');

    const preparedHtml = renderActorStatblock({ system: { skills: { prc: { mod: 3, total: 5 } } } });
    expect(preparedHtml).toContain('Skills 技能</dt><dd>PRC +5');
  });

  test('escapes hostile native names and renders descriptions as plain text', async () => {
    const artifact = await generateBasicActor();
    const actor = artifact as Record<string, unknown>;
    actor.name = '<img src=x onerror=alert(1)> & <script>alert(2)</script>';
    const items = actor.items as Array<Record<string, unknown>>;
    const item = items[0]!;
    item.name = '<svg onload=alert(3)> hostile item';
    const itemSystem = item.system as Record<string, unknown>;
    itemSystem.description = {
      value: '<p>Visible <strong>plain</strong> text</p><script>alert("pwned")</script><img src=x onerror=alert(4)>',
    };
    const activities = itemSystem.activities as Record<string, Record<string, unknown>>;
    const activity = Object.values(activities)[0]!;
    activity.description = { chatFlavor: '<b>Activity text</b><script>alert("pwned")</script>' };

    const html = renderActorStatblock(artifact);

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;svg onload=alert(3)&gt; hostile item');
    expect(html).toContain('Visible plain text');
    expect(html).toContain('Activity text');
    expect(html).not.toMatch(/<\s*(?:script|img|svg)\b/iu);
    expect(html).not.toContain('pwned');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<img');
  });

  test('returns a bounded readable block for non-record input', () => {
    const html = renderActorStatblock(null);

    expect(html).toContain('class="forge-statblock"');
    expect(html).toContain('未知（未提供）');
    expect(html).not.toContain('[object Object]');
  });
});

async function generateBasicActor(): Promise<Record<string, unknown>> {
  const response = await convertFinalActorSource(buildForgeActorRequest({
    content: BASIC_ACTOR_SOURCE,
    displayName: 'Test Beast',
    requestId: `actor-statblock-${Date.now()}`,
    fvttVersion: '14.364',
    systemVersion: '5.3.3',
  }));
  if (!('result' in response) || response.result.status !== 'accepted') {
    throw new Error(`Expected an accepted generated Actor: ${JSON.stringify(response)}`);
  }
  return response.result.artifact as unknown as Record<string, unknown>;
}
