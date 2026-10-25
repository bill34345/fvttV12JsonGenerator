import { afterEach, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { mountHandbook, type HandbookContent, type HandbookHandle, type HandbookModuleState } from '../src/index';

const documents: JSDOM[] = [];
const handles: HandbookHandle[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
  for (const dom of documents.splice(0)) dom.window.close();
});

function fixture() {
  const dom = new JSDOM('<title>World</title><div id="one"></div><div id="two"></div>', { url: 'https://example.invalid/game#scene-7' });
  documents.push(dom);
  const document = dom.window.document;
  const content: HandbookContent = {
    schemaVersion: 1,
    entries: [{
      id: 'example', entryId: 'example', ownerDirectory: 'foundry-modules/example', foundryModuleId: 'runtime-example',
      title: '操作台示例', summary: '查看资料', category: 'play', when: '跑团前', requires: ['核对版本'],
      steps: [{ title: '查看', text: '阅读说明', command: 'bun run example' }],
      outputs: ['帮助'], limits: ['命令只可复制'], keywords: ['工作台'],
      sources: ['docs/example.md'], watch: ['foundry-modules/example/'],
    }],
    reviews: { example: { fingerprint: 'abc', reviewedOn: '2026-10-11', note: '已核对' } },
    sources: { 'docs/example.md': '# 原始说明\n<svg onload=alert(1)>' },
  };
  return { dom, document, content, one: document.getElementById('one')!, two: document.getElementById('two')! };
}
function keep(handle: HandbookHandle): HandbookHandle { handles.push(handle); return handle; }

test('Foundry module states use runtime IDs and refresh without remounting the article or touching host state', () => {
  const f = fixture();
  const lookups: string[] = [];
  const routes: string[] = [];
  let state: HandbookModuleState = { state: 'enabled', version: '0.2.0' };
  const before = { url: f.dom.window.location.href, title: f.document.title, storage: f.dom.window.localStorage.length };
  const handle = keep(mountHandbook(f.one, f.content, { surface: 'foundry',
    readModuleState(id) { lookups.push(id); return state; }, onNavigate: route => routes.push(route) }));
  handle.navigate('example');
  const detail = f.one.querySelector<HTMLElement>('.module-state-detail')!;
  expect(detail.dataset.handbookModuleState).toBe('enabled');
  expect(detail.textContent).toContain('已安装 · 已启用');
  expect(detail.textContent).toContain('0.2.0');
  const step = f.one.querySelector('[data-handbook-section="steps"]');
  const main = f.one.querySelector<HTMLElement>('[data-main]')!;
  main.scrollTop = 123;
  state = { state: 'disabled' };
  f.one.querySelector<HTMLButtonElement>('[data-modules-refresh]')!.click();
  expect(detail.dataset.handbookModuleState).toBe('disabled');
  expect(detail.textContent).toContain('未启用');
  expect(detail.textContent).toContain('版本未知');
  expect(f.one.querySelector('[data-handbook-section="steps"]')).toBe(step);
  expect(main.scrollTop).toBe(123);
  expect(routes).toEqual([]);
  expect(new Set(lookups)).toEqual(new Set(['runtime-example']));
  expect(f.dom.window.location.href).toBe(before.url);
  expect(f.document.title).toBe(before.title);
  expect(f.dom.window.localStorage.length).toBe(before.storage);
  for (const next of ['missing', 'unknown'] as const) {
    state = { state: next };
    f.one.querySelector<HTMLButtonElement>('[data-modules-refresh]')!.click();
    expect(detail.dataset.handbookModuleState).toBe(next);
    expect(detail.textContent).not.toContain('已安装');
  }
});

test('module state metadata stays safe and read failures remain unknown', () => {
  const f = fixture();
  let fail = false;
  const handle = keep(mountHandbook(f.one, f.content, { surface: 'foundry', readModuleState() {
    if (fail) throw new Error('registry unavailable');
    return { state: 'enabled', version: '<img src=x onerror=alert(1)>' };
  } }));
  handle.navigate('all');
  expect(f.one.querySelector('.module-state-brief')?.textContent).toContain('<img');
  expect(f.one.querySelector('img')).toBeNull();
  fail = true;
  f.one.querySelector<HTMLButtonElement>('[data-modules-refresh]')!.click();
  expect(f.one.querySelector('.module-state-brief')?.textContent).toBe('状态未知');
});

test('standalone and non-module entries do not ask for Foundry state', () => {
  const f = fixture();
  let reads = 0;
  const readModuleState = (): HandbookModuleState => { reads++; return { state: 'enabled' }; };
  const handle = keep(mountHandbook(f.one, f.content, { surface: 'standalone', readModuleState }));
  handle.navigate('example');
  expect(reads).toBe(0);
  expect(f.one.querySelector('[data-modules-refresh]')).toBeNull();
  expect(f.one.querySelector('[data-handbook-module-id]')).toBeNull();
  const plain = { ...f.content, entries: f.content.entries.map(entry => ({ ...entry, foundryModuleId: null })) };
  const foundry = keep(mountHandbook(f.two, plain, { surface: 'foundry', readModuleState }));
  foundry.navigate('example');
  expect(reads).toBe(0);
  expect(f.two.querySelector('[data-handbook-module-id]')).toBeNull();
});

test('two roots have disjoint IDs and independent navigation, theme and menu state', () => {
  const f = fixture();
  const firstRoutes: string[] = [];
  const secondRoutes: string[] = [];
  const first = keep(mountHandbook(f.one, f.content, { onNavigate: route => firstRoutes.push(route) }));
  keep(mountHandbook(f.two, f.content, { onNavigate: route => secondRoutes.push(route) }));
  const firstIds = new Set([...f.one.querySelectorAll('[id]')].map(element => element.id));
  expect([...f.two.querySelectorAll('[id]')].some(element => firstIds.has(element.id))).toBe(false);
  first.navigate('example', 'steps');
  expect(f.document.activeElement).toBe(f.one.querySelector('[data-handbook-section="steps"]'));
  expect(f.two.querySelector('h1')?.textContent).toBe('找到工具，开始下一场团。');
  f.one.querySelector<HTMLButtonElement>('[data-theme-toggle]')!.click();
  f.one.querySelector<HTMLButtonElement>('[data-menu-toggle]')!.click();
  expect(f.one.dataset.handbookTheme).toBe('dark');
  expect(f.two.dataset.handbookTheme).toBe('light');
  expect(f.one.classList.contains('menu-open')).toBe(true);
  expect(f.two.classList.contains('menu-open')).toBe(false);
  f.one.querySelector<HTMLButtonElement>('[data-route="all"]')!.click();
  expect(firstRoutes).toEqual(['all']);
  expect(secondRoutes).toEqual([]);
  expect(f.one.querySelector('h1')?.textContent).toBe('全部工具');
});

test('default host leaves the world URL, title, persistent theme and global listeners alone', () => {
  const f = fixture();
  const before = { url: f.dom.window.location.href, title: f.document.title, storage: f.dom.window.localStorage.length };
  const handle = keep(mountHandbook(f.one, f.content));
  handle.navigate('example');
  f.one.querySelector<HTMLButtonElement>('[data-theme-toggle]')!.click();
  f.one.querySelector<HTMLButtonElement>('[data-route="all"]')!.click();
  expect(f.dom.window.location.href).toBe(before.url);
  expect(f.document.title).toBe(before.title);
  expect(f.dom.window.localStorage.length).toBe(before.storage);
  expect(f.document.documentElement.dataset.theme).toBeUndefined();
  expect(f.one.querySelector('a[href]')).toBeNull();
  f.document.body.focus();
  const globalSlash = new f.dom.window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
  f.document.dispatchEvent(globalSlash);
  expect(globalSlash.defaultPrevented).toBe(false);
});

test('shortcuts are root-local and do not consume slash while editing', () => {
  const f = fixture();
  const handle = keep(mountHandbook(f.one, f.content));
  handle.navigate('example');
  const main = f.one.querySelector<HTMLElement>('[data-main]')!;
  const search = f.one.querySelector<HTMLInputElement>('[data-search]')!;
  main.focus();
  main.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
  expect(f.document.activeElement).toBe(search);
  const editingSlash = new f.dom.window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
  search.dispatchEvent(editingSlash);
  expect(editingSlash.defaultPrevented).toBe(false);
  search.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(f.one.querySelector('h1')?.textContent).toBe('全部工具');
});

test('search is debounced, uses encoded routes and replaces consecutive search history', async () => {
  const f = fixture();
  const routes: [string, boolean][] = [];
  keep(mountHandbook(f.one, f.content, { onNavigate: (route, options) => routes.push([route, options.replace]) }));
  const search = f.one.querySelector<HTMLInputElement>('[data-search]')!;
  search.value = '操作台';
  search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 200));
  expect(routes).toEqual([['search/' + encodeURIComponent('操作台'), false]]);
  expect(f.one.querySelectorAll('.tool-row').length).toBe(1);
  search.value = '工作台';
  search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 200));
  expect(routes.at(-1)).toEqual(['search/' + encodeURIComponent('工作台'), true]);
  search.value = 'discard';
  search.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
  handles.at(-1)!.dispose();
  await new Promise(resolve => setTimeout(resolve, 200));
  expect(routes.length).toBe(2);
});

test('remount and dispose release host subscriptions once and make old handles inert', () => {
  const f = fixture();
  let releases = 0;
  let changes = 0;
  let callback!: (route: string) => void;
  const first = keep(mountHandbook(f.one, f.content, {
    subscribeRoute(navigate) { callback = navigate; return () => { releases++; }; },
    subscribeShortcuts() { return () => { releases++; }; },
    onNavigate() { changes++; },
  }));
  const second = keep(mountHandbook(f.one, f.content, { onNavigate() { changes++; } }));
  expect(releases).toBe(2);
  first.navigate('example');
  callback('tool/example');
  expect(f.one.querySelector('h1')?.textContent).toBe('找到工具，开始下一场团。');
  first.dispose();
  expect(releases).toBe(2);
  f.one.querySelector<HTMLButtonElement>('[data-route="all"]')!.click();
  expect(changes).toBe(1);
  second.dispose();
  f.one.querySelector<HTMLButtonElement>('[data-route="guide"]')!.click();
  expect(changes).toBe(1);
});

test('late clipboard success and failure cannot modify a disposed, remounted or rerouted view', async () => {
  for (const reject of [false, true]) {
    for (const action of ['dispose', 'remount', 'reroute']) {
    const f = fixture();
    let finish!: () => void;
    let fail!: (reason: Error) => void;
    const pending = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
    const first = keep(mountHandbook(f.one, f.content, { copyText: () => pending }));
    first.navigate('example');
    const oldButton = f.one.querySelector<HTMLButtonElement>('[data-copy]')!;
    oldButton.click();
    if (action === 'dispose') first.dispose();
    else if (action === 'remount') keep(mountHandbook(f.one, f.content)).navigate('example');
    else first.navigate('example');
    const newButton = f.one.querySelector<HTMLButtonElement>('[data-copy]')!;
    if (reject) fail(new Error('denied')); else finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(oldButton.textContent).toBe('复制命令');
    expect(newButton.textContent).toBe('复制命令');
    expect(f.dom.window.getSelection()?.toString()).toBe('');
    expect(f.one.querySelector('[data-announcement]')?.textContent).toBe('');
    }
  }
});

test('copy fallback selects only this root and raw source markup stays text', () => {
  const f = fixture();
  const first = keep(mountHandbook(f.one, f.content));
  keep(mountHandbook(f.two, f.content));
  first.navigate('example');
  const button = f.one.querySelector<HTMLButtonElement>('[data-copy]')!;
  button.click();
  expect(button.textContent).toBe('已选中，请按 Ctrl+C');
  expect(f.dom.window.getSelection()?.toString()).toBe('bun run example');
  expect(f.two.querySelector('[data-announcement]')?.textContent).toBe('');
  first.navigate('source/' + encodeURIComponent('docs/example.md'));
  expect(f.one.querySelector('svg')).toBeNull();
  expect(f.one.querySelector('.source-body')?.textContent).toContain('<svg onload=alert(1)>');
});

test('invalid content preserves an existing reader, and nested roots do not double-route clicks', () => {
  const f = fixture();
  let outerChanges = 0;
  let innerChanges = 0;
  const outer = keep(mountHandbook(f.one, f.content, { onNavigate() { outerChanges++; } }));
  expect(() => mountHandbook(f.one, { ...f.content, schemaVersion: 2 } as unknown as HandbookContent)).toThrow();
  outer.navigate('example');
  expect(f.one.querySelector('h1')?.textContent).toBe('操作台示例');
  const innerRoot = f.document.createElement('div');
  f.one.append(innerRoot);
  keep(mountHandbook(innerRoot, f.content, { onNavigate() { innerChanges++; } }));
  innerRoot.querySelector<HTMLButtonElement>('[data-route="all"]')!.click();
  expect(innerChanges).toBe(1);
  expect(outerChanges).toBe(0);
});

test('reader controls cannot submit a form host with clipboard success or fallback', async () => {
  for (const copyText of [undefined, async () => {}, async () => { throw new Error('denied'); }]) {
  const f = fixture();
  const form = f.document.createElement('form');
  f.document.body.append(form);
  form.append(f.one);
  let submissions = 0;
  form.addEventListener('submit', event => { event.preventDefault(); submissions++; });
  const handle = keep(mountHandbook(f.one, f.content, { copyText }));
  handle.navigate('example');
  for (const button of f.one.querySelectorAll<HTMLButtonElement>('button')) {
    expect(button.type).toBe('button');
  }
  f.one.querySelector<HTMLButtonElement>('[data-copy]')!.click();
  await Promise.resolve();
  await Promise.resolve();
  f.one.querySelector<HTMLButtonElement>('[data-section="steps"]')!.click();
  expect(submissions).toBe(0);
  }
});

test('Foundry updates stay user-facing while the full offline surface retains maintainer instructions', () => {
  const f=fixture();
  const engineeringNote='维护者已对照CI、watch和master快进提交完成源码核对';
  const content={...f.content,reviews:{example:{...f.content.reviews.example!,note:engineeringNote}}};
  const foundry=keep(mountHandbook(f.one,content,{surface:'foundry'}));
  const offline=keep(mountHandbook(f.two,content,{surface:'standalone'}));
  foundry.navigate('updates');offline.navigate('updates');
  expect(f.one.textContent).toContain('完整离线手册');
  expect(f.one.textContent).not.toContain('维护者：如何同步说明与功能');
  expect(f.one.textContent).not.toContain(engineeringNote);
  expect(f.one.querySelector('[data-main] .tool-row p')?.textContent).toBe('查看资料');
  expect(f.one.textContent).toContain('2026-10-11');
  expect(f.two.textContent).toContain(engineeringNote);
  expect(f.two.textContent).toContain('维护者：如何同步说明与功能');
});
