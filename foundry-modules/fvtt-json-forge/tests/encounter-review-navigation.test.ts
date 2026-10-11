import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { acceptLocalization, localizationText, protectLocalizationText, LOCALIZATION_TERMS, LOCALIZATION_POLICY, LEGACY_LOCALIZATION_POLICY } from '@fvtt-json-generator/contracts/localization';
import { serializeForgeEncounterPackage } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { verifiedEncounterLocalizationProgress } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { fixedEncounterCommand } from '@fvtt-json-generator/intake-ai/encounter-capabilities';
import { createActorLocalizationRequest } from '@fvtt-json-generator/generation/reviewed-localization';
import { approvedDisplayTitle, encounterReviewNavigation } from '../src/encounterReviewNavigation';
import { encounterReviewCards } from '../src/encounterReviewCards';
import { createForgeEncounterApplicationClass } from '../src/encounterApplication';

const firstName = 'Very long <script>not executable</script> Recovery Stalker with a deliberately long bilingual navigation title';
const secondName = 'Review Sentinel';
const packageTitle = 'Chrome Recovery R2 input';
const packageBody = 'Two fictional Fey statblocks used for local UI acceptance.';
const source = `${firstName}\n${secondName}\n${packageTitle}\n${packageBody}`;
const title = localizationText('title', packageTitle);
const body = localizationText('body', packageBody);
const progress:any[] = [firstName,secondName].map((name,index) => {
  const field=localizationText('title',name);
  const feature=localizationText('title','Manual');
  return {actorKey:`actor-${index+1}`,status:'accepted',request:{texts:index?[field]:[field,feature]},
    translation:{policy:LOCALIZATION_POLICY,review:{verdict:'accepted',findings:[]},
      texts:index?[{id:field.id,text:'已审核守卫'}]:[{id:field.id,text:'已审核追猎者'},{id:feature.id,text:'已审手工'}]}};
});
progress.push({status:'needs_review',request:{texts:[title,body]},draft:{texts:[
  {id:title.id,text:'中文 R'}, {id:body.id,text:'中文 configured'}]},
findings:[`${title.id}：标题残留英文 R`,`${body.id}：正文残留英文 configured`]});
const report:any={version:1,source,sourceHash:hashSource(source),status:'ready_for_gm_review',actors:[
  {key:'actor-1',start:0,end:firstName.length,source:firstName,analysis:{candidate:{label:firstName},status:'ready_to_generate',findings:[]},generation:{status:'accepted',findings:[]}},
  {key:'actor-2',start:firstName.length+1,end:firstName.length+1+secondName.length,source:secondName,analysis:{candidate:{label:secondName},status:'ready_to_generate',findings:[]},generation:{status:'accepted',findings:[]}},
],automation:{selection:{rules:[
  {actorKey:'actor-1',featureName:'Manual',quote:firstName,kind:'gm-manual',parameters:{},gmSteps:[]},
  {actorKey:'actor-2',featureName:'Manual',quote:secondName,kind:'threshold-ward',parameters:{},gmSteps:[]},
]}},findings:[]};
const bundle:any={label:packageTitle,macros:[{name:'Control',notes:packageBody}],actors:[
  {key:'actor-1',label:firstName,source:firstName},{key:'actor-2',label:secondName,source:secondName}]};

describe('encounter review navigation',()=>{
  test('maps only exact opaque field IDs and accepted actor titles; keeps package failures separate',()=>{
    const view=encounterReviewNavigation(report,progress,source,true,bundle);
    expect(view).toMatchObject({actorCount:2,automatic:1,manual:1,blocked:2});
    expect(view.summary).toContain('2 个角色译文已通过，战斗包 2 个字段或规则待处理');
    expect(view.actors[0]!.label).toBe(`已审核追猎者 ${firstName}`);
    const cards=encounterReviewCards(report,undefined,progress);
    expect(cards[0]).toMatchObject({actor:`已审核追猎者 ${firstName}`,feature:'已审手工 Manual'});
    expect(cards[1]).toMatchObject({actor:`已审核守卫 ${secondName}`,feature:'Manual'});
    const legacy=progress.map((entry,index)=>index===0?{...entry,translation:{...entry.translation,policy:LEGACY_LOCALIZATION_POLICY}}:entry);
    expect(encounterReviewNavigation(report,legacy,source,true,bundle).actors[0]!.label).toBe(`已审核追猎者（${firstName}）`);
    expect(encounterReviewCards(report,undefined,legacy)[0]!.feature).toBe('已审手工（Manual）');
    expect(approvedDisplayTitle('旧译 Manual','新译',LOCALIZATION_POLICY)).toBe('新译 Manual');
    expect(view.issues.map(issue=>[issue.actor,issue.field,issue.source,issue.draft])).toEqual([
      ['战斗包','战斗包名称',packageTitle,'中文 R'],['战斗包','控制宏说明',packageBody,'中文 configured']]);
    expect(source.slice(view.issues[0]!.locateStart,view.issues[0]!.locateEnd)).toBe(packageTitle);
    const unknown={...progress.at(-1),findings:['text-000000000000000000000000：未知字段']};
    const unresolved=encounterReviewNavigation(report,[...progress.slice(0,-1),unknown],source,true,bundle).issues[0]!;
    expect(unresolved).toMatchObject({actor:'战斗包',field:'字段归属待核',source:undefined,draft:undefined});
    expect(unresolved.locateStart).toBeUndefined();
    const otherActorField=localizationText('title',firstName);
    const wrongActor={...progress.at(-1),actorKey:'actor-unknown',request:{texts:[otherActorField]},findings:[`${otherActorField.id}：未知角色`]};
    const unknownOwner=encounterReviewNavigation(report,[...progress.slice(0,-1),wrongActor],source,true,bundle).issues[0]!;
    expect(unknownOwner).toMatchObject({actor:'归属待核',source:undefined,draft:undefined});
    expect(unknownOwner.locateStart).toBeUndefined();
    expect(encounterReviewNavigation(report,progress,source+' changed',true,bundle).issues).toEqual([]);
    expect(encounterReviewNavigation(report,progress,source,false).actors[0]!.label).toBe(firstName);
  });

  test('saved accepted titles require current request, reviewed text hash and clean findings',()=>{
    const artifact={name:'Echo',_stats:{systemVersion:'5.3.3',coreVersion:'14.364'},items:[]};
    const currentBundle:any={actors:[{key:'echo',label:'Echo',source:'source one'}],macros:[],label:'Test'};
    const request=createActorLocalizationRequest(artifact,currentBundle.actors[0].source);
    const translation=acceptLocalization(request,{texts:[{id:request.texts[0]!.id,text:'回声'}]},
      {verdict:'accepted',findings:[]},'test-model');
    const entry:any={actorKey:'echo',status:'accepted',request,translation};
    expect(verifiedEncounterLocalizationProgress(currentBundle,[{key:'echo',artifact}],[entry])[0]!.status).toBe('accepted');
    for(const changed of [
      {...entry,translation:{...translation,requestHash:'0'.repeat(64)}},
      {...entry,translation:{...translation,texts:[{id:request.texts[0]!.id,text:'别名'}]}},
      {...entry,translation:{...translation,review:{...translation.review,findings:['仍有问题']}}},
      {...entry,request:{...request,sourceHash:'0'.repeat(64)}},
    ])expect(verifiedEncounterLocalizationProgress(currentBundle,[{key:'echo',artifact}],[changed])[0])
      .toMatchObject({status:'needs_review',translation:undefined});
    const otherSource={...currentBundle,actors:[{key:'echo',label:'Echo',source:'source two'}]};
    expect(verifiedEncounterLocalizationProgress(otherSource,[{key:'echo',artifact}],[entry])[0]!.status).toBe('needs_review');
  });

  test('covered GM companion findings are not reported as failed, while unknown blocking findings remain visible',()=>{
    const changed=structuredClone(report);
    changed.actors[0].generation={status:'needs_review',findings:[
      {code:'ACTOR_CONDITION_REQUIRES_GM',path:'/actions/0',message:'GM handles this',blocking:true},
      {code:'UNRECOGNIZED_BLOCK',path:'/actions/1',message:'Unknown block',blocking:true},
    ]};
    const view=encounterReviewNavigation(changed,[],source,true,bundle);
    expect(view.blocked).toBe(1);
    expect(view.issues[0]).toMatchObject({actorKey:'actor-1',kind:'UNRECOGNIZED_BLOCK'});
  });

  test('legacy prepared GM mechanisms remain visible when fixed-rule counts are unavailable',async()=>{
    class Base{element:any={querySelector:()=>null,querySelectorAll:()=>[]};render(){return this;}async close(){return this;}}
    const game:any={version:'14.368',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},macros:{contents:[]}};
    const App=createForgeEncounterApplicationClass({game,foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}}});
    const app:any=new App();app.prepared={hash:'legacy-hash',label:'Legacy',bundle:{label:'Legacy',actors:[{key:'one',label:'One',source:'source'}],
      primaryActorKey:'one',macros:[],assets:[]},actors:[],macros:[{name:'Legacy macro',command:'legacy command',bindings:{one:'one'}}],
      requirements:[{actorKey:'one',actorName:'One',name:'GM choice',mode:'gm-assisted',gmSteps:[],conditions:[]}]};
    const context=await app._prepareContext();
    expect(context.reviewNavigation).toMatchObject({hasRuleCounts:false,gmMechanisms:1,manual:0});
    const html=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-encounter.hbs','utf8'))(context);
    expect(new JSDOM(html).window.document.querySelector('.forge-encounter-metrics')?.textContent)
      .toMatch(/固定规则\s+未提供统计[\s\S]*GM 机制\s+1/u);
  });

  test('real template escapes long hostile labels; filters and source jump preserve candidate and GM approval',async()=>{
    const document=new JSDOM('<main></main>').window.document;
    let root=document.querySelector('main') as HTMLElement;
    let renders=0,aiCalls=0,worldWrites=0;
    const revoked:string[]=[];
    class Base { element=root; render(){renders++;return this;} async close(){return this;} }
    const game:any={version:'14.368',system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},macros:{contents:[]},
      actors:{create:()=>{worldWrites++;}}};
    let opened=0;
    const App=createForgeEncounterApplicationClass({game,foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}},
      window:{URL:{revokeObjectURL:(url:string)=>revoked.push(url)}},getAiOptions:()=>{aiCalls++;throw Error('No AI request expected');},
      openAiConnection:()=>{opened++;}});
    const visibleReport=structuredClone(report);
    visibleReport.actors[0].analysis.findings=[{code:'SOURCE_BLOCKED',path:'/name',message:'Need GM check <script>alert(1)</script>',blocking:true,
      evidence:[{start:0,end:firstName.length,quote:firstName}]}];
    const app:any=new App();app.humanSource=source;app.aiReport=visibleReport;app.translationReport=[];app.reviewed=true;
    app.prepared={hash:'fixed-hash',label:'fixture',bundle:{label:'fixture',actors:bundle.actors,assets:[],macros:[],primaryActorKey:'actor-1'},actors:[],macros:[],requirements:[]};
    const candidate=app.prepared;
    const currentReport=app.currentReportText();
    app.reportDownload={url:'blob:prior-review',name:'review.json',byteLength:42};app.reportDownloadText=currentReport;
    app.textView={kind:'report',name:'review.json',text:currentReport};
    app.error='old error';app.progressDetail='old progress';
    const template=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-encounter.hbs','utf8'));
    root.innerHTML=template(await app._prepareContext());app._onRender();
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('[data-review-actor]')?.textContent).toContain(firstName);
    expect(root.querySelectorAll('.forge-encounter-issue')).toHaveLength(1);
    (root.querySelector('[data-review-issue-locate="0"]') as HTMLButtonElement).click();
    const input=root.querySelector('[name="humanSource"]') as HTMLTextAreaElement;
    expect(input.value.slice(input.selectionStart,input.selectionEnd)).toBe(firstName);
    (root.querySelector('[data-review-filter="gm"]') as HTMLButtonElement).click();
    const gm=await app._prepareContext();expect(gm.reviewNavigation.visibleIssues).toHaveLength(0);
    expect(gm.reviewCards).toHaveLength(1);
    (root.querySelector('[data-review-filter="issues"]') as HTMLButtonElement).click();
    const issues=await app._prepareContext();expect(issues.reviewNavigation.visibleIssues).toHaveLength(1);
    expect(issues.reviewCards).toHaveLength(0);
    const actorSelect=root.querySelector('[data-review-actor]') as HTMLSelectElement;
    actorSelect.value='actor-2';actorSelect.onchange!(new document.defaultView!.Event('change'));
    const scoped=await app._prepareContext();expect(scoped.reviewNavigation.visibleIssues).toHaveLength(0);
    expect(scoped.reviewNavigation.blocked).toBe(1);
    (root.querySelector('[data-action="encounter-open-ai-connection"]') as HTMLButtonElement).click();
    expect(opened).toBe(1);expect(app.prepared.hash).toBe('fixed-hash');expect(app.reviewed).toBe(true);
    expect(app.aiReport).toBe(visibleReport);
    expect(root.querySelector('[data-report-download]')).toBeTruthy();
    expect(root.querySelector('[data-encounter-view-text]')).toBeTruthy();
    expect(root.querySelector('[data-action="encounter-import"]')).toBeTruthy();
    input.focus();input.value=source+' changed';input.setSelectionRange(9,9);
    const renderBeforeEdit=renders;
    input.oninput!(new document.defaultView!.Event('input'));
    expect(document.activeElement).toBe(input);expect(input.selectionStart).toBe(9);
    expect(renders).toBe(renderBeforeEdit);
    expect(root.querySelector('[data-encounter-current-result]')?.childElementCount).toBe(0);
    expect(root.querySelector('[data-encounter-report-controls]')?.childElementCount).toBe(0);
    for(const selector of ['.forge-encounter-issue','[data-report-download]','[data-encounter-view-text]',
      '[data-action="encounter-import"]','.forge-error','[data-encounter-progress]'])expect(root.querySelector(selector)).toBeNull();
    expect(root.querySelector('[data-encounter-status]')?.textContent).toContain('旧候选与审核记录已撤下');
    expect(revoked).toEqual(['blob:prior-review']);
    expect(()=>app.currentReportText()).toThrow();expect(()=>app.currentPackageText()).toThrow();
    input.blur();
    expect(renders).toBe(renderBeforeEdit);
    const changed=await app._prepareContext();
    expect(changed.reviewNavigation.visibleIssues).toEqual([]);
    expect(changed.reviewNavigation.selectedActor).toBe('');
    expect(app.prepared).toBeUndefined();expect(app.aiReport).toBeUndefined();expect(app.reviewed).toBe(false);
    for(const name of ['humanLabel','outputLanguage']){
      app.humanSource=source;app.aiReport=visibleReport;app.prepared=candidate;app.reviewed=true;app.error='old error';app.progressDetail='old progress';
      root.innerHTML=template(await app._prepareContext());app._onRender();
      expect(root.querySelector('.forge-encounter-issue')).toBeTruthy();
      const control=root.querySelector(`[name="${name}"]`) as HTMLInputElement|HTMLSelectElement;
      if(name==='humanLabel'){control.focus();control.value='New label';control.dispatchEvent(new document.defaultView!.Event('input'));expect(document.activeElement).toBe(control);}
      else{control.value='zh-CN';control.dispatchEvent(new document.defaultView!.Event('change'));}
      expect(root.querySelector('[data-encounter-current-result]')?.childElementCount).toBe(0);
      expect(root.querySelector('[data-encounter-report-controls]')?.childElementCount).toBe(0);
      expect(root.querySelector('[data-action="encounter-report-view"]')).toBeNull();
      expect(root.querySelector('.forge-error')).toBeNull();expect(root.querySelector('[data-encounter-progress]')).toBeNull();
      expect(app.prepared).toBeUndefined();expect(app.aiReport).toBeUndefined();
      if(name==='humanLabel')expect(control.onblur).toBeNull();
    }
    expect(aiCalls).toBe(0);expect(worldWrites).toBe(0);
  });

  test('a real blur keeps the first shared-connection and clear buttons mounted for their click',async()=>{
    const document=new JSDOM('<main></main>').window.document;
    const root=document.querySelector('main') as HTMLElement;
    let renders=0,connections=0,clears=0,aiCalls=0;
    class Base{element=root;render(){renders++;
      // Model the Foundry rerender hazard: a render replaces the target button.
      const button=root.querySelector('[data-action="encounter-open-ai-connection"]');
      if(button)button.replaceWith(button.cloneNode(true));
      return this;}async close(){return this;}}
    const game:any={version:'14.368',world:{id:'world'},system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},macros:{contents:[]}};
    const App=createForgeEncounterApplicationClass({game,foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}},
      recoveryStore:{load:async()=>undefined,save:async()=>undefined,clear:async()=>{clears++;}},
      getRecoverySecrets:()=>({apiKey:'',baseUrl:''}),getAiOptions:()=>{aiCalls++;throw Error('No provider request expected');},
      openAiConnection:()=>{connections++;}});
    const app:any=new App();
    const template=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-encounter.hbs','utf8'));
    root.innerHTML=template(await app._prepareContext());app._onRender();
    const sourceInput=root.querySelector('[name="humanSource"]') as HTMLTextAreaElement;
    expect(root.querySelector('[data-encounter-clear-control]')?.hasAttribute('hidden')).toBe(true);
    sourceInput.focus();sourceInput.value='edited draft';sourceInput.setSelectionRange(6,6);
    sourceInput.dispatchEvent(new document.defaultView!.Event('input'));
    const connection=root.querySelector('[data-action="encounter-open-ai-connection"]') as HTMLButtonElement;
    const clear=root.querySelector('[data-action="encounter-clear-recovery"]') as HTMLButtonElement;
    expect(clear.closest('[data-encounter-clear-control]')?.hasAttribute('hidden')).toBe(false);
    sourceInput.blur();
    expect(root.querySelector('[data-action="encounter-open-ai-connection"]')).toBe(connection);
    expect(root.querySelector('[data-action="encounter-clear-recovery"]')).toBe(clear);
    expect(renders).toBe(0);
    connection.click();expect(connections).toBe(1);
    sourceInput.focus();sourceInput.value='new draft';sourceInput.dispatchEvent(new document.defaultView!.Event('input'));
    sourceInput.blur();clear.click();
    await Promise.resolve();await Promise.resolve();
    expect(clears).toBe(1);expect(app.humanSource).toBe('');expect(aiCalls).toBe(0);
  });

  test('uploaded formal package shows locally valid actor draft and package translation failures without an Intake report',async()=>{
    const actorSource=['---','layout: creature','name: Marsh Guard','type: aberration','size: Medium','armor_class: 12',
      'hit_points: 10','challenge: 1','speed: 30','---','### Actions',
      '- Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) piercing damage.'].join('\n');
    const command=fixedEncounterCommand({version:1,rules:[{id:'manual',kind:'gm-manual',actorKey:'guard',itemName:'Bite',parameters:{}}],legendaryRecovery:[]});
    const sourceBundle:any={schema:'fvtt-json-forge-encounter',version:1,id:'upload-review-fixture',label:'Guard encounter',
      target:{foundry:'14.364',system:'dnd5e',systemVersion:'5.3.3',effectProfile:'core'},primaryActorKey:'guard',
      actors:[{key:'guard',label:'Marsh Guard',source:actorSource,sourceHash:hashSource(actorSource)}],
      macros:[{key:'control',name:'Guard control',command,commandHash:hashSource(command),bindings:{guard:'guard'},covers:[],
        notes:`原始资料SHA-256：${hashSource(actorSource)}\nGM handles timing.`}],assets:[]};
    const raw=serializeForgeEncounterPackage(sourceBundle),bytes=new TextEncoder().encode(raw);
    const translate=(input:any)=>({texts:input.texts.map((field:any,index:number)=>{
      const protectedText=protectLocalizationText(field.source);
      let text=protectedText.restore(protectedText.text.replace(/[A-Za-z]+/gu,'译文'));
      for(const term of LOCALIZATION_TERMS)if(new RegExp(`\\b${term.english}s?\\b`,'i').test(field.source))text+=term.chinese;
      if(input.sourceRuleContext&&index<2)text=field.source;
      return{id:field.id,text};
    })});
    const rootDocument=new JSDOM('<main></main>').window.document;
    const root=rootDocument.querySelector('main') as HTMLElement;
    class Base{element=root;render(){return this;}async close(){return this;}}
    const game:any={version:'14.368',world:{id:'world'},system:{id:'dnd5e',version:'5.3.3'},user:{id:'gm',isGM:true},macros:{contents:[]}};
    const App=createForgeEncounterApplicationClass({game,foundry:{applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:(base:any)=>base}}},
      recoveryStore:{load:async()=>undefined,save:async()=>undefined,clear:async()=>undefined},getRecoverySecrets:()=>({apiKey:'',baseUrl:''}),
      getAiOptions:()=>({baseUrl:'https://provider.example/v1',apiKey:'test-key',model:'test'}),
      createEncounterIntakeProviders:()=>({translationService:{model:'test',reviewModel:'test',translate:async(input:any)=>translate(input),
        review:async()=>({verdict:'accepted',findings:[]})}} as any)});
    const app:any=new App();app.humanSource='旧 MD：Guard encounter 与 Guard control 仅同文，非此上传包的来源绑定。';await app._prepareContext();
    app.file={size:bytes.length,arrayBuffer:async()=>bytes.buffer};await app.preview();
    expect(app.prepared).toBeTruthy();expect(app.aiReport).toBeUndefined();
    const originalHash=app.prepared.hash;
    await app.translatePrepared();
    const context=await app._prepareContext();
    expect(context.reviewNavigation).toMatchObject({actorCount:1,blocked:2});
    expect(context.canReviewCandidate).toBe(false);
    expect(context.modelReviewState).toContain('没有当前 Intake 来源与 IR 报告');
    expect(context.reviewNavigation.summary).toContain('1 个角色中文草稿已通过本地校验（尚未批准），战斗包 2 个字段或规则待处理');
    expect(context.reviewNavigation.visibleIssues.map((issue:any)=>issue.field)).toEqual(['战斗包名称','控制宏名称']);
    expect(context.reviewNavigation.visibleIssues.every((issue:any)=>issue.canContinue)).toBe(true);
    expect(context.reviewNavigation.visibleIssues.every((issue:any)=>issue.canLocate===false)).toBe(true);
    expect(context.reviewNavigation.visibleIssues.every((issue:any)=>issue.locateStart===undefined)).toBe(true);
    expect(app.humanSource).toContain('旧 MD：Guard encounter');
    expect(app.prepared.hash).toBe(originalHash);expect(app.aiReport).toBeUndefined();
    root.innerHTML=Handlebars.compile(readFileSync('foundry-modules/fvtt-json-forge/src/templates/forge-encounter.hbs','utf8'))(context);
    expect(root.querySelectorAll('.forge-encounter-issue')).toHaveLength(2);
    let continued=0;app.translatePrepared=()=>{continued++;};app._onRender();
    (root.querySelector('[data-review-issue-action="0"]') as HTMLButtonElement).click();
    expect(continued).toBe(1);expect(app.prepared.hash).toBe(originalHash);
  });
});
