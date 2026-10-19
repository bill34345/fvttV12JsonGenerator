import { sha256 } from './hash';
import { localizationSourceUrls, withoutLocalizationSourceUrls } from './localization-source-urls';
import {participantMeaningFindings,ruleRelationMeaningFindings} from './localization-participants';

/** Display text only. Paths, document IDs and executable rules are never provider output. */
export const LEGACY_LOCALIZATION_POLICY = 'zh-CN-bilingual-titles-v1' as const;
export const LOCALIZATION_POLICY = 'zh-CN-space-separated-titles-v2' as const;
export const FACT_LOCALIZATION_POLICY = 'zh-CN-facts-v1' as const;
export type LocalizationPolicy = typeof LOCALIZATION_POLICY | typeof LEGACY_LOCALIZATION_POLICY | typeof FACT_LOCALIZATION_POLICY;
export const TERMINOLOGY_VERSION = '5echm-phb2024-project-20261007-v2' as const;
export interface LocalizationText { id: string; kind: 'title' | 'body'; source: string }
export interface LocalizationRequest {
  version: 1;
  language: 'zh-CN';
  policy: LocalizationPolicy;
  terminology: typeof TERMINOLOGY_VERSION;
  sourceHash: string;
  terminologyHash: string;
  texts: LocalizationText[];
  nameGlossary?: Array<{ english: string; chinese: string }>;
  /** Source-scoped rules disambiguate abbreviated package summaries; these are evidence, not output slots. */
  sourceRuleContext?: Array<{ actor: string; section: string; name: string; description: string }>;
}
export interface LocalizationDraft { texts: Array<{ id: string; text: string }> }
export interface LocalizationReview { verdict: 'accepted' | 'needs_review'; findings: string[] }
export interface ModelReviewedLocalization extends LocalizationDraft {
  version: 1;
  language: 'zh-CN';
  policy: LocalizationPolicy;
  terminology: typeof TERMINOLOGY_VERSION;
  requestHash: string;
  review: LocalizationReview & { translationHash: string; model: string };
}
/** Explicit, local approval by the signed-in GM. It makes no claim about AI review. */
export interface GmApprovedLocalization extends LocalizationDraft {
  version: 2;
  language: 'zh-CN';
  policy: LocalizationPolicy;
  terminology: typeof TERMINOLOGY_VERSION;
  requestHash: string;
  approval: { kind: 'gm'; gmId: string; translationHash: string };
}
export type ReviewedLocalization = ModelReviewedLocalization | GmApprovedLocalization;

const referenceRoot = 'https://5echm.kagangtuya.top/topics/玩家手册2024/术语汇编/';
export const LOCALIZATION_TERMS = [
  ['Bloodied', '浴血', '其他术语.htm'], ['Critical Hit', '重击命中', '其他术语.htm'],
  ['Advantage', '优势', '其他术语.htm'], ['Disadvantage', '劣势', '其他术语.htm'],
  ['Concentration', '专注', '其他术语.htm'], ['Saving Throw', '豁免检定', '其他术语.htm'],
  ['Death Saving Throw', '死亡豁免检定', '其他术语.htm'],
  ['Blinded', '目盲', '状态.htm'], ['Charmed', '魅惑', '状态.htm'], ['Frightened', '恐慌', '状态.htm'],
  ['Grappled', '受擒', '状态.htm'], ['Paralyzed', '麻痹', '状态.htm'], ['Petrified', '石化', '状态.htm'],
  ['Poisoned', '中毒', '状态.htm'], ['Restrained', '束缚', '状态.htm'], ['Stunned', '震慑', '状态.htm'],
  ['Unconscious', '昏迷', '状态.htm'], ['Emanation', '光环', '效应区域.htm'], ['Cone', '锥状', '效应区域.htm'],
].map(([english, chinese, page]) => ({ english: english!, chinese: chinese!, reference: referenceRoot + page })).concat([
  { english: 'Enfeebled', chinese: '衰弱', reference: 'foundry-modules/fvtt-custom-conditions/src/localization.ts' },
  { english: 'Clumsy', chinese: '笨拙', reference: 'foundry-modules/fvtt-custom-conditions/src/localization.ts' },
  { english: 'Slowed', chinese: '减速', reference: 'foundry-modules/fvtt-custom-conditions/src/localization.ts' },
  { english: 'Activity', chinese: '能力活动', reference: 'Forge: distinguish native Activity from action economy' },
  { english: 'CC', chinese: '自定义状态', reference: 'foundry-modules/fvtt-custom-conditions/README.zh-CN.md' },
]);
export const LOCALIZATION_TERM_NOTES = [
  '5E不全书是用户指定的中文术语参考，不是发行方官方中文译本；只取译法，不替换来源规则。',
  'Dazed 译为恍惚，Dominated 译为受支配；此处仅为显示译名。Better Monsters 的完整定义尚未核实，继续由GM裁定，不等同于Stunned，也不自动接管项目自定义状态。',
];

export function localizationRequest(sourceHash: string, texts: LocalizationText[], policy: LocalizationPolicy = LOCALIZATION_POLICY): LocalizationRequest {
  return { version: 1, language: 'zh-CN', policy, terminology: TERMINOLOGY_VERSION,
    terminologyHash: localizationHash({ terms: LOCALIZATION_TERMS, notes: LOCALIZATION_TERM_NOTES }), sourceHash, texts };
}
export function localizationHash(value: unknown): string { return sha256(stable(value)); }
function stable(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
export function localizationRecord(value: unknown, keys: string[], required = keys): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('翻译资料必须是普通数据。');
  const record = value as Record<string, any>;
  if (Object.keys(record).some(key => !keys.includes(key)) || required.some(key => !Object.hasOwn(record, key))) {
    throw new TypeError('翻译资料包含缺失或未知字段。');
  }
  return record;
}
export function decodeLocalizationDraft(value: unknown): LocalizationDraft {
  const record = localizationRecord(value, ['texts']);
  if (!Array.isArray(record.texts) || record.texts.length > 2048) throw new TypeError('翻译文本数量超出范围。');
  const texts = record.texts.map((value: unknown) => {
    const entry = localizationRecord(value, ['id', 'text']);
    if (typeof entry.id !== 'string' || !/^text-[0-9a-f]{24}$/.test(entry.id)
      || typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 100_000) throw new TypeError('翻译条目无效。');
    return { id: entry.id, text: entry.text.trim() };
  });
  if (new Set(texts.map((entry: {id: string}) => entry.id)).size !== texts.length) throw new TypeError('翻译文本身份重复。');
  return { texts };
}
export function decodeLocalizationReview(value: unknown): LocalizationReview {
  const review = localizationRecord(value, ['verdict', 'findings']);
  if (!['accepted', 'needs_review'].includes(review.verdict) || !Array.isArray(review.findings)
    || review.findings.length > 100 || !review.findings.every((s: unknown) => typeof s === 'string' && s.length < 8000)) throw new TypeError('翻译审阅结果无效。');
  if (review.verdict === 'accepted' && review.findings.length) throw new TypeError('翻译审阅仍有未解决问题。');
  return { verdict: review.verdict, findings: [...review.findings] };
}
export function decodeReviewedLocalization(value: unknown): ReviewedLocalization {
  const r = localizationRecord(value, ['version', 'language', 'policy', 'terminology', 'requestHash', 'texts', value && typeof value === 'object' && (value as any).version === 2 ? 'approval' : 'review']);
  if (![1, 2].includes(r.version) || r.language !== 'zh-CN' || ![LOCALIZATION_POLICY, LEGACY_LOCALIZATION_POLICY, FACT_LOCALIZATION_POLICY].includes(r.policy) || r.terminology !== TERMINOLOGY_VERSION
    || typeof r.requestHash !== 'string' || !/^[0-9a-f]{64}$/.test(r.requestHash)) throw new TypeError('翻译语言、术语版本或来源身份不受支持。');
  if (r.version === 2) {
    const approval = localizationRecord(r.approval, ['kind', 'gmId', 'translationHash']);
    if (approval.kind !== 'gm' || typeof approval.gmId !== 'string' || !approval.gmId.trim() || approval.gmId.length > 200
      || typeof approval.translationHash !== 'string' || !/^[0-9a-f]{64}$/.test(approval.translationHash)) throw new TypeError('GM 审批缺少有效身份或绑定。');
    return { version: 2, language: 'zh-CN', policy: r.policy, terminology: TERMINOLOGY_VERSION,
      requestHash: r.requestHash, ...decodeLocalizationDraft({ texts: r.texts }), approval: { kind: 'gm', gmId: approval.gmId, translationHash: approval.translationHash } };
  }
  const review = localizationRecord(r.review, ['verdict', 'findings', 'translationHash', 'model']);
  const decodedReview = decodeLocalizationReview({ verdict: review.verdict, findings: review.findings });
  if (typeof review.translationHash !== 'string' || !/^[0-9a-f]{64}$/.test(review.translationHash)
    || typeof review.model !== 'string' || !review.model.trim() || review.model.length > 200) throw new TypeError('翻译审阅缺少有效绑定。');
  return { version: 1, language: 'zh-CN', policy: r.policy, terminology: TERMINOLOGY_VERSION,
    requestHash: r.requestHash, ...decodeLocalizationDraft({ texts: r.texts }), review: { ...decodedReview, translationHash: review.translationHash, model: review.model } };
}

function localizationNumericLiteral(match:string,offset:number,source:string):string{
  // English numeric modifiers such as failure-margin-5 or margin-1 use a word hyphen.
  // Keep arithmetic negatives (including HP-5), spaced negatives and the Unicode minus strict.
  const prefix=source.slice(0,offset);
  const wordHyphen=/[A-Za-z]+(?:-[A-Za-z]+)+$/u.test(prefix)||/\b(?:margin|level)$/iu.test(prefix);
  return /^-\d/u.test(match)&&wordHyphen?match.slice(1):match;
}

// Read the bounded dice/arithmetic grammar as one value, including grouping and
// signed operands. A flat regex can split (2 + 3) * 4 + 5 into two valid parts.
interface FormulaSpan { start: number; end: number; value: string }
function numericMetadataSpans(source:string):Array<FormulaSpan&{signature:string}>{
  const result:Array<FormulaSpan&{signature:string}>=[];
  const patterns:Array<[string,RegExp]>=[
    ['recharge',/(?:\bRecharge|充能)\s*\(?\s*(\d+\s*(?:[-–—]|至|到|或)\s*\d+)\b/giu],
    ['range',/(?:\b(?:range|reach)|射程|触及)\s*(\d+\s*[-–/]\s*\d+)\s*(?:feet\b|ft\b\.?|miles?\b|尺)/giu],
    ['level',/\b(?:Level|levels)\s*(\d+\s*[-–]\s*\d+)\s*Spells?\b|(\d+\s*(?:[-–—]|至|到)\s*\d+)\s*环法术/giu],
  ];
  for(const [role,pattern] of patterns)for(const match of source.matchAll(pattern)){
    const value=match[1]??match[2]!,start=match.index!+match[0].indexOf(value);
    result.push({start,end:start+value.length,value,signature:role+':'+value.match(/\d+/gu)!.join('/')});
  }
  const markup=[...source.matchAll(/<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]/giu)]
    .map(match=>({start:match.index!,end:match.index!+match[0].length}));
  return result.filter(span=>!markup.some(tag=>span.start<tag.end&&span.end>tag.start)).sort((a,b)=>a.start-b.start);
}
function formulaSpans(source: string): FormulaSpan[] {
  const markup = [...source.matchAll(/<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]/giu)]
    .map(match => ({ start: match.index!, end: match.index! + match[0].length }));
  const space = (at: number) => { while (/\s/u.test(source[at] ?? '')) at++; return at; };
  const expression = (at: number, depth: number): { end: number; operators: number } | undefined => {
    if (depth > 8) return undefined;
    const primary = (start: number): { end: number; operators: number } | undefined => {
      let cursor = space(start);
      if (/[+−-]/u.test(source[cursor] ?? '')) cursor = space(cursor + 1);
      const opening = source[cursor];
      if (opening === '(' || opening === '（') {
        const inside = expression(cursor + 1, depth + 1);
        if (!inside || source[space(inside.end)] !== (opening === '(' ? ')' : '）')) return undefined;
        return { end: space(inside.end) + 1, operators: inside.operators };
      }
      const number = /^(?:\d+d\d+|\d+(?:\.\d+)?)/iu.exec(source.slice(cursor));
      return number ? { end: cursor + number[0].length, operators: 0 } : undefined;
    };
    const first = primary(at);
    if (!first) return undefined;
    let result = first;
    while (true) {
      const operator = space(result.end);
      if (!/[xX×*÷/+−-]/u.test(source[operator] ?? '')) break;
      const next = primary(operator + 1);
      if (!next) break;
      result = { end: next.end, operators: result.operators + next.operators + 1 };
    }
    return result;
  };
  const spans: FormulaSpan[] = [];
  // These source-explicit numeric roles use a hyphen as a bounded interval,
  // not subtraction. Everything outside the labelled interval keeps the full
  // ordered arithmetic grammar (including bare 5-6 and negative operands).
  const intervals = numericMetadataSpans(source);
  let markupIndex = 0;
  for (let at = 0; at < source.length;) {
    while (markup[markupIndex] && markup[markupIndex]!.end <= at) markupIndex++;
    if (markup[markupIndex] && at >= markup[markupIndex]!.start) { at = markup[markupIndex]!.end; continue; }
    if (!/[\d(（+−-]/u.test(source[at]!)
      || (!/[(（]/u.test(source[at]!) && /[\w.]/u.test(source[at - 1] ?? ''))) { at++; continue; }
    const parsed = expression(at, 0);
    if (!parsed || !parsed.operators || (markup[markupIndex] && markup[markupIndex]!.start < parsed.end)) { at++; continue; }
    if(intervals.some(span=>at>=span.start&&parsed.end<=span.end)){at=parsed.end;continue;}
    spans.push({ start: at, end: parsed.end, value: source.slice(at, parsed.end) });
    at = parsed.end;
  }
  return spans;
}
function canonicalFormula(value: string): string {
  return value.replace(/\s+/gu, '').replace(/[（]/gu, '(').replace(/[）]/gu, ')')
    .replace(/[x×*]/giu, '*').replace(/[÷/]/gu, '/').replace(/−/gu, '-').toLowerCase();
}
/** Shared formula lexer for source evidence and translated display checks. */
export function localizationFormulaSpans(source: string): Array<{ start: number; end: number; signature: string }> {
  return formulaSpans(source).map(span => ({
    start: span.start, end: span.end, signature: canonicalFormula(span.value),
  }));
}
function formulas(source: string): string[] { return localizationFormulaSpans(source).map(span => span.signature); }
function withoutFormulas(source: string): string {
  let cursor = 0;
  let result = '';
  for (const span of formulaSpans(source)) { result += source.slice(cursor, span.start); cursor = span.end; }
  return result + source.slice(cursor);
}

/** Generated HTML and numeric literals are locked tokens; the provider only writes prose. */
export function protectLocalizationText(source: string, options: { grammaticalApostrophes?: 'translatable' } = {}): { text: string; restore: (text: string) => string } {
  const tokens: string[] = [];
  // Source-derived body punctuation has no required Chinese counterpart. Reuse
  // the final validator's closed boundary; quotes, attributes and links remain
  // exact. The source/request identity is never rewritten.
  const translatableApostrophes = options.grammaticalApostrophes === 'translatable' && grammaticalApostropheBudget(source) > 0;
  const ordinary = /<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]|\b\d+d\d+(?:\s*[+−-]\s*\d+)?\b|[+−-]?\d+(?:\.\d+)?/giu;
  const protectOrdinary = (segment: string, start: number) => segment.replace(ordinary, (match, offset: number) => {
    if (translatableApostrophes && /^(?:&#(?:39|x0*27);|&apos;)$/iu.test(match)) return "'";
    const numeric = localizationNumericLiteral(match, start + offset, source);
    return `${numeric !== match ? '-' : ''}⟦${tokens.push(numeric) - 1}⟧`;
  });
  let cursor = 0;
  let text = '';
  const urlUnits=localizationSourceUrls(source);
  const touchesUrl=(unit:FormulaSpan)=>urlUnits.some(url=>unit.start<url.end&&unit.end>url.start);
  const formulaUnits=formulaSpans(source).filter(unit=>!touchesUrl(unit));
  const protectedUnits=[...urlUnits,...formulaUnits,...numericMetadataSpans(source)
    .filter(unit=>!touchesUrl(unit)&&!formulaUnits.some(formula=>unit.start<formula.end&&unit.end>formula.start))].sort((a,b)=>a.start-b.start);
  for (const span of protectedUnits) {
    text += protectOrdinary(source.slice(cursor, span.start), cursor);
    text += `⟦${tokens.push(span.value) - 1}⟧`;
    cursor = span.end;
  }
  text += protectOrdinary(source.slice(cursor), cursor);
  return { text, restore(translated) {
    const seen = [...translated.matchAll(/⟦(\d+)⟧/gu)].map(match => Number(match[1]));
    if (seen.length !== tokens.length || new Set(seen).size !== tokens.length || seen.some(index => index >= tokens.length)) throw new TypeError('译文漏掉、重复或添加了受保护的数字、骰式或标记。');
    const htmlTokens = (sequence: number[]) => sequence.filter(index => /^<|^&|^\[\[|^@|^https?:\/\//iu.test(tokens[index]!));
    if (JSON.stringify(htmlTokens(seen)) !== JSON.stringify(htmlTokens(tokens.map((_, i) => i)))) throw new TypeError('译文改变了原始HTML或链接结构。');
    // Raw markup/enrichers are forbidden, including attempts to insert executable Foundry links.
    const prose = translated.replace(/⟦\d+⟧/gu, '');
    if (/[<>]|\[\[|@\w+\[|⟦|⟧/.test(prose)) throw new TypeError('译文添加了未审核的标记。');
    if (localizationSourceUrls(prose).length) throw new TypeError('译文添加了未绑定的来源网址。');
    return translated.replace(/⟦(\d+)⟧/gu, (_match, index) => tokens[Number(index)]!);
  } };
}


/** This bounded source clause describes retaining food, not swallowing it.
 * Compare visible prose across source line-wrap tags while the caller still
 * enforces the exact original markup and numeric tokens. Unknown variants are
 * review-required; this check never changes source or translated content. */
function assertFoodRetentionMeaning(source: string, translated: string, id: string): void {
  const visible = (text: string) => text
    .replace(/<[^>]*>|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]/giu, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/giu, ' ').replace(/\s+/gu, ' ').trim();
  const sentences = (text: string) => visible(text).split(/(?<=[.!?。！？])\s*/u)
    .map(sentence => sentence.replace(/[.!?。！？]+$/u, '').trim()).filter(Boolean);
  const sourceRules = sentences(source).filter(sentence => /\bkeep\s+solid\s+food\s+down\b/iu.test(sentence));
  if (!sourceRules.length) return;
  const supported = /^(?:it|the creature|a creature)\s+can\s+keep\s+solid\s+food\s+down\s+only\s+if\s+(?:it\s+is\s+)?washed\s+down\s+with\s+sea\s*water$/iu;
  if (!sourceRules.every(sentence => supported.test(sentence))) {
    throw new TypeError('食物留存来源句式、条件或液体尚未获得确定性支持，须核对：' + id);
  }
  const subject = '(?:它|该生物|此生物)?';
  const food = '(?:吃下的|吞下的|摄入的)?固体食物';
  const water = '(?:用|以)海水(?:送服|送下)';
  const prefix = '^' + subject + '只有' + water + '[，,]?' + subject;
  const allowed = [
    new RegExp(prefix + food + '才不会(?:被)?吐出(?:来)?$', 'u'),
    new RegExp(prefix + '才(?:能)?(?:让|使)' + food + '不(?:被)?吐出(?:来)?$', 'u'),
    new RegExp(prefix + '才不会吐出(?:来)?' + food + '$', 'u'),
    new RegExp(prefix + '才能留住' + food + '而不(?:呕吐|吐出)$', 'u'),
    new RegExp('^' + food + '必须' + water + '[，,]否则' + subject + '(?:会吐出(?:该食物|它)?|会呕吐)$', 'u'),
  ];
  const candidates = sentences(translated).map(sentence => sentence.replace(/\s+/gu, ''))
    .filter(sentence => sentence.includes('固体食物'));
  if (candidates.length !== sourceRules.length || candidates.some(sentence => !allowed.some(pattern => pattern.test(sentence)))) {
    throw new TypeError('食物留存译义须保留“固体食物不吐出”及“海水送服为必要条件”，吞咽或条件变化不能代替：' + id);
  }
}
/** Source-derived stat-block captions have a fixed display translation. Only
 * an XP header or Challenge annotation with the same source amount qualifies;
 * narrative, titles, identifiers, numbers and markup are never rewritten. */
function completeExperienceLabel(source: string, translated: string): string {
  const plain = source.replace(/<[^>]*>/gu, '\n');
  const amount = '(\\d+(?:[,，]\\d{3})*)';
  const key = (value: string) => value.replace(/[,，]/gu, '');
  const values = new Set([
    ...plain.matchAll(new RegExp(`(?:^|[\\r\\n])\\s*XP[ \\t]+${amount}(?=\\s|$)`, 'giu')),
    ...plain.matchAll(new RegExp(`(?:Challenge|CR|挑战等级)[^\\r\\n()（）]*[（(]\\s*${amount}[ \\t]+XP\\s*[）)]`, 'giu')),
  ].map(match => key(match[1]!)));
  if (!values.size) return translated;
  const head = new RegExp(`(^|\\r\\n|\\n|\\r|<br\\s*\\/?>|<p\\b[^>]*>)(\\s*)XP([ \\t]+)${amount}(?=\\s|<|$)`, 'giu');
  let result = translated.replace(head, (whole, prefix: string, whitespace: string, separator: string, number: string) =>
    values.has(key(number)) ? `${prefix}${whitespace}经验值${separator}${number}` : whole);
  result = result.replace(new RegExp(`([（(]\\s*)${amount}([ \\t]+)XP(\\s*[）)])`, 'giu'),
    (whole, prefix: string, number: string, separator: string, suffix: string) =>
      values.has(key(number)) ? `${prefix}${number}${separator}经验值${suffix}` : whole);
  return result;
}

/** The approved unsupported-size policy retains the exact source category in
 * its Chinese stat label. This changes no dimensions, native size or markup. */
function completeSourceSizeLabel(source: string, translated: string): string {
  const plain = source.replace(/<[^>]*>/gu, '\n');
  if (!/(?:\bSize\s+|原文尺寸[:：]\s*)Colossal\b/iu.test(plain)) return translated;
  return translated.replace(/(?<![\p{Script=Han}])((?:原文尺寸|体型|尺寸)(?:[ \t]*[:：][ \t]*|[ \t]+))([\p{Script=Han}]{1,10})(?![^\r\n<。]{0,20}\bColossal\b)/gu,
    (_whole, prefix: string, label: string) => `${prefix}${label}（Colossal）`);
}

const APOSTROPHE_ENTITY = /&#(?:39|x0*27);|&apos;/giu;
const STRUCTURAL_BLOCK = /(<[^>]*>|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\])/giu;
/** English singular/plural possessives and contractions have no required
 * Chinese punctuation counterpart. All source apostrophes must be grammatical;
 * a quoted phrase or protected attribute keeps the conservative exact policy. */
function grammaticalApostropheBudget(source: string): number {
  const total = [...source.matchAll(APOSTROPHE_ENTITY)].length;
  if (!total) return 0;
  const eligible = source.split(STRUCTURAL_BLOCK).filter((_part, index) => index % 2 === 0)
    .reduce((count, part) => count + [...part.matchAll(/(?<=\p{Script=Latin})(?:&#(?:39|x0*27);|&apos;)(?=\p{Script=Latin})|(?<=\p{Script=Latin}s)(?:&#(?:39|x0*27);|&apos;)(?=\s+\p{Script=Latin})/giu)].length, 0);
  return total === eligible ? total : 0;
}

/** Markdown quote prefixes are display layout at paragraph/line starts. An
 * inline greater-than entity is ordinary protected content and stays exact. */
function withoutMarkdownQuotePrefixes(text:string):string {
  return text.replace(/(^|<(?:p|li|h[1-6])\b[^>]*>|<br\s*\/?>|\r\n|\r|\n)[ \t]*(?:&gt;[ \t]*)+(?=[^\s\d+−&-]|-(?=[ \t]+[*#\p{Script=Latin}\p{Script=Han}])|$)/giu,'$1');
}

/** Clean display prose only. Source text, real quotation marks and protected
 * structures/URLs are never rewritten. Extra/unbound punctuation is left for
 * validation instead of being laundered into a valid draft. */
export function normalizeLocalizationBodyProse(source:string,translated:string):string {
  if(source===translated)return translated;
  const display=withoutMarkdownQuotePrefixes(source)!==source?withoutMarkdownQuotePrefixes(translated):translated;
  const apostrophe=/'|&#(?:39|x0*27);|&apos;/giu;
  const budget=grammaticalApostropheBudget(source);
  const urls=localizationSourceUrls(display);
  const chunks:Array<{text:string;prose:boolean}>=[];let cursor=0;
  const append=(text:string)=>text.split(STRUCTURAL_BLOCK).forEach((part,index)=>chunks.push({text:part,prose:index%2===0}));
  for(const url of urls){append(display.slice(cursor,url.start));chunks.push({text:url.value,prose:false});cursor=url.end;}
  append(display.slice(cursor));
  const count=chunks.filter(c=>c.prose).reduce((n,c)=>n+[...c.text.matchAll(apostrophe)].length,0);
  // Inline HTML cannot split a real quotation into apparently isolated marks.
  // Count prose punctuation across inline tags, resetting only at line/block
  // boundaries. Ambiguous multi-mark lines remain for explicit review.
  let line=0;
  const lines=chunks.map(chunk=>{
    if(!chunk.prose&&/^<\/?(?:br|p|li|h[1-6])\b/iu.test(chunk.text))line++;
    return line;
  });
  const lineCounts=new Map<number,number>(),lineText=new Map<number,string>(),quotedLines=new Set<number>();
  chunks.forEach((chunk,index)=>{if(chunk.prose){
    const key=lines[index]!;
    lineCounts.set(key,(lineCounts.get(key)??0)+[...chunk.text.matchAll(apostrophe)].length);
    lineText.set(key,(lineText.get(key)??'')+chunk.text);
    if(/["‘’“”「」『』]|&quot;|&#(?:34|x0*22);/iu.test(chunk.text))quotedLines.add(key);
  }});
  return chunks.map((chunk,index)=>{
    if(!chunk.prose)return chunk.text;
    let text=chunk.text.replace(/^[ \t]*#{1,6}[ \t]+(?=\S)/gmu,'')
      .replace(/(\*{1,3})([^*\r\n]*[\u3400-\u9fff][^*\r\n]*)\1/gu,'$2');
    if(budget&&count<=budget&&lineCounts.get(lines[index]!)===1&&!quotedLines.has(lines[index]!)){
      text=text.replace(/(?<=\p{Script=Han})(?:'|&#(?:39|x0*27);|&apos;)(?=\p{Script=Han})|(?<=[\p{Script=Han}。！？；，,.!?;])(?:'|&#(?:39|x0*27);|&apos;)(?=\s*$)/giu,'');
      // PDF wrapping can move a source possessive mark after a hard break.
      // Require an immediate Chinese continuation, not an empty paragraph or
      // a quoted source. The source-wide grammatical budget still applies.
      if(/\p{Script=Han}\s*$/u.test(lineText.get(lines[index]!-1)??''))
        text=text.replace(/^([ \t]*)(?:'|&#(?:39|x0*27);|&apos;)(?=\p{Script=Han})/iu,'$1');
    }
    return text;
  }).join('');
}

export function validateLocalizationDraft(request: LocalizationRequest, value: unknown): LocalizationDraft {
  const draft = decodeLocalizationDraft(value);
  const map = new Map(draft.texts.map(entry => [entry.id, entry.text]));
  if (map.size !== request.texts.length || request.texts.some(entry => !map.has(entry.id))) throw new TypeError('翻译覆盖不完整或含有未知文本身份。');
  for (const entry of request.texts) {
    const text = entry.kind === 'body' ? completeSourceSizeLabel(entry.source, completeExperienceLabel(entry.source, map.get(entry.id)!)) : map.get(entry.id)!;
    map.set(entry.id, text);
    const sourceUrls = localizationSourceUrls(entry.source), translatedUrls = localizationSourceUrls(text);
    if (JSON.stringify(sourceUrls.map(url=>url.value)) !== JSON.stringify(translatedUrls.map(url=>url.value)))
      throw new TypeError(`译文改变来源网址、数量或顺序：${entry.id}`);
    const sourceProse = withoutLocalizationSourceUrls(entry.source, sourceUrls);
    const translatedProse = withoutLocalizationSourceUrls(text, translatedUrls);
    const apostropheBudget = entry.kind === 'body' ? grammaticalApostropheBudget(sourceProse) : 0;
    const markdownQuotes=entry.kind==='body'&&withoutMarkdownQuotePrefixes(sourceProse)!==sourceProse;
    let comparisonSource = markdownQuotes?withoutMarkdownQuotePrefixes(sourceProse):sourceProse;
    let comparisonText = markdownQuotes?withoutMarkdownQuotePrefixes(translatedProse):translatedProse;
    if (apostropheBudget) {
      const all = [...translatedProse.matchAll(APOSTROPHE_ENTITY)].length;
      const outside = translatedProse.split(STRUCTURAL_BLOCK).filter((_part, index) => index % 2 === 0)
        .reduce((count, part) => count + [...part.matchAll(APOSTROPHE_ENTITY)].length, 0);
      if (all > apostropheBudget || all !== outside) throw new TypeError(`译文改变受保护标记或引入撇号实体：${entry.id}`);
      comparisonSource = comparisonSource.replace(APOSTROPHE_ENTITY, '');
      comparisonText = comparisonText.replace(APOSTROPHE_ENTITY, '');
    }
    // Re-tokenize both sides for import-time validation, after protected tokens have been restored.
    const numbers = (s: string) => {
      const visible=withoutFormulas(s.replace(/<[^>]*>/g,''));
      let prose=visible;
      for(const interval of numericMetadataSpans(visible).reverse())prose=prose.slice(0,interval.start)+prose.slice(interval.end);
      return [...prose.matchAll(/\d+d\d+(?:\s*[+−-]\s*\d+)?|[+−-]?\d+(?:\.\d+)?/giu)]
        .map(match=>localizationNumericLiteral(match[0],match.index!,prose).replace(/\s+/g,'')).sort();
    };
    const tags = (s: string) => s.match(/<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]/giu) ?? [];
    const metadata=(s:string)=>numericMetadataSpans(s.replace(/<[^>]*>/gu,'')).map(span=>span.signature).sort();
    if (JSON.stringify(numbers(comparisonSource)) !== JSON.stringify(numbers(comparisonText))
      || JSON.stringify(formulas(comparisonSource)) !== JSON.stringify(formulas(comparisonText))
      || JSON.stringify(metadata(comparisonSource)) !== JSON.stringify(metadata(comparisonText))
      || JSON.stringify(tags(comparisonSource)) !== JSON.stringify(tags(comparisonText))) {
      throw new TypeError(`译文改变数字、骰式或标记：${entry.id}`);
    }
    // These two source shapes have independently meaningful numbers. A sorted
    // numeric inventory alone cannot tell range from damage.
    const ranges = [...sourceProse.matchAll(/\bwithin\s+(\d+)\s+feet\b/giu)].map(match => match[1]);
    const damages = [...sourceProse.matchAll(/\btakes\s+(\d+)\s+[a-z]+\s+damage\b/giu)].map(match => match[1]);
    if (ranges.length && damages.length) {
      const translatedRanges = [...translatedProse.matchAll(/(\d+)\s*(?:英)?尺(?:的)?(?:范围)?(?:之|以)?内/gu)].map(match => match[1]);
      const translatedDamages = [...translatedProse.matchAll(/(\d+)\s*点[^。，；;]{0,12}伤害/gu)].map(match => match[1]);
      if (JSON.stringify(ranges) !== JSON.stringify(translatedRanges)
        || JSON.stringify(damages) !== JSON.stringify(translatedDamages)) {
      throw new TypeError(`译文改变范围或伤害数值用途：${entry.id}`);
      }
    }
    const armour = /\b(?:a|the)\s+creature\s+(not\s+)?wearing\s+heavy\s+armou?r\b/iu.exec(sourceProse)
      ?? /\bif\s+(?:it|the target|a creature|the creature)\s+(?:is\s+)?(not\s+)?wearing\s+heavy\s+armou?r\b/iu.exec(sourceProse);
    if (armour) {
      const visible = translatedProse.replace(/<[^>]*>/gu, '');
      const mentions = [...visible.matchAll(/重甲/gu)];
      const before = visible.slice(0, mentions[0]?.index ?? 0);
      const boundary = Math.max(...['，', ',', '。', '；', ';', '：', ':', '\n'].map(mark => before.lastIndexOf(mark)));
      const clause = visible.slice(boundary + 1, (mentions[0]?.index ?? 0) + 2).trim();
      // Match the entire known condition clause. Matching only a suffix such as
      // 身穿重甲 would misread 不是身穿重甲 or 不再穿着重甲 as affirmative.
      const known = /^(?:(?:如果|若|当)(?:它|目标|该生物|此生物|一个生物|生物)?|(?:它|目标|该生物|此生物|一个生物|生物)(?:如果|若|当)?)?(并未|并不|并非|没有|未曾|不曾|未|不|没|非)?(穿着|穿戴|身穿|身披|装备着|装备了|装备|披挂|佩戴|穿上|穿了|穿|着)\s*重甲$/u.exec(clause);
      if (mentions.length !== 1 || !known || Boolean(known[1]) !== Boolean(armour[1])) {
        throw new TypeError(`译文改变重甲条件的肯定或否定：${entry.id}`);
      }
    }
    let prose = withoutFormulas(translatedProse).replace(/<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]|\d+d\d+(?:\s*[+−-]\s*\d+)?|\b(?:GM|DC|HP|AC|CR|PDF)(?=\b|\d)|\bD20\b/giu, '');
    if (entry.kind === 'body' && /(?:\bSize\s+|原文尺寸[:：]\s*)Colossal\b/iu.test(sourceProse)) {
      const sourceCount = [...sourceProse.matchAll(/\bColossal\b/giu)].length;
      if ([...translatedProse.matchAll(/\bColossal\b/giu)].length !== sourceCount) throw new TypeError(`译文须完整保留原文尺寸 Colossal：${entry.id}`);
      prose = prose.replace(/\bColossal\b/giu, '');
    }
    const urlOnlyBody = entry.kind === 'body' && sourceUrls.length > 0
      && !/[\p{L}\p{N}]/u.test(sourceProse.replace(STRUCTURAL_BLOCK, '').replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/giu, ''));
    if ((!/[\u3400-\u9fff]/u.test(prose) && !urlOnlyBody) || /[A-Za-z]/u.test(prose) || /⟦|⟧/.test(translatedProse)) throw new TypeError(`译文未完成中文化：${entry.id}；残留英文：${(prose.match(/[A-Za-z][A-Za-z-]*/gu) ?? []).join(' ').slice(0, 120) || '缺少中文或占位符未还原'}`);
    if (entry.kind === 'title' && /<|>|\r|\n/.test(translatedProse)) throw new TypeError('中文标题不得包含标记或换行。');
    for (const term of LOCALIZATION_TERMS) {
      if (new RegExp(`\\b${term.english}s?\\b`, 'i').test(sourceProse) && !translatedProse.includes(term.chinese)) throw new TypeError(`术语未按已核译法处理：${term.english} → ${term.chinese}（${entry.id}）`);
    }
    if (/\bDazed\b/i.test(sourceProse) && !translatedProse.includes('恍惚')) throw new TypeError(`Dazed须保留恍惚身份，不能替换为震慑：${entry.id}`);
    // Chinese places the source between 受 and 支配 (e.g. 受眼魔支配); this is still the distinct condition.
    if (/\bDominated\b/i.test(sourceProse) && !/受[\u3400-\u9fff]{0,20}支配/u.test(translatedProse)) throw new TypeError(`Dominated须保留独立分支：${entry.id}`);
    if (entry.kind === 'body') assertFoodRetentionMeaning(sourceProse, translatedProse, entry.id);
  }
  return { texts: request.texts.map(entry => ({ id: entry.id, text: map.get(entry.id)! })) };
}

/** Unapproved drafts remain editable; these findings must be resolved before acceptance. */
export function localizationMeaningFindings(request:LocalizationRequest,value:LocalizationDraft):string[]{
  const valid=validateLocalizationDraft(request,value),texts=new Map(valid.texts.map(entry=>[entry.id,entry.text]));
  return request.texts.flatMap(field=>{
    if(field.kind!=='body')return [];
    const text=texts.get(field.id)!,clean=normalizeLocalizationBodyProse(field.source,text);
    const marks=(v:string)=>[...v.matchAll(/'|&#(?:39|x0*27);|&apos;/giu)].length;
    return [...participantMeaningFindings(field.source,text),...ruleRelationMeaningFindings(field.source,text),
      ...(marks(clean)<marks(text)?['中文正文仍有来源语法撇号残留，须修订后重新核对。']:[])]
      .map(message=>`${field.id}：${message}`);
  });
}
function assertLocalizationMeaning(request:LocalizationRequest,draft:LocalizationDraft):void{
  const findings=localizationMeaningFindings(request,draft);
  if(findings.length)throw new TypeError(`中文来源含义须核对：${findings.join('；')}`);
}
export function acceptLocalization(request: LocalizationRequest, draft: LocalizationDraft, review: LocalizationReview, model: string): ModelReviewedLocalization {
  const valid = validateLocalizationDraft(request, draft);
  assertLocalizationMeaning(request,valid);
  const checked = decodeLocalizationReview(review);
  if (checked.verdict !== 'accepted') throw new TypeError(`中文含义仍需核对：${checked.findings.join('；')}`);
  const requestHash = localizationHash(request);
  return decodeReviewedLocalization({ version: 1, language: 'zh-CN', policy: request.policy, terminology: TERMINOLOGY_VERSION, requestHash,
    texts: valid.texts, review: { ...checked, translationHash: localizationHash({ requestHash, texts: valid.texts }), model } }) as ModelReviewedLocalization;
}
export function approveLocalizationByGm(request: LocalizationRequest, draft: LocalizationDraft, gmId: string): GmApprovedLocalization {
  const valid = validateLocalizationDraft(request, draft);
  assertLocalizationMeaning(request,valid);
  const requestHash = localizationHash(request);
  return decodeReviewedLocalization({ version: 2, language: 'zh-CN', policy: request.policy, terminology: TERMINOLOGY_VERSION,
    requestHash, texts: valid.texts, approval: { kind: 'gm', gmId, translationHash: localizationHash({ requestHash, texts: valid.texts }) } }) as GmApprovedLocalization;
}
export function localizationTranslationHash(value: ReviewedLocalization): string {
  return value.version === 1 ? value.review.translationHash : value.approval.translationHash;
}
export function assertReviewedLocalization(request: LocalizationRequest, value: unknown): ReviewedLocalization {
  const reviewed = decodeReviewedLocalization(value);
  const valid = validateLocalizationDraft(request, { texts: reviewed.texts });
  assertLocalizationMeaning(request,valid);
  if (reviewed.policy !== request.policy || reviewed.requestHash !== localizationHash(request)
    || (reviewed.version === 1 && (reviewed.review.verdict !== 'accepted' || reviewed.review.findings.length))
    || localizationTranslationHash(reviewed) !== localizationHash({ requestHash: reviewed.requestHash, texts: valid.texts })) throw new TypeError('译文或来源已改变，必须重新审核。');
  return reviewed;
}

/** Deduplication is semantic text identity, never a monster-name special case. */
export function localizationText(kind: LocalizationText['kind'], source: string): LocalizationText {
  return { id: `text-${localizationHash({ kind, source }).slice(0, 24)}`, kind, source };
}

export interface EncounterLocalization {
  sourcePackageId: string;
  actors: Array<{ key: string; translation: ReviewedLocalization }>;
  packageText: ReviewedLocalization;
}
export function decodeEncounterLocalization(value: unknown): EncounterLocalization {
  const record = localizationRecord(value, ['sourcePackageId', 'actors', 'packageText']);
  if (typeof record.sourcePackageId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.sourcePackageId) || record.sourcePackageId.length > 96
    || !Array.isArray(record.actors) || record.actors.length < 1 || record.actors.length > 20) throw new TypeError('战斗包翻译身份无效。');
  const actors = record.actors.map((value: unknown) => {
    const entry = localizationRecord(value, ['key', 'translation']);
    if (typeof entry.key !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.key)) throw new TypeError('翻译角色身份无效。');
    return { key: entry.key, translation: decodeReviewedLocalization(entry.translation) };
  });
  if (new Set(actors.map((actor: {key: string}) => actor.key)).size !== actors.length) throw new TypeError('翻译角色身份重复。');
  const packageText = decodeReviewedLocalization(record.packageText);
  if (actors.some(actor => actor.translation.policy !== packageText.policy)) throw new TypeError('角色与战斗包的名称格式审核不一致。');
  return { sourcePackageId: record.sourcePackageId, actors, packageText };
}
