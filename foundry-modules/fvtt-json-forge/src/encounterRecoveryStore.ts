import { hashSource } from '@fvtt-json-generator/forge-gateway-protocol';
import { decodeForgeEncounterPackageText, encounterPackageHash } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { assertEncounterSecretsAbsent, type EncounterIntakeReport } from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import type { EncounterLocalizationProgress, ForgeEncounterLocalizationDraft } from '@fvtt-json-generator/forge-browser-runtime/encounter-localization';

export interface SourceEncounterRecoverySnapshot {
  version: 1;
  recoveryWarnings?:string[];
  source: string;
  sourceHash: string;
  label: string;
  outputLanguage: 'source' | 'zh-CN';
  target: string;
  catalogHash: string;
  report?: EncounterIntakeReport;
  package?: string;
  translationReport?: EncounterLocalizationProgress[];
  packageHash?: never;
  packageSha256?: never;
}

/** A formally serialized upload has no human Markdown or Intake report to restore. */
export interface UploadedEncounterRecoverySnapshot {
  version: 2;
  recoveryWarnings?:string[];
  kind: 'uploaded-package';
  target: string;
  catalogHash: string;
  package: string;
  packageHash: string;
  packageSha256: string;
  translationReport: EncounterLocalizationProgress[];
  localizationDraft?: ForgeEncounterLocalizationDraft;
  source?: never;
  sourceHash?: never;
  label?: never;
  outputLanguage?: never;
  report?: never;
}
export type EncounterRecoverySnapshot=SourceEncounterRecoverySnapshot|UploadedEncounterRecoverySnapshot;

export interface EncounterRecoveryStore {
  load(): Promise<EncounterRecoverySnapshot | undefined>;
  save(snapshot: EncounterRecoverySnapshot): Promise<void>;
  clear(): Promise<void>;
}

const DATABASE = 'fvtt-json-forge-encounter-recovery';
const STORE = 'checkpoints';
const MAX_BYTES = 4 * 1024 * 1024;
const pendingWrites = new Map<string, Promise<void>>();
interface StoredCheckpoint { revision: number; snapshot: string | null }

export class EncounterRecoveryConflictError extends Error {
  constructor() { super('另一窗口已更新生物生成任务；请关闭旧窗口并重新打开当前任务。'); this.name = 'EncounterRecoveryConflictError'; }
}

/** One browser-local checkpoint per Foundry world and GM. No accepted result is persisted. */
export class IndexedDbEncounterRecoveryStore implements EncounterRecoveryStore {
  private revision = 0;
  constructor(private readonly scopeId: string, private readonly factory: IDBFactory | undefined = globalThis.indexedDB) {
    if (!scopeId.trim()) throw new TypeError('Encounter recovery needs a world and GM identity.');
  }

  async load(): Promise<EncounterRecoverySnapshot | undefined> {
    const db = await this.open();
    try {
      const tx = db.transaction(STORE, 'readonly');
      const value = await request<StoredCheckpoint | undefined>(tx.objectStore(STORE).get(this.scopeId));
      await completed(tx);
      if(value !== undefined)assertEnvelope(value);
      this.revision=value?.revision??0;
      return value?.snapshot === undefined || value.snapshot === null ? undefined : decodeEncounterRecovery(value.snapshot);
    } finally { db.close(); }
  }

  save(snapshot: EncounterRecoverySnapshot): Promise<void> {
    const serialized = serializeEncounterRecovery(snapshot);
    return this.enqueue(serialized);
  }

  clear(): Promise<void> { return this.enqueue(null); }

  private enqueue(serialized: string | null): Promise<void> {
    const previous = pendingWrites.get(this.scopeId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const db = await this.open();
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const objectStore=tx.objectStore(STORE);
        const current=await request<StoredCheckpoint | undefined>(objectStore.get(this.scopeId));
        if(current!==undefined){
          try{assertEnvelope(current);}
          catch(error){
            if(serialized!==null)throw error;
            // Explicit clear may replace only this scope's malformed record.
            objectStore.put({revision:1,snapshot:null} satisfies StoredCheckpoint,this.scopeId);
            await completed(tx);this.revision=1;return;
          }
        }
        if((current?.revision??0)!==this.revision){
          tx.abort();
          await completed(tx).catch(()=>undefined);
          throw new EncounterRecoveryConflictError();
        }
        const revision=this.revision+1;
        objectStore.put({revision,snapshot:serialized} satisfies StoredCheckpoint,this.scopeId);
        await completed(tx);
        this.revision=revision;
      } finally { db.close(); }
    });
    pendingWrites.set(this.scopeId, next);
    void next.finally(() => { if (pendingWrites.get(this.scopeId) === next) pendingWrites.delete(this.scopeId); }).catch(() => undefined);
    return next;
  }

  private async open(): Promise<IDBDatabase> {
    if (!this.factory) throw new Error('当前浏览器无法使用 IndexedDB，生物生成任务暂不能在刷新后恢复。');
    return new Promise((resolve, reject) => {
      const open = this.factory!.open(DATABASE, 1);
      open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE); };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('无法打开生物与召唤物任务存储。'));
      open.onblocked = () => reject(new Error('另一个窗口正在占用生物生成任务存储。'));
    });
  }
}

function assertEnvelope(value: StoredCheckpoint): void {
  if(!value||!Number.isSafeInteger(value.revision)||value.revision<1||value.revision>Number.MAX_SAFE_INTEGER-1
    ||(value.snapshot!==null&&typeof value.snapshot!=='string'))throw new TypeError('无效的生物生成任务存储记录。');
}

export function serializeEncounterRecovery(snapshot: EncounterRecoverySnapshot): string {
  const value = JSON.stringify(snapshot);
  if (value.length > MAX_BYTES) throw new RangeError('生物生成任务记录过大，未覆盖此前保存的记录。');
  scanSecrets(snapshot);
  decodeEncounterRecovery(value);
  return value;
}

export function decodeEncounterRecovery(value: string): EncounterRecoverySnapshot {
  if (value.length > MAX_BYTES) throw new RangeError('生物生成任务记录超出大小限制。');
  assertEncounterSecretsAbsent(value, []);
  const data: unknown = JSON.parse(value);
  scanSecrets(data);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('无效的生物生成任务记录。');
  const record=data as Record<string,unknown>;
  const warnings:string[]=Array.isArray(record.recoveryWarnings)?record.recoveryWarnings.filter((entry):entry is string=>typeof entry==='string'):[];
  if(record.version===2){
    if(record.kind!=='uploaded-package'||typeof record.target!=='string'
      ||!/^14\.(?:364|368)\/dnd5e\/5\.3\.3\/core$/.test(record.target)
      ||typeof record.catalogHash!=='string'||!/^[a-f0-9]{64}$/.test(record.catalogHash)
      ||typeof record.package!=='string'||!record.package.length||record.package.length>MAX_BYTES
      ||typeof record.packageHash!=='string'||!/^[a-f0-9]{64}$/.test(record.packageHash)
      ||typeof record.packageSha256!=='string'
      ||!Array.isArray(record.translationReport)||record.translationReport.length>8
      ||record.translationReport.some(entry=>!entry||typeof entry!=='object'
        ||!['translating','draft_ready','needs_review'].includes(String(entry.status))
        ||entry.translation!==undefined||!entry.request||typeof entry.request!=='object')
      ||(record.localizationDraft!==undefined&&(!record.localizationDraft||typeof record.localizationDraft!=='object'
        ||Array.isArray(record.localizationDraft)||(record.localizationDraft as Record<string,unknown>).version!==1
        ||(record.localizationDraft as Record<string,unknown>).sourcePackageHash!==record.packageHash
        ||typeof (record.localizationDraft as Record<string,unknown>).sourcePackageId!=='string'
        ||!Array.isArray((record.localizationDraft as Record<string,unknown>).actors)
        ||!(record.localizationDraft as Record<string,unknown>).packageText))
      ||['source','sourceHash','label','outputLanguage','report','reviewed','accepted'].some(key=>key in record))
      throw new TypeError('上传的生物导入文件恢复记录与包、目标或译文进度不符。');
    if(record.packageSha256!==hashSource(record.package as string))warnings.push('保存包的内容指纹不一致；可读 Actor 保留，历史确认不继承。');
    if(warnings.length)record.recoveryWarnings=[...new Set(warnings)];
    return record as unknown as UploadedEncounterRecoverySnapshot;
  }
  if (record.version !== 1 || typeof record.source !== 'string' || !record.source.trim()
    || typeof record.label !== 'string' || !record.label.trim()
    || (record.outputLanguage !== 'source' && record.outputLanguage !== 'zh-CN')
    || typeof record.sourceHash !== 'string'
    || typeof record.catalogHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.catalogHash)
    || typeof record.target !== 'string' || !/^14\.(?:364|368)\/dnd5e\/5\.3\.3\/core$/.test(record.target))
    throw new TypeError('生物生成任务记录与来源或目标不符。');
  if(record.sourceHash!==hashSource(record.source as string))warnings.push('保存来源的指纹与正文不同；已保存内容保留。');
  if (record.report !== undefined) {
    const report = record.report as Partial<EncounterIntakeReport>;
    const sourceText=typeof report.source==='string'?report.source:record.source as string;
    if (!report || report.version !== 1 || typeof report.source!=='string'
      || !['running','ready_for_gm_review','needs_review','failed'].includes(String(report.status))
      || !Array.isArray(report.actors) || !Array.isArray(report.findings)
      || report.findings.some(finding=>typeof finding!=='string')
      || report.actors.some((actor,index)=>!actor||typeof actor!=='object'||typeof actor.key!=='string'||!/^actor-\d+$/.test(actor.key)
        ||typeof actor.source!=='string'||!Number.isSafeInteger(actor.start)||!Number.isSafeInteger(actor.end)
        ||actor.start<0||actor.end>sourceText.length||actor.start>=actor.end
        ||sourceText.slice(actor.start,actor.end)!==actor.source
        ||!actor.analysis||typeof actor.analysis!=='object'||Array.isArray(actor.analysis))
      ||(report.packageHash!==undefined&&!/^[a-f0-9]{64}$/.test(report.packageHash)))
      throw new TypeError('生物导入文件来源报告与保存的任务不符。');
    const actors=report.actors;
    if(report.members!==undefined&&(!Array.isArray(report.members)||report.members.length<1
      ||report.members.length<actors.length||report.members.some((member,index)=>!member||member.key!==`actor-${index+1}`
        ||typeof member.label!=='string'||!member.label.trim()
        ||!Number.isSafeInteger(member.start)||!Number.isSafeInteger(member.end)||member.start<0||member.end>sourceText.length||member.start>=member.end
        ||(index>0&&member.start<report.members![index-1]!.end)
        ||!['pending','running','available','failed','cancelled'].includes(member.status)
        ||!Array.isArray(member.findings)||member.findings.some(finding=>typeof finding!=='string')
        ||actors.some(actor=>actor.key===member.key&&(actor.start!==member.start||actor.end!==member.end))
        ||(member.status==='available'&&!actors.some(actor=>actor.key===member.key&&actor.generation?.candidateAvailable)))))
      throw new TypeError('保存的逐个生物状态与完整来源清单不符。');
  }
  if (record.package !== undefined) {
    const expected = (record.report as EncounterIntakeReport | undefined)?.packageHash;
    try {
      if(typeof record.package!=='string'||record.package.length>MAX_BYTES)throw new TypeError();
      if(!expected||encounterPackageHash(decodeForgeEncounterPackageText(record.package))!==expected)warnings.push('保存包与历史报告指纹不同；可读 Actor 保留，历史确认不继承。');
    } catch { throw new TypeError('保存的生物导入文件与来源报告不符。'); }
  }
  if (record.translationReport !== undefined && (!Array.isArray(record.translationReport) || record.translationReport.length > 8))
    throw new TypeError('无效的中文审核进度。');
  if(warnings.length)record.recoveryWarnings=[...new Set(warnings)];
  return record as unknown as EncounterRecoverySnapshot;
}

function scanSecrets(value: unknown): void {
  if(typeof value==='string') { assertEncounterSecretsAbsent(value, []); return; }
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(const entry of value)scanSecrets(entry);return;}
  for(const [key,entry] of Object.entries(value)){
    if(['apiKey','authorization','cookie','endpoint','baseUrl','rawResponse','providerResponse','savedApiKeys'].includes(key))
      throw new TypeError('生物导入文件安全检查拒绝了凭据或原始服务响应。');
    scanSecrets(entry);
  }
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? new Error('读取任务记录失败。')); });
}
function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new Error('保存任务记录已中止。')); tx.onerror = () => reject(tx.error ?? new Error('保存任务记录失败。')); });
}
