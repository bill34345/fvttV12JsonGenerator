import { decodeForgeEncounterPackageZip, serializeForgeEncounterPackage, encodeForgeEncounterPackageZip } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { prepareForgeEncounter, type PreparedForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { actorLocalizationDisplayRows, encounterPackageLocalizationDisplayRows, approveForgeEncounterLocalization, assertForgeEncounterLocalizationDraft, draftForgeEncounterLocalization,
  reviewForgeEncounterLocalizationDraft, reviseForgeEncounterLocalizationBody, verifiedEncounterLocalizationProgress, LOCALIZATION_TERM_NOTES, LOCALIZATION_TERMS,
  type EncounterLocalizationProgress, type ForgeEncounterLocalizationDraft } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';
import { createEncounterIntakeProviders, generateEncounterFromHumanMarkdown, reviewForgeEncounterCandidate, encounterActorCandidate,
  assertEncounterSecretsAbsent, readFixedEncounterConfiguration, type EncounterIntakeReport } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type { BrowserAiProviderOptions } from '@fvtt-json-generator/forge-browser-runtime/ai';
import { decodeStatusLifecycleParameters } from '@fvtt-json-generator/contracts/status-lifecycle';
import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import {localizationMeaningFindings} from '@fvtt-json-generator/contracts/localization';
import { configuredConditionsApi, configuredConditionsCatalog, configuredConditionSummary } from './configuredConditions';
import { encounterReviewCards, statusLifecycleSummary } from './encounterReviewCards';
import { encounterReviewNavigation } from './encounterReviewNavigation';
import { iconReviewPresentation } from './iconReviewPresentation';
import { decodeEncounterRecovery, serializeEncounterRecovery, IndexedDbEncounterRecoveryStore, type EncounterRecoveryStore, type EncounterRecoverySnapshot } from './encounterRecoveryStore';
import { readForgeSessionSettings, subscribeForgeSessionSettings } from './settings';
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
  reviewForgeEncounterCandidate?:typeof reviewForgeEncounterCandidate;
  recoveryStore?:EncounterRecoveryStore;
  openAiConnection?:()=>void;
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
    private localizationDraft?:ForgeEncounterLocalizationDraft;
    private translationReviewed=false;
    private generationReviewBinding?:{optionsHash:string;sessionRevision:number;sourceHash:string;packageHash:string};
    private sessionRevision=0;
    private sessionFingerprint?:string;
    private sessionUnsubscribe?:()=>void;
    private reviewingCandidate=false;
    private reportDownload?:{url:string;name:string;byteLength:number};
    private reportDownloadText?:string;
    private textView?:{kind:'report'|'package'|'actor';actorKey?:string;name:string;text:string};

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
    private recoveryUploadedHash?:string;
    private recoveryUploadedProgress?:EncounterLocalizationProgress[];
    private recoveryUploadedDraft?:ForgeEncounterLocalizationDraft;
    private recoveredReview=false;
    private recoveryCatalogHash?:string;
    private checkpointEnabled=false;
    private saveTimer?:ReturnType<typeof setTimeout>;
    private pendingSave:Promise<void>=Promise.resolve();
    private progressDetail='';
    private reviewFilter:'all'|'issues'|'gm'='all';
    private actorFilter='';
    private readonly pageGuard = (event:any) => { if(this.importing){event.preventDefault();event.returnValue='';} };

    private observeConnectionSession():void{
      if(this.sessionUnsubscribe)return;
      try{this.sessionFingerprint=sessionSettingsHash();}catch{this.sessionFingerprint=undefined;}
      this.sessionUnsubscribe=subscribeForgeSessionSettings(()=>{
        let next:string|undefined;
        try{next=sessionSettingsHash();}catch{next=undefined;}
        if(next===this.sessionFingerprint)return;
        this.sessionFingerprint=next;this.sessionRevision++;this.generationReviewBinding=undefined;
        if(this.reviewingCandidate)this.controller?.abort();
        if(!this.closed)void this.render();
      });
    }

    async _prepareContext() {
      await this.loadRecovery();
      this.refreshReportPresentation();
      const currentProgress=this.prepared?verifiedEncounterLocalizationProgress(this.prepared.bundle,this.prepared.actors,this.translationReport):[];
      const navigation=encounterReviewNavigation(this.aiReport,currentProgress,this.humanSource,!!this.prepared,this.prepared?.bundle,this.prepared?.actors);
      const localizedNames=new Map(this.prepared?.bundle.localization?this.prepared.actors.map(actor=>[actor.key,actor.name] as const):[]);
      const candidateActors=navigation.actors.length?navigation.actors.map(actor=>({...actor,label:localizedNames.get(actor.key)??actor.label}))
        :this.prepared?.actors.map(actor=>({key:actor.key,label:actor.name}))??[];
      const candidateRules=this.prepared?.macros.flatMap(macro=>readFixedEncounterConfiguration(macro.command)?.rules??[])??[];
      const manualSourceRules=this.prepared?.actors.flatMap(actor=>((actor.artifact.items??[]) as any[])
        .filter(item=>item.flags?.fvttJsonGenerator?.manualRule?.mode==='gm-manual')
        .map(item=>({actorKey:actor.key,actorName:actor.name,name:String(item.name),sourceText:String(item.flags.fvttJsonGenerator.manualRule.sourceText)})))??[];
      const selectedActor=this.actorFilter && candidateActors.some(actor=>actor.key===this.actorFilter)?this.actorFilter:'';
      const issueItems=navigation.issues.map((issue,index)=>{
        const canContinue=issue.action==='translate'?!!this.prepared&&!this.prepared.bundle.localization
          :issue.action==='resume'&&!!this.recoveryReport?.actors.some(actor=>actor.analysis?.ir)&&!this.prepared;
        return {...issue,index,canLocate:issue.locateStart!==undefined,canContinue,
          continueLabel:issue.action==='translate'?'继续翻译':'继续任务',canInspect:!canContinue};
      });
      const reviewCards=encounterReviewCards(this.prepared?this.aiReport:undefined,this.prepared?.bundle.localization,currentProgress);
      const possibleDraft=this.localizationDraft??this.aiReport?.localizationDraft;
      let currentDraft:ForgeEncounterLocalizationDraft|undefined;
      let draftPreviewError:string|undefined;
      if(this.prepared&&!this.prepared.bundle.localization&&possibleDraft){
        try{assertForgeEncounterLocalizationDraft(this.prepared,possibleDraft);currentDraft=possibleDraft;}
        catch(error){
          // Facts drafts need a complete source-bound presentation, never a residual-only preview.
          if(possibleDraft.packageText?.request?.policy==='zh-CN-facts-v1'
            ||Array.isArray(possibleDraft.actors)&&possibleDraft.actors.some(actor=>actor?.request?.policy==='zh-CN-facts-v1'))
            draftPreviewError=`完整中文预览未通过来源校验：${message(error)}`;
        }
      }
      const currentReport=this.prepared&&this.aiReport?.source===this.humanSource
        &&this.aiReport.sourceHash===hashSource(this.humanSource)&&this.aiReport.packageHash===this.prepared.hash?this.aiReport:undefined;
      const automationAuditApplicable=!!currentReport?.automation;
      const actorAuditsComplete=!!currentReport?.actors.length&&currentReport.actors.every(actor=>['accepted','needs_review'].includes(actor.generation?.modelReviewStatus??''));
      const automationAuditComplete=!automationAuditApplicable||!!currentReport?.automationReview&&'verdict'in currentReport.automationReview;
      const aiConcerns=!!currentReport&&(currentReport.automationReview&&'verdict'in currentReport.automationReview
        &&currentReport.automationReview.verdict==='needs_review'||currentReport.actors.some(actor=>['needs_review','failed'].includes(actor.generation?.modelReviewStatus??'')));
      const needsPaidReview=!!currentReport&&(!actorAuditsComplete||!automationAuditComplete||!!currentDraft);
      const draftFields=(part:ForgeEncounterLocalizationDraft['packageText'],actorKey?:string)=>{
        const translated=new Map(part.draft.texts.map(field=>[field.id,field.text]));
        return part.request.texts.map(field=>({id:field.id,partKey:actorKey??'_package',editable:field.kind==='body'&&!this.busy&&!this.result,
          kind:field.kind==='title'?'标题':'正文',source:field.source,text:translated.get(field.id)??''}));
      };
      type FactsPreviewRow={pathLabel:string;fullSource:string;assembledZh:string;
        uncoveredMechanics:ReturnType<typeof actorLocalizationDisplayRows>[number]['uncoveredMechanics'];
        fixedBlocks:Array<ReturnType<typeof actorLocalizationDisplayRows>[number]['fixedBlocks'][number]&{modeLabel:string}>;
        editableSlots:Array<{textId:string;source:string;draft:string;review:string;reviewLabel:string;partKey:string;editable:boolean}>};
      let draftPreview: {factsMode:boolean;actors:Array<{key:string;name:string;factsMode?:boolean;
        fields?:ReturnType<typeof draftFields>;factsRows?:FactsPreviewRow[]}>;
        packageFields:ReturnType<typeof draftFields>;packageFactsRows?:FactsPreviewRow[]}|undefined;
      if(currentDraft){
        try{
          draftPreview={factsMode:currentDraft.actors.some(actor=>actor.request.policy==='zh-CN-facts-v1'),
            actors:currentDraft.actors.map(actor=>{
            const preparedActor=this.prepared!.actors.find(item=>item.key===actor.key);
            const sourceActor=this.prepared!.bundle.actors.find(item=>item.key===actor.key);
            if(!preparedActor||!sourceActor)throw new TypeError('中文预览缺少当前角色来源。');
            if(actor.request.policy!=='zh-CN-facts-v1')return {key:actor.key,name:preparedActor.name,fields:draftFields(actor,actor.key)};
            if(!preparedActor.rulePresentation)throw new TypeError('中文预览缺少重新生成的规则事实。');
            const factsRows=actorLocalizationDisplayRows(preparedActor.artifact,sourceActor.source,actor.draft,preparedActor.rulePresentation)
              .map(row=>({pathLabel:Array.isArray(row.path)?row.path.join('.'):String(row.path),
                fullSource:/description|biography/u.test(row.path)?displayText(row.fullSource):row.fullSource,
                assembledZh:/description|biography/u.test(row.path)?displayText(row.assembledZh):row.assembledZh,uncoveredMechanics:row.uncoveredMechanics,
                fixedBlocks:row.fixedBlocks.map(block=>({...block,modeLabel:block.executionMode==='native'?'原生规则':'需要 GM 辅助'})),
                editableSlots:row.editableSlots.map(slot=>{
                  const field=actor.request.texts.find(entry=>entry.id===slot.textId);
                  if(!field)throw new TypeError('中文预览的剩余文本不属于当前翻译请求。');
                  return {...slot,partKey:actor.key,reviewLabel:slot.review==='gm-assisted'?'待 GM 核对':'常规文本',
                    editable:field.kind==='body'&&!this.busy&&!this.result};
                })}));
            if(!factsRows.length||factsRows.filter(row=>row.fixedBlocks.length).length!==preparedActor.rulePresentation.fields.length)
              throw new TypeError('中文预览的完整显示字段或规则字段数量不一致。');
            const displayedIds=new Set(factsRows.flatMap(row=>row.editableSlots.map(slot=>slot.textId)));
            if(actor.request.texts.some(field=>!displayedIds.has(field.id)))
              throw new TypeError('中文预览遗漏了当前请求的显示字段。');
            return {key:actor.key,name:preparedActor.name,factsMode:true,factsRows};
          }),packageFields:draftFields(currentDraft.packageText)};
          if(draftPreview.factsMode){
            const packagePart=currentDraft.packageText;
            const packageRows=encounterPackageLocalizationDisplayRows(this.prepared!,currentDraft);
            draftPreview.packageFactsRows=packageRows.map(row=>({pathLabel:String(row.path),
              fullSource:row.fullSource,assembledZh:row.assembledZh,uncoveredMechanics:row.uncoveredMechanics,
              fixedBlocks:row.fixedBlocks.map(block=>({...block,modeLabel:block.executionMode==='native'?'原生规则':'需要 GM 辅助'})),
              editableSlots:row.editableSlots.map(slot=>{
                const field=packagePart.request.texts.find(entry=>entry.id===slot.textId);
                if(!field)throw new TypeError('战斗包中文预览的剩余文本不属于当前翻译请求。');
                return {...slot,partKey:'_package',reviewLabel:slot.review==='gm-assisted'?'待 GM 核对':'常规文本',
                  editable:field.kind==='body'&&!this.busy&&!this.result};
              })}));
            const packageIds=new Set(draftPreview.packageFactsRows.flatMap(row=>row.editableSlots.map(slot=>slot.textId)));
            if(!draftPreview.packageFactsRows.length||packagePart.request.texts.some(field=>!packageIds.has(field.id)))
              throw new TypeError('战斗包中文预览遗漏了完整来源、规则或显示字段。');
            draftPreview.packageFields=[];
          }
        }catch(error){
          draftPreview=undefined;
          draftPreviewError=`完整中文预览不可用：${message(error)}`;
          currentDraft=undefined;
        }
      }
      let installed:any[]=[];
      try { installed=listForgeEncounterMacros(game); } catch(error){ this.error=message(error); }
      let configuredConditions:any[]=[];
      try { configuredConditions=configuredConditionsCatalog(game).map(definition=>({...definition,summary:configuredConditionSummary(definition)})); }
      catch(error){this.error=message(error);}
      const deliveryReport=this.currentActorReport();
      const actorDeliveries=(deliveryReport?.members??deliveryReport?.actors.map(actor=>({key:actor.key,label:actor.analysis.candidate?.label??actor.key,
        status:actor.generation?.candidateAvailable?'available':actor.analysis.status==='failed'?'failed':'pending',findings:[]}))??[]).map(member=>{
        const stateLabels:Record<string,string>={pending:'未处理',running:'进行中',available:'候选可获取',failed:'未生成候选',cancelled:'已取消'};
        let candidate:ReturnType<typeof encounterActorCandidate>|undefined;
        let invalid:string|undefined;
        if(deliveryReport?.actors.some(actor=>actor.key===member.key&&actor.generation?.candidateAvailable)){
          try{candidate=encounterActorCandidate(deliveryReport,member.key);}catch(error){invalid=message(error);}
        }
        return{key:member.key,label:member.label,status:stateLabels[member.status]??'待核对',available:!!candidate,
          reusedCandidate:deliveryReport?.actors.find(actor=>actor.key===member.key)?.reusedCandidate===true,
          strictStatus:candidate?.strictStatus,findings:[...member.findings,...(invalid?[invalid]:[])],source:candidate?.source};
      });
      return {busy:this.busy, importing:this.importing, reviewed:this.reviewed, ready:!!this.prepared,
        actorDeliveries,partialCandidates:!this.prepared&&actorDeliveries.some(actor=>actor.available),
        configuredConditions,canConfigureConditions:typeof game.modules?.get?.('fvtt-custom-conditions')?.api?.configuredConditions?.openEditor==='function',
        humanSource:this.humanSource,humanLabel:this.humanLabel,aiRunning:this.aiRunning,
        chineseSelected:this.outputLanguage==='zh-CN',localized:!!this.prepared?.bundle.localization,
        terminologyNotes:LOCALIZATION_TERM_NOTES,terminologyReferences:[...new Set(LOCALIZATION_TERMS.map(term=>term.reference).filter(reference=>reference.startsWith('https:')))],
        localPage:['127.0.0.1','localhost','[::1]'].includes((globalThis as any).location?.hostname),
        hasReport:!!this.aiReport||this.translationReport.length>0||!!this.prepared?.bundle.localization,hasPackage:!!this.prepared,aiFindings:[...(this.aiReport?.findings??[]),...(this.prepared?.reviewFindings??[])],
        reportDownload:this.reportDownload,
        textView:this.textView,reportViewText:this.textView?.kind==='report'?this.textView.text:undefined,
        recoveryAvailable:!!this.recoveryReport?.actors.some(actor=>actor.analysis?.ir) && !this.busy && !this.prepared,
        recoveryPackageAvailable:!!this.recoveryPackage&&!this.prepared&&!this.busy,
        hasLocalRecovery:!!this.recoveryStore&&(!!this.humanSource||!!this.recoveryReport||!!this.recoveryPackage||this.status.startsWith('本地任务恢复不可用')||this.status.startsWith('此前任务')),
        recoveryDraftCount:this.recoveryReport?.actors.filter(actor=>actor.analysis?.ir).length??0,
        recoveredReview:this.recoveredReview,
        progressDetail:this.progressDetail,
        draftPreview,draftPreviewError,translationReviewed:this.translationReviewed,
        iconReviewText:this.prepared?iconReviewPresentation(this.prepared.actors.map(actor=>actor.iconReview)):undefined,
        canApproveTranslation:!!currentDraft&&this.translationReviewed&&!this.busy&&!this.result,
        canReviewCandidate:needsPaidReview&&!this.prepared?.bundle.localization&&!this.busy&&!this.result
          &&!!this.generationReviewBinding&&this.generationReviewBinding.sessionRevision===this.sessionRevision
          &&this.generationReviewBinding.sourceHash===currentReport?.sourceHash
          &&this.generationReviewBinding.packageHash===this.prepared?.hash,
        aiConcerns,aiReviewFindings:aiConcerns?currentReport?.findings??[]:[],
        localizationApprovalState:this.prepared?.bundle.localization
          ?'approval'in this.prepared.bundle.localization.packageText?'中文译文由 GM 人工核对并批准；中文译文的 AI 审核未请求。'
            :'中文译文经过显式 AI 审核；仍需 GM 最终确认。':undefined,
        modelReviewState:!this.prepared?undefined:!currentReport
          ?'此包没有当前 Intake 来源与 IR 报告，不能发起付费模型审核；GM 可依据候选预览人工核对。'
          :aiConcerns?'AI 审核提出提示或未完成；候选与检查问题继续保留，请由 GM 核对具体问题后明确确认。'
          :actorAuditsComplete&&automationAuditComplete
          ?automationAuditApplicable?'角色与配套控制均已完成显式 AI 审核；结果仅供参考，仍需 GM 最终确认。'
            :'全部角色已完成显式 AI 审核；本包没有配套控制审核，仍需 GM 最终确认。'
          :!this.generationReviewBinding||this.generationReviewBinding.sessionRevision!==this.sessionRevision
            ||this.generationReviewBinding.sourceHash!==currentReport.sourceHash
            ||this.generationReviewBinding.packageHash!==this.prepared.hash
          ?'当前候选没有本会话生成连接的有效证明，不能继承付费审核权限；仍可由 GM 依据本地校验人工确认。'
          :!actorAuditsComplete?'角色 AI 审核尚未完成；可另行请求，或由 GM 依据完整来源核对候选。'
          :!automationAuditComplete?'角色 AI 审核已完成；配套控制 AI 审核尚未完成。'
          :'当前记录没有 AI 审核结论；请由 GM 核对来源和规则。',
        importLabel:this.prepared?.reviewFindings?.length?'我已核对问题，导入待审候选':aiConcerns?'GM 确认导入（仍有 AI 提示）':currentDraft?'导入原语言包（中文草稿尚未确认）':this.prepared?.macros.length?'一起导入角色与宏':'导入完整角色',
        showReviewNavigation:candidateActors.length>0||navigation.issues.length>0,
        reviewNavigation:{...navigation,actorCount:candidateActors.length,hasRuleCounts:!!this.aiReport?.automation?.selection||candidateRules.length>0||manualSourceRules.length>0,
          gmMechanisms:this.prepared?.requirements.length??0,
          automatic:navigation.automatic||candidateRules.filter(rule=>rule.kind!=='gm-manual').length,
          manual:(navigation.manual||candidateRules.filter(rule=>rule.kind==='gm-manual').length)+manualSourceRules.length,
          actors:candidateActors.map(actor=>({...actor,selected:actor.key===selectedActor})),
          allSelected:this.reviewFilter==='all',issuesSelected:this.reviewFilter==='issues',gmSelected:this.reviewFilter==='gm',
          selectedActor,visibleIssues:this.reviewFilter==='gm'?[]:issueItems.filter(issue=>!selectedActor||issue.actorKey===selectedActor),
          hasIssues:issueItems.length>0},
        reviewCards:reviewCards.filter(card=>(!selectedActor||card.actorKey===selectedActor)
          &&(this.reviewFilter==='all'||this.reviewFilter==='gm'&&card.gmManual)),
        reviewEvidenceUnavailable:!!this.prepared&&!this.aiReport?.automation?.selection,
        status:this.status,error:this.error,fileName:this.file?.name,
        label:this.prepared?.label,packageHash:this.prepared?.hash,
        actors:this.prepared?.actors.filter(a=>(!selectedActor||a.key===selectedActor)&&this.reviewFilter==='all').map(a=>({key:a.key,name:a.name,isPrimary:a.key===this.prepared!.bundle.primaryActorKey,assisted:a.status==='needs_review',
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
        manualSourceRules:manualSourceRules.filter(rule=>!selectedActor||rule.actorKey===selectedActor),
        requirements:this.prepared?.requirements.filter(requirement=>(!selectedActor||requirement.actorKey===selectedActor)
          &&this.reviewFilter!=='issues').map(requirement=>({...requirement,
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
      this.observeConnectionSession();
      const root=this.element as HTMLElement;
      const invalidate=(keepDraft=false)=>{this.clearReportPresentation();this.prepared=undefined;this.result=undefined;this.aiReport=undefined;this.recoveryPackage=undefined;this.recoveryUploadedHash=undefined;this.recoveryUploadedProgress=undefined;this.recoveryUploadedDraft=undefined;this.generationReviewBinding=undefined;this.recoveredReview=false;if(!keepDraft)this.recoveryReport=undefined;this.translationReport=[];this.localizationDraft=undefined;this.translationReviewed=false;this.reviewFilter='all';this.actorFilter='';this.reviewed=false;this.file=undefined;this.fileRevision++;this.error='';this.progressDetail='';this.status='资料已改变，旧候选与审核记录已撤下；请重新生成或预览。';this.queueRecoverySave();
        root.querySelector('[data-encounter-current-result]')?.replaceChildren();
        root.querySelector('[data-encounter-report-controls]')?.replaceChildren();
        root.querySelector('[data-encounter-recovery-controls]')?.replaceChildren();
        const clearControl=root.querySelector<HTMLElement>('[data-encounter-clear-control]');
        if(clearControl)clearControl.hidden=!(this.recoveryStore&&this.humanSource);
        root.querySelector('[data-encounter-progress]')?.remove();
        root.querySelector('.forge-error')?.remove();
        const fileName=root.querySelector('[data-encounter-file-name]');if(fileName)fileName.textContent='';
        for(const status of root.querySelectorAll('[data-encounter-status], [data-encounter-secondary-status]'))status.textContent=this.status;
        const button=root.querySelector<HTMLButtonElement>('[data-action="encounter-import"]');if(button)button.disabled=true;};
      const source=root.querySelector<HTMLTextAreaElement>('[name="humanSource"]');
      if(source)source.oninput=()=>{if(this.busy)return;this.humanSource=source.value;invalidate();};
      const label=root.querySelector<HTMLInputElement>('[name="humanLabel"]');
      if(label)label.oninput=()=>{if(this.busy)return;this.humanLabel=label.value;invalidate(true);};
      const language=root.querySelector<HTMLSelectElement>('[name="outputLanguage"]');
      if(language)language.onchange=()=>{if(this.busy)return;this.outputLanguage=language.value==='zh-CN'?'zh-CN':'source';invalidate(true);void this.render();};
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
      if(file)file.onchange=()=>{if(this.busy)return;this.clearReportPresentation();this.file=file.files?.[0];this.fileRevision++;this.prepared=undefined;this.generationReviewBinding=undefined;this.result=undefined;this.aiReport=undefined;this.recoveryReport=undefined;this.recoveryPackage=undefined;this.recoveryUploadedHash=undefined;this.recoveryUploadedProgress=undefined;this.recoveryUploadedDraft=undefined;this.translationReport=[];this.localizationDraft=undefined;this.translationReviewed=false;this.reviewFilter='all';this.actorFilter='';this.reviewed=false;this.error='';this.queueRecoverySave();void this.render();};
      const reviewed=root.querySelector<HTMLInputElement>('[name="encounterReviewed"]');
      if(reviewed)reviewed.onchange=()=>{this.reviewed=reviewed.checked;const button=root.querySelector<HTMLButtonElement>('[data-action="encounter-import"]');if(button)button.disabled=!this.reviewed||this.busy||!!this.result;};
      const translationReviewed=root.querySelector<HTMLInputElement>('[name="encounterTranslationReviewed"]');
      if(translationReviewed)translationReviewed.onchange=()=>{this.translationReviewed=translationReviewed.checked;
        const button=root.querySelector<HTMLButtonElement>('[data-action="encounter-approve-localization"]');
        if(button)button.disabled=!this.translationReviewed||this.busy||!!this.result;};
      const editPrepared=this.prepared,editDraft=this.localizationDraft??this.aiReport?.localizationDraft;
      root.querySelectorAll<HTMLButtonElement>('[data-action="encounter-save-localization-body"]').forEach(button=>{
        button.onclick=()=>{const row=button.closest<HTMLElement>('[data-localization-field]');
          const editor=row?.querySelector<HTMLTextAreaElement>('[data-localization-edit]');
          if(row&&editor)this.reviseLocalizationBody(row.dataset.localizationPart==='_package'?undefined:row.dataset.localizationPart,
            row.dataset.localizationField??'',editor.value,editPrepared,editDraft);};
      });
      const bind=(action:string,fn:()=>unknown)=>{const b=root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);if(b)b.onclick=()=>void fn();};
      bind('encounter-preview',()=>this.preview());
      bind('encounter-localize',()=>this.translatePrepared());
      bind('encounter-approve-localization',()=>this.approveLocalization());
      bind('encounter-review-candidate',()=>this.reviewCurrentCandidate());
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
      bind('encounter-open-ai-connection',()=>{
        try { assertGm(game);assertExactRuntime(game);if(!environment.openAiConnection)throw new Error('当前入口没有连接设置回调；请从 Forge · AI 连接打开共享设置。');environment.openAiConnection(); }
        catch(error){this.error=message(error);void this.render();}
      });
      for(const button of root.querySelectorAll<HTMLButtonElement>('[data-review-filter]'))button.onclick=()=>{
        const filter=button.dataset.reviewFilter;
        if(filter==='all'||filter==='issues'||filter==='gm'){this.reviewFilter=filter;void this.render();}
      };
      const actorSelect=root.querySelector<HTMLSelectElement>('[data-review-actor]');
      if(actorSelect)actorSelect.onchange=()=>{this.actorFilter=actorSelect.value;void this.render();};
      for(const button of root.querySelectorAll<HTMLButtonElement>('[data-review-actor-jump]'))button.onclick=()=>{
        this.actorFilter=button.dataset.reviewActorJump??'';this.reviewFilter='all';void this.render();
      };
      for(const button of root.querySelectorAll<HTMLButtonElement>('[data-review-issue-locate]'))button.onclick=()=>{
        const current=this.prepared?verifiedEncounterLocalizationProgress(this.prepared.bundle,this.prepared.actors,this.translationReport):[];
        const issue=encounterReviewNavigation(this.aiReport,current,this.humanSource,!!this.prepared,this.prepared?.bundle,this.prepared?.actors).issues[Number(button.dataset.reviewIssueLocate)];
        const input=root.querySelector<HTMLTextAreaElement>('[name="humanSource"]');
        if(!issue||!input||issue.locateStart===undefined||issue.locateEnd===undefined
          ||this.humanSource.slice(issue.locateStart,issue.locateEnd)!==issue.source){this.error='当前来源定位已失效，请重新核对原文。';void this.render();return;}
        input.focus();input.setSelectionRange(issue.locateStart,issue.locateEnd);input.scrollIntoView?.({block:'center'});
      };
      for(const button of root.querySelectorAll<HTMLButtonElement>('[data-review-issue-action]'))button.onclick=()=>{
        const current=this.prepared?verifiedEncounterLocalizationProgress(this.prepared.bundle,this.prepared.actors,this.translationReport):[];
        const issue=encounterReviewNavigation(this.aiReport,current,this.humanSource,!!this.prepared,this.prepared?.bundle,this.prepared?.actors).issues[Number(button.dataset.reviewIssueAction)];
        if(!issue)return;
        if(issue.action==='translate'&&this.prepared&&!this.prepared.bundle.localization)void this.translatePrepared();
        else if(issue.action==='resume'&&this.recoveryReport?.actors.some(actor=>actor.analysis?.ir)&&!this.prepared)void this.generateFromHuman(true);
        else this.viewReport();
      };
      bind('encounter-export',async()=>{if(this.prepared)download(`${this.prepared.bundle.id}.forge-encounter.zip`,await encodeForgeEncounterPackageZip(this.prepared.bundle),'application/zip');});
      bind('encounter-report',()=>this.exportReport());
      bind('encounter-report-view',()=>this.viewReport());
      bind('encounter-package-view',()=>this.viewPackage());
      for(const button of root.querySelectorAll<HTMLButtonElement>('[data-actor-candidate-view]'))button.onclick=()=>this.viewActorCandidate(button.dataset.actorCandidateView!);
      for(const button of root.querySelectorAll<HTMLButtonElement>('[data-actor-candidate-download]'))button.onclick=()=>this.downloadActorCandidate(button.dataset.actorCandidateDownload!);
      for(const button of root.querySelectorAll<HTMLButtonElement>('[data-export-actor]'))button.onclick=()=>{
        const actor=this.prepared?.actors.find(actor=>actor.key===button.dataset.exportActor);
        if(!actor||this.busy)return;
        const content=JSON.stringify(actor.artifact,null,2);assertEncounterSecretsAbsent(content,this.forbiddenValues);
        download(`${actor.key}.json`,content,'application/json');
      };
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
      const priorPresentation={prepared:this.prepared,recoveryPackage:this.recoveryPackage,translationReport:this.translationReport,
        localizationDraft:this.localizationDraft,recoveredReview:this.recoveredReview};
      let continuationPublished=false;
      this.clearReportPresentation();this.busy=true;this.aiRunning=true;this.error='';this.prepared=undefined;this.generationReviewBinding=undefined;this.recoveryPackage=undefined;this.recoveryUploadedHash=undefined;this.recoveryUploadedProgress=undefined;this.recoveryUploadedDraft=undefined;this.recoveredReview=false;this.result=undefined;this.reviewed=false;this.aiReport=undefined;this.translationReport=[];this.localizationDraft=undefined;this.translationReviewed=false;this.file=undefined;
      this.progressDetail=resume?'正在核对保存的草稿身份；有效 IR 将重新验证并做本地校验。':'准备识别生物与生成规则。';
      this.status='正在从原始资料生成并本地校验战斗包；不会创建世界文档。';void this.render();
      try{
        assertGm(game);assertExactRuntime(game);
        const options=environment.getAiOptions?.(controller);
        if(!options)throw new Error('请先在Intake连接页配置AI服务。');
        const generatedOptionsHash=connectionOptionsHash(options),generationSessionRevision=this.sessionRevision;
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
        const output=await (environment.generateEncounterFromHumanMarkdown??generateEncounterFromHumanMarkdown)({source,label,...providers,conditionCatalog,outputLanguage:this.outputLanguage,reviewPolicy:'deferred',drafts,draftParentHash,previousReport:resume?prior:undefined,signal:controller.signal,
          onProgress:message=>{if(this.closed||this.controller!==controller||revision!==this.fileRevision||source!==this.humanSource)return;this.status=message;this.progressDetail=message;const status=(this.element as HTMLElement)?.querySelector('[data-encounter-status]');if(status)status.textContent=message;const detail=(this.element as HTMLElement)?.querySelector('[data-encounter-progress]');if(detail)detail.textContent=message;},
          onReport:report=>{assertEncounterSecretsAbsent(JSON.stringify(report),this.forbiddenValues);if(!this.closed&&this.controller===controller&&revision===this.fileRevision&&source===this.humanSource){continuationPublished=true;this.aiReport=report;this.recoveryReport=report;this.queueRecoverySave();}}});
        if(this.closed||this.controller!==controller||revision!==this.fileRevision||source!==this.humanSource)throw new Error('原始资料已改变，请重新生成。');
        if(output.continuationRejected)throw new Error(output.continuationRejected);
        assertGm(game);assertExactRuntime(game);
        this.aiReport=output.report;this.recoveryReport=output.report;this.queueRecoverySave();
        if(!output.prepared){
          const count=output.report.actors.filter(actor=>actor.generation?.candidateAvailable).length;
          this.status=count?`已有 ${count} 个生物候选可逐个查看和下载；完整战斗包尚未完成，失败及未处理成员仍保留。`
            :'本轮尚无可获取的 Actor 候选；失败与未处理成员及来源仍保留。';
          this.error=output.report.findings.join('\n');return;
        }
        assertEncounterSecretsAbsent(serializeForgeEncounterPackage(output.prepared.bundle),this.forbiddenValues);
        this.prepared=output.prepared;
        this.translationReport=output.report.localization??[];
        this.localizationDraft=output.localizationDraft??output.report.localizationDraft;
        this.translationReviewed=false;
        this.recoveryPackage=serializeForgeEncounterPackage(output.prepared.bundle);
        if(generationSessionRevision===this.sessionRevision&&output.report.status==='ready_for_gm_review'
          &&output.report.packageHash===output.prepared.hash&&output.report.conditionCatalogHash===catalogHash
          &&output.report.model===providers.provider.extractionModel&&output.report.reviewModel===providers.provider.reviewModel)
          this.generationReviewBinding={optionsHash:generatedOptionsHash,sessionRevision:generationSessionRevision,
            sourceHash:output.report.sourceHash,packageHash:output.prepared.hash};
        this.queueRecoverySave();
        this.status=this.localizationDraft
          ? '原语言包已通过本地校验；中文草稿也已生成，等待 GM 明确核对批准。AI 审核未请求。'
          :output.report.outputLanguage==='source'&&this.outputLanguage==='zh-CN'
          ? '中文草稿未完成；原语言包已通过本地校验，可单独重试翻译。AI 审核未请求。'
          : output.prepared.reviewFindings?.length
          ? '完整候选已保留；检查仍有疑点，请查看原文和问题后决定导出或确认导入。AI 审核未请求。'
          : `已生成${output.prepared.actors.length}个生物${output.prepared.bundle.macros.length?'与固定控制入口':''}，本地校验已完成；AI 审核未请求，请由 GM 核对来源和规则后最终确认。`;
        this.error=output.report.findings.join('\n');
      }catch(error){
        const retainPrior=resume&&prior&&!continuationPublished&&source===this.humanSource&&revision===this.fileRevision;
        if(retainPrior){this.aiReport=prior;this.recoveryReport=prior;Object.assign(this,priorPresentation);}
        else if(!this.recoveryReport&&prior&&resume)this.recoveryReport=prior;
        this.error=controller.signal.aborted?'已取消AI生成，没有创建世界文档。':message(error);
        this.status=retainPrior?'续跑未开始；原候选和保存记录已保留，请核对当前连接与来源。':'生成未完成；已保存的有效草稿可继续。';
        if(!retainPrior)this.queueRecoverySave();
      }
      finally{releaseForgeAiJob(this);this.busy=false;this.aiRunning=false;if(!this.closed)void this.render();}
    }
    private async translatePrepared(){
      if(this.busy||this.closed||!this.prepared||this.prepared.bundle.localization)return;
      if(!claimForgeAiJob(this)){this.error='已有Forge AI任务运行，请等待完成。';void this.render();return;}
      const original=this.prepared;const revision=this.fileRevision;
      const priorDrafts=[...this.translationReport],previousDraft=this.localizationDraft;
      const controller=new AbortController();this.controller=controller;
      this.clearReportDownload();if(this.textView?.kind!=='report')this.textView=undefined;
      this.busy=true;this.aiRunning=true;this.reviewed=false;this.translationReviewed=false;
      this.result=undefined;this.error='';this.translationReport=[...priorDrafts];this.localizationDraft=undefined;
      this.syncTranslationReport(original);
      this.status='正在生成中文草稿并做本地校验；不会请求付费模型审核。';void this.render();
      try{
        assertGm(game);assertExactRuntime(game);
        const options=environment.getAiOptions?.(controller);
        if(!options)throw new Error('请先在Intake连接页配置AI服务。');
        if(this.generationReviewBinding&&connectionOptionsHash(options)!==this.generationReviewBinding.optionsHash)
          this.generationReviewBinding=undefined;
        this.rememberSecrets(options);
        assertEncounterSecretsAbsent(serializeForgeEncounterPackage(original.bundle),this.forbiddenValues);
        const {translationService}=(environment.createEncounterIntakeProviders??createEncounterIntakeProviders)(options,controller.signal);
        if(!translationService)throw new Error('当前连接没有翻译服务。');
        const draft=await draftForgeEncounterLocalization({prepared:original,service:translationService,signal:controller.signal,priorDrafts,
          onProgress:message=>{if(this.closed||revision!==this.fileRevision||this.prepared!==original)return;
            this.status=message;const status=(this.element as HTMLElement)?.querySelector('[data-encounter-status]');if(status)status.textContent=message;},
          onReview:entry=>{assertEncounterSecretsAbsent(JSON.stringify(entry),this.forbiddenValues);
            if(this.closed||this.controller!==controller||revision!==this.fileRevision||this.prepared!==original)return;
            const index=this.translationReport.findIndex(prior=>prior.actorKey===entry.actorKey);if(index<0)this.translationReport.push(entry);else this.translationReport[index]=entry;
            this.syncTranslationReport(original);this.refreshReportPresentation();
            const view=(this.element as HTMLElement)?.querySelector<HTMLTextAreaElement>('[data-encounter-view-text]');
            if(view&&this.textView?.kind==='report')view.value=this.textView.text;
            if(entry.status==='draft_ready'||entry.status==='needs_review')void this.render();
            this.queueRecoverySave();},
        });
        controller.signal.throwIfAborted();
        if(this.closed||revision!==this.fileRevision||this.prepared!==original)throw new Error('来源已改变，请重新生成中文草稿。');
        assertGm(game);assertExactRuntime(game);
        assertForgeEncounterLocalizationDraft(original,draft);
        assertEncounterSecretsAbsent(JSON.stringify(draft),this.forbiddenValues);
        this.localizationDraft=draft;
        this.syncTranslationReport(original);
        this.queueRecoverySave();this.status='中文草稿已通过本地校验，AI 审核未请求；请由 GM 逐项核对并明确批准。';
      }catch(error){if(previousDraft&&this.prepared===original){try{assertForgeEncounterLocalizationDraft(original,previousDraft);this.localizationDraft=previousDraft;}catch{}}
        if(!this.translationReport.length)this.translationReport=priorDrafts;
        this.syncTranslationReport(original);
        this.error=controller.signal.aborted?'中文草稿生成已取消。':message(error);this.status='中文草稿未完成；原语言包仍可供 GM 核对。';this.queueRecoverySave();}
      finally{releaseForgeAiJob(this);this.busy=false;this.aiRunning=false;if(!this.closed)void this.render();}
    }
    private reviseLocalizationBody(actorKey:string|undefined,textId:string,text:string,
      expectedPrepared?:PreparedForgeEncounter,expectedDraft?:ForgeEncounterLocalizationDraft):void {
      if(this.busy||this.closed||this.result)return;
      this.translationReviewed=false;this.reviewed=false;this.error='';
      try{
        assertGm(game);assertExactRuntime(game);
        const draft=this.localizationDraft??this.aiReport?.localizationDraft;
        if(!this.prepared||!draft||this.prepared!==expectedPrepared||draft!==expectedDraft)
          throw new Error('来源或草稿已改变，请重新打开当前正文后修正。');
        const next=reviseForgeEncounterLocalizationBody({prepared:this.prepared,draft,actorKey,textId,text});
        assertEncounterSecretsAbsent(JSON.stringify(next),this.forbiddenValues);
        const part=actorKey===undefined?next.packageText:next.actors.find(actor=>actor.key===actorKey)!;
        const meaningFindings=localizationMeaningFindings(part.request,part.draft);
        const progress:EncounterLocalizationProgress={status:meaningFindings.length?'needs_review':'draft_ready',actorKey,request:part.request,draft:part.draft,findings:meaningFindings};
        const index=this.translationReport.findIndex(entry=>entry.actorKey===actorKey);
        if(index<0)this.translationReport.push(progress);else this.translationReport[index]=progress;
        this.localizationDraft=next;
        if(this.recoveryReport){this.recoveryReport={...this.recoveryReport,localizationDraft:next,localization:this.translationReport};this.aiReport=this.recoveryReport;}
        this.clearReportPresentation();this.syncTranslationReport(this.prepared);this.queueRecoverySave();
        this.status=meaningFindings.length?'正文已保存；仍有来源含义或正文残留问题，须按提示修正后才能批准。未请求 AI。':'正文修正已通过本地校验；请重新核对当前草稿并批准。未请求 AI。';
      }catch(error){this.error=message(error);this.status='正文修正未保存，原有效草稿保留；请核对来源、数值和术语。';}
      void this.render();
    }
    private async approveLocalization():Promise<void>{
      if(this.busy||this.closed||!this.translationReviewed||!this.prepared||this.prepared.bundle.localization||!this.localizationDraft)return;
      const original=this.prepared,draft=this.localizationDraft,revision=this.fileRevision,gmId=game.user?.id;
      this.translationReviewed=false;this.reviewed=false;this.busy=true;this.error='';
      this.status='GM 正在本地批准中文草稿并通过正式工作流重新生成；不会请求 AI。';void this.render();
      const controller=new AbortController();this.controller=controller;
      try{
        assertGm(game);assertExactRuntime(game);
        if(typeof gmId!=='string'||!gmId.trim())throw new Error('缺少当前 GM 身份。');
        assertForgeEncounterLocalizationDraft(original,draft);
        const prepared=await approveForgeEncounterLocalization({prepared:original,draft,gmId,signal:controller.signal});
        controller.signal.throwIfAborted();
        if(this.closed||this.controller!==controller||revision!==this.fileRevision||this.prepared!==original
          ||this.localizationDraft!==draft||game.user?.id!==gmId)throw new Error('当前来源、草稿或 GM 身份已改变。');
        assertGm(game);assertExactRuntime(game);
        assertEncounterSecretsAbsent(serializeForgeEncounterPackage(prepared.bundle),this.forbiddenValues);
        this.prepared=prepared;this.generationReviewBinding=undefined;
        this.recoveryPackage=serializeForgeEncounterPackage(prepared.bundle);
        if(this.recoveryUploadedHash)this.recoveryUploadedHash=prepared.hash;
        if(this.recoveryReport){
          this.recoveryReport={...this.recoveryReport,packageHash:prepared.hash,outputLanguage:'zh-CN',localizationDraft:draft,
            localization:this.translationReport};
          this.aiReport=this.recoveryReport;
        }
        this.queueRecoverySave();
        this.status='GM 已本地批准中文译文；请重新核对正式中文候选，再另行确认导入。中文译文未请求 AI 审核。';
      }catch(error){this.error=controller.signal.aborted?'中文批准已取消。':message(error);this.status='中文草稿未成为正式候选；原语言包保留。';}
      finally{this.busy=false;if(!this.closed)void this.render();}
    }
    private async reviewCurrentCandidate():Promise<void>{
      if(this.busy||this.closed||!this.prepared||this.prepared.bundle.localization||!this.aiReport||this.result)return;
      const prepared=this.prepared,report=this.aiReport,source=this.humanSource,revision=this.fileRevision;
      if(report.source!==source||report.sourceHash!==hashSource(source)||report.packageHash!==prepared.hash){
        this.error='当前候选与来源报告不一致，不能发起 AI 审核。';void this.render();return;
      }
      const binding=this.generationReviewBinding;
      if(!binding||binding.sessionRevision!==this.sessionRevision||binding.sourceHash!==report.sourceHash
        ||binding.packageHash!==prepared.hash){
        this.error='当前候选没有本会话生成连接的有效证明，不能发起付费审核；GM 仍可本地确认。';void this.render();return;
      }
      if(!claimForgeAiJob(this)){this.error='已有 Forge AI 任务运行，请等待完成。';void this.render();return;}
      const controller=new AbortController();this.controller=controller;
      this.busy=true;this.aiRunning=true;this.reviewingCandidate=true;this.reviewed=false;this.translationReviewed=false;this.error='';
      this.status='正在显式审核当前候选；只复核现有内容，不重新生成、翻译或修正。';void this.render();
      try{
        assertGm(game);assertExactRuntime(game);
        const options=environment.getAiOptions?.(controller);
        if(!options)throw new Error('请先在 Forge · AI 连接中配置并测试当前模型。');
        this.rememberSecrets(options);
        if(connectionOptionsHash(options)!==binding.optionsHash||binding.sessionRevision!==this.sessionRevision)
          throw new Error('当前完整 AI 连接配置与生成候选时不同；旧候选不能发起付费审核。');
        const sameConnection=()=>{
          try{const current=environment.getAiOptions?.(controller);
            return !!current&&binding.sessionRevision===this.sessionRevision
              &&connectionOptionsHash(current)===binding.optionsHash;}catch{return false;}
        };
        const catalog=configuredConditionsCatalog(game),catalogHash=hashSource(JSON.stringify(catalog));
        const stillCurrent=()=>!this.closed&&this.controller===controller&&revision===this.fileRevision
          &&source===this.humanSource&&this.prepared===prepared&&sameConnection()
          &&hashSource(JSON.stringify(configuredConditionsCatalog(game)))===catalogHash;
        const providers=(environment.createEncounterIntakeProviders??createEncounterIntakeProviders)(options,controller.signal);
        if(providers.provider.extractionModel!==report.model||providers.provider.reviewModel!==report.reviewModel
          ||report.conditionCatalogHash!==catalogHash)throw new Error('模型或状态目录已改变，旧候选不能发起 AI 审核。');
        const output=await (environment.reviewForgeEncounterCandidate??reviewForgeEncounterCandidate)({
          source,report,prepared,provider:providers.provider,automationProvider:providers.automationProvider,
          translationService:providers.translationService,conditionCatalog:catalog,signal:controller.signal,
          onReport:next=>{assertEncounterSecretsAbsent(JSON.stringify(next),this.forbiddenValues);
            if(!stillCurrent())return;
            this.aiReport=next;this.recoveryReport=next;
            if(next.packageHash===prepared.hash)this.queueRecoverySave();},
        });
        controller.signal.throwIfAborted();
        if(!stillCurrent())throw new Error('来源、候选、连接或状态目录已改变；旧 AI 审核不适用。');
        assertGm(game);assertExactRuntime(game);
        this.aiReport=output.report;this.recoveryReport=output.report;
        this.translationReport=output.report.localization??this.translationReport;
        this.localizationDraft=output.localizationDraft??output.report.localizationDraft;
        if(output.prepared){
          if(output.report.packageHash!==output.prepared.hash)throw new Error('AI 审核结果与当前候选身份不一致。');
          assertEncounterSecretsAbsent(serializeForgeEncounterPackage(output.prepared.bundle),this.forbiddenValues);
          this.prepared=output.prepared;
          if(output.prepared.bundle.localization)this.generationReviewBinding=undefined;
          this.recoveryPackage=serializeForgeEncounterPackage(output.prepared.bundle);
        }else{this.prepared=undefined;this.recoveryPackage=undefined;}
        this.queueRecoverySave();
        const concerns=output.report.automationReview&&'verdict'in output.report.automationReview
          &&output.report.automationReview.verdict==='needs_review'
          ||output.report.actors.some(actor=>['needs_review','failed'].includes(actor.generation?.modelReviewStatus??''));
        this.status=output.prepared
          ?concerns?'AI 审核提出提示；请逐项核对。本地校验通过时仍可由 GM 明确人工确认导入。'
            :'当前候选已完成显式 AI 审核；仍须由 GM 核对并最终确认。'
          :'本地校验发现阻断问题；当前候选不可导入。';
      }catch(error){this.error=controller.signal.aborted?'AI 审核已取消。':message(error);
        this.status='AI 审核未完成；本地有效候选仍可由 GM 人工核对，不能把本次请求记作通过。';this.queueRecoverySave();}
      finally{releaseForgeAiJob(this);this.busy=false;this.aiRunning=false;this.reviewingCandidate=false;if(!this.closed)void this.render();}
    }
    private async preview() {
      if(this.busy||!this.file)return;
      this.clearReportPresentation();this.busy=true;this.error='';this.prepared=undefined;this.generationReviewBinding=undefined;this.localizationDraft=undefined;
      this.translationReviewed=false;this.result=undefined;this.reviewed=false;
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
        this.recoveryPackage=serializeForgeEncounterPackage(prepared.bundle);
        this.recoveryUploadedHash=prepared.hash;
        this.recoveryReport=undefined;this.aiReport=undefined;
        this.queueRecoverySave();
        this.status=`预览完成：${prepared.actors.length}个角色、${prepared.bundle.macros.length}个宏。请核对来源、宏代码和GM操作边界。`;
      }catch(error){this.error=message(error);this.status='预览未通过；没有创建世界文档。';}
      finally{this.busy=false;void this.render();}
    }
    private async previewRecovered():Promise<void> {
      if(this.busy||this.closed||!this.recoveryPackage||(!this.recoveryReport&&!this.recoveryUploadedHash))return;
      const revision=this.fileRevision,serialized=this.recoveryPackage,report=this.recoveryReport,uploadedHash=this.recoveryUploadedHash;
      this.clearReportPresentation();
      this.busy=true;this.reviewed=false;this.result=undefined;this.error='';this.status='正在重新校验本地保存的战斗包；不会请求 AI 或创建世界文档。';void this.render();
      const controller=new AbortController();this.controller=controller;
      try {
        const binding=this.recoveryBinding();
        if(this.recoveryCatalogHash!==binding.catalogHash||(report&&(report.source!==this.humanSource||report.sourceHash!==hashSource(this.humanSource))))
          throw new Error('来源或自定义状态目录已改变，保存的候选不能预览。');
        assertEncounterSecretsAbsent(serialized,this.forbiddenValues);
        const prepared=await prepareForgeEncounter(serialized,controller.signal);
        if(this.closed||revision!==this.fileRevision||this.controller!==controller||prepared.hash!==(report?.packageHash??uploadedHash))
          throw new Error('保存的候选身份已改变，请重新生成。');
        assertGm(game);assertExactRuntime(game);
        let verifiedProgress=this.translationReport;
        if(uploadedHash){const saved=this.recoveryUploadedProgress??this.translationReport;
          const checked=verifiedEncounterLocalizationProgress(prepared.bundle,prepared.actors,saved);
          verifiedProgress=checked.filter((entry,index)=>entry===saved[index]);}
        let verifiedDraft=report?.localizationDraft;
        if(uploadedHash&&this.recoveryUploadedDraft){try{assertForgeEncounterLocalizationDraft(prepared,this.recoveryUploadedDraft);
          verifiedDraft=this.recoveryUploadedDraft;}catch{verifiedDraft=undefined;}}
        this.prepared=prepared;this.generationReviewBinding=undefined;this.aiReport=report;this.localizationDraft=verifiedDraft;this.translationReviewed=false;this.recoveredReview=true;
        if(uploadedHash){this.translationReport=verifiedProgress;this.recoveryUploadedProgress=undefined;this.recoveryUploadedDraft=undefined;}
        this.status='已重新校验保存的候选；历史审核与中文草稿仅供核对，不会自动请求 AI 审核或继承 GM 确认。';
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
        if(loaded.version===2){
          this.recoveryPackage=loaded.package;this.recoveryUploadedHash=loaded.packageHash;
          this.recoveryUploadedProgress=loaded.translationReport;this.recoveryUploadedDraft=loaded.localizationDraft;
          this.translationReport=[];this.recoveryCatalogHash=loaded.catalogHash;
          this.generationReviewBinding=undefined;this.translationReviewed=false;this.reviewed=false;
          this.status='已恢复上传战斗包与部分译文；点击“重新预览”核对包和字段身份，不会请求 AI 或继承 GM 确认。';
          return;
        }
        this.humanSource=loaded.source;this.humanLabel=loaded.label;this.outputLanguage=loaded.outputLanguage;
        this.recoveryReport=loaded.report;
        this.generationReviewBinding=undefined;
        this.aiReport=loaded.report;
        this.recoveryPackage=loaded.package;
        this.translationReport=loaded.translationReport??loaded.report?.localization??[];
        this.localizationDraft=loaded.report?.localizationDraft;
        this.translationReviewed=false;
        this.recoveryCatalogHash=loaded.catalogHash;
        this.checkpointEnabled=true;
        this.status=loaded.package
          ? '已恢复本地来源和候选记录；点击“重新预览”正式校验，之后仍须 GM 重新确认。'
          : loaded.report?.actors.some(actor=>actor.analysis?.ir)
          ? '已恢复本地来源与草稿；点击“继续任务”重新验证并做本地校验，不会自动请求付费审核或导入。'
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
        if(this.recoveryUploadedHash&&this.recoveryPackage){
          const options=environment.getRecoverySecrets?.()??(()=>{const current=readForgeSessionSettings();return{apiKey:current.apiKey,baseUrl:current.endpoint,otherKeys:Object.values(current.savedApiKeys)};})();
          this.rememberSecrets(options);
          const binding=this.recoveryBinding();
          let draft=this.prepared?this.localizationDraft:this.recoveryUploadedDraft;
          if(draft&&this.prepared){try{assertForgeEncounterLocalizationDraft(this.prepared,draft);}catch{draft=undefined;}}
          const snapshot:EncounterRecoverySnapshot={version:2,kind:'uploaded-package',...binding,
            package:this.recoveryPackage,packageHash:this.recoveryUploadedHash,
            packageSha256:hashSource(this.recoveryPackage),translationReport:this.prepared?this.translationReport:this.recoveryUploadedProgress??[],
            ...(draft?{localizationDraft:draft}:{})};
          assertEncounterSecretsAbsent(JSON.stringify(snapshot),this.forbiddenValues);
          this.pendingSave=this.recoveryStore.save(snapshot);await this.pendingSave;return;
        }
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
          ...(report&&this.recoveryPackage?{package:this.recoveryPackage}:{}),
          ...(report&&this.translationReport.length?{translationReport:this.translationReport}:{})};
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
      this.prepared=undefined;this.generationReviewBinding=undefined;this.result=undefined;this.reviewed=false;this.aiReport=undefined;
      this.recoveryReport=undefined;this.recoveryPackage=undefined;this.recoveryUploadedHash=undefined;this.recoveryUploadedProgress=undefined;this.recoveryUploadedDraft=undefined;this.recoveredReview=false;this.translationReport=[];this.localizationDraft=undefined;this.translationReviewed=false;this.progressDetail='';
      try {if(this.recoveryStore){this.pendingSave=this.recoveryStore.clear();await this.pendingSave;}
        this.error='';this.status='已清除当前世界与 GM 的本地战斗包任务。';}
      catch(error){this.error=`本地任务清除失败：${message(error)}`;this.status='本地任务可能仍在，请核对后重试。';}
      if(!this.closed)void this.render();
    }
    private clearReportDownload() {
      const prior=this.reportDownload;
      this.reportDownload=undefined;
      this.reportDownloadText=undefined;
      if(prior)(environment.window?.URL??globalThis.URL).revokeObjectURL(prior.url);
    }
    private clearReportPresentation():void {this.clearReportDownload();this.textView=undefined;}
    private refreshReportPresentation():void {
      if(!this.textView&&!this.reportDownload)return;
      try{
        const reportText=this.textView?.kind==='report'||this.reportDownload?this.currentReportText():undefined;
        if(this.reportDownload&&this.reportDownloadText!==reportText)this.clearReportDownload();
        if(this.textView){const current=this.textView.kind==='report'?reportText!:this.textView.kind==='actor'?this.currentActorText(this.textView.actorKey!):this.currentPackageText();
          if(this.textView.text!==current)this.textView={...this.textView,text:current};}
      }catch{this.clearReportPresentation();}
    }
    private refreshKnownSecrets():void {
      const options=environment.getRecoverySecrets?.()??(()=>{const current=readForgeSessionSettings();return{apiKey:current.apiKey,baseUrl:current.endpoint,otherKeys:Object.values(current.savedApiKeys)};})();
      this.rememberSecrets(options);
    }
    private syncTranslationReport(prepared:PreparedForgeEncounter):void {
      const report=this.aiReport??this.recoveryReport;
      if(!report||report.source!==this.humanSource||report.sourceHash!==hashSource(this.humanSource)
        ||report.packageHash!==prepared.hash||this.prepared!==prepared)return;
      const next={...report,localization:[...this.translationReport],localizationDraft:this.localizationDraft};
      this.aiReport=next;this.recoveryReport=next;
    }
    private currentReportText():string {
      if(!this.aiReport&&!this.translationReport.length&&!this.prepared?.bundle.localization)throw new Error('当前没有可查看的审核记录。');
      if(this.aiReport&&(this.aiReport.source!==this.humanSource||this.aiReport.sourceHash!==hashSource(this.humanSource)))
        throw new Error('来源已改变，旧审核记录不能使用。');
      this.refreshKnownSecrets();
      const intake=this.aiReport&&this.translationReport.length?{...this.aiReport,localization:this.translationReport}:this.aiReport;
      const text=JSON.stringify(this.translationReport.length||this.prepared?.bundle.localization
        ?{intake:intake??null,localization:this.translationReport.length?this.translationReport:this.prepared?.bundle.localization,sourcePackage:this.prepared?.bundle}:intake,null,2);
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
    private currentActorReport():EncounterIntakeReport|undefined{
      const report=this.aiReport;
      return report?.source===this.humanSource&&report.sourceHash===hashSource(this.humanSource)?report:undefined;
    }
    private currentActorText(key:string):string{
      assertGm(game);assertExactRuntime(game);
      const report=this.currentActorReport();if(!report)throw new Error('生物来源已改变，旧候选不可获取。');
      this.refreshKnownSecrets();
      const text=JSON.stringify(encounterActorCandidate(report,key).artifact,null,2);
      assertEncounterSecretsAbsent(text,this.forbiddenValues);return text;
    }
    private viewActorCandidate(key:string):void{
      if(this.closed||this.busy)return;
      try{this.textView={kind:'actor',actorKey:key,name:`forge-${key}-candidate.json`,text:this.currentActorText(key)};
        this.error='';this.status='当前生物的完整候选 JSON 已展开；其检查问题仍保留，这不是完整战斗包。';}
      catch(error){this.textView=undefined;this.error=message(error);}
      if(!this.closed)void this.render();
    }
    private downloadActorCandidate(key:string):void{
      if(this.closed||this.busy)return;
      try{download(`forge-${key}-candidate.json`,this.currentActorText(key),'application/json');
        this.error='';this.status='已请求下载当前生物候选 JSON；完整战斗包及检查结论保持原状态。';}
      catch(error){this.error=message(error);}
      if(!this.closed)void this.render();
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
      try {text=current.kind==='report'?this.currentReportText():current.kind==='actor'?this.currentActorText(current.actorKey!):this.currentPackageText();if(text!==current.text)throw new Error('可见内容已改变。');}
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
        this.reportDownloadText=text;
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
      this.closed=true;this.generationReviewBinding=undefined;this.sessionUnsubscribe?.();this.sessionUnsubscribe=undefined;
      this.clearReportPresentation();this.controller?.abort();const win=environment.window??(globalThis as any).window;win?.removeEventListener?.('beforeunload',this.pageGuard);
      return super.close(options);
    }
  };
}
function message(error:unknown):string{return error instanceof Error?error.message:String(error);}
function connectionOptionsHash(options:BrowserAiProviderOptions):string{
  return hashSource(JSON.stringify({apiKey:options.apiKey,baseUrl:options.baseUrl,providerId:options.providerId,
    model:options.model,reviewModel:options.reviewModel,protocol:options.protocol,authScheme:options.authScheme,
    region:options.region,reasoning:options.reasoning,reasoningEffort:options.reasoningEffort,
    structuredOutput:options.structuredOutput,autoCorrect:options.autoCorrect===true,timeoutMs:options.timeoutMs,repairTimeoutMs:options.repairTimeoutMs,
    encounterRetryBudgetMs:options.encounterRetryBudgetMs,
    waitCycleMs:options.waitPolicy?.cycleMs,waitCyclesBeforeDecision:options.waitPolicy?.cyclesBeforeDecision}));
}
function sessionSettingsHash():string{
  const settings=readForgeSessionSettings();
  return hashSource(JSON.stringify({apiKey:settings.apiKey,endpoint:settings.endpoint,providerId:settings.providerId,
    model:settings.model,reviewModel:settings.reviewModel,protocol:settings.protocol,authScheme:settings.authScheme,
    region:settings.region,reasoning:settings.reasoning,structuredOutput:settings.structuredOutput,autoCorrect:settings.autoCorrect}));
}
function encounterRetryLabel(stage:string):string{
  return ({discover:'识别生物',extract:'提取规则',review:'来源审核',repair:'修正草稿',
    'automation-generate':'固定能力提取','automation-review':'自动化简要复核'} as Record<string,string>)[stage]??'当前阶段';
}
// Core 14.368 promotes document-level hyperlinks to new tabs, including downloads.
function preserveNativeDownload(event:Event):void{event.stopPropagation();}
function displayText(value:unknown):string{
  if(typeof value!=='string')return '';
  // Decode once after removing generated markup. Authored escaped tags remain
  // visible text and are escaped by Handlebars, never interpreted as HTML.
  const entities:Record<string,string>={nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  return value.replace(/<\/(?:p|li|div|aside|h[1-6])>|<br\s*\/?\s*>/giu,'\n').replace(/<[^>]*>/gu,'')
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu,entity=>{
      const key=entity.slice(1,-1).toLowerCase();if(entities[key]!==undefined)return entities[key];
      const code=key.startsWith('#x')?Number.parseInt(key.slice(2),16):Number.parseInt(key.slice(1),10);
      return [34,38,39,60,62,160].includes(code)?String.fromCodePoint(code):entity;
    }).trim();
}
function download(name:string,content:string|Uint8Array,type:string){
  const url=URL.createObjectURL(new Blob([content as any],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
