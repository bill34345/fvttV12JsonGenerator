import type { ForgeItemActivityDocumentSummary, ForgeItemDocumentSummary, ForgeItemSpellVariant, JsonObject, JsonValue } from '@fvtt-json-generator/forge-gateway-protocol';

const recoveryLabels: Record<string, string> = {
  lr: '长休后', sr: '短休后', dawn: '黎明时', dusk: '黄昏时', day: '每日',
};
const activationLabels: Record<string, string> = {
  action: '动作', bonus: '附赠动作', reaction: '反应', minute: '分钟', hour: '小时',
};
const itemTypeLabels: Record<string, string> = {
  ring: '戒指', wand: '魔杖', rod: '权杖', staff: '法杖', wondrous: '奇物', shield: '盾牌',
  potion: '药水', scroll: '卷轴', container: '容器', equipment: '装备', weapon: '武器',
};
const rarityLabels: Record<string, string> = {
  common: '普通', uncommon: '非普通', rare: '珍稀', veryRare: '极珍稀', legendary: '传说', artifact: '神器',
};
const abilityLabels: Record<string, string> = {
  str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力',
};
const damageLabels: Record<string, string> = {
  acid: '强酸', bludgeoning: '钝击', cold: '寒冷', fire: '火焰', force: '力场',
  lightning: '闪电', necrotic: '黯蚀', piercing: '穿刺', poison: '毒素',
  psychic: '心灵', radiant: '光耀', slashing: '挥砍', thunder: '雷鸣',
};
const movementLabels: Record<string, string> = {
  walk: '步行', fly: '飞行', swim: '游泳', climb: '攀爬', burrow: '掘穴',
};

export function renderForgeItemPreview(item: ForgeItemDocumentSummary, variants: readonly ForgeItemSpellVariant[] = []): string {
  const description = String(item.description.value ?? '')
    .replace(/<\/(?:p|li|h[1-6])>|<br\s*\/?>/giu, '\n').replace(/<[^>]*>/gu, '').trim();
  const type = String(item.itemType.value || item.type);
  const rarity = String(item.rarity ?? '');
  const identity = [itemTypeLabels[type] ?? type, rarityLabels[rarity] ?? rarity, item.attunement === 'required' ? '需要同调' : ''].filter(Boolean).join(' · ');
  const consumesBottle = item.uses.autoDestroy === true && type === 'potion';
  const consumesScroll = item.uses.autoDestroy === true && type === 'scroll' && item.spellLevel !== undefined;
  const timedSpeed = item.timedSpeed?.units === 'seconds';
  const sharedUses = consumesBottle || consumesScroll || timedSpeed || item.summonCooldown ? '' : poolSummary(item.uses);
  const summons = item.activities.filter(activity => activity.type === 'summon');
  const randomSummon = item.randomSummon;
  const casts = item.activities.filter(activity => activity.type === 'cast');
  const storage = item.spellStorage;
  const occupiedLevels = storage ? casts.reduce((used, { spell, uses }) =>
    used + (typeof spell?.level === 'number' && uses?.spent === 0 ? spell.level : 0), 0) : 0;
  const activities = item.activities.filter(activity => ['heal', 'attack', 'save', 'utility'].includes(activity.type));
  const enchants = timedSpeed ? [] : item.activities.filter(activity => activity.type === 'enchant');
  const passives = item.effects.filter(effect => effect.transfer && !effect.enchantment && !item.riderEffectIds?.includes(effect.id)).flatMap(effect => effect.changes.flatMap(change => {
    const key = change.key;
    const value = String(change.value);
    const bonus = Number(value) > 0 ? `+${value}` : value;
    if (key === 'system.attributes.ac.bonus') return [`护甲等级 ${bonus}`];
    if (key === 'system.rolls.ability.save.bonus' || key === 'system.bonuses.abilities.save') return [`全部豁免 ${bonus}`];
    if (key === 'system.traits.dr.value') return [`${damageLabels[value] ?? value}伤害抗性`];
    const movement = /^system\.attributes\.movement\.(\w+)$/u.exec(key)?.[1];
    return movement && movementLabels[movement] ? [`${movementLabels[movement]}速度 ${bonus} 尺`] : [];
  }));
  const weapon = item.magicalBonus ? `攻击与伤害掷骰 +${item.magicalBonus}` : '';
  const capacity = item.capacity;
  const weightLimit = asRecord(capacity?.weight);
  const volumeLimit = asRecord(capacity?.volume);
  const limits = [
    capacity?.count ? `${capacity.count} 件` : '',
    weightLimit?.value ? `${weightLimit.value} ${weightLimit.units === 'kg' ? '千克' : '磅'}` : '',
    volumeLimit?.value ? `${volumeLimit.value} ${volumeLimit.units === 'liter' ? '升' : '立方尺'}` : '',
    item.properties.includes('weightlessContents') ? '内容物不计重量' : '',
  ].filter(Boolean);
  return `<article class="forge-document-sheet">${renderForgeCardHeading(item.name, identity)}<div class="forge-document-body"><dl>
    ${item.stage ? `<dt>装备阶段</dt><dd>${escapeHtml(String(item.stage.name))} · 由 GM 选择并替换原阶段卡</dd>` : ''}
    ${sharedUses ? `<dt>物品共用次数</dt><dd>${escapeHtml(sharedUses)}</dd>` : ''}
    ${item.lastChargeCheck ? `<dt>最后一发充能</dt><dd>用掉后在物品说明中掷 ${escapeHtml(String(item.lastChargeCheck.formula))}，掷出 ${escapeHtml(String(item.lastChargeCheck.destroyOn))} 时由 GM 销毁。</dd>` : ''}
    ${timedSpeed ? `<dt>累计用时</dt><dd>${escapeHtml(String(item.uses.max))} 秒总额度 · GM 记录实用秒数 · 长休全恢复</dd><dt>速度效果</dt><dd>附赠动作启用速度翻倍 · 再次触发结束效果</dd>` : ''}
    ${item.summonCooldown ? `<dt>召唤</dt><dd>${summons.map(activity => {
      const names = activity.summonProfiles?.map(profile => String(profile.name)).join('、') ?? '';
      return escapeHtml(`${names} · 魔法动作 · ${activity.range?.value} 尺内空地 · 最长 ${activity.duration?.value} 小时`);
    }).join('；')}<br>消耗 1 次，变回塑像 ${escapeHtml(String(item.summonCooldown.days))} 天后由 GM 恢复</dd>` : ''}
    ${randomSummon && summons[0] ? `<dt>按表召唤</dt><dd>${escapeHtml(
      `先掷 ${randomSummon.formula}，再选对应编号的生物 · 魔法动作 · ${summons[0].range?.value} 尺 · ${summons[0].duration?.special}`,
    )}<br>${escapeHtml(summons[0].summonProfiles?.map(profile => String(profile.name)).join('、') ?? '')}</dd>` : ''}
    ${consumesBottle ? '<dt>用量</dt><dd>每次使用消耗 1 瓶</dd>' : ''}
    ${consumesScroll ? `<dt>法术卷轴</dt><dd>${escapeHtml(item.spellLevel?.value === 0 ? '戏法' : `${item.spellLevel?.value} 环`)} · 一次使用，耗尽后删除${casts.length ? '' : ' · 未绑定法术'}</dd>` : ''}
    ${passives.length ? `<dt>装备效果</dt><dd>${escapeHtml(passives.join(' · '))}</dd>` : ''}
    ${weapon ? `<dt>武器加值</dt><dd>${escapeHtml(weapon)}</dd>` : ''}
    ${limits.length ? `<dt>容器容量</dt><dd>${escapeHtml(limits.join(' · '))}</dd>` : ''}
    ${storage ? `<dt>储法容量</dt><dd>占用 ${occupiedLevels} / ${escapeHtml(String(storage.capacity))} 环阶${occupiedLevels === 0 ? ' · 未登记储存法术' : ''}。初次发现的储存环阶由 GM 按 ${escapeHtml(String(storage.foundLevels))} 确定。</dd>` : ''}
    ${enchants.length ? renderEnchantments(enchants, item.effects) : ''}
    ${casts.length ? `<dt>${storage ? '已登记的储存法术' : '施法活动'}</dt><dd><ul>${casts.map(renderCast).join('')}</ul></dd>` : ''}
    ${variants.length ? `<dt>随物品创建的专用法术</dt><dd><ul>${variants.map(spell => {
      const level = spell.level === 0 ? '戏法' : `${spell.level} 环`;
      const edition = spell.rules === '2014' ? '2014 旧版母本' : spell.rules ? `${spell.rules} 母本` : '母本未标明版本';
      return `<li>${escapeHtml(`${spell.name} · ${damageLabels[spell.damageType] ?? spell.damageType}伤害 · ${level} · ${edition}`)}</li>`;
    }).join('')}</ul></dd>` : ''}
    </dl>${activities.length ? `<section class="forge-item-activities"><h3>物品活动</h3><ul>${activities.map(renderNativeActivity).join('')}</ul></section>` : ''}
    ${description ? `<p class="forge-document-rules forge-item-description">${escapeHtml(description)}</p>` : ''}</div></article>`;
}

export function renderForgeCardHeading(name: string, identity: string): string {
  const bilingual = /^(\p{Script=Han}.*?) ([a-z].*)$/iu.exec(name);
  return `<header class="forge-document-heading"><p class="forge-document-type">${escapeHtml(identity)}</p>
    <h2>${bilingual ? `${escapeHtml(bilingual[1]!)} <span lang="en">${escapeHtml(bilingual[2]!)}</span>` : escapeHtml(name)}</h2></header>`;
}

function renderEnchantments(activities: ForgeItemActivityDocumentSummary[], effects: ForgeItemDocumentSummary['effects']): string {
  const choices = activities.flatMap(activity => activity.effectIds.flatMap(id => {
    const effect = effects.find(candidate => candidate.id === id);
    if (!effect) return [];
    const rarity = effect.changes.find(change => change.key === 'system.rarities')?.value;
    return [`<li>${escapeHtml(effect.name)}${rarity ? ` · ${escapeHtml(rarityLabels[rarity] ?? rarity)}` : ''}</li>`];
  }));
  const applicable = activities[0]?.restrictions?.type === 'weapon' ? '未附魔的简易或军用武器' : '未附魔的轻型、中型或重型护甲';
  return `<dt>附魔变体</dt><dd>${applicable} · 在 Foundry 应用时选择一项<ul>${choices.join('')}</ul></dd>`;
}

function renderNativeActivity(activity: ForgeItemActivityDocumentSummary): string {
  const { activation, attack, save, damage, healing, range, target, duration, consumption } = activity;
  const timing = String(activation?.type ?? '');
  const rows: Array<string> = [activationLabels[timing] ?? timing];
  const affects = asRecord(target?.affects);
  const template = asRecord(target?.template);
  if (template?.type && template.size) {
    rows.push(`${template.size} 尺${template.type === 'sphere' ? '球形' : '半径'}`);
  } else if (range?.value && range.units === 'ft') {
    rows.push(`${range.value} 尺${affects?.type === 'creature' ? '内的生物' : ''}`);
  } else if (range?.units === 'self' || affects?.type === 'self') {
    rows.push('自身');
  }
  if (healing) rows.push(`治疗 ${rollFormula(healing)}`);
  if (attack?.flat === true && attack.bonus) rows.push(`固定命中 ${Number(attack.bonus) > 0 ? '+' : ''}${attack.bonus}`);
  if (attack?.flat === false && typeof attack.ability === 'string' && abilityLabels[attack.ability]) {
    rows.push(`${abilityLabels[attack.ability]}与熟练加值`);
  }
  const dc = asRecord(save?.dc);
  if (dc?.calculation === '' && dc.formula && Array.isArray(save?.ability)) {
    const abilities = save.ability.map(value => abilityLabels[String(value)] ?? String(value));
    rows.push(`DC ${dc.formula} ${abilities.join('/')}豁免`);
  }
  if (Array.isArray(damage?.parts)) {
    for (const value of damage.parts) {
      const part = asRecord(value);
      if (!part) continue;
      const types = Array.isArray(part.types) ? part.types.map(type => damageLabels[String(type)] ?? String(type)) : [];
      rows.push(`${rollFormula(part)} ${types.join('/')}伤害`);
    }
  }
  if (damage?.onSave === 'half') rows.push('豁免成功时伤害减半');
  if (duration?.concentration === true) rows.push('需要专注');
  const unit = String(duration?.units ?? '');
  const units: Record<string, string> = { round: '轮', minute: '分钟', hour: '小时' };
  if (duration?.value && units[unit]) rows.push(`${duration.value} ${units[unit]}`);
  if (typeof activation?.condition === 'string') rows.push(activation.condition);
  const cost = Array.isArray(consumption?.targets) ? asRecord(consumption.targets[0]) : undefined;
  if (cost?.type === 'itemUses' && activity.type !== 'heal') rows.push(`消耗物品次数 ${cost.value} 次`);
  return `<li><strong>${escapeHtml(activity.name)}</strong><span>${escapeHtml(rows.filter(Boolean).join(' · '))}</span></li>`;
}

function rollFormula(part: JsonObject): string {
  const custom = asRecord(part.custom);
  if (custom?.enabled && typeof custom.formula === 'string') return humanFormula(custom.formula);
  const dice = part.number && part.denomination ? `${part.number}d${part.denomination}` : '';
  return humanFormula([dice, part.bonus].filter(Boolean).join(' + '));
}

export function humanFormula(formula: string): string {
  const refs: Record<string, string> = {
    mod: '相关属性调整值', prof: '熟练加值', 'item.uses.value': '物品剩余次数', 'activity.uses.value': '此能力剩余次数',
  };
  return formula.replace(/@([a-z][\w.]*)/giu, (_match, ref: string) => {
    const ability = /^abilities\.(\w+)\.(mod|value)$/u.exec(ref);
    return ability && abilityLabels[ability[1]!] ? `${abilityLabels[ability[1]!]}${ability[2] === 'mod' ? '调整值' : '属性值'}` : refs[ref] ?? '对应数值';
  }).replace(/\s*([+−-])\s*/gu, ' $1 ').trim();
}

function renderCast(activity: ForgeItemActivityDocumentSummary): string {
  const { activation, consumption, spell } = activity;
  const activationType = String(activation?.type ?? '');
  const activationLabel = activationLabels[activationType] ?? activationType;
  const cost = Array.isArray(consumption?.targets) ? asRecord(consumption.targets[0]) : undefined;
  const pool = cost?.type === 'activityUses' ? '本活动' : cost?.type === 'itemUses' ? '物品共用' : '';
  const ownUses = cost?.type === 'activityUses' ? poolSummary(activity.uses) : '';
  const scaling = asRecord(consumption?.scaling);
  const dc = asRecord(spell?.challenge);
  const level = typeof spell?.level === 'number' ? spell.level : undefined;
  const limit = String(scaling?.max ?? '');
  const boundedChoices = /^min\(@(?:item|activity)\.uses\.value,\s*(\d+)\)$/u.exec(limit);
  const highest = level !== undefined && boundedChoices ? level + Number(boundedChoices[1]) - 1 : undefined;
  const rows = [
    activationLabel ? `${activation?.value ?? 1} ${activationLabel}` : '',
    typeof activation?.condition === 'string' ? activation.condition : '',
    level === 0 ? '戏法' : level !== undefined ? `${level} 环` : '',
    dc?.override === true && dc.save ? `固定豁免 DC ${dc.save}` : '',
    dc?.override === true && dc.attack ? `固定法术攻击 ${Number(dc.attack) < 0 ? '' : '+'}${dc.attack}` : '',
    typeof spell?.ability === 'string' && abilityLabels[spell.ability] ? `施法属性 ${abilityLabels[spell.ability]}` : '',
    pool && cost ? `消耗${pool}次数 ${cost.value} 次` : !cost && consumption?.spellSlot === false ? '无需次数或法术位' : '',
    ownUses,
    scaling?.allowed === true && asRecord(cost?.scaling)?.mode === 'amount'
      ? `每升 1 环多消耗 1 次${highest !== undefined ? `，受剩余次数限制，最高 ${highest} 环` : limit ? `，最多额外消耗 ${humanFormula(limit)} 次` : ''}`
      : '',
    consumption?.spellSlot === false && cost ? '不消耗法术位' : '',
  ].filter(Boolean);
  return `<li><strong>${escapeHtml(activity.name)}</strong>${rows.length ? ` · ${escapeHtml(rows.join(' · '))}` : ''}</li>`;
}

function poolSummary(uses?: JsonObject): string {
  if (!uses?.max) return '';
  const max = String(uses.max);
  const capacity = /^\d+$/u.test(max) && typeof uses.spent === 'number'
    ? `剩余 ${Math.max(0, Number(max) - uses.spent)} / ${max} 次`
    : `上限 ${humanFormula(max)} 次`;
  const entries = Array.isArray(uses.recovery) ? uses.recovery.map(asRecord) : [];
  const recovery = entries.flatMap(entry => {
    if (!entry || typeof entry.period !== 'string') return [];
    const timing = recoveryLabels[entry.period] ?? entry.period;
    if (entry.type === 'recoverAll') return [`${timing}全部恢复`];
    if (entry.type === 'formula' && entry.formula) return [`${timing}恢复 ${humanFormula(String(entry.formula))} 次`];
    return [];
  });
  return [capacity, ...(entries.length ? recovery : ['无自动恢复'])].join('，');
}

function asRecord(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}
