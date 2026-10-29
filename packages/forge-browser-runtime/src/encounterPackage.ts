import type {RulePresentationPlan} from '@fvtt-json-generator/generation/rule-presentation';
import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { decodeEncounterLocalization, type EncounterLocalization } from '@fvtt-json-generator/contracts/localization';
import { hashArtifact, hashSource, type JsonObject, type Sha256 } from '@fvtt-json-generator/forge-gateway-protocol';

export const FORGE_ENCOUNTER_PACKAGE_SCHEMA = 'fvtt-json-forge-encounter' as const;
export const FORGE_ENCOUNTER_PACKAGE_VERSION = 1 as const;
export const FORGE_ENCOUNTER_PACKAGE_MAX_BYTES = 32 * 1024 * 1024;
export const FORGE_ENCOUNTER_PACKAGE_MAX_ASSET_BYTES = 4 * 1024 * 1024;
export const FORGE_ENCOUNTER_PACKAGE_MAX_ZIP_BYTES = FORGE_ENCOUNTER_PACKAGE_MAX_BYTES + 1024;

const TARGET = Object.freeze({
  foundry: '14.364',
  system: 'dnd5e',
  systemVersion: '5.3.3',
  effectProfile: 'core',
} as const);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ROOT_KEYS = ['schema', 'version', 'id', 'label', 'target', 'primaryActorKey', 'actors', 'macros', 'assets'] as const;
const TARGET_KEYS = ['foundry', 'system', 'systemVersion', 'effectProfile'] as const;
const ACTOR_KEYS = ['key', 'label', 'source', 'sourceHash', 'artifact', 'artifactHash', 'reviewFindings', 'rulePresentation'] as const;
const MACRO_KEYS = ['key', 'name', 'command', 'commandHash', 'bindings', 'covers', 'notes'] as const;
const COVER_KEYS = ['actorKey', 'mechanicId'] as const;
const ASSET_KEYS = ['key', 'fileName', 'mime', 'base64', 'sha256', 'targets'] as const;
const ASSET_TARGET_KEYS = ['actorKey', 'fields'] as const;
const ASSET_FIELDS = new Set(['img', 'prototypeToken.texture.src']);
const MIME_TYPES = new Set(['image/png', 'image/webp', 'image/jpeg']);
const MAX_ACTORS = 20;
const MAX_MACROS = 10;
const MAX_ASSETS = 40;
const MAX_SLUG_LENGTH = 96;
const MAX_LABEL_LENGTH = 500;
const MAX_MECHANIC_ID_LENGTH = 500;
const MAX_NOTES_BYTES = 200_000;
const MAX_SOURCE_BYTES = 200_000;
const MAX_COMMAND_BYTES = 200_000;
const MAX_FILE_NAME_BYTES = 255;
const MAX_ASSET_BASE64_LENGTH = 4 * Math.ceil(FORGE_ENCOUNTER_PACKAGE_MAX_ASSET_BYTES / 3);
const MAX_ARRAY_LENGTH = 1_024;
const MAX_ZIP_ENTRIES = 2;
const ZIP_PATH = 'encounter.json';
export function encounterPackageFindings(bundle:Readonly<ForgeEncounterPackage>):readonly string[]{return bundle.reviewFindings??[];}

export interface ForgeEncounterPackageTarget {
  readonly foundry: '14.364';
  readonly system: 'dnd5e';
  readonly systemVersion: '5.3.3';
  readonly effectProfile: 'core';
}

export interface ForgeEncounterPackageActor {
  readonly key: string;
  readonly label: string;
  readonly source: string;
  readonly sourceHash: Sha256;
  readonly artifact?: JsonObject;
  readonly artifactHash?: Sha256;
  readonly reviewFindings?:readonly string[];
  readonly rulePresentation?:RulePresentationPlan;
}

export interface ForgeEncounterPackageMacroCover {
  readonly actorKey: string;
  readonly mechanicId: string;
}

export interface ForgeEncounterPackageMacro {
  readonly key: string;
  readonly name: string;
  readonly command: string;
  readonly commandHash: Sha256;
  readonly bindings: Readonly<Record<string, string>>;
  readonly covers: readonly ForgeEncounterPackageMacroCover[];
  readonly notes: string;
}

export interface ForgeEncounterPackageAssetTarget {
  readonly actorKey: string;
  readonly fields: readonly ('img' | 'prototypeToken.texture.src')[];
}

export interface ForgeEncounterPackageAsset {
  readonly key: string;
  readonly fileName: string;
  readonly mime: 'image/png' | 'image/webp' | 'image/jpeg';
  readonly base64: string;
  readonly sha256: Sha256;
  readonly targets: readonly ForgeEncounterPackageAssetTarget[];
}

export interface ForgeEncounterPackage {
  readonly reviewFindings?:readonly string[];
  readonly localization?: EncounterLocalization;
  readonly schema: typeof FORGE_ENCOUNTER_PACKAGE_SCHEMA;
  readonly version: typeof FORGE_ENCOUNTER_PACKAGE_VERSION;
  readonly id: string;
  readonly label: string;
  readonly target: ForgeEncounterPackageTarget;
  readonly primaryActorKey: string;
  readonly actors: readonly ForgeEncounterPackageActor[];
  readonly macros: readonly ForgeEncounterPackageMacro[];
  readonly assets: readonly ForgeEncounterPackageAsset[];
}

/**
 * Parses and verifies an encounter package without treating its macro command
 * strings as executable code. A package is data only until an explicit Foundry
 * import flow decides what, if anything, to create or run.
 */
export function decodeForgeEncounterPackageText(text: string): Readonly<ForgeEncounterPackage> {
  if (typeof text !== 'string') throw new TypeError('Encounter package JSON must be a string.');
  assertTextSize(text, 'Encounter package JSON');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError('Encounter package JSON is invalid.');
  }
  return normalizeEncounterPackage(parsed);
}

export function serializeForgeEncounterPackage(bundle: ForgeEncounterPackage): string {
  const normalized = normalizeEncounterPackage(bundle);
  const serialized = stableStringify(normalized);
  assertTextSize(serialized, 'Encounter package JSON');
  return serialized;
}

export async function encodeForgeEncounterPackageZip(bundle: ForgeEncounterPackage): Promise<Uint8Array> {
  const data = utf8(serializeForgeEncounterPackage(bundle));
  const zip = writeStoredZip(ZIP_PATH, data);
  if (zip.byteLength > FORGE_ENCOUNTER_PACKAGE_MAX_ZIP_BYTES) throw new TypeError('Encounter package ZIP exceeds the supported size limit.');
  return zip;
}

export async function decodeForgeEncounterPackageZip(bytes: Uint8Array): Promise<Readonly<ForgeEncounterPackage>> {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Encounter package ZIP must be Uint8Array bytes.');
  if (bytes.byteLength === 0 || bytes.byteLength > FORGE_ENCOUNTER_PACKAGE_MAX_ZIP_BYTES) {
    throw new TypeError('Encounter package ZIP size is outside the supported range.');
  }
  const encounterBytes = await readEncounterZip(bytes);
  if (encounterBytes.byteLength > FORGE_ENCOUNTER_PACKAGE_MAX_BYTES) throw new TypeError('Encounter package ZIP expands beyond the package limit.');
  return decodeForgeEncounterPackageText(decodeUtf8(encounterBytes, ZIP_PATH));
}

/** Hashes already-decoded browser bytes without Web Crypto or a Node runtime. */
export function hashEncounterBytes(bytes: Uint8Array): Sha256 {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Encounter bytes must be Uint8Array.');
  return sha256(bytes) as Sha256;
}

/**
 * Rechecks a package asset's encoded payload before a caller uploads it. It
 * only decodes bytes; it never resolves paths or applies the asset to Foundry.
 */
export function decodeEncounterAssetBytes(asset: ForgeEncounterPackageAsset): Uint8Array {
  const record = exactRecord(asset, '$asset', ASSET_KEYS);
  const mimeValue = mime(record.mime, '$asset.mime');
  const base64 = base64Text(record.base64, '$asset.base64');
  const bytes = decodeBase64(base64, '$asset.base64');
  if (bytes.byteLength > FORGE_ENCOUNTER_PACKAGE_MAX_ASSET_BYTES) throw new TypeError('$asset.base64 exceeds the asset byte limit.');
  assertImageMagic(bytes, mimeValue, '$asset');
  const expectedHash = sha256Digest(record.sha256, '$asset.sha256');
  if (hashEncounterBytes(bytes) !== expectedHash) throw new TypeError('$asset.sha256 does not match decoded asset bytes.');
  return bytes;
}

export function encounterPackageHash(bundle: ForgeEncounterPackage): string {
  const normalized = normalizeEncounterPackage(bundle);
  return hashArtifact(normalized as unknown as JsonObject);
}

function normalizeEncounterPackage(value: unknown): Readonly<ForgeEncounterPackage> {
  scanUntrustedJson(value);
  const root=exactRecord(value,'$',[...ROOT_KEYS,...(Object.hasOwn(value as object,'localization')?['localization']:[]),...(Object.hasOwn(value as object,'reviewFindings')?['reviewFindings']:[])]);
  literal(root.schema, FORGE_ENCOUNTER_PACKAGE_SCHEMA, '$.schema');
  literalNumber(root.version, FORGE_ENCOUNTER_PACKAGE_VERSION, '$.version');
  const id = slug(root.id, '$.id');
  const label = boundedString(root.label, '$.label', Number.MAX_SAFE_INTEGER, true);
  const target = decodeTarget(root.target, '$.target');
  let primaryActorKey = typeof root.primaryActorKey === 'string' ? root.primaryActorKey : '';
  const rawActors = boundedArray(root.actors, '$.actors', 1, Number.MAX_SAFE_INTEGER);
  const findings:string[]=Array.isArray(root.reviewFindings)?root.reviewFindings.filter((entry):entry is string=>typeof entry==='string'):[];
  const usedKeys=new Set<string>();
  const originalKeys=rawActors.map(entry=>entry&&typeof entry==='object'&&!Array.isArray(entry)?(entry as Record<string,unknown>).key:undefined);
  const reservedKeys=new Set(originalKeys.filter(validActorKey));
  const ambiguousKeys=new Set(originalKeys.filter((key,index):key is string=>validActorKey(key)&&originalKeys.indexOf(key)!==index));
  const actors=rawActors.map((entry,index)=>{
    const original=originalKeys[index];
    let key=validActorKey(original)&&!usedKeys.has(original)?original:`actor-${index+1}-${hashSource(JSON.stringify(entry)??'undefined').slice(0,12)}`;
    while(usedKeys.has(key)||key!==original&&reservedKeys.has(key))key+='-next';
    usedKeys.add(key);
    return decodeActor(entry,`$.actors[${index}]`,key,findings);
  });
  const actorKeys = new Set(actors.map((actor) => actor.key));
  if(!actorKeys.has(primaryActorKey)){primaryActorKey=actors[0]!.key;findings.push('主要角色 key 未匹配；已保留全部 Actor 并使用首个条目作为列表入口。');}
  const bindingKeys=new Set([...actorKeys].filter(key=>!ambiguousKeys.has(key)));
  if(ambiguousKeys.size)findings.push(`重复角色 key ${[...ambiguousKeys].join(', ')} 的配套绑定归属不明确；角色保留，对应宏和素材暂不准备。`);
  const macros:ForgeEncounterPackageMacro[]=[];
  for(const [index,entry] of (Array.isArray(root.macros)?root.macros:[]).entries()){
    try{const macro=decodeMacro(entry,`$.macros[${index}]`,bindingKeys);
      if(macros.some(prior=>prior.key===macro.key))throw new TypeError('重复宏 key。');macros.push(macro);}
    catch(error){findings.push(`宏 ${index+1} 未准备：${error instanceof Error?error.message:String(error)}；Actor 保留。`);}
  }
  const assets:ForgeEncounterPackageAsset[]=[];
  for(const [index,entry] of (Array.isArray(root.assets)?root.assets:[]).entries()){
    try{const asset=decodeAsset(entry,`$.assets[${index}]`,bindingKeys);
      if(assets.some(prior=>prior.key===asset.key))throw new TypeError('重复素材 key。');assets.push(asset);}
    catch(error){findings.push(`素材 ${index+1} 未准备：${error instanceof Error?error.message:String(error)}；Actor 保留。`);}
  }
  let localization:EncounterLocalization|undefined;
  if(Object.hasOwn(root,'localization')){
    try{localization=decodeEncounterLocalization(root.localization);}
    catch(error){findings.push(`翻译记录未准备：${error instanceof Error?error.message:String(error)}；现有 Actor 产物保留。`);}
  }
  const normalized: ForgeEncounterPackage = {
    schema: FORGE_ENCOUNTER_PACKAGE_SCHEMA,
    version: FORGE_ENCOUNTER_PACKAGE_VERSION,
    id,
    label,
    target,
    primaryActorKey,
    actors,
    macros,
    assets,
    ...(localization?{localization}:{}),
    ...(findings.length?{reviewFindings:[...new Set(findings)]}:{}),
  };
  assertTextSize(stableStringify(normalized), 'Encounter package JSON');
  const result=deepFreeze(normalized);
  return result;
}

function decodeTarget(value: unknown, path: string): ForgeEncounterPackageTarget {
  const record = exactRecord(value, path, TARGET_KEYS);
  literal(record.foundry, TARGET.foundry, `${path}.foundry`);
  literal(record.system, TARGET.system, `${path}.system`);
  literal(record.systemVersion, TARGET.systemVersion, `${path}.systemVersion`);
  literal(record.effectProfile, TARGET.effectProfile, `${path}.effectProfile`);
  return { ...TARGET };
}

function validActorKey(value:unknown):value is string{return typeof value==='string'&&value.length<=MAX_SLUG_LENGTH&&SLUG_PATTERN.test(value);}

function decodeActor(value:unknown,path:string,key:string,findings:string[]):ForgeEncounterPackageActor{
  let record:Record<string,unknown>;
  try{record=plainRecord(value,path);}
  catch(error){
    const reviewFindings=[`${path} 未解析：${error instanceof Error?error.message:String(error)}；原始成员记录：${JSON.stringify(value)??'undefined'}`,`${path}.source：没有可转换的来源正文；原始值：undefined`];
    findings.push(...reviewFindings);
    return{key,label:`未完成角色 ${key}`,source:'',sourceHash:hashSource(''),reviewFindings};
  }
  if(Object.keys(record).some(key=>!ACTOR_KEYS.includes(key as typeof ACTOR_KEYS[number])))findings.push(`${path} 含额外记录；Actor 内容保留。`);
  const reviewFindings=Array.isArray(record.reviewFindings)?record.reviewFindings.filter((entry):entry is string=>typeof entry==='string'):[];
  const retain=(field:string,message:string)=>{if(reviewFindings.some(finding=>finding.startsWith(`${path}.${field}：`)))return;const finding=`${path}.${field}：${message}；原始值：${JSON.stringify(record[field])??'undefined'}`;reviewFindings.push(finding);findings.push(finding);};
  if(key!==record.key)retain('key',`技术 key 已重建为 ${key}，角色内容保留`);
  let artifact:JsonObject|undefined;
  if(record.artifact!==undefined){
    try{artifact=plainRecord(record.artifact,`${path}.artifact`) as JsonObject;}
    catch{retain('artifact','保存的 Actor 无法解析；完整来源保留，可继续本地转换');}
  }
  const label=typeof record.label==='string'&&record.label.trim()?record.label:typeof artifact?.name==='string'&&artifact.name.trim()?artifact.name:key;
  if(label!==record.label)retain('label',`显示名称已恢复为 ${label}`);
  const source=typeof record.source==='string'?record.source:'';
  if(!source.trim())retain('source','没有可转换的来源正文；已有 Actor 保留，未完成成员不会标成成功');
  const sourceHash=hashSource(source);
  if(record.sourceHash!==sourceHash)retain('sourceHash','sourceHash 与保存来源不一致；正文与 Actor 保留');
  return { key, label, source, sourceHash, ...(reviewFindings.length||Array.isArray(record.reviewFindings)?{reviewFindings:[...new Set(reviewFindings)]}:{}), ...(record.rulePresentation?{rulePresentation:record.rulePresentation as RulePresentationPlan}:{}), ...(artifact ? { artifact, artifactHash: typeof record.artifactHash==='string'?record.artifactHash as Sha256:hashArtifact(artifact) } : {}) };
}

function decodeMacro(value: unknown, path: string, actorKeys: ReadonlySet<string>): ForgeEncounterPackageMacro {
  const record = exactRecord(value, path, MACRO_KEYS);
  const key = slug(record.key, `${path}.key`);
  const name = boundedString(record.name, `${path}.name`, MAX_LABEL_LENGTH, true);
  const command = boundedUtf8String(record.command, `${path}.command`, MAX_COMMAND_BYTES, true);
  const commandHash = sha256Digest(record.commandHash, `${path}.commandHash`);
  if (hashSource(command) !== commandHash) throw new TypeError(`${path}.commandHash does not match command bytes.`);
  const bindings = decodeBindings(record.bindings, `${path}.bindings`, actorKeys);
  const rawCovers = boundedArray(record.covers, `${path}.covers`, 0, MAX_ARRAY_LENGTH);
  const covers = rawCovers.map((entry, index) => decodeCover(entry, `${path}.covers[${index}]`, actorKeys));
  const notes = boundedUtf8String(record.notes, `${path}.notes`, MAX_NOTES_BYTES);
  return { key, name, command, commandHash, bindings, covers, notes };
}

function decodeBindings(value: unknown, path: string, actorKeys: ReadonlySet<string>): Readonly<Record<string, string>> {
  const record = plainRecord(value, path);
  const keys = Object.keys(record);
  const output: Record<string, string> = {};
  for (const bindingKey of keys.sort()) {
    if (DANGEROUS_KEYS.has(bindingKey)) throw new TypeError(`${path} contains a forbidden prototype key.`);
    const actorKey = slug(record[bindingKey], `${path}.${bindingKey}`);
    if (!actorKeys.has(actorKey)) throw new TypeError(`${path}.${bindingKey} must reference an actor key.`);
    output[slug(bindingKey, `${path} key`)] = actorKey;
  }
  return output;
}

function decodeCover(value: unknown, path: string, actorKeys: ReadonlySet<string>): ForgeEncounterPackageMacroCover {
  const record = exactRecord(value, path, COVER_KEYS);
  const actorKey = slug(record.actorKey, `${path}.actorKey`);
  if (!actorKeys.has(actorKey)) throw new TypeError(`${path}.actorKey must reference an actor key.`);
  const mechanicId = boundedString(record.mechanicId, `${path}.mechanicId`, MAX_MECHANIC_ID_LENGTH, true);
  return { actorKey, mechanicId };
}

function decodeAsset(value: unknown, path: string, actorKeys: ReadonlySet<string>): ForgeEncounterPackageAsset {
  const record = exactRecord(value, path, ASSET_KEYS);
  const key = slug(record.key, `${path}.key`);
  const fileName = safeBasename(record.fileName, `${path}.fileName`);
  const assetMime = mime(record.mime, `${path}.mime`);
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  if (!(assetMime === 'image/png' ? extension === 'png' : assetMime === 'image/webp' ? extension === 'webp' : extension === 'jpg' || extension === 'jpeg')) {
    throw new TypeError(`${path}.fileName extension must match the image MIME type.`);
  }
  const base64 = base64Text(record.base64, `${path}.base64`);
  const data = decodeBase64(base64, `${path}.base64`);
  if (data.byteLength > FORGE_ENCOUNTER_PACKAGE_MAX_ASSET_BYTES) throw new TypeError(`${path}.base64 exceeds the asset byte limit.`);
  assertImageMagic(data, assetMime, path);
  const assetHash = sha256Digest(record.sha256, `${path}.sha256`);
  if (hashEncounterBytes(data) !== assetHash) throw new TypeError(`${path}.sha256 does not match decoded asset bytes.`);
  const rawTargets = boundedArray(record.targets, `${path}.targets`, 1, MAX_ACTORS);
  const targets = rawTargets.map((entry, index) => decodeAssetTarget(entry, `${path}.targets[${index}]`, actorKeys));
  assertUnique(targets.map((target) => target.actorKey), `${path} target actor keys`);
  return { key, fileName, mime: assetMime, base64, sha256: assetHash, targets };
}

function decodeAssetTarget(value: unknown, path: string, actorKeys: ReadonlySet<string>): ForgeEncounterPackageAssetTarget {
  const record = exactRecord(value, path, ASSET_TARGET_KEYS);
  const actorKey = slug(record.actorKey, `${path}.actorKey`);
  if (!actorKeys.has(actorKey)) throw new TypeError(`${path}.actorKey must reference an actor key.`);
  const rawFields = boundedArray(record.fields, `${path}.fields`, 1, ASSET_FIELDS.size);
  const fields = rawFields.map((field, index) => {
    if (typeof field !== 'string' || !ASSET_FIELDS.has(field)) throw new TypeError(`${path}.fields[${index}] is unsupported.`);
    return field as 'img' | 'prototypeToken.texture.src';
  });
  assertUnique(fields, `${path} fields`);
  return { actorKey, fields };
}

function assertImageMagic(data: Uint8Array, mime: ForgeEncounterPackageAsset['mime'], path: string): void {
  const png = data.byteLength >= 8
    && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a;
  const webp = data.byteLength >= 12
    && asciiAt(data, 0, 'RIFF') && asciiAt(data, 8, 'WEBP');
  const jpeg = data.byteLength >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if ((mime === 'image/png' && !png) || (mime === 'image/webp' && !webp) || (mime === 'image/jpeg' && !jpeg)) {
    throw new TypeError(`${path}.base64 does not match its declared image MIME magic.`);
  }
}

function asciiAt(bytes: Uint8Array, start: number, text: string): boolean {
  if (start + text.length > bytes.byteLength) return false;
  return [...text].every((character, index) => bytes[start + index] === character.charCodeAt(0));
}

function scanUntrustedJson(root: unknown): void {
  const visit = (value: unknown, path: string, depth: number): void => {
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') {
      return;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError(`${path} must be finite.`);
      return;
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError(`${path} contains a sparse array.`);
        visit(value[index], `${path}[${index}]`, depth + 1);
      }
      return;
    }
    const record = plainRecord(value, path);
    const keys = Object.keys(record);
    for (const key of keys) {
      if (DANGEROUS_KEYS.has(key)) throw new TypeError(`${path} contains a forbidden prototype key.`);
      visit(record[key], `${path}.${key}`, depth + 1);
    }
  };
  visit(root, '$', 0);
}

function exactRecord(value: unknown, path: string, expectedKeys: readonly string[]): Record<string, unknown> {
  const record = plainRecord(value, path);
  const actualKeys = Object.keys(record);
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key) => !expectedKeys.includes(key))) {
    throw new TypeError(`${path} must contain exactly the supported keys.`);
  }
  for (const key of expectedKeys) if (!Object.hasOwn(record, key)) throw new TypeError(`${path}.${key} is required.`);
  return record;
}

function plainRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be a plain object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must be a plain object.`);
  return value as Record<string, unknown>;
}

function boundedArray(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new TypeError(`${path} length is outside ${min}-${max}.`);
  return value;
}

function boundedString(value: unknown, path: string, maximum: number, nonEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (nonEmpty && value.trim().length === 0)) {
    throw new TypeError(`${path} must be a bounded ${nonEmpty ? 'non-empty ' : ''}string.`);
  }
  return value;
}

function boundedUtf8String(value: unknown, path: string, maximum: number, nonEmpty = false): string {
  const text = boundedString(value, path, maximum, nonEmpty);
  if (utf8(text).byteLength > maximum) throw new TypeError(`${path} exceeds the UTF-8 byte limit.`);
  return text;
}

function slug(value: unknown, path: string): string {
  const text = boundedString(value, path, MAX_SLUG_LENGTH, true);
  if (!SLUG_PATTERN.test(text)) throw new TypeError(`${path} must be a lowercase slug.`);
  return text;
}

function safeBasename(value: unknown, path: string): string {
  const fileName = boundedUtf8String(value, path, MAX_FILE_NAME_BYTES, true);
  if (fileName === '.' || fileName === '..' || /[\\/:*?"<>|%#\u0000-\u001f]/u.test(fileName) || /[. ]$/u.test(fileName)) {
    throw new TypeError(`${path} must be a safe file basename.`);
  }
  return fileName;
}

function mime(value: unknown, path: string): ForgeEncounterPackageAsset['mime'] {
  if (typeof value !== 'string' || !MIME_TYPES.has(value)) throw new TypeError(`${path} is unsupported.`);
  return value as ForgeEncounterPackageAsset['mime'];
}

function base64Text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ASSET_BASE64_LENGTH || !BASE64_PATTERN.test(value)) {
    throw new TypeError(`${path} must be canonical base64.`);
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  if (value.endsWith('==') && (alphabet.indexOf(value[value.length - 3]!) & 0x0f) !== 0) throw new TypeError(`${path} must be canonical base64.`);
  if (value.endsWith('=') && !value.endsWith('==') && (alphabet.indexOf(value[value.length - 2]!) & 0x03) !== 0) throw new TypeError(`${path} must be canonical base64.`);
  return value;
}

function decodeBase64(value: string, path: string): Uint8Array {
  const expectedLength = (value.length / 4) * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
  if (!Number.isSafeInteger(expectedLength) || expectedLength > FORGE_ENCOUNTER_PACKAGE_MAX_ASSET_BYTES) throw new TypeError(`${path} exceeds the asset byte limit.`);
  let binary: string;
  try {
    binary = globalThis.atob(value);
  } catch {
    throw new TypeError(`${path} must be valid base64.`);
  }
  if (binary.length !== expectedLength) throw new TypeError(`${path} has an invalid base64 length.`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function sha256Digest(value: unknown, path: string): Sha256 {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new TypeError(`${path} must be a lowercase SHA-256 digest.`);
  return value as Sha256;
}

function literal(value: unknown, expected: string, path: string): void {
  if (value !== expected) throw new TypeError(`${path} is unsupported.`);
}

function literalNumber(value: unknown, expected: number, path: string): void {
  if (!Number.isSafeInteger(value) || value !== expected) throw new TypeError(`${path} is unsupported.`);
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(`Duplicate ${label} are not allowed.`);
}

function assertTextSize(text: string, label: string): void {
  const size = utf8(text).byteLength;
  if (size === 0 || size > FORGE_ENCOUNTER_PACKAGE_MAX_BYTES) throw new TypeError(`${label} size is outside the supported range.`);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) output[key] = sortJson((value as Record<string, unknown>)[key]);
  return output;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(value: Uint8Array, path: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    throw new TypeError(`${path} is not valid UTF-8.`);
  }
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  if (!Number.isSafeInteger(total)) throw new TypeError('ZIP byte total is unsafe.');
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function writeStoredZip(path: string, data: Uint8Array): Uint8Array {
  if (path !== ZIP_PATH) throw new TypeError('Encounter ZIP output path is unsupported.');
  const name = utf8(path);
  const checksum = crc32(data);
  const local = new Uint8Array(30 + name.byteLength);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(6, 0x0800, true);
  localView.setUint16(8, 0, true);
  localView.setUint32(14, checksum, true);
  localView.setUint32(18, data.byteLength, true);
  localView.setUint32(22, data.byteLength, true);
  localView.setUint16(26, name.byteLength, true);
  local.set(name, 30);

  const central = new Uint8Array(46 + name.byteLength);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(8, 0x0800, true);
  centralView.setUint16(10, 0, true);
  centralView.setUint32(16, checksum, true);
  centralView.setUint32(20, data.byteLength, true);
  centralView.setUint32(24, data.byteLength, true);
  centralView.setUint16(28, name.byteLength, true);
  central.set(name, 46);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, central.byteLength, true);
  endView.setUint32(16, local.byteLength + data.byteLength, true);
  return concatBytes([local, data, central, end]);
}

async function readEncounterZip(bytes: Uint8Array): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (view.getUint16(eocd + 4, true) !== 0 || view.getUint16(eocd + 6, true) !== 0 || view.getUint16(eocd + 20, true) !== 0) {
    throw new TypeError('Encounter ZIP must be a single-disk archive without a comment.');
  }
  const count = view.getUint16(eocd + 10, true);
  if (count !== view.getUint16(eocd + 8, true) || count === 0 || count > MAX_ZIP_ENTRIES) throw new TypeError('Encounter ZIP entry count is unsupported.');
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (centralOffset + centralSize !== eocd || centralOffset > bytes.byteLength) throw new TypeError('Encounter ZIP central directory bounds are invalid.');
  const files = new Map<string, Uint8Array>();
  const localRanges: Array<{ start: number; end: number }> = [];
  let totalUncompressed = 0;
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > eocd || view.getUint32(cursor, true) !== 0x02014b50) throw new TypeError('Encounter ZIP central directory entry is invalid.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const checksum = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > eocd || nameLength === 0 || nameLength > 200 || diskStart !== 0) throw new TypeError('Encounter ZIP entry metadata is unsupported.');
    if ((flags & ~0x0800) !== 0 || (method !== 0 && method !== 8)) throw new TypeError('Encounter ZIP flags or compression method are unsupported.');
    const path = decodeUtf8(bytes.subarray(cursor + 46, cursor + 46 + nameLength), `Encounter ZIP entry ${index}`);
    if (path.includes('..') || path.includes('\\') || path.startsWith('/') || path !== ZIP_PATH) throw new TypeError('Encounter ZIP entry path is unsafe or unsupported.');
    if (files.has(path)) throw new TypeError('Encounter ZIP contains a duplicate path.');
    totalUncompressed += uncompressedSize;
    if (!Number.isSafeInteger(totalUncompressed) || totalUncompressed > FORGE_ENCOUNTER_PACKAGE_MAX_BYTES) throw new TypeError('Encounter ZIP expanded content exceeds the package limit.');
    if (localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== 0x04034b50) throw new TypeError('Encounter ZIP local header is invalid.');
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localChecksum = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localUncompressedSize = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (localNameLength === 0 || localNameLength > 200 || localOffset + 30 + localNameLength > centralOffset || dataOffset + compressedSize > centralOffset) {
      throw new TypeError('Encounter ZIP local entry bounds are invalid.');
    }
    const localPath = decodeUtf8(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength), `Encounter ZIP local entry ${index}`);
    if (localPath !== path || localFlags !== flags || localMethod !== method || localChecksum !== checksum
      || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize) {
      throw new TypeError('Encounter ZIP local header does not match the central directory.');
    }
    const localEnd = dataOffset + compressedSize;
    if (localRanges.some((range) => localOffset < range.end && range.start < localEnd)) throw new TypeError('Encounter ZIP local entries overlap.');
    localRanges.push({ start: localOffset, end: localEnd });
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? new Uint8Array(compressed) : await inflateRaw(compressed, uncompressedSize);
    if (data.byteLength !== uncompressedSize || crc32(data) !== checksum) throw new TypeError('Encounter ZIP entry size or CRC does not match the central directory.');
    files.set(path, data);
    cursor = next;
  }
  if (cursor !== eocd) throw new TypeError('Encounter ZIP central directory has trailing records.');
  if (files.size !== 1 || !files.has(ZIP_PATH)) throw new TypeError('Encounter ZIP must contain exactly encounter.json.');
  return files.get(ZIP_PATH)!;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === view.byteLength) return offset;
  }
  throw new TypeError('Encounter ZIP end-of-central-directory record was not found.');
}

async function inflateRaw(compressed: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  const DecompressionStreamCtor = (globalThis as { DecompressionStream?: new(format: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (typeof DecompressionStreamCtor !== 'function') throw new TypeError('Deflate encounter ZIP entries are unsupported in this browser.');
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
      total += chunk.byteLength;
      if (total > expectedSize || total > FORGE_ENCOUNTER_PACKAGE_MAX_BYTES) {
        await reader.cancel('expanded-size-limit');
        throw new TypeError('Encounter ZIP deflate output exceeds its declared or package limit.');
      }
      parts.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return concatBytes(parts);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
