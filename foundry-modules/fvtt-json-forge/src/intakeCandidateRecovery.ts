import { hashSource, hashArtifact, decodeForgeActorResponse, decodeForgeItemResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import { assertCurrentBrowserActorIntakeCandidate, analyzeBrowserActorIntakeDraft, generateBrowserActorIntakeCandidate, type BrowserActorGenerationResult, type BrowserActorIntakeInput } from '@fvtt-json-generator/forge-browser-runtime/ai';
import { assertCurrentBrowserItemIntakeCandidate, generateBrowserItemIntakeCandidate, type BrowserItemGenerationResult } from '@fvtt-json-generator/forge-browser-runtime/item-intake';
import { decodeForgeIntakeReviewBundleText, serializeForgeIntakeReviewBundleV2, type ForgeIntakeReviewBundleV2 } from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';

export const INTAKE_CANDIDATE_DATABASE = 'fvtt-json-forge-intake-candidates';
export const INTAKE_CANDIDATE_MAX_BYTES = 8 * 1024 * 1024;
export const INTAKE_CANDIDATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
type Input = Omit<BrowserActorIntakeInput, 'onStage' | 'renderMarkdown' | 'sourceId' | 'autoCorrect'>;
export const INTAKE_CANDIDATE_GENERATION_CONTRACTS = {
  'ai-monster': 'monster-ai-owned-projection-v1',
  'ai-item': 'item-evidence-projection-v1',
} as const;
export interface IntakeCandidateRepairOrigin {
  candidate: BrowserActorGenerationResult;
  bundle: ForgeIntakeReviewBundleV2;
}
export interface IntakeCandidateRecord {
  version: 1 | 2;
  generationContract?: typeof INTAKE_CANDIDATE_GENERATION_CONTRACTS[keyof typeof INTAKE_CANDIDATE_GENERATION_CONTRACTS];
  repairOrigin?: IntakeCandidateRepairOrigin;
  savedAt: string;
  queueAttempt?: number;
  mode: 'ai-monster' | 'ai-item';
  input: Input;
  bundle: ForgeIntakeReviewBundleV2;
  candidate: BrowserActorGenerationResult | BrowserItemGenerationResult;
  checksum: string;
}
export interface IntakeCandidateStore {
  load(): Promise<Record<string, IntakeCandidateRecord>>;
  put(key: string, value: IntakeCandidateRecord, guard?: () => void): Promise<void>;
  clear(key: string, guard?: () => void): Promise<void>;
  reset(guard?: () => void): Promise<void>;
}
function serialized(value: unknown): string { return JSON.stringify(value); }
function jsonHash(value: unknown) { const json = JSON.parse(serialized(value)); return hashArtifact(Array.isArray(json) ? { value: json } : json); }
function keyAllowed(key: string) { return key === 'single' || /^job:v1:[0-9a-f]{64}$/u.test(key); }
function assertSize(value: string) { if (new TextEncoder().encode(value).length > INTAKE_CANDIDATE_MAX_BYTES) throw Error('完整候选超过8MiB本地恢复额度；当前候选仍可使用。'); }
// Source-library exports intentionally forbid artifacts; this private local
// store needs the artifact, but never credentials or raw provider payloads.
function assertSecretsAbsent(content: string, secrets: readonly string[]) {
  if (/"(?:apiKey|authorization|cookie|endpoint|rawResponse)"\s*:/iu.test(content)
    || /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/iu.test(content)
    || secrets.some(value => value.trim() && (content.includes(value.trim()) || content.includes(JSON.stringify(value.trim()).slice(1,-1))))) {
    throw Error('完整候选包含凭据或原始 Provider 内容，未保存。');
  }
}
function body(record: IntakeCandidateRecord) { const { checksum, ...value } = record; return value; }

export function captureIntakeCandidate(input: Input, mode: IntakeCandidateRecord['mode'], bundle: ForgeIntakeReviewBundleV2,
  generation: IntakeCandidateRecord['candidate'], secrets: readonly string[] = [], now = Date.now(), queueAttempt?: number,
  repairOrigin?: IntakeCandidateRepairOrigin): IntakeCandidateRecord {
  const candidate = JSON.parse(serialized(generation));
  delete candidate.gmApproval; delete candidate.response;
  candidate.status = 'ready_for_gm_review';
  const savedBundle = { ...bundle, status: 'ready_for_gm_review' as const };
  delete savedBundle.gmApproval;
  const safeInput: Input = { source: input.source, sourceName: input.sourceName, displayName: input.displayName,
    requestId: input.requestId, fvttVersion: input.fvttVersion, systemVersion: input.systemVersion };
  const sourceScope=mode==='ai-monster'?(generation as BrowserActorGenerationResult).analysis.sourceScope??input.sourceScope:undefined;
  if(sourceScope!==undefined)safeInput.sourceScope=sourceScope;
  const origin = repairOrigin ? JSON.parse(serialized(repairOrigin)) as IntakeCandidateRepairOrigin : undefined;
  if(origin){
    delete origin.candidate.gmApproval; delete origin.candidate.response; origin.candidate.status='ready_for_gm_review';
    delete origin.bundle.gmApproval; origin.bundle.status='ready_for_gm_review';
  }
  const value = JSON.parse(serialized({ version: 2, generationContract: INTAKE_CANDIDATE_GENERATION_CONTRACTS[mode],
    savedAt: new Date(now).toISOString(), queueAttempt, mode, input: safeInput, bundle: savedBundle, candidate, ...(origin?{repairOrigin:origin}:{}) }));
  const text = serialized(value); assertSize(text); assertSecretsAbsent(text, secrets);
  const record: IntakeCandidateRecord = { ...value, checksum: hashSource(text) };
  assertRecord(record, input, now);
  return record;
}

function assertRecord(record: IntakeCandidateRecord, target: Pick<Input, 'fvttVersion' | 'systemVersion'>, now: number) {
  assertSize(serialized(record)); assertSecretsAbsent(serialized(record),[]);
  const allowed=['version','savedAt','queueAttempt','mode','input','bundle','candidate','checksum',
    ...(record?.version===2?['generationContract','repairOrigin']:[])];
  if (!record || ![1,2].includes(record.version) || Object.keys(record).some(k => !allowed.includes(k))
    || record.queueAttempt !== undefined && (!Number.isSafeInteger(record.queueAttempt) || record.queueAttempt < 1)
    || !['ai-monster','ai-item'].includes(record.mode) || record.checksum !== hashSource(serialized(body(record)))) throw Error('保存候选损坏或格式版本不受支持。');
  if(record.version===2&&record.generationContract!==INTAKE_CANDIDATE_GENERATION_CONTRACTS[record.mode]) {
    throw Error('这份候选使用的生成格式版本与当前程序不兼容，无法安全恢复；原记录保留。请使用兼容版本打开。');
  }
  if(record.version===2&&(!Number.isSafeInteger(record.candidate?.analysis?.repairCount)||record.candidate.analysis.repairCount<0
    ||record.candidate.analysis.repairCount>1||!Number.isSafeInteger(record.candidate.calls?.repair)||record.candidate.calls.repair<0
    ||record.candidate.calls.repair>record.candidate.analysis.repairCount))throw Error('保存候选的修正次数与累计调用不一致。');
  const age = now - Date.parse(record.savedAt);
  if (!Number.isFinite(age) || age < -300_000 || age > INTAKE_CANDIDATE_MAX_AGE_MS) throw Error('保存候选已过期（保留7天）；请显式重新准备。');
  const {input,candidate}=record;
  if(input.sourceScope!==undefined&&(!['single','discover'].includes(input.sourceScope)||record.mode!=='ai-monster'))throw Error('保存候选的生物来源范围无效。');
  const bundle=decodeForgeIntakeReviewBundleText(serializeForgeIntakeReviewBundleV2(record.bundle)).bundle;
  if (input.fvttVersion !== target.fvttVersion || input.systemVersion !== target.systemVersion
    || bundle.mode !== record.mode || bundle.status !== 'ready_for_gm_review' || bundle.gmApproval || candidate.gmApproval
    || candidate.status !== 'ready_for_gm_review' || input.source !== bundle.rawSource
    || input.requestId !== bundle.requestId || candidate.candidateHash !== bundle.candidateHash
    || bundle.rawSourceHash !== hashSource(input.source)) throw Error('保存候选与当前来源、目标或审批状态不一致。');
  const decoded = record.mode === 'ai-item' ? decodeForgeItemResponse(candidate.candidateResponse) : decodeForgeActorResponse(candidate.candidateResponse);
  if (!decoded.ok || !('result' in decoded.value) || !('artifact' in decoded.value.result) || !decoded.value.result.artifact) throw Error('保存候选缺少完整有效产物。');
  const result=decoded.value.result;
  if (bundle.candidateResponse?.artifactHash !== jsonHash(result.artifact) || bundle.candidateResponse.status !== result.status
    || bundle.sourceIdentity?.sourceId !== result.sourceIdentity.sourceId || bundle.sourceIdentity.finalSourceHash !== result.sourceIdentity.sourceHash) throw Error('保存候选的来源或产物指纹不一致。');
  if(record.mode==='ai-monster')assertCurrentBrowserActorIntakeCandidate(input,candidate as BrowserActorGenerationResult);
  else assertCurrentBrowserItemIntakeCandidate(input,candidate as BrowserItemGenerationResult);
  const resistance=(result.artifact as any)?.system?.resources?.legres?.max;
  if(record.version===2&&record.mode==='ai-monster'&&Number.isSafeInteger(resistance)&&resistance>0
    &&(candidate as BrowserActorGenerationResult).analysis.ir?.creature.legendary?.resistanceMax===undefined){
    throw Error(`这份候选的角色数据是${resistance}次传奇抗性，但同时保存的提取数据没有对应的独立计数，无法核对恢复是否完整；原记录保留。`);
  }
  if(record.repairOrigin!==undefined){
    const origin=record.repairOrigin;
    if(!origin||typeof origin!=='object'||Array.isArray(origin))throw Error('修正前候选格式不受支持。');
    const candidateKeys=['candidateAvailable','status','analysis','rawSourceHash','finalSourceHash','finalSource','markdown','evidence',
      'candidateResponse','candidateHash','modelReviewStatus','modelReviewError','deterministicFindings','modelReviewFindings',
      'modelReviewFindingsHash','actorProjection','formalStatus','intakeVerificationStatus','review','findings','stages','provider','calls','errorCode'];
    const analysisKeys=['status','sourceScope','attemptId','rawSourceHash','candidates','candidate','ir','validation','evidence','findings','stages','provider','calls','repairCount','errorCode'];
    if(record.mode!=='ai-monster'||Object.keys(origin).some(key=>!['candidate','bundle'].includes(key))
      ||!origin.candidate||!origin.bundle||origin.bundle.attemptId!==bundle.attemptId
      ||Object.keys(origin.candidate).some(key=>!candidateKeys.includes(key))||Object.hasOwn(origin.bundle,'repairOrigin')
      ||!origin.candidate.analysis||Object.keys(origin.candidate.analysis).some(key=>!analysisKeys.includes(key))
      ||origin.candidate.analysis?.attemptId!==candidate.analysis.attemptId
      ||origin.candidate.analysis?.repairCount!==0||candidate.analysis.repairCount!==1
      ||JSON.stringify(origin.candidate.provider)!==JSON.stringify(candidate.provider))throw Error('修正前候选的身份或次数不一致。');
    const originBody={version:1 as const,savedAt:record.savedAt,mode:record.mode,input,bundle:origin.bundle,candidate:origin.candidate};
    assertRecord({...originBody,checksum:hashSource(serialized(originBody))},target,now);
  }
  return result;
}

/** No network provider is constructed. Current validators/renderers/workflows
 * must reproduce the saved formal response before any candidate is restored. */
export async function revalidateIntakeCandidate(record: IntakeCandidateRecord,
  target: Pick<Input,'fvttVersion'|'systemVersion'>, now = Date.now()): Promise<IntakeCandidateRecord> {
  const result=assertRecord(record,target,now), saved=record.candidate;
  const forbidden=async()=>{throw Error('候选本地重验不得请求模型。');};
  const provider={...saved.provider,discover:forbidden,extract:forbidden,review:forbidden,repair:forbidden} as any;
  const input={...record.input,sourceId:result.sourceIdentity.sourceId,autoCorrect:false};
  const analysis=record.mode==='ai-monster'
    ? {...(saved as BrowserActorGenerationResult).analysis,...analyzeBrowserActorIntakeDraft(input as BrowserActorIntakeInput,(saved as BrowserActorGenerationResult).analysis.ir!,provider),
      attemptId:saved.analysis.attemptId,calls:saved.analysis.calls,repairCount:saved.analysis.repairCount,stages:saved.analysis.stages}
    :saved.analysis;
  const fresh=record.mode==='ai-item'
    ? await generateBrowserItemIntakeCandidate(input as any,saved.analysis as any,provider)
    : await generateBrowserActorIntakeCandidate(input as any,analysis as any,provider);
  if(record.mode==='ai-monster'){
    const ir=(saved as BrowserActorGenerationResult).analysis.ir;
    const savedCapacity=(result.artifact as any)?.system?.resources?.legres?.max;
    const freshResponse=fresh.candidateResponse;
    const freshArtifact=freshResponse&&'result'in freshResponse&&'artifact'in freshResponse.result?freshResponse.result.artifact:undefined;
    const freshCapacity=(freshArtifact as any)?.system?.resources?.legres?.max;
    // A saved native value is evidence of a historical representation gap,
    // never a source from which to fill or overwrite the current model IR.
    if(ir?.creature.legendary?.resistanceMax===undefined&&Number.isSafeInteger(savedCapacity)&&savedCapacity>0
      &&freshCapacity!==undefined&&freshCapacity!==savedCapacity){
      throw Error(`保存候选的传奇抗性为${savedCapacity}次，但其旧中间数据未保存独立计数，当前版本无法无损重建；请重新提取。原记录保留。`);
    }
  }
  if(fresh.status!=='ready_for_gm_review' || fresh.finalSource!==saved.finalSource
    || jsonHash(fresh.candidateResponse)!==jsonHash(saved.candidateResponse)
    || jsonHash(fresh.deterministicFindings??fresh.findings)!==jsonHash(saved.deterministicFindings??saved.findings)) {
    throw Error('当前生成器重验与保存候选不同；旧结果未恢复，请显式重新准备。');
  }
  return JSON.parse(serialized(record));
}

type Envelope={version:1;revision:number;entries:Record<string,IntakeCandidateRecord>};
function decode(raw:string|null):Envelope {
  if(raw===null)return{version:1,revision:0,entries:{}};
  assertSize(raw);const value=JSON.parse(raw);
  if(!value||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0
    ||Object.keys(value).some(k=>!['version','revision','entries'].includes(k))||!value.entries||typeof value.entries!=='object'||Array.isArray(value.entries)
    ||Object.keys(value.entries).length>2001||Object.keys(value.entries).some(k=>!keyAllowed(k)))throw Error('本地候选存储格式损坏。');
  return value;
}
export class MemoryIntakeCandidateStore implements IntakeCandidateStore {
  private raw:string|null=null;
  constructor(private readonly initial?:Record<string,IntakeCandidateRecord>){if(initial)this.raw=serialized({version:1,revision:1,entries:initial});}
  async load(){return structuredClone(decode(this.raw).entries);}
  async put(key:string,value:IntakeCandidateRecord,guard?:()=>void){if(!keyAllowed(key))throw Error('Invalid recovery key');const state=decode(this.raw);state.entries[key]=value;await this.write(state,guard);}
  async clear(key:string,guard?:()=>void){const state=decode(this.raw);delete state.entries[key];await this.write(state,guard);}
  async reset(guard?:()=>void){guard?.();this.raw=null;}
  private async write(state:Envelope,guard?:()=>void){state.revision++;const text=serialized(state);assertSize(text);guard?.();this.raw=text;}
}

/** One bounded CAS envelope per world/GM. It stores no keys or tested-connection
 * state. Each operation closes its DB connection; clear never deletes a DB. */
export class IndexedDbIntakeCandidateStore implements IntakeCandidateStore {
  private base:string|null|undefined;
  private pending=Promise.resolve();
  constructor(private readonly scopeId:string,private readonly factory:IDBFactory|undefined=globalThis.indexedDB){if(!scopeId.trim())throw Error('Missing world/GM recovery scope');}
  async load(){const db=await this.open();try{const tx=db.transaction('candidates','readonly');const done=completed(tx);const raw=await requested<string|undefined>(tx.objectStore('candidates').get(this.scopeId));await done;this.base=raw??null;return structuredClone(decode(this.base).entries);}finally{db.close();}}
  put(key:string,value:IntakeCandidateRecord,guard?:()=>void){if(!keyAllowed(key))throw Error('Invalid recovery key');return this.change(state=>{state.entries[key]=value;},guard);}
  clear(key:string,guard?:()=>void){return this.change(state=>{delete state.entries[key];},guard);}
  reset(guard?:()=>void){return this.change(state=>{state.entries={};},guard,true);}
  private change(update:(state:Envelope)=>void,guard?:()=>void,reset=false){
    const next=this.pending.catch(()=>undefined).then(async()=>{
      if(this.base===undefined)await this.load();
      const db=await this.open();try{
        const tx=db.transaction('candidates','readwrite'),done=completed(tx),store=tx.objectStore('candidates');
        try{
          const raw=(await requested<string|undefined>(store.get(this.scopeId)))??null;
          if(raw!==this.base)throw Error('另一窗口已更新保存候选；请关闭旧页并重新打开，当前页面结果仍可使用。');
          const state=reset?{version:1 as const,revision:Date.now(),entries:{}}:decode(raw);update(state);state.revision++;
          const text=serialized(state);assertSize(text);guard?.();store.put(text,this.scopeId);await done;this.base=text;
        }catch(error){try{tx.abort();}catch{}await done.catch(()=>undefined);throw error;}
      }finally{db.close();}
    });this.pending=next;return next;
  }
  private open():Promise<IDBDatabase>{if(!this.factory)return Promise.reject(Error('浏览器存储不可用；完整候选暂不能跨刷新恢复。'));
    return new Promise((resolve,reject)=>{const r=this.factory!.open(INTAKE_CANDIDATE_DATABASE,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('candidates'))r.result.createObjectStore('candidates');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('候选存储被另一窗口阻塞。'));});}
}
function requested<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function completed(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('Candidate storage transaction aborted'));});}
