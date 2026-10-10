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
    fetch:async(url:any,options:any)=>{requests.push({url,options});return new Response('<!doctype html><html><head></head><body><h1>从一页 PDF 到中文怪物卡</h1><a href="guide.pdf" download>下载 PDF 手册</a></body></html>',{headers:{'Content-Type':'text/plain; charset=utf-8'}});},
    game: { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' }, user: { isGM: true } },
    foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (Base: any) => Base } } },
  };
}

test('a bundled guide served as plain text is rendered as a sandboxed document with correct download paths', async () => {
  const env = environment(), Class = createForgeGuideApplicationClass(env);
  const context = await new Class()._prepareContext();
  const html = Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-guide.hbs', 'utf8'))(context);
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:30001/game' });
  try {
    const frame = dom.window.document.querySelector('iframe')!;
    expect(env.requests).toEqual([{url:'modules/fvtt-json-forge/guide/index.html',options:{cache:'no-cache'}}]);
    expect(frame.hasAttribute('src')).toBe(false);
    const document=new JSDOM(frame.srcdoc,{url:dom.window.document.baseURI});
    try{
      expect(document.window.document.querySelector('h1')?.textContent).toBe('从一页 PDF 到中文怪物卡');
      expect(document.window.document.querySelector('a')?.href).toBe('http://127.0.0.1:30001/modules/fvtt-json-forge/guide/guide.pdf');
    }finally{document.window.close();}
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin allow-downloads');
    expect(dom.window.document.querySelectorAll('script,form')).toHaveLength(0);
  } finally { dom.window.close(); }
});

test('the public guide entry reuses one viewer instead of opening duplicate windows', () => {
  const env = environment();
  openForgeGuide(env); openForgeGuide(env);
  expect(env.calls).toEqual({ create: 1, render: 1, focus: 1 });
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
