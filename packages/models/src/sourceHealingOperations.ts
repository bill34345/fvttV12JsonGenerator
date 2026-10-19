import type {SourceOperation} from './sourceOperationTypes';
import {sourceOperationClauses} from './sourceOperationScopes';

const normalized=(s:string)=>s.normalize('NFKC').replace(/[*_]/gu,'').replace(/\s+/gu,' ').trim();
const quantity='(?:\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?|\\d+)';
const initial=new RegExp('(?:^|\\s)(?<recipient>(?:A|One) creature you touch|You) regains? (?<formula>'+quantity+') (?<temporary>Temporary )?Hit Points?[.]$','iu');
const later=new RegExp('^For the duration, (?<recipient>the target|you) regains? (?<formula>'+quantity+') (?<temporary>Temporary )?Hit Points? at the (?<turn>start|end) of each of (?<owner>its|your) turns(?<tail>, [^.]+)?[.]$','iu');
const stable=(value:unknown):string=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);

/** Source-derived, bounded two-event healing: one explicit initial recipient,
 * then the same recipient's turn during the printed duration. These are GM
 * roll helpers; no turn listener, timer, spell grant or automatic HP write. */
export function sourceHealingOperations(source:string):SourceOperation[]|undefined{
  const grants=source.match(new RegExp('\\b(?:regains?|gains?|restoring)\\s+'+quantity+'\\s+(?:Temporary\\s+)?Hit Points?\\b','giu'));
  if(grants?.length!==2)return;
  const clauses=sourceOperationClauses(source),pairs=clauses.flatMap((quote,index)=>{
    const q=normalized(quote),match=initial.exec(q);
    return match?[{quote,index,q,match}]:[];
  });
  if(pairs.length!==1)return;
  const first=pairs[0]!,prefix=first.q.slice(0,first.match.index).trim();
  // This shortcut owns the complete two-event parent, not a subset of a
  // larger attack/save/damage ability. Only a separate printed title may
  // precede the two clauses; extra clauses remain outside this contract.
  const title=/^[\p{Lu}\p{Lt}][\p{L}'’ -]{0,79}[.]$/u;
  if(first.index!==0&&(first.index!==1||!title.test(clauses[0]!)))return;
  if(clauses.length!==first.index+2)return;
  // Header/title context may precede the first grant, but a conditional or
  // another executable result cannot silently become unconditional healing.
  if(/\b(?:if|when|unless|instead|not|cannot|never|twice|half|damage|attack|saving throw)\b/iu.test(prefix))return;
  const nextQuote=clauses[first.index+1];if(!nextQuote)return;
  const follow=later.exec(normalized(nextQuote));if(!follow?.groups||!first.match.groups)return;
  const a=first.match.groups,b=follow.groups,self=/^you$/iu.test(a.recipient!);
  if(self?!/^you$/iu.test(b.recipient!)||b.owner?.toLowerCase()!=='your':!/^the target$/iu.test(b.recipient!)||b.owner?.toLowerCase()!=='its')return;
  if(!/\bDuration:\s*\d+\s+(?:rounds?|minutes?|hours?)\b/iu.test(source))return;
  if(b.tail&&!/^, and any severed body parts regrow after \d+ (?:minutes?|rounds?|hours?)$/iu.test(b.tail))return;
  const targetType=self?'self' as const:'creature' as const;
  const proofs=[first.quote,nextQuote],matches=[a,b];
  return matches.map((g,index)=>({id:index?'healing-follow-up':'healing-initial',name:index?'GM subsequent healing':'GM initial healing',type:'heal',relationship:index?'follow-up':'primary',
    sourceText:source.trim(),...(index?{condition:source.trim()}:{}),
    healing:{formula:g.formula!.replace(/\s+/gu,''),type:g.temporary?'temphp':'healing',target:{type:targetType,count:1,special:index?normalized(nextQuote):first.match[0].trim()}},
    proof:{healing:proofs[index]!}}));
}

/** Validate all events independently of the returned proposal. No missing,
 * duplicated, swapped, re-targeted or extra healing can hide behind prose. */
export function sourceHealingOperationErrors(source:string,value:unknown,expected=sourceHealingOperations(source)):string[]{
  if(!expected||!Array.isArray(value))return['healing/source'];
  const errors:string[]=[],ids=new Set<string>();
  if(value.length!==expected.length)errors.push('inventory/healing-omitted-or-duplicated');
  for(const [index,op]of value.entries()){
    const want=expected[index],fail=(key:string)=>errors.push(`${index}/${key}`);
    if(!want||!op||typeof op!=='object'||Array.isArray(op)){fail('shape');continue;}
    if(Object.keys(op).some(k=>!['id','name','type','relationship','condition','sourceText','evidence','healing','proof'].includes(k)))fail('shape');
    if(typeof op.id!=='string'||!/^[-a-zA-Z0-9]{1,64}$/u.test(op.id)||ids.has(op.id))fail('id');ids.add(op.id);
    if(typeof op.name!=='string'||!op.name.trim()||op.name.length>160)fail('name');
    if(op.type!=='heal'||op.relationship!==want.relationship)fail('relationship');
    if(op.sourceText!==source.trim())fail('sourceText');
    if(op.condition!==want.condition)fail('condition');
    const healing=op.healing&&typeof op.healing==='object'&&typeof op.healing.formula==='string'
      ?{...op.healing,formula:op.healing.formula.replace(/\s+/gu,'')}:op.healing;
    if(stable(healing)!==stable(want.healing))fail('healing');
    if(stable(op.proof)!==stable(want.proof))fail('proof');
    if(op.evidence!==undefined){const e=op.evidence;if(!e||Object.keys(e).some(k=>!['start','end','quote'].includes(k))||e.quote!==source.trim()||!Number.isSafeInteger(e.start)||e.start<0||!Number.isSafeInteger(e.end)||e.end-e.start!==e.quote.length)fail('evidence');}
  }
  return errors;
}
