import {sourceDamageUpgradeOperations,sourceOperationErrors,materializeSourceOperationEvidence} from '@fvtt-json-generator/models/source-operations';
import {completeSourceFeatureEvidence} from './source-completeness';
import {splitStagedMonsterSource} from './staged-source';
import type {MonsterIntakeIR,CanonicalFeature} from './types';

const sections=['traits','actions','bonusActions','reactions','legendaryActions','mythicActions']as const;
const stable=(value:unknown):string=>JSON.stringify(value,(_key,entry)=>entry&&typeof entry==='object'&&!Array.isArray(entry)?Object.fromEntries(Object.entries(entry).sort(([a],[b])=>a.localeCompare(b))):entry);
const parentRuleText=(quote:string)=>quote.replace(/^\s*(?:#{1,6}\s*)?(?:traits?|actions?|bonus actions?|reactions?|legendary actions?|mythic actions?)\s*\r?\n\s*/iu,'').trim();
/** Independent source inventory: a conflicting/missing model description
 * cannot make an explicitly supported upgrade disappear from validation. */
export function sourceDamageUpgradeRelations(source:string,ir:MonsterIntakeIR,range={start:0,end:source.length}){
  if(!source.includes('The extra damage of your '))return[];
  try{
    const plan=splitStagedMonsterSource({source,sourceSha256:ir.source.sha256,candidate:{id:'fixed-damage-upgrade',label:'Source-owned upgrade',...range,quote:source.slice(range.start,range.end)}});
    return plan.features.flatMap(unit=>{
      const peers=plan.features.filter(peer=>peer!==unit),ops=sourceDamageUpgradeOperations(unit.quote,peers.map(peer=>peer.quote));
      if(!ops)return[];
      return[{unit,context:peers.find(peer=>peer.quote===ops[0]!.proof.upgrade!.sourceText)!}];
    });
  }catch{return[];}
}
export function sourceDamageUpgradeExpectations(source:string,ir:MonsterIntakeIR,range={start:0,end:source.length}){
  if(!source.includes('The extra damage of your ')||!ir.creature||!Array.isArray(ir.claims)||!Array.isArray(ir.coverage))return[];
  const entries=sections.flatMap(section=>(Array.isArray(ir.creature[section])?ir.creature[section]!:[]).map((feature,index)=>{
    const path=`/creature/${section}/${index}`;return{feature,path,parent:completeSourceFeatureEvidence(source,ir,feature,path,range)};
  })).filter(entry=>entry.parent&&typeof entry.feature?.description==='string');
  return entries.flatMap(entry=>{
    const peers=entries.filter(peer=>peer!==entry),ops=sourceDamageUpgradeOperations(parentRuleText(entry.parent!.quote),peers.map(peer=>peer.parent!.quote));
    if(!ops)return[];
    const context=peers.find(peer=>peer.parent!.quote===ops[0]!.proof.upgrade!.sourceText)!;
    return[{...entry,context,ops}];
  });
}

/** Only independently complete parents with an explicit named amount upgrade
 * may join. Conflicting explicit mechanics and unknown fields stay visible. */
export function bindSourceDamageUpgrades(source:string,ir:MonsterIntakeIR,range={start:0,end:source.length}):void{
  for(const {feature,path,parent,context,ops}of sourceDamageUpgradeExpectations(source,ir,range)){
    // Restoration cannot turn an explicitly conflicting carrier into a
    // passing proposal. Preserve it for the existing independent validator.
    if(feature.activityType!==undefined&&feature.activityType!=='utility'
      ||feature.executionMode!==undefined&&!['gm-manual','native-with-gm'].includes(feature.executionMode)
      ||feature.sourceOperations!==undefined&&feature.executionMode!=='native-with-gm'
      ||(['nativeRuleText','manualRemainder']as const).some(key=>feature[key]!==undefined&&feature[key]!==feature.description))continue;
    if(feature.sourceOperations){
      if(feature.description!==ops[0]!.sourceText)continue;
      if(feature.sourceOperations.some(op=>op.proof?.upgrade))continue;
      if(sourceOperationErrors(feature.description,feature.sourceOperations).length||feature.sourceOperations.length!==1)continue;
      const candidate=structuredClone(feature.sourceOperations[0]!),expected=structuredClone(ops[0]!);
      expected.damage![0]!.formula=candidate.damage?.[0]?.formula??'';delete expected.proof.upgrade;
      const mechanics=(op:typeof candidate)=>{const {id,name,evidence,...rest}=op;return rest;};
      if(stable(mechanics(candidate))!==stable(mechanics(expected)))continue;
    }else if(['attack','save','damage','healing','range','aoe','appliedConditions','gmTriggeredSave'].some(key=>Object.hasOwn(feature,key)))continue;
    // A model may put the exact title in name and the complete body in
    // description. Restore only the already independently proven parent.
    feature.description=ops[0]!.sourceText;
    feature.sourceContext=[...new Set([...(feature.sourceContext??[]),context.parent!.quote])];
    feature.sourceOperations=materializeSourceOperationEvidence(feature.description,ops,parent!.start+parent!.quote.indexOf(feature.description)) as CanonicalFeature['sourceOperations'];
    feature.executionMode='native-with-gm';feature.activityType='utility';feature.nativeRuleText=feature.description;feature.manualRemainder=feature.description;
    const contextPath=path+'/sourceContext',ref=context.parent!;
    if(!ir.claims.some(claim=>claim.path===contextPath))ir.claims.push({path:contextPath,valueKind:'preserved-literal',confidence:'high',evidence:[ref]});
    for(const coverage of ir.coverage)if(coverage.start===ref.start&&coverage.end===ref.end&&!coverage.claimPaths.includes(contextPath))coverage.claimPaths.push(contextPath);
  }
}
