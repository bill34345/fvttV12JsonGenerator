import type {SourceOperation} from './sourceOperationTypes';

const visible=(value:string)=>value.normalize('NFKC').replace(/[*_]/gu,'').replace(/\s+/gu,' ').trim();
const compact=(value:string)=>visible(value).replace(/\s/gu,'').toLowerCase();
const types='acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder';

export function isNeutralSourceAttack(op:Pick<SourceOperation,'attack'>):boolean{
  return op?.attack?.type==='melee'||op?.attack?.type==='ranged';
}
export function sourceNeutralAttackKind(quote:string):'melee'|'ranged'|undefined{
  const match=/\b(Melee|Ranged)(\s+(?:or|and)\s+(?:Melee|Ranged))?\s+(?:(Weapon|Spell)\s+)?Attack(?:\s+Roll)?\s*:/iu.exec(visible(quote));
  return match&&!match[2]&&!match[3]?match[1]!.toLowerCase() as 'melee'|'ranged':undefined;
}

/** source-derived: a closed outgoing Hit branch, not incoming resistance or
 * arbitrary fractional damage. The source owns its actor and full quote. */
export function sourceBloodiedHalfDamage(quote:string):{formula:string;type:string;actor:string}|undefined{
  const header='(?:(?:Melee|Ranged) (?:(?:Weapon|Spell) )?Attack(?: Roll)?:\\s*[+-]?\\d+(?: to hit)?,\\s*(?:reach|range) \\d+(?:\\/\\d+)? ft\\.\\s*)?';
  const match=new RegExp(`^${header}Hit:\\s*\\d+\\s*\\((\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?)\\)\\s+(${types}) damage, or half as much damage if (.+?) is Bloodied(?:, and the target is [^.;。]+)?[.。]?$`,'iu').exec(visible(quote));
  if(!match||/\b(?:not|no|cannot|never)\b/iu.test(match[3]!)||/^(?:the target|(?:an?|one|another|each|any) creature|an? ally|an? enemy|it|they)$/iu.test(match[3]!))return;
  return{formula:compact(match[1]!),type:match[2]!.toLowerCase(),actor:match[3]!};
}

/** Independent consumer check: removing/changing the branch must fail even
 * when the native base dice and the full descriptive paragraph remain. */
export function sourceDamageAdjustmentMatches(op:SourceOperation):boolean{
  const proof=op.proof?.damage;
  if(op.type!=='attack'||!op.attack||typeof op.sourceText!=='string'||!Array.isArray(op.damage)||op.damage.length!==1||!op.damage[0]||!Array.isArray(proof)||proof.length!==1||typeof proof[0]!=='string')return false;
  const fact=sourceBloodiedHalfDamage(proof[0]!);if(!fact)return false;
  const adjustment=op.damageAdjustment;
  return !!adjustment&&Object.keys(adjustment).sort().join(',')==='actor,condition,multiplier,quote'
    &&typeof adjustment.actor==='string'&&typeof adjustment.quote==='string'&&typeof op.damage[0]!.formula==='string'
    &&adjustment.multiplier===0.5&&adjustment.condition==='source-actor-bloodied'&&adjustment.quote===proof[0]
    &&visible(adjustment.actor)===fact.actor&&op.sourceText.includes(adjustment.quote)
    &&compact(op.damage[0]!.formula)===fact.formula&&op.damage[0]!.type===fact.type
    &&op.damage[0]!.types===undefined&&op.damage[0]!.relationship==='base'&&op.damage[0]!.condition===undefined;
}
