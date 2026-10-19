import {sha256} from '@fvtt-json-generator/contracts/hash';
import type {CanonicalMonster,CanonicalFeature} from './canonicalMonster';
import type {EvidenceRef} from '@fvtt-json-generator/contracts/evidence';
import type {SourceResourcePool,SourceFeatureCollection} from './sourceOperationTypes';
import {sourceOperationClauses,SOURCE_NEGATION_TOKEN} from './sourceOperationScopes';
import {sourceFeatureResources} from './sourceOperations';
export type {SourceResourcePool,SourceFeatureCollection} from './sourceOperationTypes';

export const SOURCE_FEATURE_COLLECTIONS:SourceFeatureCollection[]=['traits','actions','bonusActions','reactions','legendaryActions','mythicActions'];
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const visible=(value:string)=>value.normalize('NFKC').replace(/[*_]/gu,'').replace(/\s+/gu,' ').trim();
export function sourceSharedUseDeclarations(source:string):string[]{
  return sourceOperationClauses(source).filter(clause=>{
    const text=visible(clause);
    const predicate=/\bshar(?:e|es|ed)\b|共享|共用/iu.exec(text);if(!predicate)return false;
    const before=text.slice(0,predicate.index),after=text.slice(predicate.index+predicate[0].length);
    return /\b(?:uses?|charges?)\b|次数|使用|充能/iu.test(after)&&!new RegExp(`(?:${SOURCE_NEGATION_TOKEN}|不(?:会)?|不能|无法|并非)\\s*$`,'iu').test(before)&&!/^\s*(?:no\b|none\b|zero\b|没有|零)/iu.test(after);
  });
}
function shareQuantity(quote:string):{count?:number;period?:SourceResourcePool['period'];unresolved:boolean}{
  const text=visible(quote),predicate=/\bshar(?:e|es|ed)\b|共享|共用/iu.exec(text);if(!predicate)return{unresolved:true};
  const tail=text.slice(predicate.index+predicate[0].length),words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
  const match=/^\s*(?:(?:these|the same|their|a pool of|a total of)\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+(?:daily|shared|per-day|short-rest|long-rest))*\s+(?:uses?|charges?)\b|^\s*(?:这|同一组|同一个)?\s*(\d+|[一二三四五六七八九十])\s*(?:次|个)?(?:使用|充能|次数)/iu.exec(tail);
  const quantity=match?.[1]??match?.[2],count=quantity===undefined?undefined:words[quantity.toLowerCase()]??Number(quantity);
  const period=/dawn|黎明|破晓/iu.test(tail)?'dawn':/short[- ]rest|短休/iu.test(tail)?'shortRest':/long[- ]rest|长休/iu.test(tail)?'longRest':/daily|per[- ]day|each day|每日|每天/iu.test(tail)?'day':undefined;
  return{count,period,unresolved:!match&&/\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b|[一二三四五六七八九十]/iu.test(tail)};
}
export function sourceFeatureIdentity(sourceHash:string,evidence:EvidenceRef):string{return sha256(`${sourceHash}:${evidence.start}:${evidence.end}`).slice(0,16);}
export function sourceResourcePoolIdentity(sourceHash:string,ids:string[]):string{return'pool-'+sha256(sourceHash+':'+[...ids].sort().join(':')).slice(0,16);}
function baseName(feature:CanonicalFeature):string{return visible(feature.name).replace(/\s*[（(][^）)]*(?:day|rest|日|天|休|充能|recharge)[^）)]*[）)]/giu,'').trim();}
function mentions(quote:string,name:string):boolean{
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  return new RegExp((/^[A-Za-z0-9]/u.test(name)?'(?<![A-Za-z0-9])':'')+escaped+(/[A-Za-z0-9]$/u.test(name)?'(?![A-Za-z0-9])':''),'iu').test(visible(quote));
}

/** Validate the finite bridge only: explicit members, one fixed cost, exact
 * maxima/recovery and source identities. No arbitrary paths or executors. */
export function sourceResourcePoolErrors(source:string,creature:CanonicalMonster,sourceHash:string,range:{start:number;end:number}={start:0,end:source.length}):string[]{
  const errors:string[]=[],pools=creature.sourceResourcePools??[],used=new Set<string>();
  if(!Array.isArray(pools))return['pools'];
  const features=SOURCE_FEATURE_COLLECTIONS.flatMap(collection=>(creature[collection]??[]).map((feature,index)=>({collection,index,feature})));
  for(const[poolIndex,pool]of pools.entries()){
    const fail=(field:string)=>errors.push(`${poolIndex}/${field}`);
    if(!object(pool)||Object.keys(pool).some(key=>!['id','name','max','period','members','evidence'].includes(key))||!Array.isArray(pool.members)||pool.members.length<2||!Array.isArray(pool.evidence)){fail('shape');continue;}
    if(typeof pool.name!=='string'||!pool.name.trim()||!Number.isSafeInteger(pool.max)||pool.max<1||!['day','longRest','shortRest','dawn'].includes(pool.period)){fail('counter');continue;}
    const refs=pool.evidence.filter(ref=>object(ref)&&Number.isSafeInteger(ref.start)&&Number.isSafeInteger(ref.end)&&ref.start>=range.start&&ref.end>ref.start&&ref.end<=range.end&&source.slice(ref.start,ref.end)===ref.quote);
    const declarations=refs.flatMap(ref=>sourceSharedUseDeclarations(ref.quote));
    if(refs.length!==pool.evidence.length||!declarations.length)fail('evidence');
    const actualMembers:CanonicalFeature[]=[];
    for(const member of pool.members){
      if(!object(member)||Object.keys(member).some(key=>!['collection','index','featureId','cost'].includes(key))||!SOURCE_FEATURE_COLLECTIONS.includes(member.collection)||!Number.isSafeInteger(member.index)||member.cost!==1){fail('member');continue;}
      const feature=(creature[member.collection as SourceFeatureCollection]??[])[member.index],proof=feature?.evidence?.[0];
      if(!feature||!proof||feature.sourceFeatureId!==member.featureId||member.featureId!==sourceFeatureIdentity(sourceHash,proof)||used.has(member.featureId)){fail('identity');continue;}
      used.add(member.featureId);actualMembers.push(feature);
      const resource=sourceFeatureResources(feature.name,feature.description,creature.identity.name).uses;
      if(!resource||resource.max!==pool.max||resource.period!==pool.period||feature.uses?.max!==pool.max||feature.uses.period!==pool.period||feature.recharge)fail('member-counter');
      for(const clause of sourceOperationClauses(feature.description))if(/\b(?:uses?|charges?)\b|次数|充能/iu.test(clause)&&/\bcosts?\b|\bspends?\b|\bconsumes?\b|消耗|花费/iu.test(clause)&&(!/legendary (?:action|resistance)|传奇(?:动作|抗性)/iu.test(clause)||/this (?:shared )?pool|共享池|此池/iu.test(clause))){
        const remaining=visible(clause).replace(/\b(?:costs?|spends?|consumes?)\s+(?:one|1)\s+(?:use|charge)\b|(?:消耗|花费)\s*1\s*(?:次|点)(?:使用|充能|次数)?/giu,'');
        if(/\bcosts?\b|\bspends?\b|\bconsumes?\b|消耗|花费/iu.test(remaining))fail('unsupported-member-cost');
      }
      if(!refs.some(ref=>ref.start===proof.start&&ref.end===proof.end&&ref.quote===proof.quote))fail('member-evidence');
    }
    if(pool.id!==sourceResourcePoolIdentity(sourceHash,pool.members.map(member=>member.featureId)))fail('id');
    const names=actualMembers.map(baseName);
    if(names.some(name=>!name||features.filter(entry=>baseName(entry.feature)===name).length!==1)||!declarations.some(quote=>{
      const declared=features.filter(({feature})=>mentions(quote,baseName(feature)));
      return declared.length===actualMembers.length&&declared.every(({feature})=>actualMembers.includes(feature));
    }))fail('source-members');
    for(const quote of declarations){
      const quantity=shareQuantity(quote);
      if(quantity.unresolved||quantity.count!==undefined&&quantity.count!==pool.max)fail('source-count');
      if(quantity.period!==undefined&&quantity.period!==pool.period)fail('source-period');
    }
  }
  // Explicit sharing must never quietly multiply the source's total uses.
  for(const quote of sourceSharedUseDeclarations(source.slice(range.start,range.end))){
    const spellGroups=creature.spellcasting?.filter(group=>group.description.includes(quote)&&group.evidence.some(ref=>source.slice(ref.start,ref.end)===ref.quote&&ref.quote.includes(quote)))??[];
    if(spellGroups.length&&!features.some(({feature})=>feature.description.includes(quote))){
      const quantity=shareQuantity(quote),grants=spellGroups.flatMap(group=>group.usageGroups.filter(usage=>usage.usage==='daily-shared'));
      const grant=grants[0],count=grant&&'count'in grant?grant.count:undefined;
      if(quantity.unresolved||grants.length!==1||quantity.count!==undefined&&quantity.count!==count||quantity.period!==undefined&&quantity.period!=='day')errors.push('spell-shared-declaration-conflict');
      continue;
    }
    if(!pools.some(pool=>pool.evidence?.some(ref=>ref.quote.includes(quote))))errors.push('unrestored-shared-pool');
  }
  return errors;
}
