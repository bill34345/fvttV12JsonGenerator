import {describe,test,expect} from 'bun:test';
import {JSDOM} from 'jsdom';
import {createForgeEncounterApplicationClass} from '../src/encounterApplication';
import type {ConfiguredConditionDefinition} from '@fvtt-json-generator/contracts/configured-conditions';

describe('configured state directory in the actual Forge entry',()=>{
  test('reads saved state definitions, exposes configuration entry, and supplies a fresh snapshot to generation',async()=>{
    const definition:ConfiguredConditionDefinition={schemaVersion:1,id:'configured.frost-mark',name:'霜印 Frost Mark',description:'降低速度',aliases:['Frost Mark','霜印'],components:[{kind:'movement-reduction',feet:10}]};
    let opened=0,captured:any;
    const configureButton:any={};
    const root:any={querySelector:(selector:string)=>selector==='[data-action="encounter-configure-conditions"]'?configureButton:null,querySelectorAll:()=>[]};
    class Base{element=root;render(){return this;}async close(){return this;}}
    const game:any={version:'14.368',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},macros:{contents:[]},
      modules:{get:()=>({active:true,api:{configuredConditions:{version:1,catalog:()=>[definition],openEditor:async()=>{opened++;}}}})}};
    const App=createForgeEncounterApplicationClass({game,foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}},
      getAiOptions:()=>({baseUrl:'https://provider.example/v1',apiKey:'test-key',model:'test'}),createEncounterIntakeProviders:()=>({provider:{},automationProvider:{}} as any),
      generateEncounterFromHumanMarkdown:async(input:any)=>{captured=input;return{report:{version:1,source:'Frost Mark source',sourceHash:'a'.repeat(64),model:'test',reviewModel:'test',evidenceMode:'standard',status:'needs_review',actors:[],findings:[]}};}});
    const app:any=new App();app._onRender();
    const context=await app._prepareContext();expect(context.canConfigureConditions).toBe(true);
    expect(context.configuredConditions[0].summary).toBe('移动速度降低 10 尺');
    await configureButton.onclick();expect(opened).toBe(1);
    app.humanSource='Frost Mark source';app.humanLabel='Configured source';await app.generateFromHuman();
    expect(captured.conditionCatalog).toEqual([definition]);expect(captured.conditionCatalog[0]).not.toBe(definition);
    definition.components[0]={kind:'movement-reduction',feet:5};expect(captured.conditionCatalog[0].components[0].feet).toBe(10);
  });
});

describe('human source file lifecycle',()=>{
  test('a pending file read clears stale text and cannot call a provider',async()=>{
    let resolveFile!:(text:string)=>void;let providerOptionsRead=0;
    const pending=new Promise<string>(resolve=>{resolveFile=resolve;});
    const file:any={files:[{name:'New source.md',size:20,text:()=>pending}]};
    const source:any={value:'Old source'};
    const root:any={querySelector:(selector:string)=>selector==='[name="humanSourceFile"]'?file:selector==='[name="humanSource"]'?source:null,querySelectorAll:()=>[]};
    class Base{element=root;render(){return this;}async close(){return this;}}
    const foundry={applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}};
    const game={version:'14.364',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},macros:{contents:[]}};
    const App=createForgeEncounterApplicationClass({game,foundry,getAiOptions:()=>{providerOptionsRead++;throw new Error('Unexpected provider request');}});
    const app:any=new App();app.humanSource='Old source';app._onRender();file.onchange();
    expect(app.humanSource).toBe('');expect(app.busy).toBe(true);await app.generateFromHuman();expect(providerOptionsRead).toBe(0);
    resolveFile('New raw source');await pending;await Promise.resolve();await Promise.resolve();
    expect(app.humanSource).toBe('New raw source');expect(app.busy).toBe(false);
  });
  test('closing while a file is read does not revive the application or install that source',async()=>{
    let resolveFile!:(text:string)=>void;const pending=new Promise<string>(resolve=>{resolveFile=resolve;});let renders=0;
    const file:any={files:[{name:'New.md',size:5,text:()=>pending}]};
    const root:any={querySelector:(selector:string)=>selector==='[name="humanSourceFile"]'?file:null,querySelectorAll:()=>[]};
    class Base{element=root;render(){renders++;return this;}async close(){return this;}}
    const App=createForgeEncounterApplicationClass({game:{},foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}}});
    const app:any=new App();app._onRender();file.onchange();await app.close();const count=renders;
    resolveFile('late');await pending;await Promise.resolve();await Promise.resolve();
    expect(app.humanSource).toBe('');expect(renders).toBe(count);
  });
});

describe('local encounter AI waiting',()=>{
  const foundry=(root:any={querySelector:()=>null,querySelectorAll:()=>[]})=>{
    class Base{element=root;render(){return this;}async close(){return this;}}
    return {applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}};
  };
  const game=()=>({version:'14.364',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},macros:{contents:[]}});
  const report=()=>({version:1 as const,source:'two creatures',sourceHash:'a'.repeat(64),model:'test',reviewModel:'test',evidenceMode:'standard' as const,status:'needs_review' as const,actors:[],findings:['review required']});

  test('uses the parent DS connection and never restores the removed Luna bridge path',async()=>{
    const ds={baseUrl:'https://api.deepseek.com',apiKey:'test-key',model:'deepseek-flash',reviewModel:'deepseek-flash',protocol:'openai-responses' as const,structuredOutput:'json_object' as const};
    let reads=0;let captured:any;
    const App=createForgeEncounterApplicationClass({game:game(),foundry:foundry(),
      getAiOptions:()=>{reads++;return ds;},getAiWaitPolicy:()=>{throw Error('Removed bridge must not be used');},
      createEncounterIntakeProviders:(options:any)=>{captured=options;return {provider:{},automationProvider:{}} as any;},
      generateEncounterFromHumanMarkdown:async()=>({report:report()})});
    const app:any=new App();app.humanSource='two creatures';app.humanLabel='DS encounter';app.localBridge=true;
    await app.generateFromHuman();expect(reads).toBe(1);expect(captured).toBe(ds);expect(captured.allowLocalBridge).toBeUndefined();
  });
  test('leaves ordinary encounter connections on their existing options path',async()=>{
    const ordinary={baseUrl:'https://provider.example/v1',apiKey:'key',model:'ordinary',timeoutMs:600_000};let optionsCalls=0;let waitCalls=0;let captured:any;
    const App=createForgeEncounterApplicationClass({
      game:game(),foundry:foundry(),getAiOptions:()=>{optionsCalls+=1;return ordinary;},getAiWaitPolicy:()=>{waitCalls+=1;throw new Error('local wait policy must not be read');},
      createEncounterIntakeProviders:(options:any)=>{captured=options;return {provider:{},automationProvider:{}} as any;},
      generateEncounterFromHumanMarkdown:async()=>({report:report()}),
    });
    const app:any=new App();app.humanSource='two creatures';app.humanLabel='Ordinary encounter';

    await app.generateFromHuman();

    expect(optionsCalls).toBe(1);expect(waitCalls).toBe(0);expect(captured).toBe(ordinary);expect(captured.waitPolicy).toBeUndefined();
  });
});
describe('localized evidence candidate identity',()=>{
  test('choosing another package invalidates both old intake and translation records',async()=>{
    const file:any={files:[{name:'package-b.json'}]};
    const root:any={querySelector:(selector:string)=>selector==='[name="encounterFile"]'?file:null,querySelectorAll:()=>[]};
    class Base{element=root;render(){return this;}async close(){return this;}}
    const App=createForgeEncounterApplicationClass({game:{version:'14.364',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},macros:{contents:[]}},
      foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}}});
    const app:any=new App();app.aiReport={source:'package-a'};app.translationReport=[{actorKey:'actor-a'}];app.prepared={bundle:{id:'package-a'}};
    app._onRender();file.onchange();
    expect(app.aiReport).toBeUndefined();expect(app.translationReport).toEqual([]);expect(app.prepared).toBeUndefined();
    expect((await app._prepareContext()).hasReport).toBe(false);
  });
});

describe('current encounter review download',()=>{
  test('download anchors preserve their default action under the Core document-level hyperlink delegate',()=>{
    const dom=new JSDOM('<!doctype html><body><main><button type="button" data-action="encounter-report">Report</button><a data-report-download href="blob:http://127.0.0.1:30001/review" download="encounter-intake-review.json">Download</a><a data-reference href="https://reference.example/terms">Terms</a></main></body>');
    const document=dom.window.document,root=document.querySelector('main')!,opened:string[]=[],automaticClicks:Event[]=[];
    document.addEventListener('click',event=>{
      const link=(event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement|null;
      if(link){event.preventDefault();opened.push(link.href);}
    });
    // Dispatch through the real DOM delegate without asking JSDOM to save files.
    dom.window.HTMLAnchorElement.prototype.click=function(){const event=new dom.window.Event('click',{bubbles:true,cancelable:true});automaticClicks.push(event);this.dispatchEvent(event);};
    const win:any=dom.window;win.Blob=Blob;win.URL.createObjectURL=()=> 'blob:http://127.0.0.1:30001/current-review';win.URL.revokeObjectURL=()=>{};
    class Base{element=root;render(){return this;}async close(){return this;}}
    const App=createForgeEncounterApplicationClass({window:win,game:{macros:{contents:[]}},foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(b:any)=>b}}}});
    const app:any=new App();app.prepared={bundle:{id:'current-package',localization:{actors:[]}}};app._onRender();
    (root.querySelector('[data-action="encounter-report"]') as HTMLButtonElement).click();
    expect(automaticClicks).toHaveLength(1);expect(automaticClicks[0]!.defaultPrevented).toBe(false);expect(opened).toEqual([]);
    const manualClick=new dom.window.Event('click',{bubbles:true,cancelable:true});root.querySelector('[data-report-download]')!.dispatchEvent(manualClick);
    expect(manualClick.defaultPrevented).toBe(false);expect(opened).toEqual([]);
    const referenceClick=new dom.window.Event('click',{bubbles:true,cancelable:true});root.querySelector('[data-reference]')!.dispatchEvent(referenceClick);
    expect(referenceClick.defaultPrevented).toBe(true);expect(opened).toEqual(['https://reference.example/terms']);
  });
  function downloadHarness(){
    const blobs:Blob[]=[],revoked:string[]=[],requests:any[]=[],reportButton:any={},controls=new Map<string,any>();
    for(const name of ['humanSource','humanLabel','outputLanguage','encounterFile'])controls.set(name,{value:'new source',files:[{name:'package-b.json'}]});
    const root:any={querySelector:(selector:string)=>selector==='[data-action="encounter-report"]'?reportButton:controls.get(selector.match(/^\[name="(.+)"\]$/)?.[1]??''),querySelectorAll:()=>[]};
    const browserWindow:any={Blob,URL:{createObjectURL:(blob:Blob)=>{blobs.push(blob);return `blob:http://127.0.0.1:30001/review-${blobs.length}`;},revokeObjectURL:(url:string)=>revoked.push(url)},
      document:{body:{appendChild:(link:any)=>{link.connected=true;}},createElement:()=>({connected:false,href:'',download:'',click(){requests.push({href:this.href,name:this.download,connected:this.connected});},remove(){this.connected=false;}})}};
    class Base{element=root;render(){return this;}async close(){return this;}}
    const App=createForgeEncounterApplicationClass({window:browserWindow,game:{version:'14.368',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},macros:{contents:[]}},
      foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}}});
    const app:any=new App();app._onRender();
    const bundle={id:'package-a',primaryActorKey:'eye',assets:[],actors:[{key:'eye',source:'Original source 1d8 DC 15'}],localization:{sourcePackageId:'original-a',actors:[{key:'eye',translation:{language:'zh-CN',review:{verdict:'accepted',findings:[]},texts:[{id:'name',text:'深海之眼（Eye of the Deep）'}]}}],packageText:{review:{verdict:'accepted',findings:[]}}}};
    app.prepared={bundle,actors:[],macros:[],requirements:[]};
    return{app,bundle,blobs,revoked,requests,reportButton,controls};
  }
  test('normal report action prepares exact reviewed content and retains a native download link until replaced or closed',async()=>{
    const {app,bundle,blobs,revoked,requests,reportButton}=downloadHarness();
    reportButton.onclick();
    expect(JSON.parse(await blobs[0]!.text())).toEqual({intake:null,localization:bundle.localization,sourcePackage:bundle});
    expect(requests).toEqual([{href:'blob:http://127.0.0.1:30001/review-1',name:'encounter-intake-review.json',connected:true}]);
    expect((await app._prepareContext()).reportDownload).toEqual({url:requests[0].href,name:requests[0].name,byteLength:blobs[0]!.size});
    expect(revoked).toEqual([]);
    reportButton.onclick();expect(revoked).toEqual(['blob:http://127.0.0.1:30001/review-1']);
    await app.close();expect(revoked).toEqual(['blob:http://127.0.0.1:30001/review-1','blob:http://127.0.0.1:30001/review-2']);
    expect(app.reportDownload).toBeUndefined();reportButton.onclick();expect(blobs).toHaveLength(2);
  });
  for(const name of ['humanSource','humanLabel','outputLanguage','encounterFile'])test(`changing ${name} revokes the prior candidate review link`,()=>{
    const {app,blobs,revoked,reportButton,controls}=downloadHarness();reportButton.onclick();
    const control=controls.get(name);if(name==='outputLanguage'||name==='encounterFile')control.onchange();else control.oninput();
    expect(app.reportDownload).toBeUndefined();expect(app.prepared).toBeUndefined();
    expect(revoked).toEqual(['blob:http://127.0.0.1:30001/review-1']);reportButton.onclick();expect(blobs).toHaveLength(1);
  });
  test('secret rejection removes a prior safe link and shows an error without preparing another file',()=>{
    const {app,bundle,blobs,revoked,requests,reportButton}=downloadHarness();reportButton.onclick();
    app.forbiddenValues=['private-test-value'];bundle.actors[0]!.source='private-test-value';reportButton.onclick();
    expect(app.reportDownload).toBeUndefined();expect(blobs).toHaveLength(1);expect(requests).toHaveLength(1);
    expect(revoked).toEqual(['blob:http://127.0.0.1:30001/review-1']);expect(app.error).toBeTruthy();expect(app.error).not.toContain('private-test-value');
  });
});
