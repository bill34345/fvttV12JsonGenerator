import {hashSource} from '@fvtt-json-generator/forge-gateway-protocol';
import type {CanonicalSpellcastingGroup} from '@fvtt-json-generator/intake-ai/types';
import type {StagedMonsterSource,StagedSourceUnit} from '../../packages/intake-ai/src/staged-source';

/** Existing exact parent at the staged spell assembler boundary; this does not
 * certify whole-document line partitioning or rewrite the source. */
export function stagedSpellParentPlan(source:string,group:CanonicalSpellcastingGroup):StagedMonsterSource{
  const parent=group.evidence[0]!;
  if(source.slice(parent.start,parent.end)!==parent.quote)throw Error('Invalid recorded spell parent');
  const base:StagedSourceUnit={id:'base',destination:'base',start:0,end:parent.start,quote:source.slice(0,parent.start)};
  const name=[group.featureName,group.featureEnglishName].filter(Boolean).join(' ');
  const unit:StagedSourceUnit={...parent,id:'existing-spell-parent',destination:'feature',name,section:group.activationType??'trait'};
  return{version:1,source,sourceSha256:hashSource(source),candidate:{id:'existing-source',label:'Existing source',start:0,end:source.length,quote:source},base,units:[base,unit],features:[unit]};
}
