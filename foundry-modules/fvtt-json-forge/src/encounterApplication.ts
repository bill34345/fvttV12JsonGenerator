import { decodeForgeEncounterPackageZip, serializeForgeEncounterPackage, encodeForgeEncounterPackageZip } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { prepareForgeEncounter, type PreparedForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { localizeForgeEncounter, LOCALIZATION_TERM_NOTES, LOCALIZATION_TERMS, type EncounterLocalizationProgress } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { createEncounterIntakeProviders, generateEncounterFromHumanMarkdown, assertEncounterSecretsAbsent, readFixedEncounterConfiguration, type EncounterIntakeReport } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type { BrowserAiProviderOptions } from '@fvtt-json-generator/forge-browser-runtime/ai';
import { decodeStatusLifecycleParameters, nativeLifecycleStatusLabel } from '@fvtt-json-generator/contracts/status-lifecycle';
import { configuredConditionsApi, configuredConditionsCatalog, configuredConditionSummary } from './configuredConditions';
import { claimForgeAiJob, releaseForgeAiJob } from './aiJobGate';
import { assertExactRuntime, assertGm } from './runtime';
import { createEncounterAssetPort, importForgeEncounter, listForgeEncounterMacros, startForgeEncounterMacro, type EncounterImportResult } from './encounterRuntime';



export function createForgeEncounterApplicationClass(environment: {
  game:any;foundry:any;ui?:any;window?:any;
  getAiOptions?:(controller:AbortController)=>BrowserAiProviderOptions;
  getAiWaitPolicy?:(controller:AbortController)=>NonNullable<BrowserAiProviderOptions['waitPolicy']>;
  createEncounterIntakeProviders?:typeof createEncounterIntakeProviders;
  generateEncounterFromHumanMarkdown?:typeof generateEncounterFromHumanMarkdown;
}): any {
  const { game, foundry, ui } = environment;
  const Base = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);
  return class ForgeEncounterApplication extends Base {
    static DEFAULT_OPTIONS = { id:'fvtt-json-forge-encounter', classes:['fvtt-json-forge'],
      position:{width:850,height:850},window:{title:'Forge 战斗包导入',resizable:true} };
    static PARTS = { form:{template:'modules/fvtt-json-forge/templates/forge-encounter.hbs'} };
    private prepared?: PreparedForgeEncounter;
    private result?: EncounterImportResult;
    private file?: File;
    private busy = false;
    private importing = false;
    private reviewed = false;
    private status = '选择战斗包，预览角色、召唤物和配套宏。';
    private error = '';
    private controller?: AbortController;
    private fileRevision = 0;
    private humanSource='';
    private humanLabel='多生物战斗资料';
    private outputLanguage:'source'|'zh-CN'='source';
    private translationReport:EncounterLocalizationProgress[]=[];
    private reportDownload?:{url:string;name:string;byteLength:number};

    private aiRunning=false;
    private readingSource=false;
    private closed=false;
    private aiReport?:EncounterIntakeReport;
    private forbiddenValues:string[]=[];
    private readonly pageGuard = (event:any) => { if(this.importing){event.preventDefault();event.returnValue='';} };

    async _prepareContext() {
      let installed:any[]=[];
      try { installed=listForgeEncounterMacros(game); } catch(error){ this.error=message(error); }
      let configuredConditions:any[]=[];
      try { configuredConditions=configuredConditionsCatalog(game).map(definition=>({...definition,summary:configuredConditionSummary(definition)})); }
      catch(error){this.error=message(error);}
      return {busy:this.busy, importing:this.importing, reviewed:this.reviewed, ready:!!this.prepared,
        configuredConditions,canConfigureConditions:typeof game.modules?.get?.('fvtt-custom-conditions')?.api?.configuredConditions?.openEditor==='function',
        humanSource:this.humanSource,humanLabel:this.humanLabel,aiRunning:this.aiRunning,
        chineseSelected:this.outputLanguage==='zh-CN',localized:!!this.prepared?.bundle.localization,
        terminologyNotes:LOCALIZATION_TERM_NOTES,terminologyReferences:[...new Set(LOCALIZATION_TERMS.map(term=>term.reference).filter(reference=>reference.startsWith('https:')))],
        localPage:['127.0.0.1','localhost','[::1]'].includes((globalThis as any).location?.hostname),
        hasReport:!!this.aiReport||this.translationReport.length>0||!!this.prepared?.bundle.localization,hasPackage:!!this.prepared,aiFindings:this.aiReport?.findings,
        reportDownload:this.reportDownload,
        status:this.status,error:this.error,fileName:this.file?.name,
        label:this.prepared?.label,packageHash:this.prepared?.hash,
        actors:this.prepared?.actors.map(a=>({key:a.key,name:a.name,isPrimary:a.key===this.prepared!.bundle.primaryActorKey,assisted:a.status==='needs_review',
          hp:(a.artifact as any).system.attributes.hp.max,ac:(a.artifact as any).system.attributes.ac.flat,cr:(a.artifact as any).system.details.cr,
          biography:displayText((a.artifact as any).system.details.biography?.value),
          abilities:((a.artifact as any).items??[]).map((item:any)=>({name:item.name,description:displayText(item.system?.description?.value)})),
          source:this.prepared!.bundle.actors.find(s=>s.key===a.key)!.source,artifact:JSON.stringify(a.artifact,null,2)})),
        macros:this.prepared?.macros.map(m=>{
          const config=readFixedEncounterConfiguration(m.command);
          const labels={'save-summon':'能力结算后召唤','turn-start-area':'自己的回合开始触发','staged-corruption':'腐化与力竭分支','threshold-ward':'伤害阈值守护','ward-break':'消耗次数并使守护破裂','save-failure-effect':'豁免失败状态与期限','status-lifecycle':'命中状态与再次豁免','gm-activity-lock':'GM能力可用性控制','gm-manual':'GM裁定（查看来源规则）'};
          return {...m,fixed:!!config,capabilities:config?.rules.map(r=>({name:labels[r.kind],actor:r.actorKey,item:r.itemName,
            summary:r.kind==='status-lifecycle'?statusLifecycleSummary(r.parameters):undefined,parameters:JSON.stringify(r.parameters,null,2)})),
            bindingsText:Object.entries(m.bindings).map(([name,key])=>`${name} → ${key}`).join('；')};
        }),
        requirements:this.prepared?.requirements.map(requirement=>({...requirement,
          mode:requirement.mode==='gm-assisted'?'GM辅助处理':requirement.mode==='external-rule'?'外部规则裁定':requirement.mode,
          conditions:requirement.conditions.filter(condition=>!/^encounter-(?:staged|manual)(?::|-)/u.test(condition)),
        })),assetCount:this.prepared?.bundle.assets.length ?? 0,
        assets:this.prepared?.bundle.assets.map(a=>({fileName:a.fileName,sha256:a.sha256,
          targetsText:a.targets.map(t=>`${t.actorKey}：${t.fields.map(f=>f==='img'?'角色头像':'Token图片').join('、')}`).join('；')})),
        documents:this.result?.documents.map(d=>({...d,isActor:d.kind==='Actor'})),installed,
        canImport:!!this.prepared && this.reviewed && !this.busy && !this.result,
      };
    }
    _onRender() {
      const root=this.element as HTMLElement;
      const invalidate=()=>{this.clearReportDownload();this.prepared=undefined;this.result=undefined;this.aiReport=undefined;this.translationReport=[];this.reviewed=false;this.file=undefined;this.fileRevision++;
        const button=root.querySelector<HTMLButtonElement>('[data-action="encounter-import"]');if(button)button.disabled=true;};
      const source=root.querySelector<HTMLTextAreaElement>('[name="humanSource"]');
      if(source)source.oninput=()=>{if(this.busy)return;this.humanSource=source.value;invalidate();};
      const label=root.querySelector<HTMLInputElement>('[name="humanLabel"]');
      if(label)label.oninput=()=>{if(this.busy)return;this.humanLabel=label.value;invalidate();};
      const language=root.querySelector<HTMLSelectElement>('[name="outputLanguage"]');
      if(language)language.onchange=()=>{if(this.busy)return;this.outputLanguage=language.value==='zh-CN'?'zh-CN':'source';invalidate();};
      const sourceFile=root.querySelector<HTMLInputElement>('[name="humanSourceFile"]');
      if(sourceFile)sourceFile.onchange=()=>{if(this.busy)return;const chosen=sourceFile.files?.[0];if(!chosen)return;
        invalidate();const revision=this.fileRevision;
        this.humanSource='';if(source)source.value='';
        if(chosen.size>96000){this.error='原始MD文件过大。';void this.render();return;}
        this.busy=true;this.readingSource=true;this.status='正在读取原始MD文件。';void this.render();
        void chosen.text().then(text=>{if(this.closed||revision!==this.fileRevision)return;this.humanSource=text;this.humanLabel=chosen.name.replace(/\.(md|txt)$/i,'');this.status='原始资料已读取，可以开始AI生成。';})
          .catch(()=>{if(revision===this.fileRevision)this.error='无法读取原始MD文件。';})
          .finally(()=>{if(revision!==this.fileRevision)return;this.busy=false;this.readingSource=false;if(!this.closed)void this.render();});};
      const file=root.querySelector<HTMLInputElement>('[name="encounterFile"]');
      if(file)file.onchange=()=>{if(this.busy)return;this.clearReportDownload();this.file=file.files?.[0];this.fileRevision++;this.prepared=undefined;this.result=undefined;this.aiReport=undefined;this.translationReport=[];this.reviewed=false;this.error='';void this.render();};
      const reviewed=root.querySelector<HTMLInputElement>('[name="encounterReviewed"]');
      if(reviewed)reviewed.onchange=()=>{this.reviewed=reviewed.checked;const button=root.querySelector<HTMLButtonElement>('[data-action="encounter-import"]');if(button)button.disabled=!this.reviewed||this.busy||!!this.result;};
      const bind=(action:string,fn:()=>unknown)=>{const b=root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);if(b)b.onclick=()=>void fn();};
      bind('encounter-preview',()=>this.preview());
      bind('encounter-localize',()=>this.translatePrepared());
      bind('encounter-ai',()=>this.generateFromHuman());
      bind('encounter-ai-stop',()=>this.controller?.abort());
      bind('encounter-configure-conditions',async()=>{
        assertGm(game);assertExactRuntime(game);
        try { await game.modules?.get?.('fvtt-custom-conditions')?.api?.configuredConditions?.openEditor(); }
        catch(error){this.error=message(error);void this.render();}
      });
      bind('encounter-export',async()=>{if(this.prepared)download(`${this.prepared.bundle.id}.forge-encounter.zip`,await encodeForgeEncounterPackageZip(this.prepared.bundle),'application/zip');});
      bind('encounter-report',()=>this.exportReport());
      const reportLink=root.querySelector<HTMLAnchorElement>('[data-report-download]');
      if(reportLink)reportLink.onclick=preserveNativeDownload;
      bind('encounter-import',()=>this.apply());
      bind('encounter-refresh',()=>this.render());
      bind('encounter-refresh-conditions',()=>this.render());
      for(const button of root.querySelectorAll<HTMLButtonElement>('[data-start-macro]'))button.onclick=()=>void this.start(button.dataset.startMacro!);
      for(const button of root.querySelectorAll<HTMLButtonElement>('[data-open-macro]'))button.onclick=()=>{
        assertGm(game);assertExactRuntime(game);game.macros.get(button.dataset.openMacro)?.sheet?.render(true);
      };
      for(const button of root.querySelectorAll<HTMLButtonElement>('[data-open-actor]'))button.onclick=()=>{
        assertGm(game);assertExactRuntime(game);game.actors.get(button.dataset.openActor)?.sheet?.render(true);
      };
      const win=environment.window??(globalThis as any).window;
      win?.removeEventListener?.('beforeunload',this.pageGuard);win?.addEventListener?.('beforeunload',this.pageGuard);
    }
    private async generateFromHuman(){
      if(this.busy||this.readingSource||this.closed)return;
      if(!claimForgeAiJob(this)){this.error='已有Forge AI任务运行，请等待完成。';void this.render();return;}
      const controller=new AbortController();this.controller=controller;
      const source=this.humanSource;const label=this.humanLabel;const revision=this.fileRevision;
      this.clearReportDownload();this.busy=true;this.aiRunning=true;this.error='';this.prepared=undefined;this.result=undefined;this.reviewed=false;this.aiReport=undefined;this.translationReport=[];this.file=undefined;
      this.status='正在从原始资料生成并审核战斗包；不会创建世界文档。';void this.render();
      try{
        assertGm(game);assertExactRuntime(game);
        const options=environment.getAiOptions?.(controller);
        if(!options)throw new Error('请先在Intake连接页配置AI服务。');
        this.forbiddenValues=[options.apiKey,options.baseUrl].filter(Boolean);
        assertEncounterSecretsAbsent(source,this.forbiddenValues);
        assertEncounterSecretsAbsent(label,this.forbiddenValues);
        const providers=(environment.createEncounterIntakeProviders??createEncounterIntakeProviders)(options,controller.signal);
        const conditionCatalog=configuredConditionsCatalog(game);
        assertEncounterSecretsAbsent(JSON.stringify(conditionCatalog),this.forbiddenValues);
        const output=await (environment.generateEncounterFromHumanMarkdown??generateEncounterFromHumanMarkdown)({source,label,...providers,conditionCatalog,outputLanguage:this.outputLanguage,signal:controller.signal,
          onProgress:message=>{if(this.closed||this.controller!==controller)return;this.status=message;const status=(this.element as HTMLElement)?.querySelector('[data-encounter-status]');if(status)status.textContent=message;},
          onReport:report=>{assertEncounterSecretsAbsent(JSON.stringify(report),this.forbiddenValues);if(!this.closed&&this.controller===controller)this.aiReport=report;}});
        controller.signal.throwIfAborted();
        if(this.closed||this.controller!==controller||revision!==this.fileRevision||source!==this.humanSource)throw new Error('原始资料已改变，请重新生成。');
        assertGm(game);assertExactRuntime(game);
        if(!output.prepared){this.status='AI生成尚未通过审核，没有创建世界文档。';this.error=output.report.findings.join('\n');return;}
        assertEncounterSecretsAbsent(serializeForgeEncounterPackage(output.prepared.bundle),this.forbiddenValues);
        this.prepared=output.prepared;
        this.status=`已审核${output.prepared.actors.length}个生物与自动化配置，工具已生成固定控制入口。请核对下方规则后确认导入。`;
      }catch(error){this.error=controller.signal.aborted?'已取消AI生成，没有创建世界文档。':message(error);this.status='生成未完成。';}
      finally{releaseForgeAiJob(this);this.busy=false;this.aiRunning=false;if(!this.closed)void this.render();}
    }
    private async translatePrepared(){
      if(this.busy||this.closed||!this.prepared||this.prepared.bundle.localization)return;
      if(!claimForgeAiJob(this)){this.error='已有Forge AI任务运行，请等待完成。';void this.render();return;}
      const original=this.prepared;const revision=this.fileRevision;
      const priorReviews=this.translationReport;
      const controller=new AbortController();this.controller=controller;
      this.clearReportDownload();this.busy=true;this.aiRunning=true;this.reviewed=false;this.result=undefined;this.error='';this.translationReport=[];
      this.status='正在翻译并独立核对中文含义；英文来源保留供审核。';void this.render();
      try{
        assertGm(game);assertExactRuntime(game);
        const options=environment.getAiOptions?.(controller);
        if(!options)throw new Error('请先在Intake连接页配置AI服务。');
        this.forbiddenValues=[options.apiKey,options.baseUrl].filter(Boolean);
        assertEncounterSecretsAbsent(serializeForgeEncounterPackage(original.bundle),this.forbiddenValues);
        const {translationService}=createEncounterIntakeProviders(options,controller.signal);
        const prepared=await localizeForgeEncounter({bundle:original.bundle,service:translationService,signal:controller.signal,priorReviews,
          onProgress:message=>{this.status=message;const status=(this.element as HTMLElement)?.querySelector('[data-encounter-status]');if(status)status.textContent=message;},
          onReview:entry=>{assertEncounterSecretsAbsent(JSON.stringify(entry),this.forbiddenValues);const index=this.translationReport.findIndex(prior=>prior.actorKey===entry.actorKey);if(index<0)this.translationReport.push(entry);else this.translationReport[index]=entry;},
        });
        controller.signal.throwIfAborted();
        if(this.closed||revision!==this.fileRevision||this.prepared!==original)throw new Error('来源已改变，请重新翻译并审核。');
        assertGm(game);assertExactRuntime(game);
        assertEncounterSecretsAbsent(serializeForgeEncounterPackage(prepared.bundle),this.forbiddenValues);
        this.prepared=prepared;this.status='中文译文已通过术语、数值和独立含义审核，请核对中文规则后导入。';
      }catch(error){this.error=controller.signal.aborted?'中文翻译已取消。':message(error);this.status='中文候选未通过；下方仍为原语言包。';}
      finally{releaseForgeAiJob(this);this.busy=false;this.aiRunning=false;if(!this.closed)void this.render();}
    }
    private async preview() {
      if(this.busy||!this.file)return;
      this.clearReportDownload();this.busy=true;this.error='';this.prepared=undefined;this.result=undefined;this.reviewed=false;
      this.status='正在校验战斗包，并通过正式工作流重新生成角色；不创建世界文档。';
      const revision=this.fileRevision;const file=this.file;this.controller=new AbortController();void this.render();
      try {
        assertGm(game);assertExactRuntime(game);
        if(file.size>32*1024*1024)throw new Error('战斗包不能超过32 MiB。');
        const bytes=new Uint8Array(await file.arrayBuffer());
        const text=bytes[0]===0x50&&bytes[1]===0x4b
          ? serializeForgeEncounterPackage(await decodeForgeEncounterPackageZip(bytes)) : new TextDecoder('utf-8',{fatal:true}).decode(bytes);
        const prepared=await prepareForgeEncounter(text,this.controller.signal);
        if(revision!==this.fileRevision)throw new Error('文件已改变，请重新预览。');
        assertGm(game);assertExactRuntime(game);this.prepared=prepared;
        this.status=`预览完成：${prepared.actors.length}个角色、${prepared.bundle.macros.length}个宏。请核对来源、宏代码和GM操作边界。`;
      }catch(error){this.error=message(error);this.status='预览未通过；没有创建世界文档。';}
      finally{this.busy=false;void this.render();}
    }
    private clearReportDownload() {
      const prior=this.reportDownload;
      this.reportDownload=undefined;
      if(prior)(environment.window?.URL??globalThis.URL).revokeObjectURL(prior.url);
    }
    private exportReport() {
      if(this.closed||this.busy||(!this.aiReport&&!this.translationReport.length&&!this.prepared?.bundle.localization))return;
      this.error='';
      try {
        this.clearReportDownload();
        const text=JSON.stringify(this.translationReport.length||this.prepared?.bundle.localization
          ?{intake:this.aiReport??null,localization:this.translationReport.length?this.translationReport:this.prepared?.bundle.localization,sourcePackage:this.prepared?.bundle}:this.aiReport,null,2);
        assertEncounterSecretsAbsent(text,this.forbiddenValues);
        const win=environment.window??globalThis;
        const urlApi=win.URL??globalThis.URL,doc=win.document??(globalThis as any).document,BlobClass=win.Blob??globalThis.Blob;
        if(!urlApi?.createObjectURL||!urlApi?.revokeObjectURL||!doc?.createElement||!doc.body)throw new Error('当前浏览器不能准备审核文件。');
        const blob=new BlobClass([text],{type:'application/json'});
        const name='encounter-intake-review.json',url=urlApi.createObjectURL(blob);
        this.reportDownload={url,name,byteLength:blob.size};
        const link=doc.createElement('a');link.href=url;link.download=name;link.hidden=true;link.onclick=preserveNativeDownload;doc.body.appendChild(link);
        try{link.click();}finally{link.remove();}
        this.status='审核文件已生成；如浏览器未开始下载，请点击下方“下载审核文件”链接。';
      }catch(error){this.error=message(error);this.status='审核文件未能下载，请根据错误检查后重试。';}
      finally{if(!this.closed)void this.render();}
    }
    private async apply() {
      if(this.busy||!this.prepared||!this.reviewed||this.result)return;
      this.busy=true;this.importing=true;this.error='';this.status='正在导入并回读核对，请保持页面打开。';void this.render();
      try {
        for(const macro of this.prepared.macros){
          const config=readFixedEncounterConfiguration(macro.command);
          for(const rule of config?.rules??[])if(rule.kind==='status-lifecycle'){
            const parameters=decodeStatusLifecycleParameters(rule.parameters);
            if(parameters.definition)configuredConditionsApi(game,parameters.definition);
          }
        }
        this.result=await importForgeEncounter({game,prepared:this.prepared,reviewed:this.reviewed,assets:createEncounterAssetPort(foundry,game)});
        this.status=this.prepared.bundle.macros.length?'角色和宏已导入。配套宏尚未运行，请点击下方“启动战斗控制”。':'角色已导入。本包没有配套宏。';
      }catch(error){this.error=message(error);this.status='导入未完成，请根据错误检查后重试。';}
      finally{this.busy=false;this.importing=false;void this.render();}
    }
    private async start(id:string) {
      if(this.busy)return;
      this.busy=true;this.error='';void this.render();
      try {await startForgeEncounterMacro(game,id);this.status='已调用战斗控制宏，请确认它显示“已启用”。固定自动化启用后会在刷新时恢复；旧式专用宏仍需手动重启。';}
      catch(error){this.error=message(error);}
      finally{this.busy=false;void this.render();}
    }
    async close(options?:any) {
      if(this.importing){ui?.notifications?.warn('正在导入并回读，请等待当前操作完成。');return this;}
      this.closed=true;this.clearReportDownload();this.controller?.abort();const win=environment.window??(globalThis as any).window;win?.removeEventListener?.('beforeunload',this.pageGuard);
      return super.close(options);
    }
  };
}
function message(error:unknown):string{return error instanceof Error?error.message:String(error);}
function statusLifecycleSummary(parameters:Record<string,unknown>):string{
  // readFixedEncounterConfiguration already validated this closed data contract.
  const p=parameters as any;
  const abilities:Record<string,string>={str:'力量',dex:'敏捷',con:'体质',int:'智力',wis:'感知',cha:'魅力'};
  return `命中后施加${p.definition?.name??nativeLifecycleStatusLabel(p.status)}，持续${p.duration.value}${p.duration.unit==='minute'?'分钟':'轮'}。目标每回合结束时${p.repeatSave.optional?'可':'须'}进行DC ${p.repeatSave.dc}的${abilities[p.repeatSave.ability]}豁免，成功解除本来源效果。${p.definition?configuredConditionSummary(p.definition)+'。':''}使用前标记一个目标并启用战斗控制。`;
}
// Core 14.368 promotes document-level hyperlinks to new tabs, including downloads.
function preserveNativeDownload(event:Event):void{event.stopPropagation();}
function displayText(value:unknown):string{return typeof value==='string'?value.replace(/<\/(?:p|li|div|h[1-6])>|<br\s*\/?\s*>/giu,'\n').replace(/<[^>]*>/gu,'').replace(/&nbsp;/gu,' ').replace(/&amp;/gu,'&').trim():'';}
function download(name:string,content:string|Uint8Array,type:string){
  const url=URL.createObjectURL(new Blob([content as any],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
