import {sha256} from '@fvtt-json-generator/contracts/hash';
import {findForbiddenTargetWorldIdentifiers} from '@fvtt-json-generator/spell-manifest-contracts';

const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);

/** Inline a model-authored per-parent catalogue only when every definition is
 * used exactly once by an explicit ID in that same parent's usage groups.
 * No source text, spell names or mechanical values participate in the join. */
export function inlineDeclaredSpellCatalogs(value:unknown):void{
  if(!object(value)||!object(value.creature)||!Array.isArray(value.creature.spellcasting))return;
  const plans:Array<{group:Record<string,any>;usages:Array<{usage:Record<string,any>;refs:Record<string,any>[]}>}>=[];
  for(const group of value.creature.spellcasting){
    if(!object(group)||!Object.hasOwn(group,'spellRefs'))continue;
    if(!Array.isArray(group.spellRefs)||!group.spellRefs.length||!Array.isArray(group.usageGroups)||!group.usageGroups.length)return;
    const definitions=new Map<string,Record<string,any>>(),used=new Set<string>(),usages=[];
    for(const ref of group.spellRefs){
      if(!object(ref)||typeof ref.refId!=='string'||!ref.refId.trim()||definitions.has(ref.refId))return;
      definitions.set(ref.refId,ref);
    }
    for(const usage of group.usageGroups){
      if(!object(usage)||!Array.isArray(usage.spellRefs)||!usage.spellRefs.length)return;
      const refs:Record<string,any>[]=[];
      for(const id of usage.spellRefs){
        if(typeof id!=='string'||!definitions.has(id)||used.has(id))return;
        used.add(id);refs.push(structuredClone(definitions.get(id)!));
      }
      usages.push({usage,refs});
    }
    if(used.size!==definitions.size)return;
    plans.push({group,usages});
  }
  for(const {group,usages}of plans){
    for(const {usage,refs}of usages)usage.spellRefs=refs;
    delete group.spellRefs;
    // Missing additional overrides are an empty collection, not a component waiver.
    if(group.componentWaivers===undefined)group.componentWaivers=[];
  }
  if(plans.length)namespaceDuplicateSpellRefIds(value);
}

/** Provider keys are scoped by group in reuseOf. Preserve unambiguous links
 * while satisfying the portable manifest's globally unique key contract.
 * Missing/duplicate groups and within-group duplicate refs remain errors. */
export function namespaceDuplicateSpellRefIds(value:unknown):void{
  if(!object(value)||!object(value.creature)||!Array.isArray(value.creature.spellcasting))return;
  const groups=value.creature.spellcasting,groupIds=new Set<string>(),counts=new Map<string,number>();
  const entries:Array<{groupId:string;ref:Record<string,any>;old:string}>=[];
  for(const group of groups){
    if(!object(group)||typeof group.groupId!=='string'||!group.groupId.trim()||groupIds.has(group.groupId)||!Array.isArray(group.usageGroups))return;
    groupIds.add(group.groupId);const local=new Set<string>();
    for(const usage of group.usageGroups){
      if(!object(usage)||!Array.isArray(usage.spellRefs))return;
      for(const ref of usage.spellRefs){
        if(!object(ref)||typeof ref.refId!=='string'||!ref.refId.trim()||local.has(ref.refId))return;
        local.add(ref.refId);counts.set(ref.refId,(counts.get(ref.refId)??0)+1);
        entries.push({groupId:group.groupId,ref,old:ref.refId});
      }
    }
  }
  if([...groupIds,...counts.keys()].some(id=>findForbiddenTargetWorldIdentifiers(id).length))return;
  const reserved=new Set([...groupIds,...counts.keys()]),renamed=new Map<string,string>();
  const key=(groupId:string,refId:string)=>JSON.stringify([groupId,refId]);
  for(const entry of entries){
    if(counts.get(entry.old)===1&&!groupIds.has(entry.old))continue;
    let salt=0,next:string;
    do{next='ref-'+sha256(JSON.stringify([entry.groupId,entry.old,salt++]));}while(reserved.has(next));
    reserved.add(next);renamed.set(key(entry.groupId,entry.old),next);entry.ref.refId=next;
  }
  for(const {ref} of entries){
    const reuse=ref.reuseOf;if(!object(reuse)||typeof reuse.groupId!=='string'||typeof reuse.refId!=='string')continue;
    const next=renamed.get(key(reuse.groupId,reuse.refId));if(next)reuse.refId=next;
  }
}
