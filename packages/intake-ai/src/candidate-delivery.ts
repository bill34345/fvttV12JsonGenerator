import {candidateSourceOperationShapeErrors, sourceOperationErrors} from '@fvtt-json-generator/models/source-operations';
import type {CanonicalFeature, IntakeFinding, MonsterIntakeIR} from './types';
import {sectionHeading} from './staged-source';

const sections=['traits','actions','bonusActions','reactions','legendaryActions','mythicActions'] as const;
const finding=(code:string,path:string,message:string,evidence:IntakeFinding['evidence']=[]):IntakeFinding=>({
  id:`delivery:${code}:${path}`,code,path,message,evidence,blocking:true,origin:'semantic',
});

/** Delivery policy only: keep source checks in the result, not as a veto on
 * projection. Never repairs a model value or declares its source proof valid. */
export function prepareMonsterCandidateDelivery(original:MonsterIntakeIR,source:string,literal=false):{ir:MonsterIntakeIR;findings:IntakeFinding[]}{
  const ir=structuredClone(original),findings:IntakeFinding[]=[];
  for(const section of sections)ir.creature[section]=(ir.creature[section]??[]).map((feature,index)=>{
    const path=`/creature/${section}/${index}`;
    if(literal)return literalFeature(feature);
    if(!feature.sourceOperations)return feature;
    const errors=sourceOperationErrors(feature.description,feature.sourceOperations,feature.sourceContext);
    if(!errors.length)return feature;
    const shape=candidateSourceOperationShapeErrors(feature.sourceOperations);
    const issue=finding(shape.length?'FEATURE_LITERAL_DELIVERY':'SOURCE_OPERATION_REVIEW',path,
      shape.length?`${feature.name}：程序无法把这项动作转换为活动结构，已保留完整动作文字；需要手动处理。`
        :`${feature.name}：程序未能把攻击、伤害或引用与原文明确对应；仍按 AI 给出的字段生成，请核对。`,feature.evidence);
    findings.push(issue);
    return shape.length?literalFeature(feature):{...feature,candidateReview:{version:1,
      findings:[{code:issue.code,path,message:issue.message}],proposal:structuredClone(feature)}};
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
  for(const [index,entry]of ir.coverage.entries())if(entry.classification==='ignored-with-reason'&&entry.quote.trim()){
    // Format labels are already represented by their containing sections/table.
    // This is presentation grammar, not another natural-language rules parser.
    if(sectionHeading(entry.quote)||/^(?:MOD\s+SAVE\s*)+$/iu.test(entry.quote.trim()))continue;
    findings.push(finding('SOURCE_PART_NOT_PROJECTED',`/coverage/${index}`,
      `AI 未将这段来源录入对应字段：${entry.quote.trim()}。AI 给出的原因：${entry.reason??'未说明'}。`,[entry]));
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
