import type { BlueprintDraft } from './creatureBlueprintEditor';

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

const ABILITY_LABELS: Record<string, string> = {
  str: '力量 (STR)',
  dex: '敏捷 (DEX)',
  con: '体质 (CON)',
  int: '智力 (INT)',
  wis: '感知 (WIS)',
  cha: '魅力 (CHA)',
};

const SIZE_LABELS: Record<string, string> = {
  tiny: '微型',
  sm: '小型',
  small: '小型',
  med: '中型',
  medium: '中型',
  lg: '大型',
  large: '大型',
  huge: '巨型',
  grg: '超巨型',
  gargantuan: '超巨型',
};

const ACTIVITY_LABELS: Record<string, string> = {
  attack: '攻击',
  cast: '施法',
  check: '检定',
  damage: '伤害',
  heal: '治疗',
  save: '豁免',
  utility: '效用',
};

const ACTIVATION_LABELS: Record<string, string> = {
  action: '动作',
  bonus: '附赠动作',
  reaction: '反应',
  legendary: '传奇动作',
  lair: '巢穴动作',
  free: '自由动作',
  special: '特殊',
};

const ATTACK_TYPE_LABELS: Record<string, string> = {
  mwak: 'Melee Attack Roll 近战攻击检定',
  rwak: 'Ranged Attack Roll 远程攻击检定',
  msak: 'Melee Spell Attack Roll 近战法术攻击检定',
  rsak: 'Ranged Spell Attack Roll 远程法术攻击检定',
};

const RECOVERY_PERIOD_LABELS: Record<string, string> = {
  day: '每日',
  longRest: '长休',
  recharge: '充能',
  round: '每回合',
  shortRest: '短休',
  turn: '每回合',
};

const RECOVERY_TYPE_LABELS: Record<string, string> = {
  recoverAll: '恢复全部',
  recover: '恢复',
};

const MAX_TEXT_LENGTH = 1_600;
const MAX_ITEMS = 100;
const MAX_ACTIVITIES = 100;
const UNKNOWN = '未知（未提供）';
// Official SRD 5.2.1, How to Use a Monster: CR -> XP; CR 0 has two legal
// values (0 or 10), so neither is inferred here.
const XP_BY_CR: Record<string, number> = {
  '1/8': 25, '1/4': 50, '1/2': 100,
  '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300,
  '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200,
  '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000,
  '20': 25000, '21': 33000, '22': 41000, '23': 50000,
  '24': 62000, '25': 75000, '26': 90000, '27': 105000,
  '28': 120000, '29': 135000, '30': 155000,
};

type StatblockSection = 'traits' | 'actions' | 'bonus' | 'reactions' | 'legendary' | 'other';
const SECTION_ORDER: readonly StatblockSection[] = ['traits', 'actions', 'bonus', 'reactions', 'legendary', 'other'];
const SECTION_LABELS: Record<StatblockSection, string> = {
  traits: '特质 Traits', actions: '动作 Actions', bonus: '附赠动作 Bonus Actions',
  reactions: '反应 Reactions', legendary: '传奇动作 Legendary Actions', other: '其他项目',
};

/**
 * Render the generated native Actor artifact as a bounded, readable HTML
 * statblock. This function deliberately accepts the artifact rather than a
 * Foundry document, so it is safe to use while a Forge preview is pending.
 */
export function renderActorStatblock(artifact: unknown): string {
  const actor = asRecord(artifact);
  const system = asRecord(actor.system);
  const details = asRecord(system.details);
  const attributes = asRecord(system.attributes);
  const traits = asRecord(system.traits);
  const name = scalarText(actor.name) ?? UNKNOWN;
  const creatureType = scalarText(asRecord(details.type).value)
    ?? scalarText(details.type)
    ?? scalarText(asRecord(details.type).custom);
  const size = formatSize(traits.size);

  const alignment = scalarText(details.alignment);
  const init = asRecord(attributes.init);
  // In locked dnd5e 5.3.3, init.mod is only the ability contribution. init.total/score
  // are prepared totals and are absent from an unprepared generated artifact.
  const initiativeTotal = explicitSignedTotal(init.total);
  const initiativeScore = formatScalar(init.score);
  const initiative = initiativeTotal
    ? `${initiativeTotal}${initiativeScore ? ` (${initiativeScore})` : ''}`
    : undefined;
  const summary = [
    `<div class="forge-statblock-highlight-row">${statEntry('AC 护甲等级', formatArmorClass(attributes.ac))}${statEntry('Initiative 先攻', initiative ?? UNKNOWN)}</div>`,
    statEntry('HP 生命值', formatHitPoints(attributes.hp)),
    statEntry('Speed 速度', formatMovement(attributes.movement)),
  ].join('');

  const actorEffects = effectCount(actor.effects);
  const items = Array.isArray(actor.items) ? actor.items : [];
  const sections = collectSections(items.slice(0, MAX_ITEMS));
  const omittedItems = items.length > MAX_ITEMS
    ? `<p class="forge-statblock-limit" role="note">已省略 ${escapeHtml(String(items.length - MAX_ITEMS))} 个项目。</p>`
    : '';

  return [
    `<article class="forge-statblock" aria-label="${escapeHtml(name)}">`,
    '<header class="forge-statblock-header">',
    `<h3 class="forge-statblock-name">${escapeHtml(name)}</h3>`,
    `<p class="forge-statblock-type">${escapeHtml([size, creatureType ?? scalarText(actor.type) ?? UNKNOWN, alignment].filter(Boolean).join(' · '))}</p>`,
    '</header>',
    '<dl class="forge-statblock-highlights" aria-label="战斗数据">',
    summary,
    '</dl>',
    renderAbilities(system.abilities),
    renderActorMeta(system),
    actorEffects > 0
      ? `<p class="forge-statblock-effects" role="note">效果提示：Actor 包含 ${escapeHtml(String(actorEffects))} 个 Active Effect；预览保留其存在，但不展开运行时结算。</p>`
      : '',
    '<div class="forge-statblock-sections">',
    SECTION_ORDER.map((section) => sections[section].length > 0
      ? `<section class="forge-statblock-section" data-section="${section}"><h4>${SECTION_LABELS[section]}</h4>${sections[section].join('')}</section>`
      : '').join('') || `<p class="forge-statblock-unknown">${escapeHtml(UNKNOWN)}：Actor 没有项目。</p>`,
    omittedItems,
    '</div>',
    '</article>',
  ].filter(Boolean).join('\n');
}

/** A form-state preview. It deliberately does not imply that generation or Foundry has verified it. */
export function renderBlueprintDraftStatblock(draft: BlueprintDraft): string {
  const name = plainText(draft.name) || '未命名生物';
  const details = [formatSize(draft.size), plainText(draft.type) || UNKNOWN, plainText(draft.alignment)].filter(Boolean).join(' · ');
  const components = draft.components.slice(0, MAX_ACTIVITIES).map((component) => {
    const title = plainText(component.name) || (component.kind === 'attack' ? '未命名攻击' : '未命名豁免');
    const range = plainText(component.range);
    const damage = [plainText(component.damageFormula), plainText(component.damageType)].filter(Boolean).join(' ');
    const detail = component.kind === 'attack'
      ? `${component.mode === 'ranged' ? '远程' : '近战'}攻击检定：${plainText(component.attackBonus) ? `输入命中加值 ${plainText(component.attackBonus)}` : '命中加值未知'}；${range ? `${component.mode === 'ranged' ? '射程' : '触及'} ${range} 尺；` : ''}命中：${damage || UNKNOWN}`
      : `${ABILITY_LABELS[component.ability] ?? (plainText(component.ability) || UNKNOWN)}豁免：${plainText(component.dc) ? `输入 DC ${plainText(component.dc)}` : 'DC 未知'}；${range ? `范围 ${range} 尺；` : ''}失败：${damage || UNKNOWN}；成功：${component.onSave === 'half' ? '伤害减半（草稿配置）' : '无额外效果（草稿配置）'}`;
    return `<article class="forge-statblock-entry"><h5>${escapeHtml(title)}</h5><p>${escapeHtml(detail)}</p></article>`;
  });
  const omitted = draft.components.length > MAX_ACTIVITIES
    ? `<p class="forge-statblock-limit" role="note">已省略 ${draft.components.length - MAX_ACTIVITIES} 个组件。</p>` : '';
  return [
    `<article class="forge-statblock forge-statblock--draft" aria-label="${escapeHtml(name)} 草稿预览">`,
    `<header class="forge-statblock-header"><h3 class="forge-statblock-name">${escapeHtml(name)}</h3><p class="forge-statblock-type">${escapeHtml(details)}</p></header>`,
    '<p class="forge-statblock-draft-note" role="note">草稿预览 · 尚未生成或验证 Actor；先攻、豁免总值、XP 与 PB 未知。</p>',
    '<dl class="forge-statblock-highlights" aria-label="草稿战斗数据">',
    `<div class="forge-statblock-highlight-row">${statEntry('AC 护甲等级', plainText(draft.armorClass) || UNKNOWN)}${statEntry('Initiative 先攻', UNKNOWN)}</div>`,
    statEntry('HP 生命值', plainText(draft.hitPoints) || UNKNOWN),
    statEntry('Speed 速度', plainText(draft.speed) ? `${plainText(draft.speed)} 尺` : UNKNOWN),
    '</dl>',
    renderAbilities(draft.abilities, true),
    `<div class="forge-statblock-meta">${statEntry('CR 挑战等级', plainText(draft.challengeRating) || UNKNOWN)}</div>`,
    components.length ? `<section class="forge-statblock-section" data-section="actions"><h4>动作 Actions</h4>${components.join('')}${omitted}</section>` : '',
    '</article>',
  ].join('\n');
}

function collectSections(items: unknown[]): Record<StatblockSection, string[]> {
  const sections: Record<StatblockSection, string[]> = { traits: [], actions: [], bonus: [], reactions: [], legendary: [], other: [] };
  for (const value of items) {
    const item = asRecord(value);
    const system = asRecord(item.system);
    const activities = Object.values(asRecord(system.activities));
    if (activities.length === 0) {
      const section = scalarText(item.type) === 'feat' && !scalarText(asRecord(system.activation).type) ? 'traits' : sectionForActivation(asRecord(system.activation).type);
      sections[section].push(renderItem(value));
      continue;
    }
    for (const activity of activities.slice(0, MAX_ACTIVITIES)) {
      const activation = asRecord(asRecord(activity).activation);
      const section = sectionForActivation(activation.type ?? asRecord(system.activation).type);
      sections[section].push(renderItem(value, activity));
    }
    if (activities.length > MAX_ACTIVITIES) {
      sections.other.push(`<p class="forge-statblock-limit" role="note">${escapeHtml(scalarText(item.name) ?? UNKNOWN)}：已省略 ${activities.length - MAX_ACTIVITIES} 个活动。</p>`);
    }
  }
  return sections;
}

function sectionForActivation(value: unknown): StatblockSection {
  const type = scalarText(value);
  if (type === 'action') return 'actions';
  if (type === 'bonus') return 'bonus';
  if (type === 'reaction') return 'reactions';
  if (type === 'legendary') return 'legendary';
  if (type === 'passive') return 'traits';
  return 'other';
}

function renderItem(value: unknown, activityValue?: unknown): string {
  const item = asRecord(value);
  const system = asRecord(item.system);
  const itemName = scalarText(item.name) ?? UNKNOWN;
  const itemDescription = descriptionText(system.description);
  const effects = effectCount(item.effects);
  const activityMarkup = activityValue ? renderActivity(activityValue, item) : '';

  return [
    `<article class="forge-statblock-entry forge-statblock-item" aria-label="${escapeHtml(itemName)}">`,
    `<h5>${escapeHtml(itemName)}</h5>`,
    itemDescription ? `<p class="forge-statblock-description">${escapeHtml(itemDescription)}</p>` : '',
    effects > 0
      ? `<p class="forge-statblock-effects" role="note">效果提示：此项目包含 ${escapeHtml(String(effects))} 个 Active Effect；预览不展开其运行时结算。</p>`
      : '',
    activityMarkup,
    '</article>',
  ].filter(Boolean).join('\n');
}

function renderActivity(value: unknown, item: Record<string, unknown>): string {
  const activity = asRecord(value);
  const activityType = scalarText(activity.type);
  const activityLabel = activityType ? (ACTIVITY_LABELS[activityType] ?? activityType) : UNKNOWN;
  const activityDescription = descriptionText(activity.description);
  const activityActivation = asRecord(activity.activation);
  const itemSystem = asRecord(item.system);
  const activation = Object.keys(activityActivation).length > 0
    ? formatActivation(activityActivation)
    : formatActivation(itemSystem.activation);
  const range = formatRange(activity.range) ?? formatRange(asRecord(item.system).range) ?? UNKNOWN;
  const uses = formatUses(activity.uses) ?? formatUses(itemSystem.uses);
  const effects = effectCount(activity.effects);
  const activityFields = [
    activityType === 'attack' ? `${formatAttackConfig(activity.attack)}；${range === UNKNOWN ? '' : `${range}；`}Hit 命中：${formatDamage(activity.damage, itemSystem.damage)}` : '',
    activityType === 'save' ? `Saving Throw 豁免：${formatSaveConfig(activity.save)}；${range === UNKNOWN ? '' : `${range}；`}失败：${formatDamage(activity.damage, itemSystem.damage)}` : '',
    activityType === 'damage' ? `伤害：${formatDamage(activity.damage, itemSystem.damage)}` : '',
    activityDescription && activityDescription !== descriptionText(itemSystem.description) ? `描述：${activityDescription}` : '',
    activation !== UNKNOWN ? `激活：${activation}` : '',
    uses ? `次数与恢复：${uses}` : '',
  ].filter(Boolean).map((entry) => `<p>${escapeHtml(entry)}</p>`).join('');

  return [
    `<div class="forge-statblock-activity" aria-label="${escapeHtml(`${activityLabel} 活动`)}">`,
    activityFields || `<p class="forge-statblock-unknown">${escapeHtml(UNKNOWN)}：活动没有可读配置。</p>`,
    effects > 0
      ? `<p class="forge-statblock-effects" role="note">效果提示：此活动包含 ${escapeHtml(String(effects))} 个 Active Effect；预览不展开其运行时结算。</p>`
      : '',
    '</div>',
  ].join('\n');
}

function renderAbilities(value: unknown, draft = false): string {
  const abilities = asRecord(value);
  const cells = ABILITY_KEYS.map((key) => {
    const ability = asRecord(abilities[key]);
    const score = draft ? strictAbilityScore(abilities[key]) : strictAbilityScore(ability.value);
    // MOD is the base ability modifier (score - 10) / 2 in locked dnd5e 5.3.3.
    // It is not the full check or save total.
    const modifier = safeModifier(score);
    // dnd5e 5.3.3 stores roll options under ability.save; only its prepared
    // .value is the total saving throw modifier. bonuses.save is additive.
    const save = draft ? undefined : explicitSignedTotal(asRecord(ability.save).value);
    return [
      '<div class="forge-statblock-ability">',
      `<h5>${escapeHtml(ABILITY_LABELS[key] ?? key)}</h5>`,
      `<div><span>Score</span><strong>${escapeHtml(score === undefined ? UNKNOWN : String(score))}</strong></div>`,
      `<div><span>Mod</span><strong>${escapeHtml(modifier ?? UNKNOWN)}</strong></div>`,
      `<div><span>Save</span><strong>${escapeHtml(save ?? UNKNOWN)}</strong></div>`,
      '</div>',
    ].join('');
  }).join('');

  return [
    '<section class="forge-statblock-abilities" aria-label="能力值">',
    '<h4>能力值</h4>',
    `<div class="forge-statblock-ability-grid">${cells}</div>`,
    '</section>',
  ].join('\n');
}

function renderActorMeta(system: Record<string, unknown>): string {
  const details = asRecord(system.details);
  const attributes = asRecord(system.attributes);
  const traits = asRecord(system.traits);
  const entries: string[] = [];
  const explicitSkills = Object.entries(asRecord(system.skills)).slice(0, MAX_ITEMS)
    .map(([key, value]) => {
      const skill = asRecord(value);
      // dnd5e 5.3.3 prepareSkill sets .mod to the ability modifier and
      // .total to mod + proficiency/other bonuses. Never present .mod as total.
      const total = explicitSignedTotal(skill.total);
      return total ? `${key.toUpperCase()} ${total}` : undefined;
    }).filter((value): value is string => Boolean(value));
  if (explicitSkills.length) entries.push(statEntry('Skills 技能', explicitSkills.join('、')));
  for (const [key, label] of [['dr', 'Resistances 抗性'], ['di', 'Damage Immunities 伤害免疫'], ['ci', 'Condition Immunities 状态免疫'], ['dv', 'Vulnerabilities 易伤']] as const) {
    const trait = asRecord(traits[key]);
    const values = Array.isArray(trait.value) ? trait.value.slice(0, MAX_ITEMS).map(scalarText).filter((value): value is string => Boolean(value)) : [];
    const custom = plainText(trait.custom);
    const text = [...values, ...(custom ? [custom] : [])].join('、');
    if (text) entries.push(statEntry(label, text));
  }
  const senses = asRecord(attributes.senses);
  const senseParts = Object.entries(senses).slice(0, MAX_ITEMS).filter(([key]) => !['units', 'special'].includes(key))
    .map(([key, value]) => {
      const distance = formatScalar(value);
      return distance && distance !== '0' ? `${key} ${distance}${scalarText(senses.units) ? ` ${scalarText(senses.units)}` : ''}` : undefined;
    }).filter((value): value is string => Boolean(value));
  const senseSpecial = plainText(senses.special);
  if (senseSpecial) senseParts.push(senseSpecial);
  if (senseParts.length) entries.push(statEntry('Senses 感官', senseParts.join('；')));
  const languages = asRecord(traits.languages);
  const languageValues = Array.isArray(languages.value) ? languages.value.slice(0, MAX_ITEMS).map(scalarText).filter((value): value is string => Boolean(value)) : [];
  const languageCustom = plainText(languages.custom);
  const languageText = [...languageValues, ...(languageCustom ? [languageCustom] : [])].join('、');
  if (languageText) entries.push(statEntry('Languages 语言', languageText));
  const cr = normalizedCr(details.cr);
  const artifactXp = formatScalar(asRecord(details.xp).value);
  const xp = artifactXp && Number(artifactXp) > 0 ? Number(artifactXp) : cr ? XP_BY_CR[cr] : undefined;
  const crNumber = cr === '1/8' ? 0.125 : cr === '1/4' ? 0.25 : cr === '1/2' ? 0.5 : Number(cr);
  const hasRuleCr = cr === '0' || (cr !== undefined && Object.prototype.hasOwnProperty.call(XP_BY_CR, cr));
  const pb = hasRuleCr
    ? `+${2 + Math.max(0, Math.floor((crNumber - 1) / 4))}`
    : explicitSignedTotal(attributes.prof);
  const extra = [xp !== undefined ? `XP ${xp.toLocaleString('en-US')}` : '', pb ? `PB ${pb}` : ''].filter(Boolean).join('；');
  entries.push(statEntry('CR 挑战等级', `${cr ?? UNKNOWN}${extra ? `（${extra}）` : ''}`));
  return `<dl class="forge-statblock-meta" aria-label="其他资料">${entries.join('')}</dl>`;
}

function normalizedCr(value: unknown): string | undefined {
  const text = formatScalar(value);
  if (!text) return undefined;
  if (text === '0.125') return '1/8';
  if (text === '0.25') return '1/4';
  if (text === '0.5') return '1/2';
  return text;
}

function strictAbilityScore(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/u.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 30 ? numeric : undefined;
}

function safeModifier(score: number | undefined): string | undefined {
  return score === undefined ? undefined : formatSignedBonus(String(Math.floor((score - 10) / 2)));
}

function explicitSignedTotal(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return formatSignedBonus(String(value));
  if (typeof value !== 'string' || !/^[+-]?\d+$/u.test(value.trim())) return undefined;
  return formatSignedBonus(value.trim());
}

function statEntry(label: string, value: string): string {
  return `<div class="forge-statblock-stat"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function formatHitPoints(value: unknown): string {
  const hp = asRecord(value);
  const current = formatScalar(hp.value);
  const max = formatScalar(hp.max);
  const formula = plainText(hp.formula);
  if (!current && !max && !formula) return UNKNOWN;
  const total = current && max && current !== max ? `${current} / ${max}` : current ?? max ?? UNKNOWN;
  return formula ? `${total}（${formula}）` : total;
}

function formatArmorClass(value: unknown): string {
  const ac = asRecord(value);
  const flat = formatScalar(ac.flat);
  const formula = scalarText(ac.formula) ?? scalarText(ac.calc);
  if (!flat && !formula) return UNKNOWN;
  if (flat && formula) return formula === 'flat' ? flat : `${flat}（${formula}）`;
  return flat ?? formula ?? UNKNOWN;
}

function formatMovement(value: unknown): string {
  const movement = asRecord(value);
  const units = scalarText(movement.units);
  const entries = (['walk', 'fly', 'swim', 'climb', 'burrow'] as const)
    .map((key) => {
      const distance = formatScalar(movement[key]);
      if (!distance) return undefined;
      const label = key === 'walk' ? '步行' : key === 'fly' ? '飞行' : key === 'swim' ? '游泳' : key === 'climb' ? '攀爬' : '掘穴';
      return `${label} ${distance}${units ? ` ${units}` : ''}`;
    })
    .filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join('；') : UNKNOWN;
}

function formatSize(value: unknown): string {
  const raw = scalarText(value);
  if (!raw) return UNKNOWN;
  return SIZE_LABELS[raw.toLowerCase()] ?? raw;
}

function formatActivation(value: unknown): string {
  const activation = asRecord(value);
  const type = scalarText(activation.type);
  const valueText = formatScalar(activation.value);
  const condition = plainText(activation.condition);
  if (!type && !valueText && !condition) return UNKNOWN;
  const label = type ? (ACTIVATION_LABELS[type] ?? type) : UNKNOWN;
  const parts = [label];
  if (valueText) parts.push(`次数配置 ${valueText}`);
  if (condition) parts.push(`条件：${condition}`);
  return parts.join('；');
}

function formatRange(value: unknown): string | undefined {
  const range = asRecord(value);
  const parts: string[] = [];
  const units = scalarText(range.units);
  const reach = formatScalar(range.reach);
  const valueText = formatScalar(range.value);
  const long = formatScalar(range.long);
  if (reach) parts.push(`触及 ${reach}${units ? ` ${units}` : ''}`);
  if (valueText) parts.push(`射程 ${valueText}${units ? ` ${units}` : ''}`);
  if (long) parts.push(`远程 ${long}${units ? ` ${units}` : ''}`);
  const special = plainText(range.special);
  if (special) parts.push(`特殊：${special}`);
  return parts.length > 0 ? parts.join('；') : undefined;
}

function formatAttackConfig(value: unknown): string {
  const attack = asRecord(value);
  const attackType = asRecord(attack.type);
  const type = scalarText(attackType.value);
  const ability = scalarText(attack.ability);
  const bonus = scalarText(attack.bonus);
  const flat = attack.flat;
  const parts = [
    type ? (ATTACK_TYPE_LABELS[type] ?? `Attack Roll 攻击检定（${type}）`) : 'Attack Roll 攻击检定',
    `能力：${ability ? (ABILITY_LABELS[ability] ?? ability) : UNKNOWN}`,
  ];
  if (flat === true) {
    parts.push(bonus ? `固定加值：${formatSignedBonus(bonus)}（候选配置值）` : `固定加值：${UNKNOWN}`);
    parts.push('最终命中：仅在运行时上下文确认；未在此预览推导');
  } else {
    parts.push(`附加加值/公式：${bonus ?? UNKNOWN}`);
    parts.push('最终命中：未知（由 Foundry 运行时计算；预览不计算属性与熟练加值）');
  }
  return parts.join('；');
}

function formatSaveConfig(value: unknown): string {
  const save = asRecord(value);
  const abilityValue = Array.isArray(save.ability)
    ? save.ability.map((entry) => scalarText(entry)).filter((entry): entry is string => Boolean(entry)).join('、')
    : scalarText(save.ability);
  const dc = asRecord(save.dc);
  const fixedDc = formatScalar(dc.value) ?? (typeof save.dc === 'number' ? formatScalar(save.dc) : undefined);
  const formula = scalarText(dc.formula);
  const calculation = scalarText(dc.calculation);
  const parts = [`能力：${abilityValue ? abilityValue.split('、').map((entry) => ABILITY_LABELS[entry] ?? entry).join('、') : UNKNOWN}`];
  if (fixedDc) {
    parts.push(`固定 DC：${fixedDc}（候选配置值）`);
  } else if (formula) {
    parts.push(`DC 公式：${formula}`);
    parts.push('最终 DC：未知（由 Foundry 运行时计算）');
  } else if (calculation) {
    parts.push(`DC 计算配置：${ABILITY_LABELS[calculation] ?? calculation}`);
    parts.push('最终 DC：未知（由 Foundry 运行时计算）');
  } else {
    parts.push(`DC：${UNKNOWN}`);
  }
  return parts.join('；');
}

function formatDamage(activityDamageValue: unknown, itemDamageValue: unknown): string {
  const activityDamage = asRecord(activityDamageValue);
  const itemDamage = asRecord(itemDamageValue);
  const activityBase = asRecord(activityDamage.base);
  const itemBase = asRecord(itemDamage.base);
  const base = hasDamageShape(activityBase) ? activityBase : hasDamageShape(itemBase) ? itemBase : undefined;
  const parts = Array.isArray(activityDamage.parts) ? activityDamage.parts : [];
  const damageParts = parts.map(formatDamagePart).filter((entry): entry is string => Boolean(entry));
  const includeBase = activityDamage.includeBase;
  const displayed: string[] = [];
  if (includeBase === true && base) displayed.push(formatDamagePart(base) ?? UNKNOWN);
  displayed.push(...damageParts);

  const rule = includeBase === true
    ? base ? '基础伤害规则：包含基础伤害' : '基础伤害规则：标记包含，但未提供基础伤害'
    : includeBase === false
      ? '基础伤害规则：不包含基础伤害'
      : base
        ? '基础伤害规则：未说明是否包含基础伤害；未计算总伤害'
        : undefined;
  if (displayed.length === 0 && !rule) return UNKNOWN;
  const damageLine = displayed.length > 0 ? displayed.join(' + ') : UNKNOWN;
  return `${rule ? `${rule}；` : ''}伤害公式：${damageLine}；总伤害未计算`;
}

function formatDamagePart(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const formula = scalarText(value[0]);
    const type = scalarText(value[1]);
    if (!formula && !type) return undefined;
    return [formula, type].filter(Boolean).join(' ');
  }
  const part = asRecord(value);
  const custom = asRecord(part.custom);
  const customFormula = custom.enabled === true ? scalarText(custom.formula) : undefined;
  const number = formatScalar(part.number);
  const denomination = formatScalar(part.denomination);
  const bonus = scalarText(part.bonus);
  const formula = customFormula ?? (number && denomination ? `${number}d${denomination}${bonus ? formatSignedBonus(bonus) : ''}` : undefined);
  const types = Array.isArray(part.types)
    ? part.types.map((entry) => scalarText(entry)).filter((entry): entry is string => Boolean(entry)).join('/')
    : scalarText(part.type);
  if (!formula && !types) return undefined;
  return [formula, types].filter(Boolean).join(' ');
}

function formatUses(activityValue: unknown): string | undefined {
  const uses = asRecord(activityValue);
  const hasKeys = Object.keys(uses).length > 0;
  if (!hasKeys) return undefined;
  const max = formatScalar(uses.max);
  const spent = formatScalar(uses.spent);
  const recovery = formatRecovery(uses.recovery);
  const parts = [
    `最大次数：${max ?? UNKNOWN}`,
    ...(spent ? [`已用：${spent}`] : []),
    `恢复：${recovery ?? UNKNOWN}`,
  ];
  return parts.join('；');
}

function formatRecovery(value: unknown): string | undefined {
  if (!Array.isArray(value)) return scalarText(value);
  const entries = value.map((entry) => {
    if (typeof entry === 'string') return plainText(entry) || undefined;
    const recovery = asRecord(entry);
    if (Object.keys(recovery).length === 0) return undefined;
    const period = scalarText(recovery.period) ?? scalarText(recovery.type);
    const formula = scalarText(recovery.formula) ?? scalarText(recovery.value);
    const periodLabel = period ? (RECOVERY_PERIOD_LABELS[period] ?? period) : undefined;
    const type = scalarText(recovery.type);
    const typeLabel = type && RECOVERY_TYPE_LABELS[type] ? RECOVERY_TYPE_LABELS[type] : undefined;
    return [periodLabel, typeLabel, formula].filter(Boolean).join('；');
  }).filter((entry): entry is string => Boolean(entry));
  return entries.length > 0 ? entries.join('、') : undefined;
}

function descriptionText(value: unknown): string | undefined {
  if (typeof value === 'string') return plainText(value) || undefined;
  const description = asRecord(value);
  for (const candidate of [description.chatFlavor, description.value, description.text]) {
    const text = plainText(candidate);
    if (text) return text;
  }
  return undefined;
}

function plainText(value: unknown): string {
  const raw = scalarText(value);
  if (!raw) return '';
  const withoutUnsafeBlocks = raw.replace(/<\s*(script|style|iframe|object|embed|template)\b[^>]*>[\s\S]*?(?:<\s*\/\s*\1\s*>|$)/giu, ' ');
  const withoutTags = withoutUnsafeBlocks.replace(/<[^>]*>/gu, ' ');
  const decoded = decodeBasicEntities(withoutTags);
  const normalized = decoded.replace(/[\t\r\n ]+/gu, ' ').trim();
  return normalized.length > MAX_TEXT_LENGTH ? `${normalized.slice(0, MAX_TEXT_LENGTH)}…` : normalized;
}

function decodeBasicEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#39);|&#x[\da-f]+;|&#\d+;/giu, (entity) => {
    const lower = entity.toLowerCase();
    if (lower === '&amp;') return '&';
    if (lower === '&lt;') return '<';
    if (lower === '&gt;') return '>';
    if (lower === '&quot;') return '"';
    if (lower === '&apos;' || lower === '&#39;') return "'";
    const numeric = lower.startsWith('&#x')
      ? Number.parseInt(lower.slice(3, -1), 16)
      : Number.parseInt(lower.slice(2, -1), 10);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : entity;
  });
}

function formatScalar(value: unknown): string | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

function scalarText(value: unknown): string | undefined {
  const text = formatScalar(value);
  if (!text) return undefined;
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text;
}

function formatSignedBonus(value: string): string {
  if (/^[+-]/u.test(value) || !/^\d+(?:\.\d+)?$/u.test(value)) return value;
  return `+${value}`;
}

function hasDamageShape(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

function effectCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}
