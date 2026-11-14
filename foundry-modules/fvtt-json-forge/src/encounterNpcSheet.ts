import type { PreparedEncounterActor } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import type { EncounterIntakeReport } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type { EncounterReviewIssue } from './encounterReviewNavigation';

type ReportActor = EncounterIntakeReport['actors'][number];
type RecordValue = Record<string, unknown>;
type ActorAbility = { name: string; description: string; section: string; manual: boolean };
type SheetIssue = { label: string; source: string; outcome: string; next: string; quote?: string; compact?: string };

const sectionLabels: Record<string, string> = {
  traits: '特性', actions: '动作', bonusActions: '附赠动作', reactions: '反应',
  legendaryActions: '传奇动作', mythicActions: '神话动作',
};
const activationSections: Record<string, string> = {
  action: 'actions', bonus: 'bonusActions', reaction: 'reactions', legendary: 'legendaryActions',
};
const abilityLabels: Record<string, string> = { str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' };
const fields = [
  { key: 'hp', label: '生命值', icon: 'heart', path: 'hp/value', header: /^(?:HP|Hit Points|生命值|生命点数)\s*(?:[:：]\s*)?(\d+)\b/iu, next: '核对 PDF，导入后可在角色卡调整最大生命值。' },
  { key: 'ac', label: '护甲等级', icon: 'shield', path: 'ac', header: /^(?:AC|Armor Class|护甲等级)\s*(?:[:：]\s*)?(\d+)\b/iu, next: '核对 PDF，导入后可在角色卡调整护甲等级。' },
  { key: 'cr', label: '挑战等级', icon: 'dragon', path: 'cr', header: /^(?:CR|Challenge(?: Rating)?|挑战等级)\s*(?:[:：]\s*)?(\d+(?:\/\d+|\.\d+)?)(?![\d/])/iu, next: '核对 PDF，导入后可修改挑战等级。经验值也会随之改变。' },
  { key: 'xp', label: '经验值', icon: 'star', path: 'xp', header: /^(?:XP|Experience Points|经验值)\s*(?:[:：]\s*)?([\d,]+)\b/iu, next: 'Foundry 按挑战等级计算。若采用原文的自定义经验值，请在结算时手动分配。' },
];

export function encounterNpcSheet({actor, preview, nativeSystem, source, report, issues}: {
  actor: PreparedEncounterActor;
  preview: { hp: unknown; ac: unknown; cr: unknown; abilities: ActorAbility[]; previewIssues: string[] };
  nativeSystem?: unknown;
  source: string;
  report?: ReportActor;
  issues: readonly EncounterReviewIssue[];
}) {
  const system = record(actor.artifact.system);
  const native = record(nativeSystem);
  const nativeAttributes = record(native.attributes);
  const nativeDetails = record(native.details);
  const xp = numberValue(record(nativeDetails.xp).value);
  const nativeValues: Record<string, unknown> = {
    hp: numberValue(record(nativeAttributes.hp).max) ?? preview.hp,
    ac: numberValue(record(nativeAttributes.ac).value) ?? preview.ac,
    cr: numberValue(nativeDetails.cr) ?? preview.cr,
    xp: xp ?? numberValue(record(record(system.details).xp).value),
  };
  const resolved = new Set<string>();
  const sheetStats = fields.map(field => {
    const path = '/creature/attributes/' + field.path;
    const driftCode = 'ACTOR_' + field.key.toUpperCase() + '_DRIFT';
    const related = issues.filter(issue => issue.field === path
      && (issue.kind === driftCode || field.key === 'cr' && issue.kind === 'INVALID_STRUCTURE'));
    const savedFindings = (actor.reviewFindings ?? []).filter(finding =>
      finding.startsWith(driftCode + '：'));
    const original = sourceValue(report?.source ?? source, field.header);
    const reported = related.map(issue => expectedNumber(issue.message)).find(value => value !== undefined)
      ?? savedFindings.map(expectedNumber).find(value => value !== undefined);
    const extracted = record(report?.analysis.ir?.creature?.attributes);
    const proposed = field.key === 'hp' ? record(extracted.hp).value : extracted[field.key];
    const fromSource = original?.value;
    const expected = fromSource ?? reported ?? numberValue(proposed);
    const value = nativeValues[field.key];
    const numeric = numberValue(value);
    let issue: SheetIssue | undefined;
    if (expected !== undefined && numeric !== undefined && expected !== numeric && (field.key !== 'xp' || xp !== undefined)) {
      issue = { label: field.label, source: original ? String(expected) : '提取值 '+expected+'，请对照完整来源', outcome: String(numeric), next: field.next, quote: original?.value === expected ? original.line : related.find(item=>item.source)?.source };
    } else if (related.length && (expected === undefined || numeric === undefined)) {
      issue = {
        label: field.label, source: original ? String(original.value) : expected === undefined
          ? '尚未确认原文数值，请展开完整来源' : '提取值 '+expected+'，请对照完整来源',
        outcome: numeric === undefined ? '当前预览无法确认' : String(numeric),
        next: '请先对照完整来源和此处的角色预览，再决定是否导入。', quote: original?.value === expected ? original?.line : related.find(item=>item.source)?.source,
      };
    }
    if (issue || (original && numeric === original.value)) {
      for (const finding of related) resolved.add(finding.field + '\n' + finding.kind);
      for (const finding of savedFindings) resolved.add(finding);
    }
    return { ...field, target:'stat-'+field.key, value: value ?? '—', issue, calculated: field.key === 'xp' && xp !== undefined };
  });

  const abilityScores = Object.entries(abilityLabels).map(([key, label]) => {
    const value = numberValue(record(record(system.abilities)[key]).value);
    const path = '/creature/abilities/' + key;
    const finding = issues.find(issue => issue.field === path && issue.kind === 'ACTOR_ABILITY_DRIFT');
    const expected = finding && expectedNumber(finding.message);
    const issue = expected === undefined || value === undefined ? undefined : {
      label, source: String(expected), outcome: String(value),
      next: '核对 PDF，导入后可在角色卡调整这项属性。', quote: finding?.source,
    };
    if (issue && finding) resolved.add(finding.field + '\n' + finding.kind);
    return {label, target:'score-'+key, value:value ?? '—', issue};
  });
  const byAbility = new Map<string, SheetIssue[]>();
  for (const finding of issues) {
    const match = /^\/creature\/(traits|actions|bonusActions|reactions|legendaryActions|mythicActions)\/(\d+)(?:\/|$)/u.exec(finding.field);
    if (!match) continue;
    const group = match[1] as keyof typeof sectionLabels;
    const creature = record(report?.analysis.ir?.creature);
    const collection = creature[group];
    const feature = record(Array.isArray(collection) ? collection[Number(match[2])] : undefined);
    const names = [feature.name, feature.englishName].filter((name): name is string => typeof name === 'string');
    const matches = preview.abilities.filter(ability => names.some(name => ability.name === name || ability.name.endsWith(' ' + name)));
    if (matches.length !== 1) continue;
    const item = matches[0]!;
    const itemIssues = byAbility.get(item.name) ?? [];
    const values = finding.message.match(/Expected (-?\d+(?:\.\d+)?), got (-?\d+(?:\.\d+)?|undefined)\./u);
    const isSave = finding.kind === 'ACTOR_SAVE_DC_DRIFT' && values;
    itemIssues.push(isSave ? {
      label: '豁免难度', source: 'DC ' + values[1],
      compact: '原文 ' + values[1] + ' / 导入后 ' + (values[2] === 'undefined' ? '未填写' : values[2]),
      outcome: values[2] === 'undefined' ? '活动缺少豁免难度' : '活动使用 DC ' + values[2],
      next: '对照来源。导入后可在角色卡打开这项能力，在活动设置中核对豁免难度。',
      quote: finding.source ?? readFeatureQuote(feature, report?.source ?? source),
    } : {
      label: '规则待核对',
      source: finding.source ? '见此处的原文片段' : '可展开此角色的完整来源',
      quote: finding.source ?? readFeatureQuote(feature, report?.source ?? source),
      outcome: item.description || '此能力没有可预览的规则文字',
      next: '对照原文和角色卡，确认活动与跑团规则一致后再采用。技术细节见「更多」。',
    });
    byAbility.set(item.name, itemIssues);
    resolved.add(finding.field + '\n' + finding.kind);
  }

  const abilities = preview.abilities.map((ability, index) => ({
    ...ability, target:'ability-'+index, issues:byAbility.get(ability.name) ?? [],
  }));
  const rows = [...sheetStats, ...abilityScores].flatMap(stat => stat.issue ? [{
    label:stat.label, target:stat.target, summary:'原文 '+stat.issue.source+' · 导入后 '+stat.issue.outcome,
  }] : []);
  for (const ability of abilities) for (const issue of ability.issues) rows.push({
    label:ability.name+' · '+issue.label, target:ability.target,
    summary:issue.compact ?? '展开核对原文与能力说明',
  });
  const portrait = typeof actor.artifact.img === 'string' && /^(?:icons|systems|modules)\/[\w%./ -]+$/u.test(actor.artifact.img)
    ? actor.artifact.img : undefined;
  const type = record(record(system.details).type);
  const npcType = typeof type.value === 'string' ? type.value : '';
  const types: Record<string, string> = {
    aberration: '异怪', beast: '野兽', celestial: '天界生物', construct: '构装体', dragon: '龙',
    elemental: '元素生物', fey: '精类', fiend: '邪魔', giant: '巨人', humanoid: '类人生物',
    monstrosity: '怪兽', ooze: '泥怪', plant: '植物', undead: '亡灵',
  };
  return {
    portrait, subtype: [types[npcType] ?? npcType, typeof type.subtype === 'string' ? type.subtype : ''].filter(Boolean).join(' · '),
    sheetStats, abilityScores, issueRows:rows, knownCount:rows.length,
    groups: Object.entries(sectionLabels).map(([key, label]) => ({
      label, abilities: abilities.filter(ability => ability.section === key),
    })).filter(group => group.abilities.length),
    suppressResolvedFinding(finding: string) {
      if (resolved.has(finding)) return false;
      return !issues.some(issue => resolved.has(issue.field + '\n' + issue.kind)
        && finding.includes(issue.kind) && finding.includes(issue.message));
    },
    suppressResolvedIssue(issue: EncounterReviewIssue) {
      return !resolved.has(issue.field + '\n' + issue.kind);
    },
  };
}

export function encounterAbilitySection(activation: unknown, activities: unknown): string {
  const type = typeof activation === 'string' ? activation : '';
  if (activationSections[type]) return activationSections[type];
  const activations = new Set(Object.values(record(activities)).map(activity => record(record(activity).activation).type)
    .filter((value): value is string => typeof value === 'string' && value in activationSections));
  return activations.size === 1 ? activationSections[[...activations][0]!]! : 'traits';
}

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+|\/\d+)?$/u.test(value)) return undefined;
  const [numerator, denominator = '1'] = value.split('/');
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) ? result : undefined;
}

function sourceValue(source: string, pattern: RegExp): { value: number; line: string } | undefined {
  const header = source.split(/^#{1,6}\s+(?:Traits|Actions|Bonus Actions|Reactions|Legendary Actions|特性|动作|附赠动作|反应|传奇动作)\s*$/imu, 1)[0];
  const matches = header?.split(/\r?\n/u).flatMap(line => {
    const clean = line.trim().replace(/^(?:#{1,6}\s+|[-*]\s+)/u, '').replaceAll('**', '');
    const value = pattern.exec(clean)?.[1]?.replaceAll(',', '');
    const numeric = numberValue(value);
    return numeric === undefined ? [] : [{value:numeric,line:clean}];
  }) ?? [];
  return matches.length && matches.every(match => match.value === matches[0]!.value) ? matches[0] : undefined;
}

function expectedNumber(message: string): number | undefined {
  return numberValue(/Expected (-?\d+(?:\.\d+)?), got /u.exec(message)?.[1]);
}

function readFeatureQuote(feature: RecordValue, source: string): string | undefined {
  if (!Array.isArray(feature.evidence)) return undefined;
  return feature.evidence.map(record).map(entry => entry.quote)
    .find((quote): quote is string => typeof quote === 'string' && !!quote && source.includes(quote));
}
