import {describe,test,expect,spyOn} from 'bun:test';
import {JSDOM} from 'jsdom';
import Handlebars from 'handlebars';
import {readFileSync} from 'node:fs';
import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import {renderPdfReadingMarkdown} from '@fvtt-json-generator/forge-browser-runtime/pdf-reader';
import {renderMonsterIntakeMarkdown} from '@fvtt-json-generator/intake-ai/renderer';
import {RAT_WARLOCK_SOURCE,buildRatWarlockIr} from '../../../src/core/intake/__tests__/fixtures/rat-warlock';
import {LURKER_SOURCE,buildValidLurkerIr} from '../../../src/core/intake/__tests__/fixtures/lurker';
import {createForgeEncounterApplicationClass} from '../src/encounterApplication';
import {createForgeIntakeApplicationClass} from '../src/intakeApplication';
import {decodeEncounterRecovery,serializeEncounterRecovery} from '../src/encounterRecoveryStore';
import type {ForgePdfInputReceipt} from '../src/pdfInput';

const encounterTemplate=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-encounter.hbs','utf8'));
const intakeTemplate=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-intake.hbs','utf8'));
const pdfFile={name:'Bestiary.pdf',arrayBuffer:async()=>new ArrayBuffer(0)} as File;
const options={baseUrl:'https://provider.example/v1',apiKey:'fixture-key',model:'fixture'};

function receipt(sourceName='Bestiary.pdf'):ForgePdfInputReceipt{
  const outputs=[{name:'Rat Warlock',markdown:RAT_WARLOCK_SOURCE,sourceLineIds:['p1-l1'],pageNumbers:[1],doubts:[]},
    {name:'Lurker',markdown:LURKER_SOURCE,sourceLineIds:['p2-l1'],pageNumbers:[2],doubts:[]}];
  const sourcePages=outputs.map((output,index)=>({pageNumber:index+1,width:600,height:800,rotation:0,warnings:[],rawStyles:{},
    rawItems:[{str:output.name,dir:'ltr',transform:[1,0,0,12,10,10],width:80,height:12,fontName:'fixture',hasEOL:true}],
    lines:[{id:`p${index+1}-l1`,text:output.name,bbox:{x:10,y:10,width:80,height:12},fontSize:12,bold:true,itemIndexes:[0],
      method:'native-pdf-text' as const,language:'en' as const,confidence:null}]}));
  const source={schemaVersion:1 as const,sourceName,sourceSha256:'a'.repeat(64),engine:'pdfjs' as const,engineVersion:'6.4.299' as const,pageCount:2,pages:sourcePages};
  const reading={schemaVersion:1 as const,status:'completed' as const,source,sourcePageNumbers:[1,2],requestedMonster:'Rat Warlock and Lurker',outputs,doubts:[],failures:[],calls:[],responses:[]};
  return{version:1,status:reading.status,sourceName,sourceSha256:source.sourceSha256,engine:source.engine,engineVersion:source.engineVersion,
    pageCount:source.pageCount,source:renderPdfReadingMarkdown(reading),sourcePages,requestedMonster:reading.requestedMonster,outputs,doubts:[],failures:[],calls:[]};
}

function harness(configuration:{initialPdf?:File;reader?:(...args:any[])=>Promise<ForgePdfInputReceipt>;stored?:any}={}){
  let saved=configuration.stored,readerCalls=0,optionReads=0,providerCalls=0,translationCalls=0,failedProvider=false;
  const readerRequests:any[]=[];
  const foundryInstances:any[]=[];
  class Base{
    element:any={querySelector:()=>null,querySelectorAll:()=>[]};
    constructor(){foundryInstances.push(this);}
    render(){return this;}
    async close(){return this;}
  }
  const foundry={applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}};
  const game:any={version:'14.368',world:{id:'pdf-fixture'},system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},macros:{contents:[]}};
  const noReview=async()=>{throw Error('No paid content review is allowed');};
  const providers=()=>({provider:{providerName:'offline-fixture',extractionModel:'fixture',reviewModel:'fixture',
    discover:async(request:any)=>{
      providerCalls++;if(failedProvider)throw Error('Provider unavailable after PDF reading');
      return{schemaVersion:1,candidates:[RAT_WARLOCK_SOURCE,LURKER_SOURCE].map((quote,index)=>({id:`member-${index+1}`,
        label:index?'Lurker':'Rat Warlock',start:request.source.indexOf(quote),end:request.source.indexOf(quote)+quote.length,quote}))};
    },
    extract:async()=>{throw Error('The complete-text extraction port owns this request');},
    extractAnswer:async(request:any)=>{providerCalls++;if(failedProvider)throw Error('Provider unavailable after PDF reading');
      return{kind:'source-text',sourceText:renderMonsterIntakeMarkdown(request.source.includes('Rat Warlock')?buildRatWarlockIr():buildValidLurkerIr())};},
    repair:noReview,review:noReview},automationProvider:{generate:noReview,review:noReview},
    translationService:{model:'fixture',reviewModel:'fixture',translate:async()=>{translationCalls++;throw Error('Translation must be explicitly enabled');},review:noReview}});
  const recoveryStore={load:async()=>saved,save:async(snapshot:any)=>{saved=decodeEncounterRecovery(serializeEncounterRecovery(snapshot));},clear:async()=>{saved=undefined;}};
  const App=createForgeEncounterApplicationClass({game,foundry,recoveryStore,initialPdfFile:configuration.initialPdf,
    getRecoverySecrets:()=>({apiKey:'',baseUrl:''}),getAiOptions:()=>{optionReads++;return options;},
    readForgePdfInput:async(...args:any[])=>{readerCalls++;readerRequests.push(args);return configuration.reader?configuration.reader(...args):receipt();},
    createEncounterIntakeProviders:providers as any});
  const app:any=new App();
  return{App,app,foundry,game,foundryInstances,recoveryStore,readerRequests,
    failProvider:()=>{failedProvider=true;},get saved(){return saved;},get readerCalls(){return readerCalls;},
    get optionReads(){return optionReads;},get providerCalls(){return providerCalls;},get translationCalls(){return translationCalls;}};
}

async function mount(app:any){
  const dom=new JSDOM(encounterTemplate(await app._prepareContext()));
  app.element=dom.window.document.querySelector('.forge-encounter-panel');app._onRender();
  return dom;
}

function chooseFile(app:any,file:File){
  const input=app.element.querySelector('[name="humanSourceFile"]');
  Object.defineProperty(input,'files',{configurable:true,value:[file]});input.onchange();
}

describe('PDF in the actual Forge creature entry',()=>{
  test('one Generate reads PDF then generates every variant in source language, with no repeated PDF request',async()=>{
    const session=harness({initialPdf:pdfFile}),{app}=session;
    await mount(app);expect(app.outputLanguage).toBe('source');
    await app.generateFromHuman();expect(app.error).toContain('生物名称');expect(session.optionReads).toBe(0);
    const monster=app.element.querySelector('[name="pdfMonster"]');monster.value='Rat Warlock and Lurker';monster.oninput();
    const pages=app.element.querySelector('[name="pdfPages"]');pages.value='1-2';pages.oninput();
    await app.generateFromHuman();
    expect(app.prepared?.actors).toHaveLength(2);
    expect(app.aiReport.actors).toHaveLength(2);expect(app.aiReport.outputLanguage).toBe('source');
    expect(app.humanSource).toBe(receipt().source);expect(app.pdfFile).toBeUndefined();
    expect(app.pdfReceipt.outputs).toHaveLength(2);expect(session.translationCalls).toBe(0);
    expect(session.readerRequests[0][0]).toMatchObject({file:pdfFile,monster:'Rat Warlock and Lurker',pages:'1-2'});
    const context=await app._prepareContext();expect(context.actorDeliveries.every((row:any)=>row.available)).toBe(true);
    const html=new JSDOM(encounterTemplate(context)).window.document;
    expect(html.querySelector('[data-pdf-source]')?.textContent).toBe(app.humanSource);
    expect(html.querySelector('[name="outputLanguage"] option:checked')?.getAttribute('value')).toBe('source');
    await app.generateFromHuman();expect(session.readerCalls).toBe(1);expect(app.prepared?.actors).toHaveLength(2);
    await app.close();
  });

  test.each(['not_found','failed'] as const)('PDF %s preserves old Markdown and both old candidates',async status=>{
    let nextReading=receipt();
    const session=harness({initialPdf:pdfFile,reader:async()=>nextReading}),{app}=session;
    app.pdfMonster='Rat Warlock and Lurker';await app.generateFromHuman();
    const oldPrepared=app.prepared,oldReport=app.aiReport,oldSource=app.humanSource;
    await mount(app);chooseFile(app,pdfFile);app.pdfMonster='Unknown';
    nextReading={...receipt('Unknown.pdf'),status,source:'',outputs:[],failures:['Target not found in selected pages']};
    const calls=session.providerCalls;await app.generateFromHuman();
    expect(app.humanSource).toBe(oldSource);expect(app.prepared).toBe(oldPrepared);expect(app.aiReport).toBe(oldReport);
    expect((await app._prepareContext()).actorDeliveries.every((row:any)=>row.available)).toBe(true);
    expect((await app._prepareContext()).pdfSource).toBe('');expect(app.error).toContain('Target not found');
    expect(session.providerCalls).toBe(calls);await app.close();
  });

  test('downstream Provider failure keeps the new MD, old downloadable candidates, and a recoverable source identity',async()=>{
    const session=harness({reader:async()=>receipt('New bestiary.pdf')}),{app}=session;
    app.humanSource=receipt().source;await app.generateFromHuman();
    const oldPrepared=app.prepared,oldReport=app.aiReport,oldText=app.currentActorText('actor-1');
    await mount(app);chooseFile(app,pdfFile);app.pdfMonster='Rat Warlock and Lurker';session.failProvider();
    await app.generateFromHuman();
    expect(app.pdfReceipt).toBeDefined();expect(app.pdfFile).toBeUndefined();expect(app.humanSource).toBe(receipt('New bestiary.pdf').source);
    expect(app.humanSource).not.toBe(oldReport.source);
    expect(app.prepared).toBe(oldPrepared);expect(app.aiReport).toBe(oldReport);expect(app.currentActorText('actor-1')).toBe(oldText);
    // Changing the draft must not turn the retained Actor into a resumable task for that draft.
    app.humanSource+='\nA changed draft';
    expect(app.currentActorText('actor-1')).toBe(oldText);
    expect((await app._prepareContext()).recoveryAvailable).toBe(false);
    await app.generateFromHuman(true);expect(app.error).toContain('来源或自定义状态目录已改变');
    app.humanSource=app.pdfReceipt.source;await app.saveRecovery();
    expect(session.saved.pdfReceipt).toEqual(app.pdfReceipt);expect(session.saved.report).toEqual(oldReport);
    await app.close();
  });

  test.each(['stop','close'] as const)('%s during PDF reading aborts the shared job and cannot install a late reading',async action=>{
    let resolveReading!:(value:ForgePdfInputReceipt)=>void,started!:()=>void,signal:AbortSignal|undefined;
    const began=new Promise<void>(resolve=>{started=resolve;});
    const reading=new Promise<ForgePdfInputReceipt>(resolve=>{resolveReading=resolve;});
    const session=harness({initialPdf:pdfFile,reader:async(_request,_options,currentSignal)=>{signal=currentSignal;started();return reading;}}),{app}=session;
    app.humanSource='Original Markdown';app.pdfMonster='Rat Warlock';await mount(app);
    const pending=app.generateFromHuman();await began;
    expect(app.busy).toBe(true);expect(app.aiRunning).toBe(true);
    if(action==='close')await app.close();else app.controller.abort();
    expect(signal?.aborted).toBe(true);resolveReading(receipt());await pending;
    expect(app.humanSource).toBe('Original Markdown');expect(app.pdfReceipt).toBeUndefined();expect(session.providerCalls).toBe(0);
    expect(app.busy).toBe(false);await app.close();
  });

  test('cancelling a follow-up PDF pass retains already read MD and receipt without generating or losing old Actors',async()=>{
    let resolveReading!:(value:ForgePdfInputReceipt)=>void,started!:()=>void;
    const began=new Promise<void>(resolve=>{started=resolve;});
    const reading=new Promise<ForgePdfInputReceipt>(resolve=>{resolveReading=resolve;});
    const session=harness({reader:async()=>{started();return reading;}}),{app}=session;
    app.humanSource=receipt().source;await app.generateFromHuman();
    const oldPrepared=app.prepared,oldReport=app.aiReport,oldText=app.currentActorText('actor-1'),calls=session.providerCalls;
    await mount(app);chooseFile(app,pdfFile);app.pdfMonster='Rat Warlock and Lurker';
    const pending=app.generateFromHuman();await began;app.controller.abort();
    const retained={...receipt('Cancelled follow-up.pdf'),status:'cancelled' as const,failures:['Follow-up page request cancelled']};
    resolveReading(retained);await pending;
    expect(app.humanSource).toBe(retained.source);expect(app.pdfReceipt).toEqual(retained);expect(app.pdfFile).toBeUndefined();
    expect(app.prepared).toBe(oldPrepared);expect(app.aiReport).toBe(oldReport);expect(app.currentActorText('actor-1')).toBe(oldText);
    expect(session.providerCalls).toBe(calls);expect(app.busy).toBe(false);
    await app.saveRecovery();expect(session.saved.pdfReceipt).toEqual(retained);expect(session.saved.source).toBe(retained.source);
    await app.close();const reopened=harness({stored:session.saved});await reopened.app._prepareContext();await reopened.app.previewRecovered();
    expect(reopened.app.pdfReceipt).toEqual(retained);expect(reopened.app.prepared.actors).toHaveLength(2);
    expect(reopened.readerCalls).toBe(0);expect(reopened.providerCalls).toBe(0);await reopened.app.close();
  });

  test('recovery needs neither the File nor Provider and malformed PDF metadata does not discard Actors',async()=>{
    const session=harness({initialPdf:pdfFile}),{app}=session;
    app.pdfMonster='Rat Warlock and Lurker';await app.generateFromHuman();await app.saveRecovery();await app.close();
    const saved=structuredClone(session.saved);
    expect(JSON.stringify(saved)).not.toContain('fixture-key');expect(JSON.stringify(saved)).not.toContain('arrayBuffer');
    const reopened=harness({stored:saved}),restored=reopened.app;await restored._prepareContext();await restored.previewRecovered();
    expect(restored.pdfFile).toBeUndefined();expect(restored.pdfReceipt).toEqual(saved.pdfReceipt);expect(restored.prepared.actors).toHaveLength(2);
    expect(reopened.readerCalls).toBe(0);expect(reopened.optionReads).toBe(0);await restored.close();
    saved.pdfReceipt.source+='Wrong source';const malformed=harness({stored:saved});
    await malformed.app._prepareContext();expect(malformed.app.error).toContain('PDF 页码／坐标记录');
    expect(malformed.app.pdfReceipt).toBeUndefined();expect(malformed.app.humanSource).toBe(saved.source);
    await malformed.app.previewRecovered();expect(malformed.app.prepared.actors).toHaveLength(2);
    expect(malformed.optionReads).toBe(0);expect(malformed.readerCalls).toBe(0);await malformed.app.close();
  });

  test('PDF answer text survives recovery and the actual source-record download, while malformed responses and secrets stay rejected',async()=>{
    const reading={...receipt(),responses:[{pass:1,content:'{"status":"partial","outputs":[{"name":"Rat Warlock"}]}'},
      {pass:2,content:'A malformed follow-up answer <script>unsafe()</script>'}]};
    const session=harness({initialPdf:pdfFile,reader:async()=>reading}),{app}=session;
    app.pdfMonster='Rat Warlock and Lurker';await app.generateFromHuman();await app.saveRecovery();await app.close();
    const saved=structuredClone(session.saved),reopened=harness({stored:saved});await mount(reopened.app);
    const visible=reopened.app.element.querySelector('[data-pdf-receipt]');
    expect(JSON.parse(visible.value).responses).toEqual(reading.responses);
    expect(reopened.app.element.querySelector('script')).toBeNull();
    let downloaded:Blob|undefined,clicks=0;const link:any={click(){clicks++;}};
    const documentDescriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
    const createUrl=spyOn(URL,'createObjectURL').mockImplementation(blob=>{downloaded=blob as Blob;return'blob:forge-pdf-response';});
    try{
      Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>link}});
      reopened.app.element.querySelector('[data-action="encounter-pdf-receipt-download"]').click();
      expect(link.download).toBe('forge-pdf-source.json');expect(clicks).toBe(1);
      expect(JSON.parse(await downloaded!.text()).responses).toEqual(reading.responses);
    }finally{
      createUrl.mockRestore();
      if(documentDescriptor)Object.defineProperty(globalThis,'document',documentDescriptor);else delete (globalThis as any).document;
      await reopened.app.close();
    }
    expect(reopened.optionReads).toBe(0);expect(reopened.readerCalls).toBe(0);
    for(const responses of [null,'raw text',[null],[{pass:0,content:'answer'}],[{pass:1,content:17}]]){
      const malformed=structuredClone(saved);malformed.pdfReceipt.responses=responses;
      const decoded=decodeEncounterRecovery(JSON.stringify(malformed));
      expect(decoded.version===1&&decoded.pdfReceipt).toBeUndefined();expect(decoded.package).toBe(saved.package);
      expect(decoded.recoveryWarnings?.join(' ')).toContain('PDF 页码／坐标记录');
    }
    const secret=structuredClone(saved);secret.pdfReceipt.responses=[{pass:1,content:'{"apiKey":"secret"}'}];
    expect(()=>decodeEncounterRecovery(JSON.stringify(secret))).toThrow();
  });

  test('editing the read Markdown releases PDF coordinate identity without deleting old candidates',async()=>{
    const session=harness({initialPdf:pdfFile}),{app}=session;app.pdfMonster='Rat Warlock and Lurker';await app.generateFromHuman();
    const artifact=app.currentActorText('actor-1');await mount(app);
    const input=app.element.querySelector('[name="humanSource"]');input.value+='\nGM note';input.oninput();
    expect(app.pdfReceipt).toBeUndefined();expect((await app._prepareContext()).pdfReceipt).toBeUndefined();
    expect(app.element.querySelector('[data-pdf-reading]')).toBeNull();
    expect(app.currentActorText('actor-1')).toBe(artifact);await app.close();
  });

  test('a newly opened PDF selection cannot clear the previous checkpoint before reading succeeds',async()=>{
    const previous=harness();previous.app.humanSource=receipt().source;
    await previous.app.generateFromHuman();await previous.app.saveRecovery();await previous.app.close();
    const oldSnapshot=structuredClone(previous.saved);
    const pending=harness({initialPdf:pdfFile,stored:oldSnapshot});await mount(pending.app);
    const monster=pending.app.element.querySelector('[name="pdfMonster"]');monster.value='Rat Warlock';monster.oninput();
    await pending.app.saveRecovery();expect(pending.saved).toEqual(oldSnapshot);
    await pending.app.close();expect(pending.saved).toEqual(oldSnapshot);expect(pending.readerCalls).toBe(0);
  });

  test.each(['md','txt'])('ordinary %s files still read directly and do not call the PDF reader or Provider',async extension=>{
    const session=harness(),{app}=session;await mount(app);
    chooseFile(app,{name:`Ordinary.${extension}`,text:async()=>RAT_WARLOCK_SOURCE} as File);
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    expect(app.humanSource).toBe(RAT_WARLOCK_SOURCE);expect(app.humanLabel).toBe('Ordinary');expect(app.busy).toBe(false);
    expect(session.optionReads).toBe(0);expect(session.readerCalls).toBe(0);await app.close();
  });

  test('Actor source-file routing opens the existing creature window and preserves the parent candidate; Item retains its text-only contract',async()=>{
    const session=harness(),notices:string[]=[];
    const Intake=createForgeIntakeApplicationClass({game:session.game,foundry:session.foundry,directoryKind:'Actor',
      ui:{notifications:{error:(text:string)=>notices.push(text)}}});
    const parent:any=new Intake(),previous={candidate:'retained'};parent.generation=previous;parent.reviewSource='Parent source';
    const root=new JSDOM('<textarea name="source">Parent source</textarea>').window.document as any;
    await parent.readSourceFile(root,{files:[pdfFile],value:'selected'});
    const child=session.foundryInstances.at(-1);
    expect(child).not.toBe(parent);expect(child.pdfFile).toBe(pdfFile);expect(parent.generation).toBe(previous);
    expect(parent.reviewSource).toBe('Parent source');expect(notices).toEqual([]);
    expect(session.optionReads).toBe(0);expect(session.readerCalls).toBe(0);
    const actorDom=new JSDOM(intakeTemplate({isActorDirectory:true})).window.document;
    const itemDom=new JSDOM(intakeTemplate({isActorDirectory:false})).window.document;
    expect(actorDom.querySelector('[name="sourceFile"]')?.getAttribute('accept')).toContain('.pdf');
    expect(itemDom.querySelector('[name="sourceFile"]')?.getAttribute('accept')).not.toContain('.pdf');
    const Item=createForgeIntakeApplicationClass({game:session.game,foundry:session.foundry,directoryKind:'Item',
      ui:{notifications:{error:(text:string)=>notices.push(text)}}});
    const item:any=new Item();await item.readSourceFile(root,{files:[pdfFile],value:'selected'});
    expect(notices.at(-1)).toContain('只支持 Markdown');expect(session.foundryInstances.at(-1)).toBe(item);
    await child.close();await parent.close();await item.close();await session.app.close();
  });
});
