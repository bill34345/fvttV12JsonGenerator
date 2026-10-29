import { expect, test } from 'bun:test';
import { createHandbookModel, HANDBOOK_CATEGORIES, HANDBOOK_DESCRIPTIONS } from '../src/model';
import type { HandbookContent, HandbookEntry } from '../src/types';

function entry(id: string, overrides: Partial<HandbookEntry> = {}): HandbookEntry {
  return {
    id,
    entryId: id,
    ownerDirectory: 'foundry-modules/example',
    foundryModuleId: 'example',
    category: 'play',
    title: '示例工具',
    summary: '查看资料',
    when: '跑团前',
    requires: ['已准备资料'],
    steps: [{ title: '打开', text: '查看结果' }],
    outputs: ['结果'],
    limits: ['需核对'],
    keywords: [],
    sources: [`docs/${id}.md`],
    watch: ['foundry-modules/example/'],
    ...overrides,
  };
}

function content(entries: HandbookEntry[] = [entry('one')]): HandbookContent {
  return {
    schemaVersion: 1,
    entries,
    reviews: { one: { fingerprint: 'abc', reviewedOn: '2026-10-11', note: '已核对' } },
    sources: Object.fromEntries(entries.map(item => [item.sources[0], '离线原文'])),
  };
}

test('keeps the existing Chinese category copy and resolves supported routes', () => {
  const model = createHandbookModel(content());
  expect(HANDBOOK_CATEGORIES.maintain).toBe('维护与开发');
  expect(HANDBOOK_DESCRIPTIONS.maintain).toBe('查看性能、检查生成结果，了解环境和开发工具。');
  expect(model.resolveRoute('')).toMatchObject({ kind: 'home', decoded: 'home' });
  expect(model.resolveRoute('home').kind).toBe('home');
  expect(model.resolveRoute('guide').kind).toBe('guide');
  expect(model.resolveRoute('updates').kind).toBe('updates');
  expect(model.resolveRoute('all')).toMatchObject({ kind: 'category', category: 'all' });
  expect(model.resolveRoute('category/play')).toMatchObject({ kind: 'category', category: 'play', entries: [model.content.entries[0]] });
  expect(model.resolveRoute('tool/one')).toMatchObject({ kind: 'tool', entry: model.content.entries[0] });
  expect(model.resolveRoute('search/%E6%80%AA%E7%89%A9')).toMatchObject({ kind: 'search', query: '怪物' });
  expect(model.resolveRoute('tool/unknown').kind).toBe('missing');
  expect(model.resolveRoute('category/unknown').kind).toBe('missing');
  expect(model.resolveRoute('unexpected').kind).toBe('missing');
  expect(model.latestReview).toBe('2026-10-11');
});

test('ranks full multi-term matches by title, primary fields, then source text, preserving ties', () => {
  const entries = [
    entry('raw', { title: '索引', sources: ['docs/raw.md'] }),
    entry('primary', { title: '战斗工具', summary: '怪物说明', keywords: ['操作台'] }),
    entry('title', { title: '怪物操作台', summary: '打开工具', keywords: ['工作台'] }),
    entry('raw-tie', { title: '附录', sources: ['docs/raw-tie.md'] }),
    entry('partial', { title: '怪物记录' }),
  ];
  const data = content(entries);
  (data.sources as Record<string, string>)['docs/raw.md'] = '怪物 操作台 的原文';
  (data.sources as Record<string, string>)['docs/raw-tie.md'] = '怪物 操作台 的原文';
  const model = createHandbookModel(data);
  expect(model.search(' 怪物   操作台 ').map(item => item.id)).toEqual(['title', 'primary', 'raw', 'raw-tie']);
  expect(model.search('工作台').map(item => item.id)).toEqual(['title']);
  expect(model.search('怪物 不存在')).toEqual([]);
  expect(model.search('  ').map(item => item.id)).toEqual(entries.map(item => item.id));
});

test('decodes source deep links and requires an owned source with an entry owner', () => {
  const path = 'docs/中文 说明.md';
  const data = content([entry('owned', { sources: [path] })]);
  (data.sources as Record<string, string>)['docs/orphan.md'] = '未关联来源';
  const model = createHandbookModel(data);
  expect(model.resolveRoute(`source/${encodeURIComponent(path)}`)).toMatchObject({
    kind: 'source', path, text: '离线原文', owners: [model.content.entries[0]],
  });
  expect(model.resolveRoute('source/docs/orphan.md').kind).toBe('missing');
  expect(model.resolveRoute('source/toString').kind).toBe('missing');
  expect(model.resolveRoute('source/%E0%A4%A').kind).toBe('missing');
  expect(model.resolveRoute('tool/%ZZ').kind).toBe('missing');

  const inherited = Object.create({ 'docs/inherited.md': 'prototype text' }) as Record<string, string>;
  inherited[path] = 'owned text';
  expect(() => createHandbookModel({ ...data, entries: [entry('bad', { sources: ['docs/inherited.md'] })], sources: inherited })).toThrow('absent source');
});

test('rejects malformed schema, identity, metadata, steps and source references', () => {
  const base = content();
  expect(() => createHandbookModel({ ...base, entries: [entry('invalid/id')] })).toThrow('id is invalid');
  expect(() => createHandbookModel({ ...base, schemaVersion: 2 } as unknown as HandbookContent)).toThrow('schemaVersion');
  expect(() => createHandbookModel({ ...base, entries: [entry('one', { entryId: 'old-id' })] })).toThrow('entryId');
  expect(() => createHandbookModel({ ...base, entries: [entry('one'), entry('one')] })).toThrow('Duplicate');
  expect(() => createHandbookModel({ ...base, entries: [entry('one', { category: 'other' as never })] })).toThrow('category');
  expect(() => createHandbookModel({ ...base, entries: [entry('one', { ownerDirectory: '' })] })).toThrow('ownerDirectory');
  expect(() => createHandbookModel({ ...base, entries: [entry('one', { foundryModuleId: 7 as never })] })).toThrow('foundryModuleId');
  expect(() => createHandbookModel({ ...base, entries: [entry('one', { steps: [] })] })).toThrow('steps');
  expect(() => createHandbookModel({ ...base, entries: [entry('one', { sources: ['docs/missing.md'] })] })).toThrow('absent source');
});

test('owns a frozen content snapshot without changing the caller data', () => {
  const data = content();
  const model = createHandbookModel(data);
  expect(data.entries[0]).not.toBe(model.content.entries[0]);
  expect(data.sources).not.toBe(model.content.sources);
  expect(Object.isFrozen(data.entries[0])).toBe(false);
  (data.entries[0] as { title: string }).title = '后来修改';
  (data.entries[0]!.steps as { title: string; text: string }[])[0]!.text = '后来修改';
  (data.sources as Record<string, string>)['docs/one.md'] = '后来修改';
  expect(model.resolveRoute('tool/one')).toMatchObject({ kind: 'tool', entry: { title: '示例工具', steps: [{ text: '查看结果' }] } });
  expect(model.resolveRoute('source/docs%2Fone.md')).toMatchObject({ kind: 'source', text: '离线原文' });
  expect(model.search('后来修改')).toEqual([]);
  expect(Object.isFrozen(model.content.entries[0]!.steps[0])).toBe(true);
});
