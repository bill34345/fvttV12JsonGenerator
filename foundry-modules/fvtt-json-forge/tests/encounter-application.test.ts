import {describe,test,expect} from 'bun:test';
import {createForgeEncounterApplicationClass} from '../src/encounterApplication';

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
