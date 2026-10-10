import { sha256 } from './hash';

/** Display text only. Paths, document IDs and executable rules are never provider output. */
export const LEGACY_LOCALIZATION_POLICY = 'zh-CN-bilingual-titles-v1' as const;
export const LOCALIZATION_POLICY = 'zh-CN-space-separated-titles-v2' as const;
export type LocalizationPolicy = typeof LOCALIZATION_POLICY | typeof LEGACY_LOCALIZATION_POLICY;
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
export interface ReviewedLocalization extends LocalizationDraft {
  version: 1;
  language: 'zh-CN';
  policy: LocalizationPolicy;
  terminology: typeof TERMINOLOGY_VERSION;
  requestHash: string;
  review: LocalizationReview & { translationHash: string; model: string };
}

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
  const r = localizationRecord(value, ['version', 'language', 'policy', 'terminology', 'requestHash', 'texts', 'review']);
  if (r.version !== 1 || r.language !== 'zh-CN' || ![LOCALIZATION_POLICY, LEGACY_LOCALIZATION_POLICY].includes(r.policy) || r.terminology !== TERMINOLOGY_VERSION
    || typeof r.requestHash !== 'string' || !/^[0-9a-f]{64}$/.test(r.requestHash)) throw new TypeError('翻译语言、术语版本或来源身份不受支持。');
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

/** Generated HTML and numeric literals are locked tokens; the provider only writes prose. */
export function protectLocalizationText(source: string): { text: string; restore: (text: string) => string } {
  const tokens: string[] = [];
  const text = source.replace(/<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]|\b\d+d\d+(?:\s*[+−-]\s*\d+)?\b|[+−-]?\d+(?:\.\d+)?/giu,
    (match,offset:number) => {
      const numeric=localizationNumericLiteral(match,offset,source);
      return `${numeric!==match?'-':''}⟦${tokens.push(numeric) - 1}⟧`;
    });
  return { text, restore(translated) {
    const seen = [...translated.matchAll(/⟦(\d+)⟧/gu)].map(match => Number(match[1]));
    if (seen.length !== tokens.length || new Set(seen).size !== tokens.length || seen.some(index => index >= tokens.length)) throw new TypeError('译文漏掉、重复或添加了受保护的数字、骰式或标记。');
    const htmlTokens = (sequence: number[]) => sequence.filter(index => /^<|^&|^\[\[|^@/.test(tokens[index]!));
    if (JSON.stringify(htmlTokens(seen)) !== JSON.stringify(htmlTokens(tokens.map((_, i) => i)))) throw new TypeError('译文改变了原始HTML或链接结构。');
    // Raw markup/enrichers are forbidden, including attempts to insert executable Foundry links.
    const prose = translated.replace(/⟦\d+⟧/gu, '');
    if (/[<>]|\[\[|@\w+\[|⟦|⟧/.test(prose)) throw new TypeError('译文添加了未审核的标记。');
    return translated.replace(/⟦(\d+)⟧/gu, (_match, index) => tokens[Number(index)]!);
  } };
}

export function validateLocalizationDraft(request: LocalizationRequest, value: unknown): LocalizationDraft {
  const draft = decodeLocalizationDraft(value);
  const map = new Map(draft.texts.map(entry => [entry.id, entry.text]));
  if (map.size !== request.texts.length || request.texts.some(entry => !map.has(entry.id))) throw new TypeError('翻译覆盖不完整或含有未知文本身份。');
  for (const entry of request.texts) {
    const text = map.get(entry.id)!;
    // Re-tokenize both sides for import-time validation, after protected tokens have been restored.
    const numbers = (s: string) => {
      const prose=s.replace(/<[^>]*>/g,'');
      return [...prose.matchAll(/\d+d\d+(?:\s*[+−-]\s*\d+)?|[+−-]?\d+(?:\.\d+)?/giu)]
        .map(match=>localizationNumericLiteral(match[0],match.index!,prose).replace(/\s+/g,'')).sort();
    };
    const tags = (s: string) => s.match(/<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]/giu) ?? [];
    if (JSON.stringify(numbers(entry.source)) !== JSON.stringify(numbers(text)) || JSON.stringify(tags(entry.source)) !== JSON.stringify(tags(text))) {
      throw new TypeError(`译文改变数字、骰式或标记：${entry.id}`);
    }
    const prose = text.replace(/<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);|\[\[[\s\S]*?\]\]|@(?:UUID|Compendium)\[[^\]]+\]|\d+d\d+(?:\s*[+−-]\s*\d+)?|\b(?:GM|DC|HP|AC|CR|PDF)(?=\b|\d)|\bD20\b/giu, '');
    if (!/[\u3400-\u9fff]/u.test(prose) || /[A-Za-z]/u.test(prose) || /⟦|⟧/.test(text)) throw new TypeError(`译文未完成中文化：${entry.id}；残留英文：${(prose.match(/[A-Za-z][A-Za-z-]*/gu) ?? []).join(' ').slice(0, 120) || '缺少中文或占位符未还原'}`);
    if (entry.kind === 'title' && /<|>|\r|\n/.test(text)) throw new TypeError('中文标题不得包含标记或换行。');
    for (const term of LOCALIZATION_TERMS) {
      if (new RegExp(`\\b${term.english}s?\\b`, 'i').test(entry.source) && !text.includes(term.chinese)) throw new TypeError(`术语未按已核译法处理：${term.english} → ${term.chinese}（${entry.id}）`);
    }
    if (/\bDazed\b/i.test(entry.source) && !text.includes('恍惚')) throw new TypeError(`Dazed须保留恍惚身份，不能替换为震慑：${entry.id}`);
    // Chinese places the source between 受 and 支配 (e.g. 受眼魔支配); this is still the distinct condition.
    if (/\bDominated\b/i.test(entry.source) && !/受[\u3400-\u9fff]{0,20}支配/u.test(text)) throw new TypeError(`Dominated须保留独立分支：${entry.id}`);
  }
  return { texts: request.texts.map(entry => ({ id: entry.id, text: map.get(entry.id)! })) };
}

export function acceptLocalization(request: LocalizationRequest, draft: LocalizationDraft, review: LocalizationReview, model: string): ReviewedLocalization {
  const valid = validateLocalizationDraft(request, draft);
  const checked = decodeLocalizationReview(review);
  if (checked.verdict !== 'accepted') throw new TypeError(`中文含义仍需核对：${checked.findings.join('；')}`);
  const requestHash = localizationHash(request);
  return decodeReviewedLocalization({ version: 1, language: 'zh-CN', policy: request.policy, terminology: TERMINOLOGY_VERSION, requestHash,
    texts: valid.texts, review: { ...checked, translationHash: localizationHash({ requestHash, texts: valid.texts }), model } });
}
export function assertReviewedLocalization(request: LocalizationRequest, value: unknown): ReviewedLocalization {
  const reviewed = decodeReviewedLocalization(value);
  const valid = validateLocalizationDraft(request, { texts: reviewed.texts });
  if (reviewed.policy !== request.policy || reviewed.requestHash !== localizationHash(request) || reviewed.review.verdict !== 'accepted' || reviewed.review.findings.length
    || reviewed.review.translationHash !== localizationHash({ requestHash: reviewed.requestHash, texts: valid.texts })) throw new TypeError('译文或来源已改变，必须重新审核。');
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
