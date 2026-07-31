export interface VisualHintSubject {
  topicId?: string;
  chineseName?: string;
  englishName?: string;
}

export interface VisualHints {
  positionHints: string[];
  appearanceHints: string[];
  captionHints: string[];
  weakHints: string[];
}

const POSITION_PATTERNS = [
  /从左[^。；;.!！?？]{0,80}(?:。|；|;|!|！|\?|？|$)/g,
  /从右[^。；;.!！?？]{0,80}(?:。|；|;|!|！|\?|？|$)/g,
  /[^。；;.!！?？]{0,40}顺时针[^。；;.!！?？]{0,80}(?:。|；|;|!|！|\?|？|$)/g,
  /[^。；;.!！?？]{0,40}逆时针[^。；;.!！?？]{0,80}(?:。|；|;|!|！|\?|？|$)/g,
  /[^。；;.!！?？]{0,40}(?:前方|后方|上方|下方|左侧|右侧|前景|后景)[^。；;.!！?？]{0,80}(?:。|；|;|!|！|\?|？|$)/g,
];

const APPEARANCE_TERMS = [
  '无头',
  '骑着',
  '看起来',
  '形态',
  '外形',
  '巨大',
  '庞大',
  '触手',
  '昆虫',
  '真菌',
  '塔罗',
  '卡牌',
  '恐狼',
  '狼人',
  '嵌合',
  '血肉',
  '占卜',
];

const WEAK_TERMS = ['中型', '小型', '大型', '巨型', '邪魔', '异怪', '亡灵', '类人', '混乱', '邪恶', '中立'];

export function extractVisualHints(text: string, subject: VisualHintSubject = {}): VisualHints {
  const normalized = normalizeRecordText(text);
  const beforeStats = sliceBeforeStatblock(normalized);
  const withoutCredits = stripTranslatorCredits(beforeStats);
  const captionHints = extractCaptionHints(withoutCredits);
  const textOnly = stripImageUrls(withoutCredits);
  const positionHints = unique([
    ...matchPatterns(textOnly, POSITION_PATTERNS),
    ...captionHints.filter((hint) => containsPositionTerm(hint)),
  ]);
  const appearanceHints = unique(extractAppearanceHints(textOnly, subject));
  const weakHints = unique(extractWeakHints(textOnly, subject)).filter(
    (hint) => !appearanceHints.includes(hint) && !positionHints.includes(hint),
  );

  return {
    positionHints,
    appearanceHints,
    captionHints,
    weakHints,
  };
}

function normalizeRecordText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\((https?:\/\/[^)]+)\)/g, '($1) ')
    .trim();
}

function sliceBeforeStatblock(value: string): string {
  const markers = [
    /AC\s+\d/i,
    /Armor Class/i,
    /(?:^|\s)护甲等级/i,
    /HP\s+\d/i,
  ];
  let cut = value.length;
  for (const marker of markers) {
    const match = marker.exec(value);
    if (match?.index !== undefined) cut = Math.min(cut, match.index);
  }
  return value.slice(0, cut).trim();
}

function stripTranslatorCredits(value: string): string {
  return value
    .replace(/译者\s*@?[^\s。；;，,]{1,30}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCaptionHints(value: string): string[] {
  const captions: string[] = [];
  const imagePattern = /\(https?:\/\/[^)]+\)\s*([^()]{4,160})/g;
  for (const match of value.matchAll(imagePattern)) {
    const caption = cleanHint(match[1]);
    if (caption) captions.push(caption);
  }
  return unique(captions);
}

function stripImageUrls(value: string): string {
  return value.replace(/\(https?:\/\/[^)]+\)/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchPatterns(value: string, patterns: RegExp[]): string[] {
  const matches: string[] = [];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const hint = cleanHint(match[0]);
      if (hint) matches.push(hint);
    }
  }
  return unique(matches);
}

function extractAppearanceHints(value: string, subject: VisualHintSubject): string[] {
  const sentences = splitSentences(value);
  const subjectNames = [subject.chineseName, subject.englishName]
    .filter((name): name is string => Boolean(name && name.trim()))
    .map((name) => name.trim());

  return unique(
    sentences
      .filter((sentence) => APPEARANCE_TERMS.some((term) => sentence.includes(term)))
      .filter((sentence) => subjectNames.length === 0 || subjectNames.some((name) => sentence.includes(name)) || sentence.length <= 80)
      .map(cleanHint)
      .filter(Boolean),
  );
}

function extractWeakHints(value: string, subject: VisualHintSubject): string[] {
  const names = [subject.chineseName, subject.englishName].filter(Boolean).join('|');
  const weak = splitSentences(value)
    .filter((sentence) => WEAK_TERMS.some((term) => sentence.includes(term)))
    .filter((sentence) => !names || sentence.includes(subject.chineseName ?? '') || sentence.includes(subject.englishName ?? '') || sentence.length <= 60)
    .map(cleanHint)
    .filter(Boolean);
  return unique(weak);
}

function splitSentences(value: string): string[] {
  return value
    .split(/[。；;.!！?？]/)
    .map(cleanHint)
    .filter(Boolean);
}

function cleanHint(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/\(https?:\/\/[^)]+\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[：:，,\s]+|[：:，,\s]+$/g, '')
    .trim()
    .slice(0, 220);
}

function containsPositionTerm(value: string): boolean {
  return /(从左|从右|顺时针|逆时针|前方|后方|上方|下方|左侧|右侧|前景|后景)/.test(value);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanHint(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}
