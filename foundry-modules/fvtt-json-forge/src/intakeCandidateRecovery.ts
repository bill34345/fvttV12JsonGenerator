import { hashSource, hashArtifact, decodeForgeActorResponse, decodeForgeItemResponse } from '@fvtt-json-generator/forge-gateway-protocol';
import { assertCurrentBrowserActorIntakeCandidate, generateBrowserActorIntakeCandidate, type BrowserActorGenerationResult, type BrowserActorIntakeInput } from '@fvtt-json-generator/forge-browser-runtime/ai';
import { assertCurrentBrowserItemIntakeCandidate, generateBrowserItemIntakeCandidate, type BrowserItemGenerationResult } from '@fvtt-json-generator/forge-browser-runtime/item-intake';
import { decodeForgeIntakeReviewBundleText, serializeForgeIntakeReviewBundleV2, type ForgeIntakeReviewBundleV2 } from '@fvtt-json-generator/forge-browser-runtime/intake-review-import';

export const INTAKE_CANDIDATE_DATABASE = 'fvtt-json-forge-intake-candidates';
export const INTAKE_CANDIDATE_MAX_BYTES = 8 * 1024 * 1024;
export const INTAKE_CANDIDATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
type Input = Omit<BrowserActorIntakeInput, 'onStage' | 'renderMarkdown' | 'sourceId' | 'autoCorrect'>;
export interface IntakeCandidateRecord {
  version: 1;
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
  generation: IntakeCandidateRecord['candidate'], secrets: readonly string[] = [], now = Date.now(), queueAttempt?: number): IntakeCandidateRecord {
  const candidate = JSON.parse(serialized(generation));
  delete candidate.gmApproval; delete candidate.response;
  candidate.status = 'ready_for_gm_review';
  const savedBundle = { ...bundle, status: 'ready_for_gm_review' as const };
  delete savedBundle.gmApproval;
  const safeInput: Input = { source: input.source, sourceName: input.sourceName, displayName: input.displayName,
    requestId: input.requestId, fvttVersion: input.fvttVersion, systemVersion: input.systemVersion };
  const value = JSON.parse(serialized({ version: 1, savedAt: new Date(now).toISOString(), queueAttempt, mode, input: safeInput, bundle: savedBundle, candidate }));
  const text = serialized(value); assertSize(text); assertSecretsAbsent(text, secrets);
  const record: IntakeCandidateRecord = { ...value, checksum: hashSource(text) };
  assertRecord(record, input, now);
  return record;
}

function assertRecord(record: IntakeCandidateRecord, target: Pick<Input, 'fvttVersion' | 'systemVersion'>, now: number) {
  if (!record || record.version !== 1 || Object.keys(record).some(k => !['version','savedAt','queueAttempt','mode','input','bundle','candidate','checksum'].includes(k))
    || record.queueAttempt !== undefined && (!Number.isSafeInteger(record.queueAttempt) || record.queueAttempt < 1)
    || !['ai-monster','ai-item'].includes(record.mode) || record.checksum !== hashSource(serialized(body(record)))) throw Error('保存候选损坏或格式版本不受支持。');
  const age = now - Date.parse(record.savedAt);
  if (!Number.isFinite(age) || age < -300_000 || age > INTAKE_CANDIDATE_MAX_AGE_MS) throw Error('保存候选已过期（保留7天）；请显式重新准备。');
  const {input,candidate}=record;
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
  const fresh=record.mode==='ai-item'
    ? await generateBrowserItemIntakeCandidate(input as any,saved.analysis as any,provider)
    : await generateBrowserActorIntakeCandidate(input as any,saved.analysis as any,provider);
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
