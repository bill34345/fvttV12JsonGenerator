import type {
  CandidateFilterResult,
  CandidateSignals,
  DocumentCandidate,
  DocumentCandidateFilterLike,
  ExtractedDocument,
  ExtractedTextBlock,
} from './types';

const SECTION_PATTERNS = [
  /\btraits?\b/i,
  /\bactions?\b/i,
  /\breactions?\b/i,
  /\bbonus actions?\b/i,
  /\blegendary actions?\b/i,
  /\bmythic actions?\b/i,
  /特性|动作|反应|附赠动作|传奇动作|神话动作/u,
];

export class DocumentCandidateFilter implements DocumentCandidateFilterLike {
  filter(document: ExtractedDocument): CandidateFilterResult {
    const candidates: DocumentCandidate[] = [];
    const excludedPages: CandidateFilterResult['excludedPages'] = [];
    const warnings: string[] = [];
    const pageNumbersWithCandidates = new Set<number>();

    for (const block of document.blocks) {
      const signals = detectSignals(block.text);
      const confidence = scoreSignals(signals);
      if (!signals.name || confidence < 0.45) {
        continue;
      }
      const status = confidence >= 0.8 && signals.challenge && hasRequiredCore(signals)
        ? 'high'
        : confidence >= 0.6 && signals.challenge
          ? 'medium'
          : 'needs_review';
      const label = extractCandidateLabel(block.text, block.pageNumber);
      const candidate: DocumentCandidate = {
        id: stableCandidateId(block, label),
        label,
        status,
        confidence,
        pageNumber: block.pageNumber,
        sourceBlockId: block.id,
        ...(block.bbox ? { bbox: block.bbox } : {}),
        language: block.language,
        rawMarkdown: markdownForBlock(block, label),
        signals,
        reason: explainSignals(signals, status),
        sourcePageCount: 1,
      };
      candidates.push(candidate);
      pageNumbersWithCandidates.add(block.pageNumber);
    }

    for (const page of document.pages) {
      if (!pageNumbersWithCandidates.has(page.pageNumber)) {
        const hasText = page.blocks.some((block) => block.text.trim().length > 0);
        excludedPages.push({
          pageNumber: page.pageNumber,
          reason: hasText ? '未同时检测到名称和足够的 stat block 信号，视为 Lore/目录/规则说明或普通页面。' : '页面没有可用文字。',
        });
      }
    }

    if (candidates.some((candidate) => candidate.status === 'needs_review')) {
      warnings.push('存在无法可靠确认核心 stat block 字段的候选；这些候选不会被默认翻译或生成 Actor。');
    }
    if (candidates.some((candidate) => candidate.pageNumber !== candidates[0]?.pageNumber)) {
      warnings.push('检测到跨页候选时仍按页块保留来源；跨页合并需要人工复核。');
    }

    return { schemaVersion: 1, candidates, excludedPages, warnings };
  }
}

export function detectSignals(text: string): CandidateSignals {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = Boolean(extractCandidateLabel(text, 1)) && lines.length > 0;
  const armorClass = /(?:\bAC\s*(?=\d)|Armor Class|护甲等级|护甲\s*等级)/iu.test(normalized);
  const hitPoints = /(?:\bHP\s*(?=\d)|Hit Points|生命值|生命点)/iu.test(normalized);
  const speed = /(?:\bSpeed\b|速度)/iu.test(normalized);
  const abilities = /(?:\bSTR\b[\s\S]*\b(?:DEX|DEXTERITY)\b[\s\S]*\b(?:CON|CONSTITUTION)\b|力量[\s\S]*敏捷[\s\S]*体质|Strength[\s\S]*Dexterity[\s\S]*Constitution|(?:MOD\s+SAVE\s+){2,3})/iu.test(normalized);
  const challenge = /(?:\bCR\s*(?=\d)|Challenge(?: Rating)?|挑战等级|挑战)/iu.test(normalized);
  const sections = SECTION_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  return { name, armorClass, hitPoints, speed, abilities, challenge, sections };
}

export function hasRequiredCore(signals: CandidateSignals): boolean {
  const core = [signals.armorClass, signals.hitPoints, signals.speed, signals.abilities, signals.challenge].filter(Boolean).length;
  return core >= 4 && signals.name;
}

export function scoreSignals(signals: CandidateSignals): number {
  const core = [signals.armorClass, signals.hitPoints, signals.speed, signals.abilities, signals.challenge].filter(Boolean).length;
  const sectionBonus = Math.min(2, signals.sections) * 0.08;
  return Math.min(1, core / 5 * 0.84 + sectionBonus + (signals.name ? 0.08 : 0));
}

export function extractCandidateLabel(text: string, pageNumber: number): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/<!--.*?-->/g, '').trim())
    .filter(Boolean);
  for (let index = 0; index < Math.min(lines.length, 8); index += 1) {
    const line = lines[index]!;
    if (/^(?:AC|Armor Class|HP|Hit Points|Speed|Type|Size|Initiative|护甲等级|生命值|速度|类型|体型|先攻)/iu.test(line)) continue;
    if (/^(?:traits?|actions?|reactions?|bonus actions?|legendary actions?|mythic actions?|特性|动作|反应|传奇动作|神话动作)$/iu.test(line)) continue;
    const compact = normalizePdfTitle(line.replace(/[#:|]/g, ' ').replace(/\s+/g, ' ').trim());
    if (compact.length >= 2 && compact.length <= 120) {
      return compact.replace(/\s+(?:CR|Challenge)\s*\d+.*$/iu, '').trim() || `Page ${pageNumber} candidate`;
    }
  }
  return `Page ${pageNumber} candidate`;
}

function normalizePdfTitle(value: string): string {
  const rules: Array<[RegExp, string]> = [
    [/\bB\s+H\s+\d+\s+EHOLDER\s+IVEMOTHER\s+CR\b/iu, 'Beholder Hivemother CR'],
    [/\bS\s+S\s+\d+\s+PECTATOR\s+ENTINEL\s+CR\b/iu, 'Spectator Sentinel CR'],
    [/\bT\s*-?Y\s+S\s+HOUSAND\s+EAR\s+PECTATOR\b/iu, 'Thousand Year Spectator'],
    [/\bM\s+\d+\s+INDWITNESS\s+CR\b/iu, 'Mindwitness CR'],
    [/\bD\s+\d+\s+IRECTOR\s+CR\b/iu, 'Director CR'],
    [/\bD\s+K\s+\d+\s+EATH\s+ISS\s+CR\b/iu, 'Death Kiss CR'],
    [/\bB\s+N\s*-?E\s+\d+\s+EHOLDER\s+IGHT\s+YE\s+CR\b/iu, 'Beholder Night-Eye CR'],
    [/\bB\s+E\s+T\s+EHOLDER\s+YE\s+YRANT\b/iu, 'Beholder Eye Tyrant'],
    [/\bB\s+D\s+T\s+EHOLDER\s+EATH\s+YRANT\b/iu, 'Beholder Death Tyrant'],
    [/\bB\s+O\s+\d+\s+EHOLDER\s+VERSEE[R]?\s+CR\b/iu, 'Beholder Overseer CR'],
    [/\bB\s+E\s+O\s+EHOLDER\s+LDER\s+RB\b/iu, 'Beholder Elder Orb'],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(value)) return value.replace(pattern, replacement).replace(/\s+/g, ' ').trim();
  }
  return value;
}

export function markdownForBlock(block: ExtractedTextBlock, label: string): string {
  const source = JSON.stringify({
    page: block.pageNumber,
    block: block.id,
    method: block.method,
    confidence: block.confidence,
    bbox: block.bbox ?? null,
  });
  const heading = block.text.trimStart().startsWith('#') ? block.text.trim() : `# ${label}\n\n${block.text.trim()}`;
  return `<!-- document-source ${source} -->\n${heading}\n`;
}

function stableCandidateId(block: ExtractedTextBlock, label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'candidate';
  return `p${block.pageNumber}-${slug}-${block.id.replace(/[^a-z0-9-]/gi, '-')}`;
}

function explainSignals(signals: CandidateSignals, status: DocumentCandidate['status']): string {
  const present = [
    signals.name && '名称',
    signals.armorClass && 'AC',
    signals.hitPoints && 'HP',
    signals.speed && '速度',
    signals.abilities && '六项属性',
    signals.challenge && 'CR/挑战等级',
    signals.sections > 0 && '动作/特性分组',
  ].filter(Boolean).join('、');
  if (status === 'high') return `高置信度：同时检测到 ${present}。`;
  if (status === 'medium') return `中置信度：检测到 ${present}，仍需人工确认。`;
  return `需要复核：只检测到部分 stat block 信号（${present || '无'}）。`;
}
