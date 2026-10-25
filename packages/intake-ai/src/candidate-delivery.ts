import {sourceOperationStructureErrors} from '@fvtt-json-generator/models/source-operations';
import type {CanonicalFeature, IntakeFinding, MonsterIntakeIR} from './types';

const sections=['traits','actions','bonusActions','reactions','legendaryActions','mythicActions'] as const;
const finding=(code:string,path:string,message:string,evidence:IntakeFinding['evidence']=[]):IntakeFinding=>({
  id:`delivery:${code}:${path}`,code,path,message,evidence,blocking:true,origin:'semantic',
});

/** Delivery policy only: retain malformed structured data in review metadata
 * and the complete description in the candidate. Never reinterpret source content. */
export function prepareMonsterCandidateDelivery(original:MonsterIntakeIR,source:string,literal=false):{ir:MonsterIntakeIR;findings:IntakeFinding[]}{
  const ir=structuredClone(original),findings:IntakeFinding[]=[];
  for(const section of sections)ir.creature[section]=(ir.creature[section]??[]).map((feature,index)=>{
    const path=`/creature/${section}/${index}`;
    if(literal)return literalFeature(feature);
    if(!feature.sourceOperations)return feature;
    const shape=sourceOperationStructureErrors(feature.sourceOperations);
    if(!shape.length)return feature;
    const issue=finding('FEATURE_LITERAL_DELIVERY',path,
      `${feature.name}：这项动作的结构无法转换为活动，已保留完整动作文字；需要手动处理。`,feature.evidence);
    findings.push(issue);
    return literalFeature(feature);
  });
  if(literal){
    for(const group of ir.creature.spellcasting??[]){
      const section=group.activationType==='bonus'?'bonusActions':group.activationType==='reaction'?'reactions':group.activationType==='legendary'?'legendaryActions':'actions';
      ir.creature[section].push(literalFeature({name:group.featureName,description:group.description,activityType:'utility',
        activationType:group.activationType,evidence:group.evidence,legendaryCost:group.legendaryCost}));
    }
    delete ir.creature.spellcasting;
    delete ir.creature.sourceResourcePools;
    delete ir.creature.legendary;
    delete ir.creature.identity.sourceSize;
    ir.creature.biography=source;
    findings.push(finding('ACTOR_LITERAL_DELIVERY','/creature',
      '活动结构转换未完成。已生成保留基础数值、完整原文及各项动作文字的角色；动作和施法需要手动处理。'));
  }
  for(const issue of findings)if(!ir.uncertainties.some(prior=>prior.code===issue.code&&prior.path===issue.path)){
    ir.uncertainties.push({id:issue.id,code:issue.code,path:issue.path,message:issue.message,blocking:true,evidence:issue.evidence??[]});
  }
  return{ir,findings};
}

function literalFeature(feature:CanonicalFeature):CanonicalFeature{
  return{name:feature.name,...(feature.englishName?{englishName:feature.englishName}:{}),
    description:feature.description,activityType:'utility',executionMode:'gm-manual',
    ...(feature.activationType?{activationType:feature.activationType}:{}),
    ...(feature.sourceFeatureId?{sourceFeatureId:feature.sourceFeatureId}:{}),
    ...(feature.legendaryCost?{legendaryCost:feature.legendaryCost}:{}),evidence:feature.evidence};
}
