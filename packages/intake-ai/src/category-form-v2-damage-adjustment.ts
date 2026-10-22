import {sourceBloodiedHalfDamage,sourceActorNameMatches,sourceOperationClauses,type SourceOperation} from '@fvtt-json-generator/models/source-operations';
import {StagedExtractionError} from './staged-source';
import {bindV2SelfReference} from './category-form-v2-identity';
import type {V2Operation} from './category-form-v2';

const visible=(s:string)=>s.normalize('NFKC').replace(/\s+/gu,' ').trim();
const formula=(s:string)=>visible(s).replace(/\s/gu,'').toLowerCase();
function fail(code:string,path:string):never{throw new StagedExtractionError(code,path);}

function bloodiedCondition(value:string|null,names:readonly string[],path:string):boolean{
  if(value===null)fail('V2_DAMAGE_CONDITION_OMITTED',path);
  const q=visible(value!);
  const english=/^(?:(?:if|when|while) )?(.+?) is (not )?Bloodied$/iu.exec(q);
  const chinese=/^(?:若|当|如果)?(.+?)(未|不|没有)?(?:处于)?\s*(?:浴血\s*\(Bloodied\)|Bloodied|浴血)\s*(?:状态)?\s*(?:时)?$/iu.exec(q);
  const subject=english?.[1]??chinese?.[1],negative=english?.[2]??chinese?.[2];
  if(!subject)fail('V2_DAMAGE_CONDITION_UNPROVEN',path);
  const binding=bindV2SelfReference(subject!,names,path);
  if(binding.targetStatus!=='verified')fail('V2_DAMAGE_CONDITION_ACTOR_UNPROVEN',path);
  return !negative;
}

/** Consumes both filled branches without dropping either: one native base
 * roll plus an explicit source-bound, GM-resolved outgoing half adjustment. */
export function bindV2DamageAdjustment(fields:V2Operation,source:string,names:readonly string[],path:string,damageType:(value:string,path:string)=>string):{baseIndex:number;halfIndex:number;adjustment:NonNullable<SourceOperation['damageAdjustment']>}|undefined{
  if(!fields.伤害.some(part=>part.倍率!==1))return;
  const matches=sourceOperationClauses(source).flatMap(quote=>{const fact=sourceBloodiedHalfDamage(quote);return fact?[{quote,fact}]:[];});
  if(matches.length!==1||!fields.攻击||fields.豁免||fields.范围||fields.伤害.length!==2)fail('V2_DAMAGE_MULTIPLIER_UNSUPPORTED',path);
  const {quote,fact}=matches[0]!;
  if(!sourceActorNameMatches(fact.actor,names))fail('V2_DAMAGE_SOURCE_ACTOR_UNPROVEN',path);
  // An outgoing damage branch cannot certify an incoming resistance clause.
  if(/(?:其|自身|自己)(?:所)?受到的(?:该|此次|本次)?攻击伤害减半|(?:damage (?:it|the attacker) takes|incoming damage)[^.;。]{0,40}(?:half|halved)/iu.test(fields.特殊规则??''))
    fail('V2_DAMAGE_ADJUSTMENT_DIRECTION_CONFLICT',path);
  const baseIndex=fields.伤害.findIndex(part=>part.倍率===1),halfIndex=fields.伤害.findIndex(part=>part.倍率===0.5);
  if(baseIndex<0||halfIndex<0||baseIndex===halfIndex)fail('V2_DAMAGE_BRANCH_CONFLICT',path);
  for(const [index,part]of fields.伤害.entries()){
    if(formula(part.公式)!==fact.formula||damageType(part.伤害类型,path)!==fact.type||part.成功时倍率!==null)fail('V2_DAMAGE_BRANCH_CONFLICT',path);
    if(bloodiedCondition(part.生效条件,names,path+'/damage/'+index)!==(index===halfIndex))fail('V2_DAMAGE_BRANCH_CONFLICT',path);
  }
  return{baseIndex,halfIndex,adjustment:{multiplier:0.5,condition:'source-actor-bloodied',actor:fact.actor,quote}};
}
