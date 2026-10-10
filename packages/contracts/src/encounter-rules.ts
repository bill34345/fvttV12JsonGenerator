export interface EncounterRuleMarker { mode:'staged'|'manual';section:string;featureIndex:number;paths:string[];statuses:string[] }
const SECTIONS:Record<string,{carrier:string;source:string}>={
  trait:{carrier:'特性',source:'traits'},action:{carrier:'动作',source:'actions'},bonus:{carrier:'附赠动作',source:'bonusActions'},
  reaction:{carrier:'反应',source:'reactions'},legendary:{carrier:'传奇动作',source:'legendaryActions'},
};

/** Browser-safe identity check shared by generation, source verification and package preparation. */
export function readEncounterRuleMarker(item:any,mechanic:any):EncounterRuleMarker|undefined{
  const match=/^encounter-(staged|manual)-(trait|action|bonus|reaction|legendary)-(\d+)$/u.exec(String(mechanic?.id??''));
  if(!match)return undefined;
  const mode=match[1] as 'staged'|'manual';
  const expected=SECTIONS[match[2]!];
  const featureIndex=Number(match[3])-1;
  const prefix=`encounter-${mode}`;
  const conditions:string[]=Array.isArray(mechanic?.conditions)?mechanic.conditions.filter((value:unknown)=>typeof value==='string'):[];
  const paths=conditions.filter(value=>value.startsWith(`${prefix}:/creature/`));
  const coverage=conditions.filter(value=>value.startsWith(`${prefix}-coverage:`));
  const itemSection=item?.section??item?.flags?.['tidy5e-sheet']?.section??item?.flags?.['tidy5e-sheet']?.actionSection;
  // The native Item builder uses this exact Tidy section label for legendary actions.
  const section=itemSection==='Legendary Actions'?'传奇动作':itemSection;
  if(featureIndex<0||!expected||mechanic.kind!=='lifecycle'||mechanic.coverage!=='literal'||mechanic.executionMode!=='gm-assisted'
    ||mechanic.ruleSource!=='source-derived'||mechanic.carrier?.section!==expected.carrier||mechanic.carrier?.name!==item?.name
    ||section!==expected.carrier||paths.length===0||new Set(paths).size!==paths.length
    ||!paths.every(path=>new RegExp(`^${prefix}:/creature/${expected.source}/${featureIndex}/appliedConditions/(?:0|[1-9]\\d*)$`).test(path))
    ||coverage.length!==1||coverage[0]!==`${prefix}-coverage:actor.${expected.source}`
    ||!Array.isArray(mechanic.gmSteps)||mechanic.gmSteps.length<2
    ||!mechanic.gmSteps.every((step:unknown)=>typeof step==='string'&&step.trim().length>0))return undefined;
  const statuses=conditions.flatMap(value=>{
    const status=new RegExp(`^${prefix}-status:([a-z0-9.-]+)$`,'u').exec(value)?.[1];
    return status?[status]:[];
  });
  return {mode,section:expected.source,featureIndex,paths,statuses};
}
