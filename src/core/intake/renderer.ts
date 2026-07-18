import yaml from 'js-yaml';
import type {
  AbilityKey,
  CanonicalFeature,
  CanonicalMonster,
  CanonicalSpellcastingGroup,
  MonsterIntakeIR,
} from './types';

const SIZE_ZH: Record<CanonicalMonster['identity']['size'], string> = {
  tiny: '微型', small: '小型', medium: '中型', large: '大型', huge: '巨型', gargantuan: '超巨型',
};
const ABILITY_ZH: Record<AbilityKey, string> = {
  str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力',
};
const MOVEMENT_ZH = { walk: '步行', climb: '攀爬', fly: '飞行', swim: '游泳', burrow: '掘穴' } as const;
const TYPE_ZH: Record<string, string> = {
  fey: '妖精', aberration: '异怪', beast: '野兽', celestial: '天界生物', construct: '构装生物',
  dragon: '龙', elemental: '元素生物', fiend: '邪魔', giant: '巨人', humanoid: '类人生物',
  monstrosity: '怪兽', ooze: '泥怪', plant: '植物', undead: '亡灵',
};
const ALIGNMENT_ZH: Record<string, string> = {
  'neutral evil': '中立邪恶', 'chaotic evil': '混乱邪恶', 'lawful evil': '守序邪恶',
  'neutral good': '中立善良', 'chaotic good': '混乱善良', 'lawful good': '守序善良',
  'lawful neutral': '守序中立', 'chaotic neutral': '混乱中立', neutral: '绝对中立', unaligned: '无阵营',
};
const DAMAGE_ZH: Record<string, string> = {
  acid: '强酸', bludgeoning: '钝击', cold: '冷冻', fire: '火焰', force: '力场', lightning: '闪电',
  necrotic: '黯蚀', piercing: '穿刺', poison: '毒素', psychic: '心灵', radiant: '光耀',
  slashing: '挥砍', thunder: '雷鸣',
};
const CONDITION_ZH: Record<string, string> = {
  blinded: '目盲', charmed: '魅惑', deafened: '耳聋', frightened: '恐慌', grappled: '受擒',
  incapacitated: '失能', invisible: '隐形', paralyzed: '麻痹', petrified: '石化', poisoned: '中毒',
  prone: '倒地', restrained: '束缚', stunned: '震慑', unconscious: '昏迷', exhausted: '力竭',
};

export function renderMonsterIntakeMarkdown(ir: MonsterIntakeIR): string {
  const creature = ir.creature;
  const data: Record<string, unknown> = {
    名称: displayName(creature.identity.name, creature.identity.englishName),
    类型: 'npc',
    体型: SIZE_ZH[creature.identity.size],
    生物类型: TYPE_ZH[creature.identity.creatureType.toLowerCase()] ?? creature.identity.creatureTypeCustom ?? creature.identity.creatureType,
    阵营: creature.identity.alignment ? ALIGNMENT_ZH[creature.identity.alignment.toLowerCase()] ?? creature.identity.alignment : undefined,
    能力: Object.fromEntries(Object.entries(ABILITY_ZH).map(([key, label]) => [label, creature.abilities[key as AbilityKey]])),
    护甲等级: creature.attributes.ac,
    生命值: creature.attributes.hp.formula
      ? `${creature.attributes.hp.value} (${normalizeDice(creature.attributes.hp.formula)})`
      : creature.attributes.hp.value,
    速度: renderMovement(creature.attributes.movement),
    先攻: creature.attributes.initiative,
    熟练加值: creature.attributes.proficiencyBonus,
    挑战等级: creature.attributes.cr,
    经验值: creature.attributes.xp,
    豁免熟练: mapRecord(creature.saves, ABILITY_ZH),
    技能: mapSkills(creature.skills),
    伤害抗性: mapList(creature.defenses.resistances, DAMAGE_ZH),
    伤害易伤: mapList(creature.defenses.vulnerabilities, DAMAGE_ZH),
    伤害免疫: mapList(creature.defenses.immunities, DAMAGE_ZH),
    状态免疫: mapList(creature.defenses.conditionImmunities, CONDITION_ZH),
    感官: renderSenses(creature),
    语言: creature.languages.values.map((value) => languageZh(value)),
    语言备注: creature.languages.custom,
    传记: renderBiography(creature),
    法术清单: renderSpellManifest(ir),
    特性: [
      ...(creature.spellcasting ?? []).map((group) => renderSpellcastingFeature(group)),
      ...creature.traits.map((feature) => renderFeature(feature, 'trait')),
    ],
    动作: creature.actions.map((feature) => renderFeature(feature, 'action')),
    附赠动作: creature.bonusActions.map((feature) => renderFeature(feature, 'bonus')),
    反应: creature.reactions.map((feature) => renderFeature(feature, 'reaction')),
    传奇动作: creature.legendaryActions.map((feature) => renderFeature(feature, 'legendary')),
  };
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0) || (isRecord(value) && Object.keys(value).length === 0)) {
      delete data[key];
    }
  }
  const frontmatter = yaml.dump(data, { noRefs: true, lineWidth: -1, sortKeys: false, quotingType: '"', forceQuotes: false });
  return `---\n${frontmatter}---\n`;
}

function renderSpellManifest(ir: MonsterIntakeIR): Record<string, unknown> | undefined {
  const groups = ir.creature.spellcasting;
  if (!groups?.length) return undefined;
  return {
    schemaVersion: 1,
    manifestId: renderSpellManifestId(ir),
    sourceSha256: ir.source.sha256,
    rulesPreference: '2024',
    spellcastingGroups: groups.map((group) => ({
      groupId: group.groupId,
      featureItemKey: group.groupId,
      ability: group.ability,
      ...(group.saveDc === undefined ? {} : { saveDc: group.saveDc }),
      ...(group.attackBonus === undefined ? {} : { attackBonus: group.attackBonus }),
      spellRefs: group.usageGroups.flatMap((usageGroup) => usageGroup.spellRefs.map((ref) => ({
        refId: ref.refId,
        identifier: ref.identifier,
        originalName: ref.originalName,
        ...(ref.englishName === undefined ? {} : { englishName: ref.englishName }),
        ...(ref.chineseName === undefined ? {} : { chineseName: ref.chineseName }),
        aliases: ref.aliases,
        method: usageGroup.usage === 'at-will' ? 'at-will' : 'innate',
        ...(usageGroup.usage === '1/day-each'
          ? { uses: { value: 1, recovery: 'day', shared: false } }
          : {}),
        ignoresMaterialComponents: group.componentWaivers.some((waiver) => waiver.component === 'material'),
        restrictions: ref.restrictions,
        evidence: ref.evidence,
      }))),
    })),
  };
}

function renderSpellManifestId(ir: MonsterIntakeIR): string {
  const groups = ir.creature.spellcasting ?? [];
  const creatureKey = stableIdPart(ir.creature.identity.englishName ?? ir.creature.identity.name);
  const groupKey = groups.map((group) => stableIdPart(group.groupId)).join('-');
  const sourceOffset = groups.flatMap((group) => group.evidence)
    .find((evidence) => Number.isInteger(evidence.start))?.start ?? 0;
  return `intake-${ir.source.sha256.slice(0, 16)}-${creatureKey}-${groupKey}-${sourceOffset}`;
}

function stableIdPart(value: string): string {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return normalized || 'unnamed';
}

function renderSpellcastingFeature(group: CanonicalSpellcastingGroup): Record<string, unknown> {
  return renderFeature({
    name: group.featureName,
    englishName: group.featureEnglishName,
    description: group.description,
    activityType: 'utility',
  }, 'trait');
}

function renderFeature(feature: CanonicalFeature, section: string): Record<string, unknown> {
  const result: Record<string, unknown> = {
    名称: displayName(feature.name, feature.englishName),
    类型: feature.attack ? 'attack' : feature.save ? 'save' : feature.activityType ?? 'utility',
    激活: feature.activationType,
    描述: feature.description,
  };
  if (!result.激活) delete result.激活;
  if (feature.attack) {
    result.攻击类型 = feature.attack.type;
    result.命中 = feature.attack.toHit;
    result.范围 = feature.attack.reach
      ? `触及 ${feature.attack.reach} 尺`
      : feature.attack.range
        ? `${feature.attack.range}${feature.attack.longRange ? `/${feature.attack.longRange}` : ''} 尺`
        : undefined;
  }
  const structuredDamage = feature.damage?.filter((damage) => damage.relationship === 'base' || damage.relationship === 'additional');
  if (structuredDamage?.length) {
    result.伤害 = structuredDamage.map((damage) => ({
      公式: normalizeDice(damage.formula),
      类型: canonicalDamageType(damage.type),
    }));
  }
  if (feature.save) {
    result.DC = feature.save.dc;
    result.属性 = ABILITY_ZH[feature.save.ability];
    result.dcSourceKind = 'literal';
  }
  if (feature.recharge) result.充能 = `${feature.recharge[0]}-${feature.recharge[1]}`;
  if (feature.uses) result.每日 = feature.uses.max;
  if (section === 'legendary' && feature.legendaryCost) result.传奇动作消耗 = feature.legendaryCost;
  return result;
}

function renderBiography(creature: CanonicalMonster): string | undefined {
  const parts = creature.biography?.trim() ? [creature.biography.trim()] : [];
  if (creature.attributes.acNote?.trim()) {
    const note = creature.attributes.acNote.trim();
    const literalNote = /^[（(]/u.test(note) ? note : `（${note}）`;
    parts.push(`护甲等级：${creature.attributes.ac}${literalNote}`);
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

function canonicalDamageType(value: string): string {
  const normalized = value.toLowerCase();
  const direct = Object.keys(DAMAGE_ZH).find((key) => key === normalized);
  if (direct) return direct;
  return Object.entries(DAMAGE_ZH).find(([, label]) => label === value)?.[0] ?? value;
}

function renderMovement(movement: CanonicalMonster['attributes']['movement']): string {
  return Object.entries(movement)
    .filter((entry): entry is [keyof typeof MOVEMENT_ZH, number] => typeof entry[1] === 'number')
    .map(([kind, value]) => `${MOVEMENT_ZH[kind]} ${value} 尺`)
    .join(', ');
}

function renderSenses(creature: CanonicalMonster): Record<string, unknown> {
  const map: Record<string, string> = { darkvision: '黑暗视觉', blindsight: '盲视', tremorsense: '震颤感知', truesight: '真实视觉' };
  const senses: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(creature.senses)) {
    if (key === 'passivePerception') senses.被动察觉 = value;
    else if (key === 'special' && typeof value === 'string' && value.trim()) senses.特殊 = value;
    else if (typeof value === 'number') senses[map[key] ?? key] = value;
  }
  return senses;
}

function mapRecord(record: Partial<Record<AbilityKey, number>>, labels: Record<AbilityKey, string>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [labels[key as AbilityKey], value as number]));
}

function mapSkills(skills: Record<string, number>): Record<string, number> {
  const names: Record<string, string> = {
    deception: '欺瞒', intimidation: '威吓', perception: '察觉', stealth: '隐匿', athletics: '运动',
    acrobatics: '体操', insight: '洞悉', investigation: '调查', arcana: '奥秘', history: '历史',
    nature: '自然', religion: '宗教', survival: '求生', medicine: '医药', persuasion: '游说',
    performance: '表演', 'sleight-of-hand': '巧手', animalHandling: '驯兽',
  };
  return Object.fromEntries(Object.entries(skills).map(([key, value]) => [names[key] ?? key, value]));
}

function mapList(values: string[], labels: Record<string, string>): string[] {
  return values.map((value) => labels[value.toLowerCase()] ?? value);
}

function languageZh(value: string): string {
  return ({ common: '通用语', dwarvish: '矮人语', elvish: '精灵语', giant: '巨人语', goblin: '地精语' } as Record<string, string>)[value.toLowerCase()] ?? value;
}

function displayName(name: string, englishName?: string): string {
  return englishName && !name.toLowerCase().includes(englishName.toLowerCase()) ? `${name} (${englishName})` : name;
}

function normalizeDice(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s*([+-])\s*/g, ' $1 ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
