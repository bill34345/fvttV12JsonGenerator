import { describe, expect, test } from 'bun:test';
import {
  buildForgeActorRequest,
  convertFinalActorSource,
} from '@fvtt-json-generator/forge-browser-runtime';
import { renderActorStatblock, renderBlueprintDraftStatblock } from '../src/actorStatblock';
import { createBlueprintComponent, createEmptyBlueprintDraft } from '../src/creatureBlueprintEditor';
import {NATIVE_RECEIVER_CAPTURE} from '../../../tests/helpers/forge-native-receiver';

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
  test.each(NATIVE_RECEIVER_CAPTURE.cases.filter(entry=>entry.kind==='Actor'))('renders the actual captured nullable native AC source for $key',captured=>{
    const before=structuredClone(captured.output),html=renderActorStatblock(captured.output);
    expect(html).toContain(`护甲等级</dt><dd>${captured.key==='sentinel'?17:5}`);
    expect(html).toContain('生命值</dt><dd>100');expect(html).not.toContain('护甲等级</dt><dd>0');
    expect(captured.output).toEqual(before);
  });

  test('native606: renders native AC override, formulas and nested literal or dynamic speeds',()=>{
    const artifact={name:'Native display fixture',type:'npc',system:{attributes:{ac:{override:17},movement:{speeds:{walk:'30',fly:'@abilities.dex.value'},units:'ft'}}}};
    const html=renderActorStatblock(artifact);
    expect(html).toContain('护甲等级</dt><dd>17');
    expect(html).toContain('步行 30 尺');expect(html).toContain('飞行 敏捷属性值 尺');
    const formula=renderActorStatblock({...artifact,system:{...artifact.system,attributes:{...artifact.system.attributes,ac:{formulas:[{formula:'10 + @abilities.dex.mod'}]}}}});
    expect(formula).toContain('10 + 敏捷调整值');
  });
  test('renders the actual generated native artifact with stats, attack, save, and base damage', async () => {
    const artifact = await generateBasicActor();
    const html = renderActorStatblock(artifact);

    expect(html).toContain('class="forge-statblock"');
    expect(html).toContain('试验兽 (Test Beast)'); // Preserve the authored Actor title.
    expect(html).toContain('中型 · 野兽');
    expect(html).toContain('生命值</dt><dd>22（4d8+4）');
    expect(html).toContain('护甲等级');
    expect(html).toContain('先攻</dt><dd>未知（未提供）');
    expect(html).toContain('挑战等级');
    expect(html).toContain('1（经验值 200；熟练加值 +2）');
    expect(html).toContain('步行 30 尺');
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
      expect(html).toContain(ability);
    }

    expect(html.match(/class="forge-statblock-ability-table"/gu)).toHaveLength(2);
    expect(html.match(/<th scope="row">/gu)).toHaveLength(6);
    expect(html.match(/title="创建后计算">—<\/td>/gu)).toHaveLength(6);
    expect(html).toContain('data-section="actions"');
    expect(html).toContain('近战攻击检定');
    expect(html).not.toContain('(mwak)');
    expect(html).toContain('完整命中加值由角色卡计算');
    expect(html).toContain('豁免：');
    expect(html).toContain('DC 使用');
    expect(html).toContain('完整 DC 由角色卡计算');
    expect(html).toContain('1d8 穿刺');
    expect(html).toContain('已配置 1 项效果');
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
      ['melee','weapon','近战攻击检定'],
      ['ranged','weapon','远程攻击检定'],
      ['melee','spell','近战法术攻击检定'],
      ['ranged','spell','远程法术攻击检定'],
    ]){
      activity.attack.type={value,classification};const before=structuredClone(artifact),html=renderActorStatblock(artifact);
      expect(html).toContain(label!);expect(html).toContain('完整命中加值由角色卡计算');
      expect(html).toContain('完整 DC 由角色卡计算');expect(artifact).toEqual(before);
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
    actor.items.push({ name: 'Two-part action', type: 'feat', system: { activities: {
      primary: { name: 'Primary check', type: 'utility', activation: { type: 'action' } },
      followup: { name: 'Secondary save', type: 'save', activation: { type: 'special' }, save: { ability: ['con'], dc: { value: 14 } } },
    } } });
    const html = renderActorStatblock(actor);

    expect(html).toContain('中型 · 野兽 · 绝对中立');
    expect(html).toContain('先攻</dt><dd>+4 (14)');
    expect(html).toMatch(/<th scope="row">力量 <small>STR<\/small><\/th>\s*<td>[^<]+<\/td><td>[^<]+<\/td><td>\+5<\/td>/u);
    expect(html.match(/title="创建后计算">—<\/td>/gu)).toHaveLength(5);
    const order = ['data-section="traits"', 'data-section="actions"', 'data-section="bonus"', 'data-section="reactions"', 'data-section="legendary"'];
    expect(order.every((section) => html.includes(section))).toBe(true);
    expect(order.map((section) => html.indexOf(section))).toEqual([...order.map((section) => html.indexOf(section))].sort((a, b) => a - b));
    expect(html.match(/<h5>Two-part action<\/h5>/gu)).toHaveLength(1);
    expect(html).toContain('<h6>Primary check</h6>');
    expect(html).toContain('<h6>Secondary save</h6>');
    expect(html).not.toContain('失败造成 未知（未提供）');
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
    expect(html).toContain('编辑中的草稿');
    expect(html).toContain('<td>16</td><td>+3</td>');
    expect(html.match(/title="草稿未计算豁免">—<\/td>/gu)).toHaveLength(6);
    expect(html).not.toContain('先攻');
    expect(html).toContain('攻击检定 +5');
    expect(html).not.toContain('经验值 200');
    expect(html).not.toContain('熟练加值 +2');
    expect(html).not.toContain('最终命中：+5');
  });

  test('reads the authored NPC initiative from an unprepared native v14 artifact', () => {
    const preview = (bonus: string, dex = 9, prepared?: number) => renderActorStatblock({
      system: {
        abilities: { dex: { value: dex } },
        attributes: { init: { roll: { bonus }, ...(prepared === undefined ? {} : { total: prepared }) } },
      },
    });
    expect(preview('+8')).toContain('先攻</dt><dd>+7</dd>');
    expect(preview('-2', 14)).toContain('先攻</dt><dd>+0</dd>');
    expect(preview('+8', 9, 3)).toContain('先攻</dt><dd>+3</dd>');
    expect(preview('@prof')).toContain('先攻</dt><dd>未知（未提供）');
    expect(preview('')).toContain('先攻</dt><dd>未知（未提供）');
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
    expect(actorHtml).toContain('先攻</dt><dd>未知（未提供）');
  });

  test('does not guess either legal CR 0 经验值 value', () => {
    const html = renderActorStatblock({ system: { details: { cr: 0, xp: { value: 0 } } } });
    expect(html).toContain('挑战等级</dt><dd>0（熟练加值 +2）');
    expect(html).not.toContain('经验值 0');
    expect(html).not.toContain('经验值 10');
  });

  test('does not mistake a skill ability modifier for the complete skill bonus', () => {
    const rawHtml = renderActorStatblock({ system: { skills: { prc: { mod: 3, value: 1 } } } });
    expect(rawHtml).not.toContain('技能');
    expect(rawHtml).not.toContain('PRC +3');

    const preparedHtml = renderActorStatblock({ system: { skills: { prc: { mod: 3, total: 5 } } } });
    expect(preparedHtml).toContain('技能</dt><dd>PRC +5');
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
    fvttVersion: '14.370',
    systemVersion: '6.0.6',
  }));
  if (!('result' in response) || response.result.status !== 'accepted') {
    throw new Error(`Expected an accepted generated Actor: ${JSON.stringify(response)}`);
  }
  return response.result.artifact as unknown as Record<string, unknown>;
}
