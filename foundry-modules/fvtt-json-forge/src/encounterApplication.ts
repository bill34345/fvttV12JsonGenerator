import { decodeForgeEncounterPackageZip, serializeForgeEncounterPackage, encodeForgeEncounterPackageZip } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { prepareForgeEncounter, type PreparedForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { localizeForgeEncounter, LOCALIZATION_TERM_NOTES, LOCALIZATION_TERMS, type EncounterLocalizationProgress } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { createEncounterIntakeProviders, generateEncounterFromHumanMarkdown, assertEncounterSecretsAbsent, readFixedEncounterConfiguration, type EncounterIntakeReport } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type { BrowserAiProviderOptions } from '@fvtt-json-generator/forge-browser-runtime/ai';
import { decodeStatusLifecycleParameters } from '@fvtt-json-generator/contracts/status-lifecycle';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { configuredConditionsApi, configuredConditionsCatalog, configuredConditionSummary } from './configuredConditions';
import { encounterReviewCards, statusLifecycleSummary } from './encounterReviewCards';
import { decodeEncounterRecovery, serializeEncounterRecovery, IndexedDbEncounterRecoveryStore, type EncounterRecoveryStore, type EncounterRecoverySnapshot } from './encounterRecoveryStore';
import { readForgeSessionSettings } from './settings';
import { claimForgeAiJob, releaseForgeAiJob } from './aiJobGate';
import { assertExactRuntime, assertGm } from './runtime';
import { createEncounterAssetPort, importForgeEncounter, listForgeEncounterMacros, startForgeEncounterMacro, type EncounterImportResult } from './encounterRuntime';



export function createForgeEncounterApplicationClass(environment: {
  game:any;foundry:any;ui?:any;window?:any;
  getAiOptions?:(controller:AbortController)=>BrowserAiProviderOptions;
  getRecoverySecrets?:()=>{apiKey:string;baseUrl:string;otherKeys?:string[]};
  getAiWaitPolicy?:(controller:AbortController)=>NonNullable<BrowserAiProviderOptions['waitPolicy']>;
  createEncounterIntakeProviders?:typeof createEncounterIntakeProviders;
  generateEncounterFromHumanMarkdown?:typeof generateEncounterFromHumanMarkdown;
  recoveryStore?:EncounterRecoveryStore;
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
    private textView?:{kind:'report'|'package';name:string;text:string};

    private aiRunning=false;
    private readingSource=false;
    private closed=false;
    private aiReport?:EncounterIntakeReport;
    private forbiddenValues:string[]=[];
    private recoveryStore?:EncounterRecoveryStore;
    private recoveryScope?:string;
    private recoveryLoadPromise?:Promise<void>;
    private recoveryReport?:EncounterIntakeReport;
    private recoveryPackage?:string;
    private recoveredReview=false;
    private recoveryCatalogHash?:string;
    private checkpointEnabled=false;
    private saveTimer?:ReturnType<typeof setTimeout>;
    private pendingSave:Promise<void>=Promise.resolve();
    private progressDetail='';
    private readonly pageGuard = (event:any) => { if(this.importing){event.preventDefault();event.returnValue='';} };

    async _prepareContext() {
      await this.loadRecovery();
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
        textView:this.textView,reportViewText:this.textView?.kind==='report'?this.textView.text:undefined,
        recoveryAvailable:!!this.recoveryReport?.actors.some(actor=>actor.analysis?.ir) && !this.busy && !this.prepared,
        recoveryPackageAvailable:!!this.recoveryPackage&&!this.prepared&&!this.busy,
        hasLocalRecovery:!!this.recoveryStore&&(!!this.humanSource||!!this.recoveryReport||!!this.recoveryPackage||this.status.startsWith('本地任务恢复不可用')||this.status.startsWith('此前任务')),
        recoveryDraftCount:this.recoveryReport?.actors.filter(actor=>actor.analysis?.ir).length??0,
        recoveredReview:this.recoveredReview,
        progressDetail:this.progressDetail,
        reviewCards:encounterReviewCards(this.prepared?this.aiReport:undefined,this.prepared?.bundle.localization),
        reviewEvidenceUnavailable:!!this.prepared&&!this.aiReport?.automation?.selection,
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
      const invalidate=(keepDraft=false)=>{this.clearReportPresentation();this.prepared=undefined;this.result=undefined;this.aiReport=undefined;this.recoveryPackage=undefined;this.recoveredReview=false;if(!keepDraft)this.recoveryReport=undefined;this.translationReport=[];this.reviewed=false;this.file=undefined;this.fileRevision++;this.queueRecoverySave();
        const button=root.querySelector<HTMLButtonElement>('[data-action="encounter-import"]');if(button)button.disabled=true;};
      const source=root.querySelector<HTMLTextAreaElement>('[name="humanSource"]');
      if(source)source.oninput=()=>{if(this.busy)return;this.humanSource=source.value;invalidate();};
      const label=root.querySelector<HTMLInputElement>('[name="humanLabel"]');
      if(label)label.oninput=()=>{if(this.busy)return;this.humanLabel=label.value;invalidate(true);};
      const language=root.querySelector<HTMLSelectElement>('[name="outputLanguage"]');
      if(language)language.onchange=()=>{if(this.busy)return;this.outputLanguage=language.value==='zh-CN'?'zh-CN':'source';invalidate(true);};
      const sourceFile=root.querySelector<HTMLInputElement>('[name="humanSourceFile"]');
      if(sourceFile)sourceFile.onchange=()=>{if(this.busy)return;const chosen=sourceFile.files?.[0];if(!chosen)return;
        invalidate();const revision=this.fileRevision;
        this.humanSource='';if(source)source.value='';
        if(chosen.size>96000){this.error='原始MD文件过大。';void this.render();return;}
        this.busy=true;this.readingSource=true;this.status='正在读取原始MD文件。';void this.render();
        void chosen.text().then(text=>{if(this.closed||revision!==this.fileRevision)return;this.humanSource=text;this.humanLabel=chosen.name.replace(/\.(md|txt)$/i,'');this.status='原始资料已读取，可以开始AI生成。';this.queueRecoverySave();})
          .catch(()=>{if(revision===this.fileRevision)this.error='无法读取原始MD文件。';})
          .finally(()=>{if(revision!==this.fileRevision)return;this.busy=false;this.readingSource=false;if(!this.closed)void this.render();});};
      const file=root.querySelector<HTMLInputElement>('[name="encounterFile"]');
      if(file)file.onchange=()=>{if(this.busy)return;this.clearReportPresentation();this.file=file.files?.[0];this.fileRevision++;this.prepared=undefined;this.result=undefined;this.aiReport=undefined;this.recoveryReport=undefined;this.translationReport=[];this.reviewed=false;this.error='';void this.render();};
      const reviewed=root.querySelector<HTMLInputElement>('[name="encounterReviewed"]');
      if(reviewed)reviewed.onchange=()=>{this.reviewed=reviewed.checked;const button=root.querySelector<HTMLButtonElement>('[data-action="encounter-import"]');if(button)button.disabled=!this.reviewed||this.busy||!!this.result;};
      const bind=(action:string,fn:()=>unknown)=>{const b=root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);if(b)b.onclick=()=>void fn();};
      bind('encounter-preview',()=>this.preview());
      bind('encounter-localize',()=>this.translatePrepared());
      bind('encounter-ai',()=>this.generateFromHuman());
      bind('encounter-resume',()=>this.generateFromHuman(true));
      bind('encounter-recover-preview',()=>this.previewRecovered());
      bind('encounter-clear-recovery',()=>this.clearCurrentRecovery());
      bind('encounter-ai-stop',()=>this.controller?.abort());
      bind('encounter-configure-conditions',async()=>{
        assertGm(game);assertExactRuntime(game);
        try { await game.modules?.get?.('fvtt-custom-conditions')?.api?.configuredConditions?.openEditor(); }
        catch(error){this.error=message(error);void this.render();}
      });
      bind('encounter-export',async()=>{if(this.prepared)download(`${this.prepared.bundle.id}.forge-encounter.zip`,await encodeForgeEncounterPackageZip(this.prepared.bundle),'application/zip');});
      bind('encounter-report',()=>this.exportReport());
      bind('encounter-report-view',()=>this.viewReport());
      bind('encounter-package-view',()=>this.viewPackage());
      bind('encounter-text-copy',()=>this.copyVisibleText());
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
    private async generateFromHuman(resume=false){
      if(this.busy||this.readingSource||this.closed)return;
      await this.loadRecovery();
      if(!claimForgeAiJob(this)){this.error='已有Forge AI任务运行，请等待完成。';void this.render();return;}
      const controller=new AbortController();this.controller=controller;
      const source=this.humanSource;const label=this.humanLabel;const revision=this.fileRevision;
      const prior=this.recoveryReport;
      this.clearReportPresentation();this.busy=true;this.aiRunning=true;this.error='';this.prepared=undefined;this.recoveryPackage=undefined;this.recoveredReview=false;this.result=undefined;this.reviewed=false;this.aiReport=undefined;this.translationReport=[];this.file=undefined;
      this.progressDetail=resume?'正在核对保存的草稿身份；有效 IR 将重新验证和独立审核。':'准备识别生物与生成规则。';
      this.status='正在从原始资料生成并审核战斗包；不会创建世界文档。';void this.render();
      try{
        assertGm(game);assertExactRuntime(game);
        const options=environment.getAiOptions?.(controller);
        if(!options)throw new Error('请先在Intake连接页配置AI服务。');
        this.rememberSecrets(options);
        assertEncounterSecretsAbsent(source,this.forbiddenValues);
        assertEncounterSecretsAbsent(label,this.forbiddenValues);
        this.checkpointEnabled=true;
        const conditionCatalog=configuredConditionsCatalog(game);
        assertEncounterSecretsAbsent(JSON.stringify(conditionCatalog),this.forbiddenValues);
        const catalogHash=hashSource(JSON.stringify(conditionCatalog));
        let drafts:NonNullable<Parameters<typeof generateEncounterFromHumanMarkdown>[0]['drafts']>|undefined;
        let draftParentHash:string|undefined;
        if(resume){
          if(!prior || prior.source!==source || prior.sourceHash!==hashSource(source) || this.recoveryCatalogHash!==catalogHash)
            throw new Error('来源或自定义状态目录已改变，旧草稿不能继续；请重新生成。');
          drafts=prior.actors.filter(actor=>actor.analysis?.ir).map(actor=>({key:actor.key,source:actor.source,ir:actor.analysis.ir!}));
          if(!drafts.length)throw new Error('保存的任务尚无可继续的 IR 草稿。');
          draftParentHash=hashSource(JSON.stringify(prior));
        }
        this.recoveryCatalogHash=catalogHash;
        const providerOptions=options.waitPolicy?{...options,onRetry:(retry:Parameters<NonNullable<typeof options.onRetry>>[0])=>{
          options.onRetry?.(retry);
          if(this.closed||this.controller!==controller)return;
          this.progressDetail=`${encounterRetryLabel(retry.stage)}请求第 ${retry.attempt} 次尝试（${retry.code}）；只重试当前请求。`;
          void this.render();
        }}:options;
        const providers=(environment.createEncounterIntakeProviders??createEncounterIntakeProviders)(providerOptions,controller.signal);
        const output=await (environment.generateEncounterFromHumanMarkdown??generateEncounterFromHumanMarkdown)({source,label,...providers,conditionCatalog,outputLanguage:this.outputLanguage,drafts,draftParentHash,signal:controller.signal,
          onProgress:message=>{if(this.closed||this.controller!==controller||revision!==this.fileRevision||source!==this.humanSource)return;this.status=message;this.progressDetail=message;const status=(this.element as HTMLElement)?.querySelector('[data-encounter-status]');if(status)status.textContent=message;const detail=(this.element as HTMLElement)?.querySelector('[data-encounter-progress]');if(detail)detail.textContent=message;},
          onReport:report=>{assertEncounterSecretsAbsent(JSON.stringify(report),this.forbiddenValues);if(!this.closed&&this.controller===controller&&revision===this.fileRevision&&source===this.humanSource){this.aiReport=report;this.recoveryReport=report;this.queueRecoverySave();}}});
        if(this.closed||this.controller!==controller||revision!==this.fileRevision||source!==this.humanSource)throw new Error('原始资料已改变，请重新生成。');
        assertGm(game);assertExactRuntime(game);
        this.aiReport=output.report;this.recoveryReport=output.report;this.queueRecoverySave();
        if(!output.prepared){this.status='AI生成尚未通过审核，没有创建世界文档。';this.error=output.report.findings.join('\n');return;}
        assertEncounterSecretsAbsent(serializeForgeEncounterPackage(output.prepared.bundle),this.forbiddenValues);
        this.prepared=output.prepared;
        this.translationReport=output.report.localization??[];
        this.recoveryPackage=serializeForgeEncounterPackage(output.prepared.bundle);
        this.queueRecoverySave();
        this.status=output.report.outputLanguage==='source'&&this.outputLanguage==='zh-CN'
          ? '中文候选未通过；已审核的原语言包保留供核对。可只重试翻译。'
          : `已审核${output.prepared.actors.length}个生物与自动化配置，工具已生成固定控制入口。请核对下方规则后确认导入。`;
        this.error=output.report.findings.join('\n');
      }catch(error){if(!this.recoveryReport&&prior&&resume)this.recoveryReport=prior;this.error=controller.signal.aborted?'已取消AI生成，没有创建世界文档。':message(error);this.status='生成未完成；已保存的有效草稿可继续。';this.queueRecoverySave();}
      finally{releaseForgeAiJob(this);this.busy=false;this.aiRunning=false;if(!this.closed)void this.render();}
    }
    private async translatePrepared(){
      if(this.busy||this.closed||!this.prepared||this.prepared.bundle.localization)return;
      if(!claimForgeAiJob(this)){this.error='已有Forge AI任务运行，请等待完成。';void this.render();return;}
      const original=this.prepared;const revision=this.fileRevision;
      const priorReviews=this.translationReport;
      const controller=new AbortController();this.controller=controller;
      this.clearReportPresentation();this.busy=true;this.aiRunning=true;this.reviewed=false;this.result=undefined;this.error='';this.translationReport=[];
      this.status='正在翻译并独立核对中文含义；英文来源保留供审核。';void this.render();
      try{
        assertGm(game);assertExactRuntime(game);
        const options=environment.getAiOptions?.(controller);
        if(!options)throw new Error('请先在Intake连接页配置AI服务。');
        this.rememberSecrets(options);
        assertEncounterSecretsAbsent(serializeForgeEncounterPackage(original.bundle),this.forbiddenValues);
        const {translationService}=(environment.createEncounterIntakeProviders??createEncounterIntakeProviders)(options,controller.signal);
        const prepared=await localizeForgeEncounter({bundle:original.bundle,service:translationService,signal:controller.signal,priorReviews,
          onProgress:message=>{this.status=message;const status=(this.element as HTMLElement)?.querySelector('[data-encounter-status]');if(status)status.textContent=message;},
          onReview:entry=>{assertEncounterSecretsAbsent(JSON.stringify(entry),this.forbiddenValues);const index=this.translationReport.findIndex(prior=>prior.actorKey===entry.actorKey);if(index<0)this.translationReport.push(entry);else this.translationReport[index]=entry;this.queueRecoverySave();},
        });
        controller.signal.throwIfAborted();
        if(this.closed||revision!==this.fileRevision||this.prepared!==original)throw new Error('来源已改变，请重新翻译并审核。');
        assertGm(game);assertExactRuntime(game);
        assertEncounterSecretsAbsent(serializeForgeEncounterPackage(prepared.bundle),this.forbiddenValues);
        this.prepared=prepared;this.recoveryPackage=serializeForgeEncounterPackage(prepared.bundle);
        if(this.recoveryReport){
          this.recoveryReport={...this.recoveryReport,packageHash:prepared.hash,outputLanguage:'zh-CN',localization:this.translationReport};
          this.aiReport=this.recoveryReport;
        }
        this.queueRecoverySave();this.status='中文译文已通过术语、数值和独立含义审核，请核对中文规则后导入。';
      }catch(error){this.error=controller.signal.aborted?'中文翻译已取消。':message(error);this.status='中文候选未通过；下方仍为原语言包。';this.queueRecoverySave();}
      finally{releaseForgeAiJob(this);this.busy=false;this.aiRunning=false;if(!this.closed)void this.render();}
    }
    private async preview() {
      if(this.busy||!this.file)return;
      this.clearReportPresentation();this.busy=true;this.error='';this.prepared=undefined;this.result=undefined;this.reviewed=false;
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
    private async previewRecovered():Promise<void> {
      if(this.busy||this.closed||!this.recoveryPackage||!this.recoveryReport)return;
      const revision=this.fileRevision,serialized=this.recoveryPackage,report=this.recoveryReport;
      this.clearReportPresentation();
      this.busy=true;this.reviewed=false;this.result=undefined;this.error='';this.status='正在重新校验本地保存的战斗包；不会请求 AI 或创建世界文档。';void this.render();
      const controller=new AbortController();this.controller=controller;
      try {
        const binding=this.recoveryBinding();
        if(this.recoveryCatalogHash!==binding.catalogHash||report.source!==this.humanSource||report.sourceHash!==hashSource(this.humanSource))
          throw new Error('来源或自定义状态目录已改变，保存的候选不能预览。');
        assertEncounterSecretsAbsent(serialized,this.forbiddenValues);
        const prepared=await prepareForgeEncounter(serialized,controller.signal);
        if(this.closed||revision!==this.fileRevision||this.controller!==controller||prepared.hash!==report.packageHash)
          throw new Error('保存的候选身份已改变，请重新生成。');
        assertGm(game);assertExactRuntime(game);
        this.prepared=prepared;this.aiReport=report;this.recoveredReview=true;
        this.status='已重新校验保存的候选；历史 AI 审核记录仅供核对。请重新检查来源、规则与 GM 操作并明确确认导入。';
      }catch(error){this.error=message(error);this.status='保存的候选未能通过重新预览。';}
      finally{this.busy=false;if(!this.closed)void this.render();}
    }
    private recoveryBinding():{target:string;catalogHash:string} {
      assertGm(game);assertExactRuntime(game);
      if(this.recoveryScope&&`${game.world?.id}:${game.user?.id}`!==this.recoveryScope)throw new Error('当前世界或 GM 已改变，旧任务不能继续写入。');
      return {target:`${game.version}/dnd5e/${game.system.version}/core`,catalogHash:hashSource(JSON.stringify(configuredConditionsCatalog(game)))};
    }
    private rememberSecrets(options:{apiKey:string;baseUrl:string;otherKeys?:string[]}):void {
      this.forbiddenValues=[...new Set([...this.forbiddenValues,options.apiKey,options.baseUrl,...(options.otherKeys??[])].filter(Boolean))];
    }
    private loadRecovery():Promise<void> {
      return this.recoveryLoadPromise??=this.readRecovery();
    }
    private async readRecovery():Promise<void> {
      try {
        const worldId=game.world?.id,userId=game.user?.id;
        if(!worldId||!userId)return;
        this.recoveryScope=`${worldId}:${userId}`;
        this.recoveryStore=environment.recoveryStore??new IndexedDbEncounterRecoveryStore(this.recoveryScope);
        const stored=await this.recoveryStore.load();
        const loaded=stored?decodeEncounterRecovery(serializeEncounterRecovery(stored)):undefined;
        this.checkpointEnabled=true;
        if(!loaded||this.closed||this.fileRevision!==0||this.humanSource)return;
        const binding=this.recoveryBinding();
        if(loaded.target!==binding.target||loaded.catalogHash!==binding.catalogHash){
          this.status='此前任务的目标版本或状态目录已改变，旧草稿未恢复。';return;
        }
        this.humanSource=loaded.source;this.humanLabel=loaded.label;this.outputLanguage=loaded.outputLanguage;
        this.recoveryReport=loaded.report;
        this.aiReport=loaded.report;
        this.recoveryPackage=loaded.package;
        this.translationReport=loaded.translationReport??[];
        this.recoveryCatalogHash=loaded.catalogHash;
        this.checkpointEnabled=true;
        this.status=loaded.package
          ? '已恢复本地来源和候选记录；点击“重新预览”正式校验，之后仍须 GM 重新确认。'
          : loaded.report?.actors.some(actor=>actor.analysis?.ir)
          ? '已恢复本地来源与草稿；点击“继续任务”重新验证和审核，不会自动请求 AI 或导入。'
          : '已恢复本地来源；请确认资料后开始生成。';
      } catch(error){this.status=`本地任务恢复不可用：${message(error)}。可清除当前任务记录后重新生成。`;}
    }
    private queueRecoverySave():void {
      if(!this.checkpointEnabled||!this.recoveryStore||this.closed)return;
      if(this.saveTimer)clearTimeout(this.saveTimer);
      this.saveTimer=setTimeout(()=>{this.saveTimer=undefined;void this.saveRecovery();},250);
    }
    private async saveRecovery():Promise<void> {
      if(!this.checkpointEnabled||!this.recoveryStore||this.closed)return;
      try {
        this.recoveryBinding();
        if(!this.humanSource.trim()||!this.humanLabel.trim()){
          this.pendingSave=this.recoveryStore.clear();await this.pendingSave;return;
        }
        // Read the live page session, including an unpersisted key, even before AI is configured.
        const options=environment.getRecoverySecrets?.()??(()=>{const current=readForgeSessionSettings();return{apiKey:current.apiKey,baseUrl:current.endpoint,otherKeys:Object.values(current.savedApiKeys)};})();
        this.rememberSecrets(options);
        const binding=this.recoveryBinding();
        const report=this.recoveryReport?.source===this.humanSource&&this.recoveryReport.sourceHash===hashSource(this.humanSource)
          &&this.recoveryCatalogHash===binding.catalogHash?this.recoveryReport:undefined;
        const snapshot:EncounterRecoverySnapshot={version:1,source:this.humanSource,sourceHash:hashSource(this.humanSource),
          label:this.humanLabel,outputLanguage:this.outputLanguage,...binding,...(report?{report}:{}),
          ...(report&&this.recoveryPackage?{package:this.recoveryPackage,translationReport:this.translationReport}: {})};
        assertEncounterSecretsAbsent(JSON.stringify(snapshot),this.forbiddenValues);
        this.pendingSave=this.recoveryStore.save(snapshot);
        await this.pendingSave;
      } catch(error){if(!this.closed){this.error=`任务尚未保存：${message(error)}`;void this.render();}}
    }
    private async clearCurrentRecovery():Promise<void> {
      if(this.busy||this.closed)return;
      this.controller?.abort();this.fileRevision++;
      if(this.saveTimer){clearTimeout(this.saveTimer);this.saveTimer=undefined;}
      this.clearReportPresentation();this.humanSource='';this.humanLabel='多生物战斗资料';this.outputLanguage='source';
      this.prepared=undefined;this.result=undefined;this.reviewed=false;this.aiReport=undefined;
      this.recoveryReport=undefined;this.recoveryPackage=undefined;this.recoveredReview=false;this.translationReport=[];this.progressDetail='';
      try {if(this.recoveryStore){this.pendingSave=this.recoveryStore.clear();await this.pendingSave;}
        this.error='';this.status='已清除当前世界与 GM 的本地战斗包任务。';}
      catch(error){this.error=`本地任务清除失败：${message(error)}`;this.status='本地任务可能仍在，请核对后重试。';}
      if(!this.closed)void this.render();
    }
    private clearReportDownload() {
      const prior=this.reportDownload;
      this.reportDownload=undefined;
      if(prior)(environment.window?.URL??globalThis.URL).revokeObjectURL(prior.url);
    }
    private clearReportPresentation():void {this.clearReportDownload();this.textView=undefined;}
    private refreshKnownSecrets():void {
      const options=environment.getRecoverySecrets?.()??(()=>{const current=readForgeSessionSettings();return{apiKey:current.apiKey,baseUrl:current.endpoint,otherKeys:Object.values(current.savedApiKeys)};})();
      this.rememberSecrets(options);
    }
    private currentReportText():string {
      if(!this.aiReport&&!this.translationReport.length&&!this.prepared?.bundle.localization)throw new Error('当前没有可查看的审核记录。');
      if(this.aiReport&&(this.aiReport.source!==this.humanSource||this.aiReport.sourceHash!==hashSource(this.humanSource)))
        throw new Error('来源已改变，旧审核记录不能使用。');
      this.refreshKnownSecrets();
      const text=JSON.stringify(this.translationReport.length||this.prepared?.bundle.localization
        ?{intake:this.aiReport??null,localization:this.translationReport.length?this.translationReport:this.prepared?.bundle.localization,sourcePackage:this.prepared?.bundle}:this.aiReport,null,2);
      assertEncounterSecretsAbsent(text,this.forbiddenValues);
      return text;
    }
    private currentPackageText():string {
      if(!this.prepared)throw new Error('当前没有可查看的战斗包。');
      this.refreshKnownSecrets();
      const text=serializeForgeEncounterPackage(this.prepared.bundle);
      assertEncounterSecretsAbsent(text,this.forbiddenValues);
      return text;
    }
    private viewReport():void {
      if(this.closed||this.busy)return;
      try {this.textView={kind:'report',name:'encounter-intake-review.json',text:this.currentReportText()};this.error='';this.status='审核记录已在下方展开，可全选复制；下载仍是独立操作。';}
      catch{this.textView=undefined;this.error='审核记录未通过来源或连接安全核对。';this.status='审核记录无法显示，请检查当前来源和连接设置。';}
      if(!this.closed)void this.render();
    }
    private viewPackage():void {
      if(this.closed||this.busy||!this.prepared)return;
      try {this.textView={kind:'package',name:`${this.prepared.bundle.id}.forge-encounter.json`,text:this.currentPackageText()};this.error='';this.status='战斗包 JSON 已在下方展开，可全选复制。';}
      catch{this.textView=undefined;this.error='战斗包未通过连接安全核对。';this.status='战斗包 JSON 无法显示。';}
      if(!this.closed)void this.render();
    }
    private async copyVisibleText():Promise<void> {
      if(this.closed||this.busy||!this.textView)return;
      const current=this.textView,revision=this.fileRevision;
      let text:string;
      try {text=current.kind==='report'?this.currentReportText():this.currentPackageText();if(text!==current.text)throw new Error('可见内容已改变。');}
      catch{this.textView=undefined;this.error='可见内容已失效，请重新查看。';this.status='可见内容已失效。';if(!this.closed)void this.render();return;}
      const clipboard=(environment.window??(globalThis as any).window)?.navigator?.clipboard;
      try {if(typeof clipboard?.writeText!=='function')throw new Error('Clipboard unavailable');
        await clipboard.writeText(text);if(this.closed||revision!==this.fileRevision||this.textView!==current)return;
        this.error='';this.status='文本已复制。';}
      catch {if(this.closed||revision!==this.fileRevision||this.textView!==current)return;
        this.error='浏览器未提供剪贴板写入；下方文本仍可手动全选复制。';this.status='自动复制不可用，文本仍可手动复制。';}
      if(!this.closed)void this.render();
    }
    private exportReport() {
      if(this.closed||this.busy||(!this.aiReport&&!this.translationReport.length&&!this.prepared?.bundle.localization))return;
      this.error='';
      try {
        this.clearReportDownload();
        const text=this.currentReportText();
        const win=environment.window??globalThis;
        const urlApi=win.URL??globalThis.URL,doc=win.document??(globalThis as any).document,BlobClass=win.Blob??globalThis.Blob;
        if(!urlApi?.createObjectURL||!urlApi?.revokeObjectURL||!doc?.createElement||!doc.body)throw new Error('当前浏览器不能准备审核文件。');
        const blob=new BlobClass([text],{type:'application/json'});
        const name='encounter-intake-review.json',url=urlApi.createObjectURL(blob);
        this.reportDownload={url,name,byteLength:blob.size};
        const link=doc.createElement('a');link.href=url;link.download=name;link.hidden=true;link.onclick=preserveNativeDownload;doc.body.appendChild(link);
        try{link.click();}finally{link.remove();}
        this.status='审核文件已生成；如浏览器未开始下载，请点击下方“下载审核文件”链接。';
      }catch{this.textView=undefined;this.error='审核文件未通过来源或连接安全核对，或浏览器无法准备下载。';this.status='审核文件未能下载，请根据错误检查后重试。';}
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
      if(this.saveTimer){clearTimeout(this.saveTimer);this.saveTimer=undefined;await this.saveRecovery();}
      await this.pendingSave.catch(()=>undefined);
      this.closed=true;this.clearReportPresentation();this.controller?.abort();const win=environment.window??(globalThis as any).window;win?.removeEventListener?.('beforeunload',this.pageGuard);
      return super.close(options);
    }
  };
}
function message(error:unknown):string{return error instanceof Error?error.message:String(error);}
function encounterRetryLabel(stage:string):string{
  return ({discover:'识别生物',extract:'提取规则',review:'来源审核',repair:'修正草稿',
    'automation-generate':'固定能力提取','automation-review':'自动化独立审核'} as Record<string,string>)[stage]??'当前阶段';
}
// Core 14.368 promotes document-level hyperlinks to new tabs, including downloads.
function preserveNativeDownload(event:Event):void{event.stopPropagation();}
function displayText(value:unknown):string{return typeof value==='string'?value.replace(/<\/(?:p|li|div|h[1-6])>|<br\s*\/?\s*>/giu,'\n').replace(/<[^>]*>/gu,'').replace(/&nbsp;/gu,' ').replace(/&amp;/gu,'&').trim():'';}
function download(name:string,content:string|Uint8Array,type:string){
  const url=URL.createObjectURL(new Blob([content as any],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
