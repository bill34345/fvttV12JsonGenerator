import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type {
  CanonicalActorSource,
  CanonicalActorSourceWarning,
} from '@fvtt-json-generator/contracts/canonical-actor';
import type { CrawledTopicRecord } from '../types';

export interface PlaintextRenderWarning {
  topicId: string;
  code: string;
  message: string;
}

export interface PlaintextRenderResult {
  markdown: string;
  warnings: PlaintextRenderWarning[];
  heading: string;
  chineseName: string;
  englishName: string;
}

export interface CanonicalActorRenderResult extends CanonicalActorSource {
  heading: string;
  chineseName: string;
  englishName: string;
}

interface RenderSource {
  statText: string;
  loreText?: string;
  title?: string;
  imageUrls: string[];
  usedRawHtml: boolean;
  statblockCandidateCount: number;
}

interface StatblockData {
  title: string;
  chineseName: string;
  englishName: string;
  taxonomy?: string;
  imageUrl?: string;
  armorClass?: string;
  initiative?: string;
  hitPoints?: string;
  speed?: string;
  abilities?: string[];
  saves?: string;
  skills?: string;
  damageVulnerabilities?: string;
  damageResistances?: string;
  damageImmunities?: string;
  conditionImmunities?: string;
  senses?: string;
  languages?: string;
  challenge?: string;
  sections: Partial<Record<SectionKey, string[]>>;
  lore?: string;
}

interface AbilityRow {
  label: string;
  score: number;
  modifier: string;
  save: string;
}

type SectionKey = 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions';

const SECTION_LABELS: Record<SectionKey, string> = {
  traits: '特性 (Traits)',
  actions: '动作 (Actions)',
  bonusActions: '附赠动作 (Bonus Actions)',
  reactions: '反应 (Reactions)',
  legendaryActions: '传奇动作 (Legendary Actions)',
};

const SECTION_ENTRY_HEADING_SOURCE = String.raw`[\u4e00-\u9fffA-Za-z'’\-（）() ，,]{1,80}?[A-Za-z][A-Za-z'’.\- ]{1,80}(?:[（(][^）)]+[）)])?。`;

const SECTION_MARKERS: Array<{ key: SectionKey; pattern: RegExp }> = [
  { key: 'traits', pattern: /特(?:质|性)\s*Traits/i },
  { key: 'traits', pattern: new RegExp(`特(?:质|性)(?=\\s*${SECTION_ENTRY_HEADING_SOURCE})`) },
  { key: 'actions', pattern: /动作\s*Actions/i },
  { key: 'actions', pattern: new RegExp(`(?<!附赠)(?<!传奇)动作(?=\\s*${SECTION_ENTRY_HEADING_SOURCE})`) },
  { key: 'bonusActions', pattern: /附赠动作\s*Bonus Actions/i },
  { key: 'bonusActions', pattern: new RegExp(`附赠动作(?=\\s*${SECTION_ENTRY_HEADING_SOURCE})`) },
  { key: 'reactions', pattern: /反应\s*Reactions/i },
  { key: 'reactions', pattern: new RegExp(`反应(?=\\s*${SECTION_ENTRY_HEADING_SOURCE})`) },
  { key: 'legendaryActions', pattern: /传奇动作\s*Legendary Actions/i },
  { key: 'legendaryActions', pattern: new RegExp(`传奇动作(?=\\s*${SECTION_ENTRY_HEADING_SOURCE})`) },
];

const SIZE_ENGLISH: Record<string, string> = {
  微型: 'Tiny',
  小型: 'Small',
  中型: 'Medium',
  大型: 'Large',
  巨型: 'Huge',
  超巨型: 'Gargantuan',
};

const TYPE_ENGLISH: Record<string, string> = {
  异怪: 'Aberration',
  野兽: 'Beast',
  天界生物: 'Celestial',
  构装体: 'Construct',
  龙: 'Dragon',
  元素: 'Elemental',
  精类: 'Fey',
  妖精: 'Fey',
  邪魔: 'Fiend',
  巨人: 'Giant',
  类人生物: 'Humanoid',
  怪物: 'Monstrosity',
  怪兽: 'Monstrosity',
  软泥怪: 'Ooze',
  植物: 'Plant',
  亡灵: 'Undead',
};

const ALIGNMENT_ENGLISH: Record<string, string> = {
  无阵营: 'Unaligned',
  守序善良: 'Lawful Good',
  中立善良: 'Neutral Good',
  混乱善良: 'Chaotic Good',
  守序中立: 'Lawful Neutral',
  绝对中立: 'Neutral',
  中立: 'Neutral',
  混乱中立: 'Chaotic Neutral',
  守序邪恶: 'Lawful Evil',
  中立邪恶: 'Neutral Evil',
  混乱邪恶: 'Chaotic Evil',
};

const DAMAGE_TERMS = [
  '强酸',
  '钝击',
  '寒冷',
  '火焰',
  '力场',
  '闪电',
  '黯蚀',
  '死灵',
  '穿刺',
  '毒素',
  '毒性',
  '心灵',
  '光耀',
  '挥砍',
  '雷鸣',
];

const CONDITION_TERMS = [
  '目盲',
  '魅惑',
  '耳聋',
  '力竭',
  '恐慌',
  '擒抱',
  '失能',
  '隐形',
  '麻痹',
  '石化',
  '中毒',
  '倒地',
  '束缚',
  '震慑',
  '昏迷',
];

const KNOWN_LABELS =
  'AC|先攻|HP|速度|调整|豁免|技能|易伤|抗性|免疫|感官|语言|CR|特质Traits|特性Traits|动作Actions|附赠动作Bonus Actions|反应Reactions|传奇动作Legendary Actions';
const SECTION_END_LABELS = [
  '特质Traits',
  '特性Traits',
  '特质',
  '特性',
  '动作Actions',
  '动作',
  '附赠动作Bonus Actions',
  '附赠动作',
  '反应Reactions',
  '反应',
  '传奇动作Legendary Actions',
  '传奇动作',
];
const ABILITY_LABELS = ['力量', '敏捷', '体质', '智力', '感知', '魅力'];

export function renderGoddessFantasyMonsterToPlaintext(
  record: CrawledTopicRecord,
  options: { recordsDir: string },
): PlaintextRenderResult {
  return renderGoddessFantasyMonsterToPlaintextItems(record, options)[0]!;
}

export function renderGoddessFantasyMonsterToPlaintextItems(
  record: CrawledTopicRecord,
  options: { recordsDir: string },
): PlaintextRenderResult[] {
  const loadWarnings: PlaintextRenderWarning[] = [];
  const sources = loadRenderSources(record, options.recordsDir, loadWarnings);
  return sources.map((source) => renderSource(record, source, loadWarnings));
}

/**
 * Render a crawled topic directly into the standard project Actor Markdown
 * contract. The legacy/plaintext rendering is retained only as an optional
 * human-readable audit view on the same parsed source.
 */
export function renderGoddessFantasyMonsterToCanonicalSources(
  record: CrawledTopicRecord,
  options: { recordsDir: string },
): CanonicalActorRenderResult[] {
  const loadWarnings: PlaintextRenderWarning[] = [];
  const sources = loadRenderSources(record, options.recordsDir, loadWarnings);

  return sources.map((source, index) => {
    const warnings = [...loadWarnings];
    const data = parseStatblock(record, source.statText, source.imageUrls, source.loreText, source.title);

    if (!source.usedRawHtml) {
      warnings.push(warning(record, 'used-text-fallback', 'rawHtmlPath was missing or unreadable; used posts[0].text'));
    }

    if (source.statblockCandidateCount > 1) {
      warnings.push(warning(record, 'possible-multiple-statblocks', 'first post appears to contain multiple statblocks'));
    }

    for (const field of ['armorClass', 'hitPoints', 'speed', 'abilities', 'challenge'] as const) {
      if (!data[field]) {
        warnings.push(warning(record, `missing-${field}`, `could not extract ${field}`));
      }
    }

    const slug = slugifyForFileName(data.englishName || data.chineseName || data.title) || `entity-${index + 1}`;
    const sourceId = `goddessfantasy:${record.topicId}:${slug}`;
    const contractWarnings: CanonicalActorSourceWarning[] = warnings.map((entry) => ({
      code: entry.code,
      message: entry.message,
      sourceId,
    }));

    return {
      sourceId,
      sourceUrl: record.printUrl || record.url,
      fileName: `${record.topicId}__${slug}.md`,
      markdown: emitCanonicalMarkdown(data),
      auditMarkdown: emitMarkdown(data),
      imageUrls: unique(source.imageUrls),
      status: contractWarnings.length > 0 ? 'needs_review' : 'ok',
      warnings: contractWarnings,
      metadata: {
        site: record.site,
        boardId: record.boardId,
        topicId: record.topicId,
        entityId: slug,
        title: record.title,
        chineseName: data.chineseName,
        englishName: data.englishName,
        rawHtmlPath: record.rawHtmlPath,
      },
      heading: data.title,
      chineseName: data.chineseName,
      englishName: data.englishName,
    };
  });
}

function renderSource(
  record: CrawledTopicRecord,
  source: RenderSource,
  loadWarnings: PlaintextRenderWarning[],
): PlaintextRenderResult {
  const warnings = [...loadWarnings];
  const data = parseStatblock(record, source.statText, source.imageUrls, source.loreText, source.title);

  if (!source.usedRawHtml) {
    warnings.push(warning(record, 'used-text-fallback', 'rawHtmlPath was missing or unreadable; used posts[0].text'));
  }

  if (source.statblockCandidateCount > 1) {
    warnings.push(warning(record, 'possible-multiple-statblocks', 'first post appears to contain multiple statblocks'));
  }

  for (const field of ['armorClass', 'hitPoints', 'speed', 'abilities', 'challenge'] as const) {
    if (!data[field]) {
      warnings.push(warning(record, `missing-${field}`, `could not extract ${field}`));
    }
  }

  return {
    markdown: emitMarkdown(data),
    warnings,
    heading: data.title,
    chineseName: data.chineseName,
    englishName: data.englishName,
  };
}

function loadRenderSources(
  record: CrawledTopicRecord,
  recordsDir: string,
  warnings: PlaintextRenderWarning[],
): RenderSource[] {
  const htmlPath = record.rawHtmlPath
    ? isAbsolute(record.rawHtmlPath)
      ? record.rawHtmlPath
      : join(recordsDir, record.rawHtmlPath)
    : '';

  if (htmlPath && existsSync(htmlPath)) {
    try {
      const html = readFileSync(htmlPath, 'utf-8');
      const $ = cheerio.load(html);
      const firstBody = $('#posts .postbody').first();
      if (firstBody.length > 0) {
        const bodyImages = extractImages(firstBody);
        const bodyText = htmlToText(firstBody.html() ?? '');
        const tableSources = extractTableSources($, firstBody);
        if (tableSources.length > 0) {
          return tableSources.map((tableSource) => ({
            statText: tableSource.statText,
            loreText: tableSource.loreText,
            title: tableSource.title,
            imageUrls: bodyImages.concat(record.imageUrls ?? []),
            usedRawHtml: true,
            statblockCandidateCount: tableSource.statblockCandidateCount,
          }));
        }

        const split = splitBodySource(bodyText, record);
        return [{
          statText: split.statText,
          loreText: split.loreText,
          imageUrls: bodyImages.concat(record.imageUrls ?? []),
          usedRawHtml: true,
          statblockCandidateCount: countStatblockCandidates(split.statText),
        }];
      }
      warnings.push(warning(record, 'missing-postbody', 'raw HTML did not contain #posts .postbody'));
    } catch (error) {
      warnings.push(warning(record, 'raw-html-read-failed', errorMessage(error)));
    }
  }

  const firstPost = record.posts.find((post) => post.index === 0) ?? record.posts[0];
  const split = splitBodySource(firstPost?.text ?? '', record);
  return [{
    statText: split.statText,
    loreText: split.loreText,
    imageUrls: (firstPost?.imageUrls ?? []).concat(record.imageUrls ?? []),
    usedRawHtml: false,
    statblockCandidateCount: countStatblockCandidates(split.statText),
  }];
}

function parseStatblock(
  record: CrawledTopicRecord,
  text: string,
  imageUrls: string[],
  loreText?: string,
  titleOverride?: string,
): StatblockData {
  const normalized = normalizeText(text);
  const names = titleOverride
    ? extractLeadingBilingualName(normalized) ?? parseNames(titleOverride, normalized)
    : parseNames(record.title, normalized);
  const prelude = sliceBeforeFirstSection(normalized);
  const abilityRows = parseAbilityRows(prelude);
  const immunity = splitImmunities(extractField(prelude, '免疫', ['感官', '语言', 'CR', ...SECTION_END_LABELS]));
  const statblockNames = parseNames('', normalized);
  const statblockName =
    statblockNames.englishName && statblockNames.heading !== names.heading
      ? statblockNames.heading
      : undefined;

  return {
    title: names.heading,
    chineseName: names.chineseName,
    englishName: names.englishName,
    taxonomy: parseTaxonomy(prelude),
    imageUrl: firstHttpImage(imageUrls) ?? firstHttpImage([normalized]),
    armorClass: extractSimple(prelude, /AC\s*([0-9]+(?:\s*[（(][^）)]+[）)])?)/i),
    initiative: extractSimple(prelude, /先攻\s*([+-]?\d+(?:\s*[（(][^）)]+[）)])?)/),
    hitPoints: parseHitPoints(prelude),
    speed: normalizeUnits(extractField(prelude, '速度', ['调整', '豁免', '技能', '易伤', '抗性', '免疫', '感官', '语言', 'CR', ...ABILITY_LABELS])),
    abilities: parseAbilities(abilityRows),
    saves: parseSaves(abilityRows),
    skills: extractField(prelude, '技能', ['易伤', '抗性', '免疫', '感官', '语言', 'CR', ...SECTION_END_LABELS]),
    damageVulnerabilities: extractField(prelude, '易伤', ['抗性', '免疫', '感官', '语言', 'CR', ...SECTION_END_LABELS]),
    damageResistances: extractField(prelude, '抗性', ['免疫', '感官', '语言', 'CR', ...SECTION_END_LABELS]),
    damageImmunities: immunity.damage,
    conditionImmunities: immunity.condition,
    senses: extractSenses(prelude),
    languages: extractField(prelude, '语言', ['CR', ...SECTION_END_LABELS]),
    challenge: parseChallenge(prelude),
    sections: parseSections(normalized),
    lore: buildLore(loreText, statblockName),
  };
}

function emitMarkdown(data: StatblockData): string {
  const lines: string[] = [`# **${data.title}**`, ''];

  if (data.taxonomy) {
    lines.push(`_${data.taxonomy}_`, '');
  }

  if (data.imageUrl) {
    lines.push(`![${data.chineseName}](${data.imageUrl})`, '');
  }

  pushLabeledLine(lines, '护甲等级 (Armor Class)', data.armorClass);
  pushLabeledLine(lines, '先攻 (Initiative)', data.initiative);
  pushLabeledLine(lines, '生命值 (Hit Points)', data.hitPoints);
  pushLabeledLine(lines, '速度 (Speed)', data.speed);

  if (data.abilities?.length === 6) {
    lines.push('', '|**STR**|**DEX**|**CON**|**INT**|**WIS**|**CHA**|');
    lines.push('|---|---|---|---|---|---|');
    lines.push(`|${data.abilities.join('|')}|`);
  }

  lines.push('');
  pushLabeledLine(lines, '豁免 (Saves)', data.saves);
  pushLabeledLine(lines, '技能 (Skills)', data.skills);
  pushLabeledLine(lines, '伤害易伤 (Damage Vulnerabilities)', data.damageVulnerabilities);
  pushLabeledLine(lines, '伤害抗性 (Damage Resistances)', data.damageResistances);
  pushLabeledLine(lines, '伤害免疫 (Damage Immunities)', data.damageImmunities);
  pushLabeledLine(lines, '状态免疫 (Condition Immunities)', data.conditionImmunities);
  pushLabeledLine(lines, '感官 (Senses)', data.senses);
  pushLabeledLine(lines, '语言 (Languages)', data.languages);
  pushLabeledLine(lines, '挑战等级 (Challenge)', data.challenge);

  if (data.lore) {
    lines.push('', data.lore);
  }

  for (const key of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as SectionKey[]) {
    const entries = data.sections[key];
    if (!entries || entries.length === 0) continue;
    lines.push('', '---', '', `### ${SECTION_LABELS[key]}`, '');
    for (const entry of entries) {
      lines.push(formatEntry(entry));
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function emitCanonicalMarkdown(data: StatblockData): string {
  const taxonomy = canonicalTaxonomy(data.taxonomy);
  const lines = [
    '---',
    'layout: creature',
    `type: ${quoteYaml(taxonomy.creatureType ?? 'npc')}`,
    `name: ${quoteYaml(data.englishName || data.title)}`,
  ];

  pushYamlLine(lines, 'size', taxonomy.size);
  pushYamlLine(lines, 'alignment', taxonomy.alignment);
  pushYamlLine(lines, 'img', data.imageUrl);
  pushYamlLine(lines, 'initiative', data.initiative);
  pushYamlLine(lines, 'armor_class', data.armorClass);
  pushYamlLine(lines, 'hit_points', data.hitPoints);
  pushYamlLine(lines, 'speed', data.speed);
  if (data.abilities?.length === 6) {
    for (const [key, value] of ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((key, index) => [key, data.abilities![index]!] as const)) {
      pushYamlLine(lines, key, value);
    }
  }
  pushYamlLine(lines, 'saving_throws', normalizeSavesForCanonical(data.saves));
  pushYamlLine(lines, 'skills', data.skills);
  pushYamlLine(lines, 'damage_vulnerabilities', data.damageVulnerabilities);
  pushYamlLine(lines, 'damage_resistances', data.damageResistances);
  pushYamlLine(lines, 'damage_immunities', data.damageImmunities);
  pushYamlLine(lines, 'condition_immunities', data.conditionImmunities);
  pushYamlLine(lines, 'senses', data.senses);
  pushYamlLine(lines, 'languages', data.languages);
  pushYamlLine(lines, 'challenge', data.challenge);
  lines.push('---', '');

  if (data.lore) lines.push(data.lore, '');

  const sectionLabels: Record<SectionKey, string> = {
    traits: 'Traits',
    actions: 'Actions',
    bonusActions: 'Bonus Actions',
    reactions: 'Reactions',
    legendaryActions: 'Legendary Actions',
  };
  for (const key of ['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as SectionKey[]) {
    const entries = data.sections[key];
    if (!entries || entries.length === 0) continue;
    lines.push(`## ${sectionLabels[key]}`, '');
    for (const entry of entries) lines.push(formatEntry(entry));
    lines.push('');
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function pushYamlLine(lines: string[], key: string, value: string | undefined): void {
  if (value === undefined || value.trim() === '') return;
  lines.push(`${key}: ${quoteYaml(value)}`);
}

function quoteYaml(value: string): string {
  return JSON.stringify(value.replace(/\r?\n/g, ' ').trim());
}

function canonicalTaxonomy(value: string | undefined): {
  size?: string;
  creatureType?: string;
  alignment?: string;
} {
  if (!value) return {};
  const [creaturePart, alignmentPart] = value.split('，', 2);
  const englishCreature = creaturePart?.match(/\(([^)]+)\)/)?.[1]?.trim();
  const englishSize = englishCreature?.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i)?.[1];
  const creatureType = englishCreature && englishSize
    ? englishCreature.slice(englishSize.length).trim()
    : undefined;
  const chineseSize = Object.keys(SIZE_ENGLISH).find((key) => creaturePart?.startsWith(key));
  const alignment = alignmentPart?.match(/\(([^)]+)\)/)?.[1]?.trim() || alignmentPart?.trim();
  return {
    size: englishSize || (chineseSize ? SIZE_ENGLISH[chineseSize] : undefined),
    creatureType,
    alignment,
  };
}

function normalizeSavesForCanonical(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const labels: Record<string, string> = {
    力量: 'Str',
    敏捷: 'Dex',
    体质: 'Con',
    智力: 'Int',
    感知: 'Wis',
    魅力: 'Cha',
  };
  return value.replace(/力量|敏捷|体质|智力|感知|魅力/g, (label) => labels[label] ?? label);
}

function slugifyForFileName(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function extractTableSources(
  $: cheerio.CheerioAPI,
  body: cheerio.Cheerio<AnyNode>,
): Array<{ statText: string; loreText?: string; title?: string; statblockCandidateCount: number }> {
  const cells: Array<{ text: string; isStat: boolean }> = [];
  body.find('table.bbc_table td').each((_, element) => {
    const html = $.html(element);
    const text = htmlToText(html);
    if (!text) return;
    cells.push({ text, isStat: isStatblockText(text) });
  });

  const statIndexes = cells
    .map((cell, index) => cell.isStat ? index : -1)
    .filter((index) => index >= 0);

  return statIndexes.map((statIndex) => {
    const statText = cells[statIndex]!.text;
    const nextLore = cells.slice(statIndex + 1).find((cell) => !cell.isStat)?.text;
    const previousLore = cells.slice(0, statIndex).reverse().find((cell) => !cell.isStat)?.text;
    const names = extractLeadingBilingualName(statText);
    return {
      statText,
      loreText: cleanLoreText(nextLore ?? previousLore),
      title: names ? `${names.chineseName}${names.englishName}` : undefined,
      statblockCandidateCount: 1,
    };
  });
}

function extractLeadingBilingualName(text: string): { heading: string; chineseName: string; englishName: string } | undefined {
  const normalized = normalizeText(text);
  const acIndex = normalized.search(/\bAC\s*\d+/i);
  const prefix = (acIndex > 0 ? normalized.slice(0, acIndex) : normalized).trim();
  const match = prefix.match(/^([\u4e00-\u9fff][\u4e00-\u9fff·・、路\s-]{0,40}?)([A-Za-z][A-Za-z0-9'’?,\- ]{1,80})(?=\s*[\u4e00-\u9fff]|$)/);
  if (!match?.[1] || !match[2]) return undefined;

  const chineseName = match[1].trim();
  const englishName = match[2].trim();
  return {
    heading: `${chineseName} (${englishName})`,
    chineseName,
    englishName,
  };
}

function splitBodySource(text: string, record: CrawledTopicRecord): { statText: string; loreText?: string } {
  const normalized = normalizeText(text);
  const statStart = findStatblockStart(normalized, record);
  if (statStart <= 0) {
    return { statText: truncateTrailingSourceCopies(normalized) };
  }

  return {
    statText: truncateTrailingSourceCopies(normalized.slice(statStart).trim()),
    loreText: cleanLeadingTranslatorCredit(normalized.slice(0, statStart), record),
  };
}

function cleanLeadingTranslatorCredit(loreText: string, record: CrawledTopicRecord): string {
  const names = splitBilingualName(record.title) ?? parseNames(record.title, '');
  const candidates = [names.chineseName, names.englishName].filter(Boolean);
  const translatorMatch = loreText.match(/\u8bd1\u8005@/);
  if (!translatorMatch?.index && translatorMatch?.index !== 0) return loreText;

  for (const candidate of candidates) {
    const index = loreText.indexOf(candidate);
    if (index > translatorMatch.index) {
      return loreText.slice(index);
    }
  }

  return loreText.replace(/^\u8bd1\u8005@[^\s,.:;!?，。:：；！？]{1,8}/, '');
}

function findStatblockStart(text: string, record: CrawledTopicRecord): number {
  const acMatch = /\bAC\s*\d+/i.exec(text);
  if (!acMatch?.index) return 0;

  const names = splitBilingualName(record.title) ?? parseNames(record.title, '');
  const candidates = [names.englishName, names.chineseName].filter(Boolean);
  let best = -1;

  for (const candidate of candidates) {
    const pattern = new RegExp(escapeRegExp(candidate).replace(/\s+/g, '\\s*'), 'gi');
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? -1;
      if (index >= 0 && index < acMatch.index) {
        best = Math.max(best, index);
      }
    }
  }

  if (best === -1) return 0;

  const before = text.slice(0, best);
  const chineseStart = before.search(/[\u4e00-\u9fff][\u4e00-\u9fff·・（）() 　]*$/);
  return chineseStart === -1 ? best : chineseStart;
}

function isStatblockText(text: string): boolean {
  return /\bAC\s*\d+/i.test(text) && /\bHP\s*\d+/i.test(text) && /\bCR\s*[0-9/]+/i.test(text);
}

function truncateTrailingSourceCopies(value: string): string {
  const sectionStarts = SECTION_MARKERS
    .map((marker) => marker.pattern.exec(value)?.index)
    .filter((index): index is number => index !== undefined);
  if (sectionStarts.length === 0) return value;

  const firstSectionStart = Math.min(...sectionStarts);
  const afterSection = value.slice(firstSectionStart);
  const trailingImage = afterSection.search(/\(https?:\/\/[^)]+\)/i);
  if (trailingImage === -1) return value;

  return value.slice(0, firstSectionStart + trailingImage).trim();
}

function parseNames(title: string, text: string): { heading: string; chineseName: string; englishName: string } {
  const stripped = title.replace(/^【怪物】/, '').trim();
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean);
  const candidate =
    firstLine &&
    firstLine.length <= 80 &&
    !/^https?:\/\//i.test(firstLine) &&
    !/^译者/.test(firstLine) &&
    !/\bAC\b|HP|速度/.test(firstLine)
      ? firstLine
      : stripped;

  for (const value of [stripped, candidate]) {
    const parsed = splitBilingualName(value);
    if (parsed) return parsed;
  }

  const cleaned = stripped || candidate.replace(/^【怪物】/, '').replace(/\s+/g, ' ').trim();
  return { heading: cleaned, chineseName: cleaned, englishName: '' };
}

function splitBilingualName(value: string): { heading: string; chineseName: string; englishName: string } | undefined {
  const cleaned = value.replace(/^【怪物】/, '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(.+?)([A-Za-z][A-Za-z0-9'’.,\- ]*)$/);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  const chineseName = match[1].trim();
  const englishName = match[2].trim();
  return {
    heading: `${chineseName} (${englishName})`,
    chineseName,
    englishName,
  };
}

function parseTaxonomy(prelude: string): string | undefined {
  const match = prelude.match(
    /(微型|小型|中型|大型|巨型|超巨型)([^，,。]{1,20})[，,]\s*([^A-Z\n]{1,20}?)(?=\s*(?:AC|先攻|HP|速度))/,
  );
  if (!match?.[1] || !match[2] || !match[3]) return undefined;

  const size = match[1].trim();
  const type = match[2].trim();
  const alignment = match[3].trim();
  const sizeEnglish = SIZE_ENGLISH[size];
  const typeEnglish = TYPE_ENGLISH[type];
  const alignmentEnglish = ALIGNMENT_ENGLISH[alignment];
  const taxonomy = sizeEnglish && typeEnglish
    ? `${size}${type} (${sizeEnglish} ${typeEnglish})`
    : `${size}${type}`;
  const alignmentPart = alignmentEnglish ? `${alignment} (${alignmentEnglish})` : alignment;
  return `${taxonomy}，${alignmentPart}`;
}

function parseHitPoints(prelude: string): string | undefined {
  const match = prelude.match(/HP\s*([0-9]+(?:\s*[（(][^）)]+[）)])?)/i);
  return normalizeFormulaSpacing(match?.[1]?.trim().replace(/（/g, '(').replace(/）/g, ')'));
}

function parseChallenge(prelude: string): string | undefined {
  const match = prelude.match(/CR\s*([0-9/]+)\s*[（(]\s*XP\s*([0-9,]+)\s*[；;]\s*PB\s*\+?(\d+)\s*[）)]/i);
  if (match?.[1] && match[2] && match[3]) {
    return `${match[1]}（${match[2]} XP）熟练加值 +${match[3]}`;
  }

  const simple = prelude.match(/CR\s*([0-9/]+)/i);
  return simple?.[1]?.trim();
}

function parseAbilityRows(prelude: string): AbilityRow[] {
  const labels = ['力量', '敏捷', '体质', '智力', '感知', '魅力'];
  return labels.flatMap((label) => {
    const match = prelude.match(new RegExp(`${label}\\s*(\\d+)\\s*([+-]\\d+)\\s*([+-]\\d+)`));
    if (!match?.[1] || !match[2] || !match[3]) return [];
    return [{
      label,
      score: Number.parseInt(match[1], 10),
      modifier: match[2],
      save: match[3],
    }];
  });
}

function parseAbilities(rows: AbilityRow[]): string[] | undefined {
  const values = rows.map((row) => `${row.score} (${row.modifier})`);

  if (values.some((value) => !value)) return undefined;
  if (values.length !== 6) return undefined;
  return values as string[];
}

function parseSaves(rows: AbilityRow[]): string | undefined {
  const saves = rows
    .filter((row) => row.save !== row.modifier)
    .map((row) => `${row.label} ${row.save}`);
  return saves.length > 0 ? saves.join('，') : undefined;
}

function parseSections(text: string): Partial<Record<SectionKey, string[]>> {
  const sections: Partial<Record<SectionKey, string[]>> = {};
  const rawMarkerMatches = SECTION_MARKERS
    .map((marker) => {
      const match = marker.pattern.exec(text);
      return match?.index === undefined ? undefined : { key: marker.key, index: match.index, length: match[0].length };
    })
    .filter(Boolean)
    .sort((a, b) => a!.index - b!.index || b!.length - a!.length) as Array<{ key: SectionKey; index: number; length: number }>;
  const markerMatches = rawMarkerMatches.filter((marker, index) => index === 0 || marker.index !== rawMarkerMatches[index - 1]!.index);

  for (let index = 0; index < markerMatches.length; index++) {
    const current = markerMatches[index]!;
    const next = markerMatches[index + 1];
    const content = text.slice(current.index + current.length, next?.index ?? text.length);
    const entries = splitSectionEntries(removeTrailingLore(content));
    if (entries.length > 0) {
      sections[current.key] = entries;
    }
  }

  return sections;
}

function splitSectionEntries(value: string): string[] {
  const cleaned = normalizeText(value)
    .replace(new RegExp(`^(?:${KNOWN_LABELS})\\s*`, 'i'), '')
    .trim();
  if (!cleaned) return [];

  const entryPattern = /[\u4e00-\u9fffA-Za-z'’\-（）() ，,]{1,80}?[A-Za-z][A-Za-z'’.\- ]{1,80}(?:[（(][^）)]+[）)])?。/g;
  const matches = [...cleaned.matchAll(entryPattern)]
    .filter((match) => match.index !== undefined && isSectionEntryBoundary(cleaned, match.index));
  if (matches.length === 0) return [cleaned];

  const entries: string[] = [];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!;
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? cleaned.length;
    const entry = cleaned.slice(start, end).trim();
    if (entry) entries.push(entry);
  }

  return entries.length > 0 ? entries : [cleaned];
}

function isSectionEntryBoundary(text: string, index: number | undefined): boolean {
  if (index === undefined) return false;
  if (index <= 0) return true;

  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const previous = text[cursor];
    if (!previous || /\s/.test(previous)) continue;
    return /[。；;：:!?！？]/.test(previous);
  }
  return true;
}

function formatEntry(entry: string): string {
  const match = entry.match(/^(.{1,100}?。)([\s\S]*)$/);
  if (!match?.[1]) return `- ${entry}`;
  return `- **${formatBilingualName(match[1].replace(/。$/, ''))}**：${normalizeReadableText(match[2]?.trim() ?? '')}`.trimEnd();
}

function formatBilingualName(value: string): string {
  const match = value.match(/^(.+?)([A-Za-z][A-Za-z0-9'’.,\- ]*)([（(][^）)]+[）)])?$/);
  if (!match?.[1] || !match[2]) return value.trim();

  const chinese = match[1].trim();
  const english = match[2].trim();
  const qualifier = match[3]?.trim() ?? '';
  return `${chinese} (${english})${qualifier}`;
}

function buildLore(loreText: string | undefined, statblockName: string | undefined): string | undefined {
  const parts = [statblockName, cleanLoreText(loreText)].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join('\n').slice(0, 1200).trim() : undefined;
}

function removeTrailingLore(value: string): string {
  const loreStart = value.search(/(?:栖息地|宝藏|真正|这种|它们)/);
  if (loreStart <= 0) return value;
  return value.slice(0, loreStart);
}

function splitImmunities(value: string | undefined): { damage?: string; condition?: string } {
  if (!value) return {};
  const parts = value.split(/[；;]/).map((part) => part.trim()).filter(Boolean);
  const damage = parts.flatMap((part) => collectTerms(part, DAMAGE_TERMS));
  const condition = parts.flatMap((part) => collectTerms(part, CONDITION_TERMS));
  return {
    damage: unique(damage).join('，') || undefined,
    condition: unique(condition).join('，') || undefined,
  };
}

function collectTerms(value: string, terms: string[]): string[] {
  return terms.filter((term) => value.includes(term));
}

function extractField(text: string, label: string, endLabels: string[]): string | undefined {
  const pattern = new RegExp(`${escapeRegExp(label)}\\s*([\\s\\S]*?)(?=\\s*(?:${endLabels.map(escapeRegExp).join('|')})|$)`, 'i');
  const match = text.match(pattern);
  return cleanValue(match?.[1]);
}

function extractSenses(text: string): string | undefined {
  const labels = ['感官', '感知'];
  const endLabels = ['语言', 'CR', ...SECTION_END_LABELS];
  const candidates: string[] = [];

  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*([\\s\\S]*?)(?=\\s*(?:${endLabels.map(escapeRegExp).join('|')})|$)`, 'gi');
    for (const match of text.matchAll(pattern)) {
      let value = cleanValue(match[1]);
      if (label === '感知' && value) {
        const nestedSenseLabel = value.lastIndexOf('感知');
        if (nestedSenseLabel >= 0) {
          value = cleanValue(value.slice(nestedSenseLabel + '感知'.length));
        }
      }
      if (value) candidates.push(value);
    }
  }

  return candidates.find((value) => /被动|视觉|盲视|暗视|真实视觉|震颤|嗅觉|察觉/i.test(value)) ?? candidates.at(-1);
}

function extractSimple(text: string, pattern: RegExp): string | undefined {
  return cleanValue(text.match(pattern)?.[1]);
}

function pushLabeledLine(lines: string[], label: string, value: string | undefined): void {
  if (!value) return;
  lines.push(`**${label}**：${value}  `);
}

function sliceBeforeFirstSection(text: string): string {
  const indexes = SECTION_MARKERS
    .map((marker) => marker.pattern.exec(text)?.index)
    .filter((index): index is number => index !== undefined);
  const end = indexes.length > 0 ? Math.min(...indexes) : text.length;
  return text.slice(0, end);
}

function countStatblockCandidates(text: string): number {
  const normalized = normalizeText(text);
  const candidatePattern = /\bAC\s*\d+[\s\S]{0,500}?\bHP\s*\d+[\s\S]{0,900}?\bCR\s*[0-9/]+/gi;
  const matches = normalized.match(candidatePattern)?.length ?? 0;
  return matches > 0 ? matches : isStatblockText(normalized) ? 1 : 0;
}

function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|table|li|h[1-6])>/gi, '\n')
    .replace(/<\/td>/gi, '\n');
  return normalizeText(cheerio.load(`<div>${withBreaks}</div>`)('div').text());
}

function extractImages(body: cheerio.Cheerio<AnyNode>): string[] {
  const images: string[] = [];
  body.find('img[src]').each((_, element) => {
    const src = (element as { attribs?: Record<string, string> }).attribs?.src;
    if (src) images.push(src);
  });
  return unique(images);
}

function firstHttpImage(values: string[]): string | undefined {
  for (const value of values) {
    const match = value.match(/https?:\/\/\S+?\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/i);
    if (match?.[0]) return match[0].replace(/[)）。，,]+$/, '');
  }
  return undefined;
}

function cleanValue(value: string | undefined): string | undefined {
  const cleaned = (normalizeReadableText(value ?? '') ?? '').replace(/^[：:\s]+/, '').replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

function cleanLoreText(value: string | undefined): string | undefined {
  const cleaned = normalizeText(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      !/^\(https?:\/\/[^)]+\)$/i.test(line) &&
      !isStatblockText(line) &&
      !/^(AC|HP|CR|速度|力量|敏捷|体质|智力|感知|魅力|特质Traits|动作Actions)\b/.test(line)
    )
    .map(normalizeReadableText)
    .join('\n')
    .trim();
  return cleaned || undefined;
}

function normalizeFormulaSpacing(value: string | undefined): string | undefined {
  return value
    ?.replace(/\s*\(\s*/g, ' (')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*\+\s*/g, '+')
    .trim();
}

function normalizeUnits(value: string | undefined): string | undefined {
  return normalizeReadableText(value);
}

function normalizeReadableText(value: string | undefined): string | undefined {
  return value
    ?.replace(/\[\/?size[^\]]*\]/gi, '')
    .replace(/(飞行|攀爬|游泳|触及|射程|心灵感应|真实视觉|黑暗视觉|盲视|震颤感知)(\d+)/g, '$1 $2')
    .replace(/(\d+)\s*尺/g, '$1 尺')
    .replace(/([\u4e00-\u9fff])(\d+ 尺)/g, '$1 $2')
    .replace(/\s*\.\.+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\[\/?size[^\]]*\]/gi, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[（]/g, '（')
    .replace(/[）]/g, '）')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}

function warning(record: CrawledTopicRecord, code: string, message: string): PlaintextRenderWarning {
  return { topicId: record.topicId, code, message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
