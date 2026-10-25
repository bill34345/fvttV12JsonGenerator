import type {SourceOperation} from '@fvtt-json-generator/models/source-operations';
import {createStableDocumentId} from './stableId';

/** schema-derived: dnd5e 5.3.3 Utility supports an arbitrary formula.
 * This explicitly labelled generic roll does not invoke native Attack hooks,
 * select weapon/spell classification, determine hits or apply critical damage. */
export function generateGmAttackActivities(op:SourceOperation,path:string,formatDamage:(part:any)=>any):Record<string,any>{
  if(!op.attack||!['melee','ranged'].includes(op.attack.type))throw Error('InvalidGmAttack');
  const result:Record<string,any>={},id=createStableDocumentId({kind:'activity',path:path+'/gm-attack-roll'});
  const dual=op.attack.reach!==undefined&&op.attack.range!==undefined;
  result[id]={_id:id,type:'utility',roll:{formula:'1d20'+(op.attack.toHit>=0?'+':'')+op.attack.toHit,name:'GM辅助攻击检定',prompt:true,visible:false},
    flags:{fvttJsonGenerator:{sourceOperation:{role:'attack-roll',...(dual?{attackMode:'melee'}:{})}}}};
  if(dual){
    const ranged=structuredClone(result[id]);
    ranged._id=createStableDocumentId({kind:'activity',path:path+'/gm-ranged-attack-roll'});
    ranged.flags.fvttJsonGenerator.sourceOperation.attackMode='ranged';
    result[ranged._id]=ranged;
  }
  if(op.damage?.length){
    const damageId=createStableDocumentId({kind:'activity',path:path+'/gm-hit-damage'});
    result[damageId]={_id:damageId,type:'damage',damage:{parts:op.damage.map(formatDamage)},
      flags:{fvttJsonGenerator:{sourceOperation:{role:'damage'}}}};
  }
  return result;
}

/** Schema-derived: Activity RangeField in dnd5e 5.3.3 has no long/reach.
 * Keep the selected distance native and the AI's long range in supported
 * special text. The complete structured distances also remain on the rule. */
export function sourceAttackActivityRange(attack:NonNullable<SourceOperation['attack']>,mode?:'melee'|'ranged'){
  return {override:true,units:'ft',value:mode==='melee'?attack.reach:attack.range??attack.reach??null,
    special:mode==='melee'?'':attack.longRange!==undefined?`远射程 ${attack.longRange} 尺`:''};
}
