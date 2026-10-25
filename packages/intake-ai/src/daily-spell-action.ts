/** Source-derived closed grammar for a daily parent ability which casts one
 * named spell or chooses between named spells. No mechanic is inferred from
 * the ability name. Unknown qualifiers leave the existing GM boundary intact.
 * All returned coordinates address the unmodified complete source. */
import {sourceActorNameMatches} from '@fvtt-json-generator/models/source-operations';

export function sourceDailySpellAction(source:string){
  const match=/^(?<title>[^\r\n]+?)\s*\((?<count>[1-9]\d*)\s*\/\s*Day\)\.\s*(?<caster>[^.\r\n]+?)\s+casts\s+(?<names>[A-Za-z][A-Za-z, '’\-\r\n]+?)(?:,?\s+(?<trigger>in response to the spell['’]s trigger))?,?\s+using\s+the\s+same\s+spellcasting\s+ability\s+as\s+(?<parent>[A-Za-z][A-Za-z '’\-]+)\.\s*$/iu.exec(source);
  if(!match?.groups)return;
  if(/\b(?:if|when|unless|while|only|after|before|not|cannot)\b|[,，]/iu.test(match.groups.caster!))return;
  const count=Number(match.groups.count);if(!Number.isSafeInteger(count))return;
  const raw=match.groups.names!,separators=[...raw.matchAll(/,\s*(?:or\b\s*)?|\bor\b\s*/giu)];
  // A comma list needs one final OR. Do not reinterpret AND, comma-only
  // collections, empty entries, or a second choice introducer as one grant.
  if(separators.length&&(!/\bor\b/iu.test(separators.at(-1)![0])||separators.slice(0,-1).some(part=>/\bor\b/iu.test(part[0]))))return;
  const parts=raw.split(/,\s*(?:or\b\s*)?|\bor\b\s*/iu);
  let cursor=source.indexOf(raw,match[0].indexOf(' casts '));
  if(cursor<0)return;
  const spells=parts.map(part=>{
    const start=source.indexOf(part,cursor);cursor=start+part.length;
    const trimmed=part.trim(),wrapper=/^(?:the\s+)?(?<name>[A-Za-z][A-Za-z '’\-\r\n]*?)\s+spell$/iu.exec(trimmed);
    const name=(wrapper?.groups?.name??trimmed).trim();
    if(!name||/\b(?:if|when|unless|only|spells|the|a|an)\b/iu.test(name)||!wrapper&&/\b(?:and|spell)\b/iu.test(name))return;
    const local=part.indexOf(name);return{name:name.replace(/\s+/gu,' '),start:start+local,end:start+local+name.length};
  });
  if(spells.some(spell=>!spell))return;
  const bound=spells as Array<{name:string;start:number;end:number}>;
  if(new Set(bound.map(spell=>spell.name.toLowerCase())).size!==bound.length)return;
  const trigger=match.groups.trigger?{text:match.groups.trigger,start:source.indexOf(match.groups.trigger),end:source.indexOf(match.groups.trigger)+match.groups.trigger.length}:undefined;
  return{count,caster:match.groups.caster!,parent:match.groups.parent!.replace(/\s+/gu,' ').trim(),spells:bound,...(trigger?{trigger}:{})};
}

/** A shortened prefix needs both the printed Actor identity and the unique
 * source parent's same casting subject. Matching two external subjects is
 * never evidence that either of them is this Actor. */
export function sourceDailySpellActionOwnerMatches(action:NonNullable<ReturnType<typeof sourceDailySpellAction>>,parentSource:string,actorNames:readonly string[],sourceContext?:string):boolean{
  const parent=/^[^\r\n.]+\.\s*(?<caster>[A-Za-z][A-Za-z '’\-\r\n]*?)\s+casts\s+(?:one\s+of\s+)?the\s+following\s+spells\b/iu.exec(parentSource);
  if(parent?.groups?.caster&&sourceActorNameMatches(action.caster,actorNames)&&sourceActorNameMatches(parent.groups.caster,actorNames))return true;
  const normalize=(value:string)=>value.normalize('NFKC').replace(/[*_#`]/gu,'').replace(/\s+/gu,' ').trim().toLowerCase().replace(/^the\s+/u,'');
  const subject=normalize(action.caster);
  if(!sourceContext||!parent?.groups?.caster||normalize(parent.groups.caster)!==subject
    ||/[’']s\b|\b(?:target|ally|allies|enemy|familiar|summoned|another|other|possessed)\b/iu.test(subject))return false;
  const header=normalize(sourceContext.split(/\r?\n/u)[0]??'');
  const identities=actorNames.map(normalize).filter(name=>name===header);
  if(!identities.some(name=>name.startsWith(subject+' ')))return false;
  if(sourceContext.indexOf(parentSource)<0||sourceContext.indexOf(parentSource)!==sourceContext.lastIndexOf(parentSource))return false;
  // A same-named creature introduced elsewhere makes this short prefix
  // ambiguous (Dragon Summoner / "summons a dragon"). Do not assign it to
  // the Actor merely because both spell actions refer to that creature.
  const escaped=subject.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  const external=new RegExp(`(?:\\b(?:a|an|another|other|one|each|any|two|three)\\s+(?:[\\p{L}\\-]+\\s+){0,2}|[’']s\\s+)${escaped}\\b`,'iu');
  return !external.test(normalize(sourceContext));
}
