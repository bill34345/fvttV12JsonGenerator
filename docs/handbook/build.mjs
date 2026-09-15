import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = 'docs/handbook/';
export const normalize = text => text.replace(/\r\n/g, '\n');
const hash = text => createHash('sha256').update(text).digest('hex');
const read = (repo, path) => normalize(readFileSync(resolve(repo, path), 'utf8'));
const json = (repo, path) => JSON.parse(read(repo, path));
function assert(condition, message) { if (!condition) throw new Error(message); }
function safePath(path) {
  return typeof path === 'string' && !path.includes('\\') && !path.startsWith('/')
    && !path.includes(':') && !path.split('/').some(p => p === '..' || p.startsWith('.'));
}
export function loadCatalog(repo = root) {
  const entries = [...json(repo, directory + 'catalog.json'), ...json(repo, directory + 'modules.json')];
  const ids = new Set();
  const categories = new Set(['convert', 'library', 'play', 'maintain']);
  for (const e of entries) {
    assert(/^[a-z0-9-]+$/.test(e.id) && !ids.has(e.id), `工具 ID 无效或重复：${e.id}`);
    ids.add(e.id);
    assert(categories.has(e.category), `${e.id}：分类无效`);
    for (const field of ['title', 'summary', 'when']) assert(typeof e[field] === 'string' && e[field].trim(), `${e.id}：缺少 ${field}`);
    for (const field of ['requires', 'outputs', 'limits', 'keywords', 'sources', 'watch']) {
      assert(Array.isArray(e[field]) && e[field].length && e[field].every(v => typeof v === 'string' && v.trim()), `${e.id}：缺少 ${field}`);
    }
    assert(Array.isArray(e.steps) && e.steps.length >= 2 && e.steps.every(s => s.title && s.text && (s.command === undefined || typeof s.command === 'string')), `${e.id}：缺少操作步骤`);
    for (const path of [...e.sources, ...e.watch]) assert(safePath(path) && existsSync(resolve(repo, path)), `${e.id}：路径无效或不存在 ${path}`);
    for (const path of e.sources) assert(/^(README\.md|docs\/(?!private\/|archive\/)|foundry-modules\/|packages\/|tools\/)/.test(path) && path.endsWith('.md'), `${e.id}：来源必须是公开 Markdown ${path}`);
  }
  for (const area of ['apps', 'packages', 'tools', 'foundry-modules']) {
    if (!existsSync(resolve(repo, area))) continue;
    for (const item of readdirSync(resolve(repo, area), { withFileTypes: true }).filter(i => i.isDirectory() && !i.name.startsWith('.'))) {
      const prefix = `${area}/${item.name}/`;
      assert(entries.some(e => e.watch.includes(prefix)), `新工具目录未登记：${prefix}`);
      if (area === 'foundry-modules') assert(entries.some(e => e.module === item.name), `模块缺少独立说明：${item.name}`);
    }
  }
  const scripts = json(repo, 'package.json').scripts;
  for (const e of entries) for (const step of e.steps) {
    for (const match of (step.command ?? '').matchAll(/bun run ([a-zA-Z0-9:./_-]+)/g)) {
      const cmd = match[1];
      assert(!cmd.endsWith(':raw'), `${e.id}：不允许内部 raw 测试入口`);
      assert(scripts[cmd] || (safePath(cmd) && existsSync(resolve(repo, cmd))), `${e.id}：命令入口不存在 ${cmd}`);
    }
  }
  return entries;
}
function listFiles(repo) {
  return [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).split('\0').filter(Boolean))].sort();
}
export function fingerprint(repo, entry, files = listFiles(repo)) {
  const matches = files.filter(p => entry.watch.some(w => w.endsWith('/') ? p.startsWith(w) : p === w))
    .filter(p => !/(^|\/)(__tests__|tests|scratch|node_modules|dist)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(p));
  const sources = [...new Set([...entry.sources, ...matches])].sort();
  return hash(JSON.stringify(entry) + sources.map(p => {
    if (!existsSync(resolve(repo, p))) return `\n${p}\0DELETED`;
    const bytes = readFileSync(resolve(repo, p));
    const textFile = /\.(?:[cm]?[jt]sx?|json|md|html|hbs|css|yml|yaml|txt|toml|ps1|sh|py)$/.test(p)
      || /(?:^|\/)\.env\.(?:example|sample|template)$/.test(p);
    const content = textFile ? normalize(bytes.toString('utf8')) : bytes;
    return `\n${p}\0${hash(content)}`;
  }).join(''));
}
export function freshness(repo, entries) {
  const reviews = existsSync(resolve(repo, directory + 'reviewed.json')) ? json(repo, directory + 'reviewed.json') : {};
  const files = listFiles(repo);
  return { reviews, stale: entries.filter(e => reviews[e.id]?.fingerprint !== fingerprint(repo, e, files)) };
}
export function render(repo, entries, reviews) {
  const sources = Object.fromEntries([...new Set(entries.flatMap(e => e.sources))].sort().map(path => [path, read(repo, path)]));
  const payload = { entries, reviews, sources };
  const data = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return read(repo, directory + 'template.html')
    .replace('/* HANDBOOK_STYLE */', () => read(repo, directory + 'style.css'))
    .replace('/* HANDBOOK_DATA */', () => data)
    .replace('/* HANDBOOK_CLIENT */', () => read(repo, directory + 'client.js'))
    .replace('HANDBOOK_DIGEST', hash(data).slice(0, 12));
}
export function run(repo, args) {
  const [mode = 'check', target, flag, note] = args;
  assert(['build', 'check', 'review', 'status'].includes(mode), '用法：build | check | status | review <id[,id]> --note "人工核对说明"');
  const entries = loadCatalog(repo);
  const state = freshness(repo, entries);
  if (mode === 'review') {
    assert(target && flag === '--note' && note?.trim(), '人工核对后使用 review <id[,id]> --note "核对内容"');
    const ids = target.split(',');
    assert(ids.every(id => entries.some(e => e.id === id)), 'review 含未知工具 ID');
    const files = listFiles(repo);
    for (const id of ids) state.reviews[id] = { fingerprint: fingerprint(repo, entries.find(e => e.id === id), files), reviewedOn: new Date().toISOString().slice(0, 10), note };
    writeFileSync(resolve(repo, directory + 'reviewed.json'), JSON.stringify(Object.fromEntries(entries.filter(e => state.reviews[e.id]).map(e => [e.id, state.reviews[e.id]])), null, 2) + '\n');
    return `已记录 ${ids.length} 项作者核对；请重新 build 和 check。记录不代表运行时验收。`;
  }
  if (mode === 'status') return state.stale.length ? `需要人工核对：${state.stale.map(e => e.id).join(', ')}` : `全部 ${entries.length} 项说明与登记来源一致。`;
  assert(!state.stale.length, `手册来源或实现已变化，请先人工核对：${state.stale.map(e => e.id).join(', ')}。运行 handbook:review 后再 build。`);
  const html = render(repo, entries, state.reviews);
  const output = resolve(repo, '工具手册.html');
  if (mode === 'build') writeFileSync(output, html);
  else assert(existsSync(output) && read(repo, '工具手册.html') === html, '离线页面未同步：运行 bun run handbook:build，并将 工具手册.html 随功能一起提交。');
  return `PASS handbook:${mode} · ${entries.length} 项工具 · 来源、目录覆盖、命令入口、内容指纹与离线页面一致`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(run(root, process.argv.slice(2))); }
  catch (error) { console.error(`FAIL handbook: ${error.message}`); process.exitCode = 1; }
}
