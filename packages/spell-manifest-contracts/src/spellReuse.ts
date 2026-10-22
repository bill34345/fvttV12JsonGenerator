import type {PortableSpellManifest} from './types';

/** A source reuse is one logical spell with two Cast carriers. Every carrier
 * must bind to the same selected document. Values are opaque to this contract;
 * the runtime owner separately validates its destination identifiers. */
export function conflictingSpellReuseBindings(manifest:PortableSpellManifest,bindings:ReadonlyArray<{groupId:string;refId:string;value:string}>):Array<{groupId:string;refId:string}>{
 const key=(groupId:string,refId:string)=>JSON.stringify([groupId,refId]);
 const values=new Map(bindings.map(binding=>[key(binding.groupId,binding.refId),binding.value]));
 return manifest.spellcastingGroups.flatMap(group=>group.spellRefs.flatMap(ref=>{
  if(!ref.reuseOf)return[];
  const own=values.get(key(group.groupId,ref.refId)),target=values.get(key(ref.reuseOf.groupId,ref.reuseOf.refId));
  return own&&target&&own===target?[]:[{groupId:group.groupId,refId:ref.refId}];
 }));
}
