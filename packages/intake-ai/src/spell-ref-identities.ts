import {sha256} from '@fvtt-json-generator/contracts/hash';
import {findForbiddenTargetWorldIdentifiers} from '@fvtt-json-generator/spell-manifest-contracts';

const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
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
