import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import yaml from 'js-yaml';
import { PlainTextAuditWorkflow } from './plaintextAudit';
import {
  OpenAICompatibleTranslator,
  createTranslationConfigFromEnv,
} from '../translation';
import { normalizeChineseText } from '../parser/utils/normalize';

const SECTION_ORDER = ['特性', '动作', '附赠动作', '反应', '传奇动作'] as const;
type SectionName = (typeof SECTION_ORDER)[number];

const SECTION_LABELS: Array<{ pattern: RegExp; name: SectionName }> = [
  { pattern: /^\s*(?:###\s*)?传奇动作(?:\s*\([^)]*\))?\s*$/i, name: '传奇动作' },
  { pattern: /^\s*(?:###\s*)?附赠动作(?:\s*\([^)]*\))?\s*$/i, name: '附赠动作' },
  { pattern: /^\s*(?:###\s*)?反应(?:\s*\([^)]*\))?\s*$/i, name: '反应' },
  { pattern: /^\s*(?:###\s*)?特性(?:\s*\([^)]*\))?\s*$/i, name: '特性' },
  { pattern: /^\s*(?:###\s*)?动作(?:\s*\([^)]*\))?\s*$/i, name: '动作' },
  { pattern: /^\s*(?:###\s*)?legendary actions\s*$/i, name: '传奇动作' },
  { pattern: /^\s*(?:###\s*)?bonus actions\s*$/i, name: '附赠动作' },
  { pattern: /^\s*(?:###\s*)?reactions\s*$/i, name: '反应' },
  { pattern: /^\s*(?:###\s*)?traits\s*$/i, name: '特性' },
  { pattern: /^\s*(?:###\s*)?actions\s*$/i, name: '动作' },
];

const SIZE_MAP: Record<string, string> = {
  tiny: '微型',
  small: '小型',
  medium: '中型',
  large: '大型',
  huge: '巨型',
  gargantuan: '超巨型',
};

const CREATURE_TYPE_MAP: Record<string, string> = {
  aberration: '异怪',
  beast: '野兽',
  celestial: '天界生物',
  construct: '构装体',
  dragon: '龙',
  elemental: '元素',
  fey: '精类',
  fiend: '邪魔',
  giant: '巨人',
  humanoid: '类人生物',
  monstrosity: '怪物',
  ooze: '软泥怪',
  plant: '植物',
  undead: '亡灵',
};

const ALIGNMENT_MAP: Record<string, string> = {
  unaligned: '无阵营',
  'lawful good': '守序善良',
  'neutral good': '中立善良',
  'chaotic good': '混乱善良',
  'lawful neutral': '守序中立',
  neutral: '绝对中立',
  'chaotic neutral': '混乱中立',
  'lawful evil': '守序邪恶',
  'neutral evil': '中立邪恶',
  'chaotic evil': '混乱邪恶',
};

const DAMAGE_TYPE_MAP: Record<string, string> = {
  acid: 'acid',
  bludgeoning: 'bludgeoning',
  cold: 'cold',
  fire: 'fire',
  force: 'force',
  lightning: 'lightning',
  necrotic: 'necrotic',
  piercing: 'piercing',
  poison: 'poison',
  psychic: 'psychic',
  radiant: 'radiant',
  slashing: 'slashing',
  thunder: 'thunder',
};

const CONDITION_MAP: Record<string, string> = {
  blinded: 'blinded',
  charmed: 'charmed',
  deafened: 'deafened',
  exhaustion: 'exhaustion',
  frightened: 'frightened',
  grappled: 'grappled',
  incapacitated: 'incapacitated',
  invisible: 'invisible',
  paralyzed: 'paralyzed',
  petrified: 'petrified',
  poisoned: 'poisoned',
  prone: 'prone',
  restrained: 'restrained',
  stunned: 'stunned',
  unconscious: 'unconscious',
  dazed: 'dazed',
};

const LANGUAGE_MAP: Record<string, string> = {
  common: 'common',
  'deep speech': 'deep',
  draconic: 'draconic',
  dwarvish: 'dwarvish',
  elvish: 'elvish',
  giant: 'giant',
  goblin: 'goblin',
  infernal: 'infernal',
  orc: 'orc',
  primordial: 'primordial',
  telepathy: 'telepathy',
  undercommon: 'undercommon',
};

const ABILITY_LABEL_MAP: Record<string, string> = {
  str: '力量',
  strength: '力量',
  力量: '力量',
  dex: '敏捷',
  dexterity: '敏捷',
  敏捷: '敏捷',
  con: '体质',
  constitution: '体质',
  体质: '体质',
  int: '智力',
  intelligence: '智力',
  智力: '智力',
  wis: '感知',
  wisdom: '感知',
  感知: '感知',
  cha: '魅力',
  charisma: '魅力',
  魅力: '魅力',
};

const SKILL_LABEL_MAP: Record<string, string> = {
  '察觉': '察觉',
  'perception': '察觉',
  '隐匿': '隐匿',
  'stealth': '隐匿',
  '历史': '历史',
  'history': '历史',
  '运动': '运动',
  'athletics': '运动',
  '杂技': '杂技',
  'acrobatics': '杂技',
  '驯兽': '驯兽',
  'animal handling': '驯兽',
  '奥秘': '奥秘',
  'arcana': '奥秘',
  '欺瞒': '欺瞒',
  'deception': '欺瞒',
  '洞悉': '洞悉',
  'insight': '洞悉',
  '威吓': '威吓',
  'intimidation': '威吓',
  '调查': '调查',
  'investigation': '调查',
  '医药': '医药',
  'medicine': '医药',
  '自然': '自然',
  'nature': '自然',
  '表演': '表演',
  'performance': '表演',
  '游说': '游说',
  'persuasion': '游说',
  '宗教': '宗教',
  'religion': '宗教',
  '巧手': '巧手',
  'sleight of hand': '巧手',
  '求生': '求生',
  'survival': '求生',
};

type Frontmatter = Record<string, unknown>;

export interface PlainTextAiNormalizer {
  normalizeBlock(block: string): Promise<string>;
}

export interface PlainTextIngestionOptions {
  sourcePath: string;
  emitDir: string;
  dryRun?: boolean;
  enableAiNormalize?: boolean;
}

export interface IngestedCreatureFile {
  chineseName: string;
  englishName: string;
  slug: string;
  fileName: string;
  markdown: string;
  frontmatter: Frontmatter;
  sections: Partial<Record<SectionName, string>>;
  rawNotes: string[];
}

export interface PlainTextIngestionResult {
  sourcePath: string;
  emitDir: string;
  dryRun: boolean;
  usedAi: boolean;
  files: IngestedCreatureFile[];
}

export class PlainTextIngestionWorkflow {
  private readonly aiNormalizer?: PlainTextAiNormalizer;

  constructor(options: { aiNormalizer?: PlainTextAiNormalizer | null } = {}) {
    this.aiNormalizer =
      options.aiNormalizer === undefined
        ? this.createDefaultAiNormalizer()
        : options.aiNormalizer ?? undefined;
  }

  public async ingest(options: PlainTextIngestionOptions): Promise<PlainTextIngestionResult> {
    const sourcePath = this.resolvePath(options.sourcePath);
    const emitDir = this.resolvePath(options.emitDir);
    const middleDir = join(dirname(emitDir), 'middle');
    const auditDir = join(dirname(emitDir), 'audits');
    const raw = readFileSync(sourcePath, 'utf-8');
    const blocks = splitCollection(raw);
    const files: IngestedCreatureFile[] = [];

    for (const block of blocks) {
      let normalized = normalizeBlock(block.rawBlock);

      // 如果启用 AI normalization
      if (options.enableAiNormalize && this.aiNormalizer) {
        try {
          const aiText = await this.aiNormalizer.normalizeBlock(normalized);
          normalized = aiText;
        } catch {
          // 回退到基于规则的 normalization
        }
      }

      // CRITICAL: 检测 normalized 是 YAML-only 还是 markdown
      let creature: IngestedCreatureFile;
      if (normalized.trim().startsWith('---') || normalized.includes('名称:')) {
        // AI 输出的纯 YAML - 不同的解析方式
        creature = parseYamlNormalizedBlock(normalized, block.heading);
      } else {
        // 标准 markdown 格式
        creature = parseCreatureBlock(normalized);
      }
      files.push(creature);
    }

    if (!options.dryRun) {
      mkdirSync(middleDir, { recursive: true });
      mkdirSync(auditDir, { recursive: true });
      for (const file of files) {
        const outputPath = join(middleDir, file.fileName);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, file.markdown);
      }

      // 触发审计
      const auditWorkflow = new PlainTextAuditWorkflow();
      auditWorkflow.audit(middleDir, sourcePath);
    }

    return {
      sourcePath,
      emitDir: middleDir,
      dryRun: Boolean(options.dryRun),
      usedAi: Boolean(options.enableAiNormalize && this.aiNormalizer),
      files,
    };
  }

  private async normalizeBlock(block: string, enableAiNormalize: boolean): Promise<string> {
    const normalized = normalizeBlock(block);
    if (!enableAiNormalize || !this.aiNormalizer) {
      return normalized;
    }

    try {
      const aiText = await this.aiNormalizer.normalizeBlock(normalized);
      return normalizeBlock(aiText);
    } catch {
      return normalized;
    }
  }

  private createDefaultAiNormalizer(): PlainTextAiNormalizer | undefined {
    const config = createTranslationConfigFromEnv();
    if (!config.apiKey) {
      return undefined;
    }

    return new OpenAICompatibleIngestNormalizer({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutMs: config.timeoutMs,
    });
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(process.cwd(), path);
  }
}

export function splitCollection(text: string): Array<{
  rawBlock: string;
  heading: string;
  chineseName: string;
  englishName: string;
}> {
  const normalized = text.replace(/\r\n/g, '\n');
  const matches = [...normalized.matchAll(/^#\s+\*\*(.+?)\*\*\s*$/gm)];
  const blocks: Array<{
    rawBlock: string;
    heading: string;
    chineseName: string;
    englishName: string;
  }> = [];

  for (let index = 0; index < matches.length; index++) {
    const current = matches[index];
    const next = matches[index + 1];
    if (!current?.index || !current[1]) {
      if (current?.index !== 0 || !current[1]) continue;
    }

    const start = current.index ?? 0;
    const end = next?.index ?? normalized.length;
    const rawBlock = normalized.slice(start, end).trim();
    const names = parseNamesFromHeading(current[1]);
    blocks.push({
      rawBlock,
      heading: current[1].trim(),
      chineseName: names.chineseName,
      englishName: names.englishName,
    });
  }

  return blocks;
}

export function normalizeBlock(block: string): string {
  const lines = block.replace(/\r\n/g, '\n').split('\n');
  const normalizedLines: string[] = [];
  let previousBlank = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ').replace(/[ \u3000]+$/g, '');
    const trimmed = line.trim();

    if (!trimmed) {
      if (!previousBlank) {
        normalizedLines.push('');
      }
      previousBlank = true;
      continue;
    }

    previousBlank = false;

    const mappedSection = detectSectionHeading(trimmed);
    if (mappedSection) {
      normalizedLines.push(`### ${mappedSection}`);
      continue;
    }

    if (trimmed === '---') {
      normalizedLines.push('---');
      continue;
    }

    normalizedLines.push(line);
  }

  return normalizedLines.join('\n').trim() + '\n';
}

export function parseCreatureBlock(block: string): IngestedCreatureFile {
  const lines = block.trim().split('\n');
  const headingLine = lines[0]?.trim() ?? '';
  const headingMatch = headingLine.match(/^#\s+\*\*(.+?)\*\*\s*$/);
  if (!headingMatch?.[1]) {
    throw new Error('Invalid creature block: missing heading');
  }

  const names = parseNamesFromHeading(headingMatch[1]);
  const slug = slugifyEnglishName(names.englishName || names.chineseName);
  const fileName = names.englishName
    ? `${slug}__${sanitizeFileName(names.chineseName)}.md`
    : `${sanitizeFileName(names.chineseName)}.md`;

  const firstSectionIndex = lines.findIndex((line) => /^###\s+/.test(line.trim()));
  const preludeLines = firstSectionIndex === -1 ? lines.slice(1) : lines.slice(1, firstSectionIndex);
  const sectionLines = firstSectionIndex === -1 ? [] : lines.slice(firstSectionIndex);

  const sections = extractSections(sectionLines);
  const { frontmatter, rawNotes } = extractFrontmatter(preludeLines, names);
  const markdown = emitProjectMarkdown(frontmatter, sections, rawNotes);

  return {
    chineseName: names.chineseName,
    englishName: names.englishName,
    slug,
    fileName,
    markdown,
    frontmatter,
    sections,
    rawNotes,
  };
}

export function parseYamlNormalizedBlock(yamlContent: string, heading: string): IngestedCreatureFile {
  // yamlContent 是 AI 输出的纯 YAML
  // heading 是 AI 调用前提取的原始块标题

  const frontmatter = yaml.load(yamlContent) as Frontmatter;

  // 从 heading 提取名称 (使用原有逻辑)
  const names = parseNamesFromHeading(heading);
  const slug = slugifyEnglishName(names.englishName || names.chineseName);

  // 始终使用 {slug}__{chinese-name}.md 格式
  const fileName = `${slug}__${sanitizeFileName(names.chineseName)}.md`;

  return {
    chineseName: names.chineseName,
    englishName: names.englishName,
    slug,
    fileName,
    markdown: `---\n${yaml.dump(frontmatter, { lineWidth: -1, noRefs: true, sortKeys: false })}---\n`,
    frontmatter,
    sections: {}, // AI 输出没有 section body - 都在 YAML 中
    rawNotes: [],
  };
}

function emitProjectMarkdown(
  frontmatter: Frontmatter,
  sections: Partial<Record<SectionName, string>>,
  rawNotes: string[],
): string {
  const dumped = yaml.dump(frontmatter, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trimEnd();

  const bodyParts: string[] = ['---', dumped, '---', ''];

  for (const sectionName of SECTION_ORDER) {
    const section = sections[sectionName]?.trim();
    if (!section) continue;
    bodyParts.push(`### ${sectionName}`);
    bodyParts.push('');
    bodyParts.push(section);
    bodyParts.push('');
  }

  if (rawNotes.length > 0) {
    bodyParts.push('### 原始备注');
    bodyParts.push('');
    for (const note of rawNotes) {
      bodyParts.push(`- ${note}`);
    }
    bodyParts.push('');
  }

  return bodyParts.join('\n').trim() + '\n';
}

function extractSections(lines: string[]): Partial<Record<SectionName, string>> {
  const sections: Partial<Record<SectionName, string[]>> = {};
  let current: SectionName | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const sectionName = detectSectionHeading(line.trim());
    if (sectionName) {
      current = sectionName;
      if (!sections[current]) {
        sections[current] = [];
      }
      continue;
    }

    if (line.trim() === '---') {
      continue;
    }

    if (!current) continue;
    sections[current]?.push(line);
  }

  const out: Partial<Record<SectionName, string>> = {};
  for (const sectionName of SECTION_ORDER) {
    const content = (sections[sectionName] ?? []).join('\n').trim();
    if (content) {
      out[sectionName] = content;
    }
  }

  return out;
}

function extractFrontmatter(
  preludeLines: string[],
  names: { chineseName: string; englishName: string },
): { frontmatter: Frontmatter; rawNotes: string[] } {
  const frontmatter: Frontmatter = {
    名称: names.englishName
      ? `${names.chineseName} (${stripPublisherSuffix(names.englishName)})`
      : names.chineseName,
    类型: 'npc',
  };
  const rawNotes: string[] = [];

  const taxonomyLine = preludeLines.find((line) => line.trim().startsWith('_'));
  if (taxonomyLine) {
    const taxonomy = parseTaxonomyLine(taxonomyLine);
    if (taxonomy.size) frontmatter.体型 = taxonomy.size;
    if (taxonomy.creatureType) frontmatter.生物类型 = taxonomy.creatureType;
    if (taxonomy.alignment) frontmatter.阵营 = taxonomy.alignment;
  }

  const abilityValues = parseAbilityScores(preludeLines);
  if (Object.keys(abilityValues).length === 6) {
    frontmatter.能力 = abilityValues;
  }

  const senses: Record<string, number> = {};
  const lines = preludeLines
    .map((line) => normalizeInlineText(stripMarkdown(line.trim())))
    .filter(Boolean);

  for (const line of lines) {
    if (/Armor Class/i.test(line)) {
      const value = parseSimpleValue(line, 'Armor Class');
      if (value && isSafeArmorClass(value)) {
        frontmatter['护甲等级'] = value;
      } else {
        rawNotes.push(line);
      }
      continue;
    }

    if (/Initiative/i.test(line)) {
      const value = parseSimpleValue(line, 'Initiative');
      const init = value.match(/[-+]?\d+/)?.[0];
      if (init) {
        frontmatter['先攻'] = Number.parseInt(init, 10);
      } else {
        rawNotes.push(line);
      }
      continue;
    }

    if (/Hit Points/i.test(line)) {
      const value = parseSimpleValue(line, 'Hit Points');
      const normalizedHitPoints = normalizeNumericSpacing(value);
      const hitPointRange = parseHitPointRange(normalizedHitPoints);
      if (hitPointRange) {
        frontmatter['生命值'] = String(hitPointRange.recommendedValue);
        rawNotes.push(`生命值原始范围: ${normalizedHitPoints}`);
      } else if (isSafeHitPoints(value) && countNumericTokens(value) <= 2) {
        frontmatter['生命值'] = normalizedHitPoints;
      } else {
        rawNotes.push(`生命值原始行: ${line}`);
      }
      continue;
    }

    if (/Speed/i.test(line)) {
      const value = parseSimpleValue(line, 'Speed');
      if (value) {
        frontmatter['速度'] = normalizeSpeedValue(value);
      } else {
        rawNotes.push(line);
      }
      continue;
    }

    if (/Challenge/i.test(line)) {
      const parsed = parseChallengeLine(line);
      if (parsed.cr !== undefined) frontmatter['挑战等级'] = parsed.cr;
      if (parsed.xp !== undefined) frontmatter['经验值'] = parsed.xp;
      if (parsed.prof !== undefined) frontmatter['熟练加值'] = parsed.prof;
      if (parsed.cr === undefined && parsed.xp === undefined && parsed.prof === undefined) {
        rawNotes.push(line);
      }
      continue;
    }

    if (/Damage Resistances/i.test(line)) {
      const values = collectMappedTerms(line, DAMAGE_TYPE_MAP);
      if (values.length > 0) {
        frontmatter['伤害抗性'] = values;
      } else {
        rawNotes.push(line);
      }
      continue;
    }

    if (/Damage Vulnerabilities/i.test(line)) {
      const values = collectMappedTerms(line, DAMAGE_TYPE_MAP);
      if (values.length > 0) {
        frontmatter['伤害易伤'] = values;
      } else {
        rawNotes.push(line);
      }
      continue;
    }

    if (/Damage Immunities/i.test(line)) {
      const values = collectMappedTerms(line, DAMAGE_TYPE_MAP);
      if (values.length > 0) {
        frontmatter['伤害免疫'] = values;
      } else {
        rawNotes.push(line);
      }
      continue;
    }

    if (/Condition Immunities/i.test(line)) {
      const values = collectMappedTerms(line, CONDITION_MAP);
      if (values.length > 0) {
        frontmatter['状态免疫'] = values;
      } else {
        rawNotes.push(line);
      }
      continue;
    }

    if (/Senses/i.test(line)) {
      const parsedSenses = parseSensesLine(line);
      Object.assign(senses, parsedSenses.senses);
      if (parsedSenses.passivePerception !== undefined) {
        senses['被动察觉'] = parsedSenses.passivePerception;
      }
      if (parsedSenses.notes.length > 0) {
        rawNotes.push(...parsedSenses.notes);
      }
      continue;
    }

    if (/Languages/i.test(line)) {
      const values = collectMappedTerms(line, LANGUAGE_MAP);
      if (values.length > 0) {
        frontmatter['语言'] = values;
      }
      continue;
    }

    if (/\b(?:Saving Throws|Saves)\b/i.test(line)) {
      const parsedSaves = parseSavingThrowsLine(line);
      if (Object.keys(parsedSaves).length > 0) {
        frontmatter['豁免熟练'] = parsedSaves;
      } else {
        rawNotes.push(line);
      }
      continue;
    }

    if (/Skills/i.test(line)) {
      const parsedSkills = parseSkillsLine(line);
      if (Object.keys(parsedSkills).length > 0) {
        frontmatter['技能'] = parsedSkills;
      } else {
        rawNotes.push(line);
      }
    }
  }

  if (Object.keys(senses).length > 0) {
    frontmatter['感官'] = senses;
  }

  return { frontmatter, rawNotes: unique(rawNotes) };
}

function parseNamesFromHeading(heading: string): { chineseName: string; englishName: string } {
  const match = heading.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match?.[1] || !match[2]) {
    return { chineseName: heading.trim(), englishName: '' };
  }

  return {
    chineseName: match[1].trim(),
    englishName: stripPublisherSuffix(match[2].trim()),
  };
}

function parseTaxonomyLine(line: string): {
  size?: string;
  creatureType?: string;
  alignment?: string;
} {
  const stripped = stripMarkdown(line);
  const groups = [...stripped.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
  const first = groups[0] ?? '';
  const second = groups[1] ?? '';

  const taxonomy: { size?: string; creatureType?: string; alignment?: string } = {};
  const firstWords = first.split(/\s+/).filter(Boolean);
  const sizeKey = firstWords[0]?.toLowerCase();
  if (sizeKey && SIZE_MAP[sizeKey]) {
    taxonomy.size = SIZE_MAP[sizeKey];
  }

  const typeKey = firstWords.slice(1).join(' ').toLowerCase();
  if (typeKey && CREATURE_TYPE_MAP[typeKey]) {
    taxonomy.creatureType = CREATURE_TYPE_MAP[typeKey];
  }

  const alignmentKey = second.toLowerCase();
  if (alignmentKey && ALIGNMENT_MAP[alignmentKey]) {
    taxonomy.alignment = ALIGNMENT_MAP[alignmentKey];
  }

  return taxonomy;
}

function parseAbilityScores(lines: string[]): Record<string, number> {
  const abilityLine = lines.find((line) => /^\|\s*\d+/.test(line.trim()));
  if (!abilityLine) {
    return {};
  }

  const parts = abilityLine
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 6) {
    return {};
  }

  const values = parts
    .slice(0, 6)
    .map((part) => {
      const match = part.match(/(-?\d+)/);
      return match ? Number.parseInt(match[1], 10) : undefined;
    });

  if (values.some((value) => value === undefined)) {
    return {};
  }

  return {
    力量: values[0] as number,
    敏捷: values[1] as number,
    体质: values[2] as number,
    智力: values[3] as number,
    感知: values[4] as number,
    魅力: values[5] as number,
  };
}

function parseSimpleValue(line: string, label: string): string {
  const normalizedLine = normalizeInlineText(line);
  const index = normalizedLine.toLowerCase().indexOf(label.toLowerCase());
  if (index === -1) {
    return '';
  }

  return normalizedLine
    .slice(index + label.length)
    .replace(/^[)\]:\s\-]+/, '')
    .trim();
}

function parseSimpleValueFromLabels(line: string, labels: string[]): string {
  for (const label of labels) {
    const value = parseSimpleValue(line, label);
    if (value) {
      return value;
    }
  }

  return '';
}

function parseChallengeLine(line: string): { cr?: number; xp?: number; prof?: number } {
  const out: { cr?: number; xp?: number; prof?: number } = {};
  const value = parseSimpleValue(line, 'Challenge');

  const xpMatch = value.match(/([0-9][0-9,]*)\s*XP/i);
  if (xpMatch?.[1]) {
    out.xp = Number.parseInt(xpMatch[1].replace(/,/g, ''), 10);
  }

  const profMatch =
    value.match(/Proficiency Bonus\s*\+?(\d+)/i) ??
    value.match(/熟练加值\s*\+?(\d+)/);
  if (profMatch?.[1]) {
    out.prof = Number.parseInt(profMatch[1], 10);
  }

  const crMatch = value.match(/(^|\s)(\d+(?:\/\d+)?)(?=\s|\(|XP|$)/);
  if (crMatch?.[2]) {
    const candidate = crMatch[2];
    const numeric = Number.parseFloat(candidate);
    if (candidate.includes('/') || numeric <= 30) {
      out.cr = candidate.includes('/') ? candidate : numeric;
    }
  }

  return out;
}

function parseSensesLine(line: string): {
  senses: Record<string, number | string>;
  passivePerception?: number;
  notes: string[];
} {
  const value = parseSimpleValue(line, 'Senses');
  const senses: Record<string, number | string> = {};
  const notes: string[] = [];
  let passivePerception: number | undefined;
  const specialNotes: string[] = [];

  for (const [english, chinese, key, label] of [
    ['Blindsight', '盲视', 'blindsight', '盲视'],
    ['Darkvision', '黑暗视觉', 'darkvision', '黑暗视觉'],
    ['Tremorsense', '震颤感知', 'tremorsense', '震颤感知'],
    ['Truesight', '真实视觉', 'truesight', '真实视觉'],
  ] as const) {
    const match = value.match(
      new RegExp(
        `(?:${english}\\)?|${chinese})\\s*(\\d+)(?:\\s*(?:尺|ft\\.?))?(?:\\s*[（(]([^）)]*)[）)])?`,
        'i',
      ),
    );
    if (match?.[1]) {
      senses[key] = Number.parseInt(match[1], 10);
      if (match[2]?.trim()) {
        specialNotes.push(`${label}: ${match[2].trim()}`);
      }
    }
  }

  const passiveMatch = value.match(/(?:Passive Perception\)?|被动察觉)\s*(\d+)/i);
  if (passiveMatch?.[1]) {
    passivePerception = Number.parseInt(passiveMatch[1], 10);
  }

  if (specialNotes.length > 0) {
    senses['特殊'] = specialNotes.join('；');
  }

  return { senses, passivePerception, notes };
}

function parseSavingThrowsLine(line: string): Record<string, number> {
  const value = parseSimpleValueFromLabels(line, ['Saving Throws', 'Saves', '豁免']);
  return parseLabeledNumericList(value, ABILITY_LABEL_MAP);
}

function parseSkillsLine(line: string): Record<string, number> {
  const value = parseSimpleValue(line, 'Skills');
  return parseLabeledNumericList(value, SKILL_LABEL_MAP);
}

function parseLabeledNumericList(
  value: string,
  labelMap: Record<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const normalized = normalizeInlineText(value);
  const entries = normalized.split(/[,;，]/).map((entry) => entry.trim()).filter(Boolean);

  for (const entry of entries) {
    const match = entry.match(/^(.+?)\s*([+-]?\d+)\s*$/);
    if (!match?.[1] || !match[2]) {
      continue;
    }

    const label = canonicalizeLabel(match[1], labelMap);
    if (!label) {
      continue;
    }

    out[label] = Number.parseInt(match[2], 10);
  }

  return out;
}

function canonicalizeLabel(value: string, labelMap: Record<string, string>): string | undefined {
  const normalized = normalizeInlineText(value)
    .replace(/\([^)]*\)/g, '')
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return labelMap[normalized];
}

function collectMappedTerms(line: string, map: Record<string, string>): string[] {
  const value = line.toLowerCase();
  const matches: string[] = [];

  for (const [term, mapped] of Object.entries(map)) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
    if (pattern.test(value)) {
      matches.push(mapped);
    }
  }

  return unique(matches);
}

function detectSectionHeading(line: string): SectionName | null {
  for (const entry of SECTION_LABELS) {
    if (entry.pattern.test(line)) {
      return entry.name;
    }
  }
  return null;
}

function slugifyEnglishName(value: string): string {
  return stripPublisherSuffix(value)
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, '').trim();
}

function stripPublisherSuffix(value: string): string {
  return value.replace(/\bMCDM\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function stripMarkdown(value: string): string {
  return value
    .replace(/^\s*#{1,6}\s*/, '')
    .replace(/^\s*>\s*/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumericSpacing(value: string): string {
  return normalizeInlineText(value)
    .replace(/\s+/g, ' ')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .trim();
}

function normalizeSpeedValue(value: string): string {
  return normalizeInlineText(value).replace(/\s+/g, ' ').trim();
}

function isSafeHitPoints(value: string): boolean {
  return /^(\d+)(\s*\([^)]+\))?$/.test(value.trim());
}

function parseHitPointRange(value: string): { min: number; max: number; recommendedValue: number } | null {
  const match = value.trim().match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const min = Number.parseInt(match[1], 10);
  const max = Number.parseInt(match[2], 10);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) {
    return null;
  }

  return {
    min,
    max,
    recommendedValue: Math.round((min + max) / 2),
  };
}

function countNumericTokens(value: string): number {
  return value.match(/\d+/g)?.length ?? 0;
}

function isSafeArmorClass(value: string): boolean {
  return /^\d+(\s*\([^)]+\))?$/.test(value.trim());
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeInlineText(value: string): string {
  return normalizeChineseText(value)
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[：]/g, ':')
    .replace(/[，]/g, ',')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'");
}

class OpenAICompatibleIngestNormalizer implements PlainTextAiNormalizer {
  private readonly translator: OpenAICompatibleTranslator;

  constructor(options: { apiKey: string; baseUrl: string; model: string; timeoutMs: number }) {
    this.translator = new OpenAICompatibleTranslator({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      model: options.model,
      timeoutMs: options.timeoutMs,
      httpClient: async (url, init) => {
        const request = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
        const response = await fetch(url, {
          ...init,
          body: JSON.stringify({
            ...request,
            temperature: 0,
            messages: [
              {
                role: 'system',
                content:
                  'You are a D&D 5e monster statblock-to-YAML converter. Convert creature markdown into structured YAML.\n\n' +
                  'OUTPUT FORMAT: Return a JSON object with two fields:\n' +
                  '- "frontmatter": YAML frontmatter as a string (starting with --- and ending with ---)\n' +
                  '- "slug": URL-safe slug derived from the creature name\n\n' +
                  'Frontmatter must follow this structure:\n' +
                  '```yaml\n' +
                  '名称: <bilingual name>\n' +
                  '类型: npc\n' +
                  '体型: <size in Chinese>\n' +
                  '生物类型: <creature type in Chinese>\n' +
                  '阵营: <alignment in Chinese>\n' +
                  '能力:\n' +
                  '  力量: <number>\n' +
                  '  敏捷: <number>\n' +
                  '  体质: <number>\n' +
                  '  智力: <number>\n' +
                  '  感知: <number>\n' +
                  '  魅力: <number>\n' +
                  '护甲等级: <value>\n' +
                  '生命值: <value>\n' +
                  '速度: <value>\n' +
                  '感官: <object or string>\n' +
                  '挑战等级: <number>\n' +
                  '特性:  # or 动作 / 附赠动作 / 反应 / 传奇动作\n' +
                  '  - 名称: <中文名> (<英文名>)\n' +
                  '    类型: attack | save | damage | utility\n' +
                  '    activation:\n' +
                  '      type: action | bonus | reaction | legendary | special\n' +
                  '      condition: <触发条件文字>  # optional\n' +
                  '    描述: <原文描述>\n' +
                  '    # --- 攻击类 ---\n' +
                  '    攻击类型: mwak | rwak | msak | rsak\n' +
                  '    命中: <数字>\n' +
                  '    范围: <文字>  # "触及 10 尺" / "30/60 尺"\n' +
                  '    伤害:\n' +
                  '      - 公式: <骰子>  # "3d6+5"，永远用公式不用结果\n' +
                  '        类型: 钝击 | 穿刺 | 心灵 | ...\n' +
                  '    # --- 豁免类 ---\n' +
                  '    DC: <数字>\n' +
                  '    属性: 力量 | 敏捷 | 体质 | 智力 | 感知 | 魅力\n' +
                  '    AoE:\n' +
                  '      形状: 球形 | 锥形 | 线形 | 立方体 | 圆柱形 | 矩形\n' +
                  '      范围: <数字>  # 尺\n' +
                  '    # --- 目标 ---\n' +
                  '    目标:\n' +
                  '      数量: <数字> | all | <文字>  # "1" / "所有生物" / "所有非异怪生物"\n' +
                  '      类型: creature | object\n' +
                  '      特殊: <文字>  # "仅限被魅惑的目标" / "半径15尺范围内"\n' +
                  '    # --- 资源 ---\n' +
                  '    充能: [5, 6]  # [最小, 最大]，没有充能则省略\n' +
                  '    每日: <数字>\n' +
                  '    需专注: true | false\n' +
                  '    # --- 子活动（触发型）---\n' +
                  '    子活动:\n' +
                  '      - 名称: <子活动名>\n' +
                  '        类型: attack | save | damage | utility\n' +
                  '        触发: 命中后 | 失败 | 成功 | 低值 | 降至0 | 濒血 | special\n' +
                  '        阈值: <数字>  # 可选\n' +
                  '        DC: <数字>\n' +
                  '        属性: 力量 | 敏捷 | ...\n' +
                  '        伤害:\n' +
                  '          - 公式: <骰子>\n' +
                  '            类型: <伤害类型>\n' +
                  '        内嵌效果:\n' +
                  '          - 类型: 流血 | 疾病 | 减速 | ...\n' +
                  '            描述: <原文>\n' +
                  '            持续: <轮数> | 1分钟 | 专注\n' +
                  '    # --- 效果 ---\n' +
                  '    失败效果:\n' +
                  '      - 公式: <骰子>  # 有伤害时\n' +
                  '        类型: <伤害类型>\n' +
                  '        状态: <状态名>  # 如 "中毒" / "魅惑"\n' +
                  '        描述: <原文>\n' +
                  '    成功效果:\n' +
                  '      - 描述: <文字>\n' +
                  '        状态: <状态名>\n' +
                  '    低值效果:\n' +
                  '      - 阈值: <数字>\n' +
                  '        描述: <原文>\n' +
                  '        状态: <状态名>\n' +
                  '    特殊效果:\n' +
                  '      - 触发: <触发条件>\n' +
                  '        描述: <原文>\n' +
                  '```\n\n' +
                  '判断规则（必须严格遵守）:\n' +
                  '- 有 DC → 类型: save\n' +
                  '- 无 DC、有 伤害 → 类型: damage\n' +
                  '- 无 DC、无 伤害 → 类型: utility\n\n' +
                  'activation.type 判断:\n' +
                  '- 特性（被动/触发） → activation.type: special 或省略\n' +
                  '- 动作 → activation.type: action\n' +
                  '- 附赠动作 → activation.type: bonus\n' +
                  '- 反应 → activation.type: reaction\n' +
                  '- 传奇动作 → activation.type: legendary\n\n' +
                  '关键规则:\n' +
                  '1. 伤害永远用公式：原文 "14（4d6）点心灵伤害" → 公式: 4d6，不是 14\n' +
                  '2. DC 14 无伤害 = 纯豁免：类型 save，无 伤害 字段\n' +
                  '3. 命中后带 DC：拆成 子活动，父活动无 DC\n' +
                  '4. condition 文字保留：原文 "濒血时"、"每日 1 次" 保留在 activation.condition\n' +
                  '5. 流血/减益作为内嵌效果：不生成独立 activity\n' +
                  '6. 多重攻击：类型: utility，描述 列出触发了哪些动作\n\n' +
                  '伤害类型映射：Bludgeoning→钝击, Piercing→穿刺, Slashing→挥砍, Poison→毒素, Fire→火焰, Cold→寒冷, Lightning→闪电, Thunder→雷鸣, Radiant→光耀, Necrotic→暗蚀, Force→力场, Psychic→心灵, Acid→强酸\n\n' +
                  'Return ONLY a JSON object with "frontmatter" and "slug" fields. No explanations.',
              },
              {
                role: 'user',
                content:
                  typeof request.messages === 'object'
                    ? String(
                        ((request.messages as Array<{ content?: unknown }>)[1]?.content ?? ''),
                      )
                    : '',
              },
            ],
          }),
        });
        return response;
      },
    });
  }

  public async normalizeBlock(block: string): Promise<string> {
    const response = await this.translator.translate(block, {
      sourceLanguage: 'markdown',
      targetLanguage: 'markdown',
      namespace: 'plaintext-ingest',
    });

    try {
      const parsed = JSON.parse(response);
      if (parsed.frontmatter) {
        return parsed.frontmatter;
      }
    } catch {
    }
    return response;
  }
}
