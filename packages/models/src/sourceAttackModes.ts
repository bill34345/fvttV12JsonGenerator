import type {SourceOperation} from './sourceOperationTypes';

type Part=NonNullable<SourceOperation['damage']>[number];
export interface SourceAttackDamageModes {
  kind:'conditional'|'versatile';
  attackId:string;
  ordinary:Part;
  alternative:Part;
  shared:Part[];
  absorbedIds:string[];
  /** Identity only; no library attack/damage numbers may replace source facts. */
  weapon:{baseItem:string;category:string};
}
const normalized=(s:string)=>s.normalize('NFKC').replace(/[*_]/gu,'').replace(/[−–]/gu,'-').replace(/\s+/gu,' ').trim();
const formula=(s:string)=>s.replace(/\s/gu,'').toLowerCase();
const conditional=/\b(?:if|unless|when|while|only|after|before|provided|against|except|excepting)\b|如果|若|当|仅当|除非/iu;
const replacement=/\bor\b|\binstead\b|\brather than\b|或(?:者)?|代替|改为|替代/iu;
const bothHands=/\b(?:if|when|while)\s+(?:(?:it|the weapon)\s+is\s+)?(?:used|wielded|held|gripped)\s+(?:(?:with|in)\s+(?:two|both)\s+hands|two-handed)\b|(?:用|以|使用)?(?:双手|两手)(?:持用|使用|握持|持握)|(?:持用|握持|持握).{0,8}(?:双手|两手)/iu;
const weaponIdentities:Array<[string,string,string]>= [
  ['club','simpleM','club|木棒'],['greatclub','simpleM','greatclub|巨棒'],
  ['quarterstaff','simpleM','quarterstaff|长棍|長棍'],['spear','simpleM','spear|矛|长矛|長矛'],
  ['battleaxe','martialM','battleaxe|战斧|戰斧'],['longsword','martialM','longsword|长剑|長劍'],
  ['warhammer','martialM','warhammer|战锤|戰錘'],['trident','martialM','trident|三叉戟'],
];
function weaponIdentity(name:string){
 const label=normalized(name).replace(/\s*\([^)]*\)\s*/gu,' ').trim();
 const found=weaponIdentities.find(([, ,aliases])=>new RegExp(`^(?:${aliases})$`,'iu').test(label));
 return{baseItem:found?.[0]??'',category:found?.[1]??''};
}
/** Source-derived presentation of already validated OPs. A replacement is not
 * inferred from half/bloodied or the feature's name. Complete branch evidence
 * must explicitly replace one same-type printed damage atom. Ambiguous third
 * alternatives remain separate GM operations, never guessed into two modes. */
export function deriveSourceAttackDamageModes(source:string,ops:readonly SourceOperation[],name:string,atomPosition:(quote:string,part:Part)=>number|undefined,closedShared?:(quote:string,part:Part)=>boolean):SourceAttackDamageModes|undefined{
 const attacks=ops.filter(op=>op.type==='attack');
 if(attacks.length!==1||attacks[0]!.relationship!=='primary'||!attacks[0]!.attack)return;
 const attack=attacks[0]!;
 const replacements=ops.filter(op=>op.type==='damage'&&op.damage?.some(p=>p.relationship==='replacement'));
 if(replacements.length!==1||replacements[0]!.damage?.length!==1)return;
 const alternativeOp=replacements[0]!,alternative=alternativeOp.damage![0]!,altQuote=normalized(alternativeOp.proof.damage?.[0]??'');
 if(!altQuote||!replacement.test(altQuote))return;
 const entries=ops.flatMap(op=>(op.damage??[]).map((part,index)=>({op,part,quote:normalized(op.proof.damage?.[index]??'')})));
 const alternativePosition=atomPosition(altQuote,alternative);if(alternativePosition===undefined)return;
 const candidates=entries.filter(entry=>entry.op!==alternativeOp);
 const sameClause=candidates.filter(entry=>entry.quote===altQuote&&atomPosition(altQuote,entry.part)!==undefined&&atomPosition(altQuote,entry.part)!<alternativePosition);
 let ordinary=sameClause.length===1?sameClause[0]:undefined;
 if(!ordinary){
  const after=candidates.filter(entry=>entry.quote===altQuote&&atomPosition(altQuote,entry.part)!>alternativePosition);
  if(after.length===1&&/\botherwise\b|否则/iu.test(altQuote)&&conditional.test(altQuote.slice(0,atomPosition(altQuote,after[0]!.part)!))&&/\bor\b|或(?:者)?/iu.test(altQuote.slice(alternativePosition,atomPosition(altQuote,after[0]!.part)!)))ordinary=after[0];
 }
 if(ordinary){
  const before=atomPosition(altQuote,ordinary.part)!+formula(ordinary.part.formula).length;
  if(before<alternativePosition&&!/\bor\b|或(?:者)?/iu.test(altQuote.slice(before,alternativePosition)))return;
 }else{
  // Separate-sentence replacement must say "instead" and replace an actual
  // ordinary Attack base, not an unrelated rider or another operation's roll.
  if(!/\binstead\b|\brather than\b|代替|改为|替代/iu.test(altQuote))return;
  const bases=candidates.filter(entry=>entry.op===attack&&entry.part.relationship==='base');
  if(bases.length!==1)return;ordinary=bases[0];
 }
 if(!ordinary||formula(ordinary.part.formula)===formula(alternative.formula)&&JSON.stringify(ordinary.part.types??[ordinary.part.type])===JSON.stringify(alternative.types??[alternative.type]))return;
 const shared:Part[]=[],absorbedIds=new Set([alternativeOp.id]),assigned=new Set(entries.filter(entry=>entry===ordinary||entry.op===alternativeOp));
 if(ordinary.op!==attack)absorbedIds.add(ordinary.op.id);
 for(const entry of entries){
  if(entry===ordinary||entry.op===alternativeOp||entry.op.type==='save')continue;
  const position=atomPosition(entry.quote,entry.part);
  const trailing=entry.quote===altQuote&&position!==undefined&&position>alternativePosition?altQuote.slice(alternativePosition+formula(alternative.formula).length,position):'';
  // A trailing condition belongs to this rider, not to both attack modes.
  // The preceding replacement's own qualifier is intentionally outside this
  // atom-local suffix (e.g. the Azer's unconditional ', plus ... fire damage').
  const atomSuffix=position===undefined?undefined:entry.quote.slice(position);
  const damageEnd=atomSuffix?.match(/\bdamage\b|伤害/iu);
  const afterAtom=damageEnd?atomSuffix!.slice(damageEnd.index!+damageEnd[0].length):undefined;
  // Unknown words after the atom are not proof of unconditional shared damage
  // either (e.g. 'on a critical hit'). Preserve that OP instead of expanding a
  // keyword list into a rule interpreter.
  const unqualifiedTail=afterAtom!==undefined&&/^(?:[ \t]*in (?:either|both) cases?)?[ \t.;。]*$/iu.test(afterAtom);
  const localConditional=position!==undefined&&(!unqualifiedTail||conditional.test(atomSuffix!));
  const commonAfterQualifier=!localConditional&&(/[,，]\s*(?:plus|and additionally|外加|另加|此外加上)\s+[^,，]*$/iu.test(trailing)
    ||entry.quote===altQuote&&Boolean(closedShared?.(entry.quote,entry.part)));
  const prefix=position===undefined?'':entry.quote.slice(0,position);
  const unconditionalPrefix=/^(?:(?:in (?:either|both) cases?|both attacks|either attack)[,:]?\s*)?(?:(?:the|this|that)\s+(?:attack|weapon|hit)\s+)?(?:also\s+)?(?:deals?|causes?|inflicts?)\s+(?:an?\s+)?(?:(?:additional|extra)\s+)?(?:\d+\s*\()?\s*$/iu.test(prefix)
    ||/^(?:两种攻击|该攻击|此攻击|该武器|此武器)(?:均|都)?(?:额外)?造成(?:\d+\s*[（(])?\s*$/u.test(prefix);
  const explicitBoth=unqualifiedTail&&unconditionalPrefix&&!conditional.test(entry.quote)&&/\b(?:in (?:either|both) case|both attacks|either attack)\b|两种情况|两种攻击|无论/iu.test(entry.quote);
  const sameAttack=entry.op===attack||/\b(?:the|this|that)\s+(?:attack|weapon|hit)\b.*\b(?:also|additional|extra)\b|(?:该|此)(?:攻击|武器|次命中).*额外/iu.test(entry.quote);
  const independent=unqualifiedTail&&unconditionalPrefix&&sameAttack&&!conditional.test(entry.quote)&&!replacement.test(entry.quote)&&['base','additional'].includes(entry.part.relationship);
  if(!commonAfterQualifier&&!explicitBoth&&!independent){
    // A separate conditional Damage OP retains its original GM button. If
    // this part shares an absorbed OP, the all-parts check below rejects the
    // entire coalescing step rather than silently discarding that part.
    if(entry.op.type==='damage')continue;
    return;
  }
  shared.push(entry.part);assigned.add(entry);if(entry.op!==attack)absorbedIds.add(entry.op.id);
 }
 const kind=bothHands.test(altQuote)&&!(/\b(?:cannot|can't|not)\b|不能|无法/iu.test(altQuote))&&attack.attack!.type==='mwak'&&JSON.stringify(ordinary.part.types??[ordinary.part.type])===JSON.stringify(alternative.types??[alternative.type])?'versatile':'conditional';
 // Every absorbed operation contains only the identified damage atoms. Any
 // additional save/area/target behaviour remains on its own original OP.
 if(entries.some(entry=>absorbedIds.has(entry.op.id)&&!assigned.has(entry)))return;
 if(ops.some(op=>absorbedIds.has(op.id)&&(op.attack||op.save||op.aoe||op.range!==undefined||op.targetSpecial||op.appliedConditions?.length||op.failureStatuses?.length||op.damageAdjustment)))return;
 return{kind,attackId:attack.id,ordinary:ordinary.part,alternative,shared,absorbedIds:[...absorbedIds],weapon:weaponIdentity(name)};
}
