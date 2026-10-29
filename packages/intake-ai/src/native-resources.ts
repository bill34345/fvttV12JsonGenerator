import type {CanonicalFeature,CanonicalMonster} from './types';

/** Source-derived: the standard resource identity plus an explicit count.
 * Neither the resource name nor its prose supplies a missing number. */
export function legendaryResistanceBinding(creature:CanonicalMonster):{feature:CanonicalFeature;max:number}|undefined {
  const named=creature.traits.filter(feature=>{
    const identity=feature.englishName??feature.name;
    return /^(?:Legendary Resistance|传奇抗性(?:\s+Legendary Resistance)?)(?:\s*[（(][^()（）]*[)）])?$/iu.test(identity);
  });
  const candidates=named.filter(feature=>!feature.attack&&!feature.save&&!feature.damage?.length&&!feature.healing&&!feature.recharge
    &&!feature.sourceOperations?.length&&!feature.appliedConditions?.length&&!feature.gmTriggeredSave&&!feature.nativeFailureStatuses?.length
    &&!feature.aoe&&!feature.sourceContext?.length&&(!feature.activityType||feature.activityType==='utility')
    &&!feature.candidateCounters?.length&&!feature.spellUseRecords?.length);
  const legacy=candidates.filter(feature=>feature.uses?.period==='day'&&Number.isSafeInteger(feature.uses.max)&&feature.uses.max>0);
  if(legacy.length>1)return;
  // Preserve the established eligible-use selection before considering the
  // stricter unique-name ledger fallback.
  const feature=legacy[0]??(named.length===1&&named[0]!.uses===undefined?candidates[0]:undefined);
  if(!feature)return;
  const explicit=creature.legendary?.resistanceMax;
  const max=feature.uses?feature.uses.max:explicit;
  if(!Number.isSafeInteger(max)||max===undefined||max<=0)return;
  if(explicit!==undefined&&explicit!==max)return;
  if(creature.sourceResourcePools?.some(pool=>pool.members.some(member=>member.collection==='traits'&&creature.traits[member.index]===feature)))return;
  return {feature,max};
}
