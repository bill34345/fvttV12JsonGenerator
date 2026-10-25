import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, lstatSync } from 'node:fs';
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
  const moduleEntries = json(repo, directory + 'modules.json').map(entry => {
    if (entry?.source === undefined) return entry;
    const source = entry.source;
    assert(Object.keys(entry).length === 1 && safePath(source), '模块手册引用只允许单一安全 source 路径');
    const owner = /^foundry-modules\/([a-z0-9-]+)\/docs\/manual\.json$/.exec(source)?.[1];
    assert(owner && existsSync(resolve(repo, source)), `模块手册引用无效或不存在：${source}`);
    let current = repo;
    for (const part of source.split('/')) {
      current = resolve(current, part);
      assert(!lstatSync(current).isSymbolicLink(), `模块手册引用不能经过链接：${source}`);
    }
    assert(lstatSync(current).isFile(), `模块手册引用必须为文件：${source}`);
    const resolved = json(repo, source);
    assert(resolved.module === owner, `模块手册 owner 不匹配：${source}`);
    assert(resolved.watch?.includes(`foundry-modules/${owner}/`) || resolved.watch?.includes(source), `模块手册来源未被监测：${source}`);
    return resolved;
  });
  const entries = [...json(repo, directory + 'catalog.json'), ...moduleEntries];
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
// Content is projected once for both the single-file reader and future module builds.
// Folder names are source owners; runtime IDs come from their actual manifests.
export function projectContent(repo, entries, reviews) {
  const externalIds = { 'midi-qol': 'midi-qol', 'server-next-external-candidates': null };
  const projected = entries.map(entry => {
    let foundryModuleId = null;
    if (entry.module !== undefined) {
      assert(typeof entry.module === 'string' && /^[a-z0-9-]+$/.test(entry.module), `${entry.id}：模块目录名无效`);
      const owner = `foundry-modules/${entry.module}/`;
      const manifestPath = ['src/module.json', 'module.json'].map(path => owner + path).find(path => existsSync(resolve(repo, path)));
      if (manifestPath) {
        foundryModuleId = json(repo, manifestPath).id;
        assert(typeof foundryModuleId === 'string' && /^[a-z0-9-]+$/.test(foundryModuleId), `${entry.id}：runtime module ID 无效`);
      } else {
        assert(Object.hasOwn(externalIds, entry.module), `${entry.id}：模块没有 manifest 或明确外部映射`);
        foundryModuleId = externalIds[entry.module];
      }
    }
    return { ...entry, entryId: entry.id, ownerDirectory: entry.module ? `foundry-modules/${entry.module}` : 'docs/handbook', foundryModuleId };
  });
  const sources = Object.fromEntries([...new Set(entries.flatMap(e => e.sources))].sort().map(path => [path, read(repo, path)]));
  return { schemaVersion: 1, entries: projected, reviews, sources };
}
// Delivery policy partitions every catalog ID explicitly. It never changes the
// complete offline catalog or weakens owner/watch/source validation above.
export function loadDeliveryPolicy(repo, entries) {
  const policy = json(repo, directory + 'delivery.json');
  assert(policy?.schemaVersion === 1 && !Array.isArray(policy)
    && Object.keys(policy).every(key => ['schemaVersion', 'foundryEntries', 'offlineOnlyEntries'].includes(key)), '手册交付策略格式无效');
  assert(Array.isArray(policy.foundryEntries) && policy.foundryEntries.length > 0
    && Array.isArray(policy.offlineOnlyEntries), '手册交付策略须显式登记两种阅读面');
  const catalogIds = new Set(entries.map(entry => entry.id));
  const seen = new Set();
  const register = id => {
    assert(typeof id === 'string' && catalogIds.has(id), `手册交付策略含未知 ID：${String(id)}`);
    assert(!seen.has(id), `手册交付策略 ID 重复或阅读面重叠：${id}`);
    seen.add(id);
  };
  policy.foundryEntries.forEach(register);
  for (const record of policy.offlineOnlyEntries) {
    assert(record && !Array.isArray(record) && Object.keys(record).length === 2
      && typeof record.reason === 'string' && record.reason.trim(), '离线专用条目必须登记 entryId 与原因');
    register(record.entryId);
  }
  assert(seen.size === catalogIds.size, `手册交付策略未登记全部 ID：${[...catalogIds].filter(id => !seen.has(id)).join(', ')}`);
  return policy;
}
export function projectForSurface(repo, entries, reviews, surface = 'standalone') {
  assert(['standalone', 'foundry'].includes(surface), '手册阅读面只允许 standalone 或 foundry');
  const policy = loadDeliveryPolicy(repo, entries);
  const included = surface === 'standalone' ? new Set(entries.map(e => e.id)) : new Set(policy.foundryEntries);
  const selected = entries.filter(entry => included.has(entry.id));
  const selectedReviews = Object.fromEntries(selected.filter(e => reviews[e.id]).map(e => [e.id,
    surface === 'foundry' ? { ...reviews[e.id], note: e.summary } : reviews[e.id]]));
  const content = projectContent(repo, selected, selectedReviews);
  const allSourcePaths = [...new Set(entries.flatMap(e => e.sources))].sort();
  const sourcePaths = Object.keys(content.sources);
  return { content, projection: {
    schemaVersion: 1,
    surface,
    entryIds: selected.map(e => e.id),
    omittedEntryIds: entries.filter(e => !included.has(e.id)).map(e => e.id),
    sourcePaths,
    excludedSourcePaths: allSourcePaths.filter(path => !Object.hasOwn(content.sources, path)),
    catalogEntryCount: entries.length,
  } };
}
function assertPlainExportPath(repo, file) {
  let current = repo;
  for (const component of ['dist', 'handbook', file]) {
    current = resolve(current, component);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    assert(!stat.isSymbolicLink(), '手册导出路径不能经过链接：' + current);
    if (component === file) assert(stat.isFile() && stat.nlink === 1, '手册导出目标必须是普通独立文件：' + current);
    else assert(stat.isDirectory(), '手册导出路径必须是普通目录：' + current);
  }
}
export function render(repo, entries, reviews, payload = projectForSurface(repo, entries, reviews, 'standalone').content) {
  const data = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  let template = read(repo, directory + 'template.html');
  if (template.includes('/* HANDBOOK_BUNDLE */')) {
    const bundle = normalize(execFileSync('bun', ['build', directory + 'client.js', '--target=browser', '--format=iife'], { cwd: repo, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
    template = template.replace('/* HANDBOOK_BUNDLE */', () => bundle.replace(/<\/script/gi, '<\\/script'));
  }
  return template
    .replace('/* HANDBOOK_STYLE */', () => read(repo, directory + 'style.css'))
    .replace('/* HANDBOOK_DATA */', () => data)
    .replace('/* HANDBOOK_CLIENT */', () => read(repo, directory + 'client.js'))
    .replaceAll('HANDBOOK_DIGEST', hash(data).slice(0, 12));
}
export function run(repo, args) {
  const [mode = 'check', target, flag, note] = args;
  assert(['build', 'check', 'review', 'status', 'export'].includes(mode), '用法：build | check | status | export [--surface=standalone|foundry] | review <id[,id]> --note "人工核对说明"');
  if (mode !== 'review') assert(args.length <= (mode === 'export' ? 2 : 1), '手册命令含不支持的参数');
  const surface = mode === 'export' ? (target === undefined ? 'standalone' : /^--surface=(standalone|foundry)$/.exec(target)?.[1]) : 'standalone';
  assert(surface, 'export 参数只允许 --surface=standalone 或 --surface=foundry');
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
  const delivery = projectForSurface(repo, entries, state.reviews, surface);
  if (mode === 'export') {
    const name = surface === 'standalone' ? 'content.json' : 'content.foundry.json';
    const projectionName = `projection.${surface}.json`;
    assertPlainExportPath(repo, name);
    assertPlainExportPath(repo, projectionName);
    const output = resolve(repo, 'dist/handbook', name);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(delivery.content, null, 2) + '\n');
    writeFileSync(resolve(repo, 'dist/handbook', projectionName), JSON.stringify(delivery.projection, null, 2) + '\n');
    return `PASS handbook:export · ${surface} · ${delivery.content.entries.length}/${entries.length} 项工具 · schemaVersion 1 · dist/handbook/${name}`;
  }
  const html = render(repo, entries, state.reviews, delivery.content);
  const output = resolve(repo, '工具手册.html');
  if (mode === 'build') writeFileSync(output, html);
  else assert(existsSync(output) && read(repo, '工具手册.html') === html, '离线页面未同步：运行 bun run handbook:build，并将 工具手册.html 随功能一起提交。');
  return `PASS handbook:${mode} · ${entries.length} 项工具 · 来源、目录覆盖、命令入口、内容指纹与离线页面一致`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(run(root, process.argv.slice(2))); }
  catch (error) { console.error(`FAIL handbook: ${error.message}`); process.exitCode = 1; }
}
