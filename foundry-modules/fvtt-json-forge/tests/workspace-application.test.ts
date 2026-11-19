import { NativeDocumentFixture } from './native-document-fixture';
import { fakeWorldFolders } from '../../../tests/helpers/forge-world-folders';
import { describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';
import { convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
import { parseCreatureBlueprintSource } from '@fvtt-json-generator/forge-browser-runtime/creature-blueprint';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { ManagedForgeSourceLibrary, MemoryForgeSourceLibraryStore } from '@fvtt-json-generator/forge-browser-runtime/source-library';
import { ManagedForgeBatchQueue, MemoryForgeBatchQueueStore } from '@fvtt-json-generator/forge-browser-runtime/batch-queue';
import {createForgeBatchCollection} from '@fvtt-json-generator/forge-browser-runtime/batch-collection';
import {splitCollection} from '@fvtt-json-generator/ingest-plaintext/plaintext-core';
import { createForgeWorkspaceApplicationClass, type ForgeWorkspaceEnvironment } from '../src/workspaceApplication';
import { clearAllForgeSessionApiKeys, markForgeSessionConnectionTested, saveForgeSessionSettings } from '../src/settings';
import {MemoryIntakeCandidateStore} from '../src/intakeCandidateRecovery';
import {LURKER_SOURCE,buildValidLurkerIr} from '../../../src/core/intake/__tests__/fixtures/lurker';

const source = readFileSync('obsidian/dnd数据转fvttjson/input/nightgaunt__夜魇.md', 'utf8');
const itemSource = readFileSync('obsidian/dnd数据转fvttjson/input/items/骑士之盾.md', 'utf8');
const template = (name: string, context: object) => Handlebars.compile(readFileSync(`foundry-modules/fvtt-json-forge/src/templates/${name}.hbs`, 'utf8'))(context);

describe('unified Forge workspace using its actual templates', () => {
  test('standard creature card uses name and HP from ordinary Markdown', async () => {
    const c = await makeWorkspace({ initialMode: 'structured' });
    try {
      const markdown = readFileSync('tests/fixtures/plaintext/forge-standard-aboleth.md', 'utf8');
      c.edit(c.formal(), 'source', markdown);
      c.button(c.formal(), 'generate').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const card = c.formal().querySelector('[data-statblock]')!;
      expect(card.textContent).toContain('底栖魔鱼 Aboleth');
      expect(card.textContent).toMatch(/150.*20d10\s*\+\s*40/);
      expect(card.textContent).not.toContain('黄铜龙');
      expect(c.value(c.formal(), 'source')).toBe(markdown.replace(/\r\n/gu, '\n'));
    } finally { await c.cleanup(); }
  });

  test('the Item workspace shows a readable standalone spell preview from its own draft', async () => {
    const c = await makeWorkspace({ directoryKind: 'Item' });
    const root = c.root.querySelector<HTMLElement>('[data-forge-pane="spell"]')!;
    const button = (action: string) => root.querySelector<HTMLButtonElement>('[data-spell-' + action + ']')!;
    const draft = root.querySelector<HTMLTextAreaElement>('[data-spell-source]')!;
    try {
      expect(root.hidden).toBe(true);
      c.root.querySelector<HTMLButtonElement>('[data-forge-mode="spell"]')!.click();
      expect(root.hidden).toBe(false);
      expect(c.formal().hidden).toBe(true);
      expect(c.intake().hidden).toBe(true);
      expect(c.root.querySelector<HTMLElement>('[data-workspace-connection-notice]')!.hidden).toBe(true);
      button('example').click();
      button('generate').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const sheet = root.querySelector('[data-spell-sheet]')!;
      expect(sheet.textContent).toContain('疗伤术 Cure Wounds');
      expect(sheet.textContent).toContain('触碰');
      expect(sheet.textContent).toContain('2d8 + 施法属性调整值');
      const itemIntake = c.root.querySelector<HTMLElement>('[data-application-part="itemIntake"]')!;
      for (const view of ['library', 'batch']) {
        c.root.querySelector<HTMLButtonElement>(`[data-workspace-${view}]`)!.click();
        expect(root.hidden).toBe(true);
        expect(itemIntake.hidden).toBe(false);
        c.button(itemIntake, 'view-editor').click();
        expect(root.hidden).toBe(false);
        expect(itemIntake.hidden).toBe(true);
        expect(sheet.textContent).toContain('疗伤术 Cure Wounds');
      }
      expect(root.querySelector('[data-spell-json]')).toBeNull();
      expect(root.querySelector('[data-spell-download]')).toBeNull();
      const icon = root.querySelector<HTMLImageElement>('[data-spell-icon] [data-icon-image]')!;
      expect(icon.getAttribute('src')).toBe('icons/magic/nature/leaf-drip-light-green.webp');
      expect(root.querySelector('[data-spell-icon] [data-icon-file]')?.getAttribute('accept')).toBe('image/png,image/jpeg,image/webp');
      const original = draft.value;
      draft.value = draft.value.replace('rules: 2024', 'rules: 2014');
      draft.dispatchEvent(new root.ownerDocument.defaultView!.Event('input'));
      expect(button('create').disabled).toBe(true);
      expect(root.querySelector('[data-spell-preview-state]')?.textContent).toContain('预览待更新');
      expect(sheet.textContent).toContain('疗伤术 Cure Wounds');
      button('generate').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(root.querySelector('[data-spell-error]')!.textContent).toContain('rules');
      expect(button('create').disabled).toBe(true);
      c.app.selectMode('structured');
      expect(c.value(c.formal(), 'source')).toBe('');
      c.app.selectMode('spell');
      expect(draft.value).toBe(original.replace('rules: 2024', 'rules: 2014'));
      const fireball = readFileSync('tests/fixtures/forge-spells/fireball.md', 'utf8');
      const file = root.querySelector<HTMLInputElement>('[data-spell-file]')!;
      Object.defineProperty(file, 'files', { value: [new File([fireball], 'fireball.md')] });
      file.dispatchEvent(new root.ownerDocument.defaultView!.Event('change'));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(draft.value).toBe(fireball.replace(/\r\n/gu, '\n'));
      expect(root.querySelector('[data-spell-file-name]')!.textContent).toBe('fireball.md');
      button('generate').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(root.querySelector('[data-spell-sheet]')!.textContent).toContain('20 尺球形');
      expect(button('create').disabled).toBe(false);
    } finally {
      await c.cleanup();
    }
  });

  test('the spell pane confirms a reviewed candidate directly and reads back the world Item', async () => {
    const created = new Map<string, WorldSpell>();
    let finishCreate!: () => void;
    const pending = new Promise<void>(resolve => { finishCreate = resolve; });
    let openCount = 0;
    class WorldSpell extends NativeDocumentFixture {
      id: string;
      uuid: string;
      delete() { created.delete(this.id); return Promise.resolve(); }
      sheet = { render: () => openCount++ };
      constructor(data: any) {
        super(data);
        this.id = data._id;
        this.uuid = 'Item.' + this.id;
      }
      static async create(data: any) {
        await pending;
        const saved = structuredClone(data);
        saved._stats.systemVersion = '6.0.6+local.3';
        saved.system.uses = { spent: 0, max: undefined, recovery: [] };
        for (const activity of Object.values<any>(saved.system.activities)) {
          activity.uses = { spent: 0, max: undefined, recovery: [] };
        }
        const item = new WorldSpell(saved);
        created.set(item.id, item);
        return item;
      }
    }
    const c = await makeWorkspace({ directoryKind: 'Item', initialMode: 'spell',
      game: { version: '14.370', system: { id: 'dnd5e', version: '6.0.6+local.3' },
        user: { id: 'gm', isGM: true }, world: { id: 'fixture-world' },
        folders: fakeWorldFolders(),
        items: { documentClass: WorldSpell, get: (id: string) => created.get(id) } },
    });
    try {
      const root = c.root.querySelector<HTMLElement>('[data-forge-pane="spell"]')!;
      const button = (action: string) => root.querySelector<HTMLButtonElement>('[data-spell-' + action + ']')!;
      expect(button('create').disabled).toBe(true);
      const draft = root.querySelector<HTMLTextAreaElement>('[data-spell-source]')!;
      draft.value = readFileSync('tests/fixtures/forge-spells/fireball.md', 'utf8');
      draft.dispatchEvent(new root.ownerDocument.defaultView!.Event('input'));
      button('generate').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(button('create').disabled).toBe(false);
      expect(created.size).toBe(0);
      button('create').click();
      expect(draft.disabled).toBe(true);
      expect(c.app.selectMode('structured')).toBe(false);
      finishCreate();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(created.size).toBe(1);
      const spell = [...created.values()][0]!;
      expect(spell.toObject()).toMatchObject({
        name: '火球术 Fireball', type: 'spell', system: { target: { template: { size: '20' } } },
      });
      expect(root.querySelector('[data-spell-status]')!.textContent).toBe('法术已创建。');
      button('open').click();
      expect(openCount).toBe(1);
      expect(button('create').disabled).toBe(true);
    } finally {
      finishCreate();
      await c.cleanup();
    }
  });

  test('shows a direct setup action in both workspaces and updates it when the shared connection is verified or loses its key', async () => {
    saveForgeSessionSettings({ model: '', apiKey: '' });
    let opened = 0;
    const actor = await makeWorkspace({ initialMode: 'structured', openConnectionSettings: () => opened++ });
    const item = await makeWorkspace({ directoryKind: 'Item', initialMode: 'ai', openConnectionSettings: () => opened++ });
    try {
      const notice = (workspace: typeof actor) => workspace.root.querySelector<HTMLElement>('[data-workspace-connection-notice]')!;
      expect(notice(actor).hidden).toBe(true);
      actor.app.selectMode('ai');
      for (const workspace of [actor, item]) {
        expect(notice(workspace).hidden).toBe(false);
        notice(workspace).querySelector('button')!.click();
      }
      expect(opened).toBe(2);
      expect(actor.intake().hidden).toBe(false);
      saveForgeSessionSettings({ model: 'fresh-provider-id', apiKey: 'fixture-key' });
      expect(notice(item).textContent).toContain('测试当前配置');
      markForgeSessionConnectionTested();
      expect(notice(item).hidden).toBe(true);
      expect(notice(actor).hidden).toBe(true);
      expect(actor.root.querySelector('[data-workspace-connection-summary]')!.textContent).toBe('AI 已连接');
      clearAllForgeSessionApiKeys();
      expect(notice(actor).hidden).toBe(false);
      expect(notice(actor).textContent).toContain('重新输入 API Key');
    } finally {
      saveForgeSessionSettings({ model: '', apiKey: '' });
      await item.cleanup();
      await actor.cleanup();
    }
  });

  test('actor source limits: the actual file input reads and formally generates an Actor source larger than 200KB',async()=>{
    const biography='Long source biography remains available. '.repeat(6000);
    const largeSource=source.replace(/^(?:\uFEFF)?---\r?\n/u,'---\n传记: '+JSON.stringify(biography)+'\n');
    const bytes=new TextEncoder().encode(largeSource).byteLength;expect(bytes).toBeGreaterThan(200_000);
    let reads=0,aiCalls=0;
    const c=await makeWorkspace({initialMode:'structured',actor:{services:{convertRawActorSourceWithAi:(async()=>{aiCalls++;throw Error('Standard source must remain local.');}) as any}}});
    try{
      c.edit(c.formal(),'source',source);await c.formalController().generate(c.formal());
      const original=structuredClone(c.formalController().response.result.artifact);
      const input=c.formal().querySelector<HTMLInputElement>('[name="sourceFile"]')!;
      Object.defineProperty(input,'files',{value:[{name:'large-actor-source.md',type:'text/markdown',size:bytes,text:async()=>{reads++;return largeSource;}}],configurable:true});
      input.dispatchEvent(new input.ownerDocument.defaultView!.Event('change',{bubbles:true}));
      for(let count=0;count<100&&c.formalController().readingFile;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(reads).toBe(1);expect(c.value(c.formal(),'source')).toBe(largeSource);
      c.button(c.formal(),'generate').click();
      for(let count=0;count<100&&c.formalController().controller;count++)await new Promise(resolve=>setTimeout(resolve,0));
      const actor=c.formalController().response.result.artifact;
      expect(actor.system.attributes.hp).toEqual(original.system.attributes.hp);expect(actor.items).toEqual(original.items);
      expect(actor.system.details.biography.value).toContain(biography.trim());expect(aiCalls).toBe(0);
      expect(c.notifications).toEqual([]);
    }finally{await c.cleanup();}
  });
  test('actor source limits: adding, generating and reloading more than eight blueprint components keeps every ability',async()=>{
    const c=await makeWorkspace({initialMode:'blueprint'});
    try{
      c.edit(c.formal(),'displayName','Many abilities');
      const initial=c.formalController().blueprintDraft.components.length;
      for(let count=0;count<9;count++)c.button(c.formal(),'blueprint-add-attack').click();
      const total=initial+9;expect(c.formalController().blueprintDraft.components).toHaveLength(total);
      const rows=c.formal().querySelectorAll<HTMLElement>('[data-blueprint-component]');expect(rows).toHaveLength(total);
      const names=Array.from({length:total},(_,index)=>index===total-1?'Long ability name '.repeat(40).trim():`Attack ${index+1}`);
      rows.forEach((row,index)=>{
        for(const[field,value]of Object.entries({name:names[index]!,attackBonus:'5',range:'5',damageFormula:'1d6+2',damageType:'slashing'})){
          const input=row.querySelector<HTMLInputElement>(`[data-blueprint-field="${field}"]`)!;
          if(field==='name')expect(input.hasAttribute('maxlength')).toBe(false);
          input.value=value;input.dispatchEvent(new input.ownerDocument.defaultView!.Event('input',{bubbles:true}));
        }
      });
      c.button(c.formal(),'generate').click();
      for(let count=0;count<100&&c.formalController().controller;count++)await new Promise(resolve=>setTimeout(resolve,0));
      const actor=c.formalController().response.result.artifact;
      expect(actor.items.map((item:any)=>item.name)).toEqual(names);
      c.button(c.formal(),'blueprint-library-save').click();
      for(let count=0;count<100&&c.formalController().blueprintLibraryMutation;count++)await new Promise(resolve=>setTimeout(resolve,0));
      const saved=c.formalController().blueprintLibraryState.sources[0];expect(saved).toBeDefined();
      c.button(c.formal(),'clear').click();
      const select=c.formal().querySelector<HTMLSelectElement>('[name="blueprintLibrarySelect"]')!;
      select.value=saved.id;select.dispatchEvent(new select.ownerDocument.defaultView!.Event('change',{bubbles:true}));
      c.button(c.formal(),'blueprint-library-load').click();
      for(let count=0;count<100&&c.formalController().blueprintDraft.components.length!==total;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(c.formalController().blueprintDraft.components).toHaveLength(total);expect(c.formalController().blueprintSource).toBe(saved.rawSource);
      expect(c.notifications).toEqual([]);
    }finally{await c.cleanup();}
  },20_000);
  test('actor text answer: the actual batch button generates a complete text answer with local warnings without correction requests',async()=>{
    const queue=new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore()),store=new MemoryIntakeCandidateStore();
    const rawInput='A single creature source for a batch entry.';
    const plain=splitCollection(readFileSync('tests/fixtures/plaintext/月蚀矿腐化生物数据.md','utf8'))[0]!.quote;
    const answer='Here is the complete creature.\n\n'+plain;
    const calls={discovery:0,extraction:0,review:0,repair:0};
    const provider={providerName:'frozen-warning-text',extractionModel:'fixed',reviewModel:'disabled',
      discover:async()=>{calls.discovery++;return{schemaVersion:1,candidates:[{id:'one',label:'Batch text',start:0,end:rawInput.length,quote:rawInput}]};},
      extract:async()=>{throw Error('The complete text answer must not be replaced by an IR request.');},
      extractAnswer:async()=>{calls.extraction++;return{kind:'source-text' as const,sourceText:answer};},
      review:async()=>{calls.review++;throw Error('No review request is allowed.');},
      repair:async()=>{calls.repair++;throw Error('No correction request is allowed.');}};
    await queue.importCollection(createForgeBatchCollection({label:'Warning text batch',entries:[
      {objectKind:'actor',mode:'ai-monster',sourceLabel:'Batch text',rawSource:rawInput}]}));
    saveForgeSessionSettings({providerId:'custom',endpoint:'https://provider.example/v1',protocol:'openai-chat',model:'fixed',apiKey:'fixture-key'});
    markForgeSessionConnectionTested();
    const c=await makeWorkspace({initialMode:'ai',intake:{batchQueue:queue,candidateStore:store,services:{createBrowserAiProvider:(()=>provider) as any}}});
    try{
      const batch = c.root.querySelector<HTMLButtonElement>('[data-workspace-batch]')!;
      batch.click();
      expect(batch.getAttribute('aria-pressed')).toBe('true');
      const run=c.button(c.intake(),'batch-run');expect(run.disabled).toBe(false);run.click();
      for(let count=0;count<100&&c.intakeController().batchRunning;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(c.intakeController().batchRunning).toBe(false);
      const job=(await queue.load()).jobs[0]!,current=c.intakeController().batchResponses.get(job.id);
      expect(current,JSON.stringify(c.notifications)).toBeDefined();
      expect(current.candidate.analysis.ir).toBeUndefined();expect(current.candidate.analysis.status).toBe('needs_review');
      expect(current.candidate.analysis.canonicalSource).toBeTruthy();expect(current.candidate.analysis.sourceText).toBe(answer);
      expect(current.candidate.findings).toContainEqual(expect.objectContaining({code:'PLAINTEXT_SOURCE_COVERAGE_GAP'}));
      expect(current.candidate.candidateAvailable).toBe(true);expect(current.candidate.candidateResponse.result.artifact.items.length).toBeGreaterThan(0);
      expect(job.status).toBe('ready_for_gm_review');expect(job.latestReview?.sourceText).toBe(answer);
      const saved = (await store.load())[job.id]!;
      if (saved.mode === 'plaintext-actor') throw Error('Expected an AI batch candidate');
      expect(saved.candidate.candidateResponse).toEqual(current.candidate.candidateResponse);
      const batchQueue = c.intake().querySelector<HTMLElement>('[data-batch-queue]')!;
      const view = c.intake().querySelector<HTMLButtonElement>('[data-batch-open-job]')!;
      batchQueue.scrollTop = 34;
      view.click();
      expect(batchQueue.hidden).toBe(true);
      expect(c.intake().querySelector('[data-batch-reader] [data-reader-document="en"]')?.textContent?.trim()).toBe(rawInput);
      expect(c.intake().querySelector('[data-batch-reader] .forge-statblock')).toBeDefined();
      c.button(c.intake(),'batch-select-review').click();
      c.button(c.intake(),'batch-return').click();
      expect(batchQueue.hidden).toBe(false);
      expect(batchQueue.scrollTop).toBe(34);
      expect(c.intake().querySelector<HTMLInputElement>('[data-batch-select-job]')?.checked).toBe(false);
      expect(c.button(c.intake(),'batch-apply').disabled).toBe(true);
      expect(calls).toEqual({discovery:1,extraction:1,review:0,repair:0});expect(c.notifications).toEqual([]);
    }finally{await c.cleanup();queue.close();}
  });
  test('actor text answer: the same AI workspace generates, downloads and restores a complete Markdown answer without a fabricated IR',async()=>{
    const store=new MemoryIntakeCandidateStore(),downloads:string[]=[],rawInput='Original user source awaiting AI formatting.';
    let answers=0,factories=0;
    const forbidden=async()=>{throw Error('A complete Markdown answer must not trigger another model stage.');};
    const provider={providerName:'frozen-full-markdown',extractionModel:'fixed',reviewModel:'disabled',
      discover:forbidden,extract:forbidden,extractAnswer:async()=>{answers++;return{kind:'source-text' as const,sourceText:source};},
      review:forbidden,repair:forbidden};
    saveForgeSessionSettings({providerId:'custom',endpoint:'https://provider.example/v1',protocol:'openai-chat',model:'fixed',apiKey:'fixture-key'});
    markForgeSessionConnectionTested();
    const first=await makeWorkspace({initialMode:'ai',intake:{candidateStore:store,services:{
      createBrowserAiProvider:(()=>{factories++;return provider;}) as any,downloadReviewBundle:(_name,content)=>downloads.push(content),
    }}});
    let savedArtifact:any;
    try{
      first.edit(first.intake(),'source',rawInput);first.edit(first.intake(),'displayName','Text answer');
      await first.intakeController().analyze(first.intake());
      expect(first.intakeController().analysis.ir).toBeUndefined();expect(first.intakeController().analysis.sourceText).toBe(source);
      expect(first.intakeController().analysis.canonicalSource).toBe(source);expect(first.button(first.intake(),'generate').disabled).toBe(false);
      first.button(first.intake(),'generate').click();
      for(let count=0;count<50&&first.intakeController().controller;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(first.intakeController().generation.candidateAvailable).toBe(true);
      savedArtifact=structuredClone(first.intakeController().generation.candidateResponse.result.artifact);
      expect(savedArtifact.items.length).toBeGreaterThan(0);
      expect(first.intake().querySelector('[data-raw-source]')!.textContent).toBe(rawInput);
      const reader = first.intake().querySelector<HTMLElement>('[data-preview-section]')!;
      expect(reader.hidden).toBe(false);
      expect(reader.querySelector('.forge-statblock')).not.toBeNull();
      const english = reader.querySelector<HTMLButtonElement>('[data-reader-language="en"]')!;
      english.click();
      expect(reader.querySelector<HTMLElement>('[data-reader-document="en"]')?.hidden).toBe(false);
      expect(reader.querySelector('[data-reader-document="en"]')?.textContent?.trim()).toBe(rawInput);
      expect(reader.querySelector('[data-reader-jump="actions"]')).not.toBeNull();
      expect(first.intake().querySelector('[data-evidence]')).toBeNull();
      first.button(first.intake(),'download-actor').click();expect(JSON.parse(downloads[0]!)).toEqual(savedArtifact);
      expect(first.button(first.intake(),'repair').disabled).toBe(true);await first.intakeController().repair(first.intake());
      expect({answers,factories}).toEqual({answers:1,factories:1});
      const record=(await store.load()).single!;
      expect((record.candidate.analysis as any).ir).toBeUndefined();expect((record.candidate.analysis as any).sourceText).toBe(source);
      expect((record.bundle as any).sourceText).toBe(source);
      expect(record.input.source).toBe(rawInput);
    }finally{await first.cleanup();}
    saveForgeSessionSettings({apiKey:'',persistApiKey:false});
    const second=await makeWorkspace({initialMode:'ai',intake:{candidateStore:store,services:{
      createBrowserAiProvider:(()=>{throw Error('Text candidate restore constructed a provider.');}) as any,
      downloadReviewBundle:(_name,content)=>downloads.push(content),
    }}});
    try{
      second.button(second.intake(),'restore-candidate').click();
      for(let count=0;count<50&&second.intakeController().recoveryBusy;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(second.intakeController().generation.analysis.ir).toBeUndefined();expect(second.intakeController().generation.analysis.sourceText).toBe(source);
      expect(second.intakeController().generation.candidateResponse.result.artifact).toEqual(savedArtifact);
      second.button(second.intake(),'download-actor').click();expect(JSON.parse(downloads[1]!)).toEqual(savedArtifact);
      expect(second.button(second.intake(),'generate').disabled).toBe(false);second.button(second.intake(),'generate').click();
      for(let count=0;count<50&&second.intakeController().controller;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(second.intakeController().generation.candidateResponse.result.artifact).toEqual(savedArtifact);
      expect({answers,factories}).toEqual({answers:1,factories:1});
    }finally{await second.cleanup();}
  });
  test('actor read access: saved Actor restore and download work after runtime and GM changes, while create still checks the world',async()=>{
    const store=new MemoryIntakeCandidateStore(),downloads:string[]=[];
    let modelCalls=0;
    const forbidden=async()=>{throw Error('Reading a saved Actor must not request a model.');};
    const provider={providerName:'frozen-read-access',extractionModel:'fixed',reviewModel:'disabled',
      discover:forbidden,extract:async()=>{modelCalls++;return buildValidLurkerIr();},review:forbidden,repair:forbidden};
    saveForgeSessionSettings({providerId:'custom',endpoint:'https://provider.example/v1',protocol:'openai-chat',model:'fixed',apiKey:'fixture-key'});
    markForgeSessionConnectionTested();
    const first=await makeWorkspace({initialMode:'ai',intake:{candidateStore:store,services:{createBrowserAiProvider:(()=>provider) as any}}});
    try{
      first.edit(first.intake(),'source',LURKER_SOURCE);
      await first.intakeController().analyze(first.intake());await first.intakeController().generate(first.intake());
      expect((await store.load()).single).toBeDefined();
    }finally{await first.cleanup();}
    const record=(await store.load()).single!,before=JSON.stringify(record);
    const game={version:'14.999',system:{id:'dnd5e',version:'6.5.0'},user:{id:'gm',isGM:false},world:{id:'fixture-world'}};
    const second=await makeWorkspace({game,initialMode:'ai',intake:{candidateStore:store,services:{
      createBrowserAiProvider:(()=>{throw Error('Recovery constructed a network provider.');}) as any,
      downloadReviewBundle:(_name,content)=>downloads.push(content),
    }}});
    try{
      expect(second.app.selectMode('structured')).toBe(true);expect(second.app.selectMode('ai')).toBe(true);
      const restore=second.button(second.intake(),'restore-candidate');expect(restore.disabled).toBe(false);restore.click();
      for(let count=0;count<50&&second.intakeController().recoveryBusy;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(second.intakeController().generation.candidateResponse).toEqual(record.candidate.candidateResponse);
      expect(second.intakeController().snapshot.target.fvttVersion).toBe(record.input.fvttVersion);
      expect(second.button(second.intake(),'download-actor').disabled).toBe(false);
      second.button(second.intake(),'download-actor').click();
      expect(JSON.parse(downloads[0]!)).toEqual((record.candidate.candidateResponse as any).result.artifact);
      expect(second.button(second.intake(),'create').disabled).toBe(true);
      await second.intakeController().create(second.intake());expect(second.intakeController().createdDocument).toBeUndefined();
      game.user.isGM=true;game.version='14.370';game.system.version='6.0.6';second.intakeController().renderResult(second.intake());
      expect(second.button(second.intake(),'create').disabled).toBe(false);second.button(second.intake(),'create').click();
      for(let count=0;count<50&&second.intakeController().creating;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(second.notifications.some(message=>message.includes('response target'))).toBe(true);
      expect(second.intakeController().createdDocument).toBeUndefined();expect(modelCalls).toBe(1);
      expect(JSON.stringify((await store.load()).single)).toBe(before);
    }finally{await second.cleanup();}
  });
  test('actor read access: Item workspace keeps its existing GM and runtime checks',async()=>{
    const game={version:'14.999',system:{id:'dnd5e',version:'6.5.0'},user:{id:'gm',isGM:false},world:{id:'fixture-world'}};
    const c=await makeWorkspace({game,directoryKind:'Item'});
    try{expect(c.app.selectMode('ai')).toBe(false);expect(c.formal().hidden).toBe(false);}
    finally{await c.cleanup();}
  });
  test('normal shared key clearing preserves local GM creation in both Actor and Item AI panes [review disabled]', async () => {
    for (const kind of ['Actor', 'Item'] as const) {
      saveForgeSessionSettings({ providerId: 'custom', endpoint: 'https://provider.example/v1', protocol: 'openai-chat',
        model: 'extract', apiKey: 'session-key', persistApiKey: false });
      markForgeSessionConnectionTested();
      const raw = `${kind} shared connection source`;
      const analysis = { status: 'ready_to_generate', attemptId: 'workspace-test', rawSourceHash: hashSource(raw),
        candidates: [{ id: 'one', label: kind, start: 0, end: raw.length, quote: raw }],
        candidate: { id: 'one', label: kind, start: 0, end: raw.length, quote: raw },
        ir: { source: { sha256: hashSource(raw), length: raw.length }, claims: [], coverage: [], uncertainties: [] },
        validation: { findings: [], blocking: [], warnings: [] }, findings: [], stages: [],
        provider: { providerName: 'fixture', extractionModel: 'extract', reviewModel: 'extract', promptVersions: { discover: 'd', extract: 'e', review: 'v', repair: 'r' } },
        calls: { discovery: 1, extraction: 1, review: 0, repair: 0 }, repairCount: 0 };
      let candidateResponse: any;
      let providerCalls = 0, reviews = 0, approvals = 0, creates = 0, probes = 0;
      let finishItemCreate!: () => void;
      const c = await makeWorkspace({ directoryKind: kind, intake: { services: {
        createBrowserAiProvider: (() => { providerCalls++; return {}; }) as any,
        createBrowserItemAiProvider: (() => { providerCalls++; return {}; }) as any,
        testForgeProviderConnection: (async () => { probes++; throw new Error('Unexpected probe.'); }) as any,
        analyzeBrowserActorSourceWithAi: (async () => analysis) as any,
        analyzeBrowserItemSourceWithAi: (async () => analysis) as any,
        generateBrowserActorIntakeCandidate: (async () => ({ status: 'ready_for_gm_review', analysis, rawSourceHash: hashSource(raw),
          finalSource: source, finalSourceHash: candidateResponse.result.sourceIdentity.sourceHash,
          candidateResponse, formalStatus: 'accepted', modelReviewStatus: 'not_requested',
          deterministicFindings: [], findings: [], stages: [], provider: analysis.provider, calls: analysis.calls })) as any,
        generateBrowserItemIntakeCandidate: (async () => ({ status: 'ready_for_gm_review', analysis, rawSourceHash: hashSource(raw),
          finalSource: itemSource, finalSourceHash: candidateResponse.result.sourceIdentity.sourceHash,
          candidateResponse, formalStatus: 'accepted', modelReviewStatus: 'not_requested',
          deterministicFindings: [], findings: [], stages: [], provider: analysis.provider, calls: analysis.calls })) as any,
        reviewBrowserActorIntakeCandidate: (async () => { reviews++; throw new Error('Unexpected paid review.'); }) as any,
        reviewBrowserItemIntakeCandidate: (async () => { reviews++; throw new Error('Unexpected paid review.'); }) as any,
        approveBrowserActorIntakeCandidateForGm: ((_input: any, current: any) => { approvals++; return { ...current, status: 'accepted', response: candidateResponse }; }) as any,
        approveBrowserItemIntakeCandidateForGm: ((_input: any, current: any) => { approvals++; return { ...current, status: 'accepted', response: candidateResponse }; }) as any,
        createAcceptedForgeActor: (async () => { creates++; return { status: 'created', uuid: 'Actor.test', actor: {} } as any; }) as any,
        createAcceptedForgeItem: (async () => { creates++; return await new Promise(resolve => {
          finishItemCreate = () => resolve({ status: 'created', uuid: 'Item.test', item: {} });
        }); }) as any,
      } } });
      try {
        c.app.selectMode('structured'); c.edit(c.formal(), 'source', kind === 'Actor' ? source : itemSource);
        await c.formalController().generate(c.formal());
        candidateResponse = c.formalController().response;
        expect(candidateResponse.result.status).toBe('accepted');
        saveForgeSessionSettings({ apiKey: '', persistApiKey: false });
        expect(c.formalController().response).toBe(candidateResponse);
        expect(c.button(c.formal(), 'create').disabled).toBe(false);
        saveForgeSessionSettings({ apiKey: 'session-key' }); markForgeSessionConnectionTested();
        c.app.selectMode('ai'); c.edit(c.intake(), 'source', raw); c.edit(c.intake(), 'displayName', kind);
        await c.intakeController().analyze(c.intake());
        await c.intakeController().generate(c.intake());
        expect(c.intakeController().status).toBe('ready_for_gm_review');
        const beforeClear = providerCalls;
        if (kind === 'Actor') saveForgeSessionSettings({ apiKey: '', persistApiKey: false });
        else clearAllForgeSessionApiKeys();
        expect(c.intakeController().status).toBe('ready_for_gm_review');
        expect(c.button(c.intake(), 'create').disabled).toBe(false);
        expect(c.intake().querySelector('[data-action="model-review"]')).toBeNull();
        saveForgeSessionSettings({ apiKey: 'session-key' }); markForgeSessionConnectionTested();
        await c.intakeController().reviewCandidate(c.intake());
        if (kind === 'Item') {
          const creating = c.intakeController().create(c.intake());
          expect(creates).toBe(1);
          clearAllForgeSessionApiKeys();
          expect(c.intakeController().status).toBe('committing_and_reading_back');
          finishItemCreate();
          await creating;
        } else await c.intakeController().create(c.intake());
        expect({ providerCalls, beforeClear, reviews, approvals, creates, probes }).toEqual({
          providerCalls: beforeClear, beforeClear, reviews: 0, approvals: kind==='Item'?1:0, creates: 1, probes: 0,
        });
      } finally { await c.cleanup(); }
    }
  });
  test.each(['blueprint', 'structured', 'ai'] as const)('opens the guide without changing %s drafts or source state', async mode => {
    let guideOpens = 0;
    const c = await makeWorkspace({ openGuide: () => { guideOpens++; } });
    try {
      c.app.selectMode(mode);
      c.edit(c.formal(), 'source', '保留正式来源');
      c.edit(c.intake(), 'source', '保留原始资料');
      const formalBefore = c.value(c.formal(), 'source'), intakeBefore = c.value(c.intake(), 'source');
      c.root.querySelector<HTMLButtonElement>('[data-workspace-guide]')!.click();
      expect(guideOpens).toBe(1);
      expect(c.root.querySelector('[data-forge-mode="' + mode + '"]')?.getAttribute('aria-pressed')).toBe('true');
      expect(c.value(c.formal(), 'source')).toBe(formalBefore);
      expect(c.value(c.intake(), 'source')).toBe(intakeBefore);
      expect(c.nativeWindows()).toBe(1);
    } finally { await c.cleanup(); }
  });

  test('a missing guide handler reports the unavailable entry without changing the source', async () => {
    const c = await makeWorkspace();
    try {
      c.edit(c.formal(), 'source', '已有来源');
      c.root.querySelector<HTMLButtonElement>('[data-workspace-guide]')!.click();
      expect(c.notifications).toContain('图解手册入口尚未就绪。');
      expect(c.value(c.formal(), 'source')).toBe('已有来源');
    } finally { await c.cleanup(); }
  });

  test('uses one native application and preserves independent blueprint, source and AI drafts', async () => {
    const c = await makeWorkspace();
    try {
      expect(c.nativeWindows()).toBe(1);
      expect(c.formal().hidden).toBe(false);
      expect(c.intake().hidden).toBe(true);
      const tabs = [...c.formal().querySelectorAll<HTMLButtonElement>('[data-blueprint-tab]')];
      expect(tabs.map(tab => tab.textContent?.trim())).toEqual(['基础', '能力', '变体']);
      expect(c.formal().querySelector('[data-blueprint-source]')).toBeNull();
      expect(c.button(c.formal(), 'blueprint-download').disabled).toBe(false);
      tabs[0]!.dispatchEvent(new tabs[0]!.ownerDocument.defaultView!.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      expect(tabs[2]!.getAttribute('aria-selected')).toBe('true');
      c.edit(c.formal(), 'displayName', '手写蓝图');
      c.edit(c.formal(), 'blueprintHitPoints', '42');
      let downloadName = '';
      let downloadedSource: Promise<string> | undefined;
      const prototype = c.formal().ownerDocument.defaultView!.HTMLAnchorElement.prototype;
      const downloadClick = spyOn(prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        downloadName = this.download;
        downloadedSource = fetch(this.href).then(response => response.text());
      });
      try {
        c.button(c.formal(), 'blueprint-download').click();
        expect(downloadName).toBe('手写蓝图.md');
        expect(downloadedSource).toBeDefined();
        expect(parseCreatureBlueprintSource((await downloadedSource)!)).toMatchObject({ name: '手写蓝图', hp: 42 });
      } finally {
        downloadClick.mockRestore();
      }
      c.app.selectMode('structured');
      c.edit(c.formal(), 'source', source);
      c.edit(c.formal(), 'displayName', '标准资料');
      c.app.selectMode('ai');
      c.edit(c.intake(), 'source', '复杂的施法与传奇说明，保留原文');
      c.edit(c.intake(), 'displayName', 'AI 草稿');
      c.app.selectMode('blueprint');
      expect(c.value(c.formal(), 'displayName')).toBe('手写蓝图');
      expect(c.value(c.formal(), 'blueprintHitPoints')).toBe('42');
      c.app.selectMode('structured');
      expect(c.value(c.formal(), 'source')).toBe(source);
      expect(c.value(c.formal(), 'displayName')).toBe('标准资料');
      c.app.selectMode('ai');
      expect(c.value(c.intake(), 'source')).toContain('复杂的施法与传奇说明');
      expect(c.nativeWindows()).toBe(1);
    } finally { await c.cleanup(); }
  });

  test('retains a generated Actor across source edits and mode switches', async () => {
    let creates = 0;
    const c = await makeWorkspace({ actor: { services: { createAcceptedForgeActor: async () => {
      creates++; return { status: 'created', uuid: 'Actor.test' } as any;
    } } } });
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      await c.formalController().generate(c.formal());
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      const input = c.formal().querySelector('[name="source"]') as HTMLTextAreaElement;
      input.value += '\n# additional source';
      await c.formalController().create();
      expect(creates).toBe(1);
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      c.edit(c.formal(), 'source', source); await c.formalController().generate(c.formal());
      c.app.selectMode('ai'); c.app.selectMode('structured');
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      expect(c.value(c.formal(), 'source')).toBe(source);
    } finally { await c.cleanup(); }
  });

  test('a suspended generation cannot restore its old accepted result', async () => {
    let resolve!: (value: any) => void;
    let request: any;
    const pending = new Promise<any>(r => { resolve = r; });
    const c = await makeWorkspace({ actor: { services: { convertFinalActorSource: async value => {
      request = value; return pending;
    } } } });
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      const generating = c.formalController().generate(c.formal());
      expect(request).toBeDefined();
      c.app.selectMode('ai');
      resolve(await convertFinalActorSource(request)); await generating;
      c.app.selectMode('structured');
      expect(c.formalController().response).toBeUndefined();
      expect(c.button(c.formal(), 'create').disabled).toBe(true);
    } finally { await c.cleanup(); }
  });

  test('locks switching and close through the world commit and readback interval', async () => {
    let resolve!: (value: any) => void;
    const pending = new Promise<any>(r => { resolve = r; });
    const c = await makeWorkspace({ actor: { services: { createAcceptedForgeActor: () => pending } } });
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      await c.formalController().generate(c.formal());
      const creating = c.formalController().create();
      await c.render();
      expect(c.app.selectMode('ai')).toBe(false);
      expect(c.root.querySelector<HTMLButtonElement>('[data-forge-mode="ai"]')!.disabled).toBe(true);
      await c.app.close(); expect(c.closed()).toBe(0);
      resolve({ status: 'created', uuid: 'Actor.test', actor: { sheet: { render() {} } } });
      await creating;
      expect(c.root.querySelector('[data-workspace-stage]')).toBeNull();
      expect(c.button(c.formal(), 'open-created').disabled).toBe(false);
      expect(c.app.selectMode('ai')).toBe(true);
    } finally { await c.cleanup(); }
  });

  test('rerender keeps drafts and connection invalidation reaches the new DOM without adding hooks', async () => {
    const c = await makeWorkspace();
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      c.edit(c.formal(), 'displayName', '重绘来源');
      await c.formalController().generate(c.formal());
      const hookCount = c.hooks.size;
      await c.render();
      expect(c.hooks.size).toBe(hookCount);
      expect(c.value(c.formal(), 'source')).toBe(source);
      expect(c.value(c.formal(), 'displayName')).toBe('重绘来源');
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      saveForgeSessionSettings({ model: 'different-test-model' });
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
    } finally { await c.cleanup(); }
    expect(c.hooks.size).toBe(0);
  });

  test('rerender preserves the selected records view, search and current source draft', async () => {
    const c = await makeWorkspace();
    try {
      c.app.selectMode('ai');
      c.edit(c.intake(), 'source', 'current source draft');
      c.button(c.intake(), 'view-saved').click();
      const search = c.intake().querySelector<HTMLInputElement>('[name="sourceLibrarySearch"]')!;
      search.value = '守卫';
      search.dispatchEvent(new search.ownerDocument.defaultView!.Event('input', {bubbles:true}));
      const context = await c.app._preparePartContext('actorIntake', await c.app._prepareContext(), {});
      expect(context.recordsView).toBe('saved');
      expect(context.showRecordsSaved).toBe(true);
      await c.render();
      expect(c.intake().dataset.libraryView).toBe('saved');
      expect(c.intake().querySelector<HTMLElement>('[data-library-panel="saved"]')?.hidden).toBe(false);
      expect(c.value(c.intake(), 'sourceLibrarySearch')).toBe('守卫');
      expect(c.value(c.intake(), 'source')).toBe('current source draft');
      await c.library.saveSource({
        objectKind: 'actor', mode: 'plaintext-actor', sourceLabel: '守卫',
        rawSource: '---\nlayout: creature\n---\n\n守卫佩戴盾牌。',
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      const row = c.intake().querySelector<HTMLButtonElement>('[data-library-open-source]')!;
      row.click();
      const reader = c.intake().querySelector<HTMLElement>('[data-library-reader]')!;
      expect(reader.textContent).toContain('守卫佩戴盾牌。');
      expect(reader.textContent).not.toContain('layout: creature');
      expect(reader.querySelector('[data-reader-column="preview"]')).toBeNull();
      expect(c.value(c.intake(), 'source')).toBe('current source draft');
      c.button(c.intake(), 'library-back').click();
      expect(c.value(c.intake(), 'sourceLibrarySearch')).toBe('守卫');
      expect(c.value(c.intake(), 'source')).toBe('current source draft');
    } finally { await c.cleanup(); }
  });

  test('one workspace switches object types without sharing their drafts or input methods', async () => {
    const c = await makeWorkspace({ directoryKind: 'Item' });
    try {
      const blueprint = c.root.querySelector<HTMLButtonElement>('[data-forge-mode="blueprint"]')!;
      expect(blueprint.hidden).toBe(true);
      expect(c.root.querySelector('[data-workspace-encounter]')).not.toBeNull();
      expect(c.app.selectMode('blueprint')).toBe(false);
      expect(c.value(c.intake(), 'mode')).toBe('ai-item');
      expect(c.app.selectMode('structured')).toBe(true);
      expect(c.intake().hidden).toBe(true);
      expect(c.formal().querySelector('[data-blueprint-editor]')).toBeNull();
      c.edit(c.formal(), 'source', 'item draft');
      c.root.querySelector<HTMLButtonElement>('[data-workspace-object="Actor"]')!.click();
      const actor = c.root.querySelector<HTMLElement>('[data-application-part="actor"]')!;
      expect(blueprint.hidden).toBe(false);
      expect(actor.hidden).toBe(false);
      expect(c.value(actor, 'source')).not.toBe('item draft');
      c.root.querySelector<HTMLButtonElement>('[data-workspace-library]')!.click();
      expect(actor.hidden).toBe(true);
      expect(c.root.querySelector<HTMLElement>('[data-application-part="actorIntake"]')!.dataset.libraryView).toBe('saved');
      expect(c.root.querySelector<HTMLElement>('[data-workspace-method]')!.hidden).toBe(true);
      c.root.querySelector<HTMLButtonElement>('[data-workspace-object="Item"]')!.click();
      expect(c.value(c.formal(), 'source')).toBe('item draft');
      expect(c.nativeWindows()).toBe(1);
    } finally { await c.cleanup(); }
  });

  test('opening an Item source from the library sends it to Item AI and preserves the Actor draft', async () => {
    const c = await makeWorkspace({ initialMode: 'ai' });
    try {
      c.edit(c.intake(), 'source', 'current actor draft');
      await c.library.saveSource({ objectKind: 'item', mode: 'ai-item', sourceLabel: '骑士之盾', rawSource: itemSource });
      const batch = c.root.querySelector<HTMLButtonElement>('[data-workspace-batch]')!;
      const library = c.root.querySelector<HTMLButtonElement>('[data-workspace-library]')!;
      batch.click();
      expect(c.intake().dataset.libraryView).toBe('batch');
      c.button(c.intake(), 'view-editor').click();
      expect(c.intake().dataset.libraryView).toBe('editor');
      expect(c.value(c.intake(), 'source')).toBe('current actor draft');
      batch.click();
      library.click();
      expect(batch.getAttribute('aria-pressed')).toBe('false');
      expect(library.getAttribute('aria-pressed')).toBe('true');
      await new Promise(resolve => setTimeout(resolve, 0));
      const open = c.intake().querySelector<HTMLButtonElement>('[data-library-open-source]');
      expect(open).not.toBeNull();
      open!.click();
      expect(c.intake().dataset.libraryView).toBe('saved');
      expect(c.intake().querySelector<HTMLElement>('[data-library-detail]')!.hidden).toBe(false);
      expect(c.value(c.intake(), 'source')).toBe('current actor draft');
      c.button(c.intake(), 'library-load-source').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const item = c.root.querySelector<HTMLElement>('[data-application-part="itemIntake"]')!;
      expect(item.hidden).toBe(false);
      expect(c.value(item, 'source')).toBe(itemSource.replace(/\r\n/gu, '\n'));
      expect(c.value(c.intake(), 'source')).toBe('current actor draft');
      expect(c.root.querySelector('[data-workspace-object="Item"]')?.getAttribute('aria-pressed')).toBe('true');
    } finally { await c.cleanup(); }
  });

  test('a file that finishes after rerender populates the current pane and survives another rerender', async () => {
    const c = await makeWorkspace();
    let resolve!: (text: string) => void;
    try {
      c.app.selectMode('structured');
      const file = { name: 'retained.md', type: 'text/markdown', size: 20, text: () => new Promise<string>(r => { resolve = r; }) };
      const reading = c.formalController().readSourceFile(c.formal(), { files: [file] });
      await c.render(); resolve(source); await reading;
      expect(c.value(c.formal(), 'source')).toBe(source);
      expect(c.value(c.formal(), 'displayName')).toBe('retained');
      await c.render();
      expect(c.value(c.formal(), 'source')).toBe(source);
      expect(c.value(c.formal(), 'displayName')).toBe('retained');
    } finally { await c.cleanup(); }
  });

  test('a generation that finishes after rerender updates the visible result and controls', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>(r => { resolve = r; });
    const c = await makeWorkspace({ actor: { services: { convertFinalActorSource: async request => {
      await pending; return convertFinalActorSource(request);
    } } } });
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      const generating = c.formalController().generate(c.formal());
      const previous = c.formal();
      await c.render(); expect(c.formal()).not.toBe(previous);
      resolve(); await generating;
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      expect(c.button(c.formal(), 'generate').disabled).toBe(false);
      expect(c.button(c.formal(), 'cancel').disabled).toBe(true);
      expect(c.formal().querySelector('[data-statblock] .forge-statblock')).toBeTruthy();
    } finally { await c.cleanup(); }
  });

  test('Intake remount restores its session binding and a pending file writes the current source', async () => {
    const c = await makeWorkspace();
    let resolve!: (text: string) => void;
    try {
      c.app.selectMode('ai');
      saveForgeSessionSettings({ model: 'fixture-intake-model' });
      const file = { name: 'intake.txt', type: 'text/plain', size: 30, text: () => new Promise<string>(r => { resolve = r; }) };
      const reading = c.intakeController().readSourceFile(c.intake(), { files: [file] });
      await c.render();
      expect((c.intake() as any).__forgeSessionSettings.model).toBe('fixture-intake-model');
      resolve('保留复杂能力的原文'); await reading;
      expect(c.value(c.intake(), 'source')).toBe('保留复杂能力的原文');
      expect(c.value(c.intake(), 'displayName')).toBe('intake');
    } finally { await c.cleanup(); }
  });
});

async function makeWorkspace(overrides: Partial<ForgeWorkspaceEnvironment> = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  const root = dom.window.document.createElement('div'); dom.window.document.body.append(root);
  const previousDocument = (globalThis as any).document;
  (globalThis as any).document = dom.window.document;
  let windows = 0, closes = 0;
  const hooks = new Map<number, (...args: any[]) => void>(); let nextHook = 0;
  const notifications: string[] = [];
  class Application {
    element = root;
    constructor(..._args: any[]) { windows++; }
    async close() { closes++; return this; }
  }
  const library = new ManagedForgeSourceLibrary(new MemoryForgeSourceLibraryStore());
  const batchQueue = new ManagedForgeBatchQueue(new MemoryForgeBatchQueueStore());
  const kind = overrides.directoryKind ?? 'Actor';
  const Class = createForgeWorkspaceApplicationClass({
    game: { version: '14.368', system: { id: 'dnd5e', version: '6.0.6' }, user: { id: 'gm', isGM: true }, world: { id: 'fixture-world' },
      actors:{documentClass:NativeDocumentFixture},items:{documentClass:NativeDocumentFixture} },
    ui: { notifications: { error: (text: string) => notifications.push(text), info() {} } },
    window: dom.window as any,
    hooks: { on: (_event, fn) => { hooks.set(++nextHook, fn); return nextHook; }, off: (_event, id) => { hooks.delete(id as number); } },
    foundry: { applications: { api: { ApplicationV2: Application, HandlebarsApplicationMixin: (Base: any) => Base } } },
    ...overrides,
    directoryKind: kind,
    actor: { sourceLibrary: library, ...overrides.actor },
    intake: { sourceLibrary: library, batchQueue, ...overrides.intake },
  });
  const app = new Class();
  const render = async () => {
    const context = await app._prepareContext();
    root.replaceChildren();
    for (const [part, name] of Object.entries({ navigation: 'workspace', actor: 'actor', item: 'item', actorIntake: 'intake', itemIntake: 'intake', spell: 'spell' })) {
      const partContext = await app._preparePartContext(part, context, {});
      const holder = dom.window.document.createElement('template');
      holder.innerHTML = template('forge-' + name, partContext);
      const element = holder.content.firstElementChild! as HTMLElement;
      element.dataset.applicationPart = part;
      root.append(element);
    }
    app._onRender(context, {});
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  await render();
  return { app, root, hooks, notifications, render, library,
    nativeWindows: () => windows, closed: () => closes,
    formal: () => root.querySelector<HTMLElement>(kind === 'Actor' ? '[data-application-part="actor"]' : '[data-application-part="item"]')!,
    intake: () => root.querySelector<HTMLElement>(kind === 'Actor' ? '[data-application-part="actorIntake"]' : '[data-application-part="itemIntake"]')!,
    formalController: () => kind === 'Actor' ? app.panes.actor : app.panes.item,
    intakeController: () => kind === 'Actor' ? app.panes.actorIntake : app.panes.itemIntake,
    value: (pane: HTMLElement, name: string) => (pane.querySelector(`[name="${name}"]`) as HTMLInputElement).value,
    button: (pane: HTMLElement, action: string) => pane.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!,
    edit: (pane: HTMLElement, name: string, value: string) => {
      const input = pane.querySelector(`[name="${name}"]`) as HTMLInputElement;
      input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    },
    cleanup: async () => { try { await app.close(); } finally { library.close(); batchQueue.close(); dom.window.close(); (globalThis as any).document = previousDocument; } },
  };
}
