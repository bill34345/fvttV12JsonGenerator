import { createHandbookModel, HANDBOOK_CATEGORIES, HANDBOOK_DESCRIPTIONS } from './model';
import type { HandbookCategory, HandbookContent, HandbookEntry, HandbookHandle, HandbookHost, HandbookTheme } from './types';

const mounted = new WeakMap<HTMLElement, HandbookHandle>();
let sequence = 0;
const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

/** A root-local reader. Browser/Foundry state belongs to the supplied host adapter. */
export function mountHandbook(root: HTMLElement, content: HandbookContent, host: HandbookHost = {}): HandbookHandle {
  // Reject malformed content before replacing an existing, functioning reader.
  const model = createHandbookModel(content);
  mounted.get(root)?.dispose();
  const document = root.ownerDocument;
  const view = document.defaultView;
  if (!view) throw new TypeError('The handbook root needs a document window');
  const prefix = host.idPrefix ?? 'suite-handbook-' + (++sequence) + '-';
  const id = (name: string): string => prefix + name;
  const esc = escapeHtml;
  const enc = encodeURIComponent;
  const link = (route: string, text: string, cls = ''): string => host.href
    ? '<a class="' + esc(cls) + '" href="' + esc(host.href(route)) + '" data-route="' + esc(route) + '">' + text + '</a>'
    : '<button type="button" class="handbook-route ' + esc(cls) + '" data-route="' + esc(route) + '">' + text + '</button>';
  const list = (items: readonly string[]): string => '<ul>' + items.map(text => '<li>' + esc(text) + '</li>').join('') + '</ul>';
  const data = model.content;
  const categories = HANDBOOK_CATEGORIES;
  const descriptions = HANDBOOK_DESCRIPTIONS;
  const latest = model.latestReview;
  const sourceNames = model.sourceNames;
  const inFoundry = host.surface === 'foundry';
  const showModuleStates = inFoundry && typeof host.readModuleState === 'function';
  let active = true;
  let generation = 0;
  let commands: string[] = [];
  let currentRoute = 'home';
  let searchTimer: number | undefined;
  let theme: HandbookTheme = host.initialTheme === 'dark' ? 'dark' : 'light';
  root.classList.add('handbook-root');
  root.dataset.handbookTheme = theme;
  root.innerHTML = [
    '<button type="button" class="skip" data-skip>跳到正文</button>',
    '<aside id="' + esc(id('sidebar')) + '">',
    link('home', '<span class="brand-mark" aria-hidden="true">F</span><span>Foundry 工具箱<small>用户手册</small></span>', 'brand'),
    '<p class="nav-caption">查找与使用</p><nav id="' + esc(id('navigation')) + '" data-navigation aria-label="手册分类"></nav>',
    '<div class="sidebar-note"><strong>随时打开，慢慢查。</strong><p>' + (inFoundry ? '这里提供用户操作说明。<br>完整离线手册另行交付。<br>阅读不执行工具操作。' : '所有说明都在这里。<br>阅读无需启动 Foundry。') + '</p>' + link('guide', '第一次使用 →') + '</div>',
    '<footer><span>离线中文手册</span>' + link('updates', '手册核对与更新记录') + '<small>内容标识 ' + esc(host.contentDigest || '本地内容') + '</small></footer></aside>',
    '<div class="workspace"><header class="topbar"><button type="button" id="' + esc(id('menu-toggle')) + '" data-menu-toggle class="quiet mobile-only" aria-expanded="false" aria-controls="' + esc(id('sidebar')) + '">目录</button>',
    '<span id="' + esc(id('breadcrumb')) + '" data-breadcrumb>手册 / 概览</span>' + (showModuleStates ? '<button type="button" data-modules-refresh class="quiet" aria-label="刷新当前世界模块状态">刷新状态</button>' : '') + '<button type="button" id="' + esc(id('theme-toggle')) + '" data-theme-toggle class="quiet" aria-label="切换深浅主题">切换主题</button></header>',
    '<div class="search-wrap"><label for="' + esc(id('search')) + '">搜索工具、用途或说明内容</label><div class="search-box"><span aria-hidden="true">⌕</span><input id="' + esc(id('search')) + '" data-search type="search" placeholder="试试“怪物”“法术”“卡顿”或 Forge" autocomplete="off"><kbd>/</kbd></div></div>',
    '<main id="' + esc(id('main')) + '" data-main tabindex="-1"></main><div id="' + esc(id('announcement')) + '" data-announcement class="sr-only" role="status" aria-live="polite"></div></div>',
  ].join('');
  const main = root.querySelector<HTMLElement>('[data-main]')!;
  const search = root.querySelector<HTMLInputElement>('[data-search]')!;
  const announce = root.querySelector<HTMLElement>('[data-announcement]')!;
  const navigationSlot = root.querySelector<HTMLElement>('[data-navigation]')!;
  const breadcrumb = root.querySelector<HTMLElement>('[data-breadcrumb]')!;
  const toggle = root.querySelector<HTMLButtonElement>('[data-menu-toggle]')!;

  function navigation(active: string) {
    navigationSlot.innerHTML = link('home', '手册概览',active==='home'?'active':'')
      +link('guide','开始使用',active==='guide'?'active':'')
      +link('tool/version-selection','版本与兼容性',active==='version-selection'?'active':'')
      +link('all',`全部工具 <span>${data.entries.length}</span>`,active==='all'?'active':'')
      +Object.entries(categories).map(([id,name])=>link(`category/${id}`,`${name} <span>${data.entries.filter(e=>e.category===id).length}</span>`,active===id?'active':'')).join('');
    navigationSlot.querySelectorAll('[data-route].active').forEach(a=>a.setAttribute('aria-current','page'));
  }
  function moduleStateContent(moduleId: string, detail: boolean): { state: string; html: string } {
    let snapshot;
    try { snapshot = host.readModuleState?.(moduleId); } catch { /* Read failure stays unknown. */ }
    const state = snapshot && ['enabled', 'disabled', 'missing', 'unknown'].includes(snapshot.state) ? snapshot.state : 'unknown';
    const labels = { enabled: '已启用', disabled: '未启用', missing: '未安装', unknown: '状态未知' };
    const label = labels[state as keyof typeof labels];
    const installed = state === 'enabled' || state === 'disabled';
    const version = typeof snapshot?.version === 'string' && snapshot.version.trim() ? snapshot.version.trim() : '版本未知';
    if (!detail) return { state, html: esc(label) + (installed ? ' · ' + esc(version) : '') };
    return { state, html: '<div class="module-state-heading"><strong>当前世界模块状态</strong><span class="module-state-value">'
      + (installed ? '已安装 · ' : '') + esc(label) + '</span></div><span class="module-state-id">' + esc(moduleId) + '</span>'
      + (installed ? '<span>实际版本：' + esc(version) + '</span>' : '')
      + '<p class="subtle">功能适用范围见本页说明。安装或启停模块后，按 Foundry 提示重载页面。</p>' };
  }
  function moduleState(entry: HandbookEntry, detail = false): string {
    if (!showModuleStates || !entry.foundryModuleId) return '';
    const content = moduleStateContent(entry.foundryModuleId, detail);
    const tag = detail ? 'section' : 'span';
    return '<' + tag + ' class="module-state-' + (detail ? 'detail' : 'brief') + '" data-handbook-module-id="'
      + esc(entry.foundryModuleId) + '" data-handbook-module-view="' + (detail ? 'detail' : 'brief')
      + '" data-handbook-module-state="' + content.state + '">' + content.html + '</' + tag + '>';
  }
  function refreshModuleStates(): void {
    for (const element of root.querySelectorAll<HTMLElement>('[data-handbook-module-id]')) {
      const content = moduleStateContent(element.dataset.handbookModuleId!, element.dataset.handbookModuleView === 'detail');
      element.dataset.handbookModuleState = content.state;
      element.innerHTML = content.html;
    }
    announce.textContent = '已刷新当前世界模块状态';
  }
  function rows(entries: readonly HandbookEntry[]) {
    return `<div class="tool-list">${entries.map(e=>link(`tool/${e.id}`,`<div><h3>${esc(e.title)}</h3>${moduleState(e)}<p>${esc(e.summary)}</p></div><span class="row-meta">${categories[e.category]}　→</span>`,'tool-row')).join('')}</div>`;
  }
  function showHome() {
    navigation('home');
    return `<section class="hero"><h1>找到工具，开始下一场团。</h1><p class="intro">在 Foundry 中编辑生物、导入资料，或使用跑团辅助模块。先选择要做的事，再查看准备、步骤和适用版本。</p>${link('guide','第一次使用：选择入口与准备资料 →','guide-link')}<p class="subtle">主要平台为 Foundry V14。dnd5e 5.3.3 与 6.x 的支持按工具分别说明。${link('tool/version-selection','先核对版本与兼容性 →')}</p></section>
      <div class="task-grid">${Object.entries(categories).map(([id,name])=>link(`category/${id}`,`<strong>${name}<span aria-hidden="true">↗</span></strong><p>${descriptions[id as HandbookCategory]}</p>`,'task-link')).join('')}</div>
      <div class="section-heading"><h2>常用入口</h2><small>${data.entries.length} 项工具 · ${sourceNames.length} 份离线原始说明</small></div>
      ${rows(['fvtt-json-forge','open-session-deck','web-workbench','monster-spell-resolver'].map(id=>data.entries.find(e=>e.id===id)).filter((e): e is HandbookEntry => e !== undefined))}
      <p class="subtle" style="margin-top:24px">最近内容核对：${esc(latest)}。核对日期表示手册内容审阅时间；功能的实际支持范围见各条目。</p>`;
  }
  function showEntry(e: HandbookEntry) {
    navigation(e.id==='version-selection'?e.id:e.category);
    return `<article class="article">${link(`category/${e.category}`,`← ${categories[e.category]}`,'back-link')}<h1>${esc(e.title)}</h1><p class="intro">${esc(e.summary)}</p><div class="meta"><span class="tag">${categories[e.category]}</span><span>内容核对 ${esc(data.reviews[e.id]?.reviewedOn || '未登记')}</span></div>
      ${moduleState(e, true)}<nav class="article-index" aria-label="本页内容">${[['prepare','开始前准备'],['steps','操作步骤'],['outputs','产物'],['limits','适用范围'],['sources','原始说明']].map(([id,label])=>`<button type="button" data-section="${id}">${label}</button>`).join('')}</nav>
      <div class="notice"><strong>什么时候用</strong><p>${esc(e.when)}</p></div>
      <section><h2 id="${esc(id('prepare'))}" data-handbook-section="prepare" tabindex="-1">开始前准备</h2>${list(e.requires)}</section>
      <section><h2 id="${esc(id('steps'))}" data-handbook-section="steps" tabindex="-1">怎么使用</h2>${e.steps.map((s,i)=>{
        let code = '';
        if(s.command){const index=commands.push(s.command)-1;code=`<div class="code-wrap"><div class="code-top"><span>在项目根目录的 PowerShell 中使用 · 先替换示例路径</span><button type="button" class="copy" data-copy="${index}">复制命令</button></div><pre class="command"><code>${esc(s.command)}</code></pre></div>`;}
        return `<div class="step"><span class="step-num" aria-hidden="true">${i+1}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>${code}</div></div>`;
      }).join('')}</section><section><h2 id="${esc(id('outputs'))}" data-handbook-section="outputs" tabindex="-1">完成后会得到什么</h2>${list(e.outputs)}</section>
      <section class="notice limitations"><h2 id="${esc(id('limits'))}" data-handbook-section="limits" tabindex="-1">适用范围与注意事项</h2>${list(e.limits)}</section>
      <section><h2 id="${esc(id('sources'))}" data-handbook-section="sources" tabindex="-1">继续阅读</h2><details class="source-details"><summary>查看 ${e.sources.length} 份离线原始说明</summary><p class="subtle">原始文档保留技术细节和历史记录。当前用法以本页步骤与限制为先。</p>${e.sources.map(p=>link(`source/${enc(p)}`,esc(p),'source-link')).join('')}</details></section></article>`;
  }
  function showGuide() {
    navigation('guide');
    return `<article class="article">${link('home','← 手册概览','back-link')}<h1>先选择入口，再准备资料。</h1><p class="intro">这本手册负责解释和导航。实际转换在操作台或命令行运行，跑团模块在 Foundry 中使用。</p>
    <section><h2>我该从哪里开始？</h2><div class="tool-list">
    ${link('tool/fvtt-json-forge','<h3>在 Foundry 里编辑生物或创建物品</h3><p>以 GM 身份进入世界，从 Actor / Item 目录打开 Forge 操作台；核对预览后明确创建。</p>','tool-row')}
    ${link('category/play','<h3>寻找跑团时使用的面板与规则工具</h3><p>按用途选择模块，再核对版本、依赖和使用步骤；无需启用整个合集。</p>','tool-row')}
    ${link('tool/web-workbench','<h3>从网页上传、转换和下载资料</h3><p>启动本机 Web 操作台，按页面提示选择任务与 AI 连接。</p>','tool-row')}
    ${link('tool/markdown-convert','<h3>已有符合项目格式的 Markdown</h3><p>走正式 CLI 转换；不规则 TXT 则查看 AI Intake。</p>','tool-row')}
    ${link('tool/document-extraction','<h3>手里是 PDF 或怪物截图</h3><p>先用文档提取流程核对页码、阅读顺序和候选怪物。</p>','tool-row')}</div></section>
    <section><h2>看懂几个常见词</h2><ul><li><strong>Actor</strong>：怪物、NPC 或角色数据。</li><li><strong>Item</strong>：物品、法术、特性等条目。</li><li><strong>Intake</strong>：从原始资料中提取带证据的结构，再走正式生成。</li><li><strong>accepted</strong>：这次结果通过对应检查；仍要核对原文。</li><li><strong>needs_review / failed</strong>：需要处理问题，不能作为正式结果导入。</li><li><strong>core / modded</strong>：只使用核心规则，或包含特定第三方模块字段。</li></ul></section>
    <section><h2>开始前先核对版本</h2><p>Foundry V14 与 dnd5e 5.3.3 / 6.x 是两个不同的版本号。5.x 固定 5.3.3，6.x 按功能适配；同一合集里的模块可能有不同支持范围。</p><p>本手册的常规生成示例显式选择 v14/core。CLI 省略版本时仍默认 v12，Web 初始选择为 v14。${link('tool/version-selection','查看版本选择步骤与当前支持矩阵 →')}</p></section>
    <section><h2>生成后怎么确认可以用？</h2><ol><li>阅读预览、警告和需要人工处理的项目。</li><li>对照原文核对数值、动作、次数与限制；检查通过不代替来源核对。</li><li>确认目标版本，再明确创建或导入到 Foundry；核对实际卡片与所需行为。</li></ol><p>AI 的 API Key、本机 Companion 与网站提供的 AI 是不同连接方式，详见对应工具的连接说明。</p></section>
    <section><h2>下次如何打开？</h2>${inFoundry ? '<p>以 GM 身份进入世界，从游戏设置 → 配置设置 → 模组设置中的“统一操作手册”再次打开。同一手册窗口会回到前台。</p><p>手册随模块保存。取得新版模块后按正常安装流程更新并刷新客户端；各个工具仍按自己的步骤、版本与权限使用。</p>' : '<p>双击项目根目录的“工具手册.html”，或把它加入浏览器收藏、创建桌面快捷方式。也可以把这个文件单独带走；目录、搜索、命令和已收录原始说明都能离线使用。</p><p>单独复制出去的文件是当时快照。希望随 master 更新，就收藏 master 工作区里的文件。完成本次合并后，它会使用固定路径，不受以后 topic 工作区的位置影响。</p>'}</section></article>`;
  }
  function showUpdates() {
    navigation('home');
    return `<article class="article">${link('home','← 手册概览','back-link')}<h1>手册核对与更新记录</h1><p class="intro">这里记录说明何时经过核对。软件的兼容版本请看${link('tool/version-selection','版本与兼容性')}及具体工具的适用范围。</p><section><h2>如何取得更新后的手册？</h2>${inFoundry ? '<p>取得新版手册模块后按正常安装流程更新并刷新客户端。手册随包保存，不会联网更新或执行工具操作；具体工具的支持范围仍以对应条目为准。</p><p>工程与历史入口保留在另行交付的完整离线手册中。</p>' : '<p>打开 master 工作区里的同一个“工具手册.html”，随项目更新后刷新即可。单独复制出去的文件是当时快照，需要重新取得；本文件不会联网更新或执行操作。</p>'}</section>${inFoundry ? '' : '<details class="source-details"><summary>维护者：如何同步说明与功能</summary><ol><li>在功能分支里更新对应工具的用途、步骤、版本和限制。</li><li>对照实际入口和文档核对；新的模块或工具必须登记到目录。</li><li>记录作者核对，重新生成离线页面，并通过同步检查。</li><li>将功能、说明和生成页面一起合并。合并后再次运行检查并打开受影响条目。</li></ol><p>检查能发现来源变化、漏登记和页面不同步；它不能替作者判断文字是否真实，也不代表新功能已通过运行时验收。</p></details>'}
    ${!inFoundry && data.sources['docs/runbooks/handbook-maintenance.md'] ? link('source/'+enc('docs/runbooks/handbook-maintenance.md'),'阅读完整维护流程 →','source-link'):''}
    <section><h2>${inFoundry ? '各工具说明的核对日期' : '已登记的内容核对'}</h2><p class="subtle">${inFoundry ? '按核对日期浏览工具说明。日期表示说明经过核对，适用版本与实际接受范围请查看具体条目。' : '以下是作者核对记录，按日期排列；不是软件发布日志或自动测试结论。'}</p><div class="tool-list">${[...data.entries].sort((a,b)=>(data.reviews[b.id]?.reviewedOn||'').localeCompare(data.reviews[a.id]?.reviewedOn||'')).map(e=>link('tool/'+e.id,`<div><h3>${esc(e.title)}</h3><p>${esc(inFoundry ? e.summary : data.reviews[e.id]?.note || '')}</p></div><span class="row-meta">${esc(data.reviews[e.id]?.reviewedOn || '')}</span>`,'tool-row')).join('')}</div></section></article>`;
  }


  function showSearch(query: string): string {
    navigation('all');
    const found = model.search(query);
    announce.textContent = '找到 ' + found.length + ' 项工具';
    return '<h1>搜索结果</h1><p class="subtle">“' + esc(query) + '” · ' + found.length
      + ' 项匹配 · 包含工具说明和收录的原始文档</p>'
      + (found.length ? rows(found) : '<div class="empty"><h2>没有找到匹配的工具</h2><p>换一个用途词，例如“怪物”“图片”或“监控”，也可以查看全部工具。</p>' + link('all', '查看全部工具 →') + '</div>');
  }

  function clearSearch(): void {
    if (searchTimer !== undefined) view!.clearTimeout(searchTimer);
    searchTimer = undefined;
  }
  function closeMenu(): void {
    root.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  function focusSection(section: string): void {
    const heading = [...main.querySelectorAll<HTMLElement>('[data-handbook-section]')]
      .find(element => element.dataset.handbookSection === section);
    if (!heading) return;
    heading.closest('details')?.setAttribute('open', '');
    heading.focus({ preventScroll: true });
    heading.scrollIntoView?.({ block: 'start' });
  }
  function render(rawRoute: string, section?: string): void {
    if (!active) return;
    clearSearch();
    generation++;
    commands = [];
    const route = model.resolveRoute(rawRoute);
    currentRoute = rawRoute;
    search.value = route.kind === 'search' ? route.query : '';
    let body: string;
    switch (route.kind) {
      case 'home': body = showHome(); break;
      case 'guide': body = showGuide(); break;
      case 'updates': body = showUpdates(); break;
      case 'search': body = showSearch(route.query); break;
      case 'tool': body = showEntry(route.entry); break;
      case 'category':
        navigation(route.category);
        body = '<h1>' + esc(route.title) + '</h1><p class="intro">'
          + (route.category === 'all' ? '按用途浏览项目中的全部工具。点开一项，查看步骤、产物和限制。' : descriptions[route.category])
          + '</p>' + rows(route.entries);
        break;
      case 'source': {
        const owner = route.owners[0]!;
        navigation('all');
        body = '<article>' + link('tool/' + owner.id, '← ' + esc(owner.title), 'back-link')
          + '<h1>原始说明</h1><p class="subtle">' + esc(route.path)
          + '</p><p class="notice">这是该版本仓库文档的离线原文。旧例子、历史验收和维护命令保留原貌；当前推荐步骤与限制请先看工具条目。文中的路径可在仓库查阅。</p><pre class="source-body">'
          + esc(route.text) + '</pre></article>';
        break;
      }
      default:
        navigation('home');
        body = '<h1>这个条目没有收录。</h1><p>它可能已更名，试试上方搜索。</p>' + link('all', '查看全部工具 →');
    }
    main.innerHTML = body;
    breadcrumb.textContent = '手册 / ' + route.title;
    host.onTitleChange?.(route.title + ' · 用户手册');
    closeMenu();
    if (route.kind !== 'search') {
      host.scrollToTop?.(main);
      main.focus({ preventScroll: true });
    }
    if (section) focusSection(section);
  }
  function navigate(entryIdOrRoute: string, section?: string): void {
    const route = data.entries.some(entry => entry.entryId === entryIdOrRoute) ? 'tool/' + entryIdOrRoute : entryIdOrRoute;
    render(route, section);
  }
  function userNavigate(route: string, replace = false): void {
    render(route);
    if (active) host.onNavigate?.(route, { replace });
  }
  function keydown(event: KeyboardEvent): void {
    if (!active || event.defaultPrevented) return;
    const element = document.activeElement;
    const editing = element?.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
      || element?.closest('[contenteditable]:not([contenteditable="false"])');
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !editing) {
      event.preventDefault();
      search.focus();
    }
    if (event.key === 'Escape' && element === search) {
      event.preventDefault();
      search.value = '';
      userNavigate('all');
    }
  }
  function input(event: Event): void {
    if (event.target !== search) return;
    clearSearch();
    searchTimer = view!.setTimeout(() => {
      if (!active) return;
      const query = search.value.trim();
      userNavigate(query ? 'search/' + enc(query) : 'all', model.resolveRoute(currentRoute).kind === 'search');
    }, 160);
  }
  async function copy(button: HTMLButtonElement): Promise<void> {
    const command = commands[Number(button.dataset.copy)];
    if (typeof command !== 'string') return;
    const started = generation;
    const live = (): boolean => active && started === generation && root.contains(button);
    try {
      if (!host.copyText) throw new Error('clipboard unavailable');
      await host.copyText(command);
      if (!live()) return;
      button.textContent = '已复制';
      announce.textContent = '命令已复制';
    } catch {
      if (!live()) return;
      const code = button.closest('.code-wrap')?.querySelector('code');
      if (!code) return;
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = view!.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      button.textContent = '已选中，请按 Ctrl+C';
      announce.textContent = '浏览器限制自动复制。命令已选中，请按 Ctrl+C。';
    }
  }
  function click(event: MouseEvent): void {
    const target = event.target;
    if (!target || typeof (target as Element).closest !== 'function') return;
    const element = (target as Element).closest<HTMLElement>('[data-route], [data-section], [data-copy], [data-skip], [data-menu-toggle], [data-theme-toggle], [data-modules-refresh]');
    if (!element || !root.contains(element) || element.closest('.handbook-root') !== root) return;
    if (element.hasAttribute('data-route')) {
      // Standalone links retain normal open-in-new-tab behavior.
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      userNavigate(element.dataset.route!);
    } else if (element.hasAttribute('data-section')) {
      focusSection(element.dataset.section!);
    } else if (element.hasAttribute('data-copy')) {
      event.preventDefault();
      void copy(element as HTMLButtonElement);
    } else if (element.hasAttribute('data-skip')) {
      event.preventDefault();
      main.focus({ preventScroll: true });
      main.scrollIntoView?.({ block: 'start' });
    } else if (element.hasAttribute('data-menu-toggle')) {
      toggle.setAttribute('aria-expanded', String(root.classList.toggle('menu-open')));
    } else if (element.hasAttribute('data-modules-refresh')) {
      event.preventDefault();
      refreshModuleStates();
    } else if (element.hasAttribute('data-theme-toggle')) {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.dataset.handbookTheme = theme;
      host.onThemeChange?.(theme);
      announce.textContent = '已切换到' + (theme === 'dark' ? '深色' : '浅色') + '主题';
    }
  }
  const unsubscribe: (() => void)[] = [];
  const handle: HandbookHandle = {
    navigate,
    dispose(): void {
      if (!active) return;
      active = false;
      generation++;
      clearSearch();
      root.removeEventListener('click', click);
      root.removeEventListener('input', input);
      root.removeEventListener('keydown', keydown);
      for (const release of unsubscribe) release();
      closeMenu();
      if (mounted.get(root) === handle) mounted.delete(root);
    },
  };
  root.addEventListener('click', click);
  root.addEventListener('input', input);
  root.addEventListener('keydown', keydown);
  mounted.set(root, handle);
  try {
    render(host.initialRoute || 'home');
    if (host.subscribeRoute) unsubscribe.push(host.subscribeRoute(navigate));
    if (host.subscribeShortcuts) unsubscribe.push(host.subscribeShortcuts(keydown));
  } catch (error) {
    handle.dispose();
    throw error;
  }
  return handle;
}
