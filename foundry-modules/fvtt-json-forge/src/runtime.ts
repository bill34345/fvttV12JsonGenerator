import {
  decodeForgeActorResponse,
  hashArtifact,
  isUsableActorCandidateArtifact,
  type ForgeActorResponse,
  type ForgeActorResult,
  type ForgeSourceId,
  type JsonObject,
  type Sha256,
} from '@fvtt-json-generator/forge-gateway-protocol';
import {
  resolveFoundrySpellUuid,
  resolveLegacySpellUuid,
} from '@fvtt-json-generator/forge-browser-runtime';

import { isForgeCoreVersionSupported } from './mirror-core-compatibility';
import { FORGE_SPELL_IMPORT_PHASE, isForgeSpellImportPending } from '@fvtt-json-generator/contracts/forge-import-lifecycle';
import { RESOLVER_MODULE_ID } from '@fvtt-json-generator/spell-manifest-contracts';

export const MODULE_ID = 'fvtt-json-forge' as const;
export const EXPECTED_FOUNDRY_VERSION = '14.364' as const;
export const EXPECTED_SYSTEM_ID = 'dnd5e' as const;
export const EXPECTED_SYSTEM_VERSION = '5.3.3' as const;

export interface ForgeGameLike {
  version?: string;
  system?: { id?: string; version?: string };
  user?: { id?: string; isGM?: boolean };
  actors?: ForgeActorCollectionLike;
  modules?: {get(id:string):{active?:boolean;version?:string}|undefined};
}

export interface ForgeActorLike {
  id?: string;
  uuid?: string;
  name?: string;
  flags?: Record<string, unknown>;
  delete(): Promise<unknown>;
  toObject(): unknown;
  update?(changes: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface ForgeActorCollectionLike {
  contents?: ForgeActorLike[];
  values?: () => IterableIterator<ForgeActorLike>;
  get?: (id: string) => ForgeActorLike | undefined;
  documentClass: ForgeActorDocumentClass;
}

export interface ForgeActorDocumentClass {
  create(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<ForgeActorLike>;
}

export interface ForgeAcceptedActorCreateInput {
  game: ForgeGameLike;
  response: ForgeActorResponse;
  rawSourceHash?: Sha256;
  signal?: AbortSignal;
}

export interface ForgeActorCandidateReviewApproval {
  gmId: string;
  /** The final rendered source hash, distinct from the raw Intake source. */
  sourceHash: Sha256;
  artifactHash: Sha256;
  findingsHash?: Sha256;
}

export interface ForgeReviewedActorCandidateCreateInput extends ForgeAcceptedActorCreateInput {
  reviewApproval: ForgeActorCandidateReviewApproval;
}

export interface ForgeActorCreateResult {
  status: 'created' | 'existing';
  actor: ForgeActorLike;
  uuid: string;
  sourceId: ForgeSourceId;
  artifactHash: Sha256;
  /** Delivery diagnostics belong to Forge's UI/history, never the Actor. */
  readbackWarnings?: string[];
}

export class ForgeTemporaryActorCleanupError extends Error {
  public readonly actorUuid: string;

  public constructor(actorUuid: string, cause: unknown) {
    super(
      `New Forge Actor ${actorUuid} could not be deleted and may remain in the world. Inspect it before retrying.`,
      { cause },
    );
    this.name = 'ForgeTemporaryActorCleanupError';
    this.actorUuid = actorUuid;
  }
}

export async function createAcceptedForgeActor(
  input: ForgeAcceptedActorCreateInput,
): Promise<ForgeActorCreateResult> {
  assertGm(input.game);
  assertExactRuntime(input.game);
  const decoded = decodeForgeActorResponse(input.response);
  if (!decoded.ok || !('result' in decoded.value) || !decoded.value.result.artifact) {
    throw new Error('Forge Actor response does not contain a generated Actor.');
  }
  throwIfAborted(input.signal);
  const result = decoded.value.result;
  assertResponseTarget(result.target, input.game);
  return createForgeActorDocument(input, {
    sourceIdentity: result.sourceIdentity,
    artifact: result.artifact!,
    artifactHash: hashArtifact(result.artifact!),
  });
}

/** Binds a GM's decision to the current candidate and the unchanged strict
 * report. It never changes a failed/needs_review verdict into accepted. */
export function forgeActorCandidateReviewHash(response: ForgeActorResponse): Sha256 {
  const decoded = decodeForgeActorResponse(response);
  if (!decoded.ok || !('result' in decoded.value) || !decoded.value.result.artifact) {
    throw new Error('A decoded Actor candidate is required for GM review.');
  }
  const result = decoded.value.result;
  return hashArtifact({
    requestId: decoded.value.requestId, sourceIdentity: result.sourceIdentity, target: result.target,
    artifactHash: hashArtifact(result.artifact!), strictStatus: result.status,
    diagnostics: result.diagnostics, verification: result.verification,
    actorWarnings: result.actorVerification.warnings,
  } as unknown as JsonObject);
}

export async function createReviewedForgeActorCandidate(
  input: ForgeReviewedActorCandidateCreateInput,
): Promise<ForgeActorCreateResult> {
  assertGm(input.game);
  assertExactRuntime(input.game);
  const decoded = decodeForgeActorResponse(input.response);
  if (!decoded.ok || !('result' in decoded.value) || decoded.value.result.status === 'accepted'
    || !decoded.value.result.artifact) throw new Error('A decoded unaccepted Actor candidate is required for explicit GM review.');
  const result = decoded.value.result;
  assertResponseTarget(result.target, input.game);
  if (!isUsableActorCandidateArtifact(result.artifact)) {
    throw new Error('当前响应未包含 Actor 文档；请查看 Forge 中的生成错误。');
  }
  const approval = input.reviewApproval;
  const artifactHash = hashArtifact(result.artifact);
  const findingsHash = forgeActorCandidateReviewHash(decoded.value);
  if (!approval || typeof approval.gmId !== 'string' || !approval.gmId.trim()
    || approval.gmId !== input.game.user?.id || approval.sourceHash !== result.sourceIdentity.sourceHash
    || approval.artifactHash !== artifactHash || (approval.findingsHash !== undefined && approval.findingsHash !== findingsHash)) {
    throw new Error('GM candidate approval does not match the current user, source, artifact or findings.');
  }
  return createForgeActorDocument(input, { sourceIdentity: result.sourceIdentity, artifact: result.artifact, artifactHash });
}

async function createForgeActorDocument(
  input: ForgeAcceptedActorCreateInput,
  result: { sourceIdentity: ForgeActorResult['sourceIdentity']; artifact: JsonObject; artifactHash: Sha256 },
): Promise<ForgeActorCreateResult> {
  throwIfAborted(input.signal);

  const collection = input.game.actors;
  if (!collection) throw new Error('Foundry world Actor collection is unavailable.');
  const importWarnings: string[] = [];
  const importArtifact = prepareFoundryImportArtifact(result.artifact,input.game,importWarnings);
  const documentId = forgeActorDocumentId(result.sourceIdentity.sourceId);
  const identity = {
    protocolVersion: 1,
    requestId: input.response.requestId,
    sourceId: result.sourceIdentity.sourceId,
    sourceHash: result.sourceIdentity.sourceHash,
    ...(input.rawSourceHash ? { rawSourceHash: input.rawSourceHash } : {}),
    artifactHash: result.artifactHash,
  } as const;
  // Document.create() receives the complete generated Actor plus Forge identity.
  // A portable caster's phase-only update follows successful readback to release
  // hydration. A crash after create may leave the complete pending Actor.
  // Identity failures roll back; content differences are returned to the UI.
  const worldCreateData = prepareWorldCreateData(importArtifact, identity, documentId);
  const existing = findActors(collection, result.sourceIdentity.sourceId);
  const conflicting = existing.filter((actor) => getForgeIdentity(actor)?.artifactHash !== result.artifactHash);
  if (conflicting.length > 0) {
    throw new Error('The same Forge source ID already exists with a different artifact hash. Existing Actor was not changed.');
  }
  if (existing.length > 1) {
    throw new Error('Multiple existing Actors claim the same Forge source ID. Resolve the world conflict before creating or reusing an Actor.');
  }
  if (existing[0]) {
    throwIfAborted(input.signal);
    return verifyReusableActor(
      existing[0],
      importArtifact,
      result.sourceIdentity.sourceId,
      result.sourceIdentity.sourceHash,
      result.artifactHash,
    );
  }
  const idCollision = findActorById(collection, documentId);
  if (idCollision) {
    throw new Error(`The deterministic Forge Actor ID ${documentId} is already occupied by another world Actor. Existing Actor was not changed.`);
  }

  let created: ForgeActorLike | undefined;
  let cleanupRequired = true;
  try {
    throwIfAborted(input.signal);
    try {
      created = await collection.documentClass.create(
        worldCreateData,
        { renderSheet: false, keepId: true },
      );
    } catch (error) {
      const concurrent = findActorById(collection, documentId);
      const concurrentIdentity = concurrent && getForgeIdentity(concurrent);
      if (concurrentIdentity?.sourceId === result.sourceIdentity.sourceId) {
        if (concurrentIdentity.artifactHash !== result.artifactHash) {
          throw new Error('A concurrent Forge operation claimed the same source ID with a different artifact hash. Existing Actor was not changed.', { cause: error });
        }
        return verifyReusableActor(
          concurrent!,
          importArtifact,
          result.sourceIdentity.sourceId,
          result.sourceIdentity.sourceHash,
          result.artifactHash,
        );
      }
      throw error;
    }
    const actor = created;
    if (!actor) throw new Error('Foundry did not return the created Actor document.');
    if (actor.id !== documentId) {
      throw new Error('Foundry did not preserve the deterministic Forge Actor ID during creation.');
    }
    const readback = actor.toObject();
    assertReadback(
      importArtifact,
      readback,
      input.response.requestId,
      result.sourceIdentity.sourceId,
      result.sourceIdentity.sourceHash,
      result.artifactHash,
      input.rawSourceHash,
    );
    const uuid=requireActorUuid(actor);
    const readbackWarnings=[...importWarnings,...actorReadbackWarnings(importArtifact,readback)];
    cleanupRequired = false;
    // Readback is committed before publishing completion. A failed phase
    // update leaves the verified Actor in place; it must not race hydration
    // with the importer's document rollback.
    await completeForgeSpellImport(actor);
    return {
      status: 'created',
      actor,
      uuid,
      sourceId: result.sourceIdentity.sourceId,
      artifactHash: result.artifactHash,
      ...(readbackWarnings.length?{readbackWarnings}:{}),
    };
  } finally {
    if (cleanupRequired && created) {
      try {
        await created.delete();
      } catch (error) {
        throw new ForgeTemporaryActorCleanupError(created.uuid ?? created.id ?? '[unknown Actor]', error);
      }
    }
  }
}

function prepareWorldCreateData(
  artifact: JsonObject,
  identity: {
    protocolVersion: 1;
    requestId: string;
    sourceId: ForgeSourceId;
    sourceHash: Sha256;
    rawSourceHash?: Sha256;
    artifactHash: Sha256;
  },
  documentId: string,
): JsonObject {
  const copy = JSON.parse(JSON.stringify(artifact)) as JsonObject;
  const flags = getRecord(copy.flags);
  copy._id = documentId;
  copy.flags = { ...flags, [MODULE_ID]: JSON.parse(JSON.stringify(identity)) as JsonObject };
  markForgeSpellImportPending(copy);
  return copy;
}

export function markForgeSpellImportPending(data: any): void {
  if(!data?.flags?.[RESOLVER_MODULE_ID]?.spellManifest)return;
  data.flags[MODULE_ID]??={};data.flags[MODULE_ID][FORGE_SPELL_IMPORT_PHASE]='pending';
}

export async function completeForgeSpellImport(actor: ForgeActorLike): Promise<void> {
  if(!isForgeSpellImportPending(actor.toObject()))return;
  try{
    if(typeof actor.update!=='function')throw Error('Actor.update is unavailable');
    await actor.update({[`flags.${MODULE_ID}.${FORGE_SPELL_IMPORT_PHASE}`]:'verified'},{render:false});
    const phase=getRecord(getRecord(getRecord(actor.toObject()).flags)[MODULE_ID])[FORGE_SPELL_IMPORT_PHASE];
    if(phase!=='verified')throw Error('Import phase was not persisted');
  }catch(cause){
    let phase:unknown='unavailable';try{phase=getRecord(getRecord(getRecord(actor.toObject()).flags)[MODULE_ID])[FORGE_SPELL_IMPORT_PHASE]??'missing';}catch{}
    throw new Error(`Forge Actor ${actor.uuid??actor.id} passed import readback and remains in the world, but spell-resolution release was not confirmed (local phase: ${String(phase)}); read the persisted Actor and resolver status before retrying.`,{cause});
  }
}

export function prepareFoundryImportArtifact(artifact: JsonObject,game?:Pick<ForgeGameLike,'modules'>,warnings: string[] = []): JsonObject {
  const copy = JSON.parse(JSON.stringify(artifact)) as JsonObject;
  if (!Array.isArray(copy.items)) return copy;
  const independent=sourceOperationActivityGroups(copy,warnings),midi=game?.modules?.get('midi-qol');
  if(independent.length&&midi?.active){
    if(midi.version!=='14.0.11')warnings.push(`Midi ${midi.version??'unknown'} 的独立活动适配尚未验证；原生活动保留，请核对第三方自动化。`);
    for(const group of independent)for(const{activity}of group.activities){
      activity.midiProperties={...getRecord(activity.midiProperties),otherActivityCompatible:false,triggeredActivityId:'none'};
      // Midi14.0.11 removes core damage buttons and may hide its replacement
      // using GM automation settings. This source-bound mixed Save keeps an
      // explicit manual damage entry without changing world settings, rolls,
      // consumption or the GM-owned remainder.
      if(activity.type==='save'&&Array.isArray(getRecord(activity.damage).parts)&&getRecord(activity.damage).parts.length){
        activity.midiProperties.removeChatButtons='none';
      }
      // Midi14.0.11 defines otherActivityId on Attack. Damage has no such
      // field. Empty Attack IDs otherwise auto-select a compatible sibling.
      if(activity.type==='attack')activity.otherActivityId='none';
    }
  }

  for (const itemValue of copy.items) {
    const item = getRecord(itemValue);
    const system = getRecord(item.system);
    normalizeLegacySpellReferencesForFoundry(system,warnings);
    const parentRange = getRecord(system.range);
    if (!Object.prototype.hasOwnProperty.call(system, 'range') || parentRange.long !== null) continue;

    const activityLongs = new Set<number>();
    for (const activityValue of Object.values(getRecord(system.activities))) {
      const activityRange = getRecord(getRecord(activityValue).range);
      if (typeof activityRange.long === 'number') activityLongs.add(activityRange.long);
    }
    if (activityLongs.size > 1) {
      warnings.push(`${String(item.name??'能力')}：活动包含不同远射程；已保留各活动距离，未指定统一父级远射程。`);
      continue;
    }
    const [long] = activityLongs;
    if (long !== undefined) parentRange.long = long;
  }

  return copy;
}

/** Collect existing operation activities for the optional Midi adapter. The
 * generator owns their mechanics; annotation mismatches never remove them. */
function sourceOperationActivityGroups(artifact:unknown,warnings:string[]=[]):Array<{index:number;activities:Array<{key:string;activity:Record<string,any>}>}>{
  const groups:Array<{index:number;activities:Array<{key:string;activity:Record<string,any>}>}>=[];
  const items=getRecord(artifact).items;if(!Array.isArray(items))return groups;
  for(const[index,item]of items.entries()){
    const rule=getRecord(getRecord(getRecord(item).flags).fvttJsonGenerator).manualRule;
    if(!Array.isArray(rule?.sourceOperations))continue;
    const activities=Object.entries(getRecord(getRecord(getRecord(item).system).activities))
      .map(([key,value])=>({key,activity:getRecord(value)}));
    if(rule.mode!=='native-with-gm'||typeof rule.sourceText!=='string'){
      warnings.push(`${String(getRecord(item).name??'能力')}：操作附带记录不完整，已有活动保持。`);
    }
    groups.push({index,activities});
  }
  return groups;
}

/** These are safety fields, not Document noise. Check native defaults as well
 * as prepared expectations so the real r4 unsafe Doc fails even against core. */
function assertSourceOperationMidiSafety(artifact:unknown,readback:unknown):void{
  const items=getRecord(readback).items;
  for(const group of sourceOperationActivityGroups(artifact))for(const{key,activity:expected}of group.activities){
    const actual=getRecord(getRecord(getRecord(Array.isArray(items)?items[group.index]:undefined).system).activities)[key];
    if(expected.midiProperties===undefined&&actual?.midiProperties===undefined)continue;
    const midi=getRecord(actual?.midiProperties);
    if(midi.otherActivityCompatible!==false||midi.triggeredActivityId!=='none'
      ||expected.midiProperties?.removeChatButtons==='none'&&midi.removeChatButtons!=='none'
      ||expected.type==='attack'&&actual?.otherActivityId!=='none'
      ||expected.type!=='attack'&&actual?.otherActivityId!==undefined&&actual.otherActivityId!=='none'){
      throw new Error('Foundry Actor semantics failed independent source-operation Midi safety readback. Missing or changed safety fields; use a new Forge source/package identity for unsafe existing Actors, which are not migrated.');
    }
  }
}

export function assertGm(game: ForgeGameLike): void {
  if (game.user?.isGM !== true) throw new Error('Forge Actor creation requires an active GM user.');
}

export function assertExactRuntime(game: ForgeGameLike): void {
  if (!isForgeCoreVersionSupported(game.version)) throw new Error(`Forge Actor requires Foundry ${EXPECTED_FOUNDRY_VERSION} or 14.368.`);
  if (game.system?.id !== EXPECTED_SYSTEM_ID || game.system?.version !== EXPECTED_SYSTEM_VERSION) {
    throw new Error(`Forge Actor requires dnd5e ${EXPECTED_SYSTEM_VERSION}.`);
  }
}

export function assertResponseTarget(
  target: {
    fvttRuntimeVersion: string;
    generatorProfile: string;
    systemId: string;
    systemVersionObserved: string;
    effectProfile: string;
    iconMode: string;
  },
  game: ForgeGameLike,
): void {
  const expected = {
    fvttRuntimeVersion: game.version,
    generatorProfile: 'v14',
    systemId: EXPECTED_SYSTEM_ID,
    systemVersionObserved: EXPECTED_SYSTEM_VERSION,
    effectProfile: 'core',
  } as const;
  const actual = {
    fvttRuntimeVersion: target.fvttRuntimeVersion,
    generatorProfile: target.generatorProfile,
    systemId: target.systemId,
    systemVersionObserved: target.systemVersionObserved,
    effectProfile: target.effectProfile,
  };
  if (target.iconMode !== 'off' && target.iconMode !== 'safe') {
    throw new Error('Forge Actor response target has an unsupported iconMode.');
  }
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Forge Actor response target does not match the supported Foundry runtime at ${key}.`);
    }
  }
  if (game.version !== expected.fvttRuntimeVersion || game.system?.id !== expected.systemId || game.system?.version !== expected.systemVersionObserved) {
    throw new Error('Forge Actor response target does not match the active Foundry runtime.');
  }
}

function assertReadback(
  artifact: JsonObject,
  readback: unknown,
  requestId: string,
  sourceId: ForgeSourceId,
  sourceHash: Sha256,
  artifactHash: Sha256,
  rawSourceHash?: Sha256,
): void {
  const identity = getForgeIdentity(readback);
  if (
    identity?.protocolVersion !== 1
    || identity.requestId !== requestId
    || identity.sourceId !== sourceId
    || identity.sourceHash !== sourceHash
    || identity.artifactHash !== artifactHash
    || (rawSourceHash !== undefined && identity.rawSourceHash !== rawSourceHash)
  ) {
    throw new Error('Foundry Actor readback does not preserve Forge source identity.');
  }
}

export function assertActorSemantics(artifact: JsonObject, readback: unknown): void {
  assertSourceOperationMidiSafety(artifact,readback);
  const actual = actorSemantics(readback, 'readback');
  const expected = actorSemantics(artifact, 'artifact');
  const projected = projectReadbackToExpected(actual, expected);
  if (stableJson(projected) !== stableJson(expected)) {
    const path = firstDifferencePath(projected, expected) ?? 'unknown';
    throw new Error(`Foundry Actor readback does not match the generated artifact semantics at ${path}.`);
  }
}

/** Creation is complete even when Foundry cleans or changes content. Keep the
 * submitted artifact unchanged and report each observed difference separately. */
export function actorReadbackWarnings(artifact:JsonObject,readback:unknown):string[]{
  const warnings:string[]=[];
  try{assertSourceOperationMidiSafety(artifact,readback);}catch(error){warnings.push(`活动兼容性需要核对：${error instanceof Error?error.message:String(error)}`);}
  try{
    const expected=actorSemantics(artifact,'artifact'),actual=projectReadbackToExpected(actorSemantics(readback,'readback'),expected);
    const visit=(want:any,got:any,path:string):void=>{
      if(stableJson(want)===stableJson(got))return;
      if(want&&got&&typeof want==='object'&&typeof got==='object'&&Array.isArray(want)===Array.isArray(got)){
        for(const key of new Set([...Object.keys(want),...Object.keys(got)]))visit(want[key],got[key],Array.isArray(want)?`${path}[${key}]`:`${path}.${key}`);
        return;
      }
      const match=path.match(/^\$\.items\[(\d+)\](?:\.activities\[(\d+)\]\.value)?/u);
      const item=match?(artifact.items as any[])?.[Number(match[1])]:undefined;
      const activity=match?.[2]!==undefined?Object.entries(item?.system?.activities??{}).sort(([a],[b])=>a.localeCompare(b))[Number(match[2])]?.[1] as any:undefined;
      const label=[String(artifact.name??'角色'),item?.name,activity?.name].filter(Boolean).join(' · ');
      const names:Record<string,string>={'damageVulnerability.custom':'伤害易伤备注','damageVulnerability.value':'伤害易伤类别','range.long':'远射程','range.value':'距离','hp.value':'当前生命值','hp.max':'最大生命值','hp.formula':'生命骰','damage.parts':'伤害','name':'名称','img':'图标'};
      const field=Object.entries(names).find(([key])=>path.endsWith(key))?.[1]??path.replace(/^\$\.?/u,'');
      const display=(value:unknown)=>value===undefined?'未保留':value===null?'空值':JSON.stringify(value).slice(0,240);
      warnings.push(`${label}：${field}，生成值为 ${display(want)}，Foundry 保存值为 ${display(got)}。角色已保留，请核对。`);
    };
    visit(expected,actual,'$');
  }catch(error){warnings.push(`角色已保留，但内容读回核对未完成：${error instanceof Error?error.message:String(error)}`);}
  return [...new Set(warnings)];
}

function verifyReusableActor(
  actor: ForgeActorLike,
  artifact: JsonObject,
  sourceId: ForgeSourceId,
  sourceHash: Sha256,
  artifactHash: Sha256,
): ForgeActorCreateResult {
  if(isForgeSpellImportPending(actor.toObject()))throw new Error('Existing Forge Actor import is still pending; wait for or inspect that import before reuse.');
  let readback:unknown;
  try {
    readback = actor.toObject();
    const identity = getForgeIdentity(readback);
    if (
      identity?.protocolVersion !== 1
      || !identity.requestId
      || identity.sourceId !== sourceId
      || identity.sourceHash !== sourceHash
      || identity.artifactHash !== artifactHash
    ) {
      throw new Error('Existing Actor does not preserve the expected Forge source identity.');
    }
  } catch (cause) {
    throw new Error('Existing Forge Actor failed readback verification and was not changed. Use a new Forge source/package identity; existing Actors are not migrated.', { cause });
  }
  const readbackWarnings=actorReadbackWarnings(artifact,readback);
  return {
    status: 'existing',
    actor,
    uuid: requireActorUuid(actor),
    sourceId,
    artifactHash,
    ...(readbackWarnings.length?{readbackWarnings}:{}),
  };
}

function forgeActorDocumentId(sourceId: ForgeSourceId): string {
  return hashArtifact({ sourceId }).slice(0, 16);
}

function findActorById(collection: ForgeActorCollectionLike, id: string): ForgeActorLike | undefined {
  const direct = collection.get?.(id);
  if (direct) return direct;
  const contents = collection.contents ?? (collection.values ? [...collection.values()] : []);
  return contents.find((actor) => actor.id === id);
}

function findActors(collection: ForgeActorCollectionLike, sourceId: ForgeSourceId): ForgeActorLike[] {
  const contents = collection.contents ?? (collection.values ? [...collection.values()] : []);
  return contents.filter((actor) => getForgeIdentity(actor)?.sourceId === sourceId);
}

function getForgeIdentity(value: ForgeActorLike | unknown): {
  protocolVersion?: number;
  requestId?: string;
  sourceId?: string;
  sourceHash?: string;
  rawSourceHash?: string;
  artifactHash?: string;
} | undefined {
  const flags = getRecord(getRecord(value).flags);
  const identity = getRecord(flags[MODULE_ID]);
  if (!identity.sourceId && !identity.sourceHash && !identity.artifactHash) return undefined;
  return {
    protocolVersion: typeof identity.protocolVersion === 'number' ? identity.protocolVersion : undefined,
    requestId: typeof identity.requestId === 'string' ? identity.requestId : undefined,
    sourceId: typeof identity.sourceId === 'string' ? identity.sourceId : undefined,
    sourceHash: typeof identity.sourceHash === 'string' ? identity.sourceHash : undefined,
    rawSourceHash: typeof identity.rawSourceHash === 'string' ? identity.rawSourceHash : undefined,
    artifactHash: typeof identity.artifactHash === 'string' ? identity.artifactHash : undefined,
  };
}

function actorSemantics(value: unknown, effectSource: 'artifact' | 'readback'): unknown {
  const actor = getRecord(value);
  const system = getRecord(actor.system);
  const attributes = getRecord(system.attributes);
  const details = getRecord(system.details);
  const traits = getRecord(system.traits);
  const items = Array.isArray(actor.items) ? actor.items.map((item) => itemSemantics(item, effectSource)) : [];
  return {
    name: actor.name,
    type: actor.type,
    hp: attributes.hp,
    ac: attributes.ac,
    cr: details.cr,
    creatureType: details.type,
    size: traits.size,
    damageVulnerability: traits.dv,
    senses: attributes.senses ?? traits.senses,
    abilities: system.abilities,
    items,
    effects: Array.isArray(actor.effects) ? actor.effects.map((effect) => effectSemantics(effect, effectSource)) : undefined,
  };
}

function itemSemantics(value: unknown, effectSource: 'artifact' | 'readback'): unknown {
  const item = getRecord(value);
  const system = getRecord(item.system);
  const itemRange = system.range === undefined ? undefined : stripDocumentNoise(system.range);
  const activities = Object.entries(getRecord(system.activities)).sort(([a], [b]) => a.localeCompare(b)).map(([id, activity]) => ({
    id,
    value: projectActivityReadback(activity, itemRange),
  }));
  // The native Versatile roll reads Item damage/properties as well as the
  // Attack activity. Losing either during import must fail readback too.
  const nativeVersatile=item.type==='weapon'&&Object.values(getRecord(system.activities)).some(activity=>getRecord(getRecord(getRecord(getRecord(activity).flags).fvttJsonGenerator).sourceOperation).damageMode==='versatile');
  return {
    name: item.name,
    type: item.type,
    img: item.img,
    activation: system.activation,
    uses: system.uses,
    ...(itemRange === undefined ? {} : { range: itemRange }),
    ...(nativeVersatile?{nativeWeapon:{type:system.type,properties:system.properties,damage:system.damage}}:{}),
    activities,
    effects: Array.isArray(item.effects) ? item.effects.map((effect) => effectSemantics(effect, effectSource)) : [],
  };
}

function projectActivityReadback(value: unknown, itemRange: unknown): unknown {
  const activity = getRecord(stripDocumentNoise(value));
  // dnd5e 5.3.3 ActivationField.condition is a default StringField. Core
  // 14.368 cleans it with trim:true, confirmed against the real in-memory
  // Document. Normalize only that native boundary; inner text stays strict
  // and the complete source/evidence in flags is retained byte for byte.
  const activation=getRecord(activity.activation);
  if(typeof activation.condition==='string')activity.activation={...activation,condition:activation.condition.trim()};
  // dnd5e5.3.3 Activity.description.chatFlavor is also a default StringField
  // in the installed Activity schema; Core14.368 trims its edges on creation.
  const description=getRecord(activity.description);
  if(typeof description.chatFlavor==='string')activity.description={...description,chatFlavor:description.chatFlavor.trim()};
  // Schema-derived: 5.3.3 Save/Damage have no includeBase field. Reject an
  // explicit value on either side, rather than dropping it as Doc noise.
  if((activity.type==='save'||activity.type==='damage')&&Object.hasOwn(getRecord(activity.damage),'includeBase')){
    throw new Error('Foundry Actor semantics contain unsupported non-Attack damage.includeBase. Regenerate the source for the locked native schema.');
  }
  normalizeLegacySpellReferenceForComparison(activity);
  normalizeInactiveActivityTemplateForComparison(activity);
  const activityRange = getRecord(activity.range);
  const parentRange = getRecord(itemRange);
  const itemReach = parentRange.reach;
  const itemLong = parentRange.long;
  // dnd5e 5.3.3 stores melee reach on the parent weapon's system.range. Its
  // Activity RangeField intentionally has no reach field, so importFromJSON()
  // drops the protocol's activity-level copy. Project the supported parent
  // field back into the source-shaped comparison without changing the artifact.
  if (activityRange.reach === undefined && typeof itemReach === 'number') {
    activity.range = { ...activityRange, reach: itemReach };
  }
  if ((activityRange.long === undefined || activityRange.long === null) && typeof itemLong === 'number') {
    activity.range = { ...getRecord(activity.range), long: itemLong };
  }
  return activity;
}

function normalizeInactiveActivityTemplateForComparison(activity: Record<string, any>): void {
  const target = getRecord(activity.target);
  const template = getRecord(target.template);
  const hasType = template.type !== undefined && template.type !== null && template.type !== '';
  const hasDimension = ['count', 'size', 'width', 'height']
    .some((key) => template[key] !== undefined && template[key] !== null && template[key] !== '');
  if (hasType || hasDimension || !Object.hasOwn(template, 'units')) return;
  const { units: _units, ...templateWithoutInactiveUnits } = template;
  activity.target = { ...target, template: templateWithoutInactiveUnits };
}

const LEGACY_SPELL_UUID_PATTERN = /^[0-9a-f]{16}$/u;
const LEGACY_SPELL_REFERENCE_PATTERN = /^Compendium\.dnd5e\.spells\.Item\.([0-9a-f]{16})$/u;

function normalizeLegacySpellReferencesForFoundry(system: Record<string, any>,warnings:string[]): void {
  const activities = getRecord(system.activities);
  for (const activityValue of Object.values(activities)) {
    const activity = getRecord(activityValue);
    const spell = getRecord(activity.spell);
    if (typeof spell.uuid !== 'string') continue;
    const legacyUuid = LEGACY_SPELL_UUID_PATTERN.test(spell.uuid)
      ? spell.uuid
      : spell.uuid.match(LEGACY_SPELL_REFERENCE_PATTERN)?.[1];
    if (!legacyUuid) continue;
    const foundryUuid = resolveFoundrySpellUuid(legacyUuid);
    if (!foundryUuid) {
      warnings.push(`法术引用 ${legacyUuid} 没有唯一的 dnd5e 5.3.3 对应；原法术活动及引用保留。`);
      continue;
    }
    spell.uuid = foundryUuid;
  }
}

function normalizeLegacySpellReferenceForComparison(activity: Record<string, any>): void {
  const spell = getRecord(activity.spell);
  if (typeof spell.uuid !== 'string') return;
  const legacyUuid = resolveLegacySpellUuid(spell.uuid)
    ?? spell.uuid.match(LEGACY_SPELL_REFERENCE_PATTERN)?.[1];
  if (legacyUuid) spell.uuid = legacyUuid;
}

function effectSemantics(value: unknown, source: 'artifact' | 'readback'): unknown {
  const effect = getRecord(value);
  const systemChanges = getRecord(effect.system).changes;
  const usesCanonicalChanges = Array.isArray(systemChanges);
  const changes = usesCanonicalChanges ? systemChanges : effect.changes;
  return {
    id: effect._id,
    name: effect.name,
    changes: Array.isArray(changes)
      ? changes.map((changeValue: unknown) => {
        const change = getRecord(changeValue);
        const projectedChange = source === 'artifact' && !usesCanonicalChanges
          ? normalizeFoundryV14LegacyEffectChange(change)
          : change;
        return {
          ...projectedChange,
          value: stableJson(projectedChange.value),
        };
      })
      : changes,
    transfer: effect.transfer,
    statuses: effect.statuses,
  };
}

const FOUNDRY_V14_EFFECT_TYPES_BY_MODE: Readonly<Record<number, string>> = {
  0: 'custom',
  1: 'multiply',
  2: 'add',
  3: 'downgrade',
  4: 'upgrade',
  5: 'override',
};

function normalizeFoundryV14LegacyEffectChange(change: Record<string, any>): Record<string, any> {
  const normalized = { ...change };
  if (!Object.hasOwn(normalized, 'type') && typeof normalized.mode === 'number') {
    normalized.type = FOUNDRY_V14_EFFECT_TYPES_BY_MODE[normalized.mode] ?? `custom.${normalized.mode}`;
    delete normalized.mode;
  }
  normalized.value = normalizeFoundryV14EffectChangeValue(normalized.value);
  return normalized;
}

function normalizeFoundryV14EffectChangeValue(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value;
  try {
    return normalizeFoundryV14EffectChangeValue(JSON.parse(value));
  } catch {
    return value;
  }
}

function stripDocumentNoise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDocumentNoise);
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === '_stats' || key === 'folder' || key === 'ownership' || key === 'permission' || key === 'sort') continue;
    result[key] = stripDocumentNoise(entry);
  }
  return result;
}

function projectReadbackToExpected(actual: unknown, expected: unknown): unknown {
  if (expected === undefined) return undefined;
  if (expected === null) return actual === undefined ? null : actual;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return actual;
    return expected.map((entry, index) => projectReadbackToExpected(actual[index], entry));
  }
  if (typeof expected === 'object') {
    const actualRecord = getRecord(actual);
    return Object.fromEntries(
      Object.entries(expected as Record<string, unknown>).map(([key, entry]) => [
        key,
        projectReadbackToExpected(actualRecord[key], entry),
      ]),
    );
  }
  if (typeof expected === 'number' && typeof actual === 'string' && actual.trim() !== '' && Number(actual) === expected) {
    return expected;
  }
  return actual;
}

function getRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function requireActorUuid(actor: ForgeActorLike): string {
  const uuid = actor.uuid ?? actor.id;
  if (!uuid) throw new Error('Foundry Actor did not expose a UUID after creation.');
  return uuid;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function firstDifferencePath(actual: unknown, expected: unknown, path = '$'): string | undefined {
  if (stableJson(actual) === stableJson(expected)) return undefined;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return path;
    if (actual.length !== expected.length) return `${path}.length`;
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstDifferencePath(actual[index], expected[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return path;
  }
  if (expected && typeof expected === 'object') {
    const actualRecord = getRecord(actual);
    for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
      const difference = firstDifferencePath(actualRecord[key], value, `${path}.${key}`);
      if (difference) return difference;
    }
    return path;
  }
  return path;
}
