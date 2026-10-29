import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { run, fingerprint, loadCatalog, projectContent, projectForSurface, loadDeliveryPolicy, render, root } from '../build.mjs';

// Exercise the shipped template/client with the real catalog, without a browser,
// network, Foundry instance, clipboard, or persistent user data.
function handbookPage(t, hash = 'home') {
  const dom = new JSDOM(render(root, loadCatalog(root), {}), {
    url: `file:///offline-handbook.html#${hash}`, runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.matchMedia = () => ({ matches: false });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.eval(window.document.querySelector('script[data-handbook-client]').textContent);
  const navigate = value => {
    window.location.hash = value;
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  };
  return { window, document: window.document, navigate };
}

test('offline handbook exposes first-use and version guides with valid destinations', t => {
  const { document, navigate } = handbookPage(t);
  assert.ok(document.querySelector('#navigation a[href="#guide"]'));
  assert.ok(document.querySelector('#navigation a[href="#tool/version-selection"]'));
  assert.equal(document.querySelector('#main .tool-row').getAttribute('href'), '#tool/fvtt-json-forge');
  navigate('guide');
  assert.equal(document.querySelector('#navigation [aria-current="page"]').getAttribute('href'), '#guide');
  navigate('tool/version-selection');
  assert.match(document.querySelector('#main').textContent, /省略版本仍默认 V12/);
  assert.match(document.querySelector('#main').textContent, /正式生成目标仍为 dnd5e 5\.3\.3/);
  assert.equal(document.querySelector('#navigation [aria-current="page"]').textContent, '版本与兼容性');
});

test('article navigation focuses every section and preserves the shareable entry address', t => {
  const { window, document } = handbookPage(t, 'tool/web-workbench');
  const buttons = document.querySelectorAll('.article-index button');
  assert.equal(buttons.length, 5);
  for (const button of buttons) {
    button.click();
    assert.equal(document.activeElement.id, button.dataset.section);
    assert.equal(window.location.hash, '#tool/web-workbench');
  }
  assert.ok(document.querySelector('.source-details:not([open]) .source-link'));
});

test('skip-to-content keeps the current tool instead of routing to a missing entry', t => {
  const { window, document } = handbookPage(t, 'tool/fvtt-json-forge');
  document.querySelector('.skip').click();
  assert.equal(document.activeElement.id, 'main');
  assert.equal(window.location.hash, '#tool/fvtt-json-forge');
  assert.match(document.querySelector('#main h1').textContent, /Forge/);
});

test('search ranks retained tool names above incidental document mentions', t => {
  const { document, navigate } = handbookPage(t);
  navigate('search/' + encodeURIComponent('工作台'));
  assert.equal(document.querySelector('#main .tool-row').getAttribute('href'), '#tool/web-workbench');
  const workbenches = [...document.querySelectorAll('#main .tool-row')].map(a => a.getAttribute('href'));
  assert.ok(workbenches.includes('#tool/fvtt-json-forge'));
  for (const [term, id] of [['Web 工作台', 'web-workbench'], ['Forge', 'fvtt-json-forge']]) {
    navigate('search/' + encodeURIComponent(term));
    assert.equal(document.querySelector('#main .tool-row').getAttribute('href'), '#tool/' + id);
  }
  navigate('search/' + encodeURIComponent('<img src=x onerror=alert(1)>'));
  assert.equal(document.querySelector('#main img'), null);
  assert.match(document.querySelector('#main').textContent, /没有找到匹配的工具/);
});

test('offline theme and command copy still work when file-origin storage is unavailable', async t => {
  const { window, document } = handbookPage(t, 'tool/version-selection');
  document.getElementById('theme-toggle').click();
  assert.equal(document.documentElement.dataset.theme, 'dark');
  document.getElementById('theme-toggle').click();
  assert.equal(document.documentElement.dataset.theme, 'light');
  const command = document.querySelector('.command code').textContent;
  const button = document.querySelector('button[data-copy]');
  button.click();
  assert.equal(window.getSelection().toString(), command);
  assert.match(button.textContent, /Ctrl\+C/);
  const copies = [];
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async text => copies.push(text) } });
  button.click();
  // JSDOM and the test runner have separate Promise realms. Wait for the click
  // handler's awaited clipboard call to settle before asserting its UI result.
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(copies, [command]);
  assert.equal(button.textContent, '已复制');
});

test('standalone links and browser history stay in sync, with the global slash shortcut retained', async t => {
  const { window, document } = handbookPage(t);
  const hashChangedTo = hash => new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { window.removeEventListener('hashchange', changed); reject(new Error('history did not reach ' + hash)); }, 1000);
    const changed = event => {
      if (window.location.hash !== hash || new URL(event.newURL).hash !== hash) return;
      window.clearTimeout(timeout);
      window.removeEventListener('hashchange', changed);
      resolve();
    };
    window.addEventListener('hashchange', changed);
  });
  document.querySelector('#navigation a[href="#guide"]').click();
  assert.equal(window.location.hash, '#guide');
  assert.match(document.title, /第一次使用/);
  document.querySelector('#navigation a[href="#tool/version-selection"]').click();
  assert.equal(window.location.hash, '#tool/version-selection');
  const changed = hashChangedTo('#guide');
  window.history.back();
  await changed;
  assert.equal(window.location.hash, '#guide');
  assert.match(document.querySelector('#main h1').textContent, /先选择入口/);
  const slash = new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
  document.dispatchEvent(slash);
  assert.equal(slash.defaultPrevented, true);
  assert.equal(document.activeElement.id, 'search');
  const search = document.getElementById('search');
  let searched = hashChangedTo('#search/' + encodeURIComponent('操作台'));
  search.value = '操作台';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await searched;
  const historyLength = window.history.length;
  searched = hashChangedTo('#search/' + encodeURIComponent('工作台'));
  search.value = '工作台';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await searched;
  assert.equal(window.history.length, historyLength);
  assert.ok(document.querySelector('#main .tool-row[href="#tool/web-workbench"]'));
});

function fixture(t) {
  const parent = resolve(tmpdir());
  const repo = mkdtempSync(join(parent, 'fvtt-handbook-test-'));
  const put = (path, content) => { const target = join(repo, path); mkdirSync(dirname(target), {recursive:true});writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content)); };
  const entry = {id:'example',title:'怪物转换',category:'convert',summary:'示例功能',when:'整理怪物时',requires:['来源'],steps:[{title:'准备',text:'检查来源'},{title:'运行',text:'查看帮助',command:'bun run demo'}],outputs:['结果'],limits:['未宣称运行时通过'],keywords:['怪物'],sources:['docs/example.md'],watch:['apps/cli/']};
  put('docs/handbook/catalog.json',[entry]);put('docs/handbook/modules.json',[]);put('docs/handbook/delivery.json',{schemaVersion:1,foundryEntries:['example'],offlineOnlyEntries:[]});put('docs/example.md','# 来源\n当前行为\n');put('apps/cli/main.ts','export const mode = 1;\n');put('package.json',{scripts:{demo:'node apps/cli/main.ts'}});
  put('docs/handbook/template.html','<style>/* HANDBOOK_STYLE */</style><script type="application/json">/* HANDBOOK_DATA */</script><script>/* HANDBOOK_CLIENT */</script>HANDBOOK_DIGEST');put('docs/handbook/style.css','body { color: black; }');put('docs/handbook/client.js','void 0;');
  execFileSync('git',['init','--quiet'],{cwd:repo});
  // Only this test's freshly created, resolved random root can be removed.
  t.after(()=>{assert.equal(dirname(repo),parent);assert.match(repo.split(/[\\/]/).at(-1),/^fvtt-handbook-test-/);rmSync(repo,{recursive:true});});
  const review=()=>run(repo,['review','example','--note','人工核对示例行为']);
  return {repo,put,entry,review};
}

test('module-owned manual is the single entry source and stays in the fingerprint', t => {
  const f = fixture(t);
  const source = 'foundry-modules/example-deck/docs/manual.json';
  const entry = { ...f.entry, id: 'deck-example', module: 'example-deck', title: 'Deck说明', watch: ['foundry-modules/example-deck/'] };
  f.put(source, entry);
  f.put('foundry-modules/example-deck/src/module.json', { id: 'actual-runtime-deck' });
  f.put('docs/handbook/modules.json', [{ source }]);
  const entries = loadCatalog(f.repo);
  assert.deepEqual(entries.find(e => e.id === entry.id), entry);
  assert.equal(projectContent(f.repo, entries, {}).entries.find(e => e.entryId === entry.id).foundryModuleId, 'actual-runtime-deck');
  const before = fingerprint(f.repo, entry);
  f.put(source, { ...entry, summary: '更新模块自有说明' });
  const updated = loadCatalog(f.repo).find(e => e.id === entry.id);
  assert.notEqual(fingerprint(f.repo, updated), before);
  assert.equal(updated.summary, '更新模块自有说明');
});

test('module manual references reject path escape, overrides, wrong owner and missing watch', t => {
  const f = fixture(t);
  const source = 'foundry-modules/example-deck/docs/manual.json';
  const entry = { ...f.entry, id: 'deck-example', module: 'example-deck', watch: ['foundry-modules/example-deck/'] };
  f.put(source, entry);
  for (const reference of [{ source: '../outside.json' }, { source, title: 'shadow copy' }]) {
    f.put('docs/handbook/modules.json', [reference]);
    assert.throws(() => loadCatalog(f.repo), /安全 source|引用无效/);
  }
  f.put('docs/handbook/modules.json', [{ source }]);
  f.put(source, { ...entry, module: 'wrong-owner' });
  assert.throws(() => loadCatalog(f.repo), /owner 不匹配/);
  f.put(source, { ...entry, watch: ['apps/cli/'] });
  assert.throws(() => loadCatalog(f.repo), /来源未被监测/);
  f.put(source, entry);
  f.put('docs/handbook/modules.json', [entry, { source }]);
  assert.throws(() => loadCatalog(f.repo), /ID 无效或重复/);
});

test('review required, deterministic portable build, read-only check',t=>{
  const f=fixture(t);assert.throws(()=>run(f.repo,['build']),/人工核对/);f.review();run(f.repo,['build']);
  const html=readFileSync(join(f.repo,'工具手册.html'),'utf8');run(f.repo,['check']);run(f.repo,['build']);assert.equal(readFileSync(join(f.repo,'工具手册.html'),'utf8'),html);
  assert.ok(!html.includes(f.repo));assert.match(html,/当前行为/);
});

test('content export and HTML use one schema and preserve every stable entry ID', t => {
  const f = fixture(t);
  assert.throws(() => run(f.repo, ['export']), /人工核对/);
  f.review();
  run(f.repo, ['export']);
  const output = join(f.repo, 'dist/handbook/content.json');
  const first = readFileSync(output, 'utf8');
  const exported = JSON.parse(first);
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.entries[0].entryId, 'example');
  assert.equal(exported.entries[0].ownerDirectory, 'docs/handbook');
  assert.equal(exported.entries[0].foundryModuleId, null);
  run(f.repo, ['export']);
  assert.equal(readFileSync(output, 'utf8'), first);
  run(f.repo, ['build']);
  const embedded = JSON.parse(readFileSync(join(f.repo, '工具手册.html'), 'utf8').match(/<script type="application\/json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(embedded, exported);
  f.put('apps/cli/main.ts', 'changed');
  assert.throws(() => run(f.repo, ['export']), /人工核对/);
  assert.equal(readFileSync(output, 'utf8'), first);
});

test('runtime IDs come from manifests, with root manifests and explicit external owners supported', t => {
  const f = fixture(t);
  const moduleEntry = { ...f.entry, module: 'source-folder' };
  f.put('foundry-modules/source-folder/src/module.json', { id: 'actual-runtime-id' });
  assert.equal(projectContent(f.repo, [moduleEntry], {}).entries[0].foundryModuleId, 'actual-runtime-id');
  f.put('foundry-modules/root-folder/module.json', { id: 'root-runtime-id' });
  assert.equal(projectContent(f.repo, [{ ...f.entry, module: 'root-folder' }], {}).entries[0].foundryModuleId, 'root-runtime-id');
  assert.equal(projectContent(f.repo, [{ ...f.entry, module: 'midi-qol' }], {}).entries[0].foundryModuleId, 'midi-qol');
  assert.equal(projectContent(f.repo, [{ ...f.entry, module: 'server-next-external-candidates' }], {}).entries[0].foundryModuleId, null);
  assert.throws(() => projectContent(f.repo, [{ ...f.entry, module: 'unknown' }], {}), /没有 manifest/);
  assert.throws(() => projectContent(f.repo, [{ ...f.entry, module: '../private' }], {}), /目录名无效/);
  f.put('foundry-modules/source-folder/src/module.json', { id: '' });
  assert.throws(() => projectContent(f.repo, [moduleEntry], {}), /runtime module ID 无效/);
});
test('source and implementation changes invalidate author review; build never blesses them',t=>{
  const f=fixture(t);f.review();run(f.repo,['build']);const review=readFileSync(join(f.repo,'docs/handbook/reviewed.json'),'utf8');
  f.put('apps/cli/main.ts','export const mode = 2;');assert.throws(()=>run(f.repo,['check']),/example/);assert.throws(()=>run(f.repo,['build']),/example/);assert.equal(readFileSync(join(f.repo,'docs/handbook/reviewed.json'),'utf8'),review);
  f.review();run(f.repo,['build']);f.put('docs/example.md','行为已变化');assert.throws(()=>run(f.repo,['check']),/人工核对/);
});
test('new owner directory and new module need catalog entries',t=>{
  const f=fixture(t);f.review();f.put('apps/new-tool/main.ts','new tool');assert.throws(()=>run(f.repo,['check']),/新工具目录未登记/);
});
test('registered module needs its own user entry',t=>{
  const f=fixture(t);f.put('foundry-modules/new-module/main.ts','new module');f.entry.watch.push('foundry-modules/new-module/');f.put('docs/handbook/catalog.json',[f.entry]);assert.throws(()=>run(f.repo,['check']),/模块缺少独立说明/);
});
test('curated entry edits and old HTML cannot silently pass',t=>{
  const f=fixture(t);f.review();run(f.repo,['build']);f.entry.summary='新行为';f.put('docs/handbook/catalog.json',[f.entry]);assert.throws(()=>run(f.repo,['check']),/人工核对/);f.review();assert.throws(()=>run(f.repo,['check']),/离线页面未同步/);
});
test('missing sources and nonexistent or raw commands fail before build',t=>{
  const f=fixture(t);f.entry.sources=['docs/missing.md'];f.put('docs/handbook/catalog.json',[f.entry]);assert.throws(()=>loadCatalog(f.repo),/路径无效或不存在/);
  f.entry.sources=['docs/example.md'];f.entry.steps[1].command='bun run nonexistent';f.put('docs/handbook/catalog.json',[f.entry]);assert.throws(()=>loadCatalog(f.repo),/命令入口不存在/);
  f.entry.steps[1].command='bun run test:raw';f.put('docs/handbook/catalog.json',[f.entry]);assert.throws(()=>loadCatalog(f.repo),/内部 raw/);
});
test('private and traversal sources are rejected',t=>{
  const f=fixture(t);f.put('docs/private/secret.md','secret');f.entry.sources=['docs/private/secret.md'];f.put('docs/handbook/catalog.json',[f.entry]);assert.throws(()=>loadCatalog(f.repo),/公开 Markdown/);
  f.entry.sources=['../secret.md'];f.put('docs/handbook/catalog.json',[f.entry]);assert.throws(()=>loadCatalog(f.repo),/路径无效/);
});
test('source and entry HTML cannot break the JSON script boundary',t=>{
  const f=fixture(t);const hostile='</script><img src=x onerror=alert(1)>';f.entry.summary=hostile;f.put('docs/handbook/catalog.json',[f.entry]);f.put('docs/example.md',hostile);f.review();run(f.repo,['build']);const html=readFileSync(join(f.repo,'工具手册.html'),'utf8');assert.ok(!html.includes(hostile));const encoded=html.match(/<script type="application\/json">(.*?)<\/script>/s)[1];assert.equal(JSON.parse(encoded).entries[0].summary,hostile);
});
test('LF and CRLF worktrees share fingerprints; implementation additions are detected',t=>{
  const f=fixture(t);const before=fingerprint(f.repo,f.entry);f.put('apps/cli/main.ts','export const mode = 1;\r\n');assert.equal(fingerprint(f.repo,f.entry),before);f.put('apps/cli/new.ts','new behavior');assert.notEqual(fingerprint(f.repo,f.entry),before);
});
test('test-only files do not demand a user documentation rewrite',t=>{
  const f=fixture(t);const before=fingerprint(f.repo,f.entry);f.put('apps/cli/__tests__/demo.test.ts','new test');assert.equal(fingerprint(f.repo,f.entry),before);
});
test('Python, Handlebars and environment examples survive CRLF checkouts without hiding edits',t=>{
  const f=fixture(t);
  for (const path of ['apps/cli/extract.py','apps/cli/settings.hbs','apps/cli/.env.example']) {
    f.put(path,'first\nsecond\n');const before=fingerprint(f.repo,f.entry);
    f.put(path,'first\r\nsecond\r\n');assert.equal(fingerprint(f.repo,f.entry),before,path);
    f.put(path,'first\r\nchanged\r\n');assert.notEqual(fingerprint(f.repo,f.entry),before,path);
  }
});
test('binary payload hashes preserve byte differences including CRLF',t=>{
  const f=fixture(t);const path=join(f.repo,'apps/cli/asset.bin');
  writeFileSync(path,Buffer.from([0,255,13,10]));const before=fingerprint(f.repo,f.entry);
  writeFileSync(path,Buffer.from([0,255,10]));assert.notEqual(fingerprint(f.repo,f.entry),before);
});


test('delivery policy partitions every real ID and retains all legacy content offline', () => {
  const entries = loadCatalog(root);
  const reviews = Object.fromEntries(entries.map(e => [e.id, { fingerprint:'fixture', reviewedOn:'2026-10-12', note:'test' }]));
  const full = projectForSurface(root, entries, reviews, 'standalone');
  const foundry = projectForSurface(root, entries, reviews, 'foundry');
  assert.deepEqual(full.content, projectContent(root, entries, reviews));
  assert.equal(full.content.entries.length, 38);
  assert.equal(foundry.content.entries.length, 28);
  assert.equal(foundry.projection.omittedEntryIds.length, 10);
  assert.deepEqual(new Set([...foundry.projection.entryIds, ...foundry.projection.omittedEntryIds]), new Set(entries.map(e=>e.id)));
  assert.equal(foundry.content.entries.filter(e=>e.foundryModuleId).length, 17);
  assert.deepEqual(Object.keys(foundry.content.reviews).sort(), foundry.projection.entryIds.toSorted());
  for(const e of foundry.content.entries) {
    assert.equal(foundry.content.reviews[e.id].note,e.summary);
    assert.equal(foundry.content.reviews[e.id].fingerprint,reviews[e.id].fingerprint);
    assert.equal(foundry.content.reviews[e.id].reviewedOn,reviews[e.id].reviewedOn);
  }
  const referenced = [...new Set(foundry.content.entries.flatMap(e=>e.sources))].sort();
  assert.deepEqual(Object.keys(foundry.content.sources), referenced);
  for (const id of ['foundry-ops','verification-development','legacy-text','crystalbleed-v12','foundry-mcp-readiness']) {
    assert.ok(full.content.entries.some(e=>e.id===id));
    assert.ok(!foundry.content.entries.some(e=>e.id===id));
  }
  for (const id of ['version-selection','fvtt-json-forge','open-session-deck','fvtt-suite-console']) assert.ok(foundry.content.entries.some(e=>e.id===id));
});

test('delivery policy refuses unknown, overlapping, unassigned IDs and undocumented exclusions', t => {
  const f=fixture(t), entries=loadCatalog(f.repo);
  for (const policy of [
    {schemaVersion:1,foundryEntries:['example','extra'],offlineOnlyEntries:[]},
    {schemaVersion:1,foundryEntries:['example','example'],offlineOnlyEntries:[]},
    {schemaVersion:1,foundryEntries:['example'],offlineOnlyEntries:[{entryId:'example',reason:'twice'}]},
    {schemaVersion:1,foundryEntries:[],offlineOnlyEntries:[{entryId:'example',reason:'unavailable'}]},
    {schemaVersion:1,foundryEntries:['example'],offlineOnlyEntries:[],typo:true},
  ]) { f.put('docs/handbook/delivery.json',policy); assert.throws(()=>loadDeliveryPolicy(f.repo,entries),/交付策略/); }
  const second={...f.entry,id:'internal'};
  f.put('docs/handbook/delivery.json',{schemaVersion:1,foundryEntries:['example'],offlineOnlyEntries:[]});
  assert.throws(()=>loadDeliveryPolicy(f.repo,[f.entry,second]),/未登记全部 ID.*internal/);
  f.put('docs/handbook/delivery.json',{schemaVersion:1,foundryEntries:['example'],offlineOnlyEntries:[{entryId:'internal',reason:''}]});
  assert.throws(()=>loadDeliveryPolicy(f.repo,[f.entry,second]),/必须登记/);
  assert.throws(()=>projectForSurface(f.repo,entries,{},'typo'),/阅读面/);
});

test('surface exports prune engineering-only sources and reviews without changing complete HTML', t => {
  const f=fixture(t);
  const internal={...f.entry,id:'engineer',title:'工程专用',sources:['docs/engineer.md']};
  f.put('docs/engineer.md','# ENGINEER_ONLY_SENTINEL');
  f.put('docs/handbook/catalog.json',[f.entry,internal]);
  f.put('docs/handbook/delivery.json',{schemaVersion:1,foundryEntries:['example'],offlineOnlyEntries:[{entryId:'engineer',reason:'工程说明保留离线'}]});
  run(f.repo,['review','example,engineer','--note','ENGINEER_REVIEW_SENTINEL 人工核对两个读取面的内容与边界']);
  run(f.repo,['build']);
  const html=readFileSync(join(f.repo,'工具手册.html'),'utf8');
  run(f.repo,['export']);
  run(f.repo,['export','--surface=foundry']);
  const full=JSON.parse(readFileSync(join(f.repo,'dist/handbook/content.json'),'utf8'));
  const foundryText=readFileSync(join(f.repo,'dist/handbook/content.foundry.json'),'utf8');
  const foundry=JSON.parse(foundryText);
  const projection=JSON.parse(readFileSync(join(f.repo,'dist/handbook/projection.foundry.json'),'utf8'));
  assert.deepEqual(full.entries.map(e=>e.entryId),['example','engineer']);
  assert.deepEqual(foundry.entries.map(e=>e.entryId),['example']);
  assert.equal(foundry.reviews.engineer,undefined);
  assert.equal(foundry.sources['docs/engineer.md'],undefined);
  assert.ok(!foundryText.includes('ENGINEER_ONLY_SENTINEL'));
  assert.ok(!foundryText.includes('ENGINEER_REVIEW_SENTINEL'));
  assert.ok(html.includes('ENGINEER_ONLY_SENTINEL'));
  assert.ok(html.includes('ENGINEER_REVIEW_SENTINEL'));
  assert.equal(foundry.reviews.example.note,f.entry.summary);
  assert.match(full.reviews.example.note,/ENGINEER_REVIEW_SENTINEL/);
  assert.deepEqual(projection.entryIds,['example']);
  assert.deepEqual(projection.omittedEntryIds,['engineer']);
  assert.deepEqual(projection.excludedSourcePaths,['docs/engineer.md']);
  assert.equal(readFileSync(join(f.repo,'工具手册.html'),'utf8'),html);
  assert.match(run(f.repo,['check']),/PASS/);
  for(const args of [['export','--surface=typo'],['export','--surface=foundry','--extra'],['build','--surface=foundry']]) assert.throws(()=>run(f.repo,args),/参数/);
});

test('surface export refuses linked and hard-linked artifact targets before writing', t => {
  for(const kind of ['symbolic','hard']){
    const f=fixture(t);f.review();
    f.put('dist/handbook/seed.txt','owned build directory');
    const source=join(f.repo,'docs/example.md'),target=join(f.repo,'dist/handbook/content.foundry.json');
    if(kind==='symbolic')symlinkSync(source,target,'file');else linkSync(source,target);
    const original=readFileSync(source,'utf8');
    assert.throws(()=>run(f.repo,['export','--surface=foundry']),kind==='symbolic'?/不能经过链接/:/普通独立文件/);
    assert.equal(readFileSync(source,'utf8'),original);
  }
});
