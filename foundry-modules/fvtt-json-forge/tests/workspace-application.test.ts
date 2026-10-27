import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';
import { convertFinalActorSource } from '@fvtt-json-generator/forge-browser-runtime';
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
  test('actor source limits: the actual file input reads and formally generates an Actor source larger than 200KB',async()=>{
    const biography='Long source biography remains available. '.repeat(6000);
    const largeSource=source.replace(/^(?:\uFEFF)?---\r?\n/u,'---\n传记: '+JSON.stringify(biography)+'\n');
    const bytes=new TextEncoder().encode(largeSource).byteLength;expect(bytes).toBeGreaterThan(200_000);
    let reads=0,aiCalls=0;
    const c=await makeWorkspace({initialMode:'structured',actor:{services:{convertRawActorSourceWithAi:(async()=>{aiCalls++;throw Error('Standard source must remain local.');}) as any}}});
    try{
      c.edit(c.formal(),'source',source);await c.app.formal.generate(c.formal());
      const original=structuredClone(c.app.formal.response.result.artifact);
      const input=c.formal().querySelector<HTMLInputElement>('[name="sourceFile"]')!;
      Object.defineProperty(input,'files',{value:[{name:'large-actor-source.md',type:'text/markdown',size:bytes,text:async()=>{reads++;return largeSource;}}],configurable:true});
      input.dispatchEvent(new input.ownerDocument.defaultView!.Event('change',{bubbles:true}));
      for(let count=0;count<100&&c.app.formal.readingFile;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(reads).toBe(1);expect(c.value(c.formal(),'source')).toBe(largeSource);
      c.button(c.formal(),'generate').click();
      for(let count=0;count<100&&c.app.formal.controller;count++)await new Promise(resolve=>setTimeout(resolve,0));
      const actor=c.app.formal.response.result.artifact;
      expect(actor.system.attributes.hp).toEqual(original.system.attributes.hp);expect(actor.items).toEqual(original.items);
      expect(actor.system.details.biography.value).toContain(biography.trim());expect(aiCalls).toBe(0);
      expect(c.notifications).toEqual([]);
    }finally{await c.cleanup();}
  });
  test('actor source limits: adding, generating and reloading more than eight blueprint components keeps every ability',async()=>{
    const c=await makeWorkspace({initialMode:'blueprint'});
    try{
      c.edit(c.formal(),'displayName','Many abilities');
      const initial=c.app.formal.blueprintDraft.components.length;
      for(let count=0;count<9;count++)c.button(c.formal(),'blueprint-add-attack').click();
      const total=initial+9;expect(c.app.formal.blueprintDraft.components).toHaveLength(total);
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
      for(let count=0;count<100&&c.app.formal.controller;count++)await new Promise(resolve=>setTimeout(resolve,0));
      const actor=c.app.formal.response.result.artifact;
      expect(actor.items.map((item:any)=>item.name)).toEqual(names);
      c.button(c.formal(),'blueprint-library-save').click();
      for(let count=0;count<100&&c.app.formal.blueprintLibraryMutation;count++)await new Promise(resolve=>setTimeout(resolve,0));
      const saved=c.app.formal.blueprintLibraryState.sources[0];expect(saved).toBeDefined();
      c.button(c.formal(),'clear').click();
      const select=c.formal().querySelector<HTMLSelectElement>('[name="blueprintLibrarySelect"]')!;
      select.value=saved.id;select.dispatchEvent(new select.ownerDocument.defaultView!.Event('change',{bubbles:true}));
      c.button(c.formal(),'blueprint-library-load').click();
      for(let count=0;count<100&&c.app.formal.blueprintDraft.components.length!==total;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(c.app.formal.blueprintDraft.components).toHaveLength(total);expect(c.app.formal.blueprintSource).toBe(saved.rawSource);
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
      const run=c.button(c.intake(),'batch-run');expect(run.disabled).toBe(false);run.click();
      for(let count=0;count<100&&c.app.intake.batchRunning;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(c.app.intake.batchRunning).toBe(false);
      const job=(await queue.load()).jobs[0]!,current=c.app.intake.batchResponses.get(job.id);
      expect(current,JSON.stringify(c.notifications)).toBeDefined();
      expect(current.candidate.analysis.ir).toBeUndefined();expect(current.candidate.analysis.status).toBe('needs_review');
      expect(current.candidate.analysis.canonicalSource).toBeTruthy();expect(current.candidate.analysis.sourceText).toBe(answer);
      expect(current.candidate.findings).toContainEqual(expect.objectContaining({code:'PLAINTEXT_SOURCE_COVERAGE_GAP'}));
      expect(current.candidate.candidateAvailable).toBe(true);expect(current.candidate.candidateResponse.result.artifact.items.length).toBeGreaterThan(0);
      expect(job.status).toBe('ready_for_gm_review');expect(job.latestReview?.sourceText).toBe(answer);
      expect((await store.load())[job.id]!.candidate.candidateResponse).toEqual(current.candidate.candidateResponse);
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
      await first.app.intake.analyze(first.intake());
      expect(first.app.intake.analysis.ir).toBeUndefined();expect(first.app.intake.analysis.sourceText).toBe(source);
      expect(first.app.intake.analysis.canonicalSource).toBe(source);expect(first.button(first.intake(),'generate').disabled).toBe(false);
      first.button(first.intake(),'generate').click();
      for(let count=0;count<50&&first.app.intake.controller;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(first.app.intake.generation.candidateAvailable).toBe(true);
      savedArtifact=structuredClone(first.app.intake.generation.candidateResponse.result.artifact);
      expect(savedArtifact.items.length).toBeGreaterThan(0);
      expect(first.intake().querySelector('[data-raw-source]')!.textContent).toBe(rawInput);
      expect(first.intake().querySelector('[data-evidence]')!.textContent).toContain('sourceText');
      first.button(first.intake(),'download-actor').click();expect(JSON.parse(downloads[0]!)).toEqual(savedArtifact);
      expect(first.button(first.intake(),'repair').disabled).toBe(true);await first.app.intake.repair(first.intake());
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
      for(let count=0;count<50&&second.app.intake.recoveryBusy;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(second.app.intake.generation.analysis.ir).toBeUndefined();expect(second.app.intake.generation.analysis.sourceText).toBe(source);
      expect(second.app.intake.generation.candidateResponse.result.artifact).toEqual(savedArtifact);
      second.button(second.intake(),'download-actor').click();expect(JSON.parse(downloads[1]!)).toEqual(savedArtifact);
      expect(second.button(second.intake(),'generate').disabled).toBe(false);second.button(second.intake(),'generate').click();
      for(let count=0;count<50&&second.app.intake.controller;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(second.app.intake.generation.candidateResponse.result.artifact).toEqual(savedArtifact);
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
      await first.app.intake.analyze(first.intake());await first.app.intake.generate(first.intake());
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
      for(let count=0;count<50&&second.app.intake.recoveryBusy;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(second.app.intake.generation.candidateResponse).toEqual(record.candidate.candidateResponse);
      expect(second.app.intake.snapshot.target.fvttVersion).toBe(record.input.fvttVersion);
      expect(second.button(second.intake(),'download-actor').disabled).toBe(false);
      second.button(second.intake(),'download-actor').click();
      expect(JSON.parse(downloads[0]!)).toEqual((record.candidate.candidateResponse as any).result.artifact);
      expect(second.button(second.intake(),'create').disabled).toBe(true);
      await second.app.intake.create(second.intake());expect(second.app.intake.createdDocument).toBeUndefined();
      game.user.isGM=true;game.version='14.364';game.system.version='5.3.3';second.app.intake.renderResult(second.intake());
      expect(second.button(second.intake(),'create').disabled).toBe(false);second.button(second.intake(),'create').click();
      for(let count=0;count<50&&second.app.intake.creating;count++)await new Promise(resolve=>setTimeout(resolve,0));
      expect(second.notifications.some(message=>message.includes('response target'))).toBe(true);
      expect(second.app.intake.createdDocument).toBeUndefined();expect(modelCalls).toBe(1);
      expect(JSON.stringify((await store.load()).single)).toBe(before);
    }finally{await second.cleanup();}
  });
  test('actor read access: Item workspace keeps its existing GM and runtime checks',async()=>{
    const game={version:'14.999',system:{id:'dnd5e',version:'6.5.0'},user:{id:'gm',isGM:false},world:{id:'fixture-world'}};
    const c=await makeWorkspace({game,directoryKind:'Item'});
    try{expect(c.app.selectMode('structured')).toBe(false);expect(c.app.mode).toBe('ai');}
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
        await c.app.formal.generate(c.formal());
        candidateResponse = c.app.formal.response;
        expect(candidateResponse.result.status).toBe('accepted');
        saveForgeSessionSettings({ apiKey: '', persistApiKey: false });
        expect(c.app.formal.response).toBe(candidateResponse);
        expect(c.button(c.formal(), 'create').disabled).toBe(false);
        saveForgeSessionSettings({ apiKey: 'session-key' }); markForgeSessionConnectionTested();
        c.app.selectMode('ai'); c.edit(c.intake(), 'source', raw); c.edit(c.intake(), 'displayName', kind);
        await c.app.intake.analyze(c.intake());
        await c.app.intake.generate(c.intake());
        expect(c.app.intake.status).toBe('ready_for_gm_review');
        const beforeClear = providerCalls;
        if (kind === 'Actor') saveForgeSessionSettings({ apiKey: '', persistApiKey: false });
        else clearAllForgeSessionApiKeys();
        expect(c.app.intake.status).toBe('ready_for_gm_review');
        expect(c.button(c.intake(), 'create').disabled).toBe(false);
        expect(c.intake().querySelector('[data-action="model-review"]')).toBeNull();
        saveForgeSessionSettings({ apiKey: 'session-key' }); markForgeSessionConnectionTested();
        await c.app.intake.reviewCandidate(c.intake());
        if (kind === 'Item') {
          const creating = c.app.intake.create(c.intake());
          expect(creates).toBe(1);
          clearAllForgeSessionApiKeys();
          expect(c.app.intake.status).toBe('committing_and_reading_back');
          finishItemCreate();
          await creating;
        } else await c.app.intake.create(c.intake());
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
      expect(c.app.mode).toBe(mode);
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
      c.edit(c.formal(), 'displayName', '手写蓝图');
      c.edit(c.formal(), 'blueprintHitPoints', '42');
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
      await c.app.formal.generate(c.formal());
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      const input = c.formal().querySelector('[name="source"]') as HTMLTextAreaElement;
      input.value += '\n# additional source';
      await c.app.formal.create();
      expect(creates).toBe(1);
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      c.edit(c.formal(), 'source', source); await c.app.formal.generate(c.formal());
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
      const generating = c.app.formal.generate(c.formal());
      expect(request).toBeDefined();
      c.app.selectMode('ai');
      resolve(await convertFinalActorSource(request)); await generating;
      c.app.selectMode('structured');
      expect(c.app.formal.response).toBeUndefined();
      expect(c.button(c.formal(), 'create').disabled).toBe(true);
    } finally { await c.cleanup(); }
  });

  test('locks switching and close through the world commit and readback interval', async () => {
    let resolve!: (value: any) => void;
    const pending = new Promise<any>(r => { resolve = r; });
    const c = await makeWorkspace({ actor: { services: { createAcceptedForgeActor: () => pending } } });
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      await c.app.formal.generate(c.formal());
      const creating = c.app.formal.create();
      await c.render();
      expect(c.app.selectMode('ai')).toBe(false);
      expect(c.root.querySelector<HTMLButtonElement>('[data-forge-mode="ai"]')!.disabled).toBe(true);
      await c.app.close(); expect(c.closed()).toBe(0);
      resolve({ status: 'created', uuid: 'Actor.test', actor: { sheet: { render() {} } } });
      await creating;
      expect(c.root.querySelector('[data-workspace-stage="created"]')?.getAttribute('aria-current')).toBe('step');
      expect(c.button(c.formal(), 'open-created').disabled).toBe(false);
      expect(c.app.selectMode('ai')).toBe(true);
    } finally { await c.cleanup(); }
  });

  test('rerender keeps drafts and connection invalidation reaches the new DOM without adding hooks', async () => {
    const c = await makeWorkspace();
    try {
      c.app.selectMode('structured'); c.edit(c.formal(), 'source', source);
      c.edit(c.formal(), 'displayName', '重绘来源');
      await c.app.formal.generate(c.formal());
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

  test('Item workspace keeps its own object kind and never exposes blueprint or encounter routes', async () => {
    const c = await makeWorkspace({ directoryKind: 'Item' });
    try {
      expect(c.root.querySelector('[data-forge-mode="blueprint"]')).toBeNull();
      expect(c.root.querySelector('[data-workspace-encounter]')).toBeNull();
      expect(c.app.selectMode('blueprint')).toBe(false);
      expect(c.value(c.intake(), 'mode')).toBe('ai-item');
      expect(c.app.selectMode('structured')).toBe(true);
      expect(c.intake().hidden).toBe(true);
      expect(c.formal().querySelector('[data-blueprint-editor]')).toBeNull();
    } finally { await c.cleanup(); }
  });

  test('a file that finishes after rerender populates the current pane and survives another rerender', async () => {
    const c = await makeWorkspace();
    let resolve!: (text: string) => void;
    try {
      c.app.selectMode('structured');
      const file = { name: 'retained.md', type: 'text/markdown', size: 20, text: () => new Promise<string>(r => { resolve = r; }) };
      const reading = c.app.formal.readSourceFile(c.formal(), { files: [file] });
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
      const generating = c.app.formal.generate(c.formal());
      const previous = c.formal();
      await c.render(); expect(c.formal()).not.toBe(previous);
      resolve(); await generating;
      expect(c.button(c.formal(), 'create').disabled).toBe(false);
      expect(c.button(c.formal(), 'generate').disabled).toBe(false);
      expect(c.button(c.formal(), 'cancel').disabled).toBe(true);
      expect(c.formal().querySelector('[data-preview]')?.hasAttribute('hidden')).toBe(false);
    } finally { await c.cleanup(); }
  });

  test('Intake remount restores its session binding and a pending file writes the current source', async () => {
    const c = await makeWorkspace();
    let resolve!: (text: string) => void;
    try {
      c.app.selectMode('ai');
      saveForgeSessionSettings({ model: 'fixture-intake-model' });
      const file = { name: 'intake.txt', type: 'text/plain', size: 30, text: () => new Promise<string>(r => { resolve = r; }) };
      const reading = c.app.intake.readSourceFile(c.intake(), { files: [file] });
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
    game: { version: '14.368', system: { id: 'dnd5e', version: '5.3.3' }, user: { id: 'gm', isGM: true }, world: { id: 'fixture-world' } },
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
    root.innerHTML = template('forge-workspace', context) + template(kind === 'Actor' ? 'forge-actor' : 'forge-item', context) + template('forge-intake', context);
    app._onRender(context, {});
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  await render();
  return { app, root, hooks, notifications, render,
    nativeWindows: () => windows, closed: () => closes,
    formal: () => root.querySelector<HTMLElement>('[data-forge-pane="formal"]')!,
    intake: () => root.querySelector<HTMLElement>('[data-forge-pane="intake"]')!,
    value: (pane: HTMLElement, name: string) => (pane.querySelector(`[name="${name}"]`) as HTMLInputElement).value,
    button: (pane: HTMLElement, action: string) => pane.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!,
    edit: (pane: HTMLElement, name: string, value: string) => {
      const input = pane.querySelector(`[name="${name}"]`) as HTMLInputElement;
      input.value = value; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    },
    cleanup: async () => { try { await app.close(); } finally { library.close(); batchQueue.close(); dom.window.close(); (globalThis as any).document = previousDocument; } },
  };
}
