import { explicitSourceSaves } from './save-evidence';
import { explicitMovementHoverEvidence } from './movement-evidence';
import type { MonsterIntakeIR, EvidenceRef } from './types';

/** Shared, browser-safe restoration of exact source facts. Callers own the cloned proposal. */
export function normalizeMonsterSourceFacts(ir:MonsterIntakeIR,source:string,scope:{start:number;end:number}):void{
  if(!ir.creature)return;
  const movement=ir.creature.attributes?.movement;
  if(movement&&typeof movement==='object'){
    const hover=explicitMovementHoverEvidence(source,ir.claims,scope);
    if(hover&&typeof movement.fly==='number')movement.hover=true;
    else delete movement.hover;
  }
  const facts=explicitSourceSaves(source,scope);
  if(ir.creature.saves&&typeof ir.creature.saves==='object'&&!Array.isArray(ir.creature.saves)){
    const evidence:EvidenceRef[]=[];
    for(const fact of facts){
      if(facts.some(other=>other.ability===fact.ability&&other.total!==fact.total))continue;
      if(fact.score!==undefined&&ir.creature.abilities?.[fact.ability]!==fact.score)continue;
      if(ir.creature.saves[fact.ability]===undefined)ir.creature.saves[fact.ability]=fact.total;
      evidence.push(fact.evidence);
    }
    if(evidence.length){
      if(!Array.isArray(ir.claims))ir.claims=[];
      const previous=ir.claims.find(claim=>claim.path==='/creature/saves'&&claim.valueKind==='explicit');
      if(previous){
        if(!Array.isArray(previous.evidence))previous.evidence=[];
        for(const ref of evidence)if(!previous.evidence.some(old=>old.start===ref.start&&old.end===ref.end&&old.quote===ref.quote))previous.evidence.push(ref);
      }else ir.claims.push({path:'/creature/saves',valueKind:'explicit',confidence:'high',evidence});
    }
  }
  for(const section of ['traits','actions','bonusActions','reactions','legendaryActions'] as const){
    for(const feature of Array.isArray(ir.creature[section])?ir.creature[section]:[]){
      const conditions=Array.isArray(feature?.appliedConditions)?feature.appliedConditions:[];
      if(conditions.length<2)continue;
      const evidence=(Array.isArray(feature.evidence)?feature.evidence:[]).filter(ref=>ref&&source.slice(ref.start,ref.end)===ref.quote).map(ref=>ref.quote).join('\n').replace(/\s+/gu,' ');
      for(const applied of conditions){
        const qualifier=typeof applied?.condition==='string'?applied.condition.replace(/\s+/gu,' '):'';
        const branch=/second failure|failure by \d+ or more|第二次失败|失败.{0,12}(?:至少|或更多)|若.{0,24}(?:已|已经).{0,24}则改为/iu;
        if(branch.test(qualifier)&&branch.test(evidence))applied.staged=true;
      }
    }
  }
}
