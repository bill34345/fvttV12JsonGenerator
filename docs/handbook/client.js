(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('handbook-data').textContent);
  const main = document.getElementById('main');
  const search = document.getElementById('search');
  const announce = document.getElementById('announcement');
  const categories = {convert:'转换与导入',library:'资料与内容',play:'跑团辅助',maintain:'检查与维护'};
  const descriptions = {convert:'把 Markdown、TXT、PDF 或图片中的资料带进 Foundry。',library:'整理资料、角色图片和可复用的职业与种族内容。',play:'查找安装在 Foundry 里的面板、房规和交互工具。',maintain:'查看性能、检查生成结果，了解环境和开发工具。'};
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const enc = encodeURIComponent;
  const link = (id, text, cls='') => `<a class="${cls}" href="#${id}">${text}</a>`;
  const list = items => `<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
  const reviews = Object.values(data.reviews).map(r=>r.reviewedOn).sort();
  const latest = reviews.at(-1) || '未登记';
  const sourceNames = Object.keys(data.sources);
  let commands = [];
  let searchTimer;
  let theme = 'light';
  try { theme = localStorage.getItem('handbook-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light'); } catch {}
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme-toggle').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light':'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('handbook-theme', theme); } catch {}
    announce.textContent = `已切换到${theme === 'dark' ? '深色':'浅色'}主题`;
  });
  const toggle = document.getElementById('menu-toggle');
  toggle.addEventListener('click', () => toggle.setAttribute('aria-expanded', String(document.body.classList.toggle('menu-open'))));
  function navigation(active) {
    document.getElementById('navigation').innerHTML = link('home', '手册概览',active==='home'?'active':'')
      +link('all',`全部工具 <span>${data.entries.length}</span>`,active==='all'?'active':'')
      +Object.entries(categories).map(([id,name])=>link(`category/${id}`,`${name} <span>${data.entries.filter(e=>e.category===id).length}</span>`,active===id?'active':'')).join('');
    document.querySelectorAll('#navigation a.active').forEach(a=>a.setAttribute('aria-current','page'));
  }
  function rows(entries) {
    return `<div class="tool-list">${entries.map(e=>link(`tool/${e.id}`,`<div><h3>${esc(e.title)}</h3><p>${esc(e.summary)}</p></div><span class="row-meta">${categories[e.category]}　→</span>`,'tool-row')).join('')}</div>`;
  }
  function showHome() {
    navigation('home');
    return `<section class="hero"><p class="eyebrow">一本放在手边的工具说明书</p><h1>想做什么，从这里开始。</h1><p class="intro">从整理一只怪物，到准备下一场团。这里收录项目里的转换入口、内容合集、Foundry 模块与维护工具，帮你找到用法和边界。</p>${link('guide','第一次使用？先读这份简短指南 →','guide-link')}</section>
      <div class="task-grid">${Object.entries(categories).map(([id,name])=>link(`category/${id}`,`<strong>${name}<span aria-hidden="true">↗</span></strong><p>${descriptions[id]}</p>`,'task-link')).join('')}</div>
      <div class="section-heading"><h2>常用入口</h2><small>${data.entries.length} 项工具 · ${sourceNames.length} 份离线原始说明</small></div>
      ${rows(['web-workbench','fvtt-json-forge','monster-intake','monster-spell-resolver'].map(id=>data.entries.find(e=>e.id===id)).filter(Boolean))}
      <p class="subtle" style="margin-top:24px">最近内容核对：${esc(latest)}。核对日期表示手册内容审阅时间；功能的实际支持范围见各条目。</p>`;
  }
  function showEntry(e) {
    navigation(e.category);
    return `<article class="article">${link(`category/${e.category}`,`← ${categories[e.category]}`,'back-link')}<h1>${esc(e.title)}</h1><p class="intro">${esc(e.summary)}</p><div class="meta"><span class="tag">${categories[e.category]}</span><span>内容核对 ${esc(data.reviews[e.id]?.reviewedOn || '未登记')}</span><span>${esc(e.id)}</span></div>
      <div class="notice"><strong>什么时候用</strong><p>${esc(e.when)}</p></div>
      <section><h2>开始前准备</h2>${list(e.requires)}</section>
      <section><h2>怎么使用</h2>${e.steps.map((s,i)=>{
        let code = '';
        if(s.command){const index=commands.push(s.command)-1;code=`<div class="code-wrap"><div class="code-top"><span>在项目根目录的 PowerShell 中使用 · 先替换示例路径</span><button class="copy" data-copy="${index}">复制命令</button></div><pre class="command"><code>${esc(s.command)}</code></pre></div>`;}
        return `<div class="step"><span class="step-num" aria-hidden="true">${i+1}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>${code}</div></div>`;
      }).join('')}</section><section><h2>完成后会得到什么</h2>${list(e.outputs)}</section>
      <section class="notice limitations"><h2>适用范围与注意事项</h2>${list(e.limits)}</section>
      <section><h2>继续阅读</h2><p class="subtle">以下原始说明已打包在本文件中，无需联网。</p>${e.sources.map(p=>link(`source/${enc(p)}`,esc(p),'source-link')).join('')}</section></article>`;
  }
  function showGuide() {
    navigation('home');
    return `<article class="article">${link('home','← 手册概览','back-link')}<h1>先选择入口，再准备资料。</h1><p class="intro">这本手册负责解释和导航。实际转换在工作台或命令行运行，跑团模块在 Foundry 中使用。</p>
    <section><h2>我该从哪里开始？</h2><div class="tool-list">
    ${link('tool/web-workbench','<h3>希望用页面上传、转换和下载</h3><p>打开 Web 工作台，按页面提示选择任务与 AI 连接。</p>','tool-row')}
    ${link('tool/fvtt-json-forge','<h3>已经在 Foundry 里，想直接创建内容</h3><p>查看 JSON Forge 的 GM 操作流程和 accepted 条件。</p>','tool-row')}
    ${link('tool/markdown-convert','<h3>已有符合项目格式的 Markdown</h3><p>走正式 CLI 转换；不规则 TXT 则查看 AI Intake。</p>','tool-row')}
    ${link('tool/document-extraction','<h3>手里是 PDF 或怪物截图</h3><p>先用文档提取流程核对页码、阅读顺序和候选怪物。</p>','tool-row')}</div></section>
    <section><h2>看懂几个常见词</h2><ul><li><strong>Actor</strong>：怪物、NPC 或角色数据。</li><li><strong>Item</strong>：物品、法术、特性等条目。</li><li><strong>Intake</strong>：从原始资料中提取带证据的结构，再走正式生成。</li><li><strong>accepted</strong>：这次结果通过对应检查；仍要核对原文。</li><li><strong>needs_review / failed</strong>：需要处理问题，不能作为正式结果导入。</li><li><strong>core / modded</strong>：只使用核心规则，或包含特定第三方模块字段。</li></ul></section>
    <section><h2>版本要明确选择</h2><p>本手册的常规生成示例显式选择 v14/core。CLI 省略版本时仍默认 v12，Web 初始选择为 v14。单独模块的支持版本以它自己的条目为准。</p><p>结构检查通过、安装成功和真实跑团验证是不同层级。不要把单项通过理解成整个模组组合已兼容。</p></section>
    <section><h2>下次如何打开？</h2><p>双击项目根目录的“工具手册.html”，或把它加入浏览器收藏、创建桌面快捷方式。也可以把这个文件单独带走；目录、搜索、命令和已收录原始说明都能离线使用。</p><p>单独复制出去的文件是当时快照。希望随 master 更新，就收藏 master 工作区里的文件。完成本次合并后，它会使用固定路径，不受以后 topic 工作区的位置影响。</p></section></article>`;
  }
  function showUpdates() {
    navigation('home');
    return `<article class="article">${link('home','← 手册概览','back-link')}<h1>手册随功能一起更新。</h1><p class="intro">说明和离线页面与功能一起合并到 master。你打开 master 里的同一个文件，就会读到该版本的内容。</p><section><h2>每次新增或修改功能</h2><ol><li>在功能分支里更新对应工具的用途、步骤、版本和限制。</li><li>对照实际入口和文档核对；新的模块或工具必须登记到目录。</li><li>记录作者核对，重新生成离线页面，并通过同步检查。</li><li>将功能、说明和生成页面一起合并。合并后再次运行检查并打开受影响条目。</li></ol><p>检查能发现来源变化、漏登记和页面不同步；它不能替作者判断文字是否真实，也不代表新功能已通过运行时验收。</p></section>
    ${data.sources['docs/runbooks/handbook-maintenance.md'] ? link('source/'+enc('docs/runbooks/handbook-maintenance.md'),'阅读完整维护流程 →','source-link'):''}
    <section><h2>已登记的内容核对</h2><p class="subtle">以下是作者核对记录，按日期排列；不是软件发布日志或自动测试结论。</p><div class="tool-list">${[...data.entries].sort((a,b)=>(data.reviews[b.id]?.reviewedOn||'').localeCompare(data.reviews[a.id]?.reviewedOn||'')).map(e=>link('tool/'+e.id,`<div><h3>${esc(e.title)}</h3><p>${esc(data.reviews[e.id]?.note || '')}</p></div><span class="row-meta">${esc(data.reviews[e.id]?.reviewedOn || '')}</span>`,'tool-row')).join('')}</div></section></article>`;
  }
  const searchable = data.entries.map(e=>({e,text:JSON.stringify(e).toLocaleLowerCase()+' '+e.sources.map(p=>data.sources[p]).join(' ').toLocaleLowerCase()}));
  function showSearch(query) {
    navigation('all');
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const found = searchable.filter(x=>terms.every(term=>x.text.includes(term))).map(x=>x.e);
    announce.textContent = `找到 ${found.length} 项工具`;
    return `<h1>搜索结果</h1><p class="subtle">“${esc(query)}” · ${found.length} 项匹配 · 包含工具说明和收录的原始文档</p>${found.length?rows(found):'<div class="empty"><h2>没有找到匹配的工具</h2><p>换一个用途词，例如“怪物”“图片”或“监控”，也可以查看全部工具。</p>'+link('all','查看全部工具 →')+'</div>'}`;
  }
  function route() {
    clearTimeout(searchTimer);
    commands = [];
    let route;
    try { route=decodeURIComponent(location.hash.slice(1)) || 'home'; } catch { route='invalid'; }
    let body, title='概览';
    if(route.startsWith('search/')) {const q=route.slice(7);search.value=q;title='搜索';body=showSearch(q);}
    else {
      search.value='';
      if(route==='home') body=showHome();
      else if(route==='guide') {title='第一次使用';body=showGuide();}
      else if(route==='updates') {title='版本与更新';body=showUpdates();}
      else if(route==='all' || (route.startsWith('category/') && categories[route.slice(9)])) {
        const category=route.slice(9);title=route==='all'?'全部工具':categories[category];navigation(route==='all'?'all':category);
        body=`<h1>${title}</h1><p class="intro">${route==='all'?'按用途浏览项目中的全部工具。点开一项，查看步骤、产物和限制。':descriptions[category]}</p>${rows(data.entries.filter(e=>route==='all'||e.category===category))}`;
      } else if(route.startsWith('tool/') && data.entries.some(e=>e.id===route.slice(5))) {
        const e=data.entries.find(e=>e.id===route.slice(5));title=e.title;body=showEntry(e);
      } else if(route.startsWith('source/') && Object.hasOwn(data.sources,route.slice(7))) {
        const path=route.slice(7);title='原始说明';navigation('all');
        const owners=data.entries.filter(e=>e.sources.includes(path));
        body=`<article>${link('tool/'+owners[0].id,'← '+esc(owners[0].title),'back-link')}<h1>原始说明</h1><p class="subtle">${esc(path)}</p><p class="notice">这是该版本仓库文档的离线原文。旧例子、历史验收和维护命令保留原貌；当前推荐步骤与限制请先看工具条目。文中的路径可在仓库查阅。</p><pre class="source-body">${esc(data.sources[path])}</pre></article>`;
      } else {navigation('home');title='未找到';body=`<h1>这个条目没有收录。</h1><p>它可能已更名，试试上方搜索。</p>${link('all','查看全部工具 →')}`;}
    }
    main.innerHTML=body;document.title=`${title} · 项目工具手册`;document.getElementById('breadcrumb').textContent=`手册 / ${title}`;
    document.body.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');
    if(!route.startsWith('search/')) {window.scrollTo(0,0);main.focus({preventScroll:true});}
  }
  search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{const hash=search.value.trim()?'#search/'+enc(search.value.trim()):'#all';if(location.hash.startsWith('#search/')){history.replaceState(null,'',hash);route();}else location.hash=hash;},160);});
  document.addEventListener('keydown',event=>{
    if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){event.preventDefault();search.focus();}
    if(event.key==='Escape' && document.activeElement===search){search.value='';location.hash='all';}
  });
  main.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-copy]');if(!button)return;
    const command=commands[Number(button.dataset.copy)];if(typeof command!=='string')return;
    try {
      if(!navigator.clipboard?.writeText)throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(command);button.textContent='已复制';announce.textContent='命令已复制';
    } catch {
      const range=document.createRange();range.selectNodeContents(button.closest('.code-wrap').querySelector('code'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      button.textContent='已选中，请按 Ctrl+C';announce.textContent='浏览器限制自动复制。命令已选中，请按 Ctrl+C。';
    }
  });
  window.addEventListener('hashchange',route);route();
})();
