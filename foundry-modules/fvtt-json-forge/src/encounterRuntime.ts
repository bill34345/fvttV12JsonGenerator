import { hashArtifact } from '@fvtt-json-generator/forge-gateway-protocol';
import { decodeEncounterAssetBytes, hashEncounterBytes } from '@fvtt-json-generator/forge-browser-runtime/encounter-package';
import { assertPreparedForgeEncounter, type PreparedForgeEncounter } from '@fvtt-json-generator/forge-browser-runtime/encounter-preparation';
import { actorReadbackWarnings, assertExactRuntime, assertGm, MODULE_ID, prepareFoundryImportArtifact, markForgeSpellImportPending, completeForgeSpellImport,type ForgeGameLike } from './runtime';
import {fixedEncounterCommand,decodeEncounterRuntimeConfiguration,readFixedEncounterConfiguration} from '@fvtt-json-generator/forge-browser-runtime/encounter-intake';
import {isForgeSpellImportPending} from '@fvtt-json-generator/contracts/forge-import-lifecycle';

export interface EncounterDocument {
  id: string; uuid: string; name: string;
  toObject(): any;
  update?(changes: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  delete(): Promise<unknown>;
  execute?: () => Promise<unknown>;
}
interface Collection {
  get(id: string): EncounterDocument | undefined;
  contents?: EncounterDocument[];
  documentClass: { create(data: any, options?: any): Promise<EncounterDocument | undefined> };
}
export interface EncounterGame {
  version: string; system: { id: string; version: string }; user: { id: string; isGM: boolean };
  actors: Collection; macros: Collection;
  modules?:ForgeGameLike['modules'];
}
export interface EncounterImportResult {
  packageId: string; packageHash: string;
  failures: Array<{key:string;kind:'Actor'|'Macro'|'Asset';message:string;uuid?:string}>;
  documents: Array<{ key: string; kind: 'Actor' | 'Macro'; uuid: string; id: string; name: string; status: 'created' | 'existing'; readbackWarnings?:string[] }>;
}
export interface EncounterAssetPort {
  ensure(asset: PreparedForgeEncounter['bundle']['assets'][number], path: string): Promise<void>;
}
const importLocks = new WeakMap<object, Set<string>>();
export const encounterDocumentId = (packageId: string, kind: string, key: string) => hashArtifact({ packageId, kind, key }).slice(0, 16);
export const encounterAssetPath = (hash: string, asset: {key:string;fileName:string}) => `fvtt-json-forge/encounters/${hash}/${asset.key}-${asset.fileName}`;

/** Explicit reviewed-package path; never fabricates an accepted single-Actor response. */
export async function importForgeEncounter(input: {
  game: EncounterGame; prepared: PreparedForgeEncounter; reviewed: boolean; assets: EncounterAssetPort; signal?: AbortSignal;
}): Promise<EncounterImportResult> {
  const { game, prepared } = input;
  assertEncounterEnvironment(game); assertPreparedForgeEncounter(prepared);
  if (!input.reviewed) throw new Error('请先核对角色、宏代码和保留的GM操作规则。');
  input.signal?.throwIfAborted();
  const locks = importLocks.get(game) ?? new Set<string>(); importLocks.set(game, locks);
  if (locks.has(prepared.bundle.id)) throw new Error('这个生物导入文件正在导入，请等待当前操作完成。');
  locks.add(prepared.bundle.id);
  const result:EncounterImportResult={packageId:prepared.bundle.id,packageHash:prepared.hash,documents:[],failures:[]};
  for(const member of prepared.bundle.actors)if(!prepared.actors.some(actor=>actor.key===member.key)){
    result.failures.push({key:member.key,kind:'Actor',message:`${member.label}：该角色尚未完成本地生成；来源与原始成员记录仍保留在生物导入文件中。`});
  }
  const uploadedAssets=new Set<string>();
  try {
    for(const asset of prepared.bundle.assets){
      input.signal?.throwIfAborted();assertEncounterEnvironment(game);
      try{await input.assets.ensure(asset,encounterAssetPath(prepared.hash,asset));uploadedAssets.add(asset.key);}
      catch(error){result.failures.push({key:asset.key,kind:'Asset',message:error instanceof Error?error.message:String(error)});}
    }
    input.signal?.throwIfAborted();
    const plans=createDocumentPlans(prepared,game,result.failures,uploadedAssets);
    for(const plan of plans){
      let document:EncounterDocument|undefined;
      let created=false;
      try{
        assertEncounterEnvironment(game);
        if(plan.kind==='Macro'&&Object.values(plan.data.flags[MODULE_ID].encounter.bindings as Record<string,string>)
          .some(uuid=>!result.documents.some(row=>row.kind==='Actor'&&row.uuid===uuid)))
          throw new Error('配套角色尚未成功导入；宏保留为未完成项。');
        const documents=collection(game,plan.kind);
        document=documents.get(plan.data._id);
        if(!document){
          try{
            document=await documents.documentClass.create(JSON.parse(JSON.stringify(plan.data)),{keepId:true,renderSheet:false});
            if(!document)throw new Error(`${plan.data.name}：创建被Foundry或模块取消。`);
            created=true;
          }catch(error){document=documents.get(plan.data._id);if(!document)throw error;}
        }
        const readbackWarnings=[...(plan.warnings??[]),...verifyDocument(document,plan,true)];
        result.documents.push({key:plan.key,kind:plan.kind,uuid:document.uuid,id:document.id,name:document.name,
          status:created?'created':'existing',...(readbackWarnings.length?{readbackWarnings}:{})});
        if(plan.kind==='Actor'){
          try{await completeForgeSpellImport(document);}
          catch(error){result.failures.push({key:plan.key,kind:'Actor',uuid:document.uuid,message:error instanceof Error?error.message:String(error)});}
        }
      }catch(error){
        let detail=error instanceof Error?error.message:String(error);
        // A wrong new identity belongs only to this failed write, never to prior successful Actors.
        if(created&&document){
          try{await document.delete();if(collection(game,plan.kind).get(document.id))detail+=` 无法清理本次身份错误文档：${document.uuid}`;}
          catch{detail+=` 无法清理本次身份错误文档：${document.uuid}`;}
        }
        result.failures.push({key:plan.key,kind:plan.kind,message:detail,...(document?{uuid:document.uuid}:{})});
      }
    }
    return result;
  }finally{locks.delete(prepared.bundle.id);}
}

interface DocumentPlan { key:string;kind:'Actor'|'Macro';data:any;warnings?:string[] }
function createDocumentPlans(prepared:PreparedForgeEncounter,game:EncounterGame,failures:EncounterImportResult['failures'],uploadedAssets:ReadonlySet<string>):DocumentPlan[]{
  const { bundle, hash } = prepared;
  const identity = (kind: string, key: string) => ({ version: 1, packageId: bundle.id, packageHash: hash, key, kind });
  const plans:DocumentPlan[]=[];
  for(const actor of prepared.actors){
    try{
    const warnings:string[]=[];
    const data:any=prepareFoundryImportArtifact(actor.artifact,game,warnings);
    // Exact dnd5e 5.3.3 NPC create normalization, observed in the local Lab.
    // Only absent artwork receives the native default; explicit source art remains strict.
    if(data.type==='npc'){
      if(!data.img)data.img='systems/dnd5e/icons/svg/actors/npc.svg';
      data.prototypeToken??={};data.prototypeToken.texture??={};
      if(!data.prototypeToken.texture.src)data.prototypeToken.texture.src=data.img;
    }
    // Legacy empty collection metadata is not a dnd5e skill and is discarded by its schema.
    if (Array.isArray(data.system?.skills?.value) && data.system.skills.value.length === 0) delete data.system.skills.value;
    data._id = encounterDocumentId(bundle.id, 'Actor', actor.key);
    data.flags ??= {}; data.flags[MODULE_ID] = { encounter: identity('Actor', actor.key) };
    markForgeSpellImportPending(data);
    for (const asset of bundle.assets.filter(asset=>uploadedAssets.has(asset.key))) for (const target of asset.targets.filter(t => t.actorKey === actor.key)) {
      for (const path of target.fields) {
        if (path === 'img') data.img = encounterAssetPath(hash, asset);
        else { data.prototypeToken ??= {}; data.prototypeToken.texture ??= {}; data.prototypeToken.texture.src = encounterAssetPath(hash, asset); }
      }
    }
    plans.push({key:actor.key,kind:'Actor',data,warnings});
    }catch(error){failures.push({key:actor.key,kind:'Actor',message:error instanceof Error?error.message:String(error)});}
  }
  for (const macro of prepared.macros) {
    try{
    readFixedEncounterConfiguration(macro.command);
    const bindings = Object.fromEntries(Object.entries(macro.bindings).map(([name, actorKey]) => [name,
      `Actor.${encounterDocumentId(bundle.id, 'Actor', actorKey)}`]));
    const context = { packageId: bundle.id, packageHash: hash, actors: bindings, bindingKeys: macro.bindings, covers: macro.covers };
    const command = `${contextPrefix(context)}${macro.command}`.trim();
    plans.push({ key: macro.key, kind: 'Macro', data: {
      _id: encounterDocumentId(bundle.id, 'Macro', macro.key), name: macro.name, type: 'script', scope: 'global',
      img: 'icons/svg/daze.svg', command, ownership: { default: 0 },
      flags: { [MODULE_ID]: { encounter: { ...identity('Macro', macro.key), commandHash: hashEncounterBytes(new TextEncoder().encode(command)), bindings, bindingKeys: macro.bindings, covers: macro.covers } } },
    } });
    }catch(error){failures.push({key:macro.key,kind:'Macro',message:error instanceof Error?error.message:String(error)});}
  }
  return plans;
}
function contextPrefix(context:any):string {
  return `const forgeEncounter = Object.freeze({ ...${stableContext(context)}, actors: Object.freeze(${stableContext(context.actors)}) });\n`;
}
function stableContext(value:any):string {
  const normalize=(input:any):any=>Array.isArray(input)?input.map(normalize):input&&typeof input==='object'
    ?Object.fromEntries(Object.keys(input).sort().map(key=>[key,normalize(input[key])])):input;
  return JSON.stringify(normalize(value));
}
function assertEncounterEnvironment(game: EncounterGame):void {
  assertGm({user:game.user});assertExactRuntime({version:game.version,system:game.system});
}
function collection(game: EncounterGame, kind: 'Actor'|'Macro'): Collection { return kind === 'Actor' ? game.actors : game.macros; }
function verifyDocument(document: EncounterDocument, plan: DocumentPlan,allowPendingNew=false): string[] {
  const actual = document.toObject();
  if (document.id !== plan.data._id || hashArtifact(actual.flags?.[MODULE_ID]?.encounter ?? {}) !== hashArtifact(plan.data.flags[MODULE_ID].encounter)) {
    throw new Error(`${plan.data.name}：文档身份冲突，未覆盖已有内容。`);
  }
  const warnings:string[]=[];
  if (plan.kind === 'Actor') {
    warnings.push(...actorReadbackWarnings(plan.data, actual));
    for (const path of ['system.attributes.movement','system.attributes.init','system.skills','system.resources','system.traits','system.details.alignment']) {
      const read = (data:any) => path.split('.').reduce((value,key)=>value?.[key],data);
      try{assertExpectedFields(read(actual),read(plan.data),path);}
      catch(error){warnings.push(`${plan.data.name}：${error instanceof Error?error.message:String(error)}。角色已保留，请核对。`);}
    }
    if (actual.img !== plan.data.img || actual.prototypeToken?.texture?.src !== plan.data.prototypeToken?.texture?.src) warnings.push(`${plan.data.name}：图片保存值与生成结果不同，角色已保留，请核对。`);
  } else if (actual.command !== plan.data.command || actual.type !== 'script' || actual.name !== plan.data.name) {
    throw new Error(`${plan.data.name}：宏代码回读不一致。`);
  }
  return warnings;
}
function assertExpectedFields(actual:any,expected:any,path:string):void {
  if (expected === undefined) return;
  // dnd5e 5.3.3 stores these FormulaFields as strings, including numeric source literals.
  if (/^system\.attributes\.(movement\.(walk|burrow|climb|fly|swim|bonus)|init\.bonus)$/.test(path)
    && typeof expected === 'number' && actual === String(expected)) return;
  if (/^system\.attributes\.movement\.(walk|burrow|climb|fly|swim|bonus)$/.test(path)
    && expected === null && actual === undefined) return;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error(`角色回读不一致：${path}`);
    expected.forEach((value,index)=>assertExpectedFields(actual[index],value,`${path}.${index}`));return;
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') throw new Error(`角色回读不一致：${path}`);
    for (const [key,value] of Object.entries(expected)) assertExpectedFields(actual[key],value,`${path}.${key}`);
  } else if (actual !== expected) throw new Error(`角色回读不一致：${path}`);
}

export function listForgeEncounterMacros(game: EncounterGame): Array<{id:string;name:string;packageId:string}> {
  assertEncounterEnvironment(game);
  return (game.macros.contents ?? []).flatMap(m => {
    const identity = m.toObject().flags?.[MODULE_ID]?.encounter;
    return identity?.version === 1 && identity.kind === 'Macro' ? [{ id:m.id,name:m.name,packageId:identity.packageId }] : [];
  });
}
export function validateForgeEncounterMacro(game: EncounterGame, id: string): EncounterDocument {
  assertEncounterEnvironment(game);
  const macro = game.macros.get(id); const data = macro?.toObject(); const identity = data?.flags?.[MODULE_ID]?.encounter;
  if (!macro?.execute || identity?.version !== 1 || identity.kind !== 'Macro' || data.type !== 'script') throw new Error('未找到已导入的战斗控制宏。');
  if (hashEncounterBytes(new TextEncoder().encode(data.command)) !== identity.commandHash) throw new Error('宏代码在导入后已改变，请重新审阅；没有执行。');
  const prefix=contextPrefix({packageId:identity.packageId,packageHash:identity.packageHash,actors:identity.bindings,bindingKeys:identity.bindingKeys,covers:identity.covers});
  if (!identity.bindingKeys || !Array.isArray(identity.covers)
    || !data.command.startsWith(prefix)) throw new Error('宏绑定或机制声明在导入后已改变。');
  readFixedEncounterConfiguration(data.command.slice(prefix.length));
  for (const [binding,uuid] of Object.entries(identity.bindings ?? {})) {
    if (typeof uuid !== 'string' || !/^Actor\.[a-f0-9]{16}$/.test(uuid)) throw new Error('宏绑定身份无效。');
    const actorKey=identity.bindingKeys[binding];
    if (typeof actorKey!=='string'||uuid!==`Actor.${encounterDocumentId(identity.packageId,'Actor',actorKey)}`) throw new Error('宏绑定的角色key与文档ID不一致。');
    const actor = game.actors.get(uuid.slice(6)); const owner = actor?.toObject().flags?.[MODULE_ID]?.encounter;
    if (owner?.version!==1||owner?.kind!=='Actor'||owner?.key!==actorKey||owner?.packageId !== identity.packageId || owner?.packageHash !== identity.packageHash) throw new Error('配套角色缺失或已被替换，未启动宏。');
    for(const cover of identity.covers.filter((c:any)=>c.actorKey===actorKey)){
      const mechanics=(actor!.toObject().items??[]).flatMap((item:any)=>item.flags?.fvttJsonGenerator?.behaviorMechanics??[]);
      if(!mechanics.some((m:any)=>m.schemaVersion===1&&m.id===cover.mechanicId))throw new Error(`配套角色缺少机制 ${cover.mechanicId}，请恢复来源后重新导入。`);
    }
  }
  return macro;
}
export async function startForgeEncounterMacro(game:EncounterGame,id:string):Promise<void>{await validateForgeEncounterMacro(game,id).execute!();}

/** Fixed entries are data-compiled, and must match the imported command byte for byte. */
export function validateFixedEncounterEntry(game:EncounterGame,context:any,configuration:unknown):EncounterDocument{
  const config=decodeEncounterRuntimeConfiguration(configuration);
  if(!context||typeof context.packageId!=='string')throw new Error('缺少战斗配置身份。');
  const macro=validateForgeEncounterMacro(game,encounterDocumentId(context.packageId,'Macro','battle-control'));
  const identity=macro.toObject().flags[MODULE_ID].encounter;
  const expectedContext={packageId:identity.packageId,packageHash:identity.packageHash,actors:identity.bindings,bindingKeys:identity.bindingKeys,covers:identity.covers};
  if(stableContext(context)!==stableContext(expectedContext)||macro.toObject().command!==`${contextPrefix(expectedContext)}${fixedEncounterCommand(config)}`.trim())throw new Error('固定自动化配置与已审核导入内容不一致。');
  for(const rule of config.rules){if(!context.actors[rule.actorKey]||(rule.parameters.summonedActorKey&&!context.actors[String(rule.parameters.summonedActorKey)]))throw new Error('自动化引用了未绑定角色。');}
  for(const recovery of config.legendaryRecovery)if(!context.actors[recovery.actorKey])throw new Error('资源恢复引用了未绑定角色。');
  return macro;
}

export function createEncounterAssetPort(foundryGlobal: any, game: EncounterGame): EncounterAssetPort {
  return { async ensure(asset, path) {
    const expected = decodeEncounterAssetBytes(asset);
    const existing = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
    if (existing.ok) {
      if (hashEncounterBytes(new Uint8Array(await existing.arrayBuffer())) !== asset.sha256) throw new Error('现存图片内容与生物导入文件不符，拒绝覆盖。');
      return;
    }
    if (existing.status !== 404) throw new Error(`无法检查图片目标（HTTP ${existing.status}）。`);
    const Picker = foundryGlobal?.applications?.apps?.FilePicker?.implementation;
    if (!Picker) throw new Error('Foundry 文件上传接口不可用。');
    const segments = path.split('/'); const name = segments.pop()!;
    let directory = '';
    for (const segment of segments) {
      const parent = directory;
      directory = parent ? `${parent}/${segment}` : segment;
      const listing = await Picker.browse('data', parent, { notify: false });
      if (!listing.dirs.includes(directory)) {
        assertEncounterEnvironment(game);
        try { await Picker.createDirectory('data', directory, { notify: false }); }
        catch (error) { const concurrent = await Picker.browse('data', parent, { notify: false }); if (!concurrent.dirs.includes(directory)) throw error; }
      }
    }
    assertEncounterEnvironment(game);
    await Picker.upload('data', directory, new File([expected as any], name, { type: asset.mime }), {}, { notify: false });
    const readback = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
    if (!readback.ok || hashEncounterBytes(new Uint8Array(await readback.arrayBuffer())) !== asset.sha256) throw new Error('图片上传回读校验失败。');
  } };
}
