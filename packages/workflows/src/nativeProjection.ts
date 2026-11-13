import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { DND5E_V14_SYSTEM_VERSION } from '@fvtt-json-generator/contracts/target';
import { isVersionInMajor } from '@fvtt-json-generator/contracts/version-admission';
import type { FoundryTarget } from '@fvtt-json-generator/generation/target';

/** A caller-owned native constructor; source projection and receiver identity remain separate. */
export interface NativeDocumentProjection {
  target: FoundryTarget;
  /** Observed receiver identity, separate from the locked source projection. */
  runtime?: { coreVersion: string; systemId: 'dnd5e'; systemVersion: string };
  project(kind: 'Actor' | 'Item', source: any): any | Promise<any>;
}

export async function projectNativeDocument(port: NativeDocumentProjection, kind: 'Actor' | 'Item', source: any): Promise<any> {
  const target = port.target;
  if (target.fvttVersion !== '14' || !isVersionInMajor(target.stats.coreVersion, '14.369')
    || target.stats.systemVersion !== DND5E_V14_SYSTEM_VERSION || target.stats.systemId !== 'dnd5e'
    || target.dnd5eVersion !== DND5E_V14_SYSTEM_VERSION) throw new Error('Unsupported native projection target.');
  const input = JSON.parse(JSON.stringify(source));
  assignIds(input, kind);
  input._stats = { ...input._stats, ...target.stats };
  const projected = await port.project(kind, JSON.parse(JSON.stringify(input)));
  assertMembersPreserved(input, projected, kind);
  if (kind === 'Actor') assertActorAttributes(input, projected);
  if (projected?._stats?.coreVersion !== target.stats.coreVersion
    || projected?._stats?.systemVersion !== target.stats.systemVersion
    || projected?._stats?.systemId !== target.stats.systemId) throw new Error('Native Document projection returned a different target.');
  return projected;
}

function assignIds(source: any, scope: string): void {
  const allocate = (value: any, path: string) => {
    value._id ||= sha256(`${scope}/${path}/${JSON.stringify(stableIdentitySource(value))}`).slice(0, 16);
  };
  for (const [i, item] of (source.items ?? []).entries()) {
    allocate(item, `items/${i}`);
    assignIds(item, `${scope}/items/${i}`);
  }
  for (const [i, effect] of (source.effects ?? []).entries()) {
    allocate(effect, `effects/${i}`);
    for (const [j, change] of (effect.system?.changes ?? effect.changes ?? []).entries()) allocate(change, `effects/${i}/changes/${j}`);
  }
}

function stableIdentitySource(value:any):any{
  if(Array.isArray(value))return value.map(stableIdentitySource);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(key=>key!=='_stats').sort()
    .map(key=>[key,stableIdentitySource(value[key])]));
  return value;
}

function assertMembersPreserved(before: any, after: any, path: string): void {
  for (const key of ['name', 'type']) if (before[key] !== undefined && before[key] !== after?.[key]) throw new Error(`Native projection changed ${path}/${key}.`);
  if (before.system?.description?.value !== undefined && before.system.description.value !== after.system?.description?.value)
    throw new Error(`Native projection lost ${path}/description.`);
  assertFiniteUses(before.system?.uses, after.system?.uses, `${path}/uses`);
  const changes = before.system?.changes ?? before.changes;
  if (Array.isArray(changes)) {
    for (const key of ['disabled', 'transfer', 'statuses', 'origin', 'description'])
      assertSourceFields(before[key], after[key], `${path}/${key}`);
    assertEffectDuration(before,after,path);
    const actualChanges = after.system?.changes ?? after.changes;
    if (!Array.isArray(actualChanges) || changes.length !== actualChanges.length) throw new Error(`Native projection changed ${path}/changes.`);
    for (const [index, change] of changes.entries()) {
      const actual = actualChanges.find((entry: any) => entry._id === change._id) ?? actualChanges[index];
      const modes: Record<number, string> = {0:'custom',1:'multiply',2:'add',3:'downgrade',4:'upgrade',5:'override'};
      if (change._id !== actual?._id || change.key !== actual?.key || (change.type ?? modes[change.mode]) !== (actual?.type ?? modes[actual?.mode])
        || change.phase !== undefined && change.phase !== actual?.phase
        || JSON.stringify(changeValue(change.value)) !== JSON.stringify(changeValue(actual?.value)))
        throw new Error(`Native projection changed ${path}/changes/${index}.`);
    }
  }
  if (before.system?.armor) {
    for (const key of ['value', 'dex', 'magicalBonus']) {
      const expected = before.system.armor[key];
      if (expected != null && String(expected) !== String(after.system?.armor?.[key]))
        throw new Error(`Native projection changed ${path}/armor/${key}.`);
    }
  }
  if (before.system?.rarity !== undefined && before.system.rarity !== (after.system?.rarity ?? after.system?.rarities?.join(', ')))
    throw new Error(`Native projection changed ${path}/rarity.`);
  assertSourceFields(before.system?.rarities, after.system?.rarities, `${path}/rarities`);
  assertSourceFields(before.system?.advancement, after.system?.advancement, `${path}/advancement`);
  for (const key of ['source', 'flags']) {
    const source = key === 'source' ? before.system?.source : before.flags;
    const projected = key === 'source' ? after.system?.source : after.flags;
    assertSourceFields(source, projected, `${path}/${key}`);
  }
  for (const collection of ['items', 'effects']) {
    const actual = after?.[collection] ?? [];
    if ((before[collection] ?? []).length !== actual.length) throw new Error(`Native projection changed ${path}/${collection} members.`);
    for (const member of before[collection] ?? []) {
      const projected = actual.find((entry: any) => entry._id === member._id);
      if (!projected) throw new Error(`Native projection lost ${path}/${collection}/${member._id}.`);
      assertMembersPreserved(member, projected, `${path}/${collection}/${member._id}`);
    }
  }
  for (const [id, activity] of Object.entries(before.system?.activities ?? {}) as [string, any][]) {
    const projected = after.system?.activities?.[id];
    if (!projected || activity._id !== projected._id || activity.type !== projected.type)
      throw new Error(`Native projection lost ${path}/activities/${id}.`);
    assertFiniteUses(activity.uses, projected.uses, `${path}/activities/${id}/uses`);
    for (const field of ['attack', 'save', 'damage', 'target', 'duration', 'activation', 'description', 'flags'])
      assertSourceFields(activity[field], projected[field], `${path}/activities/${id}/${field}`);
    if(activity.range){
      const {long,reach,...range}=activity.range;
      assertSourceFields(range,projected.range,`${path}/activities/${id}/range`);
      if(long!=null&&String(long)!==String(projected.range?.long??after.system?.range?.long))
        throw new Error(`Native projection changed ${path}/activities/${id}/range/long.`);
      const actualReach=projected.range?.reach??(projected.range?.override?projected.range?.value:after.system?.range?.reach??after.system?.range?.value);
      if(reach!=null&&String(reach)!==String(actualReach))throw new Error(`Native projection changed ${path}/activities/${id}/range/reach.`);
    }
    assertSourceFields(activity.consumption?.targets ?? [], projected.consumption?.targets ?? [], `${path}/activities/${id}/consumption`);
    const originalEffects = (activity.effects ?? []).map((entry: any) => entry._id).sort();
    const projectedEffects = (projected.effects ?? []).map((entry: any) => entry._id).sort();
    if (JSON.stringify(originalEffects) !== JSON.stringify(projectedEffects)) throw new Error(`Native projection changed ${path}/activities/${id}/effects.`);
  }
}

function changeValue(value: any): any {
  if (typeof value !== 'string' || value === '') return value;
  try { return JSON.parse(value); } catch { return value; }
}

/** Core 14.369 keeps explicit native fields and selects the first numeric legacy
 * seconds/turns/rounds value. Legacy start data belongs to the separate start field. */
function assertEffectDuration(before:any,after:any,path:string):void{
  const duration=before.duration;
  if(!duration)return;
  const unit=['seconds','turns','rounds'].find(key=>Object.hasOwn(duration,key)&&typeof duration[key]==='number');
  const value=Object.hasOwn(duration,'value')?duration.value:unit?duration[unit]:null;
  const expected={value,units:duration.units??unit??'seconds',
    expiry:Object.hasOwn(duration,'expiry')?duration.expiry:typeof value==='number'?'turnStart':null,
    expired:duration.expired??false};
  assertSourceFields(expected,after.duration,`${path}/duration`);
  if(Object.hasOwn(before,'start'))assertSourceFields(before.start,after.start,`${path}/start`);
  else if(Object.hasOwn(duration,'startTime')){
    if(typeof duration.startTime!=='number')assertSourceFields(null,after.start,`${path}/start`);
    else assertSourceFields({combat:duration.combat,round:duration.startRound,time:duration.startTime,turn:duration.startTurn},after.start,`${path}/start`);
  }
}

/** Schema-derived 6.0.6 migrations: AC override/formulas and nested speed FormulaFields. */
function assertActorAttributes(before: any, after: any): void {
  for (const [key, ability] of Object.entries(before.system?.abilities ?? {}) as [string, any][]) {
    const { bonuses, ...persisted } = ability;
    const actual = after.system?.abilities?.[key];
    assertSourceFields(persisted, actual, `Actor/abilities/${key}`);
    for (const roll of ['check', 'save']) {
      const bonus = ability[roll]?.roll?.bonus ?? bonuses?.[roll];
      if (bonus && String(bonus) !== String(actual?.[roll]?.roll?.bonus))
        throw new Error(`Native projection changed Actor/abilities/${key}/${roll}/bonus.`);
    }
  }
  assertSourceFields(before.system?.attributes?.hp, after.system?.attributes?.hp, 'Actor/hp');
  if (before.system?.attributes?.init?.roll?.bonus !== undefined)
    assertSourceFields(before.system.attributes.init, after.system?.attributes?.init, 'Actor/attributes/init');
  if (before.system?.attributes?.senses?.ranges)
    assertSourceFields(before.system.attributes.senses, after.system?.attributes?.senses, 'Actor/attributes/senses');
  assertSourceFields(before.system?.attributes?.spell, after.system?.attributes?.spell, 'Actor/attributes/spell');
  for (const [key, skill] of Object.entries<any>(before.system?.skills ?? {})) {
    if (skill.roll?.bonus !== undefined) assertSourceFields(skill, after.system?.skills?.[key], `Actor/skills/${key}`);
  }
  for (const [key, resource] of Object.entries<any>(before.system?.resources ?? {})) {
    if (resource.spent !== undefined) assertSourceFields(resource, after.system?.resources?.[key], `Actor/resources/${key}`);
  }
  assertSourceFields(before.system?.details?.cr, after.system?.details?.cr, 'Actor/cr');
  const ac = before.system?.attributes?.ac;
  const actualAc = after.system?.attributes?.ac;
  assertSourceFields(ac?.override, actualAc?.override, 'Actor/AC override');
  assertSourceFields(ac?.calcs, actualAc?.calcs, 'Actor/AC calculations');
  assertSourceFields(ac?.formulas, actualAc?.formulas, 'Actor/AC formulas');
  if (ac?.calcs) assertSourceFields(ac.flat, actualAc?.flat, 'Actor/AC natural base');
  if (ac?.calc === 'flat' && ac.flat !== actualAc?.override) throw new Error('Native projection changed Actor/AC override.');
  if (ac?.calc === 'custom' && !actualAc?.formulas?.some((entry: any) => entry.formula === ac.formula))
    throw new Error('Native projection changed Actor/AC formula.');
  const movement = before.system?.attributes?.movement;
  const actualMovement = after.system?.attributes?.movement;
  for (const [key, speed] of Object.entries(movement?.speeds ?? movement ?? {})) {
    if (['units', 'hover', 'ignoredDifficultTerrain'].includes(key) || speed == null) continue;
    if (String(speed) !== String(actualMovement?.speeds?.[key] ?? actualMovement?.[key]))
      throw new Error(`Native projection changed Actor/movement/${key}.`);
  }
}

function assertFiniteUses(before: any, after: any, path: string): void {
  if (!before || before.max === '' || before.max === undefined || before.max === null) return;
  if (!after || String(before.max) !== String(after.max) || before.spent !== after.spent
    ) throw new Error(`Native projection changed finite ${path}.`);
  assertSourceFields(before.recovery, after.recovery, `${path}/recovery`);
}

function assertSourceFields(before: any, after: any, path: string): void {
  if (before === undefined) return;
  if (/\/save\/ability$/u.test(path) && typeof before === 'string' && Array.isArray(after)
    && JSON.stringify(after) === JSON.stringify(before ? [before] : [])) return;
  if (Array.isArray(before)) {
    if (!Array.isArray(after) || before.length !== after.length) throw new Error(`Native projection changed ${path}.`);
    before.forEach((entry, index) => assertSourceFields(entry, after[index], `${path}/${index}`));
  } else if (before && typeof before === 'object') {
    for (const [key, value] of Object.entries(before)) assertSourceFields(value, after?.[key], `${path}/${key}`);
  } else if (before !== after && !(typeof before === 'number' && typeof after === 'string'
    && /^-?\d+(?:\.\d+)?$/u.test(after) && Number(after) === before
    && (/\/(value|formula)$/u.test(path)||/\/target\/(?:template\/(?:count|size|width|height)|affects\/count)$/u.test(path)))) {
    throw new Error(`Native projection changed ${path}.`);
  }
}
