import { displayName } from '@fvtt-json-generator/models/display-name';
import yaml from 'js-yaml';
export {prepareMonsterCandidateDelivery} from './candidate-delivery';
import {sizeChoiceProgramNote} from './source-size';
import {nativeAreaShape} from '@fvtt-json-generator/models/source-operations';
import { composeSourceTextPresentation, sourceTextPresentationBoundary, type SourceTextPresentation } from '@fvtt-json-generator/models/source-text-presentation';
import type {SourceCandidateReview} from '@fvtt-json-generator/models/source-operations';
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
const AOE_ZH: Record<NonNullable<CanonicalFeature['aoe']>['shape'], string> = {
  sphere: '球形', radius: '半径', cone: '锥形', line: '线形', cube: '立方体', cylinder: '圆柱形', rectangle: '矩形',
};

export function renderMonsterIntakeMarkdown(ir: MonsterIntakeIR, source?:string): string {
  const creature = ir.creature;
  const refs=[...ir.coverage].sort((a,b)=>a.start-b.start);
  let cursor=0;
  const complete=refs.every(ref=>ref.start===cursor&&(cursor=ref.end)>=ref.start)&&cursor===ir.source.length;
  const rawSource=source??(complete?refs.map(ref=>ref.quote).join(''):undefined);
  const unresolved=ir.uncertainties.filter(f=>f.blocking);
  const reviewFindings=[...new Map(unresolved.map(f=>[f.code+'\0'+f.path,{code:f.code,path:f.path,message:f.message}])).values()];
  const candidateReview:SourceCandidateReview|undefined=reviewFindings.length?{version:1,findings:reviewFindings,
    proposal:{sourceSha256:ir.source.sha256,source:rawSource??null,uncertainties:structuredClone(ir.uncertainties),prior:creature.candidateReview??null}}:creature.candidateReview;
  const prepared = renderPreparedSpellcastingProfile(creature);
  const castingAbilities=[...new Set((creature.spellcasting??[]).map(g=>g.ability))];
  const castingFeatures=(activation?:CanonicalSpellcastingGroup['activationType'])=>(creature.spellcasting??[]).filter(g=>g.activationType===activation).map(renderSpellcastingFeature);
  const biography = renderBiography(creature);
  const sharedIds=new Set(creature.sourceResourcePools?.flatMap(pool=>pool.members.map(member=>member.featureId))??[]);
  const featureEntry=(feature:CanonicalFeature,section:string)=>renderFeature(feature,section,sharedIds.has(feature.sourceFeatureId??''));
  const data: Record<string, unknown> = {
    // Source-derived boundary: the complete canonical ability inventory is
    // rendered below; biography is literal narrative, not another rule input.
    'intake-biography-mode': 'literal-v1',
    ...(candidateReview?{'intake-candidate-review':candidateReview}:{}),
    ...(biography ? {'intake-biography-presentation':sourceTextPresentationBoundary(biography)} : {}),
    名称: displayName(creature.identity.name, creature.identity.englishName),
    类型: 'npc',
    体型: SIZE_ZH[creature.identity.size],
    集群个体体型: creature.identity.swarmSize ? SIZE_ZH[creature.identity.swarmSize] : undefined,
    生物类型: TYPE_ZH[creature.identity.creatureType.toLowerCase()] ?? creature.identity.creatureTypeCustom ?? creature.identity.creatureType,
    生物类型备注: creature.identity.creatureTypeCustom,
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
    传记: biography ? composeSourceTextPresentation(biography) : undefined,
    传奇动作次数: creature.legendary?.max,
    ...(creature.legendary?.resistanceMax!==undefined&&creature.legendary.resistanceLairMax===undefined
      ?{'传奇抗性次数':creature.legendary.resistanceMax}:{}),
    ...(creature.legendary?.lairMax?{'intake-legendary-ledger':{
      max:creature.legendary.max,lairMax:creature.legendary.lairMax,recovery:creature.legendary.recovery,
      ...(creature.legendary.resistanceLairMax===undefined?{}:{resistanceMax:creature.legendary.resistanceMax,resistanceLairMax:creature.legendary.resistanceLairMax}),
    }}:{}),
    施法属性: prepared?.ability??(castingAbilities.length===1?castingAbilities[0]:undefined),
    施法者等级: prepared?.casterLevel,
    法术位: prepared?.slots,
    法术清单: renderSpellManifest(ir),
    资源机制:renderSourceResourcePools(creature),
    特性: [
      ...castingFeatures(),
      ...creature.traits.map((feature) => featureEntry(feature, 'trait')),
    ],
    动作: [...castingFeatures('action'),...creature.actions.map((feature) => featureEntry(feature, 'action'))],
    附赠动作: [...castingFeatures('bonus'),...creature.bonusActions.map((feature) => featureEntry(feature, 'bonus'))],
    反应: [...castingFeatures('reaction'),...creature.reactions.map((feature) => featureEntry(feature, 'reaction'))],
    传奇动作: [...castingFeatures('legendary'),...creature.legendaryActions.map((feature) => featureEntry(feature, 'legendary'))],
    神话动作: (creature.mythicActions ?? []).map((feature) => featureEntry(feature, 'mythic')),
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
  const groups = ir.creature.spellcasting?.filter(group=>group.usageGroups.some(usage=>usage.spellRefs.length));
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
      ...(group.recharge?{recharge:group.recharge}:{}),
      spellRefs: group.usageGroups.flatMap((usageGroup) => usageGroup.spellRefs.map((ref) => ({
        refId: ref.refId,
        ...(ref.reuseOf?{reuseOf:{...ref.reuseOf}}:{}),
        identifier: ref.identifier,
        originalName: ref.originalName,
        ...(ref.englishName === undefined ? {} : { englishName: ref.englishName }),
        ...(ref.chineseName === undefined ? {} : { chineseName: ref.chineseName }),
        aliases: ref.aliases,
        method: usageGroup.usage === 'at-will' || usageGroup.usage === 'prepared-cantrip'
          ? 'at-will'
          : usageGroup.usage === 'prepared-slots' ? 'prepared' : 'innate',
        ...(usageGroup.usage === '1/day-each'
          ? { uses: { value: 1, recovery: 'day', shared: false } }
          : usageGroup.usage==='daily-each'||usageGroup.usage==='daily-shared'?{uses:{value:usageGroup.count,recovery:'day',shared:usageGroup.usage==='daily-shared'}}:{}),
        ...(usageGroup.usage === 'prepared-slots' ? { castingLevel: usageGroup.level } : {}),
        ignoresMaterialComponents: group.componentWaivers.some((waiver) => waiver.component === 'material'),
        restrictions: ref.restrictions,
        evidence: ref.evidence,
      }))),
    })),
  };
}

function renderSourceResourcePools(creature:CanonicalMonster):Record<string,unknown>|undefined{
  if(!creature.sourceResourcePools?.length)return;
  const sections={traits:'特性',actions:'动作',bonusActions:'附赠动作',reactions:'反应',legendaryActions:'传奇动作',mythicActions:'神话动作'};
  const reference=(member:NonNullable<CanonicalMonster['sourceResourcePools']>[number]['members'][number])=>({分区:sections[member.collection],名称:renderMonsterFeatureName(creature[member.collection]![member.index]!),sourceFeatureId:member.featureId});
  return{
    资源:creature.sourceResourcePools.map(pool=>({ID:pool.id,名称:pool.name,载体:reference(pool.members[0]!),初始:pool.max,最大:pool.max,恢复:({day:'day',longRest:'lr',shortRest:'sr',dawn:'dawn'} as const)[pool.period],操作:[],派生:[]})),
    消费:creature.sourceResourcePools.flatMap(pool=>pool.members.map(member=>({ID:pool.id+'-'+member.featureId,资源:pool.id,来源:reference(member),模式:'fixed',数量:member.cost}))),
    转换:[],
  };
}

export function renderPreparedSpellcastingProfile(creature: CanonicalMonster): {
  ability: AbilityKey;
  casterLevel: number;
  slots: Record<number, number>;
} | undefined {
  const groups = (creature.spellcasting ?? []).filter((group) => group.usageGroups.some((usage) => (
    usage.usage === 'prepared-cantrip' || usage.usage === 'prepared-slots'
  )));
  if (groups.length === 0) return undefined;
  const first = groups[0]!;
  const casterLevel = first.casterLevel;
  if (!Number.isInteger(casterLevel)) throw new Error('Prepared spellcasting requires an explicit caster level.');
  const slots: Record<number, number> = {};
  for (const group of groups) {
    if (group.ability !== first.ability || group.casterLevel !== casterLevel) {
      throw new Error('Conflicting prepared spellcasting ability or caster level cannot share one Actor profile.');
    }
    for (const usage of group.usageGroups) {
      if (usage.usage !== 'prepared-slots') continue;
      const existing = slots[usage.level];
      if (existing !== undefined && existing !== usage.slots) {
        throw new Error(`Conflicting prepared level-${usage.level} slot pools cannot share one Actor profile.`);
      }
      slots[usage.level] = usage.slots;
    }
  }
  return { ability: first.ability, casterLevel: casterLevel!, slots };
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
  const native=group.usageGroups.length>0,manual=group.manualGrants?.map(ref=>ref.quote).join('\n');
  const shared=group.usageGroups.find(usage=>usage.usage==='daily-shared');
  return {
    ...renderFeature({
      name: group.featureName,
      ...(group.candidateReview?{candidateReview:group.candidateReview}:{}),
      ...(group.candidateCounters?{candidateCounters:group.candidateCounters}:{}),
      englishName: group.featureEnglishName,
      description: group.description,
      activityType: 'utility',
      ...(manual?{executionMode:native?'native-with-gm' as const:'gm-manual' as const,...(native?{nativeRuleText:group.usageGroups.flatMap(g=>g.evidence.map(ref=>ref.quote)).join('\n'),manualRemainder:manual}:{})}:{}),
      ...(group.activationType?{activationType:group.activationType}:{}),
      ...(group.recharge?{recharge:group.recharge}:{}),
      ...(group.legendaryCost!==undefined?{legendaryCost:group.legendaryCost}:{}),
      ...(shared?.usage==='daily-shared'?{uses:{max:shared.count,period:'day' as const}}:{}),
    }, 'trait'),
    // Source-derived machine linkage; it does not alter the visible description.
    ...(native?{spellcastingFeatureKey: group.groupId}:{}),
  };
}

/** The YAML title and its exact GM carrier reference must use one presentation. */
export function renderMonsterFeatureName(feature: Pick<CanonicalFeature, 'name'|'englishName'|'sourceQualifier'>): string {
  const englishName = feature.englishName?.trim();
  const repeatedBase = englishName
    && englishName.slice(0, feature.name.length).toLocaleLowerCase('en-US') === feature.name.toLocaleLowerCase('en-US')
    && /^\s*\(/u.test(englishName.slice(feature.name.length));
  const baseName = repeatedBase ? englishName : displayName(feature.name, englishName);
  const qualifier = feature.sourceQualifier?.trim();
  return qualifier && !baseName.includes(qualifier) ? `${baseName} ${qualifier}` : baseName;
}

function renderFeature(feature: CanonicalFeature, section: string,sharedPool=false): Record<string, unknown> {
  const result: Record<string, unknown> = {
    名称: renderMonsterFeatureName(feature),
    // Program-owned projection boundary. Full AI prose remains visible, but
    // only the explicit fields below may supply executable mechanics.
    literalMechanics: true,
    // Canonical names/aliases have already been rendered. Do not let the
    // legacy bilingual YAML grammar reinterpret an authored (Prototype).
    literalName: true,
    类型: feature.attack ? 'attack' : feature.save ? 'save' : feature.activityType ?? 'utility',
    激活: feature.activationType,
    描述: feature.description,
  };
  if(feature.sourceFeatureId)result.sourceFeatureId=feature.sourceFeatureId;
  if(feature.candidateReview)result.candidateReview=feature.candidateReview;
  if(feature.candidateCounters)result.candidateCounters=feature.candidateCounters;
  if (feature.executionMode === 'gm-manual') {
    result['执行模式'] = 'gm-manual';
    result['类型'] = 'utility';
  }
  if(feature.executionMode==='native-with-gm'){
    result['执行模式']='native-with-gm';result.nativeRuleText=feature.nativeRuleText;result.manualRemainder=feature.manualRemainder;
    if(feature.spellUseRecords)result.spellUseRecords=feature.spellUseRecords;
    if(feature.gmTriggeredSave)result.gmTriggeredSave=feature.gmTriggeredSave;
    if(feature.nativeFailureStatuses)result.nativeFailureStatuses=feature.nativeFailureStatuses;
    if(feature.sourceOperations)result.sourceOperations=feature.sourceOperations;
    if(feature.sourceContext)result.sourceContext=feature.sourceContext;
  }
  if (!result.激活) delete result.激活;
  if (feature.activationCondition) result.activation = { condition: feature.activationCondition };
  if (feature.range !== undefined) result.范围 = `${feature.range} 尺`;
  if (feature.targetSpecial) result.targetSpecial = feature.targetSpecial;
  if (feature.attack) {
    result.攻击类型 = feature.attack.type;
    result.命中 = feature.attack.toHit;
    const reach = feature.attack.reach !== undefined ? `触及 ${feature.attack.reach} 尺` : undefined;
    const range = feature.attack.range !== undefined
      ? `${feature.attack.range}${feature.attack.longRange ? `/${feature.attack.longRange}` : ''} 尺`
      : undefined;
    result.范围 = reach && range ? `${reach}或射程 ${range}` : reach ?? range;
  }
  const structuredDamage = feature.damage;
  if (structuredDamage?.length) {
    result.伤害 = structuredDamage.map((damage) => ({
      公式: normalizeDice(damage.formula),
      类型: canonicalDamageType(damage.type),
      ...(damage.types?{类型选项:damage.types.map(canonicalDamageType)}:{}),
      关系: damage.relationship,
      条件: damage.condition,
    }));
  }
  if (feature.healing) {
    result['\u6cbb\u7597'] = {
      '\u516c\u5f0f': normalizeDice(feature.healing.formula),
      '\u7c7b\u578b': feature.healing.type,
      ...(feature.healing.target?{target:feature.healing.target}:{}),
    };
  }
  if (feature.save) {
    result.DC = feature.save.dc;
    result.属性 = ABILITY_ZH[feature.save.ability];
    result.dcSourceKind = feature.save.dcSourceKind ?? 'literal';
    if(feature.save.outcome)result.saveOutcome=feature.save.outcome;
    if (feature.save.condition) result.豁免条件 = feature.save.condition;
  }
  if (feature.aoe) result.AoE = { 形状: AOE_ZH[nativeAreaShape(feature.aoe.shape,feature.aoe.radius,feature.nativeRuleText??feature.description)], 范围: feature.aoe.radius };
  if (feature.appliedConditions?.length) {
    result.内嵌效果 = feature.appliedConditions.flatMap((applied) => {
      const types = applied.statuses.length > 0 ? applied.statuses : [applied.condition ?? 'Effect'];
      return types.map((type) => ({
        类型: type,
        描述: feature.description,
        条件: applied.condition,
        持续: applied.duration,
        逃脱DC: applied.escapeDc,
        阶段: applied.staged,
      }));
    });
    result.失败效果 = feature.appliedConditions.map((applied) => ({
      描述: applied.condition ?? (applied.statuses.join(', ') || feature.description),
    }));
  }
  if (feature.recharge) result.充能 = `${feature.recharge[0]}-${feature.recharge[1]}`;
  if (feature.uses&&!sharedPool) result.使用次数 = {max:feature.uses.max,period:feature.uses.period};
  if (feature.activationCondition && /concentration|专注/iu.test(feature.activationCondition)) result['\u9700\u4e13\u6ce8'] = true;
  if ((section === 'legendary' || section === 'mythic') && feature.legendaryCost) result.传奇动作消耗 = feature.legendaryCost;
  return result;
}

function renderBiography(creature: CanonicalMonster): SourceTextPresentation | undefined {
  const parts = creature.biography?.trim() ? [creature.biography.trim()] : [];
  const programNotes: string[] = [];
  if (creature.legendary?.preamble.trim()&&!creature.biography?.includes(creature.legendary.preamble.trim())) parts.push(creature.legendary.preamble.trim());
  const acNote = creature.attributes.acNote?.trim()
    || (creature.attributes.acKind === 'natural' ? '天生护甲' : '');
  if (acNote) {
    const note = acNote;
    const literalNote = /^[（(]/u.test(note) ? note : `（${note}）`;
    programNotes.push(`护甲等级：${creature.attributes.ac}${literalNote}`);
  }
  if (creature.identity.sourceSize) {
    const choice=sizeChoiceProgramNote(creature.identity);
    if(choice)programNotes.push(choice);
    else if(/^Colossal(?:\s*\([^)]*\))?$/iu.test(creature.identity.sourceSize)&&creature.identity.size==='gargantuan'){
      programNotes.push(`原文尺寸：${creature.identity.sourceSize}。角色卡使用最大原生尺寸 gargantuan（超巨型）；尺寸相关规则由 GM 手动判断。`);
    }else throw new TypeError('InvalidSourceSizePresentation');
  }
  return parts.length || programNotes.length ? {version:1, sourceText:parts.join('\n\n'), programNotes} : undefined;
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
    .join(', ') + (movement.hover && typeof movement.fly === 'number' ? ' (hover)' : '');
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

function mapSkills(skills: Record<string, number>): Record<string, { 总加值: number }> {
  const names: Record<string, string> = {
    deception: '欺瞒', intimidation: '威吓', perception: '察觉', stealth: '隐匿', athletics: '运动',
    acrobatics: '特技', insight: '洞悉', investigation: '调查', arcana: '奥秘', history: '历史',
    nature: '自然', religion: '宗教', survival: '求生', medicine: '医药', persuasion: '游说',
    performance: '表演', 'sleight-of-hand': '巧手', sleightofhand: '巧手', animalHandling: '驯兽', animalhandling: '驯兽',
  };
  // Intake stores source TOTAL modifiers. Bare 1/2 in legacy YAML means
  // proficiency/expertise, so keep this source-derived meaning explicit.
  return Object.fromEntries(Object.entries(skills).map(([key, value]) => [names[key] ?? names[key.toLowerCase()] ?? key, { 总加值: value }]));
}

function mapList(values: string[], labels: Record<string, string>): string[] {
  return values.map((value) => labels[value.toLowerCase()] ?? value);
}

function languageZh(value: string): string {
  return ({ common: '通用语', dwarvish: '矮人语', elvish: '精灵语', giant: '巨人语', goblin: '地精语' } as Record<string, string>)[value.toLowerCase()] ?? value;
}



function normalizeDice(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s*([+-])\s*/g, ' $1 ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
