import type {NativeFailureStatus,SourceOperation,SourceOperationAbility} from './sourceOperationTypes';
import {sourceOperationStructureErrors} from './sourceOperationStructure';
export {sourceOperationStructureErrors} from './sourceOperationStructure';
import {nativeAreaShape} from './sourceNativeArea';
export {nativeAreaShape} from './sourceNativeArea';
import {sourceHealingOperations,sourceHealingOperationErrors} from './sourceHealingOperations';
export {sourceHealingOperations} from './sourceHealingOperations';
export type {SourceOperation,SourceOperationAbility} from './sourceOperationTypes';
export {isSourceCandidateReview,isSourceCandidateCounters,candidateSourceOperationShapeErrors} from './sourceCandidate';
export type {SourceCandidateReview,SourceCandidateCounter} from './sourceOperationTypes';
import {sourceFailedSaveStatuses,sourceGmTriggeredSave} from './sourceRuleFacts';
import type {CanonicalFeature} from './canonicalMonster';
import {sourceOperationClauses,sourceResultScopes,SOURCE_NEGATION_TOKEN,SOURCE_SAVE_LABEL} from './sourceOperationScopes';
export {sourceOperationClauses} from './sourceOperationScopes';
import {deriveSourceAttackDamageModes} from './sourceAttackModes';
import {displayNameIdentityCandidates} from './displayName';
import {fixedDamageUpgrade,fixedDamageUpgradeErrors} from './sourceDamageUpgrade';
import {isNeutralSourceAttack,sourceNeutralAttackKind,sourceBloodiedHalfDamage,sourceDamageAdjustmentMatches} from './sourceAttackAdjustment';
export {isNeutralSourceAttack,sourceNeutralAttackKind,sourceBloodiedHalfDamage,sourceDamageAdjustmentMatches} from './sourceAttackAdjustment';

export function sourceDamageUpgradeOperations(source:string,contexts:readonly string[]):SourceOperation[]|undefined{
  return fixedDamageUpgrade(source,contexts,(base,ops)=>sourceOperationErrors(base,ops).length===0);
}
export function sourceDamageUpgradeBaseOperations(source:string,contexts:readonly string[]):SourceOperation[]|undefined{
  return fixedDamageUpgrade(source,contexts,(base,ops)=>sourceOperationErrors(base,ops).length===0,false);
}

const ABILITIES: Record<SourceOperationAbility, string> = {
  str: 'strength|str|力量', dex: 'dexterity|dex|敏捷', con: 'constitution|con|体质',
  int: 'intelligence|int|智力', wis: 'wisdom|wis|感知', cha: 'charisma|cha|魅力',
};
const DAMAGE: Record<string, string> = {
  acid:'acid|强酸|酸蚀', bludgeoning:'bludgeoning|钝击', cold:'cold|冷冻|寒冷', fire:'fire|火焰',
  force:'force|力场', lightning:'lightning|闪电', necrotic:'necrotic|黯蚀|死灵|暗蚀', piercing:'piercing|穿刺',
  poison:'poison|毒素', psychic:'psychic|心灵', radiant:'radiant|光耀|辐射', slashing:'slashing|挥砍', thunder:'thunder|雷鸣',
};
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: unknown, allowed: string[]) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const text = (value: string) => value.normalize('NFKC').replace(/[*_]/gu,'').replace(/[−–]/gu,'-').replace(/\s+/gu,' ').trim();
const formula = (value: string) => text(value).replace(/\s+/gu,'').toLowerCase();
const DAMAGE_FINAL_OR='(?:\\s*,\\s*|\\s+)or\\s+';
function sourceDamageTypesPattern(types:readonly string[]):string{
  if(!Array.isArray(types)||!types.length||types.some(type=>typeof type!=='string'||!Object.hasOwn(DAMAGE,type)))return'(?!)';
  const labels=types.map(type=>`(?:${DAMAGE[type]})`),or=labels.join('\\s*(?:or|或者|或)\\s*');
  // A comma list is a choice only with its explicit final OR. No AND or bare
  // comma list can authorize one roll with several selectable damage types.
  return labels.length<3?or:`(?:${or}|${labels.slice(0,-1).join('\\s*,\\s*')}${DAMAGE_FINAL_OR}${labels.at(-1)})`;
}
/** A shortened English source name retains the head noun, never an arbitrary
 * prefix (dragon is not Dragon Summoner). Pronouns need caller-owned context. */
export function sourceActorNameMatches(reference:string,actorName?:string|readonly string[]):boolean{
  if(!actorName)return false;
  const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/^the\s+/u,'').replace(/\s+/gu,' ').trim();
  const words=(value:string)=>value.match(/[\p{L}\p{N}'’\-]+/gu)??[];
  const value=normalize(reference),target=words(value);if(!target.length)return false;
  return (typeof actorName==='string'?[actorName]:actorName).flatMap(displayNameIdentityCandidates).some(name=>{
    const full=normalize(name);if(value===full)return true;
    const core=full.split(/[（(]/u)[0]!.trim();
    const head=words(core.split(/\s+(?:of|in|from|with|at|on|under|over|beyond)\s+/u)[0]??core);
    return target.length<=head.length&&target.every((word,index)=>word===head[head.length-target.length+index]);
  });
}

/** A printed spell header is source metadata, never a caster/DC or a
 * grant to cast that spell. Only its complete first clause owns these facts. */
function sourceSpellHeader(source:string,quote:string){
  const first=sourceOperationClauses(source)[0],lines=source.trim().split(/\r?\n/u);if(!first||lines.length<2||text(first)!==text(quote))return;
  const q=text(first),name=text(lines[0]!);if(!q.startsWith(name+' '))return;
  const header=new RegExp(`^Level \\d+ [\\p{L} ,()’'-]+ Casting Time: [^:]+ Range: ([^:]+) Components: [\\s\\S]+? Duration: `,'u').exec(q.slice(name.length+1));if(!header)return;
  const duration=/^(?:Concentration,\s*)?(?:up to\s+)?(?:Instantaneous|\d+\s+(?:minutes?|hours?|days?|rounds?)|Until dispelled(?: or triggered)?)\s+/iu.exec(q.slice(name.length+1+header[0].length));if(!duration)return;
  return{quote:q,range:header[1]!.trim(),body:q.slice(name.length+1+header[0].length+duration[0].length)};
}

/** Literal shared metadata only. Consumers still prove the current OP's
 * range/centre ownership independently; this does not make a later pulse an
 * initial placement or supply a distance measured from an external target. */
/** The first printed spell body only; metadata remains source-owned. */
export function sourceSpellHeaderBody(source:string):string|undefined{
  const first=sourceOperationClauses(source)[0];return first?sourceSpellHeader(source,text(first))?.body:undefined;
}

export function sourceSpellHeaderRange(source:string,quote:string):number|undefined{
  const header=sourceSpellHeader(source,quote),distance=header&&/^(\d+)\s+(?:feet|ft\.)$/iu.exec(header.range);
  return distance?Number(distance[1]):undefined;
}

export function sourceAttackDamageModes(source:string,ops:readonly SourceOperation[],name=''){
  if(ops.some(isNeutralSourceAttack))return;
  return deriveSourceAttackDamageModes(source,ops,name,(quote,part)=>sourceDamageAtomSpan(quote,part,source)?.start);
}
function sourceDamageAtomSpan(quote:string,part:{formula:string;type:string;types?:string[]},source=quote){
    const matches=sourceDamageAtomSpans(quote,part,source);
    return matches.length===1?matches[0]:undefined;
}
function sourceDamageAtomSpans(quote:string,part:{formula:string;type:string;types?:string[]},source=quote){
    const escaped=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    const roll=formula(part.formula).split('').map(escaped).join('\\s*');
    const types=sourceDamageTypesPattern(part.types??[part.type]);
    const matches=[...quote.matchAll(new RegExp(`(?<![\\p{L}\\d])${roll}\\s*[)）]?\\s*(?:点|的)?\\s*${types}\\s*(?:damage|伤害)`,'giu'))];
    return [...matches.map(match=>({start:match.index!,end:match.index!+match[0].length})),...[...sourceScalingDamageRows(quote),...sourceReferencedDamageAtoms(quote,source)].filter(row=>row.formula===formula(part.formula)&&JSON.stringify(row.types)===JSON.stringify(part.types??[part.type])).map(({start,end})=>({start,end}))];
}
const conditional = /\b(?:if|unless|while|whenever|when|after|before|provided|instead|only when|for (?:every|each)|at the (?:start|end))\b|如果|若|当|每当|之后|之前|除非|仅当|改为|代替/iu;

/** An independent GM roll needs an event, time, result or replacement.
 * Relative clauses and FOR EACH can merely enumerate eligible recipients;
 * modal capacity and static state do not themselves prove a later event. */
function sourceEventQualifier(value:string):boolean{
  if(/\b(?:when|whenever|if)\s+(?:you|it|they|the target|the creature)\s+rolls?\s+(?:an?\s+)?\d+\s+on\s+(?:the|a)\s+d\d+\b/iu.test(value))return true;
  if(/\bafter (?:each|every) (?:hour|minute|round|day) of\s+\p{L}+ing\b|\b(?:each|every) additional (?:minute|hour|round|day) spent\b/iu.test(value))return true;
  if(/\b(?:to|against)\s+(?:(?:a|an|any|the|each|every)\s+)?(?:creatures?|targets?|objects?)\s+(?:it|you|the weapon|this weapon)\s+(?:hits?|strikes?)\b/iu.test(value))return true;
  if(/\binstead\b|\bat the (?:start|end)\b|\b(?:before|after)\b[^,.;。]{0,80}\bturn\b|如果|若|当|每当|之后|之前|除非|仅当|改为|代替/iu.test(value)
    ||/\bby\s+(?:succeeding|failing)\s+on\s+[^.;。]{1,120}\bcheck\b/iu.test(value)
    ||/\bon\s+(?:a|an|each)\s+(?:successful|failed)\s+[^.;。]{0,80}\bcheck\b|\b(?:each|every)\s+(?:failed|successful)\s+(?:[a-z]+\s+){0,3}check\b/iu.test(value))return true;
  const contexts=[...value.matchAll(/\b(?:if|unless|while|whenever|when|after|before|provided|for (?:every|each)|(?:the )?first time|that|whose)\b([^,;。]*)/giu)];
  const events=/\b(?:hits?|attacks?|strikes?|struck|steps?|sees?|hears?|takes?\s+damage|enters?|leaves?|arrives?|comes?|moves?|touch(?:es)?|drinks?|eats?|reads?|casts?|opens?|closes?|expends?|spends?|pays?|attempts?\s+to|tries?\s+to|fails?|succeeds?|falls?|dies|drops?|becomes?|starts?|ends?|attunes?|playing|has\s+just\s+been\s+damaged)\b/giu;
  for(const context of contexts)for(const event of context[1]!.matchAll(events)){
    const before=context[1]!.slice(0,event.index).split(/\b(?:and|but|then)\b/iu).at(-1)!.replace(/\byou can (?:see|hear)\s*$/iu,'');
    if(/\b(?:can(?:not)?|can['’]t|could(?:n['’]t)?|may|might|must|would(?:n['’]t)?|should(?:n['’]t)?|not|never|no|doesn['’]t|didn['’]t|hasn['’]t|haven['’]t)\b/iu.test(before))continue;
    // Attack is also a noun in static capability/target descriptions.
    if(/^(?:attacks?|hits?)$/iu.test(event[0])&&/^\s+(?:rolls?|actions?|bonuses?|points?|dice)\b/iu.test(context[1]!.slice(event.index!+event[0].length)))continue;
    return true;
  }
  return false;
}

/** Keep genuine conditions on a damage result even if they cannot prove an
 * independent first follow-up. Static recipient lists are not conditions. */
function sourceConditionQualifier(value:string):boolean{
  return sourceEventQualifier(value)||/\b(?:if|unless|while|whenever|when|after|before|provided|instead|only when|at the (?:start|end))\b|如果|若|当|每当|之后|之前|除非|仅当|改为|代替/iu.test(value);
}

interface SourceSaveAtom {dc:number;abilities:SourceOperationAbility[];choice:'single'|'target';start:number;end:number;context?:{quote:string;start:number;end:number}}
function sourceSaveAtoms(clause:string):SourceSaveAtom[]{
  // Short ability labels must not consume the start of a consequence verb:
  // "saving throw or contract a disease" contains one Constitution Save.
  const label=Object.values(ABILITIES).flatMap(aliases=>aliases.split('|')).map(alias=>/^[a-z]+$/u.test(alias)?`${alias}(?![a-z])`:alias).join('|');
  const ability=(value:string)=>Object.entries(ABILITIES).find(([,aliases])=>new RegExp(`^(?:${aliases})$`,'iu').test(value))?.[0] as SourceOperationAbility|undefined;
  const result:SourceSaveAtom[]=[];
  const forward=new RegExp(`(?:\\bDC|难度等级)\\s*[:：]?\\s*(\\d+)\\s*(?:的\\s*)?(${label})(?:\\s*(?:${SOURCE_SAVE_LABEL}|豁免(?:检定)?))?(?:\\s*(or|and|或|或者|和|以及|并且)\\s*(${label})(?:\\s*(?:${SOURCE_SAVE_LABEL}|豁免(?:检定)?))?)?`,'giu');
  const reverse=new RegExp(`(${label})(?:\\s*(or|and|或|或者|和|以及|并且)\\s*(${label}))?\\s*(?:${SOURCE_SAVE_LABEL}|豁免(?:检定)?)\\s*[:：]\\s*(?:[（(](?:target['’]s choice|由目标选择|目标选择)[）)]\\s*)?(?:DC|难度等级)\\s*(\\d+)`,'giu');
  for(const m of clause.matchAll(forward))if(new RegExp(`${SOURCE_SAVE_LABEL}|豁免`,'iu').test(m[0])){
    const abilities=[ability(m[2]!)!,...(m[4]?[ability(m[4])!]:[])],or=m[3]&&/^(?:or|或|或者)$/iu.test(m[3]);
    const span={start:m.index!,end:m.index!+m[0].length};
    if(abilities.length>1&&!or)for(const entry of abilities)result.push({dc:Number(m[1]),abilities:[entry],choice:'single',...span});
    else result.push({dc:Number(m[1]),abilities,choice:or?'target':'single',...span});
  }
  for(const m of clause.matchAll(reverse)){
    const abilities=[ability(m[1]!)!,...(m[3]?[ability(m[3])!]:[])],or=m[2]&&/^(?:or|或|或者)$/iu.test(m[2]),span={start:m.index!,end:m.index!+m[0].length};
    if(abilities.length>1&&!or)for(const entry of abilities)result.push({dc:Number(m[4]),abilities:[entry],choice:'single',...span});
    else result.push({dc:Number(m[4]),abilities,choice:or?'target':'single',...span});
  }
  return result;
}

/** An unfixed Save still names a receiver and a result owner. These
 * markers are never used to invent DCs or populate the executable inventory. */
function sourceTargetSaveAtoms(q:string){
  const fixed=sourceSaveAtoms(q);if(fixed.length)return fixed;
  const label=Object.values(ABILITIES).join('|');
  return[...q.matchAll(new RegExp(`\\b(${label})\\s+${SOURCE_SAVE_LABEL}`,'giu'))].map(match=>({dc:undefined,abilities:[Object.entries(ABILITIES).find(([,aliases])=>new RegExp(`^(?:${aliases})$`,'iu').test(match[1]!))![0] as SourceOperationAbility],choice:'single' as const,start:match.index!,end:match.index!+match[0].length}));
}

/** An immediately adjacent DC definition can name only the first period
 * of a generic ability Save. Later scaling stays in the complete GM source. */
function sourceBoundSaveAtoms(source:string,q:string):SourceSaveAtom[]{
  const direct=sourceSaveAtoms(q);if(direct.length)return direct;
  const definition=/^The DC is (\d+) for the first (hour|minute|round|day)\b/iu.exec(q);if(!definition)return[];
  const all=sourceOperationClauses(source).map(text),at=all.indexOf(q),previous=all[at-1];
  if(at<1||all.lastIndexOf(q)!==at||!previous||sourceSaveAtoms(previous).length)return[];
  const abilityLabels=Object.values(ABILITIES).join('|'),matches=[...previous.matchAll(new RegExp(`\\b(${abilityLabels})\\s+${SOURCE_SAVE_LABEL}`,'giu'))];
  if(matches.length!==1||!new RegExp(`at the end of each ${definition[2]}\\b`,'iu').test(previous)||!/\bmust (?:make|succeed on)\b/iu.test(previous))return[];
  const match=matches[0]!,ability=Object.entries(ABILITIES).find(([,aliases])=>new RegExp(`^(?:${aliases})$`,'iu').test(match[1]!))?.[0] as SourceOperationAbility|undefined;
  return ability?[{dc:Number(definition[1]),abilities:[ability],choice:'single',start:0,end:q.length,context:{quote:previous,start:match.index!,end:match.index!+match[0].length}}]:[];
}

function sourceSaveIdentity(q:string,save?:{dc?:unknown;abilities?:unknown;choice?:unknown}):string{
  return JSON.stringify([q,save?.dc,save?.abilities,save?.choice]);
}

/** Equal printed Save sentences can be genuinely distinct source operations.
 * Consume their original positions in order, rather than adding a new field
 * or treating an arbitrary repeated proposal as another source occurrence. */
function sourceSaveClauseIndex(clauses:readonly string[],op:Record<string,any>,occurrences:Map<string,number>):number{
  const q=text(String(op.proof?.save??'')),key=sourceSaveIdentity(q,op.save),ordinal=occurrences.get(key)??0;
  occurrences.set(key,ordinal+1);
  const positions=clauses.flatMap((clause,index)=>text(clause)===q?[index]:[]);
  return positions[ordinal]??positions.at(-1)??-1;
}

function sourceDamageOccurrence(clauses:readonly string[],q:string,part:{formula:string;type:string;types?:string[]},ordinal:number):{clauseIndex:number;local:number}{
  const types=part.types??[part.type],count=Math.max(1,sourceDamageAtoms(q,clauses.join(' ')).filter(atom=>atom.formula===formula(part.formula)&&JSON.stringify(atom.types)===JSON.stringify(types)).length);
  const positions=clauses.flatMap((clause,index)=>text(clause)===q?[index]:[]);
  return{clauseIndex:positions[Math.floor(ordinal/count)]??positions.at(-1)??-1,local:ordinal%count};
}

function sourceSaveFollowsAttack(clauses:readonly string[],at:number,q:string,save:SourceOperation['save']):boolean{
  const atom=sourceSaveAtoms(q).find(atom=>atom.dc===save?.dc&&JSON.stringify(atom.abilities)===JSON.stringify(save?.abilities));
  const candidates=[...clauses.slice(0,Math.max(at,0)).map(text),q.slice(0,atom?.start??0)];
  let attack=false;
  for(const clause of candidates){
    // A named new property closes a previous Attack's ownership. Ordinary
    // Hit/Failure result labels and conditional result prose do not.
    if(/^[\p{Lu}\p{Lt}][\p{L}'’ -]{0,79}[.]$/u.test(clause)&&clause.slice(0,-1).split(/\s+/u).every(word=>/^[\p{Lu}\p{Lt}]/u.test(word)||/^(?:of|the|and|or|with|a|an)$/u.test(word)))attack=false;
    const declaration=/\b(?:melee|ranged)(?:\s+or\s+ranged)?(?:\s+(?:weapon|spell))?\s+attack(?:\s+roll)?\s*[:：]|(?:近战|远程)(?:武器|法术)?攻击\s*[:：]/iu.exec(clause);
    if(declaration&&!new RegExp(`\\b${SOURCE_NEGATION_TOKEN}\\b|\\b(?:not|no)\\b|不能|无法|并非`,'iu').test(clause.slice(0,declaration.index)))attack=true;
  }
  return attack;
}

/** A flattened, complete Lever/Up/Down row still has two source columns.
 * Require the positive selector, sequential row labels and exactly two
 * parallel Attack clauses in that row; prose mentioning levers is no proof. */
function sourceLeverTableChoice(source:string,beforeIndex:number,afterIndex:number):boolean{
  if(beforeIndex<0||afterIndex<=beforeIndex)return false;
  const clauses=sourceOperationClauses(source).map(text),header=/\bLever\s+Up\s+Down\s+(?=1\s)/iu;
  const tableAt=clauses.findLastIndex((clause,index)=>index<=beforeIndex&&header.test(clause));
  if(tableAt<0||!clauses.slice(0,tableAt).some(clause=>/\blevers?\b[^.。]{0,120}\bup\s+or\s+down\b/iu.test(clause)
    &&!new RegExp(`\\b(?:${SOURCE_NEGATION_TOKEN}|no|not)\\b|不能|无法`,'iu').test(clause)))return false;
  let row=0,target=0,cells:Array<{index:number;body:string}>=[];
  for(let index=tableAt;index<clauses.length;index++){
    let body=clauses[index]!;
    if(index===tableAt){const marker=header.exec(body)!;body=body.slice(marker.index+marker[0].length);}
    const number=/^(\d+)\s+/u.exec(body);
    if(number){
      if(target&&row===target)break;
      if(Number(number[1])!==row+1)return false;
      row=Number(number[1]);cells=[];body=body.slice(number[0].length);
    }
    cells.push({index,body});if(index===beforeIndex)target=row;
  }
  if(!target||cells.length!==2||cells[0]!.index!==beforeIndex||cells[1]!.index!==afterIndex)return false;
  const prefix=(body:string)=>/^(.*?)\b(?:melee|ranged)(?:\s+(?:weapon|spell))?\s+attack(?:\s+roll)?\s*[:：]/iu.exec(body)?.[1]?.trim();
  const left=prefix(cells[0]!.body),right=prefix(cells[1]!.body);
  return!!left&&left===right&&!/\b(?:and|then|both|also|together|simultaneously)\b/iu.test(left);
}

/** A paired dash closes a local damage replacement before a common tail.
 * Shared damage is counted once in source, then projected into both exclusive
 * Attack buttons. An open condition or another operation cannot lend a tail. */
function sourceClosedDamageChoice(q:string){
  const atoms=sourceDamageAtoms(q);if(atoms.length<2||sourceSaveAtoms(q).length)return;
  const spans=atoms.map(atom=>sourceDamageAtomSpan(q,{...atom,type:atom.types[0]!}));
  const a=spans[0],b=spans[1];if(!a||!b||a.start>=b.start||!/(?:\bHit|命中)\s*[:：]\s*(?:\d+\s*[(（])?\s*$/iu.test(q.slice(0,a.start)))return;
  const between=q.slice(a.end,b.start),after=q.slice(b.end);
  if(atoms.length===2&&/^\s*[,，]?\s*(?:or|或(?:者)?)\s*(?:\d+\s*[(（])?\s*$/iu.test(between)&&conditional.test(after))return{atoms,spans,common:[],aside:undefined};
  const open=/^\s*—\s*or\s*(?:\d+\s*[(（])?\s*$/iu.exec(between),close=/^([^—]+)—\s*plus\s*(?:\d+\s*[(（])?\s*$/iu.exec(q.slice(b.end,spans[2]?.start));
  if(!open||!close||!conditional.test(close[1]!)||atoms.slice(2).some((_,index)=>!spans[index+2]))return;
  const aside={start:a.end+between.indexOf('—'),end:b.end+close[0].indexOf('—')+1};
  if(sourceConditionQualifier(q.slice(0,aside.start)+' '+q.slice(aside.end)))return;
  for(let index=3;index<spans.length;index++)if(!/^\s*(?:,?\s*(?:and|plus))\s*(?:\d+\s*[(（])?\s*$/iu.test(q.slice(spans[index-1]!.end,spans[index]!.start)))return;
  return{atoms,spans,common:atoms.slice(2),aside};
}

/** Two native Attack buttons may be projections of one explicit OR choice.
 * Require complete sibling evidence and exact atom roles; a duplicate roll,
 * simultaneous attacks or an unrelated OR never proves another mode. */
function sourceSameClauseAttackChoice(op:Record<string,any>,previous:unknown,q:string,source:string):'range'|'damage'|undefined{
  if(!object(previous)||previous.type!=='attack'||op.type!=='attack'||previous.relationship!=='primary'||op.relationship!=='alternative'||!object(previous.attack)||!object(op.attack)||!object(previous.proof)||!object(op.proof))return;
  if(text(String(previous.proof.attack??''))!==q||text(String(op.proof.attack??''))!==q||previous.condition!==source.trim()||op.condition!==source.trim()||previous.targetSpecial!==op.targetSpecial)return;
  const sameDamage=Array.isArray(previous.damage)&&Array.isArray(op.damage)&&previous.damage.length===op.damage.length&&previous.damage.every((part:any,index:number)=>object(part)&&object(op.damage[index])&&['formula','type','relationship','condition'].every(field=>part[field]===op.damage[index][field])&&JSON.stringify(part.types??[part.type])===JSON.stringify(op.damage[index].types??[op.damage[index].type]))&&JSON.stringify(previous.proof.damage)===JSON.stringify(op.proof.damage);
  const combined=/\bmelee\s+or\s+ranged\s+(?:(weapon|spell)\s+)?attack(?:\s+roll)?\b/iu.exec(q),kind=combined?.[1]?.toLowerCase()==='spell'?'sak':'wak';
  // Preserve the existing archived typed-mode contract; new neutral forms
  // additionally prove both modes without inventing a weapon/spell category.
  const typed=previous.attack.type==='m'+kind&&op.attack.type==='r'+kind;
  const neutral=!combined?.[1]&&previous.attack.type==='melee'&&op.attack.type==='ranged';
  if(combined&&(typed||neutral)&&previous.attack.toHit===op.attack.toHit&&previous.attack.reach!==undefined&&previous.attack.range===undefined&&op.attack.range!==undefined&&op.attack.reach===undefined&&sameDamage)return'range';
  if(!['type','toHit','reach','range','longRange'].every(field=>previous.attack[field]===op.attack[field]))return;
  const choice=sourceClosedDamageChoice(q);if(!choice||previous.damage?.length!==choice.common.length+1||op.damage?.length!==choice.common.length+1)return;
  if(![previous,op].every(item=>Array.isArray(item.proof.damage)&&item.proof.damage.length===item.damage.length&&item.proof.damage.every((proof:unknown)=>typeof proof==='string'&&text(proof)===q)))return;
  const matches=(part:any,atom:{formula:string;types:string[]},relationship:string)=>object(part)&&formula(String(part.formula))===atom.formula&&JSON.stringify(part.types??[part.type])===JSON.stringify(atom.types)&&part.relationship===relationship;
  if(matches(previous.damage[0],choice.atoms[0]!,'base')&&matches(op.damage[0],choice.atoms[1]!,'replacement')&&choice.common.every((atom,index)=>matches(previous.damage[index+1],atom,'additional')&&matches(op.damage[index+1],atom,'additional')&&JSON.stringify(previous.damage[index+1])===JSON.stringify(op.damage[index+1])))return'damage';
}

function sourceAlternativeChoice(op:Record<string,any>,previous:unknown,q:string,source:string,previousIndex?:number,currentIndex?:number):boolean{
  if(!object(previous)||!object(previous.proof))return false;
  if(sourceSameClauseAttackChoice(op,previous,q,source))return true;
  if(op.type==='save'&&previous.type==='save'&&text(String(previous.proof.save??''))===q&&sourceScalingOperation(source,op)?.row.kind==='area')return true;
  if(op.type==='attack'&&previous.type==='attack'){
    const original=sourceOperationClauses(source).find(clause=>text(clause)===q),choice=sourceAttackBonusChoice(original??q);
    if(choice)return previous.relationship==='primary'&&previous.condition===undefined&&object(previous.attack)&&object(op.attack)
      &&text(String(previous.proof.attack??''))===q&&previous.attack.toHit===choice.defaultBonus&&op.attack.toHit===choice.conditionalBonus
      &&op.condition===choice.condition&&['type','reach','range','longRange'].every(field=>previous.attack[field]===op.attack[field])
      &&previous.targetSpecial===op.targetSpecial;
  }
  // An explicit sentence introducer scopes the entire new operation. A bare
  // OR in a damage choice or target attribute is not this relationship.
  if(/^(?:alternatively\b|or\b|作为替代|或者|或是)/iu.test(q))return true;
  // A complete parent can explicitly choose one of named sibling options.
  // Bind the actual child headings and their nearest preceding declaration;
  // an OR in a target, a result label or an unrelated clause is no proof.
  const clauses=sourceOperationClauses(source).map(text),previousQuote=text(String(previous.type==='attack'?previous.proof.attack:previous.type==='save'?previous.proof.save:previous.proof.damage?.[0]??''));
  const beforeIndex=previousIndex??clauses.indexOf(previousQuote),afterIndex=currentIndex??clauses.indexOf(q);
  if(op.type==='attack'&&previous.type==='attack'&&sourceLeverTableChoice(source,beforeIndex,afterIndex))return true;
  if(beforeIndex>=0&&afterIndex>beforeIndex){
    const introduction=clauses.findLastIndex((clause,index)=>{
      const declaration=/\b(?:uses?|chooses?|selects?)\s+one of the following\b|(?:使用|选择)(?:以下|下列)(?:一种|一个|一项)/iu.exec(clause);
      const before=clause.slice(0,declaration?.index).split(/\bbut\b|但是|但/iu).at(-1)??'';
      return index<beforeIndex&&!!declaration&&!new RegExp(`\\b${SOURCE_NEGATION_TOKEN}\\b|不能|无法|不得`,'iu').test(before);
    });
    const heading=(clause:string)=>{
      // A selector and its first child may share one printed sentence:
      // "uses one of the following breaths: Fire Breath." The colon keeps
      // that title inside the already-proven declaration's scope.
      const inline=/\b(?:uses?|chooses?|selects?)\s+one of the following\b[^:：.。]*[:：]\s*(.+)$|(?:使用|选择)(?:以下|下列)(?:一种|一个|一项)[^:：.。]*[:：]\s*(.+)$/iu.exec(clause);
      const child=inline?.[1]??inline?.[2]??clause;
      const title=/^([^:：.。]{1,80})\s*[:：]/u.exec(child)?.[1]??(/^([^:：.。]{1,80})[。.]$/u.exec(child)?.[1]);
      if(!title)return;
      return /\p{Script=Han}/u.test(title)||title.split(/\s+/u).every(word=>/^[\p{Lu}\p{Lt}\d]/u.test(word)||/^(?:of|the|and|or|with|a|an)$/u.test(word))?title:undefined;
    };
    const owner=(index:number)=>{
      for(let at=index;at>=introduction;at--){const title=heading(clauses[at]!);if(!title)continue;
        // A temporal/common-result heading closes the sibling option scope;
        // do not skip it and lend the preceding option's ownership forward.
        if(conditional.test(title)||/^(?:(?:first|second|third)\s+)?(?:failure|success)(?:\b|$)|^(?:on a (?:failed|successful) save|hit|target)$|^(?:第[一二三]次)?(?:失败|成功)|^(?:命中|目标)$/iu.test(title))return-1;
        return at;
      }return-1;
    };
    const primitive=/\b(?:DC\s*\d+|(?:melee|ranged).{0,30}attack)\b|难度等级\s*\d+|(?:近战|远程)[^。]{0,12}攻击/iu.exec(q);
    const deferred=primitive&&/\bat (?:the )?(?:start|end)\b|\bafter\b|回合(?:开始|结束)|之后/iu.test(q.slice(0,primitive.index));
    if(introduction>=0&&!deferred){const left=owner(beforeIndex),right=owner(afterIndex);if(left>=introduction&&right>left)return true;}
  }
  if(op.type!=='save'||previous.type!=='save'||text(String(previous.proof.save??''))!==q)return false;
  const atoms=sourceSaveAtoms(q),matches=(atom:SourceSaveAtom,save:any)=>atom.dc===save?.dc&&JSON.stringify(atom.abilities)===JSON.stringify(save?.abilities);
  const before=atoms.find(atom=>matches(atom,previous.save)),after=atoms.find(atom=>matches(atom,op.save));
  return!!before&&!!after&&before.end<=after.start&&/^\s*[,;，；]?\s*(?:or|或者|或)\s*(?:(?:a|an)\s+)?$/iu.test(q.slice(before.end,after.start));
}

/** A literal roll can reference one explicit source-owned type selector.
 * No selector, conflicting selectors or an unknown type remain unresolved. */
/** Equal printed rolls from explicitly exclusive modes are one type choice,
 * not two simultaneous damage parts. Both mode qualifications stay in source. */
function sourceDamageModeChoice(q:string){
  const labels=Object.values(DAMAGE).join('|'),pattern=new RegExp(`^((?:The|A|An) [\\p{L}'’-]+ takes? )(?<left>\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?) (?<leftType>${labels}) damage from (?<leftMode>an? [\\p{L}'’ -]+) or (?<right>\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?) (?<rightType>${labels}) damage from (?<rightMode>an? [\\p{L}'’ -]+)[.。]$`,'iu'),match=pattern.exec(q),g=match?.groups;
  if(!match||!g||formula(g.left!)!==formula(g.right!)||g.leftMode===g.rightMode||g.leftMode!.split(/\s+/u).at(-1)!==g.rightMode!.split(/\s+/u).at(-1))return;
  const types=[g.leftType,g.rightType].map(label=>Object.entries(DAMAGE).find(([,aliases])=>new RegExp(`^(?:${aliases})$`,'iu').test(label!))![0]);
  if(types[0]===types[1])return;
  return{formula:formula(g.left!),types,start:match[1]!.length,end:q.length-1,kind:'chosen' as const};
}

function sourceReferencedDamageAtoms(q:string,source:string){
  const mode=sourceDamageModeChoice(q);
  // Literal typed damage and local mode choices do not reference a parent
  // selector. Avoid rescanning the complete parent for every literal atom.
  if(!/\bdamage of\b|^The spell['’]s base damage is\b/iu.test(q))return mode?[mode]:[];
  const type=(label:string)=>Object.entries(DAMAGE).find(([,aliases])=>new RegExp(`^(?:${aliases})$`,'iu').test(label))?.[0];
  const clauses=sourceOperationClauses(source).map(text),declarations:Array<{owner:string;types:string[];at:number}>=[];
  const position=clauses.findIndex(clause=>clause.includes(text(q)));
  for(const [declarationIndex,clause]of clauses.entries()){
    const declaration=declarationIndex===0?(sourceSpellHeader(source,clause)?.body??clause):clause;
    const choice=/\bchoose (.+?)(?: for the type\b|[.。]$)/iu.exec(declaration);
    if(choice&&/\bor\b/iu.test(choice[1]!)&&!/\band\b/iu.test(choice[1]!)&&!new RegExp(`\\b${SOURCE_NEGATION_TOKEN}\\b`,'iu').test(declaration.slice(0,choice.index))){
      const labels=choice[1]!.split(/\s*,\s*(?:or\s+)?|\s+or\s+/iu).filter(Boolean),types=labels.map(type);
      if(types.length>1&&types.every(Boolean)&&new Set(types).size===types.length)declarations.push({owner:'chosen',types:types as string[],at:declarationIndex});
    }
    const element=/^Choose the ([\p{L}'’-]+)['’]s element, which determines its damage type:\s*(.+)[.。]$/iu.exec(clause);
    if(element){
      const matches=[...element[2]!.matchAll(/[\p{L}'’-]+\s*\(([^)]+)\)/gu)],types=matches.map(match=>type(match[1]!));
      const remainder=element[2]!.replace(/[\p{L}'’-]+\s*\([^)]+\)/gu,'');
      if(matches.length>1&&types.every(Boolean)&&/^[\s,]*(?:or[\s,]*)?$/iu.test(remainder)&&new Set(types).size===types.length)declarations.push({owner:element[1]!.toLowerCase(),types:types as string[],at:declarationIndex});
    }
  }
  const result:Array<{formula:string;types:string[];start:number;end:number;kind:'chosen'|'base'}>=[];
  const refs=/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+damage of (?:the (chosen) type|the ([\p{L}'’-]+)['’]s type)/giu;
  for(const match of q.matchAll(refs)){
    const owner=(match[2]??match[3]!)?.toLowerCase(),choices=declarations.filter(declaration=>declaration.owner===owner&&declaration.at<position);if(choices.length!==1)continue;
    if(!sourceOutgoingDamageAt(q,match.index!,match.index!+match[0].length,match[1]!))continue;
    result.push({formula:formula(match[1]!),types:choices[0]!.types,start:match.index!,end:match.index!+match[0].length,kind:'chosen'});
  }
  const base=/^The spell['’]s base damage is (\d+d\d+)\b/iu.exec(q),at=clauses.indexOf(text(q)),prior=clauses[at-1];
  if(base&&at>0&&prior){
    const label=new RegExp(`^A creature takes (${Object.values(DAMAGE).join('|')}) damage equal to the total accumulated damage\\b`,'iu').exec(prior),resolved=label&&type(label[1]!);
    if(resolved){const start=q.indexOf(base[1]!);result.push({formula:formula(base[1]!),types:[resolved],start,end:start+base[1]!.length,kind:'base'});}
  }
  if(mode)result.push(mode);
  return result;
}

/** Printed level rows inherit a type from their own column/header. Only
 * literal rolls and complete rows are atoms; level bands and dart counts are
 * never damage. This does not choose a level or execute a scaling rule. */
function sourceScalingDamageRows(q:string){
  const labels=Object.values(DAMAGE).join('|'),typeOf=(label:string)=>Object.entries(DAMAGE).find(([,aliases])=>new RegExp(`^(?:${aliases})$`,'iu').test(label))?.[0];
  const table=new RegExp(`^Levels\\s+(${labels})\\s+Damage\\s+Area of Effect\\s+`,'iu').exec(q);
  const list=new RegExp(`^You can scale the [^.;:]{1,80} for higher levels by increasing each ([\\p{L}'’-]+)['’]s (${labels}) damage as follows:\\s*`,'iu').exec(q);
  if(!table&&!list)return[];
  const header=table??list!,type=typeOf(table?.[1]??list![2]!);if(!type)return[];
  const body=q.slice(header[0].length),pattern=table?/\b(\d+)[–-](\d+)\s+\d+\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s+(\d+)-foot (Cone)\b/giu:/\b\d+\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s+at levels (\d+)[–-](\d+)\b/giu;
  const matches=[...body.matchAll(pattern)];if(!matches.length)return[];
  const rows=matches.map(match=>{
    const roll=table?match[3]!:match[1]!,start=header[0].length+match.index!+match[0].indexOf('(')+1;
    const common={formula:formula(roll),types:[type],start,end:start+roll.length,from:Number(table?match[1]:match[2]),to:Number(table?match[2]:match[3])};
    return table?{...common,kind:'area' as const,aoe:{shape:'cone',radius:Number(match[4])}}:{...common,kind:'per-item' as const,item:list![1]!};
  });
  let end=0;
  for(const [index,match]of matches.entries()){
    if(!/^[\s,]*(?:or\s+)?$/iu.test(body.slice(end,match.index))||rows[index]!.from>rows[index]!.to||index>0&&rows[index]!.from<=rows[index-1]!.to)return[];
    end=match.index!+match[0].length;
  }
  return /^[\s.]*$/u.test(body.slice(end))?rows:[];
}

/** A scaling declaration can reuse only its one unambiguous base Save and
 * matching damage type. A second Save or another damage owner is unresolved. */
function sourceScalingDamageContext(source:string,q:string){
  const rows=sourceScalingDamageRows(q);if(!rows.length)return;
  const all=sourceOperationClauses(source).map(text),at=all.indexOf(q);if(at<0||all.lastIndexOf(q)!==at)return;
  const higher=all.findLastIndex((clause,index)=>index<at&&/^At Higher Levels\.$/iu.test(clause));if(higher<0)return;
  if(rows[0]!.kind==='area'&&!/^You can scale the [^.;]{1,80} for higher levels by increasing the damage and the area of effect, as shown in the following table\.$/iu.test(all[at-1]??''))return;
  const saves=all.slice(0,higher).flatMap(quote=>sourceSaveAtoms(quote).map(save=>({quote,save})));if(saves.length!==1)return;
  const base=saves[0]!,damage=sourceDamageAtoms(base.quote);if(damage.length!==1||JSON.stringify(damage[0]!.types)!==JSON.stringify(rows[0]!.types))return;
  if(rows[0]!.kind==='per-item'){
    const item=rows[0]!.item!.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    if(!new RegExp(`\\bper ${item}\\b`,'iu').test(base.quote))return;
  }
  return{rows,base};
}

function sourceScalingOperation(source:string,op:Record<string,any>){
  if(!object(op.proof)||!Array.isArray(op.damage)||op.damage.length!==1||!object(op.damage[0])||!Array.isArray(op.proof.damage)||op.proof.damage.length!==1)return;
  const q=text(String(op.proof.damage[0]??'')),context=sourceScalingDamageContext(source,q);if(!context)return;
  const part=op.damage[0],row=context.rows.find(row=>row.formula===formula(String(part.formula))&&JSON.stringify(row.types)===JSON.stringify(part.types??[part.type]));if(!row)return;
  if(row.kind==='area'){
    if(op.type!=='save'||op.relationship!=='alternative'||text(String(op.proof.save??''))!==context.base.quote||sourceSaveIdentity(context.base.quote,op.save)!==sourceSaveIdentity(context.base.quote,context.base.save)||part.relationship!=='base'||text(String(op.proof.aoe??''))!==q||op.aoe?.shape!==row.aoe!.shape||op.aoe?.radius!==row.aoe!.radius)return;
  }else if(op.type!=='damage'||op.relationship!=='follow-up'||part.relationship!=='conditional'||op.condition!==source.trim()||part.condition!==source.trim())return;
  return{...context,row,quote:q};
}

function sourceOutgoingDamageAt(clause:string,start:number,end:number,roll:string):boolean{
  const before=sourceRollOnlyConditionText(clause.slice(0,start));
  const after=clause.slice(end);
    if(/\b(?:is|be) destroyed if it takes at least\s*$/iu.test(before))return false;
    // Damage required to break an object is an input threshold. It does not
    // grant this source an outgoing damage roll; later real output atoms in
    // the same clause still go through the ordinary predicate checks.
    if(/^\d+$/u.test(roll)&&/^\s*(?:Dealing|Inflicting)(?:\s+(?:at least|a total of))?\s*$/iu.test(before)
      &&/^\s+to\s+(?:(?:the|a|an|this|that)\s+)?[\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,7}(?:\s*\(AC\s*\d+\))?\s+(?:destroys?|breaks?|severs?)\b/iu.test(after))return false;
    // Match a mitigation predicate with its damage object before scanning
    // simple verbs: "takes" in "reduce the damage it takes by" is a relative
    // clause, not a new output. A coordinated result starts a new owner.
    const negative=SOURCE_NEGATION_TOKEN,mitigation='(?:reduc(?:e[sd]?|ing)|prevent(?:s|ed|ing)?|absorb(?:s|ed|ing)?)';
    const mitigationObject=`${mitigation}\\s+(?:(?:the|any|all|this|that|incoming|remaining)\\s+)*damage\\b(?:(?!,\\s*(?:and|but|then|plus)\\b|\\b(?:and|but|then|plus)\\s+(?:increase|add|deal|take|cause|inflict)\\b)[^;。!?])*?\\bby\\s*$`;
    const predicates=[...before.matchAll(new RegExp(`\\b${mitigationObject}|(?:\\b${negative}\\s+)?\\b(?:takes?|deals?|suffers?|receives?|${mitigation})\\b|不(?:会)?(?:受到|造成|承受)|受到|造成|承受`,'giu'))];
    const last=predicates.at(-1),predicate=last?.[0]??'',local=last?before.slice(last.index):before;
    return !new RegExp(`\\b${negative}\\b|^不|不能|无法`,'iu').test(local)&&!/(?:\b(?:no|not|zero)|没有|无|不受)\s*$/iu.test(before)&&!/^不/u.test(predicate)&&!new RegExp(`^${mitigation}\\b`,'iu').test(predicate);
}

function sourceDamageAtoms(clause:string,source=clause):Array<{formula:string;types:string[]}>{
  const mode=sourceDamageModeChoice(clause);if(mode)return[{formula:mode.formula,types:mode.types}];
  const label=`(?:${Object.values(DAMAGE).join('|')})`,choices=`(?:${label}(?:\\s*,\\s*${label})+${DAMAGE_FINAL_OR}${label}|${label}(?:\\s*(?:or|或者|或)\\s*${label})*)`;
  const pattern=new RegExp(`(\\d+(?:d\\d+(?:\\s*[+-]\\s*\\d+)?)?)\\s*[)）]?\\s*(?:点|的)?\\s*(${choices})\\s*(?:damage|伤害)`,'giu');
  const direct=sourceResultScopes(clause).flatMap(scope=>[...scope.text.matchAll(pattern)].filter(match=>{
    return sourceOutgoingDamageAt(scope.text,match.index!,match.index!+match[0].length,match[1]!);
  }).map(match=>({formula:formula(match[1]!),types:match[2]!.split(/\s*,\s*(?:or\s+)?|\s+or\s+|或(?:者)?/iu).map(label=>label.trim()).filter(Boolean).map(label=>Object.entries(DAMAGE).find(([,aliases])=>new RegExp(`^(?:${aliases})$`,'iu').test(label))![0])})));
  return [...direct,...sourceScalingDamageRows(clause).map(({formula,types})=>({formula,types})),...sourceReferencedDamageAtoms(clause,source).map(({formula,types})=>({formula,types}))];
}

/** OR must actually connect adjacent damage atoms with the same operation
 * owner. A later "or half on success" does not make earlier Hit damage an
 * alternative to the separate Save's damage in that same sentence. */
function sourceHasDamageAlternatives(clause:string):boolean{
  const atoms=sourceDamageAtoms(clause),seen=new Map<string,number>();
  const located=atoms.map(atom=>{
    const key=JSON.stringify(atom),occurrence=seen.get(key)??0;seen.set(key,occurrence+1);
    const spans=sourceDamageAtomSpans(clause,{...atom,type:atom.types[0]!});
    return{...atom,span:spans[occurrence],ambiguous:spans.length!==atoms.filter(other=>JSON.stringify(other)===key).length};
  });
  if(located.some(atom=>atom.ambiguous))return /\bor\b|或/iu.test(clause)&&new Set(atoms.map(atom=>atom.formula)).size>1;
  return located.some((right,index)=>{
    const left=located[index-1];if(!left?.span||!right.span||left.formula===right.formula)return false;
    const between=clause.slice(left.span.end,right.span.start);
    return /\bor\b|或/iu.test(between)&&!sourceSaveAtoms(between).length
      &&!/\b(?:melee|ranged).{0,30}attack|近战.{0,12}攻击|远程.{0,12}攻击/iu.test(between);
  });
}

function sourceSuccessDamage(source:string,saveClause:string,clauseIndex?:number):'none'|'half'|'full'|'unknown'{
  const scopes=sourceResultScopes(source),operation=scopes.find(scope=>clauseIndex===undefined?text(scope.clause)===saveClause:scope.clauseIndex===clauseIndex)?.operation;
  const selected=scopes.filter(scope=>scope.operation===operation),success=selected.filter(scope=>scope.branch==='success'||scope.branch==='both');
  let outcome:'none'|'half'|'full'|undefined;
  for(const scope of success){
    if(sourceDamageAtoms(scope.text).length||/\b(?:unless|only if|provided|except)\b|除非|仅当|只有/iu.test(scope.text))return'unknown';
    const current=/\bhalf\b|一半|减半|半伤/iu.test(scope.text)?'half':/full damage|same damage|全额|相同伤害/iu.test(scope.text)?'full':/\bno damage\b|\bnone\b|不受伤害|无伤害|没有伤害/iu.test(scope.text)?'none':undefined;
    if(current&&outcome&&current!==outcome)return'unknown';if(current)outcome=current;
  }
  if(outcome)return outcome;
  // A visible but unparsed success-damage rule is an unresolved branch, never
  // evidence that successful targets take zero damage.
  if(selected.some(scope=>/\b(?:success|successful|otherwise)\b|成功/iu.test(scope.text)&&/damage|伤害|\d+d\d+/iu.test(scope.text)))return'unknown';
  return'none';
}

/** A parenthetical explicitly modifying Advantage/Disadvantage belongs to
 * the Attack roll, not its later Hit damage. Never remove a compound change
 * to a second roll, damage, DC or geometry from the condition scope. */
function sourceRollOnlyConditionText(value:string):string{
  return value.replace(/(\b(?:melee|ranged)(?:\s+or\s+ranged)?\s+(?:(?:weapon|spell)\s+)?attack(?:\s+roll)?\s*[:：]\s*[+-]?\s*\d+\s*)\((with\s+(?:Advantage|Disadvantage)\b[^()]*)\)/giu,(whole,prefix,qualifier)=>/\b(?:damage|deals?|takes?|DC|reach|range|saving|throw|to hit)\b/iu.test(qualifier)?whole:prefix);
}

function qualifiedDamageAtom(clause:string,atom:{formula:string;types:string[]},ownSave?:SourceOperation['save'],ownAttack=false,source=clause):boolean{
  const reference=sourceReferencedDamageAtoms(clause,source).find(part=>part.formula===atom.formula&&JSON.stringify(part.types)===JSON.stringify(atom.types));
  if(reference){
    if(reference.kind==='base')return true;
    let before=clause.slice(0,reference.start),after=clause.slice(reference.end);
    const saves=sourceSaveAtoms(before);if(ownSave&&saves.length===1&&saves[0]!.dc===ownSave.dc)before=before.slice(saves[0]!.end);
    return sourceConditionQualifier(before)||sourceConditionQualifier(after)||!ownSave&&!ownAttack&&/^On a hit\b/iu.test(before);
  }
  const row=sourceScalingDamageRows(clause).find(row=>row.formula===atom.formula&&JSON.stringify(row.types)===JSON.stringify(atom.types));
  if(row)return row.kind==='per-item';
  // Splitting SUCCEED ... OR keeps the failed result local, but cannot
  // erase a source trigger before that Save when its condition is omitted.
  if(!ownSave){
    const span=sourceDamageAtomSpan(clause,{...atom,type:atom.types[0]!}),saves=sourceSaveAtoms(clause).filter(save=>span&&save.end<span.start);
    if(saves.length===1&&sourceConditionQualifier(clause.slice(0,saves[0]!.start)))return true;
  }
  for(const scope of sourceResultScopes(clause)){
    const candidates=[...scope.text.matchAll(/\b\d+(?:d\d+(?:\s*[+-]\s*\d+)?)?/giu)].filter(match=>formula(match[0])===atom.formula);
    for(const candidate of candidates){
      const tail=scope.text.slice(candidate.index!+candidate[0].length),types=sourceDamageTypesPattern(atom.types);
      const bound=new RegExp(`^[\\s)）点的]*(?:${types})(?:\\s+damage|伤害)`,'iu').exec(tail);if(!bound)continue;
      let before=sourceRollOnlyConditionText(scope.text.slice(0,candidate.index));
      const choice=sourceClosedDamageChoice(scope.text);
      if(choice?.aside&&candidate.index!>=choice.aside.end&&choice.common.some(common=>common.formula===atom.formula&&JSON.stringify(common.types)===JSON.stringify(atom.types)))before=sourceRollOnlyConditionText(scope.text.slice(0,choice.aside.start)+' '+scope.text.slice(choice.aside.end,candidate.index));
      let after=tail.slice(bound[0].length).split(/[,，]?\s*(?:\band\b|\bplus\b|并且|以及|此外)/iu)[0]!;
      const or=/[,，]?\s*\bor\s+/iu.exec(after);if(or&&sourceDamageAtoms(after.slice(or.index+or[0].length)).length)after=after.slice(0,or.index);
      const saves=sourceSaveAtoms(before),save=ownSave&&saves.length===1&&saves[0]!.dc===ownSave.dc&&JSON.stringify(saves[0]!.abilities)===JSON.stringify(ownSave.abilities)?saves[0]:undefined;
      // A retained trigger before this exact Save owns the Save itself. It
      // cannot turn its ordinary failed damage into a separate conditional
      // rider. Conditions after the Save still qualify the damage normally.
      if(save)before=before.slice(save.end);
      if(sourceConditionQualifier(before)||sourceConditionQualifier(after))return true;
      // A grant that only adds damage on a later hit is conditional GM work.
      // A printed Hit result already has that owner, so redundant "on a hit"
      // inside its own damage clause must not erase the native hit damage.
      if(!/^(?:Hit|命中)\s*[:：]/iu.test(scope.text)&&!ownAttack&&/\bon (?:a |each |every )?(?:successful )?hit\b|命中(?:时|后)/iu.test(before+' '+after))return true;
    }
  }
  return false;
}

/** Starting a manual damage roll needs an actual source condition. Result
 * branches need no guessed DC; relative measurements keep their full parent
 * antecedent and never turn a depth into Actor range or outgoing mitigation. */
function sourceIndependentDamageCondition(source:string,q:string,atom:{formula:string;types:string[]}):boolean{
  const matches=(value:string)=>sourceDamageAtoms(value,source).some(part=>part.formula===atom.formula&&JSON.stringify(part.types)===JSON.stringify(atom.types));
  if(!matches(q))return false;
  if(qualifiedDamageAtom(q,atom,undefined,false,source))return true;
  if(sourceResultScopes(source).some(scope=>text(scope.clause)===q&&scope.branch!=='unbound'&&matches(scope.text)))return true;
  const prior=sourceOperationClauses(source).map(text),at=prior.indexOf(q);
  if(/^The attacker takes\b/iu.test(q)&&at>0&&/\bwhenever a creature\b[^.;。]+\bhits you with a melee attack roll\b/iu.test(prior[at-1]!)&&sourceEventQualifier(prior[at-1]!))return true;
  if(!/^(?:below|above|beyond|under|over)\s+(?:that|this)(?:\s+(?:depth|height|altitude|distance|limit|threshold))?\s*[,，]/iu.test(q))return false;
  const clauses=sourceOperationClauses(source).map(text),positions=clauses.flatMap((clause,index)=>clause===q?[index]:[]),previous=positions.length===1?clauses[positions[0]!-1]:undefined;
  if(!previous||!/\b(?:depth|height|altitude|distance|limit|threshold)\s+(?:of\s+)?\d+(?:\.\d+)?\s*(?:feet|ft\.?|miles?|inches?|met(?:er|re)s?|尺)\b/iu.test(previous)
    ||new RegExp(`\\b(?:${SOURCE_NEGATION_TOKEN}|no|not)\\b|不能|无法`,'iu').test(previous))return false;
  const spans=sourceDamageAtomSpans(q,{...atom,type:atom.types[0]!});
  return spans.length===1&&/\b(?:takes?|deals?|suffers?|receives?)\s+(?:(?:an?\s+)?(?:extra|additional)\s+)?(?:\d+\s*\(\s*)?$/iu.test(q.slice(0,spans[0]!.start));
}

/** Round-area size is its radius, not a nearby height or point distance. */
function sourceRoundAreaRadius(q:string,shape:'cylinder'|'sphere',source=q):number|undefined{
  q=sourceSpellHeader(source,q)?.body??q;
  const chineseShape=shape==='cylinder'?'圆柱形':'球(?:形|状)',cylinders=[...q.matchAll(new RegExp(`\\b${shape}\\b|${chineseShape}`,'giu'))];if(cylinders.length!==1)return;
  const at=cylinders[0]!.index!,before=q.slice(0,at),after=q.slice(at+cylinders[0]![0].length);
  if(new RegExp(`^(?:${chineseShape})$`,'u').test(cylinders[0]![0])){
    const radius=/半径\s*(\d+)\s*尺(?:[,，、\s]*(?:高|高度)\s*\d+\s*尺)?\s*的?$/u.exec(before)??/^\s*(?:的)?半径\s*(\d+)\s*尺/u.exec(after)
      // CHM: 半径20尺的黄色恶心气体云团球状区域. A descriptive
      // noun may intervene, but another measurement or clause may not.
      ??(shape==='sphere'?/半径\s*(\d+)\s*尺[^\d。.;；，,]{0,40}$/u.exec(before):undefined);
    if(radius)return Number(radius[1]);
    if(/(?:高|高度)\s*\d+\s*尺\s*的?$/u.test(before))return;
    const simple=/(?<!\d)(\d+)\s*尺\s*的?$/u.exec(before);return simple?Number(simple[1]):undefined;
  }
  const units='(?:foot|feet|ft\\.?|尺)',dimension=`\\d+[-\\s]*${units}[-\\s]*(?:radius|high|tall)`;
  const dimensions=new RegExp(`(?<![\\p{L}\\d])(${dimension}(?:\\s*(?:,|and)?\\s*${dimension})*)\\s*$`,'iu').exec(before)?.[1];
  if(dimensions){const radii=[...dimensions.matchAll(new RegExp(`(\\d+)[-\\s]*${units}[-\\s]*radius\\b`,'giu'))];return radii.length===1?Number(radii[0]![1]):undefined;}
  const following=new RegExp(`^\\s+(?:with|of|that (?:is|has))\\s+(?:a\\s+)?radius\\s+(?:of\\s+)?(\\d+)\\s*${units}\\b`,'iu').exec(after);
  if(following)return Number(following[1]);
  // Preserve the existing simple size-before-shape spelling; dimensions
  // explicitly labelled high/tall cannot pass this unlabelled size form.
  const simple=new RegExp(`(?<![\\p{L}\\d])(\\d+)[-\\s]*${units}[-\\s]*$`,'iu').exec(before);
  return simple?Number(simple[1]):undefined;
}

/** Explicit dimensions belong to one locally named Line, never its point
 * placement or a different area/entity in the complete proof sentence. */
function sourceLineDimensions(q:string):{length:number;width?:number}|undefined{
  const lines=[...q.matchAll(/\bLine\b|线形/giu)];if(lines.length!==1)return;
  const line=lines[0]!,before=q.slice(0,line.index),after=q.slice(line.index!+line[0].length);
  const units='(?:foot|feet|ft\\.?)',dimension=`\\d+[-\\s]*${units}[-\\s]*(?:long|wide)`;
  const dimensions=new RegExp(`(?<![\\p{L}\\d])(${dimension}(?:\\s*(?:,|and)?\\s*${dimension})*)\\s*$`,'iu').exec(before)?.[1]
    ??new RegExp(`^\\s+(?:that is\\s+)?(${dimension}(?:\\s*(?:,|and)?\\s*${dimension})*)`,'iu').exec(after)?.[1];
  if(dimensions){
    const lengths=[...dimensions.matchAll(new RegExp(`(\\d+)[-\\s]*${units}[-\\s]*long\\b`,'giu'))],widths=[...dimensions.matchAll(new RegExp(`(\\d+)[-\\s]*${units}[-\\s]*wide\\b`,'giu'))];
    if(lengths.length!==1||widths.length>1)return;
    return{length:Number(lengths[0]![1]),...(widths.length?{width:Number(widths[0]![1])}:{})};
  }
  const simple=new RegExp(`(?<![\\p{L}\\d])(\\d+)[-\\s]*${units}[-\\s]*$`,'iu').exec(before);
  return simple?{length:Number(simple[1])}:undefined;
}

/** Cylinder height is separately labelled, not its radius or point range. */
function sourceCylinderHeight(q:string):number|undefined{
  const shapes=[...q.matchAll(/\bCylinder\b|圆柱形/giu)];if(shapes.length!==1)return;
  const shape=shapes[0]!,before=q.slice(0,shape.index),after=q.slice(shape.index!+shape[0].length);
  if(shape[0]==='圆柱形'){const height=/半径\s*\d+\s*尺[,，、\s]*(?:高|高度)\s*(\d+)\s*尺\s*的?$/u.exec(before)?.[1];return height===undefined?undefined:Number(height);}
  const units='(?:foot|feet|ft\\.?)',dimension=`\\d+[-\\s]*${units}[-\\s]*(?:radius|high|tall)`;
  const dimensions=new RegExp(`(?<![\\p{L}\\d])(${dimension}(?:\\s*(?:,|and)?\\s*${dimension})*)\\s*$`,'iu').exec(before)?.[1];
  if(dimensions){const heights=[...dimensions.matchAll(new RegExp(`(\\d+)[-\\s]*${units}[-\\s]*(?:high|tall)\\b`,'giu'))];return heights.length===1?Number(heights[0]![1]):undefined;}
  const following=new RegExp(`^\\s+(?:with|of|that (?:is|has))\\s+(?:a\\s+)?radius\\s+(?:of\\s+)?\\d+\\s*${units}\\s*(?:,|and)\\s*(?:a\\s+)?height\\s+(?:of\\s+)?(\\d+)\\s*${units}\\b`,'iu').exec(after);
  return following?Number(following[1]):undefined;
}

function sourceOperationFailureStatusesAt(source:string,op:SourceOperation,clauseIndex?:number):NativeFailureStatus[]{
  if(op.type!=='save'||!op.save||!Array.isArray(op.save.abilities)||!object(op.proof)||typeof op.proof.save!=='string')return[];
  const all=sourceOperationClauses(source).map(text),q=text(op.proof.save);
  if(clauseIndex===undefined&&all.filter(clause=>clause===q).length>1)return[];
  const legacy=all.flatMap(sourceSaveAtoms).length>1?undefined:sourceGmTriggeredSave(source);
  if(legacy&&op.save.dc===legacy.dc&&op.save.abilities.length===1&&op.save.abilities[0]===legacy.ability)return legacy.failureStatuses;
  const start=clauseIndex??all.indexOf(q),next=all.findIndex((clause,index)=>index>start&&sourceSaveAtoms(clause).length>0);
  const tail=all.slice(Math.max(start,0),next<0?undefined:next).join(' '),failure=/(?:Failure|失败)[:：]/iu.exec(tail);
  if(failure)return sourceFailedSaveStatuses(tail.slice(failure.index));
  const failed=sourceResultScopes(tail).filter(scope=>scope.branch==='failure');
  return failed.length?sourceFailedSaveStatuses('Failure: '+failed.map(scope=>scope.text).join(' ')):[];
}

export function sourceOperationFailureStatuses(source:string,op:SourceOperation):NativeFailureStatus[]{
  return sourceOperationFailureStatusesAt(source,op);
}

/** A demonstrative recipient can inherit the immediately preceding hit event.
 * Keep the original two sentences; unrelated visibility/AC and intervening
 * headings cannot supply an anaphoric trigger. */
function sourceVisibilitySelection(source:string,q:string):{quote:string;target:string}|undefined{
  const all=sourceOperationClauses(source).map(text),at=all.indexOf(q);
  const visibility=/^If the target can see (.+?), the target must\b/iu.exec(q);
  const selection=at>0?/^(.+?) targets ((?:one|a|an) (?:humanoid|creature|target)\b[^.;。]*)[.。]?$/iu.exec(all[at-1]!):undefined;
  if(visibility&&selection&&all.lastIndexOf(q)===at&&text(visibility[1]!).toLowerCase()===text(selection[1]!).toLowerCase())return{quote:all[at-1]!,target:selection[2]!};
}
function sourceIndependentSaveCondition(source:string,q:string,prefix:string):boolean{
  if(sourceEventQualifier(prefix))return true;
  const all=sourceOperationClauses(source).map(text),at=all.indexOf(q);
  // An immediately introduced target may have a reciprocal visibility gate.
  // Bind the same printed owner in both sentences; modal "can see" alone is
  // not an event and cannot grant an unrelated standalone Save.
  if(sourceVisibilitySelection(source,q))return true;
  if(/^The target(?:\s+and\b|\s+must\b)/iu.test(q)&&at>0&&all.lastIndexOf(q)===at&&/^If the attack hits,\s+/iu.test(all[at-1]!)&&!new RegExp(`\\b${SOURCE_NEGATION_TOKEN}\\b`,'iu').test(all[at-1]!))return true;
  if(!/^that\s+(?:creature|target)\b/iu.test(q))return false;
  if(at<1||all.lastIndexOf(q)!==at)return false;
  const before=all[at-1]!,hit=/\b(?:an?|the)\s+attack\b[^.;。]{0,100}\bhits\s+(?:a|an|the)\s+(?:creature|target)\b/iu.exec(before);
  return!!hit&&!new RegExp(`\b${SOURCE_NEGATION_TOKEN}\b|\bno\b`,'iu').test(before);
}

/** THEN after the explicit creation/replacement event is a real prerequisite
 * for a manually directed attack, not an attack granted by a static object. */
function sourceIndependentAttackCondition(source:string,q:string):boolean{
  if(!/^you\s+can\s+then\s+take\s+a\s+(?:bonus|magic)\s+action\s+to\s+make\s+(?:a|an)\s+(?:melee|ranged)\s+(?:weapon|spell)\s+attack\b/iu.test(q))return false;
  const all=sourceOperationClauses(source).map(text),at=all.indexOf(q),previous=all[at-1];
  if(at<1||all.lastIndexOf(q)!==at||!previous||new RegExp(`\\b${SOURCE_NEGATION_TOKEN}\\b|\\bno\\b`,'iu').test(previous))return false;
  const created=/\b(?:a|an)\s+([^,.;。]{1,80}?)\s+(?:takes?\s+its\s+place|appears?|is\s+(?:created|summoned))\b/iu.exec(previous)?.[1];
  const origin=/\bwithin \d+ (?:ft\.?|feet) of the ([\p{L}'’ -]+?)(?=,|\s+with an attack bonus|[.。])/iu.exec(q)?.[1];
  return!!created&&!!origin&&(text(created).toLowerCase()===text(origin).toLowerCase()||text(created).toLowerCase().endsWith(' '+text(origin).toLowerCase()));
}

/** The same local Attack facts bind both operation proofs and an ordinary
 * feature's literal target fragment. This never borrows a number from a rider. */
function sourceAttackBonuses(q:string):number[]{
  return[...q.matchAll(/(?:([+-]\s*\d+)\s+to hit|(?:命中|attack roll|攻击检定)\s*[:：]?\s*([+-]?\s*\d+)|\bwith an attack bonus of\s*([+-]\s*\d+))/giu)].map(match=>Number((match[1]??match[2]??match[3])!.replace(/\s/gu,'')));
}

/** One immediate parenthetical may change only a printed attack bonus. The
 * literal condition is GM-owned; it never activates a spell or changes the
 * target, reach, damage or number of attacks. Unparsed compound changes stay
 * invalid rather than authorizing a second executable button. */
function sourceAttackBonusChoice(q:string):{defaultBonus:number;conditionalBonus:number;condition:string}|undefined{
  const match=/\b(?:melee|ranged)\s+(?:weapon|spell)\s+attack\s*:\s*([+-]\s*\d+)\s+to hit\s*\(([+-]\s*\d+)\s+to hit\s+((?:with|while|if|when)\s+[\p{L}\p{M}'’ -]+)\)\s*,/iu.exec(q);
  if(!match||sourceAttackBonuses(q).length!==2||[...q.matchAll(/\b(?:melee|ranged)\s+(?:weapon|spell)\s+attack\b/giu)].length!==1)return;
  const condition=match[3]!;
  if(/\b(?:reach|range|targets?|attacks?|hit|damage|saving|throw|not|no|never|cannot|without|unless|instead|but|or|and)\b|n['’]t\b/iu.test(condition))return;
  const defaultBonus=Number(match[1]!.replace(/\s/gu,'')),conditionalBonus=Number(match[2]!.replace(/\s/gu,''));
  if(!Number.isSafeInteger(defaultBonus)||!Number.isSafeInteger(conditionalBonus)||defaultBonus===conditionalBonus)return;
  return{defaultBonus,conditionalBonus,condition};
}

/** The existing colon-labelled Weapon Attack contract stores its two
 * geometries on one mwak OP. Both printed distances (including long range)
 * must survive; the modern Attack Roll format still uses separate modes. */
function sourceLegacyCombinedAttack(q:string,attack:unknown):boolean{
  if(!object(attack)||attack.type!=='mwak'||!/\bmelee\s+or\s+ranged\s+weapon\s+attack\s*[:：]/iu.test(q))return false;
  const reach=[...q.matchAll(/\breach\s*[:：]?\s*(\d+)\s*(?:ft\.?|feet)\b/giu)],range=[...q.matchAll(/\brange\s*[:：]?\s*(\d+)(?:\s*\/\s*(\d+))?\s*(?:ft\.?|feet)\b/giu)];
  return reach.length===1&&range.length===1&&Number.isSafeInteger(attack.reach)&&Number.isSafeInteger(attack.range)
    &&attack.reach===Number(reach[0]![1])&&attack.range===Number(range[0]![1])
    &&(range[0]![2]===undefined?attack.longRange===undefined:attack.longRange===Number(range[0]![2]));
}

/** One neutral source operation can carry both printed geometries; the
 * generator projects two mutually exclusive GM rolls from this same data. */
function sourceNeutralCombinedAttack(q:string,attack:unknown):boolean{
  if(!object(attack)||!['melee','ranged'].includes(attack.type)||!/\bmelee\s+or\s+ranged\s+attack\s+roll\s*[:：]/iu.test(q))return false;
  const reach=[...q.matchAll(/\breach\s*[:：]?\s*(\d+)\s*(?:ft\.?|feet)\b/giu)],range=[...q.matchAll(/\brange\s*[:：]?\s*(\d+)(?:\s*\/\s*(\d+))?\s*(?:ft\.?|feet)\b/giu)];
  return reach.length===1&&range.length===1&&Number.isSafeInteger(attack.reach)&&Number.isSafeInteger(attack.range)
    &&attack.reach===Number(reach[0]![1])&&attack.range===Number(range[0]![1])
    &&(range[0]![2]===undefined?attack.longRange===undefined:attack.longRange===Number(range[0]![2]));
}

function sourceAttackFactErrors(q:string,attack:NonNullable<SourceOperation['attack']>,alternative=false,neutralChoice?:'melee'|'ranged'):string[]{
  const choice=sourceAttackBonusChoice(q),header=choice?/\b(melee|ranged)\s+(weapon|spell)\s+attack\b/iu.exec(q):undefined;
  const errors:string[]=[],melee=header?header[1]!.toLowerCase()==='melee':/\bmelee\b|近战/iu.test(q),ranged=header?header[1]!.toLowerCase()==='ranged':/\branged\b|远程/iu.test(q),spell=header?header[2]!.toLowerCase()==='spell':/\bspell\b|法术/iu.test(q);
  const combined=/\bmelee\s+or\s+ranged\s+(?:(?:weapon|spell)\s+)?attack(?:\s+roll)?\b/iu.test(q);
  const rangedMode=typeof attack.type==='string'&&attack.type.startsWith('r');
  const hybrid=sourceNeutralCombinedAttack(q,attack);
  const neutral=isNeutralSourceAttack({attack}),sourceNeutral=sourceNeutralAttackKind(q),expected=hybrid?attack.type:neutralChoice??sourceNeutral??(neutral?undefined:(combined&&rangedMode?'r':melee?'m':ranged?'r':'')+(spell?'s':'w')+'ak');
  const bonus=sourceAttackBonuses(q),toHit=choice?(alternative?choice.conditionalBonus:choice.defaultBonus):bonus.length===1?bonus[0]:undefined;
  // The final target slot can restrict eligibility ("one target not grappled
  // by ..."). Negating that target does not negate the Attack declaration.
  const targetBoundary=Math.max(q.lastIndexOf(','),q.lastIndexOf('，'),q.lastIndexOf(';'),q.lastIndexOf('；'));
  const predicate=sourceRollOnlyConditionText(targetBoundary<0?q:q.slice(0,targetBoundary));
  if(/\bmelee\s+and\s+ranged\s+(?:(?:weapon|spell)\s+)?attack\b/iu.test(q))errors.push('attack/type-or-bonus');
  if(combined&&!hybrid&&!sourceLegacyCombinedAttack(q,attack)&&(rangedMode?(attack.range===undefined||attack.reach!==undefined):(attack.reach===undefined||attack.range!==undefined)))errors.push('attack/type-or-bonus');
  if(!Number.isSafeInteger(attack.toHit)||toHit===undefined||toHit!==attack.toHit||attack.type!==expected||!/attack|攻击/iu.test(q)||/\b(?:not|no|cannot)\b|不能|无法|并非/iu.test(predicate))errors.push('attack/type-or-bonus');
  for(const [field,label]of [['reach','reach|触及'],['range','range|射程']] as const){
    const expectedValue=attack[field];if(expectedValue===undefined)continue;
    const match=new RegExp(`(?:${label})\\s*[:：]?\\s*(\\d+)(?:\\s*\\/\\s*(\\d+))?\\s*(?:ft\\.?|feet|尺)`,'iu').exec(q)
      ??(field==='reach'&&attack.type==='msak'&&/\bmake a melee spell attack\b/iu.test(q)?/\bagainst (?:a|an|the) creature within (\d+) (?:ft\.?|feet) of\b/iu.exec(q):null);
    if(!Number.isSafeInteger(expectedValue)||expectedValue<0||Number(match?.[1])!==expectedValue)errors.push(`attack/${field}`);
    if(field==='range'&&attack.longRange!==undefined&&Number(match?.[2])!==attack.longRange)errors.push('attack/longRange');
  }
  if(attack.longRange!==undefined&&attack.range===undefined)errors.push('attack/longRange');
  if(neutral){
    const reach=/\breach\s+(\d+)\s*(?:ft\.?|feet)/iu.exec(q),range=/\brange\s+(\d+)(?:\s*\/\s*(\d+))?\s*(?:ft\.?|feet)/iu.exec(q);
    const wantReach=neutralChoice==='ranged'?undefined:reach?Number(reach[1]):undefined,wantRange=neutralChoice==='melee'?undefined:range?Number(range[1]):undefined,wantLong=neutralChoice==='melee'?undefined:range?.[2]?Number(range[2]):undefined;
    if(attack.reach!==wantReach||attack.range!==wantRange||attack.longRange!==wantLong||!hybrid&&(combined&&!neutralChoice||attack.reach!==undefined&&attack.range!==undefined))errors.push('attack/neutral-geometry');
  }
  return errors;
}

/** An ordinary single Attack's complete printed target slot. Numbered shared
 * placement context and post-hit rider targets deliberately have another owner. */
export function sourceAttackTargetClause(source:string,attack:NonNullable<SourceOperation['attack']>,target:string):string|undefined{
  if(!keys(attack,['type','toHit','reach','range','longRange'])||typeof target!=='string'||!target.trim())return;
  const headers=sourceOperationClauses(source).filter(clause=>/\b(?:melee|ranged)[^.。]{0,50}\battack\b|(?:近战|远程)[^。]{0,20}攻击/iu.test(clause));
  if(headers.length!==1)return;
  const raw=headers[0]!,q=text(raw);
  if(sourceAttackFactErrors(q,attack).length||new RegExp(`${SOURCE_SAVE_LABEL}|豁免|\\bHit\\s*:|命中\\s*[:：](?!\\s*[+\\-]?\\d)`,'iu').test(q))return;
  const slot=q.replace(/[。.]+$/u,'').split(/[,，;；]/u).at(-1)?.trim();
  if(!slot||/^(?:reach|range|(?:melee|ranged)(?:\s+(?:weapon|spell))?\s+attack|attack\s+roll|[+\-]?\s*\d+\s+to\s+hit)\b|^(?:近战|远程|触及|射程|命中|攻击检定)/iu.test(slot))return;
  return slot===text(target)?raw:undefined;
}

/** Literal qualifications may refer to the same acting/affected subject.
 * They do not authorize borrowing a different operation's recipient. */
function sourceSameRecipientQualification(prefix:string,subject:string,target:string):boolean{
  const value=text(prefix).replace(/^[•·]\s*/u,''),actor=text(subject).replace(/^and\s+/iu,'');
  if(target===value&&/^If you\b/iu.test(value)&&/^you\b/iu.test(actor)&&sourceEventQualifier(value))return true;
  if(target==='you'&&!actor&&/^When you cast this spell$/iu.test(value))return true;
  if(target===value&&/^If you (?:deal|inflict) damage to the target\b/iu.test(value)&&/^the target$/iu.test(actor))return true;
  if(/^it$/iu.test(actor)&&/^(?:the target|the creature)$/iu.test(target)){
    const escaped=target.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    if(new RegExp(`^(?:On a (?:failed|successful) save,\\s*)?${escaped}\\s+(?:gains?|has|is)\\b`,'iu').test(value))return true;
  }
  if(/^(?:it|the creature)$/iu.test(actor)&&[value,value.replace(/^When\s+/iu,'')].includes(target)&&/^When (?:a|the|each) creature\b/iu.test(value)&&sourceEventQualifier(value))return true;
  if(target===value&&/^When you hit (?:a|the|that) target\b/iu.test(value)&&/^the target$/iu.test(actor)&&sourceEventQualifier(value))return true;
  if(/creature['’]s space$/iu.test(target)&&/^the creature\b/iu.test(actor)&&value.includes(target)&&/\b(?:cuts?|passes?) through\s+/iu.test(value))return true;
  if(target===value&&/^On a (?:failed|successful) save$/iu.test(value)&&/^(?:the )?(?:target|creature)\b/iu.test(actor))return true;
  if(/^it$/iu.test(actor)&&/^If (?:the|this|that) (?:target|creature)\b/iu.test(value)&&target===value)return true;
  const attackTarget=/\battack roll\b[^.;。]{0,140}\bagainst\s+([^,.;。]+)$/iu.exec(value)?.[1];
  if(attackTarget===target&&/^(?:the )?(?:target|creature)$/iu.test(actor)&&sourceEventQualifier(value))return true;
  if(/\b(?:creature|target)$/iu.test(target)&&/^(?:the )?(?:creature|target)$/iu.test(actor)){
    const escaped=target.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    if(new RegExp(`^At the (?:start|end) of (?:each of )?${escaped}['’]s (?:later )?turns?$`,'iu').test(value))return true;
  }
  return false;
}

/** A delayed base-only calculator has its own deferred explosion proof.
 * Its numeric creation range cannot become current explosion range, and the
 * variable accumulated total is not invented from the base dice. */
function sourceDeferredBaseArea(source:string,op:Record<string,any>):string|undefined{
  if(op.type!=='damage'||!object(op.proof)||typeof op.proof.target!=='string'||typeof op.proof.aoe!=='string'||!Array.isArray(op.proof.damage)||op.proof.damage.length!==1||typeof op.targetSpecial!=='string')return;
  const q=text(op.proof.target),target=text(op.targetSpecial).replace(/[.。]$/u,''),all=sourceOperationClauses(source).map(text);
  if(!all.includes(q)||text(op.proof.aoe)!==q||!sourceReferencedDamageAtoms(text(op.proof.damage[0]),source).some(atom=>atom.kind==='base'))return;
  const explosion=/^When the spell ends, the ([\p{L}'’-]+) explodes, and (each creature in a \d+-foot-radius Sphere centered on that point) makes a Dexterity saving throw[.。]$/iu.exec(q);
  if(!explosion||target!==q.replace(/[.。]$/u,'')&&target!==explosion[2]!)return;
  const body=sourceSpellHeader(source,all[0]??'')?.body;
  return body&&new RegExp(`\\bat a (?:chosen )?point within range\\b[^.;。]+\\b${explosion[1]}\\b`,'iu').test(body)?q:undefined;
}

/** Initial placement is a literal chosen point or a source-sized square
 * on visible ground; a created creature or control volume is not that roll. */
function sourceInitialAreaPlacement(body:string):boolean{
  return /\bpoint\b[^.;。]*\bwithin range\b/iu.test(body)||/\bfill a \d+-foot square on ground that you can see within range[.。]$/iu.test(body);
}
function sourceAreaContinuation(clause:string,body:string):boolean{
  const duration=/^The ([\p{L}'’-]+) lasts for the duration(?: or until [^.;。]+)?[.。]$/iu.exec(clause),terrain=/^For the duration, these ([\p{L}'’-]+) turn the ground in that area into Difficult Terrain[.。]$/iu.exec(clause);
  const noun=duration?.[1]??terrain?.[1];
  return !!noun&&new RegExp(`\\b${noun}\\b`,'iu').test(body)||/^Its area is (?:Heavily|Lightly) Obscured[.。]$/iu.test(clause);
}

/** A source-bound external origin can exist without a prior primitive.
 * The selected strike point and the granted exhaler's Cone must each bind
 * their own adjacent Save and victims; cloud placement/touch are not ranges. */
function sourceIndependentExternalArea(source:string,op:Record<string,any>,geometry=true):string|undefined{
  if(op.type!=='damage'||geometry&&!object(op.aoe)||!object(op.proof)||typeof op.proof.target!=='string'||typeof op.targetSpecial!=='string'||!Array.isArray(op.proof.damage)||op.proof.damage.length!==1)return;
  const all=sourceOperationClauses(source).map(text),target=text(op.proof.target),at=all.indexOf(target),area=text(op.proof.aoe??''),special=text(op.targetSpecial),damage=text(op.proof.damage[0]);if(at<0||target!==damage)return;
  const point=/^(Each creature within (\d+) feet of that point) makes a \p{L}+ saving throw, taking\b/iu.exec(target);
  if(point&&at>=2&&(!geometry||special===point[1]&&op.aoe.shape==='radius'&&op.aoe.radius===Number(point[2])&&area===target)){
    const chosen=/^When you cast the spell, choose a point you can see under the ([\p{L}'’-]+)[.。]$/iu.exec(all[at-2]!),body=sourceSpellHeaderBody(source);
    if(chosen&&body&&new RegExp(`\\b${chosen[1]} appears at a point within range\\b`,'iu').test(body)&&new RegExp(`^A [\\p{L}'’-]+ [\\p{L}'’-]+ shoots from the ${chosen[1]} to that point[.。]$`,'iu').test(all[at-1]!))return target;
  }
  const actualArea=all[at-1]??'',exhale=/^Until the spell ends, the target can take a Magic action to exhale a (\d+)-foot Cone[.。]$/iu.exec(actualArea),body=sourceSpellHeaderBody(source);
  if(exhale&&body&&/^You touch one willing creature,/iu.test(body)&&/^Each creature in that area makes a \p{L}+ saving throw, taking\b/iu.test(target)&&(!geometry||area===actualArea&&op.aoe.shape==='cone'&&op.aoe.radius===Number(exhale[1])&&special==='Each creature in that area'))return actualArea;
}

/** A later event must be explicitly quoted. Missing range and button
 * names cannot establish reuse of a previously created external area. */
function sourceExistingAreaEvent(source:string,op:Record<string,any>):string|undefined{
  if(op.type!=='damage'||!object(op.proof)||typeof op.proof.target!=='string'||typeof op.targetSpecial!=='string'||!Array.isArray(op.proof.damage)||op.proof.damage.length!==1)return;
  const all=sourceOperationClauses(source).map(text),q=text(op.proof.target),at=all.indexOf(q),target=text(op.targetSpecial);if(at<0)return;
  const deferred=sourceDeferredBaseArea(source,op);if(deferred)return deferred;
  const external=sourceIndependentExternalArea(source,op,false);if(external)return external;
  const repeat=/^A creature (?:also makes that save if it enters the area or ends (?:it|its) turn there|must also make this save when the (Sphere|Cylinder|Cone|Line) moves into its space and when it enters the \1 or ends its turn there)[.。]$/iu.exec(q);
  if(repeat&&target===q.replace(/[.。]$/u,'')&&sourceEventQualifier(q)&&all.indexOf(text(op.proof.damage[0]))<at)return q;
  const entire=target.replace(/[.。]$/u,'')===q.replace(/[.。]$/u,'');
  const lights=/^Whenever the (Cylinder|Sphere|Cone|Line) moves into the space of a creature you can see and whenever a creature you can see enters the \1 or ends its turn there, you can bathe it in one of the ([\p{L}]+)[.。]$/iu.exec(q);
  if(entire&&lights&&op.aoe?.shape===lights[1]!.toLowerCase()&&all.some(clause=>new RegExp(`choose which of these ${lights[2]} shines? on it:`,'iu').test(clause)))return q;
  if(entire&&/^It shatters on impact, with the same effect as a normal casting of the spell[.。]$/iu.test(q)){
    const object=/\bthrow the ([\p{L}'’-]+)\b/iu.exec(all[at-1]??'')?.[1],body=sourceSpellHeader(source,all[0]??'')?.body;
    if(object&&body&&new RegExp(`\\b(?:a|an) (?:[\\p{L}'’-]+ ){0,3}${object} streaks?\\b`,'iu').test(body))return q;
  }
  // A fixed area can pulse after its initial casting without following the
  // Actor. Its actual damage statement supplies both receiver and later time.
  if(/^at the (?:start|end) of each of your turns until the spell ends$/iu.test(target)&&q.replace(/[.。]$/u,'').endsWith(target)
    &&text(op.proof.damage[0])===q&&/\bwhen you cast the spell and at the (?:start|end) of each of your turns\b/iu.test(q))return q;
}

/** Source-proven existing/external-area facts shared across consumers.
 * Reapplication needs a matching initial placement. A standalone delayed
 * base calculator instead proves its own deferred explosion. Neither supplies
 * new coordinates or inherits creation range; the complete rule stays GM-owned. */
export function sourceOperationExistingArea(source:string,operations:readonly SourceOperation[],index:number):{special:string}|undefined{
  const op=operations[index];if(!object(op)||!object(op.proof)||!object(op.aoe)||op.range!==undefined||op.relationship!=='follow-up')return;
  const event=sourceExistingAreaEvent(source,op);if(!event)return;
  const complete=(item:SourceOperation)=>item.sourceText===source.trim()&&item.condition===source.trim()&&Array.isArray(item.damage)&&item.damage.length===1&&item.damage[0]!.relationship==='conditional'&&item.damage[0]!.condition===source.trim();
  if(!complete(op)||!Array.isArray(op.proof.damage)||op.proof.damage.length!==1)return;
  const area=text(String(op.proof.aoe??'')),all=sourceOperationClauses(source).map(text),body=sourceSpellHeader(source,area)?.body??area;
  if(!all.includes(area)||!all.includes(text(op.proof.damage[0]!)))return;
  const external=sourceIndependentExternalArea(source,op);if(external&&operations.filter(item=>object(item)&&object(item.proof)&&JSON.stringify(item.proof.damage)===JSON.stringify(op.proof.damage)).length===1)return{special:external};
  const shape=op.aoe.shape,radius=op.aoe.radius;
  const geometry=shape==='sphere'?sourceRoundAreaRadius(area,'sphere',source)===radius:shape==='cylinder'?sourceRoundAreaRadius(area,'cylinder',source)===radius&&sourceCylinderHeight(body)===op.aoe.height:shape==='radius'?new RegExp(`(?<![\\d.])${radius}-foot-radius circle\\b`,'iu').test(area):shape==='rectangle'?new RegExp(`(?<![\\d.])${radius}-foot square\\b`,'iu').test(body):false;
  if(!geometry)return;
  if(sourceDeferredBaseArea(source,op)&&operations.filter(item=>object(item)&&object(item.proof)&&JSON.stringify(item.proof.damage)===JSON.stringify(op.proof.damage)).length===1)return{special:event};
  const same=(item:SourceOperation)=>object(item)&&object(item.proof)&&JSON.stringify(item.damage)===JSON.stringify(op.damage)&&JSON.stringify(item.proof.damage)===JSON.stringify(op.proof.damage)&&JSON.stringify(item.aoe)===JSON.stringify(op.aoe)&&text(item.proof.aoe??'')===area;
  if(operations.slice(0,index).some(item=>same(item)&&sourceExistingAreaEvent(source,item)===event))return;
  const initial=operations.slice(0,index).filter(item=>same(item)&&complete(item)&&!sourceExistingAreaEvent(source,item)&&item.range!==undefined&&sourceSpellHeaderRange(source,item.proof.range??'')===item.range);
  if(initial.length!==1)return;
  const first=initial[0]!,placement=text(first.proof.range??'');
  if(area!==placement&&!(all.indexOf(area)===all.indexOf(placement)+1&&/centered on that point[.。]$/iu.test(area)))return;
  if(!sourceInitialAreaPlacement(sourceSpellHeader(source,placement)?.body??''))return;
  return{special:event};
}

function sourceNewTargetDamageReplay(source:string,op:Record<string,any>,q:string,target:string):boolean{
  if(op.type!=='damage'||op.relationship!=='follow-up'||op.range!==undefined||!Array.isArray(op.proof?.damage)||op.proof.damage.length!==1)return false;
  const all=sourceOperationClauses(source).map(text),at=all.indexOf(q),damageAt=all.indexOf(text(String(op.proof.damage[0]))),escaped=target.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  return at>damageAt&&damageAt>=0&&/^a different target\b/iu.test(target)
    &&new RegExp(`^If you roll\\b[^,.;。]+, the [\\p{L}'’-]+ leaps to ${escaped}[.。]$`,'iu').test(q)
    &&/^Make an attack roll against the new target, and make a new damage roll[.。]$/iu.test(all[at+1]??'');
}
function sourceNewTargetDamageProjection(source:string,ops:readonly unknown[],index:number,q:string):boolean{
  const op=ops[index];if(!object(op)||!object(op.proof)||typeof op.targetSpecial!=='string'||!sourceNewTargetDamageReplay(source,op,text(String(op.proof.target??'')),text(op.targetSpecial))||text(String(op.proof.damage?.[0]??''))!==q)return false;
  const previous=ops.slice(0,index).filter(other=>object(other)&&other.type==='damage'&&JSON.stringify(other.damage)===JSON.stringify(op.damage)&&JSON.stringify(other.proof.damage)===JSON.stringify(op.proof.damage));
  return previous.length===1&&object(previous[0])&&text(String(previous[0].proof.target??''))!==text(String(op.proof.target??''));
}

/** Explicit target declarations may own a later result or all named
 * choices. The complete declaration, not another numeric or object mention,
 * must bind the same recipient used by this GM result. */
function sourceDeclaredRecipientBound(source:string,op:Record<string,any>,q:string,target:string):boolean{
  const all=sourceOperationClauses(source).map(text),at=all.indexOf(q),ownQuotes=(op.type==='save'?[text(String(op.proof.save??''))]:(op.proof.damage??[]).map(text)) as string[];
  if(at<0||all.lastIndexOf(q)!==at||!ownQuotes.length||!ownQuotes.every(quote=>all.indexOf(quote)>at))return false;
  const escaped=target.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&'),body=sourceSpellHeader(source,q)?.body;
  if(new RegExp(`^At the (?:start|end) of each of its turns, ${escaped} repeats the save[.。]$`,'iu').test(q)&&ownQuotes.every(quote=>all[at+1]===quote&&/^On (?:a )?failed save, the target\b/iu.test(quote)))return true;
  const hit=/^(?:At the start of each of your turns, )?the [\p{L}'’-]+ (?:strikes (a target)|attempts to bite (one enemy)) within \d+ feet of it[.。]$/iu.exec(q);
  if(hit&&target===q.replace(/[.。]$/u,'')){
    const next=at+1+(all[at+1]==='Make a melee spell attack.'?1:0),subject=hit[1]?'the target':'that enemy';
    if(ownQuotes.every(quote=>all[next]===quote&&new RegExp(`^(?:On a hit, )?${subject}\\b`,'iu').test(quote)))return true;
  }
  const retaliation=/^(?:In addition, )?(whenever a creature within \d+ feet of you hits you with a melee attack roll), [^.;。]+[.。]$/iu.exec(q);
  if(retaliation&&target===retaliation[1]&&sourceEventQualifier(retaliation[1]!)&&ownQuotes.every(quote=>all[at+1]===quote&&/^The attacker takes\b/iu.test(quote)))return true;
  const direct=body&&!new RegExp(`\\b${SOURCE_NEGATION_TOKEN}\\b`,'iu').test(body)&&(new RegExp(`^You\\b[^.;。]+\\b(?:target|at|of|toward|towards)\\s+${escaped}[.。]$`,'iu').test(body)||new RegExp(`^${escaped}\\s+hears?\\b`,'iu').test(body));
  if(direct&&ownQuotes.every(quote=>/^(?:On (?:a |each )?(?:failed save|successful save|hit),\s*)?(?:the target|it)\b/iu.test(quote)))return true;
  const selection=new RegExp(`^For ${escaped}, choose which of these [^:。]+ shines? on it:`,'iu').test(q);
  const effect=new RegExp(`^${escaped}\\s+when\\b[^.;。]+\\bis targeted by its effect\\b`,'iu').test(q);
  if((selection||effect)&&ownQuotes.every(quote=>/^(?:The|Each) target\b/iu.test(quote)))return true;
  const layered=new RegExp(`^When ${escaped}, it does so\\b`,'iu').test(q)&&/\bEach [^.;。]+ forces the creature to make a [^.;。]+saving throw\b[^.;。]+\btable[.。]$/iu.test(all[at+1]??'');
  return layered&&ownQuotes.every(quote=>/^Failed Save\s*:/iu.test(quote));
}

/** Shared spell metadata owns the direct initial recipient or an explicitly
 * bound initial area. Creating another entity/control region does not lend
 * that placement distance or outer geometry to its later damage recipients. */
function sourceSpellHeaderOperationOwner(source:string,op:Record<string,any>):boolean{
  if(!object(op.proof)||typeof op.targetSpecial!=='string'||typeof op.proof.target!=='string'||sourceExistingAreaEvent(source,op))return false;
  const all=sourceOperationClauses(source).map(text),first=all[0]??'',header=sourceSpellHeader(source,first);if(!header)return false;
  const recipient=text(op.targetSpecial),target=text(op.proof.target);
  if(target===first&&sourceDeclaredRecipientBound(source,op,first,recipient))return true;
  const directRay=/\b(?:hurl|launch|unleash|blast|shoot|streaks)\b[^.;。]*\b(?:at|towards?|of)\s+(?:a|one|the) (?:target|creature)\b[^.;。]*\bwithin range\b/iu.test(header.body),ownQuotes=Array.isArray(op.proof.damage)?op.proof.damage.map(text):[];
  if(directRay&&ownQuotes.length===1&&Array.isArray(op.damage)&&op.damage.length===1){
    const quote=ownQuotes[0]!,at=all.indexOf(quote),atoms=sourceDamageAtoms(quote,source),part=op.damage[0],initial=atoms[0];
    const intermediates=all.slice(1,at),linked=intermediates.every(clause=>/^Make a ranged spell attack against the target[.。]$/iu.test(clause)||/^The target can be a creature,/iu.test(clause)||/^A creature targeted by this spell makes a \p{L}+ saving throw[.。]$/iu.test(clause));
    if(at>0&&initial&&formula(part.formula)===initial.formula&&JSON.stringify(part.types??[part.type])===JSON.stringify(initial.types)&&linked&&/^(?:On a (?:hit|failed save), )?The target\b/iu.test(quote)&&(target===quote||intermediates.includes(target)))return true;
  }

  if(!object(op.aoe)||typeof op.proof.aoe!=='string'||!sourceInitialAreaPlacement(header.body))return false;
  const area=text(op.proof.aoe),areaAt=all.indexOf(area),targetAt=all.indexOf(target);
  if(areaAt!==0&&!(areaAt===1&&/centered on that point[.。]$/iu.test(area)))return false;
  const own=(op.type==='save'?[op.proof.save]:op.proof.damage??[]).map((quote:string)=>text(quote));
  if(target===area&&own.includes(area))return true;
  // A same-area recipient immediately after its creation may introduce named
  // result choices. The quote still names the actual area rather than one of
  // its later subregions, creatures or created objects.
  const shape=String(op.aoe.shape),sameArea=/\bin that area\b/iu.test(recipient)
    ||['cylinder','sphere','cone','line','cube'].includes(shape)&&new RegExp(`\\bin the ${shape}\\b`,'iu').test(recipient);
  if(targetAt>areaAt&&sameArea&&all.slice(areaAt+1,targetAt).every(clause=>sourceAreaContinuation(clause,header.body)))return true;
  return /\bin the area when you cast the spell\b/iu.test(recipient)&&own.includes(target);
}

/** Recipient proof is local to the current primitive. A complete sentence
 * may contain several subjects; its neighboring Save/Damage is no target
 * evidence for this roll. This keeps literal qualifications, not a target NLP
 * model or an inferred entity type. */
function sourceTargetRecipientBound(source:string,op:Record<string,any>,q:string,damageSpans:Array<{quote:string;start:number;end:number}>):boolean{
  const target=text(op.targetSpecial),inside=(start:number,end:number,head?:string)=>{
    const part=q.slice(start,end);return part.includes(target)&&(!head||new RegExp(`(?<![\\p{L}\\p{N}])${head.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')}(?![\\p{L}\\p{N}])`,'iu').test(target));
  };
  if(op.type==='attack')return q.includes(target);
  const definition=op.type==='save'?sourceBoundSaveAtoms(source,text(String(op.proof.save??''))).find(atom=>atom.context?.quote===q):undefined;
  const saves=(definition?.context?[{...definition,start:definition.context.start,end:definition.context.end}]:sourceTargetSaveAtoms(q)).map(atom=>({...atom,kind:'save' as const}));
  const damage=sourceDamageAtoms(q,source).flatMap(atom=>sourceDamageAtomSpans(q,{...atom,type:atom.types[0]!},source)).map(atom=>({...atom,kind:'damage' as const}));
  const markers=[...new Map([...saves,...damage].map(atom=>[atom.start+':'+atom.end,atom])).values()].sort((a,b)=>a.start-b.start);
  const own=op.type==='save'?saves.filter(atom=>atom.dc===op.save?.dc&&JSON.stringify(atom.abilities)===JSON.stringify(op.save?.abilities)&&atom.choice===op.save?.choice):damageSpans.filter(span=>span.quote===q);
  if(!own.length){
    const selected=op.type==='save'?sourceVisibilitySelection(source,text(String(op.proof.save??''))):undefined;
    if(selected&&selected.quote===q&&selected.target===target)return true;
    if(sourceExistingAreaEvent(source,op))return true;
    if(sourceNewTargetDamageReplay(source,op,q,target))return true;
    if(sourceDeclaredRecipientBound(source,op,q,target))return true;
    const all=sourceOperationClauses(source).map(text),at=all.indexOf(q),resultQuotes=op.type==='damage'?(op.proof.damage??[]).map(text):[];
    const scopes=sourceResultScopes(source),owner=scopes.find(scope=>text(scope.clause)===q)?.operation;
    if(op.type==='damage'&&saves.length===1&&at>=0&&resultQuotes.length&&resultQuotes.every((quote:string)=>all.indexOf(quote)>=at&&scopes.some(scope=>text(scope.clause)===quote&&scope.operation===owner)&&(/^(?:On (?:a )?(?:failed|successful) save|Failure|Success|the target|the creature|a creature|it)\b/iu.test(quote)||sourceReferencedDamageAtoms(quote,source).some(atom=>atom.kind==='base'))))return sourceTargetRecipientBound(source,{...op,type:'save',save:saves[0]},q,[]);
    const scaling=sourceScalingOperation(source,op);
    if(scaling?.row.kind==='per-item'&&scaling.base.quote===q)return sourceTargetRecipientBound(source,{...op,type:'save',save:scaling.base.save,proof:{...op.proof,save:q}},q,[]);
    // A separate literal Target directive can introduce "The target" in the
    // immediately next operation sentence. It cannot lend a prior sibling's
    // receiver to a different subject or skip an intervening rule.
    const ownQuotes=op.type==='save'?[text(String(op.proof.save??''))]:(op.proof.damage??[]).map(text);
    const attackRecipient=/\bmake\s+(?:a|an)\s+(?:melee|ranged)\s+attack\s+against\s+([^,.;。]+),\s+you can\b[^.;。]*\bthe target\b/iu.exec(q);
    if(at>=0&&all.lastIndexOf(q)===at&&attackRecipient&&text(attackRecipient[1]!)===target&&!new RegExp(`\\b${SOURCE_NEGATION_TOKEN}\\b`,'iu').test(q.slice(0,attackRecipient.index+attackRecipient[0].length))&&ownQuotes.length===1&&all[at+1]===ownQuotes[0]&&/^If (?:the [\p{L}'’-]+|it) hits, the target must\b/iu.test(ownQuotes[0]!))return true;
    const directive=/^Target\s+/iu.exec(q)??/\byou can\b[^.;。]{0,160}\btarget\s+(?=(?:one|a|an|each)\b)/iu.exec(q);
    return at>=0&&all.lastIndexOf(q)===at&&!!directive&&!new RegExp(`\\b${SOURCE_NEGATION_TOKEN}\\b`,'iu').test(q.slice(0,directive.index+directive[0].length))&&q.slice(directive.index+directive[0].length).includes(target)&&ownQuotes.length>0&&ownQuotes.every((quote:string)=>all[at+1]===quote&&/(?:^|\band\s+)the target\s+(?:must|makes?|takes?|suffers?|receives?)\b/iu.test(quote));
  }
  const cuts:number[]=[];
  for(let index=1;index<markers.length;index++){
    const previous=markers[index-1]!,next=markers[index]!,between=q.slice(previous.end,next.start);
    for(const connector of between.matchAll(/(?:[,;，；]\s*(?:\b(?:and|or|but|then|while|whereas)\s+)?|\s*\b(?:and|or|but|then|while|whereas)\s+)/giu)){
      // The unknown Save marker ends before its derived (DC ...) formula.
      // Formula operands joined by AND are not another affected subject.
      if(previous.kind==='save'&&/^\s*[(（]\s*DC\b[^)）]*$/iu.test(q.slice(previous.end,previous.end+connector.index!)))continue;
      const after=between.slice(connector.index!+connector[0].length);
      const subject=next.kind==='save'?/^(?!(?:must|make|makes|succeed|taking|take|takes)\b)[^.;。]{1,180}\b(?:must\s+(?:make|succeed\s+on)|makes?|needs?\s+to\s+make)\b/iu.test(after):/^(?!(?:takes?|deals?|suffers?|receives?|taking|has|have)\b)[^.;。]{1,180}\b(?:takes?|deals?|suffers?|receives?)\b/iu.test(after);
      const directObject=next.kind==='damage'&&/^\s*(?:to|against)\s+/iu.test(q.slice(next.end))&&/^(?:an?\s+)?(?:(?:extra|additional)\s+)?(?:\d+\s*[(（])?\s*$/iu.test(after);
      if(subject||directObject||next.kind==='save'&&!after.trim())cuts.push(previous.end+connector.index!);
    }
  }
  const head=(part:string)=>/^(?:(?:the|a|an|any|each|every|all|this|that)\s+)?([\p{L}'’-]+)/iu.exec(part.trim().replace(/^[,;，；]\s*/u,'').replace(/^(?:and|or|but|then|while|whereas)\s+/iu,''))?.[1];
  return own.every(atom=>{
    const left=Math.max(0,...cuts.filter(cut=>cut<atom.start)),right=Math.min(q.length,...cuts.filter(cut=>cut>atom.start));
    if(target.replace(/[.。]$/u,'')===q.replace(/[.。]$/u,'')&&left===0&&right===q.length)return true; // existing whole-rule GM qualifier
    if(op.type==='save'){
      const before=q.slice(left,atom.start),forced=/\bforc(?:e|es|ing)\s+(.+?)\s+to\s+(?:make|succeed on)\s+(?:an?\s+)?$/iu.exec(before);
      if(forced&&!new RegExp(`\\b${SOURCE_NEGATION_TOKEN}\\b`,'iu').test(before.slice(0,forced.index))){
        if(text(forced[1]!)===target)return true;
        const prefix=text(before.slice(0,forced.index)),escaped=target.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
        return /^that creature$/iu.test(forced[1]!)&&/^a creature\b/iu.test(target)&&new RegExp(`^Whenever ${escaped}, you can$`,'iu').test(prefix)&&sourceEventQualifier(prefix);
      }
      const commands=[...before.matchAll(/\b(?:must\s+(?:make|succeed\s+on)|makes?|needs?\s+to\s+make)\b/giu)],command=commands.at(-1);
      if(!command&&!/^(?:DC|难度等级)/iu.test(q.slice(atom.start,atom.end)))return inside(atom.end,right,head(q.slice(atom.end,right)));
      if(command){
        const prefix=before.slice(0,command.index),comma=Math.max(prefix.lastIndexOf(','),prefix.lastIndexOf('，')),subject=prefix.slice(comma+1).trim();
        if(sourceSameRecipientQualification(prefix.slice(0,comma),subject,target))return true;
        return inside(left+comma+1,left+command.index!,head(subject));
      }
      return inside(left,right);
    }
    const after=q.slice(atom.end,right),object=/^\s*(?:to|against)\s+/iu.exec(after);
    if(object){
      if(inside(atom.end+object[0].length,right,head(after.slice(object[0].length))))return true;
      return /^at the (?:start|end) of each of your turns until the spell ends$/iu.test(target)&&text(after).replace(/[.。]$/u,'').endsWith(target);
    }
    const beforeAtom=q.slice(left,atom.start),resultComma=beforeAtom.lastIndexOf(','),trim=(value:string)=>text(value).replace(/[.。]$/u,'');
    const qualifiedSpans:[[number,number],[number,number],[number,number]]=[[left,atom.end],[atom.start,right],[left+resultComma+1,right]];
    if(qualifiedSpans.some(([start,end])=>target===trim(q.slice(start,end))&&markers.filter(marker=>marker.start>=start&&marker.end<=end).length===1
      &&(start<atom.start||sourceConditionQualifier(q.slice(atom.end,end)))))return true;
    const before=q.slice(left,atom.start),resultQualification=/^\s+(if it is [^.;。]+)[.。]?$/iu.exec(after);
    if(resultQualification&&target===text(resultQualification[1]!)&&own.length===1&&damage.length===1&&/^The target must succeed on\b/iu.test(before)&&new RegExp(SOURCE_SAVE_LABEL,'iu').test(before)&&/\bor take\s+(?:\d+\s*[(（])?\s*$/iu.test(before))return true;
    const predicates=[...before.matchAll(/\b(?:takes?|suffers?|receives?|deals?)\b/giu)],predicate=predicates.at(-1);
    if(!predicate){
      const inherited=saves.filter(save=>save.end<atom.start);
      if(inherited.length===1&&/\btaking\s+(?:\d+\s*[(（])?\s*$/iu.test(before))return sourceTargetRecipientBound(source,{...op,type:'save',save:inherited[0]},q,[]);
      return false;
    }
    if(/^deals?$/iu.test(predicate[0]))return false;
    const prefix=before.slice(0,predicate.index),comma=Math.max(prefix.lastIndexOf(','),prefix.lastIndexOf('，')),subject=text(prefix.slice(comma+1));
    if(/^you and (?:any|each|one|the) creature\b/iu.test(subject))return target===subject;
    if(sourceSameRecipientQualification(prefix.slice(0,comma),prefix.slice(comma+1),target))return true;
    return inside(left+comma+1,left+predicate.index!,head(prefix.slice(comma+1)));
  });
}

/** A manual calculator without range is not automatically self-centred.
 * Only an already-bound explicit YOU/YOURSELF receiver or its own You result
 * can prove self. A source actor mentioned in another target's qualification
 * is deliberately insufficient. Unknown receivers remain unspecified. */
export function sourceOperationSelfTarget(source:string,op:SourceOperation):boolean{
  if(!['save','damage'].includes(op.type)||typeof op.targetSpecial!=='string'||typeof op.proof?.target!=='string')return false;
  const target=text(op.targetSpecial),q=text(op.proof.target);if(!sourceOperationClauses(source).some(clause=>text(clause)===q))return false;
  const spans=(op.damage??[]).flatMap((part,index)=>text(op.proof.damage?.[index]??'')===q?sourceDamageAtomSpans(q,part,source).map(span=>({quote:q,...span})):[]);
  if(!sourceTargetRecipientBound(source,op,q,spans))return false;
  if(/^(?:you|yourself)$/iu.test(target))return true;
  if(op.type==='save'){
    if(/^When you cast this spell, make\b/iu.test(q)&&target===q)return true;
    const atom=sourceTargetSaveAtoms(q).find(atom=>atom.dc===op.save?.dc&&JSON.stringify(atom.abilities)===JSON.stringify(op.save?.abilities));if(!atom)return false;
    const before=q.slice(0,atom.start),forced=/\bforc(?:e|es|ing)\s+(.+?)\s+to\s+(?:make|succeed on)\s+(?:an?\s+)?$/iu.exec(before);
    if(forced)return /^(?:you|yourself)$/iu.test(forced[1]!);
    const command=[...before.matchAll(/\b(?:must\s+(?:make|succeed\s+on)|make|makes)\b/giu)].at(-1);if(!command)return false;
    const prefix=before.slice(0,command.index),comma=Math.max(prefix.lastIndexOf(','),prefix.lastIndexOf('，')),subject=prefix.slice(comma+1).trim();
    return /^(?:you|you\s+(?:take|suffer|receive)\b[^.;。]+\band)$/iu.test(subject)&&(target===q||target===text(prefix.slice(0,comma)));
  }
  if(spans.length!==1)return false;
  const before=q.slice(0,spans[0]!.start),predicate=[...before.matchAll(/\b(?:takes?|suffers?|receives?)\b/giu)].at(-1);if(!predicate)return false;
  const prefix=before.slice(0,predicate.index),subject=prefix.slice(Math.max(prefix.lastIndexOf(','),prefix.lastIndexOf('，'))+1).trim();
  return /^you$/iu.test(subject)&&(target===q||target===text(q.slice(q.lastIndexOf(',',spans[0]!.start)+1)).replace(/[.。]$/u,'')||/^If you\b/iu.test(target)&&text(prefix.slice(0,prefix.lastIndexOf(',')))===target);
}

/** Area origin is independent of the affected recipient. Keep explicit
 * actor centres and the standard first monster Save-header Cone/Line form;
 * a foreign emitter, placed point or an unproved centre is not Actor self. */
export function sourceOperationSelfArea(source:string,op:SourceOperation,actorName?:string|readonly string[]):boolean{
  if(!op.aoe||typeof op.proof?.aoe!=='string')return false;
  const all=sourceOperationClauses(source).map(text),q=text(op.proof.aoe),at=all.indexOf(q);if(at<0)return false;
  // CHM 2024 prints the emitter before its Emanation distance. Bind that
  // exact subject; a target/ally's area cannot establish Actor Self range.
  const chineseOrigin=/源自\s*([^，,。.;；：:\d]+?)\s*(?:的\s*)?\d+\s*尺\s*(?:的\s*)?光环/u.exec(q)?.[1]
    ??/(?:环绕|围绕)(?:在)?\s*([^，,。.;；：:\d]+?)\s*(?:的\s*)?周围\s*\d+\s*尺\s*(?:的\s*)?光环/u.exec(q)?.[1];
  if(chineseOrigin&&nativeAreaShape('sphere',op.aoe.radius,q)==='radius')return /^(?:你|你自身|自身)$/u.test(chineseOrigin.trim())||sourceActorNameMatches(chineseOrigin,actorName);
  const origin=/\b(?:originating|extend(?:ing|s)?) from\s+(.+?)(?=\s+(?:at|when|while|that|who|which|to|must|makes?|takes?|has|unless|and)\b|[(),.;。]|$)/iu.exec(q)?.[1]
    ??/\bwithin\s+\d+\s+(?:feet|ft\.?)\s+of\s+(.+?)(?=\s+(?:at|when|while|that|who|which|to|must|makes?|takes?|has|unless|and)\b|[(),.;。]|$)/iu.exec(q)?.[1];
  if(origin){
    if(/^(?:you|yourself)$/iu.test(origin.trim())||sourceActorNameMatches(origin,actorName))return true;
    // "it" inherits only the explicit emitter in this very sentence. A
    // nearby Actor name, foreign emitter or preceding sentence is not proof.
    const emitter=/^Clouds? of [^,.;。]+?\s+(?:hiss|hisses|emanate|emanates|pour|pours)\s+from\s+(.+?),\s+forcing (?:each|every|any) creature within \d+ (?:feet|ft\.?) of it to make\b/iu.exec(q)?.[1];
    return /^it$/iu.test(origin.trim())&&!!emitter&&sourceActorNameMatches(emitter,actorName);
  }
  const emitted=/^(?:the\s+)?(.+?)\s+(?:emits?|exhales?|breathes?|releases?)\s+[^.;。]*\b(?:Cone|Line|Emanation)\b/iu.exec(q)?.[1];
  if(emitted&&(/^(?:you|yourself)$/iu.test(emitted)||sourceActorNameMatches(emitted,actorName)))return true;
  // An explicitly controlled instrument and a directly created energy Cone
  // originate at the using Actor, rather than at a named external point.
  if(op.aoe.shape==='cone'&&(/\bYou can take a Magic action to (?:blow|sound) the [\p{L}'’-]+, which emits\s+[^.;。]*\bCone\b/iu.test(q)||/^You (?:also )?create a \d+-foot Cone of [\p{L} -]+[.。]$/iu.test(q)))return true;
  if(op.type!=='save'||!op.save||!['cone','line'].includes(op.aoe.shape)||text(op.proof.save??'')!==q||!actorName)return false;
  const title=(value:string)=>{
    const bare=value.replace(/[.。]$/u,'').replace(/\s*[（(](?:Recharge|Recharges|Costs?|\d+\s*\/\s*(?:Day|天|日))[^)）]*[)）]$/iu,'').trim();
    return /^[\p{Lu}\p{Lt}][\p{L}'’ -]{0,79}$/u.test(bare)&&bare.split(/\s+/u).every(word=>/^[\p{Lu}\p{Lt}]/u.test(word)||/^(?:of|the|and|or|with|a|an)$/u.test(word));
  };
  const raw=sourceOperationClauses(source)[at]!,lines=raw.split(/\r?\n/u),prefix=lines.length>1&&title(text(lines[0]!))?text(lines[0]!):undefined;
  const header=prefix?q.slice(prefix.length).trim():q;
  const atom=sourceSaveAtoms(header).find(atom=>atom.start===0&&atom.dc===op.save!.dc&&JSON.stringify(atom.abilities)===JSON.stringify(op.save!.abilities));
  if(!atom||all.slice(0,at).some(clause=>!title(clause)))return false;
  return all.findIndex(clause=>sourceSaveAtoms(clause).length||sourceTargetSaveAtoms(clause).length||sourceAttackBonuses(clause).length||sourceDamageAtoms(clause,source).length)===at;
}

/** Native selector kind from an already source-bound explicit recipient.
 * Inspect its leading noun(s), never object/creature words in a later
 * qualification. Unknown heads keep the caller's existing conservative
 * default; this is not general entity classification or a target schema. */
export function sourceOperationTargetType(source:string,op:SourceOperation):'creature'|'object'|'creatureOrObject'|undefined{
  if(typeof op.targetSpecial!=='string'||typeof op.proof?.target!=='string')return;
  const target=text(op.targetSpecial),q=text(op.proof.target);
  if(!sourceOperationClauses(source).some(clause=>text(clause)===q))return;
  const spans=(op.damage??[]).flatMap((part,index)=>text(op.proof.damage?.[index]??'')===q?sourceDamageAtomSpans(q,part,source).map(span=>({quote:q,...span})):[]);
  if(!sourceTargetRecipientBound(source,op,q,spans))return;
  let recipient=target;
  if(/^at the (?:start|end) of each of your turns until the spell ends$/iu.test(target)&&spans.length===1){
    const explicit=/^\s*(?:to|against)\s+(.+)$/iu.exec(q.slice(spans[0]!.end))?.[1];if(explicit)recipient=text(explicit);
  }
  const first=/^(.*?)\b(creatures?|objects?|structures?)\b/iu.exec(recipient);if(!first)return;
  const prefix=first[1]!.trim(),rest=recipient.slice(first[0].length);
  if(prefix.split(/\s+/u).filter(Boolean).length>4||/[^\p{L}\s'’-]/u.test(prefix)||/\b(?:if|when|while|after|before|that|which|whose|who|with|within|in|on|from|of|for|carrying|holding|wearing|holds?|carries|wears|has|have|can|cannot|must|target|takes?|makes?|hits?|no|not)\b/iu.test(prefix)||/^['’]s\b/iu.test(rest))return;
  const kind=(noun:string)=>/^creatures?$/iu.test(noun)?'creature':'object',one=kind(first[2]!);
  const second=/^\s+(?:and|or)\s+(?:(?:a|an|one|the|each|every|any|all)\s+)?(creatures?|objects?|structures?)\b/iu.exec(rest);
  return second&&kind(second[1]!)!==one?'creatureOrObject':one;
}

/** Source-bound singular recipient count. Qualifiers remain the complete
 * special rule; a capacity elsewhere or an area set is not a target count. */
export function sourceOperationTargetCount(source:string,op:SourceOperation):'1'|undefined{
  if(op.aoe||typeof op.targetSpecial!=='string'||typeof op.proof?.target!=='string')return;
  const target=text(op.targetSpecial),quote=text(op.proof.target);
  if(!sourceOperationClauses(source).some(clause=>text(clause)===quote)||!sourceTargetRecipientBound(source,op,quote,[]))return;
  if(/^(?:one|a|an|1) (?:creature|target|humanoid|object|structure)\b/iu.test(target)
    &&!/^.+?\b(?:and|or)\s+(?:two|three|four|five|\d+)\s+(?:creatures|targets|humanoids|objects|structures)\b/iu.test(target))return '1';
}

/** A source-explicit fail-to-succeed rule and its conditional daily quota.
 * This is a native counter only; it does not automatically choose a success. */
export function sourceLegendaryLairResistance(name:string,description:string,actorNames:readonly string[]):{max:number;lairMax:number}|undefined{
  const quota=/\((\d+)\/Day, or (\d+)\/Day in Lair\)/iu.exec(name);
  const body=sourceOperationClauses(description).map(text).find(clause=>/^If .+ fails a saving throw, it can choose to succeed instead[.]?$/iu.test(clause));
  const owner=body&&/^If (.+) fails a saving throw,/iu.exec(body)?.[1];
  if(!quota||!owner||!sourceActorNameMatches(owner,actorNames))return;
  const max=Number(quota[1]),lairMax=Number(quota[2]);
  return Number.isSafeInteger(max)&&max>0&&lairMax===max+1?{max,lairMax}:undefined;
}

/** Atom-level source entailment, intentionally independent of whole-sentence
 * attack templates. It rejects unknown executable fields, number borrowing,
 * changed conditions and unproven alternatives. Remaining consequences are
 * always GM-owned and cannot create effects or automatic follow-ups. */
export function sourceOperationErrors(source: string, value: unknown,contexts:readonly string[]=[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value) || !value.length || value.length > 16) return ['operations'];
  if(value.some(op=>object(op)&&object(op.proof)&&op.proof.upgrade!==undefined))return fixedDamageUpgradeErrors(source,value,contexts,(base,ops)=>sourceOperationErrors(base,ops).length===0);
  const healing=sourceHealingOperations(source);
  if(healing||value.some(op=>object(op)&&op.type==='heal'))return sourceHealingOperationErrors(source,value,healing);
  const ids = new Set<string>();
  const operationProofs=new Set<string>();
  const damageOccurrences=new Map<string,number>();
  const saveOccurrences=new Map<string,number>();
  const clauses=sourceOperationClauses(source);
  // Conditional damage can have no preceding Attack/Save (for example,
  // environmental contact or a collision before another target's Save).
  // Its independent
  // GM button remains a follow-up to that preserved trigger, never a primary
  // attack or an automatically executed consequence. All normal damage,
  // condition, inventory and source-owner checks below still apply.
  const independentGmDamage=value.slice(0,1).every(op=>object(op)&&op.type==='damage'&&op.relationship==='follow-up'
    &&Array.isArray(op.damage)&&op.damage.length>0&&object(op.proof)&&Array.isArray(op.proof.damage)
    &&op.damage.every((part:unknown,index:number)=>object(part)&&['conditional','replacement'].includes(part.relationship)
      &&typeof op.proof.damage[index]==='string'&&typeof part.formula==='string'
      &&(part.types===undefined?typeof part.type==='string':Array.isArray(part.types)&&part.types.every((type:unknown)=>typeof type==='string'))
      &&sourceIndependentDamageCondition(source,text(op.proof.damage[index]),{formula:formula(part.formula),types:part.types??[part.type]})));
  const independentGmSave=value.slice(0,1).every(op=>{
    if(!object(op)||op.type!=='save'||op.relationship!=='follow-up'||!object(op.proof)||typeof op.proof.save!=='string'||!object(op.save))return false;
    const q=text(op.proof.save),atom=sourceBoundSaveAtoms(source,q).find(atom=>atom.dc===op.save.dc&&JSON.stringify(atom.abilities)===JSON.stringify(op.save.abilities)&&atom.choice===op.save.choice);
    return!!atom&&sourceIndependentSaveCondition(source,q,q.slice(0,atom.start));
  });
  const independentGmAttack=value.slice(0,1).every(op=>object(op)&&op.type==='attack'&&op.relationship==='follow-up'&&object(op.proof)&&typeof op.proof.attack==='string'&&sourceIndependentAttackCondition(source,text(op.proof.attack)));
  let previousClause=-1;
  for (const [index, op] of value.entries()) {
    const fail = (field: string) => errors.push(`${index}/${field}`);
    const targetDamageSpans:Array<{quote:string;start:number;end:number}>=[];
    const scaling=object(op)?sourceScalingOperation(source,op):undefined;
    if (!keys(op,['id','name','type','relationship','condition','sourceText','evidence','attack','save','damage','damageAdjustment','range','aoe','targetSpecial','failureStatuses','proof'])) { fail('shape'); continue; }
    if(op.damageAdjustment!==undefined&&!sourceDamageAdjustmentMatches(op))fail('damage-adjustment');
    if(op.type==='attack'&&Array.isArray(op.proof?.damage)&&op.proof.damage.some((quote:unknown)=>typeof quote==='string'&&sourceBloodiedHalfDamage(quote))&&!sourceDamageAdjustmentMatches(op))fail('damage-adjustment/omitted');
    if(isNeutralSourceAttack(op)&&(op.type!=='attack'||op.aoe!==undefined||op.range!==undefined||op.healing!==undefined||op.save!==undefined||op.failureStatuses?.length))fail('attack/neutral-combination');
    if (typeof op.id!=='string'||!/^[-a-zA-Z0-9]{1,64}$/u.test(op.id)||ids.has(op.id)) fail('id');
    ids.add(op.id);
    if (typeof op.name!=='string'||!op.name.trim()||op.name.length>160) fail('name');
    const delayedOnly=index===0&&op.relationship==='follow-up'&&/\bat the (?:start|end)\b|回合(?:开始|结束)|在[^。]+(?:开始|结束)时/iu.test(source);
    if (!['primary','follow-up','alternative'].includes(op.relationship)||index===0&&op.relationship==='follow-up'&&!delayedOnly&&!independentGmDamage&&!independentGmSave&&!independentGmAttack||index>0&&op.relationship==='primary') fail('relationship');
    if (typeof op.sourceText!=='string'||op.sourceText!==source.trim()) { fail('sourceText'); continue; }
    if (op.condition!==undefined&&(typeof op.condition!=='string'||!op.condition.trim()||!source.includes(op.condition))) fail('condition');
    if (op.relationship==='follow-up'&&op.condition!==source.trim()) fail('condition');
    if (op.evidence!==undefined&&(!keys(op.evidence,['start','end','quote'])||op.evidence.quote!==op.sourceText||!Number.isSafeInteger(op.evidence.start)||!Number.isSafeInteger(op.evidence.end)||op.evidence.start<0||op.evidence.end-op.evidence.start!==op.sourceText.length)) fail('evidence');
    if (!keys(op.proof,['attack','save','damage','range','aoe','target'])) { fail('proof'); continue; }
    if(sourceExistingAreaEvent(source,op)&&!sourceOperationExistingArea(source,value as SourceOperation[],index))fail('aoe/existing-area-proof');
    const firstProof=op.type==='attack'?op.proof.attack:op.type==='save'?op.proof.save:Array.isArray(op.proof.damage)?op.proof.damage[0]:undefined;
    let clauseIndex=clauses.findIndex(clause=>text(clause)===text(String(firstProof??'')));
    if(op.type==='save')clauseIndex=sourceSaveClauseIndex(clauses,op,saveOccurrences);
    else if(op.type==='damage'&&Array.isArray(op.damage)&&object(op.damage[0])&&typeof op.damage[0].formula==='string'){
      const q=text(String(firstProof??'')),part=op.damage[0],ordinal=damageOccurrences.get(JSON.stringify([q,formula(part.formula),part.types??[part.type]]))??0;
      clauseIndex=sourceDamageOccurrence(clauses,q,part as any,ordinal).clauseIndex;
    }
    if(op.type==='attack'&&value[index-1]?.type==='attack'&&sourceLeverTableChoice(source,previousClause,clauseIndex)&&op.relationship!=='alternative')fail('relationship/table-choice-required');
    if(op.relationship==='alternative'&&!sourceAlternativeChoice(op,value[index-1],text(String(firstProof??'')),source,previousClause,clauseIndex))fail('relationship/unproven-alternative');
    if(clauseIndex<previousClause)fail('source-order');previousClause=clauseIndex;
    const quote = (field: string, q: unknown) => {
      if (typeof q!=='string'||!q.trim()||!op.sourceText.includes(q)) { fail(`proof/${field}`); return ''; }
      if(!clauses.some(clause=>text(clause)===text(q))) {fail(`proof/${field}/clause-boundary`);return'';}
      return text(q);
    };
    if (op.type==='attack') {
      if(!keys(op.attack,['type','toHit','reach','range','longRange'])) { fail('attack'); continue; }
      const q=quote('attack',op.proof.attack), attack=op.attack;
      const choice=sourceAttackBonusChoice(q),provenAlternative=op.relationship==='alternative'&&sourceAlternativeChoice(op,value[index-1],q,source);
      const signature='attack:'+q+(provenAlternative?':alternative:'+JSON.stringify([attack,op.damage]):'');if(operationProofs.has(signature))fail('duplicate-operation');operationProofs.add(signature);
      if(choice&&!provenAlternative&&(op.relationship!=='primary'||op.condition!==undefined))fail('attack/conditional-choice');
      const closedRangeChoice=sourceSameClauseAttackChoice(op,value[index-1],q,source)==='range'
        ||object(value[index+1])&&sourceSameClauseAttackChoice(value[index+1],op,q,source)==='range';
      const neutralChoice=isNeutralSourceAttack(op)&&closedRangeChoice?attack.type as 'melee'|'ranged':undefined;
      for(const error of sourceAttackFactErrors(q,attack,!!choice&&provenAlternative,neutralChoice))fail(error);
      if(op.save!==undefined)fail('save');
    } else if(op.type==='save') {
      if(!keys(op.save,['dc','abilities','choice','outcome'])) { fail('save'); continue; }
      const q=quote('save',op.proof.save), save=op.save;
      const signature='save:'+clauseIndex+':'+sourceSaveIdentity(q,save)+(scaling?':profile:'+scaling.quote+':'+scaling.row.from:'');if(operationProofs.has(signature))fail('duplicate-operation');operationProofs.add(signature);
      const atoms=sourceBoundSaveAtoms(source,q),saveProof=q+' '+(atoms[0]?.context?.quote??'');
      if(atoms.some(atom=>atom.context)&&(op.relationship!=='follow-up'||op.condition!==source.trim()))fail('save/conditional-definition');
      if(!Number.isSafeInteger(save.dc)||save.dc<1||!atoms.some(atom=>atom.dc===save.dc&&JSON.stringify(atom.abilities)===JSON.stringify(save.abilities)&&atom.choice===save.choice)||!new RegExp(`${SOURCE_SAVE_LABEL}|豁免`,'iu').test(saveProof)||new RegExp(`\\b(?:no|not|cannot)\\s+(?:${SOURCE_SAVE_LABEL}|save\\b)|无需豁免|不能豁免`,'iu').test(q))fail('save/dc-or-ability');
      if(!Array.isArray(save.abilities)||!save.abilities.length||new Set(save.abilities).size!==save.abilities.length||save.abilities.some((a:string)=>!Object.hasOwn(ABILITIES,a)||!new RegExp(ABILITIES[a as SourceOperationAbility],'iu').test(saveProof)))fail('save/abilities');
      else if(save.abilities.length===1) { if(save.choice!=='single')fail('save/choice'); }
      else {
        if(save.choice!=='target'||save.abilities.length!==2||!atoms.some(atom=>atom.choice==='target'&&atom.dc===save.dc&&JSON.stringify(atom.abilities)===JSON.stringify(save.abilities)))fail('save/choice');
      }
      if(!['none','half','full'].includes(save.outcome)||op.damage?.length&&save.outcome!==sourceSuccessDamage(op.sourceText,q,clauseIndex))fail('save/outcome');
      if(sourceSaveFollowsAttack(clauses,clauseIndex,q,save)&&op.relationship!=='follow-up')fail('save/follow-up');
      if(op.attack!==undefined)fail('attack');
    } else if(op.type!=='damage')fail('type');
    if(op.type==='damage'&&!op.damage?.length)fail('damage');
    if(op.damage!==undefined) {
      if(!Array.isArray(op.damage)||!Array.isArray(op.proof.damage)||op.damage.length!==op.proof.damage.length||op.damage.length>12) { fail('damage'); continue; }
      for(const [partIndex, part] of op.damage.entries()) {
        if(!keys(part,['formula','type','types','relationship','condition'])||typeof part.formula!=='string'||!/^\d+(?:d\d+(?:\s*[+-]\s*\d+)?)?$/iu.test(part.formula.trim())||!Object.hasOwn(DAMAGE,part.type)) { fail(`damage/${partIndex}`); continue; }
        const q=quote(`damage/${partIndex}`,op.proof.damage[partIndex]);
        const atoms=sourceDamageAtoms(q,source),reference=sourceReferencedDamageAtoms(q,source).find(atom=>atom.formula===formula(part.formula)&&JSON.stringify(atom.types)===JSON.stringify(part.types??[part.type])),inherited=sourceScalingDamageRows(q).find(row=>row.formula===formula(part.formula)&&JSON.stringify(row.types)===JSON.stringify(part.types??[part.type]));
        if(sourceScalingDamageRows(q).length&&!scaling)fail(`damage/${partIndex}/scaling-context`);
        if(!atoms.some(atom=>atom.formula===formula(part.formula)&&JSON.stringify(atom.types)===JSON.stringify(part.types??[part.type])))fail(`damage/${partIndex}/negation-or-binding`);
        // A damage quote must bind this formula to this type in one local
        // clause; another number/type elsewhere in the feature is no proof.
        const formulas=[...q.matchAll(/\b\d+(?:d\d+(?:\s*[+-]\s*\d+)?)?/giu)];
        const typePrefix=sourceDamageTypesPattern(part.types??[part.type]);
        const typeAtFormula=new RegExp(`^[\\s)）点的]*(?:${typePrefix})(?:\\s+damage|伤害)`,'iu');
        const occurrenceKey=JSON.stringify([q,formula(part.formula),part.types??[part.type]]),occurrence=damageOccurrences.get(occurrenceKey)??0;
        damageOccurrences.set(occurrenceKey,occurrence+1);
        const located=sourceDamageOccurrence(clauses,q,part,occurrence);
        const targetSpan=sourceDamageAtomSpans(q,part,source)[located.local];if(targetSpan)targetDamageSpans.push({quote:q,...targetSpan});
        const resultScopes=sourceResultScopes(source).filter(scope=>scope.clauseIndex===located.clauseIndex&&sourceDamageAtoms(scope.text,source).some(atom=>atom.formula===formula(part.formula)&&JSON.stringify(atom.types)===JSON.stringify(part.types??[part.type])));
        if(op.type==='save'&&resultScopes.length&&resultScopes.every(scope=>scope.branch==='success'))fail(`damage/${partIndex}/save-success-must-separate`);
        if(op.type==='damage'&&resultScopes.some(scope=>scope.branch!=='unbound')&&part.relationship!=='conditional'&&part.relationship!=='replacement')fail(`damage/${partIndex}/result-branch-condition`);
        // Identical printed rolls are distinct source atoms. Bind them in
        // operation/part source order rather than lending the first position
        // to every part on either side of a subsequent Save/Attack.
        const found=formulas.filter(match=>formula(match[0])===formula(part.formula)&&(typeAtFormula.test(q.slice(match.index!+match[0].length))||inherited&&match.index===inherited.start||reference&&match.index===reference.start))[located.local];
        const tail=found?q.slice(found.index!+found[0].length).split(/[.;。；]/u)[0]!:'';
        if(!found||!inherited&&!reference&&!new RegExp(`^[\\s)）点的]*(?:${typePrefix})(?:\\s+damage|伤害)`,'iu').test(tail))fail(`damage/${partIndex}/formula-type`);
        const anchor=op.type==='attack'?op.proof.attack:op.type==='save'?op.proof.save:op.proof.damage[0];
        const damageIndex=located.clauseIndex,startIndex=op.type==='save'?clauseIndex:text(anchor??'')===q?damageIndex:clauseIndex;
        const sameAnchor=damageIndex===startIndex,prefix=found?q.slice(0,found.index):q;
        const precedingSaves=sourceSaveAtoms(prefix),precedingAttacks=[...prefix.matchAll(/\b(?:melee|ranged).{0,30}attack|近战.{0,12}攻击|远程.{0,12}攻击/giu)];
        const ownSave=sameAnchor&&op.type==='save'&&precedingSaves.length===1&&precedingSaves[0]!.dc===op.save?.dc&&JSON.stringify(precedingSaves[0]!.abilities)===JSON.stringify(op.save?.abilities);
        const ownAttack=sameAnchor&&op.type==='attack'&&precedingAttacks.length===1;
        // A later Save inside this Hit sentence cannot retroactively own an
        // earlier damage atom. Owners before the atom still separate it from
        // the previous attack; same-sentence Save/Attack owns its own damage.
        const previousOwner=clauses.slice(startIndex+1,damageIndex).some(clause=>sourceSaveAtoms(text(clause)).length||/\b(?:melee|ranged).{0,30}attack|近战.{0,12}攻击|远程.{0,12}攻击/iu.test(clause));
        const prefixOwner=!(sameAnchor&&op.type==='damage')&&(precedingSaves.length&&!ownSave||precedingAttacks.length&&!ownAttack);
        const laterAnchor=sameAnchor&&(op.type==='save'&&!ownSave||op.type==='attack'&&!ownAttack);
        const anchorScope=op.type!=='damage'?sourceResultScopes(source).find(scope=>scope.clauseIndex===startIndex)?.operation:undefined;
        // A Hit/Failure continuation can contain its next Save after the
        // current atom. That later owner cannot steal earlier result damage.
        const resultContinuation=/^(?:(?:Hit|Failure|Success|命中|失败|成功)\s*[:：]|On (?:a |each )?(?:hit|failed save|successful save)\b)/iu.test(q);
        const independentOwner=!resultContinuation&&anchorScope!==undefined&&resultScopes.some(scope=>scope.operation!==anchorScope);
        if(damageIndex<startIndex||previousOwner||prefixOwner||laterAnchor||independentOwner&&!scaling)fail(`damage/${partIndex}/operation-owner`);
        if(!['base','additional','conditional','replacement'].includes(part.relationship))fail(`damage/${partIndex}/relationship`);
        // Scope follows the bound result atom. A later independent "and if"
        // rider cannot retroactively qualify an earlier unconditional hit.
        const saveTrigger=op.type==='save'&&op.condition===source.trim()&&text(String(op.proof.save??''))===q?op.save:undefined;
        const attackHit=op.type==='attack'&&/^(?:On a hit|Hit)\b/iu.test(q)&&damageIndex>startIndex&&!previousOwner;
        const attackDamageChoice=op.type==='attack'&&(sourceSameClauseAttackChoice(op,value[index-1],text(String(op.proof.attack??'')),source)==='damage'||object(value[index+1])&&sourceSameClauseAttackChoice(value[index+1],op,text(String(op.proof.attack??'')),source)==='damage');
        if(!sourceDamageAdjustmentMatches(op)&&qualifiedDamageAtom(q,{formula:formula(part.formula),types:part.types??[part.type]},saveTrigger,attackHit,source)&&part.relationship!=='conditional'&&part.relationship!=='replacement')fail(`damage/${partIndex}/condition`);
        if(!attackDamageChoice&&sourceHasDamageAlternatives(q)&&part.relationship!=='conditional'&&part.relationship!=='replacement')fail(`damage/${partIndex}/alternative`);
        if(part.relationship==='conditional'||part.relationship==='replacement') {
          if(part.condition!==source.trim()||op.condition!==source.trim())fail(`damage/${partIndex}/condition`);
          if(!(attackDamageChoice&&op.relationship==='alternative'&&part.relationship==='replacement')&&(op.type!=='damage'||!(op.relationship==='follow-up'||index===0&&op.relationship==='primary'&&sourceEventQualifier(q)&&sourceIndependentDamageCondition(source,q,{formula:formula(part.formula),types:part.types??[part.type]}))||op.damage.some((other:any)=>other.relationship!==part.relationship)||op.proof.damage.some((proof:any)=>typeof proof!=='string'||text(proof)!==q)))fail(`damage/${partIndex}/separate-gm-operation`);
          if(part.relationship==='replacement'){
            const atoms=sourceDamageAtoms(q),first=atoms[0],second=atoms[1];
            const a=first&&sourceDamageAtomSpan(q,{formula:first.formula,type:first.types[0]!,types:first.types.length>1?first.types:undefined});
            const b=second&&sourceDamageAtomSpan(q,{formula:second.formula,type:second.types[0]!,types:second.types.length>1?second.types:undefined});
            const own=sourceDamageAtomSpan(q,part);
            const between=a&&b?q.slice(a.end,b.start):'',or=/\bor\b|或(?:者)?/iu.exec(between);
            // In the explicit "Hit: A, or B if ..." grammar A is the normal
            // atom. Merely finding both numbers somewhere in the same proof
            // cannot authorize swapping the replacement relationship onto A.
            if(a&&b&&own?.start===a.start&&or&&/^(?:Hit|命中)\s*[:：]\s*(?:\d+\s*\()?\s*$/iu.test(q.slice(0,a.start))&&/^[,，;；\s]*$/u.test(between.slice(0,or.index)))fail(`damage/${partIndex}/replacement-branch`);
          }
        }
        if(part.types!==undefined){
          if(!Array.isArray(part.types)||part.types.length<2||new Set(part.types).size!==part.types.length||!part.types.includes(part.type)||part.types.some((type:string)=>!Object.hasOwn(DAMAGE,type)))fail(`damage/${partIndex}/types`);
        }
      }
    }
    if(op.range!==undefined){
      const q=quote('range',op.proof.range),numbers=[...q.matchAll(/(?:\brange\b|\bwithin\b|射程|范围内?|周围)\s*[:：]?\s*(\d+)\s*(?:ft\.?|feet|尺)/giu)].map(match=>Number(match[1]));
      if(!Number.isSafeInteger(op.range)||op.range<0||numbers.length!==1||numbers[0]!==op.range)fail('range');
      if(op.type==='damage'&&(op.proof.damage??[]).some((proof:string)=>sourceReferencedDamageAtoms(text(proof),source).some(atom=>atom.kind==='base'))&&sourceSpellHeaderRange(source,q)!==undefined)fail('range/creation-only');
      // A different named property closes this operation's geometry scope.
      // A literal number in its complete sentence cannot lend range backward
      // to an earlier Save; ordinary adjacent Target/trigger context remains.
      const namedHeading=(clause:string)=>{
        const title=/^([\p{Lu}\p{Lt}][\p{L}'’ -]{0,79})(?:[.]$|\s*[:：])/u.exec(clause)?.[1]?.trim();
        // A colon may join a printed title to its body. Primitive/context
        // labels keep their existing owner rather than opening a property.
        return!!title&&!/^(?:Hit|Failure|Success|Target|Trigger|Response|Range)$/iu.test(title)
          &&!sourceSaveAtoms(clause).some(atom=>atom.start===0)
          &&title.split(/\s+/u).every(word=>/^[\p{Lu}\p{Lt}]/u.test(word)||/^(?:of|the|and|or|with|a|an)$/u.test(word));
      };
      const withinOwner=clauses.some((clause,at)=>text(clause)===q&&!clauses.slice(Math.min(at,clauseIndex)+1,Math.max(at,clauseIndex)+1).some(clause=>namedHeading(text(clause))));
      const sharedHeader=sourceSpellHeaderRange(source,q)===op.range;
      if(sharedHeader&&!sourceSpellHeaderOperationOwner(source,op)||!withinOwner&&!sharedHeader)fail('range/operation-owner');
    }
    if(op.aoe!==undefined){
      const existingArea=sourceOperationExistingArea(source,value as SourceOperation[],index);
      if(!keys(op.aoe,['shape','radius','width','height']))fail('aoe');
      else {
        const q=quote('aoe',op.proof.aoe),areaIndex=clauses.findIndex(clause=>text(clause)===q);
        if(areaIndex>clauseIndex&&!scaling&&!existingArea)fail('aoe/operation-owner');
        if(sourceSpellHeader(source,q)&&!sourceSpellHeaderOperationOwner(source,op)&&!existingArea)fail('aoe/operation-owner');
        const labels:Record<string,string>={sphere:'sphere|球形|球状',radius:'radius|emanation|半径|光环',cone:'cone|锥形',line:'line|线形',cube:'cube|立方体',cylinder:'cylinder|圆柱形',rectangle:'rectangle|矩形'};
        const nativeShape=nativeAreaShape(op.aoe.shape,op.aoe.radius,q),shape=labels[nativeShape],value=op.aoe.radius;
        const eachWithin=nativeShape==='radius'&&new RegExp(`(?:^(?:Each|Every|Any) creature within ${value} (?:feet|ft\\.?) of\\s|\\bforcing (?:each|every|any) creature within ${value} (?:feet|ft\\.?) of [^,.;。]+? to make\\b)`,'iu').test(q);
        const square=nativeShape==='rectangle'&&(new RegExp(`(?<![\\d.])${value}[-\\s]*(?:foot|feet|ft\\.?)[-\\s]*square(?:\\s+area)?\\b`,'iu').test(q)||new RegExp(`(?<![\\d.])${value}\\s*尺(?:见方|的?正方形)`,'u').test(q));
        const line=nativeShape==='line'?sourceLineDimensions(q):undefined,height=nativeShape==='cylinder'?sourceCylinderHeight(q):undefined;
        if(op.aoe.width!==undefined&&(nativeShape!=='line'||!Number.isSafeInteger(op.aoe.width)||op.aoe.width<1||op.aoe.width!==line?.width)||nativeShape==='line'&&line?.width!==undefined&&op.aoe.width!==line.width)fail('aoe/width');
        if(op.aoe.height!==undefined&&(nativeShape!=='cylinder'||!Number.isSafeInteger(op.aoe.height)||op.aoe.height<1||op.aoe.height!==height)||nativeShape==='cylinder'&&height!==undefined&&op.aoe.height!==height)fail('aoe/height');
      const proven=nativeShape==='cylinder'||nativeShape==='sphere'?sourceRoundAreaRadius(q,nativeShape,source)===value:nativeShape==='line'?line?.length===value:nativeShape==='rectangle'?square:nativeShape==='radius'&&/\bEmanation\b|光环/iu.test(q)?nativeAreaShape('sphere',value,q)==='radius':eachWithin||new RegExp(`(?:${value})[-\\s]*(?:(?:foot|feet|ft\\.?)|尺)[-\\s]*(?:${shape})|(?:${shape})[^。.;；]{0,20}?(?:${value})\\s*(?:ft\\.?|feet|尺)`,'iu').test(q);
        // A genuine Sphere also has a radius. Its 半径 is a measurement,
        // never evidence that this geometry is the Emanation type radius.
        if(!shape||!Number.isSafeInteger(value)||value<1||!proven||nativeShape==='radius'&&sourceRoundAreaRadius(q,'sphere',source)!==undefined)fail('aoe');
      }
    }
    if(op.targetSpecial!==undefined){const q=quote('target',op.proof.target);if(typeof op.targetSpecial!=='string'||!op.targetSpecial.trim()||!q.includes(text(op.targetSpecial))||!sourceTargetRecipientBound(source,op,q,targetDamageSpans))fail('targetSpecial');}
    if(JSON.stringify(op.failureStatuses??[])!==JSON.stringify(sourceOperationFailureStatusesAt(source,op as SourceOperation,clauseIndex)))fail('failureStatuses');
  }
  // Inventory is independent of what the model chose to return. Complete
  // parent prose cannot conceal omitted basic operations or duplicated rolls.
  for(const clause of clauses){
    const q=text(clause);
    const choice=sourceAttackBonusChoice(clause);
    if(/\bmelee\s+or\s+ranged\s+(?:(?:weapon|spell)\s+)?attack(?:\s+roll)?\b/iu.test(q)&&!value.some((op,index)=>object(op)&&(sourceSameClauseAttackChoice(op,value[index-1],q,source)==='range'||op.type==='attack'&&object(op.proof)&&text(String(op.proof.attack??''))===q&&(sourceLegacyCombinedAttack(q,op.attack)||sourceNeutralCombinedAttack(q,op.attack)))))errors.push('inventory/attack-choice-omitted');
    if(choice&&(!value.some(op=>object(op)&&op.type==='attack'&&op.relationship==='primary'&&op.condition===undefined&&op.attack?.toHit===choice.defaultBonus&&object(op.proof)&&text(String(op.proof.attack??''))===q)
      ||!value.some(op=>object(op)&&op.type==='attack'&&op.relationship==='alternative'&&op.condition===choice.condition&&op.attack?.toHit===choice.conditionalBonus&&object(op.proof)&&text(String(op.proof.attack??''))===q)))errors.push('inventory/attack-choice-omitted');
    const quoteCount=clauses.filter(clause=>text(clause)===q).length;
    for(const save of sourceBoundSaveAtoms(source,q)){
      const key=sourceSaveIdentity(q,save),actual=value.filter(op=>object(op)&&op.type==='save'&&object(op.save)&&object(op.proof)&&sourceSaveIdentity(text(String(op.proof.save??'')),op.save)===key&&!sourceScalingOperation(source,op)).length;
      const expected=sourceBoundSaveAtoms(source,q).filter(atom=>sourceSaveIdentity(q,atom)===key).length*quoteCount;
      if(actual<expected)errors.push('inventory/save-omitted');
      if(actual>expected)errors.push('inventory/save/duplicate-operation');
    }
    const expected=sourceDamageAtoms(q,source),identities=new Set(expected.map(atom=>JSON.stringify(atom)));
    for(const identity of identities){
      const atom=JSON.parse(identity) as {formula:string;types:string[]};
      const actual=value.flatMap((op,opIndex)=>{
        if(!object(op)||!Array.isArray(op.damage)||!object(op.proof)||!Array.isArray(op.proof.damage))return[];
        const choice=sourceSameClauseAttackChoice(op,value[opIndex-1],q,source),shared=choice==='damage'?sourceClosedDamageChoice(q)?.common:undefined;
        if(choice==='range'||sourceNewTargetDamageProjection(source,value,opIndex,q)||(sourceOperationExistingArea(source,value as SourceOperation[],opIndex)&&!sourceDeferredBaseArea(source,op)&&!sourceIndependentExternalArea(source,op))||shared?.some(common=>common.formula===atom.formula&&JSON.stringify(common.types)===JSON.stringify(atom.types)))return[];
        return op.damage.filter((part:unknown,index:number)=>object(part)&&text(String(op.proof.damage[index]??''))===q&&formula(String(part.formula??''))===atom.formula&&JSON.stringify(part.types??[part.type])===JSON.stringify(atom.types));
      }).length;
      const count=expected.filter(other=>JSON.stringify(other)===identity).length*quoteCount;
      if(actual<count)errors.push('inventory/damage-omitted');
      if(actual>count)errors.push('inventory/damage/duplicate-part');
    }
    if(/\b(?:melee|ranged).{0,30}attack|近战.{0,12}攻击|远程.{0,12}攻击/iu.test(q)&&sourceAttackBonuses(q).length>0&&!value.some(op=>object(op)&&op.type==='attack'&&object(op.proof)&&text(String(op.proof.attack??''))===q))errors.push('inventory/attack-omitted');
  }
  return errors;
}

function prepareSourceOperationEvidence(source: string, value: unknown): unknown {
  const clauses=sourceOperationClauses(source),clauseKey=(value:string)=>text(value).replace(/[。.!?！？]$/u,'');
  const saveOccurrences=new Map<string,number>();
  const completeQuote=(quote:unknown):string|undefined=>{
    if(typeof quote!=='string')return;
    const matches=clauses.filter(clause=>clauseKey(clause)===clauseKey(quote));
    return matches.length===1?matches[0]:undefined;
  };
  const originalQuote=(quote:unknown):unknown=>completeQuote(quote)??quote;
  const prepared=Array.isArray(value)?value.map(op=>{
    if(!object(op))return op;
    const proof=object(op.proof)?Object.fromEntries(Object.entries(op.proof).map(([key,value])=>{
      if(key==='damage'&&Array.isArray(value))return[key,value.map(originalQuote)];
      // Recover only a redundant list wrapper around one already supplied,
      // complete and uniquely source-bound scalar quote. Do not choose among
      // quotes, repair their text, or coerce damage/unknown proof fields.
      const scalar=['attack','save','healing','range','aoe','target'].includes(key);
      const unwrapped=scalar&&Array.isArray(value)&&value.length===1?completeQuote(value[0]):undefined;
      return[key,unwrapped??originalQuote(value)];
    })):op.proof;
    if(op.type==='save'&&object(proof)&&typeof proof.save==='string'){
      // A model may also quote adjacent complete result sentences. Canonicalize
      // only redundant result context after this exact Save, never clipped
      // clauses, eligibility conditions, another roll or a different owner.
      // The full parent/result text remains mandatory on the carrier and OP.
      const supplied=sourceOperationClauses(proof.save),starts=clauses.flatMap((_clause,index)=>supplied.every((clause,at)=>text(clause)===text(clauses[index+at]??''))?[index]:[]),first=starts[0];
      if(supplied.length>1&&starts.length===1&&first!==undefined&&sourceSaveAtoms(clauses[first]!).length>0
        &&supplied.slice(1).every(clause=>/^(?:(?:first|second|third)\s+)?(?:failure(?:\s+or\s+success)?|success(?:\s+or\s+failure)?)\s*:/iu.test(text(clause))&&!sourceSaveAtoms(clause).length&&!/\b(?:melee|ranged)[^.。]{0,40}attack|近战.{0,12}攻击|远程.{0,12}攻击/iu.test(clause)))proof.save=clauses[first];
    }
    if(object(proof)&&Array.isArray(proof.damage)&&proof.damage.length===1&&Array.isArray(op.damage)&&op.damage.length>1&&op.damage.length<=12){
      // Compact evidence may name one complete Hit/result sentence once for
      // several distinct atoms. Expand only that redundant reference, never
      // find a missing sentence, change a part, or mix result/condition scopes.
      const quote=proof.damage[0],atoms=typeof quote==='string'?sourceDamageAtoms(quote):[];
      const identity=(part:any)=>object(part)&&typeof part.formula==='string'?JSON.stringify({formula:formula(part.formula),types:part.types??[part.type]}):'';
      const expected=atoms.map(atom=>JSON.stringify(atom)),proposed=op.damage.map(identity);
      const scopes=sourceResultScopes(source).filter(scope=>text(scope.clause)===text(String(quote))&&sourceDamageAtoms(scope.text).length);
      if(typeof quote==='string'&&clauses.filter(clause=>clause===quote).length===1&&atoms.length===op.damage.length
        &&new Set(expected).size===atoms.length&&new Set(proposed).size===op.damage.length&&proposed.every(key=>expected.includes(key))
        &&op.damage.every((part:any)=>['base','additional'].includes(part.relationship))&&atoms.every(atom=>!qualifiedDamageAtom(quote,atom))
        &&scopes.length>0&&new Set(scopes.map(scope=>scope.branch)).size===1&&new Set(scopes.map(scope=>scope.operation)).size===1){
        proof.damage=op.damage.map(()=>quote);
      }
    }
    if(op.type==='attack'&&object(proof)&&!Object.hasOwn(proof,'target')&&typeof proof.attack==='string'&&typeof op.targetSpecial==='string'){
      // Target proof is redundant only when the already supplied complete
      // Attack sentence contains this exact literal target once. Do not fill
      // an explicit incorrect proof, borrow another sentence or guess a span.
      const attack=clauses.find(clause=>clause===proof.attack),target=text(op.targetSpecial);
      const escaped=target.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
      if(attack&&target&&[...text(attack).matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'gu'))].length===1)proof.target=attack;
    }
    // Fill only omitted dimensions proven uniquely by the supplied complete
    // area sentence. Explicit wrong fields and unrelated entity dimensions
    // remain errors; the IR/Markdown therefore carries each printed value.
    let area=op.aoe;
    if(object(area)&&object(proof)&&typeof proof.aoe==='string'&&clauses.includes(proof.aoe)){
      const q=text(proof.aoe),line=area.shape==='line'?sourceLineDimensions(q):undefined,height=area.shape==='cylinder'&&sourceRoundAreaRadius(q,'cylinder',source)===area.radius?sourceCylinderHeight(q):undefined;
      if(line&&line.length===area.radius&&line.width!==undefined&&area.width===undefined)area={...area,width:line.width};
      if(height!==undefined&&area.height===undefined)area={...area,height};
    }
    const bound={...op,proof,...(area!==op.aoe?{aoe:area}:{})},at=op.type==='save'?sourceSaveClauseIndex(clauses,bound,saveOccurrences):undefined,statuses=sourceOperationFailureStatusesAt(source,bound as SourceOperation,at);
    return {...bound,sourceText:op.sourceText??source.trim(),...(statuses.length&&op.failureStatuses===undefined?{failureStatuses:statuses}:{}),...(op.relationship==='follow-up'||op.damage?.some((part:any)=>['conditional','replacement'].includes(part?.relationship))?{condition:source.trim()}:{}),...(Array.isArray(op.damage)?{damage:op.damage.map(part=>object(part)&&['conditional','replacement'].includes(part.relationship)?{...part,condition:source.trim()}:part)}:{})};
  }):value;
  return prepared;
}

/** Ordinary Intake keeps source-conflicting proposals for validator/repair.
 * This binds only evidence and existing source-owned defaults, not acceptance.
 * Supplied invalid evidence/values remain visible to independent validation. */
export function materializeSourceOperationEvidence(source:string,value:unknown,offset=0):unknown{
  const prepared=prepareSourceOperationEvidence(source,value);
  return Array.isArray(prepared)?structuredClone(prepared).map(op=>{
    if(!object(op)||op.evidence!==undefined||typeof op.sourceText!=='string')return op;
    const start=source.indexOf(op.sourceText);if(start<0)return op;
    return{...op,evidence:{start:offset+start,end:offset+start+op.sourceText.length,quote:op.sourceText}};
  }):prepared;
}

/** Default AI binding owns only representation and evidence coordinates.
 * The model owns mechanics, branches, conditions and declared statuses. */
export function materializeStructuredSourceOperations(source:string,value:unknown,offset?:number,proofSource?:string):unknown{
  if(!Array.isArray(value))return value;
  const clauses=sourceOperationClauses(source),key=(quote:string)=>text(quote).replace(/[。.!?！？]$/u,'');
  const complete=(quote:unknown):unknown=>{
    if(typeof quote!=='string')return quote;
    const matches=clauses.filter(clause=>key(clause)===key(quote));
    return matches.length===1?matches[0]:quote;
  };
  return structuredClone(value).map(op=>{
    if(!object(op))return op;
    const proof=object(op.proof)?Object.fromEntries(Object.entries(op.proof).map(([name,value])=>{
      if(name==='damage'&&Array.isArray(value))return[name,value.map(complete)];
      if(['attack','save','healing','range','aoe','target'].includes(name)&&Array.isArray(value)&&value.length===1&&typeof value[0]==='string'){
        const matches=clauses.filter(clause=>key(clause)===key(value[0]));
        if(matches.length===1)return[name,matches[0]];
      }
      return[name,complete(value)];
    })):op.proof;
    const bound:Record<string,any>={...op,proof,sourceText:op.sourceText??source.trim()};
    if(bound.evidence===undefined&&offset!==undefined&&typeof bound.sourceText==='string'){
      const start=source.indexOf(bound.sourceText);
      if(start>=0&&source.indexOf(bound.sourceText,start+1)<0)bound.evidence={start:offset+start,end:offset+start+bound.sourceText.length,quote:bound.sourceText};
    }
    // A single complete, source-bound citation may be shared by the declared
    // unconditional parts of ONE primary roll. This expands references only;
    // it does not prove, infer or repair any damage value from the sentence.
    if(typeof proofSource==='string'&&object(proof)&&Array.isArray(proof.damage)&&proof.damage.length===1
      &&typeof proof.damage[0]==='string'&&proof.damage[0].trim()
      &&['attack','save'].includes(bound.type)&&bound.relationship==='primary'&&bound.condition===undefined
      &&bound.damageAdjustment===undefined&&proof.upgrade===undefined
      &&Array.isArray(bound.damage)&&bound.damage.length>1&&bound.damage.length<=12
      &&bound.damage.every((part:unknown)=>object(part)&&['base','additional'].includes(part.relationship)&&part.condition===undefined)){
      const whitespace=(value:string)=>value.replace(/\s+/gu,' ').trim();
      const quote=proof.damage[0];
      const owner=whitespace(proofSource),citation=whitespace(quote),at=owner.indexOf(citation);
      // Check literal occurrence and sentence boundaries, not the legacy
      // attack/result clause grouper or damage-word/number interpretation.
      const before=at>=0?owner.slice(0,at).trimEnd():'';
      if(at>=0&&owner.indexOf(citation,at+1)<0&&(!before||/[.!?。！？]$/u.test(before))
        &&/[.!?。！？]$/u.test(citation)&&(at+citation.length===owner.length||owner[at+citation.length]===' ')){
        const expanded={...bound,proof:{...proof,damage:Array.from({length:bound.damage.length},()=>quote)}};
        if(sourceOperationStructureErrors([expanded]).length===0)bound.proof=expanded.proof;
      }
    }
    return bound;
  });
}

export function bindStructuredSourceOperations(source:string,value:unknown,offset?:number):SourceOperation[]{
  const prepared=materializeStructuredSourceOperations(source,value,offset),errors=sourceOperationStructureErrors(prepared);
  if(errors.length)throw new Error('InvalidSourceOperationStructure: '+errors.join(', '));
  return prepared as SourceOperation[];
}

/** Staged/parser/generation callers retain strict binding. */
export function bindSourceOperations(source: string, value: unknown, offset=0): SourceOperation[] {
  const prepared=prepareSourceOperationEvidence(source,value),errors=sourceOperationErrors(source,prepared);
  if(errors.length)throw new Error(`InvalidSourceOperations: ${errors.join(', ')}`);
  return structuredClone(prepared as SourceOperation[]).map(op=>{
    const start=source.indexOf(op.sourceText);
    return {...op,evidence:{start:offset+start,end:offset+start+op.sourceText.length,quote:op.sourceText}};
  });
}

/** A model's manual reply is not permission to erase explicit basic atoms.
 * Legacy fields remain valid consumers; the richer contract is only required
 * when a complete ability cannot fit those fields without losing an operation. */
export function sourceFeatureBasicOmissions(source:string,feature:CanonicalFeature):string[]{
  // Wrong facts, conditions or proof are reported by their own source checks.
  // They are not evidence that an independently clickable operation is absent.
  if(feature.sourceOperations!==undefined)return sourceOperationErrors(source,feature.sourceOperations,feature.sourceContext)
    .filter(error=>error==='operations'?Array.isArray(feature.sourceOperations)&&feature.sourceOperations.length===0:/^inventory\/[^/]+-omitted(?:-or-duplicated)?$/u.test(error));
  if(sourceHealingOperations(source))return['healing-operations'];
  const errors:string[]=[];
  for(const clause of sourceOperationClauses(source)){
    const q=text(clause);
    if(sourceAttackBonuses(q).length>1&&/\b(?:melee|ranged).{0,30}attack|近战.{0,12}攻击|远程.{0,12}攻击/iu.test(q))errors.push('attack-choice');
    for(const save of sourceBoundSaveAtoms(source,q)){
      if(save.context){errors.push('source-operations-required');continue;}
      const repeatPreserved=/repeat|again|再次|重复/iu.test(q)&&feature.appliedConditions?.some(condition=>typeof condition.condition==='string'&&text(condition.condition).includes(q));
      if(repeatPreserved)continue;
      // The legacy flat generator chooses Attack before Save. A second flat
      // field is therefore no executable Save; use the supported GM follow-up
      // contract (or sourceOperations) rather than silently counting the field.
      const found=feature.attack?feature.gmTriggeredSave:feature.save??feature.gmTriggeredSave;
      if(!found||found.dc!==save.dc||save.abilities.length!==1||found.ability!==save.abilities[0])errors.push('save');
    }
    for(const part of sourceDamageAtoms(q,source)){
      // Complex timed/conditional consequences may remain literal GM work.
      // This exception cannot remove an unconditional primary damage atom.
      const remainder=feature.manualRemainder||(feature.executionMode==='gm-manual'?feature.description:'');
      if(qualifiedDamageAtom(q,part,undefined,false,source)&&remainder&&(text(remainder).includes(q)||formula(remainder).includes(part.formula)&&conditional.test(text(remainder))))continue;
      const canonicalType=(value:string)=>Object.entries(DAMAGE).find(([,aliases])=>new RegExp(`^(?:${aliases})$`,'iu').test(value))?.[0]??value.toLowerCase();
      if(!feature.damage?.some(actual=>formula(actual.formula)===part.formula&&JSON.stringify((actual.types??[actual.type]).map(canonicalType))===JSON.stringify(part.types)))errors.push('damage');
    }
    if(/\b(?:melee|ranged).{0,30}attack|近战.{0,12}攻击|远程.{0,12}攻击/iu.test(q)&&sourceAttackBonuses(q).length>0&&!feature.attack)errors.push('attack');
  }
  return errors;
}

/** One independently proven activation may own a simple cooldown counter.
 * Passive benefits do not spend it; several activations or other pools remain
 * unresolved rather than lending their last dawn sentence to the parent. */
function sourceSimpleCooldownUse(name:string,source:string):{max:1;period:'dawn'|'longRest'}|undefined{
  const clauses=sourceOperationClauses(source).map(text),heading=text(name).replace(/[。.]+$/u,''),firstLine=text(source.trim().split(/\r?\n/u)[0]??'').replace(/[。.]+$/u,''),firstClause=(clauses[0]??'').replace(/[。.]+$/u,'');
  if(firstLine!==heading&&firstClause!==heading)return;
  const head=/^([\p{L}’'-]+)\b/u.exec(heading)?.[1],escaped=head?.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  const objectCooldown=escaped?new RegExp(`^The ${escaped} (?:cannot|can['’]t|can not) be used this way again until (?:the )?next dawn[。.]?$`,'iu'):undefined;
  const cooldown=/^(?:Once used, this (?:property|ability|feature|action|trait) (?:cannot|can['’]t|can not) be used again|Once this (?:property|ability|feature|action|trait) is used, it (?:cannot|can['’]t|can not) be used again|Once you use this (?:property|ability|feature|action|trait), you (?:cannot|can['’]t|can not) (?:use it|do so) again) until (?:(?:the )?next dawn|you finish a Long Rest)[。.]?$/iu;
  const restored=(clause:string)=>{
    const suffix=/^(.*? until you finish a Long Rest) unless you expend a use of your ([\p{L}'’ -]+?)(?: \(no action required\))? to restore your use of it[。.]?$/iu.exec(clause);
    const resource=suffix?.[2]?.trim(),own=heading.replace(/^Level \d+:\s*/iu,'');
    return!!suffix&&cooldown.test(suffix[1]+'.')&&!!resource&&!/^(?:this|that|the|it|feature|ability)\b/iu.test(resource)&&resource.toLowerCase()!==own.toLowerCase();
  };
  const matches=clauses.flatMap((clause,index)=>cooldown.test(clause)||objectCooldown?.test(clause)||restored(clause)?[{clause,index}]:[]);
  if(matches.length!==1)return;
  const match=matches[0]!;
  // The complete parent may contain one activation among passive benefits.
  // The one counter belongs to that activation, never to each passive clause.
  const childHeading=(clause:string)=>/^[\p{Lu}\p{Lt}][\p{L}'’ -]{0,79}[.]$/u.test(clause)
    &&clause.slice(0,-1).split(/\s+/u).every(word=>/^[\p{Lu}\p{Lt}]/u.test(word)||/^(?:of|the|and|or|with|a|an)$/u.test(word))
    &&!/^(?:Failure|Success|Hit|Target|Duration)[.]$/u.test(clause);
  const action=/\byou\s+(?:can|may)\s+(?:take|use)\s+(?:an?\s+)?(?:(?:magic|bonus)\s+)?action\b|\bas\s+an?\s+(?:(?:magic|bonus)\s+)?action,\s+you\b|\bwhen you roll Initiative, you can\b|\byou can perform (?:an?|the) [\p{L}'’-]+ rite\b/giu;
  if([...text(source).matchAll(action)].length!==1)return;
  const activeIndex=clauses.findIndex(clause=>new RegExp(action.source,'iu').test(clause)),active=clauses[activeIndex]??'';
  const headings=clauses.flatMap((clause,index)=>index>0&&childHeading(clause)?[index]:[]);
  const grantedBenefits=/\bgranting the benefits below\b/iu.test(active)&&activeIndex<match.index&&headings.every(index=>index>match.index);
  const wornPassive=headings.length===1&&headings[0]===activeIndex-1&&activeIndex<match.index
    &&/\bYou (?:have|gain)\b[^.;。]*\bwhile you wear\b/iu.test(clauses.slice(0,headings[0]).join(' '));
  if(headings.length&&!grantedBenefits&&!wornPassive)return;
  // A fixed external slot can restore the same use. Its level is not a use
  // maximum, a Cast grant, a new pool or an automatic consumption instruction.
  const externalRestore=/^You can also restore your use of it by expending a level [1-9] spell slot(?: \(no action required\))?[。.]?$/iu;
  const physical=escaped?new RegExp(`^(?:The ${escaped}|It) (?:is (?:about )?\\d+(?:[.]\\d+)? (?:foot|feet|inch|inches) (?:(?:in )?(?:diameter|width|height|depth)|wide|tall|deep)(?: and half as deep)?|holds (?:about )?\\d+(?:[.]\\d+)? (?:gallons?|pounds?|liters?))[。.]?$`,'iu'):undefined;
  const passiveWorn=/^(?:In addition,\s*)?you (?:have|gain) Advantage on saving throws [^.;。]+ while you wear [^.;。]+[。.]?$/iu;
  if(clauses.slice(match.index+1).some(clause=>!physical?.test(clause)&&!externalRestore.test(clause)&&!passiveWorn.test(clause)&&!(grantedBenefits&&!/\b(?:can|may)\s+(?:cast|take|use|make)\b/iu.test(clause))))return;
  if(/\bcharges?\b|\b(?:\d+|one|two|three)\s+(?:uses?|times)\b|\b(?:other|additional)\s+(?:properties|abilities|features)\b|\bone of the following\b/iu.test(text(source)))return;
  if(clauses.some(clause=>/\b(?:target|creature|ally)\s+(?:can|may)\s+(?:use|take)\b/iu.test(clause)))return;
  return{max:1,period:/Long Rest/iu.test(match.clause)?'longRest':'dawn'};
}

/** Source-owned resource declarations, shared by extraction and validation.
 * Target allowances and child-property cooldowns cannot define a parent pool. */
export function sourceFeatureResources(name: string,source?:string,ownerName?:string): {
  uses?: {max:number;period:'day'|'longRest'|'shortRest'|'dawn'};
  recharge?: [number,number]; legendaryCost?:number;
} {
  let label=text(name);const result:ReturnType<typeof sourceFeatureResources>={},quotaLabels=[label];
  if(source){
    const printed=text(sourceOperationClauses(source)[0]??'').replace(/[。.]$/u,'');
    const bare=printed.replace(/\s*[（(][^）)]*[）)]\s*$/u,'').trim();
    // Canonical short names may omit the source's resource suffix. Only the
    // exact same printed heading can supply it; body numbers and a different
    // name/explicit qualifier are never used to replace a proposed resource.
    if(label===bare)label=printed;
    // A shortened or differently qualified model heading cannot erase a
    // conditional source quota and thereby authorize a flat counter.
    if(label.replace(/\s*[（(][^）)]*[）)]\s*$/u,'').trim()===bare)quotaLabels.push(printed);
  }
  const conditionalDaily=quotaLabels.some(label=>{
    const counts=[...label.matchAll(/\d+\s*(?:次\s*)?\/\s*(?:day\b|天|日)|(?:每日|每天)\s*\d+\s*次?/giu)];
    return counts.length>1||counts.length>0&&/\b(?:if|when|while|unless|provided|only)\b|\b(?:in|outside)(?:\s+(?:its|the|a))?\s+lair\b|如果|若|仅当|除非|巢穴[内外]/iu.test(label);
  });
  const daily=/(\d+)\s*(?:次\s*)?\/\s*(?:day|天|日)\b|(?:每日|每天)\s*(\d+)\s*次?/iu.exec(label);
  // CJK has no word boundary after 日 or 天.
  const chineseDaily=/(\d+)\s*(?:次\s*)?\/\s*(?:天|日)/u.exec(label);
  if(daily||chineseDaily)result.uses={max:Number(daily?.[1]??daily?.[2]??chineseDaily?.[1]),period:'day'};
  const countedRest=/(\d+)\s*\/\s*(short|long)\s+rest\b/iu.exec(label);
  if(countedRest)result.uses={max:Number(countedRest[1]),period:countedRest[2]!.toLowerCase()==='short'?'shortRest':'longRest'};
  const englishRest=/recharges? after (?:a )?(short(?: or long)?|long) rest/iu.exec(label);
  const chineseRest=/(?:^|[（(\s])(?:完成|进行)?\s*(短休|长休)(?:\s*或\s*(短休|长休))?\s*(?:后)?(?:恢复|充能)\s*(?:[）)]|$)/u.exec(label);
  if(englishRest||chineseRest)result.uses={max:1,period:/short/iu.test(englishRest?.[1]??'')||chineseRest?.[1]==='短休'||chineseRest?.[2]==='短休'?'shortRest':'longRest'};
  const charge=/(?:recharge|充能)\s*[:：]?\s*(\d)(?:\s*[-–—]\s*(\d))?/iu.exec(label);
  if(charge)result.recharge=[Number(charge[1]),Number(charge[2]??charge[1])];
  const cost=/(?:costs?\s+(\d+)\s+actions?|消耗\s*(\d+)\s*(?:个)?(?:传奇)?动作)/iu.exec(label);
  if(cost)result.legendaryCost=Number(cost[1]??cost[2]);
  if(source){
    const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    // Body declarations need a positive Actor subject. A target's allowance
    // never becomes this Item's counter, even if both print the same number.
    const subject=`(?:${ownerName?`(?:the\\s+)?${escape(text(ownerName))}|`:''}it|he|she|you|the creature|this creature|该生物|此生物|它)`;
    const rawClauses=sourceOperationClauses(source),firstLine=text(source.trim().split(/\r?\n/u)[0]??''),ownTitle=firstLine.replace(/[。.]+$/u,'')===text(name).replace(/[。.]+$/u,'');
    const body=ownTitle&&/\r?\n/u.test(rawClauses[0]??'')?[rawClauses[0]!.split(/\r?\n/u).slice(1).join(' '),...rawClauses.slice(1)]:rawClauses.slice(1);
    const ownBody=ownTitle||text(rawClauses[0]??'').replace(/[。.]+$/u,'')===text(name).replace(/[。.]+$/u,'');
    const clauses=(ownBody?body:[]).map(text).flatMap(clause=>clause.split(/,\s*and\s+(?=you regain\b)/iu));
    const owned=(clause:string,verb:string)=>new RegExp(`^${subject}(?:\\s+|(?=\\p{Script=Han}))(?:${verb})`,'iu').exec(clause);
    // A leading frequency declaration belongs to this complete ability. It
    // does not borrow a later target's immunity, duration or daily allowance.
    const firstBody=clauses[0]??'';
    const leading=/^(once|twice|\d+ times) per (day|(?:short(?: or long)?|long) rest)\b\s*,?\s*/iu.exec(firstBody);
    const declaration=leading?firstBody.slice(leading[0].length).replace(/^(?:while|when)\b[^,，]+[,，]\s*/iu,''):'';
    if(leading&&owned(declaration,'(?!(?:and|or|with|whose|that|who)\\b)\\p{L}')){
      const max=/^once$/iu.test(leading[1]!)?1:/^twice$/iu.test(leading[1]!)?2:Number.parseInt(leading[1]!,10),period=/^day$/iu.test(leading[2]!)?'day':/^short/iu.test(leading[2]!)?'shortRest':'longRest';
      if(!result.uses)result.uses={max,period};
    }
    // Count must immediately qualify the same use predicate and its direct
    // feature reference. Never search across an action that lets someone else
    // use a granted ability. Unknown compound objects remain literal GM work.
    const bareName=text(name).replace(/\s*[（(][^）)]*[）)]\s*$/u,'').trim();
    const directObject=`(?:this(?:\\s+(?:${escape(bareName)}|[\\p{L}'’-]+))?|the\\s+${escape(bareName)})(?:\\s+(?:ability|action|attack|feature|trait))?`;
    const countPattern=new RegExp(`^${subject}\\s+(?:can|may)\\s+use\\s+${directObject}\\s+(?<count>twice|\\d+\\s+times)(?:\\s+per\\s+(?<period>day|short rest|long rest))?\\b`,'iu');
    const count=clauses.map(clause=>countPattern.exec(clause)).find(match=>match&&!/\b(?:if|unless|when|while|only|provided)\b/iu.test(match.input.slice(match[0].length))),countValue=count?.groups?.count?(/^twice$/iu.test(count.groups.count)?2:Number.parseInt(count.groups.count,10)):undefined;
    const recoveryClause=clauses.find(clause=>owned(clause,'regains? all (?:expended )?uses?\\b|(?:在|于|完成)?(?:黎明|破晓|短休|长休)'));
    const recovery=recoveryClause?/regains? all (?:expended )?uses?[^.。;；]{0,40}?(?:at (?:the next )?(dawn)|(?:after|when (?:it finishes|you finish)|on finishing) (?:a )?(short|long) rest)|(?:黎明|破晓)(?:时)?恢复所有(?:已消耗的)?(?:使用)?次数|(?:完成)?(短休|长休)后恢复所有(?:已消耗的)?(?:使用)?次数/iu.exec(recoveryClause):undefined;
    if(count?.groups?.period&&!result.uses)result.uses={max:countValue!,period:count.groups.period.toLowerCase()==='day'?'day':count.groups.period.toLowerCase()==='short rest'?'shortRest':'longRest'};
    if(recovery){
      const period=recovery[1]||/黎明|破晓/u.test(recovery[0])?'dawn':/short|短休/iu.test(recovery[2]??recovery[3]??recovery[0])?'shortRest':'longRest';
      const max=result.uses?.max??(count?.groups?countValue:undefined);
      if(max!==undefined)result.uses={max,period};
    }
  }
  if(source&&!result.uses&&!result.recharge&&!conditionalDaily){const simple=sourceSimpleCooldownUse(name,source);if(simple)result.uses=simple;}
  // A conditional daily allowance has no unconditional Item pool. A proven
  // source ledger owns its base/lair counters at the Actor boundary instead.
  if(conditionalDaily)delete result.uses;
  return result;
}
