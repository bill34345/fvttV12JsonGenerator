import type {SourceOperation} from '@fvtt-json-generator/models/source-operations';
import {createStableDocumentId} from './stableId';

/** schema-derived: dnd5e 5.3.3 Utility supports an arbitrary formula.
 * This explicitly labelled generic roll does not invoke native Attack hooks,
 * select weapon/spell classification, determine hits or apply critical damage. */
export function generateGmAttackActivities(op:SourceOperation,path:string,formatDamage:(part:any)=>any):Record<string,any>{
  if(!op.attack||!['melee','ranged'].includes(op.attack.type))throw Error('InvalidGmAttack');
  const result:Record<string,any>={},id=createStableDocumentId({kind:'activity',path:path+'/gm-attack-roll'});
  result[id]={_id:id,type:'utility',roll:{formula:'1d20'+(op.attack.toHit>=0?'+':'')+op.attack.toHit,name:'GM辅助攻击检定',prompt:true,visible:false},
    flags:{fvttJsonGenerator:{sourceOperation:{role:'attack-roll'}}}};
  if(op.damage?.length){
    const damageId=createStableDocumentId({kind:'activity',path:path+'/gm-hit-damage'});
    result[damageId]={_id:damageId,type:'damage',damage:{parts:op.damage.map(formatDamage)},
      flags:{fvttJsonGenerator:{sourceOperation:{role:'damage'}}}};
  }
  return result;
}
