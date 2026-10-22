import type {CanonicalSpellcastingGroup,CanonicalSpellRef} from './types';

/** Source-derived whole-ability grammar. An optional/conditional replacement
 * inside Multiattack is not this operation. Offsets address unmodified text. */
export function sourceReferencedSpellAction(source:string){
 const match=/^[^\r\n.]+\.\s*(?<caster>[A-Za-z][A-Za-z '’\-]*?)\s+uses\s+(?<parent>[A-Za-z][A-Za-z '’\-\r\n]+?)\s+to\s+cast\s+(?<spell>[A-Za-z][A-Za-z '’\-\r\n]+?)\s*(?<annotation>\(\s*level\s+(?<level>[1-9])\s+version\s*\))?\.\s*$/iu.exec(source);
 if(!match?.groups)return;
 const {caster,parent,spell,annotation,level}=match.groups;
 if(/\b(?:a|an|the|one|any|selected|chosen|following|spells?)\b/iu.test(spell!))return;
 const annotationStart=annotation?source.lastIndexOf(annotation):undefined,rawStart=source.lastIndexOf(spell!,annotationStart??source.length);
 const leading=spell!.length-spell!.trimStart().length;
 const end=rawStart+spell!.trimEnd().length;
 return{caster:caster!.trim(),parent:normalizedSourceSpellName(parent!),name:spell!.trim().replace(/\s+/gu,' '),...(level===undefined?{}:{level:Number(level)}),
  start:rawStart+leading,end,...(annotationStart===undefined?{}:{annotationStart}),annotationEnd:annotationStart===undefined?end:annotationStart+annotation!.length};
}
export const normalizedSourceSpellName=(name:string)=>name.replace(/[*_]/gu,'').replace(/\s+/gu,' ').trim().toLowerCase();

/** Only an existing independent at-will grant may be reused here. Daily pools,
 * slots and extra target/timing restrictions need a separate proven contract. */
export function referencedAtWillSpell(parent:CanonicalSpellcastingGroup,reference:NonNullable<ReturnType<typeof sourceReferencedSpellAction>>):CanonicalSpellRef|undefined{
 const matches=parent.usageGroups.flatMap(usage=>usage.usage==='at-will'?usage.spellRefs:[])
  .filter(ref=>normalizedSourceSpellName(ref.originalName)===normalizedSourceSpellName(reference.name));
 if(!matches.length&&(parent.usageGroups.some(usage=>usage.spellRefs.some(ref=>normalizedSourceSpellName(ref.originalName)===normalizedSourceSpellName(reference.name)))
   ||parent.manualGrants?.some(grant=>normalizedSourceSpellName(grant.quote).includes(normalizedSourceSpellName(reference.name)))))return;
 if(matches.length!==1)throw Error('UNPROVEN_REFERENCED_SPELL_GRANT');
 const spell=matches[0]!;
 for(const restriction of spell.restrictions){
  const text=restriction.text.normalize('NFKC').replace(/\s+/gu,' ').trim();
  const level=/^\(?\s*level\s+([1-9])\s+version\s*\)?$/iu.exec(text);
  if(level){if(reference.level!==undefined&&Number(level[1])!==reference.level)throw Error('CONFLICTING_REFERENCED_SPELL_LEVEL');}
  else if(!(restriction.kind==='casting'&&/^(?:without|requires? no|requiring no)\s+(?:any\s+)?spell components?$/iu.test(text)))return;
 }
 return spell;
}
