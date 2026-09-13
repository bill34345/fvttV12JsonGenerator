import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { run, fingerprint, loadCatalog } from '../build.mjs';

function fixture(t) {
  const parent = resolve(tmpdir());
  const repo = mkdtempSync(join(parent, 'fvtt-handbook-test-'));
  const put = (path, content) => { const target = join(repo, path); mkdirSync(dirname(target), {recursive:true});writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content)); };
  const entry = {id:'example',title:'怪物转换',category:'convert',summary:'示例功能',when:'整理怪物时',requires:['来源'],steps:[{title:'准备',text:'检查来源'},{title:'运行',text:'查看帮助',command:'bun run demo'}],outputs:['结果'],limits:['未宣称运行时通过'],keywords:['怪物'],sources:['docs/example.md'],watch:['apps/cli/']};
  put('docs/handbook/catalog.json',[entry]);put('docs/handbook/modules.json',[]);put('docs/example.md','# 来源\n当前行为\n');put('apps/cli/main.ts','export const mode = 1;\n');put('package.json',{scripts:{demo:'node apps/cli/main.ts'}});
  put('docs/handbook/template.html','<style>/* HANDBOOK_STYLE */</style><script type="application/json">/* HANDBOOK_DATA */</script><script>/* HANDBOOK_CLIENT */</script>HANDBOOK_DIGEST');put('docs/handbook/style.css','body { color: black; }');put('docs/handbook/client.js','void 0;');
  execFileSync('git',['init','--quiet'],{cwd:repo});
  // Only this test's freshly created, resolved random root can be removed.
  t.after(()=>{assert.equal(dirname(repo),parent);assert.match(repo.split(/[\\/]/).at(-1),/^fvtt-handbook-test-/);rmSync(repo,{recursive:true});});
  const review=()=>run(repo,['review','example','--note','人工核对示例行为']);
  return {repo,put,entry,review};
}
test('review required, deterministic portable build, read-only check',t=>{
  const f=fixture(t);assert.throws(()=>run(f.repo,['build']),/人工核对/);f.review();run(f.repo,['build']);
  const html=readFileSync(join(f.repo,'工具手册.html'),'utf8');run(f.repo,['check']);run(f.repo,['build']);assert.equal(readFileSync(join(f.repo,'工具手册.html'),'utf8'),html);
  assert.ok(!html.includes(f.repo));assert.match(html,/当前行为/);
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
