/** Offline embedded-Document port, adapted from the resolver's existing
 * hydrator/transaction fakes. It does not load Foundry or invoke native Cast.
 * Source spell DTOs come from the pinned 5.3.3 reference cache, read-only.
 */
import { RESOLVER_MODULE_ID,sha256 } from '../../src/core/spell-resolution';
import { generatedResolverDocumentId } from '../../foundry-modules/monster-spell-resolver/src/cast-activity';

const clone = <T>(value:T):T => structuredClone(value);

export class OfflineHookBus {
  private nextId=1;
  private readonly callbacks=new Map<string,Map<number,(...args:any[])=>void>>();
  on(name:string,callback:(...args:any[])=>void){
    const id=this.nextId++,entries=this.callbacks.get(name)??new Map();
    entries.set(id,callback);this.callbacks.set(name,entries);return id;
  }
  off(name:string,id:unknown){this.callbacks.get(name)?.delete(id as number);}
  emit(name:string,...args:any[]){for(const callback of this.callbacks.get(name)?.values()??[])callback(...args);}
}

export class FinalArtifactResolverActor {
  readonly id='FinalActor000001';
  readonly type='npc';
  readonly documentName='Actor';
  readonly calls:Array<{method:string;ids:string[]}>=[];
  readonly hooks=new OfflineHookBus();
  flags:Record<string,any>;
  system:Record<string,any>;
  items:any[];
  sourcedItems=new Map<string,any[]>();
  get uuid(){return `Actor.${this.id}`;}

  constructor(source:Record<string,any>,private readonly sourceSpells:ReadonlyMap<string,Record<string,any>>){
    this.flags=clone(source.flags);this.system=clone(source.system);
    // Portable Actor Items intentionally have no target-world Document IDs.
    // Actor.create normally assigns them; this port provides deterministic
    // target IDs without modifying the protected generated artifact.
    const manifestId=source.flags?.[RESOLVER_MODULE_ID]?.spellManifest?.manifestId;
    this.items=source.items.map((item:Record<string,any>,index:number)=>this.prepareItem({...item,
      _id:item._id??sha256(JSON.stringify(['offline-final-item',manifestId,index])).slice(0,16)}));
    this.refreshSourcedItems();
  }

  async updateEmbeddedDocuments(type:string,updates:Record<string,any>[]){
    if(type!=='Item')throw Error('Offline port supports only embedded Item updates.');
    this.calls.push({method:'updateEmbeddedDocuments',ids:updates.map(update=>update._id)});
    for(const update of updates){
      const item=this.items.find(entry=>entry.id===update._id);
      if(!item)throw Error(`Missing offline embedded Item ${update._id}`);
      for(const[path,value]of Object.entries(update)){
        if(path==='_id')continue;
        if(path.startsWith('system.activities.')&&item.type==='feat'){
          const [id,...keys]=path.slice('system.activities.'.length).split('.');
          if(keys.length){setPath(item.system.activities.get(id),keys,value);continue;}
          const activity=this.prepareActivity(item,value);
          item.system.activities.set(id,activity);
          if(activity.type==='cast'&&!activity.cachedSpell){
            const cache=this.prepareItem(await activity.getCachedSpellData());
            this.items.push(cache);this.refreshSourcedItems();
            this.hooks.emit('createItem',cache,{},'OfflineUser00001');
          }
        }else if(path.includes('.'))setPath(item,path.split('.'),value);
        else item[path]=clone(value);
      }
      this.refreshSourcedItems();
    }
    return updates.map(update=>this.items.find(item=>item.id===update._id));
  }

  async createEmbeddedDocuments(type:string,sources:Record<string,any>[],options:Record<string,any>={}){
    if(type!=='Item'||options.keepId!==true)throw Error('Offline resolver creation must retain deterministic Item IDs.');
    this.calls.push({method:'createEmbeddedDocuments',ids:sources.map(source=>source._id)});
    const created=sources.map(source=>this.prepareItem(source));
    for(const item of created){
      if(this.items.some(current=>current.id===item.id))throw Error('Offline embedded Item collision.');
      this.items.push(item);this.refreshSourcedItems();
      this.hooks.emit('createItem',item,{},'OfflineUser00001');
    }
    return created;
  }

  async deleteEmbeddedDocuments(type:string,ids:string[]){
    if(type!=='Item')throw Error('Offline port supports only embedded Item deletion.');
    this.calls.push({method:'deleteEmbeddedDocuments',ids:[...ids]});
    this.items=this.items.filter(item=>!ids.includes(item.id));this.refreshSourcedItems();return[];
  }

  async update(change:Record<string,any>){
    this.calls.push({method:'update',ids:[this.id]});
    for(const[path,value]of Object.entries(change))setPath(this,path.split('.'),value);
    return this;
  }

  source(){return clone({flags:this.flags,system:this.system,items:this.items.map(item=>item.toObject())});}
  managedActivities(){return this.items.flatMap(item=>[...(item.system.activities instanceof Map?item.system.activities.values():[])])
    .filter(activity=>activity.flags?.[RESOLVER_MODULE_ID]?.managed===true);}
  managedSpells(){return this.items.filter(item=>item.type==='spell'&&item.flags?.[RESOLVER_MODULE_ID]?.managed===true);}

  private prepareItem(source:Record<string,any>):any{
    const item:any={...clone(source),id:source._id,parent:this,actor:this};
    item.system??={};item.flags??={};
    if(item.type==='feat'){
      const activities=item.system.activities??{};
      item.system.activities=new Map(Object.entries(activities).map(([id,value])=>[id,this.prepareActivity(item,value)]));
      item.system.parent=item;
      item.deleteActivity=async(id:string)=>{
        const activity=item.system.activities.get(id);
        if(this.items.some(cache=>cache.flags?.dnd5e?.cachedFor===activity?.relativeUUID))throw Error('Delete cache before Activity.');
        item.system.activities.delete(id);return item;
      };
    }
    Object.defineProperty(item,'toObject',{value:()=>documentSource(item)});
    Object.defineProperty(item,'uuid',{get:()=>`${this.uuid}.Item.${item.id}`});
    return item;
  }

  private prepareActivity(feature:any,source:any):any{
    const actor=this,activity:any={...clone(source),id:source._id,parent:feature.system,
      relativeUUID:`.Item.${feature.id}.Activity.${source._id}`};
    if(activity.type==='cast')activity.getCachedSpellData=async()=>{
      const original=actor.sourceSpells.get(activity.spell.uuid);
      if(!original)throw Error('Selected source Spell is absent from the read-only pinned DTO index.');
      const cache=clone(original);
      cache._id=generatedResolverDocumentId(activity.flags[RESOLVER_MODULE_ID],'spell');
      cache.effects=[...(cache.effects??[]),{_id:'dnd5espellchang',type:'enchantment',origin:activity.uuid,changes:[]}];
      cache.flags={...(cache.flags??{}),dnd5e:{...(cache.flags?.dnd5e??{}),cachedFor:activity.relativeUUID}};
      cache.system.sourceItem=`${feature.type}:${feature.system.identifier}`;
      cache._stats={...(cache._stats??{}),compendiumSource:activity.spell.uuid};
      return cache;
    };
    Object.defineProperties(activity,{
      item:{get:()=>feature},actor:{get:()=>actor},uuid:{get:()=>`${feature.uuid}.Activity.${activity.id}`},
      cachedSpell:{get:()=>actor.items.find(item=>item.flags?.dnd5e?.cachedFor===activity.relativeUUID)},
      constructor:{value:{ENCHANTMENT_ID:'dnd5espellchang'}},
      toObject:{value:()=>documentSource(activity)},
    });
    return activity;
  }

  private refreshSourcedItems(){
    const result=new Map<string,any[]>();
    for(const item of this.items){const uuid=item._stats?.compendiumSource;if(uuid)result.set(uuid,[...(result.get(uuid)??[]),item]);}
    this.sourcedItems=result;
  }
}

function setPath(target:any,keys:string[],value:unknown){
  for(const key of keys.slice(0,-1)){target[key]??={};target=target[key];}
  target[keys.at(-1)!]=clone(value);
}

function documentSource(document:any):Record<string,any>{
  const result:Record<string,any>={};
  for(const[key,value]of Object.entries(document)){
    if(['id','parent','actor','item','relativeUUID','cachedSpell'].includes(key)||typeof value==='function')continue;
    if(key==='system'&&document.type==='feat'){
      const system={...(value as Record<string,any>)};delete system.parent;
      system.activities=Object.fromEntries([...system.activities.entries()].map(([id,activity]:[string,any])=>[id,documentSource(activity)]));
      result.system=clone(system);
    }else result[key]=clone(value);
  }
  return result;
}
