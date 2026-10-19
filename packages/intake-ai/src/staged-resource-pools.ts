import {sourceSharedUseDeclarations,sourceFeatureIdentity,sourceResourcePoolIdentity,sourceResourcePoolErrors,SOURCE_FEATURE_COLLECTIONS,type SourceResourcePool} from '@fvtt-json-generator/models/source-resource-pools';
import type {MonsterIntakeIR} from './types';
import {StagedExtractionError,type StagedMonsterSource} from './staged-source';

export interface StagedSharedUsesProposal {members:string[];max:number;period:'day'|'longRest'|'shortRest'|'dawn';cost:1;quote:string}
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const visible=(value:string)=>value.normalize('NFKC').replace(/[*_]/gu,'').replace(/\s+/gu,' ').trim();

/** Finite proposal adapter into the existing native fixed-consumption model.
 * All IDs, member paths, evidence offsets and carrier identity are program-owned. */
export function assembleStagedResourcePools(plan:StagedMonsterSource,ir:MonsterIntakeIR,values:readonly unknown[]):void{
  const pools=new Map<string,SourceResourcePool>();
  for(const[index,value]of values.entries()){
    const proposal=object(value)&&object(value.facts)?value.facts.sharedUses:undefined;if(proposal===undefined)continue;
    const fail=(field:string):never=>{throw new StagedExtractionError('UNSUPPORTED_SHARED_RESOURCE',`/features/${plan.features[index]?.id}/sharedUses/${field}`);};
    if(!object(proposal)||Object.keys(proposal).some(key=>!['members','max','period','cost','quote'].includes(key))||!Array.isArray(proposal.members)||proposal.members.length<2||new Set(proposal.members).size!==proposal.members.length||!Number.isSafeInteger(proposal.max)||proposal.max<1||!['day','longRest','shortRest','dawn'].includes(proposal.period)||proposal.cost!==1||typeof proposal.quote!=='string')fail('shape');
    const owner=plan.features[index]!,contexts=(owner.contextIds??[]).map(id=>plan.units.find(unit=>unit.id===id)!);
    const matches=[owner,...contexts].flatMap(unit=>sourceSharedUseDeclarations(unit.quote).filter(quote=>visible(quote)===visible(proposal.quote)).map(quote=>({unit,quote})));
    if(matches.length!==1)fail('source-declaration');
    const match=matches[0]!,start=match.unit.start+match.unit.quote.indexOf(match.quote),declaration={start,end:start+match.quote.length,quote:match.quote};
    const members:SourceResourcePool['members']=[],evidence=[declaration];
    for(const unitId of proposal.members){
      const unit=plan.features.find(feature=>feature.id===unitId);if(!unit)fail('member-id');
      const found=SOURCE_FEATURE_COLLECTIONS.flatMap(collection=>(ir.creature[collection]??[]).flatMap((feature,index)=>feature.evidence?.[0]?.start===unit!.start&&feature.evidence[0].end===unit!.end?[{collection,index,feature}]:[]));
      if(found.length!==1)fail('member-identity');
      const entry=found[0]!,proof=entry.feature.evidence![0]!;
      const featureId=sourceFeatureIdentity(ir.source.sha256,proof);entry.feature.sourceFeatureId=featureId;
      members.push({collection:entry.collection,index:entry.index,featureId,cost:1});evidence.push(proof);
    }
    members.sort((a,b)=>ir.creature[a.collection]![a.index]!.evidence![0]!.start-ir.creature[b.collection]![b.index]!.evidence![0]!.start);
    const id=sourceResourcePoolIdentity(ir.source.sha256,members.map(member=>member.featureId));
    const previous=pools.get(id);
    if(previous&&(previous.max!==proposal.max||previous.period!==proposal.period))fail('conflicting-pool');
    const refs=[...(previous?.evidence??[]),...evidence],unique=[...new Map(refs.map(ref=>[ref.start+':'+ref.end,ref])).values()];
    pools.set(id,{id,name:members.map(member=>ir.creature[member.collection]![member.index]!.name).join(' / ')+' shared uses',max:proposal.max,period:proposal.period,members,evidence:unique});
  }
  if(pools.size)ir.creature.sourceResourcePools=[...pools.values()];
  const errors=sourceResourcePoolErrors(plan.source,ir.creature,ir.source.sha256,plan.candidate);
  if(errors.length)throw new StagedExtractionError('UNRESTORED_SHARED_RESOURCE',`/creature/sourceResourcePools/${errors.join(',')}`);
  for(const[index,pool]of(ir.creature.sourceResourcePools??[]).entries()){
    const path=`/creature/sourceResourcePools/${index}`;
    ir.claims.push({path,valueKind:'preserved-literal',confidence:'high',evidence:pool.evidence});
    for(const coverage of ir.coverage)if(pool.evidence.some(ref=>coverage.start<=ref.start&&coverage.end>=ref.end))coverage.claimPaths.push(path);
  }
}
