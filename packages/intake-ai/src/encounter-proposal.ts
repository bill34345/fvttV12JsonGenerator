import type { CanonicalFeature, MonsterIntakeIR } from './types';
import { renderMonsterFeatureName } from './renderer';
import { ENCOUNTER_CAPABILITY_KINDS, type EncounterCapabilitySelection } from './encounter-capabilities';

const SECTIONS = {trait:'traits',action:'actions',bonus:'bonusActions',reaction:'reactions',legendary:'legendaryActions'} as const;
type Section = keyof typeof SECTIONS;
interface ActorInput {key:string;source:string;ir:MonsterIntakeIR;artifact:unknown}
interface Binding {ref:string;actorKey:string;section:Section;feature:CanonicalFeature;quote?:string;itemName:string}
export interface EncounterProposalContext {
  payload:{source:string;actors:unknown[];configuredConditions:unknown[]};
  bindings:Binding[];
}

/** Input reduction only. The AI receives the complete source; citations locate
 * its feature choices without reparsing prose to certify their semantics. */
export function encounterProposalContext(request:{source:string;actors:ActorInput[]}, configuredConditions:unknown[]):EncounterProposalContext {
  const bindings:Binding[]=[];
  const actors=request.actors.map((actor,actorIndex)=>{
    const entries:Array<{section:Section;collection:string;index:number;feature:CanonicalFeature}>=Object.entries(SECTIONS).flatMap(([section,collection])=>actor.ir.creature[collection as typeof SECTIONS[Section]]
      .map((feature,index)=>({section:section as Section,collection,index,feature})));
    entries.push(...(actor.ir.creature.spellcasting??[]).map((entry,index)=>({section:'trait' as const,collection:'spellcasting',index,
      feature:{name:entry.featureName,englishName:entry.featureEnglishName,description:entry.description,evidence:entry.evidence,activityType:'utility' as const}})));
    const features=entries.map(({section,collection,index,feature})=>{
      const ref=`feature-${actorIndex+1}-${collection==='spellcasting'?'spellcasting':section}-${index+1}`;
      const itemName=renderMonsterFeatureName(feature);
      const path=`/creature/${collection}/${index}`;
      const references=[...(feature.evidence??[]),...actor.ir.claims.filter(claim=>claim.path===path).flatMap(claim=>claim.evidence)];
      const exactReferences=references.filter(e=>Number.isInteger(e.start)&&Number.isInteger(e.end)&&e.start>=0&&e.end>e.start&&e.end<=actor.source.length
        &&actor.source.slice(e.start,e.end)===e.quote&&e.quote.length<=8000)
        .sort((a,b)=>b.quote.length-a.quote.length||a.start-b.start);
      // Missing paragraph-shaped evidence cannot block a supported feature.
      // Its opaque reference is authoritative; the full source is in payload.
      const quote=exactReferences[0]?.quote??actor.source.slice(0,8000);
      bindings.push({ref,actorKey:actor.key,section:section as Section,feature,quote,itemName});
      const items=(actor.artifact as any)?.items;
      const carriers=Array.isArray(items)?items.filter((item:any)=>item.name===itemName):[];
      const item=carriers.length===1?carriers[0]:undefined;
      return {ref,name:feature.name,...(feature.englishName&&feature.englishName!==feature.name?{englishName:feature.englishName}:{}),section,
        sourceEvidenceAvailable:Boolean(quote),
        native:item?{itemName,type:item.type,uses:item.system?.uses,activities:Object.values(item.system?.activities??{})
          .filter((activity:any)=>!activity.flags?.fvttJsonGenerator?.behaviorOperation)
          .map((activity:any)=>({type:activity.type,activation:activity.activation,save:activity.save,attack:activity.attack,damage:activity.damage,
            range:activity.range,target:activity.target,consumption:activity.consumption})),
          statuses:[...new Set((item.effects??[]).flatMap((effect:any)=>effect.statuses??[]))]}:null};
    });
    return {key:actor.key,name:actor.ir.creature.identity.name,features,...(actor.ir.creature.legendary?{legendary:actor.ir.creature.legendary}:{})};
  });
  return {payload:{source:request.source,actors,configuredConditions},bindings};
}

export class EncounterProposalError extends TypeError {
  constructor(readonly code:string,readonly path:string,readonly expected:string){super(`Encounter proposal ${code} at ${path}: ${expected}`);}
}

/** Tool-generated identities and retained locators expand into the existing
 * selection contract. Existing v2 proposals use the same structural compiler;
 * an invalid v3 proposal never falls back to v2. */
export function expandEncounterProposal(value:unknown,context:EncounterProposalContext):unknown {
  if(value&&typeof value==='object'&&(value as any).version!==3)return value;
  const root=record(value,['version','rules','legendaryRecovery','unresolved'],'/');
  if(root.version!==3)throw new EncounterProposalError('INVALID_VERSION','/version','3');
  if(!Array.isArray(root.rules)||root.rules.length>80)throw new EncounterProposalError('INVALID_RULES','/rules','array with at most 80 rules');
  if(!Array.isArray(root.unresolved)||root.unresolved.length>80)throw new EncounterProposalError('INVALID_UNRESOLVED','/unresolved','array with at most 80 entries');
  if(root.unresolved.length)throw new EncounterProposalError('UNRESOLVED_SOURCE_RULE','/unresolved','all source rules must be resolved or remain in GM review');
  const seen=new Set<string>();
  const rules=root.rules.map((entry:unknown,index:number)=>{
    const path=`/rules/${index}`;
    const raw=record(entry,['featureRef','kind','parameters','gmSteps'],path,['sourceEvidence']);
    const binding=context.bindings.find(binding=>binding.ref===raw.featureRef);
    if(!binding||seen.has(binding.ref))throw new EncounterProposalError('INVALID_FEATURE_REF',`${path}/featureRef`,'one unique supplied feature reference');
    seen.add(binding.ref);
    if(!binding.quote)throw new EncounterProposalError('MISSING_SOURCE_EVIDENCE',`${path}/featureRef`,'a locator in the supplied source');
    if(!ENCOUNTER_CAPABILITY_KINDS.includes(raw.kind))throw new EncounterProposalError('INVALID_CAPABILITY',`${path}/kind`,'a supported fixed capability');
    const parameters={...recordObject(raw.parameters,`${path}/parameters`)};
    for(const field of ['followupRuleId','wardRuleId','breakRuleId'])if(parameters[field]!==undefined){
      const target=context.bindings.find(binding=>binding.ref===parameters[field]);
      if(!target||target.actorKey!==binding.actorKey)throw new EncounterProposalError('INVALID_RULE_REF',`${path}/parameters/${field}`,'a supplied feature of the same actor');
      parameters[field]=ruleId(target.ref);
    }
    if(raw.kind==='gm-activity-lock'&&Array.isArray(parameters.activityItemNames)){
      parameters.activityItemNames=parameters.activityItemNames.map((ref:unknown)=>{
        const target=context.bindings.find(candidate=>candidate.ref===ref&&candidate.actorKey===binding.actorKey);
        if(!target||target.actorKey!==binding.actorKey)throw new EncounterProposalError('INVALID_ACTIVITY_REF',`${path}/parameters/activityItemNames`,'same-actor feature references');
        return target.itemName;
      });
    }
    const gmSteps=Array.isArray(raw.gmSteps)?raw.gmSteps.map((step:unknown)=>{
      if(typeof step!=='string')return step;
      // Opaque references have no place in display prose. This changes only
      // presentation, not parameter references or executable identities.
      return step.replace(/(?<![A-Za-z0-9_-])feature-\d+-(?:trait|action|bonus|reaction|legendary|spellcasting)-\d+(?![A-Za-z0-9_-])/gu,ref=>{
        const target=context.bindings.find(binding=>binding.ref===ref);
        if(!target)throw new EncounterProposalError('INVALID_DISPLAY_REF',`${path}/gmSteps`,'supplied feature references in GM prose');
        return target.feature.name;
      });
    }):raw.gmSteps;
    return {id:ruleId(binding.ref),kind:raw.kind,actorKey:binding.actorKey,featureName:binding.feature.name,section:binding.section,
      quote:binding.quote,parameters,gmSteps,...(raw.sourceEvidence===undefined?{}:{sourceEvidence:raw.sourceEvidence})};
  });
  const actors=context.payload.actors as Array<{name:string}>;
  return {version:2,name:actors.length===1?`${actors[0]!.name} control`:'Encounter control',notes:'Use the native activities. The GM resolves manual consequences from each Item’s complete rule.',
    rules,legendaryRecovery:root.legendaryRecovery,manualSteps:rules.some((rule:any)=>rule.kind==='gm-manual')
      ?['GM resolves each complete manual rule from its bound Item; native activities remain usable and special consequences are not automatic.']:[]} satisfies EncounterCapabilitySelection;
}

/** Preserve a reviewed proposal for directed correction without resending
 * full quotes/identities. Both caller prior and the one internal correction
 * use the same inverse mapping for runtime references. */
export function compactEncounterSelection(selection:EncounterCapabilitySelection,context:EncounterProposalContext):unknown {
  const bindings=new Map(selection.rules.map(rule=>[rule.id,context.bindings.find(binding=>binding.actorKey===rule.actorKey
    &&binding.section===rule.section&&binding.feature.name===rule.featureName)]));
  const rules=selection.rules.map((rule,index)=>{
    const binding=bindings.get(rule.id);
    if(!binding)throw new EncounterProposalError('INVALID_PRIOR_REF',`/rules/${index}/featureRef`,'a current source feature');
    const parameters={...rule.parameters};
    for(const field of ['followupRuleId','wardRuleId','breakRuleId'])if(typeof parameters[field]==='string')parameters[field]=bindings.get(parameters[field])?.ref??parameters[field];
    if(rule.kind==='gm-activity-lock'&&Array.isArray(parameters.activityItemNames))parameters.activityItemNames=parameters.activityItemNames
      .map(name=>context.bindings.find(target=>target.actorKey===rule.actorKey&&target.itemName===name)?.ref??name);
    return {featureRef:binding.ref,kind:rule.kind,parameters,gmSteps:rule.gmSteps,...(rule.sourceEvidence?{sourceEvidence:rule.sourceEvidence}:{})};
  });
  return {version:3,rules,legendaryRecovery:selection.legendaryRecovery,unresolved:[]};
}

const ruleId=(ref:string)=>`rule-${ref}`;
function recordObject(value:unknown,path:string):Record<string,any>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))
    ||Object.values(Object.getOwnPropertyDescriptors(value)).some(descriptor=>descriptor.get||descriptor.set))throw new EncounterProposalError('INVALID_OBJECT',path,'plain JSON data');
  return value as Record<string,any>;
}
function record(value:unknown,keys:string[],path:string,optional:string[]=[]):Record<string,any>{
  const raw=recordObject(value,path);
  for(const key of keys)if(!Object.hasOwn(raw,key))throw new EncounterProposalError('MISSING_FIELD',`${path==='/'?'':path}/${key}`,'required field');
  if(Object.keys(raw).some(key=>!keys.includes(key)&&!optional.includes(key)))throw new EncounterProposalError('EXTRA_FIELD',path,'only the declared fields');
  return raw;
}
