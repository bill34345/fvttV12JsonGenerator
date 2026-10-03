import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('built Droppables registers real string namespaces and round-trips all settings', async () => {
  const code = await readFile(new URL('./dist/dfreds-droppables/dfreds-droppables.mjs', import.meta.url), 'utf8');
  const callbacks = new Map();
  const storage = new Map();
  const calls = [];
  const context = vm.createContext({
    Hooks: {once:(name, fn) => callbacks.set(name, fn), on:()=>{}},
    foundry: {canvas:{loadTexture:()=>{}},utils:{readTextFromFile:()=>{}},applications:{api:{Dialog:class {}, DialogV2:class {}}, handlebars:{renderTemplate:()=>{}}, ux:{TextEditor:{}}, apps:{FilePicker:class {}}}},
    game: {settings: {
      register(ns, key, config) {assert.equal(ns, 'dfreds-droppables'); calls.push(key); storage.set(key, config.default)},
      get(ns,key) {assert.equal(ns, 'dfreds-droppables'); return storage.get(key)},
      set(ns,key,value) {assert.equal(ns, 'dfreds-droppables'); storage.set(key,value)}
    }},
  });
  vm.runInContext(code + '\nglobalThis.TestSettings = Settings;', context);
  await callbacks.get('init')();
  assert.deepEqual(calls.sort(), ['dropStyle','enableCanvasDragUpload','enableSidebarDragUpload','enableUnlinkedActorDropHandler','lastUsedDropStyle']);
  const settings = new context.TestSettings();
  assert.equal(settings.dropStyle, 'dialog');
  assert.equal(settings.canvasDragUpload, true);
  settings.lastUsedDropStyle = 'horizontalLine';
  assert.equal(settings.lastUsedDropStyle, 'horizontalLine');
  assert.match(code, /modules\/dfreds-droppables\/templates\/drop-dialog\.hbs/);
});

test('Clocks native fade only animates newly rendered clocks without persistent opacity', async () => {
  const code = await readFile(new URL('./dist/global-progress-clocks/module/clock-panel.mjs', import.meta.url), 'utf8');
  const animations = [];
  const elements = new Map(['old','new'].map(id => [id, {dataset:{id}, animate:(frames,options)=>animations.push({id,frames,options})}]));
  const context = vm.createContext({
    foundry: {applications:{api:{Application: class {_onRender() {} render() {}}, HandlebarsApplicationMixin: c=>c}}, utils:{debounce:fn=>fn}},
    SortableJS: class {},
  });
  // Load the complete production class with imports supplied as test doubles.
  vm.runInContext(code.replace(/^import .*;\r?\n/gm, '').replace('export class ClockPanel', 'globalThis.ClockPanel = class ClockPanel'), context);
  const panel = new context.ClockPanel({}, {});
  panel.lastRendered = ['old'];
  panel.element = {
    querySelectorAll: selector => selector === '[data-id]' ? [...elements.values()] : [],
    querySelector: selector => selector === '.clock-list' ? null : elements.get(selector.match(/"(.+)"/)[1]),
  };
  panel._onRender({}, {});
  panel._onRender({}, {});
  assert.equal(animations.length, 1);
  assert.equal(animations[0].id, 'new');
  assert.equal(animations[0].options.duration, 250);
  assert.equal(animations[0].options.fill, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(animations[0].frames)), [{opacity:0},{opacity:1}]);
  assert.ok(!code.includes('gsap'));
});

async function fixtureHarness({badTarget=false, failActorB=false}={}) {
  const source=await readFile(new URL('./acceptance-macro.js',import.meta.url),'utf8');
  const dialogs=[]; const creations=[];
  const settings=new Map([['global-progress-clocks.activeClocks',{historical:{id:'historical',name:'Keep historical clock',value:2,max:4}}],['dfreds-droppables.dropStyle','stack'],['dfreds-droppables.lastUsedDropStyle','random']]);
  const game={world:{id:'cor-cotn'},version:'14.368',system:{id:'dnd5e',version:'6.0.2'},user:{isGM:true,id:'gm',name:'Gamemaster',role:4},paused:true,modules:new Map(),
    actors:new Map(),scenes:new Map(),folders:new Map(),users:new Map(),settings:{get:(ns,key)=>structuredClone(settings.get(`${ns}.${key}`)),set:async(ns,key,value)=>settings.set(`${ns}.${key}`,structuredClone(value))}};
  const canvas={scene:null};
  const macro={type:'script',flags:{},getFlag(ns,key){return this.flags[key]},async setFlag(ns,key,value){this.flags[key]=structuredClone(value)}};
  function documentClass(collection,type) {return class {
    static async create(data) {
      if (failActorB && data._id==='NXExt2901ActorBB') throw new Error('Simulated partial create failure');
      creations.push(data._id);
      const doc={...data,id:data._id,active:false,getFlag:(ns,key)=>data.flags[ns][key],toObject:()=>structuredClone(data),delete:async()=>collection.delete(data._id),view:async()=>{canvas.scene=doc},tokens:[]};
      doc.tokens.contents=[];
      if (type==='Folder') Object.defineProperty(doc,'contents',{get:()=>[...game.actors.values()].filter(a=>a.folder===data._id)});
      collection.set(data._id,doc);return doc;
    }
  }}
  const context=vm.createContext({game,canvas,location:{hostname:'127.0.0.1',port:badTarget?'30001':'30002'},CONST:{USER_ROLES:{PLAYER:1}},
    Actor:documentClass(game.actors,'Actor'),Scene:documentClass(game.scenes,'Scene'),Folder:documentClass(game.folders,'Folder'),User:documentClass(game.users,'User'),
    foundry:{utils:{deepClone:structuredClone},applications:{api:{DialogV2:class{constructor(options){this.options=options;dialogs.push(options)}render(){}}}}},
    document:{createElement:()=>({textContent:'',get outerHTML(){return this.textContent}})}});
  const run=()=>vm.runInContext(`(async function(){${source}\n})`,context).call(macro);
  async function action(name) {
    await run();const control=dialogs.at(-1);await control.buttons.find(b=>b.action===name).callback();
    return JSON.parse(dialogs.at(-1).content);
  }
  return {game,macro,creations,action,run,settings,setFailActorB:value=>{failActorB=value}};
}

test('persistent fixture tool resumes partial creation without duplicating objects and preserves historical clocks',async()=>{
  const h=await fixtureHarness({failActorB:true});
  const first=await h.action('prepare');assert.match(first.error,/partial create failure/);
  assert.equal(h.game.actors.size,1);
  h.setFailActorB(false);
  const next=await h.action('prepare');assert.equal(next.state.phase,'prepared');
  await h.action('prepare');assert.equal(h.creations.length,5);
  const cleaned=await h.action('cleanup');assert.equal(cleaned.state.phase,'cleaned');
  assert.equal(h.game.actors.size,0);assert.equal(h.game.folders.size,0);assert.equal(h.game.scenes.size,0);assert.equal(h.game.users.size,0);
  assert.equal(h.settings.get('global-progress-clocks.activeClocks').historical.value,2);
  assert.equal(h.settings.get('dfreds-droppables.dropStyle'),'stack');
  assert.match((await h.action('prepare')).error,/already cleaned/);
});

test('fixture tool refuses Mirror and foreign IDs before any fixture write',async()=>{
  const wrong=await fixtureHarness({badTarget:true});
  await assert.rejects(wrong.run(),/exact-target\/GM gate/);assert.equal(wrong.creations.length,0);
  const conflict=await fixtureHarness();
  conflict.game.folders.set('NXExt2901FolderA',{id:'NXExt2901FolderA',getFlag:()=>undefined});
  assert.match((await conflict.action('prepare')).error,/Protected ID collision/);assert.equal(conflict.creations.length,0);
});
