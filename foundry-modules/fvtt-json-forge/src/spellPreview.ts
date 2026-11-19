import type { SpellArtifact } from '@fvtt-json-generator/forge-browser-runtime/spell';
import { escapeHtml, renderForgeCardHeading } from './itemPreview';

const schools = { abj: '防护', con: '咒法', div: '预言', enc: '惑控', evo: '塑能', ill: '幻术', nec: '死灵', trs: '变化' };
const castingTimes = { action: '动作', bonus: '附赠动作', reaction: '反应', minute: '分钟', hour: '小时' };
const durations = { inst: '瞬间', round: '轮', minute: '分钟', hour: '小时', day: '天', disp: '直到被解除', dstr: '直到被摧毁', perm: '永久', spec: '见法术说明' };
const ranges = { self: '自身', touch: '触碰', ft: '尺', mi: '英里', spec: '见法术说明', any: '不限距离' };
const targets = { self: '自身', creature: '生物', willing: '自愿生物', ally: '盟友', enemy: '敌人', object: '物件', creatureOrObject: '生物或物件', space: '空间', any: '任意目标' };
const areas = { cone: '锥形', cube: '立方体', cylinder: '圆柱', line: '线形', radius: '半径', sphere: '球形' };
const abilities = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' };
const damageTypes = { acid: '强酸', bludgeoning: '钝击', cold: '寒冷', fire: '火焰', force: '力场', lightning: '闪电', necrotic: '黯蚀', piercing: '穿刺', poison: '毒素', psychic: '心灵', radiant: '光耀', slashing: '挥砍', thunder: '雷鸣' };
const components = { vocal: '言语', somatic: '姿势', material: '材料' };
const saves = { half: '成功时伤害减半', none: '成功时不受伤害', full: '成功时仍承受全部伤害' };

type SpellRoll = { dice: { count: number; faces: number }; bonus?: number | '@mod'; scaling?: number };

export function renderForgeSpellPreview(artifact: SpellArtifact): string {
  const spell = artifact.source;
  const { activation, duration, target, range, activity, materials } = spell;
  const area = target.template;
  const isAction = activation.type === 'action' || activation.type === 'bonus';
  const castingTime = [activation.value ?? (activation.type === 'reaction' ? undefined : 1), isAction ? `个${castingTimes[activation.type]}` : castingTimes[activation.type], activation.condition].filter(Boolean).join(' ');
  const durationText = [spell.components.includes('concentration') ? '专注' : '', duration.value, durations[duration.units]].filter(Boolean).join(' ');
  const componentText = Object.entries(components).filter(([key]) => spell.components.some(value => value === key)).map(([, value]) => value).join('、');
  const materialsText = materials ? [materials.value, materials.cost ? `${materials.cost} 金币` : '', materials.consumed ? '施法时消耗' : ''].filter(Boolean).join('，') : '';
  const stats = [
    ['施法时间', castingTime],
    ['射程', [range.value, ranges[range.units]].filter(Boolean).join(' ')],
    ['持续时间', durationText],
    ['成分', [componentText, materialsText].filter(Boolean).join(' · ')],
    ['目标', target.special || (target.count ? `${target.count} 个${targets[target.type]}` : targets[target.type])],
    ...(area ? [['范围', [`${area.size} 尺${areas[area.type]}`, area.width ? `宽 ${area.width} 尺` : '', area.height ? `高 ${area.height} 尺` : ''].filter(Boolean).join(' · ')]] : []),
  ];
  const mechanics = [];
  if (activity.type === 'save') {
    mechanics.push(`${abilities[activity.save]}豁免`);
    if (activity.damage.length) mechanics.push(saves[activity.onSave]);
  }
  if (activity.type === 'attack') mechanics.push(activity.attack === 'melee' ? '近战法术攻击' : '远程法术攻击');
  const rolls = 'damage' in activity ? activity.damage.map(damage => [rollText(damage), `${damageTypes[damage.type]}伤害`])
    : activity.type === 'heal' ? [[rollText(activity.healing), activity.healing.type === 'temphp' ? '临时生命值' : '治疗']] : [];

  const identity = `${spell.level === 0 ? '戏法' : `${spell.level} 环`} · ${schools[spell.school]}${spell.components.includes('ritual') ? ' · 仪式' : ''}`;
  const rules = artifact.item.system.description.value;
  const gmStart = spell.gm ? rules.lastIndexOf('<h3>GM 裁定</h3>') : -1;
  return `<article class="forge-document-sheet">
    ${renderForgeCardHeading(spell.name, identity)}
    <div class="forge-document-body">
      <dl class="forge-spell-facts">${stats.filter(([, value]) => value).map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value!)}</dd></div>`).join('')}</dl>
      ${mechanics.length || rolls.length ? `<ul class="forge-spell-mechanics" aria-label="法术效果">
        ${rolls.map(([formula, label]) => `<li><strong>${escapeHtml(formula!)}</strong> ${escapeHtml(label!)}</li>`).join('')}
        ${mechanics.map(value => `<li>${escapeHtml(value)}</li>`).join('')}
      </ul>` : ''}
      <div class="forge-document-rules">${gmStart === -1 ? rules : rules.slice(0, gmStart)}</div>
      ${gmStart === -1 ? '' : `<aside class="forge-spell-gm">${rules.slice(gmStart)}</aside>`}
    </div>
  </article>`;
}

function rollText({ dice, bonus }: SpellRoll): string {
  const base = `${dice.count}d${dice.faces}`;
  if (bonus === '@mod') return `${base} + 施法属性调整值`;
  return bonus ? `${base} ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)}` : base;
}
