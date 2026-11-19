import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';
import { createForgeGuideApplicationClass } from '../src/guideApplication';
import { openForgeGuide } from '../src/index';

function environment() {
  const calls = { create: 0, render: 0, focus: 0 };
  const requests:any[]=[];
  class Application {
    rendered = false;
    constructor() { calls.create++; }
    render() { this.rendered = true; calls.render++; return this; }
    bringToFront() { calls.focus++; }
  }
  return { calls, requests,
    fetch:async(url:any,options:any)=>{requests.push({url,options});return new Response(readFileSync('foundry-modules/fvtt-json-forge/src/guide/index.html', 'utf8'),{headers:{'Content-Type':'text/plain; charset=utf-8'}});},
    game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.6' }, user: { isGM: true } },
    foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (Base: any) => Base } } },
  };
}

test('a bundled guide served as plain text renders in the native window with correct asset paths', async () => {
  const env = environment(), Class = createForgeGuideApplicationClass(env);
  const context = await new Class()._prepareContext();
  const html = Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-guide.hbs', 'utf8'))(context);
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:30001/game' });
  try {
    expect(env.requests).toEqual([{url:'modules/fvtt-json-forge/guide/index.html',options:{cache:'no-cache'}}]);
    expect(dom.window.document.querySelector('.forge-guide-document h1')?.textContent).toBe('Forge 图解手册');
    expect(dom.window.document.querySelector('nav a')?.getAttribute('href')).toBe('#prepare');
    expect(dom.window.document.querySelector<HTMLAnchorElement>('a[download]')?.href).toBe('http://127.0.0.1:30001/modules/fvtt-json-forge/guide/guide.pdf');
    for(const asset of dom.window.document.querySelectorAll('[download],img')) {
      expect(asset.getAttribute(asset.tagName==='IMG'?'src':'href')).toStartWith('modules/fvtt-json-forge/guide/');
    }
    expect(dom.window.document.querySelectorAll('iframe,script,form,base')).toHaveLength(0);
    expect(html).not.toMatch(/about:|srcdoc|blob:/u);
  } finally { dom.window.close(); }
});

test('guide links bypass document handlers while chapter navigation stays local and downloads keep their default',async()=>{
  const env=environment(),Class=createForgeGuideApplicationClass(env),viewer=new Class();
  const context=await viewer._prepareContext();
  const html=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-guide.hbs','utf8'))(context);
  const dom=new JSDOM(`<section id="continue">Other window</section><div id="viewer">${html}</div>`,{url:'http://127.0.0.1:30001/game'});
  try{
    viewer.element=dom.window.document.querySelector('#viewer');
    const target=viewer.element.querySelector('#continue') as HTMLElement;
    const calls:ScrollIntoViewOptions[]=[];
    let documentClicks=0;
    dom.window.document.addEventListener('click',()=>documentClicks++);
    target.scrollIntoView=options=>calls.push(options as ScrollIntoViewOptions);
    viewer._onRender();
    viewer._onRender();
    const event=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true});
    viewer.element.querySelector('nav a[href="#continue"]').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(calls).toEqual([{block:'start'}]);
    expect(documentClicks).toBe(0);
    const downloadEvent=new dom.window.Event('click',{bubbles:true,cancelable:true});
    viewer.element.querySelector('a[download]').dispatchEvent(downloadEvent);
    expect(downloadEvent.defaultPrevented).toBe(false);
    expect(documentClicks).toBe(0);
    expect(dom.window.location.href).toBe('http://127.0.0.1:30001/game');
  }finally{dom.window.close();}
});

test('generated guide styles stay scoped and replace host table colors with the readable guide palette',async()=>{
  const env=environment(),Class=createForgeGuideApplicationClass(env),context=await new Class()._prepareContext();
  const dom=new JSDOM(`<style>table tbody,table tr,table td,table tr:nth-child(odd),table tr:nth-child(even){background:#222;color:#ddd}</style><style data-guide>${context.guideStyles}</style><div class="forge-guide-document">${context.guideContent}</div>`);
  try{
    const checkRules=(rules:CSSRuleList)=>{
      for(const rule of rules){
        if('selectorText' in rule){
          for(const selector of (rule as CSSStyleRule).selectorText.split(','))expect(selector.trim()).toStartWith('.forge-guide-document');
        }
        if('cssRules' in rule)checkRules((rule as CSSMediaRule).cssRules);
      }
    };
    const rules=dom.window.document.querySelector<HTMLStyleElement>('style[data-guide]')!.sheet!.cssRules;
    expect(rules.length).toBeGreaterThan(10);
    checkRules(rules);
    for(const element of dom.window.document.querySelectorAll('tbody,tbody tr,td')){
      const style=dom.window.getComputedStyle(element);
      expect(style.backgroundColor).toBe('rgb(250, 249, 246)');
      expect(style.color).toBe('rgb(37, 48, 44)');
    }
  }finally{dom.window.close();}
});

test('the public guide entry reuses one viewer instead of opening duplicate windows', () => {
  const env = environment();
  openForgeGuide(env); openForgeGuide(env);
  expect(env.calls).toEqual({ create: 1, render: 1, focus: 1 });
});

test('the bundled guide explains the current GM task paths without engineering language or historical UI', async () => {
  const env = environment();
  const Class = createForgeGuideApplicationClass(env);
  const context = await new Class()._prepareContext();
  const guide = new JSDOM(context.guideContent);
  try {
    const text = guide.window.document.body.textContent ?? '';
    expect([...guide.window.document.querySelectorAll('section.chapter > h2')].map(heading => heading.textContent))
      .toEqual(['准备资料', '预览并核对', '选图并创建卡片', '保存资料与继续处理']);
    for (const label of ['手工蓝图', '标准资料', 'AI 整理', '顶部选择生物、物品或法术', '归档位置', 'Forge/Item', 'Forge/Spell', '当前资料', '资料库', '批量处理', '已创建的角色会保留']) {
      expect(text).toContain(label);
    }
    expect(text.replaceAll('Forge/Item', '')).not.toMatch(/\b(?:JSON|IR|accepted|hash|flags|Actor|Item)\b|bun run|旧版界面|旧版截图/iu);
    expect(guide.window.document.querySelectorAll('script, form, svg')).toHaveLength(0);
    const links = [...guide.window.document.querySelectorAll('a[download]')].map(anchor => anchor.getAttribute('href'));
    expect(links).toContain('modules/fvtt-json-forge/guide/guide.pdf');
    expect(links).toContain('modules/fvtt-json-forge/guide/source-example.md');
    expect(links).toContain('modules/fvtt-json-forge/guide/grandmother-sea-hag.forge-encounter.zip');
    expect(links).toContain('modules/fvtt-json-forge/guide/generic-status-source.md');
    expect(links).toContain('modules/fvtt-json-forge/guide/generic-status.forge-encounter.zip');
    const page = Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-guide.hbs', 'utf8'))(context);
    expect(page).not.toContain('以下示例截图来自旧版界面');
  } finally { guide.window.close(); }
});

test('GM and exact runtime guards reject before constructing a viewer', async () => {
  for (const patch of [{ user: { isGM: false } }, { version: '13.340' }]) {
    const env = environment(); Object.assign(env.game, patch);
    expect(() => openForgeGuide(env)).toThrow();
    expect(env.calls.create).toBe(0);
    const Class = createForgeGuideApplicationClass(env);
    await expect(new Class()._prepareContext()).rejects.toThrow();
    expect(env.requests).toHaveLength(0);
  }
});

test('a failed guide read displays an error and direct local downloads instead of a blank frame',async()=>{
  const env=environment();env.fetch=async()=>new Response('Unavailable',{status:404});
  const Class=createForgeGuideApplicationClass(env),context=await new Class()._prepareContext();
  const html=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-guide.hbs','utf8'))(context);
  const dom=new JSDOM(html,{url:'http://127.0.0.1:30001/game'});
  try{
    expect(dom.window.document.querySelector('[role="alert"]')?.textContent).toContain('无法读取内置手册');
    expect(dom.window.document.querySelector('iframe')).toBeNull();
    expect(dom.window.document.querySelector('a')?.href).toBe('http://127.0.0.1:30001/modules/fvtt-json-forge/guide/guide.pdf');
  }finally{dom.window.close();}
});
