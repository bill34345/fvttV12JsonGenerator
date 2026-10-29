import type { HandbookCategory, HandbookContent, HandbookEntry, HandbookModel, HandbookReview, HandbookRoute } from './types';

export const HANDBOOK_CATEGORIES: Readonly<Record<HandbookCategory, string>> = Object.freeze({
  convert: '转换与导入',
  library: '资料与内容',
  play: '跑团辅助',
  maintain: '维护与开发',
});

export const HANDBOOK_DESCRIPTIONS: Readonly<Record<HandbookCategory, string>> = Object.freeze({
  convert: '把 Markdown、TXT、PDF 或图片中的资料带进 Foundry。',
  library: '整理资料、角色图片和可复用的职业与种族内容。',
  play: '查找安装在 Foundry 里的面板、房规和交互工具。',
  maintain: '查看性能、检查生成结果，了解环境和开发工具。',
});

const CATEGORIES = Object.keys(HANDBOOK_CATEGORIES) as HandbookCategory[];

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonempty(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a nonempty string`);
  }
  return value;
}

function strings(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return Object.freeze(value.map((item, index) => nonempty(item, `${name}[${index}]`)));
}

function copyEntry(value: unknown, index: number, sources: Readonly<Record<string, string>>): HandbookEntry {
  const entry = record(value, `entries[${index}]`);
  const id = nonempty(entry.id, `entries[${index}].id`);
  if (!/^[a-z0-9-]+$/.test(id)) throw new TypeError(`entries[${index}].id is invalid`);
  if (entry.entryId !== id) throw new TypeError(`entries[${index}].entryId must equal id`);
  if (!CATEGORIES.includes(entry.category as HandbookCategory)) {
    throw new TypeError(`entries[${index}].category is invalid`);
  }
  if (entry.foundryModuleId !== null && typeof entry.foundryModuleId !== 'string') {
    throw new TypeError(`entries[${index}].foundryModuleId must be a string or null`);
  }
  if (typeof entry.foundryModuleId === 'string') nonempty(entry.foundryModuleId, `entries[${index}].foundryModuleId`);
  if (entry.module !== undefined && typeof entry.module !== 'string') {
    throw new TypeError(`entries[${index}].module must be a string`);
  }
  if (typeof entry.module === 'string') nonempty(entry.module, `entries[${index}].module`);
  if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
    throw new TypeError(`entries[${index}].steps must be a nonempty array`);
  }
  const steps = Object.freeze(entry.steps.map((value: unknown, stepIndex: number) => {
    const step = record(value, `entries[${index}].steps[${stepIndex}]`);
    const title = nonempty(step.title, `entries[${index}].steps[${stepIndex}].title`);
    const text = nonempty(step.text, `entries[${index}].steps[${stepIndex}].text`);
    if (step.command !== undefined && typeof step.command !== 'string') {
      throw new TypeError(`entries[${index}].steps[${stepIndex}].command must be a string`);
    }
    return Object.freeze(step.command === undefined ? { title, text } : { title, text, command: step.command });
  }));
  const entrySources = strings(entry.sources, `entries[${index}].sources`);
  if (!entrySources.length) throw new TypeError(`entries[${index}].sources must not be empty`);
  for (const path of entrySources) {
    if (!Object.hasOwn(sources, path)) throw new TypeError(`entries[${index}] references an absent source: ${path}`);
  }
  return Object.freeze({
    id,
    entryId: id,
    ownerDirectory: nonempty(entry.ownerDirectory, `entries[${index}].ownerDirectory`),
    foundryModuleId: entry.foundryModuleId as string | null,
    ...(entry.module === undefined ? {} : { module: entry.module as string }),
    category: entry.category as HandbookCategory,
    title: nonempty(entry.title, `entries[${index}].title`),
    summary: nonempty(entry.summary, `entries[${index}].summary`),
    when: nonempty(entry.when, `entries[${index}].when`),
    requires: strings(entry.requires, `entries[${index}].requires`),
    steps,
    outputs: strings(entry.outputs, `entries[${index}].outputs`),
    limits: strings(entry.limits, `entries[${index}].limits`),
    keywords: strings(entry.keywords, `entries[${index}].keywords`),
    sources: entrySources,
    watch: strings(entry.watch, `entries[${index}].watch`),
  });
}

function copySources(value: unknown): Readonly<Record<string, string>> {
  const input = record(value, 'sources');
  const sources: Record<string, string> = Object.create(null);
  for (const path of Object.keys(input)) sources[nonempty(path, 'source path')] = nonempty(input[path], `sources[${path}]`);
  return Object.freeze(sources);
}

function copyReviews(value: unknown): Readonly<Record<string, HandbookReview>> {
  const input = record(value, 'reviews');
  const reviews: Record<string, HandbookReview> = Object.create(null);
  for (const id of Object.keys(input)) {
    const review = record(input[id], `reviews[${id}]`);
    reviews[nonempty(id, 'review id')] = Object.freeze({
      fingerprint: nonempty(review.fingerprint, `reviews[${id}].fingerprint`),
      reviewedOn: nonempty(review.reviewedOn, `reviews[${id}].reviewedOn`),
      note: nonempty(review.note, `reviews[${id}].note`),
    });
  }
  return Object.freeze(reviews);
}

export function createHandbookModel(input: HandbookContent): HandbookModel {
  const raw = record(input, 'content');
  if (raw.schemaVersion !== 1) throw new TypeError('Unsupported handbook schemaVersion');
  const sources = copySources(raw.sources);
  const reviews = copyReviews(raw.reviews);
  if (!Array.isArray(raw.entries)) throw new TypeError('entries must be an array');
  const ids = new Set<string>();
  const entries = Object.freeze(raw.entries.map((value, index) => {
    const entry = copyEntry(value, index, sources);
    if (ids.has(entry.id)) throw new TypeError(`Duplicate handbook entry id: ${entry.id}`);
    ids.add(entry.id);
    return entry;
  }));
  const content: HandbookContent = Object.freeze({ schemaVersion: 1, entries, reviews, sources });
  const sourceNames = Object.freeze(Object.keys(sources));
  const latestReview = Object.values(reviews).map(review => review.reviewedOn).sort().at(-1) || '未登记';
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const searchable = entries.map((entry, index) => ({
    entry,
    index,
    title: entry.title.toLocaleLowerCase(),
    primary: [entry.title, entry.summary, entry.when, ...entry.keywords].join(' ').toLocaleLowerCase(),
    text: (JSON.stringify(entry) + ' ' + entry.sources.map(path => sources[path]).join(' ')).toLocaleLowerCase(),
  }));

  function search(query: string): readonly HandbookEntry[] {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return Object.freeze(searchable
      .filter(item => terms.every(term => item.text.includes(term)))
      .map(item => ({ item, score: terms.reduce((score, term) => score + (item.title.includes(term) ? 6 : item.primary.includes(term) ? 2 : 0), 0) }))
      .sort((a, b) => b.score - a.score || a.item.index - b.item.index)
      .map(result => result.item.entry));
  }

  function resolveRoute(rawRoute: string): HandbookRoute {
    let decoded: string;
    try { decoded = decodeURIComponent(rawRoute.replace(/^#/, '')) || 'home'; }
    catch { return { kind: 'missing', title: '未找到', decoded: rawRoute }; }
    if (decoded === 'home') return { kind: 'home', title: '概览', decoded };
    if (decoded === 'guide') return { kind: 'guide', title: '第一次使用', decoded };
    if (decoded === 'updates') return { kind: 'updates', title: '手册更新记录', decoded };
    if (decoded === 'all') return { kind: 'category', title: '全部工具', decoded, category: 'all', entries };
    if (decoded.startsWith('category/')) {
      const category = decoded.slice(9) as HandbookCategory;
      if (Object.hasOwn(HANDBOOK_CATEGORIES, category)) {
        return { kind: 'category', title: HANDBOOK_CATEGORIES[category], decoded, category, entries: Object.freeze(entries.filter(entry => entry.category === category)) };
      }
    }
    if (decoded.startsWith('tool/')) {
      const entry = byId.get(decoded.slice(5));
      if (entry) return { kind: 'tool', title: entry.title, decoded, entry };
    }
    if (decoded.startsWith('source/')) {
      const path = decoded.slice(7);
      if (Object.hasOwn(sources, path)) {
        const text = sources[path];
        const owners = Object.freeze(entries.filter(entry => entry.sources.includes(path)));
        if (owners.length && typeof text === 'string') return { kind: 'source', title: '原始说明', decoded, path, text, owners };
      }
    }
    if (decoded.startsWith('search/')) {
      return { kind: 'search', title: '搜索', decoded, query: decoded.slice(7) };
    }
    return { kind: 'missing', title: '未找到', decoded };
  }

  return Object.freeze({ content, sourceNames, latestReview, resolveRoute, search });
}
